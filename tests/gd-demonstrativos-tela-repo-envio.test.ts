import { describe, it, expect } from 'vitest';
import { criarRepoTelaGd } from '../src/modules/gd/demonstrativos-tela-repo.js';

function fakeDb(respostas: Record<string, Array<{ data: any; error: any }>>) {
  const chamadas: Array<{ tabela: string; ops: Array<[string, any[]]> }> = [];
  const db = {
    from(tabela: string) {
      const c = { tabela, ops: [] as Array<[string, any[]]> };
      chamadas.push(c);
      const fila = respostas[tabela] ?? [];
      const q: any = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === 'then') {
            const r = fila.shift() ?? { data: [], error: null };
            return (res: any) => Promise.resolve(r).then(res);
          }
          return (...args: any[]) => { c.ops.push([prop, args]); return q; };
        },
      });
      return q;
    },
  };
  return { db: db as any, chamadas };
}

const PARA_ENVIO = {
  instalacao: '351534', referencia: '2026-08-01', geradoPor: 'U1', numeros: { gerouKwh: 612 },
  leadId: 'L1', token: 'T'.repeat(32), storagePath: 'L1/relatorio-gd/a.pdf',
};

describe('repo — envio do relatório (fatia 3)', () => {
  it('criarRelatorioParaEnvio grava empresa, cliente, token e PDF e devolve o id', async () => {
    const { db, chamadas } = fakeDb({ relatorios_gd_gerados: [{ data: { id: 'R1' }, error: null }] });
    expect(await criarRepoTelaGd(db, 'E1').criarRelatorioParaEnvio(PARA_ENVIO)).toBe('R1');
    const ins = chamadas[0].ops.find((o) => o[0] === 'insert')!;
    expect(ins[1][0]).toEqual({
      company_id: 'E1', instalacao: '351534', referencia: '2026-08-01', gerado_por: 'U1', numeros: { gerouKwh: 612 },
      lead_id: 'L1', token: 'T'.repeat(32), storage_path: 'L1/relatorio-gd/a.pdf',
    });
  });
  it('criarRelatorioParaEnvio: erro do banco (ex.: 133 não aplicada) sobe com contexto', async () => {
    const { db } = fakeDb({ relatorios_gd_gerados: [{ data: null, error: { message: 'column "token" does not exist' } }] });
    await expect(criarRepoTelaGd(db, 'E1').criarRelatorioParaEnvio(PARA_ENVIO)).rejects.toThrow(/criar p\/ envio.*token/);
  });
  it('marcarEnvio: carimba enviado_em só se algum canal saiu; sempre filtra empresa e id', async () => {
    const { db, chamadas } = fakeDb({ relatorios_gd_gerados: [{ data: null, error: null }, { data: null, error: null }] });
    const repo = criarRepoTelaGd(db, 'E1');
    await repo.marcarEnvio('R1', { algumOk: true, zapPara: '5561991718505', emailPara: null, envio: { zap: { ok: true } } });
    await repo.marcarEnvio('R2', { algumOk: false, zapPara: null, emailPara: null, envio: { zap: { ok: false } } });
    const up1 = chamadas[0].ops.find((o) => o[0] === 'update')![1][0];
    expect(typeof up1.enviado_em).toBe('string');
    expect(up1.enviado_zap_para).toBe('5561991718505');
    expect(up1.enviado_email_para).toBeNull();
    expect(up1.envio).toEqual({ zap: { ok: true } });
    expect(chamadas[0].ops).toContainEqual(['eq', ['company_id', 'E1']]);
    expect(chamadas[0].ops).toContainEqual(['eq', ['id', 'R1']]);
    expect(chamadas[1].ops.find((o) => o[0] === 'update')![1][0].enviado_em).toBeNull();
  });
  it('ultimoEnvio: só envio de verdade, da empresa, da UC e do mês', async () => {
    const { db, chamadas } = fakeDb({ relatorios_gd_gerados: [
      { data: [{ enviado_em: '2026-09-27T13:05:00Z', enviado_zap_para: '5561991718505', enviado_email_para: 'j@x.com' }], error: null },
      { data: [], error: null },
    ] });
    const repo = criarRepoTelaGd(db, 'E1');
    expect(await repo.ultimoEnvio('351534', '2026-08-01')).toEqual({
      enviadoEm: '2026-09-27T13:05:00Z', zapPara: '5561991718505', emailPara: 'j@x.com',
    });
    expect(chamadas[0].ops).toContainEqual(['eq', ['company_id', 'E1']]);
    expect(chamadas[0].ops).toContainEqual(['eq', ['instalacao', '351534']]);
    expect(chamadas[0].ops).toContainEqual(['eq', ['referencia', '2026-08-01']]);
    expect(chamadas[0].ops).toContainEqual(['not', ['enviado_em', 'is', null]]);
    expect(await repo.ultimoEnvio('351534', '2026-07-01')).toBeNull();
  });
  it('destinoDoLead: telefone, e-mail e opt_out, só da empresa', async () => {
    const { db, chamadas } = fakeDb({ leads: [
      { data: [{ id: 'L1', name: 'JOAO', phone: '61991718505', email: 'j@x.com', opt_out: true }], error: null },
      { data: [], error: null },
    ] });
    const repo = criarRepoTelaGd(db, 'E1');
    expect(await repo.destinoDoLead('L1')).toEqual({ id: 'L1', nome: 'JOAO', phone: '61991718505', email: 'j@x.com', optOut: true });
    expect(chamadas[0].ops).toContainEqual(['eq', ['company_id', 'E1']]);
    expect(await repo.destinoDoLead('L9')).toBeNull();
  });
});
