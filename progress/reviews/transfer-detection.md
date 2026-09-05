# Review — feature 40 `transfer-detection`

Fecha: 2026-09-03. Revisor: agente reviewer.

## Veredicto

**APPROVED**

## Qué se ejecutó y qué salió

Ninguna afirmación de esta review sale de una lectura sin ejecutar; los tres
comandos se lanzaron durante la revisión, en este orden:

1. `./init.sh` completo (2026-09-03, 13:26):

   ```
   Test Files  54 passed (54)
        Tests  1060 passed (1060)
   [OK]    Type check OK (tsc sin errores)
   [OK]    Lint OK / Formato OK
   [OK]    Todos los tests pasan
   [OK]    Entorno listo. Puedes empezar a trabajar.
   ```

2. `npx vitest run src/modules/transfers/transfers.service.test.ts` — el módulo
   nuevo aislado: **14 passed (14)**.

3. `npx vitest run -t "feature 40" import.routes.test.ts import.local.routes.test.ts movements.test.ts --reporter=verbose`
   — los 5 tests de punta a punta por HTTP, cada uno visto pasar por su nombre:
   R1 (Drive), R1+R8 (local, con reimportación), R5+R6 (ambiguo por HTTP),
   R15 (fallo dentro del 200) y R12 (detección → totales). **5 passed, 88 skipped.**

## Comprobaciones específicas pedidas

1. **Cero cambios en Prisma** — `git status --short prisma/` solo muestra
   `?? prisma/seed-categories.ts` (pertenece a la F37, no a esta feature);
   `prisma/schema.prisma` sin modificar y el último directorio de migraciones
   sigue siendo `20260825183936_balance_anchor/`. ✅
2. **Solo se escribe `transferId`** — el único write del módulo es el
   `updateMany` de `transfers.service.ts:181-184` con `data: { transferId }`.
   El test `changes nothing but transferId (and updatedAt) on any row, and no
   account (R10)` (`transfers.service.test.ts:292-337`) compara la fila entera
   con `toEqual` quitando solo `transferId` y `updatedAt` (`@updatedAt` de
   Prisma, dicho en design §6) y las cuentas enteras con ancla incluida.
   Ejecutado en la pasada 2. ✅
3. **Idempotencia** — `leaves exactly the same pairs on a second run (R8)`
   (fila a fila con `toEqual` tras la segunda ejecución) + la reimportación por
   HTTP del test R1/R8 de `import.local.routes.test.ts:213`. Ejecutados. ✅
4. **Ambiguo no se empareja y sale en el informe** — unitarios de R5/R6 en
   `transfers.service.test.ts:77-147` y por HTTP en
   `import.local.routes.test.ts:262` (`pairsCreated: 0`, grupo con sus 3
   movimientos y sus datos). Ejecutados. ✅
5. **Dos piernas en transacción** — `prisma.$transaction` con
   `WHERE transferId: null` y `PairRacedError` si `count !== 2`
   (`transfers.service.ts:180-186`); test `skips a pair whole when the
   transaction finds fewer than two free legs (R11)` con fake que devuelve
   `count: 1`: una sola llamada, nada contado, sin error reportado. ✅
6. **Un fallo de la detección no revierte la importación** —
   `import.local.routes.test.ts:301`: proxy sobre el cliente real que revienta
   solo la lectura de la detección; 200, `importedCount: 2`, archivo
   `imported`, fallo saneado en `transfers.error`. La llamada está DESPUÉS del
   bucle de archivos en las dos vías (`import.service.ts:432`,
   `import.local.service.ts:126`) y `detectTransfers` nunca lanza. ✅
7. **Vocabulario** — los diffs de `docs/api-contract.md` y `docs/data-model.md`
   usan «detección de traspasos», «las dos piernas» (ya en data-model §Traspasos
   antes de esta feature) y descripciones literales; ningún término nuevo fuera
   de `docs/vocabulario.md`. ✅

## Checklist restante

- **Trazabilidad R1–R15** — cada R con test concreto visto pasar en las pasadas
  de arriba (mapa completo en `progress/implementations/transfer-detection.md`
  §Trazabilidad, verificado nombre a nombre contra los archivos de test).
  R13/R14 son documentación: verificados leyendo los diffs (campo `transfers`
  documentado con tabla en las dos rutas; `transferId` tachado de la tabla de
  columnas sin escritor y §Traspasos reescrito — ya no dice que quién lo
  rellena es una feature posterior).
- **Spec (C7)** — 4 archivos presentes; `decisions.md` en una página con 4
  puntos 🔴 (≤6), cada uno con alternativa; 15 requirements (dentro del tope);
  EARS estricto; procedencia completa (todos los R clasificados
  humano/delegado/añadido); las 12 tasks `[x]`.
- **Arquitectura y convenciones** — módulo nuevo `src/modules/transfers/` con
  el patrón de módulos existente, sin routes (a propósito, R1); los 3 archivos
  añadidos a la lista cerrada de `src/architecture.test.ts`; sin `console.log`
  ni TODOs; datos de test sintéticos (`syntheticIban`, importes inventados).
- **Desviaciones del implementer** — las 3 revisadas y aceptadas:
  (1) `import.schema.ts` sin esquema de respuesta: correcto — no existe ninguno
  en las rutas del importador, así que no hay recorte posible, y los tests HTTP
  prueban que `transfers` viaja entero; queda el comentario que lo deja dicho.
  (2) `import.service.test.ts` con el campo `transfers` esperado en el `toEqual`
  del run vacío: consecuencia inevitable del campo nuevo. (3) comentario de
  `computeTotals` actualizado: solo comentario, obligado porque la feature lo
  volvía falso.

## Hallazgos

| # | Severidad | Hallazgo |
|---|---|---|
| — | — | Ninguno. Sin hallazgos bloqueantes ni menores. |

Nota (no hallazgo): el punto 3 del `como_se_que_esta_bien` menciona también «el
resumen de la feature 38», que aún no existe; el spec lo acotó explícitamente a
los totales de la F36 (R12) y decisions.md §Consecuencias lo deja dicho («y el
resumen de la F38 cuando exista»). Aprobado por el humano en la puerta.

### Comprobado sin hallazgos

acceptance/R1–R15 ↔ tests (ejecutados), arquitectura, convenciones,
`./init.sh` verde, CHECKPOINTS C1–C5, C6 (contrato actualizado para el
frontend), C7 (spec completo) y C8 (resumen escrito).

Resumen de cierre: `progress/summaries/transfer-detection.md`.
