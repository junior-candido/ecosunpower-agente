// tests/gd-relatorio-envio.test.ts
import { describe, it, expect, vi } from 'vitest';
import {
  destinoDoEnvio, enviarRelatorioZap, enviarRelatorioEmail, montarEmailRelatorio, logoEmailDaEmpresa,
  registrarEnvioNaConversa, resumoEnvio, type LeadDestino, type MensagemRelatorio,
  OPT_OUT_BLOQUEIA, optOutBloqueia, MOTIVOS_ZAP_RELATORIO, MOTIVOS_EMAIL_RELATORIO,
} from '../src/modules/gd/relatorio-envio.js';
import { empresaDe } from '../src/modules/empresa-config.js';
import { motivoEmPortugues } from '../src/modules/relatorios/pasta/resultado-envio.js';

const TENANT = '22222222-2222-2222-2222-222222222222';
const lead = (o: Partial<LeadDestino> = {}): LeadDestino => ({
  id: 'L1', nome: 'JOÃO SILVA', phone: '61991718505', email: 'joao@x.com', optOut: false, ...o,
});
const livre = { canal: 'casa' as const, bloqueadoLgpd: () => false };
const msg: MensagemRelatorio = {
  nome: 'João', mesExtenso: 'agosto de 2026', token: 'T'.repeat(32), link: 'https://p.x/rg/TTT',
  pdf: Buffer.from('%PDF'), nomeArquivo: 'relatorio-351534-2026-08.pdf',
};

describe('destinoDoEnvio', () => {
  it('caso normal: telefone normalizado 55DD9… e e-mail', () => {
    expect(destinoDoEnvio(lead(), livre)).toEqual({
      zap: { fone: '5561991718505', motivo: null }, email: { para: 'joao@x.com', motivo: null },
    });
  });
  it('opt_out bloqueia os dois canais com motivo', () => {
    const d = destinoDoEnvio(lead({ optOut: true }), livre);
    expect(d.zap).toEqual({ fone: null, motivo: 'opt_out' });
    expect(d.email).toEqual({ para: null, motivo: 'opt_out' });
  });
  it('tenant sem WhatsApp conectado: zap não sai, e-mail sai', () => {
    const d = destinoDoEnvio(lead(), { canal: 'nenhum', bloqueadoLgpd: () => false });
    expect(d.zap.motivo).toBe('sem_canal');
    expect(d.email.para).toBe('joao@x.com');
  });
  it('sem telefone / telefone errado', () => {
    expect(destinoDoEnvio(lead({ phone: null }), livre).zap.motivo).toBe('sem_phone');
    expect(destinoDoEnvio(lead({ phone: '  ' }), livre).zap.motivo).toBe('sem_phone');
    expect(destinoDoEnvio(lead({ phone: '123' }), livre).zap.motivo).toBe('telefone_invalido');
  });
  it('trava LGPD vira motivo visível (o sendText engoliria em silêncio)', () => {
    const d = destinoDoEnvio(lead(), { canal: 'evolution', bloqueadoLgpd: (f) => f === '5561991718505' });
    expect(d.zap).toEqual({ fone: null, motivo: 'bloqueado_lgpd' });
  });
  it('sem e-mail / e-mail errado', () => {
    expect(destinoDoEnvio(lead({ email: null }), livre).email.motivo).toBe('sem_email');
    expect(destinoDoEnvio(lead({ email: 'joao@' }), livre).email.motivo).toBe('email_invalido');
  });
});

describe('enviarRelatorioZap', () => {
  const fone = { fone: '5561991718505', motivo: null };

  it('EcoSun: modelo aprovado sai e o texto livre nem é tentado', async () => {
    const sendText = vi.fn();
    const sendTemplate = vi.fn().mockResolvedValue({ messageId: 'w1' });
    const r = await enviarRelatorioZap(fone, msg, { canal: 'casa', sendText, sendTemplate });
    expect(sendTemplate).toHaveBeenCalledWith('5561991718505', 'relatorio_usina_v1', 'pt_BR', [
      { type: 'body', parameters: [{ type: 'text', text: 'João' }, { type: 'text', text: 'agosto de 2026' }] },
      { type: 'button', sub_type: 'url', index: 0, parameters: [{ type: 'text', text: 'T'.repeat(32) }] },
    ]);
    expect(sendText).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: true, para: '5561991718505' });
    expect(r.aviso).toBeUndefined();
    expect(r.textoEnviado).toMatch(/^Olá, João!/);
  });
  it('EcoSun: modelo recusado → mensagem comum com o link e AVISO na tela', async () => {
    const sendText = vi.fn().mockResolvedValue(undefined);
    const sendTemplate = vi.fn().mockRejectedValue(new Error('template not found'));
    const r = await enviarRelatorioZap(fone, msg, { canal: 'casa', sendText, sendTemplate });
    expect(sendText).toHaveBeenCalledWith('5561991718505', expect.stringContaining('https://p.x/rg/TTT'));
    expect(r.ok).toBe(true);
    expect(r.aviso).toMatch(/aprovado na Meta/);
  });
  it('EcoSun: modelo E mensagem comum falham → ❌ modelo_nao_aprovado com os dois erros', async () => {
    const r = await enviarRelatorioZap(fone, msg, {
      canal: 'casa',
      sendTemplate: vi.fn().mockRejectedValue(new Error('132001')),
      sendText: vi.fn().mockRejectedValue(new Error('fora da janela')),
    });
    expect(r).toMatchObject({ ok: false, reason: 'modelo_nao_aprovado' });
    expect(r.detalhe).toContain('132001');
    expect(r.detalhe).toContain('fora da janela');
  });
  it('EcoSun sem sendTemplate (sem WABA) → texto com aviso', async () => {
    const sendText = vi.fn().mockResolvedValue(undefined);
    const r = await enviarRelatorioZap(fone, msg, { canal: 'casa', sendText });
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(true);
    expect(r.aviso).toBeDefined();
  });
  it('tenant (Evolution): NUNCA usa o modelo da EcoSun; manda texto + PDF anexo', async () => {
    const sendText = vi.fn().mockResolvedValue(undefined);
    const sendTemplate = vi.fn();
    const sendDocument = vi.fn().mockResolvedValue(undefined);
    const r = await enviarRelatorioZap(fone, msg, { canal: 'evolution', sendText, sendTemplate, sendDocument });
    expect(sendTemplate).not.toHaveBeenCalled();
    expect(sendText).toHaveBeenCalledWith('5561991718505', expect.stringContaining('Ver meu relatório: https://p.x/rg/TTT'));
    expect(sendDocument).toHaveBeenCalledWith('5561991718505', 'JVBERg==', 'relatorio-351534-2026-08.pdf', 'Relatório de agosto de 2026');
    expect(r).toMatchObject({ ok: true, para: '5561991718505' });
    expect(r.aviso).toBeUndefined();
  });
  it('tenant: PDF anexo falhou → ✅ (o link saiu) com aviso', async () => {
    const r = await enviarRelatorioZap(fone, msg, {
      canal: 'evolution', sendText: vi.fn().mockResolvedValue(undefined),
      sendDocument: vi.fn().mockRejectedValue(new Error('413')),
    });
    expect(r.ok).toBe(true);
    expect(r.aviso).toMatch(/PDF anexo/);
  });
  it('tenant: texto falhou → ❌ falha_envio', async () => {
    const r = await enviarRelatorioZap(fone, msg, { canal: 'evolution', sendText: vi.fn().mockRejectedValue(new Error('instância desconectada')) });
    expect(r).toMatchObject({ ok: false, reason: 'falha_envio', detalhe: 'instância desconectada' });
  });
  it('destino sem telefone ou canal "nenhum": nada é chamado', async () => {
    const sendText = vi.fn();
    expect(await enviarRelatorioZap({ fone: null, motivo: 'opt_out' }, msg, { canal: 'casa', sendText }))
      .toEqual({ ok: false, reason: 'opt_out' });
    expect(await enviarRelatorioZap(fone, msg, { canal: 'nenhum', sendText }))
      .toEqual({ ok: false, reason: 'sem_canal' });
    expect(sendText).not.toHaveBeenCalled();
  });
});

describe('e-mail do relatório', () => {
  const tenant = { ...empresaDe(TENANT), nomeFantasia: 'Conquista Solar', siteUrl: 'https://conquista.com', logoStoragePath: '' };

  it('logo: EcoSun usa a padrão; tenant com https usa a dele; tenant sem https fica sem imagem', () => {
    expect(logoEmailDaEmpresa(empresaDe(null))).toEqual({});
    expect(logoEmailDaEmpresa({ ...tenant, logoStoragePath: 'https://cdn.x/l.png' })).toEqual({ logoUrl: 'https://cdn.x/l.png' });
    expect(logoEmailDaEmpresa({ ...tenant, logoStoragePath: 'logos/l.png' })).toEqual({ semLogo: true });
  });
  it('e-mail do tenant: marca dele, link, botão — nenhuma menção à EcoSun', () => {
    const { assunto, html } = montarEmailRelatorio({ nome: 'João', mesExtenso: 'agosto de 2026', link: 'https://p.x/rg/TTT' }, tenant);
    expect(assunto).toBe('João, o relatório de agosto de 2026 da sua usina solar');
    expect(html).toContain('https://p.x/rg/TTT');
    expect(html).toContain('Ver meu relatório');
    expect(html).toContain('Conquista Solar');
    expect(html).not.toMatch(/ecosun/i);
  });
  it('sem Resend configurado → null (a tela diz que o e-mail está desligado)', async () => {
    expect(await enviarRelatorioEmail({ para: 'joao@x.com', motivo: null }, msg, { leadId: 'L1', empresa: tenant },
      { registrarEmailEnviado: vi.fn() })).toBeNull();
  });
  it('destino sem e-mail → motivo', async () => {
    const r = await enviarRelatorioEmail({ para: null, motivo: 'sem_email' }, msg, { leadId: 'L1', empresa: tenant },
      { enviarEmail: vi.fn(), registrarEmailEnviado: vi.fn() });
    expect(r).toEqual({ ok: false, reason: 'sem_email' });
  });
  it('envia e carimba em emails_enviados com contexto relatorio_gd', async () => {
    const enviarEmail = vi.fn().mockResolvedValue('mid-1');
    const registrarEmailEnviado = vi.fn().mockResolvedValue(undefined);
    const r = await enviarRelatorioEmail({ para: 'joao@x.com', motivo: null }, msg, { leadId: 'L1', empresa: tenant },
      { enviarEmail, registrarEmailEnviado });
    expect(r).toEqual({ ok: true, para: 'joao@x.com' });
    expect(enviarEmail.mock.calls[0][0].to).toBe('joao@x.com');
    expect(enviarEmail.mock.calls[0][0].html).toContain('https://p.x/rg/TTT');
    expect(registrarEmailEnviado).toHaveBeenCalledWith({
      leadId: 'L1', companyId: TENANT, providerMessageId: 'mid-1', para: 'joao@x.com',
      assunto: 'João, o relatório de agosto de 2026 da sua usina solar', contexto: 'relatorio_gd',
    });
  });
  it('provedor recusou → ❌ falha_envio com detalhe', async () => {
    const r = await enviarRelatorioEmail({ para: 'joao@x.com', motivo: null }, msg, { leadId: 'L1', empresa: tenant },
      { enviarEmail: vi.fn().mockRejectedValue(new Error('domain not verified')), registrarEmailEnviado: vi.fn() });
    expect(r).toEqual({ ok: false, reason: 'falha_envio', detalhe: 'domain not verified', para: 'joao@x.com' });
  });
});

describe('registrarEnvioNaConversa + resumoEnvio', () => {
  it('grava a mensagem da Eva na conversa do cliente (a atendente vê)', async () => {
    const db = {
      getOrCreateConversation: vi.fn().mockResolvedValue({ id: 'C1', messages: [{ role: 'user', content: 'oi', timestamp: 't' }], message_count: 1 }),
      updateConversation: vi.fn().mockResolvedValue(undefined),
    };
    await registrarEnvioNaConversa(db as any, 'L1', TENANT, 'agosto de 2026', 'Olá, João!');
    expect(db.getOrCreateConversation).toHaveBeenCalledWith('L1', TENANT);
    const upd = db.updateConversation.mock.calls[0][1];
    expect(upd.message_count).toBe(2);
    expect(upd.messages).toHaveLength(2);
    expect(upd.messages[1].role).toBe('assistant');
    expect(upd.messages[1].content).toContain('Relatório de agosto de 2026');
    expect(upd.messages[1].content).toContain('Olá, João!');
  });
  it('resumo: carimba envio só se algum canal saiu; guarda o resultado de cada um', () => {
    const r = resumoEnvio({ ok: true, para: '5561991718505', aviso: 'x' }, { ok: false, reason: 'sem_email' });
    expect(r.algumOk).toBe(true);
    expect(r.zapPara).toBe('5561991718505');
    expect(r.emailPara).toBeNull();
    expect(r.envio).toEqual({
      zap: { ok: true, motivo: null, para: '5561991718505', aviso: 'x', detalhe: null },
      email: { ok: false, motivo: 'sem_email', para: null, aviso: null, detalhe: null },
    });
    const nada = resumoEnvio({ ok: false, reason: 'opt_out' }, null);
    expect(nada.algumOk).toBe(false);
    expect(nada.envio.email).toEqual({ configurado: false });
  });
});

describe('política do opt-out (isolada, dá pra trocar depois)', () => {
  it('padrão do plano: opt-out bloqueia WhatsApp E e-mail', () => {
    expect(OPT_OUT_BLOQUEIA).toEqual({ zap: true, email: true });
    expect(optOutBloqueia('zap', true)).toBe(true);
    expect(optOutBloqueia('email', true)).toBe(true);
    expect(optOutBloqueia('zap', false)).toBe(false);
    expect(optOutBloqueia('email', false)).toBe(false);
  });
});

describe('motivos que o envio devolve existem na tela de resultado', () => {
  it('todo motivo do zap tem texto em português', () => {
    for (const m of MOTIVOS_ZAP_RELATORIO) expect(motivoEmPortugues('zap', m)).not.toBe(m);
  });
  it('todo motivo do e-mail tem texto em português', () => {
    for (const m of MOTIVOS_EMAIL_RELATORIO) expect(motivoEmPortugues('email', m)).not.toBe(m);
  });
});

describe('e-mail do tenant sem site cadastrado', () => {
  it('sem logo e sem site: nenhuma menção à EcoSun (nem o site dela)', () => {
    const semSite = { ...empresaDe(TENANT), nomeFantasia: 'Conquista Solar', siteUrl: '', logoStoragePath: null };
    const { html } = montarEmailRelatorio({ nome: 'João', mesExtenso: 'agosto de 2026', link: 'https://p.x/rg/TTT' }, semSite);
    expect(html).toContain('Conquista Solar');
    expect(html).not.toMatch(/ecosunpower/i);
  });
});
