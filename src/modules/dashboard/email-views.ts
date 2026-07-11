// src/modules/dashboard/email-views.ts
// View da aba E-mail Marketing (sob o setor Marketing). Mostra as métricas da
// sequência de e-mail (contadas a partir de eventos_elo) e o botão pra
// ligar/pausar o envio automático. Espelha blog-views.ts.

import { escapeHtml } from './views.js';

export function resumirMetricas(eventos: Array<{ tipo: string }>) {
  const c = (t: string) => eventos.filter((e) => e.tipo === t).length;
  return {
    enviados: c('email_enviado'),
    abertos: c('email_aberto'),
    clicados: c('email_clicado'),
    quentes: c('lead_quente_email'),
    descadastros: c('email_descadastro'),
  };
}

export function renderEmailPage(m: ReturnType<typeof resumirMetricas>, ligado: boolean): string {
  const card = (rot: string, v: number) => `
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;min-width:130px">
      <div style="color:#64748b;font-size:12px">${escapeHtml(rot)}</div>
      <div style="color:#0f172a;font-size:28px;font-weight:700">${v}</div>
    </div>`;
  const taxaAb = m.enviados ? Math.round((m.abertos / m.enviados) * 100) : 0;

  const statusBadge = ligado
    ? `<span style="background:#064e3b;color:#d1fae5;border-radius:999px;padding:3px 12px;font-weight:600;font-size:13px">🟢 ligada</span>`
    : `<span style="background:#450a0a;color:#fecaca;border-radius:999px;padding:3px 12px;font-weight:600;font-size:13px">⏸️ pausada</span>`;

  return `
  <div style="max-width:920px;margin:0 auto">
    <h1 style="font-size:24px;font-weight:700;color:#0f172a;margin-bottom:6px">✉️ E-mail Marketing</h1>
    <p style="color:#64748b;margin-bottom:16px">Sequência que nutre e converte lead frio por e-mail · status: ${statusBadge}</p>

    <div style="display:flex;gap:12px;flex-wrap:wrap;margin:16px 0 24px">
      ${card('Enviados', m.enviados)}
      ${card(`Abertos (${taxaAb}%)`, m.abertos)}
      ${card('Clicados', m.clicados)}
      ${card('🔥 Quentes', m.quentes)}
      ${card('Descadastros', m.descadastros)}
    </div>

    <form method="POST" action="/dashboard/marketing/email/${ligado ? 'pausar' : 'ligar'}" style="margin:0">
      <button type="submit" style="background:${ligado ? '#fff' : '#16a34a'};color:${ligado ? '#b91c1c' : '#fff'};border:${ligado ? '1px solid #fecaca' : '0'};border-radius:10px;padding:10px 18px;font-weight:700;font-size:14px;cursor:pointer">
        ${ligado ? '⏸️ Pausar sequência' : '▶️ Ligar sequência'}
      </button>
    </form>
  </div>`;
}
