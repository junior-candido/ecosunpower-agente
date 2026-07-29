// src/modules/dashboard/zap-confirmacao.ts
// Fatia 4 — confirmação do zap por código: o assinante digita o número na
// "Minha assinatura", recebe 6 dígitos no próprio zap e confirma na tela.
// Memória do processo (restart = pedir de novo, sem drama). Validade 10min,
// máx. 3 pedidos/hora por assinatura (anti-abuso do envio de zap).

const VALIDADE_MS = 10 * 60 * 1000;
const JANELA_ABUSO_MS = 60 * 60 * 1000;
const MAX_POR_JANELA = 3;

export interface ConfirmadorZap {
  solicitar(assinaturaId: string, telefone: string): { ok: true; codigo: string } | { ok: false; erro: string };
  confirmar(assinaturaId: string, codigo: string): boolean;
  telefonePendente(assinaturaId: string): string | null;
}

export function criarConfirmadorZap(deps?: {
  agora?: () => number;
  gerarCodigo?: () => string;
}): ConfirmadorZap {
  const agora = deps?.agora ?? Date.now;
  const gerarCodigo = deps?.gerarCodigo ?? (() => String(Math.floor(100000 + Math.random() * 900000)));
  const pendentes = new Map<string, { codigo: string; telefone: string; criadoEm: number }>();
  const pedidos = new Map<string, number[]>();

  return {
    solicitar(assinaturaId, telefone) {
      const t = agora();
      const hist = (pedidos.get(assinaturaId) ?? []).filter((x) => t - x < JANELA_ABUSO_MS);
      if (hist.length >= MAX_POR_JANELA) {
        return { ok: false, erro: 'Muitas tentativas — espere uma hora e tente de novo.' };
      }
      hist.push(t);
      pedidos.set(assinaturaId, hist);
      const codigo = gerarCodigo();
      pendentes.set(assinaturaId, { codigo, telefone, criadoEm: t });
      return { ok: true, codigo };
    },
    confirmar(assinaturaId, codigo) {
      const p = pendentes.get(assinaturaId);
      if (!p) return false;
      if (agora() - p.criadoEm > VALIDADE_MS) { pendentes.delete(assinaturaId); return false; }
      if (p.codigo !== codigo) return false;
      pendentes.delete(assinaturaId); // uma vez só
      return true;
    },
    telefonePendente(assinaturaId) {
      return pendentes.get(assinaturaId)?.telefone ?? null;
    },
  };
}
