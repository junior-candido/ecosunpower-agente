// src/modules/vendas/estado-venda-regras.ts
// Esteira de estados por lead (spec 2026-08-21 §3). PURO: sem I/O.
// Transições só por função nomeada; qualquer outra é rejeitada.

export const ESTADOS_VENDA = [
  'NOVO', 'QUALIFICADO', 'PRECIFICANDO', 'AGUARDANDO_OK', 'CHAMA_JUNIOR',
  'PROPOSTA_ENVIADA', 'FOLLOWUP_VIVO', 'AGENDADO', 'QUER_JUNIOR', 'FECHADO', 'PERDIDO',
] as const;
export type EstadoVenda = typeof ESTADOS_VENDA[number];

const VIVOS_POS_QUALIFICACAO: EstadoVenda[] = [
  'QUALIFICADO', 'PRECIFICANDO', 'AGUARDANDO_OK', 'CHAMA_JUNIOR', 'PROPOSTA_ENVIADA', 'FOLLOWUP_VIVO', 'AGENDADO',
];

export const TRANSICOES: Record<EstadoVenda, EstadoVenda[]> = {
  NOVO:             ['QUALIFICADO', 'PERDIDO', 'QUER_JUNIOR'],
  QUALIFICADO:      ['PRECIFICANDO', 'CHAMA_JUNIOR', 'PROPOSTA_ENVIADA', 'QUER_JUNIOR', 'PERDIDO'],
  PRECIFICANDO:     ['AGUARDANDO_OK', 'CHAMA_JUNIOR', 'QUER_JUNIOR', 'PERDIDO'],
  AGUARDANDO_OK:    ['PRECIFICANDO', 'PROPOSTA_ENVIADA', 'CHAMA_JUNIOR', 'QUER_JUNIOR', 'PERDIDO'],
  CHAMA_JUNIOR:     ['PROPOSTA_ENVIADA', 'QUER_JUNIOR', 'PERDIDO'],
  PROPOSTA_ENVIADA: ['FOLLOWUP_VIVO', 'AGENDADO', 'QUER_JUNIOR', 'FECHADO', 'PERDIDO'],
  FOLLOWUP_VIVO:    ['AGENDADO', 'QUER_JUNIOR', 'FECHADO', 'PERDIDO', 'PROPOSTA_ENVIADA'],
  AGENDADO:         ['FOLLOWUP_VIVO', 'QUER_JUNIOR', 'FECHADO', 'PERDIDO'],
  QUER_JUNIOR:      ['PROPOSTA_ENVIADA', 'FOLLOWUP_VIVO', 'AGENDADO', 'FECHADO', 'PERDIDO'],
  FECHADO:          [],
  PERDIDO:          [],
};

export function estadoOuNovo(v: unknown): EstadoVenda {
  return (ESTADOS_VENDA as readonly string[]).includes(String(v)) ? (v as EstadoVenda) : 'NOVO';
}

export function transicaoValida(de: EstadoVenda, para: EstadoVenda): boolean {
  if (de === para) return false;
  return TRANSICOES[de]?.includes(para) ?? false;
}

// Guarda de sanidade: todo estado alcançável a partir de NOVO (usado só em teste/dev).
export function estadosAlcancaveis(): EstadoVenda[] {
  const vistos = new Set<EstadoVenda>(['NOVO']);
  const fila: EstadoVenda[] = ['NOVO'];
  while (fila.length) {
    const e = fila.shift()!;
    for (const p of TRANSICOES[e]) if (!vistos.has(p)) { vistos.add(p); fila.push(p); }
  }
  return [...vistos];
}

export { VIVOS_POS_QUALIFICACAO };
