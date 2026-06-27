// usinas-queries.ts
// Consultas e agrupamentos puros para usinas/sistemas_clientes.
// Sem rede, sem DB — só lógica sobre arrays recebidos de fora.

import { ETAPAS_USINA, type EtapaUsinaSlug } from '../usina-etapas.js';
import { formatPhoneBR } from '../meta-leadgen.js';

const NAO_CADASTRADO = 'não cadastrado';

// Agrupa usinas por etapa_obra na ordem de ETAPAS_USINA. PURA. Retorna SEMPRE
// todas as 6 chaves (mesmo vazias), na ordem. Usinas com etapa_obra fora de
// ETAPAS_USINA são ignoradas — não viram coluna.
export function agruparUsinasPorEtapaObra<T extends { etapa_obra: string }>(
  usinas: T[],
): Record<EtapaUsinaSlug, T[]> {
  const grupos = {} as Record<EtapaUsinaSlug, T[]>;
  for (const etapa of ETAPAS_USINA) grupos[etapa.slug] = [];
  for (const usina of usinas) {
    const arr = grupos[usina.etapa_obra as EtapaUsinaSlug];
    if (arr) arr.push(usina); // ignora etapa_obra fora de ETAPAS_USINA
  }
  return grupos;
}

// ---- Painel de contato (espiada rápida no Kanban de Obras) ----

export interface UsinaContatoInput {
  id: string;
  apelido: string;
  cidade: string | null;
  uf: string | null;
  potencia_kwp: number | null;
  etapa_obra: string;
  etapa_obra_updated_at: string | null;
}

export interface LeadContatoInput {
  name: string | null;
  phone: string | null;
  email: string | null;
}

export interface UsinaContatoDTO {
  apelido: string;
  localizacao: string;
  potencia: string;
  etapa: string;
  diasNaEtapa: string;
  detalheUrl: string;
  cliente: { nome: string; telefone: string; email: string } | null;
}

function diasNaEtapaTexto(updatedAt: string | null): string {
  if (!updatedAt) return '';
  const dias = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86_400_000);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'há 1 dia';
  return `há ${dias} dias`;
}

// Monta o view-model do painel a partir da usina + lead vinculado. PURA.
// Campo vazio vira "não cadastrado"; lead null → cliente null (usina sem
// cliente vinculado). Reusa formatPhoneBR e o label de ETAPAS_USINA.
export function montarContatoUsina(
  usina: UsinaContatoInput,
  lead: LeadContatoInput | null,
): UsinaContatoDTO {
  const localizacao = usina.cidade
    ? (usina.uf ? `${usina.cidade}-${usina.uf}` : usina.cidade)
    : NAO_CADASTRADO;
  const potencia = usina.potencia_kwp != null ? `${usina.potencia_kwp} kWp` : NAO_CADASTRADO;
  const etapa = ETAPAS_USINA.find((e) => e.slug === usina.etapa_obra)?.label ?? usina.etapa_obra;

  const cliente = lead === null ? null : {
    nome: lead.name?.trim() || NAO_CADASTRADO,
    telefone: lead.phone?.trim() ? formatPhoneBR(lead.phone) : NAO_CADASTRADO,
    email: lead.email?.trim() || NAO_CADASTRADO,
  };

  return {
    apelido: usina.apelido,
    localizacao,
    potencia,
    etapa,
    diasNaEtapa: diasNaEtapaTexto(usina.etapa_obra_updated_at),
    detalheUrl: `/dashboard/monitoramento/${usina.id}`,
    cliente,
  };
}
