// Renovação do miolo — R16: Clientes (lista, ficha, novo) e relatório
// pós-instalação (novo + prévia). CONTRATO gravado da tela antiga
// (tests/fixtures/contrato-clientes.json): busca GET, novo, vincular-sistema,
// eva-action, :id/edit, arquivar/desarquivar (confirm), excluir (confirm),
// anexos (upload multipart / remover com confirm), fetch do ViaCEP, busca de
// cliente do seletor, relatório pós-instalação (form multipart + enviar).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { contratoDaTela, aplicarMudancas } from './helpers/contrato-tela.js';
import type { MudancaContrato } from './helpers/contrato-tela.js';
import { CASOS_CLIENTES } from './fixtures/casos-clientes.js';
// Troca comum das telas renovadas: sai o Tailwind do CDN (telas leves, #328).
import { TELAS_LEVES } from './fixtures/mudancas-telas-leves.js';
// Trocas deliberadas desta fatia (explicadas lá, seção R16).
import { R16_VINCULO_POR_DATASET, R16_ABAS_POR_ANCORA, R16_TRILHA_LISTA } from './fixtures/mudancas-onda3.js';

const CONTRATO = JSON.parse(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'contrato-clientes.json'), 'utf-8'));

const MUDANCAS: Record<string, MudancaContrato[]> = {
  'lista': [R16_VINCULO_POR_DATASET],
  'lista-tenant': [R16_VINCULO_POR_DATASET],
  'ficha': [R16_ABAS_POR_ANCORA],
  'ficha-arquivada-sem-dados': [R16_ABAS_POR_ANCORA],
  // a casa já tinha /dashboard/clientes no menu; o tenant ganha pela trilha
  'ficha-tenant': [R16_ABAS_POR_ANCORA, R16_TRILHA_LISTA],
};

describe('Clientes — contrato das 5 telas não muda', () => {
  for (const [nome, render] of Object.entries(CASOS_CLIENTES)) {
    it(`contrato: ${nome}`, () => {
      expect(contratoDaTela(render())).toEqual(aplicarMudancas(CONTRATO[nome], TELAS_LEVES, ...(MUDANCAS[nome] ?? [])));
    });
  }
});
