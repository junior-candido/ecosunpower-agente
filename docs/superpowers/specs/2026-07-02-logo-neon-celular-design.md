# Logo neon do topo da proposta: brilho reduzido no celular

Data: 2026-07-02
Autor: Junior + Claude

## Problema

A logo prateada do topo das propostas tem um halo neon azul
(`drop-shadow(0 0 9px rgba(102,207,243,.75)) drop-shadow(0 0 20px rgba(31,184,232,.5))`)
calibrado pra logo de 64px em tela grande. No celular a logo encolhe pra 54px,
mas o halo continua no tamanho fixo — proporcionalmente maior, ele reflete
sobre as letras finas: **o "E" some e as demais letras escurecem**. Reclamação
do Junior em 02/07 testando a proposta de serviço no telefone.

## Decisão do Junior

**Só no celular.** Em tela grande o visual aprovado fica idêntico.

## O que muda

Dois arquivos, mesmos valores (os templates têm comentário pra manter em
sincronia):

1. `src/modules/proposal/template.ts` — regra `.hero .brand-logo` (~linha 201).
2. `src/modules/proposal/service-render.ts` — regra `.brand-logo` (~linha 142).

Em cada um, dentro do bloco `@media(max-width:768px)` **que já existe** (onde a
logo já encolhe pra 54px), sobrescrever o filtro com o halo na metade e mais
transparente:

```css
filter: drop-shadow(0 0 5px rgba(102,207,243,.45)) drop-shadow(0 0 10px rgba(31,184,232,.3));
```

Mantém o ar neon sem invadir as letras. Um número só pra calibrar depois, se o
Junior quiser mais/menos.

## O que NÃO muda

- Tela grande (>768px): filtro atual idêntico.
- Logo do rodapé (`.brand-logo.foot`): já é `filter:none`, intocada.
- Marca d'água dos gráficos, cores, layout, textos: intocados.
- Propostas já geradas ganham o ajuste ao serem reabertas (o HTML é rendido
  pelo template na hora; nada fica gravado por proposta).
- Sem migration, sem mudança de dado.

## Testes

- Testes de render existentes: os que casam trechos do CSS (se houver) seguem
  válidos — a regra desktop não muda; adicionar/ajustar asserção pra versão
  mobile nos testes de render dos dois templates (padrão dos testes
  `proposal-service-render`/`template` existentes: `toContain` no CSS).
- **Validação real:** gerar proposta de teste (solar e serviço) e o Junior
  abrir no celular — "E" legível, brilho ainda presente.
