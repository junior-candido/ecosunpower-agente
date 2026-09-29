// Renovação do miolo — R17: Marketing (Campanhas, Blog, E-mail, Cadência) no
// padrão cc-, tema escuro (D4), sem Tailwind. Contrato em
// miolo-marketing-contrato.test.ts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { linhasComTailwind } from './helpers/teto-tailwind.js';
import { CASOS_MARKETING as C, CASOS_MARKETING_NOVOS as N } from './fixtures/casos-marketing.js';

const miolo = (h: string) => h.slice(h.indexOf('<main'), h.indexOf('</main>'));
const ouros = (m: string) => (m.match(/cc-btn-gold/g) ?? []).length;
const TODOS = { ...C, ...N };

describe('Marketing — casca comum das 4 telas', () => {
  for (const [nome, f] of Object.entries(TODOS)) {
    it(`${nome}: shell escuro, cabeçalho com trilha, no máximo 1 dourado, sem CDN do Tailwind`, () => {
      const h = f();
      expect(h).toContain('<div class="cc-shell cc-escuro">');
      expect(h).not.toContain('cdn.tailwindcss.com');
      const m = miolo(h);
      expect(m).toContain('cc-crumb');
      expect(ouros(m)).toBeLessThanOrEqual(1);
      expect(m).not.toMatch(/<h1>[^<]*\p{Extended_Pictographic}/u);
      expect(m).not.toContain('<script>alert');
      expect(m).not.toContain('<script>x');
    });
  }
});

describe('Campanhas (/marketing)', () => {
  const m = miolo(C.campanhas());
  it('KPIs numa faixa cc-kstrip com gasto, leads, CPL e CTR que já vêm', () => {
    expect(m).toContain('cc-kstrip');
    for (const r of ['Gasto 7d', 'Leads 7d', 'CPL médio 7d', 'CTR 7d', 'Campanhas ativas', 'Criativos em uso', 'Alertas pendentes']) expect(m).toContain(r);
    expect(m).toContain('6.280');
    expect(m).toContain('29,60');
    expect(m).toContain('2,40');
  });
  it('Buscar é a ação dourada única; filtro GET com q e status', () => {
    expect(ouros(m)).toBe(1);
    expect(m).toMatch(/<form action="\/dashboard\/marketing" method="get" class="cc-form/);
    expect(m).toMatch(/<button type="submit" class="cc-btn cc-btn-gold[^"]*">(?:(?!<\/button>)[\s\S])*Buscar<\/button>/);
  });
  it('abas Ativas/Pausadas/Todas como chips com contagem', () => {
    expect(m).toContain('cc-chip cc-chip-on');
    expect(m).toMatch(/Ativas <b>3<\/b>/);
    expect(m).toMatch(/Pausadas <b>1<\/b>/);
  });
  it('tabelas de números rolam no celular (mobile rolar) e o nome vem escapado', () => {
    expect((m.match(/cc-tbl-rolar/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(m).toContain('Conta de luz &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(m).toContain('cc-pg');
  });
  it('alertas como cc-ev (crítico/atenção/info) e criativos em grade', () => {
    expect(m).toContain('cc-ev cc-ev-critico');
    expect(m).toContain('cc-ev cc-ev-atencao');
    expect(m).toContain('cc-ev cc-ev-info');
    expect(m).toContain('CPL da &lt;i&gt;Empresas&lt;/i&gt;');
    expect(m).toContain('cc-mk-criativos');
    expect(m).toContain('Família &lt;b&gt;economizando&lt;/b&gt;');
  });
  it('insights escapados, com Eva para a casa', () => {
    expect(m).toContain('Eva está observando');
    expect(m).toContain('aguardando &lt;sua&gt; aprovação');
  });
  it('Google Ads, Analytics, Canais e Qualidade em painéis cc-', () => {
    for (const t of ['Google Ads', 'Site e tráfego (Google Analytics)', 'Canais — funil por origem', 'Qualidade por campanha']) expect(m).toContain(`<h3>${t}</h3>`);
    expect(m).toContain('/blog/placa-&lt;script&gt;');
    expect(m).toContain('Energia solar &lt;b&gt;Brasília&lt;/b&gt;');
    expect(m).toContain('/dashboard/admin/backfill-channels');
  });
  it('sem Google Ads / sem dado: estado vazio e "—"', () => {
    const v = miolo(C['campanhas-sem-google']());
    expect(v).toContain('cc-empty');
    expect(v).toContain('Aguardando a primeira campanha rodar');
    expect(v).toContain('Nenhuma campanha cadastrada');
    expect(v).toContain('Nenhum alerta pendente');
    expect(v).toContain('GOOGLE_ANALYTICS_PROPERTY_ID nao configurado &lt;x&gt;');
    expect(v).toContain('—');
  });
  it('tenant: sem Eva, sem Analytics do site da casa, sem MCC da casa, sem Recalcular canais e sem comando /criativo', () => {
    const t = C['campanhas-tenant']();
    expect(t).toContain('<div class="cc-shell cc-escuro">');
    const mt = miolo(t);
    expect(mt).not.toContain('Eva');
    expect(mt).toContain('A assistente está observando');
    expect(mt).not.toContain('Google Analytics');
    expect(mt).not.toContain('8617425872');
    expect(mt).not.toContain('backfill-channels');
    expect(mt).not.toContain('EcoSun');
    const vazio = miolo(N['campanhas-tenant-vazia']());
    expect(vazio).not.toContain('/criativo');
    expect(vazio).not.toContain('8617425872');
    expect(vazio).not.toContain('Credenciais OK');
  });
});

describe('Blog (/marketing/blog)', () => {
  it('lista: cartões cc-panel, Revisar dourado só no 1º, publicar e descartar com os mesmos forms', () => {
    const m = miolo(C.blog());
    expect(ouros(m)).toBe(1);
    expect(m).toContain('cc-bl-post');
    expect(m).toContain('Placas solares &lt;script&gt;x&lt;/script&gt; no inverno');
    expect(m).toContain('cc-aviso cc-aviso-ok');
    expect(m).toContain("confirm('Descartar este rascunho? Ele não vai pro site.')");
    expect(m).toContain('/dashboard/marketing/blog/draft%202%2F%C3%A7/revisar');
  });
  it('vazio com erro e aviso de leitura', () => {
    const m = miolo(C['blog-vazio']());
    expect(m).toContain('cc-empty');
    expect(m).toContain('Nenhum post esperando aprovação');
    expect(m).toContain('cc-aviso cc-aviso-erro');
    expect(m).toContain('Falhou &lt;b&gt;feio&lt;/b&gt;');
    expect(m).toContain('cc-aviso cc-aviso-atencao');
  });
  it('revisar: foto, edição em cc-form, Publicar agora dourado com o mesmo confirm', () => {
    const m = miolo(C['blog-revisar']());
    expect(ouros(m)).toBe(1);
    expect(m).toMatch(/<form method="POST" action="\/dashboard\/marketing\/blog\/draft_1\/editar" class="cc-form/);
    expect(m).toContain('value="Placas solares &lt;script&gt;x&lt;/script&gt; no inverno"');
    expect(m).toContain('Trocar foto');
    expect(m).toContain('Foto atualizada');
    expect(m).toContain("confirm('Publicar este post no site agora?')");
    expect(m).toMatch(/Publicar agora<\/button>/);
    const s = miolo(C['blog-revisar-sem-foto']());
    expect(s).toContain('Sem foto ainda');
    expect(s).toContain('Buscar foto');
  });
  it('indisponível e tenant: aviso honesto, sem nada da casa', () => {
    expect(miolo(C['blog-indisponivel']())).toContain('O gerador de blog não está disponível agora');
    const t = N['blog-tenant']();
    expect(t).toContain('<div class="cc-shell cc-escuro">');
    const mt = miolo(t);
    expect(mt).toContain('ainda não está disponível para a sua empresa');
    expect(mt).not.toContain('<form');
    expect(mt).not.toContain('EcoSun');
    expect(mt).not.toContain('Eva');
  });
});

describe('E-mail (/marketing/email)', () => {
  it('ligada: KPIs, status em pílula, desempenho por e-mail (rolar) e Pausar sem dourado', () => {
    const m = miolo(C.email());
    expect(m).toContain('cc-kstrip');
    expect(m).toContain('>ligada<');
    expect(m).toContain('Boas-vindas &lt;b&gt;');
    expect(m).toContain('cc-tbl-rolar');
    expect(m).toContain('/dashboard/marketing/email/pausar');
    expect(ouros(m)).toBe(0);
  });
  it('pausada: Ligar sequência é o dourado; sem envio → estado vazio', () => {
    const m = miolo(C['email-pausado']());
    expect(ouros(m)).toBe(1);
    expect(m).toContain('/dashboard/marketing/email/ligar');
    expect(m).toContain('Ainda sem e-mails enviados nesta jornada');
  });
  it('tenant: aviso honesto, sem números da casa e sem ligar/pausar', () => {
    const mt = miolo(N['email-tenant']());
    expect(mt).toContain('ainda não está disponível para a sua empresa');
    expect(mt).not.toContain('<form');
    expect(mt).not.toContain('EcoSun');
  });
});

describe('Cadência (/cadencia)', () => {
  it('KPIs, chips de status com contagem e tabela que vira cartão no celular', () => {
    const m = miolo(C.cadencia());
    expect(m).toContain('cc-kstrip');
    expect(m).toContain('cc-chips');
    expect(m).toContain('cc-tbl-cartoes');
    expect(m).toContain('Bruno D&#039;Ávila &lt;script&gt;x&lt;/script&gt;');
    expect(m).toContain('+55 61 99999-0001');
  });
  it('CONSERTO: o confirm do Fechou/Pediu pra parar compila mesmo com apóstrofo no nome', () => {
    const h = C.cadencia();
    const ons = [...h.matchAll(/onsubmit="(return confirm\([^"]*\))"/g)].map((x) => x[1]);
    expect(ons.length).toBe(12);
    for (const on of ons) {
      const js = on.replace(/&#0*39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      expect(() => new Function(js), js).not.toThrow();
    }
  });
  it('vazia → estado vazio; tenant sem Eva, sem comando do WhatsApp da casa', () => {
    expect(miolo(C['cadencia-vazia']())).toContain('cc-empty');
    const mt = miolo(C['cadencia-tenant']());
    expect(mt).not.toContain('Eva');
    expect(mt).not.toContain('/reativar-base');
    expect(miolo(C.cadencia())).toContain('/reativar-base');
  });
});

describe('Marketing — sem Tailwind', () => {
  it('os 4 arquivos sem utilitário Tailwind', () => {
    for (const arq of ['marketing-views.ts', 'blog-views.ts', 'email-views.ts', 'cadencia-views.ts']) {
      const fonte = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', arq), 'utf-8');
      expect(linhasComTailwind(fonte), arq).toEqual([]);
    }
  });
});
