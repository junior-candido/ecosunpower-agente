// src/modules/dashboard/pos-venda-views.ts
// Tela de pós-venda: lista guiada por atenção + botões manuais + modal de preview
// que manda via wa.me (fallback da janela de 24h do WhatsApp).
import { renderLayout, escapeHtml } from './views.js';
import type { DashUser } from './permissions.js';
import type { PosVendaLinha } from './pos-venda-queries.js';
import type { Saude } from './pos-venda-saude.js';
import { formatPhoneBR } from '../meta-leadgen.js';

const SEMAFORO: Record<Saude, { dot: string; txt: string }> = {
  verde: { dot: '🟢', txt: 'Gerando ok' },
  amarelo: { dot: '🟡', txt: 'Atenção' },
  vermelho: { dot: '🔴', txt: 'Crítico' },
};

// Botões disponíveis por linha. O da próxima ação vem destacado (ring).
const BOTOES: Array<{ tipo: string; label: string }> = [
  { tipo: 'parabens', label: '🎉 Parabéns' },
  { tipo: 'relatorio', label: '📊 Relatório do mês' },
  { tipo: 'limpeza', label: '🧹 Limpeza' },
  { tipo: 'depoimento', label: '⭐ Depoimento' },
  { tipo: 'upgrade', label: '🔋 Upgrade' },
  { tipo: 'contato', label: '📞 Registrar contato' },
];

function tempo(iso: string | null): string {
  if (!iso) return 'sem contato';
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dias < 1) return 'hoje';
  if (dias < 30) return `há ${dias}d`;
  const meses = Math.floor(dias / 30);
  return `há ${meses}m`;
}

function borda(saude: Saude): string {
  return saude === 'vermelho' ? 'border-l-rose-500' : saude === 'amarelo' ? 'border-l-amber-400' : 'border-l-emerald-400';
}

function renderLinha(l: PosVendaLinha): string {
  const s = SEMAFORO[l.saude];
  const urgente = l.saude === 'vermelho' ? ' pv-urgent' : '';
  const nome = escapeHtml(l.nome);
  const phone = escapeHtml(formatPhoneBR(l.telefone ?? ''));
  const usina = [l.potenciaKwp ? `${l.potenciaKwp} kWp` : null, escapeHtml(l.marcaInversor ?? ''), escapeHtml(l.cidade ?? '')]
    .filter(Boolean).join(' · ');
  const botoes = BOTOES.map((b) => {
    const destaque = b.tipo === l.proximaAcao.tipo ? ' ring-2 ring-amber-400' : '';
    return `<button class="pv-btn px-2 py-1 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-100 text-xs${destaque}"
      data-lead-id="${escapeHtml(l.leadId)}" data-acao="${b.tipo}" data-nome="${nome}">${b.label}</button>`;
  }).join(' ');
  return `
  <div class="pv-card bg-[#0b0e1f] border border-[#1b2040] border-l-4 ${borda(l.saude)} rounded-xl p-3 mb-2${urgente}" data-lead-id="${escapeHtml(l.leadId)}">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span class="text-lg" title="${s.txt}">${s.dot}</span>
      <a href="/dashboard/leads/${escapeHtml(l.leadId)}" class="font-semibold text-cyan-200 hover:underline">${nome}</a>
      <span class="text-xs text-slate-400">${phone}</span>
      <span class="text-xs text-slate-500">${usina}</span>
      <span class="ml-auto text-xs text-slate-400">❤️ ${tempo(l.ultimoContatoEm)}</span>
    </div>
    <div class="mt-1 text-xs text-amber-300">${escapeHtml(l.proximaAcao.label)}</div>
    <div class="mt-2 flex flex-wrap gap-1.5">${botoes}</div>
  </div>`;
}

export function renderPosVendaPage(linhas: PosVendaLinha[], user?: DashUser): string {
  const lista = linhas.length
    ? linhas.map(renderLinha).join('')
    : `<div class="text-slate-400 text-center py-16">Nenhum cliente com usina ainda. Quando houver usinas vinculadas, eles aparecem aqui.</div>`;

  const body = `
  <style>
    @keyframes pvPulse { 0%,100%{box-shadow:0 0 0 0 rgba(244,63,94,0)} 50%{box-shadow:0 0 0 3px rgba(244,63,94,.35)} }
    .pv-urgent{ animation:pvPulse 1.8s ease-in-out infinite }
    @media (prefers-reduced-motion: reduce){ .pv-urgent{ animation:none; box-shadow:0 0 0 2px rgba(244,63,94,.4) } }
  </style>
  <div>
    <h1 class="text-xl font-bold text-cyan-300 mb-1">❤️ Pós-venda / Relacionamento</h1>
    <p class="text-xs text-slate-400 mb-4">Os que <b class="text-rose-400">pulsam em vermelho</b> precisam de atenção. O botão destacado é a próxima ação sugerida.</p>
    ${lista}
  </div>

  <div id="pv-modal" class="fixed inset-0 bg-black/60 hidden items-center justify-center z-50 p-4">
    <div class="bg-[#0b0e1f] border border-[#1b2040] rounded-xl max-w-lg w-full p-4">
      <div class="text-sm text-slate-300 mb-2" id="pv-modal-title">Mensagem</div>
      <textarea id="pv-msg" class="w-full h-40 bg-[#070a18] border border-[#1b2040] rounded-md p-2 text-slate-100 text-sm"></textarea>
      <div class="flex flex-wrap gap-2 mt-3 justify-end">
        <button id="pv-cancel" class="px-3 py-1.5 rounded-md bg-slate-700 text-slate-200 text-sm">Cancelar</button>
        <button id="pv-copy" class="px-3 py-1.5 rounded-md bg-slate-600 text-white text-sm">Copiar</button>
        <a id="pv-wa" href="#" target="_blank" class="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold">Mandar no WhatsApp</a>
      </div>
    </div>
  </div>`;

  const scripts = `<script>
  (function(){
    var modal=document.getElementById('pv-modal'), ta=document.getElementById('pv-msg');
    var wa=document.getElementById('pv-wa'), title=document.getElementById('pv-modal-title');
    var atual=null;
    function open(){ modal.classList.remove('hidden'); modal.classList.add('flex'); }
    function close(){ modal.classList.add('hidden'); modal.classList.remove('flex'); }
    document.getElementById('pv-cancel').onclick=close;
    document.getElementById('pv-copy').onclick=function(){ if(navigator.clipboard) navigator.clipboard.writeText(ta.value); };
    document.querySelectorAll('.pv-btn').forEach(function(b){
      b.onclick=async function(){
        var leadId=b.dataset.leadId, acao=b.dataset.acao;
        atual={leadId:leadId, acao:acao, waBase:''};
        title.textContent='Carregando…'; ta.value=''; open();
        var r=await fetch('/dashboard/pos-venda/'+leadId+'/acao',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'tipo='+encodeURIComponent(acao)});
        var j=await r.json().catch(function(){return {};});
        title.textContent=(b.dataset.nome||'Cliente')+' · '+acao;
        if(acao==='contato'){ ta.value=j.mensagem||'Contato registrado (sem mensagem ao cliente).'; wa.style.display='none'; marcar(leadId,acao,''); }
        else { ta.value=j.mensagem||''; wa.style.display=''; atual.waBase=j.waBase||'https://wa.me/'; }
      };
    });
    wa.onclick=function(){
      if(!atual) return;
      wa.href=(atual.waBase||'https://wa.me/')+'?text='+encodeURIComponent(ta.value);
      marcar(atual.leadId, atual.acao, ta.value); // grava timeline+abordagem ao confirmar envio
    };
    function marcar(leadId,acao,msg){
      fetch('/dashboard/pos-venda/'+leadId+'/acao',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'tipo='+encodeURIComponent(acao)+'&enviado=1&mensagem='+encodeURIComponent(msg)}).catch(function(){});
    }
  })();
  </script>`;

  return renderLayout({ active: 'pos_venda', title: 'Pós-venda', dark: true, user, body, scripts });
}
