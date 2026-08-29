import { describe, it, expect, vi } from 'vitest';
import { agruparSemDono, montarPerguntas, ehSegunda8h, tickResumoSemanal, responderFavorecido } from '../src/modules/financeiro/resumo-semanal.js';

const rows = [
  { id: '1', contraparte: 'Pix ***.320.641-**', valor: 50, data_evento: '2026-09-02', tipo: 'despesa' as const },
  { id: '2', contraparte: 'Pix ***.320.641-**', valor: 200, data_evento: '2026-09-04', tipo: 'despesa' as const },
  { id: '3', contraparte: 'Mix Madeiras', valor: 560, data_evento: '2026-09-03', tipo: 'despesa' as const },
];

describe('agruparSemDono', () => {
  it('agrupa por contraparte normalizada, soma, conta e ordena por total desc', () => {
    const g = agruparSemDono(rows);
    expect(g).toHaveLength(2);
    expect(g[0]).toMatchObject({ chave: 'mix madeiras', total: 560, n: 1, exemploId: '3' });
    expect(g[1]).toMatchObject({ chave: 'pix ***.320.641-**', total: 250, n: 2, exemploId: '1', ids: ['1', '2'] });
  });
  it('contraparte vazia vira "sem descrição"', () => {
    const g = agruparSemDono([{ id: 'x', contraparte: null, valor: 10, data_evento: '2026-09-01', tipo: 'despesa' }]);
    expect(g[0].chave).toBe('sem descrição');
  });
});

describe('montarPerguntas', () => {
  it('uma pergunta por grupo, com botões de tipo apontando pro exemplo', () => {
    const msgs = montarPerguntas(agruparSemDono(rows));
    expect(msgs).toHaveLength(2);
    expect(msgs[1].body).toContain('2 pagamento(s), total R$');
    expect(msgs[1].body.replace(/ /g, ' ')).toContain('R$ 250,00');
    expect(msgs[1].body).toContain('*Pix .320.641-*: 2'); // asteriscos da máscara saem (negrito do WhatsApp)
    expect(msgs[1].buttons.map((b) => b.id)).toEqual(['finfav:mo:1', 'finfav:mat:1', 'finfav:pf:1']);
    expect(msgs[1].buttons.map((b) => b.title)).toEqual(['Mão de obra', 'Material', 'Pessoal (PF)']);
  });
  it('máximo 5 perguntas', () => {
    const muitos = Array.from({ length: 8 }, (_, i) => ({ id: String(i), contraparte: `Loja ${i}`, valor: 10 + i, data_evento: '2026-09-01', tipo: 'despesa' as const }));
    expect(montarPerguntas(agruparSemDono(muitos))).toHaveLength(5);
  });
});

describe('ehSegunda8h', () => {
  it('segunda 11h UTC = 8h BRT → true', () => {
    expect(ehSegunda8h(new Date('2026-09-07T11:30:00Z'))).toBe(true); // 07/09/2026 é segunda
  });
  it('terça 8h BRT → false; segunda 9h BRT → false', () => {
    expect(ehSegunda8h(new Date('2026-09-08T11:30:00Z'))).toBe(false);
    expect(ehSegunda8h(new Date('2026-09-07T12:30:00Z'))).toBe(false);
  });
});

function chainMock(resultado: unknown = { data: [], error: null }) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'insert', 'update', 'eq', 'is', 'in', 'gte', 'lte', 'order', 'limit', 'ilike']) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (res: (v: unknown) => void) => res(resultado);
  return { client: { from: vi.fn(() => chain) } as never };
}

describe('tickResumoSemanal', () => {
  it('fora da janela (terça) não manda nada', async () => {
    const sendText = vi.fn(); const enviarComBotoes = vi.fn();
    const { client } = chainMock();
    await tickResumoSemanal({ client, adminPhone: '5561', sendText, enviarComBotoes, hoje: () => '2026-09-08' }, new Date('2026-09-08T11:00:00Z'));
    expect(sendText).not.toHaveBeenCalled();
    expect(enviarComBotoes).not.toHaveBeenCalled();
  });
  it('segunda 8h: cabeçalho + 1 pergunta por grupo; segundo tick na mesma hora não repete', async () => {
    const sendText = vi.fn().mockResolvedValue(undefined); const enviarComBotoes = vi.fn().mockResolvedValue(undefined);
    const { client } = chainMock({ data: rows, error: null });
    const enviados = new Set<string>();
    const deps = { client, adminPhone: '5561', sendText, enviarComBotoes, hoje: () => '2026-09-07', jaEnviouHoje: (d: string) => enviados.has(d), marcarEnviado: (d: string) => { enviados.add(d); } };
    await tickResumoSemanal(deps, new Date('2026-09-07T11:05:00Z'));
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText.mock.calls[0][1]).toContain('Semana 01/09–07/09: 3 lançamento(s) sem dono');
    expect(enviarComBotoes).toHaveBeenCalledTimes(2);
    expect(enviarComBotoes.mock.calls[0][3]).toBe('Financeiro · semanal');
    await tickResumoSemanal(deps, new Date('2026-09-07T11:50:00Z'));
    expect(sendText).toHaveBeenCalledTimes(1);
  });
  it('sem lançamentos sem dono: não manda nada', async () => {
    const sendText = vi.fn(); const enviarComBotoes = vi.fn();
    const { client } = chainMock({ data: [], error: null });
    await tickResumoSemanal({ client, adminPhone: '5561', sendText, enviarComBotoes, hoje: () => '2026-09-07', jaEnviouHoje: () => false, marcarEnviado: () => {} }, new Date('2026-09-07T11:05:00Z'));
    expect(sendText).not.toHaveBeenCalled();
  });
});

// Mock por tabela: cada chamada a from(tabela) devolve o próximo resultado da fila daquela tabela.
function clientPorTabela(filas: Record<string, unknown[]>) {
  const chamadas: Array<{ tabela: string; ops: Array<[string, unknown[]]> }> = [];
  const client = { from: vi.fn((tabela: string) => {
    const reg = { tabela, ops: [] as Array<[string, unknown[]]> }; chamadas.push(reg);
    const resultado = (filas[tabela] ?? []).shift() ?? { data: null, error: null };
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'insert', 'update', 'eq', 'neq', 'is', 'in', 'or', 'ilike', 'order', 'limit']) {
      chain[m] = vi.fn((...args: unknown[]) => { reg.ops.push([m, args]); return chain; });
    }
    chain.single = vi.fn(async () => resultado);
    chain.maybeSingle = vi.fn(async () => resultado);
    chain.then = (res: (v: unknown) => void) => res(resultado);
    return chain;
  }) };
  return { client: client as never, chamadas };
}

describe('responderFavorecido', () => {
  it('favorecido novo: insere, aplica em todos os iguais (escapando % e _ do ilike)', async () => {
    const { client, chamadas } = clientPorTabela({
      financeiro_lancamentos: [
        { data: { contraparte: 'Pix 100%_x' }, error: null },   // select contraparte
        { data: [{ id: 'a' }, { id: 'b' }], error: null },       // iguais
        { data: null, error: null }, { data: null, error: null }, // 2 updates
      ],
      financeiro_categorias: [{ data: [{ id: 'cat-mo', slug: 'mao_de_obra', nome: 'Mão de obra' }], error: null }],
      financeiro_favorecidos: [
        { data: null, error: null },          // busca por nome → não existe
        { data: { id: 'fav-1' }, error: null }, // insert
      ],
    });
    const n = await responderFavorecido(client, 'mo', 'a');
    expect(n).toBe(2);
    const favs = chamadas.filter((c) => c.tabela === 'financeiro_favorecidos');
    expect(favs[0].ops.find((o) => o[0] === 'eq')?.[1]).toEqual(['nome', 'Pix 100%_x']);
    expect(favs[1].ops[0][0]).toBe('insert');
    expect((favs[1].ops[0][1][0] as Record<string, unknown>).mundo_padrao).toBe('PJ');
    const busca = chamadas.filter((c) => c.tabela === 'financeiro_lancamentos')[1];
    expect(busca.ops.find((o) => o[0] === 'ilike')?.[1]).toEqual(['contraparte', 'Pix 100\\%\\_x']);
    expect(busca.ops.find((o) => o[0] === 'or')?.[1]).toEqual(['favorecido_id.is.null,favorecido_id.eq.fav-1']);
    expect(busca.ops.find((o) => o[0] === 'neq')?.[1]).toEqual(['status', 'apagado']);
    const upd = chamadas.filter((c) => c.tabela === 'financeiro_lancamentos')[2];
    expect((upd.ops[0][1][0] as Record<string, unknown>)).toMatchObject({ favorecido_id: 'fav-1', pf_pj: 'PJ', categoria_id: 'cat-mo' });
  });

  it('toque repetido / troca de tipo: atualiza o favorecido existente, sem inserir', async () => {
    const { client, chamadas } = clientPorTabela({
      financeiro_lancamentos: [
        { data: { contraparte: 'Mix Madeiras' }, error: null },
        { data: [{ id: 'a' }], error: null },
        { data: null, error: null },
      ],
      financeiro_categorias: [{ data: [{ id: 'cat-mat', slug: 'material_eletrico', nome: 'Material' }], error: null }],
      financeiro_favorecidos: [
        { data: { id: 'fav-9' }, error: null }, // já existe
        { data: null, error: null },            // update
      ],
    });
    const n = await responderFavorecido(client, 'mat', 'a');
    expect(n).toBe(1);
    const favs = chamadas.filter((c) => c.tabela === 'financeiro_favorecidos');
    expect(favs).toHaveLength(2);
    expect(favs.some((c) => c.ops.some((o) => o[0] === 'insert'))).toBe(false);
    expect(favs[1].ops[0]).toEqual(['update', [{ categoria_slug: 'material_eletrico', mundo_padrao: 'PJ' }]]);
    expect(favs[1].ops.find((o) => o[0] === 'eq')?.[1]).toEqual(['id', 'fav-9']);
  });

  it('lançamento sem contraparte → 0, sem tocar em favorecidos', async () => {
    const { client, chamadas } = clientPorTabela({ financeiro_lancamentos: [{ data: { contraparte: null }, error: null }] });
    expect(await responderFavorecido(client, 'pf', 'a')).toBe(0);
    expect(chamadas.filter((c) => c.tabela === 'financeiro_favorecidos')).toHaveLength(0);
  });
});
