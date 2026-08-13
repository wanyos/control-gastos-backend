# Design — F12 `import`

> Cómo se construye lo que pide `requirements.md`. Se apoya en
> `docs/architecture.md` (ADR-004 módulos, ADR-005 errores, ADR-009 ingesta,
> ADR-011 modelo, ADR-013 contrato del parser, ADR-014 parser de MyInvestor) y en
> `docs/conventions.md`; solo documenta donde esta feature roza esas reglas.
>
> Incorpora las tres resoluciones del humano del **2026-08-12**: el IBAN viene en el
> fichero, el informe cuenta las líneas fallidas y `ingesta/` se renombra a `ingestion/`.

## 1. Estado actual → estado final

| Hoy | Tras la feature |
|---|---|
| Ninguna línea escribe un `Movement` a partir de un fichero parseado | `src/modules/import/` baja, parsea, guarda y mueve |
| `POST /api/ingesta/process` descarga **y mueve** a `procesados/` | `POST /api/ingestion/process` descarga y **no mueve** (R15, R20) |
| El parser de MyInvestor emite `accountIban: null` fijo | lee la línea `iban;…` del preámbulo si está (R18) |
| `MISSING_ACCOUNT_DATA` reservado en el contrato | lo emite el informe por fichero de `POST /api/import` (R6) |
| `findOrCreateAccountFromMetadata` sin llamador | lo llama el importador (R4) |
| Índice único parcial sin usuario | lo usa el guardado (R7) |
| Módulo y rutas `ingesta` en español (cabo suelto nº 4) | `ingestion` en inglés; cabo cerrado |

Piezas que se **consumen sin reescribir**: `src/lib/drive-structure.ts`
(`listBankFolders`, `listYearFolders`, `listPendingFiles`, `downloadFileContent`,
`ensureFolder`, `moveFileToProcessed`, `normalizeBankName`),
`src/lib/parsed-statement.ts`, `accounts.service.ts:165`
(`findOrCreateAccountFromMetadata`), `movements.service.ts:33`
(`deriveMovementTypeFromAmount`), el parser de Bankinter y el índice
`Movement_imported_dedup_key`.

## 2. Archivos

**Nuevos** — `src/modules/import/`:

| Archivo | Contenido |
|---|---|
| `import.types.ts` | `BankParserAdapter`, `BankParserRegistry`, `ImportRunResult`, `ImportedFileReport`, `AccountReport` |
| `import.service.ts` | `importPending` y sus funciones puras |
| `import.routes.ts` | `POST /api/import` |
| `import.service.test.ts` | doble de Drive + BD real |
| `import.routes.test.ts` | `app.inject()` sobre `buildApp()` |

**Renombrados** (git mv, contenido incluido): `src/modules/ingesta/` →
`src/modules/ingestion/`, con `ingesta.routes.ts` → `ingestion.routes.ts`,
`ingesta.service.ts` → `ingestion.service.ts`, `ingesta.types.ts` →
`ingestion.types.ts` y sus dos tests. El prefijo de registro pasa a `/api/ingestion`.

**Modificados**: `src/modules/myinvestor/myinvestor.statement.parser.ts` (+ su test),
`src/app.ts` (registro del módulo `import`, construcción del registro de parsers y
prefijo nuevo de `ingestion`), `src/architecture.test.ts` (árbol objetivo con los nombres
nuevos + guardianes), `docs/api-contract.md`, `docs/architecture.md` (ADR-015),
`docs/roadmap.md` (E2, E5, cabos sueltos nº 1 y nº 4),
`progress/implementations/import.md`.

**No se tocan**: `prisma/schema.prisma` (sin migración: el modelo de la F8/F9 ya tiene
todo), el parser de Bankinter, `movements.*`, `categories.*`.

## 3. ⭐ Decisión propia #1 — Módulo propio `import/`, endpoint `POST /api/import` y renombrado de `ingesta` (R2, R15, R20)

El importador **no es de un banco** ni es «la ingesta»: es la costura entre Drive, los
parsers y la base de datos. Módulo propio (ADR-004), **en inglés**
(`docs/conventions.md` §Idioma).

```
GET  /api/ingestion/pending   (renombrado)          -> «N nuevos» para el frontend
POST /api/ingestion/process   (renombrado + retocado) -> solo baja la copia cruda, NO mueve
POST /api/import              (nuevo)               -> baja + parsea + guarda + mueve
```

El renombrado entra aquí **porque esta feature ya toca esos mismos archivos**: hacerlo en
otra sesión significaría editarlos dos veces y un segundo breaking change de contrato.
Las rutas viejas **no se mantienen como alias**: caen en el `setNotFoundHandler` central y
responden 404 con el cuerpo de error estándar (R20). Es un breaking change documentado y
hoy sin consumidor.

- **Alternativa descartada:** convertir `POST /api/ingestion/process` en el importador. Un
  endpoint menos, pero se pierde la descarga sin importar —que es lo que exige la regla 4
  de `docs/specs.md` cuando llega un banco nuevo del que aún no hay parser—.
- **Alternativa descartada:** importar desde las copias locales de `var/drive-read/` en
  vez de desde Drive. Sería más fácil de probar, pero entonces el movimiento a
  `procesados/` no podría depender del guardado, que es justo lo que el humano pidió.

Sin autenticación nueva (coherente con el contrato actual). Sin cuerpo de petición.

## 4. ⭐ Decisión propia #2 — El importador no sabe de bancos: registro inyectado (R14)

```typescript
// import.types.ts
export interface BankParserAdapter {
  /** Slug del banco: el mismo nombre normalizado que su carpeta de Drive. */
  bank: string
  /** Extensiones que este parser lee, en minúsculas y con punto. */
  extensions: string[]
  parse(content: Buffer): ParsedStatement | Promise<ParsedStatement>
}
export type BankParserRegistry = BankParserAdapter[]
```

El registro se construye en `src/app.ts` —la raíz de composición— y se pasa como opción
de ruta:

```typescript
const parsers: BankParserRegistry = [
  { bank: 'bankinter', extensions: ['.xlsx'], parse: parseBankinterXlsx },
  { bank: 'myinvestor', extensions: ['.csv'], parse: parseMyinvestorStatement },
]
app.register(importRoutes, { prefix: '/api/import', parsers })
```

Dos razones, y la segunda es dura:

1. Añadir un banco es añadir una línea en `app.ts`; el importador no cambia nunca.
2. El guardián de `src/architecture.test.ts:236` exige que **`app.ts` sea el único
   archivo de `src/` que nombra a `myinvestor`**. Un registro dentro de `import/` que
   importara los parsers rompería ese test. Inyectarlo lo respeta sin relajarlo.

- **Alternativa descartada:** `import.registry.ts` con los `import` de cada banco dentro
  del módulo. Más autocontenido, pero obliga a añadir una excepción al guardián de
  arquitectura, que es la línea que hoy garantiza «un parser por banco».

Selección: por cada fichero pendiente se busca el adapter cuyo `bank` coincide con
`normalizeBankName(<carpeta de banco>)`. Sin adapter → `skipped`
(`reason: 'no hay parser para el banco <slug>'`). Con adapter pero extensión no listada →
`skipped` (`reason: 'extensión no soportada por el parser de <slug>'`). En ambos casos el
fichero **no se mueve** (R14).

## 5. Flujo por fichero (R1, R9, R10, R11)

`importPending` recorre bancos y años igual que `detectPending` (mismo descubrimiento
dinámico, mismo orden por nombre) y por cada fichero pendiente:

```
1. seleccionar adapter        -> si no hay: skipped, no se mueve
2. downloadFileContent        -> fallo: failed, no se mueve
3. escribir copia cruda local <rawCopyBaseDir>/<bank>/<year>/<name>   (idempotente: sobreescribe)
4. adapter.parse(content)     -> fallo: failed, no se mueve
5. resolveAccount(...)        -> MissingAccountDataError: failed(MISSING_ACCOUNT_DATA), no se mueve
6. persistMovements(...)      -> fallo: failed, no se mueve
7. moveFileToProcessed(...)   -> fallo: failed (los movimientos YA están guardados)
8. informe del fichero: imported
```

- El paso 3 conserva lo que hoy hace la F5: es lo que permite re-parsear sin volver a
  bajar de Drive (roadmap §«Juntar la feature no es juntar los pasos»).
- La carpeta `procesados/` se resuelve una vez por año con `ensureFolder`, como hoy.
- Un fichero con `movements.length === 0` y solo `unparsedRows` se reporta con 0 guardados
  y **se mueve igual** (R11): el crudo queda en `procesados/` y es re-parseable.
- Fallo aislado por fichero, nunca detiene el resto (R10); los mensajes se sanean con el
  mismo `describeError` que ya usa la ingesta.

## 6. ⭐ Decisión propia #3 — Resolución de cuenta e invariante del IBAN (R4, R5, R6, R19)

```typescript
type AccountResolution = {
  account: Account
  created: boolean
  appliedDefaults?: { alias: boolean; type: boolean }
}
```

```
si statement.accountIban != null y no vacío:
    findOrCreateAccountFromMetadata(prisma, { iban, bank: statement.bank })   // F8, R4
si no:
    cuentas = account.findMany({ where: { bank: { equals: bankSlug, mode: 'insensitive' } } })
    exactamente 1 -> esa cuenta (created: false)                              // R5
    0 ó >1        -> throw MissingAccountDataError(mensaje que pide el IBAN)  // R6
```

**Invariante R19, explícito:** la única vía de alta de cuenta del importador es
`findOrCreateAccountFromMetadata`, que ya exige `iban` + `bank` y lanza
`MissingAccountDataError` sin crear nada. El importador **no** tiene ninguna otra llamada
a `prisma.account.create`; el guardián de arquitectura lo comprueba por texto.

Mensajes (van al `error.message` del informe del fichero, R6):

- 0 cuentas: `'No iban in the file and no account registered for bank <slug>: add a line
  "iban;<IBAN>" at the top of one of its files, once.'`
- \>1 cuentas: `'No iban in the file and <n> accounts registered for bank <slug>: add the
  "iban;<IBAN>" line so the file says which one it is.'`

El `code` es `MISSING_ACCOUNT_DATA` en ambos casos: al frontend solo le hace falta saber
que toca intervenir en el fichero.

- **Por qué la rama sin IBAN sigue existiendo aunque el humano ya lo haya puesto:** su
  regla es «con ponerlo una sola vez basta». Los ficheros siguientes de esa cuenta no lo
  traerán y tienen que poder importarse.
- **Alternativa descartada:** un mapa banco→cuenta por configuración (`.env`). Otra
  fuente de verdad que se desincroniza con la base de datos.
- **Alternativa descartada:** pedir el `accountId` como parámetro del endpoint. Rompe el
  disparo de un solo botón y no escala a varios ficheros de bancos distintos en una pasada.

## 7. ⭐ Decisión propia #4 — El parser de MyInvestor lee la línea `iban` del preámbulo (R18)

Formato real, tal como lo escribe el humano (dos columnas, antes de la cabecera; Excel
puede añadir `;` de relleno al final):

```
iban;ES9121000418450200051332
Fecha de operación;Fecha de valor;Concepto;Importe;Divisa
06/08/2026;10/08/2026;ETF EJEMPLO INDICE GLOBAL;-60;EUR
```

Cambio en `myinvestor.statement.parser.ts`:

- Nueva función privada `findIbanLine(lines: string[], headerLine: number): string | null`.
  Recorre **solo las líneas anteriores a la cabecera**, parte por `;`, normaliza la
  **primera** celda (`trim`, minúsculas, sin espacios) y, si vale exactamente `iban`,
  devuelve la **segunda** celda con `trim`. Vacía o ausente → `null`.
- `accountIban: null` (línea 89) pasa a `accountIban: findIbanLine(lines, header.line)`.
- Nada más cambia: la detección de cabecera ya ignora esa línea (no tiene columnas de
  concepto ni importe) y el bucle de datos empieza en `header.line`, así que la línea del
  preámbulo nunca llega a `parseDataLine` ni ensucia `unparsedRows`.
- Las celdas de relleno sobrantes son inocuas: solo se miran las dos primeras.

⚠️ **Restricción de la F10 que NO se relaja, implementer:** el test
`'emits accountIban null without inferring it from an IBAN-shaped concept (R20)'`
(`src/modules/myinvestor/myinvestor.statement.parser.test.ts:245`) **sigue siendo válido
y debe seguir pasando sin tocarlo**. El IBAN se lee **solo** de la línea etiquetada; no se
busca por forma de IBAN en ningún otro sitio del fichero. Lo que se añade es un caso
nuevo, no una relajación del anterior.

- **Alternativa descartada:** detectar cualquier celda con forma de IBAN en el preámbulo.
  Más «listo», pero es justo lo que la F10 prohibió: un concepto de movimiento con un IBAN
  dentro pasaría por el IBAN de la cuenta.
- **Alternativa descartada:** un fichero aparte `cuenta.json` con el IBAN. Otro formato
  que mantener y otra cosa que el humano tiene que recordar.

## 8. Guardado y deduplicación (R1, R7, R8, R12, R13)

```typescript
export function toMovementRows(
  movements: ParsedMovement[],
  accountId: number,
): Prisma.MovementCreateManyInput[]
```

Función **pura** (test unitario directo), aplicando la tabla de
`specs/data-model/design.md` §9:

| Contrato del parser | `Movement` |
|---|---|
| `bookingDate`, `valueDate` (`YYYY-MM-DD`) | `new Date(<fecha> + 'T00:00:00.000Z')` → `@db.Date` |
| `description` | `description` |
| `amount` (con signo) | `amount = Math.abs(amount).toFixed(2)` (string → `Decimal`, sin coma flotante) |
| `type` del parser | se **re-deriva** con `deriveMovementTypeFromAmount(amount)`: un solo sitio decide el signo |
| `balance` | `balanceAfter` (`null` se guarda como `null`, R12) |
| `currency` (`''` si no hay columna) | `currency` (`'EUR'` cuando llega `''`) |
| `daySequence` | `daySequence`, tal cual lo emite el parser |
| — | `accountId`, `origin: 'imported'`, `status: 'pending_review'` |
| — | `categoryId`, `paymentMethod`, `transferId`, `productId`, `note` = `null` (R16) |

Persistencia:

```typescript
const { count } = await prisma.movement.createMany({ data: rows, skipDuplicates: true })
// duplicates = rows.length - count
```

- `skipDuplicates` se traduce a `ON CONFLICT DO NOTHING` **sin target**, así que cubre el
  índice **parcial** `Movement_imported_dedup_key`, que Prisma no conoce (R7).
- Un solo `createMany` por fichero es atómico: o entran todos los movimientos buenos de
  ese fichero o ninguno, y entonces el fichero se queda pendiente (R10). No hace falta
  `$transaction` explícito.
- Las líneas idénticas legítimas del mismo día se distinguen por `daySequence` y entran
  todas (R8).
- **Determinismo (R13):** entrada idéntica → mismas filas en el mismo orden → la segunda
  pasada inserta 0 y reporta `duplicates = n`. Nada depende del reloj, del `id` ni del
  orden de llegada.
- **Alternativa descartada:** consultar antes qué movimientos existen y filtrar en
  memoria. Una consulta por fichero de más, y una carrera con dos importaciones
  simultáneas que el índice ya resuelve en la base de datos.

## 9. Forma de la respuesta (R2, R11)

`200` siempre que se pueda listar Drive; un fallo por fichero **no** cambia el código HTTP
(mismo criterio que la ingesta, ADR-009).

```json
{
  "importedCount": 39,
  "duplicateCount": 2,
  "unparsedCount": 1,
  "failedCount": 1,
  "skippedCount": 1,
  "files": [
    {
      "bank": "bankinter", "year": "2026", "fileId": "1AbC", "name": "movs.xlsx",
      "status": "imported",
      "account": { "id": 3, "iban": "ES2101280...", "bank": "bankinter", "alias": "bankinter ···0236", "type": "checking", "created": true, "appliedDefaults": { "alias": true, "type": true } },
      "imported": 39, "duplicates": 2,
      "unparsedCount": 1,
      "unparsedRows": [{ "row": 42, "reason": "importe ilegible" }],
      "movedToProcessed": true
    },
    {
      "bank": "myinvestor", "year": "2026", "fileId": "9XyZ", "name": "extracto.csv",
      "status": "failed", "account": null, "imported": 0, "duplicates": 0,
      "unparsedCount": 0, "unparsedRows": [], "movedToProcessed": false,
      "error": { "code": "MISSING_ACCOUNT_DATA", "message": "No iban in the file and no account registered for bank myinvestor: add a line \"iban;<IBAN>\" at the top of one of its files, once." }
    },
    {
      "bank": "myinvestor", "year": "2026", "fileId": "5Qrs", "name": "fondo-indexado.json",
      "status": "skipped", "reason": "extensión no soportada por el parser de myinvestor",
      "movedToProcessed": false
    }
  ]
}
```

- `unparsedCount` aparece **por fichero y en el total**: es el añadido que pidió el humano
  el 2026-08-12 («que la respuesta diga cuántas líneas fallaron»).
- Nunca se expone una ruta absoluta de la máquina ni un token; `error.message` va saneado.
- `error.code` usa los códigos estables de `docs/api-contract.md`.

## 10. Errores (ADR-005)

- **Se reutilizan sin añadir clases nuevas:** `MissingAccountDataError` (422),
  `DriveConnectionError` (503, ya lo lanza `drive-structure`), `AppError` como base para
  el saneado.
- **Nivel superior** (no se pueden ni listar los bancos) → propaga y el handler central
  responde 503, como en la ingesta.
- **Nivel fichero** → nunca propaga: se convierte en `error: { code, message }` dentro del
  informe.
- `MISSING_ACCOUNT_DATA` deja de estar «reservado» en `docs/api-contract.md`: pasa a
  aparecer como `code` **por fichero** dentro de un 200. Se documenta explícitamente
  porque es el único código estable del contrato que no viaja como cuerpo de error HTTP.

## 11. Retoque y renombrado de la F5 (R15, R20)

- **Retoque:** en `processPending` (`src/modules/ingesta/ingesta.service.ts:72`)
  desaparecen la llamada a `ensureFolder(processedFolderName, …)` y la de
  `moveFileToProcessed`, junto con sus imports. Todo lo demás se conserva: descubrimiento
  dinámico, copia local, aislamiento de fallos, idempotencia (reejecutar sin pendientes no
  hace nada; con pendientes reescribe la misma copia local, sin duplicarla).
  `ProcessedFile` mantiene su forma; su comentario pasa a decir «descargado y copiado», no
  «procesado».
- **Renombrado:** carpeta, archivos, símbolos exportados (`ingestaRoutes` →
  `ingestionRoutes`, `IngestaRoutesOptions` → `IngestionRoutesOptions`), prefijo de
  registro en `app.ts` y las entradas del árbol objetivo y del guardián «módulo libre de
  acceso a datos» en `src/architecture.test.ts`. El directorio de volcado
  (`var/drive-read/`) **no** cambia: es una ruta de datos ya gitignoreada y renombrarla
  invalidaría las copias crudas que el humano ya tiene.
- **Contrato:** `docs/api-contract.md` cambia la sección «Ingesta desde Google Drive» a las
  rutas nuevas con una nota de **breaking change** (`/api/ingesta/*` → 404), en la línea
  de las notas que ya existen para `/api/expenses`.

## 12. Estrategia de test (Nivel 2 de `docs/verification.md`)

- **Unitario puro:** `toMovementRows` (mapeo, `abs`, `neutral`, `balance: null`,
  `currency: ''` → `'EUR'`, campos de enriquecimiento a `null`).
- **Parser de MyInvestor:** línea `iban` presente / ausente / vacía / con `;` de relleno, y
  el test R20 existente **intacto** (no se infiere de un concepto).
- **Servicio:** doble de Drive (el mismo patrón de `ingestion.service.test.ts`), adapters
  de parser **falsos** declarados en el propio test (el módulo no debe nombrar bancos) y
  BD real de `docker-compose.yml`. Cubre R1, R4-R14, R19.
- **Rutas:** `app.inject()` sobre `buildApp()` con `POST /api/import` y
  `GET /api/movements` (R2, R3), `POST /api/ingestion/process` sin movimiento (R15) y
  `/api/ingesta/*` → 404 (R20).
- **Arquitectura:** guardianes nuevos — ningún archivo de `src/modules/import/` contiene el
  nombre de un banco, y ninguno contiene `account.create` fuera de la llamada al servicio
  de cuentas (R19); árbol objetivo con los nombres nuevos.
- **Aislamiento de datos:** cada test crea sus cuentas con IBAN único y limpia sus
  movimientos, como ya hace `movements.test.ts`.

## 13. Borrador de ADR-015 (va a `docs/architecture.md`, tarea de docs)

**ADR-015: Importación — módulo `import/` con registro de parsers inyectado, dedup
delegado en el índice parcial, `procesados/` como consecuencia del guardado, IBAN
obligatorio y `ingesta` renombrado a `ingestion`.**
Contexto: los parsers, el modelo y la fontanería de Drive existían sin tocarse.
Decisión: (1) módulo propio en inglés con `POST /api/import`; (2) el registro banco→parser
se inyecta desde `app.ts` para que el importador siga siendo agnóstico y el guardián de
«un parser por banco» siga siendo cierto; (3) el dedup lo resuelve `createMany
skipDuplicates` contra el índice único parcial, no una consulta previa; (4) un fichero se
mueve a `procesados/` solo tras el guardado, y `POST /api/ingestion/process` deja de
moverlo; (5) **ninguna cuenta se crea sin IBAN**: el IBAN viaja en el fichero (línea
`iban;…` del preámbulo en MyInvestor) y basta con escribirlo una vez, porque los ficheros
posteriores resuelven por la única cuenta de ese banco; (6) el módulo y las rutas de
ingesta se renombran a inglés (breaking change sin consumidor). Consecuencias: cabos
sueltos nº 1 y nº 4 cerrados; `MISSING_ACCOUNT_DATA` deja de ser reservado; queda vivo el
límite de `daySequence` (numera solo filas parseadas).

## 14. Riesgos y notas para el implementer

1. **`daySequence` numera solo las filas parseadas** (`src/lib/parsed-statement.ts:44`).
   Si un fichero con `unparsedRows` se reimporta tras mejorar el parser, ese día se
   renumera y pueden aparecer duplicados **visibles** de ese día. No se arregla aquí.
2. **No relajes el test R20 de MyInvestor** (§7). Si te falla, el fallo está en tu
   `findIbanLine`, no en el test.
3. **UTF-8:** el parser ya descodifica explícitamente UTF-8 con BOM tolerado; no cambies
   esa lectura al añadir la línea del IBAN (el humano edita ese CSV con Excel).
4. **`Decimal` desde `number`:** usa `Math.abs(amount).toFixed(2)` (string), nunca el
   `number` crudo, para no arrastrar coma flotante a un `Decimal(10,2)`.
5. **Fechas date-only:** construye siempre con sufijo `T00:00:00.000Z`; un
   `new Date('YYYY-MM-DD')` local desplazaría el día en zonas negativas.
6. **No mires `statement.bank` para elegir parser:** el banco lo manda la **carpeta**
   (ADR-009). El `bank` del parser solo se usa para dar de alta la cuenta.
7. **Orden estable:** bancos, años y ficheros ya llegan ordenados por nombre desde
   `drive-structure`; no reordenes.
8. **No toques `movements.routes.ts`:** el guardián de arquitectura rechaza cualquier
   `createMovement` en ese módulo. El importador escribe desde su propio servicio.
9. **Renombrado con `git mv`**, no copiar y borrar: conserva el historial y hace evidente
   en el diff que es un renombrado y no código nuevo.
