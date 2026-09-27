import { describe, it, expect } from 'vitest';
import { completarComPlaceholders } from '../src/modules/closing/fechamento-auto.js';
import { montarDocumentoFinal } from '../src/modules/closing/documento-final.js';
import { renderContrato } from '../src/modules/closing/templates/contrato.html.js';
import { renderProcuracao } from '../src/modules/closing/templates/procuracao.html.js';
import { renderContratoFormPage } from '../src/modules/dashboard/contrato-form-views.js';
import { CONTRATOS, getContrato } from '../src/modules/closing/contratos-registry.js';
import { dadosFechamentoCamilaMesmaPessoa as CAMILA } from './fixtures/closing-camila.js';
import type { DadosFechamento, PessoaFisica } from '../src/modules/closing/types.js';

// E-mail, telefone e profissão são OPCIONAIS: cliente sem eles tem que conseguir
// PDF. Antes o autopreenchimento punha "____" neles e a trava bloqueava pra sempre
// (enquanto o formulário dizia "✅ Está tudo preenchido").

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

/** Só o texto que o cliente lê, com espaços normalizados. */
function texto(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ');
}

function semOpcionais(): DadosFechamento {
  const d = clone(CAMILA);
  const t = d.titular_uc as PessoaFisica;
  delete (t as any).email;
  delete (t as any).telefone;
  delete t.profissao;
  d.contratante = t;
  return d;
}

// Banco de mentira mínimo (eq/order/limit/maybeSingle/then).
function fakeDb(tabelas: Record<string, any[]>) {
  return {
    from(tabela: string) {
      const eqs: Array<[string, unknown]> = [];
      let limite = Infinity;
      let contar = false;
      const linhas = () => (tabelas[tabela] ?? []).filter((l) => eqs.every(([c, v]) => l[c] === v)).slice(0, limite);
      const b: any = {
        select: (_c?: string, o?: { count?: string }) => { if (o?.count) contar = true; return b; },
        eq: (c: string, v: unknown) => { eqs.push([c, v]); return b; },
        neq: () => b, in: () => b, gt: () => b, is: () => b,
        order: () => b,
        limit: (n: number) => { limite = n; return b; },
        maybeSingle: async () => ({ data: linhas()[0] ?? null, error: null }),
        then: (ok: any, err: any) => Promise.resolve(
          contar ? { count: linhas().length, error: null } : { data: linhas(), error: null },
        ).then(ok, err),
      };
      return b;
    },
  } as any;
}

const t = CAMILA.titular_uc as PessoaFisica;
const LEAD_SEM_OPCIONAIS = {
  id: 'L1', company_id: 'emp-1', name: t.nome, phone: null, email: null,
  cpf_cnpj: t.cpf, rg: t.rg, orgao_emissor_rg: t.orgao_emissor_rg, data_nascimento: null,
  estado_civil: 'casado', profissao: null,
  cep: t.endereco.cep, endereco_rua: t.endereco.rua, endereco_numero: t.endereco.numero,
  endereco_complemento: null, neighborhood: t.endereco.bairro, city: t.endereco.cidade, uf: t.endereco.uf,
  concessionaria: CAMILA.concessionaria, uc_numero: CAMILA.uc_numero, forma_pagamento: 'À vista no PIX',
  contrato_dados: { fv: { sistema: CAMILA.sistema, comercial: { valor_total_brl: 38500 } } },
};

describe('completarComPlaceholders — opcionais ficam VAZIOS, não "____"', () => {
  it('sem e-mail, telefone e profissão: nada de branco pra preencher à mão', () => {
    const d = completarComPlaceholders({ titular_uc: { tipo: 'PF', nome: 'Maria' } as any });
    const p = d.titular_uc as PessoaFisica;
    expect(p.email ?? '').toBe('');
    expect(p.telefone ?? '').toBe('');
    expect(p.profissao ?? '').toBe('');
  });
});

describe('templates — e-mail/telefone/profissão só aparecem quando existem', () => {
  it('contrato SEM os três: termina no endereço, sem vírgula sobrando', () => {
    const txt = texto(renderContrato(semOpcionais()));
    expect(txt).toContain('CONTRATANTE: Camila Barbosa Costa Cardoso, Brasileiro(a), casado(a), nascido(a) em 21/06/1989, inscrito(a) no CPF/MF sob o nº 028.876.121-90, RG nº 26163 MTE-DF, residente e domiciliado(a) na Rua sem nome, Quadra 38, Lote 01A-1, S/N, Jardim Guaíra II, Águas Lindas de Goiás-GO, CEP 72910-000.');
    expect(txt).not.toMatch(/e-mail\s*,|telefone\s*\.|, ,|,\s*\./);
  });

  it('contrato só com e-mail', () => {
    const d = semOpcionais();
    (d.titular_uc as PessoaFisica).email = 'maria@x.com';
    const txt = texto(renderContrato(d));
    expect(txt).toContain('CEP 72910-000, e-mail maria@x.com.');
    expect(txt).not.toContain('telefone');
  });

  it('contrato com e-mail e telefone (o de sempre)', () => {
    const txt = texto(renderContrato(CAMILA));
    expect(txt).toContain(`CEP 72910-000, e-mail ${t.email}, telefone ${t.telefone}.`);
  });

  it('procuração sem profissão: sem ", ," no texto', () => {
    const txt = texto(renderProcuracao(semOpcionais()));
    expect(txt).toContain('CAMILA BARBOSA COSTA CARDOSO, Brasileiro(a), casado(a), portador(a) do RG nº 26163 MTE-DF');
    expect(txt).not.toMatch(/, ,/);
  });
});

describe('trava — cliente sem e-mail/telefone/profissão PASSA', () => {
  it('contrato: ok, sem problemas', async () => {
    const doc = await montarDocumentoFinal(fakeDb({ leads: [LEAD_SEM_OPCIONAIS] }), 'L1', 'fv');
    expect(doc!.problemas).toEqual([]);
    expect(doc!.ok).toBe(true);
    expect(doc!.html).not.toContain('___');
  });

  it('procuração: ok, sem problemas', async () => {
    const doc = await montarDocumentoFinal(fakeDb({ leads: [LEAD_SEM_OPCIONAIS] }), 'L1', 'procuracao');
    expect(doc!.problemas).toEqual([]);
    expect(doc!.ok).toBe(true);
  });
});

describe('formulário — a caixa de status usa o MESMO resultado da trava', () => {
  const def = getContrato('fv')!;
  const base = {
    leadId: 'L1', nome: 'Maria', def,
    tipos: CONTRATOS.map((c) => ({ tipo: c.tipo, nome: c.nome, emoji: c.emoji })),
    valores: {}, faltando: [], temProposta: true,
  };

  it('nenhum campo vermelho, mas a trava tem problema → NÃO diz "tudo preenchido"; lista o problema', () => {
    const html = renderContratoFormPage({ ...base, problemas: ['O documento ainda tem espaço em branco para preencher à mão ("___")'] });
    expect(html).not.toContain('Está tudo preenchido');
    expect(html).toContain('espaço em branco para preencher à mão');
    expect(html).toMatch(/travad/i);
  });

  it('trava sem problema → "tudo preenchido"', () => {
    const html = renderContratoFormPage({ ...base, problemas: [] });
    expect(html).toContain('Está tudo preenchido');
  });
});
