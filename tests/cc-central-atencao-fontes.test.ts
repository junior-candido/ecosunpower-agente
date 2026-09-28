// Adaptadores PUROS da Central de Atenção: cada fonte que já existe no sistema
// vira aviso com severidade, link pra onde o dono age e — só quando dá pra
// calcular de verdade — o impacto em R$.
import { describe, it, expect } from 'vitest';
import {
  eventosDeUsinas, eventosDeLeadsEsperando, eventosDeSlaVencido, eventosDePropostas,
  eventosDeCreditosGd, eventosDeManutencao, eventosDeContas, HORAS_PROPOSTA_PARADA,
  type PropostaParaAtencao,
} from '../src/modules/dashboard/central-atencao-fontes.js';
import type { UsinaResumo } from '../src/modules/dashboard/command-center-calc.js';

const AGORA = Date.parse('2026-09-27T14:42:00Z');
/** toLocaleString de moeda usa espaço inquebrável depois do R$. */
const sp = (s?: string) => s?.replace(/ /g, ' ');

const usina = (p: Partial<UsinaResumo>): UsinaResumo => ({
  id: 's1', apelido: 'Chácara VP', cidade: 'Vicente Pires', uf: 'DF', potenciaKwp: 10, estado: 'normal',
  alertaTexto: null, hojeKwh: 10, real7Kwh: 290, esperadoDiaKwh: 41.6, ultimaSincronizacao: '2026-09-27T14:30:00Z', ...p,
});

describe('usinas', () => {
  const tarifa = () => 1.05;
  it('crítico e atenção viram 1 aviso por usina; normal e manual não geram nada', () => {
    const r = eventosDeUsinas([
      usina({ id: 'a', estado: 'critico', real7Kwh: 0, alertaTexto: 'Parada há 7 dias' }),
      usina({ id: 'b', estado: 'atencao', real7Kwh: 150, alertaTexto: 'Geração 48% ABAIXO do esperado' }),
      usina({ id: 'c', estado: 'normal' }),
      usina({ id: 'd', estado: 'sem_monitoramento' }),
    ], { tarifaRsKwh: tarifa });
    expect(r.map((e) => [e.id, e.severidade])).toEqual([['usina:a', 'critico'], ['usina:b', 'atencao']]);
    expect(r[0]).toMatchObject({ area: 'usinas', acao: { href: '/dashboard/monitoramento/a' }, detalhe: 'Parada há 7 dias' });
    expect(r[0].titulo).toBe('Chácara VP está sem gerar');
    expect(r[1].titulo).toBe('Chácara VP gerando abaixo do esperado');
  });

  it('perda em R$/dia estimada = (esperado/dia − média real 7 dias) × tarifa, e o texto diz "estimada"', () => {
    const [e] = eventosDeUsinas([usina({ estado: 'atencao', real7Kwh: 7 * 21.6 })], { tarifaRsKwh: () => 1 });
    expect(e.impactoRs).toBe(20);
    expect(sp(e.impactoTexto)).toBe('Perda estimada R$ 20/dia');
  });

  it('sem kWp ou sem tarifa → sem número de perda', () => {
    const [semKwp] = eventosDeUsinas([usina({ estado: 'critico', esperadoDiaKwh: null, potenciaKwp: null })], { tarifaRsKwh: tarifa });
    expect(semKwp.impactoRs).toBeNull();
    expect(semKwp.impactoTexto).toBeUndefined();
    const [semTarifa] = eventosDeUsinas([usina({ estado: 'critico' })], { tarifaRsKwh: () => null });
    expect(semTarifa.impactoRs).toBeNull();
  });

  it('perda que dá zero (régua da carteira acusou, média de sol não) fica sem número — nunca "R$ 0/dia"', () => {
    const [e] = eventosDeUsinas([usina({ estado: 'atencao', real7Kwh: 7 * 45 })], { tarifaRsKwh: tarifa });
    expect(e.impactoRs).toBeNull();
    expect(e.impactoTexto).toBeUndefined();
  });

  it('sem comunicação: UM aviso agrupado, com os nomes e o link da frota', () => {
    const r = eventosDeUsinas([
      usina({ id: 'g', apelido: 'Gama', estado: 'sem_comunicacao', ultimaSincronizacao: '2026-09-26T10:00:00Z' }),
      usina({ id: 's', apelido: 'Sobradinho', estado: 'sem_comunicacao', ultimaSincronizacao: '2026-09-25T10:00:00Z' }),
    ], { tarifaRsKwh: tarifa });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      id: 'usinas:sem-comunicacao', severidade: 'atencao', titulo: '2 usinas sem comunicação',
      detalhe: 'Gama e Sobradinho', impactoRs: null, desde: '2026-09-25T10:00:00Z',
      acao: { href: '/dashboard/monitoramento' },
    });
  });

  it('sem comunicação de uma usina só → link direto dela; muitas → "e mais N"', () => {
    const uma = eventosDeUsinas([usina({ id: 'g', apelido: 'Gama', estado: 'sem_comunicacao', alertaTexto: 'Erro de integração: x' })], { tarifaRsKwh: tarifa });
    expect(uma[0]).toMatchObject({ titulo: 'Gama sem comunicação', acao: { href: '/dashboard/monitoramento/g' }, detalhe: 'Erro de integração: x' });
    const muitas = eventosDeUsinas(['A', 'B', 'C', 'D', 'E'].map((n) => usina({ id: n, apelido: n, estado: 'sem_comunicacao' })), { tarifaRsKwh: tarifa });
    expect(muitas[0].detalhe).toBe('A, B, C e mais 2');
  });

  it('id da usina vai escapado no link (encodeURIComponent)', () => {
    const [e] = eventosDeUsinas([usina({ id: 'a/b?c', estado: 'critico' })], { tarifaRsKwh: tarifa });
    expect(e.acao.href).toBe('/dashboard/monitoramento/a%2Fb%3Fc');
  });
});

describe('leads esperando resposta (critério do Cockpit) e SLA vencido', () => {
  it('lead esperando > 24 h vira UM aviso de atenção no Comercial', () => {
    const [e] = eventosDeLeadsEsperando({ total: 5, maisAntigo: '2026-09-20T12:00:00Z' }, AGORA);
    expect(e).toMatchObject({ severidade: 'atencao', area: 'comercial', titulo: '5 leads esperando resposta há mais de 24 h', acao: { href: '/dashboard/leads' } });
    expect(e.detalhe).toBe('O mais antigo está parado há 7 dias');
  });
  it('um lead só: singular; zero ou sem dado → nada', () => {
    expect(eventosDeLeadsEsperando({ total: 1, maisAntigo: null }, AGORA)[0].titulo).toBe('1 lead esperando resposta há mais de 24 h');
    expect(eventosDeLeadsEsperando({ total: 0, maisAntigo: null }, AGORA)).toEqual([]);
    expect(eventosDeLeadsEsperando(null, AGORA)).toEqual([]);
  });
  it('tarefa de SLA vencida → crítico, leva ao funil', () => {
    const [e] = eventosDeSlaVencido({ total: 3, maisAntigo: '2026-09-26T12:00:00Z' }, AGORA);
    expect(e).toMatchObject({ severidade: 'critico', area: 'comercial', titulo: '3 tarefas de lead com prazo vencido', acao: { href: '/dashboard/leads/kanban' } });
    expect(eventosDeSlaVencido({ total: 0, maisAntigo: null }, AGORA)).toEqual([]);
  });
});

describe('propostas paradas há 72 h', () => {
  const p = (id: string, criada: string, extra: Partial<PropostaParaAtencao> = {}): PropostaParaAtencao => ({
    id, created_at: criada, sent_to_client_at: null, ultimo_acesso_at: null, cliente_respondeu_at: null,
    revoked: false, expires_at: '2026-12-01T00:00:00Z', valorTotal: 20000, leadEncerrado: false, ...extra,
  });
  it('agrupa em UM aviso as sem interação há 72 h+, com o valor em jogo', () => {
    const r = eventosDePropostas([
      p('a', '2026-09-20T12:00:00Z'),
      p('b', '2026-09-22T12:00:00Z', { valorTotal: null }),
      p('c', '2026-09-27T12:00:00Z'),                                                  // recente
      p('d', '2026-09-10T12:00:00Z', { cliente_respondeu_at: '2026-09-11T12:00:00Z' }), // respondeu
      p('e', '2026-09-10T12:00:00Z', { revoked: true }),                                // revogada
      p('f', '2026-09-10T12:00:00Z', { ultimo_acesso_at: '2026-09-26T12:00:00Z' }),     // abriu ontem
      p('g', '2026-07-10T12:00:00Z', { expires_at: '2026-09-08T12:00:00Z' }),           // link vencido
      p('h', '2026-09-10T12:00:00Z', { leadEncerrado: true }),                          // já fechou/perdeu
      p('i', '2026-09-12T12:00:00Z', { sent_to_client_at: '2026-09-25T12:00:00Z' }),    // enviada há 2 dias
    ], AGORA);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      id: 'propostas:paradas-72h', severidade: 'atencao', area: 'comercial',
      titulo: `2 propostas paradas há mais de ${HORAS_PROPOSTA_PARADA} h`,
      desde: '2026-09-20T12:00:00.000Z', acao: { href: '/dashboard/propostas' },
    });
    expect(sp(r[0].impactoTexto)).toBe('R$ 20.000 em jogo');
    // valor em jogo NÃO entra na ordenação como se fosse perda por dia
    expect(r[0].impactoRs ?? null).toBeNull();
  });
  it('nenhuma parada → nenhum aviso; sem valor nenhum → sem texto de R$', () => {
    expect(eventosDePropostas([p('c', '2026-09-27T12:00:00Z')], AGORA)).toEqual([]);
    expect(eventosDePropostas([p('a', '2026-09-20T12:00:00Z', { valorTotal: null })], AGORA)[0].impactoTexto).toBeUndefined();
  });
});

describe('créditos GD a vencer (regra única tipoAvisoVencimento)', () => {
  const hoje = '2026-09-27';
  it('um cliente → aviso "acompanhar" com o link da UC', () => {
    const r = eventosDeCreditosGd([
      { instalacao: '937758', clienteNome: 'Socorro', proximoExpirarKwh: 410, cicloExpirar: '2026-11-01' },
      { instalacao: '1', clienteNome: 'Longe', proximoExpirarKwh: 99, cicloExpirar: '2028-01-01' },   // > 6 meses
      { instalacao: '2', clienteNome: 'Sem', proximoExpirarKwh: null, cicloExpirar: '2026-11-01' },
    ], hoje);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ severidade: 'acompanhar', area: 'clientes', acao: { href: '/dashboard/demonstrativos/937758' } });
    expect(r[0].titulo).toBe('Socorro: 410 kWh de crédito vencem em nov/2026');
  });
  it('vários clientes → UM aviso com o total e o vencimento mais próximo', () => {
    const [e] = eventosDeCreditosGd([
      { instalacao: '1', clienteNome: 'A', proximoExpirarKwh: 1000, cicloExpirar: '2027-01-01' },
      { instalacao: '2', clienteNome: 'B', proximoExpirarKwh: 2140.5, cicloExpirar: '2026-11-01' },
    ], hoje);
    expect(e.titulo).toBe('Créditos GD de 2 clientes vencem nos próximos 6 meses');
    expect(e.detalhe).toBe('3.140,5 kWh no total · o primeiro vence em nov/2026');
    expect(e.acao.href).toBe('/dashboard/demonstrativos');
  });
});

describe('manutenção vencida (statusAgendaItem)', () => {
  it('agrupa as vencidas num aviso de atenção de O&M, pelo dia de Brasília', () => {
    const r = eventosDeManutencao([{ data_agendada: '2026-09-01' }, { data_agendada: '2026-09-26' }, { data_agendada: '2026-09-27' }, { data_agendada: '2026-12-01' }], '2026-09-27');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ severidade: 'atencao', area: 'om', titulo: '2 manutenções vencidas', detalhe: 'A mais antiga era para 01/09/2026', acao: { href: '/dashboard/manutencao' } });
    expect(eventosDeManutencao([{ data_agendada: '2026-09-28' }], '2026-09-27')).toEqual([]);
  });
});

describe('contas a pagar (alertasDoDia)', () => {
  const conta = (id: string, vencimento: string, valor = 100) => ({ id, descricao: `Conta ${id}`, valor, vencimento, mundo: 'PJ' as const, lembretes: [{ tipo: 'atraso', em: '2026-09-27' }], categoria_slug: null });
  it('atrasada → crítico; hoje → atenção; em 3 dias → acompanhar; lembrete já enviado no zap NÃO esconde da tela', () => {
    const r = eventosDeContas([conta('x', '2026-09-25', 2418), conta('y', '2026-09-27', 3000), conta('z', '2026-09-30', 150), conta('w', '2026-10-20')], '2026-09-27');
    expect(r.map((e) => e.severidade)).toEqual(['critico', 'atencao', 'acompanhar']);
    expect(r[0]).toMatchObject({ id: 'conta:x', impactoRs: 2418, titulo: 'Conta x atrasada há 2 dias', acao: { href: '/dashboard/financeiro' } });
    expect(sp(r[0].impactoTexto)).toBe('R$ 2.418,00');
    expect(r[1].titulo).toBe('Conta y vence hoje');
    expect(r[2].titulo).toBe('Conta z vence em 3 dias');
  });
  it('conta sem descrição não vira título quebrado', () => {
    expect(eventosDeContas([{ ...conta('x', '2026-09-27'), descricao: '  ' }], '2026-09-27')[0].titulo).toBe('Conta sem descrição vence hoje');
  });
  it('atrasada há 1 dia: singular', () => {
    expect(eventosDeContas([conta('x', '2026-09-26')], '2026-09-27')[0].titulo).toBe('Conta x atrasada há 1 dia');
  });
});
