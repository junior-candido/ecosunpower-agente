// Telas do módulo Demonstrativos GD (fatia 1): lista, cliente, conferência do
// PDF enviado e digitação. Só desenham — regra fica em src/modules/gd/.
// Ver docs/superpowers/specs/2026-09-23-demonstrativos-tela-relatorio-design.md.

import { renderLayout } from './views.js';
import type { DashUser } from './permissions.js';
import type { ItemLista } from '../gd/demonstrativos-tela.js';
import { historicoPorMes } from '../gd/demonstrativos-tela.js';
import type { EstadoGd, ResultadoValidacao } from '../gd/gd-validacao.js';
import { mesCurto } from '../gd/demonstrativo-cruzamento.js';
import { dataHoraBrasilia } from '../gd/relatorio-envio-textos.js';
import { telefoneBonito } from '../gd/relatorio-marca.js';
import { motivoEmPortugues } from '../relatorios/pasta/resultado-envio.js';

export interface UltimoEnvioRelatorio {
  enviadoEm: string;
  zapPara: string | null;
  emailPara: string | null;
}

/** "✅ enviado em 27/09 10:05 para (61) 99171-8505 e j@x.com" — SEM escapar (quem desenha escapa). */
export function textoUltimoEnvio(u: UltimoEnvioRelatorio): string {
  const para = [u.zapPara ? telefoneBonito(u.zapPara) : null, u.emailPara].filter(Boolean).join(' e ');
  return `✅ enviado em ${dataHoraBrasilia(u.enviadoEm)}${para ? ` para ${para}` : ''}`;
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
const kwh = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kWh`;
const brl = (v: number | null) => (v === null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

const ESTADO: Record<EstadoGd, { cor: string; txt: string }> = {
  pronto: { cor: '#22c55e', txt: '🟢 Pronto' },
  falta_dado: { cor: '#eab308', txt: '🟡 Falta dado' },
  inconsistente: { cor: '#ef4444', txt: '🔴 Número não bate' },
  sem_cliente: { cor: '#94a3b8', txt: '⚪ Sem cliente' },
};
const ORIGEM: Record<string, string> = {
  email: 'e-mail da concessionária',
  pdf_manual: 'PDF enviado na tela',
  digitado: 'digitado na tela',
};

const botoesEntrada = `
<div class="flex flex-wrap gap-2 my-3">
  <a href="/dashboard/demonstrativos/enviar-pdf" class="px-3 py-2 rounded bg-cyan-700 text-white">+ Enviar PDF</a>
  <a href="/dashboard/demonstrativos/digitar" class="px-3 py-2 rounded bg-slate-700 text-white">✎ Digitar demonstrativo</a>
</div>`;

export function renderDemonstrativosLista(p: {
  itens: ItemLista[]; meses: string[]; mes: string | null; filtro: { estado?: string; q?: string }; msg?: string | null;
}, user?: DashUser): string {
  const opcMes = p.meses.map((m) => `<option value="${esc(m)}"${m === p.mes ? ' selected' : ''}>${mesCurto(m)}</option>`).join('');
  const opcEstado = ['', 'pronto', 'falta_dado', 'inconsistente', 'sem_cliente']
    .map((e) => `<option value="${e}"${(p.filtro.estado ?? '') === e ? ' selected' : ''}>${e ? ESTADO[e as EstadoGd].txt : 'Todas'}</option>`).join('');
  const linhas = p.itens.map((i) => `
    <a href="/dashboard/demonstrativos/${esc(i.instalacao)}?mes=${esc(i.referencia)}" class="block rounded-lg border border-slate-700 hover:border-slate-500 p-3 mb-2">
      <div class="flex justify-between gap-2">
        <b>${esc(i.clienteNome)}</b><span style="color:${ESTADO[i.estado].cor}">${ESTADO[i.estado].txt}</span>
      </div>
      <div class="text-sm text-slate-400">UC ${esc(i.instalacao)} · ${mesCurto(i.referencia)} · gerou ${kwh(i.geracaoKwh)} · créditos ${kwh(i.saldoKwh)}</div>
      ${i.motivo ? `<div class="text-sm" style="color:${ESTADO[i.estado].cor}">${esc(i.motivo)}</div>` : ''}
      ${i.alertaVencimento ? `<div class="text-sm text-amber-300">${esc(i.alertaVencimento)}</div>` : ''}
    </a>`).join('');
  const body = `
<div style="color:#d1d5db;max-width:900px">
<h1 class="text-xl font-bold text-cyan-300 mb-2">📄 Demonstrativos de GD</h1>
${p.msg ? `<div class="rounded border border-emerald-600 p-2 mb-2">${esc(p.msg)}</div>` : ''}
${botoesEntrada}
<form method="get" action="/dashboard/demonstrativos" class="flex flex-wrap gap-2 mb-3">
  <select name="mes" class="bg-gray-800 p-1 rounded">${opcMes}</select>
  <select name="estado" class="bg-gray-800 p-1 rounded">${opcEstado}</select>
  <input name="q" value="${esc(p.filtro.q ?? '')}" placeholder="buscar cliente ou UC" class="bg-gray-800 p-1 rounded">
  <button class="px-3 py-1 rounded bg-slate-700">Filtrar</button>
</form>
${linhas || '<p class="text-slate-500">Nenhum demonstrativo neste filtro. Eles chegam sozinhos pelo e-mail da concessionária — ou use "+ Enviar PDF".</p>'}
</div>`;
  return renderLayout({ active: 'demonstrativos', title: 'Demonstrativos', body, dark: true, user });
}

export interface DetalheCliente {
  instalacao: string;
  clienteNome: string;
  leadId: string | null;
  meses: string[];
  mes: string;
  consumoKwh: number | null;
  injetadoKwh: number | null;
  saldoKwh: number | null;
  compensadoKwh: number | null;
  economiaRs: number | null;
  proximoExpirar: string | null;
  historico: Array<{ mes: string; consumida: number; injetada: number; compensado: number }>;
  unidades: Array<{ codigoCliente: string; percentual: number; saldo: number }>;
  origemDemonstrativo: string;
  verificado: boolean;
  validacao: ResultadoValidacao;
  candidatos: Array<{ id: string; nome: string | null; uc: string | null }>;
  msg: string | null;
  /** Último envio ao cliente deste mês (fatia 3); ausente/null = nunca enviado. */
  ultimoEnvio?: UltimoEnvioRelatorio | null;
}

export function renderDemonstrativoCliente(d: DetalheCliente, user?: DashUser): string {
  const i = d.meses.indexOf(d.mes);
  const anterior = d.meses[i + 1];
  const proximo = i > 0 ? d.meses[i - 1] : undefined;
  const nav = (m: string | undefined, s: string) => m
    ? `<a class="px-2 py-1 rounded bg-slate-700" href="/dashboard/demonstrativos/${esc(d.instalacao)}?mes=${esc(m)}">${s}</a>` : '';
  const v = d.validacao;
  const card = (t: string, valor: string) =>
    `<div class="rounded-lg bg-slate-800 p-3"><div class="text-xs text-slate-400">${t}</div><div class="text-2xl font-bold">${valor}</div></div>`;
  const lista = (itens: string[], cor: string) => itens.map((x) => `<li style="color:${cor}">${esc(x)}</li>`).join('');
  const origemGeracao = v.origemGeracao === 'manual' ? 'digitada na tela' : v.origemGeracao === 'api' ? 'monitoramento (API)' : '—';
  const formGeracao = `
<form method="post" action="/dashboard/demonstrativos/${esc(d.instalacao)}/geracao" class="flex flex-wrap gap-2 items-end mt-2">
  <input type="hidden" name="referencia" value="${esc(d.mes)}">
  <label>Geração de ${mesCurto(d.mes)} (kWh) <input name="kwh" inputmode="decimal" class="bg-gray-800 p-1 rounded" required></label>
  <button class="px-3 py-1 rounded bg-cyan-700 text-white">Salvar geração</button>
</form>`;
  const formLigar = d.leadId ? '' : `
<div class="rounded border border-slate-600 p-3 mt-3">
  <b>Ligar esta UC a um cliente</b>
  <form method="get" action="/dashboard/demonstrativos/${esc(d.instalacao)}" class="flex gap-2 mt-2">
    <input type="hidden" name="mes" value="${esc(d.mes)}">
    <input name="buscar" placeholder="nome do cliente" class="bg-gray-800 p-1 rounded"><button class="px-3 py-1 rounded bg-slate-700">Buscar</button>
  </form>
  ${d.candidatos.map((c) => `
  <form method="post" action="/dashboard/demonstrativos/${esc(d.instalacao)}/ligar" class="mt-1">
    <input type="hidden" name="lead_id" value="${esc(c.id)}"><input type="hidden" name="mes" value="${esc(d.mes)}">
    <button class="px-2 py-1 rounded bg-emerald-700 text-white">Ligar a ${esc(c.nome ?? 'sem nome')}${c.uc ? ` (UC ${esc(c.uc)})` : ''}</button>
  </form>`).join('')}
</div>`;
  const rateio = d.unidades.length > 1
    ? `<p class="mt-2">Rateio: ${d.unidades.map((u) => `${esc(u.codigoCliente)} ${esc(u.percentual)}%`).join(' · ')}</p>` : '';
  const motivoFalta = v.bloqueios[0] ?? v.pendencias[0] ?? 'o mês ainda não está pronto';
  const envioFeito = d.ultimoEnvio ? `<p class="text-emerald-300 mt-2">${esc(textoUltimoEnvio(d.ultimoEnvio))}</p>` : '';
  const botaoRelatorio = v.estado === 'pronto'
    ? `<div class="flex gap-2 mt-4">
  <a href="/dashboard/demonstrativos/${esc(d.instalacao)}/relatorio.pdf?mes=${esc(d.mes)}" class="px-4 py-2 rounded bg-emerald-700 text-white">📄 Gerar PDF</a>
  <a href="/dashboard/demonstrativos/${esc(d.instalacao)}/relatorio.html?mes=${esc(d.mes)}" target="_blank" class="px-4 py-2 rounded bg-slate-700 text-white">👁 Prévia</a>
  <a href="/dashboard/demonstrativos/${esc(d.instalacao)}/enviar?mes=${esc(d.mes)}" class="px-4 py-2 rounded bg-cyan-700 text-white">📲 Enviar ao cliente pela Eva</a>
</div>${envioFeito}`
    : `<p class="mt-4"><span class="px-4 py-2 rounded bg-slate-800 text-slate-500 cursor-not-allowed">📄 Gerar PDF</span>
  <span class="text-sm text-amber-300 ml-2">Só sai com tudo 🟢 — ${esc(motivoFalta)}</span></p>`;
  const body = `
<div style="color:#d1d5db;max-width:900px">
<a href="/dashboard/demonstrativos?mes=${esc(d.mes)}" class="text-sm text-slate-400">← Demonstrativos</a>
<h1 class="text-xl font-bold text-cyan-300 mt-1">${esc(d.clienteNome)} · UC ${esc(d.instalacao)}</h1>
${d.msg ? `<div class="rounded border border-emerald-600 p-2 my-2">${esc(d.msg)}</div>` : ''}
<div class="flex items-center gap-2 my-2">${nav(anterior, '◄')}<b>${mesCurto(d.mes)}</b>${nav(proximo, '►')}
  <span style="color:${ESTADO[v.estado].cor}" class="ml-3">${ESTADO[v.estado].txt}</span></div>
<div class="grid grid-cols-2 md:grid-cols-4 gap-2">
  ${card('☀ Gerou', kwh(v.geracaoKwh))}${card('🏠 Consumiu', kwh(d.consumoKwh))}
  ${card('💰 Economia estimada', brl(d.economiaRs))}${card('🔋 Saldo de créditos', kwh(d.saldoKwh))}
</div>
${d.proximoExpirar ? `<p class="text-amber-300 mt-2">${esc(d.proximoExpirar)}</p>` : ''}
${rateio}
<canvas id="g13" height="110" class="mt-3"></canvas>
<ul class="mt-3 text-sm">${lista(v.bloqueios, '#ef4444')}${lista(v.pendencias, '#eab308')}${lista(v.avisos, '#94a3b8')}</ul>
${v.geracaoKwh === null || v.origemGeracao === 'manual' ? formGeracao : ''}
${formLigar}
<h2 class="font-bold mt-4">De onde veio cada número</h2>
<ul class="text-sm text-slate-400">
  <li>Consumo, injetado e créditos → ${esc(ORIGEM[d.origemDemonstrativo] ?? d.origemDemonstrativo)}${d.verificado ? ' ✓ (assinatura da concessionária conferida)' : ''}</li>
  <li>Geração → ${origemGeracao}</li>
  <li>Economia estimada = compensado ${kwh(d.compensadoKwh)} × tarifa média (Lei 14.300 cobra parte do Fio B)</li>
</ul>
${botaoRelatorio}
</div>`;
  // Rateio: uma linha por unidade no mês — soma por mês (13 meses distintos).
  const hist = historicoPorMes(d.historico, 13);
  const scripts = `
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<script>
new Chart(document.getElementById('g13'), { type: 'bar', data: {
  labels: ${JSON.stringify(hist.map((h) => mesCurto(h.mes)))},
  datasets: [
    { label: 'Consumo (kWh)', data: ${JSON.stringify(hist.map((h) => h.consumida))}, backgroundColor: '#f59e0b' },
    { label: 'Injetado (kWh)', data: ${JSON.stringify(hist.map((h) => h.injetada))}, backgroundColor: '#22d3ee' },
    { label: 'Compensado (kWh)', data: ${JSON.stringify(hist.map((h) => h.compensado))}, backgroundColor: '#22c55e' },
  ] }, options: { plugins: { legend: { labels: { color: '#cbd5e1' } } },
  scales: { x: { ticks: { color: '#94a3b8' } }, y: { ticks: { color: '#94a3b8' } } } } });
</script>`;
  return renderLayout({ active: 'demonstrativos', title: d.clienteNome, body, scripts, dark: true, user });
}

export type ResultadoLeituraPdf =
  | { arquivo: string; ok: true; textoB64: string; assinatura: string; clienteNome: string; instalacao: string; referencia: string;
      injetadoKwh: number | null; consumoKwh: number | null; saldoKwh: number | null; inconsistencias: string[] }
  | { arquivo: string; ok: false; motivo: string };

export function renderEnviarPdf(user?: DashUser): string {
  const body = `
<div style="color:#d1d5db;max-width:640px">
<h1 class="text-xl font-bold text-cyan-300 mb-3">+ Enviar PDF do demonstrativo</h1>
<form method="post" action="/dashboard/demonstrativos/enviar-pdf" enctype="multipart/form-data" class="space-y-3">
  <input type="file" name="pdfs" accept="application/pdf" multiple required>
  <p class="text-sm text-slate-400">Pode escolher vários de uma vez. Nada é gravado antes de você conferir.</p>
  <button class="px-4 py-2 rounded bg-cyan-700 text-white">Ler PDFs</button>
</form></div>`;
  return renderLayout({ active: 'demonstrativos', title: 'Enviar PDF', body, dark: true, user });
}

export function renderConferenciaPdf(res: ResultadoLeituraPdf[], user?: DashUser): string {
  const blocos = res.map((r) => r.ok ? `
<div class="rounded-lg border border-slate-600 p-3 mb-3">
  <b>${esc(r.arquivo)}</b> — ${esc(r.clienteNome)} · UC ${esc(r.instalacao)} · ${mesCurto(r.referencia)}
  <div class="text-sm mt-1">Injetado ${kwh(r.injetadoKwh)} · Consumo ${kwh(r.consumoKwh)} · Saldo ${kwh(r.saldoKwh)}</div>
  ${r.inconsistencias.length ? `<ul class="text-sm" style="color:#ef4444">${r.inconsistencias.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
  <form method="post" action="/dashboard/demonstrativos/confirmar" class="mt-2">
    <input type="hidden" name="texto_b64" value="${esc(r.textoB64)}">
    <input type="hidden" name="assinatura_texto" value="${esc(r.assinatura)}">
    <button class="px-3 py-1 rounded bg-emerald-700 text-white">Confirmo — gravar</button>
  </form>
</div>` : `
<div class="rounded-lg border border-red-700 p-3 mb-3"><b>${esc(r.arquivo)}</b> — não deu pra ler: ${esc(r.motivo)}.
  Confira se é o demonstrativo de microgeração, ou use "✎ Digitar demonstrativo".</div>`).join('');
  const body = `
<div style="color:#d1d5db;max-width:900px">
<h1 class="text-xl font-bold text-cyan-300 mb-3">Conferência</h1>
<p class="text-sm text-slate-400 mb-3">Confira os números de cada PDF antes de gravar.</p>
${blocos}
<a href="/dashboard/demonstrativos" class="text-sm text-slate-400">← voltar</a>
</div>`;
  return renderLayout({ active: 'demonstrativos', title: 'Conferência', body, dark: true, user });
}

export function renderDigitar(v: Record<string, string>, erros: string[], user?: DashUser): string {
  const campo = (nome: string, rotulo: string, extra = '') =>
    `<label class="block">${rotulo} <input name="${nome}" value="${esc(v[nome] ?? '')}" class="bg-gray-800 p-1 rounded w-full" ${extra}></label>`;
  const body = `
<div style="color:#d1d5db;max-width:640px">
<h1 class="text-xl font-bold text-cyan-300 mb-3">✎ Digitar demonstrativo</h1>
${erros.length ? `<ul class="rounded border border-red-700 p-2 mb-3" style="color:#fca5a5">${erros.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
<form method="post" action="/dashboard/demonstrativos/digitar" class="space-y-2">
  ${campo('clienteNome', 'Nome do cliente', 'required')}
  <div class="grid grid-cols-2 gap-2">${campo('instalacao', 'Instalação (UC)', 'inputmode="numeric" required')}${campo('codigoCliente', 'Código do cliente (se tiver)', 'inputmode="numeric"')}</div>
  ${campo('mes', 'Mês de referência', 'type="month" required')}
  <div class="grid grid-cols-2 gap-2">${campo('injetado', 'Injetado no mês (kWh)', 'inputmode="decimal" required')}${campo('consumo', 'Consumo do mês (kWh)', 'inputmode="decimal" required')}</div>
  <div class="grid grid-cols-2 gap-2">${campo('creditoUtilizado', 'Crédito utilizado (kWh)', 'inputmode="decimal" required')}${campo('saldoAcumulado', 'Saldo acumulado (kWh)', 'inputmode="decimal" required')}</div>
  <div class="grid grid-cols-2 gap-2">${campo('proximoExpirar', 'Crédito a expirar (kWh, se tiver)', 'inputmode="decimal"')}${campo('cicloExpirar', 'Expira em', 'type="month"')}</div>
  <button class="px-4 py-2 rounded bg-cyan-700 text-white">Conferir e gravar</button>
</form></div>`;
  return renderLayout({ active: 'demonstrativos', title: 'Digitar demonstrativo', body, dark: true, user });
}

export interface ConfirmarEnvioRelatorio {
  instalacao: string;
  mes: string;
  mesExtenso: string;
  clienteNome: string;
  canal: 'casa' | 'evolution' | 'nenhum';
  zap: { para: string | null; motivo: string | null; texto: string };
  /** null = e-mail não configurado neste ambiente. */
  email: { para: string | null; motivo: string | null; assunto: string; html: string } | null;
  linkExemplo: string;
  ultimoEnvio: UltimoEnvioRelatorio | null;
}

export function renderConfirmarEnvioRelatorio(c: ConfirmarEnvioRelatorio, user?: DashUser): string {
  const voltar = `/dashboard/demonstrativos/${esc(c.instalacao)}?mes=${esc(c.mes)}`;
  const comoVai = c.canal === 'evolution'
    ? 'Vai pelo WhatsApp da sua empresa: a mensagem com o link e o PDF anexo.'
    : 'Vai pelo modelo aprovado da Meta ("relatorio_usina_v1"), com o botão "Ver meu relatório". Se o modelo ainda não estiver aprovado, tento como mensagem comum (só chega se o cliente falou com a gente nas últimas 24 horas).';
  const blocoZap = c.zap.para
    ? `<p>Para: <b>${esc(telefoneBonito(c.zap.para))}</b></p>
<p class="text-sm text-slate-400">${esc(comoVai)}</p>
<pre class="whitespace-pre-wrap rounded bg-slate-800 p-3 mt-2" style="font-family:inherit">${esc(c.zap.texto)}</pre>`
    : `<p style="color:#ef4444">❌ Não vai sair — ${esc(motivoEmPortugues('zap', c.zap.motivo))}.</p>`;
  let blocoEmail: string;
  if (c.email === null) {
    blocoEmail = '<p style="color:#eab308">⚠️ O e-mail não está configurado neste ambiente — só o WhatsApp será tentado.</p>';
  } else if (c.email.para) {
    blocoEmail = `<p>Para: <b>${esc(c.email.para)}</b> · Assunto: <b>${esc(c.email.assunto)}</b></p>
<iframe title="Prévia do e-mail" sandbox="" srcdoc="${esc(c.email.html)}" style="width:100%;height:560px;background:#fff;border-radius:8px;margin-top:8px"></iframe>`;
  } else {
    blocoEmail = `<p style="color:#ef4444">❌ Não vai sair — ${esc(motivoEmPortugues('email', c.email.motivo))}.</p>`;
  }
  const podeEnviar = Boolean(c.zap.para) || Boolean(c.email?.para);
  const jaEnviado = c.ultimoEnvio
    ? `<div class="rounded border border-amber-500 p-3 my-3 text-amber-200">Este relatório já foi enviado: ${esc(textoUltimoEnvio(c.ultimoEnvio))}.<br>Enviar de novo manda outra mensagem para o cliente.</div>`
    : '';
  const form = podeEnviar
    // Duplo clique: o botão trava no 1º envio (o servidor também reserva o mês).
    ? `<form method="post" action="/dashboard/demonstrativos/${esc(c.instalacao)}/enviar?mes=${esc(c.mes)}" class="flex flex-wrap gap-2 mt-4" onsubmit="var b=this.querySelector('button[type=submit]');if(b){b.disabled=true;b.textContent='Enviando…';}">
  <input type="hidden" name="confirmar" value="1">
  ${c.ultimoEnvio ? '<input type="hidden" name="reenviar" value="1">' : ''}
  <button type="submit" class="px-4 py-2 rounded bg-emerald-700 text-white">${c.ultimoEnvio ? '🔁 Enviar de novo' : '📲 Confirmar e enviar'}</button>
  <a href="${voltar}" class="px-4 py-2 rounded bg-slate-700 text-white">Cancelar</a>
</form>`
    : `<p class="mt-4" style="color:#ef4444">Nada pode ser enviado — corrija o cadastro do cliente (telefone/e-mail) e tente de novo.</p>
<a href="${voltar}" class="px-4 py-2 rounded bg-slate-700 text-white inline-block mt-2">← Voltar</a>`;
  const body = `
<div style="color:#d1d5db;max-width:900px">
<a href="${voltar}" class="text-sm text-slate-400">← ${esc(c.clienteNome)}</a>
<h1 class="text-xl font-bold text-cyan-300 mt-1">Enviar o relatório de ${esc(c.mesExtenso)} para ${esc(c.clienteNome)}</h1>
${jaEnviado}
<h2 class="font-bold mt-4">📲 WhatsApp</h2>
${blocoZap}
<h2 class="font-bold mt-4">✉️ E-mail</h2>
${blocoEmail}
<h2 class="font-bold mt-4">🔗 Link do relatório</h2>
<p class="text-sm">O cliente recebe um link assim: <code>${esc(c.linkExemplo)}</code> — o endereço definitivo é criado na hora do envio e abre o PDF direto, sem senha.
<a href="/dashboard/demonstrativos/${esc(c.instalacao)}/relatorio.html?mes=${esc(c.mes)}" target="_blank" class="underline text-cyan-300">👁 Ver o relatório</a></p>
${form}
</div>`;
  return renderLayout({ active: 'demonstrativos', title: `Enviar relatório — ${c.clienteNome}`, body, dark: true, user });
}
