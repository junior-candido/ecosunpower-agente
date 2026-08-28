import { describe, it, expect } from 'vitest';
import {
  criarTokenSenha, validarTokenSenha, marcarTokenUsado, hashToken, VALIDADE_HORAS,
  renderDefinirSenhaPage, renderEsqueciSenhaPage, renderLinkInvalidoPage, corpoEmailConvite,
} from '../src/modules/dashboard/senha-tokens.js';

// Fake mínimo da tabela dashboard_senha_tokens (insert / update / select por token_hash)
function fakeClient() {
  const linhas: Array<Record<string, unknown>> = [];
  let seq = 0;
  const client = {
    from(_t: string) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {
        _op: '', _set: {}, _f: [] as Array<[string, unknown]>, _isNull: [] as string[],
        insert(row: Record<string, unknown>) { linhas.push({ id: `t${++seq}`, usado_em: null, ...row }); return Promise.resolve({ error: null }); },
        update(set: Record<string, unknown>) { b._op = 'update'; b._set = set; return b; },
        select() { b._op = 'select'; return b; },
        eq(k: string, v: unknown) { b._f.push([k, v]); return b; },
        is(k: string, _v: unknown) { b._isNull.push(k); return b; },
        _match(r: Record<string, unknown>) { return b._f.every(([k, v]: [string, unknown]) => r[k] === v) && b._isNull.every((k: string) => r[k] === null); },
        maybeSingle() { const r = linhas.find((x) => b._match(x)); return Promise.resolve({ data: r ?? null }); },
        then(res: (v: unknown) => void) { // update encadeado sem maybeSingle
          if (b._op === 'update') linhas.filter((r) => b._match(r)).forEach((r) => Object.assign(r, b._set));
          res({ error: null });
        },
      };
      return b;
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: client as any, linhas };
}

describe('senha-tokens (108) — convite e reset', () => {
  it('cria token: banco guarda só o hash, expira conforme o tipo', async () => {
    const { client, linhas } = fakeClient();
    const agora = new Date('2026-08-28T12:00:00Z');
    const t = await criarTokenSenha(client, { companyId: 'c1', userId: 'u1', tipo: 'convite' }, agora);
    expect(t.tokenCru.length).toBeGreaterThan(30);
    expect(linhas[0].token_hash).toBe(hashToken(t.tokenCru));
    expect(linhas[0].token_hash).not.toContain(t.tokenCru);
    expect(new Date(linhas[0].expira_em as string).getTime() - agora.getTime()).toBe(VALIDADE_HORAS.convite * 3600 * 1000);
  });

  it('valida: token certo → dados; errado/expirado/usado → null', async () => {
    const { client } = fakeClient();
    const agora = new Date('2026-08-28T12:00:00Z');
    const t = await criarTokenSenha(client, { companyId: 'c1', userId: 'u1', tipo: 'reset' }, agora);
    const ok = await validarTokenSenha(client, t.tokenCru, agora);
    expect(ok).toMatchObject({ userId: 'u1', companyId: 'c1', tipo: 'reset' });
    expect(await validarTokenSenha(client, 'x'.repeat(40), agora)).toBeNull();
    expect(await validarTokenSenha(client, undefined, agora)).toBeNull();
    // expirado (reset = 2h)
    expect(await validarTokenSenha(client, t.tokenCru, new Date(agora.getTime() + 3 * 3600 * 1000))).toBeNull();
    // usado
    await marcarTokenUsado(client, ok!.id, agora);
    expect(await validarTokenSenha(client, t.tokenCru, agora)).toBeNull();
  });

  it('reenvio invalida o link anterior do mesmo usuário/tipo', async () => {
    const { client } = fakeClient();
    const agora = new Date('2026-08-28T12:00:00Z');
    const t1 = await criarTokenSenha(client, { companyId: 'c1', userId: 'u1', tipo: 'convite' }, agora);
    const t2 = await criarTokenSenha(client, { companyId: 'c1', userId: 'u1', tipo: 'convite' }, agora);
    expect(await validarTokenSenha(client, t1.tokenCru, agora)).toBeNull();
    expect(await validarTokenSenha(client, t2.tokenCru, agora)).not.toBeNull();
  });

  it('telas: formulário com token escondido, escape de HTML, mensagens', () => {
    const html = renderDefinirSenhaPage({ token: 'abc', nome: '<Jimena>', empresa: 'Conquista Solar', tipo: 'convite' });
    expect(html).toContain('name="t" value="abc"');
    expect(html).toContain('&lt;Jimena&gt;');
    expect(html).toContain('Crie a sua senha');
    expect(renderEsqueciSenhaPage({ empresa: 'X' })).toContain('action="/dashboard/esqueci-senha"');
    expect(renderEsqueciSenhaPage({ empresa: 'X', enviado: true })).toContain('mandamos um link');
    expect(renderLinkInvalidoPage('X')).toContain('/dashboard/esqueci-senha');
    expect(corpoEmailConvite('Ana', 'Conquista Solar', 72)).toContain('72 horas');
  });
});
