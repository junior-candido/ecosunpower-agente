interface EnergyData {
  group?: string;
  subgroup?: string;
  contracted_demand_kw?: number;
  consumption_kwh?: number;
  tariff_type?: string;
  monthly_bill?: number;
}

interface Opportunities {
  solar?: boolean;
  battery?: boolean;
  bess?: boolean;
  free_market?: boolean;
  diesel_replacement?: boolean;
  ev_charging?: boolean;
}

interface DossierInput {
  leadNumber: number;
  name: string;
  phone: string;
  city: string;
  profile: string;
  origin: string;
  energyData: EnergyData;
  opportunities: Opportunities;
  futureDemand?: string;
  conversationSummary: string[];
  recommendation: string;
}

export class DossierBuilder {
  static format(input: DossierInput): string {
    const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const profile = input.profile.toUpperCase();
    const check = (val?: boolean) => val ? '[x]' : '[ ]';

    const lines = [
      `DOSSIE - Lead #${input.leadNumber}`,
      `Data: ${now}`,
      '========================================',
      `Nome: ${input.name}`,
      `Telefone: ${input.phone}`,
      `Cidade: ${input.city}`,
      `Perfil: ${profile}`,
      `Origem: ${input.origin}`,
      '',
      'DADOS ENERGETICOS',
    ];

    if (input.energyData.group) {
      lines.push(`- Classificacao: Grupo ${input.energyData.group}${input.energyData.subgroup ? ` (${input.energyData.subgroup})` : ''}`);
    }
    if (input.energyData.contracted_demand_kw) {
      lines.push(`- Demanda contratada: ${input.energyData.contracted_demand_kw} kW`);
    }
    if (input.energyData.consumption_kwh) {
      lines.push(`- Consumo medio: ${input.energyData.consumption_kwh} kWh/mes`);
    }
    if (input.energyData.tariff_type) {
      lines.push(`- Tarifa: ${input.energyData.tariff_type}`);
    }
    if (input.energyData.monthly_bill) {
      lines.push(`- Valor medio da fatura: R$ ${input.energyData.monthly_bill}/mes`);
    }

    lines.push(
      '',
      'OPORTUNIDADES IDENTIFICADAS',
      `- ${check(input.opportunities.solar)} Sistema fotovoltaico`,
      `- ${check(input.opportunities.free_market)} Migracao para mercado livre`,
      `- ${check(input.opportunities.bess)} BESS (armazenamento comercial)`,
      `- ${check(input.opportunities.battery)} Bateria residencial`,
      `- ${check(input.opportunities.diesel_replacement)} Substituicao de gerador diesel`,
      `- ${check(input.opportunities.ev_charging)} Preparacao para carro eletrico`,
    );

    lines.push(
      '',
      'DEMANDA FUTURA',
      `- ${input.futureDemand ?? 'Nao informada'}`,
    );

    lines.push(
      '',
      'RESUMO DA CONVERSA',
      ...input.conversationSummary.map(s => `- ${s}`),
    );

    lines.push(
      '',
      'RECOMENDACAO DO AGENTE',
      `- ${input.recommendation}`,
      '========================================',
    );

    return lines.join('\n');
  }
}
