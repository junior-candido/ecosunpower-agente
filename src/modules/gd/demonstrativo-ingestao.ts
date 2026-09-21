// Orquestra a entrada do demonstrativo de GD: baixa o anexo, le, liga ao
// cliente, cruza com geracao e rateio, grava e avisa o Junior.
//
// Roda dentro do webhook da Resend, que precisa SEMPRE responder 200 (senao a
// Resend retenta em loop) — entao aqui NADA lanca: tudo vira status + aviso.
// As dependencias sao injetadas pra testar sem banco, sem Resend e sem zap.
// Ver docs/superpowers/specs/2026-09-21-demonstrativo-gd-ingestao-design.md.

import { parseDemonstrativo } from './demonstrativo-parser.js';
import { verificarDkimNeoenergia, type DadosAssunto, type ResultadoDkim } from './demonstrativo-email.js';
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
}

export interface DepsIngestao {
  modoTeste: boolean;
  /** Empresa dona da caixa que recebeu (hoje so a EcoSun encaminha). */
  companyId: string;
  jaProcessado(emailId: string): Promise<boolean>;
  listarAnexos(emailId: string): Promise<AnexoMeta[]>;
  baixarAnexo(emailId: string, anexo: AnexoMeta): Promise<Uint8Array>;
  /** Cabecalhos do e-mail recebido (pra conferir o DKIM). null se nao der. */
  buscarCabecalhos(emailId: string): Promise<Record<string, unknown> | null>;
  extrairTexto(bytes: Uint8Array): Promise<string>;
  /** Lead da empresa com essa UC — instalacao tem preferencia sobre o codigo do cliente. */
  buscarLeadPorUc(instalacao: string, codigoCliente: string): Promise<LeadGd | null>;
  /** Ja existe demonstrativo dessa instalacao nesse mes? */
  existeRegistro(instalacao: string, referencia: string): Promise<boolean>;
  /** Beneficiarias do rateio cadastradas para o lead gerador. */
  buscarRateio(leadGeradorId: string): Promise<RateioCadastrado[]>;
  /** Soma da geracao_diaria do sistema do lead no mes; null se nao ha monitoramento. */
  geracaoDoMes(leadId: string, referencia: string): Promise<number | null>;
  salvar(r: RegistroDemonstrativo): Promise<void>;
  avisar(texto: string, leadId: string | null): Promise<void>;
  log?(msg: string): void;
}

export type StatusIngestao = 'gravado' | 'duplicado' | 'sem_anexo' | 'ilegivel' | 'recusado' | 'erro';

export function escolherPdf<T extends { nome: string | null; tipo: string | null }>(anexos: T[]): T | null {
  const ehPdf = (a: T) => /\.pdf$/i.test(a.nome ?? '') || /pdf/i.test(a.tipo ?? '');
  return (
    anexos.find((a) => ehPdf(a) && /relatorio/i.test(a.nome ?? '')) ??
    anexos.find(ehPdf) ??
    null
  );
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
      dkim = verificarDkimNeoenergia(await deps.buscarCabecalhos(emailId));
    } catch (e) {
      deps.log?.(`[gd] cabecalhos indisponiveis: ${(e as Error).message}`);
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
    if (dkim === 'desconhecido') {
      etapa = 'checar mes ja gravado';
      if (await deps.existeRegistro(d.instalacao, d.referencia)) {
        await avisoSeguro(
          deps,
          `⚠️ Chegou de novo o demonstrativo de ${quem(assunto)}, sem assinatura verificável — mantive o que já estava gravado.`,
          null,
        );
        return { status: 'recusado', motivo: 'mes ja gravado e remetente nao verificado' };
      }
      inconsistencias.push('remetente não verificado (e-mail sem assinatura DKIM conferível)');
    }

    etapa = 'achar cliente';
    const lead = await deps.buscarLeadPorUc(d.instalacao, d.codigoCliente);

    etapa = 'cruzar';
    const rateio = lead ? await deps.buscarRateio(lead.id) : [];
    const geracao = lead ? await deps.geracaoDoMes(lead.id, d.referencia) : null;
    const alertas = cruzarDemonstrativo({ dados: d, geracaoMesKwh: geracao, rateioCadastrado: rateio, inconsistencias });

    etapa = 'gravar';
    await deps.salvar({
      company_id: deps.companyId,
      lead_id: lead?.id ?? null,
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
      inconsistencias,
      alertas,
      geracao_mes_kwh: geracao,
      email_id: emailId,
      texto_bruto: texto,
    });

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

export async function tratarConfirmacaoGmail(
  deps: Pick<DepsIngestao, 'avisar'>,
  c: { codigo: string | null },
): Promise<void> {
  const texto = c.codigo
    ? `📬 Gmail pediu confirmação do encaminhamento para faturas@.\nCódigo: *${c.codigo}*\n(Configurações → Encaminhamento → Verificar)`
    : `📬 Chegou a confirmação de encaminhamento do Gmail, mas sem código no assunto — abrir o e-mail em faturas@ pela Resend.`;
  try {
    await deps.avisar(texto, null);
  } catch {
    /* webhook nunca pode lancar */
  }
}
