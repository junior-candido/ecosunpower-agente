// tests/nep-credenciais.test.ts
//
// Regressão do bug de DUPLICAÇÃO de plantas NEP: o adapter gravava o id da
// planta como `sid`, mas o service.ts deduplica por `api_credentials->>site_id`
// — então a descoberta nunca achava a planta e inseria uma cópia a cada hora.
// Fix: gravar `site_id` (padrão SolarEdge/Deye) e ler `site_id` OU `sid`
// (compat com plantas já cadastradas).

import { describe, it, expect } from 'vitest';
import { parseCreds, buildSiteCredenciais } from '../src/modules/monitoring/adapters/nep.js';

describe('parseCreds — id da planta', () => {
  it('lê o id da planta de site_id (convenção nova)', () => {
    const r = parseCreds({ jwt: 'eyJ.abc', site_id: 'PLANTA-1' });
    expect('error' in r).toBe(false);
    expect((r as { sid?: string }).sid).toBe('PLANTA-1');
  });

  it('lê o id da planta de sid (compat — plantas já cadastradas)', () => {
    const r = parseCreds({ jwt: 'eyJ.abc', sid: 'PLANTA-2' });
    expect((r as { sid?: string }).sid).toBe('PLANTA-2');
  });

  it('site_id tem prioridade quando os dois existem', () => {
    const r = parseCreds({ jwt: 'eyJ.abc', site_id: 'NOVO', sid: 'VELHO' });
    expect((r as { sid?: string }).sid).toBe('NOVO');
  });

  it('sem jwt → erro', () => {
    const r = parseCreds({ site_id: 'X' });
    expect('error' in r).toBe(true);
  });
});

describe('buildSiteCredenciais — formato padrão do registry', () => {
  it('grava site_id (NÃO sid) no modo jwt — é a chave que o dedup usa', () => {
    const creds = buildSiteCredenciais({ mode: 'jwt', jwt: 'eyJ.x' }, 'SID-123');
    expect(creds.site_id).toBe('SID-123');
    expect(creds.jwt).toBe('eyJ.x');
    expect('sid' in creds).toBe(false); // <- a falha que duplicava as plantas
  });

  it('grava site_id no modo login também', () => {
    const creds = buildSiteCredenciais({ mode: 'login', email: 'a@b.com', password: 'p' }, 'SID-9');
    expect(creds.site_id).toBe('SID-9');
    expect('sid' in creds).toBe(false);
  });
});
