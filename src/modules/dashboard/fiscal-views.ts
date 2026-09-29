// src/modules/dashboard/fiscal-views.ts
// Telas do módulo fiscal (F1/F2): lista de notas, nova nota (preparar) e
// editar, detalhe (emitir, anexar PDF, XML) e configuração do certificado A1.
// Renovação do miolo — R20 (29/09/2026): padrão Command Center (cc-, tema
// escuro, sem Tailwind). Mesmos formulários (action/method/enctype/name), o
// mesmo GET do CNPJ, os mesmos confirm e os mesmos ids que o script da nota
// usa ($('valor'), $('servico'), $('c-liq')…).
import { renderLayout } from './views.js';
import type { DashUser } from './permissions.js';
import type { NotaLinha } from '../financeiro/fiscal/notas-repo.js';
import {
  cabecalhoPagina, cartaoSecao, tabela, pilulaStatus, botao, estadoVazio, faixaKpis, celulaDupla,
  aviso as avisoCc, type Tom,
} from './ui/componentes.js';
import { temaDaTela } from './ui/tema.js';

function escapeHtml(s: string | null | undefined): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBr = (iso: string) => iso.split('-').reverse().join('/');

/** Situação da nota em pílula (mesmos rótulos de antes, sem emoji). */
const STATUS: Record<string, { tom: Tom; texto: string }> = {
  rascunho: { tom: 'sem_dado', texto: 'Rascunho' },
  preparada: { tom: 'atencao', texto: 'Preparada (emitir no portal)' },
  enviada: { tom: 'acompanhar', texto: 'Enviada' },
  autorizada: { tom: 'normal', texto: 'Autorizada' },
  rejeitada: { tom: 'critico', texto: 'Rejeitada' },
  cancelada: { tom: 'sem_dado', texto: 'Cancelada' },
};
const pilulaNota = (status: string) => {
  const s = STATUS[status] ?? { tom: 'sem_dado' as Tom, texto: status };
  return pilulaStatus(s.tom, s.texto);
};

export interface ServicoOpt { id: string; nome: string; cod_trib_nacional: string; descricao_padrao: string; aliquota_iss: number }
export interface ConfigInfo {
  cnpj: string; inscricao_municipal: string; razao_social: string; cert_validade: string | null;
  ambiente?: 'homologacao' | 'producao'; serie_dps?: string; proximo_ndps?: number; cert_storage_path?: string | null;
}

const badgeAmbiente = (ambiente: 'homologacao' | 'producao' | null | undefined) => ambiente === 'producao'
  ? pilulaStatus('normal', 'Produção')
  : pilulaStatus('atencao', 'Homologação — teste');

const CSS_FISCAL = `
.cc-nf .cc-panel+.cc-panel,.cc-nf .cc-kstrip+.cc-panel,.cc-nf .cc-panel+.cc-nf-rodape{margin-top:16px}
.cc-nf .cc-kstrip{margin-bottom:16px}
.cc-nf-estreito{max-width:880px}
.cc-nf-val{font-family:var(--cc-f-num);font-variant-numeric:tabular-nums;white-space:nowrap}
.cc-nf-form{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px 14px;align-items:end}
.cc-nf-form .cc-nf-2{grid-column:span 2}
.cc-nf-form .cc-nf-3{grid-column:span 3}
.cc-nf-form .cc-nf-cheia{grid-column:1/-1}
.cc-nf-doc{display:flex;gap:8px;align-items:stretch}
.cc-nf-doc input{flex:1;min-width:0}
.cc-nf-doc .cc-btn{white-space:nowrap;min-height:40px}
.cc-nf-dica{margin:0;font-size:12.5px;color:var(--cc-muted);line-height:1.5}
.cc-nf-check{display:flex;gap:10px;align-items:flex-start;font-size:13.5px;color:var(--cc-text-2);line-height:1.4}
.cc-nf-check input{margin-top:3px;width:16px;height:16px;accent-color:var(--cc-gold)}
.cc-nf-conta{display:flex;flex-wrap:wrap;gap:6px 18px;align-items:baseline;padding:12px 14px;border:1px dashed var(--cc-line-2);border-radius:12px;font-size:13.5px;color:var(--cc-text-2)}
.cc-nf-conta b{font-family:var(--cc-f-num);font-variant-numeric:tabular-nums;color:var(--cc-text)}
.cc-nf-conta .cc-nf-liq{color:var(--cc-ok);font-size:16px}
.cc-nf-enviar{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.cc-nf-lista{margin:0;padding:0;list-style:none;display:grid;grid-template-columns:max-content minmax(0,1fr);gap:8px 14px;font-size:13.5px}
.cc-nf-lista dt{color:var(--cc-muted)}
.cc-nf-lista dd{margin:0;overflow-wrap:anywhere;color:var(--cc-text)}
.cc-nf code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;background:var(--cc-surface-2);border:1px solid var(--cc-line);border-radius:6px;padding:1px 6px;overflow-wrap:anywhere;word-break:break-all}
.cc-nf-passo{font-size:13.5px;color:var(--cc-text-2);line-height:1.6;margin:0 0 10px}
.cc-nf-passo b{color:var(--cc-text)}
.cc-nf-passo+.cc-nf-lista{margin-bottom:16px}
.cc-nf-anexar{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-top:4px}
.cc-nf-anexar .cc-campo{min-width:200px}
.cc-nf-acoes{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.cc-nf-acoes form{margin:0}
.cc-nf-linha{display:flex;gap:10px;flex-wrap:wrap;align-items:center;font-size:13.5px;color:var(--cc-text-2)}
.cc-nf-linha form{margin:0}
.cc-nf-rodape{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.cc-nf-ok{color:var(--cc-ok);font-size:13.5px;margin:0}
.cc-nf-radios{display:flex;flex-direction:column;gap:8px;border:0;margin:0;padding:0}
.cc-nf-radios legend{font-size:11.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--cc-muted);margin-bottom:6px;padding:0}
.cc-nf-radios label{display:flex;gap:10px;align-items:center;font-size:13.5px;color:var(--cc-text-2)}
.cc-nf-radios input{accent-color:var(--cc-gold);width:16px;height:16px}
.cc-nf-cfg{display:flex;flex-direction:column;gap:16px}
.cc-nf-tbl .cc-btn{white-space:nowrap}
@media (max-width:1100px){.cc-nf-form{grid-template-columns:repeat(2,minmax(0,1fr))}.cc-nf-form .cc-nf-3{grid-column:span 2}}
@media (max-width:760px){
  .cc-nf-form{grid-template-columns:minmax(0,1fr)}
  .cc-nf-form .cc-nf-2,.cc-nf-form .cc-nf-3{grid-column:auto}
  .cc-nf-doc{flex-direction:column}
  .cc-nf-doc .cc-btn{justify-content:center;min-height:44px}
  .cc-nf-lista{grid-template-columns:minmax(0,1fr);gap:2px}
  .cc-nf-lista dd{margin-bottom:8px}
  .cc-nf-anexar{flex-direction:column;align-items:stretch}
  .cc-nf-anexar .cc-btn,.cc-nf-enviar .cc-btn{justify-content:center;width:100%}
  .cc-nf-enviar form{width:100%}
}
`;

function pagina(title: string, user: DashUser | undefined, body: string, scripts?: string, largo = false): string {
  return renderLayout({
    active: 'fiscal', title, user, scripts,
    body: `<div class="cc-root cc-nf${largo ? '' : ' cc-nf-estreito'}">${body}</div>`,
    tailwind: false, dark: temaDaTela(user, 'escuro') === 'escuro', largo,
    cabeca: `<style>${CSS_FISCAL}</style>`,
  });
}

const TRILHA_NOTAS = [{ rotulo: 'Financeiro', href: '/dashboard/financeiro' }, { rotulo: 'Notas fiscais', href: '/dashboard/fiscal' }];

function avisoTela(aviso?: { tipo: 'ok' | 'erro'; texto: string }): string {
  return aviso ? avisoCc({ tom: aviso.tipo, texto: aviso.texto }) : '';
}

// ---------------------------------------------------------------------------
// Lista
// ---------------------------------------------------------------------------

export function renderNotasPage(notas: NotaLinha[], config: ConfigInfo | null, user?: DashUser): string {
  const alertaCert = config?.cert_validade
    ? (new Date(config.cert_validade) < new Date(Date.now() + 30 * 864e5)
      ? avisoCc({ tom: 'erro', texto: `Certificado digital vence em ${dataBr(config.cert_validade)} — renove o A1 pra manter a emissão.` }) : '')
    : avisoCc({ tom: 'info', texto: 'Validade do certificado não cadastrada.' });
  const valor = (n: number) => ({ html: `<span class="cc-nf-val">${escapeHtml(brl(n))}</span>` });
  const lista = notas.length === 0
    ? estadoVazio({ tipo: 'vazio', titulo: 'Nenhuma nota ainda', texto: 'Clique em "Nova nota" pra preparar a primeira.', icone: 'receipt' })
    : tabela({
      colunas: [
        { titulo: 'Tomador' }, { titulo: 'Nº' }, { titulo: 'Competência' },
        { titulo: 'Bruto', alinhar: 'dir' }, { titulo: 'ISS retido', alinhar: 'dir' }, { titulo: 'Líquido', alinhar: 'dir' },
        { titulo: 'Situação' }, { titulo: '', alinhar: 'dir' },
      ],
      linhas: notas.map((n) => [
        { html: celulaDupla(n.tomador.nome, n.tomador.tipo === 'PF' ? 'Pessoa física' : 'Empresa') },
        n.numero ?? null,
        dataBr(n.competencia),
        valor(n.valorBruto),
        n.issRetido ? valor(n.valorIss) : null,
        { html: `<b class="cc-nf-val">${escapeHtml(brl(n.valorLiquido))}</b>` },
        { html: pilulaNota(n.status) },
        { html: botao({ rotulo: 'Abrir', href: `/dashboard/fiscal/${n.id}`, tamanho: 'sm', tom: 'fantasma' }) },
      ]),
      mobile: 'cartoes',
    });
  const body = `
${cabecalhoPagina({
    trilha: TRILHA_NOTAS,
    titulo: 'Notas fiscais (NFS-e)',
    subtitulo: 'Prepare a nota, emita (daqui ou no portal do ISS) e ela entra no caixa como conta a receber.',
    acoesHtml: botao({ rotulo: 'Nova nota', href: '/dashboard/fiscal/nova', tom: 'ouro', icone: 'plus' }),
  })}
${alertaCert}
${cartaoSecao({ titulo: 'Notas', dica: notas.length ? `${notas.length} ${notas.length === 1 ? 'nota' : 'notas'}` : undefined, corpoHtml: lista, classe: 'cc-nf-tbl' })}`;
  return pagina('Notas fiscais', user, body, undefined, true);
}

// ---------------------------------------------------------------------------
// Nova / editar
// ---------------------------------------------------------------------------

export interface NovaNotaPrefill {
  nome?: string; doc?: string; valor?: number; fechamentoId?: string; leadId?: string; erro?: string;
  notaId?: string; im?: string; endereco?: string; municipio?: string; uf?: string; email?: string;
  tipo?: 'PJ' | 'PF'; servicoId?: string; descricao?: string; competencia?: string; issRetido?: boolean;
  cep?: string; logradouro?: string; numero?: string; bairro?: string; codMunIbge?: string;
}

export function renderNovaNotaPage(servicos: ServicoOpt[], prefill: NovaNotaPrefill, user?: DashUser): string {
  const opts = servicos.map((s) => `<option value="${escapeHtml(s.id)}" data-aliq="${s.aliquota_iss}" data-descr="${escapeHtml(s.descricao_padrao)}"${prefill.servicoId === s.id ? ' selected' : ''}>${escapeHtml(s.nome)} (${escapeHtml(s.cod_trib_nacional)})</option>`).join('');
  const editando = Boolean(prefill.notaId);
  const acao = editando ? `/dashboard/fiscal/${escapeHtml(prefill.notaId!)}/editar` : '/dashboard/fiscal/nova';
  const titulo = editando ? 'Editar nota (preparada)' : 'Nova nota';
  const botaoEnviar = editando ? 'Salvar alterações' : 'Preparar nota';
  const campo = (rotulo: string, input: string, cls = '') => `<label class="cc-campo${cls ? ` ${cls}` : ''}"><span>${escapeHtml(rotulo)}</span>${input}</label>`;
  const semServico = servicos.length === 0
    ? avisoCc({ tom: 'atencao', texto: 'Nenhum serviço fiscal cadastrado pra esta empresa — sem ele a nota não sai. Fale com o suporte pra cadastrar.' })
    : '';

  const tomador = `
  ${campo('Tomador é', `<select name="tipo" id="tipo"><option value="PJ"${prefill.tipo !== 'PF' ? ' selected' : ''}>PJ (CNPJ)</option><option value="PF"${prefill.tipo === 'PF' ? ' selected' : ''}>PF (CPF)</option></select>`)}
  <label class="cc-campo cc-nf-3"><span>CNPJ/CPF</span><div class="cc-nf-doc"><input name="doc" id="doc" value="${escapeHtml(prefill.doc ?? '')}" inputmode="numeric" required>${botao({ rotulo: 'Buscar dados', icone: 'search', attrs: { id: 'buscar' } })}</div></label>
  ${campo('Nome/Razão social', `<input name="nome" id="nome" value="${escapeHtml(prefill.nome ?? '')}" required>`, 'cc-nf-cheia')}
  ${campo('Inscrição municipal (se PJ do DF)', `<input name="im" id="im" value="${escapeHtml(prefill.im ?? '')}">`, 'cc-nf-2')}
  ${campo('E-mail do tomador', `<input name="email" id="email" type="email" value="${escapeHtml(prefill.email ?? '')}">`, 'cc-nf-2')}`;

  const endereco = `
  ${campo('Logradouro (rua)', `<input name="logradouro" id="logradouro" value="${escapeHtml(prefill.logradouro ?? prefill.endereco ?? '')}">`, 'cc-nf-3')}
  ${campo('Número', `<input name="numero" id="numero" value="${escapeHtml(prefill.numero ?? '')}">`)}
  ${campo('Bairro', `<input name="bairro" id="bairro" value="${escapeHtml(prefill.bairro ?? '')}">`, 'cc-nf-2')}
  ${campo('CEP', `<input name="cep" id="cep" value="${escapeHtml(prefill.cep ?? '')}" inputmode="numeric">`, 'cc-nf-2')}
  <input type="hidden" name="cod_mun_ibge" id="cod_mun_ibge" value="${escapeHtml(prefill.codMunIbge ?? '')}">
  ${campo('Município', `<input name="municipio" id="municipio" value="${escapeHtml(prefill.municipio ?? 'Brasília')}">`, 'cc-nf-3')}
  ${campo('UF', `<input name="uf" id="uf" value="${escapeHtml(prefill.uf ?? 'DF')}" maxlength="2">`)}
  <p class="cc-nf-dica cc-nf-cheia">O fisco exige endereço completo quando o tomador é PJ ou o ISS é retido — o "Buscar dados" preenche sozinho.</p>`;

  const servico = `
  ${campo('Serviço', `<select name="servico_id" id="servico">${opts}</select>`, 'cc-nf-cheia')}
  ${campo('Descrição na nota', `<textarea name="descricao" id="descricao" rows="2">${escapeHtml(prefill.descricao ?? '')}</textarea>`, 'cc-nf-cheia')}
  ${campo('Valor do serviço (R$)', `<input name="valor" id="valor" type="text" inputmode="decimal" value="${prefill.valor ?? ''}" placeholder="ex.: 1.500,00" required>`, 'cc-nf-2')}
  ${campo('Competência', `<input name="competencia" type="date" value="${escapeHtml(prefill.competencia ?? new Date().toISOString().slice(0, 10))}" required>`, 'cc-nf-2')}
  <label class="cc-nf-check cc-nf-cheia"><input type="checkbox" name="iss_retido" id="retido"${prefill.issRetido ? ' checked' : ''}><span>ISS retido pelo tomador (marca sozinho pra PJ do DF)</span></label>
  <div class="cc-nf-conta cc-nf-cheia" id="conta">
    <span>Bruto: <b id="c-bruto">—</b></span>
    <span><span id="c-aliq">5%</span>: <b id="c-iss">—</b></span>
    <span>Líquido a receber: <b id="c-liq" class="cc-nf-liq">—</b></span>
  </div>`;

  const body = `
${cabecalhoPagina({
    trilha: [...TRILHA_NOTAS, { rotulo: editando ? 'Editar nota' : 'Nova nota' }],
    titulo,
    subtitulo: editando ? 'A nota ainda não foi emitida — dá pra corrigir antes de emitir.' : 'Preencha quem recebe a nota, o serviço e o valor. A conta do ISS aparece embaixo.',
  })}
${prefill.erro ? avisoCc({ tom: 'erro', texto: prefill.erro }) : ''}
${semServico}
<form method="post" action="${acao}" class="cc-form"${editando ? ' data-edit="1"' : ''}>
  <input type="hidden" name="fechamento_id" value="${escapeHtml(prefill.fechamentoId ?? '')}">
  <input type="hidden" name="lead_id" value="${escapeHtml(prefill.leadId ?? '')}">
  ${cartaoSecao({ titulo: 'Quem recebe a nota (tomador)', corpoHtml: `<div class="cc-nf-form">${tomador}</div>` })}
  ${cartaoSecao({ titulo: 'Endereço do tomador', corpoHtml: `<div class="cc-nf-form">${endereco}</div>` })}
  ${cartaoSecao({ titulo: 'Serviço e valor', corpoHtml: `<div class="cc-nf-form">${servico}</div>` })}
  <div class="cc-nf-rodape" style="margin-top:16px">${botao({ rotulo: botaoEnviar, tipo: 'submit', tom: 'ouro', icone: 'check' })}${botao({ rotulo: 'Voltar pras notas', href: '/dashboard/fiscal', tom: 'fantasma' })}</div>
</form>`;
  const scripts = `
<script>
(function(){
  const $ = (id) => document.getElementById(id);
  function conta(){
    const raw = ($('valor').value||'0').trim();
    const v = parseFloat(raw.includes(',') ? raw.replace(/\\./g,'').replace(',','.') : raw)||0;
    const aliq = parseFloat($('servico').selectedOptions[0]?.dataset.aliq||'0.05');
    const iss = Math.round(v*aliq*100)/100, ret = $('retido').checked;
    $('c-bruto').textContent = v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    $('c-aliq').textContent = 'ISS '+(aliq*100).toLocaleString('pt-BR')+'%';
    $('c-iss').textContent = iss.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) + (ret?' (retido)':' (você recolhe no DAS)');
    $('c-liq').textContent = (ret?v-iss:v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  }
  function autoRetencao(){
    $('retido').checked = $('tipo').value==='PJ' && $('uf').value.toUpperCase()==='DF'; conta();
  }
  ['valor','retido','servico'].forEach(id=>$(id).addEventListener('input',conta));
  ['tipo','uf'].forEach(id=>$(id).addEventListener('change',autoRetencao));
  $('servico').addEventListener('change',()=>{ if(!$('descricao').value) $('descricao').value = $('servico').selectedOptions[0]?.dataset.descr||''; conta(); });
  $('buscar').addEventListener('click', async ()=>{
    const r = await fetch('/dashboard/fiscal/cnpj/'+encodeURIComponent($('doc').value));
    if(!r.ok){ alert('Não achei — preenche à mão.'); return; }
    const d = await r.json();
    $('nome').value=d.razaoSocial; $('municipio').value=d.municipio; $('uf').value=d.uf; if(d.email)$('email').value=d.email;
    $('logradouro').value=d.logradouro||d.endereco||''; $('numero').value=d.numero||''; $('bairro').value=d.bairro||''; $('cep').value=d.cep||''; $('cod_mun_ibge').value=d.codMunIbge||'';
    autoRetencao();
  });
  if (document.querySelector('form[data-edit="1"]')) { conta(); } else { autoRetencao(); }
})();
</script>`;
  return pagina(editando ? 'Editar nota' : 'Nova nota', user, body, scripts);
}

// ---------------------------------------------------------------------------
// Detalhe
// ---------------------------------------------------------------------------

export function renderNotaDetalhe(n: NotaLinha, config: ConfigInfo | null, user?: DashUser, aviso?: { tipo: 'ok' | 'erro'; texto: string }): string {
  const temCert = Boolean(config?.cert_storage_path);
  const id = escapeHtml(n.id);

  const emitir = n.status === 'preparada' ? (temCert
    ? cartaoSecao({
      titulo: 'Emitir daqui',
      dica: 'a NFS-e sai assinada com o certificado A1',
      acoesHtml: badgeAmbiente(config?.ambiente),
      corpoHtml: `<div class="cc-nf-enviar">
    <form method="post" action="/dashboard/fiscal/${id}/emitir" onsubmit="return confirm('Emitir esta NFS-e agora?')">
      ${botao({ rotulo: 'Emitir agora', tipo: 'submit', tom: 'ouro', icone: 'zap' })}
    </form>
  </div>
  ${config?.ambiente !== 'producao' ? `<p class="cc-nf-dica" style="margin-top:10px">Ambiente de TESTE — a nota emitida aqui não vale e não mexe no caixa.</p>` : ''}`,
    })
    : cartaoSecao({
      titulo: 'Emitir daqui',
      corpoHtml: `<div class="cc-nf-linha"><span>Pra emitir daqui direto, cadastre o certificado A1.</span>${botao({ rotulo: 'Cadastrar certificado', href: '/dashboard/fiscal/config', tamanho: 'sm', icone: 'shield' })}</div>`,
    })) : '';

  const autorizada = n.status === 'autorizada' && n.chaveAcesso ? cartaoSecao({
    titulo: 'NFS-e emitida daqui',
    acoesHtml: badgeAmbiente(n.ambienteEmissao ?? undefined),
    corpoHtml: `<dl class="cc-nf-lista">
      ${n.numero ? `<dt>Número</dt><dd><code>${escapeHtml(n.numero)}</code></dd>` : ''}
      <dt>Chave de acesso</dt><dd><code>${escapeHtml(n.chaveAcesso)}</code></dd>
    </dl>
    <div class="cc-nf-rodape" style="margin-top:12px">${botao({ rotulo: 'Baixar XML', href: `/dashboard/fiscal/${n.id}/xml`, tamanho: 'sm', icone: 'download' })}</div>`,
  }) : '';

  const testeHomolog = n.status === 'preparada' && n.chaveAcesso && n.ambienteEmissao === 'homologacao' ? cartaoSecao({
    titulo: 'Teste de homologação passou',
    acoesHtml: badgeAmbiente('homologacao'),
    corpoHtml: `<p class="cc-nf-passo">Chave <code>${escapeHtml(n.chaveAcesso)}</code>. A nota continua <b>preparada</b> pra emissão de verdade (troque o ambiente pra produção na configuração).</p>
    <div class="cc-nf-rodape">${botao({ rotulo: 'Configuração fiscal', href: '/dashboard/fiscal/config', tamanho: 'sm', icone: 'cog' })}${botao({ rotulo: 'XML do teste', href: `/dashboard/fiscal/${n.id}/xml`, tamanho: 'sm', icone: 'download' })}</div>`,
  }) : '';

  const enviadaTravada = n.status === 'enviada' ? cartaoSecao({
    titulo: 'Enviada — aguardando confirmação',
    acoesHtml: pilulaStatus('critico', 'confira no portal'),
    corpoHtml: `<p class="cc-nf-passo">A conexão pode ter caído no meio do envio. <b>Confira no portal do ISS se a NFS-e saiu.</b> Se NÃO saiu, destrave pra tentar de novo:</p>
    <form method="post" action="/dashboard/fiscal/${id}/voltar" onsubmit="return confirm('Conferiu no portal que a nota NÃO saiu? Se ela saiu e você emitir de novo, sai NOTA DUPLICADA.')">
      ${botao({ rotulo: 'Voltar pra preparada (não saiu no portal)', tipo: 'submit', icone: 'clock' })}
    </form>`,
  }) : '';

  const preparar = n.status === 'preparada' ? cartaoSecao({
    titulo: 'Emitir pelo portal do ISS',
    dica: 'se preferir não emitir daqui',
    corpoHtml: `<p class="cc-nf-passo"><b>1) Emitir no portal</b> — abra <a class="cc-link" href="https://iss.fazenda.df.gov.br/online/" target="_blank" rel="noopener">iss.fazenda.df.gov.br/online</a> e copie:</p>
    <dl class="cc-nf-lista">
      <dt>Tomador</dt><dd><code>${escapeHtml(n.tomador.doc)}</code> — ${escapeHtml(n.tomador.nome)}${n.tomador.im ? ` (IM ${escapeHtml(n.tomador.im)})` : ''}</dd>
      <dt>Descrição</dt><dd><code>${escapeHtml(n.descricao)}</code></dd>
      <dt>Valor</dt><dd><code>${escapeHtml(brl(n.valorBruto))}</code> · ISS ${n.issRetido ? '<b>Retido pelo Tomador</b>' : 'devido pelo prestador'}</dd>
      <dt>Competência</dt><dd>${escapeHtml(dataBr(n.competencia))}</dd>
    </dl>
    <p class="cc-nf-passo"><b>2) Voltar aqui com o PDF</b></p>
    <form method="post" action="/dashboard/fiscal/${id}/anexar" enctype="multipart/form-data" class="cc-form cc-nf-anexar">
      <label class="cc-campo"><span>Nº da NFS-e</span><input name="numero" placeholder="ex.: 84" required></label>
      <label class="cc-campo"><span>PDF da nota</span><input type="file" name="pdf" accept="application/pdf" required></label>
      ${botao({ rotulo: 'Anexar e lançar no caixa', tipo: 'submit', icone: 'file' })}
    </form>`,
  }) : '';

  const acoesPreparada = n.status === 'preparada' ? `<div class="cc-nf-acoes">
  ${botao({ rotulo: 'Editar', href: `/dashboard/fiscal/${n.id}/editar`, tamanho: 'sm', icone: 'doc-check' })}
  <form method="post" action="/dashboard/fiscal/${id}/excluir" onsubmit="return confirm('Excluir este rascunho de nota? Não dá pra desfazer.')">
    ${botao({ rotulo: 'Excluir', tipo: 'submit', tom: 'critico', tamanho: 'sm' })}
  </form>
</div>` : '';

  const kpis = faixaKpis([
    { rotulo: 'Valor bruto', valor: n.valorBruto, casas: 2, prefixo: 'R$' },
    { rotulo: n.issRetido ? 'ISS retido pelo tomador' : 'ISS (você recolhe no DAS)', valor: n.valorIss, casas: 2, prefixo: 'R$' },
    { rotulo: 'Líquido a receber', valor: n.valorLiquido, casas: 2, prefixo: 'R$', destaque: true },
  ]);

  const rodape = [
    n.pdfStoragePath ? botao({ rotulo: 'Baixar PDF', href: `/dashboard/fiscal/${n.id}/pdf`, tamanho: 'sm', icone: 'download' }) : '',
    n.contaReceberId ? '<p class="cc-nf-ok">Conta a receber criada no caixa.</p>' : '',
  ].filter(Boolean).join('');

  const body = `
${cabecalhoPagina({
    trilha: [...TRILHA_NOTAS, { rotulo: n.numero ? `Nota nº ${n.numero}` : 'Nota preparada' }],
    titulo: n.numero ? `Nota nº ${n.numero}` : 'Nota (preparada)',
    seloHtml: pilulaNota(n.status),
    subtitulo: `${n.tomador.nome} · competência ${dataBr(n.competencia)}`,
    acoesHtml: acoesPreparada,
  })}
${avisoTela(aviso)}
${kpis}
${testeHomolog}
${enviadaTravada}
${emitir}
${autorizada}
${preparar}
${rodape ? `<div class="cc-nf-rodape" style="margin-top:16px">${rodape}</div>` : ''}
<div class="cc-nf-rodape" style="margin-top:16px">${botao({ rotulo: '← todas as notas', href: '/dashboard/fiscal', tom: 'fantasma', tamanho: 'sm' })}</div>`;
  return pagina(`Nota ${n.numero ?? ''}`.trim(), user, body);
}

// ---------------------------------------------------------------------------
// Configuração (certificado A1 + ambiente)
// ---------------------------------------------------------------------------

export function renderConfigFiscalPage(config: ConfigInfo | null, aviso?: { tipo: 'ok' | 'erro'; texto: string }, user?: DashUser): string {
  const temCert = Boolean(config?.cert_storage_path);
  const cert = temCert
    ? `${pilulaStatus('normal', 'Certificado cadastrado')}${config!.cert_validade ? ` <span class="cc-muted">vale até <b>${escapeHtml(dataBr(config!.cert_validade))}</b></span>` : ''}`
    : `${pilulaStatus('critico', 'Certificado A1 não cadastrado')} <span class="cc-muted">— sem ele a emissão automática não funciona.</span>`;
  const amb = config?.ambiente ?? 'homologacao';
  const bannerTeste = amb !== 'producao'
    ? avisoCc({ tom: 'atencao', texto: 'Ambiente de TESTE (homologação) — as notas emitidas aqui não valem e não mexem no caixa.' })
    : '';
  const dados = cartaoSecao({
    titulo: 'Dados da empresa na nota',
    acoesHtml: badgeAmbiente(amb),
    corpoHtml: `<dl class="cc-nf-lista">
    <dt>Razão social</dt><dd><b>${escapeHtml(config?.razao_social ?? '—')}</b></dd>
    <dt>CNPJ</dt><dd><code>${escapeHtml(config?.cnpj ?? '—')}</code></dd>
    <dt>Inscrição municipal</dt><dd><code>${escapeHtml(config?.inscricao_municipal ?? '—')}</code></dd>
    <dt>Série da DPS</dt><dd><code>${escapeHtml(config?.serie_dps ?? '1')}</code> · próximo nº <code>${escapeHtml(String(config?.proximo_ndps ?? 1))}</code></dd>
    <dt>Certificado</dt><dd>${cert}</dd>
  </dl>`,
  });
  const body = `
${cabecalhoPagina({
    trilha: [...TRILHA_NOTAS, { rotulo: 'Configuração fiscal' }],
    titulo: 'Configuração fiscal',
    subtitulo: 'Emissão automática: o ambiente (teste ou de verdade) e o certificado digital A1.',
  })}
${avisoTela(aviso)}
${bannerTeste}
${dados}
<form method="post" action="/dashboard/fiscal/config" enctype="multipart/form-data" class="cc-form cc-nf-cfg" style="margin-top:16px">
  ${cartaoSecao({
    titulo: 'Ambiente de emissão',
    corpoHtml: `<fieldset class="cc-nf-radios"><legend>Onde a nota sai</legend>
    <label><input type="radio" name="ambiente" value="homologacao"${amb !== 'producao' ? ' checked' : ''}> Homologação (teste — nota sem valor)</label>
    <label><input type="radio" name="ambiente" value="producao"${amb === 'producao' ? ' checked' : ''}> Produção (nota de verdade)</label>
  </fieldset>`,
  })}
  ${cartaoSecao({
    titulo: 'Certificado A1 (.pfx)',
    corpoHtml: `<div class="cc-nf-form">
    <label class="cc-campo cc-nf-2"><span>Arquivo .pfx</span><input type="file" name="pfx" accept=".pfx,.p12"></label>
    <label class="cc-campo cc-nf-2"><span>Senha do certificado</span><input type="password" name="senha" autocomplete="off"></label>
    <p class="cc-nf-dica cc-nf-cheia">A senha é guardada cifrada e usada só na hora de assinar. Deixe em branco pra manter o certificado atual.</p>
  </div>`,
  })}
  <div class="cc-nf-rodape">${botao({ rotulo: 'Salvar', tipo: 'submit', tom: 'ouro', icone: 'check' })}${botao({ rotulo: '← todas as notas', href: '/dashboard/fiscal', tom: 'fantasma' })}</div>
</form>`;
  return pagina('Configuração fiscal', user, body);
}
