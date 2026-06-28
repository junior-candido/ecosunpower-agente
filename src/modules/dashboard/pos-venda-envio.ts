// src/modules/dashboard/pos-venda-envio.ts
// Puro: traduz os botões de ação do pós-venda pro template aprovado da Meta,
// monta o componente da variável {{1}} (nome) e normaliza o telefone. Sem I/O.
import type { TemplateComponent } from '../meta-whatsapp.js';

// Botão do card -> nome do template aprovado (idioma pt_BR). 'contato' não envia.
// parabens/relatorio NÃO entram aqui de propósito: dependem da geração real e vão
// pelo copiloto (a Eva usa os dados reais ou orienta o operador), nunca template cego.
const MAPA: Record<string, string> = {
  limpeza: 'lembrete_manutencao',
  depoimento: 'pedido_depoimento',
  upgrade: 'upgrade_ampliacao',
};

export function mapaBotaoTemplate(tipo: string): string | null {
  return MAPA[tipo] ?? null;
}

/** Componente do body com a variável {{1}} = nome. Meta exige a variável preenchida. */
export function componenteNome(nome: string): TemplateComponent[] {
  const texto = (nome || '').trim() || 'cliente';
  return [{ type: 'body', parameters: [{ type: 'text', text: texto }] }];
}

/** Telefone no formato E.164 sem '+' (ex: 5561999990000). */
export function normalizarTelefone(phone: string): string {
  const d = (phone || '').replace(/\D/g, '');
  if (!d) return '';
  return d.startsWith('55') ? d : '55' + d;
}

// Cópia LOCAL dos textos aprovados na Meta, só pra PRÉVIA (o envio real usa o
// template lá). Se editar o texto na Meta, atualize aqui também. {nome} = nome do cliente.
export const TEXTOS_PREVIA: Record<string, string> = {
  limpeza: 'Oi {nome}, é a Eva da EcoSunPower. Já faz um tempinho desde a última limpeza das suas placas — uma revisão agora mantém a geração lá em cima. Quer que eu agende uma visita?',
  depoimento: 'Oi {nome}, aqui é a Eva da EcoSunPower. Você já usa energia solar há um tempo — adoraríamos saber como tem sido sua experiência. Pode deixar um depoimento rapidinho? Significa muito pra gente 🙏',
  upgrade: 'Oi {nome}, é a Eva da EcoSunPower 🌞 Sua usina vem indo bem! Se seu consumo aumentou (ar novo, carro elétrico, obra), dá pra ampliar o sistema e manter a conta baixinha. Quer que eu veja uma simulação pra você?',
};

/** Texto da prévia (cópia local) com o nome substituído. null se o tipo não tem texto. */
export function previaTemplate(tipo: string, nome: string): string | null {
  const t = TEXTOS_PREVIA[tipo];
  if (!t) return null;
  const n = (nome || '').trim() || 'cliente';
  return t.replace(/\{nome\}/g, n);
}
