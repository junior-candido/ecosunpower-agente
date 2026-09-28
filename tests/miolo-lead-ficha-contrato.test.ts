// Renovação do miolo — R3: ficha do lead. CONTRATO gravado da tela antiga
// (tests/fixtures/contrato-ficha-lead.json): os 14+ formulários POST, campos,
// os ids do script e os confirm() — nada disso pode mudar.
//
// 28/09 — a ficha virou a tela de ATENDIMENTO (3 colunas). Os formulários POST,
// os campos e os confirm() continuam IGUAIS. O que mudou de propósito (decisão
// do Junior) está escrito, item por item, em fixtures/mudancas-atendimento.ts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { contratoDaTela, aplicarMudancas } from './helpers/contrato-tela.js';
import { CASOS_FICHA } from './fixtures/casos-ficha-lead.js';
import { MENU_CONVERSAS, SAI_COPILOTO, SAI_COCKPIT_COMPLETO, ENTRA_LISTA, ENTRA_ALCAS, entraScript } from './fixtures/mudancas-atendimento.js';
// perf/telas-leves (28/09): sem Tailwind do CDN, CSS comum por arquivo.
import { TELAS_LEVES } from './fixtures/mudancas-telas-leves.js';

const CONTRATO = JSON.parse(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'contrato-ficha-lead.json'), 'utf-8'));

describe('Ficha do lead → Atendimento — contrato só muda no que o Junior mandou', () => {
  for (const [nome, render] of Object.entries(CASOS_FICHA)) {
    it(`contrato: ${nome}`, () => {
      const esperado = aplicarMudancas(CONTRATO[nome],
        MENU_CONVERSAS, SAI_COPILOTO, SAI_COCKPIT_COMPLETO, ENTRA_LISTA, ENTRA_ALCAS, entraScript(nome !== 'venda'), TELAS_LEVES);
      expect(contratoDaTela(render())).toEqual(esperado);
    });
  }

  it('TODOS os formulários POST da ficha antiga continuam na tela nova (mesma action e campos)', () => {
    for (const [nome, render] of Object.entries(CASOS_FICHA)) {
      const novos = contratoDaTela(render()).formularios.map((f) => JSON.stringify(f));
      for (const f of CONTRATO[nome].formularios) expect(novos, `${nome}: ${f.action}`).toContain(JSON.stringify(f));
    }
  });
});
