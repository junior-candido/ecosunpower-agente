// src/modules/monitoring/relatorio/template.ts
// Relatório branded. Reusa o logo oficial base64 do Proposta v2 e a paleta
// de cores (mesmos tokens --primary/--accent). Cliente-facing: SEMPRE
// "Responsável Técnico CREA/CFT", NUNCA "engenheiro".
import { LOGO_ECOSUNPOWER_BRANCO_BASE64 } from '../../proposal/assets/logo-base64.js';
import type { RelatorioData, ModoRelatorio } from './dados.js';
// [ECOSOF] empresa() lida DENTRO das funções de render (runtime).
import { empresa } from '../../empresa-config.js';

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function brl(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * CTA proeminente pra cliente solicitar visita técnica pós-venda.
 * NÃO mostrar valor aqui — Eva conversa primeiro, qualifica, e só fala
 * R$ 350 se cliente perguntar ou na hora de fechar agendamento.
 * Tag `#visita-tecnica` na mensagem pra Eva detectar contexto pós-venda
 * (diferenciado de visita de prospect que é grátis).
 */
function renderCtaVisita(apelido: string): string {
  const evaPhone = empresa().telefoneAtendente ?? '';
  const msg = `Olá! Acabei de ver o relatório da minha usina (${apelido}) e gostaria de agendar uma visita técnica pra análise do sistema. #visita-tecnica`;
  const wa = `https://wa.me/${evaPhone}?text=${encodeURIComponent(msg)}`;
  return `<div style="margin:16px 24px;padding:18px;background:linear-gradient(135deg,#FFC72C 0%,#F5A623 100%);border-radius:14px;text-align:center">
    <div style="font-size:13px;color:#5a3e00;font-weight:600;letter-spacing:.02em">QUER UM DIAGNÓSTICO PRESENCIAL?</div>
    <a href="${wa}" style="display:inline-block;margin-top:10px;padding:13px 22px;background:#0F172A;color:#FFC72C;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">
      🔧 Agendar visita técnica
    </a>
    <div style="font-size:12px;color:#5a3e00;margin-top:8px;opacity:.85">Responsável Técnico (CFT/CREA) vai ao local · análise + medições + laudo</div>
  </div>`;
}

// [Degustação Sabion 27/07] Relatório de usina de TENANT sai NEUTRO com a
// marca DELE: nome no cabeçalho, sem logo (até o B1c ter upload), sem CTA da
// Eva (Eva é da casa) e sem CNPJ/rodapé da EcoSun. Sem `marca` = EcoSun.
export interface MarcaRelatorio {
  nome: string;
  logoBase64: string | null; // null = sem logo (neutro); B1c pluga a do tenant
}

// [ECOSOF] logoBase64 opcional: caller (PDF/rota pública) resolve via
// obterLogoBase64 (Storage com fallback); default = logo EcoSun embutida.
export function renderRelatorioHtml(
  data: RelatorioData,
  modo: ModoRelatorio,
  logoBase64: string = LOGO_ECOSUNPOWER_BRANCO_BASE64,
  marca?: MarcaRelatorio,
): string {
  const nomeMarca = marca?.nome ?? empresa().nomeFantasia;
  const logoSrc = marca ? marca.logoBase64 : logoBase64;
  const logoHtml = logoSrc ? `<img class="logo" src="${logoSrc}" alt="${esc(nomeMarca)}">` : '';
  const C = `--primary-600:#0E7CB8;--primary-700:#0B5A87;--accent-500:#FFC72C;--dark:#0F172A;--muted:#64748B`;
  const local = [data.cidade, data.uf].filter(Boolean).join('/') || '—';

  const saudacao = modo === 'boas_vindas'
    ? `<div style="background:#E6F7FD;border-radius:12px;padding:18px;margin:16px 0;color:#0B5A87"><b>Bem-vindo à geração solar!</b> Seu sistema está ativo. Acompanhe aqui a energia que ele produz.</div>`
    : '';

  const semDados = data.semDados
    ? `<div style="background:#FFF7E6;border-radius:12px;padding:18px;margin:16px 0;color:#7a5b00">Sistema recém-instalado — os dados em breve quando a geração iniciar.</div>`
    : '';

  const diag = (modo === 'manutencao' && !data.semDados)
    ? `<div style="border:1px solid #E2E8F0;border-radius:12px;padding:18px;margin:16px 0">
         <b>Desempenho vs esperado</b>
         <p style="color:var(--muted);font-size:14px;margin:6px 0 0">
           ${data.sinal.gravidade
             ? `Identificamos que a geração está abaixo do previsto. Recomendamos uma revisão/limpeza preventiva — entre em contato para agendarmos.`
             : `Seu sistema está gerando dentro do previsto. Tudo certo!`}
         </p>
       </div>`
    : '';

  const linhasMensais = (data.serieMensal.length
    ? data.serieMensal.map((m) => `<tr><td style="padding:6px 10px">${esc(m.mes)}</td><td style="padding:6px 10px;text-align:right">${m.kwh.toFixed(0)} kWh</td></tr>`).join('')
    : `<tr><td colspan="2" style="padding:10px;color:var(--muted)">—</td></tr>`);

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Relatório da Usina · ${esc(data.apelido)} · ${esc(nomeMarca)}</title>
<style>:root{${C}} body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#F8FAFC;color:var(--dark)}
.wrap{max-width:760px;margin:0 auto;background:#fff}
.hero{background:linear-gradient(135deg,#1FB8E8 0%,#0E7CB8 60%,#0F172A 100%);color:#fff;padding:28px 24px;position:relative}
.kpis{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;padding:20px 24px}
.kpi{background:#F8FAFC;border-radius:12px;padding:16px}.kpi b{font-size:24px;color:var(--primary-700)}
table{width:100%;border-collapse:collapse;font-size:14px}
.foot{padding:20px 24px;color:var(--muted);font-size:12px;border-top:1px solid #E2E8F0}
img.logo{height:34px;width:auto;background:#fff;border-radius:8px;padding:5px}</style></head>
<body><div class="wrap">
  <div class="hero">
    ${logoHtml}
    <div style="font-weight:700;letter-spacing:.04em;margin-top:10px">${esc(nomeMarca.toUpperCase())} · RELATÓRIO DA USINA</div>
    <div style="font-size:20px;font-weight:700;margin-top:6px">${esc(data.apelido)}</div>
    <div style="opacity:.85;font-size:13px">${esc(local)} · ${esc(data.marcaInversor)} · ${data.potenciaKwp ?? '—'} kWp · idade ${esc(data.garantia.idadeTexto)}</div>
  </div>
  ${saudacao}${semDados}
  ${marca ? '' : renderCtaVisita(data.apelido)}
  <div class="kpis">
    <div class="kpi"><div>Geração no mês</div><b>${data.kpis.mesKwh.toFixed(0)} kWh</b></div>
    <div class="kpi"><div>Geração no ano</div><b>${data.kpis.anoKwh.toFixed(0)} kWh</b></div>
    <div class="kpi"><div>Geração total</div><b>${data.kpis.totalKwh.toFixed(0)} kWh</b></div>
    <div class="kpi"><div>economia estimada</div><b>${brl(data.economiaEstimadaReais)}</b><div style="font-size:11px;color:var(--muted)">base R$ 1,00/kWh</div></div>
  </div>
  ${diag}
  <div style="padding:0 24px 8px"><b>Histórico mês a mês</b></div>
  <div style="padding:0 24px 16px"><table><tbody>${linhasMensais}</tbody></table></div>
  <div style="padding:0 24px 16px;font-size:13px;color:var(--muted)">
    <b>Garantias:</b> Instalação/mão de obra ${esc(nomeMarca)}: ${data.garantia.ecosun.status === 'vigente' ? `vigente (${(data.garantia.ecosun as any).mesesRestantes} meses restantes)` : data.garantia.ecosun.status === 'encerrada' ? `encerrada` : 'a confirmar'}.
    Inversor (fabricante): ${esc(data.garantia.fabricanteInversor)}. Painel: ${esc(data.garantia.fabricantePainel)}.
  </div>
  ${marca ? `<div class="foot">
    ${esc(marca.nome)} · Relatório gerado pela plataforma de monitoramento.
  </div>` : `<div class="foot">
    ${esc(empresa().nomeFantasia)} Energia Solar · CNPJ ${esc(empresa().cnpj)} · ${esc(`${empresa().cidade}-${empresa().uf}`)}<br>
    Projeto e instalação sob responsabilidade do nosso <b>Responsável Técnico (ART CREA / TRT CFT)</b>. Conforme ABNT NBR 5410, NBR 16690, NBR 16149/16150 e NR-10.
  </div>`}
</div></body></html>`;
}
