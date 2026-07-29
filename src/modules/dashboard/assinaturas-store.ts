// src/modules/dashboard/assinaturas-store.ts
// Central de Assinaturas (fatia 1): situação derivada pra tela, novo
// vencimento ao pagar, e acesso a banco (service-role; RLS nega tenants).
// Régua do Junior: vencendo = faltam ≤8 dias (dia do 1º aviso automático).

export type StatusAssinatura = 'ativa' | 'travada' | 'cancelada';
export type Situacao = 'ativa' | 'vencendo' | 'vencida' | 'travada' | 'cancelada';

const DIAS_VENCENDO = 8;

/** Datas em 'YYYY-MM-DD' (comparação de string = comparação de data). */
export function situacaoDaAssinatura(
  a: { status: StatusAssinatura; venceEm: string },
  hoje: string,
): Situacao {
  if (a.status !== 'ativa') return a.status;
  if (hoje > a.venceEm) return 'vencida';
  const dias = Math.round((Date.parse(a.venceEm) - Date.parse(hoje)) / 86_400_000);
  return dias <= DIAS_VENCENDO ? 'vencendo' : 'ativa';
}

function maisUmMes(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const ano = m === 12 ? y! + 1 : y!;
  const mes = m === 12 ? 1 : m! + 1;
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate(); // dia 0 do mês seguinte
  const dia = Math.min(d!, ultimoDia);
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Pagou: renova a partir do vencimento (adiantado) ou de hoje (atrasado). */
export function novoVencimento(venceEm: string, hoje: string): string {
  return maisUmMes(venceEm >= hoje ? venceEm : hoje);
}
