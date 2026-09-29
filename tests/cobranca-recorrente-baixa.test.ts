// Cobrança recorrente — PAGOU. Pelo link (webhook reconfirmado no
// payment_check) ou "Marcar como paga (Pix direto)" na tela:
//  - o valor tem que bater; a fatura só é baixada UMA vez;
//  - entra no caixa como RECEITA (origem 'assinatura'); falhou o caixa → o
//    pagamento fica e o Junior é avisado pra lançar na mão;
//  - acesso suspenso volta; recibo curto pro cliente (uma vez).
import { describe, it, expect } from 'vitest';
import { baixarFatura } from '../src/modules/cobranca-recorrente/baixa.js';
import type { BaixaDeps } from '../src/modules/cobranca-recorrente/baixa.js';
import type { AssinaturaMotor } from '../src/modules/cobranca-recorrente/motor.js';
import type { FaturaRow } from '../src/modules/cobranca-recorrente/faturas-repo.js';

const A: AssinaturaMotor = {
  id: 'a1', nome: 'Jimena Pereira Fonseca', email: 'jimena@exemplo.invalid', telefone: '5577999610038',
  valorCentavos: 35000, status: 'ativa', diaVencimento: 10, inicioEm: '2026-10-01', companyId: 'c-conquista',
  descricao: 'Monitoramento de Usinas', leadId: null,
};
const F: FaturaRow = {
  id: 'f1', assinaturaId: 'a1', companyId: 'c-conquista', donaCompanyId: 'casa', competencia: '2026-10-01', venceEm: '2026-10-10',
  valorCentavos: 29700, descricao: 'Monitoramento de Usinas', status: 'aberta', cobrancaId: 'cob-1', linkUrl: 'https://checkout.exemplo.invalid/f1',
  pagoEm: null, pagoCentavos: null, taxaCentavos: null, metodo: null, formaBaixa: null, baixadoPor: null, lancamentoId: null,
  avisoFaturaEm: '2026-10-07T12:00:00Z', avisoD0Em: null, avisoD3Em: null, avisoAtrasoEm: null, reciboEm: null, canalUltimoAviso: 'whatsapp', criadoEm: '2026-10-07T12:00:00Z',
};

function fake(o: { jaPaga?: boolean; caixaFalha?: boolean; destrava?: boolean; aprovado?: boolean; reciboJaSaiu?: boolean } = {}) {
  const ev = {
    marcadas: [] as any[], receitas: [] as any[], vinculos: [] as any[], pagamentos: [] as any[], liberados: [] as string[],
    zap: [] as any[], emails: [] as any[], junior: [] as string[], logs: [] as any[],
  };
  const deps: BaixaDeps = {
    marcarFaturaPaga: async (id, info) => { ev.marcadas.push({ id, ...info }); return !o.jaPaga; },
    lancarReceita: async (a, f, info) => { if (o.caixaFalha) throw new Error('caixa fora'); ev.receitas.push({ a: a.id, f: f.id, ...info }); return 'lanc-1'; },
    vincularLancamento: async (id, l) => { ev.vinculos.push([id, l]); },
    registrarPagamentoNaAssinatura: async (id, prox) => { ev.pagamentos.push([id, prox]); return !!o.destrava; },
    liberarAcesso: async (a) => { ev.liberados.push(a.id); },
    reservarAviso: async () => !o.reciboJaSaiu,
    modeloAprovado: async () => o.aprovado ?? true,
    enviarModelo: async (tel, modelo, params) => { ev.zap.push({ tel, modelo, params }); },
    enviarEmail: async (to, assunto) => { ev.emails.push({ to, assunto }); },
    avisarJunior: async (t) => { ev.junior.push(t); },
    log: (e) => { ev.logs.push(e); },
  };
  return { deps, ev };
}

const PELO_LINK = { pagoCentavos: 29700, metodo: 'pix', formaBaixa: 'link' as const, baixadoPor: null, pagoEm: '2026-10-09T18:00:00Z' };

describe('baixarFatura', () => {
  it('pelo link: marca, lança RECEITA no caixa, anda o vencimento, recibo pelo modelo + e-mail, Junior sabe', async () => {
    const { deps, ev } = fake();
    const r = await baixarFatura(deps, A, F, PELO_LINK);
    expect(r).toEqual({ ok: true, lancamentoId: 'lanc-1' });
    expect(ev.marcadas[0]).toMatchObject({ id: 'f1', pagoCentavos: 29700, metodo: 'pix', formaBaixa: 'link' });
    // o valor da FATURA (297) vale — a assinatura já foi reajustada pra 350 no próximo ciclo
    expect(ev.receitas[0]).toMatchObject({ a: 'a1', f: 'f1', pagoCentavos: 29700, metodo: 'pix' });
    expect(ev.vinculos).toEqual([['f1', 'lanc-1']]);
    expect(ev.pagamentos).toEqual([['a1', '2026-11-10']]);
    expect(ev.zap[0]).toMatchObject({ tel: '5577999610038', modelo: 'recibo_mensalidade_v1', params: ['Jimena', 'R$ 297,00', 'Monitoramento de Usinas — outubro/2026', '09/10/2026'] });
    expect(ev.emails[0].assunto).toMatch(/Pagamento recebido/);
    expect(ev.junior[0]).toMatch(/Mensalidade paga.*Jimena Pereira Fonseca/);
    expect(ev.junior[0]).toContain('Pix');
    expect(ev.logs.some((l) => l.evento === 'fatura_paga' && l.fatura_id === 'f1')).toBe(true);
  });

  it('valor pago MENOR que a fatura → não baixa e avisa o Junior', async () => {
    const { deps, ev } = fake();
    const r = await baixarFatura(deps, A, F, { ...PELO_LINK, pagoCentavos: 100 });
    expect(r).toMatchObject({ ok: false, motivo: 'valor_nao_bate' });
    expect(ev.marcadas).toHaveLength(0);
    expect(ev.receitas).toHaveLength(0);
    expect(ev.junior[0]).toMatch(/não bate/);
  });

  it('já estava paga (webhook repetido / Pix direto antes) → nada lançado de novo', async () => {
    const { deps, ev } = fake({ jaPaga: true });
    expect(await baixarFatura(deps, A, F, PELO_LINK)).toMatchObject({ ok: false, motivo: 'ja_paga' });
    expect(ev.receitas).toHaveLength(0);
    expect(ev.zap).toHaveLength(0);
  });

  it('fatura que não está aberta → nem tenta', async () => {
    const { deps, ev } = fake();
    expect(await baixarFatura(deps, A, { ...F, status: 'paga' }, PELO_LINK)).toMatchObject({ ok: false, motivo: 'ja_paga' });
    expect(ev.marcadas).toHaveLength(0);
  });

  it('caixa falhou → pagamento continua baixado e o Junior é avisado pra lançar na mão', async () => {
    const { deps, ev } = fake({ caixaFalha: true });
    const r = await baixarFatura(deps, A, F, PELO_LINK);
    expect(r).toEqual({ ok: true, lancamentoId: null });
    expect(ev.junior.some((t) => /lance na mão|lançar na mão/i.test(t))).toBe(true);
    expect(ev.logs.some((l) => l.evento === 'erro_caixa')).toBe(true);
  });

  it('acesso estava suspenso → libera', async () => {
    const { deps, ev } = fake({ destrava: true });
    await baixarFatura(deps, A, F, PELO_LINK);
    expect(ev.liberados).toEqual(['a1']);
  });

  it('recibo sai uma vez só; sem modelo aprovado → só e-mail', async () => {
    const um = fake({ reciboJaSaiu: true });
    await baixarFatura(um.deps, A, F, PELO_LINK);
    expect(um.ev.zap).toHaveLength(0);
    expect(um.ev.emails).toHaveLength(0);
    const dois = fake({ aprovado: false });
    await baixarFatura(dois.deps, A, F, PELO_LINK);
    expect(dois.ev.zap).toHaveLength(0);
    expect(dois.ev.emails).toHaveLength(1);
  });

  it('Pix direto (na mão): registra quem marcou e o método', async () => {
    const { deps, ev } = fake();
    await baixarFatura(deps, A, F, { pagoCentavos: 29700, metodo: 'pix_direto', formaBaixa: 'manual', baixadoPor: 'Junior', pagoEm: '2026-10-09T18:00:00Z' });
    expect(ev.marcadas[0]).toMatchObject({ metodo: 'pix_direto', formaBaixa: 'manual', baixadoPor: 'Junior' });
    expect(ev.junior[0]).toContain('Pix direto');
  });
});
