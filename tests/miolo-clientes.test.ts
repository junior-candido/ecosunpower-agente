// Renovação do miolo — R16: Clientes (lista, ficha, novo) e relatório
// pós-instalação (novo + prévia) no padrão cc-, tema escuro (D4), sem
// Tailwind. Contrato em miolo-clientes-contrato.test.ts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { linhasComTailwind } from './helpers/teto-tailwind.js';
import { CASOS_CLIENTES as C, ORFAOS, LINHAS_CLIENTES } from './fixtures/casos-clientes.js';
import { renderClientesListPage } from '../src/modules/dashboard/clientes-views.js';
import { USER_CASA } from './fixtures/miolo-leads.js';

const miolo = (h: string) => h.slice(h.indexOf('<main'), h.indexOf('</main>'));
const ouros = (m: string) => (m.match(/cc-btn-gold/g) ?? []).length;
const decod = (s: string) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

describe('Clientes — lista', () => {
  const m = miolo(C.lista());
  it('cabeçalho com trilha, título sem emoji e "Novo cliente" como único dourado', () => {
    expect(m).toContain('cc-crumb');
    expect(m).toContain('<h1>Clientes</h1>');
    expect(ouros(m)).toBe(1);
    expect(m).toMatch(/<a class="cc-btn cc-btn-gold" href="\/dashboard\/clientes\/novo"/);
    expect(m).not.toMatch(/<h1>[^<]*(👥|📦)/);
  });
  it('tabela cc- (cartões no celular) com avatar, situação em pílula e link pra ficha', () => {
    expect(m).toContain('cc-tbl-cartoes');
    expect(m).toContain('cc-avatar');
    expect(m).toContain('cc-pill');
    expect(m).toContain('>Operando<');
    expect(m).toContain('>Contrato assinado<');
    expect(m).toContain('href="/dashboard/clientes/11111111-aaaa-4aaa-8aaa-111111111111"');
  });
  it('escapa o nome; sem dado vira "—"', () => {
    expect(m).toContain('Bruno &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(m).not.toContain('<script>alert(1)');
    expect(m).toContain('—');
  });
  it('busca GET com os mesmos parâmetros, em cc-form, e chips Ativos/Arquivados', () => {
    expect(m).toMatch(/<form method="get" action="\/dashboard\/clientes" class="cc-form/);
    expect(m).toContain('cc-chips');
    expect(m).toContain('href="/dashboard/clientes?show=arquivados"');
  });
  it('sistemas sem cliente num painel cc-, modal de vínculo no padrão cc-', () => {
    expect(m).toContain('Sistemas sem cliente vinculado');
    expect(m).toContain('id="modal-vinculo"');
    expect(m).toMatch(/<form id="form-vincular" method="post" action="\/dashboard\/clientes\/vincular-sistema" class="cc-form/);
    expect(m).toContain('cc-us-sel');
  });
  it('CONSERTO: o botão "Vincular cliente" não quebra (nem executa) com apóstrofo no nome da usina', () => {
    const h = renderClientesListPage([], {}, [{ ...ORFAOS[0], apelido: "x');alert(1);//" }], { total: 0, limit: 50, offset: 0 }, USER_CASA);
    const on = [...h.matchAll(/onclick="(abrirVinculo[^"]*)"/g)].map((x) => decod(x[1]));
    expect(on.length).toBe(1);
    expect(on[0]).not.toContain('alert');
    expect(() => new Function('abrirVinculo', on[0])).not.toThrow();
    expect(h).toContain('data-apelido="x&#39;);alert(1);//"');
    // e com o apóstrofo "normal" da fixture também compila
    for (const x of C.lista().matchAll(/onclick="(abrirVinculo[^"]*)"/g)) {
      expect(() => new Function('abrirVinculo', decod(x[1]))).not.toThrow();
    }
  });
  it('paginação com os mesmos links de offset de hoje', () => {
    const p = miolo(C['lista-filtrada-paginada']());
    expect(p).toContain('cc-pg');
    expect(p).toContain('href="/dashboard/clientes?offset=0&amp;q=ana%20%26%20%22cia%22');
    expect(p).toContain('href="/dashboard/clientes?offset=100&amp;q=');
    expect(p).toContain('Mostrando 51–100 de 130');
  });
  it('arquivados: título próprio, sem dourado de "Novo", volta pra ativos', () => {
    const a = miolo(C['lista-arquivados']());
    expect(a).toContain('<h1>Clientes arquivados</h1>');
    expect(a).not.toContain('/dashboard/clientes/novo');
    expect(a).toContain('href="/dashboard/clientes"');
  });
  it('vazia → estado vazio', () => {
    expect(miolo(C['lista-vazia']())).toContain('cc-empty');
  });
  it('tenant: casca escura, sem nada da EcoSun', () => {
    const t = C['lista-tenant']();
    expect(t).toContain('<div class="cc-shell cc-escuro">');
    expect(t).not.toContain('EcoSunPower');
    expect(t).not.toContain('33.020');
    expect(miolo(t)).not.toContain('Eva');
  });
  it('4 linhas → 4 linhas na tabela', () => {
    expect((m.match(/<tr>/g) ?? []).length).toBeGreaterThanOrEqual(LINHAS_CLIENTES.length + 1);
  });
});

describe('Clientes — ficha', () => {
  const h = C.ficha();
  const m = miolo(h);
  it('cabeçalho com trilha até o cliente, nome escapado e um só dourado', () => {
    expect(m).toContain('cc-crumb');
    expect(m).toContain('<h1>Ana &lt;script&gt;x&lt;/script&gt; D&#039;Ávila</h1>');
    expect(ouros(m)).toBe(1);
  });
  it('abas por âncora (Resumo · Usinas · Arquivos · Ações) e as seções existem com esses ids', () => {
    expect(m).toContain('cc-abas');
    for (const a of ['resumo', 'usinas', 'arquivos', 'acoes']) {
      expect(m).toContain(`href="#${a}"`);
      expect(m).toContain(`id="${a}"`);
    }
    // os redirects do servidor (#dados, #anexos) caem numa seção de verdade
    expect(m).toContain('id="dados"');
    expect(m).toContain('id="anexos"');
    expect(m).not.toContain('-content"');
  });
  it('duas colunas no computador (uma no celular)', () => {
    expect(m).toContain('cc-cl-ficha');
    expect(h).toMatch(/\.cc-cl-ficha\{display:grid;grid-template-columns:minmax\(0,1fr\) /);
    expect(h).toMatch(/@media \(max-width:1023px\)\{[^}]*\.cc-cl-ficha\{grid-template-columns:minmax\(0,1fr\)\}/);
  });
  it('formulário de dados em cc-form, com os mesmos campos e o gancho js-num', () => {
    expect(m).toMatch(/<form id="form-dados" action="\/dashboard\/clientes\/11111111-aaaa-4aaa-8aaa-111111111111\/edit" method="post" class="cc-form/);
    expect(m).toContain('class="js-num"');
    expect(m).toContain('Cliente pediu &lt;b&gt;visita&lt;/b&gt; de manhã.');
  });
  it('Arquivar e Excluir no "⋯ Mais ações" com o MESMO confirm', () => {
    const mais = m.slice(m.indexOf('cc-mais'));
    expect(mais).toContain('/dashboard/clientes/11111111-aaaa-4aaa-8aaa-111111111111/arquivar');
    expect(mais).toContain('/dashboard/clientes/11111111-aaaa-4aaa-8aaa-111111111111/excluir');
    expect(m).toContain("confirm('Excluir ' + this.dataset.nome + ' PERMANENTEMENTE?");
  });
  it('arquivada: Restaurar no lugar de Arquivar; sem dado → "—" e estados vazios', () => {
    const a = miolo(C['ficha-arquivada-sem-dados']());
    expect(a).toContain('/desarquivar');
    expect(a).not.toContain('/arquivar"');
    expect(a).toContain('cc-empty');
    expect(a).toContain('—');
  });
  it('usina com kWp e marca; KPIs em faixa cc-', () => {
    expect(m).toContain('cc-kstrip');
    expect(m).toContain('GoodWe');
    expect(m).toContain('6,3');
  });
  it('anexos: remover visível (não só no "hover") com o mesmo confirm; upload multipart', () => {
    expect(m).toContain("confirm('Remover este anexo?')");
    expect(m).toMatch(/<form action="\/dashboard\/clientes\/[^"]+\/anexos" method="post" enctype="multipart\/form-data" class="cc-form/);
    expect(m).not.toContain('opacity-0');
  });
  it('EcoSun vê "Eva sugere"; tenant vê "assistente" e nada da casa', () => {
    expect(m).toContain('Eva sugere');
    const t = C['ficha-tenant']();
    expect(t).toContain('<div class="cc-shell cc-escuro">');
    expect(miolo(t)).not.toContain('Eva');
    expect(miolo(t)).toContain('Assistente sugere');
    expect(t).not.toContain('EcoSunPower');
    expect(t).not.toContain('33.020');
  });
  it('ViaCEP continua (mesmo fetch)', () => {
    expect(h).toContain("fetch('https://viacep.com.br/ws/' + raw + '/json/')");
  });
});

describe('Clientes — novo', () => {
  it('cabeçalho + cc-form + Criar cliente dourado único', () => {
    const m = miolo(C.novo());
    expect(m).toContain('cc-crumb');
    expect(m).toContain('<h1>Novo cliente</h1>');
    expect(m).toMatch(/<form action="\/dashboard\/clientes\/novo" method="post" class="cc-form/);
    expect(ouros(m)).toBe(1);
  });
  it('erros num aviso cc-, valores escapados', () => {
    const m = miolo(C['novo-erros']());
    expect(m).toContain('cc-aviso cc-aviso-erro');
    expect(m).toContain('Consumo &lt;b&gt;inválido&lt;/b&gt;');
    expect(m).toContain('value="Ana &lt;script&gt;x&lt;/script&gt; D&#39;Ávila"');
  });
  it('tenant: escuro e sem a casa', () => {
    const t = C['novo-tenant']();
    expect(t).toContain('<div class="cc-shell cc-escuro">');
    expect(t).not.toContain('EcoSunPower');
  });
});

describe('Relatório pós-instalação — novo e prévia', () => {
  it('novo: cc-form multipart, Gerar prévia dourado, nome escapado', () => {
    const m = miolo(C['rpi-novo']());
    expect(m).toContain('cc-crumb');
    expect(m).toMatch(/<form action="\/dashboard\/clientes\/[^"]+\/relatorio-pos-instalacao" method="post" enctype="multipart\/form-data" class="cc-form/);
    expect(ouros(m)).toBe(1);
    expect(m).toContain('Ana &lt;script&gt;x&lt;/script&gt;');
  });
  it('prévia: Enviar dourado (com o mesmo confirm), iframe escapado num painel', () => {
    const m = miolo(C['rpi-previa']());
    expect(ouros(m)).toBe(1);
    expect(m).toContain("confirm('Enviar relatório pelo WhatsApp do cliente agora?')");
    expect(m).toContain('cc-panel');
    expect(m).toContain('srcdoc="&lt;html&gt;');
  });
  it('prévia enviada: sem botão de enviar, pílula de enviado; tenant escuro', () => {
    const h = C['rpi-previa-enviada']();
    expect(miolo(h)).not.toContain('/enviar');
    expect(miolo(h)).toContain('cc-pill');
    expect(h).toContain('<div class="cc-shell cc-escuro">');
  });
});

describe('Clientes — sem Tailwind', () => {
  it('arquivos inteiros sem utilitário Tailwind; nenhuma tela carrega o CDN', () => {
    for (const arq of ['clientes-views.ts', 'relatorio-pi-views.ts']) {
      const fonte = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', arq), 'utf-8');
      expect(linhasComTailwind(fonte), arq).toEqual([]);
    }
    for (const f of Object.values(C)) expect(f()).not.toContain('cdn.tailwindcss.com');
  });
});
