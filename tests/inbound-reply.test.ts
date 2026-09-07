import { describe, it, expect, vi } from 'vitest';
import {
  extrairRespostaResend,
  limparCitacao,
  resumoParaAviso,
  montarAvisoResposta,
  processarRespostaEmail,
} from '../src/modules/email/inbound-reply.js';

const PAYLOAD = {
  type: 'email.received',
  data: {
    email_id: 'in_123',
    from: 'Joao Silva <joao@exemplo.com>',
    to: ['respostas@woupri.resend.app'],
    subject: 'Re: Sua energia solar comeca aqui',
    text: 'Bom dia! Gostei da proposta, pode me ligar hoje?',
    html: '<p>Bom dia! Gostei da proposta, pode me ligar hoje?</p>',
  },
};

describe('extrairRespostaResend', () => {
  it('extrai remetente, assunto e texto de um email.received', () => {
    const r = extrairRespostaResend(PAYLOAD);
    expect(r).not.toBeNull();
    expect(r!.de).toBe('joao@exemplo.com');
    expect(r!.nomeDe).toBe('Joao Silva');
    expect(r!.assunto).toBe('Re: Sua energia solar comeca aqui');
    expect(r!.texto).toContain('pode me ligar hoje');
    expect(r!.messageId).toBe('in_123');
  });

  it('aceita from como e-mail puro, sem nome', () => {
    const r = extrairRespostaResend({ ...PAYLOAD, data: { ...PAYLOAD.data, from: 'MARIA@Exemplo.COM' } });
    expect(r!.de).toBe('maria@exemplo.com');
    expect(r!.nomeDe).toBeNull();
  });

  it('aceita from como objeto address/name', () => {
    const r = extrairRespostaResend({ ...PAYLOAD, data: { ...PAYLOAD.data, from: { address: 'ana@x.com', name: 'Ana' } } });
    expect(r!.de).toBe('ana@x.com');
    expect(r!.nomeDe).toBe('Ana');
  });

  it('cai pro html quando nao veio texto puro', () => {
    const d = { ...PAYLOAD.data, text: undefined as unknown as string };
    const r = extrairRespostaResend({ ...PAYLOAD, data: d });
    expect(r!.texto).toContain('pode me ligar hoje');
    expect(r!.texto).not.toContain('<p>');
  });

  it('ignora evento que nao e email.received', () => {
    expect(extrairRespostaResend({ ...PAYLOAD, type: 'email.delivered' })).toBeNull();
  });

  it('ignora payload sem remetente valido', () => {
    expect(extrairRespostaResend({ type: 'email.received', data: { subject: 'x', text: 'y' } })).toBeNull();
  });
});

describe('limparCitacao', () => {
  it('corta o historico citado em ingles', () => {
    const t = 'Pode sim, obrigado!\n\nOn Mon, Sep 7, 2026 at 9:00 AM EcoSunPower <x@y.com> wrote:\n> texto antigo\n> mais antigo';
    expect(limparCitacao(t)).toBe('Pode sim, obrigado!');
  });

  it('corta o historico citado em portugues', () => {
    const t = 'Bom dia\n\nEm seg., 7 de set. de 2026 as 09:00, EcoSunPower escreveu:\n> antigo';
    expect(limparCitacao(t)).toBe('Bom dia');
  });

  it('corta o separador de mensagem original', () => {
    const t = 'Confirmo\n\n-----Mensagem Original-----\nDe: EcoSunPower';
    expect(limparCitacao(t)).toBe('Confirmo');
  });

  it('corta linhas apenas citadas quando nao ha cabecalho', () => {
    expect(limparCitacao('Ok\n> antigo\n> antigo 2')).toBe('Ok');
  });

  it('devolve o texto inteiro quando nao ha citacao', () => {
    expect(limparCitacao('So isso mesmo.')).toBe('So isso mesmo.');
  });

  it('nao devolve vazio quando a mensagem inteira e citacao', () => {
    const t = '> tudo citado\n> mesmo';
    expect(limparCitacao(t)).toBe(t.trim());
  });
});

describe('resumoParaAviso', () => {
  it('corta no limite sem cortar palavra no meio', () => {
    const r = resumoParaAviso('a'.repeat(10) + ' ' + 'b'.repeat(300), 40);
    expect(r.length).toBeLessThanOrEqual(41);
    expect(r.endsWith('…')).toBe(true);
  });

  it('deixa texto curto intacto', () => {
    expect(resumoParaAviso('curto', 40)).toBe('curto');
  });

  it('junta quebras de linha em espaco', () => {
    expect(resumoParaAviso('linha1\n\nlinha2', 100)).toBe('linha1 linha2');
  });
});

describe('montarAvisoResposta', () => {
  it('monta o aviso com nome, e-mail e trecho', () => {
    const msg = montarAvisoResposta({
      nome: 'Joao Silva',
      de: 'joao@exemplo.com',
      assunto: 'Re: Sua energia solar comeca aqui',
      trecho: 'Gostei da proposta, pode me ligar hoje?',
    });
    expect(msg).toContain('Joao Silva');
    expect(msg).toContain('joao@exemplo.com');
    expect(msg).toContain('pode me ligar hoje');
    expect(msg).toContain('Re: Sua energia solar comeca aqui');
  });
});

function fazDeps(over: Record<string, unknown> = {}) {
  return {
    buscarLeadPorEmail: vi.fn().mockResolvedValue({ id: 'L1', name: 'Joao Silva' }),
    registrar: vi.fn().mockResolvedValue(undefined),
    cancelarJornada: vi.fn().mockResolvedValue(undefined),
    avisarAdmin: vi.fn().mockResolvedValue(undefined),
    encaminhar: vi.fn().mockResolvedValue(undefined),
    jaProcessado: vi.fn().mockResolvedValue(false),
    ...over,
  };
}

describe('processarRespostaEmail', () => {
  it('casa com o lead, registra, tira da regua, avisa e encaminha', async () => {
    const deps = fazDeps();
    const r = await processarRespostaEmail(deps as never, PAYLOAD);

    expect(r.tratado).toBe(true);
    expect(r.leadId).toBe('L1');
    expect(deps.buscarLeadPorEmail).toHaveBeenCalledWith('joao@exemplo.com');
    expect(deps.registrar).toHaveBeenCalledTimes(1);
    expect(deps.registrar.mock.calls[0][0]).toMatchObject({ tipo: 'email_resposta', leadId: 'L1', canal: 'email' });
    expect(deps.cancelarJornada).toHaveBeenCalledWith('L1', 'respondeu');
    expect(deps.avisarAdmin).toHaveBeenCalledTimes(1);
    expect(deps.avisarAdmin.mock.calls[0][0]).toContain('joao@exemplo.com');
    expect(deps.encaminhar).toHaveBeenCalledTimes(1);
  });

  // O aviso e a razao de existir disso. Mesmo sem achar o lead (cliente
  // respondeu de outro e-mail, ou e alguem de fora), o Junior TEM que saber.
  it('avisa mesmo quando nao acha o lead, e nao tenta cancelar jornada', async () => {
    const deps = fazDeps({ buscarLeadPorEmail: vi.fn().mockResolvedValue(null) });
    const r = await processarRespostaEmail(deps as never, PAYLOAD);

    expect(r.tratado).toBe(true);
    expect(r.leadId).toBeNull();
    expect(deps.registrar).toHaveBeenCalledTimes(1);
    expect(deps.cancelarJornada).not.toHaveBeenCalled();
    expect(deps.avisarAdmin).toHaveBeenCalledTimes(1);
    expect(deps.encaminhar).toHaveBeenCalledTimes(1);
  });

  it('nao processa duas vezes a mesma mensagem', async () => {
    const deps = fazDeps({ jaProcessado: vi.fn().mockResolvedValue(true) });
    const r = await processarRespostaEmail(deps as never, PAYLOAD);

    expect(r.tratado).toBe(false);
    expect(r.motivo).toBe('duplicado');
    expect(deps.avisarAdmin).not.toHaveBeenCalled();
    expect(deps.registrar).not.toHaveBeenCalled();
  });

  it('ignora evento que nao e resposta', async () => {
    const deps = fazDeps();
    const r = await processarRespostaEmail(deps as never, { type: 'email.opened', data: {} });
    expect(r.tratado).toBe(false);
    expect(r.motivo).toBe('nao_e_resposta');
    expect(deps.avisarAdmin).not.toHaveBeenCalled();
  });

  // Robustez: nada aqui pode derrubar o webhook (a Resend reenviaria em loop).
  it('avisa o admin mesmo se o registro no banco falhar', async () => {
    const deps = fazDeps({ registrar: vi.fn().mockRejectedValue(new Error('banco fora')) });
    const r = await processarRespostaEmail(deps as never, PAYLOAD);
    expect(r.tratado).toBe(true);
    expect(deps.avisarAdmin).toHaveBeenCalledTimes(1);
  });

  it('nao lanca se o aviso no whatsapp falhar', async () => {
    const deps = fazDeps({ avisarAdmin: vi.fn().mockRejectedValue(new Error('zap fora')) });
    await expect(processarRespostaEmail(deps as never, PAYLOAD)).resolves.toMatchObject({ tratado: true });
    expect(deps.encaminhar).toHaveBeenCalledTimes(1);
  });

  it('nao lanca se o encaminhamento falhar', async () => {
    const deps = fazDeps({ encaminhar: vi.fn().mockRejectedValue(new Error('resend fora')) });
    await expect(processarRespostaEmail(deps as never, PAYLOAD)).resolves.toMatchObject({ tratado: true });
    expect(deps.avisarAdmin).toHaveBeenCalledTimes(1);
  });

  it('funciona sem encaminhar configurado', async () => {
    const deps = fazDeps({ encaminhar: undefined });
    const r = await processarRespostaEmail(deps as never, PAYLOAD);
    expect(r.tratado).toBe(true);
    expect(deps.avisarAdmin).toHaveBeenCalledTimes(1);
  });
});
