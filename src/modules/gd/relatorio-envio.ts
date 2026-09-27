// src/modules/gd/relatorio-envio.ts
// Envio do relatório mensal da usina ao cliente (fatia 3 dos demonstrativos).
// Decide QUEM recebe e POR ONDE, manda e devolve o resultado de cada canal —
// sem banco e sem Express: a rota injeta os envios (já rodando dentro da
// empresa e do canal dela, ver dashboard/canal-envio.ts) e o teste injeta
// fakes. Nunca falha em silêncio: todo "não saiu" volta com motivo pra tela.

import { normalizeBrazilianPhone } from '../meta-leadgen.js';
import { montarMolduraEmail, escapeHtml } from '../email/email-moldura.js';
import { ehEcosun, type EmpresaConfig } from '../empresa-config.js';
import type { ResultadoCanal } from '../relatorios/pasta/resultado-envio.js';
import type { SupabaseService } from '../supabase.js';
import {
  TEMPLATE_RELATORIO, componentesTemplateRelatorio, textoLivreRelatorio, textoTemplateRelatorio,
  type ComponenteTemplate,
} from './relatorio-envio-textos.js';

/** casa = EcoSun (WABA/canal padrão) · evolution = instância própria do tenant · nenhum = tenant sem WhatsApp conectado. */
export type CanalZap = 'casa' | 'evolution' | 'nenhum';

export interface LeadDestino {
  id: string;
  nome: string | null;
  phone: string | null;
  email: string | null;
  optOut: boolean;
}

/** Motivos que este envio devolve pro WhatsApp — todos têm texto em resultado-envio.ts (teste garante). */
export const MOTIVOS_ZAP_RELATORIO = [
  'opt_out', 'sem_canal', 'sem_phone', 'telefone_invalido', 'bloqueado_lgpd', 'falha_envio', 'modelo_nao_aprovado',
] as const;
/** Motivos que este envio devolve pro e-mail — todos têm texto em resultado-envio.ts (teste garante). */
export const MOTIVOS_EMAIL_RELATORIO = ['opt_out', 'sem_email', 'email_invalido', 'falha_envio'] as const;
export type MotivoZapRelatorio = (typeof MOTIVOS_ZAP_RELATORIO)[number];
export type MotivoEmailRelatorio = (typeof MOTIVOS_EMAIL_RELATORIO)[number];

/**
 * POLÍTICA DO OPT-OUT (leads.opt_out) — único lugar a mexer.
 * Padrão do plano (27/09/2026): cliente que pediu pra não receber mensagens
 * NÃO recebe o relatório por nenhum canal, e a tela mostra o motivo.
 * Se o dono decidir que o relatório (serviço contratado) pode ir por e-mail
 * mesmo com opt-out, trocar `email` para false.
 */
export const OPT_OUT_BLOQUEIA: Readonly<Record<'zap' | 'email', boolean>> = { zap: true, email: true };

export function optOutBloqueia(canal: 'zap' | 'email', optOut: boolean): boolean {
  return optOut && OPT_OUT_BLOQUEIA[canal];
}

export interface DestinoEnvio {
  zap: { fone: string | null; motivo: MotivoZapRelatorio | null };
  email: { para: string | null; motivo: MotivoEmailRelatorio | null };
}

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function destinoDoEnvio(
  lead: LeadDestino,
  o: { canal: CanalZap; bloqueadoLgpd: (fone: string) => boolean },
): DestinoEnvio {
  let zap: DestinoEnvio['zap'];
  if (optOutBloqueia('zap', lead.optOut)) zap = { fone: null, motivo: 'opt_out' };
  else if (o.canal === 'nenhum') zap = { fone: null, motivo: 'sem_canal' };
  else if (!String(lead.phone ?? '').trim()) zap = { fone: null, motivo: 'sem_phone' };
  else {
    // Sempre 55DDNNNNNNNNN (caso Nelson, 23/09): número cru a Meta lê errado.
    const fone = normalizeBrazilianPhone(String(lead.phone));
    if (!fone) zap = { fone: null, motivo: 'telefone_invalido' };
    // A trava LGPD do sendText descarta em silêncio — aqui ela vira motivo na tela.
    else if (o.bloqueadoLgpd(fone)) zap = { fone: null, motivo: 'bloqueado_lgpd' };
    else zap = { fone, motivo: null };
  }

  const bruto = String(lead.email ?? '').trim();
  let email: DestinoEnvio['email'];
  if (optOutBloqueia('email', lead.optOut)) email = { para: null, motivo: 'opt_out' };
  else if (!bruto) email = { para: null, motivo: 'sem_email' };
  else if (!RE_EMAIL.test(bruto)) email = { para: null, motivo: 'email_invalido' };
  else email = { para: bruto, motivo: null };

  return { zap, email };
}

export interface MensagemRelatorio {
  nome: string;
  mesExtenso: string;
  token: string;
  link: string;
  pdf: Buffer | null;
  nomeArquivo: string;
}

export interface DepsZapRelatorio {
  canal: CanalZap;
  sendText: (to: string, text: string) => Promise<void>;
  /** Só EcoSun (WABA). A rota passa undefined para tenant. */
  sendTemplate?: (to: string, name: string, lang: string, components: ComponenteTemplate[]) => Promise<unknown>;
  /** Só tenant (Evolution): o PDF anexo. */
  sendDocument?: (to: string, base64: string, fileName: string, caption: string) => Promise<void>;
}

export interface ResultadoZapRelatorio extends ResultadoCanal {
  /** O que o cliente recebeu — vai pra conversa dele no painel. */
  textoEnviado?: string;
}

const AVISO_TEXTO_LIVRE =
  `saiu como mensagem comum porque o modelo "${TEMPLATE_RELATORIO}" ainda não foi aprovado na Meta — ` +
  'só chega se o cliente falou com a gente nas últimas 24 horas';

export async function enviarRelatorioZap(
  dest: DestinoEnvio['zap'],
  m: MensagemRelatorio,
  d: DepsZapRelatorio,
): Promise<ResultadoZapRelatorio> {
  if (d.canal === 'nenhum') return { ok: false, reason: 'sem_canal' };
  if (!dest.fone) return { ok: false, reason: dest.motivo ?? 'sem_phone' };
  const fone = dest.fone;
  const livre = textoLivreRelatorio(m.nome, m.mesExtenso, m.link);

  if (d.canal === 'evolution') {
    // Número próprio do tenant: mensagem comum sempre chega (não há janela de 24 h).
    try {
      await d.sendText(fone, livre);
    } catch (err) {
      return { ok: false, reason: 'falha_envio', detalhe: (err as Error).message, para: fone };
    }
    let aviso: string | undefined;
    if (d.sendDocument && m.pdf) {
      try {
        await d.sendDocument(fone, m.pdf.toString('base64'), m.nomeArquivo, `Relatório de ${m.mesExtenso}`);
      } catch (err) {
        aviso = `a mensagem com o link saiu, mas o PDF anexo não (${(err as Error).message})`;
      }
    }
    return { ok: true, para: fone, aviso, textoEnviado: livre };
  }

  // EcoSun: modelo aprovado primeiro (chega com a janela de 24 h fechada).
  let erroModelo = 'modelo não configurado neste ambiente';
  if (d.sendTemplate) {
    try {
      await d.sendTemplate(fone, TEMPLATE_RELATORIO, 'pt_BR', componentesTemplateRelatorio(m.nome, m.mesExtenso, m.token));
      return { ok: true, para: fone, textoEnviado: textoTemplateRelatorio(m.nome, m.mesExtenso) };
    } catch (err) {
      erroModelo = (err as Error).message;
      console.warn(`[relatorio-gd] modelo ${TEMPLATE_RELATORIO} recusado: ${erroModelo}`);
    }
  }
  try {
    await d.sendText(fone, livre);
    return { ok: true, para: fone, aviso: AVISO_TEXTO_LIVRE, textoEnviado: livre };
  } catch (err) {
    return { ok: false, reason: 'modelo_nao_aprovado', detalhe: `${erroModelo} / ${(err as Error).message}`, para: fone };
  }
}

/** Logo do e-mail: EcoSun usa a padrão da moldura; tenant usa a dele (https) ou fica só com o nome. */
export function logoEmailDaEmpresa(e: Readonly<EmpresaConfig>): { logoUrl?: string; semLogo?: boolean } {
  if (ehEcosun(e)) return {};
  const caminho = (e.logoStoragePath ?? '').trim();
  return /^https:\/\//i.test(caminho) ? { logoUrl: caminho } : { semLogo: true };
}

export function montarEmailRelatorio(
  m: { nome: string; mesExtenso: string; link: string },
  e: Readonly<EmpresaConfig>,
): { assunto: string; html: string } {
  const assunto = `${m.nome}, o relatório de ${m.mesExtenso} da sua usina solar`;
  const conteudoHtml =
    `<p>Olá, ${escapeHtml(m.nome)}!</p>` +
    `<p>O relatório de <strong>${escapeHtml(m.mesExtenso)}</strong> da sua usina solar está pronto: ` +
    'quanto ela gerou, quanto você economizou e como estão os seus créditos.</p>' +
    '<p>É só tocar no botão abaixo para abrir. Guarde este e-mail — o link continua valendo.</p>';
  const html = montarMolduraEmail({
    conteudoHtml,
    linkDescadastro: '',
    empresa: e.nomeFantasia,
    siteUrl: e.siteUrl,
    ...logoEmailDaEmpresa(e),
    kicker: 'Relatório mensal da usina',
    titulo: `Sua usina em ${m.mesExtenso}`,
    ctaLabel: 'Ver meu relatório',
    ctaUrl: m.link,
    // Relatório do que o cliente contratou: serviço, não newsletter.
    transacional: true,
    notaRodape: 'Este e-mail traz o relatório da usina que você contratou.',
  });
  return { assunto, html };
}

export interface DepsEmailRelatorio {
  /** undefined = e-mail não configurado neste ambiente (sem RESEND_API_KEY). */
  enviarEmail?: (e: { to: string; subject: string; html: string }) => Promise<string>;
  registrarEmailEnviado: (d: {
    leadId: string; companyId: string; providerMessageId: string; para: string; assunto: string; contexto: string;
  }) => Promise<void>;
}

/** Só o link, nenhum anexo (mesmo motivo da pasta: anexo grande vira bounce silencioso). */
export async function enviarRelatorioEmail(
  dest: DestinoEnvio['email'],
  m: { nome: string; mesExtenso: string; link: string },
  alvo: { leadId: string; empresa: Readonly<EmpresaConfig> },
  d: DepsEmailRelatorio,
): Promise<ResultadoCanal | null> {
  if (!d.enviarEmail) return null;
  if (!dest.para) return { ok: false, reason: dest.motivo ?? 'sem_email' };
  const { assunto, html } = montarEmailRelatorio(m, alvo.empresa);
  let mid: string;
  try {
    mid = await d.enviarEmail({ to: dest.para, subject: assunto, html });
  } catch (err) {
    return { ok: false, reason: 'falha_envio', detalhe: (err as Error).message, para: dest.para };
  }
  await d.registrarEmailEnviado({
    leadId: alvo.leadId, companyId: alvo.empresa.companyId, providerMessageId: mid,
    para: dest.para, assunto, contexto: 'relatorio_gd',
  }).catch(() => {});
  return { ok: true, para: dest.para };
}

/** Mesmo padrão do registrarMensagemEvaNaConversa (proposal-followup.ts): a atendente vê o que saiu. */
export async function registrarEnvioNaConversa(
  db: Pick<SupabaseService, 'getOrCreateConversation' | 'updateConversation'>,
  leadId: string,
  companyId: string,
  mesExtenso: string,
  texto: string,
): Promise<void> {
  const conv = await db.getOrCreateConversation(leadId, companyId);
  await db.updateConversation(conv.id, {
    messages: [
      ...conv.messages,
      {
        role: 'assistant' as const,
        content: `📊 Relatório de ${mesExtenso} enviado pela tela de demonstrativos:\n\n${texto}`,
        timestamp: new Date().toISOString(),
      },
    ],
    message_count: conv.message_count + 1,
  });
}

export interface ResumoEnvio {
  algumOk: boolean;
  zapPara: string | null;
  emailPara: string | null;
  envio: Record<string, unknown>;
}

export function resumoEnvio(zap: ResultadoCanal, email: ResultadoCanal | null): ResumoEnvio {
  const canal = (c: ResultadoCanal | null) => (c === null
    ? { configurado: false }
    : { ok: c.ok, motivo: c.reason ?? null, para: c.para ?? null, aviso: c.aviso ?? null, detalhe: c.detalhe ?? null });
  return {
    algumOk: zap.ok || Boolean(email?.ok),
    zapPara: zap.ok ? zap.para ?? null : null,
    emailPara: email?.ok ? email.para ?? null : null,
    envio: { zap: canal(zap), email: canal(email) },
  };
}
