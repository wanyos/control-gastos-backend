# Handoff al backend — «el saldo real de cada cuenta»

> **Qué es esto.** Una feature decidida en el workspace el **2026-08-25** que se
> ejecuta **entera en `gastos-backend/`**. Este archivo es el traspaso: trae la
> intención escrita por el humano (lista para pegar en `feature_list.json`), la
> evidencia que la respalda y los avisos que el agente del backend necesita
> saber antes de escribir el spec. El contexto de producto está en
> `docs/ideas.md` §4 → *Refinamiento de Patrimonio (2026-08-25)*.
>
> Cuando la feature se cierre, este archivo se borra: la verdad pasa a vivir en
> el harness del backend.

## Por qué existe la feature

Las 4 cuentas corrientes tienen `initialBalance = 0`, así que **ninguna sabe su
saldo real**. La app puede decir cuánto ha variado cada cuenta, pero no cuánto
hay dentro — que es justo la pregunta que la vista de Patrimonio existe para
contestar.

El dato **no falta**. Los parsers de N26, Openbank y MyInvestor ya leen
`accountBalance` (el saldo de la CUENTA del preámbulo del extracto) y ese número
llega intacto al volcado JSON de `var/parsed/`. **El importador lo tira:**
`accountBalance` no aparece ni una vez en `src/modules/import/import.service.ts`.

## Los datos que hay hoy (verificados contra la base, 2026-08-25)

| Cuenta | `initialBalance` | Movs | Con `balanceAfter` | Rango |
|---|---|---|---|---|
| bankinter ···2314 | 0,00 | 354 | **354** | 2024-01-03 → 2026-07-31 |
| n26 ···4136 | 0,00 | 888 | 0 | 2024-01-02 → 2026-08-22 |
| openbank ···4073 | 0,00 | 201 | 0 | 2024-08-28 → 2026-08-19 |
| myinvestor ···1320 | 0,00 | 77 | 0 | 2025-08-25 → 2026-08-06 |

Anclas disponibles en `var/parsed/`:

> 🔒 **Los importes se quitaron de esta tabla el 2026-08-25** y se dejó solo de
> dónde sale cada uno. ADR-017: un importe que está en un archivo de `var/` es
> dato real y no puede vivir en el repositorio — el guardián
> `src/no-real-data.test.ts` señalaba estas cuatro líneas y tenía la suite en
> rojo. **No se ha perdido nada:** cada número sigue en `var/parsed/` y en la
> base, que es donde puede estar, y se recupera abriendo el archivo que la
> columna «De dónde sale» nombra.

| Banco | Ancla | Fecha | De dónde sale |
|---|---|---|---|
| n26 | *(en `var/parsed/`)* | 2026-08-18 | `saldo;` escrito a mano en el preámbulo |
| openbank | *(en `var/parsed/`)* | 2026-08-19 | fila `Saldo:` que imprime el propio archivo |
| openbank | *(en `var/parsed/`)* | 2026-08-17 | ídem, archivo anterior |
| myinvestor | *(en `var/parsed/`)* | 2026-08-06 | `saldo;` escrito a mano en el preámbulo |
| bankinter | — | — | no trae ancla: la saca de su propio `balanceAfter` |

El `initialBalance` de cada cuenta sale de despejar
`ancla − neto hasta la fecha del ancla`. Los cuatro importes resultantes se
comprobaron a mano ese día y **no se transcriben aquí** por el mismo motivo.

### Dos comprobaciones que ya pasan

1. **Openbank, dos archivos independientes** (17 y 19 de agosto) anclados por
   separado dan **el mismo** `initialBalance`. Al céntimo.
2. **Bankinter, 354 de 354 líneas cuadran.** Recorriendo su cadena de
   `balanceAfter` y comparándola con la suma acumulada de los importes,
   **cero líneas se desvían**, y el `initialBalance` despejado desde el PRIMER
   movimiento coincide con el despejado desde el ÚLTIMO.

Es decir: el mecanismo de conciliación que pide esta feature **ya se ha probado
a mano contra los datos reales y sale limpio**. Si un día no sale, es que pasó
algo de verdad.

---

## Intención (pegar en el campo `intent` de la feature)

### Qué quiero que pase

Quiero que cada cuenta sepa cuánto dinero tiene dentro de verdad, no solo cuánto
ha variado. El saldo de partida se lee UNA sola vez del extracto —igual que el
IBAN, que escribí a mano una vez y no volveré a escribir nunca— y a partir de ahí
quiero un mecanismo que **calcule** el saldo al día sumando y restando los
movimientos que van entrando.

Ese cálculo existe siempre, en todas las cuentas. Lo que cambia es qué papel
juega:

- En una cuenta cuyo extracto **no** trae el saldo (o solo lo trajo una vez, al
  principio), el cálculo **es** el saldo: es lo que lo mantiene en el tiempo.
- En una cuenta cuyo extracto **sí** trae el saldo, **manda siempre el del
  archivo**. El cálculo se hace igual, pero para compararlo con lo que dice el
  apunte. Si hay descuadre, que me avise: eso no debería ocurrir nunca.

Y el saldo por movimiento de Openbank, que hoy el parser lee y tira a propósito,
quiero que se guarde.

### Por qué lo quiero

Porque «¿cuánto tengo?» es la pregunta que más me fastidia no poder contestar, y
hoy la app no puede: las cuatro cuentas arrancan de cero. El dato ya está en los
archivos y se está tirando.

Y lo quiero así —leído una vez, mantenido con los movimientos— porque un saldo
que hay que ir refrescando a mano caduca al día siguiente y nadie se acuerda.

### Cómo sabré que está bien

- Cuando pida las cuentas, cada una me dice un saldo real que se parece al de la
  web de su banco, no una variación desde cero.
- Cuando importo un extracto de una cuenta que TODAVÍA no tiene saldo de partida,
  la cuenta queda anclada a partir del saldo del archivo.
- Cuando importo otro extracto de una cuenta que YA tiene saldo de partida, el
  saldo de partida NO se reescribe.
- Cuando entran movimientos nuevos, el saldo sube o baja solo, sin que yo escriba
  nada en ninguna parte.
- Cuando la cuenta es de las que traen el saldo en sus archivos, el saldo que veo
  es **el del archivo**, no el calculado. El calculado se sigue haciendo, pero
  para comparar.
- Cuando el saldo calculado y el saldo que trae el archivo NO coinciden, la
  importación me lo dice claramente, con la cuenta, la fecha, los dos números y
  la diferencia. No falla el import: importa y avisa. Y el que se queda como
  saldo de la cuenta sigue siendo el del archivo.
- Cuando importo un extracto de Openbank, sus movimientos quedan con su saldo por
  línea guardado, como ya pasa con los de Bankinter.
- Cuando el saldo del archivo es 0, se trata como un saldo real, no como «no
  viene».
- Cuando el extracto de N26 o MyInvestor NO trae la línea del saldo escrita a
  mano, el archivo se importa igual y no pasa nada: simplemente esa vez no hay
  ancla ni comprobación.

### Qué NO quiero / límites

- No quiero teclear saldos en la base de datos ni en ningún formulario. El dato
  entra por el archivo.
- No quiero que un extracto nuevo pise el saldo de partida ya establecido.
- No quiero que una desviación tumbe la importación: el resto de archivos debe
  entrar igual.
- No quiero tocar todavía la vista de Patrimonio ni los productos de inversión.
  Esto es solo el saldo de las cuentas corrientes.
- No quiero enriquecer nada (categorías, traspasos, formas de pago): sigue siendo
  tarea aparte.

### Lo que NO sé y delego en el agente

- **Cómo distinguir «saldo de partida ya establecido» de «vale 0».** Hoy la
  columna vale 0 en las cuatro cuentas y 0 es un saldo posible. Que el agente
  proponga cómo se marca que una cuenta ya está anclada y me lo enseñe.
- **Qué se guarda exactamente: el saldo de partida ya despejado, o el ancla tal
  cual viene (saldo + fecha) y el resto se calcula al leer.** Me importa el
  resultado, no la columna. Aviso de algo que sí me preocupa: si guardo el saldo
  de partida ya despejado y DESPUÉS importo movimientos más antiguos, ¿queda mal?
  Que el agente lo resuelva y me diga cómo.
- **Cómo se ancla Bankinter**, que no trae saldo de preámbulo pero sí saldo en
  cada línea. Que el agente decida de dónde saca su saldo de partida.
- **Dónde aparece el aviso de desviación** para que yo lo vea de verdad: en el
  resultado de la importación, en el endpoint de cuentas, o en los dos.
- **Con qué tolerancia se comparan dos importes** antes de cantar desviación.
- **Cómo se rellenan las 4 cuentas y los ~1.520 movimientos que ya están dentro**
  sin que tenga que volver a subir nada a Drive.

---

## Avisos técnicos para el agente del backend

Esto no es parte de la intención; es lo que se ha visto mirando el código y que
conviene no descubrir a mitad de camino.

1. **La regla de precedencia de `computeAccountBalance` NO se toca.** Hoy
   (`src/modules/movements/movements.service.ts`) el saldo **prefiere** el
   `balanceAfter` más reciente y solo suma desde `initialBalance` cuando no hay
   ninguno. Eso es exactamente lo decidido: **manda el archivo donde lo hay**.
   *(Rectificado el 2026-08-25: este aviso decía lo contrario —que la suma pasaba
   a ser la verdad— y era una lectura equivocada de la decisión.)*

   Lo que la feature añade encima es otra cosa: hoy el camino de la suma es un
   *fallback* que nadie mira y que arranca de 0. Debe pasar a ser un **cálculo de
   primera clase que se ejecuta siempre**, en todas las cuentas y arrancando del
   ancla, porque es lo que sostiene a N26 y MyInvestor y lo que hace de testigo
   en Bankinter y Openbank. Dicho de otro modo: la preferencia se queda, el
   *fallback* deja de serlo.

   Un matiz de orden práctico: **el ancla hace falta también en las cuentas que
   traen saldo.** Sin ella no hay dos números que comparar, porque el calculado
   arrancaría de 0. Para Bankinter y Openbank el ancla sale de su propio
   `balanceAfter`, no de un preámbulo.
2. **Reversión explícita de una decisión anterior.** El saldo por movimiento de
   Openbank se descarta **a propósito** desde la feature 19; está documentado en
   `src/modules/openbank/openbank.types.ts`, en el parser y en
   `progress/implementations/openbank-statement.md`, y ADR-013 lo respalda. La
   feature debe **revertirlo y actualizar esos textos**, no dejarlos
   contradiciendo al código: este proyecto ya perdió una sesión entera por
   documentación desfasada (ver el aviso al principio de `docs/ideas.md`).
3. **El orden de importación puede envenenar el despeje.** `initialBalance =
   ancla − neto hasta la fecha del ancla` solo es correcto si los movimientos
   anteriores a esa fecha ya están dentro. Guardar **el ancla como hecho (saldo +
   fecha)** y derivar al leer es inmune al orden; guardar el resultado despejado
   no lo es. Es la duda que el humano marcó arriba.
4. **Los datos ya están dentro: hace falta un camino de relleno.** 4 cuentas y
   ~1.520 movimientos existentes. La feature 25 `reimport-from-local-copy` ya
   permite reprocesar desde `var/`, y las anclas están en `var/parsed/`. Openbank
   además necesita reimportar sus 201 movimientos para rellenar `balanceAfter`.
5. **Conciliar de dos formas, según lo que traiga el banco.** Línea a línea donde
   hay saldo por movimiento (Bankinter hoy, Openbank tras esta feature) — la
   comprobación fuerte, la que ya se ha probado y da 354/354, y que además **no
   necesita el ancla**: compara la diferencia entre dos saldos consecutivos
   contra el importe del movimiento. Y contra el ancla del preámbulo donde no hay
   saldo por línea (N26, MyInvestor), que sí es una comparación de números
   absolutos y por tanto sí necesita el ancla.
6. **Que mande el archivo no significa que el archivo sea lo último.** Si entran
   movimientos posteriores al último que trae saldo (un extracto parcial, o un
   banco que va con retraso), el saldo de la cuenta es **el del archivo más lo
   que haya venido después**, no el del archivo a secas. Hoy pasa de verdad:
   Bankinter está congelado en 2026-07-31 y N26 llega al 2026-08-22.
7. **Contrato de API.** Cambia lo que devuelve `/api/accounts` (`balance`, y
   probablemente algo de estado de conciliación): `docs/api-contract.md` es la
   fuente de verdad que lee el frontend, hay que actualizarlo. El frontend **no
   se toca en esta sesión** (regla de oro del workspace).
8. **La línea `saldo;` de N26 y MyInvestor deja de ser opcional... una sola vez.**
   Con lo decidido, basta con que aparezca en UN extracto de cada una para
   anclarlas; a partir de ahí es comprobación opcional. Merece una línea en
   `docs/dar-de-alta-un-banco.md`.
