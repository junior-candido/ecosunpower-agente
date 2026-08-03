// Eva Proposta Assistant - modulo /proposta
// Coleta dados conversacionalmente, valida obrigatorios (REGRA DE OURO em propostas.md),
// gera proposta (HTML + PDF), faz upload no Drive, manda links pro Junior revisar antes
// de enviar pro cliente.

import Anthropic from '@anthropic-ai/sdk';
import Redis from 'ioredis';
import { readFileSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import {
  calcular,
  compararGreener,
  percentualFioBPorAno,
  tipoSistemaDeDados,
  perfilDeTipoCliente,
  temCarregadorNosServicos,
  type ProposalInput,
} from './proposal/calculator.js';
import { corrigirOrtografia } from './corretor-ortografico.js';
import {
  FATOR_PERDA_CONSERVADOR,
  hspPorConcessionaria,
  tarifaPorConcessionaria,
  tusdFioBPorConcessionaria,
  REAJUSTE_ANUAL_ENERGIA,
  CUSTO_ILUMINACAO_PUBLICA,
  VIDA_UTIL_ANOS,
} from './solar-params.js';
import { renderProposalHTML, type ProposalData } from './proposal/template.js';
import { temBateria } from './proposal/bateria.js';
import { parcelaCartaoBelenus, parcelaCartaoSolFacil, parcelasMaxCartaoSolar, type TabelaCartao } from './proposal/cartao-solar.js';
import { obterLogoBase64, LOGO_ECOSUNPOWER_BRANCO_BASE64 } from './proposal/assets/logo-base64.js';
import { somaServicosExtras, renderServiceOnlyHTML, type ServicoItem, type ServiceOnlyData } from './proposal/service-render.js';
import { montarDadosInputCompleto } from './proposal/dados-input.js';
import { construirSeedReopen, construirSeedClone } from './proposal/reopen-seed.js';
import { renderComparacaoSolar, type ComparacaoOpcao } from './proposal/comparison-render.js';
import { servicePaymentOptions, valorParcelaCartao } from './proposal/service-payment.js';
import { htmlToPdf, gerarQrCodeDataUrl } from './proposal/pdf-generator.js';
import type { DriveUploader } from './proposal/drive-uploader.js';
import type { SupabaseService } from './supabase.js';
import type { ModoEnvio, TipoProposta, AttachmentInput } from './proposal/attachments/types.js';
import { getSignedUrlFromPath, uploadToStorage } from './proposal/attachments/storage-uploader.js';
import { HiggsfieldImageGenerator } from './marketing/higgsfield-gen.js';
import { processAttachmentFromBuffer } from './proposal/attachments/index.js';
import { downloadWabaMedia } from './proposal/attachments/whatsapp-media-downloader.js';
import type { MetaWhatsAppService } from './meta-whatsapp.js';
import { enviarPropostaParaCliente } from './eva-sender.js';
import { CasesFetcher, type Case } from './cases-fetcher.js';
import { empresa, interpolarEmpresa, comEmpresaDe } from './empresa-config.js';
import { renderSocialProofPage } from './proposal/social-proof-page.js';
import { resumirRascunho } from './proposal/rascunho.js';

const IORedis = (Redis as any).default ?? Redis;

// Normaliza a lista de serviços que a Eva devolve no JSON pro tipo ServicoItem.
// Descarta itens incompletos (sem título ou sem valor > 0). Vazio => undefined,
// pra que dataToProposalData NÃO setar o campo e a proposta siga solar-only.
export function mapServicosFromClaude(raw: unknown): ServicoItem[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const itens = raw
    .map((s: any) => ({
      titulo: String(s?.titulo ?? '').trim(),
      descricao: String(s?.descricao ?? '').trim(),
      valorRs: Number(s?.valorRs),
      // Eva classifica a intenção; aqui só normalizamos pra boolean.
      // true = já está dentro do valor do solar (não soma de novo).
      jaIncluso: s?.jaIncluso === true,
    }))
    .filter(s => s.titulo.length > 0 && isFinite(s.valorRs) && s.valorRs > 0);
  return itens.length > 0 ? itens : undefined;
}

// OBSERVAÇÕES da proposta (pedido Junior 21/07: "inversor híbrido sem bateria,
// obs de que já é preparado pra receber" — a Eva aceitava e o texto sumia,
// porque o campo NÃO EXISTIA). Texto do JUNIOR, textual, em qualquer modo.
// Saneamento: aceita string ou lista, tira vazios, teto 8 × 600 chars.
export function observacoesDaProposta(raw: unknown): string[] | undefined {
  const lista = Array.isArray(raw) ? raw : (typeof raw === 'string' ? [raw] : []);
  const limpas = lista
    .filter((o): o is string => typeof o === 'string')
    .map((o) => o.trim().slice(0, 600))
    .filter((o) => o.length > 0)
    .slice(0, 8);
  return limpas.length > 0 ? limpas : undefined;
}

// Monta as linhas de resumo dos serviços pro WhatsApp do Junior depois de gerar
// a proposta. Serviços "a mais" somam ao total geral; "já incluso" aparecem à
// parte (sem custo extra, não mudam o total). Sem serviços => nenhuma linha.
export function resumoServicosParaJunior(servicos: ServicoItem[] | undefined, valorSolarRs: number): string[] {
  const lista = (servicos ?? []).filter(Boolean);
  if (lista.length === 0) return [];
  const fmtBr = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  const somaExtras = somaServicosExtras(lista);
  const inclusos = lista.filter(s => s.jaIncluso);
  const linhas: string[] = [];
  if (somaExtras > 0) {
    linhas.push(`🔧 Serviços (a mais): + R$ ${fmtBr(somaExtras)}`);
    linhas.push(`💵 Total geral (solar + serviços): R$ ${fmtBr((Number(valorSolarRs) || 0) + somaExtras)}`);
  }
  for (const s of inclusos) {
    linhas.push(`✓ Já incluso (sem custo extra): ${s.titulo} — R$ ${fmtBr(Number(s.valorRs) || 0)}`);
  }
  return linhas.length > 0 ? ['', ...linhas] : [];
}

// Decide se a proposta é SÓ-SERVIÇO (sem solar): não tem potência mas tem ao
// menos um serviço válido. Resolve o caso Edmilson (proposta de adequação de
// padrão sem kit solar). Proposta com solar SEMPRE vai pelo fluxo solar normal.
// Como mapServicosFromClaude, mas MANTÉM serviços sem preço (basta o título).
// Usado na proposta SÓ-SERVIÇO, onde o Junior dá UM valor total (lump sum) em vez
// de preço por tarefa — local e valor variam a cada job, não dá pra precificar item.
export function mapServicosTitulos(raw: unknown): ServicoItem[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const itens = raw
    .map((s: any) => ({
      titulo: String(s?.titulo ?? '').trim(),
      descricao: String(s?.descricao ?? '').trim(),
      valorRs: Number.isFinite(Number(s?.valorRs)) && Number(s?.valorRs) > 0 ? Number(s?.valorRs) : 0,
      jaIncluso: s?.jaIncluso === true,
    }))
    .filter(s => s.titulo.length > 0);
  return itens.length > 0 ? itens : undefined;
}

// Total da proposta de serviço: soma dos itens SE eles têm preço; senão, o valor
// único (valorTotalRs) que o Junior digitou. Fonte única dessa regra.
export function totalServicoData(data: any, servicos: ServicoItem[]): number {
  const soma = (servicos ?? []).reduce((acc, s) => acc + (Number(s?.valorRs) || 0), 0);
  return soma > 0 ? soma : (Number(data?.valorTotalRs) || 0);
}

export function isPropostaSoServico(data: any): boolean {
  const semSolar = !(Number(data?.potenciaKwp) > 0);
  if (!semSolar) return false;
  const servicos = mapServicosTitulos(data?.servicos);
  if (!servicos || servicos.length === 0) return false;
  // É só-serviço quando há tarefas E um total pra cobrar (itens OU valor único).
  return totalServicoData(data, servicos) > 0;
}

// Monta o ServiceOnlyData (entrada do layout só-serviço) a partir dos dados crus.
// No só-serviço NÃO há solar, então o total = soma de TODOS os serviços. Respeita
// formasPagamento/validadeDias do Junior; senão usa o pagamento padrão sobre o total.
export function buildServiceOnlyData(params: {
  numeroProposta: string;
  dataProposta: string;
  data: any;
  servicos: ServicoItem[];
  empresa: ServiceOnlyData['empresa'];
  criarPagamentoPadrao: (totalRs: number) => ServiceOnlyData['formasPagamento'];
}): ServiceOnlyData {
  const { numeroProposta, dataProposta, data, servicos, empresa, criarPagamentoPadrao } = params;
  // Total: soma dos itens se eles têm preço; senão o valor único (valorTotalRs).
  const totalServicos = totalServicoData(data, servicos);
  return {
    numeroProposta,
    dataProposta,
    validadeDias: Number(data.validadeDias) > 0 ? Number(data.validadeDias) : 5,
    nomeCliente: data.nomeCliente,
    servicos,
    totalRs: totalServicos,
    formasPagamento: data.formasPagamento ?? criarPagamentoPadrao(totalServicos),
    // ?? data.observacao: o extrator às vezes emite no SINGULAR (mesmo padrão
    // já previsto no corretor) — sem o fallback o texto morria calado de novo.
    observacoes: observacoesDaProposta(data.observacoes ?? data.observacao),
    empresa,
  };
}

// Monta uma ComparacaoOpcao a partir dos dados crus + o resultado de calcular().
// O payback vem já formatado em PT-BR; geração e economia arredondadas. Eva não
// calcula — quem roda calcular() é o sistema; aqui só formatamos o resultado.
export function buildComparacaoOpcao(
  rotulo: string,
  dados: {
    potenciaKwp: number;
    moduloFabricante: string;
    moduloModelo?: string;
    moduloPotenciaW?: number;
    moduloQuantidade?: number;
    inversorFabricante: string;
    inversorModelo?: string;
    inversorQuantidade?: number;
    bateria?: { fabricante?: string; modelo?: string; capacidadeKwh?: number; quantidade?: number } | null;
    valorTotalRs: number;
    cartaoParcelaRs?: number;
    // [ECOSOF] nº de parcelas do cartão exibido no quadro (24 Belenus / 12 genérico).
    cartaoParcelas?: number;
    financiamentoParcelaRs?: number;
    consumoMensalKwh?: number;
  },
  calc: {
    geracaoMensalKwh: number; paybackAnos: number; paybackMeses: number; paybackInviavel: boolean;
    economiaVidaUtil: number; economiaMensal?: number;
    contaComDetalhada?: { creditosKwh?: number };
    geracaoMensalDistribuida?: number[];
    economiaRemotaMensal?: number;
    creditosUsadosRemotoKwh?: number;
    creditosGuardadosKwh?: number;
  },
): ComparacaoOpcao {
  const anosTxt = calc.paybackAnos > 0 ? `${calc.paybackAnos} ${calc.paybackAnos === 1 ? 'ano' : 'anos'}` : '';
  const mesesTxt = calc.paybackMeses > 0 ? `${calc.paybackMeses} ${calc.paybackMeses === 1 ? 'mês' : 'meses'}` : '';
  const paybackTexto = calc.paybackInviavel
    ? '> 25 anos'
    : ([anosTxt, mesesTxt].filter(Boolean).join(' e ') || '0 meses');
  // Sobra REAL: depois do abate remoto quando houver; senão o bruto do breakdown.
  const creditosKwh = calc.creditosGuardadosKwh ?? calc.contaComDetalhada?.creditosKwh;
  const remotoKwh = calc.creditosUsadosRemotoKwh;
  const remotaRs = calc.economiaRemotaMensal;
  // Linha "Bateria" só com bateria DE VERDADE (mesma régua do motor: capacidade e
  // quantidade > 0) — senão o card diria "híbrido" com o cálculo rodando on-grid.
  const bateriaValida = temBateria(dados.bateria as any) ? dados.bateria : undefined;
  return {
    rotulo,
    potenciaKwp: dados.potenciaKwp,
    geracaoMensalKwh: Math.round(calc.geracaoMensalKwh),
    valorTotalRs: dados.valorTotalRs,
    paybackTexto,
    economia25AnosRs: Math.round(calc.economiaVidaUtil),
    economiaMensalRs: Math.round(calc.economiaMensal ?? 0),
    creditosMensalKwh: (creditosKwh && creditosKwh > 0) ? Math.round(creditosKwh) : undefined,
    creditosRemotoKwh: (remotoKwh && remotoKwh > 0) ? Math.round(remotoKwh) : undefined,
    economiaRemotaRs: (remotaRs && remotaRs > 0) ? Math.round(remotaRs) : undefined,
    bateriaFabricante: bateriaValida?.fabricante,
    bateriaModelo: bateriaValida?.modelo,
    bateriaCapacidadeKwh: (Number(bateriaValida?.capacidadeKwh) > 0) ? Number(bateriaValida?.capacidadeKwh) : undefined,
    bateriaQuantidade: (Number(bateriaValida?.quantidade) > 0) ? Number(bateriaValida?.quantidade) : undefined,
    geracaoMensalDistribuida: calc.geracaoMensalDistribuida,
    consumoMensalKwh: (Number(dados.consumoMensalKwh) > 0) ? Number(dados.consumoMensalKwh) : undefined,
    cartaoParcelaRs: dados.cartaoParcelaRs,
    cartaoParcelas: dados.cartaoParcelas,
    financiamentoParcelaRs: dados.financiamentoParcelaRs,
    moduloFabricante: dados.moduloFabricante,
    moduloModelo: dados.moduloModelo,
    moduloPotenciaW: dados.moduloPotenciaW,
    moduloQuantidade: dados.moduloQuantidade,
    inversorFabricante: dados.inversorFabricante,
    inversorModelo: dados.inversorModelo,
    inversorQuantidade: dados.inversorQuantidade,
  };
}

// Monta o input de cálculo de UMA opção da comparação. data.* É a Opção A, então o
// override de geração do topo pertence À Opção A — não pode vazar pras demais opções
// (senão todas saíam com a MESMA geração). Da Opção B em diante, removemos o override
// do topo e deixamos cada uma calcular pela própria potência; se a própria opção trouxer
// geração (PVSol dela), o spread de `op` por último faz ela mandar. Consumo do cliente é
// o mesmo nas duas, então fica. NÃO muta o `data` original.
export function montarInputOpcaoComparacao(data: any, op: any, indice: number): any {
  const base = { ...data };
  if (indice > 0) {
    delete base.geracaoMensalKwh;
    delete base.geracaoKwh;
    delete base.geracao;
    // O estudo mês-a-mês (PVSol dos 12 meses) também é da Opção A — sem apagar,
    // a média dos 12 virava a geração da B (as duas saíam idênticas).
    delete base.geracaoMensalKwhDistribuido;
    delete base.geracaoMensal12Meses;
    // Bateria do topo é da Opção A (comparação on-grid × híbrido): a B só é
    // híbrida se trouxer bateria PRÓPRIA — senão herdaria o tipo de sistema da A.
    delete base.bateria;
    delete base.modoBateria;
    // Simultaneidade editada no topo é da A (Junior ajusta olhando a bateria
    // dela) — a B usa a sugerida do perfil, ou a própria se vier na opção.
    delete base.percentualGeracaoInjetada;
  }
  // Consumo de cenário só vale se for número de verdade — 0/negativo/lixo do
  // extrator não pode sobrescrever o consumo do cliente em silêncio.
  // Mesmo tratamento pro consumo remoto (outra unidade).
  const opLimpa = { ...op };
  if (!(Number(opLimpa.consumoMensalKwh) > 0)) delete opLimpa.consumoMensalKwh;
  if (!(Number(opLimpa.consumoRemotoMensalKwh) > 0)) delete opLimpa.consumoRemotoMensalKwh;
  const out = { ...base, ...opLimpa };
  // Blindagem do classificador: "híbrido"/"bateria" escritos na modalidade ou
  // tipoCliente do topo descrevem a opção COM bateria — numa opção sem bateria
  // própria, o texto contaminaria o tipoSistema (regex do calculator). Limpa nas
  // CÓPIAS; perfil (residencial/comercial/rural) e off-grid não usam essas palavras.
  if (!temBateria(out.bateria)) {
    if (typeof out.modalidade === 'string') out.modalidade = out.modalidade.replace(/h[ií]brid\w*|bateria\w*/gi, '').replace(/\s+/g, ' ').trim();
    if (typeof out.tipoCliente === 'string') out.tipoCliente = out.tipoCliente.replace(/h[ií]brid\w*|bateria\w*/gi, '').replace(/\s+/g, ' ').trim();
  }
  return out;
}

// Comparação de 2 sistemas: o extrator (LLM) deve repetir a Opção A no topo do `data`
// E em comparacao[0]. Quando ele preenche só comparacao[] e esquece o topo, a validação
// estourava `Campo "potenciaKwp" inválido: NaN` (Number(undefined) = NaN) antes mesmo de
// chegar no código que monta a comparação. comparacao[0] É a Opção A por contrato, então
// hidratamos o topo a partir dela — a geração vira determinística e não depende do LLM
// lembrar de duplicar. Idempotente: se o topo já tem os números, não mexe (topo manda).
export function hydrarOpcaoPrincipalDaComparacao<T extends Record<string, any>>(data: T): T {
  const comp = (data as any)?.comparacao;
  if (!Array.isArray(comp) || comp.length === 0) return data;
  const opcaoA = comp[0];
  if (!opcaoA || typeof opcaoA !== 'object') return data;

  const numeroVazio = (v: unknown) => !Number.isFinite(Number(v)) || Number(v) <= 0;
  const out: any = { ...data };

  if (numeroVazio(out.potenciaKwp) && !numeroVazio(opcaoA.potenciaKwp)) out.potenciaKwp = Number(opcaoA.potenciaKwp);
  if (numeroVazio(out.valorTotalRs) && !numeroVazio(opcaoA.valorTotalRs)) out.valorTotalRs = Number(opcaoA.valorTotalRs);
  if (!out.modulo && opcaoA.modulo) out.modulo = opcaoA.modulo;
  if (!out.inversor && opcaoA.inversor) out.inversor = opcaoA.inversor;

  return out as T;
}

// Mensagem PRONTA PRO CLIENTE (limpa, copiável): saudação + link público + texto
// caloroso. SEM nada interno (R$/Wp, Greener, Drive, preview rastreado, botões) — o
// Junior copia e manda pro cliente direto. A versão de revisão (números) vai separada.
export function buildMensagemClienteProposta(
  nome: string | undefined,
  publicUrl: string,
  ehServico: boolean,
  pdfUrl: string,
  economiaMensal: number | null,
  economiaRemotaMensal?: number | null,
): string {
  // Balão 100% LIMPO — o Junior copia o balão inteiro e manda pro cliente sem editar.
  // Copy "a" (foco no bolso): puxa a economia mensal REAL da proposta. WhatsApp mostra
  // a URL no texto (não dá pra esconder em copia-e-cola) — a "camuflagem" é a frase
  // amigável + o domínio próprio (nunca Drive).
  const primeiro = typeof nome === 'string' ? nome.trim().split(/\s+/)[0] : '';
  const saudacao = primeiro ? `Olá, ${primeiro}! 😊` : 'Olá! 😊';
  const fmtRs = (n: number) => 'R$ ' + n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });

  // Abertura: com economia válida (>0 e proposta solar) usa o número; senão, genérica.
  // Com autoconsumo remoto o total NÃO cabe na frase "sua conta fica X mais barata"
  // (parte da economia é na OUTRA unidade) — divide certinho pra fatura não desmentir.
  const temEconomia = !ehServico && typeof economiaMensal === 'number' && economiaMensal > 0;
  const remota = (typeof economiaRemotaMensal === 'number' && economiaRemotaMensal > 0
    && temEconomia && (economiaMensal as number) > economiaRemotaMensal)
    ? economiaRemotaMensal
    : 0;
  const abertura = temEconomia
    ? (remota > 0
      ? `Sua proposta de energia solar da ${empresa().nomeFantasia} está pronta — sua conta de luz fica cerca de ${fmtRs((economiaMensal as number) - remota)} mais barata por mês, e os créditos ainda abatem ${fmtRs(remota)} na sua outra unidade ☀️`
      : `Sua proposta de energia solar da ${empresa().nomeFantasia} está pronta — e sua conta de luz fica cerca de ${fmtRs(economiaMensal as number)} mais barata por mês ☀️`)
    : ehServico
      ? `Sua proposta da ${empresa().nomeFantasia} está pronta — feita sob medida pra você ☀️`
      : `Sua proposta de energia solar da ${empresa().nomeFantasia} está pronta — feita sob medida pra você ☀️`;

  const linhas = [
    saudacao,
    '',
    abertura,
  ];
  if (!ehServico) {
    linhas.push(
      '',
      'Em vez de pagar uma conta que só aumenta, você passa a investir em algo que se paga sozinho e ainda valoriza seu imóvel.',
    );
  }
  linhas.push(
    '',
    '🌐 Veja sua proposta completa (abre direto no celular):',
    publicUrl,
    '',
    '📄 Prefere em PDF pra guardar?',
    pdfUrl,
    '',
    'Dá uma olhada — e me chama que eu te explico cada número! 💚',
  );
  return linhas.join('\n');
}

// Monta o prompt da imagem do serviço (fotorrealista, contexto BR, sem texto).
// Usado quando o Junior NÃO anexa uma imagem própria do serviço.
export function buildServiceImagePrompt(servico: ServicoItem): string {
  return [
    `Professional photorealistic image illustrating an electrical engineering service: "${servico.titulo}".`,
    servico.descricao ? `Context: ${servico.descricao}.` : '',
    'Brazilian residential or commercial setting, clean modern look, natural lighting, high quality, no text, no watermark.',
  ].filter(Boolean).join(' ');
}

// [ECOSOF] Formata telefone E.164 BR ("5561996978781") como "(61) 99697-8781"
// pro rodapé da proposta. Fallback: devolve o que veio se não reconhecer.
function formatFoneBR(t: string | null): string {
  if (!t) return '';
  const d = t.replace(/\D/g, '').replace(/^55/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t;
}

const PROPOSAL_MODE_TTL_SECONDS = 60 * 60;

interface ProposalMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Estado estruturado da sessao /proposta. Armazena modo de envio, tipo e anexos pendentes.
// Persistido em Redis sob a chave `proposal:state:${phone}`.
interface ProposalSessionState {
  modoEnvio?: ModoEnvio;
  tipo?: TipoProposta;
  attachments: AttachmentInput[];
  pendingMediaId?: string;     // media_id WABA aguardando legenda
  pendingMediaType?: 'foto' | 'video';
  reopenedSlug?: string;        // se setado, regenera proposta existente em vez de criar nova
  reopenedNumero?: string;      // número original da proposta reaberta (preserva no UPDATE)
  geracaoConcluida?: boolean;   // proposta JÁ gerada nesta sessão; próxima foto/cliente novo zera o rascunho
}

// Estrutura JSON que o Claude retorna pra Eva entender o estado.
// Quando action='ready_to_generate', data contem ProposalData completo.
interface ClaudeResponse {
  action: 'ask_modo' | 'ask_tipo' | 'ask_more' | 'ready_to_generate' | 'confirm_generate' | 'chat';
  modoEnvio?: ModoEnvio | null;
  tipo?: TipoProposta | null;
  message: string;
  missing?: string[];
  data?: Partial<ProposalData> & {
    consumoMensalKwh?: number;
    consumoMensalKwhDistribuido?: number[];  // OPCIONAL: historico 12 meses do cliente
    geracaoMensalKwh?: number;     // override do PVSol/PVsyst, se Junior fornecer
    geracaoMensalKwhDistribuido?: number[];  // OPCIONAL: geração 12 meses do estudo (curva do gráfico)
    fatorPerda?: number;
    tarifaRsKwh?: number;
    custoDisponibilidadeMensal?: number;
  };
}

// Input pra gerar proposta direto (sem passar pelo Claude/zap).
// Usado pela tela admin A4 e — internamente — pelo wrapper privado generateProposal.
export interface GenerateProposalCoreInput {
  data: any;
  modoEnvio: ModoEnvio;
  tipo: TipoProposta;
  attachments?: Array<{
    buffer: Buffer;
    mimeType: string;
    legenda: string;
  }>;
  // Quando setado, regenera a proposta NO MESMO slug (reabrir/ajustar) em vez de
  // criar um registro novo. Faz UPDATE no Supabase (não duplica). No modo reopen
  // pulamos o upload pro Drive.
  reopenSlug?: string;
  // No reopen, preserva o número da proposta original (senão o cliente veria um
  // número diferente a cada reabertura). Passado pela rota de reabrir.
  numeroProposta?: string;
  // [Fase 2 B1b] EMPRESA dona da proposta: a geração roda com empresa()
  // respondendo pela config dela (CNPJ/PIX/nome/textos do tenant) e a proposta
  // salva carimbada. Ausente/EcoSun = comportamento de sempre.
  companyId?: string | null;
}

export interface GenerateProposalCoreResult {
  slug: string;
  publicUrl: string | null;
  pdfBuffer: Buffer;
  driveResult: { pdfWebViewLink: string; htmlWebViewLink: string } | null;
  proposalData: ProposalData;
  // null em proposta SÓ-SERVIÇO (sem solar não há payback/TIR pra calcular).
  calculations: ReturnType<typeof calcular> | null;
}

// [ECOSOF] Identidade via placeholders {{...}} — resolvidos POR CHAMADA no
// askClaude (interpolarEmpresa + empresa()), pra /recarregar-config valer sem
// restart. O texto cru fica cacheado no construtor (knowledge não muda).
export function buildSystemPrompt(propostasKnowledge: string, marcasKnowledge: string): string {
  // [ECOSOF] O item de cartão é condicional na MONTAGEM (não placeholder):
  // belenus_ativo (EcoSun, seed) = DOIS cartões (parceria 24× + Sol Fácil 18×);
  // flag desligada = cartão genérico de até 12× na maquininha (service-payment).
  const itemCartaoPrompt = empresa().belenusAtivo
    ? `2. DOIS cartões de crédito, como DUAS opções separadas:
     • "Em até 24× com juros baixos" → meioPagamento "cartao", tabelaCartao "parceria"
     • "Em até 18× · sem juros até 3×" → meioPagamento "cartao", tabelaCartao "solfacil"
     NÃO calcule parcela de cartão: o sistema preenche o valor exato de cada tabela;
     pode deixar valorPrincipal vazio que o sistema corrige. NUNCA escreva nome de
     distribuidor do cartão (ex: "Belenus", "Sol Fácil", "Fortlev") no texto que vai
     pro cliente — use só "Cartão de crédito".`
    : `2. Cartão de crédito em até 12× na maquininha — NÃO calcule a parcela do cartão:
     o sistema preenche o valor exato. Só inclua a opção com meioPagamento "cartao";
     pode deixar valorPrincipal vazio que o sistema corrige.`;
  return `Você é a {{nome_atendente}}, assistente de geração de propostas comerciais da {{empresa_nome}}. Está conversando com o dono da empresa ({{rt_titulo}}, experiente — aqui chamado de Junior) pra coletar dados de um cliente e gerar uma proposta profissional em PDF e versão web.

TOM: direto, técnico, sem ladainha. Junior conhece tudo. Vá pros números.

# KNOWLEDGE: PROPOSTAS

${propostasKnowledge}

# KNOWLEDGE: MARCAS OFICIAIS DA EMPRESA ({{empresa_nome}})

${marcasKnowledge}

# REGRAS CRÍTICAS

1. **REGRA DE OURO**: NUNCA prossiga pra geração com campos obrigatórios faltando. Sempre liste o que falta.
2. **Fator de perda SEMPRE pergunta** — Junior decide caso a caso (típicos: 0.75 / 0.78 / 0.80; recomendado 0.78, calibrado pra surpresa boa sem ficar abaixo da concorrência). NUNCA assume default.
3. Use APENAS marcas oficiais da lista. NUNCA Growatt.
4. Concessionária inferida do endereço: Brasília=Neoenergia-DF, Goiás=Equatorial-GO. Confirme com Junior.
5. Tarifa default: Neoenergia-DF R$ 1,05/kWh, Equatorial-GO R$ 1,00/kWh. Junior pode sobrescrever.
6. Custo disponibilidade default: monofásico R$ 50/mês, trifásico R$ 100/mês.
7. Reajuste anual energia: 10%.
8. Vida útil: 25 anos.
9. Validade da proposta: 5 dias.
10. **SERVIÇOS (multi-item):** a {{empresa_nome}} vende energia, não só solar. Quando o Junior cita serviços avulsos (carregador EV, adequação de padrão, criação de circuito, projeto elétrico, SPDA, aterramento, etc.) junto com o solar, coloque CADA um em \`servicos[]\` com:
    - \`titulo\`: nome curto e claro do serviço.
    - \`descricao\`: o que está incluso. REPLIQUE FIEL o que o Junior escreveu — não invente nem reescreva mudando o sentido. Deixe claro pro cliente, mas sem distorcer.
    - \`valorRs\`: o preço do serviço (só o número).
    - \`jaIncluso\`: você CLASSIFICA a intenção do Junior (não faz conta nenhuma, só entende as palavras dele):
        • \`false\` (padrão) → serviço "A MAIS": SOMA ao valor do solar. Use quando o Junior diz "a mais", "à parte", "fora do orçamento", "extra", "adiciona X por R$Y", "além do solar".
        • \`true\` → serviço "JÁ INCLUSO": já está DENTRO do valor que o Junior passou, então NÃO soma de novo (na proposta aparece com selo "já incluso"). Use quando o Junior diz "já incluso", "já está no valor", "dentro do total", "sem custo adicional", "já contemplado", "incluso no preço".
    REGRA DE OURO da conta: \`valorTotalRs\` é SEMPRE só o valor do solar. Se um serviço é \`jaIncluso: true\`, o \`valorTotalRs\` que o Junior passou JÁ contém esse serviço — não desconte nem some nada, o sistema faz a conta certa. Você só entende e classifica; quem soma/subtrai é SEMPRE o sistema, NUNCA você de cabeça.
    **PROPOSTA SÓ DE SERVIÇO (sem solar):** se o Junior pedir uma proposta só de serviço (ex: desmontagem/reinstalação, adequação de padrão, projeto elétrico, sem kit solar), preencha \`servicos[]\` (as tarefas) + \`nomeCliente\` (+ telefone se modo eva_envia). NÃO invente \`potenciaKwp\`, módulo, inversor nem consumo — deixe ausentes/0. **VALOR — dois jeitos, ambos oficiais:**
        • **POR ITEM** (quando o Junior dá preço por tarefa, ex: "padrão 2500, SPDA 1800, projeto 900"): preencha o \`valorRs\` de CADA tarefa em \`servicos[]\` e deixe \`valorTotalRs\` ausente — O SISTEMA SOMA os itens, você NUNCA soma de cabeça. Se alguma tarefa ficou sem preço, pergunte o preço DELA (\`action: ask_more\`) antes de gerar — soma furada não pode. Se o Junior disser que uma tarefa "está inclusa" em outra, ponha \`valorRs: 0\` nela e registre isso na \`descricao\` (ex: "incluso na adequação de padrão"). Nesse caminho o \`valorTotalRs\` NÃO é obrigatório — NUNCA o liste em \`missing\`.
        • **VALOR FECHADO** (quando o Junior dá um número só, ex: "total R$ 7.800"): ponha em \`valorTotalRs\` e deixe as tarefas SEM \`valorRs\`. Continua valendo como sempre.
        • **CONFLITO:** se ele der preços por item E TAMBÉM um total que não bate com a soma, você NÃO escolhe: mostre a soma dos itens e pergunte qual vale (\`action: ask_more\`).
    No resumo de conferência (\`ready_to_generate\`) da proposta de serviço, liste CADA serviço com o preço e o total no final (ex: "• Adequação de padrão — R$ 2.500\\n• SPDA — R$ 1.800\\n💵 Total: R$ 4.300"); no valor fechado, liste as tarefas e o total único. NÃO liste os campos solares em \`missing\`.
11. **COMPARAÇÃO (2 sistemas solares):** se o Junior quiser que o cliente compare duas opções de sistema, preencha a proposta normalmente com a **Opção A** (potência, módulo, inversor, valorTotalRs no nível principal do \`data\`) E devolva \`comparacao: [opcaoA, opcaoB]\`. **CADA opção precisa vir COMPLETA** — não só a marca: \`rotulo\`, \`potenciaKwp\`, \`valorTotalRs\`, \`modulo\` (com \`fabricante\`, \`modelo\`, \`potenciaW\` e \`quantidade\`) e \`inversor\` (com \`fabricante\`, \`modelo\` e \`quantidade\`). As duas opções têm de ser **DIFERENTES de verdade** (potência/equipamento/valor distintos) — se o Junior só descreveu UM sistema, NÃO invente o outro: peça os dados do segundo sistema (\`action: ask_more\`, listando o que falta da Opção B). NÃO marque recomendação — as duas são neutras. O sistema calcula a geração/payback de CADA uma pela potência dela (você NÃO calcula nada) e monta o quadro comparativo lado a lado. ⚠️ **NUNCA copie a geração do estudo (nem \`geracaoMensalKwh\` nem \`geracaoMensalKwhDistribuido\`) pra DENTRO das opções de \`comparacao[]\`** — o estudo do topo pertence à Opção A; só inclua geração dentro de uma opção se o Junior mandar estudo PRÓPRIO daquela opção.
   **PERGUNTE POR OPÇÃO (comparação bem feita):** ao coletar os dados da comparação, pergunte explicitamente, de forma curta: (1) *"Alguma das opções tem estudo PVSol próprio? Se sim, qual e com que geração?"* — o estudo da **Opção A fica no TOPO do \`data\`, como sempre** (nunca o mova pra dentro de \`comparacao[0]\`); estudo próprio de OUTRA opção (B em diante) entra DENTRO daquela opção (\`geracaoMensalKwh\` ou \`geracaoMensalKwhDistribuido\` na própria opção); (2) *"As duas são pro mesmo consumo do cliente, ou cada uma é um cenário?"* — se o Junior disser que uma opção é pra outro consumo (ex: "a B é pra 800 kWh"), preencha \`consumoMensalKwh\` DENTRO daquela opção; sem resposta, as duas usam o consumo do cliente do topo. NUNCA invente estudo nem consumo de cenário — só preencha dentro da opção o que o Junior disser explicitamente.
   **ON-GRID × HÍBRIDO na mesma comparação:** funciona — a \`bateria\` vai DENTRO da opção híbrida (com \`fabricante\`, \`modelo\`, \`capacidadeKwh\`, \`quantidade\`); a opção sem bateria é on-grid. A bateria do topo do \`data\` pertence à Opção A — NUNCA copie a bateria da A pra dentro da B. Na comparação, "híbrido" descreve a OPÇÃO que tem bateria — NÃO escreva "híbrido" na \`modalidade\`/\`tipoCliente\` do topo (que valem pras duas). **PERGUNTE O MODO da bateria** (*"a bateria vai ciclar todo dia guardando o excedente (autoconsumo) ou é só backup pra falta de luz?"*) e preencha \`modo\` dentro da bateria da opção ("autoconsumo" | "backup" | "time_of_use") — é o modo que muda o número: **autoconsumo/time_of_use injetam bem menos na rede (menos Fio B, economia maior); backup rende IGUAL ao on-grid** (a bateria fica de reserva) — nesse caso a diferença entre as opções é preço e segurança, não economia, e você NÃO deve prometer economia maior. Bateria precisa vir COMPLETA (capacidadeKwh e quantidade) pra linha "Bateria" aparecer no card. Serviços extras (\`servicos[]\`) continuam no topo, valem pra proposta inteira e convivem normalmente com a comparação.
12. **ECONOMIA MENSAL EM R$:** a proposta mostra pro cliente quanto ele economiza POR MÊS em reais (o número que ele mais entende). Pra esse valor sair certo, peça ao Junior — quando ele não informar — a **tarifa real do kWh da conta** (\`tarifaRsKwh\`) e o **valor da iluminação pública** da conta (\`custoIluminacaoPublica\`). São RECOMENDADOS, não bloqueiam: se o Junior não tiver, use os defaults do sistema e siga. Quando ele informar, respeite o número dele.
13. **AUTOCONSUMO REMOTO (outra unidade do titular):** quando o sistema gera MAIS do que o consumo da casa (ex: estudo dimensionado pra 2 unidades) OU quando o Junior mencionar "outra casa/unidade/os créditos vão pra...", PERGUNTE: *"Os créditos que sobram vão abater outra unidade do cliente? Quanto ela consome por mês (kWh)?"* e preencha \`consumoRemotoMensalKwh\` (número, kWh/mês somado das outras unidades). Se o Junior disser **"o restante/o que sobrar vai pra outra unidade"** sem dar número, preencha \`consumoRemotoRestante: true\` (o motor manda TODA a sobra pra lá). O sistema calcula a economia de lá (com Fio B) e mostra a divisão "nesta casa + na outra unidade" — a economia fica MAIOR e mais real. NUNCA invente o número; sem resposta do Junior, deixe ambos ausentes (a sobra aparece como crédito guardado).
14. **OBSERVAÇÕES DO JUNIOR (qualquer modo):** quando o Junior pedir pra "colocar uma observação/obs/nota" na proposta (ex: *"coloca a obs de que o inversor híbrido já é preparado pra receber baterias"*), capture o texto DELE — o mais fiel possível, só ajustando gramática mínima — em \`observacoes\` (lista de strings). A proposta mostra numa seção "Observações" própria, em QUALQUER modo (solar, comparação, híbrida, só-serviço). NUNCA invente observação nem complete com informação técnica que ele não disse; máx. 8. Repita as observações no resumo de confirmação pro Junior conferir o texto ANTES de gerar.

# FORMATO DE RESPOSTA

Você DEVE responder SEMPRE com um único objeto JSON em uma única linha (sem markdown, sem explicação extra), seguindo este schema:

\`\`\`json
{
  "action": "ask_modo" | "ask_tipo" | "ask_more" | "ready_to_generate" | "confirm_generate" | "chat",
  "modoEnvio": "junior_envia" | "eva_envia" | null,
  "tipo": "basica" | "personalizada" | null,
  "message": "string que será mostrada pro Junior no WhatsApp",
  "missing": ["lista", "de", "campos", "faltando"],
  "data": {
    "nomeCliente": "string",
    "documentoCliente": "string",
    "enderecoCliente": "string",
    "telefoneCliente": "string",
    "emailCliente": "string",
    "potenciaKwp": 8.4,
    "fatorPerda": 0.78,
    "consumoMensalKwh": 1000,
    "consumoMensalKwhDistribuido": [1100, 1080, 1020, 950, 880, 850, 870, 920, 980, 1050, 1120, 1180],
    "consumoRemotoMensalKwh": 900,
    "geracaoMensalKwh": 1080,
    "geracaoMensalKwhDistribuido": [1180, 1150, 1100, 1040, 980, 950, 1000, 1060, 1120, 1160, 1170, 1190],
    "tarifaRsKwh": 1.05,
    "custoIluminacaoPublica": 35,
    "custoDisponibilidadeMensal": 50,
    "tipoCliente": "residencial",
    "modalidade": "autoconsumo local",
    "concessionaria": "Neoenergia DF",
    "modulo": { "fabricante": "Trina", "modelo": "Vertex 700W", "potenciaW": 700, "quantidade": 12, "garantiaDefeito": 12, "garantiaEficiencia": 30, "tecnologia": "TOPCon N-Type Bifacial" },
    "inversor": { "fabricante": "Sungrow", "modelo": "SG5.0RS-L", "potenciaW": 5000, "quantidade": 1, "garantia": 10, "eficiencia": 0.985, "tipoInversor": "string" },
    "bateria": { "fabricante": "BYD", "modelo": "B-Box Premium HVS 10.2", "capacidadeKwh": 10.2, "quantidade": 1, "garantia": 10 },
    "estruturaFixacao": { "tipo": "Telha cerâmica", "material": "Alumínio anodizado + parafusos inox", "descricao": "Ganchos com regulagem de altura" },
    "valorTotalRs": 38500,
    "formasPagamento": [
      { "tipo": "À Vista", "titulo": "PIX ou TED", "valorPrincipal": "R$ 38.500", "valorSecundario": "pagamento único", "recomendado": true, "bullets": ["Sem juros", "Início imediato", "Maior economia"] }
    ],
    "servicos": [
      { "titulo": "Carregador EV", "descricao": "Wallbox 7,4 kW instalado com circuito dedicado", "valorRs": 4500, "jaIncluso": false },
      { "titulo": "Adequação de padrão", "descricao": "Troca do padrão de entrada para trifásico", "valorRs": 1000, "jaIncluso": true }
    ],
    "observacoes": ["O inversor híbrido já é preparado para receber baterias no futuro."],
    "comparacao": [
      { "rotulo": "Opção A", "potenciaKwp": 8.4, "valorTotalRs": 38500, "modulo": { "fabricante": "Trina", "modelo": "Vertex 700W", "potenciaW": 700, "quantidade": 12 }, "inversor": { "fabricante": "Sungrow", "modelo": "SG5.0RS-L", "quantidade": 1 } },
      { "rotulo": "Opção B", "potenciaKwp": 10.5, "valorTotalRs": 48000, "modulo": { "fabricante": "LONGi", "modelo": "Hi-MO X10 580W", "potenciaW": 580, "quantidade": 18 }, "inversor": { "fabricante": "SolarEdge", "modelo": "SE7K", "quantidade": 1 } }
    ]
  }
}
\`\`\`

## QUANDO USAR CADA ACTION

- **ask_modo**: PRIMEIRA mensagem. Pergunta quem envia (Junior ou Eva). \`modoEnvio: null\`. Mensagem curta com default "você envia". Veja seção MODOS DE ENVIO no knowledge.
- **ask_tipo**: depois que modoEnvio foi capturado, pergunta básica/personalizada. \`tipo: null\`. Veja seção TIPOS DE PROPOSTA.
- **ask_more**: faltam dados obrigatórios (LEMBRE dos modos: junior_envia tem só nome+geração obrigatórios). \`missing\` lista os campos. \`message\` formato curto: "Falta:\\n• campo1\\n• campo2\\nManda tudo junto."
- **ready_to_generate**: TUDO coletado. Faz um RESUMO confirmando os dados pro Junior. \`message\` deve ser o resumo formatado (com emojis e separadores). \`data\` contém TODOS os campos.
- **confirm_generate**: Junior respondeu "gerar"/"ok"/"manda" depois do resumo. Repete \`data\` completo. \`message\` deve ser curto: "✅ Gerando proposta..."
- **chat**: conversa solta (Junior tirando dúvida sobre algo). Apenas \`message\`.

## CAMPOS OBRIGATÓRIOS

⚠️ **Lista MUDA conforme modoEnvio.** Veja seções "MODOS DE ENVIO" e "CAMPOS POR MODO DE ENVIO" no knowledge acima.

**Sempre obrigatórios (independente do modo):**
- nomeCliente
- Sistema: potenciaKwp, consumoMensalKwh, tipoCliente, modalidade, concessionaria
- Equipamentos: modulo (todos), inversor (todos), estruturaFixacao (tipo)
- Comercial: valorTotalRs
- **Exceção — proposta SÓ de serviço:** vale a regra 10 (SERVIÇOS): campos solares NUNCA são obrigatórios; \`valorTotalRs\` só quando o Junior orçar por valor fechado (por item, o sistema soma).

**Bateria (OPCIONAL — só preencha se o Junior mencionar bateria/armazenamento/híbrido):**
- Capte: fabricante, modelo, capacidadeKwh (por unidade), quantidade, garantia (anos).
- A presença de bateria JÁ marca a proposta como sistema HÍBRIDO — não mude tipoCliente por causa disso.
- NÃO some o preço da bateria separado: já entra no valorTotalRs do kit.
- NUNCA invente bateria quando o Junior não mencionar (sem bateria = on-grid).

\`fatorPerda\`: só importa na BÁSICA (cálculo padrão kWp×HSP×fator). Na **personalizada NÃO peça fator de perda** — a geração vem do estudo, o fator nem é usado; o sistema assume um default (~0,78). Se o Junior já mandou um valor (ex: 0,75/0,78/0,80), respeite; mas NUNCA bloqueie/peça na personalizada.

**Tipo \`personalizada\` (tem ESTUDO PVSol/PVsyst) — adicionalmente OBRIGATÓRIO:**
- A geração do ESTUDO (PVSol/PVsyst). Na personalizada a proposta DEVE usar a geração do estudo, NUNCA o cálculo padrão. Duas formas de receber:
   • \`geracaoMensalKwh\`: um número (geração MÉDIA mensal). OU
   • \`geracaoMensalKwhDistribuido\`: os 12 valores mês a mês do estudo (jan→dez). **Prefira este quando o Junior mandar a geração mês a mês** — assim o gráfico segue exatamente o estudo (o cliente não estranha). O sistema usa a média dos 12 nos indicadores.
   Se o Junior não informar NENHUM dos dois, PEÇA ("Qual a geração do estudo PVSol? média mensal ou os 12 meses") e liste \`geracaoMensalKwh\` em \`missing\`. NÃO gere personalizada sem a geração.
- ⚠️ **DESAMBIGUAÇÃO — consumo x geração:** se o Junior colar uma lista de ~12 números SEM dizer o que é, NÃO assuma que é consumo. PERGUNTE ("Esses 12 valores são o CONSUMO da conta ou a GERAÇÃO do estudo?") com \`action: ask_more\` antes de preencher. Só depois mapeie pra \`consumoMensalKwhDistribuido\` (consumo) ou \`geracaoMensalKwhDistribuido\` (geração).

**Modo \`junior_envia\` — adicionalmente OPCIONAIS (NÃO listar em missing):**
- enderecoCliente, telefoneCliente, emailCliente, documentoCliente

**Modo \`eva_envia\` — adicionalmente OBRIGATÓRIOS:**
- telefoneCliente (com validação de formato BR)
- (recomendados: emailCliente, documentoCliente, enderecoCliente)

## DEFAULTS QUE VOCÊ APLICA

- tarifaRsKwh: Neoenergia DF 1.05, Equatorial GO 1.00
- custoDisponibilidadeMensal: monofásico 50, trifásico 100
- modulo.garantiaDefeito: Trina/JA/Jinko = 12, Risen = 12
- modulo.garantiaEficiencia: TOPCon N-Type = 30, mono normal = 25
- inversor.garantia (REGRA POR TIPO):
  - **MICROINVERSOR** (Hoymiles, Enphase, NEP, APsystems): **12 anos**
  - **INVERSOR STRING** (Sungrow, Solis, Deye, Huawei, Goodwe): **10 anos**
  - **SOLAREDGE** (otimizadores): **12 anos** padrão, com nota "extensível até 20 anos sob demanda" no template
- inversor.tipoInversor: detecta pelo fabricante:
  - "hoymiles", "enphase", "nep", "apsystems" → "microinversor"
  - "solaredge" → "solaredge"
  - resto → "string"
- inversor.modelo (DEFAULTS quando Junior fala só fabricante):
  - **Hoymiles**: padrão HM-2250-4T (microinversor 2,25 kW 4 entradas — mais atual). Junior fala se for outro.
  - **Sungrow**: padrão SG5.0RS-L. Junior fala se for outro.
  - **Solis**: padrão S6-GR1P5K. Junior fala se for outro.
  - **Deye**: padrão SUN-5K-G. Junior fala se for outro.
- estruturaFixacao.tipo: Junior diz tipo do telhado/superficie. Mapeie:
  - "cerâmica/colonial/portuguesa" → "Telha cerâmica"
  - "metálica/sanduíche/zipada" → "Telha metálica"
  - "fibrocimento/eternit" → "Telha fibrocimento"
  - "laje/concreto" → "Laje"
  - "solo/chão/aterrada" → "Solo"
  - "carport/garagem/pergolado" → "Carport"
  - Se Junior não disser, ASSUMA "Telha cerâmica" mas adicione em missing pra confirmar.
- estruturaFixacao.material: default "Alumínio anodizado + parafusos inox" salvo se Junior especificar.

- formasPagamento: SEMPRE incluir as opções padrão:
  1. À vista PIX/TED (recomendado, sem juros)
  ${itemCartaoPrompt}
  3. Financiamento até 90× com carência até 120 dias (Solfácil/Sol Agora/BV/Santander, ~1.7%a.m., fator ~2.10)
  Calcule as parcelas do financiamento baseadas em valorTotalRs (os cartões são do sistema). Se você deixar alguma forma sem valorPrincipal, o sistema completa sozinho — nunca sai vazio pro cliente. Se Junior pedir customização ("só à vista", "12x sem juros"), respeitar.

## EXEMPLO DE FLUXO

Junior: "/proposta Marcos Silva CPF 111.222.333-44, 8.4kWp Trina 700W, valor 38500"

Você: \`{"action":"ask_more","missing":["RG","Endereço completo","Telefone","E-mail","Modelo do inversor","Modalidade","Concessionária","Fator de perda","Consumo médio (kWh/mês)"],"message":"Beleza, Marcos Silva 8,4 kWp por R$ 38.500. Falta:\\n• RG\\n• Endereço completo\\n• Telefone e e-mail\\n• Modelo do inversor (qual?)\\n• Modalidade: autoconsumo local, remoto ou compartilhado?\\n• Concessionária: Neoenergia DF ou Equatorial GO?\\n• Fator de perda (0,75 / 0,78 / 0,80? recomendado 0,78)\\n• Consumo médio mensal em kWh\\nPode mandar tudo junto."}\`

⚠️ ATENÇÃO: o exemplo acima é do fluxo **BÁSICA**. Na **PERSONALIZADA** NÃO peça "Fator de perda" — em vez dele, peça a **geração do estudo** (média mensal OU os 12 meses).

## SAÍDA E COMANDOS

Se Junior digitar "/sair", "sair", "fechar", responda \`{"action":"chat","message":"👍 Saiu do modo proposta."}\`.

Se Junior digitar "ajuda" ou "/proposta ajuda", explique o fluxo curto.`;
}

export class ProposalAssistant {
  private client: Anthropic;
  private redis: any;
  // [ECOSOF] Knowledge cru cacheado no construtor; o prompt em si é remontado
  // por getSystemPrompt() quando a flag belenus muda (/recarregar-config) —
  // fora isso a MESMA string é reusada (cache ephemeral da API continua válido).
  private kbPropostas: string;
  private kbMarcas: string;
  private systemPromptCache: { belenusAtivo: boolean; text: string } | null = null;
  private driveUploader: DriveUploader | null;
  private engineerPhone: string;
  private companyOverrides: Partial<ProposalData['empresa']>;
  private supabaseService: SupabaseService | null;
  private publicProposalBaseUrl: string;
  private metaService: MetaWhatsAppService | null;
  private casesFetcher: CasesFetcher;
  private googleNota: string;
  private googleQtdAvaliacoes: number;
  private proposalPreviewToken: string | null;

  constructor(opts: {
    apiKey: string;
    redisHost: string;
    redisPort: number;
    redisPassword: string | undefined;
    knowledgeBaseDir: string;
    driveUploader: DriveUploader | null;
    engineerPhone: string;
    companyDefaults?: Partial<ProposalData['empresa']>;
    supabaseService?: SupabaseService | null;
    publicProposalBaseUrl?: string;
    metaService?: MetaWhatsAppService | null;
    siteUrl?: string;
    googleNota?: string;
    googleQtdAvaliacoes?: number;
    // Token que destrava preview admin. Quando setado, Eva inclui um link
    // /p/:slug?eu=<token> na resposta — Junior usa esse pra revisar sem
    // virar "primeira visualizacao do cliente".
    proposalPreviewToken?: string;
  }) {
    this.client = new Anthropic({ apiKey: opts.apiKey });
    this.redis = new IORedis({
      host: opts.redisHost,
      port: opts.redisPort,
      password: opts.redisPassword,
      maxRetriesPerRequest: null,
    });

    const propostas = readFileSync(join(opts.knowledgeBaseDir, 'propostas.md'), 'utf-8');
    let marcas = '';
    try {
      marcas = readFileSync(join(opts.knowledgeBaseDir, 'produtos.md'), 'utf-8');
    } catch {
      marcas = 'Marcas oficiais: Trina, JA Solar, LONGi, Jinko, DAH, Risen (placas); Sungrow, Solis, Deye, FoxESS, SolarEdge, Huawei, GoodWe, Hoymiles, NEP (inversores). NUNCA Growatt.';
    }

    this.kbPropostas = propostas;
    this.kbMarcas = marcas;
    this.driveUploader = opts.driveUploader;
    this.engineerPhone = opts.engineerPhone;
    this.supabaseService = opts.supabaseService ?? null;
    this.publicProposalBaseUrl = (opts.publicProposalBaseUrl ?? 'https://propostas.ecosunpower.eng.br').replace(/\/$/, '');
    this.metaService = opts.metaService ?? null;

    this.companyOverrides = opts.companyDefaults ?? {};

    this.casesFetcher = new CasesFetcher({
      siteUrl: opts.siteUrl ?? 'https://ecosunpower.eng.br',
    });
    this.googleNota = opts.googleNota ?? '4.9';
    this.googleQtdAvaliacoes = opts.googleQtdAvaliacoes ?? 0;
    this.proposalPreviewToken = opts.proposalPreviewToken ?? null;
  }

  // [ECOSOF] Bloco "empresa" da proposta lido de empresa_config em RUNTIME
  // (getter, não snapshot no construtor) — /recarregar-config vale sem restart.
  // Com o seed EcoSun produz exatamente os valores hardcoded antigos
  // (telefone formatado "(61) 99697-8781", site sem https://). Único delta:
  // nome usa a razão social oficial ("ECOSUNPOWER ENERGIA SOLAR LTDA").
  private get companyDefaults(): ProposalData['empresa'] {
    const e = empresa();
    return {
      nome: e.razaoSocial,
      cnpj: e.cnpj,
      cidade: `${e.cidade}-${e.uf}`,
      telefone: formatFoneBR(e.telefoneAtendente),
      site: e.siteUrl.replace(/^https?:\/\//, ''),
      ...this.companyOverrides,
    };
  }

  // [ECOSOF] Prompt montado sob demanda: o item de cartão depende da flag
  // belenus_ativo (lida em runtime), então o texto é remontado QUANDO a flag
  // muda e cacheado enquanto ela não mudar.
  private getSystemPrompt(): string {
    const belenusAtivo = empresa().belenusAtivo;
    if (!this.systemPromptCache || this.systemPromptCache.belenusAtivo !== belenusAtivo) {
      this.systemPromptCache = { belenusAtivo, text: buildSystemPrompt(this.kbPropostas, this.kbMarcas) };
    }
    return this.systemPromptCache.text;
  }

  // [ECOSOF] Logo da proposta resolvida em RUNTIME (Storage com fallback
  // embutido, cache por path dentro de obterLogoBase64). Sem supabaseService
  // (modo offline/teste) usa direto a logo EcoSun embutida.
  private async logoProposta(): Promise<string> {
    if (!this.supabaseService) return LOGO_ECOSUNPOWER_BRANCO_BASE64;
    return obterLogoBase64(this.supabaseService.getClient());
  }

  // Mapeia o tipoCliente da proposta (string livre que pode vir variada do
  // Claude) pro enum Case.tipo. Fallback pra 'residencial' se nao bater.
  private tipoToCaseTipo(tipoCliente: string | undefined): Case['tipo'] {
    const t = (tipoCliente ?? '').toLowerCase().trim();
    if (t.includes('hibrido') || t.includes('híbrido') || t.includes('bateria')) return 'hibrido';
    if (t.includes('industrial') || t.includes('industria') || t.includes('indústria')) return 'industrial';
    if (t.includes('rural') || t.includes('agro') || t.includes('fazenda')) return 'rural';
    if (t.includes('usina') || t.includes('investimento') || t.includes('gd ')) return 'usina';
    if (t.includes('comercial') || t.includes('comercio') || t.includes('comércio')) return 'comercial';
    return 'residencial';
  }

  // Busca 3 cases similares ao tipo do cliente e renderiza o HTML da pagina
  // de prova social (6 obras em grade 3×2) que vai antes do CTA "fechar" no
  // PDF/web. Retorna '' se algo falhar — proposta segue sem prova social.
  private async buildSocialProofHtml(tipoCliente: string | undefined): Promise<string> {
    try {
      const tipo = this.tipoToCaseTipo(tipoCliente);
      // 6 obras na grade 3×2 (pedido Junior 21/07) — o fetcher completa com
      // featured de outros tipos quando o tipo do cliente não tem 6.
      const cases = await this.casesFetcher.getByTipo(tipo, 6);
      if (cases.length === 0) return '';
      return renderSocialProofPage({
        cases,
        googleNota: this.googleNota,
        googleQtdAvaliacoes: this.googleQtdAvaliacoes,
        tipoCliente: tipo,
      });
    } catch (err) {
      console.warn('[proposal/social-proof] erro montando bloco:', (err as Error).message);
      return '';
    }
  }

  // Detecta se mensagem dispara modo proposta.
  // Cobre: comando barra, palavra solta, verbos diretos, audio transcrito.
  static isProposalTrigger(text: string): boolean {
    const raw = text.toLowerCase().trim();
    if (!raw) return false;
    const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    let norm = stripAccents(raw).replace(/[^\w\s\/]/g, '').trim();
    norm = norm.replace(/^eva[\s,]+/, '').trim();

    if (/^\/(proposta|propor|gerar?\s*proposta)(\s|$)/.test(norm)) return true;

    // "proposta de serviço ..." escrito solto (o jeito que o menu ensina)
    // também abre o modo — sem isso a mensagem caía solta e a Caixa de
    // Entrada do financeiro tratava os R$ como lançamento (botões PF/PJ).
    if (/^\/?proposta\s+de\s+servicos?(\s|$)/.test(norm)) return true;

    const palavrasSoltas = ['proposta', 'propostas', 'gerar proposta', 'fazer proposta'];
    if (palavrasSoltas.includes(norm)) return true;

    if (/^(preciso |quero |vou |me ajuda a )?(gerar|fazer|montar|criar)\s+(uma\s+)?proposta(\s|$)/.test(norm)) return true;

    return false;
  }

  static isExitTrigger(text: string): boolean {
    const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    const norm = stripAccents(text.toLowerCase().trim()).replace(/[^\w\s\/]/g, '').trim();
    return [
      '/sair', '/exit', '/proposta off',
      'sair', 'fechar', 'parar', 'cancelar',
      'sair do modo', 'sair da proposta', 'finalizar', 'encerrar',
    ].includes(norm);
  }

  async isInProposalMode(phone: string): Promise<boolean> {
    const result = await this.redis.get(`proposal:${phone}`);
    return result !== null;
  }

  // State helpers — sessao estruturada (modo, tipo, anexos) separada do historico de mensagens.
  private stateKey(phone: string): string {
    return `proposal:state:${phone}`;
  }

  private async loadState(phone: string): Promise<ProposalSessionState> {
    const raw = await this.redis.get(this.stateKey(phone));
    if (!raw) return { attachments: [] };
    try {
      return JSON.parse(raw);
    } catch {
      return { attachments: [] };
    }
  }

  private async saveState(phone: string, state: ProposalSessionState): Promise<void> {
    await this.redis.setex(this.stateKey(phone), PROPOSAL_MODE_TTL_SECONDS, JSON.stringify(state));
  }

  async getSessionState(phone: string): Promise<ProposalSessionState> {
    return await this.loadState(phone);
  }

  // Comando "rascunho": resume a proposta em andamento (cliente + o que falta) pro
  // Junior, quando ele saiu pra atender um alerta e quer voltar pra onde parou.
  // Manda botões Continuar/Descartar quando houver metaService.
  async handleRascunho(phone: string): Promise<string | null> {
    const state = await this.loadState(phone);
    const histRaw = await this.redis.get(`proposal:history:${phone}`);
    let history: Array<{ role: string; content: string }> = [];
    try {
      history = histRaw ? JSON.parse(histRaw) : [];
    } catch {
      history = [];
    }

    const resumo = resumirRascunho(state, history);
    if (!resumo.emAndamento) {
      return '📭 Você não tem nenhuma proposta em andamento. Manda *menu* ou /proposta pra começar uma.';
    }

    const texto =
      `📝 Você estava montando a proposta${resumo.nomeCliente ? ' do *' + resumo.nomeCliente + '*' : ''}.` +
      (resumo.faltando.length ? `\nFalta: ${resumo.faltando.join(', ')}` : '') +
      '\n\nContinuar de onde parou?';

    // Quando há metaService, manda o resumo JÁ com os botões num balão só (evita
    // mandar texto duplicado: o handler em index.ts checa o retorno null pra não
    // reenviar). Sem metaService, retorna o texto pro caminho de sendText normal.
    if (this.metaService) {
      try {
        await this.metaService.sendInteractiveButtons(phone, texto, [
          { id: 'prop:continuar', title: '▶️ Continuar' },
          { id: 'prop:cancelar', title: '🗑️ Descartar' },
        ]);
        return null;
      } catch (err) {
        console.warn('[proposal] botoes rascunho falharam:', (err as Error).message);
      }
    }

    return texto;
  }

  // Detecta se Junior esta em modo proposta personalizada e envia midia.
  // Salva o media_id como pendente, pede legenda. Quando legenda chegar (proxima msg de texto),
  // o processProposalMessage adiciona ao state.attachments e responde confirmacao.
  async handleIncomingMedia(
    phone: string,
    mediaId: string,
    mediaType: 'image' | 'video' | 'document',
  ): Promise<string | null> {
    const state = await this.loadState(phone);
    if (state.tipo !== 'personalizada') {
      return null; // nao esta em modo personalizada — nao processa
    }

    // Se uma proposta JÁ foi gerada nesta sessao, esta nova foto inicia o estudo de
    // uma proposta NOVA — zera os anexos antigos pra eles nao vazarem (bug do "6/3",
    // fotos de um cliente contando na proposta do outro).
    if (state.geracaoConcluida) {
      state.attachments = [];
      state.geracaoConcluida = false;
    }

    // Detecta categoria. Image e video sao obvios. Document pode ser foto ou video
    // dependendo do mimeType — mas a essa altura nao temos o mimeType ainda.
    // Trata document como "video se mediaType==='video' else foto" — vai validar depois quando baixar.
    // Junior costuma mandar imagens e videos como "document" pra preservar qualidade.
    // Por enquanto marcamos como tipo provavel; processAttachment valida real quando baixar.
    const tipoProvavel: 'foto' | 'video' = mediaType === 'video' ? 'video' : 'foto';

    state.pendingMediaId = mediaId;
    state.pendingMediaType = tipoProvavel;
    await this.saveState(phone, state);

    const fotosAtuais = state.attachments.filter((a) => a.tipo === 'foto').length;
    const videosAtuais = state.attachments.filter((a) => a.tipo === 'video').length;
    const numero = tipoProvavel === 'foto' ? fotosAtuais + 1 : videosAtuais + 1;
    const limite = tipoProvavel === 'foto' ? 3 : 1;

    return [
      `📎 ${tipoProvavel === 'foto' ? `Foto ${numero}/${limite}` : 'Vídeo'} recebida.`,
      '',
      `Qual a legenda? (ex: ${tipoProvavel === 'foto' ? '"Vista superior do telhado"' : '"Simulação sombreamento 7h-18h"'})`,
      '_(curta, máx 100 caracteres)_',
    ].join('\n');
  }

  async startProposalMode(phone: string, initialMessage?: string): Promise<string> {
    await this.redis.setex(`proposal:${phone}`, PROPOSAL_MODE_TTL_SECONDS, '1');
    await this.redis.del(`proposal:history:${phone}`);
    await this.redis.del(`proposal:last:${phone}`); // não deixa "Enviar" disparar proposta de outro cliente
    await this.saveState(phone, { attachments: [] });

    // Se Junior ja descreveu junto com o trigger, vai direto pro Claude.
    const stripped = (initialMessage ?? '')
      .replace(/^\/(proposta|propor|gerar\s*proposta)\s*/i, '')
      .replace(/^(preciso |quero |vou |me ajuda a )?(gerar|fazer|montar|criar)\s+(uma\s+)?proposta\s*/i, '')
      .trim();
    if (stripped.length > 5) {
      return await this.processProposalMessage(phone, stripped);
    }

    // Sem dados iniciais — pergunta o modo de envio (primeira pergunta do fluxo novo).
    // Semeia o historico com essa pergunta como mensagem da assistente, pra quando
    // Junior responder ("ok"/"eu"/"eva"), o Claude tenha contexto e consiga capturar
    // o modoEnvio sem confusao.
    const welcomeMessage = [
      '📋 *Modo Proposta ATIVO*',
      '',
      'Quem envia essa proposta? Você ou eu mando direto pro cliente?',
      '_(default: você envia — só responde "ok" pra ir nesse)_',
      '',
      'Pra sair: `/sair`',
    ].join('\n');

    // Seed history com formato JSON que o Claude usa nas proximas turnos
    const seededAssistantTurn = JSON.stringify({
      action: 'ask_modo',
      modoEnvio: null,
      message: welcomeMessage,
    });
    await this.redis.setex(
      `proposal:history:${phone}`,
      PROPOSAL_MODE_TTL_SECONDS,
      JSON.stringify([{ role: 'assistant', content: seededAssistantTurn }]),
    );

    return welcomeMessage;
  }

  // Reabrir/ajustar uma proposta JÁ ENVIADA pelo zap: semeia a sessão com os dados
  // salvos + reopenedSlug e deixa o Junior ajustar conversando. A geração regenera
  // NO MESMO slug (mesmo link do cliente). Espelha o "Reabrir" do dashboard.
  async startReopenMode(phone: string, opts: {
    slug: string;
    numeroProposta: string;
    clienteNome: string;
    modoEnvio: ModoEnvio;
    tipo: TipoProposta;
    dadosInput: Record<string, unknown>;
    dashboardUrl?: string;
  }): Promise<string> {
    await this.redis.setex(`proposal:${phone}`, PROPOSAL_MODE_TTL_SECONDS, '1');
    await this.redis.del(`proposal:last:${phone}`);
    await this.saveState(phone, {
      attachments: [],
      modoEnvio: opts.modoEnvio,
      tipo: opts.tipo,
      reopenedSlug: opts.slug,
      reopenedNumero: opts.numeroProposta,
    });

    // Semeia o histórico: turno do usuário (contexto) + da assistente já com o
    // `data` completo no shape do Claude (ask_more), pra ele aplicar só o delta.
    const { intro, seededUser, seededAssistant } = construirSeedReopen({
      numeroProposta: opts.numeroProposta,
      clienteNome: opts.clienteNome,
      modoEnvio: opts.modoEnvio,
      tipo: opts.tipo,
      dadosInput: opts.dadosInput,
    });
    await this.redis.setex(
      `proposal:history:${phone}`,
      PROPOSAL_MODE_TTL_SECONDS,
      JSON.stringify([
        { role: 'user', content: seededUser },
        { role: 'assistant', content: seededAssistant },
      ]),
    );

    return opts.dashboardUrl ? `${intro}\n\nPrefere no painel? ${opts.dashboardUrl}` : intro;
  }

  // Clonar uma proposta pra um NOVO cliente: carrega o kit/sistema/valores da base,
  // limpa a identidade do cliente, e gera uma proposta NOVA (SEM reopenedSlug → slug
  // e número novos). Junior só passa o cliente novo. Ágil pra rodar vários parecidos.
  async startCloneMode(phone: string, opts: {
    numeroPropostaBase: string;
    clienteNomeBase: string;
    modoEnvio: ModoEnvio;
    tipo: TipoProposta;
    dadosInput: Record<string, unknown>;
  }): Promise<string> {
    await this.redis.setex(`proposal:${phone}`, PROPOSAL_MODE_TTL_SECONDS, '1');
    await this.redis.del(`proposal:last:${phone}`);
    // SEM reopenedSlug/reopenedNumero → a geração cria proposta nova.
    await this.saveState(phone, { attachments: [], modoEnvio: opts.modoEnvio, tipo: opts.tipo });

    const { intro, seededUser, seededAssistant } = construirSeedClone({
      numeroPropostaBase: opts.numeroPropostaBase,
      clienteNomeBase: opts.clienteNomeBase,
      modoEnvio: opts.modoEnvio,
      tipo: opts.tipo,
      dadosInput: opts.dadosInput,
    });
    await this.redis.setex(
      `proposal:history:${phone}`,
      PROPOSAL_MODE_TTL_SECONDS,
      JSON.stringify([
        { role: 'user', content: seededUser },
        { role: 'assistant', content: seededAssistant },
      ]),
    );
    return intro;
  }

  async exitProposalMode(phone: string): Promise<void> {
    await this.redis.del(`proposal:${phone}`);
    await this.redis.del(`proposal:history:${phone}`);
    await this.redis.del(`proposal:last:${phone}`);
    await this.redis.del(this.stateKey(phone));
  }

  // "Nova proposta" (pós-geração): começa LIMPO mas PRESERVA modo de envio e tipo da
  // sessão anterior — Junior costuma bater várias propostas seguidas no mesmo modo,
  // não faz sentido reperguntar a cada cliente. Zera fotos, histórico e proposta gerada.
  async novaPropostaPreservandoModo(phone: string): Promise<string> {
    const anterior = await this.loadState(phone);
    if (!anterior.modoEnvio) return await this.startProposalMode(phone); // sem modo salvo: fluxo normal
    await this.redis.setex(`proposal:${phone}`, PROPOSAL_MODE_TTL_SECONDS, '1');
    await this.redis.del(`proposal:last:${phone}`);
    await this.saveState(phone, { attachments: [], modoEnvio: anterior.modoEnvio, tipo: anterior.tipo });

    const modoTxt = anterior.modoEnvio === 'eva_envia' ? 'eu envio pro cliente' : 'você envia';
    const message = [
      '🆕 *Nova proposta* — comecei do zero (fotos e dados limpos).',
      `_Mantive: ${modoTxt}${anterior.tipo ? ` · ${anterior.tipo}` : ''}._`,
      '',
      'Manda os dados do novo cliente.',
    ].join('\n');

    // Semeia o histórico com o modo/tipo JÁ definidos, pra Eva não reperguntar o modo
    // (ela monta a resposta a partir do histórico, não do estado) e já ir pros dados.
    const seed = JSON.stringify({ action: 'ask_more', modoEnvio: anterior.modoEnvio, tipo: anterior.tipo ?? 'basica', message });
    await this.redis.setex(`proposal:history:${phone}`, PROPOSAL_MODE_TTL_SECONDS, JSON.stringify([{ role: 'assistant', content: seed }]));
    return message;
  }

  async processProposalMessage(phone: string, message: string): Promise<string> {
    // Botoes interativos WABA chegam como text com id "prop:gerar" / "prop:ajustar"
    // / "prop:cancelar". Normaliza pra texto natural ANTES de qualquer outro
    // intercept — assim o resto do fluxo funciona igual ao Junior digitar a palavra.
    const btnMatch = message.trim().toLowerCase().match(/^prop:(gerar|ajustar|cancelar|enviar|nova|continuar)$/);
    if (btnMatch) {
      const acao = btnMatch[1];
      if (acao === 'continuar') {
        // Junior clicou "Continuar" no resumo do rascunho: a sessão segue viva,
        // não muda estado. Só pede os dados que faltam pra fechar.
        return 'Beleza — manda os dados que faltam pra eu fechar a proposta.';
      } else if (acao === 'gerar') {
        message = 'gerar';
      } else if (acao === 'ajustar') {
        // Ajustando a proposta atual: tira o flag de "gerada" pra que anexar uma foto
        // agora conte como ajuste DESTA proposta (nao zere o rascunho).
        const st = await this.loadState(phone);
        if (st.geracaoConcluida) { st.geracaoConcluida = false; await this.saveState(phone, st); }
        return 'Beleza, me fala o que ajustar (ex: "tarifa pra 1.10", "troca pro inversor X", "muda pra 10 kWp").';
      } else if (acao === 'enviar') {
        const sendResult = await this.tryDispatchToClient(phone);
        return sendResult ?? '⚠️ Nao consegui enviar agora — confere se a proposta foi gerada no modo "Eva envia".';
      } else if (acao === 'nova') {
        // Caminho LIMPO entre clientes: zera fotos, historico e proposta gerada, mas
        // preserva o modo/tipo (Junior bate varias seguidas no mesmo modo).
        return await this.novaPropostaPreservandoModo(phone);
      } else if (acao === 'cancelar') {
        await this.exitProposalMode(phone);
        return '🗑️ Proposta cancelada. Manda /proposta quando quiser comecar outra.';
      }
    }

    if (ProposalAssistant.isExitTrigger(message)) {
      await this.exitProposalMode(phone);
      return '👍 Saiu do modo proposta.';
    }

    // Intercepta legenda quando ha midia pendente esperando descricao.
    // Aceita qualquer frase: 1 ate 250 chars, ou "pula"/"sem legenda" pra deixar vazio.
    {
      const state = await this.loadState(phone);
      if (state.pendingMediaId && state.pendingMediaType) {
        let legenda = message.trim();

        // Junior pode pular: usa fallback automatico
        if (/^(pula|pular|sem legenda|nada|skip|-)$/i.test(legenda)) {
          const fotosAtuais = state.attachments.filter((a) => a.tipo === 'foto').length;
          legenda = state.pendingMediaType === 'foto'
            ? `Estudo ${fotosAtuais + 1}`
            : 'Simulação';
        }

        if (legenda.length === 0) {
          return '⚠️ Manda algum texto pra legenda — ou responde "pula" pra usar legenda padrão.';
        }
        if (legenda.length > 250) {
          legenda = legenda.slice(0, 247) + '...';
        }

        state.attachments.push({
          tipo: state.pendingMediaType,
          legenda,
          mediaIdWaba: state.pendingMediaId,
        });
        state.pendingMediaId = undefined;
        state.pendingMediaType = undefined;
        await this.saveState(phone, state);

        const fotos = state.attachments.filter((a) => a.tipo === 'foto').length;
        const videos = state.attachments.filter((a) => a.tipo === 'video').length;
        const partes: string[] = [];
        if (fotos > 0) partes.push(`${fotos}/3 fotos`);
        if (videos > 0) partes.push(`${videos}/1 vídeo`);
        return `✅ Anexado: "${legenda}"\n\nTotal: ${partes.join(' + ')}.\n\nManda mais arquivo(s) ou continue com os dados do cliente/sistema.`;
      }
    }

    // Intercepta "enviar"/"manda"/"envia" quando ha proposta gerada e modo eva_envia.
    // Isso evita ir pro Claude pra cada confirmacao — Junior diz "enviar" e Eva dispara.
    if (/^(enviar|envia|manda|mandar|mandar pro cliente|envia pro cliente|aprovado)\s*$/i.test(message.trim())) {
      const sendResult = await this.tryDispatchToClient(phone);
      if (sendResult !== null) return sendResult;
      // se retornou null, modo nao era eva_envia ou nao havia proposta — segue fluxo normal Claude
    }

    const histRaw = await this.redis.get(`proposal:history:${phone}`);
    const history: ProposalMessage[] = histRaw ? JSON.parse(histRaw) : [];
    history.push({ role: 'user', content: message });

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2500,
      // [ECOSOF] empresa() lida POR CHAMADA; string estável entre chamadas
      // mantém o cache ephemeral válido enquanto a config não muda.
      system: [{ type: 'text', text: interpolarEmpresa(this.getSystemPrompt(), empresa()), cache_control: { type: 'ephemeral' } }],
      messages: history,
    }, { timeout: 30_000 });

    const rawReply = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim();

    let parsed: ClaudeResponse;
    try {
      // Aceita resposta com ou sem code fence
      const jsonMatch = rawReply.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : rawReply;
      parsed = JSON.parse(jsonStr);
    } catch (err) {
      console.warn('[proposal] Claude nao retornou JSON valido:', rawReply.slice(0, 200));
      // fallback: trata como chat puro
      parsed = { action: 'chat', message: rawReply };
    }

    history.push({ role: 'assistant', content: rawReply });
    const trimmed = history.slice(-30);
    await this.redis.setex(`proposal:history:${phone}`, PROPOSAL_MODE_TTL_SECONDS, JSON.stringify(trimmed));
    await this.redis.setex(`proposal:${phone}`, PROPOSAL_MODE_TTL_SECONDS, '1');

    // Persiste modoEnvio e tipo no estado da sessao quando Claude retornar valor concreto.
    // null/undefined nao sobrescreve (Claude usa null em ask_modo/ask_tipo).
    if (parsed.modoEnvio || parsed.tipo) {
      const state = await this.loadState(phone);
      if (parsed.modoEnvio) state.modoEnvio = parsed.modoEnvio;
      if (parsed.tipo) state.tipo = parsed.tipo;
      await this.saveState(phone, state);
    }

    if (parsed.action === 'confirm_generate' && parsed.data) {
      return await this.generateProposal(phone, parsed.data, parsed.message);
    }

    // Quando Claude monta o resumo dos dados (ready_to_generate), manda botoes
    // interativos COMPLEMENTARES ao texto pra Junior aprovar com 1 toque.
    // Texto principal vai pelo return; botoes via metaService direto. Sem
    // fallback no catch — o texto ja diz "Manda gerar...". Regra
    // feedback_botoes_zap.md: toda acao da Eva pro zap deve ter botao.
    if (parsed.action === 'ready_to_generate' && this.metaService) {
      try {
        await this.metaService.sendInteractiveButtons(
          phone,
          'Confirmar e gerar a proposta?',
          [
            { id: 'prop:gerar', title: '✅ Gerar' },
            { id: 'prop:ajustar', title: '✏️ Ajustar' },
            { id: 'prop:cancelar', title: '❌ Cancelar' },
          ],
          'Ou digite "ajusta X" pra detalhar',
        );
      } catch (err) {
        console.warn('[proposal] botoes ready_to_generate falharam:', (err as Error).message);
      }
    }

    return parsed.message ?? 'Ok.';
  }

  // Quando Junior disser "enviar" (modo eva_envia), Eva dispara pro telefone
  // do cliente: saudacao + link web + PDF como documento.
  // Retorna null se contexto nao se aplica (modo errado, sem proposta salva, etc) —
  // nesse caso o handler segue o fluxo normal pro Claude.
  private async tryDispatchToClient(phone: string): Promise<string | null> {
    const state = await this.loadState(phone);
    if (state.modoEnvio !== 'eva_envia') return null;

    const lastRaw = await this.redis.get(`proposal:last:${phone}`);
    if (!lastRaw) return null;

    if (!this.metaService) {
      return '⚠️ MetaWhatsAppService nao configurado — nao consigo mandar pro cliente. Junior, manda manualmente pelo zap.';
    }

    let last: { data: any; proposalData: ProposalData; publicUrl: string | null; upload: any };
    try {
      last = JSON.parse(lastRaw);
    } catch {
      return '⚠️ Erro ao carregar proposta salva. Gera de novo, por favor.';
    }

    const telefone = last.data?.telefoneCliente;
    const nome = last.data?.nomeCliente;
    if (!telefone) return '⚠️ Telefone do cliente nao foi capturado. Re-gera a proposta com o telefone certo.';
    if (!last.publicUrl) return '⚠️ Link publico nao disponivel. Re-gera com Supabase configurado.';

    // Re-gera o PDF buffer (nao salvamos buffer no Redis pra economizar memoria).
    try {
      let pdfBuffer: Buffer;
      let economiaMensalEnvio: number | null = null;
      let economiaRemotaEnvio: number | null = null;
      if (isPropostaSoServico(last.data)) {
        // Proposta SÓ-SERVIÇO: re-renderiza pelo layout de serviço — NUNCA o solar,
        // que sairia cheio de "R$ NaN" (sem potência/equipamentos). Reusa o
        // numeroProposta/dataProposta salvos pra o PDF bater com o link web já hospedado.
        // Reusa os serviços JÁ resolvidos (com a imagem IA) salvos em proposalData —
        // re-mapear de last.data perderia o imagemUrl e o PDF sairia sem a imagem que
        // a página web tem. Fallback re-mapeia só se proposalData vier sem serviços.
        const servicos = (last.proposalData.servicos?.length
          ? last.proposalData.servicos
          : mapServicosTitulos(last.data.servicos) ?? []) as ServicoItem[];
        const serviceData = buildServiceOnlyData({
          numeroProposta: last.proposalData.numeroProposta,
          dataProposta: (last.proposalData as any).dataProposta ?? new Date().toLocaleDateString('pt-BR'),
          data: last.data,
          servicos,
          empresa: this.companyDefaults,
          criarPagamentoPadrao: (t) => servicePaymentOptions(t),
        });
        // hero/rodapé da proposta só-serviço usam a logo DARK fixa; não busca logo no Storage à toa.
        pdfBuffer = await htmlToPdf(renderServiceOnlyHTML(serviceData), { waitForChartMs: 0 });
      } else {
        const calcInput = this.dataToCalculatorInput(last.data);
        const calculations = calcular(calcInput);
        economiaMensalEnvio = calculations.economiaMensal;
        economiaRemotaEnvio = calculations.economiaRemotaMensal || null;
        const socialProofHtml = await this.buildSocialProofHtml(last.proposalData.tipoCliente);
        const html = renderProposalHTML(last.proposalData, calculations, socialProofHtml, await this.logoProposta());
        pdfBuffer = await htmlToPdf(html, { waitForChartMs: 2000 });
      }

      const result = await enviarPropostaParaCliente(this.metaService, {
        telefoneCliente: telefone,
        nomeCliente: nome,
        linkWebPublico: last.publicUrl,
        pdfBuffer,
        pdfFilename: `Proposta-${empresa().nomeFantasia.replace(/[^a-zA-Z0-9]/g, '')}-${nome.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '-')}.pdf`,
        economiaMensal: economiaMensalEnvio,
        economiaRemotaMensal: economiaRemotaEnvio,
      });

      if (!result.ok) {
        return `⚠️ Erro ao enviar pro cliente: ${result.reason.slice(0, 150)}`;
      }

      // Limpa estado depois do envio (sucesso = ciclo encerrado)
      await this.exitProposalMode(phone);
      return `✅ Proposta enviada pra ${nome} (${telefone}). Vou ficar de olho se ele responde.`;
    } catch (err) {
      return `⚠️ Erro ao gerar PDF pra envio: ${(err as Error).message.slice(0, 150)}`;
    }
  }

  // Gera proposta a partir de input estruturado, sem dependencia de phone/Redis.
  // Usado pela tela admin A4 e pelo shim privado generateProposal (zap).
  // Faz: validate -> calc -> render -> PDF -> upload Drive (paralelo) + Supabase (paralelo).
  // NAO toca Redis, NAO retorna string formatada — quem chama formata.
  // [Fase 2 B1b] roda inteira DENTRO do contexto da empresa (comEmpresaDe):
  // todos os empresa() do caminho (template/cartão/pagamento/logo/companyDefaults)
  // respondem pela config do tenant. EcoSun/ausente = idêntico ao de sempre.
  async generateProposalCore(input: GenerateProposalCoreInput): Promise<GenerateProposalCoreResult> {
    return comEmpresaDe(input.companyId, () => this.generateProposalCoreImpl(input));
  }

  private async generateProposalCoreImpl(input: GenerateProposalCoreInput): Promise<GenerateProposalCoreResult> {
    if (!this.driveUploader && !this.supabaseService) {
      throw new Error('Nenhum destino configurado (Drive ou Supabase)');
    }

    const { modoEnvio, tipo, attachments, reopenSlug } = input;
    // Comparação de 2 sistemas: garante que a Opção A esteja no topo do `data`
    // (o extrator às vezes só preenche comparacao[]). Sem isso a validação abaixo
    // estourava "potenciaKwp inválido: NaN". Idempotente quando o topo já vem cheio.
    const data = hydrarOpcaoPrincipalDaComparacao(input.data);

    // [Corretor] Conserta o português dos textos livres que o Junior ditou e o
    // cliente vê (descrições de serviço/estrutura, observações, pagamento) — SEM
    // mudar número/valor/nome/sentido (rede de segurança no corretor). Forward-only:
    // só na geração NOVA — pula no reopen/clone (reopenSlug) pra não re-mexer em
    // texto já salvo (e não gastar IA à toa). Nunca quebra (degrada pro original).
    if (!reopenSlug) await this.corrigirTextosDaProposta(data);

    // Proposta SÓ-SERVIÇO (sem solar): desvia pro layout de serviço e pula todo
    // o cálculo solar (que não se aplica). Resolve o caso Edmilson.
    if (isPropostaSoServico(data)) {
      const servicos = mapServicosTitulos(data.servicos)!;
      return await this.generateServiceOnlyCore({ data, servicos, modoEnvio, companyId: input.companyId ?? null });
    }

    const calcInput = this.dataToCalculatorInput(data);

    // Guard: nunca gerar proposta sem nome do cliente (protege os 3 fluxos —
    // proposta normal, reabrir e clonar; no clone a identidade começa vazia).
    if (!data.nomeCliente || !String(data.nomeCliente).trim()) {
      throw new Error('Falta o nome do cliente pra gerar a proposta.');
    }

    const ensureNum = (name: string, v: number) => {
      if (!isFinite(v) || v <= 0) throw new Error(`Campo "${name}" inválido: ${v}`);
    };
    ensureNum('potenciaKwp', calcInput.potenciaKwp);
    ensureNum('fatorPerda', calcInput.fatorPerda);
    ensureNum('consumoMensalKwh', calcInput.consumoMensalKwh);
    ensureNum('tarifaRsKwh', calcInput.tarifaRsKwh);
    ensureNum('valorTotalRs', calcInput.valorTotalRs);

    // Quando a proposta TEM estudo (anexos PVSol/PVsyst), a geração TEM de ser a do estudo,
    // nunca o cálculo padrão HSP×potência (que enganaria o cliente). Se não veio o número
    // do estudo, falha claro em vez de gerar com a estimativa. (Item: geração sempre do estudo.)
    const temEstudo = tipo === 'personalizada' && (attachments?.length ?? 0) > 0;
    if (temEstudo) {
      // Aceita a geração do estudo como número único (geracaoMensalKwhOverride) OU
      // como os 12 meses (geracaoMensalKwhDistribuidoOverride). calcInput já resolveu
      // os dois — inclusive a média do mês-a-mês vira o override único.
      const temGeracaoEstudo =
        (!!calcInput.geracaoMensalKwhOverride && calcInput.geracaoMensalKwhOverride > 0)
        || Array.isArray(calcInput.geracaoMensalKwhDistribuidoOverride);
      if (!temGeracaoEstudo) {
        throw new Error('Proposta com estudo precisa da geração do estudo (PVSol) — informe a geração média mensal OU os 12 meses.');
      }
    }

    const calculations = calcular(calcInput);
    const proposalData = this.dataToProposalData(data, calculations);
    // Reabrir: mantém o número da proposta original (não gera um novo a cada ajuste).
    if (reopenSlug && input.numeroProposta) proposalData.numeroProposta = input.numeroProposta;

    // Comparação de 2 sistemas: o sistema calcula geração/payback de cada opção e
    // monta o quadro lado a lado, escondendo a análise pesada (que reflete só a
    // opção principal). data.* é a Opção A; data.comparacao traz as 2 opções.
    const opcaoComparacaoValida = (op: any) => Number(op?.potenciaKwp) > 0 && Number(op?.valorTotalRs) > 0;
    if (Array.isArray(data.comparacao) && data.comparacao.length >= 2
        && data.comparacao.slice(0, 2).every(opcaoComparacaoValida)) {
      const opcoes = data.comparacao.slice(0, 2).map((op: any, i: number) => {
        const ci = this.dataToCalculatorInput(montarInputOpcaoComparacao(data, op, i));
        const c = calcular(ci);
        const numOuUndef = (v: unknown) => (Number(v) > 0 ? Number(v) : undefined);
        return buildComparacaoOpcao(
          op.rotulo ?? `Opção ${String.fromCharCode(65 + i)}`,
          {
            potenciaKwp: Number(op.potenciaKwp),
            moduloFabricante: op.modulo?.fabricante ?? data.modulo?.fabricante,
            moduloModelo: op.modulo?.modelo ?? data.modulo?.modelo,
            moduloPotenciaW: numOuUndef(op.modulo?.potenciaW ?? data.modulo?.potenciaW),
            moduloQuantidade: numOuUndef(op.modulo?.quantidade ?? data.modulo?.quantidade),
            inversorFabricante: op.inversor?.fabricante ?? data.inversor?.fabricante,
            inversorModelo: op.inversor?.modelo ?? data.inversor?.modelo,
            inversorQuantidade: numOuUndef(op.inversor?.quantidade ?? data.inversor?.quantidade),
            // Bateria da PRÓPRIA opção (A herda a do topo; B só se trouxer a dela —
            // mesma regra do montarInputOpcaoComparacao, pro card bater com o cálculo).
            // `bateria: null` explícito na opção = SEM bateria (não cai no topo).
            bateria: (op.bateria !== undefined) ? op.bateria : (i === 0 ? data.bateria : undefined),
            valorTotalRs: Number(op.valorTotalRs),
            // Pagamento da PRÓPRIA opção (cartão parceria 24× + financiamento até 90×)
            // fica dentro do quadro, já que no modo comparação a seção de pagamento de
            // 1 valor some — assim o cliente não perde nenhuma forma ao comparar.
            // (O cartão 18× Sol Fácil aparece na proposta normal; no quadro comparativo
            // mostramos um cartão só pra não poluir.)
            cartaoParcelaRs: Math.round(ProposalAssistant.parcelaCartaoSolar(Number(op.valorTotalRs))),
            cartaoParcelas: ProposalAssistant.parcelasCartaoSolar(),
            financiamentoParcelaRs: Math.round(ProposalAssistant.parcelaTabelaPrice(
              Number(op.valorTotalRs), ProposalAssistant.TAXA_FINANC_AM, 90, ProposalAssistant.MESES_CARENCIA_FINANC,
            )),
            // Consumo que ESTA opção usou no cálculo (cenário próprio quando o Junior
            // varia; o card só mostra quando as opções diferem entre si). Só valores
            // EXPLÍCITOS — o fallback derivado do calculator não vira "consumo" no card.
            consumoMensalKwh: numOuUndef(op.consumoMensalKwh ?? data.consumoMensalKwh),
          },
          c,
        );
      });
      proposalData.comparacaoHtml = renderComparacaoSolar(opcoes);
      proposalData.modoComparacao = true;
    }

    // Reabrir/ajustar: regenera NO MESMO slug (UPDATE), não cria registro novo.
    const isReopen = !!reopenSlug;
    const slug = reopenSlug ?? randomBytes(12).toString('base64url');
    proposalData.tipo = tipo;

    const temAnexos = tipo === 'personalizada'
      && (attachments?.length ?? 0) > 0
      && !!this.supabaseService;

    // No reopen NÃO fazemos o INSERT prévio (o registro já existe) — processamos
    // os anexos novos direto sobre o slug existente. Sem anexos novos no reopen, o
    // estudo sai sem fotos (esperado nesta fatia; o form avisa).
    if (temAnexos) {
      if (!isReopen) {
        await this.supabaseService!.savePropostaPublica({
          slug,
          numeroProposta: proposalData.numeroProposta,
          clienteNome: data.nomeCliente,
          clienteTelefone: data.telefoneCliente,
          htmlContent: '<!doctype html><html><body>Generating...</body></html>',
          dadosInput: undefined,
          tipo,
          modoEnvio,
          companyId: input.companyId ?? null,
        });
      }

      try {
        proposalData.estudoPersonalizado = await this.processarAnexosFromBuffer(slug, attachments!);
      } catch (err) {
        console.warn('[proposal] Falha ao processar anexos (admin):', (err as Error).message);
      }
    }

    const socialProofHtml = await this.buildSocialProofHtml(proposalData.tipoCliente);
    const html = renderProposalHTML(proposalData, calculations, socialProofHtml, await this.logoProposta());
    const pdfBuffer = await htmlToPdf(html, { waitForChartMs: 2000 });

    // No reopen pulamos o Drive (foco é atualizar a web no mesmo slug); fora dele
    // o upload roda igual.
    const drivePromise = (this.driveUploader && !isReopen)
      ? this.driveUploader.uploadProposal({
          nomeCliente: data.nomeCliente,
          numeroProposta: proposalData.numeroProposta,
          pdfBuffer,
          htmlContent: html,
          inputDataJson: JSON.stringify({ data, calcInput }, null, 2),
          shareWithEmail: data.emailCliente,
        })
      : Promise.reject(new Error(isReopen ? 'Drive pulado no reopen' : 'Drive uploader nao configurado'));

    // Salva o `data` COMPLETO (pra reabrir) + investimento.total derivado (KPIs do dashboard).
    const dadosInputMinimo: Record<string, unknown> = montarDadosInputCompleto(
      data as Record<string, unknown>,
      Number(data.valorTotalRs) + somaServicosExtras(mapServicosFromClaude(data.servicos)),
    );

    const supabasePromise = this.supabaseService
      ? (isReopen
          // Reabrir: UPDATE no mesmo registro (html + dados_input). Não cria novo.
          ? this.supabaseService.updatePropostaPublica(slug, { htmlContent: html, dadosInput: dadosInputMinimo }).then(() => ({ id: slug, expiresAt: '' }))
          : (temAnexos
              // Com estudo: o registro já foi criado (placeholder). Atualiza HTML
              // E dados_input — senão a proposta personalizada fica sem dados e o
              // "Reabrir / Ajustar" falha com "sem dados pra reabrir".
              ? this.supabaseService.updatePropostaPublica(slug, { htmlContent: html, dadosInput: dadosInputMinimo }).then(() => ({ id: slug, expiresAt: '' }))
              : this.supabaseService.savePropostaPublica({
                  slug,
                  numeroProposta: proposalData.numeroProposta,
                  clienteNome: data.nomeCliente,
                  clienteTelefone: data.telefoneCliente,
                  htmlContent: html,
                  dadosInput: dadosInputMinimo,
                  tipo,
                  modoEnvio,
                  companyId: input.companyId ?? null,
                })))
      : Promise.reject(new Error('Supabase service nao configurado'));

    const [uploadResult, publicResult] = await Promise.allSettled([drivePromise, supabasePromise]);

    const upload = uploadResult.status === 'fulfilled' ? uploadResult.value : null;
    const publicSaved = publicResult.status === 'fulfilled';
    const publicUrl = publicSaved ? `${this.publicProposalBaseUrl}/p/${slug}` : null;

    if (!upload && !publicSaved) {
      const driveErr = uploadResult.status === 'rejected' ? (uploadResult.reason as Error).message : 'ok';
      const pubErr = publicResult.status === 'rejected' ? (publicResult.reason as Error).message : 'ok';
      throw new Error(`Drive: ${driveErr} | Web: ${pubErr}`);
    }
    if (!upload) console.warn('[proposal] Drive upload falhou:', (uploadResult as PromiseRejectedResult).reason);
    if (!publicSaved) console.warn('[proposal] Save Supabase falhou:', (publicResult as PromiseRejectedResult).reason);

    return {
      slug,
      publicUrl,
      pdfBuffer,
      driveResult: upload ? { pdfWebViewLink: upload.pdfWebViewLink, htmlWebViewLink: upload.htmlWebViewLink } : null,
      proposalData,
      calculations,
    };
  }

  // Gera a imagem do serviço por IA (Higgsfield) e sobe no Storage. Best-effort:
  // sem credencial/supabase ou qualquer falha => undefined (proposta sai sem imagem,
  // não quebra). Eva só descreve; a geração é opcional e nunca trava o fluxo.
  private async gerarImagemServico(slug: string, servico: ServicoItem): Promise<string | undefined> {
    const creds = process.env.HIGGSFIELD_CREDENTIALS;
    if (!creds || !this.supabaseService) return undefined;
    try {
      const gen = new HiggsfieldImageGenerator(creds);
      const { url } = await gen.generate({ prompt: buildServiceImagePrompt(servico), aspectRatio: '3:2' });
      const { bytes, contentType } = await gen.downloadImage(url);
      const filename = `servico-0.${contentType.includes('png') ? 'png' : 'jpg'}`;
      const { signedUrl } = await uploadToStorage(this.supabaseService.getClient(), {
        buffer: bytes, propostaSlug: slug, filename, mimeType: contentType,
      });
      return signedUrl;
    } catch (err) {
      console.warn('[proposal] (servico) geração de imagem falhou:', (err as Error).message);
      return undefined;
    }
  }

  // Gera uma proposta SÓ-SERVIÇO (sem solar): layout elegante de serviço, PDF e
  // hospedagem (Drive + web pública). Espelha o fim de generateProposalCore, mas
  // sem cálculo solar — devolve calculations=null. Resolve o caso Edmilson.
  private async generateServiceOnlyCore(input: {
    data: any; servicos: ServicoItem[]; modoEnvio: ModoEnvio; companyId?: string | null;
  }): Promise<GenerateProposalCoreResult> {
    const { data, servicos, modoEnvio } = input;
    const ano = new Date().getFullYear();
    const numeroProposta = `${ano}-${Date.now().toString(36).toUpperCase().slice(-5)}`;
    const slug = randomBytes(12).toString('base64url');

    // Imagem do serviço: SÓ a foto REAL que o Junior anexar (data.servicoImagemUrl).
    // Geração por IA desligada — ficava "cara de IA", desproporcional e não-brasileira
    // (feedback Junior 06/06). Sem foto real => proposta sai limpa, sem imagem.
    if (servicos[0] && !servicos[0].imagemUrl && typeof data.servicoImagemUrl === 'string') {
      servicos[0].imagemUrl = data.servicoImagemUrl;
    }

    const serviceData = buildServiceOnlyData({
      numeroProposta,
      dataProposta: new Date().toLocaleDateString('pt-BR'),
      data,
      servicos,
      empresa: this.companyDefaults,
      // Serviço usa as formas PRÓPRIAS (PIX à vista, 50/50, cartão 12x maquininha) —
      // NUNCA o pagamento solar (financiamento bancário é só no solar).
      criarPagamentoPadrao: (total) => servicePaymentOptions(total),
    });

    // hero/rodapé da proposta só-serviço usam a logo DARK fixa; não busca logo no Storage à toa.
    const html = renderServiceOnlyHTML(serviceData);
    const pdfBuffer = await htmlToPdf(html, { waitForChartMs: 0 });

    const drivePromise = this.driveUploader
      ? this.driveUploader.uploadProposal({
          nomeCliente: data.nomeCliente,
          numeroProposta,
          pdfBuffer,
          htmlContent: html,
          inputDataJson: JSON.stringify({ servicos, observacoes: observacoesDaProposta(data.observacoes ?? data.observacao) }, null, 2),
          shareWithEmail: data.emailCliente,
        })
      : Promise.reject(new Error('Drive uploader nao configurado'));

    const supabasePromise = this.supabaseService
      ? this.supabaseService.savePropostaPublica({
          slug,
          numeroProposta,
          clienteNome: data.nomeCliente,
          clienteTelefone: data.telefoneCliente,
          htmlContent: html,
          dadosInput: { comercial: { servicos, soServico: true }, observacoes: observacoesDaProposta(data.observacoes ?? data.observacao) },
          tipo: 'basica',
          modoEnvio,
          companyId: input.companyId ?? null,
        })
      : Promise.reject(new Error('Supabase service nao configurado'));

    const [uploadResult, publicResult] = await Promise.allSettled([drivePromise, supabasePromise]);
    const upload = uploadResult.status === 'fulfilled' ? uploadResult.value : null;
    const publicSaved = publicResult.status === 'fulfilled';
    const publicUrl = publicSaved ? `${this.publicProposalBaseUrl}/p/${slug}` : null;

    if (!upload && !publicSaved) {
      const driveErr = uploadResult.status === 'rejected' ? (uploadResult.reason as Error).message : 'ok';
      const pubErr = publicResult.status === 'rejected' ? (publicResult.reason as Error).message : 'ok';
      throw new Error(`Drive: ${driveErr} | Web: ${pubErr}`);
    }
    if (!upload) console.warn('[proposal] (servico) Drive upload falhou:', (uploadResult as PromiseRejectedResult).reason);
    if (!publicSaved) console.warn('[proposal] (servico) Save Supabase falhou:', (publicResult as PromiseRejectedResult).reason);

    // proposalData/calculations são do mundo solar; no só-serviço devolvemos um
    // proposalData mínimo (não usado pelo caller neste caminho) e calculations=null.
    return {
      slug,
      publicUrl,
      pdfBuffer,
      driveResult: upload ? { pdfWebViewLink: upload.pdfWebViewLink, htmlWebViewLink: upload.htmlWebViewLink } : null,
      proposalData: { ...serviceData, potenciaKwp: 0 } as unknown as ProposalData,
      calculations: null,
    };
  }

  // Variante de processarAnexosPendentes que aceita buffers ja em maos (tela admin).
  // O fluxo zap baixa WABA media -> buffer no shim generateProposal antes de chamar core.
  private async processarAnexosFromBuffer(
    slug: string,
    attachments: Array<{ buffer: Buffer; mimeType: string; legenda: string }>,
  ): Promise<NonNullable<ProposalData['estudoPersonalizado']>> {
    if (!this.supabaseService) throw new Error('SupabaseService nao configurado');
    const supabase = this.supabaseService.getClient();

    const fotos: Array<{ url: string; legenda: string; ordem: number }> = [];
    let video: NonNullable<ProposalData['estudoPersonalizado']>['video'] | undefined;
    let fotoCount = 0;
    let videoCount = 0;

    for (const att of attachments) {
      const result = await processAttachmentFromBuffer(supabase, {
        buffer: att.buffer,
        mimeType: att.mimeType,
        proposalSlug: slug,
        legenda: att.legenda,
        fotoCount,
        videoCount,
      });
      if (!result.ok) {
        console.warn('[proposal] processAttachmentFromBuffer falhou:', result.reason);
        continue;
      }
      const r = result.record;
      if (r.tipo === 'foto') {
        fotoCount++;
        fotos.push({
          url: await getSignedUrlFromPath(supabase, r.storagePath),
          legenda: r.legenda,
          ordem: r.ordem,
        });
      } else {
        videoCount++;
        video = {
          thumbnailUrl: r.thumbnailPath ? await getSignedUrlFromPath(supabase, r.thumbnailPath) : '',
          legenda: r.legenda,
          webVideoUrl: await getSignedUrlFromPath(supabase, r.storagePath),
        };
      }
    }

    fotos.sort((a, b) => a.ordem - b.ordem);

    let qrCodeDataUrl: string | undefined;
    if (video) {
      const linkPublico = `${this.publicProposalBaseUrl}/p/${slug}`;
      qrCodeDataUrl = await gerarQrCodeDataUrl(linkPublico);
    }

    return { fotos, video, qrCodeDataUrl };
  }

  // Wrapper pro fluxo zap: carrega state Redis + baixa anexos WABA + chama core +
  // salva proposal:last:${phone} + formata string pra mandar pelo zap.
  private async generateProposal(phone: string, data: any, _confirmMsg: string): Promise<string> {
    try {
      // Hidrata a Opção A no topo a partir de comparacao[0] ANTES de salvar no Redis,
      // pra que o caminho de envio (re-render de proposal:last) também tenha a potência.
      data = hydrarOpcaoPrincipalDaComparacao(data);
      const sessionState = await this.loadState(phone);
      const modoEnvio: ModoEnvio = sessionState.modoEnvio ?? 'junior_envia';
      const tipo: TipoProposta = sessionState.tipo ?? 'basica';

      let attachments: GenerateProposalCoreInput['attachments'];
      if (tipo === 'personalizada' && sessionState.attachments.length > 0) {
        const accessToken = process.env.META_WABA_ACCESS_TOKEN;
        if (!accessToken) throw new Error('META_WABA_ACCESS_TOKEN nao configurado');
        attachments = [];
        for (const att of sessionState.attachments) {
          const dl = await downloadWabaMedia({ mediaId: att.mediaIdWaba, accessToken });
          attachments.push({ buffer: dl.buffer, mimeType: dl.mimeType, legenda: att.legenda });
        }
      }

      // Reabrir/ajustar pelo zap: se a sessão foi semeada com reopenedSlug, regenera
      // NO MESMO slug (UPDATE) preservando o número — espelha a rota de reabrir do dashboard.
      const result = await this.generateProposalCore({
        data, modoEnvio, tipo, attachments,
        reopenSlug: sessionState.reopenedSlug,
        numeroProposta: sessionState.reopenedNumero,
      });

      await this.redis.setex(
        `proposal:last:${phone}`,
        PROPOSAL_MODE_TTL_SECONDS * 24,
        JSON.stringify({
          data,
          upload: result.driveResult,
          proposalData: result.proposalData,
          publicUrl: result.publicUrl,
          slug: result.slug,
        }),
      );

      // Proposta gerada: marca a sessao como "gerada" pra que a PRÓXIMA foto ou cliente
      // novo zere o rascunho sozinho (mata o vazamento de foto/dado entre propostas).
      // Os botoes pos-geracao (Enviar/Ajustar/Nova) sao mandados pelo index.ts junto do
      // texto da resposta (1 balao so, na ordem certa).
      {
        const st = await this.loadState(phone);
        st.geracaoConcluida = true;
        await this.saveState(phone, st);
      }

      // Mensagem do CLIENTE vai SEPARADA (limpa, copiável) — sem Drive/Greener/botões.
      // A revisão (números + preview rastreado + Drive + botões) é o return abaixo.
      const ehServico = !result.calculations;
      const economiaMensalCliente = result.calculations?.economiaMensal ?? null;
      let clienteEnviada = false;
      // Só no modo junior_envia (Junior copia e manda). No eva_envia a própria Eva
      // dispara pro cliente ao tocar "Enviar", então a msg "copia e manda" não cabe —
      // nesse caso o link do cliente cai na revisão (fallback abaixo).
      if (this.metaService && result.publicUrl && modoEnvio === 'junior_envia') {
        try {
          await this.metaService.sendText(
            phone,
            buildMensagemClienteProposta(
              data.nomeCliente,
              result.publicUrl,
              ehServico,
              `${result.publicUrl}.pdf`,
              economiaMensalCliente,
              result.calculations?.economiaRemotaMensal ?? null,
            ),
          );
          clienteEnviada = true;
        } catch (err) {
          console.warn('[proposal] msg do cliente falhou:', (err as Error).message);
        }
      }

      // Nota apontando pro balão do cliente (que foi mandado logo acima) — só quando
      // ele realmente saiu separado (junior_envia com metaService).
      const notaCliente = clienteEnviada ? ['_↑ a mensagem acima é a do cliente — copia e manda_'] : [];

      // Links da REVISÃO (só Junior): link do cliente (fallback se não saiu separado) +
      // preview rastreado + Drive. Se não tem publicUrl mas o Drive subiu, usa o link web
      // do Drive como o compartilhável do cliente (cobre queda transitória do Supabase).
      const linksRevisao: string[] = [];
      if (!clienteEnviada) {
        if (result.publicUrl) linksRevisao.push(`🌐 Cliente: ${result.publicUrl}`);
        else if (result.driveResult) linksRevisao.push(`🌐 Cliente (Drive): ${result.driveResult.htmlWebViewLink}`);
      }
      if (result.publicUrl && this.proposalPreviewToken) {
        linksRevisao.push(`👁️ Preview (só você): ${result.publicUrl}?eu=${encodeURIComponent(this.proposalPreviewToken)}`);
      }
      if (result.driveResult) linksRevisao.push(`📄 PDF: ${result.driveResult.pdfWebViewLink}`);
      if (!result.publicUrl && !result.driveResult) linksRevisao.push('⚠️ Nenhum link disponível — checar logs.');

      // Proposta SÓ-SERVIÇO: sem cálculo solar (calculations=null).
      if (!result.calculations) {
        const servicos = result.proposalData.servicos ?? [];
        // Total: soma dos itens se têm preço; senão o valor único (valorTotalRs).
        const totalServicos = totalServicoData(data, servicos);
        const fmtBr = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
        return [
          '✅ *Proposta de serviço gerada — sua revisão*',
          ...notaCliente,
          `💵 Total: R$ ${fmtBr(totalServicos)}`,
          ...linksRevisao,
        ].join('\n');
      }

      const greener = compararGreener(Number(data.potenciaKwp), result.calculations.rsPorWp);
      return [
        '✅ *Proposta gerada — sua revisão*',
        ...notaCliente,
        `💰 R$/Wp: R$ ${result.calculations.rsPorWp.toFixed(2)}/Wp · 🎯 Greener: R$ ${greener.rsPorWpReferencia.toFixed(2)}/Wp`,
        `${greener.rotulo} (${greener.diferencaPct >= 0 ? '+' : ''}${greener.diferencaPct.toFixed(1)}%)`,
        `📊 Payback: ${result.calculations.paybackAnos}a ${result.calculations.paybackMeses}m · 📈 TIR: ${result.calculations.tirPercentual.toFixed(1)}%`,
        ...resumoServicosParaJunior(result.proposalData.servicos, Number(data.valorTotalRs)),
        ...linksRevisao,
      ].join('\n');
    } catch (err) {
      console.error('[proposal] Generation error:', err);
      const raw = (err as Error).message ?? 'erro desconhecido';
      const safe = raw.length > 120 ? raw.slice(0, 120) + '...' : raw;
      const friendly = /timeout|ECONN|chromium|puppeteer/i.test(raw)
        ? 'PDF demorou demais ou Chromium falhou. Tenta de novo em 30s.'
        : /refresh|token|auth/i.test(raw)
          ? 'Token Google expirou — regerar GOOGLE_REFRESH_TOKEN com scope drive.file.'
          : safe;
      return `⚠️ Erro ao gerar proposta: ${friendly}`;
    }
  }

  // Mapeia o JSON do Claude pro formato do calculator.ts.
  // Tarifas reais 2026 + Fio B (Lei 14.300/2022).
  // [Corretor] Corrige o português dos textos livres da proposta que o cliente vê
  // (títulos/descrições de serviço, descrição da estrutura, observações). Corrige
  // em paralelo (campos independentes). corrigirOrtografia nunca lança e protege
  // números/nomes, então isto é seguro mesmo com texto torto do Junior.
  private async corrigirTextosDaProposta(data: any): Promise<void> {
    if (!data || typeof data !== 'object') return;
    const alvos: Array<{ obj: any; campo: string }> = [];
    const add = (obj: any, campo: string) => {
      if (obj && typeof obj[campo] === 'string' && obj[campo].trim().length >= 3) {
        alvos.push({ obj, campo });
      }
    };
    if (Array.isArray(data.servicos)) {
      for (const s of data.servicos) {
        add(s, 'titulo');
        add(s, 'descricao');
      }
    }
    add(data.estruturaFixacao, 'descricao');
    // observacoes em LISTA (o formato da regra 14) fica TEXTUAL de propósito —
    // o add só pega string, então o array passa reto sem corretor: o texto é
    // do Junior e ele confere no resumo antes de gerar. Os add abaixo cobrem
    // só o caso legado de vir como string solta.
    add(data, 'observacoes');
    add(data, 'observacao'); // o extrator pode emitir no singular
    add(data, 'formasPagamento'); // só corrige se for string livre (add checa o tipo)
    await Promise.all(
      alvos.map(async ({ obj, campo }) => {
        obj[campo] = await corrigirOrtografia(this.client, obj[campo]);
      }),
    );
  }

  private dataToCalculatorInput(data: any): ProposalInput {
    // UNIFICADO com o chat da Eva via solar-params.ts (fonte unica): mesmos HSP
    // (CRESESB), tarifa, Fio B e fator de perda. Chat e proposta NUNCA divergem.
    // concessionaria vazia => trata como DF (comportamento historico da proposta).
    const concessionariaStr = data.concessionaria || 'Neoenergia Brasília';
    const tarifaDefault = tarifaPorConcessionaria(concessionariaStr);
    const tusdFioBDefault = tusdFioBPorConcessionaria(concessionariaStr);
    const hspDefault = hspPorConcessionaria(concessionariaStr);
    // Permite override de HSP por proposta (PVSol/medicao real); senao usa CRESESB.
    const hsp = Number(data.hsp) > 0 ? Number(data.hsp) : hspDefault;

    const ano = new Date().getFullYear();
    // Cronograma único: a MESMA função usada na projeção (calculator), pra o
    // headline nunca divergir da 1ª barra do gráfico. percentualFioBVigente do
    // solar-params fica só pro chat/estimativa rápida (solar.ts).
    const percentualFioB = percentualFioBPorAno(ano);

    // Fallback de consumoMensalKwh: campo critico do calculator (define payback/ROI).
    // Quando Junior passa override de geracao mas esquece consumo, derivamos:
    // 1. Se ele deu geracaoMensalKwh explicito, assume consumo == geracao (autoconsumo 100%)
    // 2. Se nao, calcula geracao a partir de potenciaKwp/HSP/fator e usa como consumo
    // 3. So depois cai em zero (quando nem kWp tem)
    const fatorPerda = Number(data.fatorPerda) || FATOR_PERDA_CONSERVADOR;
    const potenciaKwp = Number(data.potenciaKwp);

    // Override de GERACAO mes-a-mes do estudo (12 valores): vira a curva do grafico.
    // Aceita data.geracaoMensalKwhDistribuido ou data.geracaoMensal12Meses (alias).
    const geracaoArray = data.geracaoMensalKwhDistribuido ?? data.geracaoMensal12Meses;
    const geracaoMensalKwhDistribuidoOverride = (Array.isArray(geracaoArray)
      && geracaoArray.length === 12
      && geracaoArray.every((v: unknown) => typeof v === 'number' && isFinite(v) && v >= 0))
      ? (geracaoArray as number[])
      : undefined;
    const geracaoMediaEstudo = geracaoMensalKwhDistribuidoOverride
      ? geracaoMensalKwhDistribuidoOverride.reduce((a, b) => a + b, 0) / 12
      : undefined;

    // Override de geracao unico (PVSol/PVsyst). Se so veio mes-a-mes, usa a media dos 12.
    const geracaoOverrideRaw = Number(data.geracaoMensalKwh ?? data.geracaoKwh ?? data.geracao);
    const geracaoMensalKwhOverride = (isFinite(geracaoOverrideRaw) && geracaoOverrideRaw > 0)
      ? geracaoOverrideRaw
      : geracaoMediaEstudo;

    // Fallback de consumoMensalKwh (campo critico do calculator). Usa a geracao
    // resolvida (override unico OU media do estudo) e, em ultimo caso, kWp×HSP×fator.
    let consumoMensalKwh = Number(data.consumoMensalKwh);
    if (!isFinite(consumoMensalKwh) || consumoMensalKwh <= 0) {
      if (geracaoMensalKwhOverride && geracaoMensalKwhOverride > 0) {
        consumoMensalKwh = geracaoMensalKwhOverride;
      } else if (isFinite(potenciaKwp) && potenciaKwp > 0) {
        consumoMensalKwh = potenciaKwp * hsp * 30 * fatorPerda;
      }
    }

    // Override de consumo mes-a-mes: quando Junior tem historico real da conta de luz
    // dos 12 meses do cliente, passa array. Senao, usa consumoMensalKwh fixo (default).
    // Aceita data.consumoMensalKwhDistribuido ou data.consumoMensal12Meses (alias).
    const consumoArray = data.consumoMensalKwhDistribuido ?? data.consumoMensal12Meses;
    const consumoMensalKwhDistribuidoOverride = (Array.isArray(consumoArray)
      && consumoArray.length === 12
      && consumoArray.every((v: unknown) => typeof v === 'number' && isFinite(v) && v >= 0))
      ? (consumoArray as number[])
      : undefined;

    // Tipo de sistema / perfil / carregador: alimentam o motor Fio B (simultaneidade
    // sugerida por perfil, off_grid zera a conta, carregador reduz a injecao).
    const tipoSistema = tipoSistemaDeDados({
      tipoCliente: data.tipoCliente,
      modalidade: data.modalidade,
      temBateria: temBateria(data.bateria),
    });
    const perfilCliente = perfilDeTipoCliente(data.tipoCliente);
    const temCarregador = temCarregadorNosServicos(data.servicos);
    // modoBateria so quando o Junior informa explicitamente (backup/autoconsumo/time_of_use).
    // Sem modo, hibrido injeta como on-grid (bateria de backup) — numeros retrocompativeis.
    const modoStr = String(data.modoBateria ?? data.bateria?.modo ?? '').toLowerCase();
    const modoBateria = /autoconsumo/.test(modoStr) ? 'autoconsumo' as const
      : /time|tarifa|hor[aá]ri/.test(modoStr) ? 'time_of_use' as const
      : /backup/.test(modoStr) ? 'backup' as const
      : undefined;
    // Simultaneidade SO quando o Junior edita explicitamente; senao o motor sugere por perfil.
    const percentualGeracaoInjetada = data.percentualGeracaoInjetada != null
      && isFinite(Number(data.percentualGeracaoInjetada))
      ? Number(data.percentualGeracaoInjetada)
      : undefined;

    // Autoconsumo remoto: consumo da(s) outra(s) unidade(s) do titular que
    // absorve creditos. Aceita o alias consumoOutraUnidadeKwh. Modo "restante"
    // (tudo que sobrar vai pra outra unidade): flag booleana OU a palavra
    // 'restante' no proprio campo de consumo remoto.
    const consumoRemotoBruto = data.consumoRemotoMensalKwh ?? data.consumoOutraUnidadeKwh;
    const consumoRemotoRaw = Number(consumoRemotoBruto);
    const consumoRemotoMensalKwh = (isFinite(consumoRemotoRaw) && consumoRemotoRaw > 0)
      ? consumoRemotoRaw
      : undefined;
    const consumoRemotoRestante = data.consumoRemotoRestante === true
      || /restante|resto|sobra/i.test(String(consumoRemotoBruto ?? ''));

    return {
      potenciaKwp,
      fatorPerda,
      hsp,
      consumoMensalKwh,
      consumoRemotoMensalKwh,
      consumoRemotoRestante: consumoRemotoRestante || undefined,
      tarifaRsKwh: Number(data.tarifaRsKwh ?? tarifaDefault),
      tusdFioBRsKwh: Number(data.tusdFioBRsKwh ?? tusdFioBDefault),
      percentualFioBVigente: Number(data.percentualFioBVigente ?? percentualFioB),
      percentualGeracaoInjetada,
      custoIluminacaoPublica: Number(data.custoIluminacaoPublica ?? CUSTO_ILUMINACAO_PUBLICA),
      reajusteAnualEnergia: REAJUSTE_ANUAL_ENERGIA,
      valorTotalRs: Number(data.valorTotalRs),
      vidaUtilAnos: VIDA_UTIL_ANOS,
      geracaoMensalKwhOverride,
      geracaoMensalKwhDistribuidoOverride,
      consumoMensalKwhDistribuidoOverride,
      tipoSistema,
      perfilCliente,
      temCarregador,
      modoBateria,
      anoInicial: ano,
    };
  }

  // Mapeia o JSON do Claude pro ProposalData (template).
  // Numero unico: ano+timestamp em base36 (curto, sem colisao em ms).
  private dataToProposalData(data: any, _calc: any): ProposalData {
    const ano = new Date().getFullYear();
    const sufixo = Date.now().toString(36).toUpperCase().slice(-5);
    const numero = `${ano}-${sufixo}`;
    const servicos = mapServicosFromClaude(data.servicos);
    const valorComServicos = Number(data.valorTotalRs) + somaServicosExtras(servicos);
    return {
      numeroProposta: numero,
      dataProposta: new Date().toLocaleDateString('pt-BR'),
      validadeDias: Number.isFinite(Number(data.validadeDias)) && Number(data.validadeDias) > 0 ? Number(data.validadeDias) : 5,
      nomeCliente: data.nomeCliente,
      documentoCliente: data.documentoCliente,
      enderecoCliente: data.enderecoCliente,
      telefoneCliente: data.telefoneCliente,
      emailCliente: data.emailCliente,
      potenciaKwp: Number(data.potenciaKwp),
      fatorPerda: Number(data.fatorPerda),
      tipoCliente: data.tipoCliente,
      modalidade: data.modalidade,
      concessionaria: data.concessionaria,
      modulo: data.modulo,
      inversor: data.inversor,
      bateria: data.bateria,
      estruturaFixacao: data.estruturaFixacao,
      valorTotalRs: Number(data.valorTotalRs),
      formasPagamento: this.enforceCartoesSolar(
        data.formasPagamento ?? this.defaultPaymentOptions(valorComServicos),
        valorComServicos,
      ),
      servicos,
      observacoes: observacoesDaProposta(data.observacoes ?? data.observacao),
      empresa: this.companyDefaults,
    };
  }

  // Taxas reais abril/2026 (financiamento) e 03/08/2026 (cartoes).
  // CARTOES DO SOLAR: DUAS tabelas vivas em proposal/cartao-solar.ts (fonte unica) —
  // 'parceria' (Belenus, ate 24x, acrescimo por fora) e 'solfacil' (Sol Facil/Fortlev,
  // ate 18x, taxa POR DENTRO, sem juros ate 3x). Dois distribuidores do Junior.
  // FINANCIAMENTO SOLAR 2026: Santander 1,11-1,25%, BV 1,17%, Solfacil CET 1,32-1,57%.
  // Media realista 1,40% a.m. CET (cobre Solfacil/BV/Santander/Sol Agora).
  private static readonly TAXA_FINANC_AM = 0.014; // 1,4% a.m. CET medio
  private static readonly MESES_CARENCIA_FINANC = 4; // 120 dias padrao

  // Tabela Price: parcela = PV * i / (1 - (1+i)^-n).
  // Quando ha carencia, PV capitaliza durante n_carencia meses antes de comecar Price.
  private static parcelaTabelaPrice(valor: number, taxaMensal: number, parcelas: number, mesesCarencia = 0): number {
    const valorPosCarencia = valor * Math.pow(1 + taxaMensal, mesesCarencia);
    const fator = taxaMensal / (1 - Math.pow(1 + taxaMensal, -parcelas));
    return valorPosCarencia * fator;
  }

  // As tabelas dos cartões moram em proposal/cartao-solar.ts — fonte ÚNICA, porque a
  // Central de Contratos precisa da MESMA conta (senão o cliente lê um número na
  // proposta e assina outro no contrato).

  // [ECOSOF] Cartões do solar atrás da flag empresa_config.belenus_ativo:
  // ligada (EcoSun, seed) = 'parceria' 24× exata + 'solfacil' 18× por dentro;
  // desligada = cartão genérico de até 12× na maquininha (mesma tabela do
  // service-payment) — um clone sem as parcerias nunca herda taxa de terceiro.
  private static parcelasCartaoSolar(tabela: TabelaCartao = 'parceria'): number {
    return parcelasMaxCartaoSolar(tabela);
  }
  private static parcelaCartaoSolar(valor: number, tabela: TabelaCartao = 'parceria'): number {
    if (!empresa().belenusAtivo) return valorParcelaCartao(valor, 12);
    return tabela === 'solfacil'
      ? parcelaCartaoSolFacil(valor, 18)
      : parcelaCartaoBelenus(valor, 24);
  }

  // Os cartões do solar SEMPRE usam a parcela calculada pelo sistema — a Eva nunca
  // calcula cartão de cabeça. São DUAS tabelas vivas ('parceria' 24× e 'solfacil'
  // 18× — dois distribuidores); o campo `tabelaCartao` diz qual é, e cartão da Eva
  // sem marcador é inferido pelo texto ("18x/18×" → solfacil; na dúvida, parceria,
  // que é o comportamento antigo). [ECOSOF] Sem belenus_ativo é o cartão genérico
  // 12× da maquininha.
  //
  // Nome de distribuidor (Belenus/Sol Fácil/Fortlev) NUNCA vai pro cliente no
  // cartão — no financiamento "Solfácil" é banco parceiro e PODE aparecer.
  //
  // E NENHUMA forma sai sem valorPrincipal: financiamento sem valor ganha a
  // parcela Price 90× com carência (o "undefined" na proposta de 03/08/2026 era
  // exatamente isso); as demais caem no valor à vista.
  private enforceCartoesSolar(
    formas: ProposalData['formasPagamento'],
    valorBase: number,
  ): ProposalData['formasPagamento'] {
    const fmtRs = (n: number) => 'R$ ' + n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
    const bandeirasParceria = 'Parcelamento: Visa/Amex até 24× · Master/Elo até 21× · demais até 12×';
    const condicaoSolfacil = 'Em até 18× · sem juros até 3×';
    const limpezaFinal = (s: string) =>
      s
        .replace(/\(\s*\)/g, '')          // parênteses que ficaram vazios ("(Belenus)" → "()")
        .replace(/\s+([,.;:])/g, '$1')    // espaço solto antes de pontuação
        .replace(/\s{2,}/g, ' ')
        .replace(/^[·\-—,\s]+|[·\-—,\s]+$/g, '')
        .trim();
    // "Belenus" nunca aparece em lugar nenhum (nem fora do cartão).
    const semBelenus = (s?: string) =>
      limpezaFinal((s ?? '')
        .replace(/\s*[·\-—]?\s*(parceria\s+ecosunpower\s*x\s*belenus|cart[ãa]o\s+belenus|belenus)\b/gi, ''));
    // No CARTÃO, nenhum distribuidor aparece (Sol Fácil/Fortlev inclusos).
    const semDistribuidorCartao = (s?: string) =>
      limpezaFinal(semBelenus(s)
        .replace(/\s*[·\-—]?\s*(cart[ãa]o\s+(sol\s*f[áa]cil|solf[áa]cil|fortlev)|sol\s*f[áa]cil|solf[áa]cil|fortlev)\b/gi, ''));
    // Defesa anti-"undefined": toda forma sai com valorPrincipal preenchido.
    const valorPrincipalGarantido = (f: ProposalData['formasPagamento'][number]) => {
      const v = (f.valorPrincipal ?? '').trim();
      if (v && v.toLowerCase() !== 'undefined') return v;
      if (f.meioPagamento === 'financiamento') {
        return fmtRs(Math.round(ProposalAssistant.parcelaTabelaPrice(
          valorBase, ProposalAssistant.TAXA_FINANC_AM, 90, ProposalAssistant.MESES_CARENCIA_FINANC,
        )));
      }
      return fmtRs(valorBase);
    };
    return formas.map((f) => {
      // valorSecundario TAMBÉM vai pro cliente (template) e pode ter sido escrito pela
      // Eva — então sanitiza nas duas pontas.
      if (f.meioPagamento !== 'cartao') {
        return {
          ...f,
          tipo: semBelenus(f.tipo),
          titulo: semBelenus(f.titulo),
          valorPrincipal: valorPrincipalGarantido(f),
          valorSecundario: semBelenus(f.valorSecundario),
          bullets: (f.bullets ?? []).map(semBelenus).filter(Boolean),
        };
      }
      const tabela: TabelaCartao = f.tabelaCartao
        ?? (/18\s*[x×]/i.test(`${f.titulo ?? ''} ${f.tipo ?? ''} ${f.valorSecundario ?? ''}`) ? 'solfacil' : 'parceria');
      const parcela = Math.round(ProposalAssistant.parcelaCartaoSolar(valorBase, tabela));
      const tipo = semDistribuidorCartao(f.tipo) || 'Cartão de crédito';
      let bullets = (f.bullets ?? []).map(semDistribuidorCartao).filter(Boolean);
      if (empresa().belenusAtivo) {
        if (tabela === 'solfacil') {
          // Condições do parceiro ANTIGO (Visa/Amex 24× etc.) não valem no 18× —
          // troca pelo resumo da tabela por dentro.
          bullets = bullets.filter((b) => !/visa\/amex|master\/elo|24\s*[x×]|21\s*[x×]/i.test(b));
          if (!bullets.some((b) => /sem juros até 3×/i.test(b))) bullets = [condicaoSolfacil, ...bullets];
        } else if (!bullets.some((b) => b.includes('Visa/Amex'))) {
          bullets = [...bullets, bandeirasParceria];
        }
      }
      return {
        ...f,
        tabelaCartao: tabela,
        tipo,
        titulo: semDistribuidorCartao(f.titulo),
        valorSecundario: semDistribuidorCartao(f.valorSecundario),
        valorPrincipal: fmtRs(parcela),
        bullets,
      };
    });
  }

  private defaultPaymentOptions(valorRs: number): ProposalData['formasPagamento'] {
    const fmtRs = (n: number) => 'R$ ' + n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });

    const financiamentoParcela = Math.round(
      ProposalAssistant.parcelaTabelaPrice(
        valorRs,
        ProposalAssistant.TAXA_FINANC_AM,
        90,
        ProposalAssistant.MESES_CARENCIA_FINANC,
      ),
    );

    const aVista = {
      tipo: 'À Vista',
      titulo: 'PIX ou TED',
      valorPrincipal: fmtRs(valorRs),
      valorSecundario: 'pagamento único',
      recomendado: true,
      bullets: ['Sem juros, sem entrada', 'Início imediato do projeto', 'Maior economia no longo prazo'],
      meioPagamento: 'pix' as const,
    };
    const financiamento = {
      tipo: 'Financiamento Solar',
      titulo: 'Até 90× · carência 120 dias',
      valorPrincipal: fmtRs(financiamentoParcela),
      valorSecundario: 'por mês · 1ª parcela em até 120 dias',
      bullets: [
        'Bancos parceiros: Solfácil, Sol Agora, BV Solar, Santander',
        'CET médio ~1,40% a.m. (taxas reais abr/26)',
        'Sua geração já paga a parcela',
        'Aprovação 24-48h conforme CPF',
      ],
      meioPagamento: 'financiamento' as const,
    };

    // [ECOSOF] Sem a flag da parceria: cartão genérico 12× na maquininha (3 formas).
    if (!empresa().belenusAtivo) {
      return [
        aVista,
        {
          tipo: 'Cartão de crédito',
          titulo: 'Em até 12× na maquininha',
          valorPrincipal: fmtRs(Math.round(ProposalAssistant.parcelaCartaoSolar(valorRs))),
          valorSecundario: 'em até 12× · aprovação imediata',
          bullets: [
            'Parcele no cartão em até 12×',
            'Aprovação imediata, sem análise formal',
            'Comece sem espera',
          ],
          meioPagamento: 'cartao' as const,
        },
        financiamento,
      ];
    }

    // EcoSun: os DOIS cartões lado a lado (dois distribuidores, cliente escolhe) — 4 formas.
    return [
      aVista,
      {
        tipo: 'Cartão de crédito',
        titulo: 'Em até 24× com juros baixos',
        valorPrincipal: fmtRs(Math.round(ProposalAssistant.parcelaCartaoSolar(valorRs, 'parceria'))),
        valorSecundario: 'parcela em 24× · aprovação imediata',
        bullets: [
          'Taxa especial pra solar — bem menor que cartão tradicional',
          'Aprovação imediata, sem análise formal',
        ],
        meioPagamento: 'cartao' as const,
        tabelaCartao: 'parceria' as const,
      },
      {
        tipo: 'Cartão de crédito',
        titulo: 'Em até 18× · sem juros até 3×',
        valorPrincipal: fmtRs(Math.round(ProposalAssistant.parcelaCartaoSolar(valorRs, 'solfacil'))),
        valorSecundario: 'parcela em 18× · aprovação imediata',
        bullets: [
          'Sem juros até 3× — e taxa baixa até 18×',
          'Aprovação imediata, sem análise formal',
        ],
        meioPagamento: 'cartao' as const,
        tabelaCartao: 'solfacil' as const,
      },
      financiamento,
    ];
  }
}
