// src/modules/closing/fechar-legado.ts
//
// 🚦 A trava do /fechar ANTIGO (conversa com a Eva no zap). Ele monta os dados
// conversando e gerava contrato/procuração direto — sem passar pela mesma trava
// da central de contratos. Aqui: renderiza, valida (validar-documento.ts) e só
// devolve o HTML quando PODE sair. Função pura; o index.ts só obedece.
//
// E o LEAD: o fechamento tem que ficar ligado ao lead do CLIENTE — guardado na
// sessão quando o /fechar começa por um lead. Antes ele usava o lead do próprio
// telefone do admin, e o "Aprovar" transformava esse registro em "o contrato que
// vale" do admin (poluindo contratoVigente). Sem lead na sessão → null.
import type { ClosingState, DadosFechamento } from './types.js';
import type { ClosingStateOrCancelled } from './closing-assistant.js';
import { renderContrato } from './templates/contrato.html.js';
import { renderProcuracao } from './templates/procuracao.html.js';
import { validarDocumento } from './validar-documento.js';

export interface DocsFecharPreparados {
  ok: boolean;
  /** "Contrato: RG do titular", "Procuração: …" — vazio = pode sair. */
  problemas: string[];
  contratoHtml?: string;
  procuracaoHtml?: string;
}

export function prepararDocsFechar(dados: DadosFechamento): DocsFecharPreparados {
  const pedidos = dados.docs_pedidos ?? ['contrato', 'procuracao'];
  const problemas: string[] = [];
  const out: DocsFecharPreparados = { ok: false, problemas };

  if (pedidos.includes('contrato')) {
    const html = renderContrato(dados);
    const r = validarDocumento({ tipo: 'fv', dados, html });
    problemas.push(...r.problemas.map((p) => `Contrato: ${p}`));
    out.contratoHtml = html;
  }
  if (pedidos.includes('procuracao')) {
    const html = renderProcuracao(dados);
    const r = validarDocumento({ tipo: 'procuracao', dados, html });
    problemas.push(...r.problemas.map((p) => `Procuração: ${p}`));
    out.procuracaoHtml = html;
  }
  out.ok = problemas.length === 0;
  if (!out.ok) {
    // bloqueado não carrega HTML nenhum — não tem como "escapar" um PDF daqui
    delete out.contratoHtml;
    delete out.procuracaoHtml;
  }
  return out;
}

/** O lead do CLIENTE guardado na sessão do /fechar. Sem ele → null (nunca o do admin). */
export function leadIdDaSessao(state: ClosingState | null | undefined): string | null {
  const id = (state as { lead_id?: unknown } | null | undefined)?.lead_id;
  return typeof id === 'string' && id.trim() ? id : null;
}

/** A conversa troca de etapa o tempo todo; o lead do cliente vai junto. */
export function manterLeadDaSessao(
  novo: ClosingStateOrCancelled,
  antigo: ClosingState | null | undefined,
): ClosingStateOrCancelled {
  if (novo.stage === 'cancelled') return novo;
  const lead = leadIdDaSessao(antigo);
  return lead ? { ...novo, lead_id: lead } : novo;
}
