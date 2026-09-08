// src/modules/dashboard/medicao-queries.ts
//
// Dados da aba Medição (kit Shelly). O aparelho manda uma leitura por minuto
// (ver src/modules/medicao/shelly-medicao.ts); aqui a gente transforma isso no
// que o cliente quer ver.
//
// O número que vende é a DEMANDA DE 15 MINUTOS: é a janela em que a
// distribuidora mede, e o medidor dela alisa o pico. Mostrar a média de 15 min
// ao lado do pico instantâneo é o que o cliente nunca viu na conta de luz.

import { janelasDe15Minutos, demandaMaxima } from '../medicao/shelly-medicao.js';

export type Aparelho = {
  deviceId: string;
  apelido: string | null;
  leituras: number;
  ultimaEm: string | null;
};

export type ResumoMedicao = {
  aparelho: Aparelho | null;
  agora: {
    potenciaW: number;
    tensao: number | null;
    corrente: number | null;
    fatorPotencia: number | null;
    medidoEm: string;
  } | null;
  demanda: { demandaW: number; picoInstantaneoW: number; janelaInicio: string } | null;
  janelas: Array<{ inicio: string; mediaW: number; picoW: number; amostras: number }>;
  consumoDiaKwh: number | null;
  injecaoDiaKwh: number | null;
  minutosSemReceber: number | null;
};

/** Aparelhos que já mandaram alguma leitura, o mais recente primeiro. */
export async function listarAparelhos(client: any): Promise<Aparelho[]> {
  const { data, error } = await client
    .from('medicoes_shelly')
    .select('device_id, apelido, medido_em')
    .order('medido_em', { ascending: false })
    .limit(3000);
  if (error) {
    console.warn('[medicao] listarAparelhos:', error.message);
    return [];
  }
  const mapa = new Map<string, Aparelho>();
  for (const r of (data ?? []) as Array<{ device_id: string; apelido: string | null; medido_em: string }>) {
    const atual = mapa.get(r.device_id);
    if (atual) {
      atual.leituras += 1;
    } else {
      mapa.set(r.device_id, {
        deviceId: r.device_id,
        apelido: r.apelido,
        leituras: 1,
        ultimaEm: r.medido_em,
      });
    }
  }
  return [...mapa.values()].sort((a, b) => (a.ultimaEm! < b.ultimaEm! ? 1 : -1));
}

/**
 * Resumo das últimas `horas` de um aparelho.
 * Best-effort: nunca lança — painel que quebra por causa de gráfico é pior
 * que painel sem gráfico.
 */
export async function resumoDoAparelho(
  client: any,
  deviceId: string,
  horas = 24,
): Promise<ResumoMedicao> {
  const vazio: ResumoMedicao = {
    aparelho: null, agora: null, demanda: null, janelas: [],
    consumoDiaKwh: null, injecaoDiaKwh: null, minutosSemReceber: null,
  };
  try {
    const desde = new Date(Date.now() - horas * 60 * 60 * 1000).toISOString();
    const { data, error } = await client
      .from('medicoes_shelly')
      .select('device_id, apelido, medido_em, potencia_w, tensao, corrente, fator_potencia, energia_wh, energia_devolvida_wh')
      .eq('device_id', deviceId)
      .gte('medido_em', desde)
      .order('medido_em', { ascending: true })
      .limit(5000);
    if (error) { console.warn('[medicao] resumoDoAparelho:', error.message); return vazio; }

    const linhas = (data ?? []) as Array<{
      device_id: string; apelido: string | null; medido_em: string;
      potencia_w: number; tensao: number | null; corrente: number | null;
      fator_potencia: number | null; energia_wh: number | null; energia_devolvida_wh: number | null;
    }>;
    if (linhas.length === 0) return vazio;

    const ultima = linhas[linhas.length - 1];
    const paraJanela = linhas.map((l) => ({ medidoEm: l.medido_em, potenciaW: Number(l.potencia_w) }));

    // Energia é contador ACUMULADO do aparelho: o consumo do período é a
    // diferença entre o fim e o começo, não a soma das leituras.
    const kwhDoPeriodo = (campo: 'energia_wh' | 'energia_devolvida_wh'): number | null => {
      const comValor = linhas.filter((l) => l[campo] !== null && l[campo] !== undefined);
      if (comValor.length < 2) return null;
      const dif = Number(comValor[comValor.length - 1][campo]) - Number(comValor[0][campo]);
      // Contador que "anda pra trás" = aparelho reiniciado. Melhor não mostrar
      // do que mostrar número negativo de consumo.
      return dif >= 0 ? dif / 1000 : null;
    };

    const minutos = Math.round((Date.now() - new Date(ultima.medido_em).getTime()) / 60000);

    return {
      aparelho: {
        deviceId: ultima.device_id,
        apelido: ultima.apelido,
        leituras: linhas.length,
        ultimaEm: ultima.medido_em,
      },
      agora: {
        potenciaW: Number(ultima.potencia_w),
        tensao: ultima.tensao === null ? null : Number(ultima.tensao),
        corrente: ultima.corrente === null ? null : Number(ultima.corrente),
        fatorPotencia: ultima.fator_potencia === null ? null : Number(ultima.fator_potencia),
        medidoEm: ultima.medido_em,
      },
      demanda: demandaMaxima(paraJanela),
      janelas: janelasDe15Minutos(paraJanela),
      consumoDiaKwh: kwhDoPeriodo('energia_wh'),
      injecaoDiaKwh: kwhDoPeriodo('energia_devolvida_wh'),
      minutosSemReceber: minutos,
    };
  } catch (err) {
    console.warn('[medicao] resumoDoAparelho falhou (segue vazio):', (err as Error)?.message);
    return vazio;
  }
}
