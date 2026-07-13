import { describe, it, expect } from 'vitest';
import { congelarContrato, contratoVigente } from '../src/modules/closing/contrato-vigente.js';
import { completarComPlaceholders } from '../src/modules/closing/fechamento-auto.js';

// Sem isso não existe aditivo. Hoje a central monta o PDF na hora, toda vez, a
// partir do cadastro + proposta — então não existe "O contrato do Antonio",
// existe "o contrato que eu gerei agora". Se a proposta mudar amanhã, o
// "contrato original" muda junto, e o aditivo compararia com um fantasma.
// Congelar = guardar o RETRATO do que foi combinado, com data.

function fakeClient(estado: { linhas: any[] }) {
  return {
    from() {
      const b: any = {};
      const filtros: any = {};
      b.insert = (row: any) => {
        const nova = { id: 'F' + (estado.linhas.length + 1), created_at: '2026-07-13T10:00:00Z', ...row };
        estado.linhas.push(nova);
        b._retorno = nova;
        return b;
      };
      b.update = (patch: any) => { b._patch = patch; return b; };
      b.select = () => b;
      b.eq = (col: string, v: any) => { filtros[col] = v; return b; };
      b.in = () => b;
      b.order = () => b;
      b.limit = () => b;
      b.single = async () => ({ data: b._retorno, error: null });
      b.maybeSingle = async () => {
        const achadas = estado.linhas
          .filter((l) => (filtros.lead_id ? l.lead_id === filtros.lead_id : true))
          .filter((l) => l.status !== 'cancelado');
        return { data: achadas[achadas.length - 1] ?? null, error: null };
      };
      return b;
    },
  } as any;
}

const DADOS = completarComPlaceholders({
  titular_uc: { tipo: 'PF', nome: 'Antonio Ricardo', cpf: '111.444.777-35' } as any,
  sistema: { kwp: 6.215, modalidade: 'autoconsumo_local', modulos: { marca: 'DAH', potencia_w: 565, quantidade: 11 }, inversor: { marca: 'Deye', modelo: 'SUN-5K', potencia_kw: 8.325 } },
  comercial: { valor_total_brl: 20959.09, forma_pagamento: 'Sol Fácil — 24x sem juros' },
});

describe('congelarContrato — "este é o contrato que vale"', () => {
  it('guarda o retrato do que foi combinado, com data', async () => {
    const estado = { linhas: [] as any[] };
    const id = await congelarContrato(fakeClient(estado), 'L1', DADOS, 'Junior');
    expect(id).toBeTruthy();

    const linha = estado.linhas[0];
    expect(linha.lead_id).toBe('L1');
    expect(linha.status).toBe('aprovado_junior'); // é O contrato, não um rascunho
    expect(linha.dados_snapshot.comercial.valor_total_brl).toBe(20959.09);
    expect(linha.dados_snapshot.comercial.forma_pagamento).toBe('Sol Fácil — 24x sem juros');
    expect(linha.created_by).toBe('Junior');
  });

  it('congelar de novo cria uma VERSÃO nova, apontando pra anterior (não apaga o passado)', async () => {
    const estado = { linhas: [] as any[] };
    const v1 = await congelarContrato(fakeClient(estado), 'L1', DADOS, 'Junior');

    const mudado = completarComPlaceholders({
      ...DADOS,
      comercial: { valor_total_brl: 20959.09, forma_pagamento: 'Sol Fácil — 21x' },
    } as any);
    await congelarContrato(fakeClient(estado), 'L1', mudado, 'Junior');

    expect(estado.linhas).toHaveLength(2);
    expect(estado.linhas[1].parent_id).toBe(v1); // a v2 sabe de onde veio
    expect(estado.linhas[0].dados_snapshot.comercial.forma_pagamento).toBe('Sol Fácil — 24x sem juros');
  });
});

describe('contratoVigente — o que vale hoje', () => {
  it('sem contrato congelado → null (e o aditivo tem que avisar isso)', async () => {
    expect(await contratoVigente(fakeClient({ linhas: [] }), 'L1')).toBeNull();
  });

  it('devolve o retrato e a data do congelamento', async () => {
    const estado = { linhas: [] as any[] };
    await congelarContrato(fakeClient(estado), 'L1', DADOS, 'Junior');

    const v = await contratoVigente(fakeClient(estado), 'L1');
    expect(v!.dados.comercial.forma_pagamento).toBe('Sol Fácil — 24x sem juros');
    expect(v!.dados.comercial.valor_total_brl).toBe(20959.09);
    expect(v!.congeladoEm).toBe('2026-07-13T10:00:00Z');
  });

  it('banco fora do ar não derruba a tela — devolve null', async () => {
    const quebrado: any = { from() { throw new Error('sem banco'); } };
    expect(await contratoVigente(quebrado, 'L1')).toBeNull();
  });
});
