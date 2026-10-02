# Resumen — feature 54 `unparsed-row-review`

Fecha de cierre: 2026-10-02
Intención original: `feature_list.json` → feature `unparsed-row-review`, bloque `intent`
Spec: `specs/54-unparsed-row-review/`

## Qué hace ahora la app que antes no

Ahora puedes dar por revisada una fila que el parser no pudo leer, con una nota
opcional de hasta 500 caracteres, y quitarle esa marca si te equivocaste. Al
consultar lo que las importaciones dejaron sin resolver, la fila revisada sigue
saliendo, marcada, con su nota y la fecha en que la revisaste, y el contador de
filas cuenta solo las que te quedan por mirar. Antes esas filas se quedaban para
siempre como pendientes.

## Por dónde se toca (puntos de entrada)

| Cómo se usa | Código |
| --- | --- |
| `PATCH /api/import/warnings/unparsed-rows/:id` — da la fila por revisada, la devuelve a pendiente o guarda la nota | [import.warnings.routes.ts:60](../../src/modules/import/import.warnings.routes.ts#L60) |
| `GET /api/import/warnings` — la consulta, que ahora trae también las filas revisadas | [import.warnings.routes.ts:41](../../src/modules/import/import.warnings.routes.ts#L41) |
| `reviewUnparsedRow` — la función que escribe la marca, la fecha y la nota | [import.warnings.service.ts:194](../../src/modules/import/import.warnings.service.ts#L194) |
| `listPendingImportWarnings` — la función que sirve la consulta y calcula el contador | [import.warnings.service.ts:164](../../src/modules/import/import.warnings.service.ts#L164) |

## Dónde está el código

### Base de datos

| Qué hace | Dónde |
| --- | --- |
| Tres columnas nuevas en la tabla de filas: estado, nota y fecha de revisión | [schema.prisma](../../prisma/schema.prisma) → `model ImportUnparsedRow` (`status`, `note`, `reviewedAt`) |
| Comentario corregido: una fila ya puede tener estado | [schema.prisma](../../prisma/schema.prisma) → `enum ImportWarningStatus` |
| La migración, que solo añade esas tres columnas | [migration.sql](../../prisma/migrations/20261002120000_unparsed_row_review/migration.sql) |

### Ruta y validación

| Qué hace | Dónde |
| --- | --- |
| Registra la ruta nueva y rechaza cualquier propiedad que no sea `status` o `note` | [import.warnings.routes.ts](../../src/modules/import/import.warnings.routes.ts) → `importWarningsRoutes` |
| Forma de la petición: la misma que la de los descuadres de saldo | [import.warnings.schema.ts](../../src/modules/import/import.warnings.schema.ts) → `reviewUnparsedRowSchema` |
| Comentario que lista las tres rutas (solo el comentario) | [import.routes.ts](../../src/modules/import/import.routes.ts) → `importRoutes` |

### Lógica

| Qué hace | Dónde |
| --- | --- |
| Marca, desmarca y guarda la nota; responde 404 si la fila no existe; nunca borra | [import.warnings.service.ts](../../src/modules/import/import.warnings.service.ts) → `reviewUnparsedRow` |
| Devuelve la fila con `status`, `note` y `reviewedAt` | [import.warnings.service.ts](../../src/modules/import/import.warnings.service.ts) → `serializeUnparsedRow` |
| El contador de filas cuenta solo las no revisadas | [import.warnings.service.ts](../../src/modules/import/import.warnings.service.ts) → `listPendingImportWarnings` |
| Lo que hace la importación al volver a guardar una fila: sin cambio de código, solo comentarios | [import.warnings.service.ts](../../src/modules/import/import.warnings.service.ts) → `persistImportWarnings` |
| Tipos de la fila que sale y de la petición | [import.warnings.types.ts](../../src/modules/import/import.warnings.types.ts) → `SerializedUnparsedRow`, `ReviewUnparsedRowPatch` |

### Comprobación de datos reales

| Qué hace | Dónde |
| --- | --- |
| La nota de la fila entra en los textos que el guardián `src/no-real-data.test.ts` compara con los archivos del repositorio | [test-real-data.ts](../../src/lib/test-real-data.ts) → `comparedColumns` |

### Tests

| Qué cubre | Dónde |
| --- | --- |
| La ruta: revisar con nota y sin nota, volver a pendiente, solo la nota, 404, los 400, la lista y el contador (9 tests) | [import.warnings.routes.test.ts](../../src/modules/import/import.warnings.routes.test.ts) → `unreadable row review routes (feature 54)` |
| Fila nueva nace sin revisar; reimportar no quita marca, nota ni fecha; 404 desde la función (3 tests) | [import.warnings.service.test.ts](../../src/modules/import/import.warnings.service.test.ts) → `unreadable row review (feature 54)` |
| Los documentos dicen lo nuevo (4 tests) y la lista de campos de la fila pasa a ocho | [import.warnings.docs.test.ts](../../src/modules/import/import.warnings.docs.test.ts) → `the documents of feature 54 (R13, R14, R15)`, `unparsedRowFields` |

### Documentos

| Qué dice | Dónde |
| --- | --- |
| La ruta nueva, los tres campos nuevos de cada fila y el cambio del contador | [api-contract.md](../../docs/api-contract.md) → «Lo que una importación deja sin resolver» |
| Las dos tablas de la feature 48, que el documento no nombraba, con sus claves | [data-model.md](../../docs/data-model.md) → «Lo que una importación deja sin resolver (F48, F54)» |
| Línea de revisión encima del ADR-031 | [architecture.md](../../docs/architecture.md) → ADR-031 |
| Cabo suelto 23 cerrado; fila E5 con la F54 | [roadmap.md](../../docs/roadmap.md) → fila 23, §E5 |
| La nota de la fila, en la lista de textos comparados | [conventions.md](../../docs/conventions.md) → §Tests |

## Cumplimiento de la intención

Resultados de `./init.sh --checks 54`, lanzado por el reviewer el 2026-10-02:
8 de 8 en verde.

- ✅ "Puedo dar por revisada una fila que el parser no pudo leer, escribiendo una
  nota." → se cumple; lo verifica `marks an unreadable row reviewed with its note
  and returns it serialized`. Check 1: ✅ (`Tests 1 passed`).
- ✅ "Al consultar lo que las importaciones dejaron sin resolver, una fila
  revisada sale como revisada, con su nota y cuándo la revisé." → se cumple; lo
  verifican `lists a reviewed unreadable row as reviewed, with its note and when
  it was reviewed` y `counts only the unreadable rows still pending`.
  Checks 2 y 3: ✅ ✅.
- ✅ "Puedo quitarle la marca de revisada a una fila si me equivoqué." → se
  cumple; lo verifica `puts a reviewed unreadable row back to pending keeping its
  note`. Check 4: ✅.
- ✅ "Si pido revisar una fila que no existe, me responde con un error claro." →
  se cumple (`404 NOT_FOUND`); lo verifica `answers 404 NOT_FOUND when the id is
  of no stored unreadable row`. Check 5: ✅.
- ✅ "Volver a importar el mismo archivo no le quita a la fila la marca de
  revisada ni la nota." → se cumple; lo verifica `reimporting does NOT take the
  reviewed mark nor the note off an unreadable row`. Check 6: ✅.
- ✅ "docs/api-contract.md describe lo nuevo, para que el frontend construya
  contra él." → se cumple; lo verifica `api-contract: names the route that
  reviews an unreadable row and its fields`. Check 7: ✅.
- ✅ (añadido) La importación y la revisión de un descuadre de saldo siguen
  igual: la suite entera, 70 archivos y 1302 tests. Check 8: ✅.

## Decisiones que se tomaron por ti

- (delegado) La ruta es `PATCH /api/import/warnings/unparsed-rows/:id`, con el
  mismo cuerpo que la de los descuadres (`status` y `note`).
- (delegado) La nota es opcional, máximo 500 caracteres. Quitar la marca conserva
  la nota; mandar solo la nota no cambia el estado; `null` la borra.
- (delegado) La consulta no filtra: salen todas las filas, revisadas incluidas.
  Es distinto de los descuadres, que al revisarse dejan de salir.
- (añadido) El contador de filas cuenta solo las que quedan sin revisar; ya no es
  el tamaño de la lista.
- (añadido) `docs/data-model.md` documenta las dos tablas de la feature 48, no
  solo la que cambia.
- (añadido) Una fila nueva, y las que ya existieran, quedan sin revisar, sin nota
  y sin fecha.

## Qué NO se tocó / quedó fuera

- No se puede crear un movimiento a mano a partir de la fila: lo descartaste tú
  el 2026-10-02.
- La fila no se borra nunca, ni al revisarla ni después.
- La importación no cambia: mismos contadores y el archivo se sigue moviendo a
  `procesados/`. `src/modules/import/import.service.ts` no está en el cambio.
- Revisar un descuadre de saldo no cambia.
- No hay pantalla: el frontend va en otra sesión. Hoy no llama a esta consulta.

## Notas para el futuro

- **La migración ya está aplicada en tu base** `gastos` (puerto 5434): la aplicó
  el implementer con `pnpm exec prisma migrate deploy`, porque sin la columna no
  arrancaba ningún test. Comprobado por el reviewer con consultas de solo
  lectura: figura aplicada, no hay ninguna pendiente ni fallida, y la tabla tiene
  0 filas.
- Las filas revisadas no salen nunca de la consulta, que sigue sin paginar: esa
  lista solo crece.
- La función que sirve la consulta se sigue llamando `listPendingImportWarnings`
  aunque ya devuelve también filas revisadas.
- Diferencia entre tu base y el esquema, anterior a esta feature: `prisma migrate
  diff` devuelve una línea sobre `Movement.descriptionSearch` (quitar un valor
  por defecto). No es de la feature 54; nadie ha comprobado de qué migración
  viene.
- `docs/api-contract.md:2062`, dentro de la nota fechada de la feature 48, sigue
  diciendo «estas dos rutas»; la nota de la feature 54, justo debajo, nombra la
  tercera.
