import { describe, it, expect, vi } from 'vitest';
import { tabelaAusente, avisarMigrationAusente } from '../src/modules/energia/db-erros.js';

describe('tabelaAusente (migrations 136/137 ainda não aplicadas)', () => {
  it('reconhece os códigos do Postgres e do PostgREST', () => {
    expect(tabelaAusente({ code: '42P01', message: 'relation "medidores_energia" does not exist' })).toBe(true);
    expect(tabelaAusente({ code: 'PGRST205', message: "Could not find the table 'public.energia_15min' in the schema cache" })).toBe(true);
    expect(tabelaAusente({ code: '42703', message: 'column medicoes_shelly.medidor_id does not exist' })).toBe(true);
  });
  it('outros erros não são "tabela ausente"', () => {
    expect(tabelaAusente({ code: '23505', message: 'duplicate key' })).toBe(false);
    expect(tabelaAusente(null)).toBe(false);
  });
  it('avisa no máximo 1x por hora', () => {
    const w = vi.spyOn(console, 'warn').mockImplementation(() => {});
    avisarMigrationAusente('a', 10 * 3_600_000);
    avisarMigrationAusente('b', 10 * 3_600_000 + 1000);
    expect(w).toHaveBeenCalledTimes(1);
    w.mockRestore();
  });
});
