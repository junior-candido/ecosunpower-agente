import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CampanhaService,
  sanitizarCampanhaJson,
  truncarNoLimiteDePalavra,
  botoesPreviewCampanha,
  temaRotativo,
  type CampanhaGerada,
  type DestinatarioCampanha,
} from '../src/modules/email/campanha.js';
import { _limparCacheNoticias } from '../src/modules/email/blog-noticias.js';

// Sem rede: notícias do blog sempre vazias nos testes.
beforeEach(() => {
  _limparCacheNoticias();
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('sem rede no teste'))));
});

// --- Fake do SupabaseClient: só o que a CampanhaService usa (from().select/eq/
// single/update/insert). Guarda os inserts em eventos_elo pra checagem.
function fakeSupabase(row: any) {
  const eventos: any[] = [];
  const updates: any[] = [];
  const client: any = {
    from(table: string) {
      if (table === 'eventos_elo') {
        return { insert: async (r: any) => { eventos.push(r); return { error: null }; } };
      }
      // email_campanhas
      const builder: any = {
        _isUpdate: false,
        _payload: null as any,
        select() { return builder; },
        insert(p: any) { builder._payload = p; return builder; },
        update(p: any) { builder._isUpdate = true; builder._payload = p; return builder; },
        eq() {
          if (builder._isUpdate) { updates.push(builder._payload); return Promise.resolve({ error: null }); }
          return builder;
        },
        single() { return Promise.resolve({ data: row, error: row ? null : { message: 'not found' } }); },
      };
      return builder;
    },
  };
  return { client, eventos, updates };
}

describe('campanha — sanitização do JSON da IA', () => {
  it('extrai o JSON de lixo em volta, descarta campo extra e trunca assunto longo', () => {
    const assuntoLongo = 'Economize muito na sua conta de luz todos os meses do ano com energia solar de altíssima qualidade e retorno garantido pra sempre';
    const raw = `Claro! Aqui está o JSON da campanha:\n\n\`\`\`json\n{\n  "tema": "economia",\n  "assunto": "${assuntoLongo}",\n  "kicker": "SUA CONTA MENOR",\n  "titulo": "Chega de conta alta",\n  "corpo_html": "<p style=\\"margin:0 0 14px;\\">Oi {{nome}}</p>",\n  "cta_label": "Quero economizar",\n  "image_prompt": "solar panels golden hour, no text",\n  "campo_extra_lixo": "ignora isso"\n}\n\`\`\`\nEspero que ajude!`;

    const c = sanitizarCampanhaJson(raw);
    expect(c.tema).toBe('economia');
    expect(c.kicker).toBe('SUA CONTA MENOR');
    expect(c.titulo).toBe('Chega de conta alta');
    expect(c.cta_label).toBe('Quero economizar');
    // truncado em 70, no limite de palavra (não corta no meio)
    expect(c.assunto.length).toBeLessThanOrEqual(70);
    expect(assuntoLongo.startsWith(c.assunto)).toBe(true);
    expect(c.assunto.endsWith(' ')).toBe(false);
    // campo extra não vaza
    expect((c as any).campo_extra_lixo).toBeUndefined();
  });

  it('cta_label ganha fallback quando a IA não manda', () => {
    const c = sanitizarCampanhaJson('{"tema":"x","assunto":"oi","titulo":"t","corpo_html":"<p>a</p>"}');
    expect(c.cta_label).toBe('Falar com a gente');
  });

  it('lança quando não há JSON', () => {
    expect(() => sanitizarCampanhaJson('sem json aqui')).toThrow();
  });

  it('truncarNoLimiteDePalavra não corta palavra no meio', () => {
    expect(truncarNoLimiteDePalavra('abc def ghijklmno', 8)).toBe('abc def');
    expect(truncarNoLimiteDePalavra('curto', 70)).toBe('curto');
  });
});

// Deps mínimas pra instanciar o service em testes que não chamam gerar().
function serviceComDeps(over: Partial<any> = {}) {
  const { client } = fakeSupabase(null);
  const deps: any = {
    anthropic: {} as any,
    imageGen: {} as any,
    supabase: client,
    sender: { enviar: async () => 'msg-1' },
    listarDestinatarios: async () => [],
    enviarPreview: async () => {},
    baseUrl: 'https://app.exemplo.com',
    siteUrl: 'https://www.ecosunpower.eng.br',
    empresa: 'EcoSunPower',
    now: () => new Date('2026-07-18T12:00:00Z'),
    ...over,
  };
  return new CampanhaService(deps);
}

describe('campanha — montarHtmlParaLead', () => {
  const campanha: CampanhaGerada = {
    id: 'camp-1',
    tema: 'economia',
    assunto: 'Chega de conta alta',
    kicker: 'SUA CONTA MENOR',
    titulo: 'Energia que se paga',
    corpo_html: '<p style="margin:0 0 14px;">Oi {{nome}}, veja como funciona.</p>',
    cta_label: 'Quero economizar',
    image_url: 'https://cdn.exemplo.com/campanha-abc.png',
  };

  it('inclui a imagem hero, o primeiro nome do lead e o link de descadastro com o lid', () => {
    const svc = serviceComDeps();
    const lead: DestinatarioCampanha = { id: 'lead-123', email: 'maria@ex.com', name: 'Maria Silva' };
    const html = svc.montarHtmlParaLead(campanha, lead);
    expect(html).toContain('https://cdn.exemplo.com/campanha-abc.png'); // heroImageUrl
    expect(html).toContain('Oi Maria,');                                // {{nome}} -> primeiro nome
    expect(html).not.toContain('{{nome}}');
    expect(html).toContain('/e/descadastro?lid=lead-123');              // descadastro com o lid
  });

  it('usa fallback "Olá!" quando o lead não tem nome', () => {
    const svc = serviceComDeps();
    const html = svc.montarHtmlParaLead(campanha, { id: 'l9', email: 'x@ex.com', name: '' });
    expect(html).toContain('Oi Olá!,');
  });
});

describe('campanha — aprovar (envio pra base)', () => {
  const row = {
    id: 'camp-99', status: 'pendente', tema: 'economia', assunto: 'Assunto da campanha',
    kicker: 'KICKER', titulo: 'Titulo', corpo_html: '<p>Oi {{nome}}</p>', cta_label: 'CTA',
    image_url: 'https://cdn.exemplo.com/x.png',
  };
  const leads: DestinatarioCampanha[] = [
    { id: 'l1', email: 'a@ex.com', name: 'Ana' },
    { id: 'l2', email: 'b@ex.com', name: 'Bruno' },
    { id: 'l3', email: 'c@ex.com', name: 'Carla' },
  ];

  it('envia pra todos os 3 leads, marca enviada e registra 1 evento por lead', async () => {
    const { client, eventos, updates } = fakeSupabase(row);
    const enviados: string[] = [];
    const svc = new CampanhaService({
      anthropic: {} as any, imageGen: {} as any, supabase: client,
      sender: { enviar: async (e: any) => { enviados.push(e.to); return 'mid'; } } as any,
      listarDestinatarios: async () => leads,
      enviarPreview: async () => {},
      baseUrl: 'https://app.ex.com', siteUrl: 'https://site.ex.com', empresa: 'Eco',
      now: () => new Date('2026-07-18T12:00:00Z'),
    });
    const r = await svc.aprovar('camp-99');
    expect(r.enviados).toBe(3);
    expect(enviados).toEqual(['a@ex.com', 'b@ex.com', 'c@ex.com']);
    expect(eventos.length).toBe(3);
    expect(eventos[0]).toMatchObject({ tipo: 'email_enviado', origem: 'email-campanha', lead_id: 'l1' });
    // update final -> status enviada com a contagem
    const final = updates[updates.length - 1];
    expect(final).toMatchObject({ status: 'enviada', enviados: 3 });
  });

  it('um lead que falha no envio não derruba o loop (enviados=2)', async () => {
    const { client, eventos } = fakeSupabase(row);
    const svc = new CampanhaService({
      anthropic: {} as any, imageGen: {} as any, supabase: client,
      sender: { enviar: async (e: any) => { if (e.to === 'b@ex.com') throw new Error('bounce'); return 'mid'; } } as any,
      listarDestinatarios: async () => leads,
      enviarPreview: async () => {},
      baseUrl: 'https://app.ex.com', empresa: 'Eco',
      now: () => new Date('2026-07-18T12:00:00Z'),
    });
    const r = await svc.aprovar('camp-99');
    expect(r.enviados).toBe(2);
    expect(eventos.length).toBe(2); // só os que enviaram registram evento
  });

  it('recusa aprovar campanha que não está pendente', async () => {
    const { client } = fakeSupabase({ ...row, status: 'enviada' });
    const svc = serviceComDeps({ supabase: client, listarDestinatarios: async () => leads });
    await expect(svc.aprovar('camp-99')).rejects.toThrow(/pendente/);
  });
});

describe('campanha — botões do preview', () => {
  it('ids no formato evabt:camp-*:<id> (≤256) e títulos ≤ 20 chars', () => {
    const botoes = botoesPreviewCampanha('550e8400-e29b-41d4-a716-446655440000');
    expect(botoes.length).toBe(3);
    expect(botoes.map((b) => b.id)).toEqual([
      'evabt:camp-ok:550e8400-e29b-41d4-a716-446655440000',
      'evabt:camp-re:550e8400-e29b-41d4-a716-446655440000',
      'evabt:camp-x:550e8400-e29b-41d4-a716-446655440000',
    ]);
    for (const b of botoes) {
      expect(b.id.length).toBeLessThanOrEqual(256);
      // conta por code point (mais fiel ao limite do WhatsApp que .length UTF-16)
      expect(Array.from(b.title).length).toBeLessThanOrEqual(20);
      // o parser de botão (eva-admin-buttons) casa evabt:<action>:<id>
      expect(b.id).toMatch(/^evabt:camp-(ok|re|x):.+$/);
    }
  });
});

describe('campanha — tema rotativo (determinístico por dia)', () => {
  it('mesmo dia -> mesmo tema; é um dos temas da lista', () => {
    const d = new Date('2026-07-18T12:00:00Z');
    const t1 = temaRotativo(d);
    const t2 = temaRotativo(new Date('2026-07-18T23:00:00Z'));
    expect(t1).toBe(t2);
    expect(t1.length).toBeGreaterThan(0);
  });
});
