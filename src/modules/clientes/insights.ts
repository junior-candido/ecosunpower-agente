// src/modules/clientes/insights.ts
import type { ClienteDetail, InsightCard } from './types.js';

export function getEvaInsights(detail: Partial<ClienteDetail>, hoje: Date): InsightCard[] {
  const out: InsightCard[] = [];
  const ctaDisponivel = !detail.opt_out;

  // Card 1: Upgrade
  const cm = detail.consumo_mensal_json;
  if (cm && typeof cm === 'object') {
    const meses = Object.keys(cm).sort().slice(-3);
    if (meses.length === 3) {
      const valores = meses.map((m) => cm[m]).filter((v): v is number => typeof v === 'number');
      if (valores.length === 3) {
        const variacao = (valores[2] - valores[0]) / valores[0];
        if (variacao >= 0.25) {
          out.push({
            id: 'upgrade',
            texto: `Conta de luz +${Math.round(variacao * 100)}% nos últimos 3 meses. Provável demanda nova.`,
            cta: ctaDisponivel ? { label: '▶ Propor upgrade', action: 'criar_proposta_upgrade', params: {} } : null,
          });
        }
      }
    }
  }

  // Card 2: Depoimento
  if (detail.sistema && detail.sistema.ratio_ultimos_7d > 1.1 && detail.installed_at && !detail.review_confirmed_at) {
    const installedDate = new Date(detail.installed_at);
    const diasInstalado = (hoje.getTime() - installedDate.getTime()) / (1000 * 60 * 60 * 24);
    if (diasInstalado > 60) {
      out.push({
        id: 'depoimento',
        texto: `Sistema gerando ${Math.round(detail.sistema.ratio_ultimos_7d * 100)}% do esperado. Momento de pedir depoimento.`,
        cta: ctaDisponivel ? { label: '▶ Eva pedir', action: 'eva_pedir_depoimento', params: {} } : null,
      });
    }
  }

  // Card 3: Aniversário
  if (detail.installed_at) {
    const installedDate = new Date(detail.installed_at);
    const mesmoMes = installedDate.getUTCMonth() === hoje.getUTCMonth();
    const anoMaior = hoje.getUTCFullYear() > installedDate.getUTCFullYear();
    if (mesmoMes && anoMaior) {
      const anos = hoje.getUTCFullYear() - installedDate.getUTCFullYear();
      const jaTemLembrete = (detail.manutencoes_futuras ?? []).some(
        (m) => m.topic === `aniversario_${anos}a`,
      );
      if (!jaTemLembrete) {
        out.push({
          id: 'aniversario',
          texto: `Aniversário ${anos} ano${anos > 1 ? 's' : ''} de sistema este mês. Programar revisão preventiva.`,
          cta: ctaDisponivel ? { label: '▶ Agendar revisão', action: 'agendar_revisao_aniversario', params: { anos } } : null,
        });
      }
    }
  }

  return out;
}
