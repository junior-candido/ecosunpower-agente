// src/modules/vendas/card-sombra.ts
// Texto do card de sombra pro Junior (spec §5, versão "nada enviado"). PURO.
import type { ResultadoPrecificacao, OpcaoPrecificada } from './precificador.js';
import type { Faixa } from './autonomia.js';

const num = (v: number, casas = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const TELHADO_NOME: Record<string, string> = { ceramico: 'cerâmico', fibrocimento: 'fibrocimento', metalico: 'metálico', laje: 'laje' };

function linhaOpcao(o: OpcaoPrecificada): string {
  const parcela = o.parcela18x !== null ? ` · 18× ${num(o.parcela18x)}` : '';
  return `${o.rotulo}) ${o.modulos}× ${o.moduloMarca} ${o.moduloModelo} + ${o.micros}× ${o.microMarca} ${o.microModelo} = ${num(o.kwpReal)} kWp\n` +
    `   kit ${num(o.kit)} + serv ${num(o.servico)} = *${num(o.total)}* (${num(o.rsPorWp)} R$/Wp)${parcela}`;
}

export function montarCardSombra(p: {
  nome: string; cidade: string | null; versao: number; faixa: Faixa; telhadoAssumido: boolean;
  consumoFatura: number | null; cargaFutura: number | null;
  resultado: Extract<ResultadoPrecificacao, { ok: true }>;
}): string {
  const r = p.resultado;
  const titulo = `🕶️ SOMBRA v${p.versao} — ${p.nome}${p.cidade ? ` (${p.cidade})` : ''}`;
  const consumoFmt = r.consumoAlvoKwh.toLocaleString('pt-BR');
  const consumo = p.cargaFutura && p.cargaFutura > (p.consumoFatura ?? 0)
    ? `${consumoFmt} kWh (fatura ${p.consumoFatura ?? '?'} · manda a carga futura ${p.cargaFutura})`
    : `${consumoFmt} kWh`;
  const telhado = `telhado: ${p.telhadoAssumido ? 'assumido ' : ''}${TELHADO_NOME[r.telhado] ?? r.telhado}`;
  const resumo = `${consumo} · ${telhado} · ${num(r.kwpAlvo)} kWp alvo · serviço ${num(r.servicoRsPorWp)} R$/Wp`;
  const faixa = p.faixa === 'chama_junior' ? '\n🙋 acima de 1.500 kWh — na vida real seria "preciso de você"' : '';
  const opcoes = r.opcoes.map(linhaOpcao).join('\n');
  const avisos = r.avisos.length ? '\n' + r.avisos.map(av => `⚠️ ${av.texto}`).join('\n') : '';
  const primeiroNome = p.nome.trim().split(/\s+/)[0] || p.nome;
  return `${titulo}\n${resumo}${faixa}\n\n${opcoes}${avisos}\n\n_Nada foi enviado ao cliente._ Compara com a sua proposta; ajusta preço com /tabela e roda de novo com /sombra ${primeiroNome}.`;
}

export function montarCardSombraErro(p: { nome: string; erro: 'tabela_incompleta' | 'consumo_invalido' | 'sem_dados' | 'fluxo_atual'; faltando: string[] }): string {
  const titulo = `🕶️ SOMBRA — ${p.nome}`;
  if (p.erro === 'tabela_incompleta') {
    const exemplos = p.faltando.map(f =>
      f === 'módulo' ? '/tabela JA 625 = 980'
      : f === 'micro' ? '/tabela micro Hoymiles HMS-2000-4T 4 = 1450'
      : f === 'cabos' ? '/tabela cabos = 420'
      : `/tabela ${f} = 95`).join('\n');
    return `${titulo}\nNão deu pra precificar — falta na tabela: ${p.faltando.join(', ')}.\n${exemplos}`;
  }
  if (p.erro === 'sem_dados') return `${titulo}\nLead sem consumo (kWh) nem carga futura — a Eva ainda não qualificou.`;
  if (p.erro === 'fluxo_atual') return `${titulo}\nConsumo abaixo de 500 kWh — fora da faixa autônoma (segue o fluxo de hoje).`;
  return `${titulo}\nConsumo inválido no cadastro.`;
}
