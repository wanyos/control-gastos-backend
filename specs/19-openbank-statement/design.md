# Design — F19 `openbank-statement`

> Apoyado en `docs/architecture.md` (ADR-013 contrato, ADR-015 registro, ADR-017
> datos reales, ADR-018 codificación, ADR-019 `accountBalance`) y en
> `docs/conventions.md` §Parsers de banco. Aquí solo va lo que esta feature roza
> de esas reglas.

## 0. La forma del fichero (medida, no supuesta)

`.xls` en el nombre, **XHTML** en el contenido: `<!DOCTYPE html …>` + `<head>`
con `<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1" />`
+ una sola `<table>` con **212 `<tr>`**:

| Filas | Qué son |
|---|---|
| 1-10 | preámbulo: separadores decorativos y **filas etiqueta+valor** (`Número de Cuenta:`, `Descripción:`, `Titular:`, `Saldo:`) con la etiqueta en la 1ª celda y el valor en la 2ª |
| 11 | **cabecera** de la tabla: 5 celdas de texto (`Fecha Operación`, `Fecha Valor`, `Concepto`, `Importe`, `Saldo`) |
| 12-211 | **200 movimientos**, 5 celdas: fecha, fecha, concepto, importe, saldo tras el movimiento |
| 212 | fila de cierre decorativa, vacía |

Otros hechos medidos que el diseño usa: las celdas llevan **tags anidados**
(`<b>`, `<font>`) alrededor del texto; **no hay entidades HTML** en la muestra;
no hay tablas anidadas; solo **8 bytes > 127** en 165 KB, y aun así la
decodificación UTF-8 estricta falla; el orden es **de más reciente a más
antiguo**; el importe no lleva divisa pero el `Saldo:` del preámbulo sí.

## 1. Archivos

### Nuevos

| Archivo | Qué contiene |
|---|---|
| `src/lib/cp1252.ts` | `decodeCp1252Strict(content: Buffer): string` — codificación, no formato: vive en `lib/` por el mismo razonamiento del ADR-018 §3 |
| `src/lib/cp1252.test.ts` | tests de la descodificación y de las dos guardias |
| `src/modules/openbank/openbank.html.ts` | lector mínimo de la tabla: documento → `HtmlRow[]` (celdas de texto ya limpias), sin dependencias |
| `src/modules/openbank/openbank.html.test.ts` | |
| `src/modules/openbank/openbank.format.ts` | `parseStatementDate` (`DD/MM/AAAA`→ISO) y `parseAmountText` (punto de miles, coma decimal, sufijo de divisa opcional) **propios de Openbank** |
| `src/modules/openbank/openbank.format.test.ts` | |
| `src/modules/openbank/openbank.statement.parser.ts` | `parseOpenbankStatement(content: Buffer): OpenbankStatementResult` |
| `src/modules/openbank/openbank.statement.parser.test.ts` | |
| `src/modules/openbank/openbank.types.ts` | `export type OpenbankStatementResult = ParsedStatement<'openbank'>` y los tipos del resumen de ejecución local |
| `src/modules/openbank/openbank.fixture.ts` | fixtures **sintéticos** en memoria: HTML construido a mano, importes y nombres inventados |
| `src/modules/openbank/openbank.service.ts` | recorre `var/drive-read/openbank/<año>/` y vuelca JSON en `var/parsed/`, calcado del de MyInvestor en forma, no en código de lectura |
| `src/modules/openbank/openbank.service.test.ts` | |
| `src/modules/openbank/openbank.routes.ts` | `POST /api/parser/openbank` |
| `src/modules/openbank/openbank.routes.test.ts` | |

### Modificados

| Archivo | Cambio |
|---|---|
| `src/errors/app-error.ts` | nueva `UnexpectedEncodingError` (`UNEXPECTED_ENCODING`, 422) |
| `src/lib/utf8.ts` | se **exporta** el guardián del carácter de sustitución para que `cp1252.ts` no lo duplique (la lógica no cambia; MyInvestor no se toca) |
| `src/lib/utf8.test.ts` | test del export reutilizable |
| `src/app.ts` | `import openbankRoutes`, registro de la ruta y **una línea** en `parsers`: `{ bank: 'openbank', extensions: ['.xls'], parse: parseOpenbankStatement }` |
| `docs/dar-de-alta-un-banco.md` | §nueva: dónde va la línea del IBAN en un fichero HTML; §«El fichero se guarda en UTF-8, siempre» acotada a lo que escribe el humano |
| `docs/conventions.md` §Parsers de banco | la viñeta del `decodeUtf8Strict` pasa a «cada parser declara la codificación de ORIGEN de su banco» |
| `docs/architecture.md` | **ADR-020** (alcance de la regla de codificación) y nota en ADR-018 que apunta a él |
| `progress/implementations/openbank-statement.md` | informe + trazabilidad `R<n>` ↔ test |

## 2. Firmas nuevas

```ts
// src/lib/cp1252.ts
export function decodeCp1252Strict(content: Buffer): string

// src/lib/utf8.ts  (nuevo export, misma lógica ya existente)
export function assertNoReplacementCharacter(text: string, onScar: (line: number) => Error): void

// src/modules/openbank/openbank.html.ts
export interface HtmlRow { /** 1-based dentro del documento */ row: number; cells: string[] }
export function readHtmlTableRows(document: string): HtmlRow[]
export function readHtmlComments(document: string, before: string): string[]
export function readDeclaredCharset(document: string): string | null

// src/modules/openbank/openbank.format.ts
export function parseStatementDate(value: string): string | null
export function parseAmountText(value: string): number | null

// src/modules/openbank/openbank.statement.parser.ts
export function parseOpenbankStatement(content: Buffer): OpenbankStatementResult
```

## 3. Las tres decisiones delegadas, resueltas

### 3.1 Cómo se lee el HTML — **lectura directa, sin dependencia nueva** (R5)

`exceljs` no sirve (no hay ZIP ni OOXML). Se lee con expresiones regulares
acotadas dentro de `openbank.html.ts`: partir por `<tr>…</tr>`, dentro partir por
`<td …/>` y `<td …>…</td>`, quitar los tags interiores (`<b>`, `<font>`),
resolver el puñado de entidades que pueden aparecer (`&amp; &lt; &gt; &quot;
&nbsp; &#NN;`) y `trim`.

- **Por qué no una dependencia** (`cheerio`, `node-html-parser`): entra una
  dependencia con su árbol y su mantenimiento para leer **una tabla plana,
  generada por máquina, sin tablas anidadas y sin JavaScript**; y la norma «un
  parser por banco» empujaría a compartir ese lector en cuanto otro banco use el
  mismo truco, que es justo lo prohibido. Si el día de mañana el HTML se complica
  (celdas fusionadas, tablas anidadas), se cambia el interior de
  `openbank.html.ts` sin tocar el parser.
- **Riesgo asumido y acotado:** una regex sobre HTML es frágil ante HTML
  arbitrario. Aquí no lo es: `readHtmlTableRows` **no interpreta** el documento,
  solo trocea, y todo lo que no encaje acaba en `unparsedRows` (R13) o en el
  rechazo por cabecera ausente (R4). El lector vive en su propio archivo y con su
  propio test.

### 3.2 La codificación — **ADR-020: el alcance de la regla de la F17** (R2, R3)

La regla de la F17 se acota, **no se debilita**:

> Lo que el **humano escribe** se guarda en UTF-8 (F17, ADR-018, sin cambios).
> Lo que el **banco emite** se descodifica con la codificación **de ese banco**,
> declarada explícitamente en su parser. Ningún parser adivina la codificación,
> ninguno hace *fallback* y ninguno repara: siguen siendo las tres prohibiciones
> del ADR-018.

Consecuencias concretas:

- MyInvestor y N26 siguen con `decodeUtf8Strict`. **Ni una línea suya cambia**, y
  su guardia sigue rechazando el fichero que el humano guardó en cp1252.
- Openbank usa `decodeCp1252Strict`, que es la misma doctrina con otra tabla:
  `new TextDecoder('windows-1252', { fatal: true })` (sin dependencias, ICU de
  Node) **más el mismo guardián del carácter de sustitución** que ya tiene
  `utf8.ts`, reutilizado y no copiado. Así se cumple lo exigido: ningún concepto
  llega al volcado con un `U+FFFD` dentro.
- **La guardia que falta y que este diseño añade (R3):** cp1252 no falla casi
  nunca, así que un fichero que llegara en UTF-8 se descodificaría como cp1252
  produciendo mojibake (`Ó` → `Ã“`) **sin `U+FFFD` y sin fallo aparente** — el
  daño exacto de la F17, en espejo. Por eso el parser **exige que el fichero
  declare su codificación**: lee el `<meta http-equiv="Content-Type">` y si no
  dice `iso-8859-1` o `windows-1252`, rechaza el fichero entero con
  `UnexpectedEncodingError`. Es determinista y no es adivinar: el criterio es lo
  que el propio fichero afirma.

### 3.3 Dónde escribe el humano el IBAN — **comentario HTML en la primera línea** (R11)

```html
<!-- iban;ES9121000418450200051332 -->
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" …>
```

(IBAN de ejemplo: el **público de la documentación española**, nunca uno real.)

- **Por qué ahí:** es la primera línea del fichero (se ve al abrirlo, es difícil
  ponerlo «en el sitio equivocado»), es HTML **válido** —Excel y cualquier
  navegador lo ignoran, así que el fichero se sigue abriendo igual—, y mantiene
  la forma `etiqueta;valor` que el humano ya usa en MyInvestor: una sola manera
  de escribir un dato a mano en todo el proyecto.
- **Se lee solo de un comentario anterior a `<table>`**, y gana el primero. Nunca
  se infiere un IBAN por su forma dentro de un concepto ni del CCC del preámbulo
  (R11), misma regla desde la F12.
- **Sobre «que volver a descargar el fichero no la borre»:** un fichero nuevo del
  banco no trae el comentario, pero **tampoco lo necesita**: el IBAN se escribe
  **una sola vez** para crear la cuenta y los ficheros siguientes se importan
  contra la cuenta ya existente (F12, `MISSING_ACCOUNT_DATA` solo aparece si ese
  banco no tiene exactamente una cuenta). Lo que sí hay que decir en el runbook:
  **el fichero no se vuelve a guardar con Excel** (lo reescribiría entero).

### 3.4 El preámbulo (R9, R12)

- Se leen **solo** las filas etiqueta+valor cuya primera celda normalizada (sin
  acentos, sin mayúsculas, sin espacios ni `:` final) sea `saldo`. El resto
  —fecha de descarga, número de cuenta, descripción, titular— se ignora **en
  silencio**: son filas legítimas del banco y no hay nada que mirar en ellas.
- El valor de `Saldo:` trae la divisa pegada; `parseAmountText` acepta y descarta
  el sufijo no numérico.
- Lo que se considera «fila de movimiento» es **posición + forma**: `<tr>`
  posterior a la cabecera con exactamente 5 celdas no vacías. Las filas
  decorativas (8 o 10 celdas, todas vacías) no lo son y no ensucian
  `unparsedRows`.

## 4. Errores

| Situación | Sale como |
|---|---|
| El fichero no declara iso-8859-1/windows-1252 | `UnexpectedEncodingError` (`UNEXPECTED_ENCODING`, 422) — fichero entero |
| Bytes que la tabla cp1252 no puede descodificar, o `U+FFFD` en el texto | `UnexpectedEncodingError` con motivo distinto — fichero entero |
| Sin cabecera reconocible | `ValidationError` — fichero entero |
| Fila con forma de movimiento ilegible | `unparsedRows` (nunca lanza) |
| `Saldo:` presente e ilegible | `unparsedRows` (nunca lanza) |

Los tres primeros viajan por el camino de **fallo por archivo** de la F12/F17
(`failed[]` dentro de un 200); el fichero no se mueve a `procesados/`.

## 5. Alternativas descartadas

1. **Añadir `cheerio`/`node-html-parser`.** Descartada: dependencia nueva para
   trocear una tabla plana generada por máquina (§3.1). Viva como alternativa en
   la hoja de decisiones.
2. **Que el humano convierta el fichero a CSV/UTF-8 cada mes.** Descartada por el
   `intent` («no quiero convertir el archivo a mano cada mes») y porque los dos
   incidentes previos del proyecto salieron de pasos manuales mensuales.
3. **Derivar el IBAN del CCC** (cálculo cerrado y determinista). Descartada por
   el humano el 2026-08-17: código nuevo que probar frente a una línea escrita
   una vez.
4. **Guardar el `balance` por línea** que este banco sí trae. Descartada por el
   humano; ADR-013 no se toca. El dato existe y queda anotado en el informe para
   que la decisión futura no haya que redescubrirla.
5. **Reutilizar `myinvestor.format.ts`** (la convención numérica coincide).
   Descartada por la norma «un parser por banco»: el formato de Openbank puede
   cambiar sin avisar y arrastraría a MyInvestor.
6. **Fallback en cascada UTF-8 → cp1252.** Descartada: es adivinar la
   codificación, prohibido por ADR-018 §Alternativa descartada. R3 resuelve lo
   mismo leyendo lo que el fichero **declara**.

## 6. Datos reales (ADR-017)

Los fixtures son **HTML sintético** escrito a mano en `openbank.fixture.ts`:
importes inventados, conceptos inventados, titular inventado, IBAN el público de
la documentación. El informe describe **la forma** (recuentos, columnas,
codificación), nunca el contenido. Antes de cerrar se ejecuta
`npx vitest run src/no-real-data.test.ts` con su capa de comparación contra
`var/`, que es la que detecta un nombre de persona copiado sin querer.
