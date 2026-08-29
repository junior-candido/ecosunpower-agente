import { describe, it, expect, vi } from 'vitest';
import { decidirRegistro, mesclarCorrecao, registrarEFalar } from '../src/modules/financeiro/caixa-entrada.js';
import { dentroDaJanela } from '../src/modules/financeiro/lancamentos-repo.js';

describe('decidirRegistro (puro): nunca trava', () => {
  it('com valor e tipo → registra já (confirmado)', () => {
    expect(decidirRegistro({ valor: 800, tipo: 'despesa' })).toEqual({ acao: 'registrar' });
  });
  it('sem valor → pergunta uma vez, não cria pendente', () => {
    expect(decidirRegistro({ valor: null, tipo: 'despesa' })).toEqual({ acao: 'perguntar_valor' });
  });
  it('valor zero ou negativo → pergunta', () => {
    expect(decidirRegistro({ valor: 0, tipo: 'despesa' })).toEqual({ acao: 'perguntar_valor' });
    expect(decidirRegistro({ valor: -5, tipo: 'entrada' })).toEqual({ acao: 'perguntar_valor' });
  });
  it('sem tipo mas com valor → assume despesa', () => {
    expect(decidirRegistro({ valor: 100, tipo: null })).toEqual({ acao: 'registrar' });
  });
});

const row = (p: Record<string, unknown> = {}) => ({
  id: 'L1', tipo: 'despesa', status: 'confirmado', valor: 800, data_evento: '2026-09-01', competencia: '2026-09',
  contraparte: 'Shell', descricao: 'gasolina', categoria_id: 'cat-1', pf_pj: 'PJ', lead_id: null, conta_id: null,
  tem_nota: true, storage_path: null, extracao: { categoria_slug: 'combustivel', obra_ref: 'Superbom', itens: [] },
  created_at: '', banco_conta: 'desconhecido', favorecido_id: null, confianca: 'media', arquivo_id: null, ...p,
}) as never;

describe('mesclarCorrecao (puro): só o que o admin disse muda', () => {
  it('"era 350" mantém contraparte, data, categoria e obra do original', () => {
    const m = mesclarCorrecao(row(), { valor: 350 });
    expect(m).toMatchObject({ intencao: 'lancar', tipo: 'despesa', valor: 350, data: '2026-09-01', contraparte: 'Shell', categoria_slug: 'combustivel', obra_ref: 'Superbom', pf_pj: 'PJ', relacionado: true });
  });
  it('categoria "outros" da correção NÃO sobrescreve a do original; PF dito vale', () => {
    const m = mesclarCorrecao(row(), { categoria_slug: 'outros', pf_pj: 'PF' });
    expect(m.categoria_slug).toBe('combustivel');
    expect(m.pf_pj).toBe('PF');
  });
});

// Mock encadeável do Supabase: todo método devolve o próprio objeto; o await final resolve vazio.
function chainMock() {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'insert', 'update', 'eq', 'neq', 'is', 'in', 'gte', 'lt', 'lte', 'ilike', 'contains', 'order', 'limit', 'maybeSingle', 'single']) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (res: (v: unknown) => void) => res({ data: null, error: null });
  const from = vi.fn(() => chain);
  return { from, chain };
}

describe('registrarEFalar: sem valor pergunta UMA vez e não grava nada', () => {
  it('manda texto pedindo valor; nenhum insert', async () => {
    const { from, chain } = chainMock();
    const sendText = vi.fn(async () => undefined);
    const sendWithButtons = vi.fn(async () => undefined);
    const deps = { supabase: { from } as never, anthropic: {} as never, sendText, sendWithButtons };
    const e = { financeiro: true, intencao: 'lancar', tipo: 'despesa', valor: null, data: null, contraparte: 'Shell', categoria_slug: null, pf_pj: null, obra_ref: null, descricao: null, material: null, quantidade: null, unidade: null, itens: [], campos_faltando: ['valor'], relacionado: null, tem_nota: true } as const;
    const id = await registrarEFalar(deps, '5561', e as never, null);
    expect(id).toBeNull();
    expect(sendText).toHaveBeenCalledTimes(1);
    expect((sendText.mock.calls[0] as unknown[])[1]).toContain('valor');
    expect(chain.insert).not.toHaveBeenCalled();
    expect(sendWithButtons).not.toHaveBeenCalled();
  });
});

describe('dentroDaJanela (puro): janela conta a partir do PEDIDO da Eva', () => {
  const agora = new Date('2026-09-02T09:00:00Z');
  const min = (n: number) => new Date(agora.getTime() - n * 60_000).toISOString();
  it('aguardando_desde há 5 min → dentro', () => {
    expect(dentroDaJanela({ aguardando: true, aguardando_desde: min(5) }, min(60 * 15), agora)).toBe(true);
  });
  it('aguardando_desde há 15 min → fora', () => {
    expect(dentroDaJanela({ aguardando: true, aguardando_desde: min(15) }, min(1), agora)).toBe(false);
  });
  it('sem aguardando_desde → cai no created_at', () => {
    expect(dentroDaJanela({ aguardando: true }, min(3), agora)).toBe(true);
    expect(dentroDaJanela(null, min(30), agora)).toBe(false);
  });
});
