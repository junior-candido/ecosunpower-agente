// src/modules/cobranca-recorrente/mensagens.ts
// Textos da cobrança recorrente (28/09/2026).
//
// WhatsApp fora da janela de 24 h só com MODELO aprovado pela Meta. Os 4
// modelos abaixo o Junior submete no Gerenciador do WhatsApp (categoria
// UTILIDADE, idioma pt_BR) — passo a passo em docs/cobranca-recorrente.md.
// Enquanto um modelo não estiver aprovado, aquele aviso sai por E-MAIL e o
// Junior recebe no WhatsApp o texto pronto (com o link) pra encaminhar.
//
// A cópia local do texto do modelo é a FONTE: a prévia, o e-mail e o
// "encaminhe" usam as mesmas palavras. O cliente paga por Pix OU cartão de
// crédito no mesmo link (o checkout da InfinitePay mostra os dois).

import { escapeHtml } from '../dashboard/ui/html.js';
import { dataBr, reais, rotuloCompetencia, hojeBrasilia, type AcaoFatura } from './ciclo.js';

export const IDIOMA_MODELO = 'pt_BR';
export const MODELO_COBRANCA = 'cobranca_mensalidade_v1';
export const MODELO_AVISO_PAUSA = 'aviso_pausa_assistente_v1';
export const MODELO_PAUSADA = 'assistente_pausada_v1';
export const MODELO_RECIBO = 'recibo_mensalidade_v1';
export const MODELO_AVISO_DISPAROS = 'aviso_pausa_disparos_v1';
export const MODELO_DISPAROS_PAUSADOS = 'disparos_pausados_v1';

/** fatura / véspera / venceu (e último aviso de quem não tem assistente pra pausar) — 5 variáveis. */
export const TEXTO_MODELO_COBRANCA =
  'Olá, {{1}}! Aqui é da EcoSunPower. A fatura de {{2}} está em aberto: valor de {{3}}, com vencimento em {{4}}.\n\n' +
  'Você pode pagar por Pix ou cartão de crédito neste link seguro: {{5}}\n\n' +
  'Se você já pagou, pode desconsiderar esta mensagem. Qualquer dúvida, é só responder por aqui.';

/** Último aviso de tenant (a assistente pausa no dia seguinte) — 5 variáveis. */
export const TEXTO_MODELO_AVISO_PAUSA =
  'Olá, {{1}}. A fatura de {{2}} ({{3}}) venceu e ainda está em aberto. ' +
  'Para a sua assistente virtual continuar atendendo, o pagamento precisa ser identificado até {{4}}; ' +
  'depois disso ela é pausada até a fatura ser paga.\n\n' +
  'Pague por Pix ou cartão de crédito neste link seguro: {{5}}\n\n' +
  'Seu painel continua funcionando normalmente. Se você já pagou, pode desconsiderar.';

/** Aviso de que a assistente foi pausada — 4 variáveis. */
export const TEXTO_MODELO_PAUSADA =
  'Olá, {{1}}. Como a fatura de {{2}} ({{3}}) segue em aberto, a sua assistente virtual foi pausada hoje. ' +
  'O painel continua funcionando e as mensagens dos seus clientes continuam chegando nele, para você responder.\n\n' +
  'Pague por Pix ou cartão de crédito neste link seguro: {{4}}\n\n' +
  'Assim que o pagamento for confirmado, ela volta a atender sozinha.';

/** Véspera da 2ª trava — 5 variáveis. */
export const TEXTO_MODELO_AVISO_DISPAROS =
  'Olá, {{1}}. A fatura de {{2}} ({{3}}) segue em aberto e a sua assistente virtual já está pausada. ' +
  'Se o pagamento não for identificado até {{4}}, também vamos pausar as mensagens automáticas para os seus clientes ' +
  '(acompanhamentos, lembretes e reativações).\n\n' +
  'Pague por Pix ou cartão de crédito neste link seguro: {{5}}\n\n' +
  'Seu painel continua funcionando normalmente. Se você já pagou, pode desconsiderar.';

/** 2ª trava aconteceu — 4 variáveis. */
export const TEXTO_MODELO_DISPAROS_PAUSADOS =
  'Olá, {{1}}. Como a fatura de {{2}} ({{3}}) segue em aberto, as mensagens automáticas para os seus clientes ' +
  '(acompanhamentos, lembretes e reativações) foram pausadas hoje, junto com a assistente virtual. O painel continua funcionando.\n\n' +
  'Pague por Pix ou cartão de crédito neste link seguro: {{4}}\n\n' +
  'Assim que o pagamento for confirmado, tudo volta sozinho, aos poucos.';

/** Recibo — 4 variáveis. */
export const TEXTO_MODELO_RECIBO =
  'Olá, {{1}}! Recebemos o seu pagamento de {{2}} referente a {{3}}, em {{4}}. ' +
  'Obrigado pela confiança! Guarde esta mensagem como comprovante.';

export interface DadosFatura {
  nome: string;
  descricao: string;
  competencia: string;
  venceEm: string;
  valorCentavos: number;
  link: string | null;
}

/** A Meta recusa variável com quebra de linha, tab ou 4+ espaços seguidos. */
function limpo(s: string): string {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

export function primeiroNome(nome: string | null | undefined): string {
  const p = limpo(nome ?? '').split(' ')[0] ?? '';
  if (!p) return 'cliente';
  return p.charAt(0).toUpperCase() + p.slice(1);
}

export function referenciaDaFatura(descricao: string, competencia: string): string {
  return `${limpo(descricao)} — ${rotuloCompetencia(competencia)}`;
}

const rs = (c: number) => `R$ ${reais(c)}`;
const SEM_LINK = '(link indisponível — responda esta mensagem)';

export function preencherModelo(texto: string, params: string[]): string {
  return texto.replace(/\{\{(\d+)\}\}/g, (m, n: string) => params[Number(n) - 1] ?? m);
}

export function paramsModeloCobranca(d: DadosFatura): string[] {
  return [primeiroNome(d.nome), referenciaDaFatura(d.descricao, d.competencia), rs(d.valorCentavos), dataBr(d.venceEm), d.link ?? SEM_LINK];
}

/** O texto que o cliente lê (igual ao modelo) — usado no "encaminhe" do Junior. */
export function textoCobranca(d: DadosFatura): string {
  return preencherModelo(TEXTO_MODELO_COBRANCA, paramsModeloCobranca(d));
}

export function paramsModeloRecibo(d: DadosFatura & { pagoCentavos: number; pagoEm: string }): string[] {
  return [primeiroNome(d.nome), rs(d.pagoCentavos), referenciaDaFatura(d.descricao, d.competencia), dataBr(hojeBrasilia(new Date(d.pagoEm)))];
}

// ---------------------------------------------------------------------------
// Um toque ao cliente = modelo + parâmetros + e-mail (mesmas palavras)
// ---------------------------------------------------------------------------

export interface MensagemCliente {
  modelo: string;
  params: string[];
  /** O texto como o cliente lê (prévia / "encaminhe"). */
  texto: string;
  email: { assunto: string; html: string; ctaUrl: string | null };
}

const ASSINATURA_EMAIL = '<p>Qualquer dúvida, é só responder este e-mail.<br>Equipe EcoSunPower</p>';

function htmlEmail(nome: string, linhas: string[], d: DadosFatura, comValores = true): string {
  const valores = comValores
    ? `<p><b>${escapeHtml(referenciaDaFatura(d.descricao, d.competencia))}</b><br>
Valor: <b>${escapeHtml(rs(d.valorCentavos))}</b><br>
Vencimento: <b>${escapeHtml(dataBr(d.venceEm))}</b></p>`
    : '';
  return `<p>Olá, ${escapeHtml(primeiroNome(nome))}!</p>\n${linhas.map((l) => `<p>${l}</p>`).join('\n')}\n${valores}\n<p>Você pode pagar por <b>Pix ou cartão de crédito</b> no botão abaixo.</p>\n${ASSINATURA_EMAIL}`;
}

/**
 * Mensagem de cada toque da régua. `pausavel` = assinatura de tenant com pausa
 * automática: o último aviso fala da assistente; senão é um lembrete comum.
 */
export function mensagemDoToque(
  acao: AcaoFatura,
  d: DadosFatura,
  ctx: { pausavel: boolean; dataPausa: string | null; hoje: string; dataDisparos?: string | null },
): MensagemCliente {
  const mes = rotuloCompetencia(d.competencia);
  const desc = limpo(d.descricao);
  if (acao === 'aviso_disparos' && ctx.pausavel && ctx.dataDisparos) {
    const limite = dataBr(somarDias(ctx.dataDisparos, -1));
    const params = [primeiroNome(d.nome), referenciaDaFatura(d.descricao, d.competencia), rs(d.valorCentavos), limite, d.link ?? SEM_LINK];
    return {
      modelo: MODELO_AVISO_DISPAROS, params, texto: preencherModelo(TEXTO_MODELO_AVISO_DISPAROS, params),
      email: {
        assunto: `Aviso: mensagens automáticas param amanhã — fatura de ${mes} em aberto`,
        html: htmlEmail(d.nome, [
          'A sua fatura segue em aberto e a sua assistente virtual já está pausada.',
          `Se o pagamento não for identificado até <b>${escapeHtml(limite)}</b>, também vamos pausar as mensagens automáticas para os seus clientes (acompanhamentos, lembretes e reativações). Seu painel continua funcionando normalmente.`,
          'Se você já pagou, pode desconsiderar.',
        ], d),
        ctaUrl: d.link,
      },
    };
  }
  if (acao === 'ultimo_aviso' && ctx.pausavel && ctx.dataPausa) {
    const params = [primeiroNome(d.nome), referenciaDaFatura(d.descricao, d.competencia), rs(d.valorCentavos), dataBr(somarDias(ctx.dataPausa, -1)), d.link ?? SEM_LINK];
    return {
      modelo: MODELO_AVISO_PAUSA, params, texto: preencherModelo(TEXTO_MODELO_AVISO_PAUSA, params),
      email: {
        assunto: `Último aviso: fatura de ${mes} em aberto — ${desc}`,
        html: htmlEmail(d.nome, [
          'A sua fatura venceu e ainda está em aberto.',
          `Para a sua assistente virtual continuar atendendo, o pagamento precisa ser identificado até <b>${escapeHtml(dataBr(somarDias(ctx.dataPausa, -1)))}</b>. Depois disso ela é pausada até a fatura ser paga — o painel continua funcionando normalmente.`,
          'Se você já pagou, pode desconsiderar.',
        ], d),
        ctaUrl: d.link,
      },
    };
  }
  const params = paramsModeloCobranca(d);
  const vence = d.venceEm === ctx.hoje ? 'vence <b>hoje</b>' : 'vence <b>amanhã</b>';
  const aberturas: Record<AcaoFatura, { assunto: string; linhas: string[] }> = {
    fatura: { assunto: `Sua fatura de ${mes} — ${desc}`, linhas: ['A fatura da sua mensalidade já está disponível.'] },
    vespera: { assunto: `${d.venceEm === ctx.hoje ? 'Vence hoje' : 'Vence amanhã'}: fatura de ${mes} — ${desc}`, linhas: [`Passando pra lembrar que a sua fatura ${vence}.`] },
    venceu: { assunto: `Fatura de ${mes} em aberto — ${desc}`, linhas: ['A sua fatura venceu e ainda está em aberto.', 'Se você já pagou, pode desconsiderar este aviso.'] },
    ultimo_aviso: { assunto: `Lembrete: fatura de ${mes} em aberto — ${desc}`, linhas: ['A sua fatura segue em aberto.', 'Se você já pagou, pode desconsiderar este aviso.'] },
    aviso_disparos: { assunto: `Lembrete: fatura de ${mes} em aberto — ${desc}`, linhas: ['A sua fatura segue em aberto.', 'Se você já pagou, pode desconsiderar este aviso.'] },
  };
  const a = aberturas[acao];
  return {
    modelo: MODELO_COBRANCA, params, texto: preencherModelo(TEXTO_MODELO_COBRANCA, params),
    email: { assunto: a.assunto, html: htmlEmail(d.nome, a.linhas, d), ctaUrl: d.link },
  };
}

/** Aviso ao cliente: a assistente foi pausada hoje. */
export function mensagemPausa(d: DadosFatura): MensagemCliente {
  const params = [primeiroNome(d.nome), referenciaDaFatura(d.descricao, d.competencia), rs(d.valorCentavos), d.link ?? SEM_LINK];
  return {
    modelo: MODELO_PAUSADA, params, texto: preencherModelo(TEXTO_MODELO_PAUSADA, params),
    email: {
      assunto: `Sua assistente foi pausada — fatura de ${rotuloCompetencia(d.competencia)} em aberto`,
      html: htmlEmail(d.nome, [
        'Como a fatura abaixo segue em aberto, a sua assistente virtual foi pausada hoje.',
        'O painel continua funcionando e as mensagens dos seus clientes continuam chegando nele, para você responder.',
        'Assim que o pagamento for confirmado, ela volta a atender sozinha.',
      ], d),
      ctaUrl: d.link,
    },
  };
}

/** Aviso ao cliente: a 2ª trava aconteceu (disparos automáticos pausados). */
export function mensagemDisparosPausados(d: DadosFatura): MensagemCliente {
  const params = [primeiroNome(d.nome), referenciaDaFatura(d.descricao, d.competencia), rs(d.valorCentavos), d.link ?? SEM_LINK];
  return {
    modelo: MODELO_DISPAROS_PAUSADOS, params, texto: preencherModelo(TEXTO_MODELO_DISPAROS_PAUSADOS, params),
    email: {
      assunto: `Mensagens automáticas pausadas — fatura de ${rotuloCompetencia(d.competencia)} em aberto`,
      html: htmlEmail(d.nome, [
        'Como a fatura abaixo segue em aberto, as mensagens automáticas para os seus clientes (acompanhamentos, lembretes e reativações) foram pausadas hoje, junto com a assistente virtual.',
        'O painel continua funcionando. Assim que o pagamento for confirmado, tudo volta sozinho, aos poucos.',
      ], d),
      ctaUrl: d.link,
    },
  };
}

/** E-mail: a assistente voltou (pagamento confirmado). No WhatsApp o recibo já avisa. */
export function emailReativada(nome: string): { assunto: string; html: string } {
  return {
    assunto: 'Sua assistente voltou a atender',
    html: `<p>Olá, ${escapeHtml(primeiroNome(nome))}!</p>\n<p>O pagamento foi confirmado e a sua assistente virtual <b>voltou a atender</b> os seus clientes. Obrigado!</p>\n${ASSINATURA_EMAIL}`,
  };
}

export function emailRecibo(d: DadosFatura & { pagoCentavos: number; pagoEm: string }): { assunto: string; html: string } {
  const ref = referenciaDaFatura(d.descricao, d.competencia);
  return {
    assunto: `Pagamento recebido — ${ref}`,
    html: `<p>Olá, ${escapeHtml(primeiroNome(d.nome))}!</p>
<p>Recebemos o seu pagamento. Obrigado pela confiança!</p>
<p><b>${escapeHtml(ref)}</b><br>
Valor pago: <b>${escapeHtml(rs(d.pagoCentavos))}</b><br>
Data: <b>${escapeHtml(dataBr(hojeBrasilia(new Date(d.pagoEm))))}</b></p>
<p>Guarde este e-mail como comprovante.</p>
${ASSINATURA_EMAIL}`,
  };
}

function somarDias(iso: string, n: number): string {
  const [y, m, dd] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, dd! + n)).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Avisos pro Junior (WhatsApp dele)
// ---------------------------------------------------------------------------

export const ROTULO_TOQUE: Record<AcaoFatura | 'pausa' | 'pausa_disparos', string> = {
  fatura: 'Fatura nova',
  vespera: 'Lembrete (vence amanhã)',
  venceu: 'Lembrete (venceu)',
  ultimo_aviso: 'Último aviso',
  aviso_disparos: 'Aviso (disparos param amanhã)',
  pausa: 'Assistente pausada',
  pausa_disparos: 'Disparos automáticos pausados',
};

export function avisoJuniorEncaminhar(d: DadosFatura & {
  telefone: string | null;
  email: string | null;
  emailEnviado: boolean;
  motivo: 'modelo_pendente' | 'zap_falhou' | 'sem_whatsapp';
  rotulo: string;
  modelo: string;
  texto: string;
}): string {
  const porque = d.motivo === 'modelo_pendente'
    ? `O modelo "${d.modelo}" do WhatsApp ainda não foi aprovado pela Meta`
    : d.motivo === 'zap_falhou'
      ? 'O envio pelo WhatsApp falhou'
      : 'Não tem WhatsApp de cobrança cadastrado';
  const email = d.emailEnviado
    ? `mandei por e-mail (${d.email})`
    : d.email ? `o e-mail pra ${d.email} também falhou` : 'o cliente não tem e-mail cadastrado';
  const pra = d.telefone ? ` (WhatsApp ${d.telefone})` : '';
  return `📨 ${d.rotulo}: ${d.nome} — ${referenciaDaFatura(d.descricao, d.competencia)} · ${rs(d.valorCentavos)} · vence ${dataBr(d.venceEm)}.\n`
    + `${porque}; ${email}.\n\nEncaminhe o texto abaixo pro cliente${pra}:\n\n${d.texto}`;
}

/** Junto do último aviso ao cliente: o Junior fica sabendo (e pode dar mais prazo). */
export function avisoJuniorUltimo(d: DadosFatura & { dias: number; pausavel: boolean; dataPausa: string | null; urlAssinatura: string }): string {
  const cab = `⏰ Mensalidade atrasada ${d.dias} dia${d.dias === 1 ? '' : 's'}: ${d.nome} — ${referenciaDaFatura(d.descricao, d.competencia)} (${rs(d.valorCentavos)}, venceu ${dataBr(d.venceEm)}). O cliente recebeu o último aviso.`;
  const pausa = d.pausavel && d.dataPausa
    ? `\nA assistente do painel dele PAUSA em ${dataBr(d.dataPausa)} se não pagar. Pra dar mais prazo ou não pausar: ${d.urlAssinatura}`
    : `\nDetalhes: ${d.urlAssinatura}`;
  return cab + pausa + (d.link ? `\nLink de pagamento: ${d.link}` : '');
}

export function avisoJuniorPausada(d: { nome: string; empresa: string | null; ref: string; valorCentavos: number; urlAssinatura: string; manual: boolean }): string {
  return `⏸️ Assistente ${d.empresa ? `de ${d.empresa} ` : ''}PAUSADA ${d.manual ? '(por você)' : 'por fatura em aberto'}: ${d.nome} — ${d.ref} (${rs(d.valorCentavos)}).\n`
    + 'O painel dele continua funcionando; as mensagens dos clientes ficam guardadas lá. Volta sozinha quando pagar.\n'
    + `Reativar agora / dar mais prazo: ${d.urlAssinatura}`;
}

export function avisoJuniorVesperaDisparos(d: DadosFatura & { dataDisparos: string; urlAssinatura: string }): string {
  return `⏰ Amanhã (${dataBr(d.dataDisparos)}) param também os DISPAROS AUTOMÁTICOS de ${d.nome} (cadência, follow-ups, reativação) — ${referenciaDaFatura(d.descricao, d.competencia)} segue em aberto (${rs(d.valorCentavos)}). O cliente foi avisado.\n`
    + `Pra dar mais prazo ou não travar: ${d.urlAssinatura}`;
}

export function avisoJuniorDisparosPausados(d: { nome: string; empresa: string | null; ref: string; valorCentavos: number; urlAssinatura: string; manual: boolean }): string {
  return `⛔ Disparos automáticos ${d.empresa ? `de ${d.empresa} ` : ''}PAUSADOS ${d.manual ? '(por você)' : 'por fatura em aberto (2ª trava)'}: ${d.nome} — ${d.ref} (${rs(d.valorCentavos)}).\n`
    + 'Cadência, follow-ups e reativações dos clientes dele ficam na fila e voltam aos poucos quando pagar. O painel continua funcionando.\n'
    + `Reativar / dar mais prazo: ${d.urlAssinatura}`;
}

export function avisoJuniorReativada(d: { nome: string; empresa: string | null; motivo: 'pagou' | 'manual' | 'prazo' }): string {
  const porque = d.motivo === 'pagou' ? 'pagamento confirmado' : d.motivo === 'prazo' ? 'você deu mais prazo' : 'reativada por você';
  return `▶️ Assistente ${d.empresa ? `de ${d.empresa} ` : ''}voltou a atender (${porque}): ${d.nome}.`;
}

// ---------------------------------------------------------------------------
// /menu da Eva › Financeiro › Mensalidades (resumo pro Junior)
// ---------------------------------------------------------------------------

export function textoResumoMensalidades(d: {
  resumo: { recorrenteCentavos: number; ativas: number; recebidoMesCentavos: number; emAbertoCentavos: number; atrasadas: number };
  atrasadas: Array<{ nome: string; valorCentavos: number; dias: number }>;
  proximas: Array<{ nome: string; valorCentavos: number; venceEm: string }>;
  painelUrl: string | null;
  pausadas?: string[];
}): string {
  const l: string[] = [
    '🔁 *Mensalidades*',
    `Recorrente por mês: *${rs(d.resumo.recorrenteCentavos)}* (${d.resumo.ativas} assinatura${d.resumo.ativas === 1 ? '' : 's'})`,
    `Recebido este mês: ${rs(d.resumo.recebidoMesCentavos)} · Em aberto: ${rs(d.resumo.emAbertoCentavos)}`,
  ];
  if (d.atrasadas.length) {
    l.push('', `⏰ *Atrasadas (${d.atrasadas.length})*`);
    for (const a of d.atrasadas.slice(0, 8)) l.push(`• ${a.nome} — ${rs(a.valorCentavos)} · ${a.dias} dia${a.dias === 1 ? '' : 's'}`);
  } else {
    l.push('', '✅ Nenhuma atrasada — tudo em dia.');
  }
  if (d.pausadas?.length) l.push('', `⏸️ *Assistente pausada:* ${d.pausadas.join(', ')}`);
  if (d.proximas.length) {
    l.push('', '📅 *Vencem nos próximos 7 dias*');
    for (const p of d.proximas.slice(0, 8)) l.push(`• ${p.nome} — ${rs(p.valorCentavos)} · ${dataBr(p.venceEm).slice(0, 5)}`);
  }
  if (d.painelUrl) l.push('', `Tela: ${d.painelUrl}`);
  return l.join('\n');
}
