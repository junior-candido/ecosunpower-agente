// src/modules/closing/extrair-docs-contrato.ts
//
// 🤖 IA lê conta de luz + CNH (foto/PDF) e extrai os dados pro contrato.
// Princípio: ROBUSTO e obediente — NUNCA trava. Lê o que conseguir, o resto
// fica vazio (e o gerador põe um branco). Nunca inventa dado.
import type Anthropic from '@anthropic-ai/sdk';
import { pdfGrandeDemais, PDF_TIMEOUT_MS } from '../pdf-guard.js';

export interface EnderecoDoc {
  rua?: string; numero?: string; bairro?: string; cidade?: string; uf?: string; cep?: string;
}
export interface DadosDoc {
  nome?: string;
  cpf?: string;
  rg?: string;
  orgao_emissor_rg?: string;
  data_nascimento?: string; // yyyy-mm-dd
  estado_civil?: string;
  endereco?: EnderecoDoc;
  uc_numero?: string;
  concessionaria?: string; // 'Neoenergia-DF' | 'Equatorial-GO' quando der pra inferir
}

export interface ArquivoDoc {
  base64: string;
  mimeType: string;
}

const MODELO_FORTE = 'claude-opus-4-7';
const MODELO_RAPIDO = 'claude-haiku-4-5-20251001';

const PROMPT = `Você extrai dados de documentos brasileiros pra preencher um contrato de energia solar.
Os anexos são uma CONTA DE LUZ (fatura) e/ou uma CNH (carteira de motorista). Leia com atenção e
extraia SOMENTE o que está claramente impresso — NUNCA invente. O que não conseguir ler, deixe de fora.

Responda APENAS um JSON (sem texto antes/depois, sem markdown), neste formato:
{
  "nome": "nome completo do titular",
  "cpf": "000.000.000-00",
  "rg": "número do RG",
  "orgao_emissor_rg": "ex: SSP/DF",
  "data_nascimento": "yyyy-mm-dd",
  "estado_civil": "solteiro(a)/casado(a)/...",
  "endereco": { "rua": "", "numero": "", "bairro": "", "cidade": "", "uf": "DF", "cep": "00000-000" },
  "uc_numero": "número da unidade consumidora / instalação da conta",
  "concessionaria": "Neoenergia-DF ou Equatorial-GO"
}
Regras: CNH traz nome, CPF, RG, órgão emissor e nascimento. Conta de luz traz endereço, UC e a
distribuidora (Neoenergia/CEB => Neoenergia-DF; Equatorial/CELG => Equatorial-GO). Inclua no JSON
só as chaves que você realmente leu. Se um documento estiver ilegível, ignore-o e siga com o resto.`;

/**
 * Lê os documentos e devolve os dados extraídos. Best-effort TOTAL: qualquer
 * falha (IA fora do ar, doc ilegível, PDF gigante) devolve {} — nunca lança.
 */
export async function extrairDocsContrato(
  anthropic: Anthropic,
  arquivos: ArquivoDoc[],
): Promise<DadosDoc> {
  try {
    const conteudo: any[] = [];
    for (const a of arquivos) {
      const mt = (a.mimeType || '').toLowerCase();
      if (mt.includes('pdf')) {
        if (pdfGrandeDemais(a.base64)) continue; // pesado demais → pula (não trava)
        conteudo.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: a.base64 } });
      } else {
        const media = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mt) ? mt : 'image/jpeg';
        conteudo.push({ type: 'image', source: { type: 'base64', media_type: media, data: a.base64 } });
      }
    }
    if (conteudo.length === 0) return {};
    conteudo.push({ type: 'text', text: PROMPT });

    const messages: Anthropic.Messages.MessageParam[] = [{ role: 'user', content: conteudo }];
    let resp;
    try {
      resp = await anthropic.messages.create({ model: MODELO_FORTE, max_tokens: 700, messages }, { timeout: PDF_TIMEOUT_MS });
    } catch {
      resp = await anthropic.messages.create({ model: MODELO_RAPIDO, max_tokens: 700, messages }, { timeout: PDF_TIMEOUT_MS });
    }
    const txt = resp.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
    return parseDadosDoc(txt);
  } catch (err) {
    console.warn('[extrair-docs-contrato] falhou (best-effort):', (err as Error)?.message);
    return {};
  }
}

/** Extrai o JSON da resposta da IA. Tolera cerca-de-código e texto em volta. Nunca lança. */
export function parseDadosDoc(texto: string): DadosDoc {
  try {
    const semCerca = texto.replace(/```json/gi, '').replace(/```/g, '');
    const ini = semCerca.indexOf('{');
    const fim = semCerca.lastIndexOf('}');
    if (ini < 0 || fim <= ini) return {};
    const obj = JSON.parse(semCerca.slice(ini, fim + 1));
    const out: DadosDoc = {};
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
    out.nome = str(obj.nome);
    out.cpf = str(obj.cpf);
    out.rg = str(obj.rg);
    out.orgao_emissor_rg = str(obj.orgao_emissor_rg);
    out.data_nascimento = str(obj.data_nascimento);
    out.estado_civil = str(obj.estado_civil);
    out.uc_numero = str(obj.uc_numero);
    out.concessionaria = mapConcessionaria(str(obj.concessionaria));
    if (obj.endereco && typeof obj.endereco === 'object') {
      const e = obj.endereco;
      out.endereco = {
        rua: str(e.rua), numero: str(e.numero), bairro: str(e.bairro),
        cidade: str(e.cidade), uf: str(e.uf)?.toUpperCase(), cep: str(e.cep),
      };
    }
    return out;
  } catch {
    return {};
  }
}

function mapConcessionaria(raw?: string): string | undefined {
  if (!raw) return undefined;
  const s = raw.toLowerCase();
  if (s.includes('neoenergia') || s.includes('ceb') || s.includes('df')) return 'Neoenergia-DF';
  if (s.includes('equatorial') || s.includes('celg') || s.includes('go')) return 'Equatorial-GO';
  return undefined;
}
