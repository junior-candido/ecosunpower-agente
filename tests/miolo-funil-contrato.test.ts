// Renovação do miolo — R4: Funil (Kanban). CONTRATO gravado da tela antiga
// (tests/fixtures/contrato-funil.json): fetch do set-etapa, data-lead-id /
// data-etapa, seletores do Sortable (.kanban-list, draggable '.kanban-card')
// e o CDN pinado do Sortable — nada disso pode mudar.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { contratoDaTela, aplicarMudancas } from './helpers/contrato-tela.js';
// 28/09 (Atendimento): item "Conversas" novo no menu e no atalho de visão — única mudança.
import { MENU_CONVERSAS } from './fixtures/mudancas-atendimento.js';
import { CASOS_FUNIL } from './fixtures/casos-funil.js';

const CONTRATO = JSON.parse(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'contrato-funil.json'), 'utf-8'));

describe('Funil (Kanban) — contrato da tela não muda', () => {
  for (const [nome, render] of Object.entries(CASOS_FUNIL)) {
    it(`contrato: ${nome}`, () => {
      expect(contratoDaTela(render())).toEqual(aplicarMudancas(CONTRATO[nome], MENU_CONVERSAS));
    });
  }
});
