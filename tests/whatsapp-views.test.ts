import { describe, it, expect } from 'vitest';
import { renderWhatsappPage } from '../src/modules/dashboard/whatsapp-views.js';
import { renderLayout } from '../src/modules/dashboard/views.js';
import type { DashUser } from '../src/modules/dashboard/permissions.js';

const ECOSUN = '00000000-0000-0000-0000-000000000001';
const tenantAdmin = { id: 'u1', companyId: 'empresa-conquista', companyNome: 'Conquista <Solar>', nome: 'Jimena', login: 'j', roleId: 'r', isAdmin: true, permissoes: {} } as unknown as DashUser;
const ecosunAdmin = { ...tenantAdmin, companyId: ECOSUN, companyNome: 'EcoSunPower' } as unknown as DashUser;

describe('whatsapp-views — Conectar WhatsApp (tenant self-service)', () => {
  it('sem instância: aviso "ainda não foi preparado", sem script de polling', () => {
    const html = renderWhatsappPage({ user: tenantAdmin, instancia: null, estado: 'desconhecido' });
    expect(html).toContain('ainda não foi preparado');
    expect(html).not.toContain('/dashboard/whatsapp/qr.json');
    expect(html).toContain('Conquista &lt;Solar&gt;'); // escapado
  });

  it('com instância: QR + estado + polling, nome da instância escapado', () => {
    const html = renderWhatsappPage({ user: tenantAdmin, instancia: 'conquista-solar', estado: 'connecting' });
    expect(html).toContain('id="qr"');
    expect(html).toContain('/dashboard/whatsapp/qr.json');
    expect(html).toContain('/dashboard/whatsapp/estado.json');
    expect(html).toContain('Aguardando conexão');
    expect(html).toContain('<code>conquista-solar</code>');
    expect(html).not.toContain('src=""');
    expect(html).toContain("'inexistente'"); // tela para e explica quando a instância sumiu
    const ok = renderWhatsappPage({ user: tenantAdmin, instancia: 'x', estado: 'open' });
    expect(ok).toContain('WhatsApp conectado!');
  });

  it('menu: tenant admin vê "Conectar WhatsApp"; EcoSun não (soTenant)', () => {
    const t = renderLayout({ active: 'whatsapp', title: 't', body: '', user: tenantAdmin });
    expect(t).toContain('Conectar WhatsApp');
    const e = renderLayout({ active: 'whatsapp', title: 't', body: '', user: ecosunAdmin });
    expect(e).not.toContain('Conectar WhatsApp');
  });
});
