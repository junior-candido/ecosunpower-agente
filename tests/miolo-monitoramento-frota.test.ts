// Renovação do miolo — R8: Monitoramento (frota) no padrão cc- (tema escuro
// do Command Center — D4 decidida = escuro para todos). Contrato em
// miolo-monitoramento-frota-contrato.test.ts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { corpoDaFuncao, linhasComTailwind } from './helpers/teto-tailwind.js';
import { CASOS_FROTA } from './fixtures/casos-monitoramento.js';

const miolo = (h: string) => h.slice(h.indexOf('<main'), h.indexOf('</main>'));

describe('Monitoramento (frota) — tela nova', () => {
  const h = CASOS_FROTA.cheio();
  const m = miolo(h);

  it('cabeçalho Usinas › Monitoramento, sem emoji no título, Importar é o único dourado', () => {
    expect(m).toContain('cc-crumb');
    expect(m).toMatch(/<h1>Painel de Triagem — Usinas<\/h1>/);
    expect((m.match(/cc-btn-gold/g) ?? []).length).toBe(1);
    expect(m).toMatch(/cc-btn cc-btn-gold" href="\/dashboard\/monitoramento\/importar"/);
  });

  it('"Atualizar todas" é um formulário SEPARADO do filtro (antes ficava dentro dele e o botão enviava o filtro)', () => {
    const filtro = m.slice(m.indexOf('<form class="cc-form cc-mon-filtro"'));
    const fimFiltro = filtro.indexOf('</form>');
    expect(filtro.slice(0, fimFiltro)).not.toContain('sync-todos');
    expect(m).toContain('action="/dashboard/monitoramento/sync-todos"');
  });

  it('faixa de KPIs só com somas que a tela já faz (usinas, potência, hoje, mês, gerando, fora do normal)', () => {
    expect(m).toContain('cc-kstrip');
    for (const r of ['Usinas ativas', 'Potência instalada', 'Geração hoje', 'Geração no mês', 'Gerando OK', 'Fora do normal']) {
      expect(m).toContain(`<div class="cc-lbl">${r}</div>`);
    }
    // 12 ativas (1 pausada); 4 fora do normal (2 falha + 2 atenção)
    expect(m).toMatch(/Usinas ativas<\/div><div class="cc-val">12</);
    expect(m).toMatch(/Fora do normal<\/div><div class="cc-val">4</);
  });

  it('painéis cc- (órbita, alertas, Eva, operação, carteira)', () => {
    expect((m.match(/class="cc-panel/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(m).toContain('Alertas proativos');
    expect(m).toContain('Eva no mês');
  });

  it('status em pílula cc- com a mesma regra de hoje (Falha/Atenção/Acima/OK/Sem sinal/Pausada)', () => {
    const tabelaHtml = m.slice(m.indexOf('cc-tbl-wrap'));
    expect(tabelaHtml).toContain('cc-pill cc-s-crit');
    expect(tabelaHtml).toContain('>Falha<');
    expect(tabelaHtml).toContain('>Atenção<');
    expect(tabelaHtml).toContain('>Acima do esperado<');
    expect(tabelaHtml).toContain('>Gerando OK<');
    expect(tabelaHtml).toContain('>Sem sinal<');
    expect(tabelaHtml).toContain('>Pausada<');
  });

  it('tabela da carteira vira cartão no celular (data-label) e mantém o clique da linha', () => {
    expect(m).toContain('cc-tbl-wrap cc-tbl-cartoes');
    expect(m).toContain('data-label="Potência"');
    expect(m).toContain(`onclick="window.location='/dashboard/monitoramento/00000006-2222-4222-8222-222222222222'"`);
  });

  it('sem dado → "—" (potência nula, geração nula)', () => {
    const tbl = m.slice(m.indexOf('cc-mon-tbl'));
    const linhaCondo = tbl.slice(tbl.indexOf('Condomínio Teste'));
    expect(linhaCondo.slice(0, linhaCondo.indexOf('</tr>'))).toContain('data-label="Potência">—</td>');
    const tblSinal = tbl.slice(tbl.indexOf('Sítio Sem Sinal'));
    expect(tblSinal.slice(0, tblSinal.indexOf('</tr>'))).toContain('data-label="Hoje">—</td>');
  });

  it('chips de status com contagem, levando ao ?painel= de hoje', () => {
    expect(m).toContain('cc-chips');
    expect(m).toMatch(/cc-chip[^"]*" href="\/dashboard\/monitoramento\?painel=falha"[^>]*>Falha <b>2<\/b>/);
  });

  it('nome com <script> escapado', () => {
    expect(m).toContain('Casa Exemplo &lt;script&gt;');
    expect(m).not.toContain('<script>alert(1)</script>');
  });

  it('tema escuro do Command Center (casa)', () => {
    expect(h).toContain('<div class="cc-shell cc-escuro">');
  });

  it('sem Tailwind no miolo (teto) e sem o script do CDN', () => {
    expect(h).not.toContain('cdn.tailwindcss.com');
    const fonte = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', 'views.ts'), 'utf-8');
    expect(linhasComTailwind(corpoDaFuncao(fonte, 'renderMonitoramentoPage'))).toEqual([]);
  });

  it('vazio → estado vazio com "Importar agora"', () => {
    const v = miolo(CASOS_FROTA.vazio());
    expect(v).toContain('cc-empty');
    expect(v).toContain('Nenhum sistema cadastrado ainda.');
    expect(v).toContain('Importar agora');
  });

  it('tenant: tema escuro também (D4), nada da casa no miolo nem no rodapé', () => {
    const t = CASOS_FROTA.tenant();
    expect(t).toContain('<div class="cc-shell cc-escuro">');
    expect(t).not.toContain('EcoSunPower');
    expect(t).not.toContain('CNPJ 33.020');
    expect(t).not.toContain('Eva no mês');
    expect(t).not.toContain('lertas proativos');
    expect(t).toContain('Solar Aurora Teste');
  });
});
