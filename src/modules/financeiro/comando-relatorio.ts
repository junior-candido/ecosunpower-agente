// src/modules/financeiro/comando-relatorio.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { getRelatorioMensal, montarRelatorioMensal } from './relatorio-mensal.js';

const MESES: Record<string, number> = {
  jan: 1, janeiro: 1, fev: 2, fevereiro: 2, mar: 3, marco: 3, 'março': 3,
  abr: 4, abril: 4, mai: 5, maio: 5, jun: 6, junho: 6, jul: 7, julho: 7,
  ago: 8, agosto: 8, set: 9, setembro: 9, out: 10, outubro: 10,
  nov: 11, novembro: 11, dez: 12, dezembro: 12,
};

export function parseRelatorioComando(texto: string, hojeYYYYMM: string): { competencia: string } | null {
  const t = texto.trim().toLowerCase();
  const m = t.match(/^\/?relat[óo]rio\b(.*)$/);
  if (!m) return null;
  const resto = m[1].trim().replace(/^de\s+/, '');
  const [anoAtual, mesAtual] = hojeYYYYMM.split('-').map(Number);
  if (!resto) return { competencia: hojeYYYYMM };
  const iso = resto.match(/^(\d{4})-(\d{2})$/);
  if (iso) return { competencia: `${iso[1]}-${iso[2]}` };
  const num = resto.match(/^(\d{1,2})$/);
  let mes: number | undefined;
  if (num) { const n = Number(num[1]); if (n >= 1 && n <= 12) mes = n; }
  else { mes = MESES[resto.split(/\s+/)[0]]; }
  if (!mes) return { competencia: hojeYYYYMM };
  const ano = mes > mesAtual ? anoAtual - 1 : anoAtual;
  return { competencia: `${ano}-${String(mes).padStart(2, '0')}` };
}

export function makeRelatorioHandler(
  client: SupabaseClient,
  isAdminPhone: (p: string) => boolean,
  sendText: (to: string, body: string) => Promise<unknown>,
) {
  const hojeBRT = (): string => new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 7);
  return async function tryHandleRelatorioCommand(from: string, text: string): Promise<boolean> {
    if (!isAdminPhone(from)) return false;
    const parsed = parseRelatorioComando(text, hojeBRT());
    if (!parsed) return false;
    try {
      const data = await getRelatorioMensal(client, parsed.competencia);
      await sendText(from, montarRelatorioMensal(data));
    } catch (err) {
      console.error('[relatorio] falhou:', (err as Error).message);
      await sendText(from, '⚠️ Não consegui gerar o relatório agora. Tenta de novo daqui a pouco.');
    }
    return true;
  };
}
