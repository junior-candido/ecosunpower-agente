// O que o webhook da Resend faz com um e-mail de GD (demonstrativo ou
// confirmacao do Gmail) DEPOIS de ja ter respondido 200. Fora do index.ts pra
// ser testado pelo comportamento: trava contra processamento duplo, contexto
// da empresa e nunca lancar.

import type { EmailGd } from './demonstrativo-email.js';
import {
  ingerirDemonstrativo,
  tratarConfirmacaoGmail,
  type DepsIngestao,
  type StatusIngestao,
} from './demonstrativo-ingestao.js';

export interface DepsWebhookGd {
  /** Roda fn no contexto da empresa dona da caixa (comEmpresaDe). */
  rodarNaEmpresa<T>(fn: () => Promise<T>): Promise<T>;
  /** Monta as deps da ingestao — chamado DENTRO do contexto da empresa. */
  montarDeps(): DepsIngestao | null;
  avisar(texto: string, leadId: string | null): Promise<void>;
  /** Texto do e-mail recebido (o codigo do Gmail vem no corpo). */
  buscarCorpo?(emailId: string): Promise<string | null>;
  emProcesso: Set<string>;
  log?(msg: string): void;
}

export type ResultadoWebhookGd = StatusIngestao | 'confirmacao' | 'ja_em_processo' | 'sem_config';

export async function processarEmailGd(deps: DepsWebhookGd, gd: EmailGd): Promise<ResultadoWebhookGd> {
  const chave = gd.emailId ?? '';
  if (chave && deps.emProcesso.has(chave)) return 'ja_em_processo';
  if (chave) deps.emProcesso.add(chave);
  try {
    return await deps.rodarNaEmpresa(async () => {
      if (gd.tipo === 'confirmacao_gmail') {
        await tratarConfirmacaoGmail({ avisar: deps.avisar, buscarCorpo: deps.buscarCorpo }, gd);
        return 'confirmacao' as const;
      }
      const d = deps.montarDeps();
      if (!d) {
        deps.log?.('[gd] demonstrativo recebido mas falta configuracao (RESEND_API_KEY)');
        return 'sem_config' as const;
      }
      const r = await ingerirDemonstrativo(d, gd);
      deps.log?.(`[gd] demonstrativo ${gd.emailId}: ${r.status}${r.motivo ? ` (${r.motivo})` : ''}`);
      return r.status;
    });
  } catch (e) {
    deps.log?.(`[gd] falha inesperada: ${(e as Error)?.message}`);
    return 'erro';
  } finally {
    if (chave) deps.emProcesso.delete(chave);
  }
}
