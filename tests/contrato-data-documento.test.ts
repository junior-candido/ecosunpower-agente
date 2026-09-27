import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from 'vitest';
import { renderContrato } from '../src/modules/closing/templates/contrato.html.js';
import { renderProcuracao } from '../src/modules/closing/templates/procuracao.html.js';
import { renderAditivo } from '../src/modules/closing/templates/aditivo.html.js';
import { dadosFechamentoCamilaMesmaPessoa } from './fixtures/closing-camila.js';

// A data impressa: a do congelamento (data_documento) quando existe; senão, hoje
// em BRASÍLIA — nunca o dia do servidor (UTC).
describe('data impressa nos documentos', () => {
  // Simula o servidor de produção (UTC), seja qual for o fuso desta máquina.
  const tzOriginal = process.env.TZ;
  beforeAll(() => { process.env.TZ = 'UTC'; });
  afterAll(() => { if (tzOriginal === undefined) delete process.env.TZ; else process.env.TZ = tzOriginal; });
  afterEach(() => { vi.useRealTimers(); });

  it('com data_documento (contrato congelado) → imprime ela, não a de hoje', () => {
    const dados = { ...dadosFechamentoCamilaMesmaPessoa, data_documento: '2026-07-13' };
    expect(renderContrato(dados)).toContain('13 de julho de 2026');
    expect(renderProcuracao(dados)).toContain('13 de julho de 2026');
    expect(renderAditivo(dados)).toContain('13/07/2026');
  });

  it('sem data_documento, às 22:30 em Brasília (servidor já no dia seguinte em UTC) → dia de Brasília', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T01:30:00Z')); // 27/09 22:30 BRT
    const dados = { ...dadosFechamentoCamilaMesmaPessoa };
    const contrato = renderContrato(dados);
    const procuracao = renderProcuracao(dados);
    expect(contrato).toContain('27 de setembro de 2026');
    expect(contrato).not.toContain('28 de setembro de 2026');
    expect(procuracao).toContain('27 de setembro de 2026');
    expect(procuracao).not.toContain('28 de setembro de 2026');
  });
});
