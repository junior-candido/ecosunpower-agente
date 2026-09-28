// src/modules/energia/adapters/shelly-cloud.ts
//
// Leitor RESERVA pela nuvem Shelly (decisão D1: o aparelho empurra pro nosso
// webhook; a nuvem só cobre quando o script para). Cloud Control API v2 (beta),
// conferida em shelly-api-docs.shelly.cloud em 28/09/2026:
//   POST https://<server_uri>/v2/devices/api/get?auth_key=<chave>
//   body { ids: string[1..10], select: ["status"] }
//   → [{ id, type, code, gen, online: 0|1, status }]   erro: { error, data: { messages } }
//   "All requests in this section are limited to 1 request/second."
//
// Cuidados:
//  - a URL leva a auth_key: NUNCA logar a URL nem devolvê-la em mensagem;
//  - fila por chave com espaço ≥ 1,1 s; lote de até 10 aparelhos;
//  - nunca lança: erro vira { ok: false, reason } em português.

import type { DeviceNuvem, LeituraMedidor, MedidorAdapter, PerfilMedidor, StatusResult } from '../types.js';
import type { CredShelly } from '../credenciais.js';
import { fetchWithTimeout } from '../../monitoring/util/fetch-with-timeout.js';

const FASE = ['a', 'b', 'c'];
const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);

/** Lê um canal do status do Pro 3EM nos dois perfis (trifásico em:0 / monofásico em1:N). */
export function parseStatusShelly(st: Obj, perfil: PerfilMedidor, canal: number): LeituraMedidor | null {
  if (perfil === 'triphase') {
    const em = obj(st['em:0']), ed = obj(st['emdata:0']), f = FASE[canal];
    if (!em || !f) return null;
    const p = n(em[`${f}_act_power`]);
    if (p === null) return null;
    return {
      tensao: n(em[`${f}_voltage`]), corrente: n(em[`${f}_current`]), potenciaW: p,
      potenciaVa: n(em[`${f}_aprt_power`]), fatorPotencia: n(em[`${f}_pf`]),
      energiaWh: n(ed?.[`${f}_total_act_energy`]), energiaDevolvidaWh: n(ed?.[`${f}_total_act_ret_energy`]),
    };
  }
  const em = obj(st[`em1:${canal}`]), ed = obj(st[`em1data:${canal}`]);
  if (!em) return null;
  const p = n(em.act_power);
  if (p === null) return null;
  return {
    tensao: n(em.voltage), corrente: n(em.current), potenciaW: p, potenciaVa: n(em.aprt_power),
    fatorPotencia: n(em.pf), energiaWh: n(ed?.total_act_energy), energiaDevolvidaWh: n(ed?.total_act_ret_energy),
  };
}

/** Perfil em que o aparelho está (pra conferir o cadastro no "Testar conexão"). */
export function perfilDetectado(st: Obj | null | undefined): PerfilMedidor | null {
  if (!st) return null;
  if (st['em:0']) return 'triphase';
  if (Object.keys(st).some((k) => k.startsWith('em1:'))) return 'monophase';
  return null;
}

/** Quando o aparelho leu: relógio dele (sys.unixtime) se estiver a menos de 1 h de agora; senão agora. */
export function instanteDoStatus(st: Obj, agoraMs: number): string {
  const u = n(obj(st.sys)?.unixtime);
  if (u !== null && Math.abs(u * 1000 - agoraMs) <= 3_600_000) return new Date(u * 1000).toISOString();
  return new Date(agoraMs).toISOString();
}

export interface DepsCliente {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  agora: () => number;
  dormir: (ms: number) => Promise<void>;
}

const ESPACO_MS = 1100; // doc: "1 request/second" — com folga
const LOTE = 10;        // doc: ids entre 1 e 10 por chamada
const ERRO_AUTH = /unauthori[sz]ed|invalid.*(auth|key|token)|auth.*(invalid|fail)|forbidden/i;

/** Tira qualquer pedaço da chave de um texto que veio de fora. */
function limpar(texto: string, chave: string): string {
  let t = String(texto ?? '').slice(0, 200);
  if (chave) t = t.split(chave).join('•••');
  return t;
}

export function criarClienteShellyCloud(d: DepsCliente) {
  const ultimaPorChave = new Map<string, number>();
  // Fila POR CHAVE: uma promessa encadeada garante o espaçamento mesmo com
  // chamadas concorrentes (dois ciclos se sobrepondo não furam o limite).
  const filaPorChave = new Map<string, Promise<void>>();
  // Limpeza (o processo vive meses e cada conta Shelly é uma chave): o
  // horário da última chamada só importa por ESPACO_MS; a fila, até andar.
  function limparMapas(): void {
    const agora = d.agora();
    for (const [k, t] of ultimaPorChave) if (agora - t > ESPACO_MS && !filaPorChave.has(k)) ultimaPorChave.delete(k);
  }
  function vez(chave: string): Promise<void> {
    limparMapas();
    const anterior = filaPorChave.get(chave) ?? Promise.resolve();
    const minha = anterior.then(async () => {
      const ult = ultimaPorChave.get(chave);
      if (ult !== undefined) {
        const falta = ult + ESPACO_MS - d.agora();
        if (falta > 0) await d.dormir(falta);
      }
      ultimaPorChave.set(chave, d.agora());
    });
    const cauda = minha.catch(() => undefined);
    filaPorChave.set(chave, cauda);
    // Fila vazia (ninguém entrou atrás): sai do mapa.
    void cauda.then(() => { if (filaPorChave.get(chave) === cauda) filaPorChave.delete(chave); });
    return minha;
  }

  return {
    /** Só pra teste: tamanho dos mapas internos. */
    _tamanhos: () => ({ ultimas: ultimaPorChave.size, filas: filaPorChave.size }),
    async buscarStatus(cred: CredShelly, ids: string[]): Promise<StatusResult> {
      const devices: DeviceNuvem[] = [];
      for (let i = 0; i < ids.length; i += LOTE) {
        await vez(cred.auth_key);
        const url = `${cred.server_uri}/v2/devices/api/get?auth_key=${encodeURIComponent(cred.auth_key)}`;
        let r: Response;
        try {
          r = await d.fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: ids.slice(i, i + LOTE), select: ['status'] }),
          });
        } catch (err) {
          // A mensagem do fetch pode trazer a URL (com a chave): não repassa.
          const nome = (err as Error)?.name === 'AbortError' ? 'tempo esgotado' : 'sem conexão';
          return { ok: false, reason: `nuvem Shelly: ${nome}` };
        }
        if (r.status === 401 || r.status === 403) {
          return { ok: false, reason: `nuvem Shelly recusou a chave (${r.status})`, invalidCredentials: true };
        }
        const corpo: unknown = await r.json().catch(() => null);
        if (!Array.isArray(corpo)) {
          const erro = limpar(String(obj(corpo)?.error ?? r.status), cred.auth_key);
          if (ERRO_AUTH.test(erro)) return { ok: false, reason: `nuvem Shelly recusou a chave (${erro})`, invalidCredentials: true };
          return { ok: false, reason: `nuvem Shelly: ${erro}` };
        }
        for (const x of corpo) {
          const o = obj(x);
          if (!o) continue;
          const online = o.online === 1 || o.online === true;
          devices.push({
            id: String(o.id ?? ''),
            online,
            modelo: typeof o.code === 'string' ? o.code : null,
            status: online ? obj(o.status) : null,
          });
        }
      }
      return { ok: true, devices };
    },
  };
}

/** Cliente de produção (fetch com timeout de 20 s, relógio real). Um só por processo. */
let clienteReal: ReturnType<typeof criarClienteShellyCloud> | null = null;
function clienteDeProducao() {
  clienteReal ??= criarClienteShellyCloud({
    fetch: (url, init) => fetchWithTimeout(url, init, 20_000),
    agora: () => Date.now(),
    dormir: (ms) => new Promise((ok) => setTimeout(ok, ms)),
  });
  return clienteReal;
}

export const shellyCloudAdapter: MedidorAdapter = {
  fabricante: 'shelly',
  buscarStatus: (cred, ids) => clienteDeProducao().buscarStatus(cred, ids),
  lerCanal: parseStatusShelly,
};
