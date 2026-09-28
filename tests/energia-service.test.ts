import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EnergiaService, type EnergiaDb, type MedidorRow, type ResultadoAviso } from '../src/modules/energia/energia-service.js';
import type { LeituraBruta, Janela15 } from '../src/modules/energia/agregacao.js';
import { cifrarCred } from '../src/modules/energia/credenciais.js';
import type { MedidorAdapter } from '../src/modules/energia/types.js';

const KEY = 'c'.repeat(64);
const EMPRESA_A = '00000000-0000-0000-0000-000000000001';
const EMPRESA_B = 'bbbbbbbb-0000-0000-0000-000000000002';

function medidor(o: Partial<MedidorRow> = {}): MedidorRow {
  return {
    id: 'm1', company_id: EMPRESA_A, lead_id: null, sistema_id: 's1', apelido: 'Medidor Quadro', device_id: '007007422d90',
    modo_coleta: 'push', perfil: 'triphase', canais: { rede: 2 }, tensao_nominal_v: 220, api_credentials_cifrado: null,
    ativo: true, status: 'ok', status_desde: '2026-09-01T00:00:00Z', ultima_leitura_em: null, ultimo_erro: null,
    nuvem_ok: null, nuvem_desde: null, nuvem_avisado_em: null, aviso_dia: null, avisos_no_dia: 0, ...o,
  };
}

/** 1 leitura por minuto, 1 kW de importação constante. 00:00 BRT de 08/09 = 03:00Z. */
function brutoMinutos(inicioIso: string, minutos: number): LeituraBruta[] {
  const t0 = Date.parse(inicioIso);
  return Array.from({ length: minutos + 1 }, (_, i) => ({
    medidoEm: new Date(t0 + i * 60_000).toISOString(), potenciaW: 1000, tensao: 225, fatorPotencia: 0.9,
    energiaWh: 1000 + i * (1000 / 60), energiaDevolvidaWh: 0,
  }));
}

function repoFalso(ms: MedidorRow[], bruto: Record<string, LeituraBruta[]> = {}) {
  const janelas = new Map<string, Janela15 & { fonte: string; company: string }>();
  const dias: Array<Record<string, unknown>> = [];
  const status: Array<[string, Record<string, unknown>]> = [];
  const sinteticas: Array<[string, string]> = [];
  const db: EnergiaDb = {
    medidoresAtivos: vi.fn(async () => ms),
    brutoEntre: vi.fn(async (m, desde, ate) => (bruto[m.id] ?? []).filter((l) => l.medidoEm >= desde && l.medidoEm < ate)),
    primeiraLeitura: vi.fn(async (m) => (bruto[m.id] ?? [])[0]?.medidoEm ?? null),
    proximaLeitura: vi.fn(async (m, apos) => (bruto[m.id] ?? []).find((l) => l.medidoEm >= apos)?.medidoEm ?? null),
    ultimaJanela: vi.fn(async (m) => [...janelas.values()].filter((j) => j.inicio && janelas.has(`${m.id}|${j.inicio}`)).map((j) => j.inicio).sort().pop() ?? null),
    gravarJanelas: vi.fn(async (m, js, fonte) => { for (const j of js) janelas.set(`${m.id}|${j.inicio}`, { ...j, fonte, company: m.company_id }); }),
    janelasDoDia: vi.fn(async (m) => [...janelas.entries()].filter(([k]) => k.startsWith(`${m.id}|`)).map(([, j]) => j)),
    geracaoDoDia: vi.fn(async () => 27),
    gravarDia: vi.fn(async (m, r) => { dias.push({ medidor: m.id, company: m.company_id, ...r }); }),
    gravarLeituraSintetica: vi.fn(async (m, _l, ts) => { sinteticas.push([m.id, ts]); }),
    atualizarStatus: vi.fn(async (m, p) => { status.push([m.id, p as Record<string, unknown>]); }),
    apagarBrutoAntesDe: vi.fn(async () => 0),
    apagar15minAntesDe: vi.fn(async () => 0),
  };
  return { db, janelas, dias, status, sinteticas };
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('agregar', () => {
  it('grava só janelas FECHADAS, com a empresa do medidor, e fecha o dia tocado', async () => {
    const m = medidor();
    const r = repoFalso([m], { m1: brutoMinutos('2026-09-08T03:00:00Z', 50) });
    const s = new EnergiaService(r.db);
    const agora = new Date('2026-09-08T03:50:30Z');
    const out = await s.agregar(agora);
    const inicios = [...r.janelas.values()].map((j) => j.inicio).sort();
    expect(inicios).toEqual(['2026-09-08T03:00:00.000Z', '2026-09-08T03:15:00.000Z', '2026-09-08T03:30:00.000Z']);
    expect([...r.janelas.values()].every((j) => j.company === EMPRESA_A && j.fonte === 'push')).toBe(true);
    expect(r.janelas.get('m1|2026-09-08T03:15:00.000Z')!.importadoWh).toBeCloseTo(250, 3);
    expect(out.janelas).toBe(3);
    expect(r.dias).toHaveLength(1);
    expect(r.dias[0]).toMatchObject({ medidor: 'm1', company: EMPRESA_A, dia: '2026-09-08', geracaoKwh: 27 });
    // dia incompleto: consumo NÃO é calculado (misturaria geração do dia inteiro com rede de 45 min)
    expect(r.dias[0].consumoKwh).toBeNull();
  });

  it('reprocessa a última janela com folga de 10 min antes (não perde o 1º minuto)', async () => {
    const m = medidor();
    const r = repoFalso([m], { m1: brutoMinutos('2026-09-08T03:00:00Z', 50) });
    const s = new EnergiaService(r.db);
    await s.agregar(new Date('2026-09-08T03:31:00Z'));
    await s.agregar(new Date('2026-09-08T03:50:30Z'));
    expect(r.janelas.get('m1|2026-09-08T03:15:00.000Z')!.segundosCobertos).toBe(900);
    expect(r.janelas.get('m1|2026-09-08T03:30:00.000Z')!.segundosCobertos).toBe(900);
    const ultimaChamada = (r.db.brutoEntre as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
    expect(ultimaChamada[1]).toBe('2026-09-08T03:05:00.000Z'); // 03:15 − 10 min
  });

  it('nuvem (foto a cada 15 min, 12 min antes da fronteira): toda janela fecha com 900 s', async () => {
    // Leituras em :03 :18 :33 :48. Ao refazer a última janela (ex.: 04:15), a
    // leitura anterior (04:03) está 12 min antes do cursor: com folga de 10 min
    // ela ficava de fora e a janela perdia 3 dos 15 min (~20% da energia).
    const m = medidor({ modo_coleta: 'nuvem' });
    const t0 = Date.parse('2026-09-08T03:03:00Z');
    const todas: LeituraBruta[] = Array.from({ length: 13 }, (_, i) => ({
      medidoEm: new Date(t0 + i * 900_000).toISOString(), potenciaW: 1000, tensao: 225, fatorPotencia: 0.9,
      energiaWh: 1000 + i * 250, energiaDevolvidaWh: 0,
    }));
    const bruto: LeituraBruta[] = [];
    const r = repoFalso([m], { m1: bruto });
    const s = new EnergiaService(r.db);
    const ciclo = async (agoraIso: string) => {
      bruto.length = 0;
      bruto.push(...todas.filter((l) => l.medidoEm <= agoraIso));
      await s.agregar(new Date(agoraIso));
    };
    for (const hora of ['03:40', '03:55', '04:10', '04:25', '04:40', '04:55', '05:10', '05:25', '05:40', '05:55', '06:10']) await ciclo(`2026-09-08T${hora}:00.000Z`);
    const js = [...r.janelas.values()].sort((a, b) => a.inicio.localeCompare(b.inicio));
    // A 1ª janela (03:00) começa na 1ª leitura (03:03): 720 s. As outras, até a
    // última fechada com leitura depois dela, cheias.
    expect(js[0].segundosCobertos).toBe(720);
    const cheias = js.filter((j) => j.inicio >= '2026-09-08T03:15' && j.inicio < '2026-09-08T05:46');
    expect(cheias.length).toBe(11); // 03:15 … 05:45
    for (const j of cheias) {
      expect(j.segundosCobertos, j.inicio).toBe(900);
      expect(j.importadoWh, j.inicio).toBeCloseTo(250, 6);
    }
  });

  it('pula buraco longo sem travar o cursor', async () => {
    const m = medidor();
    const bruto = [...brutoMinutos('2026-09-01T03:00:00Z', 20), ...brutoMinutos('2026-09-05T03:00:00Z', 20)];
    const r = repoFalso([m], { m1: bruto });
    await new EnergiaService(r.db).agregar(new Date('2026-09-05T04:00:00Z'));
    const dias = new Set([...r.janelas.values()].map((j) => j.inicio.slice(0, 10)));
    expect(dias.has('2026-09-01')).toBe(true);
    expect(dias.has('2026-09-05')).toBe(true);
  });

  it('exceção num medidor não derruba os outros', async () => {
    const r = repoFalso([medidor({ id: 'ruim' }), medidor({ id: 'm1', company_id: EMPRESA_B })], { m1: brutoMinutos('2026-09-08T03:00:00Z', 20) });
    (r.db.primeiraLeitura as ReturnType<typeof vi.fn>).mockImplementation(async (m: MedidorRow) => {
      if (m.id === 'ruim') throw new Error('boom');
      return '2026-09-08T03:00:00.000Z';
    });
    const out = await new EnergiaService(r.db).agregar(new Date('2026-09-08T03:31:00Z'));
    expect(out.falhas).toBe(1);
    expect([...r.janelas.values()].every((j) => j.company === EMPRESA_B)).toBe(true);
  });

  it('migrations não aplicadas: não lança, só avisa', async () => {
    const r = repoFalso([]);
    (r.db.medidoresAtivos as ReturnType<typeof vi.fn>).mockRejectedValue(Object.assign(new Error('relation "medidores_energia" does not exist'), { code: '42P01' }));
    await expect(new EnergiaService(r.db).agregar(new Date())).resolves.toMatchObject({ medidores: 0 });
  });

  it('logs sem valores de consumo', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const r = repoFalso([medidor()], { m1: brutoMinutos('2026-09-08T03:00:00Z', 50) });
    await new EnergiaService(r.db).agregar(new Date('2026-09-08T03:50:30Z'));
    const tudo = log.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(tudo).not.toMatch(/kWh|Wh\b|250/);
  });
});

describe('fecharDiasRecentes', () => {
  it('dia completo: consumo = gerado + importado − exportado (balanço)', async () => {
    const m = medidor();
    const r = repoFalso([m], { m1: brutoMinutos('2026-09-08T03:00:00Z', 1440) });
    const s = new EnergiaService(r.db);
    await s.agregar(new Date('2026-09-09T03:30:00Z'));
    r.dias.length = 0;
    await s.fecharDiasRecentes(new Date('2026-09-09T03:30:00Z'));
    const d = r.dias.find((x) => x.dia === '2026-09-08')!;
    expect(d.coberturaPct).toBeCloseTo(100, 3);
    expect(d.importadoKwh).toBeCloseTo(24, 3);
    expect(d.consumoKwh).toBeCloseTo(27 + 24, 3);
  });

  it('medidor sem usina: geração e consumo null', async () => {
    const m = medidor({ sistema_id: null });
    const r = repoFalso([m], { m1: brutoMinutos('2026-09-08T03:00:00Z', 1440) });
    await new EnergiaService(r.db).agregar(new Date('2026-09-09T03:30:00Z'));
    const d = r.dias.find((x) => x.dia === '2026-09-08')!;
    expect(d.geracaoKwh).toBeNull();
    expect(d.consumoKwh).toBeNull();
    expect(r.db.geracaoDoDia).not.toHaveBeenCalled();
  });
});

describe('coletarNuvem', () => {
  const TRI = { 'em:0': { c_voltage: 227, c_current: 5, c_act_power: 1100, c_aprt_power: 1200, c_pf: 0.9 }, 'emdata:0': { c_total_act_energy: 5000, c_total_act_ret_energy: 10 } };

  function adapterFalso(res: Awaited<ReturnType<MedidorAdapter['buscarStatus']>>) {
    return { fabricante: 'shelly', buscarStatus: vi.fn(async () => res), lerCanal: (st: Record<string, unknown>) => (st['em:0'] ? { tensao: 227, corrente: 5, potenciaW: 1100, potenciaVa: 1200, fatorPotencia: 0.9, energiaWh: 5000, energiaDevolvidaWh: 10 } : null) } as unknown as MedidorAdapter & { buscarStatus: ReturnType<typeof vi.fn> };
  }

  it('agrupa medidores pela chave (decifra 1x) e grava leitura sintética', async () => {
    const cred = cifrarCred({ server_uri: 'https://x.shelly.cloud', auth_key: 'k1' }, KEY);
    const ms = [
      medidor({ id: 'a', device_id: 'aaa', modo_coleta: 'nuvem', api_credentials_cifrado: cred }),
      medidor({ id: 'b', device_id: 'bbb', modo_coleta: 'nuvem', api_credentials_cifrado: cred }),
      medidor({ id: 'c', device_id: 'ccc', modo_coleta: 'push' }),
    ];
    const r = repoFalso(ms);
    const ad = adapterFalso({ ok: true, devices: [{ id: 'aaa', online: true, modelo: 'SPEM', status: TRI }, { id: 'bbb', online: false, modelo: null, status: null }] });
    const out = await new EnergiaService(r.db, { adapter: () => ad }).coletarNuvem(new Date('2026-09-08T12:00:00Z'), KEY);
    expect(ad.buscarStatus).toHaveBeenCalledTimes(1);
    expect(ad.buscarStatus.mock.calls[0][1]).toEqual(['aaa', 'bbb']);
    expect(r.sinteticas.map((x) => x[0])).toEqual(['a']);
    expect(out).toMatchObject({ ok: 1, offline: 1, falhas: 0, credencial: 0 });
  });

  it('push_nuvem só usa a nuvem quando o push está calado há mais de 20 min', async () => {
    const cred = cifrarCred({ server_uri: 'https://x.shelly.cloud', auth_key: 'k1' }, KEY);
    const agora = new Date('2026-09-08T12:00:00Z');
    const ms = [
      medidor({ id: 'vivo', device_id: 'v', modo_coleta: 'push_nuvem', api_credentials_cifrado: cred, ultima_leitura_em: '2026-09-08T11:55:00Z' }),
      medidor({ id: 'calado', device_id: 'c', modo_coleta: 'push_nuvem', api_credentials_cifrado: cred, ultima_leitura_em: '2026-09-08T11:00:00Z' }),
    ];
    const ad = adapterFalso({ ok: true, devices: [] });
    await new EnergiaService(repoFalso(ms).db, { adapter: () => ad }).coletarNuvem(agora, KEY);
    expect(ad.buscarStatus.mock.calls[0][1]).toEqual(['c']);
  });

  it('chave recusada → nuvem_ok=false (status do dado intocado) e não tenta de novo', async () => {
    const cred = cifrarCred({ server_uri: 'https://x.shelly.cloud', auth_key: 'k1' }, KEY);
    const ms = [medidor({ id: 'a', device_id: 'aaa', modo_coleta: 'nuvem', api_credentials_cifrado: cred })];
    const r = repoFalso(ms);
    const ad = adapterFalso({ ok: false, reason: 'nuvem Shelly recusou a chave (401)', invalidCredentials: true });
    const s = new EnergiaService(r.db, { adapter: () => ad });
    const out = await s.coletarNuvem(new Date(), KEY);
    expect(out.credencial).toBe(1);
    expect(r.status[0]).toEqual(['a', expect.objectContaining({ nuvem_ok: false, nuvem_avisado_em: null })]);
    expect(r.status[0][1]).not.toHaveProperty('status');
    ms[0].nuvem_ok = false;
    await s.coletarNuvem(new Date(), KEY);
    expect(ad.buscarStatus).toHaveBeenCalledTimes(1);
  });

  it('chave aceita de novo (colada na edição) limpa o problema antigo', async () => {
    const cred = cifrarCred({ server_uri: 'https://x.shelly.cloud', auth_key: 'k1' }, KEY);
    const r = repoFalso([medidor({ id: 'a', device_id: 'aaa', modo_coleta: 'nuvem', api_credentials_cifrado: cred, nuvem_ok: null, ultimo_erro: 'velho' })]);
    await new EnergiaService(r.db, { adapter: () => adapterFalso({ ok: true, devices: [] }) }).coletarNuvem(new Date(), KEY);
    expect(r.status[0][1]).toMatchObject({ nuvem_ok: true, ultimo_erro: null });
  });

  it('falha passageira da nuvem (rede) não marca a chave como ruim', async () => {
    const cred = cifrarCred({ server_uri: 'https://x.shelly.cloud', auth_key: 'k1' }, KEY);
    const r = repoFalso([medidor({ id: 'a', device_id: 'aaa', modo_coleta: 'nuvem', api_credentials_cifrado: cred })]);
    await new EnergiaService(r.db, { adapter: () => adapterFalso({ ok: false, reason: 'nuvem Shelly: tempo esgotado' }) }).coletarNuvem(new Date(), KEY);
    expect(r.status[0][1]).toEqual({ ultimo_erro: 'nuvem Shelly: tempo esgotado' });
  });

  it('sem ENERGIA_CRED_KEY não faz nada', async () => {
    const ad = adapterFalso({ ok: true, devices: [] });
    const out = await new EnergiaService(repoFalso([medidor({ modo_coleta: 'nuvem', api_credentials_cifrado: 'x' })]).db, { adapter: () => ad }).coletarNuvem(new Date(), undefined);
    expect(out.desligada).toBe(true);
    expect(ad.buscarStatus).not.toHaveBeenCalled();
  });

  it('credencial que não decifra vira erro do medidor, sem vazar nada', async () => {
    const r = repoFalso([medidor({ id: 'a', modo_coleta: 'nuvem', api_credentials_cifrado: 'lixo' })]);
    const out = await new EnergiaService(r.db, { adapter: () => adapterFalso({ ok: true, devices: [] }) }).coletarNuvem(new Date(), KEY);
    expect(out.falhas).toBe(1);
    expect(r.status[0][1]).toMatchObject({ nuvem_ok: false });
    expect(r.status[0][1]).not.toHaveProperty('status');
  });
});

describe('vigiar', () => {
  const AGORA = new Date('2026-09-28T15:00:00Z'); // segunda, 12h BRT
  const enviado = () => vi.fn(async (): Promise<ResultadoAviso> => 'enviado');

  it('1 aviso por transição, grava o status novo e conta no freio do dia', async () => {
    const ms = [medidor({ id: 'a', status: 'ok', ultima_leitura_em: '2026-09-28T14:00:00Z' }), medidor({ id: 'b', status: 'ok', ultima_leitura_em: '2026-09-28T14:59:00Z' })];
    const r = repoFalso(ms);
    const avisar = enviado();
    const out = await new EnergiaService(r.db).vigiar(AGORA, avisar, () => true);
    expect(avisar).toHaveBeenCalledTimes(1);
    expect(avisar.mock.calls[0][0]).toMatchObject({ id: 'a', company_id: EMPRESA_A });
    expect(r.status).toEqual([['a', expect.objectContaining({ status: 'mudo', status_desde: AGORA.toISOString(), aviso_dia: '2026-09-28', avisos_no_dia: 1 })]]);
    expect(out.transicoes).toBe(1);
  });

  it('1º dado de medidor novo: "começou a mandar dado"', async () => {
    const r = repoFalso([medidor({ status: 'aguardando', ultima_leitura_em: '2026-09-28T14:59:00Z' })]);
    const avisar = enviado();
    await new EnergiaService(r.db).vigiar(AGORA, avisar, () => true);
    expect(String(avisar.mock.calls[0][1])).toMatch(/começou a mandar dado/);
  });

  it('fora da janela de horário: não avisa e não grava (a transição fica pro próximo ciclo)', async () => {
    const r = repoFalso([medidor({ status: 'ok', ultima_leitura_em: '2026-09-28T10:00:00Z' })]);
    const avisar = enviado();
    await new EnergiaService(r.db).vigiar(AGORA, avisar, () => false);
    expect(avisar).not.toHaveBeenCalled();
    expect(r.status).toEqual([]);
  });

  it('aviso que falha não grava (tenta de novo no próximo ciclo)', async () => {
    const r = repoFalso([medidor({ status: 'ok', ultima_leitura_em: '2026-09-28T10:00:00Z' })]);
    await new EnergiaService(r.db).vigiar(AGORA, vi.fn(async (): Promise<ResultadoAviso> => { throw new Error('zap fora'); }), () => true);
    expect(r.status).toEqual([]);
  });

  it('dry-run: não grava a transição como avisada', async () => {
    const r = repoFalso([medidor({ status: 'ok', ultima_leitura_em: '2026-09-28T10:00:00Z' })]);
    await new EnergiaService(r.db).vigiar(AGORA, vi.fn(async (): Promise<ResultadoAviso> => 'dry_run'), () => true);
    expect(r.status).toEqual([]);
  });

  it('sem destino (empresa sem admin ou sem o módulo): grava sem contar aviso', async () => {
    const r = repoFalso([medidor({ status: 'ok', ultima_leitura_em: '2026-09-28T10:00:00Z' })]);
    const out = await new EnergiaService(r.db).vigiar(AGORA, vi.fn(async (): Promise<ResultadoAviso> => 'sem_destino'), () => true);
    expect(r.status[0][1]).toMatchObject({ status: 'mudo', avisos_no_dia: 0 });
    expect(out.avisos).toBe(0);
  });

  it('mensagem saiu mas a gravação falhou: no ciclo seguinte NÃO repete o zap, só grava', async () => {
    const m = medidor({ status: 'ok', ultima_leitura_em: '2026-09-28T10:00:00Z' });
    const r = repoFalso([m]);
    const avisar = enviado();
    const s = new EnergiaService(r.db);
    (r.db.atualizarStatus as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('banco fora'));
    await s.vigiar(AGORA, avisar, () => true);
    expect(avisar).toHaveBeenCalledTimes(1);
    expect(r.status).toEqual([]);
    await s.vigiar(new Date(AGORA.getTime() + 15 * 60_000), avisar, () => true);
    expect(avisar).toHaveBeenCalledTimes(1);
    expect(r.status[0][1]).toMatchObject({ status: 'mudo', avisos_no_dia: 1 });
  });

  it('freio: no máximo 4 mensagens por medidor por dia; passou disso grava sem mensagem', async () => {
    const r = repoFalso([medidor({ status: 'ok', ultima_leitura_em: '2026-09-28T10:00:00Z', aviso_dia: '2026-09-28', avisos_no_dia: 4 })]);
    const avisar = enviado();
    await new EnergiaService(r.db).vigiar(AGORA, avisar, () => true);
    expect(avisar).not.toHaveBeenCalled();
    expect(r.status[0][1]).toMatchObject({ status: 'mudo', avisos_no_dia: 4 });
  });

  it('o freio zera no dia seguinte', async () => {
    const r = repoFalso([medidor({ status: 'ok', ultima_leitura_em: '2026-09-28T10:00:00Z', aviso_dia: '2026-09-27', avisos_no_dia: 4 })]);
    const avisar = enviado();
    await new EnergiaService(r.db).vigiar(AGORA, avisar, () => true);
    expect(avisar).toHaveBeenCalledTimes(1);
    expect(r.status[0][1]).toMatchObject({ avisos_no_dia: 1, aviso_dia: '2026-09-28' });
  });

  it('chave da nuvem recusada: UM aviso pelo mesmo avisar, e o vigia do script segue funcionando', async () => {
    // push_nuvem com a chave recusada, e o script voltou a mandar dado.
    const m = medidor({ id: 'pn', modo_coleta: 'push_nuvem', api_credentials_cifrado: 'x', status: 'mudo', ultima_leitura_em: '2026-09-28T14:59:00Z', nuvem_ok: false, nuvem_desde: '2026-09-28T14:00:00Z' });
    const r = repoFalso([m]);
    const avisar = enviado();
    await new EnergiaService(r.db).vigiar(AGORA, avisar, () => true);
    const textos = avisar.mock.calls.map((c) => String(c[1]));
    expect(textos).toHaveLength(2);
    expect(textos[0]).toMatch(/voltou/);
    expect(textos[1]).toMatch(/recusou a chave/);
    expect(r.status.map((x) => x[1])).toEqual([
      expect.objectContaining({ status: 'ok' }),
      expect.objectContaining({ nuvem_avisado_em: AGORA.toISOString(), avisos_no_dia: 2 }),
    ]);
    // já avisado: não repete
    const r2 = repoFalso([{ ...m, status: 'ok', nuvem_avisado_em: AGORA.toISOString() }]);
    const avisar2 = enviado();
    await new EnergiaService(r2.db).vigiar(AGORA, avisar2, () => true);
    expect(avisar2).not.toHaveBeenCalled();
  });
});

describe('reter', () => {
  it('apaga bruto > 90 dias só até onde o 15 min cobre, e 15 min > 25 meses', async () => {
    const r = repoFalso([medidor()]);
    (r.db.ultimaJanela as ReturnType<typeof vi.fn>).mockResolvedValue('2026-06-01T00:00:00.000Z');
    await new EnergiaService(r.db).reter(new Date('2026-09-28T12:00:00Z'));
    const corteBruto = (r.db.apagarBrutoAntesDe as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(corteBruto).toBe('2026-06-01T00:00:00.000Z'); // não passa da última janela agregada
    const corte15 = (r.db.apagar15minAntesDe as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(corte15.slice(0, 7)).toBe('2024-08');
  });

  it('sem nenhuma janela agregada não apaga bruto', async () => {
    const r = repoFalso([medidor()]);
    await new EnergiaService(r.db).reter(new Date('2026-09-28T12:00:00Z'));
    expect(r.db.apagarBrutoAntesDe).not.toHaveBeenCalled();
  });
});
