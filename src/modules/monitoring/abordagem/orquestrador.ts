// src/modules/monitoring/abordagem/orquestrador.ts
// Cola da abordagem: propor → (treino: Junior aprova) → enviar (template fora
// da janela 24h) → lembrete → encerrar → resumo de feedback.
// Eva escreve (redator), SISTEMA decide (regras) e calcula (numeros-usina).
// Erros: try/catch com log — falha de uma peça NUNCA derruba o ciclo das outras.
import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { podeAbordar, decidirTipoMilestone, RITMO, diasDesde } from './regras.js';
import { ESCADAS, objetivoDoDegrau } from './escada.js';
import { numerosTrimestre, recuperacaoPosLimpeza, type GeracaoDia } from './numeros-usina.js';
import { redigirMensagem, type ContextoRedacao } from './redator.js';
import {
  criarProposta, getAbordagem, mudarStatusAbordagem, atualizarAbordagem,
  reverterEnvioParaProposta, getAbordagemAbertaPorLeadPhone, getDiarioUsina,
  getAbordagensParaLembrete, getAbordagensParaEncerrar,
  getAbordagensReagendadasDevidas, limparReagendamento,
  getQuedasEncerradasPorLimpeza, getAbordagemAjustando, getAbordagemErrouPendente,
  getUltimasEncerradasDoTipo, getRegrasTreino, gravarRegraTreino,
  getConfig, setAutonomia, marcarBloqueioTemplateAvisado,
  getPresasEmProposta, getConversasEsfriadas, marcarLembreteSeSemResposta,
  consumirMarcadorTemplate, desativarUltimaRegraRecente,
} from './abordagens-repo.js';
import type { AbordagemRow, AbordagemTipo, AbordagemDesfecho } from './tipos.js';
import { tarifaPorConcessionaria } from '../../solar-params.js';
import { esperadoDiaKwh } from '../classificacao.js';
import { dentroDaJanela } from '../proactive-alerts/janela.js';

export interface OrqDeps {
  supabase: SupabaseClient;
  anthropic: Anthropic;
  waba: {
    sendInteractiveButtons(to: string, body: string, buttons: Array<{ id: string; title: string }>, footer?: string): Promise<unknown>;
    sendTemplate(to: string, name: string, lang: string, components: unknown[]): Promise<{ messageId: string }>;
  };
  sendText: (to: string, text: string) => Promise<void>;
  adminPhone: string;
  dryRun: boolean;
  // janela 24h: o index sabe a última msg INBOUND do cliente.
  // Convenção conservadora: na dúvida, FECHADA (template é o caminho seguro).
  janela24hAberta: (phone: string) => Promise<boolean>;
  // I7: takeover (Junior assumiu a conversa) — os envios do cron pulam o
  // cliente e re-tentam no próximo ciclo. Opcional: sem o campo, segue normal.
  estaEmTakeover?: (phone: string) => Promise<boolean>;
}

const FOOTER = 'Monitoramento · Eva';

// Vassoura de estados presos (sub-passo e do cron): re-oferta pro Junior,
// expiração de proposta órfã e encerramento de conversa que esfriou.
const VASSOURA_REOFERTA_DIAS = 3;
const VASSOURA_EXPIRA_DIAS = 7;
const VASSOURA_ESFRIA_DIAS = 5;

const ROTULO_TIPO: Record<AbordagemTipo, string> = {
  parabens: '☀️ parabéns trimestral',
  depoimento: '⭐ pedido de depoimento',
  queda: '📉 queda de geração',
  offline: '🔌 sem monitorar',
};

const ROTULO_DESFECHO: Record<AbordagemDesfecho, string> = {
  resolvido_sozinho: 'resolvido pela Eva',
  limpeza_fechada: 'limpeza fechada',
  visita_agendada: 'visita agendada',
  transferido_junior: 'transferido pro Junior',
  sem_resposta: 'sem resposta',
  descartada_junior: 'descartada pelo Junior',
};

const primeiroNome = (nome: string | null | undefined): string =>
  (nome ?? 'cliente').trim().split(/\s+/)[0] || 'cliente';

const addDias = (d: Date, n: number): Date => new Date(d.getTime() + n * 24 * 60 * 60 * 1000);
const isoDia = (d: Date): string => d.toISOString().slice(0, 10);

const BOTOES_APROVACAO = (id: string) => [
  { id: `mab:ok:${id}`, title: 'Pode mandar' },
  { id: `mab:adj:${id}`, title: 'Ajustar' },
  { id: `mab:no:${id}`, title: 'Não manda' },
];

// ---------------------------------------------------------------------------
// Leituras auxiliares (leads/sistemas/geração — fora do repo de abordagens)
// ---------------------------------------------------------------------------

interface LeadBasico { id: string; name: string | null; phone: string | null; opt_out: boolean | null }
interface SistemaBasico { id: string; apelido: string; potencia_kwp: number | null; cidade: string | null; uf: string | null; lead_id: string | null }

async function getLeadBasico(client: SupabaseClient, leadId: string): Promise<LeadBasico | null> {
  const { data, error } = await client.from('leads')
    .select('id, name, phone, opt_out').eq('id', leadId).maybeSingle();
  if (error) throw new Error(`getLeadBasico: ${error.message}`);
  return (data as LeadBasico | null) ?? null;
}

async function getSistemaBasico(client: SupabaseClient, sistemaId: string): Promise<SistemaBasico | null> {
  const { data, error } = await client.from('sistemas_clientes')
    .select('id, apelido, potencia_kwp, cidade, uf, lead_id').eq('id', sistemaId).maybeSingle();
  if (error) throw new Error(`getSistemaBasico: ${error.message}`);
  return (data as SistemaBasico | null) ?? null;
}

async function getGeracaoEntre(
  client: SupabaseClient, sistemaId: string, deDia: string, ateDia: string,
): Promise<GeracaoDia[]> {
  const { data, error } = await client.from('geracao_diaria')
    .select('data, geracao_kwh')
    .eq('sistema_id', sistemaId).gte('data', deDia).lte('data', ateDia)
    .order('data', { ascending: true });
  if (error) throw new Error(`getGeracaoEntre: ${error.message}`);
  return (data ?? []) as GeracaoDia[];
}

async function getTrimestre(
  client: SupabaseClient, sistema: SistemaBasico, hoje: Date,
): Promise<{ kwh: number; reais: number } | null> {
  const ger90 = await getGeracaoEntre(client, sistema.id, isoDia(addDias(hoje, -90)), isoDia(hoje));
  // R$ = kWh × tarifa da distribuidora (solar-params) — a IA NUNCA calcula.
  return numerosTrimestre(ger90, tarifaPorConcessionaria(sistema.uf ?? sistema.cidade), hoje);
}

// Recalcula os dados reais a partir do banco (usado na REESCRITA pós-[Ajustar]
// e no LEMBRETE — a proposta original recebe os números prontos do dispatcher,
// mas eles não ficam gravados na linha; recomputar é determinístico e barato).
async function recomputarDados(
  client: SupabaseClient, row: AbordagemRow, hoje: Date,
): Promise<ContextoRedacao['dados']> {
  const dados: ContextoRedacao['dados'] = {
    percentualQueda: null, diasOffline: null, trimestre: null,
    causaRaizAnterior: row.causa_raiz,
  };
  const sistema = await getSistemaBasico(client, row.sistema_id);
  if (!sistema) return dados;

  if (row.tipo === 'offline') {
    // dias desde o último dia com geração > 0 (mesma semântica do detect)
    const ger = await getGeracaoEntre(client, sistema.id, isoDia(addDias(hoje, -60)), isoDia(hoje));
    const ultimaComGeracao = [...ger].reverse().find((g) => Number(g.geracao_kwh) > 0);
    if (ultimaComGeracao) {
      const dias = Math.floor((hoje.getTime() - new Date(`${ultimaComGeracao.data}T12:00:00Z`).getTime()) / (24 * 60 * 60 * 1000));
      dados.diasOffline = Math.max(dias, 1);
    }
  } else if (row.tipo === 'queda') {
    // mesmo cálculo do radar (classificacao.ts): real 7d ÷ esperado 7d
    const ger7 = await getGeracaoEntre(client, sistema.id, isoDia(addDias(hoje, -7)), isoDia(hoje));
    const real7 = ger7.reduce((s, g) => s + Number(g.geracao_kwh), 0);
    const esperado7 = esperadoDiaKwh(sistema.potencia_kwp, sistema.uf) * 7;
    if (esperado7 > 0 && real7 > 0) {
      const pct = Math.round((1 - real7 / esperado7) * 100);
      if (pct > 0 && pct < 100) dados.percentualQueda = pct;
    }
  } else {
    dados.trimestre = await getTrimestre(client, sistema, hoje);
  }
  return dados;
}

// I4: sem o número obrigatório do tipo (integração fora do ar?) a redação sai
// vazia ou inventada — quem chama decide pular ou avisar o Junior.
function faltaDadoChave(tipo: AbordagemTipo, dados: ContextoRedacao['dados']): boolean {
  if (tipo === 'offline') return dados.diasOffline == null;
  if (tipo === 'queda') return dados.percentualQueda == null;
  return dados.trimestre == null; // parabens/depoimento
}

// I1: FRESCOR compartilhado (envio, lembrete e reagendada) — alerta de problema
// já resolvido (geração voltou) → encerra a abordagem sem mandar nada. Nunca
// "tá offline" pra usina viva. true = encerrou (chamador pula o envio).
async function encerrarSeAlertaResolvido(deps: OrqDeps, row: AbordagemRow): Promise<boolean> {
  if (!row.alerta_id || (row.tipo !== 'offline' && row.tipo !== 'queda')) return false;
  const client = deps.supabase;
  const { data, error } = await client.from('monitoring_alerts')
    .select('resolved_at').eq('id', row.alerta_id).maybeSingle();
  if (error) {
    console.warn('[abordagem] frescor: leitura do alerta falhou:', error.message);
    return false;
  }
  if (!(data as { resolved_at: string | null } | null)?.resolved_at) return false;
  await mudarStatusAbordagem(client, row.id,
    ['proposta', 'aguardando_aprovacao', 'enviada', 'em_conversa', 'lembrete_enviado'], 'encerrada',
    { desfecho: 'resolvido_sozinho', encerrada_em: new Date().toISOString() });
  console.log(`[abordagem] ${row.id}: alerta resolveu sozinho — encerrada sem mandar`);
  return true;
}

// I7: best-effort — erro na consulta de takeover NÃO segura o envio (na dúvida
// o cliente não está em takeover; o caso raro de colisão é aceitável).
async function emTakeover(deps: OrqDeps, phone: string): Promise<boolean> {
  if (!deps.estaEmTakeover) return false;
  try { return await deps.estaEmTakeover(phone); } catch { return false; }
}

// ---------------------------------------------------------------------------
// 1) PROPOR — chamado pelo dispatcher quando alerta elegível chega
// ---------------------------------------------------------------------------

export async function proporAbordagem(deps: OrqDeps, args: {
  alertaId: string; sistemaId: string; leadId: string;
  tipoAlerta: 'sistema_offline' | 'queda_geracao' | 'milestone_economia';
  diasOffline: number | null; percentualQueda: number | null;
}): Promise<'proposta' | 'enviada' | 'inelegivel'> {
  try {
    const client = deps.supabase;
    const hoje = new Date();

    // a. lead vivo, com telefone e sem opt-out
    const lead = await getLeadBasico(client, args.leadId);
    if (!lead || lead.opt_out === true || !lead.phone) return 'inelegivel';

    // b. diário + tipo. Milestone: a família parabéns/depoimento compartilha o
    //    descarte no diário, então dá pra ler o diário ANTES de decidir o tipo.
    const tipoPreliminar: AbordagemTipo =
      args.tipoAlerta === 'sistema_offline' ? 'offline'
        : args.tipoAlerta === 'queda_geracao' ? 'queda' : 'parabens';
    const diario = await getDiarioUsina(client, args.sistemaId, args.leadId, tipoPreliminar);
    const tipo: AbordagemTipo = args.tipoAlerta === 'milestone_economia'
      ? decidirTipoMilestone(diario) : tipoPreliminar;

    // c. regras puras de ritmo/elegibilidade
    const veredito = podeAbordar(tipo, { id: lead.id, optOut: Boolean(lead.opt_out) }, diario, hoje);
    if (!veredito.ok) {
      console.log(`[abordagem] inelegível (${tipo}, sistema=${args.sistemaId}): ${veredito.motivo}`);
      return 'inelegivel';
    }

    const sistema = await getSistemaBasico(client, args.sistemaId);
    if (!sistema) return 'inelegivel';

    // d. dados reais (a IA recebe pronto, nunca calcula)
    const dados: ContextoRedacao['dados'] = {
      percentualQueda: tipo === 'queda' ? args.percentualQueda : null,
      diasOffline: tipo === 'offline' ? args.diasOffline : null,
      trimestre: null,
      causaRaizAnterior: tipo === 'offline' ? diario.causaRaizAnterior : null,
    };
    if (tipo === 'parabens' || tipo === 'depoimento') {
      dados.trimestre = await getTrimestre(client, sistema, hoje);
      // Parabéns sem número real é conversa vazia — nunca mandar.
      // (Depoimento pode ir sem trimestre: o gancho é a geração acima do esperado.)
      if (tipo === 'parabens' && !dados.trimestre) {
        console.log(`[abordagem] parabéns sem números do trimestre (sistema=${args.sistemaId}) — inelegível`);
        return 'inelegivel';
      }
    }

    // e. redigir (etapa 1 sempre existe em toda escada)
    const msg = await redigirMensagem(deps.anthropic, {
      tipo, etapa: 1, objetivo: objetivoDoDegrau(tipo, 1),
      clienteNome: lead.name ?? 'cliente', dados,
      regrasTreino: await getRegrasTreino(client, tipo),
      ajusteDoJunior: null, mensagemAnterior: null,
    });
    if (!msg) {
      console.warn(`[abordagem] redator devolveu vazio (${tipo}, sistema=${args.sistemaId})`);
      return 'inelegivel';
    }

    // f. gravar proposta (null = corrida do unique parcial: outra abriu antes)
    const id = await criarProposta(client, {
      sistemaId: args.sistemaId, leadId: args.leadId, alertaId: args.alertaId,
      tipo, mensagemProposta: msg,
    });
    if (!id) return 'inelegivel';

    // g. autonomia por tipo (parabéns e depoimento usam a mesma flag)
    const config = await getConfig(client);
    const autoOn = tipo === 'queda' ? config.queda_auto
      : tipo === 'offline' ? config.offline_auto : config.parabens_auto;

    // h. treino → Junior aprova; auto → vai direto
    if (!autoOn) {
      await mudarStatusAbordagem(client, id, ['proposta'], 'aguardando_aprovacao');
      await deps.waba.sendInteractiveButtons(deps.adminPhone,
        `🟡 Abordagem pronta — ${sistema.apelido} (${ROTULO_TIPO[tipo]}):\n\n"${msg}"`,
        BOTOES_APROVACAO(id), FOOTER);
      return 'proposta';
    }
    const enviada = await enviarParaCliente(deps, id);
    // I5: modo auto avisa o Junior do que saiu (best-effort — o envio ao
    // cliente JÁ aconteceu; falha aqui não pode desfazer nada). Em dry-run
    // nada saiu de verdade, então não mente pro admin.
    if (enviada && !deps.dryRun) {
      try {
        await deps.sendText(deps.adminPhone,
          `🤖 Mandei pra ${primeiroNome(lead.name)} (${ROTULO_TIPO[tipo]}): "${msg}"`);
      } catch (err) {
        console.warn('[abordagem] aviso de envio auto falhou:', (err as Error).message);
      }
    }
    // Template bloqueado/corrida: a abordagem fica registrada como proposta —
    // o alerta original ainda assim foi absorvido pelo motor de abordagem.
    return enviada ? 'enviada' : 'proposta';
  } catch (err) {
    console.error('[abordagem] proporAbordagem falhou:', (err as Error).message);
    return 'inelegivel'; // dispatcher cai no alerta admin normal
  }
}

// ---------------------------------------------------------------------------
// 2) ENVIAR pro cliente (usado pela aprovação do Junior e pelo modo auto)
// ---------------------------------------------------------------------------

export async function enviarParaCliente(deps: OrqDeps, abordagemId: string): Promise<boolean> {
  const client = deps.supabase;
  const agora = new Date().toISOString();

  const row = await getAbordagem(client, abordagemId);
  if (!row || !row.mensagem_proposta) return false;

  // M1: dry-run ANTES de qualquer mutação (CAS/frescor/ritmo) — linha falsa
  // não pode contar pro ritmo nem deadlockar a usina em homologação.
  if (deps.dryRun) {
    console.log(`[abordagem] DRY: enviaria (${row.tipo}) pra lead=${row.lead_id}: ${row.mensagem_proposta}`);
    return true;
  }

  // a0. FRESCOR (spec caso-limite): alerta já resolvido (geração voltou antes
  //     do envio) → encerra sem mandar nada. Helper compartilhado com o cron.
  if (await encerrarSeAlertaResolvido(deps, row)) return false;

  // a1. I3: RITMO re-checado na hora do envio — entre a proposta e o clique do
  //     Junior pode ter saído outra proativa pro MESMO lead (outra usina).
  //     Invariante: NUNCA 2 proativas no mesmo dia pro mesmo lead. Segura sem
  //     perder: reagendada_para = +1 dia e o cron de reagendadas re-tenta
  //     (ele pega 'proposta'/'aguardando_aprovacao' com agendamento vencido).
  const diario = await getDiarioUsina(client, row.sistema_id, row.lead_id, row.tipo);
  const msgHaDias = diasDesde(diario.ultimaMsgProativaAoLeadEm, new Date());
  if (msgHaDias !== null && msgHaDias < 1) {
    await atualizarAbordagem(client, abordagemId,
      { reagendada_para: addDias(new Date(), 1).toISOString() });
    if (row.status === 'aguardando_aprovacao') {
      try {
        await deps.sendText(deps.adminPhone,
          '⏸️ Segurada pra amanhã — o cliente já recebeu mensagem hoje (1 proativa por dia).');
      } catch (err) {
        console.warn('[abordagem] aviso de ritmo falhou:', (err as Error).message);
      }
    }
    console.log(`[abordagem] ${abordagemId}: segurada pelo ritmo (lead já recebeu proativa hoje)`);
    return false;
  }

  // a. CAS ANTES do envio (lição da Fatia 3): o porteiro de status é o que
  //    impede o clique duplo do Junior em [Pode mandar] de mandar 2 mensagens —
  //    por isso precisa vir ANTES do I/O de envio. Falha de envio DEPOIS é
  //    compensada com reversão explícita pra 'proposta' (nunca duplica, nunca
  //    fica 'enviada' fantasma).
  const casOk = await mudarStatusAbordagem(client, abordagemId,
    ['proposta', 'aguardando_aprovacao'], 'enviada',
    { enviada_em: agora, mensagem_enviada: row.mensagem_proposta });
  if (!casOk) return false; // clique duplo / já tratada

  const lead = await getLeadBasico(client, row.lead_id);
  if (!lead?.phone) {
    await reverterEnvioParaProposta(client, abordagemId);
    console.warn(`[abordagem] ${abordagemId}: lead sem telefone — revertida pra proposta`);
    return false;
  }

  // c. janela 24h decide o caminho (na dúvida o helper devolve FECHADA)
  let aberta = false;
  try { aberta = await deps.janela24hAberta(lead.phone); } catch { aberta = false; }

  if (aberta) {
    // d1. dentro da janela: mensagem da escada direto
    try {
      await deps.sendText(lead.phone, row.mensagem_proposta);
    } catch (err) {
      await reverterEnvioParaProposta(client, abordagemId);
      console.error('[abordagem] envio direto falhou:', (err as Error).message);
      return false;
    }
  } else {
    // d2. fora da janela: SÓ template aprovado, SEM fallback pra reativacao —
    //     texto não combina; bloquear é melhor que mandar template errado.
    const config = await getConfig(client);
    try {
      await deps.waba.sendTemplate(lead.phone, config.template_nome, 'pt_BR',
        [{ type: 'body', parameters: [{ type: 'text', text: primeiroNome(lead.name) }] }]);
    } catch (err) {
      await reverterEnvioParaProposta(client, abordagemId);
      const msg = (err as Error).message ?? String(err);
      // 132001 = template não existe / 132000 = parâmetros — template não
      // aprovado no Meta. Aviso ÚNICO ao admin (flag persistida no config).
      if (/13200[01]/.test(msg)) {
        // I4: marcador pra vassoura NÃO expirar essa proposta — ela re-tenta o
        // envio; quando o template for aprovado, a abordagem sai sozinha.
        try {
          await atualizarAbordagem(client, abordagemId, { nota_observacao: '[template bloqueado]' });
        } catch (e3) {
          console.warn('[abordagem] marcar [template bloqueado] falhou:', (e3 as Error).message);
        }
        if (!config.template_bloqueio_avisado) {
          try {
            await deps.sendText(deps.adminPhone,
              `⚠️ Template ${config.template_nome} ainda não aprovado no Meta — as abordagens de monitoramento ficam seguradas até aprovar.`);
            await marcarBloqueioTemplateAvisado(client);
          } catch (e2) {
            console.warn('[abordagem] aviso de bloqueio falhou:', (e2 as Error).message);
          }
        }
      }
      console.error('[abordagem] template falhou:', msg);
      return false;
    }
    // A mensagem REAL da escada vai quando o cliente responder ao template
    // (handleRespostaCliente manda mensagem_proposta na abertura da janela).
    // Best-effort DEPOIS do envio: o template já saiu — falha aqui não pode
    // virar "❌" pro Junior nem reverter estado (lição: envio nunca se desfaz).
    try {
      await atualizarAbordagem(client, abordagemId, { mensagem_enviada: '[template enviado]' });
    } catch (err) {
      console.warn('[abordagem] marcar [template enviado] falhou:', (err as Error).message);
    }
  }

  // e. o alerta original não compete com a abordagem (best-effort)
  if (row.alerta_id) {
    const { error } = await client.from('monitoring_alerts')
      .update({
        acao_disparada: 'abordagem_cliente', acao_disparada_em: agora,
        next_send_at: addDias(new Date(), 30).toISOString(),
      })
      .eq('id', row.alerta_id);
    if (error) console.warn('[abordagem] marcar alerta falhou:', error.message);
  }
  return true;
}

// ---------------------------------------------------------------------------
// 3) BOTÕES do Junior (mab:) — chamado pelo index
// ---------------------------------------------------------------------------

export async function handleMabButton(deps: OrqDeps, buttonId: string): Promise<boolean> {
  const partes = buttonId.trim().split(':');
  if (partes[0] !== 'mab' || partes.length < 3) return false;
  const [, acao, ref] = partes;
  const client = deps.supabase;
  const agora = new Date().toISOString();
  try {
    switch (acao) {
      case 'ok': {
        const ok = await enviarParaCliente(deps, ref);
        if (ok) {
          // Cinto extra do dry-run: enviarParaCliente em dry só loga, sem
          // mandar — a confirmação pro Junior não pode mentir que saiu.
          if (deps.dryRun) {
            await deps.sendText(deps.adminPhone,
              '🟡 DRY-RUN: simulei o envio — o cliente NÃO recebeu (PROACTIVE_ALERTS_DRY_RUN=1).');
            return true;
          }
          const row = await getAbordagem(client, ref);
          const lead = row ? await getLeadBasico(client, row.lead_id) : null;
          await deps.sendText(deps.adminPhone, `✅ Mandada pra ${primeiroNome(lead?.name)}.`);
        } else {
          await deps.sendText(deps.adminPhone,
            '⚠️ Essa abordagem não saiu (já tratada, resolvida sozinha ou template pendente no Meta).');
        }
        return true;
      }
      case 'adj': {
        // No-op de status com CAS: só vale se ainda está aguardando aprovação.
        // O texto seguinte do Junior cai em handleTextoAdminAjuste (wiring no index).
        const ok = await mudarStatusAbordagem(client, ref,
          ['aguardando_aprovacao'], 'aguardando_aprovacao', { nota_observacao: '[ajustando]' });
        await deps.sendText(deps.adminPhone,
          ok ? 'O que ajusto nessa mensagem?' : 'Essa abordagem não está mais aguardando aprovação.');
        return true;
      }
      case 'no': {
        const ok = await mudarStatusAbordagem(client, ref,
          ['proposta', 'aguardando_aprovacao'], 'encerrada',
          { desfecho: 'descartada_junior', encerrada_em: agora });
        await deps.sendText(deps.adminPhone,
          ok ? `Ok, descartada. Esse tipo não volta pra essa usina por ${RITMO.DESCARTE_DIAS} dias.`
            : 'Essa abordagem já tinha sido tratada.');
        return true;
      }
      case 'fb-boa': {
        await atualizarAbordagem(client, ref, { nota_junior: 'boa' });
        await deps.sendText(deps.adminPhone, '👍 Anotado!');
        return true;
      }
      case 'fb-errou': {
        // nota_observacao=null abre a vaga pro "o que errou" por texto
        // (handleTextoAdminAjuste, janela de 1h).
        await atualizarAbordagem(client, ref, { nota_junior: 'errou', nota_observacao: null });
        await deps.sendText(deps.adminPhone, 'O que ela errou? Me conta que vira regra de treino.');
        return true;
      }
      case 'auto-on': {
        if (ref !== 'parabens' && ref !== 'queda' && ref !== 'offline') {
          console.warn(`[abordagem] auto-on com tipo inválido: ${ref}`);
          return true;
        }
        await setAutonomia(client, ref, true);
        await deps.sendText(deps.adminPhone,
          `🔓 ${ROTULO_TIPO[ref]} liberado pra mandar sozinho. Pra reverter é só me falar.`);
        return true;
      }
      case 'ligo': case 'visita': case 'deixa': {
        // Botões do pós-encerramento sem resposta: a abordagem já está
        // 'encerrada' (sem_resposta) — aqui só registra o desfecho real.
        const desfecho: AbordagemDesfecho = acao === 'ligo' ? 'transferido_junior'
          : acao === 'visita' ? 'visita_agendada' : 'sem_resposta';
        await atualizarAbordagem(client, ref, { desfecho });
        const conf = acao === 'ligo' ? '📞 Combinado — fica com você.'
          : acao === 'visita' ? '🚗 Anotado: visita agendada.'
            : '🤷 Ok, deixamos pra lá.';
        await deps.sendText(deps.adminPhone, conf);
        return true;
      }
      default:
        console.warn(`[abordagem] mab ação desconhecida: ${acao}`);
        return true;
    }
  } catch (err) {
    console.error('[abordagem] botão mab falhou:', (err as Error).message);
    try { await deps.sendText(deps.adminPhone, `❌ ${(err as Error).message}`); } catch { /* melhor esforço */ }
    return true;
  }
}

// ---------------------------------------------------------------------------
// 4) AJUSTE/FEEDBACK por texto do Junior (index chama quando há pendência)
// ---------------------------------------------------------------------------

export async function handleTextoAdminAjuste(deps: OrqDeps, texto: string): Promise<boolean> {
  const client = deps.supabase;
  const t = texto.trim();
  if (!t) return false;
  // Comando ou clique de botão NUNCA é ajuste/feedback — deixa passar pro
  // fluxo normal do admin em vez de virar regra de treino sem querer.
  if (t.startsWith('/') || /^(finrec|finrcv|finlan|mab|evabt|prop|menu_):/.test(t)) return false;
  // "cancela"/"deixa" sozinhos = desistência do marcador pendente (palavra
  // EXATA: "deixa mais informal" continua sendo ajuste legítimo).
  const ehDesistencia = /^(cancela|deixa)[\s.!…]*$/i.test(t);
  try {
    // 0) "apaga essa regra" — arrependimento da última regra gravada (< 10min)
    if (/^apaga essa regra[\s.!…]*$/i.test(t)) {
      const apagou = await desativarUltimaRegraRecente(client);
      if (apagou) {
        await deps.sendText(deps.adminPhone, 'Apagada — essa regra não vale mais.');
        return true;
      }
      return false; // sem regra recente: não engole a conversa
    }

    // 1) [Ajustar] pendente → reescreve com o pedido como ordem prioritária
    const ajustando = await getAbordagemAjustando(client);
    if (ajustando) {
      if (ehDesistencia) {
        await atualizarAbordagem(client, ajustando.id, { nota_observacao: null });
        await deps.sendText(deps.adminPhone, 'Ok, deixei como estava.');
        return true;
      }
      const lead = await getLeadBasico(client, ajustando.lead_id);
      const sistema = await getSistemaBasico(client, ajustando.sistema_id);
      const dados = await recomputarDados(client, ajustando, new Date());
      // I4: sem o número obrigatório do tipo, reescrever seria inventar dado.
      if (faltaDadoChave(ajustando.tipo, dados)) {
        await deps.sendText(deps.adminPhone,
          'Os números da usina sumiram (integração?) — não dá pra reescrever agora.');
        return true;
      }
      const msg = await redigirMensagem(deps.anthropic, {
        tipo: ajustando.tipo, etapa: ajustando.etapa,
        objetivo: objetivoDoDegrau(ajustando.tipo, ajustando.etapa),
        clienteNome: lead?.name ?? 'cliente',
        dados,
        regrasTreino: await getRegrasTreino(client, ajustando.tipo),
        ajusteDoJunior: t, mensagemAnterior: ajustando.mensagem_proposta,
      });
      if (!msg) {
        await deps.sendText(deps.adminPhone, '❌ Não consegui reescrever — me fala de novo o ajuste?');
        return true;
      }
      // '[ajustada]' fecha o modo ajuste E registra que houve ajuste (a sugestão
      // de autonomia exige 5 encerradas seguidas SEM esse marcador).
      await atualizarAbordagem(client, ajustando.id,
        { mensagem_proposta: msg, nota_observacao: '[ajustada]' });
      await gravarRegraTreino(client, ajustando.tipo, t); // ajuste vira regra permanente
      await deps.waba.sendInteractiveButtons(deps.adminPhone,
        `🟡 Reescrevi — ${sistema?.apelido ?? 'usina'} (${ROTULO_TIPO[ajustando.tipo]}):\n\n"${msg}"`,
        BOTOES_APROVACAO(ajustando.id), FOOTER);
      // Eco da regra: o Junior confere o que virou treino permanente.
      await deps.sendText(deps.adminPhone,
        `Anotei como regra: "${t}". Se não era isso, manda "apaga essa regra".`);
      return true;
    }

    // 2) [👎 Errou] esperando o "o que errou" (janela 1h no repo)
    const errou = await getAbordagemErrouPendente(client);
    if (errou) {
      if (ehDesistencia) {
        // fecha a vaga sem regra ('[sem detalhe]' tira do getAbordagemErrouPendente)
        await atualizarAbordagem(client, errou.id, { nota_observacao: '[sem detalhe]' });
        await deps.sendText(deps.adminPhone, 'Ok, deixei como estava.');
        return true;
      }
      await atualizarAbordagem(client, errou.id, { nota_observacao: t.slice(0, 500) });
      await gravarRegraTreino(client, errou.tipo, t);
      await deps.sendText(deps.adminPhone,
        `Anotei como regra: "${t}". Se não era isso, manda "apaga essa regra".`);
      return true;
    }

    return false; // não era pra esse fluxo (segue conversa normal do admin)
  } catch (err) {
    console.error('[abordagem] texto do admin falhou:', (err as Error).message);
    return false;
  }
}

// ---------------------------------------------------------------------------
// 5) RESPOSTA do cliente (index chama ao receber msg de lead com abordagem ativa)
// ---------------------------------------------------------------------------

// 'respondi' = index DEVE retornar (senão a Eva manda 2ª mensagem redundante
// com contexto stale). 'segue_eva' = só registrou a resposta — a Eva normal
// segue com o contexto da abordagem injetado.
export async function handleRespostaCliente(
  deps: OrqDeps, abordagem: AbordagemRow, texto: string,
): Promise<'respondi' | 'segue_eva'> {
  const client = deps.supabase;
  const agora = new Date().toISOString();
  try {
    const t = texto.trim();
    const lead = await getLeadBasico(client, abordagem.lead_id);

    // registra a resposta + status em_conversa (CAS a partir dos status vivos)
    const ok = await mudarStatusAbordagem(client, abordagem.id,
      ['enviada', 'em_conversa', 'lembrete_enviado'], 'em_conversa',
      { ultima_resposta_cliente_em: agora });
    // CAS falhou = o cron encerrou no MESMO instante (corrida): já fechada,
    // não reabre nem responde pela abordagem — a Eva normal cuida da mensagem.
    if (!ok) return 'segue_eva';

    if (!lead?.phone) return 'segue_eva';

    const posTemplate = abordagem.mensagem_enviada === '[template enviado]';
    // ACOPLAMENTO: o index depende do RETORNO desta função ('respondi' →
    // ele para; 'segue_eva' → injeta contexto e a Eva segue). Mexer nesses
    // regex de quick reply muda quem responde o cliente — manter o contrato.
    const ehAgoraNao = /^agora n[aã]o\.?$/i.test(t);
    const ehPodeContar = /^pode contar\.?$/i.test(t);

    if (ehAgoraNao) {
      // C3: consome o marcador '[template enviado]' ANTES de reagendar (retorno
      // descartado — a mensagem real vai pela reagendada). Sem isso o marcador
      // ficava vivo e a próxima resposta do cliente disparava a escada JUNTO
      // com a combinada (mensagem dupla).
      await consumirMarcadorTemplate(client, abordagem.id);
      // Reagenda +2 dias fixos (parse de "amanhã/à noite" = fast-follow
      // registrado na spec como simplificação aceita). UMA tentativa só.
      await atualizarAbordagem(client, abordagem.id, {
        reagendada_para: addDias(new Date(), RITMO.REAGENDA_PADRAO_DIAS).toISOString(),
      });
      await deps.sendText(lead.phone,
        'Tranquilo! Me diz quando é um bom momento que eu te chamo — é coisa rápida, mas importante sobre a sua usina 😊');
      return 'respondi';
    }

    if (ehPodeContar || posTemplate) {
      // Template abriu a janela → agora vai a mensagem REAL da escada.
      // PORTEIRO: consumirMarcadorTemplate troca '[template enviado]' pela
      // mensagem real com CAS — 2 webhooks rápidos → só 1 manda. Também cobre
      // "pode contar" repetido depois que a escada já saiu (null = não manda).
      const msg = await consumirMarcadorTemplate(client, abordagem.id);
      if (msg) {
        await deps.sendText(lead.phone, msg);
        return 'respondi';
      }
      // M4: "pode contar" com marcador já consumido (repetido/corrida) →
      // 'segue_eva': a Eva responde com o contexto da abordagem injetado.
      // 'respondi' silencioso deixava o cliente no vácuo.
      // posTemplate + texto livre idem: resposta normal do cliente.
      return 'segue_eva';
    }
    // Resposta livre: a conversa segue no fluxo normal da Eva com o contexto
    // injetado (montarContextoAbordagem) — o index cuida do roteamento.
    return 'segue_eva';
  } catch (err) {
    console.error('[abordagem] resposta do cliente falhou:', (err as Error).message);
    return 'segue_eva';
  }
}

// Bloco de contexto que o index injeta no prompt da Eva quando o cliente com
// abordagem ativa conversa. PURO (testável), exportado pro wiring da Task 8.
// CONTRATO Task 8: o handler da action deve IGNORAR o abordagem_id vindo da
// action e usar o id da abordagem aberta do PRÓPRIO lead
// (getAbordagemAbertaPorLeadPhone) — impede forjar id alheio via prompt
// injection; desfecho validado por whitelist.
export function montarContextoAbordagem(a: AbordagemRow): string {
  const linhas = [
    'CONTEXTO DE MONITORAMENTO (abordagem ativa da usina deste cliente):',
    `- Assunto: ${ROTULO_TIPO[a.tipo]} (etapa ${a.etapa}).`,
    a.mensagem_enviada && a.mensagem_enviada !== '[template enviado]'
      ? `- O que a Eva já mandou: "${a.mensagem_enviada}"`
      : '- O cliente recebeu só o convite (template) — a conversa está começando agora.',
    a.resposta_resumo ? `- Resumo do que já rolou: ${a.resposta_resumo}` : null,
    a.causa_raiz ? `- Causa raiz já registrada: ${a.causa_raiz}` : null,
    'REGRAS DESTA CONVERSA:',
    '- Limpeza/visita técnica são serviços PAGOS mas NUNCA fale preço — se o cliente topar, avise que o Junior (Responsável Técnico) fecha os detalhes.',
    '- NUNCA calcule geração/economia de cabeça — use apenas números já fornecidos acima.',
    // O bloco cercado é OBRIGATÓRIO: parseActions (brain.ts) só extrai JSON
    // dentro de ```json ... ``` — sem o fence o JSON VAZA pro cliente.
    '- Quando a conversa sobre a usina avançar, anexe ao FINAL da sua resposta um bloco EXATAMENTE neste formato (com as cercas ```json e ``` — sem elas o sistema não registra nada):',
    '```json',
    `{"action":"abordagem_update","data":{"abordagem_id":"${a.id}","resumo":"<1 linha do que rolou>","desfecho":null,"causa_raiz":null}}`,
    '```',
    '- "desfecho" SÓ quando o assunto da usina ENCERRAR: "resolvido_sozinho" (resolveu), "limpeza_fechada" (topou limpeza), "visita_agendada" (topou visita), "transferido_junior" (pediu o Junior). Senão deixe null.',
    '- "causa_raiz": preencha quando descobrir a causa (ex: "senha do wifi"); senão null.',
  ];
  return linhas.filter((l): l is string => Boolean(l)).join('\n');
}

// ---------------------------------------------------------------------------
// 6) CRON de pendências (15min, junto do dispatch)
// ---------------------------------------------------------------------------

export async function processarPendencias(deps: OrqDeps, agora: Date): Promise<void> {
  const client = deps.supabase;
  const agoraIso = agora.toISOString();

  // a. LEMBRETES — cada sub-passo com try/catch PRÓPRIO: um erro não derruba os outros.
  try {
    if (dentroDaJanela(agora)) {
      const fila = await getAbordagensParaLembrete(client, agoraIso, RITMO.LEMBRETE_DIAS);
      for (const row of fila) {
        try {
          // I1: FRESCOR — alerta resolvido entre o envio e o lembrete →
          // encerra sem cobrar (em dry-run não muta; o encerramento real fica
          // pro ciclo sem dry). Mesmo helper do enviarParaCliente.
          if (!deps.dryRun && await encerrarSeAlertaResolvido(deps, row)) continue;
          const lead = await getLeadBasico(client, row.lead_id);
          if (!lead?.phone) continue;
          // I7: Junior assumiu a conversa — o lembrete espera o próximo ciclo.
          if (await emTakeover(deps, lead.phone)) continue;
          let aberta = false;
          try { aberta = await deps.janela24hAberta(lead.phone); } catch { aberta = false; }
          // Lembrete fora da janela 24h não usa template (decisão registrada no
          // plano): espera um ciclo com janela aberta; o encerramento por
          // timeout garante que nada se perde.
          if (!aberta) continue;

          // etapa do lembrete = ÚLTIMO degrau da escada (garantia etapa ≤ último;
          // o fallback do objetivoDoDegrau é só rede de segurança, não fluxo).
          const escada = ESCADAS[row.tipo];
          const etapaLembrete = escada[escada.length - 1].etapa;
          const dados = await recomputarDados(client, row, agora);
          // I4: sem o número obrigatório do tipo (integração fora do ar?) não
          // dá pra redigir lembrete honesto — pula; o timeout encerra depois.
          if (faltaDadoChave(row.tipo, dados)) continue;
          const msg = await redigirMensagem(deps.anthropic, {
            tipo: row.tipo, etapa: etapaLembrete,
            objetivo: objetivoDoDegrau(row.tipo, etapaLembrete),
            clienteNome: lead.name ?? 'cliente',
            dados,
            regrasTreino: await getRegrasTreino(client, row.tipo),
            ajusteDoJunior: null, mensagemAnterior: null,
          });
          if (!msg) continue;

          // Dry-run loga SEM mutar estado (diferente do envio aprovado): o
          // lembrete real ainda precisa sair quando o dry-run desligar.
          if (deps.dryRun) {
            console.log(`[abordagem] DRY lembrete ${row.id}: ${msg}`);
            continue;
          }
          // CAS porteiro ANTES do envio (mesma lição do enviarParaCliente),
          // e DEDICADO: além do status, exige que o cliente NÃO tenha
          // respondido — a janela desde o fetch incluiu uma chamada de LLM
          // (segundos); lembrete não pode atropelar resposta do cliente.
          const ok = await marcarLembreteSeSemResposta(client, row.id, agoraIso, etapaLembrete);
          if (!ok) continue; // cliente respondeu no meio (ou já tratada)
          try {
            await deps.sendText(lead.phone, msg);
          } catch (err) {
            // Falha de envio não desfaz o estado: lembrete perdido é aceitável
            // (o encerramento por timeout cobre) — pior seria arriscar 2 (spam).
            console.warn('[abordagem] envio de lembrete falhou:', (err as Error).message);
          }
        } catch (err) {
          console.error('[abordagem] lembrete falhou:', (err as Error).message);
        }
      }
    }
  } catch (err) {
    console.error('[abordagem] ciclo de lembretes falhou:', (err as Error).message);
  }

  // b. ENCERRAMENTOS por silêncio → avisa o Junior com botões de próximo passo.
  try {
    const fila = await getAbordagensParaEncerrar(client, agoraIso, RITMO.ENCERRA_DIAS);
    for (const row of fila) {
      try {
        // I5: dry-run ANTES do CAS — homologação loga e NÃO muta (igual ao
        // lembrete); o encerramento real ainda precisa rodar sem dry-run.
        if (deps.dryRun) {
          console.log(`[abordagem] DRY encerraria sem resposta: ${row.id}`);
          continue;
        }
        // I1: alerta resolvido enquanto o cliente ficou calado → desfecho
        // verdadeiro é 'resolvido_sozinho', não 'sem_resposta' (sem botões).
        if (await encerrarSeAlertaResolvido(deps, row)) continue;
        // Spec: lembrete/escalada de silêncio é só pra PROBLEMA (queda/offline)
        // — parabéns não cobra resposta. O repo já filtra por tipo; se chegar
        // aqui por outra via, encerra com desfecho null e aviso SÓ de resumo
        // (👍/👎), sem [Eu ligo]/[Agendar visita].
        if (row.tipo === 'parabens' || row.tipo === 'depoimento') {
          const okMilestone = await mudarStatusAbordagem(client, row.id,
            ['enviada', 'lembrete_enviado'], 'encerrada', { encerrada_em: agoraIso });
          if (!okMilestone) continue;
          const leadM = await getLeadBasico(client, row.lead_id);
          const sistemaM = await getSistemaBasico(client, row.sistema_id);
          await deps.waba.sendInteractiveButtons(deps.adminPhone,
            `📋 ${leadM?.name ?? sistemaM?.apelido ?? 'Cliente'}: não respondeu o ${ROTULO_TIPO[row.tipo]} — encerrei sem cobrar.`,
            [
              { id: `mab:fb-boa:${row.id}`, title: '👍 Boa' },
              { id: `mab:fb-errou:${row.id}`, title: '👎 Errou' },
            ], FOOTER);
          continue;
        }
        // C2: 'enviada' sem resposta também encerra direto (sem lembrete):
        // fora da janela 24h o lembrete por texto é impossível — sem isso a
        // usina deadlocka ('enviada' eterna + unique parcial travando).
        const ok = await mudarStatusAbordagem(client, row.id,
          ['enviada', 'lembrete_enviado'], 'encerrada',
          { desfecho: 'sem_resposta', encerrada_em: agoraIso });
        if (!ok) continue;
        const lead = await getLeadBasico(client, row.lead_id);
        const sistema = await getSistemaBasico(client, row.sistema_id);
        await deps.waba.sendInteractiveButtons(deps.adminPhone,
          `😶 ${lead?.name ?? sistema?.apelido ?? 'Cliente'} não respondeu a abordagem (${ROTULO_TIPO[row.tipo]}). O que faço?`,
          [
            { id: `mab:ligo:${row.id}`, title: '📞 Eu ligo' },
            { id: `mab:visita:${row.id}`, title: '🚗 Agendar visita' },
            { id: `mab:deixa:${row.id}`, title: '🤷 Deixar pra lá' },
          ], FOOTER);
      } catch (err) {
        console.error('[abordagem] encerramento falhou:', (err as Error).message);
      }
    }
  } catch (err) {
    console.error('[abordagem] ciclo de encerramentos falhou:', (err as Error).message);
  }

  // c. REAGENDADAS devidas → manda a mensagem combinada.
  try {
    if (dentroDaJanela(agora)) {
      const fila = await getAbordagensReagendadasDevidas(client, agoraIso);
      for (const row of fila) {
        try {
          // I3: abordagem que o ritmo segurou na hora do envio ('proposta' /
          // 'aguardando_aprovacao' com reagendada_para vencido) → re-tenta o
          // envio COMPLETO (frescor + ritmo + CAS estão no enviarParaCliente;
          // se o ritmo segurar de novo, ele re-agenda +1 dia sozinho).
          if (row.status === 'proposta' || row.status === 'aguardando_aprovacao') {
            if (deps.dryRun) {
              console.log(`[abordagem] DRY reagendada (segurada pelo ritmo) re-tentaria envio: ${row.id}`);
              continue;
            }
            const okRitmo = await limparReagendamento(client, row.id);
            if (!okRitmo) continue;
            await enviarParaCliente(deps, row.id);
            continue;
          }
          // I1: FRESCOR — alerta resolvido durante o "agora não" → encerra
          // sem voltar a falar de problema que não existe mais.
          if (!deps.dryRun && await encerrarSeAlertaResolvido(deps, row)) continue;
          const lead = await getLeadBasico(client, row.lead_id);
          if (!lead?.phone || !row.mensagem_proposta) {
            await atualizarAbordagem(client, row.id, { reagendada_para: null });
            continue;
          }
          // I7: Junior assumiu a conversa — a combinada espera o próximo ciclo.
          if (await emTakeover(deps, lead.phone)) continue;
          if (deps.dryRun) {
            console.log(`[abordagem] DRY reagendada ${row.id}: ${row.mensagem_proposta}`);
            continue;
          }
          // Porteiro CAS: limpa o agendamento ANTES de enviar (2 ciclos
          // concorrentes → só 1 envia).
          const ok = await limparReagendamento(client, row.id);
          if (!ok) continue;
          let aberta = false;
          try { aberta = await deps.janela24hAberta(lead.phone); } catch { aberta = false; }
          try {
            if (aberta) {
              await deps.sendText(lead.phone, row.mensagem_proposta);
              await atualizarAbordagem(client, row.id, { mensagem_enviada: row.mensagem_proposta });
            } else {
              // +2 dias depois a janela já fechou: re-abre por template (sem
              // fallback) — a combinada vai quando o cliente responder.
              const config = await getConfig(client);
              await deps.waba.sendTemplate(lead.phone, config.template_nome, 'pt_BR',
                [{ type: 'body', parameters: [{ type: 'text', text: primeiroNome(lead.name) }] }]);
              // C3 (ciclo do marcador): o "agora não" CONSUMIU o marcador
              // original; este 2º template RE-MARCA '[template enviado]' pra
              // resposta do cliente disparar a escada de novo (sem re-marcar,
              // ela cairia em 'segue_eva' sem a mensagem combinada).
              await atualizarAbordagem(client, row.id, { mensagem_enviada: '[template enviado]' });
            }
          } catch (err) {
            // Auto-cura: devolve o agendamento pra +1 dia e tenta de novo.
            await atualizarAbordagem(client, row.id,
              { reagendada_para: addDias(agora, 1).toISOString() });
            console.error('[abordagem] envio de reagendada falhou:', (err as Error).message);
          }
        } catch (err) {
          console.error('[abordagem] reagendada falhou:', (err as Error).message);
        }
      }
    }
  } catch (err) {
    console.error('[abordagem] ciclo de reagendadas falhou:', (err as Error).message);
  }

  // d. PÓS-LIMPEZA (spec queda item 4): quedas encerradas por limpeza há 10-20
  //    dias → compara média 7d antes × 7d recentes e comemora/escala 1×.
  try {
    // M3: pós-limpeza respeita o MESMO horário comercial dos outros envios —
    // comemorar às 3h da manhã queima a confiança igual a qualquer proativa.
    if (dentroDaJanela(agora)) {
      const de = addDias(agora, -20).toISOString();
      const ate = addDias(agora, -10).toISOString();
      const fila = (await getQuedasEncerradasPorLimpeza(client, de, ate))
        .filter((r) => !(r.nota_observacao ?? '').includes('[followup feito]'));
      for (const row of fila) {
        try {
          if (!row.encerrada_em) continue;
          const limpeza = new Date(row.encerrada_em);
          const gerAntes = await getGeracaoEntre(client, row.sistema_id,
            isoDia(addDias(limpeza, -7)), isoDia(addDias(limpeza, -1)));
          const gerDepois = await getGeracaoEntre(client, row.sistema_id,
            isoDia(addDias(agora, -7)), isoDia(agora));
          const pct = recuperacaoPosLimpeza(
            gerAntes.map((g) => Number(g.geracao_kwh)),
            gerDepois.map((g) => Number(g.geracao_kwh)));
          // Sem dado suficiente: NÃO marca — re-tenta nos próximos ciclos até a
          // janela de 20 dias expirar sozinha.
          if (pct === null) continue;

          if (deps.dryRun) {
            console.log(`[abordagem] DRY pós-limpeza ${row.id}: recuperação ${pct}%`);
            continue;
          }
          // M2: '[followup feito]' marca SÓ depois do envio OK (preserva
          // observação anterior). Marcar antes perdia a comemoração em falha de
          // envio; fora da janela 24h NÃO marca — re-tenta no próximo ciclo (a
          // janela pode abrir; a faixa de 20 dias expira sozinha).
          const marca = row.nota_observacao
            ? `${row.nota_observacao} [followup feito]` : '[followup feito]';

          if (pct >= 10) {
            const lead = await getLeadBasico(client, row.lead_id);
            if (!lead?.phone) {
              // sem telefone NUNCA vai dar — marca pra não re-tentar pra sempre
              await atualizarAbordagem(client, row.id, { nota_observacao: marca });
              continue;
            }
            // I7: Junior na conversa — espera o próximo ciclo (sem marcar).
            if (await emTakeover(deps, lead.phone)) continue;
            let aberta = false;
            try { aberta = await deps.janela24hAberta(lead.phone); } catch { aberta = false; }
            if (!aberta) continue; // fora da janela: comemorar não vale template (sem marcar)
            // Número PRONTO em texto fixo (determinístico > IA pra 1 frase).
            const msg = `Boa notícia, ${primeiroNome(lead.name)}! Depois da limpeza a sua usina está gerando ${pct}% a mais ☀️👏 Valeu a pena o cuidado — qualquer coisa, é só me chamar!`;
            await deps.sendText(lead.phone, msg);
            await atualizarAbordagem(client, row.id, { nota_observacao: marca });
            // Diário: follow-up registrado como abordagem já encerrada (etapa 9 =
            // marcador de follow-up, fora da escada de redação de propósito).
            const { error } = await client.from('monitoring_abordagens').insert({
              sistema_id: row.sistema_id, lead_id: row.lead_id, alerta_id: null,
              tipo: 'queda', etapa: 9, status: 'encerrada', desfecho: 'resolvido_sozinho',
              mensagem_proposta: msg, mensagem_enviada: msg,
              resposta_resumo: `follow-up pós-limpeza: geração +${pct}%`,
              enviada_em: agoraIso, encerrada_em: agoraIso,
            });
            if (error) console.warn('[abordagem] registro do follow-up falhou:', error.message);
          } else if (pct < 0) {
            const lead = await getLeadBasico(client, row.lead_id);
            const sistema = await getSistemaBasico(client, row.sistema_id);
            await deps.sendText(deps.adminPhone,
              `⚠️ ${lead?.name ?? sistema?.apelido ?? 'Cliente'} limpou as placas mas a geração CAIU ${Math.abs(pct)}% — pode ser problema técnico, vale olhar.`);
            await atualizarAbordagem(client, row.id, { nota_observacao: marca });
          } else {
            // 0 <= pct < 10: melhora tímida — nada a comemorar; marca e segue.
            await atualizarAbordagem(client, row.id, { nota_observacao: marca });
          }
        } catch (err) {
          console.error('[abordagem] pós-limpeza falhou:', (err as Error).message);
        }
      }
    }
  } catch (err) {
    console.error('[abordagem] ciclo pós-limpeza falhou:', (err as Error).message);
  }

  // e. VASSOURA — estados presos pra sempre (falha de rede no template, botões
  //    que falharam, Junior que nunca clicou, conversa que esfriou). Com o
  //    unique parcial, cada um deles bloqueia a usina em silêncio.
  try {
    const presas = await getPresasEmProposta(client,
      addDias(agora, -VASSOURA_REOFERTA_DIAS).toISOString());
    const corteExpira = addDias(agora, -VASSOURA_EXPIRA_DIAS).toISOString();
    for (const row of presas) {
      try {
        if (row.status === 'proposta') {
          // 'proposta' presa = falha silenciosa (nunca chegou a existir pro
          // Junior). > 7 dias: expira SEM aviso, libera a usina.
          if (row.updated_at >= corteExpira) continue;
          // I4: template não aprovado NÃO expira em silêncio — re-tenta o
          // envio: se o Meta aprovou nesse meio tempo, sai agora; senão o
          // erro re-marca '[template bloqueado]' e volta a segurar.
          // Propostas presas SEM esse marcador seguem expirando como sempre.
          if ((row.nota_observacao ?? '').includes('[template bloqueado]')) {
            if (deps.dryRun) {
              console.log(`[abordagem] DRY vassoura re-tentaria template bloqueado: ${row.id}`);
              continue;
            }
            await enviarParaCliente(deps, row.id);
            continue;
          }
          if (deps.dryRun) {
            console.log(`[abordagem] DRY vassoura expiraria proposta presa: ${row.id}`);
            continue;
          }
          await mudarStatusAbordagem(client, row.id, ['proposta'], 'encerrada',
            { desfecho: 'descartada_junior', encerrada_em: agoraIso, nota_observacao: '[expirada pela vassoura]' });
          continue;
        }
        // 'aguardando_aprovacao' presa há > 3 dias: re-manda os botões 1× —
        // marcador '[reofertada]' impede repetir; o bump do updated_at
        // (atualizarAbordagem) tira da fila da vassoura por mais 3 dias.
        if ((row.nota_observacao ?? '').includes('[reofertada]')) continue;
        if (deps.dryRun) {
          console.log(`[abordagem] DRY vassoura re-ofertaria: ${row.id}`);
          continue;
        }
        const sistema = await getSistemaBasico(client, row.sistema_id);
        await atualizarAbordagem(client, row.id, {
          nota_observacao: row.nota_observacao
            ? `${row.nota_observacao} [reofertada]` : '[reofertada]',
        });
        await deps.waba.sendInteractiveButtons(deps.adminPhone,
          `🟡 Essa abordagem está parada há ${VASSOURA_REOFERTA_DIAS}+ dias esperando você — ${sistema?.apelido ?? 'usina'} (${ROTULO_TIPO[row.tipo]}):\n\n"${row.mensagem_proposta ?? ''}"`,
          BOTOES_APROVACAO(row.id), FOOTER);
      } catch (err) {
        console.error('[abordagem] vassoura (presa) falhou:', (err as Error).message);
      }
    }
  } catch (err) {
    console.error('[abordagem] ciclo da vassoura (presas) falhou:', (err as Error).message);
  }

  try {
    const esfriadas = await getConversasEsfriadas(client,
      addDias(agora, -VASSOURA_ESFRIA_DIAS).toISOString());
    for (const row of esfriadas) {
      try {
        if (deps.dryRun) {
          console.log(`[abordagem] DRY vassoura encerraria esfriada: ${row.id}`);
          continue;
        }
        // Teve resposta, então 'sem_resposta' seria mentira e nenhum outro
        // desfecho do enum é verdade — encerra com desfecho NULL (a coluna
        // aceita) e marca '[conversa esfriou]' (preservando observação).
        const ok = await mudarStatusAbordagem(client, row.id, ['em_conversa'], 'encerrada', {
          encerrada_em: agoraIso,
          nota_observacao: row.nota_observacao
            ? `${row.nota_observacao} [conversa esfriou]` : '[conversa esfriou]',
        });
        if (!ok) continue;
        const lead = await getLeadBasico(client, row.lead_id);
        const sistema = await getSistemaBasico(client, row.sistema_id);
        const nome = lead?.name ?? sistema?.apelido ?? 'Cliente';
        // Resumo de feedback normal (👍/👎) — o Junior fica sabendo e treina.
        await deps.waba.sendInteractiveButtons(deps.adminPhone,
          `📋 ${nome}: ${row.resposta_resumo ?? 'conversa com a Eva'} (conversa esfriou sem desfecho)`,
          [
            { id: `mab:fb-boa:${row.id}`, title: '👍 Boa' },
            { id: `mab:fb-errou:${row.id}`, title: '👎 Errou' },
          ], FOOTER);
      } catch (err) {
        console.error('[abordagem] vassoura (esfriada) falhou:', (err as Error).message);
      }
    }
  } catch (err) {
    console.error('[abordagem] ciclo da vassoura (esfriadas) falhou:', (err as Error).message);
  }
}

// ---------------------------------------------------------------------------
// 7) ENCERRAR por conversa (chamado pela action abordagem_update — Task 8)
// ---------------------------------------------------------------------------

export async function atualizarPorConversa(deps: OrqDeps, abordagemId: string, upd: {
  resumo: string | null; desfecho: AbordagemDesfecho | null; causaRaiz: string | null;
}): Promise<void> {
  const client = deps.supabase;
  const agora = new Date().toISOString();
  try {
    const row = await getAbordagem(client, abordagemId);
    if (!row || row.status === 'encerrada') return;

    const patch: Record<string, unknown> = {};
    if (upd.resumo) patch.resposta_resumo = upd.resumo.slice(0, 500);
    if (upd.causaRaiz) patch.causa_raiz = upd.causaRaiz.slice(0, 200);

    if (!upd.desfecho) {
      if (Object.keys(patch).length > 0) await atualizarAbordagem(client, abordagemId, patch);
      return;
    }

    // encerra com CAS (qualquer status vivo de conversa)
    const ok = await mudarStatusAbordagem(client, abordagemId,
      ['enviada', 'em_conversa', 'lembrete_enviado'], 'encerrada',
      { ...patch, desfecho: upd.desfecho, encerrada_em: agora });
    if (!ok) return;

    // RESUMO DE FEEDBACK pro Junior (👍/👎) + sugestão de autonomia
    const lead = await getLeadBasico(client, row.lead_id);
    const sistema = await getSistemaBasico(client, row.sistema_id);
    const nome = lead?.name ?? sistema?.apelido ?? 'Cliente';

    const botoes = [
      { id: `mab:fb-boa:${abordagemId}`, title: '👍 Boa' },
      { id: `mab:fb-errou:${abordagemId}`, title: '👎 Errou' },
    ];
    // SUGESTÃO DE AUTONOMIA (spec seção 6): tipo ainda em treino + últimas 5
    // encerradas do tipo enviadas SEM ajuste e SEM nota 'errou' → 3º botão
    // (sugestão, não força — quem decide é o Junior).
    try {
      const config = await getConfig(client);
      const autoOn = row.tipo === 'queda' ? config.queda_auto
        : row.tipo === 'offline' ? config.offline_auto : config.parabens_auto;
      if (!autoOn) {
        const ultimas = await getUltimasEncerradasDoTipo(client, row.tipo, 5);
        const todasLimpas = ultimas.length >= 5 && ultimas.every((u) =>
          u.enviada_em !== null && u.nota_junior !== 'errou'
          && !(u.nota_observacao ?? '').includes('[ajustada]'));
        if (todasLimpas) {
          const tipoFlag = (row.tipo === 'depoimento' ? 'parabens' : row.tipo);
          botoes.push({ id: `mab:auto-on:${tipoFlag}`, title: '🔓 Liberar auto' });
        }
      }
    } catch (err) {
      console.warn('[abordagem] sugestão de autonomia falhou:', (err as Error).message);
    }

    await deps.waba.sendInteractiveButtons(deps.adminPhone,
      `📋 ${nome}: ${upd.resumo ?? 'conversa encerrada'} (${ROTULO_DESFECHO[upd.desfecho]})`,
      botoes, FOOTER);

    // Cliente topou serviço → o Junior precisa fechar o VALOR (Eva nunca fala preço).
    if (upd.desfecho === 'limpeza_fechada' || upd.desfecho === 'visita_agendada'
      || upd.desfecho === 'transferido_junior') {
      await deps.sendText(deps.adminPhone,
        `💰 ${nome} topou — fecha o valor com ele${lead?.phone ? ` (${lead.phone})` : ''}.`);
    }
  } catch (err) {
    console.error('[abordagem] atualizarPorConversa falhou:', (err as Error).message);
  }
}

// Conveniência pro wiring da Task 8 (o index pode importar tudo daqui).
export { getAbordagemAbertaPorLeadPhone };
