// src/modules/dashboard/pos-venda-views.ts
// Tela de pós-venda: lista guiada por atenção. Os botões de ação disparam o
// template aprovado pela Eva; o chat do copiloto envia texto livre pela Eva.
import { renderLayout, escapeHtml } from './views.js';
import type { DashUser } from './permissions.js';
import type { PosVendaLinha } from './pos-venda-queries.js';
import type { Saude } from './pos-venda-saude.js';
import type { AgendaAgrupada, TarefaAgenda } from './pos-venda-agenda.js';
import { formatPhoneBR } from '../meta-leadgen.js';
import { seloSemApi } from './manutencao-views.js';
import { TEXTOS_PREVIA } from './pos-venda-envio.js';
import { temperatura } from './pos-venda-termometro.js';
import { sugestaoProativa } from './pos-venda-sugestao.js';

const SEMAFORO: Record<Saude, { dot: string; txt: string }> = {
  verde: { dot: '🟢', txt: 'Gerando ok' },
  amarelo: { dot: '🟡', txt: 'Atenção' },
  vermelho: { dot: '🔴', txt: 'Crítico' },
};

const TERMOMETRO: Record<'quente' | 'morno' | 'frio', { ico: string; txt: string }> = {
  quente: { ico: '🔥', txt: 'Relacionamento quente' },
  morno: { ico: '🌤️', txt: 'Relacionamento morno' },
  frio: { ico: '🧊', txt: 'Relacionamento frio — atenção' },
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
  const agora = new Date();
  const temp = TERMOMETRO[temperatura(l, agora)];
  const sug = sugestaoProativa(l, agora);
  const chip = sug
    ? `<button type="button" class="pv-sugestao-btn block mt-1 text-left text-xs text-indigo-300 hover:text-indigo-100" data-lead-id="${escapeHtml(l.leadId)}" data-pedido="${escapeHtml(sug.pedidoEva)}">${escapeHtml(sug.texto)}</button>`
    : '';
  const s = SEMAFORO[l.saude];
  const urgente = l.saude === 'vermelho' ? ' pv-urgent' : '';
  const nome = escapeHtml(l.nome);
  const phone = escapeHtml(formatPhoneBR(l.telefone ?? ''));
  const usina = [l.potenciaKwp ? `${l.potenciaKwp} kWp` : null, escapeHtml(l.marcaInversor ?? ''), escapeHtml(l.cidade ?? '')]
    .filter(Boolean).join(' · ');
  const botoes = BOTOES.map((b) =>
    b.tipo === 'contato'
      ? `<a href="/dashboard/leads/${escapeHtml(l.leadId)}" class="px-2 py-1 rounded bg-[#11152e] text-cyan-200 text-xs hover:bg-[#1b2040]">${b.label}</a>`
      : `<button type="button" class="pv-tpl-btn px-2 py-1 rounded bg-[#11152e] text-cyan-200 text-xs hover:bg-[#1b2040]" data-lead-id="${escapeHtml(l.leadId)}" data-tipo="${escapeHtml(b.tipo)}" data-nome="${escapeHtml(l.nome)}">${b.label}</button>`,
  ).join('');
  return `
  <div class="pv-card bg-[#0b0e1f] border border-[#1b2040] border-l-4 ${borda(l.saude)} rounded-xl p-3 mb-2${urgente}" data-lead-id="${escapeHtml(l.leadId)}">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span class="text-lg" title="${s.txt}">${s.dot}</span>
      <span class="text-lg" title="${temp.txt}">${temp.ico}</span>
      <a href="/dashboard/leads/${escapeHtml(l.leadId)}" class="font-semibold text-cyan-200 hover:underline">${nome}</a>
      ${seloSemApi(l.semApi)}
      <span class="text-xs text-slate-400">${phone}</span>
      <span class="text-xs text-slate-500">${usina}</span>
      <span class="ml-auto text-xs text-slate-400">❤️ ${tempo(l.ultimoContatoEm)}</span>
    </div>
    <div class="mt-1 text-xs text-amber-300">${escapeHtml(l.proximaAcao.label)}</div>
    ${chip}
    <div class="mt-2 flex flex-wrap gap-1.5">${botoes}</div>
    <div class="pv-previa hidden mt-2 bg-[#0b0e1f] border border-amber-600/40 rounded-lg p-2" data-lead-id="${escapeHtml(l.leadId)}">
      <div class="text-[11px] text-amber-200 mb-1">Prévia — vai enviar isto pela Eva:</div>
      <div class="pv-previa-texto text-xs text-slate-100 whitespace-pre-wrap"></div>
      <div class="mt-2 flex items-center gap-2">
        <button type="button" class="pv-previa-enviar text-xs bg-emerald-600 text-white rounded px-2 py-1 hover:bg-emerald-500">Enviar pela Eva</button>
        <button type="button" class="pv-previa-cancelar text-xs text-slate-300 hover:text-white">Cancelar</button>
        <span class="pv-previa-status text-xs ml-1"></span>
      </div>
    </div>
    <button type="button" class="pv-copiloto-btn text-xs text-indigo-300 hover:text-indigo-100 mt-1" data-lead-id="${escapeHtml(l.leadId)}">💬 Eva (copiloto)</button>
    <div class="pv-chat hidden mt-2 bg-[#0b0e1f] border border-[#1b2040] rounded-lg p-2" data-lead-id="${escapeHtml(l.leadId)}">
      <textarea class="pv-chat-in w-full text-xs bg-[#11152e] text-slate-100 border border-[#1b2040] rounded p-1.5" rows="2" placeholder="Ex: manda um lembrete da revisão"></textarea>
      <button type="button" class="pv-chat-send text-xs bg-indigo-600 text-white rounded px-2 py-1 mt-1 hover:bg-indigo-500">Pedir</button>
      <div class="pv-chat-out text-xs text-slate-100 mt-2 whitespace-pre-wrap"></div>
      <button type="button" class="pv-chat-copy hidden text-xs text-emerald-300 hover:text-emerald-100 mt-1">Copiar</button>
      <button type="button" class="pv-chat-send-eva hidden text-xs bg-emerald-600 text-white rounded px-2 py-1 mt-1 ml-1 hover:bg-emerald-500">Enviar pela Eva</button>
    </div>
  </div>`;
}

function renderTarefaAgenda(t: TarefaAgenda): string {
  const data = t.dueAt ? new Date(t.dueAt).toLocaleDateString('pt-BR') : 'sem data';
  return `
  <div class="flex items-start gap-2 text-xs py-1 border-b border-[#1b2040]" data-tarefa-id="${escapeHtml(t.id)}">
    <div class="flex-1">
      <a href="/dashboard/leads/${escapeHtml(t.leadId)}" class="text-cyan-200 hover:underline">${escapeHtml(t.nomeCliente)}</a>
      <div class="text-slate-300">${escapeHtml(t.titulo)} <span class="text-slate-500">· ${escapeHtml(data)}</span></div>
    </div>
    <button type="button" class="pv-tarefa-ok text-emerald-300 hover:text-emerald-100" data-tarefa-id="${escapeHtml(t.id)}" title="Concluir">✓</button>
    <button type="button" class="pv-tarefa-adiar text-slate-400 hover:text-slate-200" data-tarefa-id="${escapeHtml(t.id)}" data-dias="1" title="Adiar 1 dia">+1d</button>
    <button type="button" class="pv-tarefa-adiar text-slate-400 hover:text-slate-200" data-tarefa-id="${escapeHtml(t.id)}" data-dias="7" title="Adiar 7 dias">+7d</button>
  </div>`;
}

function grupoAgenda(titulo: string, cor: string, itens: TarefaAgenda[]): string {
  if (itens.length === 0) return '';
  return `<div class="mb-3"><div class="text-xs font-semibold ${cor} mb-1">${titulo} (${itens.length})</div>${itens.map(renderTarefaAgenda).join('')}</div>`;
}

function renderAgenda(agenda: AgendaAgrupada): string {
  const vazia = !agenda.atrasados.length && !agenda.hoje.length && !agenda.semana.length;
  const corpo = vazia
    ? `<div class="text-xs text-slate-500 py-4">Nenhum lembrete por aqui. Use ➕ Lembrete num cliente.</div>`
    : grupoAgenda('🔴 Atrasados', 'text-rose-300', agenda.atrasados)
      + grupoAgenda('🟡 Hoje', 'text-amber-300', agenda.hoje)
      + grupoAgenda('🔵 Próximos 7 dias', 'text-cyan-300', agenda.semana);
  return `
  <aside class="pv-agenda bg-[#0b0e1f] border border-[#1b2040] rounded-xl p-3 lg:sticky lg:top-4 lg:w-80 lg:shrink-0">
    <h2 class="text-sm font-bold text-cyan-300 mb-2">🗓️ Agenda</h2>
    ${corpo}
  </aside>`;
}

export function renderPosVendaPage(linhas: PosVendaLinha[], user?: DashUser, agenda?: AgendaAgrupada): string {
  const lista = linhas.length
    ? linhas.map(renderLinha).join('')
    : `<div class="text-slate-400 text-center py-16">Nenhum cliente com usina ainda. Quando houver usinas vinculadas, eles aparecem aqui.</div>`;
  const agendaHtml = renderAgenda(agenda ?? { atrasados: [], hoje: [], semana: [] });

  const body = `
  <style>
    @keyframes pvPulse { 0%,100%{box-shadow:0 0 0 0 rgba(244,63,94,0)} 50%{box-shadow:0 0 0 3px rgba(244,63,94,.35)} }
    .pv-urgent{ animation:pvPulse 1.8s ease-in-out infinite }
    @media (prefers-reduced-motion: reduce){ .pv-urgent{ animation:none; box-shadow:0 0 0 2px rgba(244,63,94,.4) } }
  </style>
  <div>
    <h1 class="text-xl font-bold text-cyan-300 mb-1">❤️ Pós-venda / Relacionamento</h1>
    <p class="text-xs text-slate-400 mb-4">Os que <b class="text-rose-400">pulsam em vermelho</b> precisam de atenção. O botão destacado é a próxima ação sugerida.</p>
    <div class="flex flex-col lg:flex-row gap-4 items-start">
      <div class="flex-1 min-w-0 order-2 lg:order-1">${lista}</div>
      <div class="w-full lg:w-auto order-1 lg:order-2">${agendaHtml}</div>
    </div>
  </div>`;

  const scripts = `<script>
  (function () {
    document.querySelectorAll('.pv-copiloto-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var box = document.querySelector('.pv-chat[data-lead-id="' + btn.dataset.leadId + '"]');
        if (box) box.classList.toggle('hidden');
      });
    });
    document.querySelectorAll('.pv-sugestao-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var leadId = btn.dataset.leadId;
        var chat = document.querySelector('.pv-chat[data-lead-id="' + leadId + '"]');
        if (!chat) return;
        chat.classList.remove('hidden');
        var inp = chat.querySelector('.pv-chat-in');
        inp.value = btn.dataset.pedido || '';
        chat.querySelector('.pv-chat-send').click();
      });
    });
    document.querySelectorAll('.pv-chat').forEach(function (box) {
      var leadId = box.dataset.leadId;
      var input = box.querySelector('.pv-chat-in');
      var send = box.querySelector('.pv-chat-send');
      var out = box.querySelector('.pv-chat-out');
      var copy = box.querySelector('.pv-chat-copy');
      send.addEventListener('click', function () {
        var pergunta = (input.value || '').trim();
        if (!pergunta) return;
        out.textContent = 'Escrevendo...';
        copy.classList.add('hidden');
        send.disabled = true;
        fetch('/dashboard/pos-venda/' + leadId + '/copiloto', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pergunta: pergunta })
        }).then(function (r) { return r.json(); }).then(function (d) {
          out.textContent = d.texto || d.erro || 'Sem resposta.';
          if (d.texto) { copy.classList.remove('hidden'); var ev = box.querySelector('.pv-chat-send-eva'); if (ev) ev.classList.remove('hidden'); }
        }).catch(function () { out.textContent = 'Falha de conexão.'; })
          .finally(function () { send.disabled = false; });
      });
      copy.addEventListener('click', function () {
        navigator.clipboard.writeText(out.textContent || '').then(function () {
          var t = copy.textContent; copy.textContent = 'Copiado!';
          setTimeout(function () { copy.textContent = t; }, 1200);
        }).catch(function () {});
      });
    });
  })();
  </script>
  <script>
(function () {
  var PV_TEXTOS = ${JSON.stringify(TEXTOS_PREVIA)};
  // Botão de ação -> mostra PRÉVIA (não envia direto)
  document.querySelectorAll('.pv-tpl-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      // Parabéns/Relatório dependem da geração REAL -> vão pelo copiloto (a Eva
      // usa os dados reais ou pede pro operador conferir no nativo), nunca um
      // template cego afirmando "ótimo mês".
      if (btn.dataset.tipo === 'parabens' || btn.dataset.tipo === 'relatorio') {
        var chat = document.querySelector('.pv-chat[data-lead-id="' + btn.dataset.leadId + '"]');
        if (!chat) return;
        chat.classList.remove('hidden');
        var inp = chat.querySelector('.pv-chat-in');
        inp.value = btn.dataset.tipo === 'parabens'
          ? 'Escreve uma mensagem pro cliente sobre a geração da usina dele (use os dados reais; se não tiver, me orienta).'
          : 'Monta um relatório do mês da usina pro cliente (use os dados reais; se não tiver, me orienta).';
        chat.querySelector('.pv-chat-send').click();
        return;
      }
      var previa = document.querySelector('.pv-previa[data-lead-id="' + btn.dataset.leadId + '"]');
      if (!previa) return;
      var nome = btn.dataset.nome || 'cliente';
      var texto = (PV_TEXTOS[btn.dataset.tipo] || '').replace(/\{nome\}/g, nome);
      previa.querySelector('.pv-previa-texto').textContent = texto;
      previa.dataset.tipo = btn.dataset.tipo;
      previa.querySelector('.pv-previa-status').textContent = '';
      previa.querySelector('.pv-previa-enviar').style.display = '';
      previa.classList.remove('hidden');
    });
  });
  document.querySelectorAll('.pv-previa-cancelar').forEach(function (b) {
    b.addEventListener('click', function () { b.closest('.pv-previa').classList.add('hidden'); });
  });
  document.querySelectorAll('.pv-previa-enviar').forEach(function (b) {
    b.addEventListener('click', function () {
      var previa = b.closest('.pv-previa');
      var leadId = previa.dataset.leadId;
      var tipo = previa.dataset.tipo;
      var status = previa.querySelector('.pv-previa-status');
      b.disabled = true; status.textContent = 'Enviando...'; status.className = 'pv-previa-status text-xs ml-1 text-slate-300';
      fetch('/dashboard/pos-venda/' + leadId + '/enviar-template', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: tipo })
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d.ok) {
          status.textContent = '✅ Enviado pela Eva!'; status.className = 'pv-previa-status text-xs ml-1 text-emerald-300';
          b.style.display = 'none';
        } else {
          status.textContent = 'Não enviou: ' + (d.erro || 'erro'); status.className = 'pv-previa-status text-xs ml-1 text-rose-300';
          b.disabled = false;
        }
      }).catch(function () {
        status.textContent = 'Falha de conexão.'; status.className = 'pv-previa-status text-xs ml-1 text-rose-300';
        b.disabled = false;
      });
    });
  });
  document.querySelectorAll('.pv-chat').forEach(function (box) {
    var leadId = box.dataset.leadId;
    var out = box.querySelector('.pv-chat-out');
    var enviar = box.querySelector('.pv-chat-send-eva');
    if (!enviar) return;
    enviar.addEventListener('click', function () {
      var texto = (out.textContent || '').trim();
      if (!texto) return;
      if (!confirm('Enviar esta mensagem pro cliente pela Eva?')) return;
      enviar.disabled = true;
      fetch('/dashboard/pos-venda/' + leadId + '/enviar-texto', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: texto })
      }).then(function (r) { return r.json(); }).then(function (d) {
        alert(d.ok ? 'Enviado pela Eva! ✅' : ('Não enviou: ' + (d.erro || 'erro')));
      }).catch(function () { alert('Falha de conexão.'); })
        .finally(function () { enviar.disabled = false; });
    });
  });
})();
</script>`;

  return renderLayout({ active: 'pos_venda', title: 'Pós-venda', dark: true, user, body, scripts });
}
