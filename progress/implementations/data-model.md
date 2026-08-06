# Implementación — Feature 8 `data-model`

> Informe del `implementer`. Feature SDD: la fuente de verdad es
> [`specs/data-model/`](../../specs/data-model/design.md) (requirements + design +
> tasks), **no** el `acceptance` original de `feature_list.json`. El spec pasó por
> **cuatro correcciones humanas** en la puerta de aprobación y todas se han
> respetado (sin endpoint de traspasos, sin alta ni borrado de movimientos, saldo
> leído del extracto, `daySequence` en la clave de dedup).
>
> - **Fecha:** 2026-08-06
> - **Estado en `feature_list.json`:** `in_progress` (**no** se marca `done`: falta
>   el veredicto del `reviewer` y su `progress/summaries/data-model.md`).
> - **Verificación:** `bash ./init.sh` **verde** — typecheck + **197 tests**
>   (la suite estaba en 146 al arrancar).
> - **Tasks:** T1-T22 de [`specs/data-model/tasks.md`](../../specs/data-model/tasks.md)
>   **todas marcadas `[x]`**. Ninguna saltada.

---

## 1. Archivos creados / modificados / borrados

### Creados

| Archivo | Qué es |
| --- | --- |
| `prisma/migrations/20260806191700_data_model/migration.sql` | DROP del `Expense` + `Category` viejos, CREATE de los 6 enums y las 3 tablas, y los **dos índices en SQL crudo** (dedup parcial y `NULLS NOT DISTINCT`). |
| `src/modules/accounts/accounts.routes.ts` | HTTP: `POST /`, `GET /`, `GET /:id`. |
| `src/modules/accounts/accounts.service.ts` | `accountsDb`, `listAccounts`, `getAccountById`, `createAccount`, `findOrCreateAccountFromMetadata`, `normalizeIban`, `serializeAccount`. Único punto que habla con Prisma. |
| `src/modules/accounts/accounts.schema.ts` | `createAccountSchema`, `accountIdParamsSchema` (JSON Schema/AJV, ADR-003). |
| `src/modules/accounts/accounts.types.ts` | `CreateAccountBody`, `AccountIdParams`, `AccountMetadata`, `AccountWithBalance`, `FindOrCreateAccountResult`, `SerializedAccount`. |
| `src/modules/accounts/accounts.test.ts` | 15 tests de integración + servicio. |
| `src/modules/categories/categories.routes.ts` | HTTP: `POST /`, `GET /`. |
| `src/modules/categories/categories.service.ts` | `categoriesDb`, `listCategories`, `createCategory`, `serializeCategory`. |
| `src/modules/categories/categories.schema.ts` | `createCategorySchema`. |
| `src/modules/categories/categories.types.ts` | `CreateCategoryBody`, `CategoryWithChildren`, `SerializedCategory`. |
| `src/modules/categories/categories.test.ts` | 10 tests de integración. |
| `src/modules/movements/movements.routes.ts` | HTTP: **solo** `GET /`. |
| `src/modules/movements/movements.service.ts` | `movementsDb`, `listMovements`, `serializeMovement` + helpers puros `deriveMovementTypeFromAmount`, `computeAccountBalance`, `computeTotals`. |
| `src/modules/movements/movements.types.ts` | `DecimalLike`, `BalanceMovement`, `TotalsMovement`, `MovementTotals`, `MovementWithRelations`, `EmbeddedAccount`, `EmbeddedCategory`, `SerializedMovement`. |
| `src/modules/movements/movements.test.ts` | 11 tests unitarios (helpers, sin BD) + 10 de integración + 3 de forma de enums. |

### Modificados

| Archivo | Cambio |
| --- | --- |
| `prisma/schema.prisma` | **Reemplazado**: 6 enums + `Account` / `Category` (nueva) / `Movement`. Fuera `Expense`. |
| `src/errors/app-error.ts` | + `ConflictError` (`CONFLICT`, 409) y `MissingAccountDataError` (`MISSING_ACCOUNT_DATA`, 422). |
| `src/errors/app-error.test.ts` | + 4 tests de las dos clases nuevas. |
| `src/app.ts` | Fuera `expensesRoutes`; dentro `accountsRoutes` (`/api/accounts`), `categoriesRoutes` (`/api/categories`), `movementsRoutes` (`/api/movements`). |
| `src/architecture.test.ts` | Árbol objetivo actualizado; guardas nuevas (no existe `modules/expenses/`, las 3 rutas nuevas sin `prisma`, `movements` sin `createMovement`/`deleteMovement`/`createTransfer`); + describe de integración `/api/expenses` → 404 y de tablas viejas ausentes. |
| `docs/api-contract.md` | T15 (ver §4). |
| `docs/data-model.md` | T16: reescrito al modelo final. |
| `docs/architecture.md` | T17: **ADR-011**, árbol de carpetas, subclases nuevas bajo ADR-005. |
| `progress/current.md` | T18: plan de implementación + nota de **breaking change**. |
| `specs/data-model/tasks.md` | T1-T22 marcadas `[x]`. |

### Borrados

- `src/modules/expenses/` completo (`expenses.routes.ts`, `expenses.service.ts`,
  `expenses.schema.ts`, `expenses.types.ts`, `expenses.test.ts`).

**No tocados** (restricción dura del spec): `.env`, `.env.example`,
`src/modules/bankinter/*` (el parser), `docs/stack.md` (sin dependencias ni
variables nuevas), `feature_list.json`.

---

## 2. Diseño y decisiones tomadas

Todo sale del `design.md`; aquí solo las concreciones que el spec dejaba abiertas
al escribir el código.

1. **Migración escrita a mano en vez de `migrate dev --create-only`.**
   `prisma migrate dev --create-only` **aborta en entorno no interactivo**
   (`Prisma Migrate has detected that the environment is non-interactive`) porque
   el cambio pide confirmación. Se generó el SQL con
   `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`
   (salida oficial de Prisma) y se le antepusieron los `DROP TABLE` y se le
   anexaron los dos índices personalizados — exactamente el resultado que T5
   describe ("editar el `.sql`"). Aplicada con `pnpm run prisma:migrate`, que sí
   funcionó y reportó *"Your database is now in sync with your schema"*: **no hay
   drift** pese a los dos índices fuera del schema (el shadow DB replica la
   migración), tal y como predecía `design.md` §3.
2. **`computeAccountBalance` es puro y el servicio hace el trabajo de consulta.**
   Para cumplir a la vez `design.md` §6 ("una consulta y ninguna suma en el caso
   normal") y §11 ("helpers puros testeables sin BD"): `listAccounts` /
   `getAccountById` piden a Prisma **solo la última línea con `balanceAfter`** por
   cuenta (`include` con `where: { balanceAfter: { not: null } }`,
   `orderBy: [bookingDate desc, daySequence desc]`, `take: 1`) y únicamente las
   cuentas que no traen ninguna disparan una **segunda** consulta con sus
   movimientos para la rama de suma. El helper recibe los datos ya cargados.
3. **`parentId` inexistente en `POST /api/categories` → 404 `NOT_FOUND`.**
   `design.md` §5 lo resume como `400` y §10 lo enumera explícitamente como
   `NotFoundError` (404); ningún requirement fija el caso. Se siguió §10 (la
   sección dedicada a errores) y queda documentado en `api-contract.md`. **Punto a
   confirmar por el reviewer.**
4. **Serialización en el `*.service.ts`, no en la ruta.** El guardián de
   arquitectura prohíbe la cadena `prisma` en los `*.routes.ts`, y serializar
   `Decimal` exige el tipo `Prisma.Decimal`. Las rutas llaman a
   `serializeAccount` / `serializeCategory` / `serializeMovement`, que viven junto
   al acceso a datos. Se mantiene el Principio 1 (la ruta valida, delega y
   formatea; no decide nada).
5. **Forma de los embebidos de `Movement`.** `account` se embebe **sin `balance`**
   (calcularlo por movimiento sería una consulta por fila y R13 no lo pide) y
   `category` **sin `children`** (un embebido no arrastra el árbol). Documentado en
   el contrato.
6. **Orden `daySequence DESC NULLS LAST` en el listado.** Postgres pone los `NULL`
   primero en un `DESC`; se usa `{ sort: 'desc', nulls: 'last' }` para que el SQL
   coincida con la semántica del helper puro (`daySequence ?? 0`).
7. **Los tests aíslan sus filas por clave propia, no por contadores globales.**
   Vitest ejecuta los archivos en **paralelo** contra la misma BD: los IBAN y los
   nombres de categoría llevan sufijo aleatorio y las aserciones filtran por los
   ids creados por el propio test (en vez de `count()` global). Se detectaron y
   corrigieron dos flakes reales por esto.
8. **El test HTTP de `/api/expenses` → 404 vive en `src/architecture.test.ts`**
   (describe propio). Es la excepción consciente que ya documenta ese archivo:
   guarda invariantes del árbol, y el módulo al que pertenecería el test **ya no
   existe**.

### Lo que NO se hizo (por mandato del spec)

- ❌ **Ningún endpoint, servicio ni validación de traspasos** (`POST /transfer`,
  `createTransfer`, enlazado/desenlazado, detección de parejas). `transferId` es
  una columna **reservada**: en esta feature solo la escriben los tests.
- ❌ **Ni `createMovement` ni `deleteMovement` ni `movements.schema.ts`**: el
  módulo es de **solo lectura** (guardado por test en `architecture.test.ts`).
- ❌ Nada de Drive, parseo, importación en lote ni endpoint que dispare el
  auto-alta de cuenta (R32).
- ❌ Sin dependencias nuevas, sin variables de entorno nuevas, `pnpm` en todo
  momento.

---

## 3. Verificación adicional de la migración (R5, R35)

Además de la suite, se aplicó el historial completo sobre una **base de datos
limpia** creada al efecto (`gastos_clean_check`, borrada después):

```
$ prisma migrate deploy          # DATABASE_URL apuntando a la BD limpia
2 migrations found in prisma/migrations
Applying migration `20260707171322_init`
Applying migration `20260806191700_data_model`
All migrations have been successfully applied.

$ \dt        -> Account | Category | Movement | _prisma_migrations   (NO hay Expense)
$ enums      -> AccountType, CategoryKind, MovementOrigin, MovementStatus, MovementType, PaymentMethod
$ índices    -> Movement_imported_dedup_key, Movement_accountId_bookingDate_daySequence_idx,
                Movement_transferId_idx, Category_parentId_kind_name_key
$ prisma migrate status  -> "Database schema is up to date!"
$ prisma migrate diff (BD vs schema) -> "-- This is an empty migration."   # sin drift
```

Índices tal como los ve Postgres (BD de trabajo):

```
"Movement_imported_dedup_key" UNIQUE, btree ("accountId","bookingDate",type,amount,description,"daySequence")
    WHERE origin = 'imported'::"MovementOrigin"
"Category_parentId_kind_name_key" UNIQUE, btree ("parentId", kind, name) NULLS NOT DISTINCT
```

---

## 4. Documentación actualizada

- **`docs/api-contract.md`** — nota visible de **BREAKING CHANGE** (fuera `Expense`
  y `/api/expenses`, ahora 404); modelos `Account`, `Category` (nueva) y
  `Movement` en inglés (decimales como string, `bookingDate`/`valueDate` como
  `YYYY-MM-DD`, `transferId`/`daySequence` nullable, `balance` = saldo del último
  extracto y **no** una suma); endpoints `/api/accounts` (POST, GET, GET `:id`),
  `/api/categories` (POST, GET) y `/api/movements` (**solo GET**, con la nota de
  que los movimientos entran únicamente por importación); códigos `CONFLICT` (409)
  y `MISSING_ACCOUNT_DATA` (422, **reservado**) en la tabla de códigos estables.
- **`docs/data-model.md`** — reescrito al modelo final (deja de ser borrador):
  sin `cash`, sin `MovementType.transfer` ni `MovementDirection`/`direction`,
  con `iban`, `bookingDate`/`valueDate`, `balanceAfter`, `currency`,
  `description`, `neutral` y `daySequence`; apartado de traspaso reescrito (dos
  movimientos ordinarios que ya llegan del banco); fórmula de saldo reescrita (se
  lee del extracto); nota de que no hay alta ni borrado manual; los dos "puntos
  abiertos" 1 y 2 **cerrados** con la solución concreta de los índices.
- **`docs/architecture.md`** — **ADR-011** completa (decisión, alternativas
  descartadas, consecuencias y límites conocidos), árbol de `src/` actualizado y
  las dos subclases nuevas anotadas bajo ADR-005.
- **`progress/current.md`** — plan de la sesión y bloque de **breaking change**.
- **`docs/stack.md`** — **sin cambios** (no hay dependencias ni variables nuevas).

---

## 5. Trazabilidad `R<n>` → test

> Vigentes: **R1-R11, R3b, R13, R18-R20, R25-R37**.
> **R12, R14-R17 y R21-R24 están RETIRADOS** por las correcciones humanas en la
> puerta (alta/borrado manual de movimientos y endpoint de traspasos); sus números
> no se reutilizan y no se implementan.
>
> ⚠️ **R32 y R36 son requirements de proceso**: se verifican por **checklist del
> reviewer** sobre el diff, no por test (no tienen superficie ejecutable propia).
> De **R18** solo se testea la parte persistible; el "no existe endpoint de
> traspasos" lo verifica el reviewer sobre el diff (apoyado por un guardián en
> `architecture.test.ts`).

| `R<n>` | Test(s) |
| --- | --- |
| **R1** — modelo `Account`, `iban` único, sin `cash` | `accounts.test.ts` › `AccountType offers checking and savings only: there is no cash account (R1)` · `POST /api/accounts with a valid body returns 201 with the account (R1, R8)` · `rejects a duplicated iban at the database level too (R1)` |
| **R2** — modelo `Category` + relación `parent`/`children` | `categories.test.ts` › `models the one-level hierarchy with parent and children relations (R2)` |
| **R3** — modelo `Movement` completo, defaults, sin `direction` | `movements.test.ts` › `persists a Movement with every field and no direction column (R3)` · `applies the imported / pending_review / EUR defaults (R3)` |
| **R3b** — `daySequence` = posición dentro del día | `movements.test.ts` › `GET /api/movements orders the same day by daySequence descending (R13, R3b)` · `stores three identical statement lines that differ only in daySequence (R6, R3b)` · `computeAccountBalance › breaks a same-day tie with the highest daySequence, not the array order` |
| **R4** — enums (sin `transfer`, sin `MovementDirection`) | `movements.test.ts` › `flow enums generated from the schema (R4) › MovementType is expense \| income \| neutral, with no transfer value` · `does not define a MovementDirection enum` · `CategoryKind, PaymentMethod, MovementOrigin and MovementStatus hold their values` · `accepts every value of the movement enums (R4)` · `accounts.test.ts › AccountType offers checking and savings only (R1)` |
| **R5** — migración sobre BD limpia sin error | `architecture.test.ts` › `the Category table is the new one, not the bootstrap placeholder (R35)` + **toda** la suite de integración corre contra la BD migrada + evidencia de `prisma migrate deploy` sobre BD limpia (§3 de este informe) |
| **R6** — índice único **parcial** de dedup | `movements.test.ts` › `rejects a second imported movement with the same dedup key (R6)` · `stores three identical statement lines that differ only in daySequence (R6, R3b)` · `does not impose uniqueness on manual movements: the index is partial (R6)` |
| **R7** — unicidad de raíz (`NULLS NOT DISTINCT`) | `categories.test.ts` › `POST /api/categories duplicating a root {kind,name} returns 409 (R29, R7)` · `allows homonymous subcategories under different parents (R7)` · `allows the same root name for a different kind (R7)` |
| **R8** — `POST /api/accounts` → 201 | `accounts.test.ts` › `POST /api/accounts with a valid body returns 201 with the account (R1, R8)` · `POST /api/accounts normalizes the iban and honours alias and type (R8)` |
| **R9** — `GET /api/accounts` con `balance` leído del extracto | `accounts.test.ts` › `GET /api/accounts reads the balance from the latest statement line (R9)` · `GET /api/accounts falls back to initialBalance +income -expense without statements (R9)` · `GET /api/accounts/:id returns the account with its balance, 404 when unknown (R9)` · unitarios `movements.test.ts › computeAccountBalance › returns the balanceAfter of the most recent movement, without summing anything` · `breaks a same-day tie with the highest daySequence…` · `ignores movements without balanceAfter when the statement provides one` · `falls back to initialBalance + income - expense when no movement carries a balance` · `returns initialBalance for an account with no movements at all` |
| **R10** — IBAN duplicado → 409 `CONFLICT` | `accounts.test.ts` › `POST /api/accounts with a duplicated iban returns 409 CONFLICT (R10)` · `app-error.test.ts › ConflictError is an AppError with CONFLICT / 409` · `ConflictError has a default message` |
| **R11** — alta de cuenta sin `iban`/`bank` → 400 | `accounts.test.ts` › `POST /api/accounts without iban returns 400 VALIDATION_ERROR (R11)` · `…without bank…(R11)` · `…with an empty iban…(R11)` |
| **R13** — `GET /api/movements` ordenado, con `account` y `category` | `movements.test.ts` › `GET /api/movements lists newest first with account and category embedded (R13)` · `GET /api/movements orders the same day by daySequence descending (R13, R3b)` |
| **R18** — traspaso = dos movimientos enlazados por `transferId`, sin endpoint | `movements.test.ts` › `keeps both legs of a transfer linked by transferId, with their type intact (R18)` · guardián `architecture.test.ts › keeps the movements module read-only (no create/delete/transfer surface)` · **resto: checklist del reviewer sobre el diff** (no hay ruta `/api/movements/transfer` ni servicio `createTransfer`) |
| **R19** — el saldo no da trato especial a las piernas | `movements.test.ts` › `GET /api/accounts reports each transfer leg balance from the statement (R19)` · unitario `computeAccountBalance › reads the balance of both transfer legs from the statement, with no special branch` (+ revisión: `computeAccountBalance` no menciona `transferId`) |
| **R20** — totales globales excluyen traspasos y `neutral` | `movements.test.ts` › `computeTotals › excludes transfer legs and neutral movements from the global totals` · `computeTotals › returns zero totals for an empty dataset` |
| **R25** — `POST /api/categories` raíz y subcategoría | `categories.test.ts` › `POST /api/categories creates a root and a subcategory (R25)` |
| **R26** — `GET /api/categories` con `children` | `categories.test.ts` › `GET /api/categories returns roots with their children embedded (R26)` |
| **R27** — más de un nivel → 400 | `categories.test.ts` › `POST /api/categories with a subcategory as parent returns 400 (R27)` |
| **R28** — `kind` distinto al del padre → 400 | `categories.test.ts` › `POST /api/categories with a kind different from its parent returns 400 (R28)` |
| **R29** — segunda raíz `{kind,name}` → 409 | `categories.test.ts` › `POST /api/categories duplicating a root {kind,name} returns 409 (R29, R7)` |
| **R30** — `findOrCreateAccountFromMetadata` (find y create con defaults) | `accounts.test.ts` › `findOrCreateAccountFromMetadata returns the existing account by iban (R30)` · `findOrCreateAccountFromMetadata creates a new account with defaults (R30)` |
| **R31** — metadatos insuficientes → `MissingAccountDataError` (422) | `accounts.test.ts` › `findOrCreateAccountFromMetadata throws MissingAccountDataError without iban (R31)` · `…without bank (R31)` · `app-error.test.ts › MissingAccountDataError is an AppError with MISSING_ACCOUNT_DATA / 422` · `MissingAccountDataError has a default message` |
| **R32** — límite de la feature (sin Drive, sin endpoint de auto-alta) | ⚠️ **Requirement de proceso: checklist del reviewer** sobre `design.md` §7 y el diff. Evidencia parcial ejecutable: `architecture.test.ts › keeps the flow module routes free of data access` y la ausencia de rutas nuevas más allá de las tres documentadas; la nota de **reservado** de `MISSING_ACCOUNT_DATA` está escrita en `docs/api-contract.md`. |
| **R33** — importe 0 → `neutral` | `movements.test.ts` › `deriveMovementTypeFromAmount › maps a negative amount to expense` · `maps a positive amount to income` · `maps a zero amount to neutral` · `computeAccountBalance › falls back to initialBalance + income - expense…` (el `neutral` aporta 0) · `computeTotals › excludes transfer legs and neutral movements…` |
| **R34** — `/api/expenses*` → 404 y módulo borrado | `architecture.test.ts` › `GET /api/expenses returns 404` · `POST /api/expenses returns 404` · `GET /api/expenses/1 returns 404` · `has no src/modules/expenses/ directory (replaced by the flow model)` |
| **R35** — la migración elimina las tablas viejas | `architecture.test.ts` › `the Expense table no longer exists in the database (R35)` · `the Category table is the new one, not the bootstrap placeholder (R35)` + evidencia de `migrate deploy` sobre BD limpia (§3) |
| **R36** — docs actualizadas (contrato + data-model + breaking change) | ⚠️ **Requirement de proceso: checklist del reviewer** sobre el diff de `docs/api-contract.md`, `docs/data-model.md` y `progress/current.md` (resumen en §4 de este informe). |
| **R37** — ADR, invariantes de arquitectura e `init.sh` verde | `bash ./init.sh` **verde** (§6) · `architecture.test.ts` completo (rutas sin `prisma`, árbol objetivo, `movements` read-only) · ADR-011 en `docs/architecture.md` · este mapa de trazabilidad |

---

## 6. Output del último `./init.sh`

```
── 1. Detectando stack ────────────────────────────────
[OK]    Stack detectado: node
[OK]    Runtime: v24.18.0

── 2. Verificando archivos base del arnés ──────────────
[OK]    Existe AGENTS.md
[OK]    Existe CHECKPOINTS.md
[OK]    Existe feature_list.json
[OK]    Existe progress/current.md
[OK]    Existe docs/stack.md
[OK]    Existe docs/architecture.md
[OK]    Existe docs/conventions.md
[OK]    Existe docs/verification.md
[OK]    Existe docs/specs.md

── 3. Validando feature_list.json ──────────────────────
[OK]    feature_list.json válido (8 features)
[OK]    Specs presentes para features sdd con estado no-pending

── 4. Type checking (tsc) ──────────────────────────────
[INFO]  Ejecutando: npx tsc --noEmit
[OK]    Type check OK (tsc sin errores)

── 5. Ejecutando tests ─────────────────────────────────
[INFO]  Ejecutando: pnpm test
$ vitest run

 RUN  v4.1.10 C:/Users/roybe/Escritorio/proyectos/control-gastos/gastos-backend

 Test Files  16 passed (16)
      Tests  197 passed (197)
   Start at  19:44:46
   Duration  2.76s

[OK]    Todos los tests pasan

── 6. Resumen ──────────────────────────────────────────
[OK]    Entorno listo. Puedes empezar a trabajar.
```

Comprobaciones complementarias: `pnpm run lint` (ESLint) sin avisos y
`pnpm run format:check` (Prettier) → *All matched files use Prettier code style!*

---

## 7. Estado final en `feature_list.json`

**`in_progress`** — sin cambios. El `implementer` **no** marca `done`: falta el
veredicto del `reviewer` y su `progress/summaries/data-model.md` (C8). Cuando
apruebe, se pasa a `done` y este informe se añade a `progress/history.md`.

---

## 8. Sugerencias fuera de scope (NO aplicadas)

1. **`GET /api/movements` sin paginación ni filtros.** Devuelve la tabla entera;
   con años de importaciones crecerá. El spec no pide paginación (R13) y añadirla
   cambiaría el contrato. Candidata a feature propia junto a los dashboards.
2. **Carrera en `findOrCreateAccountFromMetadata`.** Dos importaciones simultáneas
   de la misma cuenta nueva harían que la segunda recibiera un `P2002` en vez de la
   cuenta existente. No ocurre hoy (nadie la llama todavía); la feature de
   importación debería envolverla con un reintento *find-after-conflict*.
3. **`initialBalance` no admite negativos** (`minimum: 0` en el schema, como pedía
   T7). Si alguna cuenta arranca en descubierto habría que relajarlo.
4. **`docs/verification.md`** conserva el bloque `curl` de `/api/expenses` como
   "referencia manual"; ya no existe ese endpoint. Actualizarlo es un cambio de
   docs ajeno a las tasks T15-T18 y **no se ha tocado**.
5. **`api-contract.md` — `parentId` inexistente devuelve 404**, no 400 (ver §2.3).
   Si el humano prefiere 400, es un cambio de una línea en `categories.service.ts`
   y otra en el contrato.
