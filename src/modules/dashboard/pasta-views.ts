// src/modules/dashboard/pasta-views.ts
// Pasta Digital do Cliente — telas admin:
//   renderListaPastas  → GET  /dashboard/pastas
//   renderEditorPasta  → GET  /dashboard/pastas/:id
//   renderPreviewPasta → GET  /dashboard/pastas/:id/preview
// Renovação do miolo — R12 (28/09/2026): mesmos 11 formulários, confirms e
// upload multipart; visual no padrão cc- do Command Center, tema escuro (D4),
// sem Tailwind. Enviar é a ação dourada; Excluir mora no "⋯ Mais ações".
// No celular não estoura mais (a declaração em 2 colunas fixas passava de 390 px).
import { renderLayout } from './views.js';
import type { DashUser } from './permissions.js';
import { SECOES } from '../relatorios/pasta/types.js';
import type { ArquivoPasta, PastaClienteRow } from '../relatorios/pasta/types.js';
import {
  cabecalhoPagina, cartaoSecao, tabela, estadoVazio, pilulaStatus, botao, menuAcoes, celulaDupla, icone,
} from './ui/componentes.js';
import { temaDaTela } from './ui/tema.js';
import { ECOSUN_COMPANY_ID } from '../tenant-resolver.js';

function escapeHtml(s: string | null | undefined): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]!));
}

const CSS_PASTAS = `
.cc-pa .cc-panel+.cc-panel,.cc-pa .cc-aviso+.cc-panel,.cc-pa .cc-panel+.cc-aviso{margin-top:16px}
.cc-pa-novo{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.cc-pa-novo select{min-width:0;width:240px;max-width:100%}
.cc-pa-acoes{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.cc-pa-acoes form{margin:0}
.cc-pa-acoes button[disabled]{opacity:.5;cursor:not-allowed}
.cc-pa-link{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.cc-pa-link code{font-size:12.5px;padding:4px 8px;border-radius:8px;background:var(--cc-surface-3);color:var(--cc-info);overflow-wrap:anywhere;min-width:0}
.cc-pa-dados{display:grid;grid-template-columns:220px minmax(0,1fr);gap:14px;align-items:start}
.cc-pa-dados textarea{width:100%}
.cc-pa-dados .cc-pa-cheia{grid-column:1/-1}
.cc-pa-secoes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:16px}
.cc-pa .cc-pa-secoes .cc-panel{margin:0}
.cc-pa-arq{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--cc-line)}
.cc-pa-arq:last-child{border-bottom:0}
.cc-pa-arq img{width:52px;height:52px;object-fit:cover;border-radius:8px;flex:none}
.cc-pa-arq .cc-pa-ic{width:52px;text-align:center;font-size:20px;flex:none}
.cc-pa-arq .cc-pa-nome{flex:1;min-width:0;font-size:13px;color:var(--cc-text);overflow-wrap:anywhere}
.cc-pa-arq small{font-size:11.5px;margin-left:4px}
.cc-pa-arq form{margin:0}
.cc-pa-tag-rpi{color:var(--cc-et-qualificando)} .cc-pa-tag-capa{color:var(--cc-gold-2)}
.cc-pa-up{display:flex;gap:8px;align-items:center;margin-top:12px;flex-wrap:wrap}
.cc-pa-up input[type=file]{flex:1 1 180px;min-width:0}
.cc-pa-puxar{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.cc-pa-puxar form{margin:0;max-width:100%}
.cc-pa-puxar .cc-btn{white-space:normal;height:auto;min-height:32px;text-align:left}
.cc-pa-vazio{margin:0 0 4px;font-size:12.5px;color:var(--cc-faint)}
.cc-pa-decl{margin-top:14px;border:1px solid var(--cc-line-2);border-radius:12px;background:rgba(255,255,255,.02)}
.cc-pa-decl>summary{cursor:pointer;padding:10px 12px;font-size:13.5px;font-weight:600;color:var(--cc-gold-2)}
.cc-pa-decl>div{padding:0 12px 12px}
.cc-pa-decl p{margin:0 0 10px;font-size:12.5px;color:var(--cc-muted)}
.cc-pa-decl-grade{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.cc-pa-decl-grade input{width:100%}
.cc-pa-decl-grade .cc-pa-cheia{grid-column:1/-1}
.cc-pa-decl-grade .cc-pa-nota{font-size:12px;color:var(--cc-faint);margin-left:8px}
.cc-pa-previa{background:#fff;border-radius:12px;overflow:hidden}
.cc-pa-previa iframe{display:block;width:100%;min-height:900px;border:0}
@media (max-width:1023px){.cc-pa-secoes{grid-template-columns:minmax(0,1fr)}}
@media (max-width:760px){
  .cc-pa-novo select{width:100%}
  .cc-pa-novo .cc-btn{width:100%;justify-content:center}
  .cc-pa-dados,.cc-pa-decl-grade{grid-template-columns:minmax(0,1fr)}
  .cc-pa-acoes{width:100%}
  .cc-pa-acoes form,.cc-pa-acoes>.cc-btn{flex:1 1 auto}
  .cc-pa-acoes .cc-btn{width:100%;justify-content:center}
  .cc-pa-previa iframe{min-height:640px}
}
`;

const layout = (title: string, body: string, user: DashUser | undefined, largo = true) => renderLayout({
  active: 'pastas', title, body: `<div class="cc-root cc-pa">${body}</div><style>${CSS_PASTAS}</style>`, user,
  tailwind: false, dark: temaDaTela(user, 'escuro') === 'escuro', largo,
});

/** Título sem o emoji do começo (SECOES serve também a página do cliente, que mantém o emoji). */
const semEmoji = (t: string) => t.replace(/^\p{Extended_Pictographic}️?\s*/u, '');

const TRILHA = [{ rotulo: 'Clientes' }, { rotulo: 'Pasta do Cliente', href: '/dashboard/pastas' }];

export function renderListaPastas(input: {
  pastas: Array<{ id: string; slug: string; status: string; acessos: number; enviado_em: string | null; updated_at: string; cliente_nome: string | null; qtd_arquivos: number }>;
  clientes: Array<{ id: string; name: string | null }>;
  publicBase: string;
  user: DashUser | undefined;
}): string {
  const copiar = (url: string) =>
    `<button type="button" onclick="navigator.clipboard.writeText('${escapeHtml(url)}').then(()=>this.textContent='✅ copiado')" class="cc-btn cc-btn-sm">🔗 copiar link</button>`;

  const opcoesClientes = input.clientes
    .map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name ?? 'sem nome')}</option>`)
    .join('');

  const novo = `<form action="/dashboard/pastas" method="post" class="cc-form cc-pa-novo">
      <select name="lead_id" required aria-label="Cliente">
        <option value="">— escolher cliente —</option>
        ${opcoesClientes}
      </select>
      ${botao({ rotulo: 'Abrir pasta', tipo: 'submit', tom: 'ouro', icone: 'plus' })}
    </form>`;

  const lista = input.pastas.length === 0
    ? estadoVazio({ tipo: 'vazio', titulo: 'Nenhuma pasta ainda.', texto: 'Escolha um cliente acima pra abrir a primeira.', icone: 'folder' })
    : tabela({
      mobile: 'cartoes',
      colunas: [{ titulo: 'Cliente' }, { titulo: 'Status' }, { titulo: 'Arquivos', alinhar: 'dir', num: true }, { titulo: 'Acessos', alinhar: 'dir', num: true }, { titulo: 'Enviada' }, { titulo: '' }],
      linhas: input.pastas.map((p) => [
        { html: celulaDupla(p.cliente_nome ?? 'sem nome', null, `/dashboard/pastas/${p.id}`) },
        { html: p.status === 'publicada' ? pilulaStatus('normal', 'publicada') : pilulaStatus('acompanhar', 'rascunho') },
        `${p.qtd_arquivos} arquivo${p.qtd_arquivos === 1 ? '' : 's'}`,
        `${p.acessos} acesso${p.acessos === 1 ? '' : 's'}`,
        p.enviado_em ? String(p.enviado_em).slice(0, 10).split('-').reverse().join('/') : null,
        { html: `<div class="cc-pa-acoes">${botao({ rotulo: 'editar', href: `/dashboard/pastas/${p.id}`, tamanho: 'sm' })}${p.status === 'publicada' ? copiar(`${input.publicBase}/pasta/${p.slug}`) : ''}</div>` },
      ]),
    });

  const body = `
${cabecalhoPagina({
    trilha: [{ rotulo: 'Clientes' }, { rotulo: 'Pasta do Cliente' }],
    titulo: 'Pasta do Cliente',
    subtitulo: 'Entrega digital pós-instalação: fotos + documentos num link só, com a marca da empresa.',
    acoesHtml: novo,
  })}
${cartaoSecao({ titulo: 'Pastas', dica: `${input.pastas.length} pasta(s)`, corpoHtml: lista })}`;
  return layout('Pasta do Cliente', body, input.user);
}

export function renderEditorPasta(input: {
  pasta: PastaClienteRow;
  cliente_nome: string | null;
  tem_rpi: boolean;
  tem_servicos: boolean;
  fotos_urls: Record<string, string>;   // storage_path -> signed url (miniaturas das fotos)
  publicBase: string;
  faltando?: string[];                  // títulos das seções obrigatórias sem arquivo (R2) — trava o Publicar
  user: DashUser | undefined;
}): string {
  const p = input.pasta;
  const arquivos: ArquivoPasta[] = p.arquivos ?? [];
  const faltando = input.faltando ?? [];
  const incompleta = faltando.length > 0;
  const assistente = input.user && input.user.companyId !== ECOSUN_COMPANY_ID ? 'a assistente' : 'a Eva';

  const blocosSecoes = SECOES.map((s) => {
    const doSecao = arquivos.filter((a) => a.secao === s.id);
    const listaHtml = doSecao.map((a) => `
      <div class="cc-pa-arq">
        ${s.id === 'fotos' && input.fotos_urls[a.storage_path]
          ? `<img src="${escapeHtml(input.fotos_urls[a.storage_path])}" alt="">`
          : `<span class="cc-pa-ic" aria-hidden="true">${/\.(mp4|mov|webm|m4v)$/i.test(a.storage_path) ? '🎬' : '📄'}</span>`}
        <span class="cc-pa-nome">${escapeHtml(a.nome_exibicao)}${a.origem === 'r-pi' ? '<small class="cc-pa-tag-rpi">(do relatório)</small>' : ''}${p.capa_storage_path === a.storage_path ? '<small class="cc-pa-tag-capa">⭐ capa</small>' : ''}</span>
        ${s.id === 'fotos' && p.capa_storage_path !== a.storage_path ? `
        <form action="/dashboard/pastas/${escapeHtml(p.id)}/capa" method="post">
          <input type="hidden" name="storage_path" value="${escapeHtml(a.storage_path)}">
          <button type="submit" class="cc-btn cc-btn-sm" title="Usar como capa">⭐ capa</button>
        </form>` : ''}
        <form action="/dashboard/pastas/${escapeHtml(p.id)}/arquivos/remover" method="post" onsubmit="return confirm('Tirar este arquivo da pasta?')">
          <input type="hidden" name="storage_path" value="${escapeHtml(a.storage_path)}">
          <button type="submit" class="cc-btn cc-btn-sm cc-btn-crit" title="Tirar da pasta" aria-label="Tirar da pasta">🗑️</button>
        </form>
      </div>`).join('');

    const corpo = `
        ${listaHtml || '<p class="cc-pa-vazio">Nada aqui ainda.</p>'}
        <form action="/dashboard/pastas/${escapeHtml(p.id)}/arquivos" method="post" enctype="multipart/form-data" class="cc-form cc-pa-up">
          <input type="hidden" name="secao" value="${s.id}">
          <input type="file" name="arquivos" multiple ${s.id === 'fotos' || s.id === 'monitoramento' ? 'accept="image/*,video/*"' : 'accept="image/*,application/pdf"'} required aria-label="Arquivos de ${escapeHtml(s.titulo)}">
          <button type="submit" class="cc-btn cc-btn-sm">⬆️ Adicionar</button>
        </form>
        ${s.id === 'fotos' && (input.tem_rpi || input.tem_servicos) ? `
        <div class="cc-pa-puxar">
          ${input.tem_rpi ? `
          <form action="/dashboard/pastas/${escapeHtml(p.id)}/puxar-rpi" method="post">
            <button type="submit" class="cc-btn cc-btn-sm">✨ Puxar fotos do Relatório Pós-Instalação</button>
          </form>` : ''}
          ${input.tem_servicos ? `
          <form action="/dashboard/pastas/${escapeHtml(p.id)}/puxar-servicos" method="post">
            <button type="submit" class="cc-btn cc-btn-sm">🔧 Puxar fotos dos Serviços/Visitas</button>
          </form>` : ''}
        </div>` : ''}
        ${s.id === 'contrato' ? blocoDeclaracao(p) : ''}`;
    return cartaoSecao({ titulo: `${semEmoji(s.titulo)} (${doSecao.length})`, corpoHtml: corpo });
  }).join('');

  const publicUrl = `${input.publicBase}/pasta/${p.slug}`;
  const publicada = p.status === 'publicada';

  // Ações: Enviar (dourado, só publicada) · Publicar/Republicar · Prévia · ⋯ (Excluir).
  const btnPublicar = `<form action="/dashboard/pastas/${escapeHtml(p.id)}/publicar" method="post">
      <button type="submit" ${incompleta ? 'disabled' : ''} title="${incompleta ? escapeHtml('Falta: ' + faltando.join(', ')) : ''}" class="cc-btn${!publicada && !incompleta ? ' cc-btn-gold' : ''}">${publicada ? 'Republicar' : 'Publicar'}</button>
    </form>`;
  const btnEnviar = publicada ? `
    <form action="/dashboard/pastas/${escapeHtml(p.id)}/enviar" method="post" onsubmit="return confirm('Enviar o link da pasta pelo WhatsApp do cliente agora?')">
      <button type="submit" class="cc-btn cc-btn-gold">${icone('send', 'sm')}Enviar no zap</button>
    </form>` : '';
  const excluir = `<form action="/dashboard/pastas/${escapeHtml(p.id)}/excluir" method="post"
      onsubmit="return confirm('EXCLUIR a pasta inteira de ${escapeHtml((input.cliente_nome ?? 'este cliente').replace(/'/g, '').replace(/[\r\n\\]/g, ' '))}?\\n\\nTodos os arquivos enviados somem e o link do cliente PARA DE FUNCIONAR. Não tem volta.')">
      <button type="submit" class="cc-btn cc-btn-crit">🗑️ Excluir pasta inteira</button>
    </form>`;
  const acoes = `<div class="cc-pa-acoes">
    ${btnEnviar}
    ${btnPublicar}
    ${botao({ rotulo: 'Prévia', href: `/dashboard/pastas/${p.id}/preview`, icone: 'eye' })}
    ${menuAcoes({ alinhar: 'dir', itensHtml: excluir })}
  </div>`;

  const body = `
${cabecalhoPagina({
    trilha: [...TRILHA, { rotulo: input.cliente_nome ?? 'sem nome' }],
    titulo: `Pasta de ${input.cliente_nome ?? 'sem nome'}`,
    seloHtml: publicada ? pilulaStatus('normal', `Publicada · ${p.acessos} acesso(s)`) : pilulaStatus('acompanhar', 'Rascunho — o cliente ainda não vê'),
    acoesHtml: acoes,
  })}

${incompleta ? `
<div class="cc-aviso cc-aviso-atencao" role="status">${icone('lock', 'sm')}<span>
  <strong>Pasta incompleta — o Publicar libera quando as 7 seções tiverem arquivo.</strong>
  Falta: ${escapeHtml(faltando.join(' · '))}. (Monitoramento é opcional.)
  Quando publicar e o medidor estiver trocado, ${assistente} te avisa no zap com o botão <strong>Enviar agora</strong>.
</span></div>` : ''}

${publicada ? cartaoSecao({ titulo: 'Link do cliente', corpoHtml: `<div class="cc-pa-link">
  <code>${escapeHtml(publicUrl)}</code>
  <button type="button" onclick="navigator.clipboard.writeText('${escapeHtml(publicUrl)}').then(()=>this.textContent='✅ copiado')" class="cc-btn cc-btn-sm">copiar</button>
</div>` }) : ''}

${cartaoSecao({ titulo: 'Dados da entrega', corpoHtml: `
<form action="/dashboard/pastas/${escapeHtml(p.id)}/dados" method="post" class="cc-form cc-pa-dados">
  <label class="cc-campo"><span>Data da entrega</span><input type="date" name="data_entrega" value="${escapeHtml(p.data_entrega ?? '')}"></label>
  <label class="cc-campo"><span>Mensagem do zap (opcional — vazio usa a mensagem padrão; o link entra sozinho no final)</span>
    <textarea name="mensagem_zap" rows="3">${escapeHtml(p.mensagem_zap ?? '')}</textarea></label>
  <div class="cc-pa-cheia">${botao({ rotulo: 'Salvar dados', tipo: 'submit', icone: 'check' })}</div>
</form>` })}

<div class="cc-pa-secoes">${blocosSecoes}</div>`;
  return layout(`Pasta — ${input.cliente_nome ?? ''}`, body, input.user);
}

export function renderPreviewPasta(input: {
  pasta_id: string;
  cliente_nome: string | null;
  html_preview: string;
  user: DashUser | undefined;
}): string {
  const body = `
${cabecalhoPagina({
    trilha: [...TRILHA, { rotulo: input.cliente_nome ?? 'sem nome', href: `/dashboard/pastas/${input.pasta_id}` }, { rotulo: 'Prévia' }],
    titulo: `Prévia — pasta de ${input.cliente_nome ?? 'sem nome'}`,
    subtitulo: 'É exatamente isso que o cliente vai ver (menos o banner amarelo).',
    acoesHtml: botao({ rotulo: '← Voltar ao editor', href: `/dashboard/pastas/${input.pasta_id}` }),
  })}
${cartaoSecao({ titulo: 'Como o cliente vê', corpoHtml: `<div class="cc-pa-previa"><iframe title="Prévia da pasta" srcdoc="${escapeHtml(input.html_preview)}"></iframe></div>` })}`;
  return layout('Prévia da pasta', body, input.user);
}

/**
 * DECLARACAO DE EXECUCAO — o atestado que o cliente assina depois da entrega.
 *
 * Junior, 10/09/2026: "vamos fazer isso virar rotina mesmo". Fica na secao
 * Contrato porque e ali que o documento vive depois de assinado.
 *
 * O que da pra saber sozinho (nome, CPF, endereco, potencia, modulos,
 * inversores) o sistema ja preenche. O formulario pede so o que e do PAPEL da
 * entrega — e o que for digitado uma vez fica guardado (migration 127), entao
 * na segunda vez ja vem preenchido.
 *
 * R12: os exemplos (placeholder) viraram genéricos — antes eram números de
 * TRT, UC, parecer e a qualificação de um cliente de verdade, e o tenant via.
 */
function blocoDeclaracao(p: { id: string; dados_declaracao?: Record<string, string> | null }): string {
  const d = p.dados_declaracao ?? {};
  const campo = (nome: string, rotulo: string, ph = '', tipo = 'text') => `
    <label class="cc-campo">
      <span>${escapeHtml(rotulo)}</span>
      <input type="${tipo}" name="${nome}" value="${escapeHtml(d[nome] ?? '')}" placeholder="${escapeHtml(ph)}">
    </label>`;

  return `
  <details class="cc-pa-decl">
    <summary>Declaração de Execução — o atestado que o cliente assina</summary>
    <div>
      <p>
        Peça a assinatura <strong>logo depois da troca do medidor</strong>, com o sistema gerando —
        é quando o cliente assina sem pensar duas vezes. Junto com a TRT, vira o
        <strong>atestado de capacidade técnica</strong> que licitação exige.
      </p>
      <form action="/dashboard/pastas/${escapeHtml(p.id)}/declaracao" method="post" class="cc-form cc-pa-decl-grade">
        ${campo('trt', 'TRT / ART *', 'ex.: CFT0000000000')}
        ${campo('conclusao_em', 'Conclusão da obra *', '', 'date')}
        ${campo('uc', 'Unidade consumidora', 'ex.: 000000')}
        ${campo('distribuidora', 'Distribuidora', 'ex.: nome da distribuidora')}
        ${campo('parecer', 'Parecer de acesso', 'ex.: número do parecer')}
        ${campo('parecer_em', 'Aprovado em', '', 'date')}
        ${campo('padrao_entrada', 'Padrão de entrada', 'ex.: Bifásico 127/220 V · disjuntor geral 50 A')}
        ${campo('cidade', 'Cidade', 'ex.: Brasília/DF')}
        <label class="cc-campo cc-pa-cheia">
          <span>Qualificação do cliente (opcional)</span>
          <input type="text" name="qualificacao" value="${escapeHtml(d.qualificacao ?? '')}" placeholder="ex.: brasileiro, engenheiro civil">
        </label>
        <div class="cc-pa-cheia">
          <button type="submit" class="cc-btn">📜 Gerar declaração</button>
          <span class="cc-pa-nota">O PDF entra nesta seção, pronto pra imprimir e assinar.</span>
        </div>
      </form>
    </div>
  </details>`;
}
