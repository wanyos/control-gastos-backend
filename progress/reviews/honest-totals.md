# Review — F49 `honest-totals` (lotes A, B y C)

> Reviewer, 2026-09-27. Revisado contra `specs/49-honest-totals/` (decisions,
> requirements R1–R16, design, tasks), `docs/` y `CHECKPOINTS.md`. Informes en
> `progress/implementations/honest-totals.md`.

**Veredicto:** CHANGES_REQUESTED

El código, los tests y el contrato de los endpoints casan: `./init.sh` verde y
nada que corregir en `src/`. Faltan dos cosas en la documentación: una frase del
`README.md` que esta feature ha vuelto falsa, y una línea del contrato sobre qué
pasa con un parámetro desconocido. Ya he comprobado ejecutándolo lo que esa
línea tiene que decir (ver abajo).

### Cambios requeridos

1. `README.md:76`: dice que `PATCH /api/movements/:id` «Cambia **solo** la
   categoría y/o el estado de revisión». Desde esta feature eso es falso: también
   escribe `excludedFromTotals` (lo prueba el test `marks and unmarks one
   movement with PATCH /api/movements/:id (R1)`, verde). Lo mismo en `README.md:75`
   (el `PATCH` en bloque). Además, `README.md:74` no menciona los filtros
   `transfer` y `excluded`, y en la tabla, después de `README.md:78`, faltan
   `GET /api/transfers` y `GET /api/transfers/ambiguous`. Los dos implementers lo
   anotaron como fuera de su cabecera: el leader tiene que asignarlo. Hay que
   corregir esas líneas y añadir las dos filas.
2. `docs/api-contract.md:998` y `docs/api-contract.md:1048`: «No tiene
   parámetros» no dice qué pasa si llega uno. El resto de los `GET` del contrato
   lo dicen («desconocido se ignora», p. ej. `docs/api-contract.md:1164`), y el
   frontend construye contra este archivo. Comprobado ejecutándolo (ver abajo):
   un parámetro desconocido **se ignora** y responde 200, **también `?page=2`**
   en `GET /api/transfers`, que devuelve todas las parejas. Hay que añadir esa
   frase en las dos secciones. En la de `GET /api/transfers`, que diga
   expresamente que `page`/`pageSize` no paginan.

### Lo que el leader pidió mirar expresamente

- **R3: el test prueba lo que dice.** Lo comprobé fuera del código, con un
  Fastify 5.12.5 con las mismas opciones por defecto que `src/app.ts:76`
  (sin configuración propia de AJV) y un body `{ excludedFromTotals: { type: 'boolean' } }`:
  `null -> 200 got false`, `"true" -> 200 got true`, `"false" -> 200 got false`,
  `1 -> 200 got true`, `0 -> 200 got false`. **Así que AJV sí los convierte por
  su cuenta**, y quien los rechaza es `assertStrictBoolean` en el `preValidation`
  (`src/modules/movements/movements.routes.ts:47`). El test
  (`movements.exclusion.test.ts`, `rejects %s as excludedFromTotals…`) siembra un
  movimiento marcado y otro sin marcar, exige 400 en las cuatro peticiones y
  vuelve a leer las filas. Sin el chequeo, cada uno de los cinco valores
  cambiaría una de las dos filas (`null`/`"false"`/`0` desmarcarían la marcada;
  `"true"`/`1` marcarían la otra), así que el test fallaría. No lo he comprobado
  quitando la llamada: eso sería editar el código. La conclusión sale de la
  prueba de AJV de arriba más la lectura del test.
- **Fila 19 de la tabla del lote C (fallo de base → 500).** Comprobado:
  `buildApp` apuntando a un Postgres inalcanzable (puerto 1), sin tocar ninguna
  base. Salida: `GET /api/transfers 500 {"statusCode":500,"code":"INTERNAL_SERVER_ERROR","message":"Internal server error"}`
  y lo mismo en `GET /api/transfers/ambiguous`. Coincide con el contrato.
- **Fila 20 (parámetro desconocido).** Comprobado contra `gastos_test_1`, con
  `assertTestDatabase` antes de conectar y solo con `GET`:
  `/api/transfers?x=1&page=2 -> 200 {"pairs":[]}`,
  `/api/transfers/ambiguous?x=1 -> 200 {"ambiguousCount":0,"ambiguous":[]}`.
  Se ignora (cambio requerido 2).
- **Migración.** No la he aplicado y no he escrito en `gastos`. El SQL
  (`ADD COLUMN "excludedFromTotals" BOOLEAN NOT NULL DEFAULT false`) coincide con
  `prisma/schema.prisma` y con `design.md` §1. No he comprobado su estado en la
  base real: haría falta `prisma migrate status`, que solo lee.
- **`movements.test.ts`**: solo `excludedFromTotals: false` en las 14 fixtures de
  `computeTotals`/`serializeTotals` y la clave nueva en la lista de forma de la
  F36 (R4). Nada de lo que comprueban ha cambiado.

### Comprobado sin hallazgos

- **`./init.sh` completo**, lanzado por mí en solitario: `EXIT=0`. Estado,
  arnés, `feature_list.json` (50 features), specs, tipos, lint y formato `[OK]`.
  `Test Files 73 passed (73)`, `Tests 1363 passed (1363)`.
- **Trazabilidad R1–R16 ↔ tests**, todos con un test concreto que comprueba la
  salida y la fila guardada, no solo el camino feliz. R1, R2 (incluido el 404
  todo o nada), R3, R4, R5, R7, R8, R10, R11 y R16 en
  `movements.exclusion.test.ts`. R6 y R8 en `overview.test.ts`. R4 (lo que toca
  a `POST`), R9, R12, R13 y R14 en `transfers.routes.test.ts`: R14 compara
  campo a campo con `detectTransfers`, y comprueba que no se escribe nada con el
  número de filas, `updatedAt` y una pareja resoluble que sigue sin enlazar. R15
  es la documentación, contrastada abajo.
- **`tasks.md`**: T1–T18 en `[x]`.
- **Spec (C7)**: `decisions.md` cabe en una página y tiene los bloques de la
  plantilla. El bloque 🔴 tiene 5 puntos, cada uno con su alternativa. Son 16
  requirements, y la razón está dicha en ⚙️ 5. La procedencia clasifica los 16.
  El texto de los requirements sigue EARS.
- **Arquitectura y convenciones**: capas ruta → servicio → Prisma respetadas.
  Errores con `ValidationError`, más el manejador central para el 500. El `where`
  de los filtros está dentro del `movementListWhere` que comparten la página, el
  `count` y los totales. `computeTotals` sigue siendo la única suma, y los dos
  `select` que la alimentan piden la columna nueva. `readTransferCandidates` es
  la lectura que antes estaba dentro de `detectTransfers`, movida sin cambiar
  nada. `computeAccountBalance`/`netOf` no se han tocado (R7). En lo añadido a
  `src/` no hay `console.*`, `TODO` ni `debugger`. Ninguna dependencia nueva.
- **Contrato ↔ código** (filas 1–19 de la tabla del lote C): coinciden. Leí
  todas las secciones que ha cambiado este diff contra el código y los tests.
  `"false"` y `0` también se rechazan (cubierto por el test). El contrato dice
  que los `totals` salen a `"0.00"` con `transfer=only` y con `excluded=only`, y
  los tests de R10 y R16 lo comprueban. `docs/data-model.md` es coherente con el
  esquema y con `computeTotals`.
- **C2**: F49 es la única `in_progress`. **C6**: el contrato está al día. El
  cambio no rompe nada (solo añade un campo y dos endpoints).
- **Vocabulario**: en los documentos nuevos no hay ningún término que no esté ya
  aprobado. «Traspasos dudosos» y «la marca» se usan como descripción, igual que
  en el intent y en la hoja de decisiones que aprobó el humano.

No escribo `progress/summaries/honest-totals.md` hasta que el veredicto sea
APPROVED.

---

## Review — segunda pasada (2026-09-27)

**Veredicto:** APPROVED
Comprobado: los dos cambios requeridos, acceptance/requirements ↔ tests,
arquitectura, convenciones, verificación y CHECKPOINTS C1-C8. Sin hallazgos.
Resumen de cierre: `progress/summaries/honest-totals.md`.

- Cambio 1: `README.md:74-76` ya describen los filtros `transfer`/`excluded` y la
  marca en los dos `PATCH`, y `README.md:79-80` añaden `GET /api/transfers` y
  `GET /api/transfers/ambiguous` (`git diff README.md`).
- Cambio 2: `docs/api-contract.md:998-1001` (se ignora; `page`/`pageSize` no
  paginan) y `docs/api-contract.md:1050-1051` (se ignora). Coincide con lo que
  comprobé ejecutándolo en la primera pasada. El código no ha cambiado desde
  entonces: en esta tanda solo cambiaron `README.md` y `docs/api-contract.md`.
- `./init.sh` completo, lanzado por mí: `EXIT=0`. Tipos, lint y formato `[OK]`.
  `Test Files 73 passed (73)`, `Tests 1363 passed (1363)`.
- **No marco la feature como `done`** en `feature_list.json`: según mi definición,
  como reviewer solo escribo este informe y el resumen. Lo hace el `implementer`
  tras la aprobación (`CLAUDE.md`).
