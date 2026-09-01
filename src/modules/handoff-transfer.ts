// Mensagem de "assume esse atendimento" que a assistente manda pra quem recebe
// o lead. Estava escrita na unha dentro do index.ts, com "Eva" fixo — o guard
// de nomes (tests/prompts-sem-nome-hardcoded.test.ts) só varre src/prompts/*.md,
// então a assistente da Conquista Solar (Clara) avisava a Jimena dizendo "Eva".
// Aqui vira função pura, testável, com o nome vindo da empresa da mensagem.

export interface HandoffInput {
  /** Telefone do cliente (só dígitos), como chegou. */
  from: string;
  leadId: string;
  leadName?: string;
  contactType?: string;
  reason: string;
  /** Nome da assistente DESTA empresa: "Eva" na EcoSun, "Clara" na Conquista. */
  nomeAtendente: string;
  /** fornecedor/parceiro/spam: quem oferece algo PRA empresa, não é lead. */
  ehContatoComercial: boolean;
  /** Bloco pronto da estimativa determinística (vazio quando não dá pra estimar). */
  estimativaMsg?: string;
  /** Aviso de carga futura que a estimativa não conseguiu somar (vazio se não houver). */
  avisoCargaFutura?: string;
}

export interface Handoff {
  texto: string;
  botoes: Array<{ id: string; title: string }>;
}

export function montarHandoff(i: HandoffInput): Handoff {
  const tipo = i.contactType ? ` (${i.contactType})` : '';
  const nome = i.leadName ? ` - ${i.leadName}` : '';
  const cabecalho = (titulo: string) =>
    `🔔 ${titulo}${tipo}\n\nContato: ${i.from}${nome}\nFalar direto: wa.me/${i.from}\n\nMotivo:\n${i.reason}`;

  if (i.ehContatoComercial) {
    return {
      texto: `${cabecalho('CONTATO COMERCIAL')}\n\nA ${i.nomeAtendente} deu uma resposta curta e está em pausa nesse chat. O que você quer fazer?`,
      botoes: [
        { id: `evabt:lead-pause:${i.leadId}`, title: 'Responder' },
        { id: `evabt:lead-optout:${i.leadId}`, title: 'Ignorar' },
      ],
    };
  }

  const extras = `${i.estimativaMsg ?? ''}${i.avisoCargaFutura ?? ''}`;
  return {
    texto: `${cabecalho('TRANSFERENCIA DE ATENDIMENTO')}${extras}\n\nVocê pode assumir esse atendimento. A ${i.nomeAtendente} fica em pausa nesse chat (se foi engano, é só Reativar).`,
    botoes: [
      { id: `evabt:lead-pause:${i.leadId}`, title: 'Assumir' },
      { id: `evabt:lead-view:${i.leadId}`, title: 'Ver perfil' },
      { id: `evabt:lead-resume:${i.leadId}`, title: `↩️ Reativar ${i.nomeAtendente}` },
    ],
  };
}
