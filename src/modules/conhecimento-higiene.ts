// src/modules/conhecimento-higiene.ts
// Tira do material entregue ao cliente os blocos que a própria base marca como
// internos ("ALERTA INTERNO PARA O JUNIOR — não mostrar ao cliente"): margem
// real, fornecedor que atrasa, orientação de negociação. Varredura de
// 01/09/2026: esses blocos estavam indo pro cliente do tenant.
//
// O QUE ESTE MÓDULO NÃO FAZ, DE PROPÓSITO: trocar "EcoSunPower" pelo nome do
// cliente. A primeira versão fazia isso e o Junior derrubou na hora, com razão:
// "A EcoSunPower trabalha com Solis" virando "A Conquista Solar trabalha com
// Solis" faz a assistente dela AFIRMAR o que talvez não seja verdade — promete
// marca, garantia e processo que não são dela. Pior que citar o nome errado.
//
// Quem impede o nome da casa de CHEGAR ao cliente é a `trava-marca-alheia`, no
// ponto de saída. E a solução definitiva é cada empresa ter a sua própria base
// (cópia de um modelo no cadastro), que é a próxima fatia.
//
// Só roda pro TENANT. Pra EcoSun o texto passa intacto — a base é dela.

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
