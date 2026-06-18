import { describe, it, expect } from 'vitest';
import { detectarNumeroProibido } from '../src/modules/eva-trava-numero.js';

describe('detectarNumeroProibido — barra número de preço/dimensionamento na fala da Eva', () => {
  it('barra preço de sistema em reais', () => {
    expect(detectarNumeroProibido('fica entre R$25 mil e R$35 mil').bloqueado).toBe(true);
    expect(detectarNumeroProibido('o sistema sai por R$ 28.000').bloqueado).toBe(true);
  });
  it('barra kWp e quantidade de painéis', () => {
    expect(detectarNumeroProibido('um sistema de 6 kWp').bloqueado).toBe(true);
    expect(detectarNumeroProibido('uns 7 painéis já resolvem').bloqueado).toBe(true);
  });
  it('barra kWh e payback', () => {
    expect(detectarNumeroProibido('você gera 650 kWh/mês').bloqueado).toBe(true);
    expect(detectarNumeroProibido('payback de 4 anos').bloqueado).toBe(true);
  });
  it('NÃO barra pergunta sobre a conta do cliente nem frases sem número', () => {
    expect(detectarNumeroProibido('me confirma: sua conta veio R$600 na última?').bloqueado).toBe(false);
    expect(detectarNumeroProibido('o Junior pode te atender agora?').bloqueado).toBe(false);
    expect(detectarNumeroProibido('amanhã qual horário fica melhor?').bloqueado).toBe(false);
  });
  it('NÃO barra o bônus de indicação (R$300 no PIX) — não é preço de sistema', () => {
    expect(detectarNumeroProibido('se você indicar e a venda fechar, ganha R$300 no PIX!').bloqueado).toBe(false);
  });
  it('NÃO barra "em N anos" genérico (garantia/experiência)', () => {
    expect(detectarNumeroProibido('a garantia da instalação é de 1 ano, e do painel 25 anos').bloqueado).toBe(false);
    expect(detectarNumeroProibido('a gente está no mercado há vários anos').bloqueado).toBe(false);
  });
  it('NÃO barra a pergunta de qualificação do valor exato da conta (script do prompt)', () => {
    const linha = 'você marcou que a conta fica entre R$301 e R$700 — quanto veio na última conta, certinho? É com esse número que eu calculo sua economia.';
    expect(detectarNumeroProibido(linha).bloqueado).toBe(false);
  });
  it('BARRA preço de sistema mesmo com "indicação" na mesma mensagem (sem suppression global)', () => {
    expect(detectarNumeroProibido('na indicação seu sistema sai R$25 mil').bloqueado).toBe(true);
  });
  it('NÃO barra leitura da conta do cliente que menciona kWh (caminho da foto/PDF)', () => {
    expect(detectarNumeroProibido('li sua conta: deu R$600, uns 850 kWh/mês, confere?').bloqueado).toBe(false);
  });
  it('BARRA preço de sistema (≥ R$6.000) mas libera conta/indicação (< R$6.000)', () => {
    expect(detectarNumeroProibido('o sistema fica em R$ 13.550').bloqueado).toBe(true);
    expect(detectarNumeroProibido('sua conta de R$ 1.200 dá pra resolver bem').bloqueado).toBe(false);
  });
  it('BARRA preço SEM separador de milhar (R$ 28000, R$ 9600)', () => {
    expect(detectarNumeroProibido('o sistema sai R$ 28000').bloqueado).toBe(true);
    expect(detectarNumeroProibido('fica em torno de R$ 9600').bloqueado).toBe(true);
    // conta sem separador continua liberada
    expect(detectarNumeroProibido('sua conta veio R$ 600').bloqueado).toBe(false);
  });
});
