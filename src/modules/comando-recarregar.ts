// src/modules/comando-recarregar.ts
//
// "/recarregar-config" mentia pelo nome: recarregava só a tabela
// `empresa_config`. A BASE DE CONHECIMENTO (`conhecimento_empresa`) fica num
// Map em memória e só era lida no boot — então um `UPDATE` no SQL Editor não
// tinha efeito nenhum até o serviço reiniciar.
//
// Pegou em 09/09/2026: a regra de encaminhar assunto técnico pra Engenharia da
// Conquista Solar foi gravada no banco e a assistente seguiu sem saber dela.
//
// Agora um comando só recarrega as duas coisas, e `/recarregar-base` é o mesmo
// comando com o nome que a pessoa lembra na hora.

const NOMES = ['recarregar-config', 'recarregar-base', 'recarregar'] as const;

/**
 * A mensagem é o comando de recarregar? Aceita com e sem barra, com espaço
 * sobrando e em qualquer caixa — o Junior digita dos dois jeitos.
 */
export function ehComandoRecarregar(texto: string): boolean {
  const limpo = (texto ?? '')
    .trim()
    .toLowerCase()
    .replace(/^\//, '')
    .replace(/\s+/g, ' ');
  return (NOMES as readonly string[]).includes(limpo);
}

/** A linha que volta no zap, dizendo o que entrou de verdade. */
export function textoDaRecarga(params: {
  configOk: boolean;
  nomeFantasia: string;
  nomeAtendente: string;
  baseOk: boolean;
  empresasNaBase: number;
}): string {
  const { configOk, nomeFantasia, nomeAtendente, baseOk, empresasNaBase } = params;
  const linhaConfig = configOk
    ? `⚙️ Config: ${nomeFantasia} (atendente: ${nomeAtendente})`
    : `⚠️ Config NÃO recarregou — vale a anterior: ${nomeFantasia} (atendente: ${nomeAtendente})`;
  const linhaBase = baseOk
    ? `📚 Base de conhecimento: ${empresasNaBase} empresa(s)`
    : '⚠️ Base de conhecimento NÃO recarregou — vale a anterior';
  return `${linhaConfig}\n${linhaBase}`;
}
