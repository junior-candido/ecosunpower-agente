// src/modules/dashboard/os-views.ts
// Tela do form da OS (checklist 3-em-1 + upload de fotos) + laudo HTML imprimível.
import { renderLayout, escapeHtml } from './views.js';
import type { DashUser } from './permissions.js';
import type { OSRow, FotoOS } from './os-queries.js';
import { progressoOS, type ItemPreenchido, type ResumoOS } from './os-checklist.js';
import { empresa } from '../empresa-config.js';

const TIPO_LABEL: Record<string, string> = {
  limpeza: '🧹 Limpeza', revisao_inversor: '🔌 Revisão inversor',
  revisao_eletrica: '⚡ Revisão elétrica', corretiva: '🔧 Corretiva', inspecao: '🔎 Inspeção',
};

function renderItem(osId: string, i: ItemPreenchido, fotos: FotoOS[], travado: boolean): string {
  const dis = travado ? 'disabled' : '';
  if (i.kind === 'check') {
    return `<label class="flex items-center gap-2 py-1"><input type="checkbox" name="${escapeHtml(i.chave)}" ${i.valor === true ? 'checked' : ''} ${dis}> ${escapeHtml(i.label)}</label>`;
  }
  if (i.kind === 'medicao') {
    return `<label class="flex items-center gap-2 py-1">${escapeHtml(i.label)}
      <input type="text" name="${escapeHtml(i.chave)}" value="${escapeHtml(String(i.valor ?? ''))}" placeholder="${escapeHtml(i.unidade ?? '')}" class="border rounded px-2 py-0.5 text-sm" ${dis}></label>`;
  }
  // foto
  const minis = fotos.filter((f) => f.item_chave === i.chave)
    .map((f) => `<img src="${escapeHtml(f.url ?? '#')}" class="w-16 h-16 object-cover rounded border">`).join('');
  const upload = travado ? '' : `
    <form method="post" action="/dashboard/os/${escapeHtml(osId)}/foto" enctype="multipart/form-data" class="inline-flex items-center gap-1 mt-1">
      <input type="hidden" name="itemChave" value="${escapeHtml(i.chave)}">
      <input type="file" name="foto" accept="image/*" class="text-xs">
      <button class="px-2 py-0.5 rounded bg-slate-700 text-white text-xs">📷 Enviar</button>
    </form>`;
  return `<div class="py-1"><div class="text-sm">${escapeHtml(i.label)} <span class="text-xs text-slate-400">(${i.fotos} foto${i.fotos === 1 ? '' : 's'})</span></div>
    <div class="flex flex-wrap gap-1 mt-1">${minis}</div>${upload}</div>`;
}

export function renderOSPage(os: OSRow, itens: ItemPreenchido[], fotos: FotoOS[], user?: DashUser): string {
  const travado = os.status !== 'aberta';
  const p = progressoOS(itens);
  const body = `
  <div class="max-w-2xl">
    <a href="/dashboard/manutencao" class="text-xs text-slate-500 hover:underline">← Manutenção</a>
    <h1 class="text-xl font-bold text-slate-900 mt-1">📋 OS — ${TIPO_LABEL[os.tipo] ?? escapeHtml(os.tipo)}</h1>
    <p class="text-sm text-slate-600">${escapeHtml(os.apelido ?? 'usina')} · ${escapeHtml(os.clienteNome ?? '')}</p>
    <p class="text-xs ${travado ? 'text-emerald-600' : 'text-slate-500'} mb-3">${travado ? '✅ OS concluída' : `Progresso: ${p.feitos}/${p.total} (${p.pct}%)`}</p>

    <form method="post" action="/dashboard/os/${escapeHtml(os.id)}/salvar" class="bg-white border rounded-xl p-4">
      ${itens.map((i) => renderItem(os.id, i, fotos, travado)).join('')}
      <label class="block text-sm mt-3">Observações
        <textarea name="observacoes" class="w-full border rounded px-2 py-1 text-sm mt-1" rows="3" ${travado ? 'disabled' : ''}>${escapeHtml(os.observacoes ?? '')}</textarea>
      </label>
      ${travado ? '' : `<div class="flex gap-2 mt-3">
        <button class="px-3 py-1.5 rounded bg-slate-600 text-white text-sm">💾 Salvar</button>
        <button formaction="/dashboard/os/${escapeHtml(os.id)}/concluir" class="px-3 py-1.5 rounded bg-emerald-600 text-white text-sm">✅ Concluir OS</button>
      </div>`}
    </form>
    <a href="/dashboard/os/${escapeHtml(os.id)}/laudo" target="_blank" class="inline-block mt-3 px-3 py-1.5 rounded bg-violet-600 text-white text-sm">📄 Gerar laudo (PDF)</a>
  </div>`;
  return renderLayout({ active: 'manutencao', title: 'Ordem de Serviço', body, user });
}

export function renderOSLaudoHtml(os: OSRow, resumo: ResumoOS, fotos: FotoOS[], responsavel: string): string {
  const e = empresa();
  const data = (os.concluida_em ?? os.aberta_em).slice(0, 10).split('-').reverse().join('/');
  const checks = resumo.checks.map((c) => `<li>✅ ${escapeHtml(c)}</li>`).join('') || '<li>—</li>';
  const medicoes = resumo.medicoes.map((m) => `<tr><td>${escapeHtml(m.label)}</td><td>${escapeHtml(m.valor)} ${escapeHtml(m.unidade ?? '')}</td></tr>`).join('')
    || '<tr><td colspan="2">—</td></tr>';
  const galeria = fotos.map((f) => `<figure><img src="${escapeHtml(f.url ?? '#')}"><figcaption>${escapeHtml(f.legenda ?? f.item_chave ?? '')}</figcaption></figure>`).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Laudo de Serviço — ${escapeHtml(os.apelido ?? '')}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:800px;margin:0 auto;padding:24px}
  h1{font-size:20px} h2{font-size:15px;border-bottom:1px solid #cbd5e1;padding-bottom:4px;margin-top:24px}
  table{width:100%;border-collapse:collapse} td{border:1px solid #e2e8f0;padding:6px;font-size:13px}
  ul{list-style:none;padding:0} li{padding:2px 0}
  .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
  figure{margin:0} img{width:100%;border-radius:6px;border:1px solid #e2e8f0} figcaption{font-size:11px;color:#64748b}
  .ass{margin-top:48px;border-top:1px solid #0f172a;width:280px;padding-top:6px;font-size:13px}
  @media print{ a{display:none} }
</style></head>
<body>
  <h1>${escapeHtml(e.nomeFantasia)} — Laudo de Serviço</h1>
  <p>${escapeHtml(os.apelido ?? '')} · Cliente: ${escapeHtml(os.clienteNome ?? '')} · Data: ${data}</p>
  <h2>Itens verificados</h2><ul>${checks}</ul>
  <h2>Medições</h2><table><tr><td><b>Item</b></td><td><b>Valor</b></td></tr>${medicoes}</table>
  ${os.observacoes ? `<h2>Observações</h2><p>${escapeHtml(os.observacoes)}</p>` : ''}
  ${galeria ? `<h2>Registro fotográfico</h2><div class="grid">${galeria}</div>` : ''}
  <div class="ass">${escapeHtml(responsavel)}</div>
</body></html>`;
}
