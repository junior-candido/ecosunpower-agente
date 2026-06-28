// src/modules/dashboard/pos-venda-envio.ts
// Puro: traduz os botões de ação do pós-venda pro template aprovado da Meta,
// monta o componente da variável {{1}} (nome) e normaliza o telefone. Sem I/O.
import type { TemplateComponent } from '../meta-whatsapp.js';

// Botão do card -> nome do template aprovado (idioma pt_BR). 'contato' não envia.
const MAPA: Record<string, string> = {
  parabens: 'acompanhamento_geracao',
  relatorio: 'acompanhamento_geracao',
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
