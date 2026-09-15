# Resumen — feature 46 `revolut-statement`

Fecha de cierre: 2026-09-15
Intención original: `feature_list.json` → feature `revolut-statement`, bloque `intent`
Spec: no tiene (`sdd: false`). Informe del implementer:
`progress/implementations/revolut-statement.md`. Revisión:
`progress/reviews/revolut-statement.md`. Prueba real:
`progress/explorations/prueba-real-revolut-2026-09-15.md`.

## Qué hace ahora la app que antes no

Lee el `.csv` que exporta Revolut y mete sus movimientos en la base de datos por el
mismo camino de importación que los otros cinco bancos, guardando el saldo de cada
línea y anclando la cuenta. Antes `POST /api/import` saltaba los ficheros de Revolut
porque no había parser. Con el fichero real del 2025: 35 movimientos, 0 filas sin
leer, la fila `DEVUELTO` fuera y los saldos cuadrando.

## Por dónde se usa (puntos de entrada)

- `POST /api/import` — el importador de siempre; ahora reconoce los `.csv` de
  `revolut/` gracias a la entrada del registro de parsers
  ([app.ts:53](../../src/app.ts#L53)).
- `POST /api/parser/revolut` — lee las copias locales de `var/drive-read/revolut/<año>/`
  y vuelca el resultado a `var/parsed/`, sin tocar la base
  ([revolut.routes.ts:36](../../src/modules/revolut/revolut.routes.ts#L36), registrada en
  [app.ts:105](../../src/app.ts#L105)).
- `parseRevolutStatement(content: Buffer)` — la función pura que convierte el fichero en
  `ParsedStatement<'revolut'>`
  ([revolut.statement.parser.ts:93](../../src/modules/revolut/revolut.statement.parser.ts#L93)).

## Dónde está el código (para revisión directa)

Todo el módulo vive en `src/modules/revolut/`. Los símbolos se buscan con `grep`.

### Lectura del fichero

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| De bytes a movimientos: descodifica con `decodeUtf8Strict`, busca cabecera y línea `iban`, decide cada fila | `parseRevolutStatement` | [revolut.statement.parser.ts:93](../../src/modules/revolut/revolut.statement.parser.ts#L93) |
| Busca la cabecera por nombre de columna (sin acentos ni mayúsculas) | `findHeaderRow` | `revolut.statement.parser.ts` |
| Lee la línea `iban;` (o con coma) solo encima de la cabecera | `findIbanLine` | `revolut.statement.parser.ts` |
| Una fila: primero el estado (`DEVUELTO` fuera sin informe, otro distinto de `COMPLETADO` a `unparsedRows`), luego fechas, importe y saldo | `parseDataRecord` | `revolut.statement.parser.ts` |
| Lector CSV propio (comas, comillas, `""`, saltos dentro de comillas, nº de línea) | `readCsvRecords`, `isBlankRecord`, `CsvRecord` | `revolut.csv.ts` |
| Importe con punto decimal y signo; fecha-hora a día `AAAA-MM-DD` | `parseAmount`, `parseDateTimeAsDay` | `revolut.format.ts` |
| Tipos: salida común y resultado de la pasada local | `RevolutStatementResult`, `RevolutParseRunResult`, `ParsedStatementSummary`, `FailedFile`, `IgnoredFile` | `revolut.types.ts` |

### Recorrido local y endpoint

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Recorre `var/drive-read/revolut/<año>/` y escribe en `var/parsed/` | `parseLocalRevolutCopies` | `revolut.service.ts` |
| Ruta `POST /revolut` bajo `/api/parser` | `revolutRoutes` (export default) | [revolut.routes.ts:36](../../src/modules/revolut/revolut.routes.ts#L36) |
| Alta en el registro de parsers con `.csv` y registro de la ruta | `bankParsers`, `app.register(revolutRoutes…)` | `src/app.ts` |

### Datos de prueba (todo inventado)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| CSV sintético en memoria, cabecera, filas, IBAN público de la documentación | `buildRevolutCsv`, `revolutRow`, `revolutSampleRows`, `revolutHeaders`, `revolutPreamble`, `documentationIban`, `writeLocalCopy` | `revolut.fixture.ts` |

### Tests

| Qué cubre | Código |
| --- | --- |
| Parser: fechas, `DEVUELTO` y otros estados, saldo por línea, `Comisión`, signo y tipo, `iban`, UTF-8, contrato común, imports | `revolut.statement.parser.test.ts` |
| Lector CSV | `revolut.csv.test.ts` |
| Importe y fecha-hora | `revolut.format.test.ts` |
| Recorrido local | `revolut.service.test.ts` |
| Endpoint y registro en `app.ts` | `revolut.routes.test.ts` |
| Entrada en la base de test con el registro real: movimientos, `balanceAfter`, ancla, sin línea `iban` | `revolut.import.test.ts` |
| `revolut` en las listas escritas a mano (árbol, sin `prisma`, sin código compartido entre bancos, slug) | `src/architecture.test.ts` |

### Documentación tocada

- `docs/api-contract.md` — sección «Parser de Revolut», bancos del importador, tabla de
  los dos saldos, nota `NOT_UTF8`.
- `docs/archivos-por-banco.md` — fila de Revolut.
- `docs/dar-de-alta-un-banco.md` — línea del IBAN de Revolut, sin línea del saldo, lista
  de parsers con `decodeUtf8Strict`.

## Cumplimiento de la intención

- ✅ «Subo el .csv de Revolut con mi línea del iban y sus movimientos entran en la base
  de datos con su fecha, su concepto y su importe» → se cumple; verificado en
  `revolut.import.test.ts` (`imports the movements instead of reporting the file as
  skipped`, `stores each movement with its dates, description, amount, type and
  balance`) y con el fichero real: 35 movimientos (`progress/explorations/prueba-real-revolut-2026-09-15.md`).
- ✅ «Las filas con estado DEVUELTO no entran como movimiento» → se cumple;
  `revolut.statement.parser.test.ts` (`produces no movement and no unparsed row for a
  DEVUELTO row`), `revolut.import.test.ts` (`stores no movement for the DEVUELTO nor the
  PENDIENTE row`); en el fichero real, 36 filas → 35 movimientos, `unparsedRows: []`.
- ✅ «La fecha contable es la de 'Fecha de finalización' y la fecha valor la de 'Fecha de
  inicio'» → se cumple; `revolut.statement.parser.test.ts` (`takes bookingDate from the
  completion date and valueDate from the start date`).
- ✅ «Se guarda el saldo que el archivo trae en cada línea» → se cumple;
  `revolut.statement.parser.test.ts` (`emits the Saldo of every line in balance`),
  `revolut.import.test.ts` (`anchors the account with the balance of the most recent
  line`); en el fichero real, 0 movimientos con `balanceAfter` nulo y
  `balanceMismatches: []`.
- ✅ «Un gasto sale como gasto y un ingreso como ingreso sin que yo toque el signo» → se
  cumple; `revolut.statement.parser.test.ts` (`reads the sign from the amount and derives
  expense, income and neutral`).

## Decisiones que se tomaron por ti

- (delegado) **Cómo se lee el CSV:** lector CSV de verdad, propio del módulo; cabecera
  buscada por nombre; si falta una de las siete columnas que se leen, el fichero se
  rechaza entero. Vive en `readCsvRecords` y `findHeaderRow`.
- (delegado) **La hora:** se descarta; el día se guarda tal cual, sin zona horaria, pero
  la forma `AAAA-MM-DD HH:MM:SS` se valida entera. El orden dentro del día sale del orden
  del fichero. Vive en `parseDateTimeAsDay`.
- (aprobada por ti, propuesta del leader) `DEVUELTO` se salta sin informe y cualquier
  otro estado distinto de `COMPLETADO` va a `unparsedRows`.
- (aprobada por ti, propuesta del leader) `revolut` añadido a las listas de bancos
  escritas a mano de `src/architecture.test.ts`.
- (añadido) En una fila `COMPLETADO`, un `Saldo` vacío entra con `balance: null`; un
  `Saldo` escrito que no es número va a `unparsedRows`. En tu fichero no se da.
- (añadido) Una fila `COMPLETADO` sin descripción va a `unparsedRows`.

## Qué NO se tocó / quedó fuera

- Ni esquema de base de datos, ni migraciones, ni el importador.
- La columna `Comisión` no se lee.
- No se lee ninguna línea `saldo;`.
- `docs/roadmap.md` (§E4, «5 de 6 bancos», Revolut «aparcado») y la frase de
  `docs/architecture.md` que dice que solo falta Revolut siguen sin actualizar: tocan al
  cerrar.

## Notas para el futuro

- No hay en `src/architecture.test.ts` un test que recorra todos los `*.parser.ts` para
  prohibir `toString('utf8')`: hoy se comprueba banco a banco en el test de cada parser.
  Sugerencia del implementer, no aplicada.
- Las listas de bancos de `src/architecture.test.ts` siguen escritas a mano; se podrían
  sacar de `src/modules/`. Sugerencia del implementer, no aplicada.
