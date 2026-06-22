// src/modules/proposal/como-funciona-render.ts
// Seção "Do aceite à usina ligada": a jornada do cliente em formato de trilha de
// raios, com o processo em PARALELO (projeto+homologação ‖ compra de material).
// Conteúdo 100% estático — o processo é sempre o mesmo. Sem dados da proposta.
import { empresa } from '../empresa-config.js';
import { escapeHtml } from './format.js';

export function renderComoFuncionaSection(): string {
  const marca = escapeHtml(empresa().nomeFantasia);
  return `<section class="journey-section">
  <div class="container">
    <span class="section-tag">Sua jornada solar</span>
    <h2 class="section-title">Do aceite à usina ligada</h2>
    <p class="section-subtitle">Depois da assinatura, várias frentes correm ao mesmo tempo — por isso o prazo é enxuto e você não fica no escuro em nenhuma etapa.</p>
    <div class="jr-trail">
      <div class="jr-col">
        <div class="jr-bolt">✍️</div>
        <div class="jr-lbl">Aceite &amp; Contrato</div>
        <div class="jr-pz">Dia 0</div>
      </div>
      <div class="jr-par">
        <div class="jr-phd">⚡ Em paralelo — começa tudo junto após a assinatura</div>
        <div class="jr-prow">
          <span class="jr-ic">📐</span>
          <div>
            <div class="jr-pt">Projeto + Homologação</div>
            <div class="jr-pd">Responsável Técnico CREA/CFT elabora o projeto e protocola o pedido de acesso; a concessionária (Neoenergia-DF / Equatorial-GO) analisa e aprova — por lei até 15 dias (inversor ≤ 75 kW).</div>
          </div>
        </div>
        <div class="jr-prow">
          <span class="jr-ic">📦</span>
          <div>
            <div class="jr-pt">Compra &amp; entrega do material</div>
            <div class="jr-pd">Equipamentos pedidos e entregues nesse mesmo período.</div>
          </div>
        </div>
      </div>
      <div class="jr-col">
        <div class="jr-bolt">🔧</div>
        <div class="jr-lbl">Instalação</div>
        <div class="jr-pz">1–3 dias</div>
      </div>
      <div class="jr-col">
        <div class="jr-bolt">🔎</div>
        <div class="jr-lbl">Vistoria &amp; Medidor</div>
        <div class="jr-pz">~7 dias</div>
      </div>
      <div class="jr-col jr-fin">
        <div class="jr-bolt">⚡</div>
        <div class="jr-lbl">Usina Ligada</div>
        <div class="jr-pz">economia ✅</div>
      </div>
    </div>
    <div class="jr-total">Prazo total estimado: <b>cerca de 45 dias</b> — prazo de segurança, frequentemente antecipado, acompanhado de ponta a ponta pela ${marca}.</div>
  </div>
</section>`;
}
