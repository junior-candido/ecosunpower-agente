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
  // Payback só com contexto de retorno/pagamento — evita barrar "garantia em 2 anos" etc.
  { nome: 'payback', re: /(payback|se paga|paga sozinho|retorno)[^.]{0,25}\d+\s?anos/i },
];

// Frases liberadas: falam da CONTA do cliente (não preço de sistema) ou o bônus FIXO
// de indicação (R$300 no PIX) — nenhum é número que a Eva calcula de cabeça.
const LIBERADAS: RegExp[] = [
  /sua conta (veio|fica|é|foi|tá|esta|está)/i,
  /quanto (veio|vem|você paga|custa sua conta)/i,
  /conta de luz/i,
  /pix/i,
  /indica(ç|c)[aã]o|indicar|indicou/i,
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
