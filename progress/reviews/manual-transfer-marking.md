# Review — F44 `manual-transfer-marking`

**Veredicto:** APPROVED
**Fecha:** 2026-09-06
**Revisado contra:** `specs/44-manual-transfer-marking/` (los 4 archivos), los
`acceptance` de la feature 44 en `feature_list.json`, el informe del implementer
(`progress/implementations/manual-transfer-marking.md`, incluida su sección
§Interrupción), `CHECKPOINTS.md`, `docs/api-contract.md` y `docs/data-model.md`.
Revisión con lupa extra por la interrupción del 2026-09-05: se buscaron restos a
medias, tasks marcadas sin estar hechas e incoherencias entre lotes. No se
encontró ninguno.

## Ejecuciones (hechas por el reviewer, no heredadas del informe)

**`./init.sh` completo, 2026-09-06, exit code 0:**

```
 Test Files  57 passed (57)
      Tests  1125 passed (1125)
   Duration  10.47s
[OK]    Todos los tests pasan
[OK]    Entorno listo. Puedes empezar a trabajar.
```

(Antes: tsc sin errores, oxlint OK, prettier OK.)

**`pnpm prisma migrate status`:**

```
6 migrations found in prisma/migrations
Database schema is up to date!
```

**`git diff src/modules/transfers/transfers.service.test.ts`:** cero líneas
`it(` eliminadas (las suites F40/F41 están intactas) y 18 `it(` añadidos
(4 puros del veto + 14 con base de datos), que con los 9 HTTP de
`transfers.routes.test.ts` suman los 27 tests nuevos que declara el informe.

## Los 8 puntos pedidos, uno a uno

1. **Migración** — `prisma/migrations/20260905163246_movement_undone_transfer_id/migration.sql`
   contiene exactamente una sentencia: `ALTER TABLE "Movement" ADD COLUMN "undoneTransferId" TEXT;`
   (nullable, sin backfill, sin índice — lo que manda el design §2).
   `prisma migrate status` la da por aplicada y el schema al día. El bloque del
   schema (`prisma/schema.prisma:128-132`) coincide letra a letra con el design
   (una raya rara en un grep intermedio resultó ser artefacto de la
   herramienta; el archivo real dice `//` en las cuatro líneas de comentario).
2. **`POST /api/transfers`** — `linkTransfer`
   (`src/modules/transfers/transfers.service.ts:290`) valida en el orden del
   design (R6→R5→R3→R4→R2), **sin** ventana de fechas (test de 60 días,
   `transfers.service.test.ts:992`), UUID del servidor
   (`randomUUID()`, línea 335), transacción con guarda de carrera
   (`WHERE transferId: null`, `count !== 2` → `ConflictError`, líneas 336-346),
   y errores 400/404/409 con los códigos ya existentes de
   `src/errors/app-error.ts` — ninguno nuevo. Todos con test (S y H).
3. **`DELETE /api/transfers/:transferId`** — `unlinkTransfer`
   (`transfers.service.ts:373`): un solo `updateMany` que pone
   `transferId = null` y `undoneTransferId = <valor perdido>` en las dos
   piernas a la vez; `count === 0` → 404. La columna NO sale en
   `GET /api/movements`: verificado por test explícito
   (`transfers.routes.test.ts:252`, `expect(listed).not.toHaveProperty('undoneTransferId')`)
   y también en la respuesta 201 del POST (`transfers.routes.test.ts:95`).
4. **El veto en la detección** — `isUndonePair` (`transfers.service.ts:44`)
   exige el MISMO valor no nulo en ambos (veto de pareja, no de movimiento);
   entra como condición de arista (línea 116) y de resolubilidad del lote
   igualado (línea 168). Tests puros: pareja vetada no se rejunta ni se
   reporta (`transfers.service.test.ts:870`), el deshecho se empareja con un
   tercero (`:881`), memorias distintas NO vetan (`:893`), y el grupo par con
   una combinación deshecha queda dudoso ENTERO (`:903`). Test con base de
   datos del ciclo completo detección→deshecho→re-pasada→tercero (`:1213`).
5. **Solo enlace y memoria** — tests de fila entera antes/después: al enlazar
   solo cambian `transferId` y `updatedAt` (`transfers.service.test.ts:1133`),
   al deshacer solo `transferId`, `undoneTransferId` y `updatedAt` (`:1182`);
   ambos comprueban además que no se creó ni borró ninguna fila.
6. **Suites F40/F41 intactas** — el diff no borra ni modifica ningún test
   existente (solo añade `undoneTransferId: null` al fixture `candidate`, que
   es el estado sin deshechos); las 1125 en verde las incluyen.
7. **Vocabulario** — ningún término nuevo: «lote igualado» está aprobado en
   `docs/vocabulario.md`; la columna se describe en los docs como «la memoria
   del enlace deshecho», descripción literal, igual que en el `decisions.md`
   que el humano aprobó.
8. **La nota reescrita de `progress/current.md`** (líneas 68-74) — conserva el
   hecho completo (agosto cuadra número a número, la ganancia es la suma de
   fluctuación e intereses, las variaciones coinciden una a una, commit
   3b2ed3b) y explica por qué no lleva cifras. No se perdió información
   necesaria y `src/no-real-data.test.ts` pasa.

## Sección §Interrupción, contrastada

Lo que el segundo implementer dice haber encontrado y terminado cuadra con el
árbol: `git status` muestra exactamente los archivos de los tres lotes (ni uno
más), las 11 tasks de `tasks.md` están `[x]` y todas verificadas aquí contra el
código real, los dos bloques de docs que declara haber terminado
(«Traspasos entre cuentas propias» de `api-contract.md:253-273` y todo
`data-model.md` §Traspasos + columnas reservadas) existen y son coherentes con
el resto, y prettier pasa. Sin restos a medias.

## Acceptance de `feature_list.json` → dónde se verifica

1. Enlazar compatibles y quedar fuera de totales → `transfers.routes.test.ts:75` y `:208` (R1, R14).
2. Enlace incompatible rechazado con error claro → `transfers.service.test.ts:1018-1071` (R2, R3, R4).
3. Deshacer y que la pasada no la rehaga → `transfers.service.test.ts:1213` (R9, R11).
4. Solo enlace y memoria, ningún otro campo → `transfers.service.test.ts:1133` y `:1182` (R13).
5. F40/F41 igual sobre lo no tocado → suites previas sin cambios, en verde (R12).
6. Docs actualizados → `docs/api-contract.md:642-702` y `docs/data-model.md:375-394` + columna en ER y schema copiado.

## CHECKPOINTS

- C1-C5: `./init.sh` exit 0; una sola `in_progress`; `progress/current.md`
  describe la sesión activa; sin dependencias nuevas; sin logs de debug ni
  TODOs; sin archivos sin trackear sospechosos (todos los del `git status`
  pertenecen a la feature o al spec).
- C4 bis: no aplica (no hay parser nuevo ni lectura de fichero del humano);
  la única acción real pendiente es del humano (resolver el caso vivo con el
  endpoint nuevo, anotado en decisions.md §Consecuencias).
- C6: `docs/api-contract.md` (el contrato con el frontend) actualizado con los
  dos endpoints.
- C7: carpeta con los 4 archivos; `decisions.md` en una página con 5 puntos 🔴
  (≤ 6), cada uno con alternativa; 14 requirements (≤ 15) en EARS con sección
  de procedencia y los 14 clasificados; las 11 tasks `[x]`; cada R1-R14 con al
  menos un test concreto (tabla del informe del implementer, verificada aquí
  test a test contra los archivos).
- C8: `progress/summaries/manual-transfer-marking.md` escrito por este review.

## Hallazgos

Ninguno. Sin severidades que repartir: no se encontró nada que corregir.
