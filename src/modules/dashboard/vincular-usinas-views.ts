// src/modules/dashboard/vincular-usinas-views.ts
// Tela do mutirão: lista usinas sem cliente, com a sugestão por nome
// pré-selecionada num <select>. O Junior confere e confirma em lote.
//
// Renovação do miolo, R15 (28/09/2026): padrão cc- do Command Center, tema
// escuro (D4), sem Tailwind. O formulário é o MESMO (POST
// /dashboard/usinas/vincular, um <select name="<usinaId>"> por usina).

import { renderLayout, escapeHtml } from './views.js';
import type { DashUser } from './permissions.js';
import type { SugestaoVinculo, LeadOpcao } from './vincular-usinas.js';
import { cabecalhoPagina, cartaoSecao, tabela, estadoVazio, botao } from './ui/componentes.js';
import { temaDaTela } from './ui/tema.js';

export interface VincularUsinasPageData {
  sugestoes: SugestaoVinculo[];
  leads: LeadOpcao[];
  user?: DashUser;
}

const CSS_VINCULAR = `
.cc-vu .cc-panel{margin-bottom:16px}
.cc-vu .cc-tbl td{white-space:normal}
.cc-vu select{width:100%;min-width:0;max-width:420px}
.cc-vu-rodape{display:flex;justify-content:flex-end}
@media (max-width:760px){.cc-vu select{max-width:none}.cc-vu-rodape .cc-btn{width:100%;justify-content:center;height:44px}}
`;

function optionsLeads(leads: LeadOpcao[], selecionado: string | null): string {
  const vazio = `<option value="">— deixar sem cliente —</option>`;
  const opts = leads.map((l) => {
    const sel = l.id === selecionado ? ' selected' : '';
    return `<option value="${escapeHtml(l.id)}"${sel}>${escapeHtml(l.name ?? '(sem nome)')}</option>`;
  });
  return vazio + opts.join('');
}

function layout(body: string, user: DashUser | undefined): string {
  return renderLayout({
    active: 'usinas_kanban', title: 'Vincular usinas', user,
    body: `<div class="cc-root cc-vu">${body}</div><style>${CSS_VINCULAR}</style>`,
    tailwind: false, dark: temaDaTela(user, 'escuro') === 'escuro',
  });
}

export function renderVincularUsinasPage(data: VincularUsinasPageData): string {
  const cabecalho = (sub?: string) => cabecalhoPagina({
    trilha: [{ rotulo: 'Instalações' }, { rotulo: 'Quadro de Obras', href: '/dashboard/usinas/kanban' }, { rotulo: 'Vincular usinas' }],
    titulo: 'Vincular usinas ao cliente',
    subtitulo: sub,
    acoesHtml: botao({ rotulo: 'Voltar ao Quadro de Obras', href: '/dashboard/usinas/kanban', tom: 'fantasma' }),
  });

  if (data.sugestoes.length === 0) {
    return layout(`${cabecalho()}${estadoVazio({ titulo: 'Nenhuma usina pendente de vínculo.', texto: 'Todas as usinas ativas já têm cliente.', icone: 'check' })}`, data.user);
  }

  const lista = tabela({
    colunas: [{ titulo: 'Usina (apelido)' }, { titulo: 'Cliente' }],
    linhas: data.sugestoes.map((s) => [
      s.apelido ?? 'Sem apelido',
      { html: `<select name="${escapeHtml(s.usinaId)}" aria-label="Cliente da usina ${escapeHtml(s.apelido ?? 'sem apelido')}">${optionsLeads(data.leads, s.leadSugeridoId)}</select>` },
    ]),
    mobile: 'cartoes',
  });

  return layout(`${cabecalho('As usinas abaixo já operam mas não têm cliente. A sugestão (por nome) já vem marcada — confira, ajuste se precisar e confirme. Ao confirmar, elas vão pro Pós-venda e somem do Quadro de Obras.')}
    <form method="post" action="/dashboard/usinas/vincular" class="cc-form">
      ${cartaoSecao({ titulo: 'Usinas sem cliente', dica: `${data.sugestoes.length} para conferir`, corpoHtml: lista })}
      <div class="cc-vu-rodape">${botao({ rotulo: 'Confirmar vínculos', tipo: 'submit', tom: 'ouro' })}</div>
    </form>`, data.user);
}
