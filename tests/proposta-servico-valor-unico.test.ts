import { describe, it, expect } from 'vitest';
import {
  isPropostaSoServico,
  mapServicosTitulos,
  totalServicoData,
  buildServiceOnlyData,
} from '../src/modules/proposal-assistant.js';
import { renderServiceOnlyHTML } from '../src/modules/proposal/service-render.js';

// Caso real Thiago Castro (18/06): serviço sem solar, VALOR ÚNICO R$7.800,
// tarefas SEM preço por item. Antes estourava "potenciaKwp inválido: 0".
const thiago = {
  nomeCliente: 'Thiago Castro',
  potenciaKwp: 0,
  valorTotalRs: 7800,
  servicos: [
    { titulo: 'Desmontagem do sistema', descricao: '12 placas + inversor/microinversor' },
    { titulo: 'Transporte', descricao: 'Jardim Botânico → Jardim Botânico' },
    { titulo: 'Reinstalação + limpeza + adequação', descricao: '' },
    { titulo: 'Projeto para novo local', descricao: '' },
  ],
};

describe('proposta só-serviço com VALOR ÚNICO (lump sum)', () => {
  it('mapServicosTitulos mantém as tarefas mesmo SEM preço por item', () => {
    const s = mapServicosTitulos(thiago.servicos);
    expect(s).toBeDefined();
    expect(s!.length).toBe(4);
    expect(s!.every(x => x.valorRs === 0)).toBe(true);
    expect(s![0].titulo).toBe('Desmontagem do sistema');
  });

  it('totalServicoData usa o valorTotalRs quando não há preço por item', () => {
    const s = mapServicosTitulos(thiago.servicos)!;
    expect(totalServicoData(thiago, s)).toBe(7800);
  });

  it('totalServicoData soma os itens quando ELES têm preço', () => {
    const data = { valorTotalRs: 0 };
    const s = [{ titulo: 'A', descricao: '', valorRs: 2000 }, { titulo: 'B', descricao: '', valorRs: 500 }];
    expect(totalServicoData(data, s as any)).toBe(2500);
  });

  it('isPropostaSoServico = true para serviço com valor único (caso Thiago)', () => {
    expect(isPropostaSoServico(thiago)).toBe(true);
  });

  it('isPropostaSoServico = false se NÃO há total nenhum (nem item, nem valorTotalRs)', () => {
    expect(isPropostaSoServico({ ...thiago, valorTotalRs: 0 })).toBe(false);
  });

  it('isPropostaSoServico = false quando tem solar (kWp > 0)', () => {
    expect(isPropostaSoServico({ ...thiago, potenciaKwp: 5 })).toBe(false);
  });

  it('ainda funciona com preço por item (caso Edmilson — não regride)', () => {
    const edmilson = { nomeCliente: 'E', potenciaKwp: 0, servicos: [{ titulo: 'Adequação de padrão', descricao: '', valorRs: 2500 }] };
    expect(isPropostaSoServico(edmilson)).toBe(true);
  });

  it('PDF de valor único: total = R$ 7.800 e NÃO mostra "R$ 0" por tarefa', () => {
    const servicos = mapServicosTitulos(thiago.servicos)!;
    const sd = buildServiceOnlyData({
      numeroProposta: '2026-TEST',
      dataProposta: '18/06/2026',
      data: thiago,
      servicos,
      empresa: { nome: 'EcoSunPower', cnpj: '00.000.000/0001-00', cidade: 'Brasília', telefone: '61999999999', site: 'ecosunpower.eng.br' },
      criarPagamentoPadrao: () => [],
    });
    expect(sd.totalRs).toBe(7800);
    const html = renderServiceOnlyHTML(sd);
    expect(html).toContain('R$ 7.800');
    expect(html).not.toContain('R$ 0<'); // nenhuma tarefa renderizada com preço zerado
  });
});
