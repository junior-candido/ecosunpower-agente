// Tela "Importar geração" (02/10/2026): arquivo do portal (CSV) ou print do
// app (IA lê) → tabela para CONFERIR/corrigir → gravar. Nada grava sem o "ok".
import { renderLayout } from './views.js';
import type { DashUser } from './permissions.js';
import { CSS_PREVISTO } from './previsto-views.js';
import type { LinhaImportada } from '../monitoring/importacao/csv.js';

const esc = (s: unknown): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export interface DadosTelaImportar {
  sistemaId: string;
  nome: string;
  erro?: string;
  gravados?: number;
  preview?: { origem: string; linhas: LinhaImportada[]; avisos: string[]; jaExistem: Record<string, number> };
}

export function renderImportarBody(d: DadosTelaImportar): string {
  const topo = `<a class="volta" href="/dashboard/monitoramento/${esc(d.sistemaId)}">← voltar para a usina</a>
    <h1>📥 Importar geração — ${esc(d.nome)}</h1>
    <div class="sub">Para usina sem integração automática (Hoymiles, APsystems…) ou para completar dias que faltam.</div>`;
  const ok = d.gravados != null ? `<div class="box"><span class="st s-ok">✅ ${d.gravados} dia(s) gravado(s)</span> — já entram no monitoramento, no Previsto × Real e nos relatórios. <a class="volta" href="/dashboard/monitoramento/${esc(d.sistemaId)}/previsto">Ver Previsto × Real →</a></div>` : '';
  const erro = d.erro ? `<div class="box"><span class="st s-ru">⚠ ${esc(d.erro)}</span></div>` : '';
  const form = `<div class="box"><h2>1. Envie o arquivo ou o print</h2>
    <p class="m">• <b>Arquivo do portal</b> (CSV/TXT) com uma coluna de data e uma de energia — no portal, exporte "geração diária".<br>
    • <b>Print ou foto</b> da tela de geração do mês no app (PNG/JPG) — a IA lê os números; você confere antes de gravar.<br>
    • Excel (.xlsx): no Excel, use "Salvar como → CSV" e envie o CSV.</p>
    <form method="post" action="/dashboard/monitoramento/${esc(d.sistemaId)}/importar" enctype="multipart/form-data">
      <input type="file" name="arquivo" accept=".csv,.txt,image/png,image/jpeg,image/webp" required>
      <button type="submit" class="st s-ok" style="border:0;cursor:pointer;font-size:14px;padding:8px 14px">Ler arquivo</button>
    </form></div>`;
  let prev = '';
  if (d.preview) {
    const p = d.preview;
    if (!p.linhas.length) {
      prev = `<div class="box"><h2>2. Conferir</h2><p class="nota">Nenhum valor encontrado (${esc(p.origem)}). ${p.avisos.map(esc).join(' ')}</p></div>`;
    } else {
      const total = p.linhas.reduce((s, l) => s + l.kwh, 0);
      const linhas = p.linhas.map((l) => {
        const ja = p.jaExistem[l.data];
        return `<tr><td>${br(l.data)}</td><td class="n"><input name="k_${l.data}" value="${l.kwh}" inputmode="decimal" style="width:90px;text-align:right"></td>
          <td class="nota">${ja != null ? `já existe ${ja.toLocaleString('pt-BR')} kWh — será substituído` : ''}</td></tr>`;
      }).join('');
      prev = `<div class="box"><h2>2. Conferir e gravar</h2>
        <p class="m">Origem: ${esc(p.origem)} · ${p.linhas.length} dia(s) · total ${total.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kWh</p>
        ${p.avisos.map((a) => `<p class="nota">⚠ ${esc(a)}</p>`).join('')}
        <form method="post" action="/dashboard/monitoramento/${esc(d.sistemaId)}/importar/confirmar">
          <div class="tb"><table><tr><th>Dia</th><th class="n">kWh (pode corrigir)</th><th></th></tr>${linhas}</table></div>
          <p class="nota">Apague o valor de um dia para não gravá-lo.</p>
          <button type="submit" class="st s-ok" style="border:0;cursor:pointer;font-size:14px;padding:9px 16px">✅ Gravar estes valores</button>
        </form></div>`;
    }
  }
  return `${CSS_PREVISTO}<div class="pv pv-claro">${topo}${ok}${erro}${prev}${form}</div>`;
}

export function renderImportarPage(body: string, user: DashUser | undefined): string {
  return renderLayout({ active: 'monitoramento', title: 'Importar geração', body, user, largo: true, tailwind: false });
}
