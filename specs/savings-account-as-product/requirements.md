# Requirements — F26 `savings-account-as-product`

> **Material del `implementer` y del `reviewer`.** La hoja que lee el humano es
> [`decisions.md`](decisions.md).
>
> **Alcance redactado: SOLO la cuenta remunerada de Trade Republic.** Los 5 `.json`
> de productos de MyInvestor **no entran aquí** (decisión 🔴 1 de la hoja). Si el
> humano elige que entren, no se agranda esta feature: se abre una feature hermana
> que reutiliza el servicio de persistencia que esta construye. Ver
> [`design.md`](design.md) §0.
>
> Notación EARS (`docs/specs.md`). 15 requirements, justo en el tope.

---

## R1

El esquema DEBE incluir `savings_account` como quinto valor del enum
`InvestmentProductType`, añadido por una migración **aditiva** que no reescribe
ninguna fila ni columna existente.

## R2

El esquema DEBE incluir una tabla `SavingsSnapshot` con `productId`, `date`
(`@db.Date`) y los cinco importes `openingBalance`, `moneyIn`, `moneyOut`,
`interest` y `balance` como `Decimal(10, 2)` **NOT NULL**, con clave natural
`@@unique([productId, date])` y clave foránea a `InvestmentProduct`.

## R3

El sistema NO DEBE escribir filas de `Valuation` para un producto de tipo
`savings_account`, ni filas de `SavingsSnapshot` para un producto de tipo `fund`,
`etf`, `managed_portfolio` o `deposit`.

## R4

CUANDO se importa un archivo de cuenta remunerada válido, el sistema DEBE hacer
**upsert** del `InvestmentProduct` sobre la clave natural `(bank, name)`,
escribiendo `type = savings_account`, `currency`, `openedAt` y `closedAt` tal como
los trae el archivo, con `bank` tomado de la **carpeta** y nunca del contenido.

## R5

CUANDO se importa un archivo de cuenta remunerada válido, el sistema DEBE hacer
**upsert** de la fila de `SavingsSnapshot` sobre `(productId, date)` con los cinco
importes **tal como vienen escritos**, sin calcular, derivar ni redondear ninguno
(regla 4 de ADR-012: la foto se lee, no se calcula).

## R6

CUANDO se importa dos veces el archivo del mismo mes (mismo `name` y misma
`date`), el sistema DEBE dejar exactamente **un** `InvestmentProduct` y
exactamente **una** fila de `SavingsSnapshot` para esa fecha, con los valores de
la última pasada.

## R7

CUANDO se importa el archivo del mes siguiente (mismo `name`, otra `date`), el
sistema DEBE reutilizar el `InvestmentProduct` que ya existe y añadir **una fila
más** de `SavingsSnapshot`, sin crear un segundo producto.

## R8

SI el parser rechaza el archivo —descuadre de los cinco importes, marcador `<…>`
sin sustituir, campo obligatorio ausente, número escrito como texto, fecha
inválida, clave desconocida, `type` distinto de `savings_account` o codificación
que no es UTF-8— ENTONCES el sistema NO DEBE escribir **ni el producto ni la
foto**.

## R9

SI el parser rechaza el archivo ENTONCES el sistema DEBE reportarlo con
`status: "failed"`, el motivo íntegro del parser y `movedToProcessed: false`.

## R10

CUANDO `POST /api/import` encuentra un archivo `.json` en la carpeta de
`trade-republic`, el sistema DEBE encaminarlo por el registro de **productos** y
NO DEBE reportarlo como `skipped`.

## R11

CUANDO `POST /api/import/local` encuentra un archivo `.json` bajo
`var/drive-read/trade-republic/<año>/`, el sistema DEBE persistirlo por el mismo
camino que `POST /api/import`, sin hacer ninguna petición a Drive y sin mover ni
borrar nada en Drive.

## R12

CUANDO un archivo de producto se persiste correctamente desde `POST /api/import`,
el sistema DEBE moverlo a `procesados/` **después** de que producto y foto estén
escritos, y nunca antes (misma regla que ADR-025 para los extractos).

## R13

CUANDO se importa un archivo de producto, el sistema DEBE reportar en la respuesta
de ese archivo el `id` y el `name` del producto, si el producto se **creó** o se
**actualizó**, la `date` de la foto y si la foto se **creó** o se **actualizó**.

## R14

El sistema NO DEBE crear, modificar ni borrar ninguna fila de `Account` ni de
`Movement` al importar un archivo de producto, y la importación de extractos DEBE
seguir dando exactamente los mismos recuentos, el mismo movimiento a `procesados/`
y el mismo contrato que antes de esta feature.

## R15

El módulo `src/modules/trade-republic/` NO DEBE contener ninguna referencia a la
base de datos, y `POST /api/parser/trade-republic` DEBE seguir escribiendo su
volcado en `var/parsed/trade-republic/<año>/products.json` **sin persistir nada**.

---

## Procedencia

Clasificación de cada requirement contra el `intent` de la feature 26. Es lo que
permite al `reviewer` comprobar que no se coló alcance de tapadillo, y lo que
alimenta el bloque 🔴 de [`decisions.md`](decisions.md).

- **R1 — (delegado)** Sale de `delego_en_agente` nº 2 («si es un
  `InvestmentProductType` nuevo (`savings_account`) con migración»). Decido **sí**:
  el humano ya cerró que su sitio es el modelo de inversión, y sin valor de enum no
  hay forma de guardarlo ahí. *Alternativa descartada:* reutilizar `deposit`, que
  ya tiene `principal` e `interestRate` — mentiría sobre lo que es, porque una
  cuenta remunerada no tiene ni vencimiento ni interés pactado de antemano.
- **R2 — (delegado)** Sale de `delego_en_agente` nº 2 («dónde viven sus cinco
  importes, sabiendo que `Valuation` habla de `invested` y `marketValue`»). Decido
  **tabla propia `SavingsSnapshot`**, gemela de `Valuation` en forma y en reglas.
  *Alternativas descartadas:* mapear los cinco importes sobre las columnas de
  `Valuation` (perdería tres de los cinco y haría imposible re-comprobar el cuadre
  desde la base) y aflojar `invested`/`marketValue` a NULL añadiéndoles cinco
  columnas más (debilitaría dos NOT NULL vivos y dejaría diez columnas siempre
  nulas). Razonamiento largo en [`design.md`](design.md) §2.
- **R3 — (delegado)** Misma delegación. Es la regla gemela de ADR-012 decisión 9
  («un depósito no tiene valoraciones = regla del SERVICIO, no del `CHECK`»):
  se vigila en el servicio, no en la base, para no romper el cero SQL crudo.
- **R4 — (humano)** Sale de «después de subir el `.json` de un mes, mi cuenta
  remunerada está en la base de datos», y el upsert sobre `(bank, name)` es
  literalmente el contrato que ADR-012 decisión 6 dejó escrito para «el futuro
  importador».
- **R5 — (humano)** Sale de «…con su saldo y sus intereses de ese mes».
- **R6 — (humano)** Sale de «si vuelvo a subir el mismo mes, no se me duplica nada».
- **R7 — (humano)** Sale de «subo el mes siguiente y no se me crea una cuenta
  nueva: es la misma, con un mes más».
- **R8 — (humano)** Sale de `que_no_quiero` nº 2: «no quiero que se pierda el
  cuadre de los cinco importes que ya me protege de las erratas». El cuadre solo
  sigue protegiéndole si **corta antes** de la escritura.
- **R9 — (añadido)** El humano no dijo qué se le reporta cuando un archivo se
  rechaza. Propongo la misma forma que ya tienen los extractos desde ADR-025:
  `failed` + motivo íntegro + `movedToProcessed: false`. ← REVISAR EN APROBACIÓN.
- **R10 — (delegado)** Sale de `delego_en_agente` nº 4 («por dónde entra»). Decido
  **`POST /api/import` con un segundo registro**, el de productos, inyectado desde
  `src/app.ts` igual que el de extractos. *Alternativas descartadas:* ruta aparte
  (dos botones al mes para el humano) y añadir persistencia a
  `POST /api/parser/trade-republic` (rompería ADR-024 y su guardián).
- **R11 — (delegado)** Misma delegación. La vía local de la F25 tiene que aprender
  lo mismo, porque **es** la forma natural de «volver a subir el mismo mes» (R6)
  una vez que el archivo ya se movió a `procesados/`.
- **R12 — (añadido)** El humano no habló de `procesados/` en esta feature. Se
  hereda la regla de ADR-025 tal cual. ← REVISAR EN APROBACIÓN.
- **R13 — (añadido)** El humano no pidió ningún informe. Lo añado porque sin él no
  puede distinguir «se ha guardado» de «se ha vuelto a guardar lo mismo», que es
  justo lo que R6 y R7 le prometen. ← REVISAR EN APROBACIÓN.
- **R14 — (humano)** Sale de «mis 4 cuentas y mis 455 movimientos de hoy siguen
  exactamente igual» y de `que_no_quiero` nº 3.
- **R15 — (delegado)** Sale de `delego_en_agente` nº 4 («qué pasa con
  `var/parsed/`»). Decido que **sigue existiendo y cambia de oficio**: deja de ser
  la base de datos falsa y pasa a ser el **ensayo** —ver qué ha entendido el
  sistema de tu archivo **antes** de meterlo en la base—. *Alternativa descartada:*
  borrarlo, que le quitaría la única forma de revisar un archivo sin escribir.

### Cobertura del `como_se_que_esta_bien`

| Frase del humano | Requirements que la cubren |
|---|---|
| «mi cuenta remunerada está en la base de datos con su saldo y sus intereses de ese mes» | R1, R2, R4, R5, R10 |
| «subo el mes siguiente y no se me crea una cuenta nueva» | R7 |
| «si vuelvo a subir el mismo mes, no se me duplica nada» | R6, R11 |
| «mis 4 cuentas y mis 455 movimientos de hoy siguen exactamente igual» | R14 |
| `que_no_quiero`: «que no se pierda el cuadre» | R8, R9 |
| `que_no_quiero`: «no escribir más campos cada mes» | ninguno nuevo — la plantilla **no cambia** (decisión 🔴 3) |
