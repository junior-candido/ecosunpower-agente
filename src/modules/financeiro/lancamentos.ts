// src/modules/financeiro/lancamentos.ts
// Regras PURAS da Caixa de Entrada (sem I/O — testáveis).

export const CATEGORIA_SLUGS = [
  'combustivel', 'material_eletrico', 'equipamento_kit', 'mao_de_obra',
  'alimentacao', 'ferramenta', 'veiculo_manutencao', 'marketing_ads',
  'software_assinatura', 'imposto_das', 'pro_labore', 'taxa_bancaria', 'outros',
] as const;
export type CategoriaSlug = typeof CATEGORIA_SLUGS[number];

export function resolverCategoria(slug: string | null | undefined): CategoriaSlug {
  if (slug && (CATEGORIA_SLUGS as readonly string[]).includes(slug)) return slug as CategoriaSlug;
  return 'outros';
}

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface CamposLancamento {
  tipo: 'despesa' | 'entrada' | null;
  valor: number | null;
  data_evento: string | null; // YYYY-MM-DD
  pf_pj: 'PF' | 'PJ' | 'FRONTEIRA' | null;
}

// O que falta pra esse lançamento poder ser CONFIRMADO. Eva pergunta o que
// faltar — nunca chuta (lição do caso Marcelo).
export function validarParaConfirmar(c: CamposLancamento): { ok: boolean; faltando: string[] } {
  const faltando: string[] = [];
  if (!c.tipo) faltando.push('tipo');
  if (!(typeof c.valor === 'number' && c.valor > 0)) faltando.push('valor');
  if (!c.data_evento || !DATA_RE.test(c.data_evento)) faltando.push('data');
  if (c.pf_pj !== 'PF' && c.pf_pj !== 'PJ' && c.pf_pj !== 'FRONTEIRA') faltando.push('pf_pj');
  return { ok: faltando.length === 0, faltando };
}

export function normalizarContraparte(s: string | null | undefined): string {
  if (!s) return '';
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

export interface ChaveDuplicado { valor: number; contraparte: string | null; data_evento: string }

// Duplicado APARENTE: mesmo valor + mesma contraparte + mesmo dia. Vira AVISO
// (botão "Lançar mesmo assim"), nunca bloqueio — 2 almoços iguais existem.
export function ehDuplicado(novo: ChaveDuplicado, existentes: ChaveDuplicado[]): boolean {
  const c = normalizarContraparte(novo.contraparte);
  if (!c) return false; // sem contraparte não dá pra afirmar nada
  return existentes.some((e) =>
    Math.round(e.valor * 100) === Math.round(novo.valor * 100) &&
    normalizarContraparte(e.contraparte) === c &&
    e.data_evento === novo.data_evento);
}

export const TTL_PENDENTE_MS = 24 * 60 * 60 * 1000;

export function pendenteExpirado(createdAt: string, agora: Date): boolean {
  return agora.getTime() - new Date(createdAt).getTime() > TTL_PENDENTE_MS;
}

export function competenciaDe(dataEvento: string): string {
  return dataEvento.slice(0, 7);
}
