import { describe, it, expect, vi } from 'vitest';
import { extrairEmailDoTexto, capturarEmailDaConversa } from '../src/modules/email/captura-email.js';

describe('extrairEmailDoTexto', () => {
  it('acha o e-mail no meio da frase', () => {
    expect(extrairEmailDoTexto('pode mandar pro joao.silva@gmail.com por favor')).toBe('joao.silva@gmail.com');
  });

  it('normaliza pra minusculo', () => {
    expect(extrairEmailDoTexto('MARIA@Exemplo.COM.BR')).toBe('maria@exemplo.com.br');
  });

  it('tira a pontuacao grudada no fim', () => {
    expect(extrairEmailDoTexto('meu email e ana@x.com.')).toBe('ana@x.com');
    expect(extrairEmailDoTexto('anota ai: ana@x.com,')).toBe('ana@x.com');
    expect(extrairEmailDoTexto('(ana@x.com)')).toBe('ana@x.com');
  });

  it('devolve null quando nao tem e-mail', () => {
    expect(extrairEmailDoTexto('bom dia, quero um orcamento')).toBeNull();
    expect(extrairEmailDoTexto('')).toBeNull();
    expect(extrairEmailDoTexto(null as unknown as string)).toBeNull();
  });

  it('nao confunde arroba de rede social com e-mail', () => {
    expect(extrairEmailDoTexto('me segue no insta @ecosunpower')).toBeNull();
  });

  // O cliente costuma COLAR o e-mail que recebeu da gente. Se a gente gravasse
  // esse, a jornada mandaria e-mail pra nos mesmos.
  it('ignora endereco de envio automatico', () => {
    expect(extrairEmailDoTexto('recebi de contato@news.ecosunpower.eng.br')).toBeNull();
    expect(extrairEmailDoTexto('veio de noreply@banco.com.br')).toBeNull();
    expect(extrairEmailDoTexto('era no-reply@loja.com')).toBeNull();
  });

  it('aceita dominios proprios do cliente', () => {
    expect(extrairEmailDoTexto('usa o financeiro@construtorasilva.com.br')).toBe('financeiro@construtorasilva.com.br');
  });

  it('pega o primeiro quando vem mais de um', () => {
    expect(extrairEmailDoTexto('a@x.com ou b@y.com')).toBe('a@x.com');
  });
});

const ECOSUN = '00000000-0000-0000-0000-000000000001';
const OUTRA = '11111111-1111-1111-1111-111111111111';

function fazDeps(over: Record<string, unknown> = {}) {
  return {
    leadJaTemEmail: vi.fn().mockResolvedValue(false),
    salvarEmail: vi.fn().mockResolvedValue(true),
    inscreverNaJornada: vi.fn().mockResolvedValue(undefined),
    empresaDaJornada: ECOSUN,
    ...over,
  };
}

describe('capturarEmailDaConversa', () => {
  it('salva e inscreve na jornada quando o lead manda o e-mail', async () => {
    const deps = fazDeps();
    const r = await capturarEmailDaConversa(deps as never, {
      leadId: 'L1', texto: 'pode mandar pro joao@gmail.com', companyId: ECOSUN,
    });

    expect(r.capturado).toBe(true);
    expect(r.email).toBe('joao@gmail.com');
    expect(deps.salvarEmail).toHaveBeenCalledWith('L1', 'joao@gmail.com', 'conversa');
    expect(deps.inscreverNaJornada).toHaveBeenCalledWith('L1');
  });

  it('nao faz nada quando a mensagem nao tem e-mail', async () => {
    const deps = fazDeps();
    const r = await capturarEmailDaConversa(deps as never, {
      leadId: 'L1', texto: 'bom dia, quanto custa?', companyId: ECOSUN,
    });

    expect(r.capturado).toBe(false);
    expect(r.motivo).toBe('sem_email');
    expect(deps.salvarEmail).not.toHaveBeenCalled();
  });

  it('nao sobrescreve o e-mail que o lead ja tem', async () => {
    const deps = fazDeps({ leadJaTemEmail: vi.fn().mockResolvedValue(true) });
    const r = await capturarEmailDaConversa(deps as never, {
      leadId: 'L1', texto: 'usa o novo@x.com', companyId: ECOSUN,
    });

    expect(r.capturado).toBe(false);
    expect(r.motivo).toBe('ja_tinha');
    expect(deps.salvarEmail).not.toHaveBeenCalled();
    expect(deps.inscreverNaJornada).not.toHaveBeenCalled();
  });

  // 🔒 A TRAVA QUE MAIS IMPORTA. A jornada de e-mail e da EcoSunPower: os
  // modelos, a logo e a assinatura sao dela. Inscrever lead de OUTRA empresa
  // (ex.: Conquista Solar) faria os clientes da Jimena receberem e-mail da
  // EcoSunPower. O e-mail e salvo na ficha — util pra ela — mas a jornada nao.
  it('salva o e-mail de outra empresa mas NAO inscreve na jornada', async () => {
    const deps = fazDeps();
    const r = await capturarEmailDaConversa(deps as never, {
      leadId: 'L9', texto: 'meu email e cliente@jimena.com', companyId: OUTRA,
    });

    expect(r.capturado).toBe(true);
    expect(r.email).toBe('cliente@jimena.com');
    expect(deps.salvarEmail).toHaveBeenCalledWith('L9', 'cliente@jimena.com', 'conversa');
    expect(deps.inscreverNaJornada).not.toHaveBeenCalled();
    expect(r.inscrito).toBe(false);
  });

  it('companyId ausente conta como a empresa da jornada (comportamento antigo)', async () => {
    const deps = fazDeps();
    const r = await capturarEmailDaConversa(deps as never, {
      leadId: 'L1', texto: 'joao@gmail.com', companyId: null,
    });
    expect(r.inscrito).toBe(true);
    expect(deps.inscreverNaJornada).toHaveBeenCalled();
  });

  // Isso roda no caminho de TODA mensagem que a Eva recebe. Se levantar, derruba
  // o atendimento — que e o que da dinheiro.
  it('nunca lanca, mesmo se salvar falhar', async () => {
    const deps = fazDeps({ salvarEmail: vi.fn().mockRejectedValue(new Error('banco fora')) });
    await expect(
      capturarEmailDaConversa(deps as never, { leadId: 'L1', texto: 'a@b.com', companyId: ECOSUN }),
    ).resolves.toMatchObject({ capturado: false });
  });

  it('nunca lanca se a inscricao na jornada falhar, e o e-mail fica salvo', async () => {
    const deps = fazDeps({ inscreverNaJornada: vi.fn().mockRejectedValue(new Error('fora')) });
    const r = await capturarEmailDaConversa(deps as never, {
      leadId: 'L1', texto: 'a@b.com', companyId: ECOSUN,
    });
    expect(r.capturado).toBe(true);
    expect(r.inscrito).toBe(false);
    expect(deps.salvarEmail).toHaveBeenCalled();
  });

  it('nao tenta nada sem leadId', async () => {
    const deps = fazDeps();
    const r = await capturarEmailDaConversa(deps as never, {
      leadId: '', texto: 'a@b.com', companyId: ECOSUN,
    });
    expect(r.capturado).toBe(false);
    expect(deps.salvarEmail).not.toHaveBeenCalled();
  });
});
