// src/modules/financeiro/fiscal/envio-email.ts
// E-mail da NFS-e pro tomador (Junior, 01/09/2026: "botão de enviar por e-mail" +
// "se eu colocar os dados ele enviar automático"). Vai com os DOIS PDFs (modelo
// GDF/ISS.net e DANFSe nacional) + o XML — o XML é o documento com valor jurídico.
//
// Regras de segurança:
//  - só nota DESTA empresa (carregar() já vem escopado por company_id);
//  - só nota com XML autorizado pelo fisco;
//  - homologação (teste) NUNCA vai sozinha pro cliente: só pra um e-mail digitado
//    na tela e com "[TESTE]" no assunto;
//  - falha do provedor vira resultado + evento (não derruba a emissão).
// Deps injetadas (banco/PDF/Resend) pra testar sem rede.
import { escapeHtml } from '../../email/email-moldura.js';
import type { AnexoEmail } from '../../email/resend-client.js';
import type { NotaLinha } from './notas-repo.js';
import type { DadosNotaPdf } from './nfse-pdf-dados.js';
import type { ModeloPdf } from './nfse-pdf.js';

export interface DepsEnvioEmail {
  /** Nota da empresa (null se não existe ou é de outra empresa) + dados do PDF. */
  carregar: (companyId: string, notaId: string) => Promise<{ nota: NotaLinha; dados: DadosNotaPdf } | null>;
  gerarPdf: (d: DadosNotaPdf, modelo: ModeloPdf) => Promise<{ pdf: Buffer; nomeArquivo: string }>;
  enviar: (e: { to: string; subject: string; html: string; attachments: AnexoEmail[]; replyTo: string | null; nomeEmpresa: string }) => Promise<string>;
  registrarEvento: (notaId: string, tipo: string, detalhe?: unknown) => Promise<void>;
}

export type ResultadoEnvio = { ok: true; para: string; id: string } | { ok: false; motivo: string };

export const emailValido = (s: string | null | undefined): boolean =>
  /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(String(s ?? '').trim());

/** Envio automático só com a flag ligada, em PRODUÇÃO e com e-mail do tomador válido. */
export function deveEnviarAutomatico(flag: boolean, ambiente: string | null | undefined, emailTomador: string | null | undefined): boolean {
  return flag && ambiente === 'producao' && emailValido(emailTomador);
}

/** Mantém o endereço de envio (EMAIL_FROM, domínio verificado na Resend) e troca
 *  o NOME exibido pelo da empresa emitente — cada tenant aparece com o próprio nome. */
export function remetenteComNome(from: string, nome: string): string {
  const f = String(from ?? '').trim();
  if (!f) return '';
  const m = /<([^>]+)>/.exec(f);
  const endereco = (m ? m[1] : f).trim();
  const limpo = String(nome ?? '').replace(/["<>]/g, '').replace(/\s+/g, ' ').trim();
  return limpo ? `"${limpo}" <${endereco}>` : endereco;
}

const brl = (n: number) => 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dataBr = (iso: string) => String(iso ?? '').slice(0, 10).split('-').reverse().join('/');

export function montarEmailNota(d: DadosNotaPdf): { assunto: string; html: string } {
  const empresa = d.prestador.fantasia || d.prestador.nome;
  const assunto = `NFS-e nº ${d.numero ?? ''} — ${empresa}`.replace(/\s+—/, ' —');
  const linha = (rot: string, val: string) =>
    `<tr><td style="padding:6px 0;color:#5b6878;font-size:13px;width:170px;vertical-align:top">${rot}</td><td style="padding:6px 0;color:#1b2430;font-size:14px">${val}</td></tr>`;
  const link = d.urlConsulta
    ? `<p style="margin:18px 0 0;font-size:13px;color:#5b6878">Confira a autenticidade no Portal Nacional da NFS-e:<br><a href="${escapeHtml(d.urlConsulta)}" style="color:#1b5e9e">${escapeHtml(d.urlConsulta)}</a></p>`
    : '';
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:10px;padding:26px 26px 22px">
<tr><td>
<p style="margin:0 0 6px;font-size:13px;color:#5b6878">${escapeHtml(empresa)}</p>
<h1 style="margin:0 0 14px;font-size:20px;color:#1b2430">Nota fiscal de serviço nº ${escapeHtml(d.numero ?? '')}</h1>
<p style="margin:0 0 14px;font-size:14px;color:#2a3644;line-height:1.5">Olá, ${escapeHtml(d.tomador.nome)}. Segue a nota fiscal do serviço prestado, em PDF (dois modelos) e o arquivo XML — guarde o XML: é ele que vale como documento fiscal.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #e3e7ec;border-bottom:1px solid #e3e7ec">
${linha('Número', escapeHtml(d.numero ?? '-'))}
${linha('Competência', escapeHtml(dataBr(d.competencia)))}
${linha('Serviço', escapeHtml(d.servico.descricao))}
${linha('Valor do serviço', escapeHtml(brl(d.valores.vServ)))}
${d.iss.retido ? linha('ISS retido por você', escapeHtml(brl(d.iss.valor))) : ''}
${linha('Valor líquido', `<b>${escapeHtml(brl(d.valores.vLiq))}</b>`)}
${linha('Chave de acesso', `<span style="font-family:monospace;font-size:12.5px;word-break:break-all">${escapeHtml(d.chave ?? '-')}</span>`)}
</table>
${link}
<p style="margin:18px 0 0;font-size:12px;color:#8a95a3">${escapeHtml(d.prestador.nome)} · CNPJ ${escapeHtml(d.prestador.doc)}</p>
</td></tr></table></td></tr></table></body></html>`;
  return { assunto, html };
}

export async function enviarNotaPorEmail(
  deps: DepsEnvioEmail, companyId: string, notaId: string,
  opts: { para?: string | null; automatico?: boolean },
): Promise<ResultadoEnvio> {
  const automatico = Boolean(opts.automatico);
  const c = await deps.carregar(companyId, notaId);
  if (!c) return { ok: false, motivo: 'Nota não encontrada.' };
  const { nota, dados } = c;
  const homologacao = nota.ambienteEmissao === 'homologacao';
  const autorizadaDeVerdade = nota.status === 'autorizada' && !homologacao;
  const testeHomolog = homologacao && Boolean(nota.chaveAcesso);
  if (!nota.xmlNfse || !(autorizadaDeVerdade || testeHomolog)) {
    return { ok: false, motivo: 'Essa nota ainda não foi autorizada pelo fisco — não há PDF/XML pra enviar.' };
  }
  const digitado = String(opts.para ?? '').trim();
  if (testeHomolog && !digitado) {
    return { ok: false, motivo: 'Nota de TESTE (homologação) não é enviada ao cliente. Digite um e-mail seu pra receber o teste.' };
  }
  const para = digitado || String(nota.tomador.email ?? '').trim();
  if (!para) return { ok: false, motivo: 'O tomador não tem e-mail cadastrado — digite o e-mail pra enviar.' };
  if (!emailValido(para)) return { ok: false, motivo: `E-mail inválido: ${para}` };

  try {
    const [gdf, nacional] = [await deps.gerarPdf(dados, 'gdf'), await deps.gerarPdf(dados, 'nacional')];
    const { assunto, html } = montarEmailNota(dados);
    const nomeXml = `NFSe-${String(dados.numero ?? nota.id).replace(/[^\w.-]/g, '_')}.xml`;
    const id = await deps.enviar({
      to: para,
      subject: testeHomolog ? `[TESTE] ${assunto}` : assunto,
      html,
      attachments: [
        { filename: gdf.nomeArquivo, content: gdf.pdf, contentType: 'application/pdf' },
        { filename: nacional.nomeArquivo, content: nacional.pdf, contentType: 'application/pdf' },
        { filename: nomeXml, content: Buffer.from(nota.xmlNfse, 'utf8'), contentType: 'application/xml' },
      ],
      replyTo: emailValido(dados.prestador.email) ? dados.prestador.email : null,
      nomeEmpresa: dados.prestador.fantasia || dados.prestador.nome,
    });
    await deps.registrarEvento(notaId, 'email_enviado', { para, id, automatico });
    return { ok: true, para, id };
  } catch (err) {
    const motivo = (err as Error).message || 'falha no envio';
    await deps.registrarEvento(notaId, 'email_falhou', { para, motivo, automatico }).catch(() => {});
    return { ok: false, motivo: `O e-mail não saiu: ${motivo}` };
  }
}

// ── Fábrica com as deps reais (banco + Puppeteer + Resend) ─────────────────────
import type { SupabaseClient } from '@supabase/supabase-js';
import { getNota, getConfig, listarServicos, registrarEvento as evtRepo } from './notas-repo.js';
import { montarDadosPdf } from './nfse-pdf-dados.js';
import { gerarPdfNota } from './nfse-pdf.js';

/** Dados do PDF de uma nota DA EMPRESA (null se não achou nesta empresa). */
export async function carregarDadosPdf(client: SupabaseClient, companyId: string, notaId: string): Promise<{ nota: NotaLinha; dados: DadosNotaPdf } | null> {
  const nota = await getNota(client, companyId, notaId);
  if (!nota) return null;
  const [config, servicos] = await Promise.all([getConfig(client, companyId), listarServicos(client, companyId).catch(() => [])]);
  const servico = servicos.find((s) => s.id === nota.servicoId) ?? null;
  return { nota, dados: montarDadosPdf({ nota, config, servico }) };
}

export function depsEnvioEmailProducao(client: SupabaseClient, apiKey: string, emailFrom: string): DepsEnvioEmail {
  return {
    carregar: (companyId, notaId) => carregarDadosPdf(client, companyId, notaId),
    gerarPdf: (d, modelo) => gerarPdfNota(d, modelo),
    enviar: async (e) => {
      const { EmailSender } = await import('../../email/resend-client.js');
      // Nome exibido = empresa emitente; resposta vai pro e-mail do prestador que
      // está NA NOTA (certo por empresa) — sem ele, cai no padrão do EmailSender.
      const sender = new EmailSender(apiKey, remetenteComNome(emailFrom, e.nomeEmpresa), e.replyTo ?? undefined);
      return sender.enviar({ to: e.to, subject: e.subject, html: e.html, attachments: e.attachments });
    },
    registrarEvento: (notaId, tipo, detalhe) => evtRepo(client, notaId, tipo, detalhe),
  };
}
