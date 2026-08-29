// src/modules/financeiro/alertas-vencimento.ts
// PURO: regras de alerta de contas a pagar (3 dias antes / no dia / atrasada todo dia) e escalada do DAS.
export interface ContaAberta { id: string; descricao: string; valor: number; vencimento: string; mundo: 'PJ' | 'PF'; lembretes: Array<{ tipo: string; em: string }>; categoria_slug?: string | null }
// DAS é decidido pela categoria; sem categoria, cai no nome (palavra inteira, maiúscula — "das salas" não conta).
export function ehDas(c: { descricao: string; categoria_slug?: string | null }): boolean {
  if (c.categoria_slug != null) return c.categoria_slug === 'imposto_das';
  return /\bDAS\b/.test(c.descricao);
}
export interface AlertaVenc { contaId: string; tipo: '3d' | 'hoje' | 'atraso'; dias: number; texto: string }
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
// Datas ISO (AAAA-MM-DD) comparadas em UTC — sem fuso, sem hora.
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

export function alertasDoDia(contas: ContaAberta[], hojeIso: string): AlertaVenc[] {
  const out: AlertaVenc[] = [];
  for (const c of contas) {
    const d = diasEntre(hojeIso, c.vencimento); // >0 futuro, 0 hoje, <0 atrasada
    let tipo: AlertaVenc['tipo'] | null = null;
    if (d === 3) tipo = '3d'; else if (d === 0) tipo = 'hoje'; else if (d < 0) tipo = 'atraso';
    if (!tipo) continue;
    if (c.lembretes.some((l) => l.tipo === tipo && l.em === hojeIso)) continue;
    const dias = Math.abs(d);
    const texto = tipo === '3d' ? `📅 Em 3 dias: ${c.descricao} — ${brl(c.valor)} (${c.mundo}) vence ${dBR(c.vencimento)}.`
      : tipo === 'hoje' ? `🔔 VENCE HOJE: ${c.descricao} — ${brl(c.valor)} (${c.mundo}).`
      : `🔴 ATRASADA há ${dias} dia(s): ${c.descricao} — ${brl(c.valor)}. Pagou? Toca em "Paguei".`;
    out.push({ contaId: c.id, tipo, dias, texto });
  }
  return out;
}
export function escalonarDas(hojeIso: string, vencIso: string): 'previa' | 'faltam2' | 'hoje' | 'atraso' | null {
  const d = diasEntre(hojeIso, vencIso);
  if (d === 8) return 'previa'; if (d === 2) return 'faltam2'; if (d === 0) return 'hoje'; if (d < 0) return 'atraso';
  return null;
}
