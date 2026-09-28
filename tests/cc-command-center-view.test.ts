// Command Center (fase B): layout do protótipo aprovado com DADO REAL. Número só
// se for real: falhou → "—" + "sem dado agora"; sem permissão → "sem acesso";
// a Central nunca diz "tudo em dia" quando alguma fonte não carregou.
import { describe, it, expect } from 'vitest';
import {
  renderCommandCenterPage, renderCentralAtencaoPage, saudacao, carimboAoVivo, graficoCurva, selosDoMenu, cartaoEvento,
  type CommandCenterDados,
} from '../src/modules/dashboard/command-center-views.js';
import { resumirFrota, type UsinaLinha, type GeracaoLinha } from '../src/modules/dashboard/command-center-calc.js';
import type { DadosCommandCenter, FonteAviso } from '../src/modules/dashboard/command-center-queries.js';
import { ROTULO_FONTE, TODAS_PERMISSOES } from '../src/modules/dashboard/command-center-queries.js';
import type { EventoAtencao } from '../src/modules/dashboard/central-atencao.js';
import type { DashUser } from '../src/modules/dashboard/permissions.js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';
const junior: DashUser = { id: 'u', companyId: ECOSUN, nome: 'Junior', login: 'j', isAdmin: true, roleNome: 'Administrador', permissoes: {} };

// 27/09/2026 14:42 UTC = 11:42 em Brasília (domingo)
const AGORA = new Date('2026-09-27T14:42:00Z');

const u = (id: string, extra: Partial<UsinaLinha> = {}): UsinaLinha => ({
  id, apelido: `Usina ${id}`, potencia_kwp: 10, cidade: 'Gama', uf: 'DF', ativo: true,
  ultima_sincronizacao: '2026-09-27T14:30:00Z', ultimo_erro: null, status_inversor: 'ok', acompanhamento: 'api', ...extra,
});
const dias = (id: string, kwh: number): GeracaoLinha[] => Array.from({ length: 30 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 7, 28 + i)).toISOString().slice(0, 10);
  return { sistema_id: id, data: d, geracao_kwh: kwh };
});
const frota = resumirFrota(
  [u('a'), u('b', { cidade: 'Sobradinho', ultimo_erro: 'token expirado' })],
  [...dias('a', 40), { sistema_id: 'a', data: '2026-09-27', geracao_kwh: 21.7 }],
  [{ sistema_id: 'a', device_key: 'i', valor: 4.3, ts: '2026-09-27T14:35:00Z' }],
  { agora: AGORA, corteAtencao: 0.7 },
);

const fontesOk = (): FonteAviso[] => (Object.keys(ROTULO_FONTE) as Array<keyof typeof ROTULO_FONTE>)
  .map((id) => ({ id, rotulo: ROTULO_FONTE[id], estado: 'ok' as const }));

const ev = (p: Partial<EventoAtencao>): EventoAtencao => ({
  id: p.id ?? 'x', severidade: 'atencao', area: 'comercial', titulo: 'Título', contexto: 'Comercial',
  acao: { rotulo: 'Ver', href: '/dashboard/propostas' }, ...p,
});

const EVENTOS: EventoAtencao[] = [
  ev({ id: 'usina:z', severidade: 'critico', area: 'usinas', titulo: 'Usina Z está sem gerar', contexto: 'Usinas · Gama', impactoRs: 43, impactoTexto: 'Perda estimada R$ 43/dia', acao: { rotulo: 'Abrir usina', href: '/dashboard/monitoramento/z' } }),
  ev({ id: 'propostas:paradas-72h', titulo: '3 propostas paradas há mais de 72 h', impactoTexto: 'R$ 61 mil em jogo' }),
  ev({ id: 'gd:1', severidade: 'acompanhar', area: 'clientes', titulo: 'Créditos GD vencem', acao: { rotulo: 'Ver clientes', href: '/dashboard/demonstrativos' } }),
];

function dados(extra: Partial<DadosCommandCenter> = {}): DadosCommandCenter {
  return {
    agora: AGORA,
    permissoes: { ...TODAS_PERMISSOES },
    frota,
    kpisMes: { leads: 212, propostas: 47, vendas: 9, usinasNovas: 3 },
    mudancas24h: { leads: 14, propostas: 2, vendas: 1 },
    recebidoMes: 3500,
    manutencao: { vencidas: 2, proximas30: 5 },
    eventos: EVENTOS,
    fontes: fontesOk(),
    ...extra,
  };
}

const pagina = (dd: DadosCommandCenter | null, nome = 'Junior') =>
  renderCommandCenterPage({ agora: AGORA, nomeUsuario: nome, dados: dd } satisfies CommandCenterDados, junior);

/** Recorta o cartão de KPI pelo rótulo. */
function cartaoKpi(html: string, rotulo: string): string {
  const i = html.indexOf(`<div class="cc-lbl">${rotulo}</div>`);
  expect(i, rotulo).toBeGreaterThan(-1);
  return html.slice(i, html.indexOf('</a>', i));
}
const kstrip = (h: string) => h.slice(h.indexOf('cc-kstrip'), h.indexOf('</section>', h.indexOf('cc-kstrip')));

describe('saudacao / carimbo (horário de Brasília)', () => {
  it('bom dia / boa tarde / boa noite pelo relógio de Brasília, não do servidor', () => {
    expect(saudacao(new Date('2026-09-27T14:42:00Z'))).toBe('Bom dia');   // 11:42
    expect(saudacao(new Date('2026-09-27T15:00:00Z'))).toBe('Boa tarde'); // 12:00
    expect(saudacao(new Date('2026-09-27T21:00:00Z'))).toBe('Boa noite'); // 18:00
    expect(saudacao(new Date('2026-09-28T02:30:00Z'))).toBe('Boa noite'); // 23:30 do dia 27
    expect(saudacao(new Date('2026-09-28T08:00:00Z'))).toBe('Bom dia');   // 05:00
  });
  it('carimbo por extenso', () => {
    expect(carimboAoVivo(AGORA)).toBe('domingo, 27 de setembro · atualizado às 11:42');
  });
});

describe('renderCommandCenterPage — estrutura', () => {
  it('cabeçalho, hero da Eva, KPIs, geração, usinas, Central de Atenção e áreas', () => {
    const h = pagina(dados());
    for (const t of ['Command Center', 'Como está a empresa agora', 'Bom dia, Junior.', 'cc-kstrip', 'Geração do portfólio', 'Usinas agora', 'Central de Atenção']) {
      expect(h, t).toContain(t);
    }
    for (const area of ['Comercial', 'Marketing', 'Instalações', 'O&amp;M', 'Financeiro']) expect(h).toContain(area);
  });

  it('casca nova, larga e escura, com o item Command Center aceso e selos reais no menu', () => {
    const h = pagina(dados());
    expect(h).toContain('class="cc-main cc-largo"');
    expect(h).toContain('<div class="cc-shell cc-escuro">');
    expect(h).toMatch(/<a href="\/dashboard\/command-center" class="cc-on"/);
    expect(h).toContain('href="/dashboard/atencao"');
  });

  it('números do protótipo NÃO vazam pra produção', () => {
    const h = pagina(dados());
    for (const fake of ['912', '4,12', '186,4', '1,62', '284,8', '118 de 124', 'Atacadão', 'R$ 164', '98,2%', 'Fase A']) {
      expect(h, fake).not.toContain(fake);
    }
  });
});

describe('KPIs com dado real', () => {
  const h = pagina(dados());
  it('geração agora (telemetria), energia hoje e potência', () => {
    expect(cartaoKpi(h, 'Geração agora')).toContain('<div class="cc-val">4,3<small>kW</small></div>');
    expect(cartaoKpi(h, 'Geração agora')).toContain('1 usina ao vivo');
    expect(cartaoKpi(h, 'Energia hoje')).toContain('<div class="cc-val">22<small>kWh</small></div>');
    expect(cartaoKpi(h, 'Potência total')).toContain('<div class="cc-val">20,0<small>kWp</small></div>');
  });
  it('usinas no ar / monitoradas, com quantas estão sem sinal', () => {
    const c = cartaoKpi(h, 'Usinas no ar');
    expect(c).toContain('<div class="cc-val">1<small>/ 2</small></div>');
    expect(c).toContain('1 sem sinal');
  });
  it('faturamento recebido, leads e vendas do mês', () => {
    expect(cartaoKpi(h, 'Recebido')).toContain('3,5<small>mil</small>');
    expect(cartaoKpi(h, 'Leads do mês')).toContain('<div class="cc-val">212</div>');
    expect(cartaoKpi(h, 'Leads do mês')).toContain('+14 desde ontem');
    expect(cartaoKpi(h, 'Vendas')).toContain('<div class="cc-val">9</div>');
    expect(cartaoKpi(h, 'Vendas')).toContain('47 propostas');
  });
  it('sem permissão de Financeiro → "—" + "sem acesso" (nunca 0)', () => {
    const s = pagina(dados({ permissoes: { ...TODAS_PERMISSOES, financeiro: false }, recebidoMes: null }));
    const c = cartaoKpi(s, 'Recebido');
    expect(c).toContain('<div class="cc-val">—</div>');
    expect(c).toContain('sem acesso');
  });
  it('carga inteira falhou: nenhum número na faixa, só "sem dado agora"', () => {
    const s = pagina(null, 'Thiago');
    expect(s).toContain('Bom dia, Thiago.');
    expect(kstrip(s)).not.toMatch(/cc-val">\d/);
    expect(cartaoKpi(s, 'Leads do mês')).toContain('sem dado agora');
    expect(s).not.toContain('Tudo em dia');
  });
});

describe('hero da Eva: resumo, o que mudou e ações recomendadas', () => {
  it('frases só com número real', () => {
    const h = pagina(dados());
    expect(h).toContain('<b>1 de 2 usinas</b> está gerando normalmente.');
    expect(h).toContain('Ontem o portfólio gerou <b>96% do esperado</b>.');
    expect(h).toContain('Neste mês entraram <b>212 leads</b>, saíram <b>47 propostas</b> e <b>9 vendas fecharam</b>.');
    expect(h).toContain('Há <b>1 aviso crítico</b> pedindo você agora.');
  });
  it('sem uma das contagens do comercial, a frase do mês não sai (não inventa)', () => {
    const h = pagina(dados({ kpisMes: { leads: 212, propostas: null, vendas: 9, usinasNovas: 3 } }));
    expect(h).not.toContain('Neste mês entraram');
  });
  it('"Nenhum aviso crítico" só quando todas as fontes carregaram', () => {
    const semCrit = EVENTOS.filter((e) => e.severidade !== 'critico');
    expect(pagina(dados({ eventos: semCrit }))).toContain('Nenhum aviso crítico agora.');
    const falhou = fontesOk().map((f) => (f.id === 'contas' ? { ...f, estado: 'falhou' as const } : f));
    expect(pagina(dados({ eventos: semCrit, fontes: falhou }))).not.toContain('Nenhum aviso crítico');
  });
  it('chips do que mudou desde ontem', () => {
    const h = pagina(dados());
    expect(h).toContain('+14 leads novos');
    expect(h).toContain('2 propostas enviadas');
    expect(h).toContain('1 venda fechada');
    expect(h).toContain('Ontem: 96% do esperado');
  });
  it('3 ações: a 1ª (maior impacto) em dourado, com o link de onde resolver', () => {
    const h = pagina(dados());
    const i = h.indexOf('cc-act cc-act-1');
    expect(i).toBeGreaterThan(-1);
    const primeira = h.slice(i, h.indexOf('</a>', i));
    expect(primeira).toContain('Próxima ação mais importante');
    expect(primeira).toContain('Usina Z está sem gerar');
    expect(primeira).toContain('class="cc-btn cc-btn-sm cc-btn-gold" href="/dashboard/monitoramento/z"');
    expect(h.match(/class="cc-act[ "]/g)).toHaveLength(3);
  });
  it('sem aviso nenhum e tudo carregado → "Nada urgente agora"', () => {
    expect(pagina(dados({ eventos: [] }))).toContain('Nada urgente agora');
  });
});

describe('Central de Atenção (Home)', () => {
  it('contagem real por severidade + avisos com cor, impacto e botão', () => {
    const h = pagina(dados());
    expect(h).toMatch(/Crítico <b>1<\/b>/);
    expect(h).toMatch(/Atenção <b>1<\/b>/);
    expect(h).toMatch(/Acompanhar <b>1<\/b>/);
    // nível que nenhuma fonte produz ainda: "—", nunca 0
    expect(h).toMatch(/Oportunidade <b>—<\/b>/);
    expect(h).toMatch(/Info <b>—<\/b>/);
    expect(h).toContain('cc-ev cc-ev-critico');
    expect(h).toContain('Perda estimada R$ 43/dia');
    expect(h).toContain('R$ 61 mil em jogo');
  });
  it('mostra só os 8 de maior impacto e oferece "Ver os N"', () => {
    const muitos = Array.from({ length: 11 }, (_, i) => ev({ id: `e${i}` }));
    const h = pagina(dados({ eventos: muitos }));
    const att = h.slice(h.indexOf('cc-a-att'));
    expect(att.match(/class="cc-ev cc-ev-/g)).toHaveLength(8);
    expect(h).toContain('Ver os 11');
  });
  it('lista vazia com tudo carregado → "Tudo em dia por aqui"', () => {
    expect(pagina(dados({ eventos: [] }))).toContain('Tudo em dia por aqui');
  });
  it('fonte que falhou: avisa "não consegui ler" e NUNCA diz "tudo em dia"', () => {
    const falhou = fontesOk().map((f) => (f.id === 'usinas' ? { ...f, estado: 'falhou' as const } : f));
    const h = pagina(dados({ eventos: [], fontes: falhou }));
    expect(h).toContain('Não consegui ler agora');
    expect(h).toContain(ROTULO_FONTE.usinas.toLowerCase());
    expect(h).not.toContain('Tudo em dia');
    expect(h).not.toContain('Nada urgente agora');
  });
  it('ações com fonte faltando avisam que a ordem pode mudar', () => {
    const falhou = fontesOk().map((f) => (f.id === 'usinas' ? { ...f, estado: 'falhou' as const } : f));
    expect(pagina(dados({ fontes: falhou }))).toContain('a ordem pode mudar');
    expect(pagina(dados())).not.toContain('a ordem pode mudar');
  });
  it('texto do aviso é escapado; link que não é interno cai na Central', () => {
    const h = cartaoEvento(ev({ titulo: '<img src=x onerror=alert(1)>', acao: { rotulo: 'Ver', href: 'javascript:alert(1)' } }));
    expect(h).not.toContain('<img src=x');
    expect(h).toContain('&lt;img');
    expect(h).toContain('href="/dashboard/atencao"');
    expect(h).not.toContain('javascript:');
  });
  it('nome do usuário escapado', () => {
    expect(pagina(dados(), '<img onerror=x>')).not.toContain('<img onerror=x>');
  });
});

describe('geração do portfólio e usinas agora', () => {
  it('curva real × esperada com números dia a dia', () => {
    const h = pagina(dados());
    expect(h).toContain('real × esperada · 30 dias');
    expect(h).toContain('Esperada (média de sol da região)');
    expect(h).toContain('Ver os números dia a dia');
    expect(h).toContain('Desvio');
  });
  it('sem kWp em alguma usina → só a real, dizendo por quê', () => {
    const f = resumirFrota([u('a', { potencia_kwp: null })], dias('a', 40), [], { agora: AGORA, corteAtencao: 0.7 });
    const h = pagina(dados({ frota: f }));
    expect(h).toContain('Só a geração real: falta a potência (kWp)');
    expect(h).not.toContain('Esperada (média de sol da região)');
  });
  it('graficoCurva: uma barra por dia com dado, dica ao passar o mouse e linha tracejada da esperada', () => {
    const g = graficoCurva(frota.curva);
    expect(g.match(/<rect /g)).toHaveLength(30);
    expect(g).toContain('<title>26/09: real 40 kWh · esperada 42 kWh</title>');
    expect(g).toContain('class="cc-linha-esp"');
  });
  it('usinas por estado e por cidade (pior estado primeiro); mapa segue "próxima entrega"', () => {
    const h = pagina(dados());
    const bloco = h.slice(h.indexOf('Usinas agora'), h.indexOf('cc-a-att'));
    expect(bloco).toMatch(/Sem comunicação<b>1<\/b>/);
    expect(bloco).toMatch(/Normal<b>1<\/b>/);
    expect(bloco.indexOf('Sobradinho')).toBeLessThan(bloco.indexOf('Gama'));
    expect(bloco).toContain('Mapa por região: próxima entrega');
  });
  it('sem acesso às usinas', () => {
    expect(pagina(dados({ frota: null, permissoes: { ...TODAS_PERMISSOES, usinas: false } }))).toContain('Sem acesso às usinas');
  });
});

describe('cartões por área', () => {
  it('levam às telas que já existem e mostram o aviso principal da área', () => {
    const h = pagina(dados());
    for (const href of ['/dashboard/leads/kanban', '/dashboard/marketing', '/dashboard/usinas/kanban', '/dashboard/manutencao', '/dashboard/financeiro']) {
      expect(h).toContain(`href="${href}"`);
    }
    const depts = h.slice(h.indexOf('cc-depts'));
    expect(depts).toContain('3 propostas paradas há mais de 72 h'); // aviso do Comercial
    expect(depts).toContain('2 <small>manutenções vencidas</small>');
    expect(depts).toContain('5 agendadas para os próximos 30 dias');
  });
});

describe('selosDoMenu', () => {
  it('conta crítico + atenção por área; vermelho se tiver crítico', () => {
    expect(selosDoMenu(EVENTOS)).toEqual({
      usinas: { valor: 1, tom: 'critico' },
      comercial: { valor: 1, tom: 'dourado' },
    });
  });
});

describe('renderCentralAtencaoPage (/dashboard/atencao)', () => {
  const pag = (filtro: { area?: unknown; severidade?: unknown } = {}, dd: DadosCommandCenter | null = dados()) =>
    renderCentralAtencaoPage({ agora: AGORA, dados: dd, filtro }, junior);

  it('trilha, contagem por severidade e todos os avisos agrupados', () => {
    const h = pag();
    expect(h).toContain('Command Center</a>');
    expect(h).toContain('Central de Atenção');
    expect(h).toMatch(/<a href="\/dashboard\/atencao" class="cc-on"/);
    expect(h.match(/class="cc-ev cc-ev-/g)).toHaveLength(3);
    expect(h.indexOf('Usina Z está sem gerar')).toBeLessThan(h.indexOf('3 propostas paradas'));
  });
  it('Oportunidade e Info ainda sem fonte: "—" + "em construção" na faixa', () => {
    const h = pag();
    const i = h.indexOf('<div class="cc-lbl">Oportunidade</div>');
    expect(h.slice(i, i + 200)).toContain('<div class="cc-val">—</div>');
    expect(h.slice(i, i + 300)).toContain('em construção');
  });
  it('filtro por área e severidade', () => {
    expect(pag({ area: 'usinas' }).match(/class="cc-ev cc-ev-/g)).toHaveLength(1);
    expect(pag({ severidade: 'acompanhar' }).match(/class="cc-ev cc-ev-/g)).toHaveLength(1);
    expect(pag({ area: 'om' })).toContain('Nenhum aviso com esse filtro');
  });
  it('filtro desconhecido (vindo da URL) é ignorado e não vai pro HTML', () => {
    const h = pag({ area: '"><script>x</script>', severidade: 'nada' });
    expect(h.match(/class="cc-ev cc-ev-/g)).toHaveLength(3);
    expect(h).not.toContain('<script>x</script>');
  });
  it('painel "De onde vêm os avisos" mostra fonte ligada, que falhou e sem acesso', () => {
    const fontes = fontesOk().map((f) => (f.id === 'gd' ? { ...f, estado: 'falhou' as const } : f.id === 'contas' ? { ...f, estado: 'sem_acesso' as const } : f));
    const h = pag({}, dados({ fontes }));
    expect(h).toContain('De onde vêm os avisos');
    expect(h).toContain('não carregou');
    expect(h).toContain('sem acesso');
    expect(h).toContain('ligada');
    expect(h).toContain('Ainda não ligados');
  });
  it('sem dado nenhum → "Sem dado agora", nunca "Tudo em dia"', () => {
    const h = pag({}, null);
    expect(h).toContain('Sem dado agora');
    expect(h).not.toContain('Tudo em dia');
  });
});
