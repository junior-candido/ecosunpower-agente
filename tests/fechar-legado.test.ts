import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { prepararDocsFechar, leadIdDaSessao, manterLeadDaSessao } from '../src/modules/closing/fechar-legado.js';
import { dadosFechamentoCamilaMesmaPessoa as CAMILA } from './fixtures/closing-camila.js';
import type { ClosingState, DadosFechamento } from '../src/modules/closing/types.js';

// O /fechar antigo (conversa com a Eva) também passa pela trava antes de virar
// PDF/Drive — e o fechamento fica ligado ao lead do CLIENTE, nunca ao do admin.

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

describe('prepararDocsFechar — a trava do /fechar antigo', () => {
  it('completo → ok, com o HTML de cada documento pedido', () => {
    const r = prepararDocsFechar({ ...clone(CAMILA), docs_pedidos: ['contrato', 'procuracao'] });
    expect(r.problemas).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.contratoHtml).toContain('CONTRATANTE');
    expect(r.procuracaoHtml).toBeTruthy();
  });

  it('faltando RG → bloqueia e diz o quê (por documento)', () => {
    const d = clone(CAMILA);
    (d.titular_uc as any).rg = '';
    const r = prepararDocsFechar({ ...d, docs_pedidos: ['contrato', 'procuracao'] });
    expect(r.ok).toBe(false);
    expect(r.problemas.some((p) => p.startsWith('Contrato') && p.includes('RG'))).toBe(true);
    expect(r.problemas.some((p) => p.startsWith('Procuração') && p.includes('RG'))).toBe(true);
  });

  it('só procuração: o que é só do contrato (valor, pagamento) não trava', () => {
    const d = clone(CAMILA) as DadosFechamento;
    d.comercial = { valor_total_brl: 0, forma_pagamento: '' };
    const r = prepararDocsFechar({ ...d, docs_pedidos: ['procuracao'] });
    expect(r.ok).toBe(true);
    expect(r.contratoHtml).toBeUndefined();
  });

  it('CPF com dígito errado → bloqueia', () => {
    const d = clone(CAMILA);
    (d.titular_uc as any).cpf = '123.456.789-00';
    const r = prepararDocsFechar({ ...d, docs_pedidos: ['contrato'] });
    expect(r.ok).toBe(false);
    expect(r.problemas.join(' ')).toContain('CPF');
  });
});

describe('lead da sessão do /fechar', () => {
  const dados = clone(CAMILA);
  it('lê o lead do cliente guardado na sessão', () => {
    expect(leadIdDaSessao({ stage: 'awaiting_confirm', data: dados, lead_id: 'L-cliente' } as ClosingState)).toBe('L-cliente');
  });
  it('sessão sem lead (cliente digitado na mão) → null (nunca o lead do admin)', () => {
    expect(leadIdDaSessao({ stage: 'awaiting_confirm', data: dados } as ClosingState)).toBeNull();
    expect(leadIdDaSessao(null)).toBeNull();
  });
  it('o lead atravessa as trocas de etapa da conversa', () => {
    const antigo = { stage: 'collecting', data: {}, pending_questions: [], lead_id: 'L-cliente' } as ClosingState;
    const novo = manterLeadDaSessao({ stage: 'awaiting_confirm', data: dados }, antigo);
    expect((novo as any).lead_id).toBe('L-cliente');
    expect(manterLeadDaSessao({ stage: 'cancelled' }, antigo)).toEqual({ stage: 'cancelled' });
  });
});

describe('index.ts — /fechar antigo passa pela trava e não usa o lead do admin', () => {
  const src = readFileSync(join(process.cwd(), 'src', 'index.ts'), 'utf-8');
  const ini = src.indexOf('async function handleFecharGenerate(');
  const corpo = src.slice(ini, src.indexOf('\n  }\n', ini));

  it('valida antes de gravar/renderizar PDF', () => {
    expect(ini).toBeGreaterThan(0);
    const trava = corpo.indexOf('prepararDocsFechar(');
    expect(trava).toBeGreaterThan(0);
    expect(trava).toBeLessThan(corpo.indexOf('if (!preparado.ok)') + 1);
    expect(corpo.indexOf('if (!preparado.ok)')).toBeLessThan(corpo.indexOf('createFechamento('));
    expect(corpo.indexOf('if (!preparado.ok)')).toBeLessThan(corpo.indexOf('renderHtmlToPdf('));
    expect(corpo).not.toMatch(/renderContrato\(|renderProcuracao\(/);
  });

  it('o lead vem da sessão, não do telefone do admin', () => {
    expect(corpo).not.toContain('getLeadByPhone(adminPhone)');
    expect(corpo).toContain('leadIdDaSessao(');
  });
});
