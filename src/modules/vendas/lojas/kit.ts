// src/modules/vendas/lojas/kit.ts
// Monta o kit (módulos + inversor + estrutura) e calcula o TOTAL em cada loja, pra
// o Junior ver onde o CONJUNTO sai mais barato. PURO e testável. Lê ItemCatalogo
// (da catalogo_loja). Growatt já vem filtrado do normalizador; aqui não reaparece.
import type { ItemCatalogo } from './catalogo-loja.js';

export interface EspecKit {
  modulos: number;            // quantos módulos
  wpModulo?: number | null;   // Wp desejado do módulo (opcional; se vazio, pega o mais barato)
  inversorKw?: number | null; // kW do inversor (opcional)
  marcaModulo?: string | null;
  marcaInversor?: string | null;
}

export interface ItemEscolhido { marca: string; modelo: string; descricao: string; potenciaW: number | null; preco: number; }

export interface KitLoja {
  fonte: string;
  modulo: ItemEscolhido | null;
  moduloQtd: number;
  moduloTotal: number;
  inversor: ItemEscolhido | null;
  inversorTotal: number;
  estrutura: ItemEscolhido | null;   // por módulo
  estruturaTotal: number;
  total: number;                     // soma do que achou
  faltando: string[];                // categorias sem item na loja
}

const up = (s: string) => (s || '').trim().toUpperCase();
const maisBarato = (a: ItemCatalogo[]) => a.slice().sort((x, y) => x.precoUnitario - y.precoUnitario)[0] ?? null;
const esc = (i: ItemCatalogo): ItemEscolhido => ({ marca: i.marca, modelo: i.modelo, descricao: i.descricao, potenciaW: i.potenciaW, preco: i.precoUnitario });

/** Casa potência com tolerância (módulo ±3%, inversor ±10%). */
const perto = (val: number | null, alvo: number, tol: number) =>
  val != null && val > 0 && Math.abs(val - alvo) / alvo <= tol;

/** Monta o kit em cada loja que tem dados. Retorna ordenado do total mais barato ao mais caro. */
export function montarKitPorLoja(itens: ItemCatalogo[], spec: EspecKit): KitLoja[] {
  const fontes = [...new Set(itens.map((i) => i.fonte))];
  const ehInversor = (c: string) => c === 'inversor_string' || c === 'micro' || c === 'inversor_hibrido';

  const kits = fontes.map((fonte): KitLoja => {
    const daLoja = itens.filter((i) => i.fonte === fonte && i.precoUnitario > 0);

    // Módulo
    let mods = daLoja.filter((i) => i.categoria === 'modulo');
    if (spec.wpModulo) mods = mods.filter((i) => perto(i.potenciaW, spec.wpModulo!, 0.03));
    if (spec.marcaModulo) mods = mods.filter((i) => up(i.marca).includes(up(spec.marcaModulo!)));
    const modulo = maisBarato(mods);

    // Inversor
    let invs = daLoja.filter((i) => ehInversor(i.categoria));
    if (spec.inversorKw) invs = invs.filter((i) => perto(i.potenciaW, spec.inversorKw! * 1000, 0.1));
    if (spec.marcaInversor) invs = invs.filter((i) => up(i.marca).includes(up(spec.marcaInversor!)));
    const inversor = maisBarato(invs);

    // Estrutura (por módulo — pega a mais barata da loja)
    const estrutura = maisBarato(daLoja.filter((i) => i.categoria === 'estrutura'));

    const moduloQtd = spec.modulos;
    const moduloTotal = modulo ? Number((modulo.precoUnitario * moduloQtd).toFixed(2)) : 0;
    const inversorTotal = inversor ? Number(inversor.precoUnitario.toFixed(2)) : 0;
    const estruturaTotal = estrutura ? Number((estrutura.precoUnitario * moduloQtd).toFixed(2)) : 0;
    const total = Number((moduloTotal + inversorTotal + estruturaTotal).toFixed(2));

    const faltando: string[] = [];
    if (!modulo) faltando.push('módulo');
    if (!inversor) faltando.push('inversor');
    if (!estrutura) faltando.push('estrutura');

    return {
      fonte,
      modulo: modulo ? esc(modulo) : null, moduloQtd, moduloTotal,
      inversor: inversor ? esc(inversor) : null, inversorTotal,
      estrutura: estrutura ? esc(estrutura) : null, estruturaTotal,
      total, faltando,
    };
  });

  // ordena: kits completos (sem faltando) e mais baratos primeiro
  return kits.sort((a, b) => (a.faltando.length - b.faltando.length) || (a.total - b.total));
}

/** O kit COMPLETO (sem categoria faltando) mais barato — base pra cotação. null se nenhum completo. */
export function melhorKitCompleto(kits: KitLoja[]): KitLoja | null {
  return kits.filter((k) => k.faltando.length === 0).sort((a, b) => a.total - b.total)[0] ?? null;
}

/** kWp do kit a partir do módulo escolhido × quantidade. */
export function kwpDoKit(k: KitLoja): number {
  const wp = k.modulo?.potenciaW ?? 0;
  return Number(((wp * k.moduloQtd) / 1000).toFixed(3));
}
