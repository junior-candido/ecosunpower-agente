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
  it('grava o TEXTO REAL da abordagem na conversa (não um rótulo)', async () => {
    const { svc, updateConversation } = makeService();
    await (svc as any).executarEnvio('slug1', 'João Silva', '5561988887777');
    expect(updateConversation).toHaveBeenCalledTimes(1);
    const [convId, updates] = updateConversation.mock.calls[0];
    expect(convId).toBe('conv-1');
    // Texto real que o cliente recebeu, com o 1º nome preenchido.
    expect(updates.messages[0].content).toContain('Oi, João!');
    expect(updates.messages[0].content).toContain('consultora da EcoSunPower');
    expect(updates.messages[0].content).toContain('Salva meu contato');
    expect(updates.messages[0].role).toBe('assistant');
    expect(updates.message_count).toBe(1);
  });
});

// Monta um service cujo getClient resolve loadPropostaParaFollowup (select→eq→
// maybeSingle) na proposta dada + suporta markFollowupSent (update→eq), pros
// testes de reabertura (opção a).
function makeServiceReabertura(followupSentAt: string | null, telefone = '5561988887777') {
  const sendTemplate = vi.fn().mockResolvedValue({ messageId: 'm1' });
  const sendText = vi.fn().mockResolvedValue(undefined);
  const proposta = {
    cliente_nome: 'João Silva',
    cliente_telefone: telefone,
    followup_sent_at: followupSentAt,
    modo_envio: null,
    dados_input: {},
  };
  const eqSelect = { maybeSingle: () => Promise.resolve({ data: proposta, error: null }) };
  const from = () => ({
    select: () => ({ eq: () => eqSelect }),
    update: () => ({ eq: () => ({ error: null }) }),
  });
  const supabase = {
    getClient: () => ({ from }),
    getLeadByPhone: vi.fn().mockResolvedValue(null),
    getOrCreateLeadByPhone: vi.fn().mockResolvedValue('lead-1'),
    getOrCreateConversation: vi.fn().mockResolvedValue({ id: 'conv-1', messages: [], message_count: 0 }),
    updateConversation: vi.fn().mockResolvedValue(undefined),
  };
  const svc = new ProposalFollowupService({
    supabase: supabase as any,
    metaService: { sendTemplate, sendText: vi.fn(), sendInteractiveButtons: vi.fn() } as any,
    sendText,
    engineerPhone: '5561999999999',
    proposalBaseUrl: 'https://x',
    redis: null,
    delayMs: 0,
    templateAbordagem: 'eva_proposta_aberta_v1',
  });
  return { svc, sendTemplate, sendText };
}

// Service pra testar a Parte B (reabordagem inteligente alternada): cliente JÁ
// abordado (followup_sent_at setado), com redis (incr/expire/set), janela e gerador.
function makeServiceReaberturaB(opts: { janelaAberta?: boolean; contador?: number; msgGerada?: string | null; jaReabordou?: number; cooldownLivre?: boolean } = {}) {
  const { janelaAberta = true, contador = 1, msgGerada = 'Opa, vi que você voltou na proposta! 👀', jaReabordou = 0, cooldownLivre = true } = opts;
  const sendTemplate = vi.fn().mockResolvedValue({ messageId: 'm1' });
  const sendText = vi.fn().mockResolvedValue(undefined);
  const gerarAbordagemInteligente = vi.fn().mockResolvedValue(msgGerada);
  const janela24hAberta = vi.fn().mockResolvedValue(janelaAberta);
  const updateConversation = vi.fn().mockResolvedValue(undefined);
  const proposta = {
    cliente_nome: 'João Silva',
    cliente_telefone: '5561988887777',
    followup_sent_at: '2026-06-17T00:00:00Z',
    modo_envio: null,
    dados_input: {},
  };
  const eqSelect = { maybeSingle: () => Promise.resolve({ data: proposta, error: null }) };
  const from = () => ({
    select: () => ({ eq: () => eqSelect }),
    update: () => ({ eq: () => ({ error: null }) }),
  });
  const supabase = {
    getClient: () => ({ from }),
    getLeadByPhone: vi.fn().mockResolvedValue(null),
    getOrCreateLeadByPhone: vi.fn().mockResolvedValue('lead-1'),
    getOrCreateConversation: vi.fn().mockResolvedValue({ id: 'conv-1', messages: [], message_count: 0 }),
    updateConversation,
  };
  const redis = {
    incr: vi.fn().mockResolvedValue(contador),
    expire: vi.fn().mockResolvedValue(1),
    // reopen-throttle (ramo c) → 'OK'; reabordada-cooldown (NX) → null se ocupado.
    set: vi.fn().mockImplementation((key: string) =>
      Promise.resolve(key.includes('reabordada-cooldown') ? (cooldownLivre ? 'OK' : null) : 'OK'),
    ),
    get: vi.fn().mockResolvedValue(String(jaReabordou)),
  };
  const svc = new ProposalFollowupService({
    supabase: supabase as any,
    metaService: { sendTemplate, sendText: vi.fn(), sendInteractiveButtons: vi.fn() } as any,
    sendText,
    engineerPhone: '5561999999999',
    proposalBaseUrl: 'https://x',
    redis: redis as any,
    delayMs: 0,
    templateAbordagem: 'eva_proposta_aberta_v1',
    janela24hAberta,
    gerarAbordagemInteligente,
  });
  return { svc, sendText, gerarAbordagemInteligente, janela24hAberta, updateConversation };
}

const mandouPraCliente = (sendText: any) =>
  sendText.mock.calls.some((c: any[]) => c[0] === '5561988887777');

describe('proposal-followup: reabordagem inteligente alternada (Parte B)', () => {
  it('janela aberta + contador ÍMPAR → Eva reaborda (gera + manda pro cliente + grava)', async () => {
    const { svc, sendText, gerarAbordagemInteligente, updateConversation } = makeServiceReaberturaB({ contador: 1 });
    await (svc as any).runReaberturaAsync('slug1', 1);
    expect(gerarAbordagemInteligente).toHaveBeenCalledTimes(1);
    expect(mandouPraCliente(sendText)).toBe(true);
    expect(updateConversation).toHaveBeenCalledTimes(1); // gravou no dashboard
  });

  it('janela aberta + contador PAR → NÃO reaborda, só notifica', async () => {
    const { svc, sendText, gerarAbordagemInteligente } = makeServiceReaberturaB({ contador: 2 });
    await (svc as any).runReaberturaAsync('slug1', 1);
    expect(gerarAbordagemInteligente).not.toHaveBeenCalled();
    expect(mandouPraCliente(sendText)).toBe(false);
    expect(sendText).toHaveBeenCalled(); // notificou o Junior
  });

  it('janela FECHADA → não gera nem manda pro cliente (texto livre proibido)', async () => {
    const { svc, sendText, gerarAbordagemInteligente } = makeServiceReaberturaB({ janelaAberta: false, contador: 1 });
    await (svc as any).runReaberturaAsync('slug1', 1);
    expect(gerarAbordagemInteligente).not.toHaveBeenCalled();
    expect(mandouPraCliente(sendText)).toBe(false);
  });

  it('gerador retorna null → cai no só-notifica (não manda vazio pro cliente)', async () => {
    const { svc, sendText, gerarAbordagemInteligente } = makeServiceReaberturaB({ contador: 1, msgGerada: null });
    await (svc as any).runReaberturaAsync('slug1', 1);
    expect(gerarAbordagemInteligente).toHaveBeenCalledTimes(1);
    expect(mandouPraCliente(sendText)).toBe(false);
    expect(sendText).toHaveBeenCalled(); // notificou o Junior
  });

  it('teto batido (já reabordou 3x) → não reaborda mesmo na vez ímpar', async () => {
    const { svc, sendText, gerarAbordagemInteligente } = makeServiceReaberturaB({ contador: 5, jaReabordou: 3 });
    await (svc as any).runReaberturaAsync('slug1', 1);
    expect(gerarAbordagemInteligente).not.toHaveBeenCalled();
    expect(mandouPraCliente(sendText)).toBe(false);
  });

  it('cooldown ativo (reabordou faz pouco) → não reaborda mesmo na vez ímpar', async () => {
    const { svc, sendText, gerarAbordagemInteligente } = makeServiceReaberturaB({ contador: 3, cooldownLivre: false });
    await (svc as any).runReaberturaAsync('slug1', 1);
    expect(gerarAbordagemInteligente).not.toHaveBeenCalled();
    expect(mandouPraCliente(sendText)).toBe(false);
  });
});

describe('proposal-followup: reabertura aborda cliente antigo (opção a)', () => {
  it('reabertura de cliente NUNCA abordado → Eva aborda (manda template)', async () => {
    const { svc, sendTemplate } = makeServiceReabertura(null);
    await (svc as any).runReaberturaAsync('slug1', 1);
    expect(sendTemplate).toHaveBeenCalledTimes(1);
  });

  it('reabertura de cliente JÁ abordado → só notifica, NÃO manda template de novo', async () => {
    const { svc, sendTemplate, sendText } = makeServiceReabertura('2026-06-17T00:00:00Z');
    await (svc as any).runReaberturaAsync('slug1', 1);
    expect(sendTemplate).not.toHaveBeenCalled();
    expect(sendText).toHaveBeenCalled(); // re-avisa o Junior
  });
});

// Monta um service cujo getClient devolve a cadeia select→ilike→order→limit→maybeSingle
// resolvendo na proposta dada (ou null), pros testes do abordar manual.
function makeServiceComBusca(propostaEncontrada: any) {
  const sendTemplate = vi.fn().mockResolvedValue({ messageId: 'm1' });
  const chain = {
    select: () => chain,
    ilike: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => Promise.resolve({ data: propostaEncontrada, error: null }),
    update: () => ({ eq: () => ({ error: null }) }),
  };
  const supabase = {
    getClient: () => ({ from: () => chain }),
    getOrCreateLeadByPhone: vi.fn().mockResolvedValue('lead-1'),
    getOrCreateConversation: vi.fn().mockResolvedValue({ id: 'conv-1', messages: [], message_count: 0 }),
    updateConversation: vi.fn().mockResolvedValue(undefined),
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
  });
  return { svc, sendTemplate };
}

describe('proposal-followup: abordar manual', () => {
  it('acha a proposta pelo nome e manda o template', async () => {
    const { svc, sendTemplate } = makeServiceComBusca({
      slug: 'slugX',
      cliente_nome: 'Maria Souza',
      cliente_telefone: '5561988887777',
      dados_input: {},
    });
    const msg = await svc.abordarManual('maria');
    expect(sendTemplate).toHaveBeenCalledTimes(1);
    expect(sendTemplate.mock.calls[0][0]).toBe('5561988887777');
    expect(msg).toContain('Mandei a abordagem');
    expect(msg).toContain('Maria Souza');
  });

  it('não acha proposta → mensagem amigável, sem mandar template', async () => {
    const { svc, sendTemplate } = makeServiceComBusca(null);
    const msg = await svc.abordarManual('ninguem');
    expect(sendTemplate).not.toHaveBeenCalled();
    expect(msg).toContain('Não achei proposta');
  });

  it('proposta sem telefone → avisa, sem mandar template', async () => {
    const { svc, sendTemplate } = makeServiceComBusca({
      slug: 'slugX',
      cliente_nome: 'Sem Fone',
      cliente_telefone: null,
      dados_input: {},
    });
    const msg = await svc.abordarManual('sem fone');
    expect(sendTemplate).not.toHaveBeenCalled();
    expect(msg).toContain('não tem telefone');
  });

  it('nome curto demais → pede o nome, sem buscar', async () => {
    const { svc, sendTemplate } = makeServiceComBusca(null);
    const msg = await svc.abordarManual('a');
    expect(sendTemplate).not.toHaveBeenCalled();
    expect(msg).toContain('Me diz o nome');
  });

  it('pega o telefone do dados_input quando o campo direto tá vazio', async () => {
    const { svc, sendTemplate } = makeServiceComBusca({
      slug: 'slugX',
      cliente_nome: 'Fallback Fone',
      cliente_telefone: null,
      dados_input: { telefoneCliente: '5561977776666' },
    });
    await svc.abordarManual('fallback');
    expect(sendTemplate).toHaveBeenCalledTimes(1);
    expect(sendTemplate.mock.calls[0][0]).toBe('5561977776666');
  });
});
