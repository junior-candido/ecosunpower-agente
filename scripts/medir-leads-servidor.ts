// Mede o TEMPO DE SERVIDOR das telas de Leads com um banco FALSO que imita o
// Supabase: cada consulta custa a latência de ida-e-volta (RTT) + o tempo de
// transferir o JSON. Dados FICTÍCIOS em volume realista. Não toca em banco.
//
// Uso:  npx tsx scripts/medir-leads-servidor.ts     (RTT_MS=60 · MBPS=20 · CONVERSAS=400 · MSGS=30)
import { listLeads, getLeadDetail } from '../src/modules/dashboard/leads-queries.js';
import { buildLeadsInsights } from '../src/modules/dashboard/ai-summary.js';
import { listarConversas, historicoDoLead } from '../src/modules/dashboard/conversas-queries.js';
import { USER_CASA } from '../tests/fixtures/miolo-leads.js';

const RTT = Number(process.env.RTT_MS ?? 60);
const MBPS = Number(process.env.MBPS ?? 20);
const NCONV = Number(process.env.CONVERSAS ?? 400);
const NMSG = Number(process.env.MSGS ?? 30);

const uuid = (i: number) => `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`;
const hora = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
const texto = 'Mensagem fictícia de tamanho normal numa conversa de WhatsApp sobre energia solar e conta de luz.';
const conversas = Array.from({ length: NCONV }, (_, i) => ({
  lead_id: uuid(i), last_message_at: hora(i), created_at: hora(i + 1),
  messages: Array.from({ length: NMSG }, (_, k) => ({ role: k % 2 ? 'assistant' : 'user', content: texto, timestamp: hora(i + 1 - k / 100) })),
}));
const leads = conversas.map((c, i) => ({ id: c.lead_id, name: `Lead ${i}`, phone: `55619${10000000 + i}`, status: 'novo', city: 'Gama', eva_active: true, opt_out: false, claimed_by: null,
  updated_at: hora(i), created_at: hora(i + 50), company_id: USER_CASA.companyId, acquisition_source: null, installation_status: null, archived_at: null }));

function banco() {
  const est = { consultas: 0, bytes: 0 };
  const dados = (tabela: string, ch: Array<[string, unknown[]]>): unknown => {
    const sel = String(ch.find(([m]) => m === 'select')?.[1][0] ?? '');
    const inIds = ch.find(([m, a]) => m === 'in' && (a[0] === 'id' || a[0] === 'lead_id'))?.[1][1] as string[] | undefined;
    const lim = Number(ch.find(([m]) => m === 'limit')?.[1][0] ?? 1e9);
    const umSo = ch.some(([m]) => m === 'maybeSingle');
    if (tabela === 'conversations') return (ch.some(([m, a]) => m === 'eq' && a[0] === 'lead_id') ? conversas.slice(0, 2) : conversas).slice(0, lim);
    if (tabela === 'leads') {
      if (umSo) return leads[0];
      const r = inIds ? leads.filter((l) => inIds.includes(l.id)) : leads;
      return sel.includes('count') ? [] : r.slice(0, lim);
    }
    if (tabela === 'mensagens_whatsapp' || tabela.startsWith('rpc:')) return [];
    return [];
  };
  const construir = (tabela: string, ch: Array<[string, unknown[]]>): any => new Proxy({}, {
    get(_t, prop: string) {
      if (prop === 'then') {
        return (ok: (v: unknown) => void) => {
          est.consultas++;
          const data = dados(tabela, ch);
          const b = Buffer.byteLength(JSON.stringify(data ?? null));
          est.bytes += b;
          setTimeout(() => ok({ data, error: null, count: 1500 }), RTT + (b / (MBPS * 1024 * 1024)) * 1000);
        };
      }
      return (...args: unknown[]) => construir(tabela, [...ch, [prop, args]]);
    },
  });
  const client: any = {
    from: (t: string) => construir(t, []),
    rpc: (n: string) => construir(`rpc:${n}`, []),
    storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) },
  };
  return { client, est };
}

async function medir(nome: string, fn: (c: any) => Promise<unknown>): Promise<void> {
  const tempos: number[] = [];
  let ultimo = { consultas: 0, bytes: 0 };
  for (let r = 0; r < 3; r++) {
    const { client, est } = banco();
    const t0 = Date.now();
    await fn(client);
    tempos.push(Date.now() - t0);
    ultimo = est;
  }
  tempos.sort((a, b) => a - b);
  console.log(`${nome};${tempos[1]};${ultimo.consultas};${(ultimo.bytes / 1024).toFixed(0)}`);
}

async function main(): Promise<void> {
  console.log(`# RTT ${RTT} ms · ${MBPS} MB/s · ${NCONV} conversas × ${NMSG} mensagens`);
  console.log('tela;ms_servidor;consultas;kb_do_banco');
  await medir('lista /leads', (c) => Promise.all([
    listLeads(c, { limit: 10, viewerId: USER_CASA.id, viewerIsAdmin: true, companyId: USER_CASA.companyId }),
    buildLeadsInsights(c, USER_CASA.companyId),
  ]));
  await medir('conversas /leads/conversas', (c) => listarConversas(c, USER_CASA, {}, c));
  // Ficha: mesma ordem da rota (router.ts GET /leads/:id). ORDEM=fila imita a rota antiga.
  const id = uuid(0);
  await medir('ficha /leads/:id', async (c) => {
    const extras = () => Promise.all([listarConversas(c, USER_CASA, {}, c), historicoDoLead(c, id, USER_CASA.companyId, USER_CASA.id, c)]);
    if (process.env.ORDEM === 'fila') { await getLeadDetail(c, id); await extras(); return; }
    await Promise.all([getLeadDetail(c, id), extras()]);
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
