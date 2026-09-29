// Renovação do miolo — R12: Pasta do Cliente (3 telas). CONTRATO gravado da
// tela antiga (tests/fixtures/contrato-pastas.json): criar pasta, dados,
// capa, arquivos (multipart), arquivos/remover (confirm), puxar-servicos,
// puxar-rpi, declaracao, publicar, enviar (confirm) e excluir (confirm).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { contratoDaTela, aplicarMudancas } from './helpers/contrato-tela.js';
// R5 (Onda 4): o Cockpit saiu do menu — sai o link /dashboard/cockpit das telas da casa.
import { r5Menu } from './fixtures/mudancas-onda4.js';
import { CASOS_PASTAS } from './fixtures/casos-pastas.js';
// Troca comum das telas renovadas: sai o Tailwind do CDN (telas leves, #328).
import { TELAS_LEVES, menuTenantSemAssinaturas } from './fixtures/mudancas-telas-leves.js';
import type { MudancaContrato } from './helpers/contrato-tela.js';

/** CONSERTO (R12): o confirm do "Excluir pasta inteira" tinha QUEBRAS DE LINHA
 *  de verdade dentro da string JS ('…?⏎⏎Todos…') — o navegador não compila o
 *  onsubmit e a pasta era excluída SEM perguntar. Agora vai com 
 (o mesmo
 *  texto, em duas linhas na caixinha). O resto do contrato é igual. */
const confirmExcluir = (nome: string, velho: boolean) =>
  `'EXCLUIR a pasta inteira de ${nome}?${velho ? ' ' : '\\n\\n'}Todos os arquivos enviados somem e o link do cliente PARA DE FUNCIONAR. Não tem volta.'`;
const EXCLUIR_COM_CONFIRM: Record<string, MudancaContrato> = Object.fromEntries(
  [['editor-rascunho', 'Ana DÁvila <b>x</b>'], ['editor-publicada', 'Ana Exemplo'], ['editor-tenant', 'Ana Exemplo']]
    .map(([caso, nome]) => [caso, {
      motivo: 'conserto: confirm do Excluir pasta não compilava (quebra de linha crua)',
      sai: { confirms: [confirmExcluir(nome, true)] },
      entra: { confirms: [confirmExcluir(nome, false)] },
    }]),
);

const CONTRATO = JSON.parse(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'contrato-pastas.json'), 'utf-8'));

describe('Pasta do Cliente — contrato das 3 telas não muda', () => {
  for (const [nome, render] of Object.entries(CASOS_PASTAS)) {
    it(`contrato: ${nome}`, () => {
      const h = render();
      expect(contratoDaTela(h)).toEqual(aplicarMudancas(CONTRATO[nome], ...r5Menu(CONTRATO[nome]), ...menuTenantSemAssinaturas(h), TELAS_LEVES, ...(EXCLUIR_COM_CONFIRM[nome] ? [EXCLUIR_COM_CONFIRM[nome]] : [])));
    });
  }
});
