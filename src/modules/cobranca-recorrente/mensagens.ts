// src/modules/cobranca-recorrente/mensagens.ts
// Textos da cobrança recorrente (28/09/2026).
//
// WhatsApp fora da janela de 24 h só com MODELO aprovado pela Meta. Os dois
// modelos abaixo o Junior submete no Gerenciador do WhatsApp (categoria
// UTILIDADE, idioma pt_BR) — passo a passo em docs/cobranca-recorrente.md.
// Enquanto não estiverem aprovados, o robô manda por E-MAIL e avisa o Junior
// no WhatsApp com o texto pronto pra ele encaminhar.
//
// A cópia local do texto do modelo é a FONTE: a prévia, o e-mail e o
// "encaminhe" usam exatamente as mesmas palavras.

import { escapeHtml } from '../dashboard/ui/html.js';
import { dataBr, reais, rotuloCompetencia, hojeBrasilia, type AcaoFatura } from './ciclo.js';

export const MODELO_COBRANCA = 'cobranca_mensalidade_v1';
export const MODELO_RECIBO = 'recibo_mensalidade_v1';
export const IDIOMA_MODELO = 'pt_BR';

/** Corpo do modelo cobranca_mensalidade_v1 (5 variáveis). */
export const TEXTO_MODELO_COBRANCA =
  'Olá, {{1}}! Aqui é da EcoSunPower. A fatura da sua mensalidade de {{2}} está em aberto: ' +
  'valor de {{3}}, com vencimento em {{4}}.\n\n' +
  'Para pagar por Pix ou cartão, use este link seguro: {{5}}\n\n' +
  'Se você já pagou, pode desconsiderar esta mensagem. Qualquer dúvida, é só responder por aqui.';

/** Corpo do modelo recibo_mensalidade_v1 (4 variáveis). */
export const TEXTO_MODELO_RECIBO =
  'Olá, {{1}}! Recebemos o seu pagamento de {{2}} referente à mensalidade de {{3}}, em {{4}}. ' +
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

export function paramsModeloCobranca(d: DadosFatura): string[] {
  return [
    primeiroNome(d.nome),
    referenciaDaFatura(d.descricao, d.competencia),
    rs(d.valorCentavos),
    dataBr(d.venceEm),
    d.link ?? '(link indisponível — responda esta mensagem)',
  ];
}

export function paramsModeloRecibo(d: DadosFatura & { pagoCentavos: number; pagoEm: string }): string[] {
  return [
    primeiroNome(d.nome),
    rs(d.pagoCentavos),
    referenciaDaFatura(d.descricao, d.competencia),
    dataBr(hojeBrasilia(new Date(d.pagoEm))),
  ];
}

export function preencherModelo(texto: string, params: string[]): string {
  return texto.replace(/\{\{(\d+)\}\}/g, (m, n: string) => params[Number(n) - 1] ?? m);
}

/** O texto que o cliente lê (igual ao modelo) — usado no "encaminhe" do Junior. */
export function textoCobranca(d: DadosFatura): string {
  return preencherModelo(TEXTO_MODELO_COBRANCA, paramsModeloCobranca(d));
}

// ---------------------------------------------------------------------------
// E-mail (Resend) — plano B e cópia
// ---------------------------------------------------------------------------

export function emailCobranca(acao: Exclude<AcaoFatura, 'atraso_junior'>, d: DadosFatura): { assunto: string; html: string; ctaUrl: string | null } {
  const mes = rotuloCompetencia(d.competencia);
  const desc = limpo(d.descricao);
  const assunto = acao === 'lembrete_d0'
    ? `Vence hoje: fatura de ${mes} — ${desc}`
    : acao === 'lembrete_d3'
      ? `Fatura de ${mes} em aberto — ${desc}`
      : `Sua fatura de ${mes} — ${desc}`;
  const abertura = acao === 'lembrete_d0'
    ? 'Passando pra lembrar que a sua fatura vence <b>hoje</b>.'
    : acao === 'lembrete_d3'
      ? 'A sua fatura ainda está em aberto. Se já pagou, pode desconsiderar este aviso.'
      : 'A fatura da sua mensalidade já está disponível.';
  const html = `<p>Olá, ${escapeHtml(primeiroNome(d.nome))}!</p>
<p>${abertura}</p>
<p><b>${escapeHtml(desc)}</b> — ${escapeHtml(mes)}<br>
Valor: <b>${escapeHtml(rs(d.valorCentavos))}</b><br>
Vencimento: <b>${escapeHtml(dataBr(d.venceEm))}</b></p>
<p>Você pode pagar por Pix ou cartão no botão abaixo.</p>`;
  return { assunto, html, ctaUrl: d.link };
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
<p>Guarde este e-mail como comprovante.</p>`,
  };
}

// ---------------------------------------------------------------------------
// Avisos pro Junior (WhatsApp dele)
// ---------------------------------------------------------------------------

const ROTULO_ACAO: Record<Exclude<AcaoFatura, 'atraso_junior'>, string> = {
  fatura: 'Fatura nova',
  lembrete_d0: 'Lembrete (vence hoje)',
  lembrete_d3: 'Lembrete (3 dias de atraso)',
};

export function avisoJuniorEncaminhar(d: DadosFatura & {
  telefone: string | null;
  email: string | null;
  emailEnviado: boolean;
  motivo: 'modelo_pendente' | 'zap_falhou' | 'sem_whatsapp';
  acao: Exclude<AcaoFatura, 'atraso_junior'>;
}): string {
  const porque = d.motivo === 'modelo_pendente'
    ? `O modelo "${MODELO_COBRANCA}" do WhatsApp ainda não foi aprovado pela Meta`
    : d.motivo === 'zap_falhou'
      ? 'O envio pelo WhatsApp falhou'
      : 'Não tem WhatsApp de cobrança cadastrado';
  const email = d.emailEnviado
    ? `mandei por e-mail (${d.email})`
    : d.email ? `o e-mail pra ${d.email} também falhou` : 'o cliente não tem e-mail cadastrado';
  const pra = d.telefone ? ` (WhatsApp ${d.telefone})` : '';
  return `📨 ${ROTULO_ACAO[d.acao]}: ${d.nome} — ${referenciaDaFatura(d.descricao, d.competencia)} · ${rs(d.valorCentavos)} · vence ${dataBr(d.venceEm)}.\n`
    + `${porque}; ${email}.\n\nEncaminhe o texto abaixo pro cliente${pra}:\n\n${textoCobranca(d)}`;
}

export function avisoJuniorAtraso(d: DadosFatura & { dias: number; assinaturaId: string }): string {
  return `⏰ Mensalidade atrasada há ${d.dias} dias: ${d.nome} — ${referenciaDaFatura(d.descricao, d.competencia)} `
    + `(${rs(d.valorCentavos)}, venceu ${dataBr(d.venceEm)}). O cliente já recebeu a fatura e 2 lembretes; daqui pra frente o robô não manda mais nada.\n`
    + `Detalhes e "Suspender acesso": /dashboard/assinaturas/${d.assinaturaId}`
    + (d.link ? `\nLink de pagamento: ${d.link}` : '');
}

// ---------------------------------------------------------------------------
// /menu da Eva › Financeiro › Mensalidades (resumo pro Junior)
// ---------------------------------------------------------------------------

export function textoResumoMensalidades(d: {
  resumo: { recorrenteCentavos: number; ativas: number; recebidoMesCentavos: number; emAbertoCentavos: number; atrasadas: number };
  atrasadas: Array<{ nome: string; valorCentavos: number; dias: number }>;
  proximas: Array<{ nome: string; valorCentavos: number; venceEm: string }>;
  painelUrl: string | null;
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
  if (d.proximas.length) {
    l.push('', '📅 *Vencem nos próximos 7 dias*');
    for (const p of d.proximas.slice(0, 8)) l.push(`• ${p.nome} — ${rs(p.valorCentavos)} · ${dataBr(p.venceEm).slice(0, 5)}`);
  }
  if (d.painelUrl) l.push('', `Tela: ${d.painelUrl}`);
  return l.join('\n');
}
