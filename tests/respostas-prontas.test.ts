// Atendimento Parte 2c — respostas prontas. Texto editável antes de enviar;
// no número da Eva com a janela fechada, cada uma vira o MODELO aprovado
// correspondente (ou nenhum, se não houver modelo aprovado pra ela).
import { describe, it, expect } from 'vitest';
import { respostasProntas, RESPOSTAS_PRONTAS } from '../src/modules/dashboard/respostas-prontas.js';

const aprovados = ['reativacao_lead_v1', 'eva_proposta_aberta_v1'];

describe('respostasProntas', () => {
  it('as 5 do Junior, na ordem: boas-vindas, conta de luz, proposta, visita, financiamento', () => {
    expect(RESPOSTAS_PRONTAS.map((r) => r.id)).toEqual(['boas_vindas', 'pedir_conta', 'enviar_proposta', 'agendar_visita', 'financiamento']);
  });

  it('preenche nome do cliente (1º nome), quem escreve (1º nome) e a empresa', () => {
    const r = respostasProntas({ nomeCliente: 'Ana Maria Souza', eu: 'Junior Silva', empresa: 'EcoSunPower', modelosAprovados: aprovados });
    const bv = r.find((x) => x.id === 'boas_vindas')!;
    expect(bv.texto).toContain('Oi, Ana!');
    expect(bv.texto).toContain('Aqui é Junior, da EcoSunPower');
    expect(r.every((x) => !/\{[a-z]+\}/.test(x.texto))).toBe(true);
  });

  it('sem nome do cliente: sem vírgula sobrando', () => {
    const bv = respostasProntas({ nomeCliente: null, eu: 'Junior', empresa: 'EcoSunPower', modelosAprovados: [] }).find((x) => x.id === 'boas_vindas')!;
    expect(bv.texto.startsWith('Oi! Aqui é Junior')).toBe(true);
    const conta = respostasProntas({ nomeCliente: '', eu: 'Junior', empresa: 'X', modelosAprovados: [] }).find((x) => x.id === 'pedir_conta')!;
    expect(conta.texto.startsWith('Para eu calcular')).toBe(true);
  });

  it('fora da janela: cada uma aponta o modelo aprovado correspondente (proposta → eva_proposta_aberta_v1; resto → retomar)', () => {
    const r = respostasProntas({ nomeCliente: 'Ana', eu: 'Junior', empresa: 'EcoSunPower', modelosAprovados: aprovados });
    const m = Object.fromEntries(r.map((x) => [x.id, x.modelo]));
    expect(m).toEqual({
      boas_vindas: 'reativacao_lead_v1', pedir_conta: 'reativacao_lead_v1', enviar_proposta: 'eva_proposta_aberta_v1',
      agendar_visita: 'reativacao_lead_v1', financiamento: 'reativacao_lead_v1',
    });
  });

  it('boas-vindas prefere o modelo de primeiro contato quando ele está aprovado', () => {
    const r = respostasProntas({ nomeCliente: 'Ana', eu: 'Junior', empresa: 'EcoSunPower', modelosAprovados: ['_eva_qualificacao_v1', 'reativacao_lead_v1'] });
    expect(r.find((x) => x.id === 'boas_vindas')!.modelo).toBe('_eva_qualificacao_v1');
  });

  it('sem modelo aprovado: modelo = null (a tela não oferece fora da janela)', () => {
    const r = respostasProntas({ nomeCliente: 'Ana', eu: 'Junior', empresa: 'EcoSunPower', modelosAprovados: [] });
    expect(r.every((x) => x.modelo === null)).toBe(true);
  });

  it('nenhuma resposta promete preço, prazo ou taxa (a Eva nunca crava preço)', () => {
    for (const r of RESPOSTAS_PRONTAS) expect(r.texto).not.toMatch(/R\$|\d+\s*(x|vezes|%)|juros/i);
  });
});
