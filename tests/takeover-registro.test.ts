// tests/takeover-registro.test.ts
//
// A CLARA CALADA NÃO PODE APAGAR O ATENDIMENTO (09/09/2026).
//
// A Conquista Solar abriu o dia dizendo: "Clara não fez os atendimentos" e
// "não consta no dashboard". Puxando o fio, o defeito era um só e estava no
// lugar mais barato de consertar: quando a equipe assume a conversa pelo
// celular, a assistente é pausada — e essa pausa era conferida ANTES de o
// lead ser criado. Resultado: a mensagem do cliente não era respondida E
// também não era registrada. Sumia. Valia pra texto, áudio, foto, vídeo e
// documento.
//
// Ficar calada é uma decisão de produto e está certa: se uma pessoa de
// verdade entrou na conversa, o cliente não pode receber duas respostas.
// Apagar o registro nunca foi decisão nenhuma — é dano colateral.
//
// O agravante: naquele número, o celular é o da vendedora, que digita o dia
// inteiro. Cada mensagem dela renova a pausa de 24 h. Na prática a assistente
// vivia calada, e o painel vivia mentindo.
//
// Aqui a regra vira: REGISTRA SEMPRE, RESPONDE NUNCA.
import { describe, it, expect, vi } from 'vitest';
import {
  registrarSemResponder,
  type DepsRegistro,
} from '../src/modules/takeover-registro.js';

const CONQUISTA = '99fd46d7-60fc-49fe-918f-66587ffa3829';

/** Dependências de mentira, com o mínimo pra o caso feliz funcionar. */
function fazDeps(over: Partial<DepsRegistro> = {}): DepsRegistro {
  return {
    getLeadByPhone: vi.fn(async () => null),
    upsertLead: vi.fn(async () => ({ id: 'lead-novo' })),
    getOrCreateConversation: vi.fn(async () => ({
      id: 'conversa-1',
      messages: [],
      message_count: 0,
    })),
    updateConversation: vi.fn(async () => {}),
    ...over,
  };
}

// ---------------------------------------------------------------------
// 1. O lead entra no painel mesmo com a equipe atendendo
// ---------------------------------------------------------------------
describe('registrarSemResponder — o cliente aparece no painel', () => {
  it('cria o lead quando é gente nova, carimbando a empresa do canal', async () => {
    const deps = fazDeps();

    const r = await registrarSemResponder(deps, {
      telefone: '5577999998888',
      companyId: CONQUISTA,
      texto: 'bom dia, queria um orçamento',
      tipo: 'texto',
    });

    expect(r).toBe('registrado');
    expect(deps.upsertLead).toHaveBeenCalledWith({
      phone: '5577999998888',
      status: 'novo',
      company_id: CONQUISTA,
    });
  });

  it('não cria lead de novo quando a pessoa já existe', async () => {
    const deps = fazDeps({
      getLeadByPhone: vi.fn(async () => ({ id: 'lead-antigo' })),
    });

    await registrarSemResponder(deps, {
      telefone: '5577999998888',
      companyId: CONQUISTA,
      texto: 'e aí, saiu aquele orçamento?',
      tipo: 'texto',
    });

    expect(deps.upsertLead).not.toHaveBeenCalled();
    expect(deps.getOrCreateConversation).toHaveBeenCalledWith('lead-antigo', CONQUISTA);
  });

  it('guarda a mensagem do cliente na conversa, sem inventar resposta', async () => {
    const deps = fazDeps({
      getOrCreateConversation: vi.fn(async () => ({
        id: 'conversa-1',
        messages: [{ role: 'user' as const, content: 'oi', timestamp: '2026-09-09T10:00:00.000Z' }],
        message_count: 1,
      })),
    });

    await registrarSemResponder(deps, {
      telefone: '5577999998888',
      companyId: CONQUISTA,
      texto: 'minha conta veio 800 reais',
      tipo: 'texto',
    });

    const [convId, updates] = (deps.updateConversation as any).mock.calls[0];
    expect(convId).toBe('conversa-1');
    expect(updates.message_count).toBe(2);
    expect(updates.messages).toHaveLength(2);

    const ultima = updates.messages[1];
    expect(ultima.role).toBe('user');
    expect(ultima.content).toBe('minha conta veio 800 reais');
    // Nada de 'assistant': ela está calada de propósito.
    expect(updates.messages.some((m: any) => m.role === 'assistant')).toBe(false);
  });
});

// ---------------------------------------------------------------------
// 2. Áudio, foto e documento também contam como atendimento
// ---------------------------------------------------------------------
describe('registrarSemResponder — mídia não pode sumir', () => {
  it('registra áudio com um marcador legível em vez de texto vazio', async () => {
    const deps = fazDeps();

    await registrarSemResponder(deps, {
      telefone: '5577991997448',
      companyId: CONQUISTA,
      texto: '',
      tipo: 'audio',
    });

    const [, updates] = (deps.updateConversation as any).mock.calls[0];
    expect(updates.messages[0].content).toBe('[áudio]');
  });

  it('usa a legenda da foto quando ela vem escrita', async () => {
    const deps = fazDeps();

    await registrarSemResponder(deps, {
      telefone: '5577991997448',
      companyId: CONQUISTA,
      texto: 'olha o telhado',
      tipo: 'imagem',
    });

    const [, updates] = (deps.updateConversation as any).mock.calls[0];
    expect(updates.messages[0].content).toBe('[imagem] olha o telhado');
  });
});

// ---------------------------------------------------------------------
// 3. Falhar aqui NUNCA pode derrubar o webhook
// ---------------------------------------------------------------------
describe('registrarSemResponder — falha em silêncio, nunca explode', () => {
  it('banco fora devolve "falhou" e não lança', async () => {
    const deps = fazDeps({
      upsertLead: vi.fn(async () => {
        throw new Error('connection refused');
      }),
    });

    const r = await registrarSemResponder(deps, {
      telefone: '5577999998888',
      companyId: CONQUISTA,
      texto: 'oi',
      tipo: 'texto',
    });

    expect(r).toBe('falhou');
  });

  it('conversa que não abre não impede o lead de existir', async () => {
    const deps = fazDeps({
      getOrCreateConversation: vi.fn(async () => {
        throw new Error('timeout');
      }),
    });

    const r = await registrarSemResponder(deps, {
      telefone: '5577999998888',
      companyId: CONQUISTA,
      texto: 'oi',
      tipo: 'texto',
    });

    // O lead foi criado — é o que faz o cliente aparecer no painel.
    expect(deps.upsertLead).toHaveBeenCalled();
    expect(r).toBe('parcial');
  });
});
