// src/modules/concessionarias.ts

export interface Concessionaria {
  id: string;
  nome: string;
  uf: string | null;
}

export const CONCESSIONARIAS_BR: Concessionaria[] = [
  { id: 'neoenergia-df', nome: 'Neoenergia Brasília', uf: 'DF' },
  { id: 'equatorial-go', nome: 'Equatorial Goiás', uf: 'GO' },
  { id: 'cemig', nome: 'CEMIG', uf: 'MG' },
  { id: 'cpfl-paulista', nome: 'CPFL Paulista', uf: 'SP' },
  { id: 'enel-sp', nome: 'Enel São Paulo', uf: 'SP' },
  { id: 'enel-rj', nome: 'Enel Rio de Janeiro', uf: 'RJ' },
  { id: 'enel-ce', nome: 'Enel Ceará', uf: 'CE' },
  { id: 'light', nome: 'Light', uf: 'RJ' },
  { id: 'coelba', nome: 'Coelba (Neoenergia BA)', uf: 'BA' },
  { id: 'celpe', nome: 'Celpe (Neoenergia PE)', uf: 'PE' },
  { id: 'cosern', nome: 'Cosern (Neoenergia RN)', uf: 'RN' },
  { id: 'copel', nome: 'Copel', uf: 'PR' },
  { id: 'celesc', nome: 'Celesc', uf: 'SC' },
  { id: 'rge', nome: 'RGE Sul', uf: 'RS' },
  { id: 'ceee', nome: 'CEEE Equatorial', uf: 'RS' },
  { id: 'energisa-mt', nome: 'Energisa MT', uf: 'MT' },
  { id: 'energisa-ms', nome: 'Energisa MS', uf: 'MS' },
  { id: 'energisa-to', nome: 'Energisa Tocantins', uf: 'TO' },
  { id: 'energisa-pb', nome: 'Energisa Paraíba', uf: 'PB' },
  { id: 'energisa-se', nome: 'Energisa Sergipe', uf: 'SE' },
  { id: 'energisa-mg', nome: 'Energisa Minas Gerais', uf: 'MG' },
  { id: 'amazonas-energia', nome: 'Amazonas Energia', uf: 'AM' },
  { id: 'cea-equatorial', nome: 'CEA Equatorial', uf: 'AP' },
  { id: 'equatorial-ma', nome: 'Equatorial Maranhão', uf: 'MA' },
  { id: 'equatorial-pa', nome: 'Equatorial Pará', uf: 'PA' },
  { id: 'equatorial-pi', nome: 'Equatorial Piauí', uf: 'PI' },
  { id: 'roraima-energia', nome: 'Roraima Energia', uf: 'RR' },
  { id: 'eletroacre', nome: 'Energisa Acre', uf: 'AC' },
  { id: 'energisa-ro', nome: 'Energisa Rondônia', uf: 'RO' },
  { id: 'outra', nome: 'Outra (custom)', uf: null },
];

export function getConcessionariaById(id: string): Concessionaria | null {
  return CONCESSIONARIAS_BR.find(c => c.id === id) ?? null;
}

export function getConcessionariasByUF(uf: string): Concessionaria[] {
  return CONCESSIONARIAS_BR.filter(c => c.uf === uf);
}
