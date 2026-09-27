import { describe, it, expect } from 'vitest';
import { renderResultadoEnvio, motivoEmPortugues } from '../src/modules/relatorios/pasta/resultado-envio.js';

const base = {
  tituloOk: 'Relatório enviado', tituloConfira: 'Envio do relatório — confira',
  voltarHref: '/dashboard/demonstrativos/351534?mes=2026-08-01', voltarTexto: '← voltar para o cliente',
};

describe('renderResultadoEnvio — tela genérica depois de Enviar', () => {
  it('título e caminho de volta vêm de quem chama', () => {
    const h = renderResultadoEnvio({ ...base, zap: { ok: true, para: '5561991718505' }, email: { ok: true, para: 'j@x.com' } });
    expect(h).toContain('<title>Relatório enviado</title>');
    expect(h).toContain('href="/dashboard/demonstrativos/351534?mes=2026-08-01"');
    expect(h).toContain('← voltar para o cliente');
  });
  it('saiu com ressalva: ✅ e o aviso em destaque', () => {
    const h = renderResultadoEnvio({ ...base, zap: { ok: true, para: '5561991718505', aviso: 'saiu como mensagem comum' }, email: null });
    expect(h).toContain('✅');
    expect(h).toContain('⚠️ saiu como mensagem comum');
  });
  it('modelo não aprovado aparece em português claro, com o detalhe escapado', () => {
    const h = renderResultadoEnvio({ ...base, zap: { ok: false, reason: 'modelo_nao_aprovado', detalhe: '<b>132001</b>' }, email: null });
    expect(h).toMatch(/aguardando aprovação do modelo na Meta/);
    expect(h).toContain('&lt;b&gt;132001&lt;/b&gt;');
    expect(h).not.toContain('<b>132001</b>');
  });
  it('tenant sem WhatsApp conectado: explica que nunca sai pelo número de outra empresa', () => {
    const h = renderResultadoEnvio({ ...base, zap: { ok: false, reason: 'sem_canal' }, email: null });
    expect(h).toMatch(/não conectou o WhatsApp/);
  });
  it('link público aparece quando informado', () => {
    const h = renderResultadoEnvio({ ...base, zap: { ok: true }, email: null, linkPublico: 'https://p.x/rg/TOK' });
    expect(h).toContain('https://p.x/rg/TOK');
  });
  it('motivos de e-mail novos', () => {
    expect(motivoEmPortugues('email', 'opt_out')).toMatch(/pediu pra não receber/);
    expect(motivoEmPortugues('email', 'email_invalido')).toMatch(/e-mail do cliente está errado/);
    expect(motivoEmPortugues('zap', 'bloqueado_lgpd')).toMatch(/privacidade/);
    expect(motivoEmPortugues('zap', 'xyz')).toBe('xyz');
    expect(motivoEmPortugues('zap', null)).toBe('erro desconhecido');
  });
});
