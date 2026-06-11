// tests/abordagem-regras.test.ts
import { describe, it, expect } from 'vitest';
import {
  podeAbordar, decidirTipoMilestone, RITMO, diasDesde,
} from '../src/modules/monitoring/abordagem/regras.js';

const diario = {
  abordagemAbertaId: null, ultimoParabensEnviadoEm: null,
  ultimaOfertaLimpezaEm: null, descartadaPeloJuniorEm: null,
  causaRaizAnterior: null, jaTeveDepoimento: false,
  ultimaMsgProativaAoLeadEm: null,
};
const lead = { id: 'l1', optOut: false };
const hoje = new Date('2026-06-11T15:00:00Z');

describe('abordagem/regras: elegibilidade básica', () => {
  it('tudo ok → pode', () => {
    expect(podeAbordar('queda', lead, diario, hoje).ok).toBe(true);
  });
  it('opt-out NUNCA aborda', () => {
    const r = podeAbordar('queda', { ...lead, optOut: true }, diario, hoje);
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('opt');
  });
  it('abordagem aberta na usina → não abre outra', () => {
    expect(podeAbordar('queda', lead, { ...diario, abordagemAbertaId: 'x' }, hoje).ok).toBe(false);
  });
  it('mesmo lead recebeu proativa hoje (outra usina) → espera', () => {
    expect(podeAbordar('queda', lead, { ...diario, ultimaMsgProativaAoLeadEm: '2026-06-11T09:00:00Z' }, hoje).ok).toBe(false);
    expect(podeAbordar('queda', lead, { ...diario, ultimaMsgProativaAoLeadEm: '2026-06-10T09:00:00Z' }, hoje).ok).toBe(true);
  });
  it('Junior descartou esse tipo há <30d → não re-propõe', () => {
    expect(podeAbordar('queda', lead, { ...diario, descartadaPeloJuniorEm: '2026-06-01T00:00:00Z' }, hoje).ok).toBe(false);
    expect(podeAbordar('queda', lead, { ...diario, descartadaPeloJuniorEm: '2026-05-01T00:00:00Z' }, hoje).ok).toBe(true);
  });
});

describe('abordagem/regras: ritmos por tipo', () => {
  it('parabéns respeita 90 dias', () => {
    expect(podeAbordar('parabens', lead, { ...diario, ultimoParabensEnviadoEm: '2026-05-01T00:00:00Z' }, hoje).ok).toBe(false);
    expect(podeAbordar('parabens', lead, { ...diario, ultimoParabensEnviadoEm: '2026-03-01T00:00:00Z' }, hoje).ok).toBe(true);
  });
  it('limpeza não reoferece <30d (vale pro tipo queda)', () => {
    expect(podeAbordar('queda', lead, { ...diario, ultimaOfertaLimpezaEm: '2026-06-01T00:00:00Z' }, hoje).ok).toBe(false);
  });
});

describe('abordagem/regras: milestone vira depoimento ou parabéns', () => {
  it('1ª vez → depoimento', () => {
    expect(decidirTipoMilestone(diario)).toBe('depoimento');
  });
  it('já teve depoimento → parabéns', () => {
    expect(decidirTipoMilestone({ ...diario, jaTeveDepoimento: true })).toBe('parabens');
  });
});

describe('abordagem/regras: util', () => {
  it('diasDesde calcula certo', () => {
    expect(diasDesde('2026-06-08T15:00:00Z', hoje)).toBe(3);
    expect(diasDesde(null, hoje)).toBeNull();
  });
  it('constantes de ritmo travadas', () => {
    expect(RITMO).toEqual({ PARABENS_DIAS: 90, LIMPEZA_DIAS: 30, DESCARTE_DIAS: 30, LEMBRETE_DIAS: 3, ENCERRA_DIAS: 3, REAGENDA_PADRAO_DIAS: 2 });
  });
});
