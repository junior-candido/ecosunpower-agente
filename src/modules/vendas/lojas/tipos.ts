// src/modules/vendas/lojas/tipos.ts
// Forma comum de um item lido de qualquer loja (Belenus, Sol Fácil, ...).
// A "tabela viva" (fatia 2.5) normaliza tudo pra cá antes de decidir o que
// fazer no banco. NADA de IA aqui — parsing puro, testável.

export type FonteLoja = 'belenus' | 'solfacil' | 'fortlev';

/**
 * Categoria normalizada entre lojas. Só `modulo` e `micro` alimentam o
 * precificador (ver precificador.ts); o resto é referência/consulta e NUNCA
 * entra na escolha A/B sozinho (a curadoria é do Junior).
 */
export type CategoriaLoja =
  | 'modulo'
  | 'micro'
  | 'inversor_string'
  | 'inversor_hibrido'
  | 'bateria'
  | 'estrutura'
  | 'cabo'
  | 'componente';

export interface ItemLoja {
  fonte: FonteLoja;
  categoria: CategoriaLoja;
  sku: string;              // chave estável DENTRO da loja (Belenus sku · Sol Fácil sku)
  marca: string;
  modelo: string;
  descricao: string;
  potenciaW: number | null; // módulo: Wp · inversor/micro: W de saída (informativo)
  precoUnitario: number;    // o preço que o Junior compara: Belenus `preco` · Sol Fácil Pix
  precoCheio: number | null;// Sol Fácil: antes do Pix. Belenus: mesmo que unitário.
  estoque: number | null;   // Belenus tem; Sol Fácil não expõe.
  datasheet: string | null; // Sol Fácil dá URL do PDF; Belenus não.
  rsPorWp: number | null;   // só módulo.
}

/** Marca banida na casa (nunca entra em catálogo/comparador/kit). Só Growatt hoje. */
export function marcaBanida(marca: string, descricao = ''): boolean {
  return /growatt/i.test(`${marca} ${descricao}`);
}

/** Wp a partir de texto tipo "530W", "600 W", "MODULO ... 715W ..." — pega o maior "NNNW". */
export function potenciaWpDeTexto(texto: string): number | null {
  const achados = [...texto.matchAll(/(\d{3,4})\s*w(?![a-z])/gi)].map((m) => Number(m[1]));
  const validos = achados.filter((n) => n >= 100 && n <= 1000);
  return validos.length ? Math.max(...validos) : null;
}

/** "2.5 kW" · "0.47 kW" · "600 W" → Watts. null se não achar. */
export function potenciaWDeCampo(valor: unknown): number | null {
  if (typeof valor !== 'string') return null;
  const kw = valor.match(/([\d.,]+)\s*kw/i);
  if (kw) {
    const n = Number(kw[1].replace(/\./g, '').replace(',', '.'));
    // "2.5 kW": aqui o ponto É decimal (jeito de datasheet), não milhar.
    const n2 = Number(kw[1].replace(',', '.'));
    const val = Number.isFinite(n2) ? n2 : n;
    return Number.isFinite(val) ? Math.round(val * 1000) : null;
  }
  const w = valor.match(/([\d.]+)\s*w(?![a-z])/i);
  if (w) {
    const n = Number(w[1]);
    return Number.isFinite(n) ? Math.round(n) : null;
  }
  return null;
}
