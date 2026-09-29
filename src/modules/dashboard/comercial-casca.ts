// src/modules/dashboard/comercial-casca.ts
// Casca comum das telas do Comercial II (renovação do miolo, R21): Contratos &
// Procurações, Fechou!, formulário do contrato do lead, Recados, Comparador de
// Lojas e "O que a assistente sabe". Padrão cc- do Command Center, tema escuro
// (D4 = a), sem Tailwind. O CSS vai no <head> (cabeca) — nada de <style> no fim
// da página (a tela pintaria sem ele e "pularia": a piscada do #337).
import { renderLayout, type ChaveAtiva } from './views.js';
import type { DashUser } from './permissions.js';
import { temaDaTela } from './ui/tema.js';
import { icone } from './ui/componentes.js';
import type { NomeIcone } from './ui/icones.js';
import { ECOSUN_COMPANY_ID } from '../tenant-resolver.js';

export type TomAviso = 'ok' | 'erro' | 'info' | 'atencao';

/** Aviso com HTML CONFIÁVEL dentro (montado pela própria tela, com os dados já
 *  escapados). Para texto puro use `aviso()` de ui/componentes. */
export function avisoHtml(tom: TomAviso, html: string): string {
  const ic: Record<TomAviso, NomeIcone> = { ok: 'check', erro: 'alert', info: 'bell', atencao: 'alert' };
  return `<div class="cc-aviso cc-aviso-${tom}" role="${tom === 'erro' ? 'alert' : 'status'}">${icone(ic[tom], 'sm')}<span>${html}</span></div>`;
}

/** A casa (EcoSun) — telas legadas sem user contam como casa (compatível). */
export const ehCasa = (u: unknown): boolean => !u || (u as DashUser).companyId === ECOSUN_COMPANY_ID;

export const TRILHA_COMERCIAL = { rotulo: 'Comercial / CRM' };

const CSS_COMERCIAL = `
.cc-cm .cc-panel+.cc-panel,.cc-cm .cc-panel+.cc-cm-bloco,.cc-cm .cc-cm-bloco+.cc-panel{margin-top:16px}
.cc-cm .cc-aviso strong{color:var(--cc-text)}
.cc-cm .cc-aviso a{color:var(--cc-gold-2);text-decoration:underline}
.cc-cm-linha{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end}
.cc-cm-linha>.cc-campo{flex:1 1 200px}
.cc-cm-linha>.cc-campo-estreito{flex:0 1 180px}
.cc-cm-linha form{margin:0}
.cc-cm-acoes{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.cc-cm-acoes form{margin:0;display:inline-flex;gap:8px;align-items:center;flex-wrap:wrap}
.cc-cm-sep{border-top:1px solid var(--cc-line);margin:14px 0 0;padding-top:14px}
.cc-cm-nota{margin:10px 0 0;font-size:12.5px;color:var(--cc-muted)}
.cc-cm-nota strong{color:var(--cc-text-2)}
.cc-cm-rot{font-size:11.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--cc-muted);margin:18px 0 8px}
.cc-cm-cartao{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:12px 14px;border:1px solid var(--cc-line);border-radius:12px;background:var(--cc-surface);margin-bottom:8px}
.cc-cm-cartao .cc-dupla{flex:1 1 180px;min-width:0}
.cc-cm-sel{border:1px solid rgba(240,165,0,.35)}
.cc-cm-sel .cc-cm-quem{font-size:16px;font-weight:600;color:var(--cc-text)}
.cc-cm-sel .cc-cm-quem small{display:block;font-size:12.5px;font-weight:400;color:var(--cc-muted);margin-top:2px}
.cc-cm-grade{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.cc-cm-grade .cc-cm-cheia{grid-column:1/-1}
.cc-cm-grade3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.cc-cm-grade4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.cc-cm-venda{padding:16px;border:1px solid var(--cc-line);border-radius:14px;background:var(--cc-surface);margin-bottom:12px}
.cc-cm-venda .cc-dupla{margin-bottom:12px}
.cc-cm-venda-ja{display:flex;align-items:center;justify-content:space-between;gap:10px;opacity:.85}
.cc-cm-kv{display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid var(--cc-line);font-size:13.5px;color:var(--cc-text-2)}
.cc-cm-kv:last-child{border-bottom:0}
.cc-cm-kv strong{font-weight:600;color:var(--cc-text);font-family:'Space Grotesk',system-ui,sans-serif;white-space:nowrap;text-align:right}
.cc-cm-kv small{display:block;font-size:11.5px;color:var(--cc-faint)}
.cc-cm-kv-forte{font-size:15px;color:var(--cc-text)}
.cc-cm-kv-forte strong{font-size:16px;color:var(--cc-gold-2)}
.cc-cm-kv-warn{color:var(--cc-warn,#f59e0b)}
.cc-cm-melhor{border-color:rgba(61,187,110,.55);box-shadow:0 0 0 1px rgba(61,187,110,.25) inset}
.cc-cm-placar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:16px}
.cc-cm-placar .cc-kpi{min-width:120px;flex:0 1 150px}
.cc-cm input:disabled,.cc-cm select:disabled,.cc-cm textarea:disabled{opacity:.6;cursor:not-allowed}
.cc-cm-num{font-family:'Space Grotesk',system-ui,sans-serif}
.cc-cm-check{display:inline-flex;align-items:center;gap:8px;min-height:44px;font-size:13.5px;color:var(--cc-text-2)}
.cc-cm-textarea{width:100%}
.cc-cm-conh .cc-ph h3{overflow-wrap:anywhere}
/* Recados */
.cc-cm-msg{white-space:pre-wrap;overflow-wrap:anywhere;color:var(--cc-text)}
/* Formulário do contrato do lead */
.cc-cf-vazio{border-color:var(--cc-crit)!important;background:var(--cc-crit-soft)!important}
.cc-cf-usado{border-color:#a78bfa!important;background:rgba(167,139,250,.12)!important}
.cc-cf-usado-btn{opacity:.6}
.cc-cf-falta{margin-left:8px;font-size:11.5px;font-weight:600;color:var(--cc-crit);text-transform:none;letter-spacing:0}
.cc-cf-rot-vazio{color:var(--cc-crit)!important}
.cc-cf-dica{font-size:12px;color:var(--cc-faint);margin-top:2px}
.cc-cf-sug{margin-top:6px;display:flex;gap:10px;align-items:flex-start;padding:9px 12px;border:1px solid rgba(167,139,250,.45);border-radius:10px;background:rgba(167,139,250,.10);font-size:13px;color:var(--cc-text)}
.cc-cf-sug .cc-cf-sug-txt{flex:1;min-width:0}
.cc-cf-sug small{display:block;color:var(--cc-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
.cc-cf-parc{margin-top:12px;border:1px solid var(--cc-line);border-radius:12px;overflow:hidden}
.cc-cf-parc-t{padding:8px 12px;font-size:12.5px;color:var(--cc-muted);background:var(--cc-surface)}
.cc-cf-parc-l{max-height:256px;overflow-y:auto}
.cc-cf-parc table{width:100%;border-collapse:collapse;font-size:13.5px}
.cc-cf-parc td{padding:7px 12px;border-top:1px solid var(--cc-line);color:var(--cc-text-2)}
.cc-cf-parc td strong{color:var(--cc-text);font-family:'Space Grotesk',system-ui,sans-serif}
.cc-cf-prev{width:100%;height:520px;border:1px solid var(--cc-line);border-radius:12px;background:#fff;display:block}
.cc-cf-calc{border:1px dashed var(--cc-line-2);border-radius:12px;padding:14px}
.cc-cf-salvar{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin:16px 0}
.cc-cf-salvar span{font-size:12.5px;color:var(--cc-muted);flex:1 1 280px}
.cc-cf-orfa{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;padding:8px 0;border-top:1px solid var(--cc-line)}
.cc-cf-orfa:first-child{border-top:0}
.cc-cf-bloco{margin-bottom:14px}
.cc-cf-bloco ul{margin:6px 0 0 18px;list-style:disc;color:var(--cc-text)}
.cc-cf-bloco li{margin:2px 0}
@media (max-width:760px){
  .cc-cm-grade,.cc-cm-grade3{grid-template-columns:minmax(0,1fr)}
  .cc-cm-grade4{grid-template-columns:repeat(2,minmax(0,1fr))}
  .cc-cm-linha>.cc-campo,.cc-cm-linha>.cc-campo-estreito{flex:1 1 100%}
  .cc-cm-linha .cc-btn{flex:1 1 auto;justify-content:center}
  .cc-cm-acoes>.cc-btn,.cc-cm-acoes form{flex:1 1 100%}
  .cc-cm-acoes>.cc-btn{justify-content:center}
  .cc-cm-acoes form .cc-btn{flex:1 1 auto;justify-content:center}
  .cc-cm-acoes input[type=file]{flex:1 1 100%}
  .cc-cf-prev{height:420px}
  .cc-cm-kv strong{white-space:normal}
  .cc-cf-salvar .cc-btn{width:100%;justify-content:center}
}
`;

export const CABECA_COMERCIAL = `<style>${CSS_COMERCIAL}</style>`;

export function renderComercial(input: {
  active: ChaveAtiva; title: string; body: string; scripts?: string; user: unknown; largo?: boolean;
}): string {
  const user = input.user as DashUser | undefined;
  return renderLayout({
    active: input.active, title: input.title, body: `<div class="cc-root cc-cm">${input.body}</div>`,
    scripts: input.scripts, user, tailwind: false, dark: temaDaTela(user, 'escuro') === 'escuro',
    largo: input.largo ?? true, cabeca: CABECA_COMERCIAL,
  });
}
