# Spec — Eva Pós-venda ativa + tela de Relacionamento (peça 1 da trilha Pós-venda)

**Data:** 2026-06-25
**Repo:** `ecosunpower-agente` (dashboard + Eva no mesmo Express)
**Autor do produto:** Junior · brainstorm com Claude
**Trilha:** Pós-venda / Relacionamento Vitalício → peça (1) Eva Pós-venda ativa · (2) Gestão de Manutenção · (3) Portal do Cliente. Esta spec = peça (1).
**Depende de:** Fase 1 (permissões/claim/audit), Fase 2 (timeline `lead_atividades`, sidebar setorizada), módulo de monitoramento/abordagem existente.

---

## 1. Princípio do produto (cravado pelo Junior)
**Tudo que a Eva faz no automático tem o botão manual na plataforma** — pra (a) o time de vendedores ver e fazer, e (b) ter fallback se a Eva falhar (ex.: a janela de 24h do WhatsApp). Mesmo padrão do Blog (Eva no zap + aba no dashboard) e das tarefas/SLA (Eva cobra + painel). A Eva é o piloto automático; a plataforma é o **cockpit manual** do time.

## 2. O que JÁ existe (reusar, não reconstruir)
- **Eva pós-venda (`src/modules/monitoring/abordagem/`):** abordagens tipo `parabens`, `depoimento`, `ofertaLimpeza` (queda→limpeza), `queda`, `offline`, aniversário (`proactive-alerts/anniversary.ts`); com `redator.ts` (escreve a mensagem no tom da Eva, com `numeros-usina.ts`), `regras.ts`, `escada.ts` (escalonamento), `orquestrador.ts`, `abordagens-repo.ts`. Tabela `monitoring_abordagens` (migration 048) com `tipo/etapa/status/desfecho/ultima_resposta_cliente_em`. **LIVE mas em `PROACTIVE_ALERTS_DRY_RUN`** (só loga, não envia — aguardando validação).
- **Saúde da usina:** `alertas_sistema` (tipos `queda_geracao`, `sistema_offline`, `manutencao_devida`, `milestone_economia`, `oportunidade_upsell`, `falha_inversor`), `sistemas_clientes` (usina: potência, marca inversor, distribuidora, lead_id), `geracao_diaria`.
- **Timeline do cliente:** `lead_atividades` (Fase 2).

## 3. Escopo desta peça (o que ENTRA)
1. **Tela "Pós-venda / Relacionamento"** no dashboard (lado plataforma/manual + visão do time).
2. **Botões de ação manual** que reusam o `redator` da Eva e mandam via `wa.me` (fallback sem janela de 24h), gravando na timeline + abordagem.
3. **Sincronia Eva ↔ plataforma** (não duplica contato).
4. **Completar a Eva automática:** relatório mensal de geração + oferta de upgrade (gatilhos novos), e validar/ligar (tirar do DRY_RUN — decisão do Junior, fora do código).

### Não-objetivos (ficam pra outras peças/leva)
- Gestão de Manutenção interna (agendar/executar/cobrar, contratos recorrentes) = **peça (2)**.
- Portal do Cliente (login do cliente) = **peça (3)**.
- Templates WABA aprovados pra envio automático fora da janela (o envio manual via wa.me resolve por ora; template é melhoria futura).

---

## 4. A tela `/dashboard/pos-venda`

### 4.1 Bloco 1 — A lista (guiada por atenção)
- Setor **"Pós-venda"** na sidebar (item novo; área de permissão `usinas` por ora — ver §6). Gating `exigir('usinas','visualizar')`.
- Lista os **clientes com usina** (têm `sistemas_clientes` OU `installation_status IN (operando, pos_venda_concluido)`).
- Cada cliente = linha compacta (espírito kanban):
  - **Cliente:** nome · telefone · cidade.
  - **Usina:** potência · marca inversor · distribuidora.
  - **🚦 Saúde** (semáforo): 🟢 gerando ok · 🟡 queda/manutenção devida · 🔴 offline/falha — derivado de `alertas_sistema` abertos + geração recente (`geracao_diaria`).
  - **❤️ Relacionamento:** última abordagem/contato ("há 3 meses") + **próxima ação sugerida** ("🎂 aniversário em 5 dias", "🧹 limpeza recomendada", "🔋 elegível upgrade").
  - **Botões** (§4.2).
- **Ordenação guiada por atenção:** 🔴 offline/queda primeiro → depois maior tempo **sem contato**. (igual o selo de SLA do kanban).
- **Filtros:** Precisam de atenção · Aniversário próximo · Sem contato há X · Elegível upgrade.

### 4.2 Bloco 2 — Botões de ação (manual, com fallback)
Botões (mostra só os pertinentes ao cliente): 🎉 **Parabéns** · 📊 **Relatório do mês** · 🧹 **Ofertar limpeza/manutenção** · ⭐ **Pedir depoimento** · 🔋 **Ofertar upgrade** (bateria/EV/ampliação) · 📞 **Registrar contato/nota** (só loga, sem mensagem).

Fluxo ao clicar:
1. Abre **preview da mensagem já escrita** — gerada pelo **`redator` da Eva** com os dados reais do cliente (geração/economia/usina). Vendedor revisa/edita.
2. **"Mandar no WhatsApp"** → abre `wa.me/<cliente>?text=<mensagem>` → vendedor envia do próprio WhatsApp. ✅ **Fallback da janela de 24h** (o humano não esbarra na regra do WABA). Alternativa "Copiar".
3. Ao confirmar, **registra na `lead_atividades`** (timeline) + **abre/atualiza `monitoring_abordagens`** do tipo correspondente.
4. **📞 Registrar contato** só grava atividade `ligacao`/`nota` + atualiza `last_contact_at` (sem mensagem).

**Inteligência:** a "próxima ação sugerida" **destaca o botão certo** (faz 1 ano → 🎉; geração caiu → 🧹; conta cresceu → 🔋).

### 4.3 Bloco 3 — dados, permissões, sincronia
- **Funções PURAS testáveis (TDD):** `saudeUsina(alertas, geracaoRecente) → 'verde'|'amarelo'|'vermelho'`; `proximaAcaoPosVenda(cliente, usina, abordagens, hoje) → {tipo, label, urgencia}`; `elegivelUpgrade(usina, conta) → boolean`.
- **Permissões:** área `usinas` (vendedor/pós-venda vê e faz; admin tudo). (Avaliar área `pos_venda` própria numa fase futura.)
- **Sincronia:** o botão manual grava na **mesma** `monitoring_abordagens` da Eva → a Eva já checa abordagem aberta/recente antes de mandar (`abordagens-repo`) → **não duplica**. A tela lê a mesma tabela → mostra o que a Eva já fez. Gravar `desfecho`/`nota` quando o vendedor age manualmente.
- **Reuso do redator:** as mensagens dos botões chamam o `redator.ts` (mesmo gerador da Eva), variando por tipo. Sem texto hardcoded divergente.

### 4.4 Completar a Eva automática (gatilhos novos)
- **Relatório mensal de geração:** 1×/mês por usina, a Eva oferece (ou o botão manda) "Seu mês: gerou X kWh, economizou R$Y". Novo `tipo` de abordagem `relatorio_mensal` (ou reusa `parabens`/milestone). Idempotente por mês.
- **Oferta de upgrade:** quando `oportunidade_upsell` (conta cresceu / perfil novo) → abordagem `oferta_upgrade`. Reusa o alerta `oportunidade_upsell` existente.
- Ambos respeitam o DRY_RUN (o Junior liga quando validar).

---

## 5. Arquitetura / arquivos
Novos (pequenos, isolados, testáveis):
- `src/modules/dashboard/pos-venda-saude.ts` — `saudeUsina`, `proximaAcaoPosVenda`, `elegivelUpgrade` (puras).
- `src/modules/dashboard/pos-venda-queries.ts` — junta clientes+usina+saúde+relacionamento pra a tela (best-effort, reusa queries de monitoramento/abordagem).
- `src/modules/dashboard/pos-venda-views.ts` — `renderPosVendaPage` (lista + botões + modal de preview) via `renderLayout`.
- Rotas no `router.ts`: `GET /pos-venda`, `POST /pos-venda/:leadId/acao` (gera a mensagem via redator, registra atividade + abordagem, devolve o `wa.me` link ou marca como registrado).
Modificados:
- `views.ts` — item "Pós-venda" na sidebar (setor Operação ou próprio).
- `monitoring/abordagem/` — expor o `redator` pra a rota usar (se ainda não exportado); novos tipos `relatorio_mensal`/`oferta_upgrade` nas regras (se o Junior quiser ligar já).
- Migration **só se** precisar de `tipo` novo no CHECK de `monitoring_abordagens` (avaliar no plano; senão reusa tipos existentes).

## 6. Testes e implantação
- **Testes (vitest, puros):** `saudeUsina` (semáforo por alertas/geração), `proximaAcaoPosVenda` (a sugestão certa por contexto/tempo), `elegivelUpgrade`, dedupe Eva↔manual. Review 3× + tsc limpo antes do push.
- **Implantação:** migration (se houver) antes do deploy. Push → (migration) → Implantar → smoke (abrir /pos-venda, ver clientes+saúde, clicar 🎉 → preview → wa.me → conferir timeline/abordagem; conferir que a Eva não re-manda). Nunca pushar sem OK do Junior.

## 7. Decisões fechadas no brainstorm
- Princípio "Eva auto + botão manual na plataforma" vale pra TODA ação de pós-venda.
- Envio manual via `wa.me` (resolve a janela de 24h sem template).
- Reusa `monitoring_abordagens` (uma fonte de verdade Eva↔time, sem duplicar contato) e o `redator` (tom único).
- Tela guiada por atenção (saúde + tempo sem contato), igual o funil.
- Ordem da trilha: (1) Eva Pós-venda ativa [esta] → (2) Gestão de Manutenção → (3) Portal do Cliente.
