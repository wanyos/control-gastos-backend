# Design — F62 `own-accounts`

> Nombres de tabla, columna, ruta y campo: propuesta pendiente de aprobación
> (`decisions.md` 🔴 6). Si el humano los cambia, el leader los corrige aquí y en
> `tasks.md` antes de lanzar los lotes.

## 1. Dónde vive y qué se relaciona con qué

- Módulo nuevo `src/modules/own-accounts/` (`routes`, `schema`, `service`,
  `types`, `recognition`, tests). Es el **único** que lee y escribe `OwnAccount`,
  `OwnAccountText` y `AccountHolderName`. Las rutas obtienen el cliente por
  `ownAccountsDb(app)`, como el resto de módulos (las rutas no nombran `prisma`).
- **La tabla es independiente** de `Account` y de `InvestmentProduct`: sin clave
  ajena, sin rellenarla sola. Motivo: la mitad de lo que el humano quiere dar de
  alta no está en ninguna de las dos (ING, Criptan) y el reconocimiento solo
  necesita textos. Alternativa descartada (y viva en `decisions.md` 🔴 5): enlazar
  con `accountId` / `productId` y sembrar las filas en la migración; cuesta dos
  requirements y una validación cruzada sin cambiar lo que se reconoce.
- `accountNumber`, `openedAt` y `closedAt` son **solo informativos**: no entran en
  el reconocimiento. Medido el 2026-10-20: ningún concepto de transferencia lleva
  un número de cuenta ni un IBAN (0 movimientos con forma de IBAN; ninguno de los
  40 conceptos con 10 o más cifras seguidas es una transferencia o un bizum). Las
  fechas solas no deciden (idea 5 del workspace, palabras del humano).

## 2. Modelo (migración nueva)

```prisma
enum OwnAccountType {
  checking    // cuenta corriente
  savings     // cuenta remunerada
  investment  // cartera, fondo, ETF
  deposit
  crypto
  other
}

/// Feature 62: the human's own accounts and products, in any bank, imported or
/// not. Read by the recognition of own movements (own-accounts.recognition.ts),
/// computed when reading; nothing here is copied onto a movement.
model OwnAccount {
  id            Int            @id @default(autoincrement())
  name          String
  bank          String
  accountNumber String?        // informative only: no concept carries one
  type          OwnAccountType
  openedAt      DateTime?      @db.Date
  closedAt      DateTime?      @db.Date
  texts         OwnAccountText[]
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
}

/// A text with which an own account appears in movement descriptions. Stored
/// as the human typed it; compared normalized (design §3).
model OwnAccountText {
  id           Int        @id @default(autoincrement())
  ownAccount   OwnAccount @relation(fields: [ownAccountId], references: [id], onDelete: Cascade)
  ownAccountId Int
  text         String
  @@unique([ownAccountId, text])
}

/// The forms in which the account holder's name appears in descriptions.
model AccountHolderName {
  id   Int    @id @default(autoincrement())
  name String @unique
}

enum OwnershipDecision {
  mine
  not_mine
}
```

En `Movement`: `ownershipDecision OwnershipDecision?` (NULL = sin decidir). Lo
escribe **solo** `PATCH /api/movements/:id`. Ningún importador, ni la detección de
traspasos, ni el reconocimiento lo escribe.

- Sin clave natural en `OwnAccount` (dos cuentas del mismo banco pueden llamarse
  igual hasta que el humano las renombre; no hay importación que haga upsert).
- `src/lib/test-real-data.ts`: `OwnAccount.name`, `OwnAccount.accountNumber`,
  `OwnAccountText.text` y `AccountHolderName.name` van a `comparedColumns` con
  `kind: 'text'` (son datos suyos: si acaban en el repositorio, que salte);
  `OwnAccount.bank` a `notComparedColumns` con el motivo `bankName` que ya usan
  `Account.bank` e `InvestmentProduct.bank`.
- `docs/data-model.md` (lección #2): «Columnas reservadas», bloque Prisma,
  diagrama ER y tabla de claves naturales, comprobado contra `schema.prisma`.

## 3. Reconocimiento (puro, `own-accounts.recognition.ts`)

```ts
export function normalizeOwnText(text: string): string
// NFD, quitar \p{Diacritic}, minúsculas, /[^a-z0-9]+/g → ' ', trim.

export interface OwnershipInput {
  id: number
  description: string
  transferId: string | null
  excludedFromTotals: boolean
  ownershipDecision: 'mine' | 'not_mine' | null
}
export interface OwnAccountForMatch { id: number; name: string; bank: string; texts: string[] }
export interface OwnershipReading {
  status: 'own' | 'doubtful' | 'mine' | 'not_mine'
  ownAccountId: number | null   // null si casó con el nombre del titular o no casó
  ownAccountName: string | null
  matchedText: string | null    // tal como lo escribió el humano
  leavesTotals: boolean         // true solo con status 'own' o 'mine'
}

export function resolveOwnership(
  movements: OwnershipInput[],
  ownAccounts: OwnAccountForMatch[],
  holderNames: string[],
): Map<number, OwnershipReading>   // solo los movimientos con reading ≠ null
```

Orden, por movimiento (`d` = `normalizeOwnText(description)`):

1. `ownershipDecision !== null` → `status` = la decisión; `leavesTotals` = `mine`.
   `ownAccountId` / `matchedText` = los del paso 2 si casa algo (para que se vea
   por qué), si no `null`.
2. Casa una forma del titular → `own` (`ownAccountId: null`, `matchedText` = la
   forma). Si no, casa un texto que **no** es texto de banco → `own` con esa
   cuenta. Primero por `ownAccountId` ascendente y luego por el texto más largo,
   para que el resultado sea estable.
3. Si no, casa solo textos de banco:
   - con `transferId !== null` o `excludedFromTotals` → sin reading (R8);
   - si no → `doubtful`, `leavesTotals: false`, con la primera cuenta que casó.
4. Si no casa nada → sin reading.

**Texto de banco:** `normalizeOwnText(text)` igual a `normalizeOwnText(bank)` de
**cualquier** fila de `OwnAccount` (no solo la suya): si «N26» está como banco de
una fila, el texto «N26» deja dudoso en cualquier cuenta.

Casar es `(' ' + d + ' ').includes(' ' + t + ' ')`: palabras enteras, así «ing»
no casa dentro de «ingreso». Un texto o una forma con menos de 3 caracteres
normalizados se rechaza al guardarse (R3, R4), así que aquí no aparece.

## 4. Lectura (`own-accounts.service.ts`)

```ts
export async function readOwnership(prisma: AppPrismaClient): Promise<Map<number, OwnershipReading>>
```

Lee `OwnAccount` con sus textos, `AccountHolderName` y **todos** los movimientos
(`id, description, transferId, excludedFromTotals, ownershipDecision`) y llama a
`resolveOwnership`. Solo `findMany`. Si la tabla y la lista de formas están vacías,
devuelve el mapa con solo las decisiones (sin leer descripciones de más: atajo
permitido, no obligatorio). Medido el 2026-10-20: 1.667 movimientos en la base.

Como `readDepositMovements`, se calcula en cada lectura y no se guarda nada: un
movimiento importado después cuenta en la siguiente lectura (R13), y cambiar un
texto cambia el resultado al momento.

## 5. Las tres sumas

`isCountedExpense(movement, deposits, ownership)` y
`computeTotals(movements, deposits, ownership)` en `movements.service.ts` reciben
el mapa. Orden de `computeTotals`, sin cambiar lo que ya había:

1. Depósito → regla de la F57 (R9). `ownership` no se mira.
2. `ownership.get(id)?.leavesTotals === true` → no suma.
3. Lo de siempre: `excludedFromTotals`, `transferId`, `productId`, `neutral`,
   `income` / `expense`.

`isCountedExpense` añade `ownership.get(id)?.leavesTotals !== true`. Los tres
llamadores (`listMovements`, `getOverview`, `getRecurringExpenses`) añaden
`readOwnership(prisma)` a su `Promise.all`. Una sola regla, tres sitios que la
piden: no se copia la condición en ninguno.

## 6. `GET /api/movements` y `PATCH /api/movements/:id`

- `ListedMovement` gana `ownership: SerializedOwnership | null` (serializado de
  `OwnershipReading` sin `leavesTotals`), junto a `deposit`. Solo en el listado,
  como `deposit`; la respuesta de los `PATCH` lleva `ownershipDecision` (columna)
  y no `ownership`.
- Query `ownership: 'doubtful'` (enum de un valor, ampliable). `listMovements`
  lee `readOwnership` **antes** del `count` y, si viene el filtro, añade
  `id: { in: [ids dudosos] }` al `where` compartido, para que página, `total` y
  `totals` vean el mismo conjunto (R12).
- `updateMovementSchema` acepta `ownershipDecision: 'mine' | 'not_mine' | null`;
  `updateMovementBodyProperties` lo añade. `PATCH /api/movements` (varios a la
  vez) **no** lo acepta en esta feature: su lista de propiedades no cambia y
  sigue respondiendo 400 si llega.
- `serializeMovement` añade `ownershipDecision`.

## 7. Rutas nuevas (`/api/own-accounts`)

| Método | Ruta | Respuesta |
|---|---|---|
| `GET` | `/api/own-accounts` | `200` `{ ownAccounts: OwnAccountDto[] }`, orden `bank`, `name`, `id` |
| `POST` | `/api/own-accounts` | `201` `OwnAccountDto` |
| `PATCH` | `/api/own-accounts/:id` | `200` `OwnAccountDto`; `404` si no existe |
| `GET` | `/api/own-accounts/holder-names` | `200` `{ names: string[] }` en orden alfabético |
| `PUT` | `/api/own-accounts/holder-names` | `200` `{ names: string[] }` |

`OwnAccountDto`: `{ id, name, bank, accountNumber, type, openedAt, closedAt,
texts: string[], createdAt, updatedAt }` (fechas `YYYY-MM-DD`). `name` y `bank`
se guardan con `trim()`. `texts` repetidos dentro de la misma petición (iguales
una vez normalizados) se guardan una vez. `PATCH` con `texts` sustituye la lista
dentro de una transacción. Errores con las clases de `src/errors/app-error.ts`
(`ValidationError`, `NotFoundError`); cuerpo vacío o con propiedades extra → 400,
como `PATCH /api/movements/:id` (`src/lib/strict-body.ts`).

## 8. Lo medido en la base real (2026-10-20, solo lectura)

Con `SET default_transaction_read_only=on`, simulando en SQL la regla con unos
textos plausibles (formas completas de su nombre; los nombres de Trade Republic,
MyInvestor, Criptan, ING, N26, Openbank, Revolut y Bankinter como textos de banco;
los textos de la cartera y de dos fondos como textos propios):

- Movimientos que hoy cuentan y dejarían de contar: **0**. Dudosos nuevos: **0**.
- 39 parejas (78 piernas): ninguna cambia (la detección no se toca). 41 piernas
  casan con algo; da igual, ya no cuentan.
- 55 marcados a mano (no 53): 37 casarían como propios; 18 solo con un nombre de
  banco (serían dudosos sin la marca; con ella, no lo son: R8).

**No lo he comprobado** con los textos reales: dependen de lo que escriba el
humano. El reviewer no tiene que repetirlo; es para la hoja.

## 9. Documentos que la feature vuelve falsos

- `docs/api-contract.md`: modelo `OwnAccount`, sección de las rutas nuevas,
  campo `ownership` y filtro en `GET /api/movements`, `ownershipDecision` en el
  modelo `Movement` y en `PATCH /api/movements/:id`, y una sección «Movimientos
  entre tus cuentas en las sumas» enlazada desde los `totals` de `GET /api/movements`,
  `GET /api/overview` y `GET /api/recurring-expenses`.
- `docs/data-model.md` (lección #2).
- `docs/architecture.md`: ADR-040 — «Si un movimiento es entre cuentas propias se
  decide al leer, con los textos que escribe el humano y nunca con el nombre del
  banco solo; lo único que se guarda es su decisión».
- `README.md`: las cinco filas de rutas nuevas y la mención de `ownershipDecision`
  en `PATCH /api/movements/:id`.
- Comentarios de `prisma/schema.prisma` en `Movement` (`excludedFromTotals`,
  `productId`, la nueva columna) y de `computeTotals` / `isCountedExpense`.

## 10. Alternativa descartada (diseño)

**Guardar el reconocimiento en una columna del movimiento**, escrita al importar y
reescrita al cambiar la tabla. Descartada: obliga a una pasada sobre toda la base
cada vez que el humano toca un texto, y a acordarse de llamarla en los dos sitios
(importar y editar la tabla); si una se olvida, las sumas salen mal sin aviso,
que es justo lo que la feature quiere quitar. Calcular al leer es lo que ya hace
la regla de depósitos (ADR-035) y cuesta una lectura de 1.667 descripciones.
