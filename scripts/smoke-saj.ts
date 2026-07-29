// Smoke test do adapter SAJ contra a API real (roda manual, credenciais via env).
//   $env:SAJ_USER='...'; $env:SAJ_PASS='...'; npx tsx scripts/smoke-saj.ts
// NUNCA commitar credenciais. Sem env → sai com instrução.
import { sajAdapter } from '../src/modules/monitoring/adapters/saj.js';

const username = process.env.SAJ_USER;
const password = process.env.SAJ_PASS;
if (!username || !password) {
  console.error('Uso: SAJ_USER=<login> SAJ_PASS=<senha> npx tsx scripts/smoke-saj.ts');
  process.exit(1);
}

console.log('1) listSites (conta do instalador)…');
const sites = await sajAdapter.listSites!({ username, password });
if (!sites.ok) {
  console.error('   FALHOU:', sites.reason);
  process.exit(1);
}
console.log(`   ✔ ${sites.sites.length} plantas`);
for (const s of sites.sites.slice(0, 5)) {
  console.log(`   - ${s.apelido} · ${s.potencia_kwp ?? '?'} kWp · instalada ${s.data_instalacao ?? '?'} · uid ${s.externalId.slice(0, 8)}…`);
}

const alvo = sites.sites.find((s) => (s.potencia_kwp ?? 0) > 0) ?? sites.sites[0];
console.log(`\n2) fetchGeneration 7 dias — ${alvo.apelido}…`);
const hoje = new Date();
const iso = (d: Date) => d.toISOString().slice(0, 10);
const fim = iso(new Date(hoje.getTime() - 86400000));
const inicio = iso(new Date(hoje.getTime() - 7 * 86400000));
const g = await sajAdapter.fetchGeneration(alvo.credenciais, inicio, fim);
if (!g.ok) {
  console.error('   FALHOU:', g.reason);
  process.exit(1);
}
console.log(`   ✔ ${g.geracoes.length} dias · status: ${g.statusInversor ?? '(sem status)'}`);
for (const d of g.geracoes) console.log(`   ${d.data}: ${d.geracao_kwh} kWh`);

console.log('\n3) fetchGeneration cruzando mês (26/06→05/07)…');
const g2 = await sajAdapter.fetchGeneration(alvo.credenciais, '2026-06-26', '2026-07-05');
if (!g2.ok) {
  console.error('   FALHOU:', g2.reason);
  process.exit(1);
}
console.log(`   ✔ ${g2.geracoes.length} dias (esperado 10): ${g2.geracoes[0]?.data} … ${g2.geracoes[g2.geracoes.length - 1]?.data}`);

console.log('\nSMOKE SAJ: TUDO OK ✅');
