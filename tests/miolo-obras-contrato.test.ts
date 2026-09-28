// Renovação do miolo — R15: Quadro de Obras + Vincular usinas. CONTRATO gravado
// da tela antiga (tests/fixtures/contrato-obras.json): fetch do set-etapa-obra,
// do set-etapa-obra-lote e do /contato; data-usina-id / data-etapa / data-ordem;
// seletores do Sortable (.kanban-list, draggable '.kanban-card', filter); ids do
// painel de contato (contato-titulo…) e da seleção em lote (lote-bar…); o CDN
// pinado do Sortable; o formulário POST /dashboard/usinas/vincular.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { contratoDaTela, aplicarMudancas } from './helpers/contrato-tela.js';
// Trocas deliberadas da R15 (inclui TELAS_LEVES) — seção R15 de mudancas-onda3.ts.
import { MUDANCAS_R15 } from './fixtures/mudancas-onda3.js';
import { CASOS_OBRAS } from './fixtures/casos-obras.js';

const CONTRATO = JSON.parse(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'contrato-obras.json'), 'utf-8'));

describe('Quadro de Obras + Vincular — contrato da tela não muda', () => {
  for (const [nome, render] of Object.entries(CASOS_OBRAS)) {
    it(`contrato: ${nome}`, () => {
      expect(contratoDaTela(render())).toEqual(aplicarMudancas(CONTRATO[nome], ...(MUDANCAS_R15[nome] ?? [])));
    });
  }
});
