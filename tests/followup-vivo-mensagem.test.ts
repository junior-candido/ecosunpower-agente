import { describe, it, expect, vi } from 'vitest';
import { montarFatos, montarPromptEtapa, gerarMensagemEtapa } from '../src/modules/vendas/followup-vivo-mensagem.js';

const proposta = {
  cliente_nome: 'Joel Lima Peres', slug: 'joel-lima-peres', created_at: '2026-08-18T12:00:00Z',
  dados_input: { economiaMensal: 743, valorTotal: 19200, potenciaKwp: 8.58, parcela18x: 1195.4, cidade: 'Brasília' },
};
const ctx = { linkProposta: 'https://ecosunpower.eng.br/p/joel-lima-peres', validadeKitDias: 15, agoraMs: Date.parse('2026-08-21T15:00:00Z') };

describe('montarFatos', () => {
  it('extrai economia, total, kWp, parcela e validade restante', () => {
    const f = montarFatos(proposta, ctx);
    expect(f.primeiroNome).toBe('Joel');
    expect(f.economiaMensal).toBe(743);
    expect(f.valorTotal).toBe(19200);
    expect(f.parcela18x).toBe(1195.4);
    expect(f.diasRestantesValidade).toBe(12); // 15 - 3 dias desde created_at
    expect(f.link).toBe(ctx.linkProposta);
  });
  it('sem economia → argumento economia vira toque_leve', () => {
    const f = montarFatos({ ...proposta, dados_input: {} }, ctx);
    expect(montarPromptEtapa('economia', f, null).argumentoEfetivo).toBe('toque_leve');
  });
});

describe('montarPromptEtapa', () => {
  it('financiamento cita a parcela exata e proíbe desconto', () => {
    const f = montarFatos(proposta, ctx);
    const p = montarPromptEtapa('financiamento', f, null);
    expect(p.prompt).toContain('R$ 1.195,40');
    expect(p.prompt).toMatch(/nunca ofere[çc]a desconto/i);
    expect(p.prompt).toMatch(/n[ãa]o invente n[úu]meros/i);
  });
  it('prova_social inclui o caso quando houver', () => {
    const f = montarFatos(proposta, ctx);
    const p = montarPromptEtapa('prova_social', f, { titulo: 'Residencial Lago Sul', cidade: 'Brasília', kwp: 9.2, fotoUrl: 'https://x/y.jpg' });
    expect(p.prompt).toContain('Residencial Lago Sul');
    expect(p.fotoUrl).toBe('https://x/y.jpg');
  });
});

describe('gerarMensagemEtapa', () => {
  it('usa a IA injetada e devolve o texto limpo', async () => {
    const ia = vi.fn().mockResolvedValue('  Oi Joel! Vi que a proposta ficou em R$ 1.195,40/mês em 18x.  ');
    const f = montarFatos(proposta, ctx);
    const out = await gerarMensagemEtapa('financiamento', f, null, ia);
    expect(ia).toHaveBeenCalledOnce();
    expect(out.texto).toBe('Oi Joel! Vi que a proposta ficou em R$ 1.195,40/mês em 18x.');
    expect(out.argumentoEfetivo).toBe('financiamento');
  });
  it('IA falha → fallback determinístico com o link', async () => {
    const ia = vi.fn().mockRejectedValue(new Error('boom'));
    const f = montarFatos(proposta, ctx);
    const out = await gerarMensagemEtapa('toque_leve', f, null, ia);
    expect(out.texto).toContain('Joel');
    expect(out.texto).toContain(ctx.linkProposta);
  });
});
