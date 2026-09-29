// Renovação do miolo — R9: Usina (detalhe, dados, editar, importar). CONTRATO
// gravado da tela antiga (tests/fixtures/contrato-usina.json): :id/sync,
// :id/backfill (com o confirm), abas Dia/Mês/Ano + setas, :id/editar (POST com
// todos os campos das 6 seções + busca de cliente), importar (todos os campos
// de todas as marcas + busca de empresas Deye), ids dos canvas do Chart.js.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { contratoDaTela, aplicarMudancas } from './helpers/contrato-tela.js';
import { CASOS_USINA, SISTEMA } from './fixtures/casos-usina.js';
// Troca comum das telas renovadas: sai o Tailwind do CDN (telas leves, #328).
import { TELAS_LEVES, menuTenantSemAssinaturas } from './fixtures/mudancas-telas-leves.js';
import type { MudancaContrato } from './helpers/contrato-tela.js';
import { TEMA_GRAFICOS, MINI_MAPA_DA_MAIN } from './fixtures/mudancas-onda2.js';

/** O plano (R9) pede o botão "Relatório" no cabeçalho do detalhe — a rota GET
 *  /monitoramento/:id/relatorio já existia (é o mesmo botão da frota). */
const RELATORIO_NO_DETALHE: MudancaContrato = {
  motivo: 'plano R9: cabeçalho da usina com Relatório / Atualizar',
  entra: { links: [`/dashboard/monitoramento/${SISTEMA.id}/relatorio`] },
};

const CONTRATO = JSON.parse(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'contrato-usina.json'), 'utf-8'));

describe('Usina — contrato das telas não muda', () => {
  for (const [nome, render] of Object.entries(CASOS_USINA)) {
    it(`contrato: ${nome}`, () => {
      const h = render();
      expect(contratoDaTela(h)).toEqual(aplicarMudancas(CONTRATO[nome], ...menuTenantSemAssinaturas(h), TELAS_LEVES, ...(nome.startsWith('detalhe') ? [RELATORIO_NO_DETALHE, TEMA_GRAFICOS, ...(nome === 'detalhe-mes' || nome === 'detalhe-tenant' ? [MINI_MAPA_DA_MAIN] : [])] : nome === 'dados' ? [TEMA_GRAFICOS] : [])));
    });
  }
});
