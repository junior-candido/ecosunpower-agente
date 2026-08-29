import { describe, it, expect, vi } from 'vitest';
import { decidirRegistro, mesclarCorrecao, registrarEFalar, combinarValorSolto, proximoEraConfirmado, substituirPorCorrecao } from '../src/modules/financeiro/caixa-entrada.js';
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

describe('combinarValorSolto (puro): número solto completa o registro sem valor', () => {
  const extracao = { financeiro: true, intencao: 'lancar', tipo: 'despesa', valor: null, data: null, contraparte: 'Shell', categoria_slug: 'combustivel', pf_pj: null, obra_ref: null, descricao: 'gasolina', material: null, quantidade: null, unidade: null, itens: [], campos_faltando: ['valor'], relacionado: null, tem_nota: true } as const;
  const agora = 1_000_000_000;
  const guardado = { extracao: extracao as never, midia: null, desde: agora - 2 * 60_000 };
  it('"380" → mescla valor 380 e some "valor" de campos_faltando', () => {
    const r = combinarValorSolto(guardado, '380', agora);
    expect(r).toMatchObject({ valor: 380, contraparte: 'Shell', descricao: 'gasolina', campos_faltando: [] });
  });
  it('"R$ 1.234,56" → 1234.56', () => {
    expect(combinarValorSolto(guardado, 'R$ 1.234,56', agora)?.valor).toBe(1234.56);
  });
  it('expirado (11 min) → null; texto que não é valor → null', () => {
    expect(combinarValorSolto({ ...guardado, desde: agora - 11 * 60_000 }, '380', agora)).toBeNull();
    expect(combinarValorSolto(guardado, 'gasolina no shell', agora)).toBeNull();
  });
});

describe('proximoEraConfirmado (puro): duplo toque em Corrigir não rebaixa', () => {
  it('confirmado agora → true', () => { expect(proximoEraConfirmado('confirmado', null)).toBe(true); });
  it('já pendente mas marcado era_confirmado → continua true', () => {
    expect(proximoEraConfirmado('pendente', { aguardando: true, era_confirmado: true })).toBe(true);
  });
  it('pendente legado sem marca → false', () => { expect(proximoEraConfirmado('pendente', { aguardando: true })).toBe(false); });
});

describe('substituirPorCorrecao: se o corrigido não entra, o original volta (nunca some)', () => {
  it('insert falha → update apagado, depois update confirmado com descrição original; erro propaga', async () => {
    const updates: Array<Record<string, unknown>> = [];
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'insert', 'eq', 'neq', 'is', 'in', 'gte', 'lt', 'lte', 'ilike', 'contains', 'order', 'limit', 'maybeSingle']) {
      chain[m] = vi.fn(() => chain);
    }
    chain.update = vi.fn((p: Record<string, unknown>) => { updates.push(p); return chain; });
    chain.single = vi.fn(() => ({ then: (res: (v: unknown) => void) => res({ data: null, error: { message: 'boom' } }) }));
    chain.then = (res: (v: unknown) => void) => res({ data: [], error: null });
    const deps = { supabase: { from: vi.fn(() => chain) } as never, anthropic: {} as never, sendText: vi.fn(async () => undefined), sendWithButtons: vi.fn(async () => undefined) };
    const alvo = row({ descricao: 'gasolina' }) as never;
    const corrigido = mesclarCorrecao(alvo, { valor: 350 });
    await expect(substituirPorCorrecao(deps, '5561', alvo, corrigido)).rejects.toThrow('boom');
    // 1º update = soft-apagar do original (com sufixo); último = volta pra confirmado.
    // (No meio pode haver o GC preguiçoso de pendentes — não é deste lançamento.)
    expect(updates[0]).toMatchObject({ status: 'apagado' });
    expect(String(updates[0].descricao)).toContain('[substituído por correção]');
    expect(updates[updates.length - 1].status).toBe('confirmado');
    const restaura = updates.find((u) => u.status === 'confirmado')!;
    expect(restaura.descricao).toBe('gasolina');
    expect(deps.sendText).toHaveBeenCalledTimes(1);
    expect((deps.sendText.mock.calls[0] as unknown[])[1]).toContain('original continua');
  });
});
