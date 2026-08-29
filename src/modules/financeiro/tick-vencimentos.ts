// src/modules/financeiro/tick-vencimentos.ts
// Tick horário que só age às 8h (BRT): gera as parcelas do mês (dias 01/02), manda os
// alertas de contas a pagar (3d / hoje / atraso) com botão "Paguei" e a escada do DAS
// (prévia dia -8 / faltam 2). Dedupe: registrarLembrete grava o tipo enviado na conta.
import type { SupabaseClient } from '@supabase/supabase-js';
import { getContasAbertas, registrarLembrete, gerarParcelasDoMes } from './contas-pagar.js';
import { alertasDoDia, escalonarDas, ehDas } from './alertas-vencimento.js';

export interface TickVencDeps {
  client: SupabaseClient;
  adminPhone: string;
  hoje: () => string; // AAAA-MM-DD em BRT
  enviarComBotoes: (to: string, body: string, buttons: Array<{ id: string; title: string }>, footer?: string) => Promise<void>;
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

// PURO: BRT = UTC-3 → 8h BRT é 11h UTC.
export function dentroDaJanela8h(agora: Date): boolean {
  return (agora.getUTCHours() + 21) % 24 === 8;
}

export async function tickVencimentos(d: TickVencDeps, agora = new Date()): Promise<void> {
  if (!dentroDaJanela8h(agora)) return;
  const hoje = d.hoje();
  if (hoje.endsWith('-01') || hoje.endsWith('-02')) {
    try { await gerarParcelasDoMes(d.client, hoje.slice(0, 7)); }
    catch (err) { console.error('[fin-vencimentos] gerarParcelasDoMes falhou:', (err as Error).message); }
  }

  const contas = await getContasAbertas(d.client);
  for (const a of alertasDoDia(contas, hoje)) {
    const c = contas.find((x) => x.id === a.contaId);
    if (!c) continue;
    let texto = a.texto;
    if (ehDas(c) && escalonarDas(hoje, c.vencimento) === 'atraso') {
      texto = `🔴🔴 DAS ATRASADO há ${a.dias} dia(s): ${c.descricao}. Multa 0,33 %/dia. Emite guia nova no PGDAS-D e paga HOJE.`;
    }
    // Falha numa conta (envio ou gravação) não derruba as outras.
    try {
      await d.enviarComBotoes(d.adminPhone, texto, [
        { id: `finpg:paguei:${c.id}`, title: 'Paguei' },
        { id: `finpg:ver:${c.id}`, title: 'Ver depois' },
      ], 'Financeiro · vencimentos');
      await registrarLembrete(d.client, c.id, a.tipo, hoje);
    } catch (err) {
      console.error(`[fin-vencimentos] conta ${c.id} falhou:`, (err as Error).message);
    }
  }

  // DAS: prévia (8 dias antes) e faltam-2 — fora da regra 3d/hoje; um envio por fase.
  for (const c of contas.filter(ehDas)) {
    const fase = escalonarDas(hoje, c.vencimento);
    if (fase !== 'previa' && fase !== 'faltam2') continue;
    if (c.lembretes.some((l) => l.tipo === fase)) continue;
    const texto = fase === 'previa'
      ? `📅 DAS ${c.descricao}: vence ${dBR(c.vencimento)} — previsto ${brl(c.valor)}. Já separou?`
      : `⏰ Faltam 2 dias pro DAS (${brl(c.valor)}).`;
    try {
      await d.enviarComBotoes(d.adminPhone, texto, [{ id: 'finpg:noop:0', title: 'OK' }], 'Financeiro · DAS');
      await registrarLembrete(d.client, c.id, fase, hoje);
    } catch (err) {
      console.error(`[fin-vencimentos] conta ${c.id} falhou:`, (err as Error).message);
    }
  }
}
