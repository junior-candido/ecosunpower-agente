// src/modules/dashboard/manutencao-views.ts
// Tela de Manutenção: agenda guiada por atenção + leituras pendentes
// (empurrão mensal das usinas sem API) + agendar manual + nova OS + modal de
// leitura. Também o selo "sem API" (reusado no pós-venda) e o prontuário da usina.
// Renovação do miolo — R13 (28/09/2026): mesmos formulários (feita, os/abrir,
// agendar, os/nova) e o mesmo modal de leitura (fetch no form.action, mesmos
// ids e data-*); visual no padrão cc- do Command Center, tema escuro (D4), sem
// Tailwind. Agenda em tabela com o dia em bloco e pílula pela statusAgendaItem.
import { renderLayout, escapeHtml } from './views.js';
import type { DashUser } from './permissions.js';
import type { AgendaItem, LeituraPendente, ProntuarioManutencao } from './manutencao-queries.js';
import { statusAgendaItem, type ManutencaoTipo } from './manutencao-motor.js';
import {
  cabecalhoPagina, faixaKpis, cartaoSecao, estadoVazio, pilulaStatus, botao, celulaDupla, linhaLista, icone,
} from './ui/componentes.js';
import { temaDaTela } from './ui/tema.js';

const TIPO_LABEL: Record<ManutencaoTipo, string> = {
  limpeza: '🧹 Limpeza', revisao_inversor: '🔌 Revisão inversor',
  revisao_eletrica: '⚡ Revisão elétrica', corretiva: '🔧 Corretiva', inspecao: '🔎 Inspeção',
};
/** Tipo sem emoji (tabela e títulos do padrão cc-). */
export const TIPO_TEXTO: Record<string, string> = {
  limpeza: 'Limpeza', revisao_inversor: 'Revisão inversor',
  revisao_eletrica: 'Revisão elétrica', corretiva: 'Corretiva', inspecao: 'Inspeção',
};

/** Selo "sem API" das telas antigas (pós-venda). Texto e forma NÃO mudam. */
export function seloSemApi(semApi: boolean): string {
  return semApi
    ? '<span class="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">📵 Sem API · leitura manual</span>' // tailwind-ok: selo do pós-venda (tela antiga), mesmo texto
    : '';
}
/** O mesmo selo no padrão cc- (tela renovada). */
const seloSemApiCc = (semApi: boolean) => (semApi ? '<span class="cc-om-semapi">📵 Sem API · leitura manual</span>' : '');

interface UsinaOpt { id: string; apelido: string }
export interface ManutencaoPageData { agenda: AgendaItem[]; leiturasPendentes: LeituraPendente[]; usinas: UsinaOpt[] }

const dataBR = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '—');
const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

/** Dia em bloco (29 / SET), como no protótipo; sem data → "—". */
function diaEmBloco(iso: string | null): string {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  const mes = m ? MESES[Number(m[2]) - 1] : undefined;
  if (!m || !mes) return '<span class="cc-om-dia cc-om-dia-vazio" title="sem data">—</span>';
  return `<span class="cc-om-dia" title="${dataBR(iso!.slice(0, 10))}"><b>${m[3]}</b><small>${mes}</small></span>`;
}

const PILULA: Record<'vencida' | 'proxima' | 'ok', string> = {
  vencida: pilulaStatus('critico', 'vencida'),
  proxima: pilulaStatus('atencao', 'próxima'),
  ok: pilulaStatus('info', 'programada'),
};

const CSS_MANUTENCAO = `
.cc-om .cc-kstrip{margin-bottom:16px}
.cc-om .cc-panel+.cc-panel{margin-top:16px}
.cc-om-grade{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:16px}
.cc-om .cc-om-grade .cc-panel{margin:0}
.cc-om-dia{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;flex:none;width:48px;height:48px;border-radius:10px;border:1px solid var(--cc-line-2);background:var(--cc-surface-3);line-height:1}
.cc-om-dia b{font-family:var(--cc-f-num);font-size:18px;font-weight:700;color:var(--cc-text)}
.cc-om-dia small{font-size:10px;letter-spacing:.08em;color:var(--cc-muted);margin-top:3px}
.cc-om-dia-vazio{color:var(--cc-faint);font-size:16px}
.cc-om-usina{display:flex;align-items:center;gap:12px;min-width:0;text-align:left}
.cc-om-usina>div{min-width:0}
.cc-om-semapi{display:inline-block;margin-top:4px;font-size:11px;font-weight:600;color:var(--cc-warn);background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.3);border-radius:6px;padding:1px 6px}
.cc-om-tbl td{vertical-align:middle}
.cc-om-acoes{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap}
.cc-om-acoes form{margin:0}
.cc-om-leituras{display:flex;flex-direction:column;gap:8px}
.cc-om-form{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end}
.cc-om-form .cc-campo{flex:1 1 180px}
.cc-om-form .cc-campo select,.cc-om-form .cc-campo input{width:100%}
.cc-om-modal{position:fixed;inset:0;z-index:50;padding:16px;background:rgba(2,6,23,.7);align-items:center;justify-content:center}
.cc-om-modal:not(.hidden){display:flex}
.cc-om-modal form{width:100%;max-width:380px;background:var(--cc-surface);border:1px solid var(--cc-line-2);border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:10px}
.cc-om-modal .cc-om-mt{font-size:15px;font-weight:700;color:var(--cc-text)}
.cc-om-modal input{width:100%}
.cc-om-fb{font-size:13px;min-height:18px;color:var(--cc-text-2)}
.cc-om-fb-baixo{color:var(--cc-crit)} .cc-om-fb-alto{color:var(--cc-ok)}
.cc-om-modal-acoes{display:flex;justify-content:flex-end;gap:8px}
@media (max-width:1023px){.cc-om-grade{grid-template-columns:minmax(0,1fr)}}
@media (max-width:760px){
  .cc-om-acoes{justify-content:stretch;width:100%}
  .cc-om-acoes form,.cc-om-acoes>.cc-btn{flex:1 1 0}
  .cc-om-acoes .cc-btn{width:100%;justify-content:center;min-height:40px}
  .cc-om-form .cc-btn{width:100%;justify-content:center;min-height:44px}
  .cc-om .cc-li{flex-wrap:wrap}
  .cc-om .cc-li-d{width:100%}
  .cc-om .cc-li-d .cc-btn{width:100%;justify-content:center;min-height:40px}
}
`;

const ROT = ['Dia · usina', 'Tipo', 'Status', ''];
const td = (i: number, html: string, cls = '') => `<td${cls ? ` class="${cls}"` : ''} data-label="${ROT[i]}">${html}</td>`;

function linhaAgenda(i: AgendaItem, hoje: Date): string {
  const st = statusAgendaItem(i.data_agendada, hoje);
  const usina = `<div class="cc-om-usina">${diaEmBloco(i.data_agendada)}<div>${celulaDupla(i.apelido, i.clienteNome ?? '—')}${seloSemApiCc(i.semApi)}</div></div>`;
  const acoes = `<div class="cc-om-acoes">
      <form method="post" action="/dashboard/manutencao/${escapeHtml(i.id)}/feita">
        <button type="submit" class="cc-btn cc-btn-sm">${icone('check', 'sm')}Feita</button></form>
      <form method="post" action="/dashboard/manutencao/${escapeHtml(i.id)}/os/abrir">
        <button type="submit" class="cc-btn cc-btn-sm" title="Abrir Ordem de Serviço (checklist + fotos + laudo)">${icone('doc-check', 'sm')}OS</button></form>
      <button type="button" class="cc-btn cc-btn-sm pv-leitura" data-sistema="${escapeHtml(i.sistemaId)}" data-apelido="${escapeHtml(i.apelido)}">${icone('gauge', 'sm')}Leitura</button>
    </div>`;
  return `<tr data-manut-id="${escapeHtml(i.id)}">${td(0, usina)}${td(1, escapeHtml(TIPO_TEXTO[i.tipo] ?? i.tipo))}${td(2, PILULA[st])}${td(3, acoes, 'cc-r')}</tr>`;
}

export function renderManutencaoPage(d: ManutencaoPageData, user?: DashUser): string {
  const hoje = new Date();
  const status = d.agenda.map((i) => statusAgendaItem(i.data_agendada, hoje));
  const conta = (s: string) => status.filter((x) => x === s).length;

  const kpis = faixaKpis([
    { rotulo: 'Agendadas', valor: d.agenda.length, detalhe: 'na agenda' },
    { rotulo: 'Vencidas', valor: conta('vencida'), detalhe: 'a data já passou' },
    { rotulo: 'Próximos 30 dias', valor: conta('proxima'), detalhe: 'a fazer' },
    { rotulo: 'Leituras pendentes', valor: d.leiturasPendentes.length, detalhe: 'usinas sem API' },
  ]);

  const agenda = d.agenda.length
    ? `<div class="cc-tbl-wrap cc-tbl-cartoes"><table class="cc-tbl cc-om-tbl"><thead><tr>${ROT.map((r, i) => `<th${i === 3 ? ' class="cc-r"' : ''}>${r}</th>`).join('')}</tr></thead>`
      + `<tbody>${d.agenda.map((i) => linhaAgenda(i, hoje)).join('')}</tbody></table></div>`
    : estadoVazio({ tipo: 'vazio', titulo: 'Nenhuma manutenção agendada.', texto: 'Use "Agendar manutenção" aqui embaixo pra pôr a primeira na agenda.', icone: 'cal' });

  const pend = d.leiturasPendentes.length ? cartaoSecao({
    titulo: 'Leituras do mês pendentes',
    dica: 'usinas sem API — digite o kWh do mês',
    corpoHtml: `<div class="cc-om-leituras">${d.leiturasPendentes.map((l) => linhaLista({
      tom: 'atencao', titulo: l.apelido, meta: l.clienteNome ?? '—',
      direitaHtml: `<button type="button" class="cc-btn cc-btn-sm pv-leitura" data-sistema="${escapeHtml(l.sistemaId)}" data-apelido="${escapeHtml(l.apelido)}">${icone('gauge', 'sm')}Registrar leitura</button>`,
    })).join('')}</div>`,
  }) : '';

  const opcoesUsina = d.usinas.map((u) => `<option value="${escapeHtml(u.id)}">${escapeHtml(u.apelido)}</option>`).join('');
  const opcoesTipo = (ordem: ManutencaoTipo[]) => ordem.map((t) => `<option value="${t}">${TIPO_LABEL[t]}</option>`).join('');

  const agendar = cartaoSecao({
    id: 'agendar', titulo: 'Agendar manutenção', dica: 'manual',
    corpoHtml: `<form method="post" action="/dashboard/manutencao/agendar" class="cc-form cc-om-form">
      <label class="cc-campo"><span>Usina</span><select name="sistemaId" required>${opcoesUsina}</select></label>
      <label class="cc-campo"><span>Tipo</span><select name="tipo">${opcoesTipo(['limpeza', 'revisao_inversor', 'revisao_eletrica', 'corretiva', 'inspecao'])}</select></label>
      <label class="cc-campo"><span>Data</span><input type="date" name="dataAgendada" required></label>
      ${botao({ rotulo: 'Agendar', tipo: 'submit', icone: 'cal' })}
    </form>`,
  });
  const novaOs = cartaoSecao({
    id: 'nova-os', titulo: 'Nova OS avulsa', dica: 'sem agendamento',
    corpoHtml: `<form method="post" action="/dashboard/os/nova" class="cc-form cc-om-form">
      <label class="cc-campo"><span>Usina</span><select name="sistemaId" required>${opcoesUsina}</select></label>
      <label class="cc-campo"><span>Tipo</span><select name="tipo">${opcoesTipo(['corretiva', 'inspecao', 'limpeza', 'revisao_inversor', 'revisao_eletrica'])}</select></label>
      ${botao({ rotulo: 'Abrir OS', tipo: 'submit', icone: 'doc-check' })}
    </form>`,
  });

  const body = `<div class="cc-root cc-om">
${cabecalhoPagina({
    trilha: [{ rotulo: 'Command Center' }, { rotulo: 'Manutenção' }],
    titulo: 'Manutenção',
    subtitulo: 'Agenda guiada por atenção — as vencidas primeiro.',
    acoesHtml: `${botao({ rotulo: 'Agendar', href: '#agendar', icone: 'cal' })}${botao({ rotulo: 'Nova OS', href: '#nova-os', tom: 'ouro', icone: 'plus' })}`,
  })}
${kpis}
${cartaoSecao({ titulo: 'Agenda', dica: `${d.agenda.length} agendada(s)`, corpoHtml: agenda })}
${pend}
<div class="cc-om-grade">${agendar}${novaOs}</div>
</div>

  <div id="leitura-modal" class="cc-om-modal hidden">
    <form id="leitura-form" method="post" class="cc-form">
      <div class="cc-om-mt" id="leitura-title">Registrar leitura</div>
      <label class="cc-campo"><span>Competência</span>
      <input type="month" name="competencia" required></label>
      <label class="cc-campo"><span>kWh do mês (o que a plataforma de origem mostra)</span>
      <input type="number" step="0.1" name="kwh" required></label>
      <div id="leitura-fb" class="cc-om-fb"></div>
      <div class="cc-om-modal-acoes">
        <button type="button" id="leitura-cancel" class="cc-btn">Fechar</button>
        <button type="submit" class="cc-btn">${icone('check', 'sm')}Salvar</button>
      </div>
    </form>
  </div>
<style>${CSS_MANUTENCAO}</style>`;

  const scripts = `<script>
  (function(){
    var modal=document.getElementById('leitura-modal'), form=document.getElementById('leitura-form');
    var title=document.getElementById('leitura-title'), fb=document.getElementById('leitura-fb');
    document.querySelectorAll('.pv-leitura').forEach(function(b){
      b.onclick=function(){
        form.action='/dashboard/usinas/'+b.dataset.sistema+'/leitura';
        title.textContent='Leitura · '+(b.dataset.apelido||'usina'); fb.textContent=''; fb.className='cc-om-fb';
        modal.classList.remove('hidden');
      };
    });
    document.getElementById('leitura-cancel').onclick=function(){ modal.classList.add('hidden'); };
    form.onsubmit=async function(e){
      e.preventDefault();
      var r=await fetch(form.action,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(new FormData(form)).toString()});
      var j=await r.json().catch(function(){return {};});
      fb.textContent=j.sugestao||'Salvo.';
      fb.className='cc-om-fb'+(j.status==='baixo'?' cc-om-fb-baixo':j.status==='alto'?' cc-om-fb-alto':'');
    };
  })();
  </script>`;

  return renderLayout({
    active: 'manutencao', title: 'Manutenção', body, scripts, user,
    tailwind: false, dark: temaDaTela(user, 'escuro') === 'escuro', largo: true,
  });
}

/**
 * Prontuário da usina no padrão cc- (renovação do miolo, R9 — tela da usina).
 * A tabela vira cartão no celular. (O `renderProntuario` antigo, em Tailwind,
 * não tinha mais uso e saiu no R13.)
 */
export function renderProntuarioCc(itens: ProntuarioManutencao[]): string {
  if (!itens.length) return '<p class="cc-muted cc-us-vazio">Sem manutenções registradas ainda.</p>';
  const ROT = ['Tipo', 'Quando', 'Status', 'Notas'];
  const td = (i: number, html: string) => `<td data-label="${ROT[i]}">${html}</td>`;
  const linha = (m: ProntuarioManutencao) => {
    const quando = m.status === 'feita' ? m.feita_em : m.data_agendada;
    const tom = m.status === 'feita' ? 'cc-s-ok' : m.status === 'cancelada' ? 'cc-s-off' : 'cc-s-info';
    return `<tr>${td(0, TIPO_LABEL[m.tipo] ?? escapeHtml(m.tipo))}${td(1, `<span class="cc-num">${dataBR(quando)}</span>`)}`
      + `${td(2, `<span class="cc-pill ${tom}">${escapeHtml(m.status)}</span>`)}${td(3, `<span class="cc-muted">${escapeHtml(m.notas ?? '') || '—'}</span>`)}</tr>`;
  };
  return `<div class="cc-tbl-wrap cc-tbl-cartoes"><table class="cc-tbl"><thead><tr>${ROT.map((r) => `<th>${r}</th>`).join('')}</tr></thead>`
    + `<tbody>${itens.map(linha).join('')}</tbody></table></div>`;
}
