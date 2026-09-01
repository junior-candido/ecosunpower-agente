// src/modules/conhecimento-higiene.ts
// Tira a EcoSunPower de dentro do material que vai pro cliente do SaaS.
//
// O corte multi-tenant (conhecimento-escopo.ts) escolhe QUAIS arquivos o tenant
// lê. Só que a escolha é por arquivo — e dentro dos arquivos técnicos a
// EcoSunPower está escrita o tempo todo, porque a base nasceu 100% nossa.
// Varredura de 01/09/2026: **50 dos 68 arquivos** que o tenant lê citam
// "EcoSunPower", "Junior" ou "Eva". Na prática a Clara, atendendo cliente da
// Conquista Solar, lia "a EcoSunPower trabalha com Solis" e "escalona pro
// Junior" — e repetia.
//
// POR QUE HIGIENIZAR NA ENTREGA, e não editar os 50 arquivos:
//  1. Pega arquivo NOVO automaticamente. O Junior escreve "a EcoSunPower faz X"
//     naturalmente; se dependesse de lembrar de neutralizar, vazaria de novo.
//  2. Não estraga a base pra ele: a EcoSun continua lendo tudo com o próprio
//     nome, do jeito que está escrito.
//
// Só roda pro TENANT. Pra EcoSun o texto passa intacto.
import type { EmpresaConfig } from './empresa-config.js';

/** Blocos que a própria base marca como internos — nunca podem chegar ao cliente. */
const CABECALHO_INTERNO = /^#{1,6}\s*.*(alerta\s+interno|n[ãa]o\s+mostrar\s+ao\s+cliente|uso\s+interno).*$/i;

/**
 * Corta do markdown as seções marcadas como internas (e só elas): a seção
 * começa no cabeçalho marcado e termina no próximo cabeçalho de nível igual ou
 * mais alto. O resto do arquivo fica.
 */
export function removerBlocosInternos(md: string): string {
  const linhas = md.split(/\r?\n/);
  const saida: string[] = [];
  let cortandoNivel = 0;              // 0 = não está cortando
  for (const linha of linhas) {
    const cab = linha.match(/^(#{1,6})\s/);
    if (cortandoNivel > 0) {
      // sai do corte quando aparece um cabeçalho de nível igual ou superior
      if (cab && cab[1].length <= cortandoNivel) cortandoNivel = 0;
      else continue;
    }
    if (cab && CABECALHO_INTERNO.test(linha)) {
      cortandoNivel = cab[1].length;
      continue;
    }
    saida.push(linha);
  }
  return saida.join('\n');
}

/** Escapa o que for usado dentro de RegExp. */
function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Como a marca aparece escrita na base, em todas as formas que achamos.
const MARCA = /\bEco\s?Sun\s?Power\b/gi;

// Contrações do nome do dono. Vêm ANTES do nome solto porque carregam o artigo:
// "pro Junior" precisa virar "pra nossa equipe" quando o gênero é feminino.
const CONTRACOES: Array<[RegExp, 'o' | 'do' | 'pro' | 'pelo' | 'ao']> = [
  [/\b[Pp]ro\s+Junior\b/g, 'pro'],
  [/\b[Dd]o\s+Junior\b/g, 'do'],
  [/\b[Pp]elo\s+Junior\b/g, 'pelo'],
  [/\b[Aa]o\s+Junior\b/g, 'ao'],
  [/\b[Oo]\s+Junior\b/g, 'o'],
];

/**
 * Troca os nomes próprios da casa pelos da empresa que está atendendo.
 * Usa limite de palavra (\b) pra não estragar "avaliação" (contém "Eva") nem
 * "juniores".
 */
export function higienizarParaTenant(texto: string, e: EmpresaConfig): string {
  const f = e.rtGenero === 'f';
  const apelido = e.rtApelido;
  const artigos: Record<string, string> = {
    o: `${f ? 'a' : 'o'} ${apelido}`,
    do: `${f ? 'da' : 'do'} ${apelido}`,
    pro: `${f ? 'pra' : 'pro'} ${apelido}`,
    pelo: `${f ? 'pela' : 'pelo'} ${apelido}`,
    ao: `${f ? 'à' : 'ao'} ${apelido}`,
  };

  let out = removerBlocosInternos(texto);
  out = out.replace(MARCA, () => e.nomeFantasia);

  for (const [re, tipo] of CONTRACOES) {
    out = out.replace(re, (achado) => {
      const trocado = artigos[tipo];
      // preserva a maiúscula de início de frase ("O Junior" -> "A nossa equipe")
      return /^[A-ZÀ-Ú]/.test(achado) ? trocado.charAt(0).toUpperCase() + trocado.slice(1) : trocado;
    });
  }
  // "Junior Rodrigues" e "Junior" soltos (sem artigo colado)
  out = out.replace(/\bJunior\s+Rodrigues\b/g, () => apelido);
  out = out.replace(/\bJunior\b/g, () => apelido);

  // A assistente da casa vira a assistente do cliente.
  out = out.replace(new RegExp(`\\b${esc('Eva')}\\b`, 'g'), () => e.nomeAtendente);

  return out;
}
