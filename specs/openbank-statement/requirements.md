# Requirements — F19 `openbank-statement`

> Notación EARS (`docs/specs.md`). Fuente de verdad: el bloque `intent` de la
> feature 19 en `feature_list.json`. El `acceptance` es derivación técnica.
>
> 🔒 Ni un dato del fichero real aparece aquí: solo la **forma** medida en
> [`progress/explorations/inventario-bancos-2026-08-17.md`](../../progress/explorations/inventario-bancos-2026-08-17.md)
> §Openbank y en la lectura de estructura del 2026-08-17 (212 `<tr>`, 200 de
> movimiento con 5 celdas, preámbulo de filas etiqueta+valor, cabecera en la fila
> 11, orden de más reciente a más antiguo, `<meta charset="iso-8859-1">`).

## R1

El sistema DEBE devolver, al parsear un extracto de Openbank, un valor del
contrato común `ParsedStatement<'openbank'>` de
[`src/lib/parsed-statement.ts`](../../src/lib/parsed-statement.ts), sin declarar
en el módulo del banco ningún `ParsedMovement`, `UnparsedRow` ni
`ParsedMovementType` propios.

## R2

El sistema DEBE descodificar los bytes del fichero de Openbank como
**windows-1252**, que es la codificación que emite el banco, y NO DEBE usar
`toString('utf8')` ni `decodeUtf8Strict` para este banco.

## R3

SI el fichero no declara `iso-8859-1` ni `windows-1252` en su `<meta
http-equiv="Content-Type">`, O el texto ya descodificado contiene el carácter de
sustitución `U+FFFD`, ENTONCES el sistema DEBE rechazar el **fichero entero** con
un error por archivo cuyo motivo diga qué se esperaba y qué se encontró, sin
emitir ningún movimiento.

## R4

SI el documento no contiene una fila de cabecera reconocible (una `<tr>` cuyas
celdas de texto sean las cinco etiquetas de la tabla de movimientos) ENTONCES el
sistema DEBE lanzar `ValidationError` indicando que el fichero no es un extracto
de Openbank.

## R5

CUANDO el sistema recorre el documento, DEBE emitir **un movimiento por cada
`<tr>` de la tabla posterior a la cabecera que tenga las cinco celdas
esperadas**, sin recortar por fecha, sin limitar al mes en curso y sin
deduplicar: el fichero de 200 filas de movimiento produce 200 movimientos aunque
se remonten dos años atrás.

## R6

CUANDO el sistema lee las celdas de fecha de una fila de movimiento
(`DD/MM/AAAA`), DEBE emitir `bookingDate` y `valueDate` en ISO `AAAA-MM-DD`.

## R7

CUANDO el sistema lee la celda de importe (punto de miles y coma decimal, signo
negativo delante), DEBE emitir `amount` como número con su signo, sin redondeos
ni reformateos.

## R8

El sistema DEBE emitir `balance: null` y `currency: ''` en **todos** los
movimientos de Openbank, aunque la quinta celda de cada fila traiga el saldo tras
el movimiento y el preámbulo traiga la divisa: el saldo por línea se lee para
validar la forma de la fila, pero NO se guarda (ADR-013 intacto).

## R9

CUANDO el preámbulo contiene una fila etiqueta+valor cuya etiqueta normalizada es
`saldo`, el sistema DEBE emitir su valor en `accountBalance`, descartando el
sufijo de divisa que acompaña al número; si esa fila no existe, `accountBalance`
DEBE ser `null`.

## R10

SI la fila etiquetada `saldo` existe pero su valor no se interpreta como número
ENTONCES el sistema DEBE añadir una entrada a `unparsedRows` con el número de
fila (1-based) y el motivo, y DEBE seguir parseando el resto del fichero.

## R11

CUANDO el fichero contiene, **antes de la etiqueta `<table>`**, un comentario
HTML de la forma `<!-- iban;<IBAN> -->`, el sistema DEBE emitir ese IBAN en
`accountIban`; si no lo contiene, `accountIban` DEBE ser `null` y el sistema NO
DEBE derivarlo, calcularlo ni adivinarlo a partir del número de cuenta (CCC) del
preámbulo ni de ningún concepto.

## R12

El sistema NO DEBE añadir a `unparsedRows` ninguna fila del preámbulo ni ninguna
fila decorativa (separadores, títulos, la fila de cierre final, la fila de
cabecera y las filas etiqueta+valor de fecha de descarga, número de cuenta,
descripción del producto y titular).

## R13

SI una fila con la forma de una fila de movimiento no se interpreta (fecha,
importe o número de celdas inválidos) ENTONCES el sistema DEBE añadirla a
`unparsedRows` con su número de fila 1-based dentro del documento y el motivo, y
NO DEBE descartarla en silencio.

## R14

El sistema DEBE delegar la numeración dentro del día en
[`assignDaySequence`](../../src/lib/parsed-statement.ts#L108) declarando el orden
`newest-first` (Openbank exporta del más reciente al más antiguo) y el tipo
ingreso/gasto/neutral en
[`deriveMovementTypeFromAmount`](../../src/modules/movements/movements.service.ts#L33),
sin reimplementar ninguna de las dos reglas.

## R15

CUANDO la aplicación arranca, DEBE exponer `POST /api/parser/openbank` y DEBE
incluir Openbank en el registro de parsers de
[`src/app.ts`](../../src/app.ts#L36) con la extensión `.xls`, de modo que
`POST /api/import` deje de reportar sus ficheros como `skipped`.

---

## Procedencia

- **R1** — (humano) Deriva de «no quiero que esto cambie los parsers de
  Bankinter, MyInvestor ni N26» + norma `docs/conventions.md` §Parsers de banco.
- **R2** — (delegado) `delego_en_agente` nº 2. Decido **descodificar cp1252 en el
  parser de Openbank** en vez de exigir UTF-8 o reconvertir a mano. Alternativa
  descartada: que el humano reguarde el fichero cada mes (paso manual recurrente,
  justo lo que la feature quiere quitar).
- **R3** — (añadido) El humano no dijo qué pasa el día que Openbank cambie de
  codificación. Sin esta guardia, un fichero UTF-8 descodificado como cp1252
  produce mojibake **sin `U+FFFD`**: corrupción silenciosa, exactamente el daño
  que la F17 fue a evitar. Propongo exigir que el fichero **declare** su
  codificación. ← REVISAR EN APROBACIÓN.
- **R4** — (añadido) Qué pasa con un fichero que no es un extracto de Openbank.
  Se reutiliza la doctrina de MyInvestor (sin cabecera → `ValidationError`).
- **R5** — (humano) «quiero el histórico entero, no solo el mes» y «entran los 200
  movimientos, incluidos los de 2024 y 2025».
- **R6, R7** — (humano) «subo el archivo tal y como lo descargo… y sus movimientos
  entran»; el formato español está medido en la exploración.
- **R8** — (humano) «no quiero que se empiece a guardar el saldo que el archivo
  trae después de cada movimiento». El `currency: ''` es (añadido): el fichero no
  tiene columna de divisa y el contrato pide `''` cuando no la hay; la divisa que
  acompaña al saldo del preámbulo NO se propaga a los movimientos. ← REVISAR.
- **R9, R10** — (humano) «el saldo de la cuenta lo lee del propio archivo, que ya
  lo trae: ese no lo escribo yo». R10 replica la doctrina del ADR-019 §6
  (etiqueta presente + valor ilegible → `unparsedRows`, nunca silencio).
- **R11** — (delegado) `delego_en_agente` nº 3. Decido el **comentario HTML en la
  cabecera del fichero** como sitio del IBAN. Alternativas descartadas: una línea
  suelta sobre el `<!DOCTYPE>` (rompe el fichero para Excel y para cualquier
  lector) y una `<tr>` nueva dentro de la tabla (el humano tendría que escribir
  HTML bien formado a mano). El «no derivar del CCC» es (humano).
- **R12** — (delegado) `delego_en_agente` nº 4 + lección de la F16: `unparsedRows`
  señala lo que hay que mirar, y ruido permanente lo inutiliza.
- **R13** — (añadido) La contrapartida de R12: lo que **tiene forma de
  movimiento** y no se entiende sí se reporta. Es la doctrina ya vigente en
  MyInvestor.
- **R14** — (humano, indirecto) Norma `docs/conventions.md`: la numeración y la
  regla del signo no se reimplementan. El `newest-first` es (delegado): medido en
  el fichero real (primera fila 2026, última 2024).
- **R15** — (humano) «subo el archivo tal y como lo descargo de Openbank y sus
  movimientos entran» exige el registro de ADR-015; la ruta replica lo que ya
  tienen Bankinter y MyInvestor.

### Cobertura de `como_se_que_esta_bien`

| Punto del `intent` | Requirements |
|---|---|
| Se sube tal y como se descarga, sin convertir | R2, R3, R5, R15 |
| Entran los 200 movimientos, histórico entero | R5, R6, R7 |
| El saldo de la cuenta sale del propio archivo | R9, R10 |
| El IBAN lo escribe él una sola vez | R11 |
