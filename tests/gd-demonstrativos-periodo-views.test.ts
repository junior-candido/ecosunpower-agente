import { describe, it, expect } from 'vitest';
import {
  renderDemonstrativoCliente, renderConfirmarEnvioRelatorio, type ConfirmarEnvioRelatorio,
} from '../src/modules/dashboard/demonstrativos-views.js';

const MESES = ['2026-08-01', '2026-07-01', '2026-06-01', '2026-05-01', '2026-04-01', '2026-03-01'];
const base = {
  instalacao: '200002', clienteNome: 'JOAO', leadId: 'L1', meses: MESES, mes: '2026-08-01',
  consumoKwh: 480, injetadoKwh: 222, saldoKwh: 1240, compensadoKwh: 380, economiaRs: 376.2,
  proximoExpirar: null, historico: [], unidades: [], origemDemonstrativo: 'email', verificado: true,
  candidatos: [], msg: null,
  validacao: { estado: 'pronto' as const, bloqueios: [], pendencias: [], avisos: [], geracaoKwh: 612, origemGeracao: 'api' as const, esperadoMesKwh: 640 },
};

describe('tela do cliente — relatório do período', () => {
  it('formulário "de … até …" com os meses que têm demonstrativo e os 3 botões', () => {
    const h = renderDemonstrativoCliente(base);
    expect(h).toContain('📊 Relatório do período');
    expect(h).toContain('name="de"');
    expect(h).toContain('name="ate"');
    for (const m of MESES) expect(h).toContain(`<option value="${m}"`);
    expect(h).toContain('formaction="/dashboard/demonstrativos/200002/periodo.html"');
    expect(h).toContain('formaction="/dashboard/demonstrativos/200002/periodo.pdf"');
    expect(h).toContain('formaction="/dashboard/demonstrativos/200002/periodo/enviar"');
  });
  it('padrão: até = mês aberto; de = 3 meses antes (quando existe)', () => {
    const h = renderDemonstrativoCliente(base);
    expect(h).toMatch(/name="de"[\s\S]*?<option value="2026-05-01" selected>/);
    expect(h).toMatch(/name="ate"[\s\S]*?<option value="2026-08-01" selected>/);
  });
  it('aparece mesmo com o mês aberto fora do 🟢 (o servidor confere mês a mês)', () => {
    const h = renderDemonstrativoCliente({ ...base,
      validacao: { estado: 'falta_dado', bloqueios: [], pendencias: ['x'], avisos: [], geracaoKwh: null, origemGeracao: null, esperadoMesKwh: null } });
    expect(h).toContain('📊 Relatório do período');
  });
  it('não aparece com um mês só ou sem cliente ligado', () => {
    expect(renderDemonstrativoCliente({ ...base, meses: ['2026-08-01'] })).not.toContain('📊 Relatório do período');
    expect(renderDemonstrativoCliente({ ...base, leadId: null })).not.toContain('📊 Relatório do período');
  });
});

const conf = (o: Partial<ConfirmarEnvioRelatorio> = {}): ConfirmarEnvioRelatorio => ({
  instalacao: '200002', mes: '2026-08-01', mesExtenso: 'maio a agosto de 2026', clienteNome: 'JOAO', canal: 'casa',
  zap: { para: '5561991718505', motivo: null, texto: 'Olá' }, email: null, linkExemplo: 'https://p.x/rg/…', ultimoEnvio: null,
  periodo: { de: '2026-05-01', ate: '2026-08-01' }, ...o,
});

describe('confirmação do envio — período', () => {
  it('manda para a rota do período com de/até e a prévia é a do período', () => {
    const h = renderConfirmarEnvioRelatorio(conf());
    expect(h).toContain('Enviar o relatório de maio a agosto de 2026 para JOAO');
    expect(h).toContain('action="/dashboard/demonstrativos/200002/periodo/enviar?de=2026-05-01&amp;ate=2026-08-01"');
    expect(h).toContain('/dashboard/demonstrativos/200002/periodo.html?de=2026-05-01&amp;ate=2026-08-01');
    expect(h).not.toContain('/enviar?mes=');
  });
  it('sem período continua o mensal', () => {
    const h = renderConfirmarEnvioRelatorio(conf({ periodo: undefined, mesExtenso: 'agosto de 2026' }));
    expect(h).toContain('action="/dashboard/demonstrativos/200002/enviar?mes=2026-08-01"');
  });
});
