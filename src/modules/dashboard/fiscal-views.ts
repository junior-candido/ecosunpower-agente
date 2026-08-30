// src/modules/dashboard/fiscal-views.ts
// Telas do módulo fiscal (F1): lista de notas, nova nota (preparar), detalhe c/ anexar PDF.
import { renderLayout } from './views.js';
import type { DashUser } from './permissions.js';
import type { NotaLinha } from '../financeiro/fiscal/notas-repo.js';

function escapeHtml(s: string | null | undefined): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const STATUS: Record<string, string> = {
  rascunho: '📝 Rascunho', preparada: '🕐 Preparada (emitir no portal)', enviada: '📤 Enviada',
  autorizada: '✅ Autorizada', rejeitada: '❌ Rejeitada', cancelada: '🚫 Cancelada',
};

export interface ServicoOpt { id: string; nome: string; cod_trib_nacional: string; descricao_padrao: string; aliquota_iss: number }
export interface ConfigInfo { cnpj: string; inscricao_municipal: string; razao_social: string; cert_validade: string | null }

export function renderNotasPage(notas: NotaLinha[], config: ConfigInfo | null, user?: DashUser): string {
  const alertaCert = config?.cert_validade
    ? (new Date(config.cert_validade) < new Date(Date.now() + 30 * 864e5)
      ? `<div class="card" style="border:1px solid #f87171;border-radius:10px;padding:10px;margin-bottom:8px"><b>⚠️ Certificado digital vence em ${config.cert_validade.split('-').reverse().join('/')}</b> — renove o A1 pra manter a emissão.</div>` : '')
    : '<div class="card" style="border:1px solid #fbbf24;border-radius:10px;padding:10px;margin-bottom:8px">ℹ️ Validade do certificado não cadastrada.</div>';
  const linhas = notas.map((n) => `
    <tr class="border-b border-gray-800">
      <td class="p-2">${escapeHtml(n.numero ?? '—')}</td>
      <td class="p-2">${n.competencia.split('-').reverse().join('/')}</td>
      <td class="p-2">${escapeHtml(n.tomador.nome)}</td>
      <td class="p-2 text-right">${brl(n.valorBruto)}</td>
      <td class="p-2 text-right">${n.issRetido ? brl(n.valorIss) : '—'}</td>
      <td class="p-2 text-right font-bold">${brl(n.valorLiquido)}</td>
      <td class="p-2">${STATUS[n.status] ?? n.status}</td>
      <td class="p-2"><a class="text-cyan-300" href="/dashboard/fiscal/${n.id}">abrir</a></td>
    </tr>`).join('');
  const body = `
<div style="color:#d1d5db">
<h1 class="text-xl font-bold text-cyan-300 mb-4">🧾 Notas fiscais (NFS-e)</h1>
${alertaCert}
<div class="my-3"><a href="/dashboard/fiscal/nova" class="px-3 py-2 rounded bg-cyan-700 text-white">+ Nova nota</a></div>
<div style="overflow-x:auto"><table class="w-full text-sm">
<thead><tr class="text-left text-gray-400"><th class="p-2">Nº</th><th class="p-2">Competência</th><th class="p-2">Tomador</th><th class="p-2">Bruto</th><th class="p-2">ISS retido</th><th class="p-2">Líquido</th><th class="p-2">Status</th><th></th></tr></thead>
<tbody>${linhas || '<tr><td class="p-3 text-gray-500" colspan="8">Nenhuma nota ainda. Clique em "+ Nova nota".</td></tr>'}</tbody>
</table></div></div>`;
  return renderLayout({ active: 'fiscal', title: 'Notas fiscais', body, dark: true, user });
}

export interface NovaNotaPrefill {
  nome?: string; doc?: string; valor?: number; fechamentoId?: string; leadId?: string; erro?: string;
  notaId?: string; im?: string; endereco?: string; municipio?: string; uf?: string; email?: string;
  tipo?: 'PJ' | 'PF'; servicoId?: string; descricao?: string; competencia?: string; issRetido?: boolean;
}

export function renderNovaNotaPage(servicos: ServicoOpt[], prefill: NovaNotaPrefill, user?: DashUser): string {
  const opts = servicos.map((s) => `<option value="${s.id}" data-aliq="${s.aliquota_iss}" data-descr="${escapeHtml(s.descricao_padrao)}"${prefill.servicoId === s.id ? ' selected' : ''}>${escapeHtml(s.nome)} (${s.cod_trib_nacional})</option>`).join('');
  const editando = Boolean(prefill.notaId);
  const acao = editando ? `/dashboard/fiscal/${escapeHtml(prefill.notaId!)}/editar` : '/dashboard/fiscal/nova';
  const titulo = editando ? '🧾 Editar nota (preparada)' : '🧾 Nova nota';
  const botao = editando ? 'Salvar alterações' : 'Preparar nota';
  const body = `
<div style="color:#d1d5db;max-width:640px">
<h1 class="text-xl font-bold text-cyan-300 mb-4">${titulo}</h1>
${prefill.erro ? `<div class="card" style="border:1px solid #f87171;border-radius:10px;padding:8px;margin-bottom:8px">${escapeHtml(prefill.erro)}</div>` : ''}
<form method="post" action="${acao}" class="space-y-3"${editando ? ' data-edit="1"' : ''}>
  <input type="hidden" name="fechamento_id" value="${escapeHtml(prefill.fechamentoId ?? '')}">
  <input type="hidden" name="lead_id" value="${escapeHtml(prefill.leadId ?? '')}">
  <label class="block">Tomador é <select name="tipo" id="tipo" class="bg-gray-800 p-1 rounded"><option value="PJ"${prefill.tipo !== 'PF' ? ' selected' : ''}>PJ (CNPJ)</option><option value="PF"${prefill.tipo === 'PF' ? ' selected' : ''}>PF (CPF)</option></select></label>
  <label class="block">CNPJ/CPF <input name="doc" id="doc" value="${escapeHtml(prefill.doc ?? '')}" class="bg-gray-800 p-1 rounded w-full" required>
    <button type="button" id="buscar" class="px-2 py-1 rounded bg-gray-700 mt-1">🔎 Buscar dados</button></label>
  <label class="block">Nome/Razão social <input name="nome" id="nome" value="${escapeHtml(prefill.nome ?? '')}" class="bg-gray-800 p-1 rounded w-full" required></label>
  <label class="block">Inscrição municipal (se PJ do DF) <input name="im" id="im" value="${escapeHtml(prefill.im ?? '')}" class="bg-gray-800 p-1 rounded w-full"></label>
  <label class="block">Endereço <input name="endereco" id="endereco" value="${escapeHtml(prefill.endereco ?? '')}" class="bg-gray-800 p-1 rounded w-full"></label>
  <div class="grid grid-cols-2 gap-2">
    <label>Município <input name="municipio" id="municipio" value="${escapeHtml(prefill.municipio ?? 'Brasília')}" class="bg-gray-800 p-1 rounded w-full"></label>
    <label>UF <input name="uf" id="uf" value="${escapeHtml(prefill.uf ?? 'DF')}" class="bg-gray-800 p-1 rounded w-full" maxlength="2"></label>
  </div>
  <label class="block">E-mail do tomador <input name="email" id="email" type="email" value="${escapeHtml(prefill.email ?? '')}" class="bg-gray-800 p-1 rounded w-full"></label>
  <label class="block">Serviço <select name="servico_id" id="servico" class="bg-gray-800 p-1 rounded w-full">${opts}</select></label>
  <label class="block">Descrição na nota <textarea name="descricao" id="descricao" class="bg-gray-800 p-1 rounded w-full" rows="2">${escapeHtml(prefill.descricao ?? '')}</textarea></label>
  <div class="grid grid-cols-2 gap-2">
    <label>Valor do serviço (R$) <input name="valor" id="valor" type="text" inputmode="decimal" value="${prefill.valor ?? ''}" class="bg-gray-800 p-1 rounded w-full" required></label>
    <label>Competência <input name="competencia" type="date" value="${escapeHtml(prefill.competencia ?? new Date().toISOString().slice(0, 10))}" class="bg-gray-800 p-1 rounded w-full" required></label>
  </div>
  <label class="block"><input type="checkbox" name="iss_retido" id="retido"${prefill.issRetido ? ' checked' : ''}> ISS retido pelo tomador (marca sozinho pra PJ do DF)</label>
  <div class="card" style="border:1px solid #1b2040;border-radius:10px;padding:10px" id="conta">
    Bruto: <b id="c-bruto">—</b> · ISS <span id="c-aliq">5%</span>: <b id="c-iss">—</b> · líquido a receber: <b id="c-liq" class="text-emerald-300">—</b>
  </div>
  <button class="px-4 py-2 rounded bg-cyan-700 text-white">${botao}</button>
</form></div>`;
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
    $('nome').value=d.razaoSocial; $('endereco').value=d.endereco; $('municipio').value=d.municipio; $('uf').value=d.uf; if(d.email)$('email').value=d.email;
    autoRetencao();
  });
  if (document.querySelector('form[data-edit="1"]')) { conta(); } else { autoRetencao(); }
})();
</script>`;
  return renderLayout({ active: 'fiscal', title: 'Nova nota', body, scripts, dark: true, user });
}

export function renderNotaDetalhe(n: NotaLinha, _config: ConfigInfo | null, user?: DashUser): string {
  const preparar = n.status === 'preparada' ? `
  <div class="card" style="border:1px solid #1b2040;border-radius:10px;padding:12px;margin:10px 0">
    <b>1) Emitir no portal</b> — abra <a class="text-cyan-300" href="https://iss.fazenda.df.gov.br/online/" target="_blank">iss.fazenda.df.gov.br/online</a> e copie:
    <ul class="text-sm mt-2" style="line-height:1.8">
      <li>Tomador: <code>${escapeHtml(n.tomador.doc)}</code> — ${escapeHtml(n.tomador.nome)}${n.tomador.im ? ` (IM ${escapeHtml(n.tomador.im)})` : ''}</li>
      <li>Descrição: <code>${escapeHtml(n.descricao)}</code></li>
      <li>Valor: <code>${brl(n.valorBruto)}</code> · ISS ${n.issRetido ? '<b>Retido pelo Tomador</b>' : 'devido pelo prestador'}</li>
      <li>Competência: ${n.competencia.split('-').reverse().join('/')}</li>
    </ul>
    <b class="block mt-3">2) Voltar aqui com o PDF</b>
    <form method="post" action="/dashboard/fiscal/${n.id}/anexar" enctype="multipart/form-data" class="mt-2 space-y-2">
      <input name="numero" placeholder="Nº da NFS-e (ex.: 84)" class="bg-gray-800 p-1 rounded" required>
      <input type="file" name="pdf" accept="application/pdf" required>
      <button class="px-3 py-2 rounded bg-emerald-700 text-white">Anexar e lançar no caixa</button>
    </form>
  </div>` : '';
  const acoesPreparada = n.status === 'preparada' ? `
<p class="mt-1">
  <a class="text-cyan-300" href="/dashboard/fiscal/${n.id}/editar">✏️ Editar</a>
  <form method="post" action="/dashboard/fiscal/${n.id}/excluir" style="display:inline" onsubmit="return confirm('Excluir este rascunho de nota? Não dá pra desfazer.')">
    <button class="text-rose-400" style="background:none;border:none;cursor:pointer">🗑️ Excluir</button>
  </form>
</p>` : '';
  const body = `
<div style="color:#d1d5db;max-width:640px">
<h1 class="text-xl font-bold text-cyan-300 mb-2">🧾 Nota ${n.numero ? 'nº ' + escapeHtml(n.numero) : '(preparada)'}</h1>
<p>${STATUS[n.status] ?? n.status} · ${escapeHtml(n.tomador.nome)} · ${brl(n.valorBruto)} → líquido <b>${brl(n.valorLiquido)}</b>${n.issRetido ? ` (ISS retido ${brl(n.valorIss)})` : ''}</p>
${acoesPreparada}
${preparar}
${n.pdfStoragePath ? `<p><a class="text-cyan-300" href="/dashboard/fiscal/${n.id}/pdf">📄 Baixar PDF</a></p>` : ''}
${n.contaReceberId ? '<p class="text-emerald-300">✅ Conta a receber criada no caixa.</p>' : ''}
<p class="mt-3"><a class="text-gray-400" href="/dashboard/fiscal">← todas as notas</a></p>
</div>`;
  return renderLayout({ active: 'fiscal', title: `Nota ${escapeHtml(n.numero ?? '')}`, body, dark: true, user });
}
