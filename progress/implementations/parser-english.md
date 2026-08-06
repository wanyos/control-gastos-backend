# Implementación — Feature 7 `parser-english`

> Renombrado puro a inglés de todos los campos y tipos que expone el parser de
> Bankinter (feature 6). No cambia lógica, forma ni comportamiento del parser.
> Fecha: 2026-08-05.

## Resultado de verificación

`bash init.sh` → **verde**. Type check OK + **146 tests en 14 archivos** (mismo
recuento que antes del renombrado; nada roto, nada añadido).

## Criterios de aceptación (A1..A6) ↔ tests que los cubren

| # | Criterio (resumen) | Test(s) que lo cubren |
|---|--------------------|-----------------------|
| A1 | `POST /api/parser/bankinter` devuelve TODOS los campos en inglés (resultado: `bank`, `accountIban`, `movements`, `unparsedRows`; movimiento: `bookingDate`, `valueDate`, `description`, `amount`, `balance`, `currency`, `type` `'income'`\|`'expense'`; fila no reconocida: `row`, `reason`) | `bankinter.routes.test.ts` "returns 200 with the parse summary…" (summary con `accountIban`/`movements`/`unparsedRows`); `bankinter.parser.test.ts` "maps every real column…", "drops the removed…fields" (claves exactas en inglés), "derives type from the sign…" (`type`=`income`/`expense`), "collects a non-interpretable row in unparsedRows…" (`row`/`reason`); `bankinter.service.test.ts` "parses each local copy…" (dump con `bank`/`accountIban`/`movements`/`unparsedRows`) |
| A2 | El volcado JSON local usa los mismos nombres en inglés | `bankinter.service.test.ts` "parses each local copy and writes a JSON dump…" — re-lee el JSON de disco y comprueba `dumped.bank`, `dumped.accountIban`, `dumped.movements`, `dumped.unparsedRows`, `m.description`/`m.amount` |
| A3 | El renombrado NO cambia el comportamiento: mismos movimientos, mismas filas no reconocidas y mismos valores | Toda la suite del parser sigue verde con los MISMOS valores (fechas ISO, importes, IBAN, recuentos 5 mov + 1 no reconocida). Los mensajes de `reason` se conservan en español (`stringContaining('importe')`, `stringContaining('saldo')`) → mismos valores exactos que antes |
| A4 | `docs/api-contract.md` actualizado (modelo en inglés) + nota visible de breaking change; anotado en `progress/current.md` | `docs/api-contract.md` §"Parser de Bankinter": modelo `MovimientoParseado`→`ParsedMovement` con tabla y ejemplo de respuesta en inglés + bloque `> ⚠️ Breaking change (feature "parser-english", 2026-08-05)…`. Anotado en `progress/current.md` |
| A5 | NO cambia lógica/forma del parser, NO toca BD/Prisma, NO añade dedup/persistencia/mover archivos, NO parsea otros bancos | Diff limitado a renombrado; `parseDataRow`/`findHeaderRow`/`parseSpanishDate`/`parseSpanishAmount` intactos salvo nombres. Ningún import de Prisma/Drive añadido. Guardián `architecture.test.ts` sigue verde |
| A6 | Tests (parser, service, routes, fixture) verdes con los nombres nuevos; `init.sh` verde; mapeo anotado aquí | `init.sh` verde (146 tests). Mapeo en la sección siguiente |

## Archivos modificados

- `src/modules/bankinter/bankinter.types.ts` — tipos e interfaces renombrados.
- `src/modules/bankinter/bankinter.parser.ts` — tipos importados, `ColumnField`,
  valores de `headerToField`, variables locales, campos de salida y `type`.
- `src/modules/bankinter/bankinter.service.ts` — campos del `ParsedFileSummary`
  (`accountIban`/`movements`/`unparsedRows`) leídos del resultado.
- `src/modules/bankinter/bankinter.fixture.ts` — comentarios que referencian el
  modelo (`unparsedRows`, `balance`).
- `src/modules/bankinter/bankinter.parser.test.ts` — aserciones y descripciones.
- `src/modules/bankinter/bankinter.service.test.ts` — aserciones.
- `src/modules/bankinter/bankinter.routes.test.ts` — aserciones.
- `docs/api-contract.md` — §Parser de Bankinter (modelo, ejemplo, notas) + nota
  de breaking change.
- `progress/current.md` — anotación de la implementación.

## Mapeo aplicado (tal cual el acordado)

Tipos: `MovimientoParseado`→`ParsedMovement`, `FilaNoReconocida`→`UnparsedRow`,
`MovimientoTipo`→`ParsedMovementType`. `BankinterParseResult` conserva su nombre.

`ParsedMovement`: `fechaContable`→`bookingDate`, `fechaValor`→`valueDate`,
`descripcion`→`description`, `importe`→`amount`, `saldo`→`balance`,
`divisa`→`currency`, `tipo`→`type` (`'ingreso'`→`'income'`, `'gasto'`→`'expense'`).

`UnparsedRow`: `fila`→`row`, `motivo`→`reason`.

`BankinterParseResult`: `banco`→`bank` (valor literal sigue siendo `'bankinter'`),
`cuentaIban`→`accountIban`, `movimientos`→`movements`, `noReconocidas`→`unparsedRows`.

`ParsedFileSummary`: `cuentaIban`→`accountIban`, `movimientos`→`movements`,
`noReconocidas`→`unparsedRows` (se dejan `bank`, `year`, `file`, `dumpPath`).

`ParseRunResult` y `FailedParse`: **revisados, ya estaban 100% en inglés**, sin
cambios.

## Lo que se conserva en español a propósito (no es identificador del modelo)

1. **Claves de `headerToField`** en `bankinter.parser.ts` (`'fecha contable'`,
   `'fecha valor'`, `descripcion`, `importe`, `saldo`, `divisa`): son los nombres
   REALES de las columnas del `.xlsx` de Bankinter. Renombrarlas rompería la
   detección de cabecera (cambio de comportamiento prohibido por el intent).
2. **Cabeceras/preámbulo del fixture** (`'Fecha contable'`, `'Importe'`, `'Saldo'`,
   `'Divisa'`, `'MOVIMIENTOS DE LA CUENTA …'`, etiquetas de filtro): imitan el
   formato real; son datos, no modelo.
3. **Mensajes de `reason`** (`'importe no numérico'`, `'saldo no numérico'`,
   `'fecha contable inválida'`, `'fecha valor inválida'`): son el VALOR del campo
   `reason`. A3 exige "mismos valores que antes"; traducirlos cambiaría un valor.
   Solo se renombró la CLAVE `motivo`→`reason`, no su contenido.

## Hallazgos / sugerencias fuera de scope (NO aplicadas)

- **Mensajes de `reason` en español.** `docs/conventions.md` pide "todo el proyecto
  en inglés" incluidos los mensajes. Los mensajes de `reason` (`'importe no
  numérico'`, etc.) siguen en español porque son valores que A3 obliga a preservar.
  Sugerencia para una feature futura (probablemente la de persistencia f8, o una de
  limpieza dedicada): traducir estos mensajes a inglés y actualizar las aserciones
  `stringContaining(...)` de los tests en el mismo cambio. **No aplicado** aquí por
  estar fuera del mapeo y por el mandato de no cambiar valores.
- **`parseSpanishDate` / `parseSpanishAmount`.** Nombres correctos y descriptivos
  (parsean formato español); se mantienen. No es un hallazgo, solo constancia de que
  se revisaron y no requieren cambio.
