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
});
