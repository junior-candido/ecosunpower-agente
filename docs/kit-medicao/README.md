# Kit de medição — instalação e ligação

Procedimento do kit que a EcoSunPower vende (Shelly Pro 3EM + 1PM/2PM Gen4).
Escrito em 07/09/2026, com o kit na bancada.

---

## A regra que organiza tudo

**O Pro 3EM só olha. O 1PM e o 2PM entram no caminho da energia.**

```
Pro 3EM     a corrente NÃO passa dentro dele — abraça o fio com o TC.
            Só mede. Pode ficar em cima de um cabo de 63 A sem problema.

1PM / 2PM   a corrente PASSA POR DENTRO. São relés com medidor: medem
            E ligam/desligam, mas ficam em série com o circuito.
            Por isso têm limite de corrente.
```

Errar isso queima o aparelho ou o quadro.

---

## Shelly Pro 3EM — o medidor

### Ligação monofásica

```
Fase   ──►  borne C     (é o C que ALIMENTA o aparelho: o esquema diz "LC + POWER")
Neutro ──►  borne N
Jumper ──►  de C para A e para B
TC     ──►  conector preto, no fio de FASE que vai pra carga
            seta K→L apontando pra CARGA
```

**O jumper não é opcional.** No perfil *Monophase* o aparelho vira três medidores
independentes, cada um esperando a sua tensão. Sem tensão em A e B, ele acusa erro e
**fica com todos os LEDs vermelhos** — parece defeito e não é.

### Configuração

1. Segurar o **Reset por 5 s** (não passe de 10 — aí é reset de fábrica)
2. Conectar na rede `ShellyPro3EM-XXXXXX` → navegador em `http://192.168.33.1`
3. **Perfil → Monophase** (faça isso *primeiro*: trocar depois zera ajustes)
4. **Fuso → Brasília (UTC−3)**. Relógio errado desloca a janela de 15 minutos e o
   gráfico aponta pico na hora errada.
5. Wi-Fi: **só 2,4 GHz**. O aparelho não enxerga 5 GHz, e quase todo roteador usa o
   mesmo nome pras duas faixas — é a causa nº 1 de "não conecta".
6. **Onde der, use cabo de rede.** Quadro de metal com disjuntor chaveando do lado
   derruba Wi-Fi, e quando cai o cliente liga dizendo que "o seu equipamento parou".

### Aferição de partida — não pule

Ligue uma carga **acima de 2 A** (mais de 450 W em 220 V) e compare com o alicate no
mesmo fio.

| Faixa | Precisão do TC |
|---|---|
| 0 a 1 A | ±5% |
| 1 a 2 A | ±2% |
| **2 a 120 A** | **±1%** |

Testar com uma lâmpada de 60 W dá 5% de erro e parece defeito. **Não é** — é o TC no
fundo da escala.

O que conferir:
- **Corrente bate com o alicate?** Diferença acima de 2% = TC mal fechado, no fio
  errado, ou pegando fase e neutro juntos (aí lê **zero**, porque os campos se cancelam).
- **`P ≈ V × I` com carga resistiva?** Se a potência sair bem menor, **a tensão está numa
  fase e o TC em outra**.
- **Potência negativa?** TC invertido. Dá pra inverter por software, sem abrir o quadro.

### Como a injeção solar aparece

O aparelho vê o **sentido** da energia comparando corrente e tensão. Casa consumindo =
positivo; inversor gerando mais que o consumo = a sobra volta pra rede = **negativo**.

**Onde o TC fica decide o que o número significa:**

| TC em | Mede |
|---|---|
| ramal de entrada (cabo do medidor) | **o saldo**: compra ↔ injeção |
| cabo do inversor | só a geração |
| circuito interno | só aquele circuito — **nunca vê injeção** |

⚠️ Se o inversor estiver ligado *antes* do TC (do lado da rede), o TC não enxerga a
geração de jeito nenhum.

Arranjo com solar, usando os 3 canais:

| TC | Onde | Entrega |
|---|---|---|
| C | ramal de entrada | saldo (compra ↔ injeção) |
| A | cabo do inversor | geração |
| B | maior circuito | o vilão da conta |

E a conta fecha: **Consumo da casa = Geração + Saldo.**

---

## Shelly 1PM e 2PM Gen4 — os relés

| | 1PM Gen4 | 2PM Gen4 |
|---|---|---|
| Bornes | `O · SW · N · L · ⏚` | `O1 · O2 · S1 · S2 · N · L · ⏚` |
| Capacidade | **16 A / 240 V~** (e 10 A / 30 V⎓) | 2 canais |
| Alimentação | 110–240 V~ ou 24–30 V⎓ | 110–240 V~ ou 24 V⎓ |
| Extra | — | modo persiana / portão |

### O teto de 16 A decide o que cabe

**16 A × 220 V = 3.520 W.**

| Carga | Cabe? |
|---|---|
| Ar-condicionado 12.000 BTU (~1.100 W) | ✅ folgado |
| Ar 24.000 BTU (~2.200 W) | ✅ |
| Máquina de lavar, bomba pequena | ✅ |
| Torneira elétrica (3.500–4.500 W) | ⚠️ no limite ou estoura |
| **Chuveiro (5.500–7.500 W)** | ❌ **não** |

Para chuveiro, o Shelly **não vai no circuito**: ele aciona um **contator**, e o contator
chaveia a carga.

> Para carga **indutiva** (motor, compressor) o limite costuma ser menor que o resistivo.
> Conferir no manual antes de definir o ar-condicionado.

### 🔌 O neutro — confira ANTES de prometer

Os dois precisam de **neutro** (o borne `N`). E a caixa de interruptor brasileira quase
nunca tem: chega fase e retorno, só.

**Na visita, abra uma caixa de interruptor e olhe.** Se não houver neutro, ou o aparelho
vai no quadro (com adaptador DIN), ou entra mão de obra no orçamento. Descobrir isso na
hora da instalação é prejuízo e cara feia.

**Onde tem neutro garantido:** no quadro e na caixa de passagem do teto.

---

## ⚠️ As três armadilhas (custaram uma noite de campo, 07/09/2026)

**1. HTTPS trava o envio sem dizer nada.**
`Shelly.call("HTTP.POST", ...)` para servidor HTTPS fica **pendurado**: não retorna sucesso
nem erro, e o console mostra só a linha de início. Parece que o script morreu.
➡️ Use **`HTTP.Request` com `ssl_ca: "*"`**. Vale para toda instalação do kit.

**2. O nome do componente depende do perfil do aparelho.**

| Perfil | Componente | Campos |
|---|---|---|
| Trifásico | `em:0` e `emdata:0` | `c_voltage`, `c_act_power`, `c_pf`… |
| Monofásico | `em1:N` e `em1data:N` | `voltage`, `act_power`, `pf`… |

Pedir componente que não existe faz o script **morrer calado**. Confira no app antes: se a
tela mostra *Fase A / Fase B / Fase C + Total*, é **trifásico**.

**3. A linha do token tem que ser JavaScript, não a linha do EasyPanel.**
Certo: `var TOKEN = "valor";` — com aspas e ponto-e-vírgula.
Errado: colar `SHELLY_INGEST_TOKEN=valor` (nome errado, sem aspas → erro de sintaxe).

---

## Ligar na plataforma

O medidor fica na casa do cliente e a plataforma fica aqui — **não existe rede em comum**.
Ler por IP funciona na bancada e **não funciona no cliente**. (Descoberto na marra: o
Shelly da casa e o computador do escritório estavam ambos em `192.168.1.8`, em redes
diferentes.)

Então o aparelho **empurra**: o script [`shelly-pro3em-envio.js`](./shelly-pro3em-envio.js)
roda dentro dele e faz `POST` de minuto em minuto.

1. No servidor: `SHELLY_INGEST_TOKEN` configurado e migration 123 aplicada
2. No script: trocar `TOKEN` e, se o TC não estiver no canal C, o `CANAL`
3. App → `{ }` → **Criar novo roteiro** → colar → Salvar → Iniciar
4. **Ligar "Executar na inicialização"** — sem isso o script morre na primeira queda
   de energia e o cliente fica sem dado sem ninguém perceber
5. Conferir no painel se a leitura chegou

---

## O que se vende com isso

O monitoramento do inversor mostra **só a geração**. Não sabe quanto a casa gastou nem
quanto foi pra rede.

Este kit mostra as três coisas — e mostra o **pico de 15 minutos**, que é a janela em que
a distribuidora mede demanda e que o medidor dela **alisa**.

**É esse número que o cliente paga e nunca viu.** É ele que justifica a mensalidade, e é
ele que transforma uma medição em laudo.
