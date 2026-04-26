/**
 * Topic detector pra carregamento lazy de knowledge especializado.
 *
 * Mapeia keywords (no texto do cliente ou form de lead) -> arquivos da
 * pasta `conhecimento/especializado/` que devem ser injetados naquela
 * mensagem especifica. Reduz tokens injetados em ~50-65% comparado a
 * carregar a base inteira em toda mensagem.
 *
 * Como adicionar novo topico:
 *   1. Crie `conhecimento/especializado/<nome>.md`
 *   2. Adicione entrada em SPECIALIZED_TOPICS abaixo: arquivo + keywords
 *   3. Mantem keywords curtas e em lowercase
 *   4. Pode usar palavra parcial (matchea por substring no texto normalizado)
 */

interface SpecializedTopic {
  file: string;
  keywords: string[];
}

const SPECIALIZED_TOPICS: SpecializedTopic[] = [
  {
    file: 'dimensionamento.md',
    keywords: [
      'kwp', 'kw ', 'dimensionar', 'dimension', 'painel', 'paineis', 'modulo solar',
      'placa', 'sistema solar', 'calcular sistema', 'potencia', 'projeto', 'kwh/mes',
      'consumo', 'conta de luz', 'fatura', 'orcamento', 'simulacao', 'simular',
      'quantos paineis', 'quanto custa', 'preco do sistema', 'qual valor',
    ],
  },
  {
    file: 'cenarios-dimensionamento.md',
    keywords: [
      'cenario', 'simulacao residencial', 'simulacao comercial', 'caso pratico',
      'exemplo de sistema', 'qual sistema',
    ],
  },
  {
    file: 'modulos-especificacoes.md',
    keywords: [
      'datasheet', 'spec', 'especificacao', 'voc', 'vmpp', 'isc', 'impp',
      'eficiencia do painel', 'coef temp', 'coeficiente termico', 'bifacial',
      'topcon', 'n-type', 'hjt', 'half-cell', 'half cell', 'jam66', 'rsm132',
      'tsm-neg', 'longi 635', 'longi 640', 'jinko', 'ja solar', 'risen', 'trina',
      'modelo do painel', 'qual painel', ' wp ', 'watts', 'celulas', 'tier 1',
    ],
  },
  {
    file: 'inversores-baterias.md',
    keywords: [
      'inversor', 'inverter', 'string', 'microinversor', 'micro inversor', 'micro-inversor',
      'bateria', 'battery', 'bess', 'armazenamento', 'hibrido', 'híbrido', 'off-grid',
      'off grid', 'backup', 'autoconsumo noturno', 'sungrow', 'goodwe', 'huawei',
      'deye', 'foxess', 'fox ess', 'hoymiles', 'enphase', 'apsystems', 'nep', 'solis',
    ],
  },
  {
    file: 'compatibilidade-inversores-baterias.md',
    keywords: [
      'compatibilidade', 'compativel', 'pareamento', 'qual bateria com', 'combinacao',
      'qual inversor com', 'parear inversor',
    ],
  },
  {
    file: 'solaredge.md',
    keywords: [
      'solaredge', 'solar edge', 'otimizador', 'optimizer', 'p series', 'p-series',
      'home hub', 'genesis', 's series', 's-series', 'modulo a modulo',
    ],
  },
  {
    file: 'equatorial-goias.md',
    keywords: [
      'goias', 'goiás', 'goiania', 'goiânia', 'anapolis', 'anápolis', 'equatorial',
      'celg', 'rio verde', 'aparecida de goiania', 'luziania', 'luziânia',
      'valparaiso', 'valparaíso', 'planaltina-go', 'formosa',
    ],
  },
  {
    file: 'neoenergia-brasilia.md',
    keywords: [
      'brasilia', 'brasília', 'df', 'distrito federal', 'ceb', 'neoenergia',
      'taguatinga', 'ceilandia', 'ceilândia', 'gama', 'samambaia', 'aguas claras',
      'águas claras', 'sobradinho', 'planaltina-df', 'guara', 'guará', 'asa norte',
      'asa sul',
    ],
  },
  {
    file: 'tarifacao.md',
    keywords: [
      'tarifa', 'tarifacao', 'tarifação', 'bandeira', 'bandeira tarifaria', 'bandeira tarifária',
      'tusd', ' te ', 'kwh', 'tarifa branca', 'convencional', 'horario de ponta',
      'horário de ponta', 'fora ponta', 'b1', 'b2', 'b3', 'sazonal',
    ],
  },
  {
    file: 'modalidades-compensacao.md',
    keywords: [
      'modalidade', 'compensacao', 'compensação', 'autoconsumo remoto', 'geracao compartilhada',
      'geração compartilhada', 'mmgd', 'micro geracao', 'minigeracao', 'minigeração',
      'gd', 'cooperativa solar', 'condominio', 'multiplas unidades',
    ],
  },
  {
    file: 'legislacao.md',
    keywords: [
      'legislacao', 'legislação', 'lei 14.300', 'lei 14300', '14.300', 'aneel',
      'normativa', 'resolucao', 'resolução', 'decreto', 'regulamentacao',
      'regulamentação', 'taxacao', 'taxação', 'taxa do sol', 'fio b',
    ],
  },
  {
    file: 'estruturas-telhados.md',
    keywords: [
      'telhado', 'estrutura', 'ceramica', 'cerâmica', 'fibrocimento', 'laje',
      'metalico', 'metálico', 'solo', 'carport', 'garagem', 'shingle', 'colonial',
      'romano', 'inclinacao', 'inclinação', 'azimute',
    ],
  },
  {
    file: 'carros-eletricos.md',
    keywords: [
      'carro eletrico', 'carro elétrico', ' ev ', 'veiculo eletrico', 'veículo elétrico',
      'wallbox', 'wall box', 'recarga', 'tomada veicular', 'carregador', 'tesla',
      'byd dolphin', 'gwm', 'volvo ex30', 'jeep avenger',
    ],
  },
  {
    file: 'mercado-livre.md',
    keywords: [
      'mercado livre', 'acl', 'ambiente livre', 'energia livre', 'consumidor livre',
      'grupo a', 'alta tensao', 'alta tensão', 'demanda contratada',
    ],
  },
  {
    file: 'financiamento.md',
    keywords: [
      'financiar', 'financiamento', 'parcelar', 'parcelamento', 'juros', 'parcela',
      'banco do brasil', 'caixa', 'bnb', 'bndes', 'santander solar', 'sicoob',
      'cdc', 'leasing', 'a vista', 'à vista', 'cartao', 'pix',
    ],
  },
  {
    file: 'armazenamento.md',
    keywords: [
      'armazenamento', 'bateria de litio', 'bateria de lítio', 'lfp', 'lifepo4',
      'banco de bateria', 'bess', 'powerwall', 'autonomia', 'no-break', 'nobreak',
      'queda de luz', 'falta de energia',
    ],
  },
  {
    file: 'servicos-executados.md',
    keywords: [
      'caso', 'projeto executado', 'exemplo', 'depoimento', 'cliente atendido',
      'obra ja feita', 'obra já feita', 'portfolio', 'portfólio', 'referencia',
      'referência', 'voces ja fizeram', 'vocês já fizeram',
    ],
  },
];

/**
 * Detecta quais arquivos especializados sao relevantes baseado no texto
 * fornecido. Retorna lista de filenames (sem path) que devem ser carregados.
 */
export function detectTopics(text: string): string[] {
  if (!text) return [];

  const normalized = ' ' + text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') + ' ';
  const matched = new Set<string>();

  for (const topic of SPECIALIZED_TOPICS) {
    for (const kw of topic.keywords) {
      const kwNorm = kw.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      if (normalized.includes(kwNorm)) {
        matched.add(topic.file);
        break;
      }
    }
  }

  return Array.from(matched);
}

export function getAllSpecializedFiles(): string[] {
  return SPECIALIZED_TOPICS.map(t => t.file);
}
