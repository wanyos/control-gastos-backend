# Tasks — F19 `openbank-statement`

> Cinco lotes. Los `Archivos:` de dos lotes **no se solapan**, así que A, B y E
> pueden correr a la vez; C espera a A y B; D espera a C.
>
> 🔒 Todo test usa fixtures **sintéticos en memoria** (`openbank.fixture.ts`):
> ni un importe, concepto, IBAN, CCC ni nombre del fichero real. Antes de cerrar,
> `npx vitest run src/no-real-data.test.ts` y `./init.sh` en verde.
>
> **Informe:** el implementer del Lote D escribe
> `progress/implementations/openbank-statement.md` con la trazabilidad completa
> `R<n>` ↔ test; los demás lotes le devuelven la suya al leader para que la
> consolide ahí (ese archivo es de un solo lote, para no pisarse).

## Lote A — codificación compartida
Archivos: `src/lib/cp1252.ts`, `src/lib/cp1252.test.ts`, `src/lib/utf8.ts`, `src/lib/utf8.test.ts`, `src/errors/app-error.ts`
Depende de: —

- [ ] T1 — Añadir `UnexpectedEncodingError` (`UNEXPECTED_ENCODING`, 422) a `app-error.ts`, con el comentario de por qué no reutiliza `NOT_UTF8` (aquí el fichero no está mal: está en otra codificación, y el fallo es que no la declara). Cubre: R3.
- [ ] T2 — Extraer de `utf8.ts` el guardián del carácter de sustitución a un export reutilizable, **sin cambiar el comportamiento de `decodeUtf8Strict`** (MyInvestor no se toca). Cubre: R2, R3.
- [ ] T3 — Crear `decodeCp1252Strict(content)` en `src/lib/cp1252.ts`: `TextDecoder('windows-1252', { fatal: true })` + el guardián de T2; lanza `UnexpectedEncodingError`. Documentar en la cabecera del archivo el alcance del ADR-020 (el humano escribe UTF-8; el banco emite lo suyo, declarado por parser). Cubre: R2, R3.
- [ ] T4 — Tests: bytes cp1252 con acentos → texto correcto; texto con `U+FFFD` → rechazo; ASCII puro → idéntico. Cubre: R2, R3.
- [ ] T5 — Test de regresión en `utf8.test.ts`: `decodeUtf8Strict` sigue rechazando exactamente lo mismo que antes (la guardia de MyInvestor no se debilita). Cubre: R2.

## Lote B — lector de HTML, formato y tipos del banco
Archivos: `src/modules/openbank/openbank.html.ts`, `src/modules/openbank/openbank.html.test.ts`, `src/modules/openbank/openbank.format.ts`, `src/modules/openbank/openbank.format.test.ts`, `src/modules/openbank/openbank.types.ts`, `src/modules/openbank/openbank.fixture.ts`
Depende de: —

- [ ] T6 — `openbank.types.ts`: `OpenbankStatementResult = ParsedStatement<'openbank'>` y los tipos del resumen de ejecución local. **No** redeclarar `ParsedMovement`, `UnparsedRow` ni `ParsedMovementType`. Cubre: R1.
- [ ] T7 — `readHtmlTableRows(document)`: trocea `<tr>…</tr>` y sus `<td>` (incluidas las autocerradas `<td … />`), quita tags interiores (`<b>`, `<font>`), resuelve `&amp; &lt; &gt; &quot; &nbsp; &#NN;` y devuelve `{ row, cells }` con el nº de fila 1-based. Cubre: R5, R13.
- [ ] T8 — `readDeclaredCharset(document)` (del `<meta http-equiv="Content-Type">`) y `readHtmlComments(document, before)` (solo comentarios anteriores a `<table>`). Cubre: R3, R11.
- [ ] T9 — `openbank.format.ts`: `parseStatementDate` (`DD/MM/AAAA` → ISO, rechaza fechas imposibles) y `parseAmountText` (punto de miles, coma decimal, signo, sufijo de divisa opcional que se descarta). **Propios del banco**: no importar los de MyInvestor. Cubre: R6, R7, R9.
- [ ] T10 — `openbank.fixture.ts`: constructores de HTML **sintético** — documento completo (preámbulo + cabecera + N movimientos), variantes con comentario de IBAN, sin él, con `Saldo:` ilegible, con fila de movimiento rota, con `charset` ajeno y con bytes UTF-8. Cubre: R3, R5, R9, R10, R11, R13.
- [ ] T11 — Tests de T7-T9: celdas con tags anidados, celdas vacías autocerradas, entidades, fila decorativa de 10 celdas, fechas y importes válidos e inválidos. Cubre: R5, R6, R7, R13.

## Lote C — el parser
Archivos: `src/modules/openbank/openbank.statement.parser.ts`, `src/modules/openbank/openbank.statement.parser.test.ts`
Depende de: Lote A, Lote B

- [ ] T12 — `parseOpenbankStatement(content)`: descodifica con `decodeCp1252Strict` **después** de comprobar el `charset` declarado; sin él o con otro, `UnexpectedEncodingError`. Cubre: R2, R3.
- [ ] T13 — Localizar la fila de cabecera por sus cinco etiquetas normalizadas; si no está, `ValidationError`. Cubre: R4.
- [ ] T14 — Recorrer las filas posteriores a la cabecera: 5 celdas → movimiento (fechas ISO, importe con signo, concepto entero sin trocear); histórico completo, sin recorte por fecha ni dedup. Cubre: R5, R6, R7.
- [ ] T15 — Emitir `balance: null` y `currency: ''` en todos los movimientos, leyendo pero descartando la 5ª celda. Cubre: R8.
- [ ] T16 — Preámbulo: `accountBalance` de la fila etiquetada `saldo` (divisa descartada); ausente → `null`; presente e ilegible → `unparsedRows` con nº de fila. Cubre: R9, R10.
- [ ] T17 — `accountIban` del comentario `<!-- iban;… -->` anterior a `<table>`, el primero gana; ausente → `null`; nunca derivado del CCC ni de un concepto. Cubre: R11.
- [ ] T18 — Filas decorativas y del preámbulo fuera de `unparsedRows`; fila con forma de movimiento ilegible dentro, con nº de fila y motivo. Cubre: R12, R13.
- [ ] T19 — `assignDaySequence(drafts, 'newest-first')` y `deriveMovementTypeFromAmount` **importados**, no reimplementados. Cubre: R14.
- [ ] T20 — Tests de T12-T19, uno por requirement como mínimo, incluido el de volumen (documento sintético con movimientos de tres años → entran todos). Cubre: R2-R14.

## Lote D — HTTP, registro y informe
Archivos: `src/modules/openbank/openbank.service.ts`, `src/modules/openbank/openbank.service.test.ts`, `src/modules/openbank/openbank.routes.ts`, `src/modules/openbank/openbank.routes.test.ts`, `src/app.ts`, `progress/implementations/openbank-statement.md`
Depende de: Lote C

- [ ] T21 — `openbank.service.ts`: recorre `var/drive-read/openbank/<año>/`, parsea cada `.xls` y vuelca el JSON en `var/parsed/`, aislando el fallo por archivo. Cubre: R15.
- [ ] T22 — `openbank.routes.ts`: `POST /api/parser/openbank` bajo el prefijo `/api/parser`, con los mismos `sourceBaseDir`/`dumpBaseDir` inyectables que MyInvestor. Cubre: R15.
- [ ] T23 — `src/app.ts`: registrar la ruta y añadir `{ bank: 'openbank', extensions: ['.xls'], parse: parseOpenbankStatement }` al registro (ADR-015). Cubre: R15.
- [ ] T24 — Tests de servicio y ruta con directorios temporales y fixtures sintéticos; test de que `POST /api/import` ya no reporta un `.xls` de openbank como `skipped`. Cubre: R15.
- [ ] T25 — Escribir `progress/implementations/openbank-statement.md`: trazabilidad `R<n>` ↔ test de los cinco lotes, la forma del fichero (nunca su contenido) y **la nota de que el fichero trae `balance` por línea y se ha decidido no guardarlo**, para que esa decisión no haya que redescubrirla. Cubre: R8.
- [ ] T26 — Ejecutar `npx vitest run src/no-real-data.test.ts` y `./init.sh`; ambos en verde antes de cerrar. Cubre: todas.

## Lote E — doctrina y runbook
Archivos: `docs/architecture.md`, `docs/conventions.md`, `docs/dar-de-alta-un-banco.md`
Depende de: —

- [ ] T27 — `docs/architecture.md`: **ADR-020** — alcance de la regla de codificación (el humano escribe UTF-8; el banco emite su codificación, declarada por parser; nadie adivina, nadie repara) + nota en ADR-018 apuntando a él, dejando claro que la guardia de MyInvestor no cambia. Cubre: R2, R3.
- [ ] T28 — `docs/conventions.md` §Parsers de banco: la viñeta del `decodeUtf8Strict` pasa a «cada parser declara la codificación de ORIGEN de su banco», con `decodeCp1252Strict` como segundo caso. Cubre: R2.
- [ ] T29 — `docs/dar-de-alta-un-banco.md`: sección nueva **«Si el fichero del banco es HTML: el IBAN va en un comentario de la primera línea»** con el ejemplo exacto (IBAN público de documentación), la advertencia de no reguardar el fichero con Excel y el recordatorio de que solo hace falta la primera vez; y acotar §«El fichero se guarda en UTF-8, siempre» a lo que edita el humano. Cubre: R11, R2.
