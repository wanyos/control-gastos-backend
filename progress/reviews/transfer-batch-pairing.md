# Review — feature 41 `transfer-batch-pairing`

Fecha: 2026-09-03. Revisor: agente reviewer.

## Veredicto

**APPROVED**

## Qué se ejecutó y qué salió

Ninguna afirmación de esta review sale de una lectura sin ejecutar; los dos
comandos se lanzaron durante la revisión:

1. `./init.sh` completo (2026-09-03, 21:49):

   ```
   [OK]    Type check OK (tsc sin errores)
   [OK]    Lint OK / Formato OK
   Test Files  54 passed (54)
        Tests  1068 passed (1068)
   [OK]    Todos los tests pasan
   [OK]    Entorno listo. Puedes empezar a trabajar.
   ```

2. `npx vitest run src/modules/transfers/transfers.service.test.ts --reporter=verbose`
   — **22 passed (22)**: los 14 de la F40 (7 puros + 7 de base de datos) y los 8
   nuevos de la F41, cada uno visto pasar por su nombre. La review de la F40
   (`reviews/transfer-detection.md`) registró 14 tests en este archivo y 1060 en
   la suite; ahora hay 22 y 1068 — los 8 nuevos cuadran exactamente con lo que
   declara el implementer.

## Comprobaciones específicas pedidas

1. **Cero cambios de esquema / migraciones / archivos nuevos de producción** —
   `git diff --stat -- prisma/schema.prisma` vacío; el último directorio de
   migraciones sigue siendo `20260825183936_balance_anchor/`; en `prisma/` solo
   está el `?? prisma/seed-categories.ts` de la F37. Todo el cambio de producción
   de la F41 vive en los dos archivos existentes del módulo de traspasos
   (`transfers.types.ts`, `transfers.service.ts`). ✅
2. **Los 3 casos reales y el dudoso, con datos inventados** — los cuatro fixtures
   reproducen la estructura, no los datos: cuentas `accountId` 1/2/3 con alias
   sintéticos, fechas de 2031, descripciones `SYNTHETIC…`.
   - 3 salidas + 3 entradas de 1000 el mismo día → 3 pares en orden
     (`transfers.service.test.ts:157`).
   - Cruce de 1000 hacia dos bancos (2 salidas de una cuenta, 1 entrada en cada
     una de otras dos) → 2 pares (`transfers.service.test.ts:215`).
   - 2×3000 en días consecutivos → d1↔d1, d2↔d2 (`transfers.service.test.ts:259`).
   - 2 salidas de 500 y 1 entrada → 0 pares, grupo entero en `ambiguous`
     (`transfers.service.test.ts:296`).
   El guardián `src/no-real-data.test.ts` sigue en la suite y pasó. ✅
3. **Orden fecha → daySequence (null=0) → id** — `byPairingOrder`
   (`transfers.service.ts:43-49`) hace exactamente esa cascada; verificado en
   ejecución por el test de empates (`transfers.service.test.ts:363`), donde el
   movimiento con `daySequence: null` y el id MÁS ALTO se empareja antes que el
   de `daySequence: 1` con id más bajo, y dos null se desempatan por id. ✅
4. **Grupo igualado pero con combinación fuera de ventana → dudoso entero** —
   test del encadenado d1/d4 vs d3/d7 (`transfers.service.test.ts:326`): 0 pares
   y los 4 movimientos juntos en un solo grupo de `ambiguous`. En el código, la
   condición exige `every × every` (`transfers.service.ts:136-142`). ✅
5. **F40 intacta e idempotencia** — los 14 tests de la F40 pasan con sus
   expectativas de siempre (los únicos toques al archivo de test son de forma:
   `daySequence` en el builder y en las filas de los clientes falsos, exigidos
   por el tipo; ningún `expect` preexistente cambió). La idempotencia y las
   parejas pre-escritas se prueban además en el test nuevo de integración
   (`transfers.service.test.ts:593`): pareja sembrada con
   `transferId: 'synthetic-pre-existing-transfer'` queda intacta, segunda pasada
   → 0 pares y filas byte a byte iguales. ✅
6. **Vocabulario** — `grep -i "lote igualado"` en todo el repo: aparece SOLO en
   `feature_list.json` (palabras dictadas por el humano en su propio intent), en
   `specs/41-transfer-batch-pairing/decisions.md:22` (la propuesta, marcada como
   tal) y en `progress/current.md:35` (la nota de que NO fue aprobada). Cero
   apariciones en código de producción, en `docs/` y en el informe del
   implementer: en todos ellos el concepto se describe literalmente. ✅

## Checklist recorrida

- **Acceptance ↔ tests**: los 6 criterios cubiertos (el segundo —«se separa por
  pareja de cuentas»— se resolvió con la condición «toda combinación válida» en
  vez de una separación literal; no es una desviación silenciosa: es la decisión
  🔴 2 de `decisions.md`, aprobada por el humano el 2026-09-03, y design §4
  explica por qué la separación literal dejaría el punto 2 sin resolver).
- **Trazabilidad R1–R10**: cada requirement con test ejecutado en la pasada
  (R10 es prosa: verificado leyendo los diffs de `docs/api-contract.md` —nota de
  traspasos y fila `ambiguous`— y `docs/data-model.md` —tabla de columnas y
  §Traspasos—, que dejan de decir «solo parejas inequívocas» y describen la
  regla nueva literalmente).
- **Arquitectura y convenciones**: sin archivos nuevos, sin dependencias nuevas,
  sin `console.log`, comentarios en el estilo de la casa; `architecture.test.ts`
  no necesitaba cambio para la F41 y no lo tiene.
- **CHECKPOINTS**: C1–C5 ✅; C6 ✅ (`docs/api-contract.md` actualizado — es el
  contrato que lee el frontend); C7 ✅ (4 archivos de spec, `decisions.md` de una
  página con 4 puntos 🔴 ≤ 6 y alternativa cada uno, 10 requirements ≤ 15, EARS,
  procedencia completa con cada R clasificado, T1–T6 en `[x]`); C8 ✅ (resumen
  escrito, ver abajo).

## Hallazgos

Ninguno bloqueante ni mayor.

- **Menor (no bloquea, ya anotado por el implementer):** el test
  `writes each pair of a resolved group … (F41 R8)` vive en el `describe` de
  «database» pero usa un cliente falso; y el encabezado del archivo sigue
  diciendo solo «Feature 40». Retoques cosméticos si algún día molestan.

Resumen de cierre: `progress/summaries/transfer-batch-pairing.md`.
