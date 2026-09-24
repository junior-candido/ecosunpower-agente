// Orquestra a entrada do demonstrativo de GD: baixa o anexo, le, liga ao
// cliente, cruza com geracao e rateio, grava e avisa o Junior.
//
// Roda dentro do webhook da Resend, que precisa SEMPRE responder 200 (senao a
// Resend retenta em loop) — entao aqui NADA lanca: tudo vira status + aviso.
// As dependencias sao injetadas pra testar sem banco, sem Resend e sem zap.
// Ver docs/superpowers/specs/2026-09-21-demonstrativo-gd-ingestao-design.md.

import { parseDemonstrativo, type DemonstrativoGd } from './demonstrativo-parser.js';
import type { DadosAssunto, ResultadoDkim } from './demonstrativo-email.js';
import {
  cruzarDemonstrativo,
  montarResumoWhats,
  mesCurto,
  type RateioCadastrado,
} from './demonstrativo-cruzamento.js';

/** Metadado do anexo (antes de baixar — assim so o PDF e baixado). */
export interface AnexoMeta {
  id: string;
  nome: string | null;
  tipo: string | null;
}

export interface LeadGd {
  id: string;
  nome: string | null;
  companyId: string | null;
}

export type OrigemDemonstrativo = 'email' | 'pdf_manual' | 'digitado';

export interface RegistroDemonstrativo {
  company_id: string;
  lead_id: string | null;
  cliente_nome: string;
  codigo_cliente: string;
  instalacao: string;
  referencia: string;
  medidor: string | null;
  injetado_kwh: number | null;
  saldo_mes_anterior_kwh: number | null;
  injetado_acumulado_kwh: number | null;
  consumo_kwh: number | null;
  credito_utilizado_kwh: number | null;
  credito_restante_kwh: number | null;
  credito_expira: string | null;
  total_injetado_kwh: number | null;
  total_compensado_kwh: number | null;
  saldo_acumulado_kwh: number | null;
  proximo_expirar_kwh: number | null;
  ciclo_expirar: string | null;
  creditos_expirados_kwh: number | null;
  historico: unknown[];
  unidades: unknown[];
  inconsistencias: string[];
  alertas: unknown[];
  geracao_mes_kwh: number | null;
  email_id: string | null;
  texto_bruto: string;
  origem_verificada: boolean;
  origem: OrigemDemonstrativo;
  assinatura: string;
  conferido_por: string | null;
  conferido_em: string | null;
}

export interface DepsIngestao {
  modoTeste: boolean;
  /** Empresa dona da caixa que recebeu (hoje so a EcoSun encaminha). */
  companyId: string;
  jaProcessado(emailId: string): Promise<boolean>;
  listarAnexos(emailId: string): Promise<AnexoMeta[]>;
  baixarAnexo(emailId: string, anexo: AnexoMeta): Promise<Uint8Array>;
  /** Confere o DKIM no e-mail BRUTO (mailauth + DNS). */
  verificarOrigem(emailId: string): Promise<ResultadoDkim>;
  extrairTexto(bytes: Uint8Array): Promise<string>;
  /** Lead da empresa com essa UC — instalacao tem preferencia sobre o codigo do cliente. */
  buscarLeadPorUc(instalacao: string, codigoCliente: string): Promise<LeadGd | null>;
  /** Demonstrativo ja gravado dessa instalacao nesse mes (e se a origem foi verificada). */
  registroExistente(instalacao: string, referencia: string): Promise<{ verificado: boolean } | null>;
  /** Assinatura dos números já gravados desse mês (null = nada gravado). Opcional. */
  assinaturaGravada?(instalacao: string, referencia: string): Promise<string | null>;
  /** Beneficiarias do rateio cadastradas para o lead gerador. */
  buscarRateio(leadGeradorId: string): Promise<RateioCadastrado[]>;
  /** Soma da geracao_diaria do sistema do lead no mes; null se nao ha monitoramento. */
  geracaoDoMes(leadId: string, referencia: string): Promise<number | null>;
  salvar(r: RegistroDemonstrativo): Promise<void>;
  avisar(texto: string, leadId: string | null): Promise<void>;
  log?(msg: string): void;
}

export type StatusIngestao = 'gravado' | 'repetido' | 'duplicado' | 'sem_anexo' | 'ilegivel' | 'recusado' | 'erro';

export function escolherPdf<T extends { nome: string | null; tipo: string | null }>(anexos: T[]): T | null {
  const ehPdf = (a: T) => /\.pdf$/i.test(a.nome ?? '') || /pdf/i.test(a.tipo ?? '');
  return (
    anexos.find((a) => ehPdf(a) && /relatorio/i.test(a.nome ?? '')) ??
    anexos.find(ehPdf) ??
    null
  );
}

/** Resumo dos números que importam. Mesmo mês com a mesma assinatura = nada mudou. */
export function assinaturaDemonstrativo(d: DemonstrativoGd): string {
  return JSON.stringify([
    d.instalacao, d.referencia, d.injetadoKwh, d.consumoKwh, d.creditoUtilizadoKwh, d.creditoRestanteKwh,
    d.saldoAcumuladoKwh, d.proximoExpirarKwh, d.cicloExpirar, d.creditosExpiradosKwh,
    d.unidades.map((u) => [u.codigoCliente, u.percentual, u.saldo]),
  ]);
}

export interface ExtrasRegistro {
  companyId: string;
  leadId: string | null;
  inconsistencias: string[];
  alertas: unknown[];
  geracaoKwh: number | null;
  emailId: string | null;
  textoBruto: string;
  verificada: boolean;
  origem: OrigemDemonstrativo;
  conferidoPor: string | null;
}

/** Uma função só monta a linha gravada — e-mail, PDF enviado e digitado. */
export function montarRegistro(d: DemonstrativoGd, x: ExtrasRegistro): RegistroDemonstrativo {
  return {
    company_id: x.companyId,
    lead_id: x.leadId,
    cliente_nome: d.clienteNome,
    codigo_cliente: d.codigoCliente,
    instalacao: d.instalacao,
    referencia: d.referencia,
    medidor: d.medidor,
    injetado_kwh: d.injetadoKwh,
    saldo_mes_anterior_kwh: d.saldoMesAnteriorKwh,
    injetado_acumulado_kwh: d.injetadoAcumuladoKwh,
    consumo_kwh: d.consumoKwh,
    credito_utilizado_kwh: d.creditoUtilizadoKwh,
    credito_restante_kwh: d.creditoRestanteKwh,
    credito_expira: d.creditoExpira,
    total_injetado_kwh: d.totalInjetadoKwh,
    total_compensado_kwh: d.totalCompensadoKwh,
    saldo_acumulado_kwh: d.saldoAcumuladoKwh,
    proximo_expirar_kwh: d.proximoExpirarKwh,
    ciclo_expirar: d.cicloExpirar,
    creditos_expirados_kwh: d.creditosExpiradosKwh,
    historico: d.historico,
    unidades: d.unidades,
    inconsistencias: x.inconsistencias,
    alertas: x.alertas,
    geracao_mes_kwh: x.geracaoKwh,
    email_id: x.emailId,
    texto_bruto: x.textoBruto,
    origem_verificada: x.verificada,
    origem: x.origem,
    assinatura: assinaturaDemonstrativo(d),
    conferido_por: x.conferidoPor,
    conferido_em: x.conferidoPor ? new Date().toISOString() : null,
  };
}

async function avisoSeguro(deps: DepsIngestao, texto: string, leadId: string | null): Promise<void> {
  try {
    await deps.avisar(texto, leadId);
  } catch (e) {
    deps.log?.(`[gd] aviso falhou: ${(e as Error).message}`);
  }
}

function quem(assunto: DadosAssunto | null): string {
  if (!assunto) return 'um cliente (assunto sem identificação)';
  return `${assunto.nome} (instalação ${assunto.instalacao}, ${mesCurto(assunto.referencia)})`;
}

export async function ingerirDemonstrativo(
  deps: DepsIngestao,
  email: { emailId: string | null; assunto: DadosAssunto | null },
): Promise<{ status: StatusIngestao; motivo?: string }> {
  const { emailId, assunto } = email;
  let etapa = 'início';
  try {
    if (!emailId) {
      await avisoSeguro(deps, `📄 Chegou um demonstrativo de GD sem identificação do e-mail — não deu pra baixar o PDF.`, null);
      return { status: 'erro', motivo: 'sem email_id' };
    }

    etapa = 'checar duplicado';
    if (await deps.jaProcessado(emailId)) return { status: 'duplicado' };

    etapa = 'conferir remetente';
    let dkim: ResultadoDkim = 'desconhecido';
    try {
      dkim = await deps.verificarOrigem(emailId);
    } catch (e) {
      deps.log?.(`[gd] nao deu pra conferir o DKIM: ${(e as Error).message}`);
    }
    if (dkim === 'fail') {
      await avisoSeguro(
        deps,
        `🚫 Recusei um "demonstrativo" de ${quem(assunto)}: a assinatura do e-mail NÃO confere com a Neoenergia. Pode ser golpe — nada foi gravado.`,
        null,
      );
      return { status: 'recusado', motivo: 'dkim nao confere' };
    }

    etapa = 'baixar anexo';
    const meta = escolherPdf(await deps.listarAnexos(emailId));
    if (!meta) {
      await avisoSeguro(deps, `📄 Chegou o demonstrativo de ${quem(assunto)}, mas não veio o PDF anexo.`, null);
      return { status: 'sem_anexo' };
    }

    etapa = 'ler PDF';
    const texto = await deps.extrairTexto(await deps.baixarAnexo(emailId, meta));
    const r = parseDemonstrativo(texto);
    if (!r.ok) {
      await avisoSeguro(
        deps,
        `📄 Não consegui ler o demonstrativo de ${quem(assunto)}: ${r.motivo}. O layout pode ter mudado — me mande o PDF.`,
        null,
      );
      return { status: 'ilegivel', motivo: r.motivo };
    }
    const d = r.dados;
    if (assunto && assunto.instalacao !== d.instalacao) {
      await avisoSeguro(
        deps,
        `🚫 Recusei o demonstrativo: o assunto do e-mail é da instalação ${assunto.instalacao}, mas o PDF é da ${d.instalacao}. Nada foi gravado.`,
        null,
      );
      return { status: 'recusado', motivo: 'assunto e PDF de instalacoes diferentes' };
    }
    const inconsistencias = [...r.inconsistencias];
    if (dkim !== 'pass') {
      // Sem prova de origem: nunca passa por cima de um mes que JA foi
      // confirmado como vindo da Neoenergia. (Mes sem prova pode ser trocado
      // por outro sem prova — os dois chegam como aviso pro Junior.)
      etapa = 'checar mes ja gravado';
      const existente = await deps.registroExistente(d.instalacao, d.referencia);
      if (existente?.verificado) {
        await avisoSeguro(
          deps,
          `⚠️ Chegou outro demonstrativo de ${quem(assunto)} sem assinatura verificável — mantive o que já estava gravado (esse veio confirmado da Neoenergia).`,
          null,
        );
        return { status: 'recusado', motivo: 'mes ja gravado com origem verificada' };
      }
      inconsistencias.push('remetente não verificado (sem assinatura DKIM da Neoenergia que confira)');
    }

    etapa = 'checar repetido';
    if (deps.assinaturaGravada && (await deps.assinaturaGravada(d.instalacao, d.referencia)) === assinaturaDemonstrativo(d)) {
      deps.log?.(`[gd] ${d.instalacao} ${d.referencia}: mesmo conteudo ja gravado — sem aviso novo`);
      return { status: 'repetido' };
    }

    etapa = 'achar cliente';
    const lead = await deps.buscarLeadPorUc(d.instalacao, d.codigoCliente);

    etapa = 'cruzar';
    const rateio = lead ? await deps.buscarRateio(lead.id) : [];
    const geracao = lead ? await deps.geracaoDoMes(lead.id, d.referencia) : null;
    const alertas = cruzarDemonstrativo({ dados: d, geracaoMesKwh: geracao, rateioCadastrado: rateio, inconsistencias });

    etapa = 'gravar';
    await deps.salvar(montarRegistro(d, {
      companyId: deps.companyId,
      leadId: lead?.id ?? null,
      inconsistencias,
      alertas,
      geracaoKwh: geracao,
      emailId,
      textoBruto: texto,
      verificada: dkim === 'pass',
      origem: 'email',
      conferidoPor: null,
    }));

    let resumo = montarResumoWhats({ dados: d, alertas, nomeCliente: lead?.nome ?? null, modoTeste: deps.modoTeste });
    if (!lead) {
      resumo += `\n⚠️ Não achei o cliente: nenhum lead com UC ${d.codigoCliente} ou ${d.instalacao}. Cadastre a UC na ficha pra ligar.`;
    }
    await avisoSeguro(deps, resumo, lead?.id ?? null);
    return { status: 'gravado' };
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    deps.log?.(`[gd] falha em "${etapa}": ${msg}`);
    await avisoSeguro(deps, `📄 Falha ao processar o demonstrativo de ${quem(assunto)} (etapa: ${etapa}): ${msg}`, null);
    return { status: 'erro', motivo: `${etapa}: ${msg}` };
  }
}

/**
 * O Gmail em portugues NAO poe o codigo no assunto — vem so no corpo
 * ("Codigo de confirmacao: 123456789"), junto com um link que confirma direto.
 * Visto no 1o teste real (22/09/2026). No Google Workspace o e-mail vem SEM
 * codigo nenhum, so o link — e em mail.google.com (com ou sem /u/N/), nao em
 * mail-settings.google.com. O host tem que terminar ali (barra logo depois),
 * pra "mail.google.com.golpe.io" nao passar.
 */
const RE_LINK_CONFIRMACAO = /https:\/\/(?:mail-settings|mail)\.google\.com\/mail\/(?:u\/\d+\/)?vf-[^\s"'<>)]+/i;

export function extrairConfirmacaoGmail(corpo: string | null | undefined): { codigo: string | null; link: string | null } {
  const t = corpo ?? '';
  const cod =
    /c[óo]digo\s+de\s+confirma[çc][ãa]o\s*:?\s*(\d{6,12})/i.exec(t) ??
    /confirmation\s+code\s*:?\s*(\d{6,12})/i.exec(t);
  const link = RE_LINK_CONFIRMACAO.exec(t);
  return { codigo: cod ? cod[1] : null, link: link ? link[0].replace(/&amp;/g, '&') : null };
}

export async function tratarConfirmacaoGmail(
  deps: Pick<DepsIngestao, 'avisar'> & { buscarCorpo?: (emailId: string) => Promise<string | null> },
  c: { codigo: string | null; emailId?: string | null },
): Promise<void> {
  let codigo = c.codigo;
  let link: string | null = null;
  if (deps.buscarCorpo && c.emailId) {
    try {
      const x = extrairConfirmacaoGmail(await deps.buscarCorpo(c.emailId));
      codigo = codigo ?? x.codigo;
      link = x.link;
    } catch {
      /* segue com o que tiver */
    }
  }
  const texto = codigo || link
    ? `📬 Gmail pediu confirmação do encaminhamento para faturas@.` +
      (codigo ? `
Código: *${codigo}*` : '') +
      (link ? `
Ou confirme direto: ${link}` : '') +
      `
(Gmail → Configurações → Encaminhamento → Verificar)`
    : `📬 Chegou a confirmação de encaminhamento do Gmail, mas não achei o código — abrir o e-mail em faturas@ pela Resend.`;
  try {
    await deps.avisar(texto, null);
  } catch {
    /* webhook nunca pode lancar */
  }
}
