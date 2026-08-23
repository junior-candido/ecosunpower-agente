// tests/sombra.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { SombraService, makeSombraHandler, cargaFuturaDe, escapeIlike, lerEnergyData } from '../src/modules/vendas/sombra.js';
import type { ItemPreco } from '../src/modules/vendas/tabela-precos.js';

type Row = Record<string, any>;

interface OpcoesFake {
  /** Réplica atrasada: o 1º select de versão depois de uma gravação enxerga o estado ANTERIOR. */
  versaoStaleUmaVez?: boolean;
  /** Todo insert em propostas_versoes bate na UNIQUE (exaustão do retry). */
  sempreConflito?: boolean;
  /** Erro devolvido pelo insert em propostas_versoes (sem `code` = erro que não é corrida). */
  erroInsert?: { code?: string; message: string };
  /** Tabelas cujos SELECTs devolvem `{ error }` em vez de linhas. */
  erroSelect?: string[];
}

/**
 * Supabase de mentira. Duas coisas importam pro que está sendo testado aqui:
 * 1) `insert` respeita a UNIQUE (lead_id, versao) devolvendo 23505, como o Postgres;
 * 2) grava `JSON.parse(JSON.stringify(row))` — chave com `undefined` NÃO chega no banco.
 */
function fakeDb(op: OpcoesFake = {}) {
  const tabelas: Record<string, Row[]> = { leads: [], propostas_versoes: [] };
  const ilikes: string[] = [];
  let insertsVersoes = 0;
  let stalesRestantes = op.versaoStaleUmaVez ? 1 : 0;

  const from = (t: string) => {
    const filtros: Array<(r: Row) => boolean> = [];
    let ordem: { k: string; asc: boolean } | null = null;
    let limite = Infinity;
    const rows = () => {
      let base = tabelas[t];
      if (t === 'propostas_versoes' && stalesRestantes > 0 && base.length) { stalesRestantes--; base = base.slice(0, -1); }
      let r = base.filter(x => filtros.every(f => f(x)));
      if (ordem) r = [...r].sort((a, b) => (a[ordem!.k] > b[ordem!.k] ? 1 : -1) * (ordem!.asc ? 1 : -1));
      return r.slice(0, limite);
    };
    const erro = () => (op.erroSelect?.includes(t) ? { message: `select em ${t} caiu` } : null);
    const q: any = {
      select: () => q,
      eq: (k: string, v: any) => { filtros.push(r => r[k] === v); return q; },
      ilike: (k: string, v: string) => {
        ilikes.push(v);
        // Desfaz o que o escapeIlike fez pra comparar como o Postgres compararia.
        const s = v.replace(/^%/, '').replace(/%$/, '').replace(/\\(.)/g, '$1').toLowerCase();
        filtros.push(r => String(r[k] ?? '').toLowerCase().includes(s));
        return q;
      },
      is: (k: string, v: any) => { filtros.push(r => r[k] == v); return q; },
      order: (k: string, o?: { ascending?: boolean }) => { ordem = { k, asc: o?.ascending !== false }; return q; },
      limit: (n: number) => { limite = n; return q; },
      maybeSingle: async () => { const e = erro(); return e ? { data: null, error: e } : { data: rows()[0] ?? null, error: null }; },
      insert: async (row: Row) => {
        if (t === 'propostas_versoes') {
          insertsVersoes++;
          if (op.erroInsert) return { data: null, error: op.erroInsert };
          if (op.sempreConflito) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
          if (tabelas[t].some(r => r.lead_id === row.lead_id && r.versao === row.versao)) {
            return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "propostas_versoes_lead_id_versao_key"' } };
          }
        }
        tabelas[t].push(JSON.parse(JSON.stringify(row)));
        return { data: null, error: null };
      },
      then: (res: any) => { const e = erro(); return Promise.resolve(e ? { data: null, error: e } : { data: rows(), error: null }).then(res); },
    };
    return q;
  };
  return { tabelas, ilikes, client: { from }, insertsVersoes: () => insertsVersoes };
}

const T0 = Date.UTC(2026, 7, 24, 15, 0, 0);
const item = (p: Partial<ItemPreco>): ItemPreco => ({ tipo: 'modulo', marca: 'X', modelo: 'X', potenciaW: null, modulosPorUnidade: null, precoUnitario: 0, unidade: 'un', fonte: 'junior', atualizadoEmMs: T0, ...p });
const tabelaOk = (): ItemPreco[] => [
  item({ tipo: 'modulo', marca: 'Risen', modelo: '715', potenciaW: 715, precoUnitario: 980 }),
  item({ tipo: 'modulo', marca: 'JA', modelo: '625', potenciaW: 625, precoUnitario: 900 }),
  item({ tipo: 'micro', marca: 'Hoymiles', modelo: 'HMS-2000-4T', modulosPorUnidade: 4, precoUnitario: 1450 }),
  item({ tipo: 'estrutura', marca: 'ceramico', modelo: 'ceramico', precoUnitario: 95, unidade: 'modulo' }),
  item({ tipo: 'cabos_protecao', marca: 'geral', modelo: 'geral', precoUnitario: 420, unidade: 'kwp' }),
];

const mk = (db: ReturnType<typeof fakeDb>, tabela: ItemPreco[] = tabelaOk()) => {
  const sendText = vi.fn().mockResolvedValue(undefined);
  const registrarEvento = vi.fn().mockResolvedValue(undefined);
  const svc = new SombraService({
    client: db.client as any, tabela: { itensAtivos: vi.fn().mockResolvedValue(tabela) } as any,
    sendText, registrarEvento, adminPhone: '5561999990000',
  });
  return { svc, sendText, registrarEvento };
};

/** Cala e captura o console.error (os caminhos de erro logam de propósito). */
const calarErro = () => vi.spyOn(console, 'error').mockImplementation(() => {});
afterEach(() => vi.restoreAllMocks());

describe('cargaFuturaDe', () => {
  it('extrai kWh de texto livre do future_demand', () => {
    expect(cargaFuturaDe('vou colocar ar e piscina, uns 900 kwh')).toBe(900);
    expect(cargaFuturaDe('1.200kWh/mês')).toBe(1200);
    expect(cargaFuturaDe('carro elétrico')).toBeNull();
    expect(cargaFuturaDe(null)).toBeNull();
  });

  it('aceita decimal pt-BR e ponto de calculadora', () => {
    expect(cargaFuturaDe('uns 900,5 kwh')).toBe(900.5);
    expect(cargaFuturaDe('1.050,5 kWh/mês')).toBe(1050.5);
    expect(cargaFuturaDe('90.5 kwh')).toBe(90.5);
  });
});

describe('escapeIlike', () => {
  it('escapa % e _ do texto que o Junior digitou (curingas do ILIKE)', () => {
    expect(escapeIlike('50%')).toBe('50\\%');
    expect(escapeIlike('joel_lima')).toBe('joel\\_lima');
    expect(escapeIlike('Joel Lima')).toBe('Joel Lima');
  });

  it('escapa a barra invertida (que é o próprio escape) e tira o asterisco', () => {
    expect(escapeIlike('c:\\temp')).toBe('c:\\\\temp');
    expect(escapeIlike('jo*el')).toBe('joel');
    expect(escapeIlike('\\%')).toBe('\\\\\\%');
  });
});

describe('lerEnergyData', () => {
  it('aceita objeto, TEXTO com JSON e devolve {} pro resto', () => {
    expect(lerEnergyData({ consumption_kwh: 734 })).toEqual({ consumption_kwh: 734 });
    expect(lerEnergyData('{"consumption_kwh":734}')).toEqual({ consumption_kwh: 734 });
    expect(lerEnergyData('conta de luz')).toEqual({});
    expect(lerEnergyData(null)).toEqual({});
    expect(lerEnergyData('[1,2]')).toEqual({});
  });
});

describe('SombraService.rodarParaLead', () => {
  it('lead qualificado: grava versão 1, loga no Elo e manda card ao Junior', async () => {
    const db = fakeDb();
    db.tabelas.leads.push({ id: 'L1', name: 'Joel Lima', city: 'Lago Oeste', company_id: 'C1', energy_data: { consumption_kwh: 734 }, future_demand: null });
    const { svc, sendText, registrarEvento } = mk(db);
    const r = await svc.rodarParaLead({ leadId: 'L1', agoraMs: T0, origem: 'teste' });
    expect(r).toMatchObject({ ok: true, versao: 1 });
    expect(db.tabelas.propostas_versoes).toHaveLength(1);
    expect(db.tabelas.propostas_versoes[0]).toMatchObject({ lead_id: 'L1', company_id: 'C1', versao: 1, autor: 'eva', sombra: true });
    expect(db.tabelas.propostas_versoes[0].params_json).toMatchObject({ consumoAlvoKwh: 734, telhado: 'ceramico', telhadoAssumido: true, faixa: 'autonoma', origem: 'teste' });
    expect(db.tabelas.propostas_versoes[0].resultado_json.ok).toBe(true);
    expect(registrarEvento).toHaveBeenCalledWith(db.client, expect.objectContaining({
      tipo: 'comercial:sombra_gerada', departamento: 'comercial', leadId: 'L1', companyId: 'C1',
    }));
    expect(sendText).toHaveBeenCalledWith('5561999990000', expect.stringContaining('🕶️ SOMBRA v1 — Joel Lima (Lago Oeste)'));
  });

  it('payload do Elo leva os totais como objeto {A, B}', async () => {
    const db = fakeDb();
    db.tabelas.leads.push({ id: 'L1', name: 'Joel', energy_data: { consumption_kwh: 734 } });
    const { svc, registrarEvento } = mk(db);
    await svc.rodarParaLead({ leadId: 'L1', agoraMs: T0, origem: 'x' });
    const { totais } = registrarEvento.mock.calls[0][1].payload;
    expect(Array.isArray(totais)).toBe(false);
    expect(Object.keys(totais).sort()).toEqual(['A', 'B']);
    expect(typeof totais.A).toBe('number');
    expect(typeof totais.B).toBe('number');
  });

  it('segunda rodada vira v2', async () => {
    const db = fakeDb();
    db.tabelas.leads.push({ id: 'L1', name: 'Joel', energy_data: { consumption_kwh: 734 } });
    const { svc } = mk(db);
    await svc.rodarParaLead({ leadId: 'L1', agoraMs: T0, origem: 'a' });
    const r = await svc.rodarParaLead({ leadId: 'L1', agoraMs: T0 + 1, origem: 'b' });
    expect(r).toMatchObject({ ok: true, versao: 2 });
  });

  it('carga futura maior que a fatura manda no consumo-alvo', async () => {
    const db = fakeDb();
    db.tabelas.leads.push({ id: 'L1', name: 'Ana', energy_data: { consumption_kwh: 400 }, future_demand: 'piscina, uns 800 kwh' });
    const { svc, sendText } = mk(db);
    await svc.rodarParaLead({ leadId: 'L1', agoraMs: T0, origem: 'x' });
    expect(sendText.mock.calls[0][1]).toContain('800 kWh (fatura 400 · manda a carga futura 800)');
  });

  it('sem consumo → card de erro, sem versão', async () => {
    const db = fakeDb();
    db.tabelas.leads.push({ id: 'L1', name: 'Zé', energy_data: {} });
    const { svc, sendText } = mk(db);
    const r = await svc.rodarParaLead({ leadId: 'L1', agoraMs: T0, origem: 'x' });
    expect(r).toEqual({ ok: false, erro: 'sem_dados' });
    expect(db.tabelas.propostas_versoes).toHaveLength(0);
    expect(sendText.mock.calls[0][1]).toContain('sem consumo');
  });

  it('abaixo de 500 → fluxo atual, sem versão e sem card no gancho automático (só no comando)', async () => {
    const db = fakeDb();
    db.tabelas.leads.push({ id: 'L1', name: 'Zé', energy_data: { consumption_kwh: 300 } });
    const { svc, sendText } = mk(db);
    expect(await svc.rodarParaLead({ leadId: 'L1', agoraMs: T0, origem: 'auto', silencioso: true })).toEqual({ ok: false, erro: 'fluxo_atual' });
    expect(sendText).not.toHaveBeenCalled();
    await svc.rodarParaLead({ leadId: 'L1', agoraMs: T0, origem: 'comando' });
    expect(sendText.mock.calls[0][1]).toContain('abaixo de 500');
  });

  it('tabela incompleta → card de erro com o que falta', async () => {
    const db = fakeDb();
    db.tabelas.leads.push({ id: 'L1', name: 'Joel', energy_data: { consumption_kwh: 734 } });
    const { svc, sendText } = mk(db, []);
    const r = await svc.rodarParaLead({ leadId: 'L1', agoraMs: T0, origem: 'x' });
    expect(r).toMatchObject({ ok: false, erro: 'tabela_incompleta' });
    expect(sendText.mock.calls[0][1]).toContain('falta na tabela: módulo, micro, estrutura ceramico, cabos');
  });

  it('nunca lança', async () => {
    calarErro();
    const svc = new SombraService({ client: { from: () => { throw new Error('boom'); } } as any, tabela: {} as any, sendText: vi.fn(), registrarEvento: vi.fn(), adminPhone: 'x' });
    expect(await svc.rodarParaLead({ leadId: 'L1', agoraMs: T0, origem: 'x' })).toEqual({ ok: false, erro: 'interno' });
  });

  it('card que não sai (sendText caiu) não derruba a rodada já gravada', async () => {
    calarErro();
    const db = fakeDb();
    db.tabelas.leads.push({ id: 'L1', name: 'Joel', energy_data: { consumption_kwh: 734 } });
    const { svc } = mk(db);
    (svc as any).deps.sendText = vi.fn().mockRejectedValue(new Error('zap fora do ar'));
    const r = await svc.rodarParaLead({ leadId: 'L1', agoraMs: T0, origem: 'x' });
    expect(r).toMatchObject({ ok: true, versao: 1 });
    expect(db.tabelas.propostas_versoes).toHaveLength(1);
  });
});

// (1) consumo escrito por gente: "734,5" e "1.050" têm que virar 734,5 e 1050 — nunca 734 e 1,05.
describe('SombraService — consumo em pt-BR', () => {
  it('"734,5" vira 734,5 no consumo-alvo (Number() daria NaN)', async () => {
    const db = fakeDb();
    db.tabelas.leads.push({ id: 'L1', name: 'Joel', energy_data: { consumption_kwh: '734,5' } });
    const { svc } = mk(db);
    const r = await svc.rodarParaLead({ leadId: 'L1', agoraMs: T0, origem: 'x' });
    expect(r).toMatchObject({ ok: true });
    expect(db.tabelas.propostas_versoes[0].params_json).toMatchObject({ consumoAlvoKwh: 734.5, consumoFatura: 734.5 });
  });

  it('"1.050" é mil e cinquenta (faixa autônoma), não 1,05 (fluxo atual)', async () => {
    const db = fakeDb();
    db.tabelas.leads.push({ id: 'L1', name: 'Joel', energy_data: { consumption_kwh: '1.050' } });
    const { svc } = mk(db);
    const r = await svc.rodarParaLead({ leadId: 'L1', agoraMs: T0, origem: 'x' });
    expect(r).toMatchObject({ ok: true });
    expect(db.tabelas.propostas_versoes[0].params_json).toMatchObject({ consumoAlvoKwh: 1050, faixa: 'autonoma' });
  });

  it('energy_data como TEXTO com JSON dentro ainda precifica', async () => {
    const db = fakeDb();
    db.tabelas.leads.push({ id: 'L1', name: 'Joel', energy_data: '{"consumption_kwh":"1.050"}' });
    const { svc } = mk(db);
    const r = await svc.rodarParaLead({ leadId: 'L1', agoraMs: T0, origem: 'x' });
    expect(r).toMatchObject({ ok: true });
    expect(db.tabelas.propostas_versoes[0].params_json).toMatchObject({ consumoAlvoKwh: 1050 });
  });

  it('energy_data como texto qualquer → sem_dados (não explode)', async () => {
    const db = fakeDb();
    db.tabelas.leads.push({ id: 'L1', name: 'Joel', energy_data: 'conta de luz da CEB' });
    const { svc } = mk(db);
    expect(await svc.rodarParaLead({ leadId: 'L1', agoraMs: T0, origem: 'x' })).toEqual({ ok: false, erro: 'sem_dados' });
  });

  it('consumo zero ou negativo não conta como consumo', async () => {
    const db = fakeDb();
    db.tabelas.leads.push({ id: 'L1', name: 'Joel', energy_data: { consumption_kwh: '0' } });
    const { svc } = mk(db);
    expect(await svc.rodarParaLead({ leadId: 'L1', agoraMs: T0, origem: 'x' })).toEqual({ ok: false, erro: 'sem_dados' });
  });
});

// (T1/T4) corrida de versão: a UNIQUE (lead_id, versao) é a dona da verdade.
describe('SombraService — corrida na versão', () => {
  it('T1: select atrasado calcula v1 de novo, a UNIQUE recusa e o retry grava v2', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const db = fakeDb({ versaoStaleUmaVez: true });
    db.tabelas.leads.push({ id: 'L1', name: 'Joel', energy_data: { consumption_kwh: 734 } });
    const { svc } = mk(db);
    const r1 = await svc.rodarParaLead({ leadId: 'L1', agoraMs: T0, origem: 'a' });
    const r2 = await svc.rodarParaLead({ leadId: 'L1', agoraMs: T0 + 1, origem: 'b' });
    expect(r1).toMatchObject({ ok: true, versao: 1 });
    expect(r2).toMatchObject({ ok: true, versao: 2 });
    expect(db.tabelas.propostas_versoes.map(r => r.versao)).toEqual([1, 2]);
    expect(db.insertsVersoes()).toBe(3); // 1 da v1 + a recusada + a que gravou v2
    expect(aviso).toHaveBeenCalled();
  });

  it('conflito que não passa → interno, com no máximo 3 tentativas', async () => {
    calarErro();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const db = fakeDb({ sempreConflito: true });
    db.tabelas.leads.push({ id: 'L1', name: 'Joel', energy_data: { consumption_kwh: 734 } });
    const { svc, sendText, registrarEvento } = mk(db);
    expect(await svc.rodarParaLead({ leadId: 'L1', agoraMs: T0, origem: 'x' })).toEqual({ ok: false, erro: 'interno' });
    expect(db.insertsVersoes()).toBe(3);
    expect(sendText).not.toHaveBeenCalled();
    expect(registrarEvento).not.toHaveBeenCalled();
  });

  it('erro de gravação que NÃO é 23505 → interno na hora, sem retry e sem card', async () => {
    const err = calarErro();
    const db = fakeDb({ erroInsert: { message: 'boom' } });
    db.tabelas.leads.push({ id: 'L1', name: 'Joel', energy_data: { consumption_kwh: 734 } });
    const { svc, sendText, registrarEvento } = mk(db);
    const r = await svc.rodarParaLead({ leadId: 'L1', agoraMs: T0, origem: 'x' });
    expect(r).toEqual({ ok: false, erro: 'interno' });
    expect(db.tabelas.propostas_versoes).toHaveLength(0);
    expect(db.insertsVersoes()).toBe(1);
    expect(sendText).not.toHaveBeenCalled();
    expect(registrarEvento).not.toHaveBeenCalled();
    expect(err.mock.calls[0][0]).toContain('[sombra]');
  });
});

// (T2) lead sem empresa: a chave não pode ir com `undefined` pro banco.
describe('SombraService — lead sem company_id', () => {
  it('T2: linha gravada NÃO tem a chave company_id e o Elo recebe companyId null', async () => {
    const db = fakeDb();
    db.tabelas.leads.push({ id: 'L1', name: 'Joel', energy_data: { consumption_kwh: 734 } });
    const { svc, registrarEvento } = mk(db);
    await svc.rodarParaLead({ leadId: 'L1', agoraMs: T0, origem: 'x' });
    expect('company_id' in db.tabelas.propostas_versoes[0]).toBe(false);
    expect(registrarEvento.mock.calls[0][1]).toMatchObject({ companyId: null });
  });
});

// (T5) o banco pode devolver {error}: ninguém pode assumir que leu.
describe('SombraService — erro nos selects', () => {
  it('T5: select do lead com erro → interno, sem card e sem gravar', async () => {
    const err = calarErro();
    const db = fakeDb({ erroSelect: ['leads'] });
    db.tabelas.leads.push({ id: 'L1', name: 'Joel', energy_data: { consumption_kwh: 734 } });
    const { svc, sendText, registrarEvento } = mk(db);
    expect(await svc.rodarParaLead({ leadId: 'L1', agoraMs: T0, origem: 'x' })).toEqual({ ok: false, erro: 'interno' });
    expect(db.tabelas.propostas_versoes).toHaveLength(0);
    expect(sendText).not.toHaveBeenCalled();
    expect(registrarEvento).not.toHaveBeenCalled();
    expect(err.mock.calls[0][0]).toContain('[sombra]');
  });

  it('select da última versão com erro → interno', async () => {
    calarErro();
    const db = fakeDb({ erroSelect: ['propostas_versoes'] });
    db.tabelas.leads.push({ id: 'L1', name: 'Joel', energy_data: { consumption_kwh: 734 } });
    const { svc, sendText } = mk(db);
    expect(await svc.rodarParaLead({ leadId: 'L1', agoraMs: T0, origem: 'x' })).toEqual({ ok: false, erro: 'interno' });
    expect(sendText).not.toHaveBeenCalled();
  });
});

describe('SombraService.rodarSeNuncaRodou', () => {
  it('roda só na primeira vez', async () => {
    const db = fakeDb();
    db.tabelas.leads.push({ id: 'L1', name: 'Joel', energy_data: { consumption_kwh: 734 } });
    const { svc, sendText } = mk(db);
    await svc.rodarSeNuncaRodou('L1', T0);
    await svc.rodarSeNuncaRodou('L1', T0 + 1);
    expect(db.tabelas.propostas_versoes).toHaveLength(1);
    expect(sendText).toHaveBeenCalledTimes(1);
  });

  it('erro no select de versões existentes → NÃO roda (não arrisca duplicar)', async () => {
    const err = calarErro();
    const db = fakeDb({ erroSelect: ['propostas_versoes'] });
    db.tabelas.leads.push({ id: 'L1', name: 'Joel', energy_data: { consumption_kwh: 734 } });
    const { svc, sendText, registrarEvento } = mk(db);
    await svc.rodarSeNuncaRodou('L1', T0);
    expect(db.tabelas.propostas_versoes).toHaveLength(0);
    expect(sendText).not.toHaveBeenCalled();
    expect(registrarEvento).not.toHaveBeenCalled();
    expect(err.mock.calls[0][0]).toContain('[sombra]');
  });
});

describe('makeSombraHandler', () => {
  const prep = (admin = true, op: OpcoesFake = {}) => {
    const db = fakeDb(op);
    db.tabelas.leads.push({ id: 'L1', name: 'Joel Lima', energy_data: { consumption_kwh: 734 }, created_at: '2026-08-01' });
    db.tabelas.leads.push({ id: 'L2', name: 'Joelma', energy_data: { consumption_kwh: 600 }, created_at: '2026-08-10' });
    const { svc, sendText } = mk(db);
    const h = makeSombraHandler({ svc, client: db.client as any, isAdminPhone: () => admin, sendText, agoraMs: () => T0 });
    return { h, sendText, db };
  };

  it('não-admin e texto comum não consomem', async () => {
    expect(await prep(false).h('x', '/sombra Joel')).toBe(false);
    expect(await prep().h('x', 'bom dia')).toBe(false);
  });

  it('/sombra sozinho = ajuda', async () => {
    const { h, sendText } = prep();
    expect(await h('x', '/sombra')).toBe(true);
    expect(sendText.mock.calls[0][1]).toContain('/sombra <nome>');
  });

  // (2) "sombra" solto é atalho pra ajuda; COM argumento a barra é obrigatória.
  it('"sombra" solto (sem barra) também é ajuda', async () => {
    const { h, sendText } = prep();
    expect(await h('x', 'sombra')).toBe(true);
    expect(sendText.mock.calls[0][1]).toContain('/sombra <nome>');
  });

  it('frase com "sombra" e sem barra NÃO é comando', async () => {
    const { h, sendText, db } = prep();
    expect(await h('x', 'sombra no telhado')).toBe(false);
    expect(await h('x', 'tem sombra ali')).toBe(false);
    expect(sendText).not.toHaveBeenCalled();
    expect(db.tabelas.propostas_versoes).toHaveLength(0);
  });

  it('texto que não é string não consome', async () => {
    const { h } = prep();
    expect(await h('x', undefined as any)).toBe(false);
    expect(await h('x', null as any)).toBe(false);
  });

  it('/sombra Joel Lima acha o lead e roda', async () => {
    const { h, sendText, db } = prep();
    expect(await h('x', '/sombra Joel Lima')).toBe(true);
    expect(db.tabelas.propostas_versoes[0].lead_id).toBe('L1');
    expect(sendText.mock.calls.at(-1)![1]).toContain('🕶️ SOMBRA v1 — Joel Lima');
  });

  it('nome ambíguo pega o mais recente e avisa', async () => {
    const { h, sendText, db } = prep();
    await h('x', '/sombra Joel');
    expect(db.tabelas.propostas_versoes[0].lead_id).toBe('L2');
    expect(sendText.mock.calls[0][1]).toContain('2 leads com "Joel"');
  });

  it('mais de 5 homônimos vira "5+" (busca traz 6 pra saber que passou)', async () => {
    const { h, sendText, db } = prep();
    for (let i = 3; i <= 8; i++) db.tabelas.leads.push({ id: `L${i}`, name: `Joel ${i}`, energy_data: { consumption_kwh: 734 }, created_at: `2026-07-0${i - 2}` });
    await h('x', '/sombra Joel');
    expect(sendText.mock.calls[0][1]).toContain('5+ leads com "Joel"');
  });

  it('nome sem lead avisa', async () => {
    const { h, sendText } = prep();
    await h('x', '/sombra Ninguém');
    expect(sendText.mock.calls[0][1]).toContain('Não achei lead');
  });

  // (T3) curinga digitado pelo Junior vai escapado pro banco.
  it('T3: /sombra Jo%el manda o padrão escapado no ilike', async () => {
    const { h, db } = prep();
    await h('x', '/sombra Jo%el');
    expect(db.ilikes).toContain('%Jo\\%el%');
  });

  it('só curinga (vira nada depois do escape) = ajuda', async () => {
    const { h, sendText } = prep();
    expect(await h('x', '/sombra ***')).toBe(true);
    expect(sendText.mock.calls[0][1]).toContain('/sombra <nome>');
  });

  // (T6) lead arquivado é como se não existisse.
  it('T6: lead arquivado não é achado', async () => {
    const { h, sendText, db } = prep();
    db.tabelas.leads.push({ id: 'L9', name: 'Zoraide', energy_data: { consumption_kwh: 734 }, created_at: '2026-08-11', archived_at: '2026-08-12' });
    await h('x', '/sombra Zoraide');
    expect(sendText.mock.calls[0][1]).toContain('Não achei lead');
    expect(db.tabelas.propostas_versoes).toHaveLength(0);
  });

  // (T7) o select do handler também pode falhar.
  it('T7: erro ao buscar o lead avisa o Junior e não roda nada', async () => {
    const err = calarErro();
    const { h, sendText, db } = prep(true, { erroSelect: ['leads'] });
    expect(await h('x', '/sombra Joel')).toBe(true);
    expect(sendText).toHaveBeenCalledWith('x', '⚠️ Não consegui consultar os leads agora.');
    expect(db.tabelas.propostas_versoes).toHaveLength(0);
    expect(err.mock.calls[0][0]).toContain('[sombra]');
  });

  // (5) a sombra falhou por dentro: o Junior não pode ficar no vácuo.
  it('rodada que dá interno avisa o Junior', async () => {
    calarErro();
    const { h, sendText } = prep(true, { erroInsert: { message: 'boom' } });
    expect(await h('x', '/sombra Joel Lima')).toBe(true);
    expect(sendText).toHaveBeenCalledWith('x', '⚠️ Não consegui rodar a sombra agora. Tenta de novo.');
  });

  it('rodada fora da faixa NÃO vira aviso de erro (o card já explicou)', async () => {
    const db = fakeDb();
    db.tabelas.leads.push({ id: 'L1', name: 'Zé', energy_data: { consumption_kwh: 300 }, created_at: '2026-08-01' });
    const { svc, sendText } = mk(db);
    const h = makeSombraHandler({ svc, client: db.client as any, isAdminPhone: () => true, sendText, agoraMs: () => T0 });
    await h('x', '/sombra Zé');
    expect(sendText.mock.calls.some(c => String(c[1]).includes('Não consegui rodar'))).toBe(false);
    expect(sendText.mock.calls.at(-1)![1]).toContain('abaixo de 500');
  });
});
