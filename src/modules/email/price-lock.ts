const PADROES: RegExp[] = [
  /r\$\s*\d/i,                      // R$ 19.900 / R$1.200 / R$  1.900 (varios espacos)
  /\d+\s?(reais|real)\b/i,         // 850 reais
  /\d+\s?x\s?(de\s?)?\d/i,         // 12x de 499
  /\bde\s?\d[\d.,]*\s?(reais|r\$)/i,
  /\d{1,3}[.,]\d{3}(?:[.,]\d{2})?/, // valor formatado com separador de milhar: 1.900 / 1.200,00 (mas nao 18% nem 34)
  /\bmil\s+(reais|real)\b/i,       // "mil reais" por extenso
  /\d+\s*(à|a)\s*vista\b/i,        // "1900 a vista" — pagamento a vista e contexto de preco
];

// Numero solto de 3+ digitos (sem R$/reais/separador por perto) tambem costuma ser
// preco (ex.: "economia de 3200 por ano"). Só NÃO conta como suspeito quando:
//  - é um ano isolado (19xx/20xx), tipo "sua energia em 2026"; ou
//  - vem seguido de "%", tipo "18%" (nem chega aqui, tem so 2 digitos, mas cobrimos
//    o caso de 3+ digitos tambem por seguranca).
function temNumeroSoltoSuspeito(texto: string): boolean {
  const re = /\b\d{3,}\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    const numero = m[0];
    const depois = texto.slice(m.index + numero.length);
    const ehAno = numero.length === 4 && /^(19|20)\d{2}$/.test(numero);
    const seguidoDePercentual = /^\s*%/.test(depois);
    if (!ehAno && !seguidoDePercentual) return true;
  }
  return false;
}

export function contemPreco(texto: string): boolean {
  const t = texto ?? '';
  return PADROES.some((re) => re.test(t)) || temNumeroSoltoSuspeito(t);
}

// Se o texto gerado tem preco, devolve o fallback seguro; senao devolve o texto.
export function aplicarTravaPreco(texto: string, fallback: string): string {
  return contemPreco(texto) ? fallback : texto;
}
