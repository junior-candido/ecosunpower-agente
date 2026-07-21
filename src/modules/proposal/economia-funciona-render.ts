// src/modules/proposal/economia-funciona-render.ts
// Seção "Como sua economia funciona": responde a dúvida recorrente do cliente
// ("ainda fica caro depois do solar?") explicando, com os NÚMEROS dele, por que
// ainda vem uma conta (o Fio B sobre a energia COMPENSADA) e por que ela é
// pequena. Sistema superdimensionado mostra também a sobra em créditos.
// Duas tabelinhas: (1) simultaneidade — quanto mais usa de dia, menos paga;
// (2) Fio B sobe com os anos (Lei 14.300). Off-grid: "você sai da conta de luz".
// Os números vêm prontos do calculator (ProposalCalculations) — aqui só formata.
import type { ProposalCalculations } from './calculator.js';
import { fmtRs, fmtNum, fmtPct } from './format.js';
import { renderEconomiaAnimada } from './economia-animada-render.js';

const fmtKwh = (n: number) => `${fmtNum(Math.round(n), 0)} kWh`;
const fmtPctInt = (frac: number) => fmtPct(frac * 100, 0);

// Linha de tabela compacta (estilo inline, sem depender do CSS do template).
function celTd(s: string, strong = false): string {
  return `<td style="padding:10px 14px;border-top:1px solid #E2E8F0;${strong ? 'font-weight:700;color:#0F172A' : 'color:#334155'}">${s}</td>`;
}

function renderTabelaSimultaneidade(calc: ProposalCalculations): string {
  const linhas = calc.tabelaSimultaneidade.map(l => `<tr>
        ${celTd(fmtPctInt(l.autoconsumoPct))}
        ${celTd(fmtPctInt(l.injetadoPct))}
        ${celTd(`R$ ${fmtRs(l.fioB)}`, true)}
      </tr>`).join('');
  return `<div style="flex:1 1 320px;min-width:280px;background:#fff;border:1px solid #E2E8F0;border-radius:18px;overflow:hidden">
    <div style="padding:16px 18px;background:#F0FDF4;border-bottom:1px solid #DCFCE7">
      <div style="font-weight:800;color:#166534;font-size:15px">☀️ Quanto mais você usa de dia, menos paga</div>
      <div style="font-size:13px;color:#3F6212;margin-top:4px">É a <b>simultaneidade</b>: a energia que você consome na hora não paga Fio B.</div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <thead><tr style="background:#F8FAFC">
        <th style="text-align:left;padding:10px 14px;color:#64748B;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.05em">Usa na hora</th>
        <th style="text-align:left;padding:10px 14px;color:#64748B;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.05em">Vai pra rede</th>
        <th style="text-align:left;padding:10px 14px;color:#64748B;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.05em">Fio B/mês</th>
      </tr></thead>
      <tbody>${linhas}</tbody>
    </table>
  </div>`;
}

function renderTabelaFioBAnos(calc: ProposalCalculations): string {
  const linhas = calc.tabelaFioBAnos.map(l => `<tr>
        ${celTd(String(l.ano))}
        ${celTd(`Fio B ${fmtPctInt(l.percentualFioB)}`)}
        ${celTd(`R$ ${fmtRs(l.total)}`, true)}
      </tr>`).join('');
  return `<div style="flex:1 1 320px;min-width:280px;background:#fff;border:1px solid #E2E8F0;border-radius:18px;overflow:hidden">
    <div style="padding:16px 18px;background:#FFF7ED;border-bottom:1px solid #FED7AA">
      <div style="font-weight:800;color:#9A3412;font-size:15px">📅 O Fio B sobe com os anos</div>
      <div style="font-size:13px;color:#9A3412;margin-top:4px">Lei 14.300: a taxa sobre a energia que volta abatendo sua conta cresce até 100% em 2029. Sua conta acompanha — e ainda é pequena.</div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <thead><tr style="background:#F8FAFC">
        <th style="text-align:left;padding:10px 14px;color:#64748B;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.05em">Ano</th>
        <th style="text-align:left;padding:10px 14px;color:#64748B;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.05em">Taxa</th>
        <th style="text-align:left;padding:10px 14px;color:#64748B;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.05em">Conta/mês</th>
      </tr></thead>
      <tbody>${linhas}</tbody>
    </table>
  </div>`;
}

// Passo a passo com os números do cliente: geração → autoconsumo + injetado → Fio B.
function renderPassoAPasso(calc: ProposalCalculations): string {
  const d = calc.contaComDetalhada;
  const linhaConsumoRede = d.consumoRede > 0
    ? `<div style="display:flex;justify-content:space-between;padding:10px 0;border-top:1px dashed #E2E8F0">
        <span>⚡ Energia que a geração não cobriu (comprada da rede)</span>
        <strong style="color:#0F172A">R$ ${fmtRs(d.consumoRede)}</strong>
      </div>` : '';
  const linhaCip = d.cip > 0
    ? `<div style="display:flex;justify-content:space-between;padding:10px 0;border-top:1px dashed #E2E8F0">
        <span>💡 Iluminação pública (cobrança da prefeitura, todo mundo paga)</span>
        <strong style="color:#0F172A">R$ ${fmtRs(d.cip)}</strong>
      </div>` : '';
  return `<div style="background:#fff;border:1px solid #E2E8F0;border-radius:20px;padding:24px;margin-bottom:24px">
    <div style="font-size:14px;color:#334155;line-height:1.7">
      <div style="display:flex;justify-content:space-between;padding:10px 0">
        <span>🔆 Sua geração no mês</span>
        <strong style="color:#0F172A">${fmtKwh(calc.geracaoMensalKwh)}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;padding:10px 0;border-top:1px dashed #E2E8F0">
        <span style="color:#15803D">✅ Você usa na hora (de dia) — <b>autoconsumo, não paga nada</b></span>
        <strong style="color:#15803D">${fmtKwh(d.autoconsumoKwh)}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;padding:10px 0;border-top:1px dashed #E2E8F0">
        <span>🔁 Vai pra rede e volta abatendo sua conta — só sobre isto incide o <b>Fio B (${fmtPctInt(calc.percentualFioBInicial)} em ${calc.anoInicial})</b></span>
        <strong style="color:#0F172A">${fmtKwh(d.compensadaKwh)}</strong>
      </div>
      ${calc.creditosUsadosRemotoKwh > 0 ? `<div style="display:flex;justify-content:space-between;padding:10px 0;border-top:1px dashed #E2E8F0">
        <span style="color:#15803D">🏠 Abate a fatura da sua <b>outra unidade</b> — economia de <b>R$ ${fmtRs(calc.economiaRemotaMensal)}</b> lá, já com o Fio B descontado</span>
        <strong style="color:#15803D">${fmtKwh(calc.creditosUsadosRemotoKwh)}</strong>
      </div>` : ''}
      ${calc.creditosGuardadosKwh > 0 ? `<div style="display:flex;justify-content:space-between;padding:10px 0;border-top:1px dashed #E2E8F0">
        <span style="color:#0E7CB8">🏦 Sobra e fica guardada como <b>crédito</b> (vale 60 meses) — só paga Fio B quando você usar</span>
        <strong style="color:#0E7CB8">${fmtKwh(calc.creditosGuardadosKwh)}</strong>
      </div>` : ''}
      <div style="display:flex;justify-content:space-between;padding:10px 0;border-top:1px dashed #E2E8F0">
        <span>= Fio B ${calc.creditosUsadosRemotoKwh > 0 ? 'nesta casa' : 'no mês'}</span>
        <strong style="color:#0F172A">R$ ${fmtRs(d.fioB)}</strong>
      </div>
      ${linhaConsumoRede}
      ${linhaCip}
      <div style="display:flex;justify-content:space-between;padding:14px 0 4px;border-top:2px solid #0F172A;margin-top:6px">
        <span style="font-weight:800;color:#0F172A">Sua conta com solar</span>
        <strong style="color:#047857;font-size:20px">R$ ${fmtRs(calc.contaComSistemaMensal)}/mês</strong>
      </div>
      <div style="text-align:right;font-size:13px;color:#64748B;margin-top:4px">antes era R$ ${fmtRs(calc.contaSemSistemaMensal)}/mês</div>
    </div>
  </div>`;
}

function renderDicaCarregador(): string {
  return `<div style="background:linear-gradient(135deg,#EFF6FF,#DBEAFE);border:1px solid #BFDBFE;border-radius:16px;padding:18px 22px;margin-bottom:24px;font-size:14px;color:#1E3A8A;line-height:1.6">
    🚗 <b>Dica do carregador:</b> carregue o carro <b>de dia</b>, no sol. Assim a energia vira autoconsumo na hora — você injeta menos na rede, paga menos Fio B e é quase como abastecer de graça.
  </div>`;
}

export function renderEconomiaFuncionaSection(
  calc: ProposalCalculations,
  opts: { temCarregador?: boolean } = {},
): string {
  // Off-grid: não há rede, então não há Fio B nem conta. Mensagem direta.
  if (calc.tipoSistema === 'off_grid') {
    return `<section class="economia-section" style="padding:64px 0;background:#F8FAFC">
  <div class="container">
    <span class="section-tag">Como sua economia funciona</span>
    <h2 class="section-title">Você sai da conta de luz</h2>
    <p class="section-subtitle">Sistema isolado (off-grid): sua energia não passa pela concessionária.</p>
    ${renderEconomiaAnimada(calc, opts)}
    <div style="background:#fff;border:1px solid #E2E8F0;border-radius:20px;padding:28px;max-width:640px;margin:0 auto;text-align:center;font-size:15px;color:#334155;line-height:1.7">
      Sem rede, <b>não há Fio B, não há iluminação pública e não há fatura mensal</b>.
      A economia é a conta inteira que você deixa de pagar — hoje
      <b style="color:#047857">R$ ${fmtRs(calc.contaSemSistemaMensal)}/mês</b> que ficam com você.
    </div>
  </div>
</section>`;
  }

  return `<section class="economia-section" style="padding:64px 0;background:#F8FAFC">
  <div class="container">
    <span class="section-tag">Como sua economia funciona</span>
    <h2 class="section-title">Por que ainda vem uma conta — e por que ela é pequena</h2>
    <p class="section-subtitle">Depois do solar a conta cai muito, mas não zera: sobre a energia que você manda pra rede incide o <b>Fio B</b> (Lei 14.300). Veja com os seus números.</p>
    ${renderEconomiaAnimada(calc, opts)}
    ${renderPassoAPasso(calc)}
    ${opts.temCarregador ? renderDicaCarregador() : ''}
    <div style="display:flex;flex-wrap:wrap;gap:20px;margin-top:8px">
      ${renderTabelaSimultaneidade(calc)}
      ${renderTabelaFioBAnos(calc)}
    </div>
    <p style="font-size:13px;color:#64748B;margin-top:18px;line-height:1.6">
      As tabelas são ilustrativas, com os parâmetros da sua proposta. A simultaneidade
      (quanto você usa de dia) pode ser ajustada conforme o seu perfil de consumo.
    </p>
  </div>
</section>`;
}
