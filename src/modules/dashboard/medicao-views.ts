// src/modules/dashboard/medicao-views.ts
//
// Aba Medição — o que o cliente abre quando paga a mensalidade do kit.
//
// A tela é organizada em torno de UM número: a demanda de 15 minutos. É a
// janela em que a distribuidora mede, e o medidor dela alisa o pico. Mostrar a
// média de 15 min ao lado do pico instantâneo é o que ninguém mostra — e é o
// que transforma a medição em argumento e em laudo.
//
// HTML puro, sem biblioteca de gráfico: o desenho é SVG montado aqui. Menos
// dependência, carrega em qualquer celular.

import type { ResumoMedicao, Aparelho } from './medicao-queries.js';

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit',
  });
}

function w(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1000) return (n / 1000).toFixed(2).replace('.', ',') + ' kW';
  return Math.round(n) + ' W';
}

function card(rotulo: string, valor: string, nota = '', destaque = false): string {
  return `
    <div style="flex:1;min-width:150px;background:${destaque ? '#0f172a' : '#fff'};border:1px solid ${destaque ? '#0f172a' : '#e2e8f0'};border-radius:12px;padding:14px 16px">
      <div style="font-size:12px;color:${destaque ? '#94a3b8' : '#64748b'};margin-bottom:4px">${esc(rotulo)}</div>
      <div style="font-size:22px;font-weight:700;color:${destaque ? '#fff' : '#0f172a'};font-variant-numeric:tabular-nums">${esc(valor)}</div>
      ${nota ? `<div style="font-size:11px;color:${destaque ? '#64748b' : '#94a3b8'};margin-top:3px">${esc(nota)}</div>` : ''}
    </div>`;
}

/** Gráfico de barras das janelas de 15 min. SVG, sem biblioteca. */
function grafico(janelas: ResumoMedicao['janelas']): string {
  if (janelas.length === 0) {
    return `<p style="color:#94a3b8;padding:20px 0">Ainda sem leitura suficiente para o gráfico.</p>`;
  }
  const L = 900, A = 220, pad = { t: 14, r: 12, b: 26, l: 46 };
  const maxV = Math.max(...janelas.map((j) => Math.max(j.picoW, j.mediaW)), 1);
  const larg = (L - pad.l - pad.r) / janelas.length;

  const barras = janelas.map((j, i) => {
    const x = pad.l + i * larg;
    const hMed = ((A - pad.t - pad.b) * Math.max(j.mediaW, 0)) / maxV;
    const hPic = ((A - pad.t - pad.b) * Math.max(j.picoW, 0)) / maxV;
    const yMed = A - pad.b - hMed;
    const yPic = A - pad.b - hPic;
    return `
      <rect x="${(x + larg * 0.12).toFixed(1)}" y="${yPic.toFixed(1)}" width="${(larg * 0.76).toFixed(1)}" height="${Math.max(hPic, 0).toFixed(1)}" fill="#dbeafe"/>
      <rect x="${(x + larg * 0.12).toFixed(1)}" y="${yMed.toFixed(1)}" width="${(larg * 0.76).toFixed(1)}" height="${Math.max(hMed, 0).toFixed(1)}" fill="#2563eb"/>
      <title>${esc(hora(j.inicio))} — média ${esc(w(j.mediaW))} · pico ${esc(w(j.picoW))}</title>`;
  }).join('');

  // Rótulos de hora a cada ~6 janelas (1h30) pra não embolar.
  const passo = Math.max(1, Math.ceil(janelas.length / 8));
  const rotulos = janelas.map((j, i) => {
    if (i % passo !== 0) return '';
    const x = pad.l + i * larg + larg / 2;
    return `<text x="${x.toFixed(1)}" y="${A - 8}" font-size="10" fill="#94a3b8" text-anchor="middle">${esc(hora(j.inicio))}</text>`;
  }).join('');

  const eixoY = [0, 0.5, 1].map((f) => {
    const y = A - pad.b - (A - pad.t - pad.b) * f;
    return `
      <line x1="${pad.l}" y1="${y.toFixed(1)}" x2="${L - pad.r}" y2="${y.toFixed(1)}" stroke="#eef2f6" stroke-width="1"/>
      <text x="${pad.l - 6}" y="${(y + 3).toFixed(1)}" font-size="10" fill="#94a3b8" text-anchor="end">${esc(w(maxV * f))}</text>`;
  }).join('');

  return `
    <div style="overflow-x:auto">
      <svg viewBox="0 0 ${L} ${A}" style="width:100%;min-width:520px;height:auto">
        ${eixoY}${barras}${rotulos}
      </svg>
    </div>
    <div style="display:flex;gap:16px;font-size:12px;color:#64748b;margin-top:6px">
      <span><span style="display:inline-block;width:10px;height:10px;background:#2563eb;border-radius:2px;margin-right:5px"></span>média de 15 min <em>(o que a distribuidora mede)</em></span>
      <span><span style="display:inline-block;width:10px;height:10px;background:#dbeafe;border-radius:2px;margin-right:5px"></span>pico instantâneo</span>
    </div>`;
}

export function renderMedicaoPage(
  aparelhos: Aparelho[],
  r: ResumoMedicao,
  horas: number,
): string {
  if (aparelhos.length === 0) {
    return `
    <div style="max-width:920px;margin:0 auto">
      <h1 style="font-size:24px;font-weight:700;color:#0f172a;margin-bottom:6px">🔌 Medição</h1>
      <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;margin-top:16px">
        <p style="color:#0f172a;font-weight:600;margin:0 0 6px">Nenhum medidor mandou leitura ainda.</p>
        <p style="color:#64748b;margin:0">O aparelho precisa do script de envio rodando, com o token do servidor. O procedimento está em <code>docs/kit-medicao</code>.</p>
      </div>
    </div>`;
  }

  const seletor = aparelhos.length > 1
    ? `<form method="GET" style="margin:0 0 16px">
         <select name="device" onchange="this.form.submit()" style="padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px">
           ${aparelhos.map((a) => `<option value="${esc(a.deviceId)}"${a.deviceId === r.aparelho?.deviceId ? ' selected' : ''}>${esc(a.apelido || a.deviceId)}</option>`).join('')}
         </select>
         <input type="hidden" name="horas" value="${horas}">
       </form>`
    : '';

  const atrasado = (r.minutosSemReceber ?? 0) > 10;
  const statusTexto = r.minutosSemReceber === null
    ? 'sem leitura'
    : r.minutosSemReceber < 3 ? 'recebendo agora' : `última há ${r.minutosSemReceber} min`;

  const cards = r.agora
    ? `<div style="display:flex;gap:12px;flex-wrap:wrap;margin:0 0 20px">
         ${card('Agora', w(r.agora.potenciaW), `às ${hora(r.agora.medidoEm)}`)}
         ${r.demanda ? card('Demanda de 15 min', w(r.demanda.demandaW), `maior janela · ${hora(r.demanda.janelaInicio)}`, true) : ''}
         ${r.demanda ? card('Pico instantâneo', w(r.demanda.picoInstantaneoW), 'que a conta de luz não mostra') : ''}
         ${r.consumoDiaKwh !== null ? card('Consumo no período', r.consumoDiaKwh.toFixed(2).replace('.', ',') + ' kWh') : ''}
         ${r.injecaoDiaKwh ? card('Injetado na rede', r.injecaoDiaKwh.toFixed(2).replace('.', ',') + ' kWh') : ''}
       </div>`
    : '';

  const eletrico = r.agora
    ? `<div style="display:flex;gap:12px;flex-wrap:wrap;margin:0 0 22px">
         ${card('Tensão', r.agora.tensao !== null ? r.agora.tensao.toFixed(1).replace('.', ',') + ' V' : '—')}
         ${card('Corrente', r.agora.corrente !== null ? r.agora.corrente.toFixed(2).replace('.', ',') + ' A' : '—')}
         ${card('Fator de potência', r.agora.fatorPotencia !== null ? r.agora.fatorPotencia.toFixed(2).replace('.', ',') : '—')}
         ${card('Leituras no período', String(r.aparelho?.leituras ?? 0))}
       </div>`
    : '';

  const faixas = [6, 24, 72].map((h) =>
    `<a href="?device=${encodeURIComponent(r.aparelho?.deviceId ?? '')}&horas=${h}" style="padding:6px 14px;border-radius:8px;font-size:13px;text-decoration:none;${h === horas ? 'background:#0f172a;color:#fff' : 'background:#fff;color:#475569;border:1px solid #e2e8f0'}">${h}h</a>`
  ).join(' ');

  return `
  <div style="max-width:920px;margin:0 auto">
    <h1 style="font-size:24px;font-weight:700;color:#0f172a;margin-bottom:6px">🔌 Medição</h1>
    <p style="color:#64748b;margin-bottom:16px">
      ${esc(r.aparelho?.apelido || r.aparelho?.deviceId || '')} ·
      <span style="color:${atrasado ? '#b91c1c' : '#16a34a'};font-weight:600">${esc(statusTexto)}</span>
    </p>

    ${seletor}
    ${cards}
    ${eletrico}

    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px 18px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:10px">
        <strong style="color:#0f172a;font-size:15px">Potência por janela de 15 minutos</strong>
        <div style="display:flex;gap:6px">${faixas}</div>
      </div>
      ${grafico(r.janelas)}
    </div>

    <div style="background:#f8fafc;border-left:3px solid #2563eb;border-radius:0 8px 8px 0;padding:12px 16px;margin-top:16px">
      <div style="font-size:12px;letter-spacing:.6px;text-transform:uppercase;font-weight:700;color:#2563eb;margin-bottom:4px">Por que a janela de 15 minutos</div>
      <p style="margin:0;color:#475569;font-size:14px;line-height:1.55">
        A distribuidora mede demanda pela <strong>média de 15 minutos</strong>, não pelo pico instantâneo.
        O medidor dela <strong>alisa o pico</strong> — então o cliente paga por uma média que nunca viu.
        Aqui as duas aparecem lado a lado: a barra escura é o que ele paga, a clara é o que realmente aconteceu.
      </p>
    </div>
  </div>`;
}
