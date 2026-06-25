// Copiloto de IA conversacional do lead: system prompt com contexto + chamada.
import { describe, it, expect, vi } from 'vitest';
import { montarSystemPromptCopiloto, responderCopiloto, carregarConhecimentoVendas } from '../src/modules/ia-copiloto.js';

describe('montarSystemPromptCopiloto', () => {
  it('coloca o papel de copiloto de vendas e os dados do lead', () => {
    const s = montarSystemPromptCopiloto({
      nome: 'Maria', etapa: 'negociacao', consumoMensalKwh: 800,
      economiaMensalRs: 1200, potenciaKwp: 6, paybackAnos: 5, cidade: 'Brasília',
    });
    expect(s).toMatch(/copiloto de vendas/i);
    expect(s).toContain('Maria');
    expect(s).toContain('Brasília');
    expect(s).toContain('800 kWh');
    expect(s).toContain('R$ 1.200');
    expect(s).toContain('6 kWp');
    expect(s).toContain('5 anos');
  });

  it('lead sem dados: avisa que não há dimensionamento (não inventa)', () => {
    const s = montarSystemPromptCopiloto({ nome: 'João' });
    expect(s).toContain('João');
    expect(s).toMatch(/não há dados/i);
  });

  it('injeta a base de conhecimento quando fornecida (vender do jeito Ecosunpower)', () => {
    const s = montarSystemPromptCopiloto({ nome: 'Maria' }, 'REGRAS DE VENDA: nunca chame o Junior de engenheiro.');
    expect(s).toContain('REGRAS DE VENDA: nunca chame o Junior de engenheiro.');
    expect(s).toContain('Maria'); // o contexto do lead continua junto
  });
});

describe('carregarConhecimentoVendas', () => {
  it('carrega o arquivo conhecimento/vendas-ia.md (tem a identidade da empresa)', () => {
    const c = carregarConhecimentoVendas();
    expect(c).toContain('Ecosunpower');
    expect(c).toMatch(/Respons[áa]vel T[ée]cnico/); // a correção do título entrou
  });
});

describe('responderCopiloto', () => {
  it('manda system + histórico + a pergunta nova, e devolve o texto da IA', async () => {
    const create = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'Resposta da IA' }] });
    const anthropic = { messages: { create } } as any;

    const texto = await responderCopiloto(anthropic, {
      contextoLead: { nome: 'Maria', economiaMensalRs: 1200 },
      historico: [
        { role: 'user', conteudo: 'explique a economia' },
        { role: 'assistant', conteudo: 'A economia é...' },
      ],
      pergunta: 'agora deixa mais curto',
    });

    expect(texto).toBe('Resposta da IA');
    const arg = create.mock.calls[0][0];
    expect(arg.system).toMatch(/copiloto de vendas/i);
    // histórico (2) + a pergunta nova (1) = 3 mensagens, a última é a pergunta
    expect(arg.messages).toHaveLength(3);
    expect(arg.messages[2]).toEqual({ role: 'user', content: 'agora deixa mais curto' });
  });
});
