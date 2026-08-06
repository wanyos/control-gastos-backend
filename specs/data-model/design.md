# Design — Feature 8: data-model

> CÓMO se construye lo descrito en `requirements.md`. No reinventa decisiones:
> aplica los Principios 1-5 (HTTP → servicio → datos; solo servicios hablan con
> Prisma; errores de dominio tipados; config validada; composición por plugins),
> ADR-004 (organización por módulos / vertical slice), ADR-005 (jerarquía
> `AppError` + handler central) y ADR-006 (config) de `docs/architecture.md`, y el
> patrón vivo del módulo `expenses` (que esta feature **reemplaza**).
>
> Toma como base el modelo validado por el humano en `docs/data-model.md` y le
> aplica las **correcciones del `intent`** (mandan sobre el doc): **sin cuenta de
> efectivo**, **alineado con el parser** (feature 6/7), `description` en vez de
> `concept`, `valueDate`/`balanceAfter`/`currency`/`iban` añadidos, tipo `neutral`
> para el importe 0, y `importHash` **descartado** a favor de un índice compuesto.
>
> Las cinco decisiones delegadas se marcan **⭐ DECISIÓN PROPIA (aprobar en la
> puerta)**.
>
> 🔁 **Corrección humana en la puerta (traspasos), aplicada a todo este design.**
> Un traspaso entre cuentas propias **no se crea desde la app**: sus dos apuntes ya
> llegan de los extractos (un `expense` en origen y un `income` en destino), así
> que fabricarlos por API los duplicaría. Fuera `POST /api/movements/transfer`,
> fuera `MovementType.transfer` y fuera el enum `MovementDirection`; queda
> `Movement.transferId` como enlace lógico que **rellena una feature posterior**.
> Detalle y razón técnica en **§2.1**.
>
> 🔁 **Segunda corrección humana: fuera el alta y el borrado manual de
> movimientos.** "Si lo hago en el banco queda reflejado… no creo que sea necesario
> tener movimientos a mano… además si hacemos esto debemos controlar el saldo, y eso
> no quiero que se haga a mano." Los movimientos **solo entran por importación**: de
> `/api/movements` queda **únicamente el `GET`** (§5), el saldo sale **siempre** del
> extracto (§6) y `Movement` pasa a nacer `origin=imported` / `status=pending_review`
> (§2). Requirements R12, R14-R17 retirados.

## 1. Estado actual → estado final

Hoy `prisma/schema.prisma` tiene solo el `Expense` + `Category` placeholder del
bootstrap, y `src/modules/expenses/` los sirve en `/api/expenses`. Esta feature:

- **Reemplaza** el esquema por `Account`, `Category` (nueva forma) y `Movement` +
  enums, con dos índices personalizados (dedup importados; unicidad de raíz).
- **Borra** el módulo `expenses` y su registro, y **elimina** las tablas viejas en
  la migración (breaking change).
- Crea tres módulos nuevos (`accounts`, `categories`, `movements`) siguiendo
  ADR-004, con la capa HTTP → servicio → datos intacta.
- Añade dos errores de dominio (`ConflictError`, `MissingAccountDataError`) bajo
  ADR-005, y un helper de dominio `deriveMovementTypeFromAmount`.

**Archivos que se tocan** (el `implementer` los materializa; aquí solo se planifican):

```
prisma/
  schema.prisma                 # REEMPLAZAR: Account, Category(nueva), Movement + enums; fuera Expense
  migrations/<ts>_data_model/   # CREAR: drop viejo + create nuevo + 2 índices SQL crudo (R5,R6,R7,R34,R35)
src/
  errors/app-error.ts           # MODIFICAR: + ConflictError (CONFLICT,409) + MissingAccountDataError (MISSING_ACCOUNT_DATA,422)
  errors/app-error.test.ts      # MODIFICAR: tests de las dos clases nuevas
  app.ts                        # MODIFICAR: quitar expensesRoutes; registrar accounts/categories/movements
  modules/expenses/**           # BORRAR (routes, service, schema, types, test) (R34)
  modules/accounts/             # CREAR: routes, service, schema, types, test (R8-R11, R30-R32)
  modules/categories/           # CREAR: routes, service, schema, types, test (R2,R25-R29)
  modules/movements/            # CREAR (solo lectura): routes GET, service, types, test (R13,R18-R20,R33)
  architecture.test.ts          # MODIFICAR: árbol objetivo (fuera expenses; dentro accounts/categories/movements)
docs/{api-contract,data-model,architecture,stack}.md   # MODIFICAR (R36, R37)
progress/current.md             # MODIFICAR: nota de breaking change (R36)
```

**No se toca** el parser (`src/modules/bankinter/*`, features 6/7): esta feature
**no** implementa la importación; solo deja el modelo y los helpers listos para
que la importación los use (R32).

## 2. ⭐ DECISIÓN PROPIA #1 — Esquema Prisma completo (aprobar en la puerta)

En inglés, alineado con el parser, con las correcciones del `intent` sobre
`data-model.md`. Reglas de negocio (importe positivo, coherencia de categoría)
**las vigila el servicio**, no la BD (como en `data-model.md`).

```prisma
// ── Enums ─────────────────────────────────────────────────
enum AccountType { checking  savings }                       // ⭐ sin `cash` (intent); sin `credit` (futuro)
enum CategoryKind { expense  income }
enum MovementType { expense  income  neutral }               // ⭐ `neutral` = importe 0 (§6); sin `transfer` (§2.1)
enum PaymentMethod { card  cash  bank_transfer  direct_debit }
enum MovementOrigin { imported  manual }
enum MovementStatus { confirmed  pending_review }

// ── Modelos ───────────────────────────────────────────────
model Account {
  id             Int         @id @default(autoincrement())
  iban           String      @unique                         // ⭐ obligatorio + único (clave del find-or-create, §7)
  bank           String
  alias          String
  type           AccountType @default(checking)
  initialBalance Decimal     @default(0) @db.Decimal(10, 2)
  movements      Movement[]
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt
}

model Category {
  id        Int          @id @default(autoincrement())
  name      String
  kind      CategoryKind
  parent    Category?    @relation("Subcategories", fields: [parentId], references: [id])
  parentId  Int?
  children  Category[]   @relation("Subcategories")
  movements Movement[]
  createdAt DateTime     @default(now())

  @@unique([parentId, kind, name])   // se re-crea NULLS NOT DISTINCT en la migración (§4, R7)
}

model Movement {
  id            Int                @id @default(autoincrement())
  type          MovementType
  bookingDate   DateTime           @db.Date           // ⭐ date-only (parser YYYY-MM-DD); fecha contable
  valueDate     DateTime           @db.Date           // fecha valor
  amount        Decimal            @db.Decimal(10, 2)  // SIEMPRE positivo; el signo lo da `type`
  description   String
  balanceAfter  Decimal?           @db.Decimal(10, 2)  // saldo tras el movimiento (parser `balance`); null en manual.
                                                       // El más reciente ES el saldo de la cuenta (§6)
  currency      String             @default("EUR")
  note          String?

  account       Account            @relation(fields: [accountId], references: [id])
  accountId     Int
  category      Category?          @relation(fields: [categoryId], references: [id])
  categoryId    Int?
  paymentMethod PaymentMethod?

  origin        MovementOrigin     @default(imported)        // ⭐ todo viene del banco (§5)
  status        MovementStatus     @default(pending_review)  // ⭐ y nace pendiente de revisar

  transferId    String?            // enlace lógico: las dos piernas de un traspaso lo comparten (§2.1).
                                   // NADIE lo escribe en esta feature: lo rellenará el emparejado (feature posterior)
  daySequence   Int?               // ⭐ posición dentro de su bookingDate (1 = primero del día); null en manual.
                                   // Fija el orden intradía (§6) y evita deduplicar líneas idénticas legítimas (§3)

  createdAt     DateTime           @default(now())
  updatedAt     DateTime           @updatedAt

  @@index([accountId, bookingDate, daySequence])
  @@index([transferId])
  // Índice ÚNICO PARCIAL de dedup importados: SQL crudo en la migración (§3, R6)
}
```

**Diferencias respecto a `data-model.md` (para que el humano las apruebe):**

| `data-model.md` (borrador) | Este spec (final) | Por qué |
| --- | --- | --- |
| `AccountType` con `cash` | **sin `cash`** | El `intent`: no hay cuenta de efectivo. |
| `Account.bank String?` | `bank String` (oblig.) | Sin efectivo, toda cuenta es bancaria. |
| — | `Account.iban @unique` (oblig.) | Clave natural del find-or-create (§7). |
| `Movement.date` (una fecha) | `bookingDate` + `valueDate` (`@db.Date`) | Alineación con el parser (dos fechas). |
| `Movement.concept` | `description` | Inglés + nombre del parser. |
| — | `balanceAfter`, `currency` | Campos del parser. |
| `MovementType {expense,income,transfer}` | `{expense,income,neutral}` | `neutral` por el importe 0 (§6); **fuera `transfer`** (§2.1). |
| `MovementDirection {out,in}` + `Movement.direction` | **enum y columna eliminados** | El `type` que reportó el banco ya dice si resta o suma (§2.1). |
| `importHash` + índice sobre el hash | **columna descartada**; índice compuesto parcial | Evita la sub-decisión "receta del hash / normalización del concepto" (§3). |

### 2.1 🔁 Traspasos: `transferId` y nada más (corrección humana, R18-R20)

**Premisa corregida:** un traspaso entre dos cuentas propias **ya está en los
extractos**. El banco de origen lo reporta como un cargo (`expense`) y el de
destino como un abono (`income`). La app **no lo crea**: lo **reconoce**.

Consecuencias de modelado:

| Antes (premisa errónea) | Ahora | Por qué |
| --- | --- | --- |
| `POST /api/movements/transfer` crea dos apuntes | **no hay endpoint** | Los dos apuntes ya existen; crearlos los duplicaría (4 filas por traspaso). |
| `type = transfer` en ambas piernas | `type` = el del banco (`expense`/`income`) | Ver el punto del dedup, abajo. |
| `direction out\|in` | **eliminado** | Redundante: la pierna de origen *es* un `expense` y la de destino *es* un `income`. Dos fuentes de verdad para el signo = una que se desincroniza. |
| `transferId` compartido | **igual**, único marcador | Es el enlace lógico entre las dos piernas. |

🔴 **La razón técnica de no mutar `type`:** el índice único parcial del dedup (§3)
tiene la clave `(accountId, bookingDate, type, amount, description) WHERE
origin='imported'`. Si al identificar un traspaso se cambiara el `type` de
`expense` a `transfer`, **la clave del índice cambiaría** y una reimportación del
mismo extracto ya **no colisionaría** → duplicado silencioso. El `type` debe ser
**inmutable** (lo que reportó el banco); por eso el marcador vive en una columna
aparte que **no** participa en el índice.

**Efecto colateral bueno — el saldo no se entera** (§6): como el saldo se **lee**
del `balanceAfter` que da el banco, la pierna de un traspaso ya está dentro de ese
número; ninguna rama del cálculo necesita mirar `transferId` ni `direction` (R19).
La única regla propia del traspaso es de **agregación**: los totales globales
excluyen `transferId != null` (R20).

**Qué NO entra en esta feature:** quién rellena `transferId`. Decidido con el
humano (2026-08-05): será una **feature propia posterior a la de importación**, de
**detección automática** —mismo importe, signo opuesto, fechas próximas, dos
cuentas **propias** distintas→ marcar ambas con un `transferId` compartido. **Sin
marcado manual**: el usuario no enlaza nada. Se hace después de importar para
calibrar el heurístico (desfase real de fechas entre bancos, formatos de
`description`) con datos de verdad, y antes de los dashboards, que son los que
consumen los totales de R20. Aquí la columna queda **reservada e indexada**
(`@@index([transferId])`).

⚠️ **Consecuencia asumida:** entre esta feature y la de detección, un traspaso
interno **contará** como gasto en una cuenta e ingreso en otra en los totales
globales. No molesta a nadie todavía porque **no hay consumidor de totales** (los
dashboards son idea #4, posterior). Está anotado en `progress/current.md`.

> **Por qué hace falta emparejar y no basta con leer el concepto:** el banco pone
> "TRANSFERENCIA" tanto cuando te pagas a ti mismo como cuando pagas a un tercero,
> y la segunda **sí** es un gasto real (en la muestra real conviven `TRANSF NOMI
> /EMPRESA MUNICIPAL +2197,72` —nómina— y `TRANS INM/ EMILIA BENITEZ LOPE +350`).
> Lo que distingue el traspaso interno es que la contrapartida sea **otra cuenta
> tuya**, y eso solo se ve mirando los dos extractos a la vez.

### 2.2 Columnas que esta feature deja **reservadas** (nadie las escribe todavía)

Con el alta manual fuera (§5) y el emparejado de traspasos en una feature posterior
(§2.1), varias columnas del modelo quedan definidas pero sin escritor. Es
deliberado —son el cimiento de lo que viene— y conviene tenerlo a la vista para que
nadie las dé por rotas:

| Columna | Quién la rellenará |
| --- | --- |
| `transferId` | la feature de **detección de traspasos**, posterior a la importación (§2.1) |
| `categoryId` | la feature de **categorización por reglas** (decidido con el humano): la primera vez que aparece un concepto nuevo lo clasificas, se guarda la regla (`VivaGym → Deporte`) y a partir de ahí cada importación categoriza sola lo conocido. El **catálogo** de categorías sí es de esta feature (`POST/GET /api/categories`), porque el banco no manda categorías: solo puedes definirlas tú |
| `paymentMethod` | la misma feature de reglas: el parser no lo emite, se derivará del `description` (`RECIBO` → `direct_debit`, `PAGO TARJETA` → `card`…) |
| `note` | anotación manual sobre un movimiento importado, cuando exista pantalla para ello |
| `status` | el **importer** lo pone a `pending_review`; lo pasará a `confirmed` la revisión, que es donde vive la categorización (idea #1) |
| `daySequence`, `balanceAfter`, `origin` | el **importer** (feature siguiente) |

**Nota sobre el aparente doble rasero** (el humano preguntó por esto): a los
movimientos se les quitó el alta manual pero a las categorías **no**, y la razón es
la fuente del dato. Un movimiento **existe en el banco** y llegará en su fichero, así
que crearlo a mano solo puede duplicar o descuadrar. Una categoría **no existe en
ningún sitio** hasta que tú la inventas: el extracto dice `RECIBO /Recibo VivaGym`,
y que eso sea "Deporte" es una decisión tuya. Por eso el catálogo se crea a mano y
lo automático es **asignarlo**, no inventarlo.

## 3. ⭐ DECISIÓN PROPIA #2 — Índice único parcial del dedup de importados (R6)

**Clave de dedup: `(accountId, bookingDate, type, amount, description, daySequence)`
con predicado `WHERE origin = 'imported'`.** Se incluye `type` porque, con la
convención "importe siempre positivo", una salida y una entrada del mismo día,
importe absoluto y concepto son movimientos distintos (el signo lo lleva `type`).
Al estar `type` en la clave, **`type` es inmutable** una vez importado: nada puede
reescribirlo después (ni el marcado de traspasos, §2.1) so pena de romper el dedup
en la siguiente reimportación.

🔴 **`daySequence` en la clave no es un adorno: sin él la importación pierde
dinero.** Un extracto real trae **líneas idénticas legítimas**. Contado sobre la
muestra del humano (39 movimientos, `var/parsed/bankinter/2026/`): **4 grupos** de
líneas iguales en fecha + concepto + importe, entre ellos **tres**
`TRANS INM/ Openbank −1000,00` el `2026-07-24` y el recibo `VivaGym −29,90`
repetido el mismo día en tres meses distintos. Con la clave anterior, las tres
transferencias de 1.000 € eran "el mismo movimiento": se habría guardado **una** y
las otras dos se habrían descartado en silencio (−2.000 € en el saldo... salvo que
el saldo lo lea del banco, §6, con lo cual el descuadre sería aún más difícil de
ver). Con `daySequence` (1, 2, 3) son tres filas distintas y el dedup sigue
funcionando en la reimportación, porque el mismo movimiento vuelve a caer en la
misma posición de su día.

- **Por qué la posición del día y no el número de línea del fichero:** el número de
  línea depende del **rango descargado** (el mismo movimiento es la línea 5 de un
  extracto de julio y la 120 de uno del trimestre), así que no serviría como parte
  de una clave que debe reconocer lo ya importado. La posición dentro del día es
  estable entre descargas.
- **Límite conocido:** si un día quedara **partido** entre dos descargas (un rango
  que corta a mitad de un día), el fragmento reempieza en 1 y ese movimiento se
  guardaría duplicado. Se evita descargando por **días completos**, que es como
  funciona el filtro de fechas del banco. Es un duplicado **visible** y corregible,
  no una pérdida silenciosa: preferible al fallo contrario.

**Cómo se materializa (Prisma 7):** Prisma 7 **no** expresa índices parciales en el
schema (el soporte declarativo `@@index([...], where: "...", unique: true)` llegó
en **Prisma 8** / el "next contract"; verificado en la doc de Prisma). Por tanto se
añade con **SQL crudo** en el archivo de migración generado:

```sql
CREATE UNIQUE INDEX "Movement_imported_dedup_key"
  ON "Movement" ("accountId", "bookingDate", "type", "amount", "description", "daySequence")
  WHERE "origin" = 'imported';
```

Los movimientos `manual` quedan **fuera** del predicado → no se les impone
unicidad (dos cafés en efectivo idénticos son válidos). El `importer` (feature
siguiente) inserta con `ON CONFLICT DO NOTHING` (o `skipDuplicates`) contra este
índice para no reingestar periodos solapados.

- **Límite conocido (drift de Prisma):** al no estar en el schema, `prisma migrate
  dev` no gestiona este índice. El shadow DB replica la migración (que lo crea), así
  que **no** debería reportar drift; si en algún flujo lo hiciera, se mantiene
  aislado en su migración y **no** se declara en el schema. Anótalo, humano.
- **Alternativa descartada — columna `importHash` (la del `data-model.md`):** un
  hash de `(accountId+date+amount+concept)` con índice único parcial sobre el hash.
  Descartada porque **abre una sub-decisión que el propio `data-model.md` dejó
  ‘open point’**: la receta exacta del hash y si se normaliza el concepto
  (mayúsculas/espacios) antes de hashear. El índice compuesto da la misma garantía
  de unicidad **sin** columna redundante ni normalización oculta; la clave queda
  **visible y auditable**. Coste asumido: el índice incluye `description` (TEXT) —
  irrelevante para btree con descripciones de banco cortas.

## 4. ⭐ DECISIÓN PROPIA #3 — Unicidad de categorías raíz / el `NULL` de Postgres (R7)

El `@@unique([parentId, kind, name])` del schema **no** impide dos categorías raíz
homónimas: en Postgres los `NULL` son **distintos** entre sí, así que dos raíces
(`parentId = NULL`) con igual `kind`+`name` **no** colisionan.

**Solución: `NULLS NOT DISTINCT`** (Postgres 15+; el proyecto corre Postgres 17,
`docs/stack.md`). El `@@unique` del schema se **mantiene** (Prisma conoce que hay
un único sobre esas columnas), pero en la migración se **re-crea** el índice con el
modificador que trata los `NULL` como iguales:

```sql
-- reemplaza el índice único plano que Prisma generó por el mismo con NULLS NOT DISTINCT
DROP INDEX "Category_parentId_kind_name_key";
CREATE UNIQUE INDEX "Category_parentId_kind_name_key"
  ON "Category" ("parentId", "kind", "name") NULLS NOT DISTINCT;
```

Como el **conjunto de columnas y el nombre** del índice son idénticos a los que
Prisma espera, la diferencia (el `NULLS NOT DISTINCT`) queda por debajo de la
granularidad del schema de Prisma 7 → **drift mínimo**. Con esto, `POST` de una
segunda raíz `{kind,name}` viola el índice → el servicio lo mapea a `409 CONFLICT`
(R29). Subcategorías bajo padres distintos siguen permitidas (sus `parentId` no son
`NULL`).

- **Alternativa descartada — dos índices parciales** (`WHERE parentId IS NULL`
  sobre `(kind,name)` + `WHERE parentId IS NOT NULL` sobre `(parentId,kind,name)`):
  funciona en Postgres <15, pero son **dos** objetos donde `NULLS NOT DISTINCT`
  resuelve con **uno** y de forma más legible. Estamos en Postgres 17.
- **Alternativa descartada — centinela** (`parentId = 0` para raíces): ensucia el
  modelo con una fila/valor mágico y complica los `include`. Descartada.

## 5. ⭐ DECISIÓN PROPIA #4 — Endpoints mínimos y su forma (R8-R11, R13, R25-R29)

Tres módulos nuevos (ADR-004), registrados en `app.ts` con su prefijo, capa HTTP
que solo valida (JSON Schema/AJV, ADR-003) y delega en el servicio. **Serialización
según `api-contract.md`:** `Decimal` como **string** (`amount`, `initialBalance`,
`balanceAfter`, `balance`); `bookingDate`/`valueDate` como **`YYYY-MM-DD`**;
`createdAt`/`updatedAt` como ISO. El servicio nunca vuelca el modelo Prisma crudo
si diverge del contrato: mapea a la forma del contrato.

### `/api/accounts` (`modules/accounts/`)

| Método | Ruta | Body / Params | Éxito | Errores |
| --- | --- | --- | --- | --- |
| `POST` | `/api/accounts` | `{ iban, bank, alias?, type?, initialBalance? }` | `201` Account | `400` (falta iban/bank), `409` (iban duplicado) |
| `GET` | `/api/accounts` | — | `200` `[Account]` (con `balance` calculado) | — |
| `GET` | `/api/accounts/:id` | `id` int | `200` Account | `400`, `404` |

- `type` por defecto `checking`; `alias` por defecto derivado (§7); `initialBalance`
  por defecto `0`. `iban` se normaliza (trim, mayúsculas, sin espacios) en el servicio.
- `balance` (R9, R19): lo resuelve `computeAccountBalance` (§6) **leyendo el
  `balanceAfter` más reciente** del extracto, no sumando movimientos.

### `/api/categories` (`modules/categories/`)

| Método | Ruta | Body | Éxito | Errores |
| --- | --- | --- | --- | --- |
| `POST` | `/api/categories` | `{ name, kind, parentId? }` | `201` Category | `400` (kind≠padre / >1 nivel / parent inexistente), `409` (raíz duplicada) |
| `GET` | `/api/categories` | — | `200` raíces con `children[]` | — |

- Validaciones de servicio: si hay `parentId`, el padre debe existir (`404`/`400`),
  ser **raíz** (`parent.parentId == null`, si no `400`, R27) y tener el **mismo
  `kind`** (`400`, R28). Raíz duplicada → `409` por el índice de R7 (R29).
- 🔁 **El `POST` de categorías se queda** (a diferencia del de movimientos, §5):
  confirmado por el humano. El banco no manda categorías, así que el catálogo solo
  puede crearlo él; lo que será automático es **asignarlas** (§2.2). Esta feature
  entrega el catálogo; la asignación por reglas es una feature posterior.

### `/api/movements` (`modules/movements/`)

| Método | Ruta | Body / Params | Éxito | Errores |
| --- | --- | --- | --- | --- |
| `GET` | `/api/movements` | — | `200` `[Movement]` (`bookingDate DESC, daySequence DESC`, `account`+`category` embebidos) | — |

🔁 **Es el único endpoint de movimientos.** Los dos que había se caen por decisión
humana en la puerta:

- **`POST /api/movements` (alta manual) — fuera.** "Si lo hago en el banco queda
  reflejado, con lo cual es un movimiento que vendrá en los archivos del banco."
  Todo movimiento entra por importación.
- **`DELETE /api/movements/:id` — fuera.** "No se pueden eliminar movimientos a
  mano." Borrar una línea del extracto descuadraría la cuenta contra el banco, que
  es justo lo que el saldo leído de `balanceAfter` (§6) evita.
- **`POST /api/movements/transfer` — fuera** (§2.1, R18): un traspaso son dos
  movimientos ordinarios que ya llegan del banco.

El `Movement` serializado sí incluye `transferId` y `daySequence`, para que el
frontend pueda distinguir la pierna de un traspaso y respetar el orden intradía.

🔴 **Consecuencia: en esta feature el módulo `movements` es de solo lectura.** No
tiene `createMovement`, ni `deleteMovement`, ni `movements.schema.ts` de body (solo
la serialización). Quien escribirá en la tabla es el **importer** de la feature
siguiente, usando el modelo y los helpers que esta feature deja listos.

## 6. ⭐ DECISIÓN PROPIA #5 — Importe 0: tipo `neutral` (R33) + cálculo de saldo

**Decido añadir un valor `neutral` a `MovementType`** (ni ingreso ni gasto), en vez
de dejar el 0 como `income` (que el `intent` marca como "no real"). Regla de signo
de tres vías, en un helper de dominio puro:

```typescript
// modules/movements/movements.service.ts
export function deriveMovementTypeFromAmount(amount: number): MovementType {
  if (amount < 0) return 'expense'
  if (amount > 0) return 'income'
  return 'neutral'
}
```

Un `neutral` tiene `amount = 0`, `categoryId = null`, aporta 0 al saldo y **no**
cuenta como ingreso ni gasto. Lo usará la **importación** (el parser hoy clasifica
el 0 como `income`; el importer re-derivará con este helper).

**Cálculo de saldo** (R9, R19) — 🔁 **corrección humana: el saldo no se calcula, se
lee.** Todo extracto trae el saldo tras cada movimiento (`balanceAfter`, columna
`Saldo` del parser), así que el saldo de la cuenta es **el del banco**, no una suma
nuestra. Sumar sería recalcular algo que ya nos dan y arriesgarse a divergir de él.

```
balance(account):
  M = movimiento de la cuenta con balanceAfter != null más reciente
      ORDER BY bookingDate DESC, daySequence DESC   LIMIT 1
  si M existe:  balance = M.balanceAfter            # el número del banco, tal cual
  si no:        balance = initialBalance + Σ income − Σ expense   # caso excepcional
                (neutral aporta 0)
```

Una consulta y ninguna suma en el caso normal. Ninguna rama mira `transferId` ni
necesita `direction`: la pierna de un traspaso ya está dentro del `balanceAfter`
que dio el banco (R19). La rama de la suma es el **caso excepcional** que nombró el
humano ("a las malas, en algún banco haremos nosotros la suma"): un banco cuyo
extracto no traiga saldo corrido, o una cuenta a la que aún no se le ha importado
nada. El `initialBalance` de `Account` es la **semilla** de esa rama.

**El desempate intradía sale de `daySequence`** (§2, R3b), no del `id`: un extracto
trae varias filas con la misma `bookingDate` y saldos distintos, y la posición
dentro del día es un dato guardado, no algo inferido del orden de inserción. El
contrato de quién lo calcula está en §9.

🔴 **Nada ajusta el saldo por fuera del banco.** Con el alta manual retirada
(§5) no existe ninguna vía por la que entre un movimiento que el banco no conozca,
así que el saldo no necesita ningún ajuste ni reconciliación. Es exactamente lo que
pidió el humano: "si hacemos esto debemos controlar el saldo, y eso no quiero que
se haga a mano".

**El efectivo se agota en la retirada de cajero** (decisión del humano): esa
retirada ya es una línea del extracto, y no hace falta saber en qué se gastó ese
dinero. Por eso no queda ningún hueco que un alta manual tuviera que rellenar.

> Nota para el futuro, por si alguna vez se reabre el alta manual: sumar esos
> movimientos al saldo del banco sería **incorrecto** para el efectivo, porque el
> banco ya descontó ese dinero en la retirada y restar además los gastos en metálico
> lo sacaría **dos veces**.

`computeAccountBalance` se implementa en el servicio con **una** consulta y se
expone como `balance` en las respuestas de cuenta.

**Totales globales** (helper aparte, el que consumirán los dashboards): un
movimiento con `transferId != null` **no** cuenta como gasto ni como ingreso, y
`neutral` tampoco (R20). Es la única regla propia del traspaso; como el par se
compone de un cargo y un abono del mismo importe, excluirlo entero deja el total
global exactamente igual que antes del traspaso.

- **Trade-off de `neutral` (aprobar en la puerta):** añade un valor de enum que
  todo consumidor de agregados debe contemplar (excluir de ingresos/gastos, tratar
  como 0 en saldo). A cambio, el modelo es **honesto**: un movimiento de importe 0
  no se cuenta como ingreso falso. La alternativa (dejarlo `income`) es de coste
  cero en código pero arrastra el dato incorrecto que el `intent` quiere corregir.

## 7. ⭐ DECISIÓN PROPIA #6 — Servicio de auto-alta de cuenta y su límite (R30-R32)

**El servicio vive en ESTA feature; el disparo por Drive y el error al frontend
viven en la feature de importación.** Es la contraparte de dominio del find-or-create.

```typescript
// modules/accounts/accounts.service.ts
export interface AccountMetadata { iban?: string; bank?: string; alias?: string; type?: AccountType }
export interface FindOrCreateAccountResult {
  account: Account
  created: boolean
  appliedDefaults: { alias: boolean; type: boolean }   // qué defaults se aplicaron (para "notificar los datos usados")
}
export async function findOrCreateAccountFromMetadata(
  prisma: AppPrismaClient, meta: AccountMetadata,
): Promise<FindOrCreateAccountResult>
```

- **Datos suficientes para auto-crear = `iban` + `bank`.** Si falta alguno →
  `throw new MissingAccountDataError('missing iban'|'missing bank'|...)` (R31), **no
  crea nada**.
- **Find:** normaliza el IBAN y busca `account` por `iban` (único, R1). Si existe →
  `{ account, created: false }`.
- **Create con defaults** cuando el IBAN es nuevo y hay banco:
  - `alias` (si no viene) = **`\`${bank} ···${last4(iban)}\``** (legible y casi
    único), p. ej. `"bankinter ···0236"`. ⭐ formato mío, ajustable.
  - `type` (si no viene) = **`checking`**. ⭐
  - `initialBalance` = `0` (irrelevante aquí: el saldo saldrá del `balanceAfter`
    del propio extracto, §6).
- Devuelve `created: true` y `appliedDefaults` para que el llamador (la importación)
  **notifique con los datos usados** ("cuenta creada: `<alias>`, tipo `<type>`").

**Error diferenciable** (nueva subclase, ADR-005):

```typescript
export class MissingAccountDataError extends AppError {
  constructor(message = 'Missing data to create the account') {
    super(message, 'MISSING_ACCOUNT_DATA', 422)
  }
}
```

`MISSING_ACCOUNT_DATA` (422) es **distinguible** de `VALIDATION_ERROR` (400,
formato) y de `NOT_FOUND` (404): permite al frontend, en la feature de importación,
ofrecer el **alta manual** exactamente en ese caso. Queda **reservado** en
`api-contract.md` (interno; ningún endpoint de esta feature lo devuelve), mismo
patrón que `UNKNOWN_BANK` en la feature 4.

**Límite exacto (R32):** esta feature **no** lee Drive, **no** parsea, **no**
importa en lote y **no** expone endpoint que dispare el auto-alta. Solo deja la
función y el error listos para que la importación los encadene.

## 8. ⭐ DECISIÓN PROPIA #7 — Reemplazo del `Expense` (breaking change) (R34-R36)

- **Código:** borrar `src/modules/expenses/` completo (routes, service, schema,
  types, test) y su `app.register(expensesRoutes, …)` en `src/app.ts`. Actualizar
  `src/architecture.test.ts` (el árbol objetivo pierde `expenses/`, gana
  `accounts/`, `categories/`, `movements/`). Tras esto, `/api/expenses*` cae en el
  `setNotFoundHandler` → `404` (R34).
- **Migración:** como la `Category` antigua (solo `name`) y la nueva (con
  `kind`/`parentId`) tienen **forma incompatible**, y ambas tablas del bootstrap son
  **placeholder sin datos reales**, la migración hace **DROP + CREATE limpio** en
  vez de `ALTER`:
  1. `DROP TABLE "Expense"` (y su FK a `Category`).
  2. `DROP TABLE "Category"` (la antigua).
  3. `CREATE TYPE` de los enums nuevos.
  4. `CREATE TABLE "Account"`, `"Category"` (nueva), `"Movement"` + FKs.
  5. Los dos índices SQL crudo de §3 (dedup) y §4 (`NULLS NOT DISTINCT`).
  El `implementer` genera la base con `prisma migrate dev --create-only` y **edita**
  el `.sql`: fuerza el DROP+CREATE de `Category` (Prisma tendería a `ALTER`) y
  **anexa** los dos índices personalizados. Aplicada sobre BD limpia → todo se crea
  sin error (R5); aplicada sobre la del bootstrap → las viejas desaparecen (R35).
  Pérdida de datos: **asumida** (placeholder; el `intent` habla de "base limpia").
- **Docs (R36):** en `api-contract.md`, retirar `Expense`/`/api/expenses` con una
  **nota de breaking change** y documentar `Account`/`Category`/`Movement` +
  endpoints; en `data-model.md`, dejar el **modelo final** (sin `cash`; con `iban`,
  `bookingDate`, `valueDate`, `balanceAfter`, `currency`, `description`; `neutral`;
  índices de §3/§4); nota de breaking change también en `progress/current.md`.

## 9. Alineación explícita parser ↔ BD (documentación; el mapeo real es de la importación)

La importación (feature siguiente) mapeará `BankinterParseResult`/`ParsedMovement`
(`src/modules/bankinter/bankinter.types.ts`) a `Account` + `Movement` así. **Aquí no
se implementa** (solo se documenta para que el mapeo sea directo):

| Parser (`ParsedMovement`/result) | BD (`Movement`/`Account`) | Nota |
| --- | --- | --- |
| `accountIban` | `Account.iban` (vía `findOrCreateAccountFromMetadata`) | `bank='bankinter'` para los defaults |
| `bank` (`'bankinter'`) | `Account.bank` | |
| `bookingDate` (`YYYY-MM-DD`) | `Movement.bookingDate` (`@db.Date`) | mismo formato |
| `valueDate` | `Movement.valueDate` | |
| `description` | `Movement.description` | |
| `amount` (con signo) | `Movement.amount = abs(amount)` + `type = deriveMovementTypeFromAmount(amount)` | signo → type; el 0 → `neutral` (§6) |
| `balance` | `Movement.balanceAfter` | **es el saldo de la cuenta** (§6): no lo recalculamos sumando |
| `currency` (`''` si falta) | `Movement.currency` (`'EUR'` si `''`) | |
| — (fijado por el importer) | `origin='imported'`, `status='pending_review'` | alimenta la revisión (idea #1) |
| — | `transferId = null` | el importer **no** empareja traspasos; el emparejado es una feature posterior (§2.1) |
| (posición de la línea) | `Movement.daySequence` | posición dentro de su `bookingDate`, `1` = el primero del día; la calcula el importer (ver abajo) |
| (dedup) | índice único parcial `(accountId,bookingDate,type,amount,description) WHERE origin='imported'` (§3) | el importer inserta con skip de duplicados |

El `type` del parser (2 valores `income|expense`) se **re-deriva** en la
importación con el helper de 3 vías (§6) para cubrir el importe 0.

🔴 **Cálculo de `daySequence` (contrato con el importer, verificado en la muestra
real).** Bankinter exporta **de más reciente a más antiguo**: la primera fila del
fichero es el último movimiento (comprobado con los saldos: dos filas del
`2026-07-31`, `+2197,72 → 24816,16` y `−188,67 → 24627,49`, y en efecto
`24816,16 − 188,67 = 24627,49`). Por tanto el importer, **por cada `bookingDate`**,
recorre las filas de ese día **de abajo arriba** (del final del fichero hacia el
principio) y numera `daySequence = 1, 2, 3…`.

El sentido de la exportación es **conocimiento del banco**, así que su sitio
natural es el adaptador de Bankinter; el parser (features 6/7) está **congelado**
en esta feature, así que de momento lo aplica el importer, que ya es
bank-specific. Cuando haya un segundo banco, conviene que cada parser emita la
posición ya normalizada.

**El orden ya no depende del `id`.** Ésta fue la petición del humano: guardar la
posición explícitamente en vez de confiar en el orden de inserción. La ventaja
concreta es que importar un extracto **antiguo después** de uno reciente, o
reimportar un periodo solapado, no altera el orden — cada fila lleva el suyo.

## 10. Errores (ADR-005) — reutilizar y añadir

- **Reutiliza:** `ValidationError` (400) para la coherencia de dominio que queda
  (categoría de más de un nivel, `kind` distinto al del padre) y `NotFoundError`
  (404) para `GET /api/accounts/:id` no encontrado y para el `parentId` inexistente
  de una categoría. Las validaciones del alta de movimientos (`amount<=0`,
  `accountId` inexistente, `kind`≠`type`) **decaen** con el endpoint (§5): volverán
  cuando exista la feature de categorización, que sí asigna categoría a un
  movimiento.
- **Añade** (subclases idiomáticas bajo ADR-005, el `error-handler` las mapea sin
  tocar nada):
  - `ConflictError` (`CONFLICT`, **409**) — IBAN duplicado (R10) y categoría raíz
    duplicada (R29). Mapea el `P2002` de Prisma (unique violation) a un 409 claro.
    ADR-005 ya cita `ConflictError` como ejemplo de subclase futura.
  - `MissingAccountDataError` (`MISSING_ACCOUNT_DATA`, **422**) — §7, R31.
    **Reservado** en el contrato (interno).

## 11. Estrategia de test (Nivel 2 de `docs/verification.md`)

- **Integración con `app.inject()` + `buildApp()`** contra el Postgres real de
  `docker-compose` (patrón vivo de `expenses.test.ts`), **limpiando las filas
  creadas**. Cubre R8-R11, R13, R25-R29, R34.
- 🔴 **Los movimientos se siembran con el cliente Prisma dentro del test**, no por
  API: ya no hay endpoint de alta (§5). Es el mismo patrón que se usa para el par
  de un traspaso y para los tests del índice de dedup.
- **Unitario/de dominio sin BD** para los helpers puros: `deriveMovementTypeFromAmount`
  (R33), `computeAccountBalance` (R9, R19) y el helper de totales globales (R20),
  `findOrCreateAccountFromMetadata` con doble de Prisma o BD real (R30, R31), las
  clases de error nuevas (R10/R29/R31).
- **Traspasos (R18, R19):** como **ningún endpoint escribe `transferId`**, el par
  de piernas se persiste **directamente con el cliente Prisma dentro del test**
  (dos cuentas, un `expense` y un `income` con el mismo `transferId`) y se verifica
  vía `GET /api/accounts` (saldos, R19) y por lectura (el enlace y el `type`
  intactos, R18). El "no existe endpoint de traspasos" lo verifica el **reviewer**
  sobre el diff, no un test.
- **Migración/índices (R5, R6, R7):** tests de integración que provocan la
  violación de cada índice (dos importados con la misma clave → falla; dos manuales
  idénticos → ambos ok; dos raíces homónimas → falla; dos subcategorías homónimas
  bajo padres distintos → ok).
- **Sin red, sin credenciales de Drive** (esta feature no toca Drive). `bash
  ./init.sh` debe quedar verde con la BD de `docker-compose` levantada.

## 12. Borradores de ADR (van a `docs/architecture.md`, tarea de docs — R37)

> Formato ADR-005/006/007/008. El `implementer` los redacta al cerrar; aquí queda
> el esqueleto. Numeración: **ADR-011** (siguiente libre tras ADR-010).

### ADR-011: Modelo de datos del flujo — Account/Category/Movement, importe 0 = `neutral`, índices personalizados por SQL, reemplazo del Expense

- **Estado:** propuesta (se acepta al aprobar el spec e implementarse).
- **Contexto:** feature 8 fija la BD real del flujo según `data-model.md` + `intent`
  (sin efectivo; alineada con el parser). Delegadas: materialización Prisma,
  índices (dedup + raíz), importe 0, servicio de auto-alta, reemplazo del `Expense`.
- **Decisión:** (1) esquema `Account`/`Category`/`Movement` + enums en inglés (§2);
  (2) `amount` **siempre positivo**, el signo lo da `type`, y **`type` inmutable**
  (es lo que reportó el banco); el **traspaso no se crea**: son dos movimientos
  ordinarios enlazados por `transferId`, sin `type='transfer'` ni `direction`
  (§2.1); (2-bis) el **saldo de la cuenta se lee del extracto** (`balanceAfter` del
  movimiento más reciente), no se recalcula sumando; la suma queda para el caso
  excepcional de un banco sin saldo corrido (§6); (2-ter) columna **`daySequence`**
  (posición dentro del `bookingDate`) que fija el orden intradía y entra en la clave
  de dedup para no descartar líneas idénticas legítimas (§3); (2-quater) **los
  movimientos solo entran por importación**: sin alta ni borrado manual,
  `/api/movements` es de solo lectura y `Movement` nace
  `origin=imported`/`status=pending_review` (§5); (3) importe 0 → tipo **`neutral`**
  (§6); (4) dedup importados = **índice único parcial** `(accountId, bookingDate,
  type, amount, description) WHERE origin='imported'` por **SQL crudo** (Prisma 7 no
  lo declara; Prisma 8 sí con `@@index(where:,unique:)`), **sin** columna
  `importHash` (§3); (5) unicidad de raíz con **`NULLS NOT DISTINCT`** (Postgres 17)
  por SQL crudo (§4); (6) servicio `findOrCreateAccountFromMetadata` con datos
  suficientes = IBAN+banco y error **`MissingAccountDataError`** (422), reservado
  (§7); (7) reemplazo del `Expense`: borrar módulo + tablas + endpoints, breaking
  change (§8).
- **Alternativas descartadas:** columna `importHash` (abre la receta del hash);
  **recalcular el saldo sumando movimientos** teniendo el `balanceAfter` del banco;
  **fiar el orden intradía al `id` autoincremental** (obligaría al importer a
  insertar invirtiendo el array y se rompe al importar un extracto antiguo después
  de uno reciente, §9); **guardar el número de línea del fichero** en vez de la
  posición dentro del día (no es estable entre descargas, §3); **mantener el alta y
  el borrado manual de movimientos** (obligaría a reconciliar a mano el saldo contra
  el banco, §5/§6); dos índices parciales /
  centinela para la raíz; dejar el importe 0 como `income`;
  disparar el auto-alta con endpoint en esta feature; `ALTER` de `Category` en vez
  de DROP+CREATE; **crear los traspasos por API** (`POST /transfer` con dos piernas
  nuevas → duplicaría lo que ya llega del banco) y **marcarlos mutando el `type` a
  `transfer`** (rompería la clave del índice de dedup y con ella la protección
  contra reimportaciones). (Detalle en §2.1, §3, §4, §6, §7, §8.)
- **Consecuencias:** dos errores nuevos (`ConflictError` 409, `MissingAccountDataError`
  422); dos índices personalizados fuera del schema (drift mínimo, §3/§4); breaking
  change en `/api/expenses`; el parser y la importación quedan alineados (§9);
  `Movement.transferId` queda como **columna reservada** que ninguna ruta escribe
  hasta la feature de emparejado de traspasos (§2.1); sin dependencias nuevas (todo
  con Prisma/Postgres ya presentes).

## 13. Riesgos y notas para el implementer

- 🔴 **`pnpm`, NO npm.** Sin dependencias nuevas: todo es Prisma/Postgres ya en el
  stack. Nada de librerías de validación (ADR-003: JSON Schema nativo).
- 🔴 **No toques `.env`** ni el parser (`modules/bankinter/*`).
- 🔴 **Solo los servicios hablan con Prisma.** Las rutas nuevas no importan Prisma
  (lo guarda `architecture.test.ts`); reciben `fastify.prisma` vía el `*.service.ts`
  como hace `expenses.service.ts` (`expensesDb(app)`).
- 🔴 **Los índices personalizados van en SQL crudo dentro de la migración**, no en
  el schema (Prisma 7). Verifica que `prisma migrate dev` posterior no reporta drift
  (§3, §4).
- 🔴 **`Decimal` se serializa como string** (`api-contract.md`); no devuelvas el
  modelo Prisma crudo si diverge del contrato — mapéalo (fechas date-only a
  `YYYY-MM-DD`).
- 🔴 **Nada de endpoints, servicios ni validaciones de traspaso** (§2.1, R18): no
  hay `createTransfer`, ni `POST /transfer`, ni `direction`, ni `type='transfer'`.
  Si te sale la tentación de "crear las dos piernas", relee §2.1: ya existen.
- 🔴 **El módulo `movements` es de SOLO LECTURA** (§5): solo `GET /`. No escribas
  `createMovement` ni `deleteMovement` "ya que estamos" — el humano los retiró
  a propósito. Los movimientos los insertará el importer de la feature siguiente.
- Imports relativos con `.js`; `import type` para tipos; vendor antes que relativos;
  comillas simples, sin `;`, 2 espacios, 100 columnas; nombres en inglés.
</content>
