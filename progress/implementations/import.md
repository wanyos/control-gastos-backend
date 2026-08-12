# import (F12) — implementación

> Spec: [`specs/import/`](../../specs/import/) — 20 requirements, 31 tasks en
> cuatro lotes. **Las 31 marcadas `[x]`.** Sin commits: el árbol queda listo para
> que el humano commitee después del reviewer.
>
> El **lote C (renombrado `ingesta` → `ingestion`)** se hizo aparte y es
> autocontenido: `git mv` + reescritura de símbolos y prosa + `app.ts` +
> guardianes. Se puede leer (y commitear) sin mezclarlo con la lógica nueva.

## Archivos modificados / creados

**Nuevos** — `src/modules/import/`:

| Archivo | Qué es |
|---|---|
| [`import.types.ts`](../../src/modules/import/import.types.ts) | `BankParserAdapter` / `BankParserRegistry` + informe (`ImportRunResult`, `SkippedFileReport` \| `AttemptedFileReport`) |
| [`import.service.ts`](../../src/modules/import/import.service.ts) | `toMovementRows` (pura), `resolveAccount`, `persistMovements`, `importPending` |
| [`import.routes.ts`](../../src/modules/import/import.routes.ts) | `POST /api/import`, con `parsers` y `rawCopyBaseDir` inyectables |
| `import.service.test.ts` | doble de Drive + BD real (20 tests) |
| `import.routes.test.ts` | `app.inject()` sobre app desnuda + BD real (3 tests) |

**Renombrados con `git mv`** (git los reporta como `R`, historial conservado):
`src/modules/ingesta/` → [`src/modules/ingestion/`](../../src/modules/ingestion/),
y sus cinco archivos `ingesta.*` → `ingestion.*`. Símbolos: `ingestaRoutes` →
`ingestionRoutes`, `IngestaRoutesOptions` → `IngestionRoutesOptions`.

**Modificados**:
[`myinvestor.statement.parser.ts`](../../src/modules/myinvestor/myinvestor.statement.parser.ts)
(+ su test), [`app.ts`](../../src/app.ts),
[`architecture.test.ts`](../../src/architecture.test.ts),
[`ingestion.service.ts`](../../src/modules/ingestion/ingestion.service.ts) (deja
de mover), `ingestion.types.ts`, `ingestion.routes.ts` y sus dos tests,
[`docs/api-contract.md`](../../docs/api-contract.md),
[`docs/architecture.md`](../../docs/architecture.md),
[`docs/roadmap.md`](../../docs/roadmap.md),
[`docs/conventions.md`](../../docs/conventions.md),
[`docs/dar-de-alta-un-banco.md`](../../docs/dar-de-alta-un-banco.md),
[`specs/import/tasks.md`](../../specs/import/tasks.md).

**No tocados**, como mandaba el design: `prisma/schema.prisma` (sin migración),
el parser de Bankinter, `movements.*`, `categories.*`, `var/drive-read/`.

## Trazabilidad (R → test)

| R | Test que lo cubre |
|---|---|
| R1 | `import.service.test.ts` → `maps a parsed movement to a movement row of its account` (unitario puro) + `stores every field of the mapping, ordered and enriched by nobody (R1, R12, R16)` (BD real) |
| R2 | `import.routes.test.ts` → `returns 200 with the report of every file (R2)`; totales por fichero también en `saves the good rows of a partial import…` |
| R3 | `import.routes.test.ts` → `lists the imported movements most recent first (R3)` |
| R4 | `creates the account from the iban of the file and reports the defaults used (R4)` |
| R5 | `uses the single account already registered for the bank when the file has no iban (R5)` |
| R6 | `fails with MISSING_ACCOUNT_DATA and creates no account when the bank has none (R6, R19)` + `…when the bank has more than one account (R6)` |
| R7 | `reimports the same file without duplicating anything, and reports what it dropped (R7, R13)` |
| R8 | `stores three identical lines of the same day as three movements (R8)` |
| R9 | `moves the file to procesados only after its movements are stored (R9)` — el doble de `files.update` **consulta la BD en el momento del movimiento** y comprueba que las dos filas ya estaban |
| R10 | `does not move a file whose import failed and goes on with the rest (R10)` + `sanitizes a download failure instead of leaking the token (R10)` |
| R11 | `saves the good rows of a partial import, counts the unparsed ones and moves it anyway (R2, R11)` |
| R12 | `keeps a balance the file does not carry as null and defaults an empty currency` (puro) + la aserción `balanceAfter === null` de `stores every field of the mapping…` |
| R13 | `reimports the same file… (R7, R13)`: compara **fila a fila** el estado de la BD antes y después de la segunda pasada (mismos ids, mismos valores) |
| R14 | `skips a file with no parser or an unsupported extension, importing and moving nothing (R14)` + guardián `keeps the importer free of bank knowledge: the registry is injected (R14)` |
| R15 | `ingestion.service.test.ts` → `copies each pending file locally WITHOUT moving the original (R15)` y `stays idempotent: a second run rewrites the same copy and still moves nothing (R15)`; `ingestion.routes.test.ts` → `returns 200, writes the local copy and does NOT move the original (R15)` |
| R16 | aserciones de campos a `null` en `maps a parsed movement…` y `stores every field of the mapping… (R1, R12, R16)`; superficie API en `import.routes.test.ts` → `exposes no way to create or delete a movement by API (R16)`; guardián existente `keeps the movements module read-only` |
| R17 | `creates no InvestmentProduct nor Valuation while importing (R17)` |
| R18 | `myinvestor.statement.parser.test.ts` → `reads the iban from the labelled preamble line`, `tolerates trailing semicolons, spaces and casing…`, `returns null when the iban line is absent, empty or below the header`, `does not let the iban line reach unparsedRows nor the movements`, `reads the iban of a file written with the UTF-8 BOM Excel adds` |
| R19 | `never creates an account without iban, whatever the file brings (R19)` + `fails with MISSING_ACCOUNT_DATA and creates no account… (R6, R19)` + guardián `never creates an account from the importer: only the accounts service does (R19)` |
| R20 | `ingestion.routes.test.ts` → `GET /api/ingesta/pending returns 404…`, `POST /api/ingesta/process returns 404…` y `registers the same capabilities under /api/ingestion/*`; guardián `has no src/modules/ingesta/ directory` |

**El test R20 de la F10 sigue intacto y en verde**
(`emits accountIban null without inferring it from an IBAN-shaped concept (R20)`,
`myinvestor.statement.parser.test.ts`): no se ha tocado ni una línea de él. Los
casos nuevos del IBAN se añadieron en un `describe` aparte.

## Decisiones tomadas (todas dentro del design, ninguna abre comportamiento)

1. **`ImportedFileReport` es una unión discriminada**, no un objeto con campos
   opcionales: `skipped` lleva `reason` y no lleva contadores; `imported`/`failed`
   llevan cuenta, contadores y `unparsedRows`. Es literalmente la forma de los tres
   ejemplos del design §9, y así el tipo impide construir un informe a medias.
2. **`procesados/` se resuelve de forma perezosa**, una vez por año pero **solo
   cuando un fichero llega de verdad al movimiento**. El design decía «una vez por
   año»; hacerlo perezoso evita crear la carpeta en Drive para un año cuyos
   ficheros son todos `skipped`, que sería una escritura en Drive por un fichero
   que explícitamente no se toca (R14). Comprobado en el test de `skipped`.
3. **`describeError` se duplica en el módulo** (8 líneas) en vez de importarse de
   `ingestion/`: el importador no debe depender del módulo de ingesta. Aquí además
   devuelve `{ code, message }`, porque el informe necesita el código estable.
   `code` es el del `AppError`; cualquier otra cosa sale como
   `INTERNAL_SERVER_ERROR`.
4. **`importDb(app)`** como en el resto de módulos, para que `import.routes.ts` no
   nombre `prisma` — coherencia con `accounts`/`movements`, aunque el guardián
   actual no lo exige para este módulo.
5. **El IBAN se recorta pero no se normaliza en el parser**: la normalización
   (mayúsculas, sin espacios) es de `accounts.service`, que ya la hace. Un IBAN de
   solo espacios cuenta como «no hay IBAN» (test explícito).
6. **`resolveAccount` usa `statement.bank || bankSlug`** para dar de alta: el banco
   lo manda la carpeta para *elegir parser* (ADR-009), y el del parser solo se usa
   para *crear la cuenta*; el `|| bankSlug` es la red por si un parser emitiera
   `''`, para no llegar nunca a `MissingAccountDataError` por un motivo equivocado.
7. **Los tests usan un slug de banco propio por test** (`zz-import-<ts>-<n>`) y
   cuentan cuentas **solo de ese banco**. Primer intento con `account.count()`
   global: falló en la suite completa porque Vitest corre los archivos en paralelo
   y otro test creaba cuentas a la vez. Queda anotado porque es una trampa que se
   repetirá.

## Qué debería mirar el reviewer con lupa

- **Ninguna cuenta sin IBAN (R19).** Hay tres redes: el código (única vía de alta
  es `findOrCreateAccountFromMetadata`), el test de invariante y el guardián de
  arquitectura que prohíbe `account.create` en `src/modules/import/`. Merece la
  pena confirmar que no queda ninguna cuarta vía.
- **El orden guardar → mover (R9)** se comprueba consultando la base de datos
  *dentro* del doble de `files.update`. Es el punto más sutil del test suite; si
  se cambia el flujo, ese test es el que lo detecta.
- **`skipDuplicates` contra el índice PARCIAL.** Funciona porque Prisma emite
  `ON CONFLICT DO NOTHING` **sin target**. Si alguien lo cambia por un
  `createMany` con target o por un `create` en bucle, R7 y R13 se rompen.
- **El renombrado toca los guardianes de arquitectura**, no los desactiva: el árbol
  objetivo lista `modules/ingestion/*` y `modules/import/*`, y se añadió el
  guardián `has no src/modules/ingesta/ directory`. Los dos guardianes nuevos
  (`sin nombre de banco` y `sin account.create`) descubren los módulos de banco
  leyendo el árbol, no con una lista escrita a mano.
- **Breaking change de contrato** documentado en `docs/api-contract.md`:
  `/api/ingesta/*` → 404 y `POST /api/ingestion/process` ya no mueve. Hoy sin
  consumidor.
- **`daySequence` numera solo filas parseadas** (ADR-013): límite conocido, anotado
  en ADR-015 y en el roadmap como cabo suelto nº 10, **sin dueño**. No se arregla
  aquí.

## Último `./init.sh`

```
── 4. Type checking (tsc) ──  [OK] Type check OK (tsc sin errores)
── 5. Ejecutando tests ─────  Test Files 24 passed (24) · Tests 316 passed (316)
── 6. Resumen ──────────────  [OK] Entorno listo. Puedes empezar a trabajar.
```

Además, fuera de `init.sh`: `pnpm run lint` sin errores y `pnpm run format:check`
→ *All matched files use Prettier code style!*.

De 280 tests a **316** (+36): 20 del servicio del importador, 3 de sus rutas, 5
del IBAN del preámbulo, 5 del renombrado/no-mover y 3 guardianes de arquitectura.

## Sugerencias fuera de scope (NO aplicadas)

1. **`ProcessedFile`/`processedCount` de la ingesta se llaman igual pero ya no
   significan «procesado»**, sino «descargado y copiado». El comentario se
   actualizó (lo pedía T22) pero **el nombre del campo no**, porque cambiarlo es un
   segundo breaking change de contrato que el spec no autoriza. Candidato a una
   feature de limpieza junto al frontend.
2. **`GET /api/import/status`** o un `dryRun`: hoy la única forma de saber qué
   haría la importación es ejecutarla. Con `POST /api/ingestion/process` +
   `GET /api/ingestion/pending` se cubre a medias.
3. **El informe podría traer la ruta relativa de la copia cruda** (como hace la
   ingesta con `path`), útil para depurar un fichero que falló. No está en R2.
4. **Un `$transaction` que envuelva `createMany` + `moveFileToProcessed`** no es
   posible (Drive no es transaccional), pero sí se podría reintentar el movimiento
   fallido en la pasada siguiente: hoy el fichero queda con sus movimientos
   guardados y sin mover, y la reimportación lo resuelve por dedup (0 nuevos, n
   duplicados) antes de moverlo. Funciona, pero es un camino que conviene que el
   humano conozca.

---

## Correcciones tras la revisión (`CHANGES_REQUESTED`, 2026-08-12)

Ver [`progress/reviews/import.md`](../reviews/import.md). De los tres bloqueantes,
el tercero (`progress/current.md`) lo lleva el leader; aquí van los otros dos.

### 1. El IBAN real del humano estaba versionado — corregido

El IBAN que traía el spec era **el real del humano** (checksum válido, y el propio
spec se lo atribuye). Sustituido por **`ES9121000418450200051332`**, el IBAN de
ejemplo público de la documentación española: checksum válido y de nadie. **Aquí
tampoco se repite el número viejo**, por el mismo motivo por el que se ha quitado
de los tests; si hiciera falta buscarlo, `git log --all -S` no lo encuentra porque
nunca llegó a un commit.

- **Comprobado antes de tocar nada:** `git log --all -S"<iban>"` **no devuelve
  ningún commit**. El número vivía **solo en el árbol de trabajo**, así que basta
  con cambiarlo: **no se ha reescrito historia de git** (ni hacía falta ni se
  habría hecho).
- **13 ocurrencias en 6 archivos**, todas sustituidas:
  `src/modules/myinvestor/myinvestor.statement.parser.test.ts` (7),
  `docs/dar-de-alta-un-banco.md` (1), `specs/import/decisions.md` (1),
  `specs/import/design.md` (1), `specs/import/requirements.md` (1),
  `progress/reviews/import.md` (2 — el propio informe del reviewer lo repetía).
- **Verificado a nivel de workspace** (`control-gastos/` entero, incluido el
  frontend): **cero ocurrencias**.
- **El porqué queda escrito en tres sitios**, para que no vuelva a pasar:
  - regla nueva en [`docs/conventions.md`](../../docs/conventions.md) §Tests —
    «ningún dato real en un fixture», **incluidos los del propio dueño del
    proyecto**, aunque los pegue él mismo en una conversación: un archivo de test
    se versiona, se comparte y lo leen herramientas, y a un fixture solo se le pide
    estar **bien formado**, nunca ser cierto;
  - comentario en el `describe` del IBAN de
    `myinvestor.statement.parser.test.ts`, donde se escribe el fixture;
  - aviso en [`docs/dar-de-alta-un-banco.md`](../../docs/dar-de-alta-un-banco.md):
    el IBAN del ejemplo es el público, el suyo va solo en su fichero de Drive y en
    `var/drive-read/` (gitignoreada).

### 2. `README.md` desactualizado — corregido

- Tabla de endpoints: `/api/ingesta/*` → **`/api/ingestion/*`**, `process` pasa a
  «descarga y guarda copia local, **no mueve nada**», y entra
  **`POST /api/import`** con su descripción.
- Nota de **breaking change** nueva, igual que la del contrato.
- Árbol de módulos: `ingesta/` → `ingestion/` y añadidos `import/`, `myinvestor/`
  e `investments/`, que tampoco estaban.
- **Añadido de paso** (misma tabla, mismo tipo de mentira):
  `POST /api/parser/myinvestor`, que faltaba desde la F10.

### Verificación tras las correcciones

`./init.sh` **verde**: 24 archivos, **316 tests** (los mismos que confirmó el
reviewer), typecheck OK. `pnpm run lint` sin errores y `pnpm run format:check`
limpio. **Sin commits** y la feature **sigue en `in_progress`**.

### Observación fuera de scope (NO aplicada)

Quedan otros IBAN con forma válida en fixtures **anteriores a esta feature**
(`bankinter.fixture.ts`, `bankinter.parser.test.ts`, `myinvestor.fixture.ts` y el
ejemplo `curl` del `README.md`). Son sintéticos o el ejemplo público de siempre, y
el reviewer no los señaló, pero **conviene que alguien confirme que ninguno es
real** ahora que la regla está escrita. No los he tocado: no son de la F12.
