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
  now: Date;
}): Anthropic.TextBlockParam[] {
  const { systemPrompt, knowledgeBase, residencialPrompt, qualificationStep, summary, now } = input;

  // Bloco volátil: mesma ordem/texto que o buildSystemContent legado montava
  // a partir de "## Base de Conhecimento" em diante.
  let volatile = '\n\n## Base de Conhecimento da Ecosunpower\n\n' + knowledgeBase;

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

  return [
    { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: volatile },
  ];
}
