# Cenarios Reais de Dimensionamento - Raciocinio Aplicado

Estes sao modelos de raciocinio para a Eva usar quando o cliente apresentar um
cenario similar. Valores sao estimativas iniciais e devem ser ajustados com
dados reais.

## Regra geral de raciocinio
1. Entender o problema
2. Identificar o objetivo do cliente
3. Levantar limitacoes
4. Escolher o tipo de sistema adequado
5. Explicar com linguagem clara
6. Deixar transparente o que e estimativa e o que depende de analise real

---

## Cenario 1 - Residencia com conta alta
**Contexto:** casa com ~600 kWh/mes, boa incidencia solar, sem sombreamento.

**Raciocinio:** sistema on-grid para reducao da conta. Dimensionamento
inicial: ~4.5 a 5.5 kWp (fator 0.80 de perdas, HSP 5.2 em BSB/GO).

**Solucao:** on-grid residencial.
**Atencao:** confirmar padrao da unidade, espaco disponivel e historico de
consumo (media 12 meses).

---

## Cenario 2 - Cliente que quer "zerar a conta"
**Contexto:** cliente quer eliminar totalmente a conta.

**Raciocinio:** explicar que o sistema reduz fortemente, mas sempre
existe um valor minimo mensal — OU o custo de disponibilidade (piso,
30/50/100 kWh conforme mono/bi/tri), OU o Fio B aplicado sobre a
energia compensada — o que for maior no mes. Nao sao somados. Nao
prometer conta zerada.

**Solucao:** on-grid ajustado ao consumo compensavel.
**Atencao:** sempre falar em reducao de 90-95%, nao em zerar.

---

## Cenario 3 - Cliente com falta de energia frequente
**Contexto:** residencia ou comercio com quedas frequentes, quer manter
cargas essenciais.

**Raciocinio:** on-grid comum NAO resolve (desliga por anti-ilhamento). O
correto e hibrido com baterias, dimensionado para CARGAS PRIORITARIAS
(iluminacao, internet, cameras, freezer, geladeira) — nao o consumo total.

**Solucao:** sistema hibrido com banco dimensionado para cargas criticas.
**Atencao:** separar cargas prioritarias antes de dimensionar a bateria.

---

## Cenario 4 - Propriedade rural com bombeamento
**Contexto:** fazenda/chacara com bomba d'agua e cargas rurais.

**Raciocinio:** entender potencia da bomba, tempo de operacao, horario de
uso e disponibilidade de rede. Com rede: on-grid ou hibrido. Sem rede:
off-grid.

**Solucao:** sistema rural com foco em bombeamento + cargas associadas.
**Atencao:** motores exigem analise cuidadosa de inversor (corrente de
partida pode ser 3-7x a nominal).

---

## Cenario 5 - Comercio com consumo diurno forte
**Contexto:** empresa/comercio com maior consumo em horario comercial.

**Raciocinio:** perfil muito favoravel — consumo coincide com geracao. Alta
aderencia economica do on-grid.

**Solucao:** on-grid comercial.
**Atencao:** verificar demanda contratada (Grupo A?), historico, area
disponivel e eventual expansao futura.

---

## Cenario 6 - Cliente com pouco espaco no telhado
**Contexto:** cliente quer alta compensacao, telhado pequeno.

**Raciocinio:** avaliar limitacao fisica antes de prometer resultado.
Opcoes: modulos mais potentes (Trina 720W, JA 670W), rever expectativa ou
considerar outro local (laje, solo, cobertura de garagem).

**Solucao:** projeto otimizado por area disponivel.
**Atencao:** nao vender potencia incompativel com o espaco real.

---

## Cenario 7 - Cliente com sombreamento parcial
**Contexto:** arvores, predios ou obstaculos afetam parte do telhado.

**Raciocinio:** sombreamento reduz desempenho significativamente. Pode
exigir rearranjo de layout, micro inversores (cada painel independente) ou
SolarEdge (otimizadores).

**Solucao:** projeto com analise detalhada e layout ajustado + micro
inversor ou otimizador.
**Atencao:** nunca ignorar sombreamento no dimensionamento — e o erro mais
comum.

---

## Cenario 8 - Cliente com orcamento apertado
**Contexto:** quer solar, mas tem limite financeiro.

**Raciocinio:** buscar equilibrio entre tecnica e realidade financeira.
Sistema menor preparado para expansao futura (micro inversores facilitam),
desde que faca sentido tecnico e economico. Financiamento tambem e opcao.

**Solucao:** projeto inicial ajustado ao orcamento com visao de expansao.
**Atencao:** nao sacrificar seguranca e qualidade para reduzir preco. Melhor
um sistema menor bem feito que um grande mal feito.

---

## Cenario 9 - Cliente comparando on-grid vs hibrido
**Contexto:** cliente nao sabe se escolhe economia ou backup.

**Raciocinio:** explicar que on-grid prioriza economia com menor
investimento inicial. Hibrido agrega backup, mas custa 1.5 a 2x mais e tem
logica de uso diferente.

**Solucao:** depende da prioridade real.
**Atencao:** fazer o cliente decidir por necessidade, nao por curiosidade
tecnologica. Pergunta chave: "voce tem quedas frequentes ou cargas que nao
podem parar?"

---

## Cenario 10 - Cliente empresarial com cargas criticas
**Contexto:** empresa precisa manter equipamentos funcionando em quedas.

**Raciocinio:** separar cargas essenciais das nao essenciais, avaliar
potencia, tempo de autonomia e prioridade operacional. Pode ser BESS
comercial com arbitragem tarifaria.

**Solucao:** sistema hibrido segmentado por cargas prioritarias ou BESS.
**Atencao:** projeto mal definido eleva custo sem necessidade. Listar
equipamentos critico por critico.
