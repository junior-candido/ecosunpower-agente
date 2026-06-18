// Guardrail: no novo fluxo a Eva NÃO crava preço/dimensionamento (faz handoff).
// Esta função detecta se a resposta dela vazou um número desses pra barrar antes de enviar.

export interface ResultadoTrava {
  bloqueado: boolean;
  motivos: string[];
}

const PADROES: Array<{ nome: string; re: RegExp }> = [
  { nome: 'preco_reais', re: /r\$\s?\d{1,3}([.\s]?\d{3})*(\s?mil)?/i },
  { nome: 'kwp',     re: /\b\d{1,3}([.,]\d+)?\s?kwp\b/i },
  { nome: 'paineis', re: /\b\d{1,3}\s?pain[eé]is\b/i },
  { nome: 'kwh',     re: /\b\d{2,5}\s?kwh\b/i },
  { nome: 'payback', re: /payback[^.]{0,20}\d+\s?anos|\bem\s\d+\s?anos\b/i },
];

const LIBERADAS: RegExp[] = [
  /sua conta (veio|fica|é|foi|tá|esta|está)/i,
  /quanto (veio|vem|você paga|custa sua conta)/i,
  /conta de luz/i,
];

export function detectarNumeroProibido(texto: string): ResultadoTrava {
  const t = texto ?? '';
  const ehPerguntaConta = LIBERADAS.some(re => re.test(t));
  const motivos: string[] = [];
  for (const p of PADROES) {
    if (p.re.test(t)) {
      if (p.nome === 'preco_reais' && ehPerguntaConta) continue;
      motivos.push(p.nome);
    }
  }
  return { bloqueado: motivos.length > 0, motivos };
}
