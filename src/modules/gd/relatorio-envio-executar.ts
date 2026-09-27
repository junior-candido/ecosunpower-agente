// src/modules/gd/relatorio-envio-executar.ts
// O miolo do POST /dashboard/demonstrativos/:instalacao/enviar (fatia 3),
// sem Express e sem banco: a rota injeta tudo e só traduz a saída em tela.
//
// Ordem (revisão final 27/09/2026):
//  1. já enviado → só com "Enviar de novo" explícito;
//  2. nenhum canal pode mandar → explica, SEM gerar PDF, upload, token ou linha;
//  3. RESERVA o mês (duplo clique/duas abas: só um envio por vez);
//  4. PDF → storage → token na linha. Falhou depois do upload → apaga o PDF;
//  5. manda (dentro da empresa e do canal dela). Estourou → o link morre;
//  6. grava o resultado (nada saiu → enviado_em nulo e o link morre).

import type { EmpresaConfig } from '../empresa-config.js';
import type { ResultadoCanal } from '../relatorios/pasta/resultado-envio.js';
import {
  enviarRelatorioEmail, enviarRelatorioZap, resumoEnvio,
  type CanalZap, type DepsEmailRelatorio, type DepsZapRelatorio, type DestinoEnvio, type ResultadoZapRelatorio,
  type ResumoEnvio,
} from './relatorio-envio.js';
import { linkPublicoRelatorio, nomeArquivoRelatorio, nomeArquivoRelatorioPeriodo, primeiroNome } from './relatorio-envio-textos.js';

export interface EntradaExecutarEnvio {
  instalacao: string;
  /** Mês do relatório; no do período, o mês FINAL (é o que vai em relatorios_gd_gerados.referencia). */
  referencia: string;
  geradoPor: string;
  leadId: string;
  nomeCliente: string | null;
  /** Texto do mês ou do período ("maio a agosto de 2026") — vai no {{2}} do modelo e no e-mail. */
  mesExtenso: string;
  /** Relatório do período: muda o nome do arquivo e o e-mail. `numeros` já traz o período. */
  periodo?: { inicio: string; fim: string };
  numeros: Record<string, unknown>;
  canal: CanalZap;
  empresa: Readonly<EmpresaConfig>;
  destino: DestinoEnvio;
  /** Já saiu um envio desse mês dessa UC. */
  jaEnviado: boolean;
  /** O operador marcou "Enviar de novo" na tela de confirmação. */
  reenviar: boolean;
}

export interface RepoEnvioRelatorio {
  reservarEnvio(p: {
    instalacao: string; referencia: string; geradoPor: string; numeros: Record<string, unknown>; leadId: string;
  }): Promise<string | null>;
  anexarPdfEToken(id: string, p: { token: string; storagePath: string }): Promise<void>;
  cancelarEnvio(id: string, motivo: string): Promise<void>;
  marcarEnvio(id: string, r: ResumoEnvio): Promise<void>;
}

export interface DepsExecutarEnvio {
  basePublica: string;
  gerarPdf: () => Promise<Buffer>;
  guardarPdf: (pdf: Buffer) => Promise<{ ok: boolean; storage_path?: string; error?: string }>;
  apagarPdf: (storagePath: string) => Promise<unknown>;
  gerarToken: () => string;
  repo: RepoEnvioRelatorio;
  /** Roda o envio dentro da empresa e do canal de quem clicou (canal-envio.ts). */
  noCanal: <T>(fn: () => Promise<T>) => Promise<T>;
  /** undefined = WhatsApp não configurado neste ambiente. */
  sendText?: DepsZapRelatorio['sendText'];
  /** WABA da casa — só é repassado quando canal === 'casa'. */
  sendTemplate?: DepsZapRelatorio['sendTemplate'];
  /** Evolution do tenant — só é repassado quando canal === 'evolution'. */
  sendDocument?: DepsZapRelatorio['sendDocument'];
  /** undefined = e-mail não configurado neste ambiente (sem RESEND_API_KEY). */
  enviarEmail?: DepsEmailRelatorio['enviarEmail'];
  registrarEmailEnviado: DepsEmailRelatorio['registrarEmailEnviado'];
  /** O que o cliente recebeu vai pra conversa dele no painel. */
  registrarConversa: (texto: string) => Promise<void>;
}

export type SaidaEnvioRelatorio =
  | { tipo: 'confirmar_reenvio' }
  | { tipo: 'em_andamento' }
  | { tipo: 'resultado'; zap: ResultadoCanal; email: ResultadoCanal | null; linkPublico: string | null };

const SEM_ZAP_NO_AMBIENTE = 'envio de WhatsApp não configurado neste ambiente';

function msgErro(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function executarEnvioRelatorio(
  d: DepsExecutarEnvio,
  e: EntradaExecutarEnvio,
): Promise<SaidaEnvioRelatorio> {
  // 1. Já saiu antes: só com o "Enviar de novo" explícito da tela de confirmação.
  if (e.jaEnviado && !e.reenviar) return { tipo: 'confirmar_reenvio' };

  const emailLigado = Boolean(d.enviarEmail);

  // 2. Nenhum canal possível: explica sem gerar PDF nem link à toa.
  const zapPossivel = Boolean(e.destino.zap.fone && d.sendText);
  if (!zapPossivel && !(emailLigado && e.destino.email.para)) {
    return {
      tipo: 'resultado',
      zap: e.destino.zap.fone
        ? { ok: false, reason: 'falha_envio', detalhe: SEM_ZAP_NO_AMBIENTE }
        : { ok: false, reason: e.destino.zap.motivo ?? 'sem_phone' },
      email: emailLigado ? { ok: false, reason: e.destino.email.motivo ?? 'sem_email' } : null,
      linkPublico: null,
    };
  }

  // 3. Um envio por vez por empresa + UC + mês.
  const id = await d.repo.reservarEnvio({
    instalacao: e.instalacao, referencia: e.referencia, geradoPor: e.geradoPor, numeros: e.numeros, leadId: e.leadId,
  });
  if (!id) return { tipo: 'em_andamento' };

  // Capturados DENTRO do callback do noCanal, um a um, conforme cada canal
  // termina — não só no `return` dele. Se algo estourar DEPOIS que um canal já
  // entregou (o próprio noCanal, por exemplo), o que já saiu não se perde: o
  // catch abaixo confere estas variáveis, não o retorno da promise.
  let zap: ResultadoZapRelatorio | undefined;
  let email: ResultadoCanal | null | undefined;
  let link: string | undefined;
  try {
    // 4. PDF → storage → token na linha.
    const pdf = await d.gerarPdf();
    const up = await d.guardarPdf(pdf);
    if (!up.ok || !up.storage_path) throw new Error(`não consegui guardar o PDF (${up.error ?? 'erro no armazenamento'})`);
    const storagePath = up.storage_path;
    const token = d.gerarToken();
    try {
      await d.repo.anexarPdfEToken(id, { token, storagePath });
    } catch (err) {
      // PDF guardado sem linha que aponte pra ele: apaga (best-effort).
      await Promise.resolve().then(() => d.apagarPdf(storagePath)).catch((errApagar) =>
        console.warn(`[relatorio-gd] PDF órfão não apagado (${storagePath}): ${msgErro(errApagar)}`));
      throw err;
    }
    link = linkPublicoRelatorio(d.basePublica, token);

    const msg = {
      nome: primeiroNome(e.nomeCliente), mesExtenso: e.mesExtenso, token, link, pdf,
      nomeArquivo: e.periodo
        ? nomeArquivoRelatorioPeriodo(e.instalacao, e.periodo.inicio, e.periodo.fim)
        : nomeArquivoRelatorio(e.instalacao, e.referencia),
      periodo: Boolean(e.periodo),
    };

    // 5. Manda — dentro da empresa e do canal de quem clicou.
    const sendText = d.sendText;
    await d.noCanal(async () => {
      zap = sendText
        ? await enviarRelatorioZap(e.destino.zap, msg, {
            canal: e.canal,
            sendText,
            // Modelo (WABA) é só da EcoSun; tenant NUNCA passa pela WABA da casa.
            sendTemplate: e.canal === 'casa' ? d.sendTemplate : undefined,
            sendDocument: e.canal === 'evolution' ? d.sendDocument : undefined,
          })
        : { ok: false, reason: 'falha_envio', detalhe: SEM_ZAP_NO_AMBIENTE };
      // enviarRelatorioEmail já não joga erro pro catch de fora (provedor
      // recusado vira {ok:false} normal) — mas se um dia jogar, o zap acima já
      // está gravado na variável de fora e não se perde.
      email = emailLigado
        ? await enviarRelatorioEmail(e.destino.email, msg, { leadId: e.leadId, empresa: e.empresa }, {
            enviarEmail: d.enviarEmail,
            registrarEmailEnviado: d.registrarEmailEnviado,
          })
        : null;
    });
  } catch (err) {
    if (zap?.ok || email?.ok) {
      // Algo JÁ chegou no cliente antes do estouro (ex.: WhatsApp saiu e o
      // e-mail, ou o próprio canal, quebrou depois) — cancelarEnvio mataria um
      // link que o cliente já tem na mão. Registra o que deu, sem matar nada.
      const zapFinal: ResultadoZapRelatorio = zap ?? { ok: false, reason: 'falha_envio', detalhe: msgErro(err) };
      const emailFinal: ResultadoCanal | null = email !== undefined
        ? email
        : (emailLigado ? { ok: false, reason: 'falha_envio', detalhe: msgErro(err) } : null);
      console.error(`[relatorio-gd] envio ${id} teve erro depois de já ter entregue algo (mantido): ${msgErro(err)}`);
      if (zapFinal.ok && zapFinal.textoEnviado) {
        await d.registrarConversa(zapFinal.textoEnviado)
          .catch((errConv) => console.warn('[relatorio-gd] conversa não registrada:', msgErro(errConv)));
      }
      const resumoParcial = resumoEnvio(zapFinal, emailFinal);
      await d.repo.marcarEnvio(id, resumoParcial).catch((errMarcar) =>
        console.error(`[relatorio-gd] resultado parcial do envio ${id} não gravado: ${msgErro(errMarcar)}`));
      return { tipo: 'resultado', zap: zapFinal, email: emailFinal, linkPublico: resumoParcial.algumOk ? (link ?? null) : null };
    }
    // Nada saiu ainda: o link não pode ficar valendo, e o mês não pode ficar travado.
    await d.repo.cancelarEnvio(id, msgErro(err)).catch((errCancel) =>
      console.error(`[relatorio-gd] envio ${id} não cancelado: ${msgErro(errCancel)}`));
    throw err;
  }

  // 6. Resultado.
  const zapFinal = zap as ResultadoZapRelatorio;
  const emailFinal = (email ?? null) as ResultadoCanal | null;
  if (zapFinal.ok && zapFinal.textoEnviado) {
    await d.registrarConversa(zapFinal.textoEnviado)
      .catch((err) => console.warn('[relatorio-gd] conversa não registrada:', msgErro(err)));
  }
  const resumo = resumoEnvio(zapFinal, emailFinal);
  // O envio JÁ saiu: falha ao gravar o resultado não pode virar "não enviei" na
  // tela (o operador reenviaria). Fica no log; a reserva expira sozinha em 5 min.
  await d.repo.marcarEnvio(id, resumo).catch((err) =>
    console.error(`[relatorio-gd] resultado do envio ${id} não gravado: ${msgErro(err)}`));
  return { tipo: 'resultado', zap: zapFinal, email: emailFinal, linkPublico: resumo.algumOk ? (link as string) : null };
}
