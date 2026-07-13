import { describe, it, expect } from 'vitest';
import { getContrato, valoresDoFormulario, parseFormulario } from '../src/modules/closing/contratos-registry.js';
import { completarComPlaceholders } from '../src/modules/closing/fechamento-auto.js';
import { renderAditivo } from '../src/modules/closing/templates/aditivo.html.js';

const def = () => getContrato('aditivo')!;

describe('o aditivo entrou na central como mais um tipo', () => {
  it('está registrado e sabe se renderizar até vazio (nunca trava)', () => {
    expect(def().nome).toContain('aditivo');
    expect(renderAditivo(completarComPlaceholders({})).length).toBeGreaterThan(500);
  });

  it('o "antes" é só de leitura — o operador não digita a data do contrato', () => {
    const antes = def().campos.filter((c) => c.grupo === 'O contrato que está valendo');
    expect(antes.map((c) => c.id)).toEqual(['adit_contrato_data', 'adit_valor_anterior', 'adit_pagamento_anterior']);
    for (const c of antes) expect(c.somenteLeitura).toBe(true);
  });

  it('o formulário mostra o que o contrato congelado dizia', () => {
    const vals = valoresDoFormulario(def(), {
      aditivo: {
        contrato_data: '2026-07-10T13:00:00Z',
        valor_anterior: 20959.09,
        forma_pagamento_anterior: 'Sol Fácil — 24x sem juros',
      },
    });
    expect(vals.adit_contrato_data).toBe('10/07/2026');
    expect(vals.adit_valor_anterior).toBe('20.959,09');
    expect(vals.adit_pagamento_anterior).toBe('Sol Fácil — 24x sem juros');
  });
});

// CASO REAL 1 do Junior: "falei que era 24x sem juros, o cliente foi passar o
// cartão e a bandeira só aceitou 21x — aí precisa alterar o contrato".
describe('caso real: o cartão só passou em 21x', () => {
  it('o documento diz o que era, o que passa a ser, e que o resto continua valendo', () => {
    const { rascunho } = parseFormulario(def(), {
      adit_motivo: 'pagamento',
      adit_nova_forma_pagamento: 'Sol Fácil — 21x de R$ 1.201,45',
      adit_justificativa: 'A bandeira do cartão do cliente não autorizou 24 parcelas.',
    });
    const dados = completarComPlaceholders({
      ...rascunho,
      titular_uc: { tipo: 'PF', nome: 'Antonio Ricardo', cpf: '111.444.777-35' } as any,
      aditivo: {
        ...rascunho.aditivo,
        contrato_data: '2026-07-10T13:00:00Z',
        valor_anterior: 20959.09,
        forma_pagamento_anterior: 'Sol Fácil — 24x sem juros',
      },
    });
    const html = renderAditivo(dados);

    expect(html).toContain('10/07/2026'); // cita o contrato original
    expect(html).toContain('24x sem juros'); // como estava
    expect(html).toContain('21x'); // como passa a ser
    expect(html).toContain('bandeira do cartão'); // a justificativa
    expect(html).toContain('Permanecem inalteradas'); // o resto do contrato vale
    expect(html).toContain('20.959,09'); // o valor NÃO mudou
  });
});

// CASO REAL 2: "fecha o contrato e, executando o serviço, surge mais serviço no
// dia ou depois — o aditivo organiza".
describe('caso real: apareceu serviço a mais na obra', () => {
  it('registra o que entrou, o valor a mais e o novo total', () => {
    const { rascunho } = parseFormulario(def(), {
      adit_motivo: 'servicos',
      adit_servicos: 'Troca do padrão de entrada e reforço da estrutura do telhado.',
      adit_valor_adicional: 'R$ 2.400,00',
      adit_novo_valor_total: '23.359,09',
    });
    const dados = completarComPlaceholders({
      ...rascunho,
      titular_uc: { tipo: 'PF', nome: 'Antonio Ricardo', cpf: '111.444.777-35' } as any,
      aditivo: { ...rascunho.aditivo, contrato_data: '2026-07-10T13:00:00Z', valor_anterior: 20959.09 },
    });
    const html = renderAditivo(dados);

    expect(html).toContain('Troca do padrão de entrada');
    expect(html).toContain('2.400,00'); // o valor a mais
    expect(html).toContain('23.359,09'); // o novo total
    expect(html).toContain('20.959,09'); // de quanto era
    expect(html).toContain('Permanecem inalteradas');
  });

  it('o valor a mais e o novo total viram número de verdade (não texto)', () => {
    const { rascunho } = parseFormulario(def(), {
      adit_valor_adicional: 'R$ 2.400,00',
      adit_novo_valor_total: '23.359,09',
    });
    expect(rascunho.aditivo!.valor_adicional).toBe(2400);
    expect(rascunho.aditivo!.novo_valor_total).toBe(23359.09);
  });
});

describe('sem contrato congelado, o aditivo não inventa o "antes"', () => {
  it('a data e o valor saem em branco no documento (não sai data errada)', () => {
    const html = renderAditivo(completarComPlaceholders({
      titular_uc: { tipo: 'PF', nome: 'Antonio', cpf: '111.444.777-35' } as any,
      aditivo: { motivo: 'pagamento', nova_forma_pagamento: 'Sol Fácil — 21x' },
    }));
    expect(html).toContain('____/____/________'); // lacuna pra preencher à mão
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Invalid Date');
  });
});
