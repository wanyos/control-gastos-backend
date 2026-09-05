# Review — feature 37 `categories-and-tagging`

Reviewer, 2026-09-02.

**Veredicto:** APPROVED

## Qué se ejecutó y qué salió

- `./init.sh` completo, lanzado por el reviewer el 2026-09-02 a las 22:15:
  ```
  Test Files  53 passed (53)
       Tests  1041 passed (1041)
  [OK]    Todos los tests pasan
  [OK]    Entorno listo. Puedes empezar a trabajar.
  [exited with code 0]
  ```
  (Type check, lint y formato también `[OK]`.) Los tests nuevos de la feature
  —«rename and delete category routes (feature 37)», «PATCH /api/movements/:id —
  category and status of a movement (feature 37)» y «seeding of the starting
  categories (feature 37)»— corren dentro de esa pasada.
- `git status --short` + `git log`: sin cambios en `prisma/schema.prisma` y sin
  carpetas nuevas en `prisma/migrations/` (la última es `20260825183936_balance_anchor`).
- `git diff docs/api-contract.md docs/data-model.md`: leído entero.
- **No** se ejecutó nada contra la base real del humano: la idempotencia de la
  siembra se verifica con `categories.seed.test.ts` (en la pasada verde) y con
  lo que el implementer dejó registrado de su re-ejecución (`created 0, skipped 16`).

## Comprobaciones específicas pedidas

1. **Sin cambios de esquema ni migraciones** — confirmado (git status/log arriba).
2. **Sin endpoints de crear/borrar movimientos** — `src/modules/movements/movements.routes.ts`
   solo registra `GET /` y `PATCH /:id`; el comentario de la ruta y la nota del
   contrato lo dejan escrito.
3. **Siembra idempotente** — `seedDefaultCategories` usa `createMany` +
   `skipDuplicates` sobre el índice único `(parentId, kind, name)` NULLS NOT
   DISTINCT de la F8; jamás actualiza ni borra. Tests: segunda pasada
   `{created: 0, skipped: 16}` con filas idénticas (mismo `id`, mismo `name`), y
   siembra parcial (`created: 15, skipped: 1` conservando el `id` existente).
4. **PATCH de movimientos solo admite `categoryId`/`status`** — esquema con
   `additionalProperties: false` + `minProperties: 1`, y como AJV corre con
   `removeAdditional`, el hook `preValidation`
   (`assertOnlyAllowedBodyProperties`, `src/lib/strict-body.ts`) convierte la
   propiedad extra en 400 en vez de descartarla en silencio; la lista admitida
   se deriva del propio esquema (`updateMovementBodyProperties`). Tests:
   `{amount}` y `{description}` → 400 con la fila intacta; body vacío → 400;
   mismo trato en el rename de categorías (`kind`/`parentId` → 400).
5. **Vocabulario** — contra `docs/vocabulario.md`: los docs tocados no
   introducen término corto nuevo; «siembra/sembrar» viene literal del
   acceptance del humano («queda sembrada de forma idempotente»), y «hecho
   bancario» / «campos de anotación» son descripciones, no nombres.

## Trazabilidad R1–R15

Verificada contra los tests reales (leídos, y ejecutados en la pasada de
`./init.sh` de arriba). Los 15 R tienen test concreto; el mapeo del informe del
implementer (`progress/implementations/categories-and-tagging.md` §Trazabilidad)
es exacto. Destacan: R15 con comparación campo a campo + `balance` de
`GET /api/accounts/:id` + `totals` de `GET /api/movements` antes y después; R6
con el recuento en el `message` (`1 movement(s)`); R13 con la lista de 16
verificada literal.

## Checklist SDD (C7)

- `specs/37-categories-and-tagging/` con los 4 archivos.
- `decisions.md` cabe en una página; bloque 🔴 de **4** puntos (≤6), cada uno
  con alternativa.
- 15 requirements (dentro del tope ~15), EARS, con sección de Procedencia y los
  15 clasificados (humano/delegado/añadido).
- `tasks.md`: T1–T17 todas `[x]`.

## Checkpoints C1–C6, C8

- C1: archivos del arnés presentes; `./init.sh` exit 0.
- C2: una sola `in_progress` (la 37); `progress/current.md` describe la sesión activa.
- C3: capas respetadas (las rutas no tocan Prisma directo, servicio recibe el
  cliente vía `movementsDb`/`categoriesDb`; el guardián `src/architecture.test.ts`
  pasa en la suite); el `console` del CLI de siembra es la misma excepción
  consciente que `src/server.ts` y está comentada; sin dependencias nuevas.
- C5: los archivos sin trackear son todos de la feature (spec, seed, tests,
  strict-body, informes).
- C6: `docs/api-contract.md` actualizado por esta feature (el frontend lo lee
  como puntero); los tres endpoints nuevos documentados con sus tablas de errores.
- C8: `progress/summaries/categories-and-tagging.md` escrito.

## Hallazgos

1. **[Aviso, no bloquea]** El implementer ejecutó por accidente la siembra
   contra la base real del humano (`created 16, skipped 0`) al probar el CLI:
   `dotenv/config` carga `.env` aunque se intente vaciar `DATABASE_URL` del
   entorno. Lo declaró, no lo revirtió (borrar filas de la base real sería
   peor) y verificó la idempotencia re-ejecutando (`created 0, skipped 16`).
   El resultado coincide exactamente con el deber que `decisions.md` §📌 le
   asignaba al humano, que queda hecho; re-ejecutarlo no hace nada. Queda aquí
   para que el humano lo sepa.
2. **[Fuera de scope, anotado por el implementer]** `POST /api/accounts` y
   `POST /api/categories` comparten el agujero de `removeAdditional` (propiedad
   extra descartada en silencio). Hoy no viola ningún requirement escrito; si
   se quiere el trato estricto, es reutilizar `assertOnlyAllowedBodyProperties`.

### Comprobado sin hallazgos

acceptance/R1–R15 ↔ tests, arquitectura, convenciones, contrato y modelo de
datos actualizados, vocabulario, CHECKPOINTS C1–C8, sin cambios de esquema, sin
endpoints de alta/borrado de movimientos.

Resumen de cierre: `progress/summaries/categories-and-tagging.md`.
