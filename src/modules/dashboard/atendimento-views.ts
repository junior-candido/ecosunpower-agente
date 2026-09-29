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
import { tamanhoLegivel, ACEITA_NO_SELETOR, LIMITE_IMAGEM_BYTES, LIMITE_MIDIA_BYTES, LIMITE_LEGENDA } from '../midia-whatsapp.js';
import { casarMidiaAntiga, tipoDoArquivo, type AnexoDoLead } from './atendimento-arquivos.js';

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

const ID_MIDIA_OK = /^[0-9a-zA-Z-]{1,64}$/;
const ICONE_DOC: Array<[RegExp, string]> = [[/pdf/, '📕'], [/sheet|excel|csv/, '📗'], [/word|msword/, '📘'], [/presentation/, '📙']];

/**
 * W1 — balão com o ARQUIVO: foto (miniatura que amplia), vídeo curto e áudio
 * com player (a transcrição embaixo), documento com ícone + abrir/baixar. O
 * endereço é SEMPRE a rota protegida /dashboard/leads/midia/:id (confere quem
 * vê e só então redireciona para uma URL assinada de 2 min) — nada de URL do
 * storage no HTML (e a "assinatura" da conversa não muda a cada 8 s). PURA.
 */
export function corpoDaMidia(m: Pick<MensagemChat, 'content' | 'midia' | 'transcricao'>): string {
  const md = m.midia!;
  const legenda = m.content.replace(/^\[[^\]]*\]\s*/, '').trim();
  const semNomeRepetido = md.tipo === 'documento' && md.nome && legenda === md.nome ? '' : legenda;
  const txt = semNomeRepetido ? `<div class="cc-at-msg-t">${escapeHtml(semNomeRepetido)}</div>` : '';
  const transc = m.transcricao ? `<div class="cc-at-transc"><span>Transcrição</span>${escapeHtml(m.transcricao)}</div>` : '';
  if (!ID_MIDIA_OK.test(md.id)) return `<span class="cc-at-midia">📎 Arquivo</span>${txt}${transc}`;
  const url = `/dashboard/leads/midia/${md.id}`;
  const baixar = botaoBaixar(url, md.tipo === 'imagem' ? 'a foto' : md.tipo === 'audio' ? 'o áudio' : md.tipo === 'video' ? 'o vídeo' : 'o arquivo');
  if (md.tipo === 'imagem') {
    return `<a class="cc-at-foto" href="${url}" target="_blank" rel="noopener" data-ampliar aria-label="Ampliar foto"><img src="${url}" alt="Foto enviada na conversa" loading="lazy" decoding="async"></a>${baixar}${txt}`;
  }
  if (md.tipo === 'audio') return `<audio controls preload="none" src="${url}" class="cc-at-audio"></audio>${baixar}${txt}${transc}`;
  if (md.tipo === 'video') return `<video controls preload="none" src="${url}" class="cc-at-video" playsinline></video>${baixar}${txt}${transc}`;
  const mime = (md.mime ?? '').toLowerCase();
  const ic = ICONE_DOC.find(([re]) => re.test(mime))?.[1] ?? '📄';
  const nome = md.nome || 'Documento';
  const tam = tamanhoLegivel(md.bytes);
  return cartaoDoc(ic, nome, tam, url) + txt;
}

/**
 * ⬇ Baixar com UM clique (Junior 28/09): `?baixar=1` na MESMA rota protegida
 * (confere empresa, vendedor e dono do número) — o servidor manda o arquivo
 * como anexo, com nome amigável ("Ana-Exemplo_2026-09-28_foto.jpg").
 */
function botaoBaixar(url: string, oQue: string): string {
  return `<a class="cc-at-baixar" href="${url}?baixar=1" download aria-label="Baixar ${escapeHtml(oQue)}">⬇ Baixar</a>`;
}

function cartaoDoc(ic: string, nome: string, tam: string, url: string): string {
  return `<div class="cc-at-doc"><span class="cc-at-doc-ic" aria-hidden="true">${ic}</span><span class="cc-at-doc-txt"><strong>${escapeHtml(nome)}</strong>${tam ? `<small>${escapeHtml(tam)}</small>` : ''}</span>
      <a class="cc-link" href="${url}" target="_blank" rel="noopener">Abrir</a>${botaoBaixar(url, 'o arquivo')}</div>`;
}

/**
 * Mídia ANTIGA da Eva (antes do bucket novo): o balão só dizia "[Enviou uma
 * foto]"; o arquivo está nos Arquivos do lead (lead_anexos). Quando casa com
 * certeza (casarMidiaAntiga), mostra a miniatura/cartão + ⬇ Baixar pela rota
 * protegida /dashboard/leads/:id/anexo/:anexoId. PURA.
 */
export function corpoDaMidiaAntiga(leadId: string, a: AnexoDoLead, conteudo: string): string {
  const resto = conteudo.replace(/^\[[^\]]*\]\s*/, '').trim();
  const txt = resto ? `<div class="cc-at-msg-t">${escapeHtml(resto)}</div>` : '';
  if (!ID_MSG_OK.test(leadId) || !ID_MSG_OK.test(a.id)) return `<span class="cc-at-midia">📎 Arquivo</span>${txt}`;
  const url = `/dashboard/leads/${leadId}/anexo/${a.id}`;
  const t = tipoDoArquivo(a.mime_type);
  if (t === 'foto') {
    return `<a class="cc-at-foto" href="${url}" target="_blank" rel="noopener" data-ampliar aria-label="Ampliar foto"><img src="${url}" alt="Foto enviada na conversa" loading="lazy" decoding="async"></a>${botaoBaixar(url, 'a foto')}${txt}`;
  }
  const mime = (a.mime_type ?? '').toLowerCase();
  const ic = ICONE_DOC.find(([re]) => re.test(mime))?.[1] ?? '📄';
  return cartaoDoc(ic, t === 'pdf' ? 'PDF enviado pelo cliente' : 'Arquivo enviado pelo cliente', '', url) + txt;
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
export function textoDoEvento(m: Pick<MensagemChat, 'evento' | 'autorNome' | 'timestamp'> & { content?: string }, assistente: string): string {
  const quem = (m.autorNome ?? '').trim();
  const h = horaDe(m.timestamp);
  const as = h ? ` às ${h}` : '';
  if (m.evento === 'assumiu') return `✋ ${quem || 'Alguém da equipe'} assumiu${as}`;
  if (m.evento === 'reagiu') return `${quem || 'O cliente'} reagiu ${m.content || ''} a uma mensagem${as}`;
  return `↩ Devolvido para a ${assistente}${as}${quem ? ` (por ${quem})` : ''}`;
}

const ID_MSG_OK = /^[0-9a-fA-F-]{36}$/;

/** W3: ✓ enviada · ✓✓ entregue · ✓✓ azul lida (o que o WhatsApp avisou). PURA. */
export function tique(status: string | null | undefined): string {
  if (status === 'enviada') return ` <span class="cc-at-tick" title="Enviada">✓</span>`;
  if (status === 'entregue') return ` <span class="cc-at-tick" title="Entregue">✓✓</span>`;
  if (status === 'lida') return ` <span class="cc-at-tick cc-at-tick-lida" title="Lida">✓✓</span>`;
  return '';
}

/** W2: a mensagem citada, dentro do balão (texto escapado; sem ela no chat, só "mensagem anterior"). PURA. */
export function blocoCitacao(c: NonNullable<MensagemChat['citando']>): string {
  const texto = (c.texto ?? '').replace(/^\[[^\]]*\]\s*/, (x) => x.trim() + ' ').trim();
  return `<div class="cc-at-cita"><strong>${escapeHtml(c.autor || 'Mensagem anterior')}</strong><span>${escapeHtml(texto.slice(0, 160) || 'mensagem anterior')}</span></div>`;
}

/** W2: reações embaixo do balão ("👍 ❤️ 2"). PURA. */
export function blocoReacoes(rs: NonNullable<MensagemChat['reacoes']>): string {
  if (!rs.length) return '';
  const titulo = rs.map((r) => `${r.nome || (r.de === 'cliente' ? 'Cliente' : 'Equipe')}: ${r.emoji}`).join(' · ');
  return `<div class="cc-at-reacoes" title="${escapeHtml(titulo)}">${rs.map((r) => `<span>${escapeHtml(r.emoji)}</span>`).join('')}${rs.length > 1 ? `<small>${rs.length}</small>` : ''}</div>`;
}

function balao(m: MensagemChat, rotuloAssistente: string, nomeCliente: string, temArquivos: boolean, mostrarCanal: boolean, donoPessoal: string | null, acoes = false, corpoAntigo: string | null = null): string {
  if (m.role === 'evento' || m.autor === 'evento') {
    return `<div class="cc-at-evento cc-at-evento-${m.evento === 'assumiu' ? 'assumiu' : m.evento === 'reagiu' ? 'reagiu' : 'devolveu'}" role="note">${escapeHtml(textoDoEvento(m, rotuloAssistente))}</div>`;
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
  // W2: só dá para citar/reagir o que tem id do WhatsApp (e quem pode responder).
  const podeAgir = acoes && !!m.wamid && !!m.painelId && ID_MSG_OK.test(m.painelId) && m.status !== 'falhou';
  const reacoes = m.reacoes?.length ? blocoReacoes(m.reacoes) : '';
  return `<div class="cc-at-msg ${classe}${reacoes ? ' cc-at-com-reacao' : ''}"${podeAgir ? ` data-msg="${m.painelId}"` : ''}>
      <div class="cc-at-msg-q">${escapeHtml(quem)}${canal}${podeAgir ? `<button type="button" class="cc-at-acoes-btn" data-acoes aria-label="Responder ou reagir" title="Responder ou reagir">⋯</button>` : ''}</div>
      ${m.citando ? blocoCitacao(m.citando) : ''}
      ${m.midia ? corpoDaMidia(m) : corpoAntigo ?? corpoDaMensagem(m.content, temArquivos)}${!m.midia && m.transcricao ? `<div class="cc-at-transc"><span>Transcrição</span>${escapeHtml(m.transcricao)}</div>` : ''}
      ${falhou}
      ${hora ? `<div class="cc-at-msg-h">${escapeHtml(hora + enviando)}${humano ? tique(m.status) : ''}</div>` : ''}
      ${reacoes}
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

/**
 * W1 — anexar foto, PDF/documento, áudio (arquivo ou gravado aqui) e vídeo
 * curto. Sem JavaScript: escolher o arquivo + legenda + "Enviar arquivo" (POST
 * multipart normal). Com JavaScript: 📎/arrastar/colar → prévia antes de
 * enviar → sai sem recarregar. Os mesmos limites do servidor.
 */
/** W2: "Respondendo a …" em cima do campo (o script preenche; ✕ tira). */
const CAIXA_CITANDO = `<div class="cc-at-citando" id="cc-at-citando" hidden><div class="cc-at-cita"><strong>Respondendo a</strong><span id="cc-at-citando-txt"></span></div><button type="button" class="cc-ibtn cc-at-citando-x" data-tirar-citacao aria-label="Não citar">×</button></div>`;

function formAnexo(action: string, chave: string, ocultos: string): string {
  return `<form class="cc-form cc-at-anexo" method="POST" action="${escapeHtml(action)}" enctype="multipart/form-data" data-envio-midia data-max-foto="${LIMITE_IMAGEM_BYTES}" data-max="${LIMITE_MIDIA_BYTES}">
        <input type="hidden" name="chave" value="${escapeHtml(chave)}">${ocultos}<input type="hidden" name="citando" value="">
        <div class="cc-at-anexo-prev" id="cc-at-anexo-prev" hidden></div>
        <div class="cc-at-anexo-lin">
          <label class="cc-btn cc-btn-sm cc-at-clipe" title="Foto até 5 MB · PDF, Word, Excel, áudio e vídeo até 16 MB">📎 Anexar<input type="file" name="arquivo" id="cc-at-arquivo" accept="${escapeHtml(ACEITA_NO_SELETOR)}"></label>
          <button type="button" class="cc-btn cc-btn-sm cc-at-gravar" id="cc-at-gravar" hidden>🎤 Gravar áudio</button>
          <input type="text" name="legenda" id="cc-at-legenda" class="cc-at-legenda" maxlength="${LIMITE_LEGENDA}" placeholder="Legenda (opcional)" aria-label="Legenda do arquivo">
          <button type="submit" class="cc-btn cc-at-enviar cc-at-enviar-arq">Enviar arquivo</button>
        </div>
      </form>`;
}

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
        <input type="hidden" name="chave" value="${escapeHtml(c.chave)}">${campoCanal}<input type="hidden" name="citando" value="">
        <textarea name="texto" id="cc-at-texto" rows="2" maxlength="${LIMITE_TEXTO}" required placeholder="Escreva sua resposta…" aria-label="Sua resposta"></textarea>
        <button type="submit" class="cc-btn cc-at-enviar">Enviar</button>
      </form>`
    : '';
  // Arquivo: as mesmas regras do texto (no número da Eva, só dentro da janela de 24 h).
  const anexo = !bloqueioTexto ? formAnexo(`/dashboard/leads/${lead.id}/responder-midia`, c.chave, campoCanal) : '';
  const modelo = bloqueioModelo ? '' : formModelo(lead.id, c, lead.name ?? '', !!bloqueioTexto);
  const prontas = !bloqueioTexto || !bloqueioModelo ? chipsProntas(c, lead.name, !!bloqueioTexto) : '';

  return `<footer class="cc-at-compor cc-at-compor-on" id="responder">
      ${banner}
      ${trocaNumero}
      ${faixaJanela}
      ${prontas}
      ${formTexto ? CAIXA_CITANDO : ''}
      ${formTexto}
      ${anexo}
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
export function blocoMensagens(mensagens: MensagemChat[], assistente: string, nomeCliente: string, temArquivos: boolean, donoPessoal: string | null, soDono = false, acoes = false, digitando: 'digitando' | 'gravando' | null = null,
  /** Mídia antiga da Eva: os anexos do lead para casar com os balões "[Enviou uma foto]". */
  antigas: { leadId: string; anexos: AnexoDoLead[] } | null = null): string {
  // W3: "digitando…" / "gravando áudio…" no fim da conversa (quando o WhatsApp avisa).
  const dig = digitando ? `<div class="cc-at-digitando" role="status" aria-live="polite"><span class="cc-at-dig-pts" aria-hidden="true"><i></i><i></i><i></i></span>${escapeHtml(nomeCliente)} está ${digitando === 'gravando' ? 'gravando áudio…' : 'digitando…'}</div>` : '';
  if (mensagens.length === 0 && dig) return dig;
  if (mensagens.length === 0) {
    return soDono
      ? `<div class="cc-at-vazio">${estadoVazio({ tipo: 'vazio', titulo: 'Nenhuma mensagem ainda.', compacto: true })}</div>`
      : `<div class="cc-at-vazio">${estadoVazio({ tipo: 'vazio', titulo: 'Nenhuma mensagem ainda.', texto: `Quando o cliente escrever no WhatsApp, a conversa aparece aqui.`, compacto: true })}</div>`;
  }
  const canais = new Set(mensagens.map((m) => m.canal).filter(Boolean));
  const mostrarCanal = !soDono && canais.size > 1;
  const casadas = antigas ? casarMidiaAntiga(mensagens, antigas.anexos) : new Map<number, AnexoDoLead>();
  let diaAnterior = '';
  return mensagens.map((m, i) => {
    let sep = '';
    if (m.timestamp && Number.isFinite(Date.parse(m.timestamp))) {
      const dia = rotuloDia(m.timestamp);
      if (dia !== diaAnterior) { sep = `<div class="cc-at-dia"><span>${escapeHtml(dia)}</span></div>`; diaAnterior = dia; }
    }
    // Conversa do número pessoal com quem não é lead: quem responde é o dono (nunca a assistente).
    const mm = soDono && m.role === 'assistant' && m.autor !== 'humano' ? { ...m, autor: 'humano' as const, autorNome: m.autorNome ?? donoPessoal } : m;
    const anx = casadas.get(i);
    return sep + balao(mm, assistente, nomeCliente, temArquivos, mostrarCanal, donoPessoal, acoes, anx && antigas ? corpoDaMidiaAntiga(antigas.leadId, anx, m.content) : null);
  }).join('') + dig;
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
    <header class="cc-at-chat-topo" tabindex="-1">
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

/** Anexos do lead para casar com os balões antigos da Eva (só metadados; a URL é a rota protegida). */
function antigasDo(lead: Pick<LeadDetail, 'id' | 'anexos'>): { leadId: string; anexos: AnexoDoLead[] } | null {
  const anexos = (lead.anexos ?? []).filter((a) => a && a.id && a.created_at);
  return anexos.length ? { leadId: lead.id, anexos } : null;
}

/** W2: citar/reagir aparece para quem pode responder por algum número. */
function podeAgirNoChat(envio: CompositorInput | undefined): boolean {
  return !!envio && envio.via !== 'nenhum';
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
  /** W3: o cliente está digitando / gravando agora (aviso do WhatsApp). */
  digitando?: 'digitando' | 'gravando' | null;
}): { topo: string; msgs: string; compor: string; estado: string } {
  const { assistente, assistenteMin } = nomesDaAssistente(p.user);
  const temArquivos = (p.lead.anexos ?? []).length > 0;
  return {
    topo: topoDoChat(p.lead, p.mensagens, assistente, assistenteMin, p.envio, p.donoPessoal ?? null, can(p.user, 'leads', 'editar')),
    msgs: blocoMensagens(p.mensagens, assistente, p.lead.name ?? 'Sem nome', temArquivos, p.donoPessoal ?? null, false, podeAgirNoChat(p.envio), p.digitando ?? null, antigasDo(p.lead)),
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

function colunaChat(lead: LeadDetail, mensagens: MensagemChat[], assistente: string, assistenteMin: string, envio: CompositorInput | undefined, donoPessoal: string | null, podeEditar: boolean, eu: string | null = null, agendaHtml = ''): string {
  const nome = lead.name ?? 'Sem nome';
  const temArquivos = (lead.anexos ?? []).length > 0;
  const corpo = blocoMensagens(mensagens, assistente, nome, temArquivos, donoPessoal, false, podeAgirNoChat(envio), null, antigasDo(lead));
  const topo = topoDoChat(lead, mensagens, assistente, assistenteMin, envio, donoPessoal, podeEditar);
  // Sem recarregar: o script busca os pedaços desta conversa (mesmo número da resposta).
  const estado = envio ? estadoDoCompositor(lead, mensagens, envio) : '';
  const vivo = envio
    ? ` data-conversa="/dashboard/leads/${escapeHtml(lead.id)}/conversa.json?canal=${escapeHtml(envio.canal)}" data-estado="${escapeHtml(estado)}" data-assinatura="${assinaturaDaConversa({ topo, msgs: corpo, estado })}"${podeAgirNoChat(envio) ? ` data-reagir="/dashboard/leads/${escapeHtml(lead.id)}/reagir"` : ''}${eu ? ` data-eu="${escapeHtml(eu)}"` : ''}`
    : '';
  return `<section class="cc-at-col cc-at-chat" id="conversa" aria-label="Conversa"${vivo}>
    <nav class="cc-at-abas-cel" aria-label="Navegação do atendimento">
      <a class="cc-at-voltar" href="/dashboard/leads/conversas" aria-label="Voltar para a lista">${icone('chev', 'sm')}Conversas</a>
      <a class="cc-at-aba cc-at-aba-conversa" href="/dashboard/leads/${escapeHtml(lead.id)}">Conversa</a>
      <a class="cc-at-aba cc-at-aba-resumo" href="#resumo">Resumo</a>
    </nav>
    ${topo}
    ${agendaHtml}
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

function blocoArquivos(leadId: string, anexos: LeadDetail['anexos'], temMidiaNoChat = false): string {
  if ((!anexos || anexos.length === 0) && !temMidiaNoChat) return '';
  anexos = anexos ?? [];
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
    const baixar = ID_MSG_OK.test(leadId) && ID_MSG_OK.test(a.id) ? botaoBaixar(`/dashboard/leads/${leadId}/anexo/${a.id}`, rotulo) : '';
    return `<div class="cc-at-anx" title="${escapeHtml(a.descricao ?? '')}">${prev}<small>${escapeHtml(rotulo)}${quando ? ` · ${escapeHtml(quando)}` : ''}</small>${baixar}</div>`;
  };
  // ⬇ Baixar tudo: um .zip com as fotos e os PDFs do lead (cofre + conversa), nomes amigáveis.
  const tudo = ID_MSG_OK.test(leadId) ? `<a class="cc-btn cc-btn-sm cc-at-baixar-tudo" href="/dashboard/leads/${leadId}/arquivos.zip" download>⬇ Baixar tudo (.zip)</a>` : '';
  return secao(`Arquivos (${anexos.length})`, `${tudo}${anexos.length ? `<div class="cc-at-anx-grade">${anexos.map(card).join('')}</div>` : '<p class="cc-at-nada">As fotos e os PDFs da conversa entram no .zip.</p>'}`, 'arquivos');
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

function colunaCockpit(lead: LeadDetail, servicos: ServicoDoLead[], assistente: string, assistenteMin: string, temMidiaNoChat = false): string {
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
    ${blocoArquivos(lead.id, lead.anexos, temMidiaNoChat)}
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
  /** Pedidos de agendamento deste lead esperando a confirmação do admin (28/09/2026). */
  agendamentos?: PedidoAgendaPainel[];
  /** Resultado da última ação num pedido (vem na URL depois do POST). */
  agendaMsg?: string;
  /**
   * Troca suave (28/09): o navegador pediu SÓ o miolo (chat + resumo) para
   * trocar de contato sem recarregar — sem menu, sem lista, sem scripts. A rota
   * é a MESMA (mesmas travas de empresa/vendedor/dono do número).
   */
  soMiolo?: boolean;
}

export interface PedidoAgendaPainel {
  id: string;
  tipo: 'visita' | 'meet';
  /** Já formatado ("quinta (01/10), às 14h"). */
  quando: string;
  endereco?: string;
  resumo?: string;
}

/**
 * "Agendamento aguardando sua confirmação" (28/09/2026). A Eva não marca mais
 * sozinha: o pedido espera o admin. Os mesmos botões do WhatsApp; só o admin
 * da empresa responde (os outros veem o aviso).
 */
export function blocoAgendaPendente(leadId: string, pedidos: PedidoAgendaPainel[], podeResponder: boolean, msg?: string): string {
  const flash = msg ? `<div class="cc-aviso cc-aviso-info cc-at-agenda" role="status">${escapeHtml(msg)}</div>` : '';
  if (pedidos.length === 0) return flash;
  const itens = pedidos.map((p) => {
    const acao = `/dashboard/leads/${escapeHtml(leadId)}/agendamento/${escapeHtml(p.id)}`;
    const botao = (valor: string, rotulo: string, classe: string) =>
      `<form method="POST" action="${acao}"><input type="hidden" name="acao" value="${valor}"><button type="submit" class="cc-btn ${classe} cc-btn-sm">${rotulo}</button></form>`;
    const botoes = podeResponder
      ? `<div class="cc-at-agenda-botoes">
          ${botao('ok', '✅ Confirmar e avisar', 'cc-btn-gold')}
          ${botao('eu', '📞 Eu mesmo aviso', 'cc-btn-ghost')}
          ${botao('nao', '❌ Não posso', 'cc-btn-crit')}
          <form method="POST" action="${acao}" class="cc-at-agenda-sugerir"><input type="hidden" name="acao" value="outro"><input name="sugestao" required maxlength="200" placeholder="Outro horário (ex.: sexta 10h)" aria-label="Sugerir outro horário"><button type="submit" class="cc-btn cc-btn-ghost cc-btn-sm">🕐 Sugerir</button></form>
        </div>`
      : '<div class="cc-faint">Só o administrador da empresa confirma.</div>';
    return `<div class="cc-at-agenda-item">
      <strong>${p.tipo === 'meet' ? '🎥 Google Meet' : '🚗 Visita técnica'} — ${escapeHtml(p.quando)}</strong>
      ${p.endereco ? `<div class="cc-muted">📍 ${escapeHtml(p.endereco)}</div>` : ''}
      ${p.resumo ? `<div class="cc-muted">📝 ${escapeHtml(p.resumo)}</div>` : ''}
      ${botoes}
    </div>`;
  }).join('');
  return `${flash}<div class="cc-aviso cc-aviso-atencao cc-at-agenda" role="status" id="cc-agenda-pendente">${icone('alert', 'sm')}<div><strong>Agendamento aguardando sua confirmação</strong>
    <div class="cc-muted">O cliente escolheu o horário e ouviu que vocês vão confirmar. Nada foi marcado na agenda ainda.</div>${itens}</div></div>`;
}

/** Cabeçalho que o script da troca suave manda para pedir só o miolo. */
export const CABECALHO_MIOLO = 'X-Atendimento-Miolo';

/** Lista vazia para o miolo (a lista da página aberta continua a mesma). */
export const LISTA_VAZIA: ListaConversas = { itens: [], contagem: { todas: 0, aguardando: 0, meus: 0, porEtapa: {} } };

/** O pedido veio da troca suave (quer só o miolo)? PURA. */
export function pedeSoMiolo(ler: (nome: string) => string | undefined): boolean {
  return ler(CABECALHO_MIOLO) === '1';
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
      ${CAIXA_CITANDO}
      <form class="cc-form cc-at-resp" method="POST" action="/dashboard/leads/conversas/contato/responder" data-envio>
        <input type="hidden" name="chave" value="${escapeHtml(c.chave)}"><input type="hidden" name="citando" value="">
        <input type="hidden" name="telefone" value="${escapeHtml(ct.telefone)}">
        <textarea name="texto" id="cc-at-texto" rows="2" maxlength="${LIMITE_TEXTO}" required placeholder="Escreva sua resposta…" aria-label="Sua resposta"></textarea>
        <button type="submit" class="cc-btn cc-at-enviar">Enviar</button>
      </form>
      ${formAnexo('/dashboard/leads/conversas/contato/responder-midia', c.chave, `<input type="hidden" name="telefone" value="${escapeHtml(ct.telefone)}">`)}
      <p class="cc-at-nota">Conversa do seu WhatsApp: só você vê. A ${escapeHtml(assistente)} não responde aqui.</p>
    </footer>`
    : `<footer class="cc-at-compor cc-at-compor-on" id="responder">${banner}<div class="cc-at-compor-campo cc-at-bloq" aria-disabled="true">${icone('alert', 'xs')}<span>Seu WhatsApp não está conectado agora. <a class="cc-link" href="/dashboard/whatsapp/pessoal">Conectar</a></span></div>${linkZap}</footer>`;
}

/** Pedaços da conversa com quem não é lead, pra trocar sem recarregar. */
export function pedacosDoContato(p: { user: DashUser | undefined; contato: ContatoPessoalTela; donoPessoal?: string | null; digitando?: 'digitando' | 'gravando' | null }): { msgs: string; compor: string; estado: string } {
  const { assistente } = nomesDaAssistente(p.user);
  const nome = p.contato.nome || formatPhoneBR(p.contato.telefone);
  return {
    msgs: blocoMensagens(p.contato.mensagens, assistente, nome, false, p.donoPessoal ?? null, true, p.contato.envio?.via === 'evolution', p.digitando ?? null),
    compor: compositorContato(p.contato, p.donoPessoal ?? null, assistente),
    estado: p.contato.envio?.via === 'evolution' ? 'pessoal|livre' : 'pessoal|desconectado',
  };
}

function colunaChatContato(ct: ContatoPessoalTela, donoPessoal: string | null, assistente: string, eu: string | null = null): string {
  const nome = ct.nome || formatPhoneBR(ct.telefone);
  const corpo = blocoMensagens(ct.mensagens, assistente, nome, false, donoPessoal, true, ct.envio?.via === 'evolution');
  const estado = ct.envio?.via === 'evolution' ? 'pessoal|livre' : 'pessoal|desconectado';
  const vivo = ct.envio ? ` data-conversa="/dashboard/leads/conversas/contato.json?contato=${encodeURIComponent(ct.telefone)}" data-estado="${escapeHtml(estado)}" data-assinatura="${assinaturaDaConversa({ msgs: corpo, estado })}"${ct.envio.via === 'evolution' ? ` data-reagir="/dashboard/leads/conversas/contato/reagir" data-telefone="${escapeHtml(ct.telefone)}"` : ''}${eu ? ` data-eu="${escapeHtml(eu)}"` : ''}` : '';
  return `<section class="cc-at-col cc-at-chat" id="conversa" aria-label="Conversa"${vivo}>
    <nav class="cc-at-abas-cel" aria-label="Navegação do atendimento">
      <a class="cc-at-voltar" href="/dashboard/leads/conversas" aria-label="Voltar para a lista">${icone('chev', 'sm')}Conversas</a>
    </nav>
    <header class="cc-at-chat-topo" tabindex="-1">
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
  const raiz = `cc-root cc-at${lead || ct ? ' cc-at-com-lead' : ''}`;
  // nome de quem escreve: o balão "enviando…" já nasce igual ao de verdade ("Junior · pelo painel")
  const eu = p.user?.nome?.trim() || null;
  // Aviso de agendamento esperando o admin (28/09): DENTRO da coluna do chat, pra
  // vir junto na troca suave de contato (o miolo troca só chat + resumo).
  const agendaHtml = lead ? blocoAgendaPendente(lead.id, p.agendamentos ?? [], Boolean(p.user?.isAdmin) && can(p.user, 'leads', 'editar'), p.agendaMsg) : '';
  const colChat = lead ? colunaChat(lead, mensagens, assistente, assistenteMin, p.envio, p.donoPessoal ?? null, can(p.user, 'leads', 'editar'), eu, agendaHtml) : ct ? colunaChatContato(ct, p.donoPessoal ?? null, assistente, eu) : chatSemLead();
  const colResumo = lead ? colunaCockpit(lead, p.servicos ?? [], assistente, assistenteMin, mensagens.some((m) => { const md = (m as MensagemChat).midia; return !!md && (md.tipo === 'imagem' || md.tipo === 'documento'); })) : ct ? cockpitContato(ct, p.donoPessoal ?? null) : cockpitSemLead();
  const modais = `${lead && !CLIENTE_STATUSES.includes(String(lead.installation_status ?? '')) ? modalFechou(lead) : ''}
    ${lead && lead.status !== 'perdido' ? modalPerdido(lead, assistente) : ''}`;
  const titulo = lead ? `Conversa: ${lead.name ?? 'Sem nome'}` : ct ? `Conversa: ${ct.nome || formatPhoneBR(ct.telefone)}` : 'Conversas';
  if (p.soMiolo) {
    // Troca suave: só o título, as colunas do chat e do resumo e as janelinhas
    // (sem menu, sem lista, sem scripts — a página aberta já tem tudo isso).
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(titulo)}</title></head><body><div class="${raiz}"><div class="cc-at-grade">${colChat}${colResumo}</div>${modais}</div></body></html>`;
  }
  const body = `<div class="${raiz}">
    ${cabecalho}
    <div class="cc-at-grade">
      ${colunaLista(p.lista, p.filtros, lead?.id ?? null, assistente, ct?.telefone ?? null, p.donoPessoal ?? null)}
      ${colChat}
      ${colResumo}
    </div>
    ${modais}
  </div>`;

  // Alças das colunas + rolar o chat até a última mensagem + ampliar foto +
  // responder sem recarregar + TROCAR DE CONTATO sem recarregar (28/09). Vão
  // sempre (mesmo sem lead aberto): a troca suave pode abrir uma conversa depois.
  const script = `<script>${SCRIPT_COLUNAS}</script><script>(function(){function fim(){var c=document.getElementById('cc-at-msgs');if(c){c.scrollTop=c.scrollHeight;}}fim();window.addEventListener('load',fim);})();</script><script>${SCRIPT_AMPLIAR}</script><script>${SCRIPT_RESPONDER}</script><script>${SCRIPT_TROCA}</script>`;

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
function alca(e){var a=e.target&&e.target.closest?e.target.closest('.cc-at-alca'):null;return a&&g.contains(a)?a:null;}
aplicar();
/* Ouvintes no documento (um só de cada): a alça do resumo é trocada junto com a coluna na troca suave. */
document.addEventListener('pointerdown',function(ev){var a=alca(ev);if(!a)return;
  var k=a.getAttribute('data-lado'),col=a.parentElement;
  ev.preventDefault();var x0=ev.clientX,l0=col.getBoundingClientRect().width;
  try{a.setPointerCapture(ev.pointerId);}catch(x){}document.body.classList.add('cc-at-arrastando');
  function mover(e){var d=e.clientX-x0;w[k]=limitar(k,k==='l'?l0+d:l0-d);aplicar();}
  function soltar(){a.removeEventListener('pointermove',mover);a.removeEventListener('pointerup',soltar);a.removeEventListener('pointercancel',soltar);document.body.classList.remove('cc-at-arrastando');gravar(w);}
  a.addEventListener('pointermove',mover);a.addEventListener('pointerup',soltar);a.addEventListener('pointercancel',soltar);
});
document.addEventListener('dblclick',function(e){var a=alca(e);if(!a)return;delete w[a.getAttribute('data-lado')];aplicar();gravar(w);});
document.addEventListener('keydown',function(e){var a=alca(e);if(!a)return;
  if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;e.preventDefault();
  var k=a.getAttribute('data-lado'),col=a.parentElement;
  var atual=w[k]||col.getBoundingClientRect().width,passo=e.key==='ArrowRight'?20:-20;
  w[k]=limitar(k,k==='l'?atual+passo:atual-passo);aplicar();gravar(w);
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
var chat=null,URLC=null,assin=null,URLR=null,TELR=null,enviando=false,buscando=false,geracao=0,parados=0,tiques=0,nav=0,contB=0,rascunhos={};
var podeFetch=!!(window.fetch&&window.FormData&&window.URLSearchParams);
function rolar(){var c=document.getElementById('cc-at-msgs');if(c)c.scrollTop=c.scrollHeight;}
function noFim(c){return c.scrollHeight-c.scrollTop-c.clientHeight<120;}
function pedaco(html){var t=document.createElement('template');t.innerHTML=html;return t.content;}
function lista(p){return Array.prototype.slice.call(p.children);}
/* Balões novos SEM trocar o chat inteiro: o que não mudou fica (foto, áudio tocando, rolagem); só entra/sai/troca o diferente. */
function igual(o,n){var a=o.querySelectorAll('details'),b=n.querySelectorAll('details');for(var k=0;k<a.length&&k<b.length;k++){if(a[k].open)b[k].open=true;}return o.isEqualNode(n);}
/* até 12 itens à frente: vários balões novos no meio (fila da assistente atrasada) ou vários que saíram */
function achaNovo(ns,de,o){for(var k=de;k<ns.length&&k<de+12;k++){if(igual(o,ns[k]))return k;}return -1;}
function achaVelho(os,de,n){for(var k=de;k<os.length&&k<de+12;k++){if(igual(os[k],n))return k;}return -1;}
function aplicarMsgs(c,html){var ns=lista(pedaco(html)),os=lista(c),i=0,j=0,n,o,k;
while(j<ns.length){n=ns[j];o=os[i];
if(!o){c.appendChild(n);j++;continue;}
if(igual(o,n)){i++;j++;continue;}
k=achaNovo(ns,j+1,o);if(k>0){while(j<k){c.insertBefore(ns[j],o);j++;}continue;}
k=achaVelho(os,i+1,n);if(k>0){while(i<k){c.removeChild(os[i]);i++;}continue;}
c.replaceChild(n,o);i++;j++;}
while(i<os.length){c.removeChild(os[i]);i++;}}
function aviso(html){var f=document.getElementById('responder');if(!f)return;f.querySelectorAll('.cc-at-aviso-envio').forEach(function(x){x.remove();});if(!html)return;var d=document.createElement('div');d.className='cc-at-aviso-envio';d.setAttribute('role','status');d.innerHTML=html;f.insertBefore(d,f.firstChild);}
function horaAgora(){var d=new Date();return ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2);}
function balao(texto){var c=document.getElementById('cc-at-msgs');if(!c)return null;var v=c.querySelector('.cc-at-vazio');if(v)v.remove();
var dias=c.querySelectorAll('.cc-at-dia'),ult=dias.length?dias[dias.length-1]:null;
if(!ult||(ult.textContent||'').trim()!=='Hoje'){var sd=document.createElement('div');sd.className='cc-at-dia';var ss=document.createElement('span');ss.textContent='Hoje';sd.appendChild(ss);c.appendChild(sd);}
var d=document.createElement('div');d.className='cc-at-msg cc-at-msg-eva cc-at-msg-hum cc-at-msg-otimista';
var q=document.createElement('div');q.className='cc-at-msg-q';q.textContent=((chat&&chat.getAttribute('data-eu'))||'Você')+' · pelo painel';
var r=document.createElement('span');r.className='cc-at-acoes-btn';r.setAttribute('aria-hidden','true');r.setAttribute('style','visibility:hidden');r.textContent='⋯';q.appendChild(r);
var t=document.createElement('div');t.className='cc-at-msg-t';t.textContent=texto;
var h=document.createElement('div');h.className='cc-at-msg-h';h.textContent=horaAgora()+' · enviando…';
d.appendChild(q);d.appendChild(t);d.appendChild(h);c.appendChild(d);rolar();return d;}
function marcar(d,ok,motivo){if(!d)return;var h=d.querySelector('.cc-at-msg-h');if(ok){h.textContent=horaAgora()+' ✓';return;}
var f=document.createElement('div');f.className='cc-at-msg-falha';f.textContent='⚠ não saiu — '+(motivo||'tente de novo.');d.insertBefore(f,h);h.textContent='';}
function novaChave(k){if(!k)return;var f=document.getElementById('responder');if(f)f.querySelectorAll('input[name=chave]').forEach(function(i){i.value=k;});}
function trocarRodape(html,estado){var f=document.getElementById('responder');if(!f||!chat||typeof html!=='string')return;var novo=pedaco(html).querySelector('#responder');if(!novo)return;
var ia=document.getElementById('cc-at-arquivo');if(grav||(ia&&ia.files&&ia.files.length))estado=null;
if(estado&&chat.getAttribute('data-estado')!==estado){var ta=document.getElementById('cc-at-texto'),txt=ta?ta.value:'',foco=document.activeElement===ta;f.parentNode.replaceChild(novo,f);chat.setAttribute('data-estado',estado);var nt=document.getElementById('cc-at-texto');if(nt&&txt){nt.value=txt;}if(nt&&foco)nt.focus();atualizarPrevia();return;}
var jv=f.querySelector('.cc-at-janela'),jn=novo.querySelector('.cc-at-janela');if(jv&&jn&&!jv.isEqualNode(jn))jv.parentNode.replaceChild(jn,jv);}
function buscar(depoisDeEnviar){if(!URLC||buscando||!window.fetch)return;if(enviando&&!depoisDeEnviar)return;buscando=true;var g=geracao,meuB=++contB;
var u=URLC+(URLC.indexOf('?')>=0?'&':'?')+'assinatura='+encodeURIComponent(assin||'')+(document.hasFocus&&document.hasFocus()?'&foco=1':'');
return fetch(u,{credentials:'same-origin',headers:{'Accept':'application/json'}}).then(function(r){return r.ok?r.json():null;}).then(function(j){
if(!j||g!==geracao)return;if(j.irPara){if(!(window.ccAtTroca&&window.ccAtTroca.ir(j.irPara)))location.href=j.irPara;return;}if(j.igual){parados++;return;}parados=0;assin=j.assinatura||null;
var c=document.getElementById('cc-at-msgs'),fim=!!c&&(depoisDeEnviar||noFim(c));
if(typeof j.topo==='string'){var t=document.getElementById('cc-at-topo'),n=pedaco(j.topo).querySelector('#cc-at-topo');if(t&&n&&!t.isEqualNode(n))t.parentNode.replaceChild(n,t);}
trocarRodape(j.compor,j.estado);
if(c&&typeof j.msgs==='string')aplicarMsgs(c,j.msgs);if(fim)rolar();
if(typeof j.msgs==='string'&&j.msgs.indexOf('cc-at-digitando')>=0){setTimeout(function(){if(!document.hidden&&g===geracao)buscar(false);},3000);}
}).catch(function(){}).then(function(){if(meuB===contB)buscando=false;});}
/* Troca de contato sem recarregar (SCRIPT_TROCA): antes de trocar as colunas, desmontar; depois, montar a conversa nova. */
function chaveR(u){return u?u.replace(/([?&])canal=[^&]*&?/,'$1').replace(/[?&]$/,''):u;}
function montar(){chat=document.getElementById('conversa');URLC=chat?chat.getAttribute('data-conversa'):null;assin=chat?chat.getAttribute('data-assinatura'):null;
URLR=chat?chat.getAttribute('data-reagir'):null;TELR=chat?chat.getAttribute('data-telefone'):null;enviando=false;buscando=false;contB++;geracao++;parados=0;
if(chat){chat.classList.add('cc-at-js');if(window.MediaRecorder&&navigator.mediaDevices&&navigator.mediaDevices.getUserMedia)chat.classList.add('cc-at-pode-gravar');}
var ta=document.getElementById('cc-at-texto'),k=chaveR(URLC);if(ta&&k&&rascunhos[k]&&!ta.value)ta.value=rascunhos[k];
rolar();}
function desmontar(){var ta=document.getElementById('cc-at-texto'),k=chaveR(URLC);if(k){if(ta&&ta.value.trim())rascunhos[k]=ta.value;else delete rascunhos[k];}
nav++;geracao++;fecharMenu();if(grav){var g0=grav;grav=null;g0.cancelado=true;if(g0.cancelar)g0.cancelar();}limparPrev();tirarCitacao();}
/* Envio que não saiu enquanto o usuário estava noutra conversa: o texto volta (no campo, se ela já está aberta de novo). */
function guardar(u,texto){var k=chaveR(u);if(!k||!texto)return;if(k===chaveR(URLC)){var ta=document.getElementById('cc-at-texto');if(ta&&!ta.value){ta.value=texto;aviso('<div class="cc-aviso cc-aviso-atencao">A última mensagem não saiu — o texto voltou para o campo.</div>');return;}}if(!rascunhos[k])rascunhos[k]=texto;}
document.addEventListener('submit',function(e){var f=e.target&&e.target.closest?e.target.closest('form[data-envio]'):null;if(!f)return;
var b=f.querySelector('button[type=submit]');
if(!podeFetch){if(b){if(b.disabled){e.preventDefault();return;}setTimeout(function(){b.disabled=true;b.textContent='Enviando…';},0);}return;}
e.preventDefault();if(enviando)return;
var ta=f.querySelector('textarea[name=texto]'),pv=document.getElementById('cc-at-previa');
var texto=ta?ta.value.trim():(pv?pv.textContent:'');if(ta&&!texto){ta.focus();return;}
enviando=true;geracao++;parados=0;var n0=nav,u0=URLC,rot=b?b.textContent:'';if(b){b.disabled=true;b.textContent='Enviando…';}
var corpo=new URLSearchParams(new FormData(f)).toString();
var d=balao(texto);aviso('');if(ta){ta.value='';ta.focus();}
return fetch(f.getAttribute('action'),{method:'POST',credentials:'same-origin',headers:{'Accept':'application/json','Content-Type':'application/x-www-form-urlencoded'},body:corpo})
.then(function(r){return r.json().catch(function(){return {ok:false,texto:'resposta inesperada do servidor. Recarregue a página.'};});})
.then(function(j){var jaFoi=j.resultado==='duplicado';if(n0!==nav){if(ta&&!j.ok&&!jaFoi)guardar(u0,texto);return;}
novaChave(j.chave);marcar(d,!!j.ok||jaFoi,j.texto);if(j.ok||jaFoi)tirarCitacao();if(jaFoi){aviso(j.avisoHtml||'');}
else if(!j.ok){aviso(j.avisoHtml||'');if(ta&&!ta.value)ta.value=texto;}
if(j.ok||jaFoi||j.resultado==='falhou'){assin=null;buscando=false;geracao++;buscar(true);}})
.catch(function(){if(n0!==nav){if(ta)guardar(u0,texto);return;}marcar(d,false,'sem conexão com o painel. Confira a internet e tente de novo.');if(ta&&!ta.value)ta.value=texto;})
.then(function(){if(n0!==nav)return;enviando=false;if(b&&document.body.contains(b)){b.disabled=false;b.textContent=rot||'Enviar';}});});
function atualizarPrevia(){var sel=document.getElementById('cc-at-modelo-sel'),nome=document.getElementById('cc-at-modelo-nome'),prev=document.getElementById('cc-at-previa'),custo=document.getElementById('cc-at-modelo-custo');if(!sel||!prev)return;var o=sel.options[sel.selectedIndex];if(!o)return;var n=(nome&&nome.value.trim())||'tudo bem';var t=o.getAttribute('data-texto')||'';prev.textContent=t?t.split('{nome}').join(n):'O texto deste modelo está na Meta (nome: '+n+').';if(custo)custo.textContent=o.getAttribute('data-custo')||'';}
document.addEventListener('change',function(e){if(e.target&&e.target.id==='cc-at-modelo-sel')atualizarPrevia();});
document.addEventListener('input',function(e){if(e.target&&e.target.id==='cc-at-modelo-nome')atualizarPrevia();});
document.addEventListener('click',function(e){var b=e.target&&e.target.closest?e.target.closest('[data-pronta]'):null;if(!b||b.disabled)return;
var t=document.getElementById('cc-at-texto');if(t){t.value=b.getAttribute('data-texto')||'';t.focus();try{t.setSelectionRange(t.value.length,t.value.length);}catch(x){}return;}
var m=b.getAttribute('data-modelo'),sel=document.getElementById('cc-at-modelo-sel');if(sel&&m){sel.value=m;atualizarPrevia();var d=sel.closest('details');if(d)d.open=true;sel.focus();}});
document.addEventListener('keydown',function(e){var t=e.target;if(!t||t.id!=='cc-at-texto')return;if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();var f=t.form;if(f){if(f.requestSubmit)f.requestSubmit();else f.submit();}}});
var grav=null,urlPrev=null;
function formArq(){return document.querySelector('form[data-envio-midia]');}
function inArq(){return document.getElementById('cc-at-arquivo');}
function tamanho(b){return b<1024?b+' B':b<1048576?Math.round(b/1024)+' KB':(b/1048576).toFixed(1).replace('.',',')+' MB';}
function limparPrev(){var p=document.getElementById('cc-at-anexo-prev');if(p){p.innerHTML='';p.hidden=true;}if(urlPrev){try{URL.revokeObjectURL(urlPrev);}catch(x){}urlPrev=null;}var f=formArq();if(f)f.classList.remove('cc-at-tem');}
function mostrarPrev(file){var f=formArq(),p=document.getElementById('cc-at-anexo-prev');if(!f||!p)return;limparPrev();
var ehFoto=/^image\\//.test(file.type),lim=Number(f.getAttribute(ehFoto?'data-max-foto':'data-max'))||0;
var erro=lim&&file.size>lim?'Arquivo grande demais ('+tamanho(file.size)+'). '+(ehFoto?'Foto até 5 MB.':'Até 16 MB.'):'';
var el;if(window.URL&&URL.createObjectURL&&/^(image|audio|video)\\//.test(file.type)){urlPrev=URL.createObjectURL(file);}
if(ehFoto&&urlPrev){el=document.createElement('img');el.src=urlPrev;el.alt='Prévia da foto';}
else if(/^audio\\//.test(file.type)&&urlPrev){el=document.createElement('audio');el.controls=true;el.src=urlPrev;}
else if(/^video\\//.test(file.type)&&urlPrev){el=document.createElement('video');el.controls=true;el.muted=true;el.src=urlPrev;}
else{el=document.createElement('span');el.className='cc-at-anexo-ic';el.textContent='📄';}
var info=document.createElement('div');info.className='cc-at-anexo-info';var n=document.createElement('strong');n.textContent=file.name||'arquivo';var t=document.createElement('small');t.textContent=tamanho(file.size)+' · confira antes de enviar';info.appendChild(n);info.appendChild(t);
if(erro){var e2=document.createElement('div');e2.className='cc-at-msg-falha';e2.textContent='⚠ '+erro;info.appendChild(e2);}
var x=document.createElement('button');x.type='button';x.className='cc-ibtn cc-at-anexo-x';x.setAttribute('aria-label','Tirar o arquivo');x.textContent='×';x.addEventListener('click',function(){var i=inArq();if(i)i.value='';limparPrev();});
p.appendChild(el);p.appendChild(info);p.appendChild(x);p.hidden=false;f.classList.add('cc-at-tem');
if(/^audio\\//.test(file.type))f.classList.add('cc-at-sem-legenda');else f.classList.remove('cc-at-sem-legenda');
var b=f.querySelector('button[type=submit]');if(b)b.disabled=!!erro;var lg=document.getElementById('cc-at-legenda');if(lg&&!erro)lg.focus();}
function porArquivo(file){var i=inArq();if(!i||!file)return;try{var dt=new DataTransfer();dt.items.add(file);i.files=dt.files;}catch(x){aviso('<div class="cc-aviso cc-aviso-atencao">Este navegador não deixa colar/arrastar arquivo. Use o botão 📎 Anexar.</div>');return;}mostrarPrev(file);}
document.addEventListener('change',function(e){if(e.target&&e.target.id==='cc-at-arquivo'){var fl=e.target.files&&e.target.files[0];if(fl)mostrarPrev(fl);else limparPrev();}});
function noChat(e){return !!(chat&&e.target&&e.target.closest&&e.target.closest('#conversa'));}
['dragenter','dragover'].forEach(function(ev){document.addEventListener(ev,function(e){if(!noChat(e)||!inArq()||!e.dataTransfer)return;var ts=e.dataTransfer.types||[];if(Array.prototype.indexOf.call(ts,'Files')<0)return;e.preventDefault();chat.classList.add('cc-at-soltar');});});
document.addEventListener('dragleave',function(e){if(chat&&(!e.relatedTarget||!chat.contains(e.relatedTarget)))chat.classList.remove('cc-at-soltar');});
document.addEventListener('drop',function(e){if(!noChat(e))return;chat.classList.remove('cc-at-soltar');var fs=e.dataTransfer&&e.dataTransfer.files;if(!inArq()||!fs||!fs[0])return;e.preventDefault();porArquivo(fs[0]);});
document.addEventListener('paste',function(e){var t=e.target;if(!inArq()||!t||(t.id!=='cc-at-texto'&&t.id!=='cc-at-legenda'))return;var cd=e.clipboardData,fs=cd&&cd.files;if(!fs||!fs[0])return;if(cd.getData&&cd.getData('text'))return;e.preventDefault();porArquivo(fs[0]);});
document.addEventListener('click',function(e){var g=e.target&&e.target.closest?e.target.closest('#cc-at-gravar'):null;if(!g)return;if(grav){if(grav.parar)grav.parar();return;}
var meu={pendente:true};grav=meu;
navigator.mediaDevices.getUserMedia({audio:true}).then(function(st){
if(meu.cancelado||grav!==meu){st.getTracks().forEach(function(x){x.stop();});return;}
var tipos=['audio/ogg;codecs=opus','audio/webm;codecs=opus','audio/webm','audio/mp4'],tipo='';for(var k=0;k<tipos.length;k++){if(MediaRecorder.isTypeSupported&&MediaRecorder.isTypeSupported(tipos[k])){tipo=tipos[k];break;}}
var mr=tipo?new MediaRecorder(st,{mimeType:tipo}):new MediaRecorder(st),partes=[],ini=Date.now(),tm=null;
mr.ondataavailable=function(ev){if(ev.data&&ev.data.size)partes.push(ev.data);};
mr.onstop=function(){if(tm)clearInterval(tm);st.getTracks().forEach(function(x){x.stop();});if(meu.cancelado)return;grav=null;var bt=document.getElementById('cc-at-gravar');if(bt){bt.textContent='🎤 Gravar áudio';bt.classList.remove('cc-at-gravando');}
var mt=(mr.mimeType||tipo||'audio/webm').split(';')[0],ext=mt.indexOf('ogg')>=0?'ogg':mt.indexOf('mp4')>=0?'m4a':'webm';if(partes.length)porArquivo(new File(partes,'gravacao.'+ext,{type:mt}));};
function rel(){var s=Math.floor((Date.now()-ini)/1000),bt=document.getElementById('cc-at-gravar');if(bt)bt.textContent='⏹ Parar ('+Math.floor(s/60)+':'+('0'+(s%60)).slice(-2)+')';if(s>=300&&mr.state!=='inactive')mr.stop();}
meu.pendente=false;meu.parar=function(){if(mr.state!=='inactive')mr.stop();};meu.cancelar=function(){if(tm)clearInterval(tm);if(mr.state!=='inactive')mr.stop();else st.getTracks().forEach(function(x){x.stop();});};
mr.start(1000);g.classList.add('cc-at-gravando');rel();tm=setInterval(rel,500);
}).catch(function(){if(grav===meu)grav=null;if(meu.cancelado)return;aviso('<div class="cc-aviso cc-aviso-erro">Não consegui usar o microfone. Libere o microfone no navegador ou anexe um arquivo de áudio.</div>');});});
document.addEventListener('submit',function(e){var f=e.target&&e.target.closest?e.target.closest('form[data-envio-midia]'):null;if(!f)return;
var i=inArq();if(!i||!i.files||!i.files[0]){e.preventDefault();if(i)i.click();return;}
if(!podeFetch)return;e.preventDefault();if(enviando)return;
var b=f.querySelector('button[type=submit]'),file=i.files[0],lg=document.getElementById('cc-at-legenda'),leg=lg?lg.value.trim():'';
enviando=true;geracao++;parados=0;var n0=nav,rot=b?b.textContent:'';if(b){b.disabled=true;b.textContent='Enviando…';}
var fd=new FormData(f),ic=/^image\\//.test(file.type)?'📷 ':/^audio\\//.test(file.type)?'🎤 ':/^video\\//.test(file.type)?'🎬 ':'📄 ';
var d=balao(ic+(file.name||'arquivo')+(leg?'\\n'+leg:''));aviso('');
return fetch(f.getAttribute('action'),{method:'POST',credentials:'same-origin',headers:{'Accept':'application/json'},body:fd})
.then(function(r){return r.json().catch(function(){return {ok:false,texto:'resposta inesperada do servidor. Recarregue a página.'};});})
.then(function(j){if(n0!==nav)return;novaChave(j.chave);var jaFoi=j.resultado==='duplicado';marcar(d,!!j.ok||jaFoi,j.texto);
if(j.ok||jaFoi){i.value='';if(lg)lg.value='';limparPrev();tirarCitacao();}else{aviso(j.avisoHtml||'');}
if(j.ok||jaFoi||j.resultado==='falhou'){assin=null;buscando=false;geracao++;buscar(true);}})
.catch(function(){if(n0!==nav)return;marcar(d,false,'sem conexão com o painel. Confira a internet e tente de novo.');})
.then(function(){if(n0!==nav)return;enviando=false;if(b&&document.body.contains(b)){b.disabled=false;b.textContent=rot||'Enviar arquivo';}});});
var menuAc=null,EMOJIS=['👍','❤️','😂','😮','😢','🙏'];
function fecharMenu(){if(menuAc){menuAc.remove();menuAc=null;}}
function textoDoBalao(b){var t=b.querySelector('.cc-at-msg-t'),m=b.querySelector('.cc-at-midia,.cc-at-doc-txt strong');var s=(t&&t.textContent)||(b.querySelector('.cc-at-foto')?'📷 Foto':b.querySelector('audio')?'🎤 Áudio':b.querySelector('video')?'🎬 Vídeo':(m&&m.textContent)||'mensagem');return s.trim().slice(0,160);}
function citar(b){var id=b.getAttribute('data-msg');if(!id)return;var f=document.getElementById('responder');if(!f)return;f.querySelectorAll('input[name=citando]').forEach(function(i){i.value=id;});
var cx=document.getElementById('cc-at-citando'),tx=document.getElementById('cc-at-citando-txt');if(cx&&tx){var q=b.querySelector('.cc-at-msg-q');var quem=q?(q.firstChild&&q.firstChild.textContent||'').trim():'';tx.textContent=(quem?quem+': ':'')+textoDoBalao(b);cx.hidden=false;}
var ta=document.getElementById('cc-at-texto');if(ta)ta.focus();}
function tirarCitacao(){var f=document.getElementById('responder');if(f)f.querySelectorAll('input[name=citando]').forEach(function(i){i.value='';});var cx=document.getElementById('cc-at-citando');if(cx)cx.hidden=true;}
function reagir(b,emoji){if(!URLR||!window.fetch)return;var id=b.getAttribute('data-msg');if(!id)return;var n0=nav,p=new URLSearchParams();p.set('alvo',id);p.set('emoji',emoji);if(TELR)p.set('telefone',TELR);
fetch(URLR,{method:'POST',credentials:'same-origin',headers:{'Accept':'application/json','Content-Type':'application/x-www-form-urlencoded'},body:p.toString()})
.then(function(r){return r.json().catch(function(){return {ok:false};});}).then(function(j){if(n0!==nav)return;if(j&&j.ok){assin=null;buscando=false;geracao++;buscar(true);}else{aviso((j&&j.avisoHtml)||'<div class="cc-aviso cc-aviso-erro">A reação não saiu. Tente de novo.</div>');}})
.catch(function(){if(n0===nav)aviso('<div class="cc-aviso cc-aviso-erro">Sem conexão com o painel.</div>');});}
function abrirMenu(b,ancora){fecharMenu();var m=document.createElement('div');m.className='cc-at-menu-msg';m.setAttribute('role','menu');
var r=document.createElement('button');r.type='button';r.className='cc-at-menu-resp';r.setAttribute('role','menuitem');r.textContent='↩ Responder';r.addEventListener('click',function(){fecharMenu();citar(b);});m.appendChild(r);
var linha=document.createElement('div');linha.className='cc-at-menu-emojis';EMOJIS.forEach(function(em){var e=document.createElement('button');e.type='button';e.setAttribute('role','menuitem');e.setAttribute('aria-label','Reagir '+em);e.textContent=em;e.addEventListener('click',function(){fecharMenu();reagir(b,em);});linha.appendChild(e);});
m.appendChild(linha);
if(b.querySelector('.cc-at-reacoes')){var t=document.createElement('button');t.type='button';t.className='cc-at-menu-tirar';t.textContent='Tirar minha reação';t.addEventListener('click',function(){fecharMenu();reagir(b,'');});m.appendChild(t);}
document.body.appendChild(m);var rr=(ancora||b).getBoundingClientRect(),w=m.offsetWidth||240,h=m.offsetHeight||90;
var x=Math.max(8,Math.min(window.innerWidth-w-8,rr.right-w)),y=rr.bottom+6;if(y+h>window.innerHeight-8)y=Math.max(8,rr.top-h-6);m.style.left=x+'px';m.style.top=y+'px';menuAc=m;var pb=m.querySelector('button');if(pb)pb.focus();}
document.addEventListener('click',function(e){var t=e.target;if(!t||!t.closest)return;
if(t.closest('[data-tirar-citacao]')){tirarCitacao();return;}
var bt=t.closest('[data-acoes]');if(bt){e.preventDefault();var b=bt.closest('[data-msg]');if(b)abrirMenu(b,bt);return;}
if(menuAc&&!t.closest('.cc-at-menu-msg'))fecharMenu();});
document.addEventListener('keydown',function(e){if(e.key==='Escape')fecharMenu();});
/* UM relógio só, para a conversa que estiver aberta (a troca de contato não cria outro). */
if(window.fetch){setInterval(function(){tiques++;if(!URLC||document.hidden||enviando)return;if(parados>=4&&tiques%3!==0)return;buscar(false);},8000);document.addEventListener('visibilitychange',function(){if(!document.hidden)buscar(false);});}
window.ccAtChat={montar:montar,desmontar:desmontar};
montar();
})();`;

/**
 * W1 — foto do chat: tocar amplia na própria tela (janelinha escura; Esc,
 * toque fora ou ✕ fecha). Sem JavaScript o link abre a foto numa aba nova.
 * A janelinha é criada pelo script (nada novo no HTML da página).
 */
export const SCRIPT_AMPLIAR = `(function(){
var dlg=null;
function fechar(){if(dlg){dlg.classList.remove('cc-on');var i=dlg.querySelector('img');if(i)i.removeAttribute('src');}}
function abrir(src){if(!dlg){dlg=document.createElement('div');dlg.className='cc-at-luz';dlg.setAttribute('role','dialog');dlg.setAttribute('aria-modal','true');dlg.setAttribute('aria-label','Foto ampliada');
var b=document.createElement('button');b.type='button';b.className='cc-ibtn cc-at-luz-x';b.setAttribute('aria-label','Fechar');b.textContent='×';
var im=document.createElement('img');im.alt='Foto ampliada';dlg.appendChild(b);dlg.appendChild(im);document.body.appendChild(dlg);
dlg.addEventListener('click',function(e){if(e.target!==im)fechar();});}
dlg.querySelector('img').setAttribute('src',src);dlg.classList.add('cc-on');dlg.querySelector('button').focus();}
document.addEventListener('click',function(e){var a=e.target&&e.target.closest?e.target.closest('[data-ampliar]'):null;if(!a)return;if(e.ctrlKey||e.metaKey||e.shiftKey)return;e.preventDefault();abrir(a.getAttribute('href'));});
document.addEventListener('keydown',function(e){if(e.key==='Escape')fechar();});
})();`;

/**
 * TROCAR DE CONTATO SEM RECARREGAR (Junior 28/09: "ao clicar noutro contato a
 * tela pisca" — era a página inteira sendo trocada). Clicar num nome da lista
 * (ou em "Responder como") busca a MESMA rota do contato pedindo só o miolo
 * (cabeçalho X-Atendimento-Miolo: 1 — mesmas travas de empresa, vendedor e
 * dono do número pessoal) e troca SÓ as colunas do chat e do resumo:
 *  - a lista da esquerda não é redesenhada (rolagem, busca e filtros ficam);
 *    o item clicado ganha o destaque na hora;
 *  - endereço novo no histórico (voltar/avançar funcionam), título novo, foco
 *    no cabeçalho do chat, chat rolado até o fim;
 *  - o script do chat é desmontado/montado (um relógio só, sem ouvinte duplo;
 *    o rascunho de cada conversa fica guardado enquanto a página está aberta);
 *  - demorou (> 120 ms)? esqueleto leve no chat, nunca tela branca; clicou
 *    noutro no meio do caminho? o pedido anterior é cancelado;
 *  - deu errado (rede, sessão vencida, lead de outro vendedor…)? navegação
 *    normal. Ctrl/⌘/Shift/botão do meio: comportamento normal do navegador.
 */
export const SCRIPT_TROCA = `(function(){
var grade=document.querySelector('.cc-at-grade'),raiz=grade&&grade.closest?grade.closest('.cc-at'):null;
if(!grade||!raiz||!window.fetch||!window.DOMParser||!window.URL||!window.history||!history.pushState)return;
var RE=/^\\/dashboard\\/leads\\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,LISTA='/dashboard/leads/conversas';
var ctrl=null,seq=0,pendente=false,tEsq=null,atual=location.pathname+location.search;
function chave(u){return u.pathname+u.search;}
function lista(p){return Array.prototype.slice.call(p.children);}
function podeTrocar(u){if(u.origin!==location.origin)return false;if(RE.test(u.pathname))return true;return u.pathname===LISTA&&!!u.searchParams.get('contato');}
function col(sel,doc){var g=(doc||document).querySelector('.cc-at-grade');if(!g)return null;for(var i=0;i<g.children.length;i++){if(g.children[i].matches(sel))return g.children[i];}return null;}
function mesmo(a,b){return a.pathname===b.pathname&&(a.pathname!==LISTA||a.searchParams.get('contato')===b.searchParams.get('contato'));}
function destacar(u){var its=grade.querySelectorAll('.cc-at-item');for(var i=0;i<its.length;i++){var a=its[i],on=mesmo(new URL(a.getAttribute('href'),location.href),u);
a.classList.toggle('cc-on',on);if(on)a.setAttribute('aria-current','true');else a.removeAttribute('aria-current');}}
function esqueleto(on){var c=col('.cc-at-chat'),r=col('.cc-at-cockpit');if(r)r.classList.toggle('cc-at-carregando',on);if(!c)return;c.classList.toggle('cc-at-carregando',on);
var x=c.querySelector('.cc-at-esq');if(!on){if(x)x.remove();c.removeAttribute('aria-busy');return;}var m=c.querySelector('.cc-at-msgs');if(x||!m)return;
x=document.createElement('div');x.className='cc-at-esq';x.setAttribute('aria-hidden','true');x.style.top=m.offsetTop+'px';x.style.height=m.offsetHeight+'px';
[['cli',46],['eva',34],['cli',58],['eva',40],['cli',30]].forEach(function(k){var b=document.createElement('div');b.className='cc-at-esq-b cc-at-esq-'+k[0];b.style.width=k[1]+'%';x.appendChild(b);});
c.appendChild(x);c.setAttribute('aria-busy','true');}
function focar(c){var h=c&&c.querySelector('.cc-at-chat-topo');if(!h)return;if(!h.hasAttribute('tabindex'))h.setAttribute('tabindex','-1');try{h.focus({preventScroll:true});}catch(e){h.focus();}}
function parar(){seq++;if(ctrl){try{ctrl.abort();}catch(e){}}ctrl=null;pendente=false;clearTimeout(tEsq);esqueleto(false);}
function ir(href,empurrar,rolagem){var u=new URL(href,location.href),meu=++seq;
if(ctrl){try{ctrl.abort();}catch(e){}}ctrl=window.AbortController?new AbortController():null;pendente=true;
destacar(u);clearTimeout(tEsq);tEsq=setTimeout(function(){if(meu===seq)esqueleto(true);},120);
return fetch(chave(u),{credentials:'same-origin',headers:{'X-Atendimento-Miolo':'1','Accept':'text/html'},signal:ctrl?ctrl.signal:undefined})
.then(function(r){if(!r.ok)throw new Error('http '+r.status);var fim=r.url?new URL(r.url):u;return r.text().then(function(t){return {t:t,fim:fim};});})
.then(function(x){if(meu!==seq)return;
var doc=new DOMParser().parseFromString(x.t,'text/html'),nc=col('.cc-at-chat',doc),nr=col('.cc-at-cockpit',doc),vc=col('.cc-at-chat'),vr=col('.cc-at-cockpit');
if(!nc||!nr||!vc||!vr||x.fim.origin!==location.origin||(!podeTrocar(x.fim)&&x.fim.pathname!==LISTA))throw new Error('sem colunas');
if(!empurrar&&chave(new URL(location.href))!==chave(u))return;
clearTimeout(tEsq);if(window.ccAtChat)window.ccAtChat.desmontar();
nc=document.adoptNode(nc);nr=document.adoptNode(nr);vc.parentNode.replaceChild(nc,vc);vr.parentNode.replaceChild(nr,vr);
var nraiz=doc.querySelector('.cc-at');lista(raiz).forEach(function(m){if(m.classList.contains('cc-modal'))m.remove();});if(nraiz)lista(nraiz).forEach(function(m){if(m.classList.contains('cc-modal'))raiz.appendChild(document.adoptNode(m));});raiz.classList.toggle('cc-at-com-lead',!!(nraiz&&nraiz.classList.contains('cc-at-com-lead')));
var tt=(doc.title||'').split(' · ')[0],k=document.title.indexOf(' · ');if(tt)document.title=tt+(k>=0?document.title.slice(k):'');
var destino=chave(x.fim)+(x.fim.pathname===u.pathname?u.hash:'');atual=chave(x.fim);
if(empurrar&&destino!==location.pathname+location.search+location.hash){try{history.replaceState({ccAt:1,y:window.scrollY},'');}catch(e){}history.pushState({ccAt:1},'',destino);}
else if(empurrar)history.replaceState(history.state,'',destino);
else if(destino!==location.pathname+location.search+location.hash)history.replaceState(history.state,'',destino);
if(!mesmo(x.fim,u))destacar(x.fim);
if(window.ccAtChat)window.ccAtChat.montar();
if(typeof rolagem==='number')window.scrollTo(0,rolagem);else if(window.innerWidth<=900)window.scrollTo(0,0);
focar(nc);})
.catch(function(e){if(e&&e.name==='AbortError')return;if(meu!==seq)return;location.href=href;})
.then(function(){if(meu===seq){pendente=false;clearTimeout(tEsq);esqueleto(false);}});}
document.addEventListener('click',function(e){if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
var a=e.target&&e.target.closest?e.target.closest('a[href]'):null;if(!a||!grade.contains(a))return;
var volta=a.classList.contains('cc-at-voltar')||!!a.closest('.cc-at-abas-voltar');
if(!a.classList.contains('cc-at-item')&&!a.closest('.cc-at-como')&&!volta)return;
if((a.target&&a.target!=='_self')||a.hasAttribute('download'))return;
var u=new URL(a.getAttribute('href'),location.href);
/* "‹ Conversas" (notebook/celular): volta para a lista sem recarregar, com os mesmos filtros. */
if(volta&&u.origin===location.origin&&u.pathname===LISTA&&!u.search){var aq=new URL(location.href).searchParams;['filtro','etapa','q'].forEach(function(k){if(aq.get(k))u.searchParams.set(k,aq.get(k));});e.preventDefault();if(chave(u)!==atual||pendente)ir(u.href,true);return;}
if(!podeTrocar(u))return;
e.preventDefault();if(chave(u)===atual&&!pendente){focar(col('.cc-at-chat'));return;}
ir(u.href,true);});
window.addEventListener('popstate',function(e){var u=new URL(location.href);if(chave(u)===atual){if(pendente){parar();destacar(u);}return;}
if(!podeTrocar(u)&&u.pathname!==LISTA){location.reload();return;}
ir(location.href,false,e.state&&typeof e.state.y==='number'?e.state.y:undefined);});
window.ccAtTroca={ir:function(h){var u=new URL(h,location.href);if(!podeTrocar(u))return false;ir(u.href,true);return true;},
  /* redesenha o miolo da conversa aberta (depois de Assumir/Devolver), sem esqueleto nem histórico novo */
  recarregar:function(){ir(location.href,false);}};
/* Aviso de agendamento (✅/📞/❌/🕐) sem recarregar: o MESMO POST; depois redesenha o miolo e mostra o resultado. */
document.addEventListener('submit',function(e){var f=e.target;if(!f||!f.closest||!f.closest('.cc-at-agenda'))return;var ac=f.getAttribute('action')||'';
if(!/^\\/dashboard\\/leads\\/[0-9a-f-]{36}\\/agendamento\\/[0-9a-f-]{36}$/i.test(ac))return;e.preventDefault();
var bs=f.closest('.cc-at-agenda').querySelectorAll('button');for(var i=0;i<bs.length;i++)bs[i].disabled=true;
fetch(ac,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(new FormData(f)).toString()})
.then(function(r){if(!r.ok)throw new Error('http');var msg='';try{msg=new URL(r.url).searchParams.get('agenda')||'';}catch(x){}
return ir(location.href,false).then(function(){var c=col('.cc-at-chat');if(!c||!msg)return;var d=document.createElement('div');d.className='cc-aviso cc-aviso-info cc-at-agenda';d.setAttribute('role','status');d.textContent=msg;
var m=c.querySelector('.cc-at-msgs');if(m)c.insertBefore(d,m);else c.appendChild(d);});}).catch(function(){f.submit();});});
/* ✋ Assumir / ↩ Devolver sem recarregar: o MESMO POST (o servidor confere tudo); depois o miolo é redesenhado. */
document.addEventListener('submit',function(e){var f=e.target;if(!f||!f.closest||!f.closest('#cc-at-topo'))return;var ac=f.getAttribute('action')||'';
if(!/^\\/dashboard\\/leads\\/[0-9a-f-]{36}\\/(pause|resume)-eva$/i.test(ac))return;e.preventDefault();var b=f.querySelector('button[type=submit]');if(b)b.disabled=true;
fetch(ac,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(new FormData(f)).toString()})
.then(function(r){if(!r.ok)throw new Error('http');ir(location.href,false);}).catch(function(){f.submit();});});
})();`;

/** CSS só do Atendimento — mora em ui/css-atendimento.ts (vai por arquivo, no <head>). */
export { CSS_ATENDIMENTO } from './ui/css-atendimento.js';
