# Tasks — F62 `own-accounts`

> Los nombres de test entre comillas son los que filtran los `checks` de
> `feature_list.json`: tienen que existir **con ese nombre exacto** y ejecutarse.
>
> **Ningún dato del humano en tests ni en ejemplos** (`docs/conventions.md` §Tests):
> ni su nombre, ni el de sus hijas, ni conceptos copiados de su base. Nombres de
> persona inventados (p. ej. titular «Ana Pérez Gil», otra persona «Lucía Pérez
> Sanz»), conceptos inventados («TRANSF /Ana Perez Gil», «Traspaso hucha
> inventada»). Los nombres de banco solos (dos palabras como mucho) valen.
> `src/no-real-data.test.ts` detecta secuencias de tres palabras de su base.
>
> ⚠️ **Nada de esta feature se ejecuta contra la base del humano** (`gastos`).
>
> Los nombres de tabla, columna, ruta y campo son propuesta (`decisions.md` 🔴 6):
> si el humano los cambia, el leader corrige este archivo antes de lanzar los lotes.
>
> Los dos lotes van **en secuencia**: el B usa `readOwnership` del A.

## Lote A — tabla de cuentas propias, nombre del titular y reconocimiento
Archivos: `prisma/schema.prisma`, `prisma/migrations/<timestamp>_own_accounts/migration.sql`, `src/modules/own-accounts/own-accounts.routes.ts`, `src/modules/own-accounts/own-accounts.schema.ts`, `src/modules/own-accounts/own-accounts.service.ts`, `src/modules/own-accounts/own-accounts.types.ts`, `src/modules/own-accounts/own-accounts.recognition.ts`, `src/modules/own-accounts/own-accounts.routes.test.ts`, `src/modules/own-accounts/own-accounts.recognition.test.ts`, `src/app.ts`, `src/lib/test-real-data.ts`, `docs/data-model.md`
Depende de: —

- [x] T1 — Migración y `schema.prisma` (`design.md` §2): `OwnAccountType`, `OwnAccount`, `OwnAccountText`, `AccountHolderName`, `OwnershipDecision` y `Movement.ownershipDecision`, con sus comentarios. Cubre: R1, R4, R10.
- [x] T2 — `src/lib/test-real-data.ts`: las cuatro columnas de texto nuevas a `comparedColumns` (`kind: 'text'`) y `OwnAccount.bank` a `notComparedColumns` (`bankName`). Cubre: R1.
- [x] T3 — `docs/data-model.md` según la lección #2: «Columnas reservadas», bloque Prisma, diagrama ER y claves naturales, comprobado contra `schema.prisma`. Cubre: R1, R10.
- [x] T4 — `own-accounts.recognition.ts`: `normalizeOwnText` y `resolveOwnership` (`design.md` §3). Cubre: R5, R6, R7, R8, R10.
- [x] T5 — `own-accounts.service.ts`: `ownAccountsDb`, `listOwnAccounts`, `createOwnAccount`, `updateOwnAccount`, `listHolderNames`, `replaceHolderNames` y `readOwnership` (§4, §7); `own-accounts.schema.ts`, `own-accounts.types.ts`, `own-accounts.routes.ts`; registrar en `src/app.ts` con prefijo `/api/own-accounts`. Cubre: R1–R4, R13.
- [x] T6 — Tests de ruta en `own-accounts.routes.test.ts`:
  - "creates an own account with its texts and lists it ordered by bank" — R1 (dos bancos, dos cuentas en uno; orden `bank`, `name`).
  - "updates only the fields sent and replaces the texts" — R2 (y 404 con un id que no existe, sin escribir).
  - "rejects an invalid own account without writing" — R3 (un caso por cada condición de R3, en `POST` y en `PATCH`; foto de la tabla igual antes y después).
  - "replaces and returns the holder name forms" — R4 (dos `PUT` seguidos: queda la segunda lista; una forma de 2 letras → 400 y la lista anterior intacta).
- [x] T7 — Tests puros en `own-accounts.recognition.test.ts`:
  - "recognizes the holder name and a non-bank text as own, whole words only" — R5 (forma con guiones bajos y con acentos; un texto «ing» no casa con «ingreso»).
  - "does not recognize a movement by the bank field alone" — R6 (cuenta propia en un banco, transferencia a otra persona que nombra ese banco en el campo `bank` pero no casa con ningún texto → sin reading).
  - "leaves as doubtful a movement named only by a bank name" — R7 (también cuando el nombre de banco es el de **otra** fila de la tabla; y un movimiento que casa con un nombre de banco y con un texto propio → `own`).
  - "never makes doubtful a transfer leg or a marked movement" — R8.
  - "the human decision wins over the recognition" — R10 (`mine` sin casar nada, `not_mine` sobre un `own`; `leavesTotals` de cada uno).

## Lote B — las tres sumas, el listado, la decisión del humano y los documentos
Archivos: `src/modules/movements/movements.service.ts`, `src/modules/movements/movements.types.ts`, `src/modules/movements/movements.schema.ts`, `src/modules/movements/movements.routes.ts`, `src/modules/movements/movements.test.ts`, `src/modules/movements/movements.exclusion.test.ts`, `src/modules/movements/movements.deposits.test.ts`, `src/modules/movements/movements.deposits.docs.test.ts`, `src/modules/overview/overview.service.ts`, `src/modules/overview/overview.test.ts`, `src/modules/recurring-expenses/recurring-expenses.service.ts`, `src/modules/recurring-expenses/recurring-expenses.test.ts`, `src/modules/recurring-expenses/recurring-expenses.docs.test.ts`, `src/modules/own-accounts/own-accounts.totals.test.ts`, `src/modules/own-accounts/own-accounts.docs.test.ts`, `docs/api-contract.md`, `docs/architecture.md`, `README.md`
Depende de: Lote A

- [x] T8 — `isCountedExpense` y `computeTotals` con el tercer parámetro `ownership` (`design.md` §5) y sus comentarios; `listMovements`, `getOverview` y `getRecurringExpenses` leen `readOwnership`. Los tests existentes que llaman a esas dos funciones pasan un `new Map()` y siguen diciendo lo mismo. Cubre: R5, R9.
- [x] T9 — `GET /api/movements`: campo `ownership` en cada movimiento y filtro `ownership=doubtful` en el `where` compartido (§6). Cubre: R11, R12.
- [x] T10 — `PATCH /api/movements/:id` acepta `ownershipDecision`; `serializeMovement` lo devuelve; `PATCH /api/movements` sigue sin aceptarlo (§6). Ajustar la lista de campos serializados de `movements.test.ts`. Cubre: R10.
- [x] T11 — Tests de ruta en `own-accounts.totals.test.ts` (cuentas, tabla y formas inventadas; comparar `totals` de `GET /api/movements`, `period.totals` de `GET /api/overview` y el total de `GET /api/recurring-expenses` antes y después):
  - "a movement naming an own account or the holder counts in none of the three sums" — R5 (uno por la forma del titular, uno por el texto de un producto dentro del mismo banco).
  - "a transfer to another person counts even when its bank is in the own accounts table" — R6.
  - "a doubtful movement keeps counting and is listed with ownership=doubtful" — R7, R11, R12 (`total` de la paginación y `totals` del filtro son los del dudoso solo).
  - "a decision on a doubtful movement is kept and respected in the three sums" — R10 (`mine` → sale de las tres; `not_mine` → cuenta y deja de salir con el filtro; `null` → vuelve a dudoso).
  - "a deposit movement still counts by the deposit rule" — R9 (un vencimiento cuyo concepto casa con un texto propio sigue sumando su interés).
  - "recognizes movements already stored and movements imported afterwards" — R13 (un movimiento creado antes de dar de alta la cuenta propia, y otro que entra después por `importPending` con `src/lib/drive.fixture.ts`: los dos fuera de las sumas sin llamar a nada más).
  - "recognition writes nothing: amounts, balances, marks and transfer pairs stay the same" — R14 (foto de todas las columnas de los movimientos del test y de `GET /api/accounts`; `detectTransfers` forma las mismas parejas con y sin la tabla rellena).
- [x] T12 — `docs/api-contract.md` (§9) y test "api-contract: describes the own accounts table, the recognition, the doubtful movements and how to resolve them" en `own-accounts.docs.test.ts` (las cinco rutas como encabezado `### `, los campos de `OwnAccountDto` en un bloque `json`, los cuatro valores de `ownership.status`, el filtro `ownership=doubtful` y `ownershipDecision` en la sección de `PATCH /api/movements/:id`). Si `movements.deposits.docs.test.ts` o `recurring-expenses.docs.test.ts` fijan una frase que deja de ser cierta, se corrige el documento y el test. Cubre: R15.
- [x] T13 — `docs/architecture.md` (ADR-040) y `README.md` (§9). Cubre: R13, R15.
- [x] T14 — `pnpm test` entero en verde. Cubre: R14.
