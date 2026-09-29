// Troca suave (28/09): o script pede SÓ o miolo (chat + resumo) com o
// cabeçalho X-Atendimento-Miolo. Contrato:
//  - NENHUMA rota nova: é a mesma /leads/:id (atrás do portão da empresa, da
//    trava de vendedor e do claim) e a mesma /leads/conversas?contato= (só o
//    dono do número pessoal) — o cabeçalho só tira a LISTA (e o menu) da resposta;
//  - o miolo não guarda cache (no-store + Vary) e não traz script nem menu.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { renderAtendimentoPage, pedeSoMiolo, CABECALHO_MIOLO, LISTA_VAZIA, SCRIPT_TROCA } from '../src/modules/dashboard/atendimento-views.js';
import { renderLeadDetailPage } from '../src/modules/dashboard/leads-views.js';
import { USER_CASA, USER_TENANT, leadDetalhe, SERVICOS_LEAD } from './fixtures/miolo-leads.js';
import { listaConversas } from './fixtures/telas-renovadas.js';

const fonte = readFileSync(join(process.cwd(), 'src', 'modules', 'dashboard', 'router.ts'), 'utf-8');

describe('pedeSoMiolo', () => {
  it('só com o cabeçalho X-Atendimento-Miolo: 1', () => {
    expect(CABECALHO_MIOLO).toBe('X-Atendimento-Miolo');
    expect(pedeSoMiolo((n) => (n === CABECALHO_MIOLO ? '1' : undefined))).toBe(true);
    expect(pedeSoMiolo(() => undefined)).toBe(false);
    expect(pedeSoMiolo(() => 'sim')).toBe(false);
  });
});

describe('miolo da tela (o que a troca suave recebe)', () => {
  const lead = leadDetalhe();
  const miolo = renderLeadDetailPage(lead, [], '', '', SERVICOS_LEAD, USER_CASA, { lista: listaConversas(5), filtros: {}, soMiolo: true });
  const pagina = renderLeadDetailPage(lead, [], '', '', SERVICOS_LEAD, USER_CASA, { lista: listaConversas(5), filtros: {} });

  it('traz título, chat, resumo e janelinhas — sem lista, sem menu, sem script', () => {
    expect(miolo).toMatch(/<title>Conversa: [^<]+<\/title>/);
    expect(miolo).toContain('class="cc-at-col cc-at-chat"');
    expect(miolo).toContain('class="cc-at-col cc-at-cockpit"');
    expect(miolo).toContain('id="modal-fechou"');
    expect(miolo).toContain('cc-at-com-lead');
    expect(miolo).not.toContain('cc-at-lista');
    expect(miolo).not.toContain('cc-at-item');
    expect(miolo).not.toContain('<script');
    expect(miolo).not.toContain('Command Center');
    expect(miolo.length).toBeLessThan(pagina.length / 2);
  });

  it('chat e resumo do miolo são OS MESMOS da página inteira', () => {
    const col = (h: string, cls: string) => { const i = h.indexOf(`<section class="cc-at-col ${cls}"`) >= 0 ? h.indexOf(`<section class="cc-at-col ${cls}"`) : h.indexOf(`<aside class="cc-at-col ${cls}"`); return h.slice(i, h.indexOf(cls === 'cc-at-chat' ? '</section>\n' : '</aside>', i)); };
    const semChave = (s: string) => s.replace(/name="chave" value="[^"]*"/g, '');
    expect(semChave(col(miolo, 'cc-at-cockpit'))).toBe(semChave(col(pagina, 'cc-at-cockpit')));
  });

  it('tenant: a assistente continua "Assistente" no miolo (nada da casa)', () => {
    const m = renderAtendimentoPage({ user: USER_TENANT, lista: LISTA_VAZIA, filtros: {}, lead: leadDetalhe({ company_id: USER_TENANT.companyId }), soMiolo: true });
    expect(m).toMatch(/Assistente (ativa|pausada)/);
    expect(m).not.toMatch(/Eva (ativa|pausada)/);
  });

  it('sem lead (voltar para a lista pelo histórico): chat "escolha uma conversa", sem cc-at-com-lead', () => {
    const m = renderAtendimentoPage({ user: USER_CASA, lista: LISTA_VAZIA, filtros: {}, lead: null, soMiolo: true });
    expect(m).toContain('Escolha uma conversa');
    expect(m).not.toContain('cc-at-com-lead');
  });
});

describe('rotas: o miolo passa pelas MESMAS travas', () => {
  it('nenhuma rota nova de miolo; o cabeçalho é lido dentro de /leads/conversas e /leads/:id', () => {
    expect(fonte).not.toMatch(/router\.(get|post)\(\s*'[^']*miolo/i);
    const conversas = fonte.slice(fonte.indexOf("router.get('/leads/conversas', exigir('leads', 'visualizar')"), fonte.indexOf("router.get('/leads/:id', exigir('leads', 'visualizar')"));
    expect(conversas).toContain('pedeSoMiolo(');
    const lead = fonte.slice(fonte.indexOf("router.get('/leads/:id', exigir('leads', 'visualizar')"));
    const trecho = lead.slice(0, lead.indexOf('res.send(renderLeadDetailPage('));
    expect(trecho).toContain('pedeSoMiolo(');
    // as travas continuam no caminho do miolo (antes de responder)
    expect(trecho).toContain('leadDaSessao(lead, viewer)');
    expect(trecho).toContain('podeVerLead(viewer, lead)');
    // e o portão de empresa vale para /leads/:id (registrado antes)
    expect(fonte.indexOf("router.use('/leads/:id', criarTravaLeadDaEmpresa(")).toBeLessThan(fonte.indexOf("router.get('/leads/:id', exigir('leads', 'visualizar')"));
  });

  it('o miolo não fica em cache (no-store + Vary pelo cabeçalho)', () => {
    expect(fonte.match(/if \(soMiolo\) res\.set\('Cache-Control', 'no-store'\)\.vary\(CABECALHO_MIOLO\);/g)).toHaveLength(2);
  });

  it('o script só troca para rotas do Atendimento, da mesma origem, e manda o cabeçalho', () => {
    expect(SCRIPT_TROCA).toContain("'X-Atendimento-Miolo':'1'");
    expect(SCRIPT_TROCA).toContain('u.origin!==location.origin');
    expect(SCRIPT_TROCA).toContain("credentials:'same-origin'");
    // nada de executar HTML recebido: DOMParser não roda script; nenhum eval/innerHTML do miolo
    expect(SCRIPT_TROCA).not.toMatch(/eval\(|new Function|\.innerHTML\s*=/);
  });
});
