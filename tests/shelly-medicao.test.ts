import { describe, it, expect, vi } from 'vitest';
import {
  extrairLeituraShelly,
  janelasDe15Minutos,
  demandaMaxima,
  receberLeituraShelly,
  _zerarAvisoLegadoParaTeste,
  lerDevicesLegados,
  statusHttpDoRecebimento,
  criarLimitePorIp,
  ipDaRequisicao,
} from '../src/modules/medicao/shelly-medicao.js';

// Formato que o script mJS do aparelho envia. Nós escrevemos os DOIS lados —
// script e servidor — então este formato é contrato nosso, não de terceiro.
const LEITURA = {
  device_id: '007007422d90',
  apelido: 'Medidor Quadro',
  canal: 2,
  medido_em: '2026-09-07T23:15:00Z',
  tensao: 223.8,
  corrente: 3.89,
  potencia_w: 717.1,
  potencia_va: 871.5,
  fator_potencia: 0.83,
  energia_wh: 82.79,
  energia_devolvida_wh: 0,
};

describe('extrairLeituraShelly', () => {
  it('aceita a leitura completa', () => {
    const r = extrairLeituraShelly(LEITURA);
    expect(r).not.toBeNull();
    expect(r!.deviceId).toBe('007007422d90');
    expect(r!.canal).toBe(2);
    expect(r!.potenciaW).toBe(717.1);
    expect(r!.medidoEm).toBe('2026-09-07T23:15:00.000Z');
  });

  it('recusa leitura sem identificacao do aparelho', () => {
    expect(extrairLeituraShelly({ ...LEITURA, device_id: '' })).toBeNull();
    expect(extrairLeituraShelly({ ...LEITURA, device_id: undefined })).toBeNull();
  });

  it('recusa leitura sem potencia — e o dado que importa', () => {
    expect(extrairLeituraShelly({ ...LEITURA, potencia_w: undefined })).toBeNull();
    expect(extrairLeituraShelly({ ...LEITURA, potencia_w: 'abc' })).toBeNull();
  });

  it('aceita potencia NEGATIVA — e assim que a injecao solar aparece', () => {
    const r = extrairLeituraShelly({ ...LEITURA, potencia_w: -2400 });
    expect(r!.potenciaW).toBe(-2400);
  });

  it('sem data, carimba a hora de agora', () => {
    const r = extrairLeituraShelly({ ...LEITURA, medido_em: undefined });
    expect(r!.medidoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('recusa data absurda (relogio do aparelho fora do ar)', () => {
    expect(extrairLeituraShelly({ ...LEITURA, medido_em: '1970-01-01T00:00:00Z' })).toBeNull();
    expect(extrairLeituraShelly({ ...LEITURA, medido_em: 'nao-e-data' })).toBeNull();
  });

  // O script roda em mJS dentro do aparelho, que nao tem toISOString(). Entao
  // ele manda epoch em segundos — e o aparelho carimba a PROPRIA leitura, o que
  // importa quando ele fica sem rede e reenvia o acumulado depois.
  it('aceita epoch em segundos', () => {
    const r = extrairLeituraShelly({ ...LEITURA, medido_em: 1788000000 });
    expect(r!.medidoEm).toBe(new Date(1788000000 * 1000).toISOString());
  });

  it('aceita epoch em milissegundos', () => {
    const r = extrairLeituraShelly({ ...LEITURA, medido_em: 1788000000000 });
    expect(r!.medidoEm).toBe(new Date(1788000000000).toISOString());
  });

  it('epoch zerado (relogio do aparelho sem hora) e recusado', () => {
    expect(extrairLeituraShelly({ ...LEITURA, medido_em: 0 })).toBeNull();
  });

  it('recusa leitura mais de 5 min no FUTURO (relógio do aparelho adiantado)', () => {
    const agora = new Date('2026-09-07T23:15:00Z');
    expect(extrairLeituraShelly({ ...LEITURA, medido_em: '2026-09-07T23:19:59Z' }, agora)).not.toBeNull();
    expect(extrairLeituraShelly({ ...LEITURA, medido_em: '2026-09-07T23:20:01Z' }, agora)).toBeNull();
    expect(extrairLeituraShelly({ ...LEITURA, medido_em: Math.floor(Date.parse('2026-09-08T10:00:00Z') / 1000) }, agora)).toBeNull();
  });

  it('sem data, carimba o agora recebido', () => {
    const agora = new Date('2026-09-07T23:15:00Z');
    expect(extrairLeituraShelly({ ...LEITURA, medido_em: undefined }, agora)!.medidoEm).toBe('2026-09-07T23:15:00.000Z');
  });

  it('canal ausente vira 0', () => {
    expect(extrairLeituraShelly({ ...LEITURA, canal: undefined })!.canal).toBe(0);
  });

  it('corta apelido gigante em vez de recusar a leitura', () => {
    const r = extrairLeituraShelly({ ...LEITURA, apelido: 'x'.repeat(500) });
    expect(r!.apelido!.length).toBeLessThanOrEqual(80);
  });

  it('campos opcionais ausentes viram null, nao quebram', () => {
    const r = extrairLeituraShelly({
      device_id: 'abc', potencia_w: 100, medido_em: LEITURA.medido_em,
    });
    expect(r!.tensao).toBeNull();
    expect(r!.fatorPotencia).toBeNull();
    expect(r!.potenciaW).toBe(100);
  });
});

// A JANELA DE 15 MINUTOS — é isto que a concessionária mede e é isto que
// justifica a mensalidade. O medidor dela alisa o pico; o nosso mostra.
describe('janelasDe15Minutos', () => {
  const em = (min: number, w: number) => ({
    medidoEm: new Date(Date.UTC(2026, 8, 7, 10, min, 0)).toISOString(),
    potenciaW: w,
  });

  it('agrupa por janela cheia e devolve a MEDIA de cada uma', () => {
    const j = janelasDe15Minutos([em(0, 1000), em(5, 2000), em(10, 3000), em(20, 500)]);
    expect(j).toHaveLength(2);
    expect(j[0].inicio).toBe('2026-09-07T10:00:00.000Z');
    expect(j[0].mediaW).toBe(2000);   // (1000+2000+3000)/3
    expect(j[0].amostras).toBe(3);
    expect(j[1].inicio).toBe('2026-09-07T10:15:00.000Z');
    expect(j[1].mediaW).toBe(500);
  });

  it('as janelas comecam sempre em :00, :15, :30 e :45', () => {
    const j = janelasDe15Minutos([em(7, 100), em(16, 200), em(31, 300), em(46, 400)]);
    expect(j.map((x) => x.inicio.slice(11, 16))).toEqual(['10:00', '10:15', '10:30', '10:45']);
  });

  it('guarda o pico instantaneo de cada janela, alem da media', () => {
    const j = janelasDe15Minutos([em(0, 500), em(1, 9000), em(2, 500)]);
    expect(j[0].picoW).toBe(9000);
    expect(j[0].mediaW).toBeCloseTo(3333.33, 1);
  });

  it('ordena as janelas no tempo mesmo com leitura fora de ordem', () => {
    const j = janelasDe15Minutos([em(20, 1), em(0, 2)]);
    expect(j[0].inicio < j[1].inicio).toBe(true);
  });

  it('lista vazia devolve lista vazia', () => {
    expect(janelasDe15Minutos([])).toEqual([]);
  });
});

describe('demandaMaxima', () => {
  const em = (min: number, w: number) => ({
    medidoEm: new Date(Date.UTC(2026, 8, 7, 10, min, 0)).toISOString(),
    potenciaW: w,
  });

  // O ponto de venda inteiro: a media de 15 min (o que a concessionaria
  // cobra) e MUITO menor que o pico instantaneo. Mostrar os dois lado a lado
  // e o que o cliente nunca viu.
  it('devolve a maior media de 15 min e o pico instantaneo do periodo', () => {
    const d = demandaMaxima([em(0, 1000), em(5, 1000), em(20, 8000), em(25, 200)]);
    expect(d).not.toBeNull();
    expect(d!.demandaW).toBe(4100);      // janela das 10:15 -> (8000+200)/2
    expect(d!.picoInstantaneoW).toBe(8000);
    expect(d!.janelaInicio).toBe('2026-09-07T10:15:00.000Z');
  });

  it('sem leitura, devolve null em vez de zero', () => {
    expect(demandaMaxima([])).toBeNull();
  });

  // Injecao solar: a demanda que importa e a de CONSUMO. Potencia negativa
  // (energia indo pra rede) nao pode virar "demanda" com sinal trocado.
  it('nao confunde injecao com demanda', () => {
    const d = demandaMaxima([em(0, -3000), em(5, -3000), em(20, 900), em(25, 900)]);
    expect(d!.demandaW).toBe(900);
    expect(d!.janelaInicio).toBe('2026-09-07T10:15:00.000Z');
  });
});

function fazDeps(over: Record<string, unknown> = {}) {
  return {
    salvar: vi.fn().mockResolvedValue(true),
    tokenEsperado: 'segredo-do-junior',
    ...over,
  };
}

describe('receberLeituraShelly', () => {
  it('salva quando o token confere', async () => {
    const deps = fazDeps();
    const r = await receberLeituraShelly(deps as never, LEITURA, 'segredo-do-junior');
    expect(r.aceito).toBe(true);
    expect(deps.salvar).toHaveBeenCalledTimes(1);
    expect(deps.salvar.mock.calls[0][0]).toMatchObject({ deviceId: '007007422d90', potenciaW: 717.1 });
  });

  // 🔒 O endereco e PUBLICO. Sem token, qualquer um envenena a base de medicao
  // do cliente — e medicao envenenada vira laudo errado.
  it('leitura do lote com hora no futuro é recusada, as outras entram', async () => {
    const deps = fazDeps({ agora: () => new Date('2026-09-07T23:16:00Z') });
    const r = await receberLeituraShelly(deps as never, [LEITURA, { ...LEITURA, medido_em: '2026-09-08T05:00:00Z' }], 'segredo-do-junior');
    expect(r).toMatchObject({ aceito: true, salvas: 1, recusadas: 1 });
  });

  it('recusa sem token e nao salva nada', async () => {
    const deps = fazDeps();
    const r = await receberLeituraShelly(deps as never, LEITURA, '');
    expect(r.aceito).toBe(false);
    expect(r.motivo).toBe('token');
    expect(deps.salvar).not.toHaveBeenCalled();
  });

  it('recusa token errado', async () => {
    const deps = fazDeps();
    const r = await receberLeituraShelly(deps as never, LEITURA, 'chute');
    expect(r.aceito).toBe(false);
    expect(r.motivo).toBe('token');
    expect(deps.salvar).not.toHaveBeenCalled();
  });

  // Sem token configurado no servidor, o endereco fica ABERTO. Melhor recusar
  // tudo e gritar no log do que aceitar qualquer um em silencio.
  it('recusa tudo quando o servidor esta sem token configurado', async () => {
    const deps = fazDeps({ tokenEsperado: '' });
    const r = await receberLeituraShelly(deps as never, LEITURA, 'qualquer');
    expect(r.aceito).toBe(false);
    expect(r.motivo).toBe('sem_token_no_servidor');
  });

  it('recusa payload invalido mesmo com token certo', async () => {
    const deps = fazDeps();
    const r = await receberLeituraShelly(deps as never, { device_id: '' }, 'segredo-do-junior');
    expect(r.aceito).toBe(false);
    expect(r.motivo).toBe('leitura_invalida');
  });

  // O aparelho manda de minuto em minuto. Se um erro derrubasse a rota, ele
  // reenviaria em loop e a gente perderia o historico inteiro.
  it('nunca lanca quando o banco falha', async () => {
    const deps = fazDeps({ salvar: vi.fn().mockRejectedValue(new Error('banco fora')) });
    const r = await receberLeituraShelly(deps as never, LEITURA, 'segredo-do-junior');
    expect(r.aceito).toBe(false);
    expect(r.motivo).toBe('erro');
  });

  it('aceita um lote de leituras (aparelho que ficou sem rede e acumulou)', async () => {
    const deps = fazDeps();
    const lote = [LEITURA, { ...LEITURA, medido_em: '2026-09-07T23:16:00Z', potencia_w: 800 }];
    const r = await receberLeituraShelly(deps as never, lote, 'segredo-do-junior');
    expect(r.aceito).toBe(true);
    expect(r.salvas).toBe(2);
    expect(deps.salvar).toHaveBeenCalledTimes(2);
  });

  it('no lote, uma leitura ruim nao derruba as boas', async () => {
    const deps = fazDeps();
    const lote = [LEITURA, { device_id: '' }, { ...LEITURA, medido_em: '2026-09-07T23:17:00Z' }];
    const r = await receberLeituraShelly(deps as never, lote, 'segredo-do-junior');
    expect(r.aceito).toBe(true);
    expect(r.salvas).toBe(2);
    expect(r.recusadas).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Gestão de Energia G1 — token POR MEDIDOR (multi-tenant). Cada token resolve
// um medidor e a empresa DELE. O token global antigo só vale pro piloto.
// ---------------------------------------------------------------------------
describe('receberLeituraShelly — token por medidor', () => {
  const MEDIDOR = { medidorId: 'm1', companyId: 'empresa-B', leadId: 'l1', deviceId: '007007422d90' };
  // Formato real do token do medidor: 32 bytes em base64url = 43 caracteres.
  const TOK_B = 'B'.repeat(40) + '-_9';

  it('token do medidor grava com a empresa DO MEDIDOR', async () => {
    const salvar = vi.fn(async () => true);
    const aoReceber = vi.fn(async () => {});
    const r = await receberLeituraShelly(
      { salvar, tokenEsperado: '', resolverToken: async (t) => (t === TOK_B ? MEDIDOR : null), aoReceber },
      LEITURA, TOK_B,
    );
    expect(r.aceito).toBe(true);
    expect(salvar).toHaveBeenCalledWith(expect.objectContaining({ companyId: 'empresa-B', medidorId: 'm1', leadId: 'l1' }));
    expect(aoReceber).toHaveBeenCalledWith('m1', 'empresa-B', '2026-09-07T23:15:00.000Z');
  });

  it('aceita o id com prefixo do modelo (shellypro3em-...)', async () => {
    const salvar = vi.fn(async () => true);
    const r = await receberLeituraShelly({ salvar, tokenEsperado: '', resolverToken: async () => MEDIDOR },
      { ...LEITURA, device_id: 'shellypro3em-007007422D90' }, TOK_B);
    expect(r.aceito).toBe(true);
  });

  it('token de um medidor não grava leitura de OUTRO aparelho', async () => {
    const salvar = vi.fn(async () => true);
    const r = await receberLeituraShelly({ salvar, tokenEsperado: '', resolverToken: async () => MEDIDOR }, { ...LEITURA, device_id: 'outro' }, TOK_B);
    expect(r).toMatchObject({ aceito: false, motivo: 'leitura_invalida' });
    expect(salvar).not.toHaveBeenCalled();
  });

  it('o token do medidor tem prioridade: nunca cai no carimbo padrão da EcoSun', async () => {
    const salvar = vi.fn(async () => true);
    await receberLeituraShelly({ salvar, tokenEsperado: TOK_B, resolverToken: async () => MEDIDOR }, LEITURA, TOK_B);
    expect(salvar).toHaveBeenCalledWith(expect.objectContaining({ companyId: 'empresa-B' }));
  });

  it('token desconhecido e diferente do legado → 401', async () => {
    const salvar = vi.fn(async () => true);
    const r = await receberLeituraShelly({ salvar, tokenEsperado: 'legado', resolverToken: async () => null }, LEITURA, 'chute');
    expect(r).toMatchObject({ aceito: false, motivo: 'token' });
    expect(salvar).not.toHaveBeenCalled();
  });

  it('só resolver (sem token global) também funciona e recusa token vazio', async () => {
    const salvar = vi.fn(async () => true);
    const r = await receberLeituraShelly({ salvar, tokenEsperado: '', resolverToken: async () => MEDIDOR }, LEITURA, '');
    expect(r).toMatchObject({ aceito: false, motivo: 'token' });
  });

  it('token fora do formato nem consulta o banco (e o legado segue valendo)', async () => {
    const salvar = vi.fn(async () => true);
    const resolverToken = vi.fn(async () => MEDIDOR);
    const r = await receberLeituraShelly({ salvar, tokenEsperado: 'segredo-do-junior', resolverToken }, LEITURA, 'segredo-do-junior');
    expect(resolverToken).not.toHaveBeenCalled();
    expect(r.aceito).toBe(true);
    const r2 = await receberLeituraShelly({ salvar, tokenEsperado: '', resolverToken }, LEITURA, 'x'.repeat(44));
    expect(resolverToken).not.toHaveBeenCalled();
    expect(r2).toMatchObject({ aceito: false, motivo: 'token' });
  });

  it('banco fora do ar ao resolver o token → indisponível (503, o aparelho tenta de novo), nunca 401', async () => {
    const salvar = vi.fn(async () => true);
    const r = await receberLeituraShelly({
      salvar, tokenEsperado: 'segredo-do-junior', resolverToken: async () => { throw new Error('fetch failed'); },
    }, LEITURA, TOK_B);
    expect(r).toMatchObject({ aceito: false, motivo: 'indisponivel' });
    expect(statusHttpDoRecebimento(r.motivo)).toBe(503);
    expect(salvar).not.toHaveBeenCalled();
  });

  it('token do medidor pela URL (?token=) não vale — só pelo cabeçalho', async () => {
    const salvar = vi.fn(async () => true);
    const resolverToken = vi.fn(async () => MEDIDOR);
    const r = await receberLeituraShelly({ salvar, tokenEsperado: 'segredo-do-junior', resolverToken }, LEITURA, TOK_B, 'query');
    expect(resolverToken).not.toHaveBeenCalled();
    expect(r).toMatchObject({ aceito: false, motivo: 'token' });
  });

  it('o token global do piloto ainda vale pela URL (transição)', async () => {
    const salvar = vi.fn(async () => true);
    const r = await receberLeituraShelly({ salvar, tokenEsperado: 'segredo-do-junior' }, LEITURA, 'segredo-do-junior', 'query');
    expect(r.aceito).toBe(true);
  });

  it('medidor DESLIGADO na plataforma: recusa com 410 e não grava', async () => {
    const salvar = vi.fn(async () => true);
    const r = await receberLeituraShelly({ salvar, tokenEsperado: 'segredo-do-junior', resolverToken: async () => ({ ...MEDIDOR, ativo: false }) }, LEITURA, TOK_B);
    expect(r).toMatchObject({ aceito: false, motivo: 'desativado' });
    expect(statusHttpDoRecebimento(r.motivo)).toBe(410);
    expect(salvar).not.toHaveBeenCalled();
  });

  it('grava o device_id normalizado (sem prefixo, minúsculo)', async () => {
    const salvar = vi.fn(async () => true);
    await receberLeituraShelly({ salvar, tokenEsperado: '', resolverToken: async () => MEDIDOR }, { ...LEITURA, device_id: 'shellypro3em-007007422D90' }, TOK_B);
    expect(salvar).toHaveBeenCalledWith(expect.objectContaining({ deviceId: '007007422d90' }));
  });
});

describe('receberLeituraShelly — token global legado (só o piloto)', () => {
  it('continua valendo pro piloto, com aviso de token legado e vínculo do medidor quando existe', async () => {
    _zerarAvisoLegadoParaTeste();
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const salvar = vi.fn(async () => true);
    const resolverLegado = vi.fn(async () => ({ medidorId: 'piloto', companyId: '00000000-0000-0000-0000-000000000001', leadId: null, deviceId: '007007422d90' }));
    const r = await receberLeituraShelly({ salvar, tokenEsperado: 'segredo-do-junior', resolverLegado }, { ...LEITURA, device_id: 'shellypro3em-007007422d90' }, 'segredo-do-junior');
    expect(r.aceito).toBe(true);
    expect(salvar).toHaveBeenCalledWith(expect.objectContaining({ medidorId: 'piloto', companyId: '00000000-0000-0000-0000-000000000001' }));
    expect(aviso.mock.calls.some((c) => String(c[0]).includes('[energia] token legado'))).toBe(true);
    expect(aviso.mock.calls.every((c) => !String(c.join(' ')).includes('segredo-do-junior'))).toBe(true);
    aviso.mockRestore();
  });

  it('sem medidor cadastrado (migration não aplicada): grava como hoje, sem vínculo', async () => {
    const salvar = vi.fn(async () => true);
    const r = await receberLeituraShelly({ salvar, tokenEsperado: 'segredo-do-junior', resolverLegado: async () => { throw new Error('x'); } }, LEITURA, 'segredo-do-junior');
    expect(r.aceito).toBe(true);
    expect((salvar.mock.calls[0] as unknown[])[0]).not.toHaveProperty('medidorId');
  });

  it('piloto desligado na plataforma: o token global também é recusado', async () => {
    const salvar = vi.fn(async () => true);
    const r = await receberLeituraShelly({
      salvar, tokenEsperado: 'segredo-do-junior',
      resolverLegado: async () => ({ medidorId: 'piloto', companyId: '00000000-0000-0000-0000-000000000001', leadId: null, deviceId: '007007422d90', ativo: false }),
    }, LEITURA, 'segredo-do-junior');
    expect(r).toMatchObject({ aceito: false, motivo: 'desativado' });
    expect(salvar).not.toHaveBeenCalled();
  });

  it('SHELLY_LEGADO_DEVICES libera outro aparelho sem deploy', async () => {
    const salvar = vi.fn(async () => true);
    const devicesLegados = lerDevicesLegados(' shellypro3em-AABBCCDDEEFF , 007007422d90');
    expect(devicesLegados).toEqual(['aabbccddeeff', '007007422d90']);
    const r = await receberLeituraShelly({ salvar, tokenEsperado: 'segredo-do-junior', devicesLegados }, { ...LEITURA, device_id: 'shellypro3em-aabbccddeeff' }, 'segredo-do-junior');
    expect(r.aceito).toBe(true);
    expect(salvar).toHaveBeenCalledWith(expect.objectContaining({ deviceId: 'aabbccddeeff' }));
  });

  it('SHELLY_LEGADO_DEVICES vazia ou lixo → só o piloto', () => {
    expect(lerDevicesLegados(undefined)).toEqual(['007007422d90']);
    expect(lerDevicesLegados(' , <x>')).toEqual(['007007422d90']);
  });

  it('token global NÃO grava aparelho que não é o piloto', async () => {
    const salvar = vi.fn(async () => true);
    const r = await receberLeituraShelly({ salvar, tokenEsperado: 'segredo-do-junior' }, { ...LEITURA, device_id: 'shellypro3em-aabbccddeeff' }, 'segredo-do-junior');
    expect(r).toMatchObject({ aceito: false, motivo: 'leitura_invalida' });
    expect(salvar).not.toHaveBeenCalled();
  });
});

describe('webhook: limite por IP e código HTTP', () => {
  it('120 por minuto por IP; o minuto seguinte libera; outro IP não é afetado', () => {
    const l = criarLimitePorIp({ max: 120, janelaMs: 60_000 });
    const t0 = 1_000_000;
    for (let i = 0; i < 120; i++) expect(l.estourou('1.1.1.1', t0 + i)).toBe(false);
    expect(l.estourou('1.1.1.1', t0 + 200)).toBe(true);
    expect(l.estourou('2.2.2.2', t0 + 200)).toBe(false);
    expect(l.estourou('1.1.1.1', t0 + 60_001)).toBe(false);
  });

  it('o mapa de IPs é limitado (não cresce sem fim)', () => {
    const l = criarLimitePorIp({ max: 1, janelaMs: 60_000, maxChaves: 50 });
    for (let i = 0; i < 500; i++) l.estourou(`10.0.0.${i}`, 1000);
    expect(l.tamanho).toBeLessThanOrEqual(50);
  });

  it('IP real = o último do X-Forwarded-For (o primeiro o cliente forja)', () => {
    expect(ipDaRequisicao('6.6.6.6, 200.1.2.3', '10.0.0.1')).toBe('200.1.2.3');
    expect(ipDaRequisicao(undefined, '10.0.0.1')).toBe('10.0.0.1');
  });

  it('códigos: token 401, desligado 410, banco fora 503, dado ruim 400', () => {
    expect(statusHttpDoRecebimento('token')).toBe(401);
    expect(statusHttpDoRecebimento('sem_token_no_servidor')).toBe(401);
    expect(statusHttpDoRecebimento('desativado')).toBe(410);
    expect(statusHttpDoRecebimento('indisponivel')).toBe(503);
    expect(statusHttpDoRecebimento('leitura_invalida')).toBe(400);
    expect(statusHttpDoRecebimento('erro')).toBe(400);
  });
});
