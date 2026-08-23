// src/modules/vendas/tabela-precos-parser.ts
// Parser do comando /tabela (spec §4.2). PURO, sem IA: o Junior escreve, a gente lê.

export type TipoItem = 'modulo' | 'micro' | 'estrutura' | 'cabos_protecao';
export type FonteItem = 'junior' | 'belenus' | 'solfacil';
export const TELHADOS = ['fibrocimento', 'laje', 'solo', 'carport', 'ceramico', 'metalico'] as const;
export type Telhado = typeof TELHADOS[number];

export interface ItemTabela {
  tipo: TipoItem;
  marca: string;
  modelo: string;
  potenciaW: number | null;
  modulosPorUnidade: number | null;
  precoUnitario: number;
  unidade: 'un' | 'modulo' | 'kwp';
  fonte: FonteItem;
}

export type ComandoTabela =
  | { acao: 'listar' }
  | { acao: 'atualizar'; item: ItemTabela }
  | { acao: 'desativar'; tipo: TipoItem; marca: string; modelo: string }
  | { acao: 'erro'; erro: 'formato' | 'preco_invalido' | 'micro_sem_modulos_por_unidade' | 'telhado_desconhecido' };

/**
 * Lê número escrito como gente escreve no zap (pt-BR) — e NUNCA confunde
 * ponto de milhar com decimal: "1.050" é mil e cinquenta, não 1,05.
 * Aceita: 1.050 · 12.500 · 2.500.000 · 1.050,00 · 980,5 · R$ 1.050 · 1450.50 · 980
 * Recusa (devolve null): "" · "abc" · "1.0500" · "1,234.56" · negativos.
 */
export function parseNumeroBr(entrada: unknown): number | null {
  if (typeof entrada === 'number') return Number.isFinite(entrada) ? entrada : null;
  if (typeof entrada !== 'string') return null;
  const limpo = entrada.trim().replace(/^r\$\s*/i, '').trim();
  if (!limpo) return null;
  // pt-BR: milhar com ponto, decimal com vírgula (o ponto some, a vírgula vira ponto).
  if (/^\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(limpo)) {
    const n = Number(limpo.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  // Simples: 980 · 980,5 · 1450.50 (decimal com ponto, jeito de calculadora).
  if (/^\d+([.,]\d{1,2})?$/.test(limpo)) {
    const n = Number(limpo.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Preço é número lido do mesmo jeito — nome mantido pra quem já importava. */
export const parsePrecoBr = parseNumeroBr;

/** "Cerâmico" / "CERAMICO" / "ceramico" → 'ceramico' (tira acento pela faixa combinante). */
const normalizarTelhado = (s: string): Telhado | null => {
  const t = s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return (TELHADOS as readonly string[]).includes(t) ? (t as Telhado) : null;
};

export function parseComandoTabela(texto: string): ComandoTabela | null {
  const t = texto.trim();
  // "tabela" solto (sem barra) é atalho pra listar. Com argumento a barra é
  // OBRIGATÓRIA — senão "tabela de preços chegou" viraria comando.
  if (/^\/?tabela$/i.test(t)) return { acao: 'listar' };
  const m = /^\/tabela\s+(.+)$/i.exec(t);
  if (!m) return null;
  let resto = m[1].trim();
  if (!resto) return { acao: 'listar' };

  let fonte: FonteItem = 'junior';
  const mf = /^fonte\s+(belenus|solfacil|sol\s*f[áa]cil)\s+/i.exec(resto);
  if (mf) { fonte = /belenus/i.test(mf[1]) ? 'belenus' : 'solfacil'; resto = resto.slice(mf[0].length); }

  const tira = /^tira\s+(.+)$/i.exec(resto);
  if (tira) {
    const alvo = tira[1].trim();
    const mm = /^micro\s+(\S+)\s+(\S+)$/i.exec(alvo);
    if (mm) return { acao: 'desativar', tipo: 'micro', marca: mm[1], modelo: mm[2] };
    const me = /^estrutura\s+(\S+)$/i.exec(alvo);
    if (me) { const t = normalizarTelhado(me[1]); return t ? { acao: 'desativar', tipo: 'estrutura', marca: t, modelo: t } : { acao: 'erro', erro: 'telhado_desconhecido' }; }
    if (/^cabos$/i.test(alvo)) return { acao: 'desativar', tipo: 'cabos_protecao', marca: 'geral', modelo: 'geral' };
    const mo = /^(?:modulo\s+)?(.+?)\s+(\d{3,4})$/i.exec(alvo);
    if (mo) return { acao: 'desativar', tipo: 'modulo', marca: mo[1].trim(), modelo: mo[2] };
    return { acao: 'erro', erro: 'formato' };
  }

  const partes = resto.split('=');
  if (partes.length !== 2) return { acao: 'erro', erro: 'formato' };
  const esquerda = partes[0].trim();
  const preco = parsePrecoBr(partes[1]);
  if (preco === null) return { acao: 'erro', erro: 'formato' };
  if (preco <= 0) return { acao: 'erro', erro: 'preco_invalido' };

  const base = { precoUnitario: preco, fonte };

  const micro = /^micro\s+(\S+)\s+(\S+)(?:\s+(\d{1,2}))?$/i.exec(esquerda);
  if (micro) {
    if (!micro[3]) return { acao: 'erro', erro: 'micro_sem_modulos_por_unidade' };
    return { acao: 'atualizar', item: { tipo: 'micro', marca: micro[1], modelo: micro[2], potenciaW: null, modulosPorUnidade: Number(micro[3]), unidade: 'un', ...base } };
  }
  const estr = /^estrutura\s+(.+)$/i.exec(esquerda);
  if (estr) {
    const t = normalizarTelhado(estr[1]);
    if (!t) return { acao: 'erro', erro: 'telhado_desconhecido' };
    return { acao: 'atualizar', item: { tipo: 'estrutura', marca: t, modelo: t, potenciaW: null, modulosPorUnidade: null, unidade: 'modulo', ...base } };
  }
  if (/^cabos$/i.test(esquerda)) {
    return { acao: 'atualizar', item: { tipo: 'cabos_protecao', marca: 'geral', modelo: 'geral', potenciaW: null, modulosPorUnidade: null, unidade: 'kwp', ...base } };
  }
  const mod = /^(?:modulo\s+)?(.+?)\s+(\d{3,4})$/i.exec(esquerda);
  if (mod) {
    return { acao: 'atualizar', item: { tipo: 'modulo', marca: mod[1].trim(), modelo: mod[2], potenciaW: Number(mod[2]), modulosPorUnidade: null, unidade: 'un', ...base } };
  }
  return { acao: 'erro', erro: 'formato' };
}
