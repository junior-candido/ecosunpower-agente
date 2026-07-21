// src/modules/proposal/service-render.ts
// Tipo de item de serviço (texto livre do Junior) + renderizações:
//  - renderServicosAdicionaisSection: seção que soma serviços numa proposta solar.
//  - renderServiceOnlyHTML: proposta só-serviço elegante (sem solar, sem gráfico/payback).

import { fmtRs, escapeHtml } from './format.js';
import { LOGO_ECOSUNPOWER_BRANCO_BASE64, LOGO_ECOSUNPOWER_DARK_BASE64 } from './assets/logo-base64.js';
// [ECOSOF] empresa() lida em runtime (alt da logo = nome fantasia).
import { empresa } from '../empresa-config.js';
import { logoMeioPagamento } from './payment-logos.js';

export interface ServicoItem {
  titulo: string;
  descricao: string;   // texto livre; replicado fiel (apenas escapado pra HTML)
  valorRs: number;
  imagemUrl?: string;  // usada só no layout só-serviço (Task 5)
  // true  = serviço JÁ está embutido no valor do solar (mostra mas NÃO soma de novo).
  // false/ausente = serviço EXTRA que soma ao total. A Eva classifica a intenção;
  // a conta (somar ou não) é sempre feita aqui, nunca pela Eva de cabeça.
  jaIncluso?: boolean;
}

// Soma SÓ os serviços "a mais" — os "já incluso" já estão dentro do valor do
// solar, então não entram na conta. Fonte única dessa regra (usada no render da
// proposta, no resumo do Junior e no cálculo do pagamento padrão).
export function somaServicosExtras(servicos: ServicoItem[] | undefined): number {
  return (servicos ?? []).reduce(
    (acc, s) => acc + (s && !s.jaIncluso ? (Number(s.valorRs) || 0) : 0), 0);
}

// Renderiza a seção "Serviços adicionais" pra uma proposta que TEM solar.
// Lista cada serviço (título, descrição, preço). Serviços "a mais" somam ao
// valor do solar; serviços "já incluso" aparecem com selo e NÃO somam (já estão
// dentro do valor do solar). Vazio => string vazia (seção some).
export function renderServicosAdicionaisSection(servicos: ServicoItem[], valorSolarRs: number, modoComparacao = false): string {
  if (!servicos || servicos.length === 0) return '';
  const validos = servicos.filter((s): s is ServicoItem => !!s && typeof s.titulo === 'string');
  if (validos.length === 0) return '';
  // Só os serviços "a mais" entram na soma; os "já incluso" já estão no solar.
  const totalGeral = (Number(valorSolarRs) || 0) + somaServicosExtras(validos);
  const temExtras = validos.some(s => !s.jaIncluso);

  const linhas = validos.map(s => {
    const preco = `R$ ${fmtRs(Number(s.valorRs) || 0, 0)}`;
    const colunaPreco = s.jaIncluso
      ? `<div style="text-align:right;white-space:nowrap">
        <div style="font-family:'Space Grotesk',sans-serif;font-size:20px;font-weight:700;color:var(--dark)">${preco}</div>
        <div style="display:inline-block;margin-top:6px;font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#0E7CB8;background:#E6F4FB;border-radius:100px;padding:4px 10px">✓ Já incluso no valor</div>
      </div>`
      : `<div style="font-family:'Space Grotesk',sans-serif;font-size:20px;font-weight:700;color:var(--primary-600);white-space:nowrap">${preco}</div>`;
    return `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding:24px;border:1px solid var(--border);border-radius:16px;background:#fff;margin-bottom:16px">
      <div style="flex:1">
        <div style="font-family:'Space Grotesk',sans-serif;font-size:18px;font-weight:700;color:var(--dark);margin-bottom:6px">${escapeHtml(s.titulo)}</div>
        <div style="font-size:14px;color:var(--muted);line-height:1.55;white-space:pre-line">${escapeHtml(s.descricao)}</div>
      </div>
      ${colunaPreco}
    </div>`;
  }).join('');

  // Rótulo do total: só fala "solar + serviços" quando há serviço que soma.
  const rotuloTotal = temExtras ? 'Total da proposta (solar + serviços)' : 'Total da proposta';

  // Na COMPARAÇÃO não tem "o" valor do solar (são duas opções) — mostra a lista
  // e a soma SÓ dos serviços, avisando que soma à opção escolhida.
  const blocoTotal = modoComparacao
    ? (temExtras ? `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:24px;padding:28px;border-radius:16px;background:linear-gradient(135deg,var(--primary-600) 0%,var(--primary-800) 100%);color:#fff;margin-top:8px">
      <div style="font-family:'Space Grotesk',sans-serif;font-size:16px;font-weight:600;letter-spacing:0.02em">Serviços (somam à opção escolhida)</div>
      <div style="font-family:'Space Grotesk',sans-serif;font-size:32px;font-weight:700">+ R$ ${fmtRs(somaServicosExtras(validos), 0)}</div>
    </div>` : '')
    : `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:24px;padding:28px;border-radius:16px;background:linear-gradient(135deg,var(--primary-600) 0%,var(--primary-800) 100%);color:#fff;margin-top:8px">
      <div style="font-family:'Space Grotesk',sans-serif;font-size:16px;font-weight:600;letter-spacing:0.02em">${rotuloTotal}</div>
      <div style="font-family:'Space Grotesk',sans-serif;font-size:32px;font-weight:700">R$ ${fmtRs(totalGeral, 0)}</div>
    </div>`;

  return `
<section style="background:var(--surface-alt);padding:80px 0">
  <div class="container">
    <span class="section-tag">Serviços adicionais</span>
    <h2 class="section-title">Além do sistema solar</h2>
    <p class="section-subtitle">Serviços de engenharia elétrica inclusos nesta proposta.</p>
    ${linhas}
    ${blocoTotal}
  </div>
</section>`;
}

export interface ServiceOnlyData {
  numeroProposta: string;
  dataProposta: string;
  validadeDias: number;
  nomeCliente: string;
  servicos: ServicoItem[];
  // Total da proposta. Quando o serviço é orçado por VALOR ÚNICO (sem preço por
  // item), vem daqui. Se ausente, cai na soma dos itens (compatível com o legado).
  totalRs?: number;
  formasPagamento: Array<{ tipo: string; titulo: string; valorPrincipal: string; valorSecundario: string; recomendado?: boolean; bullets: string[]; meioPagamento?: 'pix' | 'cartao' | 'financiamento' }>;
  empresa: { nome: string; cnpj: string; cidade: string; telefone: string; site: string };
}

// Proposta SÓ-SERVIÇO (sem solar): elegante, com logo + imagem do serviço +
// descrição livre + preço + formas de pagamento + confiança. Sem gráfico/payback.
// NOTA: hero e rodapé agora usam a logo DARK fixa (LOGO_ECOSUNPOWER_DARK_BASE64,
// letra prateada p/ fundo escuro). O param `logoBase64` é mantido só por compat. de
// assinatura (call sites passam posicionalmente) — hoje fica sem uso aqui.
// [ECOSOF] TODO: quando houver logo "dark" por tenant, usar `logoBase64` no lugar
// da constante fixa no hero/rodapé (mesma pendência do template principal).
export function renderServiceOnlyHTML(data: ServiceOnlyData, logoBase64: string = LOGO_ECOSUNPOWER_BRANCO_BASE64): string {
  if (!data.nomeCliente || !data.servicos?.length) {
    throw new Error('renderServiceOnlyHTML: precisa de nomeCliente e ao menos 1 serviço');
  }
  // Proposta SÓ-SERVIÇO conta TODO serviço como linha real: aqui não há valor de
  // solar pra um serviço estar "já incluso dentro", então `jaIncluso` é ignorado
  // de propósito (diferente de renderServicosAdicionaisSection). Ao ligar a Task 5,
  // decidir explicitamente se algum caso de bundle precisa de somaServicosExtras.
  // Total: o valor único (totalRs) quando informado; senão a soma dos itens (legado).
  const somaItens = data.servicos.reduce((a, s) => a + (Number(s.valorRs) || 0), 0);
  const total = (typeof data.totalRs === 'number' && data.totalRs > 0) ? data.totalRs : somaItens;
  const tituloPrincipal = data.servicos.length === 1 ? data.servicos[0].titulo : 'Serviços de engenharia elétrica';

  const blocosServico = data.servicos.map(s => `
    <section style="padding:48px 24px;max-width:900px;margin:0 auto">
      <h2 style="font-family:'Space Grotesk',sans-serif;font-size:26px;color:#0F172A;margin-bottom:16px">${escapeHtml(s.titulo)}</h2>
      ${s.imagemUrl ? `<img src="${escapeHtml(s.imagemUrl)}" alt="${escapeHtml(s.titulo)}" style="width:100%;border-radius:16px;margin-bottom:20px;display:block">` : ''}
      <div style="font-size:16px;color:#334155;line-height:1.7;white-space:pre-line">${escapeHtml(s.descricao)}</div>
      ${Number(s.valorRs) > 0 ? `<div style="margin-top:20px;font-family:'Space Grotesk',sans-serif;font-size:22px;font-weight:700;color:#0E7CB8">R$ ${fmtRs(s.valorRs, 0)}</div>` : ''}
    </section>`).join('');

  const formasPagamento = data.formasPagamento.map(p => `
    <div style="border:1px solid #E2E8F0;border-radius:16px;padding:24px;background:#fff${p.recomendado ? ';border:2px solid #FFC72C' : ''}">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#0E7CB8;margin-bottom:8px">${escapeHtml(p.tipo)}</div>
      <div style="font-family:'Space Grotesk',sans-serif;font-size:18px;font-weight:700;margin-bottom:8px">${escapeHtml(p.titulo)}</div>
      <div style="font-family:'Space Grotesk',sans-serif;font-size:26px;font-weight:700;color:#0E7CB8">${escapeHtml(p.valorPrincipal)}</div>
      <div style="font-size:13px;color:#64748B;margin-bottom:12px">${escapeHtml(p.valorSecundario)}</div>
      <ul style="list-style:none;padding:0;margin:0;font-size:13px;color:#64748B">${p.bullets.map(b => `<li style="padding:4px 0">✓ ${escapeHtml(b)}</li>`).join('')}</ul>
      ${logoMeioPagamento(p.meioPagamento)}
    </div>`).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Proposta EcoSunPower — ${escapeHtml(data.nomeCliente)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',system-ui,sans-serif;color:#0F172A;background:#F8FAFC;line-height:1.6}
img{max-width:100%}
/* logo de marca — espelha o template principal (manter os dois em sincronia) */
.brand-logo{display:block;height:64px;width:auto;filter:drop-shadow(0 0 9px rgba(102,207,243,.75)) drop-shadow(0 0 20px rgba(31,184,232,.5))}
.brand-logo.foot{height:40px;filter:none;margin:0 auto 10px}
.svc-nav{display:flex;justify-content:space-between;align-items:center;margin-bottom:40px;gap:16px}
@media(max-width:768px){
  /* halo do desktop é fixo em px; na logo menor do celular ele engolia as letras (apagava o E) */
  .brand-logo{height:54px;filter:drop-shadow(0 0 5px rgba(102,207,243,.45)) drop-shadow(0 0 10px rgba(31,184,232,.3))}
  .svc-nav{flex-direction:column;align-items:flex-start}
  .svc-nav .meta{text-align:left}
}
@media print{.no-print{display:none}}
</style>
</head>
<body>
<header style="background:linear-gradient(160deg,#0B2A45 0%,#0B5A87 55%,#0E7CB8 100%);color:#fff;padding:48px 24px">
  <div style="max-width:900px;margin:0 auto">
    <div class="svc-nav">
      <img class="brand-logo" src="${LOGO_ECOSUNPOWER_DARK_BASE64}" alt="${escapeHtml(empresa().nomeFantasia)}">
      <div class="meta" style="font-size:12px;opacity:0.85;text-align:right">Proposta #${escapeHtml(data.numeroProposta)}<br>${escapeHtml(data.dataProposta)} · Válida ${data.validadeDias} dias</div>
    </div>
    <div style="display:inline-block;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);padding:6px 16px;border-radius:100px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:16px">⚡ Proposta de Serviço</div>
    <h1 style="font-family:'Space Grotesk',sans-serif;font-size:40px;line-height:1.1;font-weight:700">${escapeHtml(tituloPrincipal)}<br><span style="color:#FFC72C">para ${escapeHtml(data.nomeCliente)}</span></h1>
  </div>
</header>

${blocosServico}

<section style="background:#fff;padding:48px 24px">
  <div style="max-width:900px;margin:0 auto;display:flex;justify-content:space-between;align-items:center;gap:24px;padding:28px;border-radius:16px;background:linear-gradient(135deg,#0E7CB8 0%,#073E5C 100%);color:#fff">
    <div style="font-family:'Space Grotesk',sans-serif;font-size:16px;font-weight:600">Total da proposta</div>
    <div style="font-family:'Space Grotesk',sans-serif;font-size:32px;font-weight:700">R$ ${fmtRs(total, 0)}</div>
  </div>
</section>

<section style="padding:48px 24px;max-width:900px;margin:0 auto">
  <h2 style="font-family:'Space Grotesk',sans-serif;font-size:22px;margin-bottom:24px">Como você prefere pagar?</h2>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px">${formasPagamento}</div>
</section>

<section style="padding:48px 24px;max-width:900px;margin:0 auto">
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px">
    <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:24px">
      <div style="font-size:24px;margin-bottom:8px">📋</div>
      <h3 style="font-size:17px;margin-bottom:8px">ART/TRT + Normas ABNT</h3>
      <p style="font-size:14px;color:#64748B">Anotação de Responsabilidade Técnica assinada pelo nosso Responsável Técnico CREA/CFT. Serviço dentro das normas, sem improviso.</p>
    </div>
    <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:24px">
      <div style="font-size:24px;margin-bottom:8px">🛡️</div>
      <h3 style="font-size:17px;margin-bottom:8px">Garantia EcoSunPower 12 meses</h3>
      <p style="font-size:14px;color:#64748B">Cobrimos a mão de obra e a execução do serviço por 12 meses. Acionamento direto pelo WhatsApp.</p>
    </div>
    <div style="background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:24px">
      <div style="font-size:24px;margin-bottom:8px">🤝</div>
      <h3 style="font-size:17px;margin-bottom:8px">Responsável Técnico que atende direto</h3>
      <p style="font-size:14px;color:#64748B">Você fala direto com o Responsável Técnico CREA/CFT da EcoSunPower, do orçamento ao pós-serviço.</p>
    </div>
  </div>
</section>

<section class="no-print" style="background:linear-gradient(135deg,#0F172A 0%,#073E5C 100%);color:#fff;text-align:center;padding:64px 24px">
  <h2 style="font-family:'Space Grotesk',sans-serif;font-size:32px;margin-bottom:16px">Pronto pra começar?</h2>
  <a href="https://wa.me/55${data.empresa.telefone.replace(/\D/g, '')}?text=${encodeURIComponent('Aceito a proposta ' + data.numeroProposta)}" style="display:inline-block;background:#FFC72C;color:#0F172A;padding:16px 32px;border-radius:100px;font-weight:700;text-decoration:none">✓ Aceitar proposta</a>
</section>

<footer style="background:#0F172A;color:rgba(255,255,255,0.7);padding:32px 24px;text-align:center;font-size:13px">
  <img class="brand-logo foot" src="${LOGO_ECOSUNPOWER_DARK_BASE64}" alt="${escapeHtml(data.empresa.nome)}">
  <strong style="color:#fff">${escapeHtml(data.empresa.nome)}</strong><br>
  CNPJ ${escapeHtml(data.empresa.cnpj)} · ${escapeHtml(data.empresa.cidade)} · ${escapeHtml(data.empresa.telefone)}<br>
  <span style="opacity:0.6;font-size:11px">Proposta #${escapeHtml(data.numeroProposta)} · ${escapeHtml(data.empresa.site)}</span>
</footer>
</body>
</html>`;
}
