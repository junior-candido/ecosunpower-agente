// Guardrail: no fluxo novo a Eva NÃO crava preço/dimensionamento (faz handoff).
// Detecta se a resposta dela vazou um número desses pra barrar antes de enviar.
//
// Estratégia (robusta, sem allowlist frágil):
// - PREÇO: detecta por VALOR. Sistema começa em ~R$9.600; conta residencial vai até
//   ~R$5.000 e o bônus de indicação é R$300. R$6.000 separa com folga — acima = preço
//   de sistema (proibido pra Eva cravar); abaixo = conta do cliente / indicação (ok).
// - kWp e painéis: o cliente nunca fornece isso; número + kWp/painéis = dimensionamento
//   calculado = sempre proibido.
// - kWh: só proíbe com contexto de GERAÇÃO/sistema (computado). Ler o consumo da conta
//   do cliente ("sua conta deu 850 kWh") é liberado.
// - payback: só com contexto de retorno/pagamento.

export interface ResultadoTrava {
  bloqueado: boolean;
  motivos: string[];
}

// Mensagem que substitui a resposta da Eva quando ela vaza um número proibido.
export const MENSAGEM_HANDOFF_NUMERO =
  'Pra te passar o número certo, o Junior (nosso Responsável Técnico) vê seu caso direitinho. Ele pode te atender agora — posso já chamar ele aqui? 😊';

// Preço de sistema (proibido) começa bem acima de qualquer conta residencial.
const LIMIAR_PRECO_SISTEMA = 6000;

// Extrai o MAIOR valor em R$ do texto. "R$ 25 mil" = 25000, "R$ 28.000" = 28000, "R$600" = 600.
function maiorValorReais(texto: string): number {
  let maior = 0;
  const re = /r\$\s?(\d{1,3}(?:[.\s]?\d{3})*(?:,\d{2})?)(\s?mil)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    let n = parseFloat(m[1].replace(/[.\s]/g, '').replace(',', '.'));
    if (m[2]) n *= 1000; // sufixo "mil"
    if (!Number.isNaN(n) && n > maior) maior = n;
  }
  return maior;
}

const PADROES: Array<{ nome: string; teste: (t: string) => boolean }> = [
  { nome: 'preco_sistema', teste: t => maiorValorReais(t) >= LIMIAR_PRECO_SISTEMA },
  { nome: 'kwp',     teste: t => /\b\d{1,3}([.,]\d+)?\s?kwp\b/i.test(t) },
  { nome: 'paineis', teste: t => /\b\d{1,3}\s?pain[eé]is\b/i.test(t) },
  // kWh só com contexto de geração/sistema — leitura da conta do cliente fica liberada.
  { nome: 'geracao_kwh', teste: t => /(sistema|gera|gera[çc][ãa]o|produz|injeta)[^.]{0,20}\d{2,5}\s?kwh/i.test(t) },
  { nome: 'payback', teste: t => /(payback|se paga|paga sozinho|retorno)[^.]{0,25}\d+\s?anos/i.test(t) },
];

export function detectarNumeroProibido(texto: string): ResultadoTrava {
  const t = texto ?? '';
  const motivos = PADROES.filter(p => p.teste(t)).map(p => p.nome);
  return { bloqueado: motivos.length > 0, motivos };
}

// Helper: devolve o texto seguro (o original, ou a mensagem de handoff se vazou número).
// Loga o original pra revisão quando barra.
export function travarTexto(texto: string, contexto = 'eva'): string {
  const r = detectarNumeroProibido(texto);
  if (r.bloqueado) {
    console.warn(`[trava-numero] (${contexto}) resposta barrada (${r.motivos.join(',')}): ${(texto ?? '').slice(0, 200)}`);
    return MENSAGEM_HANDOFF_NUMERO;
  }
  return texto;
}
