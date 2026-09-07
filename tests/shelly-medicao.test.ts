import { describe, it, expect, vi } from 'vitest';
import {
  extrairLeituraShelly,
  janelasDe15Minutos,
  demandaMaxima,
  receberLeituraShelly,
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
