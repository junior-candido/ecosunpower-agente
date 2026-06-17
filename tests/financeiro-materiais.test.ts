import { describe, it, expect, vi } from 'vitest';
import { parseLancamentos } from '../src/modules/financeiro/extrator-lancamento.js';
import {
  normalizarMaterial, parseConsultaMaterial, precoUnitario,
  rankearLojas, formatarRanking, gravarCompraMaterialSeHouver,
} from '../src/modules/financeiro/materiais.js';

vi.mock('../src/modules/financeiro/lancamentos-repo.js', async (orig) => ({
  ...(await orig() as object),
  getLancamento: vi.fn(),
}));
import * as repo from '../src/modules/financeiro/lancamentos-repo.js';

describe('extrator: campos de material', () => {
  it('extrai material, quantidade e unidade', () => {
    const raw = '```json\n[{"financeiro":true,"intencao":"lancar","tipo":"despesa","valor":400,"contraparte":"Loja Y","material":"cabo 6mm","quantidade":100,"unidade":"m"}]\n```';
    const e = parseLancamentos(raw)[0];
    expect(e.material).toBe('cabo 6mm');
    expect(e.quantidade).toBe(100);
    expect(e.unidade).toBe('m');
  });
  it('sem material → null/null/null', () => {
    const raw = '```json\n[{"financeiro":true,"tipo":"despesa","valor":50,"contraparte":"posto"}]\n```';
    const e = parseLancamentos(raw)[0];
    expect(e.material).toBeNull();
    expect(e.quantidade).toBeNull();
    expect(e.unidade).toBeNull();
  });
});

describe('materiais: normalizarMaterial', () => {
  it('lowercase, trim, sem acento, espaços colapsados', () => {
    expect(normalizarMaterial('  DPS  40A ')).toBe('dps 40a');
    expect(normalizarMaterial('Disjuntôr')).toBe('disjuntor');
  });
});

describe('materiais: parseConsultaMaterial', () => {
  it('reconhece os padrões e extrai o termo', () => {
    expect(parseConsultaMaterial('preço do DPS')).toBe('DPS');
    expect(parseConsultaMaterial('preco do dps')).toBe('dps');
    expect(parseConsultaMaterial('onde tá mais barato o cabo 6mm')).toBe('cabo 6mm');
    expect(parseConsultaMaterial('onde ta mais barato cabo 6mm')).toBe('cabo 6mm');
    expect(parseConsultaMaterial('quanto custa o disjuntor 40A')).toBe('disjuntor 40A');
    expect(parseConsultaMaterial('qual o preço do DPS?')).toBe('DPS');
  });
  it('não-consulta → null', () => {
    expect(parseConsultaMaterial('gastei 380 no posto')).toBeNull();
    expect(parseConsultaMaterial('comprei DPS por 80')).toBeNull();
    expect(parseConsultaMaterial('preço')).toBeNull();
  });
});

describe('materiais: precoUnitario', () => {
  it('valor / quantidade', () => expect(precoUnitario(400, 100)).toBe(4));
  it('quantidade null → conta 1', () => expect(precoUnitario(80, null)).toBe(80));
  it('quantidade 0 → conta 1', () => expect(precoUnitario(80, 0)).toBe(80));
});

describe('materiais: rankearLojas', () => {
  it('por loja pega a mais recente e ordena por preço', () => {
    const rows = [
      { loja: 'Eletro X', preco_unitario: 75, data_evento: '2026-06-10' },
      { loja: 'Loja Y', preco_unitario: 82, data_evento: '2026-06-02' },
      { loja: 'Eletro X', preco_unitario: 90, data_evento: '2026-05-01' }, // antiga, ignora
    ];
    const r = rankearLojas(rows);
    expect(r.map(x => x.loja)).toEqual(['Eletro X', 'Loja Y']);
    expect(r[0].preco_unitario).toBe(75);
  });
});

describe('materiais: formatarRanking', () => {
  it('vazio → mensagem amigável', () => {
    expect(formatarRanking('DPS', [])).toContain('Ainda não tenho preço');
  });
  it('lista numerada com loja, preço, data', () => {
    const s = formatarRanking('DPS', [{ loja: 'Eletro X', preco_unitario: 75, data_evento: '2026-06-10' }]);
    expect(s).toContain('1º');
    expect(s).toContain('Eletro X');
    expect(s).toContain('10/06');
  });
});

describe('materiais: gravarCompraMaterialSeHouver', () => {
  const lancRow = (over: Record<string, unknown> = {}) => ({
    id: 'l1', tipo: 'despesa', status: 'confirmado', valor: 400, data_evento: '2026-06-17',
    contraparte: 'Loja Y', extracao: { material: 'cabo 6mm', quantidade: 100, unidade: 'm' }, ...over,
  });
  it('grava com preço unitário certo', async () => {
    (repo.getLancamento as any).mockResolvedValue(lancRow());
    const inserts: any[] = [];
    const client = { from: () => ({ insert: (v: any) => { inserts.push(v); return { error: null }; } }) } as any;
    const ok = await gravarCompraMaterialSeHouver(client, 'l1');
    expect(ok).toBe(true);
    expect(inserts[0].preco_unitario).toBe(4);
    expect(inserts[0].material_norm).toBe('cabo 6mm');
    expect(inserts[0].loja).toBe('Loja Y');
  });
  it('sem material → no-op (false)', async () => {
    (repo.getLancamento as any).mockResolvedValue(lancRow({ extracao: { material: null } }));
    const client = { from: () => ({ insert: () => ({ error: null }) }) } as any;
    expect(await gravarCompraMaterialSeHouver(client, 'l1')).toBe(false);
  });
  it('não confirmado → no-op', async () => {
    (repo.getLancamento as any).mockResolvedValue(lancRow({ status: 'pendente' }));
    const client = { from: () => ({ insert: () => ({ error: null }) }) } as any;
    expect(await gravarCompraMaterialSeHouver(client, 'l1')).toBe(false);
  });
});
