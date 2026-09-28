// src/modules/dashboard/cadencia-views.ts
// Marketing › Cadência de reativação (/dashboard/cadencia).
// Renovação do miolo — R17 (28/09/2026): mesmos formulários (fechou/optout com
// id escondido e confirm), mesmos links de filtro (?status=); visual cc- do
// Command Center, tema escuro (D4), sem Tailwind. A tabela vira cartão no
// celular. CONSERTO: o confirm com apóstrofo no nome ("D'Ávila") não compilava
// e o formulário ia SEM perguntar — agora o nome vai escapado para JS.
// Tenant: sem a dica do comando /reativar-base (é do WhatsApp do dono).
import { renderLayout, escapeHtml } from './views.js';
import type { LeadCadenciaRow, CadenciaKpis, CadenciaStatus } from './cadencia-queries.js';
import { normalizeBrazilianPhone } from '../meta-leadgen.js';
import type { DashUser } from './permissions.js';
import { cabecalhoPagina, faixaKpis, cartaoSecao, tabela, estadoVazio, pilulaStatus, botao, chipsFiltro, celulaDupla } from './ui/componentes.js';
import type { Tom } from './ui/componentes.js';
import { temaDaTela } from './ui/tema.js';
import { ECOSUN_COMPANY_ID } from '../tenant-resolver.js';

const CSS_CADENCIA = `
.cc-cd>*+*{margin-top:16px}
.cc-cd-acoes{display:flex;gap:6px;flex-wrap:wrap}
.cc-cd-acoes form{margin:0}
.cc-cd-mail{display:block;font-size:12px;color:var(--cc-info);overflow-wrap:anywhere}
.cc-cd-mail.cc-cd-sem{color:var(--cc-faint)}
.cc-cd-hist{font-size:12px;color:var(--cc-muted);line-height:1.5}
.cc-cd-motivo{font-size:12px;color:var(--cc-muted);overflow-wrap:anywhere}
.cc-cd-dica{margin:0;font-size:12.5px;color:var(--cc-muted)}
.cc-cd-dica code{padding:1px 6px;border-radius:6px;background:var(--cc-surface-3);color:var(--cc-text-2)}
`;

const STATUS_LABELS: Record<CadenciaStatus, { label: string; tom: Tom; chip: string }> = {
  aguardando:           { label: 'Aguardando disparo',     tom: 'sem_dado',    chip: 'Aguardando' },
  enviado_sem_resposta: { label: 'Enviado, sem resposta',  tom: 'info',        chip: 'Enviado' },
  respondeu:            { label: 'Respondeu',              tom: 'normal',      chip: 'Respondeu' },
  qualificando:         { label: 'Qualificando',           tom: 'oportunidade', chip: 'Qualificando' },
  proposta_enviada:     { label: 'Proposta enviada',       tom: 'acompanhar',  chip: 'Proposta' },
  cliente:              { label: 'Cliente',                tom: 'normal',      chip: 'Cliente' },
  sem_resposta_7d:      { label: 'Sem resposta 7d+',       tom: 'critico',     chip: 'Sem resposta 7d+' },
  opt_out:              { label: 'Pediu pra parar',        tom: 'sem_dado',    chip: 'Pediu pra parar' },
};

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

const TEMP: Record<string, Tom> = { quente: 'critico', morno: 'atencao', frio: 'info' };

export function maskPhone(phone: string): string {
  // Normaliza ANTES (wa_id BR vem sem o 9o digito) -> +55 61 99880-5002
  const n = normalizeBrazilianPhone(phone) ?? (phone ?? '').replace(/\D/g, '');
  if (n.length < 10) return phone;
  return `+${n.slice(0, 2)} ${n.slice(2, 4)} ${n.slice(4, -4)}-${n.slice(-4)}`;
}

/** Texto dentro de uma string JS de aspas simples, num atributo HTML (onsubmit). */
function jsStr(s: string): string {
  return escapeHtml(s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/[\r\n]+/g, ' '));
}

export interface CadenciaPageInput {
  rows: LeadCadenciaRow[];
  kpis: CadenciaKpis;
  filterStatus?: string;
  /** R0: quem está vendo — a casca é a da empresa dele. */
  user: DashUser | undefined;
}

export function renderCadenciaPage(input: CadenciaPageInput): string {
  const { rows, kpis, filterStatus, user } = input;
  const casa = !user || user.companyId === ECOSUN_COMPANY_ID;

  const filtered = filterStatus
    ? rows.filter((r) => r.cadencia_status === filterStatus)
    : rows;

  const acoes = (r: LeadCadenciaRow): string => (r.cadencia_status === 'cliente' || r.cadencia_status === 'opt_out')
    ? '<span class="cc-faint">—</span>'
    : `<div class="cc-cd-acoes">
        <form method="POST" action="/dashboard/cadencia/fechou" onsubmit="return confirm('Marcar ${jsStr(r.name)} como cliente fechado? Remove da cadência.')">
          <input type="hidden" name="id" value="${escapeHtml(r.id)}">
          ${botao({ rotulo: 'Fechou', tipo: 'submit', tamanho: 'sm', icone: 'check' })}
        </form>
        <form method="POST" action="/dashboard/cadencia/optout" onsubmit="return confirm('Marcar que ${jsStr(r.name)} pediu pra parar? Para de receber mensagens.')">
          <input type="hidden" name="id" value="${escapeHtml(r.id)}">
          ${botao({ rotulo: 'Pediu pra parar', tipo: 'submit', tamanho: 'sm', tom: 'fantasma' })}
        </form>
      </div>`;

  const tabelaHtml = filtered.length === 0
    ? estadoVazio({ tipo: 'vazio', titulo: `Nenhum lead encontrado${filterStatus ? ' nesse status' : ''}.`, icone: 'users' })
    : tabela({
      mobile: 'cartoes',
      colunas: [{ titulo: 'Lead' }, { titulo: 'Status' }, { titulo: 'Temperatura' }, { titulo: 'Etapa anterior' }, { titulo: 'Consumo', alinhar: 'dir', num: true }, { titulo: 'Histórico' }, { titulo: 'Motivo da perda anterior' }, { titulo: 'Ações' }],
      linhas: filtered.map((r) => {
        const st = STATUS_LABELS[r.cadencia_status];
        const email = r.email
          ? `<span class="cc-cd-mail">${escapeHtml(r.email)}</span>`
          : '<span class="cc-cd-mail cc-cd-sem">sem e-mail</span>';
        return [
          { html: `${celulaDupla(r.name, maskPhone(r.phone))}${email}` },
          { html: pilulaStatus(st.tom, st.label) },
          r.temperatura_anterior ? { html: pilulaStatus(TEMP[r.temperatura_anterior] ?? 'sem_dado', r.temperatura_anterior) } : null,
          r.ultima_etapa_anterior || r.atendente_anterior
            ? { html: celulaDupla(r.ultima_etapa_anterior, r.atendente_anterior ? `com ${r.atendente_anterior}` : null) }
            : null,
          r.consumo_kwh ? `${r.consumo_kwh.toLocaleString('pt-BR')} kWh/mês` : null,
          { html: `<div class="cc-cd-hist">Última abertura: ${escapeHtml(timeAgo(r.last_reactivation_sent_at))}<br>Última msg: ${escapeHtml(timeAgo(r.last_message_at))}</div>` },
          r.motivo_perda_anterior ? { html: `<span class="cc-cd-motivo">${escapeHtml(r.motivo_perda_anterior.slice(0, 60))}</span>` } : null,
          { html: acoes(r) },
        ];
      }),
    });

  const counts: Record<CadenciaStatus, number> = {
    aguardando: 0, enviado_sem_resposta: 0, respondeu: 0, qualificando: 0,
    proposta_enviada: 0, cliente: 0, sem_resposta_7d: 0, opt_out: 0,
  };
  for (const r of rows) counts[r.cadencia_status]++;

  // Mesmos links de antes: o chip ativo volta pra /cadencia; os outros ?status=<x>.
  const filtro = (status: string, rotulo: string, valor: number) => {
    const ativo = filterStatus === status;
    return { rotulo, valor: valor > 0 ? valor : null, ativo, href: `/dashboard/cadencia${ativo ? '' : `?status=${status}`}` };
  };

  const pct = (v: number | null, txt: string) => (v != null ? `${v.toFixed(1).replace('.', ',')}% ${txt}` : '');

  const body = `
    ${cabecalhoPagina({
      trilha: [{ rotulo: 'Marketing', href: '/dashboard/marketing' }, { rotulo: 'Cadência', href: '/dashboard/cadencia' }],
      titulo: 'Cadência de reativação',
      subtitulo: 'Leads da base recuperada (comercial terceirizado) — acompanhe a abertura enviada, as respostas e o funil até a proposta.',
    })}
    ${faixaKpis([
      { rotulo: 'Total de leads', valor: kpis.total_leads, detalhe: 'base terceirizada', destaque: true },
      { rotulo: 'Aberturas enviadas', valor: kpis.templates_disparados, detalhe: kpis.total_leads > 0 ? `${((kpis.templates_disparados / kpis.total_leads) * 100).toFixed(0)}% da base` : '' },
      { rotulo: 'Responderam', valor: kpis.responderam, detalhe: pct(kpis.taxa_resposta_pct, 'de resposta') },
      { rotulo: 'Clientes novos', valor: kpis.clientes, detalhe: 'fechados via reativação' },
      { rotulo: 'Qualificando', valor: kpis.qualificando, detalhe: pct(kpis.taxa_qualificacao_pct, 'dos que responderam') },
      { rotulo: 'Proposta enviada', valor: kpis.proposta_enviada, detalhe: pct(kpis.taxa_proposta_pct, 'dos qualificando') },
      { rotulo: 'Sem resposta 7d+', valor: counts.sem_resposta_7d, detalhe: 'precisa de acompanhamento' },
    ])}
    ${cartaoSecao({
      titulo: 'Leads da cadência',
      dica: `${filtered.length} de ${rows.length}`,
      corpoHtml: `<div style="margin-bottom:12px">${chipsFiltro([
        filtro('', 'Todos', rows.length),
        filtro('aguardando', STATUS_LABELS.aguardando.chip, counts.aguardando),
        filtro('enviado_sem_resposta', STATUS_LABELS.enviado_sem_resposta.chip, counts.enviado_sem_resposta),
        filtro('respondeu', STATUS_LABELS.respondeu.chip, counts.respondeu),
        filtro('qualificando', STATUS_LABELS.qualificando.chip, counts.qualificando),
        filtro('proposta_enviada', STATUS_LABELS.proposta_enviada.chip, counts.proposta_enviada),
        filtro('cliente', STATUS_LABELS.cliente.chip, counts.cliente),
        filtro('sem_resposta_7d', STATUS_LABELS.sem_resposta_7d.chip, counts.sem_resposta_7d),
        filtro('opt_out', STATUS_LABELS.opt_out.chip, counts.opt_out),
      ])}</div>${tabelaHtml}`,
    })}
    ${casa ? `<p class="cc-cd-dica">Pra disparar a mensagem de abertura pros leads aguardando: mande <code>/reativar-base N</code> no WhatsApp (padrão N=10). Espera de 30 a 90 s entre cada um.</p>` : ''}
  `;

  return renderLayout({
    active: 'cadencia', title: 'Cadência', user,
    body: `<div class="cc-root cc-cd">${body}</div><style>${CSS_CADENCIA}</style>`,
    tailwind: false, dark: temaDaTela(user, 'escuro') === 'escuro', largo: true,
  });
}
