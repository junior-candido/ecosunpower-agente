// Geocodificação das usinas (Mapa das Usinas, 28/09/2026). Rede sempre
// DUBLÊ: nenhum teste chama o Nominatim de verdade.
import { describe, it, expect, vi } from 'vitest';
import {
  Geocodificador, centroDaCidade, podeSobrescrever, pontoValido, deslocarAproximado,
  normalizarTexto, consultasDoEndereco, pontoDaApi,
} from '../src/modules/monitoring/geocodificacao.js';

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Relógio falso: esperar() só avança o relógio (teste não dorme). */
function relogio() {
  let t = 1_000_000;
  const esperas: number[] = [];
  return {
    agora: () => t,
    esperar: async (ms: number) => { esperas.push(ms); t += ms; },
    passar: (ms: number) => { t += ms; },
    esperas,
  };
}

describe('regras puras', () => {
  it('normaliza nome de cidade (acento, caixa, espaços)', () => {
    expect(normalizarTexto('  Águas   Lindas de GOIÁS ')).toBe('aguas lindas de goias');
  });

  it('ponto válido: número finito, dentro do globo, e nunca 0,0', () => {
    expect(pontoValido(-15.79, -47.88)).toBe(true);
    expect(pontoValido(0, 0)).toBe(false);
    expect(pontoValido(-95, 10)).toBe(false);
    expect(pontoValido(Number.NaN, 10)).toBe(false);
    expect(pontoValido(null, -47)).toBe(false);
  });

  it('coordenada da API da marca: aceita número ou texto, recusa lixo e fora do Brasil', () => {
    expect(pontoDaApi('-15.83', -48.05)).toEqual({ lat: -15.83, lng: -48.05 });
    expect(pontoDaApi(0, 0)).toBeNull();
    expect(pontoDaApi('', '')).toBeNull();
    expect(pontoDaApi(undefined, null)).toBeNull();
    expect(pontoDaApi(48.85, 2.35)).toBeNull();
  });

  it('manual nunca é sobrescrito por localização automática', () => {
    expect(podeSobrescrever('manual', 'endereco')).toBe(false);
    expect(podeSobrescrever('manual', 'cidade')).toBe(false);
    expect(podeSobrescrever('manual', 'api')).toBe(false);
    expect(podeSobrescrever('manual', 'manual')).toBe(true);
  });

  it('ponto melhor substitui o pior, nunca o contrário', () => {
    expect(podeSobrescrever(null, 'cidade')).toBe(true);
    expect(podeSobrescrever('cidade', 'endereco')).toBe(true);
    expect(podeSobrescrever('endereco', 'cidade')).toBe(false);
    expect(podeSobrescrever('endereco', 'api')).toBe(true);
    expect(podeSobrescrever('api', 'endereco')).toBe(false);
    expect(podeSobrescrever('cidade', 'manual')).toBe(true);
  });

  it('centro das cidades do DF e do entorno sem precisar de rede', () => {
    const t = centroDaCidade('Taguatinga', 'DF')!;
    expect(t.lat).toBeCloseTo(-15.83, 1);
    expect(t.lng).toBeCloseTo(-48.06, 1);
    expect(centroDaCidade('Águas Lindas de Goiás', 'GO')).not.toBeNull();
    expect(centroDaCidade('aguas lindas', null)).not.toBeNull();
    expect(centroDaCidade('Pirenópolis', 'GO')).not.toBeNull();
    // Planaltina existe no DF e em GO: a UF decide.
    const pdf = centroDaCidade('Planaltina', 'DF')!;
    const pgo = centroDaCidade('Planaltina', 'GO')!;
    expect(pdf.lat).not.toBeCloseTo(pgo.lat, 1);
    expect(centroDaCidade('Cidade Que Não Existe', 'DF')).toBeNull();
  });

  it('deslocamento do ponto aproximado é pequeno e sempre o mesmo pra mesma usina', () => {
    const c = { lat: -15.8, lng: -47.9 };
    const a = deslocarAproximado(c, 'usina-1');
    expect(deslocarAproximado(c, 'usina-1')).toEqual(a);
    expect(deslocarAproximado(c, 'usina-2')).not.toEqual(a);
    // até ~600 m (0,006 grau)
    expect(Math.abs(a.lat - c.lat)).toBeLessThan(0.006);
    expect(Math.abs(a.lng - c.lng)).toBeLessThan(0.006);
  });

  it('monta a busca pelo endereço antes da cidade', () => {
    const c = consultasDoEndereco({ rua: 'QNM 36 Conjunto K', numero: '12', cidade: 'Ceilândia', uf: 'DF' });
    expect(c[0].tipo).toBe('endereco');
    expect(c[0].params.street).toBe('12 QNM 36 Conjunto K');
    expect(c[0].params.city).toBe('Ceilândia');
    expect(c[0].params.state).toBe('Distrito Federal');
    expect(c[c.length - 1].tipo).toBe('cidade');
    // Sem rua: só cidade.
    expect(consultasDoEndereco({ cidade: 'Gama', uf: 'DF' }).every((x) => x.tipo === 'cidade')).toBe(true);
    // Sem nada: nada.
    expect(consultasDoEndereco({})).toEqual([]);
  });
});

describe('Geocodificador (rede dublê)', () => {
  it('manda User-Agent próprio, país Brasil e 1 resultado', async () => {
    const r = relogio();
    const fetchFalso = vi.fn(async (_url: string | URL, _init?: RequestInit) => respostaJson([{ lat: '-15.8190', lon: '-48.1080' }]));
    const g = new Geocodificador({ fetch: fetchFalso as unknown as typeof fetch, agora: r.agora, esperar: r.esperar, userAgent: 'TesteMapa/1.0' });
    const res = await g.localizar({ rua: 'QNM 36', numero: '12', cidade: 'Ceilândia', uf: 'DF' });
    expect(res).toMatchObject({ ok: true, fonte: 'endereco', lat: -15.819, lng: -48.108 });
    const [url, init] = fetchFalso.mock.calls[0];
    const u = new URL(String(url));
    expect(u.hostname).toBe('nominatim.openstreetmap.org');
    expect(u.searchParams.get('countrycodes')).toBe('br');
    expect(u.searchParams.get('limit')).toBe('1');
    expect(u.searchParams.get('format')).toBe('jsonv2');
    expect((init?.headers as Record<string, string>)['User-Agent']).toBe('TesteMapa/1.0');
  });

  it('respeita 1 pedido por segundo (espera entre um e outro)', async () => {
    const r = relogio();
    const fetchFalso = vi.fn(async () => respostaJson([{ lat: '-15.8', lon: '-47.9' }]));
    const g = new Geocodificador({ fetch: fetchFalso as unknown as typeof fetch, agora: r.agora, esperar: r.esperar });
    await g.localizar({ rua: 'Rua A', cidade: 'Gama', uf: 'DF' });
    await g.localizar({ rua: 'Rua B', cidade: 'Gama', uf: 'DF' });
    await g.localizar({ rua: 'Rua C', cidade: 'Gama', uf: 'DF' });
    expect(fetchFalso).toHaveBeenCalledTimes(3);
    expect(r.esperas.filter((ms) => ms > 0).length).toBe(2);
    for (const ms of r.esperas.filter((x) => x > 0)) expect(ms).toBeGreaterThanOrEqual(1000);
  });

  it('pedidos AO MESMO TEMPO também saem com 1 s de intervalo (fila única)', async () => {
    const r = relogio();
    const momentos: number[] = [];
    const fetchFalso = vi.fn(async () => { momentos.push(r.agora()); return respostaJson([{ lat: '-15.8', lon: '-47.9' }]); });
    const g = new Geocodificador({ fetch: fetchFalso as unknown as typeof fetch, agora: r.agora, esperar: r.esperar });
    await Promise.all([
      g.localizar({ rua: 'Rua A', cidade: 'Gama', uf: 'DF' }),
      g.localizar({ rua: 'Rua B', cidade: 'Gama', uf: 'DF' }),
    ]);
    expect(momentos).toHaveLength(2);
    expect(momentos[1] - momentos[0]).toBeGreaterThanOrEqual(1000);
  });

  it('guarda em cache: o mesmo endereço não vai à rede de novo', async () => {
    const r = relogio();
    const fetchFalso = vi.fn(async () => respostaJson([{ lat: '-15.8', lon: '-47.9' }]));
    const g = new Geocodificador({ fetch: fetchFalso as unknown as typeof fetch, agora: r.agora, esperar: r.esperar });
    await g.localizar({ rua: 'Rua A', numero: '1', cidade: 'Gama', uf: 'DF' });
    await g.localizar({ rua: 'rua a', numero: '1', cidade: 'GAMA', uf: 'df' });
    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });

  it('endereço não achado: cai no centro da cidade (tabela, sem rede) e marca "cidade"', async () => {
    const r = relogio();
    const fetchFalso = vi.fn(async () => respostaJson([]));
    const g = new Geocodificador({ fetch: fetchFalso as unknown as typeof fetch, agora: r.agora, esperar: r.esperar });
    const res = await g.localizar({ rua: 'Rua Inexistente', cidade: 'Sobradinho', uf: 'DF' });
    expect(res).toMatchObject({ ok: true, fonte: 'cidade' });
    if (!res.ok) throw new Error('esperava ok');
    expect(res.lat).toBeCloseTo(-15.65, 1);
    expect(fetchFalso).toHaveBeenCalledTimes(1); // só a tentativa do endereço
  });

  it('serviço fora do ar: ainda assim usa o centro da cidade conhecido', async () => {
    const r = relogio();
    const fetchFalso = vi.fn(async () => { throw new Error('ECONNRESET'); });
    const g = new Geocodificador({ fetch: fetchFalso as unknown as typeof fetch, agora: r.agora, esperar: r.esperar });
    const res = await g.localizar({ rua: 'Rua A', cidade: 'Formosa', uf: 'GO' });
    expect(res).toMatchObject({ ok: true, fonte: 'cidade' });
  });

  it('cidade fora da tabela: pergunta ao serviço pela cidade (fonte "cidade")', async () => {
    const r = relogio();
    const fetchFalso = vi.fn(async (url: string | URL) => {
      const u = new URL(String(url));
      return respostaJson(u.searchParams.get('city') === 'Paracatu' && !u.searchParams.get('street') ? [{ lat: '-17.222', lon: '-46.875' }] : []);
    });
    const g = new Geocodificador({ fetch: fetchFalso as unknown as typeof fetch, agora: r.agora, esperar: r.esperar });
    const res = await g.localizar({ cidade: 'Paracatu', uf: 'MG' });
    expect(res).toMatchObject({ ok: true, fonte: 'cidade', lat: -17.222 });
  });

  it('resultado fora do Brasil é descartado', async () => {
    const r = relogio();
    const fetchFalso = vi.fn(async () => respostaJson([{ lat: '48.85', lon: '2.35' }]));
    const g = new Geocodificador({ fetch: fetchFalso as unknown as typeof fetch, agora: r.agora, esperar: r.esperar });
    const res = await g.localizar({ rua: 'Rue de Rivoli', cidade: 'Cidade Sem Tabela', uf: 'SP' });
    expect(res.ok).toBe(false);
  });

  it('limite do serviço (429): para e avisa, sem cachear a falha', async () => {
    const r = relogio();
    const fetchFalso = vi.fn(async () => respostaJson({ error: 'rate' }, 429));
    const g = new Geocodificador({ fetch: fetchFalso as unknown as typeof fetch, agora: r.agora, esperar: r.esperar });
    const res = await g.localizar({ rua: 'Rua A', cidade: 'Cidade Sem Tabela', uf: 'SP' });
    expect(res).toMatchObject({ ok: false, limite: true });
    await g.localizar({ rua: 'Rua A', cidade: 'Cidade Sem Tabela', uf: 'SP' });
    expect(fetchFalso.mock.calls.length).toBeGreaterThan(1);
  });

  it('sem endereço nem cidade: não chama a rede', async () => {
    const fetchFalso = vi.fn();
    const g = new Geocodificador({ fetch: fetchFalso as unknown as typeof fetch });
    const res = await g.localizar({ uf: 'DF' });
    expect(res.ok).toBe(false);
    expect(fetchFalso).not.toHaveBeenCalled();
  });
});
