# O Prédio Vivo — multi-tenant em 3D no dashboard EcoSun

**Data:** 28/07/2026 · **Visão do Junior, aprovada em conversa** · Build: F1 a partir de 28/07

## A visão

O multi-tenant da plataforma é descrito desde a arquitetura como "cada empresa é
um prédio/apartamento isolado". Esta tela torna a metáfora **literal e viva**:
um **prédio 3D de verdade** no dashboard da EcoSun (só admin da casa), onde cada
apartamento é uma empresa (EcoSun, SunBright, próximos tenants) — **um organismo
vivo**: luz acesa = atividade real agora; cada evento novo faz a janela piscar;
o prédio "respira". Clicar num apto abre o **cockpit do tenant na mesma tela**,
com dados e controles (engole a sessão pendente "Empresas com Assentos").

É a tela de monitor-na-parede do escritório — e a tela que vende a plataforma.

## Estética (decidida)

**3D de verdade (Three.js), estilizado — NUNCA realismo.** Low-poly noturno,
referência "Cities: Skylines / Monument Valley à noite": prédio limpo, janelas
**emissivas** brilhando, céu escuro com gradiente, chão refletindo de leve.
Auto-rotação lenta; arrastar orbita; scroll dá zoom. Bloom/glow via materiais
emissivos + sprites aditivos (sem post-processing pesado). `prefers-reduced-motion`
para a auto-rotação.

## Comportamento vivo

- **Luz do apto:** empresa com evento nos últimos N minutos (padrão 10) = janelas
  acesas; sem atividade, esmaece gradualmente até apagar.
- **Batimento:** evento novo do Elo → a janela da empresa pisca na hora (flash
  emissivo curto). Fonte: a mesma espinha de eventos da tela do Elo.
- **Respiração:** brilho ambiente do prédio pulsa devagar; frequência sobe com
  eventos/minuto da plataforma inteira.
- **Veia de energia:** pulso de luz subindo a fachada a cada evento (partícula).

## Interação

- **Clique no apto** (raycasting) → painel lateral do tenant:
  - Identidade: nome, logo (Storage `tenants/<id>/logo.png`), desde quando
  - Números: usuários/assentos, usinas, leads, últimos eventos ("trabalhos feitos")
  - **Controles cross-tenant (F3):** criar/editar usuário e papel, ver módulos
    (áreas do papel), atalho de importar — sem trocar de login. Toda escrita
    respeita RLS/auditoria já existentes.
- EcoSun ocupa a cobertura; tenants ganham andares por ordem de criação.
- Empresa nova no banco = andar novo aparece (a tela lê `companies`).

## Técnica

- Rota `soEcosun` no dashboard (ex.: `/dashboard/predio`), item de menu na seção
  Visão geral (`soEcosun: true`).
- Three.js **via CDN pinado** (uma tela só carrega; aceito ~600KB nesta rota).
- Dados: endpoint JSON `soEcosun` com `companies` + contadores + atividade.
- Tempo real: **F1 usa polling** (10s, mesmo padrão do auto-refresh da tela de
  monitoramento). SSE/stream do Elo é upgrade de F2 se o polling ficar pobre.
- **F0 (investigação, primeiro passo do build):** conferir se a espinha de
  eventos do Elo carrega `company_id` (a tela do cérebro é da casa); se não
  carregar, definir o proxy de atividade por tenant (audit log + updated_at de
  leads/usinas/sessões) e anotar a migration/fatia necessária.

## Fatias

- **F0** — investigação da atividade por empresa (acima). Sem código de tela.
- **F1** — o prédio: geometria low-poly gerada por dados (1 andar/empresa),
  materiais emissivos, auto-rotação + órbita + zoom, luzes por atividade via
  polling, clique → painel lateral **leitura** (identidade + números + últimos
  eventos). Preview aprovado pelo Junior ANTES de subir (regra do visual).
- **F2** — vida plena: batimento por evento (stream/polling fino), veia de
  energia, respiração ligada ao ritmo, esmaecimento gradual.
- **F3** — controles cross-tenant no painel (o "Empresas com Assentos"):
  usuários, papéis, módulos. Fatia com atenção dobrada de segurança (tudo
  `soEcosun` + auditoria).

### Fora de escopo
Versão pra tenants verem o próprio apto (ideia de venda futura); realismo
arquitetônico; mobile como alvo primário (funciona, não é o foco).

## Riscos e cuidados
- 3D feio é pior que 2D bonito → estilização low-poly disciplinada, paleta
  noturna única, NADA de texturas realistas.
- Performance: geometria trivial (dezenas de meshes); sem sombras dinâmicas
  caras; requestAnimationFrame pausado com aba oculta.
- Segurança: tela e endpoint só EcoSun; nenhum dado de tenant vaza pra outro
  lugar (é tela da casa, mas os padrões de crachá continuam nos controles F3).
