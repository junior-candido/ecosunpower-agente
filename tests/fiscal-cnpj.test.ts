import { describe, it, expect, vi, afterEach } from 'vitest';
import { consultarCnpj } from '../src/modules/financeiro/fiscal/cnpj.js';

afterEach(() => vi.unstubAllGlobals());

describe('fiscal consultarCnpj', () => {
  it('normaliza a resposta da BrasilAPI', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ razao_social: 'COMERCIAL DE ALIMENTOS SUPERBOM LTDA', nome_fantasia: 'SUPERBOM',
        logradouro: 'QS 314 CONJUNTO 7', numero: 'S/N', bairro: 'AREAL', municipio: 'BRASILIA', uf: 'DF',
        cep: '71805511', email: null, codigo_municipio_ibge: 5300108 }),
    }));
    const r = await consultarCnpj('08.616.988/0001-20');
    expect(fetch).toHaveBeenCalledWith('https://brasilapi.com.br/api/cnpj/v1/08616988000120', expect.objectContaining({ signal: expect.anything() }));
    expect(r).toEqual({ razaoSocial: 'COMERCIAL DE ALIMENTOS SUPERBOM LTDA', fantasia: 'SUPERBOM',
      endereco: 'QS 314 CONJUNTO 7, S/N', municipio: 'BRASILIA', uf: 'DF', cep: '71805511', email: null,
      logradouro: 'QS 314 CONJUNTO 7', numero: 'S/N', bairro: 'AREAL', codMunIbge: '5300108' });
  });
  it('CNPJ inválido (menos de 14 dígitos) → erro claro antes de chamar a rede', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    await expect(consultarCnpj('123')).rejects.toThrow('CNPJ inválido');
    expect(f).not.toHaveBeenCalled();
  });
  it('todas as fontes fora do ar → null (a tela deixa preencher à mão)', async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal('fetch', f);
    expect(await consultarCnpj('08.616.988/0001-20')).toBeNull();
    expect(f).toHaveBeenCalledTimes(2); // tentou BrasilAPI E minhareceita
  });
  it('BrasilAPI barrada → cai pra minhareceita.org e devolve os dados', async () => {
    const f = vi.fn()
      .mockRejectedValueOnce(new Error('bloqueio de IP'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ razao_social: 'Condominio do Edificio Spazio Verde', nome_fantasia: null,
          logradouro: 'CA 08', numero: 'S/N', municipio: 'BRASILIA', uf: 'DF', cep: '71503508', email: null }),
      });
    vi.stubGlobal('fetch', f);
    const r = await consultarCnpj('13.245.160/0001-42');
    expect(f).toHaveBeenNthCalledWith(1, 'https://brasilapi.com.br/api/cnpj/v1/13245160000142', expect.objectContaining({ signal: expect.anything() }));
    expect(f).toHaveBeenNthCalledWith(2, 'https://minhareceita.org/13245160000142', expect.objectContaining({ signal: expect.anything() }));
    expect(r?.razaoSocial).toBe('Condominio do Edificio Spazio Verde');
    expect(r?.endereco).toBe('CA 08, S/N');
  });
  it('rede caiu (fetch rejeita) → null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ENOTFOUND')));
    expect(await consultarCnpj('08.616.988/0001-20')).toBeNull();
  });
});
