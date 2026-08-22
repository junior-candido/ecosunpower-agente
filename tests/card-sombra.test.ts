// tests/card-sombra.test.ts
import { describe, it, expect } from 'vitest';
import { montarCardSombra, montarCardSombraErro } from '../src/modules/vendas/card-sombra.js';

const resultado = {
  ok: true as const, consumoAlvoKwh: 734, kwpAlvo: 6.43, telhado: 'ceramico' as const, servicoRsPorWp: 0.80,
  opcoes: [
    { rotulo: 'A' as const, moduloMarca: 'Risen', moduloModelo: '715', moduloWp: 715, modulos: 9, microMarca: 'Hoymiles', microModelo: 'HMS-2000-4T', micros: 3, kwpReal: 6.44, kit: 16727.7, servico: 5148, total: 21875.7, rsPorWp: 3.4, parcela18x: 1362.33, greener: { rotulo: '🚨 Muito acima do mercado', rsPorWpReferencia: 2.21 } },
    { rotulo: 'B' as const, moduloMarca: 'JA', moduloModelo: '625', moduloWp: 625, modulos: 11, microMarca: 'Sungrow', microModelo: 'S2500S-L', micros: 3, kwpReal: 6.88, kit: 18182.5, servico: 5500, total: 23682.5, rsPorWp: 3.445, parcela18x: null, greener: { rotulo: '🚨 Muito acima do mercado', rsPorWpReferencia: 2.21 } },
  ],
  avisos: [{ tipo: 'acima_mercado' as const, texto: 'A a 3.40 R$/Wp — acima do teto 2.60 R$/Wp' }],
};

describe('montarCardSombra', () => {
  it('segue o formato da spec §5 com selo de sombra, telhado assumido e avisos', () => {
    const txt = montarCardSombra({
      nome: 'Joel', cidade: 'Lago Oeste', versao: 1, faixa: 'autonoma', telhadoAssumido: true,
      consumoFatura: 734, cargaFutura: null, resultado,
    });
    expect(txt).toContain('🕶️ SOMBRA v1 — Joel (Lago Oeste)');
    expect(txt).toContain('734 kWh · telhado: assumido cerâmico · 6,43 kWp alvo · serviço 0,80 R$/Wp');
    expect(txt).toContain('A) 9× Risen 715 + 3× Hoymiles HMS-2000-4T = 6,44 kWp');
    expect(txt).toContain('kit 16.727,70 + serv 5.148,00 = *21.875,70* (3,40 R$/Wp) · 18× 1.362,33');
    expect(txt).toContain('B) 11× JA 625 + 3× Sungrow S2500S-L = 6,88 kWp');
    expect(txt).toContain('kit 18.182,50 + serv 5.500,00 = *23.682,50* (3,45 R$/Wp)');
    expect(txt).not.toContain('18× null');
    expect(txt).toContain('⚠️ A a 3.40 R$/Wp');
    expect(txt).toContain('Nada foi enviado ao cliente');
    expect(txt).toContain('/tabela');
  });

  it('carga futura aparece quando é ela que manda', () => {
    const txt = montarCardSombra({ nome: 'Ana', cidade: null, versao: 2, faixa: 'autonoma', telhadoAssumido: false, consumoFatura: 400, cargaFutura: 800, resultado: { ...resultado, consumoAlvoKwh: 800 } });
    expect(txt).toContain('🕶️ SOMBRA v2 — Ana');
    expect(txt).toContain('800 kWh (fatura 400 + carga futura 800)');
    expect(txt).toContain('telhado: cerâmico');
  });

  it('faixa chama_junior vem sinalizada', () => {
    const txt = montarCardSombra({ nome: 'Big', cidade: null, versao: 1, faixa: 'chama_junior', telhadoAssumido: true, consumoFatura: 2000, cargaFutura: null, resultado: { ...resultado, consumoAlvoKwh: 2000 } });
    expect(txt).toContain('🙋 acima de 1.500 kWh — na vida real seria "preciso de você"');
  });
});

describe('montarCardSombraErro', () => {
  it('tabela incompleta lista o que falta com exemplo de comando', () => {
    const txt = montarCardSombraErro({ nome: 'Joel', erro: 'tabela_incompleta', faltando: ['estrutura fibrocimento', 'cabos'] });
    expect(txt).toContain('🕶️ SOMBRA — Joel');
    expect(txt).toContain('falta na tabela: estrutura fibrocimento, cabos');
    expect(txt).toContain('/tabela estrutura fibrocimento = ');
  });
  it('sem dados explica', () => {
    expect(montarCardSombraErro({ nome: 'Joel', erro: 'sem_dados', faltando: [] })).toContain('sem consumo');
    expect(montarCardSombraErro({ nome: 'Joel', erro: 'fluxo_atual', faltando: [] })).toContain('abaixo de 500');
  });
});
