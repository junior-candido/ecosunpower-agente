import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  TEMPLATE_RELATORIO, basePublica, gerarTokenRelatorio, normalizarTokenRelatorio, linkPublicoRelatorio,
  primeiroNome, textoTemplateRelatorio, textoLivreRelatorio, componentesTemplateRelatorio,
  nomeArquivoRelatorio, dataHoraBrasilia,
} from '../src/modules/gd/relatorio-envio-textos.js';

afterEach(() => vi.unstubAllEnvs());

describe('token do link público', () => {
  it('32 caracteres base64url, imprevisível', () => {
    const a = gerarTokenRelatorio();
    const b = gerarTokenRelatorio();
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(a).not.toBe(b);
    expect(normalizarTokenRelatorio(a)).toBe(a);
  });
  it('ponto/parêntese que o WhatsApp cola no fim sai; hífen e sublinhado do token ficam', () => {
    const t = 'Ab3_Ab3_Ab3_Ab3_Ab3_Ab3_Ab3_Ab3-'; // 32 caracteres, termina em hífen
    expect(normalizarTokenRelatorio(`${t}.`)).toBe(t);
    expect(normalizarTokenRelatorio(` ${t}). `)).toBe(t);
    expect(normalizarTokenRelatorio(t)).toBe(t);
  });
  it('lixo é recusado (null)', () => {
    expect(normalizarTokenRelatorio('')).toBeNull();
    expect(normalizarTokenRelatorio('curto')).toBeNull();
    expect(normalizarTokenRelatorio('../../etc/passwd')).toBeNull();
    expect(normalizarTokenRelatorio(undefined)).toBeNull();
    expect(normalizarTokenRelatorio('A'.repeat(33))).toBeNull();
  });
});

describe('link e base pública', () => {
  it('link usa /rg/ (o /r/ já é do relatório de acompanhamento)', () => {
    expect(linkPublicoRelatorio('https://p.exemplo.com/', 'TOK')).toBe('https://p.exemplo.com/rg/TOK');
  });
  it('base vem do PROPOSAL_PUBLIC_BASE_URL, sem barra no fim', () => {
    vi.stubEnv('PROPOSAL_PUBLIC_BASE_URL', 'https://p.exemplo.com/');
    expect(basePublica()).toBe('https://p.exemplo.com');
  });
});

describe('textos da mensagem', () => {
  it('primeiro nome bonito; sem nome vira "cliente"', () => {
    expect(primeiroNome('JOÃO DA SILVA')).toBe('João');
    expect(primeiroNome('  maria  ')).toBe('Maria');
    expect(primeiroNome('')).toBe('cliente');
    expect(primeiroNome(null)).toBe('cliente');
  });
  it('texto do modelo é EXATAMENTE o corpo aprovado na Meta', () => {
    expect(TEMPLATE_RELATORIO).toBe('relatorio_usina_v1');
    expect(textoTemplateRelatorio('João', 'agosto de 2026')).toBe(
      'Olá, João! ☀️ O relatório de agosto de 2026 da sua usina solar está pronto: quanto ela gerou, quanto você economizou e seus créditos.',
    );
  });
  it('texto livre = corpo do modelo + link', () => {
    const t = textoLivreRelatorio('João', 'agosto de 2026', 'https://p.x/rg/TOK');
    expect(t.startsWith(textoTemplateRelatorio('João', 'agosto de 2026'))).toBe(true);
    expect(t).toContain('Ver meu relatório: https://p.x/rg/TOK');
  });
  it('componentes do modelo: {{1}} nome, {{2}} mês, botão = token', () => {
    expect(componentesTemplateRelatorio('João', 'agosto de 2026', 'TOK')).toEqual([
      { type: 'body', parameters: [{ type: 'text', text: 'João' }, { type: 'text', text: 'agosto de 2026' }] },
      { type: 'button', sub_type: 'url', index: 0, parameters: [{ type: 'text', text: 'TOK' }] },
    ]);
  });
  it('nome do arquivo e data/hora de Brasília', () => {
    expect(nomeArquivoRelatorio('351534', '2026-08-01')).toBe('relatorio-351534-2026-08.pdf');
    expect(dataHoraBrasilia('2026-09-27T13:05:00Z')).toBe('27/09 10:05');
    expect(dataHoraBrasilia('2026-09-28T01:30:00Z')).toBe('27/09 22:30');
  });
});
