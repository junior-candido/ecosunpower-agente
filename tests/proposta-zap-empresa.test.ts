// AP0 (28/09): proposta feita pelo WhatsApp (/proposta) nasce na empresa DONA
// do número que recebeu a mensagem — não mais fixa na EcoSun. O job da fila
// roda dentro de comCanal({ companyId }) (index.ts); o gerador lê de lá.
import { describe, it, expect, vi } from 'vitest';
import { ProposalAssistant } from '../src/modules/proposal-assistant.js';
import { comCanal } from '../src/modules/canal-contexto.js';

vi.mock('ioredis', () => {
  function RedisMock() { return { get: vi.fn(), set: vi.fn(), setex: vi.fn(), del: vi.fn(), quit: vi.fn(), disconnect: vi.fn(), on: vi.fn() }; }
  (RedisMock as any).default = RedisMock;
  (RedisMock as any).Redis = RedisMock;
  return { default: RedisMock, Redis: RedisMock };
});

const TENANT = 'aaaa1111-2222-3333-4444-555566667777';

function assistenteFalso() {
  const pa: any = Object.create(ProposalAssistant.prototype);
  const core = vi.fn().mockRejectedValue(new Error('parar aqui'));
  pa.generateProposalCore = core;
  pa.loadState = vi.fn().mockResolvedValue({ attachments: [], modoEnvio: 'junior_envia', tipo: 'basica' });
  pa.saveState = vi.fn();
  pa.redis = { setex: vi.fn() };
  return { pa, core };
}

describe('generateProposal (zap) carimba a empresa do número que recebeu', () => {
  it('dentro do canal de um tenant → companyId do tenant', async () => {
    const { pa, core } = assistenteFalso();
    await comCanal({ companyId: TENANT }, () => pa.generateProposal('5561999999999', { nomeCliente: 'X' }, ''));
    expect(core).toHaveBeenCalledTimes(1);
    expect(core.mock.calls[0][0].companyId).toBe(TENANT);
  });

  it('fora de canal (legado) → null = EcoSun, como antes', async () => {
    const { pa, core } = assistenteFalso();
    await pa.generateProposal('5561999999999', { nomeCliente: 'X' }, '');
    expect(core.mock.calls[0][0].companyId ?? null).toBeNull();
  });
});
