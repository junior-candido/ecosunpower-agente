// Script ad-hoc pra renderizar uma proposta com dados mock realistas
// e salvar HTML local pra preview visual antes de commit.
//
// Uso: npx tsx scripts/preview-proposta.ts
// Saida: tmp/preview-proposta.html (abre automaticamente no browser padrao no Windows)

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { renderProposalHTML, type ProposalData } from '../src/modules/proposal/template.js';
import { calcular, type ProposalInput } from '../src/modules/proposal/calculator.js';

// Cliente fictício realista — residencial Brasília, Risen 715W HJT, Sungrow string
const data: ProposalData = {
  numeroProposta: '2026-PREV1',
  dataProposta: new Date().toLocaleDateString('pt-BR'),
  validadeDias: 5,

  nomeCliente: 'Marcos Henrique da Silva',
  documentoCliente: '111.222.333-44',
  enderecoCliente: 'Lago Sul, Brasília-DF',
  telefoneCliente: '(61) 99888-7766',
  emailCliente: 'marcos.silva@email.com',

  potenciaKwp: 8.58,        // 12 × 715 ÷ 1000
  fatorPerda: 0.80,
  tipoCliente: 'Residencial',
  modalidade: 'Autoconsumo local',
  concessionaria: 'Neoenergia DF',

  modulo: {
    fabricante: 'Risen Energy',  // testa anti-duplicata: NÃO deve sair "Risen Energy Risen 715W"
    modelo: 'Risen 715W',         // intencionalmente começa com "Risen" pra testar
    potenciaW: 715,
    quantidade: 12,
    garantiaDefeito: 12,
    garantiaEficiencia: 30,
    tecnologia: 'HJT',
  },
  inversor: {
    fabricante: 'Sungrow',
    modelo: 'SG8.0RS',
    potenciaW: 8000,
    quantidade: 1,
    garantia: 10,
    eficiencia: 0.985,
    tipoInversor: 'string',
  },
  estruturaFixacao: {
    tipo: 'Telha cerâmica',
    descricao: 'Estrutura de alumínio anodizado + parafusos inox 304',
  },

  valorTotalRs: 28500,
  formasPagamento: [
    {
      tipo: 'À Vista',
      titulo: 'PIX ou TED — desconto máximo',
      valorPrincipal: 'R$ 28.500',
      valorSecundario: 'pagamento único',
      recomendado: true,
      bullets: [
        'Sem juros, sem entrada',
        'Início imediato do projeto',
        'Maior economia no longo prazo',
      ],
    },
    {
      tipo: 'Cartão',
      titulo: 'Belenus em até 24×',
      valorPrincipal: 'R$ 1.265',
      valorSecundario: 'por mês · 24 parcelas',
      bullets: [
        'Aprovação imediata, sem análise de crédito',
        'Taxa muito menor que cartão comum (~0,42% a.m.)',
        'Acréscimo total ~R$ 4.000 sobre à vista',
      ],
    },
    {
      tipo: 'Financiamento',
      titulo: 'Solfácil até 90× com 120d carência',
      valorPrincipal: 'R$ 568',
      valorSecundario: 'por mês · começa em 4 meses',
      bullets: [
        'Sua geração já paga a parcela',
        'Aprovação biométrica em 30s',
        'Carência até 120 dias (1ª parcela só em ~4 meses)',
      ],
    },
  ],

  tipo: 'basica',

  empresa: {
    nome: 'EcoSunPower Energia Solar LTDA',
    cnpj: '33.020.459/0001-06',
    cidade: 'Brasília-DF',
    telefone: '(61) 99697-8781',
    site: 'ecosunpower.eng.br',
  },
};

// Mock financeiro realista
const calcInput: ProposalInput = {
  potenciaKwp: data.potenciaKwp,
  fatorPerda: data.fatorPerda,
  hsp: 5.2,
  consumoMensalKwh: 1000,
  tarifaRsKwh: 1.05,
  reajusteAnualEnergia: 0.10,
  tusdFioBRsKwh: 0.30,
  percentualFioBVigente: 0.60,
  percentualGeracaoInjetada: 0.70,
  custoIluminacaoPublica: 35,
  valorTotalRs: data.valorTotalRs,
  vidaUtilAnos: 25,
};

const calc = calcular(calcInput);
const html = renderProposalHTML(data, calc);

// Salva e abre
const outDir = join(process.cwd(), 'tmp');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'preview-proposta.html');
writeFileSync(outPath, html, 'utf-8');

console.log('\n📄 Proposta de preview gerada:');
console.log(`   ${outPath}\n`);
console.log('Geração mensal estimada:', Math.round(calc.geracaoMensalKwh), 'kWh');
console.log('Conta sem sistema:       R$', calc.contaSemSistemaMensal.toFixed(2));
console.log('Conta com sistema:       R$', calc.contaComSistemaMensal.toFixed(2));
console.log('Economia mensal:         R$', calc.economiaMensal.toFixed(2));
console.log('Payback:', calc.paybackInviavel ? 'inviável' : `${calc.paybackAnos}a ${calc.paybackMeses}m`);
console.log('TIR:                    ', calc.tirPercentual.toFixed(2) + '%');

// Abre no navegador padrão (Windows)
console.log('\n🌐 Abrindo no navegador...\n');
spawn('cmd', ['/c', 'start', '', outPath], { detached: true, stdio: 'ignore' }).unref();
