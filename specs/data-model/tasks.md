# Tasks — Feature 8: data-model

> Checklist ordenada para el `implementer`. Cada task referencia los `R<n>` de
> `requirements.md` que cubre. Marcar `[x]` al completar; una task saltada exige
> justificación documentada (el reviewer rechaza si no).
>
> **Orden pensado para minimizar el tiempo en rojo:** primero errores y helpers
> puros (no rompen nada), luego el esquema + migración (rompe la suite de expenses,
> que se borra en la misma tanda), luego los módulos nuevos con sus tests, luego el
> borrado de expenses y el re-cableado de `app.ts`, luego docs.
>
> 🔴 **`pnpm`, NO npm. Sin dependencias nuevas.** 🔴 **No toques `.env`** ni el
> parser (`modules/bankinter/*`). 🔴 **Solo servicios hablan con Prisma.** 🔴 **Los
> índices personalizados van en SQL crudo en la migración**, no en el schema. 🔴
> **Requiere Postgres levantado** (`docker compose up -d`) para los tests de
> integración y la migración.
>
> ⏸️ **NO implementes hasta que el humano apruebe el spec** (`spec_ready` → puerta).

## Errores de dominio nuevos (antes de quien los lanza)

- [x] T1 — Modificar `src/errors/app-error.ts`: añadir `ConflictError`
      (`code='CONFLICT'`, `statusCode=409`) y `MissingAccountDataError`
      (`code='MISSING_ACCOUNT_DATA'`, `statusCode=422`), patrón de las subclases
      existentes. Modificar `src/errors/app-error.test.ts`: tests que afirmen
      `instanceof AppError`, `code`, `statusCode` y `name` de cada una. **No** tocar
      `error-handler.ts` (mapea cualquier `AppError`). Cubre: R10, R29, R31.

## Helpers de dominio puros (sin BD)

- [x] T2 — Crear `src/modules/movements/movements.service.ts` (de momento solo los
      helpers puros): `deriveMovementTypeFromAmount(amount)` (3 vías: `<0 expense`,
      `>0 income`, `=0 neutral`), `computeAccountBalance(...)` (**lee el saldo del
      extracto**, `design.md` §6: `balanceAfter` del movimiento más reciente con ese
      dato, orden `bookingDate DESC, daySequence DESC`, **sin sumar nada y sin
      ajustar con los manuales**; solo si no hay ninguno, `initialBalance` +
      `income` − `expense`, `neutral` = 0; **ninguna rama mira `transferId`**) y
      `computeTotals(...)` (totales globales de gasto/ingreso que **excluyen** los
      movimientos con `transferId != null` y los `neutral`, R20). Cubre: R9, R19,
      R20, R33.
- [x] T3 — Crear `src/modules/movements/movements.test.ts` (parte de helpers):
      `deriveMovementTypeFromAmount(-5)='expense'`, `(5)='income'`, `(0)='neutral'`;
      `computeAccountBalance`: (a) movimientos importados con `balanceAfter` →
      devuelve **exactamente** el del más reciente aunque `initialBalance` sea otro
      número y aunque la suma no cuadre (R9); (b) dos movimientos del **mismo día**
      con saldos distintos → gana el de `daySequence` mayor (R9, R3b); (c) + un
      movimiento manual (sin `balanceAfter`) → el saldo **no cambia** (R9); (d)
      cuenta sin ningún `balanceAfter` → `initialBalance` + income − expense,
      `neutral` = 0; (e) dataset con dos piernas enlazadas por `transferId` → el
      saldo sale igual, sin rama especial (R19). `computeTotals` sobre ese dataset →
      los totales de gasto e ingreso **ignoran** las dos piernas y el `neutral`
      (R20). Cubre: R9, R19, R20, R33.

## Esquema Prisma + migración (rompe la suite de expenses → se borra en T10-T11)

- [x] T4 — Reemplazar `prisma/schema.prisma` por el de `design.md` §2: enums
      (`AccountType` sin `cash`; `MovementType` = `expense|income|neutral`, **sin
      `transfer`**; `CategoryKind`, `PaymentMethod`, `MovementOrigin`,
      `MovementStatus`; **no** existe `MovementDirection`) y
      modelos `Account` (`iban @unique`), `Category` (`@@unique([parentId, kind,
      name])`, autorreferencia), `Movement` (parser-aligned: `bookingDate`/
      `valueDate` `@db.Date`, `amount` positivo, `description`, `balanceAfter?`,
      `currency @default("EUR")`, `transferId?`, **`daySequence Int?`** (posición
      dentro del `bookingDate`, R3b) y **sin columna `direction`**, índices
      `@@index([accountId, bookingDate, daySequence])` y `@@index([transferId])`).
      Fuera `Expense` y la `Category` vieja. Cubre: R1, R2, R3, R3b, R4.
- [x] T5 — Generar la migración con `pnpm exec prisma migrate dev --create-only
      --name data_model` y **editar el `.sql`** (`design.md` §3, §4, §8):
      (a) `DROP TABLE "Expense"` y `DROP TABLE "Category"` (viejas) antes del
      `CREATE`; forzar DROP+CREATE de `Category` (no `ALTER`); (b) tras crear
      `Movement`, anexar el índice **único parcial** de dedup
      `CREATE UNIQUE INDEX "Movement_imported_dedup_key" ON "Movement"
      ("accountId","bookingDate","type","amount","description","daySequence") WHERE
      "origin" = 'imported';` (🔴 **`daySequence` en la clave es obligatorio**: sin
      él, las tres `TRANS INM/ Openbank −1000` del mismo día de la muestra real se
      tomarían por el mismo movimiento y se perderían dos, `design.md` §3);
      (c) reemplazar el índice único de `Category` por
      `... NULLS NOT DISTINCT` (mismo nombre y columnas). Aplicar con `pnpm run
      prisma:migrate` sobre la BD de `docker-compose`. Cubre: R5, R6, R7, R35.
- [x] T6 — Regenerar el cliente (`pnpm exec prisma generate`) para que
      `src/generated/prisma/` tenga los modelos/enums nuevos. Cubre: R1-R4.

## Módulo `accounts`

- [x] T7 — Crear `src/modules/accounts/`:
      - `accounts.schema.ts`: `createAccountSchema` (body `iban` string minLength 1
        requerido, `bank` requerido, `alias?`, `type?` enum, `initialBalance?`
        number ≥ 0; `additionalProperties: false`) y `accountIdParamsSchema`.
      - `accounts.service.ts`: `accountsDb(app)` (único punto Prisma), `listAccounts`
        (con `balance` resuelto por `computeAccountBalance`, R9), `getAccountById`,
        `createAccount` (normaliza
        IBAN a mayúsculas sin espacios; `P2002` → `ConflictError`, R10), y
        **`findOrCreateAccountFromMetadata`** (find por IBAN; crea con defaults
        `alias` derivado/`type checking`/`initialBalance 0`; `MissingAccountDataError`
        si falta iban/bank; devuelve `{account, created, appliedDefaults}`; R30, R31).
      - `accounts.routes.ts`: `POST /` (201), `GET /` (200), `GET /:id`. Serializa
        `Decimal` como string y `balance` calculado.
      - `accounts.types.ts`: `CreateAccountBody`, `AccountIdParams`, `AccountMetadata`,
        `FindOrCreateAccountResult`.
      Cubre: R8, R9, R10, R11, R30, R31, R32.
- [x] T8 — Crear `src/modules/accounts/accounts.test.ts`: `POST` válido → 201 con
      `iban`/`initialBalance` string (R8); `GET` lista con `balance` = el
      `balanceAfter` del último movimiento con ese dato, y con la rama de fallback
      (cuenta sin movimientos importados → `initialBalance` ± movimientos) (R9);
      IBAN duplicado → 409 (R10); sin `iban`/sin `bank`/`iban:""`
      → 400 (R11); `findOrCreateAccountFromMetadata`: IBAN existente → `created=false`;
      IBAN nuevo con banco → crea con defaults, `created=true`, `appliedDefaults`
      (R30); sin iban / sin bank → `MissingAccountDataError`, sin crear (R31). Limpia
      las filas creadas. Cubre: R8, R9, R10, R11, R30, R31.

## Módulo `categories`

- [x] T9 — Crear `src/modules/categories/`:
      - `categories.schema.ts`: `createCategorySchema` (`name` requerido, `kind` enum
        requerido, `parentId?` integer; `additionalProperties: false`).
      - `categories.service.ts`: `listCategories` (raíces con `children[]`, R26),
        `createCategory` (si `parentId`: padre existe → si no `400`/`404`; padre es
        raíz `parent.parentId==null` si no `ValidationError` R27; `parent.kind==kind`
        si no `ValidationError` R28; `P2002` de raíz duplicada → `ConflictError` R29).
      - `categories.routes.ts`: `POST /` (201), `GET /` (200).
      - `categories.types.ts`.
      Cubre: R2, R25, R26, R27, R28, R29.
- [x] T10 — Crear `src/modules/categories/categories.test.ts`: crea raíz + sub → 201,
      `GET` devuelve raíz con `children` (R25, R26); sub-sub (padre ya es sub) → 400
      (R27); sub con `kind` ≠ padre → 400 (R28); segunda raíz `{kind,name}` idéntica
      → 409 (R29); dos subcategorías homónimas bajo padres distintos → ambas ok
      (R7). Limpia. Cubre: R2, R7, R25, R26, R27, R28, R29.

## Módulo `movements` — **SOLO LECTURA** (completa el service iniciado en T2)

- [x] T11 — Ampliar `src/modules/movements/`:
      - `movements.service.ts` (además de los helpers de T2): **solo**
        `listMovements` (orden `bookingDate DESC, daySequence DESC`, `account` +
        `category` embebidos, R13). 🔴 **NO** escribas `createMovement`,
        `deleteMovement` ni `createTransfer`: el humano retiró el alta y el borrado
        manual en la puerta (`design.md` §5) y los traspasos no se crean (§2.1).
      - `movements.routes.ts`: **solo** `GET /`. Sin `POST`, sin `DELETE /:id`, sin
        `/transfer`. Serializa `Decimal` como string, fechas `YYYY-MM-DD`, e incluye
        `transferId` y `daySequence`.
      - `movements.types.ts`. **No hace falta `movements.schema.ts`** (no hay body
        que validar).
      Cubre: R13, R18.
- [x] T12 — Ampliar `src/modules/movements/movements.test.ts` con integración
      (🔴 los movimientos se siembran **con el cliente Prisma dentro del test**: ya
      no hay endpoint de alta, `design.md` §11): `GET` ordenado desc con `account` y
      `category` embebidos, y dos del mismo día ordenados por `daySequence` (R13).
      **Traspaso**: un `expense` y un `income` en cuentas distintas con el mismo
      `transferId` y su `balanceAfter` → se recuperan enlazados y con su `type`
      intacto (R18); `GET /api/accounts` muestra el `balance` que da cada extracto,
      sin rama que mire `transferId` (R19).
      **Índice de dedup (R6, R3b)**, insertando con el cliente Prisma: dos
      `origin='imported'` con la clave completa idéntica **incluido `daySequence`**
      → el segundo falla; **tres** idénticos salvo `daySequence` 1/2/3 (el caso real
      de las tres transferencias de 1.000 € del mismo día) → **los tres** se
      guardan; dos `origin='manual'` idénticos → ambos se guardan (el índice es
      parcial). Limpia. Cubre: R3b, R6, R13, R18, R19.

## Borrado del `Expense` y re-cableado

- [x] T13 — Borrar `src/modules/expenses/` (routes, service, schema, types, test).
      Modificar `src/app.ts`: quitar el import y el `app.register(expensesRoutes,
      {prefix:'/api/expenses'})`; añadir `app.register(accountsRoutes, {prefix:
      '/api/accounts'})`, `categoriesRoutes` (`/api/categories`) y `movementsRoutes`
      (`/api/movements`). Cubre: R34.
- [x] T14 — Modificar `src/architecture.test.ts`: quitar `modules/expenses/*` del
      árbol objetivo `expected` y añadir `modules/accounts/*`, `modules/categories/*`
      y `modules/movements/*` (ojo: `movements` **no** tiene `movements.schema.ts`,
      no hay body que validar — T11). Verificar que el guardián "rutas sin `prisma`" cubre los
      módulos nuevos (no importan Prisma). Añadir (o extender) un test de integración
      que `GET /api/expenses` y `POST /api/expenses` devuelvan `404`. Cubre: R34, R37.

## Documentación (R36, R37)

- [x] T15 — Modificar `docs/api-contract.md`: (a) retirar la sección `Expense` y los
      endpoints `/api/expenses` con una **nota visible de breaking change**;
      (b) documentar modelos `Account`, `Category` (nueva), `Movement` (campos en
      inglés, `Decimal` como string, fechas `YYYY-MM-DD`, `transferId` nullable con
      la nota de que **no hay endpoint de traspasos** y hoy siempre viaja `null`,
      `daySequence` nullable, y que `balance` es **el saldo del último extracto**,
      no una suma) y
      los endpoints `/api/accounts` (POST, GET, GET/:id), `/api/categories` (POST,
      GET) y `/api/movements` (**solo GET**, con una nota de que los movimientos
      entran únicamente por importación: no hay alta ni borrado por API) con sus
      errores; (c) añadir `CONFLICT` (409) y `MISSING_ACCOUNT_DATA` (422) a la tabla
      de códigos estables, este último **reservado** (interno, lo devolverá la
      importación). Cubre: R36.
- [x] T16 — Modificar `docs/data-model.md` al **modelo final**: quitar el aviso de
      borrador, `AccountType` sin `cash`, `Movement` con `bookingDate`/`valueDate`/
      `balanceAfter`/`currency`/`description`, `Account.iban`, `MovementType` =
      `expense|income|neutral`, **fuera el enum `MovementDirection` y la columna
      `direction`**, y **reescribir el apartado de traspaso** (hoy dice "dos filas
      con `type=transfer`, una `out` y otra `in`"): ahora son **dos movimientos
      ordinarios que ya llegan del banco**, enlazados por `transferId`, que entran
      en el saldo con su signo y se excluyen de los totales globales (`design.md`
      §2.1). **Reescribir la fórmula de saldo** del doc: se lee del `balanceAfter`
      del último movimiento (orden `bookingDate DESC, daySequence DESC`) y solo se
      suma en el caso excepcional de un banco sin saldo corrido. Anotar que **no hay
      alta ni borrado manual de movimientos**. Documentar `daySequence` y la solución
      concreta de los índices (dedup parcial `WHERE origin='imported'` **con
      `daySequence` en la clave**; raíz `NULLS NOT DISTINCT`) cerrando los "puntos
      abiertos" 1 y 2. Cubre: R36.
- [x] T17 — Modificar `docs/architecture.md`: añadir **ADR-011** (borrador en
      `design.md` §12: esquema, importe 0 = `neutral`, índices por SQL crudo sin
      `importHash`, `NULLS NOT DISTINCT`, servicio de auto-alta + errores, reemplazo
      del `Expense`); actualizar el árbol de la §Estructura de carpetas (fuera
      `expenses/`, dentro `accounts/`, `categories/`, `movements/`); anotar bajo
      ADR-005 las nuevas subclases `ConflictError` y `MissingAccountDataError`. No
      hay variables de entorno ni dependencias nuevas → `docs/stack.md` solo se toca
      si algo cambiara (no debería). Cubre: R37.
- [x] T18 — Anotar el breaking change en `progress/current.md` (retirada de
      `/api/expenses` y del modelo `Expense`; nuevo modelo del flujo). Cubre: R36.

## Verificación final

- [x] T19 — `pnpm run typecheck` en verde y `pnpm run format:check` en verde. Cubre:
      R37.
- [x] T20 — `pnpm test` en verde (con Postgres levantado): todos los tests nuevos
      pasan y **no queda** ningún test de `expenses`. Cubre: R37.
- [x] T21 — `bash ./init.sh` termina con `[OK] Entorno listo` (typecheck + suite +
      validación de `feature_list.json`). Cubre: R5, R37.
- [x] T22 — Escribir el mapa de trazabilidad `R<n>` → test concreto en
      `progress/implementations/data-model.md` (Nivel 4 de `docs/verification.md`)
      para **R1-R11, R3b, R13, R18-R20 y R25-R37** (los números **R12, R14-R17 y
      R21-R24 están retirados**, ver la
      nota de `requirements.md`), anotando que **R32, R36 son requirements de
      proceso** verificados por checklist del reviewer (no por test), y que de
      **R18** solo se testea la parte persistible (el "no hay endpoint" lo verifica
      el reviewer sobre el diff). Cubre: R37.

## Fuera de esta feature (NO hacer)

- ❌ **Alta y borrado de movimientos** (`POST /api/movements`, `DELETE
  /api/movements/:id`) y sus validaciones: retirados por el humano en la puerta
  (`design.md` §5). Los movimientos entran **solo** por importación; el módulo
  `movements` de esta feature es de **solo lectura**.
- ❌ **Cualquier cosa de traspasos más allá de la columna `transferId`**: ni
  endpoint (`POST /transfer`), ni servicio `createTransfer`, ni enlazado/
  desenlazado, ni detección automática de parejas, ni `type='transfer'`, ni
  `direction`. Un traspaso son dos movimientos que ya llegan del banco
  (`design.md` §2.1, R18); el **emparejado** es una feature posterior, encima de
  la importación.
- ❌ Importación desde Drive (leer carpeta, parsear en lote, deduplicar, mover a
  `procesados/`) y surfacear el error al frontend en ese flujo → **feature
  siguiente** (importación); aquí solo el modelo, la lectura y el servicio de
  auto-alta de cuenta listos.
- ❌ Inversiones / patrimonio (idea #3) → fase posterior encima de este núcleo.
- ❌ Multi-divisa real (idea #5) → `currency` existe pero no hay conversión.
- ❌ Interfaz web / dashboards con filtros y gráficos (idea #4) → del frontend, otra
  sesión; aquí solo el `balance` propio de cada cuenta (R9) y los helpers puros de
  saldo y totales (R19, R20), sin endpoints de agregación.
</content>
