// src/modules/anotar-conhecimento.ts
// A assistente anotando o que a equipe ensina — "como uma estagiária eficiente"
// (Junior, 01/09/2026).
//
// Estagiária eficiente ouve tudo, fala pouco, anota o que mandam anotar e
// pergunta quando não tem certeza. O que ela NÃO faz é gravar por conta própria
// o que ouviu de passagem: conversa de grupo é cheia de achismo, e aprender
// errado é pior que não aprender — ela passaria a prometer aquilo pro cliente.
//
// Esta é a FATIA 1: ela só anota quando MANDAM ("Clara, anota: ..."). A fatia 2
// é ela ouvir calada e, de tempos em tempos, prestar contas: "ouvi isso essa
// semana, anoto?" — com aprovação de gente antes de virar resposta ao cliente.

/** Um pedido de anotação identificado numa mensagem. */
export interface PedidoDeAnotar {
  /** Assunto que a pessoa disse na lata ("anota em garantia"), ou null. */
  assuntoDito: string | null;
  /** O que deve ser anotado. */
  texto: string;
}

/** Texto curto demais não é conhecimento — é "ok", "sim", "beleza". */
const MINIMO_UTIL = 8;

/**
 * A mensagem é um pedido de anotar? Precisa chamar a assistente PELO NOME e
 * pedir pra anotar — assim "anota aí que amanhã tem obra" (conversa entre eles)
 * não vira conhecimento da empresa.
 */
export function lerPedidoDeAnotar(mensagem: string, nomeAssistente: string): PedidoDeAnotar | null {
  const texto = (mensagem ?? '').trim();
  const nome = (nomeAssistente ?? '').trim();
  if (!texto || !nome) return null;

  // <nome> [,] anot(a|e|ar) [isso] [em <assunto>] : <conteúdo>
  const re = new RegExp(
    `^\\s*${nome}\\s*[,:]?\\s*anot(?:a|e|ar)\\s*(?:isso|ai|aí)?\\s*(?:em\\s+([^:]{2,40}?)\\s*)?:\\s*(.+)$`,
    'is',
  );
  const m = texto.match(re);
  if (!m) return null;

  const conteudo = (m[2] ?? '').trim();
  if (conteudo.length < MINIMO_UTIL) return null;
  const assunto = (m[1] ?? '').trim();
  return { assuntoDito: assunto || null, texto: conteudo };
}

export interface AssuntoDisponivel {
  chave: string;
  titulo: string;
}

/** Palavras que denunciam o assunto quando ninguém disse qual é. */
const PISTAS: Record<string, RegExp> = {
  garantia: /\bgarantias?\b|\bassist[êe]ncia\b|\bdefeito\b/i,
  marcas: /\bmarcas?\b|\bfabricantes?\b|\binversor(es)?\b|\bplacas?\b|\bm[óo]dulos?\b|\bbaterias?\b/i,
  regiao: /\batende(mos)?\b|\bregi[ãa]o\b|\bcidades?\b|\braio\b|\bdist[âa]ncia\b|\bkm\b/i,
  // "instalação" ficou de fora de propósito: aparece em quase toda frase do
  // ramo ("garantia da instalação", "marca que instalamos") e empatava com
  // todos os assuntos — pista que serve pra tudo não serve pra nada.
  processo: /\bprazo\b|\betapas?\b|\bhomologa|\bvisita\b|\bcronograma\b|\bor[çc]amento\b|\bpasso a passo\b/i,
  produto: /\bvendemos\b|\bofere(ce|cemos)\b|\bproduto\b|\baquecimento\b|\bfotovoltaic/i,
  objecoes: /\bd[úu]vida\b|\bobje[çc][ãa]o\b|\bcliente pergunta\b|\breclama/i,
  diferencial: /\bdiferencial\b|\bdiferente\b|\bvantagem\b|\bpor que fechar\b/i,
};

function normaliza(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

/**
 * Em qual assunto isso entra? O que a pessoa disse vale mais que dedução.
 * Sem certeza, devolve null — melhor perguntar do que gravar no lugar errado.
 */
export function escolherAssunto(
  assuntoDito: string | null,
  texto: string,
  disponiveis: readonly AssuntoDisponivel[],
): AssuntoDisponivel | null {
  if (assuntoDito) {
    const alvo = normaliza(assuntoDito);
    const achado = disponiveis.find(
      (a) => normaliza(a.chave) === alvo || normaliza(a.titulo) === alvo || normaliza(a.titulo).includes(alvo),
    );
    return achado ?? null;   // disse um assunto que não existe: não adivinha
  }
  const candidatos = disponiveis.filter((a) => PISTAS[a.chave]?.test(texto));
  return candidatos.length === 1 ? candidatos[0] : null;   // duas pistas = dúvida = pergunta
}
