// src/modules/monitoring/abordagem/abordagens-repo.ts
// I/O fino do diário de abordagens + treino + config (migration 048).
// Padrão do projeto (financeiro/lancamentos-repo.ts): throw com prefixo do
// nome, COLS explícito, maybeSingle, CAS via filtro de status + .select('id').
// TODO UPDATE seta updated_at — a tabela NÃO tem trigger.
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AbordagemRow, AbordagemTipo, AbordagemStatus, ConfigAutonomia, DiarioUsina,
} from './tipos.js';

const COLS = 'id, sistema_id, lead_id, alerta_id, tipo, etapa, status, desfecho, causa_raiz, mensagem_proposta, mensagem_enviada, resposta_resumo, nota_junior, nota_observacao, reagendada_para, enviada_em, lembrete_em, ultima_resposta_cliente_em, encerrada_em, created_at, updated_at';

const agoraIso = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// CRUD básico
// ---------------------------------------------------------------------------

export async function criarProposta(client: SupabaseClient, a: {
  sistemaId: string; leadId: string; alertaId: string | null;
  tipo: AbordagemTipo; mensagemProposta: string;
}): Promise<string | null> {
  // INSERT com status 'proposta'. Violação do unique parcial (já existe aberta
  // na usina — corrida entre ciclos) NÃO é erro: retorna null e o chamador
  // desiste em silêncio.
  const { data, error } = await client.from('monitoring_abordagens').insert({
    sistema_id: a.sistemaId, lead_id: a.leadId, alerta_id: a.alertaId,
    tipo: a.tipo, mensagem_proposta: a.mensagemProposta, status: 'proposta',
  }).select('id').single();
  if (error) {
    if (error.code === '23505') return null;
    throw new Error(`criarProposta: ${error.message}`);
  }
  return (data as { id: string }).id;
}

export async function getAbordagem(client: SupabaseClient, id: string): Promise<AbordagemRow | null> {
  const { data, error } = await client.from('monitoring_abordagens')
    .select(COLS).eq('id', id).maybeSingle();
  if (error) throw new Error(`getAbordagem: ${error.message}`);
  return (data as unknown as AbordagemRow) ?? null;
}

// Transição de status com CAS na lista de status atuais (clique duplo do
// Junior em [Pode mandar]: só o 1º casa — o 2º recebe false e não reenvia).
export async function mudarStatusAbordagem(
  client: SupabaseClient, id: string, de: AbordagemStatus[], para: AbordagemStatus,
  patch: Record<string, unknown> = {},
): Promise<boolean> {
  const { data, error } = await client.from('monitoring_abordagens')
    .update({ ...patch, status: para, updated_at: agoraIso() })
    .eq('id', id).in('status', de).select('id');
  if (error) throw new Error(`mudarStatusAbordagem: ${error.message}`);
  return Boolean(data && data.length > 0);
}

// Patch genérico sem mudança de status (nota do Junior, resumo, reagendamento).
export async function atualizarAbordagem(
  client: SupabaseClient, id: string, patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await client.from('monitoring_abordagens')
    .update({ ...patch, updated_at: agoraIso() })
    .eq('id', id);
  if (error) throw new Error(`atualizarAbordagem: ${error.message}`);
}

// Compensação: o CAS pra 'enviada' vem ANTES do envio (porteiro anti-duplicata);
// se o envio falhar DEPOIS, esta reversão devolve pra 'proposta' — nunca fica
// "enviada" fantasma. Best-effort (console.warn): falhar a compensação não pode
// derrubar o tratamento do erro original.
export async function reverterEnvioParaProposta(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from('monitoring_abordagens')
    .update({ status: 'proposta', enviada_em: null, mensagem_enviada: null, updated_at: agoraIso() })
    .eq('id', id).eq('status', 'enviada');
  if (error) console.warn('[abordagem] reverterEnvioParaProposta falhou:', error.message);
}

// Abordagem "viva" do lead (pro index injetar contexto quando o cliente fala).
export async function getAbordagemAbertaPorLeadPhone(client: SupabaseClient, leadId: string): Promise<AbordagemRow | null> {
  const { data, error } = await client.from('monitoring_abordagens')
    .select(COLS)
    .eq('lead_id', leadId)
    .in('status', ['enviada', 'em_conversa', 'lembrete_enviado'])
    .order('created_at', { ascending: false })
    .limit(1).maybeSingle();
  if (error) throw new Error(`getAbordagemAbertaPorLeadPhone: ${error.message}`);
  return (data as unknown as AbordagemRow) ?? null;
}

// ---------------------------------------------------------------------------
// Diário consolidado de UMA usina (alimenta as regras puras)
// ---------------------------------------------------------------------------

// `tipo` = tipo da abordagem CANDIDATA: o descarte do Junior só bloqueia o
// MESMO tipo (descartou queda ≠ bloquear offline). Parabéns e depoimento são a
// mesma família (milestone) e compartilham o descarte — isso também resolve o
// ovo-e-galinha do milestone, cujo tipo final só é decidido DEPOIS de ler o diário.
export async function getDiarioUsina(
  client: SupabaseClient, sistemaId: string, leadId: string, tipo: AbordagemTipo,
): Promise<DiarioUsina> {
  const tiposDescarte = (tipo === 'parabens' || tipo === 'depoimento')
    ? ['parabens', 'depoimento'] : [tipo];

  const [aberta, parabens, ofertaLimpeza, descarte, causa, depoimento, proativaEnviada, proativaLembrete] =
    await Promise.all([
      // abordagem aberta na usina (status <> encerrada)
      client.from('monitoring_abordagens').select('id')
        .eq('sistema_id', sistemaId).neq('status', 'encerrada')
        .limit(1).maybeSingle(),
      // último parabéns/depoimento ENVIADO da usina
      client.from('monitoring_abordagens').select('enviada_em')
        .eq('sistema_id', sistemaId).in('tipo', ['parabens', 'depoimento'])
        .not('enviada_em', 'is', null)
        .order('enviada_em', { ascending: false }).limit(1).maybeSingle(),
      // última oferta de limpeza (queda que chegou no degrau 2+)
      client.from('monitoring_abordagens').select('updated_at')
        .eq('sistema_id', sistemaId).eq('tipo', 'queda').gte('etapa', 2)
        .order('updated_at', { ascending: false }).limit(1).maybeSingle(),
      // último descarte do Junior DO MESMO TIPO (família, pro milestone)
      client.from('monitoring_abordagens').select('encerrada_em')
        .eq('sistema_id', sistemaId).eq('desfecho', 'descartada_junior')
        .in('tipo', tiposDescarte).not('encerrada_em', 'is', null)
        .order('encerrada_em', { ascending: false }).limit(1).maybeSingle(),
      // causa raiz da última offline encerrada com causa registrada
      client.from('monitoring_abordagens').select('causa_raiz')
        .eq('sistema_id', sistemaId).eq('tipo', 'offline').eq('status', 'encerrada')
        .not('causa_raiz', 'is', null)
        .order('encerrada_em', { ascending: false, nullsFirst: false })
        .limit(1).maybeSingle(),
      // já teve depoimento ENVIADO nesta usina?
      client.from('monitoring_abordagens').select('id')
        .eq('sistema_id', sistemaId).eq('tipo', 'depoimento')
        .not('enviada_em', 'is', null)
        .limit(1).maybeSingle(),
      // última proativa ao LEAD (qualquer usina dele): max(enviada_em)…
      client.from('monitoring_abordagens').select('enviada_em')
        .eq('lead_id', leadId).not('enviada_em', 'is', null)
        .order('enviada_em', { ascending: false }).limit(1).maybeSingle(),
      // …e max(lembrete_em) — lembrete também é proativa (1 msg/dia por lead)
      client.from('monitoring_abordagens').select('lembrete_em')
        .eq('lead_id', leadId).not('lembrete_em', 'is', null)
        .order('lembrete_em', { ascending: false }).limit(1).maybeSingle(),
    ]);

  for (const r of [aberta, parabens, ofertaLimpeza, descarte, causa, depoimento, proativaEnviada, proativaLembrete]) {
    if (r.error) throw new Error(`getDiarioUsina: ${r.error.message}`);
  }

  const envIso = (proativaEnviada.data as { enviada_em: string } | null)?.enviada_em ?? null;
  const lemIso = (proativaLembrete.data as { lembrete_em: string } | null)?.lembrete_em ?? null;
  const ultimaProativa = [envIso, lemIso].filter((x): x is string => x !== null).sort().pop() ?? null;

  return {
    abordagemAbertaId: (aberta.data as { id: string } | null)?.id ?? null,
    ultimoParabensEnviadoEm: (parabens.data as { enviada_em: string } | null)?.enviada_em ?? null,
    ultimaOfertaLimpezaEm: (ofertaLimpeza.data as { updated_at: string } | null)?.updated_at ?? null,
    descartadaMesmoTipoEm: (descarte.data as { encerrada_em: string } | null)?.encerrada_em ?? null,
    causaRaizAnterior: (causa.data as { causa_raiz: string } | null)?.causa_raiz ?? null,
    jaTeveDepoimento: Boolean(depoimento.data),
    ultimaMsgProativaAoLeadEm: ultimaProativa,
  };
}

// ---------------------------------------------------------------------------
// Pendências pro cron (15min)
// ---------------------------------------------------------------------------

function cutoffIso(agoraIso_: string, dias: number): string {
  return new Date(new Date(agoraIso_).getTime() - dias * 24 * 60 * 60 * 1000).toISOString();
}

// Enviadas há >= limiteDias sem NENHUMA resposta do cliente → lembrete.
// Reagendadas pro futuro ficam de fora (o cliente pediu pra esperar).
export async function getAbordagensParaLembrete(
  client: SupabaseClient, agoraIso_: string, limiteDias: number,
): Promise<AbordagemRow[]> {
  const corte = cutoffIso(agoraIso_, limiteDias);
  const { data, error } = await client.from('monitoring_abordagens')
    .select(COLS)
    .in('status', ['enviada', 'em_conversa'])
    .is('ultima_resposta_cliente_em', null)
    .lte('enviada_em', corte)
    .or(`reagendada_para.is.null,reagendada_para.lte.${agoraIso_}`)
    .order('enviada_em', { ascending: true })
    .limit(20);
  if (error) throw new Error(`getAbordagensParaLembrete: ${error.message}`);
  return (data ?? []) as unknown as AbordagemRow[];
}

// Lembrete enviado há >= limiteDias e o cliente seguiu calado → encerrar.
export async function getAbordagensParaEncerrar(
  client: SupabaseClient, agoraIso_: string, limiteDias: number,
): Promise<AbordagemRow[]> {
  const corte = cutoffIso(agoraIso_, limiteDias);
  const { data, error } = await client.from('monitoring_abordagens')
    .select(COLS)
    .eq('status', 'lembrete_enviado')
    .lte('lembrete_em', corte)
    .order('lembrete_em', { ascending: true })
    .limit(20);
  if (error) throw new Error(`getAbordagensParaEncerrar: ${error.message}`);
  return (data ?? []) as unknown as AbordagemRow[];
}

// Cliente pediu "agora não" → na hora devida o cron manda a mensagem combinada.
export async function getAbordagensReagendadasDevidas(
  client: SupabaseClient, agoraIso_: string,
): Promise<AbordagemRow[]> {
  const { data, error } = await client.from('monitoring_abordagens')
    .select(COLS)
    .eq('status', 'em_conversa')
    .not('reagendada_para', 'is', null)
    .lte('reagendada_para', agoraIso_)
    .order('reagendada_para', { ascending: true })
    .limit(20);
  if (error) throw new Error(`getAbordagensReagendadasDevidas: ${error.message}`);
  return (data ?? []) as unknown as AbordagemRow[];
}

// Porteiro do reagendamento: limpa reagendada_para com CAS (só quem ainda tem
// agendamento casa) — dois ciclos concorrentes não mandam a combinada 2×.
export async function limparReagendamento(client: SupabaseClient, id: string): Promise<boolean> {
  const { data, error } = await client.from('monitoring_abordagens')
    .update({ reagendada_para: null, updated_at: agoraIso() })
    .eq('id', id).not('reagendada_para', 'is', null).select('id');
  if (error) throw new Error(`limparReagendamento: ${error.message}`);
  return Boolean(data && data.length > 0);
}

// Vassoura: abordagens presas em estados intermediários (falha transitória,
// Junior não clicou, conversa esfriou). Sem isso, o unique parcial bloqueia a
// usina pra sempre em silêncio.
// status IN ('proposta','aguardando_aprovacao') AND updated_at < antesDe
export async function getPresasEmProposta(
  client: SupabaseClient, antesDeIso: string,
): Promise<AbordagemRow[]> {
  const { data, error } = await client.from('monitoring_abordagens')
    .select(COLS)
    .in('status', ['proposta', 'aguardando_aprovacao'])
    .lt('updated_at', antesDeIso)
    .order('updated_at', { ascending: true })
    .limit(20);
  if (error) throw new Error(`getPresasEmProposta: ${error.message}`);
  return (data ?? []) as unknown as AbordagemRow[];
}

// Conversa que esfriou: cliente RESPONDEU (por isso o lembrete nunca pega —
// ele exige ultima_resposta_cliente_em NULL) e ninguém encerrou. Reagendadas
// pro futuro ficam de fora (o cliente pediu pra esperar).
export async function getConversasEsfriadas(
  client: SupabaseClient, antesDeIso: string,
): Promise<AbordagemRow[]> {
  const { data, error } = await client.from('monitoring_abordagens')
    .select(COLS)
    .eq('status', 'em_conversa')
    .not('ultima_resposta_cliente_em', 'is', null)
    .lt('ultima_resposta_cliente_em', antesDeIso)
    .or(`reagendada_para.is.null,reagendada_para.lt.${antesDeIso}`)
    .order('ultima_resposta_cliente_em', { ascending: true })
    .limit(20);
  if (error) throw new Error(`getConversasEsfriadas: ${error.message}`);
  return (data ?? []) as unknown as AbordagemRow[];
}

// CAS do lembrete: além do status, exige que o cliente NÃO tenha respondido
// (a janela entre o fetch e o envio inclui uma chamada de LLM — segundos).
export async function marcarLembreteSeSemResposta(
  client: SupabaseClient, id: string, lembreteEmIso: string, etapa: number,
): Promise<boolean> {
  const { data, error } = await client.from('monitoring_abordagens')
    .update({ status: 'lembrete_enviado', lembrete_em: lembreteEmIso, etapa, updated_at: agoraIso() })
    .eq('id', id)
    .in('status', ['enviada', 'em_conversa'])
    .is('ultima_resposta_cliente_em', null)
    .select('id');
  if (error) throw new Error(`marcarLembreteSeSemResposta: ${error.message}`);
  return Boolean(data && data.length > 0);
}

// Porteiro da escada pós-template: troca o marcador '[template enviado]' pela
// mensagem real com CAS no próprio marcador — 2 webhooks rápidos do mesmo
// cliente → só 1 casa o WHERE e manda a escada. null = não era pós-template
// (ou outro webhook já consumiu).
export async function consumirMarcadorTemplate(
  client: SupabaseClient, id: string,
): Promise<string | null> {
  // PostgREST não faz UPDATE coluna-a-coluna: lê a proposta primeiro; o CAS no
  // marcador (WHERE mensagem_enviada = '[template enviado]') é quem garante 1×.
  const { data: row, error: e1 } = await client.from('monitoring_abordagens')
    .select('mensagem_proposta').eq('id', id).maybeSingle();
  if (e1) throw new Error(`consumirMarcadorTemplate: ${e1.message}`);
  const msg = (row as { mensagem_proposta: string | null } | null)?.mensagem_proposta ?? null;
  if (!msg) return null;
  const { data, error } = await client.from('monitoring_abordagens')
    .update({ mensagem_enviada: msg, updated_at: agoraIso() })
    .eq('id', id).eq('mensagem_enviada', '[template enviado]')
    .select('mensagem_proposta');
  if (error) throw new Error(`consumirMarcadorTemplate: ${error.message}`);
  return data && data.length > 0 ? msg : null;
}

// Quedas encerradas por limpeza na janela [de..ate] (10-20 dias atrás) —
// follow-up pós-limpeza. O chamador filtra as já marcadas '[followup feito]'.
export async function getQuedasEncerradasPorLimpeza(
  client: SupabaseClient, deIso: string, ateIso: string,
): Promise<AbordagemRow[]> {
  const { data, error } = await client.from('monitoring_abordagens')
    .select(COLS)
    .eq('tipo', 'queda').eq('status', 'encerrada')
    .ilike('causa_raiz', '%limp%')
    .gte('encerrada_em', deIso).lte('encerrada_em', ateIso)
    .order('encerrada_em', { ascending: true })
    .limit(20);
  if (error) throw new Error(`getQuedasEncerradasPorLimpeza: ${error.message}`);
  return (data ?? []) as unknown as AbordagemRow[];
}

// ---------------------------------------------------------------------------
// Estado pendente do treino (texto do Junior após [Ajustar] / [👎 Errou])
// ---------------------------------------------------------------------------

// Janela de 1h (mesmo padrão de getPendenteAguardando do financeiro): só pra
// ENGOLIR a resposta de texto do admin — marcador velho não captura conversa
// alheia pra sempre.
const TTL_RESPOSTA_ADMIN_MS = 60 * 60 * 1000;

export async function getAbordagemAjustando(client: SupabaseClient): Promise<AbordagemRow | null> {
  const desde = new Date(Date.now() - TTL_RESPOSTA_ADMIN_MS).toISOString();
  const { data, error } = await client.from('monitoring_abordagens')
    .select(COLS)
    .eq('status', 'aguardando_aprovacao')
    .eq('nota_observacao', '[ajustando]')
    .gte('updated_at', desde)
    .order('updated_at', { ascending: false })
    .limit(1).maybeSingle();
  if (error) throw new Error(`getAbordagemAjustando: ${error.message}`);
  return (data as unknown as AbordagemRow) ?? null;
}

export async function getAbordagemErrouPendente(client: SupabaseClient): Promise<AbordagemRow | null> {
  const desde = new Date(Date.now() - TTL_RESPOSTA_ADMIN_MS).toISOString();
  const { data, error } = await client.from('monitoring_abordagens')
    .select(COLS)
    .eq('nota_junior', 'errou')
    .is('nota_observacao', null)
    .gte('updated_at', desde)
    .order('updated_at', { ascending: false })
    .limit(1).maybeSingle();
  if (error) throw new Error(`getAbordagemErrouPendente: ${error.message}`);
  return (data as unknown as AbordagemRow) ?? null;
}

// Últimas N encerradas de um tipo (sugestão de autonomia: 5 seguidas limpas).
// Família milestone: parabéns/depoimento dividem a MESMA flag de autonomia
// (parabens_auto), então a contagem das "5 limpas" olha a família inteira.
export async function getUltimasEncerradasDoTipo(
  client: SupabaseClient, tipo: AbordagemTipo, n: number,
): Promise<AbordagemRow[]> {
  const tipos = (tipo === 'parabens' || tipo === 'depoimento')
    ? ['parabens', 'depoimento'] : [tipo];
  const { data, error } = await client.from('monitoring_abordagens')
    .select(COLS)
    .in('tipo', tipos).eq('status', 'encerrada')
    .order('encerrada_em', { ascending: false, nullsFirst: false })
    .limit(n);
  if (error) throw new Error(`getUltimasEncerradasDoTipo: ${error.message}`);
  return (data ?? []) as unknown as AbordagemRow[];
}

// ---------------------------------------------------------------------------
// Treino e config
// ---------------------------------------------------------------------------

export async function getRegrasTreino(client: SupabaseClient, tipo: AbordagemTipo): Promise<string[]> {
  const { data, error } = await client.from('monitoring_treino')
    .select('instrucao')
    .eq('ativo', true)
    .or(`tipo.is.null,tipo.eq.${tipo}`)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`getRegrasTreino: ${error.message}`);
  return ((data ?? []) as Array<{ instrucao: string }>).map((r) => r.instrucao);
}

export async function gravarRegraTreino(
  client: SupabaseClient, tipo: AbordagemTipo | null, instrucao: string,
): Promise<void> {
  const { error } = await client.from('monitoring_treino')
    .insert({ tipo, instrucao, ativo: true });
  if (error) throw new Error(`gravarRegraTreino: ${error.message}`);
}

// "apaga essa regra": desfaz a ÚLTIMA regra ativa criada há menos de 10min
// (janela curta de arrependimento — regra velha não some por engano).
const TTL_DESFAZER_REGRA_MS = 10 * 60 * 1000;

export async function desativarUltimaRegraRecente(client: SupabaseClient): Promise<boolean> {
  const desde = new Date(Date.now() - TTL_DESFAZER_REGRA_MS).toISOString();
  const { data, error } = await client.from('monitoring_treino')
    .select('id')
    .eq('ativo', true).gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(1).maybeSingle();
  if (error) throw new Error(`desativarUltimaRegraRecente: ${error.message}`);
  if (!data) return false;
  const { error: e2 } = await client.from('monitoring_treino')
    .update({ ativo: false }).eq('id', (data as { id: string }).id);
  if (e2) throw new Error(`desativarUltimaRegraRecente: ${e2.message}`);
  return true;
}

export async function getConfig(client: SupabaseClient): Promise<ConfigAutonomia> {
  const { data, error } = await client.from('monitoring_config')
    .select('parabens_auto, queda_auto, offline_auto, template_nome, template_bloqueio_avisado')
    .eq('id', 1).maybeSingle();
  if (error) throw new Error(`getConfig: ${error.message}`);
  if (!data) throw new Error('getConfig: monitoring_config vazio (rodar migration 048)');
  return data as unknown as ConfigAutonomia;
}

export async function setAutonomia(
  client: SupabaseClient, tipo: 'parabens' | 'queda' | 'offline', on: boolean,
): Promise<void> {
  const { error } = await client.from('monitoring_config')
    .update({ [`${tipo}_auto`]: on, updated_at: agoraIso() })
    .eq('id', 1);
  if (error) throw new Error(`setAutonomia: ${error.message}`);
}

export async function marcarBloqueioTemplateAvisado(client: SupabaseClient): Promise<void> {
  const { error } = await client.from('monitoring_config')
    .update({ template_bloqueio_avisado: true, updated_at: agoraIso() })
    .eq('id', 1);
  if (error) throw new Error(`marcarBloqueioTemplateAvisado: ${error.message}`);
}
