// Campos da usina que o fluxo completa (na ordem das perguntas).
export const CAMPOS_USINA = [
  'apelido', 'potencia_kwp', 'cidade', 'uf', 'data_instalacao', 'inversor_modelo', 'observacoes',
] as const;
export type CampoUsina = (typeof CAMPOS_USINA)[number];

// Campos do cliente novo (na ordem das perguntas). name/phone obrigatórios.
export const CAMPOS_NOVO = ['name', 'phone', 'email', 'city', 'uf', 'cep'] as const;
export type CampoNovo = (typeof CAMPOS_NOVO)[number];

export interface NovoClienteData {
  name?: string;
  phone?: string;
  email?: string | null;
  city?: string | null;
  uf?: string | null;
  cep?: string | null;
}

export type DonoCadState =
  | { etapa: 'escolha'; sistemaId: string }
  | { etapa: 'busca'; sistemaId: string }
  | { etapa: 'novo'; sistemaId: string; campo: CampoNovo; dados: NovoClienteData }
  | { etapa: 'usina'; sistemaId: string; pendentes: CampoUsina[]; idx: number };
