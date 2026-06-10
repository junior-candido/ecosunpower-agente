// src/modules/dashboard/proposta-prefill.ts
// Mapeia o dados_input salvo -> nomes dos campos (name=...) do form A4. Os name= batem
// EXATAMENTE com o que o POST /dashboard/propostas/novo lê em router.ts.
type V = Record<string, string | number>;
const s = (x: unknown): string | number => (x === null || x === undefined ? '' : (typeof x === 'number' ? x : String(x)));

export function prefillFormFromDadosInput(d: Record<string, any>): V {
  const m = d.modulo ?? {}; const i = d.inversor ?? {}; const e = d.estruturaFixacao ?? {};
  return {
    nomeCliente: s(d.nomeCliente), documentoCliente: s(d.documentoCliente), enderecoCliente: s(d.enderecoCliente),
    telefoneCliente: s(d.telefoneCliente), emailCliente: s(d.emailCliente),
    tipoCliente: s(d.tipoCliente), modalidade: s(d.modalidade), concessionaria: s(d.concessionaria),
    potenciaKwp: s(d.potenciaKwp), fatorPerda: s(d.fatorPerda), consumoMensalKwh: s(d.consumoMensalKwh),
    tarifaRsKwh: s(d.tarifaRsKwh), geracaoMensalKwh: s(d.geracaoMensalKwh),
    custoDisponibilidadeMensal: s(d.custoDisponibilidadeMensal),
    valorTotalRs: s(d.valorTotalRs), validadeDias: s(d.validadeDias),
    moduloFabricante: s(m.fabricante), moduloModelo: s(m.modelo), moduloPotenciaW: s(m.potenciaW), moduloQuantidade: s(m.quantidade),
    inversorFabricante: s(i.fabricante), inversorModelo: s(i.modelo), inversorPotenciaW: s(i.potenciaW), inversorQuantidade: s(i.quantidade),
    estruturaTipo: s(e.tipo), estruturaMaterial: s(e.material),
  };
}
