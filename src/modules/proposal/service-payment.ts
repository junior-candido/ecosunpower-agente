// src/modules/proposal/service-payment.ts
// Formas de pagamento da proposta SÓ-SERVIÇO (sem solar). Diferente do solar:
//  - cartão até 12x na maquininha PRÓPRIA do Junior (taxa repassada ao cliente);
//  - PIX à vista e PIX 50/50 (sem juros);
//  - SEM financiamento bancário (esse é exclusivo do solar, via distribuidor).

const PIX_CNPJ = '33.020.459/0001-06';

// Taxa da maquininha por nº de parcelas (%). Repassada ao cliente:
// valor cobrado = valor líquido ÷ (1 − taxa). Confirmado pelo Junior na maquininha
// real (R$ 1.000 em 3x = R$ 380,91). NÃO alterar sem reconferir na maquininha.
export const JUROS_CARTAO_SERVICO: Record<number, number> = {
  1: 5.99, 2: 11.39, 3: 12.49, 4: 13.09, 5: 13.79, 6: 14.49,
  7: 15.49, 8: 16.09, 9: 16.69, 10: 17.39, 11: 18.39, 12: 18.79,
};

const fmtRs = (n: number) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Valor TOTAL cobrado do cliente no cartão (taxa repassada): valor ÷ (1 − taxa).
export function totalCartaoComTaxa(valorLiquido: number, parcelas: number): number {
  const taxa = JUROS_CARTAO_SERVICO[parcelas];
  if (!taxa) throw new Error(`Parcela inválida pra cartão de serviço: ${parcelas}`);
  return (Number(valorLiquido) || 0) / (1 - taxa / 100);
}

// Valor de CADA parcela no cartão.
export function valorParcelaCartao(valorLiquido: number, parcelas: number): number {
  return totalCartaoComTaxa(valorLiquido, parcelas) / parcelas;
}

// Monta as 3 formas de pagamento da proposta de serviço. Mesmo shape do solar
// (tipo/titulo/valorPrincipal/valorSecundario/recomendado?/bullets) + meioPagamento
// pra o template escolher o logo (PIX nas duas primeiras, bandeiras no cartão).
export function servicePaymentOptions(totalRs: number): Array<{
  tipo: string; titulo: string; valorPrincipal: string; valorSecundario: string;
  recomendado?: boolean; bullets: string[]; meioPagamento?: 'pix' | 'cartao';
}> {
  const total = Number(totalRs) || 0;
  const metade = total / 2;
  // Arredonda a parcela exibida ANTES de multiplicar, pra o total bater quando o
  // cliente multiplicar (parcela × 12). A maquininha acerta os centavos finais.
  const parcela12 = Math.round(valorParcelaCartao(total, 12) * 100) / 100;
  const total12 = parcela12 * 12;

  // Todas as parcelas, pro cliente ver com transparência.
  const tabelaParcelas = Object.keys(JUROS_CARTAO_SERVICO)
    .map(Number)
    .sort((a, b) => a - b)
    .map(n => `${n}x de R$ ${fmtRs(valorParcelaCartao(total, n))}`);

  return [
    {
      tipo: 'À Vista',
      titulo: 'PIX',
      valorPrincipal: `R$ ${fmtRs(total)}`,
      valorSecundario: 'pagamento único · sem juros',
      recomendado: true,
      bullets: [`PIX CNPJ ${PIX_CNPJ}`, 'EcoSunPower Energia Solar', 'Sem juros · início imediato'],
      meioPagamento: 'pix',
    },
    {
      tipo: 'Parcelado',
      titulo: '50% + 50%',
      valorPrincipal: `2x R$ ${fmtRs(metade)}`,
      valorSecundario: 'sem juros',
      bullets: [
        `R$ ${fmtRs(metade)} no início (PIX)`,
        `R$ ${fmtRs(metade)} no término (PIX)`,
        `PIX CNPJ ${PIX_CNPJ}`,
      ],
      meioPagamento: 'pix',
    },
    {
      tipo: 'Cartão',
      titulo: 'Em até 12x',
      valorPrincipal: `12x de R$ ${fmtRs(parcela12)}`,
      valorSecundario: `total R$ ${fmtRs(total12)} no cartão`,
      bullets: tabelaParcelas,
      meioPagamento: 'cartao',
    },
  ];
}
