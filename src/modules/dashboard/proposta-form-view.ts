// src/modules/dashboard/proposta-form-view.ts
// Views de admin para A4 — Tela Admin Nova Proposta:
//   renderFormNovaProposta  → GET /dashboard/propostas/novo?lead_id=:id
//   renderPreviewProposta   → GET /dashboard/propostas/:slug/preview
import { renderLayout } from './views.js';
import type { ClienteDetail } from '../clientes/types.js';

function escapeHtml(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]!));
}

export const MARCAS_MODULO = ['Trina', 'JA Solar', 'LONGi', 'Jinko', 'DAH', 'Risen'] as const;
export const MARCAS_INVERSOR = ['Sungrow', 'Solis', 'Deye', 'FoxESS', 'SolarEdge', 'Huawei', 'GoodWe', 'Hoymiles', 'Enphase', 'NEP'] as const;
export const TIPOS_ESTRUTURA = ['Telha cerâmica', 'Telha metálica', 'Telha fibrocimento', 'Laje', 'Solo', 'Carport'] as const;
export const FATORES_PERDA = ['0.75', '0.80', '0.85'] as const;

export const CONCESSIONARIA_VALUES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'neoenergia-df', label: 'Neoenergia DF' },
  { value: 'equatorial-go', label: 'Equatorial GO' },
];

export type ConcessionariaValue = typeof CONCESSIONARIA_VALUES[number]['value'];
export type FatorPerdaValue = typeof FATORES_PERDA[number];

function enderecoCompleto(c: Partial<ClienteDetail> | null | undefined): string {
  if (!c) return '';
  const partes = [
    c.endereco_rua,
    c.endereco_numero ? `, ${c.endereco_numero}` : '',
    c.endereco_complemento ? ` - ${c.endereco_complemento}` : '',
    c.neighborhood ? `, ${c.neighborhood}` : '',
    c.cep ? `, CEP ${c.cep}` : '',
    c.city ? `, ${c.city}` : '',
    c.uf ? `-${c.uf}` : '',
  ].filter(Boolean).join('');
  return partes;
}

function consumoArrayPreview(json: Record<string, number> | null | undefined): string {
  if (!json) return '';
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const values = meses.map((m) => json[m] ?? 0);
  if (values.every((v) => v === 0)) return '';
  return JSON.stringify(values);
}

export function renderFormNovaProposta(input: {
  lead_id: string;
  lead: Partial<ClienteDetail> | null;
  erros?: string[];
}): string {
  const c = input.lead;
  const errosHtml = (input.erros ?? []).length > 0
    ? `<div class="rounded-lg bg-rose-900/30 border border-rose-700 p-4 mb-5">
         <p class="text-rose-200 font-semibold mb-2">⚠ Corrija antes de gerar:</p>
         <ul class="list-disc ml-5 text-rose-100 text-sm">
           ${input.erros!.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}
         </ul>
       </div>`
    : '';

  const consumoArrayHidden = consumoArrayPreview(c?.consumo_mensal_json ?? null);
  const concessionariaSel = c?.concessionaria ?? '';
  const tipoClienteSel = c?.profile ?? 'residencial';

  const body = `
    <div class="max-w-4xl mx-auto">
      <div class="mb-6">
        <a href="/dashboard/clientes/${escapeHtml(input.lead_id)}" class="text-sky-300 text-sm hover:underline">← Voltar ao perfil</a>
        <h1 class="text-2xl font-bold text-slate-100 mt-3">📄 Nova proposta</h1>
        <p class="text-slate-400 text-sm mt-1">Cliente: <strong>${escapeHtml(c?.name ?? 'sem cadastro')}</strong></p>
      </div>

      ${errosHtml}

      <form action="/dashboard/propostas/novo" method="post" enctype="multipart/form-data" class="bg-slate-800/60 border border-slate-700 rounded-xl p-6 space-y-6">
        <input type="hidden" name="lead_id" value="${escapeHtml(input.lead_id)}">
        ${consumoArrayHidden ? `<input type="hidden" name="consumoMensalKwhDistribuido" value="${escapeHtml(consumoArrayHidden)}">` : ''}

        <fieldset class="space-y-4">
          <legend class="text-xs font-semibold text-cyan-300 uppercase tracking-wider">👤 Cliente</legend>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label class="block">
              <span class="text-xs text-slate-300">Nome</span>
              <input name="nomeCliente" required value="${escapeHtml(c?.name)}" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            </label>
            <label class="block">
              <span class="text-xs text-slate-300">CPF/CNPJ</span>
              <input name="documentoCliente" value="${escapeHtml(c?.cpf_cnpj)}" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            </label>
            <label class="block">
              <span class="text-xs text-slate-300">Telefone</span>
              <input name="telefoneCliente" value="${escapeHtml(c?.phone)}" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            </label>
            <label class="block">
              <span class="text-xs text-slate-300">E-mail</span>
              <input name="emailCliente" type="email" value="${escapeHtml(c?.email)}" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            </label>
            <label class="block md:col-span-2">
              <span class="text-xs text-slate-300">Endereço completo</span>
              <input name="enderecoCliente" value="${escapeHtml(enderecoCompleto(c))}" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            </label>
            <label class="block">
              <span class="text-xs text-slate-300">Tipo</span>
              <select name="tipoCliente" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
                ${['residencial', 'comercial', 'rural', 'industrial'].map((t) => `<option value="${t}" ${t === tipoClienteSel ? 'selected' : ''}>${t}</option>`).join('')}
              </select>
            </label>
            <label class="block">
              <span class="text-xs text-slate-300">Concessionária</span>
              <select name="concessionaria" required class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
                ${CONCESSIONARIA_VALUES.map((opt) => `<option value="${opt.value}" ${opt.value === concessionariaSel ? 'selected' : ''}>${opt.label}</option>`).join('')}
              </select>
            </label>
          </div>
        </fieldset>

        <fieldset class="space-y-4">
          <legend class="text-xs font-semibold text-cyan-300 uppercase tracking-wider">⚡ Sistema</legend>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label class="block">
              <span class="text-xs text-slate-300">Potência (kWp) *</span>
              <input name="potenciaKwp" type="number" step="0.01" required class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            </label>
            <label class="block">
              <span class="text-xs text-slate-300">Fator de perda *</span>
              <select name="fatorPerda" required class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
                ${FATORES_PERDA.map((f) => `<option value="${f}" ${f === '0.80' ? 'selected' : ''}>${f}</option>`).join('')}
              </select>
            </label>
            <label class="block">
              <span class="text-xs text-slate-300">Consumo médio (kWh/mês) *</span>
              <input name="consumoMensalKwh" type="number" step="1" required value="${escapeHtml(c?.consumo_medio_kwh)}" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            </label>
            <label class="block">
              <span class="text-xs text-slate-300">Modalidade</span>
              <input name="modalidade" value="${escapeHtml(c?.tarifa_modalidade ?? 'autoconsumo local')}" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            </label>
            <label class="block">
              <span class="text-xs text-slate-300">Tarifa R$/kWh (override opcional)</span>
              <input name="tarifaRsKwh" type="number" step="0.01" placeholder="default por concessionária" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            </label>
            <label class="block">
              <span class="text-xs text-slate-300">Custo disponibilidade (R$/mês)</span>
              <input name="custoDisponibilidadeMensal" type="number" step="1" placeholder="mono 50 / tri 100" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            </label>
          </div>
        </fieldset>

        <fieldset class="space-y-4">
          <legend class="text-xs font-semibold text-cyan-300 uppercase tracking-wider">🔋 Módulos</legend>
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <label class="block">
              <span class="text-xs text-slate-300">Fabricante *</span>
              <select name="moduloFabricante" required class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
                ${MARCAS_MODULO.map((m) => `<option value="${m}">${m}</option>`).join('')}
              </select>
            </label>
            <label class="block">
              <span class="text-xs text-slate-300">Modelo *</span>
              <input name="moduloModelo" required placeholder="Vertex 700W" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            </label>
            <label class="block">
              <span class="text-xs text-slate-300">Potência (W) *</span>
              <input name="moduloPotenciaW" type="number" step="1" required placeholder="700" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            </label>
            <label class="block">
              <span class="text-xs text-slate-300">Qtd *</span>
              <input name="moduloQuantidade" type="number" step="1" required placeholder="12" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            </label>
          </div>
        </fieldset>

        <fieldset class="space-y-4">
          <legend class="text-xs font-semibold text-cyan-300 uppercase tracking-wider">⚙️ Inversor</legend>
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <label class="block">
              <span class="text-xs text-slate-300">Fabricante *</span>
              <select name="inversorFabricante" required class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
                ${MARCAS_INVERSOR.map((m) => `<option value="${m}">${m}</option>`).join('')}
              </select>
            </label>
            <label class="block">
              <span class="text-xs text-slate-300">Modelo *</span>
              <input name="inversorModelo" required placeholder="SG5.0RS-L" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            </label>
            <label class="block">
              <span class="text-xs text-slate-300">Potência (W) *</span>
              <input name="inversorPotenciaW" type="number" step="1" required placeholder="5000" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            </label>
            <label class="block">
              <span class="text-xs text-slate-300">Qtd *</span>
              <input name="inversorQuantidade" type="number" step="1" required placeholder="1" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            </label>
          </div>
        </fieldset>

        <fieldset class="space-y-4">
          <legend class="text-xs font-semibold text-cyan-300 uppercase tracking-wider">🏠 Estrutura</legend>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label class="block">
              <span class="text-xs text-slate-300">Tipo *</span>
              <select name="estruturaTipo" required class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
                ${TIPOS_ESTRUTURA.map((t) => `<option value="${t}" ${t === 'Telha cerâmica' ? 'selected' : ''}>${t}</option>`).join('')}
              </select>
            </label>
            <label class="block">
              <span class="text-xs text-slate-300">Material</span>
              <input name="estruturaMaterial" value="Alumínio anodizado + parafusos inox" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            </label>
          </div>
        </fieldset>

        <fieldset class="space-y-4">
          <legend class="text-xs font-semibold text-cyan-300 uppercase tracking-wider">💰 Comercial</legend>
          <label class="block max-w-xs">
            <span class="text-xs text-slate-300">Valor total (R$) *</span>
            <input name="valorTotalRs" type="number" step="0.01" required placeholder="38500" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
          </label>
        </fieldset>

        <fieldset class="space-y-4">
          <legend class="text-xs font-semibold text-cyan-300 uppercase tracking-wider">📎 Estudo personalizado <span class="text-slate-500 font-normal">(opcional — só inclui se tiver anexos)</span></legend>

          ${[1, 2, 3].map((i) => `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <label class="block md:col-span-1">
                <span class="text-xs text-slate-300">Foto ${i}</span>
                <input type="file" name="foto${i}" accept="image/*" class="mt-1 block w-full text-sm text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-cyan-600 file:text-white hover:file:bg-cyan-700 cursor-pointer">
              </label>
              <label class="block md:col-span-2">
                <span class="text-xs text-slate-300">Legenda</span>
                <input name="fotoLegenda${i}" placeholder="Ex: Vista superior do telhado" maxlength="100" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
              </label>
            </div>
          `).join('')}

          <div class="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <label class="block md:col-span-1">
              <span class="text-xs text-slate-300">Vídeo (opcional)</span>
              <input type="file" name="video" accept="video/*" class="mt-1 block w-full text-sm text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-purple-600 file:text-white hover:file:bg-purple-700 cursor-pointer">
            </label>
            <label class="block md:col-span-2">
              <span class="text-xs text-slate-300">Legenda do vídeo</span>
              <input name="videoLegenda" placeholder="Ex: Simulação sombreamento 7h-18h" maxlength="100" class="mt-1 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm">
            </label>
          </div>

          <p class="text-xs text-slate-500">Máx 3 fotos (até 20MB cada) + 1 vídeo (até 100MB, 60s).</p>
        </fieldset>

        <div class="flex gap-3 pt-2 border-t border-slate-700">
          <a href="/dashboard/clientes/${escapeHtml(input.lead_id)}" class="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm">Cancelar</a>
          <button class="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold">📄 Gerar proposta</button>
        </div>
      </form>
    </div>
  `;
  return renderLayout({ active: 'clientes', title: 'Nova proposta', body, dark: true });
}

export function renderPreviewProposta(input: {
  slug: string;
  htmlPreview: string;
  publicUrl: string;
  clienteNome: string;
  clienteTelefone: string;
  lead_id: string;
  jaEnviado: boolean;
  canEnviar: boolean;
  reasonNaoEnviar: string | null;
}): string {
  const enviarBtn = input.canEnviar && !input.jaEnviado
    ? `<form action="/dashboard/propostas/${escapeHtml(input.slug)}/enviar" method="post" data-nome="${escapeHtml(input.clienteNome)}" onsubmit="return confirm('Enviar proposta pra ' + this.dataset.nome + ' no WhatsApp agora?')">
         <input type="hidden" name="lead_id" value="${escapeHtml(input.lead_id)}">
         <button class="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold">📤 Enviar pelo WhatsApp</button>
       </form>`
    : '';

  const enviadoBadge = input.jaEnviado
    ? `<p class="text-emerald-400 text-sm mt-1">✅ Enviado pelo WhatsApp</p>`
    : input.reasonNaoEnviar
      ? `<p class="text-amber-300 text-sm mt-1">⚠ Não pode enviar: ${escapeHtml(input.reasonNaoEnviar)}</p>`
      : `<p class="text-slate-400 text-sm mt-1">Pronto pra enviar</p>`;

  const voltarHref = input.lead_id
    ? `/dashboard/clientes/${escapeHtml(input.lead_id)}`
    : `/dashboard/clientes`;
  const refazerHref = input.lead_id
    ? `/dashboard/propostas/novo?lead_id=${escapeHtml(input.lead_id)}`
    : `/dashboard/clientes`;

  const body = `
    <div class="max-w-5xl mx-auto">
      <div class="mb-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <a href="${voltarHref}" class="text-sky-300 text-sm hover:underline">← Voltar ao perfil</a>
          <h1 class="text-2xl font-bold text-slate-100 mt-3">Preview da proposta</h1>
          ${enviadoBadge}
        </div>
        <div class="flex gap-2 flex-shrink-0">
          <a href="${refazerHref}" class="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm">↻ Refazer</a>
          <button data-url="${escapeHtml(input.publicUrl)}" onclick="navigator.clipboard.writeText(this.dataset.url).then(()=>alert('Link copiado!'))" class="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm">📋 Copiar link</button>
          ${enviarBtn}
        </div>
      </div>

      <div class="bg-white rounded-xl overflow-hidden shadow-2xl">
        <iframe srcdoc="${escapeHtml(input.htmlPreview)}" class="w-full" style="min-height:900px;border:none"></iframe>
      </div>

      <p class="text-slate-500 text-xs mt-4 text-center">
        Link público: <code class="bg-slate-800 px-2 py-1 rounded">${escapeHtml(input.publicUrl)}</code> ·
        <a href="${escapeHtml(input.publicUrl)}" target="_blank" class="text-sky-300 hover:underline">abrir em nova aba</a>
      </p>
    </div>
  `;
  return renderLayout({ active: 'clientes', title: 'Preview proposta', body, dark: true });
}
