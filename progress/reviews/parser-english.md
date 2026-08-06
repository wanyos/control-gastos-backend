# Review — feature 7 `parser-english`

**Veredicto:** APPROVED (con una salvedad de scope no bloqueante para el leader)

Revisión realizada sobre el working tree (git diff vs. commit `4caeb38`).
Renombrado puro español→inglés del modelo que expone el parser de Bankinter (f6).

## Trazabilidad acceptance ↔ tests (A1..A6)

- **A1** `POST /api/parser/bankinter` devuelve todo en inglés (resultado + movimiento + fila) → **[x]**
  - Resultado (`bank`/`accountIban`/`movements`/`unparsedRows`): `bankinter.parser.test.ts`
    "parses a realistic sample…" (`result.bank`, `result.accountIban`, `result.movements`,
    `result.unparsedRows`); resumen del endpoint en `bankinter.routes.test.ts` (summary con
    `accountIban`/`movements`/`unparsedRows`).
  - Movimiento (`bookingDate`/`valueDate`/`description`/`amount`/`balance`/`currency`/`type`):
    `bankinter.parser.test.ts` "maps every real column…" (`toEqual` con las 7 claves inglesas)
    y "drops the removed…fields" (`Object.keys(...).sort()` = claves exactas en inglés).
  - `type` `'income'|'expense'` derivado del signo: "derives type from the sign of the amount".
  - Fila no reconocida (`row`/`reason`): "collects a non-interpretable row in unparsedRows…"
    (`{ row: 15, reason: … }`).
- **A2** El volcado JSON local usa los mismos nombres en inglés → **[x]**
  - `bankinter.service.test.ts` re-lee el JSON de disco y afirma `dumped.bank`,
    `dumped.accountIban`, `dumped.movements`, `m.description`/`m.amount`,
    `dumped.unparsedRows` = `[{ row, reason }]`.
- **A3** El renombrado NO cambia comportamiento (mismos movimientos/filas/valores) → **[x]**
  - Diffs de `bankinter.parser.ts` y `bankinter.service.ts` son renombrado puro:
    misma detección de cabecera (`columns.bookingDate !== undefined && columns.amount !== undefined`,
    antes `fechaContable`/`importe`), mismas fechas/importes (`parseSpanishDate`/`parseSpanishAmount`
    intactos), misma derivación `amount < 0 ? 'expense' : 'income'`.
  - Valores exactos preservados en tests: IBAN, importes (2500, 1234.56, -188.67…), fechas ISO,
    recuentos 5 mov + 1 no reconocida. Mensajes de `reason` conservados en español
    (`stringContaining('importe')`/`('saldo')`).
- **A4** `api-contract.md` en inglés + nota de breaking change + `progress/current.md` → **[x]**
  - `docs/api-contract.md` §Parser: modelo `MovimientoParseado`→`ParsedMovement` (tabla, forma de
    resultado y ejemplo de respuesta en inglés), y bloque visible
    `> ⚠️ Breaking change (feature "parser-english", 2026-08-05)…` que declara "aún NO consumido por
    el frontend". `progress/current.md` anota la implementación y el breaking change.
- **A5** No cambia lógica/forma, no toca BD/Prisma, no dedup/persist/mover, no otros bancos → **[x]**
  - `parseDataRow`/`findHeaderRow`/`parseSpanishDate`/`parseSpanishAmount` intactos salvo nombres.
  - `prisma/schema.prisma` y `prisma/migrations/*` NO modificados (verificado con `git diff`).
  - Ningún import de Prisma/Drive añadido; sin dedup ni movimiento de archivos.
- **A6** Tests verdes con nombres nuevos + `init.sh` verde + mapeo anotado → **[x]**
  - `bash init.sh` → verde. Mapeo documentado en `progress/implementations/parser-english.md`.

## Renombrado completo (identificadores del modelo)

- Grep de `MovimientoParseado|FilaNoReconocida|MovimientoTipo|fechaContable|fechaValor|descripcion|
  cuentaIban|movimientos|noReconocidas|motivo|fila` como identificadores del modelo en
  `src/modules/bankinter/*`: **sin resto**. Único hit español = las **claves** de `headerToField`
  (`'fecha contable'`, `'fecha valor'`, `descripcion`, `importe`, `saldo`, `divisa`) → **correcto**:
  son el texto literal de las columnas del `.xlsx` real; renombrarlas rompería la detección de
  cabecera (prohibido por A3).
- Contenido de los mensajes de `reason` (`importe no numérico`, `saldo no numérico`,
  `fecha contable inválida`, `fecha valor inválida`) sigue en español → **correcto**: son el VALOR
  del campo `reason`. Solo se renombró la clave `motivo`→`reason`. Igual en el fixture: cabeceras
  `Fecha contable`/`Importe`/`Saldo`/`Divisa` conservadas (imitan el formato real, son datos).
- El implementer distinguió bien "identificador del modelo" (inglés) de "valor/string de datos"
  (puede seguir en español).

## Contrato (`docs/api-contract.md` §Parser de Bankinter)

- Modelo, forma de resultado y ejemplo de `POST /api/parser/bankinter` en inglés. Nota de breaking
  change visible. Los únicos nombres en español que quedan en la sección son (a) los del propio
  bloque de breaking change (explican el mapeo viejo→nuevo, esperado) y (b) la referencia a las
  columnas reales del extracto `Fecha contable | Fecha valor | …` (formato del archivo, no modelo).
  Sin restos de modelo en español.

## Scope

- Cambios en `src/`: **solo** `src/modules/bankinter/*` (7 archivos). No se tocó `expenses`,
  `ingesta`, `health`, `drive`, `config`, `plugins`, `lib`.
- `feature_list.json`: el diff **solo AÑADE el bloque de la feature 7** con `status: "in_progress"`
  (alta de feature por el leader). El implementer **NO** cambió el status a `done`. No es la
  violación que vigila la regla.
- **Salvedad (no bloqueante):** el working tree incluye una modificación de **`docs/data-model.md`**
  (diagrama Mermaid ER + esquema Prisma ilustrativo) que **NO** está en el scope de esta feature ni
  en la lista de archivos del informe del implementer. Es cambio **solo de docs** (no toca
  `prisma/schema.prisma`, migraciones ni código) y es temáticamente de la F8 `data-model`
  (`progress/current.md` la nombra como siguiente). Casi con seguridad es prep de docs del
  leader/humano filtrada en el árbol, no parte del entregable de F7. **Acción para el leader:**
  atribuir/separar ese cambio para que NO se empaquete en el commit de la feature 7.

## Dictamen sobre el hallazgo del implementer (mensajes de `reason` en español)

**Aceptable bajo A3, no bloquea.** A3 exige "mismos valores que antes"; el contenido de `reason` es
el VALOR del campo, y el mapeo acordado solo pedía renombrar la clave `motivo`→`reason`, no traducir
el texto. Traducir los mensajes cambiaría un valor y violaría A3. La sugerencia del implementer
(traducir estos mensajes en una feature futura de limpieza, junto con las aserciones
`stringContaining(...)`) es correcta como deuda diferida y queda fuera del scope de esta feature.

## Verificación (`init.sh`)

```
── 4. Type checking (tsc) ── Type check OK (tsc sin errores)
── 5. Ejecutando tests ── Test Files 14 passed (14) · Tests 146 passed (146)
── 6. Resumen ── [OK] Entorno listo.
```

Verde. Recuento **146 tests / 14 files** (coincide con lo esperado y con el recuento previo al
renombrado: nada roto, nada añadido).

## Recomendación

APPROVED. Se recomienda al leader:
1. Instruir al implementer para marcar la feature 7 como `done` en `feature_list.json`.
2. Antes de commitear, resolver la salvedad de scope: separar/atribuir el cambio en
   `docs/data-model.md` para que no se cuele en el commit de `parser-english`.
