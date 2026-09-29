// src/modules/dashboard/minha-assinatura-views.ts
// Fatia 4 — "Minha assinatura": a tela do ASSINANTE (tenant). O Thiago vê a
// situação da mensalidade dele, o uso do plano (87/110 usinas), paga a
// renovação e cadastra o zap (com código) pra receber os avisos.
// Renovação do miolo — R19 (28/09/2026): mesmos 2 formulários do zap
// (zap/solicitar, zap/confirmar); situação em pílula, uso em barra, "Pagar
// agora" é a ação dourada. Sem Tailwind, tema escuro, sem marca da casa.
// Cobrança recorrente (28/09/2026): + seção "Faturas" (aberta com botão Pagar,
// pagas, próxima). Só as faturas em que a empresa da SESSÃO é a assinante —
// o router busca por company_id da sessão, nunca por id da URL.
import { escapeHtml } from './views.js';
import type { DashUser } from './permissions.js';
import { situacaoDaAssinatura } from './assinaturas-store.js';
import type { AssinaturaRow } from './assinaturas-store.js';
import { cabecalhoPagina, cartaoSecao, pilulaStatus, botao, barra, estadoVazio, tabela, celulaDupla, aviso as avisoCc, type Tom } from './ui/componentes.js';
import { SEM_DADO } from './ui/html.js';
import { paginaConfiguracoes } from './configuracoes-casca.js';
import type { FaturaRow } from '../cobranca-recorrente/faturas-repo.js';
import {
  situacaoDaFatura, situacaoDaAssinatura as situacaoPorFatura, proximoVencimento, rotuloCompetencia,
  competenciaDe, reais as reaisBr, dataBr as dataBrIso, DIAS_ANTES,
} from '../cobranca-recorrente/ciclo.js';

const reais = (c: number) => (c / 100).toFixed(2).replace('.', ',');
const dataBr = (iso: string) => iso.split('-').reverse().join('/');

const CSS_ASSINATURA = `
.cc-as{max-width:720px}
.cc-as-plano{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
.cc-as-plano strong{display:block;font-size:17px;color:var(--cc-text)}
.cc-as-plano small{display:block;margin-top:3px;font-size:13px;color:var(--cc-muted)}
.cc-as-plano small b{font-family:var(--cc-f-num);color:var(--cc-text-2)}
.cc-as-uso{margin-top:16px}
.cc-as-uso-l{display:flex;justify-content:space-between;gap:8px;font-size:13px;color:var(--cc-muted);margin-bottom:6px}
.cc-as-uso-l b{font-family:var(--cc-f-num);color:var(--cc-text)}
.cc-as-alerta{margin:6px 0 0;font-size:12.5px}
.cc-as-alerta-crit{color:var(--cc-crit)} .cc-as-alerta-warn{color:var(--cc-warn)}
.cc-as-pagar{margin-top:18px}
.cc-as .cc-aviso{margin:14px 0 0}
.cc-as-zap{display:flex;flex-direction:column;gap:12px}
.cc-as-linha{display:flex;gap:8px;align-items:center}
.cc-as-linha input{flex:1;min-width:0}
.cc-as-ok{margin:0;font-size:13.5px;color:var(--cc-ok)}
.cc-as-fat .cc-btn{white-space:nowrap}
.cc-as-prox{margin-top:12px;padding:10px 12px;border:1px dashed var(--cc-line-2);border-radius:10px;font-size:13px;color:var(--cc-text-2)}
@media (max-width:760px){.cc-as-linha{flex-direction:column;align-items:stretch}.cc-as-linha .cc-btn{justify-content:center}.cc-as-pagar .cc-btn{width:100%;justify-content:center}}
`;

const SITUACAO: Record<string, { tom: Tom; texto: string }> = {
  ativa: { tom: 'normal', texto: 'ativa' },
  vencendo: { tom: 'atencao', texto: 'vence em breve' },
  vencida: { tom: 'critico', texto: 'vencida' },
  travada: { tom: 'critico', texto: 'suspensa' },
  cancelada: { tom: 'sem_dado', texto: 'cancelada' },
};

export function renderMinhaAssinaturaPage(
  a: AssinaturaRow | null,
  hoje: string,
  uso: number | null,
  linkPagar: string | null,
  user: DashUser | undefined,
  aviso?: { tipo: 'ok' | 'erro'; texto: string },
  /** Faturas da empresa da sessão (cobrança recorrente). undefined = tela antiga (sem a seção). */
  faturas?: FaturaRow[],
): string {
  const avisoHtml = aviso ? avisoCc({ tom: aviso.tipo, texto: aviso.texto }) : '';

  let corpo: string;
  if (!a) {
    corpo = `${avisoHtml}${cartaoSecao({ titulo: 'Plano', corpoHtml: estadoVazio({ tipo: 'sem_dado', titulo: 'Nenhuma assinatura encontrada pra sua empresa.', texto: 'Se isso parecer errado, fale com o suporte.', icone: 'receipt' }) })}`;
  } else {
    // Com faturas: a situação sai da fatura aberta mais antiga (a mesma pílula da casa).
    const ciclo = { status: a.status, inicioEm: a.inicioEm ?? null, diaVencimento: a.diaVencimento ?? null };
    const sitNova = faturas && a.diaVencimento ? situacaoPorFatura(ciclo, faturas, hoje) : null;
    const sit = situacaoDaAssinatura({ status: a.status, venceEm: a.venceEm }, hoje);
    const s = sitNova ? { tom: sitNova.tom, texto: sitNova.chave === 'suspensa' ? 'suspensa' : paraCliente(sitNova.texto) } : (SITUACAO[sit] ?? { tom: 'sem_dado' as Tom, texto: sit });
    const venceMostrado = faturas && a.diaVencimento ? (proximoVencimento(ciclo, faturas, hoje) ?? a.venceEm) : a.venceEm;

    const suspensaHtml = sit === 'travada'
      ? avisoCc({ tom: 'erro', texto: 'Sua assinatura está suspensa por falta de pagamento. Assim que o pagamento cair, tudo volta sozinho em instantes.' })
      : '';

    let usoHtml: string;
    if (a.limite !== null && uso !== null) {
      const pct = Math.min(100, Math.round((uso / a.limite) * 100));
      const cheio = uso >= a.limite;
      usoHtml = `<div class="cc-as-uso">
        <div class="cc-as-uso-l"><span>Uso do plano</span><span><b>${uso}</b> de <b>${a.limite}</b> usinas</span></div>
        ${barra(pct, cheio ? 'crit' : pct >= 90 ? 'warn' : 'ok')}
        ${cheio ? '<p class="cc-as-alerta cc-as-alerta-crit">Limite do plano atingido — fale com o suporte pra ampliar (liberamos na hora).</p>' : pct >= 90 ? '<p class="cc-as-alerta cc-as-alerta-warn">Chegando perto do limite do plano.</p>' : ''}
      </div>`;
    } else {
      usoHtml = `<div class="cc-as-uso"><div class="cc-as-uso-l"><span>Uso do plano</span><span>${SEM_DADO}</span></div></div>`;
    }

    const pagarHtml = linkPagar
      ? `<div class="cc-as-pagar">${botao({ rotulo: 'Pagar agora (Pix ou cartão de crédito)', href: linkPagar, tom: 'ouro', icone: 'wallet', attrs: { target: '_blank', rel: 'noopener noreferrer' } })}</div>`
      : '';

    const zapHtml = a.zapConfirmado
      ? `<p class="cc-as-ok">WhatsApp confirmado${a.telefone ? `: ${escapeHtml(a.telefone)}` : ''} — os avisos da assinatura chegam por lá.</p>`
      : `<div class="cc-as-zap">
          <p class="cc-cf-nota">Cadastre seu WhatsApp pra receber os avisos de vencimento por lá também (hoje vão só por e-mail).</p>
          <form method="post" action="/dashboard/minha-assinatura/zap/solicitar" class="cc-form cc-as-linha">
            <input name="telefone" placeholder="5521999998888" inputmode="tel" aria-label="Seu WhatsApp" value="${escapeHtml(a.telefone ?? '')}">
            <button type="submit" class="cc-btn">Receber código</button>
          </form>
          <form method="post" action="/dashboard/minha-assinatura/zap/confirmar" class="cc-form cc-as-linha">
            <input name="codigo" placeholder="Código de 6 dígitos" inputmode="numeric" maxlength="6" aria-label="Código recebido">
            <button type="submit" class="cc-btn">Confirmar</button>
          </form>
        </div>`;

    corpo = `${avisoHtml}
${cartaoSecao({ titulo: 'Plano', corpoHtml: `
  <div class="cc-as-plano">
    <div><strong>${escapeHtml(a.produtoNome)}</strong><small><b>R$ ${reais(a.valorCentavos)}</b>/mês · ${venceMostrado < hoje ? 'venceu em' : 'vence em'} <b>${dataBr(venceMostrado)}</b></small></div>
    ${pilulaStatus(s.tom, s.texto)}
  </div>
  ${suspensaHtml}
  ${usoHtml}
  ${pagarHtml}` })}
${faturas ? cartaoSecao({ titulo: 'Faturas', dica: 'Pix ou cartão de crédito, pelo link seguro', corpoHtml: secaoFaturas(a, faturas, hoje) }) : ''}
${cartaoSecao({ titulo: 'Avisos no WhatsApp', corpoHtml: zapHtml })}`;
  }

  return paginaConfiguracoes({
    active: 'minha_assinatura', secao: 'minha_assinatura', title: 'Minha assinatura', user, css: CSS_ASSINATURA,
    cabecalhoHtml: cabecalhoPagina({
      trilha: [{ rotulo: 'Configurações' }, { rotulo: 'Minha assinatura' }],
      titulo: 'Minha assinatura',
      subtitulo: 'Situação da mensalidade, uso do plano e avisos de vencimento.',
    }),
    corpoHtml: `<div class="cc-as">${corpo}</div>`,
  });
}

const METODO_PAGO: Record<string, string> = { pix: 'Pix', credit_card: 'cartão', pix_direto: 'Pix' };

/** Faturas do assinante: aberta com "Pagar" (link), pagas, e quando chega a próxima. */
function secaoFaturas(a: AssinaturaRow, faturas: FaturaRow[], hoje: string): string {
  const visiveis = faturas.filter((f) => f.status !== 'cancelada');
  const lista = visiveis.length
    ? `<div class="cc-as-fat">${tabela({
      mobile: 'cartoes',
      colunas: [{ titulo: 'Mês' }, { titulo: 'Valor', alinhar: 'dir' }, { titulo: 'Situação' }, { titulo: '' }],
      linhas: visiveis.map((f) => {
        const s = situacaoDaFatura(f, hoje);
        const acao = f.status === 'aberta'
          ? (f.linkUrl ? botao({ rotulo: 'Pagar', href: f.linkUrl, icone: 'wallet', tamanho: 'sm', attrs: { target: '_blank', rel: 'noopener noreferrer' } }) : '<span class="cc-cf-nota">link a caminho</span>')
          : `<span class="cc-cf-nota">paga em ${escapeHtml(dataBrIso(f.pagoEm))}${f.metodo ? ` · ${escapeHtml(METODO_PAGO[f.metodo] ?? f.metodo)}` : ''}</span>`;
        return [
          { html: celulaDupla(rotuloCompetencia(f.competencia), `vence ${dataBrIso(f.venceEm)}`) },
          `R$ ${reaisBr(f.valorCentavos)}`,
          { html: pilulaStatus(s.tom, paraCliente(s.texto)) },
          { html: acao },
        ];
      }),
    })}</div>`
    : estadoVazio({ tipo: 'vazio', titulo: 'Nenhuma fatura ainda', texto: `A fatura chega ${DIAS_ANTES} dias antes do vencimento, com o link de pagamento.`, icone: 'receipt' });

  let prox = '';
  if ((a.status === 'ativa' || a.status === 'travada') && a.diaVencimento && !visiveis.some((f) => f.status === 'aberta')) {
    const v = proximoVencimento({ status: a.status, inicioEm: a.inicioEm ?? null, diaVencimento: a.diaVencimento }, faturas, hoje);
    if (v) prox = `<div class="cc-as-prox">Próxima: <b>${escapeHtml(rotuloCompetencia(competenciaDe(v)))}</b> — R$ ${escapeHtml(reaisBr(a.valorCentavos))}, vence ${escapeHtml(dataBrIso(v))}. O link chega ${DIAS_ANTES} dias antes.</div>`;
  } else if (a.status === 'pausada') {
    prox = '<div class="cc-as-prox">Assinatura pausada — nenhuma fatura nova até ela voltar.</div>';
  }
  return lista + prox;
}

/** Texto da pílula pro CLIENTE: "atrasada 4 dias" → "em atraso há 4 dias" (mais educado). */
function paraCliente(texto: string): string {
  return texto.replace(/^atrasada (\d+ dias?)$/, 'em atraso há $1');
}
