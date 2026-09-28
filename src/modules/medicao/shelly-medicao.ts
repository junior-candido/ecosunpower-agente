// src/modules/medicao/shelly-medicao.ts
//
// KIT DE MEDIÇÃO — recebimento das leituras do Shelly Pro 3EM.
//
// Por que o aparelho EMPURRA em vez de a gente buscar (Junior 07/09/2026):
// o medidor fica na casa do cliente e a plataforma fica aqui. Não existe rede
// em comum. Descobrimos isso na marra — o Shelly da casa dele e o computador
// do escritório estavam ambos em 192.168.1.8, em redes diferentes que nunca se
// falam. Ler por IP serve pra bancada; pro produto, o aparelho tem que chamar
// o nosso servidor. Um script mJS roda dentro dele e faz esse POST.
//
// O que sustenta a mensalidade não é mostrar consumo — é a JANELA DE 15
// MINUTOS. A concessionária mede demanda nessa janela e o medidor dela alisa o
// pico. Guardando de 1 em 1 minuto, mostramos o pico que o cliente paga e não
// enxerga. É também o que transforma uma medição em laudo.

import { createHash, timingSafeEqual } from 'node:crypto';
import { normalizarDeviceId } from '../energia/credenciais.js';

export type LeituraShelly = {
  deviceId: string;
  apelido: string | null;
  canal: number;
  medidoEm: string;              // ISO
  tensao: number | null;
  corrente: number | null;
  potenciaW: number;             // negativa = injetando na rede
  potenciaVa: number | null;
  fatorPotencia: number | null;
  energiaWh: number | null;
  energiaDevolvidaWh: number | null;
};

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Lê uma leitura vinda do aparelho. Devolve null quando não dá pra confiar —
 * é melhor descartar do que gravar lixo: medição envenenada vira laudo errado.
 */
/** Leitura com hora mais adiantada que isto (relógio do aparelho errado) é recusada. */
export const TOLERANCIA_FUTURO_MS = 5 * 60_000;

export function extrairLeituraShelly(bruto: unknown, agora: Date = new Date()): LeituraShelly | null {
  const b = (bruto ?? {}) as Record<string, unknown>;

  const deviceId = String(b.device_id ?? '').trim();
  if (!deviceId) return null;

  // Potência é o dado que importa. Sem ela a linha não serve pra nada.
  const potenciaW = num(b.potencia_w);
  if (potenciaW === null) return null;

  // Data. Dois cuidados:
  //
  // 1) O script roda em mJS dentro do aparelho, que não tem toISOString().
  //    Então ele manda EPOCH (segundos ou milissegundos). Aceitar os dois faz o
  //    aparelho carimbar a própria leitura — o que importa quando ele fica sem
  //    rede e reenvia o acumulado depois; sem isso, o lote inteiro chegaria com
  //    a hora da reconexão e a série histórica sairia amassada.
  //
  // 2) Depois de uma queda de energia o relógio dele volta pra 1970. Gravar
  //    isso arruinaria a série — melhor recusar a leitura.
  //
  // 3) Relógio ADIANTADO (mais de 5 min à frente do servidor) também é
  //    recusado: leitura no futuro faria o vigia achar que está tudo bem.
  let medidoEm: string;
  if (b.medido_em === undefined || b.medido_em === null || b.medido_em === '') {
    medidoEm = agora.toISOString();
  } else {
    const epoch = typeof b.medido_em === 'number' ? b.medido_em : null;
    // Abaixo de 1e11 é segundos (até o ano 5138); acima, milissegundos.
    const d = epoch !== null
      ? new Date(Math.abs(epoch) < 1e11 ? epoch * 1000 : epoch)
      : new Date(String(b.medido_em));
    if (Number.isNaN(d.getTime())) return null;
    const ano = d.getUTCFullYear();
    if (ano < 2020 || ano > 2100) return null;
    if (d.getTime() > agora.getTime() + TOLERANCIA_FUTURO_MS) return null;
    medidoEm = d.toISOString();
  }

  const apelidoBruto = b.apelido === undefined || b.apelido === null ? null : String(b.apelido).trim();

  return {
    deviceId: deviceId.slice(0, 64),
    apelido: apelidoBruto ? apelidoBruto.slice(0, 80) : null,
    canal: Math.trunc(num(b.canal) ?? 0),
    medidoEm,
    tensao: num(b.tensao),
    corrente: num(b.corrente),
    potenciaW,
    potenciaVa: num(b.potencia_va),
    fatorPotencia: num(b.fator_potencia),
    energiaWh: num(b.energia_wh),
    energiaDevolvidaWh: num(b.energia_devolvida_wh),
  };
}

export type Janela15 = {
  inicio: string;    // ISO — sempre :00, :15, :30 ou :45
  mediaW: number;    // é este número que a concessionária cobra
  picoW: number;     // o pico instantâneo dentro da janela
  amostras: number;
};

/** Início da janela de 15 min a que um instante pertence. */
function inicioDaJanela(iso: string): string {
  const d = new Date(iso);
  d.setUTCSeconds(0, 0);
  d.setUTCMinutes(Math.floor(d.getUTCMinutes() / 15) * 15);
  return d.toISOString();
}

/**
 * Agrupa leituras em janelas de 15 minutos, devolvendo a MÉDIA de cada uma —
 * que é a grandeza que a distribuidora fatura — e também o pico instantâneo,
 * que é o que o cliente nunca viu.
 */
export function janelasDe15Minutos(
  leituras: Array<{ medidoEm: string; potenciaW: number }>,
): Janela15[] {
  const mapa = new Map<string, { soma: number; pico: number; n: number }>();

  for (const l of leituras) {
    const chave = inicioDaJanela(l.medidoEm);
    const atual = mapa.get(chave);
    if (atual) {
      atual.soma += l.potenciaW;
      atual.n += 1;
      if (l.potenciaW > atual.pico) atual.pico = l.potenciaW;
    } else {
      mapa.set(chave, { soma: l.potenciaW, pico: l.potenciaW, n: 1 });
    }
  }

  return [...mapa.entries()]
    .map(([inicio, v]) => ({
      inicio,
      mediaW: v.soma / v.n,
      picoW: v.pico,
      amostras: v.n,
    }))
    .sort((a, b) => (a.inicio < b.inicio ? -1 : 1));
}

/**
 * A demanda do período: a MAIOR média de 15 minutos.
 *
 * Injeção solar aparece como potência negativa. Demanda é grandeza de
 * CONSUMO — janela com média negativa (a casa devolveu mais do que consumiu)
 * não concorre a demanda máxima, senão o sinal trocado falsearia o resultado.
 */
export function demandaMaxima(
  leituras: Array<{ medidoEm: string; potenciaW: number }>,
): { demandaW: number; picoInstantaneoW: number; janelaInicio: string } | null {
  const janelas = janelasDe15Minutos(leituras).filter((j) => j.mediaW > 0);
  if (janelas.length === 0) return null;

  const maior = janelas.reduce((a, b) => (b.mediaW > a.mediaW ? b : a));
  return {
    demandaW: maior.mediaW,
    picoInstantaneoW: maior.picoW,
    janelaInicio: maior.inicio,
  };
}

/** Medidor dono de um token (tabela medidores_energia, migration 136). */
export type MedidorDoToken = {
  medidorId: string;
  companyId: string;
  leadId: string | null;
  /** Sem o prefixo do modelo, minúsculo (ver normalizarDeviceIdShelly). */
  deviceId: string;
  /** false = desligado na plataforma (LGPD): o webhook recusa. Ausente = ativo. */
  ativo?: boolean;
};

export type LeituraParaGravar = LeituraShelly & {
  companyId?: string;
  leadId?: string | null;
  medidorId?: string;
};

/**
 * Aparelhos que ainda podem usar o token GLOBAL (SHELLY_INGEST_TOKEN). Padrão:
 * só o piloto (quadro da casa do Junior), que manda dado desde 07/09 com esse
 * token. A lista vem da env SHELLY_LEGADO_DEVICES (ids separados por vírgula,
 * sem o prefixo "shellypro3em-") — liberar outro aparelho não exige deploy.
 * SOMENTE aparelhos da EcoSun: pelo token global a leitura grava na EcoSun
 * (empresa padrão). Aparelho de outra empresa entra com o token do medidor.
 * Quando o script do piloto for trocado pro token do medidor, tirar
 * SHELLY_INGEST_TOKEN do EasyPanel.
 */
export const DEVICES_TOKEN_LEGADO: readonly string[] = ['007007422d90'];

/** SHELLY_LEGADO_DEVICES → lista normalizada. Vazia/ausente → só o piloto. */
export function lerDevicesLegados(env: string | null | undefined): readonly string[] {
  const lista = String(env ?? '').split(',').map((d) => normalizarDeviceId(d)).filter((d) => /^[a-z0-9]{6,32}$/.test(d));
  return lista.length ? [...new Set(lista)] : DEVICES_TOKEN_LEGADO;
}

/** Token do medidor: 32 bytes em base64url = 43 caracteres. Fora disso, nem consulta o banco. */
export const FORMATO_TOKEN_MEDIDOR = /^[A-Za-z0-9_-]{43}$/;

export type RecebimentoDeps = {
  salvar: (l: LeituraParaGravar) => Promise<boolean>;
  /** Token global legado (env SHELLY_INGEST_TOKEN). Só vale pros devicesLegados. */
  tokenEsperado: string;
  /** Token do medidor → medidor/empresa (hash SHA-256 em medidores_energia). Lançar = banco fora (503). */
  resolverToken?: (token: string) => Promise<MedidorDoToken | null>;
  /** Caminho legado: acha o medidor cadastrado do piloto (pra carimbar medidor_id). */
  resolverLegado?: (deviceId: string) => Promise<MedidorDoToken | null>;
  /** Depois de gravar: atualiza a última leitura do medidor (1 vez por lote). */
  aoReceber?: (medidorId: string, companyId: string, ultimaIso: string) => Promise<void>;
  devicesLegados?: readonly string[];
  /** Relógio do servidor (teste injeta). Leitura > 5 min no futuro é recusada. */
  agora?: () => Date;
};

export type ResultadoRecebimento = {
  aceito: boolean;
  salvas?: number;
  recusadas?: number;
  motivo?: 'token' | 'sem_token_no_servidor' | 'leitura_invalida' | 'erro' | 'desativado' | 'indisponivel';
};

/** De onde veio o token: cabeçalho x-shelly-token (o certo) ou ?token= na URL (só o legado). */
export type OrigemToken = 'cabecalho' | 'query';

/** "shellypro3em-007007422D90" → "007007422d90". Mesma regra da Gestão de Energia. */
export const normalizarDeviceIdShelly = normalizarDeviceId;

/** Compara segredos em tempo constante (hash dos dois → mesmo tamanho). Vazio nunca confere. */
function iguaisTempoConstante(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ha, hb);
}

// O aviso de token legado sai no máximo 1x por hora (o aparelho manda 1x/min).
let ultimoAvisoLegadoMs = 0;
/** Só pra teste: libera o próximo aviso de token legado. */
export function _zerarAvisoLegadoParaTeste(): void { ultimoAvisoLegadoMs = 0; }

/**
 * Recebe uma leitura (ou um lote, quando o aparelho ficou sem rede e acumulou).
 *
 * 🔒 O endereço é PÚBLICO. Sem token, qualquer um envenena a base de medição de
 * um cliente — e medição envenenada vira laudo errado, assinado por um
 * responsável técnico. Ordem:
 *   1) token do MEDIDOR — formato conferido ANTES do banco; só pelo cabeçalho,
 *      nunca pela URL (URL vai parar em log de proxy). Grava com a empresa
 *      DELE, e só a leitura do próprio aparelho. Medidor desligado → recusa.
 *      Banco fora do ar → 'indisponivel' (503: o aparelho tenta de novo);
 *   2) token GLOBAL legado (tempo constante) → só os devicesLegados;
 *   3) nada disso → 401. Sem nenhum dos dois configurados, recusa TUDO.
 *
 * O device_id é gravado SEMPRE normalizado (sem prefixo, minúsculo).
 * Nunca lança: o aparelho manda de minuto em minuto e reenviaria em loop.
 */
export async function receberLeituraShelly(
  deps: RecebimentoDeps,
  corpo: unknown,
  tokenRecebido: string,
  origem: OrigemToken = 'cabecalho',
): Promise<ResultadoRecebimento> {
  try {
    if (!deps.tokenEsperado && !deps.resolverToken) {
      console.error(
        '[shelly] SHELLY_INGEST_TOKEN nao configurado — recusando TODA leitura. ' +
          'Sem token o endereco fica aberto pra qualquer um gravar medicao.',
      );
      return { aceito: false, motivo: 'sem_token_no_servidor' };
    }
    if (!tokenRecebido) return { aceito: false, motivo: 'token' };

    // 1) Token do medidor.
    let medidor: MedidorDoToken | null = null;
    if (deps.resolverToken && origem === 'cabecalho' && FORMATO_TOKEN_MEDIDOR.test(tokenRecebido)) {
      try {
        medidor = await deps.resolverToken(tokenRecebido);
      } catch (e) {
        // O token global (SHELLY_INGEST_TOKEN) pode ter o mesmo formato: aí ele
        // ainda vale pelo caminho legado, sem depender do banco pra resolver.
        if (!iguaisTempoConstante(tokenRecebido, deps.tokenEsperado)) {
          console.warn('[energia] resolver token do medidor falhou (503, o aparelho tenta de novo):', (e as Error)?.message);
          return { aceito: false, motivo: 'indisponivel' };
        }
      }
    }
    if (medidor && medidor.ativo === false) return { aceito: false, motivo: 'desativado' };

    // 2) Token global legado (só os aparelhos liberados).
    let legado = false;
    if (!medidor) {
      if (!iguaisTempoConstante(tokenRecebido, deps.tokenEsperado)) return { aceito: false, motivo: 'token' };
      legado = true;
    }
    const legados = new Set((deps.devicesLegados ?? DEVICES_TOKEN_LEGADO).map(normalizarDeviceId));
    const medidorLegadoPorDevice = new Map<string, MedidorDoToken | null>();

    const lote = Array.isArray(corpo) ? corpo : [corpo];
    const agora = (deps.agora ?? (() => new Date()))();
    let salvas = 0;
    let invalidas = 0;        // o aparelho mandou algo que não dá pra usar
    let desativadas = 0;      // medidor desligado na plataforma
    let falhasDeGravacao = 0; // a leitura era boa, o banco é que não aceitou
    const ultimaPorMedidor = new Map<string, { companyId: string; iso: string }>();

    for (const item of lote) {
      const leitura = extrairLeituraShelly(item, agora);
      if (!leitura) { invalidas++; continue; }
      const dev = normalizarDeviceId(leitura.deviceId);
      let gravar: LeituraParaGravar;
      if (medidor) {
        // Um token não grava em outro aparelho.
        if (dev !== normalizarDeviceId(medidor.deviceId)) { invalidas++; continue; }
        gravar = { ...leitura, deviceId: dev, companyId: medidor.companyId, leadId: medidor.leadId, medidorId: medidor.medidorId };
      } else {
        if (!legados.has(dev)) { invalidas++; continue; }
        if (!medidorLegadoPorDevice.has(dev)) {
          const m = deps.resolverLegado ? await deps.resolverLegado(dev).catch(() => null) : null;
          medidorLegadoPorDevice.set(dev, m);
        }
        const m = medidorLegadoPorDevice.get(dev) ?? null;
        if (m && m.ativo === false) { desativadas++; continue; }
        gravar = m ? { ...leitura, deviceId: dev, companyId: m.companyId, medidorId: m.medidorId } : { ...leitura, deviceId: dev };
      }
      // Uma leitura ruim no meio do lote não pode derrubar as boas.
      const ok = await deps.salvar(gravar).catch((e) => {
        console.warn('[shelly] nao gravou uma leitura:', (e as Error)?.message);
        return false;
      });
      if (ok) {
        salvas++;
        if (gravar.medidorId && gravar.companyId) {
          const atual = ultimaPorMedidor.get(gravar.medidorId);
          if (!atual || gravar.medidoEm > atual.iso) ultimaPorMedidor.set(gravar.medidorId, { companyId: gravar.companyId, iso: gravar.medidoEm });
        }
      } else {
        falhasDeGravacao++;
      }
    }

    if (legado && salvas > 0 && Date.now() - ultimoAvisoLegadoMs > 3_600_000) {
      ultimoAvisoLegadoMs = Date.now();
      console.warn(`[energia] token legado (SHELLY_INGEST_TOKEN) ainda em uso — device=${[...medidorLegadoPorDevice.keys()].join(',')}. Troque pelo token do medidor.`);
    }
    if (deps.aoReceber) {
      for (const [id, u] of ultimaPorMedidor) {
        await deps.aoReceber(id, u.companyId, u.iso).catch((e) => console.warn('[energia] ultima_leitura_em falhou:', (e as Error)?.message));
      }
    }

    const recusadas = invalidas + desativadas + falhasDeGravacao;
    if (salvas > 0) return { aceito: true, salvas, recusadas };

    // Nada salvo: dizer POR QUE. "O aparelho manda lixo" e "o nosso banco caiu"
    // mandam procurar o defeito em lugares opostos — juntar os dois num motivo
    // só faria perder tempo na hora do problema.
    return {
      aceito: false,
      motivo: falhasDeGravacao > 0 ? 'erro' : desativadas > 0 && invalidas === 0 ? 'desativado' : 'leitura_invalida',
      salvas,
      recusadas,
    };
  } catch (err) {
    console.warn('[shelly] recebimento falhou (ignorado):', (err as Error)?.message);
    return { aceito: false, motivo: 'erro' };
  }
}

/**
 * Código HTTP pra cada recusa. Dado ruim nunca vira 5xx (o aparelho entraria
 * em loop); só o banco fora do ar é 503 — aí tentar de novo é o certo.
 */
export function statusHttpDoRecebimento(motivo: ResultadoRecebimento['motivo']): number {
  switch (motivo) {
    case 'token':
    case 'sem_token_no_servidor': return 401;
    case 'desativado': return 410;
    case 'indisponivel': return 503;
    default: return 400;
  }
}

// ---------------------------------------------------------------------------
// Limite por IP (em memória). O endereço é público e cada tentativa de token
// errado custa um hash. 120 por minuto dá folga pra ~100 aparelhos atrás do
// mesmo IP (1 leitura/min cada). O mapa é limitado: nunca cresce sem fim.
// ---------------------------------------------------------------------------
export function criarLimitePorIp(o: { max?: number; janelaMs?: number; maxChaves?: number } = {}) {
  const max = o.max ?? 120;
  const janela = o.janelaMs ?? 60_000;
  const maxChaves = o.maxChaves ?? 10_000;
  const contas = new Map<string, { inicio: number; n: number }>();
  return {
    /** true = passou do limite (responder 429). */
    estourou(ip: string, agoraMs: number = Date.now()): boolean {
      const c = contas.get(ip);
      if (c && agoraMs - c.inicio < janela) {
        c.n++;
        return c.n > max;
      }
      contas.delete(ip);
      if (contas.size >= maxChaves) {
        // Limpa as janelas vencidas; se ainda cheio, descarta a mais antiga.
        for (const [k, v] of contas) if (agoraMs - v.inicio >= janela) contas.delete(k);
        if (contas.size >= maxChaves) {
          const maisAntiga = contas.keys().next().value;
          if (maisAntiga !== undefined) contas.delete(maisAntiga);
        }
      }
      contas.set(ip, { inicio: agoraMs, n: 1 });
      return false;
    },
    get tamanho(): number { return contas.size; },
  };
}

/**
 * IP real atrás do proxy: o ÚLTIMO do X-Forwarded-For (o primeiro o cliente forja).
 * Vale enquanto o único proxy é o Traefik do EasyPanel. Se um dia o proxy da
 * Cloudflare (nuvem laranja) for ligado no domínio, o último do XFF passa a ser
 * o IP da Cloudflare (todo mundo cai no mesmo limite): trocar para o cabeçalho
 * CF-Connecting-IP.
 */
export function ipDaRequisicao(xff: string | string[] | undefined, remoto: string | undefined): string {
  const v = Array.isArray(xff) ? xff.join(',') : String(xff ?? '');
  return (v.split(',').pop() ?? '').trim() || String(remoto ?? '?');
}
