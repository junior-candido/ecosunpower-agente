// Calibração automática (Energy Studio, Marco 1 — 02/10/2026).
// De madrugada, poucas usinas por vez: pega até 4 dias de CÉU LIMPO recentes
// (do próprio Previsto × Real), busca a curva real hora a hora no portal do
// inversor e pede ao motor a orientação/inclinação que reproduz a forma.
// Devagar de propósito: os portais (GoodWe, SolarEdge…) têm limite de consulta.
import type { SupabaseClient } from '@supabase/supabase-js';
import { ECOSUN_COMPANY_ID } from '../../tenant-resolver.js';
import { azimuteDeOrientacao, montarPremissas, type SistemaCadastro } from './premissas.js';
import { calibrarNoMotor, type ConfigMotor } from './motor-cliente.js';

export interface SistemaCalib extends SistemaCadastro {
  marca_inversor: string;
}

export interface DepsCalibracao {
  motor: ConfigMotor;
  empresaTemModulo: (companyId: string) => Promise<boolean>;
  /** Curva real (kWh por hora 0..23) do dia no portal do inversor; null = não deu. */
  buscarCurva: (sistemaId: string, data: string) => Promise<number[] | null>;
  /** Máximo de usinas por rodada (padrão 8). */
  maxUsinas?: number;
  /** Recalibra depois de N dias (padrão 30). */
  validadeDias?: number;
  agora?: Date;
  pausa?: (ms: number) => Promise<void>;
  log?: (m: string) => void;
}

export interface ResumoCalibracao { tentadas: number; ok: number; semCurva: number; semDias: number; erros: number; calibradas: string[] }

const COLS = 'id, company_id, potencia_kwp, lat, lng, telhado_tipo, telhado_orientacao, telhado_inclinacao_graus, sombreamento_pct, marca_inversor';

export async function calibrarUsinas(db: SupabaseClient, deps: DepsCalibracao): Promise<ResumoCalibracao> {
  const agora = deps.agora ?? new Date();
  const log = deps.log ?? ((m: string) => console.log(m));
  const pausa = deps.pausa ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const validade = deps.validadeDias ?? 30;
  const resumo: ResumoCalibracao = { tentadas: 0, ok: 0, semCurva: 0, semDias: 0, erros: 0, calibradas: [] };

  const sistemas: SistemaCalib[] = [];
  for (let pag = 0; ; pag++) {
    const { data, error } = await db.from('sistemas_clientes').select(COLS).eq('ativo', true)
      .order('id', { ascending: true }).range(pag * 1000, pag * 1000 + 999);
    if (error) throw new Error(`calibração: lendo usinas: ${error.message}`);
    const rows = (data ?? []) as SistemaCalib[];
    for (const r of rows) sistemas.push({ ...r, company_id: r.company_id ?? ECOSUN_COMPANY_ID });
    if (rows.length < 1000) break;
  }

  // Última calibração de cada uma (ok: vale `validade` dias; sem sucesso: tenta de novo em 7).
  const ultima = new Map<string, { status: string; em: number }>();
  for (let pag = 0; ; pag++) {
    const { data: cs, error } = await db.from('previsto_calibracao').select('sistema_id, status, calculado_em')
      .order('sistema_id', { ascending: true }).range(pag * 1000, pag * 1000 + 999);
    if (error) throw new Error(`calibração: lendo calibrações: ${error.message}`);
    const rows = (cs ?? []) as Array<{ sistema_id: string; status: string; calculado_em: string }>;
    for (const c of rows) ultima.set(c.sistema_id, { status: c.status, em: Date.parse(c.calculado_em) });
    if (rows.length < 1000) break;
  }
  const venceu = (id: string) => {
    const u = ultima.get(id);
    if (!u) return true;
    const dias = (agora.getTime() - u.em) / 86400_000;
    // ok: vale `validade` dias · erro (motor/portal fora): tenta na noite seguinte · sem curva/dias limpos: 7 dias
    return dias >= (u.status === 'ok' ? validade : u.status === 'erro' ? 0.9 : 7);
  };

  const contratou = new Map<string, boolean>();
  const fila: SistemaCalib[] = [];
  for (const s of sistemas) {
    if (!venceu(s.id)) continue;
    if (!contratou.has(s.company_id)) {
      try { contratou.set(s.company_id, await deps.empresaTemModulo(s.company_id)); } catch { contratou.set(s.company_id, false); }
    }
    if (contratou.get(s.company_id) && !('erro' in montarPremissas(s))) fila.push(s);
  }
  // Nunca calibradas primeiro.
  fila.sort((a, b) => Number(ultima.has(a.id)) - Number(ultima.has(b.id)));

  const desde = new Date(agora.getTime() - 3 * 3600_000 - 30 * 86400_000).toISOString().slice(0, 10);
  for (const s of fila.slice(0, deps.maxUsinas ?? 8)) {
    resumo.tentadas++;
    const gravar = async (linha: Record<string, unknown>) => {
      const { error } = await db.from('previsto_calibracao').upsert(
        { sistema_id: s.id, company_id: s.company_id, calculado_em: new Date().toISOString(), ...linha }, { onConflict: 'sistema_id' });
      if (error) throw new Error(`gravando calibração: ${error.message}`);
    };
    try {
      // Dias de céu limpo com geração real, mais recentes primeiro.
      const { data: dias } = await db.from('geracao_esperada').select('data, indice_ceu')
        .eq('sistema_id', s.id).eq('clima', 'limpo').gte('data', desde).order('data', { ascending: false }).limit(8);
      const candidatos = ((dias ?? []) as Array<{ data: string; indice_ceu: number | null }>)
        .filter((d) => (d.indice_ceu ?? 0) >= 0.75).map((d) => d.data);
      if (candidatos.length < 2) {
        resumo.semDias++;
        await gravar({ status: 'sem_dias_limpos', motivo: `${candidatos.length} dia(s) de céu limpo nos últimos 30` });
        continue;
      }
      const curvas: { data: string; real_hora: number[] }[] = [];
      for (const d of candidatos) {
        if (curvas.length >= 4) break;
        const c = await deps.buscarCurva(s.id, d); // limite do portal LANÇA → status erro (tenta na noite seguinte)
        if (c && c.some((v) => v > 0)) curvas.push({ data: d, real_hora: c });
        await pausa(3000); // gentil com o portal do inversor
      }
      if (curvas.length < 2) {
        resumo.semCurva++;
        await gravar({ status: 'sem_curva', motivo: `portal ${s.marca_inversor} não devolveu a curva hora a hora` });
        continue;
      }
      const p = montarPremissas(s);
      if ('erro' in p) continue;
      const cadAz = azimuteDeOrientacao(s.telhado_orientacao);
      const r = await calibrarNoMotor(deps.motor, {
        lat: p.lat, lon: p.lon, kwp: p.kwp, tipo_instalacao: p.tipo_instalacao,
        refAzimute: cadAz ?? 0, refInclinacao: p.inclinacao,
      }, curvas);
      const fator = Number.isFinite(r.fator) && r.fator > 0 && r.fator < 10 ? r.fator : null; // kWp absurdo no cadastro não estoura a coluna
      await gravar({
        status: 'ok', motivo: null, azimute: r.azimute, inclinacao: r.inclinacao, fator,
        erro_forma: r.erro_forma, erro_referencia: r.erro_referencia, confianca: r.confianca,
        dias_usados: r.dias_usados, datas: curvas.map((c) => c.data), mapa: r.mapa, versao_modelo: r.versao_modelo,
      });
      resumo.ok++;
      // Só vale refazer o previsto se a calibração MUDA as premissas (alta + cadastro incompleto).
      const faltaNoCadastro = cadAz == null || s.telhado_inclinacao_graus == null;
      if (r.confianca === 'alta' && faltaNoCadastro) resumo.calibradas.push(s.id);
    } catch (err) {
      const msg = String((err as Error).message);
      // 422 do motor (curva curta/inválida) é permanente: espera 7 dias, não toda noite.
      const permanente = /motor HTTP 422/.test(msg);
      if (permanente) resumo.semCurva++; else resumo.erros++;
      await gravar({ status: permanente ? 'sem_curva' : 'erro', motivo: msg.slice(0, 300) }).catch(() => undefined);
    }
  }
  log(`[calibração] ${resumo.tentadas} tentadas · ${resumo.ok} ok · sem dias limpos ${resumo.semDias} · sem curva ${resumo.semCurva} · erros ${resumo.erros} · fila ${fila.length}`);
  return resumo;
}
