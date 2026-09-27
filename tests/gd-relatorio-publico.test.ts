import { describe, it, expect, vi } from 'vitest';
import { abrirPdfPublico, listarRelatoriosDaPasta, listarRelatoriosEnviadosDoLead, relatoriosParaPasta } from '../src/modules/gd/relatorio-publico.js';

function fakeClient(linhas: any[], arquivo: Blob | null) {
  const ops: Array<[string, any[]]> = [];
  const tabelas: string[] = [];
  const buckets: string[] = [];
  const q: any = new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'then') return (res: any) => Promise.resolve({ data: linhas, error: null }).then(res);
      return (...a: any[]) => { ops.push([prop, a]); return q; };
    },
  });
  const download = vi.fn(async () => (arquivo ? { data: arquivo, error: null } : { data: null, error: { message: 'Object not found' } }));
  const client: any = {
    from: (t: string) => { tabelas.push(t); return q; },
    storage: { from: (b: string) => { buckets.push(b); return { download }; } },
  };
  return { client, ops, tabelas, buckets, download };
}

const TOKEN = 'T'.repeat(32);

describe('abrirPdfPublico', () => {
  it('acha SÓ pelo token (nunca UC/empresa) e devolve o PDF guardado', async () => {
    const f = fakeClient([{ storage_path: 'L1/relatorio-gd/a.pdf', instalacao: '351534', referencia: '2026-08-01' }], new Blob(['%PDF-1.4']));
    const r = await abrirPdfPublico(f.client, TOKEN);
    expect(r!.pdf.toString()).toBe('%PDF-1.4');
    expect(r!.nomeArquivo).toBe('relatorio-351534-2026-08.pdf');
    expect(f.tabelas).toEqual(['relatorios_gd_gerados']);
    expect(f.ops.filter((o) => o[0] === 'eq')).toEqual([['eq', ['token', TOKEN]]]);
    expect(f.buckets).toEqual(['client-attachments']);
    expect(f.download).toHaveBeenCalledWith('L1/relatorio-gd/a.pdf');
  });
  it('token que não existe → null, sem tocar no storage', async () => {
    const f = fakeClient([], new Blob(['x']));
    expect(await abrirPdfPublico(f.client, TOKEN)).toBeNull();
    expect(f.download).not.toHaveBeenCalled();
  });
  it('registro sem PDF guardado → null', async () => {
    const f = fakeClient([{ storage_path: null, instalacao: '1', referencia: '2026-08-01' }], new Blob(['x']));
    expect(await abrirPdfPublico(f.client, TOKEN)).toBeNull();
  });
  it('PDF sumiu do storage → null', async () => {
    const f = fakeClient([{ storage_path: 'L1/relatorio-gd/a.pdf', instalacao: '1', referencia: '2026-08-01' }], null);
    expect(await abrirPdfPublico(f.client, TOKEN)).toBeNull();
  });
});

describe('relatórios da usina na Pasta Digital', () => {
  it('um por mês (o envio mais novo), do mais novo pro mais velho', () => {
    const linhas = [
      { referencia: '2026-07-01', token: 'A' },
      { referencia: '2026-08-01', token: 'B-novo' },
      { referencia: '2026-08-01', token: 'B-velho' },
    ];
    expect(relatoriosParaPasta(linhas, 'https://p.x')).toEqual([
      { referencia: '2026-08-01', mesExtenso: 'agosto de 2026', url: 'https://p.x/rg/B-novo' },
      { referencia: '2026-07-01', mesExtenso: 'julho de 2026', url: 'https://p.x/rg/A' },
    ]);
  });
  it('no máximo 12; linha sem token é ignorada', () => {
    const muitos = Array.from({ length: 15 }, (_, i) => ({ referencia: `20${10 + i}-01-01`, token: `t${i}` }));
    const r = relatoriosParaPasta(muitos, 'https://p.x');
    expect(r).toHaveLength(12);
    expect(r[0].referencia).toBe('2024-01-01');
    expect(relatoriosParaPasta([{ referencia: '2026-08-01', token: null }], 'https://p.x')).toEqual([]);
  });
  it('consulta só o lead da pasta, só enviados com token', async () => {
    const f = fakeClient([{ referencia: '2026-08-01', token: 'B' }], null);
    const r = await listarRelatoriosEnviadosDoLead(f.client, 'L1', 'https://p.x');
    expect(r).toEqual([{ referencia: '2026-08-01', mesExtenso: 'agosto de 2026', url: 'https://p.x/rg/B' }]);
    expect(f.ops).toContainEqual(['eq', ['lead_id', 'L1']]);
    expect(f.ops).toContainEqual(['not', ['enviado_em', 'is', null]]);
    expect(f.ops).toContainEqual(['not', ['token', 'is', null]]);
  });
});

describe('listarRelatoriosDaPasta — só relatórios da MESMA empresa do lead', () => {
  function fakePorTabela(porTabela: Record<string, any[]>) {
    const ops: Array<[string, string, any[]]> = [];
    const client: any = {
      from: (t: string) => {
        const q: any = new Proxy({}, {
          get(_x, prop: string) {
            if (prop === 'then') return (res: any) => Promise.resolve({ data: porTabela[t] ?? [], error: null }).then(res);
            return (...a: any[]) => { ops.push([t, prop, a]); return q; };
          },
        });
        return q;
      },
    };
    return { client, ops };
  }
  it('filtra pela empresa dona do lead', async () => {
    const f = fakePorTabela({ leads: [{ company_id: 'C1' }], relatorios_gd_gerados: [{ referencia: '2026-08-01', token: 'B' }] });
    const r = await listarRelatoriosDaPasta(f.client, 'L1', 'https://p.x');
    expect(r).toEqual([{ referencia: '2026-08-01', mesExtenso: 'agosto de 2026', url: 'https://p.x/rg/B' }]);
    expect(f.ops).toContainEqual(['leads', 'eq', ['id', 'L1']]);
    expect(f.ops).toContainEqual(['relatorios_gd_gerados', 'eq', ['lead_id', 'L1']]);
    expect(f.ops).toContainEqual(['relatorios_gd_gerados', 'eq', ['company_id', 'C1']]);
  });
  it('lead não encontrado → lista vazia, sem consultar relatórios', async () => {
    const f = fakePorTabela({ leads: [], relatorios_gd_gerados: [{ referencia: '2026-08-01', token: 'B' }] });
    expect(await listarRelatoriosDaPasta(f.client, 'L1', 'https://p.x')).toEqual([]);
    expect(f.ops.some((o) => o[0] === 'relatorios_gd_gerados')).toBe(false);
  });
});
