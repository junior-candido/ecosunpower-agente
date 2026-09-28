// Renovação do miolo — R18: RH (candidatos, vagas, vaga nova/editar, busca IA)
// no padrão cc-, tema escuro (D4), sem Tailwind. Contrato em miolo-rh-contrato.test.ts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { linhasComTailwind } from './helpers/teto-tailwind.js';
import { CASOS_RH as C } from './fixtures/casos-rh.js';

const miolo = (h: string) => h.slice(h.indexOf('<main'), h.indexOf('</main>'));
const ouros = (m: string) => (m.match(/cc-btn-gold/g) ?? []).length;

describe('RH — casca e regras comuns (todas as telas)', () => {
  for (const [nome, render] of Object.entries(C)) {
    it(`${nome}: casca escura, sem Tailwind do CDN, uma ação dourada, trilha Equipe · RH`, () => {
      const h = render();
      expect(h).toContain('<div class="cc-shell cc-escuro">');
      expect(h).not.toContain('cdn.tailwindcss.com');
      const m = miolo(h);
      expect(m).toContain('cc-crumb');
      expect(m).toContain('Equipe · RH');
      expect(ouros(m)).toBe(1);
      // título sem emoji
      const h1 = (m.match(/<h1>([^<]*)<\/h1>/) ?? ['', ''])[1];
      expect(h1).not.toMatch(/\p{Extended_Pictographic}/u);
      // nada de <script> cru vindo dos dados
      expect(m).not.toContain('<script>alert(1)</script>');
      expect(m).not.toContain('<b>Teste</b>');
    });
  }

  it('arquivo sem Tailwind no miolo', () => {
    const fonte = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', 'rh-views.ts'), 'utf-8');
    expect(linhasComTailwind(fonte)).toEqual([]);
  });

  it('tenant: nada da EcoSun (marca, site, CNPJ, Eva)', () => {
    for (const k of ['candidatos-tenant', 'vagas-tenant', 'vaga-nova-tenant', 'busca-tenant']) {
      const h = C[k]();
      expect(h).not.toContain('EcoSunPower');
      expect(h).not.toContain('ecosunpower.eng.br');
      expect(h).not.toContain('33.020');
      expect(miolo(h)).not.toMatch(/\bEva\b/);
    }
  });
});

describe('RH — candidatos', () => {
  const m = miolo(C.candidatos());
  it('tabela cc- que vira cartão no celular, status em pílula', () => {
    expect(m).toContain('cc-panel');
    expect(m).toContain('cc-tbl-cartoes');
    expect(m).toContain('class="cc-pill');
    expect(m).toMatch(/cc-pill[^"]*"[^>]*>Triado</);
    expect(m).toMatch(/cc-pill[^"]*"[^>]*>Entrevista</);
  });
  it('filtro em cc-form com os mesmos nomes; Filtrar é o dourado', () => {
    expect(m).toMatch(/<form method="GET" action="\/dashboard\/rh\/candidatos" class="cc-form/);
    expect(m).toMatch(/<button type="submit" class="cc-btn cc-btn-gold[^"]*"[^>]*>(<svg[^>]*>.*?<\/svg>)?Filtrar<\/button>/);
  });
  it('status do candidato: select que envia sozinho, com o atual marcado', () => {
    expect(m).toMatch(/<form method="POST" action="\/dashboard\/rh\/candidatos\/c1\/status"[^>]*>\s*<select name="status" onchange="this.form.submit\(\)"/);
    expect(m).toContain('<option value="triado" selected>');
  });
  it('excluir: botão crítico com os DOIS confirm de hoje', () => {
    const i = m.indexOf('/dashboard/rh/candidatos/c1/excluir');
    const trecho = m.slice(i, i + 600);
    expect(trecho).toContain("confirm('Excluir este candidato de vez? Apaga os dados e o PDF do currículo. Sem volta.') &amp;&amp; confirm('Confirma de novo: excluir permanentemente?')");
    expect(trecho).toContain('cc-btn-crit');
  });
  it('nota IA com cor pela faixa; sem nota → "—"; sem e-mail → "—"; vaga apagada → "vaga encerrada"', () => {
    expect(m).toContain('cc-rh-nota-ok">8.5');
    expect(m).toContain('cc-rh-nota-warn">5.2');
    expect(m).toContain('cc-rh-nota-crit">2.0');
    expect(m).toContain('vaga encerrada');
    const c2 = m.slice(m.indexOf('Maria &lt;b&gt;Teste'), m.indexOf('/dashboard/rh/candidatos/c2/excluir'));
    expect(c2).toContain('>—<');
  });
  it('filtro preenchido volta marcado e escapado', () => {
    const f = miolo(C['candidatos-filtrado']());
    expect(f).toContain('value="José &lt;x&gt;"');
    expect(f).toContain('<option value="v1" selected>');
    expect(f).toContain('<option value="triado" selected>');
  });
  it('vazio → estado vazio', () => {
    expect(miolo(C['candidatos-vazio']())).toContain('cc-empty');
  });
});

describe('RH — vagas', () => {
  const m = miolo(C.vagas());
  it('Nova vaga é o dourado; tabela cc- com status em pílula e ações', () => {
    expect(m).toMatch(/<a class="cc-btn cc-btn-gold" href="\/dashboard\/rh\/vagas\/nova"/);
    expect(m).toContain('cc-tbl-cartoes');
    expect(m).toMatch(/cc-pill[^"]*"[^>]*>aberta</);
    expect(m).toMatch(/cc-pill[^"]*"[^>]*>fechada</);
    expect(m).toContain('href="/dashboard/rh/vagas/v1"');
    expect(m).toMatch(/action="\/dashboard\/rh\/vagas\/v1\/status"[^>]*>\s*<input type="hidden" name="status" value="fechada">/);
    expect(m).toMatch(/action="\/dashboard\/rh\/vagas\/v2\/status"[^>]*>\s*<input type="hidden" name="status" value="aberta">/);
  });
  it('título com <script> escapado; cidade vazia → "—"', () => {
    expect(m).toContain('Auxiliar &lt;script&gt;');
    const v2 = m.slice(m.indexOf('Auxiliar &lt;script&gt;'));
    expect(v2).toContain('>—<');
  });
  it('EcoSun vê o aviso do Trabalhe Conosco; tenant não', () => {
    expect(m).toContain('ecosunpower.eng.br/trabalhe-conosco');
    expect(miolo(C['vagas-tenant']())).not.toContain('Trabalhe Conosco');
  });
  it('vazia → estado vazio', () => {
    expect(miolo(C['vagas-vazia']())).toContain('cc-empty');
  });
});

describe('RH — vaga nova / editar', () => {
  it('nova: formulário .cc-form, Publicar vaga dourado, voltar pela trilha', () => {
    const m = miolo(C['vaga-nova']());
    expect(m).toMatch(/<form method="POST" action="\/dashboard\/rh\/vagas" class="cc-form/);
    expect(m).toMatch(/cc-btn-gold[^>]*>(<svg[^>]*>.*?<\/svg>)?Publicar vaga</);
    expect(m).toContain('<a href="/dashboard/rh/vagas">Vagas</a>');
    expect(m).toContain('<h1>Nova vaga</h1>');
  });
  it('editar: dados escapados, tipo marcado, Salvar alterações', () => {
    const m = miolo(C['vaga-editar']());
    expect(m).toContain('action="/dashboard/rh/vagas/v2"');
    expect(m).toContain('<h1>Editar vaga</h1>');
    expect(m).toContain('Texto com &lt;script&gt;x&lt;/script&gt; &amp; &quot;aspas&quot;');
    expect(m).toContain('<option value="PJ" selected>');
    expect(m).toContain('Salvar alterações');
  });
});

describe('RH — busca IA', () => {
  it('campo grande com Buscar dourado', () => {
    const m = miolo(C['busca-inicial']());
    expect(m).toMatch(/<form method="GET" action="\/dashboard\/rh\/busca" class="cc-form cc-rh-busca/);
    expect(m).toContain('cc-rh-q');
    expect(m).toContain('A IA vasculha');
  });
  it('resultados em painéis com motivo escapado, nota e status em pílula', () => {
    const m = miolo(C['busca-resultados']());
    expect(m).toContain('value="quem tem NR-35 e &quot;telhado&quot;?"');
    expect((m.match(/class="cc-panel cc-rh-achado/g) ?? []).length).toBe(3);
    expect(m).toContain('NR-35 em dia e &lt;b&gt;3 anos&lt;/b&gt; de telhado.');
    expect(m).toContain('/dashboard/rh/candidatos/c1/curriculo');
    expect(m).toContain('Banco de Talentos');
    expect(m).toMatch(/cc-pill[^"]*"[^>]*>Reprovado</);
  });
  it('vazia → estado vazio; erro → aviso de erro', () => {
    expect(miolo(C['busca-vazia']())).toContain('cc-empty');
    expect(miolo(C['busca-vazia']())).toContain('Ninguém no banco encaixa');
    expect(miolo(C['busca-erro']())).toContain('cc-aviso cc-aviso-erro');
  });
});
