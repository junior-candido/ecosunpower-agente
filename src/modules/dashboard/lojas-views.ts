// src/modules/dashboard/lojas-views.ts
// Tela "Comparador de Lojas" v2: (1) placar por loja, (2) MONTAR KIT → total do
// conjunto (módulos+inversor+estrutura) em cada loja, (3) CATÁLOGO por loja com
// filtros. Lê da catalogo_loja (tabela viva). Growatt filtrado. Só render.
import { renderLayout, escapeHtml, brl } from './views.js';
import type { KitLoja, EspecKit } from '../vendas/lojas/kit.js';
import type { ItemCatalogo } from '../vendas/lojas/catalogo-loja.js';

const FONTE_LABEL: Record<string, string> = { belenus: 'Belenus', solfacil: 'Sol Fácil', fortlev: 'Fortlev' };
const CAT_LABEL: Record<string, string> = {
  modulo: 'Módulos', micro: 'Microinversores', inversor_string: 'Inversores string',
  inversor_hibrido: 'Inversores híbridos', bateria: 'Baterias', estrutura: 'Estrutura',
  cabo: 'Cabos', componente: 'Componentes',
};

function placarLojas(cont: Record<string, number>, atualizadoEmMs: number | null): string {
  const h = atualizadoEmMs ? Math.floor((Date.now() - atualizadoEmMs) / 3_600_000) : null;
  const quando = h == null ? '' : h === 0 ? 'agora há pouco' : h < 24 ? `há ${h}h` : `há ${Math.floor(h / 24)}d`;
  const chip = (f: string) => {
    const n = cont[f] ?? 0, ok = n > 0;
    const cor = ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-400';
    return `<div class="rounded-lg border ${cor} px-3 py-2 text-center min-w-[104px]"><div class="text-lg font-bold">${n}</div><div class="text-xs">${FONTE_LABEL[f]} ${ok ? '✅' : '⚠️'}</div></div>`;
  };
  return `<div class="flex items-center gap-2 flex-wrap mb-5">${chip('belenus')}${chip('solfacil')}${chip('fortlev')}${quando ? `<div class="text-xs text-slate-500 ml-1">atualizado ${quando}</div>` : ''}</div>`;
}

function kitCard(k: KitLoja, ehMelhor: boolean): string {
  const linha = (rot: string, it: { marca: string; descricao: string; preco: number } | null, qtd: number, tot: number) =>
    it ? `<div class="flex justify-between gap-2 text-sm py-1 border-b border-slate-100">
        <span class="text-slate-600">${rot}${qtd > 1 ? ` <span class="text-slate-400">${qtd}×</span>` : ''}<br><span class="text-xs text-slate-400">${escapeHtml((it.marca + ' ' + it.descricao).slice(0, 46))}</span></span>
        <span class="text-right whitespace-nowrap">${brl(tot)}</span></div>`
      : `<div class="flex justify-between text-sm py-1 border-b border-slate-100 text-amber-600"><span>${rot}</span><span>não tem</span></div>`;
  const borda = ehMelhor ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-slate-200';
  return `<div class="rounded-xl border ${borda} bg-white p-4">
    <div class="flex items-center justify-between mb-2">
      <div class="font-bold text-slate-800">${FONTE_LABEL[k.fonte] ?? k.fonte}</div>
      ${ehMelhor ? '<span class="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">🏆 mais barato</span>' : ''}
    </div>
    ${linha('Módulos', k.modulo, k.moduloQtd, k.moduloTotal)}
    ${linha('Inversor', k.inversor, 1, k.inversorTotal)}
    ${linha('Estrutura', k.estrutura, k.moduloQtd, k.estruturaTotal)}
    <div class="flex justify-between mt-2 pt-1 font-bold text-slate-800"><span>Total do kit</span><span>${brl(k.total)}</span></div>
    ${k.faltando.length ? `<div class="text-xs text-amber-600 mt-1">⚠️ faltou nesta loja: ${k.faltando.join(', ')} (total parcial)</div>` : ''}
  </div>`;
}

function secaoKit(spec: EspecKit | null, kits: KitLoja[]): string {
  const v = (x: unknown) => (x == null ? '' : String(x));
  const form = `<form method="get" action="/dashboard/lojas" class="flex flex-wrap items-end gap-3 mb-4">
    <label class="text-sm">Nº de módulos<br><input name="modulos" type="number" min="1" value="${v(spec?.modulos)}" class="border border-slate-300 rounded px-2 py-1 w-24" placeholder="ex: 12"></label>
    <label class="text-sm">Wp do módulo<br><input name="wp" type="number" value="${v(spec?.wpModulo)}" class="border border-slate-300 rounded px-2 py-1 w-24" placeholder="ex: 615"></label>
    <label class="text-sm">Inversor (kW)<br><input name="invkw" type="number" step="0.1" value="${v(spec?.inversorKw)}" class="border border-slate-300 rounded px-2 py-1 w-24" placeholder="ex: 8"></label>
    <button class="px-4 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-sm font-semibold">Montar kit</button>
  </form>`;

  let corpo = '<p class="text-sm text-slate-500">Preencha e clique <b>Montar kit</b> pra ver o total do conjunto em cada loja.</p>';
  if (spec) {
    const melhorTotal = kits.filter((k) => k.faltando.length === 0).sort((a, b) => a.total - b.total)[0]?.total;
    corpo = kits.length
      ? `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">${kits.map((k) => kitCard(k, k.total === melhorTotal && k.faltando.length === 0)).join('')}</div>
         <p class="text-xs text-slate-400 mt-2">Kit = módulos × qtd + inversor + estrutura × qtd. Preço: Belenus/Fortlev à vista · Sol Fácil no Pix. Frete e cabos não inclusos.</p>`
      : '<p class="text-sm text-amber-600">Nenhuma loja tem dados pra montar esse kit ainda.</p>';
  }
  return `<h2 class="text-sm font-semibold text-slate-600 mb-2">🧰 Montar kit → total por loja</h2>${form}${corpo}`;
}

function tabelaCatalogo(itens: ItemCatalogo[], catSel: string, fonteSel: string): string {
  const cats = ['', 'modulo', 'micro', 'inversor_string', 'inversor_hibrido', 'bateria', 'estrutura', 'cabo', 'componente'];
  const fontes = ['', 'belenus', 'solfacil', 'fortlev'];
  const opt = (val: string, sel: string, label: string) => `<option value="${val}"${val === sel ? ' selected' : ''}>${label}</option>`;
  const filtro = `<form method="get" action="/dashboard/lojas" class="flex flex-wrap items-end gap-3 mb-3">
    <label class="text-sm">Categoria<br><select name="cat" class="border border-slate-300 rounded px-2 py-1">
      ${cats.map((c) => opt(c, catSel, c ? CAT_LABEL[c] : 'Todas')).join('')}</select></label>
    <label class="text-sm">Loja<br><select name="fonte" class="border border-slate-300 rounded px-2 py-1">
      ${fontes.map((f) => opt(f, fonteSel, f ? FONTE_LABEL[f] : 'Todas')).join('')}</select></label>
    <button class="px-4 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-sm font-semibold">Filtrar</button>
  </form>`;
  const linhas = itens.slice(0, 400).map((i) => `<tr class="border-t border-slate-100 hover:bg-slate-50">
      <td class="px-3 py-1.5 text-xs text-slate-500">${escapeHtml(CAT_LABEL[i.categoria] ?? i.categoria)}</td>
      <td class="px-3 py-1.5 text-xs">${escapeHtml(FONTE_LABEL[i.fonte] ?? i.fonte)}</td>
      <td class="px-3 py-1.5 font-medium text-slate-800">${escapeHtml(i.marca)}</td>
      <td class="px-3 py-1.5 text-slate-600 text-sm">${escapeHtml((i.descricao || i.modelo).slice(0, 60))}</td>
      <td class="px-3 py-1.5 text-slate-500 text-sm">${i.potenciaW ? (i.categoria === 'modulo' ? i.potenciaW + 'Wp' : (i.potenciaW / 1000) + 'kW') : '—'}</td>
      <td class="px-3 py-1.5 text-right font-semibold">${brl(i.precoUnitario)}</td>
    </tr>`).join('');
  return `<h2 class="text-sm font-semibold text-slate-600 mb-2 mt-8">📚 Catálogo por loja</h2>${filtro}
    <div class="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table class="min-w-full text-sm"><thead class="bg-slate-100 text-slate-600 text-xs uppercase"><tr>
        <th class="px-3 py-2 text-left">Categoria</th><th class="px-3 py-2 text-left">Loja</th><th class="px-3 py-2 text-left">Marca</th>
        <th class="px-3 py-2 text-left">Produto</th><th class="px-3 py-2 text-left">Potência</th><th class="px-3 py-2 text-right">Preço</th>
      </tr></thead><tbody>${linhas || '<tr><td colspan="6" class="px-3 py-4 text-center text-slate-400">Nada com esse filtro.</td></tr>'}</tbody></table>
    </div>
    <p class="text-xs text-slate-400 mt-2">${itens.length} itens${itens.length > 400 ? ' (mostrando 400)' : ''} · ordenado do mais barato. Growatt não entra (fora do padrão da casa).</p>`;
}

export interface LojasPageInput {
  totalItens: number;
  contagemPorFonte: Record<string, number>;
  atualizadoEmMs: number | null;
  kitSpec: EspecKit | null;
  kits: KitLoja[];
  catalogo: ItemCatalogo[];
  catSel: string;
  fonteSel: string;
  user?: any;
}

export function renderLojasPage(input: LojasPageInput): string {
  const { totalItens, contagemPorFonte, atualizadoEmMs, kitSpec, kits, catalogo, catSel, fonteSel, user } = input;
  const body = `<div class="max-w-6xl mx-auto">
    <div class="flex items-center justify-between flex-wrap gap-2 mb-3">
      <h1 class="text-xl font-bold text-slate-800">🏪 Comparador de Lojas</h1>
      <div class="text-sm text-slate-500">${totalItens} itens</div>
    </div>
    ${placarLojas(contagemPorFonte, atualizadoEmMs)}
    ${totalItens === 0
      ? `<div class="rounded-lg border border-slate-200 bg-white p-6 text-center text-slate-600">Ainda não há preços na tabela viva. A Sol Fácil sincroniza sozinha 1×/dia; Belenus/Fortlev o Junior atualiza sob demanda.</div>`
      : `${secaoKit(kitSpec, kits)}${tabelaCatalogo(catalogo, catSel, fonteSel)}`}
  </div>`;
  return renderLayout({ active: 'lojas', title: 'Comparador de Lojas', body, user });
}
