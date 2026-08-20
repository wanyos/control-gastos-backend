# reimport-from-local-copy (F25) — review

> Feature **sin spec** (`sdd: false`): mandan los **10 criterios de `acceptance`** de
> `feature_list.json`. Informe revisado:
> [`progress/implementations/reimport-from-local-copy.md`](../implementations/reimport-from-local-copy.md).
> Todo lo comprobado se comprobó **ejecutando**: la suite completa, más seis sondas
> propias, sintéticas, con slug de banco propio (`zz-probe-…`), IBANes de
> `syntheticIban()` y directorio temporal, borradas al terminar. No se ha llamado a
> `POST /api/import` ni a `POST /api/import/local` contra Drive ni contra los datos del
> humano.

**Veredicto:** CHANGES_REQUESTED

## Cambios requeridos

1. **`src/modules/import/import.local.service.ts:183`** — el 404 **no nombra el banco
   que se pidió** cuando su carpeta existe en disco pero no tiene ninguna copia dentro:
   cae en la rama genérica y responde *«no hay ninguna copia local todavía»*, que es
   falso (otros bancos sí tienen copia) y es exactamente el «no había nada que importar»
   que el criterio C5 prohíbe. `missingCopyMessage()` solo nombra lo pedido cuando hay
   `name` o `year`; con **solo `bank`** no lo nombra nunca.
   **Reproducido dos veces**, con la carpeta del banco vacía y con la carpeta del banco
   sin ninguna subcarpeta de año, existiendo copia de otro banco: mismo mensaje genérico
   en ambos casos, sin el nombre del banco ni la lista de los que sí tienen copia (la
   rama de «banco desconocido», `:127`, sí la da).
   Qué hacer: añadir la rama de `selection.bank` en `missingCopyMessage()` — nombrar el
   banco pedido, decir que su carpeta está ahí pero sin copias y listar los que sí las
   tienen — y un test que lo fije, junto a los tres que ya existen para banco, año y
   archivo.

2. **`docs/api-contract.md` (§`POST /api/import/local`, «Sin cuerpo (o con `{}`) recorre
   todas las copias locales. **Es seguro repetirlo**») y `docs/architecture.md`
   ADR-025 §Consecuencias** — esa garantía es **incondicional y no se sostiene**: solo
   vale mientras el parser sea el mismo que el de la importación original. Si el archivo
   se importó con un parser que dejaba una fila sin interpretar y hoy ese parser la lee,
   el día entero **se renumera** (`daySequence`, límite vivo del ADR-015) y las filas
   renumeradas entran **como movimientos nuevos**.
   **Reproducido:** primera pasada con el parser antiguo (2 filas leídas de un día, 1
   ilegible) → `imported: 2`; segunda pasada sobre la **misma copia** con el parser
   mejorado (3 filas) → `imported: 2, duplicates: 1`, y la base queda con **4 filas para
   3 movimientos reales**: una de ellas es una copia de un movimiento ya guardado, con
   el mismo importe y la misma descripción y distinto `daySequence`.
   Esto no es un defecto nuevo de esta feature —viene del ADR-011/ADR-015 y el
   implementer lo anotó honestamente en §Sugerencias fuera de scope—, pero **la vía nueva
   lo pone a una llamada sin cuerpo de distancia y justo sobre el caso que la motiva**
   (reimportar copias antiguas, importadas con parsers anteriores a la F19 y la F22). El
   miedo que el humano escribió es literalmente «que la reimportación no se convierta en
   una forma fácil de duplicarme los movimientos», y hoy el documento que él lee le dice
   lo contrario.
   Qué hacer (documental, **no** hace falta tocar el dedup): matizar la frase en el
   contrato y en las consecuencias del ADR-025 —el descarte de duplicados vale **si el
   parser no ha cambiado desde la importación original**; si ha cambiado, reimportar ese
   archivo puede insertar copias del día afectado— y decir ahí mismo qué hacer en su
   lugar (pedir el archivo concreto con `{ bank, year, name }` y revisar el recuento en
   vez de la llamada sin cuerpo).

## Comprobado sin hallazgos

- **C1 — reimportar desde la copia local sin tocar Drive.** Verificado en el código y
  ejecutando: `importLocalCopies()` **no recibe ni puede recibir** un cliente de Drive
  (`ImportLocalDeps` no lo tiene), la ruta `/local` no lee `fastify.drive`
  (`import.routes.ts:60-63`) y el test de ruta pone **espías en `files.list/get/update/create`
  y exige cero llamadas**. El guardián de `src/architecture.test.ts:283` prohíbe por
  texto `moveFileToProcessed`, `downloadFileContent`, `ensureFolder`, `listPendingFiles`,
  `AppDriveClient`, `unlink`, `rename`, `rmdir` y `writeFile` en ese archivo; comprobé
  que el guardián **falla** si esos nombres aparecen y que hoy pasa. Las copias quedan
  byte a byte donde estaban y `movedToProcessed` es el literal `false` en el tipo.
- **C2 — dos pasadas no duplican, y las dos vías incómodas.** Sonda propia con el
  **mismo archivo renombrado**: segunda pasada `imported: 0, duplicates: 2`, la base
  sigue con 2 filas — el índice parcial `Movement_imported_dedup_key` (`accountId`,
  `bookingDate`, `type`, `amount`, `description`, `daySequence`) **no incluye el nombre
  del archivo**, así que renombrar no abre ninguna vía. Sonda con **dos archivos
  distintos (años distintos) que traen las mismas filas**: `importedCount: 1`,
  `duplicateCount: 1`, una sola fila en la base. Nada se reinventa: el descarte lo hace
  la base con `ON CONFLICT DO NOTHING`.
- **C3 — un archivo del que no entra ni un movimiento.** `assertTheFileBringsMovements()`
  (`import.service.ts:381`) corta **antes** de resolver la cuenta; comprobado por test
  que ni se cuenta como `imported`, ni se mueve (`update` de Drive sin llamar) ni deja
  una cuenta creada detrás.
- **C4 — la tabla de tres casos.** Busqué el cuarto y **no lo hay** dentro del contrato
  `ParsedStatement`: los casos son `movements = 0 ∧ unparsed = 0` (a),
  `movements = 0 ∧ unparsed > 0` (b) y `movements > 0` (c), y `toMovementRows()` mapea
  1:1 sin filtrar, así que `imported + duplicates = movements` y la regla de una frase
  —«llega a `procesados/` solo si al menos una de sus filas está en la base»— se cumple
  en el código, no solo en el informe. Ejecuté los dos bordes que podían romperla:
  **parcial con todas las filas leídas ya duplicadas** (`imported: 0, duplicates: 1,
  unparsedCount: 1`) → se mueve, y es correcto por la regla; y **dos filas idénticas del
  mismo archivo con el mismo `daySequence`** → la base descarta una (`imported: 1,
  duplicates: 1`), que es el comportamiento del índice desde la F8 y no algo que esta
  feature cambie (los parsers numeran el día sin repetir).
- **C5 — por dónde se pide y qué se responde.** Ruta nueva en vez de bandera, cuerpo
  opcional, cuerpo ausente aceptado, campo desconocido eliminado por ajv sin estrechar
  el recorrido en silencio, `name` con `..` o separador rechazado con 400 **antes** de
  tocar el disco (schema **y** `plainSegment()`, defensa en dos capas), y las rutas se
  construyen siempre a partir de entradas reales de `readdir`, así que no hay traversal
  posible. Las ramas de banco desconocido, año y archivo nombran lo que falta, dicen qué
  sí hay y dónde viven las copias. **Excepción: el hallazgo 1.**
- **C6 — la importación mensual no cambia.** Revisado el **diff**, no el informe:
  `import.routes.ts` solo añade la ruta `/local` (el handler de `/` es idéntico);
  `import.routes.test.ts` **no está modificado** (contrato de `POST /api/import`
  intacto); el núcleo se **extrae** a `importStatement()` sin cambiar el orden de los
  pasos, y `totals()` pasa a ser estructural con `?? 0`, aritméticamente equivalente a la
  versión que filtraba los `skipped` (que no llevan contadores). Los dos ajustes en
  tests existentes **no debilitan nada**: uno cambia un fixture que usaba como archivo
  «sano» uno de cero movimientos, el otro **añade** una aserción (`movedToProcessed: true`
  en el caso (c)). El único cambio de comportamiento es el buscado por C3, declarado en
  el informe, en el ADR y en el contrato.
- **C7 — los datos de hoy.** **No hay migración nueva** (`prisma/migrations/` sin cambios,
  la última sigue siendo la de inversiones) y ningún código nuevo escribe fuera de un
  directorio temporal. El recuento directo de la base **no he podido leerlo** (el entorno
  bloquea el acceso fuera de la suite, igual que le pasó al implementer): queda como
  comprobación de un segundo para el humano con `GET /api/accounts` y `GET /api/movements`.
  Mis sondas usaron slug propio y borraron sus cuentas y movimientos al terminar.
- **C8 — documentación.** `docs/api-contract.md` documenta la ruta nueva con su cuerpo,
  su respuesta 200, la tabla de los tres casos de cero, los dos códigos nuevos y sus dos
  errores (404 / 400); ADR-025 recoge las cinco decisiones, las alternativas descartadas
  y las consecuencias. **Con la salvedad del hallazgo 2.** (Detalle menor, no bloqueante:
  el contrato atribuye `Movement_imported_dedup_key` a la ADR-011 y el código a la
  ADR-015; ambas hablan de él, no hay contradicción.)
- **C9 — ni un dato real.** Los cuatro archivos nuevos usan `tmpdir()`, slugs
  `zz-local-…` e IBANes sintéticos; no hay red; `src/no-real-data.test.ts` pasa con su
  capa de comparación activa.
- **C10 — verificación.** `./init.sh` ejecutado por mí de principio a fin: type check OK
  y **765 tests en 45 archivos, todos en verde**. **El flake conocido no apareció** en
  esta ejecución. El mapeo criterio → test del informe se corresponde con tests que
  existen y que he visto pasar.
- **Arquitectura y convenciones.** El árbol nuevo está declarado en el guardián de
  `src/architecture.test.ts`; la ruta no toca Prisma (lo obtiene por `importDb`); el
  esquema de petición es JSON Schema nativo (ADR-003); sin dependencias nuevas; sin
  `console.log`; comentarios que explican el **porqué**, en inglés, como el resto del
  módulo.

## Nota de cierre

No escribo `progress/summaries/reimport-from-local-copy.md`: el resumen es la pieza de
cierre y solo se escribe al aprobar. Los dos cambios pedidos son pequeños —una rama de
mensaje con su test y dos matices de documentación— y no tocan el diseño, que es sólido:
la extracción de `importStatement()`, el guardián de arquitectura contra Drive y la regla
de una frase para `procesados/` son exactamente lo que la feature necesitaba.

---

# Segunda pasada (mismo día)

> El implementer aplicó los dos cambios. Vuelvo a comprobar **ejecutando**: `./init.sh`
> completo, trece sondas nuevas sobre **todas** las combinaciones de `{bank, year, name}`
> que pueden acabar en 404, y la repetición de lo que ya había dado por bueno. Todo
> sintético (`zz-probe3-…`, `zz-probe4-…`), en directorio temporal, borrado al terminar;
> ni una llamada a Drive ni a los datos del humano.

**Veredicto:** APPROVED

## Cambio 1 — el 404 nombra el banco: **corregido y verificado**

`missingCopyMessage()` (`src/modules/import/import.local.service.ts:172`) gana una rama
para `selection.bank` y una función nueva, `banksWithCopies()` (`:210`), que lista **los
bancos que de verdad tienen alguna copia dentro**, no las carpetas que existen.

Reproduje mis dos casos de la primera pasada y ahora los dos nombran el banco pedido,
dicen que su carpeta está pero vacía y listan los que sí tienen copia:

- carpeta del banco presente con un año vacío, existiendo copia de otro banco → correcto;
- carpeta del banco presente **sin ninguna subcarpeta de año** → correcto.

Los cubren dos tests nuevos (`import.local.service.test.ts:289` y `:309`), con una
aserción **positiva** sobre la frase nueva, así que no pueden pasar por accidente.

**Barrí además las otras once combinaciones.** El mensaje genérico («no hay ninguna copia
local todavía») solo se alcanza ya cuando **no hay ninguna carpeta de banco en disco**,
con o sin `bank` pedido — y ahí la frase es **verdad**, no la mentira que rechacé. Las
demás ramas nombran lo pedido: banco desconocido, año, archivo, `{bank, name}`,
`{bank, year, name}`. Criterio C5 cumplido.

## Cambio 2 — la idempotencia queda condicionada: **correcto y bien colocado**

- `docs/api-contract.md:675-692`: la frase de la llamada sin cuerpo ya no promete
  seguridad incondicional («no duplica nada **mientras el parser de ese banco sea el
  mismo**») y justo debajo, **antes** de la respuesta 200 y antes de que nadie dispare
  nada, va el aviso de `daySequence` con el mecanismo explicado y el «qué hacer en su
  lugar» (pedir `{ bank, year, name }` y mirar `imported`/`duplicates`). Quien lea solo el
  contrato se entera antes, no después.
- ADR-025 (`docs/architecture.md:1902`): la decisión 3 lleva la salvedad y las
  consecuencias añaden el punto entero, con el límite atribuido a donde nace
  (ADR-013 numera el día al parsear, ADR-015 delega el dedup en el índice) y con el
  arreglo de raíz declarado como otra feature con migración.
- **Ni promete de menos ni de más**, y lo comprobé contra el código: reimportar con el
  **mismo** parser sigue siendo idempotente (verificado abajo), y el riesgo descrito es
  exactamente el que reproduje —renumeración del día, filas nuevas con el mismo importe y
  el mismo concepto—, acotado al archivo cuyo parseo cambió, no a toda la base.

## Lo ya aprobado, vuelto a pasar (era hipótesis, ahora es hecho)

- **La ruta sigue sin poder tocar Drive.** Sonda con espías en `files.list/get/update/create`:
  cero llamadas **tanto en el 200 como en el camino del 404 nuevo** (la rama nueva solo
  usa `readdir`). El guardián de `src/architecture.test.ts:283` sigue con su lista
  intacta y en verde; `importLocalCopies` sigue sin poder recibir cliente de Drive.
- **Las dos vías incómodas de duplicado siguen cerradas.** Mismo archivo **renombrado**:
  `imported: 0, duplicates: 2`, la base sigue con 2 filas. **Dos archivos distintos con
  las mismas filas**: 1 importada, 1 duplicada, una sola fila en la base.
- **El dedup no se ha tocado:** `persistMovements()` es idéntica (`createMany` +
  `skipDuplicates`), el índice parcial es el mismo y `prisma/migrations/` sigue sin
  cambios (ninguna migración nueva).
- **La regla de cero movimientos sigue viva:** archivo sin movimientos → `failed` +
  `EMPTY_STATEMENT` + ninguna cuenta creada.
- **`./init.sh` ejecutado por mí, entero: type check OK y 767 tests en 45 archivos, todos
  en verde** (+2, los dos del mensaje). El flake de `movements.test.ts:318` no apareció.

## Observaciones que NO bloquean

Las dejo dichas porque son de la misma familia que el hallazgo corregido, pero ninguna
incumple C5: en las dos el mensaje **sí nombra lo que se pidió**, y las dos exigen que el
humano haya borrado archivos dejando las carpetas.

1. `import.local.service.ts:186-192` — la rama del año lista `yearsSeen`, que son
   **carpetas de año**, no años con copia. Con una carpeta de año vacía, pedir
   `{bank, year}` responde «no hay copia local del año 'AAAA' … con copia local hay:
   AAAA», que se contradice en la misma frase. `banksWithCopies()` ya resuelve ese
   problema un nivel más arriba; la misma idea aplicada al año lo cerraría.
2. `import.local.service.ts:124-129` — la rama del banco desconocido lista **todas** las
   carpetas de banco, incluidas las que no tienen copia dentro. Podría usar
   `banksWithCopies()` y quedaría coherente con la rama nueva.

Ambas son de una línea y sin riesgo; si se recogen, que sea con un test cada una.

Resumen de cierre: [`progress/summaries/reimport-from-local-copy.md`](../summaries/reimport-from-local-copy.md).
