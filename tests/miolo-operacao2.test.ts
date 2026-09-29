// Renovação do miolo — R22: Pós-venda e Medição no padrão cc- (visual, marca,
// escape) + a trava de empresa do "Agora não" (dispensar sugestão).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CASOS_OPERACAO2 } from './fixtures/casos-operacao2.js';
import { linhasComTailwind } from './helpers/teto-tailwind.js';

const miolo = (h: string) => h.slice(h.indexOf('<main'), h.indexOf('</main>'));
const semScripts = (h: string) => h.replace(/<script\b[\s\S]*?<\/script>/gi, '');

describe('Operação II — padrão cc-', () => {
  for (const [nome, render] of Object.entries(CASOS_OPERACAO2)) {
    const h = render();
    it(`${nome}: sem Tailwind, tema escuro, CSS no <head>, sem <style> no corpo`, () => {
      expect(h).not.toContain('cdn.tailwindcss.com');
      expect(h).toContain('cc-escuro');
      expect(miolo(h)).toMatch(/class="cc-root cc-(pv|md)"/);
      expect(h.slice(h.indexOf('<body'))).not.toContain('<style>');
      expect(linhasComTailwind(semScripts(miolo(h)))).toEqual([]);
      expect(miolo(h)).not.toMatch(/style="[^"]*#(fff|0f172a|e2e8f0)/i);
    });
    it(`${nome}: dado de fora nunca vira HTML`, () => {
      const m = semScripts(miolo(h));
      expect(m).not.toContain('<script>x</script>');
      expect(m).not.toContain('<b>');
    });
  }
  it('o script do pós-venda só pinta com classes cc- (nada de Tailwind)', () => {
    const h = CASOS_OPERACAO2['pos-venda']();
    const scripts = (h.match(/<script>[\s\S]*?<\/script>/g) ?? []).join('\n');
    expect(scripts).toContain("status.className = 'pv-previa-status cc-pv-st cc-pv-ok'");
    expect(linhasComTailwind(scripts)).toEqual([]);
  });
});

describe('Pós-venda', () => {
  const m = miolo(CASOS_OPERACAO2['pos-venda']());
  it('KPIs com o que a tela já tem, semáforo em pílula, crítico pulsa', () => {
    expect(m).toContain('cc-kstrip');
    expect(m).toContain('Clientes com usina');
    expect(m).toContain('cc-s-crit');
    expect(m).toContain('pv-urgent');
    expect(m).toContain('Sem API · leitura manual');
  });
  it('agenda em painel com os grupos em pílula', () => {
    expect(m).toContain('pv-agenda');
    expect(m).toMatch(/Atrasados \(1\)/);
    expect(m).toContain('Bia &lt;b&gt;');
  });
  it('as classes-gancho do script continuam (pv-*)', () => {
    for (const c of ['pv-card', 'pv-tpl-btn', 'pv-previa', 'pv-chat', 'pv-chat-send-eva', 'pv-notas', 'pv-lembrete-form', 'pv-tarefa-ok', 'pv-tarefa-adiar']) expect(m).toContain(c);
  });
  it('vazio: estado vazio', () => {
    expect(miolo(CASOS_OPERACAO2['pos-venda-vazio']())).toContain('Nenhum cliente com usina ainda');
  });
  it('tenant: "assistente" no lugar da Eva (tela e script)', () => {
    const h = CASOS_OPERACAO2['pos-venda-tenant']();
    expect(miolo(h)).not.toMatch(/\bEva\b|EcoSun|Junior/);
    expect(h).toContain("confirm('Enviar esta mensagem pro cliente pela assistente?')");
  });
});

describe('Medição', () => {
  it('KPIs cc-, demanda em destaque, gráfico com classes (consumo/injeção) e faixas em chips', () => {
    const m = miolo(CASOS_OPERACAO2['medicao']());
    expect(m).toContain('cc-kpi cc-kpi-hl');
    expect(m).toContain('Demanda de 15 min');
    expect(m).toContain('cc-md-inj');
    expect(m).toContain('cc-chip cc-chip-on" href="?device=shelly-aaa&horas=24"');
    expect(m).toContain('Casa &lt;b&gt;Exemplo&lt;/b&gt;');
    expect(m).toContain('recebendo agora');
  });
  it('aparelho parado há mais de 10 min: pílula crítica', () => {
    const m = miolo(CASOS_OPERACAO2['medicao-um-aparelho']());
    expect(m).toContain('última há 42 min');
    expect(m).toContain('cc-s-crit');
    expect(m).not.toContain('name="device"'); // 1 aparelho: sem seletor (igual antes)
  });
  it('sem aparelho / sem leitura: estado vazio', () => {
    expect(miolo(CASOS_OPERACAO2['medicao-sem-aparelho']())).toContain('Nenhum medidor mandou leitura ainda.');
    expect(miolo(CASOS_OPERACAO2['medicao-sem-leitura']())).toContain('Ainda sem leitura suficiente');
  });
});

describe('/pos-venda/sugestao/dispensar — só lead da empresa da sessão (segurança)', () => {
  const fonte = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', 'router.ts'), 'utf-8');
  it('confere o lead na empresa ANTES de gravar a memória', () => {
    const i = fonte.indexOf("router.post('/pos-venda/sugestao/dispensar'");
    const trecho = fonte.slice(i, fonte.indexOf('\n  router.', i + 10));
    const confere = trecho.indexOf(".eq('company_id', req.dashUser!.companyId)");
    expect(confere).toBeGreaterThan(-1);
    expect(trecho.indexOf('upsertSugestaoMemoria')).toBeGreaterThan(confere);
    expect(trecho).toContain('status(404)');
  });
});

describe('R22 — revisão', () => {
  it('tenant: a prévia dos modelos (script) não diz "Eva da EcoSunPower"', () => {
    const h = CASOS_OPERACAO2['pos-venda-tenant']();
    expect(h).not.toContain('Eva da EcoSunPower');
    expect(h).toContain('a assistente da empresa');
    expect(CASOS_OPERACAO2['pos-venda']()).toContain('Eva da EcoSunPower'); // casa: igual antes
  });
  it('Medição: faixa de KPIs com o número certo de colunas (--n)', () => {
    const m = miolo(CASOS_OPERACAO2['medicao']());
    expect(m).toContain('class="cc-kstrip" style="--n:5"');
    expect(m).toContain('class="cc-kstrip" style="--n:4"');
    expect(miolo(CASOS_OPERACAO2['medicao-sem-aparelho']())).not.toContain('docs/kit-medicao');
  });
  it('/pos-venda/:leadId/acao grava → pede editar e id UUID', () => {
    const fonte = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', 'router.ts'), 'utf-8');
    const i = fonte.indexOf("router.post('/pos-venda/:leadId/acao'");
    expect(fonte.slice(i, i + 120)).toContain("exigir('usinas', 'editar')");
    expect(fonte.slice(i, i + 400)).toContain('UUID_RE.test(leadId)');
  });
});
