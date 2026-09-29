// Textos da cobrança recorrente: o MODELO da Meta (cobranca_mensalidade_v1 e
// recibo_mensalidade_v1 — o Junior submete; a cópia local é a fonte do texto),
// o e-mail (plano B enquanto o modelo não é aprovado) e o aviso pro Junior
// encaminhar. Tudo em português claro; dado do cliente sempre escapado no HTML.
import { describe, it, expect } from 'vitest';
import {
  MODELO_COBRANCA, MODELO_RECIBO, TEXTO_MODELO_COBRANCA, TEXTO_MODELO_RECIBO,
  paramsModeloCobranca, paramsModeloRecibo, preencherModelo, textoCobranca,
  emailCobranca, emailRecibo, avisoJuniorEncaminhar, avisoJuniorAtraso, referenciaDaFatura, primeiroNome,
} from '../src/modules/cobranca-recorrente/mensagens.js';

const DADOS = {
  nome: 'Jimena Pereira Fonseca', descricao: 'Monitoramento de Usinas', competencia: '2026-10-01',
  venceEm: '2026-10-10', valorCentavos: 29700, link: 'https://checkout.exemplo.invalid/abc',
};

describe('modelo da Meta', () => {
  it('nomes fixos (o Junior submete com ESTES nomes)', () => {
    expect(MODELO_COBRANCA).toBe('cobranca_mensalidade_v1');
    expect(MODELO_RECIBO).toBe('recibo_mensalidade_v1');
  });
  it('texto do modelo com 5 variáveis em ordem, sem variável colada no começo/fim', () => {
    for (let i = 1; i <= 5; i++) expect(TEXTO_MODELO_COBRANCA).toContain(`{{${i}}}`);
    expect(TEXTO_MODELO_COBRANCA).not.toContain('{{6}}');
    expect(TEXTO_MODELO_COBRANCA.trim().startsWith('{{')).toBe(false);
    expect(TEXTO_MODELO_COBRANCA.trim().endsWith('}}')).toBe(false);
    for (let i = 1; i <= 4; i++) expect(TEXTO_MODELO_RECIBO).toContain(`{{${i}}}`);
  });
  it('parâmetros: primeiro nome, referência, valor, vencimento, link', () => {
    expect(paramsModeloCobranca(DADOS)).toEqual(['Jimena', 'Monitoramento de Usinas — outubro/2026', 'R$ 297,00', '10/10/2026', DADOS.link]);
  });
  it('recibo: primeiro nome, valor pago, referência, data do pagamento', () => {
    expect(paramsModeloRecibo({ ...DADOS, pagoCentavos: 29700, pagoEm: '2026-10-09T18:00:00Z' }))
      .toEqual(['Jimena', 'R$ 297,00', 'Monitoramento de Usinas — outubro/2026', '09/10/2026']);
  });
  it('preencherModelo troca {{n}} pelos valores (prévia/encaminhar)', () => {
    const t = textoCobranca(DADOS);
    expect(t).toBe(preencherModelo(TEXTO_MODELO_COBRANCA, paramsModeloCobranca(DADOS)));
    expect(t).toContain('Jimena');
    expect(t).toContain('R$ 297,00');
    expect(t).toContain(DADOS.link);
    expect(t).not.toMatch(/\{\{\d\}\}/);
  });
  it('variável da Meta não aceita quebra de linha nem 4+ espaços: parâmetros saem limpos', () => {
    const p = paramsModeloCobranca({ ...DADOS, nome: '  Ana\n  Maria  ', descricao: 'Plano\n\tPro     mensal' });
    expect(p[0]).toBe('Ana');
    expect(p[1]).toBe('Plano Pro mensal — outubro/2026');
  });
  it('primeiroNome e referência', () => {
    expect(primeiroNome('  conquista solar ltda ')).toBe('Conquista');
    expect(primeiroNome('')).toBe('cliente');
    expect(referenciaDaFatura('Monitoramento', '2026-12-01')).toBe('Monitoramento — dezembro/2026');
  });
});

describe('e-mail (plano B)', () => {
  it('assunto muda com o aviso; corpo com valor, vencimento e botão de pagar', () => {
    expect(emailCobranca('fatura', DADOS).assunto).toBe('Sua fatura de outubro/2026 — Monitoramento de Usinas');
    expect(emailCobranca('lembrete_d0', DADOS).assunto).toBe('Vence hoje: fatura de outubro/2026 — Monitoramento de Usinas');
    expect(emailCobranca('lembrete_d3', DADOS).assunto).toBe('Fatura de outubro/2026 em aberto — Monitoramento de Usinas');
    const e = emailCobranca('fatura', DADOS);
    expect(e.html).toContain('R$ 297,00');
    expect(e.html).toContain('10/10/2026');
    expect(e.ctaUrl).toBe(DADOS.link);
  });
  it('nome/descrição do cliente escapados (nada de HTML injetado no e-mail)', () => {
    const e = emailCobranca('fatura', { ...DADOS, nome: '<script>x</script>', descricao: 'Plano <b>Pro</b>' });
    expect(e.html).not.toContain('<script>');
    expect(e.html).not.toContain('<b>Pro</b>');
    expect(e.html).toContain('&lt;b&gt;Pro&lt;/b&gt;');
  });
  it('recibo por e-mail', () => {
    const r = emailRecibo({ ...DADOS, pagoCentavos: 29700, pagoEm: '2026-10-09T18:00:00Z' });
    expect(r.assunto).toBe('Pagamento recebido — Monitoramento de Usinas — outubro/2026');
    expect(r.html).toContain('R$ 297,00');
    expect(r.html).toContain('09/10/2026');
  });
});

describe('avisos pro Junior', () => {
  it('encaminhar: diz POR QUE (modelo não aprovado), o que já foi feito e traz o texto pronto com o link', () => {
    const t = avisoJuniorEncaminhar({ ...DADOS, telefone: '5577999610038', email: 'jimena@exemplo.invalid', emailEnviado: true, motivo: 'modelo_pendente', acao: 'fatura' });
    expect(t).toContain('Jimena Pereira Fonseca');
    expect(t).toContain('ainda não foi aprovado');
    expect(t).toContain('mandei por e-mail');
    expect(t).toContain('5577999610038');
    expect(t).toContain(DADOS.link);
  });
  it('sem e-mail e falha do WhatsApp: pede pra ele encaminhar', () => {
    const t = avisoJuniorEncaminhar({ ...DADOS, telefone: null, email: null, emailEnviado: false, motivo: 'zap_falhou', acao: 'lembrete_d0' });
    expect(t).toContain('não tem e-mail');
    expect(t).toContain('WhatsApp falhou');
  });
  it('atraso D+7: nome, valor, dias e o caminho da tela', () => {
    const t = avisoJuniorAtraso({ ...DADOS, dias: 7, assinaturaId: 'a1' });
    expect(t).toContain('atrasada há 7 dias');
    expect(t).toContain('R$ 297,00');
    expect(t).toContain('/dashboard/assinaturas/a1');
  });
});
