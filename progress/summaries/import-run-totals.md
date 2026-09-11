# Resumen — feature 45 `import-run-totals`

Fecha de cierre: 2026-09-11
Intención original: `feature_list.json` → feature `import-run-totals`, bloque `intent`
Spec (si SDD): no (feature sin SDD; cierra los cabos 13 y 17 de `docs/roadmap.md`)

## Qué hace ahora la app que antes no

El resumen de arriba de una importación (`POST /api/import` y
`POST /api/import/local`) dice ahora la verdad de la pasada entera: además de los
movimientos, cuenta cuántos archivos de producto se guardaron
(`importedProductCount`), cuántas cuentas ancló esta pasada (`anchoredCount`) y
cuántos saldos por línea rellenó (`balanceFilledCount`). Antes un mes con solo
archivos de producto se leía como «0 importados», y los anclajes y rellenos solo
se veían archivo a archivo. Los seis contadores que ya existían siguen igual de
nombre y de valor.

## Por dónde se usa (puntos de entrada)

- `POST /api/import` — [import.routes.ts:56](../../src/modules/import/import.routes.ts#L56):
  la respuesta lleva los tres totales nuevos en la raíz.
- `POST /api/import/local` — [import.routes.ts:70](../../src/modules/import/import.routes.ts#L70):
  los mismos tres, con el mismo significado.
- `totals()` — [import.service.ts:801](../../src/modules/import/import.service.ts#L801):
  la única función que suma; los dos caminos pasan por ella.

## Dónde está el código (para revisión directa)

> Los enlaces de la columna **Código** son clicables en la vista previa de
> Markdown de VS Code (o con Ctrl/Cmd + clic): saltan a la línea exacta.

### La suma

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Suma los tres totales desde los informes por archivo (un `failed` trae `anchored: false`, `balancesFilled: 0`, `product: null` y suma cero sin caso especial) | `totals` | [import.service.ts:815](../../src/modules/import/import.service.ts#L815) |
| El camino local reutiliza la misma suma, sin cambios en esta feature | `importLocalCopies` (`...totals(files)`) | [import.local.service.ts:131](../../src/modules/import/import.local.service.ts#L131) |

### Los tipos

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Los tres contadores en la respuesta de Drive | `ImportRunResult` | [import.types.ts:119](../../src/modules/import/import.types.ts#L119) |
| Los tres contadores en la respuesta local | `LocalImportRunResult` | [import.types.ts:245](../../src/modules/import/import.types.ts#L245) |
| Lo que `totals()` lee de cada informe: gana `anchored?`, `balancesFilled?` y `product?` (opcionales, como `balanceMismatches?`) | `FileCounts` | [import.types.ts:161](../../src/modules/import/import.types.ts#L161) |

### Tests

| Qué cubre | Código |
| --- | --- |
| Unitario de `totals()`: 3 extractos + 2 productos + 1 `skipped` → las nueve claves con `toEqual` | [import.service.test.ts:1003](../../src/modules/import/import.service.test.ts#L1003) |
| Unitario: un extracto y un producto `failed` suman cero a los tres | [import.service.test.ts:1026](../../src/modules/import/import.service.test.ts#L1026) |
| Drive: producto guardado + producto fallido → `importedProductCount 1`, `failedCount 1`, `importedCount 0` | [import.service.test.ts:1200](../../src/modules/import/import.service.test.ts#L1200) |
| Drive: reescribir el mismo mes cuenta como guardado (`created: false`) | [import.service.test.ts:1237](../../src/modules/import/import.service.test.ts#L1237) |
| Drive: dos cuentas, dos pasadas → `anchoredCount 2` y luego `0`, `balanceFilledCount 2` | [import.service.test.ts:1631](../../src/modules/import/import.service.test.ts#L1631) |
| Drive: un archivo que falla no cuenta como anclado | [import.service.test.ts:1676](../../src/modules/import/import.service.test.ts#L1676) |
| Drive: el run vacío trae las nueve claves a cero | [import.service.test.ts:726](../../src/modules/import/import.service.test.ts#L726) |
| Local: anclaje y relleno → `anchoredCount 1`, `balanceFilledCount 1` | [import.local.service.test.ts:512](../../src/modules/import/import.local.service.test.ts#L512) |
| Local: sin saldo → `0/0` | [import.local.service.test.ts:546](../../src/modules/import/import.local.service.test.ts#L546) |
| Local: producto guardado → `importedProductCount 1`, `importedCount 0`; segundo mes → `2`; fallido → `0` | [import.local.service.test.ts:749](../../src/modules/import/import.local.service.test.ts#L749), [:793](../../src/modules/import/import.local.service.test.ts#L793), [:815](../../src/modules/import/import.local.service.test.ts#L815) |

### Documentación

| Qué | Código |
| --- | --- |
| Descripción de los tres totales (sustituye a «no hay total de run») | [api-contract.md:1522](../../docs/api-contract.md#L1522) |
| Ejemplos de respuesta con los campos nuevos | [api-contract.md:1397](../../docs/api-contract.md#L1397), [api-contract.md:1728](../../docs/api-contract.md#L1728) |
| Cabos 13 y 17 cerrados | [roadmap.md:368](../../docs/roadmap.md#L368), [roadmap.md:376](../../docs/roadmap.md#L376) |

## Cumplimiento de la intención

- ✅ «Importo un archivo de producto que entra bien y el resumen lo refleja con un
  contador propio, sin que `importedCount` deje de contar solo movimientos» → se
  cumple; verificado en `import.service.test.ts:1200` y
  `import.local.service.test.ts:749`.
- ✅ «El resumen trae el total de cuentas ancladas y de saldos rellenados, igual a
  la suma de los valores por archivo» → se cumple; verificado en
  `import.service.test.ts:1631` (se comparan los `anchored`/`balancesFilled` de
  cada informe con los totales) y `import.service.test.ts:1003`.
- ✅ «El camino local da los mismos contadores con el mismo significado» → se
  cumple; misma `totals()` (`import.local.service.ts:131`), verificado en
  `import.local.service.test.ts:512`, `:546`, `:749`, `:793`, `:815`. El reviewer
  comprobó además la respuesta HTTP real de `POST /api/import/local` con un test
  desechable: los tres campos viajan en la raíz.
- ✅ «Nada de lo que ya contaba cambia de valor ni de nombre» → se cumple; la
  suite anterior (1176 tests) en verde sin borrar ninguna aserción, y el `toEqual`
  completo de `import.service.test.ts:726` y `:1003`.

## Decisiones que se tomaron por ti

- (delegado) **Nombres**: `importedProductCount`, `anchoredCount`,
  `balanceFilledCount`. Siguen el patrón `xxxCount` y el singular que ya usa
  `balanceMismatchCount` con `balanceMismatches`. Sin términos nuevos.
- (delegado) **Un solo contador de productos.** Un producto fallido ya cuenta en
  `failedCount` (desde la F26); un producto del mismo mes reescrito **se guarda**
  (pisa la foto, no se descarta), así que cuenta como guardado. Quien quiera
  distinguir nuevo/reescrito tiene `created` en el informe por archivo, que no se
  tocó.

## Qué NO se tocó / quedó fuera

- Los informes por archivo (`anchored`, `balancesFilled`, `product`, `snapshot`):
  iguales que antes.
- Los seis contadores anteriores: ni nombre ni significado.
- `import.local.service.ts`: sin cambios; hereda la suma.
- Los tests de rutas (`import.routes.test.ts`, `import.local.routes.test.ts`) no
  afirman los tres campos nuevos (sugerencia del implementer, no exigida).

## Notas para el futuro (opcional)

- Si algún día se pone un `response schema` a las rutas de importación, habrá
  que listar los tres campos: hoy viajan porque no hay schema (dicho a propósito
  en `import.schema.ts`).
- `feature_list.json` en el árbol de trabajo lleva también la F43
  `pending → done`, resto del cierre anterior; va en el próximo commit.
