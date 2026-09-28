// src/modules/dashboard/atendimento-views.ts
// Leads › Conversas — "modo Atendimento" (28/09/2026, Parte 1: só a tela, sem
// mudar banco). Três colunas como o mockup do Junior:
//   lista de conversas | chat | cockpit do lead
// Substitui a ficha do lead refeita no R3: /dashboard/leads/:id abre ESTA tela
// com o lead escolhido. Os formulários POST, os campos e os confirm() são os
// MESMOS da ficha (contrato travado em tests/miolo-lead-ficha-contrato.test.ts);
// saiu só o que o Junior mandou tirar (Copiloto IA, "IA Assistente", faixa de
// números genérica) — ver o commit.
//
// Celular: /leads/conversas mostra só a lista; tocar num lead abre o chat, e a
// aba "Resumo" (âncora #resumo) mostra o cockpit. Sem JavaScript para navegar.

import { renderLayout, escapeHtml } from './views.js';
import { can, type DashUser } from './permissions.js';
import type { LeadDetail } from './leads-queries.js';
import type { Atividade } from './atividades.js';
import type { Tarefa } from './tarefas.js';
import type { ConversaResumo, FiltrosConversa, ListaConversas, MensagemChat, CanalConversa } from './conversas-queries.js';
import { ETAPAS_FILTRO } from './conversas-queries.js';
import { seloSla } from './sla-rules.js';
import { formatPhoneBR, normalizeBrazilianPhone } from '../meta-leadgen.js';
import { cabecalhoPagina, chip, estadoVazio, pilulaStatus, pontoStatus, icone, menuAcoes, aviso, type Tom } from './ui/componentes.js';
import { pilulaEtapa } from './ui/etapas.js';
import { temaDaTela } from './ui/tema.js';
import { ECOSUN_COMPANY_ID } from '../tenant-resolver.js';
import { dadosDoLead, interessesDoLead, rotuloOrigem, rotuloPerfil } from './atendimento-dados.js';
import { ultimoEventoDeAtendimento } from '../assumir-atendimento.js';
import {
  ultimaDoCliente, janelaAtendimento, horaDaJanela, avisoCusto, motivoBloqueio, custoDoModelo,
  RESULTADO_ENVIO, LIMITE_TEXTO, type ViaEnvio, type MotivoBloqueio,
} from './atendimento-envio.js';
import { parametroNome, type ModeloAtendimento } from './modelos-atendimento.js';

const FUSO = 'America/Sao_Paulo';

// ---------------------------------------------------------------------------
// Ajudantes puros
// ---------------------------------------------------------------------------

function diaDe(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: FUSO });
}

/** Horário curto da lista: hoje → 10:24 · ontem → Ontem · antes → 25/09. */
export function horaCurta(iso: string | null, agora = Date.now()): string {
  if (!iso || !Number.isFinite(Date.parse(iso))) return '';
  const hoje = diaDe(new Date(agora).toISOString());
  const ontem = diaDe(new Date(agora - 86400_000).toISOString());
  const d = diaDe(iso);
  if (d === hoje) return new Date(iso).toLocaleTimeString('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' });
  if (d === ontem) return 'Ontem';
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit' });
}

/** Separador de dia do chat: Hoje / Ontem / 25/09/2026. */
export function rotuloDia(iso: string, agora = Date.now()): string {
  const d = diaDe(iso);
  if (d === diaDe(new Date(agora).toISOString())) return 'Hoje';
  if (d === diaDe(new Date(agora - 86400_000).toISOString())) return 'Ontem';
  return d;
}

/** Cor do avatar (6 tons) — estável pelo nome/telefone. */
export function corAvatar(chave: string): number {
  let h = 0;
  for (const c of chave) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 6;
}

function avatarAt(nome: string | null, chave: string, grande = false): string {
  const inicial = (nome ?? '').trim().charAt(0).toUpperCase() || '?';
  return `<span class="cc-at-av cc-at-av-${corAvatar(chave || nome || '?')}${grande ? ' cc-at-av-g' : ''}" aria-hidden="true">${escapeHtml(inicial)}</span>`;
}

/**
 * De qual número veio a conversa: 🤖 Eva (ou "Assistente", no tenant) ou 👤 o
 * número pessoal do dono (Parte 2b). PURA.
 */
export function rotuloCanal(canal: CanalConversa, assistente: string, donoPessoal?: string | null): string {
  if (canal === 'whatsapp_business') return `👤 ${donoPessoal || 'Meu WhatsApp'}`;
  return `🤖 ${assistente}`;
}

/** Link wa.me do lead (null quando o "telefone" não é telefone — ex. sem-telefone-…). */
export function linkWhatsApp(phone: string): string | null {
  const n = normalizeBrazilianPhone(phone ?? '');
  return n ? `https://wa.me/${n}` : null;
}

/** Mídia registrada como marcador no texto da conversa (a Eva grava assim). */
const MIDIA: Array<{ re: RegExp; ic: string; rotulo: string }> = [
  { re: /^\[(Enviou uma foto|imagem)\]\s*/i, ic: '📷', rotulo: 'Foto' },
  { re: /^\[(Enviou um PDF)\]\s*/i, ic: '📄', rotulo: 'PDF' },
  { re: /^\[(documento)\]\s*/i, ic: '📄', rotulo: 'Documento' },
  { re: /^\[(áudio|audio)\]\s*/i, ic: '🎤', rotulo: 'Áudio' },
  { re: /^\[(vídeo|video)\]\s*/i, ic: '🎬', rotulo: 'Vídeo' },
];

/** Texto do balão: marcador de mídia vira etiqueta; o texto é SEMPRE escapado. */
export function corpoDaMensagem(conteudo: string, temArquivos: boolean): string {
  const verArquivos = temArquivos ? ` <a class="cc-link" href="#arquivos">ver em Arquivos</a>` : '';
  // Vídeo: a Eva guarda uma instrução longa entre colchetes — mostra a etiqueta e esconde o resto.
  if (/^\[Cliente enviou um V[IÍ]DEO/i.test(conteudo)) {
    return `<span class="cc-at-midia">🎬 Vídeo enviado pelo cliente</span>${verArquivos}<details class="cc-at-det"><summary>detalhes</summary><div class="cc-at-msg-t">${escapeHtml(conteudo)}</div></details>`;
  }
  for (const m of MIDIA) {
    if (m.re.test(conteudo)) {
      const resto = conteudo.replace(m.re, '');
      return `<span class="cc-at-midia">${m.ic} ${m.rotulo}</span>${verArquivos}${resto.trim() ? `<div class="cc-at-msg-t">${escapeHtml(resto)}</div>` : ''}`;
    }
  }
  return `<div class="cc-at-msg-t">${escapeHtml(conteudo)}</div>`;
}

function qsFiltros(f: FiltrosConversa, extra: Partial<FiltrosConversa> = {}): string {
  const x = { ...f, ...extra };
  const p = new URLSearchParams();
  if (x.filtro && x.filtro !== 'todas') p.set('filtro', x.filtro);
  if (x.etapa) p.set('etapa', x.etapa);
  if (x.q) p.set('q', x.q);
  const s = p.toString();
  return s ? `?${s}` : '';
}

// ---------------------------------------------------------------------------
// Coluna 1 — lista de conversas
// ---------------------------------------------------------------------------

function itemConversa(c: ConversaResumo, ativo: boolean, filtros: FiltrosConversa, assistente: string): string {
  const quem = c.ultimaDe === 'assistente' ? `${assistente}: ` : '';
  const previa = c.ultimaTexto ? `${quem}${c.ultimaTexto}` : 'Sem mensagens';
  const sinais = [
    pilulaEtapa(c.etapa),
    c.optOut ? pilulaStatus('sem_dado', 'Parou') : !c.evaAtiva ? pilulaStatus('acompanhar', `${assistente} pausada`) : '',
    c.canal ? `<span class="cc-at-canal cc-at-canal-${escapeHtml(c.canal)}">${escapeHtml(rotuloCanal(c.canal, assistente))}</span>` : '',
  ].filter(Boolean).join('');
  return `<a class="cc-at-item${ativo ? ' cc-on' : ''}" href="/dashboard/leads/${escapeHtml(c.leadId)}${escapeHtml(qsFiltros(filtros))}"${ativo ? ' aria-current="true"' : ''}>
    ${avatarAt(c.nome, c.telefone)}
    <span class="cc-at-item-txt">
      <span class="cc-at-l1"><strong>${escapeHtml(c.nome ?? formatPhoneBR(c.telefone))}</strong><time>${escapeHtml(horaCurta(c.ultimaEm))}</time></span>
      <span class="cc-at-l2"><span class="cc-at-prev">${escapeHtml(previa)}</span>${c.aguardandoResposta ? '<span class="cc-at-espera" title="O cliente falou por último — aguardando resposta" aria-label="aguardando resposta"></span>' : ''}</span>
      <span class="cc-at-l3">${sinais}</span>
    </span>
  </a>`;
}

function colunaLista(lista: ListaConversas, filtros: FiltrosConversa, leadAtivo: string | null, assistente: string): string {
  const base = '/dashboard/leads/conversas';
  const k = lista.contagem;
  const chipsFiltro = [
    chip({ rotulo: 'Todas', valor: k.todas, href: `${base}${qsFiltros(filtros, { filtro: 'todas' })}`, ativo: (filtros.filtro ?? 'todas') === 'todas' }),
    chip({ rotulo: 'Aguardando resposta', valor: k.aguardando, href: `${base}${qsFiltros(filtros, { filtro: 'aguardando' })}`, ativo: filtros.filtro === 'aguardando', tom: k.aguardando > 0 ? 'warn' : undefined }),
    chip({ rotulo: 'Meus leads', valor: k.meus, href: `${base}${qsFiltros(filtros, { filtro: 'meus' })}`, ativo: filtros.filtro === 'meus' }),
  ].join('');
  const chipsEtapa = [
    chip({ rotulo: 'Todas as etapas', href: `${base}${qsFiltros({ ...filtros, etapa: undefined })}`, ativo: !filtros.etapa }),
    ...ETAPAS_FILTRO.map((e) => chip({ rotulo: e.rotulo, valor: k.porEtapa[e.id] ?? 0, href: `${base}${qsFiltros(filtros, { etapa: e.id })}`, ativo: filtros.etapa === e.id })),
  ].join('');
  const busca = `<form class="cc-form cc-at-busca" action="${base}" method="get" role="search">
      ${filtros.filtro && filtros.filtro !== 'todas' ? `<input type="hidden" name="filtro" value="${escapeHtml(filtros.filtro)}">` : ''}
      ${filtros.etapa ? `<input type="hidden" name="etapa" value="${escapeHtml(filtros.etapa)}">` : ''}
      <input type="search" name="q" value="${escapeHtml(filtros.q ?? '')}" placeholder="Buscar nome, telefone ou cidade" aria-label="Buscar conversa">
      <button type="submit" class="cc-ibtn" aria-label="Buscar">${icone('search', 'sm')}</button>
    </form>`;
  const itens = lista.itens.length === 0
    ? estadoVazio({ tipo: 'vazio', titulo: filtros.q || filtros.etapa || (filtros.filtro && filtros.filtro !== 'todas') ? 'Nenhuma conversa neste filtro' : 'Nenhuma conversa ainda', texto: filtros.q ? 'Tente outro nome ou limpe a busca.' : undefined, compacto: true })
    : lista.itens.map((c) => itemConversa(c, c.leadId === leadAtivo, filtros, assistente)).join('');
  return `<aside class="cc-at-col cc-at-lista" aria-label="Conversas">
    <div class="cc-at-alca cc-at-alca-l" data-lado="l" role="separator" aria-orientation="vertical" aria-label="Arrastar para mudar a largura da lista de conversas" tabindex="0"></div>
    <div class="cc-at-lista-topo">
      ${busca}
      <div class="cc-chips cc-at-chips">${chipsFiltro}</div>
      <div class="cc-chips cc-at-chips cc-at-chips-etapa">${chipsEtapa}</div>
    </div>
    <nav class="cc-at-itens" aria-label="Lista de conversas">${itens}</nav>
  </aside>`;
}

// ---------------------------------------------------------------------------
// Coluna 2 — chat
// ---------------------------------------------------------------------------

function horaDe(iso: string | null): string {
  return iso && Number.isFinite(Date.parse(iso))
    ? new Date(iso).toLocaleTimeString('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' })
    : '';
}

/** Evento no meio da conversa: "✋ Junior assumiu às 14:32" / "↩ Devolvido para a Eva às 15:10". PURA. */
export function textoDoEvento(m: Pick<MensagemChat, 'evento' | 'autorNome' | 'timestamp'>, assistente: string): string {
  const quem = (m.autorNome ?? '').trim();
  const h = horaDe(m.timestamp);
  const as = h ? ` às ${h}` : '';
  if (m.evento === 'assumiu') return `✋ ${quem || 'Alguém da equipe'} assumiu${as}`;
  return `↩ Devolvido para a ${assistente}${as}${quem ? ` (por ${quem})` : ''}`;
}

function balao(m: MensagemChat, rotuloAssistente: string, nomeCliente: string, temArquivos: boolean, mostrarCanal: boolean, donoPessoal: string | null): string {
  if (m.role === 'evento' || m.autor === 'evento') {
    return `<div class="cc-at-evento cc-at-evento-${m.evento === 'assumiu' ? 'assumiu' : 'devolveu'}" role="note">${escapeHtml(textoDoEvento(m, rotuloAssistente))}</div>`;
  }
  const daAssistente = m.role === 'assistant';
  const humano = daAssistente && m.autor === 'humano';
  const hora = horaDe(m.timestamp);
  const quem = humano ? `${m.autorNome || 'Equipe'} · pelo painel` : daAssistente ? rotuloAssistente : nomeCliente;
  const canal = mostrarCanal && m.canal ? `<span class="cc-at-msg-canal">${escapeHtml(rotuloCanal(m.canal, rotuloAssistente, donoPessoal))}</span>` : '';
  const falhou = humano && m.status === 'falhou' ? `<div class="cc-at-msg-falha">⚠ não saiu — o WhatsApp recusou</div>`
    : humano && m.status === 'sem_confirmacao' ? `<div class="cc-at-msg-falha">⚠ envio não confirmado — confira no WhatsApp</div>` : '';
  const enviando = humano && m.status === 'enviando' ? ' · enviando…' : '';
  const classe = humano ? 'cc-at-msg-eva cc-at-msg-hum' : daAssistente ? 'cc-at-msg-eva' : 'cc-at-msg-cli';
  return `<div class="cc-at-msg ${classe}">
      <div class="cc-at-msg-q">${escapeHtml(quem)}${canal}</div>
      ${corpoDaMensagem(m.content, temArquivos)}
      ${falhou}
      ${hora ? `<div class="cc-at-msg-h">${escapeHtml(hora + enviando)}</div>` : ''}
    </div>`;
}

// ---------------------------------------------------------------------------
// Responder pelo painel (Parte 2)
// ---------------------------------------------------------------------------

/** O que o servidor sabe sobre o envio desta conversa (a tela só desenha). */
export interface CompositorInput {
  /** Por onde a resposta sai: API oficial (Eva, casa), QR (tenant) ou não sai. */
  via: ViaEnvio;
  /** Quando não sai: casa sem o número oficial configurado ≠ tenant sem WhatsApp conectado. */
  semCanalMotivo?: MotivoBloqueio | null;
  /** Número por onde sai (e cujo relógio de 24 h vale). */
  canal: CanalConversa;
  /** Modelos aprovados (só no número oficial). */
  modelos: ModeloAtendimento[];
  /** Chave deste clique (anti envio duplo). */
  chave: string;
  /** Resultado do último envio (?resp=…). */
  resultado?: string | null;
  /** Trava LGPD: este telefone não pode receber por este canal. */
  lgpdBloqueado?: boolean;
  agora?: number;
}

const TEXTO_BLOQUEIO: Record<MotivoBloqueio, string> = {
  opt_out: 'Este contato pediu para parar. Não dá para enviar mensagem.',
  sem_telefone: 'Este lead não tem telefone de WhatsApp.',
  sem_canal: 'Conecte o WhatsApp da empresa para responder por aqui.',
  whatsapp_nao_configurado: 'O número oficial não está configurado neste servidor.',
  bloqueado_lgpd: 'Este número não pode receber mensagem por este canal.',
  janela_fechada: 'Janela de 24 h fechada — use um modelo aprovado.',
  modelo_so_no_oficial: 'Modelo só existe no número oficial.',
};

function formModelo(leadId: string, c: CompositorInput, nomeCliente: string, aberto: boolean): string {
  if (c.via !== 'waba') return '';
  if (c.modelos.length === 0) {
    return `<p class="cc-at-nota">Nenhum modelo aprovado disponível agora.</p>`;
  }
  const primeiro = c.modelos[0];
  const nome = parametroNome((nomeCliente || '').split(/\s+/)[0]);
  const opcoes = c.modelos.map((m) => `<option value="${escapeHtml(m.nome)}" data-texto="${escapeHtml(m.texto ?? '')}" data-custo="${escapeHtml(custoDoModelo(m))}">${escapeHtml(m.rotulo)}${m.categoria === 'marketing' ? ' · marketing' : ''}</option>`).join('');
  const previa = primeiro.texto ? primeiro.texto.replace(/\{nome\}/g, nome) : `O texto deste modelo está na Meta (nome: ${nome}).`;
  const form = `<form class="cc-form cc-at-modelo" method="POST" action="/dashboard/leads/${escapeHtml(leadId)}/responder-modelo" data-envio>
      <input type="hidden" name="chave" value="${escapeHtml(c.chave)}">
      <div class="cc-at-modelo-lin">
        <label class="cc-campo"><span>Modelo aprovado</span><select name="modelo" id="cc-at-modelo-sel">${opcoes}</select></label>
        <label class="cc-campo cc-at-modelo-nome"><span>Nome do cliente</span><input type="text" name="nome" id="cc-at-modelo-nome" value="${escapeHtml(nome)}" maxlength="60" required></label>
      </div>
      <div class="cc-at-previa" aria-live="polite"><span class="cc-at-previa-t">Prévia do que o cliente recebe</span><div id="cc-at-previa">${escapeHtml(previa)}</div></div>
      <div class="cc-at-envio-lin">
        <span class="cc-at-custo" id="cc-at-modelo-custo">${escapeHtml(custoDoModelo(primeiro))}</span>
        <button type="submit" class="cc-btn cc-at-enviar">Enviar modelo</button>
      </div>
    </form>`;
  return aberto ? form : `<details class="cc-at-modelos-det"><summary>Usar um modelo aprovado</summary>${form}</details>`;
}

function compositor(lead: LeadDetail, mensagens: MensagemChat[], c: CompositorInput | undefined, assistente: string): string {
  const zap = linkWhatsApp(lead.phone);
  const abrirZap = zap ? `<a class="cc-btn cc-btn-sm cc-at-zap" href="${escapeHtml(zap)}" target="_blank" rel="noopener">${icone('wa', 'xs')}Abrir no WhatsApp</a>` : '';
  if (!c) {
    return `<footer class="cc-at-compor" id="responder">
      <div class="cc-at-compor-campo" aria-disabled="true">Responder por aqui não está disponível agora. Responda pelo WhatsApp.</div>
      ${abrirZap}
    </footer>`;
  }
  const agora = c.agora ?? Date.now();
  const res = c.resultado ? RESULTADO_ENVIO[c.resultado] : undefined;
  const banner = res ? aviso({ tom: res.tom === 'ok' ? 'ok' : res.tom === 'erro' ? 'erro' : 'atencao', texto: res.texto }) : '';
  const telefone = normalizeBrazilianPhone(lead.phone ?? '') ?? null;
  const janela = c.via === 'waba' ? janelaAtendimento(ultimaDoCliente(mensagens, c.canal), agora) : null;
  const base = { optOut: !!lead.opt_out, telefone, via: c.via, lgpdBloqueado: !!c.lgpdBloqueado };
  let bloqueioTexto = motivoBloqueio({ ...base, tipo: 'texto', janelaAberta: !!janela?.aberta });
  if (bloqueioTexto === 'sem_canal' && c.semCanalMotivo) bloqueioTexto = c.semCanalMotivo;
  const bloqueioModelo = c.via === 'waba' ? motivoBloqueio({ ...base, tipo: 'modelo', janelaAberta: !!janela?.aberta }) : 'modelo_so_no_oficial';
  const linkZap = zap ? `<a class="cc-link cc-at-zap-link" href="${escapeHtml(zap)}" target="_blank" rel="noopener">${icone('wa', 'xs')}Abrir no WhatsApp</a>` : '';
  const numero = `<span class="cc-at-via">sai pelo ${escapeHtml(rotuloCanal(c.canal, assistente))}</span>${linkZap}`;

  // Nada pode sair (opt-out, sem canal, sem telefone, LGPD): campo desligado com o motivo.
  if (bloqueioTexto && bloqueioTexto !== 'janela_fechada') {
    const link = bloqueioTexto === 'sem_canal' ? ` <a class="cc-link" href="/dashboard/whatsapp">Conectar WhatsApp</a>` : '';
    return `<footer class="cc-at-compor" id="responder">
      ${banner}
      <div class="cc-at-compor-campo cc-at-bloq" aria-disabled="true">${icone('alert', 'xs')}<span>${escapeHtml(TEXTO_BLOQUEIO[bloqueioTexto])}${link}</span></div>
      ${abrirZap}
    </footer>`;
  }

  const faixaJanela = janela
    ? janela.aberta
      ? `<div class="cc-at-janela cc-at-janela-on">${pontoStatus('normal')}<span>Janela aberta até <strong>${escapeHtml(horaDaJanela(janela.ateIso!, agora))}</strong> · resposta livre</span>${numero}</div>`
      : `<div class="cc-at-janela cc-at-janela-off">${icone('alert', 'xs')}<span><strong>Janela fechada</strong> — use um modelo aprovado</span>${numero}</div>`
    : `<div class="cc-at-janela">${numero}</div>`;
  const custo = avisoCusto(c.via, agora);
  const rodape = `<p class="cc-at-nota">Ao enviar, você assume a conversa: a ${escapeHtml(assistente)} fica pausada até você devolver.${custo ? ` <span class="cc-at-custo-aviso">${escapeHtml(custo)}</span>` : ''}</p>`;

  const formTexto = !bloqueioTexto
    ? `<form class="cc-form cc-at-resp" method="POST" action="/dashboard/leads/${escapeHtml(lead.id)}/responder" data-envio>
        <input type="hidden" name="chave" value="${escapeHtml(c.chave)}">
        <textarea name="texto" id="cc-at-texto" rows="2" maxlength="${LIMITE_TEXTO}" required placeholder="Escreva sua resposta…" aria-label="Sua resposta"></textarea>
        <button type="submit" class="cc-btn cc-at-enviar">Enviar</button>
      </form>`
    : '';
  const modelo = bloqueioModelo ? '' : formModelo(lead.id, c, lead.name ?? '', !!bloqueioTexto);

  return `<footer class="cc-at-compor cc-at-compor-on" id="responder">
      ${banner}
      ${faixaJanela}
      ${formTexto}
      ${modelo}
      ${rodape}
    </footer>`;
}

/** Quem está com a conversa + Assumir / Devolver (o MESMO estado do botão do WhatsApp). */
function faixaAssumir(lead: LeadDetail, mensagens: MensagemChat[], assistente: string, assistenteMin: string, podeEditar: boolean): string {
  if (lead.opt_out) return '';
  const id = escapeHtml(lead.id);
  if (lead.eva_active) {
    if (!podeEditar) return '';
    return `<form class="cc-at-assumir" method="POST" action="/dashboard/leads/${id}/pause-eva"><button type="submit" class="cc-btn cc-btn-sm cc-at-btn-assumir" title="A ${escapeHtml(assistenteMin)} para de responder este cliente até você devolver">✋ Assumir</button></form>`;
  }
  const ev = ultimoEventoDeAtendimento(mensagens);
  const quem = ev?.evento === 'assumiu'
    ? `${ev.autorNome || 'Alguém da equipe'} assumiu${horaDe(ev.timestamp) ? ` às ${horaDe(ev.timestamp)}` : ''}`
    : 'Atendimento com a equipe';
  return `<div class="cc-at-assumido" role="status">
      <span class="cc-at-assumido-t">✋ <strong>${escapeHtml(quem)}</strong> · ${escapeHtml(assistente)} pausada até alguém devolver</span>
      ${podeEditar ? `<form method="POST" action="/dashboard/leads/${id}/resume-eva"><button type="submit" class="cc-btn cc-btn-sm cc-at-btn-devolver">↩ Devolver para a ${escapeHtml(assistente)}</button></form>` : ''}
    </div>`;
}

function colunaChat(lead: LeadDetail, mensagens: MensagemChat[], assistente: string, assistenteMin: string, envio: CompositorInput | undefined, donoPessoal: string | null, podeEditar: boolean): string {
  const nome = lead.name ?? 'Sem nome';
  const temArquivos = (lead.anexos ?? []).length > 0;
  const canais = new Set(mensagens.map((m) => m.canal).filter(Boolean));
  const mostrarCanal = canais.size > 1;
  let diaAnterior = '';
  const corpo = mensagens.length === 0
    ? `<div class="cc-at-vazio">${estadoVazio({ tipo: 'vazio', titulo: 'Nenhuma mensagem ainda.', texto: `Quando o cliente escrever no WhatsApp, a conversa aparece aqui.`, compacto: true })}</div>`
    : mensagens.map((m) => {
      let sep = '';
      if (m.timestamp && Number.isFinite(Date.parse(m.timestamp))) {
        const dia = rotuloDia(m.timestamp);
        if (dia !== diaAnterior) { sep = `<div class="cc-at-dia"><span>${escapeHtml(dia)}</span></div>`; diaAnterior = dia; }
      }
      return sep + balao(m, assistente, nome, temArquivos, mostrarCanal, donoPessoal);
    }).join('');

  const desde = lead.created_at && Number.isFinite(Date.parse(lead.created_at)) ? `Lead desde ${diaDe(lead.created_at)}` : '';
  const sub = [formatPhoneBR(lead.phone), [lead.city, lead.uf].filter(Boolean).join('/'), desde].filter(Boolean);
  const eva = lead.opt_out
    ? pilulaStatus('sem_dado', `${assistente}: parou`)
    : lead.eva_active ? pilulaStatus('normal', `${assistente} ativa`) : pilulaStatus('acompanhar', `${assistente} pausada`);
  const canalChip = envio ? `<span class="cc-at-canal cc-at-canal-${escapeHtml(envio.canal)}">${escapeHtml(rotuloCanal(envio.canal, assistente, donoPessoal))}</span>` : '';

  return `<section class="cc-at-col cc-at-chat" id="conversa" aria-label="Conversa">
    <nav class="cc-at-abas-cel" aria-label="Navegação do atendimento">
      <a class="cc-at-voltar" href="/dashboard/leads/conversas" aria-label="Voltar para a lista">${icone('chev', 'sm')}Conversas</a>
      <a class="cc-at-aba cc-at-aba-conversa" href="/dashboard/leads/${escapeHtml(lead.id)}">Conversa</a>
      <a class="cc-at-aba cc-at-aba-resumo" href="#resumo">Resumo</a>
    </nav>
    <header class="cc-at-chat-topo">
      ${avatarAt(lead.name, lead.phone)}
      <div class="cc-at-chat-id">
        <div class="cc-at-chat-nome"><strong>${escapeHtml(nome)}</strong>${pilulaEtapa(lead.status)}${eva}${canalChip}</div>
        <div class="cc-at-chat-sub">${escapeHtml(sub.join(' · '))}</div>
      </div>
      ${lead.eva_active ? faixaAssumir(lead, mensagens, assistente, assistenteMin, podeEditar) : ''}
    </header>
    ${!lead.eva_active ? faixaAssumir(lead, mensagens, assistente, assistenteMin, podeEditar) : ''}
    <div class="cc-at-msgs" id="cc-at-msgs" role="log" aria-label="Mensagens">${corpo}</div>
    ${compositor(lead, mensagens, envio, assistente)}
  </section>`;
}

function chatSemLead(): string {
  return `<section class="cc-at-col cc-at-chat cc-at-chat-vazio" aria-label="Conversa">
    ${estadoVazio({ tipo: 'vazio', titulo: 'Escolha uma conversa', texto: 'Toque num nome da lista para ver a conversa e o resumo do lead.' })}
  </section>`;
}

// ---------------------------------------------------------------------------
// Coluna 3 — cockpit do lead
// ---------------------------------------------------------------------------

const PRIORIDADE_TOM: Record<string, Tom> = { alta: 'critico', media: 'atencao', baixa: 'sem_dado' };
const SLA_TOM: Record<'verde' | 'ambar' | 'vermelho', Tom> = { verde: 'normal', ambar: 'atencao', vermelho: 'critico' };

function fmtPrazo(due_at: string | null): string {
  if (!due_at) return 'sem prazo';
  const data = new Date(due_at).toLocaleString('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const diff = Date.parse(due_at) - Date.now();
  const mins = Math.floor(Math.abs(diff) / 60000);
  const rel = mins < 60 ? `${mins}min` : mins < 1440 ? `${Math.floor(mins / 60)}h` : `${Math.floor(mins / 1440)}d`;
  return diff >= 0 ? `${data} · vence em ${rel}` : `${data} · venceu há ${rel}`;
}

function blocoTarefas(leadId: string, tarefas: Tarefa[]): string {
  const agora = Date.now();
  const lista = tarefas.length === 0
    ? '<p class="cc-at-nada">Nenhuma tarefa pendente.</p>'
    : `<ul class="cc-at-tarefas">${tarefas.map((t) => {
      const selo = seloSla([t], agora);
      return `<li class="cc-at-tarefa">
          ${pontoStatus(SLA_TOM[selo] ?? 'normal')}
          <span class="cc-at-tarefa-txt"><strong>${escapeHtml(t.titulo)}</strong><small>${escapeHtml(fmtPrazo(t.due_at))} ${pilulaStatus(PRIORIDADE_TOM[t.prioridade] ?? 'atencao', t.prioridade)}${t.automatica ? ' <em class="cc-faint">automática</em>' : ''}</small></span>
          <form method="POST" action="/dashboard/leads/${escapeHtml(leadId)}/tarefa/${escapeHtml(t.id)}/concluir"><button type="submit" class="cc-ibtn cc-at-ok" title="Concluir" aria-label="Concluir tarefa">✓</button></form>
          <form method="POST" action="/dashboard/leads/${escapeHtml(leadId)}/tarefa/${escapeHtml(t.id)}/adiar"><button type="submit" class="cc-ibtn" title="Adiar 2 dias" aria-label="Adiar 2 dias">⏭</button></form>
        </li>`;
    }).join('')}</ul>`;
  const nova = `<form class="cc-form cc-at-linha cc-at-linha-tarefa" method="POST" action="/dashboard/leads/${escapeHtml(leadId)}/tarefa">
      <input type="text" name="titulo" required placeholder="+ tarefa (ex.: ligar amanhã)" aria-label="Nova tarefa">
      <input type="datetime-local" name="due_at" aria-label="Prazo">
      <select name="prioridade" aria-label="Prioridade">
        <option value="media">Média</option>
        <option value="alta">Alta</option>
        <option value="baixa">Baixa</option>
      </select>
      <button type="submit" class="cc-ibtn" aria-label="Criar tarefa">${icone('plus', 'sm')}</button>
    </form>`;
  return secao('Próxima ação', `${lista}${nova}`, 'tarefas', tarefas.length ? `${tarefas.length} pendente(s)` : undefined);
}

const TIPO_ICONE: Record<string, string> = {
  proposta_enviada: '📤', proposta_aberta: '👀', etapa_mudou: '➡️', ganho: '🏆', perdido: '❌',
  cadencia: '🔄', nota: '📝', ligacao: '📞', whatsapp: '💬', visita: '📍', contato: '🤝',
  email: '📧', tarefa_criada: '📋', tarefa_concluida: '✅',
};

function blocoLinhaDoTempo(leadId: string, timeline: Atividade[]): string {
  const item = (a: Atividade) => `<li class="cc-at-tl-i"><span class="cc-at-tl-ic" aria-hidden="true">${TIPO_ICONE[a.tipo] ?? '•'}</span>
      <span class="cc-at-tl-txt"><strong>${escapeHtml(a.titulo)}</strong>${a.descricao ? `<span>${escapeHtml(a.descricao)}</span>` : ''}</span>
      <time>${escapeHtml(horaCurta(a.created_at))}</time></li>`;
  const primeiros = timeline.slice(0, 6).map(item).join('');
  const resto = timeline.slice(6);
  const lista = timeline.length === 0
    ? '<p class="cc-at-nada">Sem atividades ainda.</p>'
    : `<ul class="cc-at-tl">${primeiros}</ul>${resto.length ? `<details class="cc-at-det"><summary>ver mais ${resto.length}</summary><ul class="cc-at-tl">${resto.map(item).join('')}</ul></details>` : ''}`;
  const registrar = `<form class="cc-form cc-at-linha" method="POST" action="/dashboard/leads/${escapeHtml(leadId)}/atividade">
      <select name="tipo" aria-label="Tipo de contato">
        <option value="ligacao">📞 Ligação</option>
        <option value="nota">📝 Nota</option>
      </select>
      <input type="text" name="descricao" placeholder="+ registrar contato (o que rolou)" aria-label="O que rolou">
      <button type="submit" class="cc-btn cc-btn-sm">Registrar</button>
    </form>`;
  return secao('Linha do tempo', `${registrar}${lista}`);
}

function blocoArquivos(anexos: LeadDetail['anexos']): string {
  if (!anexos || anexos.length === 0) return '';
  const card = (a: LeadDetail['anexos'][number]) => {
    const mime = (a.mime_type ?? '').toLowerCase();
    const rotulo = a.tipo === 'conta_luz' ? 'Conta de luz' : a.tipo === 'recebido_cliente' ? 'Enviado pelo cliente' : a.tipo;
    const quando = a.created_at ? horaCurta(a.created_at) : '';
    const url = escapeHtml(a.url);
    let prev: string;
    if (!a.url) prev = '<span class="cc-at-anx-prev">indisponível</span>';
    else if (mime.startsWith('image/')) prev = `<a href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="${escapeHtml(rotulo)}" class="cc-at-anx-img" loading="lazy"></a>`;
    else if (mime.startsWith('audio/')) prev = `<span class="cc-at-anx-prev"><audio controls preload="none" src="${url}"></audio></span>`;
    else if (mime.includes('pdf')) prev = `<a class="cc-at-anx-prev" href="${url}" target="_blank" rel="noopener">${icone('file')}<span>PDF</span></a>`;
    else if (mime.startsWith('video/')) prev = `<a class="cc-at-anx-prev" href="${url}" target="_blank" rel="noopener">${icone('eye')}<span>Vídeo</span></a>`;
    else prev = `<a class="cc-at-anx-prev" href="${url}" target="_blank" rel="noopener">${icone('ext')}<span>Arquivo</span></a>`;
    return `<div class="cc-at-anx" title="${escapeHtml(a.descricao ?? '')}">${prev}<small>${escapeHtml(rotulo)}${quando ? ` · ${escapeHtml(quando)}` : ''}</small></div>`;
  };
  return secao(`Arquivos (${anexos.length})`, `<div class="cc-at-anx-grade">${anexos.map(card).join('')}</div>`, 'arquivos');
}

function blocoServicos(servicos: ServicoDoLead[]): string {
  if (servicos.length === 0) return '';
  return secao(`Serviços de campo (${servicos.length})`, `<ul class="cc-at-tl">${servicos.map((s) => `<li class="cc-at-tl-i"><span class="cc-at-tl-ic" aria-hidden="true">🔧</span>
      <span class="cc-at-tl-txt"><a class="cc-link" href="/dashboard/servicos/${escapeHtml(s.id)}">${escapeHtml(s.tipoNome)}</a><span>${escapeHtml(s.dataServico.split('-').reverse().join('/'))}${s.fotos ? ` · ${s.fotos} foto(s)` : ''}${s.videos ? ` · ${s.videos} vídeo(s)` : ''}</span></span></li>`).join('')}</ul>`);
}

function secao(titulo: string, corpo: string, id?: string, dica?: string): string {
  return `<section class="cc-at-sec"${id ? ` id="${id}"` : ''}><h3>${escapeHtml(titulo)}${dica ? ` <small>${escapeHtml(dica)}</small>` : ''}</h3>${corpo}</section>`;
}

const LOSS_REASON_LONGO: Record<string, string> = {
  nao_atende: 'Não atende mais (sumiu)', concorrente: 'Fechou com concorrente',
  sem_orcamento: 'Sem orçamento / momento', fora_area: 'Fora da área de atuação',
  sem_interesse: 'Sem interesse no produto', outro: 'Outro',
};
const CLIENTE_STATUSES = ['contrato_assinado', 'instalado', 'medidor_trocado', 'operando', 'pos_venda_concluido'];

export interface ServicoDoLead { id: string; tipoNome: string; dataServico: string; fotos: number; videos: number }

function colunaCockpit(lead: LeadDetail, servicos: ServicoDoLead[], assistente: string, assistenteMin: string): string {
  const id = escapeHtml(lead.id);
  const perdido = lead.status === 'perdido';
  const jaVenda = CLIENTE_STATUSES.includes(String(lead.installation_status ?? ''));
  const dataVenda = lead.contract_signed_at ? new Date(lead.contract_signed_at).toLocaleDateString('pt-BR', { timeZone: FUSO }) : '';

  // ---- Nome com lápis (form edit-name de sempre, aberto pelo lápis) ----
  const nome = `<div class="cc-at-nome">
      <h2>${escapeHtml(lead.name ?? 'Sem nome')}</h2>
      <details class="cc-at-lapis">
        <summary class="cc-ibtn" title="Editar nome" aria-label="Editar nome">✎</summary>
        <form class="cc-form cc-at-linha" method="POST" action="/dashboard/leads/${id}/edit-name">
          <input type="text" name="name" value="${escapeHtml(lead.name ?? '')}" placeholder="Nome do cliente" aria-label="Nome do cliente">
          <button type="submit" class="cc-btn cc-btn-sm">Salvar</button>
        </form>
      </details>
    </div>`;
  const local = [[lead.city, lead.uf].filter(Boolean).join('/'), lead.neighborhood, rotuloPerfil(lead.profile)].filter(Boolean) as string[];
  const origem = rotuloOrigem(lead.acquisition_source);
  const zap = linkWhatsApp(lead.phone);
  const eva = lead.opt_out
    ? pilulaStatus('sem_dado', `${assistente}: parou`)
    : lead.eva_active ? pilulaStatus('normal', `${assistente} ativa`) : pilulaStatus('acompanhar', `${assistente} pausada`);

  const identidade = `<div class="cc-at-idt">
      ${avatarAt(lead.name, lead.phone, true)}
      <div class="cc-at-idt-txt">
        ${nome}
        <div class="cc-at-idt-sub">${icone('phone', 'xs')}<span>${escapeHtml(formatPhoneBR(lead.phone))}</span></div>
        ${local.length ? `<div class="cc-at-idt-sub">${icone('map', 'xs')}<span>${escapeHtml(local.join(' · '))}</span></div>` : ''}
        <div class="cc-at-pills">${pilulaEtapa(lead.status)}${eva}${lead.archived_at ? pilulaStatus('sem_dado', 'Arquivado') : ''}${origem ? `<span class="cc-at-origem">Origem: ${escapeHtml(origem)}</span>` : ''}</div>
      </div>
    </div>`;

  // ---- As 3 ações do topo: Cadenciar (destaque) · Fechou! (dourado) · ⋯ Mais ----
  const cadenciar = lead.opt_out
    ? `<span class="cc-btn cc-btn-off cc-at-cad" aria-disabled="true" title="O contato pediu para parar">▶ Cadenciar</span>`
    : lead.has_cadence_pending
      ? `<span class="cc-btn cc-btn-off cc-at-cad" aria-disabled="true" title="Já tem lembretes agendados">▶ Cadência ativa</span>`
      : `<form method="POST" action="/dashboard/leads/${id}/start-cadence"><button type="submit" class="cc-btn cc-at-cad">▶ Cadenciar</button></form>`;
  const fechou = jaVenda
    ? pilulaStatus('normal', `Venda registrada${dataVenda ? ` em ${dataVenda}` : ''}`)
    : `<button type="button" class="cc-btn cc-btn-gold" onclick="document.getElementById('modal-fechou').classList.remove('hidden')">✅ Fechou!</button>`;
  const itensMais = [
    // Pausar/Retomar subiu para o topo do chat: "✋ Assumir" / "↩ Devolver" (Parte 2).
    `<a class="cc-btn" href="/dashboard/propostas/novo?lead_id=${id}">📄 Nova proposta</a>`,
    `<a class="cc-btn" href="/dashboard/leads/${id}/contrato-form?tipo=fv">📝 Fazer contrato</a>`,
    lead.has_cadence_pending
      ? `<form method="POST" action="/dashboard/leads/${id}/cancel-cadence" onsubmit="return confirm('Cancelar todos os toques pendentes?')"><button type="submit" class="cc-btn">⏹ Parar cadência</button></form>`
      : '',
    '<div class="cc-mais-sep"></div>',
    perdido
      ? `<form method="POST" action="/dashboard/leads/${id}/unmark-lost" onsubmit="return confirm('Reverter status de Perdido para Qualificando?')"><button type="submit" class="cc-btn">↩️ Reabrir lead</button></form>`
      : `<button type="button" onclick="document.getElementById('modal-marcar-perdido').classList.remove('hidden')" class="cc-btn">❌ Marcar perdido</button>`,
    lead.archived_at
      ? `<form method="POST" action="/dashboard/leads/${id}/desarquivar"><button type="submit" class="cc-btn">↩️ Restaurar lead</button></form>`
      : `<form method="POST" action="/dashboard/leads/${id}/arquivar" onsubmit="return confirm('Arquivar este lead? Sai da lista ativa, mas o historico fica intacto e da pra restaurar a qualquer hora.')"><button type="submit" class="cc-btn">📦 Arquivar</button></form>`,
    !lead.opt_out
      ? `<form method="POST" action="/dashboard/leads/${id}/opt-out" onsubmit="return confirm('Marcar que esse contato pediu pra parar? A Eva nunca mais conversa com ele.')"><button type="submit" class="cc-btn">🚪 Pediu pra parar</button></form>`
      : `<form method="POST" action="/dashboard/leads/${id}/opt-in"><button type="submit" class="cc-btn">↩️ Voltar a receber</button></form>`,
    `<form method="POST" action="/dashboard/leads/${id}/delete" onsubmit="return confirm('REMOVER PERMANENTEMENTE este lead? Esta acao nao pode ser desfeita.')"><button type="submit" class="cc-btn cc-btn-crit">🗑️ Excluir lead</button></form>`,
  ].filter(Boolean).join('');
  const acoes = `<div class="cc-at-acoes">${cadenciar}${fechou}${menuAcoes({ rotulo: '⋯ Mais', itensHtml: itensMais, alinhar: 'dir' })}</div><!-- /acoes -->`;

  // ---- Avisos ----
  const perdidoBanner = perdido && lead.loss_reason
    ? `<div class="cc-aviso cc-aviso-erro" role="status">${icone('alert', 'sm')}<div><strong>Lead perdido</strong> — ${escapeHtml(LOSS_REASON_LONGO[lead.loss_reason] ?? lead.loss_reason)}${lead.loss_notes ? `<div class="cc-muted">"${escapeHtml(lead.loss_notes)}"</div>` : ''}${lead.lost_at ? `<div class="cc-faint">${escapeHtml(new Date(lead.lost_at).toLocaleString('pt-BR', { timeZone: FUSO }))}</div>` : ''}</div></div>`
    : '';
  const proximoToque = lead.cadence_steps.find((c) => c.status === 'pending');
  const cadencia = lead.has_cadence_pending && proximoToque
    ? `<p class="cc-at-cad-info">${icone('bell', 'xs')}Cadência ativa · toque ${escapeHtml(String(proximoToque.step))} em ${escapeHtml(new Date(proximoToque.scheduled_for).toLocaleString('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))}</p>`
    : '';

  // ---- Resumo: dados em português + interesses ----
  const dados = dadosDoLead(lead);
  const interesses = interessesDoLead(lead.opportunities);
  const resumo = secao('Resumo', `${dados.length
    ? `<dl class="cc-at-dados">${dados.map((d) => `<div><dt>${escapeHtml(d.rotulo)}</dt><dd>${escapeHtml(d.valor)}</dd></div>`).join('')}</dl>`
    : '<p class="cc-at-nada">Ainda sem dados de consumo. Peça a conta de luz.</p>'}
    ${interesses.length ? `<div class="cc-at-int"><span class="cc-at-int-t">Interesses</span>${interesses.map((i) => `<span class="cc-at-tag">${escapeHtml(i)}</span>`).join('')}</div>` : ''}
    ${lead.email ? `<p class="cc-at-email">${icone('mail', 'xs')}<span>${escapeHtml(lead.email)}</span></p>` : ''}`);

  const contato = `<div class="cc-at-contato">
      ${zap ? `<a class="cc-btn cc-btn-sm cc-at-zap" href="${escapeHtml(zap)}" target="_blank" rel="noopener">${icone('wa', 'xs')}WhatsApp</a>` : ''}
      ${normalizeBrazilianPhone(lead.phone) ? `<a class="cc-btn cc-btn-sm" href="tel:+${escapeHtml(normalizeBrazilianPhone(lead.phone) ?? '')}">Ligar</a>` : ''}
      ${lead.email ? `<a class="cc-btn cc-btn-sm" href="mailto:${escapeHtml(lead.email)}">E-mail</a>` : ''}
    </div>`;

  // No celular o cockpit é a aba "Resumo": estas abas levam de volta ao chat.
  const abasCel = `<nav class="cc-at-abas-voltar" aria-label="Navegação do atendimento">
      <a href="/dashboard/leads/conversas">Conversas</a>
      <a href="/dashboard/leads/${id}">Conversa</a>
      <a class="cc-on" href="#resumo" aria-current="true">Resumo</a>
    </nav>`;

  return `<aside class="cc-at-col cc-at-cockpit" id="resumo" aria-label="Cockpit do lead">
    <div class="cc-at-alca cc-at-alca-r" data-lado="r" role="separator" aria-orientation="vertical" aria-label="Arrastar para mudar a largura do resumo do lead" tabindex="0"></div>
    ${abasCel}
    ${identidade}
    ${acoes}
    ${perdidoBanner}
    ${cadencia}
    ${resumo}
    ${blocoTarefas(lead.id, lead.tarefas)}
    ${blocoLinhaDoTempo(lead.id, lead.timeline)}
    ${blocoArquivos(lead.anexos)}
    ${blocoServicos(servicos)}
    ${contato}
  </aside>`;
}

function cockpitSemLead(): string {
  return `<aside class="cc-at-col cc-at-cockpit cc-at-cockpit-vazio" aria-label="Cockpit do lead"><div class="cc-at-alca cc-at-alca-r" data-lado="r" role="separator" aria-orientation="vertical" aria-label="Arrastar para mudar a largura do resumo do lead" tabindex="0"></div><p class="cc-at-nada">O resumo do lead aparece aqui.</p></aside>`;
}

// ---------------------------------------------------------------------------
// Janelinhas (modais) — mesmos forms de sempre
// ---------------------------------------------------------------------------

function modalFechou(lead: LeadDetail): string {
  const hoje = new Date().toLocaleDateString('en-CA', { timeZone: FUSO });
  const id = escapeHtml(lead.id);
  return `
    <div id="modal-fechou" class="cc-modal hidden" onclick="if(event.target===this)this.classList.add('hidden')">
      <div class="cc-modal-caixa" role="dialog" aria-modal="true" aria-labelledby="modal-fechou-t">
        <div class="cc-row">
          <div class="cc-sp"><h3 id="modal-fechou-t">✅ Fechou! Registrar a venda</h3>
            <p class="cc-hint">O lead vira venda no funil. O contrato é feito depois, na Central.</p></div>
          <button type="button" onclick="document.getElementById('modal-fechou').classList.add('hidden')" class="cc-ibtn" aria-label="Fechar">×</button>
        </div>
        <form class="cc-form cc-f-coluna" method="POST" action="/dashboard/leads/${id}/fechou">
          <label class="cc-campo"><span>Tipo</span>
            <select name="tipo">
              <option value="sistema">🔆 Sistema</option>
              <option value="servico">🔧 Serviço</option>
            </select></label>
          <label class="cc-campo"><span>Valor (R$)</span>
            <input name="valor" type="number" step="0.01" min="0" placeholder="opcional"></label>
          <label class="cc-campo"><span>Data</span>
            <input name="data" type="date" value="${escapeHtml(hoje)}"></label>
          <div class="cc-row cc-modal-bot">
            <a class="cc-link" href="/dashboard/leads/${id}/contrato-form?tipo=fv">Fazer contrato →</a>
            <span class="cc-sp"></span>
            <button type="button" onclick="document.getElementById('modal-fechou').classList.add('hidden')" class="cc-btn cc-btn-ghost">Cancelar</button>
            <button type="submit" class="cc-btn cc-at-cad">Registrar venda</button>
          </div>
        </form>
      </div>
    </div>`;
}

function modalPerdido(lead: LeadDetail, assistente: string): string {
  return `
    <div id="modal-marcar-perdido" class="cc-modal hidden" onclick="if(event.target===this)this.classList.add('hidden')">
      <div class="cc-modal-caixa" role="dialog" aria-modal="true" aria-labelledby="modal-perdido-t">
        <div class="cc-row">
          <div class="cc-sp"><h3 id="modal-perdido-t">Marcar lead como perdido</h3>
            <p class="cc-hint">Lead sai do funil ativo. ${escapeHtml(assistente)} é pausada. Reversível.</p></div>
          <button type="button" onclick="document.getElementById('modal-marcar-perdido').classList.add('hidden')" class="cc-ibtn" aria-label="Fechar">×</button>
        </div>
        <form class="cc-form cc-f-coluna" method="POST" action="/dashboard/leads/${escapeHtml(lead.id)}/mark-lost">
          <label class="cc-campo"><span>Motivo *</span>
            <select name="reason" required>
              <option value="">Selecione...</option>
              <option value="nao_atende">Não atende mais (sumiu)</option>
              <option value="concorrente">Fechou com concorrente</option>
              <option value="sem_orcamento">Sem orçamento / momento</option>
              <option value="fora_area">Fora da área de atuação</option>
              <option value="sem_interesse">Sem interesse no produto</option>
              <option value="outro">Outro (descreva abaixo)</option>
            </select></label>
          <label class="cc-campo"><span>Observação (opcional)</span>
            <textarea name="notes" rows="3" placeholder="Ex: cliente recebeu proposta 15% mais barata"></textarea></label>
          <div class="cc-row cc-modal-bot">
            <span class="cc-sp"></span>
            <button type="button" onclick="document.getElementById('modal-marcar-perdido').classList.add('hidden')" class="cc-btn cc-btn-ghost">Cancelar</button>
            <button type="submit" class="cc-btn cc-btn-crit">Confirmar perda</button>
          </div>
        </form>
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export interface AtendimentoInput {
  user: DashUser | undefined;
  lista: ListaConversas;
  filtros: FiltrosConversa;
  /** Lead aberto (null = só a lista). */
  lead: LeadDetail | null;
  /** Mensagens do lead aberto (todas as linhas da conversa, em ordem). */
  mensagens?: MensagemChat[];
  servicos?: ServicoDoLead[];
  /** Parte 2: responder pelo painel. Ausente = só "Abrir no WhatsApp". */
  envio?: CompositorInput;
  /** Parte 2b: nome do dono do número pessoal (só quando quem vê é o dono). */
  donoPessoal?: string | null;
}

export function renderAtendimentoPage(p: AtendimentoInput): string {
  const ehTenant = !!p.user && p.user.companyId !== ECOSUN_COMPANY_ID;
  const assistente = ehTenant ? 'Assistente' : 'Eva';
  const assistenteMin = ehTenant ? 'assistente' : 'Eva';
  const lead = p.lead;
  const mensagens = p.mensagens ?? lead?.conversation_messages?.map((m) => ({ role: m.role, content: m.content, timestamp: m.timestamp ?? null })) ?? [];

  const k = p.lista.contagem;
  const visao = `<div class="cc-chips">${chip({ rotulo: 'Conversas', href: '/dashboard/leads/conversas', ativo: true })}${chip({ rotulo: 'Lista', href: '/dashboard/leads' })}${chip({ rotulo: 'Quadro', href: '/dashboard/leads/kanban' })}</div>`;
  const cabecalho = cabecalhoPagina({
    trilha: [{ rotulo: 'Comercial' }, { rotulo: 'Leads', href: '/dashboard/leads' }, { rotulo: 'Conversas' }],
    titulo: 'Conversas',
    subtitulo: `${k.todas} conversa(s) · ${k.aguardando} aguardando resposta`,
    acoesHtml: visao,
  });

  const body = `<div class="cc-root cc-at${lead ? ' cc-at-com-lead' : ''}">
    ${cabecalho}
    <div class="cc-at-grade">
      ${colunaLista(p.lista, p.filtros, lead?.id ?? null, assistente)}
      ${lead ? colunaChat(lead, mensagens, assistente, assistenteMin, p.envio, p.donoPessoal ?? null, can(p.user, 'leads', 'editar')) : chatSemLead()}
      ${lead ? colunaCockpit(lead, p.servicos ?? [], assistente, assistenteMin) : cockpitSemLead()}
    </div>
    ${lead && !CLIENTE_STATUSES.includes(String(lead.installation_status ?? '')) ? modalFechou(lead) : ''}
    ${lead && lead.status !== 'perdido' ? modalPerdido(lead, assistente) : ''}
  </div>
  <style>${CSS_ATENDIMENTO}</style>`;

  // Alças das colunas (sempre) + rolar o chat até a última mensagem (com lead).
  const script = `<script>${SCRIPT_COLUNAS}</script>` + (lead ? `<script>(function(){function fim(){var c=document.getElementById('cc-at-msgs');if(c){c.scrollTop=c.scrollHeight;}}fim();window.addEventListener('load',fim);})();</script>` : '')
    + (lead && p.envio ? `<script>${SCRIPT_RESPONDER}</script>` : '');

  const titulo = lead ? `Conversa: ${lead.name ?? 'Sem nome'}` : 'Conversas';
  return renderLayout({ active: 'conversas', title: titulo, body: body + script, user: p.user, tailwind: false, dark: temaDaTela(p.user, 'escuro') === 'escuro', largo: true });
}

/**
 * Arrastar as bordas das colunas (lista à esquerda, resumo à direita).
 * Largura guardada no navegador ('cc-at-larguras'); duplo clique volta ao
 * padrão; setas do teclado ajustam de 20 em 20 px. Sem armazenamento → só não lembra.
 */
const SCRIPT_COLUNAS = `(function(){
var g=document.querySelector('.cc-at-grade');if(!g)return;
var CHAVE='cc-at-larguras',LIM={l:[240,560],r:[260,560]};
function ler(){try{return JSON.parse(localStorage.getItem(CHAVE)||'{}')||{};}catch(e){return {};}}
function gravar(v){try{localStorage.setItem(CHAVE,JSON.stringify(v));}catch(e){}}
var w=ler();
function aplicar(){['l','r'].forEach(function(k){if(w[k])g.style.setProperty('--at-'+k,w[k]+'px');else g.style.removeProperty('--at-'+k);});}
function limitar(k,v){return Math.max(LIM[k][0],Math.min(LIM[k][1],Math.round(v)));}
aplicar();
g.querySelectorAll('.cc-at-alca').forEach(function(a){
  var k=a.getAttribute('data-lado'),col=a.parentElement;
  a.addEventListener('pointerdown',function(ev){
    ev.preventDefault();var x0=ev.clientX,l0=col.getBoundingClientRect().width;
    a.setPointerCapture(ev.pointerId);document.body.classList.add('cc-at-arrastando');
    function mover(e){var d=e.clientX-x0;w[k]=limitar(k,k==='l'?l0+d:l0-d);aplicar();}
    function soltar(){a.removeEventListener('pointermove',mover);a.removeEventListener('pointerup',soltar);a.removeEventListener('pointercancel',soltar);document.body.classList.remove('cc-at-arrastando');gravar(w);}
    a.addEventListener('pointermove',mover);a.addEventListener('pointerup',soltar);a.addEventListener('pointercancel',soltar);
  });
  a.addEventListener('dblclick',function(){delete w[k];aplicar();gravar(w);});
  a.addEventListener('keydown',function(e){
    if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;e.preventDefault();
    var atual=w[k]||col.getBoundingClientRect().width,passo=e.key==='ArrowRight'?20:-20;
    w[k]=limitar(k,k==='l'?atual+passo:atual-passo);aplicar();gravar(w);
  });
});
})();`;

/**
 * Responder (Parte 2): (1) o botão Enviar trava no 1º clique — o 2º nem sai do
 * navegador (o servidor também barra pela chave); (2) a prévia do modelo
 * acompanha o modelo e o nome (textContent: nada vira HTML).
 */
const SCRIPT_RESPONDER = `(function(){
document.querySelectorAll('form[data-envio]').forEach(function(f){
  f.addEventListener('submit',function(){var b=f.querySelector('button[type=submit]');if(b){if(b.disabled)return;setTimeout(function(){b.disabled=true;b.textContent='Enviando…';},0);}});
});
var sel=document.getElementById('cc-at-modelo-sel'),nome=document.getElementById('cc-at-modelo-nome'),prev=document.getElementById('cc-at-previa'),custo=document.getElementById('cc-at-modelo-custo');
function atualizar(){if(!sel||!prev)return;var o=sel.options[sel.selectedIndex];if(!o)return;var n=(nome&&nome.value.trim())||'tudo bem';var t=o.getAttribute('data-texto')||'';prev.textContent=t?t.split('{nome}').join(n):'O texto deste modelo está na Meta (nome: '+n+').';if(custo)custo.textContent=o.getAttribute('data-custo')||'';}
if(sel)sel.addEventListener('change',atualizar);if(nome)nome.addEventListener('input',atualizar);
var t=document.getElementById('cc-at-texto');if(t)t.addEventListener('keydown',function(e){if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();var f=t.form;if(f){if(f.requestSubmit)f.requestSubmit();else f.submit();}}});
})();`;

/** CSS só do Atendimento (tokens cc- → funciona nos dois temas). */
export const CSS_ATENDIMENTO = `
.cc-at .cc-top{margin-bottom:14px}
.cc-at .cc-root h1,.cc-at h1{font-size:24px}
.cc-at-grade{display:grid;grid-template-columns:var(--at-l,minmax(300px,360px)) minmax(0,1fr) var(--at-r,minmax(300px,340px));gap:12px;height:calc(100vh - 168px);min-height:560px}
.cc-at-col{min-width:0;min-height:0;display:flex;flex-direction:column;background:linear-gradient(180deg,var(--cc-panel-top) 0%,var(--cc-panel-bot) 100%);border:1px solid var(--cc-line);border-radius:var(--cc-r);overflow:hidden}
/* alças de arrastar entre as colunas (só no computador) */
.cc-at-lista,.cc-at-cockpit{position:relative}
.cc-at-alca{position:absolute;top:0;bottom:0;width:10px;z-index:3;cursor:col-resize;touch-action:none;outline:none}
.cc-at-alca::after{content:"";position:absolute;top:50%;left:4px;width:2px;height:42px;margin-top:-21px;border-radius:2px;background:var(--cc-line-2);opacity:.6;transition:opacity .15s,background .15s}
.cc-at-alca:hover::after,.cc-at-alca:focus-visible::after,.cc-at-arrastando .cc-at-alca::after{opacity:1;background:var(--cc-gold-2)}
.cc-at-alca-l{right:0}
.cc-at-alca-r{left:0}
.cc-at-arrastando{cursor:col-resize;user-select:none}
/* lista */
.cc-at-lista-topo{padding:12px;border-bottom:1px solid var(--cc-line);display:flex;flex-direction:column;gap:8px}
.cc-at-busca{display:flex;gap:6px}
.cc-at-busca input[type=search]{flex:1;min-width:0}
.cc-at-chips{flex-wrap:wrap;gap:6px}
.cc-at-chips .cc-chip{min-height:26px;padding:3px 9px;font-size:12px}
.cc-at-itens{flex:1;overflow-y:auto;padding:6px}
.cc-at-item{display:flex;gap:10px;padding:10px;border-radius:12px;border:1px solid transparent}
.cc-at-item:hover{background:var(--cc-surface-2)}
.cc-at-item.cc-on{background:var(--cc-surface-3);border-color:rgba(251,191,36,.35)}
.cc-at-item-txt{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.cc-at-l1{display:flex;align-items:baseline;gap:8px}
.cc-at-l1 strong{flex:1;min-width:0;font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cc-at-l1 time,.cc-at-tl-i time{font-size:11px;color:var(--cc-faint);flex:none;font-family:var(--cc-f-num)}
.cc-at-l2{display:flex;align-items:center;gap:8px}
.cc-at-prev{flex:1;min-width:0;font-size:12.5px;color:var(--cc-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cc-at-espera{width:10px;height:10px;border-radius:50%;background:var(--cc-ok);flex:none;box-shadow:0 0 0 3px var(--cc-ok-soft)}
.cc-at-l3{display:flex;flex-wrap:wrap;gap:4px}
.cc-at-l3 .cc-pill{font-size:10.5px;padding:1px 7px}
.cc-at-canal{font-size:10.5px;color:var(--cc-info);border:1px solid rgba(56,189,248,.35);border-radius:99px;padding:0 7px}
/* avatar */
.cc-at-av{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;flex:none;font-family:var(--cc-f-num);font-weight:700;font-size:16px;color:#0A1729}
.cc-at-av-g{width:64px;height:64px;font-size:26px}
.cc-at-av-0{background:linear-gradient(135deg,#fbbf24,#F0A500)} .cc-at-av-1{background:linear-gradient(135deg,#7dd3fc,#38BDF8)}
.cc-at-av-2{background:linear-gradient(135deg,#86efac,#3DBB6E)} .cc-at-av-3{background:linear-gradient(135deg,#c4b5fd,#a78bfa)}
.cc-at-av-4{background:linear-gradient(135deg,#fda4af,#E4574B)} .cc-at-av-5{background:linear-gradient(135deg,#fdba74,#F2862E)}
/* chat */
.cc-at-abas-cel{display:none}
.cc-at-chat-topo{display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--cc-line)}
.cc-at-chat-id{flex:1;min-width:0}
.cc-at-chat-nome{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.cc-at-chat-nome strong{font-family:var(--cc-f-num);font-size:18px;font-weight:700;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cc-at-chat-sub{font-size:12.5px;color:var(--cc-muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cc-at-msgs{flex:1;overflow-y:auto;padding:16px 18px;display:flex;flex-direction:column;gap:8px;background:radial-gradient(600px 300px at 50% 0%,rgba(56,189,248,.04),transparent 70%)}
.cc-at-dia{align-self:center;margin:8px 0}
.cc-at-dia span{font-size:11.5px;color:var(--cc-text-2);background:var(--cc-surface-3);border:1px solid var(--cc-line-2);padding:3px 12px;border-radius:99px}
.cc-at-msg{max-width:78%;padding:8px 12px 6px;border-radius:14px;border:1px solid var(--cc-line-2)}
.cc-at-msg-cli{align-self:flex-start;background:var(--cc-surface-3);border-top-left-radius:4px}
.cc-at-msg-eva{align-self:flex-end;background:rgba(61,187,110,.16);border-color:rgba(61,187,110,.35);border-top-right-radius:4px}
.cc-at-msg-q{font-size:11px;font-weight:700;color:var(--cc-muted);margin-bottom:2px}
.cc-at-msg-eva .cc-at-msg-q{color:var(--cc-ok)}
.cc-at-msg-t{font-size:14px;white-space:pre-wrap;word-break:break-word;color:var(--cc-text)}
.cc-at-msg-h{font-size:10.5px;color:var(--cc-faint);text-align:right;margin-top:2px;font-family:var(--cc-f-num)}
.cc-at-midia{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;padding:3px 9px;border-radius:8px;background:var(--cc-info-soft);color:var(--cc-text);margin-bottom:4px}
.cc-at-det summary{cursor:pointer;font-size:12px;color:var(--cc-muted);margin-top:4px}
.cc-at-compor{display:flex;align-items:center;gap:8px;padding:12px 14px;border-top:1px solid var(--cc-line)}
.cc-at-compor-campo{flex:1;min-width:0;min-height:40px;display:flex;align-items:center;padding:0 14px;border-radius:12px;border:1px dashed var(--cc-line-2);color:var(--cc-faint);font-size:13px}
.cc-at-zap{background:rgba(61,187,110,.18);border-color:rgba(61,187,110,.45)}
.cc-at-chat-topo .cc-at-assumir{margin:0;flex:none}
.cc-btn.cc-at-btn-assumir{background:var(--cc-gold-soft);border-color:rgba(251,191,36,.55);color:var(--cc-gold-2);font-weight:700}
.cc-at-assumido{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:8px 16px;border-bottom:1px solid var(--cc-line);background:var(--cc-gold-soft)}
.cc-at-assumido-t{flex:1;min-width:0;font-size:13px;color:var(--cc-text-2)}
.cc-at-assumido-t strong{color:var(--cc-gold-2)}
.cc-at-assumido form{margin:0}
.cc-btn.cc-at-btn-devolver{border-color:rgba(61,187,110,.5);color:var(--cc-ok);font-weight:700}
.cc-at-evento{align-self:center;font-size:12px;color:var(--cc-text-2);background:var(--cc-surface-2);border:1px dashed var(--cc-line-2);padding:4px 12px;border-radius:99px;margin:4px 0;text-align:center}
.cc-at-evento-assumiu{border-color:rgba(251,191,36,.5);color:var(--cc-gold-2)}
.cc-at-evento-devolveu{border-color:rgba(61,187,110,.45);color:var(--cc-ok)}
.cc-at-msg-hum{background:var(--cc-info-soft);border-color:rgba(56,189,248,.45)}
.cc-at-msg-hum .cc-at-msg-q{color:var(--cc-info)}
.cc-at-msg-canal{margin-left:6px;font-weight:600;font-size:10.5px;color:var(--cc-muted)}
.cc-at-msg-falha{font-size:12px;color:var(--cc-crit);margin-top:4px;font-weight:600}
.cc-at-compor-on{flex-direction:column;align-items:stretch;gap:6px;padding:10px 14px}
.cc-at-compor .cc-aviso{margin:0}
.cc-at-janela{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12.5px;color:var(--cc-text-2)}
.cc-at-janela-on strong{color:var(--cc-ok)}
.cc-at-janela-off strong{color:var(--cc-warn)}
.cc-at-janela-off svg{color:var(--cc-warn)}
.cc-at-via{margin-left:auto;font-size:11.5px;color:var(--cc-muted)}
.cc-at-zap-link{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:600;color:var(--cc-ok)}
.cc-at-resp{display:flex;gap:8px;align-items:flex-end;margin:0}
.cc-at-resp textarea{flex:1;min-width:0;min-height:44px;max-height:180px;resize:vertical;border-radius:12px;font:inherit;font-size:14px}
.cc-btn.cc-at-enviar{background:linear-gradient(180deg,#3DBB6E,#2a9a57);color:#fff;border-color:transparent;height:44px;padding:0 18px;font-weight:700;flex:none}
.cc-btn.cc-at-enviar:disabled{opacity:.6;cursor:wait}
.cc-at-modelos-det>summary{cursor:pointer;font-size:12.5px;color:var(--cc-info);font-weight:600}
.cc-at-modelo{display:flex;flex-direction:column;gap:8px;margin:6px 0 0}
.cc-at-modelo-lin{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:8px}
.cc-at-modelo select,.cc-at-modelo input{width:100%}
.cc-at-previa{padding:10px 12px;border-radius:12px;background:rgba(61,187,110,.10);border:1px solid rgba(61,187,110,.3);font-size:13.5px;white-space:pre-wrap;word-break:break-word;color:var(--cc-text)}
.cc-at-previa-t{display:block;font-size:11px;color:var(--cc-muted);margin-bottom:3px}
.cc-at-envio-lin{display:flex;align-items:center;gap:8px;justify-content:flex-end}
.cc-at-custo{font-size:12px;color:var(--cc-muted);margin-right:auto}
.cc-at-nota{margin:0;font-size:11px;color:var(--cc-faint);line-height:1.35}
.cc-at-custo-aviso{color:var(--cc-muted)}
.cc-at-bloq{gap:8px;color:var(--cc-text-2);border-style:solid}
.cc-at-canal-whatsapp_business{color:var(--cc-gold-2);border-color:rgba(251,191,36,.45)}
.cc-at-vazio,.cc-at-chat-vazio{justify-content:center}
.cc-at-chat-vazio .cc-empty,.cc-at-vazio{margin:auto;max-width:360px;text-align:center}
/* cockpit */
.cc-at-cockpit{overflow-y:auto;padding:16px;gap:14px;scroll-margin-top:84px}
.cc-at-cockpit-vazio{justify-content:center;align-items:center}
.cc-at-idt{display:flex;gap:14px;align-items:flex-start}
.cc-at-idt-txt{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
.cc-at-nome{display:flex;align-items:center;gap:6px}
.cc-at-nome h2{font-size:20px;font-weight:700;line-height:1.2;min-width:0;overflow-wrap:anywhere}
.cc-at-lapis{position:relative}
.cc-at-lapis>summary{list-style:none;width:28px;height:28px;font-size:14px}
.cc-at-lapis>summary::-webkit-details-marker{display:none}
.cc-at-lapis[open]>form{position:absolute;z-index:20;top:34px;left:-140px;width:280px;padding:10px;border-radius:12px;background:var(--cc-surface-2);border:1px solid var(--cc-line-2);box-shadow:0 14px 34px rgba(0,0,0,.35)}
.cc-at-idt-sub{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--cc-text-2)}
.cc-at-idt-sub svg{color:var(--cc-faint)}
.cc-at-pills{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:4px}
.cc-at-origem{font-size:12px;color:var(--cc-muted)}
.cc-at-acoes{display:flex;gap:8px;align-items:center}
.cc-at-acoes>form,.cc-at-acoes>.cc-btn,.cc-at-acoes>button{flex:1 1 0;min-width:0}
.cc-at-acoes form{margin:0}
.cc-at-acoes .cc-btn{width:100%;justify-content:center;height:40px}
.cc-at-acoes>.cc-pill{flex:1 1 0;justify-content:center;text-align:center}
.cc-at-acoes .cc-mais>summary{height:40px}
.cc-at-acoes .cc-mais-menu .cc-btn{justify-content:flex-start;height:36px}
.cc-btn.cc-at-cad{background:linear-gradient(180deg,#38BDF8,#0284c7);color:#fff;border-color:transparent;box-shadow:0 6px 18px rgba(56,189,248,.25)}
.cc-btn.cc-at-cad.cc-btn-off{background:var(--cc-surface-2);color:var(--cc-muted);box-shadow:none;border-color:var(--cc-line-2)}
.cc-at-cad-info{display:flex;align-items:center;gap:6px;margin:0;font-size:12.5px;color:var(--cc-info)}
.cc-mais-sep{height:1px;background:var(--cc-line-2);margin:2px 0}
.cc-at-sec{border-top:1px solid var(--cc-line);padding-top:12px}
.cc-at-sec h3{font-size:14px;font-weight:700;margin:0 0 10px;display:flex;align-items:baseline;gap:8px}
.cc-at-sec h3 small{font-family:var(--cc-f-text);font-size:11.5px;font-weight:500;color:var(--cc-muted)}
.cc-at-dados{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0}
.cc-at-dados>div{padding:9px 11px;border-radius:10px;background:var(--cc-surface-2);border:1px solid var(--cc-line);min-width:0}
.cc-at-dados dt{font-size:11px;color:var(--cc-muted);margin:0}
.cc-at-dados dd{margin:2px 0 0;font-family:var(--cc-f-num);font-size:15px;font-weight:600;color:var(--cc-text);overflow-wrap:anywhere}
.cc-at-int{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:10px}
.cc-at-int-t{font-size:11.5px;color:var(--cc-muted);margin-right:2px}
.cc-at-tag{font-size:12px;padding:3px 10px;border-radius:99px;background:rgba(167,139,250,.16);border:1px solid rgba(167,139,250,.4);color:var(--cc-text)}
.cc-at-email{display:flex;align-items:center;gap:6px;margin:10px 0 0;font-size:12.5px;color:var(--cc-text-2)}
.cc-at-nada{margin:0;font-size:13px;color:var(--cc-muted)}
.cc-at-linha{display:flex;gap:6px;align-items:center;margin-top:8px;flex-wrap:wrap}
.cc-at-linha input[type=text]{flex:1 1 140px;min-width:0}
.cc-at-linha input[type=datetime-local]{flex:0 1 150px;min-width:0}
.cc-at-linha select{flex:0 0 auto}
.cc-at-linha-tarefa input[type=text]{flex-basis:100%}
.cc-at-linha-tarefa input[type=datetime-local]{flex:1 1 150px}
.cc-at-linha .cc-ibtn,.cc-at-linha .cc-btn{flex:none}
.cc-at-tarefas{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.cc-at-tarefa{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;border:1px solid var(--cc-line)}
.cc-at-tarefa form{margin:0}
.cc-at-tarefa .cc-ibtn{width:30px;height:30px;font-size:14px}
.cc-at-ok{color:var(--cc-ok)}
.cc-at-tarefa-txt{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.cc-at-tarefa-txt strong{font-size:13px;font-weight:600}
.cc-at-tarefa-txt small{font-size:11.5px;color:var(--cc-muted);display:flex;flex-wrap:wrap;gap:4px;align-items:center}
.cc-at-tl{list-style:none;margin:8px 0 0;padding:0}
.cc-at-tl-i{display:flex;gap:10px;align-items:flex-start;padding:7px 0;border-bottom:1px solid var(--cc-line)}
.cc-at-tl-i:last-child{border-bottom:0}
.cc-at-tl-ic{width:24px;height:24px;border-radius:7px;display:grid;place-items:center;background:var(--cc-surface-3);flex:none;font-size:12px}
.cc-at-tl-txt{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;font-size:12.5px}
.cc-at-tl-txt strong{font-weight:600}
.cc-at-tl-txt span{color:var(--cc-text-2)}
.cc-at-anx-grade{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px}
.cc-at-anx{min-width:0;display:flex;flex-direction:column;gap:4px}
.cc-at-anx small{font-size:11px;color:var(--cc-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cc-at-anx-img,.cc-at-anx-prev{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;aspect-ratio:1;width:100%;border-radius:10px;border:1px solid var(--cc-line);background:var(--cc-surface-2);object-fit:cover;font-size:12px;color:var(--cc-text-2)}
.cc-at-anx-prev audio{width:100%}
.cc-at-contato{display:flex;gap:8px;border-top:1px solid var(--cc-line);padding-top:12px;margin-top:auto}
.cc-at-contato .cc-btn{flex:1;justify-content:center}
/* janelinhas */
.cc-modal{position:fixed;inset:0;z-index:50;background:rgba(2,6,23,.6);display:flex;align-items:center;justify-content:center;padding:16px}
.cc-modal.hidden{display:none}
.cc-modal-caixa{width:100%;max-width:460px;background:var(--cc-surface);border:1px solid var(--cc-line-2);border-radius:16px;padding:20px;box-shadow:0 20px 50px rgba(0,0,0,.4)}
.cc-modal-caixa h3{font-size:17px;font-weight:700}
.cc-modal-caixa .cc-hint{margin:4px 0 14px;font-size:13px;color:var(--cc-muted)}
.cc-modal-caixa select,.cc-modal-caixa textarea,.cc-modal-caixa input{width:100%}
.cc-f-coluna{display:flex;flex-direction:column;gap:12px}
.cc-modal-bot{margin-top:4px;gap:8px;flex-wrap:wrap}
/* telas médias: com lead aberto, a lista dá lugar ao chat + cockpit */
@media (max-width:1279px){
  .cc-at-com-lead .cc-at-grade{grid-template-columns:minmax(0,1fr) minmax(290px,340px)}
  .cc-at-com-lead .cc-at-lista{display:none}
  .cc-at-com-lead .cc-at-abas-cel{display:flex}
  .cc-at-com-lead .cc-at-aba{display:none}
  .cc-at-grade{grid-template-columns:minmax(280px,340px) minmax(0,1fr)}
  .cc-at-alca{display:none}
  .cc-at:not(.cc-at-com-lead) .cc-at-cockpit{display:none}
}
.cc-at-abas-cel{align-items:center;gap:6px;padding:8px 12px;border-bottom:1px solid var(--cc-line)}
.cc-at-voltar{display:inline-flex;align-items:center;gap:4px;font-size:13px;font-weight:600;color:var(--cc-gold-2);margin-right:auto}
.cc-at-voltar svg{transform:rotate(180deg)}
/* celular: uma coluna — lista → (toque) chat → aba Resumo */
@media (max-width:900px){
  .cc-at .cc-top{margin-bottom:10px}
  .cc-at-com-lead .cc-top{display:none}
  .cc-at-grade,.cc-at-com-lead .cc-at-grade{display:block;height:auto;min-height:0}
  .cc-at-col{border-radius:14px}
  .cc-at:not(.cc-at-com-lead) .cc-at-chat,.cc-at:not(.cc-at-com-lead) .cc-at-cockpit{display:none}
  .cc-at-lista .cc-at-itens{overflow:visible}
  .cc-at-com-lead .cc-at-lista{display:none}
  .cc-at-com-lead .cc-at-aba{display:inline-flex;align-items:center;height:32px;padding:0 12px;border-radius:99px;font-size:13px;font-weight:600;color:var(--cc-muted);border:1px solid var(--cc-line-2)}
  .cc-at-com-lead .cc-at-aba-conversa{color:var(--cc-gold-2);border-color:rgba(251,191,36,.6);background:var(--cc-gold-soft)}
  .cc-at-com-lead .cc-at-chat{height:calc(100vh - 96px);min-height:480px}
  .cc-at-com-lead .cc-at-cockpit{display:none}
  .cc-at-grade:has(.cc-at-cockpit:target) .cc-at-chat,.cc-at-grade:has(.cc-at-cockpit :target) .cc-at-chat{display:none}
  .cc-at-com-lead .cc-at-cockpit:target,.cc-at-com-lead .cc-at-cockpit:has(:target){display:flex}
  .cc-at-cockpit .cc-at-abas-voltar{display:flex}
  .cc-at-msg{max-width:86%}
  .cc-at-compor{flex-wrap:wrap}
  .cc-at-compor-campo{flex-basis:100%}
  .cc-at-zap{width:100%;justify-content:center}
  .cc-at-modelo-lin{grid-template-columns:1fr}
  .cc-at-via{margin-left:0}
  .cc-at-chat-topo{flex-wrap:wrap}
  .cc-at-lapis[open]>form{left:auto;right:-8px;width:calc(100vw - 64px)}
}
.cc-at-abas-voltar{display:none;gap:6px;align-items:center;margin:-4px 0 2px}
.cc-at-abas-voltar a{display:inline-flex;align-items:center;height:32px;padding:0 12px;border-radius:99px;font-size:13px;font-weight:600;color:var(--cc-muted);border:1px solid var(--cc-line-2)}
.cc-at-abas-voltar a.cc-on{color:var(--cc-gold-2);border-color:rgba(251,191,36,.6);background:var(--cc-gold-soft)}
`;
