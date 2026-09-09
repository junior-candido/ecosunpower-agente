// src/modules/email/alerta-abertura.ts
//
// "DEVE VIM NO ZAP CADA VEZ QUE ALGUÉM ABRIR O EMAIL, IGUAL A PROPOSTA"
// (Junior, 09/09/2026, minutos depois de mandar a Pasta Digital da Tatiane).
//
// ⚠️ O CUIDADO QUE FAZ ISSO PRESTAR: Gmail e Outlook passam a imagem de
// rastreio pelo proxy deles e disparam `opened` VÁRIAS vezes pelo mesmo
// e-mail — às vezes de minuto em minuto, e às vezes sem ninguém ter aberto
// nada (é o proxy pré-carregando). Sem trava, um e-mail vira 20 avisos e em
// duas horas o Junior desliga tudo.
//
// A regra: **um aviso de abertura por e-mail**. Clique é outra história — é
// raro, é intencional e não mente (não dá pra clicar sem abrir), então clique
// sempre avisa, mesmo que a abertura já tenha avisado.
//
// A abertura também SUBESTIMA: quem lê no app do Gmail com imagens bloqueadas
// nunca conta. Por isso o clique vale mais, e o texto do aviso deixa claro
// qual dos dois aconteceu.

export type TipoEventoEmail =
  | 'email_enviado' | 'email_entregue' | 'email_aberto'
  | 'email_clicado' | 'email_bounce' | 'email_descadastro';

/** Nome de gente pra cada contexto — o aviso não mostra chave de banco. */
const CONTEXTO_HUMANO: Record<string, string> = {
  pasta_digital: 'a pasta da usina',
  proposta: 'a proposta',
  jornada: 'a sequência de e-mails',
  campanha: 'a campanha',
  outro: 'o e-mail',
};

export interface DecisaoAlerta {
  tipo: TipoEventoEmail;
  /** Já houve aviso de abertura deste mesmo e-mail? */
  jaAvisouAbertura: boolean;
  /** Já houve aviso de clique deste mesmo e-mail? */
  jaAvisouClique: boolean;
}

/** Este evento vira aviso no zap agora? */
export function decidirAlertaEmail(d: DecisaoAlerta): boolean {
  if (d.tipo === 'email_aberto') return !d.jaAvisouAbertura;
  if (d.tipo === 'email_clicado') return !d.jaAvisouClique;
  return false;
}

export interface TextoAlerta {
  tipo: TipoEventoEmail;
  nome: string;
  assunto: string;
  contexto: string;
}

/** O aviso que chega no zap. Curto: é notificação, não relatório. */
export function textoAlertaEmail(t: TextoAlerta): string {
  const quem = (t.nome ?? '').trim() || 'Um cliente';
  const oQue = CONTEXTO_HUMANO[t.contexto] ?? CONTEXTO_HUMANO.outro;
  const assunto = (t.assunto ?? '').trim();
  const corte = assunto.length > 90 ? assunto.slice(0, 87) + '…' : assunto;

  const cabeca = t.tipo === 'email_clicado'
    ? `🔥 ${quem} CLICOU no e-mail — abriu ${oQue}`
    : `📧 ${quem} abriu o e-mail — ${oQue}`;

  const rodape = t.tipo === 'email_clicado'
    ? 'Clique é sinal forte: ela foi ver o material.'
    : 'Abertura conta menos que clique (o Gmail bloqueia o rastreio), mas já é sinal.';

  return corte ? `${cabeca}\n_${corte}_\n\n${rodape}` : `${cabeca}\n\n${rodape}`;
}
