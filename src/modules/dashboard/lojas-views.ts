// src/modules/dashboard/lojas-views.ts
// Tela "Comparador de Lojas": mostra, por produto equivalente, o preço em cada
// distribuidora (Belenus/Sol Fácil/Fortlev), destaca o mais barato + economia, e
// lista as oportunidades de desconto. Lê da catalogo_loja (tabela viva). Só render.
import { renderLayout, escapeHtml, brl } from './views.js';
import type { GrupoComparacao } from '../vendas/lojas/comparador.js';
import type { OportunidadeDesconto } from '../vendas/lojas/cotacao.js';

const CAT_LABEL: Record<string, string> = {
  modulo: 'Módulos', micro: 'Microinversores', inversor_string: 'Inversores string',
  inversor_hibrido: 'Inversores híbridos', bateria: 'Baterias', estrutura: 'Estrutura',
  cabo: 'Cabos', componente: 'Componentes',
};
const FONTE_LABEL: Record<string, string> = { belenus: 'Belenus', solfacil: 'Sol Fácil', fortlev: 'Fortlev' };

function espec(g: GrupoComparacao): string {
  if (!g.potenciaW) return '';
  const pot = g.categoria === 'modulo' ? `${g.potenciaW} Wp` : `${g.potenciaW / 1000} kW`;
  return [pot, g.tensao ? `${g.tensao}V` : '', g.fase ?? ''].filter(Boolean).join(' · ');
}

function celaPreco(g: GrupoComparacao, fonte: string): string {
  const of = g.ofertas.find((o) => o.fonte === fonte);
  if (!of) return '<td class="px-3 py-2 text-slate-300 text-center">—</td>';
  const melhor = of.fonte === g.melhor.fonte;
  const cls = melhor ? 'font-bold text-emerald-700 bg-emerald-50' : 'text-slate-700';
  return `<td class="px-3 py-2 text-right ${cls}">${brl(of.preco)}${melhor ? ' 🏆' : ''}</td>`;
}

function linhaGrupo(g: GrupoComparacao): string {
  return `<tr class="border-t border-slate-100 hover:bg-slate-50">
    <td class="px-3 py-2 text-slate-500 text-xs">${escapeHtml(CAT_LABEL[g.categoria] ?? g.categoria)}</td>
    <td class="px-3 py-2 font-medium text-slate-800">${escapeHtml(g.marca)}</td>
    <td class="px-3 py-2 text-slate-600 text-sm">${escapeHtml(espec(g))}</td>
    ${celaPreco(g, 'belenus')}${celaPreco(g, 'solfacil')}${celaPreco(g, 'fortlev')}
    <td class="px-3 py-2 text-right text-emerald-700 font-semibold">${brl(g.economia)}<span class="text-slate-400 text-xs"> (${g.economiaPct}%)</span></td>
  </tr>`;
}

function cardOportunidade(o: OportunidadeDesconto): string {
  return `<div class="rounded-lg border border-amber-200 bg-amber-50 p-3">
    <div class="font-semibold text-slate-800">${escapeHtml(o.descricao)}</div>
    <div class="text-sm text-slate-600 mt-1">Mais barato na <b>${escapeHtml(FONTE_LABEL[o.comprandoEm] ?? o.comprandoEm)}</b>: ${brl(o.precoMelhor)}</div>
    <div class="text-sm text-slate-500">vs. ${escapeHtml(FONTE_LABEL[o.seComprarEm] ?? o.seComprarEm)}: ${brl(o.precoPior)}</div>
    <div class="mt-1 text-emerald-700 font-semibold">Economia ${brl(o.economia)} (${o.economiaPct}%)</div>
    <div class="text-xs text-slate-500 mt-1">💡 Compre na ${escapeHtml(FONTE_LABEL[o.comprandoEm] ?? o.comprandoEm)} — ou peça desconto ao vendedor da ${escapeHtml(FONTE_LABEL[o.seComprarEm] ?? o.seComprarEm)}.</div>
  </div>`;
}

export interface LojasPageInput {
  grupos: GrupoComparacao[];
  oportunidades: OportunidadeDesconto[];
  totalItens: number;             // itens ativos na catalogo_loja
  fontesComDados: string[];       // lojas que têm dados hoje
  atualizadoEmMs: number | null;  // item mais recente
  user?: any;
}

export function renderLojasPage(input: LojasPageInput): string {
  const { grupos, oportunidades, totalItens, fontesComDados, atualizadoEmMs, user } = input;

  const vazio = totalItens === 0;
  const idade = atualizadoEmMs ? Math.floor((Date.now() - atualizadoEmMs) / 86400_000) : null;
  const selo = fontesComDados.length
    ? fontesComDados.map((f) => FONTE_LABEL[f] ?? f).join(' · ')
    : 'nenhuma loja ainda';

  const body = vazio
    ? `<div class="max-w-2xl mx-auto mt-10 text-center">
         <div class="text-5xl mb-3">🏪</div>
         <h1 class="text-xl font-bold text-slate-800">Comparador de Lojas</h1>
         <p class="text-slate-600 mt-2">Ainda não há preços na tabela viva. O robô puxa os catálogos de Belenus, Sol Fácil e Fortlev 1×/dia — assim que rodar, os produtos aparecem aqui com o melhor preço entre as lojas.</p>
         <p class="text-slate-400 text-sm mt-2">(Depende dos segredos das lojas configurados no servidor.)</p>
       </div>`
    : `<div class="max-w-6xl mx-auto">
        <div class="flex items-center justify-between flex-wrap gap-2 mb-4">
          <h1 class="text-xl font-bold text-slate-800">🏪 Comparador de Lojas</h1>
          <div class="text-sm text-slate-500">${totalItens} itens · ${escapeHtml(selo)}${idade !== null ? ` · atualizado ${idade === 0 ? 'hoje' : `há ${idade} d`}` : ''}</div>
        </div>

        ${oportunidades.length ? `<h2 class="text-sm font-semibold text-slate-600 mb-2">💰 Onde economizar / pedir desconto (top ${Math.min(oportunidades.length, 12)})</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
          ${oportunidades.slice(0, 12).map(cardOportunidade).join('')}
        </div>` : ''}

        <h2 class="text-sm font-semibold text-slate-600 mb-2">Comparação por produto (mesmo item em 2+ lojas)</h2>
        <div class="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table class="min-w-full text-sm">
            <thead class="bg-slate-100 text-slate-600 text-xs uppercase">
              <tr>
                <th class="px-3 py-2 text-left">Categoria</th>
                <th class="px-3 py-2 text-left">Marca</th>
                <th class="px-3 py-2 text-left">Espec.</th>
                <th class="px-3 py-2 text-right">Belenus</th>
                <th class="px-3 py-2 text-right">Sol Fácil</th>
                <th class="px-3 py-2 text-right">Fortlev</th>
                <th class="px-3 py-2 text-right">Economia</th>
              </tr>
            </thead>
            <tbody>${grupos.map(linhaGrupo).join('')}</tbody>
          </table>
        </div>
        <p class="text-xs text-slate-400 mt-3">🏆 = mais barato. Compara o mesmo produto (marca + potência + tensão) entre as lojas. Preço: Belenus/Fortlev à vista · Sol Fácil no Pix. Frete não incluído (varia por transportadora).</p>
       </div>`;

  return renderLayout({ active: 'lojas', title: 'Comparador de Lojas', body, user });
}
