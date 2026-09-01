// tests/solar-params-regiao-tenant.test.ts
// Bug real (31/08/2026, lead Claudio de Vitória da Conquista-BA): a regra do DF
// é /neoenergia|ceb|brasília|distrito federal|df/ — e a distribuidora da Bahia é
// "Neoenergia Coelba". A Bahia inteira recebia HSP e tarifa de BRASÍLIA. Pior:
// esse casamento acontecia ANTES do ajuste por empresa, então nem adiantava o
// tenant configurar a região dele.
import { describe, it, expect } from 'vitest';
import { hspPorConcessionaria, tarifaPorConcessionaria } from '../src/modules/solar-params.js';
import { normalizarEmpresaRow } from '../src/modules/empresa-config.js';

const conquista = normalizarEmpresaRow({
  company_id: 'c1a2b3c4-0000-0000-0000-00000000aaaa',
  nome_fantasia: 'Conquista Solar',
  cidade: 'Vitória da Conquista', uf: 'BA',
  hsp_padrao: 5.4, tarifa_kwh_padrao: 1.25,
});

const HSP_DF = 5.40;
const TARIFA_DF = 1.05;

describe('Coelba (Bahia) não pode receber os números de Brasília', () => {
  it('"Neoenergia Coelba" não usa a tarifa do DF', () => {
    expect(tarifaPorConcessionaria('Neoenergia Coelba')).not.toBe(TARIFA_DF);
  });

  it('"Coelba" sozinha também não', () => {
    expect(tarifaPorConcessionaria('Coelba')).not.toBe(TARIFA_DF);
  });

  it('"Vitória da Conquista - BA" não usa a tarifa do DF', () => {
    expect(tarifaPorConcessionaria('Vitória da Conquista - BA')).not.toBe(TARIFA_DF);
  });

  it('a Neoenergia do DF continua sendo do DF', () => {
    expect(hspPorConcessionaria('Neoenergia Distrito Federal')).toBe(HSP_DF);
    expect(tarifaPorConcessionaria('Neoenergia-DF')).toBe(TARIFA_DF);
    expect(tarifaPorConcessionaria('Brasília')).toBe(TARIFA_DF);
  });

  it('Goiás/Equatorial continua igual', () => {
    expect(tarifaPorConcessionaria('Equatorial Goiás')).toBe(1.00);
  });
});

describe('o ajuste da EMPRESA manda mais que o mapa regional', () => {
  it('tenant com hsp/tarifa configurados usa os DELE, mesmo dizendo "Neoenergia"', () => {
    expect(tarifaPorConcessionaria('Neoenergia Coelba', conquista)).toBe(1.25);
    expect(hspPorConcessionaria('Neoenergia Coelba', conquista)).toBe(5.4);
  });

  it('tenant configurado vence até quando o texto diz "Brasília"', () => {
    expect(tarifaPorConcessionaria('Brasília', conquista)).toBe(1.25);
  });

  it('a EcoSunPower (sem hsp/tarifa próprios) continua no mapa DF/GO', () => {
    expect(tarifaPorConcessionaria('Brasília')).toBe(TARIFA_DF);
  });
});
