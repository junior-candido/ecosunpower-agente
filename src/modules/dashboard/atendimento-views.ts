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

import { createHash } from 'node:crypto';
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
import { URL_CSS_ATENDIMENTO } from './ui/estatico.js';
import { ECOSUN_COMPANY_ID } from '../tenant-resolver.js';
import { dadosDoLead, interessesDoLead, rotuloOrigem, rotuloPerfil } from './atendimento-dados.js';
import { ultimoEventoDeAtendimento } from '../assumir-atendimento.js';
import {
  ultimaDoCliente, janelaAtendimento, horaDaJanela, avisoCusto, motivoBloqueio, custoDoModelo,
  RESULTADO_ENVIO, LIMITE_TEXTO, type ViaEnvio, type MotivoBloqueio,
} from './atendimento-envio.js';
import { parametroNome, type ModeloAtendimento } from './modelos-atendimento.js';
import { respostasProntas } from './respostas-prontas.js';

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

function itemConversa(c: ConversaResumo, ativo: boolean, filtros: FiltrosConversa, assistente: string, donoPessoal: string | null = null): string {
  const quem = c.ultimaDe === 'assistente' ? `${c.canal === 'whatsapp_business' ? (donoPessoal || 'Você') : assistente}: ` : '';
  const previa = c.ultimaTexto ? `${quem}${c.ultimaTexto}` : 'Sem mensagens';
  const href = c.leadId
    ? `/dashboard/leads/${c.leadId}${qsFiltros(filtros)}`
    : `/dashboard/leads/conversas?contato=${encodeURIComponent(c.contato ?? '')}`;
  const sinais = [
    c.leadId ? pilulaEtapa(c.etapa) : `<span class="cc-at-naolead">Não é lead</span>`,
    !c.leadId ? '' : c.optOut ? pilulaStatus('sem_dado', 'Parou') : !c.evaAtiva ? pilulaStatus('acompanhar', `${assistente} pausada`) : '',
    c.canal ? `<span class="cc-at-canal cc-at-canal-${escapeHtml(c.canal)}">${escapeHtml(rotuloCanal(c.canal, assistente, donoPessoal))}</span>` : '',
  ].filter(Boolean).join('');
  return `<a class="cc-at-item${ativo ? ' cc-on' : ''}" href="${escapeHtml(href)}"${ativo ? ' aria-current="true"' : ''}>
    ${avatarAt(c.nome, c.telefone)}
    <span class="cc-at-item-txt">
      <span class="cc-at-l1"><strong>${escapeHtml(c.nome ?? formatPhoneBR(c.telefone))}</strong><time>${escapeHtml(horaCurta(c.ultimaEm))}</time></span>
      <span class="cc-at-l2"><span class="cc-at-prev">${escapeHtml(previa)}</span>${c.aguardandoResposta ? '<span class="cc-at-espera" title="O cliente falou por último — aguardando resposta" aria-label="aguardando resposta"></span>' : ''}</span>
      <span class="cc-at-l3">${sinais}</span>
    </span>
  </a>`;
}

function colunaLista(lista: ListaConversas, filtros: FiltrosConversa, leadAtivo: string | null, assistente: string, contatoAtivo: string | null = null, donoPessoal: string | null = null): string {
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
    : lista.itens.map((c) => itemConversa(c, c.leadId ? c.leadId === leadAtivo : !!contatoAtivo && c.contato === contatoAtivo, filtros, assistente, donoPessoal)).join('');
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
  const quem = humano ? `${m.autorNome || 'Equipe'} · ${m.origem === 'celular' ? 'pelo celular' : 'pelo painel'}` : daAssistente ? rotuloAssistente : nomeCliente;
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
  /** Parte 2b: trocar o número da resposta (🤖 Eva / 👤 dono). Ausente = só um número. */
  alternativas?: Array<{ canal: CanalConversa; ativo: boolean; href: string }>;
  /** Parte 2b: nome do dono do número pessoal ("Junior"). */
  donoPessoal?: string | null;
  /** Nome da empresa nas respostas prontas (Parte 2c). */
  empresaNome?: string;
  /** Quem está escrevendo (1º nome vai nas respostas prontas). */
  euNome?: string;
  agora?: number;
}

/**
 * Respostas prontas (Parte 2c): o texto entra no campo e dá pra editar antes de
 * enviar. Com a janela fechada no número da Eva, cada uma escolhe o MODELO
 * aprovado correspondente (a que não tem modelo fica desligada).
 */
function chipsProntas(c: CompositorInput, nomeCliente: string | null, janelaFechada: boolean): string {
  const lista = respostasProntas({
    nomeCliente, eu: c.euNome, empresa: c.empresaNome ?? '',
    modelosAprovados: c.via === 'waba' ? c.modelos.map((m) => m.nome) : [],
  });
  const rotuloModelo = (nome: string | null) => c.modelos.find((m) => m.nome === nome)?.rotulo ?? nome ?? '';
  const chips = lista.map((r) => {
    if (janelaFechada) {
      return r.modelo
        ? `<button type="button" class="cc-chip cc-at-pronta" data-pronta="${escapeHtml(r.id)}" data-modelo="${escapeHtml(r.modelo)}" title="${escapeHtml(`Janela fechada: vira o modelo "${rotuloModelo(r.modelo)}"`)}">${escapeHtml(r.rotulo)}</button>`
        : `<button type="button" class="cc-chip cc-at-pronta" disabled title="Sem modelo aprovado para esta resposta">${escapeHtml(r.rotulo)}</button>`;
    }
    return `<button type="button" class="cc-chip cc-at-pronta" data-pronta="${escapeHtml(r.id)}" data-texto="${escapeHtml(r.texto)}" title="Coloca o texto no campo — dá pra editar antes de enviar">${escapeHtml(r.rotulo)}</button>`;
  }).join('');
  return `<div class="cc-at-prontas" role="group" aria-label="Respostas prontas"><span class="cc-at-prontas-t">${janelaFechada ? 'Respostas prontas (viram modelo)' : 'Respostas prontas'}</span>${chips}</div>`;
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
  const numero = `<span class="cc-at-via">sai pelo ${escapeHtml(rotuloCanal(c.canal, assistente, c.donoPessoal))}</span>${linkZap}`;
  // Parte 2b: responder como 🤖 Eva / 👤 dono (padrão = onde o cliente escreveu por último).
  const trocaNumero = c.alternativas && c.alternativas.length > 1
    ? `<div class="cc-at-como" role="group" aria-label="Responder por qual número"><span class="cc-at-prontas-t">Responder como</span>${c.alternativas.map((a) =>
      `<a class="cc-chip${a.ativo ? ' cc-chip-on' : ''}" href="${escapeHtml(a.href)}"${a.ativo ? ' aria-current="true"' : ''}>${escapeHtml(rotuloCanal(a.canal, assistente, c.donoPessoal))}</a>`).join('')}</div>`
    : '';
  const campoCanal = c.canal === 'whatsapp_business' ? `<input type="hidden" name="canal" value="whatsapp_business">` : '';

  // Nada pode sair (opt-out, sem canal, sem telefone, LGPD): campo desligado com o motivo.
  if (bloqueioTexto && bloqueioTexto !== 'janela_fechada') {
    const link = bloqueioTexto === 'sem_canal' ? ` <a class="cc-link" href="/dashboard/whatsapp">Conectar WhatsApp</a>` : '';
    const trocaBloq = c.alternativas && c.alternativas.length > 1 && bloqueioTexto !== 'opt_out'
      ? `<div class="cc-at-como" role="group" aria-label="Responder por qual número"><span class="cc-at-prontas-t">Responder como</span>${c.alternativas.map((a) =>
        `<a class="cc-chip${a.ativo ? ' cc-chip-on' : ''}" href="${escapeHtml(a.href)}">${escapeHtml(rotuloCanal(a.canal, assistente, c.donoPessoal))}</a>`).join('')}</div>`
      : '';
    return `<footer class="cc-at-compor cc-at-compor-on" id="responder">
      ${banner}
      ${trocaBloq}
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
        <input type="hidden" name="chave" value="${escapeHtml(c.chave)}">${campoCanal}
        <textarea name="texto" id="cc-at-texto" rows="2" maxlength="${LIMITE_TEXTO}" required placeholder="Escreva sua resposta…" aria-label="Sua resposta"></textarea>
        <button type="submit" class="cc-btn cc-at-enviar">Enviar</button>
      </form>`
    : '';
  const modelo = bloqueioModelo ? '' : formModelo(lead.id, c, lead.name ?? '', !!bloqueioTexto);
  const prontas = !bloqueioTexto || !bloqueioModelo ? chipsProntas(c, lead.name, !!bloqueioTexto) : '';

  return `<footer class="cc-at-compor cc-at-compor-on" id="responder">
      ${banner}
      ${trocaNumero}
      ${faixaJanela}
      ${prontas}
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

/** Os balões da conversa (com a divisória de cada dia). Usado na página E no "sem recarregar". */
export function blocoMensagens(mensagens: MensagemChat[], assistente: string, nomeCliente: string, temArquivos: boolean, donoPessoal: string | null, soDono = false): string {
  if (mensagens.length === 0) {
    return soDono
      ? `<div class="cc-at-vazio">${estadoVazio({ tipo: 'vazio', titulo: 'Nenhuma mensagem ainda.', compacto: true })}</div>`
      : `<div class="cc-at-vazio">${estadoVazio({ tipo: 'vazio', titulo: 'Nenhuma mensagem ainda.', texto: `Quando o cliente escrever no WhatsApp, a conversa aparece aqui.`, compacto: true })}</div>`;
  }
  const canais = new Set(mensagens.map((m) => m.canal).filter(Boolean));
  const mostrarCanal = !soDono && canais.size > 1;
  let diaAnterior = '';
  return mensagens.map((m) => {
    let sep = '';
    if (m.timestamp && Number.isFinite(Date.parse(m.timestamp))) {
      const dia = rotuloDia(m.timestamp);
      if (dia !== diaAnterior) { sep = `<div class="cc-at-dia"><span>${escapeHtml(dia)}</span></div>`; diaAnterior = dia; }
    }
    // Conversa do número pessoal com quem não é lead: quem responde é o dono (nunca a assistente).
    const mm = soDono && m.role === 'assistant' && m.autor !== 'humano' ? { ...m, autor: 'humano' as const, autorNome: m.autorNome ?? donoPessoal } : m;
    return sep + balao(mm, assistente, nomeCliente, temArquivos, mostrarCanal, donoPessoal);
  }).join('');
}

/**
 * Topo do chat (nome, etapa, Eva ativa/pausada, Assumir) + a faixa "fulano
 * assumiu". Embrulhado em #cc-at-topo (display: contents — não muda o layout)
 * pra ser trocado inteiro sem recarregar a página.
 */
function topoDoChat(lead: LeadDetail, mensagens: MensagemChat[], assistente: string, assistenteMin: string, envio: CompositorInput | undefined, donoPessoal: string | null, podeEditar: boolean): string {
  const nome = lead.name ?? 'Sem nome';
  const desde = lead.created_at && Number.isFinite(Date.parse(lead.created_at)) ? `Lead desde ${diaDe(lead.created_at)}` : '';
  const sub = [formatPhoneBR(lead.phone), [lead.city, lead.uf].filter(Boolean).join('/'), desde].filter(Boolean);
  const eva = lead.opt_out
    ? pilulaStatus('sem_dado', `${assistente}: parou`)
    : lead.eva_active ? pilulaStatus('normal', `${assistente} ativa`) : pilulaStatus('acompanhar', `${assistente} pausada`);
  const canalChip = envio ? `<span class="cc-at-canal cc-at-canal-${escapeHtml(envio.canal)}">${escapeHtml(rotuloCanal(envio.canal, assistente, donoPessoal))}</span>` : '';
  return `<div class="cc-at-topo" id="cc-at-topo">
    <header class="cc-at-chat-topo">
      ${avatarAt(lead.name, lead.phone)}
      <div class="cc-at-chat-id">
        <div class="cc-at-chat-nome"><strong>${escapeHtml(nome)}</strong>${pilulaEtapa(lead.status)}${eva}${canalChip}</div>
        <div class="cc-at-chat-sub">${escapeHtml(sub.join(' · '))}</div>
      </div>
      ${lead.eva_active ? faixaAssumir(lead, mensagens, assistente, assistenteMin, podeEditar) : ''}
    </header>
    ${!lead.eva_active ? faixaAssumir(lead, mensagens, assistente, assistenteMin, podeEditar) : ''}
    </div>`;
}

/** Nome da assistente na tela: "Eva" na casa, "Assistente" no tenant. */
export function nomesDaAssistente(user: DashUser | undefined): { assistente: string; assistenteMin: string } {
  const ehTenant = !!user && user.companyId !== ECOSUN_COMPANY_ID;
  return ehTenant ? { assistente: 'Assistente', assistenteMin: 'assistente' } : { assistente: 'Eva', assistenteMin: 'Eva' };
}

/**
 * Pedaços da conversa aberta para trocar SEM recarregar (envio pelo painel e
 * mensagens novas do cliente): o mesmo HTML que a página desenha. `estado`
 * muda quando o campo de resposta muda de forma (janela abriu/fechou, bloqueio,
 * número) — aí o rodapé é trocado inteiro; senão só a faixa da janela.
 */
export function pedacosDaConversa(p: {
  user: DashUser | undefined; lead: LeadDetail; mensagens: MensagemChat[]; envio?: CompositorInput; donoPessoal?: string | null;
}): { topo: string; msgs: string; compor: string; estado: string } {
  const { assistente, assistenteMin } = nomesDaAssistente(p.user);
  const temArquivos = (p.lead.anexos ?? []).length > 0;
  return {
    topo: topoDoChat(p.lead, p.mensagens, assistente, assistenteMin, p.envio, p.donoPessoal ?? null, can(p.user, 'leads', 'editar')),
    msgs: blocoMensagens(p.mensagens, assistente, p.lead.name ?? 'Sem nome', temArquivos, p.donoPessoal ?? null),
    compor: compositor(p.lead, p.mensagens, p.envio, assistente),
    estado: estadoDoCompositor(p.lead, p.mensagens, p.envio),
  };
}

/**
 * "Nada mudou?" — resumo do que o cliente veria de diferente (topo, balões e a
 * forma do campo). O campo em si não entra: ele traz a chave nova de cada
 * desenho. PURA.
 */
export function assinaturaDaConversa(p: { topo?: string; msgs: string; estado: string }): string {
  return createHash('sha1').update(`${p.topo ?? ''}|${p.msgs}|${p.estado}`).digest('base64url').slice(0, 20);
}

/** Forma do campo de resposta (não o conteúdo): muda → o rodapé é redesenhado. PURA. */
export function estadoDoCompositor(lead: Pick<LeadDetail, 'opt_out' | 'phone'>, mensagens: MensagemChat[], c: CompositorInput | undefined): string {
  if (!c) return 'sem_envio';
  const telefone = normalizeBrazilianPhone(lead.phone ?? '') ?? null;
  const janela = c.via === 'waba' ? janelaAtendimento(ultimaDoCliente(mensagens, c.canal), c.agora ?? Date.now()) : null;
  const base = { optOut: !!lead.opt_out, telefone, via: c.via, lgpdBloqueado: !!c.lgpdBloqueado };
  const t = motivoBloqueio({ ...base, tipo: 'texto', janelaAberta: !!janela?.aberta }) ?? 'livre';
  const m = c.via === 'waba' ? motivoBloqueio({ ...base, tipo: 'modelo', janelaAberta: !!janela?.aberta }) ?? 'livre' : 'sem_modelo';
  return `${c.canal}|${t}|${m}|${c.modelos.length}`;
}

function colunaChat(lead: LeadDetail, mensagens: MensagemChat[], assistente: string, assistenteMin: string, envio: CompositorInput | undefined, donoPessoal: string | null, podeEditar: boolean): string {
  const nome = lead.name ?? 'Sem nome';
  const temArquivos = (lead.anexos ?? []).length > 0;
  const corpo = blocoMensagens(mensagens, assistente, nome, temArquivos, donoPessoal);
  const topo = topoDoChat(lead, mensagens, assistente, assistenteMin, envio, donoPessoal, podeEditar);
  // Sem recarregar: o script busca os pedaços desta conversa (mesmo número da resposta).
  const estado = envio ? estadoDoCompositor(lead, mensagens, envio) : '';
  const vivo = envio
    ? ` data-conversa="/dashboard/leads/${escapeHtml(lead.id)}/conversa.json?canal=${escapeHtml(envio.canal)}" data-estado="${escapeHtml(estado)}" data-assinatura="${assinaturaDaConversa({ topo, msgs: corpo, estado })}"`
    : '';
  return `<section class="cc-at-col cc-at-chat" id="conversa" aria-label="Conversa"${vivo}>
    <nav class="cc-at-abas-cel" aria-label="Navegação do atendimento">
      <a class="cc-at-voltar" href="/dashboard/leads/conversas" aria-label="Voltar para a lista">${icone('chev', 'sm')}Conversas</a>
      <a class="cc-at-aba cc-at-aba-conversa" href="/dashboard/leads/${escapeHtml(lead.id)}">Conversa</a>
      <a class="cc-at-aba cc-at-aba-resumo" href="#resumo">Resumo</a>
    </nav>
    ${topo}
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
  /** Parte 2b: conversa do número pessoal com quem AINDA NÃO é lead (sem lead aberto). */
  contato?: ContatoPessoalTela | null;
}

export interface ContatoPessoalTela {
  telefone: string;
  nome: string | null;
  mensagens: MensagemChat[];
  envio?: CompositorInput;
}

// ---------------------------------------------------------------------------
// Parte 2b — conversa do número pessoal com quem ainda não é lead
// ---------------------------------------------------------------------------

function formVirarLead(telefone: string, classe = 'cc-btn cc-btn-sm cc-at-btn-virar'): string {
  return `<form class="cc-at-virar" method="POST" action="/dashboard/leads/conversas/contato/virar-lead"><input type="hidden" name="telefone" value="${escapeHtml(telefone)}"><button type="submit" class="${classe}">➕ Virar lead</button></form>`;
}

/** Rodapé de resposta da conversa com quem ainda não é lead (só pelo número pessoal). */
function compositorContato(ct: ContatoPessoalTela, donoPessoal: string | null, assistente: string): string {
  const c = ct.envio;
  const res = c?.resultado ? RESULTADO_ENVIO[c.resultado] : undefined;
  const banner = res ? aviso({ tom: res.tom === 'ok' ? 'ok' : res.tom === 'erro' ? 'erro' : 'atencao', texto: res.texto }) : '';
  const zap = linkWhatsApp(ct.telefone);
  const linkZap = zap ? `<a class="cc-link cc-at-zap-link" href="${escapeHtml(zap)}" target="_blank" rel="noopener">${icone('wa', 'xs')}Abrir no WhatsApp</a>` : '';
  const prontas = c && c.via === 'evolution' ? chipsProntas(c, ct.nome, false) : '';
  return c && c.via === 'evolution'
    ? `<footer class="cc-at-compor cc-at-compor-on" id="responder">
      ${banner}
      <div class="cc-at-janela"><span class="cc-at-via">sai pelo ${escapeHtml(rotuloCanal('whatsapp_business', assistente, donoPessoal))}</span>${linkZap}</div>
      ${prontas}
      <form class="cc-form cc-at-resp" method="POST" action="/dashboard/leads/conversas/contato/responder" data-envio>
        <input type="hidden" name="chave" value="${escapeHtml(c.chave)}">
        <input type="hidden" name="telefone" value="${escapeHtml(ct.telefone)}">
        <textarea name="texto" id="cc-at-texto" rows="2" maxlength="${LIMITE_TEXTO}" required placeholder="Escreva sua resposta…" aria-label="Sua resposta"></textarea>
        <button type="submit" class="cc-btn cc-at-enviar">Enviar</button>
      </form>
      <p class="cc-at-nota">Conversa do seu WhatsApp: só você vê. A ${escapeHtml(assistente)} não responde aqui.</p>
    </footer>`
    : `<footer class="cc-at-compor cc-at-compor-on" id="responder">${banner}<div class="cc-at-compor-campo cc-at-bloq" aria-disabled="true">${icone('alert', 'xs')}<span>Seu WhatsApp não está conectado agora. <a class="cc-link" href="/dashboard/whatsapp/pessoal">Conectar</a></span></div>${linkZap}</footer>`;
}

/** Pedaços da conversa com quem não é lead, pra trocar sem recarregar. */
export function pedacosDoContato(p: { user: DashUser | undefined; contato: ContatoPessoalTela; donoPessoal?: string | null }): { msgs: string; compor: string; estado: string } {
  const { assistente } = nomesDaAssistente(p.user);
  const nome = p.contato.nome || formatPhoneBR(p.contato.telefone);
  return {
    msgs: blocoMensagens(p.contato.mensagens, assistente, nome, false, p.donoPessoal ?? null, true),
    compor: compositorContato(p.contato, p.donoPessoal ?? null, assistente),
    estado: p.contato.envio?.via === 'evolution' ? 'pessoal|livre' : 'pessoal|desconectado',
  };
}

function colunaChatContato(ct: ContatoPessoalTela, donoPessoal: string | null, assistente: string): string {
  const nome = ct.nome || formatPhoneBR(ct.telefone);
  const corpo = blocoMensagens(ct.mensagens, assistente, nome, false, donoPessoal, true);
  const estado = ct.envio?.via === 'evolution' ? 'pessoal|livre' : 'pessoal|desconectado';
  const vivo = ct.envio ? ` data-conversa="/dashboard/leads/conversas/contato.json?contato=${encodeURIComponent(ct.telefone)}" data-estado="${escapeHtml(estado)}" data-assinatura="${assinaturaDaConversa({ msgs: corpo, estado })}"` : '';
  return `<section class="cc-at-col cc-at-chat" id="conversa" aria-label="Conversa"${vivo}>
    <nav class="cc-at-abas-cel" aria-label="Navegação do atendimento">
      <a class="cc-at-voltar" href="/dashboard/leads/conversas" aria-label="Voltar para a lista">${icone('chev', 'sm')}Conversas</a>
    </nav>
    <header class="cc-at-chat-topo">
      ${avatarAt(ct.nome, ct.telefone)}
      <div class="cc-at-chat-id">
        <div class="cc-at-chat-nome"><strong>${escapeHtml(nome)}</strong><span class="cc-at-naolead">Não é lead</span><span class="cc-at-canal cc-at-canal-whatsapp_business">${escapeHtml(rotuloCanal('whatsapp_business', assistente, donoPessoal))}</span></div>
        <div class="cc-at-chat-sub">${escapeHtml(formatPhoneBR(ct.telefone))} · só você vê esta conversa</div>
      </div>
      ${formVirarLead(ct.telefone)}
    </header>
    <div class="cc-at-msgs" id="cc-at-msgs" role="log" aria-label="Mensagens">${corpo}</div>
    ${compositorContato(ct, donoPessoal, assistente)}
  </section>`;
}

function cockpitContato(ct: ContatoPessoalTela, donoPessoal: string | null): string {
  return `<aside class="cc-at-col cc-at-cockpit" id="resumo" aria-label="Contato">
    <div class="cc-at-alca cc-at-alca-r" data-lado="r" role="separator" aria-orientation="vertical" aria-label="Arrastar para mudar a largura do resumo do lead" tabindex="0"></div>
    <div class="cc-at-idt">
      ${avatarAt(ct.nome, ct.telefone, true)}
      <div class="cc-at-idt-txt">
        <div class="cc-at-nome"><h2>${escapeHtml(ct.nome || formatPhoneBR(ct.telefone))}</h2></div>
        <div class="cc-at-idt-sub">${icone('phone', 'xs')}<span>${escapeHtml(formatPhoneBR(ct.telefone))}</span></div>
        <div class="cc-at-pills"><span class="cc-at-naolead">Não é lead</span></div>
      </div>
    </div>
    <section class="cc-at-sec"><h3>Contato do ${escapeHtml(donoPessoal ? `WhatsApp de ${donoPessoal}` : 'seu WhatsApp')}</h3>
      <p class="cc-at-nada">Esta pessoa falou com você no seu número. Se virar cliente, toque em <strong>Virar lead</strong>: ela entra no funil (com a assistente pausada, porque você já está conversando) e a conversa passa para o lead.</p>
      <div class="cc-at-virar-bloco">${formVirarLead(ct.telefone, 'cc-btn cc-at-cad')}</div>
    </section>
  </aside>`;
}

export function renderAtendimentoPage(p: AtendimentoInput): string {
  const ehTenant = !!p.user && p.user.companyId !== ECOSUN_COMPANY_ID;
  const { assistente, assistenteMin } = nomesDaAssistente(p.user);
  const lead = p.lead;
  const mensagens = p.mensagens ?? lead?.conversation_messages?.map((m) => ({ role: m.role, content: m.content, timestamp: m.timestamp ?? null })) ?? [];

  const k = p.lista.contagem;
  // P2b: o dono (admin da casa) liga o WhatsApp pessoal dele aqui.
  const meuZap = !ehTenant && p.user?.isAdmin
    ? chip({ rotulo: p.donoPessoal ? `👤 ${p.donoPessoal}` : '👤 Conectar meu WhatsApp', href: '/dashboard/whatsapp/pessoal' })
    : '';
  const visao = `<div class="cc-chips">${meuZap}${chip({ rotulo: 'Conversas', href: '/dashboard/leads/conversas', ativo: true })}${chip({ rotulo: 'Lista', href: '/dashboard/leads' })}${chip({ rotulo: 'Quadro', href: '/dashboard/leads/kanban' })}</div>`;
  const cabecalho = cabecalhoPagina({
    trilha: [{ rotulo: 'Comercial' }, { rotulo: 'Leads', href: '/dashboard/leads' }, { rotulo: 'Conversas' }],
    titulo: 'Conversas',
    subtitulo: `${k.todas} conversa(s) · ${k.aguardando} aguardando resposta`,
    acoesHtml: visao,
  });

  const ct = !lead ? p.contato ?? null : null;
  const body = `<div class="cc-root cc-at${lead || ct ? ' cc-at-com-lead' : ''}">
    ${cabecalho}
    <div class="cc-at-grade">
      ${colunaLista(p.lista, p.filtros, lead?.id ?? null, assistente, ct?.telefone ?? null, p.donoPessoal ?? null)}
      ${lead ? colunaChat(lead, mensagens, assistente, assistenteMin, p.envio, p.donoPessoal ?? null, can(p.user, 'leads', 'editar')) : ct ? colunaChatContato(ct, p.donoPessoal ?? null, assistente) : chatSemLead()}
      ${lead ? colunaCockpit(lead, p.servicos ?? [], assistente, assistenteMin) : ct ? cockpitContato(ct, p.donoPessoal ?? null) : cockpitSemLead()}
    </div>
    ${lead && !CLIENTE_STATUSES.includes(String(lead.installation_status ?? '')) ? modalFechou(lead) : ''}
    ${lead && lead.status !== 'perdido' ? modalPerdido(lead, assistente) : ''}
  </div>`;

  // Alças das colunas (sempre) + rolar o chat até a última mensagem (com lead).
  const script = `<script>${SCRIPT_COLUNAS}</script>` + (lead || ct ? `<script>(function(){function fim(){var c=document.getElementById('cc-at-msgs');if(c){c.scrollTop=c.scrollHeight;}}fim();window.addEventListener('load',fim);})();</script>` : '')
    + ((lead && p.envio) || ct?.envio ? `<script>${SCRIPT_RESPONDER}</script>` : '');

  const titulo = lead ? `Conversa: ${lead.name ?? 'Sem nome'}` : ct ? `Conversa: ${ct.nome || formatPhoneBR(ct.telefone)}` : 'Conversas';
  return renderLayout({ active: 'conversas', title: titulo, body: body + script, user: p.user, tailwind: false, dark: temaDaTela(p.user, 'escuro') === 'escuro', largo: true,
    // CSS da grade por arquivo, no <head>: a tela já nasce com as 3 colunas (sem piscada).
    cabeca: `<link rel="stylesheet" href="${URL_CSS_ATENDIMENTO}">` });
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
 * Responder (Parte 2) — SEM RECARREGAR a página (Junior 28/09: "não sai suave,
 * dá um toque na tela inteira"):
 *  - o envio (texto, modelo, resposta pronta) vai por fetch pedindo JSON; o
 *    balão aparece NA HORA como "enviando…" e vira "✓ enviado" ou "⚠ não saiu"
 *    com o motivo; o campo limpa e fica com o foco; o texto volta se falhar;
 *  - botão travado enquanto envia (o servidor também barra pela chave; a
 *    resposta traz a chave do PRÓXIMO clique; sem resposta, a chave fica — o
 *    reenvio vira "já enviada", nunca mensagem dupla);
 *  - a conversa aberta se atualiza sozinha a cada 8 s (só com a aba visível) e
 *    logo depois de cada envio: balões, faixa "assumiu" e a janela de 24 h;
 *  - sem fetch (navegador muito velho) o formulário faz o POST normal;
 *  - prévia do modelo e respostas prontas (textContent: nada vira HTML).
 */
export const SCRIPT_RESPONDER = `(function(){
var chat=document.getElementById('conversa'),URLC=chat?chat.getAttribute('data-conversa'):null,assin=chat?chat.getAttribute('data-assinatura'):null,enviando=false,buscando=false,geracao=0,parados=0,tiques=0;
var podeFetch=!!(window.fetch&&window.FormData&&window.URLSearchParams);
function rolar(){var c=document.getElementById('cc-at-msgs');if(c)c.scrollTop=c.scrollHeight;}
function noFim(c){return c.scrollHeight-c.scrollTop-c.clientHeight<120;}
function pedaco(html){var t=document.createElement('template');t.innerHTML=html;return t.content;}
function aviso(html){var f=document.getElementById('responder');if(!f)return;f.querySelectorAll('.cc-at-aviso-envio').forEach(function(x){x.remove();});if(!html)return;var d=document.createElement('div');d.className='cc-at-aviso-envio';d.setAttribute('role','status');d.innerHTML=html;f.insertBefore(d,f.firstChild);}
function balao(texto){var c=document.getElementById('cc-at-msgs');if(!c)return null;var v=c.querySelector('.cc-at-vazio');if(v)v.remove();
var d=document.createElement('div');d.className='cc-at-msg cc-at-msg-eva cc-at-msg-hum cc-at-msg-otimista';
var q=document.createElement('div');q.className='cc-at-msg-q';q.textContent='Você · pelo painel';
var t=document.createElement('div');t.className='cc-at-msg-t';t.textContent=texto;
var h=document.createElement('div');h.className='cc-at-msg-h';h.textContent='enviando…';
d.appendChild(q);d.appendChild(t);d.appendChild(h);c.appendChild(d);rolar();return d;}
function marcar(d,ok,motivo){if(!d)return;var h=d.querySelector('.cc-at-msg-h');if(ok){h.textContent='✓ enviado';return;}
var f=document.createElement('div');f.className='cc-at-msg-falha';f.textContent='⚠ não saiu — '+(motivo||'tente de novo.');d.insertBefore(f,h);h.textContent='';}
function novaChave(k){if(!k)return;var f=document.getElementById('responder');if(f)f.querySelectorAll('input[name=chave]').forEach(function(i){i.value=k;});}
function trocarRodape(html,estado){var f=document.getElementById('responder');if(!f||typeof html!=='string')return;var novo=pedaco(html).querySelector('#responder');if(!novo)return;
if(estado&&chat.getAttribute('data-estado')!==estado){var ta=document.getElementById('cc-at-texto'),txt=ta?ta.value:'',foco=document.activeElement===ta;f.parentNode.replaceChild(novo,f);chat.setAttribute('data-estado',estado);var nt=document.getElementById('cc-at-texto');if(nt&&txt){nt.value=txt;}if(nt&&foco)nt.focus();atualizarPrevia();return;}
var jv=f.querySelector('.cc-at-janela'),jn=novo.querySelector('.cc-at-janela');if(jv&&jn)jv.parentNode.replaceChild(jn,jv);}
function buscar(depoisDeEnviar){if(!URLC||buscando||!window.fetch)return;buscando=true;var g=geracao;
var u=URLC+(URLC.indexOf('?')>=0?'&':'?')+'assinatura='+encodeURIComponent(assin||'');
return fetch(u,{credentials:'same-origin',headers:{'Accept':'application/json'}}).then(function(r){return r.ok?r.json():null;}).then(function(j){
if(!j||g!==geracao)return;if(j.irPara){location.href=j.irPara;return;}if(j.igual){parados++;return;}parados=0;assin=j.assinatura||null;
var c=document.getElementById('cc-at-msgs');if(c&&typeof j.msgs==='string'){var fim=depoisDeEnviar||noFim(c);c.innerHTML=j.msgs;if(fim)rolar();}
if(typeof j.topo==='string'){var t=document.getElementById('cc-at-topo'),n=pedaco(j.topo).querySelector('#cc-at-topo');if(t&&n)t.parentNode.replaceChild(n,t);}
trocarRodape(j.compor,j.estado);
}).catch(function(){}).then(function(){buscando=false;});}
document.addEventListener('submit',function(e){var f=e.target&&e.target.closest?e.target.closest('form[data-envio]'):null;if(!f)return;
var b=f.querySelector('button[type=submit]');
if(!podeFetch){if(b){if(b.disabled){e.preventDefault();return;}setTimeout(function(){b.disabled=true;b.textContent='Enviando…';},0);}return;}
e.preventDefault();if(enviando)return;
var ta=f.querySelector('textarea[name=texto]'),pv=document.getElementById('cc-at-previa');
var texto=ta?ta.value.trim():(pv?pv.textContent:'');if(ta&&!texto){ta.focus();return;}
enviando=true;geracao++;parados=0;var rot=b?b.textContent:'';if(b){b.disabled=true;b.textContent='Enviando…';}
var corpo=new URLSearchParams(new FormData(f)).toString();
var d=balao(texto);aviso('');if(ta){ta.value='';ta.focus();}
return fetch(f.getAttribute('action'),{method:'POST',credentials:'same-origin',headers:{'Accept':'application/json','Content-Type':'application/x-www-form-urlencoded'},body:corpo})
.then(function(r){return r.json().catch(function(){return {ok:false,texto:'resposta inesperada do servidor. Recarregue a página.'};});})
.then(function(j){novaChave(j.chave);var jaFoi=j.resultado==='duplicado';marcar(d,!!j.ok||jaFoi,j.texto);if(jaFoi){aviso(j.avisoHtml||'');}
else if(!j.ok){aviso(j.avisoHtml||'');if(ta&&!ta.value)ta.value=texto;}
if(j.ok||jaFoi||j.resultado==='falhou'){assin=null;buscando=false;geracao++;buscar(true);}})
.catch(function(){marcar(d,false,'sem conexão com o painel. Confira a internet e tente de novo.');if(ta&&!ta.value)ta.value=texto;})
.then(function(){enviando=false;if(b&&document.body.contains(b)){b.disabled=false;b.textContent=rot||'Enviar';}});});
function atualizarPrevia(){var sel=document.getElementById('cc-at-modelo-sel'),nome=document.getElementById('cc-at-modelo-nome'),prev=document.getElementById('cc-at-previa'),custo=document.getElementById('cc-at-modelo-custo');if(!sel||!prev)return;var o=sel.options[sel.selectedIndex];if(!o)return;var n=(nome&&nome.value.trim())||'tudo bem';var t=o.getAttribute('data-texto')||'';prev.textContent=t?t.split('{nome}').join(n):'O texto deste modelo está na Meta (nome: '+n+').';if(custo)custo.textContent=o.getAttribute('data-custo')||'';}
document.addEventListener('change',function(e){if(e.target&&e.target.id==='cc-at-modelo-sel')atualizarPrevia();});
document.addEventListener('input',function(e){if(e.target&&e.target.id==='cc-at-modelo-nome')atualizarPrevia();});
document.addEventListener('click',function(e){var b=e.target&&e.target.closest?e.target.closest('[data-pronta]'):null;if(!b||b.disabled)return;
var t=document.getElementById('cc-at-texto');if(t){t.value=b.getAttribute('data-texto')||'';t.focus();try{t.setSelectionRange(t.value.length,t.value.length);}catch(x){}return;}
var m=b.getAttribute('data-modelo'),sel=document.getElementById('cc-at-modelo-sel');if(sel&&m){sel.value=m;atualizarPrevia();var d=sel.closest('details');if(d)d.open=true;sel.focus();}});
document.addEventListener('keydown',function(e){var t=e.target;if(!t||t.id!=='cc-at-texto')return;if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();var f=t.form;if(f){if(f.requestSubmit)f.requestSubmit();else f.submit();}}});
if(URLC&&window.fetch){setInterval(function(){tiques++;if(document.hidden||enviando)return;if(parados>=4&&tiques%3!==0)return;buscar(false);},8000);document.addEventListener('visibilitychange',function(){if(!document.hidden)buscar(false);});}
})();`;

/** CSS só do Atendimento — mora em ui/css-atendimento.ts (vai por arquivo, no <head>). */
export { CSS_ATENDIMENTO } from './ui/css-atendimento.js';
