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
import { MENU_CONVERSAS, SAI_COPILOTO, SAI_COCKPIT_COMPLETO, ENTRA_LISTA, ENTRA_ALCAS, entraScript, SAI_RETOMAR_OPT_OUT, ENTRA_RESPONDER } from './fixtures/mudancas-atendimento.js';
import { renderLeadDetailPage } from '../src/modules/dashboard/leads-views.js';
import { USER_CASA, leadDetalhe, SERVICOS_LEAD, CONVERSA_COPILOTO } from './fixtures/miolo-leads.js';
// perf/telas-leves (28/09): sem Tailwind do CDN, CSS comum por arquivo.
import { TELAS_LEVES } from './fixtures/mudancas-telas-leves.js';

const CONTRATO = JSON.parse(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'contrato-ficha-lead.json'), 'utf-8'));

describe('Ficha do lead → Atendimento — contrato só muda no que o Junior mandou', () => {
  for (const [nome, render] of Object.entries(CASOS_FICHA)) {
    it(`contrato: ${nome}`, () => {
      const esperado = aplicarMudancas(CONTRATO[nome],
        MENU_CONVERSAS, SAI_COPILOTO, SAI_COCKPIT_COMPLETO, ENTRA_LISTA, ENTRA_ALCAS, entraScript(nome !== 'venda'), TELAS_LEVES,
        ...(nome === 'pausada' ? [SAI_RETOMAR_OPT_OUT] : []));
      expect(contratoDaTela(render())).toEqual(esperado);
    });
  }

  it('TODOS os formulários POST da ficha antiga continuam na tela nova (mesma action e campos)', () => {
    for (const [nome, render] of Object.entries(CASOS_FICHA)) {
      const novos = contratoDaTela(render()).formularios.map((f) => JSON.stringify(f));
      // Único form que sai de propósito: "Retomar" de quem pediu para parar (Parte 2, LGPD).
      const saiDeProposito = nome === 'pausada' ? (SAI_RETOMAR_OPT_OUT.sai!.formularios ?? []).map((f) => JSON.stringify(f)) : [];
      for (const f of CONTRATO[nome].formularios) {
        if (saiDeProposito.includes(JSON.stringify(f))) continue;
        expect(novos, `${nome}: ${f.action}`).toContain(JSON.stringify(f));
      }
    }
  });

  it('Parte 2: com o envio ligado (janela aberta) entram o campo de resposta, o modelo e o script — nada mais muda', () => {
    const agora = Date.now();
    const lead = leadDetalhe({ conversation_messages: [{ role: 'user', content: 'Oi!', timestamp: new Date(agora - 3600_000).toISOString() }] });
    const html = renderLeadDetailPage(lead, CONVERSA_COPILOTO, '', '', SERVICOS_LEAD, USER_CASA, {
      envio: { via: 'waba', canal: 'eva_oficial', chave: '8f3c2c55-1d2e-4c3b-9a55-0e2d7c1b9f00', agora,
        modelos: [{ nome: 'reativacao_lead_v1', rotulo: 'Retomar a conversa', categoria: 'desconhecida', texto: null, conferido: false }] },
    });
    const esperado = aplicarMudancas(CONTRATO.normal,
      MENU_CONVERSAS, SAI_COPILOTO, SAI_COCKPIT_COMPLETO, ENTRA_LISTA, ENTRA_ALCAS, entraScript(true), TELAS_LEVES, ENTRA_RESPONDER);
    expect(contratoDaTela(html)).toEqual(esperado);
  });
});
