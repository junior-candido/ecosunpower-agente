// src/modules/vendas/lojas/solfacil-normalize.ts
// Normaliza a resposta do GraphQL getSpareProducts (Sol Fácil) pra ItemLoja.
// PURO e testável — o client (Keycloak/HTTP) é outro arquivo.
import type { CategoriaLoja, ItemLoja } from './tipos.js';
import { potenciaWDeCampo, marcaBanida } from './tipos.js';

/** Categoria da loja (MODULES, INVERTERS, ...) + descrição → categoria normalizada. */
export function categoriaSolfacil(categoriaLoja: string, descricao: string): CategoriaLoja {
  const c = categoriaLoja.toUpperCase();
  const d = descricao.toUpperCase();
  if (c === 'MODULES') return 'modulo';
  if (c === 'BATTERIES') return 'bateria';
  if (c === 'STRUCTURES' || c === 'SUPPORTS') return 'estrutura';
  if (c === 'CABLES') return 'cabo';
  if (c === 'INVERTERS') {
    if (d.includes('MICRO')) return 'micro';
    if (d.includes('HIBRIDO') || d.includes('HÍBRIDO')) return 'inversor_hibrido';
    return 'inversor_string';
  }
  return 'componente';
}

/** "R$ 1.507,69" → 1507.69. null se ilegível. (pt-BR: ponto milhar, vírgula decimal.) */
export function precoBrl(texto: unknown): number | null {
  if (typeof texto === 'number') return Number.isFinite(texto) ? texto : null;
  if (typeof texto !== 'string') return null;
  const limpo = texto.replace(/r\$\s*/i, '').trim();
  const m = limpo.match(/\d{1,3}(?:\.\d{3})*(?:,\d{2})?|\d+(?:[.,]\d{2})?/);
  if (!m) return null;
  const n = Number(m[0].replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** info[] tem {title,value}; pega o valor de um título (case-insensitive). */
function infoValor(info: any[], titulo: string): unknown {
  const achado = (info ?? []).find(
    (i) => String(i?.title ?? '').trim().toLowerCase() === titulo.toLowerCase(),
  );
  return achado?.value;
}

/** Um produto do getSpareProducts → ItemLoja. null se sem preço utilizável. */
export function itemDeProdutoSolfacil(p: any, categoriaLoja: string): ItemLoja | null {
  const sku = String(p?.sku ?? '').trim();
  if (!sku) return null;
  const descricao = String(p?.description ?? '').trim();
  const precoCheio = Number(p?.price);

  // O preço que o Junior compara é o Pix (6% off). Sem Pix, cai pro cheio.
  const pix = (p?.payment_conditions ?? []).find(
    (c: any) => /pix/i.test(String(c?.payment_name ?? '')),
  );
  const precoUnitario = precoBrl(pix?.final_price) ?? (Number.isFinite(precoCheio) && precoCheio > 0 ? precoCheio : null);
  if (precoUnitario == null) return null;

  const categoria = categoriaSolfacil(categoriaLoja, descricao);
  const potenciaCampo = infoValor(p?.info, 'Potência');
  const potenciaW = potenciaWDeCampo(potenciaCampo) ?? potenciaWDeCampo(descricao);

  const marca = String(p?.manufacturer ?? '').trim();
  const modelo = String(p?.model ?? '').trim() || sku;

  return {
    fonte: 'solfacil',
    categoria,
    sku,
    marca,
    modelo,
    descricao,
    potenciaW,
    precoUnitario,
    precoCheio: Number.isFinite(precoCheio) && precoCheio > 0 ? precoCheio : null,
    estoque: null,
    datasheet: typeof p?.datasheet === 'string' ? p.datasheet : null,
    rsPorWp:
      categoria === 'modulo' && potenciaW && potenciaW > 0
        ? Number((precoUnitario / potenciaW).toFixed(4))
        : null,
  };
}

/** Vários produtos (de uma categoria) → ItemLoja[]. */
export function normalizarSolfacil(produtos: any[], categoriaLoja: string): ItemLoja[] {
  const out: ItemLoja[] = [];
  for (const p of produtos ?? []) {
    const item = itemDeProdutoSolfacil(p, categoriaLoja);
    if (item && !marcaBanida(item.marca, item.descricao)) out.push(item);
  }
  return out;
}
