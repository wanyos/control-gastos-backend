# Resumen — feature 17 `statement-encoding-guard`

Fecha de cierre: 2026-08-15
Intención original: `feature_list.json` → feature `statement-encoding-guard`, bloque `intent`
Spec: no tiene (`sdd: false`); el contrato es el `intent` + los 8 `acceptance`
Origen: [`prueba-drive-real-2026-08-15.md`](../prueba-drive-real-2026-08-15.md) §🔴 E

## Qué hace ahora la app que antes no

Si subes un CSV de extracto que no está guardado en UTF-8 (lo que te pasó al editarlo
para meterle la línea `iban;` y que el editor lo guardara en ANSI), **el backend te lo
dice y rechaza ese archivo entero**, diciéndote qué byte, en qué línea y que lo vuelvas
a guardar en UTF-8. Antes lo leía igualmente: `SUSCRIPCIÓN PREMIUM` se guardaba como
`SUSCRIPCI�N PREMIUM` de forma irreversible y **no fallaba nada** —11 movimientos, cero
filas sin parsear, todo con pinta de correcto—.

El rechazo es del **archivo**, no de la petición: los demás archivos del mismo lote se
parsean igual. Y en la importación, el archivo rechazado **no se mueve a `procesados/`**:
sigue pendiente, lo vuelves a guardar bien, lo resubes y entra a la primera.

El backend **no aprende cp1252** ni adivina codificaciones, a propósito: tú escribes esos
archivos y prefieres volver a guardar uno antes que arrastrar un dato corrupto.

## Por dónde se usa (puntos de entrada)

Los dos caminos que existen hacia el parser del extracto, cubiertos por un único sitio:

- `POST /api/parser/myinvestor` — el archivo malo sale en `failed[]` con su motivo en
  texto, dentro de una respuesta **200**, y **no escribe volcado**.
- `POST /api/import` — el archivo malo sale en `files[].error` con
  `code: "NOT_UTF8"` (422 dentro de un 200) y `movedToProcessed: false`.

Documentado para ti, en cristiano, en
[`docs/dar-de-alta-un-banco.md`](../../docs/dar-de-alta-un-banco.md) §«El fichero se
guarda en UTF-8, siempre» (incluye cómo guardarlo bien desde Bloc de notas y Excel).

## Dónde está el código (para revisión directa)

> Los enlaces de la columna **Código** son clicables en la vista previa de Markdown de
> VS Code (o con Ctrl/Cmd + clic): saltan a la línea exacta.

### El guardián (la pieza nueva)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Descodifica los bytes en UTF-8 estricto o rechaza; **punto de entrada de todo esto** | `decodeUtf8Strict` | [utf8.ts:25](../../src/lib/utf8.ts#L25) |
| Segunda guardia: bytes válidos pero con `�` dentro (cicatriz de una decodificación fallida anterior) | *(dentro de `decodeUtf8Strict`)* | [utf8.ts:40](../../src/lib/utf8.ts#L40) |
| Construye el motivo que lees: byte, línea y qué hacer | `invalidBytesReason` | `src/lib/utf8.ts` |
| Encuentra el byte que **empieza** la secuencia mala, solo para nombrarlo | `findInvalidByte`, `sequenceSize`, `isOutOfRange` | `src/lib/utf8.ts` |
| Localiza la línea del problema (por bytes y por texto) | `lineOfByte`, `lineOf` | `src/lib/utf8.ts` |
| El error con su código estable `NOT_UTF8` (422) | `NotUtf8Error` | [app-error.ts:52](../../src/errors/app-error.ts#L52) |

### El único cambio de comportamiento del parser

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| El extracto se descodifica estricto **antes** de buscar la cabecera (la cabecera sobrevive a una decodificación mala, por eso va primero) | `parseMyinvestorStatement` | [myinvestor.statement.parser.ts:72](../../src/modules/myinvestor/myinvestor.statement.parser.ts#L72) |

### Los dos caminos que lo heredan sin una línea duplicada

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| El mismo parser registrado para el importador | `parsers` (registro de bancos) | [app.ts:38](../../src/app.ts#L38) |
| Camino del parseo local: aísla el fallo en `failed[]` y no escribe volcado | `parseAndDump` / `parseLocalMyinvestorCopies` | [myinvestor.service.ts:189](../../src/modules/myinvestor/myinvestor.service.ts#L189) |
| Camino del importador: parsea antes de persistir y de mover, así que el archivo malo no llega a `procesados/` | `importFile` | [import.service.ts:268](../../src/modules/import/import.service.ts#L268) |
| Propaga el código estable al informe del archivo | `describeError` | `src/modules/import/import.service.ts` |

### Fixtures (nada real, ni red)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| El mismo CSV sintético, guardado en cp1252 | `buildCp1252StatementCsv` | `src/modules/myinvestor/myinvestor.fixture.ts` |
| Codifica a cp1252 y **lanza** si un carácter no cabe (el fixture es exactamente los bytes que dice ser) | `toCp1252` | `src/modules/myinvestor/myinvestor.fixture.ts` |

### Tests

| Qué cubre | Código |
| --- | --- |
| Rechazo con byte, línea y qué hacer; y que no se devuelve nada reparado | `src/lib/utf8.test.ts` (bloques *bytes that are not UTF-8*) |
| Los casos raros de UTF-8 inválido (continuación suelta, truncado, *overlong*, sustituto, > U+10FFFF) | `src/lib/utf8.test.ts` |
| BOM, ASCII, acentos, `€` y emoji: lo válido sigue pasando | `src/lib/utf8.test.ts` (bloque *valid UTF-8*) |
| El parser rechaza el archivo entero y nunca recupera el acento | `src/modules/myinvestor/myinvestor.statement.parser.test.ts` (bloque *a file that is not UTF-8*) |
| Lote mixto: el malo a `failed[]`, el bueno y el producto parseados, y el malo sin volcado | `src/modules/myinvestor/myinvestor.service.test.ts` |
| Ningún `�` en el volcado real escrito a disco | `src/modules/myinvestor/myinvestor.service.test.ts` |
| El importador reporta `NOT_UTF8` y **no llama** a mover el archivo | `src/modules/import/import.service.test.ts` |
| El árbol de `src/` incluye la pieza nueva (ADR-004) | `src/architecture.test.ts` |

### Documentación

| Qué dice | Dónde |
| --- | --- |
| ADR-018: por qué por bytes, por qué el archivo entero, por qué en `lib/`, y la alternativa descartada (fallback cp1252) | [`docs/architecture.md`](../../docs/architecture.md) §ADR-018 |
| El código `NOT_UTF8` en la tabla de códigos estables, en la de `POST /api/import` y en el `failed[]` del parser | [`docs/api-contract.md`](../../docs/api-contract.md) |
| Cómo guardar el CSV bien y qué pasa si se te escapa | [`docs/dar-de-alta-un-banco.md`](../../docs/dar-de-alta-un-banco.md) |
| Regla para el próximo banco de texto: `decodeUtf8Strict`, nunca `toString('utf8')` | [`docs/conventions.md`](../../docs/conventions.md) §Parsers de banco |

## Cumplimiento de la intención

- ✅ «Si subo un CSV guardado en ANSI, ese archivo se reporta como fallido y el motivo me
  dice que no está en UTF-8 y que lo vuelva a guardar» → se cumple; verificado en
  `src/lib/utf8.test.ts` (*rejects the file and names the byte, its line and what to
  do*), `myinvestor.statement.parser.test.ts` (*rejects the whole file…*) y
  `myinvestor.service.test.ts` (*reports a statement that is not UTF-8 as a failed
  FILE…*, que comprueba el `reason` que acabas leyendo tú).
- ✅ «El extracto correcto en UTF-8, con sus tildes y sus eñes, se sigue parseando
  exactamente igual» → se cumple; las 32 pruebas previas del parser siguen verdes con sus
  valores concretos, más *parses the very same statement, saved properly, exactly as
  before* y el test del BOM.
- ✅ «Si en el mismo lote hay otros archivos buenos, se parsean igual» → se cumple;
  `myinvestor.service.test.ts` lo prueba con un lote de tres (extracto malo, extracto
  bueno y producto `.json`) e `import.service.test.ts` con dos archivos, donde solo el
  bueno se importa y se mueve.
- ✅ «Ningún concepto llega al volcado con un carácter de sustitución dentro» → se
  cumple; `myinvestor.service.test.ts` lee el JSON volcado de verdad desde disco y
  comprueba las dos formas (`�` literal y `�` escapado), además de que el archivo
  rechazado no escribe volcado ninguno.

## Decisiones que se tomaron por ti

- **(delegado) Se detecta por los BYTES**, con `TextDecoder(..., { fatal: true })`, no
  buscando el `�`: el hecho real es «estos bytes no son UTF-8», y un `�` puede venir en
  un archivo UTF-8 perfectamente válido. Vive en
  [`src/lib/utf8.ts`](../../src/lib/utf8.ts). Cero dependencias nuevas.
- **(añadido, y conviene que lo sepas) Hay una segunda guardia**: si los bytes son
  válidos pero el texto **ya trae** un `�`, también se rechaza, con su propio motivo. Es
  el segundo acto de lo que te pasó: si abres el archivo ya destrozado y ahora sí lo
  guardas en UTF-8, los bytes son válidos y el dato sigue perdido. Sin esta guardia, ese
  archivo entraría limpio. El precio teórico es rechazar un archivo que llevara un `�`
  legítimo, que en un extracto bancario no existe.
- **(delegado) Se rechaza el archivo entero**, no las filas afectadas — que es por lo que
  te inclinabas. Un rechazo por filas dejaría pasar todas las líneas de puro ASCII y
  descartaría las que llevan acentos: un extracto **con pinta de completo** que no lo es,
  y con el número de movimientos descuadrado respecto al banco. Además el arreglo es
  atómico (volver a guardar el archivo), así que la unidad de rechazo debe ser la misma.
- **(delegado) El aviso sale por el camino de fallo por archivo**, dentro de un 200, con
  un **código estable nuevo** `NOT_UTF8` (422) en vez de reutilizar `VALIDATION_ERROR`:
  es un fallo con una acción concreta y distinta («vuelve a guardarlo en UTF-8») que el
  frontend podrá distinguir de «esto no es un extracto reconocible». Sigue el precedente
  de `MISSING_ACCOUNT_DATA`.
- **(delegado) El guardián vive en `src/lib/`, no en el módulo del banco**, y se llama
  **dentro del parser**. La codificación no es un formato, así que compartirla no rompe
  la norma «un parser por banco»; y como los dos caminos pasan por el mismo parser, los
  dos quedan cubiertos sin duplicar una línea y sin que el importador (que no puede
  nombrar bancos) tenga que saber nada.

## Qué NO se tocó / quedó fuera

- La base de datos, el esquema Prisma y la persistencia: intactos. Esta feature no guarda
  nada.
- El parser de productos `.json` de MyInvestor y el de Bankinter `.xlsx`: sin cambios. El
  `.xlsx` no es texto plano y no tiene este problema.
- El formato del CSV no cambia: mismas columnas, mismo `;`, mismo preámbulo `iban;`, y el
  BOM se sigue tolerando.
- Sin dependencias nuevas y sin cambios en la interfaz web (es del frontend, otra sesión).

## Notas para el futuro

1. **El JSON de producto se sigue leyendo con `readFile(path, 'utf8')`**
   (`src/modules/myinvestor/myinvestor.service.ts`), que tiene exactamente el mismo
   silencio que `toString('utf8')`. No se ha tocado porque tu `intent` pedía no tocar ese
   formato y porque hoy no ha dado problemas. Cerrarlo del todo es leer el archivo sin
   encoding y pasarlo por `decodeUtf8Strict`.
2. **Cabo suelto del saneamiento de datos reales, ajeno a esta feature:** el comentario de
   `prisma/migrations/20260806191700_data_model/migration.sql` se editó (solo el
   comentario; ni una línea de SQL). Prisma guarda el checksum de cada migración aplicada,
   así que el próximo `pnpm prisma:migrate` puede darla por modificada y proponer resetear
   la base. Decidirlo antes de la próxima feature que toque el esquema.
3. **La F16 `statement-balance`** tocará este mismo parser para leer la línea `saldo;` del
   preámbulo. No hay conflicto con lo de aquí.
4. Siguen abiertos los otros dos hallazgos de la prueba real: el motivo de la coma decimal
   en el JSON (§A) y el archivo nativo de Google reportado como `Cannot reach Google
   Drive` (§B). Candidatos a feature propia.
