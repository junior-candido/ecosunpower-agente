// src/modules/dashboard/vendas-views.ts
// Tela do botão "Fechou!" — o Junior digita o nome, vê as propostas em aberto
// com aquele nome, clica na que fechou e registra a venda. Fonte única: chama
// o Coração da Venda (registrarVenda) por trás.
import { renderLayout, escapeHtml, formatDate } from './views.js';

export interface PropostaAberta {
  leadId: string;
  propostaId: string;
  clienteNome: string;
  numeroProposta: string | null;
  createdAt: string | null;
  jaVenda: boolean;
}

export interface FecharVendaInput {
  q: string;
  buscou: boolean;
  resultados: PropostaAberta[];
  hoje: string; // 'yyyy-mm-dd' pro padrão do campo de data
  ok?: { nome: string } | null;
  user?: any;
}

export function renderFecharVendaPage(input: FecharVendaInput): string {
  const { q, buscou, resultados, hoje, ok, user } = input;

  const banner = ok
    ? `<div class="mb-5 rounded-lg bg-emerald-50 border border-emerald-300 px-4 py-3 text-emerald-800">
         ✅ Venda de <strong>${escapeHtml(ok.nome)}</strong> registrada! O Elo e o dashboard já sabem.
       </div>`
    : '';

  const busca = `
    <form method="get" action="/dashboard/vendas/fechar" class="flex flex-wrap gap-2 items-end mb-6">
      <div class="flex-1 min-w-[220px]">
        <label class="block text-sm text-slate-600 mb-1">Nome do cliente</label>
        <input name="q" value="${escapeHtml(q)}" autofocus placeholder="Digite o nome e busque..."
          class="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-400 outline-none" />
      </div>
      <button class="bg-slate-900 text-white px-5 py-2 rounded-lg font-semibold hover:bg-slate-800">🔎 Buscar</button>
    </form>`;

  let lista = '';
  if (buscou && resultados.length === 0) {
    lista = `<div class="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-amber-800">
      Nenhuma proposta encontrada com "<strong>${escapeHtml(q)}</strong>". Confira o nome ou gere a proposta antes.
    </div>`;
  } else if (resultados.length > 0) {
    lista = resultados.map((r) => cardProposta(r, hoje)).join('\n');
  }

  const body = `
  <div class="max-w-3xl mx-auto">
    <div class="mb-5">
      <h1 class="text-2xl font-bold text-slate-900">💰 Fechou!</h1>
      <p class="text-slate-500 mt-1">Registre o momento exato que a venda fechou. Busque o cliente pela proposta, clique na certa e pronto — o Elo e as métricas atualizam na hora.</p>
    </div>
    ${banner}
    ${busca}
    ${lista}
  </div>`;

  return renderLayout({ active: 'fechar_venda', title: 'Fechou! Registrar venda', body, user });
}

function cardProposta(r: PropostaAberta, hoje: string): string {
  const data = r.createdAt ? formatDate(r.createdAt) : '—';
  const numero = r.numeroProposta ? `Proposta ${escapeHtml(r.numeroProposta)}` : 'Proposta';

  if (r.jaVenda) {
    return `<div class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 mb-3 flex items-center justify-between">
      <div>
        <div class="font-semibold text-slate-800">${escapeHtml(r.clienteNome)}</div>
        <div class="text-xs text-slate-500">${numero} · enviada ${data}</div>
      </div>
      <span class="text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full">✔ já é venda</span>
    </div>`;
  }

  return `<form method="post" action="/dashboard/vendas/registrar"
      class="rounded-xl border border-slate-200 bg-white px-4 py-4 mb-3 shadow-sm">
    <input type="hidden" name="leadId" value="${escapeHtml(r.leadId)}" />
    <input type="hidden" name="propostaId" value="${escapeHtml(r.propostaId)}" />
    <input type="hidden" name="nome" value="${escapeHtml(r.clienteNome)}" />
    <div class="mb-3">
      <div class="font-semibold text-slate-900">${escapeHtml(r.clienteNome)}</div>
      <div class="text-xs text-slate-500">${numero} · enviada ${data}</div>
    </div>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
      <div>
        <label class="block text-xs text-slate-500 mb-1">Tipo</label>
        <select name="tipo" class="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
          <option value="sistema">🔆 Sistema</option>
          <option value="servico">🔧 Serviço</option>
        </select>
      </div>
      <div>
        <label class="block text-xs text-slate-500 mb-1">Valor (R$)</label>
        <input name="valor" type="number" step="0.01" min="0" placeholder="opcional"
          class="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
      </div>
      <div>
        <label class="block text-xs text-slate-500 mb-1">Potência (kWp)</label>
        <input name="kwp" type="number" step="0.01" min="0" placeholder="opcional"
          class="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
      </div>
      <div>
        <label class="block text-xs text-slate-500 mb-1">Data</label>
        <input name="data" type="date" value="${escapeHtml(hoje)}"
          class="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
      </div>
    </div>
    <button class="w-full sm:w-auto bg-emerald-600 text-white px-5 py-2 rounded-lg font-semibold hover:bg-emerald-700">
      ✅ Registrar venda
    </button>
  </form>`;
}
