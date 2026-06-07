// src/modules/dashboard/clientes-views.ts
import { renderLayout } from './views.js';
import { renderClienteSelector } from './proprietario.js';
import { statusLabel, statusCorChip } from '../clientes/mappers.js';
import { CONCESSIONARIAS_BR, getConcessionariaById } from '../concessionarias.js';
import { CIDADES_DF_GO } from '../cidades-df-go.js';
import type { ClienteRow, ClienteDetail, InsightCard, SistemaOrfaoCard } from '../clientes/types.js';

// Datalist comum de cidades DF+GO (renderizado uma vez por página, referenciado por list="cidades-df-go")
const CIDADES_DATALIST_HTML = `<datalist id="cidades-df-go">${CIDADES_DF_GO.map((c) => `<option value="${c}">`).join('')}</datalist>`;

// JS de auto-preenchimento por CEP via ViaCEP. Reutilizado no modal e no form.
const CEP_LOOKUP_SCRIPT = `
<script>
  async function puxarCep(cepInput, formEl) {
    const raw = (cepInput.value || '').replace(/\\D/g, '');
    if (raw.length !== 8) return;
    try {
      const r = await fetch('https://viacep.com.br/ws/' + raw + '/json/');
      if (!r.ok) return;
      const d = await r.json();
      if (d.erro) return;
      const setIfEmpty = (selector, value) => {
        if (!value) return;
        const el = formEl.querySelector(selector);
        if (el && !el.value) el.value = value;
      };
      setIfEmpty('[name="endereco_rua"]', d.logradouro);
      setIfEmpty('[name="neighborhood"]', d.bairro);
      // cidade e UF sempre sobrescrevem (CEP é fonte da verdade)
      const elCity = formEl.querySelector('[name="city"]'); if (elCity && d.localidade) elCity.value = d.localidade;
      const elUf = formEl.querySelector('[name="uf"]'); if (elUf && d.uf) elUf.value = d.uf;
    } catch (e) { /* falha silenciosa */ }
  }
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('input[name="cep"]').forEach((el) => {
      el.addEventListener('blur', () => puxarCep(el, el.closest('form')));
    });
    document.querySelectorAll('.js-num').forEach((el) => {
      el.addEventListener('blur', () => { el.value = (el.value || '').replace(',', '.'); });
    });
    document.querySelectorAll('form').forEach((f) => {
      f.addEventListener('submit', () => {
        f.querySelectorAll('.js-num').forEach((el) => { el.value = (el.value || '').replace(',', '.'); });
      });
    });
  });
</script>`;

function escapeHtml(s: string | null | undefined): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function avatarInitials(name: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();
}

export function renderClientesListPage(
  rows: ClienteRow[],
  filters: { q?: string; concessionaria?: string; cidade?: string; ord?: string },
  sistemasOrfaos: SistemaOrfaoCard[] = [],
  pagination: { total: number; limit: number; offset: number; mostrarArquivados?: boolean } = { total: rows.length, limit: 50, offset: 0 },
): string {
  const { total, limit, offset } = pagination;
  const mostrarArquivados = pagination.mostrarArquivados === true;
  const pagina = Math.floor(offset / limit) + 1;
  const totalPaginas = Math.max(1, Math.ceil(total / limit));
  const queryStringSemOffset = (() => {
    const parts: string[] = [];
    if (filters.q) parts.push(`q=${encodeURIComponent(filters.q)}`);
    if (filters.concessionaria) parts.push(`concessionaria=${encodeURIComponent(filters.concessionaria)}`);
    if (filters.cidade) parts.push(`cidade=${encodeURIComponent(filters.cidade)}`);
    if (filters.ord) parts.push(`ord=${encodeURIComponent(filters.ord)}`);
    if (mostrarArquivados) parts.push('show=arquivados');
    return parts.length > 0 ? '&' + parts.join('&') : '';
  })();

  const opt = (v: string, label: string, sel?: string) =>
    `<option value="${escapeHtml(v)}" ${sel === v ? 'selected' : ''}>${escapeHtml(label)}</option>`;

  const cidades = [...new Set(rows.map((r) => r.city).filter(Boolean) as string[])].sort();

  const card = (r: ClienteRow) => {
    const concNome = r.concessionaria ? getConcessionariaById(r.concessionaria)?.nome ?? r.concessionaria : '—';
    return `
    <a href="/dashboard/clientes/${escapeHtml(r.id)}" class="block bg-slate-800/60 hover:bg-slate-800 border border-slate-700 rounded-xl p-4 transition">
      <div class="flex items-center gap-3 mb-3">
        <div class="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center font-bold text-slate-900 text-sm">${escapeHtml(avatarInitials(r.name))}</div>
        <div class="flex-1 min-w-0">
          <div class="font-semibold text-slate-100 truncate">${escapeHtml(r.name) || '—'}</div>
          <div class="text-xs text-slate-500 truncate">${escapeHtml(r.phone)}</div>
        </div>
        <div class="px-2 py-0.5 rounded-full border text-[10px] font-semibold ${statusCorChip(r.installation_status)}">${escapeHtml(statusLabel(r.installation_status))}</div>
      </div>
      <div class="grid grid-cols-2 gap-2 text-xs">
        <div>
          <div class="text-slate-500 uppercase tracking-wider text-[9px]">Cidade</div>
          <div class="text-slate-200">${escapeHtml([r.city, r.uf].filter(Boolean).join('/') || '—')}</div>
        </div>
        <div>
          <div class="text-slate-500 uppercase tracking-wider text-[9px]">Concessionária</div>
          <div class="text-slate-200 truncate">${escapeHtml(concNome)}</div>
        </div>
        <div>
          <div class="text-slate-500 uppercase tracking-wider text-[9px]">Consumo</div>
          <div class="text-slate-200">${r.consumo_medio_kwh ? `${r.consumo_medio_kwh} kWh/mês` : '—'}</div>
        </div>
        <div>
          <div class="text-slate-500 uppercase tracking-wider text-[9px]">Conta</div>
          <div class="text-slate-200">${r.conta_media_brl ? `R$ ${r.conta_media_brl.toFixed(0)}` : '—'}</div>
        </div>
      </div>
    </a>`;
  };

  const body = `
    <div class="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-slate-100">${mostrarArquivados ? '📦 Clientes arquivados' : '👥 Clientes'} — ${total}</h1>
        <p class="text-slate-400 text-sm">${mostrarArquivados ? 'Fora da lista ativa, mas com histórico intacto. Clica em qualquer um pra restaurar.' : 'Quem comprou. Lista de clientes instalados / operando / pós-venda.'}${totalPaginas > 1 ? ` <span class="text-slate-500">· Página ${pagina} de ${totalPaginas}</span>` : ''}</p>
      </div>
      <div class="flex gap-2 shrink-0">
        ${mostrarArquivados
          ? `<a href="/dashboard/clientes" class="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-semibold">← Voltar pra ativos</a>`
          : `<a href="/dashboard/clientes?show=arquivados" class="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm">📦 Arquivados</a>
             <a href="/dashboard/clientes/novo" class="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold">➕ Novo cliente</a>`}
      </div>
    </div>

    <form method="get" action="/dashboard/clientes" class="mb-6 flex flex-wrap gap-2 items-center">
      <input name="q" value="${escapeHtml(filters.q ?? '')}" placeholder="🔎 nome, telefone, email, CPF" class="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm flex-1 min-w-[200px]">
      <select name="concessionaria" class="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm">
        ${opt('', 'Todas concessionárias', filters.concessionaria)}
        ${CONCESSIONARIAS_BR.map((c) => opt(c.id, c.nome, filters.concessionaria)).join('')}
      </select>
      <select name="cidade" class="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm">
        ${opt('', 'Todas cidades', filters.cidade)}
        ${cidades.map((c) => opt(c, c, filters.cidade)).join('')}
      </select>
      <select name="ord" class="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm">
        ${opt('', 'Mais recente', filters.ord)}
        ${opt('nome', 'Nome A-Z', filters.ord)}
      </select>
      <button class="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold">Filtrar</button>
      <a href="/dashboard/clientes" class="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm">Limpar</a>
    </form>

    ${rows.length === 0 && sistemasOrfaos.length === 0
      ? `<div class="bg-slate-800/60 rounded-xl border border-slate-700 p-12 text-center text-slate-400">Nenhum cadastrado ainda. Use <strong>➕ Novo cliente</strong> pra começar.</div>`
      : ''}

    ${rows.length > 0
      ? `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">${rows.map(card).join('')}</div>`
      : ''}

    ${total > limit ? `
    <div class="flex items-center justify-between mt-6 text-sm text-slate-400">
      <div>Mostrando ${offset + 1}–${Math.min(offset + limit, total)} de ${total}</div>
      <div class="flex gap-2">
        ${offset > 0
          ? `<a href="/dashboard/clientes?offset=${Math.max(0, offset - limit)}${queryStringSemOffset}" class="px-3 py-2 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200 rounded">← Anterior</a>`
          : `<span class="px-3 py-2 text-slate-600">← Anterior</span>`}
        ${offset + limit < total
          ? `<a href="/dashboard/clientes?offset=${offset + limit}${queryStringSemOffset}" class="px-3 py-2 bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200 rounded">Próxima →</a>`
          : `<span class="px-3 py-2 text-slate-600">Próxima →</span>`}
      </div>
    </div>` : ''}

    ${sistemasOrfaos.length > 0 ? `
    <div class="mt-8 mb-4">
      <h2 class="text-lg font-semibold text-slate-100">🔌 Sistemas sem cliente vinculado <span class="text-amber-400">— ${sistemasOrfaos.length}</span></h2>
      <p class="text-slate-400 text-xs mt-1">Importados via Deye/SolarEdge sem associação a lead. Clica em "Vincular cliente" pra cadastrar os dados reais e ativar o cockpit.</p>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      ${sistemasOrfaos.map((s) => `
        <div class="bg-amber-500/5 border border-amber-500/30 rounded-xl p-4">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-12 h-12 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 text-xl">?</div>
            <div class="flex-1 min-w-0">
              <div class="font-semibold text-slate-100 truncate">${escapeHtml(s.apelido)}</div>
              <div class="text-xs text-amber-300">Sistema sem cliente</div>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2 text-xs mb-3">
            <div><div class="text-slate-500 uppercase tracking-wider text-[9px]">Marca</div><div class="text-slate-200 truncate">${escapeHtml(s.marca_inversor)}</div></div>
            <div><div class="text-slate-500 uppercase tracking-wider text-[9px]">Potência</div><div class="text-slate-200">${s.potencia_kwp ? s.potencia_kwp + ' kWp' : '—'}</div></div>
            <div><div class="text-slate-500 uppercase tracking-wider text-[9px]">Cidade</div><div class="text-slate-200">${escapeHtml([s.cidade, s.uf].filter(Boolean).join('/') || '—')}</div></div>
            <div><div class="text-slate-500 uppercase tracking-wider text-[9px]">Instalado em</div><div class="text-slate-200">${escapeHtml(s.data_instalacao ?? '—')}</div></div>
          </div>
          <button onclick="abrirVinculo('${escapeHtml(s.sistema_id)}','${escapeHtml(s.apelido).replace(/'/g, "\\\\'")}')" class="w-full px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold">🔗 Vincular cliente</button>
        </div>`).join('')}
    </div>

    <div id="modal-vinculo" class="hidden fixed inset-0 bg-black/70 flex items-center justify-center z-50" onclick="if(event.target===this)fecharVinculo()">
      <div class="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-md mx-4">
        <h3 class="text-lg font-semibold text-slate-100 mb-1">Vincular cliente ao sistema</h3>
        <p class="text-xs text-slate-400 mb-4">Sistema: <span id="modal-sistema-apelido" class="text-amber-300"></span></p>
        <form id="form-vincular" method="post" action="/dashboard/clientes/vincular-sistema" class="space-y-3">
          <input type="hidden" name="sistema_id" id="modal-sistema-id">
          ${renderClienteSelector({ idPrefix: 'orf', dark: true })}
          <div class="flex gap-2 pt-2">
            <button type="button" onclick="fecharVinculo()" class="flex-1 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm">Cancelar</button>
            <button type="submit" class="flex-1 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold">Vincular</button>
          </div>
        </form>
      </div>
    </div>
    <script>
      function abrirVinculo(sistemaId, apelido) {
        document.getElementById('modal-sistema-id').value = sistemaId;
        document.getElementById('modal-sistema-apelido').textContent = apelido;
        document.getElementById('modal-vinculo').classList.remove('hidden');
      }
      function fecharVinculo() {
        document.getElementById('modal-vinculo').classList.add('hidden');
      }
    </script>` : ''}
  `;

  return renderLayout({ active: 'clientes', title: 'Clientes', body, dark: true });
}

// ============================================================
// Detail page (T10 estrutura + T11 abas)
// ============================================================

function progressoJornada(installation_status: string | null): string {
  const ordem = ['lead', 'proposta', 'contrato', 'instalado', 'operando', 'pos_venda'];
  const map: Record<string, string> = {
    novo: 'lead', qualificando: 'lead', qualificado: 'proposta',
    proposta_aceita: 'contrato', contrato_assinado: 'contrato',
    instalado: 'instalado', medidor_trocado: 'instalado',
    operando: 'operando', pos_venda_concluido: 'pos_venda',
  };
  const atual = map[installation_status ?? ''] ?? 'lead';
  const atualIdx = ordem.indexOf(atual);
  const fases = [
    { id: 'lead', label: 'Lead' },
    { id: 'proposta', label: 'Proposta' },
    { id: 'contrato', label: 'Contrato' },
    { id: 'instalado', label: 'Instalado' },
    { id: 'operando', label: 'Operando' },
    { id: 'pos_venda', label: 'Pós-venda' },
  ];
  return `
    <div class="flex gap-1 items-center text-[10px]">
      ${fases.map((f, i) => {
        const ativa = i <= atualIdx;
        const ehAtual = i === atualIdx;
        const cor = ativa ? (ehAtual ? 'bg-cyan-400' : 'bg-cyan-500') : 'bg-slate-700';
        return `
          <div class="flex-1 h-1.5 rounded-full ${cor}"></div>
          <span class="${ativa ? 'text-cyan-300' : 'text-slate-500'}">${ehAtual ? '▶' : '🟢'} ${f.label}</span>`;
      }).join('')}
    </div>`;
}

function renderKpisStrip(d: ClienteDetail): string {
  const kpi = (label: string, valor: string, sub: string, cor: string) => `
    <div class="bg-slate-800/40 border border-slate-700 rounded-xl p-3">
      <div class="text-[10px] text-slate-400 uppercase tracking-wider">${label}</div>
      <div class="text-2xl font-bold ${cor} mt-1">${valor}</div>
      <div class="text-[10px] text-slate-500 mt-1">${sub}</div>
    </div>`;

  const sistemaKpi = d.sistema
    ? kpi('Sistema', `${d.sistema.potencia_kwp ?? '—'}`, `kWp · ${d.sistema.qtd_paineis ?? '?'} painéis`, 'text-sky-400')
    : kpi('Sistema', '—', '<a href="/dashboard/monitoramento" class="underline">vincular</a>', 'text-slate-500');

  const economiaEstim = d.sistema ? `R$ ${(d.sistema.geracao_total_kwh * 1).toFixed(0)}` : '—';
  const saudePct = d.sistema ? Math.round(d.sistema.ratio_ultimos_7d * 100) : null;
  const saudeStr = saudePct != null ? `${saudePct}%` : '—';
  const saudeCor = saudePct == null ? 'text-slate-500'
    : saudePct >= 90 ? 'text-green-400'
    : saudePct >= 70 ? 'text-amber-400' : 'text-rose-400';

  return `
    <div class="grid grid-cols-2 md:grid-cols-5 gap-2 my-4">
      ${sistemaKpi}
      ${kpi('Economia', economiaEstim, 'estimativa simples', 'text-purple-400')}
      ${kpi('Saúde', saudeStr, 'vs esperado 7d', saudeCor)}
      ${kpi('Propostas', String(d.propostas.length), `${d.propostas.filter(p => p.cliente_respondeu_at).length} respondidas`, 'text-amber-400')}
      ${kpi('Alertas', String(d.alertas_ativos.length), d.alertas_ativos.length ? 'ativos' : 'sistema ok', d.alertas_ativos.length ? 'text-rose-400' : 'text-green-400')}
    </div>`;
}

function renderInsightsRow(insights: InsightCard[]): string {
  if (insights.length === 0) {
    return `<div class="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4 my-4 text-center text-sm text-purple-200">🤖 ✅ Cliente em ordem — nada urgente agora.</div>`;
  }
  const card = (c: InsightCard) => `
    <div class="bg-slate-900/60 rounded-lg p-3 border border-purple-500/20">
      <div class="text-xs text-slate-200 leading-relaxed">${escapeHtml(c.texto)}</div>
      ${c.cta
        ? `<form action="/dashboard/clientes/eva-action" method="post" class="mt-2">
             <input type="hidden" name="action" value="${escapeHtml(c.cta.action)}">
             <input type="hidden" name="lead_id" value="${escapeHtml(String(c.cta.params?.lead_id ?? ''))}">
             <input type="hidden" name="extra" value='${escapeHtml(JSON.stringify(c.cta.params))}'>
             <button class="text-purple-300 underline text-[10px]">${escapeHtml(c.cta.label)}</button>
           </form>`
        : `<span class="text-slate-500 text-[10px]">CTA indisponível (lead em opt-out)</span>`}
    </div>`;
  return `
    <div class="bg-purple-500/5 border border-purple-500/20 rounded-xl p-3 my-4">
      <div class="text-[10px] text-purple-300 uppercase tracking-wider mb-2">🤖 EVA SUGERE</div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-2">${insights.map(card).join('')}</div>
    </div>`;
}

// ============================================================
// Conteúdo das abas (T11)
// ============================================================

function renderAbaDados(d: ClienteDetail): string {
  const TIPOS = [
    { id: 'residencial', label: 'Residencial' },
    { id: 'comercial', label: 'Comercial' },
    { id: 'rural', label: 'Rural' },
  ];
  const ESTADOS_CIVIS = [
    { id: 'solteiro', label: 'Solteiro(a)' },
    { id: 'casado', label: 'Casado(a)' },
    { id: 'uniao_estavel', label: 'União estável' },
    { id: 'divorciado', label: 'Divorciado(a)' },
    { id: 'separado', label: 'Separado(a)' },
    { id: 'viuvo', label: 'Viúvo(a)' },
  ];
  const TARIFA_CLASSES = [
    { id: 'B1', label: 'B1 — Residencial' },
    { id: 'B2', label: 'B2 — Rural' },
    { id: 'B3', label: 'B3 — Demais (Comercial BT)' },
    { id: 'B4', label: 'B4 — Iluminação pública' },
    { id: 'A4', label: 'A4 — Comercial/Industrial AT' },
    { id: 'A3', label: 'A3 — Industrial AT' },
  ];
  const TARIFA_MODALIDADES = [
    { id: 'convencional', label: 'Convencional' },
    { id: 'branca', label: 'Branca' },
    { id: 'verde', label: 'Verde (Horosazonal)' },
    { id: 'azul', label: 'Azul (Horosazonal)' },
  ];
  const INSTALLATION_STATUSES = [
    { id: 'novo', label: 'Novo lead' },
    { id: 'qualificando', label: 'Qualificando' },
    { id: 'qualificado', label: 'Qualificado' },
    { id: 'proposta_aceita', label: 'Proposta aceita' },
    { id: 'contrato_assinado', label: 'Contrato assinado' },
    { id: 'instalado', label: 'Instalado' },
    { id: 'medidor_trocado', label: 'Medidor trocado' },
    { id: 'operando', label: 'Operando' },
    { id: 'pos_venda_concluido', label: 'Pós-venda concluído' },
  ];
  const FORMAS_PG = [
    { id: 'cartao', label: 'Cartão' },
    { id: 'boleto', label: 'Boleto' },
    { id: 'a_vista', label: 'À vista' },
    { id: 'financiamento', label: 'Financiamento' },
  ];
  const BANCOS = [
    { id: 'bv', label: 'BV' },
    { id: 'solfacil', label: 'Sol Fácil' },
    { id: 'solagora', label: 'Sol Agora' },
    { id: 'santander', label: 'Santander' },
    { id: 'btg', label: 'BTG Pactual' },
    { id: 'outro', label: 'Outro' },
  ];

  const opt = (v: string, label: string, sel?: string | null) =>
    `<option value="${escapeHtml(v)}" ${sel === v ? 'selected' : ''}>${escapeHtml(label)}</option>`;

  return `
    <form id="form-dados" action="/dashboard/clientes/${escapeHtml(d.id)}/edit" method="post" class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <fieldset class="bg-slate-800/40 border border-slate-700 rounded-xl p-3">
        <legend class="text-[10px] text-slate-400 uppercase tracking-wider px-1">👤 Identificação</legend>
        <div class="grid grid-cols-2 gap-2 mt-2">
          <input name="name" value="${escapeHtml(d.name ?? '')}" placeholder="Nome completo" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm col-span-2">
          <input name="cpf_cnpj" value="${escapeHtml(d.cpf_cnpj ?? '')}" placeholder="CPF/CNPJ (só números)" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm">
          <input type="date" name="data_nascimento" value="${escapeHtml(d.data_nascimento ?? '')}" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm">
          <select name="profile" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            ${opt('', '— Tipo —', d.profile)}${TIPOS.map(t => opt(t.id, t.label, d.profile)).join('')}
          </select>
          <select name="estado_civil" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            ${opt('', '— Estado civil —', d.estado_civil)}${ESTADOS_CIVIS.map(e => opt(e.id, e.label, d.estado_civil)).join('')}
          </select>
        </div>
      </fieldset>

      <fieldset class="bg-slate-800/40 border border-slate-700 rounded-xl p-3">
        <legend class="text-[10px] text-slate-400 uppercase tracking-wider px-1">📞 Contato</legend>
        <div class="grid grid-cols-2 gap-2 mt-2">
          <input name="phone" value="${escapeHtml(d.phone)}" placeholder="WhatsApp" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm">
          <input name="email" type="email" value="${escapeHtml(d.email ?? '')}" placeholder="Email" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm">
        </div>
      </fieldset>

      <fieldset class="bg-slate-800/40 border border-slate-700 rounded-xl p-3 md:col-span-2">
        <legend class="text-[10px] text-slate-400 uppercase tracking-wider px-1">🏠 Endereço</legend>
        <div class="grid grid-cols-6 gap-2 mt-2">
          <input name="cep" value="${escapeHtml(d.cep ?? '')}" placeholder="CEP" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm">
          <input name="endereco_rua" value="${escapeHtml(d.endereco_rua ?? '')}" placeholder="Rua" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm col-span-3">
          <input name="endereco_numero" value="${escapeHtml(d.endereco_numero ?? '')}" placeholder="Nº" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm">
          <input name="endereco_complemento" value="${escapeHtml(d.endereco_complemento ?? '')}" placeholder="Compl." class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm">
          <input name="neighborhood" value="${escapeHtml(d.neighborhood ?? '')}" placeholder="Bairro" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm col-span-2">
          <input name="city" list="cidades-df-go" value="${escapeHtml(d.city ?? '')}" placeholder="Cidade" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm col-span-2">
          <input name="uf" value="${escapeHtml(d.uf ?? '')}" placeholder="UF" maxlength="2" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm">
        </div>
      </fieldset>

      <fieldset class="bg-slate-800/40 border border-slate-700 rounded-xl p-3">
        <legend class="text-[10px] text-slate-400 uppercase tracking-wider px-1">⚡ Concessionária + UC</legend>
        <div class="grid grid-cols-2 gap-2 mt-2">
          <select name="concessionaria" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm col-span-2">
            ${opt('', '— Concessionária —', d.concessionaria)}${CONCESSIONARIAS_BR.map(c => opt(c.id, c.nome, d.concessionaria)).join('')}
          </select>
          <input name="uc_numero" value="${escapeHtml(d.uc_numero ?? '')}" placeholder="UC (nº instalação)" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm">
          <select name="tarifa_classe" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            ${opt('', '— Classe tarifária —', d.tarifa_classe)}${TARIFA_CLASSES.map(t => opt(t.id, t.label, d.tarifa_classe)).join('')}
          </select>
          <select name="tarifa_modalidade" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm col-span-2">
            ${opt('', '— Modalidade tarifária —', d.tarifa_modalidade)}${TARIFA_MODALIDADES.map(t => opt(t.id, t.label, d.tarifa_modalidade)).join('')}
          </select>
        </div>
      </fieldset>

      <fieldset class="bg-slate-800/40 border border-slate-700 rounded-xl p-3">
        <legend class="text-[10px] text-slate-400 uppercase tracking-wider px-1">💰 Consumo + Pagamento</legend>
        <div class="grid grid-cols-2 gap-2 mt-2">
          <input type="text" inputmode="decimal" name="consumo_medio_kwh" value="${d.consumo_medio_kwh ?? ''}" placeholder="Consumo médio (kWh/mês, ex: 1300)" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm js-num">
          <input type="text" inputmode="decimal" name="conta_media_brl" value="${d.conta_media_brl ?? ''}" placeholder="Conta média (R$/mês, ex: 1560)" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm js-num">
          <select name="forma_pagamento" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            ${opt('', '— Forma de pagamento —', d.forma_pagamento)}${FORMAS_PG.map(f => opt(f.id, f.label, d.forma_pagamento)).join('')}
          </select>
          <select name="banco_financiamento" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            ${opt('', '— Banco do financiamento —', d.banco_financiamento)}${BANCOS.map(b => opt(b.id, b.label, d.banco_financiamento)).join('')}
          </select>
        </div>
      </fieldset>

      <fieldset class="bg-slate-800/40 border border-slate-700 rounded-xl p-3 md:col-span-2">
        <legend class="text-[10px] text-slate-400 uppercase tracking-wider px-1">🔀 Rateio MMGD (consumidor)</legend>
        <label class="flex items-center gap-2 mt-2 text-sm text-slate-300">
          <input type="checkbox" name="eh_consumidor_rateio" value="true" ${d.eh_consumidor_rateio ? 'checked' : ''}>
          Este cliente recebe créditos de uma UC geradora MMGD
        </label>
        <div class="grid grid-cols-3 gap-2 mt-2">
          <input name="uc_geradora_lead_id" value="${escapeHtml(d.uc_geradora_lead_id ?? '')}" placeholder="UC geradora (lead_id)" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm">
          <input type="text" inputmode="decimal" name="percentual_rateio" value="${d.percentual_rateio ?? ''}" placeholder="% rateio (0-100, vírgula ok)" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm js-num">
          <input type="text" inputmode="decimal" name="credito_esperado_kwh" value="${d.credito_esperado_kwh ?? ''}" placeholder="Crédito esperado kWh" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm js-num">
        </div>
      </fieldset>

      <fieldset class="bg-slate-800/40 border border-slate-700 rounded-xl p-3 md:col-span-2">
        <legend class="text-[10px] text-slate-400 uppercase tracking-wider px-1">💼 Comercial + Observações</legend>
        <div class="grid grid-cols-3 gap-2 mt-2">
          <input name="vendedor_responsavel" value="${escapeHtml(d.vendedor_responsavel ?? '')}" placeholder="Vendedor responsável" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm">
          <input name="lead_source" value="${escapeHtml(d.lead_source ?? '')}" placeholder="Origem (CTWA, indicação, orgânico...)" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm">
          <select name="installation_status" class="px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            ${opt('', '— Status —', d.installation_status)}${INSTALLATION_STATUSES.map(s => opt(s.id, s.label, d.installation_status)).join('')}
          </select>
        </div>
        <textarea name="observacoes_perfil" placeholder="Observações livres" class="w-full mt-2 px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-sm" rows="3">${escapeHtml(d.observacoes_perfil ?? '')}</textarea>
      </fieldset>

      <div class="md:col-span-2 flex gap-2">
        <button class="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold">💾 Salvar dados</button>
      </div>
    </form>`;
}

function renderAbaAnexos(d: ClienteDetail): string {
  const TIPOS = [
    { id: 'parecer_acesso', label: '📋 Parecer de acesso' },
    { id: 'foto_telhado', label: '📷 Foto telhado' },
    { id: 'foto_instalacao', label: '📷 Foto instalação' },
    { id: 'foto_inversor', label: '📷 Foto inversor' },
    { id: 'foto_visita_tecnica', label: '📷 Visita técnica' },
    { id: 'contrato', label: '📄 Contrato' },
    { id: 'outros', label: '📁 Outros' },
  ];
  const items = d.anexos.map(a => `
    <div class="relative bg-slate-800/40 border border-slate-700 rounded-lg p-2 group">
      <a href="${escapeHtml(a.signed_url ?? '#')}" target="_blank" class="block aspect-square flex flex-col items-center justify-center text-slate-400 hover:text-cyan-300">
        <div class="text-2xl">${a.mime_type?.startsWith('image/') ? '🖼' : a.mime_type === 'application/pdf' ? '📄' : '📁'}</div>
        <div class="text-[10px] mt-1 truncate w-full text-center">${escapeHtml(a.tipo)}</div>
      </a>
      <form action="/dashboard/clientes/${escapeHtml(d.id)}/anexos/${escapeHtml(a.id)}" method="post" onsubmit="return confirm('Remover este anexo?')" class="absolute top-1 right-1 opacity-0 group-hover:opacity-100">
        <input type="hidden" name="_method" value="delete">
        <button class="bg-rose-600 hover:bg-rose-700 text-white rounded-full w-5 h-5 text-[10px]">×</button>
      </form>
    </div>`).join('');

  const upload = `
    <form action="/dashboard/clientes/${escapeHtml(d.id)}/anexos" method="post" enctype="multipart/form-data" class="bg-cyan-500/5 border border-dashed border-cyan-500/40 rounded-lg p-3 flex flex-col items-center justify-center aspect-square">
      <input type="file" name="file" required class="text-[10px] text-slate-300 mb-1" accept="image/*,application/pdf">
      <select name="tipo" required class="text-[10px] bg-slate-900 border border-slate-700 text-slate-100 rounded mb-1 w-full">
        ${TIPOS.map(t => `<option value="${t.id}">${t.label}</option>`).join('')}
      </select>
      <input name="descricao" placeholder="Descrição (opcional)" class="text-[10px] bg-slate-900 border border-slate-700 text-slate-100 rounded mb-1 w-full px-1 py-0.5">
      <button class="bg-cyan-600 hover:bg-cyan-700 text-white text-[10px] rounded px-2 py-1 w-full">＋ Adicionar</button>
    </form>`;

  return `
    <div class="grid grid-cols-3 md:grid-cols-6 gap-2">
      ${items}
      ${upload}
    </div>`;
}

function renderAbaPropostas(d: ClienteDetail): string {
  if (d.propostas.length === 0) {
    return `<div class="text-slate-500 text-sm italic p-4">Nenhuma proposta gerada ainda. <a class="text-purple-300 underline" href="/dashboard/propostas/novo?lead_id=${escapeHtml(d.id)}">Criar agora</a>.</div>`;
  }
  const rows = d.propostas.map(p => `
    <tr class="hover:bg-slate-800/50">
      <td class="px-3 py-2 text-sm"><a href="/dashboard/propostas/${escapeHtml(p.id)}" class="text-cyan-300 hover:underline">${escapeHtml(p.numero_proposta)}</a></td>
      <td class="px-3 py-2 text-xs text-slate-400">${escapeHtml(p.created_at.slice(0,10))}</td>
      <td class="px-3 py-2 text-sm text-slate-300">${p.valor_total_brl ? 'R$ ' + p.valor_total_brl.toFixed(0) : '—'}</td>
      <td class="px-3 py-2 text-xs">${p.acessos} acessos</td>
      <td class="px-3 py-2 text-xs">${p.cliente_respondeu_at ? '✉️ Respondeu' : '—'}</td>
    </tr>`).join('');
  return `
    <table class="w-full">
      <thead><tr class="text-[10px] uppercase text-slate-500 border-b border-slate-700"><th class="px-3 py-2 text-left">Nº</th><th class="px-3 py-2 text-left">Data</th><th class="px-3 py-2 text-left">Valor</th><th class="px-3 py-2 text-left">Acessos</th><th class="px-3 py-2 text-left">Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <a href="/dashboard/propostas/novo?lead_id=${escapeHtml(d.id)}" class="inline-block mt-3 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm">📄 Nova proposta</a>
  `;
}

function renderAbaTimeline(d: ClienteDetail): string {
  type Ev = { data: string; tipo: string; texto: string; cor: string };
  const evs: Ev[] = [];
  evs.push({ data: d.created_at, tipo: 'lead', texto: `Lead via ${d.acquisition_source ?? d.lead_source ?? 'orgânico'}`, cor: 'text-slate-400' });
  for (const p of d.propostas) evs.push({ data: p.created_at, tipo: 'proposta', texto: `Proposta ${p.numero_proposta}${p.valor_total_brl ? ' · R$ ' + p.valor_total_brl.toFixed(0) : ''}`, cor: 'text-purple-300' });
  if (d.installed_at) evs.push({ data: d.installed_at + 'T00:00:00Z', tipo: 'instalado', texto: `Instalação concluída${d.sistema ? ' · ' + d.sistema.apelido : ''}`, cor: 'text-cyan-300' });
  for (const a of d.alertas_ativos) evs.push({ data: a.primeiro_visto_em, tipo: 'alerta', texto: a.texto, cor: a.severidade === 'urgente' ? 'text-rose-400' : a.severidade === 'aviso' ? 'text-amber-400' : 'text-green-400' });

  evs.sort((a, b) => b.data.localeCompare(a.data));
  const items = evs.slice(0, 20).map(e => `
    <div class="flex gap-2 text-xs"><span class="${e.cor}">●</span><span class="text-slate-500 w-20 shrink-0">${escapeHtml(e.data.slice(0,10))}</span><span class="text-slate-300">${escapeHtml(e.texto)}</span></div>
  `).join('');
  return `<div class="space-y-1.5">${items || '<div class="text-slate-500 italic text-sm">Sem eventos.</div>'}</div>`;
}

function renderAbaConversa(d: ClienteDetail): string {
  if (d.conversas_recentes.length === 0) {
    return `<div class="text-slate-500 italic text-sm p-4">Sem mensagens recentes.</div>`;
  }
  const items = d.conversas_recentes.map(m => `
    <div class="${m.role === 'user' ? 'text-cyan-200' : 'text-slate-300'} text-xs p-2 rounded ${m.role === 'user' ? 'bg-cyan-500/10' : 'bg-slate-800/40'}">
      <div class="text-[9px] uppercase tracking-wider text-slate-500 mb-1">${escapeHtml(m.role)} · ${escapeHtml((m.timestamp ?? '').slice(0,16))}</div>
      <div>${escapeHtml(m.content)}</div>
    </div>
  `).join('');
  return `<div class="space-y-2">${items}</div><a href="/dashboard/leads/${escapeHtml(d.id)}" class="inline-block mt-3 text-xs text-cyan-300 underline">Ver conversa completa em /leads</a>`;
}

export function renderClienteDetailPage(d: ClienteDetail, insights: InsightCard[]): string {
  const concNome = d.concessionaria ? getConcessionariaById(d.concessionaria)?.nome ?? d.concessionaria : '—';
  const phoneClean = d.phone.replace(/\D/g, '');

  // Header
  const header = `
    <div class="flex items-center gap-4 pb-4 border-b border-slate-700">
      <div class="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center font-bold text-slate-900 text-xl">${escapeHtml(avatarInitials(d.name))}</div>
      <div class="flex-1">
        <div class="text-xl font-bold text-slate-100">${escapeHtml(d.name) || 'Sem nome'}</div>
        <div class="text-xs text-slate-500">📍 ${escapeHtml([d.city, d.uf].filter(Boolean).join('-') || '—')} · Cliente desde ${escapeHtml((d.installed_at ?? d.created_at).slice(0,7))} · ${escapeHtml(concNome)}</div>
      </div>
      <div class="px-3 py-1 rounded-full border text-xs font-semibold ${statusCorChip(d.installation_status)}">${escapeHtml(statusLabel(d.installation_status))}</div>
      <a href="https://wa.me/${escapeHtml(phoneClean)}" target="_blank" class="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-semibold">📞 Conversar</a>
      <a href="/dashboard/propostas/novo?lead_id=${escapeHtml(d.id)}" class="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold">📄 Nova proposta</a>
      <a href="/dashboard/clientes/${escapeHtml(d.id)}/relatorio-pos-instalacao/novo" class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold">📋 Relatório pós-obra</a>
      ${d.archived_at
        ? `<form action="/dashboard/clientes/${escapeHtml(d.id)}/desarquivar" method="post" class="inline">
            <button class="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold">↩️ Restaurar</button>
          </form>`
        : `<form action="/dashboard/clientes/${escapeHtml(d.id)}/arquivar" method="post" data-nome="${escapeHtml(d.name ?? 'esse cadastro')}" onsubmit="return confirm('Arquivar ' + this.dataset.nome + '? Sai da lista ativa, mas historico fica intacto e da pra restaurar a qualquer hora.')" class="inline">
            <button class="px-3 py-1.5 rounded-lg bg-slate-600 hover:bg-slate-500 text-white text-xs font-semibold">📦 Arquivar</button>
          </form>`}
      <form action="/dashboard/clientes/${escapeHtml(d.id)}/excluir" method="post" data-nome="${escapeHtml(d.name ?? 'esse cadastro')}" onsubmit="return confirm('Excluir ' + this.dataset.nome + ' PERMANENTEMENTE? Isso apaga propostas, conversas e anexos vinculados. Não dá pra desfazer.')" class="inline">
        <button class="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold">🗑 Excluir</button>
      </form>
    </div>`;

  // Abas (estrutura — conteúdo virá em T11)
  const tabs = `
    <div id="abas" class="flex gap-1 border-b border-slate-700 my-4 overflow-x-auto">
      <a href="#dados" class="px-4 py-2 text-xs font-semibold text-sky-300 border-b-2 border-sky-400 whitespace-nowrap">👤 Dados</a>
      <a href="#sistema" class="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 whitespace-nowrap">☀ Sistema + Kit</a>
      <a href="#propostas" class="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 whitespace-nowrap">📄 Propostas (${d.propostas.length})</a>
      <a href="#anexos" class="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 whitespace-nowrap">📸 Anexos (${d.anexos.length})</a>
      <a href="#timeline" class="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 whitespace-nowrap">📖 Timeline</a>
      <a href="#conversa" class="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 whitespace-nowrap">💬 Conversa</a>
      <a href="#relatorios" class="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 whitespace-nowrap">📋 Relatórios</a>
    </div>`;

  // Conteúdos das abas (T11)
  const abasConteudo = `
    <div id="dados-content" class="space-y-3">${renderAbaDados(d)}</div>
    <div id="sistema-content" class="hidden text-slate-500 italic text-sm p-6">Aba "Sistema + Kit" vem na próxima fatia (A2 — calculadora).</div>
    <div id="propostas-content" class="hidden">${renderAbaPropostas(d)}</div>
    <div id="anexos-content" class="hidden">${renderAbaAnexos(d)}</div>
    <div id="timeline-content" class="hidden">${renderAbaTimeline(d)}</div>
    <div id="conversa-content" class="hidden">${renderAbaConversa(d)}</div>
    <div id="relatorios-content" class="hidden text-slate-500 italic text-sm p-6">Aba "Relatórios" vem na próxima fatia (A5).</div>
  `;

  const scripts = `<script>
    document.querySelectorAll('#abas a').forEach(t => t.addEventListener('click', e => {
      e.preventDefault();
      const target = e.currentTarget.getAttribute('href').slice(1);
      document.querySelectorAll('#abas a').forEach(x => { x.classList.remove('text-sky-300','border-b-2','border-sky-400'); x.classList.add('text-slate-400'); });
      e.currentTarget.classList.add('text-sky-300','border-b-2','border-sky-400');
      e.currentTarget.classList.remove('text-slate-400');
      document.querySelectorAll('[id$="-content"]').forEach(c => c.classList.add('hidden'));
      document.getElementById(target + '-content').classList.remove('hidden');
    }));
  </script>${CEP_LOOKUP_SCRIPT}`;

  const insightsComLeadId = insights.map(i => ({
    ...i,
    cta: i.cta ? { ...i.cta, params: { ...(i.cta.params ?? {}), lead_id: d.id } } : null,
  }));

  const body = `
    ${header}
    <div class="mt-4">
      <div class="text-[10px] text-slate-400 uppercase tracking-widest mb-2">📈 JORNADA</div>
      ${progressoJornada(d.installation_status)}
    </div>
    ${renderKpisStrip(d)}
    ${renderInsightsRow(insightsComLeadId)}
    ${tabs}
    ${abasConteudo}
    ${CIDADES_DATALIST_HTML}
  `;

  return renderLayout({ active: 'clientes', title: `Cliente — ${d.name ?? '?'}`, body, scripts, dark: true });
}

// ============================================================
// A4-V2.1 — Form "Novo cliente" avulso
// ============================================================

export function renderFormNovoCliente(input: {
  erros?: string[];
  values?: {
    name?: string;
    phone?: string;
    email?: string;
    cpf_cnpj?: string;
    city?: string;
    uf?: string;
    concessionaria?: string;
    consumo_medio_kwh?: string;
    profile?: string;
  };
}): string {
  const v = input.values ?? {};
  const errosHtml = (input.erros ?? []).length > 0
    ? `<div class="rounded-lg bg-rose-900/30 border border-rose-700 p-4 mb-5">
         <p class="text-rose-200 font-semibold mb-2">⚠ Corrija antes de criar:</p>
         <ul class="list-disc ml-5 text-rose-100 text-sm">
           ${input.erros!.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}
         </ul>
       </div>`
    : '';

  const body = `
    <div class="max-w-2xl mx-auto">
      <div class="mb-6">
        <a href="/dashboard/clientes" class="text-sky-300 text-sm hover:underline">← Voltar à lista</a>
        <h1 class="text-2xl font-bold text-slate-100 mt-3">➕ Novo cliente</h1>
        <p class="text-slate-400 text-sm mt-1">Cadastro rápido. Depois você completa no perfil.</p>
      </div>

      ${errosHtml}

      <form action="/dashboard/clientes/novo" method="post" class="bg-slate-800/60 border border-slate-700 rounded-xl p-6 space-y-5">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label class="block">
            <span class="text-xs text-slate-300">Nome completo *</span>
            <input name="name" required value="${escapeHtml(v.name)}" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
          </label>
          <label class="block">
            <span class="text-xs text-slate-300">Telefone (com DDD) *</span>
            <input name="phone" required value="${escapeHtml(v.phone)}" placeholder="(61) 99999-9999" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
          </label>
          <label class="block">
            <span class="text-xs text-slate-300">E-mail</span>
            <input name="email" type="email" value="${escapeHtml(v.email)}" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
          </label>
          <label class="block">
            <span class="text-xs text-slate-300">CPF/CNPJ</span>
            <input name="cpf_cnpj" value="${escapeHtml(v.cpf_cnpj)}" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
          </label>
          <label class="block">
            <span class="text-xs text-slate-300">Cidade</span>
            <input name="city" value="${escapeHtml(v.city)}" placeholder="Brasília" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
          </label>
          <label class="block">
            <span class="text-xs text-slate-300">UF</span>
            <select name="uf" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
              <option value="">—</option>
              <option value="DF" ${v.uf === 'DF' ? 'selected' : ''}>DF</option>
              <option value="GO" ${v.uf === 'GO' ? 'selected' : ''}>GO</option>
            </select>
          </label>
          <label class="block">
            <span class="text-xs text-slate-300">Concessionária</span>
            <select name="concessionaria" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
              <option value="">—</option>
              <option value="neoenergia-df" ${v.concessionaria === 'neoenergia-df' ? 'selected' : ''}>Neoenergia DF</option>
              <option value="equatorial-go" ${v.concessionaria === 'equatorial-go' ? 'selected' : ''}>Equatorial GO</option>
            </select>
          </label>
          <label class="block">
            <span class="text-xs text-slate-300">Consumo médio (kWh/mês)</span>
            <input name="consumo_medio_kwh" type="number" step="1" value="${escapeHtml(v.consumo_medio_kwh)}" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
          </label>
          <label class="block">
            <span class="text-xs text-slate-300">Tipo</span>
            <select name="profile" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
              ${['indefinido', 'residencial', 'comercial', 'rural', 'industrial'].map((t) => `<option value="${t}" ${(v.profile ?? 'indefinido') === t ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
          </label>
        </div>

        <div class="flex gap-3 pt-2 border-t border-slate-700">
          <a href="/dashboard/clientes" class="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm">Cancelar</a>
          <button class="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold">➕ Criar cliente</button>
        </div>
      </form>
    </div>
  `;
  return renderLayout({ active: 'clientes', title: 'Novo cliente', body, dark: true });
}
