// src/modules/financeiro/fiscal/cnpj.ts
// Consulta pública BrasilAPI (grátis, sem chave). Falhou/404 → null: a tela cai pro manual.
export interface DadosCnpj {
  razaoSocial: string; fantasia: string | null; endereco: string;
  municipio: string; uf: string; cep: string; email: string | null;
}

export async function consultarCnpj(cnpj: string): Promise<DadosCnpj | null> {
  const so = cnpj.replace(/\D/g, '');
  if (so.length !== 14) throw new Error('CNPJ inválido: precisa de 14 dígitos');
  const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${so}`);
  if (!resp.ok) return null;
  const j = await resp.json() as Record<string, unknown>;
  return {
    razaoSocial: String(j.razao_social ?? ''),
    fantasia: (j.nome_fantasia as string | null) || null,
    endereco: [j.logradouro, j.numero].filter(Boolean).join(', '),
    municipio: String(j.municipio ?? ''), uf: String(j.uf ?? ''),
    cep: String(j.cep ?? '').replace(/\D/g, ''), email: (j.email as string | null) || null,
  };
}
