// Rotina do Previsto × Real: para cada usina ativa de empresa que CONTRATOU o
// módulo `previsto_real`, pergunta ao motor quanto ela deveria ter gerado em
// cada data e grava em `geracao_esperada` (uma linha por usina e dia).
// Idempotente (upsert por sistema_id+data) — pode rodar de novo sem duplicar.
import type { SupabaseClient } from '@supabase/supabase-js';
import { montarPremissas, type SistemaCadastro, type MotivoSemPremissa, type CalibracaoUsina } from './premissas.js';
import { previstoDoDiaTotal, type ConfigMotor } from './motor-cliente.js';
import { ECOSUN_COMPANY_ID } from '../../tenant-resolver.js';

/** Para tudo depois de tantas falhas SEGUIDAS (motor fora / senha errada / limite do clima). */
export const LIMITE_FALHAS_SEGUIDAS = 15;

export interface DepsRotina {
  motor: ConfigMotor;
  /** A empresa contratou o módulo previsto_real? (casa = sempre sim) */
  empresaTemModulo: (companyId: string) => Promise<boolean>;
  concorrencia?: number;
  log?: (msg: string) => void;
  /** Só estas usinas (ex.: recém-calibradas). */
  apenas?: ReadonlySet<string>;
}

export interface ResumoRotina {
  datas: string[];
  usinas: number;
  calculados: number;
  semModulo: number;
  semPremissa: Record<MotivoSemPremissa, number>;
  falhas: number;
  /** Tarefas não tentadas porque o disjuntor abriu. */
  puladas: number;
  /** Rodada boa o bastante para dar o dia por feito (≤ 10% de falha, nada pulado). */
  ok: boolean;
  primeiraFalha?: string;
}

const COLUNAS = 'id, company_id, potencia_kwp, lat, lng, telhado_tipo, telhado_orientacao, telhado_inclinacao_graus, sombreamento_pct, arranjos';

export async function calcularPrevistos(db: SupabaseClient, datas: string[], deps: DepsRotina): Promise<ResumoRotina> {
  const log = deps.log ?? ((m: string) => console.log(m));
  const resumo: ResumoRotina = { datas, usinas: 0, calculados: 0, semModulo: 0, semPremissa: { sem_posicao: 0, sem_kwp: 0 }, falhas: 0, puladas: 0, ok: false };

  // Paginado: o PostgREST corta em 1000 linhas (carteira Jimena tem ~1,3 mil).
  const sistemas: SistemaCadastro[] = [];
  // Sem a migration 155 (coluna arranjos), segue sem multi-arranjo em vez de quebrar.
  let colunasUsina = COLUNAS;
  {
    const t = await db.from('sistemas_clientes').select('arranjos').limit(1);
    if (t.error && /arranjos/.test(t.error.message)) colunasUsina = COLUNAS.replace(', arranjos', '');
  }
  for (let pag = 0; ; pag++) {
    const { data, error } = await db.from('sistemas_clientes').select(colunasUsina).eq('ativo', true)
      .order('id', { ascending: true }).range(pag * 1000, pag * 1000 + 999);
    if (error) throw new Error(`previsto: lendo usinas: ${error.message}`);
    const rows = (data ?? []) as unknown as SistemaCadastro[];
    // Linha antiga sem empresa = da casa (regra do filtro-empresa).
    for (const r of rows) sistemas.push({ ...r, company_id: r.company_id ?? ECOSUN_COMPANY_ID });
    if (rows.length < 1000) break;
  }

  // Calibração automática (orientação/inclinação pela curva real) — bônus: sem tabela/erro, segue sem.
  const calibs = new Map<string, CalibracaoUsina>();
  try {
    for (let pag = 0; ; pag++) {
      const { data: cs, error: ec } = await db.from('previsto_calibracao').select('sistema_id, azimute, inclinacao, confianca')
        .eq('status', 'ok').order('sistema_id', { ascending: true }).range(pag * 1000, pag * 1000 + 999);
      if (ec) break;
      const rows = (cs ?? []) as Array<{ sistema_id: string; azimute: number | string; inclinacao: number | string; confianca: CalibracaoUsina['confianca'] }>;
      for (const c of rows) calibs.set(c.sistema_id, { azimute: Number(c.azimute), inclinacao: Number(c.inclinacao), confianca: c.confianca });
      if (rows.length < 1000) break;
    }
  } catch { /* sem calibração: usa cadastro/estimativa */ }

  // Módulo por empresa (1 consulta por empresa, não por usina).
  const contratou = new Map<string, boolean>();
  for (const cid of new Set(sistemas.map((s) => s.company_id))) {
    try { contratou.set(cid, await deps.empresaTemModulo(cid)); } catch { contratou.set(cid, false); }
  }

  const tarefas: Array<() => Promise<void>> = [];
  let seguidas = 0;
  for (const s of sistemas) {
    if (deps.apenas && !deps.apenas.has(s.id)) continue;
    if (!contratou.get(s.company_id)) { resumo.semModulo++; continue; }
    resumo.usinas++;
    const p = montarPremissas(s, calibs.get(s.id));
    if ('erro' in p) { resumo.semPremissa[p.erro]++; continue; }
    for (const dataDia of datas) {
      tarefas.push(async () => {
        if (seguidas >= LIMITE_FALHAS_SEGUIDAS) { resumo.puladas++; return; }
        try {
          const r = await previstoDoDiaTotal(deps.motor, p, dataDia);
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
          seguidas = 0;
        } catch (err) {
          resumo.falhas++;
          seguidas++;
          resumo.primeiraFalha ??= `${s.id} ${dataDia}: ${(err as Error).message}`;
        }
      });
    }
  }

  // Poucas chamadas simultâneas: o motor reaproveita o clima de usinas vizinhas.
  const n = Math.max(1, deps.concorrencia ?? 2);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, tarefas.length) }, async () => {
    while (i < tarefas.length) await tarefas[i++]();
  }));

  const tentadas = resumo.calculados + resumo.falhas;
  resumo.ok = resumo.puladas === 0 && (tentadas === 0 || resumo.falhas / tentadas <= 0.1);
  log(`[previsto] ${datas[0]}…${datas[datas.length - 1]}: ${resumo.ok ? 'OK' : 'INCOMPLETO (repete na próxima hora)'} · ${resumo.calculados} calculados · ${resumo.usinas} usinas no módulo · ` +
    `sem posição ${resumo.semPremissa.sem_posicao} · sem kWp ${resumo.semPremissa.sem_kwp} · falhas ${resumo.falhas} · puladas ${resumo.puladas}` +
    (resumo.primeiraFalha ? ` (1ª: ${resumo.primeiraFalha})` : ''));
  return resumo;
}

/** Datas (YYYY-MM-DD, horário de Brasília) de hoje para trás. */
export function ultimosDias(n: number, agora: Date = new Date()): string[] {
  const brt = new Date(agora.getTime() - 3 * 3600_000);
  return Array.from({ length: n }, (_, k) => new Date(brt.getTime() - k * 86400_000).toISOString().slice(0, 10)).reverse();
}
