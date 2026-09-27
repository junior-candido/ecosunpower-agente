import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from 'vitest';
import { montarDocumentoFinal, validarParaCongelar } from '../src/modules/closing/documento-final.js';
import { completarComPlaceholders } from '../src/modules/closing/fechamento-auto.js';
import { dadosFechamentoCamilaMesmaPessoa as CAMILA } from './fixtures/closing-camila.js';

// O documento que SAI (PDF, zap, Drive): o congelado quando existe (com a data do
// congelamento), senão o montado agora (com a data de hoje em Brasília) — e sempre
// com a lista de problemas que trava a saída.

// Banco de mentira que respeita eq/gt/order/limit de verdade.
function fakeDb(tabelas: Record<string, any[]>) {
  return {
    from(tabela: string) {
      const eqs: Array<[string, unknown]> = [];
      const gts: Array<[string, string]> = [];
      const ins: Array<[string, unknown[]]> = [];
      let ordem: { col: string; desc: boolean } | null = null;
      let limite = Infinity;
      let contar = false;
      const linhas = () => {
        let r = (tabelas[tabela] ?? [])
          .filter((l) => eqs.every(([c, v]) => l[c] === v))
          .filter((l) => ins.every(([c, v]) => v.includes(l[c])))
          .filter((l) => gts.every(([c, v]) => String(l[c] ?? '') > v));
        if (ordem) {
          const { col, desc } = ordem;
          r = [...r].sort((x, y) => String(x[col]).localeCompare(String(y[col])) * (desc ? -1 : 1));
        }
        return r.slice(0, limite);
      };
      const b: any = {
        select: (_c?: string, o?: { count?: string }) => { if (o?.count) contar = true; return b; },
        eq: (c: string, v: unknown) => { eqs.push([c, v]); return b; },
        gt: (c: string, v: string) => { gts.push([c, v]); return b; },
        in: (c: string, v: unknown[]) => { ins.push([c, v]); return b; },
        order: (col: string, o?: { ascending?: boolean }) => { ordem = { col, desc: o?.ascending === false }; return b; },
        limit: (n: number) => { limite = n; return b; },
        maybeSingle: async () => {
          const r = linhas();
          if (r.length > 1) return { data: null, error: { message: 'multiple rows returned' } };
          return { data: r[0] ?? null, error: null };
        },
        then: (ok: any, err: any) => Promise.resolve(
          contar ? { count: linhas().length, error: null } : { data: linhas(), error: null },
        ).then(ok, err),
      };
      return b;
    },
  } as any;
}

const t = CAMILA.titular_uc as any;
const LEAD_COMPLETO = {
  id: 'L1', company_id: 'emp-1', name: t.nome, phone: t.telefone, email: t.email,
  cpf_cnpj: t.cpf, rg: t.rg, orgao_emissor_rg: t.orgao_emissor_rg, data_nascimento: t.data_nascimento,
  estado_civil: 'casado', profissao: t.profissao,
  cep: t.endereco.cep, endereco_rua: t.endereco.rua, endereco_numero: t.endereco.numero,
  endereco_complemento: null, neighborhood: t.endereco.bairro, city: t.endereco.cidade, uf: t.endereco.uf,
  concessionaria: CAMILA.concessionaria, uc_numero: CAMILA.uc_numero, forma_pagamento: 'À vista no PIX',
  contrato_dados: {
    fv: {
      sistema: CAMILA.sistema,
      comercial: { valor_total_brl: 38500 },
    },
  },
};

describe('montarDocumentoFinal', () => {
  const tzOriginal = process.env.TZ;
  beforeAll(() => { process.env.TZ = 'UTC'; }); // como o servidor de produção
  afterAll(() => { if (tzOriginal === undefined) delete process.env.TZ; else process.env.TZ = tzOriginal; });
  afterEach(() => { vi.useRealTimers(); });

  it('lead inexistente → null', async () => {
    expect(await montarDocumentoFinal(fakeDb({ leads: [] }), 'L1', 'fv')).toBeNull();
  });

  it('tipo desconhecido → null', async () => {
    expect(await montarDocumentoFinal(fakeDb({ leads: [LEAD_COMPLETO] }), 'L1', 'xyz')).toBeNull();
  });

  it('completo, sem congelar → ok, com a data de HOJE em Brasília (22:30 BRT = dia seguinte em UTC)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T01:30:00Z'));
    const doc = await montarDocumentoFinal(fakeDb({ leads: [LEAD_COMPLETO] }), 'L1', 'fv');
    expect(doc!.problemas).toEqual([]);
    expect(doc!.ok).toBe(true);
    expect(doc!.congelado).toBeNull();
    expect(doc!.html).toContain('27 de setembro de 2026');
    expect(doc!.html).not.toContain('28 de setembro de 2026');
  });

  it('propostaExpiradaEm: null quando a proposta está no prazo (ou não tem proposta)', async () => {
    const doc = await montarDocumentoFinal(fakeDb({ leads: [LEAD_COMPLETO] }), 'L1', 'fv');
    expect(doc!.propostaExpiradaEm).toBeNull();
  });

  it('propostaExpiradaEm: devolve a data ISO de quando venceu — a validade da proposta é do LINK, o contrato continua valendo', async () => {
    const propostas = [{
      id: 'P1', lead_id: 'L1', company_id: 'emp-1', revoked: false, created_at: '2026-04-01T00:00:00Z',
      expires_at: '2026-08-10T12:00:00Z',
      dados_input: { potenciaKwp: 8.4, modalidade: 'autoconsumo_local', modulo: { fabricante: 'Trina', potenciaW: 700, quantidade: 12 }, inversor: { fabricante: 'Sungrow', modelo: 'X', potencia_kw: 5 }, valorTotalRs: 38500 },
    }];
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-27T15:00:00Z')); // depois do vencimento
    const doc = await montarDocumentoFinal(fakeDb({ leads: [LEAD_COMPLETO], propostas_publicas: propostas }), 'L1', 'fv');
    expect(doc!.propostaExpiradaEm).toBe('2026-08-10T12:00:00Z');
  });

  it('faltando dado → não ok, lista o que falta, mas ainda devolve o HTML (pra prévia)', async () => {
    const lead = { ...LEAD_COMPLETO, cpf_cnpj: null, rg: null, contrato_dados: null, forma_pagamento: null };
    const doc = await montarDocumentoFinal(fakeDb({ leads: [lead] }), 'L1', 'fv');
    expect(doc!.ok).toBe(false);
    const txt = doc!.problemas.join(' | ');
    expect(txt).toContain('CPF');
    expect(txt).toContain('RG');
    expect(txt).toContain('Valor total');
    expect(txt).toContain('Forma de pagamento');
    expect(doc!.html).toContain('___'); // a prévia continua mostrando os brancos
  });

  it('lead sem concessionária e fora de DF/GO: o padrão "Neoenergia" do autopreenchimento NÃO passa', async () => {
    const lead = { ...LEAD_COMPLETO, concessionaria: null, uf: null };
    const doc = await montarDocumentoFinal(fakeDb({ leads: [lead] }), 'L1', 'procuracao');
    expect(doc!.problemas.join(' ')).toContain('Concessionária');
  });

  describe('com contrato congelado', () => {
    const snapshot = { ...CAMILA, data_documento: '2026-07-13', comercial: { valor_total_brl: 38500, forma_pagamento: 'À vista no PIX' } };
    // O cadastro/rascunho MUDOU depois de congelar (valor novo, UC nova).
    const leadMudado = {
      ...LEAD_COMPLETO,
      uc_numero: '99999999',
      contrato_dados: { fv: { sistema: CAMILA.sistema, comercial: { valor_total_brl: 77777 } } },
    };
    const fechamentos = [
      { id: 'F1', lead_id: 'L1', status: 'aprovado_junior', created_by: 'J', created_at: '2026-07-01T12:00:00Z', dados_snapshot: { ...snapshot, data_documento: '2026-07-01' } },
      { id: 'F2', lead_id: 'L1', status: 'aprovado_junior', created_by: 'J', created_at: '2026-07-13T12:00:00Z', dados_snapshot: snapshot },
    ];

    it('o contrato impresso é o RETRATO congelado (valor e data do congelamento), não o cadastro de agora', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-09-27T15:00:00Z'));
      const doc = await montarDocumentoFinal(fakeDb({ leads: [leadMudado], fechamentos }), 'L1', 'fv');
      expect(doc!.congelado).toEqual({ congeladoEm: '2026-07-13T12:00:00Z', versao: 2 });
      expect(doc!.html).toContain('38.500');
      expect(doc!.html).not.toContain('77.777');
      expect(doc!.html).toContain('13 de julho de 2026');
      expect(doc!.html).not.toContain('27 de setembro de 2026');
      expect(doc!.ok).toBe(true);
    });

    it('a procuração também sai do retrato (UC congelada)', async () => {
      const doc = await montarDocumentoFinal(fakeDb({ leads: [leadMudado], fechamentos }), 'L1', 'procuracao');
      expect(doc!.html).toContain(CAMILA.uc_numero!);
      expect(doc!.html).not.toContain('99999999');
      expect(doc!.html).toContain('13 de julho de 2026');
    });

    it('retrato congelado com "____" continua BLOQUEADO (congelar não libera lacuna)', async () => {
      const ruim = [{ ...fechamentos[1], dados_snapshot: { ...snapshot, titular_uc: { ...(snapshot.titular_uc as any), rg: '_______' } } }];
      const doc = await montarDocumentoFinal(fakeDb({ leads: [leadMudado], fechamentos: ruim }), 'L1', 'fv');
      expect(doc!.ok).toBe(false);
      expect(doc!.problemas.join(' ')).toContain('RG');
    });

    it('ADITIVO: "contrato firmado em" = data do documento congelado (não o dia UTC)', async () => {
      const fx = [{ ...fechamentos[1], dados_snapshot: { ...snapshot, data_documento: '2026-07-10' } }];
      const doc = await montarDocumentoFinal(fakeDb({ leads: [leadMudado], fechamentos: fx }), 'L1', 'aditivo');
      expect(doc!.dados.aditivo?.contrato_data).toBe('2026-07-10');
    });

    it('ADITIVO: retrato sem data, congelado às 22:30 BRT → o dia de Brasília (não o seguinte, em UTC)', async () => {
      const semData: any = { ...snapshot };
      delete semData.data_documento;
      const fx = [{ ...fechamentos[1], created_at: '2026-09-28T01:30:00Z', dados_snapshot: semData }];
      const doc = await montarDocumentoFinal(fakeDb({ leads: [leadMudado], fechamentos: fx }), 'L1', 'aditivo');
      expect(doc!.dados.aditivo?.contrato_data).toBe('2026-09-27');
    });

    it('retrato com dados CRUS: o padrão do autopreenchimento ("Neoenergia-DF") não passa por dado', async () => {
      const cru: any = JSON.parse(JSON.stringify({ ...snapshot }));
      delete cru.concessionaria;
      delete cru.data_documento;
      const fx = [{ ...fechamentos[1], dados_snapshot: { ...snapshot, concessionaria: 'Neoenergia-DF', dados_crus: cru } }];
      const doc = await montarDocumentoFinal(fakeDb({ leads: [leadMudado], fechamentos: fx }), 'L1', 'procuracao');
      expect(doc!.ok).toBe(false);
      expect(doc!.problemas.join(' ')).toContain('Concessionária');
    });

    it('o ADITIVO não é o retrato: ele é montado agora (é o documento novo)', async () => {
      const doc = await montarDocumentoFinal(fakeDb({ leads: [leadMudado], fechamentos }), 'L1', 'aditivo');
      expect(doc!.congelado).toBeNull();
    });
  });
});

describe('validarParaCongelar — só congela o que PODE sair', () => {
  it('cru completo → ok', () => {
    const r = validarParaCongelar({ cru: CAMILA, dados: completarComPlaceholders(CAMILA) });
    expect(r.problemas).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('cru sem concessionária/UF: os padrões ("Neoenergia-DF", "DF") NÃO contam como dado', () => {
    const cru: any = JSON.parse(JSON.stringify(CAMILA));
    delete cru.concessionaria;
    delete cru.titular_uc.endereco.uf;
    cru.contratante = cru.titular_uc;
    const r = validarParaCongelar({ cru, dados: completarComPlaceholders(cru) });
    expect(r.ok).toBe(false);
    expect(r.problemas.join(' ')).toContain('Concessionária');
    expect(r.problemas.join(' ')).toContain('UF');
  });
});
