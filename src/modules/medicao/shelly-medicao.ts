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
export function extrairLeituraShelly(bruto: unknown): LeituraShelly | null {
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
  let medidoEm: string;
  if (b.medido_em === undefined || b.medido_em === null || b.medido_em === '') {
    medidoEm = new Date().toISOString();
  } else {
    const epoch = typeof b.medido_em === 'number' ? b.medido_em : null;
    // Abaixo de 1e11 é segundos (até o ano 5138); acima, milissegundos.
    const d = epoch !== null
      ? new Date(Math.abs(epoch) < 1e11 ? epoch * 1000 : epoch)
      : new Date(String(b.medido_em));
    if (Number.isNaN(d.getTime())) return null;
    const ano = d.getUTCFullYear();
    if (ano < 2020 || ano > 2100) return null;
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
};

export type LeituraParaGravar = LeituraShelly & {
  companyId?: string;
  leadId?: string | null;
  medidorId?: string;
};

/**
 * Aparelhos que ainda podem usar o token GLOBAL (SHELLY_INGEST_TOKEN). Só o
 * piloto (quadro da casa do Junior) — ele manda dado desde 07/09 com esse token.
 * Quando o script do piloto for trocado pro token do medidor, esvaziar esta
 * lista e tirar a env do EasyPanel.
 */
export const DEVICES_TOKEN_LEGADO: readonly string[] = ['007007422d90'];

export type RecebimentoDeps = {
  salvar: (l: LeituraParaGravar) => Promise<boolean>;
  /** Token global legado (env SHELLY_INGEST_TOKEN). Só vale pro piloto. */
  tokenEsperado: string;
  /** Token do medidor → medidor/empresa (hash SHA-256 em medidores_energia). */
  resolverToken?: (token: string) => Promise<MedidorDoToken | null>;
  /** Caminho legado: acha o medidor cadastrado do piloto (pra carimbar medidor_id). */
  resolverLegado?: (deviceId: string) => Promise<MedidorDoToken | null>;
  /** Depois de gravar: atualiza a última leitura do medidor (1 vez por lote). */
  aoReceber?: (medidorId: string, companyId: string, ultimaIso: string) => Promise<void>;
  devicesLegados?: readonly string[];
};

export type ResultadoRecebimento = {
  aceito: boolean;
  salvas?: number;
  recusadas?: number;
  motivo?: 'token' | 'sem_token_no_servidor' | 'leitura_invalida' | 'erro';
};

/** "shellypro3em-007007422D90" → "007007422d90". */
export function normalizarDeviceIdShelly(id: string | null | undefined): string {
  return String(id ?? '').trim().toLowerCase().replace(/^shelly[a-z0-9]*-/, '');
}

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
 *   1) token do MEDIDOR (hash no banco) → grava com a empresa DELE, e só a
 *      leitura do próprio aparelho (um token não grava em outro aparelho);
 *   2) token GLOBAL legado (comparação em tempo constante) → só o piloto;
 *   3) nada disso → 401. Sem nenhum dos dois configurados, recusa TUDO.
 *
 * Nunca lança: o aparelho manda de minuto em minuto e reenviaria em loop.
 */
export async function receberLeituraShelly(
  deps: RecebimentoDeps,
  corpo: unknown,
  tokenRecebido: string,
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
    if (deps.resolverToken) {
      medidor = await deps.resolverToken(tokenRecebido).catch((e) => {
        console.warn('[energia] resolver token do medidor falhou (segue pro legado):', (e as Error)?.message);
        return null;
      });
    }

    // 2) Token global legado (só o piloto).
    let legado = false;
    if (!medidor) {
      if (!iguaisTempoConstante(tokenRecebido, deps.tokenEsperado)) return { aceito: false, motivo: 'token' };
      legado = true;
    }
    const legados = new Set((deps.devicesLegados ?? DEVICES_TOKEN_LEGADO).map(normalizarDeviceIdShelly));
    const medidorLegadoPorDevice = new Map<string, MedidorDoToken | null>();

    const lote = Array.isArray(corpo) ? corpo : [corpo];
    let salvas = 0;
    let invalidas = 0;        // o aparelho mandou algo que não dá pra usar
    let falhasDeGravacao = 0; // a leitura era boa, o banco é que não aceitou
    const ultimaPorMedidor = new Map<string, { companyId: string; iso: string }>();

    for (const item of lote) {
      const leitura = extrairLeituraShelly(item);
      if (!leitura) { invalidas++; continue; }
      const dev = normalizarDeviceIdShelly(leitura.deviceId);
      let gravar: LeituraParaGravar;
      if (medidor) {
        // Um token não grava em outro aparelho.
        if (dev !== medidor.deviceId) { invalidas++; continue; }
        gravar = { ...leitura, companyId: medidor.companyId, leadId: medidor.leadId, medidorId: medidor.medidorId };
      } else {
        if (!legados.has(dev)) { invalidas++; continue; }
        if (!medidorLegadoPorDevice.has(dev)) {
          const m = deps.resolverLegado ? await deps.resolverLegado(dev).catch(() => null) : null;
          medidorLegadoPorDevice.set(dev, m);
        }
        const m = medidorLegadoPorDevice.get(dev) ?? null;
        gravar = m ? { ...leitura, companyId: m.companyId, medidorId: m.medidorId } : { ...leitura };
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

    const recusadas = invalidas + falhasDeGravacao;
    if (salvas > 0) return { aceito: true, salvas, recusadas };

    // Nada salvo: dizer POR QUE. "O aparelho manda lixo" e "o nosso banco caiu"
    // mandam procurar o defeito em lugares opostos — juntar os dois num motivo
    // só faria perder tempo na hora do problema.
    return {
      aceito: false,
      motivo: falhasDeGravacao > 0 ? 'erro' : 'leitura_invalida',
      salvas,
      recusadas,
    };
  } catch (err) {
    console.warn('[shelly] recebimento falhou (ignorado):', (err as Error)?.message);
    return { aceito: false, motivo: 'erro' };
  }
}
