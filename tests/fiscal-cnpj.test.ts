import { describe, it, expect, vi, afterEach } from 'vitest';
import { consultarCnpj } from '../src/modules/financeiro/fiscal/cnpj.js';

afterEach(() => vi.unstubAllGlobals());

describe('fiscal consultarCnpj', () => {
  it('normaliza a resposta da BrasilAPI', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ razao_social: 'COMERCIAL DE ALIMENTOS SUPERBOM LTDA', nome_fantasia: 'SUPERBOM',
        logradouro: 'QS 314 CONJUNTO 7', numero: 'S/N', municipio: 'BRASILIA', uf: 'DF', cep: '71805511', email: null }),
    }));
    const r = await consultarCnpj('08.616.988/0001-20');
    expect(fetch).toHaveBeenCalledWith('https://brasilapi.com.br/api/cnpj/v1/08616988000120', expect.objectContaining({ signal: expect.anything() }));
    expect(r).toEqual({ razaoSocial: 'COMERCIAL DE ALIMENTOS SUPERBOM LTDA', fantasia: 'SUPERBOM',
      endereco: 'QS 314 CONJUNTO 7, S/N', municipio: 'BRASILIA', uf: 'DF', cep: '71805511', email: null });
  });
  it('CNPJ inválido (menos de 14 dígitos) → erro claro antes de chamar a rede', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    await expect(consultarCnpj('123')).rejects.toThrow('CNPJ inválido');
    expect(f).not.toHaveBeenCalled();
  });
  it('BrasilAPI fora do ar → null (a tela deixa preencher à mão)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    expect(await consultarCnpj('08.616.988/0001-20')).toBeNull();
  });
  it('rede caiu (fetch rejeita) → null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ENOTFOUND')));
    expect(await consultarCnpj('08.616.988/0001-20')).toBeNull();
  });
});
