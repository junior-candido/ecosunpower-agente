// Cobrança recorrente — PAGOU. Pelo link (webhook reconfirmado no
// payment_check) ou "Marcar como paga (Pix direto)" na tela:
//  - o valor tem que bater (sem valor confirmado = não baixa); baixa UMA vez;
//  - entra no caixa como RECEITA; falhou o caixa → o Junior lança na mão;
//  - acesso suspenso e ASSISTENTE PAUSADA voltam — só se não sobrou outra
//    fatura vencida em aberto; recibo curto pro cliente (uma vez).
import { describe, it, expect } from 'vitest';
import { baixarFatura } from '../src/modules/cobranca-recorrente/baixa.js';
import type { BaixaDeps, InfoPagamento } from '../src/modules/cobranca-recorrente/baixa.js';
import type { AssinaturaMotor } from '../src/modules/cobranca-recorrente/motor.js';
import type { FaturaRow } from '../src/modules/cobranca-recorrente/faturas-repo.js';

const CASA = '00000000-0000-0000-0000-000000000001';
const A: AssinaturaMotor = {
  id: 'a1', nome: 'Jimena Pereira Fonseca', email: 'jimena@exemplo.invalid', telefone: '5577999610038',
  valorCentavos: 35000, status: 'ativa', diaVencimento: 10, inicioEm: '2026-10-01', companyId: 'c-conquista',
  descricao: 'Monitoramento de Usinas', leadId: null,
  pausaAutomatica: true, diasPausa: 3, pausaAdiadaAte: null, assistentePausadaEm: null, empresaNome: 'Conquista Solar',
};
const F: FaturaRow = {
  id: 'f1', assinaturaId: 'a1', companyId: 'c-conquista', donaCompanyId: CASA, competencia: '2026-10-01', venceEm: '2026-10-10',
  valorCentavos: 29700, descricao: 'Monitoramento de Usinas', status: 'aberta', cobrancaId: 'cob-1', linkUrl: 'https://checkout.exemplo.invalid/f1',
  pagoEm: null, pagoCentavos: null, taxaCentavos: null, metodo: null, formaBaixa: null, baixadoPor: null, lancamentoId: null,
  avisoFaturaEm: '2026-10-07T12:00:00Z', avisoVesperaEm: null, avisoVenceuEm: null, avisoUltimoEm: null, reciboEm: null, canalUltimoAviso: 'whatsapp', criadoEm: '2026-10-07T12:00:00Z',
};

function fake(o: { jaPaga?: boolean; caixaFalha?: boolean; destrava?: boolean; aprovado?: boolean; reciboJaSaiu?: boolean; outras?: FaturaRow[]; alertaJaSaiu?: boolean } = {}) {
  const ev = {
    marcadas: [] as any[], receitas: [] as any[], vinculos: [] as any[], pagamentos: [] as any[], liberados: [] as string[],
    reativadas: [] as string[], zap: [] as any[], emails: [] as any[], junior: [] as string[], logs: [] as any[], auditoria: [] as any[],
  };
  const deps: BaixaDeps = {
    casaId: CASA,
    urlAssinatura: (id) => `https://painel.exemplo.invalid/dashboard/assinaturas/${id}`,
    pausarAssistente: async () => true,
    reativarAssistente: async (a) => { ev.reativadas.push(a.id); return true; },
    auditar: async (e) => { ev.auditoria.push(e); },
    marcarFaturaPaga: async (id, info) => { ev.marcadas.push({ id, ...info }); return !o.jaPaga; },
    lancarReceita: async (a, f, info) => { if (o.caixaFalha) throw new Error('caixa fora'); ev.receitas.push({ a: a.id, f: f.id, ...info }); return 'lanc-1'; },
    vincularLancamento: async (id, l) => { ev.vinculos.push([id, l]); },
    registrarPagamentoNaAssinatura: async (id, prox, pode) => { ev.pagamentos.push([id, prox, pode]); return !!o.destrava && pode; },
    liberarAcesso: async (a) => { ev.liberados.push(a.id); },
    reservarAviso: async (_id, tipo) => (tipo === 'recibo' ? !o.reciboJaSaiu : tipo === 'valor_alerta' ? !o.alertaJaSaiu : true),
    faturasDaAssinatura: async () => [F, ...(o.outras ?? [])],
    modeloAprovado: async () => o.aprovado ?? true,
    enviarModelo: async (tel, modelo, params) => { ev.zap.push({ tel, modelo, params }); },
    enviarEmail: async (to, assunto) => { ev.emails.push({ to, assunto }); },
    avisarJunior: async (t) => { ev.junior.push(t); },
    log: (e) => { ev.logs.push(e); },
  };
  return { deps, ev };
}

const PELO_LINK: InfoPagamento = { pagoCentavos: 29700, metodo: 'pix', formaBaixa: 'link', baixadoPor: null, pagoEm: '2026-10-09T18:00:00Z' };

describe('baixarFatura', () => {
  it('pelo link: marca, lança RECEITA, anda o vencimento, recibo pelo modelo + e-mail, auditoria, Junior sabe', async () => {
    const { deps, ev } = fake();
    const r = await baixarFatura(deps, A, F, PELO_LINK);
    expect(r).toEqual({ ok: true, lancamentoId: 'lanc-1', reativou: false });
    expect(ev.marcadas[0]).toMatchObject({ id: 'f1', pagoCentavos: 29700, metodo: 'pix', formaBaixa: 'link' });
    // o valor da FATURA (297) vale — a assinatura já foi reajustada pra 350 no próximo ciclo
    expect(ev.receitas[0]).toMatchObject({ a: 'a1', f: 'f1', pagoCentavos: 29700 });
    expect(ev.vinculos).toEqual([['f1', 'lanc-1']]);
    expect(ev.pagamentos).toEqual([['a1', '2026-11-10', true]]);
    expect(ev.zap[0]).toMatchObject({ modelo: 'recibo_mensalidade_v1', params: ['Jimena', 'R$ 297,00', 'Monitoramento de Usinas — outubro/2026', '09/10/2026'] });
    expect(ev.emails[0].assunto).toMatch(/Pagamento recebido/);
    expect(ev.junior.at(-1)).toMatch(/Mensalidade paga.*Jimena Pereira Fonseca.*Pix/);
    expect(ev.auditoria).toContainEqual({ assinaturaId: 'a1', acao: 'fatura_paga_link', detalhe: '2026-10' });
  });

  it('valor MENOR que a fatura → não baixa e avisa o Junior UMA vez (webhook repetido não repete)', async () => {
    const { deps, ev } = fake();
    expect(await baixarFatura(deps, A, F, { ...PELO_LINK, pagoCentavos: 100 })).toMatchObject({ ok: false, motivo: 'valor_nao_bate' });
    expect(ev.marcadas).toHaveLength(0);
    expect(ev.junior[0]).toMatch(/não bate/);
    const dnv = fake({ alertaJaSaiu: true });
    await baixarFatura(dnv.deps, A, F, { ...PELO_LINK, pagoCentavos: 100 });
    expect(dnv.ev.junior).toHaveLength(0);
  });

  it('SEM valor confirmado pela InfinitePay → não baixa (nunca usa o nosso valor)', async () => {
    const { deps, ev } = fake();
    expect(await baixarFatura(deps, A, F, { ...PELO_LINK, pagoCentavos: null })).toMatchObject({ ok: false, motivo: 'valor_nao_bate' });
    expect(ev.marcadas).toHaveLength(0);
    expect(ev.junior[0]).toMatch(/não informou o valor/);
  });

  it('já estava paga → nada lançado de novo', async () => {
    const { deps, ev } = fake({ jaPaga: true });
    expect(await baixarFatura(deps, A, F, PELO_LINK)).toMatchObject({ ok: false, motivo: 'ja_paga' });
    expect(ev.receitas).toHaveLength(0);
    expect(await baixarFatura(deps, A, { ...F, status: 'paga' }, PELO_LINK)).toMatchObject({ ok: false, motivo: 'ja_paga' });
  });

  it('caixa falhou → pagamento continua baixado e o Junior lança na mão', async () => {
    const { deps, ev } = fake({ caixaFalha: true });
    expect(await baixarFatura(deps, A, F, PELO_LINK)).toMatchObject({ ok: true, lancamentoId: null });
    expect(ev.junior.some((t) => /lance na mão/i.test(t))).toBe(true);
    expect(ev.logs.some((l) => l.evento === 'erro_caixa')).toBe(true);
  });

  it('acesso suspenso → libera; mas NÃO se sobrou outra fatura vencida em aberto', async () => {
    const um = fake({ destrava: true });
    await baixarFatura(um.deps, A, F, PELO_LINK);
    expect(um.ev.liberados).toEqual(['a1']);
    const velha = { ...F, id: 'f0', competencia: '2026-09-01', venceEm: '2026-09-10' };
    const dois = fake({ destrava: true, outras: [velha] });
    await baixarFatura(dois.deps, A, F, PELO_LINK);
    expect(dois.ev.pagamentos[0][2]).toBe(false);
    expect(dois.ev.liberados).toEqual([]);
  });

  it('ASSISTENTE pausada por fatura → volta sozinha ao pagar (avisa cliente e Junior)', async () => {
    const { deps, ev } = fake();
    const r = await baixarFatura(deps, { ...A, assistentePausadaEm: '2026-10-13T12:00:00Z' }, F, PELO_LINK);
    expect(r).toMatchObject({ ok: true, reativou: true });
    expect(ev.reativadas).toEqual(['a1']);
    expect(ev.junior.some((t) => /voltou a atender \(pagamento confirmado\)/.test(t))).toBe(true);
    expect(ev.emails.some((e) => /voltou a atender/.test(e.assunto))).toBe(true);
    expect(ev.auditoria).toContainEqual({ assinaturaId: 'a1', acao: 'assistente_reativada_pagou' });
  });

  it('pagou uma fatura mas ainda deve outra vencida → a assistente CONTINUA pausada', async () => {
    const velha = { ...F, id: 'f0', competencia: '2026-09-01', venceEm: '2026-09-10' };
    const { deps, ev } = fake({ outras: [velha] });
    const r = await baixarFatura(deps, { ...A, assistentePausadaEm: 'x' }, F, PELO_LINK);
    expect(r).toMatchObject({ ok: true, reativou: false });
    expect(ev.reativadas).toEqual([]);
  });

  it('recibo sai uma vez só; sem modelo aprovado → só e-mail', async () => {
    const um = fake({ reciboJaSaiu: true });
    await baixarFatura(um.deps, A, F, PELO_LINK);
    expect(um.ev.zap).toHaveLength(0);
    const dois = fake({ aprovado: false });
    await baixarFatura(dois.deps, A, F, PELO_LINK);
    expect(dois.ev.zap).toHaveLength(0);
    expect(dois.ev.emails).toHaveLength(1);
  });

  it('Pix direto (na mão): registra quem marcou e o método', async () => {
    const { deps, ev } = fake();
    await baixarFatura(deps, A, F, { pagoCentavos: 29700, metodo: 'pix_direto', formaBaixa: 'manual', baixadoPor: 'Junior', pagoEm: '2026-10-09T18:00:00Z' });
    expect(ev.marcadas[0]).toMatchObject({ metodo: 'pix_direto', formaBaixa: 'manual', baixadoPor: 'Junior' });
    expect(ev.junior.at(-1)).toContain('Pix direto');
    expect(ev.auditoria[0].acao).toBe('fatura_paga_manual');
  });
});
