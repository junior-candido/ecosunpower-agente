// Renovação do miolo — R4: Funil (Kanban), tela nova no padrão cc-.
// (Contrato em miolo-funil-contrato.test.ts.) D7 ainda não decidida → só
// rolagem no celular, sem "Mover para…" (nenhuma URL nova).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ORDEM_ETAPAS } from '../src/modules/dashboard/pipeline.js';
import { linhasComTailwind } from './helpers/teto-tailwind.js';
import { CASOS_FUNIL } from './fixtures/casos-funil.js';

const miolo = (h: string) => h.slice(h.indexOf('<main'), h.indexOf('</main>'));

describe('Funil (Kanban) — tela nova', () => {
  const h = miolo(CASOS_FUNIL.cheio());

  it('cabeçalho Comercial › Funil com chips Lista/Kanban', () => {
    expect(h).toContain('cc-crumb');
    expect(h).toMatch(/<a class="cc-chip" href="\/dashboard\/leads">Lista<\/a>/);
    expect(h).toMatch(/cc-chip cc-chip-on" href="\/dashboard\/leads\/kanban"/);
  });

  it('uma coluna por etapa do pipeline.ts, na ordem, com contagem', () => {
    const ordem = [...h.matchAll(/class="cc-kb-lista kanban-list" data-etapa="([a-z_]+)"/g)].map((m) => m[1]);
    expect(ordem).toEqual(ORDEM_ETAPAS);
    expect(h).toMatch(/<h3>Novo<\/h3><span class="cc-kb-n">2<\/span>/);
    expect(h).toMatch(/<h3>Qualificado<\/h3><span class="cc-kb-n">0<\/span>/);
  });

  it('coluna vazia com aviso curto', () => {
    expect(h).toContain('cc-kb-vazio');
  });

  it('cartão: classe-gancho, data-lead-id, nome escapado, link da ficha, SLA na borda e "há X"', () => {
    expect(h).toMatch(/class="cc-kb-card cc-kb-crit kanban-card sla-urgent" data-lead-id="n2"/);
    expect(h).toContain('Bruno &lt;script&gt;');
    expect(h).not.toContain('<script>x</script>');
    expect(h).toContain('href="/dashboard/leads/n1" draggable="false"');
    expect(h).toMatch(/cc-kb-card-d">\d+h</);
    expect(h).toContain('vencida');
  });

  it('script do Sortable igual (mesma URL, mesmo draggable, mesmo CDN)', () => {
    expect(h).toContain("draggable: '.kanban-card'");
    expect(h).toContain("group: 'funil'");
    expect(h).toContain('sortablejs@1.15.6');
  });

  it('sem "Mover para…" (D7 pendente) e nenhuma URL nova', () => {
    expect(h).not.toContain('Mover para');
    expect((h.match(/fetch\(/g) ?? []).length).toBe(1);
  });

  it('board no padrão cc-kb e sem Tailwind', () => {
    expect(h).toContain('class="cc-kb kanban-board"');
    const fonte = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', 'kanban-views.ts'), 'utf-8');
    expect(linhasComTailwind(fonte)).toEqual([]);
  });
});
