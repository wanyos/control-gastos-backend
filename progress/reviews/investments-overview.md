# Review — feature 39 `investments-overview`

**Veredicto:** APPROVED (APROBADO)
Fecha: 2026-09-05 · Reviewer, contra el spec aprobado `specs/39-investments-overview/`
y los acceptance de la entrada 39 de `feature_list.json`.

## Comandos ejecutados y salida

1. `./init.sh` completo (lanzado por el reviewer, no citado del informe):

```
── 4. Type checking (tsc) ──   [OK] Type check OK (tsc sin errores)
── 5. Lint y formato ──        [OK] Lint OK · [OK] Formato OK
── 6. Ejecutando tests ──
 Test Files  56 passed (56)
      Tests  1098 passed (1098)
[OK]    Todos los tests pasan
── 7. Resumen ──               [OK] Entorno listo. Puedes empezar a trabajar.
[exited with code 0]
```

2. `npx vitest run src/modules/investments/investments.routes.test.ts --reporter=verbose`
   → **18/18 en verde, vistos pasar uno a uno por nombre** (los 18 títulos
   citados en la trazabilidad de abajo salieron con ✓; `1 passed (1)`,
   `Tests 18 passed (18)`).

3. `git diff HEAD --stat -- prisma/` → **vacío** (cero cambios de schema);
   última migración `20260825183936_balance_anchor` (anterior a la feature).

4. `git diff HEAD -- src/modules/investments/investments.service.ts` filtrado a
   líneas borradas → la única línea eliminada es el import de
   `ValidationError` (sustituido por `NotFoundError, ValidationError`). **Los
   escritores no se tocaron.**

5. Grep de `create|update|upsert|delete|Many|$executeRaw|$queryRaw` en
   `investments.routes.ts` y `investments.schema.ts` → **cero resultados**. En
   el service, todas las escrituras viven en los escritores preexistentes; la
   parte nueva (desde la línea 325) usa solo `findUnique`/`findMany`.

## Las 11 comprobaciones específicas pedidas

1. **Endpoint único y solo lectura** ✅ — `investments.routes.ts` registra solo
   `GET /overview`; `app.ts:89` lo cuelga de `/api/investments`. Test
   `exposes no write surface…` (visto pasar) verifica con `app.hasRoute` que no
   hay POST/PATCH/PUT/DELETE. Filtros del schema: solo `month`, `productId`,
   `type`, con `additionalProperties: false` (`investments.schema.ts:8-21`).
2. **Variación sobre gain/gainPercent, nunca marketValue** ✅ — leído en
   `investments.service.ts:455-462` (`periodPhoto.gain.minus(previousPhoto.gain)`,
   ídem `gainPercent`; `marketValue` no interviene). El test verbatim siembra un
   `gain` que a propósito NO es `marketValue − invested` (500.50 vs 500.75) y
   exige que vuelva intacto y que `change.amount` sea `120.50`, no la
   diferencia de marketValue (420.75).
3. **Hueco null + excluded con motivo, jamás cero silencioso** ✅ — tests
   `flags a product without a photo…`, `flags the first photo of a series…`,
   `nulls exactly the component whose gain is missing…`,
   `flags a savings account without a photo…` — los cuatro vistos pasar.
4. **Depósitos con condiciones y sin variación** ✅ — test
   `returns a deposit with its four conditions and WITHOUT valuation…`
   (además exige que los campos NO EXISTAN, no que sean null, y que el depósito
   jamás salga en `excluded`).
5. **Intereses de SavingsSnapshot en el mes de abono** ✅ — test
   `counts the interest of a savings account in the month its photo was paid…`
   (siembra una foto de otro mes con `99.99` y verifica que no se cuela:
   `interest: "8.40"`, `total: "128.90"`).
6. **Producto cerrado antes del mes no aparece** ✅ — test
   `leaves a product closed before the period out, and keeps one closed inside it`
   (y verifica que tampoco sale en `excluded`, y que al pedir un mes en que
   vivía, reaparece).
7. **marketValue y uninvestedCash separados, sin patrimonio total** ✅ — la
   respuesta no tiene ningún campo de patrimonio; `serializeValuation` los
   devuelve como dos campos. El contrato lo dice explícitamente («No hay
   patrimonio total»).
8. **Ningún importe recalculado ni redondeado** ✅ — `serializeValuation` /
   `serializeSavingsSnapshot` / `depositConditions` devuelven los Decimal
   guardados (`toFixed(2)` para `Decimal(10,2)` — la convención del contrato,
   no un redondeo: nunca recorta dígitos — y `toString()` para porcentajes).
   El test verbatim compara los diez importes campo a campo contra lo sembrado.
9. **Cero cambios en prisma/schema.prisma, cero migraciones** ✅ — comando 3.
10. **GET /api/accounts intacto** ✅ — su suite (`accounts.test.ts`) pasa entera
    dentro de los 56 archivos verdes de la pasada 1, y el test de superficie
    verifica que la ruta sigue registrada.
11. **Sin vocabulario nuevo no aprobado** ✅ — los docs tocados
    (`api-contract.md`, spec, informe) usan descripciones literales o palabras
    ya presentes antes de la feature («foto», que el contrato ya usaba para
    `SavingsSnapshot`/`Valuation` desde las F26/29). Ningún término corto nuevo
    acuñado. `docs/vocabulario.md` no necesitaba cambios y no se tocó.

## Las 2 desviaciones documentadas del implementer — juzgadas CORRECTAS

- **(a) `change.percentPoints` con `Decimal.toString()`** ✅ correcta. El design
  §5 fija la regla (porcentajes sin relleno de ceros) y su ejemplo §6 la
  contradecía (`"0.90"`). R2 y el bloque ✅ de decisions («ningún importe se
  recalcula ni se redondea») mandan sobre un ejemplo: un `toFixed(2)`
  redondearía diferencias de `Decimal(7,4)`. El contrato quedó coherente
  (`"0.9"` en el ejemplo + regla escrita «sin relleno de ceros»). Test:
  `percentPoints: '0.9'` visto pasar.
- **(b) `productId` existente pero cerrado antes del periodo → 200 con lista
  vacía, no 404** ✅ correcta. R11 acota el 404 a un id «que no corresponde a
  ningún InvestmentProduct»; R9 solo dice que el cerrado no se lista. El código
  comprueba existencia SIN el filtro de vigencia (`investments.service.ts:367-373`)
  y aplica la vigencia después — mismo criterio que movements (filtro válido
  con resultado vacío = 200). El design §4 decía 404, pero el design no puede
  ampliar un error que los requirements acotan.

## Trazabilidad R1–R15 → tests

Los 15 requirements tienen test concreto y **todos vistos pasar** en la pasada
verbose (comando 2). El mapeo del informe del implementer
(`progress/implementations/investments-overview.md` §Trazabilidad) se contrastó
test a test contra el archivo y contra la salida: es exacto. No se repite aquí.

## CHECKPOINTS

- **C1** ✅ arnés completo, `./init.sh` exit 0 (comando 1).
- **C2** ✅ una sola `in_progress` (la 39); `progress/current.md` describe la
  sesión activa.
- **C3** ✅ módulo en `src/modules/investments/` (crecimiento previsto por
  ADR-012); rutas sin acceso a datos (patrón `investmentsDb`); cero
  dependencias nuevas; sin logs de debug ni TODOs.
- **C4** ✅ 18 tests de integración nuevos, camino feliz + errores 400/404 +
  huecos + solo-lectura probado por ejecución (foto de las tres tablas antes y
  después del GET).
- **C4 bis** — no aplica: la feature no añade ni cambia ningún parser de
  fichero del humano; lee lo que las F26/29 ya guardaron.
- **C5** — pendiente del cierre por el leader (línea en `history.md`, marcar
  `done`); no es del implementer.
- **C6** ✅ el contrato ES `docs/api-contract.md` (sección nueva completa +
  nota de inversiones actualizada); el frontend lo consume como puntero, nada
  más que anotar.
- **C7** ✅ 4 archivos de spec; `decisions.md` en una página con 6 puntos 🔴,
  cada uno con alternativa; 15 requirements (en el tope, no lo pasa); EARS;
  procedencia con los 15 clasificados (humano/delegado/añadido); 10/10 tasks
  `[x]`; R↔test completo.
- **C8** ✅ `progress/summaries/investments-overview.md` escrito en esta review.

## Hallazgos

| # | Severidad | Hallazgo |
| --- | --- | --- |
| 1 | Baja (no bloquea) | El guardián `keeps the flow module routes free of data access` de `src/architecture.test.ts:224` no vigila `investments.routes.ts`. El archivo cumple la regla (comprobado por grep: no contiene `prisma`), y la lista se llama «flow module routes» — inversiones no es un módulo de flujo — pero convendría decidir si se amplía la lista o se crea la gemela de inversiones. Ya anotado por el implementer como fuera de scope; para el leader. |
| 2 | Baja (no bloquea) | El caso combinado de la desviación (b) — `?productId=` de un producto cerrado antes del periodo → 200 con `products: []` — no tiene test dedicado (las tres piezas sí: R9, R10 y R11 por separado). Ningún requirement lo exige; si se toca el módulo en el futuro, un test lo dejaría clavado. |

Ningún hallazgo bloqueante. Cambios requeridos: ninguno.
