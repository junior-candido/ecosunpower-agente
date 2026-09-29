// Renovação do miolo — R21: Comercial II no padrão cc- (visual, marca e escape).
// O contrato (forms/names/ids/fetch/confirm) está em miolo-comercial2-contrato.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CASOS_COMERCIAL2 } from './fixtures/casos-comercial2.js';
import { linhasComTailwind } from './helpers/teto-tailwind.js';

const miolo = (h: string) => h.slice(h.indexOf('<main'), h.indexOf('</main>'));
const semScripts = (h: string) => h.replace(/<script\b[\s\S]*?<\/script>/gi, '');
const TENANT = Object.keys(CASOS_COMERCIAL2).filter((k) => k.endsWith('-tenant'));

describe('Comercial II — padrão cc- em todas as telas', () => {
  for (const [nome, render] of Object.entries(CASOS_COMERCIAL2)) {
    const h = render();
    it(`${nome}: casca renovada, sem Tailwind, tema escuro, CSS no <head>`, () => {
      expect(h).not.toContain('cdn.tailwindcss.com');
      expect(h).toContain('cc-escuro');
      expect(miolo(h)).toContain('class="cc-root cc-cm"');
      expect(miolo(h)).toContain('cc-top');
      expect(h.slice(h.indexOf('<body'))).not.toContain('<style>');
      expect(h.slice(0, h.indexOf('</head>'))).toContain('.cc-cm-linha');
      expect(linhasComTailwind(miolo(h))).toEqual([]);
    });
    it(`${nome}: no máximo UMA ação dourada`, () => {
      expect((miolo(h).match(/cc-btn-gold/g) ?? []).length).toBeLessThanOrEqual(1);
    });
    it(`${nome}: dado de fora nunca vira HTML`, () => {
      const m = semScripts(miolo(h));
      expect(m).not.toContain('<script>x</script>');
      expect(m).not.toContain('<img src=x');
      expect(m).not.toContain('<b>');
    });
  }

  for (const nome of TENANT) {
    it(`${nome}: tenant não vê marca nem nomes da casa`, () => {
      const m = miolo(CASOS_COMERCIAL2[nome]());
      expect(m).not.toMatch(/EcoSun|CNPJ 33\.020|Junior|\bEva\b|\bElo\b|padrão da casa/);
    });
  }
});

describe('Comercial II — telas', () => {
  it('Contratos: cliente escolhido tem a ação principal "Abrir formulário" (dourada) e o resto normal', () => {
    const m = miolo(CASOS_COMERCIAL2['contratos-selecionado']());
    expect(m).toMatch(/<a class="cc-btn cc-btn-gold" href="\/dashboard\/leads\/[^"]+\/contrato-form\?tipo=procuracao">/);
    expect(m).toContain('/procuracao.pdf?tipo=procuracao');
    expect(m).toContain('cc-cm-sel');
  });
  it('Contratos: sem cliente escolhido, a dourada é "Criar e preencher"', () => {
    const m = miolo(CASOS_COMERCIAL2['contratos']());
    expect(m).toMatch(/<button type="submit" class="cc-btn cc-btn-gold"[^>]*>.*Criar e preencher/);
    expect(m).toContain('Últimos contratos fechados');
  });
  it('Contratos vazio: estado vazio, sem cartões', () => {
    const m = miolo(CASOS_COMERCIAL2['contratos-vazio']());
    expect(m).toContain('Nenhum contrato fechado ainda');
  });
  it('Avisos viram cc-aviso com o tom certo', () => {
    const m = miolo(CASOS_COMERCIAL2['contratos-avisos']());
    expect(m).toContain('cc-aviso-ok');
    expect(m).toContain('cc-aviso-erro');
    expect(m).toContain('cc-aviso-atencao');
  });
  it('Fechou!: cartão de venda por cliente, "já é venda" em pílula, só o 1º em aberto é dourado', () => {
    const m = miolo(CASOS_COMERCIAL2['fechou-resultados']());
    expect((m.match(/action="\/dashboard\/vendas\/registrar"/g) ?? []).length).toBe(2);
    expect(m).toContain('já é venda');
    expect((m.match(/cc-btn-gold/g) ?? []).length).toBe(1);
    expect(m).toContain('Bruno &lt;script&gt;');
  });
  it('Formulário do contrato: campo em branco marcado, trava explicada, "Salvar dados" é a dourada', () => {
    const m = miolo(CASOS_COMERCIAL2['form-faltando']());
    expect(m).toContain('cc-cf-vazio');
    expect(m).toContain('vai sair em branco no PDF');
    expect(m).toMatch(/Gerar PDF, Mandar e Salvar no Drive ficam travados/);
    expect(m).toMatch(/cc-btn-gold[^>]*>.*Salvar dados/);
    expect(m).toContain('class="cc-form"');
    expect(m).toContain('pra Eva'); // casa
  });
  it('Formulário (tenant): "pra assistente", nunca a assistente da casa', () => {
    const m = miolo(CASOS_COMERCIAL2['form-procuracao-tenant']());
    expect(m).toContain('pra assistente');
  });
  it('Formulário: o script "usar" só mexe em classe cc- (nada de Tailwind)', () => {
    const h = CASOS_COMERCIAL2['form-ia']();
    const script = h.slice(h.lastIndexOf('<script>'));
    expect(script).toContain("classList.remove('cc-cf-vazio')");
    expect(script).toContain("classList.add('cc-cf-usado')");
    expect(linhasComTailwind(script)).toEqual([]);
  });
  it('Formulário com IA: sugestão com botão "usar" e achados por gravidade', () => {
    const m = miolo(CASOS_COMERCIAL2['form-ia']());
    expect(m).toMatch(/data-usar="[^"]+" data-valor="Sugestão &lt;b&gt;IA&lt;\/b&gt;"/);
    expect(m).toContain('Valor &lt;diferente&gt;');
    expect(m).toContain('cc-cf-parc');
  });
  it('Documento travado: pílula "travado", lista do que falta e volta pro formulário', () => {
    const m = miolo(CASOS_COMERCIAL2['bloqueado-enviar']());
    expect(m).toContain('travado');
    expect(m).toContain('/contrato-form?tipo=fv');
    expect(m).toMatch(/congel[a-z]* de novo/i);
  });
  it('Recados: tabela cc- que vira cartão no celular, mensagem escapada', () => {
    const m = miolo(CASOS_COMERCIAL2['recados']());
    expect(m).toContain('cc-tbl-cartoes');
    expect(m).toContain('data-label="Recado"');
    expect(m).toContain('&lt;script&gt;roubar()');
    expect(miolo(CASOS_COMERCIAL2['recados-vazio']())).toContain('Nenhum recado ainda');
  });
  it('Lojas: placar em KPIs, kit mais barato marcado, catálogo que rola no celular', () => {
    const m = miolo(CASOS_COMERCIAL2['lojas-kit']());
    expect(m).toContain('cc-kpi');
    expect(m).toContain('cc-cm-melhor');
    expect(m).toContain('cc-tbl-rolar');
    expect(m).toContain('Produto fictício &lt;b&gt;');
    expect(miolo(CASOS_COMERCIAL2['lojas-kit-prejuizo']())).toContain('prejuízo');
  });
  it('Lojas (tenant): sem "Junior" nem "padrão da casa"', () => {
    const m = miolo(CASOS_COMERCIAL2['lojas-tenant']());
    expect(m).not.toContain('Junior');
    expect(m).toContain('Growatt não entra.');
  });
  it('Conhecimento: um cartão por assunto, pílula em branco/preenchido', () => {
    const m = miolo(CASOS_COMERCIAL2['conhecimento']());
    expect(m).toContain('em branco — ela não fala disso');
    expect(m).toContain('preenchido');
    expect(m).toContain('Sistemas fotovoltaicos &lt;script&gt;');
  });
});

describe('/conhecimento (segurança de marca): tenant nunca herda o nome da assistente da casa', () => {
  const fonte = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', 'router.ts'), 'utf-8');
  it('a rota usa o nome CADASTRADO do tenant ou "assistente" (empresaDe() cai nos padrões da casa)', () => {
    const i = fonte.indexOf("router.get('/conhecimento'");
    const trecho = fonte.slice(i, fonte.indexOf("router.post('/conhecimento/:chave'", i));
    expect(trecho).toContain("nomeDaAssistente(companyId) ?? 'assistente'");
    expect(trecho).toContain('companyId === ECOSUN_COMPANY_ID ? empresaDe(companyId).nomeAtendente');
  });
});
