// Cobrança recorrente — o robô diário e as ações manuais, com dublês (sem
// rede, sem banco). O que o Junior pediu:
//  - D−3 cria a fatura, gera o link e manda; D0 e D+3 lembram; D+7 avisa ele;
//  - WhatsApp só com o MODELO aprovado; sem modelo → e-mail + aviso pro Junior
//    com o texto pronto pra encaminhar;
//  - nunca manda o mesmo aviso 2x; InfinitePay recusou / robô falhou → Junior sabe.
import { describe, it, expect, beforeEach } from 'vitest';
import { rodarCobrancaRecorrente, gerarCobrancaAgora, reenviarFatura } from '../src/modules/cobranca-recorrente/motor.js';
import type { MotorDeps, AssinaturaMotor } from '../src/modules/cobranca-recorrente/motor.js';
import type { FaturaRow, TipoAviso } from '../src/modules/cobranca-recorrente/faturas-repo.js';

const COL: Record<TipoAviso, keyof FaturaRow> = {
  fatura: 'avisoFaturaEm', lembrete_d0: 'avisoD0Em', lembrete_d3: 'avisoD3Em', atraso_junior: 'avisoAtrasoEm', recibo: 'reciboEm',
};

const JIMENA: AssinaturaMotor = {
  id: 'a1', nome: 'Jimena Pereira Fonseca', email: 'jimena@exemplo.invalid', telefone: '5577999610038',
  valorCentavos: 29700, status: 'ativa', diaVencimento: 10, inicioEm: '2026-10-01', companyId: 'c-conquista',
  descricao: 'Monitoramento de Usinas', leadId: null,
};

function fakeDeps(o: { assinaturas?: AssinaturaMotor[]; aprovado?: boolean; linkFalha?: boolean; zapFalha?: boolean; emailFalha?: boolean; juniorFalha?: boolean; agora?: string } = {}) {
  const faturas: FaturaRow[] = [];
  const zap: Array<{ tel: string; modelo: string; params: string[] }> = [];
  const emails: Array<{ to: string; assunto: string; cta: string | null }> = [];
  const junior: string[] = [];
  const logs: Array<Record<string, unknown>> = [];
  let seq = 0;
  const agora = o.agora ?? '2026-10-07T12:00:00Z';
  const deps: MotorDeps = {
    donaId: 'casa',
    listarCobraveis: async () => o.assinaturas ?? [JIMENA],
    faturasDaAssinatura: async (id) => faturas.filter((f) => f.assinaturaId === id).map((f) => ({ ...f })),
    criarFatura: async (n) => {
      if (faturas.some((f) => f.assinaturaId === n.assinaturaId && f.competencia === n.competencia)) return null;
      const f: FaturaRow = {
        id: `f${++seq}`, assinaturaId: n.assinaturaId, companyId: n.companyId, donaCompanyId: n.donaId,
        competencia: n.competencia, venceEm: n.venceEm, valorCentavos: n.valorCentavos, descricao: n.descricao,
        status: 'aberta', cobrancaId: null, linkUrl: null, pagoEm: null, pagoCentavos: null, taxaCentavos: null,
        metodo: null, formaBaixa: null, baixadoPor: null, lancamentoId: null,
        avisoFaturaEm: null, avisoD0Em: null, avisoD3Em: null, avisoAtrasoEm: null, reciboEm: null,
        canalUltimoAviso: null, criadoEm: agora,
      };
      faturas.push(f);
      return { ...f };
    },
    garantirLink: async (f) => {
      if (o.linkFalha) throw new Error('InfinitePay recusou o link (HTTP 422)');
      const real = faturas.find((x) => x.id === f.id)!;
      real.linkUrl ??= `https://checkout.exemplo.invalid/${f.id}`;
      return real.linkUrl;
    },
    reservarAviso: async (id, tipo) => {
      const f = faturas.find((x) => x.id === id)!;
      if (f[COL[tipo]]) return false;
      (f as any)[COL[tipo]] = agora;
      return true;
    },
    liberarAviso: async (id, tipo) => { (faturas.find((x) => x.id === id) as any)[COL[tipo]] = null; },
    registrarCanal: async (id, canal) => { faturas.find((x) => x.id === id)!.canalUltimoAviso = canal; },
    modeloAprovado: async () => o.aprovado ?? false,
    enviarModelo: async (tel, modelo, params) => { if (o.zapFalha) throw new Error('WABA 131026'); zap.push({ tel, modelo, params }); },
    enviarEmail: async (to, assunto, _html, cta) => { if (o.emailFalha) throw new Error('Resend 500'); emails.push({ to, assunto, cta }); },
    avisarJunior: async (t) => { if (o.juniorFalha) throw new Error('zap do Junior fora'); junior.push(t); },
    log: (ev) => { logs.push(ev); },
  };
  return { deps, faturas, zap, emails, junior, logs };
}

describe('rodarCobrancaRecorrente — régua', () => {
  let d: ReturnType<typeof fakeDeps>;
  beforeEach(() => { d = fakeDeps({ aprovado: true }); });

  it('D−4: nada', async () => {
    const r = await rodarCobrancaRecorrente(d.deps, '2026-10-06');
    expect(r).toMatchObject({ criadas: 0, avisos: 0 });
    expect(d.faturas).toHaveLength(0);
  });

  it('D−3: cria outubro, gera link e manda pelo MODELO no WhatsApp + e-mail', async () => {
    const r = await rodarCobrancaRecorrente(d.deps, '2026-10-07');
    expect(r).toMatchObject({ criadas: 1, avisos: 1, erros: [] });
    expect(d.faturas[0]).toMatchObject({ competencia: '2026-10-01', venceEm: '2026-10-10', valorCentavos: 29700, companyId: 'c-conquista', canalUltimoAviso: 'whatsapp+email' });
    expect(d.zap).toEqual([{ tel: '5577999610038', modelo: 'cobranca_mensalidade_v1', params: ['Jimena', 'Monitoramento de Usinas — outubro/2026', 'R$ 297,00', '10/10/2026', 'https://checkout.exemplo.invalid/f1'] }]);
    expect(d.emails[0]).toMatchObject({ to: 'jimena@exemplo.invalid', cta: 'https://checkout.exemplo.invalid/f1' });
    expect(d.junior).toEqual([]); // modelo aprovado + tudo certo = Junior não é incomodado
  });

  it('rodar 2x no mesmo dia (2 servidores) não duplica fatura nem aviso', async () => {
    await rodarCobrancaRecorrente(d.deps, '2026-10-07');
    const r2 = await rodarCobrancaRecorrente(d.deps, '2026-10-07');
    expect(r2).toMatchObject({ criadas: 0, avisos: 0 });
    expect(d.faturas).toHaveLength(1);
    expect(d.zap).toHaveLength(1);
  });

  it('régua completa sem pagar: D0 e D+3 lembram, D+7 avisa o Junior, depois silêncio', async () => {
    await rodarCobrancaRecorrente(d.deps, '2026-10-07');
    for (const dia of ['2026-10-08', '2026-10-09']) await rodarCobrancaRecorrente(d.deps, dia);
    expect(d.zap).toHaveLength(1);
    await rodarCobrancaRecorrente(d.deps, '2026-10-10');
    expect(d.zap).toHaveLength(2);
    await rodarCobrancaRecorrente(d.deps, '2026-10-11');
    await rodarCobrancaRecorrente(d.deps, '2026-10-13');
    expect(d.zap).toHaveLength(3);
    await rodarCobrancaRecorrente(d.deps, '2026-10-16');
    expect(d.junior).toHaveLength(0);
    const r = await rodarCobrancaRecorrente(d.deps, '2026-10-17');
    expect(r.atrasos).toBe(1);
    expect(d.junior[0]).toContain('atrasada há 7 dias');
    await rodarCobrancaRecorrente(d.deps, '2026-10-25');
    expect(d.zap).toHaveLength(3);
    expect(d.junior).toHaveLength(1);
    expect(d.emails).toHaveLength(3);
  });

  it('fatura paga no meio: régua para', async () => {
    await rodarCobrancaRecorrente(d.deps, '2026-10-07');
    d.faturas[0]!.status = 'paga';
    await rodarCobrancaRecorrente(d.deps, '2026-10-10');
    await rodarCobrancaRecorrente(d.deps, '2026-10-17');
    expect(d.zap).toHaveLength(1);
    expect(d.junior).toHaveLength(0);
  });

  it('logs estruturados de cada envio (sem telefone/e-mail no log)', async () => {
    await rodarCobrancaRecorrente(d.deps, '2026-10-07');
    const envio = d.logs.find((l) => l.evento === 'aviso_enviado');
    expect(envio).toMatchObject({ acao: 'fatura', fatura_id: 'f1', assinatura_id: 'a1', canais: ['whatsapp', 'email'] });
    expect(JSON.stringify(d.logs)).not.toContain('5577999610038');
    expect(JSON.stringify(d.logs)).not.toContain('jimena@exemplo.invalid');
    expect(d.logs.find((l) => l.evento === 'fatura_criada')).toMatchObject({ competencia: '2026-10-01' });
  });
});

describe('modelo ainda NÃO aprovado (plano B)', () => {
  it('manda por e-mail e avisa o Junior com o texto pronto pra encaminhar (com o link)', async () => {
    const d = fakeDeps({ aprovado: false });
    await rodarCobrancaRecorrente(d.deps, '2026-10-07');
    expect(d.zap).toHaveLength(0);
    expect(d.emails).toHaveLength(1);
    expect(d.junior).toHaveLength(1);
    expect(d.junior[0]).toContain('ainda não foi aprovado');
    expect(d.junior[0]).toContain('https://checkout.exemplo.invalid/f1');
    expect(d.faturas[0]!.canalUltimoAviso).toBe('email+junior');
  });
  it('WhatsApp falhou (modelo aprovado): e-mail + Junior', async () => {
    const d = fakeDeps({ aprovado: true, zapFalha: true });
    await rodarCobrancaRecorrente(d.deps, '2026-10-07');
    expect(d.junior[0]).toContain('WhatsApp falhou');
    expect(d.logs.some((l) => l.evento === 'erro_envio' && l.canal === 'whatsapp')).toBe(true);
  });
  it('cliente sem WhatsApp e com e-mail: só e-mail (Junior não precisa encaminhar)', async () => {
    const d = fakeDeps({ aprovado: true, assinaturas: [{ ...JIMENA, telefone: null }] });
    await rodarCobrancaRecorrente(d.deps, '2026-10-07');
    expect(d.emails).toHaveLength(1);
    expect(d.junior).toHaveLength(0);
  });
  it('nenhum canal funcionou (nem o Junior) → solta a reserva (tenta de novo amanhã) e conta erro', async () => {
    const d = fakeDeps({ aprovado: false, emailFalha: true, juniorFalha: true, assinaturas: [{ ...JIMENA, telefone: null }] });
    const r = await rodarCobrancaRecorrente(d.deps, '2026-10-07');
    expect(d.faturas[0]!.avisoFaturaEm).toBeNull();
    expect(r.erros.length).toBe(1);
  });
});

describe('falhas → Junior fica sabendo', () => {
  it('InfinitePay recusou o link: não envia, não gasta o aviso, e o resumo de erros vai pro Junior', async () => {
    const d = fakeDeps({ aprovado: true, linkFalha: true });
    const r = await rodarCobrancaRecorrente(d.deps, '2026-10-07');
    expect(r.erros).toHaveLength(1);
    expect(d.zap).toHaveLength(0);
    expect(d.faturas[0]!.avisoFaturaEm).toBeNull();
    expect(d.junior.at(-1)).toMatch(/InfinitePay recusou/);
    expect(d.junior.at(-1)).toContain('Jimena Pereira Fonseca');
  });
  it('erro de uma assinatura não derruba as outras', async () => {
    const d = fakeDeps({ aprovado: true, assinaturas: [{ ...JIMENA, id: 'quebrada', diaVencimento: 99 as any }, JIMENA] });
    const r = await rodarCobrancaRecorrente(d.deps, '2026-10-07');
    expect(r.criadas).toBe(1);
    expect(r.erros).toHaveLength(1);
  });
});

describe('ações manuais da tela', () => {
  it('"Gerar cobrança agora" em setembro, com início em outubro: cria outubro e já manda', async () => {
    const d = fakeDeps({ aprovado: false });
    const r = await gerarCobrancaAgora(d.deps, JIMENA, '2026-09-28');
    expect(r).toMatchObject({ ok: true, competencia: '2026-10-01', link: 'https://checkout.exemplo.invalid/f1', canais: ['email', 'junior'] });
    expect(d.faturas[0]!.avisoFaturaEm).not.toBeNull();
    // o robô não reenvia no D−3
    await rodarCobrancaRecorrente(d.deps, '2026-10-07');
    expect(d.emails).toHaveLength(1);
  });
  it('pausada → não gera', async () => {
    const d = fakeDeps();
    expect(await gerarCobrancaAgora(d.deps, { ...JIMENA, status: 'pausada' }, '2026-09-28')).toMatchObject({ ok: false });
  });
  it('"Reenviar link" manda de novo mesmo já avisada (é pedido do Junior) — texto do dia', async () => {
    const d = fakeDeps({ aprovado: true });
    await rodarCobrancaRecorrente(d.deps, '2026-10-07');
    const r = await reenviarFatura(d.deps, JIMENA, d.faturas[0]!, '2026-10-12');
    expect(r).toMatchObject({ ok: true, canais: ['whatsapp', 'email'] });
    expect(d.zap).toHaveLength(2);
    expect(d.emails[1]!.assunto).toMatch(/em aberto/);
  });
  it('reenviar fatura paga → recusa', async () => {
    const d = fakeDeps({ aprovado: true });
    await rodarCobrancaRecorrente(d.deps, '2026-10-07');
    d.faturas[0]!.status = 'paga';
    expect(await reenviarFatura(d.deps, JIMENA, d.faturas[0]!, '2026-10-12')).toMatchObject({ ok: false });
  });
});
