// PDF "Relatório de qualidade da tensão da rede" (Energy Studio, Marco 2 — 02/10/2026).
// A4, com a marca da empresa dona da usina (tenant nunca sai com a EcoSun).
import type { MarcaRelatorio } from '../gd/relatorio-marca.js';
import type { ResumoRelatorioRede } from '../monitoring/rede/relatorio.js';
import type { LeituraTensao, PontoGeracao } from '../monitoring/rede/analise.js';
import { limitesProdist, LIMITE_DESARME_INVERSOR_V } from '../energia/prodist.js';
import { graficoTensaoDia, rotuloFase } from './rede-views.js';

const esc = (s: unknown): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const brc = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export interface DadosRelatorioRedeHtml {
  marca: MarcaRelatorio;
  usina: { nome: string; local: string; kwp: number | null };
  periodo: { de: string; ate: string };
  fonte: string;
  resumo: ResumoRelatorioRede;
  /** Leituras e geração do PIOR dia (gráfico detalhado). */
  piorDia?: { leituras: LeituraTensao[]; geracao: PontoGeracao[] } | null;
  emitidoEm: string; // ISO
}

function graficoMaximas(r: ResumoRelatorioRede): string {
  const nominal = r.nominal ?? 220;
  const lim = limitesProdist(nominal);
  const W = 720, H = 230, L = 40, R = 10, T = 10, B = 26;
  const maxs = r.dias.map((d) => Math.max(...d.analise.fases.map((f) => f.max)));
  const vMin = Math.min(nominal - 10, ...maxs) - 4, vMax = Math.max(LIMITE_DESARME_INVERSOR_V + 6, ...maxs) + 2;
  const y = (v: number) => H - B - ((v - vMin) / (vMax - vMin)) * (H - B - T);
  const bw = (W - L - R) / Math.max(1, r.dias.length);
  let s = `<rect x="${L}" y="${y(vMax)}" width="${W - L - R}" height="${y(lim.precaria[1]) - y(vMax)}" fill="#fee2e2"/>`;
  s += `<rect x="${L}" y="${y(lim.precaria[1])}" width="${W - L - R}" height="${y(lim.adequada[1]) - y(lim.precaria[1])}" fill="#fef3c7"/>`;
  s += `<rect x="${L}" y="${y(lim.adequada[1])}" width="${W - L - R}" height="${y(vMin) - y(lim.adequada[1])}" fill="#dcfce7"/>`;
  for (const v of [nominal, lim.adequada[1], LIMITE_DESARME_INVERSOR_V]) s += `<text x="${L - 4}" y="${y(v) + 3}" text-anchor="end" font-size="9" fill="#64748b">${v}</text>`;
  s += `<line x1="${L}" x2="${W - R}" y1="${y(LIMITE_DESARME_INVERSOR_V)}" y2="${y(LIMITE_DESARME_INVERSOR_V)}" stroke="#dc2626" stroke-dasharray="5 3"/>`;
  r.dias.forEach((d, i) => {
    const m = maxs[i], x = L + i * bw;
    const cor = d.analise.desarmes.length ? '#991b1b' : m >= LIMITE_DESARME_INVERSOR_V ? '#dc2626' : m > lim.adequada[1] ? '#d97706' : '#16a34a';
    s += `<rect x="${(x + 1.5).toFixed(1)}" y="${y(m).toFixed(1)}" width="${Math.max(1, bw - 3).toFixed(1)}" height="${(y(vMin) - y(m)).toFixed(1)}" fill="${cor}" opacity=".85"/>`;
    if (d.analise.desarmes.length) s += `<text x="${(x + bw / 2).toFixed(1)}" y="${(y(m) - 3).toFixed(1)}" text-anchor="middle" font-size="9" fill="#991b1b">⚡${d.analise.desarmes.length}</text>`;
    if (i % Math.ceil(r.dias.length / 10) === 0) s += `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="9" fill="#64748b">${brc(d.dia)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" width="100%">${s}</svg>`;
}

export function renderRelatorioRedeHtml(d: DadosRelatorioRedeHtml): string {
  const r = d.resumo;
  const m = d.marca;
  const lim = limitesProdist(r.nominal ?? 220);
  const linhas = r.dias.map((x) => {
    const a = x.analise;
    const mn = Math.min(...a.fases.map((f) => f.min)), mx = Math.max(...a.fases.map((f) => f.max));
    const prec = a.fases.reduce((s, f) => s + f.minutos.precaria, 0), crit = a.fases.reduce((s, f) => s + f.minutos.critica, 0);
    const acima = a.fases.reduce((s, f) => s + f.minutosAcimaDesarme, 0);
    const cls = a.desarmes.length || acima ? 'ru' : crit ? 'at' : '';
    return `<tr class="${cls}"><td>${brc(x.dia)}</td><td class="n">${mn.toFixed(0)}</td><td class="n">${mx.toFixed(0)}</td><td class="n">${prec}</td><td class="n">${crit}</td><td class="n">${acima}</td><td class="n">${a.desarmes.length || ''}</td></tr>`;
  }).join('');
  const pior = r.piorDia && d.piorDia ? (() => {
    const dia = r.dias.find((x) => x.dia === r.piorDia)!;
    const svg = graficoTensaoDia({ sistemaId: '', nome: '', local: '', dia: r.piorDia, leituras: d.piorDia!.leituras, geracao: d.piorDia!.geracao, analise: dia.analise, fonte: d.fonte, marcaTemTensao: true });
    const lista = dia.analise.desarmes.map((z) => {
      const t = new Date(Date.parse(z.ts) - 3 * 3600_000).toISOString().slice(11, 16);
      return `<li><b>${t}</b> — ${z.v.toFixed(0)} V; geração caiu de ${z.kwAntes.toFixed(1)} para ${z.kwDepois.toFixed(1)} kW</li>`;
    }).join('');
    return `<div class="sec evita"><h2>Dia mais crítico: ${br(r.piorDia)}</h2>${svg}${lista ? `<ul>${lista}</ul>` : ''}</div>`;
  })() : '';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório de tensão — ${esc(d.usina.nome)}</title>
<style>
@page{size:A4;margin:14mm}
body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#0f172a;font-size:11.5px;margin:0}
.top{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid ${esc(m.cor)};padding-bottom:8px;margin-bottom:12px}
.top img{max-height:52px;max-width:220px}.top .t{text-align:right}.top h1{font-size:17px;margin:0}.top .s{color:#64748b}
.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:10px 0}
.c{border:1px solid #e2e8f0;border-radius:8px;padding:8px}.c small{color:#64748b;font-size:10px;text-transform:uppercase}.c b{display:block;font-size:18px;margin-top:2px}
.concl{border-left:4px solid ${r.desarmes || r.diasCriticos ? '#dc2626' : '#16a34a'};background:#f8fafc;padding:10px 12px;margin:10px 0;font-size:12.5px}
.sec{margin-top:12px}.sec h2{font-size:13px;margin:0 0 6px}
table{width:100%;border-collapse:collapse;font-size:10px}th,td{border-bottom:1px solid #e2e8f0;padding:2px 6px;text-align:left}tr{page-break-inside:avoid}th{color:#64748b}.n{text-align:right}
tr.ru td{background:#fee2e2}tr.at td{background:#fef3c7}
.leg{display:flex;gap:10px;flex-wrap:wrap;font-size:10px;color:#64748b}.leg i{display:inline-block;width:10px;height:10px;margin-right:4px;vertical-align:-1px}
.nota{color:#475569;font-size:10.5px}
.evita{page-break-inside:avoid}
.ass{margin-top:22px;border-top:1px solid #cbd5e1;padding-top:6px;font-size:10.5px;color:#334155}
svg text{font-family:inherit}
</style></head><body>
<div class="top">${m.logoSrc ? `<img src="${esc(m.logoSrc)}" alt="">` : `<b style="font-size:16px">${esc(m.nomeFantasia)}</b>`}
  <div class="t"><h1>Relatório de qualidade da tensão da rede</h1><div class="s">${esc(d.usina.nome)}${d.usina.kwp ? ` · ${d.usina.kwp.toLocaleString('pt-BR')} kWp` : ''} · ${esc(d.usina.local)}</div>
  <div class="s">Período: ${br(d.periodo.de)} a ${br(d.periodo.ate)} · medição: ${esc(d.fonte)}</div></div></div>
<div class="cards">
  <div class="c"><small>Dias medidos</small><b>${r.dias.length}</b></div>
  <div class="c"><small>Dias fora da faixa</small><b>${r.diasCriticos}</b></div>
  <div class="c"><small>Desligamentos por tensão</small><b>${r.desarmes}</b></div>
  <div class="c"><small>Tensão máxima</small><b>${r.maxima ? `${r.maxima.v.toFixed(0)} V` : '—'}</b>${r.maxima ? `<span class="nota">${brc(r.maxima.dia)}</span>` : ''}</div>
</div>
<div class="concl"><b>Conclusão:</b> ${esc(r.conclusao)}</div>
<div class="sec"><h2>Tensão máxima de cada dia</h2>${graficoMaximas(r)}
  <div class="leg"><span><i style="background:#16a34a"></i>dentro da faixa</span><span><i style="background:#d97706"></i>acima da adequada</span><span><i style="background:#dc2626"></i>≥ ${LIMITE_DESARME_INVERSOR_V} V (inversor desarma)</span><span><i style="background:#991b1b"></i>⚡ desligou por tensão</span></div></div>
<div class="sec"><h2>Resumo por dia (minutos)</h2><table><tr><th>Dia</th><th class="n">Mín. (V)</th><th class="n">Máx. (V)</th><th class="n">Precária</th><th class="n">Crítica</th><th class="n">≥ ${LIMITE_DESARME_INVERSOR_V} V</th><th class="n">Desligou</th></tr>${linhas}</table>
  ${r.diasSemLeitura.length ? `<p class="nota">Sem leitura em ${r.diasSemLeitura.length} dia(s) do período (inversor sem comunicação).</p>` : ''}</div>
${pior}
<div class="sec"><h2>Base técnica</h2>
  <p class="nota">Faixas de tensão de atendimento em regime permanente conforme o PRODIST, Módulo 8 (ANEEL), para tensão nominal de ${r.nominal ?? '—'} V: <b>adequada</b> ${lim.adequada[0]}–${lim.adequada[1]} V; <b>precária</b> ${lim.precaria[0]}–${lim.precaria[1]} V; <b>crítica</b> fora destes limites. Inversores conectados à rede são obrigados a se desligar quando a tensão ultrapassa o limite de proteção (aqui considerado ${LIMITE_DESARME_INVERSOR_V} V).</p>
  <p class="nota">Medições obtidas do ${esc(d.fonte)} (leituras a cada ~5–15 min). São <b>indicativas</b>: o equipamento não é um analisador de energia classe A. Para efeito regulatório, solicite à distribuidora a medição oficial do nível de tensão no ponto de conexão.</p></div>
<div class="ass">${esc(m.rodapeRt)}<br>${esc(m.nomeFantasia)}${m.telefone ? ` · ${esc(m.telefone)}` : ''}${m.email ? ` · ${esc(m.email)}` : ''} · emitido em ${br(d.emitidoEm.slice(0, 10))}</div>
</body></html>`;
}

export { rotuloFase };
