// tests/assistente-nao-fecha.test.ts
// TRAVA "QUEM FECHA SOU EU" (29/09/2026).
// Junior, 28/09: "ela precisa me trazer o cliente qualificado, vendedora
// persuasiva, mas quem fecha sou eu". A assistente (Eva na casa, Clara e as
// outras nos tenants) QUALIFICA, RESPONDE e PASSA. Fechar venda, cravar preço/
// condição e confirmar horário é do dono (admin da empresa).
// O prompt ainda tinha frases mandando o contrário ("único objetivo: agendar",
// "consigo te encaixar ainda hoje", "segurar um horário", "taxa SolFácil de
// hoje", "DECIDIR e FECHAR", "posso reservar essa condição"...). Uma regra de
// prompt NÃO segura o modelo se outra linha manda o oposto — por isso a trava:
// se uma dessas frases voltar em qualquer prompt ou arquivo de conhecimento,
// este teste quebra.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizarEmpresaRow, interpolarEmpresa, EMPRESA_DEFAULTS } from '../src/modules/empresa-config.js';
import { montarContextoConsultora } from '../src/modules/proposal-context.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

function mdFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...mdFiles(p));
    else if (e.endsWith('.md')) out.push(p);
  }
  return out;
}

// Prompts que falam com CLIENTE + toda a base de conhecimento (pode cair no
// contexto da conversa pelo RAG). Fica de fora só o modo /fechar (closing-system:
// é o admin preenchendo contrato de quem JÁ fechou com ele) e a vitrine do
// EcoSof (vende assinatura de software com link de pagamento — outro produto).
const FORA = new Set(['closing-system.md', 'system-prompt-vitrine.md']);
const arquivos = [
  ...readdirSync(join(raiz, 'src', 'prompts'))
    .filter((f) => f.endsWith('.md') && !FORA.has(f))
    .map((f) => join(raiz, 'src', 'prompts', f)),
  ...mdFiles(join(raiz, 'conhecimento')),
];

// Linhas que PROÍBEM a frase ("NUNCA diga ...") não contam.
const LINHA_DE_PROIBICAO = /\bnunca\b|proibid|n[ãa]o diga|jamais|❌|\berrado\b/i;

const PROIBIDAS: Array<[RegExp, string]> = [
  [/[úu]nico objetivo[^\n]*agendar/i, 'agendar não é o objetivo final — é trazer o cliente qualificado pro dono confirmar'],
  [/te encaixar/i, 'a assistente não tem agenda pra "encaixar" ninguém — quem confirma horário é o dono'],
  [/segurar (um|o|seu|o seu) hor[áa]rio/i, '"segurar horário" = prometer vaga que só o dono confirma'],
  [/taxa (da )?sol ?f[áa]cil de hoje/i, 'taxa de financiamento é condição comercial — quem passa é o dono'],
  [/decidir e fechar/i, 'a assistente ajuda a DECIDIR; quem FECHA é o dono'],
  [/reservar (essa|esta|a|sua) condi[çc][ãa]o/i, 'reservar condição = compromisso comercial que só o dono assume'],
  [/estima o kit/i, 'a assistente não estima kit/número pro cliente'],
  [/pivota pro fechamento/i, 'o passo é o pedido de visita/Meet, não o fechamento'],
  [/sem antes tentar fechar/i, 'a assistente não tenta fechar'],
  [/conduz(ir)? pra fechar neg[óo]cio/i, 'a assistente conduz até o próximo passo; quem fecha é o dono'],
  [/adiantar tudo[^\n]*c[áa]lculo/i, 'a assistente não passa cálculo/dimensionamento pro cliente'],
  [/posso (te )?agendar/i, 'a assistente não agenda — anota a preferência e o dono confirma'],
  [/quer que eu agende/i,'a assistente não agenda — anota a preferência e o dono confirma'],
  [/eva cria evento/i, 'evento no calendário só nasce depois do ✅ do dono'],
  [/taxa de fechamento/i, 'métrica de fechamento no prompt empurra a assistente a fechar'],
];

describe('"quem fecha sou eu" — a assistente qualifica e passa, não fecha', () => {
  it('achou prompts e conhecimento (guarda contra teste vazio)', () => {
    expect(arquivos.length).toBeGreaterThan(15);
  });

  for (const arq of arquivos) {
    const nome = relative(raiz, arq).replace(/\\/g, '/');
    it(`${nome} não manda a assistente fechar/cravar/confirmar sozinha`, () => {
      const linhas = readFileSync(arq, 'utf-8').split('\n');
      const ofensores: string[] = [];
      linhas.forEach((l, i) => {
        if (LINHA_DE_PROIBICAO.test(l)) return;
        for (const [re, motivo] of PROIBIDAS) {
          if (re.test(l)) ofensores.push(`${nome}:${i + 1} — ${motivo}\n    ${l.trim()}`);
        }
      });
      expect(ofensores, ofensores.join('\n')).toEqual([]);
    });
  }

  it('system-prompt diz com todas as letras que quem fecha é quem confirma (o dono)', () => {
    const sp = readFileSync(join(raiz, 'src', 'prompts', 'system-prompt.md'), 'utf-8');
    expect(sp).toMatch(/quem fecha [ée] \{\{rt_confirma\}\}/i);
  });

  it('postura de consultora (cliente com proposta) diz que quem fecha é o dono', () => {
    const cp = readFileSync(join(raiz, 'src', 'prompts', 'consultora-proposta.md'), 'utf-8');
    expect(cp).toMatch(/quem fecha [ée] \{\{rt_o\}\}/i);
  });

  it('manutenção proativa não promete "agendar visita" pela assistente', () => {
    const m = readFileSync(join(raiz, 'src', 'modules', 'maintenance.ts'), 'utf-8');
    expect(m).not.toMatch(/posso agendar uma visita|voce pode agendar uma visita|quer que eu agende/i);
  });
});

describe('postura de consultora sai com o nome de CADA empresa', () => {
  const postura = readFileSync(join(raiz, 'src', 'prompts', 'consultora-proposta.md'), 'utf-8');
  const conquista = normalizarEmpresaRow({
    company_id: 'c1a2b3c4-0000-0000-0000-00000000aaaa',
    nome_fantasia: 'Conquista Solar', nome_atendente: 'Clara',
    rt_nome: 'JIMENA SOUZA', rt_apelido: 'Jimena', rt_genero: 'f',
  });

  it('nenhum marcador {{...}} chega cru no contexto da conversa', () => {
    const t = montarContextoConsultora(postura, 'BLOCO', conquista);
    expect(t).not.toMatch(/\{\{/);
    expect(t).toContain('BLOCO');
  });

  it('tenant nunca vê "Eva" nem "Junior"; a casa vê o Junior', () => {
    const t = montarContextoConsultora(postura, '', conquista);
    expect(t).not.toMatch(/\bEva\b|Junior/);
    expect(t).toContain('Clara');
    expect(montarContextoConsultora(postura, '', EMPRESA_DEFAULTS)).toContain('o Junior');
  });

  it('interpolarEmpresa continua sendo a fonte (sanidade)', () => {
    expect(interpolarEmpresa('{{rt_o}}', EMPRESA_DEFAULTS)).toBe('o Junior');
  });
});
