// src/modules/dashboard/energia-rotas.ts
//
// Rotas da Gestão de Energia (G1). Fora do router.ts pra serem testadas com
// req/res falsos (mesmo molde de command-center-rotas.ts); o router só monta.
//
// Portões:
//  - módulo contratado "medicao" (MODULO_DA_ROTA '/energia' → trava central do
//    router: tenant sem o módulo vê a vitrine);
//  - papel: usinas:visualizar pra ver, usinas:editar pra cadastrar/editar;
//  - dado: TODA consulta leva o company_id da SESSÃO (energia-queries.ts) e o
//    banco é o bancoDoOperador (RLS quando o crachá por empresa estiver ligado).
//    Medidor de outra empresa = 404 (não existe pra quem não é dono).
//
// Segredos: a chave da nuvem Shelly entra só pelo formulário, sai cifrada e
// nunca volta (nem no HTML, nem no JSON do "Testar conexão", nem no log). O
// token do medidor aparece UMA vez (resposta com no-store) e só o hash fica.

import type { Request, Response, Router, RequestHandler } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthedRequest } from './auth.js';
import { can } from './permissions.js';
import { bancoDoOperador } from '../tenant-client.js';
import {
  listarMedidores, carregarMedidor, listarUsinas, nomeDaUsina, carregarDadosCasa, criarMedidor, atualizarMedidor,
  type MedidorTela,
} from './energia-queries.js';
import { renderListaMedidores, renderFormMedidor, renderTokenGerado, renderEnergiaDaCasa } from './energia-views.js';
import { validarFormMedidor } from '../energia/form-medidor.js';
import { montarPainel } from '../energia/energia-casa.js';
import { diaBrt } from '../energia/tempo.js';
import {
  chaveEnergiaValida, decifrarCred, hashToken, mascarar, normalizarDeviceId, normalizarServerUri, novoTokenMedidor,
  type CredShelly,
} from '../energia/credenciais.js';
import { getMedidorAdapter } from '../energia/medidor-registry.js';
import { perfilDetectado } from '../energia/adapters/shelly-cloud.js';
import type { MedidorAdapter, PerfilMedidor } from '../energia/types.js';
import { escapeHtml } from './ui/html.js';

export interface DepsEnergia {
  agora?: () => Date;
  /** ENERGIA_CRED_KEY (lida a cada uso: trocar a env não exige reiniciar o código). */
  keyHex?: () => string | undefined;
  adapter?: () => MedidorAdapter | null;
  urlWebhook?: string;
}

type Handler = (req: Request, res: Response) => Promise<void>;

function resolver(d: DepsEnergia) {
  return {
    agora: d.agora ?? (() => new Date()),
    keyHex: d.keyHex ?? (() => process.env.ENERGIA_CRED_KEY),
    adapter: d.adapter ?? (() => getMedidorAdapter('shelly')),
    urlWebhook: d.urlWebhook ?? `${(process.env.PROPOSAL_PUBLIC_BASE_URL ?? 'https://propostas.ecosunpower.eng.br').replace(/\/+$/, '')}/webhooks/shelly`,
  };
}

const usuario = (req: Request) => (req as AuthedRequest).dashUser;

/**
 * Aparelho já cadastrado (índice único GLOBAL, migration 136). A mensagem é a
 * mesma pra qualquer empresa e não diz de quem é — não vaza cliente de outro.
 */
export const MSG_APARELHO_JA_CADASTRADO = 'Este aparelho já está cadastrado. Fale com o suporte.';
const corpo = (req: Request) => (req.body ?? {}) as Record<string, unknown>;

function naoEncontrado(res: Response): void {
  res.status(404).type('html').send('<h2>Medidor não encontrado</h2><p><a href="/dashboard/energia">Voltar para Energia</a></p>');
}

/** Máscara da chave guardada (só os 4 últimos), se der pra abrir. Nunca a chave. */
function mascaraGuardada(m: MedidorTela, keyHex: string | undefined): { mascara: string | null; server: string | null } {
  if (!m.api_credentials_cifrado) return { mascara: null, server: null };
  if (!chaveEnergiaValida(keyHex)) return { mascara: '•••• (guardada)', server: null };
  try {
    const c = decifrarCred(m.api_credentials_cifrado, keyHex);
    return { mascara: mascarar(c.auth_key), server: c.server_uri.replace(/^https:\/\//, '') };
  } catch {
    return { mascara: '•••• (não abre com a chave atual)', server: null };
  }
}

function semCache(res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
}

// ---------------------------------------------------------------------------

export function rotaListaEnergia(supabase: SupabaseClient, d: DepsEnergia = {}): Handler {
  const r = resolver(d);
  return async (req, res) => {
    const user = usuario(req)!;
    const lista = await listarMedidores(bancoDoOperador(req as AuthedRequest, supabase), user.companyId);
    res.type('text/html').send(renderListaMedidores(lista, user, r.agora(), can(user, 'usinas', 'editar')));
  };
}

export function rotaNovoMedidor(supabase: SupabaseClient, d: DepsEnergia = {}): Handler {
  const r = resolver(d);
  return async (req, res) => {
    const user = usuario(req)!;
    const usinas = await listarUsinas(bancoDoOperador(req as AuthedRequest, supabase), user.companyId);
    res.type('text/html').send(renderFormMedidor({ modo: 'novo', usinas, cifraConfigurada: chaveEnergiaValida(r.keyHex()) }, user));
  };
}

export function rotaCriarMedidor(supabase: SupabaseClient, d: DepsEnergia = {}): Handler {
  const r = resolver(d);
  return async (req, res) => {
    const user = usuario(req)!;
    const db = bancoDoOperador(req as AuthedRequest, supabase);
    const usinas = await listarUsinas(db, user.companyId);
    const keyHex = r.keyHex();
    const v = validarFormMedidor(corpo(req), { usinas, keyHex, temCredencialGuardada: false, novo: true });
    const refazer = (erros: string[]) => res.status(400).type('text/html').send(renderFormMedidor({
      modo: 'novo', usinas, valores: v.valores, erros, cifraConfigurada: chaveEnergiaValida(keyHex),
    }, user));
    if (!v.ok) { refazer(v.erros); return; }

    const usaPush = v.dados.modo_coleta !== 'nuvem';
    const token = usaPush ? novoTokenMedidor() : null;
    const criado = await criarMedidor(db, user.companyId, {
      ...v.dados, status: 'aguardando', ...(token ? { token_ingest_hash: hashToken(token) } : {}),
    });
    if (!criado.ok) {
      refazer([criado.motivo === 'duplicado'
        ? MSG_APARELHO_JA_CADASTRADO
        : criado.motivo === 'migration' ? 'As tabelas da Gestão de Energia ainda não foram aplicadas no banco (migrations 136 e 137).' : 'Não deu para gravar agora. Tente de novo.']);
      return;
    }
    console.log(`[energia] medidor cadastrado id=${criado.id} empresa=${user.companyId} modo=${String(v.dados.modo_coleta)}`);
    if (token) {
      semCache(res);
      res.type('text/html').send(renderTokenGerado({ medidor: { id: criado.id, apelido: String(v.dados.apelido) }, token, urlWebhook: r.urlWebhook }, user));
      return;
    }
    res.redirect(`/dashboard/energia/${criado.id}`);
  };
}

export function rotaEditarMedidor(supabase: SupabaseClient, d: DepsEnergia = {}): Handler {
  const r = resolver(d);
  return async (req, res) => {
    const user = usuario(req)!;
    const db = bancoDoOperador(req as AuthedRequest, supabase);
    const c = await carregarMedidor(db, user.companyId, String(req.params.id ?? ''));
    if (!c.ok || !c.medidor) { naoEncontrado(res); return; }
    const usinas = await listarUsinas(db, user.companyId);
    const keyHex = r.keyHex();
    const g = mascaraGuardada(c.medidor, keyHex);
    res.type('text/html').send(renderFormMedidor({
      modo: 'editar', medidor: c.medidor, usinas, chaveMascarada: g.mascara, serverUriGuardado: g.server, cifraConfigurada: chaveEnergiaValida(keyHex),
    }, user));
  };
}

export function rotaSalvarMedidor(supabase: SupabaseClient, d: DepsEnergia = {}): Handler {
  const r = resolver(d);
  return async (req, res) => {
    const user = usuario(req)!;
    const db = bancoDoOperador(req as AuthedRequest, supabase);
    const c = await carregarMedidor(db, user.companyId, String(req.params.id ?? ''));
    if (!c.ok || !c.medidor) { naoEncontrado(res); return; }
    const m = c.medidor;
    const usinas = await listarUsinas(db, user.companyId);
    const keyHex = r.keyHex();
    const v = validarFormMedidor(corpo(req), { usinas, keyHex, temCredencialGuardada: !!m.api_credentials_cifrado, novo: false });
    const refazer = (erros: string[]) => {
      const g = mascaraGuardada(m, keyHex);
      res.status(400).type('text/html').send(renderFormMedidor({
        modo: 'editar', medidor: m, usinas, valores: v.valores, erros, chaveMascarada: g.mascara, serverUriGuardado: g.server, cifraConfigurada: chaveEnergiaValida(keyHex),
      }, user));
    };
    if (!v.ok) { refazer(v.erros); return; }
    const dados: Record<string, unknown> = { ...v.dados };
    // Chave nova ou cadastro corrigido: o medidor volta a ser vigiado do zero.
    if (dados.api_credentials_cifrado || m.status === 'erro' || m.status === 'credencial_invalida') {
      dados.status = m.ultima_leitura_em ? 'ok' : 'aguardando';
      dados.status_desde = r.agora().toISOString();
      dados.ultimo_erro = null;
    }
    const ok = await atualizarMedidor(db, user.companyId, m.id, dados);
    if (!ok.ok) { refazer([ok.motivo === 'duplicado' ? MSG_APARELHO_JA_CADASTRADO : 'Não deu para gravar agora. Tente de novo.']); return; }
    console.log(`[energia] medidor editado id=${m.id} empresa=${user.companyId}${dados.api_credentials_cifrado ? ' (chave da nuvem trocada)' : ''}`);
    res.redirect(`/dashboard/energia/${m.id}`);
  };
}

export function rotaNovoToken(supabase: SupabaseClient, d: DepsEnergia = {}): Handler {
  const r = resolver(d);
  return async (req, res) => {
    const user = usuario(req)!;
    const db = bancoDoOperador(req as AuthedRequest, supabase);
    const c = await carregarMedidor(db, user.companyId, String(req.params.id ?? ''));
    if (!c.ok || !c.medidor) { naoEncontrado(res); return; }
    const token = novoTokenMedidor();
    const ok = await atualizarMedidor(db, user.companyId, c.medidor.id, { token_ingest_hash: hashToken(token) });
    if (!ok.ok) { res.status(500).type('html').send('<h2>Não deu para gerar o código agora</h2><p>Tente de novo.</p>'); return; }
    console.log(`[energia] token do medidor trocado id=${c.medidor.id} empresa=${user.companyId}`);
    semCache(res);
    res.type('text/html').send(renderTokenGerado({ medidor: c.medidor, token, urlWebhook: r.urlWebhook }, user));
  };
}

const PERFIL_TEXTO: Record<PerfilMedidor, string> = { triphase: 'trifásico', monophase: 'monofásico' };

/** "Testar conexão" com a nuvem Shelly. Responde JSON; nunca ecoa a chave. */
export function rotaTestarConexao(supabase: SupabaseClient, d: DepsEnergia = {}): Handler {
  const r = resolver(d);
  return async (req, res) => {
    const user = usuario(req)!;
    const b = corpo(req);
    const responder = (ok: boolean, mensagem: string, extra: Record<string, unknown> = {}) => {
      semCache(res);
      res.status(200).json({ ok, mensagem, ...extra });
    };
    const device = normalizarDeviceId(String(b.device_id ?? ''));
    if (!/^[a-z0-9]{6,32}$/.test(device)) { responder(false, 'Preencha o código do aparelho antes de testar.'); return; }
    const perfil: PerfilMedidor = b.perfil === 'monophase' ? 'monophase' : 'triphase';
    const canal = [0, 1, 2].includes(Number(b.canal)) ? Number(b.canal) : 2;

    let cred: CredShelly | null = null;
    const authKey = String(b.auth_key ?? '').trim();
    if (authKey) {
      const server = normalizarServerUri(String(b.server_uri ?? ''));
      if (!server) { responder(false, 'O servidor tem que terminar em ".shelly.cloud" (ex.: shelly-77-eu.shelly.cloud).'); return; }
      cred = { server_uri: server, auth_key: authKey };
    } else if (b.id) {
      const c = await carregarMedidor(bancoDoOperador(req as AuthedRequest, supabase), user.companyId, String(b.id));
      if (!c.ok || !c.medidor) { responder(false, 'Medidor não encontrado.'); return; }
      const keyHex = r.keyHex();
      if (!c.medidor.api_credentials_cifrado) { responder(false, 'Este medidor ainda não tem chave da nuvem guardada. Cole a chave para testar.'); return; }
      if (!chaveEnergiaValida(keyHex)) { responder(false, 'O servidor está sem a ENERGIA_CRED_KEY — não dá para abrir a chave guardada.'); return; }
      try { cred = decifrarCred(c.medidor.api_credentials_cifrado, keyHex); } catch { responder(false, 'A chave guardada não abre com a ENERGIA_CRED_KEY atual. Cole a chave de novo.'); return; }
    } else {
      responder(false, 'Cole a "Authorization cloud key" e o servidor para testar.');
      return;
    }

    const adapter = r.adapter();
    if (!adapter) { responder(false, 'Leitor da nuvem indisponível.'); return; }
    const st = await adapter.buscarStatus(cred, [device]);
    if (!st.ok) {
      responder(false, st.invalidCredentials
        ? 'A nuvem Shelly recusou a chave. Confira a "Authorization cloud key" (ela muda quando a senha da conta muda).'
        : `Não deu para falar com a nuvem Shelly (${st.reason.replace(/^nuvem Shelly:\s*/, '')}).`);
      return;
    }
    const dev = st.devices.find((x) => normalizarDeviceId(x.id) === device);
    if (!dev) { responder(false, `A conta não mostrou o aparelho ${device}. Confira o código e se ele está nesta conta Shelly.`); return; }
    if (!dev.online || !dev.status) { responder(false, 'O aparelho está na conta, mas desligado da nuvem agora (sem internet ou sem energia).', { online: false }); return; }
    const detectado = perfilDetectado(dev.status);
    const leitura = adapter.lerCanal(dev.status, perfil, canal);
    const fase = ['A', 'B', 'C'][canal];
    if (!leitura) {
      responder(false, `Conectou, mas não achei a leitura da entrada ${fase} no perfil ${PERFIL_TEXTO[perfil]}.${detectado && detectado !== perfil ? ` O aparelho está no perfil ${PERFIL_TEXTO[detectado]}.` : ''} Confira perfil e entrada.`, { online: true, modelo: dev.modelo, perfilDetectado: detectado });
      return;
    }
    const kw = (leitura.potenciaW / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    responder(true, `Conectou! ${dev.modelo ? `Modelo ${dev.modelo}, ` : ''}perfil ${detectado ? PERFIL_TEXTO[detectado] : 'não identificado'}. Agora: ${kw} kW na entrada ${fase}.`, {
      online: true, modelo: dev.modelo, perfilDetectado: detectado,
    });
  };
}

export function rotaEnergiaDaCasa(supabase: SupabaseClient, d: DepsEnergia = {}): Handler {
  const r = resolver(d);
  return async (req, res) => {
    const user = usuario(req)!;
    const db = bancoDoOperador(req as AuthedRequest, supabase);
    const c = await carregarMedidor(db, user.companyId, String(req.params.id ?? ''));
    if (!c.ok) {
      res.type('text/html').send(renderListaMedidores(c, user, r.agora(), false));
      return;
    }
    if (!c.medidor) { naoEncontrado(res); return; }
    const agora = r.agora();
    const [dados, usinaNome] = await Promise.all([
      carregarDadosCasa(db, user.companyId, c.medidor, diaBrt(agora)),
      nomeDaUsina(db, user.companyId, c.medidor.sistema_id),
    ]);
    res.type('text/html').send(renderEnergiaDaCasa({
      medidor: c.medidor,
      usinaNome,
      painel: dados.ok ? montarPainel(dados.entrada) : null,
      falha: dados.ok ? undefined : dados.motivo,
      agora,
      podeEditar: can(user, 'usinas', 'editar'),
    }, user));
  };
}

/** Monta tudo no router do painel (poucas linhas lá). `exigir` é o portão de papel do router. */
export function montarRotasEnergia(
  router: Router,
  supabase: SupabaseClient,
  exigir: (area: 'usinas', nivel: 'visualizar' | 'editar') => RequestHandler,
  d: DepsEnergia = {},
): void {
  const seguro = (h: Handler): RequestHandler => (req, res) => {
    h(req, res).catch((err) => {
      console.error('[energia] rota falhou:', (err as Error)?.message);
      if (!res.headersSent) res.status(500).type('html').send(`<h2>Erro</h2><p>${escapeHtml('Não deu para abrir agora. Tente de novo.')}</p>`);
    });
  };
  router.get('/energia', exigir('usinas', 'visualizar'), seguro(rotaListaEnergia(supabase, d)));
  router.get('/energia/medidores/novo', exigir('usinas', 'editar'), seguro(rotaNovoMedidor(supabase, d)));
  router.post('/energia/medidores', exigir('usinas', 'editar'), seguro(rotaCriarMedidor(supabase, d)));
  router.post('/energia/medidores/testar', exigir('usinas', 'editar'), seguro(rotaTestarConexao(supabase, d)));
  router.get('/energia/medidores/:id/editar', exigir('usinas', 'editar'), seguro(rotaEditarMedidor(supabase, d)));
  router.post('/energia/medidores/:id/token', exigir('usinas', 'editar'), seguro(rotaNovoToken(supabase, d)));
  router.post('/energia/medidores/:id', exigir('usinas', 'editar'), seguro(rotaSalvarMedidor(supabase, d)));
  router.get('/energia/:id', exigir('usinas', 'visualizar'), seguro(rotaEnergiaDaCasa(supabase, d)));
}
