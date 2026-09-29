// Renovação do miolo — R23: Prédio Vivo e Cérebro dentro da casca (modo
// imersivo). CONTRATO gravado da página solta antiga (contrato-imersivo.json):
// fetch('/dashboard/api/predio'), /cerebro/perguntar, /cerebro/custos(/fixo),
// ids do script (micBtn, voiceToggle, stageZone, cofre…). A troca deliberada
// (MUDANCAS_R23) é só o que a casca traz junto: menu, sair, CSS do painel.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { contratoDaTela, aplicarMudancas } from './helpers/contrato-tela.js';
import { menuTenantSemAssinaturas } from './fixtures/mudancas-telas-leves.js';
import { CASOS_IMERSIVO } from './fixtures/casos-imersivo.js';
import { MUDANCAS_R23 } from './fixtures/mudancas-onda4.js';

const CONTRATO = JSON.parse(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'contrato-imersivo.json'), 'utf-8'));

describe('Prédio Vivo e Cérebro — contrato não muda (só entra a casca)', () => {
  for (const [nome, render] of Object.entries(CASOS_IMERSIVO)) {
    it(`contrato: ${nome}`, () => {
      const h = render();
      // Cobrança recorrente (#339): Assinaturas some do menu do tenant.
      expect(contratoDaTela(h)).toEqual(aplicarMudancas(CONTRATO[nome], ...menuTenantSemAssinaturas(h), ...(MUDANCAS_R23[nome] ?? [])));
    });
  }
});
