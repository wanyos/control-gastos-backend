# Resumen — feature 8 `data-model`

Fecha de cierre: 2026-08-06
Intención original: `feature_list.json` → feature `data-model`, bloque `intent`
Spec (SDD): [`specs/data-model/`](../../specs/data-model/requirements.md)
Review: [`progress/reviews/data-model.md`](../reviews/data-model.md) — **APROBADO**

## Qué hace ahora la app que antes no

Ahora la base de datos es la de tus finanzas de verdad. Antes solo había un
`Expense` de prueba del bootstrap; ahora hay **cuentas bancarias** (con su IBAN),
**movimientos** alineados con lo que trae el extracto (las dos fechas, el importe,
el saldo tras el movimiento y la divisa) y **categorías** con un nivel de
subcategoría. Puedes dar de alta y listar cuentas y categorías por la API, y
**listar** los movimientos. Los movimientos **no se crean ni se borran a mano**:
entrarán solo por importación, que es la feature siguiente.

Tres cosas que no se ven pero son el corazón de la feature:

1. **El saldo de una cuenta se lee, no se suma.** Es el `balanceAfter` de la línea
   más reciente del extracto. Solo si un banco no diera saldo corrido se cae a
   sumar desde el saldo inicial.
2. **Tres líneas idénticas el mismo día se guardan las tres.** La clave que evita
   duplicados al reimportar incluye la posición del movimiento dentro del día
   (`daySequence`), así que las tres transferencias de 850 € del mismo día no se
   toman por una sola.
3. **Un traspaso no se crea: se reconoce.** Sus dos apuntes ya llegan de los
   extractos; el modelo solo reserva la columna `transferId` que los enlazará y la
   regla de que no cuentan como gasto ni como ingreso en los totales.

## Por dónde se usa (puntos de entrada)

- `POST /api/accounts` — crea una cuenta (`iban` y `bank` obligatorios; `alias`,
  `type` e `initialBalance` opcionales). 400 si faltan datos, 409 si el IBAN ya
  existe.
- `GET /api/accounts` — lista las cuentas, cada una con su `balance` resuelto en
  la propia petición.
- `GET /api/accounts/:id` — una cuenta por id (404 si no existe).
- `POST /api/categories` — crea una categoría raíz o una subcategoría. 400 si
  intentas un segundo nivel o un `kind` distinto al del padre, 404 si el padre no
  existe, 409 si duplicas una raíz.
- `GET /api/categories` — las raíces con sus `children` embebidos.
- `GET /api/movements` — **la única ruta de movimientos**: del más reciente al más
  antiguo, con `account` y `category` embebidos.
- `findOrCreateAccountFromMetadata(prisma, { iban, bank })` — función de dominio
  interna (sin endpoint): la usará el importador para dar de alta la cuenta de un
  banco nuevo.
- `/api/expenses*` — **ya no existe**: responde 404 (breaking change documentado).

## Dónde está el código (para revisión directa)

> Los enlaces son clicables en la vista previa de Markdown de VS Code
> (o con Ctrl/Cmd + clic): saltan a la línea exacta.

### El modelo de datos y su migración

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Los 6 enums del flujo (sin `cash`, sin `transfer`, sin `direction`) | `AccountType`…`MovementStatus` | [schema.prisma:16](../../prisma/schema.prisma#L16) |
| Cuenta bancaria, IBAN único | `Account` | [schema.prisma:55](../../prisma/schema.prisma#L55) |
| Categoría jerárquica de un nivel | `Category` | [schema.prisma:67](../../prisma/schema.prisma#L67) |
| Movimiento alineado con el parser | `Movement` | [schema.prisma:82](../../prisma/schema.prisma#L82) |
| Fuera las tablas del bootstrap | `DROP TABLE` | [migration.sql:7](../../prisma/migrations/20260806191700_data_model/migration.sql#L7) |
| **Índice de dedup** con `daySequence` en la clave | `Movement_imported_dedup_key` | [migration.sql:106](../../prisma/migrations/20260806191700_data_model/migration.sql#L106) |
| Unicidad de categoría raíz (`NULLS NOT DISTINCT`) | `Category_parentId_kind_name_key` | [migration.sql:114](../../prisma/migrations/20260806191700_data_model/migration.sql#L114) |

### Cuentas

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Rutas `GET /`, `GET /:id`, `POST /` | `accountsRoutes` | [accounts.routes.ts:20](../../src/modules/accounts/accounts.routes.ts#L20) |
| Validación del body (AJV) | `createAccountSchema` | [accounts.schema.ts:1](../../src/modules/accounts/accounts.schema.ts#L1) |
| Alta con normalización de IBAN y 409 si está repetido | `createAccount` | [accounts.service.ts:126](../../src/modules/accounts/accounts.service.ts#L126) |
| Listado con el saldo ya resuelto | `listAccounts` | [accounts.service.ts:86](../../src/modules/accounts/accounts.service.ts#L86) |
| Una consulta para el saldo normal, segunda solo para el caso raro | `attachBalances` | [accounts.service.ts:59](../../src/modules/accounts/accounts.service.ts#L59) |
| Alta automática desde los metadatos del extracto | `findOrCreateAccountFromMetadata` | [accounts.service.ts:165](../../src/modules/accounts/accounts.service.ts#L165) |
| Decimales a string para el contrato | `serializeAccount` | [accounts.service.ts:200](../../src/modules/accounts/accounts.service.ts#L200) |

### Movimientos (solo lectura) y los helpers de dominio

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| **La única** ruta: `GET /` | `movementsRoutes` | [movements.routes.ts:15](../../src/modules/movements/movements.routes.ts#L15) |
| Listado ordenado con cuenta y categoría | `listMovements` | [movements.service.ts:80](../../src/modules/movements/movements.service.ts#L80) |
| **El saldo se lee del extracto** (sin mirar `transferId`) | `computeAccountBalance` | [movements.service.ts:56](../../src/modules/movements/movements.service.ts#L56) |
| Orden `bookingDate DESC, daySequence DESC` | `byMostRecent` | [movements.service.ts:40](../../src/modules/movements/movements.service.ts#L40) |
| Importe 0 → `neutral` | `deriveMovementTypeFromAmount` | [movements.service.ts:33](../../src/modules/movements/movements.service.ts#L33) |
| Totales que excluyen traspasos y `neutral` | `computeTotals` | [movements.service.ts:137](../../src/modules/movements/movements.service.ts#L137) |

### Categorías

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Rutas `GET /` y `POST /` | `categoriesRoutes` | [categories.routes.ts:18](../../src/modules/categories/categories.routes.ts#L18) |
| Un solo nivel, mismo `kind` que el padre, 409 si se duplica la raíz | `createCategory` | [categories.service.ts:31](../../src/modules/categories/categories.service.ts#L31) |
| Raíces con sus hijas | `listCategories` | [categories.service.ts:23](../../src/modules/categories/categories.service.ts#L23) |

### Errores y cableado

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| IBAN o categoría raíz duplicados → 409 | `ConflictError` | [app-error.ts:29](../../src/errors/app-error.ts#L29) |
| Metadatos insuficientes para crear la cuenta → 422 | `MissingAccountDataError` | [app-error.ts:39](../../src/errors/app-error.ts#L39) |
| Registro de los tres módulos nuevos (y fuera `expenses`) | `buildApp` | [app.ts:34](../../src/app.ts#L34) |

### Tests

| Qué cubre | Código |
| --- | --- |
| El saldo sale del extracto aunque el saldo inicial sea absurdo y la suma no cuadre | [movements.test.ts:46](../../src/modules/movements/movements.test.ts#L46) |
| Empate del mismo día: gana el `daySequence` mayor | [movements.test.ts:78](../../src/modules/movements/movements.test.ts#L78) |
| Sin `balanceAfter` en ningún movimiento: suma desde `initialBalance` | [movements.test.ts:120](../../src/modules/movements/movements.test.ts#L120) |
| Importe 0 → `neutral` (y las otras dos vías) | [movements.test.ts:31](../../src/modules/movements/movements.test.ts#L31) |
| Los totales ignoran las dos piernas de un traspaso y el `neutral` | [movements.test.ts:164](../../src/modules/movements/movements.test.ts#L164) |
| `GET /api/movements`: orden, `account` y `category` embebidos | [movements.test.ts:260](../../src/modules/movements/movements.test.ts#L260) |
| Las dos piernas del traspaso se recuperan enlazadas y con su `type` intacto | [movements.test.ts:324](../../src/modules/movements/movements.test.ts#L324) |
| Cada cuenta refleja el saldo de su propio extracto | [movements.test.ts:361](../../src/modules/movements/movements.test.ts#L361) |
| Reimportar la misma línea → rechazada (`P2002`) | [movements.test.ts:392](../../src/modules/movements/movements.test.ts#L392) |
| **Tres líneas idénticas del mismo día → se guardan las tres** | [movements.test.ts:408](../../src/modules/movements/movements.test.ts#L408) |
| Los `manual` no tienen unicidad (el índice es parcial) | [movements.test.ts:533](../../src/modules/movements/movements.test.ts#L533) |
| El `Movement` guarda todos sus campos y **no** tiene `direction` | [movements.test.ts:426](../../src/modules/movements/movements.test.ts#L426) |
| `MovementType` sin `transfer` y sin enum `MovementDirection` | [movements.test.ts:551](../../src/modules/movements/movements.test.ts#L551) |
| Alta de cuenta 201 con decimales como string | [accounts.test.ts:85](../../src/modules/accounts/accounts.test.ts#L85) |
| `AccountType` sin `cash` | [accounts.test.ts:80](../../src/modules/accounts/accounts.test.ts#L80) |
| IBAN duplicado → 409 | [accounts.test.ts:223](../../src/modules/accounts/accounts.test.ts#L223) |
| Sin `iban` / sin `bank` / `iban` vacío → 400 | [accounts.test.ts:237](../../src/modules/accounts/accounts.test.ts#L237) |
| Alta automática: cuenta existente y cuenta nueva con defaults | [accounts.test.ts:258](../../src/modules/accounts/accounts.test.ts#L258) |
| Faltan datos → `MissingAccountDataError` 422 y no se crea nada | [accounts.test.ts:291](../../src/modules/accounts/accounts.test.ts#L291) |
| Raíz + subcategoría, y la jerarquía por relación | [categories.test.ts:54](../../src/modules/categories/categories.test.ts#L54) |
| Segundo nivel → 400; `kind` distinto al del padre → 400 | [categories.test.ts:112](../../src/modules/categories/categories.test.ts#L112) |
| Raíz duplicada → 409 (el `NULLS NOT DISTINCT` funcionando) | [categories.test.ts:158](../../src/modules/categories/categories.test.ts#L158) |
| El módulo `movements` es de solo lectura (guardián del árbol) | [architecture.test.ts:104](../../src/architecture.test.ts#L104) |
| `/api/expenses` responde 404 y las tablas viejas no existen | [architecture.test.ts:190](../../src/architecture.test.ts#L190) |

## Cumplimiento de la intención

Por cada punto del `como_se_que_esta_bien` del `intent`:

- ✅ **"Creo una cuenta bancaria con IBAN y saldo inicial y queda guardada, y la
  puedo listar."** → `POST /api/accounts` + `GET /api/accounts`; verificado en
  [accounts.test.ts:85](../../src/modules/accounts/accounts.test.ts#L85) y
  [accounts.test.ts:127](../../src/modules/accounts/accounts.test.ts#L127).
- ✅ **"Listo los movimientos… del más reciente al más antiguo, con su cuenta y su
  categoría; no hay forma de crear ni de borrar un movimiento por la API."** →
  [movements.test.ts:260](../../src/modules/movements/movements.test.ts#L260) y
  [movements.test.ts:300](../../src/modules/movements/movements.test.ts#L300); la
  ausencia de alta y borrado la guarda
  [architecture.test.ts:104](../../src/architecture.test.ts#L104) y la confirmó el
  reviewer sobre el diff.
- ✅ **"Dos movimientos que comparten `transferId`… se recuperan enlazados
  conservando su `type`; el saldo de cada cuenta los refleja y en el total global
  no cuentan. No hay ningún endpoint para crear traspasos."** →
  [movements.test.ts:324](../../src/modules/movements/movements.test.ts#L324)
  (enlace y `type` intactos),
  [movements.test.ts:361](../../src/modules/movements/movements.test.ts#L361)
  (saldo de cada cuenta) y
  [movements.test.ts:164](../../src/modules/movements/movements.test.ts#L164)
  (totales). No existe ruta ni servicio de traspasos.
- ✅ **"Creo una categoría con subcategoría y tipo y se respeta la jerarquía y el
  tipo."** →
  [categories.test.ts:54](../../src/modules/categories/categories.test.ts#L54),
  [categories.test.ts:95](../../src/modules/categories/categories.test.ts#L95) y
  [categories.test.ts:112](../../src/modules/categories/categories.test.ts#L112).
- ✅ **"Al importar un extracto de un banco que aún no existe y con IBAN + banco
  presentes, la cuenta se crea sola y se me notifica con los datos usados."** → la
  **función** está lista y devuelve `created` y `appliedDefaults` para que puedas
  ver qué se rellenó por defecto:
  [accounts.service.ts:165](../../src/modules/accounts/accounts.service.ts#L165),
  verificada en
  [accounts.test.ts:273](../../src/modules/accounts/accounts.test.ts#L273). El
  **disparo desde Drive** es la feature siguiente, tal como pedía el `intent`.
- ✅ **"Si al extracto le falta el dato necesario, no se crea a ciegas: se me
  devuelve un error para crearla a mano."** → `MissingAccountDataError` (422) con
  el dato que falta en el mensaje; verificado en
  [accounts.test.ts:291](../../src/modules/accounts/accounts.test.ts#L291) y
  [accounts.test.ts:305](../../src/modules/accounts/accounts.test.ts#L305), que
  comprueba además que **no** se crea ninguna cuenta.
- ✅ **"Los campos salen en inglés con los nombres del modelo validado (las dos
  fechas, saldo y divisa)."** → `bookingDate`, `valueDate`, `balanceAfter` y
  `currency` en la respuesta; verificado en
  [movements.test.ts:260](../../src/modules/movements/movements.test.ts#L260) y
  documentado en `docs/api-contract.md` (modelo `Movement`).
- ✅ **"Aplico la migración sobre una base limpia y las tablas se crean sin error;
  el `Expense` del bootstrap deja de ser el modelo."** → migración aplicada sobre
  una BD limpia (evidencia en el informe del implementer) y guardado por
  [architecture.test.ts:226](../../src/architecture.test.ts#L226) (ya no hay tabla
  `Expense`) y [architecture.test.ts:202](../../src/architecture.test.ts#L202)
  (`/api/expenses` → 404).
- ✅ **"Un extracto con tres líneas idénticas el mismo día se guarda como tres
  movimientos, no como uno; y reimportar ese mismo extracto no crea
  duplicados."** → las dos caras del mismo índice:
  [movements.test.ts:408](../../src/modules/movements/movements.test.ts#L408) (las
  tres se guardan) y
  [movements.test.ts:392](../../src/modules/movements/movements.test.ts#L392) (la
  repetición exacta se rechaza).
- ⚠️ **"Si intento algo incoherente… el backend lo rechaza con un error claro."**
  → se cumple **en toda la superficie de escritura que quedó viva** tras tus
  correcciones: cuenta sin IBAN o sin banco (400), IBAN duplicado (409), categoría
  de más de un nivel (400), categoría con `kind` distinto al del padre (400),
  padre inexistente (404) y raíz duplicada (409). Los otros dos ejemplos que
  citabas **decaen porque quitaste el endpoint que los provocaba**: "importe cero
  o negativo" y "categoría de tipo distinto al del movimiento" solo podían darse
  en el alta manual de movimientos, que ya no existe; la segunda volverá con la
  feature de categorización, que sí asigna categorías a movimientos.

## Decisiones que se tomaron por ti

Lo que en el spec estaba marcado como `(delegado)` o `(añadido)`, recordado aquí:

- **(delegado) El esquema completo en Prisma/Postgres.** Enums en inglés, importes
  `Decimal(10,2)`, fechas contable y valor como **date-only** (`YYYY-MM-DD`, igual
  que las emite el parser). Vive en
  [schema.prisma:16](../../prisma/schema.prisma#L16).
- **(delegado) Los dos índices van en SQL crudo dentro de la migración**, no en el
  schema: Prisma 7 no sabe expresar un índice único **parcial** ni
  `NULLS NOT DISTINCT`. Si algún día alguien los declara en el schema, se rompe la
  protección. Están en
  [migration.sql:106](../../prisma/migrations/20260806191700_data_model/migration.sql#L106)
  y [migration.sql:114](../../prisma/migrations/20260806191700_data_model/migration.sql#L114).
- **(añadido) La clave exacta del dedup** es
  `(accountId, bookingDate, type, amount, description, daySequence)`. Incluir
  `type` obliga a que **el `type` sea inmutable**: si alguna vez se mutara al
  marcar un traspaso, la reimportación dejaría de colisionar y entrarían
  duplicados. Por eso el marcador de traspaso es `transferId` y no un tipo nuevo.
  Se descartó la columna `importHash` del borrador de `data-model.md`.
- **(añadido) `daySequence` es la posición dentro del día**, no el número de línea
  del fichero: el número de línea cambia según el rango que descargues y no
  serviría para reconocer lo ya importado.
- **(añadido) IBAN obligatorio y único**, y `AccountType` = `checking | savings`
  (sin `cash`, sin `credit`; añadir `credit` más adelante no exige migrar datos).
- **(añadido) 409 `CONFLICT`** para IBAN y categoría raíz duplicados, y **422
  `MISSING_ACCOUNT_DATA`** para "faltan datos del extracto" (distinguible del 400
  de formato y del 404, para que el frontend pueda ofrecer el alta manual justo en
  ese caso). El 422 queda **reservado**: hoy ningún endpoint lo devuelve.
- **(delegado) Importe 0 → tipo `neutral`**, con el helper
  `deriveMovementTypeFromAmount`. El coste es que todo agregado futuro debe
  contemplar ese tercer valor; a cambio, un movimiento de 0 € deja de contarse
  como ingreso falso.
- **(delegado) Defaults del alta automática de cuenta:** `alias` = `banco ···1234`
  (últimos 4 del IBAN), `type` = `checking`, `initialBalance` = 0, y se te informa
  de cuáles se aplicaron vía `appliedDefaults`.
- **(delegado) Reemplazo del `Expense`:** DROP + CREATE en la migración (las
  tablas viejas eran placeholder sin datos), módulo borrado y breaking change
  anotado en `docs/api-contract.md`.
- **(añadido, decidido al implementar) Un `parentId` inexistente devuelve 404**,
  no 400. El spec se contradecía en ese punto; se siguió su sección de errores.
  Si prefieres 400, es un cambio de una línea.

## Qué NO se tocó / quedó fuera

- **La importación real desde Drive** (leer la carpeta, parsear en lote, guardar,
  deduplicar y mover a `procesados/`): es la feature siguiente. Aquí solo queda el
  modelo, la lectura y el servicio de alta de cuenta listos para que los use.
- **Quién rellena `transferId`**: una feature posterior a la importación, de
  detección automática. Mientras tanto la columna existe, está indexada y viaja
  siempre `null`; **consecuencia asumida:** hasta entonces un traspaso interno
  cuenta como gasto en una cuenta e ingreso en otra en los totales globales (no
  molesta a nadie porque todavía no hay dashboards).
- **Quién rellena `categoryId` y `paymentMethod`**: la feature de categorización
  por reglas sobre el `description`. Esta feature entrega solo el **catálogo** de
  categorías.
- **El parser** (`src/modules/bankinter/*`) no se ha tocado: sigue congelado.
- **Sin dependencias nuevas y sin variables de entorno nuevas.**
- **Sin paginación ni filtros en `GET /api/movements`**: devuelve la tabla entera.
- **Sin interfaz web**: es del frontend, en otra sesión, contra el contrato nuevo.

## Notas para el futuro

- ⚠️ **Breaking change:** `/api/expenses*` responde 404 y el modelo `Category` del
  bootstrap se ha reemplazado. Aún **no consumido por el frontend**; su feature se
  planificará contra el contrato nuevo.
- **Límite conocido del dedup:** si un día del extracto queda **partido** entre
  dos descargas, el fragmento reempieza en `daySequence = 1` y ese movimiento se
  guardaría duplicado. Se evita descargando por días completos; sería un duplicado
  **visible**, no una pérdida silenciosa.
- **Carrera en el alta automática de cuenta:** dos importaciones simultáneas de la
  misma cuenta nueva harían que la segunda recibiera un conflicto en vez de la
  cuenta. Hoy no ocurre (nadie la llama); la feature de importación debería
  reintentar buscando tras el conflicto.
- **`initialBalance` no admite negativos** (mínimo 0). Si alguna cuenta arranca en
  descubierto, habrá que relajarlo.
- **Detalle menor de orden:** el listado de cuentas ordena `daySequence`
  descendente sin fijar dónde van los nulos, mientras que el listado de
  movimientos sí lo fija. Solo se notaría si una línea trajera saldo pero no
  posición, algo que el importador no producirá. Arreglo de dos líneas.
- **Pendiente de saneo (ajeno a esta feature):** `docs/verification.md` conserva
  un bloque de ejemplos `curl` contra `/api/expenses`, que ya no existe.
