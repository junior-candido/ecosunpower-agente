// Diário de Serviços F1 — store: tipos, criar registro, listar, mídias.
import { describe, it, expect } from 'vitest';
import {
  listarTipos, criarServico, listarServicos, servicosDoLead, registrarMidias,
  concluirServico, atribuirServico, enderecoDoLead,
} from '../src/modules/dashboard/servicos-store.js';

function mockClient(respostas: Record<string, any[]>) {
  const inserts: Record<string, any[]> = {};
  const updates: Record<string, any[]> = {};
  const client = {
    from(tabela: string) {
      const resposta = () => (respostas[tabela] ?? []).shift() ?? { data: null, error: null };
      const chain: any = {
        insert(row: any) { (inserts[tabela] ??= []).push(row); return chain; },
        update(row: any) { (updates[tabela] ??= []).push(row); return chain; },
        select() { return chain; }, eq() { return chain; }, order() { return chain; }, limit() { return chain; },
        single() { return Promise.resolve(resposta()); },
        maybeSingle() { return Promise.resolve(resposta()); },
        then(res: any, rej: any) { return Promise.resolve(resposta()).then(res, rej); },
      };
      return chain;
    },
  };
  return { client: client as any, inserts, updates };
}

describe('listarTipos', () => {
  it('devolve os tipos ativos', async () => {
    const { client } = mockClient({ servico_tipos: [{ data: [{ id: 'visita-tecnica', nome: 'Visita técnica' }], error: null }] });
    expect(await listarTipos(client)).toEqual([{ id: 'visita-tecnica', nome: 'Visita técnica' }]);
  });
});

describe('criarServico', () => {
  it('insere com os campos certos e devolve o id', async () => {
    const { client, inserts } = mockClient({ servicos: [{ data: { id: 's1' }, error: null }] });
    const id = await criarServico(client, {
      companyId: 'c1', tipoId: 'visita-tecnica', leadId: 'l1', sistemaId: null,
      observacoes: 'telhado ok', dataServico: '2026-07-30', criadoPor: 'u1',
    });
    expect(id).toBe('s1');
    expect(inserts.servicos?.[0]).toMatchObject({
      company_id: 'c1', tipo_id: 'visita-tecnica', lead_id: 'l1', sistema_id: null,
      observacoes: 'telhado ok', data_servico: '2026-07-30', criado_por: 'u1',
    });
  });
});

describe('listarServicos / servicosDoLead', () => {
  const LINHA = {
    id: 's1', tipo_id: 'visita-tecnica', lead_id: 'l1', sistema_id: null,
    observacoes: 'ok', data_servico: '2026-07-30', criado_em: 'x',
    servico_tipos: { nome: 'Visita técnica' }, leads: { name: 'Fernanda' },
    servico_fotos: [{ tipo_midia: 'foto' }, { tipo_midia: 'foto' }, { tipo_midia: 'video' }],
  };
  it('lista com nome do tipo, do cliente e contagem de mídias', async () => {
    const { client } = mockClient({ servicos: [{ data: [LINHA], error: null }] });
    const [s] = await listarServicos(client);
    expect(s).toMatchObject({ id: 's1', tipoNome: 'Visita técnica', clienteNome: 'Fernanda', fotos: 2, videos: 1, dataServico: '2026-07-30' });
  });
  it('servicosDoLead usa o mesmo formato', async () => {
    const { client } = mockClient({ servicos: [{ data: [LINHA], error: null }] });
    const lista = await servicosDoLead(client, 'l1');
    expect(lista[0]!.tipoNome).toBe('Visita técnica');
  });
});

describe('atribuirServico (📤 enviar pelo zap)', () => {
  it('amarra o usuário e volta pra 🟡 pendente', async () => {
    const { client, updates } = mockClient({ servicos: [{ data: null, error: null }] });
    await atribuirServico(client, 's1', 'u-novo');
    expect(updates.servicos?.[0]).toMatchObject({ atribuido_a: 'u-novo', status: 'atribuido' });
  });
});

describe('enderecoDoLead (zap só-informações — fora do router por causa da catraca RLS)', () => {
  it('monta a linha do endereço com o que tiver', async () => {
    const { client } = mockClient({ leads: [{ data: { endereco_rua: 'Rua X', endereco_numero: '100', neighborhood: 'Jardim Botânico', city: 'Brasília' }, error: null }] });
    expect(await enderecoDoLead(client, 'l1')).toBe('Rua X, 100, Jardim Botânico, Brasília');
  });
  it('lead sem endereço → null', async () => {
    const { client } = mockClient({ leads: [{ data: {}, error: null }] });
    expect(await enderecoDoLead(client, 'l1')).toBeNull();
  });
});

describe('atribuição (F2)', () => {
  it('criarServico grava atribuido_a e status atribuido', async () => {
    const { client, inserts } = mockClient({ servicos: [{ data: { id: 's2' }, error: null }] });
    await criarServico(client, {
      companyId: 'c1', tipoId: 'instalacao-fv', leadId: 'l1', dataServico: '2026-07-30',
      atribuidoA: 'u-instalador', status: 'atribuido',
    });
    expect(inserts.servicos?.[0]).toMatchObject({ atribuido_a: 'u-instalador', status: 'atribuido' });
  });
  it('sem atribuição → nasce concluido (registro preenchido na hora)', async () => {
    const { client, inserts } = mockClient({ servicos: [{ data: { id: 's3' }, error: null }] });
    await criarServico(client, { companyId: 'c1', tipoId: 'visita-tecnica', leadId: 'l1', dataServico: '2026-07-30' });
    expect(inserts.servicos?.[0]).toMatchObject({ status: 'concluido', atribuido_a: null });
  });
  it('concluirServico marca concluido (e pode anexar observações)', async () => {
    const { client, updates } = mockClient({ servicos: [{ data: null, error: null }] });
    await concluirServico(client, 's2', 'tudo instalado, telhado ok');
    expect(updates.servicos?.[0]).toEqual({ status: 'concluido', observacoes: 'tudo instalado, telhado ok' });
  });
  it('reabrirServico volta pra atribuido (faltou algo)', async () => {
    const { reabrirServico } = await import('../src/modules/dashboard/servicos-store.js');
    const { client, updates } = mockClient({ servicos: [{ data: null, error: null }] });
    await reabrirServico(client, 's2');
    expect(updates.servicos?.[0]).toEqual({ status: 'atribuido' });
  });
  it('contarPendentesDoUsuario usa o count (regra do acesso temporário)', async () => {
    const { contarPendentesDoUsuario } = await import('../src/modules/dashboard/servicos-store.js');
    const { client } = mockClient({ servicos: [{ data: null, error: null, count: 0 } as any] });
    expect(await contarPendentesDoUsuario(client, 'u-inst')).toBe(0);
  });
});

describe('registrarMidias', () => {
  it('insere uma linha por mídia com ordem e company', async () => {
    const { client, inserts } = mockClient({ servico_fotos: [{ data: null, error: null }] });
    await registrarMidias(client, 's1', 'c1', [
      { path: 'l1/servico/s1/a.jpg', tipoMidia: 'foto' },
      { path: 'l1/servico/s1/b.mp4', tipoMidia: 'video' },
    ]);
    expect(inserts.servico_fotos?.[0]).toEqual([
      { servico_id: 's1', company_id: 'c1', storage_path: 'l1/servico/s1/a.jpg', tipo_midia: 'foto', ordem: 0 },
      { servico_id: 's1', company_id: 'c1', storage_path: 'l1/servico/s1/b.mp4', tipo_midia: 'video', ordem: 1 },
    ]);
  });
  it('lista vazia → não toca o banco', async () => {
    let tocou = false;
    const client = { from() { tocou = true; throw new Error('x'); } };
    await registrarMidias(client as any, 's1', 'c1', []);
    expect(tocou).toBe(false);
  });
});
