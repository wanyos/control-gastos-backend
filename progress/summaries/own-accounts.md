# Resumen — feature 62 `own-accounts`

Fecha de cierre: 2026-10-20
Intención original: `feature_list.json` → feature `own-accounts`, bloque `intent`
Spec (SDD): `specs/62-own-accounts/` (hoja aprobada el 2026-10-20)

## Qué hace ahora la app que antes no

Hay una tabla con tus cuentas y productos de cualquier banco (los importes o no), cada
uno con los textos con los que aparece en los conceptos, y una lista con las formas en
que aparece tu nombre. Un movimiento cuyo concepto contiene una de esas formas o uno de
esos textos deja de contar en las tres sumas (los `totals` de `GET /api/movements`, el
resumen del mes de `GET /api/overview` y el coste mensual de
`GET /api/recurring-expenses`), sin marcarlo y sin pareja. Si lo único que lo nombra es
el nombre de uno de tus bancos, queda **dudoso**: sigue contando hasta que lo resuelvas
tú, uno a uno. Antes, todo eso solo dejaba de contar si te acordabas de marcarlo a mano.

**Hasta que rellenes la tabla y las formas de tu nombre no cambia ninguna suma.**

## Lo que tienes que hacer tú (en este orden)

1. **Copia de seguridad de tu base `gastos`** antes de nada.
2. Aplicar la migración: `pnpm exec prisma migrate deploy`. Crea tres tablas **vacías**
   (`OwnAccount`, `OwnAccountText`, `AccountHolderName`), dos tipos y la columna
   `Movement.ownershipDecision` a `NULL` en todos tus movimientos; no cambia nada más.
   Hoy en tu base está sin aplicar (`prisma migrate status`: «Following migration have
   not yet been applied: 20261020120000_own_accounts»).
3. **Reiniciar el servidor de desarrollo** (`pnpm run dev`), para que cargue el cliente
   de datos con las tablas nuevas.
4. **Rellenar la tabla con el leader**: él saca de tu base lo que ya se sabe de cada
   cuenta y producto, te lo enseña, completas lo que falte (cuentas no importadas,
   fechas, textos, formas de tu nombre) y, con tu visto bueno, lo inserta por
   `/api/own-accounts`.

Y para más adelante: la sesión del frontend tiene que hacer la pantalla de la tabla y la
de dudosos para resolverlos.

## Por dónde se toca (puntos de entrada)

| Cómo se usa | Código |
| --- | --- |
| `POST /api/own-accounts` — da de alta una cuenta o producto con sus textos | [own-accounts.routes.ts:48](../../src/modules/own-accounts/own-accounts.routes.ts#L48) |
| `PATCH /api/own-accounts/:id` — cambia los campos que viajan; `texts` sustituye la lista | [own-accounts.routes.ts:63](../../src/modules/own-accounts/own-accounts.routes.ts#L63) |
| `PUT /api/own-accounts/holder-names` — sustituye las formas de tu nombre | [own-accounts.routes.ts:80](../../src/modules/own-accounts/own-accounts.routes.ts#L80) |
| `GET /api/movements` — campo `ownership` en cada movimiento y filtro `ownership=doubtful` | [movements.service.ts:281](../../src/modules/movements/movements.service.ts#L281) |
| `PATCH /api/movements/:id` — `ownershipDecision` (`mine` / `not_mine` / `null`) | [movements.service.ts:403](../../src/modules/movements/movements.service.ts#L403) |
| El reconocimiento, función pura | [own-accounts.recognition.ts:136](../../src/modules/own-accounts/own-accounts.recognition.ts#L136) |

## Dónde está el código

### Base de datos

| Qué hace | Dónde |
| --- | --- |
| Tipos `OwnAccountType`, `OwnershipDecision`; modelos `OwnAccount`, `OwnAccountText`, `AccountHolderName`; columna `Movement.ownershipDecision` | [schema.prisma](../../prisma/schema.prisma) |
| Migración que crea todo lo anterior, sin insertar nada | [migration.sql](../../prisma/migrations/20261020120000_own_accounts/migration.sql) |
| Las cuatro columnas de texto nuevas en las que `src/no-real-data.test.ts` busca datos tuyos; `OwnAccount.bank` en las no comparadas | [test-real-data.ts](../../src/lib/test-real-data.ts) → `comparedColumns`, `notComparedColumns` |

### Tabla de cuentas propias y formas de tu nombre

| Qué hace | Dónde |
| --- | --- |
| Las cinco rutas | [own-accounts.routes.ts](../../src/modules/own-accounts/own-accounts.routes.ts) → `ownAccountsRoutes` |
| Esquemas de las rutas y propiedades admitidas | [own-accounts.schema.ts](../../src/modules/own-accounts/own-accounts.schema.ts) → `createOwnAccountSchema`, `updateOwnAccountSchema`, `replaceHolderNamesSchema` |
| Tipos de cuerpo y respuesta | [own-accounts.types.ts](../../src/modules/own-accounts/own-accounts.types.ts) → `OwnAccountDto`, `CreateOwnAccountBody`, `UpdateOwnAccountBody`, `HolderNames` |
| Alta, cambio, consulta, validación (mínimo 3 caracteres, `closedAt` no anterior a `openedAt`, repetidos una vez) | [own-accounts.service.ts](../../src/modules/own-accounts/own-accounts.service.ts) → `createOwnAccount`, `updateOwnAccount`, `listOwnAccounts`, `listHolderNames`, `replaceHolderNames`, `serializeOwnAccount` |
| Registro con prefijo `/api/own-accounts` | [app.ts](../../src/app.ts) → `buildApp` |

### Reconocimiento (se calcula en cada lectura, no escribe nada)

| Qué hace | Dónde |
| --- | --- |
| Normaliza (minúsculas, sin tildes ni signos) | [own-accounts.recognition.ts](../../src/modules/own-accounts/own-accounts.recognition.ts) → `normalizeOwnText` |
| Decide `own` / `doubtful` / `mine` / `not_mine` por palabras enteras | [own-accounts.recognition.ts](../../src/modules/own-accounts/own-accounts.recognition.ts) → `resolveOwnership` |
| Lee tabla, formas y movimientos y llama a lo anterior | [own-accounts.service.ts](../../src/modules/own-accounts/own-accounts.service.ts) → `readOwnership` |

### Las tres sumas y el listado

| Qué hace | Dónde |
| --- | --- |
| Lo `own` o `mine` no suma (después de la regla de depósitos) | [movements.service.ts](../../src/modules/movements/movements.service.ts) → `computeTotals`, `isCountedExpense` |
| Listado: `ownership` en cada movimiento y filtro de dudosos | [movements.service.ts](../../src/modules/movements/movements.service.ts) → `listMovements`, `movementListWhere`, `serializeOwnership` |
| Guarda tu decisión | [movements.service.ts](../../src/modules/movements/movements.service.ts) → `updateMovement`, `serializeMovement` |
| Esquemas: parámetro `ownership`, campo `ownershipDecision` | [movements.schema.ts](../../src/modules/movements/movements.schema.ts) → `listMovementsSchema`, `updateMovementSchema` |
| Tipos | [movements.types.ts](../../src/modules/movements/movements.types.ts) → `SerializedOwnership`, `ListedMovement`, `MovementListQuery`, `UpdateMovementBody` |
| Comentarios de las rutas | [movements.routes.ts](../../src/modules/movements/movements.routes.ts) → `movementsRoutes` |
| Resumen del mes | [overview.service.ts](../../src/modules/overview/overview.service.ts) → `getOverview` |
| Coste mensual | [recurring-expenses.service.ts](../../src/modules/recurring-expenses/recurring-expenses.service.ts) → `getRecurringExpenses` |

### Documentos

| Qué hace | Dónde |
| --- | --- |
| Contrato: modelo `OwnAccount`, cinco rutas, §Movimientos entre tus cuentas en las sumas, `ownership`, `ownershipDecision` | [api-contract.md](../../docs/api-contract.md) |
| ADR-040 | [architecture.md](../../docs/architecture.md) |
| Tablas nuevas, columna reservada, diagrama y claves | [data-model.md](../../docs/data-model.md) → §Las cuentas propias del humano (F62) |
| Columnas comparadas por `src/no-real-data.test.ts` | [conventions.md](../../docs/conventions.md) |
| Filas de las rutas | [README.md](../../README.md) |
| Nombres aprobados | [vocabulary.md](../../docs/vocabulary.md) |

### Tests

| Qué cubre | Dónde |
| --- | --- |
| Alta, cambio, rechazos sin escribir, formas del nombre | [own-accounts.routes.test.ts](../../src/modules/own-accounts/own-accounts.routes.test.ts) → `creates an own account…`, `updates only the fields sent…`, `rejects an invalid own account without writing`, `replaces and returns the holder name forms` |
| Reglas puras: forma entera (un familiar con tus mismos apellidos no casa), banco solo → dudoso, traspasos y marcados nunca dudosos, tu decisión manda | [own-accounts.recognition.test.ts](../../src/modules/own-accounts/own-accounts.recognition.test.ts) → `recognizes the holder name and a non-bank text as own, whole words only`, `does not recognize a movement by the bank field alone`, `leaves as doubtful a movement named only by a bank name`, `never makes doubtful a transfer leg or a marked movement`, `the human decision wins over the recognition` |
| Las tres sumas, dudosos, decisión, depósitos, importados después, nada se escribe | [own-accounts.totals.test.ts](../../src/modules/own-accounts/own-accounts.totals.test.ts) → los siete tests de `own accounts in the three sums (F62)` |
| El contrato | [own-accounts.docs.test.ts](../../src/modules/own-accounts/own-accounts.docs.test.ts) |
| Forma serializada del movimiento y `computeTotals` con el mapa vacío | [movements.test.ts](../../src/modules/movements/movements.test.ts) |

## Cumplimiento de la intención

Resultado real de `./init.sh --checks 62` (2026-10-20): **18 de 18 en verde**.

- ✅ «Puedo dar de alta, cambiar y consultar mis cuentas y productos con sus datos y los
  textos» → los cuatro tests de `own-accounts.routes.test.ts`. Checks 1–4: ✅
- ✅ «Un movimiento cuyo concepto nombra una cuenta o un producto míos, o a mí, no
  cuenta» → `recognizes the holder name…` y `a movement naming an own account or the
  holder counts in none of the three sums`. Checks 5–6: ✅
- ✅ «Una transferencia a otra persona cuenta… aunque vaya a un banco donde yo también
  tengo cuenta» → `does not recognize a movement by the bank field alone` y `a transfer
  to another person counts even when its bank is in the own accounts table`. Checks
  7–8: ✅
- ✅ «Una transferencia que no está claro… queda como dudosa, la veo y la resuelvo a
  mano, y mi decisión se respeta» → `leaves as doubtful…`, `the human decision wins…`,
  `a doubtful movement keeps counting…`, `a decision on a doubtful movement is kept…`.
  Checks 9–12: ✅
- ✅ «Vale para los movimientos que ya están en la base y para los que entren en cada
  importación» → `recognizes movements already stored and movements imported
  afterwards`. Check 13: ✅
- ✅ «Los traspasos que ya se emparejan solos siguen igual» → `never makes doubtful a
  transfer leg or a marked movement` y `recognition writes nothing: amounts, balances,
  marks and transfer pairs stay the same`. Checks 14–15: ✅
- ✅ «docs/api-contract.md describe la tabla…» → `api-contract: describes the own
  accounts table…`. Check 16: ✅
- ✅ (añadido) Un movimiento de depósito sigue sumando lo que dice su regla → `a deposit
  movement still counts by the deposit rule`. Check 17: ✅
- ✅ (añadido) Lo que ya funciona sigue igual → `pnpm test`: 91 archivos, 1499 tests en
  verde. Check 18: ✅

## Decisiones que se tomaron por ti

Todas las 🔴 las confirmaste tú el 2026-10-20; recordadas aquí:

- (delegado) Dudoso solo cuando lo único que lo nombra es el nombre de uno de tus bancos
  (de cualquier fila de la tabla); con tu nombre u otro texto tuyo, es tuyo sin
  preguntar. Mientras está dudoso, cuenta.
- (delegado) Tu nombre: escribes tú las formas, y solo casa la forma entera; un familiar
  con tus mismos apellidos cuenta como otra persona y no queda dudoso.
- (delegado) Los 55 marcados a mano y las parejas de traspaso se quedan como están y
  nunca quedan dudosos; tu decisión manda sobre la tabla y se deshace con `null`.
- (delegado) La tabla no se enlaza con tus cuentas importadas ni con tus productos.
- (delegado) Tipos de la tabla: corriente, remunerada, inversión, depósito, cripto, otro.
- (añadido) Un texto o una forma de menos de 3 letras se rechaza; los repetidos se
  guardan una vez.
- (añadido) No hay borrado de filas: una cuenta que no quieras se deja sin textos.

## Qué NO se tocó / quedó fuera

- Ningún importe, saldo, `transferId`, `excludedFromTotals` ni pareja de traspaso.
- Resolver dudosos es de uno en uno: `PATCH /api/movements` (varios a la vez) no admite
  `ownershipDecision`.
- Si el banco recorta tu nombre de una forma que no has escrito, ese movimiento cuenta
  como de otra persona sin avisar.
- Las pantallas son del frontend.

## Notas para el futuro

- El implementer sugirió añadir `own-accounts.routes.ts` a la lista de archivos de
  `src/architecture.test.ts` (la regla ya la cumple) y que la frase de
  `docs/data-model.md` que dice que las exclusiones de los totales son «tres» lo diga
  mejor. No aplicadas.
