// Motor da conversa (Eva / Clara): custo por empresa + cache mais barato.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const create = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class { messages = { create }; },
}));
vi.mock('fs', async (orig) => ({ ...(await orig() as object), readFileSync: vi.fn().mockReturnValue('prompt fixo') }));
const medirIa = vi.fn();
vi.mock('../src/modules/custos/ia-metering.js', () => ({ medirIa: (a: unknown) => medirIa(a) }));

const USAGE = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 0 };

beforeEach(() => {
  create.mockReset().mockResolvedValue({ content: [{ type: 'text', text: 'oi' }], usage: USAGE, model: 'claude-sonnet-4-6' });
  medirIa.mockReset();
});
afterEach(() => { delete process.env.EVA_CACHE_TTL; });

async function rodar(opcoes?: { conhecimentoEstavel?: string }) {
  const { Brain } = await import('../src/modules/brain.js');
  const brain = new Brain('sk-ant-test');
  await brain.processMessage('Ola', [], 'CORE FIXO\n\nrag', null, 'comercial', null, opcoes);
  return create.mock.calls[0][0];
}

describe('Brain — custo', () => {
  it('mede como "conversa:lead" com o usage da resposta', async () => {
    await rodar();
    expect(medirIa).toHaveBeenCalledWith(expect.objectContaining({ origem: 'conversa:lead', usage: USAGE, modelo: 'claude-sonnet-4-6' }));
  });

  it('cache de 1 hora no prompt fixo por padrão', async () => {
    const req = await rodar();
    expect(req.system[0].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
  });

  it('EVA_CACHE_TTL=5m volta pro cache de 5 min (chave de emergência)', async () => {
    process.env.EVA_CACHE_TTL = '5m';
    const req = await rodar();
    expect(req.system[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('base fixa informada vira o 2º ponto de cache', async () => {
    const req = await rodar({ conhecimentoEstavel: 'CORE FIXO' });
    expect(req.system).toHaveLength(3);
    expect(req.system[1].text.endsWith('CORE FIXO')).toBe(true);
    expect(req.system[1].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
  });

  it('modelo e tamanho de resposta NÃO mudam (economia sem mexer no comportamento)', async () => {
    const req = await rodar();
    expect(req.model).toBe('claude-sonnet-4-6');
    expect(req.max_tokens).toBe(1024);
  });
});
