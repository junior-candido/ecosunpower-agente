// eva-digest.ts
// Digest periodico de atividade da Eva pro WhatsApp do Junior.
// Dispara 3x/dia: 7h, 12h40 e 21h BRT. Cobre:
//   - Leads novos no periodo
//   - Leads silentes >24h sem resposta
//   - Cadencia enviada (toques)
//   - Conversas qualificadas
//   - Erros (se houver)
//
// Idempotente: usa app_flags pra garantir 1 disparo por janela.

import type { SupabaseClient } from '@supabase/supabase-js';
import { formatPhoneBR } from './meta-leadgen.js';
import { sendAdminWithButtons, type AdminButtonCtx } from './eva-admin-buttons.js';
import { empresa } from './empresa-config.js';

const DIGEST_WINDOWS = [
  { hour: 7, minute: 0, label: 'manha' },
  { hour: 12, minute: 40, label: 'almoco' },
  { hour: 21, minute: 0, label: 'noite' },
];

const DIGEST_FLAG_KEY_PREFIX = 'eva_digest_';

interface DigestData {
  leadsNovos: Array<{ id: string; name: string | null; phone: string; created_at: string; acquisition_source: string | null }>;
  leadsSilentes: Array<{ id: string; name: string | null; phone: string; updated_at: string }>;
  cadenciaEnviadaHoje: number;
  cadenciaRespondidaHoje: Array<{ name: string | null; phone: string }>;
  leadsQualificadosHoje: Array<{ name: string | null; phone: string }>;
  agendadosHoje: Array<{ name: string | null; phone: string }>;
  totalConversasHoje: number;
}

/**
 * Coleta dados do periodo pra montar o digest.
 * - Pra digest da manha (7h): cobre 21h-7h (10h)
 * - Pra digest almoco (12h40): cobre 7h-12h40 (5h40)
 * - Pra digest noite (21h): cobre 12h40-21h (8h20)
 *
 * Numero de horas voltadas: passado como parametro.
 */
async function collectDigestData(
  client: SupabaseClient,
  hoursBack: number,
): Promise<DigestData> {
  const since = new Date(Date.now() - hoursBack * 60 * 60_000).toISOString();
  const today0h = new Date();
  today0h.setUTCHours(3, 0, 0, 0); // 0h BRT = 3h UTC
  const todayBrtIso = today0h.toISOString();

  // 1. Leads novos no periodo
  const { data: novos } = await client
    .from('leads')
    .select('id, name, phone, created_at, acquisition_source')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(50);

  // 2. Leads silentes: status novo/qualificando, eva_active, ja existem ha >24h,
  // sem mensagem do cliente nas ultimas 24h. Aqui usamos updated_at como proxy.
  const silenceCutoff = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const { data: silentes } = await client
    .from('leads')
    .select('id, name, phone, updated_at')
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
    .eq('status', 'sent')
    .gte('sent_at', todayBrtIso);

  // 4. Cadencia respondida hoje: cadence sent + status do lead mudou hoje
  // Heuristica: cancelled_reason='client_replied' nas ultimas 24h
  const { data: cadRespondida } = await client
    .from('eva_cadence')
    .select('lead_id, leads!inner(name, phone)')
    .eq('status', 'cancelled')
    .eq('cancelled_reason', 'client_replied')
    .gte('updated_at', todayBrtIso)
    .limit(10);

  // 5. Leads que viraram qualificando hoje (proxy: updated_at hoje + status qualificando)
  const { data: qualificados } = await client
    .from('leads')
    .select('name, phone')
    .eq('status', 'qualificando')
    .gte('updated_at', todayBrtIso)
    .limit(10);

  // 6. Agendados hoje
  const { data: agendados } = await client
    .from('leads')
    .select('name, phone')
    .eq('status', 'agendado')
    .gte('updated_at', todayBrtIso)
    .limit(10);

  // 7. Total conversas hoje (mensagens recebidas)
  const { count: totalConvHoje } = await client
    .from('conversations')
    .select('id', { count: 'exact', head: true })
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
 */
function buildDigestMessage(label: string, data: DigestData): string {
  const lines: string[] = [];
  const hora = label === 'manha' ? '7h' : label === 'almoco' ? '12h40' : '21h';
  lines.push(`📊 *${empresa().nomeAtendente} — Digest ${hora}*`);
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
    lines.push(`⚠️ *Silentes 24h+ (${data.leadsSilentes.length}):*`);
    for (const l of data.leadsSilentes.slice(0, 5)) {
      lines.push(`• ${l.name ?? 'Sem nome'} — ${formatPhoneShort(l.phone)}`);
    }
    if (data.leadsSilentes.length > 5) lines.push(`  ...+${data.leadsSilentes.length - 5} outros`);
    lines.push(`${empresa().nomeAtendente} já agendou cadência. Você pode acelerar com /eva on.`);
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

/**
 * Verifica se eh hora de disparar o digest e, se sim, monta + envia + grava flag.
 * Idempotente: nao dispara 2x na mesma janela (usa app_flags como lock diario).
 */
export async function maybeRunDigest(
  client: SupabaseClient,
  engineerPhone: string,
  sendText: (to: string, text: string) => Promise<void>,
  metaWaba: AdminButtonCtx['metaWaba'] = null,
): Promise<{ sent: boolean; window?: string }> {
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

  // Idempotencia diaria: flag eh datada (YYYY-MM-DD-label).
  const today = new Date(now.getTime() - 3 * 60 * 60_000).toISOString().slice(0, 10); // BRT date
  const flagKey = `${DIGEST_FLAG_KEY_PREFIX}${today}_${window.label}`;
  const { data: flag } = await client
    .from('app_flags')
    .select('value')
    .eq('key', flagKey)
    .maybeSingle();
  if (flag?.value === 'sent') return { sent: false, window: window.label };

  // Janela em horas pra coletar dados (cobre o periodo entre o digest anterior e agora)
  const hoursBack = window.label === 'manha' ? 10 : window.label === 'almoco' ? 6 : 9;

  try {
    const data = await collectDigestData(client, hoursBack);
    const text = buildDigestMessage(window.label, data);

    // Monta botoes (max 3). "Ver leads" sempre; "Cadenciar silentes" so quando
    // ha silentes; "Ver alertas" como atalho pra filtro do dashboard.
    const buttons: Array<{ id: string; title: string }> = [
      { id: 'evabt:dash-leads', title: '📊 Ver leads' },
    ];
    if (data.leadsSilentes.length > 0) {
      buttons.push({ id: 'evabt:cad-force', title: '📤 Cadenciar' });
    }
    if (data.leadsSilentes.length > 0 || data.cadenciaRespondidaHoje.length > 0) {
      buttons.push({ id: 'evabt:dash-alerts', title: '🚨 Só alertas' });
    }

    await sendAdminWithButtons({ metaWaba, sendText }, engineerPhone, text, buttons.slice(0, 3));

    // Grava flag pra nao reenviar
    await client.from('app_flags').upsert({ key: flagKey, value: 'sent' }, { onConflict: 'key' });
    console.log(`[digest] enviado: window=${window.label} novos=${data.leadsNovos.length} silentes=${data.leadsSilentes.length}`);
    return { sent: true, window: window.label };
  } catch (err) {
    console.error(`[digest] falhou na janela ${window.label}:`, (err as Error).message);
    return { sent: false, window: window.label };
  }
}
