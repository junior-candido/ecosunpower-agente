// Solar irradiation data from NASA POWER API
// and solar system calculations

interface CityCoordinates {
  lat: number;
  lng: number;
  name: string;
}

// Main cities in Brasilia/Goias region
const CITY_COORDS: Record<string, CityCoordinates> = {
  'brasilia': { lat: -15.78, lng: -47.93, name: 'Brasilia-DF' },
  'taguatinga': { lat: -15.84, lng: -48.05, name: 'Taguatinga-DF' },
  'ceilandia': { lat: -15.82, lng: -48.11, name: 'Ceilandia-DF' },
  'samambaia': { lat: -15.88, lng: -48.09, name: 'Samambaia-DF' },
  'gama': { lat: -15.96, lng: -48.06, name: 'Gama-DF' },
  'planaltina': { lat: -15.45, lng: -47.61, name: 'Planaltina-DF' },
  'sobradinho': { lat: -15.65, lng: -47.79, name: 'Sobradinho-DF' },
  'aguas claras': { lat: -15.84, lng: -48.02, name: 'Aguas Claras-DF' },
  'guara': { lat: -15.83, lng: -47.98, name: 'Guara-DF' },
  'lago sul': { lat: -15.84, lng: -47.87, name: 'Lago Sul-DF' },
  'lago norte': { lat: -15.73, lng: -47.86, name: 'Lago Norte-DF' },
  'asa sul': { lat: -15.81, lng: -47.91, name: 'Asa Sul-DF' },
  'asa norte': { lat: -15.76, lng: -47.88, name: 'Asa Norte-DF' },
  'vicente pires': { lat: -15.80, lng: -48.03, name: 'Vicente Pires-DF' },
  'goiania': { lat: -16.68, lng: -49.25, name: 'Goiania-GO' },
  'aparecida de goiania': { lat: -16.82, lng: -49.24, name: 'Aparecida de Goiania-GO' },
  'anapolis': { lat: -16.33, lng: -48.95, name: 'Anapolis-GO' },
  'rio verde': { lat: -17.80, lng: -50.92, name: 'Rio Verde-GO' },
  'luziania': { lat: -16.25, lng: -47.95, name: 'Luziania-GO' },
  'valparaiso': { lat: -16.07, lng: -47.98, name: 'Valparaiso de Goias-GO' },
  'novo gama': { lat: -16.06, lng: -48.04, name: 'Novo Gama-GO' },
  'formosa': { lat: -15.54, lng: -47.33, name: 'Formosa-GO' },
  'itumbiara': { lat: -18.42, lng: -49.22, name: 'Itumbiara-GO' },
  'catalao': { lat: -18.17, lng: -47.94, name: 'Catalao-GO' },
  'jatai': { lat: -17.88, lng: -51.72, name: 'Jatai-GO' },
  'caldas novas': { lat: -17.74, lng: -48.63, name: 'Caldas Novas-GO' },
  'trindade': { lat: -16.65, lng: -49.49, name: 'Trindade-GO' },
  'senador canedo': { lat: -16.70, lng: -49.09, name: 'Senador Canedo-GO' },
  'goianesia': { lat: -15.31, lng: -49.12, name: 'Goianesia-GO' },
  'cristalina': { lat: -16.77, lng: -47.61, name: 'Cristalina-GO' },
  'mineiros': { lat: -17.57, lng: -52.55, name: 'Mineiros-GO' },
  'uruacu': { lat: -14.52, lng: -49.14, name: 'Uruacu-GO' },
  'porangatu': { lat: -13.44, lng: -49.15, name: 'Porangatu-GO' },
  'padre bernardo': { lat: -15.16, lng: -48.28, name: 'Padre Bernardo-GO' },
  'aguas lindas': { lat: -15.77, lng: -48.28, name: 'Aguas Lindas de Goias-GO' },
  'cidade ocidental': { lat: -16.08, lng: -47.93, name: 'Cidade Ocidental-GO' },
};

// Cache for NASA POWER API responses
const irradiationCache: Map<string, { value: number; timestamp: number }> = new Map();
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

function findCity(cityName: string): CityCoordinates | null {
  const normalized = cityName.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[-_]/g, ' ')
    .trim();

  // Direct match
  if (CITY_COORDS[normalized]) return CITY_COORDS[normalized];

  // Partial match
  for (const [key, coords] of Object.entries(CITY_COORDS)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return coords;
    }
  }

  return null;
}

async function getIrradiationFromNASA(lat: number, lng: number): Promise<number> {
  const cacheKey = `${lat},${lng}`;
  const cached = irradiationCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.value;
  }

  try {
    const url = `https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=ALLSKY_SFC_SW_DWN&community=RE&longitude=${lng}&latitude=${lat}&start=2022&end=2022&format=JSON`;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`NASA API error: ${response.status}`);

    const data = await response.json() as {
      properties: {
        parameter: {
          ALLSKY_SFC_SW_DWN: Record<string, number>;
        };
      };
    };

    const monthlyValues = data.properties.parameter.ALLSKY_SFC_SW_DWN;
    const values = Object.values(monthlyValues).filter(v => v > 0);
    const annualAvg = values.reduce((sum, v) => sum + v, 0) / values.length;

    irradiationCache.set(cacheKey, { value: annualAvg, timestamp: Date.now() });

    return annualAvg;
  } catch (error) {
    console.error('[solar] NASA API error, using default:', error);
    // Fallback: average for Brasilia/Goias region
    return 5.3;
  }
}

export interface SolarEstimate {
  cityName: string;
  irradiation: number; // kWh/m2/dia
  consumptionKwh: number;
  panelCount: number;
  systemPowerKwp: number;
  monthlyEconomyBrl: number;
  annualEconomyBrl: number;
  paybackYears: string;
  economy25Years: number;
  generationKwhMonth: number;
  panelWatts: number;
  irradiationSource: string;
}

export async function calculateSolarEstimate(
  cityName: string,
  monthlyBill?: number,
  consumptionKwh?: number
): Promise<SolarEstimate | null> {
  // Need at least one: bill or consumption
  if (!monthlyBill && !consumptionKwh) return null;

  // Estimate consumption from bill if not provided
  // Average tariff in Brasilia/Goias: ~R$ 0.85/kWh (with taxes)
  const avgTariff = 0.85;
  const consumption = consumptionKwh ?? Math.round((monthlyBill! - 50) / avgTariff); // subtract minimum charge
  const bill = monthlyBill ?? Math.round(consumption * avgTariff + 50);

  // Find city coordinates
  const city = findCity(cityName);
  let irradiation: number;
  let source: string;

  if (city) {
    irradiation = await getIrradiationFromNASA(city.lat, city.lng);
    source = `NASA POWER para ${city.name}`;
  } else {
    irradiation = 5.3; // Default for region
    source = 'media regional Brasilia/Goias';
  }

  // Calculations
  const panelWatts = 670; // Average panel wattage (mix of our brands)
  const panelKwp = panelWatts / 1000;
  const performanceRatio = 0.82; // System losses (inverter, cables, temperature, dust)

  // Monthly generation per panel = panel_kwp * irradiation * 30 * performance_ratio
  const generationPerPanel = panelKwp * irradiation * 30 * performanceRatio;
  const panelCount = Math.ceil(consumption / generationPerPanel);
  const systemPowerKwp = Math.round(panelCount * panelKwp * 100) / 100;
  const totalGeneration = Math.round(panelCount * generationPerPanel);

  // Economy (93% of bill - minimum charge stays)
  const monthlyEconomy = Math.round(bill * 0.93);
  const annualEconomy = monthlyEconomy * 12;
  const economy25Years = annualEconomy * 25;

  // Payback (rough estimate based on R$/Wp installed cost)
  const costPerWp = 4.5; // R$/Wp average installed cost
  const totalCost = systemPowerKwp * 1000 * costPerWp;
  const paybackMonths = Math.round(totalCost / monthlyEconomy);
  const paybackYears = paybackMonths < 36 ? '2 a 3' :
                       paybackMonths < 48 ? '3 a 4' :
                       paybackMonths < 60 ? '4 a 5' : '5 a 6';

  return {
    cityName: city?.name ?? cityName,
    irradiation: Math.round(irradiation * 100) / 100,
    consumptionKwh: consumption,
    panelCount,
    systemPowerKwp,
    monthlyEconomyBrl: monthlyEconomy,
    annualEconomyBrl: annualEconomy,
    paybackYears,
    economy25Years,
    generationKwhMonth: totalGeneration,
    panelWatts,
    irradiationSource: source,
  };
}

export function formatEstimateForPrompt(estimate: SolarEstimate): string {
  return `
## Calculo Solar para ${estimate.cityName}
- Irradiacao solar: ${estimate.irradiation} kWh/m2/dia (fonte: ${estimate.irradiationSource})
- Consumo estimado: ${estimate.consumptionKwh} kWh/mes
- Paineis necessarios: ${estimate.panelCount} paineis de ~${estimate.panelWatts}W
- Potencia do sistema: ${estimate.systemPowerKwp} kWp
- Geracao estimada: ${estimate.generationKwhMonth} kWh/mes
- Economia mensal: R$ ${estimate.monthlyEconomyBrl}
- Economia anual: R$ ${estimate.annualEconomyBrl}
- Payback estimado: ${estimate.paybackYears} anos
- Economia em 25 anos: R$ ${estimate.economy25Years.toLocaleString('pt-BR')}
USE estes dados para responder ao cliente de forma empolgante e natural!
`;
}
