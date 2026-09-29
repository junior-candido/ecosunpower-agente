// Cobrança recorrente — o robô diário e as ações manuais, com dublês (sem
// rede, sem banco). Régua do Junior ("dois toques antes e dois depois"):
//  D−3 fatura · D−1 "vence amanhã" · D+1 "venceu" · D+2 último aviso (+ Junior)
//  · D+3 PAUSA a assistente do TENANT (nunca a casa). Pagou → volta sozinha.
//  WhatsApp só com MODELO aprovado; sem modelo → e-mail + texto pro Junior
//  encaminhar. Nunca o mesmo aviso 2x; InfinitePay recusou / falhou → Junior sabe.
import { describe, it, expect } from 'vitest';
import { rodarCobrancaRecorrente, gerarCobrancaAgora, reenviarFatura, pausarAssistenteDe, reativarAssistenteDe } from '../src/modules/cobranca-recorrente/motor.js';
import type { MotorDeps, AssinaturaMotor } from '../src/modules/cobranca-recorrente/motor.js';
import type { FaturaRow, TipoAviso } from '../src/modules/cobranca-recorrente/faturas-repo.js';

const CASA = '00000000-0000-0000-0000-000000000001';
const COL: Record<TipoAviso, keyof FaturaRow> = {
  fatura: 'avisoFaturaEm', vespera: 'avisoVesperaEm', venceu: 'avisoVenceuEm', ultimo_aviso: 'avisoUltimoEm', aviso_disparos: 'avisoDisparosEm', recibo: 'reciboEm', valor_alerta: 'valorAlertaEm',
};

const JIMENA: AssinaturaMotor = {
  id: 'a1', nome: 'Jimena Pereira Fonseca', email: 'jimena@exemplo.invalid', telefone: '5577999610038',
  valorCentavos: 29700, status: 'ativa', diaVencimento: 10, inicioEm: '2026-10-01', companyId: 'c-conquista',
  descricao: 'Monitoramento de Usinas', leadId: null,
  pausaAutomatica: true, diasPausa: 3, pausaAdiadaAte: null, assistentePausadaEm: null, empresaNome: 'Conquista Solar',
  diasTravaDisparos: 7, disparosPausadosEm: null,
};

function fakeDeps(o: { assinaturas?: AssinaturaMotor[]; aprovado?: boolean; linkFalha?: boolean; zapFalha?: boolean; emailFalha?: boolean; juniorFalha?: boolean } = {}) {
  const faturas: FaturaRow[] = [];
  const assinaturas = (o.assinaturas ?? [JIMENA]).map((a) => ({ ...a }));
  const zap: Array<{ tel: string; modelo: string; params: string[] }> = [];
  const emails: Array<{ to: string; assunto: string; cta: string | null }> = [];
  const junior: string[] = [];
  const logs: Array<Record<string, unknown>> = [];
  const auditoria: Array<{ assinaturaId: string; acao: string }> = [];
  const reagendados: Array<{ id: string; desde: string }> = [];
  let seq = 0;
  let relogio = '2026-10-07T12:00:00Z';
  const deps: MotorDeps = {
    donaId: CASA,
    casaId: CASA,
    urlAssinatura: (id) => `https://painel.exemplo.invalid/dashboard/assinaturas/${id}`,
    pausarAssistente: async (a) => {
      const x = assinaturas.find((y) => y.id === a.id)!;
      if (x.assistentePausadaEm || x.companyId === CASA || !x.companyId) return false;
      x.assistentePausadaEm = relogio;
      return true;
    },
    reativarAssistente: async (a) => {
      const x = assinaturas.find((y) => y.id === a.id)!;
      if (!x.assistentePausadaEm && !x.disparosPausadosEm) return false;
      x.assistentePausadaEm = null;
      x.disparosPausadosEm = null;
      return true;
    },
    pausarDisparos: async (a) => {
      const x = assinaturas.find((y) => y.id === a.id)!;
      if (x.disparosPausadosEm || !x.assistentePausadaEm || x.companyId === CASA || !x.companyId) return false;
      x.disparosPausadosEm = relogio;
      return true;
    },
    reagendarDisparos: async (a, desde) => { reagendados.push({ id: a.id, desde }); return 3; },
    auditar: async (e) => { auditoria.push(e); },
    listarCobraveis: async () => assinaturas.map((a) => ({ ...a })),
    faturasDaAssinatura: async (id) => faturas.filter((f) => f.assinaturaId === id).map((f) => ({ ...f })),
    criarFatura: async (n) => {
      if (faturas.some((f) => f.assinaturaId === n.assinaturaId && f.competencia === n.competencia)) return null;
      const f: FaturaRow = {
        id: `f${++seq}`, assinaturaId: n.assinaturaId, companyId: n.companyId, donaCompanyId: n.donaId,
        competencia: n.competencia, venceEm: n.venceEm, valorCentavos: n.valorCentavos, descricao: n.descricao,
        status: 'aberta', cobrancaId: null, linkUrl: null, pagoEm: null, pagoCentavos: null, taxaCentavos: null,
        metodo: null, formaBaixa: null, baixadoPor: null, lancamentoId: null,
        avisoFaturaEm: null, avisoVesperaEm: null, avisoVenceuEm: null, avisoUltimoEm: null, avisoDisparosEm: null, reciboEm: null,
        canalUltimoAviso: null, criadoEm: relogio,
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
      (f as any)[COL[tipo]] = relogio;
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
  const rodar = (dia: string) => { relogio = `${dia}T12:00:00Z`; return rodarCobrancaRecorrente(deps, dia); };
  return { deps, faturas, assinaturas, zap, emails, junior, logs, auditoria, reagendados, rodar, setRelogio: (d: string) => { relogio = `${d}T12:00:00Z`; } };
}

describe('régua "dois toques antes e dois depois"', () => {
  it('D−4 nada; D−3 cria outubro, gera link e manda pelo MODELO + e-mail (Junior não é incomodado)', async () => {
    const d = fakeDeps({ aprovado: true });
    expect(await d.rodar('2026-10-06')).toMatchObject({ criadas: 0, avisos: 0 });
    expect(await d.rodar('2026-10-07')).toMatchObject({ criadas: 1, avisos: 1, erros: [] });
    expect(d.faturas[0]).toMatchObject({ competencia: '2026-10-01', venceEm: '2026-10-10', companyId: 'c-conquista', canalUltimoAviso: 'whatsapp+email' });
    expect(d.zap[0]).toEqual({ tel: '5577999610038', modelo: 'cobranca_mensalidade_v1', params: ['Jimena', 'Monitoramento de Usinas — outubro/2026', 'R$ 297,00', '10/10/2026', 'https://checkout.exemplo.invalid/f1'] });
    expect(d.emails[0]).toMatchObject({ to: 'jimena@exemplo.invalid', cta: 'https://checkout.exemplo.invalid/f1' });
    expect(d.junior).toEqual([]);
  });

  it('rodar 2x no mesmo dia (2 servidores) não duplica fatura nem aviso', async () => {
    const d = fakeDeps({ aprovado: true });
    await d.rodar('2026-10-07');
    expect(await d.rodar('2026-10-07')).toMatchObject({ criadas: 0, avisos: 0 });
    expect(d.zap).toHaveLength(1);
  });

  it('sem pagar: D−1, D+1, D+2 (último aviso de pausa + Junior), D+3 PAUSA — cada coisa uma vez', async () => {
    const d = fakeDeps({ aprovado: true });
    await d.rodar('2026-10-07');
    await d.rodar('2026-10-08');
    expect(d.zap).toHaveLength(1);
    await d.rodar('2026-10-09');
    expect(d.emails.at(-1)!.assunto).toMatch(/^Vence amanhã/);
    await d.rodar('2026-10-10');
    expect(d.zap).toHaveLength(2); // D0 sem mensagem extra
    await d.rodar('2026-10-11');
    expect(d.emails.at(-1)!.assunto).toMatch(/em aberto/);
    const r12 = await d.rodar('2026-10-12');
    expect(r12.atrasos).toBe(1);
    expect(d.zap.at(-1)).toMatchObject({ modelo: 'aviso_pausa_assistente_v1', params: ['Jimena', 'Monitoramento de Usinas — outubro/2026', 'R$ 297,00', '12/10/2026', 'https://checkout.exemplo.invalid/f1'] });
    expect(d.junior.some((t) => t.includes('PAUSA em 13/10/2026') && t.includes('https://painel.exemplo.invalid/dashboard/assinaturas/a1'))).toBe(true);
    expect(d.assinaturas[0]!.assistentePausadaEm).toBeNull();
    const r13 = await d.rodar('2026-10-13');
    expect(r13.pausas).toBe(1);
    expect(d.assinaturas[0]!.assistentePausadaEm).not.toBeNull();
    expect(d.zap.at(-1)!.modelo).toBe('assistente_pausada_v1');
    expect(d.junior.some((t) => /Assistente de Conquista Solar PAUSADA por fatura em aberto/.test(t))).toBe(true);
    expect(d.auditoria).toContainEqual({ assinaturaId: 'a1', acao: 'assistente_pausada_auto', detalhe: '2026-10' });
    // dias seguintes: nada se repete até a véspera da 2ª trava
    const antes = { zap: d.zap.length, junior: d.junior.length };
    expect(await d.rodar('2026-10-14')).toMatchObject({ avisos: 0, pausas: 0 });
    await d.rodar('2026-10-15');
    expect({ zap: d.zap.length, junior: d.junior.length }).toEqual(antes);
  });

  it('pagou (fatura baixada) → no dia seguinte o robô REATIVA (rede de segurança) e avisa', async () => {
    const d = fakeDeps({ aprovado: true });
    for (const dia of ['2026-10-07', '2026-10-09', '2026-10-11', '2026-10-12', '2026-10-13']) await d.rodar(dia);
    expect(d.assinaturas[0]!.assistentePausadaEm).not.toBeNull();
    d.faturas[0]!.status = 'paga';
    const r = await d.rodar('2026-10-14');
    expect(r.reativacoes).toBe(1);
    expect(d.assinaturas[0]!.assistentePausadaEm).toBeNull();
    expect(d.junior.at(-1)).toContain('voltou a atender');
  });

  it('a CASA nunca pausa (nem com fatura vencida); último aviso dela é lembrete comum', async () => {
    const d = fakeDeps({ aprovado: true, assinaturas: [{ ...JIMENA, companyId: CASA }] });
    for (const dia of ['2026-10-07', '2026-10-09', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-20']) await d.rodar(dia);
    expect(d.assinaturas[0]!.assistentePausadaEm).toBeNull();
    expect(d.zap.map((z) => z.modelo)).not.toContain('aviso_pausa_assistente_v1');
    expect(d.zap.map((z) => z.modelo)).not.toContain('assistente_pausada_v1');
  });

  it('cliente avulso (sem painel) nunca pausa; "nunca pausar" também não', async () => {
    for (const a of [{ ...JIMENA, companyId: null }, { ...JIMENA, pausaAutomatica: false }]) {
      const d = fakeDeps({ aprovado: true, assinaturas: [a] });
      for (const dia of ['2026-10-07', '2026-10-09', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-25']) await d.rodar(dia);
      expect(d.assinaturas[0]!.assistentePausadaEm).toBeNull();
      expect(d.zap.at(-1)!.modelo).toBe('cobranca_mensalidade_v1');
      expect(d.junior.some((t) => /Mensalidade atrasada 2 dias/.test(t))).toBe(true);
    }
  });

  it('pausa só da empresa CERTA (duas assinaturas, só uma atrasada)', async () => {
    const outra = { ...JIMENA, id: 'a2', companyId: 'c-outra', nome: 'Outra Solar', diaVencimento: 25 };
    const d = fakeDeps({ aprovado: true, assinaturas: [JIMENA, outra] });
    for (const dia of ['2026-10-07', '2026-10-09', '2026-10-11', '2026-10-12', '2026-10-13']) await d.rodar(dia);
    expect(d.assinaturas.find((a) => a.id === 'a1')!.assistentePausadaEm).not.toBeNull();
    expect(d.assinaturas.find((a) => a.id === 'a2')!.assistentePausadaEm).toBeNull();
  });

  it('"dar mais prazo": com prazo até 16/10 a pausa só acontece em 17/10', async () => {
    const d = fakeDeps({ aprovado: true, assinaturas: [{ ...JIMENA, pausaAdiadaAte: '2026-10-16' }] });
    for (const dia of ['2026-10-07', '2026-10-09', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-16']) await d.rodar(dia);
    expect(d.assinaturas[0]!.assistentePausadaEm).toBeNull();
    expect((await d.rodar('2026-10-17')).pausas).toBe(1);
  });

  it('dias da pausa configurados (5): último aviso em D+4, pausa em D+5', async () => {
    const d = fakeDeps({ aprovado: true, assinaturas: [{ ...JIMENA, diasPausa: 5 }] });
    for (const dia of ['2026-10-07', '2026-10-09', '2026-10-11', '2026-10-12', '2026-10-13']) await d.rodar(dia);
    expect(d.zap.map((z) => z.modelo)).not.toContain('aviso_pausa_assistente_v1');
    await d.rodar('2026-10-14');
    expect(d.zap.at(-1)!.modelo).toBe('aviso_pausa_assistente_v1');
    expect(d.assinaturas[0]!.assistentePausadaEm).toBeNull();
    expect((await d.rodar('2026-10-15')).pausas).toBe(1);
  });

  it('logs estruturados (sem telefone/e-mail no log)', async () => {
    const d = fakeDeps({ aprovado: true });
    await d.rodar('2026-10-07');
    expect(d.logs.find((l) => l.evento === 'aviso_enviado')).toMatchObject({ acao: 'fatura', fatura_id: 'f1', assinatura_id: 'a1', canais: ['whatsapp', 'email'] });
    expect(JSON.stringify(d.logs)).not.toContain('5577999610038');
    expect(JSON.stringify(d.logs)).not.toContain('jimena@exemplo.invalid');
  });
});

describe('modelo ainda NÃO aprovado (plano B)', () => {
  it('e-mail + texto pronto pro Junior encaminhar (com o link)', async () => {
    const d = fakeDeps({ aprovado: false });
    await d.rodar('2026-10-07');
    expect(d.zap).toHaveLength(0);
    expect(d.emails).toHaveLength(1);
    expect(d.junior[0]).toContain('ainda não foi aprovado');
    expect(d.junior[0]).toContain('https://checkout.exemplo.invalid/f1');
    expect(d.faturas[0]!.canalUltimoAviso).toBe('email+junior');
  });
  it('WhatsApp falhou (modelo aprovado): e-mail + Junior', async () => {
    const d = fakeDeps({ aprovado: true, zapFalha: true });
    await d.rodar('2026-10-07');
    expect(d.junior[0]).toContain('WhatsApp falhou');
    expect(d.logs.some((l) => l.evento === 'erro_envio' && l.canal === 'whatsapp')).toBe(true);
  });
  it('sem WhatsApp e com e-mail: só e-mail', async () => {
    const d = fakeDeps({ aprovado: true, assinaturas: [{ ...JIMENA, telefone: null }] });
    await d.rodar('2026-10-07');
    expect(d.emails).toHaveLength(1);
    expect(d.junior).toHaveLength(0);
  });
  it('nenhum canal funcionou → solta a reserva (tenta amanhã) e conta erro', async () => {
    const d = fakeDeps({ aprovado: false, emailFalha: true, juniorFalha: true, assinaturas: [{ ...JIMENA, telefone: null }] });
    const r = await d.rodar('2026-10-07');
    expect(d.faturas[0]!.avisoFaturaEm).toBeNull();
    expect(r.erros).toHaveLength(1);
  });
});

describe('falhas → Junior fica sabendo', () => {
  it('InfinitePay recusou: não envia, não gasta o aviso, resumo de erros vai pro Junior', async () => {
    const d = fakeDeps({ aprovado: true, linkFalha: true });
    const r = await d.rodar('2026-10-07');
    expect(r.erros).toHaveLength(1);
    expect(d.faturas[0]!.avisoFaturaEm).toBeNull();
    expect(d.junior.at(-1)).toMatch(/InfinitePay recusou/);
  });
  it('erro de uma assinatura não derruba as outras', async () => {
    const d = fakeDeps({ aprovado: true, assinaturas: [{ ...JIMENA, id: 'quebrada', diaVencimento: 99 as any }, JIMENA] });
    const r = await d.rodar('2026-10-07');
    expect(r.criadas).toBe(1);
    expect(r.erros).toHaveLength(1);
  });
});

describe('ações manuais', () => {
  it('"Gerar cobrança agora" em setembro (início em outubro): cria outubro e já manda; o robô não repete', async () => {
    const d = fakeDeps({ aprovado: false });
    d.setRelogio('2026-09-28');
    const r = await gerarCobrancaAgora(d.deps, JIMENA, '2026-09-28');
    expect(r).toMatchObject({ ok: true, competencia: '2026-10-01', link: 'https://checkout.exemplo.invalid/f1', canais: ['email', 'junior'] });
    await d.rodar('2026-10-07');
    expect(d.emails).toHaveLength(1);
  });
  it('pausada → não gera', async () => {
    const d = fakeDeps();
    expect(await gerarCobrancaAgora(d.deps, { ...JIMENA, status: 'pausada' }, '2026-09-28')).toMatchObject({ ok: false });
  });
  it('gerar agora sem nenhum canal → solta a reserva (o robô tenta)', async () => {
    const d = fakeDeps({ aprovado: false, emailFalha: true, juniorFalha: true, assinaturas: [{ ...JIMENA, telefone: null }] });
    const r = await gerarCobrancaAgora(d.deps, { ...JIMENA, telefone: null }, '2026-09-28');
    expect(r).toMatchObject({ ok: true, canais: [] });
    expect(d.faturas[0]!.avisoFaturaEm).toBeNull();
  });
  it('"Reenviar link" manda de novo com o texto do dia', async () => {
    const d = fakeDeps({ aprovado: true });
    await d.rodar('2026-10-07');
    const r = await reenviarFatura(d.deps, JIMENA, d.faturas[0]!, '2026-10-12');
    expect(r).toMatchObject({ ok: true, canais: ['whatsapp', 'email'] });
    expect(d.emails.at(-1)!.assunto).toMatch(/em aberto/);
  });
  it('reenviar fatura paga → recusa', async () => {
    const d = fakeDeps({ aprovado: true });
    await d.rodar('2026-10-07');
    d.faturas[0]!.status = 'paga';
    expect(await reenviarFatura(d.deps, JIMENA, d.faturas[0]!, '2026-10-12')).toMatchObject({ ok: false });
  });
  it('"Pausar agora" / "Reativar agora": só tenant, idempotente, auditado', async () => {
    const d = fakeDeps({ aprovado: true });
    await d.rodar('2026-10-07');
    expect(await pausarAssistenteDe(d.deps, JIMENA, d.faturas, '2026-10-08', 'manual')).toBe(true);
    expect(await pausarAssistenteDe(d.deps, { ...JIMENA, assistentePausadaEm: 'x' }, d.faturas, '2026-10-08', 'manual')).toBe(false);
    expect(d.junior.some((t) => /PAUSADA \(por você\)/.test(t))).toBe(true);
    expect(await pausarAssistenteDe(d.deps, { ...JIMENA, id: 'casa', companyId: CASA }, [], '2026-10-08', 'manual')).toBe(false);
    expect(await reativarAssistenteDe(d.deps, JIMENA, 'manual')).toBe(true);
    expect(await reativarAssistenteDe(d.deps, JIMENA, 'manual')).toBe(false);
    expect(d.auditoria.map((x) => x.acao)).toEqual(['assistente_pausada_manual', 'assistente_reativada_manual']);
  });
});

describe('2ª trava (padrão D+7): D+6 aviso, D+7 param os disparos', () => {
  const ateD5 = ['2026-10-07', '2026-10-09', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-15'];
  it('D+6: aviso (cliente + Junior); D+7: disparos pausados (cliente + Junior); depois silêncio', async () => {
    const d = fakeDeps({ aprovado: true });
    for (const dia of ateD5) await d.rodar(dia);
    expect(d.assinaturas[0]!.assistentePausadaEm).not.toBeNull();
    expect(d.assinaturas[0]!.disparosPausadosEm).toBeNull();
    await d.rodar('2026-10-16');
    expect(d.zap.at(-1)).toMatchObject({ modelo: 'aviso_pausa_disparos_v1', params: ['Jimena', 'Monitoramento de Usinas — outubro/2026', 'R$ 297,00', '16/10/2026', 'https://checkout.exemplo.invalid/f1'] });
    expect(d.junior.some((t) => t.includes('Amanhã (17/10/2026) param também os DISPAROS AUTOMÁTICOS'))).toBe(true);
    expect(d.assinaturas[0]!.disparosPausadosEm).toBeNull();
    const r = await d.rodar('2026-10-17');
    expect(r.pausas).toBe(1);
    expect(d.assinaturas[0]!.disparosPausadosEm).not.toBeNull();
    expect(d.zap.at(-1)!.modelo).toBe('disparos_pausados_v1');
    expect(d.junior.some((t) => /Disparos automáticos de Conquista Solar PAUSADOS por fatura em aberto \(2ª trava\)/.test(t))).toBe(true);
    expect(d.auditoria.map((x) => x.acao)).toContain('disparos_pausados_auto');
    const antes = d.zap.length;
    await d.rodar('2026-10-18'); await d.rodar('2026-10-30');
    expect(d.zap.length).toBe(antes);
  });
  it('robô parado vários dias: aviso num dia, trava só no seguinte (nunca aviso e trava juntos)', async () => {
    const d = fakeDeps({ aprovado: true });
    for (const dia of ateD5) await d.rodar(dia);
    await d.rodar('2026-10-25'); // pulou D+6 e D+7
    expect(d.zap.at(-1)!.modelo).toBe('aviso_pausa_disparos_v1');
    expect(d.assinaturas[0]!.disparosPausadosEm).toBeNull();
    await d.rodar('2026-10-26');
    expect(d.assinaturas[0]!.disparosPausadosEm).not.toBeNull();
  });
  it('pagou → as DUAS voltam e os disparos parados são reagendados de onde pararam', async () => {
    const d = fakeDeps({ aprovado: true });
    for (const dia of [...ateD5, '2026-10-16', '2026-10-17']) await d.rodar(dia);
    const desde = d.assinaturas[0]!.disparosPausadosEm!;
    d.faturas[0]!.status = 'paga';
    const r = await d.rodar('2026-10-20');
    expect(r.reativacoes).toBe(1);
    expect(d.assinaturas[0]).toMatchObject({ assistentePausadaEm: null, disparosPausadosEm: null });
    expect(d.reagendados).toEqual([{ id: 'a1', desde }]);
  });
  it('só a 1ª ligada ao pagar → não reagenda nada (os disparos nunca pararam)', async () => {
    const d = fakeDeps({ aprovado: true });
    for (const dia of ateD5) await d.rodar(dia);
    d.faturas[0]!.status = 'paga';
    await d.rodar('2026-10-16');
    expect(d.reagendados).toEqual([]);
  });
  it('casa, avulso e "nunca pausar": nem 1ª nem 2ª trava, nem aviso de disparos', async () => {
    for (const a of [{ ...JIMENA, companyId: CASA }, { ...JIMENA, companyId: null }, { ...JIMENA, pausaAutomatica: false }]) {
      const d = fakeDeps({ aprovado: true, assinaturas: [a] });
      for (const dia of [...ateD5, '2026-10-16', '2026-10-17', '2026-10-25']) await d.rodar(dia);
      expect(d.assinaturas[0]).toMatchObject({ assistentePausadaEm: null, disparosPausadosEm: null });
      expect(d.zap.map((z) => z.modelo)).not.toContain('aviso_pausa_disparos_v1');
    }
  });
});

describe('destinatários — só o contato de cobrança (proprietária) e o Junior', () => {
  it('toda a régua (faturas, lembretes, 1ª e 2ª trava) vai SÓ pro WhatsApp/e-mail de cobrança; aviso interno só pro Junior', async () => {
    const d = fakeDeps({ aprovado: true });
    for (const dia of ['2026-10-07', '2026-10-09', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-15', '2026-10-16', '2026-10-17']) await d.rodar(dia);
    expect(d.zap.length).toBeGreaterThanOrEqual(7);
    expect(new Set(d.zap.map((z) => z.tel))).toEqual(new Set(['5577999610038']));
    expect(new Set(d.emails.map((e) => e.to))).toEqual(new Set(['jimena@exemplo.invalid']));
    // o motor não tem outro canal de saída: WhatsApp = modelo da casa (WABA), e-mail = casa, Junior = avisarJunior
    expect(Object.keys(d.deps).filter((k) => /enviar|avisar|send/i.test(k)).sort()).toEqual(['avisarJunior', 'enviarEmail', 'enviarModelo']);
  });
});

describe('empresa com MAIS de uma assinatura — só a da Assistente virtual pausa a assistente', () => {
  const ASSIST = { ...JIMENA, produtoId: 'assistente_virtual', descricao: 'Assistente virtual' };
  const MONIT = { ...JIMENA, id: 'a2', produtoId: 'monitoramento', descricao: 'Monitoramento de Usinas', valorCentavos: 50000, diaVencimento: 5 };
  it('monitoramento atrasado NUNCA pausa a assistente (nem aviso de pausa); a da assistente sim', async () => {
    const d = fakeDeps({ aprovado: true, assinaturas: [MONIT] });
    for (const dia of ['2026-10-02', '2026-10-04', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-12', '2026-10-13']) await d.rodar(dia);
    expect(d.assinaturas[0]).toMatchObject({ assistentePausadaEm: null, disparosPausadosEm: null });
    expect(d.zap.map((z) => z.modelo)).not.toContain('aviso_pausa_assistente_v1');
    const e = fakeDeps({ aprovado: true, assinaturas: [ASSIST] });
    for (const dia of ['2026-10-07', '2026-10-09', '2026-10-11', '2026-10-12', '2026-10-13']) await e.rodar(dia);
    expect(e.assinaturas[0]!.assistentePausadaEm).not.toBeNull();
  });
  it('as duas na mesma empresa: assistente em dia + monitoramento atrasado → assistente segue atendendo', async () => {
    const d = fakeDeps({ aprovado: true, assinaturas: [ASSIST, MONIT] });
    await d.rodar('2026-10-02'); await d.rodar('2026-10-07');
    d.faturas.filter((f) => f.assinaturaId === 'a1').forEach((f) => { f.status = 'paga'; });
    for (const dia of ['2026-10-09', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-20']) await d.rodar(dia);
    expect(d.assinaturas.find((a) => a.id === 'a1')!.assistentePausadaEm).toBeNull();
    expect(d.assinaturas.find((a) => a.id === 'a2')!.assistentePausadaEm).toBeNull();
    expect(d.faturas.some((f) => f.assinaturaId === 'a2' && f.status === 'aberta')).toBe(true);
  });
});
