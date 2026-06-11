# EcoSof — Plano de Comercialização da Plataforma (spec aprovada)

**Data:** 11/06/2026 · **Aprovado por:** Junior · **Status:** aprovado, execução a iniciar

## O que é

Transformar a plataforma construída pra EcoSunPower (Eva atendente IA + propostas + dashboard +
financeiro + monitoramento + marketing) num produto de assinatura mensal chamado **EcoSof**,
vendido pra profissionais de energia/elétrica de fora da rede de contatos do Junior.

- **Marca:** EcoSof — "O software que nasceu dentro de uma empresa de energia de verdade.
  Com Eva, sua atendente IA." Apresentada como uma linha da EcoSunPower.
- **Domínio:** ecosof.com.br — REGISTRADO em 11/06/2026 (titular CNPJ EcoSunPower).
- **Público:** qualquer profissional da elétrica (integrador solar, projetista, eletricista
  residencial/industrial, automação). Anúncio aberto; o mercado mostra quem morde.
- **Proteção contra cópia:** nunca vender/instalar código — só acesso hospedado nos nossos
  servidores. Fosso real = Eva treinada + conhecimento embutido + velocidade de evolução.
  Complementos: marca no INPI (~R$ 400, pendente) + contrato de uso.

## Decisões cravadas (com o Junior, 10-11/06/2026)

1. **Capacidade:** ~10h/semana (Junior + filho, que estuda IA). Contrata quando crescer
   (marco: 8-10 clientes → 1 pessoa de suporte; 2 mensalidades pagam).
2. **Verba marketing:** R$ 300-500/mês, escala só com resultado.
3. **Preço (fundador, travado pra sempre pros 10 primeiros):**
   - Essencial **R$ 297/mês**: Eva no WhatsApp 24h + propostas com a marca do cliente + dashboard de leads
   - Completo **R$ 597/mês**: tudo + financeiro (imposto Simples) + monitoramento (SÓ marcas
     suportadas: SolarEdge, Deye, NEP, ABB — vender com lista honesta) + marketing IA
   - Implantação **R$ 497** única (cobre o trabalho e filtra curioso)
   - Bônus solar pros primeiros assinantes: curso grátis + ajuda no 1º projeto
4. **Modelo de confiança:** demo grátis na Eva vitrine + paga desde o dia 1 + garantia
   incondicional de 30 dias. SEM teste grátis de instância própria.
5. **Go-to-market:** Caminho A (funil Meta Ads → Eva vitrine no zap) como motor;
   conteúdo orgânico como apoio (filho, 2 posts/semana); parcerias/comunidades engavetadas 90 dias.
6. **Arquitetura fase 1:** clone isolado por cliente (serviço + banco + WhatsApp próprios).
   Zero risco pro sistema da EcoSunPower. Multi-empresa de verdade só depois de ~10 clientes (fase 2).

## O funil

```
Anúncio Meta (R$ 10-15/dia, interesses: solar/elétrica/automação, 25-55, Brasil)
  → clique pro WhatsApp da EVA VITRINE da EcoSof
  → ela se apresenta como O PRODUTO e demonstra em si mesma:
    qualifica o integrador (ramo, cidade, leads perdidos/mês),
    mostra proposta de exemplo + prova real (venda R$ 33k com R$ 255 de anúncio),
  → quente: link de pagamento OU agenda 15min com Junior
  → pagou: implantação em até 3 dias úteis (white glove)
```

- **Página ecosof.com.br** (1 tela): vídeo 90s do Junior contando a história real + botão
  "Converse com a Eva agora" + 2 planos + garantia + rodapé EcoSunPower.
- **Anúncio v1:** vídeo de tela gravada da Eva real trabalhando.
- **Meta honesta (R$ 400/mês de verba):** 2-4 assinantes nos primeiros 60 dias.

## Kit Clone (trabalho técnico, pré-requisito do 1º anúncio — 2-3 sessões)

1. Inventário de tudo que é "EcoSunPower" no código (logo, CNPJ, telefones, marcas, critério
   de lead, conhecimento da Eva, Responsável Técnico) → vira configuração trocável por cliente.
2. Instalador de banco: consolidar as 46 migrations num script único (banco novo em ~10 min).
3. Roteiro de implantação nível leigo (filho executa): Easypanel → banco → WABA do cliente →
   branding → conhecimento/preços do cliente → teste → entrega.
4. Eva vitrine da EcoSof (vendedora do funil) — instância própria com conhecimento de produto,
   preços, objeções, garantia.
5. Checklist de saúde dos clones (monitorar sem abrir um por um).

## Operação (10h/semana)

| Quem | Responsabilidade |
|---|---|
| Junior (4-5h) | aprovar anúncios, call 15min com quente, gravar vídeos, decidir exceções |
| Filho (5-6h) | implantações via roteiro, suporte 1º nível, posts, saúde dos clones |
| Claude | kit clone, Eva vitrine, página, contrato modelo, análise de campanha, produto |
| Eva vitrine | atender 100% dos cliques do anúncio, 24h |

## Números (cenário pé no chão)

| | M1 | M3 | M6 |
|---|---|---|---|
| Clientes | 1 | 4 | 8 |
| Receita (ticket médio ~R$ 400) | 400 | 1.600 | 3.200 |
| Custo por cliente (~R$ 200: IA+WABA+servidor) | 200 | 800 | 1.600 |
| Anúncio | 400 | 500 | 500 |
| Resultado | −200 | +300 | +1.100 |

Taxas de implantação (R$ 497/novo) cobrem o vermelho inicial. Semestre 1 = escola paga;
receita recorrente empilha e o aprendizado precifica o ano 2.

## Riscos e antídotos

| Risco | Antídoto |
|---|---|
| Cliente leigo sofre e cancela | implantação white glove (por isso a taxa de R$ 497) |
| Custo IA estoura com cliente pesado | limite de conversas/mês por plano (ex.: 300/1000), excedente pago |
| Inadimplência | suspensão automática após X dias (Asaas/InfinityPay) |
| Bagunça operacional com 10+ clones | checklist de saúde; gatilho da fase 2 (multi-empresa) |
| Cópia por concorrente | código nunca sai do servidor; fosso = Eva treinada + cicatrizes embutidas |
| LGPD (leads de terceiros) | cláusula no contrato: dados são do cliente, nós somos operadores |

## Pendências fora do código

- Marca EcoSof no INPI (~R$ 400, Junior faz com roteiro).
- CNAE de software no CNPJ — conversar com contador Edmilson.
- Conta Asaas/InfinityPay pra cobrança recorrente (manual nos 3 primeiros clientes é aceitável).
- Registrar ecossoft.com.br (variação de digitação) — recomendado, R$ 40/ano.

## Ordem de execução

1. Kit clone itens 1-2 (inventário + instalador de banco) — próxima sessão
2. Eva vitrine + página ecosof.com.br
3. Contrato modelo + link de pagamento
4. Junior grava vídeo da página + vídeo do anúncio v1
5. Campanha no ar (R$ 10-15/dia) → ajustar com dados
6. 1º cliente: implantação acompanhada de perto, virar estudo de caso
