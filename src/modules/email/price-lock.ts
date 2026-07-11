const PADROES: RegExp[] = [
  /r\$\s?\d/i,                      // R$ 19.900 / R$1.200
  /\d+\s?(reais|real)\b/i,         // 850 reais
  /\d+\s?x\s?(de\s?)?\d/i,         // 12x de 499
  /\bde\s?\d[\d.,]*\s?(reais|r\$)/i,
];

export function contemPreco(texto: string): boolean {
  const t = texto ?? '';
  return PADROES.some((re) => re.test(t));
}

// Se o texto gerado tem preco, devolve o fallback seguro; senao devolve o texto.
export function aplicarTravaPreco(texto: string, fallback: string): string {
  return contemPreco(texto) ? fallback : texto;
}
