// Design system do Command Center (fase A) — componentes puros que devolvem HTML.
// Regras testadas: tudo que vem de dado é ESCAPADO; null/undefined/NaN vira "—"
// (nunca número inventado); variantes de estado com a classe certa.
import { describe, it, expect } from 'vitest';
import {
  escapeHtml, fmtNumero, fmtCompacto,
} from '../src/modules/dashboard/ui/html.js';
import {
  pilulaStatus, kpiCard, faixaKpis, cartaoSecao, tabela, selo, sparkline,
  estadoVazio, cabecalhoPagina, icone, TONS,
} from '../src/modules/dashboard/ui/componentes.js';

const XSS = '<script>alert("x")</script>';

describe('html — escape e números', () => {
  it('escapa os 5 caracteres perigosos e trata null', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe('&lt;a href=&quot;x&quot; onclick=&#039;y&#039;&gt;&amp;&lt;/a&gt;');
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('fmtNumero: pt-BR com casas; sem dado vira travessão', () => {
    expect(fmtNumero(1234.5, 1)).toBe('1.234,5');
    expect(fmtNumero(0)).toBe('0');
    expect(fmtNumero(null)).toBe('—');
    expect(fmtNumero(undefined)).toBe('—');
    expect(fmtNumero(Number.NaN)).toBe('—');
    expect(fmtNumero(Number.POSITIVE_INFINITY)).toBe('—');
  });

  it('fmtCompacto: mil / mi com sufixo separado', () => {
    expect(fmtCompacto(284_800)).toEqual({ numero: '284,8', sufixo: 'mil' });
    expect(fmtCompacto(1_240_000)).toEqual({ numero: '1,24', sufixo: 'mi' });
    expect(fmtCompacto(950)).toEqual({ numero: '950', sufixo: '' });
    expect(fmtCompacto(null)).toEqual({ numero: '—', sufixo: '' });
  });
});

describe('pilulaStatus', () => {
  it('cada tom tem classe, rótulo e emoji (🔴🟠🟡🟢🔵 + sem dado)', () => {
    expect(TONS.critico.emoji).toBe('🔴');
    expect(TONS.atencao.emoji).toBe('🟠');
    expect(TONS.acompanhar.emoji).toBe('🟡');
    expect(TONS.oportunidade.emoji).toBe('🟢');
    expect(TONS.info.emoji).toBe('🔵');
    expect(TONS.sem_dado.rotulo).toBe('Sem dado');
    expect(pilulaStatus('critico')).toContain('cc-s-crit');
    expect(pilulaStatus('critico')).toContain('Crítico');
    expect(pilulaStatus('sem_dado')).toContain('cc-s-off');
    expect(pilulaStatus('normal')).toContain('cc-s-ok');
  });

  it('texto próprio é escapado', () => {
    const h = pilulaStatus('info', XSS);
    expect(h).not.toContain('<script>');
    expect(h).toContain('&lt;script&gt;');
  });
});

describe('kpiCard / faixaKpis', () => {
  it('mostra o número formatado com unidade', () => {
    const h = kpiCard({ rotulo: 'Leads do mês', valor: 212 });
    expect(h).toContain('Leads do mês');
    expect(h).toContain('212');
    expect(h).toContain('cc-kpi');
  });

  it('valor null → "—" e "sem dado", nunca número', () => {
    const h = kpiCard({ rotulo: 'Geração agora', valor: null, unidade: 'kW' });
    expect(h).toContain('—');
    expect(h).toContain('sem dado');
    expect(h).not.toMatch(/\d/);
  });

  it('texto de "sem dado" pode ser trocado (ex.: em construção)', () => {
    const h = kpiCard({ rotulo: 'Faturamento', valor: undefined, semDadoTexto: 'em construção' });
    expect(h).toContain('em construção');
  });

  it('escapa rótulo, unidade e detalhe', () => {
    const h = kpiCard({ rotulo: XSS, valor: 1, unidade: XSS, detalhe: XSS });
    expect(h).not.toContain('<script>');
  });

  it('tendência sobe/desce ganha a cor certa; destaque ganha classe', () => {
    expect(kpiCard({ rotulo: 'a', valor: 1, tendencia: { texto: '▲ 6%', direcao: 'sobe' } })).toContain('cc-up');
    expect(kpiCard({ rotulo: 'a', valor: 1, tendencia: { texto: '▼ 7%', direcao: 'desce' } })).toContain('cc-dn');
    expect(kpiCard({ rotulo: 'a', valor: 1, destaque: true })).toContain('cc-kpi-hl');
  });

  it('com href vira link; href perigoso é descartado', () => {
    expect(kpiCard({ rotulo: 'a', valor: 1, href: '/dashboard/leads' })).toContain('href="/dashboard/leads"');
    expect(kpiCard({ rotulo: 'a', valor: 1, href: 'javascript:alert(1)' })).not.toContain('javascript:');
  });

  it('prefixo R$ e formato compacto', () => {
    const h = kpiCard({ rotulo: 'Faturamento', valor: 284_800, prefixo: 'R$', compacto: true });
    expect(h).toContain('R$');
    expect(h).toContain('284,8');
    expect(h).toContain('mil');
  });

  it('faixaKpis define o nº de colunas e junta os cards', () => {
    const h = faixaKpis([{ rotulo: 'a', valor: 1 }, { rotulo: 'b', valor: 2 }, { rotulo: 'c', valor: null }]);
    expect(h).toContain('--n:3');
    expect(h.match(/class="cc-kpi[ "]/g)?.length).toBe(3);
  });
});

describe('cartaoSecao', () => {
  it('título escapado, corpo HTML confiável, dica e ações opcionais', () => {
    const h = cartaoSecao({ titulo: XSS, dica: 'real × esperada', corpoHtml: '<b>ok</b>', acoesHtml: '<a class="x">y</a>' });
    expect(h).not.toContain('<script>');
    expect(h).toContain('<b>ok</b>');
    expect(h).toContain('real × esperada');
    expect(h).toContain('<a class="x">y</a>');
    expect(h).toContain('cc-panel');
  });
});

describe('tabela', () => {
  it('cabeçalho + linhas escapadas; célula {html} passa crua; null vira —', () => {
    const h = tabela({
      colunas: [{ titulo: 'Usina' }, { titulo: 'Hoje', num: true, alinhar: 'dir' }],
      linhas: [[XSS, 12.5], [{ html: '<i>x</i>' }, null]],
    });
    expect(h).toContain('<th');
    expect(h).toContain('Usina');
    expect(h).not.toContain('<script>');
    expect(h).toContain('<i>x</i>');
    expect(h).toContain('12,5');
    expect(h).toContain('—');
    expect(h).toContain('cc-r');
  });

  it('sem linhas mostra o estado vazio', () => {
    const h = tabela({ colunas: [{ titulo: 'A' }], linhas: [], vazio: 'Nenhuma usina' });
    expect(h).toContain('Nenhuma usina');
  });

  it('linha clicável recebe o link (e rejeita link perigoso)', () => {
    const h = tabela({ colunas: [{ titulo: 'A' }], linhas: [['x'], ['y']], hrefs: ['/dashboard/leads/1', 'javascript:x'] });
    expect(h).toContain('/dashboard/leads/1');
    expect(h).not.toContain('javascript:');
  });
});

describe('selo (badge)', () => {
  it('nada quando não há contagem', () => {
    expect(selo(null)).toBe('');
    expect(selo(0)).toBe('');
  });
  it('número com tom', () => {
    expect(selo(6, 'critico')).toContain('cc-bdg-r');
    expect(selo(7, 'dourado')).toContain('cc-bdg-a');
    expect(selo(8)).toContain('>8<');
  });
});

describe('sparkline', () => {
  it('desenha caminho SVG com M e L', () => {
    const h = sparkline([1, 3, 2, 5]);
    expect(h).toContain('<svg');
    expect(h).toMatch(/d="M[\d.]+ [\d.]+ L/);
  });
  it('ignora nulls e, com menos de 2 pontos, mostra sem dado', () => {
    expect(sparkline([null, 4, null])).toContain('sem dado');
    expect(sparkline([])).toContain('sem dado');
  });
  it('série constante não divide por zero', () => {
    expect(sparkline([2, 2, 2])).not.toContain('NaN');
  });
  it('cor inválida cai na padrão (sem injeção)', () => {
    const h = sparkline([1, 2], { cor: '"><script>' });
    expect(h).not.toContain('<script>');
    expect(sparkline([1, 2], { cor: '#3DBB6E' })).toContain('#3DBB6E');
  });
});

describe('estadoVazio', () => {
  it('construção é explícito: "Em construção — próxima entrega"', () => {
    const h = estadoVazio({ tipo: 'construcao' });
    expect(h).toContain('Em construção');
    expect(h).toContain('próxima entrega');
  });
  it('texto próprio escapado', () => {
    expect(estadoVazio({ titulo: XSS })).not.toContain('<script>');
  });
});

describe('cabecalhoPagina', () => {
  it('trilha com links, atual sem link, título, filtros e ações', () => {
    const h = cabecalhoPagina({
      titulo: 'Usina X',
      subtitulo: 'sub',
      trilha: [{ rotulo: 'Command Center', href: '/dashboard/command-center' }, { rotulo: 'Usinas', href: '/dashboard/monitoramento' }, { rotulo: 'Usina X' }],
      filtrosHtml: '<span class="f">P</span>',
      acoesHtml: '<a class="b">TV</a>',
      aoVivo: 'domingo · 11:42',
    });
    expect(h).toContain('href="/dashboard/command-center"');
    expect(h).toContain('cc-crumb');
    expect(h).toContain('<h1');
    expect(h).toContain('Usina X');
    expect(h).toContain('<span class="f">P</span>');
    expect(h).toContain('<a class="b">TV</a>');
    expect(h).toContain('Ao vivo');
  });
  it('título escapado', () => {
    expect(cabecalhoPagina({ titulo: XSS })).not.toContain('<script>');
  });
});

describe('icone', () => {
  it('usa o sprite pelo id', () => {
    expect(icone('sun')).toContain('href="#cc-i-sun"');
    expect(icone('sun', 'sm')).toContain('cc-i-sm');
  });
});
