// src/modules/proposal/dados-input.ts
// Monta o jsonb salvo em propostas_publicas.dados_input. Guarda o `data` COMPLETO
// (pra reabrir a proposta sem perder nada) + um bloco `investimento.total` derivado
// que o dashboard lê (queries.extrairValorTotal / clientes-queries). potenciaKwp já
// está top-level no data, então extrairKwp funciona direto.
export function montarDadosInputCompleto(data: Record<string, unknown>, valorComServicos: number): Record<string, unknown> {
  return {
    ...data,
    investimento: { total: Number.isFinite(valorComServicos) ? valorComServicos : Number(data.valorTotalRs) },
  };
}
