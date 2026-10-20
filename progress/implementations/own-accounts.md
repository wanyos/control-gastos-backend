# own-accounts — implementación

## Lote A — implementación

Tasks T1–T7 de `specs/62-own-accounts/tasks.md`, marcadas `[x]`. No he escrito en la
base de datos del humano: la migración solo se ha aplicado a la base de tests (la
aplica sola la pasada de `pnpm test` a `gastos_test_template`), y la comprobación de
antes y después de la suite sobre su base salió sin diferencias (`./init.sh` en verde).

### Archivos modificados / creados

- `prisma/schema.prisma` — enums `OwnAccountType` y `OwnershipDecision`; modelos
  `OwnAccount`, `OwnAccountText` (`onDelete: Cascade`, `@@unique([ownAccountId, text])`)
  y `AccountHolderName` (`name @unique`); `Movement.ownershipDecision OwnershipDecision?`.
  Comentarios de `Movement.productId` y `Movement.excludedFromTotals` ampliados con la F62
  (`design.md` §9).
- `prisma/migrations/20261020120000_own_accounts/migration.sql` — nueva. El SQL sale de
  `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script` (no conecta
  a ninguna base), recortado a lo nuevo. Las tablas nacen vacías; no siembra nada.
- `src/lib/test-real-data.ts` — `OwnAccount.name`, `OwnAccount.accountNumber`,
  `OwnAccountText.text` y `AccountHolderName.name` en `comparedColumns` (`kind: 'text'`);
  `OwnAccount.bank` en `notComparedColumns` con `bankName`.
- `src/modules/own-accounts/own-accounts.recognition.ts` — nuevo: `normalizeOwnText`,
  `resolveOwnership` y los tipos `OwnershipInput`, `OwnAccountForMatch`, `OwnershipReading`.
- `src/modules/own-accounts/own-accounts.service.ts` — nuevo: `ownAccountsDb`,
  `listOwnAccounts`, `createOwnAccount`, `updateOwnAccount`, `listHolderNames`,
  `replaceHolderNames`, `readOwnership` y `serializeOwnAccount`.
- `src/modules/own-accounts/own-accounts.schema.ts`, `own-accounts.types.ts`,
  `own-accounts.routes.ts` — nuevos: las cinco rutas de `design.md` §7.
- `src/app.ts` — registro de `ownAccountsRoutes` con prefijo `/api/own-accounts`.
- `src/modules/own-accounts/own-accounts.routes.test.ts`,
  `own-accounts.recognition.test.ts` — nuevos.
- `docs/data-model.md` — ver «Documentos actualizados».
- `specs/62-own-accounts/tasks.md` — T1–T7 marcadas.
- `progress/current.md` — la línea de la feature en curso.

### Decisiones tomadas

Todas dentro de lo que dejan abierto `design.md` §3, §4 y §7:

- **Orden entre formas del titular:** si casan varias, se informa la más larga (y a igual
  longitud, la primera alfabética). El diseño fija el orden de los textos de cuenta (por
  `ownAccountId` ascendente y luego el más largo), no el de las formas; elegí el mismo
  criterio para que el resultado sea estable.
- **Paso 1 con decisión:** `ownAccountId`, `ownAccountName` y `matchedText` son los de lo
  que case, sea forma, texto propio o texto de banco; `null` si no casa nada.
- **Repetidos:** textos y formas iguales una vez normalizados se guardan una sola vez,
  la primera tal como se escribió (`design.md` §7 lo pide para `texts`; lo apliqué igual
  a las formas del titular porque la columna es `@unique` y dos formas que normalizan
  igual son la misma).
- **Lo que se guarda tal cual:** `texts`, las formas y `accountNumber` se guardan como
  llegan; `name` y `bank` con `trim()`. Un `name` o `bank` en blanco (`'   '`) es 400
  igual que vacío.
- **`updatedAt` en `PATCH`:** se pone a mano para que un `PATCH` que solo cambia `texts`
  también lo mueva.
- **Validación de fechas:** el formato `YYYY-MM-DD` lo comprueba el esquema de la ruta
  (`format: 'date'`, como `GET /api/movements`); `closedAt` anterior a `openedAt` lo
  comprueba el servicio, también en `PATCH` contra el valor ya guardado del otro campo.
- **`readOwnership`:** usa el atajo permitido de §4: si no hay formas ni textos, solo lee
  los movimientos con `ownershipDecision` no nula.
- **`GET /api/own-accounts/holder-names`:** orden alfabético por la intercalación de la
  base (`orderBy: { name: 'asc' }`).

### Trazabilidad

- R1 → `creates an own account with its texts and lists it ordered by bank`
- R2 → `updates only the fields sent and replaces the texts` (incluye el 404 sin escribir)
- R3 → `rejects an invalid own account without writing` (cada condición en `POST` y en
  `PATCH`; foto de las dos tablas igual antes y después)
- R4 → `replaces and returns the holder name forms`
- R5 → `recognizes the holder name and a non-bank text as own, whole words only`
- R6 → `does not recognize a movement by the bank field alone`
- R7 → `leaves as doubtful a movement named only by a bank name`
- R8 → `never makes doubtful a transfer leg or a marked movement`
- R10 → `the human decision wins over the recognition` (la parte pura; la parte de
  `PATCH /api/movements/:id` es del Lote B)
- R5 (las tres sumas), R6 (las sumas), R9, R11, R12, R13, R14, R15 → Lote B
  (`own-accounts.totals.test.ts`, `own-accounts.docs.test.ts`).

Comprobación de que un test de R8 caza el fallo: quité a mano la línea
`if (movement.transferId !== null || movement.excludedFromTotals) continue` de
`own-accounts.recognition.ts`, lancé `pnpm exec vitest run
src/modules/own-accounts/own-accounts.recognition.test.ts` y salió
`× never makes doubtful a transfer leg or a marked movement` (`1 failed | 5 passed`).
Restaurada la línea, verde.

### Documentos actualizados

`docs/data-model.md` (lección #2), comprobado contra `prisma/schema.prisma`:

- Tabla de cabecera: fila «las cuentas propias del humano» (F62, ADR-040).
- Diagrama ER: `ownershipDecision` en `MOVEMENT`; entidades `OWN_ACCOUNT`,
  `OWN_ACCOUNT_TEXT` (con su relación) y `ACCOUNT_HOLDER_NAME`; nota de que no cuelgan de
  nada.
- Bloque Prisma de la Parte 1: enum `OwnershipDecision` y línea `ownershipDecision`.
- «Columnas reservadas»: fila `ownershipDecision`, con su único escritor
  (`PATCH /api/movements/:id`). ⚠️ Ese escritor lo pone el Lote B (T10): hasta entonces
  la fila describe cómo queda la feature al cerrarse, no el código de este lote.
- Exclusiones de los totales: párrafo de la F62 tras el de los depósitos.
- Sección nueva «Las cuentas propias del humano (F62)»: bloque Prisma de las tres tablas,
  tabla de claves naturales y lo que no se borra ni se escribe.

Los enlaces a `ADR-040` apuntan a un ADR que escribe el Lote B (T13).

`git grep` lanzados fuera de `progress/` y `specs/`:

- `git grep -n "ImportUnparsedRow.note\|CategoryRule.matchText"` (listas de columnas que
  compara `src/no-real-data.test.ts`):
  - **`docs/conventions.md:131-134` — BLOQUEO, fuera de los archivos de los dos lotes.**
    Enumera las columnas de texto comparadas («Textos: `Movement.description`, … e
    `ImportUnparsedRow.note`») y desde este lote faltan `OwnAccount.name`,
    `OwnAccount.accountNumber`, `OwnAccountText.text` y `AccountHolderName.name`. No la he
    tocado. Hace falta añadir esas cuatro al final de la enumeración (por ejemplo «… e
    `ImportUnparsedRow.note` (esta última desde la F54), y desde la F62 `OwnAccount.name`,
    `OwnAccount.accountNumber`, `OwnAccountText.text` y `AccountHolderName.name`»).
  - `docs/architecture.md:1343` y `:2620` son notas «Revisado el … por la feature 51 / 54»
    del ADR-017: histórico fechado, no se reescriben. Si se quiere dejar dicho en el
    ADR-017 que la F62 añade cuatro columnas, es una nota «Revisado el 2026-10-20 por la
    feature 62» en `docs/architecture.md`, que es archivo del Lote B.
- Rutas nuevas, campo `ownershipDecision`, `ownership` y sumas en `docs/api-contract.md`,
  `README.md` y `docs/architecture.md`: son T12 y T13, del Lote B. No los he tocado.

### Prueba real

No aplica en este lote: no lee archivos de banco ni ninguna API externa. Los datos que
leerá (la tabla y las formas del nombre) los escribe el humano por las rutas nuevas, y en
su base las tablas todavía no existen (la migración no se le ha aplicado). La prueba con
sus cuentas es el paso sin código que la hoja deja para después de la feature.

### Último ./init.sh

Antes de lanzarlo comprobé que no había ningún proceso `node` con `vitest` en la línea de
órdenes (consulta a `Win32_Process`: ninguno). Salida, código 0:

```
[OK]    feature_list.json válido (62 features)
[OK]    Specs presentes para features sdd con estado no-pending
[OK]    Type check OK (tsc sin errores)
[OK]    OK: pnpm run lint
[OK]    OK: pnpm run format:check
 Test Files  89 passed (89)
      Tests  1491 passed (1491)
[OK]    Todos los tests pasan
[OK]    Entorno listo. Puedes empezar a trabajar.
```

### Último ./init.sh --checks 62

Código de salida 1, «Checks: 10 de 18 en verde». En verde: 1, 2, 3, 4 (`own-accounts.routes.test.ts`),
5, 7, 9, 10, 14 (`own-accounts.recognition.test.ts`) y 18 (`pnpm test`).

En rojo los ocho que dependen del Lote B, todos con `No test files found, exiting with code 1`
porque los archivos aún no existen:

- 6 `a movement naming an own account or the holder counts in none of the three sums` (`own-accounts.totals.test.ts`)
- 8 `a transfer to another person counts even when its bank is in the own accounts table` (`own-accounts.totals.test.ts`)
- 11 `a doubtful movement keeps counting and is listed with ownership=doubtful` (`own-accounts.totals.test.ts`)
- 12 `a decision on a doubtful movement is kept and respected in the three sums` (`own-accounts.totals.test.ts`)
- 13 `recognizes movements already stored and movements imported afterwards` (`own-accounts.totals.test.ts`)
- 15 `recognition writes nothing: amounts, balances, marks and transfer pairs stay the same` (`own-accounts.totals.test.ts`)
- 16 `api-contract: describes the own accounts table, the recognition, the doubtful movements and how to resolve them` (`own-accounts.docs.test.ts`)
- 17 `a deposit movement still counts by the deposit rule` (`own-accounts.totals.test.ts`)

### Sugerencias fuera de scope (NO aplicadas)

- `src/architecture.test.ts` comprueba que las rutas de los módulos del flujo no nombran
  el cliente de datos, con una lista fija de archivos; `own-accounts.routes.ts` cumple la
  regla pero no está en esa lista. Añadirlo es una línea en un archivo que no es de
  ningún lote.

## Lote B — implementación

Tasks T8–T14 de `specs/62-own-accounts/tasks.md`, marcadas `[x]`. No he escrito en la
base de datos del humano: todo se ha ejecutado contra las bases de tests (`pnpm test`
y `./init.sh`, que comprueba antes y después de la suite que su base no cambia: salió
en verde).

### Archivos modificados / creados

- `src/modules/movements/movements.service.ts` — `isCountedExpense(movement, deposits,
  ownership)` y `computeTotals(movements, deposits, ownership)` con el orden de
  `design.md` §5 (depósito primero; después «sale si `leavesTotals`»; después lo de
  siempre) y sus comentarios. `listMovements` lee `readOwnership` **antes** del `count`;
  `movementListWhere(query, ownership)` añade `id: { in: [dudosos] }` con
  `ownership=doubtful`; cada movimiento listado lleva `ownership` (`serializeOwnership`,
  sin `leavesTotals`). `updateMovement` escribe `ownershipDecision`; `serializeMovement`
  lo devuelve. Comentario de `updateMovement` corregido (decía «los dos únicos campos»).
- `src/modules/movements/movements.types.ts` — `MovementListQuery.ownership`,
  `UpdateMovementBody.ownershipDecision`, `MovementWritableFields.ownershipDecision`,
  `SerializedMovement.ownershipDecision`, `SerializedOwnership` y `ListedMovement` con
  `ownership`.
- `src/modules/movements/movements.schema.ts` — `ownership: enum ['doubtful']` en el
  querystring; `ownershipDecision: ['string','null'], enum ['mine','not_mine',null]` en
  el body de `PATCH /api/movements/:id`. El esquema de `PATCH /api/movements` no cambia:
  sigue respondiendo 400 si llega (lo comprueba el test de R10).
- `src/modules/movements/movements.routes.ts` — solo comentarios.
- `src/modules/movements/movements.test.ts` — las siete llamadas a `computeTotals` pasan
  un tercer `new Map()`; la lista de campos serializados gana `ownershipDecision` y
  `ownership`.
- `src/modules/overview/overview.service.ts` y
  `src/modules/recurring-expenses/recurring-expenses.service.ts` — `readOwnership` en su
  `Promise.all` y el mapa a `computeTotals` / `isCountedExpense`.
- `src/modules/own-accounts/own-accounts.totals.test.ts` — nuevo (T11, siete tests).
- `src/modules/own-accounts/own-accounts.docs.test.ts` — nuevo (T12).
- `docs/api-contract.md`, `docs/architecture.md` (ADR-040), `README.md`,
  `docs/conventions.md` — ver «Documentos actualizados».
- `specs/62-own-accounts/tasks.md` — T8–T14 marcadas. `progress/current.md` — la línea
  del Lote B.

No he necesitado tocar `movements.exclusion.test.ts`, `movements.deposits.test.ts`,
`movements.deposits.docs.test.ts`, `overview.test.ts`, `recurring-expenses.test.ts` ni
`recurring-expenses.docs.test.ts`: siguen en verde sin cambios (ninguna de sus frases
fijadas dejó de ser cierta).

### Decisiones tomadas

Dentro de lo que dejan abierto `design.md` §5 y §6:

- **`readOwnership` en `listMovements` va antes del `count` y fuera del `Promise.all`**
  (lo pide §6 para que el filtro entre en el `where`). En `getOverview` y
  `getRecurringExpenses` va dentro de su `Promise.all`.
- **`computeTotals` mira `leavesTotals` antes que `isCountedExpense`**, e
  `isCountedExpense` también lo mira, para que `GET /api/recurring-expenses` (que solo
  llama a `isCountedExpense`) diga lo mismo.
- **`ownershipDecision` con un valor fuera de la lista** (p. ej. `"yes"`) → 400 por el
  `enum` del esquema; lo comprueba el test de R10.
- **El contrato**: la regla va en una sección `#### Movimientos entre tus cuentas en las
  sumas` dentro de `GET /api/movements`, detrás de la de depósitos, enlazada desde
  `GET /api/overview`, `GET /api/recurring-expenses`, `PATCH /api/movements/:id` y el
  modelo `Movement`. Los ejemplos de `ownership` van como objetos JSON sueltos, no como
  lista: `movements.deposits.docs.test.ts` toma toda lista JSON de esa sección como
  ejemplos de `deposit`. El modelo `OwnAccount` va tras `Movement`; las cinco rutas, tras
  `GET /api/recurring-expenses`.
- **Vocabulario**: el spec llama «texto de banco» a un texto que es el nombre de un
  banco. No está en `docs/vocabulary.md` ni en la tabla de `CLAUDE.md`, así que en el
  contrato y en el ADR-040 lo he escrito literal («un texto que es el nombre de un
  banco»). «Tabla de cuentas propias», «formas de tu nombre» y «dudoso» describen
  `OwnAccount`, `AccountHolderName` y `doubtful`, aprobados el 2026-10-20.

### Trazabilidad

- R5 → `a movement naming an own account or the holder counts in none of the three sums`
  (y en lo puro, `recognizes the holder name and a non-bank text as own, whole words only`)
- R6 → `a transfer to another person counts even when its bank is in the own accounts table`
  (y `does not recognize a movement by the bank field alone`)
- R7 → `a doubtful movement keeps counting and is listed with ownership=doubtful`
  (y `leaves as doubtful a movement named only by a bank name`)
- R8 → `never makes doubtful a transfer leg or a marked movement` (Lote A)
- R9 → `a deposit movement still counts by the deposit rule`
- R10 → `a decision on a doubtful movement is kept and respected in the three sums`
  (`mine`, `not_mine`, `null`, un valor fuera de la lista → 400, y `PATCH /api/movements`
  con `ownershipDecision` → 400 sin escribir) y `the human decision wins over the recognition`
- R11 → `a doubtful movement keeps counting and is listed with ownership=doubtful` y
  `a movement naming an own account or the holder counts in none of the three sums`
  (forma de `ownership` con y sin cuenta, `null`); la lista de campos de
  `keeps the serialized shape of each movement exactly as it was (feature 36)`
- R12 → `a doubtful movement keeps counting and is listed with ownership=doubtful`
  (`pagination.total` 1 y `totals` solo del dudoso; `ownership=own` → 400)
- R13 → `recognizes movements already stored and movements imported afterwards`
  (uno sembrado antes de guardar las formas; otro importado después por `importPending`
  con `src/lib/drive.fixture.ts` y el CSV sintético de `revolut.fixture.ts`)
- R14 → `recognition writes nothing: amounts, balances, marks and transfer pairs stay the same`
  (foto de todas las columnas de los movimientos del test y de `GET /api/accounts` antes y
  después de rellenar la tabla y leer las tres sumas; `detectTransfers` forma la misma
  pareja sin la tabla y, tras poner `transferId` a `null`, con la tabla rellena) y
  `pnpm test` entero
- R15 → `api-contract: describes the own accounts table, the recognition, the doubtful movements and how to resolve them`

Cómo se miden las tres sumas sin depender del resto de filas de la base de tests: cada
test lee las tres antes de rellenar la tabla y después, y compara la diferencia (el
`totals` del listado va filtrado por la cuenta del test; `period.totals` y
`monthlyTotal` son de toda la base, así que se compara cuánto bajan). Los importes de
gasto son múltiplos de 12 para que `monthlyTotal` baje una cifra exacta.

Comprobación de que los tests cazan el fallo: borré a mano de `movements.service.ts` la
línea `if (ownership.get(movement.id)?.leavesTotals === true) return totals` y la
condición `ownership.get(movement.id)?.leavesTotals !== true &&`, lancé
`pnpm exec vitest run src/modules/own-accounts/own-accounts.totals.test.ts` y salió
`Tests  4 failed | 3 passed (7)` (fallan R5, R7/R11/R12, R10 y R13; los que pasan son
R6, R9 y R14, que comprueban justo que nada cambia). Restaurado el archivo, verde.

### Documentos actualizados

`git grep` lanzados fuera de `progress/` y `specs/`:

- `git grep -n "computeTotals\|isCountedExpense"`: las líneas de `docs/architecture.md`
  3030 (ADR-035) y 3136-3140 (ADR-037) describen la firma de entonces; son ADR y no se
  reescriben. `docs/data-model.md:465` es del Lote A (ya tiene el párrafo de la F62 en
  la línea 505). `docs/roadmap.md` y `feature_list.json`: histórico. Comentarios de
  `overview.service.ts` y `recurring-expenses.service.ts`: actualizado el de overview; el
  de recurring sigue siendo cierto.
- `git grep -n "solo\*\* cambian\|únicos campos\|ONLY two"`:
  - `docs/api-contract.md` §`PATCH /api/movements/:id` decía que los `totals` **solo**
    cambian al escribir `excludedFromTotals`: añadido «y desde la feature 62
    `ownershipDecision`».
  - `docs/api-contract.md` §`PATCH /api/movements`: la misma frase sigue siendo cierta
    (ese endpoint no admite `ownershipDecision`); añadido que no lo admite.
  - `movements.service.ts` (`updateMovement`), `movements.types.ts`
    (`UpdateMovementBody`) y `movements.schema.ts` (`updateMovementSchema`): comentarios
    que decían «los dos únicos campos», corregidos.
- `git grep -n "ImportUnparsedRow.note"` → `docs/conventions.md:131-135`: añadidas
  `OwnAccount.name`, `OwnAccount.accountNumber`, `OwnAccountText.text` y
  `AccountHolderName.name` (ampliación autorizada por el leader). Las de
  `docs/architecture.md` 1343 y 2620 son notas fechadas de las F51 y F54: no se tocan; el
  ADR-040 dice en sus consecuencias que la F62 añade esas cuatro columnas.
- `docs/api-contract.md`: modelo `Movement` (fila `ownershipDecision`), modelo
  `OwnAccount` nuevo con ejemplo JSON, `GET /api/movements` (párrafo de la F62, fila del
  parámetro `ownership`, `ownershipDecision` y `ownership` en el ejemplo de respuesta,
  tabla de claves de `ownership` con dos ejemplos, la exclusión en `totals`, la sección
  `#### Movimientos entre tus cuentas en las sumas`, fila de errores y la nota de solo
  lectura), `PATCH /api/movements`, `PATCH /api/movements/:id` (párrafo, fila del body,
  ejemplo, respuesta), `GET /api/overview`, `GET /api/recurring-expenses` («Qué
  movimientos entran») y las cinco rutas de `/api/own-accounts`.
- `docs/architecture.md`: ADR-040 nuevo, antes de «Qué NO hacer». No revisa ningún ADR.
- `README.md`: filas de `GET /api/movements` (filtro y campo) y `PATCH
  /api/movements/:id` (`ownershipDecision`), y las cinco filas de `/api/own-accounts`.

Datos: todo lo de los tests y del contrato es inventado (titular «Ana Pérez Gil», otra
persona «Lucía Pérez Sanz», «Fondo Global Inventado», número de depósito 880417, el de
`movements.deposits.test.ts`). `src/no-real-data.test.ts` marcó en la primera pasada un
importe de `own-accounts.totals.test.ts` que está en la base del humano; lo cambié por
otro inventado y quedó en verde. No he añadido fixtures `.xls` ni `.pdf`.

### Prueba real

No aplica en este lote: no lee archivos de banco ni ninguna API externa nueva (la
importación del test de R13 usa el CSV sintético y el doble de Drive). La prueba con sus
cuentas es el paso sin código que la hoja deja para después de la feature.

### Último ./init.sh

Antes de lanzarlo comprobé que no había ningún proceso `node.exe` con `vitest` en la línea
de órdenes (consulta a `Win32_Process`: 0). Salida, código 0:

```
[OK]    feature_list.json válido (62 features)
[OK]    Specs presentes para features sdd con estado no-pending
[OK]    Type check OK (tsc sin errores)
[OK]    OK: pnpm run lint
[OK]    OK: pnpm run format:check
 Test Files  91 passed (91)
      Tests  1499 passed (1499)
[OK]    Todos los tests pasan
[OK]    Entorno listo. Puedes empezar a trabajar.
```

### Último ./init.sh --checks 62

Código de salida 0:

```
[OK]    Checks: 18 de 18 en verde.
```

(los 18, del 1 al 18, con `[OK] exit 0`; el 18 es `pnpm test`.)

### Sugerencias fuera de scope (NO aplicadas)

- La de `src/architecture.test.ts` que dejó el Lote A sigue en pie.
- `docs/data-model.md:463-465` dice que las exclusiones de los totales globales son
  «tres»; la F57 y la F62 añaden reglas en párrafos aparte, más abajo. Si se quiere que
  la frase lo diga, es una edición de `docs/data-model.md` (archivo del Lote A).

## Lote A — corrección tras la revisión (cambio requerido 1)

Lo que pidió `progress/reviews/own-accounts.md`, «Cambios requeridos» 1: el punto 🔴 3 de
la hoja (solo vale la forma entera del nombre) no lo comprobaba ningún test. Solo he
tocado `src/modules/own-accounts/own-accounts.recognition.test.ts`, dentro de
`recognizes the holder name and a non-bank text as own, whole words only` (el nombre no
cambia):

- Formas del titular en los dos órdenes: `['Ana Pérez Gil', 'PEREZ GIL ANA']`. El
  movimiento `TRANSF PEREZ GIL ANA` sale `own` con `matchedText: 'PEREZ GIL ANA'`.
- Otra persona inventada con los mismos dos apellidos, en los dos órdenes
  (`Bizum Lucia Perez Gil cumple`, `TRANSF /PEREZ GIL LUCIA`), y una cuyo nombre
  termina igual que el del titular, en los dos órdenes (`TRANSF /Mariana Perez Gil`,
  `TRANSF PEREZ GIL MARIANA`): `readings.has(id)` es `false` para los cuatro (no salen
  como `own` ni como dudosos). `readings.size` pasa de 2 a 3.

Comprobé que el test detecta el fallo: cambié a mano la comparación de
`own-accounts.recognition.ts` a `normalizedDescription.includes(normalizedText)`, sin
exigir palabras enteras, y `pnpm exec vitest run
src/modules/own-accounts/own-accounts.recognition.test.ts -t "recognizes the holder name"`
salió con `× recognizes the holder name and a non-bank text as own, whole words only`
(`1 failed | 5 skipped`). Después restauré el archivo y `git diff` sobre él no muestra
cambios.

### Último ./init.sh

Antes de lanzarlo comprobé con `Win32_Process` que no había ningún proceso `node` con
`vitest` en marcha: no había ninguno. Código de salida 0:

```
[OK]    Type check OK (tsc sin errores)
[OK]    OK: pnpm run lint
[OK]    OK: pnpm run format:check
 Test Files  91 passed (91)
      Tests  1499 passed (1499)
[OK]    Todos los tests pasan
[OK]    Entorno listo. Puedes empezar a trabajar.
```

### Último ./init.sh --checks 62

Código de salida 0: `[OK]    Checks: 18 de 18 en verde.`
