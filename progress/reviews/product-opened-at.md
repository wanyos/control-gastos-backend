# product-opened-at (F15) — review

> Feature **sin spec** (`sdd: false`): se revisa contra el `intent` y los **8 criterios de
> `acceptance`** de `feature_list.json` (C1…C8), `docs/conventions.md` y `CHECKPOINTS.md`.
> Verificado leyendo el código y ejecutando la suite, no fiándose del informe del
> implementer.

**Veredicto:** CHANGES_REQUESTED

## Cambios requeridos

1. [`docs/data-model.md:214`](../../docs/data-model.md) — la fila de `InvestmentProduct.openedAt`
   de la tabla **«Columnas reservadas (definidas, sin escritor todavía)»** sigue diciendo
   *«El formato del fichero **no lleva** ese campo; si algún día se quiere, es un campo
   opcional más»*. Después de esta feature eso es **falso en las dos mitades**: el formato
   sí lo lleva y **no** es opcional, es obligatorio en los cuatro tipos. Esa tabla se
   declara a sí misma (`docs/data-model.md:216-220`) el **registro único de columnas sin
   escritor del proyecto**, y es la que leerá quien implemente la persistencia de
   inversiones — justo el consumidor al que esta feature le prepara el dato. Actualizar
   esa fila al mismo estado que la de `closedAt` (línea 213): quién la rellenará (el
   importador del fichero de inversiones) y de dónde sale (`openedAt` del JSON de
   producto, obligatorio desde la F15). El `roadmap.md:316` sí se actualizó; este quedó
   atrás.

   *No se exige tocar* `docs/architecture.md:751` ni `:845`: son el cuerpo del **ADR-012**,
   un registro fechado de la decisión de la F9, y el proyecto no anota los ADR como
   superados (no hay precedente en el archivo). Lo mismo para `specs/` y `progress/`
   anteriores, que son bitácora.

## Comprobado sin hallazgos

**C1 — el archivo admite `openedAt` ISO y el resultado lo expone junto a `closedAt`.**
`myinvestor.product.parser.ts:44` (entra en `commonKeys`, deja de ser clave no admitida),
`:80` (`readIso('openedAt', true)`), `:134` (sale en el objeto devuelto);
`myinvestor.types.ts:93` lo tipa `string` (no `string | null`), coherente con que un
archivo sin él sea un archivo fallido. Cubierto por el `toEqual` exhaustivo del producto
completo (`product.parser.test.ts:83`) y por *«keeps the exact opening date written…»*
(valores exactos `2024-02-29` y `2026-01-02`, no solo la forma).

**C2 — obligatorio de verdad en los cuatro tipos, acumulado en el motivo único, sin tumbar
el lote.** Verificado en el código, no solo en el test: la lectura ocurre **antes** de la
bifurcación `deposit` / resto (`myinvestor.product.parser.ts:80` frente a `:85`), y
`openedAt === null` entra en la guarda de salida (`:121`), así que un depósito sin
`openedAt` falla por el mismo camino que un fondo — no es un camino que solo cubra el test.
La ausencia cae en `missing[]` (`readIsoField`, `:230`) y se antepone como
`faltan campos obligatorios: …` a un `problems.join('; ')` único (`:112`, `:124`): no se
inventa ni un mensaje ni una forma de error nueva. El test *«accumulates a missing
openedAt with the rest of the problems»* fija que el motivo sigue siendo **uno**
(`reason.split(';')` de longitud 2 con tres problemas dentro), y el bucle de
*«fails the file naming openedAt when it is missing»* recorre los **cuatro** tipos
(`fund`, `etf`, `managed_portfolio`, `deposit`) — comprobado que `openedAt: undefined` en
los `overrides` sí borra la clave del JSON (`JSON.stringify` la omite) y que
`buildProductPortfolio` propaga el override hasta `buildProductFund`. Vacío (`""`) y mal
formado se rechazan nombrando `AAAA-MM-DD`, y `null` cuenta como ausente (`isAbsent`,
`:275`). El lote: `service.test.ts` › *«fails only the file that forgot openedAt and
parses the rest of the batch»* comprueba los dos archivos buenos parseados y **uno solo**
en `failed`.

**C3 — `closedAt` sin cambiar.** `readIso('closedAt', false)` intacto (`:81`), tipo
`string | null` intacto, y los dos tests preexistentes de `describe('closing a product
(R30, R31)')` siguen verdes sin tocarse.

**C4 — el volcado del año trae `openedAt`.** `service.test.ts:242` asserta el valor
concreto (`'2025-01-15'`) dentro del `products.json` volcado, no solo su presencia.

**C5 — sin regresión.** `git diff --stat` no toca `myinvestor.service.ts`,
`myinvestor.routes.ts` ni el parser del `.csv`: la ruta `POST /api/parser/myinvestor` y el
encaminamiento por extensión son literalmente el mismo código. Los tests previos siguen
verdes **sin relajar ninguna aserción** (el único cambio en un test viejo es añadir el
campo al `toEqual` exhaustivo). El resumen `products[]` de la respuesta HTTP mantiene sus
campos y `docs/api-contract.md:840` lo sigue describiendo igual: contrato coherente.

**C6 — nada de BD ni de otros parsers.** `git diff --stat` da exactamente 10 archivos:
5 de `src/modules/myinvestor/`, 4 de `docs/` + `feature_list.json` + `progress/`. **Ni
`prisma/schema.prisma`, ni `prisma/migrations/`, ni ningún archivo de `bankinter/` o del
parser `.csv`.** No se persiste nada y el parser sigue sin referenciar `prisma`.

**C7 — documentación (parte que sí sirve al humano hoy).**
`docs/myinvestor-product-files.md` es suficiente para escribir un archivo correcto a la
primera: `openedAt` está en las **tres** plantillas (A `fund`, A `managed_portfolio`,
B `deposit`), en la regla de fechas (`:44`), en la tabla de campos como **obligatorio** en
ambas columnas (`:133`), con sección propia (`:175-185`) que dice qué es, qué pasa si
falta, que `""` y `null` no valen, y que se copia igual todos los meses; y la nota vieja
que lo daba por «deliberadamente fuera» está **corregida y fechada** (`:150-155`), no
borrada en silencio. `docs/api-contract.md:745` y `:766` llevan el campo en el ejemplo y
en la tabla del modelo.

**C8 — verificación y privacidad.** `./init.sh` completo ejecutado por el revisor:
type check OK y **26 archivos / 379 tests, 0 fallos, 0 saltados**. Los 0 saltados importan:
la capa de **comparación** del guardián de la F14 estaba activa (las dos ramas de `var/`
presentes), no solo la capa por forma. Además de fiarme del verde, **leí las capturas
reales de `var/drive-read/`** y las contrasté con lo añadido: los únicos valores nuevos de
esta feature son fechas (`2025-01-15`, `2025-03-01`, `2026-01-15`, `2024-02-29`,
`2026-01-02`) que no aparecen en ninguna captura y que no son ninguna fecha real del
humano; no se ha añadido ni un importe, ni un nombre de producto, ni un concepto. Elegir
`openedAt` de otro año que `date` en los fixtures es acertado: un cruce de campos lo
delataría.

**Convenciones y checkpoints.** Código, comentarios y nombres de test en inglés; prosa de
`docs/` en español; sin `console.log` ni TODO suelto; sin dependencias nuevas; tests junto
al archivo, AAA y comprobando resultado concreto (nunca «no lanza»), con fixtures
construidos en código. **CHECKPOINTS C1-C4 en verde**; **C5** con la única salvedad
esperable de una feature aún abierta (`feature_list.json` la mantiene `in_progress`, sin
archivos sin trackear sospechosos: solo el informe del implementer); **C6** no aplica (no
cambia el contrato consumido por el frontend: `products[]` no cambia de forma); **C7** no
aplica (`sdd: false`); **C8** pendiente del cierre.

---

**Qué falta para APROBADO:** el punto 1. Es una línea de documentación; el código, los
tests y el resto de la documentación están correctos y no necesitan tocarse. No se escribe
`progress/summaries/product-opened-at.md` hasta que el veredicto sea de aprobación.

---

# Segunda pasada (2026-08-13)

**Veredicto:** APROBADO

## Lo que se ha comprobado de esta segunda vuelta

**El punto 1 está aplicado y bien aplicado.** Verificado sobre el `git diff` de la segunda
vuelta, no solo sobre el resultado final: el único archivo que cambia respecto a la
primera pasada es `docs/data-model.md` (+9/-1) y `progress/current.md` (la bitácora). El
`--stat` de `src/` es **idéntico** al de la primera pasada (fixture 4, parser 23,
parser.test 66, service.test 28, types 8): **no se ha tocado ni una línea de código con la
excusa de arreglar un documento**, que era el riesgo de una segunda vuelta.

- [`docs/data-model.md:214`](../../docs/data-model.md) — la fila de
  `InvestmentProduct.openedAt` ya está **al mismo nivel que la de `closedAt`** (línea 213):
  dice **quién la rellenará** (el importador del fichero de inversiones) y **de dónde
  sale** (el campo `openedAt` del JSON de producto, obligatorio en los cuatro tipos desde
  la F15), con la consecuencia correcta anotada (un archivo sin él es un archivo fallido,
  nunca un producto con la fecha en blanco) y conservando lo único de la fila vieja que
  seguía siendo cierto: **cero migración**, la columna existe desde la F9.
- La nota fechada añadida en [`docs/data-model.md:222-228`](../../docs/data-model.md) sigue
  el estilo que el propio documento ya usaba dos párrafos más abajo (🔄 «Cambio del
  2026-08-11»): explica que la columna **nació sin escritor y ya lo tiene**, en vez de
  borrar el rastro de la decisión anterior.
- **No se ha llevado nada por delante:** el diff de ese documento son exactamente dos
  hunks (la fila sustituida y la nota nueva). Las demás filas de la tabla de columnas
  reservadas (`transferId`, `categoryId`, `paymentMethod`, `note`, `status`,
  `balanceAfter`/`origin`, `daySequence`, `Movement.productId`, `closedAt`), el párrafo
  que explica las tres últimas filas y la nota del 2026-08-11 están **intactos**.

**`./init.sh` completo, segunda ejecución del revisor:** stack y archivos base OK,
`feature_list.json` válido, type check sin errores y
**26 archivos de test / 379 tests, 379 pasados, 0 fallidos y 0 saltados**. Los **0
saltados** son el dato que se pidió vigilar: significan que el guardián de privacidad de
la F14 corrió **también su capa de comparación** contra las capturas de `var/` (las dos
ramas presentes), no solo la capa por forma. El verde no es un verde a medias.

**Se mantiene todo lo comprobado en la primera pasada** (arriba, bloque «Comprobado sin
hallazgos»): obligatoriedad real en los cuatro tipos verificada en el código antes de la
bifurcación por tipo, motivo único acumulado, un archivo malo que no tumba el lote,
`closedAt` intacto, ninguna regresión de ruta ni de encaminamiento, `prisma/` y los otros
parsers sin tocar, ningún dato financiero real, y la documentación del formato suficiente
para escribir un archivo correcto a la primera.

**CHECKPOINTS:** C1, C2, C3, C4 y C5 en verde; C6 no aplica (no cambia la forma de lo que
consume el frontend); C7 no aplica (`sdd: false`); **C8 cumplido**: resumen de cierre en
[`progress/summaries/product-opened-at.md`](../summaries/product-opened-at.md).

Sin hallazgos nuevos. La feature puede cerrarse como `done`.
