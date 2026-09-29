// Servidor FALSO do Atendimento (Leads › Conversas) para medir e testar no
// Chrome de verdade (puppeteer): as MESMAS telas do painel (renderLeadDetailPage,
// pedacosDaConversa, CSS por arquivo), com dados FICTÍCIOS, sem banco e sem
// segredo. Imita o que faz a tela piscar no mundo real:
//  - o HTML chega em pedaços (rede), com um tempo de servidor antes;
//  - a foto do chat passa por /leads/midia/:id → redirect p/ uma URL assinada
//    NOVA a cada pedido (como o Supabase) — ou seja, sem cache: se o balão for
//    recriado, a foto baixa de novo;
//  - responder devolve JSON (como a rota real com Accept: application/json) e
//    a conversa passa a ter a mensagem nova.
// Usado por scripts/medir-leads-troca.ts e tests/atendimento-troca-suave.test.ts.
import express from 'express';
import { randomUUID } from 'node:crypto';
import { renderLeadDetailPage } from '../../src/modules/dashboard/leads-views.js';
import { renderAtendimentoPage, pedacosDaConversa, assinaturaDaConversa, pedeSoMiolo, CABECALHO_MIOLO, LISTA_VAZIA } from '../../src/modules/dashboard/atendimento-views.js';
import type { MensagemChat } from '../../src/modules/dashboard/conversas-queries.js';
import type { CompositorInput } from '../../src/modules/dashboard/atendimento-views.js';
import { servirEstatico } from '../../src/modules/dashboard/ui/estatico.js';
import { listaConversas } from './telas-renovadas.js';
import { leadDetalhe, USER_CASA } from './miolo-leads.js';

export const uuidFalso = (i: number) => `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`;
const hora = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

export interface OpcoesServidorFalso {
  /** Itens na lista de conversas. */
  n?: number;
  /** Mensagens por conversa. */
  msgs?: number;
  /** Tempo de servidor antes de responder a página (ms). */
  servidorMs?: number;
  /** Pausa entre pedaços de 16 KB (ms) — a "rede". */
  pedacoMs?: number;
  /** Demora da foto (ms). */
  fotoMs?: number;
  /** Demora do POST de responder (ms). */
  envioMs?: number;
  /** Leads cuja página dá erro 500 (testa a volta para a navegação normal). */
  falhar?: (id: string) => boolean;
}

/** PNG pequeno (cinza-azulado) — a "foto" do chat. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGNkYPjPQApgIkn1qIahqwEAJ2gBH0Y1bTQAAAAASUVORK5CYII=', 'base64');

function mensagensDoLead(i: number, n: number): MensagemChat[] {
  const out: MensagemChat[] = [];
  for (let k = 0; k < n; k++) {
    const t = hora((n - k) * 0.02 + 0.5);
    if (k % 12 === 5) {
      out.push({ role: 'user', autor: 'cliente', content: '[imagem] foto da conta', timestamp: t, canal: 'eva_oficial',
        midia: { id: `m-${i}-${k}`, tipo: 'imagem', mime: 'image/jpeg', nome: null, bytes: 120_000 } });
      continue;
    }
    if (k % 2 === 0) out.push({ role: 'user', autor: 'cliente', content: `Mensagem fictícia ${k} do cliente ${i}, falando da conta de luz.`, timestamp: t, canal: 'eva_oficial' });
    else out.push({ role: 'assistant', autor: 'humano', autorNome: 'Junior', origem: 'painel', status: 'lida', content: `Resposta fictícia ${k} da equipe.`, timestamp: t, canal: 'eva_oficial',
      painelId: randomUUIDDeterministico(i, k), wamid: `wamid.${i}.${k}` });
  }
  // o cliente escreveu por último, há pouco (janela de 24 h aberta)
  out.push({ role: 'user', autor: 'cliente', content: `Oi, ainda estou esperando o orçamento (${i}).`, timestamp: hora(0.2), canal: 'eva_oficial' });
  return out;
}
function randomUUIDDeterministico(i: number, k: number): string {
  const h = (i * 1000 + k).toString(16).padStart(12, '0');
  return `aaaaaaaa-bbbb-4ccc-8ddd-${h}`;
}

export function criarServidorFalso(o: OpcoesServidorFalso = {}) {
  const N = o.n ?? 60, NMSG = o.msgs ?? 40;
  const estado = {
    mensagens: new Map<string, MensagemChat[]>(),
    pedidosFoto: 0, pedidosPagina: 0, pedidosMiolo: 0, pedidosJson: 0, envios: [] as string[],
  };
  const lista = listaConversas(N);
  const leadN = (id: string) => Number(id.slice(0, 8));
  const conversa = (id: string) => {
    if (!estado.mensagens.has(id)) estado.mensagens.set(id, mensagensDoLead(leadN(id), NMSG));
    return estado.mensagens.get(id)!;
  };
  const evaAtiva = new Map<string, boolean>();
  const lead = (id: string) => leadDetalhe({ id, name: `Lead Fictício ${leadN(id)}`, phone: `55619${String(10000000 + leadN(id))}`, eva_active: evaAtiva.get(id) ?? false, conversation_messages: [] });
  const envio = (): CompositorInput => ({ via: 'waba', canal: 'eva_oficial', modelos: [], chave: randomUUID() });
  const pausa = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
  async function mandarEmPedacos(res: express.Response, html: string) {
    const b = Buffer.from(html, 'utf-8');
    res.type('text/html');
    for (let i = 0; i < b.length; i += 16 * 1024) {
      res.write(b.subarray(i, i + 16 * 1024));
      await pausa(o.pedacoMs ?? 40);
    }
    res.end();
  }
  // Pede só o miolo? (a MESMA regra da rota de verdade)
  const pedeMiolo = (req: express.Request): boolean => pedeSoMiolo((n) => req.get(n));

  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.get('/dashboard/estatico/:arquivo', servirEstatico);
  app.get('/dashboard/leads/midia/:id', (_req, res) => { res.redirect(302, `/img/${_req.params.id}?assinatura=${randomUUID()}`); });
  app.get('/img/:id', async (_req, res) => {
    estado.pedidosFoto++;
    await pausa(o.fotoMs ?? 150);
    res.set('Cache-Control', 'private, max-age=3600').type('image/png').send(PNG);
  });
  app.get('/dashboard/leads/conversas', async (req, res) => {
    await pausa(o.servidorMs ?? 250);
    const miolo = pedeMiolo(req);
    if (miolo) estado.pedidosMiolo++; else estado.pedidosPagina++;
    const html = renderAtendimentoPage({ user: USER_CASA, lista: miolo ? LISTA_VAZIA : lista, filtros: {}, lead: null, soMiolo: miolo });
    if (miolo) res.set('Cache-Control', 'no-store').vary(CABECALHO_MIOLO);
    await mandarEmPedacos(res, html);
  });
  app.get('/dashboard/leads/:id/conversa.json', (req, res) => {
    estado.pedidosJson++;
    const id = req.params.id;
    const p = pedacosDaConversa({ user: USER_CASA, lead: lead(id), mensagens: conversa(id), envio: envio() });
    const assinatura = assinaturaDaConversa(p);
    if (String(req.query.assinatura ?? '') === assinatura) { res.json({ igual: true, assinatura }); return; }
    res.json({ assinatura, ...p });
  });
  // ✋ Assumir / ↩ Devolver: como a rota de verdade (POST → redirect para a tela do lead)
  for (const acao of ['pause-eva', 'resume-eva']) {
    app.post(`/dashboard/leads/:id/${acao}`, (req, res) => {
      evaAtiva.set(req.params.id, acao === 'resume-eva');
      res.redirect(303, `/dashboard/leads/${req.params.id}`);
    });
  }
  app.post('/dashboard/leads/:id/responder', async (req, res) => {
    const id = req.params.id;
    const texto = String(req.body?.texto ?? '');
    estado.envios.push(texto);
    await pausa(o.envioMs ?? 200);
    const n = estado.envios.length;
    conversa(id).push({ role: 'assistant', autor: 'humano', autorNome: 'Junior', origem: 'painel', status: 'enviada', content: texto, timestamp: new Date().toISOString(),
      canal: 'eva_oficial', painelId: randomUUIDDeterministico(9999, n), wamid: `wamid.novo.${n}` });
    res.json({ ok: true, resultado: 'enviada', tom: 'ok', texto: 'Mensagem enviada. Você assumiu a conversa.', chave: randomUUID() });
  });
  app.get('/dashboard/leads/:id', async (req, res) => {
    const id = req.params.id;
    if (!/^[0-9a-f-]{36}$/.test(id)) { res.status(400).send('id inválido'); return; }
    if (o.falhar?.(id)) { res.status(500).send('<h2>Erro ao carregar lead</h2>'); return; }
    await pausa(o.servidorMs ?? 250);
    const miolo = pedeMiolo(req);
    if (miolo) estado.pedidosMiolo++; else estado.pedidosPagina++;
    const html = renderLeadDetailPage(lead(id), [], '', '', [], USER_CASA,
      { lista: miolo ? LISTA_VAZIA : lista, filtros: {}, mensagens: conversa(id), envio: envio(), soMiolo: miolo });
    if (miolo) res.set('Cache-Control', 'no-store').vary(CABECALHO_MIOLO);
    await mandarEmPedacos(res, html);
  });
  return { app, estado, lista };
}
