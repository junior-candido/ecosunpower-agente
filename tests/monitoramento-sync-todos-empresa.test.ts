// Revisão de segurança do R8 (28/09/2026): na tela antiga o botão "Atualizar
// todas" ficava num <form> DENTRO do filtro e nunca chamava POST sync-todos.
// Com o formulário consertado, a rota passa a ser usada — e ela sincronizava a
// frota de TODAS as empresas. Agora: tenant sincroniza só as usinas dele; a
// EcoSun continua sincronizando tudo (igual ao cron); sem empresa → nada.
// De quebra: POST /:id/excluir passa a checar a dona da usina (igual ao :id/sync).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { MonitoringService } from '../src/modules/monitoring/service.js';
import { escopoSyncTodos } from '../src/modules/dashboard/permissions.js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';
const TENANT = 'aaaa1111-2222-3333-4444-555566667777';

describe('escopoSyncTodos', () => {
  it('EcoSun → frota inteira (como o cron)', () => {
    expect(escopoSyncTodos(ECOSUN)).toEqual({ tudo: true });
  });
  it('tenant → só a empresa dele', () => {
    expect(escopoSyncTodos(TENANT)).toEqual({ companyId: TENANT });
  });
  it('sem empresa na sessão → nega', () => {
    expect(escopoSyncTodos(undefined)).toBeNull();
    expect(escopoSyncTodos(null)).toBeNull();
  });
});

describe('MonitoringService.syncAll(companyId)', () => {
  it('com companyId, lista só as usinas daquela empresa', async () => {
    const eqs: Array<[string, unknown]> = [];
    const q: any = {
      select() { return q; },
      eq(c: string, v: unknown) { eqs.push([c, v]); return q; },
      then(ok: (r: unknown) => void) { ok({ data: [], error: null }); },
    };
    const svc = new MonitoringService({ getClient: () => ({ from: () => q }) } as any);
    await svc.syncAll(TENANT);
    expect(eqs).toContainEqual(['company_id', TENANT]);
  });
});

describe('rotas da frota com trava de empresa', () => {
  const fonte = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', 'router.ts'), 'utf-8');
  const rota = (inicio: string) => {
    const i = fonte.indexOf(inicio);
    expect(i).toBeGreaterThan(-1);
    return fonte.slice(i, fonte.indexOf('\n  });', i));
  };
  it('sync-todos usa escopoSyncTodos e passa a empresa pro syncAll', () => {
    const r = rota("router.post('/monitoramento/sync-todos'");
    expect(r).toContain('escopoSyncTodos(');
    expect(r).toMatch(/syncAll\(escopo\.companyId\)/);
  });
  it(':id/excluir confere a dona da usina ANTES de apagar', () => {
    const r = rota("router.post('/monitoramento/:id/excluir'");
    expect(r).toContain('usinaPertenceAoOperador(');
    expect(r.indexOf('usinaPertenceAoOperador(')).toBeLessThan(r.indexOf('excluirSistema('));
  });
});
