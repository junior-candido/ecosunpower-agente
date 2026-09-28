// Renovação do miolo — R13: Manutenção (agenda) e OS no padrão cc-, tema escuro
// (D4), sem Tailwind. Contrato em miolo-manutencao-contrato.test.ts. O laudo
// (documento com doctype próprio) NÃO muda — continua em os-views.test.ts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { linhasComTailwind, corpoDaFuncao } from './helpers/teto-tailwind.js';
import { CASOS_MANUTENCAO as C, diaRelativo } from './fixtures/casos-manutencao.js';
import { seloSemApi } from '../src/modules/dashboard/manutencao-views.js';

const miolo = (h: string) => h.slice(h.indexOf('<main'), h.indexOf('</main>'));
const ouros = (m: string) => (m.match(/cc-btn-gold/g) ?? []).length;
const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const bloco = (iso: string) => `<b>${iso.slice(8, 10)}</b><small>${MESES[Number(iso.slice(5, 7)) - 1]}</small>`;
/** Linha (<tr>) da agenda de uma manutenção. */
const linha = (m: string, id: string) => {
  const i = m.indexOf(`data-manut-id="${id}"`);
  return m.slice(i, m.indexOf('</tr>', i));
};

describe('Manutenção — agenda', () => {
  const h = C.agenda();
  const m = miolo(h);

  it('casca escura, cabeçalho com trilha, título sem emoji e UMA ação dourada', () => {
    expect(h).toContain('<div class="cc-shell cc-escuro">');
    expect(m).toContain('cc-crumb');
    expect(m).toContain('<h1>Manutenção</h1>');
    expect(ouros(m)).toBe(1);
  });

  it('faixa de KPIs só com números que a tela já calcula (agendadas, vencidas, próximas, leituras)', () => {
    const k = m.slice(m.indexOf('cc-kstrip'), m.indexOf('</section>', m.indexOf('cc-kstrip')));
    expect(k).toContain('Agendadas');
    expect(k).toMatch(/Agendadas<\/div><div class="cc-val">6</);
    expect(k).toMatch(/Vencidas<\/div><div class="cc-val">2</);
    expect(k).toMatch(/Próximos 30 dias<\/div><div class="cc-val">2</);
    expect(k).toMatch(/Leituras pendentes<\/div><div class="cc-val">2</);
  });

  it('agenda em tabela cc- (cartão no celular) com o dia em bloco', () => {
    expect(m).toContain('cc-tbl-cartoes');
    expect(m).toContain('class="cc-tbl');
    expect(linha(m, 'aaaaaaaa-2222-4333-8444-000000000001')).toContain(bloco(diaRelativo(-12)));
    expect(linha(m, 'aaaaaaaa-2222-4333-8444-000000000006')).toContain('cc-om-dia cc-om-dia-vazio');
  });

  it('pílula pela regra statusAgendaItem: vencida / próxima / programada', () => {
    expect(linha(m, 'aaaaaaaa-2222-4333-8444-000000000001')).toContain('cc-pill cc-s-crit');
    expect(linha(m, 'aaaaaaaa-2222-4333-8444-000000000001')).toContain('>vencida<');
    expect(linha(m, 'aaaaaaaa-2222-4333-8444-000000000003')).toContain('>próxima<');
    expect(linha(m, 'aaaaaaaa-2222-4333-8444-000000000005')).toContain('>programada<');
  });

  it('sem API vira selo cc- na linha; cliente vazio vira "—"; dado escapado', () => {
    expect(linha(m, 'aaaaaaaa-2222-4333-8444-000000000002')).toContain('Sem API');
    expect(linha(m, 'aaaaaaaa-2222-4333-8444-000000000002')).not.toContain('bg-amber-100');
    expect(linha(m, 'aaaaaaaa-2222-4333-8444-000000000003')).toContain('—');
    expect(m).not.toContain('<script>alert(1)</script>');
    expect(m).toContain('Sítio &lt;script&gt;');
  });

  it('leituras pendentes num painel, com o botão do modal (mesma classe e data-*)', () => {
    const i = m.indexOf('Leituras do mês pendentes');
    expect(i).toBeGreaterThan(-1);
    expect(m.slice(i)).toMatch(/class="[^"]*pv-leitura[^"]*" data-sistema="11111111-2222-4333-8444-000000000004" data-apelido="Chácara Recanto"/);
  });

  it('agendar e nova OS em painéis cc-form; o modal de leitura sem Tailwind', () => {
    expect(m).toMatch(/<form method="post" action="\/dashboard\/manutencao\/agendar" class="cc-form/);
    expect(m).toMatch(/<form method="post" action="\/dashboard\/os\/nova" class="cc-form/);
    expect(h).toMatch(/<div id="leitura-modal" class="cc-om-modal hidden"/);
    expect(h).not.toContain("classList.add('flex')");
    expect(h).toContain('.cc-om-modal.hidden{display:none}');
  });

  it('vazia → estado vazio, sem painel de leituras', () => {
    const v = miolo(C['agenda-vazia']());
    expect(v).toContain('cc-empty');
    expect(v).toContain('Nenhuma manutenção agendada.');
    expect(v).not.toContain('Leituras do mês pendentes');
  });

  it('tenant: casca escura e nada da EcoSun', () => {
    const t = C['agenda-tenant']();
    expect(t).toContain('<div class="cc-shell cc-escuro">');
    expect(t).not.toContain('EcoSunPower');
    expect(t).not.toContain('33.020');
    expect(miolo(t)).not.toContain('Eva');
  });
});

describe('seloSemApi (reusado no pós-venda) — mesmo texto de antes', () => {
  it('texto e forma iguais', () => {
    expect(seloSemApi(true)).toBe('<span class="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">📵 Sem API · leitura manual</span>');
    expect(seloSemApi(false)).toBe('');
  });
});

describe('OS — tela', () => {
  it('aberta: cabeçalho com trilha até a Manutenção, checklist em painel, Concluir é o único dourado', () => {
    const m = miolo(C['os-limpeza']());
    expect(m).toContain('cc-crumb');
    expect(m).toContain('href="/dashboard/manutencao"');
    expect(m).toContain('<h1>OS — Limpeza</h1>');
    expect(m).toContain('cc-panel');
    expect(ouros(m)).toBe(1);
    expect(m).toMatch(/<button form="osForm" formaction="\/dashboard\/os\/[^"]+\/concluir" class="cc-btn cc-btn-gold/);
  });

  it('progresso numa barra e itens com toque grande (cc-os-item)', () => {
    const m = miolo(C['os-limpeza']());
    expect(m).toContain('role="progressbar"');
    expect(m).toContain('3/5');
    expect((m.match(/class="cc-os-item/g) ?? []).length).toBe(5);
  });

  it('upload de foto no padrão cc-, com o botão da câmera', () => {
    const m = miolo(C['os-limpeza']());
    expect(m).toMatch(/<form method="post" action="\/dashboard\/os\/[^"]+\/foto" enctype="multipart\/form-data" class="cc-form cc-os-up"/);
    expect(m).toContain("setAttribute('capture','environment')");
    expect(m).toContain('https://exemplo.invalid/2.jpg&quot;onerror=&quot;x');
  });

  it('dado escapado; sem usina/cliente → "—"', () => {
    const r = miolo(C['os-revisao-inversor']());
    expect(r).not.toContain('<script>alert(1)</script>');
    const t = miolo(C['os-tenant']());
    expect(t).toContain('— · —');
  });

  it('concluída: travada, sem Salvar/Concluir, laudo vira a ação dourada', () => {
    const m = miolo(C['os-concluida']());
    expect(m).toContain('OS concluída');
    expect(m).not.toContain('Concluir OS');
    expect(ouros(m)).toBe(1);
    expect(m).toMatch(/<a class="cc-btn cc-btn-gold" href="\/dashboard\/os\/[^"]+\/laudo" target="_blank"/);
  });

  it('tenant: casca escura e nada da EcoSun', () => {
    const t = C['os-tenant']();
    expect(t).toContain('<div class="cc-shell cc-escuro">');
    expect(t).not.toContain('EcoSunPower');
  });
});

describe('Manutenção + OS — sem Tailwind', () => {
  it('manutencao-views.ts sem Tailwind (fora o selo do pós-venda, marcado); OS sem Tailwind; nenhuma tela carrega o CDN', () => {
    const dir = join(process.cwd(), 'src', 'modules', 'dashboard');
    expect(linhasComTailwind(readFileSync(join(dir, 'manutencao-views.ts'), 'utf-8'))).toEqual([]);
    expect(linhasComTailwind(corpoDaFuncao(readFileSync(join(dir, 'os-views.ts'), 'utf-8'), 'renderOSPage'))).toEqual([]);
    expect(linhasComTailwind(corpoDaFuncao(readFileSync(join(dir, 'os-views.ts'), 'utf-8'), 'renderItem'))).toEqual([]);
    for (const f of Object.values(C)) expect(f()).not.toContain('cdn.tailwindcss.com');
  });
});

describe('código morto (B6): o renderManutencaoPage antigo de views.ts sumiu', () => {
  it('views.ts não tem mais renderManutencaoPage', () => {
    const v = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', 'views.ts'), 'utf-8');
    expect(v).not.toMatch(/function renderManutencaoPage/);
  });
});
