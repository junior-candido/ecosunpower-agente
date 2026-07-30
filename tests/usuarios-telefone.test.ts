// F2 do Diário — telefone (zap) no usuário: cadastrado na tela Usuários,
// usado pro aviso "novo serviço atribuído a você" chegar no WhatsApp.
import { describe, it, expect } from 'vitest';
import { createUser, updateUser, telefoneDoUsuario } from '../src/modules/dashboard/users-store.js';

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
  it('telefoneDoUsuario devolve o número (ou null)', async () => {
    const { client } = mockClient({ maybeSingle: [{ data: { telefone: '5561999998888' }, error: null }] });
    expect(await telefoneDoUsuario(client, 'u1')).toBe('5561999998888');
    const vazio = mockClient({ maybeSingle: [{ data: { telefone: null }, error: null }] });
    expect(await telefoneDoUsuario(vazio.client, 'u1')).toBeNull();
  });
});
