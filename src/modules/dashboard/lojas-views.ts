// src/modules/dashboard/lojas-views.ts
// Tela "Comparador de Lojas" v2: (1) placar por loja, (2) MONTAR KIT → total do
// conjunto (módulos+inversor+estrutura) em cada loja, (3) CATÁLOGO por loja com
// filtros. Lê da catalogo_loja (tabela viva). Growatt filtrado. Só render.
import { renderLayout, escapeHtml, brl } from './views.js';
import type { KitLoja, EspecKit } from '../vendas/lojas/kit.js';
import type { Cotacao, MargemNoPreco } from '../vendas/lojas/cotacao.js';
import type { ItemCatalogo } from '../vendas/lojas/catalogo-loja.js';
import type { KitOferta } from '../vendas/lojas/kit-oferta.js';

interface CotParams { servicoRsPorWp: number; impostoPct: number; margemAlvoPct: number; margemMinimaPct: number; }

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

// ---- Configurador de KIT REAL (preço de kit fechado da loja, não avulso) ----
export interface KitRealParams {
  power: number | null;
  region: string;          // DF | GO
  zipcode: string;
  inverterType: string;    // '' | micro | string
  inverterManufacturer: string;
}
export interface KitRealView {
  solfacil: KitOferta[];
  erros: string[];
  semCredencial: boolean;
  fortlev: 'assistida' | 'indisponivel';   // status até destravar
  belenus: 'assistida' | 'indisponivel';
}

function ofertaKitCard(o: KitOferta, ehMelhor: boolean): string {
  const pix = o.pagamentos.find((p) => /pix/i.test(p.nome));
  const rwp = o.rsPorWp != null ? `${o.rsPorWp.toString().replace('.', ',')}/Wp` : '';
  const borda = ehMelhor ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-slate-200';
  return `<div class="rounded-lg border ${borda} bg-white p-3">
    <div class="flex items-center justify-between mb-1">
      <div class="font-semibold text-slate-800 text-sm">${escapeHtml(o.inversorMarca)} <span class="text-slate-400">/</span> ${escapeHtml(o.moduloMarca)}</div>
      ${ehMelhor ? '<span class="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">🏆</span>' : ''}
    </div>
    <div class="flex items-baseline justify-between"><span class="text-lg font-bold text-slate-800">${brl(o.precoTotal)}</span><span class="text-xs text-slate-400">${rwp}</span></div>
    ${pix?.precoFinal != null ? `<div class="text-xs text-emerald-700">Pix ${brl(pix.precoFinal)}${pix.descontoPct ? ` (−${pix.descontoPct}%)` : ''}</div>` : ''}
    ${o.ehAlternativa ? '<div class="text-[11px] text-amber-600 mt-1">alternativa (não tinha o pedido exato)</div>' : ''}
  </div>`;
}

function colunaLoja(nome: string, corpo: string): string {
  return `<div class="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
    <div class="font-bold text-slate-700 text-sm mb-2">${nome}</div>${corpo}</div>`;
}

function secaoKitReal(p: KitRealParams, r: KitRealView | null): string {
  const v = (x: unknown) => (x == null ? '' : String(x));
  const optSel = (val: string, sel: string, label: string) => `<option value="${val}"${val === sel ? ' selected' : ''}>${label}</option>`;
  const form = `<form method="get" action="/dashboard/lojas" class="flex flex-wrap items-end gap-3 mb-4 bg-sky-50 border border-sky-200 rounded-lg p-3">
    <input type="hidden" name="aba" value="kitreal">
    <label class="text-sm">Potência (kWp)<br><input name="kwpreal" type="number" step="0.1" min="0.5" value="${v(p.power)}" class="border border-slate-300 rounded px-2 py-1 w-24" placeholder="ex: 5"></label>
    <label class="text-sm">Região<br><select name="regiao" class="border border-slate-300 rounded px-2 py-1">${optSel('DF', p.region, 'DF (Brasília)')}${optSel('GO', p.region, 'GO (Goiás)')}</select></label>
    <label class="text-sm">CEP (opcional)<br><input name="cep" type="text" value="${escapeHtml(p.zipcode)}" class="border border-slate-300 rounded px-2 py-1 w-28" placeholder="71993150"></label>
    <label class="text-sm">Inversor<br><select name="invtype" class="border border-slate-300 rounded px-2 py-1">${optSel('', p.inverterType, 'Qualquer')}${optSel('micro', p.inverterType, 'Micro')}${optSel('string', p.inverterType, 'String')}</select></label>
    <label class="text-sm">Marca inversor (opc.)<br><input name="invmarca" type="text" value="${escapeHtml(p.inverterManufacturer)}" class="border border-slate-300 rounded px-2 py-1 w-32" placeholder="ex: DEYE"></label>
    <button class="px-4 py-1.5 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-sm font-semibold">Montar kit real</button>
  </form>`;

  let corpo = '<p class="text-sm text-slate-500">Informe a potência e clique <b>Montar kit real</b> — puxo o <b>preço de kit fechado</b> de cada loja (não é soma de avulso).</p>';
  if (r) {
    if (r.semCredencial) {
      corpo = '<p class="text-sm text-amber-600">⚠️ Kit real indisponível: falta o login da loja no servidor (SOLFACIL_USER/PASS).</p>';
    } else {
      const melhorPreco = r.solfacil.filter((o) => o.precoTotal > 0)[0]?.precoTotal;
      const sfCorpo = r.solfacil.length
        ? `<div class="space-y-2">${r.solfacil.slice(0, 5).map((o) => ofertaKitCard(o, o.precoTotal === melhorPreco)).join('')}</div>`
        : `<p class="text-xs text-slate-400">${p.power ? 'Sem kit pra essa configuração.' : 'Informe a potência.'}</p>`;
      const fortlevCorpo = `<p class="text-xs text-slate-400">${r.fortlev === 'assistida' ? '🔧 assistida (puxo pelo seu Chrome) — em breve na tela' : 'servidor fora (504)'}</p>`;
      const belenusCorpo = `<p class="text-xs text-slate-400">🔧 assistida (puxo pelo seu Chrome) — em breve na tela</p>`;
      corpo = `<div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        ${colunaLoja('Sol Fácil ✅', sfCorpo)}
        ${colunaLoja('Fortlev', fortlevCorpo)}
        ${colunaLoja('Belenus', belenusCorpo)}
      </div>
      ${r.erros.length ? `<p class="text-xs text-amber-600 mt-2">${r.erros.map(escapeHtml).join(' · ')}</p>` : ''}
      <p class="text-xs text-slate-400 mt-2">Preço de kit fechado da loja. Sol Fácil por CEP; Belenus/Fortlev por cidade. Frete conforme a loja.</p>`;
    }
  }
  return `<h2 class="text-sm font-semibold text-slate-600 mb-2">🧰 Montar kit real → preço fechado por loja</h2>${form}${corpo}`;
}

/** Cotação do kit real mais barato — mesma matemática, preservando os params do configurador. */
function secaoCotacaoReal(
  p: KitRealParams, cot: Cotacao | null, cp: CotParams, precoManual: number | null,
  margManual: MargemNoPreco | null, melhorFonte: string | null,
): string {
  if (!cot) return '';
  const v = (x: unknown) => (x == null ? '' : String(x));
  const hidden = `<input type="hidden" name="aba" value="kitreal"><input type="hidden" name="kwpreal" value="${v(p.power)}"><input type="hidden" name="regiao" value="${escapeHtml(p.region)}"><input type="hidden" name="cep" value="${escapeHtml(p.zipcode)}"><input type="hidden" name="invtype" value="${escapeHtml(p.inverterType)}"><input type="hidden" name="invmarca" value="${escapeHtml(p.inverterManufacturer)}">`;
  const form = `<form method="get" action="/dashboard/lojas" class="flex flex-wrap items-end gap-3 mb-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
    ${hidden}
    <label class="text-sm">Serviço R$/Wp<br><input name="serv" type="number" step="0.01" value="${v(cp.servicoRsPorWp)}" class="border border-slate-300 rounded px-2 py-1 w-24"></label>
    <label class="text-sm">Imposto %<br><input name="imp" type="number" step="0.1" value="${v(cp.impostoPct)}" class="border border-slate-300 rounded px-2 py-1 w-20"></label>
    <label class="text-sm">Margem %<br><input name="marg" type="number" step="0.1" value="${v(cp.margemAlvoPct)}" class="border border-slate-300 rounded px-2 py-1 w-20"></label>
    <label class="text-sm">Seu preço (opcional)<br><input name="preco" type="text" value="${v(precoManual)}" class="border border-slate-300 rounded px-2 py-1 w-28" placeholder="ex: 22000"></label>
    <button class="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold">Calcular</button>
  </form>`;
  const linha = (r: string, val: string, forte = false) => `<div class="flex justify-between py-1 border-b border-slate-100 ${forte ? 'font-bold text-slate-800' : 'text-slate-600'}"><span>${r}</span><span>${val}</span></div>`;
  const sugerido = `<div class="rounded-xl border border-slate-200 bg-white p-4">
    <div class="font-bold text-slate-800 mb-2">Sugestão (margem ${cp.margemAlvoPct}%)</div>
    ${linha('Kit' + (melhorFonte ? ` (${FONTE_LABEL[melhorFonte] ?? melhorFonte})` : ''), brl(cot.custoMateriais))}
    ${linha('Serviço', brl(cot.custoServico))}
    ${linha('Custo total', brl(cot.custoTotal))}
    ${linha('Imposto', brl(cot.impostoValor))}
    ${linha('Preço sugerido', brl(cot.precoSugerido), true)}
    ${linha('Lucro', `${brl(cot.lucro)} (${cot.lucroPct}%)`)}
    ${linha('Pode baixar até', `${brl(cot.precoMinimo)} (desc. máx ${brl(cot.descontoMaxRs)})`)}
  </div>`;
  const seuPreco = margManual ? `<div class="rounded-xl border ${margManual.abaixoDoCusto ? 'border-red-300 bg-red-50' : 'border-emerald-300 bg-emerald-50'} p-4">
    <div class="font-bold text-slate-800 mb-2">No SEU preço</div>
    ${linha('Seu preço de venda', brl(margManual.precoVenda), true)}
    ${linha('Custo total', brl(cot.custoTotal))}
    ${linha('Imposto', brl(margManual.impostoValor))}
    ${linha('Lucro', `${brl(margManual.lucro)} (${margManual.lucroPct}%)`, true)}
    ${margManual.abaixoDoCusto ? '<div class="text-red-600 text-sm mt-1">⚠️ abaixo do custo — você teria prejuízo nesse preço.</div>' : ''}
  </div>` : `<div class="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 flex items-center">Digite <b class="mx-1">Seu preço</b> pra ver a margem no seu valor (a sugestão é só ponto de partida — o seu número manda).</div>`;
  return `<h3 class="text-sm font-semibold text-slate-600 mb-2 mt-4">💰 Cotação do kit real mais barato</h3>${form}
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">${sugerido}${seuPreco}</div>`;
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
    ${k.estruturaRsPorModulo > 0 ? `<div class="flex justify-between gap-2 text-sm py-1 border-b border-slate-100"><span class="text-slate-600">Estrutura <span class="text-slate-400">${k.moduloQtd}× R$${k.estruturaRsPorModulo}/mód</span></span><span>${brl(k.estruturaTotal)}</span></div>` : ''}
    <div class="flex justify-between mt-2 pt-1 font-bold text-slate-800"><span>Total do kit</span><span>${brl(k.total)}</span></div>
    ${k.faltando.length ? `<div class="text-xs text-amber-600 mt-1">⚠️ esta loja não tem o inversor pedido (total só de módulos${k.estruturaRsPorModulo > 0 ? '+estrutura' : ''})</div>` : ''}
  </div>`;
}

function secaoKit(spec: EspecKit | null, kits: KitLoja[], marcasMod: string[], marcasInv: string[], marcaMod: string, marcaInv: string): string {
  const v = (x: unknown) => (x == null ? '' : String(x));
  const optMarca = (lista: string[], sel: string, label: string) =>
    `<option value="">${label}</option>` + lista.map((m) => `<option value="${escapeHtml(m)}"${m === sel ? ' selected' : ''}>${escapeHtml(m)}</option>`).join('');
  const form = `<form method="get" action="/dashboard/lojas" class="flex flex-wrap items-end gap-3 mb-4">
    <label class="text-sm">Nº de módulos<br><input name="modulos" type="number" min="1" value="${v(spec?.modulos)}" class="border border-slate-300 rounded px-2 py-1 w-24" placeholder="ex: 12"></label>
    <label class="text-sm">Wp do módulo<br><input name="wp" type="number" value="${v(spec?.wpModulo)}" class="border border-slate-300 rounded px-2 py-1 w-24" placeholder="ex: 615"></label>
    <label class="text-sm">Marca módulo<br><select name="marcamod" class="border border-slate-300 rounded px-2 py-1">${optMarca(marcasMod, marcaMod, 'Mais barato')}</select></label>
    <label class="text-sm">Inversor (kW)<br><input name="invkw" type="number" step="0.1" value="${v(spec?.inversorKw)}" class="border border-slate-300 rounded px-2 py-1 w-24" placeholder="ex: 8"></label>
    <label class="text-sm">Marca inversor<br><select name="marcainv" class="border border-slate-300 rounded px-2 py-1">${optMarca(marcasInv, marcaInv, 'Mais barato')}</select></label>
    <label class="text-sm">Estrutura R$/módulo<br><input name="estr" type="number" step="0.01" value="${v(spec?.estruturaRsPorModulo)}" class="border border-slate-300 rounded px-2 py-1 w-24" placeholder="ex: 90"></label>
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

// ---- Cotação do kit (ajustável; o valor do Junior manda) ----
function secaoCotacao(
  spec: EspecKit, cot: Cotacao | null, p: CotParams, precoManual: number | null,
  margManual: MargemNoPreco | null, melhorFonte: string | null,
): string {
  if (!cot) return '';
  const v = (x: unknown) => (x == null ? '' : String(x));
  // form preserva o kit (hidden) + parâmetros ajustáveis
  const form = `<form method="get" action="/dashboard/lojas" class="flex flex-wrap items-end gap-3 mb-3 bg-slate-50 border border-slate-200 rounded-lg p-3">
    <input type="hidden" name="modulos" value="${v(spec.modulos)}"><input type="hidden" name="wp" value="${v(spec.wpModulo)}"><input type="hidden" name="invkw" value="${v(spec.inversorKw)}"><input type="hidden" name="marcamod" value="${v(spec.marcaModulo)}"><input type="hidden" name="marcainv" value="${v(spec.marcaInversor)}"><input type="hidden" name="estr" value="${v(spec.estruturaRsPorModulo)}">
    <label class="text-sm">Serviço R$/Wp<br><input name="serv" type="number" step="0.01" value="${v(p.servicoRsPorWp)}" class="border border-slate-300 rounded px-2 py-1 w-24"></label>
    <label class="text-sm">Imposto %<br><input name="imp" type="number" step="0.1" value="${v(p.impostoPct)}" class="border border-slate-300 rounded px-2 py-1 w-20"></label>
    <label class="text-sm">Margem %<br><input name="marg" type="number" step="0.1" value="${v(p.margemAlvoPct)}" class="border border-slate-300 rounded px-2 py-1 w-20"></label>
    <label class="text-sm">Seu preço (opcional)<br><input name="preco" type="text" value="${v(precoManual)}" class="border border-slate-300 rounded px-2 py-1 w-28" placeholder="ex: 22000"></label>
    <button class="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold">Calcular</button>
  </form>`;
  const linha = (r: string, val: string, forte = false) => `<div class="flex justify-between py-1 border-b border-slate-100 ${forte ? 'font-bold text-slate-800' : 'text-slate-600'}"><span>${r}</span><span>${val}</span></div>`;
  const sugerido = `<div class="rounded-xl border border-slate-200 bg-white p-4">
    <div class="font-bold text-slate-800 mb-2">Sugestão (margem ${p.margemAlvoPct}%)</div>
    ${linha('Materiais' + (melhorFonte ? ` (${FONTE_LABEL[melhorFonte] ?? melhorFonte})` : ''), brl(cot.custoMateriais))}
    ${linha('Serviço', brl(cot.custoServico))}
    ${linha('Custo total', brl(cot.custoTotal))}
    ${linha('Imposto', brl(cot.impostoValor))}
    ${linha('Preço sugerido', brl(cot.precoSugerido), true)}
    ${linha('Lucro', `${brl(cot.lucro)} (${cot.lucroPct}%)`)}
    ${linha('Pode baixar até', `${brl(cot.precoMinimo)} (desc. máx ${brl(cot.descontoMaxRs)})`)}
  </div>`;
  const seuPreco = margManual ? `<div class="rounded-xl border ${margManual.abaixoDoCusto ? 'border-red-300 bg-red-50' : 'border-emerald-300 bg-emerald-50'} p-4">
    <div class="font-bold text-slate-800 mb-2">No SEU preço</div>
    ${linha('Seu preço de venda', brl(margManual.precoVenda), true)}
    ${linha('Custo total', brl(cot.custoTotal))}
    ${linha('Imposto', brl(margManual.impostoValor))}
    ${linha('Lucro', `${brl(margManual.lucro)} (${margManual.lucroPct}%)`, true)}
    ${margManual.abaixoDoCusto ? '<div class="text-red-600 text-sm mt-1">⚠️ abaixo do custo — você teria prejuízo nesse preço.</div>' : ''}
  </div>` : `<div class="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 flex items-center">Digite <b class="mx-1">Seu preço</b> pra ver a margem no seu valor (a sugestão é só ponto de partida — o seu número manda).</div>`;
  return `<h2 class="text-sm font-semibold text-slate-600 mb-2 mt-6">💰 Cotação do kit mais barato</h2>${form}
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">${sugerido}${seuPreco}</div>`;
}

function tabelaCatalogo(itens: ItemCatalogo[], catSel: string, fonteSel: string, mostrarGrandes: boolean): string {
  const cats = ['', 'modulo', 'micro', 'inversor_string', 'inversor_hibrido', 'bateria', 'estrutura', 'cabo', 'componente'];
  const fontes = ['', 'belenus', 'solfacil', 'fortlev'];
  const opt = (val: string, sel: string, label: string) => `<option value="${val}"${val === sel ? ' selected' : ''}>${label}</option>`;
  const filtro = `<form method="get" action="/dashboard/lojas" class="flex flex-wrap items-end gap-3 mb-3">
    <label class="text-sm">Categoria<br><select name="cat" class="border border-slate-300 rounded px-2 py-1">
      ${cats.map((c) => opt(c, catSel, c ? CAT_LABEL[c] : 'Todas')).join('')}</select></label>
    <label class="text-sm">Loja<br><select name="fonte" class="border border-slate-300 rounded px-2 py-1">
      ${fontes.map((f) => opt(f, fonteSel, f ? FONTE_LABEL[f] : 'Todas')).join('')}</select></label>
    <label class="text-sm flex items-center gap-1 pb-1"><input type="checkbox" name="grandes" value="1"${mostrarGrandes ? ' checked' : ''}> mostrar inversores grandes (&gt;20kW)</label>
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
  cotacao: Cotacao | null;
  cotParams: CotParams;
  precoManual: number | null;
  margemManual: MargemNoPreco | null;
  melhorFonte: string | null;
  catalogo: ItemCatalogo[];
  catSel: string;
  fonteSel: string;
  mostrarGrandes: boolean;
  marcasModulo: string[];
  marcasInversor: string[];
  marcaMod: string;
  marcaInv: string;
  // Kit REAL (preço de kit fechado, ao vivo) — fatia nova
  kitReal: KitRealParams;
  kitRealView: KitRealView | null;
  cotReal: Cotacao | null;
  margemManualReal: MargemNoPreco | null;
  melhorFonteReal: string | null;
  user?: any;
}

export function renderLojasPage(input: LojasPageInput): string {
  const { totalItens, contagemPorFonte, atualizadoEmMs, kitSpec, kits, cotacao, cotParams, precoManual, margemManual, melhorFonte, catalogo, catSel, fonteSel, mostrarGrandes, marcasModulo, marcasInversor, marcaMod, marcaInv, kitReal, kitRealView, cotReal, margemManualReal, melhorFonteReal, user } = input;
  const cotacaoHtml = kitSpec ? secaoCotacao(kitSpec, cotacao, cotParams, precoManual, margemManual, melhorFonte) : '';
  const kitRealHtml = `${secaoKitReal(kitReal, kitRealView)}${secaoCotacaoReal(kitReal, cotReal, cotParams, precoManual, margemManualReal, melhorFonteReal)}`;
  const avulsoHtml = totalItens === 0
    ? `<div class="rounded-lg border border-slate-200 bg-white p-6 text-center text-slate-600">Ainda não há preços na tabela viva. A Sol Fácil sincroniza sozinha 1×/dia; Belenus/Fortlev o Junior atualiza sob demanda.</div>`
    : `${secaoKit(kitSpec, kits, marcasModulo, marcasInversor, marcaMod, marcaInv)}${cotacaoHtml}${tabelaCatalogo(catalogo, catSel, fonteSel, mostrarGrandes)}`;
  const body = `<div class="max-w-6xl mx-auto">
    <div class="flex items-center justify-between flex-wrap gap-2 mb-3">
      <h1 class="text-xl font-bold text-slate-800">🏪 Comparador de Lojas</h1>
      <div class="text-sm text-slate-500">${totalItens} itens</div>
    </div>
    ${placarLojas(contagemPorFonte, atualizadoEmMs)}
    ${kitRealHtml}
    <hr class="my-6 border-slate-200">
    <details${kitRealView ? '' : ' open'}>
      <summary class="text-sm font-semibold text-slate-500 cursor-pointer mb-3">📦 Peça solta / avulso (comparar item a item)</summary>
      ${avulsoHtml}
    </details>
  </div>`;
  return renderLayout({ active: 'lojas', title: 'Comparador de Lojas', body, user });
}
