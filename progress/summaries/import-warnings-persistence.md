# Resumen — feature 48 `import-warnings-persistence`

Fecha de cierre: 2026-09-18
Intención original: `feature_list.json` → feature `import-warnings-persistence`, bloque `intent`
Spec: [`specs/48-import-warnings-persistence/`](../../specs/48-import-warnings-persistence/)

> **Una palabra pendiente de tu respuesta.** En la ruta y en los nombres del
> código, las dos cosas que se guardan se llaman `warnings` (lo viste en la
> decisión 1 del spec). Como palabra en castellano se propuso **«aviso»**, y
> **no la damos por aprobada**: está anotada en
> [`docs/vocabulario.md`](../../docs/vocabulario.md) §Propuestos y hasta que
> respondas, en la prosa —incluida la de este resumen— se dice
> «las filas ilegibles y los descuadres».

## Qué hace ahora la app que antes no

Cuando importas, lo que la app no sabe arreglar sola —las filas de un extracto
que el parser no pudo leer y los descuadres de saldo— **ya no muere al cerrar el
informe de la importación**: queda guardado en la base de datos con el archivo del
que salió. Puedes pedir cuando quieras lo que sigue sin resolver, y decir de un
descuadre «ya lo he mirado», con una nota tuya, para que deje de salir. Antes eso
solo viajaba en la respuesta de la importación y se perdía.

Lo que **no** cambió: un archivo con filas ilegibles entra y se mueve a
`procesados/` exactamente igual que antes, con los mismos números en el informe, y
ningún movimiento ya guardado se toca.

## Por dónde se usa (puntos de entrada)

- **`GET /api/import/warnings`** — devuelve lo que sigue abierto: las filas
  ilegibles guardadas y los descuadres todavía pendientes, cada lista con su
  contador, de lo más reciente a lo más antiguo. No pagina.
  → [import.warnings.routes.ts:32](../../src/modules/import/import.warnings.routes.ts#L32)
- **`PATCH /api/import/warnings/balance-mismatches/:id`** — marca un descuadre
  como revisado (o lo devuelve a pendiente) y guarda tu nota.
  → [import.warnings.routes.ts:36](../../src/modules/import/import.warnings.routes.ts#L36)
- **El enganche dentro de la importación** — la única línea que hace que
  `POST /api/import` y `POST /api/import/local` guarden lo que el archivo dejó sin
  resolver, justo antes de darlo por importado.
  → [import.service.ts:672](../../src/modules/import/import.service.ts#L672)
- **El registro de las dos rutas** bajo el prefijo `/api/import` que ya existía
  (por eso `src/app.ts` no se tocó).
  → [import.routes.ts:83](../../src/modules/import/import.routes.ts#L83)

Todo está descrito para el frontend en `docs/api-contract.md`, sección **«Lo que
una importación deja sin resolver (feature 48)»**.

## Dónde está el código (para revisión directa)

### Dónde se guarda (base de datos)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Tabla de las filas que el parser no pudo leer (banco, año, archivo, nº de fila, motivo) | `model ImportUnparsedRow` | [schema.prisma:274](../../prisma/schema.prisma#L274) |
| Tabla de los descuadres (cuenta, fecha, los dos importes, qué comprobación, estado y nota) | `model ImportBalanceMismatch` | [schema.prisma:294](../../prisma/schema.prisma#L294) |
| Los dos estados de un descuadre (pendiente / revisado) | `enum ImportWarningStatus` | [schema.prisma:72](../../prisma/schema.prisma#L72) |
| La migración que crea las dos tablas, sus dos claves de «esto ya está guardado» y la clave ajena a `Account` | — | [migration.sql](../../prisma/migrations/20260918091426_import_warnings/migration.sql) |

### La lógica (el único módulo que lee y escribe esas dos tablas)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Guarda lo que dejó **un** archivo, todo en una transacción; si ya estaba guardado, lo actualiza en vez de duplicarlo, y nunca toca tu marcado ni tu nota | `persistImportWarnings` | [import.warnings.service.ts:83](../../src/modules/import/import.warnings.service.ts#L83) |
| Devuelve lo que sigue abierto y lo deja con la misma forma que ya tiene en el informe de la importación | `listPendingImportWarnings` | [import.warnings.service.ts:154](../../src/modules/import/import.warnings.service.ts#L154) |
| Marca un descuadre revisado o lo devuelve a pendiente, guarda la nota y da 404 si el id no existe | `reviewBalanceMismatch` | [import.warnings.service.ts:186](../../src/modules/import/import.warnings.service.ts#L186) |
| La forma exacta de lo que sale por la API (y el porqué de cada campo) | `SerializedUnparsedRow`, `SerializedBalanceMismatch`, `ImportWarningsReport`, `WarningFileRef` | [import.warnings.types.ts:17](../../src/modules/import/import.warnings.types.ts#L17) |

### La capa HTTP

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Las dos rutas, que no tocan la base de datos: llaman al módulo de arriba | `importWarningsRoutes` | [import.warnings.routes.ts:29](../../src/modules/import/import.warnings.routes.ts#L29) |
| Qué se admite en el `PATCH`: solo `status` (dos valores) y `note` (máx. 500), al menos una de las dos, y nada más | `reviewBalanceMismatchSchema`, `reviewBalanceMismatchBodyProperties` | [import.warnings.schema.ts:23](../../src/modules/import/import.warnings.schema.ts#L23) |

### El enganche en las dos formas de importar

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| El núcleo compartido recibe de qué archivo se trata | `ImportStatementDeps.file` | [import.service.ts:602](../../src/modules/import/import.service.ts#L602) |
| …y guarda lo que ese archivo dejó, dentro del `try` y antes de darlo por importado | `importStatement` | [import.service.ts:672](../../src/modules/import/import.service.ts#L672) |
| El camino de Drive pasa banco, año y nombre del archivo | `importPending` | [import.service.ts:394](../../src/modules/import/import.service.ts#L394) |
| El camino de la copia local pasa los mismos tres datos, con el banco como slug | `importLocalCopies` | [import.local.service.ts:97](../../src/modules/import/import.local.service.ts#L97) |

### Documentación

| Qué hace | Código |
| --- | --- |
| Las dos rutas, todos sus campos, sus errores y la nota de que no pagina | [api-contract.md:1817](../../docs/api-contract.md#L1817) §«Lo que una importación deja sin resolver (feature 48)» |
| La decisión de fondo: se guarda el hecho congelado, con clave natural, y solo tú lo cierras | [architecture.md:2477](../../docs/architecture.md#L2477) (ADR-031) |
| La decisión 3 del ADR-030 («el descuadre no se persiste») queda marcada como superada | [architecture.md:2425](../../docs/architecture.md#L2425) |

### Tests

| Qué cubre | Código |
| --- | --- |
| Guardado, no duplicar al reimportar, respetar lo ya revisado, listar, marcar y desmarcar, id inexistente (12 tests) | [import.warnings.service.test.ts:27](../../src/modules/import/import.warnings.service.test.ts#L27) |
| Las dos rutas por HTTP con la app real: `200` con las dos listas, marcado y desmarcado, `404` y cinco formas de `400` (12 tests) | [import.warnings.routes.test.ts:27](../../src/modules/import/import.warnings.routes.test.ts#L27) |
| Que el contrato nombra las dos rutas y **todos** los campos, y que su ejemplo trae exactamente esos (10 tests) | [import.warnings.docs.test.ts:55](../../src/modules/import/import.warnings.docs.test.ts#L55) |
| Importación de Drive: el archivo con filas ilegibles se comporta igual que antes y además las guarda; un archivo fallido no guarda nada; si el guardado falla, el archivo sale fallido y no se mueve | [import.service.test.ts:2081](../../src/modules/import/import.service.test.ts#L2081) |
| Importación desde la copia local: reimportar la misma copia no duplica nada | [import.local.service.test.ts:1006](../../src/modules/import/import.local.service.test.ts#L1006) |

## Cumplimiento de la intención

Por cada punto de tu `como_se_que_esta_bien`:

- ✅ **«Importo un archivo con filas que no se pueden leer: las demás entran y el
  archivo se mueve a `procesados/` como hasta ahora, pero esas filas quedan
  guardadas con el archivo del que salen y el motivo.»** → se cumple. Verificado en
  `import.service.test.ts`, test «imports and moves a file with unreadable rows
  exactly as before, AND stores them (R1, R3)», que comprueba uno a uno los mismos
  contadores de antes (`imported`, `duplicates`, `unparsedCount`, los totales del
  run) **y** las dos filas guardadas con banco, año, archivo, número y motivo.
- ✅ **«Cierro el modal, vuelvo a abrir la aplicación y puedo pedir los avisos que
  siguen sin resolver.»** → se cumple: están en la base de datos, no en memoria, y
  se piden con `GET /api/import/warnings`. Verificado en
  `import.warnings.routes.test.ts`, test «answers 200 with the two lists and their
  counts (R9)».
- ✅ **«De un descuadre puedo decir que lo he revisado, con una nota mía si quiero,
  y deja de aparecer entre los pendientes.»** → se cumple, y además es reversible.
  Verificado en `import.warnings.routes.test.ts`, tests «marks a descuadre reviewed
  with its note and returns it serialized (R11)» y «leaves a reviewed descuadre out
  of the listing and out of its counter (R10)».
- ✅ **«Importo dos veces el mismo archivo y no me salen los mismos avisos
  duplicados.»** → se cumple. Verificado con una importación de verdad repetida en
  `import.local.service.test.ts` (segunda pasada: mismos `id` y misma fecha de alta,
  incluso con la carpeta escrita en mayúsculas) y en `import.warnings.service.test.ts`,
  tests «reimporting the same file updates the same warnings instead of duplicating
  them (R6)» y «reimporting does NOT resurrect a descuadre already reviewed (R7)».
- ✅ **«Una importación sin nada raro no deja ningún aviso pendiente.»** → se
  cumple: ni siquiera se abre una transacción. Verificado en
  `import.warnings.service.test.ts`, test «writes nothing at all when the file left
  no warning (R8)».
- ✅ **«`docs/api-contract.md` describe lo nuevo, para que el frontend construya
  contra él.»** → se cumple, y hay un test que lo vigila: si mañana se añade un
  campo al código y no al contrato, `import.warnings.docs.test.ts` se pone rojo.

## Decisiones que se tomaron por ti

- **(delegado) Cómo se guardan y cómo se consultan.** Dos tablas separadas (una
  para las filas ilegibles, otra para los descuadres) y dos rutas, con dos listas
  y sus contadores. Cada elemento llega con los mismos campos que ya ves en el
  modal, más su `id` y su estado.
- **(delegado) Qué hace que sea «el mismo» al reimportar.** El archivo del que
  salió (banco, año, nombre) más su contenido: el número de fila, en una fila
  ilegible; la cuenta, la fecha, la comprobación y los dos importes, en un
  descuadre. Se ve en la tabla, no es una huella opaca.
- **(delegado) Un descuadre se queda hasta que tú lo marques**, aunque una
  importación posterior ya cuadre. Lo guardado es un hecho fechado con los
  importes congelados: no se recalcula nunca, así que no puede quedarse diciendo
  algo falso.
- **(añadido) Un archivo que falla entero no deja nada guardado**: no se mueve y
  se volverá a intentar, así que lo suyo se repetiría solo en la siguiente pasada.
- **(añadido) Si falla el guardado, el archivo sale fallido y no se mueve**, en
  vez de importarse perdiendo el hallazgo en silencio.
- **(añadido) Marcar revisado es reversible** (puedes devolverlo a pendiente), por
  simetría con el `status` de un movimiento: un clic equivocado no es definitivo.
- **(añadido) Errores de siempre**: `404` si el id no existe, `400` si el cuerpo
  está vacío, trae algo que no toca o un valor fuera de la lista. Ningún código de
  error nuevo.

## Qué NO se tocó / quedó fuera

- **Ninguna pantalla.** El frontend hará su parte en otra sesión, contra
  `docs/api-contract.md`.
- **Arreglar o borrar una fila ilegible**: no se puede todavía, y por eso salen
  siempre en la lista (cabo suelto 23 del roadmap).
- **Los traspasos dudosos**, como dijiste, quedan fuera.
- **Ningún movimiento guardado cambia**, ni su importe, ni su fecha, ni su
  descripción. Tampoco cambia la forma del informe de la importación: `GET
  /api/accounts` y la respuesta de `POST /api/import` siguen exactamente igual.
- **La consulta no pagina**: devuelve entero lo que queda por mirar.

## Notas para el futuro

- **La lista de filas ilegibles solo crece** mientras no exista la feature del
  cabo suelto 23: hoy no hay forma de dar una por resuelta. Si se hace larga, ahí
  es donde se resuelve (y entonces tocará mirar la paginación).
- **Dos descuadres idénticos del mismo archivo, la misma cuenta y el mismo día,
  con los mismos dos importes, se guardan como uno.** Es el precio de la clave
  legible; si algún día pasa de verdad, se afina.
- **La palabra sigue pendiente de tu respuesta** (ver la nota del principio de
  este resumen y `docs/vocabulario.md` §Propuestos).
