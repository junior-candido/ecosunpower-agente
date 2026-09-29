// src/modules/dashboard/email-views.ts
// Marketing › E-mail: métricas da sequência de e-mail (contadas a partir de
// eventos_elo) e o botão pra ligar/pausar o envio automático.
// renderEmailPage devolve o CORPO; renderEmailLayout envolve na casca.
// Renovação do miolo — R17 (28/09/2026): mesmo formulário (ligar/pausar),
// visual cc- do Command Center, tema escuro (D4), sem Tailwind.
// A jornada de e-mail é a da casa: tenant vê renderEmailIndisponivel().

import { renderLayout, escapeHtml } from './views.js';
import type { DashUser } from './permissions.js';
import type { DesempenhoStep } from './email-metricas.js';
import { cabecalhoPagina, faixaKpis, cartaoSecao, tabela, estadoVazio, pilulaStatus, botao } from './ui/componentes.js';
import { temaDaTela } from './ui/tema.js';

const CSS_EMAIL = `
.cc-em>*+*{margin-top:16px}
.cc-em-acao{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.cc-em-acao form{margin:0}
.cc-em-acao p{margin:0;font-size:13px;color:var(--cc-muted)}
.cc-em-pct{color:var(--cc-muted);font-size:12px;margin-left:4px}
@media (max-width:760px){.cc-em-acao form,.cc-em-acao .cc-btn{width:100%;justify-content:center}}
`;

export function resumirMetricas(eventos: Array<{ tipo: string }>) {
  const c = (t: string) => eventos.filter((e) => e.tipo === t).length;
  return {
    enviados: c('email_enviado'),
    abertos: c('email_aberto'),
    clicados: c('email_clicado'),
    quentes: c('lead_quente_email'),
    descadastros: c('email_descadastro'),
  };
}

/** Casca da aba E-mail Marketing (o router passa o corpo pronto). */
export function renderEmailLayout(input: { body: string; user: DashUser | undefined }): string {
  return renderLayout({
    active: 'email', title: 'E-mail Marketing', user: input.user,
    body: `<div class="cc-root cc-em">${input.body}</div><style>${CSS_EMAIL}</style>`,
    tailwind: false, dark: temaDaTela(input.user, 'escuro') === 'escuro', largo: true,
  });
}

const TRILHA = [{ rotulo: 'Marketing', href: '/dashboard/marketing' }, { rotulo: 'E-mail Marketing', href: '/dashboard/marketing/email' }];

/** Tenant: a jornada de e-mail (e os números dela) é a da casa — ainda não há a dele. */
export function renderEmailIndisponivel(): string {
  return `${cabecalhoPagina({ trilha: TRILHA, titulo: 'E-mail Marketing' })}
    ${estadoVazio({
      tipo: 'construcao', titulo: 'O e-mail marketing ainda não está disponível para a sua empresa.',
      texto: 'Quando a sequência de e-mails da sua empresa estiver ligada, os envios, aberturas e cliques aparecem aqui.', icone: 'mail',
    })}`;
}

export function renderEmailPage(
  m: ReturnType<typeof resumirMetricas>,
  ligado: boolean,
  desempenho: DesempenhoStep[] = [],
): string {
  const taxaAb = m.enviados ? Math.round((m.abertos / m.enviados) * 100) : 0;

  const kpis = faixaKpis([
    { rotulo: 'Enviados', valor: m.enviados, detalhe: 'e-mails da jornada', destaque: true },
    { rotulo: 'Abertos', valor: m.abertos, detalhe: `${taxaAb}% dos enviados` },
    { rotulo: 'Clicados', valor: m.clicados, detalhe: 'clicaram no link' },
    { rotulo: 'Quentes', valor: m.quentes, detalhe: 'viraram lead quente' },
    { rotulo: 'Descadastros', valor: m.descadastros, detalhe: 'pediram pra sair' },
  ]);

  const acao = `<div class="cc-em-acao">
      <form method="POST" action="/dashboard/marketing/email/${ligado ? 'pausar' : 'ligar'}">
        ${botao({ rotulo: ligado ? 'Pausar sequência' : 'Ligar sequência', tipo: 'submit', tom: ligado ? 'critico' : 'ouro' })}
      </form>
      <p>${ligado ? 'Pausar para de mandar os próximos e-mails até você ligar de novo.' : 'Ligar volta a mandar a sequência para os leads com e-mail.'}</p>
    </div>`;

  const corpoDesempenho = desempenho.length
    ? tabela({
      mobile: 'rolar',
      colunas: [{ titulo: 'E-mail' }, { titulo: 'Enviados', alinhar: 'dir', num: true }, { titulo: 'Abertos', alinhar: 'dir', num: true }, { titulo: 'Clicados', alinhar: 'dir', num: true }],
      linhas: desempenho.map((d) => [
        `${d.step}. ${d.nome}`,
        d.enviados,
        { html: `${escapeHtml(String(d.abertos))}<span class="cc-em-pct">(${escapeHtml(String(d.taxaAbertura))}%)</span>` },
        { html: `${escapeHtml(String(d.clicados))}<span class="cc-em-pct">(${escapeHtml(String(d.taxaClique))}%)</span>` },
      ]),
    })
    : estadoVazio({ tipo: 'vazio', titulo: 'Ainda sem e-mails enviados nesta jornada.', icone: 'mail', compacto: true });

  return `
    ${cabecalhoPagina({
      trilha: TRILHA,
      titulo: 'E-mail Marketing',
      subtitulo: 'Sequência que nutre e converte lead frio por e-mail.',
      seloHtml: ligado ? pilulaStatus('normal', 'ligada') : pilulaStatus('atencao', 'pausada'),
    })}
    ${kpis}
    ${cartaoSecao({ titulo: 'Envio automático', corpoHtml: acao })}
    ${cartaoSecao({ titulo: 'Desempenho por e-mail da jornada', corpoHtml: corpoDesempenho })}`;
}
