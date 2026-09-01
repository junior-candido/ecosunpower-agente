// tests/contatos-internos.test.ts
import { describe, it, expect, vi } from 'vitest';
import { identificarInterno, salvarRecado, textoConfirmacao } from '../src/modules/contatos-internos.js';

function chainMock(resultado: unknown = { data: [], error: null }) {
  const calls: Record<string, unknown[][]> = {};
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'insert', 'eq', 'in', 'limit']) {
    chain[m] = vi.fn((...a: unknown[]) => { (calls[m] ??= []).push(a); return chain; });
  }
  chain.then = (res: (v: unknown) => void) => res(resultado);
  const from = vi.fn(() => chain);
  return { client: { from } as never, from, calls };
}

describe('contatos internos (gente de dentro no número da assistente)', () => {
  it('reconhece o telefone cadastrado e devolve nome e modo', async () => {
    const { client, from, calls } = chainMock({
      data: [{ id: 'ci1', nome: 'Lazaro', setor: 'engenharia', modo: 'anota' }], error: null,
    });
    const r = await identificarInterno(client, 'emp1', '5577981660268');
    expect(r).toEqual({ id: 'ci1', nome: 'Lazaro', setor: 'engenharia', modo: 'anota' });
    expect(from).toHaveBeenCalledWith('contatos_internos');
  });

  it('SEMPRE filtra pela empresa — interno de uma empresa não cala a assistente de outra', async () => {
    const { client, calls } = chainMock({ data: [], error: null });
    await identificarInterno(client, 'emp1', '5577981660268');
    const filtros = (calls.eq ?? []).map(a => `${a[0]}=${a[1]}`);
    expect(filtros).toContain('company_id=emp1');
    expect(filtros).toContain('ativo=true');
  });

  it('compara pelas variantes do telefone (com e sem o 9, com e sem 55)', async () => {
    const { client, calls } = chainMock({ data: [], error: null });
    await identificarInterno(client, 'emp1', '5577981660268');
    const variantes = calls.in![0][1] as string[];
    expect(variantes.length).toBeGreaterThan(1);
  });

  it('quem não está na lista não é interno', async () => {
    const { client } = chainMock({ data: [], error: null });
    expect(await identificarInterno(client, 'emp1', '5561999999999')).toBeNull();
  });

  it('banco falhou: NA DUVIDA a pessoa é cliente (falha aberto, ninguem fica sem atendimento)', async () => {
    const { client } = chainMock({ data: null, error: { message: 'timeout' } });
    expect(await identificarInterno(client, 'emp1', '5577981660268')).toBeNull();
  });

  it('salva o recado amarrado na empresa e no contato', async () => {
    const { client, from, calls } = chainMock({ data: null, error: null });
    await salvarRecado(client, {
      companyId: 'emp1', contatoId: 'ci1', telefone: '5577981660268',
      nome: 'Lazaro', mensagem: 'indicacao: auto escola do seu Ademir',
    });
    expect(from).toHaveBeenCalledWith('recados_equipe');
    const row = calls.insert![0][0] as Record<string, unknown>;
    expect(row.company_id).toBe('emp1');
    expect(row.contato_id).toBe('ci1');
    expect(row.mensagem).toContain('auto escola');
  });

  it('confirmacao usa o primeiro nome e NAO cita empresa nem assistente (serve pra qualquer cliente)', () => {
    const t = textoConfirmacao('Lazaro Silva dos Santos');
    expect(t).toContain('Lazaro');
    expect(t).not.toMatch(/clara|ecosun|conquista/i);
    expect(t.length).toBeLessThan(140);
  });
});
