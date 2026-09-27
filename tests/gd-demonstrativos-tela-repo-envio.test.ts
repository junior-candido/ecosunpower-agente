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

const RESERVA = {
  instalacao: '351534', referencia: '2026-08-01', geradoPor: 'U1', numeros: { gerouKwh: 612 }, leadId: 'L1',
};

describe('repo — envio do relatório (fatia 3)', () => {
  it('reservarEnvio: solta reserva velha (> 2 min), cria a linha "enviando" com empresa e cliente e devolve o id', async () => {
    const { db, chamadas } = fakeDb({ relatorios_gd_gerados: [{ data: null, error: null }, { data: { id: 'R1' }, error: null }] });
    expect(await criarRepoTelaGd(db, 'E1').reservarEnvio(RESERVA)).toBe('R1');
    const solta = chamadas[0].ops;
    expect(solta.find((o) => o[0] === 'update')![1][0]).toEqual({ enviando_desde: null });
    expect(solta).toContainEqual(['eq', ['company_id', 'E1']]);
    expect(solta).toContainEqual(['eq', ['instalacao', '351534']]);
    expect(solta).toContainEqual(['eq', ['referencia', '2026-08-01']]);
    const lt = solta.find((o) => o[0] === 'lt')!;
    expect(lt[1][0]).toBe('enviando_desde');
    const limite = Date.parse(lt[1][1]);
    expect(Date.now() - limite).toBeGreaterThanOrEqual(119_000);
    expect(Date.now() - limite).toBeLessThan(125_000);
    const ins = chamadas[1].ops.find((o) => o[0] === 'insert')![1][0];
    expect(ins).toMatchObject({
      company_id: 'E1', instalacao: '351534', referencia: '2026-08-01', gerado_por: 'U1', numeros: { gerouKwh: 612 }, lead_id: 'L1',
    });
    expect(typeof ins.enviando_desde).toBe('string');
    expect(ins).not.toHaveProperty('token');
  });
  it('reservarEnvio: outro envio do mesmo mês em andamento (índice único) → null, sem erro', async () => {
    const { db } = fakeDb({ relatorios_gd_gerados: [
      { data: null, error: null },
      { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } },
    ] });
    expect(await criarRepoTelaGd(db, 'E1').reservarEnvio(RESERVA)).toBeNull();
  });
  it('reservarEnvio: outro erro do banco (ex.: 134 não aplicada) sobe com contexto', async () => {
    const { db } = fakeDb({ relatorios_gd_gerados: [{ data: null, error: { message: 'column "enviando_desde" does not exist' } }] });
    await expect(criarRepoTelaGd(db, 'E1').reservarEnvio(RESERVA)).rejects.toThrow(/reservar envio.*enviando_desde/);
  });
  it('anexarPdfEToken: grava token e PDF na linha, filtrando empresa e id', async () => {
    const { db, chamadas } = fakeDb({ relatorios_gd_gerados: [{ data: null, error: null }] });
    await criarRepoTelaGd(db, 'E1').anexarPdfEToken('R1', { token: 'T'.repeat(32), storagePath: 'L1/relatorio-gd/a.pdf' });
    expect(chamadas[0].ops.find((o) => o[0] === 'update')![1][0]).toEqual({ token: 'T'.repeat(32), storage_path: 'L1/relatorio-gd/a.pdf' });
    expect(chamadas[0].ops).toContainEqual(['eq', ['company_id', 'E1']]);
    expect(chamadas[0].ops).toContainEqual(['eq', ['id', 'R1']]);
  });
  it('anexarPdfEToken: erro sobe', async () => {
    const { db } = fakeDb({ relatorios_gd_gerados: [{ data: null, error: { message: 'x' } }] });
    await expect(criarRepoTelaGd(db, 'E1').anexarPdfEToken('R1', { token: 't', storagePath: 'p' })).rejects.toThrow(/anexar PDF/);
  });
  it('cancelarEnvio: link morre (token null), reserva solta, motivo guardado', async () => {
    const { db, chamadas } = fakeDb({ relatorios_gd_gerados: [{ data: null, error: null }] });
    await criarRepoTelaGd(db, 'E1').cancelarEnvio('R1', 'deu ruim');
    expect(chamadas[0].ops.find((o) => o[0] === 'update')![1][0]).toEqual({
      token: null, enviando_desde: null, envio: { erro: 'deu ruim' },
    });
    expect(chamadas[0].ops).toContainEqual(['eq', ['company_id', 'E1']]);
    expect(chamadas[0].ops).toContainEqual(['eq', ['id', 'R1']]);
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
    expect(up1.enviando_desde).toBeNull();
    expect(up1).not.toHaveProperty('token');
    const up2 = chamadas[1].ops.find((o) => o[0] === 'update')![1][0];
    expect(up2.enviado_em).toBeNull();
    // nada saiu: o link não fica valendo sem ter ido pra ninguém
    expect(up2.token).toBeNull();
    expect(up2.enviando_desde).toBeNull();
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
