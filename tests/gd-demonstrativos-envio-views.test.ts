// tests/gd-demonstrativos-envio-views.test.ts
import { describe, it, expect } from 'vitest';
import {
  renderDemonstrativoCliente, renderConfirmarEnvioRelatorio, textoUltimoEnvio, type ConfirmarEnvioRelatorio,
} from '../src/modules/dashboard/demonstrativos-views.js';

const base = {
  instalacao: '200002', clienteNome: 'JOAO', leadId: 'L1', meses: ['2026-08-01'], mes: '2026-08-01',
  consumoKwh: 480, injetadoKwh: 222, saldoKwh: 1240, compensadoKwh: 380, economiaRs: 376.2,
  proximoExpirar: null, historico: [], unidades: [], origemDemonstrativo: 'email', verificado: true,
  candidatos: [], msg: null,
};
const pronto = { estado: 'pronto' as const, bloqueios: [], pendencias: [], avisos: [], geracaoKwh: 612, origemGeracao: 'api' as const, esperadoMesKwh: 640 };
const ENVIO = { enviadoEm: '2026-09-27T13:05:00Z', zapPara: '5561991718505', emailPara: 'j@x.com' };

describe('tela do cliente — enviar pela Eva', () => {
  it('mês 🟢 mostra o botão de enviar', () => {
    const h = renderDemonstrativoCliente({ ...base, validacao: pronto });
    expect(h).toContain('href="/dashboard/demonstrativos/200002/enviar?mes=2026-08-01"');
    expect(h).toContain('📲 Enviar ao cliente pela Eva');
  });
  it('mês fora do 🟢 não tem botão de enviar', () => {
    const h = renderDemonstrativoCliente({ ...base,
      validacao: { estado: 'falta_dado', bloqueios: [], pendencias: ['falta a geração do mês'], avisos: [], geracaoKwh: null, origemGeracao: null, esperadoMesKwh: 640 } });
    expect(h).not.toContain('/enviar?mes=');
  });
  it('já enviado: mostra quando e para quem (horário de Brasília)', () => {
    expect(textoUltimoEnvio(ENVIO)).toBe('✅ enviado em 27/09 10:05 para (61) 99171-8505 e j@x.com');
    const h = renderDemonstrativoCliente({ ...base, validacao: pronto, ultimoEnvio: ENVIO });
    expect(h).toContain('✅ enviado em 27/09 10:05 para (61) 99171-8505 e j@x.com');
  });
});

const confirmar = (o: Partial<ConfirmarEnvioRelatorio> = {}): ConfirmarEnvioRelatorio => ({
  instalacao: '200002', mes: '2026-08-01', mesExtenso: 'agosto de 2026', clienteNome: 'JOAO <b>X</b>', canal: 'casa',
  zap: { para: '5561991718505', motivo: null, texto: 'Olá, João! ☀️ O relatório…' },
  email: { para: 'j@x.com', motivo: null, assunto: 'João, o relatório de agosto de 2026 da sua usina solar', html: '<p class="x">oi</p>' },
  linkExemplo: 'https://p.x/rg/…', ultimoEnvio: null, ...o,
});

describe('renderConfirmarEnvioRelatorio', () => {
  it('prévia do zap, do e-mail (iframe escapado) e do link; confirma sem reenviar', () => {
    const h = renderConfirmarEnvioRelatorio(confirmar());
    expect(h).toContain('JOAO &lt;b&gt;X&lt;/b&gt;');
    expect(h).toContain('(61) 99171-8505');
    expect(h).toContain('Olá, João! ☀️ O relatório…');
    expect(h).toContain('srcdoc="&lt;p class=&quot;x&quot;&gt;oi&lt;/p&gt;"');
    expect(h).toContain('https://p.x/rg/…');
    expect(h).toContain('action="/dashboard/demonstrativos/200002/enviar?mes=2026-08-01"');
    expect(h).toContain('name="confirmar" value="1"');
    expect(h).not.toContain('name="reenviar"');
    expect(h).toContain('📲 Confirmar e enviar');
  });
  it('já enviado: aviso + "Enviar de novo" com reenviar=1', () => {
    const h = renderConfirmarEnvioRelatorio(confirmar({ ultimoEnvio: ENVIO }));
    expect(h).toContain('Este relatório já foi enviado');
    expect(h).toContain('name="reenviar" value="1"');
    expect(h).toContain('🔁 Enviar de novo');
  });
  it('canal bloqueado mostra o motivo em português; e-mail desligado avisa', () => {
    const h = renderConfirmarEnvioRelatorio(confirmar({ zap: { para: null, motivo: 'opt_out', texto: '' }, email: null }));
    expect(h).toMatch(/Não vai sair — cliente pediu pra não receber mensagens/);
    expect(h).toMatch(/e-mail não está configurado/);
  });
  it('duplo clique: o botão trava no primeiro envio do formulário', () => {
    const h = renderConfirmarEnvioRelatorio(confirmar());
    const ini = h.indexOf('<form method="post" action="/dashboard/demonstrativos/');
    const form = h.slice(ini, h.indexOf('</form>', ini));
    expect(form).toMatch(/onsubmit="[^"]*disabled\s*=\s*true/);
    expect(form).toContain('type="submit"');
  });
  it('nada pode sair: sem formulário, explica o que corrigir', () => {
    const h = renderConfirmarEnvioRelatorio(confirmar({
      zap: { para: null, motivo: 'sem_phone', texto: '' }, email: { para: null, motivo: 'sem_email', assunto: '', html: '' },
    }));
    expect(h).not.toContain('name="confirmar"');
    expect(h).toMatch(/Nada pode ser enviado/);
  });
});
