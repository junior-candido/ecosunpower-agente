import { describe, it, expect, vi } from 'vitest';
import { criarEvolutionTenantResolver } from '../src/modules/evolution-tenant.js';
import { comCanal, canalAtual, canalExigeEvolution, instanciaEvolutionAtual } from '../src/modules/canal-contexto.js';

// Fake do client Supabase: from('companies').select().eq()[.eq()].maybeSingle()
function fakeClient(resposta: { data: unknown; error: unknown }) {
  let chamadas = 0;
  const client = {
    from(_t: string) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {
        select() { return b; },
        eq() { return b; },
        maybeSingle() { chamadas++; return Promise.resolve(resposta); },
      };
      return b;
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: client as any, chamadas: () => chamadas };
}

describe('evolution-tenant (107) — instância ↔ empresa', () => {
  it('instância mapeada → company_id, cacheia e já sabe a instância da empresa', async () => {
    const { client, chamadas } = fakeClient({ data: { id: 'empresa-conquista' }, error: null });
    const r = criarEvolutionTenantResolver(client);
    expect(await r.companyDaInstancia('conquista-solar')).toBe('empresa-conquista');
    expect(await r.companyDaInstancia('conquista-solar')).toBe('empresa-conquista');
    expect(chamadas()).toBe(1);
    // caminho inverso preenchido pelo lookup (sem bater no banco de novo)
    expect(await r.instanciaDaEmpresa('empresa-conquista')).toBe('conquista-solar');
    expect(chamadas()).toBe(1);
  });

  it('instância NÃO mapeada (a da Eva) → undefined = EcoSun, sem falha-fechado', async () => {
    const { client } = fakeClient({ data: null, error: null });
    const r = criarEvolutionTenantResolver(client);
    expect(await r.companyDaInstancia('ecosunpower')).toBeUndefined();
  });

  it('sem instance no payload → undefined SEM bater no banco', async () => {
    const { client, chamadas } = fakeClient({ data: { id: 'x' }, error: null });
    const r = criarEvolutionTenantResolver(client);
    expect(await r.companyDaInstancia(undefined)).toBeUndefined();
    expect(await r.companyDaInstancia('  ')).toBeUndefined();
    expect(chamadas()).toBe(0);
  });

  it('erro do banco → undefined (EcoSun) e NÃO cacheia', async () => {
    const { client, chamadas } = fakeClient({ data: null, error: { message: 'boom' } });
    const r = criarEvolutionTenantResolver(client);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await r.companyDaInstancia('conquista-solar')).toBeUndefined();
    expect(await r.companyDaInstancia('conquista-solar')).toBeUndefined();
    expect(chamadas()).toBe(2);
    warn.mockRestore();
  });

  it('empresa sem instância própria (EcoSun) → undefined; companyId undefined não consulta', async () => {
    const { client, chamadas } = fakeClient({ data: { evolution_instance: null }, error: null });
    const r = criarEvolutionTenantResolver(client);
    expect(await r.instanciaDaEmpresa(undefined)).toBeUndefined();
    expect(chamadas()).toBe(0);
    expect(await r.instanciaDaEmpresa('00000000-0000-0000-0000-000000000001')).toBeUndefined();
    expect(chamadas()).toBe(1);
  });
});

describe('canal-contexto — instância de resposta segue a mensagem', () => {
  it('fora de contexto = canal padrão (comportamento de hoje)', () => {
    expect(canalAtual()).toBeUndefined();
    expect(canalExigeEvolution()).toBe(false);
    expect(instanciaEvolutionAtual('ecosunpower')).toBe('ecosunpower');
  });

  it('dentro do contexto do tenant: exige Evolution e usa a instância dele (awaits inclusos)', async () => {
    await comCanal({ companyId: 'empresa-conquista', evolutionInstance: 'conquista-solar' }, async () => {
      await Promise.resolve();
      expect(canalExigeEvolution()).toBe(true);
      expect(instanciaEvolutionAtual('ecosunpower')).toBe('conquista-solar');
    });
    expect(canalExigeEvolution()).toBe(false);
  });

  it('contexto da EcoSun (sem instância) = padrão', async () => {
    await comCanal({ companyId: '00000000-0000-0000-0000-000000000001' }, async () => {
      expect(canalExigeEvolution()).toBe(false);
      expect(instanciaEvolutionAtual('ecosunpower')).toBe('ecosunpower');
    });
  });

  it('EvolutionService manda pela instância do contexto', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ key: { id: 'm1' } }) });
    global.fetch = fetchMock as unknown as typeof fetch;
    const { EvolutionService } = await import('../src/modules/evolution.js');
    const svc = new EvolutionService({
      evolutionApiUrl: 'http://evo', evolutionApiKey: 'k', evolutionInstance: 'ecosunpower', webhookToken: 't',
    });
    await comCanal({ companyId: 'empresa-conquista', evolutionInstance: 'conquista-solar' }, () => svc.sendText('5577999', 'oi'));
    expect(fetchMock.mock.calls[0][0]).toBe('http://evo/message/sendText/conquista-solar');
    await svc.sendText('5561999', 'oi');
    expect(fetchMock.mock.calls[1][0]).toBe('http://evo/message/sendText/ecosunpower');
  });
});
