// leads-views.ts
// Views HTML para /dashboard/leads (lista) + a porta da ficha (/leads/:id),
// que desde 28/09 abre a tela de Atendimento (atendimento-views.ts).

import { renderLayout, escapeHtml } from './views.js';
import type { DashUser } from './permissions.js';
import type { LeadRow, LeadDetail } from './leads-queries.js';
import type { ListaConversas, FiltrosConversa, MensagemChat } from './conversas-queries.js';
import { renderAtendimentoPage, type ServicoDoLead, type CompositorInput } from './atendimento-views.js';
import { formatPhoneBR } from '../meta-leadgen.js';
import {
  cabecalhoPagina, faixaKpis, cartaoSecao, tabela, estadoVazio, pilulaStatus, icone,
  botao, chip, chipsFiltro, celulaDupla, paginacao, type Tom,
} from './ui/componentes.js';
import { pilulaEtapa } from './ui/etapas.js';
import { temaDaTela } from './ui/tema.js';
import { ECOSUN_COMPANY_ID } from '../tenant-resolver.js';

function formatPhone(phone: string): string {
  // Normaliza (wa_id BR vem sem o 9o digito) antes de formatar. Ver formatPhoneBR.
  return formatPhoneBR(phone);
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return `${months}mês`;
}

// ---------------------------------------------------------------------------
// Peças da LISTA no padrão cc- (renovação do miolo, R2)
// ---------------------------------------------------------------------------

/** Bolinha de SLA — mesmos textos (title) de antes. */
function slaCc(selo: 'verde' | 'ambar' | 'vermelho'): string {
  const map = {
    verde:    { cls: 'cc-d-ok',   t: 'Tarefas em dia' },
    ambar:    { cls: 'cc-d-warn', t: 'Tarefa vence em breve' },
    vermelho: { cls: 'cc-d-crit', t: 'Tarefa vencida' },
  }[selo] ?? { cls: 'cc-d-ok', t: 'Tarefas em dia' };
  return `<span class="cc-dot ${map.cls}" title="${map.t}" role="img" aria-label="${map.t}"></span>`;
}

/** Situação da assistente no lead: ativa / pausada / o contato pediu para parar. */
function evaCc(active: boolean, optOut: boolean): string {
  if (optOut) return pilulaStatus('sem_dado', 'Parou');
  if (active) return pilulaStatus('normal', 'ativa');
  return pilulaStatus('acompanhar', 'pausada');
}

/** Alerta do lead (silente, respondeu, novo). */
function alertaCc(a: LeadRow['alerta']): string {
  const map: Record<LeadRow['alerta'], [Tom, string]> = {
    silente_sem_cadencia: ['critico', 'Silente sem cadência'],
    silente_com_cadencia: ['atencao', 'Silente em cadência'],
    cliente_respondeu:    ['oportunidade', 'Respondeu'],
    novo:                 ['info', 'Novo'],
    normal:               ['normal', 'Em dia'],
  };
  const [tom, texto] = map[a] ?? map.normal;
  return pilulaStatus(tom, texto);
}

const LOSS_REASON_LABELS: Record<string, string> = {
  nao_atende: 'Não atende',
  concorrente: 'Concorrente',
  sem_orcamento: 'Sem orçamento',
  fora_area: 'Fora da área',
  sem_interesse: 'Sem interesse',
  outro: 'Outro',
};
const CLIENTE_STATUSES_SET = new Set(['contrato_assinado', 'instalado', 'medidor_trocado', 'operando', 'pos_venda_concluido']);

export function renderLeadsListPage(
  rows: LeadRow[],
  filters: {
    status?: string;
    only_alerts?: boolean;
    atencao?: boolean;
    search?: string;
    limit?: number;
    offset?: number;
    total?: number;
    countByStatus?: Record<string, number>;
    atencaoCount?: number;
    insights?: import('./ai-summary.js').Insight[];
  },
  user?: DashUser,
): string {
  const alertasCount = rows.filter((r) => r.alerta === 'silente_sem_cadencia').length;
  const search = filters.search ?? '';
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  const total = filters.total ?? rows.length;
  const counts = filters.countByStatus ?? {};
  const pagina = Math.floor(offset / limit) + 1;
  const totalPaginas = Math.max(1, Math.ceil(total / limit));
  const atencaoCount = filters.atencaoCount ?? 0;
  // Nome da assistente: "Eva" é a da casa; o tenant vê um nome genérico.
  const assistente = user && user.companyId !== ECOSUN_COMPANY_ID ? 'Assistente' : 'Eva';

  // Chips de filtro — MESMOS links de antes (status / only_alerts / atencao + q).
  const comBusca = (href: string) => search
    ? `${href}${href.includes('?') ? '&' : '?'}q=${encodeURIComponent(search)}`
    : href;
  const chipStatus = (statusId: string | null, rotulo: string, valor: number | null) => {
    const ativo = (statusId === null && !filters.status && !filters.only_alerts)
      || (statusId !== null && filters.status === statusId);
    const href = statusId === null ? '/dashboard/leads' : `/dashboard/leads?status=${statusId}`;
    return { rotulo, valor, href: comBusca(href), ativo };
  };
  const chips = chipsFiltro([
    chipStatus(null, 'Todos', counts.todos ?? null),
    { rotulo: 'Alertas', valor: alertasCount, href: comBusca('/dashboard/leads?only_alerts=1'), ativo: !!filters.only_alerts, tom: alertasCount > 0 ? 'warn' : undefined },
    { rotulo: 'Precisam de atenção', valor: atencaoCount, href: comBusca('/dashboard/leads?atencao=1'), ativo: !!filters.atencao, tom: atencaoCount > 0 ? 'warn' : undefined },
    chipStatus('novo', 'Novos', counts.novo ?? null),
    chipStatus('qualificando', 'Qualificando', counts.qualificando ?? null),
    chipStatus('qualificado', 'Qualificados', counts.qualificado ?? null),
    chipStatus('proposta_enviada', 'Proposta enviada', counts.proposta_enviada ?? null),
    chipStatus('negociacao', 'Negociação', counts.negociacao ?? null),
    chipStatus('agendado', 'Agendados', counts.agendado ?? null),
    chipStatus('transferido', 'Transferidos', counts.transferido ?? null),
    chipStatus('ganho', 'Ganho (funil)', counts.ganho ?? null),
    chipStatus('ganhos', 'Ganhos', counts.ganhos ?? null),
    chipStatus('perdidos', 'Perdidos', counts.perdido ?? null),
  ]);

  const qsSemOffset = (extras: Record<string, string | number> = {}): string => {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.only_alerts) params.set('only_alerts', '1');
    if (filters.atencao) params.set('atencao', '1');
    if (search) params.set('q', search);
    for (const [k, v] of Object.entries(extras)) params.set(k, String(v));
    return params.toString();
  };

  // Busca — mesmo GET /dashboard/leads com q (+ status / only_alerts escondidos).
  const busca = `
    <form class="cc-form cc-busca" action="/dashboard/leads" method="get">
      ${filters.status ? `<input type="hidden" name="status" value="${escapeHtml(filters.status)}">` : ''}
      ${filters.only_alerts ? `<input type="hidden" name="only_alerts" value="1">` : ''}
      <input type="text" name="q" value="${escapeHtml(search)}" placeholder="Nome, telefone ou e-mail" aria-label="Buscar lead">
      ${botao({ rotulo: 'Buscar', tipo: 'submit', icone: 'search' })}
      ${search ? `<a class="cc-link" href="${escapeHtml(`/dashboard/leads${filters.status ? `?status=${filters.status}` : ''}`)}">limpar</a>` : ''}
    </form>`;

  const visao = `<div class="cc-chips">${chip({ rotulo: 'Conversas', href: '/dashboard/leads/conversas' })}${chip({ rotulo: 'Lista', href: '/dashboard/leads', ativo: true })}${chip({ rotulo: 'Quadro', href: '/dashboard/leads/kanban' })}</div>`;

  const cabecalho = cabecalhoPagina({
    trilha: [{ rotulo: 'Comercial' }, { rotulo: 'Leads' }],
    titulo: 'Leads',
    subtitulo: `${total} lead(s) no total · mostrando ${rows.length} · ordenado por última atividade`,
    acoesHtml: visao,
  });

  const kpis = faixaKpis([
    { rotulo: 'Leads', valor: total, detalhe: 'no filtro atual' },
    { rotulo: 'Precisam de atenção', valor: atencaoCount, detalhe: 'tarefa vencida' },
    { rotulo: 'Silentes sem cadência', valor: alertasCount, detalhe: 'nesta página' },
    { rotulo: 'Novos', valor: counts.novo ?? null },
    { rotulo: 'Proposta enviada', valor: counts.proposta_enviada ?? null },
    { rotulo: 'Negociação', valor: counts.negociacao ?? null },
  ]);

  const insights = filters.insights ?? [];
  const tomInsight: Record<string, string> = { critical: 'critico', warning: 'atencao', info: 'info' };
  const painelInsights = insights.length === 0 ? '' : cartaoSecao({
    titulo: `${assistente} está observando`,
    corpoHtml: `<div class="cc-evs">${insights.map((i) => `<div class="cc-ev cc-ev-${tomInsight[i.severity] ?? 'info'}"><div class="cc-ev-t">${escapeHtml(`${i.emoji} ${i.text}`)}</div></div>`).join('')}</div>`,
  });

  const avisoAlertas = alertasCount > 0 && !filters.only_alerts
    ? `<div class="cc-aviso cc-aviso-erro" role="status">${icone('alert', 'sm')}<span><strong>${alertasCount} lead(s)</strong> silentes sem cadência agendada. <a class="cc-link" href="/dashboard/leads?only_alerts=1">Ver alertas →</a></span></div>`
    : '';

  const linhas = rows.map((l) => {
    const isGanho = !!l.installation_status && CLIENTE_STATUSES_SET.has(l.installation_status);
    // Ganho: abre a ficha do cliente (/clientes/:id), onde tem todo o histórico.
    const perfilUrl = isGanho ? `/dashboard/clientes/${l.id}` : `/dashboard/leads/${l.id}`;
    const origem = l.acquisition_source
      ? l.acquisition_source.replace('campanha_1_meta_lead_ads', 'Campanha Meta')
      : null;
    const situacao = l.status === 'perdido' && l.loss_reason
      ? `<span class="cc-pill cc-s-crit" title="${escapeHtml(l.loss_notes ?? '')}">${escapeHtml(LOSS_REASON_LABELS[l.loss_reason] ?? l.loss_reason)}</span>`
      : alertaCc(l.alerta);
    return [
      { html: celulaDupla(`${l.name ?? 'Sem nome'}${isGanho ? ' 🏆' : ''}`, formatPhone(l.phone), perfilUrl) },
      { html: slaCc(l.seloSla) },
      { html: situacao },
      { html: pilulaEtapa(l.status) },
      origem,
      { html: evaCc(l.eva_active, l.opt_out) },
      l.has_cadence_pending ? 'sim' : null,
      { html: `<span class="cc-muted" title="${escapeHtml(l.updated_at)}">${escapeHtml(timeAgo(l.updated_at))}</span>` },
    ];
  });

  const tabelaHtml = rows.length === 0
    ? estadoVazio({ tipo: 'vazio', titulo: 'Nenhum lead por aqui', texto: search || filters.status || filters.only_alerts || filters.atencao ? 'Tente outro filtro ou limpe a busca.' : undefined })
    : tabela({
      mobile: 'cartoes',
      colunas: [
        { titulo: 'Lead' }, { titulo: 'SLA' }, { titulo: 'Situação' }, { titulo: 'Etapa' },
        { titulo: 'Origem' }, { titulo: assistente }, { titulo: 'Cadência' }, { titulo: 'Última atividade' },
      ],
      linhas,
    });

  const pag = total > limit ? paginacao({
    pagina, totalPaginas, limite: limit,
    hrefDe: (novoOffset) => `/dashboard/leads?${qsSemOffset({ offset: novoOffset })}`,
    resumo: `Mostrando ${offset + 1}–${Math.min(offset + limit, total)} de ${total}`,
  }) : '';

  const body = `<div class="cc-root cc-leads">
    ${cabecalho}
    ${kpis}
    <div class="cc-leads-gap"></div>
    ${painelInsights}
    ${avisoAlertas}
    ${cartaoSecao({ titulo: 'Leads', dica: 'Filtre por etapa ou busque por nome', acoesHtml: busca, corpoHtml: `${chips}<div class="cc-leads-gap"></div>${tabelaHtml}${pag}` })}
  </div>`;
  return renderLayout({ active: 'leads', title: 'Leads', body, user, tailwind: false, dark: temaDaTela(user, 'claro') === 'escuro', largo: true, cabeca: `<style>
    .cc-leads .cc-leads-gap{height:16px}
    .cc-leads .cc-panel+.cc-panel,.cc-leads .cc-aviso+.cc-panel,.cc-leads .cc-panel+.cc-aviso{margin-top:16px}
    .cc-leads .cc-busca{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .cc-leads .cc-busca input[name=q]{width:260px}
    @media (max-width:760px){ .cc-leads .cc-busca{width:100%} .cc-leads .cc-busca input[name=q]{flex:1;width:auto;min-width:0} }
  </style>` });
}

// ---------------------------------------------------------------------------
// Ficha do lead → tela de ATENDIMENTO (28/09/2026, decisão do Junior)
// ---------------------------------------------------------------------------
// A ficha refeita no R3 foi SUBSTITUÍDA pela tela de 3 colunas (conversas |
// chat | cockpit) em atendimento-views.ts. /dashboard/leads/:id continua o
// mesmo endereço e os mesmos formulários POST — só muda a tela.
// Saíram por decisão do Junior: o Copiloto IA (bloco + fetch /ia-copiloto — a
// ROTA no servidor continua), o quadro "IA Assistente" e a faixa de números.
// `conversa` (histórico do copiloto), `docsResultado` e `envioResultado`
// ficam na assinatura só por compatibilidade com quem chama.
export function renderLeadDetailPage(
  lead: LeadDetail,
  conversa: { role: 'user' | 'assistant'; conteudo: string }[] = [],
  docsResultado = '',
  envioResultado = '',
  // [Diário de Serviços F1] registros de campo do cliente (visita, instalação…)
  servicos: ServicoDoLead[] = [],
  // R0: quem está vendo — sem ele o tenant via o menu e o rodapé da EcoSun.
  user: DashUser | undefined,
  // Atendimento: a lista de conversas (coluna 1) e o chat completo do lead.
  extras: { lista?: ListaConversas; filtros?: FiltrosConversa; mensagens?: MensagemChat[]; envio?: CompositorInput; donoPessoal?: string | null } = {},
): string {
  void conversa; void docsResultado; void envioResultado;
  return renderAtendimentoPage({
    user,
    lead,
    lista: extras.lista ?? { itens: [], contagem: { todas: 0, aguardando: 0, meus: 0, porEtapa: {} } },
    filtros: extras.filtros ?? {},
    mensagens: extras.mensagens,
    servicos,
    envio: extras.envio,
    donoPessoal: extras.donoPessoal,
  });
}
