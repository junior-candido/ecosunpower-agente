// src/modules/monitoring/proactive-alerts/anniversary.ts
import type { SupabaseService } from '../../supabase.js';

function isoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function runAnniversaryEnqueue(
  hoje: Date,
  supabase: SupabaseService,
): Promise<{ enfileirados: number }> {
  const due = await supabase.getSistemasNoAniversarioHoje(hoje);
  let enfileirados = 0;
  const scheduled_date = isoDate(hoje);
  for (const s of due) {
    if (!s.lead_id) continue;
    await supabase.upsertMaintenanceReminderPublic({
      lead_id: s.lead_id,
      scheduled_date,
      topic: `aniversario_${s.anos}a`,
    });
    enfileirados++;
  }
  console.log(`[proactive-alerts] anniversary: ${enfileirados} aniversários enfileirados pra ${scheduled_date}`);
  return { enfileirados };
}
