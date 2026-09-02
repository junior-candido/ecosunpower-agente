// eva-digest.ts
// Digest periodico de atividade da assistente, POR EMPRESA.
// Dispara 3x/dia: 7h, 12h40 e 21h BRT. Cobre:
//   - Leads novos no periodo
//   - Leads silentes >24h sem resposta
//   - Cadencia enviada (toques)
//   - Conversas qualificadas
//
// ⚖️ VAZAMENTO LGPD (02/09/2026). O digest das 7h chegou no zap do Junior com
// leads da Conquista Solar misturados aos da EcoSunPower. Mesmo vazamento de
// 31/08 por outro caminho: a trava do tenant-admin-guard pergunta "de qual
// empresa e esta mensagem?" — mas o digest nasce de um RELOGIO, nao de uma
// mensagem. Sem contexto, empresa() devolve a EcoSun e a trava libera.
//
// O furo estava na LEITURA, que nunca separou as empresas. Agora:
//   1. collectDigestData exige companyId e filtra TODA consulta;
//   2. maybeRunDigest roda um laco por empresa;
//   3. cada empresa recebe no numero DELA (destinoDoDigest);
//   4. a chave de idempotencia leva a empresa (senao uma consome o disparo
//      da outra).
//
// Idempotente: usa app_flags pra garantir 1 disparo por janela POR EMPRESA.

import type { SupabaseClient } from '@supabase/supabase-js';
import { formatPhoneBR } from './meta-leadgen.js';
import { sendAdminWithButtons, type AdminButtonCtx } from './eva-admin-buttons.js';
import { empresaDe, comEmpresaDe, type EmpresaConfig } from './empresa-config.js';
import { comCanal } from './canal-contexto.js';
import { ECOSUN_COMPANY_ID } from './tenant-resolver.js';
import { podeDispararMensagens } from './dashboard/permissions.js';

const DIGEST_WINDOWS = [
  { hour: 7, minute: 0, label: 'manha' },
  { hour: 12, minute: 40, label: 'almoco' },
  { hour: 21, minute: 0, label: 'noite' },
];

const DIGEST_FLAG_KEY_PREFIX = 'eva_digest_';

export interface DigestData {
  leadsNovos: Array<{ id: string; name: string | null; phone: string; created_at: string; acquisition_source: string | null }>;
  leadsSilentes: Array<{ id: string; name: string | null; phone: string; updated_at: string }>;
  cadenciaEnviadaHoje: number;
  cadenciaRespondidaHoje: Array<{ name: string | null; phone: string }>;
  leadsQualificadosHoje: Array<{ name: string | null; phone: string }>;
  agendadosHoje: Array<{ name: string | null; phone: string }>;
  totalConversasHoje: number;
}

export interface DigestOpts {
  /** Nome da assistente da empresa (Eva, Clara...). Vem da config, nao do codigo. */
  nomeAtendente: string;
  /**
   * A empresa consegue disparar cadencia sozinha? Hoje so a EcoSun — os demais
   * precisam de WhatsApp Oficial da Meta (mandar em massa por conexao
   * nao-oficial derruba o numero). Quem NAO consegue recebe a isca do upgrade.
   */
  podeCadenciarSozinha: boolean;
}

/**
 * Pra onde vai o digest desta empresa.
 *
 * - EcoSunPower → o telefone do Junior (`engineerPhone`), como sempre foi.
 * - Tenant      → a PRÓPRIA linha da assistente. A equipe vive nesse aparelho.
 * - Tenant sem telefone cadastrado → `null`, nao manda pra ninguem.
 *
 * Por que aqui pode o que o `tenant-admin-guard` proibe: sao coisas diferentes.
 * Aviso de LEAD pro zap do dono da EcoSun continua proibido (vazamento entre
 * controladores). O que se libera e a empresa falar CONSIGO MESMA — o dado nao
 * sai do controlador dela.
 */
export function destinoDoDigest(cfg: EmpresaConfig, engineerPhone: string): string | null {
  if (cfg.companyId === ECOSUN_COMPANY_ID) return engineerPhone;
  return cfg.telefoneAtendente || null;
}

/**
 * Chave da trava anti-disparo-repetido. A empresa entra na chave: sem isso a
 * primeira empresa do laco "gasta" o disparo da janela e as outras ficam mudas.
 */
export function chaveDigest(dataBrt: string, label: string, companyId: string): string {
  return `${DIGEST_FLAG_KEY_PREFIX}${dataBrt}_${label}_${companyId}`;
}

/**
 * Coleta dados do periodo pra montar o digest DESTA empresa.
 * - Pra digest da manha (7h): cobre 21h-7h (10h)
 * - Pra digest almoco (12h40): cobre 7h-12h40 (5h40)
 * - Pra digest noite (21h): cobre 12h40-21h (8h20)
 *
 * `companyId` e obrigatorio de proposito: era a falta dele que vazava.
 */
export async function collectDigestData(
  client: SupabaseClient,
  hoursBack: number,
  companyId: string,
): Promise<DigestData> {
  const since = new Date(Date.now() - hoursBack * 60 * 60_000).toISOString();
  const today0h = new Date();
  today0h.setUTCHours(3, 0, 0, 0); // 0h BRT = 3h UTC
  const todayBrtIso = today0h.toISOString();

  // 1. Leads novos no periodo
  const { data: novos } = await client
    .from('leads')
    .select('id, name, phone, created_at, acquisition_source')
    .eq('company_id', companyId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(50);

  // 2. Leads silentes: status novo/qualificando, eva_active, ja existem ha >24h,
  // sem mensagem do cliente nas ultimas 24h. Aqui usamos updated_at como proxy.
  const silenceCutoff = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const { data: silentes } = await client
    .from('leads')
    .select('id, name, phone, updated_at')
    .eq('company_id', companyId)
    .eq('eva_active', true)
    .eq('opt_out', false)
    .in('status', ['novo', 'qualificando', 'qualificado'])
    .lt('updated_at', silenceCutoff)
    .order('updated_at', { ascending: false })
    .limit(20);

  // 3. Cadencia enviada hoje (count)
  const { count: cadHoje } = await client
    .from('eva_cadence')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('status', 'sent')
    .gte('sent_at', todayBrtIso);

  // 4. Cadencia respondida hoje: cadence sent + status do lead mudou hoje
  // Heuristica: cancelled_reason='client_replied' nas ultimas 24h
  const { data: cadRespondida } = await client
    .from('eva_cadence')
    .select('lead_id, leads!inner(name, phone)')
    .eq('company_id', companyId)
    .eq('status', 'cancelled')
    .eq('cancelled_reason', 'client_replied')
    .gte('updated_at', todayBrtIso)
    .limit(10);

  // 5. Leads que viraram qualificando hoje (proxy: updated_at hoje + status qualificando)
  const { data: qualificados } = await client
    .from('leads')
    .select('name, phone')
    .eq('company_id', companyId)
    .eq('status', 'qualificando')
    .gte('updated_at', todayBrtIso)
    .limit(10);

  // 6. Agendados hoje
  const { data: agendados } = await client
    .from('leads')
    .select('name, phone')
    .eq('company_id', companyId)
    .eq('status', 'agendado')
    .gte('updated_at', todayBrtIso)
    .limit(10);

  // 7. Total conversas hoje (mensagens recebidas)
  const { count: totalConvHoje } = await client
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .gte('last_message_at', todayBrtIso);

  return {
    leadsNovos: novos ?? [],
    leadsSilentes: silentes ?? [],
    cadenciaEnviadaHoje: cadHoje ?? 0,
    cadenciaRespondidaHoje: (cadRespondida ?? []).map((r: any) => ({
      name: r.leads?.name ?? null,
      phone: r.leads?.phone ?? '',
    })),
    leadsQualificadosHoje: qualificados ?? [],
    agendadosHoje: agendados ?? [],
    totalConversasHoje: totalConvHoje ?? 0,
  };
}

function formatPhoneShort(phone: string): string {
  // Normaliza (wa_id BR vem sem o 9o digito) antes de formatar. Ver formatPhoneBR.
  return formatPhoneBR(phone);
}

/**
 * Monta o texto do digest a partir dos dados coletados.
 *
 * Funcao PURA: nome da assistente e regra da isca entram por `opts`, nao por
 * `empresa()`. Assim da pra testar as duas empresas sem contexto global.
 */
export function buildDigestMessage(label: string, data: DigestData, opts: DigestOpts): string {
  const lines: string[] = [];
  const hora = label === 'manha' ? '7h' : label === 'almoco' ? '12h40' : '21h';
  lines.push(`📊 *${opts.nomeAtendente} — Digest ${hora}*`);
  lines.push('');

  // Novos
  if (data.leadsNovos.length > 0) {
    lines.push(`🆕 *Novos no período (${data.leadsNovos.length}):*`);
    for (const l of data.leadsNovos.slice(0, 8)) {
      const tag = l.acquisition_source?.includes('campanha') || l.acquisition_source === 'meta_ads'
        ? ' ⭐ campanha'
        : '';
      lines.push(`• ${l.name ?? 'Sem nome'} — ${formatPhoneShort(l.phone)}${tag}`);
    }
    if (data.leadsNovos.length > 8) lines.push(`  ...+${data.leadsNovos.length - 8} outros`);
    lines.push('');
  }

  // Silentes
  if (data.leadsSilentes.length > 0) {
    const n = data.leadsSilentes.length;
    lines.push(`⚠️ *Esperando há mais de 24h (${n}):*`);
    for (const l of data.leadsSilentes.slice(0, 5)) {
      lines.push(`• ${l.name ?? 'Sem nome'} — ${formatPhoneShort(l.phone)}`);
    }
    if (n > 5) lines.push(`  ...+${n - 5} outros`);

    if (opts.podeCadenciarSozinha) {
      lines.push(`${opts.nomeAtendente} já agendou cadência. Você pode acelerar com /eva on.`);
    } else {
      // A isca do upgrade. So aparece quando ha fila — com a fila vazia vira
      // propaganda e a dona para de ler.
      lines.push('');
      lines.push(`💤 Esses ${n} esfriam se ninguém chamar hoje.`);
      lines.push('   Eu consigo chamar um por um, no dia certo, sem ninguém');
      lines.push('   digitar — mas só pelo WhatsApp Oficial da Meta.');
      lines.push('   Está no seu painel, em "Ativar WhatsApp Oficial".');
    }
    lines.push('');
  }

  // Qualificados / Agendados
  if (data.leadsQualificadosHoje.length > 0) {
    lines.push(`✅ *Qualificados hoje (${data.leadsQualificadosHoje.length}):*`);
    for (const l of data.leadsQualificadosHoje.slice(0, 5)) {
      lines.push(`• ${l.name ?? 'Sem nome'} — ${formatPhoneShort(l.phone)}`);
    }
    lines.push('');
  }

  if (data.agendadosHoje.length > 0) {
    lines.push(`📅 *Agendados hoje (${data.agendadosHoje.length}):*`);
    for (const l of data.agendadosHoje.slice(0, 5)) {
      lines.push(`• ${l.name ?? 'Sem nome'} — ${formatPhoneShort(l.phone)}`);
    }
    lines.push('');
  }

  // Cadência respondida (sinal quente)
  if (data.cadenciaRespondidaHoje.length > 0) {
    lines.push(`🔥 *Cadência respondida (${data.cadenciaRespondidaHoje.length}):*`);
    for (const l of data.cadenciaRespondidaHoje.slice(0, 5)) {
      lines.push(`• ${l.name ?? 'Sem nome'} — ${formatPhoneShort(l.phone)}`);
    }
    lines.push('');
  }

  // Métricas curtas no final
  lines.push(`📈 Conversas hoje: ${data.totalConversasHoje}`);
  lines.push(`📤 Toques de cadência hoje: ${data.cadenciaEnviadaHoje}`);

  return lines.join('\n');
}

/** Empresas que devem receber digest: a EcoSun sempre + as ativas do banco. */
async function empresasDoDigest(client: SupabaseClient): Promise<string[]> {
  const ids = new Set<string>([ECOSUN_COMPANY_ID]);
  try {
    const { data, error } = await client.from('companies').select('id').eq('ativo', true);
    if (error) {
      console.warn(`[digest] não consegui listar empresas (${error.message}) — só EcoSun neste ciclo`);
      return [...ids];
    }
    for (const row of (data ?? []) as Array<{ id?: string }>) {
      if (row.id) ids.add(row.id);
    }
  } catch (err) {
    console.warn(`[digest] falha ao listar empresas: ${(err as Error).message} — só EcoSun neste ciclo`);
  }
  return [...ids];
}

/** Roda o digest de UMA empresa. Devolve true se mandou. */
async function rodarDigestDaEmpresa(
  client: SupabaseClient,
  companyId: string,
  window: { label: string; hour: number; minute: number },
  hoursBack: number,
  hojeBrt: string,
  engineerPhone: string,
  sendText: (to: string, text: string) => Promise<void>,
  metaWaba: AdminButtonCtx['metaWaba'],
  instanciaDaEmpresa: (companyId: string) => Promise<string | undefined>,
): Promise<boolean> {
  const cfg = empresaDe(companyId);
  const destino = destinoDoDigest(cfg, engineerPhone);
  if (!destino) {
    // Falha fechado: empresa sem telefone cadastrado nao manda pra ninguem.
    return false;
  }

  // Idempotencia POR EMPRESA.
  const flagKey = chaveDigest(hojeBrt, window.label, companyId);
  const { data: flag } = await client
    .from('app_flags')
    .select('value')
    .eq('key', flagKey)
    .maybeSingle();
  if (flag?.value === 'sent') return false;

  const data = await collectDigestData(client, hoursBack, companyId);

  // Nada aconteceu no periodo: nao enche o zap de ninguem com digest vazio.
  const vazio =
    data.leadsNovos.length === 0 &&
    data.leadsSilentes.length === 0 &&
    data.leadsQualificadosHoje.length === 0 &&
    data.agendadosHoje.length === 0 &&
    data.cadenciaRespondidaHoje.length === 0 &&
    data.totalConversasHoje === 0;
  if (vazio) {
    await client.from('app_flags').upsert({ key: flagKey, value: 'sent' }, { onConflict: 'key' });
    return false;
  }

  const podeCadenciarSozinha = podeDispararMensagens(companyId);
  const text = buildDigestMessage(window.label, data, {
    nomeAtendente: cfg.nomeAtendente,
    podeCadenciarSozinha,
  });

  // Botoes so pra quem consegue clicar. No chat consigo mesmo (tenant mandando
  // pro proprio numero) botao nao funciona — e responder ali cai no fromMe,
  // que o sistema le como "humano assumiu" e cala a assistente.
  const buttons: Array<{ id: string; title: string }> = [];
  if (podeCadenciarSozinha) {
    buttons.push({ id: 'evabt:dash-leads', title: '📊 Ver leads' });
    if (data.leadsSilentes.length > 0) {
      buttons.push({ id: 'evabt:cad-force', title: '📤 Cadenciar' });
    }
    if (data.leadsSilentes.length > 0 || data.cadenciaRespondidaHoje.length > 0) {
      buttons.push({ id: 'evabt:dash-alerts', title: '🚨 Só alertas' });
    }
  }

  // O envio roda dentro do contexto da empresa (pra trava de marca e o
  // envioProibido enxergarem quem esta falando) E do canal dela (pra sair pela
  // instancia Evolution do tenant, nunca pelo numero da EcoSun).
  const evolutionInstance = await instanciaDaEmpresa(companyId).catch(() => undefined);
  await comEmpresaDe(companyId, () =>
    comCanal({ companyId, evolutionInstance }, async () => {
      if (buttons.length > 0) {
        await sendAdminWithButtons({ metaWaba, sendText }, destino, text, buttons.slice(0, 3));
      } else {
        await sendText(destino, text);
      }
    }),
  );

  await client.from('app_flags').upsert({ key: flagKey, value: 'sent' }, { onConflict: 'key' });
  console.log(
    `[digest] enviado: empresa=${companyId} window=${window.label} novos=${data.leadsNovos.length} silentes=${data.leadsSilentes.length}`,
  );
  return true;
}

/**
 * Verifica se eh hora de disparar o digest e, se sim, roda UMA VEZ POR EMPRESA.
 * Idempotente por empresa (usa app_flags como lock diario).
 */
export async function maybeRunDigest(
  client: SupabaseClient,
  engineerPhone: string,
  sendText: (to: string, text: string) => Promise<void>,
  metaWaba: AdminButtonCtx['metaWaba'] = null,
  instanciaDaEmpresa: (companyId: string) => Promise<string | undefined> = async () => undefined,
): Promise<{ sent: boolean; window?: string; empresas?: number }> {
  const now = new Date();
  const brtHour = (now.getUTCHours() - 3 + 24) % 24;
  const brtMinute = now.getUTCMinutes();

  // Encontra a janela vigente (com 15 min de tolerancia apos o horario alvo
  // pra absorver timing do cron de 5-15 min).
  const window = DIGEST_WINDOWS.find((w) => {
    if (brtHour !== w.hour) return false;
    return brtMinute >= w.minute && brtMinute < w.minute + 15;
  });
  if (!window) return { sent: false };

  const hojeBrt = new Date(now.getTime() - 3 * 60 * 60_000).toISOString().slice(0, 10);
  const hoursBack = window.label === 'manha' ? 10 : window.label === 'almoco' ? 6 : 9;

  const empresas = await empresasDoDigest(client);
  let enviados = 0;

  for (const companyId of empresas) {
    try {
      const mandou = await rodarDigestDaEmpresa(
        client, companyId, window, hoursBack, hojeBrt,
        engineerPhone, sendText, metaWaba, instanciaDaEmpresa,
      );
      if (mandou) enviados++;
    } catch (err) {
      // Uma empresa quebrada nao pode derrubar o digest das outras.
      console.error(`[digest] empresa ${companyId} falhou na janela ${window.label}:`, (err as Error).message);
    }
  }

  return { sent: enviados > 0, window: window.label, empresas: enviados };
}
