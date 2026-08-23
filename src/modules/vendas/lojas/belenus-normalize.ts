// src/modules/vendas/lojas/belenus-normalize.ts
// Normaliza a resposta da vitrine Belenus (POST /api/catalogo/catalogo/vitrine)
// pra ItemLoja. PURO e testável — o client (HTTP/login) é outro arquivo.
import type { CategoriaLoja, ItemLoja } from './tipos.js';
import { potenciaWpDeTexto, marcaBanida } from './tipos.js';

/** Uma família da vitrine já com a categoria normalizada que ela representa. */
export interface FamiliaBelenus {
  categoria: CategoriaLoja;
  /** `produtos` da resposta da vitrine (cada um tem `opcoes[]`). */
  produtos: any[];
}

/** kW escrito na descrição do inversor ("3KW", "7.5KW", "6.6KW") → Watts. */
function kwDaDescricao(desc: string): number | null {
  const m = desc.match(/(\d+(?:[.,]\d+)?)\s*kw/i);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 1000) : null;
}

/**
 * imagemMarca vem como URL (".../jasolar.png", ".../logo_astronergy.png",
 * ".../growatt sem fundo.png"). Vira um token limpo: "jasolar", "astronergy",
 * "growatt". Sem inventar caixa bonita — a curadoria/casamento é do Junior.
 */
export function marcaDeBelenus(imagemMarca: unknown, descricao: string): string {
  if (typeof imagemMarca === 'string' && imagemMarca.trim()) {
    const base = imagemMarca.split('/').pop()!.split('?')[0]
      .replace(/\.(png|jpe?g|webp|svg)$/i, '')
      .replace(/^logo[_-]?/i, '')
      .replace(/\s*sem\s*fundo\s*/i, '')
      .replace(/\s*e\s*solis\s*/i, '')
      .trim();
    if (base) return base;
  }
  // Fallback: última palavra "de marca" da descrição (melhor que vazio).
  const palavras = descricao.trim().split(/\s+/);
  return palavras[palavras.length - 1] || '';
}

/** Uma opção da vitrine (o SKU vendável) → ItemLoja. null se sem preço. */
export function itemDeOpcaoBelenus(op: any, categoria: CategoriaLoja): ItemLoja | null {
  const preco = Number(op?.preco ?? op?.valorUnitario ?? 0);
  if (!Number.isFinite(preco) || preco <= 0) return null; // "Consulte" fica de fora
  const sku = String(op?.sku ?? '').trim();
  if (!sku) return null;
  const descricao = String(op?.descricaoProduto ?? '').trim();
  const marca = marcaDeBelenus(op?.imagemMarca, descricao);

  const potenciaW =
    categoria === 'modulo'
      ? potenciaWpDeTexto(`${sku} ${descricao}`)
      : kwDaDescricao(descricao);

  // Belenus manda R$/Wp em `valorPotencia` SÓ pro painel (0.81, 0.97...).
  const vp = Number(op?.valorPotencia);
  const rsPorWp =
    categoria === 'modulo' && Number.isFinite(vp) && vp > 0 && vp < 5 ? vp : null;

  return {
    fonte: 'belenus',
    categoria,
    sku,
    marca,
    modelo: sku,               // Belenus não separa modelo; o SKU é a chave.
    descricao,
    potenciaW,
    precoUnitario: preco,
    precoCheio: preco,
    estoque: Number.isFinite(Number(op?.qtdEstoque)) ? Number(op.qtdEstoque) : null,
    datasheet: null,
    rsPorWp,
  };
}

/** Todas as famílias → lista achatada de ItemLoja (só com preço). */
export function normalizarBelenus(familias: FamiliaBelenus[]): ItemLoja[] {
  const out: ItemLoja[] = [];
  for (const fam of familias) {
    for (const prod of fam.produtos ?? []) {
      for (const op of prod?.opcoes ?? []) {
        const item = itemDeOpcaoBelenus(op, fam.categoria);
        if (item && !marcaBanida(item.marca, item.descricao)) out.push(item);
      }
    }
  }
  return out;
}
