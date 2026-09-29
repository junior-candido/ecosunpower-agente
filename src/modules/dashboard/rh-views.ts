// src/modules/dashboard/rh-views.ts
// Telas da área RH: vagas (CRUD) + candidatos (funil de seleção) + busca IA.
//   renderCandidatosPage → GET /dashboard/rh/candidatos
//   renderVagasPage      → GET /dashboard/rh/vagas
//   renderVagaFormPage   → GET /dashboard/rh/vagas/nova e /dashboard/rh/vagas/:id
//   renderBuscaPage      → GET /dashboard/rh/busca
// Renovação do miolo — R18 (28/09/2026): mesmos formulários (filtro, status,
// excluir com os dois confirm, vaga, busca), mesmos names e links; visual no
// padrão cc- do Command Center, tema escuro (D4), sem Tailwind. Tabelas viram
// cartão no celular; status em pílula; formulário de vaga em .cc-form.
import { renderLayout, formatDate as dataBr } from './views.js';
import type { DashUser } from './permissions.js';
import type { VagaRow, CandidatoRow, FiltrosCandidatos } from '../rh/store.js';
import { STATUS_VALIDOS } from '../rh/store.js';
import {
  cabecalhoPagina, cartaoSecao, tabela, estadoVazio, pilulaStatus, botao, celulaDupla, aviso, type Tom,
} from './ui/componentes.js';
import { temaDaTela } from './ui/tema.js';
import { ECOSUN_COMPANY_ID } from '../tenant-resolver.js';

function esc(s: string | null | undefined): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[c]!));
}

const STATUS_ROTULO: Record<string, string> = {
  novo: 'Novo', triado: 'Triado', entrevista: 'Entrevista', aprovado: 'Aprovado', reprovado: 'Reprovado',
};
const STATUS_TOM: Record<string, Tom> = {
  novo: 'info', triado: 'acompanhar', entrevista: 'oportunidade', aprovado: 'normal', reprovado: 'sem_dado',
};
const pilulaCandidato = (s: string) => pilulaStatus(STATUS_TOM[s] ?? 'sem_dado', STATUS_ROTULO[s] ?? s);

const CSS_RH = `
.cc-rh .cc-panel+.cc-panel,.cc-rh .cc-aviso+.cc-panel,.cc-rh .cc-panel+.cc-aviso,.cc-rh .cc-aviso+.cc-rh-grade{margin-top:16px}
.cc-rh .cc-aviso{margin-bottom:16px}
.cc-rh .cc-panel+.cc-rh-grade{margin-top:16px}
.cc-rh .cc-aviso a{color:var(--cc-gold-2);text-decoration:underline}
.cc-rh-filtro{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:14px}
.cc-rh-filtro input[name=q]{flex:1 1 220px;min-width:0}
.cc-rh-filtro select{flex:0 1 220px;min-width:0}
.cc-rh-acoes{display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:flex-end}
.cc-rh-acoes form{margin:0}
.cc-rh-st{display:flex;flex-direction:column;gap:6px;align-items:flex-start}
.cc-rh-st form{margin:0}
.cc-rh-st select{min-height:36px;padding:4px 8px;border-radius:8px;border:1px solid var(--cc-line-2);background:var(--cc-surface);color:var(--cc-text-2);font:inherit;font-size:12.5px;max-width:100%}
.cc-rh-ia{display:block;font-size:12px;color:var(--cc-muted);margin-top:4px;max-width:420px;overflow-wrap:anywhere}
.cc-rh-nomecel{display:block;min-width:0}
.cc-rh-alerta{color:var(--cc-warn,#f59e0b)}
.cc-rh-nota-ok{color:var(--cc-ok,#34d399);font-weight:700}
.cc-rh-nota-warn{color:var(--cc-warn,#f59e0b);font-weight:700}
.cc-rh-nota-crit{color:var(--cc-crit,#f87171);font-weight:700}
.cc-rh-nota{font-family:'Space Grotesk',system-ui,sans-serif}
.cc-rh-zap{color:var(--cc-ok,#34d399);text-decoration:none;white-space:nowrap}
.cc-rh-zap:hover{text-decoration:underline}
.cc-rh-nota-rodape{margin:12px 0 0;font-size:12px;color:var(--cc-faint)}
.cc-rh-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.cc-rh-form .cc-rh-cheia{grid-column:1/-1}
.cc-rh-form input,.cc-rh-form select,.cc-rh-form textarea{width:100%}
.cc-rh-form .cc-rh-enviar{grid-column:1/-1;display:flex;justify-content:flex-start}
.cc-rh-busca{display:flex;gap:10px;align-items:stretch;flex-wrap:wrap}
.cc-rh-busca .cc-rh-q{flex:1 1 320px;min-width:0;min-height:52px!important;font-size:17px!important;padding:12px 16px!important;border-radius:12px!important}
.cc-rh-busca button[type=submit]{height:auto;min-height:52px;padding:0 24px}
.cc-rh-ajuda{margin:12px 0 0;font-size:13px;color:var(--cc-muted)}
.cc-rh-grade{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.cc-rh .cc-rh-grade .cc-panel{margin:0}
.cc-rh-achado .cc-rh-topo{display:flex;align-items:center;justify-content:space-between;gap:10px}
.cc-rh-achado .cc-rh-nome{font-size:15px;font-weight:600;color:var(--cc-text);overflow-wrap:anywhere;min-width:0}
.cc-rh-achado .cc-rh-meta{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px;font-size:12.5px;color:var(--cc-muted)}
.cc-rh-achado .cc-rh-motivo{margin:10px 0 0;font-size:13.5px;color:var(--cc-text-2);overflow-wrap:anywhere}
.cc-rh-achado .cc-rh-links{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
@media (max-width:760px){
  .cc-rh-filtro input[name=q],.cc-rh-filtro select{flex:1 1 100%}
  .cc-rh-filtro .cc-btn{flex:1 1 auto;justify-content:center}
  .cc-rh-form{grid-template-columns:minmax(0,1fr)}
  .cc-rh-grade{grid-template-columns:minmax(0,1fr)}
  .cc-rh-acoes{justify-content:flex-start}
  .cc-rh-busca button[type=submit]{width:100%;justify-content:center}
  .cc-rh-ia{max-width:none}
}
`;

type Ativo = 'rh_candidatos' | 'rh_vagas' | 'rh_busca';
const layout = (active: Ativo, title: string, body: string, user: DashUser | undefined, largo = true) => renderLayout({
  active, title, body: `<div class="cc-root cc-rh">${body}</div><style>${CSS_RH}</style>`, user,
  tailwind: false, dark: temaDaTela(user, 'escuro') === 'escuro', largo,
});

const AREA = { rotulo: 'Equipe · RH' };
const ehCasa = (u: DashUser | undefined) => !u || u.companyId === ECOSUN_COMPANY_ID;

const notaHtml = (nota: number | null | undefined, faixaBaixa = 4): string => {
  if (nota === null || nota === undefined || !Number.isFinite(Number(nota))) return '—';
  const n = Number(nota);
  const cls = n >= 7 ? 'cc-rh-nota-ok' : n >= faixaBaixa ? 'cc-rh-nota-warn' : 'cc-rh-nota-crit';
  return `<span class="cc-rh-nota ${cls}">${n.toFixed(1)}</span>`;
};

// ---------------------------------------------------------------------------
// VAGAS
// ---------------------------------------------------------------------------

export function renderVagasPage(vagas: VagaRow[], viewer?: DashUser): string {
  const lista = vagas.length === 0
    ? estadoVazio({ tipo: 'vazio', titulo: 'Nenhuma vaga ainda', texto: 'Crie a primeira no botão Nova vaga, lá em cima.', icone: 'contact' })
    : tabela({
      mobile: 'cartoes',
      colunas: [{ titulo: 'Vaga' }, { titulo: 'Cidade' }, { titulo: 'Tipo' }, { titulo: 'Status' }, { titulo: 'Criada' }, { titulo: '' }],
      linhas: vagas.map((v) => {
        const aberta = v.status === 'aberta';
        return [
          { html: celulaDupla(v.titulo, null, `/dashboard/rh/vagas/${v.id}`) },
          v.cidade || null,
          v.tipo || null,
          { html: aberta ? pilulaStatus('normal', 'aberta') : pilulaStatus('sem_dado', 'fechada') },
          dataBr(v.created_at) || null,
          { html: `<div class="cc-rh-acoes">
        ${botao({ rotulo: 'editar', href: `/dashboard/rh/vagas/${v.id}`, tamanho: 'sm' })}
        <form method="POST" action="/dashboard/rh/vagas/${esc(v.id)}/status">
          <input type="hidden" name="status" value="${aberta ? 'fechada' : 'aberta'}">
          ${botao({ rotulo: aberta ? 'fechar' : 'reabrir', tipo: 'submit', tamanho: 'sm', tom: aberta ? 'fantasma' : 'normal' })}
        </form>
      </div>` },
        ];
      }),
    });

  const recado = ehCasa(viewer)
    ? `<div class="cc-aviso cc-aviso-info" role="status"><span>Vaga <strong>aberta</strong> aparece na página <a href="https://ecosunpower.eng.br/trabalhe-conosco" target="_blank" rel="noopener">Trabalhe Conosco</a> do site na hora. Fechou, some na hora.</span></div>`
    : aviso({ tom: 'info', texto: 'Vaga aberta fica registrada aqui para organizar a seleção; fechada, sai da lista de abertas. Ainda não há página pública de candidatura para a sua empresa.' });

  const body = `
${cabecalhoPagina({
    trilha: [AREA, { rotulo: 'Vagas' }],
    titulo: 'Vagas',
    subtitulo: 'Crie, edite, feche e reabra as vagas da empresa.',
    acoesHtml: botao({ rotulo: 'Nova vaga', href: '/dashboard/rh/vagas/nova', tom: 'ouro', icone: 'plus' }),
  })}
${recado}
${cartaoSecao({ titulo: 'Vagas', dica: `${vagas.length} ${vagas.length === 1 ? 'vaga' : 'vagas'}`, corpoHtml: lista })}`;
  return layout('rh_vagas', 'RH · Vagas', body, viewer);
}

export function renderVagaFormPage(vaga: VagaRow | null, viewer?: DashUser): string {
  const action = vaga ? `/dashboard/rh/vagas/${esc(vaga.id)}` : '/dashboard/rh/vagas';
  const tipos = ['CLT', 'PJ', 'Estágio', 'Temporário'];
  const titulo = vaga ? 'Editar vaga' : 'Nova vaga';
  const form = `<form method="POST" action="${action}" class="cc-form cc-rh-form">
    <label class="cc-campo cc-rh-cheia"><span>Título da vaga</span>
      <input name="titulo" required value="${esc(vaga?.titulo)}" placeholder="ex.: Instalador Fotovoltaico">
    </label>
    <label class="cc-campo"><span>Cidade</span>
      <input name="cidade" value="${esc(vaga?.cidade ?? 'Brasília-DF')}">
    </label>
    <label class="cc-campo"><span>Tipo</span>
      <select name="tipo">
        ${tipos.map((t) => `<option value="${t}" ${vaga?.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}
      </select>
    </label>
    <label class="cc-campo cc-rh-cheia"><span>Descrição (o que a pessoa vai fazer)</span>
      <textarea name="descricao" rows="4">${esc(vaga?.descricao)}</textarea>
    </label>
    <label class="cc-campo cc-rh-cheia"><span>Requisitos (a IA usa isso pra dar a nota na triagem)</span>
      <textarea name="requisitos" rows="4" placeholder="ex.: NR-35 em dia, experiência com estrutura em telhado metálico, CNH B">${esc(vaga?.requisitos)}</textarea>
    </label>
    <div class="cc-rh-enviar">${botao({ rotulo: vaga ? 'Salvar alterações' : 'Publicar vaga', tipo: 'submit', tom: 'ouro' })}</div>
  </form>`;

  const body = `
${cabecalhoPagina({
    trilha: [AREA, { rotulo: 'Vagas', href: '/dashboard/rh/vagas' }, { rotulo: titulo }],
    titulo,
    subtitulo: vaga ? 'As mudanças valem na hora.' : 'Preencha e publique — a vaga já nasce aberta.',
  })}
${cartaoSecao({ titulo: 'Dados da vaga', corpoHtml: form })}`;
  return layout('rh_vagas', vaga ? 'RH · Editar vaga' : 'RH · Nova vaga', body, viewer, false);
}

// ---------------------------------------------------------------------------
// BUSCA ESPERTA (banco de talentos)
// ---------------------------------------------------------------------------

export interface ResultadoBuscaView {
  id: string;
  motivo: string;
  candidato: { nome: string; vaga: string | null; nota_ia: number | null; status: string };
}

export function renderBuscaPage(
  pergunta: string,
  resultados: ResultadoBuscaView[] | null,   // null = ainda não buscou
  viewer?: DashUser,
  erro?: string,
): string {
  const cards = (resultados ?? []).map((r) => {
    const nota = r.candidato.nota_ia !== null && r.candidato.nota_ia !== undefined
      ? `<span class="cc-rh-meta-nota">nota ${notaHtml(r.candidato.nota_ia, 0)}</span>` : '';
    return `<section class="cc-panel cc-rh-achado">
    <div class="cc-rh-topo"><div class="cc-rh-nome">${esc(r.candidato.nome)}</div>${nota}</div>
    <div class="cc-rh-meta"><span>${r.candidato.vaga ? esc(r.candidato.vaga) : 'Banco de Talentos'}</span>${pilulaCandidato(r.candidato.status)}</div>
    <p class="cc-rh-motivo">${esc(r.motivo)}</p>
    <div class="cc-rh-links">
      <a href="/dashboard/rh/candidatos/${esc(r.id)}/curriculo" target="_blank" class="cc-btn cc-btn-sm">Currículo</a>
      <a href="/dashboard/rh/candidatos" class="cc-btn cc-btn-sm cc-btn-ghost">ver na lista →</a>
    </div>
  </section>`;
  }).join('');

  const form = `<form method="GET" action="/dashboard/rh/busca" class="cc-form cc-rh-busca">
    <input name="q" class="cc-rh-q" value="${esc(pergunta)}" required minlength="3" aria-label="Pergunta"
      placeholder='pergunte como quiser — ex.: "quem tem NR-35 e experiência em telhado?"'>
    ${botao({ rotulo: 'Buscar', tipo: 'submit', tom: 'ouro', icone: 'search' })}
  </form>
  <p class="cc-rh-ajuda">A IA vasculha os perfis de todos os candidatos guardados da empresa (os resumos que a triagem fez de cada currículo) e devolve quem encaixa, com o motivo. Quanto mais currículos triados, melhor ela acha.</p>`;

  const resultado = resultados === null ? ''
    : resultados.length === 0
      ? cartaoSecao({ titulo: 'Resultado', corpoHtml: estadoVazio({ tipo: 'vazio', titulo: 'Ninguém no banco encaixa nessa pergunta ainda.', texto: 'Tente reformular ou ampliar o critério.', icone: 'search' }) })
      : `<div class="cc-rh-grade">${cards}</div>`;

  const body = `
${cabecalhoPagina({
    trilha: [AREA, { rotulo: 'Busca IA' }],
    titulo: 'Busca no Banco de Talentos',
    subtitulo: 'Pergunte em português e a IA acha quem encaixa.',
    acoesHtml: botao({ rotulo: 'Candidatos', href: '/dashboard/rh/candidatos', icone: 'users' }),
  })}
${cartaoSecao({ titulo: 'Pergunta', corpoHtml: form })}
${erro ? aviso({ tom: 'erro', texto: erro }) : ''}
${resultado}`;
  return layout('rh_busca', 'RH · Busca inteligente', body, viewer);
}

// ---------------------------------------------------------------------------
// CANDIDATOS
// ---------------------------------------------------------------------------

export function renderCandidatosPage(
  candidatos: CandidatoRow[],
  vagas: VagaRow[],
  filtros: FiltrosCandidatos,
  viewer?: DashUser,
): string {
  const tituloVaga = new Map(vagas.map((v) => [v.id, v.titulo]));

  const status = (c: CandidatoRow) => `<div class="cc-rh-st">
      ${pilulaCandidato(c.status)}
      <form method="POST" action="/dashboard/rh/candidatos/${esc(c.id)}/status">
        <select name="status" onchange="this.form.submit()" aria-label="Mudar status de ${esc(c.nome)}">
          ${STATUS_VALIDOS.map((s) => `<option value="${s}" ${c.status === s ? 'selected' : ''}>${STATUS_ROTULO[s]}</option>`).join('')}
        </select>
      </form>
    </div>`;

  const nome = (c: CandidatoRow) => `<div class="cc-rh-nomecel">${celulaDupla(c.nome, null)}${c.resumo_ia ? `<span class="cc-rh-ia">${esc(c.resumo_ia)}</span>` : ''}${c.alertas_ia ? `<span class="cc-rh-ia cc-rh-alerta">Atenção: ${esc(c.alertas_ia)}</span>` : ''}</div>`;

  const lista = candidatos.length === 0
    ? estadoVazio({ tipo: 'vazio', titulo: 'Nenhum candidato ainda', texto: 'Quando alguém se candidatar, aparece aqui.', icone: 'users' })
    : tabela({
      mobile: 'cartoes',
      colunas: [{ titulo: 'Nome' }, { titulo: 'Vaga' }, { titulo: 'WhatsApp' }, { titulo: 'E-mail' }, { titulo: 'Nota IA', alinhar: 'dir', num: true }, { titulo: 'Status' }, { titulo: 'Chegou' }, { titulo: '' }],
      linhas: candidatos.map((c) => [
        { html: nome(c) },
        c.vaga_id ? (tituloVaga.get(c.vaga_id) ?? 'vaga encerrada') : 'Banco de Talentos',
        c.telefone ? { html: `<a href="https://wa.me/${esc(c.telefone)}" target="_blank" rel="noopener" class="cc-rh-zap">${esc(c.telefone)}</a>` } : null,
        c.email || null,
        { html: notaHtml(c.nota_ia) },
        { html: status(c) },
        dataBr(c.created_at) || null,
        { html: `<div class="cc-rh-acoes">
        <a href="/dashboard/rh/candidatos/${esc(c.id)}/curriculo" target="_blank" class="cc-btn cc-btn-sm">Currículo</a>
        <form method="POST" action="/dashboard/rh/candidatos/${esc(c.id)}/excluir" onsubmit="return confirm('Excluir este candidato de vez? Apaga os dados e o PDF do currículo. Sem volta.') &amp;&amp; confirm('Confirma de novo: excluir permanentemente?')">
          <button type="submit" class="cc-btn cc-btn-sm cc-btn-crit" title="Excluir candidato (apaga dados + currículo)">Excluir</button>
        </form>
      </div>` },
      ]),
    });

  const opcaoVaga = (id: string, rotulo: string) =>
    `<option value="${esc(id)}" ${filtros.vagaId === id ? 'selected' : ''}>${esc(rotulo)}</option>`;

  const filtro = `<form method="GET" action="/dashboard/rh/candidatos" class="cc-form cc-rh-filtro">
    <input name="q" value="${esc(filtros.q)}" placeholder="nome do candidato" aria-label="Nome do candidato">
    <select name="vaga" aria-label="Vaga">
      <option value="">Todas as vagas</option>
      ${opcaoVaga('banco', 'Banco de Talentos')}
      ${vagas.map((v) => opcaoVaga(v.id, v.titulo)).join('')}
    </select>
    <select name="status" aria-label="Status">
      <option value="">Todos os status</option>
      ${STATUS_VALIDOS.map((s) => `<option value="${s}" ${filtros.status === s ? 'selected' : ''}>${STATUS_ROTULO[s]}</option>`).join('')}
    </select>
    ${botao({ rotulo: 'Filtrar', tipo: 'submit', tom: 'ouro', icone: 'filter' })}
    ${botao({ rotulo: 'Limpar', href: '/dashboard/rh/candidatos', tom: 'fantasma' })}
  </form>`;

  const body = `
${cabecalhoPagina({
    trilha: [AREA, { rotulo: 'Candidatos' }],
    titulo: 'Candidatos',
    subtitulo: 'Triagem de quem se candidatou: nota da IA, status, currículo.',
    acoesHtml: botao({ rotulo: 'Gerenciar vagas', href: '/dashboard/rh/vagas', icone: 'contact' }),
  })}
${cartaoSecao({ titulo: 'Candidatos', dica: `${candidatos.length} ${candidatos.length === 1 ? 'candidato' : 'candidatos'}`, corpoHtml: `${filtro}${lista}<p class="cc-rh-nota-rodape">Currículos ficam guardados por 12 meses (LGPD) e abrem por link temporário seguro.</p>` })}`;
  return layout('rh_candidatos', 'RH · Candidatos', body, viewer);
}
