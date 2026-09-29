// Rotas PÚBLICAS do leitor por IA do programa "Gerador de Relatórios Solar" (SunBright):
//   POST /api/leitor/conta          → números que faltaram na conta de luz em foto
//   POST /api/leitor/monitoramento  → geração do mês num print de monitoramento
//
// Quem pode: o programa com a LICENÇA GRS2 válida para aquele computador (assinatura Ed25519
// conferida aqui, com a chave pública), ou em avaliação (sem licença) com limites menores.
// A licença e o código do computador vêm nos CABEÇALHOS e são conferidos — junto com os limites —
// ANTES de ler o corpo: pedido sem direito é recusado sem ocupar memória com as imagens.
// A chave da Anthropic fica só aqui (ANTHROPIC_API_KEY do servidor) — o programa não tem chave.
//
// LGPD: a imagem vai para a API da Anthropic (EUA) só para a leitura e NÃO é gravada aqui — nem em
// banco, nem em disco, nem em log. O log traz só: rota, licença (id) ou "avaliação" (resumo do
// código), modelo, tempo, tokens, custo aproximado e sucesso/falha.
//
// Montado ANTES do express.json global (limite próprio, menor) e antes do rewrite do host
// dashboard.* → funciona em propostas.ecosunpower.eng.br e em dashboard.ecosunpower.eng.br.

import express, { Router, type NextFunction, type Request, type Response } from 'express';
import { createHash } from 'node:crypto';
import { validarPedidoConta, validarPedidoPrint } from './contrato.js';
import { normalizarCodigo, verificarLicencaGrs } from './licenca-grs.js';
import { LimitesLeitor, MENSAGEM_LIMITE, type Quem } from './limites.js';
import { lerConta, lerPrint, ErroLeitura, modelosDoAmbiente, type ClienteClaude, type UsoIa } from './leitor.js';
import { custoCentsBRL } from '../custos/ia-metering.js';

export interface OpcoesLeitorIa {
  /** null = sem chave da Anthropic no servidor → 503 (o programa segue como hoje). */
  claude: ClienteClaude | null;
  modelos?: { 1: string; 2: string };
  limites?: LimitesLeitor;
  /** Desliga a rota inteira (LEITOR_IA_DESLIGADO=1): 503. */
  desligado?: boolean;
  /** Ids de licença bloqueados (LEITOR_IA_LICENCAS_BLOQUEADAS=ID1,ID2) — chave vazada, cliente que saiu. */
  licencasBloqueadas?: string[];
  /** Cabeçalho com o IP real (LEITOR_IA_IP_HEADER, ex.: cf-connecting-ip atrás do Cloudflare). Padrão: último do X-Forwarded-For. */
  cabecalhoIp?: string;
  agora?: () => Date;
  /** Uma linha por leitura (observabilidade). Padrão: console.log('[leitor-ia] …'). */
  log?: (registro: Record<string, unknown>) => void;
  /** Custo em custos_ia_uso (best-effort). Padrão: nada (index.ts liga o medirIa). */
  medir?: (a: { modelo: string; origem: string; usage: UsoIa }) => void;
  chavePublica?: string;
}

const MSG_LICENCA: Record<string, string> = {
  formato: 'A chave de licença não está no formato certo.',
  assinatura: 'A chave de licença não é válida.',
  produto: 'Esta chave é de outro programa.',
  expirada: 'A licença venceu — peça a renovação para usar a leitura por IA.',
  computador: 'Esta licença não é deste computador.',
  bloqueada: 'A leitura por IA não está liberada para esta licença. Fale com a EcoSunPower.',
};

/** Maior corpo aceito (10 imagens de até ~3,7 MB em base64 + campos). */
export const MAX_CORPO = 13 * 1024 * 1024;

/** IP do cliente: o ÚLTIMO do X-Forwarded-For é o que o proxy (Traefik) viu — os anteriores o cliente pode inventar. */
export function ipDoPedido(req: Request, cabecalho?: string): string {
  if (cabecalho) {
    const v = String(req.headers[cabecalho.toLowerCase()] ?? '').trim();
    if (v) return v.slice(0, 64);
  }
  const xff = String(req.headers['x-forwarded-for'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return (xff[xff.length - 1] || req.socket?.remoteAddress || '?').slice(0, 64);
}

/** Para o log: id da licença ou um resumo curto do computador (não é dado pessoal, mas nem isso vai inteiro). */
const quemNoLog = (q: Quem) => (q.tipo === 'licenca' ? `licenca:${q.id}` : `avaliacao:${createHash('sha256').update(q.computador).digest('hex').slice(0, 8)}`);
const rotaDo = (req: Request) => (req.path.endsWith('/monitoramento') ? 'monitoramento' : 'conta');

interface Autorizado { quem: Quem; liberar: () => void }

export function criarRotasLeitorIa(o: OpcoesLeitorIa): Router {
  const router = Router();
  const modelos = o.modelos ?? modelosDoAmbiente();
  const limites = o.limites ?? new LimitesLeitor();
  const agora = o.agora ?? (() => new Date());
  const log = o.log ?? ((r) => console.log('[leitor-ia]', JSON.stringify(r)));
  const bloqueadas = new Set((o.licencasBloqueadas ?? []).map((s) => s.trim().toUpperCase()).filter(Boolean));
  const recusar = (res: Response, status: number, erro: string, mensagem: string) => { res.status(status).json({ ok: false, erro, mensagem }); };

  // 1) Portaria, ANTES de ler o corpo: rota ligada, enxurrada por IP, tamanho, licença e limites.
  router.post(['/api/leitor/conta', '/api/leitor/monitoramento'], (req: Request, res: Response, next: NextFunction) => {
    const rota = rotaDo(req);
    if (o.desligado || !o.claude) { recusar(res, 503, 'indisponivel', 'A leitura por IA não está disponível agora.'); return; }
    const ip = ipDoPedido(req, o.cabecalhoIp);
    if (!limites.contarPedido(ip)) { recusar(res, 429, 'limite', MENSAGEM_LIMITE['ip-minuto']); log({ rota, ok: false, motivo: 'limite-ip-minuto' }); return; }
    const tamanho = Number(req.headers['content-length']);
    if (!Number.isFinite(tamanho) || tamanho <= 0) { recusar(res, 411, 'pedido', 'Pedido sem tamanho.'); return; }
    if (tamanho > MAX_CORPO) { recusar(res, 413, 'grande', 'Imagem grande demais.'); log({ rota, ok: false, motivo: 'grande' }); return; }
    const computador = normalizarCodigo(String(req.headers['x-grs-computador'] ?? ''));
    if (!computador) { recusar(res, 401, 'licenca', 'Código do computador inválido.'); log({ rota, ok: false, motivo: 'computador-invalido' }); return; }
    const chave = String(req.headers['x-grs-licenca'] ?? '').trim();
    let quem: Quem;
    if (chave) {
      if (chave.length > 4000) { recusar(res, 401, 'licenca', MSG_LICENCA.formato); return; }
      const v = verificarLicencaGrs(chave, computador, agora(), o.chavePublica);
      if (!v.ok) { recusar(res, 401, 'licenca', MSG_LICENCA[v.motivo]); log({ rota, ok: false, motivo: `licenca-${v.motivo}` }); return; }
      if (bloqueadas.has(v.id)) { recusar(res, 403, 'licenca', MSG_LICENCA.bloqueada); log({ rota, quem: `licenca:${v.id}`, ok: false, motivo: 'licenca-bloqueada' }); return; }
      quem = { tipo: 'licenca', id: v.id };
    } else {
      quem = { tipo: 'avaliacao', computador };
    }
    const r = limites.reservar(quem, ip);
    if (!r.ok) { recusar(res, 429, 'limite', MENSAGEM_LIMITE[r.motivo]); log({ rota, quem: quemNoLog(quem), ok: false, motivo: `limite-${r.motivo}` }); return; }
    // A vaga de "ao mesmo tempo" volta quando a resposta termina (ou a conexão cai), aconteça o que acontecer.
    res.on('close', r.liberar);
    res.locals.leitorIa = { quem, liberar: r.liberar } satisfies Autorizado;
    next();
  });

  // 2) Só então o corpo (limite próprio).
  router.use('/api/leitor', express.json({ limit: MAX_CORPO }));
  // Erro ao ler o corpo: resposta em JSON (o programa entende), sem HTML nem detalhe interno.
  router.use('/api/leitor', (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const e = err as { type?: string };
    if (e?.type === 'entity.too.large') { recusar(res, 413, 'grande', 'Imagem grande demais.'); return; }
    recusar(res, 400, 'pedido', 'Pedido em formato errado.');
  });

  /** O programa desistiu (prazo, fechou): a chamada à IA para — não paga leitura que ninguém vai ver. */
  function abortarSeSair(res: Response): AbortSignal {
    const c = new AbortController();
    res.on('close', () => { if (!res.writableFinished) c.abort(); });
    return c.signal;
  }

  function registrar(base: Record<string, unknown>, modelo: string, uso: UsoIa | undefined, t0: number) {
    const custoCentavos = uso ? custoCentsBRL(modelo, uso) : 0;
    limites.registrarCusto(custoCentavos);
    const hoje = limites.resumo();
    log({ ...base, modelo, ms: Date.now() - t0, tokensEntrada: uso?.input_tokens ?? 0, tokensSaida: uso?.output_tokens ?? 0, custoCentavos, hojeLeituras: hoje.total, hojeCentavos: hoje.gastoCentavos });
    if (uso && o.medir) o.medir({ modelo, origem: `leitor-ia:${String(base.rota)}`, usage: uso });
  }

  router.post('/api/leitor/conta', async (req: Request, res: Response) => {
    const t0 = Date.now();
    const a = res.locals.leitorIa as Autorizado;
    const v = validarPedidoConta(req.body);
    if (!v.ok) { recusar(res, 400, 'pedido', v.mensagem); log({ rota: 'conta', quem: quemNoLog(a.quem), ok: false, motivo: 'pedido' }); return; }
    const p = v.pedido;
    const modelo = modelos[p.nivel];
    const base = { rota: 'conta', quem: quemNoLog(a.quem), versao: p.versao, nivel: p.nivel, imagens: p.imagens.length, campos: p.campos.length };
    try {
      const r = await lerConta(o.claude!, modelo, p, abortarSeSair(res));
      const lidos = Object.values(r.valores).filter((x) => x !== null).length;
      registrar({ ...base, ok: true, lidos }, modelo, r.uso, t0);
      res.json({ ok: true, valores: r.valores });
    } catch (e) {
      const motivo = e instanceof ErroLeitura ? e.motivo : 'erro';
      registrar({ ...base, ok: false, motivo }, modelo, (e as { uso?: UsoIa }).uso, t0);
      recusar(res, 502, 'ia', 'A leitura por IA falhou agora.');
    } finally {
      a.liberar();
    }
  });

  router.post('/api/leitor/monitoramento', async (req: Request, res: Response) => {
    const t0 = Date.now();
    const a = res.locals.leitorIa as Autorizado;
    const v = validarPedidoPrint(req.body);
    if (!v.ok) { recusar(res, 400, 'pedido', v.mensagem); log({ rota: 'monitoramento', quem: quemNoLog(a.quem), ok: false, motivo: 'pedido' }); return; }
    const p = v.pedido;
    // Print de app: número grande, o modelo mais barato dá conta.
    const modelo = modelos[1];
    const base = { rota: 'monitoramento', quem: quemNoLog(a.quem), versao: p.versao, imagens: p.imagens.length };
    try {
      const r = await lerPrint(o.claude!, modelo, p, abortarSeSair(res));
      registrar({ ...base, ok: true, lidos: r.leitura ? 1 : 0 }, modelo, r.uso, t0);
      res.json({ ok: true, leitura: r.leitura });
    } catch (e) {
      const motivo = e instanceof ErroLeitura ? e.motivo : 'erro';
      registrar({ ...base, ok: false, motivo }, modelo, (e as { uso?: UsoIa }).uso, t0);
      recusar(res, 502, 'ia', 'A leitura por IA falhou agora.');
    } finally {
      a.liberar();
    }
  });

  // Qualquer erro que escape das rotas: JSON genérico (sem HTML nem detalhe interno).
  router.use('/api/leitor', (_err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (!res.headersSent) recusar(res, 500, 'ia', 'A leitura por IA falhou agora.');
  });

  return router;
}
