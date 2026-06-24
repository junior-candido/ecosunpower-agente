// scripts/preview-dashboard-layout.ts
// Gera um HTML estático do layout do dashboard (sidebar com setores) pra
// revisão visual rápida — sem subir o app nem precisar de segredos.
// Uso: npx tsx scripts/preview-dashboard-layout.ts
// Saída: tmp/dashboard-layout.html

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { renderLayout } from '../src/modules/dashboard/views.js';
import type { DashUser } from '../src/modules/dashboard/permissions.js';

// Admin de mentira: isAdmin=true libera todos os itens (can() retorna true).
const adminMock: DashUser = {
  id: 'x',
  companyId: 'preview',
  nome: 'Preview Admin',
  login: 'admin',
  isAdmin: true,
  roleNome: 'Administrador',
  permissoes: {},
};

const html = renderLayout({
  active: 'blog',
  title: 'Preview',
  body: '<div style="padding:24px">conteúdo</div>',
  user: adminMock,
});

const outPath = resolve(process.cwd(), 'tmp/dashboard-layout.html');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, html, 'utf8');

console.log(`Preview gerado: ${outPath} (${html.length} bytes)`);
