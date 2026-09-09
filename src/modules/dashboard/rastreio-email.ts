// src/modules/dashboard/rastreio-email.ts
//
// O que aconteceu com os e-mails DESTE cliente, numa linha que se lê de
// relance na ficha.
//
// Junior, 09/09/2026: "teria como rastrear para ver se os emails enviados são
// abertos". Tinha — o dado estava em `eventos_elo` desde 07/09. Faltava ONDE
// VER: a única tela mostrava o TOTAL da sequência de marketing, então pra
// saber de UM cliente só existia SQL.
//
// ⚠️ ABERTURA SEMPRE SUBESTIMA. Gmail e Outlook bloqueiam o pixel invisível
// que conta a abertura, então "aberto" some pra boa parte das pessoas. CLIQUE
// nunca mente: quem clicou, abriu — mesmo sem evento de abertura. Por isso o
// clique manda no resumo e implica abertura.

export interface EventoEmail {
  tipo: 'email_enviado' | 'email_entregue' | 'email_aberto'
      | 'email_clicado' | 'email_bounce' | 'email_descadastro';
  criado_em: string;
}

export interface ResumoEmail {
  houve: boolean;
  enviados: number;
  abriu: boolean;
  clicou: boolean;
  /** Bounce ou reclamação de spam — grita mais alto que o resto. */
  problema: boolean;
  /** Uma linha pra mostrar na ficha. */
  rotulo: string;
  /** ISO do último acontecimento, pro "quando". */
  ultimoEm: string | null;
}

const DE_EMAIL = new Set([
  'email_enviado', 'email_entregue', 'email_aberto',
  'email_clicado', 'email_bounce', 'email_descadastro',
]);

export function resumirEmails(eventos: ReadonlyArray<EventoEmail>): ResumoEmail {
  const meus = (eventos ?? []).filter((e) => DE_EMAIL.has(e.tipo));
  if (meus.length === 0) {
    return { houve: false, enviados: 0, abriu: false, clicou: false, problema: false,
             rotulo: 'nenhum e-mail', ultimoEm: null };
  }

  const enviados = meus.filter((e) => e.tipo === 'email_enviado').length;
  const clicou = meus.some((e) => e.tipo === 'email_clicado');
  // Clique implica abertura: é impossível clicar sem abrir — o que falhou foi
  // o pixel, bloqueado pelo cliente de e-mail.
  const abriu = clicou || meus.some((e) => e.tipo === 'email_aberto');
  const bounce = meus.some((e) => e.tipo === 'email_bounce');
  const spam = meus.some((e) => e.tipo === 'email_descadastro');
  const problema = bounce || spam;

  const ultimoEm = meus
    .map((e) => e.criado_em)
    .sort()
    .at(-1) ?? null;

  let rotulo: string;
  if (bounce) rotulo = '⚠️ voltou — endereço não recebeu';
  else if (spam) rotulo = '⚠️ marcado como spam';
  else if (clicou) rotulo = '🔥 clicou no e-mail';
  else if (abriu) rotulo = '👀 abriu o e-mail';
  else if (meus.some((e) => e.tipo === 'email_entregue')) rotulo = '✅ entregue, ainda não abriu';
  else rotulo = '📧 enviado';

  return { houve: true, enviados, abriu, clicou, problema, rotulo, ultimoEm };
}
