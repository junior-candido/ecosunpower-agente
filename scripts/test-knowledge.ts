import { KnowledgeBase } from '../src/modules/knowledge.js';
import { detectTopics } from '../src/modules/knowledge-topics.js';
import { join } from 'path';

const kb = new KnowledgeBase(join(process.cwd(), 'conhecimento'));
kb.load();

console.log('--- CORE ---');
const coreSize = kb.getCore().length;
console.log(`Core: ${coreSize} chars = ~${Math.ceil(coreSize/4)} tokens`);

console.log('\n--- TESTES DE DETECCAO ---');
const tests = [
  'qual o preco de um sistema 5 kwp pra residencia em brasilia',
  'qual inversor recomenda com bateria deye',
  'sou de goiania, tem instalacao por ai?',
  'como funciona a lei 14.300?',
  'tenho carro eletrico, da pra carregar com solar?',
  'quanto custa? qual a forma de pagamento?',
  'quero saber sobre solaredge',
  'oi, tudo bem?',
];

for (const t of tests) {
  const topics = detectTopics(t);
  const specSize = kb.getSpecialized(topics).length;
  console.log(`"${t}"`);
  console.log(`  -> [${topics.join(', ')}] = +${Math.ceil(specSize/4)} tokens (total: ${Math.ceil((coreSize+specSize)/4)})`);
}

console.log('\n--- TOTAL FILES ---');
console.log(`getContent() (legacy): ${kb.getContent().length} chars = ~${Math.ceil(kb.getContent().length/4)} tokens`);
