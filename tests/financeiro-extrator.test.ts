// tests/financeiro-extrator.test.ts
import { describe, it, expect } from 'vitest';
import {
  parseRespostaExtrator, montarPromptExtracaoTexto, montarPromptGate,
} from '../src/modules/financeiro/extrator-lancamento.js';
import { parseLancamentos } from '../src/modules/financeiro/extrator-lancamento.js';

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
  it('relacionado: true/false explícitos respeitados; omissão vira null (nunca mescla por padrão)', () => {
    expect(parseRespostaExtrator('{"financeiro":true,"intencao":"lancar","tipo":"despesa","valor":10}')?.relacionado).toBeNull();
    expect(parseRespostaExtrator('{"financeiro":true,"intencao":"lancar","tipo":"despesa","valor":10,"relacionado":true}')?.relacionado).toBe(true);
    expect(parseRespostaExtrator('{"financeiro":true,"intencao":"lancar","tipo":"despesa","valor":10,"relacionado":false}')?.relacionado).toBe(false);
  });
});

describe('financeiro/extrator: parseLancamentos (lista, multi-evento)', () => {
  it('objeto único vira lista de 1', () => {
    const r = parseLancamentos('{"financeiro":true,"intencao":"lancar","tipo":"despesa","valor":380}');
    expect(r).toHaveLength(1);
    expect(r[0].valor).toBe(380);
  });
  it('array de 2 vira lista de 2 (caso João Paulo)', () => {
    const raw = '```json\n[{"financeiro":true,"intencao":"lancar","tipo":"entrada","valor":9000,"contraparte":"João Paulo","obra_ref":"João Paulo"},{"financeiro":true,"intencao":"lancar","tipo":"despesa","valor":1500,"descricao":"instalação"}]\n```';
    const r = parseLancamentos(raw);
    expect(r).toHaveLength(2);
    expect(r[0].tipo).toBe('entrada');
    expect(r[0].valor).toBe(9000);
    expect(r[1].tipo).toBe('despesa');
    expect(r[1].valor).toBe(1500);
  });
  it('dois objetos SOLTOS sem array (o bug de hoje) vira lista de 2 — NÃO null', () => {
    const raw = '{"financeiro":true,"intencao":"lancar","tipo":"entrada","valor":9000}\n{"financeiro":true,"intencao":"lancar","tipo":"despesa","valor":1500}';
    const r = parseLancamentos(raw);
    expect(r).toHaveLength(2);
    expect(r[1].valor).toBe(1500);
  });
  it('chaves dentro de string não confundem o separador', () => {
    const raw = '{"financeiro":true,"intencao":"lancar","tipo":"despesa","valor":10,"descricao":"chave } solta"}';
    const r = parseLancamentos(raw);
    expect(r).toHaveLength(1);
    expect(r[0].descricao).toBe('chave } solta');
  });
  it('lixo sem JSON vira lista vazia (nunca explode)', () => {
    expect(parseLancamentos('não consegui ler nada')).toEqual([]);
  });
  it('item sem valor entra com valor null e campos_faltando', () => {
    const raw = '[{"financeiro":true,"intencao":"lancar","tipo":"despesa","valor":"abc"}]';
    const r = parseLancamentos(raw);
    expect(r).toHaveLength(1);
    expect(r[0].valor).toBeNull();
    expect(r[0].campos_faltando).toContain('valor');
  });
  it('formato {lancamentos:[...]} também é aceito', () => {
    const raw = '{"financeiro":true,"lancamentos":[{"financeiro":true,"intencao":"lancar","tipo":"despesa","valor":50}]}';
    const r = parseLancamentos(raw);
    expect(r).toHaveLength(1);
    expect(r[0].valor).toBe(50);
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
  it('pergunta/consulta sobre números não vira lançamento (regra nos prompts)', () => {
    expect(montarPromptExtracaoTexto('x', '2026-06-11')).toContain('PERGUNTA/consulta');
    expect(montarPromptGate('x')).toContain('consulta');
  });
});
