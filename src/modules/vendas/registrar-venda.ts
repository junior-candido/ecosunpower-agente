// src/modules/vendas/registrar-venda.ts
//
// ❤️ O CORAÇÃO DA VENDA — o ÚNICO lugar que marca "vendeu".
//
// Chamado pelo botão "Fechou!" do dashboard E pelo comando "fechou com [nome]"
// da Eva. Como os dois passam por aqui, o sistema fica sempre alinhado: mesma
// verdade, várias portas. Quando fecha (por qualquer porta), o lead vira
// contrato_assinado com a DATA real, o valor/tipo ficam gravados, e o Elo é
// avisado — dashboard, métricas e Elo enxergam o mesmo número na hora.
import { registrarEvento } from '../elo/eventos.js';
import { CLIENTE_STATUSES } from '../dashboard/clientes-queries.js';

export type TipoVenda = 'sistema' | 'servico';

export interface RegistrarVendaInput {
  leadId: string;
  tipo?: TipoVenda | null;
  valorCents?: number | null;
  kwp?: number | null;
  /** 'yyyy-mm-dd' ou ISO. Padrão: agora. Vira meio-dia UTC pra não pular de dia no fuso -3. */
  data?: string | null;
  /** de onde veio o fechamento: 'dashboard' | 'eva' | ... (rastreabilidade) */
  origem?: string | null;
}

export interface RegistrarVendaResult {
  ok: boolean;
  leadId: string;
  /** true se o lead JÁ era venda (instalado/operando/etc.) antes desta chamada */
  jaEraVenda: boolean;
  erro?: string;
}

/**
 * Marca uma venda fechada. Best-effort no evento do Elo (nunca derruba a venda).
 * Idempotente no essencial: não rebaixa quem já está instalado/operando e não
 * re-carimba a data de quem já tinha data.
 */
export async function registrarVenda(
  client: any,
  input: RegistrarVendaInput,
): Promise<RegistrarVendaResult> {
  const leadId = String(input.leadId ?? '').trim();
  if (!leadId) return { ok: false, leadId, jaEraVenda: false, erro: 'leadId vazio' };

  // Estado atual — pra não rebaixar quem já avançou nem re-carimbar a data.
  const { data: atual, error: errLer } = await client
    .from('leads')
    .select('installation_status, contract_signed_at')
    .eq('id', leadId)
    .maybeSingle();
  if (errLer) return { ok: false, leadId, jaEraVenda: false, erro: errLer.message };
  if (!atual) return { ok: false, leadId, jaEraVenda: false, erro: 'lead não encontrado' };

  const jaEraVenda = CLIENTE_STATUSES.includes(String(atual.installation_status ?? ''));
  const dataVenda = normalizarData(input.data) ?? new Date().toISOString();

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  // Só PROMOVE pra contrato_assinado quem ainda não é venda (não rebaixa
  // instalado/operando de volta pra contrato_assinado).
  if (!jaEraVenda) patch.installation_status = 'contrato_assinado';
  // Carimba a data só se ainda não tiver — é a fonte da linha do tempo.
  if (!atual.contract_signed_at) patch.contract_signed_at = dataVenda;
  if (input.tipo != null) patch.venda_tipo = input.tipo;
  if (input.valorCents != null && Number.isFinite(input.valorCents)) {
    patch.venda_valor_cents = Math.round(input.valorCents);
  }
  if (input.kwp != null && Number.isFinite(input.kwp)) patch.venda_kwp = input.kwp;

  const { error: errUpd } = await client.from('leads').update(patch).eq('id', leadId);
  if (errUpd) return { ok: false, leadId, jaEraVenda, erro: errUpd.message };

  // Avisa o Elo — best-effort, registrarEvento nunca lança.
  await registrarEvento(client, {
    tipo: 'comercial:venda',
    leadId,
    departamento: 'comercial',
    canal: 'sistema',
    origem: input.origem ?? 'dashboard',
    payload: {
      tipo: input.tipo ?? null,
      valorCents: input.valorCents ?? null,
      kwp: input.kwp ?? null,
      data: (patch.contract_signed_at as string | undefined) ?? atual.contract_signed_at ?? dataVenda,
      jaEraVenda,
    },
  });

  return { ok: true, leadId, jaEraVenda };
}

/** 'yyyy-mm-dd' → meio-dia UTC (evita virar o dia anterior no fuso -3). Inválida → null. */
export function normalizarData(d?: string | null): string | null {
  if (!d) return null;
  const s = String(d).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T12:00:00.000Z`;
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}
