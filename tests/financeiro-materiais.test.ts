import { describe, it, expect, vi } from 'vitest';
import { parseLancamentos, parseItensNota } from '../src/modules/financeiro/extrator-lancamento.js';
import {
  normalizarMaterial, parseConsultaMaterial, precoUnitario,
  rankearLojas, formatarRanking, gravarComprasDaNota, montarItensParaGravar, montarRankingMaterial,
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
  it('frases comuns que começam com preço/valor SEM preposição → null (não engole)', () => {
    expect(parseConsultaMaterial('valor combinado foi 30 mil')).toBeNull();
    expect(parseConsultaMaterial('preço fechado com o cliente')).toBeNull();
    expect(parseConsultaMaterial('valor alto demais nesse fornecedor')).toBeNull();
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
  it('desempata no mesmo dia pela hora (created_at)', () => {
    const rows = [
      { loja: 'Eletro X', preco_unitario: 90, data_evento: '2026-06-10', created_at: '2026-06-10T09:00:00Z' },
      { loja: 'Eletro X', preco_unitario: 75, data_evento: '2026-06-10', created_at: '2026-06-10T15:00:00Z' },
    ];
    expect(rankearLojas(rows)[0].preco_unitario).toBe(75); // a mais recente do dia
  });
});

describe('materiais: montarRankingMaterial', () => {
  const clientCom = (rows: any[]) => ({
    from: () => ({ select: () => ({ ilike: () => ({ order: () => ({ order: () => ({ limit: () => ({ data: rows, error: null }) }) }) }) }) }),
  } as any);
  it('vazio → null (handler não engole)', async () => {
    expect(await montarRankingMaterial(clientCom([]), 'DPS')).toBeNull();
  });
  it('com registro → string com a loja', async () => {
    const s = await montarRankingMaterial(clientCom([{ loja: 'Eletro X', preco_unitario: 75, data_evento: '2026-06-10', created_at: '2026-06-10T10:00:00Z' }]), 'DPS');
    expect(s).toContain('Eletro X');
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

describe('materiais: montarItensParaGravar (puro)', () => {
  it('usa o array itens quando existe', () => {
    const ex = { itens: [{ material: 'curva 90', quantidade: 2, unidade: 'un', preco_unitario: 7, problema: null }] };
    const r = montarItensParaGravar(ex, 2111.8);
    expect(r).toHaveLength(1);
    expect(r[0].preco_unitario).toBe(7);
  });
  it('cai no material único (texto) quando não há itens', () => {
    const r = montarItensParaGravar({ material: 'cabo 6mm', quantidade: 100, unidade: 'm' }, 400);
    expect(r).toHaveLength(1);
    expect(r[0].material).toBe('cabo 6mm');
    expect(r[0].preco_unitario).toBe(4); // 400/100
  });
  it('sem itens e sem material → []', () => {
    expect(montarItensParaGravar({}, 50)).toEqual([]);
  });
});

describe('materiais: gravarComprasDaNota', () => {
  const lancRow = (over: Record<string, unknown> = {}) => ({
    id: 'l1', tipo: 'despesa', status: 'confirmado', valor: 2111.8, data_evento: '2026-06-19',
    contraparte: 'Itaiaia',
    extracao: { itens: [
      { material: 'curva 90 1 1/4', quantidade: 2, unidade: 'un', preco_unitario: 7, problema: null },
      { material: 'cabo 6mm', quantidade: 100, unidade: 'm', preco_unitario: null, problema: 'não li o preço' },
      { material: 'disjuntor 40A', quantidade: 1, unidade: 'un', preco_unitario: 22, problema: null },
    ] }, ...over,
  });
  it('grava só os itens OK e conta os pulados', async () => {
    (repo.getLancamento as any).mockResolvedValue(lancRow());
    const inserts: any[] = [];
    const client = { from: () => ({ insert: (v: any) => { inserts.push(v); return { error: null }; } }) } as any;
    const r = await gravarComprasDaNota(client, 'l1');
    expect(r).toEqual({ gravados: 2, pulados: 1 });
    expect(inserts.map(i => i.material)).toEqual(['curva 90 1 1/4', 'disjuntor 40A']);
    expect(inserts[0].preco_unitario).toBe(7);
    expect(inserts[0].valor_total).toBe(14); // 7 * 2
    expect(inserts[0].loja).toBe('Itaiaia');
  });
  it('material único (texto legado) grava 1', async () => {
    (repo.getLancamento as any).mockResolvedValue(lancRow({
      valor: 400, contraparte: 'Loja Y', extracao: { material: 'cabo 6mm', quantidade: 100, unidade: 'm' },
    }));
    const inserts: any[] = [];
    const client = { from: () => ({ insert: (v: any) => { inserts.push(v); return { error: null }; } }) } as any;
    const r = await gravarComprasDaNota(client, 'l1');
    expect(r).toEqual({ gravados: 1, pulados: 0 });
    expect(inserts[0].preco_unitario).toBe(4);
  });
  it('não confirmado → {0,0}', async () => {
    (repo.getLancamento as any).mockResolvedValue(lancRow({ status: 'pendente' }));
    const client = { from: () => ({ insert: () => ({ error: null }) }) } as any;
    expect(await gravarComprasDaNota(client, 'l1')).toEqual({ gravados: 0, pulados: 0 });
  });
  it('legado guarda o valor_total EXATO (não derrapa centavo quando não divide redondo)', async () => {
    (repo.getLancamento as any).mockResolvedValue(lancRow({
      valor: 10, contraparte: 'Loja Y', extracao: { material: 'eletroduto', quantidade: 3, unidade: 'un' },
    }));
    const inserts: any[] = [];
    const client = { from: () => ({ insert: (v: any) => { inserts.push(v); return { error: null }; } }) } as any;
    await gravarComprasDaNota(client, 'l1');
    expect(inserts[0].valor_total).toBe(10);       // total exato do lançamento
    expect(inserts[0].preco_unitario).toBe(3.33);  // 10/3 arredondado
  });
});

describe('extrator: texto comum não vira lista de itens', () => {
  it('1 compra por texto → itens []', () => {
    const raw = '```json\n[{"financeiro":true,"tipo":"despesa","valor":80,"material":"DPS","itens":[]}]\n```';
    const e = parseLancamentos(raw)[0];
    expect(e.itens).toEqual([]);
    expect(e.material).toBe('DPS');
  });
});

describe('extrator: itens de nota', () => {
  it('parseLancamentos lê o array itens com preço unitário e problema', () => {
    const raw = '```json\n[{"financeiro":true,"tipo":"despesa","valor":2111.80,"contraparte":"Itaiaia",' +
      '"itens":[{"material":"curva 90 1 1/4","quantidade":2,"unidade":"un","preco_unitario":7,"problema":null},' +
      '{"material":"cabo 6mm","quantidade":100,"unidade":"m","preco_unitario":null,"problema":"não li o preço"}]}]\n```';
    const e = parseLancamentos(raw)[0];
    expect(e.valor).toBe(2111.8);
    expect(e.itens).toHaveLength(2);
    expect(e.itens[0].material).toBe('curva 90 1 1/4');
    expect(e.itens[0].preco_unitario).toBe(7);
    expect(e.itens[1].problema).toBe('não li o preço');
  });
  it('item sem preço OU sem nome ganha "problema" mesmo que o modelo não marque', () => {
    const itens = parseItensNota('```json\n[{"material":"cabo 6mm"},{"preco_unitario":7}]\n```');
    expect(itens[0].problema).toBe('não li o preço'); // tem nome, falta preço
    expect(itens[1].problema).toBe('não li o nome');  // tem preço, falta nome
  });
  it('sem itens → array vazio', () => {
    const e = parseLancamentos('```json\n[{"financeiro":true,"tipo":"despesa","valor":50}]\n```')[0];
    expect(e.itens).toEqual([]);
  });
});
