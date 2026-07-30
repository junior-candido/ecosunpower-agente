// F2 do Diário — telefone (zap) no usuário: cadastrado na tela Usuários,
// usado pro aviso "novo serviço atribuído a você" chegar no WhatsApp.
import { describe, it, expect } from 'vitest';
import { createUser, updateUser, telefoneDoUsuario, textoBoasVindas } from '../src/modules/dashboard/users-store.js';

function mockClient(respostas: Record<string, any[]> = {}) {
  const inserts: any[] = [];
  const updates: any[] = [];
  const chain: any = {
    insert(row: any) { inserts.push(row); return chain; },
    update(row: any) { updates.push(row); return chain; },
    select() { return chain; }, eq() { return chain; },
    single() { return Promise.resolve((respostas.single ?? []).shift() ?? { data: { id: 'u1' }, error: null }); },
    maybeSingle() { return Promise.resolve((respostas.maybeSingle ?? []).shift() ?? { data: null, error: null }); },
    then(res: any, rej: any) { return Promise.resolve({ data: null, error: null }).then(res, rej); },
  };
  return { client: { from: () => chain } as any, inserts, updates };
}

describe('excluir de vez (só sem histórico)', () => {
  it('FK barrando (23503) → devolve motivo amigável', async () => {
    const { deleteUserSemHistorico } = await import('../src/modules/dashboard/users-store.js');
    const chain: any = {
      delete() { return chain; },
      eq() { return Promise.resolve({ error: { code: '23503', message: 'fk' } }); },
    };
    const r = await deleteUserSemHistorico({ from: () => chain } as any, 'u1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain('histórico');
  });
  it('sem histórico → exclui', async () => {
    const { deleteUserSemHistorico } = await import('../src/modules/dashboard/users-store.js');
    const chain: any = { delete() { return chain; }, eq() { return Promise.resolve({ error: null }); } };
    expect((await deleteUserSemHistorico({ from: () => chain } as any, 'u1')).ok).toBe(true);
  });
});

describe('acesso temporário (expira ao concluir)', () => {
  it('createUser e updateUser gravam acesso_temporario', async () => {
    const { client, inserts } = mockClient();
    await createUser(client, { companyId: 'c1', nome: 'João', login: 'joao', senhaHash: 'h', roleId: 'r1', acessoTemporario: true });
    expect(inserts[0]).toMatchObject({ acesso_temporario: true });
    const t2 = mockClient();
    await updateUser(t2.client, 'u1', { acessoTemporario: false });
    expect(t2.updates[0]).toEqual({ acesso_temporario: false });
  });
});

describe('telefone do usuário', () => {
  it('createUser grava o telefone (só dígitos entram pelo router)', async () => {
    const { client, inserts } = mockClient();
    await createUser(client, { companyId: 'c1', nome: 'João', login: 'joao', senhaHash: 'h', roleId: 'r1', telefone: '5561999998888' });
    expect(inserts[0]).toMatchObject({ telefone: '5561999998888' });
  });
  it('updateUser atualiza o telefone (e vazio limpa)', async () => {
    const { client, updates } = mockClient();
    await updateUser(client, 'u1', { telefone: '5561988887777' });
    expect(updates[0]).toEqual({ telefone: '5561988887777' });
    const t2 = mockClient();
    await updateUser(t2.client, 'u1', { telefone: null });
    expect(t2.updates[0]).toEqual({ telefone: null });
  });
  it('createUser/updateUser gravam o email (096 — boas-vindas bonitas pro tenant)', async () => {
    const { client, inserts } = mockClient();
    await createUser(client, { companyId: 'c1', nome: 'Thiago', login: 't', senhaHash: 'h', roleId: 'r1', email: 'thiago@sabion.com' });
    expect(inserts[0]).toMatchObject({ email: 'thiago@sabion.com' });
    const t2 = mockClient();
    await updateUser(t2.client, 'u1', { email: null });
    expect(t2.updates[0]).toEqual({ email: null });
  });
  it('corpoEmailBoasVindas tem login, senha e o pedido de troca', async () => {
    const { corpoEmailBoasVindas } = await import('../src/modules/dashboard/users-store.js');
    const c = corpoEmailBoasVindas('Thiago', 'thiago', 'abc12345');
    expect(c).toContain('thiago');
    expect(c).toContain('abc12345');
    expect(c).toContain('troque a senha');
  });
  it('textoBoasVindas tem link, login, senha e o pedido de troca', () => {
    const t = textoBoasVindas('João', 'joao', 'abc12345', 'https://app.exemplo.com/dashboard');
    expect(t).toContain('João');
    expect(t).toContain('joao');
    expect(t).toContain('abc12345');
    expect(t).toContain('https://app.exemplo.com/dashboard');
    expect(t.toUpperCase()).toContain('TROQUE');
  });
  it('telefoneDoUsuario devolve o número (ou null)', async () => {
    const { client } = mockClient({ maybeSingle: [{ data: { telefone: '5561999998888' }, error: null }] });
    expect(await telefoneDoUsuario(client, 'u1')).toBe('5561999998888');
    const vazio = mockClient({ maybeSingle: [{ data: { telefone: null }, error: null }] });
    expect(await telefoneDoUsuario(vazio.client, 'u1')).toBeNull();
  });
});
