// src/modules/eva-modo.ts
// Modo da instância, lido de EVA_MODO no boot (sync, antes da config do banco).
// Default = solar (EcoSunPower), comportamento intocado. 'vitrine_ecosof' troca o
// prompt + a pasta de conhecimento (a Eva vira vendedora do EcoSof). Centralizado
// aqui pra ser testável e ter uma fonte única de verdade.
export function isVitrineEcosof(): boolean {
  return process.env.EVA_MODO === 'vitrine_ecosof';
}

export function promptFileDoModo(): string {
  return isVitrineEcosof() ? 'system-prompt-vitrine.md' : 'system-prompt.md';
}

export function conhecimentoDirDoModo(): string {
  return isVitrineEcosof() ? 'conhecimento-ecosof' : 'conhecimento';
}
