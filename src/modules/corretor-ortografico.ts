// Corretor ortográfico do texto que o JUNIOR digita (proposta, mensagens, cases,
// contrato) — corrige português SEM nunca mudar número/valor/nome/sentido.
// Forward-only: age no texto novo, no momento em que ele é digitado; não mexe em
// nada já salvo. Degrada seguro: qualquer dúvida/erro → devolve o texto ORIGINAL.

import type Anthropic from '@anthropic-ai/sdk';
import { medirIa } from './custos/ia-metering.js';

const MODELO = 'claude-haiku-4-5-20251001';
const MIN_CHARS = 3;
const MAX_CHARS = 4000;
// Não deixa a geração da proposta refém da API: se demorar, usa o original.
const TIMEOUT_MS = 8000;
// Se o corrigido encolher/crescer mais que isso, provavelmente reescreveu/removeu
// conteúdo → descarta. Acento/pontuação mudam o tamanho pouco.
const RAZAO_TAMANHO_MIN = 0.65;

const PROMPT_PADRAO =
  'Você é um corretor ortográfico de português brasileiro. Corrija APENAS ortografia, ' +
  'acentuação, pontuação e concordância do texto do usuário. NÃO altere números, valores, ' +
  'datas, percentuais, nomes próprios, marcas, modelos nem siglas. NÃO reescreva, não ' +
  'resuma, não acrescente nada, não mude o sentido. Devolva SOMENTE o texto corrigido, ' +
  'sem comentários e sem aspas.';

const PROMPT_CONSERVADOR =
  'Você é um corretor ortográfico de português brasileiro para texto JURÍDICO de contrato. ' +
  'Corrija SOMENTE erros de digitação e acentuação inequívocos. Na menor dúvida, mantenha ' +
  'idêntico. NUNCA altere números, valores, datas, nomes, cláusulas, termos jurídicos nem o ' +
  'sentido. NÃO reescreva nem reformule. Devolva SOMENTE o texto corrigido, sem comentários.';

// Números COMPLETOS do texto (com separadores: "R$ 2.500,50", "25/06/2026", "8,4",
// "60"). Pega o token inteiro — não só os dígitos — pra que mexer no separador
// (vírgula↔ponto) também seja detectado como mudança de número. Usada pra garantir
// que a correção não alterou nenhum valor.
export function numerosDe(texto: string): string[] {
  return texto.match(/\d[\d.,:/]*\d|\d/g) ?? [];
}

// Rede de segurança DETERMINÍSTICA: decide se é seguro usar o texto corrigido.
// Função pura (sem IA) → fácil de testar. Protege números e barra reescritas.
export function correcaoSegura(original: string, corrigido: string): boolean {
  const corr = (corrigido ?? '').trim();
  if (!corr) return false; // vazio → usa original

  // 1) Números preservados (mesma sequência, na mesma ordem).
  const a = numerosDe(original);
  const b = numerosDe(corr);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }

  // 2) Tamanho sensato (não reescreveu/removeu demais).
  const lo = Math.min(original.length, corr.length);
  const hi = Math.max(original.length, corr.length);
  if (hi > 0 && lo / hi < RAZAO_TAMANHO_MIN) return false;

  return true;
}

// Corrige o português do texto. `client` é o SDK Anthropic (injetado → testável).
// Devolve o texto corrigido se for SEGURO, senão o original. Nunca lança.
export async function corrigirOrtografia(
  client: Pick<Anthropic, 'messages'>,
  texto: string | null | undefined,
  opts: { conservador?: boolean } = {},
): Promise<string> {
  const original = texto ?? '';
  const t = original.trim();
  if (t.length < MIN_CHARS || t.length > MAX_CHARS) return original;
  try {
    // Timeout: não prende a geração da proposta se a API demorar/pendurar.
    const chamada = client.messages
      .create({
        model: MODELO,
        max_tokens: 1500,
        temperature: 0,
        system: opts.conservador ? PROMPT_CONSERVADOR : PROMPT_PADRAO,
        messages: [{ role: 'user', content: t }],
      })
      .catch(() => null);
    const timeout = new Promise<null>((res) => setTimeout(() => res(null), TIMEOUT_MS));
    const resp = await Promise.race([chamada, timeout]);
    if (!resp) {
      console.warn('[corretor] timeout/erro, mantém original');
      return original;
    }
    medirIa({ modelo: MODELO, origem: 'corretor', usage: (resp as any).usage });
    const out = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    if (correcaoSegura(original, out)) return out;
    console.log('[corretor] correção descartada pela rede de segurança, mantém original');
    return original;
  } catch (err) {
    console.warn('[corretor] falhou, mantém original:', (err as Error).message);
    return original;
  }
}
