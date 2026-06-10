// src/modules/proposal/rascunho.ts
// Resume o rascunho de proposta em andamento a partir da sessão (state) + histórico.
// "Em andamento" = tem histórico de conversa E ainda não gerou (geracaoConcluida != true).
export interface ResumoRascunho {
  emAndamento: boolean;
  nomeCliente?: string;
  faltando: string[];
}
export function resumirRascunho(
  state: { geracaoConcluida?: boolean; modoEnvio?: string; tipo?: string },
  history: Array<{ role: string; content: string }>,
): ResumoRascunho {
  if (state?.geracaoConcluida) return { emAndamento: false, faltando: [] };
  if (!history || history.length === 0) return { emAndamento: false, faltando: [] };
  let nomeCliente: string | undefined;
  let faltando: string[] = [];
  for (let k = history.length - 1; k >= 0; k--) {
    if (history[k].role !== 'assistant') continue;
    try {
      const j = JSON.parse((history[k].content.match(/\{[\s\S]*\}/) ?? [history[k].content])[0]);
      if (j?.data?.nomeCliente && !nomeCliente) nomeCliente = String(j.data.nomeCliente);
      if (Array.isArray(j?.missing) && faltando.length === 0) faltando = j.missing.map(String);
      if (nomeCliente && faltando.length) break;
    } catch { /* turno sem JSON, ignora */ }
  }
  return { emAndamento: true, nomeCliente, faltando };
}
