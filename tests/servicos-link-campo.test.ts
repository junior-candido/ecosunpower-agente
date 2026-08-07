// LINK MÁGICO do serviço (Junior 06/08): campo trabalha por link com validade,
// sem usuário/senha/trava. Nome de quem faz fica no serviço.
import { describe, it, expect } from 'vitest';
import { gerarLinkCampo, getServicoPorCampoSlug } from '../src/modules/dashboard/servicos-store.js';

function mockClient(rowPorSlug: Record<string, any> = {}) {
  const updates: Array<{ set: any; eqVal: string }> = [];
  const client: any = {
    from() {
      return {
        update(set: any) { return { eq: async (_c: string, eqVal: string) => { updates.push({ set, eqVal }); return { error: null }; } }; },
        select() { return { eq: (_c: string, v: string) => ({ maybeSingle: async () => ({ data: rowPorSlug[v] ?? null }) }) }; },
      };
    },
  };
  return { client, updates };
}

describe('gerarLinkCampo', () => {
  it('carimba slug de 10 letras, validade em dias e o nome de quem faz', async () => {
    const { client, updates } = mockClient();
    const r = await gerarLinkCampo(client, 'srv-1', 'Jonnata', 7);
    expect(r.slug).toMatch(/^[a-z0-9]{10}$/);
    expect(updates[0].eqVal).toBe('srv-1');
    expect(updates[0].set.campo_slug).toBe(r.slug);
    expect(updates[0].set.campo_nome).toBe('Jonnata');
    const expira = new Date(updates[0].set.campo_expira_em).getTime();
    const seteDias = Date.now() + 7 * 24 * 3600 * 1000;
    expect(Math.abs(expira - seteDias)).toBeLessThan(60000); // ~7 dias, tolerância 1min
  });
  it('gerar link ABRE o serviço (bug Hudson 06/08: sem atribuído nascia "concluído")', async () => {
    const { client, updates } = mockClient();
    await gerarLinkCampo(client, 'srv-1', 'Jeane', 7);
    expect(updates[0].set.status).toBe('atribuido');
  });
});

describe('renderCampoPublicoPage — envio não pode falhar em silêncio (bug Jeane 06/08)', () => {
  const SERVICO = {
    id: 's1', tipoId: 'visita-tecnica', tipoNome: 'Visita técnica', leadId: 'l1',
    clienteNome: 'Jeane', sistemaId: null, observacoes: null, dataServico: '2026-08-07',
    fotos: 0, videos: 0, status: 'atribuido' as const, atribuidoA: null, atribuidoNome: null,
  };
  it('o JS confere a resposta de CADA passo (uploads, confirmar, concluir)', async () => {
    const { renderCampoPublicoPage } = await import('../src/modules/dashboard/servicos-views.js');
    const html = renderCampoPublicoPage(SERVICO, 'abcdefghjk', []);
    // helper que valida status+ok de toda resposta — usado nos 3 passos
    expect(html).toContain('function checa(');
    expect((html.match(/\.then\(checa\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
  it('só recarrega DEPOIS de conferir o concluir; falha aparece na tela', async () => {
    const { renderCampoPublicoPage } = await import('../src/modules/dashboard/servicos-views.js');
    const html = renderCampoPublicoPage(SERVICO, 'abcdefghjk', []);
    expect(html).toContain('Não consegui enviar');
    expect(html).not.toContain(".then(function(){window.location.reload()})");
  });
});

describe('getServicoPorCampoSlug', () => {
  const LINHA = {
    id: 's1', tipo_id: 'instalacao-fv', lead_id: 'l1', sistema_id: null,
    observacoes: null, data_servico: '2026-08-08', criado_em: 'x', status: 'atribuido',
    atribuido_a: null, excluido_em: null, campo_slug: 'abcdefghjk', campo_nome: 'Jonnata',
    campo_expira_em: new Date(Date.now() + 86400000).toISOString(),
    servico_tipos: { nome: 'Instalação FV' }, leads: { name: 'Edimilson' },
    servico_fotos: [],
  };
  it('link válido → devolve o serviço', async () => {
    const { client } = mockClient({ abcdefghjk: LINHA });
    const r = await getServicoPorCampoSlug(client, 'abcdefghjk');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.servico.tipoNome).toBe('Instalação FV');
  });
  it('link vencido → motivo "vencido" (sem trava: escritório reenvia)', async () => {
    const vencida = { ...LINHA, campo_expira_em: new Date(Date.now() - 1000).toISOString() };
    const { client } = mockClient({ abcdefghjk: vencida });
    const r = await getServicoPorCampoSlug(client, 'abcdefghjk');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe('vencido');
  });
  it('slug inexistente → não achado', async () => {
    const { client } = mockClient();
    const r = await getServicoPorCampoSlug(client, 'zzzzzzzzzz');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe('nao_achado');
  });
});
