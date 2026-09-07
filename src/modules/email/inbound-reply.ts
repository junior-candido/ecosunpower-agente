// src/modules/email/inbound-reply.ts
//
// RESPOSTA DE E-MAIL DO CLIENTE — recebimento automatico.
//
// Por que isso existe (auditoria de 07/09/2026): os 6 modelos da jornada
// terminam pedindo "e so responder este e-mail", mas o remetente fica num
// subdominio de ENVIO da Resend, que assina e entrega e NAO tem MX. Quem
// respondia levava bounce — e o aviso de erro ia pro CLIENTE, nao pra gente.
// Foram 800 e-mails pedindo resposta num endereco que devolvia a carta.
//
// Agora a Resend RECEBE (evento `email.received`) e cai aqui. O que a gente
// faz com a resposta: casa com o lead, grava na ficha, tira da regua de
// e-mail (quem respondeu nao leva mais toque automatico) e chama o Junior no
// WhatsApp — mais uma copia pro Gmail dele, pra nada depender de uma peca so.
//
// Regra de ouro deste arquivo: NADA aqui pode lancar. Se este handler
// estourar, a Resend entende como falha e REENVIA o mesmo evento em loop.
// Por isso cada etapa e isolada, e o aviso ao Junior acontece mesmo que o
// banco esteja fora — perder a resposta de um cliente e o pior desfecho.

export type RespostaRecebida = {
  de: string;               // e-mail do remetente, minusculo
  nomeDe: string | null;    // nome, quando o cabecalho traz
  assunto: string;
  texto: string;            // corpo ja sem o historico citado
  messageId: string | null; // id da Resend, usado pra nao processar 2x
};

export type ProcessoResposta = {
  tratado: boolean;
  leadId?: string | null;
  motivo?: 'duplicado' | 'nao_e_resposta';
};

export type RespostaDeps = {
  buscarLeadPorEmail: (email: string) => Promise<{ id: string; name?: string | null } | null>;
  registrar: (ev: Record<string, unknown>) => Promise<void>;
  cancelarJornada: (leadId: string, motivo: string) => Promise<void>;
  avisarAdmin: (texto: string, leadId: string | null) => Promise<void>;
  /** Copia pro Gmail do Junior. Opcional — sem ele o resto funciona igual. */
  encaminhar?: (assunto: string, corpo: string, de: string) => Promise<void>;
  /** Trava de idempotencia: a Resend reenvia o mesmo evento em caso de duvida. */
  jaProcessado: (messageId: string) => Promise<boolean>;
  /**
   * Busca o CORPO da mensagem (resend.emails.receiving.get).
   *
   * [BUG pego em producao 07/09/2026, no primeiro teste ao vivo] O payload do
   * webhook `email.received` NAO traz o corpo — so from/subject/to/attachments.
   * O primeiro aviso chegou no WhatsApp do Junior sem o texto da mensagem.
   * A Resend so avisa que chegou; o conteudo se busca pelo email_id.
   */
  buscarCorpo?: (emailId: string) => Promise<{ text?: string | null; html?: string | null } | null>;
};

/** Texto usado quando nem o webhook nem a API entregaram o corpo. */
export const SEM_TEXTO = '(nao consegui ler o texto — abra o e-mail para ver)';

const RE_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

/** Tira as tags e devolve texto legivel (fallback quando so veio HTML). */
export function htmlParaTexto(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

/**
 * Le o campo `from`, que a Resend pode mandar em tres formatos:
 * "Nome <e@x.com>", "e@x.com" ou { address, name }.
 */
function lerRemetente(from: unknown): { de: string; nomeDe: string | null } | null {
  if (from && typeof from === 'object') {
    const o = from as { address?: string; email?: string; name?: string };
    const end = (o.address ?? o.email ?? '').trim();
    if (!RE_EMAIL.test(end)) return null;
    return { de: end.toLowerCase(), nomeDe: o.name?.trim() || null };
  }
  if (typeof from !== 'string') return null;

  const comNome = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (comNome) {
    const end = comNome[2].trim();
    if (!RE_EMAIL.test(end)) return null;
    return { de: end.toLowerCase(), nomeDe: comNome[1].trim() || null };
  }

  const so = from.match(RE_EMAIL);
  if (!so) return null;
  return { de: so[0].toLowerCase(), nomeDe: null };
}

/**
 * Corta o historico citado, pra o Junior ler so o que o cliente escreveu.
 * Cobre os cabecalhos do Gmail/Outlook em PT e EN, o separador de "mensagem
 * original" e o bloco final de linhas com ">".
 *
 * Se o corte deixaria a mensagem vazia (cliente respondeu escrevendo DENTRO
 * da citacao, ou so encaminhou), devolve o texto inteiro — melhor mostrar
 * demais do que engolir a resposta.
 */
export function limparCitacao(texto: string): string {
  if (!texto) return '';
  const linhas = texto.replace(/\r\n/g, '\n').split('\n');

  const CABECALHOS = [
    /^\s*On .+ wrote:\s*$/i,                      // Gmail EN (uma linha)
    /^\s*Em .+ escreveu:\s*$/i,                   // Gmail PT (uma linha)
    /^\s*-{2,}\s*(Mensagem original|Original Message|Forwarded message)/i,
    /^\s*_{5,}\s*$/,                              // separador do Outlook
    /^\s*De:\s.+/i,                               // cabecalho do Outlook PT
    /^\s*From:\s.+/i,                             // cabecalho do Outlook EN
  ];

  let corte = linhas.length;
  for (let i = 0; i < linhas.length; i++) {
    if (CABECALHOS.some((re) => re.test(linhas[i]))) { corte = i; break; }
  }

  // Cabecalho do Gmail pode vir quebrado em 2 linhas ("On <data>," / "<nome> wrote:").
  if (corte === linhas.length) {
    for (let i = 0; i < linhas.length - 1; i++) {
      const par = `${linhas[i]} ${linhas[i + 1]}`.trim();
      if (/^(On|Em) .+(wrote|escreveu):\s*$/i.test(par)) { corte = i; break; }
    }
  }

  let corpo = linhas.slice(0, corte);

  // Sem cabecalho, ainda pode haver o bloco citado no fim — tira as linhas ">".
  while (corpo.length && /^\s*>/.test(corpo[corpo.length - 1])) corpo.pop();

  const limpo = corpo.join('\n').trim();
  return limpo || texto.trim();
}

/** Le o payload do webhook `email.received`. Devolve null se nao servir. */
export function extrairRespostaResend(body: unknown): RespostaRecebida | null {
  const b = body as { type?: string; data?: Record<string, unknown> } | null;
  if (b?.type !== 'email.received') return null;

  const d = b.data ?? {};
  const rem = lerRemetente(d.from);
  if (!rem) return null;

  const bruto = typeof d.text === 'string' && d.text.trim()
    ? d.text
    : typeof d.html === 'string' ? htmlParaTexto(d.html) : '';

  return {
    de: rem.de,
    nomeDe: rem.nomeDe,
    assunto: typeof d.subject === 'string' ? d.subject : '(sem assunto)',
    texto: limparCitacao(bruto),
    messageId: typeof d.email_id === 'string' ? d.email_id
      : typeof d.id === 'string' ? d.id : null,
  };
}

/** Encurta pro aviso do WhatsApp, sem cortar palavra no meio. */
export function resumoParaAviso(texto: string, max = 350): string {
  const plano = texto.replace(/\s+/g, ' ').trim();
  if (plano.length <= max) return plano;
  const corte = plano.slice(0, max);
  const espaco = corte.lastIndexOf(' ');
  return (espaco > max * 0.6 ? corte.slice(0, espaco) : corte).trimEnd() + '…';
}

export function montarAvisoResposta(d: {
  nome: string | null;
  de: string;
  assunto: string;
  trecho: string;
}): string {
  const quem = d.nome ? `${d.nome}\n${d.de}` : d.de;
  // Sem corpo, aspas vazias parecem defeito — diz o que houve.
  const corpo = d.trecho.trim() ? `"${d.trecho}"` : `_${SEM_TEXTO}_`;
  return [
    '📧 *RESPONDERAM SEU E-MAIL*',
    '',
    quem,
    '',
    corpo,
    '',
    `_Assunto: ${d.assunto}_`,
  ].join('\n');
}

/**
 * Trata um evento de webhook que PODE ser uma resposta de cliente.
 * Nunca lanca. Cada etapa e isolada: uma falhando nao impede as outras,
 * e o aviso ao Junior sai de qualquer jeito.
 */
export async function processarRespostaEmail(
  deps: RespostaDeps,
  body: unknown,
): Promise<ProcessoResposta> {
  const r = extrairRespostaResend(body);
  if (!r) return { tratado: false, motivo: 'nao_e_resposta' };

  if (r.messageId) {
    const repetido = await deps.jaProcessado(r.messageId).catch(() => false);
    if (repetido) return { tratado: false, motivo: 'duplicado' };
  }

  // O webhook nao traz o corpo (ver buscarCorpo). Busca antes de qualquer
  // coisa, senao o aviso sai vazio — foi exatamente o que aconteceu no
  // primeiro teste ao vivo.
  if (!r.texto.trim() && r.messageId && deps.buscarCorpo) {
    const corpo = await deps.buscarCorpo(r.messageId).catch((e) => {
      console.warn('[resposta-email] nao consegui buscar o corpo:', (e as Error)?.message);
      return null;
    });
    const bruto = corpo?.text?.trim() ? corpo.text : corpo?.html ? htmlParaTexto(corpo.html) : '';
    if (bruto) r.texto = limparCitacao(bruto);
  }

  const lead = await deps.buscarLeadPorEmail(r.de).catch(() => null);
  const leadId = lead?.id ?? null;
  const nome = lead?.name ?? r.nomeDe ?? null;

  // 1. Ficha do cliente. Falhou? segue — o aviso e mais importante.
  await deps
    .registrar({
      tipo: 'email_resposta',
      leadId,
      canal: 'email',
      departamento: 'comercial',
      origem: 'resend-inbound',
      payload: {
        de: r.de,
        assunto: r.assunto,
        texto: r.texto.slice(0, 4000),
        provider_message_id: r.messageId,
      },
    })
    .catch((e) => console.warn('[resposta-email] nao gravou o evento:', (e as Error)?.message));

  // 2. Quem respondeu sai da regua — mesma regra de quem responde no zap.
  if (leadId) {
    await deps
      .cancelarJornada(leadId, 'respondeu')
      .catch((e) => console.warn('[resposta-email] nao cancelou a jornada:', (e as Error)?.message));
  }

  // 3. Avisa o Junior. E a razao de existir disso — sai mesmo sem lead casado.
  await deps
    .avisarAdmin(
      montarAvisoResposta({ nome, de: r.de, assunto: r.assunto, trecho: resumoParaAviso(r.texto) }),
      leadId,
    )
    .catch((e) => console.warn('[resposta-email] nao avisou no whatsapp:', (e as Error)?.message));

  // 4. Copia pro Gmail — a rede de seguranca. Se tudo acima falhar, a
  //    resposta ainda chega na caixa de sempre.
  if (deps.encaminhar) {
    await deps
      .encaminhar(r.assunto, r.texto, r.de)
      .catch((e) => console.warn('[resposta-email] nao encaminhou:', (e as Error)?.message));
  }

  return { tratado: true, leadId };
}
