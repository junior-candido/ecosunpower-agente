import { describe, it, expect } from 'vitest';
import { loginBelenus, vitrineBelenus, puxarCatalogoBelenus } from '../src/modules/vendas/lojas/belenus-client.js';
import { tokenSolfacil, categoriaSolfacilRaw } from '../src/modules/vendas/lojas/solfacil-client.js';
import { extrairComponentes, extrairPrecos, cardsDaPagina } from '../src/modules/vendas/lojas/fortlev-client.js';

// helper: fetch fake que responde conforme a URL
function fakeFetch(rotas: (url: string, opts: any) => { ok?: boolean; status?: number; json?: any; text?: string }) {
  return (async (url: any, opts: any) => {
    const r = rotas(String(url), opts);
    return {
      ok: r.ok ?? true, status: r.status ?? 200,
      json: async () => r.json, text: async () => r.text ?? '',
    } as any;
  }) as typeof fetch;
}

describe('belenus-client', () => {
  it('login extrai token do campo token', async () => {
    const f = fakeFetch(() => ({ json: { token: 'aaa.bbb.ccc' } }));
    expect(await loginBelenus({ email: 'x', senha: 'y' }, f)).toBe('aaa.bbb.ccc');
  });

  it('login lança em HTTP ruim', async () => {
    const f = fakeFetch(() => ({ ok: false, status: 401, json: {} }));
    await expect(loginBelenus({ email: 'x', senha: 'y' }, f)).rejects.toThrow('401');
  });

  it('vitrine devolve produtos[]', async () => {
    const f = fakeFetch(() => ({ json: { produtos: [{ opcoes: [] }] } }));
    expect(await vitrineBelenus('tok', 2431, f)).toHaveLength(1);
  });

  it('puxarCatalogo: login + vitrine → ItemLoja normalizado', async () => {
    const painel = { produtos: [{ opcoes: [
      { sku: 'MFRI-1.4-HJ-132-715W', descricaoProduto: 'MODULO 715W RISEN', preco: 722.15, valorPotencia: 1.01, qtdEstoque: 10, imagemMarca: 'https://x/risen.png' },
    ] }] };
    const f = fakeFetch((url) => {
      if (url.includes('Login')) return { json: { token: 'a.b.c' } };
      if (url.includes('vitrine')) return { json: painel }; // toda família devolve o mesmo (ok pro teste)
      return { json: {} };
    });
    const itens = await puxarCatalogoBelenus({ email: 'x', senha: 'y' }, f);
    expect(itens.length).toBeGreaterThan(0);
    expect(itens[0]).toMatchObject({ fonte: 'belenus', categoria: 'modulo', potenciaW: 715, precoUnitario: 722.15 });
  });
});

describe('solfacil-client', () => {
  it('token extrai access_token', async () => {
    const f = fakeFetch(() => ({ json: { access_token: 'kc-token' } }));
    expect(await tokenSolfacil({ usuario: 'u', senha: 'p' }, f)).toBe('kc-token');
  });

  it('categoria pagina até completar meta.count', async () => {
    let chamada = 0;
    const f = fakeFetch(() => {
      chamada++;
      const products = chamada === 1
        ? [{ sku: '1', description: 'x', price: 10 }, { sku: '2', description: 'y', price: 20 }]
        : [{ sku: '3', description: 'z', price: 30 }];
      return { json: { data: { getSpareProducts: { meta: { count: 3 }, products } } } };
    });
    const prods = await categoriaSolfacilRaw('tok', 'MODULES', f, 2);
    expect(prods).toHaveLength(3);
    expect(chamada).toBe(2); // 2 páginas (2 + 1)
  });
});

describe('fortlev-client (extração HTML)', () => {
  const html = `
    <div class="card-orders-container">
      <div class="text-orders-price"><p><span>R$ 2.278,26</span></p></div>
      <button @click='if(!added){ addCart({"component":{"code":"IIN00521","name":"NEP MICROINVERSOR 2,5KW - 220V (BDM-2500)","family":"inverter","tech_data":{"output":{"nominal_power":2.5}},"attachments":[{"path":"https://s3/CERTIFICADO DO INMETRO - X.pdf"}]}}) }'>add</button>
    </div>`;

  it('extrai componente e preço na ordem', () => {
    expect(extrairComponentes(html)).toHaveLength(1);
    expect(extrairComponentes(html)[0].code).toBe('IIN00521');
    expect(extrairPrecos(html)[0]).toBe('R$ 2.278,26');
  });

  it('cardsDaPagina zipa componente+preço → normaliza', () => {
    const cards = cardsDaPagina(html);
    expect(cards).toHaveLength(1);
    expect(cards[0].precoTexto).toBe('R$ 2.278,26');
    expect(cards[0].component.code).toBe('IIN00521');
  });
});
