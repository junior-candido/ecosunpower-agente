// tests/pasta-email-marca.test.ts
// E-mail da Pasta Digital de um TENANT não pode sair com a marca da EcoSun
// (logo padrão, nome ou site). Aprovado pelo dono em 27/09/2026 junto com a
// fatia 3 dos demonstrativos: tenant sem logo https → moldura com semLogo e
// com o nome/site DELE.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => {
  process.env.PROPOSAL_PUBLIC_BASE_URL = 'https://propostas.conquista.com';
  return { empresaAtual: null as any };
});

vi.mock('../src/modules/empresa-config.js', async (orig) => {
  const real = await orig<typeof import('../src/modules/empresa-config.js')>();
  return { ...real, empresa: () => h.empresaAtual ?? real.empresaDe(null) };
});

import { PastaService } from '../src/modules/relatorios/pasta/service.js';
import { empresaDe } from '../src/modules/empresa-config.js';

const TENANT = '22222222-2222-2222-2222-222222222222';

function fakeSupabase() {
  return {
    getPastaClienteById: vi.fn().mockResolvedValue({ id: 'pasta-1', lead_id: 'lead-1', slug: 'abcdefghjk', status: 'publicada' }),
    getClienteByLeadId: vi.fn().mockResolvedValue({ id: 'lead-1', name: 'João Silva', email: 'joao@x.com' }),
    registrarEmailEnviado: vi.fn().mockResolvedValue(undefined),
  };
}

async function htmlDoEnvio(): Promise<string> {
  const enviarEmail = vi.fn().mockResolvedValue('mid-1');
  const svc = new PastaService(fakeSupabase() as any, async () => null);
  const r = await svc.enviarPorEmail('pasta-1', enviarEmail);
  expect(r).toEqual({ ok: true, para: 'joao@x.com' });
  return enviarEmail.mock.calls[0][0].html as string;
}

describe('PastaService.enviarPorEmail — marca do tenant', () => {
  beforeEach(() => { h.empresaAtual = null; });

  it('tenant sem logo https: sem logo/nome/site da EcoSun, com o nome e o site dele', async () => {
    h.empresaAtual = {
      ...empresaDe(TENANT), nomeFantasia: 'Conquista Solar', siteUrl: 'https://conquista.com',
      logoStoragePath: 'logos/l.png', telefoneAtendente: null, telefoneAdmin: null, rtApelido: null,
    };
    const html = await htmlDoEnvio();
    expect(html).toContain('Conquista Solar');
    expect(html).toContain('https://conquista.com');
    expect(html).not.toContain('logo-ecosun-ecossistema.png');
    expect(html).not.toMatch(/ecosunpower/i);
  });

  it('tenant com logo https: usa a logo dele', async () => {
    h.empresaAtual = {
      ...empresaDe(TENANT), nomeFantasia: 'Conquista Solar', siteUrl: 'https://conquista.com',
      logoStoragePath: 'https://cdn.conquista.com/logo.png', telefoneAtendente: null, telefoneAdmin: null, rtApelido: null,
    };
    const html = await htmlDoEnvio();
    expect(html).toContain('https://cdn.conquista.com/logo.png');
    expect(html).not.toMatch(/ecosunpower/i);
  });

  it('EcoSun continua com a logo padrão', async () => {
    const html = await htmlDoEnvio();
    expect(html).toContain('logo-ecosun-ecossistema.png');
  });
});
