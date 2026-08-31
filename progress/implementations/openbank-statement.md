# openbank-statement (F19) — implementación

> Feature **SDD**. Los cinco lotes de
> [`tasks.md`](../../specs/openbank-statement/tasks.md) (A→E, T1-T29) los ejecutó
> **un solo implementer**, en orden de dependencia, y están todos marcados `[x]`.
>
> 🔒 **Ni un dato del fichero real aparece aquí.** El fichero de Openbank trae el
> **nombre del titular** y nombres de terceros dentro de los conceptos: este
> informe describe **la forma** (recuentos, columnas, codificación) y **nunca el
> contenido**. Los fixtures son HTML sintético construido en código.

## Archivos modificados / creados

### Nuevos

| Archivo | Qué es |
|---|---|
| [`src/lib/cp1252.ts`](../../src/lib/cp1252.ts) | `decodeCp1252Strict` ([:45](../../src/lib/cp1252.ts#L45)) — la codificación que emite el banco. Vive en `lib/` por el mismo razonamiento que `utf8.ts`: la codificación no es un formato |
| [`src/lib/cp1252.test.ts`](../../src/lib/cp1252.test.ts) | 10 tests |
| [`src/modules/openbank/openbank.html.ts`](../../src/modules/openbank/openbank.html.ts) | lector de la tabla **sin dependencias**: `readHtmlTableRows` ([:54](../../src/modules/openbank/openbank.html.ts#L54)), `readDeclaredCharset` ([:110](../../src/modules/openbank/openbank.html.ts#L110)), `readHtmlComments` ([:129](../../src/modules/openbank/openbank.html.ts#L129)) |
| [`src/modules/openbank/openbank.format.ts`](../../src/modules/openbank/openbank.format.ts) | `parseStatementDate` ([:21](../../src/modules/openbank/openbank.format.ts#L21)) y `parseAmountText` ([:57](../../src/modules/openbank/openbank.format.ts#L57)), **propios del banco** |
| [`src/modules/openbank/openbank.statement.parser.ts`](../../src/modules/openbank/openbank.statement.parser.ts) | `parseOpenbankStatement` ([:95](../../src/modules/openbank/openbank.statement.parser.ts#L95)) |
| [`src/modules/openbank/openbank.types.ts`](../../src/modules/openbank/openbank.types.ts) | `OpenbankStatementResult = ParsedStatement<'openbank'>` ([:30](../../src/modules/openbank/openbank.types.ts#L30)) + resúmenes de ejecución local |
| [`src/modules/openbank/openbank.fixture.ts`](../../src/modules/openbank/openbank.fixture.ts) | HTML **sintético** en memoria ([:63](../../src/modules/openbank/openbank.fixture.ts#L63)) |
| [`src/modules/openbank/openbank.service.ts`](../../src/modules/openbank/openbank.service.ts) | recorre `var/drive-read/openbank/<año>/` y vuelca JSON ([:42](../../src/modules/openbank/openbank.service.ts#L42)) |
| [`src/modules/openbank/openbank.routes.ts`](../../src/modules/openbank/openbank.routes.ts) | `POST /api/parser/openbank` ([:30](../../src/modules/openbank/openbank.routes.ts#L30)) |
| …y sus 5 archivos de test (`*.html.test.ts`, `*.format.test.ts`, `*.statement.parser.test.ts`, `*.service.test.ts`, `*.routes.test.ts`) | |

### Modificados

| Archivo | Cambio |
|---|---|
| [`src/errors/app-error.ts`](../../src/errors/app-error.ts#L89) | `UnexpectedEncodingError` (`UNEXPECTED_ENCODING`, 422), con el porqué de no reutilizar `NOT_UTF8` escrito al lado |
| [`src/lib/utf8.ts`](../../src/lib/utf8.ts#L67) | se **extrae** `assertNoReplacementCharacter` a un export reutilizable. `decodeUtf8Strict` no cambia de comportamiento (test de regresión) |
| [`src/app.ts`](../../src/app.ts#L44) | una línea en el registro (`{ bank: 'openbank', extensions: ['.xls'], parse: parseOpenbankStatement }`) + registro de la ruta |
| [`src/architecture.test.ts`](../../src/architecture.test.ts) | árbol esperado (módulo + `lib/cp1252*`), guardián «sin prisma» del módulo nuevo, `bankModules` a **cuatro** bancos y `normalizeBankName('Openbank')` |
| `docs/architecture.md` | **ADR-022** + nota en ADR-018 |
| `docs/conventions.md` | §Parsers de banco: codificación por banco, lector de HTML dentro del módulo, preámbulo en formatos que no son texto plano |
| `docs/dar-de-alta-un-banco.md` | §nueva del IBAN en HTML + §de codificación acotada + §del caso Openbank |
| `docs/api-contract.md` | código `UNEXPECTED_ENCODING` (tabla estable, nota y tabla por archivo de `/api/import`) + **§Parser de Openbank** completa |
| `docs/roadmap.md` | E4 a **4 de 6 bancos**, Openbank ✅, quedan **2 parsers** |
| `specs/openbank-statement/tasks.md` | T1-T29 marcadas `[x]` |

## Decisiones tomadas

### 1. El HTML se lee con código nuestro, sin dependencia nueva (criterio 2)

`exceljs` no sirve (no hay ZIP ni OOXML) y `cheerio` quedó descartado por el
humano. El lector ([`openbank.html.ts`](../../src/modules/openbank/openbank.html.ts))
**no interpreta** el documento: lo trocea con tres expresiones regulares
acotadas, quita los tags interiores, resuelve entidades y colapsa espacios. Lo
que no encaje acaba en `unparsedRows` o rechaza el fichero por cabecera ausente.
Vive **dentro del módulo del banco**, como el lector de CSV entrecomillado de
N26: la norma no es «no compartir lo difícil», es no compartir el código que lee
un formato.

**La forma medida del fichero** (solo forma): XHTML con `<meta http-equiv` que
declara `iso-8859-1`, una sola `<table>` de **212 `<tr>`**; cada fila tiene
**diez celdas** —cinco separadores decorativos vacíos alternados con cinco de
contenido—; preámbulo de filas etiqueta+valor, **cabecera de cinco nombres**,
**200 filas de movimiento** y una fila de cierre; sin tablas anidadas, sin
entidades HTML y con solo 8 bytes > 127 en 165 KB. Una fila de movimiento se
reconoce por **posición + forma**: posterior a la cabecera y con exactamente
cinco celdas con algo.

### 2. Decisión delegada nº 2 — el alcance de la regla de codificación (criterio 9)

Resuelta **por escrito** en el **ADR-022** de `docs/architecture.md`, en
`docs/conventions.md` §Parsers de banco y en `docs/dar-de-alta-un-banco.md`
(§«Lo que escribes TÚ se guarda en UTF-8; lo que emite el banco, como lo emita»).
En una línea: **la regla se acota por quién escribe el fichero, no se debilita.**

- Lo que escribe el humano sigue yendo en UTF-8 y `decodeUtf8Strict` **no cambia
  ni una línea** — hay test de regresión que lo fija
  ([`utf8.test.ts:111`](../../src/lib/utf8.test.ts#L111)).
- Lo que emite el banco se lee con la codificación **de ese banco**, declarada en
  su parser ([`openbank.statement.parser.ts:21`](../../src/modules/openbank/openbank.statement.parser.ts#L21)).
- **Ningún concepto llega al volcado con un carácter de sustitución dentro**: el
  guardián del `U+FFFD` se **extrajo** de `utf8.ts` y lo usan los dos
  descodificadores; el motivo y el código los pone quien llama.

🔴 **Hallazgo medido que obligó a añadir una guardia que el diseño ya anticipaba
(R3):** en Node 24, `TextDecoder('windows-1252', { fatal: true })` **mapea los
256 bytes** (los cinco no asignados salen como su control C1) y por tanto **no
lanza nunca**. Consecuencia: un fichero que llegara en UTF-8 se leería como
cp1252 y produciría mojibake **sin un byte inválido, sin `U+FFFD` y sin ningún
error** — el daño de la F17 en espejo. Por eso el parser exige que el fichero
**declare** su codificación (`assertDeclaredEncoding`,
[:173](../../src/modules/openbank/openbank.statement.parser.ts#L173)) y rechaza
el fichero entero si no lo hace. La declaración se lee de los **bytes crudos**
(mapeo 1:1 `latin1` del `<head>`) porque hay que leerla **antes** de decidir cómo
descodificar, y un `<meta>` es ASCII en cualquiera de las codificaciones
candidatas. El test que lo fija: [`cp1252.test.ts:11`](../../src/lib/cp1252.test.ts#L11)
(«maps every one of the 256 bytes, which is WHY R3 exists»).

### 3. Decisión delegada nº 3 — dónde escribe el humano el IBAN (criterio 8)

Resuelta **por escrito** en `docs/dar-de-alta-un-banco.md` §«Si el fichero del
banco es HTML: el IBAN va en un comentario de la primera línea»:

```html
<!-- iban;ES9121000418450200051332 -->
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" ...>
```

(IBAN público de la documentación española.) Por qué ahí: se ve al abrir el
fichero, es difícil ponerlo mal —o está en la primera línea o no está—, es HTML
**válido** (Excel y el navegador lo ignoran, el fichero se sigue abriendo igual)
y mantiene la forma `etiqueta;valor` del resto del proyecto. Se lee **solo** de
un comentario **anterior a `<table>`**, gana el primero, con `:` no se lee
(F21) y el IBAN se normaliza y valida con
[`readPreambleIban`](../../src/lib/iban.ts) como en los otros tres bancos.
**Volver a descargar el fichero no «borra» nada que haga falta:** el IBAN se
escribe **una sola vez**, para crear la cuenta; los ficheros siguientes se
importan contra la cuenta que ya existe. Lo que sí queda dicho en el runbook, en
🔴: **no volver a guardar el fichero con Excel.**

### 4. ⛔ REVERTIDA POR LA F31 — el saldo tras cada movimiento ya NO se descarta

> **Esta decisión de la F19 está revertida.** Lo que sigue se conserva tal cual
> se escribió porque explica **por qué** se tiró el dato en su día; lo que vale
> **hoy** es lo que dice el recuadro del final de la sección: el saldo por línea
> **se guarda**. Si vuelves a leer esto y te dan ganas de «restaurar» el `null`,
> no lo hagas: la F31 lo quitó a propósito.

**Que quede constancia, para que la decisión futura no haya que redescubrirla:**
la **quinta celda de cada fila de movimiento es el saldo posterior a ese
movimiento**, y Openbank es el **único de los seis bancos** que lo reporta. Este
parser **lo lee** —una fila cuya quinta celda no es un importe no es una fila de
esta tabla— y ~~lo **descarta**: `balance` sale `null` en **todos** los
movimientos~~, igual que en Bankinter, MyInvestor y N26, y **el ADR-013 no se
toca en esta feature**. Es decisión del humano del 2026-08-17, ratificada en la
puerta del 2026-08-19. Está anotado también en `docs/api-contract.md` §Parser de
Openbank y en el comentario de cabecera del parser
([:75](../../src/modules/openbank/openbank.statement.parser.ts#L75)). El día que
se decida guardarlo, el dato está ahí y solo hay que dejar de tirarlo.

Coste explícito de leerlo: una fila con fecha, concepto e importe perfectos pero
con la quinta celda ilegible **se reporta** en `unparsedRows` en vez de entrar.
Se eligió a conciencia (R8 dice «se lee para validar la forma de la fila»):
reportar es recuperable, aceptar una fila que ya no sabemos qué es, no. **Esa
mitad NO cambia con la F31**: sigue reportándose igual.

**⏩ Estado actual (F31 `real-account-balance`, lote A, 2026-08-25).** «El día
que se decida guardarlo» llegó: `parseMovementRow` devuelve el importe de la
quinta celda en `balance`, y ya no `null`. El motivo es que el saldo de una
cuenta se calcula desde un **ancla** (importe + fecha tomados del archivo), y
esta columna es el ancla de este banco; tirándola, el saldo real no se podía
derivar sin volver a leer el fichero. Requisito: `specs/real-account-balance/`
§R11. **La F31 NO deroga el ADR-013 desde aquí** — eso lo hace ella misma en
`docs/architecture.md`; lo que cambia en este módulo es solo el valor del campo.

### 5. La divisa de cada movimiento queda vacía (criterio confirmado nº 6)

`currency: ''` en los 200 movimientos. El fichero **no tiene columna de divisa**;
la única que aparece va pegada al saldo del preámbulo (`1.234,56 EUR`) y
`parseAmountText` la **descarta** sin propagarla. Es todo euros, pero el dato no
está en el fichero y el contrato dice que lo que no viene, va vacío.

### 6. El preámbulo: solo `Saldo:`, y el resto en silencio (criterio 10)

Se lee **únicamente** la fila cuya etiqueta normalizada es `saldo`
([:284](../../src/modules/openbank/openbank.statement.parser.ts#L284)); fecha de
descarga, número de cuenta (que es un **CCC**, no un IBAN), descripción y titular
se ignoran **sin dejar rastro en `unparsedRows`**. Las filas decorativas (todas
sus celdas vacías) tampoco lo ensucian. Si la fila `Saldo:` está y su valor no se
entiende → `unparsedRows` con su nº de fila y motivo, y el resto del fichero se
parsea igual (doctrina del ADR-019).

### 7. Numeración de fila en `unparsedRows`

`row` es el **número de `<tr>` del documento** (1-based, contando las
decorativas). Este fichero no tiene líneas útiles —está escrito casi entero en
una sola— así que «la fila N de la tabla» es la referencia que una persona puede
encontrar de verdad al abrirlo. Queda dicho en el contrato del endpoint.

### 8. Divergencia de numeración del ADR (única desviación respecto al spec)

El `design.md` de esta feature llamaba **ADR-020** al ADR de codificación. Ese
número lo ocupa la F18 (concepto compuesto de N26) y el **021** la F21 (IBAN),
ambas cerradas **después** de escribirse ese spec. El ADR se ha escrito como
**ADR-022**, con el mismo contenido; la nota de numeración queda dentro del
propio ADR. **No cambia ninguna decisión.**

## Trazabilidad — cada `R<n>` con su(s) test(s)

| Req | Test |
|---|---|
| **R1** contrato común `ParsedStatement<'openbank'>` | [`openbank.statement.parser.test.ts:27`](../../src/modules/openbank/openbank.statement.parser.test.ts#L27) («the shared contract») + guardián de [`architecture.test.ts`](../../src/architecture.test.ts) («declares the parsed movement contract in ONE module only») |
| **R2** descodificar en cp1252 | [`parser.test.ts:52`](../../src/modules/openbank/openbank.statement.parser.test.ts#L52) · [`cp1252.test.ts:11`](../../src/lib/cp1252.test.ts#L11) · [`cp1252.test.ts:111`](../../src/lib/cp1252.test.ts#L111) (los dos descodificadores siguen independientes) · [`utf8.test.ts:111`](../../src/lib/utf8.test.ts#L111) (MyInvestor no se debilita) |
| **R3** sin `iso-8859-1`/`windows-1252` declarado → rechazo entero; `U+FFFD` → rechazo | [`parser.test.ts:69`](../../src/modules/openbank/openbank.statement.parser.test.ts#L69) (3 tests) · [`openbank.html.test.ts:76`](../../src/modules/openbank/openbank.html.test.ts#L76) · [`cp1252.test.ts:46`](../../src/lib/cp1252.test.ts#L46) y [`:86`](../../src/lib/cp1252.test.ts#L86) |
| **R4** sin cabecera reconocible → `ValidationError` | [`parser.test.ts:101`](../../src/modules/openbank/openbank.statement.parser.test.ts#L101) (3 tests) |
| **R5** un movimiento por fila, histórico entero, sin dedup | [`parser.test.ts:122`](../../src/modules/openbank/openbank.statement.parser.test.ts#L122) (3 tests, incluido el de **200 movimientos de tres años**) · [`openbank.html.test.ts:14`](../../src/modules/openbank/openbank.html.test.ts#L14) |
| **R6** fechas `DD/MM/AAAA` → ISO | [`openbank.format.test.ts:5`](../../src/modules/openbank/openbank.format.test.ts#L5) (5 tests) · [`parser.test.ts:176`](../../src/modules/openbank/openbank.statement.parser.test.ts#L176) |
| **R7** importe con signo, punto de miles y coma decimal | [`openbank.format.test.ts:35`](../../src/modules/openbank/openbank.format.test.ts#L35) (7 tests) · [`parser.test.ts:183`](../../src/modules/openbank/openbank.statement.parser.test.ts#L183) |
| **R8** ~~`balance: null`~~ (**revertido por la F31**: `balance` trae el saldo de la quinta celda) y `currency: ''` en todos | [`parser.test.ts:192`](../../src/modules/openbank/openbank.statement.parser.test.ts#L192) (3 tests, incluido el de la quinta celda ilegible) |
| **R9** `accountBalance` de la fila `Saldo:`, divisa descartada | [`parser.test.ts:215`](../../src/modules/openbank/openbank.statement.parser.test.ts#L215) (4 tests) · [`openbank.format.test.ts:35`](../../src/modules/openbank/openbank.format.test.ts#L35) («discards the currency…») |
| **R10** `Saldo:` ilegible → `unparsedRows` con nº de fila | [`parser.test.ts:231`](../../src/modules/openbank/openbank.statement.parser.test.ts#L231) |
| **R11** IBAN del comentario, nunca derivado del CCC | [`parser.test.ts:254`](../../src/modules/openbank/openbank.statement.parser.test.ts#L254) (7 tests) · [`openbank.html.test.ts:94`](../../src/modules/openbank/openbank.html.test.ts#L94) (4 tests) |
| **R12** preámbulo y decorativas fuera de `unparsedRows` | [`parser.test.ts:320`](../../src/modules/openbank/openbank.statement.parser.test.ts#L320) (3 tests) |
| **R13** fila con forma de movimiento ilegible → reportada | [`parser.test.ts:346`](../../src/modules/openbank/openbank.statement.parser.test.ts#L346) (3 tests) |
| **R14** `assignDaySequence('newest-first')` + `deriveMovementTypeFromAmount` | [`parser.test.ts:381`](../../src/modules/openbank/openbank.statement.parser.test.ts#L381) (4 tests) + guardián de [`architecture.test.ts`](../../src/architecture.test.ts) («takes the income/expense/neutral decision in a single place») |
| **R15** `POST /api/parser/openbank` + registro | [`openbank.routes.test.ts`](../../src/modules/openbank/openbank.routes.test.ts) (8 tests) · [`openbank.service.test.ts:23`](../../src/modules/openbank/openbank.service.test.ts#L23) (6 tests) |

## Trazabilidad — cada criterio de `acceptance` con su(s) test(s)

| # | Criterio (resumido) | Dónde se comprueba |
|---|---|---|
| 1 | Módulo propio, sin heredar una línea de los otros tres parsers | [`architecture.test.ts`](../../src/architecture.test.ts) «shares no parsing code between bank modules», ahora con **cuatro** bancos (imports prohibidos, nadie fuera del módulo lo nombra salvo `app.ts`, y ningún banco nombra a otro) |
| 2 | Se lee tal y como se descarga; es HTML, `exceljs` no se intenta | [`openbank.html.test.ts`](../../src/modules/openbank/openbank.html.test.ts) (16 tests) · el módulo no importa `exceljs` (guardián de imports permitidos del punto 1) |
| 3 | Entra el histórico entero, 2024 y 2025 incluidos | [`parser.test.ts:139`](../../src/modules/openbank/openbank.statement.parser.test.ts#L139) y [`:149`](../../src/modules/openbank/openbank.statement.parser.test.ts#L149) |
| 4 | Fechas y números españoles, en **su** módulo | [`openbank.format.test.ts`](../../src/modules/openbank/openbank.format.test.ts) (12 tests) + el guardián de imports impide traerse los de MyInvestor |
| 5 | El saldo de la cuenta sale del preámbulo del fichero; aquí él no escribe `saldo;…` | [`parser.test.ts:215`](../../src/modules/openbank/openbank.statement.parser.test.ts#L215) · [`service.test.ts:24`](../../src/modules/openbank/openbank.service.test.ts#L24) (`accountBalance` en el resumen) |
| 6 | El saldo tras cada movimiento se lee y **no** se guarda; el informe deja constancia — **⛔ criterio revertido por la F31**, que sí lo guarda (ver §Decisiones nº 4) | [`parser.test.ts:192`](../../src/modules/openbank/openbank.statement.parser.test.ts#L192) + **§Decisiones nº 4** de este informe |
| 7 | El IBAN no se deriva del CCC | [`parser.test.ts:274`](../../src/modules/openbank/openbank.statement.parser.test.ts#L274) (comprueba además que el CCC del preámbulo **no aparece** en el resultado) |
| 8 | **Delegada:** dónde escribe el IBAN → runbook | `docs/dar-de-alta-un-banco.md` §nueva + **§Decisiones nº 3** · tests: [`parser.test.ts:254`](../../src/modules/openbank/openbank.statement.parser.test.ts#L254), [`html.test.ts:94`](../../src/modules/openbank/openbank.html.test.ts#L94) |
| 9 | **Delegada:** alcance de la regla de codificación → `docs/` + ADR, sin debilitar MyInvestor | **ADR-022** + `conventions.md` + runbook · tests: [`utf8.test.ts:111`](../../src/lib/utf8.test.ts#L111) (regresión), [`cp1252.test.ts:111`](../../src/lib/cp1252.test.ts#L111), [`parser.test.ts:52`](../../src/modules/openbank/openbank.statement.parser.test.ts#L52) (`JSON.stringify(result)` sin un solo `U+FFFD`) |
| 10 | El preámbulo no ensucia `unparsedRows` | [`parser.test.ts:320`](../../src/modules/openbank/openbank.statement.parser.test.ts#L320) |
| 11 | Contrato común, `deriveMovementTypeFromAmount`, `assignDaySequence` | [`parser.test.ts:27`](../../src/modules/openbank/openbank.statement.parser.test.ts#L27) y [`:381`](../../src/modules/openbank/openbank.statement.parser.test.ts#L381) + los dos guardianes de `architecture.test.ts` |
| 12 | `POST /api/parser/openbank` + registro de `src/app.ts` (deja de ser `skipped`) | [`routes.test.ts:117`](../../src/modules/openbank/openbank.routes.test.ts#L117), [`:139`](../../src/modules/openbank/openbank.routes.test.ts#L139) y [`:156`](../../src/modules/openbank/openbank.routes.test.ts#L156) |
| 13 | 🔒 Ni un dato real del fichero en un archivo versionado — **nombres, conceptos, CCC, IBAN e importes** (🔒 de [`tasks.md:8`](../../specs/openbank-statement/tasks.md#L8), y el ADR-017 va de datos financieros, no solo de personas) | **Incumplido en la primera pasada por los IMPORTES y corregido en la segunda** (ver §Segunda pasada): hoy, verificación explícita contra el fichero gitignoreado con la **misma regla del guardián de la F14** más la de **pares contiguos**, cero coincidencias · fixtures inventados ([`openbank.fixture.ts`](../../src/modules/openbank/openbank.fixture.ts)) · [`parser.test.ts:338`](../../src/modules/openbank/openbank.statement.parser.test.ts#L338) (ningún nombre del preámbulo en el resultado) · [`src/no-real-data.test.ts`](../../src/no-real-data.test.ts) en verde, **que para este banco no prueba nada**: su capa de comparación no lee `.xls` |
| 14 | Cada criterio con test sintético, sin red, mapeado aquí; `./init.sh` verde | esta tabla + §Último `./init.sh` |

## 🔒 Guardián de la F14: lo que se hizo para no repetir el susto de la F18

- **Los cinco nombres de columna nunca se escriben en secuencia.** Están en dos
  sitios ([`openbank.fixture.ts:29`](../../src/modules/openbank/openbank.fixture.ts#L29)
  y [`openbank.statement.parser.ts:26`](../../src/modules/openbank/openbank.statement.parser.ts#L26))
  y en los dos van **uno por línea con su comentario**, que es lo que rompe la
  secuencia de palabras que el guardián leería como copiada de `var/`.
  **Arreglado en la raíz: no se ha añadido ni un `no-real-data-ok`.**
- **Ningún dato del fichero real en el informe**: solo recuentos, estructura y
  codificación.
- Fixtures: conceptos, titular y CCC **inventados**; el IBAN es el **público de la
  documentación española** (ya en la lista blanca del guardián) y el segundo, el
  sintético que ya usaba el repo.
- 🔴 **Los IMPORTES no lo estaban en la primera pasada, y esta sección lo afirmaba.**
  Lo destapó el reviewer. Corregido en la **§Segunda pasada**, que es donde está
  contado de verdad; esta sección se deja con su error señalado en vez de
  reescrita, porque el error —«di por hecho que el 🔒 iba de nombres»— es la parte
  que hay que recordar.

## Último `./init.sh`

**Verde, con la suite completa.**

```
── 4. Type checking (tsc) ──   [OK] Type check OK (tsc sin errores)
── 5. Ejecutando tests ─────   Test Files  39 passed (39)
                               Tests  628 passed (628)
── 6. Resumen ──────────────   [OK] Entorno listo.
```

- **628 tests, 628 pasan, 0 saltados** (baseline **535** → **+93**).
- **El guardián de la F14 corrió con su capa de comparación ACTIVA**: sus 12
  tests en verde, incluidos los dos de comparación contra `var/` («repeats no
  telling amount…» y «copies no telling phrase…»), que se saltarían si `var/` no
  estuviera. Ninguno se saltó.
- `npx oxlint src/` limpio y `npx prettier --check` limpio sobre **todos** los
  archivos tocados por esta feature.
- **Ninguna dependencia nueva**: `package.json` no se ha tocado.
- ⚠️ **Un `./init.sh` intermedio salió en rojo con 1 test fallido y no se pudo
  identificar cuál** (la salida quedó truncada). Las **cuatro** ejecuciones
  siguientes de la suite completa —dos `./init.sh` y tres `vitest run` seguidos—
  salieron **628/628 en verde**, sin tocar nada entre medias. Queda anotado como
  posible **flakiness preexistente** de la suite de integración contra Postgres,
  que corre en paralelo; no se ha investigado más porque no es de esta feature y
  no se ha vuelto a reproducir. Si el reviewer lo ve otra vez, merece mirarse.

## Sugerencias fuera de scope (NO aplicadas)

1. **El árbol de `docs/architecture.md` (§Estructura) está desactualizado desde la
   F17.** Le faltan `lib/utf8.ts`, `lib/iban.ts` y el módulo `n26/` enteros —no
   solo lo de esta feature—. No se ha tocado para no arreglar aquí lo que arrastran
   tres features anteriores; el guardián que sí está al día es el de
   `architecture.test.ts`. Candidato a una limpieza de una sola pasada.
2. **`prettier --check` sigue fallando en
   `src/modules/myinvestor/myinvestor.product.parser.test.ts`**, como ya fallaba
   antes de esta feature (`init.sh` no lo ejecuta).
3. **La prueba real contra el fichero de Openbank del humano no se ha hecho**: este
   informe solo cubre fixtures sintéticos. Igual que en N26, conviene una pasada
   real de `POST /api/parser/openbank` y luego `POST /api/import` antes de dar la
   E4 por rodada — y **antes** hace falta que él escriba el comentario del IBAN.
4. ~~**El saldo por movimiento y el saldo de la cuenta siguen sin persistirse.**~~
   **Resuelto a medias por la F31 `real-account-balance`:** el saldo **por
   movimiento** ya se emite en `balance` (lote A de esa feature). El
   `accountBalance` del preámbulo lo consume el importador en el lote D de la
   misma feature. Cabo suelto cerrado; no volver a abrirlo aquí.
5. **`readHtmlComments` solo mira antes de `<table>`**, que es lo que pide R11. Si
   algún día otro banco HTML necesitara leer comentarios en otro sitio, se copia el
   patrón, no el módulo.

---

## §Segunda pasada — 2026-08-19 (review: CHANGES_REQUESTED, 5 puntos)

**Veredicto atendido:** [`progress/reviews/openbank-statement.md`](../reviews/openbank-statement.md).
Los cinco puntos eran **uno solo**: había **importes reales del extracto de
Openbank en archivos versionados**. Todo lo demás que el reviewer comprobó
—puerta de aprobación, guardia de la F17, ADR-013, contrato común, HTTP,
arquitectura, decisiones delegadas— quedó aprobado y **no se ha tocado nada de
eso**.

> 🔒 Como el informe también es un archivo versionado, aquí **no se reproduce ni
> una cifra real**, ni siquiera para decir cuál era. Se describe el arreglo y la
> comprobación.

### Qué estaba mal, dicho sin cifras

Los conceptos, el titular y el CCC estaban inventados desde el principio; **las
cifras no**. Al escribir el fixture tomé los importes del fichero real y les
cambié los saldos, con dos consecuencias que el reviewer detectó:

1. una fila entera —**el par (importe, saldo) contiguo**— era una fila real
   copiada tal cual;
2. los importes de otras cuatro filas eran reales **y en el mismo orden relativo**
   que las primeras filas del extracto, que es lo que convierte una lista de
   números en una huella reconocible;
3. el docstring de `parseAmountText` usaba como ejemplo **el saldo real de la
   cuenta** y tres importes reales, y tres `expect()` de `openbank.format.test.ts`
   aseveraban sobre esas mismas cifras;
4. el ejemplo de importe de la §Parser de Openbank de `docs/api-contract.md` era
   también real.

**La causa, para que no se repita:** leí el 🔒 del `acceptance` como «ni un
**nombre**» —que es lo que dice el criterio 13 del `intent`— y no como lo que
dice el 🔒 de [`tasks.md:8`](../../specs/openbank-statement/tasks.md#L8), «ni un
**importe**, concepto, IBAN, CCC ni nombre», que es además lo que protege el
ADR-017: **datos financieros**, no solo personas. Y no lo cazó nadie porque para
este banco **el guardián de la F14 está ciego** (su capa de comparación no lee
`.xls`), así que la suite en verde no significaba nada aquí.

### Qué se ha cambiado

| Archivo | Cambio |
|---|---|
| [`openbank.fixture.ts`](../../src/modules/openbank/openbank.fixture.ts) | **`openbankSampleRows()` reescrita entera**: los diez importes y los diez saldos son **inventados de cero** —no «perturbados»—, con **otro orden relativo** de magnitudes y **otros pares contiguos**. Se conservan las propiedades que los tests necesitan: punto de miles, coma decimal, **céntimos ≠ 00**, signo negativo y positivo, el `0,00` del caso `neutral`, el importe ilegible y las dos filas repetidas idénticas |
| [`openbank.fixture.ts:1`](../../src/modules/openbank/openbank.fixture.ts#L1) | **cabecera corregida**: ya no afirma que «todo» estaba inventado. Dice que las **cifras** son el punto fácil de fallar, cuenta que este archivo ya falló ahí, y deja la instrucción para quien las toque (inventar, nunca perturbar; cuidar los pares; comprobar contra `var/` antes de comitear) |
| [`openbank.format.ts`](../../src/modules/openbank/openbank.format.ts#L40) | docstring de `parseAmountText` con **ejemplos inventados**, incluido el del saldo con divisa pegada, y una nota de que un ejemplo en un comentario es un archivo versionado como cualquier otro |
| [`openbank.format.test.ts`](../../src/modules/openbank/openbank.format.test.ts#L35) | bloque de `parseAmountText` **reescrito** con cifras inventadas; las aserciones se **actualizaron**, ninguna se borró, y siguen cubriendo miles, coma decimal, signo, céntimos ≠ 00, cero, divisa descartada y los casos `null` |
| [`openbank.statement.parser.test.ts`](../../src/modules/openbank/openbank.statement.parser.test.ts) | la aserción del array de importes se actualiza a los nuevos valores; además se sustituyen las cifras «redondas» de las filas escritas al vuelo que coincidían con celdas del fichero real |
| [`openbank.html.test.ts`](../../src/modules/openbank/openbank.html.test.ts), [`cp1252.test.ts`](../../src/lib/cp1252.test.ts) | misma sustitución en los ejemplos de celda |
| [`docs/api-contract.md`](../../docs/api-contract.md) | el ejemplo de importe de la §Parser de Openbank pasa a ser inventado |
| este informe | corregidas las **dos afirmaciones falsas** (criterio 13 de la tabla y la viñeta de fixtures del §Guardián), en vez de reescritas: el error de lectura del 🔒 es lo que conviene que quede |

**Ni un `no-real-data-ok` nuevo.** Se ha arreglado en la raíz, cambiando las
cifras.

### Cómo se ha comprobado que las cifras nuevas no colisionan

Dos verificaciones, ambas contra el fichero **gitignoreado** de
`var/drive-read/openbank/` y ejecutadas desde un script temporal **fuera del
repositorio** (no se versiona nada que lea datos reales):

1. **La regla del propio guardián de la F14**, reimplementada igual que en
   [`src/no-real-data.test.ts`](../../src/no-real-data.test.ts) (`toNumber`,
   `significantDigits`, `isTelling` ≥ 4 dígitos significativos), aplicada al
   `.xls` que ese guardián **hoy no lee**, y cruzada contra **todos** los archivos
   versionados del repositorio (`git ls-files` + no ignorados). Se ignoran los
   números pegados a una palabra (`iso-8859-1`, `windows-1252`, `#L123`), que no
   son importes. **Resultado: 0 líneas.**
2. **La regla del reviewer, que es más fina y es la que destapó la fuga:** todos
   los **pares contiguos** (importe, saldo) del fichero real —399 pares— cruzados
   contra los pares de números contiguos de cada línea versionada. **Resultado: 0
   líneas.**
3. Y una tercera, más estricta que las dos, sobre **los archivos de esta feature**:
   ninguna cifra escrita en ellos coincide **en forma exacta** (`1.234,56` y
   `1234.56`) con ninguna celda numérica del fichero real, ni siquiera las
   redondas y poco «delatoras». **Resultado: 0 coincidencias.**

**El verificador se auto-probó** antes de darlo por bueno: se escribió en el
repositorio un archivo señuelo con una cifra real y un par real, el script marcó
las tres infracciones (cifra, cifra y par), y el señuelo se borró. Sin esa prueba,
un «0 coincidencias» solo diría que el script no encuentra nada.

Lo que **queda fuera** de esta corrección, a propósito: `docs/api-contract.md` y
`docs/dar-de-alta-un-banco.md` tienen, en sus secciones de **otros bancos**
(anteriores a esta feature), cifras redondas que coinciden por casualidad con
celdas del extracto de Openbank. No son «telling» para el guardián (menos de 4
dígitos significativos), no las escribió esta feature y tocarlas sería reescribir
ejemplos de features cerradas. Queda anotado.

### `./init.sh` de la segunda pasada

`Test Files 39 passed (39)` · `Tests 628 passed (628)` · **0 saltados**.
`oxlint` y `prettier --check` limpios sobre lo tocado. Sin dependencias nuevas.

**La feature sigue `in_progress`**: vuelve al reviewer.
