# balance-reconciliation (F32) — implementación

> Feature **SDD**, spec aprobado. `tasks.md` está partido en **dos lotes** y cada
> lote escribe **su propia sección** en este archivo, añadiéndola al final. El
> lote B depende de que el A esté en verde.

## Lote A

**Alcance:** T1 a T7 — las dos comprobaciones, aisladas. **No** se engancha nada
a la importación: eso es el lote B.

### Archivos modificados / creados

| Archivo | Qué cambia |
|---|---|
| [`src/modules/import/import.balance.service.ts`](../../src/modules/import/import.balance.service.ts) | **Nuevo.** El tipo `BalanceMismatch` y las dos comprobaciones |
| [`src/modules/import/import.balance.service.test.ts`](../../src/modules/import/import.balance.service.test.ts) | **Nuevo.** 8 tests puros (línea a línea) + 7 con base de datos (preámbulo) |
| [`src/modules/movements/movements.service.ts`](../../src/modules/movements/movements.service.ts#L97) | `netOf` pasa de privada a exportada. **Su cuerpo no se toca**: solo se le añade el docstring que explica por qué se exporta |
| [`src/modules/movements/movements.test.ts`](../../src/modules/movements/movements.test.ts#L415) | 3 tests de `netOf`, uno de ellos comprobando que es la MISMA suma que usa `computeAccountBalance` |

Ningún archivo del lote B se ha tocado.

### El contrato que hereda el lote B

```ts
export interface BalanceMismatch {
  accountId: number
  accountAlias: string
  date: string        // YYYY-MM-DD del punto comparado
  computed: string    // decimal con dos cifras
  fromFile: string    // decimal con dos cifras
  difference: string  // computed − fromFile, con su signo
  check: 'per-line' | 'statement-balance'
}

export function findPerLineMismatches(
  statement: ParsedStatement,
  account: { id: number; alias: string },
): BalanceMismatch[]

export interface StatementBalanceCheckDeps {
  prisma: AppPrismaClient
  statement: ParsedStatement
  account: { id: number; alias: string }
  anchor: BalanceAnchor | null   // el ancla ANTES de que este archivo anclase
}

export async function findStatementBalanceMismatch(
  deps: StatementBalanceCheckDeps,
): Promise<BalanceMismatch | null>
```

`findPerLineMismatches` es **pura** (ni base de datos, ni reloj, ni ancla) y
devuelve siempre un array, vacío cuando no hay nada que decir.
`findStatementBalanceMismatch` hace **una sola consulta**, y solo cuando hay algo
que comparar: los tres `null` de la T4 se resuelven antes de tocar la base.

### Decisiones tomadas

1. **La firma del segundo parámetro es `{ id, alias }`, no la entidad `Account`.**
   Es lo único que el descuadre necesita (R6), y así la función no depende de la
   forma que tenga una cuenta en la base. El lote B puede pasarle
   `resolution.account` tal cual: encaja estructuralmente.
2. **El objeto de dependencias se ha tipado con nombre (`StatementBalanceCheckDeps`)**
   en vez de dejarlo anónimo como en el `design.md` §2. Mismo contrato; con
   nombre, el lote B puede importarlo si le hace falta.
3. **`select` incluye `balanceAfter`.** El `design.md` §2.2 no lo listaba, pero
   `netOf` recibe `BalanceMovement[]` y ese tipo lo exige. Se ha preferido pedir
   la columna a fabricar un `balanceAfter: null` de mentira al mapear: la
   comprobación no lo usa, pero un `null` inventado sí sería una afirmación falsa
   sobre la fila. Alternativa descartada: cambiar la firma de `netOf`, que es
   justo lo que la T1 prohíbe.
4. **No existe ninguna constante de tolerancia.** La comparación vive en una
   función privada de tres líneas, `isMatch(difference)`, que es
   `difference.isZero()`. Su docstring dice por qué no hay margen. Grep
   ejecutado sobre los archivos del lote: `tolerance` solo aparece en prosa —el
   docstring que dice que no la hay y dos nombres de test que dicen que es
   cero—, `epsilon` no aparece, y el único `0.01` es el **importe esperado** de
   los dos tests del céntimo, nunca un umbral.
5. **El corte fino lo hace `isAfter`, la ventana de SQL es gruesa.** La consulta
   filtra por día (`gte`/`lte`) y el «estrictamente posterior al ancla» y el «no
   posterior a la línea más reciente del archivo» se aplican en memoria con la
   misma función que usa la fórmula del saldo. Hay un test que lo fija: un
   movimiento guardado **en el punto exacto del ancla** no se vuelve a sumar, y
   otro más nuevo que todo el archivo no entra.
6. **La palabra «testigo» no aparece.** En código, `balanceMismatch`; en prosa,
   «descuadre».

### Trazabilidad

Requirements cubiertos por este lote (los que faltan son del lote B):

| R | Test |
|---|---|
| R1 | `findPerLineMismatches` → `reports nothing when every jump between two balances is explained by the amount (R1)`, `orders by (bookingDate, daySequence), not by the order of the file (R1)`, `reports a line whose amount does not explain the jump, with the five data (R1, R6)` |
| R2 | `findPerLineMismatches` → `reports nothing for a pair where one of the two lines brings no balance (R2)` |
| R3 | `findStatementBalanceMismatch` → `returns null when the net after the anchor adds up to the preamble balance (R3, R5)`, `reports the mismatch when one more movement sits in the window (R3, R6)`, `ignores the movements stored after the most recent line of the file (R3)`; y `netOf` → `is the SAME sum the balance formula uses: one rule, one place` |
| R4 | `findStatementBalanceMismatch` → `returns null when the account had no stored anchor before this file (R4)`, `returns null when the most recent movement of the file is not after the anchor (R4)` |
| R5 | `findPerLineMismatches` → `treats a difference of one cent as a mismatch: the tolerance is zero (R5)`; `findStatementBalanceMismatch` → `treats a difference of one cent as a mismatch: the tolerance is zero (R5)` |
| R6 | `reports a line whose amount does not explain the jump, with the five data (R1, R6)`, `keeps the sign of the difference when the file says more than the jump (R6)`, `reports the mismatch when one more movement sits in the window (R3, R6)` — los tres comparan el objeto ENTERO con `toEqual` |
| R9 | `findPerLineMismatches` → `reports nothing for a file where no line brings a balance at all (R9)`; `findStatementBalanceMismatch` → `returns null when the file brings no preamble balance (R9)` |
| R7, R8, R10, R11 | **Del lote B.** Esta mitad no toca la importación |

Mapeo contra los criterios de `docs/verification.md` §Nivel 4: cada `R<n>` del
alcance de este lote tiene al menos un test concreto que comprueba el resultado,
no la ausencia de excepción.

### Verificación ejecutada

| Comprobación | Resultado |
|---|---|
| `pnpm exec tsc --noEmit` | sin errores |
| `pnpm exec vitest run` de los dos archivos del lote | 2 archivos, **61 tests** en verde |
| `./init.sh` completo | **52 archivos, 988 tests** en verde → `[OK] Entorno listo` (partía de 970: +18, que son los 15 del archivo nuevo y los 3 de `netOf`) |
| `pnpm run format:check` | verde salvo el aviso conocido y **ajeno** de `scripts/bankinter-pdf-a-xlsx.mjs`. `movements.test.ts` salió señalado en la primera pasada (finales de línea) y se corrigió con `prettier --write` antes de cerrar |
| `pnpm exec vitest run src/no-real-data.test.ts` | 48 tests en verde; **ninguno de los archivos de esta feature** entre los offenders |

Los tests de la T7 corren contra PostgreSQL de verdad (base desechable del
worker): la cuenta se crea con `app.prisma`, así que sin base no pasarían. No
hubo ningún `ECONNREFUSED`.

### Lo que el lote B necesita saber

1. **Las dos funciones ya están listas para engancharse**; el enganche (T9) solo
   tiene que pasarles el `statement`, la cuenta y —para la segunda— **el ancla
   leída ANTES de `anchorAccountIfMissing`**. Si le pasa el ancla de después, la
   comprobación compara el archivo contra sí mismo y siempre dará `null`: es el
   fallo silencioso más fácil de cometer aquí, y no hay test en este lote que lo
   pueda cazar porque el ancla es un parámetro.
2. **`findStatementBalanceMismatch` devuelve `BalanceMismatch | null`**, no un
   array. `result.balanceMismatches = [...perLine, ...(statementBalance === null ? [] : [statementBalance])]`.
3. **Ninguna de las dos lanza excepciones propias.** La única forma de que fallen
   es que falle la consulta a la base.
4. **`netOf` ya está exportada** desde `movements.service.ts`: no hace falta
   volver a exportarla ni duplicar la regla de signos.
5. **`import.balance.service.ts` está sujeto al guardián de bancos** de
   `src/architecture.test.ts` (recorre todos los `.ts` de `modules/import/` que
   no son tests y prohíbe el nombre de cualquier banco). Hoy lo cumple.

### Sugerencias fuera de scope (NO aplicadas)

1. **`src/architecture.test.ts` no lista los dos archivos nuevos** en el árbol
   objetivo del ADR-004. La suite sigue verde porque esa comprobación solo mira
   que los archivos esperados **existan**, no que no haya otros; aun así, el
   árbol declarado se está quedando incompleto. Ese archivo no es de ninguno de
   los dos lotes, así que no se ha tocado: si el leader quiere, es una línea por
   archivo.
2. **Propuesta de vocabulario, sin aplicar:** los dos valores de `check` se
   llaman `'per-line'` y `'statement-balance'` porque son la traducción literal
   de cómo `requirements.md` describe las dos comprobaciones («línea a línea» y
   «contra el saldo del preámbulo»). No es una palabra nueva inventada, pero
   viaja en la API en cuanto entre el lote B, así que **conviene que el humano
   vea esos dos valores** en la puerta del contrato.
3. **`scripts/bankinter-pdf-a-xlsx.mjs` sigue sin pasar `format:check`.** Es
   previo y ajeno a esta feature.

---

## Lote B — implementación

> El informe de la importación: los descuadres viajan en la respuesta de importar
> y en ningún otro sitio. T8 a T16, todas cerradas y marcadas `[x]` en `tasks.md`.

### Archivos modificados

- [`src/modules/import/import.types.ts`](../../src/modules/import/import.types.ts)
  — `balanceMismatches: BalanceMismatch[]` en `StatementResult` y en
  `AttemptedFileReport` (ese no hereda de `StatementResult`, duplica sus campos,
  así que hubo que añadirlo en los dos); `balanceMismatches?` en `FileCounts`;
  `balanceMismatchCount` en `ImportRunResult` y `LocalImportRunResult` (T8).
- [`src/modules/import/import.service.ts`](../../src/modules/import/import.service.ts)
  — `readStoredAnchor` privada, llamada **antes** de `anchorAccountIfMissing`; las
  dos comprobaciones enganchadas en `importStatement`; el array inicializado en
  `emptyStatementResult()`; `totals()` suma `balanceMismatchCount` (T9, T10).
- [`src/modules/import/import.service.test.ts`](../../src/modules/import/import.service.test.ts)
  — bloque nuevo con **6** tests (T11, T12, T14 y el del orden), más un `toEqual`
  de un test previo que ahora incluye `balanceMismatchCount: 0`.
- [`src/modules/import/import.local.service.test.ts`](../../src/modules/import/import.local.service.test.ts)
  — **1** test: la vía local reporta los descuadres y el contador con la misma
  forma que la de Drive (T13).
- [`docs/api-contract.md`](../../docs/api-contract.md) — `balanceMismatches` y
  `balanceMismatchCount` en `POST /api/import` y `POST /api/import/local`, con
  ejemplo inventado, tabla de campos, tabla de los **dos valores de `check`** y la
  frase explícita de que `GET /api/accounts` **no cambia** (T15).
- [`docs/architecture.md`](../../docs/architecture.md) — **ADR-030** (T16).

**Ni una línea de `import.local.service.ts`**: la vía local gana las dos cosas sin
tocarse, porque ya comparte `importStatement` y `totals`. Era la predicción de R11
y se ha cumplido; el test de T13 existe para que no se separen.

### Cómo se cazó el aviso nº 1 (el ancla leída ANTES del anclaje)

**Ningún test de caja negra puede distinguir los dos órdenes. Está comprobado, no
supuesto.** Invertí el orden en `import.service.ts` (la lectura del ancla pasada
detrás de `anchorAccountIfMissing`) y ejecuté el archivo entero: **53 de 54 tests
siguieron verdes**. Y no es casualidad, es estructural: con el orden malo el ancla
que llega es la que este archivo acaba de escribir, que está exactamente en el
movimiento más reciente del archivo, así que la guarda `isAfter(upTo, anchor)` de
`findStatementBalanceMismatch` da `false` y la función devuelve `null`, que es lo
mismo que devuelve con el orden bueno (R4: no había ancla previa). Los dos órdenes
solo se separan cuando `anchorAccountIfMissing` **escribe**, y ese es justo el caso
en el que los dos acaban en `null`. Por eso el fallo sería invisible: la feature
seguiría en verde sin comprobar nada en cuanto alguien moviera esa línea.

El único test que lo cazó, y el que lo caza a propósito, en
[`import.service.test.ts`](../../src/modules/import/import.service.test.ts):

> `hands the preamble check the anchor from BEFORE this file anchored the account (R4)`

Llama a `importStatement` con el cliente real envuelto en un `Proxy` que **graba
las llamadas a `prisma.account` en orden**, y exige tres cosas sobre una cuenta que
este mismo archivo crea y ancla:

1. la lectura que pide las tres columnas del ancla ocurre **antes** del `updateMany`
   que ancla;
2. esa lectura devolvió `balanceAnchor` a `null`;
3. y, para que ese `null` signifique algo, después del import la cuenta **sí** está
   anclada (a `300.00`): leída después, el ancla habría llegado con el número del
   propio archivo.

Con el orden invertido, ese test (y solo ese) sale rojo. Es una comprobación del
orden, no del resultado, porque el resultado no distingue nada.

### Decisiones tomadas

1. **`readStoredAnchor` no reutiliza `readAccountAnchor`.** Son dos lecturas con dos
   propósitos: la vieja se hace **después** del anclaje, devuelve solo el importe y
   alimenta el informe de la cuenta; la nueva se hace **antes**, devuelve el
   `BalanceAnchor` completo y es lo que hace que la comprobación compruebe algo.
   Fundirlas sería exactamente el fallo del aviso nº 1. La nueva construye el ancla
   con `readAnchor`, el único lector de esas tres columnas.
2. **El test del orden es de caja gris, y es deliberado.** Un `Proxy` sobre
   `prisma.account` es más frágil que una aserción de resultado; se acepta porque la
   alternativa es no tener test. Distingue la lectura del ancla de las demás por su
   `select` (`balanceAnchorDate`), no por la posición de la llamada, para que no se
   rompa si mañana se añade otra consulta en medio.
3. **`balanceMismatches` es obligatorio en `StatementResult` y opcional en
   `FileCounts`.** Un archivo `skipped` y uno de producto no traen ninguno y
   `totals()` los cuenta como cero; un extracto siempre trae el array, aunque esté
   vacío, para que «no se encontró nada» y «no se comprobó nada» no se lean igual.
4. **No se ha tocado el orden de nada más.** Las comprobaciones van después del
   anclaje y dentro del `try` que ya existía, como dice el diseño: un fallo de la
   consulta deja el archivo `failed` sin haber movido nada en Drive, que es el
   comportamiento actual de cualquier fallo posterior al guardado.

### Trazabilidad (lo que cubre este lote; R1, R2 y R5 los cubrió el lote A)

- R3 → `reports the preamble descuadre of a file reaching an ALREADY anchored account (R3, R6)`
  (`import.service.test.ts`), además de los tests del lote A
- R4 → `hands the preamble check the anchor from BEFORE this file anchored the account (R4)`
- R6 → `reports a per-line descuadre, imports the file anyway and goes on with the next (R6, R7)`,
  que comprueba los **cinco** datos y el `check`
- R7 → el mismo test: `status: "imported"`, `imported: 2`, `movedToProcessed: true`,
  y el archivo siguiente entra igual
- R8 → `leaves the stored anchor untouched when the file that arrives descuadra (R8)`
  y `does NOT move the balance GET /api/accounts and GET /api/accounts/:id return (R8)`
- R9 → `imports a file with no preamble balance and no per-line balance, reporting no descuadre (R9)`
- R10 → `balanceMismatchCount` afirmado en los tests de R6, R9 y R11
- R11 → `reports the descuadres of each copy and the total of the run, as the Drive way does (R11)`
  (`import.local.service.test.ts`)

### Criterios de `docs/verification.md` §Criterios mínimos

| Criterio | Cómo se cumple |
| --- | --- |
| Cumple los criterios de su `acceptance` | El `acceptance` de la F32 está vacío; los criterios del humano viven en `como_se_que_esta_bien` y los mapea `requirements.md` §Trazabilidad, cubierta entera arriba |
| Tests que cubren los criterios, no solo el happy path | El camino triste lo cubren los dos tests de R8 (el descuadre no mueve nada), el de R9 (nada que comparar) y el del orden (el fallo silencioso) |
| `./init.sh` verde | Sí, ver abajo |
| Veredicto del reviewer | Pendiente: no marco la feature `done` |
| `progress/current.md` describe lo hecho | Sí, sección del lote B |

### Último `./init.sh`

`[OK] Entorno listo`, con **995 tests en 52 archivos**, todos verdes (partía de
988: +6 en `import.service.test.ts` y +1 en `import.local.service.test.ts`).
Además, ejecutados aparte:

- `pnpm exec vitest run src/no-real-data.test.ts` → **48 verdes**, y **ninguno de
  mis archivos aparece entre los offenders** (ADR-017).
- `pnpm run format:check` → solo queda el aviso conocido y **ajeno** de
  `scripts/bankinter-pdf-a-xlsx.mjs`; mis cuatro archivos de `src/` pasaron por
  `prettier --write`.
- `pnpm run lint` → sin nada que decir.
- La palabra «testigo» **no aparece** en ningún archivo de esta feature (`grep`
  sobre `src/modules/import/`, `docs/api-contract.md` y `docs/architecture.md`:
  cero resultados).

### Lo que el reviewer necesita mirar

1. **El test del orden es la pieza crítica de este lote.** Si se cae o se
   simplifica, la feature puede quedarse muerta y en verde. La razón está escrita en
   el ADR-030 y en el comentario del propio `importStatement`.
2. **`AttemptedFileReport` duplica los campos de `StatementResult`** en vez de
   heredarlos; el `design.md` §5 daba por hecho que los heredaba. El campo se ha
   añadido en los dos y `tsc` lo verifica, pero conviene saberlo.
3. **La prueba real sigue pendiente y es del humano** (`decisions.md`
   §Consecuencias): lanzar `POST /api/import/local` y mirar `balanceMismatchCount`.
   La suite dice que el código hace lo que el spec dice, no que sus cuatro cuentas
   cuadren.

### Sugerencias fuera de scope (NO aplicadas)

1. **Ningún test comprueba hoy que un fallo DENTRO de la comprobación deje el
   archivo `failed`** (diseño §4, última frase). No se puede provocar sin inyectar un
   fallo de la consulta, y `import.balance.service.test.ts` no es de este lote.
2. **`src/architecture.test.ts` sigue sin listar `import.balance.service.ts`** en el
   árbol objetivo del ADR-004 (ya lo señaló el lote A). Ese archivo no es de ninguno
   de los dos lotes.
3. **Vocabulario, propuesta sin aplicar:** en el contrato he llamado a las dos
   comprobaciones «línea a línea» y «contra el saldo del preámbulo», que es como las
   describe `requirements.md`, y `check` sigue viajando como `per-line` y
   `statement-balance`. No he inventado ninguna palabra corta para ellas; si el
   humano quiere una, es decisión suya y cambia la API.
4. **`scripts/bankinter-pdf-a-xlsx.mjs` sigue sin pasar `format:check`.** Previo y
   ajeno a esta feature.
