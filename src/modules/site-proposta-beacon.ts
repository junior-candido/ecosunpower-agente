// site-proposta-beacon.ts
// Radar das propostas do SITE (páginas estáticas em ecosunpower.eng.br/propostas/*).
// A página carrega um GIF invisível (GET /sp/:token.gif) → registramos a visita
// e avisamos o Junior no zap: 1ª abertura na hora, revisitas com folga de 5 min.
//
// Rota pública de verdade (sem sessão): a chave é o token não-enumerável por
// proposta (registro abaixo). A resposta é SEMPRE o mesmo GIF 200 — token
// inválido não vaza que é inválido. Telemetria é best-effort: nunca derruba nada.

export interface SiteProposta {
  slug: string; // slug da página no site (ecosunpower.eng.br/propostas/<slug>)
  nome: string; // como o Junior conhece o cliente (vai no zap)
}

// Registro das propostas rastreáveis. Pra rastrear uma proposta nova:
// gere um token aleatório (openssl rand -hex 12), adicione aqui e ponha o
// beacon na página do site apontando pra /sp/<token>.gif.
export const SITE_PROPOSTAS: Record<string, SiteProposta> = {
  '256b6157150d38da6a764694': { slug: 'augusto-costa', nome: 'Augusto' },
  'b2bf04e184c0eee36d30abcb': { slug: 'pedro-henrique', nome: 'Pedro Henrique' },
  '3bee1e4fbaff3ed769e145a1': { slug: 'fernao-lopes', nome: 'Fernão' },
  '75e7612c022d6360e5f5db77': { slug: 'bruno-duarte', nome: 'Bruno Duarte' },
  '3c6b0e94b42ca55a04b00e67': { slug: 'vanessa-mendes', nome: 'Vanessa Mendes' },
};

// GIF transparente de 1×1 (89a) — resposta padrão do beacon.
export const GIF_1PX = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

const JANELA_IP_MS = 60 * 60 * 1000; // janela do rate limit por IP
const MAX_POR_IP_NA_JANELA = 30; //  ↑ folgado pra uso real, curto pra abuso
const FOLGA_ZAP_MS = 5 * 60 * 1000; // silêncio entre zaps da mesma proposta

export interface EstadoBeacon {
  hitsPorIp: Map<string, number[]>;
  visitasPorSlug: Map<string, number>; // contador desde o último deploy
  ultimoZapPorSlug: Map<string, number>;
}

export function criarEstado(): EstadoBeacon {
  return {
    hitsPorIp: new Map(),
    visitasPorSlug: new Map(),
    ultimoZapPorSlug: new Map(),
  };
}

export function resumirDispositivo(userAgent: string | null): string {
  if (!userAgent) return '❓ dispositivo desconhecido';
  return /Mobile|iPhone|Android/i.test(userAgent) ? '📱 celular' : '💻 computador';
}

// Mesmo padrão do estourouLimite do RH (rh/routes-publicas.ts), com teto próprio.
function estourouLimiteIp(estado: EstadoBeacon, ip: string, agoraMs: number): boolean {
  if (estado.hitsPorIp.size > 1000) {
    for (const [k, ts] of estado.hitsPorIp) {
      const vivos = ts.filter((t) => agoraMs - t < JANELA_IP_MS);
      if (vivos.length === 0) estado.hitsPorIp.delete(k);
      else estado.hitsPorIp.set(k, vivos);
    }
  }
  const lista = (estado.hitsPorIp.get(ip) ?? []).filter((t) => agoraMs - t < JANELA_IP_MS);
  if (lista.length >= MAX_POR_IP_NA_JANELA) {
    estado.hitsPorIp.set(ip, lista);
    return true;
  }
  lista.push(agoraMs);
  estado.hitsPorIp.set(ip, lista);
  return false;
}

export interface BatidaResultado {
  status: 'ok' | 'desconhecida' | 'limitada';
  slug?: string;
  /** Texto pronto pro zap do Junior — ausente quando não é hora de avisar. */
  zap?: string;
}

export function processarBatida(
  p: { token: string; ip: string; userAgent: string | null; agoraMs: number },
  estado: EstadoBeacon,
  registro: Record<string, SiteProposta> = SITE_PROPOSTAS,
): BatidaResultado {
  const proposta = registro[p.token];
  if (!proposta) return { status: 'desconhecida' };
  if (estourouLimiteIp(estado, p.ip, p.agoraMs)) return { status: 'limitada' };

  const visitas = (estado.visitasPorSlug.get(proposta.slug) ?? 0) + 1;
  estado.visitasPorSlug.set(proposta.slug, visitas);

  const disp = resumirDispositivo(p.userAgent);
  const ultimoZap = estado.ultimoZapPorSlug.get(proposta.slug);

  let zap: string | undefined;
  if (visitas === 1) {
    zap = `🔥 ${proposta.nome} ABRIU a proposta do site agora! (${disp})\necosunpower.eng.br/propostas/${proposta.slug}`;
  } else if (ultimoZap === undefined || p.agoraMs - ultimoZap >= FOLGA_ZAP_MS) {
    zap = `👀 ${proposta.nome} voltou na proposta do site (${visitas}ª visita, ${disp})`;
  }
  if (zap) estado.ultimoZapPorSlug.set(proposta.slug, p.agoraMs);

  return { status: 'ok', slug: proposta.slug, zap };
}

// ============================================================================
// Handler HTTP (usado pelo index: app.get('/sp/:token.gif', ...)).
// Estado é singleton de módulo — sobrevive entre requests, zera no deploy
// (aceitável: o histórico permanente fica em proposta_visualizacoes).
// ============================================================================
const estadoGlobal = criarEstado();

export interface BeaconDeps {
  notificar: (texto: string) => Promise<void>;
  registrarVisita: (p: {
    slug: string;
    ip: string | null;
    userAgent: string | null;
    referer: string | null;
  }) => void;
  agoraMs?: () => number;
  estado?: EstadoBeacon;
}

export function handleBeacon(
  req: {
    params: Record<string, string | undefined>;
    headers: Record<string, unknown>;
    socket?: { remoteAddress?: string | null };
  },
  res: {
    setHeader: (k: string, v: string) => void;
    type: (t: string) => unknown;
    send: (b: Buffer) => unknown;
  },
  deps: BeaconDeps,
): void {
  // Responde o GIF PRIMEIRO na intenção (headers anti-cache pra cada abertura contar).
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.type('image/gif');
  res.send(GIF_1PX);

  try {
    const token = String(req.params.token ?? '');
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      req.socket?.remoteAddress ??
      'sem-ip';
    const userAgent = (req.headers['user-agent'] as string | undefined) ?? null;
    const referer = (req.headers['referer'] as string | undefined) ?? null;
    const agoraMs = deps.agoraMs?.() ?? Date.now();

    const r = processarBatida(
      { token, ip, userAgent, agoraMs },
      deps.estado ?? estadoGlobal,
    );
    if (r.status !== 'ok' || !r.slug) return;

    // Histórico permanente (mesma tabela das propostas /p/, prefixo site:).
    deps.registrarVisita({ slug: `site:${r.slug}`, ip, userAgent, referer });

    if (r.zap) {
      deps.notificar(r.zap).catch((err) =>
        console.warn('[site-beacon] zap falhou (ignorado):', (err as Error)?.message ?? err),
      );
    }
  } catch (err) {
    // Beacon jamais vira erro — só loga.
    console.warn('[site-beacon] batida falhou (ignorado):', (err as Error)?.message ?? err);
  }
}
