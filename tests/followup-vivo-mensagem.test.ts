import { describe, it, expect, vi } from 'vitest';
import { montarFatos, montarPromptEtapa, gerarMensagemEtapa, brl } from '../src/modules/vendas/followup-vivo-mensagem.js';
import { parcelaCartaoSolar } from '../src/modules/proposal/cartao-solar.js';

// Formato REAL de propostas_publicas.dados_input (camelCase) — ver
// src/modules/proposal/dados-input.ts e src/modules/closing/closing-data-fetcher.ts:56-77.
// Não existem valorTotal, economiaMensal (antes da persistência) nem parcela18x prontos —
// valorTotal PREFERE investimento.total (valor COM serviços extras, o que o cliente vê
// na proposta — proposal-assistant.ts:2042-2063), caindo pra valorTotalRs (só o kit)
// quando não há investimento. A parcela é calculada com a MESMA tabela que a proposta
// renderiza (cartao-solar.ts) e arredondada como no PDF (fmtRs(Math.round(parcela)),
// proposal-assistant.ts ~2279).
const proposta = {
  cliente_nome: 'Joel Lima Peres', slug: 'joel-lima-peres', created_at: '2026-08-18T12:00:00Z',
  dados_input: {
    potenciaKwp: 8.58,
    valorTotalRs: 19200,
    investimento: { total: 19200 },
    enderecoCliente: 'Brasília-DF',
    economiaMensal: 743, // persistido pela proposal-assistant (calc.economiaMensal)
  },
};
const ctx = { linkProposta: 'https://ecosunpower.eng.br/p/joel-lima-peres', validadeKitDias: 15, agoraMs: Date.parse('2026-08-21T15:00:00Z') };
const parcelaEsperada = Math.round(parcelaCartaoSolar(19200, 18, 'solfacil')!.parcela);

describe('montarFatos', () => {
  it('extrai economia, total (de investimento.total), kWp, parcela arredondada e validade restante', () => {
    const f = montarFatos(proposta, ctx);
    expect(f.primeiroNome).toBe('Joel');
    expect(f.economiaMensal).toBe(743);
    expect(f.valorTotal).toBe(19200);
    expect(f.parcela18x).toBe(parcelaEsperada);
    expect(f.diasRestantesValidade).toBe(12); // 15 - 3 dias desde created_at
    expect(f.link).toBe(ctx.linkProposta);
    expect(f.cidade).toBe('Brasília-DF');
  });
  it('investimento.total (valor COM serviços) prevalece sobre valorTotalRs (só o kit) quando os dois existem', () => {
    const f = montarFatos({ ...proposta, dados_input: { ...proposta.dados_input, valorTotalRs: 19200, investimento: { total: 23700 } } }, ctx);
    expect(f.valorTotal).toBe(23700);
    expect(f.parcela18x).toBe(Math.round(parcelaCartaoSolar(23700, 18, 'solfacil')!.parcela));
  });
  it('sem investimento.total, valorTotalRs como STRING "19200" ainda vira 19200 (coerção numérica)', () => {
    const { investimento, ...semInvestimento } = proposta.dados_input;
    const f = montarFatos({ ...proposta, dados_input: { ...semInvestimento, valorTotalRs: '19200' as unknown as number } }, ctx);
    expect(f.valorTotal).toBe(19200);
  });
  it('sem valorTotalRs cai pra investimento.total', () => {
    const { valorTotalRs, ...semValorTotalRs } = proposta.dados_input;
    const f = montarFatos({ ...proposta, dados_input: semValorTotalRs }, ctx);
    expect(f.valorTotal).toBe(19200);
  });
  it('sem economia/total/kwp → tudo null, sem quebrar', () => {
    const f = montarFatos({ ...proposta, dados_input: {} }, ctx);
    expect(f.economiaMensal).toBeNull();
    expect(f.valorTotal).toBeNull();
    expect(f.parcela18x).toBeNull();
    expect(f.potenciaKwp).toBeNull();
    expect(f.cidade).toBeNull();
  });
  it('sem economia → argumento economia vira toque_leve', () => {
    const f = montarFatos({ ...proposta, dados_input: {} }, ctx);
    expect(montarPromptEtapa('economia', f, null).argumentoEfetivo).toBe('toque_leve');
  });
});

describe('montarPromptEtapa', () => {
  it('financiamento cita a parcela exata (mesma tabela da proposta) e proíbe desconto', () => {
    const f = montarFatos(proposta, ctx);
    const p = montarPromptEtapa('financiamento', f, null);
    expect(p.prompt).toContain(brl(parcelaEsperada));
    expect(p.prompt).toMatch(/nunca ofere[çc]a desconto/i);
    expect(p.prompt).toMatch(/n[ãa]o invente n[úu]meros/i);
  });
  it('prova_social inclui o caso quando houver', () => {
    const f = montarFatos(proposta, ctx);
    const p = montarPromptEtapa('prova_social', f, { titulo: 'Residencial Lago Sul', cidade: 'Brasília', kwp: 9.2, fotoUrl: 'https://x/y.jpg' });
    expect(p.prompt).toContain('Residencial Lago Sul');
    expect(p.fotoUrl).toBe('https://x/y.jpg');
  });
  it('validade com diasRestantesValidade === 0 vira toque_leve', () => {
    const f = montarFatos(proposta, { ...ctx, validadeKitDias: 0 });
    expect(f.diasRestantesValidade).toBe(0);
    expect(montarPromptEtapa('validade', f, null).argumentoEfetivo).toBe('toque_leve');
  });
});

describe('num() — coerção numérica (via montarFatos)', () => {
  it('rejeita valores <= 0', () => {
    const f = montarFatos({ ...proposta, dados_input: { ...proposta.dados_input, economiaMensal: 0 } }, ctx);
    expect(f.economiaMensal).toBeNull();
  });
  it('rejeita string não numérica', () => {
    const f = montarFatos({ ...proposta, dados_input: { ...proposta.dados_input, economiaMensal: 'abc' as unknown as number } }, ctx);
    expect(f.economiaMensal).toBeNull();
  });
});

describe('gerarMensagemEtapa', () => {
  it('usa a IA injetada e devolve o texto limpo', async () => {
    const ia = vi.fn().mockResolvedValue(`  Oi Joel! Vi que a proposta ficou em ${brl(parcelaEsperada)}/mês em 18x.  `);
    const f = montarFatos(proposta, ctx);
    const out = await gerarMensagemEtapa('financiamento', f, null, ia);
    expect(ia).toHaveBeenCalledOnce();
    expect(out.texto).toBe(`Oi Joel! Vi que a proposta ficou em ${brl(parcelaEsperada)}/mês em 18x.`);
    expect(out.argumentoEfetivo).toBe('financiamento');
  });
  it('IA falha → fallback determinístico com o link', async () => {
    const ia = vi.fn().mockRejectedValue(new Error('boom'));
    const f = montarFatos(proposta, ctx);
    const out = await gerarMensagemEtapa('toque_leve', f, null, ia);
    expect(out.texto).toContain('Joel');
    expect(out.texto).toContain(ctx.linkProposta);
  });
  it('IA devolve texto curto demais ("ok", <10 chars) → fallback determinístico', async () => {
    const ia = vi.fn().mockResolvedValue('ok');
    const f = montarFatos(proposta, ctx);
    const out = await gerarMensagemEtapa('toque_leve', f, null, ia);
    expect(out.texto).toContain('Joel');
    expect(out.texto).toContain(ctx.linkProposta);
  });
});
