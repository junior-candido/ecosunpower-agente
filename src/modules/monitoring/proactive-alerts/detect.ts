// src/modules/monitoring/proactive-alerts/detect.ts
// Função PURA. Recebe sistemas + alertas abertos + hoje, retorna intenção.
// Reusa classificarSistema do módulo de monitoramento.

import { classificarSistema } from '../classificacao.js';
import type {
  DetectOutput, MonitoringAlertRow, SistemaParaDetect,
} from './types.js';

export function detectarAlertasPendentes(
  sistemas: SistemaParaDetect[],
  alertasAbertos: MonitoringAlertRow[],
  hoje: Date,
): DetectOutput {
  const out: DetectOutput = { novos: [], resolvidos: [], persistentes_devidos: [] };
  const hojeIso = hoje.toISOString();

  // Só a FAMÍLIA de geração participa deste detect. Os tipos de telemetria
  // (fase 2B) têm ciclo próprio — sem este filtro, o "mudou de natureza"
  // abaixo resolveria um tensao_rede_alta só porque a geração está ok.
  const FAMILIA_GERACAO = new Set(['sistema_offline', 'queda_geracao', 'erro_integracao', 'milestone_economia']);

  // index por sistema_id
  const abertosBySistema = new Map<string, MonitoringAlertRow[]>();
  for (const a of alertasAbertos) {
    if (a.resolved_at) continue;
    if (!FAMILIA_GERACAO.has(a.tipo)) continue;
    const arr = abertosBySistema.get(a.sistema_id) ?? [];
    arr.push(a);
    abertosBySistema.set(a.sistema_id, arr);
  }

  for (const s of sistemas) {
    const cls = s.ativo
      ? classificarSistema({
          ativo: s.ativo,
          ultimoErro: s.ultimo_erro,
          potenciaKwp: s.potencia_kwp,
          uf: s.uf,
          diasSemGeracao: s.diasSemGeracao,
          realUltimos7: s.realUltimos7,
          statusInversor: s.status_inversor ?? null,
          corteAtencao: s.corteAtencao ?? null,
          medianaCarteira7d: s.medianaCarteira7d ?? null,
        })
      : { nivel: 'ok' as const, alerta: null };

    const abertos = abertosBySistema.get(s.id) ?? [];

    if (!cls.alerta) {
      // Sem alerta agora -> resolve todos os abertos desse sistema
      for (const a of abertos) out.resolvidos.push(a.id);
      continue;
    }

    // Há alerta. Verificar se MESMO TIPO já aberto.
    const mesmoTipo = abertos.find((a) => a.tipo === cls.alerta!.tipo);
    const outrosTipos = abertos.filter((a) => a.tipo !== cls.alerta!.tipo);

    // Outros tipos abertos pra esse sistema -> resolvem (mudou de natureza)
    for (const a of outrosTipos) out.resolvidos.push(a.id);

    if (!mesmoTipo) {
      // Novo alerta desse tipo
      out.novos.push({ sistema_id: s.id, alerta: cls.alerta });
    } else {
      // Já existe aberto desse tipo -> ver se está devido
      const snoozed = mesmoTipo.snoozed_until && mesmoTipo.snoozed_until > hojeIso;
      const devido = mesmoTipo.next_send_at != null && mesmoTipo.next_send_at <= hojeIso;
      if (!snoozed && devido) out.persistentes_devidos.push(mesmoTipo.id);
    }
  }

  return out;
}
