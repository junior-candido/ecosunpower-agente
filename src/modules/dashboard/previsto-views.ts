// Tela "Previsto × Real" da usina (Energy Studio, Marco 1 — 01/10/2026).
// Visual aprovado pelo Junior no desenho Desenho-Tela-Previsto-x-Real.html.
// HTML montado no servidor (SVG puro, sem biblioteca de gráfico).
import { renderLayout } from './views.js';
import type { DashUser } from './permissions.js';
import { diagnosticarDias, diagnosticarCurva, type Hipotese } from '../monitoring/previsto/diagnostico.js';
import {
  situacaoDoDia, diferencaPct, desvioPeriodo, ROTULO_SITUACAO,
  type Clima, type Situacao,
} from '../monitoring/previsto/situacao.js';

const esc = (s: unknown): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (v: number, d = 1): string => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const dataBr = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export interface DiaPrevisto {
  data: string;
  kwh_previsto: number;
  kwh_hora: number[];
  irradiacao_kwh_m2: number | null;
  indice_ceu: number | null;
  clima: Clima;
  premissas: { kwp?: number; inclinacao?: number; azimute?: number; sombreamento?: number; estimados?: string[]; calibrados?: string[]; divergencia?: { cadastro: number; curva: number } };
}

/** Linha de previsto_calibracao (status ok). */
export interface CalibracaoTela {
  azimute: number;
  inclinacao: number;
  fator: number | null;
  confianca: 'alta' | 'media' | 'baixa';
  dias_usados: number | null;
  calculado_em: string;
  mapa: { azimute: number; inclinacao: number; erro: number }[] | null;
}

export interface DadosTelaPrevisto {
  sistemaId: string;
  nome: string;
  kwp: number | null;
  local: string;
  previstos: DiaPrevisto[];             // até 30 dias, qualquer ordem
  reais: Record<string, number>;        // data → kWh medido
  /** Dia em foco (padrão: o mais recente com previsto). */
  diaFoco?: string;
  /** Curva real hora a hora do dia em foco (kWh por hora 0..23), se o inversor der. */
  realHora?: number[] | null;
  /** Calibração automática (orientação/inclinação pela curva real). */
  calibracao?: CalibracaoTela | null;
}

const CLIMA_TXT: Record<Clima, string> = {
  limpo: '☀️ Limpo', parcial: '⛅ Parcial', nublado: '☁️ Nublado', chuva: '🌧️ Chuva', sem_dado: '— sem dado',
};
const CLASSE: Record<Situacao, string> = {
  normal: 's-ok', abaixo: 's-at', muito_abaixo: 's-ru', dia_fraco: 's-nb', sem_comunicacao: 's-cz', sem_previsto: 's-cz',
};
const ORIENT: Record<number, string> = { 0: 'Norte', 45: 'Nordeste', 90: 'Leste', 135: 'Sudeste', 180: 'Sul', 225: 'Sudoeste', 270: 'Oeste', 315: 'Noroeste' };

export interface LinhaDia { data: string; previsto: number; real: number | null; clima: Clima; dif: number | null; situacao: Situacao }

export function montarLinhas(d: DadosTelaPrevisto): LinhaDia[] {
  return [...d.previstos].sort((a, b) => a.data.localeCompare(b.data)).map((p) => {
    const real = d.reais[p.data] ?? null;
    return { data: p.data, previsto: p.kwh_previsto, real, clima: p.clima,
      dif: diferencaPct(p.kwh_previsto, real), situacao: situacaoDoDia({ previsto: p.kwh_previsto, real, clima: p.clima }) };
  });
}

function grafico30(linhas: LinhaDia[]): string {
  const W = 700, H = 240, L = 40, B = 28, T = 12;
  const max = Math.max(5, ...linhas.map((l) => Math.max(l.previsto, l.real ?? 0))) * 1.15;
  const bw = (W - L - 10) / Math.max(1, linhas.length);
  const y = (v: number) => H - B - (v / max) * (H - B - T);
  let s = '';
  for (let i = 0; i <= 4; i++) {
    const v = (max * i) / 4;
    s += `<line x1="${L}" x2="${W - 10}" y1="${y(v)}" y2="${y(v)}" stroke="#e2e8f0"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#64748b">${Math.round(v)}</text>`;
  }
  const pts: string[] = [];
  linhas.forEach((l, i) => {
    const x = L + i * bw;
    if (l.real == null) {
      s += `<rect x="${x + 2}" y="${T}" width="${bw - 4}" height="${H - B - T}" fill="#e2e8f0"><title>${dataBr(l.data)}: sem comunicação</title></rect>`;
    } else {
      const cor = l.situacao === 'muito_abaixo' ? '#dc2626' : l.situacao === 'abaixo' ? '#ea580c' : '#0f766e';
      s += `<rect x="${x + 2}" y="${y(l.real)}" width="${bw - 4}" height="${H - B - y(l.real)}" rx="2" fill="${cor}"><title>${dataBr(l.data)}: gerou ${num(l.real)} · previsto ${num(l.previsto)} kWh</title></rect>`;
    }
    pts.push(`${(x + bw / 2).toFixed(1)},${y(l.previsto).toFixed(1)}`);
    if (i % 5 === 0 || i === linhas.length - 1) s += `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle" font-size="10" fill="#64748b">${dataBr(l.data)}</text>`;
  });
  s += `<polyline points="${pts.join(' ')}" fill="none" stroke="#f59e0b" stroke-width="2.5"/>`;
  s += pts.map((p) => `<circle cx="${p.split(',')[0]}" cy="${p.split(',')[1]}" r="2.5" fill="#f59e0b"/>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Últimos 30 dias: real e previsto">${s}</svg>`;
}

function graficoHora(prev: number[], real: number[] | null | undefined): string {
  const W = 420, H = 240, L = 34, B = 26, T = 10, h0 = 5, h1 = 19;
  const horas = Array.from({ length: h1 - h0 + 1 }, (_, k) => h0 + k);
  const max = Math.max(1, ...horas.map((h) => Math.max(prev[h] ?? 0, real?.[h] ?? 0))) * 1.15;
  const x = (k: number) => L + (k * (W - L - 10)) / (horas.length - 1);
  const y = (v: number) => H - B - (v / max) * (H - B - T);
  let s = '';
  for (let i = 0; i <= 4; i++) s += `<line x1="${L}" x2="${W - 10}" y1="${y((max * i) / 4)}" y2="${y((max * i) / 4)}" stroke="#e2e8f0"/><text x="${L - 6}" y="${y((max * i) / 4) + 4}" text-anchor="end" font-size="11" fill="#64748b">${num((max * i) / 4, 0)}</text>`;
  horas.forEach((h, k) => { if (h % 2 === 1) s += `<text x="${x(k)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="#64748b">${h}h</text>`; });
  if (real) {
    const pr = horas.map((h, k) => `${x(k).toFixed(1)},${y(real[h] ?? 0).toFixed(1)}`).join(' ');
    s += `<polygon points="${x(0)},${y(0)} ${pr} ${x(horas.length - 1)},${y(0)}" fill="#0f766e22"/><polyline points="${pr}" fill="none" stroke="#0f766e" stroke-width="2.5"/>`;
  }
  s += `<polyline points="${horas.map((h, k) => `${x(k).toFixed(1)},${y(prev[h] ?? 0).toFixed(1)}`).join(' ')}" fill="none" stroke="#f59e0b" stroke-width="2.5" stroke-dasharray="6 4"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Hora a hora: real e previsto">${s}</svg>`;
}

const ROSA_NOMES: Record<number, string> = { 0: 'N', 45: 'NE', 90: 'L', 135: 'SE', 180: 'S', 225: 'SO', 270: 'O', 315: 'NO' };

/** Rosa dos ventos: quão bem cada orientação reproduz a curva real (na melhor inclinação). */
export function rosaCalibracao(c: CalibracaoTela): string {
  const pts = (c.mapa ?? []).filter((m) => Number(m.inclinacao) === Number(c.inclinacao) && Number.isFinite(m.erro));
  if (pts.length < 8) return '';
  const errs = pts.map((m) => m.erro);
  const min = Math.min(...errs), max = Math.max(...errs);
  const R = 80, cx = 100, cy = 100;
  const raio = (e: number) => R * (0.15 + (0.85 * (max - e)) / Math.max(1e-9, max - min));
  const xy = (az: number, r: number) => [cx + r * Math.sin((az * Math.PI) / 180), cy - r * Math.cos((az * Math.PI) / 180)];
  const ord = [...pts].sort((a, b) => a.azimute - b.azimute);
  const poly = ord.map((m) => xy(m.azimute, raio(m.erro)).map((v) => v.toFixed(1)).join(',')).join(' ');
  let g = '';
  for (const fr of [0.33, 0.66, 1]) g += `<circle cx="${cx}" cy="${cy}" r="${R * fr}" fill="none" stroke="#e2e8f0"/>`;
  for (const [az, nome] of Object.entries(ROSA_NOMES)) {
    const [x, y] = xy(Number(az), R + 12);
    g += `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle" font-size="11" fill="#64748b" font-weight="${nome === 'N' ? 700 : 400}">${nome}</text>`;
  }
  const [bx, by] = xy(c.azimute, R);
  return `<svg viewBox="0 0 200 200" style="max-width:220px;margin:0 auto" role="img" aria-label="Orientação que melhor explica a curva real">${g}
    <polygon points="${poly}" fill="#0f766e33" stroke="#0f766e" stroke-width="2"/>
    <line x1="${cx}" y1="${cy}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke="#d97706" stroke-width="3" stroke-linecap="round"/>
    <circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="5" fill="#d97706"/></svg>`;
}

const nomeOrient = (az: number): string => {
  const k = (Math.round((((az % 360) + 360) % 360) / 45) * 45) % 360;
  return ORIENT[k] ?? `${Math.round(az)}°`;
};

export const CSS_PREVISTO = `<style>
.pv{color:#0f172a;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
.pv h1{font-size:21px;margin:0;color:inherit}.pv .sub{color:#64748b;font-size:14px;margin:4px 0 14px}
.pv-claro{background:#f1f5f9;border-radius:16px;padding:16px}
.pv .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:14px}
.pv .c,.pv .box{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px}
.pv .c small{color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.04em}.pv .c .v{font-size:26px;font-weight:800;margin-top:4px}.pv .c .d{font-size:12px;color:#64748b;margin-top:2px}
.pv .tag{display:inline-block;font-size:10px;font-weight:700;padding:2px 6px;border-radius:5px;margin-left:6px}.pv .med{background:#ccfbf1;color:#115e59}.pv .calc{background:#fef3c7;color:#92400e}
.pv .box{margin-bottom:14px}.pv .box h2{font-size:15px;margin:0 0 4px}.pv .m{color:#64748b;font-size:13px;margin:0 0 10px}
.pv .g2{display:grid;grid-template-columns:1.6fr 1fr;gap:14px}@media(max-width:860px){.pv .g2{grid-template-columns:1fr}}
.pv .leg{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:#64748b;margin-top:6px}.pv .leg i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:5px;vertical-align:-2px}
.pv svg{width:100%;height:auto;display:block}
.pv table{width:100%;border-collapse:collapse;font-size:13px}.pv th,.pv td{padding:8px 9px;border-bottom:1px solid #e2e8f0;text-align:left;white-space:nowrap}.pv th{color:#64748b;font-size:12px}.pv .n{text-align:right}
.pv .tb{overflow-x:auto}.pv .st{font-weight:700;font-size:12px;padding:3px 8px;border-radius:999px}
.pv .s-ok{background:#dcfce7;color:#166534}.pv .s-at{background:#ffedd5;color:#9a3412}.pv .s-ru{background:#fee2e2;color:#991b1b}.pv .s-cz{background:#e2e8f0;color:#334155}.pv .s-nb{background:#e0f2fe;color:#075985}
.pv .nota{font-size:12px;color:#64748b}.pv .por li{margin:5px 0;font-size:13px}.pv a.volta{font-size:13px;color:#0f766e}
.pv .hip{border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;margin:8px 0}.pv .hip-t{margin-bottom:4px}
.pv .vazio{background:#fff;border:1px dashed #94a3b8;border-radius:14px;padding:22px;text-align:center;color:#334155}
</style>`;

export function renderPrevistoBody(d: DadosTelaPrevisto): string {
  const topo = `<a class="volta" href="/dashboard/monitoramento/${esc(d.sistemaId)}">← voltar para a usina</a>
    <h1>☀️ ${esc(d.nome)}${d.kwp ? ` — ${num(d.kwp, 2)} kWp` : ''}</h1><div class="sub">${esc(d.local)} · Previsto × Real</div>`;
  const linhas = montarLinhas(d);
  if (linhas.length === 0) {
    return `${CSS_PREVISTO}<div class="pv pv-claro">${topo}<div class="vazio">⏳ <b>O previsto desta usina ainda não foi calculado.</b><br>
      A conta roda todo dia às 21h. Confira se a usina tem <b>posição no mapa</b> e <b>potência (kWp)</b> no cadastro — sem isso não dá para calcular.</div></div>`;
  }
  const foco = linhas.find((l) => l.data === d.diaFoco) ?? linhas[linhas.length - 1];
  const prevFoco = d.previstos.find((p) => p.data === foco.data)!;
  const desvio30 = desvioPeriodo(linhas);
  const sitFoco = foco.situacao;
  const prem = prevFoco.premissas ?? {};
  const estimados = prem.estimados ?? [];
  const atencao = linhas.filter((l) => l.situacao !== 'normal').slice(-8).reverse();

  const cards = `<div class="cards">
    <div class="c"><small>Gerou em ${dataBr(foco.data)} <span class="tag med">MEDIDO</span></small><div class="v" style="color:#0f766e">${foco.real == null ? '—' : num(foco.real) + ' kWh'}</div><div class="d">${foco.real == null ? 'sem leitura do inversor' : 'lido do inversor'}</div></div>
    <div class="c"><small>Deveria gerar <span class="tag calc">CALCULADO</span></small><div class="v" style="color:#d97706">${num(foco.previsto)} kWh</div><div class="d">com o sol que fez no dia</div></div>
    <div class="c"><small>Diferença</small><div class="v">${foco.dif == null ? '—' : (foco.dif > 0 ? '+' : '') + num(foco.dif) + '%'}</div><div class="d">normal até −10%</div></div>
    <div class="c"><small>Clima do dia</small><div class="v" style="font-size:20px">${CLIMA_TXT[foco.clima]}</div><div class="d">${prevFoco.indice_ceu != null ? `sol = ${Math.round(Number(prevFoco.indice_ceu) * 100)}% de um dia limpo` : ''}</div></div>
    <div class="c"><small>Situação</small><div class="v" style="font-size:18px"><span class="st ${CLASSE[sitFoco]}">${ROTULO_SITUACAO[sitFoco]}</span></div><div class="d">últimos ${linhas.length} dias: ${desvio30 == null ? '—' : (desvio30 > 0 ? '+' : '') + num(desvio30) + '%'}</div></div>
  </div>`;

  const tabela = atencao.length === 0
    ? '<p class="nota">Nenhum dia fora do normal no período. 👍</p>'
    : `<div class="tb"><table><tr><th>Dia</th><th>Clima</th><th class="n">Previsto</th><th class="n">Real</th><th class="n">Diferença</th><th>Situação</th></tr>
      ${atencao.map((l) => `<tr><td>${dataBr(l.data)}</td><td>${CLIMA_TXT[l.clima]}</td><td class="n">${num(l.previsto)}</td><td class="n">${l.real == null ? '—' : num(l.real)}</td><td class="n">${l.dif == null ? '—' : num(l.dif) + '%'}</td><td><span class="st ${CLASSE[l.situacao]}">${ROTULO_SITUACAO[l.situacao]}</span></td></tr>`).join('')}
      </table></div>`;

  const porque = `<ul class="por">
      <li>☀️ Sol que bateu no local: <b>${prevFoco.irradiacao_kwh_m2 != null ? num(Number(prevFoco.irradiacao_kwh_m2), 1) : '—'} kWh/m²</b> (satélite)</li>
      <li>📐 Telhado <b>${esc(nomeOrient(Number(prem.azimute)))}</b>, inclinação <b>${esc(prem.inclinacao ?? '—')}°</b>${prem.calibrados?.length ? ' <span class="tag calc">DESCOBERTO PELA CURVA</span>' : ''}</li>
      <li>⚡ Potência <b>${prem.kwp != null ? num(Number(prem.kwp), 2) : '—'} kWp</b></li>
      ${prem.sombreamento ? `<li>🌳 Sombra do cadastro: −${num(Number(prem.sombreamento) * 100, 0)}%</li>` : ''}
      <li>🔌 Calor, fios, inversor e sujeira: calculados hora a hora</li></ul>
    ${prem.divergencia ? `<p class="nota">⚠ O cadastro diz telhado <b>${esc(nomeOrient(prem.divergencia.cadastro))}</b>, mas a curva real indica <b>${esc(nomeOrient(prem.divergencia.curva))}</b>. <a href="/dashboard/monitoramento/${esc(d.sistemaId)}/editar">Conferir cadastro</a></p>` : ''}
    ${estimados.length ? `<p class="nota">⚠ Estimado (falta no cadastro): ${esc(estimados.join(', '))}. <a href="/dashboard/monitoramento/${esc(d.sistemaId)}/editar">Corrigir cadastro</a></p>` : ''}
    <p class="nota">Calculado pelo nosso motor (o mesmo validado contra o PV*SOL).</p>`;

  return `${CSS_PREVISTO}<div class="pv pv-claro">${topo}${cards}
  <div class="g2">
    <div class="box"><h2>Últimos ${linhas.length} dias — gerou o que devia?</h2><p class="m">Barra = o que gerou. Linha = o que deveria ter gerado com o sol de cada dia.</p>${grafico30(linhas)}
      <div class="leg"><span><i style="background:#0f766e"></i>Real (medido)</span><span><i style="background:#f59e0b"></i>Previsto (calculado)</span><span><i style="background:#dc2626"></i>Muito abaixo</span><span><i style="background:#e2e8f0"></i>Sem comunicação (não é defeito)</span></div></div>
    <div class="box"><h2>${dataBr(foco.data)}, hora a hora</h2><p class="m">Curva do previsto${d.realHora ? ' × a curva real do inversor' : ''}.</p>${graficoHora(prevFoco.kwh_hora ?? [], d.realHora)}
      <div class="leg">${d.realHora ? '<span><i style="background:#0f766e"></i>Real</span>' : ''}<span><i style="background:#f59e0b"></i>Previsto</span></div>
      ${d.realHora ? '' : '<p class="nota">A curva real hora a hora aparece quando o inversor informa.</p>'}</div>
  </div>
  <div class="g2">
    <div class="box"><h2>Dias que chamaram atenção</h2>${tabela}<p class="nota">Pouca geração em dia de chuva <b>não</b> vira alerta: o previsto também cai.</p></div>
    <div class="box"><h2>Por que o previsto deu ${num(foco.previsto)} kWh?</h2>${porque}</div>
  </div>${caixaDiagnostico([...diagnosticarDias(linhas.map((l) => ({ data: l.data, previsto: l.previsto, real: l.real, clima: l.clima }))), ...diagnosticarCurva(prevFoco.kwh_hora ?? [], d.realHora, foco.clima)], dataBr(foco.data))}${caixaCalibracao(d)}</div>`;
}

export { curvaPorHora } from '../monitoring/previsto/curva.js';

const ICONE_HIP: Record<Hipotese['tipo'], string> = {
  sujeira: '🧽', degrau: '🔌', rendimento_baixo: '📉', corte_inversor: '✂️', desligamento: '⚡',
};

function caixaDiagnostico(hs: Hipotese[], diaFoco: string): string {
  if (hs.length === 0) {
    return '<div class="box"><h2>🩺 Diagnóstico</h2><p class="m">Nenhum padrão de problema nos dados (sujeira, queda em degrau, corte do inversor, desligamento). 👍</p></div>';
  }
  const itens = hs.map((h) => `<div class="hip">
      <div class="hip-t">${ICONE_HIP[h.tipo]} <b>${esc(h.titulo)}</b> <span class="tag ${h.confianca === 'provavel' ? 'med' : 'calc'}">${h.confianca === 'provavel' ? 'PROVÁVEL' : 'POSSÍVEL'}</span>
        ${h.tipo === 'corte_inversor' || h.tipo === 'desligamento' ? `<span class="nota">(curva de ${esc(diaFoco)})</span>` : ''}</div>
      <div class="nota"><b>Evidência:</b> ${esc(h.evidencia)}</div>
      <div class="nota"><b>O que fazer:</b> ${esc(h.acao)}</div></div>`).join('');
  return `<div class="box"><h2>🩺 Diagnóstico — prováveis causas</h2>
    <p class="m">Hipóteses a partir do padrão da diferença entre o real (medido) e o previsto (calculado). Confirme no local antes de concluir.</p>${itens}</div>`;
}

function caixaCalibracao(d: DadosTelaPrevisto): string {
  const c = d.calibracao;
  if (!c) {
    return '<div class="box"><h2>🧭 Calibração automática</h2><p class="m">De madrugada o sistema compara a curva real de dias de céu limpo com 144 combinações de telhado e descobre sozinho a orientação e a inclinação. Esta usina ainda não foi calibrada.</p></div>';
  }
  const conf = { alta: '🟢 alta', media: '🟡 média', baixa: '🔴 baixa' }[c.confianca];
  const quando = c.calculado_em ? `${c.calculado_em.slice(8, 10)}/${c.calculado_em.slice(5, 7)}` : '';
  return `<div class="box"><h2>🧭 Calibração automática — o que a curva real revelou</h2>
    <div class="g2" style="grid-template-columns:240px 1fr;align-items:center">
      <div>${rosaCalibracao(c)}</div>
      <div><ul class="por">
        <li>Telhado virado para <b>${esc(nomeOrient(c.azimute))}</b> (${Math.round(c.azimute)}°), inclinação <b>${Math.round(c.inclinacao)}°</b></li>
        ${c.fator != null ? `<li>Rende <b>${Math.round(Number(c.fator) * 100)}%</b> do que a física diz para esse telhado (sujeira, sombra e cabos entram aqui)</li>` : ''}
        <li>Confiança: <b>${conf}</b> · ${c.dias_usados ?? '—'} dias de céu limpo · calibrado em ${esc(quando)}</li>
      </ul>
      <p class="nota">A área verde mostra o quanto cada direção explica a curva real; a seta laranja é a melhor. ${c.confianca === 'alta' ? 'Com confiança alta, o previsto passa a usar este telhado quando o cadastro não informa.' : 'Com confiança abaixo de alta, o previsto continua usando o cadastro.'}</p></div>
    </div></div>`;
}

/** Página inteira (tela renovada: sem Tailwind do CDN — CSS próprio acima). */
export function renderPrevistoPage(body: string, user: DashUser | undefined): string {
  return renderLayout({ active: 'monitoramento', title: 'Previsto × Real', body, user, largo: true, tailwind: false });
}
