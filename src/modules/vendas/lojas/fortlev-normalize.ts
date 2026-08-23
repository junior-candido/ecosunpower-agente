// src/modules/vendas/lojas/fortlev-normalize.ts
// Normaliza o catálogo da Fortlev (HTMX: cada card traz o objeto do componente
// no @click="addCart({...})"). PURO e testável — quem baixa o HTML/extrai o JSON
// é o client. Aqui entra o objeto `component` já parseado.
import type { CategoriaLoja, ItemLoja } from './tipos.js';
import { marcaBanida } from './tipos.js';

/** family da Fortlev + nome → categoria normalizada da casa. */
export function categoriaFortlev(family: string, nome: string): CategoriaLoja {
  const f = (family || '').toLowerCase();
  const n = (nome || '').toUpperCase();
  if (f === 'module') return 'modulo';
  if (f === 'battery') return 'bateria';
  if (f === 'structure') return 'estrutura';
  if (f === 'inverter') {
    if (n.includes('MICRO')) return 'micro';
    if (n.includes('HIBRIDO') || n.includes('HÍBRIDO')) return 'inversor_hibrido';
    return 'inversor_string';
  }
  return 'componente'; // dependency | miscellaneous
}

/** A marca não vem limpa no objeto (é um id); usamos a 1ª palavra do nome. */
export function marcaFortlev(nome: string): string {
  return (nome || '').trim().split(/\s+/)[0] || '';
}

/** kW → W. Fortlev traz tech_data.output.nominal_power em kW (número). */
function potenciaW(component: any): number | null {
  const kw = component?.tech_data?.output?.nominal_power ?? component?.tech_data?.nominal_power;
  if (typeof kw === 'number' && kw > 0) return Math.round(kw * 1000);
  return null;
}

/** Escolhe o melhor anexo pra homologação: INMETRO > CERTIFICADO > DATASHEET > resto. */
export function melhorAnexoFortlev(attachments: any[]): { url: string; tipo: string } | null {
  const pdfs = (attachments ?? [])
    .map((a) => (typeof a?.path === 'string' ? a.path : ''))
    .filter((p) => /\.pdf/i.test(p));
  if (!pdfs.length) return null;
  const classifica = (nome: string): string => {
    const b = decodeURIComponent(nome.split('/').pop() || '').toUpperCase();
    if (b.includes('INMETRO')) return 'INMETRO';
    if (b.includes('CERTIFICAD')) return 'CERTIFICADO';
    if (b.includes('MANUAL')) return 'MANUAL';
    if (b.includes('DATASHEET')) return 'DATASHEET';
    return 'OUTRO';
  };
  const ordem: Record<string, number> = { INMETRO: 0, CERTIFICADO: 1, DATASHEET: 2, MANUAL: 3, OUTRO: 4 };
  const escolhido = pdfs
    .map((p) => ({ url: p, tipo: classifica(p) }))
    .sort((a, b) => ordem[a.tipo] - ordem[b.tipo])[0];
  return escolhido;
}

/** `preco` vem como texto do card ("R$ 2.278,26"); parse pt-BR. */
export function precoFortlev(texto: unknown): number | null {
  if (typeof texto === 'number') return Number.isFinite(texto) ? texto : null;
  if (typeof texto !== 'string') return null;
  const m = texto.match(/\d{1,3}(?:\.\d{3})*(?:,\d{2})?|\d+(?:[.,]\d{2})?/);
  if (!m) return null;
  const n = Number(m[0].replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export interface CardFortlev {
  component: any;   // objeto do addCart({...}).component
  precoTexto: string;
}

/** Um card da Fortlev → ItemLoja. null se sem código ou sem preço. */
export function itemDeCardFortlev(card: CardFortlev): ItemLoja | null {
  const c = card?.component;
  const sku = String(c?.code ?? '').trim();
  if (!sku) return null;
  const preco = precoFortlev(card?.precoTexto);
  if (preco == null) return null;
  const nome = String(c?.name ?? '').trim();
  const categoria = categoriaFortlev(String(c?.family ?? ''), nome);
  const pW = potenciaW(c);
  const anexo = melhorAnexoFortlev(c?.attachments);
  return {
    fonte: 'fortlev' as const,
    categoria,
    sku,
    marca: marcaFortlev(nome),
    modelo: sku,
    descricao: nome,
    potenciaW: pW,
    precoUnitario: preco,
    precoCheio: preco,
    estoque: null,
    datasheet: anexo?.url ?? null,
    rsPorWp: categoria === 'modulo' && pW && pW > 0 ? Number((preco / pW).toFixed(4)) : null,
  };
}

export function normalizarFortlev(cards: CardFortlev[]): ItemLoja[] {
  const out: ItemLoja[] = [];
  for (const card of cards ?? []) {
    const item = itemDeCardFortlev(card);
    if (item && !marcaBanida(item.marca, item.descricao)) out.push(item);
  }
  return out;
}
