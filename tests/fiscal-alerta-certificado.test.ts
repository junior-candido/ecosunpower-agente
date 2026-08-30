import { describe, it, expect } from 'vitest';
import { mensagemAlertaCertificado } from '../src/modules/financeiro/fiscal/alerta-certificado.js';

describe('fiscal alerta certificado', () => {
  it('avisa a 30, 15 e 5 dias e no vencido; silencioso fora disso', () => {
    expect(mensagemAlertaCertificado('2026-09-29', '2026-08-30')).toContain('30 dias');
    expect(mensagemAlertaCertificado('2026-09-14', '2026-08-30')).toContain('15 dias');
    expect(mensagemAlertaCertificado('2026-09-04', '2026-08-30')).toContain('5 dias');
    expect(mensagemAlertaCertificado('2026-08-29', '2026-08-30')).toContain('VENCEU');
    expect(mensagemAlertaCertificado('2026-12-25', '2026-08-30')).toBeNull();
    expect(mensagemAlertaCertificado(null, '2026-08-30')).toBeNull();
  });
});
