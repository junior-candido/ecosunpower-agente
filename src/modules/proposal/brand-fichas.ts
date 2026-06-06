// src/modules/proposal/brand-fichas.ts
// Ficha descritiva de cada marca de módulo/inversor que a EcoSunPower usa.
// Puxada automaticamente na proposta (cards de equipamento + comparação) pra o
// cliente decidir com base real. Junior pode sobrescrever o `resumo` por proposta.
// REVISAR: anos/Tier 1 são rascunho — confirmar com Junior.

export interface MarcaFicha {
  marca: string;
  tipo: 'modulo' | 'inversor';
  desdeBR: number;      // ano aproximado de entrada no mercado brasileiro
  tecnologia: string;
  tier1: boolean;       // módulo: lista Tier 1 BNEF; inversor: premium global
  garantia: string;     // resumo curto das garantias
  resumo: string;       // parágrafo cliente-facing juntando tudo
}

const FICHAS: MarcaFicha[] = [
  // ---- Módulos ----
  { marca: 'Trina', tipo: 'modulo', desdeBR: 2010, tecnologia: 'N-Type i-TOPCon bifacial',
    tier1: true, garantia: '25 anos de performance',
    resumo: 'Trina Solar — Top 3 mundial, no Brasil desde 2010. Painel N-Type i-TOPCon bifacial (Vertex), eficiência até 23,2% e 25 anos de garantia de performance. Marca Tier 1 consolidada com suporte nacional.' },
  { marca: 'JA Solar', tipo: 'modulo', desdeBR: 2012, tecnologia: 'N-Type TOPCon Half-Cell',
    tier1: true, garantia: '25 anos de performance',
    resumo: 'JA Solar — reconhecida mundialmente por confiabilidade, no Brasil desde 2012. Painel N-Type TOPCon Half-Cell (DeepBlue 4.0), eficiência até 22,5%. Marca Tier 1.' },
  { marca: 'LONGi', tipo: 'modulo', desdeBR: 2015, tecnologia: 'N-Type TOPCon bifacial',
    tier1: true, garantia: '25 anos de performance',
    resumo: 'LONGi — líder mundial em eficiência e volume, no Brasil desde 2015. Painel N-Type TOPCon bifacial, ótima geração mesmo em dias nublados. Marca Tier 1.' },
  { marca: 'Jinko', tipo: 'modulo', desdeBR: 2011, tecnologia: 'N-Type TOPCon (Tiger Neo) + Anti-PID',
    tier1: true, garantia: '12 anos produto / 30 anos performance',
    resumo: 'Jinko Solar — Top 3 global, no Brasil desde 2011. Painel N-Type TOPCon (Tiger Neo) com a maior eficiência da nossa lista (até 23,66%) e 30 anos de garantia de performance. Ideal pra cliente exigente. Tier 1.' },
  { marca: 'DAH', tipo: 'modulo', desdeBR: 2018, tecnologia: 'N-Type',
    tier1: true, garantia: '25 anos de performance',
    resumo: 'DAH Solar — premium emergente, no Brasil desde ~2018. Tecnologia N-Type, ótima pra cliente que quer diferenciação. Tier 1.' },
  { marca: 'Risen', tipo: 'modulo', desdeBR: 2013, tecnologia: 'N-Type alta performance',
    tier1: true, garantia: '25 anos de performance',
    resumo: 'Risen Energy — alta performance e excelente custo-benefício premium, no Brasil desde ~2013. Tier 1.' },
  { marca: 'Canadian', tipo: 'modulo', desdeBR: 2010, tecnologia: 'TOPCon',
    tier1: true, garantia: '25 anos de performance',
    resumo: 'Canadian Solar — muito forte no Brasil desde 2010, suporte robusto. Tier 1.' },
  // ---- Inversores ----
  { marca: 'Sungrow', tipo: 'inversor', desdeBR: 2013, tecnologia: 'Inversor string, eficiência >99%',
    tier1: true, garantia: '10 anos',
    resumo: 'Sungrow — top global em inversores, no Brasil desde 2013, eficiência acima de 99%. Excelente pra residencial e comercial. Garantia 10 anos.' },
  { marca: 'Solis', tipo: 'inversor', desdeBR: 2014, tecnologia: 'Inversor string',
    tier1: true, garantia: '10 anos',
    resumo: 'Solis (Ginlong) — muito forte no Brasil (top ranking) desde ~2014, ótimo custo-benefício premium. Garantia 10 anos.' },
  { marca: 'Deye', tipo: 'inversor', desdeBR: 2019, tecnologia: 'Inversor híbrido',
    tier1: true, garantia: '10 anos',
    resumo: 'Deye — referência em híbrido (com bateria), crescendo muito no Brasil desde ~2019. Garantia 10 anos.' },
  { marca: 'FoxESS', tipo: 'inversor', desdeBR: 2019, tecnologia: 'Inversor híbrido',
    tier1: true, garantia: '10 anos',
    resumo: 'FoxESS — híbrido custo-benefício premium intermediário, no Brasil desde ~2019. Garantia 10 anos.' },
  { marca: 'SolarEdge', tipo: 'inversor', desdeBR: 2017, tecnologia: 'Otimizadores por módulo + inversor central',
    tier1: true, garantia: '12 anos (inversor, extensível sob demanda) / 25 anos (otimizadores)',
    resumo: 'SolarEdge — premium israelense, no Brasil desde ~2017. Otimizadores por painel com monitoramento individual, máxima eficiência em telhado com sombra. Garantia inversor 12 anos (extensível sob demanda), otimizadores 25 anos.' },
  { marca: 'Huawei', tipo: 'inversor', desdeBR: 2014, tecnologia: 'Inversor string / híbrido',
    tier1: true, garantia: '10 anos',
    resumo: 'Huawei — o mais forte em híbrido + bateria no Brasil, desde ~2014. Garantia 10 anos.' },
  { marca: 'GoodWe', tipo: 'inversor', desdeBR: 2012, tecnologia: 'Inversor string / híbrido',
    tier1: true, garantia: '10 anos',
    resumo: 'GoodWe — Top 3 ranking BR, no Brasil desde ~2012. Garantia 10 anos.' },
  { marca: 'Hoymiles', tipo: 'inversor', desdeBR: 2018, tecnologia: 'Microinversor (monitoramento por painel)',
    tier1: true, garantia: '12 anos',
    resumo: 'Hoymiles — Top 2 microinversor no Brasil desde ~2018, monitoramento individual por painel (app S-Miles), ideal pra telhado com sombras pontuais. Garantia 12 anos.' },
  { marca: 'NEP', tipo: 'inversor', desdeBR: 2017, tecnologia: 'Microinversor',
    tier1: true, garantia: '12 anos',
    resumo: 'NEP (Northern Electric Power) — microinversor confiável e robusto, ótimo custo-benefício, boa rede de suporte BR. Garantia 12 anos.' },
  { marca: 'SolaX', tipo: 'inversor', desdeBR: 2018, tecnologia: 'Microinversor / híbrido (qualidade europeia)',
    tier1: true, garantia: '10-15 anos conforme linha',
    resumo: 'SolaX — premium intermediário europeu. Microinversores X1-IES com 15 anos de garantia (top do segmento) e linha híbrida com armazenamento. Garantia 10-15 anos conforme a linha.' },
];

// Normaliza e casa por prefixo de palavra (case-insensitive, sem acento).
// Ex: "JA Solar JAM66" casa "JA Solar"; "trina" casa "Trina".
export function getBrandFicha(fabricante: string, tipo: 'modulo' | 'inversor'): MarcaFicha | null {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const alvo = norm(fabricante ?? '');
  if (!alvo) return null;
  // Casa quando: nome exato; OU o fabricante COMEÇA com a marca ("JA Solar JAM66" -> "JA Solar");
  // OU o fabricante é um prefixo de PALAVRA INTEIRA da marca ("JA" -> "JA Solar", mas NÃO "Sol" -> "Solis").
  const achada = FICHAS
    .filter(f => f.tipo === tipo)
    .find(f => {
      const m = norm(f.marca);
      if (alvo === m || alvo.startsWith(m)) return true;
      // prefixo de palavra inteira: o caractere seguinte na marca deve ser espaço ou fim
      if (m.startsWith(alvo)) {
        const next = m[alvo.length];
        return next === undefined || next === ' ';
      }
      return false;
    });
  return achada ?? null;
}

export { FICHAS as BRAND_FICHAS };
