// tests/financeiro-extrator.test.ts
import { describe, it, expect } from 'vitest';
import {
  parseRespostaExtrator, montarPromptExtracaoTexto, montarPromptGate,
} from '../src/modules/financeiro/extrator-lancamento.js';

describe('financeiro/extrator: parse da resposta da IA', () => {
  it('lê JSON dentro de bloco ```json```', () => {
    const raw = 'ok\n```json\n{"financeiro":true,"intencao":"lancar","tipo":"despesa","valor":380,"data":"2026-06-11","contraparte":"Posto Shell","categoria_slug":"combustivel","pf_pj":"PJ","obra_ref":null,"descricao":"gasolina","campos_faltando":[]}\n```';
    const e = parseRespostaExtrator(raw);
    expect(e?.financeiro).toBe(true);
    expect(e?.valor).toBe(380);
    expect(e?.pf_pj).toBe('PJ');
  });
  it('lê JSON cru sem bloco', () => {
    const e = parseRespostaExtrator('{"financeiro":false}');
    expect(e?.financeiro).toBe(false);
  });
  it('resposta sem JSON → null (nunca explode)', () => {
    expect(parseRespostaExtrator('não consegui ler nada')).toBeNull();
  });
  it('valor string "380,50" vira número 380.5', () => {
    const e = parseRespostaExtrator('{"financeiro":true,"intencao":"lancar","tipo":"despesa","valor":"380,50"}');
    expect(e?.valor).toBe(380.5);
  });
  it('valor lixo vira null e entra em campos_faltando', () => {
    const e = parseRespostaExtrator('{"financeiro":true,"intencao":"lancar","tipo":"despesa","valor":"abc"}');
    expect(e?.valor).toBeNull();
    expect(e?.campos_faltando).toContain('valor');
  });
  it('pf_pj inválido vira null (Eva pergunta)', () => {
    const e = parseRespostaExtrator('{"financeiro":true,"intencao":"lancar","tipo":"despesa","valor":10,"pf_pj":"talvez"}');
    expect(e?.pf_pj).toBeNull();
  });
  it('intencao desconhecida vira lancar', () => {
    const e = parseRespostaExtrator('{"financeiro":true,"intencao":"explodir","tipo":"despesa","valor":10}');
    expect(e?.intencao).toBe('lancar');
  });
  it('valor "1.234,56" (milhar BR) vira 1234.56', () => {
    const e = parseRespostaExtrator('{"financeiro":true,"intencao":"lancar","tipo":"despesa","valor":"1.234,56"}');
    expect(e?.valor).toBe(1234.56);
  });
  it('valor "380.50" (formato americano ambíguo) vira null — nunca 38050', () => {
    const e = parseRespostaExtrator('{"financeiro":true,"intencao":"lancar","tipo":"despesa","valor":"380.50"}');
    expect(e?.valor).toBeNull();
    expect(e?.campos_faltando).toContain('valor');
  });
});

describe('financeiro/extrator: prompts', () => {
  it('prompt de texto inclui as categorias e a data de hoje', () => {
    const p = montarPromptExtracaoTexto('gastei 80 no almoço', '2026-06-11');
    expect(p).toContain('combustivel');
    expect(p).toContain('2026-06-11');
    expect(p).toContain('NUNCA invente');
  });
  it('gate é curto e pede SIM/NAO', () => {
    const p = montarPromptGate('bom dia Eva');
    expect(p).toContain('SIM');
    expect(p).toContain('NAO');
  });
});
