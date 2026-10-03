// ENERGY STUDIO — a página que reúne tudo (02/10/2026): Previsto × Real,
// calibração, alertas, diagnóstico, Rede/Radar, importação e relatórios.
import { renderLayout } from './views.js';
import type { DashUser } from './permissions.js';
import { CSS_PREVISTO } from './previsto-views.js';
import { ROTULO_SITUACAO } from '../monitoring/previsto/situacao.js';
import type { ResumoPrevistoFrota } from './previsto-frota.js';

const esc = (s: unknown): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (v: number, d = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

export interface RedeTop { id: string; nome: string; vMax: number; desarmes: number; diasCriticos: number }

export interface DadosEnergyStudio {
  previsto: ResumoPrevistoFrota | null;
  usinasComPrevisto: number;
  calibracao: { alta: number; media: number; baixa: number; semCurva: number };
  alertasAbertos: number;
  rede: { comMedicao: number; criticas: number; desarmes7d: number; top: RedeTop[] };
}

const CLASSE: Record<string, string> = { muito_abaixo: 's-ru', abaixo: 's-at', sem_comunicacao: 's-cz', dia_fraco: 's-nb', normal: 's-ok', sem_previsto: 's-cz' };

export function renderEnergyStudioBody(d: DadosEnergyStudio): string {
  const p = d.previsto;
  const dataBr = p ? `${p.data.slice(8, 10)}/${p.data.slice(5, 7)}` : '—';
  const cards = `<div class="cards">
    <div class="c"><small>Frota ontem (${dataBr})</small><div class="v">${p?.frotaPct == null ? '—' : num(p.frotaPct, 1) + '%'}</div><div class="d">do que o sol permitia</div></div>
    <div class="c"><small>Usinas no Previsto</small><div class="v">${num(d.usinasComPrevisto)}</div><div class="d">${p ? `${p.porSituacao.muito_abaixo + p.porSituacao.abaixo} abaixo ontem` : 'calcula toda noite'}</div></div>
    <div class="c"><small>Telhados calibrados</small><div class="v">${num(d.calibracao.alta)}</div><div class="d">confiança alta · ${num(d.calibracao.media + d.calibracao.baixa)} em análise</div></div>
    <div class="c"><small>Alertas abertos</small><div class="v" style="color:${d.alertasAbertos ? '#dc2626' : '#16a34a'}">${num(d.alertasAbertos)}</div><div class="d">2 dias seguidos abaixo do previsto</div></div>
    <div class="c"><small>Rede (7 dias)</small><div class="v" style="color:${d.rede.criticas ? '#dc2626' : '#16a34a'}">${num(d.rede.criticas)}</div><div class="d">usinas com tensão fora da faixa · ${num(d.rede.desarmes7d)} desligamentos</div></div>
  </div>`;

  const ferramentas = [
    ['🛰️', 'Studio 3D', 'Projeto pelo voo do drone: telhado real, placas, sombra, inversores e relatório PDF.', '/dashboard/studio-3d'],
    ['☀️', 'Previsto × Real', 'Cada usina contra o sol que fez. Escolha a usina no monitoramento → botão "Previsto × Real".', '/dashboard/monitoramento'],
    ['📡', 'Radar da Rede', 'Mapa da tensão por bairro e ranking das piores usinas.', '/dashboard/rede/mapa'],
    ['⚡', 'Rede da usina + PDF', 'Tensão por fase, desligamentos por tensão e relatório para a distribuidora.', '/dashboard/rede/mapa'],
    ['📥', 'Importar geração', 'Usina sem integração: CSV do portal ou print do app (a IA lê).', '/dashboard/monitoramento'],
    ['🧭', 'Calibração automática', 'Descobre orientação e inclinação do telhado pela curva real, toda madrugada.', '/dashboard/monitoramento'],
    ['🖥️', 'Command Center', 'Previsto × Real da frota de ontem, com as piores primeiro.', '/dashboard/command-center'],
  ].map(([ic, t, dsc, href]) => `<a class="es-tool" href="${href}"><span class="es-ic">${ic}</span><b>${esc(t)}</b><span>${esc(dsc)}</span></a>`).join('');

  const piores = p
    ? p.linhas.filter((l) => l.situacao !== 'normal' && l.situacao !== 'dia_fraco').slice(0, 8)
    : [];
  const tabPrev = piores.length
    ? `<div class="tb"><table><tr><th>Usina</th><th class="n">Previsto</th><th class="n">Real</th><th class="n">Diferença</th><th>Situação</th></tr>
      ${piores.map((l) => `<tr><td><a href="/dashboard/monitoramento/${esc(l.id)}/previsto">${esc(l.apelido)}</a></td><td class="n">${num(l.previsto, 1)}</td><td class="n">${l.real == null ? '—' : num(l.real, 1)}</td><td class="n">${l.dif == null ? '—' : num(l.dif, 1) + '%'}</td><td><span class="st ${CLASSE[l.situacao]}">${ROTULO_SITUACAO[l.situacao]}</span></td></tr>`).join('')}</table></div>`
    : `<p class="nota">${p ? 'Todas as usinas geraram o previsto ontem. 👍' : 'O previsto é calculado toda noite (21h) — volte amanhã.'}</p>`;
  const tabRede = d.rede.top.length
    ? `<div class="tb"><table><tr><th>Usina</th><th class="n">Máx.</th><th class="n">Desligou</th><th class="n">Dias críticos</th></tr>
      ${d.rede.top.map((r) => `<tr><td><a href="/dashboard/monitoramento/${esc(r.id)}/rede">${esc(r.nome)}</a></td><td class="n">${num(r.vMax)} V</td><td class="n">${num(r.desarmes)}</td><td class="n">${num(r.diasCriticos)}</td></tr>`).join('')}</table></div>`
    : `<p class="nota">${d.rede.comMedicao ? 'Rede dentro da faixa em todas as usinas medidas. 👍' : 'Ainda sem medição de tensão (Sungrow, FoxESS, Solis, Hoymiles e medidor Shelly mandam).'}</p>`;

  return `${CSS_PREVISTO}<style>
  .es-tools{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;margin-bottom:14px}
  .es-tool{display:flex;flex-direction:column;gap:4px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px;text-decoration:none;color:#0f172a}
  .es-tool:hover{border-color:#0f766e;box-shadow:0 4px 14px rgba(15,118,110,.12)}
  .es-tool b{font-size:15px}.es-tool span:last-child{font-size:12.5px;color:#64748b}.es-ic{font-size:22px}
  </style><div class="pv pv-claro">
    <h1>☀️ Energy Studio</h1>
    <div class="sub">Cada usina comparada com o que o sol permitia, telhado descoberto pela curva, rede elétrica sob vigilância — num lugar só.</div>
    ${cards}
    <div class="es-tools">${ferramentas}</div>
    <div class="g2">
      <div class="box"><h2>Usinas que geraram menos do que deviam — ${dataBr}</h2>${tabPrev}</div>
      <div class="box"><h2>Rede: piores tensões nos últimos 7 dias</h2>${tabRede}
        <p class="nota"><a class="volta" href="/dashboard/rede/mapa">📡 Abrir o Radar da Rede</a></p></div>
    </div>
  </div>`;
}

export function renderEnergyStudioPage(body: string, user: DashUser | undefined): string {
  return renderLayout({ active: 'energy_studio', title: 'Energy Studio', body, user, largo: true, tailwind: false });
}
