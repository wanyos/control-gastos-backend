# Resumen — feature 31 `real-account-balance`

Fecha de cierre: 2026-08-26
Intención original: `feature_list.json` → feature `real-account-balance`, bloque `intent`
Spec: [`specs/real-account-balance/`](../../specs/real-account-balance/decisions.md) · ADR nuevo: **ADR-028**

## Qué hace ahora la app que antes no

**Cada cuenta corriente sabe cuánto dinero tiene dentro.** Antes te decía una
*variación desde cero*: las cuatro cuentas arrancaban de `initialBalance = 0` y
el saldo que veías era, según el banco, o el número congelado del último extracto
o la suma de los movimientos sobre un cero. El dato bueno ya estaba en tus
archivos —la línea `saldo;` que escribes en N26 y MyInvestor, el preámbulo de
Openbank, la columna de saldo de Bankinter— y el importador lo tiraba.

Ahora, la **primera vez** que se importa un archivo de una cuenta, el saldo que
declara ese archivo se guarda como un **hecho**: el importe **con la fecha del
movimiento más reciente del archivo**. Eso es el **ancla**. A partir de ahí el
saldo se calcula solo, con una sola fórmula:

```
saldo = importe del punto de anclaje + (ingresos − gastos) de lo POSTERIOR a él
```

Tres consecuencias que se notan:

- **Donde el archivo trae el saldo, sigue mandando el archivo** (Bankinter,
  Openbank): eso no ha cambiado. Lo que cambia es que ya no se queda congelado
  ahí — un movimiento con fecha posterior al extracto **sí** mueve el saldo.
- **Importar después un mes antiguo no estropea nada**: lo anterior al ancla ya
  estaba contado dentro de ella.
- **Un extracto nuevo no reescribe el ancla, nunca.** Se pone una vez por cuenta
  y se queda.

Y **Openbank deja de tirar su saldo por línea**: la quinta columna de cada fila,
que la feature 19 leía y descartaba a propósito, ahora se guarda como ya pasaba
con Bankinter.

## Por dónde se usa (puntos de entrada)

- **`GET /api/accounts`** — [accounts.routes.ts:23](../../src/modules/accounts/accounts.routes.ts#L23).
  Cada cuenta trae ahora `balanceAnchor` y `balanceAnchorDate` además de
  `balance`, y `balance` ya es el saldo real.
- **`GET /api/accounts/:id`** — [accounts.routes.ts:28](../../src/modules/accounts/accounts.routes.ts#L28).
  Lo mismo, para una sola cuenta.
- **`POST /api/import`** — [import.routes.ts:56](../../src/modules/import/import.routes.ts#L56).
  Es quien ancla. Cada archivo del informe trae `anchored` (si fue **este**
  archivo el que ancló) y `balancesFilled` (cuántos saldos por línea vacíos
  rellenó), y su `account` trae `balanceAnchor`.
- **`POST /api/import/local`** — [import.routes.ts:70](../../src/modules/import/import.routes.ts#L70).
  **La vía que arregla lo que ya está dentro**, sin tocar Drive: reprocesa las
  copias de `var/drive-read/`, ancla las cuentas y rellena los saldos que faltan
  sin crear un solo movimiento nuevo.
- **El enganche del anclaje** vive en
  [import.service.ts:609](../../src/modules/import/import.service.ts#L609):
  después de guardar los movimientos y antes de dar el archivo por importado, que
  es lo que hace que un archivo que falla no deje nada anclado.

## Dónde está el código (para revisión directa)

> Los enlaces son clicables en la vista previa de Markdown de VS Code. Dentro de
> cada archivo, el **símbolo** de la primera columna se encuentra con un `grep` y
> no caduca, que es por lo que aquí no hay números de línea.

### La fórmula del saldo (el corazón de la feature)

Todo en [`src/modules/movements/movements.service.ts`](../../src/modules/movements/movements.service.ts)
y [`movements.types.ts`](../../src/modules/movements/movements.types.ts).

| Qué hace | Símbolo |
| --- | --- |
| Única comparación de «cuál es más reciente» del módulo, por `(bookingDate, daySequence)` | `isAfter` |
| Lee el ancla guardada de una cuenta, o `null` si nunca se ancló | `readAnchor` |
| Elige el **punto de anclaje efectivo**: el más reciente entre el ancla y el último saldo por línea; en empate exacto gana el ancla | `resolveAnchorPoint` |
| La fórmula: importe del punto + neto de lo estrictamente posterior | `computeAccountBalance` |
| Suma de ingresos menos gastos sobre un importe de partida | `netOf` |
| El orden «más reciente primero», reescrito encima de `isAfter` para que no puedan divergir | `byMostRecent` |
| Los tres tipos que sostienen todo lo anterior | `RecencyPoint`, `BalanceAnchor`, `AnchorColumns` |

### El ancla en la base de datos

| Qué hace | Símbolo | Archivo |
| --- | --- | --- |
| Tres columnas nuevas, todas opcionales, en la tabla de cuentas | `balanceAnchor`, `balanceAnchorDate`, `balanceAnchorDaySequence` en `model Account` | [schema.prisma](../../prisma/schema.prisma) |
| La migración: **solo** añade columnas y un `CHECK`; no reescribe ni una fila tuya | `Account_balance_anchor_pair` | [migration.sql](../../prisma/migrations/20260825183936_balance_anchor/migration.sql) |

### El importador: anclar y rellenar

Todo en [`src/modules/import/import.service.ts`](../../src/modules/import/import.service.ts)
y [`import.types.ts`](../../src/modules/import/import.types.ts).

| Qué hace | Símbolo |
| --- | --- |
| Qué ancla ofrece un archivo: manda el preámbulo, y si no lo hay, el saldo de su línea más reciente | `deriveAnchorFromStatement` |
| Encuentra el movimiento más reciente del archivo (de ahí sale la FECHA del ancla) | `mostRecentMovement`, `toRecencyPoint`, `toAnchor` |
| Ancla la cuenta **solo si no lo estaba** (la condición va en el `WHERE`, no en un `if` previo) | `anchorAccountIfMissing` |
| Rellena el saldo por línea de las filas ya guardadas que lo tenían vacío; nunca pisa uno guardado | `backfillMissingBalances` |
| Llama al relleno solo si hubo duplicados: sin duplicados no hace ni una consulta | `persistMovements` |
| Lee el ancla que la cuenta tiene **después** del archivo, para el informe | `readAccountAnchor` |
| Los campos nuevos del informe | `StatementResult.anchored`, `.balancesFilled`, `AccountReport.balanceAnchor`, y los mismos en `AttemptedFileReport` |

### Lo que ve quien pregunta por una cuenta

Todo en [`src/modules/accounts/accounts.service.ts`](../../src/modules/accounts/accounts.service.ts)
y [`accounts.types.ts`](../../src/modules/accounts/accounts.types.ts).

| Qué hace | Símbolo |
| --- | --- |
| Resuelve el saldo de todas las cuentas con **dos consultas por lote**, no una por cuenta | `attachBalances` |
| Saca los dos campos nuevos por la API (la fecha, en `YYYY-MM-DD`) | `serializeAccount` |
| El contrato de la respuesta | `SerializedAccount.balanceAnchor`, `.balanceAnchorDate` |

### Openbank: la reversión de la feature 19

| Qué hace | Símbolo | Archivo |
| --- | --- | --- |
| La quinta columna deja de devolverse como `null` y sale en `balance` | `parseMovementRow` | [openbank.statement.parser.ts](../../src/modules/openbank/openbank.statement.parser.ts) |
| Los textos que decían que se descartaba, reescritos marcando la reversión (no borrados) | cabecera del parser, `ParsedStatementSummary.accountBalance`, `openbankHeaders` | [parser](../../src/modules/openbank/openbank.statement.parser.ts) · [types](../../src/modules/openbank/openbank.types.ts) · [fixture](../../src/modules/openbank/openbank.fixture.ts) |

### Documentación (la que lee el frontend y la que leemos nosotros)

| Qué | Dónde |
| --- | --- |
| El contrato: `balance` redefinido, los dos campos nuevos, y `anchored` / `balancesFilled` / `account.balanceAnchor` del import | [docs/api-contract.md](../../docs/api-contract.md) |
| **ADR-028**, la decisión entera con sus alternativas descartadas | [docs/architecture.md](../../docs/architecture.md) |
| El modelo de datos: diagrama, esquema y el cálculo del saldo, reescritos | [docs/data-model.md](../../docs/data-model.md) |
| Para ti: la línea `saldo;` es el saldo al ÚLTIMO MOVIMIENTO del archivo, y basta escribirla una vez por cuenta | [docs/dar-de-alta-un-banco.md](../../docs/dar-de-alta-un-banco.md) |
| La fila de Openbank del roadmap y los informes y resúmenes de las F16, F19 y F9, marcados como revertidos o corregidos por esta feature | [docs/roadmap.md](../../docs/roadmap.md) · `progress/summaries/` · `progress/implementations/` |

### Tests

| Qué cubre | Dónde |
| --- | --- |
| La fórmula entera: ancla, punto efectivo, empate, cero, lo posterior y lo anterior | [movements.test.ts](../../src/modules/movements/movements.test.ts) — `describe('isAfter')`, `describe('readAnchor')`, `describe('resolveAnchorPoint')`, `describe('computeAccountBalance')` |
| El anclaje contra la base: se ancla, no se reescribe, el cero cuenta, sin saldo no pasa nada, y un archivo que falla no ancla | [import.service.test.ts](../../src/modules/import/import.service.test.ts) — `describe('the importer anchors the account and fills the balances it left empty')` |
| La función pura que decide qué ancla ofrece un archivo | [import.service.test.ts](../../src/modules/import/import.service.test.ts) — `describe('deriveAnchorFromStatement (pure: no database, no clock)')` |
| El relleno: una fila vacía se rellena, una con saldo no se toca, y ninguna crea un movimiento nuevo | [import.service.test.ts](../../src/modules/import/import.service.test.ts) — `fills the balance of a row already stored empty, without touching the rest` |
| La reimportación local: ancla y rellena sin duplicar ni una fila | [import.local.service.test.ts](../../src/modules/import/import.local.service.test.ts) — `anchors the accounts and fills the missing balances without duplicating a row` |
| La API: cuenta anclada, cuenta sin anclar, y una cuenta con movimientos posteriores al extracto | [accounts.test.ts](../../src/modules/accounts/accounts.test.ts) — los cinco tests del bloque `Feature 31 real-account-balance` |
| Openbank emite su saldo por línea, sin cambiar qué filas se aceptan | [openbank.statement.parser.test.ts](../../src/modules/openbank/openbank.statement.parser.test.ts) — `describe('parseOpenbankStatement — the per-movement balance (F31 R11)')` |
| Guardián: la tabla `Account` tiene exactamente estas columnas (lista **cerrada**, con las tres nuevas dentro) | [investments.model.test.ts](../../src/modules/investments/investments.model.test.ts) |

## Cumplimiento de la intención

Por cada punto de tu `como_se_que_esta_bien`:

- ✅ **«Cada cuenta me dice un saldo real, no una variación desde cero»** → se
  cumple. Verificado en `accounts.test.ts` → `GET /api/accounts exposes the anchor
  of an anchored account and sums what came after it`: ancla de 5.000,00 + 300,50
  − 100,25 = **5.200,25**, y el `initialBalance` de 100,00 ya no interviene.
  ⚠️ La comprobación definitiva es tuya: ver «Lo que te toca a ti».
- ✅ **«Una cuenta sin saldo de partida queda anclada al importar»** → se cumple.
  `import.service.test.ts` → `anchors an account that had no anchor, with the date
  of the last movement`, y la variante sin preámbulo (el caso Bankinter) en
  `falls back to the balance of the most recent LINE, with its own date`.
- ✅ **«Otro extracto NO reescribe el saldo de partida»** → se cumple.
  `import.service.test.ts` → `does NOT rewrite the anchor of an account a previous
  file already anchored`. La condición viaja en el `WHERE` de la consulta, así que
  aguanta incluso dos importaciones a la vez.
- ✅ **«Los movimientos nuevos suben o bajan el saldo solos»** → se cumple, y es el
  cambio que más se va a notar. `movements.test.ts` → `adds a movement without
  balanceAfter that is newer than the statement one`, y de punta a punta en
  `accounts.test.ts` → `moves the balance with movements newer than the last line
  that carries one`: saldo de línea 3.000,00 el 31-07 más un gasto de 50,00 el
  02-08 → **2.950,00**. Antes de esta feature ese caso daba 3.000,00.
- ✅ **«Donde el archivo trae el saldo, el que veo es el del archivo»** → se
  cumple, y **la precedencia no se ha tocado**. `movements.test.ts` → `lets the
  statement balance win when it is newer, and still adds what came after it`.
- ✅ **«Openbank guarda su saldo por línea»** → se cumple.
  `openbank.statement.parser.test.ts` → `emits the balance of the fifth column
  instead of the null of feature 19`, que comprueba los ocho saldos del extracto
  de prueba. Y una fila cuya quinta celda es ilegible se sigue reportando igual
  que antes (`still reports the row when its fifth cell is not a balance`).
- ✅ **«Un saldo de archivo de cero es un saldo real»** → se cumple, en las tres
  capas: `treats a preamble balance of zero as a REAL anchor` (al leer el
  archivo), `stores an anchor of zero as a real anchor` (al guardarlo) y `treats
  an anchor of zero as a real balance, not as "no anchor"` (al calcular).
- ✅ **«Sin la línea del saldo, el archivo se importa igual»** → se cumple.
  `imports a file with no balance at all and leaves the account unanchored`. No es
  un error y no hay ninguna excepción nueva en toda la feature.
- ✅ **«Las cuentas y los movimientos ya dentro acaban bien, sin volver a Drive»**
  → el mecanismo está y está probado: `import.local.service.test.ts` → `anchors
  the accounts and fills the missing balances without duplicating a row`.
  ⚠️ **Falta que lo lances tú una vez** sobre tus copias reales; ver abajo.

## Decisiones que se tomaron por ti

- **(delegado) El ancla se guarda como HECHO: importe + fecha**, no como un saldo
  de partida ya despejado. Es lo que hace que importar después un mes antiguo no
  estropee nada, que era justo tu preocupación. Vive en las tres columnas nuevas
  de `Account`.
- **(delegado) Bankinter se ancla con el saldo de su ÚLTIMA línea**, no despejando
  hacia atrás desde la primera: da el mismo número y no depende de que el extracto
  esté completo.
- **(delegado) `/api/accounts` expone `balanceAnchor` y `balanceAnchorDate`**, para
  que el frontend pueda distinguir una cuenta anclada de una que aún no lo está.
  El `daySequence` del ancla **no** sale por la API: es un detalle interno de
  desempate.
- **(delegado) Lo que ya está dentro se arregla con la reimportación local** de la
  feature 25, no con un script de un solo uso que borre filas y las vuelva a meter.
- **(añadido) Una cuenta creada a mano, sin ancla y sin ningún saldo por línea, se
  comporta exactamente como hoy**: suma sobre `initialBalance`. Es lo que impide
  que esta feature rompa el camino que ya existía, y es hoy el **único** papel de
  `initialBalance`.
- **(añadido) Si el archivo y la base discrepan en el saldo de una línea YA
  guardada, gana la base** y no se toca. Sobrescribir sería conciliar, y conciliar
  es la F32.
- **(decidido sobre la marcha) En un empate exacto de fecha y posición entre el
  ancla y un saldo por línea, gana el ancla**, porque sale del preámbulo, que es
  el saldo de la CUENTA y manda sobre el de una sola línea.
- **(decidido sobre la marcha) `account.balanceAnchor` del informe del import es el
  ancla que la cuenta tiene DESPUÉS del archivo**, no la que el archivo ofrecía:
  un extracto que llega a una cuenta ya anclada reporta la que se quedó. Está
  avisado en 🔴 en el contrato, porque leerlo al revés haría creer que ha cambiado
  algo que no se ha tocado.

## Lo que te toca a ti (no es código)

1. **Lanza una vez `POST /api/import/local`.** Es lo que ancla tus cuatro cuentas
   y rellena los saldos por línea de Openbank que quedaron vacíos. No tienes que
   subir nada a Drive y no se borra ninguna fila.
2. **Compara cada cuenta con la web de su banco** después de eso. Es la prueba
   real (checkpoint C4 bis) y ninguna suite la sustituye: las dos veces que se ha
   hecho en este proyecto encontró un defecto que los tests en verde no veían.
   **Es la única casilla de esta feature que sigue abierta**, y es tuya, no de la
   implementación.
3. **Asegúrate de que al menos un extracto de N26 y uno de MyInvestor llevan la
   línea `saldo;`** escrita a mano. Basta **una vez por cuenta, para siempre** — y
   ojo: es el saldo **al último movimiento de ese archivo**, no el saldo del día en
   que la escribes.

## Qué NO se tocó / quedó fuera

- **Nadie comprueba todavía que el saldo cuadre.** Comparar el calculado contra el
  del archivo y avisarte de descuadres es la **F32 `balance-reconciliation`**, el
  corte que aprobaste. Esta mitad **produce** el número; la otra lo **vigila**.
- **El frontend no se toca.** Ver el saldo en pantalla es otra sesión, con el
  contrato ya actualizado (regla de oro del workspace).
- **No se toca la vista de Patrimonio ni los productos de inversión**: esto es solo
  el saldo de las cuentas corrientes.
- **Nada de enriquecer** (categorías, traspasos, formas de pago).
- **Los saldos de tus cuentas no son todos del mismo día**, porque tus extractos no
  llegan hasta la misma fecha. Cada cuenta dice la verdad a la fecha de lo último
  que ha visto; sumarlas en una sola cifra de patrimonio es otra vista.
- **El ADR-013 no se deroga.** De la feature 19 se revierte una sola cosa: que el
  saldo por línea de Openbank se leyera y se tirara.

## Notas para el futuro

- **`AttemptedFileReport` duplica a mano los campos de `StatementResult`** en vez
  de extenderlo, así que cada campo nuevo del núcleo hay que añadirlo en dos
  sitios (esta feature lo ha hecho dos veces). Cambio mecánico, pero toca el tipo
  público del informe de Drive.
- **El guardián de columnas de `Account` vive dentro del módulo de inversiones**,
  así que cualquier feature que toque esa tabla lo rompe desde un archivo que no
  tiene nada que ver. Ya ha pasado dos veces. A la tercera, moverlo a un test de
  esquema propio. **No aflojarlo**: la lista cerrada es exactamente lo que avisó.
- **El relleno de saldos es una consulta por fila duplicada.** Solo corre en el
  caso duplicado y sobre las filas de un archivo (decenas). Si algún día un archivo
  trae miles de líneas duplicadas, es el sitio obvio donde mirar.
- **`readAccountAnchor` es una lectura extra por archivo** que se podría ahorrar si
  `resolveAccount` devolviera ya las columnas del ancla.
- **`src/generated/prisma/` hay que regenerarlo** (`pnpm run prisma:generate`) al
  cambiar de rama, porque no está versionado y ahora tiene tres columnas más.
