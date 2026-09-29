// Renovação do miolo — R21: Comercial II (Contratos & Procurações, Fechou!,
// formulário do contrato do lead + documento travado, Recados, Comparador de
// Lojas e "O que a assistente sabe"). CONTRATO gravado da tela antiga
// (tests/fixtures/contrato-comercial2.json): todos os forms (ler-documentos
// multipart, enviar-doc com o confirm, salvar-drive, contrato-form com os
// formaction de IA/parcelas/congelar, vincular proposta), os ids do script
// (campo-*, btn-preview, form-contrato, preview-doc) e o data-usar/data-valor.
// A TRAVA DE SAÍDA do contrato (PR #317) é do servidor e não muda aqui.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { contratoDaTela, aplicarMudancas } from './helpers/contrato-tela.js';
import { menuTenantSemAssinaturas } from './fixtures/mudancas-telas-leves.js';
import { CASOS_COMERCIAL2 } from './fixtures/casos-comercial2.js';
import { MUDANCAS_R21, r5Menu } from './fixtures/mudancas-onda4.js';
// Troca comum das telas renovadas: sai o Tailwind do CDN (telas leves, #328).
import { TELAS_LEVES } from './fixtures/mudancas-telas-leves.js';

const CONTRATO = JSON.parse(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'contrato-comercial2.json'), 'utf-8'));

describe('Comercial II — contrato das telas não muda', () => {
  for (const [nome, render] of Object.entries(CASOS_COMERCIAL2)) {
    it(`contrato: ${nome}`, () => {
      const h = render();
      // Cobrança recorrente (#339): Assinaturas some do menu do tenant.
      expect(contratoDaTela(h)).toEqual(aplicarMudancas(CONTRATO[nome], ...menuTenantSemAssinaturas(h), ...r5Menu(CONTRATO[nome]), TELAS_LEVES, ...(MUDANCAS_R21[nome] ?? [])));
    });
  }
});
