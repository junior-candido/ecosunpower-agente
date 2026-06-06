// src/modules/proposal/brand-fichas.ts
// Ficha descritiva de cada marca de módulo/inversor que a EcoSunPower usa.
// Puxada automaticamente na proposta (cards de equipamento + comparação) pra o
// cliente decidir com base real. Junior pode sobrescrever o `resumo` por proposta.
//
// FONTE: books técnicos da própria EcoSunPower em conhecimento/especializado/*.md
// (dados fiéis ao que o Junior escreveu — fundação, tecnologia, Tier 1, garantias).
// O `resumo` é a "Frase pronta da Eva sobre a marca" adaptada cliente-facing.

export interface MarcaFicha {
  marca: string;
  tipo: 'modulo' | 'inversor';
  tempoMercado: string;   // tempo no setor / fundação / presença oficial no Brasil
  tecnologia: string;
  tier1: boolean;
  garantia: string;       // garantias do fabricante
  resumo: string;         // parágrafo cliente-facing
}

const FICHAS: MarcaFicha[] = [
  // ============ MÓDULOS (painéis) ============
  {
    marca: 'Trina', tipo: 'modulo',
    tempoMercado: 'fundada em 1997, 28 anos no setor, filial oficial no Brasil (São Paulo)',
    tecnologia: 'N-type i-TOPCon bifacial dual glass (Vertex N)',
    tier1: true,
    garantia: '25 anos de produto + 30 anos de performance',
    resumo: 'A Trina Solar é uma das três maiores fabricantes de painel solar do mundo, com 28 anos no setor e mais de 240 GW entregues globalmente. Empresa listada em bolsa em Shanghai, com filial oficial no Brasil. O painel Vertex N usa tecnologia i-TOPCon N-type bifacial dual glass, eficiência de até 23,2% e garantia de 25 anos de produto e 30 anos de performance — ao final de 30 anos ainda garante 87,4% da potência original.',
  },
  {
    marca: 'JA Solar', tipo: 'modulo',
    tempoMercado: 'fundada em 2005, listada na Bolsa de Shanghai, presença em mais de 135 países, subsidiária oficial no Brasil',
    tecnologia: 'N-type TOPCon Bycium+ bifacial dual glass (DeepBlue 4.0 Pro)',
    tier1: true,
    garantia: '12 anos de produto + 30 anos de performance',
    resumo: 'A JA Solar é uma das cinco maiores fabricantes de painel solar do mundo, com presença em mais de 135 países e classificação 100% Bankable pela BloombergNEF. O DeepBlue 4.0 Pro usa tecnologia Bycium+ N-type proprietária, com construção bifacial dual glass. Em teste de campo de 1 ano com o TÜV NORD, gerou 3,9% mais eletricidade que painel P-type comum. Garantia de 12 anos de produto e 30 anos de performance linear.',
  },
  {
    marca: 'Jinko', tipo: 'modulo',
    tempoMercado: 'fundada em 2006, listada na NYSE (JKS), mais de 290 GW entregues em mais de 180 países, subsidiária oficial no Brasil',
    tecnologia: 'N-type TOPCon Hot 2.0 com SMBB bifacial dual glass (Tiger Neo)',
    tier1: true,
    garantia: '12 anos de produto + 30 anos de performance',
    resumo: 'A JinkoSolar é uma das três maiores fabricantes de painel solar do mundo, listada na Bolsa de Nova York (NYSE: JKS), com mais de 290 GW entregues em mais de 180 países. O Tiger Neo usa tecnologia N-type TOPCon Hot 2.0 com SMBB, eficiência de até 23,33% e construção bifacial dual glass. Em alta temperatura gera 2% a mais que painel P-type — diferencial real pro clima do DF e Goiás. Garantia de 12 anos de produto e 30 anos de performance.',
  },
  {
    marca: 'LONGi', tipo: 'modulo',
    tempoMercado: 'fundada em 2000, maior fabricante de painéis do mundo, presença em mais de 150 países, operação oficial no Brasil',
    tecnologia: 'BC 2.0 (HPBC 2.0) Back Contact, frente preta sem barras (Hi-MO X10)',
    tier1: true,
    garantia: '12 anos de produto + 25 anos de performance',
    resumo: 'A LONGi é a maior fabricante de painel solar do mundo — número 1 global, Tier 1 Bloomberg, única com classificação AAA Bankable pela PVtech, presente em mais de 150 países. Em outubro de 2024 estabeleceu o recorde mundial de eficiência de módulo (25,4%). O Hi-MO X10 usa tecnologia BC 2.0 com contatos traseiros (frente preta uniforme, sem barras), eficiência de até 24,2%. Ao final de 25 anos garante mínimo de 90,6% da potência original.',
  },
  {
    marca: 'Risen', tipo: 'modulo',
    tempoMercado: 'fundada em 1986, mais de 30 anos no setor, listada na Bolsa de Shenzhen, presença em mais de 50 países, site oficial no Brasil',
    tecnologia: 'HJT N-type (Heterojunction) bifacial double glass (Hyper-ion)',
    tier1: true,
    garantia: '15 anos de produto + 30 anos de performance',
    resumo: 'A Risen Energy é uma das 5 maiores fabricantes de painel solar do mundo, pioneira em tecnologia HJT em escala industrial, com mais de 30 anos no setor. O Hyper-ion usa HJT N-type bifacial double glass, com coeficiente de temperatura de -0,24%/°C — um dos melhores do mercado pra clima quente — e degradação anual de apenas 0,3%. Oferece a maior garantia do portfólio: 15 anos de produto e 30 anos de performance, com mínimo de 90,3% da potência ao final de 30 anos.',
  },

  // ============ INVERSORES ============
  {
    marca: 'Sungrow', tipo: 'inversor',
    tempoMercado: 'fundada em 1997, 28 anos no setor, maior estrutura local do setor solar no Brasil (mais de 100 funcionários)',
    tecnologia: 'Inversor string (Série RS-L, ~97,9%) e microinversor (S2500S-L, fast-track ANEEL); app iSolarCloud',
    tier1: true,
    garantia: '10 anos (string Série RS-L) / 12 anos (microinversor S2500S-L)',
    resumo: 'A Sungrow é uma das maiores fabricantes de inversor solar do mundo — quase 30 anos no setor, 870 GW instalados globalmente, e reconhecida pela BloombergNEF como a mais bankable do mundo em inversor fotovoltaico. No Brasil tem a maior estrutura local do setor solar. Oferece inversor string residencial (Série RS-L, 97,9% de eficiência, 10 anos de garantia) e microinversor (S2500S-L, fast-track ANEEL, 12 anos), com monitoramento unificado pelo app iSolarCloud.',
  },
  {
    marca: 'Solis', tipo: 'inversor',
    tempoMercado: 'Ginlong Technologies, fundada em 2005, 20 anos especializada só em inversores, presença em mais de 80 países',
    tecnologia: 'Inversor string mono (S6-GR1P) e trifásico (S6-GC75K-LV); AFCI, DPS Tipo II CC+CA e EPM nativos',
    tier1: true,
    garantia: '10 anos (padrão Brasil)',
    resumo: 'A Solis, da Ginlong Technologies, é a terceira maior fabricante de inversor solar do mundo, 20 anos especializada exclusivamente em inversor — presente em projetos como os Jogos Olímpicos de Pequim 2022 e a Torre Eiffel. Diferencial técnico real: AFCI integrado (proteção contra arco), DPS Tipo II CC + CA já inclusos e EPM nativo (injeção zero) — tudo no próprio inversor, sem custo adicional. Cobre de 3 kW residencial a 75 kW comercial, com 10 anos de garantia.',
  },
  {
    marca: 'Huawei', tipo: 'inversor',
    tempoMercado: 'Huawei Technologies, fundada em 1987, gigante global de tecnologia; FusionSolar atendeu 3,9 milhões de residências em 170 países',
    tecnologia: 'Inversor string trifásico (SUN2000) com AFCI por IA, Rapid Shutdown e otimizadores opcionais por módulo',
    tier1: true,
    garantia: '10 anos (padrão Brasil)',
    resumo: 'A Huawei é uma das maiores empresas de tecnologia do mundo e aplicou sua expertise em telecom e inteligência artificial nos inversores da linha FusionSolar. É marca premium do segmento: AFCI com IA (corta arco em 0,5 s), Rapid Shutdown automático (reduz a tensão do telhado a 30 V em 30 s) e otimizadores opcionais por módulo, com a funcionalidade de microinversor mantendo o custo-benefício do string. Eficiência de até 98,6% e 10 anos de garantia.',
  },
  {
    marca: 'Deye', tipo: 'inversor',
    tempoMercado: 'Grupo Deye (China), filial oficial no Brasil (Mogi das Cruzes-SP), uma das marcas mais reconhecidas globalmente em inversor híbrido',
    tecnologia: 'Microinversor MLPE com Wi-Fi integrado e monitoramento painel a painel (Solarman Smart)',
    tier1: true,
    garantia: '12 anos do fabricante',
    resumo: 'A Deye é uma das marcas mais consolidadas do mercado brasileiro em energia solar. Pertence ao Grupo Deye, conglomerado chinês de alta tecnologia, e tem filial oficial no Brasil em Mogi das Cruzes-SP, com certificação INMETRO completa. Sua linha de microinversores usa tecnologia MLPE com Wi-Fi integrado e monitoramento painel a painel via Solarman Smart, com 12 anos de garantia do fabricante.',
  },
  {
    marca: 'FoxESS', tipo: 'inversor',
    tempoMercado: 'fundada em 2019, filial oficial no Brasil, controlada pelo Tsingshan Group (Fortune 500), selo Top Brand PV 2023',
    tecnologia: 'Microinversor Série Q (até 2500W, 4 painéis), Wi-Fi integrado, fast-track ANEEL, IP67',
    tier1: true,
    garantia: '15 anos do fabricante (microinversor)',
    resumo: 'A FoxESS é uma das marcas que mais cresceram globalmente em energia solar nos últimos anos. Tem filial oficial no Brasil, certificação INMETRO completa e foi premiada com o selo Top Brand PV em 2023; o grupo controlador, Tsingshan, é uma das 500 maiores empresas do mundo. A Série Q tem certificação fast-track pela ANEEL — a distribuidora não pode negar homologação por inversão de fluxo — e 15 anos de garantia do fabricante.',
  },
  {
    marca: 'Hoymiles', tipo: 'inversor',
    tempoMercado: 'fundada em 2012, especializada só em microinversores, presença em mais de 100 países',
    tecnologia: 'Microinversor MLPE (linhas HMS mono e HMT trifásica), eficiência MPPT 99,8%, AFCI integrado, IP67, app S-Miles Cloud',
    tier1: true,
    garantia: '12 anos do fabricante (microinversor HMS)',
    resumo: 'A Hoymiles é especializada exclusivamente em microinversores há mais de 10 anos, com presença em mais de 100 países e certificação INMETRO completa. O foco único nesse segmento resulta em tecnologia mais madura: eficiência MPPT de 99,8%, proteção IP67, função AFCI integrada e monitoramento painel a painel via S-Miles Cloud, com 12 anos de garantia do fabricante.',
  },
  {
    marca: 'NEP', tipo: 'inversor',
    tempoMercado: 'Northern Electric Power, mais de 10 anos em microinversores, sede em Qingdao (China), registro INMETRO próprio',
    tecnologia: 'Microinversor BDM-2000 (4 MPPTs, até 750W/painel), ampla faixa de tensão 176–242V, Wi-Fi integrado, IP67',
    tier1: false,
    garantia: '15 anos do fabricante (180 meses)',
    resumo: 'A NEP (Northern Electric Power) é fabricante especializada em microinversor há mais de 10 anos, com certificação INMETRO completa e várias certificações internacionais. Combina qualidade técnica com excelente relação custo-benefício. Diferencial importante pra região: ampla faixa de tensão de operação (176V a 242V), ideal pra propriedades rurais e áreas com flutuação de rede no entorno do DF e em Goiás. Garantia de 15 anos do fabricante.',
  },
  {
    marca: 'SolaX', tipo: 'inversor',
    tempoMercado: 'fundada em 2012, filial oficial no Brasil, presença em mais de 100 países, Tier 1 Bloomberg, Red Dot Design Award',
    tecnologia: 'Microinversor X1-Micro (2-em-1 e 4-em-1), eficiência MPPT 99,9%, IP67, opera de -40°C a 75°C',
    tier1: true,
    garantia: '15 anos do fabricante (microinversor X1-Micro)',
    resumo: 'A SolaX está entre as maiores fabricantes globais de inversores, com classificação Tier 1 Bloomberg, presença em mais de 100 países e filial oficial no Brasil. Os microinversores X1-Micro têm certificação INMETRO, eficiência MPPT de 99,9%, proteção IP67 e operam de -40°C a 75°C — especialmente adequados pro clima de Brasília e Goiás. Garantia de 15 anos do fabricante.',
  },
  {
    marca: 'Enphase', tipo: 'inversor',
    tempoMercado: 'americana fundada em 2006, listada na NASDAQ (ENPH), inventora do microinversor moderno, mais de 70 milhões instalados em 140+ países',
    tecnologia: 'Microinversor IQ8P (480W CA, eficiência 97,57%), Sunlight Backup (geração diurna sem bateria), IP67',
    tier1: true,
    garantia: '15 anos do fabricante (microinversor IQ8P)',
    resumo: 'A Enphase é uma empresa americana listada na NASDAQ e a inventora da categoria de microinversor moderno. Líder mundial absoluta no segmento há mais de 15 anos, com mais de 70 milhões de unidades instaladas em mais de 140 países. O IQ8P tem a maior eficiência do segmento (97,57%) e o exclusivo Sunlight Backup — o sistema continua gerando durante o dia mesmo sem energia da rede, sem precisar de bateria. Garantia de 15 anos do fabricante.',
  },
  {
    marca: 'SolarEdge', tipo: 'inversor',
    tempoMercado: 'americana-israelense fundada em 2006, listada na NASDAQ (SEDG), inventora do otimizador DC, mais de 4 milhões de instalações em 130+ países',
    tecnologia: 'Inversor central + otimizadores DC por módulo (SafeDC™), bateria Home 400V e carregador VE integrados; conformidade nativa NBR 17193:2025',
    tier1: true,
    garantia: 'Inversor 12 anos (extensível até 25 anos no monofásico, até 20 nos trifásicos) / otimizadores DC 25 anos',
    resumo: 'A SolarEdge é empresa americana-israelense listada na NASDAQ e pioneira mundial em otimizador DC — inventou a categoria há mais de 18 anos. É a única marca que já cumpre nativamente a NBR 17193:2025 e as normas do Corpo de Bombeiros do DF e Goiás, com o SafeDC™ reduzindo a tensão de cada painel a 1V no desligamento. Oferece o ecossistema integrado mais completo do mercado: inversor, otimizadores por painel, bateria 400V e carregador de carro elétrico, tudo numa única plataforma.',
  },
];

// Normaliza e casa por palavra inteira (case-insensitive, sem acento).
// Ex: "JA Solar JAM66" casa "JA Solar"; "trina" casa "Trina"; "Sol" NÃO casa "Solis".
export function getBrandFicha(fabricante: string, tipo: 'modulo' | 'inversor'): MarcaFicha | null {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const alvo = norm(fabricante ?? '');
  if (!alvo) return null;
  // Casa quando: nome exato; OU o fabricante COMEÇA com a marca ("JA Solar JAM66" -> "JA Solar");
  // OU o fabricante é um prefixo de PALAVRA INTEIRA da marca ("JA" -> "JA Solar", mas NÃO "Sol" -> "Solis").
  const achada = FICHAS
    .filter(f => f.tipo === tipo)
    .find(f => {
      const m = norm(f.marca);
      if (alvo === m || alvo.startsWith(m)) return true;
      // prefixo de palavra inteira: o caractere seguinte na marca deve ser espaço ou fim
      if (m.startsWith(alvo)) {
        const next = m[alvo.length];
        return next === undefined || next === ' ';
      }
      return false;
    });
  return achada ?? null;
}

export { FICHAS as BRAND_FICHAS };
