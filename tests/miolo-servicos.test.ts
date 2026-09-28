// Renovação do miolo — R14: Serviços de campo (painel interno: lista, novo,
// detalhe, lixeira) no padrão cc-, tema escuro (decisão do dono), sem Tailwind.
// A página pública do link mágico NÃO muda. Contrato em miolo-servicos-contrato.test.ts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { linhasComTailwind, corpoDaFuncao, TELAS_RENOVADAS } from './helpers/teto-tailwind.js';
import { CASOS_SERVICOS as C } from './fixtures/casos-servicos.js';
import { CSS_SERVICOS } from '../src/modules/dashboard/servicos-views.js';

const miolo = (h: string) => h.slice(h.indexOf('<main'), h.indexOf('</main>'));
const ouros = (m: string) => (m.match(/cc-btn-gold/g) ?? []).length;
const FONTE = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', 'servicos-views.ts'), 'utf-8');
const FUNCOES = ['renderServicosPage', 'renderDetalheServicoPage', 'renderLixeiraServicosPage', 'renderNovoServicoPage'];

describe('Serviços — lista', () => {
  const m = miolo(C.lista());
  it('cabeçalho O&M › Serviços de campo, título sem emoji, "Novo registro" dourado único', () => {
    expect(m).toContain('cc-crumb');
    expect(m).toContain('<h1>Serviços de campo</h1>');
    expect(ouros(m)).toBe(1);
    expect(m).toMatch(/<a class="cc-btn cc-btn-gold[^"]*" href="\/dashboard\/servicos\/novo"/);
    expect(m).toContain('href="/dashboard/servicos/lixeira"');
  });
  it('tabela cc- (cartão no celular) com status em pílula e link no nome', () => {
    expect(m).toContain('cc-tbl-cartoes');
    expect(m).toContain('cc-pill');
    expect(m).toContain('/dashboard/servicos/srv-1');
    expect(m).toContain('20/09/2026');
  });
  it('seus pendentes primeiro, num painel próprio', () => {
    const i = m.indexOf('Seus serviços pendentes');
    expect(i).toBeGreaterThan(-1);
    expect(m.indexOf('srv-2')).toBeGreaterThan(i);
    expect(m.indexOf('srv-2')).toBeLessThan(m.indexOf('srv-1'));
  });
  it('escapa o nome do cliente e o tipo', () => {
    expect(m).toContain('Gustavo &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(m).not.toContain('<script>alert(1)');
    expect(m).toContain('Manutenção &lt;b&gt;corretiva&lt;/b&gt;');
  });
  it('sem mídia → "—"', () => {
    expect(m).toMatch(/data-label="Mídias">—</);
  });
  it('aviso ?ok / ?erro no padrão cc-aviso, escapado', () => {
    expect(m).toContain('cc-aviso cc-aviso-ok');
    const e = miolo(C['lista-erro']());
    expect(e).toContain('cc-aviso cc-aviso-erro');
    expect(e).toContain('Falha ao excluir &lt;b&gt;x&lt;/b&gt;.');
  });
  it('vazia → estado vazio', () => {
    expect(miolo(C['lista-vazia']())).toContain('cc-empty');
  });
  it('tenant: escuro e nada da EcoSun', () => {
    const t = C['lista-tenant']();
    expect(t).toContain('<div class="cc-shell cc-escuro">');
    expect(t).not.toContain('EcoSunPower');
    expect(t).not.toContain('33.020');
    expect(miolo(t)).not.toContain('Eva');
  });
});

describe('Serviços — novo registro (a tela mais usada em campo)', () => {
  const m = miolo(C.novo());
  it('campos no .cc-form, Salvar registro dourado único', () => {
    expect(m).toMatch(/class="cc-form[^"]*" id="form"/);
    expect(ouros(m)).toBe(1);
    expect(m).toMatch(/<button id="salvar"[^>]*class="cc-btn cc-btn-gold/);
  });
  it('botões de foto grandes: "Tirar foto" com câmera, galeria múltipla, vídeo', () => {
    expect(m).toMatch(/<label class="cc-sv-foto cc-sv-foto-cam"[^>]*>[\s\S]*?Tirar foto[\s\S]*?capture="environment"/);
    expect(m).toContain('accept="image/*" multiple');
    expect(m).toContain('accept="video/*"');
  });
  it('CSS do celular: botão de foto com 48 px ou mais de altura', () => {
    const media = CSS_SERVICOS.slice(CSS_SERVICOS.indexOf('@media (max-width:760px)'));
    const alt = Number((media.match(/\.cc-sv-foto\{[^}]*min-height:(\d+)px/) ?? [])[1]);
    expect(alt).toBeGreaterThanOrEqual(48);
    const base = Number((CSS_SERVICOS.match(/\.cc-sv-foto\{[^}]*min-height:(\d+)px/) ?? [])[1]);
    expect(base).toBeGreaterThanOrEqual(48);
  });
  it('resultados da busca (montados no JS) também sem Tailwind', () => {
    const h = C.novo();
    expect(h).toContain("b.className='cc-sv-opcao'");
    // CONSERTO: nome do lead (vem do WhatsApp) nunca vai cru pro innerHTML
    expect(h).not.toMatch(/innerHTML=\(j\.(clientes|usinas)/);
    expect(h).toContain('b.textContent=rotulo');
    expect(h).not.toMatch(/className='[^']*rounded/);
  });
  it('usuários e tipos escapados', () => {
    expect(m).toContain('Jó &lt;script&gt;x&lt;/script&gt;');
    expect(m).toContain('Manutenção &lt;b&gt;corretiva&lt;/b&gt;');
  });
  it('tenant: escuro e sem EcoSun', () => {
    const t = C['novo-tenant']();
    expect(t).toContain('<div class="cc-shell cc-escuro">');
    expect(t).not.toContain('EcoSunPower');
  });
});

describe('Serviços — detalhe', () => {
  it('pendente: guia em painel, "Concluir serviço" é o dourado único, botão de foto grande', () => {
    const m = miolo(C['detalhe-pendente']());
    expect(ouros(m)).toBe(1);
    expect(m).toMatch(/<button id="concluir"[^>]*class="cc-btn cc-btn-gold/);
    expect(m).toContain('cc-sv-foto-cam');
    expect(m).toContain('Fotos pra tirar neste serviço');
    expect(m).toContain('Atribuído a Ivo Instalador');
    expect(m).toContain('Gustavo &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(m).toContain('Levar escada &lt;grande&gt;.');
    expect(m).toContain('cc-aviso cc-aviso-ok');
  });
  it('concluído com link: fotos em grade, vídeo, link válido, Excluir com o MESMO confirm', () => {
    const m = miolo(C['detalhe-concluido']());
    expect(ouros(m)).toBeLessThanOrEqual(1);
    expect(m).toContain('cc-sv-galeria');
    expect(m).toContain('<video');
    expect(m).toContain('assinada-2.jpg?a=1&amp;b=&quot;2&quot;');
    expect(m).toContain('Kátia &lt;b&gt;K&lt;/b&gt;');
    expect(m).toContain("confirm('Mover este serviço pra Lixeira? Dá pra restaurar quando quiser (nada é apagado).')");
    expect(m).toContain('/dashboard/servicos/srv-1/reabrir');
  });
  it('link vencido → aviso de atenção', () => {
    const m = miolo(C['detalhe-vencido']());
    expect(m).toContain('cc-aviso cc-aviso-atencao');
    expect(m).toContain('venceu');
  });
  it('sem observação e sem mídia → "—"', () => {
    const m = miolo(C['detalhe-sem-midia']());
    expect(m).toMatch(/Observações<\/dt><dd>—/);
    expect(m).toContain('cc-empty');
  });
  it('tenant: escuro e sem EcoSun', () => {
    const t = C['detalhe-tenant']();
    expect(t).toContain('<div class="cc-shell cc-escuro">');
    expect(t).not.toContain('EcoSunPower');
  });
  it('o JS embutido compila em todos os casos', () => {
    for (const [nome, f] of Object.entries(C)) {
      for (const s of f().matchAll(/<script>([\s\S]*?)<\/script>/g)) {
        expect(() => new Function(s[1]!), nome).not.toThrow();
      }
    }
  });
});

describe('Serviços — lixeira', () => {
  it('tabela cc- com Restaurar por linha (mesmo POST), trilha de volta', () => {
    const m = miolo(C.lixeira());
    expect(m).toContain('cc-tbl');
    expect(m).toContain('<h1>Lixeira de serviços</h1>');
    expect(m).toMatch(/<form method="post" action="\/dashboard\/servicos\/srv-1\/restaurar">/);
    expect(m).toContain('href="/dashboard/servicos"');
    expect(m).toContain('Gustavo &lt;script&gt;');
  });
  it('vazia → estado vazio', () => {
    expect(miolo(C['lixeira-vazia']())).toContain('cc-empty');
  });
});

describe('Serviços — sem Tailwind', () => {
  it('as 4 telas estão na lista do teto e nenhuma carrega o CDN', () => {
    for (const f of FUNCOES) expect(TELAS_RENOVADAS).toContain(`servicos-views.ts#${f}`);
    for (const f of Object.values(C)) expect(f()).not.toContain('cdn.tailwindcss.com');
  });
  it('funções das telas e o cartão sem utilitário Tailwind', () => {
    for (const f of FUNCOES) expect(linhasComTailwind(corpoDaFuncao(FONTE, f)), f).toEqual([]);
  });
});
