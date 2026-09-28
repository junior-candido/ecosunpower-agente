// Renovação do miolo — R9: telas da USINA (detalhe, dados, editar, importar)
// no padrão cc- (tema escuro do Command Center — D4). Contrato em
// miolo-usina-contrato.test.ts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { corpoDaFuncao, linhasComTailwind } from './helpers/teto-tailwind.js';
import { CASOS_USINA } from './fixtures/casos-usina.js';

const miolo = (h: string) => h.slice(h.indexOf('<main'), h.indexOf('</main>'));
const FONTE = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', 'views.ts'), 'utf-8');

describe('Usina — detalhe', () => {
  const h = CASOS_USINA['detalhe-mes']();
  const m = miolo(h);

  it('cabeçalho Usinas › Monitoramento › nome, status em pílula, Atualizar dourado único', () => {
    expect(m).toContain('cc-crumb');
    expect(m).toContain('href="/dashboard/monitoramento">Monitoramento</a>');
    expect(m).toContain('<h1>Casa Exemplo &lt;script&gt;alert(1)&lt;/script&gt;</h1>');
    expect(m).toContain('cc-pill cc-s-crit');
    expect((m.match(/cc-btn-gold/g) ?? []).length).toBe(1);
    expect(m).toMatch(/cc-btn cc-btn-gold"><svg[^>]*>.*?<\/svg>Atualizar agora<\/button>/);
    expect(m).toContain(`/relatorio"`);
  });

  it('abas por âncora (#visao, #geracao, #manutencao, #dados) — sem rota nova', () => {
    for (const a of ['visao', 'geracao', 'manutencao', 'dados']) {
      expect(m).toContain(`href="#${a}"`);
      expect(m).toContain(`id="${a}"`);
    }
    expect(m).toContain('aria-current="page"');
  });

  it('faixa de KPIs com o que a tela já tinha (hoje, mês, ano, total) e performance com barra', () => {
    expect(m).toContain('cc-kstrip');
    for (const r of ['Hoje', 'Mês', 'Ano', 'Total monitorado']) expect(m).toContain(`<div class="cc-lbl">${r}</div>`);
    expect(m).toContain('cc-bar');
    expect(m).toContain('93%');
  });

  it('carregar histórico completo fica no "⋯ Mais ações", com o MESMO confirm', () => {
    const mais = m.slice(m.indexOf('cc-mais'));
    expect(mais).toContain('/backfill');
    expect(mais).toContain("confirm('Vai puxar TODO o histórico");
  });

  it('alertas em linha de lista (texto escapado) e prontuário cc-', () => {
    expect(m).toContain('cc-li');
    expect(m).toContain('&lt;b&gt;teste&lt;/b&gt;');
    expect(m).toContain('Prontuário de manutenção');
    expect(m).toContain('Placas bem sujas &lt;script&gt;');
  });

  it('gráficos: mesmos canvas e arrays, Chart.js pinado e JS_TEMA_GRAFICOS uma vez', () => {
    expect(m).toContain('id="graficoPeriodo"');
    expect(m).toContain('id="graficoMensal"');
    expect(h).toContain('chart.js@4.4.0');
    expect((h.match(/id="cc-tema-graficos"/g) ?? []).length).toBe(1);
    expect(h).toContain('"01","02","03"');
    expect(h).toContain('[20,22.5,25');
  });

  it('dia sem curva e sem dado → estado vazio e "—"', () => {
    const d = miolo(CASOS_USINA['detalhe-dia-sem-curva']());
    expect(d).toContain('cc-empty');
    expect(d).toContain('Curva minuto a minuto não disponível');
    const v = miolo(CASOS_USINA['detalhe-sem-dado']());
    expect(v).toContain('cc-kpi-vazio');
    expect(v).toContain('Sem geração registrada nesse período.');
    expect(v).toContain('Token expirado (401)');
    expect(v).toContain('Sistema operando normalmente');
  });

  it('mini-mapa da main (#330) continua na tela, na aba Dados, com o painel no tema do Command Center', () => {
    const dados = m.slice(m.indexOf('id="dados"'));
    expect(dados).toContain('id="mu-mapa-usina"');
    expect(dados).toContain('data-acao="localizar"');
    expect(h).toContain('.cc-us .mu-box{');
    expect(h).toContain('if (!window.ccSegurarRecarga) location.reload()');
  });

  it('tenant: escuro, sem "Eva" e sem nada da casa', () => {
    const t = CASOS_USINA['detalhe-tenant']();
    expect(t).toContain('<div class="cc-shell cc-escuro">');
    expect(miolo(t)).toContain('Abordagens da assistente');
    expect(miolo(t)).not.toContain('Eva');
    expect(t).not.toContain('EcoSunPower');
    expect(t).not.toContain('CNPJ 33.020');
  });
});

describe('Usina — dados do inversor', () => {
  it('filtro cc-form com os mesmos selects e gráfico tematizado', () => {
    const m = miolo(CASOS_USINA.dados());
    expect(m).toContain('class="cc-form');
    expect(m).toContain('id="form-telemetria"');
    expect(m).toContain('id="graficoTelemetria"');
  });
  it('sem dado → estado vazio', () => {
    expect(miolo(CASOS_USINA['dados-vazio']())).toContain('cc-empty');
  });
});

describe('Usina — editar', () => {
  const m = miolo(CASOS_USINA.editar());
  it('form cc-form em painéis, Salvar dourado único, Desvincular crítico', () => {
    expect(m).toMatch(/<form action="\/dashboard\/monitoramento\/[^"]+\/editar" method="post" class="cc-form/);
    for (const t of ['Identificação', 'Proprietário', 'Painéis solares', 'Inversor (modelo específico)', 'Telhado', 'Observações']) {
      expect(m).toContain(`<h3>${t}</h3>`);
    }
    expect((m.match(/cc-btn-gold/g) ?? []).length).toBe(1);
    expect(m).toContain('name="desvincular" value="1" class="cc-btn cc-btn-sm cc-btn-crit"');
  });
  it('busca de cliente no padrão cc- (mesmos ids)', () => {
    expect(m).toContain('id="prop-busca"');
    expect(m).toContain('class="cc-us-sel-drop hidden"');
  });
});

describe('Usina — importar', () => {
  it('erro da rota num aviso de erro com o MESMO texto (escapado)', () => {
    const m = miolo(CASOS_USINA['importar-erro']());
    expect(m).toContain('cc-aviso cc-aviso-erro');
    expect(m).toContain('API key inválida ou sem permissão &lt;b&gt;x&lt;/b&gt;.');
  });
  it('sucesso com contagem e lista escapada', () => {
    const m = miolo(CASOS_USINA['importar-sucesso']());
    expect(m).toContain('cc-aviso cc-aviso-ok');
    expect(m).toContain('3 sites encontrados — 2 novos cadastrados, 1 atualizados.');
    expect(m).toContain('Usina &lt;B&gt;');
  });
  it('Importar agora é o único dourado; resposta da API Deye escapada no navegador', () => {
    const h = CASOS_USINA.importar();
    expect((miolo(h).match(/cc-btn-gold/g) ?? []).length).toBe(1);
    expect(h).toContain("esc(e.companyName)");
  });
  it('tenant: sem o endereço da EcoSun como retorno do Sungrow', () => {
    const t = CASOS_USINA['importar-tenant']();
    expect(t).not.toContain('ecosunpowerenergia');
    expect(CASOS_USINA.importar()).toContain('value="https://www.ecosunpowerenergia.com.br"');
  });
});

describe('Usina — sem Tailwind', () => {
  for (const fn of ['renderDetalheSistemaPage', 'renderTelemetriaPage', 'renderEditarSistemaPage', 'renderImportarSitesPage']) {
    it(`${fn}: miolo sem Tailwind`, () => {
      expect(linhasComTailwind(corpoDaFuncao(FONTE, fn))).toEqual([]);
    });
  }
  it('nenhuma das 4 telas carrega o Tailwind do CDN', () => {
    for (const k of ['detalhe-mes', 'dados', 'editar', 'importar'] as const) {
      expect(CASOS_USINA[k]()).not.toContain('cdn.tailwindcss.com');
    }
  });
});
