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
  // Arquivo em CRLF (Windows) — normaliza pra "\n  }\n" achar o fim da função certo.
  const src = readFileSync(join(process.cwd(), 'src', 'index.ts'), 'utf-8').replace(/\r\n/g, '\n');
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

  // Review: mesmo aviso que a Eva já manda em "contrato <nome>" — proposta vencida
  // continua valendo pro contrato, mas quem recebe os links pelo zap tem que saber
  // que precisa conferir os valores.
  it('avisa "proposta expirada" na mensagem quando a proposta usada já venceu', () => {
    expect(corpo).toMatch(/propostaVencida\(|propostaExpiradaEm/);
    expect(corpo).toMatch(/proposta expirada/i);
  });
});

// Review: o "Aprovar" do /fechar antigo (WhatsApp) marcava o lead como cliente
// sem deixar rastro nenhum no audit_log — a MESMA ação, feita pela tela
// (contrato-congelar em router.ts), grava `audit(...) { acao: 'contrato_congelado' }`.
// Sem isso, quem fechava pelo zap ficava invisível pra auditoria.
describe('index.ts — handleFecharApprove grava o MESMO audit "contrato_congelado" que o congelamento do dashboard', () => {
  // Arquivo em CRLF (Windows) — normaliza pra "\n  }\n" achar o fim da função certo.
  const src = readFileSync(join(process.cwd(), 'src', 'index.ts'), 'utf-8').replace(/\r\n/g, '\n');
  const ini = src.indexOf('async function handleFecharApprove(');
  const corpo = src.slice(ini, src.indexOf('\n  }\n', ini));

  it('existe e reusa o helper audit() (mesmo de dashboard/audit.js)', () => {
    expect(ini).toBeGreaterThan(0);
    expect(corpo).toMatch(/import\(['"]\.\/modules\/dashboard\/audit\.js['"]\)/);
    expect(corpo).toContain('audit(');
  });

  it('a ação gravada é a mesma da tela: "contrato_congelado", ligada ao lead', () => {
    expect(corpo).toMatch(/acao:\s*['"]contrato_congelado['"]/);
    expect(corpo).toMatch(/entidade:\s*['"]lead['"]/);
  });
});

// Review: o botão "evabt:fechar:<leadId>" carrega o leadId no PRÓPRIO id do botão.
// Sem conferir a empresa, um botão fabricado (ou reenviado) com o leadId de outro
// tenant deixaria o admin de UMA empresa fechar contrato pelo lead de OUTRA.
describe('index.ts — handleFecharStart só usa o lead se ele for da MESMA empresa do canal/admin', () => {
  // Arquivo em CRLF (Windows) — normaliza pra "\n  }\n" achar o fim da função certo.
  const src = readFileSync(join(process.cwd(), 'src', 'index.ts'), 'utf-8').replace(/\r\n/g, '\n');
  const ini = src.indexOf('async function handleFecharStart(');
  const corpo = src.slice(ini, src.indexOf('\n  }\n', ini));

  it('existe e confere lead.company_id contra a empresa do admin/canal antes de seguir', () => {
    expect(ini).toBeGreaterThan(0);
    expect(corpo).toContain('empresaDoAdmin(');
    expect(corpo).toMatch(/lead\.company_id/);
  });

  it('a checagem vem ANTES de montar os dados iniciais do fechamento', () => {
    const checagem = corpo.search(/lead\.company_id/);
    const monta = corpo.indexOf('buildInitialData(');
    expect(checagem).toBeGreaterThan(0);
    expect(monta).toBeGreaterThan(0);
    expect(checagem).toBeLessThan(monta);
  });
});
