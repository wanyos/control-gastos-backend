# real-account-balance (F31) — implementación

> Feature **SDD**, spec aprobado. `tasks.md` está partido en cuatro lotes y cada
> lote escribe **su propia sección** en este archivo, añadiéndola al final.

## Lote A

**Alcance:** T1, T2 y T3 — Openbank deja de tirar su saldo por línea.

### Archivos modificados / creados

| Archivo | Qué cambia |
|---|---|
| [`src/modules/openbank/openbank.statement.parser.ts`](../../src/modules/openbank/openbank.statement.parser.ts) | `parseMovementRow` devuelve el importe de la quinta celda en `balance`; cabecera y comentario de la fila reescritos |
| [`src/modules/openbank/openbank.statement.parser.test.ts`](../../src/modules/openbank/openbank.statement.parser.test.ts) | Bloque `R8` reescrito como `F31 R11`: 3 tests nuevos + el de no-regresión + el de «no confundir los dos saldos» |
| [`src/modules/openbank/openbank.types.ts`](../../src/modules/openbank/openbank.types.ts#L56) | Docstring de `accountBalance`: deja de decir que el saldo por línea se descarta |
| [`progress/implementations/openbank-statement.md`](openbank-statement.md) | Cuatro puntos marcados como revertidos por la F31 (§Decisiones nº 4, tabla de requisitos R8, criterio 7 de `acceptance` nº 6, cabo suelto nº 4) |
| [`src/modules/openbank/openbank.fixture.ts`](../../src/modules/openbank/openbank.fixture.ts#L46) | **Quinto texto de la F19, adoptado por encargo del leader**: el comentario de la columna `Saldo` y el docstring de `openbankHeaders` |

Ningún archivo de otro lote se ha tocado.

### Decisiones tomadas

1. **La condición de rechazo de la fila no cambia.** El saldo se parsea a una
   variable (`const balance`) y esa misma variable entra en la guarda de salida
   (`balance === null` → fila reportada) y en el objeto devuelto. Antes se
   parseaba y se descartaba en el sitio. Un solo `parseAmountText(cells[4])`, un
   solo criterio: no puede divergir «lo que valida la forma» de «lo que se
   guarda».
2. **T2 se ha hecho como reversión visible, no como borrado.** Los cuatro textos
   que afirmaban que el dato se tira **siguen ahí**, tachados o marcados con
   ⛔/⏩, con la razón de la F19 intacta y el estado actual escrito justo al lado.
   El motivo es explícito en el propio texto: un párrafo que sigue diciendo «se
   descarta a propósito» hace que la sesión siguiente lo «restaure». La cabecera
   del parser lleva además una nota en 🔴 dirigida a quien vaya a revertir la
   reversión.
3. **ADR-013 NO se deroga desde aquí.** Los textos dicen que la derogación es
   trabajo de la F31 en `docs/architecture.md` (lote C), y que lo único que
   cambia en este módulo es el valor del campo.
4. **Los datos de `openbank.fixture.ts` no se han tocado** (solo sus textos, ver
   el punto 5): ya traía saldos inventados en las diez filas y no hacía falta
   más. Los importes de los tests nuevos son inventados en el propio test
   (`-11,11 / 2.222,22`, `-5,55 / 0,00`) — ADR-017.
5. **El quinto texto de la F19 se adopta aquí.** El comentario de la columna
   `Saldo` de `openbank.fixture.ts:46` decía «que se lee y no se guarda». Se
   anotó primero como sugerencia fuera de alcance (no está en la lista de
   archivos de la T2) y el leader lo devolvió al lote A: es del módulo, no es de
   ningún otro lote, y la T2 no existe para tocar cuatro archivos sino para que
   **no quede ni un texto** afirmando que el dato se descarta. Tratado como los
   otros cuatro —reescrito, no borrado—: el comentario de la línea dice que la
   F19 lo tiraba y la F31 lo guarda, y el docstring de `openbankHeaders` explica
   en qué feature se revierte, por qué (esta columna es el ancla de este banco) y
   que **derogar el ADR-013 no se hace desde aquí**.

### Trazabilidad (criterio → test)

| Requisito / criterio | Dónde se comprueba |
|---|---|
| **R11** el `balance` del movimiento sale de la quinta columna, no `null` | [`parser.test.ts:318`](../../src/modules/openbank/openbank.statement.parser.test.ts#L318) («emits the balance of the fifth column instead of the null of feature 19»), que comprueba los ocho saldos del extracto sintético |
| **R11** importe y saldo son dos celdas distintas y no se cruzan | [`parser.test.ts:331`](../../src/modules/openbank/openbank.statement.parser.test.ts#L331) («keeps the balance of a row apart from its amount») |
| **R11** un saldo de cero es un saldo real (empalma con R4 del lote D) | [`parser.test.ts:342`](../../src/modules/openbank/openbank.statement.parser.test.ts#L342) («keeps a balance of zero as a real balance») |
| **R11 (no regresión)** quinta celda ilegible → sigue en `unparsedRows` | [`parser.test.ts:359`](../../src/modules/openbank/openbank.statement.parser.test.ts#L359) («still reports the row when its fifth cell is not a balance») |
| `accountBalance` del preámbulo ≠ `balance` de la línea | [`parser.test.ts:401`](../../src/modules/openbank/openbank.statement.parser.test.ts#L401) («never confuses it with the balance of a line») |
| **ADR-017** ni un importe real en lo escrito aquí | `pnpm exec vitest run src/no-real-data.test.ts`: **ningún archivo del lote A aparece entre los offenders** |

### Último `./init.sh`

🟡 **Rojo, y ninguno de los fallos es del lote A.** Módulo propio en verde:

```
pnpm exec vitest run src/modules/openbank
  Test Files  5 passed (5)      Tests  92 passed (92)
```

`./init.sh` completo (suite entera, con el lote B trabajando en paralelo):

| Fallo | De quién es |
|---|---|
| `src/no-real-data.test.ts` (2 tests: importes y frases) | **Preexistente antes del lote A**: `progress/explorations/handoff-backend-saldo-real.md` y los tests de Trade Republic. Avisado por el leader como no mío; no tocado |
| `src/modules/investments/investments.model.test.ts:710` (`Account` tiene tres columnas nuevas) | **Lote B**, T4/T5: el guardián de columnas de la F26 enumera las de `Account` y hay que actualizarlo |
| `src/modules/movements/movements.test.ts:118` | **Lote B**, T10 — es el caso que la propia T10 manda reescribir. Apareció en una pasada y no en la siguiente: el lote B estaba editando el archivo a la vez |

### Sugerencias fuera de scope (NO aplicadas)

> Nota: el punto 1 dejó de serlo — el leader lo devolvió al lote A y está hecho.


1. ~~`src/modules/openbank/openbank.fixture.ts:46` sigue diciendo «se lee y no se
   guarda».~~ **Adoptado y aplicado** por encargo del leader; ver §Decisiones nº 5.
2. **`docs/api-contract.md` §Parser de Openbank** afirma lo mismo (lo cita el
   informe de la F19). Cae dentro de la T15 del **lote C**, que ya toca ese
   archivo: conviene que quien haga la T15 lo busque, porque la T15 solo nombra
   las líneas 169, 285, 944 y 1395.
3. El guardián de columnas de `investments.model.test.ts:710` no es de ningún
   lote de esta feature y va a romper igual: alguien del lote B o C tendrá que
   adoptarlo.

---

## Lote B — implementación

> Tasks **T4 a T11**, todas cerradas y marcadas `[x]` en `tasks.md`. Más el
> guardián de columnas de `investments.model.test.ts`, adoptado por encargo
> expreso del leader (ver más abajo).

### Archivos modificados / creados

- `prisma/schema.prisma` — tres columnas nullable en `model Account`.
- `prisma/migrations/20260825183936_balance_anchor/migration.sql` — **nuevo**.
- `src/modules/movements/movements.types.ts` — `RecencyPoint`, `BalanceAnchor`,
  `AnchorColumns`.
- `src/modules/movements/movements.service.ts` — `isAfter`, `readAnchor`,
  `resolveAnchorPoint` y `computeAccountBalance` reescrito.
- `src/modules/movements/movements.test.ts` — el caso partido de la T10 + 22
  tests nuevos.
- `src/modules/investments/investments.model.test.ts` — **fuera de la cabecera
  `Archivos:` del lote**; adoptado por indicación explícita del leader porque la
  causa es mía (ver §Dos tests cambiaron de resultado).
- `specs/31-real-account-balance/tasks.md` — T4..T11 marcadas.

### La firma que heredan los lotes C y D

Es **la de `design.md` §3, sin cambios de fondo**:

```ts
// movements.types.ts
export interface RecencyPoint { bookingDate: Date; daySequence: number | null }
export interface BalanceAnchor extends RecencyPoint { amount: DecimalLike }
export interface AnchorColumns {
  balanceAnchor: DecimalLike | null
  balanceAnchorDate: Date | null
  balanceAnchorDaySequence: number | null
}

// movements.service.ts
export function isAfter(a: RecencyPoint, b: RecencyPoint): boolean
export function readAnchor(account: AnchorColumns): BalanceAnchor | null
export function resolveAnchorPoint(
  anchor: BalanceAnchor | null,
  movements: BalanceMovement[],
): BalanceAnchor | null
export function computeAccountBalance(
  initialBalance: DecimalLike,
  movements: BalanceMovement[],
  anchor?: BalanceAnchor | null,
): Prisma.Decimal
```

Única precisión respecto al diseño: el parámetro de `readAnchor`, que allí era un
objeto inline con `Prisma.Decimal | null`, tiene nombre (`AnchorColumns`) y su
importe es `DecimalLike | null`, que es **más ancho** y acepta un `Account` de
Prisma tal cual. Nada más cambia: **C y D pueden escribirse contra esto**.

### Decisiones tomadas

- **La regla de precedencia NO se invierte.** Donde el archivo trae saldo por
  línea, ese movimiento suele *ser* el punto de anclaje y el saldo arranca de él.
  Lo que desaparece es que la suma fuera un *fallback* desde `initialBalance`:
  ahora corre siempre, desde el punto de anclaje. Sin ancla y sin ningún saldo
  por línea el resultado es idéntico al de antes (R8), y hay test que lo fija.
- **Empate exacto `(bookingDate, daySequence)` entre el ancla guardada y un
  `balanceAfter`: gana el ancla.** No estaba escrito en `design.md`. Motivo: el
  ancla se deriva del preámbulo, que por la decisión técnica 2 gana al saldo de
  una línea, y en Openbank los dos van a caer justo en el mismo punto. Testeado
  (`prefers the stored anchor on an exact tie`).
- **T6 cumplida de verdad: queda UNA sola comparación de recencia.** `isAfter` es
  la única, `byMostRecent` está reescrito encima de ella, y la usan tanto
  `resolveAnchorPoint` como el filtro de posteriores de `computeAccountBalance`.
  No queda ninguna resta de `getTime()` suelta en el módulo. Un `daySequence`
  ausente se sigue leyendo como `0`, igual que antes.
- **T5 no reescribe ni una fila.** La migración generada trae solo tres
  `ADD COLUMN` nullable; a mano se le añadió el `ALTER TABLE ... ADD CONSTRAINT
  "Account_balance_anchor_pair" CHECK`. Verificado: un `grep` de
  `update|drop|delete|default` sobre el `migration.sql` **no devuelve nada**.
  Aplicada con `prisma migrate dev`.

### Trazabilidad (criterio → test)

Todos en `src/modules/movements/movements.test.ts` salvo donde se indica.

| Req | Test |
|---|---|
| R1, R14 (soporte de datos) | migración aplicada + `CHECK` en `prisma/migrations/20260825183936_balance_anchor/migration.sql`; la lista de columnas la fija `investments.model.test.ts` → `creates SavingsSnapshot without touching the flow tables` |
| R4 | `keeps an anchor whose amount is zero: zero is a real balance (R4)` y `treats an anchor of zero as a real balance, not as "no anchor" (R4)` |
| R6 | `sums only what came after the anchor, ignoring initialBalance (R6)`; `returns the anchor amount for an account with no movements after it` |
| R7 | `describe('resolveAnchorPoint')` entero (5 casos) + `lets the statement balance win when it is newer, and still adds what came after it (R7, R10)`; y `describe('isAfter')` (3 casos), que es la base única de la comparación |
| R8 | `behaves exactly as before when the anchor is undefined or null (R8)`; `returns null when there is neither an anchor nor a per-line balance (R8)`; `falls back to initialBalance + income - expense...` (ya existía) |
| R9 | `ignores a movement without balanceAfter that is older than the statement one`; `does not move the balance with a movement older than the anchor (R9)`; `adds a same-day movement only when its daySequence is higher` (mitad anterior) |
| R10 | `adds a movement without balanceAfter that is newer than the statement one`; `lets the statement balance win when it is newer...`; `adds a same-day movement only when its daySequence is higher` (mitad posterior) |

R2, R3, R5, R11, R12, R13, R15 y la mitad de API de R14 no son de este lote.

### Dos tests cambiaron de resultado, y ninguno es una regresión

1. **T10 — `movements.test.ts`.** Existía `ignores movements without balanceAfter
   when the statement provides one`, que afirmaba que un movimiento sin saldo por
   línea **nunca** mueve el resultado. Con la fórmula nueva eso solo es cierto si
   el movimiento es **anterior** al punto de anclaje. Está partido en dos casos
   con nombre explícito —`...that is older than the statement one` y `adds a
   movement without balanceAfter that is newer than the statement one`— y un
   comentario encima que dice por qué. Es el aviso 7 del intent («el saldo del
   archivo no es lo último»), que pasa de verdad hoy: hay una cuenta congelada a
   finales de julio y otra que llega a finales de agosto. Se añadió además un
   tercer caso de desempate dentro del mismo día.
2. **`investments.model.test.ts:710`.** Es un guardián de la F26 que enumera la
   **lista cerrada** de columnas de `Account`; la T5 le añade tres y por eso se
   puso rojo. **No está en la cabecera `Archivos:` de ningún lote**; lo detectamos
   por separado el lote A y yo, y el leader me encargó expresamente adoptarlo por
   ser mi causa. El cambio es el mínimo: añadir `balanceAnchor`,
   `balanceAnchorDate` y `balanceAnchorDaySequence` al array esperado, en su sitio
   alfabético, y corregir el comentario para que diga de quién son las tres
   columnas. **No se ha aflojado el guardián**: sigue siendo una lista cerrada, y
   se dejó escrito en el propio comentario que ponerse rojo el día que alguien
   toca la tabla es exactamente su trabajo. No se ha tocado ninguna otra cosa de
   `src/modules/investments/`.

### Último `./init.sh`

**Rojo, con 2 tests fallando, los dos preexistentes y ajenos a esta feature:**
`src/no-real-data.test.ts:868` y `:886`, por importes reales en
`progress/explorations/handoff-backend-saldo-real.md` y frases en
`src/modules/trade-republic/trade-republic.service.test.ts`. Ya estaban rojos
antes de que empezara el lote y el leader indicó no tocarlos.

Todo lo demás verde: **909 tests pasan, 47 de 48 archivos**. El guardián que mi
migración rompió (`investments.model.test.ts`) ya está verde otra vez.

Comprobado, además, que **ninguno de mis archivos** aparece entre los *offenders*
de `no-real-data.test.ts` (ADR-017): ni `prisma/`, ni `movements.*`. Todos los
importes de los tests nuevos son inventados.

Verificaciones sueltas: `npx tsc --noEmit` limpio; `pnpm exec vitest run
src/modules/movements/movements.test.ts` → **43/43**; `oxlint` y
`prettier --check` sobre los archivos tocados, limpios.

### Lo que los lotes C y D necesitan saber

- La firma de arriba es definitiva. `BalanceAnchor` y `AnchorColumns` se importan
  de `./movements.types.js`; `readAnchor`, `resolveAnchorPoint` e `isAfter` de
  `./movements.service.js`.
- **C (`attachBalances`)**: `computeAccountBalance` ya no tiene rama de
  *fallback*, así que hay que pasarle **los movimientos posteriores al punto**, no
  solo el más reciente con saldo. Si le pasas únicamente ese, el saldo sale
  correcto pero **congelado** en la fecha del extracto: es justo el bug que la
  feature arregla. Y el punto hay que resolverlo antes (`readAnchor` +
  `resolveAnchorPoint`), porque el ancla puede ser más reciente que cualquier
  `balanceAfter`.
- `resolveAnchorPoint` devuelve `null` **solo** cuando no hay ancla ni un solo
  `balanceAfter`. En ese caso, y solo en ese, manda `initialBalance`.
- **D (`deriveAnchorFromStatement`)**: la fecha del ancla es la del movimiento más
  reciente del archivo; `isAfter` está exportado por si te sirve para encontrarlo
  sin escribir otra comparación — la T6 existe precisamente para que no haya dos.
- **D (escritura)**: el `CHECK Account_balance_anchor_pair` rechaza escribir
  `balanceAnchor` sin `balanceAnchorDate` (y al revés), así que el `updateMany` de
  `anchorAccountIfMissing` tiene que poner **los dos** en la misma sentencia.
  `balanceAnchorDaySequence` sí puede quedarse `null` por su cuenta.
- **D (relleno)**: el lote A confirma que el parser de Openbank ya emite el saldo
  por línea, así que las filas con `balanceAfter` a NULL que hay que rellenar son
  **las ya guardadas** por la F19, nunca las que llegan del parser.

### Sugerencias fuera de scope (NO aplicadas)

1. El guardián de columnas de `Account` vive como lista literal dentro del módulo
   de inversiones, y cualquier feature futura que toque la tabla lo va a romper
   desde un archivo que no tiene nada que ver. Si vuelve a pasar una tercera vez,
   valdría la pena moverlo a un test de esquema propio. **No lo propongo para esta
   feature**: la lista cerrada es exactamente lo que avisó, y aflojarla ahora sería
   quitar la alarma en vez de atenderla.
2. Los dos fallos de `no-real-data.test.ts` siguen abiertos y bloquean el cierre
   de la feature. No son de ningún lote y necesitan una decisión del humano sobre
   `progress/explorations/handoff-backend-saldo-real.md`.

---

## Lote D — implementación

> T17-T23. El importador ancla la cuenta con el saldo del archivo (una sola vez)
> y rellena el saldo por línea de las filas que ya estaban guardadas con él a
> NULL. Depende de los lotes A y B, los dos cerrados y en verde antes de empezar.

### Archivos modificados / creados

- [`src/modules/import/import.service.ts`](../../src/modules/import/import.service.ts) —
  tres funciones nuevas exportadas y el enganche en `importStatement`.
- [`src/modules/import/import.types.ts`](../../src/modules/import/import.types.ts) —
  `StatementResult.anchored`, `StatementResult.balancesFilled`,
  `AccountReport.balanceAnchor`, y los dos contadores también en
  `AttemptedFileReport` (el reporte de Drive no extiende `StatementResult`).
- [`src/modules/import/import.service.test.ts`](../../src/modules/import/import.service.test.ts) —
  dos `describe` nuevos al final: la función pura y el anclaje contra la base.
- [`src/modules/import/import.local.service.test.ts`](../../src/modules/import/import.local.service.test.ts) —
  dos casos nuevos dentro del `describe('importLocalCopies')`.

No se ha tocado ningún archivo del lote C (`src/modules/accounts/`, `docs/`).

### Qué hace ahora el importador

`deriveAnchorFromStatement(statement)` — pura, sin base ni reloj
([import.service.ts:250](../../src/modules/import/import.service.ts#L250)):

1. `statement.accountBalance !== null` → ese importe, con la fecha y el
   `daySequence` del **movimiento más reciente del archivo**. El preámbulo es el
   saldo de la CUENTA y gana al de una línea; y la línea `saldo;` que el humano
   escribe a mano significa «el saldo tras el último movimiento de este archivo»
   (confirmado por él el 2026-08-25), que es de donde sale la fecha.
2. Si no, el `balance` de la línea más reciente que traiga uno, con su propia
   fecha.
3. Si no, `null` — el archivo se importa igual (R5).

La comparación es `!== null`, **nunca por veracidad**: un `accountBalance` de 0
es un ancla real (R4) y un `if (statement.accountBalance)` sería el bug. Hay un
test dedicado solo a eso.

La recencia dentro del archivo se resuelve con el **`isAfter` único** del lote B,
no con una comparación propia: el orden no puede divergir entre el importador y
la fórmula del saldo.

`anchorAccountIfMissing` — `updateMany` con `where: { id, balanceAnchor: null }`.
La condición viaja **en el WHERE**, no en un `if` previo, que sería una carrera.
Importe y fecha se escriben en la **misma sentencia**, como exige el
`CHECK Account_balance_anchor_pair` del lote B.

`backfillMissingBalances` — un `updateMany` por fila con saldo, con
`balanceAfter: null` **en el WHERE**, identificando la fila por las mismas seis
columnas del índice parcial `Movement_imported_dedup_key`. `persistMovements`
solo lo llama cuando el `createMany` reportó duplicados: sin duplicados no se
hace **ni una consulta**.

El enganche está en `importStatement` **después de `persistMovements` y antes de
`status: 'imported'`**: la fecha del ancla sale de los movimientos del archivo y
un archivo que falla no ancla nada (sale por el `catch` sin llegar aquí).

### Decisiones tomadas

- **`AccountReport.balanceAnchor` es el ancla que la cuenta tiene DESPUÉS del
  archivo, no la que el archivo ofrecía.** Un extracto que llega a una cuenta ya
  anclada reporta el ancla que se quedó (R3), no la suya. Cuesta una lectura por
  archivo (`select: { balanceAnchor: true }`), y es lo que hace que el reporte
  diga algo verdadero de la cuenta en vez de un deseo del archivo.
- **`anchored` y `balancesFilled` son dos campos, no uno.** `anchored: false`
  tapa dos casos distintos a propósito (el archivo no traía saldo / la cuenta ya
  estaba anclada); quien quiera distinguirlos mira `balanceAnchor`. Contar los
  saldos rellenados aparte es lo que hace testeable R12 sin leer la base.
- **El relleno es un `updateMany` por fila, no una consulta con un `OR` de N
  condiciones.** Solo corre en el caso duplicado, sobre las filas de un archivo
  (decenas), y se lee igual que el índice que deduplica. Si algún día un archivo
  trae miles de líneas duplicadas, es el sitio obvio donde mirar.
- **La base gana en un saldo ya guardado** (R13): no se sobrescribe. Conciliar
  las dos cifras es la F32.

### Trazabilidad (SDD)

| Requirement | Test |
|---|---|
| R1 — cuenta sin ancla + preámbulo → anclada con fecha del último movimiento | `deriveAnchorFromStatement > takes the preamble balance with the date of the MOST RECENT movement (R1)` y `the importer anchors… > anchors an account that had no anchor, with the date of the last movement (R1)` |
| R2 — sin preámbulo, ancla en la línea más reciente con saldo | `deriveAnchorFromStatement > falls back to the balance of the most recent LINE, with its own date (R2)` y `> keeps the newest line that DOES carry a balance when the newest one has none (R2)` |
| R3 — un segundo extracto no reescribe el ancla | `the importer anchors… > does NOT rewrite the anchor of an account a previous file already anchored (R3)` |
| R4 — un `accountBalance` de 0 es un ancla real | `deriveAnchorFromStatement > treats a preamble balance of zero as a REAL anchor (R4)` y `the importer anchors… > stores an anchor of zero as a real anchor (R4)` |
| R5 — archivo sin saldo: se importa igual y la cuenta queda sin anclar | `deriveAnchorFromStatement > offers no anchor when neither the preamble nor a line brings a balance (R5)` y `the importer anchors… > imports a file with no balance at all and leaves the account unanchored (R5)` |
| R12 — se rellena el saldo de una fila guardada con él vacío | `the importer anchors… > fills the balance of a row already stored empty, without touching the rest (R12, R13)` y `> fills nothing when the file brought no duplicate at all (R12)` |
| R13 — un saldo ya guardado NO se sobrescribe | `the importer anchors… > fills the balance of a row already stored empty, without touching the rest (R12, R13)` (la fila `FULL ONE` conserva su importe frente al del archivo) |
| R15 — la reimportación local ancla y rellena sin duplicar | `importLocalCopies > anchors the accounts and fills the missing balances without duplicating a row (R15)` y `> leaves the account unanchored when its local copies bring no balance (R5, R15)` |

Un archivo que falla no ancla nada (técnica 3 de la hoja de decisiones):
`the importer anchors… > anchors nothing when the file fails (R1, R3)`.

R6-R11 y R14 son de los lotes A, B y C; no se cubren aquí.

### Último `./init.sh`

Ejecutado completo el 2026-08-25 al terminar el lote:

- Estado y specs: **OK**.
- Type check (`tsc --noEmit`): **OK**.
- Suite: **931 tests, 929 en verde**. Los **2 rojos** son los del
  `src/no-real-data.test.ts` que ya estaban antes de empezar el lote: importes
  reales en `progress/explorations/handoff-backend-saldo-real.md` y frases en
  archivos de `trade-republic/`, `docs/api-contract.md`, `progress/` y
  `specs/20-trade-republic-product-file/`. **Ninguno es de este lote** y no se han
  tocado. Comprobado explícitamente que las líneas nuevas de
  `import.service.test.ts` y `import.local.service.test.ts` **no aparecen** entre
  los offenders (el `import.service.test.ts:1047-1048` que sale es de la F26 y
  solo se ha desplazado tres líneas por el nuevo `import`).
- `src/modules/import/` en solitario: **82 tests, todos en verde**.

Nota para el reviewer: hubo que ejecutar `pnpm exec prisma generate` una vez,
porque el cliente generado en disco todavía no tenía las tres columnas del ancla
que añadió el lote B y `tsc` no compilaba (ni este lote ni el C).

### Sugerencias fuera de scope (NO aplicadas)

1. **`AttemptedFileReport` duplica a mano los campos de `StatementResult`.** Cada
   campo nuevo del núcleo hay que añadirlo en dos sitios (y este lote lo ha
   hecho). Debería `extends StatementResult` como ya hace
   `AttemptedLocalFileReport`; es un cambio mecánico pero toca el tipo público
   del reporte de Drive.
2. **El reporte del import no expone `anchored` ni `balancesFilled` en ningún
   schema de respuesta**, porque `import.schema.ts` solo define el *body* de la
   petición. Si el humano quiere verlos por HTTP, hoy ya salen (no hay schema de
   respuesta que los recorte), pero no están documentados en
   `docs/api-contract.md` — y ese archivo es del lote C.
3. **`readAccountAnchor` es una lectura extra por archivo.** Se podría evitar
   haciendo que `resolveAccount` devolviese ya las columnas del ancla, pero eso
   toca `accounts.service.ts`, que es del lote C.

---

## Lote C — implementación

> Tasks **T12 a T16**, todas cerradas y marcadas `[x]` en `tasks.md`. Lo que ve
> quien pregunta por una cuenta, más los textos que decían otra cosa.

### Archivos modificados / creados

| Archivo | Qué cambia |
|---|---|
| [`src/modules/accounts/accounts.service.ts`](../../src/modules/accounts/accounts.service.ts#L53) | `attachBalances` reescrito sobre `readAnchor` + `resolveAnchorPoint`; `serializeAccount` emite los dos campos nuevos |
| [`src/modules/accounts/accounts.types.ts`](../../src/modules/accounts/accounts.types.ts#L29) | `SerializedAccount` gana `balanceAnchor` y `balanceAnchorDate` |
| [`src/modules/accounts/accounts.test.ts`](../../src/modules/accounts/accounts.test.ts) | Helper `anchorAccount` + 5 tests nuevos de la F31 |
| [`docs/api-contract.md`](../../docs/api-contract.md#L168) | Definición de `balance`, nota de `initialBalance`, los dos campos nuevos, el ejemplo, la fila de `balanceAfter`, la tabla de los dos saldos y las secciones de MyInvestor y Openbank (ver §Textos obsoletos) |
| [`docs/architecture.md`](../../docs/architecture.md) | **ADR-028** nuevo, al final de la lista de ADRs |
| [`docs/dar-de-alta-un-banco.md`](../../docs/dar-de-alta-un-banco.md) | Sección nueva: la línea `saldo;` es el saldo al ÚLTIMO MOVIMIENTO del archivo y basta una vez por cuenta |
| `src/generated/prisma/` | **Regenerado** (`pnpm run prisma:generate`): venía sin las tres columnas del lote B y `tsc` no compilaba. Carpeta gitignoreada, no versionada |

`accounts.schema.ts` y `accounts.routes.ts` **no se han tocado** — ver §Decisiones
nº 3. Ningún archivo del lote D (`src/modules/import/`) se ha tocado.

### Decisiones tomadas

1. **`attachBalances`: dos consultas por lote, y el corte fino lo hace el
   dominio.** El punto de anclaje efectivo de cada cuenta se resuelve **antes**
   con `readAnchor(account)` + `resolveAnchorPoint(anchor, account.movements)`
   —donde `account.movements` es el único movimiento con saldo que trae el
   `include` con `take: 1`—. Con ese punto se construye **una** ventana por cuenta
   y se lanza **un solo** `findMany` con un `OR` de ventanas. La ventana SQL es
   **gruesa a propósito** (`bookingDate >=` la del punto, o la cuenta entera si no
   hay punto): el corte exacto de «estrictamente posterior» lo aplica
   `computeAccountBalance` con `isAfter`. Así el SQL no puede juzgar la recencia
   de forma distinta al dominio, que es justo lo que la T6 unificó; escribir la
   ventana en SQL con `gt` sobre `(bookingDate, daySequence)` habría devuelto
   **dos** comparaciones, y el `daySequence` NULL las hace divergir. La rama de
   *fallback* (la consulta extra para las cuentas sin saldo por línea)
   **desaparece**: era la que congelaba el saldo en la fecha del extracto.
2. **El punto se le pasa a `computeAccountBalance` como tercer parámetro**, ya
   resuelto, en vez de pasarle solo el ancla guardada. Si le pasara el ancla, la
   función volvería a resolver el punto sobre un conjunto de movimientos que ya
   viene filtrado por la ventana; pasándole el punto, el resultado es el mismo con
   ventana o sin ella y la función se comporta exactamente igual que en sus tests
   unitarios del lote B.
3. **«El schema de respuesta» de la T13 es `SerializedAccount`, no un JSON Schema
   de `response`.** En este repo **ningún** módulo declara `response` en su schema
   de Fastify (`grep -rn "response:" src/` no devuelve ni uno):
   `accounts.schema.ts` solo tiene `body` y `params`, que son entrada. Añadir uno
   ahora sería meter en la F31 un patrón que el proyecto no usa —y con
   `fast-json-stringify` filtrando la salida, un cambio de comportamiento nada
   pequeño— sin que lo pidan ni `design.md` §7 ni `api-contract.md`. La forma de
   la respuesta la fija `SerializedAccount` (tipada por `tsc`) y la comprueban los
   tests; ahí están los dos campos nuevos. **Anotado para el reviewer** por si
   prefiere lo contrario.
4. **`balanceAnchorDaySequence` NO sale por la API.** R14 pide `balanceAnchor` y
   `balanceAnchorDate`, y solo esos dos aparecen en `design.md` §7. El
   `daySequence` es un detalle interno de desempate: exponerlo obligaría al
   frontend a entender el orden intradía para no hacer nada con él.
5. **El ancla viaja como el hecho que es, no resuelta dentro de `balance`.**
   `balanceAnchor` es el importe **tal cual lo escribió el archivo** y
   `balanceAnchorDate` su fecha (`YYYY-MM-DD`, date-only, como `bookingDate` en
   `/api/movements`). Los dos a `null` = cuenta sin anclar; nunca `"0.00"` para
   decir «sin ancla», que es el bug que R4 existe para evitar.
6. **ADR-028: el ADR-013 no se deroga; se acota qué se revierte de la F19.** El
   ADR nuevo dice las tres cosas del encargo: (a) el ancla se guarda como **hecho**
   —importe + fecha, no un saldo de partida despejado—, con la alternativa
   descartada y su porqué (un mes antiguo importado después la estropearía en
   silencio); (b) la **precedencia del archivo no cambia** —donde el archivo trae
   saldo, ese movimiento normalmente *es* el punto de anclaje—, lo que desaparece
   es que la suma fuera un *fallback*; y (c) de la F19 se revierte **una sola
   cosa**, que el saldo por línea de Openbank se leyera y se tirara, y el ADR-013
   sigue en pie porque decía «el dato que el fichero **no trae** es `null`» y este
   fichero **sí** lo trae. Los importes del ejemplo son inventados (ADR-017).
7. **Los textos obsoletos se reescriben marcando la reversión, no borrando el
   rastro** —mismo criterio que el lote A—. Donde el texto viejo era una decisión
   («no se persiste», «`initialBalance` es su único ancla», «se lee y se
   descarta») queda tachado con `~~…~~` y con la actualización al lado; el de
   Openbank lleva además el aviso en 🔴 contra «restaurar» el `null`.

### Textos obsoletos encontrados en `docs/api-contract.md`

La T15 nombraba las líneas **169, 285, 944 y 1395** (más la nota de
`initialBalance`, 168). Peinado el archivo entero buscando cualquier texto que
contradiga al código, aparecieron **cuatro más**:

| Dónde (línea original) | Qué afirmaba | Estado |
|---|---|---|
| 201 — fila `balanceAfter` del modelo `Movement` | «el más reciente **es** el `balance` de la cuenta» | Corregido: es **candidato a punto de anclaje**, y lo posterior se suma encima. Además ya lo traen dos bancos, no uno |
| 943 — fila `accountBalance` de §Los dos «saldos» | Lo traen «MyInvestor y N26»; **Openbank no figuraba** (su fila `Saldo:` llegó con la F19, posterior a ese texto) | Corregido |
| 947-951 — cierre de §Los dos «saldos» | «`accountBalance` … **no se persiste**: esta feature es parser y volcado» | Corregido: la F31 lo persiste como ancla, una vez por cuenta |
| 1009-1013 — §Parser de MyInvestor | «el saldo de esta cuenta se obtiene sumando desde `Account.initialBalance`, así que `initialBalance` es su **único ancla**» | Corregido: el ancla sale del `accountBalance` del preámbulo |

El que señalaba el leader —el de la sección del parser de **Openbank**, «el saldo
tras cada movimiento existe y **NO se guarda**»— resultó ser el bloque que
contiene la línea **1395**, o sea que **sí** estaba en la lista de la T15. Está
reescrito entero (no solo esa línea) y con el aviso en 🔴. Se completó también el
**ejemplo JSON** de `GET /api/accounts`, que no era falso pero quedaba incompleto
sin los dos campos nuevos.

Y **uno más fuera de ese archivo**, en `docs/dar-de-alta-un-banco.md`: «Por ahora
solo se parsea y se vuelca: todavía no se persiste en la base de datos», al pie de
la sección de la línea `saldo;`. Tachado y actualizado; es el que enlaza con la
sección nueva de la T16.

### Trazabilidad (criterio → test)

Todos en [`src/modules/accounts/accounts.test.ts`](../../src/modules/accounts/accounts.test.ts).

| Req | Test |
|---|---|
| **R6** el saldo es el ancla más el neto de lo posterior | `GET /api/accounts exposes the anchor of an anchored account and sums what came after it (R6, R10, R14)` — ancla 5.000,00 + 300,50 − 100,25 = **5.200,25** |
| **R7** punto efectivo = el más reciente entre ancla y saldo por línea | `GET /api/accounts/:id starts from the stored anchor when it is newer than the statement line (R7, R14)` (gana el ancla) y `GET /api/accounts moves the balance with movements newer than the last line that carries one (R7, R10)` (gana el saldo por línea) |
| **R8** sin ancla y sin saldo por línea, suma sobre `initialBalance` | `GET /api/accounts reports a null anchor on an account that was never anchored (R14)` (100 + 25 = 125,00) y el ya existente `falls back to initialBalance +income -expense without statements (R9)` |
| **R9** lo anterior al punto no mueve el saldo | El gasto de 200,00 del día del ancla con `daySequence` menor, en el test de R6; y el de 600,00 entre la línea y el ancla, en el de `/:id` |
| **R10** lo posterior sí lo mueve, sin escritura manual | `...moves the balance with movements newer than the last line that carries one`: saldo de línea 3.000,00 el 31-07 y un gasto de 50,00 el 02-08 → **2.950,00**. Antes de la F31 este caso daba 3.000,00 |
| **R14** los dos campos en la lista y en el detalle, `null` sin ancla | Los cuatro tests de arriba los comprueban, en `GET /api/accounts` y en `GET /api/accounts/:id`; más `POST /api/accounts returns a brand new account without anchor (R14)` |
| **ADR-017** ni un importe real | `pnpm exec vitest run src/no-real-data.test.ts`: **ningún archivo del lote C** entre los *offenders* (ver más abajo) |

R1..R5, R11, R12, R13 y R15 no son de este lote.

### Último `./init.sh`

🟡 **Rojo, y ninguno de los tres fallos es del lote C.** Pasan **928 tests, 46 de
48 archivos**.

| Fallo | De quién es |
|---|---|
| `src/no-real-data.test.ts:868` y `:886` (importes y frases) | **Preexistentes**, avisados por el leader: `progress/explorations/handoff-backend-saldo-real.md` y los tests de Trade Republic. No tocados |
| `src/architecture.test.ts:296` («keeps the importer free of bank knowledge») | **Del lote D, y transitorio**: ese test lee de disco los archivos de `src/modules/import/`, que se estaban editando durante la pasada. Reejecutado solo: **35/35 en verde** |

Sobre `no-real-data.test.ts` y mis archivos: el test de frases lista también
`docs/api-contract.md` (líneas de las secciones de Trade Republic, por los nombres
de sus ficheros de producto en los ejemplos JSON). **Es preexistente y no es
mío**: esas apariciones ya están en `git show HEAD:docs/api-contract.md` y
ninguna línea que yo añada las contiene. Ni `accounts.*`, ni `architecture.md`, ni
`dar-de-alta-un-banco.md` aparecen entre los *offenders*.

Verificaciones sueltas, todas limpias: `npx tsc --noEmit`, `npx oxlint
src/modules/accounts`, `npx prettier --check` sobre los tres archivos de código, y
`pnpm exec vitest run src/modules/accounts/accounts.test.ts` → **26/26**.

### Lo que el reviewer necesita saber

- **`src/generated/prisma/` estaba desactualizado** y `tsc` no compilaba contra las
  columnas del lote B. Regenerado con `pnpm run prisma:generate`. La carpeta está
  gitignoreada, así que no sale en el diff, pero quien clone o cambie de rama tiene
  que regenerarla (ya lo hace `pnpm run build`).
- **La T13 se ha cumplido sobre `SerializedAccount`**, no sobre un JSON Schema de
  respuesta, porque en este repo no existe ninguno. Ver §Decisiones nº 3.
- El texto de Openbank que se daba por «extra» era el de la línea 1395 que la T15
  ya nombraba; los extras de verdad son los cuatro de la tabla de §Textos
  obsoletos, más el de `dar-de-alta-un-banco.md`.

### Sugerencias fuera de scope (NO aplicadas)

1. **`docs/api-contract.md` sigue sin documentar el `anchored` / `balanceAnchor`
   del resultado de `POST /api/import`** (`design.md` §4, «Reporte»). Es del lote
   **D**, que es quien lo implementa; no lo escribo yo para no documentar algo que
   todavía no está en el código. **Si el lote D no lo añade, el contrato queda
   incompleto.**
2. `docs/data-model.md` describe `Account` y no menciona las tres columnas del
   ancla. No está en la cabecera `Archivos:` de ningún lote.
3. Los dos fallos de `no-real-data.test.ts` siguen bloqueando el cierre de la
   feature y no son de ningún lote (ya lo apuntó el lote B).

### Añadido después de cerrar el lote D — el resultado de `POST /api/import` en el contrato

> Encargo del leader (2026-08-25), devolviendo la sugerencia nº 1 de aquí abajo:
> `docs/api-contract.md` es mi archivo por lotes, pero el dato lo tenía el lote D.
> Con el lote D cerrado ya no hay riesgo de pisarse. Verificado **contra el
> código**, no contra el mensaje: `src/modules/import/import.types.ts`
> (`AccountReport`, `AttemptedFileReport`, `StatementResult`) y el flujo de
> `import.service.ts:595-613`.

Documentado en `docs/api-contract.md`, en §`POST /api/import` y §`POST /api/import/local`:

- **`anchored`** (por archivo) — `true` **solo** cuando ese archivo es el que
  ancló la cuenta. El contrato dice explícitamente que el `false` **agrupa dos
  casos** que ahí no se distinguen (el archivo no traía saldo / la cuenta ya
  estaba anclada) y a dónde mirar para saber cuál es.
- **`balancesFilled`** (por archivo) — filas ya guardadas cuyo saldo por línea
  vacío se ha rellenado. Documentado además lo que un consumidor leería mal: esas
  filas **no** son movimientos nuevos, siguen contando como `duplicates`.
- **`account.balanceAnchor`** — el matiz que avisó el lote D, escrito en 🔴 y con
  su consecuencia: es el ancla que la cuenta tiene **DESPUÉS** del archivo, no la
  que el archivo ofrecía; un extracto que llega a una cuenta ya anclada reporta la
  que se quedó. Si el frontend lo lee al revés, creerá que un extracto nuevo ha
  cambiado un saldo de partida que no se ha tocado.
- **Los dos ejemplos JSON** (Drive y local) llevan ya los tres campos, incluido el
  informe de un archivo `failed`.
- **El informe de un archivo de producto** no los trae, y la nota que enumeraba lo
  que no trae lo dice ahora también de `anchored` y `balancesFilled`. Los mismos
  campos viven en el reporte de Drive y en el local porque las dos formas los
  declaran; el contrato no cambia por eso, pero queda anotado que **son los mismos
  campos y significan lo mismo por las dos vías**.

Tres cosas más que **no** estaban en el encargo y he metido, porque el contrato es
lo único que el frontend va a tener:

1. **Qué pasa en un archivo `failed`:** `anchored` es `false`, `balancesFilled` es
   `0` y `account.balanceAnchor` **puede venir `null` aunque la cuenta sí esté
   anclada** —el ancla se lee después de guardar los movimientos—. Sale del propio
   flujo del importador (`import.service.ts:613`), y sin decirlo el frontend
   tendría un `null` que parece «cuenta sin anclar» y no lo es.
2. **No hay total de run para `anchored` ni para `balancesFilled`:** `ImportRunResult`
   no los agrega, y quien busque un `balancesFilledCount` no lo va a encontrar.
   Dicho en la lista de totales.
3. **`POST /api/import/local` es la vía que repara lo que ya está dentro** (R15):
   ancla y rellena sin crear un movimiento nuevo. El ejemplo local se ha ajustado
   para enseñarlo (`imported: 0`, `duplicates: 39`, `balancesFilled: 12`) — importes
   y contadores **inventados**, ADR-017.

**Verificación de este añadido:** `./init.sh` con el lote D ya cerrado →
**929 tests pasan, 47 de 48 archivos**; los **2** únicos fallos siguen siendo los
preexistentes de `src/no-real-data.test.ts`, ajenos a la feature. `tsc` verde y
`architecture.test.ts` **ya en verde** (el fallo que reporté era el transitorio del
lote D editando `src/modules/import/` durante la pasada). `prettier --check
docs/api-contract.md` limpio. ADR-017: `pnpm exec vitest run
src/no-real-data.test.ts` → **ninguna línea nueva mía entre los offenders**; las 8
de `docs/api-contract.md` que aparecen son las de las secciones de Trade Republic,
ya presentes en `git show HEAD:docs/api-contract.md` (solo cambian de número de
línea al crecer el archivo). Esta vez el informe no cita ningún nombre de fichero
real, que fue lo que me convirtió en offender la vez anterior.

---

## Correcciones tras la review (CHANGES_REQUESTED del 2026-08-25)

> Los cuatro lotes ya estaban cerrados; esto es **solo coherencia documental** más
> una convención de idioma. No se ha tocado ni una línea de lógica, ni un test, ni
> el esquema. Criterio en los cuatro puntos, el mismo que usaron los lotes A y C:
> **reescribir marcando la reversión, nunca borrar el rastro de la decisión
> anterior** (qué se revierte, en qué feature y por qué).

### Los cuatro puntos del veredicto

| # | Dónde | Qué se hizo |
|---|---|---|
| 1 | [`docs/roadmap.md:151`](../../docs/roadmap.md#L151) — fila de Openbank | «El saldo por movimiento existe y **no se guarda**» tachado y seguido de ⛔ **revertido por la F31** (ADR-028): la quinta columna sí se guarda en `Movement.balanceAfter` porque **es el ancla** de esta cuenta, más el aviso 🔴 contra «restaurar» el `null`. Era el peor de los cuatro: el roadmap se lee al arrancar **cada** sesión |
| 2 | [`progress/summaries/openbank-statement.md`](../summaries/openbank-statement.md) | Los dos que nombraba el reviewer (`:93`, la tabla de tests, y `:156`, «Qué NO se tocó»: «queda anotado para el día que lo decidas» → **ese día llegó**), **más un tercero que no nombraba**: `:128`, en §«Lo que pediste», donde la petición «no quiero que se empiece a guardar el saldo tras cada movimiento» seguía figurando como ✅ cumplida. Reescrito: se cumplió **en la F19** y **la revirtió él mismo en la F31**, con el porqué |
| 3 | [`docs/data-model.md`](../../docs/data-model.md) | Los cuatro sitios: diagrama ER (`:75`) y bloque Prisma (`:156`) con las tres columnas del ancla y el comentario de `initialBalance` corregido; **pseudocódigo de `balance(cuenta)` reescrito entero** (`readAnchor` → `resolveAnchorPoint` → suma de lo estrictamente posterior); y la nota del banco de inversión (`:799-807`). Añadido un quinto: la **regla 2** de la cabecera (`:33`), que afirmaba «todo banco imprime el saldo tras cada línea, así que el saldo de una cuenta **es** el del banco» |
| 4 | [`src/modules/openbank/openbank.fixture.ts:41-50`](../../src/modules/openbank/openbank.fixture.ts#L41) | Párrafo **traducido al inglés**, contenido íntegro (incluidos el 🔴 contra restaurar el `null` y la referencia a R11), con el patrón que ya estaba en `openbank.statement.parser.ts:72-91`. De paso, los **cinco comentarios del array `openbankHeaders`**, español dentro del mismo archivo por la misma mezcla |

**Sobre el punto 3, el matiz que el leader marcó en rojo:** el pseudocódigo nuevo
**no dice que ahora mande la suma**. Dice explícitamente que *la precedencia no se
ha invertido* —donde el archivo trae saldo por línea, ese movimiento normalmente
**es** el punto de anclaje y el número que se ve sigue siendo el del banco— y que
lo único que desaparece es que la suma fuera un *fallback*. Es la lectura que se
rectificó el 2026-08-25, y está escrita así para que no se vuelva a torcer.

### Peinado: seis textos obsoletos más, ninguno nombrado por el reviewer

Buscados por frase (`único ancla`, `no se guarda`, `se tira`, `se descarta`,
`caso excepcional`, `initialBalance`) en `docs/`, `progress/` y `src/`:

| Dónde | Qué afirmaba | Estado |
|---|---|---|
| [`docs/architecture.md:615-618`](../../docs/architecture.md#L615) — ADR-011 decisión 3 | «El saldo se LEE del extracto… la suma desde `initialBalance` queda como caso excepcional» | ⛔ **Revisada por el ADR-028**, con la precedencia explícitamente intacta. El ADR no se reescribe: se marca |
| [`docs/architecture.md:804-810`](../../docs/architecture.md#L804) — ADR-012, punto 13 | «`initialBalance` deja de ser decorativo: es el **único ancla**» | Tachado y corregido: el ancla sale del preámbulo (F16) y vive en `balanceAnchor` |
| [`docs/architecture.md:1023-1027`](../../docs/architecture.md#L1023) — ADR-014, punto 3 | «la rama que suma desde `initialBalance` es el **camino normal** de esta cuenta» | Tachado y corregido, dejando claro que el **parser** de MyInvestor no cambia (sigue emitiendo `balance: null`) |
| [`docs/roadmap.md:359-368`](../../docs/roadmap.md#L359) — deberes del humano | «su saldo calculado queda **desplazado** por lo que hubiera antes del primer movimiento importado» | ⛔ **Ya no hay desplazamiento**: el total de hoy se ancla en la base de datos, no solo sobre el papel |
| [`progress/summaries/myinvestor-statement.md`](../summaries/myinvestor-statement.md) (`:143` y `:189`) | «su `initialBalance` será el **único ancla**» y «el saldo se tendrá que reconstruir sumando desde `initialBalance`» | Tachados: caducados **dos veces** (la F16 le dio saldo al archivo, la F31 lo guarda) |
| [`progress/summaries/statement-balance.md`](../summaries/statement-balance.md) y [`progress/summaries/investments-data-model.md`](../summaries/investments-data-model.md) | «`accountBalance` es el candidato natural… es decisión de producto y **feature aparte**» / «ese saldo inicial será el **único ancla**» | ✅ **Esa feature aparte se hizo, y es esta** |

Y los dos informes hermanos de esos resúmenes, por coherencia con lo que el lote A
hizo con `progress/implementations/openbank-statement.md`:
[`implementations/myinvestor-statement.md`](./myinvestor-statement.md) y
[`implementations/statement-balance.md`](./statement-balance.md).

**Dónde se paró el peine, a propósito, y por qué:**

- **`progress/history.md`** (líneas 528, 652, 897 y 917) dice varias veces que el
  saldo arranca de `initialBalance` y que el de Openbank «no se guarda». **No se
  toca**: su cabecera es explícita —«append-only… **No edites entradas
  anteriores**»—. Lo corrige la línea de cierre de la F31, que se añade al final.
- **`specs/` de features cerradas** (`data-model`, `myinvestor-statement`,
  `investments-data-model`, `openbank-statement`, `import`) repiten lo mismo en sus
  `decisions.md` / `design.md` / `requirements.md`. **No se tocan**: un spec es el
  artefacto que el humano **aprobó en su día**, y reescribirlo falsifica qué se
  aprobó; quien lo abra ve la fecha de su feature. Si el leader prefiere lo
  contrario, es un encargo aparte y de una sola pasada.

### Último `./init.sh`

🟡 **Rojo por un solo fallo, y no es de esta feature.** **930 de 931 tests en
verde, 47 de 48 archivos** — uno **más** que en la pasada del reviewer (929/931),
—y **940 de 941, 48 de 49 archivos**, en la reejecución de las 21:55, donde ya
entran los tests que el implementer de la **F33** está escribiendo en paralelo—,
porque el fallo de **importes** de `src/no-real-data.test.ts:868` ha desaparecido
al limpiarse `progress/explorations/handoff-backend-saldo-real.md`, que el leader
estaba tocando en paralelo.

Queda `src/no-real-data.test.ts:886` (frases), el conocido de Trade Republic.
**Comprobado offender por offender: ni uno de los archivos que he tocado aparece
en la lista.** Los 14 señalados son los de Trade Republic, los `docs/` y
`progress/` que citan sus ficheros de producto, y el `import.service.test.ts:1043`
que el reviewer ya verificó idéntico a `git show HEAD:`. **Ningún offender nuevo**
(ADR-017 respetado: aquí no se ha escrito ni un importe, real ni inventado).

`tsc --noEmit`, lint y formato: limpios. No se ha tocado `feature_list.json` ni
`progress/explorations/handoff-backend-saldo-real.md`.

⚠️ En la reejecución, `init.sh` añade un segundo `[FAIL]`: **«Hay 2 features en
in_progress (máximo 1)»**. No es mío —no he tocado `feature_list.json`—: es la F33
`tests-dont-touch-real-var`, que el leader ha abierto en paralelo mientras la F31
sigue sin cerrar. Lo digo aquí en vez de arreglarlo, como manda el protocolo de
lotes cuando el rojo viene de trabajo ajeno en curso.

### Sugerencias fuera de scope (NO aplicadas)

- Los `specs/` de las cinco features cerradas y `progress/history.md` siguen
  conteniendo las frases viejas, por la razón de arriba. Si algún día molestan, lo
  barato es un **guardián** en `architecture.test.ts` que falle si aparece «único
  ancla» o «el saldo se lee del extracto» **fuera** de `specs/` y de `history.md`:
  convierte este peine manual en un test.
- `progress/summaries/myinvestor-statement.md:141` sigue diciendo que la cuenta
  corriente de MyInvestor «hay que darla de alta a mano». Eso lo tumbó la **F12**
  (línea `iban;…`), no la F31, y no lo he tocado: es otra feature.
