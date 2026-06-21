// Pool de cenas do universo solar pros posts de marketing (anti-repetição).
// Cada post puxa uma cena diferente; pickScene evita repetir a última e varia
// cenário/seed pra mesma cena nunca sair igual.

export interface SolarScene {
  key: string;
  label: string;   // rótulo pt-BR (uso interno / log)
  prompt: string;  // prompt técnico base (EN — modelos respondem melhor)
}

// Sufixo de qualidade/realismo aplicado a todas (lições do teste 01/06).
const Q =
  'shot on a professional full-frame camera, realistic natural textures, ' +
  'true-to-life natural lighting, subtle film grain, photojournalistic realism, ' +
  'sharp where it matters, no CGI look, no plastic skin';

// Cuidado técnico recorrente com painéis (olho de engenheiro): alinhados, dentro
// da borda, sobre trilhos, nítidos — nunca "flutuando" ou borrados.
const PAINEIS =
  'monocrystalline solar panels neatly aligned in straight rows on aluminum rails, ' +
  'panels fully within the roof edges, dark blue modules with thin silver frames, sharp crisp detail';

export const SOLAR_SCENES: SolarScene[] = [
  {
    key: 'residencial-telhado',
    label: 'Residencial — telhado de telha cerâmica',
    prompt: `professional photo of an upscale Brazilian house, terracotta ceramic roof tiles (telha cerâmica) clearly visible, ${PAINEIS} mounted flush on the tiled roof, tropical garden, clear blue sky, ${Q}`,
  },
  {
    key: 'comercial',
    label: 'Comercial — telhado de empresa',
    prompt: `professional wide photo of a commercial business building in Brazil with a large flat/metal roof covered by ${PAINEIS}, sunny day, blue sky, ${Q}`,
  },
  {
    key: 'usina-solo',
    label: 'Usina em solo (fazenda/agro)',
    prompt: `professional aerial photo of a ground-mounted solar farm in the Brazilian countryside of Goiás, long rows of ${PAINEIS} on metal structures over green grass, distant gentle hills, blue sky, ${Q}`,
  },
  {
    key: 'hibrido-bateria',
    label: 'Sistema híbrido com bateria',
    prompt: `professional photo of a modern home energy setup: a sleek white wall-mounted home battery storage unit next to a solar inverter on a garage wall, clean cables, ${Q}`,
  },
  {
    key: 'carregador-ev',
    label: 'Carregador de carro elétrico',
    prompt: `professional photo of a modern Brazilian home garage with a wall-mounted EV charger and a white electric car plugged in charging, ${PAINEIS} on the ceramic tile roof above, sunny day, ${Q}`,
  },
  {
    key: 'close-paineis',
    label: 'Close nos painéis',
    prompt: `professional close-up photo of ${PAINEIS} on a rooftop, sky and clouds subtly reflected on the glass, low angle, ${Q}`,
  },
  {
    key: 'tecnico-instalando',
    label: 'Técnico instalando',
    prompt: `professional photo of a solar installer technician wearing safety helmet and harness installing ${PAINEIS} on a terracotta ceramic tile roof, hands working on the rails, bright sunny day in Brazil, ${Q}`,
  },
  {
    key: 'rural-agro',
    label: 'Propriedade rural / agro',
    prompt: `professional photo of a Brazilian rural farm property with ${PAINEIS} on a barn roof, green fields and farm equipment around, blue sky, ${Q}`,
  },
  {
    key: 'carport',
    label: 'Carport solar',
    prompt: `professional photo of a solar carport structure over a residential driveway in Brazil, ${PAINEIS} on the carport roof shading parked cars, sunny day, ${Q}`,
  },
  {
    key: 'vista-aerea',
    label: 'Vista aérea de obra residencial',
    prompt: `professional aerial drone photo looking down at a Brazilian house rooftop fully covered with ${PAINEIS}, ceramic tiles around the array, tropical neighborhood, sunny day, ${Q}`,
  },
];

// Pequenas variações de cenário pra mesma cena render diferente.
const VARIACOES = [
  'golden hour warm sunlight',
  'bright clear midday sun',
  'soft morning light',
  'dramatic late afternoon sky',
  'vivid blue sky with scattered clouds',
];

// Eixo de composição/estética, ortogonal à cena (seguro mesmo em cenas com
// enquadramento embutido como "vista aérea" ou "close").
const COMPOSICOES = [
  'documentary photography style, candid natural framing',
  'architectural photography, balanced composition',
  'editorial magazine look, shallow depth of field',
  'strong foreground with natural depth',
  'intimate detail-focused composition',
];

export interface PickedScene {
  scene: SolarScene;
  prompt: string;
  seed: number;
}

// Escolhe uma cena diferente das recentes (excludeKeys) + variação de luz +
// variação de composição + seed. rng injetável pra teste determinístico.
// Aceita string única por defesa (normaliza pra array).
export function pickScene(
  excludeKeys: string[] | string = [],
  rng: () => number = Math.random,
): PickedScene {
  const exclude = Array.isArray(excludeKeys) ? excludeKeys : [excludeKeys];
  const candidatas = SOLAR_SCENES.filter((s) => !exclude.includes(s.key));
  const pool = candidatas.length > 0 ? candidatas : SOLAR_SCENES;
  const scene = pool[Math.floor(rng() * pool.length)] ?? pool[0]!;
  const variacao = VARIACOES[Math.floor(rng() * VARIACOES.length)] ?? VARIACOES[0];
  const composicao = COMPOSICOES[Math.floor(rng() * COMPOSICOES.length)] ?? COMPOSICOES[0];
  const seed = Math.floor(rng() * 1_000_000);
  return { scene, prompt: `${scene.prompt}, ${variacao}, ${composicao}`, seed };
}
