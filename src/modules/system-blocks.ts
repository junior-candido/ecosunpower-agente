import type Anthropic from '@anthropic-ai/sdk';

// Prompt caching pra brain.ts. A causa raiz do custo (caso Ivan ~US$1,15) era
// re-cobrar o system-prompt inteiro (~1443 linhas) TODO turno, sem cache.
//
// Caching = prefix match. Bloco 0 é o prompt ESTÁVEL (idêntico todo request,
// review_link já substituído no caller) com cache_control ephemeral → vira
// prefixo cacheável. Tudo que varia (conhecimento RAG por query, resumo,
// qualstep e principalmente a DATA que muda a cada minuto) vai num bloco
// SEM cache DEPOIS do breakpoint — senão invalidaria o cache todo request.
//
// O conteúdo total (join dos blocos) é byte-idêntico ao que o brain montava
// como string única antes: zero mudança de comportamento, só empacotamento.

export function buildSystemBlocks(input: {
  systemPrompt: string;
  knowledgeBase: string;
  residencialPrompt: string;
  qualificationStep: string;
  summary: string | null;
  /** FICHA do cliente: fatos permanentes já sabidos (o que tem instalado,
   *  quando, atendimentos anteriores). Vem ANTES de tudo no bloco volátil —
   *  a assistente precisa saber com quem fala antes da primeira palavra. */
  ficha?: string | null;
  now: Date;
  /** Duração do cache ('1h' = conversa em que o cliente responde depois de
   *  5+ min continua pegando o cache). Sem valor = padrão da API (5 min). */
  ttl?: '5m' | '1h';
  /** Pedaço FIXO do começo da base de conhecimento (os 6 arquivos core, ou a
   *  base inteira na vitrine). Ganha o próprio ponto de cache. [28/09/2026] */
  conhecimentoEstavel?: string;
}): Anthropic.TextBlockParam[] {
  const { systemPrompt, knowledgeBase, residencialPrompt, qualificationStep, summary, ficha, now, ttl, conhecimentoEstavel } = input;
  const cacheControl: Anthropic.CacheControlEphemeral = ttl ? { type: 'ephemeral', ttl } : { type: 'ephemeral' };

  // Bloco volátil: mesma ordem/texto que o buildSystemContent legado montava
  // a partir de "## Base de Conhecimento" em diante.
  // A ficha vem PRIMEIRO: é o que evita perguntar de novo o que já se sabe.
  let volatile = '';
  if (ficha && ficha.trim()) {
    volatile += `\n\n## 📌 FICHA DESTA PESSOA — leia ANTES de responder

${ficha.trim()}

**Use isso.** NÃO pergunte de novo o que já está aqui. Se a ficha diz que ela é
cliente, trate como cliente desde a primeira palavra — nada de "você já é nosso
cliente?". Se algum dado mudou (mudou de endereço, trocou equipamento), atualize
a ficha com a ação \`anotar_ficha\`.`;
  }

  volatile += '\n\n## Base de Conhecimento da Ecosunpower\n\n' + knowledgeBase;

  if (qualificationStep.includes('residencial') || qualificationStep === 'inicio') {
    volatile += '\n\n' + residencialPrompt;
  }

  if (summary) {
    volatile += '\n\n## Resumo da conversa anterior\n' + summary;
  }

  volatile += `\n\n## Estado atual da qualificacao: ${qualificationStep}`;

  const brtFormatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  volatile += `\n\n## Data e hora atual (Brasilia)\n${brtFormatter.format(now)}`;
  volatile += `\nData ISO: ${now.toISOString()}`;

  // [28/09/2026] 2º ponto de cache logo depois da base FIXA. Só quando ela é
  // o começo exato do bloco volátil (sem ficha antes): aí o corte não muda uma
  // letra do texto — só onde o cache termina. Com ficha, fica como sempre.
  const cabecalhoBase = '\n\n## Base de Conhecimento da Ecosunpower\n\n';
  const prefixoFixo = conhecimentoEstavel ? cabecalhoBase + conhecimentoEstavel : '';
  if (conhecimentoEstavel && conhecimentoEstavel.trim() && volatile.startsWith(prefixoFixo)) {
    return [
      { type: 'text', text: systemPrompt, cache_control: cacheControl },
      { type: 'text', text: prefixoFixo, cache_control: cacheControl },
      { type: 'text', text: volatile.slice(prefixoFixo.length) },
    ];
  }

  return [
    { type: 'text', text: systemPrompt, cache_control: cacheControl },
    { type: 'text', text: volatile },
  ];
}
