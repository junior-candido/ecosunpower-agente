// src/modules/vendas/lojas/kit.ts
// Monta o kit (módulos + inversor) e calcula o TOTAL em cada loja, pra o Junior ver
// onde o CONJUNTO sai mais barato. A ESTRUTURA entra como R$/módulo que o Junior
// informa (varia muito por telhado; a loja vende em peça solta, não dá pra somar).
// Regra: só entra a loja que TEM o módulo pedido (não mostra "não tem"). PURO/testável.
import type { ItemCatalogo } from './catalogo-loja.js';

export interface EspecKit {
  modulos: number;
  wpModulo?: number | null;
  inversorKw?: number | null;
  marcaModulo?: string | null;
  marcaInversor?: string | null;
  estruturaRsPorModulo?: number | null;  // R$/módulo informado pelo Junior
}

export interface ItemEscolhido { marca: string; modelo: string; descricao: string; potenciaW: number | null; preco: number; }

export interface KitLoja {
  fonte: string;
  modulo: ItemEscolhido | null;
  moduloQtd: number;
  moduloTotal: number;
  inversor: ItemEscolhido | null;
  inversorTotal: number;
  estruturaRsPorModulo: number;
  estruturaTotal: number;
  total: number;
  faltando: string[];   // 'inversor' se a loja tem módulo mas não o inversor pedido
}

const up = (s: string) => (s || '').trim().toUpperCase();
const maisBarato = (a: ItemCatalogo[]) => a.slice().sort((x, y) => x.precoUnitario - y.precoUnitario)[0] ?? null;
const esc = (i: ItemCatalogo): ItemEscolhido => ({ marca: i.marca, modelo: i.modelo, descricao: i.descricao, potenciaW: i.potenciaW, preco: i.precoUnitario });
const ehInversor = (c: string) => c === 'inversor_string' || c === 'micro' || c === 'inversor_hibrido';

/** Casa potência com tolerância (módulo ±3%, inversor ±12%). */
const perto = (val: number | null, alvo: number, tol: number) =>
  val != null && val > 0 && Math.abs(val - alvo) / alvo <= tol;

/**
 * Monta o kit por loja. SÓ inclui a loja que tem o MÓDULO pedido (marca/Wp) — loja
 * sem o módulo não é mencionada. Estrutura = R$/módulo informado (igual pra todas).
 * Ordena do total mais barato ao mais caro; kits sem o inversor pedido vão pro fim.
 */
export function montarKitPorLoja(itens: ItemCatalogo[], spec: EspecKit): KitLoja[] {
  const fontes = [...new Set(itens.map((i) => i.fonte))];
  const estRs = spec.estruturaRsPorModulo && spec.estruturaRsPorModulo > 0 ? spec.estruturaRsPorModulo : 0;

  const kits: KitLoja[] = [];
  for (const fonte of fontes) {
    const daLoja = itens.filter((i) => i.fonte === fonte && i.precoUnitario > 0);

    // Módulo — se a loja não tem o módulo pedido, a loja NÃO entra
    let mods = daLoja.filter((i) => i.categoria === 'modulo');
    if (spec.wpModulo) mods = mods.filter((i) => perto(i.potenciaW, spec.wpModulo!, 0.03));
    if (spec.marcaModulo) mods = mods.filter((i) => up(i.marca).includes(up(spec.marcaModulo!)));
    const modulo = maisBarato(mods);
    if (!modulo) continue; // regra do Junior: loja sem o módulo não é mencionada

    // Inversor
    let invs = daLoja.filter((i) => ehInversor(i.categoria));
    if (spec.inversorKw) invs = invs.filter((i) => perto(i.potenciaW, spec.inversorKw! * 1000, 0.12));
    if (spec.marcaInversor) invs = invs.filter((i) => up(i.marca).includes(up(spec.marcaInversor!)));
    const inversor = maisBarato(invs);

    const moduloQtd = spec.modulos;
    const moduloTotal = Number((modulo.precoUnitario * moduloQtd).toFixed(2));
    const inversorTotal = inversor ? Number(inversor.precoUnitario.toFixed(2)) : 0;
    const estruturaTotal = Number((estRs * moduloQtd).toFixed(2));
    const total = Number((moduloTotal + inversorTotal + estruturaTotal).toFixed(2));

    kits.push({
      fonte,
      modulo: esc(modulo), moduloQtd, moduloTotal,
      inversor: inversor ? esc(inversor) : null, inversorTotal,
      estruturaRsPorModulo: estRs, estruturaTotal,
      total,
      faltando: inversor ? [] : ['inversor'],
    });
  }

  return kits.sort((a, b) => (a.faltando.length - b.faltando.length) || (a.total - b.total));
}

/** O kit COMPLETO (módulo + inversor) mais barato — base pra cotação. */
export function melhorKitCompleto(kits: KitLoja[]): KitLoja | null {
  return kits.filter((k) => k.faltando.length === 0).sort((a, b) => a.total - b.total)[0] ?? null;
}

/** kWp do kit a partir do módulo escolhido × quantidade. */
export function kwpDoKit(k: KitLoja): number {
  const wp = k.modulo?.potenciaW ?? 0;
  return Number(((wp * k.moduloQtd) / 1000).toFixed(3));
}
