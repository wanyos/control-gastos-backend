# Review — feature 38 `money-overview`

Reviewer, 2026-09-05. Feature sin spec (`sdd: false`): se comparó contra el
intent y los acceptance de la entrada `id: 38` de `feature_list.json` y contra
el informe del implementer
([progress/implementations/money-overview.md](../implementations/money-overview.md)).

**Veredicto:** APPROVED

## Comandos ejecutados y resultado

1. `./init.sh` — completo, después de leer todo el código nuevo:

   ```
   [OK]    Type check OK (tsc sin errores)
   [OK]    Lint OK
   [OK]    Formato OK
    Test Files  55 passed (55)
         Tests  1080 passed (1080)
   [OK]    Todos los tests pasan
   [OK]    Entorno listo. Puedes empezar a trabajar.
   ```

2. `npx vitest run src/modules/overview/overview.test.ts --reporter=verbose` —
   **12/12 en verde**, cada test visto pasar con su nombre (los 4 unitarios de
   `monthRange` y los 8 de integración contra `buildApp()` + `app.inject()`).

3. `git status` / `git diff --stat` / `git diff --name-only -- prisma/` — cero
   cambios en `prisma/schema.prisma`, cero migraciones, cero archivos sin
   trackear sospechosos (solo el módulo nuevo y el informe del implementer).

4. `grep` de `create|update|delete|upsert|$executeRaw|$queryRaw` sobre los 4
   archivos fuente del módulo — **sin resultados**: solo `findMany` en el
   service. El test `exposes no write surface` (visto pasar) confirma por
   `app.hasRoute` que bajo `/api/overview` solo existe el `GET`.

## Comprobaciones específicas pedidas

1. **Saldos = F31, sin segunda fórmula.** `overview.service.ts:6` importa
   `listAccounts` de `accounts.service.ts`; el módulo no contiene ninguna
   fórmula de saldo propia (`totalBalance` es un `reduce` sobre los saldos que
   `listAccounts` ya devuelve). El test `returns the total and the per-account
   breakdown with the SAME balance as GET /api/accounts` compara número a
   número contra `GET /api/accounts` en la misma pasada, con cuenta anclada
   (movimiento anterior al ancla que NO mueve el saldo) y cuenta sin ancla.
   Visto pasar.
2. **Totales = F36, sin segunda suma.** `overview.service.ts:7` importa
   `computeTotals`/`serializeTotals` de `movements.service.ts`; no hay ninguna
   suma de income/expense en el módulo. La exclusión de `productId != null` ya
   vivía en `computeTotals` ([movements.service.ts:335](../../src/modules/movements/movements.service.ts#L335))
   desde la F36, como dice el implementer: leído en el código, no se añadió copia.
3. **Exclusión de `transferId`/`productId` con test.** `leaves transfer legs,
   product contributions and neutrals out of the period totals`: siembra las
   dos piernas de un traspaso, una aportación a un producto real y un
   `neutral` junto a un gasto que sí cuenta; espera exactamente
   `{ income: '0.00', expense: '60.00', net: '-60.00' }`. Visto pasar.
4. **Periodo sin movimientos → 200 con ceros.** `answers a month with no
   movements with zeros and 200, never an error` (además verifica que los
   saldos no dependen del mes). Visto pasar.
5. **Sin parámetro → mes en curso.** `defaults to the current month when no
   month is sent`. Visto pasar. El mes mal formado da `400 VALIDATION_ERROR`
   (test visto pasar), nunca un fallback silencioso.
6. **Solo lectura.** Ver comando 4 de arriba.
7. **Schema/migraciones intactos.** Ver comando 3 de arriba.
8. **Vocabulario.** Contrastados `docs/api-contract.md` (sección nueva), el
   informe del implementer y los comentarios del módulo contra
   `docs/vocabulario.md`: no aparece ningún término nuevo no aprobado; los
   mecanismos se describen literalmente («el ancla de la cuenta más los
   movimientos posteriores», «la misma suma que los totals de
   GET /api/movements»). «guardián» se usa en `architecture.test.ts` con su
   significado aprobado.

## Acceptance ↔ tests

Los 6 acceptance de la entrada 38 tienen cobertura vista pasar (mapeo del
implementer verificado test a test contra `overview.test.ts`); el sexto
(`docs/api-contract.md` actualizado) verificado leyendo el diff: sección
`GET /api/overview` completa, con parámetros, respuesta de ejemplo, errores y
la nota de solo-lectura, colocada antes de §Ingesta.

## Comprobado sin hallazgos

acceptance ↔ tests (6/6), reutilización F31 y F36 por lectura de código,
arquitectura (`architecture.test.ts` ampliado con los 5 archivos y el guardián
de rutas sin acceso a datos), convenciones (patrón `overviewDb`, errores por el
handler central), `docs/api-contract.md`, vocabulario, CHECKPOINTS C1-C5, C6
(el contrato es la frontera con el frontend y está actualizado), C8 (resumen
escrito). C7 no aplica (no SDD). C4 bis no aplica (no lee ficheros del humano).

## Hallazgos

Ninguno bloqueante. Dos notas informativas (severidad: info, ya anotadas por el
propio implementer en su informe, no requieren acción en esta feature):

- El comentario de `prisma/schema.prisma` sobre `Movement.transferId` quedó
  desactualizado desde la F40; corregirlo era tocar el schema, prohibido aquí.
- El cabo suelto 8 del roadmap puede anotarse como cerrado por la parte de
  `productId` (la exclusión vive en `computeTotals` desde la F36); edición del
  leader al cerrar.

Resumen de cierre: [progress/summaries/money-overview.md](../summaries/money-overview.md).
