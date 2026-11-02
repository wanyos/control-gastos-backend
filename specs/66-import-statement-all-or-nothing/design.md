# Design — F66 `import-statement-all-or-nothing`

## 1. Lo que hay hoy (comprobado en el código el 2026-11-02)

`importStatement` (`src/modules/import/import.service.ts`, línea 695) hace, en
este orden y cada paso con el cliente global (`deps.prisma`):

| Paso | Función | Escribe | ¿Abre transacción propia? |
|---|---|---|---|
| 1 | `adapter.parse` + `assertTheFileBringsMovements` | — | — |
| 2 | `resolveAccount` → `findOrCreateAccountFromMetadata` (`accounts.service.ts:213`) | `account.create` | no |
| 3 | `persistMovements` → `backfillMissingBalances` | `movement.createMany`, `movement.updateMany` por fila | no |
| 4 | `readStoredAnchor` | — (lee) | no |
| 5 | `anchorAccountIfMissing` | `account.updateMany` | **no** |
| 6 | `readAccountAnchor` | — (lee) | no |
| 7 | `findPerLineMismatches` (pura) + `findStatementBalanceMismatch` (`import.balance.service.ts:179`) | — (lee `movement.findMany`) | no |
| 8 | `persistImportWarnings` (`import.warnings.service.ts:90`) | `upsert` en las dos tablas de avisos | **sí**: `prisma.$transaction(writes)` (forma de lista) |

Diferencias con lo que estimaba el cabo 26:

- Son **nueve** funciones las que tienen que aceptar el cliente de transacción, no
  ocho: `resolveAccount`, `findOrCreateAccountFromMetadata`, `persistMovements`,
  `backfillMissingBalances`, `readStoredAnchor`, `anchorAccountIfMissing`,
  `readAccountAnchor`, `findStatementBalanceMismatch` (por
  `StatementBalanceCheckDeps.prisma`) y `persistImportWarnings`.
- La que abre su propia transacción **no** es `anchorAccountIfMissing` (es un
  único `updateMany`), sino `persistImportWarnings`. El cliente de transacción de
  Prisma no tiene `$transaction` (`TransactionClient = Omit<…, ITXClientDenyList>`
  en `src/generated/prisma/internal/prismaNamespace.ts:2032`), así que esa es la
  única de las nueve que cambia de comportamiento; las otras ocho solo cambian el
  tipo del parámetro.

No hay en la base ningún registro de las ejecuciones de importación (los modelos
de `prisma/schema.prisma` son `Account`, `Category`, `CategoryRule`, `Movement`,
`InvestmentProduct`, `Valuation`, `SavingsSnapshot`, `ImportUnparsedRow`,
`ImportBalanceMismatch`, `OwnAccount`, `OwnAccountText`, `AccountHolderName`): el
informe solo vive en la respuesta HTTP. No hay nada que conservar fuera de la
transacción.

## 2. Qué cambia

### 2.1 Un tipo compartido para «cliente o transacción»

En `src/lib/prisma.ts`:

```ts
/** The client handed to the callback of an interactive transaction (no `$transaction`). */
export type TransactionClient = Parameters<Parameters<AppPrismaClient['$transaction']>[0]>[0]
```

Es la misma expresión que ya usa `src/modules/investments/investments.service.ts:250`
como alias local. **No** se cambia ese archivo (importación de productos, fuera de
alcance). `AppPrismaClient` es asignable a `TransactionClient` (es el mismo
cliente sin unos métodos), así que los llamantes actuales que pasan `app.prisma`
siguen compilando sin cambios.

### 2.2 Las ocho funciones que solo cambian de tipo

El primer parámetro (o el campo `prisma` de `StatementBalanceCheckDeps`) pasa de
`AppPrismaClient` a `TransactionClient`. Cuerpo idéntico:

- `resolveAccount(prisma: TransactionClient, statement, bankSlug)`
- `findOrCreateAccountFromMetadata(prisma: TransactionClient, meta)` (`src/modules/accounts/accounts.service.ts`)
- `persistMovements(prisma: TransactionClient, rows)`
- `backfillMissingBalances(prisma: TransactionClient, rows)`
- `readStoredAnchor(prisma: TransactionClient, accountId)`
- `anchorAccountIfMissing(prisma: TransactionClient, accountId, anchor)`
- `readAccountAnchor(prisma: TransactionClient, accountId)`
- `StatementBalanceCheckDeps.prisma: TransactionClient` (`src/modules/import/import.balance.service.ts`)

Ninguna otra función cambia. `ImportStatementDeps.prisma` sigue siendo
`AppPrismaClient` (necesita `$transaction`).

### 2.3 `persistImportWarnings` deja de abrir su transacción

Firma: `persistImportWarnings(prisma: TransactionClient, file, warnings): Promise<void>`.
Hace los mismos `upsert`, con los mismos `where` / `create` / `update`, pero uno
detrás de otro con `await` en un `for`, sin `prisma.$transaction(writes)`. Un
archivo sin avisos sigue sin escribir nada (F48 R8).

El «o todos o ninguno» de los avisos de un archivo (ADR-031 punto 5) pasa a
garantizarlo la transacción de `importStatement`, que es su único llamante de
producción. Los tests de `import.warnings.service.test.ts` y
`import.warnings.routes.test.ts` la llaman con `app.prisma` como escritor de
datos de prueba; ninguno comprueba la atomicidad (leído: sus 15 casos son R1, R2,
R6-R13 de la F48 y los de la F54), así que siguen igual.

Comentario JSDoc de la función: se corrige la frase «in a single transaction»
por «inside the transaction of its caller (`importStatement`, feature 66)».

### 2.4 `importStatement` abre una transacción por archivo

Estructura nueva (pseudocódigo; los comentarios largos que ya hay se conservan,
incluido el 🔴 de «READ BEFORE ANCHORING»):

```ts
export async function importStatement(deps: ImportStatementDeps): Promise<StatementResult> {
  const result = emptyStatementResult()
  try {
    const statement = await deps.adapter.parse(deps.content)
    result.unparsedRows = statement.unparsedRows
    result.unparsedCount = statement.unparsedRows.length
    assertTheFileBringsMovements(statement)

    await deps.prisma.$transaction(
      async (tx) => {
        // pasos 2-8 de la tabla, idénticos, con `tx` en vez de `deps.prisma`,
        // escribiendo en `result` como hoy
      },
      { timeout: STATEMENT_TRANSACTION_TIMEOUT_MS },
    )

    result.status = 'imported'
    return result
  } catch (error) {
    return failedStatementResult(result, error)   // R7
  }
}
```

- `const STATEMENT_TRANSACTION_TIMEOUT_MS = 60_000` (R12), constante del módulo
  con un comentario de por qué (el valor por defecto de Prisma 7 es 5 000 ms y
  `backfillMissingBalances` hace una consulta por fila al reimportar).
- `maxWait` e `isolationLevel` se dejan en su valor por defecto: los archivos se
  importan de uno en uno, nadie espera conexión.
- El parseo y `assertTheFileBringsMovements` quedan **fuera** de la transacción:
  no escriben, y así un archivo vacío o ilegible no abre ninguna.
- `failedStatementResult(result, error)`: función privada nueva que devuelve
  `{ ...emptyStatementResult(), unparsedRows: result.unparsedRows, unparsedCount: result.unparsedCount, status: 'failed', error: describeError(error) }` (R7).
- `importDriveFile` **no cambia**: mueve a `procesados/` solo si `store` devolvió
  `imported`, y eso ocurre ya con la transacción confirmada (R11). El test
  existente «moves the file to procesados only after its movements are stored
  (R9)» lee con `app.prisma` en el momento de mover y exige ver los movimientos:
  solo pasa si la confirmación va antes de mover.

### 2.5 Concurrencia y anclaje

`anchorAccountIfMissing` mantiene su `WHERE balanceAnchor: null`: dentro de una
transacción en el nivel por defecto de Postgres (lectura confirmada) sigue
impidiendo que dos importaciones a la vez anclen dos importes distintos. Dos
importaciones simultáneas que crean la misma cuenta siguen chocando con el índice
único de `iban` y una sale `failed`, como hoy; ahora además sin dejar nada.

`findStatementBalanceMismatch` y `readAccountAnchor` leen dentro de la
transacción y ven lo que el propio archivo acaba de escribir sin confirmar; hoy
lo veían porque ya estaba confirmado. Mismo resultado (R9, R10).

## 3. Errores

Ninguno nuevo. Un error dentro de la transacción la deshace y llega al `catch`
de `importStatement` igual que hoy (`describeError`). Si salta el `timeout`,
Prisma lanza su propio error; sale como `INTERNAL_SERVER_ERROR` con su mensaje,
igual que cualquier error que no es `AppError`.

## 4. Documentos

- `docs/api-contract.md`, `POST /api/import`: en la tabla de estados, `failed`
  añade «y no deja nada guardado de ese archivo»; el punto «En un archivo `failed`
  no se ancla ni se rellena nada» pasa a decir que tampoco quedan sus
  movimientos, ni la cuenta si se creó con él, ni avisos, y que el informe lo
  lleva con `account: null` y contadores a cero; excepción: si lo único que falla
  es moverlo a `procesados/`, lo guardado se queda. En §Lo que una importación
  deja sin resolver, «si el guardado falla, ese archivo sale `failed`» añade «y
  no queda nada de él». No tocar las frases que lee
  `src/modules/import/import.warnings.docs.test.ts`.
- `docs/architecture.md`: **ADR-042** nuevo (un extracto se guarda en una
  transacción por archivo; contexto = cabo 26; decisión = §2.4; alternativas = §6;
  consecuencias = R7, R11, `persistImportWarnings` sin transacción propia,
  timeout 60 s). En ADR-031 punto 5, una línea que remite a ADR-042.
- `docs/roadmap.md`: cabo 26 tachado, «✅ cerrado por la F66 (fecha)»; en la fila
  E5 de la tabla de etapas, añadir la F66; en «Deberes tuyos pendientes», la
  prueba con datos reales (ver hoja 📌).

## 5. Tests

### 5.1 Cómo se provoca el fallo dentro de la transacción

Los ayudantes de test actuales envuelven `app.prisma` con un `Proxy` que cambia
un método de un modelo. Con la F66 las escrituras van por el `tx` que Prisma
pasa al callback de `$transaction`, que no es el `Proxy`. Por eso:

- Ayudante nuevo en `import.service.test.ts`:
  `insideStatementTransaction(prisma, wrap: (tx) => tx): AppPrismaClient` —
  devuelve un `Proxy` de `prisma` cuyo `$transaction(fn, options)` llama al real
  con `(tx) => fn(wrap(tx))`, y anota las `options` recibidas (para R12).
- Fallos: `wrap` devuelve un `Proxy` del `tx` donde
  `importUnparsedRow.upsert` lanza (R2, R3, R4, R5, R6) o donde
  `movement.findMany` lanza (solo lo usa `findStatementBalanceMismatch` dentro de
  `importStatement`: R1, R8).

### 5.2 Los dos ayudantes existentes que se adaptan (sin tocar aserciones)

- `recordingPrisma` (línea ~2145) — test «hands the preamble check the anchor
  from BEFORE this file anchored the account (R4)». Pasa a aplicar su `Proxy` de
  `account` también al `tx`, usando `insideStatementTransaction`.
- `prismaThatCannotStoreWarnings` (línea ~2971) — test «reports the file as
  failed and does not move it when storing its warnings fails (R5)». Pasa a romper
  `importUnparsedRow.upsert` del `tx`, usando `insideStatementTransaction`.

Las aserciones (`expect`) de esos dos tests no cambian. Los demás `Proxy` de
`import.service.test.ts` (≈2626, ≈2889) y de `import.routes.test.ts` (≈316)
interceptan pasos que van **después** del bucle de archivos y fuera de la
transacción: no se tocan.

### 5.3 Tests nuevos (nombres exactos; los usan los `checks`)

Un `describe('importStatement is all or nothing per file (feature 66)')` al
final de `import.service.test.ts`, con `uniqueBank()` / `syntheticIban()` como
los bloques vecinos y su `afterAll` de limpieza:

| Nombre | Cubre | Montaje |
|---|---|---|
| `F66 R1 rolls back every movement of a file whose preamble check throws` | R1 | Cuenta creada y anclada a mano; extracto con `accountBalance` y movimientos posteriores al ancla; `movement.findMany` del `tx` lanza. Se comprueba `failed`, `update` de Drive sin llamar, 0 movimientos con su `description` |
| `F66 R2 rolls back every movement of a file whose warnings cannot be stored` | R2, R6 | Cuenta existente; extracto con 2 movimientos y 1 fila ilegible; `importUnparsedRow.upsert` lanza. 0 movimientos, 0 avisos de ese `bank` |
| `F66 R3 removes the account a failed file had just created` | R3 | IBAN nuevo; mismo fallo de avisos. `account.findUnique({ where: { iban } })` es `null` |
| `F66 R4 leaves unanchored the account a failed file had anchored` | R4 | Cuenta sin ancla; extracto con `accountBalance`; fallo de avisos. Tres columnas del ancla en `null` |
| `F66 R5 leaves empty the balances a failed file had filled` | R5 | Movimiento guardado antes con `balanceAfter: null`; el extracto lo trae con saldo y una fila ilegible; fallo de avisos. `balanceAfter` sigue `null` |
| `F66 R7 reports a failed file with no account and zero counters` | R7 | El de R3; el informe lleva `account: null`, `imported: 0`, `duplicates: 0`, `balancesFilled: 0`, `anchored: false`, `balanceMismatches: []`, `unparsedCount: 1` |
| `F66 R8 keeps the files of the same run that were imported` | R8 | Una llamada a `importPending` con tres archivos de la misma cuenta: el 1.º ancla (sin ancla previa no consulta `movement.findMany`), el 2.º trae `accountBalance` y falla en la comprobación, el 3.º es de **otra** cuenta sin ancla. 1.º y 3.º `imported` con sus movimientos; del 2.º, nada |
| `F66 R10 still imports a file whose preamble does not match` | R10 | Sin fallo provocado; descuadre real; `imported` y un `ImportBalanceMismatch` guardado |
| `F66 R11 keeps what a statement stored when only its move to procesados fails` | R11 | `update` de Drive lanza; `failed`, `movedToProcessed: false`, movimientos guardados |
| `F66 R12 opens the transaction of a statement with a 60 second timeout` | R12 | `insideStatementTransaction` con `wrap` identidad; las `options` anotadas tienen `timeout: 60000` |

R9 lo cubre la suite existente de `src/modules/import/` y `src/modules/accounts/`
sin cambiar aserciones.

Ningún fixture nuevo: todo con `fakeAdapter` y datos inventados (el guardián
`src/no-real-data.test.ts` sigue en verde).

## 6. Alternativas descartadas

- **Una transacción por llamada a `POST /api/import`** (todos los archivos o
  ninguno). Descartada: contradice la decisión aprobada «solo se deshace lo del
  archivo que falla», y una llamada con muchos archivos tendría la base bloqueada
  minutos y mezclaría Drive dentro de la transacción.
- **Mover a `procesados/` dentro de la transacción** (si Drive falla, se deshace
  la base). Descartada: si Drive mueve y luego la confirmación falla, el archivo
  queda en `procesados/` sin nada guardado, que no se ve y no se reintenta solo;
  es peor que lo de hoy. Además rompe el test existente de mover después de
  guardar (R9).
- **Borrar a mano lo escrito si algo falla** (sin transacción). Descartada: hay
  que saber qué filas eran nuevas y cuáles duplicadas, qué `balanceAfter` se
  rellenaron y si la cuenta se creó; y un fallo en el propio borrado deja otra vez
  la base a medias.
- **Que `persistImportWarnings` decida si abre transacción según el cliente que
  recibe.** Descartada: una función que se comporta distinto según el tipo del
  cliente es más difícil de leer que «la transacción la pone quien llama», y no
  tiene otro llamante de producción.
- **Dejar el valor por defecto de 5 s.** Descartada: no está medido con un
  extracto real grande y convertiría en fallo una reimportación que hoy entra.
