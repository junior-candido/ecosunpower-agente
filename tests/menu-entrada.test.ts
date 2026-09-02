// tests/menu-entrada.test.ts
//
// MENU DE ENTRADA (02/09/2026). Junior, olhando a Clara errar o alvo:
// "esse número não é uma boa para a Clara, ela fica perdida" e
// "tinha que ser muito ninja para entender tudo isso".
//
// Ele está certo, e o diagnóstico é preciso: a triagem da Conquista lista
// SEIS tipos de pessoa chegando na mesma linha (migration 116). Hoje a
// assistente LÊ a mensagem e tenta deduzir qual é. Quando a pessoa escreve
// só "oi", não há o que deduzir — ela chuta, e chuta na frente do cliente.
//
// A virada é perguntar em vez de adivinhar: uma pergunta só, na primeira
// mensagem. O cliente declara o assunto e ela executa em vez de supor.
//
// Formato: por enquanto TEXTO numerado, que é o que a conexão não-oficial
// (Evolution) aceita — botão de verdade só existe na API Oficial da Meta
// (ver eva-admin-buttons.ts). O mesmo menu vira lista clicável no dia do
// upgrade, sem reescrever nada: só troca quem desenha.
import { describe, it, expect } from 'vitest';
import {
  montarMenuEntrada,
  lerEscolhaDoMenu,
  normalizarMenuEntrada,
  MENU_PADRAO,
  type OpcaoMenu,
} from '../src/modules/menu-entrada.js';
import { normalizarEmpresaRow } from '../src/modules/empresa-config.js';

const OPCOES_CONQUISTA: OpcaoMenu[] = [
  { chave: 'fotovoltaico', rotulo: 'Energia solar — quero baixar minha conta de luz' },
  { chave: 'aquecimento', rotulo: 'Aquecimento de água — banho ou piscina' },
  { chave: 'cliente', rotulo: 'Já sou cliente — dúvida ou manutenção' },
  { chave: 'financeiro', rotulo: 'Nota fiscal ou financeiro' },
];

// ---------------------------------------------------------------------
// 1. O texto do menu
// ---------------------------------------------------------------------
describe('montarMenuEntrada — a pergunta que evita o chute', () => {
  it('numera as opções de 1 em diante, na ordem recebida', () => {
    const txt = montarMenuEntrada('Clara', 'Conquista Solar', OPCOES_CONQUISTA);
    expect(txt).toMatch(/1[^\n]*Energia solar/);
    expect(txt).toMatch(/2[^\n]*Aquecimento de água/);
    expect(txt).toMatch(/3[^\n]*Já sou cliente/);
    expect(txt).toMatch(/4[^\n]*Nota fiscal/);
  });

  it('se apresenta com o nome da assistente e o da empresa', () => {
    const txt = montarMenuEntrada('Clara', 'Conquista Solar', OPCOES_CONQUISTA);
    expect(txt).toContain('Clara');
    expect(txt).toContain('Conquista Solar');
  });

  it('nunca cita outra empresa — nem a EcoSunPower, nem a Eva', () => {
    const txt = montarMenuEntrada('Clara', 'Conquista Solar', OPCOES_CONQUISTA);
    expect(txt).not.toMatch(/ecosun/i);
    expect(txt).not.toMatch(/\bEva\b/);
  });

  it('sem opção nenhuma, não monta menu (falha fechado)', () => {
    expect(montarMenuEntrada('Clara', 'Conquista Solar', [])).toBeNull();
  });

  it('a empresa pode ter as opções dela, não uma lista fixa no código', () => {
    const so2: OpcaoMenu[] = [
      { chave: 'orcamento', rotulo: 'Quero um orçamento' },
      { chave: 'suporte', rotulo: 'Preciso de suporte' },
    ];
    const txt = montarMenuEntrada('Ana', 'Tenant Novo', so2) ?? '';
    expect(txt).toMatch(/1[^\n]*Quero um orçamento/);
    expect(txt).toMatch(/2[^\n]*Preciso de suporte/);
    expect(txt).not.toMatch(/3/);
  });
});

// ---------------------------------------------------------------------
// 2. Ler a resposta do cliente
// ---------------------------------------------------------------------
describe('lerEscolhaDoMenu — entender o que a pessoa respondeu', () => {
  it('entende o número puro', () => {
    expect(lerEscolhaDoMenu('2', OPCOES_CONQUISTA)?.chave).toBe('aquecimento');
  });

  it('entende o número com sujeira em volta, como a pessoa digita', () => {
    for (const resposta of ['1', ' 1 ', '1)', '1.', 'opção 1', 'opcao 1', 'a 1', '*1*']) {
      expect(lerEscolhaDoMenu(resposta, OPCOES_CONQUISTA)?.chave, `resposta "${resposta}"`)
        .toBe('fotovoltaico');
    }
  });

  it('entende quando a pessoa escreve o assunto em vez do número', () => {
    expect(lerEscolhaDoMenu('energia solar', OPCOES_CONQUISTA)?.chave).toBe('fotovoltaico');
    expect(lerEscolhaDoMenu('AQUECIMENTO', OPCOES_CONQUISTA)?.chave).toBe('aquecimento');
    expect(lerEscolhaDoMenu('nota fiscal', OPCOES_CONQUISTA)?.chave).toBe('financeiro');
  });

  it('ignora acento e caixa', () => {
    expect(lerEscolhaDoMenu('ja sou cliente', OPCOES_CONQUISTA)?.chave).toBe('cliente');
    expect(lerEscolhaDoMenu('Já Sou Cliente', OPCOES_CONQUISTA)?.chave).toBe('cliente');
  });

  it('número fora da lista não escolhe nada', () => {
    expect(lerEscolhaDoMenu('9', OPCOES_CONQUISTA)).toBeNull();
    expect(lerEscolhaDoMenu('0', OPCOES_CONQUISTA)).toBeNull();
  });

  it('conversa normal não vira escolha por acidente', () => {
    // "quero 2 orçamentos" tem um 2, mas não é resposta de menu.
    expect(lerEscolhaDoMenu('quero 2 orçamentos por favor', OPCOES_CONQUISTA)).toBeNull();
    expect(lerEscolhaDoMenu('bom dia', OPCOES_CONQUISTA)).toBeNull();
    expect(lerEscolhaDoMenu('', OPCOES_CONQUISTA)).toBeNull();
  });

  it('quem já diz o assunto na primeira mensagem é entendido na hora', () => {
    // O cliente que chega dizendo o que quer não deve ver menu nenhum.
    expect(lerEscolhaDoMenu('oi, quero energia solar na minha casa', OPCOES_CONQUISTA)?.chave)
      .toBe('fotovoltaico');
  });
});

// ---------------------------------------------------------------------
// 3. O padrão de fábrica
// ---------------------------------------------------------------------
describe('MENU_PADRAO — o que um cliente novo recebe sem configurar nada', () => {
  it('tem as quatro portas e nenhuma marca escrita na unha', () => {
    expect(MENU_PADRAO).toHaveLength(4);
    for (const o of MENU_PADRAO) {
      expect(o.rotulo).not.toMatch(/ecosun|conquista|clara|eva/i);
    }
  });

  it('as chaves são estáveis — é por elas que a triagem decide', () => {
    expect(MENU_PADRAO.map((o) => o.chave))
      .toEqual(['fotovoltaico', 'aquecimento', 'cliente', 'financeiro']);
  });
});

// ---------------------------------------------------------------------
// 4. O jsonb do banco virando menu
// ---------------------------------------------------------------------
describe('normalizarMenuEntrada — o que vem do banco', () => {
  it('lê a lista gravada na coluna', () => {
    const m = normalizarMenuEntrada([
      { chave: 'fotovoltaico', rotulo: 'Energia solar' },
      { chave: 'aquecimento', rotulo: 'Aquecimento de água' },
    ]);
    expect(m.map((o) => o.chave)).toEqual(['fotovoltaico', 'aquecimento']);
  });

  it('empresa sem menu fica sem menu — null, lixo ou vazio dão lista vazia', () => {
    expect(normalizarMenuEntrada(null)).toEqual([]);
    expect(normalizarMenuEntrada(undefined)).toEqual([]);
    expect(normalizarMenuEntrada('não é lista')).toEqual([]);
    expect(normalizarMenuEntrada([])).toEqual([]);
  });

  it('opção sem chave ou sem rótulo é descartada, não quebra o resto', () => {
    const m = normalizarMenuEntrada([
      { chave: 'ok', rotulo: 'Serve' },
      { chave: '', rotulo: 'Sem chave' },
      { chave: 'sem-rotulo', rotulo: '' },
      'lixo',
      null,
    ]);
    expect(m).toHaveLength(1);
    expect(m[0].chave).toBe('ok');
  });

  it('tem teto — menu não vira lista telefônica', () => {
    const muitas = Array.from({ length: 30 }, (_, i) => ({ chave: `c${i}`, rotulo: `Opção ${i}` }));
    expect(normalizarMenuEntrada(muitas).length).toBeLessThanOrEqual(10);
  });
});

describe('a empresa carrega o menu dela', () => {
  it('a config lê a coluna menu_entrada', () => {
    const cfg = normalizarEmpresaRow({
      company_id: 'aaaa1111-2222-3333-4444-555566667777',
      nome_fantasia: 'Conquista Solar',
      menu_entrada: [{ chave: 'fotovoltaico', rotulo: 'Energia solar' }],
    });
    expect(cfg.menuEntrada).toHaveLength(1);
    expect(cfg.menuEntrada[0].chave).toBe('fotovoltaico');
  });

  it('empresa que não configurou menu fica com lista vazia', () => {
    const cfg = normalizarEmpresaRow({ nome_fantasia: 'EcoSunPower' });
    expect(cfg.menuEntrada).toEqual([]);
  });
});
