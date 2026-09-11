# import-run-totals (F45) — implementación

> Implementer, 2026-09-11. Feature sin SDD: se trabaja del `acceptance` de
> `feature_list.json`. Cierra los cabos 13 y 17 de `docs/roadmap.md`. Estado al
> terminar: `in_progress`, a la espera del reviewer.

## Qué hace ahora que antes no

`POST /api/import` y `POST /api/import/local` devuelven en la raíz tres totales de
la pasada entera, sumados de los informes por archivo que ya existían:

| Contador nuevo | Qué suma | De dónde sale, por archivo |
| --- | --- | --- |
| `importedProductCount` | archivos de producto guardados | `status: 'imported'` con `product` no nulo (informe de producto, F26) |
| `anchoredCount` | cuentas que **esta pasada** ancló | `anchored: true` (informe de extracto, F31) |
| `balanceFilledCount` | saldos por línea rellenados | suma de `balancesFilled` (informe de extracto, F31) |

Los seis contadores anteriores (`importedCount`, `duplicateCount`, `unparsedCount`,
`failedCount`, `skippedCount`, `balanceMismatchCount`) no cambian ni de nombre ni de
valor: la suite anterior sigue en verde sin tocar ninguna aserción sobre ellos (el
único cambio en un test existente es el `toEqual` del run vacío, que gana las tres
claves nuevas a cero).

## Archivos modificados / creados

- [`src/modules/import/import.types.ts`](../../src/modules/import/import.types.ts)
  - `ImportRunResult` ([L114-L123](../../src/modules/import/import.types.ts#L114-L123))
    y `LocalImportRunResult` ([L244-L247](../../src/modules/import/import.types.ts#L244-L247)):
    los tres contadores.
  - `FileCounts` ([L157-L167](../../src/modules/import/import.types.ts#L157-L167)): gana
    `anchored?`, `balancesFilled?` y `product?`, opcionales por la misma razón que
    `balanceMismatches?` (un `skipped` no lleva nada; un producto no lleva contadores
    de extracto y viceversa). Sigue siendo estructural: los dos caminos comparten la
    aritmética sin compartir la forma.
- [`src/modules/import/import.service.ts`](../../src/modules/import/import.service.ts)
  — `totals()` ([L801](../../src/modules/import/import.service.ts#L801)): tres líneas
  nuevas. **No se tocó ninguna otra función**: `importStatement`, `importProductFile`
  y el bucle de archivos siguen igual.
- `src/modules/import/import.local.service.ts`: **sin cambios**. El camino local ya
  llamaba a la misma `totals()` (F25), así que gana los tres contadores solo.
- [`src/modules/import/import.service.test.ts`](../../src/modules/import/import.service.test.ts)
  — 6 tests nuevos y 1 ampliado (ver mapeo).
- [`src/modules/import/import.local.service.test.ts`](../../src/modules/import/import.local.service.test.ts)
  — 5 tests existentes ampliados con una aserción sobre los totales (ver mapeo).
- [`docs/api-contract.md`](../../docs/api-contract.md): la nota «No hay total de run
  para `anchored` ni para `balancesFilled`» y la de «un archivo de producto no suma a
  `importedCount`» se sustituyen por la descripción de los tres contadores; los dos
  ejemplos de respuesta (`POST /api/import` y `POST /api/import/local`) los incluyen
  con valores coherentes con sus archivos (`1/1/0` en Drive, `0/0/12` en local).
- [`docs/roadmap.md`](../../docs/roadmap.md): cabos 13 y 17 tachados y marcados
  «cerrado por la F45», con la forma de los demás cerrados de la tabla.
- `feature_list.json`: F45 `pending` → `in_progress`.
- `progress/current.md`: sección de la feature en curso.

## Decisiones tomadas

### Nombres de los contadores (delegado en el agente)

Patrón de los existentes: sustantivo en singular + `Count`, con el nombre del dato
por archivo del que sale (`balanceMismatches` → `balanceMismatchCount`).

- **`importedProductCount`**: lo que cuenta son «productos importados». Se descartó
  `productCount` (se leería como «cuántos productos hay», que no es lo que dice) y
  `importedProducts` (rompe el sufijo `Count` que llevan los otros seis).
- **`anchoredCount`**: sale de `anchored`; cuenta archivos con `anchored: true`, que
  por construcción (F31 R3: una cuenta se ancla una sola vez) son cuentas ancladas en
  la pasada.
- **`balanceFilledCount`**: sale de `balancesFilled`, singularizado como hace
  `balanceMismatchCount` con `balanceMismatches`. Se consideró `balancesFilledCount`
  (más literal); se prefirió seguir el precedente del propio tipo.

Ningún término nuevo: los tres se componen de palabras que ya están en el contrato.

### Un solo contador de productos, sin distinguir duplicado/fallido (delegado)

Se miró qué distingue hoy el informe por archivo de producto (`ProductResult`,
F26): `status` (`imported`/`failed`) y, dentro del importado, `product.created` y
`snapshot.created` (`true` = nuevo, `false` = se volvió a escribir el mismo mes).

- **Fallido** ya tiene contador: `failedCount` cuenta archivos fallidos sean de
  extracto o de producto (así era desde la F26 y así sigue). Un segundo contador
  sería el mismo número partido en dos.
- **Repetido** no es un descarte: el contrato dice que repetir un mes «sobrescribe
  la foto y no duplica nada». A diferencia de un movimiento duplicado (que **no** se
  escribe y por eso va a `duplicateCount`), el producto repetido **sí** se guarda
  otra vez. Contarlo como «duplicado» diría que se descartó, que es falso; contarlo
  como guardado es lo que pasó. Quien quiera saber si fue nuevo o repetido tiene
  `created` en el informe por archivo, que no se toca (el intent lo prohíbe).

Por eso: `importedProductCount` = archivos de producto con `status: 'imported'`, sin
más. Está dicho así en el contrato y cubierto por el test «counts a product written
again as stored».

### Un `failed` no ancla ni rellena

No hace falta caso especial en `totals()`: el informe de un archivo fallido ya trae
`anchored: false`, `balancesFilled: 0` y `product: null` (contrato actual), así que
suma cero a los tres. Se comprueba igualmente con test (unitario y por Drive).

## Mapeo criterio → test

| Criterio de `acceptance` | Test |
| --- | --- |
| Los dos tipos de run traen los contadores nuevos, agregados desde los informes por archivo — **Drive** | [`totals › adds them up from the per-file reports without changing the existing counters`](../../src/modules/import/import.service.test.ts#L1003) (unitario, mezcla extractos + productos + skipped); [`importPending: the product files › counts the stored product files of the run apart from the movements`](../../src/modules/import/import.service.test.ts#L1200) (un producto guardado + uno fallido → `1/failed 1/importedCount 0`); [`counts a product written again as stored`](../../src/modules/import/import.service.test.ts#L1237); [`the importer anchors… › totals the accounts anchored and the balances filled over the whole run`](../../src/modules/import/import.service.test.ts#L1631) (dos archivos, dos cuentas: primera pasada `anchoredCount 2`, segunda `0` y `balanceFilledCount 2`) |
| Ídem — **local** (mismo significado) | [`anchors the accounts and fills the missing balances… (R15)`](../../src/modules/import/import.local.service.test.ts#L452) → `anchoredCount 1, balanceFilledCount 1, importedProductCount 0`; [`leaves the account unanchored… (R5, R15)`](../../src/modules/import/import.local.service.test.ts#L535) → `0/0`; [`persists the copy… (R11)`](../../src/modules/import/import.local.service.test.ts#L733) → `importedProductCount 1, importedCount 0`; [`adds one row for the next month… (R11, R7)`](../../src/modules/import/import.local.service.test.ts#L766) → `importedProductCount 2`; [`leaves no trace… (R8, R11)`](../../src/modules/import/import.local.service.test.ts#L805) → `importedProductCount 0, failedCount 1` |
| Un archivo `failed` no ancla ni rellena ni guarda producto | [`totals › counts nothing from a failed file`](../../src/modules/import/import.service.test.ts#L1026); [`does not count a failed file as anchored`](../../src/modules/import/import.service.test.ts#L1676); los dos tests de producto fallido de arriba |
| Los contadores existentes no cambian de nombre ni de valor | Toda la suite anterior en verde sin tocar sus aserciones; el unitario de `totals()` usa `toEqual` con las nueve claves; [`reports nothing and touches nothing when there is no pending file`](../../src/modules/import/import.service.test.ts#L726) usa `toEqual` sobre el run vacío completo |
| `docs/api-contract.md` actualizado (nota sustituida y ejemplos) | Sin test; comprobado a mano: `grep -n importedProductCount docs/api-contract.md` da las líneas 1397, 1516, 1525, 1527, 1728 y 1789 |
| `docs/roadmap.md`: cabos 13 y 17 cerrados por la F45 | Sin test; líneas 368 y 376 de la tabla |

Con esto, los cuatro puntos de `como_se_que_esta_bien` del intent quedan cubiertos:
producto con contador propio sin que `importedCount` cambie (tests de producto),
totales de anclaje y relleno iguales a la suma por archivo (tests de anclaje, Drive y
local), el camino local con el mismo significado (tests locales) y nada existente
cambia (suite en verde + `toEqual` completos).

## Último `./init.sh`

Dos pasadas completas, ambas con la base de datos de test en docker (el leader avisó
de que el demonio estaba parado al arrancar; ya estaba en marcha cuando lancé).

**Primera pasada — roja (exit 1)**, por el guardián de datos reales de la F14:

```
FAIL  src/no-real-data.test.ts > … > repeats no telling amount of the local captures
+ "src/modules/import/import.service.test.ts:1656 — an amount on this line is in a file of var/: it is real data, invent another one"
Test Files  1 failed | 59 passed (60)
Tests  1 failed | 1175 passed (1176)
```

Era el saldo por línea que usé en el fixture del test de anclaje (no se transcribe
aquí: este archivo también se versiona y lo mira el mismo guardián). Según
`docs/conventions.md` §Tests («si salta con razón: inventa otro valor»), se cambió
por otro importe inventado; el test sigue comprobando lo mismo (que el hueco se
rellena y se cuenta) y la cifra no interviene en ninguna aserción.

**Segunda pasada — verde (exit 0)**:

```
[OK]    Type check OK (tsc sin errores)
[OK]    Lint OK
[OK]    Formato OK
Test Files  60 passed (60)
     Tests  1176 passed (1176)
  Duration  10.89s
[OK]    Entorno listo. Puedes empezar a trabajar.
```

En el árbol están también los cambios del otro implementer en
`src/architecture.test.ts` y `src/modules/bankinter/bankinter.routes.test.ts`; no
los toqué y pasan en esta misma pasada.

## Sugerencias fuera de scope (NO aplicadas)

- `import.routes.test.ts` e `import.local.routes.test.ts` comprueban la raíz de la
  respuesta HTTP con `toMatchObject` sobre los seis contadores antiguos; podrían
  añadir los tres nuevos para que el contrato se vigile también en la capa de rutas.
  No lo hice porque el intent limita el cambio a los totales del run y el servicio
  ya está cubierto; es una aserción por archivo si el reviewer lo prefiere.
