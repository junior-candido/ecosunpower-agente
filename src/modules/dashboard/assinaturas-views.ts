// src/modules/dashboard/assinaturas-views.ts
// Tela "Assinaturas" (Financeiro, SÓ a casa) — cobrança recorrente
// (28/09/2026). Nasceu no padrão Command Center (cc-, tema escuro, sem
// Tailwind): lista com próximo vencimento e situação em pílula, total
// recorrente do mês, Nova assinatura; e o detalhe com o histórico de faturas.
//
// O robô cria a fatura 3 dias antes do vencimento, manda o link e lembra —
// aqui é o posto de comando: Gerar cobrança agora, Reenviar link, Marcar como
// paga (Pix direto), Pausar/Reativar, Suspender acesso.
import { renderLayout, escapeHtml } from './views.js';
import type { DashUser } from './permissions.js';
import type { AssinaturaRow, ProdutoRow } from './assinaturas-store.js';
import { descricaoDaAssinatura } from './assinaturas-store.js';
import type { FaturaRow } from '../cobranca-recorrente/faturas-repo.js';
import {
  situacaoDaAssinatura, situacaoDaFatura, proximoVencimento, resumoCarteira, rotuloCompetencia,
  dataBr, reais, competenciaDe, somarMeses, DIAS_ANTES, DIAS_PAUSA_PADRAO, diasEntre, type Situacao,
} from '../cobranca-recorrente/ciclo.js';
import { MODELO_COBRANCA } from '../cobranca-recorrente/mensagens.js';
import { dataDaPausa, dataDaTravaDisparos, diasTravaDisparosValidos } from '../cobranca-recorrente/pausa.js';
import { formatPhoneBR } from '../meta-leadgen.js';
import {
  cabecalhoPagina, cartaoSecao, faixaKpis, tabela, pilulaStatus, botao, celulaDupla, menuAcoes,
  estadoVazio, aviso as avisoCc,
} from './ui/componentes.js';
import { temaDaTela } from './ui/tema.js';

export interface AvisoTela { tipo: 'ok' | 'erro'; texto: string; link?: string }

export interface DadosAssinaturas {
  assinaturas: AssinaturaRow[];
  /** Faturas da casa (abertas + últimos meses). */
  faturas: FaturaRow[];
  produtos: ProdutoRow[];
  empresas: Array<{ id: string; nome: string }>;
  hoje: string;
  /** true/false = conferido na Meta; null = sem WhatsApp oficial configurado. */
  modeloAprovado: boolean | null;
  infinitepayLigada: boolean;
}

const CSS = `
.cc-asr .cc-panel+.cc-panel,.cc-asr .cc-kstrip+.cc-panel,.cc-asr .cc-aviso+.cc-kstrip,.cc-asr .cc-asr-duas+.cc-panel,.cc-asr .cc-panel+.cc-asr-duas{margin-top:16px}
.cc-asr .cc-asr-link{margin-bottom:16px}
.cc-asr .cc-kstrip{margin-bottom:16px}
.cc-asr-val{font-family:var(--cc-f-num);font-variant-numeric:tabular-nums;white-space:nowrap}
.cc-asr-val small{color:var(--cc-muted);font-size:11.5px;margin-left:2px}
.cc-asr-venc{display:flex;flex-direction:column;gap:2px;white-space:nowrap}
.cc-asr-venc small{font-size:11.5px;color:var(--cc-muted)}
.cc-asr-acoes{display:flex;gap:6px;justify-content:flex-end;align-items:center;flex-wrap:wrap}
.cc-asr-acoes form{margin:0}
.cc-asr-form{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;align-items:end}
.cc-asr-form .cc-asr-2{grid-column:span 2}
.cc-asr-form .cc-asr-cheia{grid-column:1/-1}
.cc-asr-nota{margin:0 0 14px;font-size:12.5px;color:var(--cc-muted);line-height:1.5}
.cc-asr-dica{font-size:12.5px;color:var(--cc-muted);line-height:1.4;text-transform:none;letter-spacing:0;font-weight:400}
.cc-asr-link{display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap}
.cc-asr-link code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;background:var(--cc-surface-2);border:1px solid var(--cc-line);border-radius:8px;padding:6px 8px;overflow-wrap:anywhere;flex:1;min-width:0}
.cc-asr-duas{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);gap:16px;align-items:start}
.cc-asr-duas .cc-asr-form{grid-template-columns:repeat(2,minmax(0,1fr))}
.cc-asr-duas .cc-asr-form .cc-asr-2{grid-column:auto}
.cc-asr-dados{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:8px 14px;margin:0;font-size:13.5px}
.cc-asr-dados dt{color:var(--cc-muted)}
.cc-asr-dados dd{margin:0;overflow-wrap:anywhere}
.cc-asr-avisos{font-size:11.5px;color:var(--cc-muted);line-height:1.5;white-space:normal;display:inline-block;max-width:260px}
.cc-asr-prox{margin-top:12px;padding:10px 12px;border:1px dashed var(--cc-line-2);border-radius:10px;font-size:13px;color:var(--cc-text-2)}
.cc-asr-cab{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.cc-asr-cab form{margin:0}
.cc-asr-sits{display:flex;gap:6px;flex-wrap:wrap}
.cc-asr-assist{display:flex;flex-direction:column;gap:14px}
.cc-asr-estado{display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:13.5px}
.cc-asr-nota-in{color:var(--cc-text-2)}
.cc-asr-acoes-esq{justify-content:flex-start}
.cc-asr-duas-in{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.cc-asr-inline{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin:0}
.cc-asr-inline .cc-campo{min-width:180px}
@media (max-width:1100px){.cc-asr-duas{grid-template-columns:minmax(0,1fr)}.cc-asr-form{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:760px){.cc-asr-duas-in{grid-template-columns:minmax(0,1fr)}.cc-asr-cab{width:100%}.cc-asr-form{grid-template-columns:minmax(0,1fr)}.cc-asr-form .cc-asr-2{grid-column:auto}.cc-asr-acoes{justify-content:flex-start}}
`;

const METODO: Record<string, string> = { pix: 'Pix', credit_card: 'cartão', pix_direto: 'Pix direto' };

function pilula(s: Situacao): string {
  return pilulaStatus(s.tom, s.texto);
}

function avisosDaTela(d: { modeloAprovado: boolean | null; infinitepayLigada: boolean }, aviso?: AvisoTela): string {
  let h = '';
  if (aviso) {
    h += avisoCc({ tom: aviso.tipo, texto: aviso.texto });
    if (aviso.link) {
      h += `<div class="cc-asr-link"><code>${escapeHtml(aviso.link)}</code>${botao({ rotulo: 'Copiar link', tamanho: 'sm', attrs: { 'data-copiar': aviso.link } })}</div>`;
    }
  }
  if (!d.infinitepayLigada) {
    h += avisoCc({ tom: 'erro', texto: 'Falta configurar a InfinitePay no servidor — sem ela o robô não gera o link de pagamento.' });
  }
  if (d.modeloAprovado === false) {
    h += avisoCc({ tom: 'atencao', texto: `O modelo "${MODELO_COBRANCA}" ainda não foi aprovado na Meta. Enquanto isso as cobranças saem por e-mail e você recebe no seu WhatsApp o texto pronto (com o link) pra encaminhar.` });
  } else if (d.modeloAprovado === null) {
    h += avisoCc({ tom: 'info', texto: 'WhatsApp oficial não configurado: as cobranças saem por e-mail e você recebe o texto pronto pra encaminhar.' });
  }
  return h;
}

const SCRIPT_COPIAR = `<script>
document.querySelectorAll('[data-copiar]').forEach(function (b) {
  b.addEventListener('click', function () {
    var t = b.getAttribute('data-copiar');
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () {
      b.textContent = 'Copiado!';
    }, function () { window.prompt('Copie o link:', t); });
  });
});
</script>`;

function pagina(title: string, user: DashUser | undefined, body: string): string {
  return renderLayout({
    active: 'assinaturas', title, user,
    body: `<div class="cc-root cc-asr">${body}</div><style>${CSS}</style>`,
    scripts: SCRIPT_COPIAR,
    tailwind: false, dark: temaDaTela(user, 'escuro') === 'escuro', largo: true,
  });
}

function faturasPorAssinatura(faturas: FaturaRow[]): Map<string, FaturaRow[]> {
  const m = new Map<string, FaturaRow[]>();
  for (const f of faturas) {
    const l = m.get(f.assinaturaId) ?? [];
    l.push(f);
    m.set(f.assinaturaId, l);
  }
  return m;
}

function cicloDe(a: AssinaturaRow) {
  return { status: a.status, inicioEm: a.inicioEm ?? null, diaVencimento: a.diaVencimento ?? null };
}

// ---------------------------------------------------------------------------
// Formulário (nova / editar)
// ---------------------------------------------------------------------------

function opcoesDia(atual: number | null | undefined): string {
  const dias = Array.from({ length: 28 }, (_, i) => i + 1);
  return `<option value="">— escolha —</option>${dias.map((d) => `<option value="${d}"${atual === d ? ' selected' : ''}>dia ${d}</option>`).join('')}`;
}

function formNova(d: DadosAssinaturas): string {
  const produtos = d.produtos.map((p) => `<option value="${escapeHtml(p.id)}"${p.id === 'monitoramento' ? ' selected' : ''}>${escapeHtml(p.nome)}</option>`).join('');
  const empresas = d.empresas.map((e) => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.nome)}</option>`).join('');
  const mesQueVem = somarMeses(competenciaDe(d.hoje), 1).slice(0, 7);
  return `<p class="cc-asr-nota">A 1ª fatura sai sozinha 3 dias antes do vencimento, já com o link de Pix/cartão. Quer mandar antes? Depois de criar, use <b>Gerar cobrança agora</b>.</p>
<form method="post" action="/dashboard/assinaturas/nova" class="cc-form cc-asr-form" id="cc-asr-nova">
  <label class="cc-campo cc-asr-2"><span>Cliente do painel (se tiver acesso)</span>
    <select name="company_id"><option value="">— cliente avulso (sem painel) —</option>${empresas}</select></label>
  <label class="cc-campo cc-asr-2"><span>Nome de quem paga</span><input name="nome" required maxlength="120" placeholder="Ex.: Maria Exemplo"></label>
  <label class="cc-campo"><span>CPF ou CNPJ</span><input name="documento" inputmode="numeric" maxlength="18" placeholder="só números ou com pontos"></label>
  <label class="cc-campo"><span>WhatsApp de cobrança</span><input name="telefone" inputmode="tel" maxlength="20" placeholder="(61) 99999-0000"></label>
  <label class="cc-campo cc-asr-2"><span>E-mail de cobrança</span><input name="email" type="email" maxlength="120" placeholder="financeiro@cliente.com.br"></label>
  <p class="cc-asr-dica cc-asr-cheia">Confirme o WhatsApp e o e-mail com o cliente — é pra eles que a cobrança vai. O número da assistente da empresa NÃO é usado.</p>
  <label class="cc-campo"><span>Produto</span><select name="produto" required>${produtos}</select></label>
  <label class="cc-campo cc-asr-2"><span>Descrição (o cliente vê)</span><input name="descricao" maxlength="120" placeholder="Ex.: Plataforma de monitoramento"></label>
  <label class="cc-campo"><span>Valor por mês (R$)</span><input name="valor" required inputmode="decimal" placeholder="297,00"></label>
  <label class="cc-campo"><span>Dia de vencimento</span><select name="dia_vencimento" required>${opcoesDia(null)}</select></label>
  <label class="cc-campo"><span>Primeira mensalidade</span><input name="inicio" type="month" required value="${escapeHtml(mesQueVem)}"></label>
  <label class="cc-campo"><span>Limite de usinas (opcional)</span><input name="limite" inputmode="numeric" placeholder="ex.: 110"></label>
  <label class="cc-campo"><span>Forma de pagamento</span><select name="forma"><option value="link_infinitepay">Link InfinitePay (Pix ou cartão de crédito)</option></select></label>
  <label class="cc-campo cc-asr-cheia"><span>Observação (só você vê)</span><textarea name="observacao" maxlength="500" placeholder="Ex.: às vezes paga pelo CPF, às vezes pelo CNPJ"></textarea></label>
  <div class="cc-asr-cheia">${botao({ rotulo: 'Criar assinatura', tipo: 'submit', tom: 'ouro', icone: 'plus' })}</div>
</form>`;
}

function formEditar(a: AssinaturaRow): string {
  return `<form method="post" action="/dashboard/assinaturas/${escapeHtml(a.id)}/editar" class="cc-form cc-asr-form">
  <label class="cc-campo cc-asr-cheia"><span>Nome de quem paga</span><input name="nome" required maxlength="120" value="${escapeHtml(a.nome)}"></label>
  <label class="cc-campo cc-asr-2"><span>CPF ou CNPJ</span><input name="documento" inputmode="numeric" maxlength="18" value="${escapeHtml(a.documento ?? '')}"></label>
  <label class="cc-campo cc-asr-2"><span>WhatsApp de cobrança</span><input name="telefone" inputmode="tel" maxlength="20" value="${escapeHtml(a.telefone ?? '')}"></label>
  <label class="cc-campo cc-asr-cheia"><span>E-mail de cobrança</span><input name="email" type="email" maxlength="120" value="${escapeHtml(a.email ?? '')}"></label>
  <label class="cc-campo cc-asr-cheia"><span>Descrição (o cliente vê)</span><input name="descricao" maxlength="120" value="${escapeHtml(a.descricao ?? '')}" placeholder="${escapeHtml(a.produtoNome)}"></label>
  <label class="cc-campo cc-asr-2"><span>Valor por mês (R$) <em class="cc-asr-dica">vale da próxima fatura em diante</em></span><input name="valor" inputmode="decimal" value="${escapeHtml(reais(a.valorCentavos))}"></label>
  <label class="cc-campo cc-asr-2"><span>Dia de vencimento</span><select name="dia_vencimento">${opcoesDia(a.diaVencimento)}</select></label>
  <label class="cc-campo cc-asr-2"><span>Limite de usinas</span><input name="limite" inputmode="numeric" value="${a.limite ?? ''}"></label>
  <label class="cc-campo cc-asr-cheia"><span>Observação (só você vê)</span><textarea name="observacao" maxlength="500">${escapeHtml(a.observacao ?? '')}</textarea></label>
  <div class="cc-asr-cheia">${botao({ rotulo: 'Salvar alterações', tipo: 'submit', icone: 'check' })}</div>
</form>`;
}

// ---------------------------------------------------------------------------
// Ações (formulários pequenos)
// ---------------------------------------------------------------------------

function formBotao(action: string, rotulo: string, o: { tom?: 'ouro' | 'normal' | 'critico' | 'fantasma'; campos?: Record<string, string>; confirmar?: string; icone?: Parameters<typeof botao>[0]['icone']; sm?: boolean } = {}): string {
  const ocultos = Object.entries(o.campos ?? {}).map(([k, v]) => `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}">`).join('');
  const conf = o.confirmar ? ` onsubmit="return confirm('${escapeHtml(o.confirmar)}')"` : '';
  return `<form method="post" action="${escapeHtml(action)}"${conf}>${ocultos}${botao({ rotulo, tipo: 'submit', tom: o.tom, icone: o.icone, tamanho: o.sm === false ? undefined : 'sm' })}</form>`;
}

const CONFIRMA_PAGA = 'Confirmar que esta fatura foi PAGA por Pix direto? Isso lança a receita no caixa e manda o recibo ao cliente.';
const CONFIRMA_CANCELAR = 'Cancelar esta assinatura? O robô para de gerar faturas e de mandar lembretes.';
const CONFIRMA_SUSPENDER = 'Suspender o acesso deste cliente ao painel? O acesso volta sozinho quando ele pagar.';
const CONFIRMA_PAUSAR = 'Pausar a cobrança? O robô para de mandar faturas e lembretes até você reativar.';

function acoesDaAssinatura(a: AssinaturaRow, aberta: FaturaRow | undefined): string {
  const base = `/dashboard/assinaturas/${a.id}`;
  const itens: string[] = [];
  if (a.status === 'ativa' || a.status === 'travada') {
    itens.push(formBotao(`${base}/cobrar`, 'Gerar cobrança agora', { icone: 'send' }));
  }
  if (aberta) itens.push(formBotao(`/dashboard/assinaturas/faturas/${aberta.id}/reenviar`, 'Reenviar link', { icone: 'wa' }));
  if (a.status === 'ativa') itens.push(formBotao(`${base}/status`, 'Pausar', { campos: { status: 'pausada' }, tom: 'fantasma' }));
  if (a.status === 'pausada') itens.push(formBotao(`${base}/status`, 'Reativar', { campos: { status: 'ativa' } }));
  return itens.join('');
}

// ---------------------------------------------------------------------------
// LISTA
// ---------------------------------------------------------------------------

export function renderAssinaturasPage(d: DadosAssinaturas, user: DashUser | undefined, aviso?: AvisoTela): string {
  const porAssinatura = faturasPorAssinatura(d.faturas);
  const resumo = resumoCarteira(d.assinaturas, d.faturas, d.hoje);
  const mes = rotuloCompetencia(competenciaDe(d.hoje)).split('/')[0];

  const linhas = d.assinaturas.map((a) => {
    const fs = porAssinatura.get(a.id) ?? [];
    const sit = situacaoDaAssinatura(cicloDe(a), fs, d.hoje);
    // Pausada/cancelada não tem "próximo vencimento" (o robô não gera fatura).
    const prox = a.status === 'cancelada' || a.status === 'pausada' ? null : proximoVencimento(cicloDe(a), fs, d.hoje);
    const aberta = fs.filter((f) => f.status === 'aberta').sort((x, y) => (x.venceEm < y.venceEm ? -1 : 1))[0];
    return { a, fs, sit, prox, aberta };
  });
  // Atrasadas primeiro; depois quem vence antes; pausadas/canceladas no fim.
  const peso = (s: Situacao) => (s.chave === 'atrasada' ? 0 : s.chave === 'suspensa' ? 1 : s.chave === 'pausada' ? 8 : s.chave === 'cancelada' ? 9 : 2);
  linhas.sort((x, y) => peso(x.sit) - peso(y.sit) || (x.sit.chave === 'atrasada' ? y.sit.dias - x.sit.dias : 0) || String(x.prox ?? '9').localeCompare(String(y.prox ?? '9')));

  const lista = tabela({
    mobile: 'cartoes',
    vazio: 'Nenhuma assinatura ainda — cadastre a primeira aqui embaixo.',
    colunas: [{ titulo: 'Cliente' }, { titulo: 'Valor', alinhar: 'dir' }, { titulo: 'Próximo vencimento' }, { titulo: 'Situação' }, { titulo: '' }],
    linhas: linhas.map(({ a, sit, prox, aberta }) => {
      const empresa = a.companyId ? d.empresas.find((e) => e.id === a.companyId)?.nome : null;
      const sub = [descricaoDaAssinatura(a), empresa ? `painel: ${empresa}` : 'cliente avulso'].join(' · ');
      const vencSub = a.diaVencimento ? `todo dia ${a.diaVencimento}` : 'sem dia definido';
      return [
        { html: celulaDupla(a.nome, sub, `/dashboard/assinaturas/${a.id}`) },
        { html: `<span class="cc-asr-val">R$ ${escapeHtml(reais(a.valorCentavos))}<small>/mês</small></span>` },
        { html: `<span class="cc-asr-venc"><span class="cc-num">${escapeHtml(dataBr(prox))}</span><small>${escapeHtml(vencSub)}</small></span>` },
        { html: `<span class="cc-asr-sits">${pilula(sit)}${a.disparosPausadosEm ? pilulaStatus('critico', 'assistente e disparos pausados') : a.assistentePausadaEm ? pilulaStatus('critico', 'assistente pausada') : ''}</span>` },
        { html: `<div class="cc-asr-acoes">${botao({ rotulo: 'Abrir', href: `/dashboard/assinaturas/${a.id}`, tamanho: 'sm' })}${menuAcoes({ rotulo: '⋯', alinhar: 'dir', itensHtml: acoesDaAssinatura(a, aberta) || '<span class="cc-asr-dica">Sem ações</span>' })}</div>` },
      ];
    }),
  });

  const kpis = faixaKpis([
    { rotulo: 'Recorrente por mês', valor: resumo.recorrenteCentavos / 100, casas: 2, prefixo: 'R$', destaque: true, detalhe: `${resumo.ativas} assinatura${resumo.ativas === 1 ? '' : 's'} cobrando` },
    { rotulo: `Recebido em ${mes}`, valor: resumo.recebidoMesCentavos / 100, casas: 2, prefixo: 'R$', detalhe: 'faturas pagas no mês' },
    { rotulo: 'Em aberto', valor: resumo.emAbertoCentavos / 100, casas: 2, prefixo: 'R$', detalhe: 'a receber' },
    { rotulo: 'Atrasadas', valor: resumo.atrasadas, detalhe: resumo.atrasadas ? 'veja as primeiras da lista' : 'nenhuma — tudo em dia' },
  ]);

  const body = `${cabecalhoPagina({
    trilha: [{ rotulo: 'Financeiro', href: '/dashboard/financeiro' }, { rotulo: 'Assinaturas' }],
    titulo: 'Assinaturas',
    subtitulo: `Mensalidades cobradas todo mês. O robô cria a fatura ${DIAS_ANTES} dias antes do vencimento, manda o link (Pix ou cartão) e lembra no dia e 3 dias depois; com 7 dias de atraso ele te avisa.`,
    acoesHtml: botao({ rotulo: 'Nova assinatura', href: '#nova', icone: 'plus' }),
  })}
${avisosDaTela(d, aviso)}
${kpis}
${cartaoSecao({ titulo: 'Assinaturas', dica: `${d.assinaturas.length} no total`, corpoHtml: lista })}
${cartaoSecao({ titulo: 'Nova assinatura', id: 'nova', corpoHtml: formNova(d) })}`;

  return pagina('Assinaturas', user, body);
}

// ---------------------------------------------------------------------------
// DETALHE
// ---------------------------------------------------------------------------

export interface DadosAssinatura {
  assinatura: AssinaturaRow;
  faturas: FaturaRow[];
  hoje: string;
  empresaNome: string | null;
  uso: number | null;
  modeloAprovado: boolean | null;
  infinitepayLigada: boolean;
}

function textoAvisos(f: FaturaRow): string {
  const partes: string[] = [];
  if (f.avisoFaturaEm) partes.push(`fatura enviada ${dataBr(f.avisoFaturaEm)}`);
  if (f.avisoVesperaEm) partes.push(`lembrete ${dataBr(f.avisoVesperaEm)}`);
  if (f.avisoVenceuEm) partes.push(`aviso de atraso ${dataBr(f.avisoVenceuEm)}`);
  if (f.avisoUltimoEm) partes.push(`último aviso ${dataBr(f.avisoUltimoEm)}`);
  if (f.reciboEm) partes.push(`recibo ${dataBr(f.reciboEm)}`);
  const canal = f.canalUltimoAviso ? ` · por ${f.canalUltimoAviso.split('+').map((c) => ({ whatsapp: 'WhatsApp', email: 'e-mail', junior: 'texto enviado pra você encaminhar' } as Record<string, string>)[c] ?? c).join(', ')}` : '';
  return partes.length ? partes.join(' · ') + canal : 'nenhum aviso ainda';
}

export function renderAssinaturaDetalhePage(d: DadosAssinatura, user: DashUser | undefined, aviso?: AvisoTela): string {
  const a = d.assinatura;
  const base = `/dashboard/assinaturas/${a.id}`;
  const sit = situacaoDaAssinatura(cicloDe(a), d.faturas, d.hoje);
  const abertas = d.faturas.filter((f) => f.status === 'aberta');

  // Ação dourada = o próximo passo de verdade: com fatura em aberto é REENVIAR
  // (gerar outra agora duplicaria a cobrança); sem nada em aberto, gerar.
  const cobrando = a.status === 'ativa' || a.status === 'travada';
  const maisAntigaAberta = [...abertas].sort((x, y) => (x.venceEm < y.venceEm ? -1 : 1))[0];
  const acoesTopo: string[] = [];
  const mais: string[] = [];
  if (maisAntigaAberta) {
    acoesTopo.push(formBotao(`/dashboard/assinaturas/faturas/${maisAntigaAberta.id}/reenviar`, 'Reenviar link', { tom: 'ouro', icone: 'wa', sm: false }));
    if (cobrando) mais.push(formBotao(`${base}/cobrar`, 'Gerar a próxima cobrança agora', { icone: 'send' }));
  } else if (cobrando) {
    acoesTopo.push(formBotao(`${base}/cobrar`, 'Gerar cobrança agora', { tom: 'ouro', icone: 'send', sm: false }));
  }
  if (a.status === 'ativa') acoesTopo.push(formBotao(`${base}/status`, 'Pausar cobrança', { campos: { status: 'pausada' }, sm: false, confirmar: CONFIRMA_PAUSAR }));
  if (a.status === 'pausada' || a.status === 'cancelada') acoesTopo.push(formBotao(`${base}/status`, 'Reativar cobrança', { campos: { status: 'ativa' }, sm: false }));
  const temAcesso = !!a.companyId || a.produtoId === 'calculadora';
  if (temAcesso && a.status === 'ativa') mais.push(formBotao(`${base}/status`, 'Suspender acesso', { campos: { status: 'travada' }, tom: 'critico', confirmar: CONFIRMA_SUSPENDER }));
  if (a.status === 'travada') mais.push(formBotao(`${base}/status`, 'Liberar acesso', { campos: { status: 'ativa' } }));
  if (a.status !== 'cancelada') mais.push(formBotao(`${base}/status`, 'Cancelar assinatura', { campos: { status: 'cancelada' }, tom: 'critico', confirmar: CONFIRMA_CANCELAR }));
  if (mais.length) acoesTopo.push(menuAcoes({ rotulo: '⋯ Mais', alinhar: 'dir', itensHtml: mais.join('') }));

  const linhas = d.faturas.map((f) => {
    const s = situacaoDaFatura(f, d.hoje);
    const pagamento = f.status === 'paga'
      ? `${dataBr(f.pagoEm)} · ${METODO[f.metodo ?? ''] ?? f.metodo ?? '—'}${f.pagoCentavos && f.pagoCentavos !== f.valorCentavos ? ` · R$ ${reais(f.pagoCentavos)}` : ''}`
      : '—';
    const acoes: string[] = [];
    if (f.status === 'aberta') {
      if (f.linkUrl) {
        acoes.push(botao({ rotulo: 'Copiar link', tamanho: 'sm', attrs: { 'data-copiar': f.linkUrl } }));
        acoes.push(botao({ rotulo: 'Abrir', href: f.linkUrl, tamanho: 'sm', tom: 'fantasma', attrs: { target: '_blank', rel: 'noopener noreferrer' } }));
      }
      acoes.push(formBotao(`/dashboard/assinaturas/faturas/${f.id}/reenviar`, 'Reenviar', { icone: 'wa' }));
      acoes.push(formBotao(`/dashboard/assinaturas/faturas/${f.id}/marcar-paga`, 'Marcar como paga (Pix direto)', { confirmar: CONFIRMA_PAGA, icone: 'check' }));
    }
    return [
      { html: celulaDupla(rotuloCompetencia(f.competencia), `vence ${dataBr(f.venceEm)}`) },
      { html: `<span class="cc-asr-val">R$ ${escapeHtml(reais(f.valorCentavos))}</span>` },
      { html: pilula(s) },
      pagamento,
      { html: `<span class="cc-asr-avisos">${escapeHtml(textoAvisos(f))}</span>` },
      { html: acoes.length ? `<div class="cc-asr-acoes">${acoes.join('')}</div>` : '' },
    ];
  });

  // Próxima fatura (quando nada em aberto): quando o robô vai mandar.
  let proxHtml = '';
  if (!abertas.length && (a.status === 'ativa' || a.status === 'travada')) {
    const prox = proximoVencimento(cicloDe(a), d.faturas, d.hoje);
    if (prox) {
      const sai = somarDias(prox, -DIAS_ANTES);
      const quando = diasEntre(d.hoje, sai) <= 0 ? 'na próxima rodada do robô (hoje, depois das 9h)' : `em ${dataBr(sai)}`;
      proxHtml = `<div class="cc-asr-prox">Próxima: <b>${escapeHtml(rotuloCompetencia(competenciaDe(prox)))}</b> — R$ ${escapeHtml(reais(a.valorCentavos))}, vence ${escapeHtml(dataBr(prox))}. A fatura sai sozinha ${escapeHtml(quando)}.</div>`;
    }
  } else if (a.status === 'pausada') {
    proxHtml = '<div class="cc-asr-prox">Assinatura pausada: o robô não gera faturas nem manda lembretes até você reativar.</div>';
  }

  const faturasHtml = (d.faturas.length
    ? tabela({
      mobile: 'cartoes',
      colunas: [{ titulo: 'Mês' }, { titulo: 'Valor', alinhar: 'dir' }, { titulo: 'Situação' }, { titulo: 'Pagamento' }, { titulo: 'Avisos' }, { titulo: '' }],
      linhas,
    })
    : estadoVazio({ tipo: 'vazio', titulo: 'Nenhuma fatura ainda', texto: 'A primeira sai sozinha 3 dias antes do vencimento — ou use "Gerar cobrança agora".', icone: 'receipt' })) + proxHtml;

  const doc = a.documento ? (a.documento.length === 14
    ? a.documento.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
    : a.documento.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')) : '—';
  const dados = `<dl class="cc-asr-dados">
    <dt>Quem paga</dt><dd>${escapeHtml(a.nome)}</dd>
    <dt>CPF/CNPJ</dt><dd>${escapeHtml(doc)}</dd>
    <dt>WhatsApp</dt><dd>${escapeHtml(a.telefone ? formatPhoneBR(a.telefone) : '—')}</dd>
    <dt>E-mail</dt><dd>${escapeHtml(a.email ?? '—')}</dd>
    <dt>Painel</dt><dd>${escapeHtml(d.empresaNome ?? 'cliente avulso')}${d.uso !== null && a.limite !== null ? ` · ${d.uso}/${a.limite} usinas` : ''}</dd>
    <dt>Produto</dt><dd>${escapeHtml(a.produtoNome)}</dd>
    <dt>Vencimento</dt><dd>${a.diaVencimento ? `todo dia ${a.diaVencimento}` : '—'}${a.inicioEm ? ` · desde ${escapeHtml(rotuloCompetencia(a.inicioEm))}` : ''}</dd>
    <dt>Pagamento</dt><dd>Link InfinitePay — Pix ou cartão de crédito</dd>
    ${a.observacao ? `<dt>Observação</dt><dd>${escapeHtml(a.observacao)}</dd>` : ''}
  </dl>`;

  const body = `${cabecalhoPagina({
    trilha: [{ rotulo: 'Financeiro', href: '/dashboard/financeiro' }, { rotulo: 'Assinaturas', href: '/dashboard/assinaturas' }, { rotulo: a.nome }],
    titulo: a.nome,
    seloHtml: pilula(sit),
    subtitulo: `${descricaoDaAssinatura(a)} · R$ ${reais(a.valorCentavos)}/mês${a.diaVencimento ? ` · vence todo dia ${a.diaVencimento}` : ''}`,
    acoesHtml: `<div class="cc-asr-cab">${acoesTopo.join('')}</div>`,
  })}
${avisosDaTela(d, aviso)}
${cartaoSecao({ titulo: 'Faturas', dica: `${d.faturas.length} no histórico`, corpoHtml: faturasHtml })}
${a.companyId ? cartaoSecao({ titulo: 'Assistente do cliente', dica: 'se não pagar, a assistente para — o painel continua', corpoHtml: blocoAssistente(a, d.faturas, d.hoje) }) : ''}
<div class="cc-asr-duas">
  ${cartaoSecao({ titulo: 'Dados da cobrança', corpoHtml: dados })}
  ${cartaoSecao({ titulo: 'Editar', dica: 'mudar o valor vale a partir da próxima fatura', corpoHtml: formEditar(a) })}
</div>`;

  return pagina(`Assinatura · ${a.nome}`, user, body);
}

function somarDias(iso: string, n: number): string {
  const [y, m, dd] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, dd! + n)).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// "Se não pagar, a assistente para" — cartão do detalhe (só cliente do painel)
// ---------------------------------------------------------------------------

const CONFIRMA_PAUSAR_ASSISTENTE = 'Pausar a assistente deste cliente agora? Ela para de responder os clientes dele (o painel continua funcionando). Volta sozinha quando ele pagar.';
const CONFIRMA_REATIVAR_ASSISTENTE = 'Reativar a assistente deste cliente agora, mesmo com fatura em aberto?';

function blocoAssistente(a: AssinaturaRow, faturas: FaturaRow[], hoje: string): string {
  const base = `/dashboard/assinaturas/${a.id}/assistente`;
  const auto = a.pausaAutomatica !== false;
  const dias = a.diasPausa ?? DIAS_PAUSA_PADRAO;
  const diasDisp = diasTravaDisparosValidos(a.diasTravaDisparos, dias);
  const vencida = faturas.filter((f) => f.status === 'aberta' && f.venceEm < hoje).sort((x, y) => (x.venceEm < y.venceEm ? -1 : 1))[0];
  const prazoTxt = a.pausaAdiadaAte ? ` (você deu prazo até ${escapeHtml(dataBr(a.pausaAdiadaAte))})` : '';
  let estado: string;
  if (a.disparosPausadosEm) {
    estado = `${pilulaStatus('critico', '2ª trava')} <span class="cc-asr-nota-in">assistente pausada desde ${escapeHtml(dataBr(a.assistentePausadaEm))} e disparos automáticos (cadência, follow-ups, reativação) parados desde ${escapeHtml(dataBr(a.disparosPausadosEm))}. Tudo volta sozinho quando pagar — os disparos, aos poucos.</span>`;
  } else if (a.assistentePausadaEm) {
    const extra = vencida && auto
      ? ` Os disparos automáticos param em <b>${escapeHtml(dataBr(dataDaTravaDisparos(vencida.venceEm, dias, diasDisp, a.pausaAdiadaAte ?? null)))}</b> se não pagar${prazoTxt}.`
      : '';
    estado = `${pilulaStatus('critico', '1ª trava')} <span class="cc-asr-nota-in">assistente pausada desde ${escapeHtml(dataBr(a.assistentePausadaEm))} — as mensagens dos clientes dele ficam guardadas no painel.${extra} Volta sozinha quando pagar.</span>`;
  } else if (vencida && auto) {
    const quando = dataDaPausa(vencida.venceEm, dias, a.pausaAdiadaAte ?? null);
    estado = `${pilulaStatus('atencao', 'atendendo')} <span class="cc-asr-nota-in">fatura vencida — a assistente para de responder em <b>${escapeHtml(dataBr(quando))}</b> se não pagar${prazoTxt}.</span>`;
  } else {
    estado = `${pilulaStatus('normal', 'atendendo')} <span class="cc-asr-nota-in">${auto ? `se atrasar: 1ª trava (para de responder) ${dias} dias depois do vencimento; 2ª trava (param os disparos automáticos) em ${diasDisp} dias. Aviso sempre na véspera.` : 'pausa automática desligada — nunca pausa sozinha (nem os disparos).'}</span>`;
  }
  const botoes: string[] = [];
  if (a.assistentePausadaEm || a.disparosPausadosEm) botoes.push(formBotao(`${base}/reativar`, 'Reativar agora', { confirmar: CONFIRMA_REATIVAR_ASSISTENTE, icone: 'check' }));
  else botoes.push(formBotao(`${base}/pausar`, 'Pausar agora', { tom: 'critico', confirmar: CONFIRMA_PAUSAR_ASSISTENTE }));
  const prazo = `<form method="post" action="${escapeHtml(base)}/prazo" class="cc-form cc-asr-inline">
    <label class="cc-campo"><span>Dar mais prazo (adia as duas travas)</span><select name="dias">${[1, 2, 3, 5, 7, 10, 15, 30].map((n) => `<option value="${n}"${n === 3 ? ' selected' : ''}>+${n} dia${n === 1 ? '' : 's'}</option>`).join('')}</select></label>
    ${botao({ rotulo: 'Dar prazo', tipo: 'submit', tamanho: 'sm', icone: 'clock' })}
  </form>`;
  const regra = `<form method="post" action="${escapeHtml(base)}/regra" class="cc-form cc-asr-inline">
    <label class="cc-cf-check"><input type="checkbox" name="pausa_automatica" value="1"${auto ? ' checked' : ''}> Pausar automaticamente quando atrasar</label>
    <label class="cc-campo"><span>1ª trava: para de responder (dias após o vencimento)</span><select name="dias_pausa">${[2, 3, 4, 5, 7, 10, 15, 30].map((n) => `<option value="${n}"${n === dias ? ' selected' : ''}>${n} dias</option>`).join('')}</select></label>
    <label class="cc-campo"><span>2ª trava: param os disparos automáticos (dias)</span><select name="dias_trava_disparos">${[4, 5, 7, 10, 14, 21, 30, 45, 60].map((n) => `<option value="${n}"${n === diasDisp ? ' selected' : ''}>${n} dias</option>`).join('')}</select></label>
    ${botao({ rotulo: 'Salvar regra', tipo: 'submit', tamanho: 'sm' })}
  </form>`;
  return `<div class="cc-asr-assist">
  <div class="cc-asr-estado">${estado}</div>
  <div class="cc-asr-acoes cc-asr-acoes-esq">${botoes.join('')}</div>
  <div class="cc-asr-duas-in">${prazo}${regra}</div>
</div>`;
}
