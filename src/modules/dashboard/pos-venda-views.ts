// src/modules/dashboard/pos-venda-views.ts
// Tela de pós-venda: lista guiada por atenção. Os botões de ação disparam o
// template aprovado pela Eva; o chat do copiloto envia texto livre pela Eva.
//
// Renovação do miolo — R22 (28/09/2026): mesmos botões, classes-gancho pv-*,
// data-* e os 9 fetch do script; visual cc- do Command Center (tema escuro,
// sem Tailwind, CSS no <head>). Semáforo e termômetro viram pílulas (o ícone
// do termômetro fica: 🔥/🌤️/🧊). Tenant lê "assistente" no lugar de "Eva".
import { renderLayout, escapeHtml } from './views.js';
import type { DashUser } from './permissions.js';
import type { PosVendaLinha } from './pos-venda-queries.js';
import type { Saude } from './pos-venda-saude.js';
import type { AgendaAgrupada, TarefaAgenda } from './pos-venda-agenda.js';
import { formatPhoneBR } from '../meta-leadgen.js';
import { TEXTOS_PREVIA } from './pos-venda-envio.js';
import { temperatura } from './pos-venda-termometro.js';
import { sugestaoProativa } from './pos-venda-sugestao.js';
import { cabecalhoPagina, cartaoSecao, pilulaStatus, estadoVazio, faixaKpis, icone, type Tom } from './ui/componentes.js';
import { temaDaTela } from './ui/tema.js';
import { ECOSUN_COMPANY_ID } from '../tenant-resolver.js';

const SEMAFORO: Record<Saude, { tom: Tom; txt: string }> = {
  verde: { tom: 'normal', txt: 'Gerando ok' },
  amarelo: { tom: 'atencao', txt: 'Atenção' },
  vermelho: { tom: 'critico', txt: 'Crítico' },
};

const TERMOMETRO: Record<'quente' | 'morno' | 'frio', { ico: string; txt: string }> = {
  quente: { ico: '🔥', txt: 'Relacionamento quente' },
  morno: { ico: '🌤️', txt: 'Relacionamento morno' },
  frio: { ico: '🧊', txt: 'Relacionamento frio — atenção' },
};

// Botões disponíveis por linha.
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

function renderLinha(l: PosVendaLinha, assist: string): string {
  const agora = new Date();
  const temp = TERMOMETRO[temperatura(l, agora)];
  const sug = sugestaoProativa(l, agora);
  // O "Agora não" remove o closest('div') do botão: o chip é essa <div>.
  const chip = sug
    ? `<div class="cc-pv-sug">
         <button type="button" class="pv-sugestao-btn cc-pv-sug-btn"
           data-lead-id="${escapeHtml(l.leadId)}" data-tipo="${escapeHtml(sug.tipo)}" data-pedido="${escapeHtml(sug.pedidoEva)}">${icone('spark', 'xs')}${escapeHtml(sug.texto)}</button>
         <button type="button" class="pv-sug-dispensar cc-pv-link"
           data-lead-id="${escapeHtml(l.leadId)}" data-tipo="${escapeHtml(sug.tipo)}">Agora não</button>
       </div>`
    : '';
  const s = SEMAFORO[l.saude];
  const urgente = l.saude === 'vermelho' ? ' pv-urgent' : '';
  const nome = escapeHtml(l.nome);
  const phone = escapeHtml(formatPhoneBR(l.telefone ?? ''));
  const usina = [l.potenciaKwp ? `${l.potenciaKwp} kWp` : null, escapeHtml(l.marcaInversor ?? ''), escapeHtml(l.cidade ?? '')]
    .filter(Boolean).join(' · ');
  const botoes = BOTOES.map((b) =>
    b.tipo === 'contato'
      ? `<a href="/dashboard/leads/${escapeHtml(l.leadId)}" class="cc-btn cc-btn-sm">${b.label}</a>`
      : `<button type="button" class="pv-tpl-btn cc-btn cc-btn-sm" data-lead-id="${escapeHtml(l.leadId)}" data-tipo="${escapeHtml(b.tipo)}" data-nome="${escapeHtml(l.nome)}">${b.label}</button>`,
  ).join('');
  return `
  <article class="pv-card cc-pv-card cc-pv-${l.saude}${urgente}" data-lead-id="${escapeHtml(l.leadId)}">
    <div class="cc-pv-topo">
      <a href="/dashboard/leads/${escapeHtml(l.leadId)}" class="cc-pv-nome">${nome}</a>
      ${pilulaStatus(s.tom, s.txt)}
      <span class="cc-pv-temp" title="${temp.txt}">${temp.ico} <span class="cc-hide-m">${temp.txt}</span></span>
      ${l.semApi ? pilulaStatus('acompanhar', 'Sem API · leitura manual') : ''}
      <span class="cc-sp"></span>
      <span class="cc-pv-quando" title="Último contato">${icone('clock', 'xs')}${tempo(l.ultimoContatoEm)}</span>
    </div>
    <div class="cc-pv-meta">${phone ? `<span>${phone}</span>` : ''}${usina ? `<span>${usina}</span>` : ''}</div>
    <div class="cc-pv-proxima">${icone('right', 'xs')}${escapeHtml(l.proximaAcao.label)}</div>
    ${chip}
    <div class="cc-pv-botoes">${botoes}</div>
    <div class="pv-previa hidden cc-pv-caixa cc-pv-caixa-ouro" data-lead-id="${escapeHtml(l.leadId)}">
      <div class="cc-pv-caixa-t">Prévia — vai enviar isto pela ${assist}:</div>
      <div class="pv-previa-texto cc-pv-texto"></div>
      <div class="cc-pv-linha">
        <button type="button" class="pv-previa-enviar cc-btn cc-btn-sm cc-btn-gold">Enviar pela ${assist}</button>
        <button type="button" class="pv-previa-cancelar cc-btn cc-btn-sm cc-btn-ghost">Cancelar</button>
        <span class="pv-previa-status cc-pv-st"></span>
      </div>
    </div>
    <div class="cc-pv-ferramentas">
      <button type="button" class="pv-copiloto-btn cc-pv-link" data-lead-id="${escapeHtml(l.leadId)}">${icone('spark', 'xs')}${assist === 'Eva' ? 'Eva (copiloto)' : 'Copiloto'}</button>
      <button type="button" class="pv-notas-btn cc-pv-link" data-lead-id="${escapeHtml(l.leadId)}">${icone('file', 'xs')}Notas / Histórico</button>
      <button type="button" class="pv-lembrete-btn cc-pv-link" data-lead-id="${escapeHtml(l.leadId)}">${icone('plus', 'xs')}Lembrete</button>
    </div>
    <div class="pv-chat hidden cc-pv-caixa cc-form" data-lead-id="${escapeHtml(l.leadId)}">
      <textarea class="pv-chat-in" rows="2" placeholder="Ex: manda um lembrete da revisão"></textarea>
      <div class="cc-pv-linha"><button type="button" class="pv-chat-send cc-btn cc-btn-sm">Pedir</button></div>
      <div class="pv-chat-out cc-pv-texto"></div>
      <div class="cc-pv-linha">
        <button type="button" class="pv-chat-copy hidden cc-btn cc-btn-sm">Copiar</button>
        <button type="button" class="pv-chat-send-eva hidden cc-btn cc-btn-sm">Enviar pela ${assist}</button>
      </div>
    </div>
    <div class="pv-lembrete-form hidden cc-pv-caixa cc-form" data-lead-id="${escapeHtml(l.leadId)}">
      <input type="text" class="pv-lembrete-titulo" placeholder="Ex: ligar pro cliente sobre a revisão" maxlength="200" />
      <div class="cc-pv-linha">
        <input type="date" class="pv-lembrete-data" />
        <button type="button" class="pv-lembrete-salvar cc-btn cc-btn-sm">Salvar</button>
        <span class="pv-lembrete-status cc-pv-st"></span>
      </div>
    </div>
    <div class="pv-notas hidden cc-pv-caixa cc-form" data-lead-id="${escapeHtml(l.leadId)}">
      <textarea class="pv-nota-in" rows="2" placeholder="Nota interna (não vai pro cliente). Ex: prefere ser contactado de manhã" maxlength="1000"></textarea>
      <div class="cc-pv-linha">
        <button type="button" class="pv-nota-salvar cc-btn cc-btn-sm">Salvar nota</button>
        <span class="pv-nota-status cc-pv-st"></span>
      </div>
      <div class="cc-pv-caixa-t" style="margin-top:10px">Histórico</div>
      <div class="pv-historico cc-pv-hist">Carregando…</div>
    </div>
  </article>`;
}

function renderTarefaAgenda(t: TarefaAgenda): string {
  const data = t.dueAt ? new Date(t.dueAt).toLocaleDateString('pt-BR') : 'sem data';
  return `
  <div class="cc-pv-tarefa" data-tarefa-id="${escapeHtml(t.id)}">
    <div class="cc-pv-tarefa-txt">
      <a href="/dashboard/leads/${escapeHtml(t.leadId)}">${escapeHtml(t.nomeCliente)}</a>
      <small>${escapeHtml(t.titulo)} · ${escapeHtml(data)}</small>
    </div>
    <button type="button" class="pv-tarefa-ok cc-btn cc-btn-sm" data-tarefa-id="${escapeHtml(t.id)}" title="Concluir">✓</button>
    <button type="button" class="pv-tarefa-adiar cc-btn cc-btn-sm cc-btn-ghost" data-tarefa-id="${escapeHtml(t.id)}" data-dias="1" title="Adiar 1 dia">+1d</button>
    <button type="button" class="pv-tarefa-adiar cc-btn cc-btn-sm cc-btn-ghost" data-tarefa-id="${escapeHtml(t.id)}" data-dias="7" title="Adiar 7 dias">+7d</button>
  </div>`;
}

function grupoAgenda(titulo: string, tom: Tom, itens: TarefaAgenda[]): string {
  if (itens.length === 0) return '';
  return `<div class="cc-pv-grupo">${pilulaStatus(tom, `${titulo} (${itens.length})`)}${itens.map(renderTarefaAgenda).join('')}</div>`;
}

function renderAgenda(agenda: AgendaAgrupada): string {
  const vazia = !agenda.atrasados.length && !agenda.hoje.length && !agenda.semana.length;
  const corpo = vazia
    ? estadoVazio({ tipo: 'vazio', compacto: true, titulo: 'Nenhum lembrete por aqui', texto: 'Use "Lembrete" num cliente.' })
    : grupoAgenda('Atrasados', 'critico', agenda.atrasados)
      + grupoAgenda('Hoje', 'atencao', agenda.hoje)
      + grupoAgenda('Próximos 7 dias', 'info', agenda.semana);
  return cartaoSecao({ titulo: 'Agenda', classe: 'pv-agenda cc-pv-agenda', corpoHtml: corpo });
}

const CSS_POS_VENDA = `
.cc-pv .cc-kstrip{margin-bottom:16px}
.cc-pv-grade{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:16px;align-items:start}
.cc-pv-agenda{position:sticky;top:16px}
.cc-pv-card{border:1px solid var(--cc-line);border-left:4px solid var(--cc-ok);border-radius:14px;padding:14px 16px;margin-bottom:10px;background:linear-gradient(180deg,var(--cc-panel-top) 0%,var(--cc-panel-bot) 100%)}
.cc-pv-card.cc-pv-amarelo{border-left-color:var(--cc-warn)}
.cc-pv-card.cc-pv-vermelho{border-left-color:var(--cc-crit)}
@keyframes pvPulse{0%,100%{opacity:0}50%{opacity:1}}
.pv-urgent{position:relative}
.pv-urgent::after{content:"";position:absolute;inset:-1px;border-radius:14px;box-shadow:0 0 0 3px rgba(228,87,75,.35);opacity:0;animation:pvPulse 1.8s ease-in-out infinite;pointer-events:none}
@media (prefers-reduced-motion:reduce){.pv-urgent::after{animation:none;opacity:1}}
.cc-pv-topo{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px}
.cc-pv-nome{font-size:15px;font-weight:600;color:var(--cc-text);overflow-wrap:anywhere}
.cc-pv-nome:hover{color:var(--cc-gold-2)}
.cc-pv-temp{font-size:12.5px;color:var(--cc-muted)}
.cc-pv-quando{display:inline-flex;align-items:center;gap:4px;font-size:12.5px;color:var(--cc-muted)}
.cc-pv-meta{display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:4px;font-size:12.5px;color:var(--cc-faint)}
.cc-pv-proxima{display:flex;align-items:center;gap:6px;margin-top:8px;font-size:13px;color:var(--cc-gold-2)}
.cc-pv-sug{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:6px}
.cc-pv-sug-btn{display:inline-flex;align-items:center;gap:6px;text-align:left;font-size:12.5px;color:var(--cc-info);background:var(--cc-info-soft);border:1px solid rgba(56,189,248,.35);border-radius:999px;padding:5px 11px}
.cc-pv-link{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;color:var(--cc-muted);background:none;padding:6px 2px;min-height:32px}
.cc-pv-link:hover{color:var(--cc-text)}
.cc-pv-botoes{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.cc-pv-ferramentas{display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:6px}
.cc-pv-caixa{margin-top:10px;padding:12px;border:1px solid var(--cc-line);border-radius:12px;background:var(--cc-surface)}
.cc-pv-caixa-ouro{border-color:rgba(240,165,0,.4)}
.cc-pv-caixa-t{font-size:11.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--cc-muted);margin-bottom:6px}
.cc-pv-texto{font-size:13px;color:var(--cc-text);white-space:pre-wrap;overflow-wrap:anywhere}
.cc-pv-texto:empty{display:none}
.cc-pv-linha{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:8px}
.cc-pv-caixa textarea,.cc-pv-caixa input[type=text]{width:100%}
.cc-pv-st{font-size:12.5px;color:var(--cc-muted)}
.cc-pv-ok{color:var(--cc-ok)}
.cc-pv-erro{color:var(--cc-crit)}
.cc-pv-hist{font-size:12.5px;color:var(--cc-text-2)}
.cc-pv-hist-l{padding:4px 0;border-bottom:1px solid var(--cc-line)}
.cc-pv-grupo{margin-bottom:12px}
.cc-pv-grupo>.cc-pill{margin-bottom:4px}
.cc-pv-tarefa{display:flex;align-items:center;gap:6px;padding:8px 0;border-bottom:1px solid var(--cc-line)}
.cc-pv-tarefa-txt{flex:1;min-width:0;font-size:13px}
.cc-pv-tarefa-txt a{color:var(--cc-text);font-weight:600}
.cc-pv-tarefa-txt small{display:block;color:var(--cc-muted);font-size:12px;overflow-wrap:anywhere}
@media (max-width:1100px){.cc-pv-grade{grid-template-columns:minmax(0,1fr)}.cc-pv-agenda{position:static}.cc-pv-lado{order:-1}}
@media (max-width:760px){.cc-pv-botoes .cc-btn{flex:1 1 calc(50% - 6px);justify-content:center}}
`;

export function renderPosVendaPage(linhas: PosVendaLinha[], user?: DashUser, agenda?: AgendaAgrupada): string {
  const casa = !user || user.companyId === ECOSUN_COMPANY_ID;
  const ASSIST = casa ? 'Eva' : 'assistente';
  const lista = linhas.length
    ? linhas.map((l) => renderLinha(l, ASSIST)).join('')
    : estadoVazio({ tipo: 'vazio', titulo: 'Nenhum cliente com usina ainda', texto: 'Quando houver usinas vinculadas, eles aparecem aqui.' });
  const ag = agenda ?? { atrasados: [], hoje: [], semana: [] };
  const agendaHtml = renderAgenda(ag);
  const conta = (s: Saude) => linhas.filter((l) => l.saude === s).length;
  const kpis = linhas.length ? faixaKpis([
    { rotulo: 'Clientes com usina', valor: linhas.length },
    { rotulo: 'Críticos', valor: conta('vermelho'), detalhe: 'pedem atenção agora' },
    { rotulo: 'Atenção', valor: conta('amarelo') },
    { rotulo: 'Lembretes atrasados', valor: ag.atrasados.length },
  ]) : '';

  const body = `<div class="cc-root cc-pv">
    ${cabecalhoPagina({
      trilha: [{ rotulo: 'Clientes' }, { rotulo: 'Pós-venda' }],
      titulo: 'Pós-venda / Relacionamento',
      subtitulo: 'Os cartões com borda vermelha pulsando precisam de atenção. Embaixo de cada cliente está a próxima ação sugerida.',
    })}
    ${kpis}
    <div class="cc-pv-grade">
      <div class="cc-pv-lista">${lista}</div>
      <div class="cc-pv-lado">${agendaHtml}</div>
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
        var inp = chat.querySelector('.pv-chat-in');
        var send = chat.querySelector('.pv-chat-send');
        if (!inp || !send) return;
        chat.classList.remove('hidden');
        inp.value = btn.dataset.pedido || '';
        send.click();
      });
    });
    document.querySelectorAll('.pv-sug-dispensar').forEach(function (b) {
      b.addEventListener('click', function () {
        var leadId = b.getAttribute('data-lead-id');
        var tipo = b.getAttribute('data-tipo');
        fetch('/dashboard/pos-venda/sugestao/dispensar', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leadId: leadId, tipo: tipo }),
        }).then(function () { var box = b.closest('div'); if (box) box.remove(); });
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
      b.disabled = true; status.textContent = 'Enviando...'; status.className = 'pv-previa-status cc-pv-st';
      fetch('/dashboard/pos-venda/' + leadId + '/enviar-template', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: tipo })
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d.ok) {
          status.textContent = '✅ Enviado pela ${ASSIST}!'; status.className = 'pv-previa-status cc-pv-st cc-pv-ok';
          b.style.display = 'none';
        } else {
          status.textContent = 'Não enviou: ' + (d.erro || 'erro'); status.className = 'pv-previa-status cc-pv-st cc-pv-erro';
          b.disabled = false;
        }
      }).catch(function () {
        status.textContent = 'Falha de conexão.'; status.className = 'pv-previa-status cc-pv-st cc-pv-erro';
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
      if (!confirm('Enviar esta mensagem pro cliente pela ${ASSIST}?')) return;
      enviar.disabled = true;
      fetch('/dashboard/pos-venda/' + leadId + '/enviar-texto', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: texto })
      }).then(function (r) { return r.json(); }).then(function (d) {
        alert(d.ok ? 'Enviado pela ${ASSIST}! ✅' : ('Não enviou: ' + (d.erro || 'erro')));
      }).catch(function () { alert('Falha de conexão.'); })
        .finally(function () { enviar.disabled = false; });
    });
  });
})();
</script>
  <script>
(function () {
  function toggle(sel, leadId) { var el = document.querySelector(sel + '[data-lead-id="' + leadId + '"]'); if (el) el.classList.toggle('hidden'); return el; }
  document.querySelectorAll('.pv-lembrete-btn').forEach(function (b) {
    b.addEventListener('click', function () { toggle('.pv-lembrete-form', b.dataset.leadId); });
  });
  document.querySelectorAll('.pv-lembrete-salvar').forEach(function (b) {
    b.addEventListener('click', function () {
      var form = b.closest('.pv-lembrete-form'); var leadId = form.dataset.leadId;
      var titulo = (form.querySelector('.pv-lembrete-titulo').value || '').trim();
      var data = form.querySelector('.pv-lembrete-data').value || '';
      var status = form.querySelector('.pv-lembrete-status');
      if (!titulo) { status.textContent = 'Escreva o lembrete.'; status.className = 'pv-lembrete-status cc-pv-st cc-pv-erro'; return; }
      b.disabled = true; status.textContent = 'Salvando…'; status.className = 'pv-lembrete-status cc-pv-st';
      fetch('/dashboard/pos-venda/' + leadId + '/lembrete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titulo: titulo, dueAt: data || null })
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d.ok) { status.textContent = '✅ Na agenda! Recarregue pra ver.'; status.className = 'pv-lembrete-status cc-pv-st cc-pv-ok'; }
        else { status.textContent = d.erro || 'erro'; status.className = 'pv-lembrete-status cc-pv-st cc-pv-erro'; b.disabled = false; }
      }).catch(function () { status.textContent = 'Falha de conexão.'; b.disabled = false; });
    });
  });
  document.querySelectorAll('.pv-notas-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      var painel = toggle('.pv-notas', b.dataset.leadId);
      if (painel && !painel.classList.contains('hidden')) carregarHistorico(b.dataset.leadId, painel);
    });
  });
  function carregarHistorico(leadId, painel) {
    var alvo = painel.querySelector('.pv-historico');
    fetch('/dashboard/pos-venda/' + leadId + '/historico').then(function (r) { return r.json(); }).then(function (d) {
      var itens = (d && d.itens) || [];
      if (!itens.length) { alvo.textContent = 'Sem histórico ainda.'; return; }
      alvo.innerHTML = '';
      itens.forEach(function (i) {
        var row = document.createElement('div');
        row.className = 'cc-pv-hist-l';
        var data = new Date(i.created_at).toLocaleDateString('pt-BR');
        var label = (i.titulo || '') + (i.descricao ? ' — ' + i.descricao : '');
        var dt = document.createElement('span'); dt.className = 'cc-faint'; dt.textContent = data;
        row.appendChild(dt); row.appendChild(document.createTextNode(' · ' + label));
        alvo.appendChild(row);
      });
    }).catch(function () { alvo.textContent = 'Falha ao carregar histórico.'; });
  }
  document.querySelectorAll('.pv-nota-salvar').forEach(function (b) {
    b.addEventListener('click', function () {
      var painel = b.closest('.pv-notas'); var leadId = painel.dataset.leadId;
      var texto = (painel.querySelector('.pv-nota-in').value || '').trim();
      var status = painel.querySelector('.pv-nota-status');
      if (!texto) { status.textContent = 'Escreva a nota.'; status.className = 'pv-nota-status cc-pv-st cc-pv-erro'; return; }
      b.disabled = true; status.textContent = 'Salvando…'; status.className = 'pv-nota-status cc-pv-st';
      fetch('/dashboard/pos-venda/' + leadId + '/nota', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: texto })
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d.ok) { status.textContent = '✅ Salva!'; status.className = 'pv-nota-status cc-pv-st cc-pv-ok'; painel.querySelector('.pv-nota-in').value = ''; carregarHistorico(leadId, painel); }
        else { status.textContent = d.erro || 'erro'; status.className = 'pv-nota-status cc-pv-st cc-pv-erro'; }
      }).catch(function () { status.textContent = 'Falha de conexão.'; })
        .finally(function () { b.disabled = false; });
    });
  });
  document.querySelectorAll('.pv-tarefa-ok').forEach(function (b) {
    b.addEventListener('click', function () {
      b.disabled = true;
      fetch('/dashboard/pos-venda/tarefa/' + b.dataset.tarefaId + '/concluir', { method: 'POST' })
        .then(function (r) { return r.json(); }).then(function (d) {
          if (d.ok) { var row = b.closest('[data-tarefa-id]'); if (row) row.remove(); } else b.disabled = false;
        }).catch(function () { b.disabled = false; });
    });
  });
  document.querySelectorAll('.pv-tarefa-adiar').forEach(function (b) {
    b.addEventListener('click', function () {
      b.disabled = true;
      fetch('/dashboard/pos-venda/tarefa/' + b.dataset.tarefaId + '/adiar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dias: Number(b.dataset.dias) || 1 })
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d.ok) { var row = b.closest('[data-tarefa-id]'); if (row) row.remove(); } else b.disabled = false;
      }).catch(function () { b.disabled = false; });
    });
  });
})();
  </script>`;

  return renderLayout({
    active: 'pos_venda', title: 'Pós-venda', dark: temaDaTela(user, 'escuro') === 'escuro', user, body, scripts,
    tailwind: false, largo: true, cabeca: `<style>${CSS_POS_VENDA}</style>`,
  });
}
