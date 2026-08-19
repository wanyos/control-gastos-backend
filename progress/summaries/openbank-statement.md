# Resumen — feature 19 `openbank-statement`

Fecha de cierre: 2026-08-19
Intención original: `feature_list.json` → feature `openbank-statement`, bloque `intent`
Spec (SDD): [`specs/openbank-statement/`](../../specs/openbank-statement/decisions.md)

## Qué hace ahora la app que antes no

Ahora el backend **lee el fichero de movimientos de Openbank tal y como te lo
descargas**, sin que tengas que convertirlo a nada. Ese fichero se llama `.xls`
pero por dentro es una página HTML en una codificación antigua (cp1252), y hasta
hoy el importador lo dejaba de lado como `skipped`. Con esta feature entran sus
dos años de histórico —200 apuntes— con fecha de operación, fecha de valor,
concepto entero e importe con su signo, y además **el saldo de la cuenta sale del
propio fichero**: es el primer banco en el que no escribes tú esa línea. Lo único
que escribes, y **una sola vez**, es el IBAN, en un comentario en la primera línea.

Como en los tres bancos anteriores, esto **todavía no guarda nada en la base de
datos**: parsea y vuelca un JSON local. Lo que sí cambia es que `POST /api/import`
ya reconoce estos ficheros.

## Por dónde se usa (puntos de entrada)

- `POST /api/parser/openbank` — recorre tus copias locales de
  `var/drive-read/openbank/<año>/`, parsea cada `.xls` y deja el JSON en
  `var/parsed/`. Devuelve 200 aunque un fichero falle: el fallo va dentro, en
  `failed[]`. Ver [openbank.routes.ts:37](../../src/modules/openbank/openbank.routes.ts#L37).
- `POST /api/import` — **sin cambios de uso**, pero desde ahora ya no reporta tus
  `.xls` de Openbank como `skipped`: es la línea del registro de parsers de
  [app.ts:44](../../src/app.ts#L44).
- Lo que te toca a ti está contado en `docs/dar-de-alta-un-banco.md`: la línea del
  IBAN y el aviso de **no volver a guardar el fichero con Excel**.

## Dónde está el código (para revisión directa)

### El parser del banco (lo principal)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Fichero → movimientos, todo el flujo | `parseOpenbankStatement` | [openbank.statement.parser.ts:95](../../src/modules/openbank/openbank.statement.parser.ts#L95) |
| Exige que el fichero declare su codificación y si no, lo rechaza entero | `assertDeclaredEncoding` | [openbank.statement.parser.ts](../../src/modules/openbank/openbank.statement.parser.ts) |
| Encuentra la fila de cabecera (si no está, no es un extracto de Openbank) | `isHeaderRow` | [openbank.statement.parser.ts](../../src/modules/openbank/openbank.statement.parser.ts) |
| Una fila → un movimiento, o el motivo por el que no se entiende | `parseMovementRow` | [openbank.statement.parser.ts](../../src/modules/openbank/openbank.statement.parser.ts) |
| Lee **solo** la fila `Saldo:` del preámbulo (el resto, en silencio) | `findPreambleValue` | [openbank.statement.parser.ts](../../src/modules/openbank/openbank.statement.parser.ts) |
| Lee el IBAN que escribes tú, del comentario anterior a la tabla | `findIbanComment` | [openbank.statement.parser.ts](../../src/modules/openbank/openbank.statement.parser.ts) |

### El lector de HTML (propio de este banco, sin librerías nuevas)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Trocea el documento en filas y celdas ya limpias | `readHtmlTableRows` | [openbank.html.ts:54](../../src/modules/openbank/openbank.html.ts#L54) |
| Dice qué codificación declara el fichero | `readDeclaredCharset` | [openbank.html.ts:110](../../src/modules/openbank/openbank.html.ts#L110) |
| Devuelve los comentarios anteriores a `<table>` (donde va el IBAN) | `readHtmlComments` | [openbank.html.ts:129](../../src/modules/openbank/openbank.html.ts#L129) |
| Una fila de la tabla, con su número | `HtmlRow` | [openbank.html.ts:27](../../src/modules/openbank/openbank.html.ts#L27) |

### Fechas y números de este banco

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| `DD/MM/AAAA` → ISO, rechazando fechas que no existen | `parseStatementDate` | [openbank.format.ts:21](../../src/modules/openbank/openbank.format.ts#L21) |
| Punto de miles, coma decimal, signo delante, divisa pegada descartada | `parseAmountText` | [openbank.format.ts:62](../../src/modules/openbank/openbank.format.ts#L62) |

### La codificación (compartida, no del banco)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Descodifica los bytes que emite Openbank (cp1252), estricto | `decodeCp1252Strict` | [cp1252.ts:45](../../src/lib/cp1252.ts#L45) |
| El guardián del carácter roto, extraído para que lo usen los dos | `assertNoReplacementCharacter` | [utf8.ts:67](../../src/lib/utf8.ts#L67) |
| La guardia de MyInvestor, **sin cambiar** | `decodeUtf8Strict` | [utf8.ts:25](../../src/lib/utf8.ts#L25) |
| Error nuevo: el fichero no llega en la codificación de su banco (422) | `UnexpectedEncodingError` | [app-error.ts:89](../../src/errors/app-error.ts#L89) |

### HTTP, tipos y ayudas de test

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| La ruta `POST /api/parser/openbank` | `openbankRoutes` | [openbank.routes.ts:37](../../src/modules/openbank/openbank.routes.ts#L37) |
| Recorre las copias locales, parsea y vuelca el JSON | `parseLocalOpenbankCopies` | [openbank.service.ts:42](../../src/modules/openbank/openbank.service.ts#L42) |
| El tipo de salida: el contrato común, sin redeclarar nada | `OpenbankStatementResult` | [openbank.types.ts:30](../../src/modules/openbank/openbank.types.ts#L30) |
| Resumen de una ejecución (lo que devuelve el endpoint) | `OpenbankParseRunResult` | [openbank.types.ts:71](../../src/modules/openbank/openbank.types.ts#L71) |
| Extractos **inventados** para los tests | `buildOpenbankStatement`, `openbankSampleRows` | [openbank.fixture.ts:75](../../src/modules/openbank/openbank.fixture.ts#L75) |
| El banco entra en el registro de parsers y en la app | — | [app.ts:44](../../src/app.ts#L44) y [app.ts:62](../../src/app.ts#L62) |

### Tests

| Qué cubre | Código |
| --- | --- |
| Contrato común, sin tipos redeclarados | [parser.test.ts:27](../../src/modules/openbank/openbank.statement.parser.test.ts#L27) |
| Se leen los acentos que emite el banco, sin un solo carácter roto | [parser.test.ts:52](../../src/modules/openbank/openbank.statement.parser.test.ts#L52) |
| Si el fichero deja de declarar su codificación, se rechaza entero | [parser.test.ts:69](../../src/modules/openbank/openbank.statement.parser.test.ts#L69) |
| Un fichero que no es un extracto de Openbank | [parser.test.ts:101](../../src/modules/openbank/openbank.statement.parser.test.ts#L101) |
| Entra el histórico entero, incluidos 200 apuntes y años atrás | [parser.test.ts:122](../../src/modules/openbank/openbank.statement.parser.test.ts#L122) |
| Fechas ISO e importes con signo y céntimos | [parser.test.ts:175](../../src/modules/openbank/openbank.statement.parser.test.ts#L175) |
| El saldo por movimiento se lee y **no** se guarda; divisa vacía | [parser.test.ts:192](../../src/modules/openbank/openbank.statement.parser.test.ts#L192) |
| El saldo de la cuenta, del propio fichero (y qué pasa si falta o no se entiende) | [parser.test.ts:219](../../src/modules/openbank/openbank.statement.parser.test.ts#L219) |
| El IBAN del comentario, y que **nunca** se deriva del número de cuenta | [parser.test.ts:254](../../src/modules/openbank/openbank.statement.parser.test.ts#L254) |
| El preámbulo no ensucia `unparsedRows` | [parser.test.ts:320](../../src/modules/openbank/openbank.statement.parser.test.ts#L320) |
| Lo que parece un movimiento y no se entiende se reporta con su nº de fila | [parser.test.ts:346](../../src/modules/openbank/openbank.statement.parser.test.ts#L346) |
| Numeración dentro del día y regla del signo, compartidas | [parser.test.ts:381](../../src/modules/openbank/openbank.statement.parser.test.ts#L381) |
| El lector de HTML (celdas, entidades, comentarios, charset) | [openbank.html.test.ts](../../src/modules/openbank/openbank.html.test.ts) |
| Fechas y números del banco | [openbank.format.test.ts:35](../../src/modules/openbank/openbank.format.test.ts#L35) |
| La descodificación cp1252 y sus dos guardias | [cp1252.test.ts:11](../../src/lib/cp1252.test.ts#L11) |
| **Que MyInvestor no se ha debilitado** (regresión de la F17) | [utf8.test.ts:111](../../src/lib/utf8.test.ts#L111) |
| El servicio: volcado, aislamiento del fallo por fichero, determinismo | [openbank.service.test.ts:23](../../src/modules/openbank/openbank.service.test.ts#L23) |
| El endpoint y que `/api/import` deja de saltarse estos ficheros | [openbank.routes.test.ts:42](../../src/modules/openbank/openbank.routes.test.ts#L42) |

## Cumplimiento de la intención

- ✅ «Subo el archivo tal y como lo descargo de Openbank y sus movimientos entran,
  sin haberlo convertido a Excel ni a CSV» → se cumple: se lee el HTML y los bytes
  cp1252 tal cual. Verificado en
  [parser.test.ts:52](../../src/modules/openbank/openbank.statement.parser.test.ts#L52)
  y [cp1252.test.ts:11](../../src/lib/cp1252.test.ts#L11).
- ✅ «Entran los 200 movimientos, incluidos los de 2024 y 2025: quiero el histórico
  entero» → se cumple, sin recorte por fecha ni deduplicación. Verificado en
  [parser.test.ts:149](../../src/modules/openbank/openbank.statement.parser.test.ts#L149).
- ✅ «El saldo de la cuenta lo lee del propio archivo: ese no lo escribo yo» → se
  cumple, con la divisa descartada. Verificado en
  [parser.test.ts:219](../../src/modules/openbank/openbank.statement.parser.test.ts#L219).
- ✅ «El iban lo escribo yo una sola vez, y los archivos siguientes ya no lo
  necesitan» → se cumple: sin comentario, el extracto sale con `accountIban: null`
  y el importador resuelve la cuenta ya existente. Verificado en
  [parser.test.ts:254](../../src/modules/openbank/openbank.statement.parser.test.ts#L254)
  y [routes.test.ts:128](../../src/modules/openbank/openbank.routes.test.ts#L128).
- ✅ «No quiero que el backend calcule ni deduzca el iban del número de cuenta» →
  se cumple; ni del CCC ni de un concepto con forma de IBAN. Verificado en
  [parser.test.ts:274](../../src/modules/openbank/openbank.statement.parser.test.ts#L274).
- ✅ «No quiero que se empiece a guardar el saldo tras cada movimiento» → se
  cumple: se lee para validar la fila y se tira. Verificado en
  [parser.test.ts:193](../../src/modules/openbank/openbank.statement.parser.test.ts#L193).
- ✅ «No quiero que esto cambie los parsers de Bankinter, MyInvestor ni N26» → se
  cumple: ni una línea suya cambia, con regresión explícita de la guardia de
  MyInvestor en [utf8.test.ts:111](../../src/lib/utf8.test.ts#L111).

## Decisiones que se tomaron por ti

- **(delegada)** *Cómo se lee la tabla*: con código nuestro, **sin añadir ninguna
  dependencia**. Vive en [openbank.html.ts](../../src/modules/openbank/openbank.html.ts);
  el día que ese HTML se complique, el cambio se queda dentro de ese archivo.
- **(delegada)** *La codificación*: la regla «siempre UTF-8» **se acota, no se
  rompe** — lo que escribes tú va en UTF-8, lo que emite el banco se lee con la
  codificación de ese banco. Escrito en el **ADR-022** de `docs/architecture.md`,
  en `docs/conventions.md` y en el runbook.
- **(delegada)** *Dónde escribes el IBAN*: comentario `<!-- iban;… -->` en la
  primera línea, leído solo si está antes de la tabla. En
  `docs/dar-de-alta-un-banco.md`, con el aviso de abrirlo con el Bloc de notas.
- **(añadido)** *Si el fichero deja de declarar `iso-8859-1`, se rechaza entero*
  con el código `UNEXPECTED_ENCODING` (422). Sin eso, el día que Openbank pase a
  UTF-8 entrarían 200 conceptos con los acentos rotos **sin dar ningún error**.
- **(añadido)** *La divisa de cada movimiento queda vacía*, porque el fichero no
  la trae; no se rellena un «EUR» inventado.

## Qué NO se tocó / quedó fuera

- **No se persiste nada en la base de datos**: esta feature parsea y vuelca JSON,
  como las de los otros tres bancos.
- **El saldo tras cada movimiento existe en este fichero y no se guarda.** Openbank
  es el único de los seis bancos que lo da; queda anotado para el día que lo
  decidas (informe §4).
- **No se ha probado contra tu fichero real todavía**: hace falta que escribas el
  comentario del IBAN una vez y luego lanzar `POST /api/parser/openbank` y
  `POST /api/import`. Es el mismo paso que se dio con N26.
- Revolut y Trade Republic siguen pendientes (E4: 4 de 6 bancos).

## Notas para el futuro

- 🔒 **El guardián de privacidad de la F14 no lee ficheros `.xls`**, así que para
  este banco su capa de comparación no protege nada. En la revisión aparecieron
  importes reales copiados al fixture y a un comentario; están corregidos y
  reverificados, pero **la ampliación del guardián a `.xls`/`.html` es tarea
  aparte y conviene hacerla antes del próximo banco**.
- ⚠️ **Test intermitente ajeno a esta feature:** `src/modules/import/import.routes.test.ts`
  falló una vez de tres ejecuciones de la suite completa (un 500 en
  `GET /api/movements`) y pasa siempre ejecutado solo. Huele a interferencia entre
  archivos de test contra Postgres; merece su propia tarea.
- El árbol de carpetas de `docs/architecture.md` §Estructura arrastra desde la F17
  archivos sin listar; el guardián que sí está al día es `architecture.test.ts`.
