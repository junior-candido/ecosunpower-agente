// src/modules/financeiro/fiscal/cnpj.ts
// Consulta pública de CNPJ com fallback: tenta BrasilAPI e, se falhar (fora do ar,
// bloqueio de IP de datacenter, timeout), cai pra minhareceita.org — mesma base da
// Receita Federal, mesmos nomes de campo. Nada achado em nenhuma → null (tela deixa
// preencher à mão).
export interface DadosCnpj {
  razaoSocial: string; fantasia: string | null; endereco: string;
  municipio: string; uf: string; cep: string; email: string | null;
}

const FONTES = [
  (so: string) => `https://brasilapi.com.br/api/cnpj/v1/${so}`,
  (so: string) => `https://minhareceita.org/${so}`,
];

export async function consultarCnpj(cnpj: string): Promise<DadosCnpj | null> {
  const so = cnpj.replace(/\D/g, '');
  if (so.length !== 14) throw new Error('CNPJ inválido: precisa de 14 dígitos');
  for (const fonte of FONTES) {
    let resp: Response;
    try {
      resp = await fetch(fonte(so), { signal: AbortSignal.timeout(8000) });
    } catch {
      continue; // rede caiu/timeout nessa fonte → tenta a próxima
    }
    if (!resp.ok) continue;
    const j = await resp.json() as Record<string, unknown>;
    return {
      razaoSocial: String(j.razao_social ?? ''),
      fantasia: j.nome_fantasia ? String(j.nome_fantasia) : null,
      endereco: [j.logradouro, j.numero].filter(Boolean).join(', '),
      municipio: String(j.municipio ?? ''), uf: String(j.uf ?? ''),
      cep: String(j.cep ?? '').replace(/\D/g, ''), email: j.email ? String(j.email) : null,
    };
  }
  return null;
}
