// Cobrança recorrente — regras puras do ciclo mensal (28/09/2026).
// Régua do Junior: a fatura do mês nasce 3 dias antes do vencimento, lembra no
// dia do vencimento e 3 dias depois (se não pagou) e, com 7 dias de atraso,
// avisa o Junior. Tudo por JANELA (se o robô perder um dia, sai no seguinte) e
// cada aviso sai UMA vez só.
import { describe, it, expect } from 'vitest';
import {
  competenciaDe, somarMeses, vencimentoDaCompetencia, diasEntre, hojeBrasilia,
  competenciasDevidas, proximaCompetenciaManual, acaoDaFatura, situacaoDaFatura,
  situacaoDaAssinatura, rotuloCompetencia, resumoCarteira, proximoVencimento,
  competenciaDoMesInput, validarDocumento, dataBr, reais,
} from '../src/modules/cobranca-recorrente/ciclo.js';
import type { FaturaCiclo } from '../src/modules/cobranca-recorrente/ciclo.js';

const fatura = (o: Partial<FaturaCiclo> = {}): FaturaCiclo => ({
  competencia: '2026-10-01', venceEm: '2026-10-10', valorCentavos: 29700, status: 'aberta',
  avisoFaturaEm: null, avisoVesperaEm: null, avisoVenceuEm: null, avisoUltimoEm: null, pagoEm: null, ...o,
});

describe('datas do ciclo', () => {
  it('competência = 1º dia do mês; somar meses vira o ano', () => {
    expect(competenciaDe('2026-09-28')).toBe('2026-09-01');
    expect(somarMeses('2026-12-01', 1)).toBe('2027-01-01');
    expect(somarMeses('2026-01-01', -1)).toBe('2025-12-01');
  });
  it('vencimento = dia escolhido (1–28) no mês da competência', () => {
    expect(vencimentoDaCompetencia('2026-10-01', 10)).toBe('2026-10-10');
    expect(vencimentoDaCompetencia('2027-02-01', 28)).toBe('2027-02-28');
    expect(() => vencimentoDaCompetencia('2026-10-01', 29)).toThrow();
    expect(() => vencimentoDaCompetencia('2026-10-01', 0)).toThrow();
  });
  it('diasEntre conta dias corridos (b − a)', () => {
    expect(diasEntre('2026-10-07', '2026-10-10')).toBe(3);
    expect(diasEntre('2026-10-10', '2026-10-03')).toBe(-7);
  });
  it('hoje em Brasília (UTC−3): 01h UTC ainda é o dia anterior', () => {
    expect(hojeBrasilia(new Date('2026-10-01T01:00:00Z'))).toBe('2026-09-30');
    expect(hojeBrasilia(new Date('2026-10-01T12:00:00Z'))).toBe('2026-10-01');
  });
  it('input type=month → competência', () => {
    expect(competenciaDoMesInput('2026-10')).toBe('2026-10-01');
    expect(competenciaDoMesInput('2026-13')).toBeNull();
    expect(competenciaDoMesInput('lixo')).toBeNull();
  });
  it('rótulo da competência em português', () => {
    expect(rotuloCompetencia('2026-10-01')).toBe('outubro/2026');
    expect(rotuloCompetencia('2027-03-01')).toBe('março/2027');
  });
  it('formatos de tela', () => {
    expect(dataBr('2026-10-10')).toBe('10/10/2026');
    expect(reais(29700)).toBe('297,00');
    expect(reais(123456789)).toBe('1.234.567,89');
  });
});

describe('competenciasDevidas (o robô cria a fatura D−3)', () => {
  const jimena = { status: 'ativa' as const, inicioEm: '2026-10-01', diaVencimento: 10 };
  it('antes de D−3 → nada', () => {
    expect(competenciasDevidas(jimena, '2026-10-06', new Set())).toEqual([]);
  });
  it('em D−3 → cria outubro (vence 10/10)', () => {
    expect(competenciasDevidas(jimena, '2026-10-07', new Set())).toEqual([{ competencia: '2026-10-01', venceEm: '2026-10-10' }]);
  });
  it('robô parado alguns dias: ainda cria até 7 dias depois do vencimento', () => {
    expect(competenciasDevidas(jimena, '2026-10-17', new Set())).toEqual([{ competencia: '2026-10-01', venceEm: '2026-10-10' }]);
    expect(competenciasDevidas(jimena, '2026-10-18', new Set())).toEqual([]);
  });
  it('já existe a fatura do mês → não cria de novo (idempotente)', () => {
    expect(competenciasDevidas(jimena, '2026-10-08', new Set(['2026-10-01']))).toEqual([]);
  });
  it('nunca cobra antes do início (setembro foi pago à parte)', () => {
    expect(competenciasDevidas({ ...jimena, diaVencimento: 1 }, '2026-09-28', new Set())).toEqual([{ competencia: '2026-10-01', venceEm: '2026-10-01' }]);
    expect(competenciasDevidas({ ...jimena, inicioEm: '2026-11-01', diaVencimento: 1 }, '2026-09-28', new Set())).toEqual([]);
  });
  it('dia 1: D−3 cai no mês anterior (virada de mês)', () => {
    const a = { status: 'ativa' as const, inicioEm: '2026-01-01', diaVencimento: 1 };
    expect(competenciasDevidas(a, '2026-10-29', new Set(['2026-10-01']))).toEqual([{ competencia: '2026-11-01', venceEm: '2026-11-01' }]);
  });
  it('dia 28: fatura atrasada do mês anterior ainda entra na janela', () => {
    const a = { status: 'ativa' as const, inicioEm: '2026-01-01', diaVencimento: 28 };
    expect(competenciasDevidas(a, '2026-11-03', new Set())).toEqual([{ competencia: '2026-10-01', venceEm: '2026-10-28' }]);
  });
  it('pausada / cancelada / sem dia → não gera; acesso suspenso continua devendo', () => {
    expect(competenciasDevidas({ ...jimena, status: 'pausada' }, '2026-10-08', new Set())).toEqual([]);
    expect(competenciasDevidas({ ...jimena, status: 'cancelada' }, '2026-10-08', new Set())).toEqual([]);
    expect(competenciasDevidas({ ...jimena, diaVencimento: null }, '2026-10-08', new Set())).toEqual([]);
    expect(competenciasDevidas({ ...jimena, status: 'travada' }, '2026-10-08', new Set())).toHaveLength(1);
  });
});

describe('proximaCompetenciaManual (botão "Gerar cobrança agora")', () => {
  const a = { status: 'ativa' as const, inicioEm: '2026-10-01', diaVencimento: 10 };
  it('cadastro novo com início em outubro → outubro, mesmo em setembro', () => {
    expect(proximaCompetenciaManual(a, '2026-09-28', new Set())).toEqual({ competencia: '2026-10-01', venceEm: '2026-10-10' });
  });
  it('outubro já existe → novembro', () => {
    expect(proximaCompetenciaManual(a, '2026-10-12', new Set(['2026-10-01']))).toEqual({ competencia: '2026-11-01', venceEm: '2026-11-10' });
  });
  it('início no passado → começa no mês de hoje', () => {
    expect(proximaCompetenciaManual({ ...a, inicioEm: '2026-01-01' }, '2026-09-28', new Set())).toEqual({ competencia: '2026-09-01', venceEm: '2026-09-10' });
  });
  it('pausada/cancelada/sem dia → null', () => {
    expect(proximaCompetenciaManual({ ...a, status: 'pausada' }, '2026-09-28', new Set())).toBeNull();
    expect(proximaCompetenciaManual({ ...a, diaVencimento: null }, '2026-09-28', new Set())).toBeNull();
  });
});

describe('acaoDaFatura — "dois toques antes e dois depois" (D−3, D−1, D+1, D+2)', () => {
  const t = (dia: string) => `${dia}T12:00:00Z`;
  it('fatura nova ainda não avisada → envia a fatura', () => {
    expect(acaoDaFatura(fatura(), '2026-10-07')).toBe('fatura');
  });
  it('paga ou cancelada → nada', () => {
    expect(acaoDaFatura(fatura({ status: 'paga', avisoFaturaEm: t('2026-10-07') }), '2026-10-20')).toBeNull();
    expect(acaoDaFatura(fatura({ status: 'cancelada' }), '2026-10-07')).toBeNull();
  });
  it('régua completa: D−2 nada, D−1 véspera, D0 nada, D+1 venceu, D+2 último aviso, depois silêncio', () => {
    let f = fatura({ avisoFaturaEm: t('2026-10-07') });
    expect(acaoDaFatura(f, '2026-10-08')).toBeNull();
    expect(acaoDaFatura(f, '2026-10-09')).toBe('vespera');
    f = { ...f, avisoVesperaEm: t('2026-10-09') };
    expect(acaoDaFatura(f, '2026-10-10')).toBeNull();
    expect(acaoDaFatura(f, '2026-10-11')).toBe('venceu');
    f = { ...f, avisoVenceuEm: t('2026-10-11') };
    expect(acaoDaFatura(f, '2026-10-12')).toBe('ultimo_aviso');
    f = { ...f, avisoUltimoEm: t('2026-10-12') };
    expect(acaoDaFatura(f, '2026-10-13')).toBeNull();
    expect(acaoDaFatura(f, '2026-10-30')).toBeNull();
  });
  it('nunca dois toques no mesmo dia (fatura criada em cima do vencimento)', () => {
    expect(acaoDaFatura(fatura({ avisoFaturaEm: t('2026-10-10') }), '2026-10-10')).toBeNull();
    expect(acaoDaFatura(fatura({ avisoFaturaEm: t('2026-10-10') }), '2026-10-11')).toBe('venceu');
  });
  it('robô perdeu o D−1: no D0 ainda sai a véspera ("vence hoje")', () => {
    expect(acaoDaFatura(fatura({ avisoFaturaEm: t('2026-10-07') }), '2026-10-10')).toBe('vespera');
  });
  it('robô perdeu dias: pula direto pro último aviso quando chega a hora', () => {
    expect(acaoDaFatura(fatura({ avisoFaturaEm: t('2026-10-07') }), '2026-10-15')).toBe('ultimo_aviso');
  });
  it('pausa configurada em 5 dias: venceu em D+1..D+3, último aviso em D+4', () => {
    const f = fatura({ avisoFaturaEm: t('2026-10-07'), avisoVesperaEm: t('2026-10-09') });
    expect(acaoDaFatura(f, '2026-10-13', 5)).toBe('venceu');
    const g = { ...f, avisoVenceuEm: t('2026-10-11') };
    expect(acaoDaFatura(g, '2026-10-13', 5)).toBeNull();
    expect(acaoDaFatura(g, '2026-10-14', 5)).toBe('ultimo_aviso');
  });
  it('dias de pausa fora da faixa são limitados (2 a 30)', () => {
    const f = fatura({ avisoFaturaEm: t('2026-10-07'), avisoVesperaEm: t('2026-10-09') });
    expect(acaoDaFatura(f, '2026-10-11', 0)).toBe('ultimo_aviso'); // vira 2 → último aviso em D+1
  });
});

describe('situação em pílula', () => {
  it('fatura aberta: vence em X dias / vence hoje / atrasada N dias', () => {
    expect(situacaoDaFatura(fatura(), '2026-10-05')).toMatchObject({ chave: 'vence_em', dias: 5, texto: 'vence em 5 dias', tom: 'normal' });
    expect(situacaoDaFatura(fatura(), '2026-10-08')).toMatchObject({ texto: 'vence em 2 dias', tom: 'atencao' });
    expect(situacaoDaFatura(fatura(), '2026-10-09')).toMatchObject({ texto: 'vence amanhã', tom: 'atencao' });
    expect(situacaoDaFatura(fatura(), '2026-10-10')).toMatchObject({ chave: 'vence_hoje', texto: 'vence hoje', tom: 'atencao' });
    expect(situacaoDaFatura(fatura(), '2026-10-11')).toMatchObject({ chave: 'atrasada', dias: 1, texto: 'atrasada 1 dia', tom: 'critico' });
    expect(situacaoDaFatura(fatura(), '2026-10-20')).toMatchObject({ texto: 'atrasada 10 dias' });
  });
  it('paga / cancelada', () => {
    expect(situacaoDaFatura(fatura({ status: 'paga' }), '2026-10-20')).toMatchObject({ chave: 'paga', texto: 'paga', tom: 'normal' });
    expect(situacaoDaFatura(fatura({ status: 'cancelada' }), '2026-10-20')).toMatchObject({ chave: 'cancelada', tom: 'sem_dado' });
  });
  it('assinatura: pior fatura aberta manda; sem aberta = em dia', () => {
    const a = { status: 'ativa' as const, inicioEm: '2026-10-01', diaVencimento: 10 };
    expect(situacaoDaAssinatura(a, [], '2026-10-01')).toMatchObject({ texto: 'em dia', tom: 'normal' });
    expect(situacaoDaAssinatura(a, [fatura(), fatura({ competencia: '2026-11-01', venceEm: '2026-11-10' })], '2026-10-12'))
      .toMatchObject({ texto: 'atrasada 2 dias', tom: 'critico' });
    expect(situacaoDaAssinatura({ ...a, status: 'pausada' }, [], '2026-10-01')).toMatchObject({ texto: 'pausada', tom: 'sem_dado' });
    expect(situacaoDaAssinatura({ ...a, status: 'cancelada' }, [], '2026-10-01')).toMatchObject({ texto: 'cancelada' });
    expect(situacaoDaAssinatura({ ...a, status: 'travada' }, [], '2026-10-01')).toMatchObject({ texto: 'acesso suspenso', tom: 'critico' });
  });
});

describe('proximoVencimento (o que mostrar na lista)', () => {
  const a = { status: 'ativa' as const, inicioEm: '2026-10-01', diaVencimento: 10 };
  it('fatura aberta mais antiga manda', () => {
    expect(proximoVencimento(a, [fatura({ competencia: '2026-11-01', venceEm: '2026-11-10' }), fatura()], '2026-10-12')).toBe('2026-10-10');
  });
  it('sem aberta: próximo mês depois da última fatura (ou o início)', () => {
    expect(proximoVencimento(a, [], '2026-09-28')).toBe('2026-10-10');
    expect(proximoVencimento(a, [fatura({ status: 'paga' })], '2026-10-12')).toBe('2026-11-10');
  });
  it('sem dia de vencimento → null', () => {
    expect(proximoVencimento({ ...a, diaVencimento: null }, [], '2026-09-28')).toBeNull();
  });
});

describe('resumoCarteira (faixa de números da tela)', () => {
  it('recorrente do mês = soma das ativas (e com acesso suspenso); recebido/aberto/atrasadas', () => {
    const r = resumoCarteira(
      [
        { status: 'ativa', valorCentavos: 29700 },
        { status: 'travada', valorCentavos: 10000 },
        { status: 'pausada', valorCentavos: 50000 },
        { status: 'cancelada', valorCentavos: 50000 },
      ],
      [
        fatura({ status: 'paga', pagoEm: '2026-10-09T15:00:00Z', valorCentavos: 29700 }),
        fatura({ status: 'aberta', venceEm: '2026-10-10', valorCentavos: 10000 }),
        fatura({ status: 'aberta', venceEm: '2026-10-30', valorCentavos: 5000 }),
        fatura({ status: 'paga', pagoEm: '2026-09-09T15:00:00Z', valorCentavos: 99999 }),
      ],
      '2026-10-20',
    );
    expect(r).toEqual({ recorrenteCentavos: 39700, ativas: 2, recebidoMesCentavos: 29700, emAbertoCentavos: 15000, atrasadas: 1 });
  });
});

describe('validarDocumento (CPF 11 / CNPJ 14 dígitos)', () => {
  it('aceita com ou sem pontuação e devolve só dígitos', () => {
    expect(validarDocumento('04.520.636/0001-15')).toBe('04520636000115');
    expect(validarDocumento('123.456.789-09')).toBe('12345678909');
    expect(validarDocumento('')).toBeNull();
  });
  it('tamanho errado → erro', () => {
    expect(() => validarDocumento('1234')).toThrow(/CPF|CNPJ/);
  });
});
