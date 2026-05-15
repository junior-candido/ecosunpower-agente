import { describe, it, expect } from 'vitest';
import { isHotLeadByEnergy, hotLeadTier } from '../src/modules/eva-alerts.js';

// Rede de proteção: lead é "quente" pelos DADOS (independente da Eva fechar).
// Criterio minimo oficial: conta >= R$700 OU consumo >= 700 kWh/mes.
describe('isHotLeadByEnergy', () => {
  it('conta >= 700 -> quente', () => {
    expect(isHotLeadByEnergy({ monthly_bill: 800 })).toBe(true);
    expect(isHotLeadByEnergy({ monthly_bill: 700 })).toBe(true); // limiar inclusivo
  });

  it('consumo >= 700 kWh -> quente (caso Carol: 789/1578)', () => {
    expect(isHotLeadByEnergy({ consumption_kwh: 789 })).toBe(true);
    expect(isHotLeadByEnergy({ monthly_bill: 1460, consumption_kwh: 1578 })).toBe(true);
  });

  it('abaixo do criterio -> nao quente', () => {
    expect(isHotLeadByEnergy({ monthly_bill: 300, consumption_kwh: 200 })).toBe(false);
    expect(isHotLeadByEnergy({ consumption_kwh: 699 })).toBe(false);
  });

  it('coage string numerica', () => {
    expect(isHotLeadByEnergy({ monthly_bill: '800' })).toBe(true);
    expect(isHotLeadByEnergy({ consumption_kwh: '500' })).toBe(false);
  });

  it('degrada com graca: vazio/null/lixo -> false (nunca lanca)', () => {
    expect(isHotLeadByEnergy({})).toBe(false);
    expect(isHotLeadByEnergy(null)).toBe(false);
    expect(isHotLeadByEnergy(undefined)).toBe(false);
    expect(isHotLeadByEnergy('lixo')).toBe(false);
    expect(isHotLeadByEnergy({ monthly_bill: 'abc' })).toBe(false);
  });
});

describe('hotLeadTier (espelha heuristica do qualification_complete)', () => {
  it('>= 1500 -> QUENTE', () => {
    expect(hotLeadTier(1500)).toBe('🔥 QUENTE');
    expect(hotLeadTier(3000)).toBe('🔥 QUENTE');
  });
  it('700..1499 -> MORNO', () => {
    expect(hotLeadTier(700)).toBe('🟠 MORNO');
    expect(hotLeadTier(1499)).toBe('🟠 MORNO');
  });
  it('< 700 ou ausente -> FRIO', () => {
    expect(hotLeadTier(699)).toBe('🔵 FRIO');
    expect(hotLeadTier(0)).toBe('🔵 FRIO');
    expect(hotLeadTier(null)).toBe('🔵 FRIO');
    expect(hotLeadTier(undefined)).toBe('🔵 FRIO');
  });

  // BUG real em prod: lead de 6000 kWh sem conta em R$ aparecia 🔵 FRIO
  // porque o tier so olhava monthly_bill. Tem que olhar kWh tambem.
  it('considera kWh tambem (nao so R$)', () => {
    expect(hotLeadTier(0, 6000)).toBe('🔥 QUENTE');   // baleia: 6000 kWh, sem bill
    expect(hotLeadTier(null, 1500)).toBe('🔥 QUENTE');
    expect(hotLeadTier(0, 1100)).toBe('🟠 MORNO');
    expect(hotLeadTier(0, 700)).toBe('🟠 MORNO');
    expect(hotLeadTier(0, 699)).toBe('🔵 FRIO');
    expect(hotLeadTier(2000, 100)).toBe('🔥 QUENTE'); // R$ manda quando alto
    expect(hotLeadTier(undefined, undefined)).toBe('🔵 FRIO');
  });
});
