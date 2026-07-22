// src/modules/elo/eventos.ts
// Espinha do Elo: registra eventos em eventos_elo. NUNCA lança —
// o registro de evento nao pode derrubar o fluxo que o chamou.

export type EventoInput = {
  tipo: string;
  leadId?: string | null;
  clienteId?: string | null;
  departamento?: string | null;
  canal?: 'whatsapp' | 'email' | 'sistema' | 'web' | null;
  origem?: string | null;
  payload?: Record<string, unknown>;
  // [MT fatia 3e] carimbo da empresa dona do evento. Sem ele, sob crachá do
  // tenant o default EcoSun batia no WITH CHECK da 079 e o evento era PERDIDO
  // em silêncio (o erro é engolido de propósito — achado do review da 3c).
  companyId?: string | null;
};

// Recebe qualquer client com .from(...).insert(...) (SupabaseService.getClient()).
export async function registrarEvento(client: any, ev: EventoInput): Promise<void> {
  try {
    const { error } = await client.from('eventos_elo').insert({
      tipo: ev.tipo,
      lead_id: ev.leadId ?? null,
      cliente_id: ev.clienteId ?? null,
      departamento: ev.departamento ?? null,
      canal: ev.canal ?? null,
      origem: ev.origem ?? null,
      payload: ev.payload ?? {},
      // ausente = deixa o DEFAULT da coluna (EcoSun, migration 069) agir —
      // idêntico ao de sempre pros chamadores que não carimbam.
      ...(ev.companyId ? { company_id: ev.companyId } : {}),
    });
    if (error) console.warn('[elo] evento nao gravado (ignorado):', error.message ?? error);
  } catch (err) {
    console.warn('[elo] evento falhou (ignorado):', (err as Error)?.message ?? err);
  }
}
