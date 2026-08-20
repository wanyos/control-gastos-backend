# Resumen — feature 25 `reimport-from-local-copy`

Fecha de cierre: 2026-08-20
Intención original: `feature_list.json` → feature `reimport-from-local-copy`, bloque `intent`
Spec: no tiene (`sdd: false`); mandan sus 10 criterios de `acceptance`
Origen: [`progress/explorations/diagnostico-bankinter-sin-persistir-2026-08-20.md`](../explorations/diagnostico-bankinter-sin-persistir-2026-08-20.md)

## Qué hace ahora la app que antes no

**1. Puedes reimportar un archivo que ya está en `procesados/` sin entrar en Drive a mover
nada.** Cada archivo que se descarga deja una copia cruda en `var/drive-read/<banco>/<año>/`;
ahora hay una vía que importa **desde esa copia**. No descarga, no lista, no mueve y no
borra: no hace ni una llamada a Drive. Repetirla no te duplica movimientos: la segunda
pasada te dice `duplicates`, no `imported`.

**2. Un archivo del que no entra ni un movimiento ya no te miente.** Antes se reportaba
como importado y se movía a `procesados/` igualmente —la puerta de un solo sentido—, así
que el fallo desaparecía de tu vista. Ahora sale como `failed` con un motivo que obliga a
mirarlo y **se queda pendiente**, listo para reintentar.

## Por dónde se usa (puntos de entrada)

- **`POST /api/import/local`** — reimporta desde la copia local. Cuerpo **opcional**
  `{ bank?, year?, name? }`: cada parte estrecha el recorrido y sin cuerpo recorre todas
  las copias. Responde el mismo informe que la importación normal, sin `fileId` y con
  `movedToProcessed` siempre `false`.
  → [import.routes.ts:61](../../src/modules/import/import.routes.ts#L61)
- **`POST /api/import`** — la importación de cada mes, **igual que siempre**: sigue
  leyendo lo pendiente en Drive y moviendo a `procesados/` lo que guarda. Su contrato no
  ha cambiado ni una línea.
  → [import.routes.ts:48](../../src/modules/import/import.routes.ts#L48)
- Si lo que pides no está en disco: **404 `LOCAL_COPY_NOT_FOUND`**, que dice qué falta
  (el banco, el año o el archivo), qué sí hay ahí y dónde viven las copias. Nunca un 200
  con «no había nada que importar».

## Dónde está el código (para revisión directa)

> Los enlaces son clicables en la vista previa de Markdown de VS Code (Ctrl/Cmd + clic).

### La vía nueva: reimportar desde la copia local

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Recorre las copias que tocan, las parsea y las guarda; nunca mueve nada | `importLocalCopies` | [import.local.service.ts:66](../../src/modules/import/import.local.service.ts#L66) |
| Encuentra las copias que casan con lo pedido; jamás devuelve lista vacía | `findCandidates` | [import.local.service.ts:107](../../src/modules/import/import.local.service.ts#L107) |
| Redacta el 404 nombrando lo que falta (banco, año o archivo) | `missingCopyMessage` | [import.local.service.ts:172](../../src/modules/import/import.local.service.ts#L172) |
| Lista los bancos que de verdad tienen alguna copia dentro | `banksWithCopies` | [import.local.service.ts:210](../../src/modules/import/import.local.service.ts#L210) |
| Rechaza un `bank`/`year`/`name` que sea una ruta, antes de tocar el disco | `plainSegment` | [import.local.service.ts:241](../../src/modules/import/import.local.service.ts#L241) |
| Esquema del cuerpo opcional `{ bank?, year?, name? }` | `localImportSchema` | [import.schema.ts:15](../../src/modules/import/import.schema.ts#L15) |

### El núcleo compartido por las dos vías (lo que se extrajo, no se duplicó)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Parsear → resolver cuenta → mapear → guardar, **sin Drive** | `importStatement` | [import.service.ts:334](../../src/modules/import/import.service.ts#L334) |
| La regla de «cero movimientos»: qué archivo puede llegar a `procesados/` | `assertTheFileBringsMovements` | [import.service.ts:381](../../src/modules/import/import.service.ts#L381) |
| Elegir parser por el banco de la carpeta y la extensión (ahora exportado) | `selectAdapter` | [import.service.ts:417](../../src/modules/import/import.service.ts#L417) |
| Sumar los recuentos de una pasada, sirviendo a las dos vías | `totals` | [import.service.ts:438](../../src/modules/import/import.service.ts#L438) |
| La importación con Drive, que usa el mismo núcleo y sigue moviendo | `importFile` | [import.service.ts:258](../../src/modules/import/import.service.ts#L258) |
| El descarte de duplicados, intacto (lo hace el índice parcial de la base) | `persistMovements` | [import.service.ts:163](../../src/modules/import/import.service.ts#L163) |

### Errores y formas de la respuesta

| Qué es | Símbolo | Código |
| --- | --- | --- |
| El archivo se lee bien y no trae ni una línea (422) | `EmptyStatementError` | [app-error.ts:117](../../src/errors/app-error.ts#L117) |
| El archivo trae líneas y ninguna se pudo interpretar (422) | `UnreadableStatementError` | [app-error.ts:132](../../src/errors/app-error.ts#L132) |
| La copia local que pides no está en disco (404) | `LocalCopyNotFoundError` | [app-error.ts:145](../../src/errors/app-error.ts#L145) |
| Lo que le pasó a un archivo, sin la parte de Drive | `StatementResult` | [import.types.ts:96](../../src/modules/import/import.types.ts#L96) |
| Informe de una copia local (`movedToProcessed` es `false` por tipo) | `LocalFileReport` | [import.types.ts:131](../../src/modules/import/import.types.ts#L131) |
| Resultado de una pasada local | `LocalImportRunResult` | [import.types.ts:134](../../src/modules/import/import.types.ts#L134) |

### Tests

| Qué cubre | Código |
| --- | --- |
| La vía local entera: 17 tests (sin Drive, duplicados, 404 por nombre, cero movimientos) | [import.local.service.test.ts](../../src/modules/import/import.local.service.test.ts) |
| Que reimportar dos veces no duplica ni una fila | [import.local.service.test.ts:236](../../src/modules/import/import.local.service.test.ts#L236) |
| Que el 404 nombra el banco aunque su carpeta exista vacía | [import.local.service.test.ts:289](../../src/modules/import/import.local.service.test.ts#L289) |
| La ruta HTTP, con espías de Drive que exigen **cero** llamadas | [import.local.routes.test.ts:103](../../src/modules/import/import.local.routes.test.ts#L103) |
| Un archivo sin movimientos: `failed`, no se mueve, no crea cuenta | [import.service.test.ts:742](../../src/modules/import/import.service.test.ts#L742) |
| Un archivo entero ilegible: su propio código, tampoco se mueve | [import.service.test.ts:781](../../src/modules/import/import.service.test.ts#L781) |
| Que un archivo con **algunas** filas ilegibles se sigue moviendo | [import.service.test.ts:811](../../src/modules/import/import.service.test.ts#L811) |
| Guardián: la vía local **no puede** nombrar nada de Drive | [architecture.test.ts:283](../../src/architecture.test.ts#L283) |

### Documentación

| Qué | Dónde |
| --- | --- |
| La ruta nueva, su cuerpo, su respuesta, sus dos errores y el aviso del `daySequence` | [api-contract.md:655](../../docs/api-contract.md#L655) |
| ADR-025: por qué `procesados/` era una puerta de un solo sentido y por qué deja de serlo | [architecture.md:1902](../../docs/architecture.md#L1902) |

## Cumplimiento de la intención

- ✅ «Puedo volver a importar un fichero que ya está en `procesados/` sin mover nada en
  Drive» → se cumple; verificado en `import.local.service.test.ts:125` y, con espías que
  exigen cero llamadas a Drive, en `import.local.routes.test.ts:103`.
- ✅ «Si lo reimporto dos veces, la segunda no me duplica ni un movimiento» → se cumple;
  verificado en `import.local.service.test.ts:236` (compara fila a fila el antes y el
  después) y `import.local.routes.test.ts:151`. En la revisión probé además las dos vías
  incómodas —el mismo archivo **renombrado** y **dos archivos distintos con las mismas
  filas**—: en las dos sale `duplicates`, no copias.
- ✅ «Un fichero que no aporta ni un movimiento NO se me cuenta como importado y no
  desaparece de la lista de pendientes» → se cumple; verificado en
  `import.service.test.ts:742` (vacío), `:781` (todo ilegible) y
  `import.local.service.test.ts:365`.
- ✅ «Mis 455 movimientos y mis 4 cuentas siguen exactamente igual» → no hay migración ni
  escritura fuera de directorios temporales, y ningún test toca cuentas que no sean las
  suyas (`zz-…`, borradas al terminar). **Comprobación de un segundo que te toca a ti**:
  `GET /api/accounts` y `GET /api/movements` — ni el implementer ni yo pudimos leer el
  recuento directo, el entorno bloquea el acceso a la base fuera de la suite.

## Decisiones que se tomaron por ti

- **(delegado) Ruta nueva, no una bandera en `POST /api/import`.** Las dos operaciones
  prometen cosas distintas —una mueve lo que guarda, la otra no mueve nunca— y en la misma
  ruta «esto no toca tu Drive» habría dependido de leer bien un campo del cuerpo.
- **(delegado) El archivo se identifica por su ruta** (carpeta de banco + año + nombre):
  en disco no hay id y el nombre se repite entre bancos y años. Las tres partes son
  opcionales.
- **(delegado) Si la copia no está, 404 `LOCAL_COPY_NOT_FOUND`** nombrando lo más concreto
  que pediste y falta, y diciendo qué sí hay. Nunca un 200 vacío.
- **(delegado) «Cero movimientos» son tres casos:** el archivo vacío (`EMPTY_STATEMENT`) y
  el archivo entero ilegible (`ALL_ROWS_UNPARSED`) son fallos y **no se mueven**; todas las
  filas ya guardadas (`imported: 0, duplicates: n`) es sano y **sí se mueve**. La regla, en
  una frase: **un archivo llega a `procesados/` solo si al menos una de sus filas está en
  la base de datos**, se haya guardado ahora o ya estuviera.
- **(añadido) `bank`, `year` y `name` no pueden ser rutas:** con `/`, `\` o `..` es un 400
  antes de leer nada del disco.

## Qué NO se tocó / quedó fuera

- **La importación de cada mes no cambia**: mismo contrato, mismos recuentos, mismo
  movimiento a `procesados/`. Verificado en el diff, no en el informe.
- **El mecanismo de duplicados no se ha tocado**: sigue siendo el mismo índice de la base.
  Sin migración y sin dependencias nuevas.
- **No hay forma de listar qué copias tienes** sin lanzar la importación (hoy te enteras
  de rebote por el 404).
- **Si un archivo nunca se descargó en esta máquina, no hay copia que reimportar**: ahí
  sigue el camino de siempre, moverlo en Drive.

## Notas para el futuro

- ⚠️ **La idempotencia tiene una condición: que el parser sea el mismo con el que se
  importó el archivo.** El descarte de duplicados distingue dos líneas del mismo día por
  su posición dentro del día, y esa posición **se recalcula al parsear**. Si el parser
  antiguo dejaba una línea sin leer y el de hoy la lee, ese día se renumera y sus líneas
  entran como movimientos nuevos, con el mismo importe y el mismo concepto. Es un límite
  heredado del modelo, no de esta vía. **Recomendación al usarla sobre copias viejas: pide
  el archivo concreto con `{ bank, year, name }` y mira `imported`/`duplicates` antes de
  seguir**, en vez de la llamada sin cuerpo. Está escrito en el contrato, justo encima de
  la llamada.
- Dos archivos pendientes con el mismo nombre se pisan en la copia local (límite conocido
  de la F5); ahora eso afecta también a la recuperación, porque la copia **es** el
  respaldo. Se arreglaría dando a la copia el id del archivo de Drive.
- El 404 podría afinarse en dos ramas menores (año y banco desconocido, que listan
  carpetas aunque estén vacías): detalle anotado en la review, sin riesgo.
- Sugerencia del implementer no aplicada: un `GET /api/import/local` que liste qué copias
  hay sin importar nada.
