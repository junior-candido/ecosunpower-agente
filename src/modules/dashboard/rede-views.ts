// Aba "Rede" da usina (Energy Studio, Marco 2 — 02/10/2026): tensão por fase no
// dia sobre as faixas da ANEEL (PRODIST Módulo 8) + limite de desarme do
// inversor + desarmes prováveis (tensão alta e a geração despenca em seguida).
import { renderLayout } from './views.js';
import type { DashUser } from './permissions.js';
import { limitesProdist, LIMITE_DESARME_INVERSOR_V } from '../energia/prodist.js';
import type { AnaliseRede, LeituraTensao, PontoGeracao } from '../monitoring/rede/analise.js';
import { CSS_PREVISTO } from './previsto-views.js';

const esc = (s: unknown): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface DadosTelaRede {
  sistemaId: string;
  nome: string;
  local: string;
  dia: string;              // YYYY-MM-DD (Brasília)
  leituras: LeituraTensao[];
  geracao: PontoGeracao[];
  analise: AnaliseRede;
  fonte: string;            // "inversor Sungrow" / "medidor Shelly" / ...
  /** Marca coleta tensão? (false = explica que ainda não temos dado dessa marca) */
  marcaTemTensao: boolean;
}

const CORES = ['#2563eb', '#db2777', '#0891b2', '#7c3aed'];
const minutoDoDia = (ts: string): number => {
  const d = new Date(Date.parse(ts) - 3 * 3600_000); // Brasília
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};
const hhmm = (ts: string): string => { const m = minutoDoDia(ts); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const somaDia = (iso: string, n: number): string => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

export function graficoTensaoDia(d: DadosTelaRede): string {
  const a = d.analise;
  const nominal = a.nominal ?? 220;
  const lim = limitesProdist(nominal);
  const vals = d.leituras.map((l) => l.v);
  const vMin = Math.min(lim.precaria[0] - 8, ...vals) , vMax = Math.max(LIMITE_DESARME_INVERSOR_V + 6, lim.precaria[1] + 8, ...vals);
  const W = 760, H = 300, L = 46, R = 46, T = 12, B = 28;
  const x = (min: number) => L + (min / 1440) * (W - L - R);
  const y = (v: number) => H - B - ((v - vMin) / (vMax - vMin)) * (H - B - T);
  const faixa = (de: number, ate: number, cor: string) => `<rect x="${L}" width="${W - L - R}" y="${y(ate)}" height="${Math.max(0, y(de) - y(ate))}" fill="${cor}"/>`;
  let s = '';
  // faixas: crítica (fundo vermelho claro), precária (amarelo), adequada (verde)
  s += faixa(vMin, vMax, '#fee2e2');
  s += faixa(lim.precaria[0], lim.precaria[1], '#fef3c7');
  s += faixa(lim.adequada[0], lim.adequada[1], '#dcfce7');
  for (let h = 0; h <= 24; h += 3) s += `<line x1="${x(h * 60)}" x2="${x(h * 60)}" y1="${T}" y2="${H - B}" stroke="#e2e8f0"/><text x="${x(h * 60)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="#64748b">${h}h</text>`;
  for (const v of [lim.precaria[0], lim.adequada[0], nominal, lim.adequada[1], LIMITE_DESARME_INVERSOR_V]) {
    s += `<text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="#64748b">${v}</text>`;
  }
  s += `<line x1="${L}" x2="${W - R}" y1="${y(LIMITE_DESARME_INVERSOR_V)}" y2="${y(LIMITE_DESARME_INVERSOR_V)}" stroke="#dc2626" stroke-width="1.5" stroke-dasharray="6 4"/>`;
  s += `<text x="${W - R - 4}" y="${y(LIMITE_DESARME_INVERSOR_V) - 4}" text-anchor="end" font-size="10" fill="#dc2626">${LIMITE_DESARME_INVERSOR_V} V — inversor desarma</text>`;
  // geração (área cinza, eixo da direita)
  if (d.geracao.length) {
    const gmax = Math.max(0.1, ...d.geracao.map((g) => g.kw));
    const gy = (kw: number) => H - B - (kw / gmax) * (H - B - T) * 0.9;
    const pts = [...d.geracao].sort((p, q) => Date.parse(p.ts) - Date.parse(q.ts)).map((g) => `${x(minutoDoDia(g.ts)).toFixed(1)},${gy(g.kw).toFixed(1)}`);
    s += `<polyline points="${pts.join(' ')}" fill="none" stroke="#94a3b8" stroke-width="1.5" opacity=".8"/>`;
    s += `<text x="${W - R + 4}" y="${T + 10}" font-size="10" fill="#94a3b8">${gmax.toFixed(1)} kW</text>`;
  }
  // tensão por fase
  a.fases.forEach((f, i) => {
    const pts = d.leituras.filter((l) => l.fase === f.fase).sort((p, q) => Date.parse(p.ts) - Date.parse(q.ts))
      .map((l) => `${x(minutoDoDia(l.ts)).toFixed(1)},${y(l.v).toFixed(1)}`);
    s += `<polyline points="${pts.join(' ')}" fill="none" stroke="${CORES[i % CORES.length]}" stroke-width="2"/>`;
  });
  for (const dz of a.desarmes) s += `<circle cx="${x(minutoDoDia(dz.ts))}" cy="${y(dz.v)}" r="7" fill="none" stroke="#dc2626" stroke-width="2.5"><title>${hhmm(dz.ts)} — ${dz.v.toFixed(0)} V e a geração caiu de ${dz.kwAntes.toFixed(1)} para ${dz.kwDepois.toFixed(1)} kW</title></circle>`;
  const leg = a.fases.map((f, i) => `<span><i style="background:${CORES[i % CORES.length]}"></i>${esc(rotuloFase(f.fase))}</span>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Tensão da rede no dia">${s}</svg>
    <div class="leg">${leg}<span><i style="background:#94a3b8"></i>Geração</span><span><i style="background:#dcfce7"></i>Adequada</span><span><i style="background:#fef3c7"></i>Precária</span><span><i style="background:#fee2e2"></i>Crítica</span><span>⭕ desarme provável</span></div>`;
}

export function rotuloFase(f: string): string {
  const m = /^tensao_fase_([a-z])$/.exec(f);
  return m ? `Fase ${m[1].toUpperCase()}` : f;
}

export function renderRedeBody(d: DadosTelaRede): string {
  const a = d.analise;
  const nav = `<div style="display:flex;gap:10px;align-items:center;margin:6px 0 12px">
      <a class="volta" href="?dia=${somaDia(d.dia, -1)}">← dia anterior</a>
      <b>${d.dia.slice(8, 10)}/${d.dia.slice(5, 7)}/${d.dia.slice(0, 4)}</b>
      <a class="volta" href="?dia=${somaDia(d.dia, 1)}">dia seguinte →</a>
      <span style="flex:1"></span><a class="volta" href="/dashboard/monitoramento/${esc(d.sistemaId)}/rede/relatorio?dias=30" target="_blank" rel="noopener">📄 Relatório em PDF (30 dias)</a></div>`;
  const topo = `<a class="volta" href="/dashboard/monitoramento/${esc(d.sistemaId)}">← voltar para a usina</a>
    <h1>⚡ ${esc(d.nome)} — Rede</h1><div class="sub">${esc(d.local)} · tensão medida pelo ${esc(d.fonte)} · faixas da ANEEL (PRODIST Módulo 8)</div>${nav}`;
  if (a.nivel === 'sem_dado') {
    const texto = d.marcaTemTensao
      ? 'Sem leitura de tensão neste dia (inversor sem comunicação ou dia ainda não coletado).'
      : 'A marca deste inversor ainda não manda a tensão da rede para a plataforma. Hoje temos tensão de Sungrow, FoxESS, Solis e do medidor Shelly — as outras marcas estão a caminho.';
    return `${CSS_PREVISTO}<div class="pv pv-claro">${topo}<div class="vazio">📡 ${esc(texto)}</div></div>`;
  }
  const corNivel = { ok: 's-ok', atencao: 's-at', critico: 's-ru', sem_dado: 's-cz' }[a.nivel];
  const rot = { ok: '✅ Rede dentro da faixa', atencao: '🟠 Rede no limite', critico: '🔴 Rede fora da faixa', sem_dado: '—' }[a.nivel];
  const tabela = `<div class="tb"><table><tr><th>Fase</th><th class="n">Mín.</th><th class="n">Máx.</th><th class="n">Adequada</th><th class="n">Precária</th><th class="n">Crítica</th><th class="n">≥ ${LIMITE_DESARME_INVERSOR_V} V</th></tr>
    ${a.fases.map((f) => `<tr><td>${esc(rotuloFase(f.fase))}</td><td class="n">${f.min.toFixed(0)} V</td><td class="n">${f.max.toFixed(0)} V</td><td class="n">${f.minutos.adequada} min</td><td class="n">${f.minutos.precaria} min</td><td class="n">${f.minutos.critica} min</td><td class="n">${f.minutosAcimaDesarme} min</td></tr>`).join('')}
    </table></div>`;
  const desarmes = a.desarmes.length
    ? `<ul class="por">${a.desarmes.map((dz) => `<li><b>${hhmm(dz.ts)}</b> — tensão em <b>${dz.v.toFixed(0)} V</b> e a geração caiu de ${dz.kwAntes.toFixed(1)} kW para ${dz.kwDepois.toFixed(1)} kW</li>`).join('')}</ul>
       <p class="nota">Isso é o inversor se protegendo da tensão alta da rede (ele é obrigado a desligar acima do limite). Com vários dias assim, dá para abrir reclamação na distribuidora pedindo adequação da tensão (PRODIST Módulo 8).</p>`
    : '<p class="nota">Nenhum desligamento por tensão alta neste dia. 👍</p>';
  return `${CSS_PREVISTO}<div class="pv pv-claro">${topo}
    <div class="box"><span class="st ${corNivel}">${rot}</span> <span style="margin-left:8px">${esc(a.veredito)}</span></div>
    <div class="box"><h2>Tensão ao longo do dia</h2><p class="m">Cada linha é uma fase. Verde = adequada · amarelo = precária · vermelho = crítica. A linha vermelha tracejada é onde o inversor desarma.</p>${graficoTensaoDia(d)}</div>
    <div class="g2">
      <div class="box"><h2>Tempo em cada faixa</h2>${tabela}<p class="nota">Tensão nominal considerada: ${a.nominal ?? '—'} V. Valores indicativos (o inversor não é analisador classe A).</p></div>
      <div class="box"><h2>Desarmes prováveis por tensão</h2>${desarmes}</div>
    </div></div>`;
}

export function renderRedePage(body: string, user: DashUser | undefined): string {
  return renderLayout({ active: 'monitoramento', title: 'Rede', body, user, largo: true, tailwind: false });
}
