// src/modules/dashboard/minha-assinatura-views.ts
// Fatia 4 — "Minha assinatura": a tela do ASSINANTE (tenant). O Thiago vê a
// situação da mensalidade dele, o uso do plano (87/110 usinas), paga a
// renovação e cadastra o zap (com código) pra receber os avisos.
import { renderLayout, escapeHtml } from './views.js';
import type { DashUser } from './permissions.js';
import { situacaoDaAssinatura } from './assinaturas-store.js';
import type { AssinaturaRow } from './assinaturas-store.js';

const reais = (c: number) => (c / 100).toFixed(2).replace('.', ',');
const dataBr = (iso: string) => iso.split('-').reverse().join('/');

export function renderMinhaAssinaturaPage(
  a: AssinaturaRow | null,
  hoje: string,
  uso: number | null,
  linkPagar: string | null,
  user: DashUser | undefined,
  aviso?: { tipo: 'ok' | 'erro'; texto: string },
): string {
  const avisoHtml = aviso
    ? `<div class="mb-4 px-4 py-3 rounded-xl text-sm ${aviso.tipo === 'ok' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}">${escapeHtml(aviso.texto)}</div>`
    : '';

  let body: string;
  if (!a) {
    body = `<div class="mb-6"><h1 class="text-2xl font-bold text-slate-800">📆 Minha assinatura</h1></div>
    ${avisoHtml}
    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-xl text-slate-500">
      Nenhuma assinatura encontrada pra sua empresa. Se isso parecer errado, fale com a EcoSun.
    </div>`;
  } else {
    const sit = situacaoDaAssinatura({ status: a.status, venceEm: a.venceEm }, hoje);
    const badge = {
      ativa: '<span class="px-3 py-1 rounded-full text-sm bg-emerald-100 text-emerald-700">🟢 ativa</span>',
      vencendo: '<span class="px-3 py-1 rounded-full text-sm bg-amber-100 text-amber-700">🟡 vence em breve</span>',
      vencida: '<span class="px-3 py-1 rounded-full text-sm bg-rose-100 text-rose-700">🔴 vencida</span>',
      travada: '<span class="px-3 py-1 rounded-full text-sm bg-slate-200 text-slate-700">⛔ suspensa</span>',
      cancelada: '<span class="px-3 py-1 rounded-full text-sm bg-slate-100 text-slate-500">cancelada</span>',
    }[sit];

    const suspensaHtml = sit === 'travada'
      ? `<div class="mt-4 px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm">
          Sua assinatura está <b>suspensa</b> por falta de pagamento. Assim que o pagamento cair, tudo volta sozinho em instantes.
        </div>`
      : '';

    const usoHtml = a.limite !== null && uso !== null
      ? (() => {
          const pct = Math.min(100, Math.round((uso / a.limite!) * 100));
          const cor = uso >= a.limite! ? 'bg-rose-500' : pct >= 90 ? 'bg-amber-500' : 'bg-emerald-500';
          return `<div class="mt-4">
            <div class="flex justify-between text-sm text-slate-600 mb-1"><span>Uso do plano</span><span><b>${uso}</b> de <b>${a.limite}</b> usinas</span></div>
            <div class="w-full h-3 rounded-full bg-slate-100 overflow-hidden"><div class="h-3 ${cor}" style="width:${pct}%"></div></div>
            ${uso >= a.limite! ? '<p class="text-xs text-rose-600 mt-1">Limite do plano atingido — fale com a EcoSun pra ampliar (liberamos na hora).</p>' : pct >= 90 ? '<p class="text-xs text-amber-600 mt-1">Chegando perto do limite do plano.</p>' : ''}
          </div>`;
        })()
      : '';

    const pagarHtml = linkPagar
      ? `<a href="${escapeHtml(linkPagar)}" target="_blank" class="inline-block mt-5 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold">💳 Pagar agora (Pix ou cartão)</a>`
      : '';

    const zapHtml = a.zapConfirmado
      ? `<p class="text-sm text-emerald-700 mt-2">✅ WhatsApp confirmado${a.telefone ? `: ${escapeHtml(a.telefone)}` : ''} — os avisos da assinatura chegam por lá.</p>`
      : `<div class="mt-2 space-y-3">
          <p class="text-sm text-slate-500">Cadastre seu WhatsApp pra receber os avisos de vencimento por lá também (hoje vão só por e-mail).</p>
          <form method="post" action="/dashboard/minha-assinatura/zap/solicitar" class="flex gap-2">
            <input name="telefone" placeholder="5521999998888" value="${escapeHtml(a.telefone ?? '')}" class="flex-1 border border-slate-300 rounded-lg px-3 py-2">
            <button class="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold">Receber código</button>
          </form>
          <form method="post" action="/dashboard/minha-assinatura/zap/confirmar" class="flex gap-2">
            <input name="codigo" placeholder="Código de 6 dígitos" inputmode="numeric" maxlength="6" class="flex-1 border border-slate-300 rounded-lg px-3 py-2">
            <button class="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold">Confirmar</button>
          </form>
        </div>`;

    body = `<div class="mb-6"><h1 class="text-2xl font-bold text-slate-800">📆 Minha assinatura</h1></div>
    ${avisoHtml}
    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 max-w-xl">
      <div class="flex items-center justify-between">
        <div>
          <div class="text-lg font-semibold text-slate-800">${escapeHtml(a.produtoNome)}</div>
          <div class="text-sm text-slate-500">R$ ${reais(a.valorCentavos)}/mês · vence dia ${dataBr(a.venceEm)}</div>
        </div>
        ${badge}
      </div>
      ${suspensaHtml}
      ${usoHtml}
      ${pagarHtml}
    </div>
    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 max-w-xl mt-6">
      <h2 class="text-base font-semibold text-slate-800">📱 Avisos no WhatsApp</h2>
      ${zapHtml}
    </div>`;
  }

  return renderLayout({ active: 'minha_assinatura', title: 'Minha assinatura', body, user });
}
