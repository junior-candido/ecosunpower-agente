// leads-views.ts
// Views HTML para /dashboard/leads (lista + detalhe).

import { renderLayout, escapeHtml } from './views.js';
import type { DashUser } from './permissions.js';
import type { LeadRow, LeadDetail } from './leads-queries.js';
import type { Atividade } from './atividades.js';
import type { Tarefa } from './tarefas.js';
import { seloSla } from './sla-rules.js';
import { formatPhoneBR } from '../meta-leadgen.js';
import {
  cabecalhoPagina, faixaKpis, cartaoSecao, tabela, estadoVazio, pilulaStatus, icone,
  botao, chip, chipsFiltro, celulaDupla, paginacao, pontoStatus, menuAcoes, aviso, linhaLista, type Tom,
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

  const visao = `<div class="cc-chips">${chip({ rotulo: 'Lista', href: '/dashboard/leads', ativo: true })}${chip({ rotulo: 'Kanban', href: '/dashboard/leads/kanban' })}</div>`;

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
  </div>
  <style>
    .cc-leads .cc-leads-gap{height:16px}
    .cc-leads .cc-panel+.cc-panel,.cc-leads .cc-aviso+.cc-panel,.cc-leads .cc-panel+.cc-aviso{margin-top:16px}
    .cc-leads .cc-busca{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .cc-leads .cc-busca input[name=q]{width:260px}
    @media (max-width:760px){ .cc-leads .cc-busca{width:100%} .cc-leads .cc-busca input[name=q]{flex:1;width:auto;min-width:0} }
  </style>`;
  return renderLayout({ active: 'leads', title: 'Leads', body, user, dark: temaDaTela(user, 'claro') === 'escuro', largo: true });
}

function renderAnexoCard(a: {
  tipo: string; descricao: string | null; url: string;
  mime_type: string | null; created_by: string; created_at: string;
}): string {
  const mime = (a.mime_type ?? '').toLowerCase();
  const tipoLabel = a.tipo === 'conta_luz' ? 'Conta de luz'
    : a.tipo === 'recebido_cliente' ? 'Enviado pelo cliente'
    : a.tipo;
  const quando = a.created_at
    ? new Date(a.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '';
  const origem = a.created_by === 'cliente'
    ? '<span class="cc-pill cc-s-ok">cliente</span>'
    : `<span class="cc-faint">${escapeHtml(a.created_by)}</span>`;

  const url = escapeHtml(a.url);
  let preview: string;
  if (!a.url) {
    preview = '<div class="cc-anx-prev">indisponível</div>';
  } else if (mime.startsWith('image/')) {
    preview = `<a href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="${escapeHtml(tipoLabel)}" class="cc-anx-img"></a>`;
  } else if (mime.includes('pdf')) {
    preview = `<a href="${url}" target="_blank" rel="noopener" class="cc-anx-prev cc-anx-pdf">${icone('file')}<span>Abrir PDF</span></a>`;
  } else if (mime.startsWith('video/')) {
    preview = `<a href="${url}" target="_blank" rel="noopener" class="cc-anx-prev">${icone('eye')}<span>Ver vídeo</span></a>`;
  } else if (mime.startsWith('audio/')) {
    preview = `<div class="cc-anx-prev"><audio controls src="${url}"></audio></div>`;
  } else {
    preview = `<a href="${url}" target="_blank" rel="noopener" class="cc-anx-prev">${icone('ext')}<span>Abrir arquivo</span></a>`;
  }

  return `<div class="cc-anx">
    ${preview}
    <div class="cc-anx-l"><span class="cc-anx-t" title="${escapeHtml(a.descricao ?? '')}">${escapeHtml(tipoLabel)}</span>${origem}</div>
    <div class="cc-anx-q">${escapeHtml(quando)}</div>
  </div>`;
}

const TIPO_ICONE: Record<string, string> = {
  proposta_enviada: '📤',
  proposta_aberta:  '👀',
  etapa_mudou:      '➡️',
  ganho:            '🏆',
  perdido:          '❌',
  cadencia:         '🔄',
  nota:             '📝',
  ligacao:          '📞',
  whatsapp:         '💬',
  visita:           '📍',
  contato:          '🤝',
  email:            '📧',
  tarefa_criada:    '📋',
  tarefa_concluida: '✅',
};

function renderTimeline(timeline: Atividade[]): string {
  if (timeline.length === 0) {
    return cartaoSecao({ titulo: 'Linha do tempo', corpoHtml: estadoVazio({ tipo: 'vazio', titulo: 'Sem atividades ainda.', compacto: true }) });
  }
  const itens = timeline.map((a) => {
    const ic = TIPO_ICONE[a.tipo] ?? '•';
    const autor = a.automatica ? 'Sistema' : 'Vendedor';
    return `<li class="cc-tl-i"><span class="cc-tl-ic" aria-hidden="true">${ic}</span><div class="cc-tl-txt">
        <strong>${escapeHtml(a.titulo)}</strong>
        ${a.descricao ? `<span>${escapeHtml(a.descricao)}</span>` : ''}
        <small>${escapeHtml(autor)} · ${escapeHtml(timeAgo(a.created_at))}</small>
      </div></li>`;
  }).join('');
  return cartaoSecao({ titulo: 'Linha do tempo', corpoHtml: `<ul class="cc-tl">${itens}</ul>` });
}

const PRIORIDADE_TOM: Record<string, Tom> = { alta: 'critico', media: 'atencao', baixa: 'sem_dado' };

// Prazo formatado + relativo ("vence em X" / "venceu há X").
function fmtPrazo(due_at: string | null): string {
  if (!due_at) return 'sem prazo';
  const data = new Date(due_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const diff = Date.parse(due_at) - Date.now();
  const abs = Math.abs(diff);
  const mins = Math.floor(abs / 60000);
  let rel: string;
  if (mins < 60) rel = `${mins}min`;
  else if (mins < 1440) rel = `${Math.floor(mins / 60)}h`;
  else rel = `${Math.floor(mins / 1440)}d`;
  return diff >= 0 ? `${data} · vence em ${rel}` : `${data} · venceu há ${rel}`;
}

const SLA_TOM: Record<'verde' | 'ambar' | 'vermelho', Tom> = { verde: 'normal', ambar: 'atencao', vermelho: 'critico' };

function renderTarefas(leadId: string, tarefas: Tarefa[]): string {
  const agora = Date.now();
  const novaTarefaForm = `
    <form class="cc-form cc-f-linha" method="POST" action="/dashboard/leads/${leadId}/tarefa">
      <label class="cc-campo cc-f-cresce"><span>Nova tarefa</span>
        <input type="text" name="titulo" required placeholder="Ex: Ligar pra confirmar visita"></label>
      <label class="cc-campo"><span>Prazo</span>
        <input type="datetime-local" name="due_at"></label>
      <label class="cc-campo"><span>Prioridade</span>
        <select name="prioridade">
          <option value="media">Média</option>
          <option value="alta">Alta</option>
          <option value="baixa">Baixa</option>
        </select></label>
      <button type="submit" class="cc-btn">${icone('plus', 'sm')}Criar</button>
    </form>`;

  const atividadeForm = `
    <form class="cc-form cc-f-linha cc-f-topo" method="POST" action="/dashboard/leads/${leadId}/atividade">
      <label class="cc-campo"><span>Registrar</span>
        <select name="tipo">
          <option value="ligacao">📞 Ligação</option>
          <option value="nota">📝 Nota</option>
        </select></label>
      <label class="cc-campo cc-f-cresce"><span>O que rolou</span>
        <input type="text" name="descricao" placeholder="Ex: cliente pediu pra ligar depois das 18h"></label>
      <button type="submit" class="cc-btn">Registrar contato</button>
    </form>`;

  const lista = tarefas.length === 0
    ? estadoVazio({ tipo: 'vazio', titulo: 'Nenhuma tarefa pendente.', compacto: true })
    : `<ul class="cc-tarefas">${tarefas.map((t) => {
        const selo = seloSla([t], agora);
        return `
          <li class="cc-tarefa">
            ${pontoStatus(SLA_TOM[selo] ?? 'normal')}
            <div class="cc-tarefa-txt">
              <strong>${escapeHtml(t.titulo)}</strong>
              <span>${escapeHtml(fmtPrazo(t.due_at))} ${pilulaStatus(PRIORIDADE_TOM[t.prioridade] ?? 'atencao', t.prioridade)}${t.automatica ? ' <em class="cc-faint">automática</em>' : ''}</span>
            </div>
            <div class="cc-tarefa-acoes">
              <form method="POST" action="/dashboard/leads/${leadId}/tarefa/${t.id}/concluir">
                <button type="submit" class="cc-btn cc-btn-sm">${icone('check', 'xs')}Concluir</button>
              </form>
              <form method="POST" action="/dashboard/leads/${leadId}/tarefa/${t.id}/adiar">
                <button type="submit" class="cc-btn cc-btn-sm cc-btn-ghost">Adiar 2d</button>
              </form>
            </div>
          </li>`;
      }).join('')}</ul>`;

  return cartaoSecao({
    titulo: 'Tarefas', id: 'tarefas',
    dica: tarefas.length ? `${tarefas.length} pendente(s)` : undefined,
    corpoHtml: `${novaTarefaForm}${lista}${atividadeForm}`,
  });
}

// Uma bolha de mensagem do copiloto IA. A resposta da IA ganha botão "Copiar".
// (Estrutura igual à de antes: o script copia o 1º nó de texto da bolha.)
function renderMsgCopiloto(m: { role: 'user' | 'assistant'; conteudo: string }): string {
  if (m.role === 'user') {
    return `<div class="cc-msg cc-msg-eu">${escapeHtml(m.conteudo)}</div>`;
  }
  return `<div class="cc-msg cc-msg-ia">${escapeHtml(m.conteudo)}<div class="cc-msg-bar"><button type="button" onclick="ia_copiarTexto(this)" class="cc-link">📋 Copiar</button></div></div>`;
}

// (docsBanner / envioBanner / docEnvioBtn removidos 15/07: o contrato saiu da ficha
//  do lead e mora na Central de Contratos — essas telas de doc não vivem mais aqui.)

const LOSS_REASON_LONGO: Record<string, string> = {
  nao_atende: 'Não atende mais (sumiu)',
  concorrente: 'Fechou com concorrente',
  sem_orcamento: 'Sem orçamento / momento',
  fora_area: 'Fora da área de atuação',
  sem_interesse: 'Sem interesse no produto',
  outro: 'Outro',
};

export function renderLeadDetailPage(
  lead: LeadDetail,
  conversa: { role: 'user' | 'assistant'; conteudo: string }[] = [],
  docsResultado = '',
  envioResultado = '',
  // [Diário de Serviços F1] registros de campo do cliente (visita, instalação…)
  servicos: { id: string; tipoNome: string; dataServico: string; fotos: number; videos: number }[] = [],
  // R0: quem está vendo — sem ele o tenant via o menu e o rodapé da EcoSun.
  user: DashUser | undefined,
): string {
  void docsResultado; void envioResultado; // contrato saiu da ficha (15/07); parâmetros mantidos
  const phoneFmt = formatPhone(lead.phone);
  const nome = escapeHtml(lead.name ?? 'Sem nome');
  // Nome da assistente: "Eva" é a da casa; o tenant vê um nome genérico.
  const ehTenant = !!user && user.companyId !== ECOSUN_COMPANY_ID;
  const assistente = ehTenant ? 'Assistente' : 'Eva';
  const assistenteMin = ehTenant ? 'assistente' : 'Eva';
  const perdido = (lead as any).status === 'perdido';

  // ---- Conversa em balões (cliente à esquerda, assistente à direita) ----
  const messagesHtml = lead.conversation_messages.length === 0
    ? estadoVazio({ tipo: 'vazio', titulo: 'Nenhuma mensagem ainda.', compacto: true })
    : `<div class="cc-conversa">${lead.conversation_messages
        .map((m) => {
          const isEva = m.role === 'assistant';
          const label = isEva ? assistente : (lead.name ?? 'Cliente');
          const ts = m.timestamp ? new Date(m.timestamp).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '';
          return `<div class="cc-balao ${isEva ? 'cc-balao-eva' : 'cc-balao-cli'}">
              <div class="cc-balao-q">${escapeHtml(label)}</div>
              <div class="cc-balao-t">${escapeHtml(m.content)}</div>
              <div class="cc-balao-h">${escapeHtml(ts)}</div>
            </div>`;
        })
        .join('')}</div>`;

  // Status do toque em português claro (a tabela vem do banco em inglês).
  const LABEL_TOQUE: Record<string, [Tom, string]> = {
    sent: ['normal', 'Enviado'], pending: ['atencao', 'Agendado'], failed: ['critico', 'Falhou'],
    cancelled: ['sem_dado', 'Cancelado'], canceled: ['sem_dado', 'Cancelado'], skipped: ['sem_dado', 'Pulado'],
  };
  const cadenceHtml = lead.cadence_steps.length === 0
    ? estadoVazio({ tipo: 'vazio', titulo: 'Nenhuma cadência agendada.', compacto: true })
    : `<p class="cc-hint cc-ficha-nota">Lembretes automáticos, espaçados, até o cliente responder.</p>
      <ul class="cc-cadencia">${lead.cadence_steps
        .map((c) => {
          const when = new Date(c.scheduled_for).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
          const [tom, rotulo] = LABEL_TOQUE[c.status] ?? ['sem_dado', c.status];
          return `<li><span>Toque ${escapeHtml(String(c.step))}</span>${pilulaStatus(tom, rotulo)}<span class="cc-muted">${escapeHtml(when)}</span></li>`;
        })
        .join('')}</ul>`;

  // Já é venda? (não mostra "Fechou!" de novo — mostra que já registrou)
  const jaVenda = ['contrato_assinado', 'instalado', 'medidor_trocado', 'operando', 'pos_venda_concluido']
    .includes(String((lead as any).installation_status ?? ''));
  const dataVenda = (lead as any).contract_signed_at
    ? new Date((lead as any).contract_signed_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    : '';
  const hojeStr = new Date().toISOString().slice(0, 10);

  // ---- Ações à vista (no celular viram barra fixa embaixo) ----
  const formEva = lead.eva_active
    ? `<form method="POST" action="/dashboard/leads/${lead.id}/pause-eva">
        <button type="submit" class="cc-btn">Pausar ${escapeHtml(assistenteMin)}</button>
      </form>`
    : `<form method="POST" action="/dashboard/leads/${lead.id}/resume-eva">
        <button type="submit" class="cc-btn">Retomar ${escapeHtml(assistenteMin)}</button>
      </form>`;

  // ---- "⋯ Mais ações": os MESMOS forms de antes, só mudaram de lugar ----
  const itensMais = [
    !lead.has_cadence_pending && !lead.opt_out
      ? `<form method="POST" action="/dashboard/leads/${lead.id}/start-cadence">
          <button type="submit" class="cc-btn">📅 Iniciar cadência</button>
        </form>`
      : '',
    lead.has_cadence_pending
      ? `<form method="POST" action="/dashboard/leads/${lead.id}/cancel-cadence" onsubmit="return confirm('Cancelar todos os toques pendentes?')">
          <button type="submit" class="cc-btn">Cancelar cadência</button>
        </form>`
      : '',
    !lead.opt_out
      ? `<form method="POST" action="/dashboard/leads/${lead.id}/opt-out" onsubmit="return confirm('Marcar que esse contato pediu pra parar? A Eva nunca mais conversa com ele.')">
          <button type="submit" class="cc-btn">🚪 Pediu pra parar</button>
        </form>`
      : `<form method="POST" action="/dashboard/leads/${lead.id}/opt-in">
          <button type="submit" class="cc-btn">↩️ Voltar a receber</button>
        </form>`,
    // No celular a "Nova proposta" sai da barra fixa e aparece aqui.
    `<a class="cc-btn cc-so-cel" href="/dashboard/propostas/novo?lead_id=${lead.id}">📄 Nova proposta</a>`,
    botao({ rotulo: '🔄 Atualizar', href: `/dashboard/leads/${lead.id}` }),
    botao({ rotulo: '🔍 Abrir cockpit completo', href: `/dashboard/clientes/${lead.id}` }),
    botao({ rotulo: '📄 Fazer contrato', href: `/dashboard/leads/${lead.id}/contrato-form?tipo=fv` }),
    '<div class="cc-mais-sep"></div>',
    perdido
      ? `<form method="POST" action="/dashboard/leads/${lead.id}/unmark-lost" onsubmit="return confirm('Reverter status de Perdido para Qualificando?')">
          <button type="submit" class="cc-btn">↩️ Reabrir lead</button>
        </form>`
      : `<button type="button" onclick="document.getElementById('modal-marcar-perdido').classList.remove('hidden')" class="cc-btn">❌ Marcar perdido</button>`,
    lead.archived_at
      ? `<form method="POST" action="/dashboard/leads/${lead.id}/desarquivar">
          <button type="submit" class="cc-btn">↩️ Restaurar lead</button>
        </form>`
      : `<form method="POST" action="/dashboard/leads/${lead.id}/arquivar" onsubmit="return confirm('Arquivar este lead? Sai da lista ativa, mas o historico fica intacto e da pra restaurar a qualquer hora.')">
          <button type="submit" class="cc-btn">📦 Arquivar</button>
        </form>`,
    `<form method="POST" action="/dashboard/leads/${lead.id}/delete" onsubmit="return confirm('REMOVER PERMANENTEMENTE este lead? Esta acao nao pode ser desfeita.')">
      <button type="submit" class="cc-btn cc-btn-crit">🗑️ Remover lead permanentemente</button>
    </form>`,
  ].filter(Boolean).join('');

  const acoesAVista = `<div class="cc-lead-acoes">
      ${jaVenda ? '' : `<a class="cc-btn cc-so-cel" href="#venda">Fechou!</a>`}
      ${formEva}
      ${botao({ rotulo: 'Nova tarefa', href: '#tarefas', icone: 'plus' })}
      ${botao({ rotulo: 'Nova proposta', href: `/dashboard/propostas/novo?lead_id=${lead.id}`, icone: 'file' })}
      ${menuAcoes({ itensHtml: itensMais, alinhar: 'dir' })}
    </div><!-- /acoes -->`;

  // ---- Venda: fechar + atalho do contrato + nome ----
  const vendaCorpo = `
    ${jaVenda
      ? aviso({ tom: 'ok', texto: `Venda registrada${dataVenda ? ` em ${dataVenda}` : ''}.` })
      : `<form class="cc-form cc-f-linha" method="POST" action="/dashboard/leads/${lead.id}/fechou">
          <label class="cc-campo"><span>Tipo</span>
            <select name="tipo">
              <option value="sistema">🔆 Sistema</option>
              <option value="servico">🔧 Serviço</option>
            </select></label>
          <label class="cc-campo"><span>Valor (R$)</span>
            <input name="valor" type="number" step="0.01" min="0" placeholder="opcional"></label>
          <label class="cc-campo"><span>Data</span>
            <input name="data" type="date" value="${hojeStr}"></label>
          <button type="submit" class="cc-btn cc-btn-gold">Fechou! (registrar venda)</button>
        </form>`}
    <p class="cc-hint cc-ficha-nota">${icone('file', 'xs')} O contrato é feito na Central (ler conta + CNH, preencher, gerar, enviar): use <a class="cc-link" href="/dashboard/leads/${lead.id}/contrato-form?tipo=fv">Fazer contrato →</a></p>
    <form class="cc-form cc-f-linha cc-f-topo" method="POST" action="/dashboard/leads/${lead.id}/edit-name">
      <label class="cc-campo cc-f-cresce"><span>Nome do cliente</span>
        <input type="text" name="name" value="${escapeHtml(lead.name ?? '')}" placeholder="Nome do cliente"></label>
      <button type="submit" class="cc-btn">Salvar nome</button>
    </form>`;

  // ---- Copiloto IA conversacional (histórico salvo por lead) ----
  const copiloto = `
    <div class="cc-row cc-row-wrap cc-copiloto-atalhos">
      <button type="button" class="cc-btn cc-btn-sm" onclick="mandarCopiloto('${lead.id}', 'Explique a economia desse cliente de um jeito simples que ele entenda.')">🔢 Explicar economia</button>
      <button type="button" class="cc-btn cc-btn-sm" onclick="mandarCopiloto('${lead.id}', 'Gere uma mensagem de follow-up curta pra esse lead, no tom do WhatsApp.')">✍️ Gerar mensagem</button>
    </div>
    <div id="ia-chat" class="cc-ia-chat">
      ${conversa.map(renderMsgCopiloto).join('')}
    </div>
    <div class="cc-form cc-f-linha">
      <input id="ia-pergunta" type="text" class="cc-f-cresce" placeholder="Pergunte algo ou peça uma mensagem… (Enter envia)" aria-label="Pergunta para o copiloto"
        onkeydown="if(event.key==='Enter'){event.preventDefault();mandarCopiloto('${lead.id}', this.value); this.value='';}">
      <button type="button" class="cc-btn" onclick="var i=document.getElementById('ia-pergunta');mandarCopiloto('${lead.id}', i.value); i.value='';">Enviar</button>
    </div>`;

  // Modal de marcar perdido (escondido por padrão; a classe "hidden" é a de sempre)
  const modalMarcarPerdido = perdido ? '' : `
    <div id="modal-marcar-perdido" class="cc-modal hidden" onclick="if(event.target===this)this.classList.add('hidden')">
      <div class="cc-modal-caixa" role="dialog" aria-modal="true" aria-labelledby="modal-perdido-t">
        <div class="cc-row">
          <div class="cc-sp">
            <h3 id="modal-perdido-t">Marcar lead como perdido</h3>
            <p class="cc-hint">Lead sai do funil ativo. ${escapeHtml(assistente)} é pausada. Reversível.</p>
          </div>
          <button type="button" onclick="document.getElementById('modal-marcar-perdido').classList.add('hidden')" class="cc-ibtn" aria-label="Fechar">×</button>
        </div>
        <form class="cc-form cc-f-coluna" method="POST" action="/dashboard/leads/${lead.id}/mark-lost">
          <label class="cc-campo"><span>Motivo *</span>
            <select name="reason" required>
              <option value="">Selecione...</option>
              <option value="nao_atende">Não atende mais (sumiu)</option>
              <option value="concorrente">Fechou com concorrente</option>
              <option value="sem_orcamento">Sem orçamento / momento</option>
              <option value="fora_area">Fora da área de atuação</option>
              <option value="sem_interesse">Sem interesse no produto</option>
              <option value="outro">Outro (descreva abaixo)</option>
            </select></label>
          <label class="cc-campo"><span>Observação (opcional)</span>
            <textarea name="notes" rows="3" placeholder="Ex: cliente recebeu proposta da Solfácil 15% mais barata"></textarea></label>
          <div class="cc-row cc-modal-bot">
            <span class="cc-sp"></span>
            <button type="button" onclick="document.getElementById('modal-marcar-perdido').classList.add('hidden')" class="cc-btn cc-btn-ghost">Cancelar</button>
            <button type="submit" class="cc-btn cc-btn-crit">Confirmar perda</button>
          </div>
        </form>
      </div>
    </div>`;

  const perdidoBanner = perdido && (lead as any).loss_reason
    ? `<div class="cc-aviso cc-aviso-erro" role="status">${icone('alert', 'sm')}<div>
        <strong>Lead marcado como perdido</strong> — Motivo: ${escapeHtml(LOSS_REASON_LONGO[(lead as any).loss_reason] ?? (lead as any).loss_reason)}
        ${(lead as any).loss_notes ? `<div class="cc-muted">"${escapeHtml((lead as any).loss_notes)}"</div>` : ''}
        ${(lead as any).lost_at ? `<div class="cc-faint">${escapeHtml(new Date((lead as any).lost_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }))}</div>` : ''}
      </div></div>`
    : '';

  const selos = `${pilulaEtapa(lead.status)} ${lead.opt_out
    ? pilulaStatus('sem_dado', `${assistente}: parou`)
    : lead.eva_active ? pilulaStatus('normal', `${assistente} ativa`) : pilulaStatus('acompanhar', `${assistente} pausada`)}${lead.archived_at ? ` ${pilulaStatus('sem_dado', 'Arquivado')}` : ''}`;

  const sub = [phoneFmt, lead.city, lead.email].filter(Boolean).join(' · ');
  const cabecalho = cabecalhoPagina({
    trilha: [{ rotulo: 'Comercial' }, { rotulo: 'Leads', href: '/dashboard/leads' }, { rotulo: lead.name ?? 'Sem nome' }],
    titulo: lead.name ?? 'Sem nome',
    seloHtml: selos,
    subtitulo: `${sub}${lead.acquisition_source ? ` · origem: ${lead.acquisition_source}` : ''}`,
    acoesHtml: acoesAVista,
  });

  const diasSemContato = lead.updated_at ? Math.floor((Date.now() - Date.parse(lead.updated_at)) / 86400_000) : null;
  const kpis = faixaKpis([
    { rotulo: 'Tarefas pendentes', valor: lead.tarefas.length },
    { rotulo: 'Mensagens na conversa', valor: lead.conversation_messages.length },
    { rotulo: 'Toques de cadência', valor: lead.cadence_steps.length },
    { rotulo: 'Dias desde a última atividade', valor: Number.isFinite(diasSemContato as number) ? diasSemContato : null },
  ]);

  const temEnergia = Object.keys(lead.energy_data ?? {}).length > 0;
  const temOport = Object.keys(lead.opportunities ?? {}).length > 0;
  const dados = temEnergia || temOport
    ? cartaoSecao({
      titulo: 'Dados do lead',
      corpoHtml: `${temEnergia ? `<div class="cc-lbl-s">Dados de energia</div><pre class="cc-pre">${escapeHtml(JSON.stringify(lead.energy_data, null, 2))}</pre>` : ''}
        ${temOport ? `<div class="cc-lbl-s">Oportunidades</div><pre class="cc-pre">${escapeHtml(JSON.stringify(lead.opportunities, null, 2))}</pre>` : ''}`,
    })
    : '';

  const servicosHtml = servicos.length > 0
    ? cartaoSecao({
      titulo: `Serviços de campo (${servicos.length})`,
      corpoHtml: `<div class="cc-evs">${servicos.map((s) => linhaLista({
        tom: 'info', titulo: s.tipoNome, href: `/dashboard/servicos/${s.id}`,
        meta: `${s.dataServico.split('-').reverse().join('/')}${s.fotos ? ` · ${s.fotos} foto(s)` : ''}${s.videos ? ` · ${s.videos} vídeo(s)` : ''}`,
      })).join('')}</div>`,
    })
    : '';

  const anexosHtml = (lead.anexos ?? []).length > 0
    ? cartaoSecao({ titulo: `Arquivos do cliente (${lead.anexos.length})`, corpoHtml: `<div class="cc-anx-grade">${lead.anexos.map((a) => renderAnexoCard(a)).join('')}</div>` })
    : '';

  const body = `<div class="cc-root cc-ficha">
    ${cabecalho}
    ${perdidoBanner}
    ${kpis}
    <div class="cc-ficha-grid">
      <div class="cc-ficha-col cc-ficha-esq">
        ${cartaoSecao({ titulo: 'Venda', id: 'venda', corpoHtml: vendaCorpo })}
        ${renderTarefas(lead.id, lead.tarefas)}
        ${dados}
        ${renderTimeline(lead.timeline)}
        ${servicosHtml}
        ${anexosHtml}
      </div>
      <div class="cc-ficha-col cc-ficha-dir">
        ${cartaoSecao({ titulo: `Conversa (${assistente} ↔ Cliente)`, classe: 'cc-ficha-conversa', corpoHtml: messagesHtml })}
        ${cartaoSecao({ titulo: 'Copiloto IA', dica: 'tire dúvidas e gere mensagens', corpoHtml: copiloto })}
        ${cartaoSecao({ titulo: 'Cadência', corpoHtml: cadenceHtml })}
      </div>
    </div>
    ${modalMarcarPerdido}
  </div>
  <style>${CSS_FICHA}</style>`;

  const scriptIA = `
    <script>
    function ia_copiarTexto(btn) {
      var bubble = btn.closest('div').parentElement;
      var txt = (bubble.childNodes[0] && bubble.childNodes[0].textContent) || bubble.textContent;
      navigator.clipboard.writeText(txt.trim());
      btn.textContent = '✅ Copiado';
      setTimeout(function () { btn.textContent = '📋 Copiar'; }, 1500);
    }
    async function mandarCopiloto(leadId, pergunta) {
      pergunta = (pergunta || '').trim();
      if (!pergunta) return;
      var chat = document.getElementById('ia-chat');
      var u = document.createElement('div');
      u.className = 'cc-msg cc-msg-eu';
      u.textContent = pergunta;
      chat.appendChild(u);
      var a = document.createElement('div');
      a.className = 'cc-msg cc-msg-ia';
      a.textContent = '⏳ Pensando...';
      chat.appendChild(a);
      chat.scrollTop = chat.scrollHeight;
      try {
        var resp = await fetch('/dashboard/leads/' + leadId + '/ia-copiloto', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'pergunta=' + encodeURIComponent(pergunta)
        });
        var json = await resp.json();
        if (json.erro) { a.textContent = '⚠️ ' + json.erro; }
        else {
          a.textContent = json.texto;
          var bar = document.createElement('div');
          bar.className = 'cc-msg-bar';
          bar.innerHTML = '<button type="button" onclick="ia_copiarTexto(this)" class="cc-link">📋 Copiar</button>';
          a.appendChild(bar);
        }
      } catch (e) { a.textContent = '⚠️ Erro ao falar com a IA. Tente de novo.'; }
      chat.scrollTop = chat.scrollHeight;
    }
    </script>
  `;

  return renderLayout({ active: 'leads', title: `Lead: ${nome}`, body: body + scriptIA, user, dark: temaDaTela(user, 'claro') === 'escuro', largo: true });
}

/** CSS só da ficha do lead (renovação do miolo, R3). */
const CSS_FICHA = `
.cc-ficha .cc-lead-acoes{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.cc-ficha .cc-lead-acoes form{margin:0}
.cc-ficha .cc-so-cel{display:none}
.cc-ficha .cc-aviso{margin-top:4px}
.cc-ficha .cc-kstrip{margin-bottom:18px}
.cc-ficha-grid{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:16px;align-items:start}
.cc-ficha-col{display:flex;flex-direction:column;gap:16px;min-width:0}
.cc-ficha-nota{margin:12px 0 0;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.cc-f-linha{display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap}
.cc-f-coluna{display:flex;flex-direction:column;gap:12px}
.cc-f-topo{margin-top:14px;padding-top:14px;border-top:1px solid var(--cc-line)}
.cc-f-cresce{flex:1;min-width:180px}
.cc-f-cresce input{width:100%}
.cc-tarefas{list-style:none;margin:14px 0 0;padding:0;display:flex;flex-direction:column;gap:8px}
.cc-tarefa{display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid var(--cc-line);border-radius:10px}
.cc-tarefa-txt{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.cc-tarefa-txt strong{font-size:13.5px;font-weight:600}
.cc-tarefa-txt span{font-size:12px;color:var(--cc-muted);display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.cc-tarefa-acoes{display:flex;gap:6px;flex:none}
.cc-tarefa-acoes form{margin:0}
.cc-tl{list-style:none;margin:0;padding:0}
.cc-tl-i{display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--cc-line)}
.cc-tl-i:last-child{border-bottom:0}
.cc-tl-ic{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;background:var(--cc-surface-3);flex:none;font-size:14px}
.cc-tl-txt{display:flex;flex-direction:column;gap:2px;min-width:0}
.cc-tl-txt strong{font-size:13.5px;font-weight:600}
.cc-tl-txt span{font-size:12.5px;color:var(--cc-text-2)}
.cc-tl-txt small{font-size:11px;color:var(--cc-faint)}
.cc-conversa{display:flex;flex-direction:column;gap:10px;max-height:520px;overflow-y:auto;padding-right:4px}
.cc-balao{max-width:82%;padding:9px 12px;border-radius:14px;border:1px solid var(--cc-line);background:var(--cc-surface-2)}
.cc-balao-cli{align-self:flex-start;border-top-left-radius:4px}
.cc-balao-eva{align-self:flex-end;border-top-right-radius:4px;background:var(--cc-ok-soft);border-color:rgba(61,187,110,.3)}
.cc-balao-q{font-size:11px;font-weight:700;color:var(--cc-muted);margin-bottom:3px}
.cc-balao-eva .cc-balao-q{color:var(--cc-ok)}
.cc-balao-t{font-size:13.5px;white-space:pre-wrap;word-break:break-word;color:var(--cc-text)}
.cc-balao-h{font-size:10.5px;color:var(--cc-faint);margin-top:4px}
.cc-copiloto-atalhos{margin-bottom:10px}
.cc-ia-chat{display:flex;flex-direction:column;gap:8px;max-height:320px;overflow-y:auto;margin-bottom:10px}
.cc-msg{font-size:13px;padding:8px 12px;border-radius:12px;white-space:pre-wrap;word-break:break-word}
.cc-msg-eu{align-self:flex-end;margin-left:32px;background:var(--cc-surface-3)}
.cc-msg-ia{margin-right:32px;background:var(--cc-info-soft);border:1px solid rgba(56,189,248,.3)}
.cc-msg-bar{margin-top:4px}
.cc-cadencia{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.cc-cadencia li{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:13px}
.cc-pre{margin:6px 0 12px;padding:10px 12px;border-radius:10px;background:var(--cc-surface-2);border:1px solid var(--cc-line);font-size:12px;overflow-x:auto;color:var(--cc-text-2)}
.cc-anx-grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:12px}
.cc-anx{min-width:0}
.cc-anx-img,.cc-anx-prev{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;aspect-ratio:1;width:100%;border-radius:10px;border:1px solid var(--cc-line);background:var(--cc-surface-2);object-fit:cover;font-size:12px;color:var(--cc-text-2)}
.cc-anx-pdf{color:var(--cc-crit)}
.cc-anx-prev audio{width:100%}
.cc-anx-l{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:6px}
.cc-anx-t{font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cc-anx-q{font-size:10.5px;color:var(--cc-faint)}
.cc-mais-sep{height:1px;background:var(--cc-line-2);margin:2px 0}
.cc-modal{position:fixed;inset:0;z-index:50;background:rgba(2,6,23,.6);display:flex;align-items:center;justify-content:center;padding:16px}
.cc-modal.hidden{display:none}
.cc-modal-caixa{width:100%;max-width:460px;background:var(--cc-surface);border:1px solid var(--cc-line-2);border-radius:16px;padding:20px;box-shadow:0 20px 50px rgba(0,0,0,.4)}
.cc-modal-caixa h3{font-size:17px;font-weight:700}
.cc-modal-caixa .cc-hint{margin:4px 0 14px}
.cc-modal-caixa select,.cc-modal-caixa textarea{width:100%}
.cc-modal-bot{margin-top:4px;gap:8px}
/* 1 coluna: Conversa → Tarefas → Venda → o resto (dados, linha do tempo…) */
@media (max-width:1100px){
  .cc-ficha-grid{display:flex;flex-direction:column;gap:16px}
  .cc-ficha-col{display:contents}
  .cc-ficha-grid .cc-panel{order:5}
  .cc-ficha-grid .cc-ficha-conversa{order:1}
  .cc-ficha-grid #tarefas{order:2}
  .cc-ficha-grid #venda{order:3}
}
@media (max-width:760px){
  .cc-ficha{padding-bottom:84px}
  .cc-ficha .cc-lead-acoes{position:fixed;left:0;right:0;bottom:0;z-index:25;justify-content:space-between;flex-wrap:nowrap;gap:6px;padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:var(--cc-surface);border-top:1px solid var(--cc-line-2);box-shadow:0 -8px 24px rgba(0,0,0,.18)}
  .cc-ficha .cc-lead-acoes>a[href*="propostas"]{display:none}
  .cc-ficha .cc-so-cel{display:inline-flex}
  .cc-ficha .cc-lead-acoes>*{flex:1 1 0;min-width:0}
  .cc-ficha .cc-lead-acoes>.cc-btn,.cc-ficha .cc-lead-acoes form .cc-btn,.cc-ficha .cc-lead-acoes>details>summary{width:100%;justify-content:center;padding:0 6px;font-size:12px;overflow:hidden;text-overflow:ellipsis}
  .cc-ficha .cc-lead-acoes>.cc-btn svg{display:none}
  .cc-ficha .cc-lead-acoes .cc-mais-menu .cc-btn{justify-content:flex-start;font-size:13px}
  .cc-ficha .cc-mais-menu,.cc-ficha .cc-mais-dir .cc-mais-menu{bottom:76px}
  .cc-tarefa{flex-wrap:wrap}
  .cc-balao{max-width:92%}
}
`;
