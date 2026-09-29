// Telas RENOVADAS (padrão cc-, sem Tailwind) renderizadas com dados FICTÍCIOS
// em volume configurável — usadas pelo teste "telas leves" (perf/telas-leves,
// 28/09/2026) e pelo medidor de render com Chrome headless
// (scripts/medir-telas-leves.ts). Nomes inventados — nunca dado real.
import { renderLeadsListPage, renderLeadDetailPage } from '../../src/modules/dashboard/leads-views.js';
import { renderKanbanPage } from '../../src/modules/dashboard/kanban-views.js';
import { renderAtendimentoPage } from '../../src/modules/dashboard/atendimento-views.js';
import { renderCommandCenterPage, renderCentralAtencaoPage, renderModoTvPage } from '../../src/modules/dashboard/command-center-views.js';
import { resumirFrota, type UsinaLinha } from '../../src/modules/dashboard/command-center-calc.js';
import { ROTULO_FONTE, TODAS_PERMISSOES, type DadosCommandCenter, type FonteAviso } from '../../src/modules/dashboard/command-center-queries.js';
import type { EventoAtencao } from '../../src/modules/dashboard/central-atencao.js';
import { ORDEM_ETAPAS } from '../../src/modules/dashboard/pipeline.js';
import type { DashUser } from '../../src/modules/dashboard/permissions.js';
import { renderMonitoramentoPage } from '../../src/modules/dashboard/views.js';
import { CASOS_USINA } from './casos-usina.js';
import { FIN_CHEIO } from './casos-financeiro.js';
import { CASOS_DEMONSTRATIVOS } from './casos-demonstrativos.js';
import { CASOS_PASTAS } from './casos-pastas.js';
import { renderFinanceiroPage } from '../../src/modules/dashboard/financeiro-views.js';
import { usina, ALERTAS_RESUMO, SPARK_7D, KPIS_EVA } from './casos-monitoramento.js';
import { telasOnda3 } from './telas-onda3.js';
import { telasCobranca } from './telas-cobranca.js';
import { USER_CASA, leadRow, leadDetalhe, SERVICOS_LEAD, FILTROS_CHEIOS } from './miolo-leads.js';

const hora = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
const uuid = (i: number) => `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`;
const ETAPAS = ['novo', 'qualificando', 'qualificado', 'proposta_enviada', 'negociacao', 'agendado', 'ganho', 'perdido'];
const SLA = ['verde', 'ambar', 'vermelho'] as const;

/** n linhas da lista de Leads. */
export function linhasLeads(n: number): any[] {
  return Array.from({ length: n }, (_, i) => leadRow({
    id: uuid(i), name: `Lead Fictício ${i}`, phone: `55619${String(10000000 + i)}`,
    status: ETAPAS[i % ETAPAS.length], seloSla: SLA[i % 3],
    alerta: i % 5 === 0 ? 'silente_sem_cadencia' : i % 7 === 0 ? 'novo' : 'normal',
    eva_active: i % 2 === 0, has_cadence_pending: i % 3 === 0, updated_at: hora(i),
  }));
}

/** Quadro de Vendas com n cartões espalhados pelas etapas (1/3 com SLA vermelho). */
export function gruposQuadro(n: number): Record<string, any[]> {
  const g: Record<string, any[]> = {};
  for (let i = 0; i < n; i++) {
    const etapa = ORDEM_ETAPAS[i % ORDEM_ETAPAS.length];
    (g[etapa] ??= []).push({ id: uuid(i), name: `Lead Fictício ${i}`, phone: '5561999990000', status: etapa, claimed_by: null, updated_at: hora(i), seloSla: SLA[i % 3] });
  }
  return g;
}

/** Lista de conversas (coluna 1 do Atendimento) com n itens. */
export function listaConversas(n: number): any {
  return {
    itens: Array.from({ length: n }, (_, i) => ({
      leadId: uuid(i), nome: `Lead Fictício ${i}`, telefone: `55619${String(10000000 + i)}`, etapa: ETAPAS[i % ETAPAS.length],
      cidade: 'Cidade Exemplo', evaAtiva: i % 2 === 0, optOut: false, dono: null, ultimaEm: hora(i),
      ultimaTexto: 'Mensagem de exemplo com um texto de tamanho normal pra lista.', ultimaDe: i % 2 ? 'cliente' : 'assistente',
      aguardandoResposta: i % 2 === 1, canal: null,
    })),
    contagem: { todas: n, aguardando: Math.floor(n / 2), meus: 0, porEtapa: {} },
  };
}

function mensagens(n: number) {
  return Array.from({ length: n }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `Mensagem fictícia número ${i} da conversa.`, timestamp: hora(n - i) }));
}

function dadosCC(n: number): DadosCommandCenter {
  const agora = new Date();
  const usinas: UsinaLinha[] = Array.from({ length: Math.max(2, n) }, (_, i) => ({
    id: `u${i}`, apelido: `Usina ${i}`, potencia_kwp: 10, cidade: 'Gama', uf: 'DF', ativo: true,
    ultima_sincronizacao: hora(0.2), ultimo_erro: i % 9 === 0 ? 'token expirado' : null, status_inversor: 'ok', acompanhamento: 'api',
  }));
  const frota = resumirFrota(usinas, [], [], { agora, corteAtencao: 0.7 });
  const sev = ['critico', 'atencao', 'acompanhar', 'oportunidade', 'info'] as const;
  const areas = ['usinas', 'comercial', 'clientes', 'financeiro'] as const;
  const eventos: EventoAtencao[] = Array.from({ length: n }, (_, i) => ({
    id: `ev:${i}`, severidade: sev[i % sev.length], area: areas[i % areas.length], titulo: `Aviso fictício ${i}`,
    contexto: 'Comercial', acao: { rotulo: 'Ver', href: '/dashboard/propostas' },
  }));
  const fontes: FonteAviso[] = (Object.keys(ROTULO_FONTE) as Array<keyof typeof ROTULO_FONTE>)
    .map((id) => ({ id, rotulo: ROTULO_FONTE[id], estado: 'ok' as const }));
  return {
    agora, permissoes: { ...TODAS_PERMISSOES }, contratados: { ...TODAS_PERMISSOES }, frota, telemetriaCortada: false,
    kpisMes: { leads: 212, propostas: 47, vendas: 9, usinasNovas: 3 }, mudancas24h: { leads: 14, propostas: 2, vendas: 1 },
    recebidoMes: 3500, manutencao: { vencidas: 2, proximas30: 5 }, eventos, fontes,
  };
}

export type NomeTela = 'command-center' | 'central-atencao' | 'modo-tv' | 'leads' | 'quadro-vendas' | 'conversas' | 'ficha'
  | 'monitoramento' | 'usina' | 'usina-dados' | 'usina-editar' | 'usina-importar' | 'financeiro'
  | 'gd-lista' | 'gd-cliente' | 'gd-conferencia' | 'gd-digitar' | 'gd-confirmar'
  | 'pastas' | 'pasta-editor' | 'pasta-previa';

const NIVEIS = ['urgente', 'aviso', 'info', 'ok', 'ok', 'ok'] as const;

/** n usinas da frota, em todos os estados. */
export function frota(n: number): any[] {
  return Array.from({ length: n }, (_, i) => usina(i, {
    apelido: `Usina Fictícia ${i}`, nivel: NIVEIS[i % NIVEIS.length], ativo: i % 17 !== 16,
    alertaTexto: i % 6 < 2 ? 'Alerta fictício de geração.' : null,
    ultima_sincronizacao: i % 9 === 8 ? null : new Date().toISOString(),
  }));
}

/** Todas as telas renovadas, com n linhas/cartões/itens cada. */
export function telasRenovadas(n: number, user: DashUser = USER_CASA): Record<NomeTela, string> & Record<string, string> {
  const lead = leadDetalhe({ conversation_messages: mensagens(Math.min(n, 120)) });
  const casa = user.companyId === USER_CASA.companyId;
  return {
    'command-center': renderCommandCenterPage({ agora: new Date(), nomeUsuario: user.nome, dados: dadosCC(n) }, user),
    'central-atencao': renderCentralAtencaoPage({ agora: new Date(), dados: dadosCC(n), filtro: {} }, user),
    'modo-tv': renderModoTvPage(user),
    leads: renderLeadsListPage(linhasLeads(n), { ...FILTROS_CHEIOS, status: undefined, search: '', limit: n, offset: 0, total: n * 3 }, user),
    'quadro-vendas': renderKanbanPage(gruposQuadro(n) as any, user),
    conversas: renderAtendimentoPage({ user, lista: listaConversas(n), filtros: {}, lead: null }),
    ficha: renderLeadDetailPage(lead, [], '', '', SERVICOS_LEAD, user, { lista: listaConversas(n), filtros: {} }),
    usina: casa ? CASOS_USINA['detalhe-mes']() : CASOS_USINA['detalhe-tenant'](),
    'usina-dados': CASOS_USINA.dados(),
    'usina-editar': casa ? CASOS_USINA.editar() : CASOS_USINA['editar-sem-dono'](),
    'usina-importar': casa ? CASOS_USINA['importar-sucesso']() : CASOS_USINA['importar-tenant'](),
    financeiro: renderFinanceiroPage(FIN_CHEIO, user),
    pastas: casa ? CASOS_PASTAS.lista() : CASOS_PASTAS['lista-tenant'](),
    'pasta-editor': casa ? CASOS_PASTAS['editor-rascunho']() : CASOS_PASTAS['editor-tenant'](),
    'pasta-previa': CASOS_PASTAS.preview(),
    'gd-lista': casa ? CASOS_DEMONSTRATIVOS.lista() : CASOS_DEMONSTRATIVOS['lista-tenant'](),
    'gd-cliente': casa ? CASOS_DEMONSTRATIVOS['cliente-sem-cliente']() : CASOS_DEMONSTRATIVOS['cliente-tenant'](),
    'gd-conferencia': CASOS_DEMONSTRATIVOS.conferencia(),
    'gd-digitar': CASOS_DEMONSTRATIVOS['digitar-erro'](),
    'gd-confirmar': casa ? CASOS_DEMONSTRATIVOS['confirmar-reenviar']() : CASOS_DEMONSTRATIVOS['confirmar-periodo'](),
    monitoramento: renderMonitoramentoPage(frota(n), {}, casa ? ALERTAS_RESUMO : undefined, casa ? SPARK_7D : undefined, casa ? KPIS_EVA : undefined, user),
    // Onda 3 (R13–R19): cada fatia tem o seu arquivo tests/fixtures/telas-rNN.ts
    ...telasOnda3(n, user),
    // Cobrança recorrente (28/09/2026): Assinaturas (casa) + Minha assinatura com faturas (tenant)
    ...telasCobranca(n, user),
  };
}
