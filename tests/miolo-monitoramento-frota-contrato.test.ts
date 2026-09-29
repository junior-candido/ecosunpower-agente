// Renovação do miolo — R8: Monitoramento (frota). CONTRATO gravado da tela
// antiga (tests/fixtures/contrato-monitoramento-frota.json): filtro GET com
// q/marca/cidade/status/ord, Importar, sync-todos, :id/sync, :id/excluir com
// os DOIS confirm(), links ?painel= e o link do relatório — nada disso muda.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { contratoDaTela, aplicarMudancas } from './helpers/contrato-tela.js';
// R5 (Onda 4): o Cockpit saiu do menu — sai o link /dashboard/cockpit das telas da casa.
import { r5Menu } from './fixtures/mudancas-onda4.js';
// Única troca: tela renovada sai do Tailwind do CDN (a mesma das telas leves, #328).
import { TELAS_LEVES, menuTenantSemAssinaturas } from './fixtures/mudancas-telas-leves.js';
import { CASOS_FROTA } from './fixtures/casos-monitoramento.js';

const CONTRATO = JSON.parse(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'contrato-monitoramento-frota.json'), 'utf-8'));

describe('Monitoramento (frota) — contrato da tela não muda', () => {
  for (const [nome, render] of Object.entries(CASOS_FROTA)) {
    it(`contrato: ${nome}`, () => {
      const h = render();
      expect(contratoDaTela(h)).toEqual(aplicarMudancas(CONTRATO[nome], ...r5Menu(CONTRATO[nome]), ...menuTenantSemAssinaturas(h), TELAS_LEVES));
    });
  }
});
