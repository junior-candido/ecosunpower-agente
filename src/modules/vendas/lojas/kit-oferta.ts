// src/modules/vendas/lojas/kit-oferta.ts
// Forma comum de uma OFERTA DE KIT vinda de qualquer loja (Sol Fácil, Fortlev, Belenus).
// O preço aqui é o de KIT FECHADO da loja — NUNCA soma de avulso (o Junior insistiu:
// avulso não vale dentro do kit). Parsing puro e testável; sem IA.
import type { FonteLoja } from './tipos.js';

export interface KitItemOferta {
  categoria: string;        // ex.: 'modulo' | 'inversor' | 'estrutura' (rótulo da loja)
  label: string;            // descrição legível do item
  valor: string;            // texto como a loja mostra (qtd/modelo); informativo
}

export interface KitPagamentoOferta {
  nome: string;             // 'Pix', 'Boleto', 'Cartão 12x'...
  descontoPct: number | null;
  precoFinal: number | null;// já com desconto da forma de pagamento
  semJuros: boolean | null;
}

export interface KitOferta {
  fonte: FonteLoja;
  region: string;           // 'DF' | 'GO' (ou cidade, conforme a loja)
  inversorMarca: string;
  moduloMarca: string;
  descricao: string;
  precoTotal: number;       // R$ do kit fechado (à vista/cheio da loja)
  rsPorWp: number | null;   // R$/Wp do kit
  itens: KitItemOferta[];
  pagamentos: KitPagamentoOferta[];
  ehAlternativa: boolean;   // true quando a loja não tinha o pedido exato e sugeriu outro
  alerta: string | null;    // mensagem da loja (ex.: "não temos mais X, veja alternativa")
}

/** "R$ 10.467,97" · "10.467,97" · "R$1234" → 10467.97. null se não der. */
export function parseBRL(texto: unknown): number | null {
  if (typeof texto === 'number') return Number.isFinite(texto) ? texto : null;
  if (typeof texto !== 'string') return null;
  const m = texto.match(/-?[\d.]+(?:,\d{1,2})?/);
  if (!m) return null;
  const n = Number(m[0].replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** "R$ 1,74/Wp" · "1,74" → 1.74. null se não der. */
export function parseRsPorWp(texto: unknown): number | null {
  if (typeof texto === 'number') return Number.isFinite(texto) ? texto : null;
  if (typeof texto !== 'string') return null;
  const m = texto.match(/[\d.]+(?:,\d+)?/);
  if (!m) return null;
  const n = Number(m[0].replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
