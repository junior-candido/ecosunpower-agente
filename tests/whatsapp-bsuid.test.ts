// Fase 1 do BSUID: mensagem SEM telefone (usuario escondeu atras de @username)
// nao pode entrar no fluxo normal — senao todo mundo sem telefone vira UM lead
// com phone '' (vazamento LGPD + conversa compartilhada). Ver docs/whatsapp-bsuid.md.
import { describe, it, expect, vi } from 'vitest';
import {
  temTelefone,
  montarJobDaFila,
  montarAlertaSemTelefone,
  processarMensagemSemTelefone,
  backfillWaUserId,
} from '../src/modules/whatsapp-bsuid.js';
import type { IncomingMessage } from '../src/modules/evolution.js';

function msg(over: Partial<IncomingMessage> = {}): IncomingMessage {
  return {
    type: 'text',
    from: '',
    content: 'Oi, quero orçamento',
    timestamp: new Date('2026-09-27T12:00:00Z'),
    messageId: 'wamid.X',
    fromMe: false,
    pushName: 'Sheena Nelson',
    phoneNumberId: '999888777',
    fromUserId: 'BR.13491208655302741918',
    username: '@realsheena',
    ...over,
  };
}

describe('temTelefone', () => {
  it('aceita telefone so com digitos', () => {
    expect(temTelefone('5561999999999')).toBe(true);
    expect(temTelefone('16505551234')).toBe(true);
  });
  it('recusa vazio, espacos, null/undefined e BSUID', () => {
    expect(temTelefone('')).toBe(false);
    expect(temTelefone('   ')).toBe(false);
    expect(temTelefone(undefined)).toBe(false);
    expect(temTelefone(null)).toBe(false);
    expect(temTelefone('BR.13491208655302741918')).toBe(false);
    expect(temTelefone('US.13491208655302741918')).toBe(false);
  });
});

describe('montarJobDaFila', () => {
  it('leva os campos de sempre + BSUID/username pra fila, sem mexer no from', () => {
    const job = montarJobDaFila(
      msg({ from: '5561999999999', fromParentUserId: 'BR.ENT.1', caption: 'c', mimeType: 'm' }),
      'empresa-1',
    );
    expect(job).toEqual({
      type: 'text',
      from: '5561999999999',
      content: 'Oi, quero orçamento',
      timestamp: '2026-09-27T12:00:00.000Z',
      messageId: 'wamid.X',
      pushName: 'Sheena Nelson',
      caption: 'c',
      mimeType: 'm',
      referral: undefined,
      companyId: 'empresa-1',
      fromUserId: 'BR.13491208655302741918',
      fromParentUserId: 'BR.ENT.1',
      username: '@realsheena',
    });
  });
});

describe('montarAlertaSemTelefone', () => {
  it('traz nome, @username, BSUID e o comeco da mensagem', () => {
    const t = montarAlertaSemTelefone(msg(), 'Eva');
    expect(t).toContain('Sheena Nelson');
    expect(t).toContain('@realsheena');
    expect(t).toContain('BR.13491208655302741918');
    expect(t).toContain('Oi, quero orçamento');
    expect(t).toMatch(/Eva/);
  });
  it('midia: nao cola o media_id, diz o tipo', () => {
    const t = montarAlertaSemTelefone(msg({ type: 'audio', content: '123456789' }), 'Eva');
    expect(t).not.toContain('123456789');
    expect(t).toMatch(/áudio/i);
  });
});

describe('processarMensagemSemTelefone', () => {
  function deps(over: Record<string, unknown> = {}) {
    return {
      resolverEmpresa: vi.fn(async () => 'empresa-1' as string | null),
      destinoAdmin: vi.fn((_c: string) => '5561900000000' as string | null),
      nomeAssistente: vi.fn((_c: string) => 'Eva'),
      adquirirTrava: vi.fn(async (_k: string) => true),
      enviar: vi.fn(async (_c: string, _to: string, _t: string) => {}),
      agora: () => new Date('2026-09-27T12:34:00Z'),
      ...over,
    };
  }

  it('avisa o admin da empresa e devolve "avisado"', async () => {
    const d = deps();
    const r = await processarMensagemSemTelefone(msg(), d);
    expect(r).toBe('avisado');
    expect(d.resolverEmpresa).toHaveBeenCalledWith('999888777');
    expect(d.enviar).toHaveBeenCalledTimes(1);
    const [companyId, to, texto] = d.enviar.mock.calls[0]!;
    expect(companyId).toBe('empresa-1');
    expect(to).toBe('5561900000000');
    expect(texto).toContain('BR.13491208655302741918');
  });

  it('trava por BSUID + hora (nao inunda o admin)', async () => {
    const d = deps({ adquirirTrava: vi.fn(async () => false) });
    const r = await processarMensagemSemTelefone(msg(), d);
    expect(r).toBe('ja-avisado');
    expect(d.adquirirTrava).toHaveBeenCalledWith(
      expect.stringMatching(/sem_telefone.*empresa-1.*BR\.13491208655302741918.*2026-09-27T12/),
    );
    expect(d.enviar).not.toHaveBeenCalled();
  });

  it('empresa nao resolvida (falha-fechado) → so loga, nao envia', async () => {
    const d = deps({ resolverEmpresa: vi.fn(async () => null) });
    expect(await processarMensagemSemTelefone(msg(), d)).toBe('empresa-nao-resolvida');
    expect(d.enviar).not.toHaveBeenCalled();
  });

  it('empresa sem admin configurado → nao envia pra ninguem', async () => {
    const d = deps({ destinoAdmin: vi.fn(() => null) });
    expect(await processarMensagemSemTelefone(msg(), d)).toBe('sem-destino');
    expect(d.enviar).not.toHaveBeenCalled();
  });

  it('erro no envio nunca explode (webhook ja respondeu 200)', async () => {
    const d = deps({ enviar: vi.fn(async () => { throw new Error('boom'); }) });
    expect(await processarMensagemSemTelefone(msg(), d)).toBe('erro');
  });

  it('sem BSUID tambem trava (chave usa o messageId)', async () => {
    const d = deps();
    await processarMensagemSemTelefone(msg({ fromUserId: undefined }), d);
    expect(d.adquirirTrava).toHaveBeenCalledWith(expect.stringContaining('wamid.X'));
  });
});

describe('backfillWaUserId (worker da fila)', () => {
  it('telefone + BSUID → chama vincularWaUserId com empresa e username', async () => {
    const db = { vincularWaUserId: vi.fn(async () => 'gravado' as const) };
    await backfillWaUserId(db, { from: '5561999999999', fromUserId: 'BR.1', username: '@ana' }, 'empresa-1');
    expect(db.vincularWaUserId).toHaveBeenCalledWith('5561999999999', 'empresa-1', 'BR.1', '@ana');
  });
  it('sem BSUID (payload antigo / Evolution) → nao faz nada', async () => {
    const db = { vincularWaUserId: vi.fn(async () => 'gravado' as const) };
    await backfillWaUserId(db, { from: '5561999999999' }, 'empresa-1');
    expect(db.vincularWaUserId).not.toHaveBeenCalled();
  });
  it('sem telefone → nao faz nada', async () => {
    const db = { vincularWaUserId: vi.fn(async () => 'gravado' as const) };
    await backfillWaUserId(db, { from: '', fromUserId: 'BR.1' }, 'empresa-1');
    expect(db.vincularWaUserId).not.toHaveBeenCalled();
  });
  it('erro nunca sobe (a resposta ao cliente ja saiu)', async () => {
    const db = { vincularWaUserId: vi.fn(async () => { throw new Error('boom'); }) };
    await expect(backfillWaUserId(db, { from: '5561999999999', fromUserId: 'BR.1' }, 'e')).resolves.toBeUndefined();
  });
});
