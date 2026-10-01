// Rotina do Previsto × Real: para cada usina ativa de empresa que CONTRATOU o
// módulo `previsto_real`, pergunta ao motor quanto ela deveria ter gerado em
// cada data e grava em `geracao_esperada` (uma linha por usina e dia).
// Idempotente (upsert por sistema_id+data) — pode rodar de novo sem duplicar.
import type { SupabaseClient } from '@supabase/supabase-js';
import { montarPremissas, type SistemaCadastro, type MotivoSemPremissa } from './premissas.js';
import { previstoDoDia, type ConfigMotor } from './motor-cliente.js';

export interface DepsRotina {
  motor: ConfigMotor;
  /** A empresa contratou o módulo previsto_real? (casa = sempre sim) */
  empresaTemModulo: (companyId: string) => Promise<boolean>;
  concorrencia?: number;
  log?: (msg: string) => void;
}

export interface ResumoRotina {
  datas: string[];
  usinas: number;
  calculados: number;
  semModulo: number;
  semPremissa: Record<MotivoSemPremissa, number>;
  falhas: number;
  primeiraFalha?: string;
}

const COLUNAS = 'id, company_id, potencia_kwp, lat, lng, telhado_tipo, telhado_orientacao, telhado_inclinacao_graus, sombreamento_pct';

export async function calcularPrevistos(db: SupabaseClient, datas: string[], deps: DepsRotina): Promise<ResumoRotina> {
  const log = deps.log ?? ((m: string) => console.log(m));
  const resumo: ResumoRotina = { datas, usinas: 0, calculados: 0, semModulo: 0, semPremissa: { sem_posicao: 0, sem_kwp: 0 }, falhas: 0 };

  const { data, error } = await db.from('sistemas_clientes').select(COLUNAS).eq('ativo', true);
  if (error) throw new Error(`previsto: lendo usinas: ${error.message}`);
  const sistemas = (data ?? []) as SistemaCadastro[];

  // Módulo por empresa (1 consulta por empresa, não por usina).
  const contratou = new Map<string, boolean>();
  for (const cid of new Set(sistemas.map((s) => s.company_id))) {
    try { contratou.set(cid, await deps.empresaTemModulo(cid)); } catch { contratou.set(cid, false); }
  }

  const tarefas: Array<() => Promise<void>> = [];
  for (const s of sistemas) {
    if (!contratou.get(s.company_id)) { resumo.semModulo++; continue; }
    resumo.usinas++;
    const p = montarPremissas(s);
    if ('erro' in p) { resumo.semPremissa[p.erro]++; continue; }
    for (const dataDia of datas) {
      tarefas.push(async () => {
        try {
          const r = await previstoDoDia(deps.motor, p, dataDia);
          const { error: e } = await db.from('geracao_esperada').upsert({
            sistema_id: s.id, company_id: s.company_id, data: dataDia,
            kwh_previsto: r.kwh, kwh_hora: r.kwh_hora,
            irradiacao_kwh_m2: r.ghi_kwh_m2, irradiacao_plano_kwh_m2: r.poa_kwh_m2,
            indice_ceu: r.indice_ceu, clima: r.clima,
            premissas: { ...p, horas_sem_dado: r.horas_sem_dado },
            fonte_clima: r.fonte_clima, versao_modelo: r.versao_modelo,
            calculado_em: new Date().toISOString(),
          }, { onConflict: 'sistema_id,data' });
          if (e) throw new Error(e.message);
          resumo.calculados++;
        } catch (err) {
          resumo.falhas++;
          resumo.primeiraFalha ??= `${s.id} ${dataDia}: ${(err as Error).message}`;
        }
      });
    }
  }

  // Poucas chamadas simultâneas: o motor reaproveita o clima de usinas vizinhas.
  const n = Math.max(1, deps.concorrencia ?? 4);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, tarefas.length) }, async () => {
    while (i < tarefas.length) await tarefas[i++]();
  }));

  log(`[previsto] ${datas.join(',')}: ${resumo.calculados} calculados · ${resumo.usinas} usinas no módulo · ` +
    `sem posição ${resumo.semPremissa.sem_posicao} · sem kWp ${resumo.semPremissa.sem_kwp} · falhas ${resumo.falhas}` +
    (resumo.primeiraFalha ? ` (1ª: ${resumo.primeiraFalha})` : ''));
  return resumo;
}

/** Datas (YYYY-MM-DD, horário de Brasília) de hoje para trás. */
export function ultimosDias(n: number, agora: Date = new Date()): string[] {
  const brt = new Date(agora.getTime() - 3 * 3600_000);
  return Array.from({ length: n }, (_, k) => new Date(brt.getTime() - k * 86400_000).toISOString().slice(0, 10)).reverse();
}
