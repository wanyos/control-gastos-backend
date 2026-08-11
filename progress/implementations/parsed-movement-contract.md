# Implementación — F11 `parsed-movement-contract`

- **Feature:** 11 `parsed-movement-contract` (sin SDD: el contrato son el `intent`
  y los 10 criterios de `acceptance` de [`feature_list.json`](../../feature_list.json)).
- **Fecha:** 2026-08-11 · **Agente:** implementer
- **Estado al terminar:** `in_progress` (**no** la cierro yo; espera veredicto del
  reviewer y su `progress/summaries/parsed-movement-contract.md`).

---

## 1. Qué se hizo, en una frase

La forma de un movimiento parseado sale de `src/modules/bankinter/` y pasa a un
único módulo compartido, [`src/lib/parsed-statement.ts`](../../src/lib/parsed-statement.ts);
el parser de Bankinter la consume, reutiliza el helper del signo de la F8 (con lo
que **el importe 0 pasa de `income` a `neutral`**) y emite ya la posición de cada
línea dentro de su día.

## 2. Archivos creados

| Archivo | Qué es |
|---|---|
| [`src/lib/parsed-statement.ts`](../../src/lib/parsed-statement.ts) | **El contrato.** `ParsedMovementType` ([:19](../../src/lib/parsed-statement.ts#L19)), `ParsedMovement` ([:22](../../src/lib/parsed-statement.ts#L22)), `UnparsedRow` ([:51](../../src/lib/parsed-statement.ts#L60)), `ParsedStatement<Bank>` ([:59](../../src/lib/parsed-statement.ts#L68)), `ParsedMovementDraft`, `StatementOrder` y el helper `assignDaySequence` ([:87](../../src/lib/parsed-statement.ts#L96)). No importa nada. |
| [`src/lib/parsed-statement.test.ts`](../../src/lib/parsed-statement.test.ts) | Tests del contrato: numeración del día en los dos sentidos, dato ausente = `null`, y compatibilidad con el helper de dominio. |

## 3. Archivos modificados

| Archivo | Cambio |
|---|---|
| [`src/modules/bankinter/bankinter.types.ts`](../../src/modules/bankinter/bankinter.types.ts) | Borradas las tres declaraciones propias; queda `BankinterParseResult = ParsedStatement<'bankinter'>` ([:14](../../src/modules/bankinter/bankinter.types.ts#L14)) más los resúmenes de la ejecución local. `ParsedFileSummary.accountIban` pasa a `string \| null`. |
| [`src/modules/bankinter/bankinter.parser.ts`](../../src/modules/bankinter/bankinter.parser.ts) | Importa el contrato ([:4](../../src/modules/bankinter/bankinter.parser.ts#L4)) y `deriveMovementTypeFromAmount` ([:6](../../src/modules/bankinter/bankinter.parser.ts#L6)); constante `statementOrder = 'newest-first'` ([:10](../../src/modules/bankinter/bankinter.parser.ts#L10)); numera con `assignDaySequence` ([:89](../../src/modules/bankinter/bankinter.parser.ts#L89)); `findIban` devuelve `null` en vez de `''` ([:128](../../src/modules/bankinter/bankinter.parser.ts#L128)); el `type` ya no se calcula a mano ([:191](../../src/modules/bankinter/bankinter.parser.ts#L191)). |
| [`src/architecture.test.ts`](../../src/architecture.test.ts) | 3 guardianes nuevos + los 2 archivos nuevos en el árbol esperado. |
| [`src/modules/bankinter/bankinter.parser.test.ts`](../../src/modules/bankinter/bankinter.parser.test.ts) | 3 tests nuevos, 4 con expectativa ajustada (ver §5). |
| [`src/modules/bankinter/bankinter.service.test.ts`](../../src/modules/bankinter/bankinter.service.test.ts) | 1 test nuevo: el resumen y el JSON volcado llevan `accountIban: null`. |
| [`docs/architecture.md`](../architecture.md) | **ADR-013** + `lib/parsed-statement.ts` en el árbol. |
| [`docs/conventions.md`](../conventions.md) | §Parsers de banco apunta ya al archivo y a las líneas concretas del contrato, del helper y de los guardianes. |
| [`docs/api-contract.md`](../api-contract.md) | Modelo `ParsedMovement` actualizado (`balance` nullable, `type` con `neutral`, `daySequence`) + nota de **breaking change** aún no consumido por el frontend. |

## 4. Decisiones (las cuatro delegadas)

1. 📌 **Dónde vive y cómo se llama: `src/lib/parsed-statement.ts`.** `lib/` es la
   carpeta que `docs/architecture.md` reserva a "lo que usan todos y no es de
   nadie"; `modules/` es "un directorio por recurso" (ADR-004) y el contrato no es
   un recurso. Descartados `modules/shared/` (cajón de sastre) y una quinta
   carpeta transversal para un solo archivo. El nombre sigue al tipo raíz
   (`ParsedStatement`).
2. 📌 **El dato ausente es `null`, nunca `0` ni `''`:** `balance: number | null` y
   `accountIban: string | null`. Es lo que ya hace la BD (`Movement.balanceAfter`
   nullable) y lo que necesita MyInvestor, que no trae ninguno de los dos. La
   clave sigue **presente** en el JSON volcado, así que "no viene en el fichero"
   se ve. Efecto en Bankinter: un extracto sin la línea del IBAN devuelve `null`
   en vez de `''`.
3. 📌 **`daySequence` lo emite el parser**, calculado por el helper compartido
   `assignDaySequence(drafts, fileOrder)`. Lo único bank-specific es el argumento
   (`'newest-first'` en Bankinter, verificado con los saldos de la muestra real:
   `24816,16 − 188,67 = 24627,49`). Numerar no es leer el formato: la norma «un
   parser por banco» se mantiene intacta.
4. 📌 **El contrato NO incluye nada más para el importador.** Repasada la tabla de
   mapeo de `specs/data-model/design.md` §9: ya tiene `bookingDate`, `valueDate`,
   `description`, `amount`, `balance`, `currency`, `daySequence`, `accountIban` y
   `bank`. Lo demás (`origin`, `status`, `transferId`, `accountId`, la dedup) lo
   pone el importador; meterlo aquí convertiría el contrato en el modelo de la BD.
   Tampoco se añade `providesBalance` (lo propone hoy la spec de la F10): la
   `balance: null` por línea ya lo dice y una constante por banco duplica el dato.

Todo ello está razonado, con alternativas descartadas, en **ADR-013** de
[`docs/architecture.md`](../architecture.md).

## 5. Tests que cambian de expectativa (y por qué)

| Test | Antes | Ahora | Motivo |
|---|---|---|---|
| `emits exactly the fields of the shared contract` (antes `drops the removed concepto/tipoMovimiento fields...`) | 7 claves | 8 claves (`daySequence`) | criterio 5 |
| `maps every real column (incl. balance/currency)...` | objeto sin `daySequence` | con `daySequence: 1` | criterio 5 |
| `parses the exact real Bankinter layout...` | objeto sin `daySequence` | `daySequence: 2` en la 1ª fila y `1` en la 2ª | Bankinter exporta de más reciente a más antiguo |
| `returns a null IBAN when the preamble line is absent...` (antes `returns an empty IBAN...`) | `accountIban === ''` | `accountIban === null` | criterio 2: la ausencia no puede parecer una cadena vacía |

> **Sobre el importe 0:** **no existía** ningún test de Bankinter que fijara la
> expectativa vieja (`0 → income`): la regla estaba escrita solo en el ternario
> `amount < 0 ? 'expense' : 'income'` del parser y la muestra sintética no tiene
> ninguna fila con importe 0. Así que el cambio no "rompe" un test existente: se
> añade el test que lo cubre (`emits a zero amount as neutral, NOT as income`),
> con las dos variantes del formato (número nativo `0` y texto español `'0,00'`).
> Lo dejo dicho explícitamente porque el `acceptance` daba por hecho que ese test
> existía.

## 6. Cómo se verificó la NO regresión (criterio 6)

Tres capas, todas ejecutables:

1. **Pin completo del resultado**: el test
   `produces exactly the same movements and values as before the shared contract`
   ([bankinter.parser.test.ts](../../src/modules/bankinter/bankinter.parser.test.ts))
   compara con `toEqual` el resultado **entero** de la muestra canónica: los 5
   movimientos con sus 8 campos y la fila 15 no reconocida. Los valores están
   copiados de las expectativas de la F7 (mismas fechas, importes, saldos,
   divisas y `type`s); lo único añadido es `daySequence`. La muestra no tiene
   ninguna fila con importe 0, así que **ningún `type` cambia** en ella.
2. **Los tests preexistentes siguen verdes sin tocar**: mismos 5 movimientos + 1
   no reconocida, misma fila 15 y motivo, no-deduplicación de las dos filas
   idénticas, saldo no numérico → fila no reconocida, `ValidationError` sin
   cabecera, y los unitarios de `parseSpanishAmount` / `parseSpanishDate`
   (intactos: no se tocó ni una línea de la lectura del formato).
3. **Diff revisado**: en `bankinter.parser.ts` los únicos cambios son los tipos,
   la línea del `type`, el `null` del IBAN y el envoltorio `assignDaySequence`.
   `headerToField`, `findHeaderRow`, `parseSpanishDate`, `parseSpanishAmount`,
   `collectRows` y `cellToString` no se tocan (criterio 8).

## 7. Trazabilidad — criterio de `acceptance` → test concreto

| # | Criterio (resumen) | Test que lo cubre |
|---|---|---|
| 1 | Los tipos en UN módulo compartido fuera de `modules/<banco>/`; Bankinter lo importa; sin declaraciones duplicadas | `architecture invariants > declares the parsed movement contract in ONE module only (feature 11)` ([architecture.test.ts](../../src/architecture.test.ts)) · `... > contains the target tree of docs/architecture.md (ADR-004)` (exige `lib/parsed-statement.ts`) · `parseBankinterXlsx > emits exactly the fields of the shared contract (no Bankinter-only field)` |
| 2 | `balance` e `accountIban` opcionales; la ausencia ≠ `0` / `''` | `the parsed statement contract > represents an absent balance and an absent IBAN as null, not as 0 or ""` ([parsed-statement.test.ts](../../src/lib/parsed-statement.test.ts)) · `parseBankinterXlsx > returns a null IBAN when the preamble line is absent, and still parses the rows` · `parseLocalBankinterCopies > reports a null accountIban (never "") when the statement does not carry it` |
| 3 | Importe 0 → `neutral`, no `income` | `parseBankinterXlsx > emits a zero amount as neutral, NOT as income (feature 11, deliberate change)` |
| 4 | La decisión del signo en UN sitio, reutilizando `deriveMovementTypeFromAmount` | `architecture invariants > takes the income/expense/neutral decision in a single place (feature 11)` (todo `*.parser.ts` lo importa y ninguno reescribe la regla) · `the parsed statement contract > accepts the three values of the domain helper as its movement type` · el existente `deriveMovementTypeFromAmount > ... zero` de [movements.test.ts](../../src/modules/movements/movements.test.ts) |
| 5 | `daySequence` ya puesta por el parser, contando desde el más antiguo del día | `assignDaySequence > numbers a newest-first file from the oldest movement of each day` · `> numbers an oldest-first file in file order, restarting on each day` · `> keeps the array in file order and only adds daySequence` · `parseBankinterXlsx > numbers every movement inside its day, counting from the oldest of the day` · `> parses the exact real Bankinter layout (native number amount and balance)` |
| 6 | No regresión salvo el importe 0 | `parseBankinterXlsx > produces exactly the same movements and values as before the shared contract` (+ todos los tests preexistentes del parser, del service y de la ruta, verdes sin cambios de valor) |
| 7 | El contrato no es el modelo de la BD y no se comparte el código que lee el formato | `architecture invariants > keeps the contract free of database and bank-specific knowledge (feature 11)` (sin Prisma, sin `accountId`/`transferId`/`origin`, **sin ningún import**) · `... > keeps the bankinter parser module free of data access (no "prisma" reference)` (preexistente, sigue verde) |
| 8 | No toca Prisma/BD, ni cómo lee Bankinter, ni MyInvestor | `parseSpanishAmount` (3 tests) y `parseSpanishDate` (2 tests) intactos · `parseBankinterXlsx > reports a row with a non-numeric balance as an unparsed row` · `> collects a non-interpretable row in unparsedRows...` · `> throws ValidationError when there is no recognizable header row` · evidencia adicional: `git status` no muestra cambios en `prisma/` ni existe `src/modules/myinvestor/` |
| 9 | Cada criterio con test + `./init.sh` verde + decisiones como ADR + convenciones apuntando al contrato | esta misma tabla · §8 (salida de `./init.sh`) · **ADR-013** en [`docs/architecture.md`](../architecture.md) · [`docs/conventions.md`](../conventions.md) §Parsers de banco |
| 10 | `docs/api-contract.md` actualizado con nota de breaking change | [`docs/api-contract.md`](../api-contract.md) §Parser de Bankinter: aviso ⚠️ de 2026-08-11 (importe 0 → `neutral`, `daySequence`, `null`s) + tabla del modelo + nota en la respuesta de `POST /api/parser/bankinter` |

## 8. Verificación — último `./init.sh`

```
── 4. Type checking (tsc) ──────────────────────────────
[OK]    Type check OK (tsc sin errores)

── 5. Ejecutando tests ─────────────────────────────────
 Test Files  18 passed (18)
      Tests  233 passed (233)

[OK]    Todos los tests pasan
── 6. Resumen ──────────────────────────────────────────
[OK]    Entorno listo. Puedes empezar a trabajar.
```

Línea base antes de tocar nada: **220 tests en 17 ficheros**. Ahora **233 en 18**
(+13: 6 del contrato, 4 nuevos del parser/service, 3 guardianes). `pnpm run lint`
y `pnpm run format:check` también en verde.

## 9. Sugerencias fuera de scope (NO aplicadas)

1. **Renombrar `balance` → `balanceAfter`** en el contrato, para que el mapeo al
   `Movement` sea literal. No se hace aquí porque chocaría con el criterio de no
   regresión (es un segundo cambio de forma no pedido) y con el nombre que
   `api-contract.md` publica desde la F7. Es una decisión barata mientras el
   frontend no consuma nada.
2. **`currency: ''` cuando la columna no existe** es el mismo "disfraz de vacío"
   que se corrigió para el IBAN; el criterio 2 solo nombraba saldo e IBAN, así que
   se deja como está. Candidato natural a `string | null` cuando se toque.
3. **Re-espeficar la F10 (MyInvestor) contra este contrato**: su
   `specs/myinvestor-parser/design.md` §13 declara todavía `MyinvestorMovement`,
   `UnparsedRow`, `ParsedMovementType`, `balanceAfter` y `providesBalance`. Es el
   siguiente paso acordado (F11 → F10) y **no se ha tocado** (criterio 8).
4. **`docs/roadmap.md`** (E4 y el cabo suelto #2) se actualiza en el cierre de
   sesión, no aquí: la feature todavía no es `done`.
