// Textos da cobrança recorrente: os 4 MODELOS da Meta (o Junior submete; a
// cópia local é a fonte), o e-mail (plano B e cópia) e os avisos do Junior.
// Português claro; "Pix ou cartão de crédito"; dado do cliente escapado.
import { describe, it, expect } from 'vitest';
import {
  MODELO_COBRANCA, MODELO_AVISO_PAUSA, MODELO_PAUSADA, MODELO_RECIBO,
  TEXTO_MODELO_COBRANCA, TEXTO_MODELO_AVISO_PAUSA, TEXTO_MODELO_PAUSADA, TEXTO_MODELO_RECIBO,
  paramsModeloCobranca, paramsModeloRecibo, preencherModelo, textoCobranca, mensagemDoToque, mensagemPausa,
  emailRecibo, emailReativada, avisoJuniorEncaminhar, avisoJuniorUltimo, avisoJuniorPausada, avisoJuniorReativada,
  referenciaDaFatura, primeiroNome,
} from '../src/modules/cobranca-recorrente/mensagens.js';

const D = {
  nome: 'Jimena Pereira Fonseca', descricao: 'Monitoramento de Usinas', competencia: '2026-10-01',
  venceEm: '2026-10-10', valorCentavos: 29700, link: 'https://checkout.exemplo.invalid/abc',
};
const CTX = { pausavel: true, dataPausa: '2026-10-13', hoje: '2026-10-12' };

describe('modelos da Meta', () => {
  it('nomes fixos (o Junior submete com ESTES nomes)', () => {
    expect([MODELO_COBRANCA, MODELO_AVISO_PAUSA, MODELO_PAUSADA, MODELO_RECIBO])
      .toEqual(['cobranca_mensalidade_v1', 'aviso_pausa_assistente_v1', 'assistente_pausada_v1', 'recibo_mensalidade_v1']);
  });
  it('variáveis em ordem, nenhuma colada no começo/fim, e "Pix ou cartão de crédito" em todos os de cobrança', () => {
    const casos: Array<[string, number]> = [[TEXTO_MODELO_COBRANCA, 5], [TEXTO_MODELO_AVISO_PAUSA, 5], [TEXTO_MODELO_PAUSADA, 4], [TEXTO_MODELO_RECIBO, 4]];
    for (const [t, n] of casos) {
      for (let i = 1; i <= n; i++) expect(t).toContain(`{{${i}}}`);
      expect(t).not.toContain(`{{${n + 1}}}`);
      expect(t.trim().startsWith('{{')).toBe(false);
    }
    for (const t of [TEXTO_MODELO_COBRANCA, TEXTO_MODELO_AVISO_PAUSA, TEXTO_MODELO_PAUSADA]) expect(t).toContain('Pix ou cartão de crédito');
    expect(TEXTO_MODELO_COBRANCA.trim().endsWith('}}')).toBe(false);
    expect(TEXTO_MODELO_AVISO_PAUSA.trim().endsWith('}}')).toBe(false);
  });
  it('parâmetros da cobrança: primeiro nome, referência, valor, vencimento, link', () => {
    expect(paramsModeloCobranca(D)).toEqual(['Jimena', 'Monitoramento de Usinas — outubro/2026', 'R$ 297,00', '10/10/2026', D.link]);
  });
  it('texto do modelo lê bem ("A fatura de Monitoramento de Usinas — outubro/2026 está em aberto")', () => {
    expect(textoCobranca(D)).toContain('A fatura de Monitoramento de Usinas — outubro/2026 está em aberto');
    expect(textoCobranca(D)).not.toMatch(/\{\{\d\}\}/);
  });
  it('recibo: primeiro nome, valor pago, referência, data', () => {
    expect(paramsModeloRecibo({ ...D, pagoCentavos: 29700, pagoEm: '2026-10-09T18:00:00Z' }))
      .toEqual(['Jimena', 'R$ 297,00', 'Monitoramento de Usinas — outubro/2026', '09/10/2026']);
  });
  it('variável sem quebra de linha nem espaços sobrando', () => {
    const p = paramsModeloCobranca({ ...D, nome: '  Ana\n  Maria  ', descricao: 'Plano\n\tPro     mensal' });
    expect(p[0]).toBe('Ana');
    expect(p[1]).toBe('Plano Pro mensal — outubro/2026');
  });
  it('primeiroNome e referência', () => {
    expect(primeiroNome('  conquista solar ltda ')).toBe('Conquista');
    expect(primeiroNome('')).toBe('cliente');
    expect(referenciaDaFatura('Monitoramento', '2026-12-01')).toBe('Monitoramento — dezembro/2026');
    expect(preencherModelo('a {{1}} b {{2}}', ['x'])).toBe('a x b {{2}}');
  });
});

describe('mensagemDoToque (um toque = modelo + e-mail com as mesmas palavras)', () => {
  it('fatura / véspera / venceu usam o modelo de cobrança; assuntos claros', () => {
    expect(mensagemDoToque('fatura', D, CTX)).toMatchObject({ modelo: MODELO_COBRANCA, email: { assunto: 'Sua fatura de outubro/2026 — Monitoramento de Usinas', ctaUrl: D.link } });
    expect(mensagemDoToque('vespera', D, { ...CTX, hoje: '2026-10-09' }).email.assunto).toBe('Vence amanhã: fatura de outubro/2026 — Monitoramento de Usinas');
    expect(mensagemDoToque('vespera', D, { ...CTX, hoje: '2026-10-10' }).email.assunto).toBe('Vence hoje: fatura de outubro/2026 — Monitoramento de Usinas');
    expect(mensagemDoToque('venceu', D, CTX).email.assunto).toBe('Fatura de outubro/2026 em aberto — Monitoramento de Usinas');
  });
  it('último aviso de TENANT: fala da assistente e do prazo (véspera da pausa)', () => {
    const m = mensagemDoToque('ultimo_aviso', D, CTX);
    expect(m.modelo).toBe(MODELO_AVISO_PAUSA);
    expect(m.params).toEqual(['Jimena', 'Monitoramento de Usinas — outubro/2026', 'R$ 297,00', '12/10/2026', D.link]);
    expect(m.texto).toContain('assistente virtual continuar atendendo');
    expect(m.texto).toContain('Seu painel continua funcionando');
    expect(m.email.assunto).toMatch(/^Último aviso/);
  });
  it('último aviso de quem NÃO pausa (avulso / "nunca pausar"): lembrete comum, sem falar de assistente', () => {
    const m = mensagemDoToque('ultimo_aviso', D, { pausavel: false, dataPausa: null, hoje: '2026-10-12' });
    expect(m.modelo).toBe(MODELO_COBRANCA);
    expect(m.texto).not.toContain('assistente');
    expect(m.email.html).not.toContain('assistente');
  });
  it('e-mail: valor, vencimento, "Pix ou cartão de crédito" e assinatura da equipe', () => {
    const e = mensagemDoToque('fatura', D, CTX).email;
    expect(e.html).toContain('R$ 297,00');
    expect(e.html).toContain('10/10/2026');
    expect(e.html).toContain('Pix ou cartão de crédito');
    expect(e.html).toContain('Equipe EcoSunPower');
  });
  it('nome/descrição escapados no e-mail', () => {
    const e = mensagemDoToque('fatura', { ...D, nome: '<script>x</script>', descricao: 'Plano <b>Pro</b>' }, CTX).email;
    expect(e.html).not.toContain('<script>');
    expect(e.html).not.toContain('<b>Pro</b>');
    expect(e.html).toContain('&lt;b&gt;Pro&lt;/b&gt;');
  });
});

describe('pausa e reativação', () => {
  it('aviso de pausa: painel continua, mensagens guardadas, volta sozinha, link', () => {
    const m = mensagemPausa(D);
    expect(m.modelo).toBe(MODELO_PAUSADA);
    expect(m.texto).toContain('foi pausada hoje');
    expect(m.texto).toContain('mensagens dos seus clientes continuam chegando');
    expect(m.texto).toContain('volta a atender sozinha');
    expect(m.texto).toContain(D.link);
  });
  it('e-mail de reativação e recibo', () => {
    expect(emailReativada('Jimena Fonseca').html).toContain('voltou a atender');
    const r = emailRecibo({ ...D, pagoCentavos: 29700, pagoEm: '2026-10-09T18:00:00Z' });
    expect(r.assunto).toBe('Pagamento recebido — Monitoramento de Usinas — outubro/2026');
    expect(r.html).toContain('09/10/2026');
  });
});

describe('avisos pro Junior', () => {
  it('encaminhar: diz o modelo pendente, o que foi feito e traz o texto pronto', () => {
    const m = mensagemDoToque('fatura', D, CTX);
    const t = avisoJuniorEncaminhar({ ...D, telefone: '5577999610038', email: 'j@exemplo.invalid', emailEnviado: true, motivo: 'modelo_pendente', rotulo: 'Fatura nova', modelo: m.modelo, texto: m.texto });
    expect(t).toContain('"cobranca_mensalidade_v1" do WhatsApp ainda não foi aprovado');
    expect(t).toContain('mandei por e-mail');
    expect(t).toContain(D.link);
  });
  it('último aviso: dias, data da pausa e o link COMPLETO da tela (dá pra tocar no WhatsApp)', () => {
    const t = avisoJuniorUltimo({ ...D, dias: 2, pausavel: true, dataPausa: '2026-10-13', urlAssinatura: 'https://painel.exemplo.invalid/dashboard/assinaturas/a1' });
    expect(t).toContain('atrasada 2 dias');
    expect(t).toContain('PAUSA em 13/10/2026');
    expect(t).toContain('https://painel.exemplo.invalid/dashboard/assinaturas/a1');
  });
  it('pausada / reativada', () => {
    expect(avisoJuniorPausada({ nome: 'Jimena', empresa: 'Conquista Solar', ref: 'X — outubro/2026', valorCentavos: 29700, urlAssinatura: 'u', manual: false })).toMatch(/Assistente de Conquista Solar PAUSADA por fatura em aberto/);
    expect(avisoJuniorReativada({ nome: 'Jimena', empresa: 'Conquista Solar', motivo: 'pagou' })).toContain('pagamento confirmado');
  });
});
