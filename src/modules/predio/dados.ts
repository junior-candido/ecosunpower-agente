// src/modules/predio/dados.ts
// F1 do PRÉDIO VIVO (spec 2026-07-28): montagem PURA dos dados do prédio —
// o multi-tenant como organismo. Sem rede/DB: recebe linhas prontas e devolve
// o prédio que a tela 3D desenha. Regras:
//  - EcoSun mora na COBERTURA (último andar); tenants por ordem de criação
//  - luz acesa = sinal de atividade (login/evento) nos últimos 10 min
//  - brilho decai linearmente até apagar em 60 min (organismo esfriando)
//  - capacete 👷 = manutenção 'pedido'/'fazendo' daquele apto
//  - manutenções com company_id null = do PRÉDIO (letreiro do térreo)

export const ECOSUN_ID = '00000000-0000-0000-0000-000000000001';

const LUZ_ACESA_MIN = 10;
const APAGA_TOTAL_MIN = 60;

export interface CompanyRow { id: string; nome: string; created_at: string }
export interface SinaisCompany {
  usinas: number;
  assentos: number;
  leads: number;
  ultimoLoginISO: string | null;
  ultimoEventoISO: string | null;
}
export interface ManutencaoRow {
  company_id: string | null;
  titulo: string;
  status: string;
}

export interface AtividadeApto {
  luzAcesa: boolean;
  brilho: number; // 0..1
  ultimoSinalISO: string | null;
}

export interface ApartamentoPredio {
  companyId: string;
  nome: string;
  ehEcosun: boolean;
  andar: number; // 0 = térreo+1 (primeiro apto); cobertura = último
  usinas: number;
  assentos: number;
  leads: number;
  atividade: AtividadeApto;
  manutencaoAtiva: boolean;
}

export interface PredioMontado {
  apartamentos: ApartamentoPredio[];
  manutencoesPredio: ManutencaoRow[];
}

function atividadeDe(sinais: SinaisCompany | undefined, agoraMs: number): AtividadeApto {
  const candidatos = [sinais?.ultimoLoginISO, sinais?.ultimoEventoISO]
    .filter((s): s is string => !!s)
    .map((s) => Date.parse(s))
    .filter((n) => Number.isFinite(n));
  if (!candidatos.length) return { luzAcesa: false, brilho: 0, ultimoSinalISO: null };
  const ultimo = Math.max(...candidatos);
  const minutos = Math.max(0, (agoraMs - ultimo) / 60_000);
  const brilho = minutos >= APAGA_TOTAL_MIN ? 0 : 1 - minutos / APAGA_TOTAL_MIN;
  return {
    luzAcesa: minutos <= LUZ_ACESA_MIN,
    brilho: Number(brilho.toFixed(3)),
    ultimoSinalISO: new Date(ultimo).toISOString(),
  };
}

export function montarPredio(input: {
  agoraISO: string;
  companies: CompanyRow[];
  porCompany: Record<string, SinaisCompany>;
  manutencoes: ManutencaoRow[];
}): PredioMontado {
  const agoraMs = Date.parse(input.agoraISO);
  const tenants = input.companies
    .filter((c) => c.id !== ECOSUN_ID)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const ecosun = input.companies.filter((c) => c.id === ECOSUN_ID);
  const ordenadas = [...tenants, ...ecosun]; // cobertura = última

  const manutencaoAtivaDe = (companyId: string): boolean =>
    input.manutencoes.some(
      (m) => m.company_id === companyId && (m.status === 'pedido' || m.status === 'fazendo'),
    );

  const apartamentos: ApartamentoPredio[] = ordenadas.map((c, i) => {
    const sinais = input.porCompany[c.id];
    return {
      companyId: c.id,
      nome: c.nome,
      ehEcosun: c.id === ECOSUN_ID,
      andar: i,
      usinas: sinais?.usinas ?? 0,
      assentos: sinais?.assentos ?? 0,
      leads: sinais?.leads ?? 0,
      atividade: atividadeDe(sinais, agoraMs),
      manutencaoAtiva: manutencaoAtivaDe(c.id),
    };
  });

  return {
    apartamentos,
    manutencoesPredio: input.manutencoes.filter((m) => m.company_id === null),
  };
}
