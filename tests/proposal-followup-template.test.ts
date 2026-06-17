import { describe, it, expect, vi } from 'vitest';
import { ProposalFollowupService } from '../src/modules/proposal-followup.js';

// Instancia o serviço com deps mockadas e expõe executarEnvio (private) via any.
function makeService(over: Record<string, any> = {}) {
  const sendTemplate = vi.fn().mockResolvedValue({ messageId: 'm1' });
  const updateConversation = vi.fn().mockResolvedValue(undefined);
  const supabase = {
    getClient: () => ({ from: () => ({ update: () => ({ eq: () => ({ error: null }) }) }) }),
    getLeadByPhone: vi.fn().mockResolvedValue(null),
    getOrCreateLeadByPhone: vi.fn().mockResolvedValue('lead-1'),
    getOrCreateConversation: vi.fn().mockResolvedValue({ id: 'conv-1', messages: [], message_count: 0 }),
    updateConversation,
  };
  const svc = new ProposalFollowupService({
    supabase: supabase as any,
    metaService: { sendTemplate, sendText: vi.fn(), sendInteractiveButtons: vi.fn() } as any,
    sendText: vi.fn().mockResolvedValue(undefined),
    engineerPhone: '5561999999999',
    proposalBaseUrl: 'https://x',
    redis: null,
    delayMs: 0,
    templateAbordagem: 'eva_proposta_aberta_v1',
    ...over,
  });
  return { svc, sendTemplate, updateConversation };
}

describe('proposal-followup: abordagem via template', () => {
  it('executarEnvio manda TEMPLATE (não texto livre) com o 1º nome', async () => {
    const { svc, sendTemplate } = makeService();
    await (svc as any).executarEnvio('slug1', 'João Silva', '5561988887777');
    expect(sendTemplate).toHaveBeenCalledTimes(1);
    const [to, name, lang, components] = sendTemplate.mock.calls[0];
    expect(to).toBe('5561988887777');
    expect(name).toBe('eva_proposta_aberta_v1');
    expect(lang).toBe('pt_BR');
    expect(components[0].parameters[0].text).toBe('João');
  });
  it('grava a abordagem na conversa (aparece no dashboard)', async () => {
    const { svc, updateConversation } = makeService();
    await (svc as any).executarEnvio('slug1', 'João Silva', '5561988887777');
    expect(updateConversation).toHaveBeenCalledTimes(1);
    const [convId, updates] = updateConversation.mock.calls[0];
    expect(convId).toBe('conv-1');
    expect(updates.messages[0].content).toContain('Eva abordou');
    expect(updates.message_count).toBe(1);
  });
});
