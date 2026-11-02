# Resumen — feature 66 `import-statement-all-or-nothing`

Fecha de cierre: 2026-11-02
Intención original: `feature_list.json` → feature `import-statement-all-or-nothing`, bloque `intent`
Spec (SDD): `specs/66-import-statement-all-or-nothing/`

## Qué hace ahora la app que antes no

Cuando un extracto falla al importarse, ya no deja nada a medias en la base: ni
sus movimientos, ni la cuenta si se creó con él, ni el ancla si la fijó él, ni
los saldos que rellenó, ni sus avisos. Antes el archivo salía `failed` pero lo
que ya había escrito se quedaba. Los demás archivos de la misma importación que
entraron bien se quedan.

## Por dónde se toca (puntos de entrada)

| Cómo se usa | Código |
| --- | --- |
| `POST /api/import` — importa los pendientes de Drive | [import.routes.ts:56](../../src/modules/import/import.routes.ts#L56) |
| Bucle de archivos de una importación | [import.service.ts:351](../../src/modules/import/import.service.ts#L351) → `importPending` |
| Un extracto: abre la transacción del archivo | [import.service.ts:710](../../src/modules/import/import.service.ts#L710) → `importStatement` |
| Tiempo máximo de esa transacción (60 s) | [import.service.ts:693](../../src/modules/import/import.service.ts#L693) → `STATEMENT_TRANSACTION_TIMEOUT_MS` |

## Dónde está el código

### La transacción por archivo

| Qué hace | Dónde |
| --- | --- |
| Tipo del cliente que reciben las funciones de dentro de la transacción | [prisma.ts](../../src/lib/prisma.ts) → `TransactionClient` |
| Pasos de la cuenta a los avisos dentro de `$transaction`, parseo fuera | [import.service.ts](../../src/modules/import/import.service.ts) → `importStatement` |
| Informe de un extracto fallido: sin cuenta y contadores a cero | [import.service.ts](../../src/modules/import/import.service.ts) → `failedStatementResult` |

### Funciones que pasan a recibir el cliente de la transacción (cuerpo igual)

| Qué hace | Dónde |
| --- | --- |
| Encuentra o crea la cuenta del extracto | [import.service.ts](../../src/modules/import/import.service.ts) → `resolveAccount` |
| Crea la cuenta por IBAN | [accounts.service.ts](../../src/modules/accounts/accounts.service.ts) → `findOrCreateAccountFromMetadata` |
| Guarda los movimientos y rellena saldos vacíos | [import.service.ts](../../src/modules/import/import.service.ts) → `persistMovements`, `backfillMissingBalances` |
| Lee y fija el ancla | [import.service.ts](../../src/modules/import/import.service.ts) → `readStoredAnchor`, `anchorAccountIfMissing`, `readAccountAnchor` |
| Comprobación del saldo del preámbulo | [import.balance.service.ts](../../src/modules/import/import.balance.service.ts) → `StatementBalanceCheckDeps`, `findStatementBalanceMismatch` |
| Guarda los avisos, ya sin transacción propia | [import.warnings.service.ts](../../src/modules/import/import.warnings.service.ts) → `persistImportWarnings` |

### Tests

| Qué cubre | Dónde |
| --- | --- |
| Ayudante que mete un fallo dentro de la transacción y anota sus opciones | [import.service.test.ts](../../src/modules/import/import.service.test.ts) → `insideStatementTransaction`, `txWhere` |
| Los dos ayudantes existentes adaptados (decisión 5) | [import.service.test.ts](../../src/modules/import/import.service.test.ts) → `recordingPrisma`, `prismaThatCannotStoreWarnings` |
| R1-R12 | [import.service.test.ts](../../src/modules/import/import.service.test.ts) → `describe('importStatement is all or nothing per file (feature 66)')`, tests `F66 R1` … `F66 R12` |

### Documentos

| Qué dice | Dónde |
| --- | --- |
| Estado `failed` y la excepción de mover a `procesados/` | [api-contract.md](../../docs/api-contract.md) → §`POST /api/import` |
| ADR-042 y la nota en el punto 5 del ADR-031 | [architecture.md](../../docs/architecture.md) |
| Cabo 26 cerrado, F66 en E5, deber de la prueba real | [roadmap.md](../../docs/roadmap.md) |

## Cumplimiento de la intención

- ✅ «Si falla la comprobación de saldo, el archivo sale failed, no se mueve a
  procesados/ y no queda ningún movimiento suyo» → `F66 R1 rolls back every
  movement of a file whose preamble check throws`. Check: ✅ (1 passed).
- ✅ «Si falla el guardado de avisos, igual» → `F66 R2 rolls back every movement
  of a file whose warnings cannot be stored` (también 0 avisos). Check: ✅ (1 passed).
- ✅ «Si la cuenta se creó con ese archivo, tampoco queda» → `F66 R3 removes the
  account a failed file had just created`. Check: ✅ (1 passed).
- ✅ (añadido) «Si el ancla se fijó con ese archivo, tampoco queda» → `F66 R4
  leaves unanchored the account a failed file had anchored`. Check: ✅ (1 passed).
- ✅ (añadido) «Con varios archivos, el fallo de uno no deshace los que entraron»
  → `F66 R8 keeps the files of the same run that were imported`. Check: ✅ (1 passed).
- ✅ «Un archivo que se importa bien sigue guardando lo mismo que hoy» → suite de
  `src/modules/import` y `src/modules/accounts` sin aserciones cambiadas. Check: ✅
  (208 passed).
- ✅ «La suite pasa» → `pnpm test`. Check: ✅ (1501 passed, 91 archivos).

## Decisiones que se tomaron por ti

- (delegado) Una transacción por archivo, no una por importación.
- (añadido) Un descuadre sigue sin hacer fallar el archivo; solo lo deshace que la
  comprobación no se pueda hacer (R10, hoja 🔴 1).
- (añadido) Si lo único que falla es mover a `procesados/`, lo guardado se queda
  (R11, hoja 🔴 2).
- (añadido) Un extracto fallido se informa sin cuenta y con todo a cero (R7, hoja 🔴 3).
- (añadido) Las filas ilegibles de un archivo fallido no se guardan como aviso (R6,
  hoja 🔴 4).
- (añadido) Tiempo máximo de 60 s por transacción (R12); no está medido con datos
  reales.

## Qué NO se tocó / quedó fuera

- La importación de archivos de producto (`importProductFile`), `prisma/` y
  `src/modules/investments/`.
- Lo que va después de todos los archivos (traspasos, reglas de categoría, cierre a
  `Otros gastos` / `Otros ingresos`): sigue igual y fuera de la transacción.
- La prueba con datos reales: está en `docs/roadmap.md` §Deberes tuyos pendientes.

## Notas para el futuro

- `src/modules/investments/investments.service.ts` mantiene su propio alias
  `TransactionClient`, igual al de `src/lib/prisma.ts`.
- `docs/api-contract.md` §Totales dice que un archivo `failed` no suma a
  `anchoredCount` ni a `balanceFilledCount`; no es así cuando lo único que falló
  fue mover a `procesados/`. Ya pasaba antes de esta feature.
