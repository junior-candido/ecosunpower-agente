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

  // Data: o relógio do aparelho pode estar fora do ar depois de uma queda de
  // energia, e aí ele manda 1970. Gravar isso arruinaria a série histórica.
  let medidoEm: string;
  if (b.medido_em === undefined || b.medido_em === null || b.medido_em === '') {
    medidoEm = new Date().toISOString();
  } else {
    const d = new Date(String(b.medido_em));
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

export type RecebimentoDeps = {
  salvar: (l: LeituraShelly) => Promise<boolean>;
  /** Token configurado no servidor (env SHELLY_INGEST_TOKEN). */
  tokenEsperado: string;
};

export type ResultadoRecebimento = {
  aceito: boolean;
  salvas?: number;
  recusadas?: number;
  motivo?: 'token' | 'sem_token_no_servidor' | 'leitura_invalida' | 'erro';
};

/**
 * Recebe uma leitura (ou um lote, quando o aparelho ficou sem rede e acumulou).
 *
 * 🔒 O endereço é PÚBLICO. Sem token, qualquer um envenena a base de medição de
 * um cliente — e medição envenenada vira laudo errado, assinado por um
 * responsável técnico. Por isso: sem token no servidor, recusa TUDO e grita no
 * log, em vez de ficar aberto em silêncio.
 *
 * Nunca lança: o aparelho manda de minuto em minuto e reenviaria em loop.
 */
export async function receberLeituraShelly(
  deps: RecebimentoDeps,
  corpo: unknown,
  tokenRecebido: string,
): Promise<ResultadoRecebimento> {
  try {
    if (!deps.tokenEsperado) {
      console.error(
        '[shelly] SHELLY_INGEST_TOKEN nao configurado — recusando TODA leitura. ' +
          'Sem token o endereco fica aberto pra qualquer um gravar medicao.',
      );
      return { aceito: false, motivo: 'sem_token_no_servidor' };
    }
    if (!tokenRecebido || tokenRecebido !== deps.tokenEsperado) {
      return { aceito: false, motivo: 'token' };
    }

    const lote = Array.isArray(corpo) ? corpo : [corpo];
    let salvas = 0;
    let invalidas = 0;        // o aparelho mandou algo que não dá pra usar
    let falhasDeGravacao = 0; // a leitura era boa, o banco é que não aceitou

    for (const item of lote) {
      const leitura = extrairLeituraShelly(item);
      if (!leitura) { invalidas++; continue; }
      // Uma leitura ruim no meio do lote não pode derrubar as boas.
      const ok = await deps.salvar(leitura).catch((e) => {
        console.warn('[shelly] nao gravou uma leitura:', (e as Error)?.message);
        return false;
      });
      if (ok) salvas++; else falhasDeGravacao++;
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
