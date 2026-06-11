// src/modules/monitoring/abordagem/orquestrador.ts
// Cola da abordagem: propor → (treino: Junior aprova) → enviar (template fora
// da janela 24h) → lembrete → encerrar → resumo de feedback.
// Eva escreve (redator), SISTEMA decide (regras) e calcula (numeros-usina).
// Erros: try/catch com log — falha de uma peça NUNCA derruba o ciclo das outras.
import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { podeAbordar, decidirTipoMilestone, RITMO } from './regras.js';
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
}

const FOOTER = 'Monitoramento · Eva';

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

  // a0. FRESCOR (spec caso-limite): alerta já resolvido (geração voltou antes
  //     do envio) → encerra sem mandar nada. Nunca "tá offline" pra usina viva.
  if (row.alerta_id && (row.tipo === 'offline' || row.tipo === 'queda')) {
    const { data, error } = await client.from('monitoring_alerts')
      .select('resolved_at').eq('id', row.alerta_id).maybeSingle();
    if (error) console.warn('[abordagem] frescor: leitura do alerta falhou:', error.message);
    if ((data as { resolved_at: string | null } | null)?.resolved_at) {
      await mudarStatusAbordagem(client, abordagemId, ['proposta', 'aguardando_aprovacao'], 'encerrada',
        { desfecho: 'resolvido_sozinho', encerrada_em: agora });
      console.log(`[abordagem] ${abordagemId}: alerta resolveu sozinho antes do envio — encerrada sem mandar`);
      return false;
    }
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

  // b. dry-run de homologação: loga e não envia (status já marcado — aceitável
  //    em dry-run: o objetivo é ver o funil nos logs sem tocar cliente).
  if (deps.dryRun) {
    console.log(`[abordagem] DRY: enviaria (${row.tipo}) pra lead=${row.lead_id}: ${row.mensagem_proposta}`);
    return true;
  }

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
      if (/13200[01]/.test(msg) && !config.template_bloqueio_avisado) {
        try {
          await deps.sendText(deps.adminPhone,
            `⚠️ Template ${config.template_nome} ainda não aprovado no Meta — as abordagens de monitoramento ficam seguradas até aprovar.`);
          await marcarBloqueioTemplateAvisado(client);
        } catch (e2) {
          console.warn('[abordagem] aviso de bloqueio falhou:', (e2 as Error).message);
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
  try {
    // 1) [Ajustar] pendente → reescreve com o pedido como ordem prioritária
    const ajustando = await getAbordagemAjustando(client);
    if (ajustando) {
      const lead = await getLeadBasico(client, ajustando.lead_id);
      const sistema = await getSistemaBasico(client, ajustando.sistema_id);
      const msg = await redigirMensagem(deps.anthropic, {
        tipo: ajustando.tipo, etapa: ajustando.etapa,
        objetivo: objetivoDoDegrau(ajustando.tipo, ajustando.etapa),
        clienteNome: lead?.name ?? 'cliente',
        dados: await recomputarDados(client, ajustando, new Date()),
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
      return true;
    }

    // 2) [👎 Errou] esperando o "o que errou" (janela 1h no repo)
    const errou = await getAbordagemErrouPendente(client);
    if (errou) {
      await atualizarAbordagem(client, errou.id, { nota_observacao: t.slice(0, 500) });
      await gravarRegraTreino(client, errou.tipo, t);
      await deps.sendText(deps.adminPhone, 'Anotei — virou regra de treino pras próximas. 🙏');
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

export async function handleRespostaCliente(
  deps: OrqDeps, abordagem: AbordagemRow, texto: string,
): Promise<void> {
  const client = deps.supabase;
  const agora = new Date().toISOString();
  try {
    const t = texto.trim();
    const lead = await getLeadBasico(client, abordagem.lead_id);

    // registra a resposta + status em_conversa (CAS a partir dos status vivos)
    await mudarStatusAbordagem(client, abordagem.id,
      ['enviada', 'em_conversa', 'lembrete_enviado'], 'em_conversa',
      { ultima_resposta_cliente_em: agora });

    if (!lead?.phone) return;

    const posTemplate = abordagem.mensagem_enviada === '[template enviado]';
    const ehAgoraNao = /^agora n[aã]o\.?$/i.test(t);
    const ehPodeContar = /^pode contar\.?$/i.test(t);

    if (ehAgoraNao) {
      // Reagenda +2 dias fixos (parse de "amanhã/à noite" = fast-follow
      // registrado na spec como simplificação aceita). UMA tentativa só.
      await atualizarAbordagem(client, abordagem.id, {
        reagendada_para: addDias(new Date(), RITMO.REAGENDA_PADRAO_DIAS).toISOString(),
      });
      await deps.sendText(lead.phone,
        'Tranquilo! Me diz quando é um bom momento que eu te chamo — é coisa rápida, mas importante sobre a sua usina 😊');
      return;
    }

    if (ehPodeContar || posTemplate) {
      // Template abriu a janela → agora vai a mensagem REAL da escada.
      if (abordagem.mensagem_proposta) {
        await deps.sendText(lead.phone, abordagem.mensagem_proposta);
        await atualizarAbordagem(client, abordagem.id,
          { mensagem_enviada: abordagem.mensagem_proposta });
      }
      return;
    }
    // Resposta livre: a conversa segue no fluxo normal da Eva com o contexto
    // injetado (montarContextoAbordagem) — o index cuida do roteamento.
  } catch (err) {
    console.error('[abordagem] resposta do cliente falhou:', (err as Error).message);
  }
}

// Bloco de contexto que o index injeta no prompt da Eva quando o cliente com
// abordagem ativa conversa. PURO (testável), exportado pro wiring da Task 8.
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
    '- Quando a conversa sobre a usina avançar, anexe ao FINAL da sua resposta:',
    `{"action":"abordagem_update","data":{"abordagem_id":"${a.id}","resumo":"<1 linha do que rolou>","desfecho":null,"causa_raiz":null}}`,
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
          const lead = await getLeadBasico(client, row.lead_id);
          if (!lead?.phone) continue;
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
          const msg = await redigirMensagem(deps.anthropic, {
            tipo: row.tipo, etapa: etapaLembrete,
            objetivo: objetivoDoDegrau(row.tipo, etapaLembrete),
            clienteNome: lead.name ?? 'cliente',
            dados: await recomputarDados(client, row, agora),
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
          // CAS porteiro ANTES do envio (mesma lição do enviarParaCliente).
          const ok = await mudarStatusAbordagem(client, row.id,
            ['enviada', 'em_conversa'], 'lembrete_enviado',
            { lembrete_em: agoraIso, etapa: etapaLembrete });
          if (!ok) continue;
          try {
            await deps.sendText(lead.phone, msg);
          } catch (err) {
            // Falha de envio não desfaz o estado: lembrete é melhor-esforço e
            // perder UM lembrete é mais barato que arriscar mandar 2 (spam).
            console.error('[abordagem] envio de lembrete falhou:', (err as Error).message);
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
        const ok = await mudarStatusAbordagem(client, row.id, ['lembrete_enviado'], 'encerrada',
          { desfecho: 'sem_resposta', encerrada_em: agoraIso });
        if (!ok) continue;
        if (deps.dryRun) {
          console.log(`[abordagem] DRY encerrada sem resposta: ${row.id}`);
          continue;
        }
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
          const lead = await getLeadBasico(client, row.lead_id);
          if (!lead?.phone || !row.mensagem_proposta) {
            await atualizarAbordagem(client, row.id, { reagendada_para: null });
            continue;
          }
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
        // Porteiro: marca '[followup feito]' ANTES de mandar (roda 1× só;
        // preserva observação anterior se existir).
        const marca = row.nota_observacao
          ? `${row.nota_observacao} [followup feito]` : '[followup feito]';
        await atualizarAbordagem(client, row.id, { nota_observacao: marca });

        if (pct >= 10) {
          const lead = await getLeadBasico(client, row.lead_id);
          if (!lead?.phone) continue;
          let aberta = false;
          try { aberta = await deps.janela24hAberta(lead.phone); } catch { aberta = false; }
          if (!aberta) continue; // fora da janela: comemorar não vale template
          // Número PRONTO em texto fixo (determinístico > IA pra 1 frase).
          const msg = `Boa notícia, ${primeiroNome(lead.name)}! Depois da limpeza a sua usina está gerando ${pct}% a mais ☀️👏 Valeu a pena o cuidado — qualquer coisa, é só me chamar!`;
          await deps.sendText(lead.phone, msg);
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
        }
        // 0 <= pct < 10: melhora tímida — nada a comemorar, segue marcado.
      } catch (err) {
        console.error('[abordagem] pós-limpeza falhou:', (err as Error).message);
      }
    }
  } catch (err) {
    console.error('[abordagem] ciclo pós-limpeza falhou:', (err as Error).message);
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
