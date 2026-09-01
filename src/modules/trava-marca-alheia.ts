// src/modules/trava-marca-alheia.ts
// Nenhuma assistente cita empresa que não é a dona da conversa.
//
// Junior, 01/09/2026: "por que toda vez que entrar um cliente vou ter esse
// problema de um jeito ou de outro... quando tiver mais clientes ficaremos
// doido". Tem razão: caçar o nome da casa arquivo por arquivo (código, prompt,
// base de conhecimento, arquivo escrito amanhã) não termina nunca, e piora a
// cada cliente novo.
//
// Aqui a gente fecha o CANO, não o buraco: confere a resposta ANTES de enviar.
// Citou empresa alheia, a mensagem não sai — não importa de onde veio.
// Mesma mecânica que já protege preço (eva-trava-numero) e o zap do dono
// (tenant-admin-guard): falha fechada no ponto de saída.
//
// ESCALA SOZINHA: os termos proibidos saem da lista de empresas carregada no
// boot. Cliente novo entra e já está protegido — nada pra cadastrar.
import { empresa, todasEmpresasConhecidas, type EmpresaConfig } from './empresa-config.js';

/** Resposta quando a assistente citou quem não devia. Não promete nada e não
 *  cita ninguém — só devolve a conversa pro humano. */
export const MENSAGEM_MARCA_BARRADA =
  'Deixa eu confirmar essa informação com a equipe pra não te passar nada errado — já te retorno, tá? 😊';

/** Palavras genéricas demais pra virar "nome de empresa" — barrariam conversa
 *  normal ("nossa equipe te atende"). Ficam de fora da lista de proibidos. */
const GENERICOS = new Set([
  'nossa equipe', 'nosso time', 'equipe', 'time', 'nós', 'a empresa', 'empresa',
  'consultor', 'consultora', 'atendente', 'suporte', 'comercial',
]);

function limpo(s: string | null | undefined): string {
  return String(s ?? '').trim();
}

/** Escapa pra usar dentro de RegExp. */
function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Aceita a marca escrita de qualquer jeito: EcoSunPower, Ecosunpower,
 *  ECOSUNPOWER, "EcoSun Power". Espaço entre as partes vira opcional. */
function padraoMarca(nome: string): RegExp {
  const flexivel = esc(nome).replace(/\s+/g, '\\s*');
  return new RegExp(`\\b${flexivel}\\b`, 'i');
}

/** Nome de PESSOA exige inicial maiúscula: assim "avaliação" não vira "Eva" e
 *  "uma explicação clara" não vira "Clara". */
function padraoPessoa(nome: string): RegExp {
  return new RegExp(`\\b${esc(nome)}\\b`);
}

export interface TermosProibidos {
  marcas: RegExp[];
  pessoas: RegExp[];
}

/** Monta o que NÃO pode sair na conversa desta empresa: tudo que identifica as
 *  outras empresas da plataforma. */
export function termosProibidosPara(
  atual: EmpresaConfig,
  outras: readonly EmpresaConfig[] = todasEmpresasConhecidas(),
): TermosProibidos {
  const marcas: RegExp[] = [];
  const pessoas: RegExp[] = [];
  const meus = new Set(
    [atual.nomeFantasia, atual.razaoSocial, atual.rtApelido, atual.nomeAtendente]
      .map((v) => limpo(v).toLowerCase())
      .filter(Boolean),
  );

  for (const e of outras) {
    if (e.companyId === atual.companyId) continue;
    const marca = limpo(e.nomeFantasia);
    if (marca.length >= 4 && !meus.has(marca.toLowerCase()) && !GENERICOS.has(marca.toLowerCase())) {
      marcas.push(padraoMarca(marca));
    }
    for (const pessoa of [e.rtApelido, e.nomeAtendente]) {
      const p = limpo(pessoa);
      if (p.length >= 3 && !meus.has(p.toLowerCase()) && !GENERICOS.has(p.toLowerCase())) {
        pessoas.push(padraoPessoa(p));
      }
    }
  }
  return { marcas, pessoas };
}

/** A resposta cita empresa que não é a dona da conversa? */
export function citaEmpresaAlheia(
  texto: string,
  atual: EmpresaConfig = empresa(),
  outras?: readonly EmpresaConfig[],
): boolean {
  const t = texto ?? '';
  if (!t) return false;
  const { marcas, pessoas } = termosProibidosPara(atual, outras);
  return marcas.some((re) => re.test(t)) || pessoas.some((re) => re.test(t));
}

/** Texto seguro pra enviar: o original, ou a resposta neutra se citou alheio.
 *  Loga o original pra revisão — é sinal de conteúdo mal isolado em algum lugar. */
export function travarMarcaAlheia(
  texto: string,
  atual: EmpresaConfig = empresa(),
  outras?: readonly EmpresaConfig[],
): string {
  if (!citaEmpresaAlheia(texto, atual, outras)) return texto;
  console.warn(
    `[trava-marca] (${atual.nomeFantasia}) resposta barrada por citar outra empresa: ${(texto ?? '').slice(0, 200)}`,
  );
  return MENSAGEM_MARCA_BARRADA;
}
