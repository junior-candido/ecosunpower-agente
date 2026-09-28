// Renovação do miolo — R2: Leads (lista).
// 1) CONTRATO (gravado da tela antiga em tests/fixtures/contrato-leads-lista.json):
//    tem que continuar igual depois da reforma.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { renderLeadsListPage } from '../src/modules/dashboard/leads-views.js';
import { contratoDaTela, aplicarMudancas } from './helpers/contrato-tela.js';
// 28/09 (Atendimento): item "Conversas" novo no menu e no atalho de visão — única mudança.
import { MENU_CONVERSAS } from './fixtures/mudancas-atendimento.js';
import {
  USER_CASA, LINHAS_LEADS, FILTROS_CHEIOS, FILTROS_ALERTAS, FILTROS_ATENCAO,
} from './fixtures/miolo-leads.js';

const CONTRATO = JSON.parse(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'contrato-leads-lista.json'), 'utf-8'));

const CASOS = {
  cheio: () => renderLeadsListPage(LINHAS_LEADS, FILTROS_CHEIOS, USER_CASA),
  alertas: () => renderLeadsListPage(LINHAS_LEADS, FILTROS_ALERTAS, USER_CASA),
  atencao: () => renderLeadsListPage(LINHAS_LEADS, FILTROS_ATENCAO, USER_CASA),
  vazio: () => renderLeadsListPage([], { total: 0 }, USER_CASA),
};

describe('Leads (lista) — contrato da tela não muda', () => {
  for (const [nome, render] of Object.entries(CASOS)) {
    it(`contrato: ${nome}`, () => {
      expect(contratoDaTela(render())).toEqual(aplicarMudancas(CONTRATO[nome], MENU_CONVERSAS));
    });
  }
});

