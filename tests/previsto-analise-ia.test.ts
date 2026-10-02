import { describe, it, expect } from 'vitest';
import { montarDossie, interpretarAnalise, analiseEmCache, guardarAnalise, type DossieUsina } from '../src/modules/monitoring/previsto/analise-ia.js';
import { renderAnaliseIaBody } from '../src/modules/dashboard/previsto-views.js';

const dossie: DossieUsina = {
  nome: 'Casa Ana', kwp: 5.6, local: 'Brasília · DF', marca: 'goodwe',
  premissas: { azimute: 0, inclinacao: 15, kwp: 5.6, aninhado: { x: 1 } },
  dias: [
    { data: '2026-09-30', previsto: 28, real: 27.1, clima: 'limpo', indiceCeu: 0.95 },
    { data: '2026-10-01', previsto: 27.5, real: null, clima: 'parcial', indiceCeu: 0.7 },
  ],
  regras: [{ tipo: 'sujeira', titulo: 'Sujeira acumulando', confianca: 'possivel', evidencia: 'queda de 1%/semana', acao: 'limpar' }],
  calibracao: null,
  rede: [{ dia: '2026-10-01', vMin: 215, vMax: 246, desarmes: 2, nivel: 'critico' }],
  alertaAberto: null,
};

describe('Analisar usina com IA', () => {
  it('dossiê traz só números reais, marca dia sem leitura e ignora objetos', () => {
    const t = montarDossie(dossie);
    expect(t).toContain('2026-09-30 | prev 28 | real 27.1 | -3% | limpo | céu 0.95');
    expect(t).toContain('2026-10-01 | prev 27.5 | real — | — | parcial');
    expect(t).toContain('Sujeira acumulando (possivel)');
    expect(t).toContain('2026-10-01 | 215 | 246 | 2 | critico');
    expect(t).toContain('CALIBRAÇÃO: ainda não calibrada');
    expect(t).not.toContain('aninhado');
  });

  it('valida o JSON da IA: tipo de OS fora da lista vira null, chance desconhecida vira baixa', () => {
    const a = interpretarAnalise('blá {"resumo":"Usina 3% abaixo.","hipoteses":[{"titulo":"Corte por tensão","chance":"alta","evidencias":["246 V em 01/10"],"como_confirmar":"ver log","tipo_os":"revisao_eletrica"},{"titulo":"X","chance":"enorme","tipo_os":"demolir"}],"proximo_passo":"Pedir à distribuidora","falta_dado":["curva hora a hora"]} fim');
    expect(a.hipoteses[0]).toMatchObject({ chance: 'alta', tipoOs: 'revisao_eletrica' });
    expect(a.hipoteses[1]).toMatchObject({ chance: 'baixa', tipoOs: null, evidencias: [] });
    expect(interpretarAnalise('sem json').hipoteses).toEqual([]);
  });

  it('cache de 30 min por usina/dia', () => {
    const a = interpretarAnalise('{"resumo":"ok","hipoteses":[],"proximo_passo":"nada"}');
    guardarAnalise('u|d', a, 1000);
    expect(analiseEmCache('u|d', 1000 + 29 * 60_000)).toBe(a);
    expect(analiseEmCache('u|d', 1000 + 31 * 60_000)).toBeNull();
  });

  it('tela: hipótese com OS vira botão com motivo escrito (escapado)', () => {
    const a = interpretarAnalise('{"resumo":"r","hipoteses":[{"titulo":"Corte <por> tensão","chance":"alta","evidencias":["246 V"],"como_confirmar":"ver log","tipo_os":"revisao_eletrica"}]}');
    const h = renderAnaliseIaBody({ sistemaId: 's1', nome: 'Casa', analise: a, doCache: false });
    expect(h).toContain('Corte &lt;por&gt; tensão');
    expect(h).toContain('name="tipo" value="revisao_eletrica"');
    expect(h).toContain('Abrir OS de revisão elétrica');
    expect(h).toContain('/dashboard/monitoramento/s1/previsto');
  });
});
