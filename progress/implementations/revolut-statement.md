# revolut-statement — implementación (F46, 2026-09-15)

Feature sin spec (`sdd: false`): la fuente de verdad son el `intent` y los 14
criterios de `feature_list.json`. Las dos decisiones del leader de los criterios
4 y 12 estaban aprobadas por el humano. **No está marcada `done`** y **no hay
commit**: queda para después del reviewer.

## Archivos modificados / creados

Creados, todos en `src/modules/revolut/`:

| Archivo | Qué es |
|---|---|
| [`revolut.csv.ts`](../../src/modules/revolut/revolut.csv.ts) | Lector de CSV propio del banco (comas, comillas opcionales, `""`, saltos de línea dentro de comillas, nº de línea y línea cruda) |
| [`revolut.format.ts`](../../src/modules/revolut/revolut.format.ts) | `parseAmount` (punto decimal, estricto) y `parseDateTimeAsDay` (`AAAA-MM-DD HH:MM:SS` → `AAAA-MM-DD`) |
| [`revolut.statement.parser.ts`](../../src/modules/revolut/revolut.statement.parser.ts) | `parseRevolutStatement`: `Buffer` → `ParsedStatement<'revolut'>`. Puro, sin BD ni Drive |
| [`revolut.types.ts`](../../src/modules/revolut/revolut.types.ts) | `RevolutStatementResult = ParsedStatement<'revolut'>` y los tipos del recorrido local |
| [`revolut.service.ts`](../../src/modules/revolut/revolut.service.ts) | Recorre `var/drive-read/revolut/<año>/` y vuelca a `var/parsed/` |
| [`revolut.routes.ts`](../../src/modules/revolut/revolut.routes.ts) | `POST /api/parser/revolut` |
| [`revolut.fixture.ts`](../../src/modules/revolut/revolut.fixture.ts) | CSV sintético en memoria (todo inventado; IBAN solo el público de la documentación) |
| `revolut.csv.test.ts`, `revolut.format.test.ts`, `revolut.statement.parser.test.ts`, `revolut.service.test.ts`, `revolut.routes.test.ts`, `revolut.import.test.ts` | Tests (ver trazabilidad) |

Modificados:

- [`src/app.ts`](../../src/app.ts) — el banco entra en `bankParsers` con `.csv` y se registra la ruta bajo `/api/parser`.
- [`src/architecture.test.ts`](../../src/architecture.test.ts) — listas escritas a mano (ver §Listas de bancos).
- [`docs/api-contract.md`](../../docs/api-contract.md) — sección nueva «Parser de Revolut», bancos que lee el importador, tabla de los dos saldos y nota de `NOT_UTF8`.
- [`docs/archivos-por-banco.md`](../../docs/archivos-por-banco.md) — fila de Revolut y fecha de revisión.
- [`docs/dar-de-alta-un-banco.md`](../../docs/dar-de-alta-un-banco.md) — ejemplo de módulo, línea del IBAN de Revolut, «en Revolut no se escribe la línea del saldo» y lista de parsers que usan `decodeUtf8Strict`.
- `progress/current.md` — estado de la sesión.

No se ha tocado la BD (ni esquema ni migraciones) ni el importador: no hizo falta.
`docs/roadmap.md` **no** se ha tocado: la feature aún no está cerrada, y la fila de
Revolut (§E4 y la tabla de bancos, que dicen «aparcado») se actualiza al cerrar,
como pide `AGENTS.md` §5.

## Decisiones tomadas

### Delegada nº 1 — cómo se lee el CSV

- Lector de CSV de verdad (RFC 4180), **propio del módulo**: separador `,`,
  comillas `"` opcionales, `""` como comilla literal, `\r\n` y `\n` iguales. La
  muestra no trae comillas, pero una descripción con coma no parte la fila.
- Descodificación con `decodeUtf8Strict` y BOM tolerado.
- Cabecera buscada **por nombre** (sin acentos ni mayúsculas), no por posición.
  Tiene que traer las siete columnas que se leen; si falta alguna, el fichero se
  rechaza entero (`ValidationError`). Una fila con otro número de celdas que la
  cabecera va a `unparsedRows`.
- **Cada fila se decide primero por el estado**, antes de validar fechas o saldo
  (una fila `DEVUELTO` trae vacíos la fecha de finalización y el saldo). El estado
  se compara en mayúsculas tras recortar espacios.
- Línea `iban`: se busca solo **encima** de la cabecera, leyendo la línea cruda.
  Separador `;` (el documentado) o la coma del fichero, igual que la regla de
  `docs/conventions.md` §Parsers de banco; `:` no vale. Normalización y validación
  con `readPreambleIban` (IBAN mal tecleado → fichero rechazado entero).
- Cualquier otra línea encima de la cabecera (incluida una `saldo;…`) se ignora
  sin reportarla.
- **Detalle que no dicen los criterios, decidido aquí:** en una fila `COMPLETADO`,
  un `Saldo` **vacío** sale como `balance: null` (el contrato dice que `null` es
  «no está en el fichero») y la fila entra; un `Saldo` escrito que no es un número
  va a `unparsedRows`. Motivo: perder un movimiento con fecha e importe legibles
  por falta de saldo costaría más. En la muestra real, según el contexto del
  leader, todas las filas `COMPLETADO` traen saldo, así que hoy no se da.
- Una fila `COMPLETADO` sin descripción va a `unparsedRows`: no se inventa concepto.

### Delegada nº 2 — la hora

- **Se descarta.** `bookingDate` y `valueDate` son el día (`AAAA-MM-DD`) tal cual
  está escrito, **sin conversión de zona horaria** (el fichero no declara ninguna).
- **Se valida igual**: la forma exacta `AAAA-MM-DD HH:MM:SS`, hora 00-23, minutos y
  segundos 00-59, y que el día exista (`2026-02-31` no se corre a marzo). Otra
  forma (solo fecha, con `T`, `DD/MM/AAAA`) → fila a `unparsedRows`.
- El orden dentro del día no sale de la hora: sale del orden del fichero
  (`'oldest-first'`), que viene ordenado por fecha de finalización ascendente.
  Lo que numera `daySequence` es `assignDaySequence`.

### Listas de bancos escritas a mano en `src/architecture.test.ts`

En [`src/architecture.test.ts`](../../src/architecture.test.ts) se ha añadido
`revolut` a:

1. el árbol esperado (`contains the target tree…`): los 13 archivos del módulo;
2. un test nuevo `keeps the revolut parser module free of data access (no "prisma" reference)`, copia del de los otros bancos (esas comprobaciones son un test por banco con su lista);
3. `keeps the investments service free of Drive and of bank knowledge` (lista de nombres de banco);
4. `shares no parsing code between bank modules` (`bankModules`);
5. `normalizes the bank name to the slug of its Drive folder and its module`.

**Comprobado que cubren el módulo nuevo, no solo que pasan:** añadí temporalmente
al final de `revolut.format.ts` un comentario con `../n26/` y la palabra `prisma`,
lancé `pnpm exec vitest run src/architecture.test.ts` y fallaron exactamente los
dos esperados (`keeps the revolut parser module free of data access…` y `shares no
parsing code between bank modules…`, `Tests 2 failed | 34 passed`). Después quité
esas líneas y la pasada completa de abajo está en verde.

Busqué otras listas de bancos escritas a mano en tests (`grep` de `'openbank'` y
`'n26'` en `src/`): **no hay más**. `src/no-real-data.test.ts` recorre las carpetas
de `var/drive-read/` desde disco, sin lista.

⚠️ **Sobre el criterio 12 y el «decodificador estricto»:** en
`architecture.test.ts` **no existe** ningún test de decodificador estricto con
lista de bancos (lo comprobé con `grep` de `decodeUtf8Strict` y `toString('utf8')`
en los `*.test.ts`: solo aparecen en `lib/utf8.test.ts`, `lib/cp1252.test.ts` y en
los tests de parser de cada banco). Así que esa parte del criterio no se cubre
añadiendo `revolut` a una lista, porque la lista no existe: se cubre en el test
del propio parser (`decodes with decodeUtf8Strict and never with toString`), igual
que en N26. No he creado un guardián nuevo para todo el árbol: ver sugerencias.

## Trazabilidad (criterio → test)

Rutas relativas a `src/modules/revolut/` salvo indicación.

- **C1** módulo propio, sin lectura de formato de otro banco →
  [`revolut.statement.parser.test.ts:67`](../../src/modules/revolut/revolut.statement.parser.test.ts#L67) `imports only its own files, lib/, errors/ and the sign helper`,
  [`:80`](../../src/modules/revolut/revolut.statement.parser.test.ts#L80) `reads the CSV with the reader of its own folder`,
  [`src/architecture.test.ts:506`](../../src/architecture.test.ts#L506) `shares no parsing code between bank modules`.
- **C2** CSV de verdad →
  [`revolut.csv.test.ts:8`](../../src/modules/revolut/revolut.csv.test.ts#L8) `does not split a row on a comma that is inside a quoted field` (y el resto del `describe`),
  [`revolut.statement.parser.test.ts:88`](../../src/modules/revolut/revolut.statement.parser.test.ts#L88) `keeps a description with a comma inside its quotes in one piece`,
  [`:96`](../../src/modules/revolut/revolut.statement.parser.test.ts#L96), [`:104`](../../src/modules/revolut/revolut.statement.parser.test.ts#L104), [`:115`](../../src/modules/revolut/revolut.statement.parser.test.ts#L115).
- **C3** fechas →
  [`revolut.statement.parser.test.ts:144`](../../src/modules/revolut/revolut.statement.parser.test.ts#L144) `takes bookingDate from the completion date and valueDate from the start date`,
  [`:151`](../../src/modules/revolut/revolut.statement.parser.test.ts#L151) `emits both as AAAA-MM-DD with the time discarded`,
  [`revolut.format.test.ts:22`](../../src/modules/revolut/revolut.format.test.ts#L22) `returns the calendar day and discards the time` (y `:27`, `:32`, `:36`, `:41`),
  [`revolut.import.test.ts:93`](../../src/modules/revolut/revolut.import.test.ts#L93) (fechas guardadas en BD).
- **C4** `DEVUELTO` ignorada; otro estado a `unparsedRows` →
  [`revolut.statement.parser.test.ts:170`](../../src/modules/revolut/revolut.statement.parser.test.ts#L170) `produces no movement and no unparsed row for a DEVUELTO row`,
  [`:179`](../../src/modules/revolut/revolut.statement.parser.test.ts#L179), [`:189`](../../src/modules/revolut/revolut.statement.parser.test.ts#L189) `reports any other state with its line and the state as the reason`,
  [`:208`](../../src/modules/revolut/revolut.statement.parser.test.ts#L208),
  [`revolut.import.test.ts:133`](../../src/modules/revolut/revolut.import.test.ts#L133) `stores no movement for the DEVUELTO nor the PENDIENTE row`.
- **C5** saldo por línea en `balance`, `accountBalance` null, sin línea `saldo;` →
  [`revolut.statement.parser.test.ts:217`](../../src/modules/revolut/revolut.statement.parser.test.ts#L217) `emits the Saldo of every line in balance`,
  [`:223`](../../src/modules/revolut/revolut.statement.parser.test.ts#L223) `keeps accountBalance null, and does not read a saldo; line`,
  [`:236`](../../src/modules/revolut/revolut.statement.parser.test.ts#L236), [`:250`](../../src/modules/revolut/revolut.statement.parser.test.ts#L250),
  [`revolut.import.test.ts:93`](../../src/modules/revolut/revolut.import.test.ts#L93) (`balanceAfter` en BD) y
  [`:150`](../../src/modules/revolut/revolut.import.test.ts#L150) `anchors the account with the balance of the most recent line` (`balanceAnchor` 1274.10, fecha 2026-07-03, posición 1; cifras inventadas del fixture).
- **C6** `Comisión` no se lee →
  [`revolut.statement.parser.test.ts:262`](../../src/modules/revolut/revolut.statement.parser.test.ts#L262) `does not add a non-zero fee to the amount`,
  [`:266`](../../src/modules/revolut/revolut.statement.parser.test.ts#L266) `does not even look at it: an unreadable fee does not make the row unparsed`, [`:275`](../../src/modules/revolut/revolut.statement.parser.test.ts#L275).
- **C7** importe con punto y signo, tipo con `deriveMovementTypeFromAmount`, posición con `assignDaySequence` →
  [`revolut.statement.parser.test.ts:282`](../../src/modules/revolut/revolut.statement.parser.test.ts#L282), [`:293`](../../src/modules/revolut/revolut.statement.parser.test.ts#L293), [`:306`](../../src/modules/revolut/revolut.statement.parser.test.ts#L306), [`:313`](../../src/modules/revolut/revolut.statement.parser.test.ts#L313),
  [`revolut.format.test.ts:6`](../../src/modules/revolut/revolut.format.test.ts#L6) y `:14`,
  guardián del árbol `takes the income/expense/neutral decision in a single place` de `src/architecture.test.ts` (recorre todo `*.parser.ts` desde disco).
- **C8** línea `iban;` opcional →
  [`revolut.statement.parser.test.ts:324`](../../src/modules/revolut/revolut.statement.parser.test.ts#L324), [`:332`](../../src/modules/revolut/revolut.statement.parser.test.ts#L332), [`:339`](../../src/modules/revolut/revolut.statement.parser.test.ts#L339), [`:347`](../../src/modules/revolut/revolut.statement.parser.test.ts#L347), [`:358`](../../src/modules/revolut/revolut.statement.parser.test.ts#L358), [`:364`](../../src/modules/revolut/revolut.statement.parser.test.ts#L364),
  [`revolut.import.test.ts:163`](../../src/modules/revolut/revolut.import.test.ts#L163) `without the iban line, fails with MISSING_ACCOUNT_DATA when the bank has no account`,
  [`:172`](../../src/modules/revolut/revolut.import.test.ts#L172) `without the iban line, uses the single account of the bank once it exists`.
- **C9** `decodeUtf8Strict` →
  [`revolut.statement.parser.test.ts:375`](../../src/modules/revolut/revolut.statement.parser.test.ts#L375) `rejects the whole file when its bytes are not UTF-8`,
  [`:388`](../../src/modules/revolut/revolut.statement.parser.test.ts#L388), [`:396`](../../src/modules/revolut/revolut.statement.parser.test.ts#L396) `decodes with decodeUtf8Strict and never with toString`,
  [`revolut.service.test.ts:76`](../../src/modules/revolut/revolut.service.test.ts#L76).
- **C10** contrato común →
  [`revolut.statement.parser.test.ts:405`](../../src/modules/revolut/revolut.statement.parser.test.ts#L405) `returns ParsedStatement<revolut> and declares none of the contract types`,
  guardián `declares the parsed movement contract in ONE module only` de `src/architecture.test.ts` (recorre todo `src/`).
- **C11** `POST /api/parser/revolut`, registro en `app.ts`, importación, docs →
  [`revolut.routes.test.ts:43`](../../src/modules/revolut/revolut.routes.test.ts#L43), [`:78`](../../src/modules/revolut/revolut.routes.test.ts#L78), [`:91`](../../src/modules/revolut/revolut.routes.test.ts#L91), [`:104`](../../src/modules/revolut/revolut.routes.test.ts#L104) `is in the parser registry of the composition root, with the .csv extension`, [`:115`](../../src/modules/revolut/revolut.routes.test.ts#L115), [`:125`](../../src/modules/revolut/revolut.routes.test.ts#L125),
  [`revolut.service.test.ts:24`](../../src/modules/revolut/revolut.service.test.ts#L24) y siguientes,
  [`revolut.import.test.ts:74`](../../src/modules/revolut/revolut.import.test.ts#L74) `imports the movements instead of reporting the file as skipped` (registro real de `app.ts` + importador + BD de test).
  Los docs no tienen test propio; están listados arriba.
- **C12** listas escritas a mano de `architecture.test.ts` →
  [`src/architecture.test.ts:435`](../../src/architecture.test.ts#L435) (sin `prisma`), [`:488`](../../src/architecture.test.ts#L488), [`:506`](../../src/architecture.test.ts#L506), [`:567`](../../src/architecture.test.ts#L567) y el árbol esperado; comprobación de que fallan con el módulo roto descrita arriba.
- **C13** 🔒 fixtures sintéticos →
  [`revolut.fixture.ts`](../../src/modules/revolut/revolut.fixture.ts) (todo inventado), y `src/no-real-data.test.ts`, que en la pasada de abajo **sí** comparó contra la copia local de `var/drive-read/revolut/`. En la primera pasada completa ese test **falló** sobre `docs/api-contract.md`: yo había escrito los nombres de columna seguidos, en el orden del banco, y eso reproducía secuencias de tres palabras de la cabecera del fichero local. Reescribí ese párrafo sin la secuencia y el test pasó. Este informe no copia nada del fichero real.
- **C14** este mapeo + `./init.sh` en verde (abajo).

## Último ./init.sh

`./init.sh` completo, 2026-09-15, código de salida 0:

```
[OK]    Type check OK (tsc sin errores)
[OK]    Lint OK
[OK]    Formato OK
 Test Files  67 passed (67)
      Tests  1257 passed (1257)
[OK]    Todos los tests pasan
[OK]    Entorno listo. Puedes empezar a trabajar.
```

Al empezar eran 1180 tests (según `progress/current.md`; ese número no lo medí yo).

**Prueba contra un fichero real: no hecha con datos.** La única copia local de
Revolut en esta máquina es `var/drive-read/revolut/2026/revolut-2026-08-17.csv`, la
muestra vacía de agosto. La parseé con un script de usar y tirar en el scratchpad
(solo imprime recuentos, no escribe nada en `var/`): la cabecera se reconoce, 0
movimientos, 0 filas sin parsear, sin IBAN. El fichero con movimientos que el
humano subió a `notas-banco/revolut/2025/` **no está descargado en local** y no lo
he descargado (eso toca Drive). Para comprobarlo de verdad hace falta que se
descargue (`POST /api/import`, que ahora ya lo importa, o la ingesta seguida de
`POST /api/parser/revolut`) y mirar en el informe: `unparsedCount` (lo esperado
son 0, porque la muestra solo trae `COMPLETADO` y `DEVUELTO`), `anchored` y
`balanceMismatches` (lo esperado es `[]`, porque según el contexto del leader la
cadena de saldos cuadra en el orden del fichero).

## Sugerencias fuera de scope (NO aplicadas)

1. **Guardián de todo el árbol para el decodificador estricto.** Hoy la regla
   «ningún parser de texto usa `toString('utf8')`» solo se comprueba banco a banco
   en el test de cada parser. Un test en `architecture.test.ts` que recorra todo
   `*.parser.ts` desde disco (como el del signo) la cubriría para el séptimo banco
   sin depender de que alguien se acuerde. Es un guardián nuevo, por eso no lo he
   hecho.
2. **Las listas de `bankModules` siguen escritas a mano.** Se podrían derivar de
   `src/modules/` (como ya hace `keeps the importer free of bank knowledge`), que
   es lo que proponía la auditoría del 2026-08-22.
3. **Al cerrar:** actualizar `docs/roadmap.md` (§E4 pasa de «5 de 6 bancos» y la fila
   de Revolut deja de estar «aparcado») y la frase de `docs/architecture.md:1963`
   que dice que solo queda Revolut.
