export interface WeeklyData {
  creatives: Array<{ id: number; name: string; ctr: number; leads: number; conversations: number }>;
  campaigns: Array<{ id: number; codigo_portfolio: string; name: string; leads: number; spend_cents: number }>;
  leads_by_day: Array<{ day_of_week: number; count: number }>;
  leads_by_persona: Record<string, number>;
}

export interface Pattern {
  tipo: 'ctr_alto_conv_baixa' | 'categoria_sem_lead' | 'concentracao_dia' | 'descarte_alto';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  recommendation: string;
}

const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

export function detectPatterns(data: WeeklyData): Pattern[] {
  const patterns: Pattern[] = [];

  for (const c of data.creatives) {
    const conv_rate = c.leads > 0 ? c.conversations / c.leads : 0;
    if (c.ctr > 1.5 && conv_rate < 0.3) {
      patterns.push({
        tipo: 'ctr_alto_conv_baixa',
        severity: 'warning',
        message: `Criativo "${c.name}" tem CTR alto (${c.ctr.toFixed(1)}%) mas só ${(conv_rate * 100).toFixed(0)}% viram conversa.`,
        recommendation: 'Imagem chama atenção mas copy não converte. Reformular copy mantendo a mesma imagem.',
      });
    }
  }

  for (const camp of data.campaigns) {
    if (camp.spend_cents > 30000 && camp.leads === 0) {
      patterns.push({
        tipo: 'categoria_sem_lead',
        severity: 'warning',
        message: `Campanha "${camp.name}" gastou R$ ${(camp.spend_cents / 100).toFixed(2)} sem nenhum lead.`,
        recommendation: 'Pausar campanha ou reformular criativo+targeting completo.',
      });
    }
  }

  if (data.leads_by_day.length > 0) {
    const total = data.leads_by_day.reduce((s, d) => s + d.count, 0);
    const max = data.leads_by_day.reduce((a, b) => (a.count > b.count ? a : b));
    if (total > 5 && max.count / total > 0.5) {
      const dayName = DAY_NAMES[max.day_of_week] ?? `dia ${max.day_of_week}`;
      patterns.push({
        tipo: 'concentracao_dia',
        severity: 'info',
        message: `${dayName} concentrou ${((max.count / total) * 100).toFixed(0)}% dos leads da semana.`,
        recommendation: `Considerar aumentar budget de ${dayName} e reduzir nos demais dias.`,
      });
    }
  }

  return patterns;
}
