// Renovação do miolo — R14: Serviços de campo, painel interno (lista, novo,
// detalhe, lixeira). CONTRATO gravado da tela antiga
// (tests/fixtures/contrato-servicos.json): /servicos/novo, buscar-cliente,
// buscar-usina, nova, uploads, confirmar-midias, concluir, link-campo,
// reabrir, excluir (confirm) e restaurar. A página pública do link mágico
// não faz parte (não muda).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { contratoDaTela, aplicarMudancas } from './helpers/contrato-tela.js';
import { CASOS_SERVICOS } from './fixtures/casos-servicos.js';
// Troca comum das telas renovadas: sai o Tailwind do CDN (telas leves, #328).
import { TELAS_LEVES, menuTenantSemAssinaturas } from './fixtures/mudancas-telas-leves.js';
import { MUDANCAS_R14 } from './fixtures/mudancas-onda3.js';

const CONTRATO = JSON.parse(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'contrato-servicos.json'), 'utf-8'));

describe('Serviços de campo — contrato das telas do painel não muda', () => {
  for (const [nome, render] of Object.entries(CASOS_SERVICOS)) {
    it(`contrato: ${nome}`, () => {
      const h = render();
      expect(contratoDaTela(h)).toEqual(aplicarMudancas(CONTRATO[nome], ...menuTenantSemAssinaturas(h), TELAS_LEVES, ...(MUDANCAS_R14[nome] ?? [])));
    });
  }
});
