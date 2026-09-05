# money-overview (F38) — implementación

> Implementer, 2026-09-05. Feature sin spec (`sdd: false`): la fuente de verdad
> es el intent y los acceptance de la entrada `id: 38` de `feature_list.json`.

## Qué hay ahora que antes no

`GET /api/overview`: una sola consulta de solo lectura que devuelve el total de
dinero, el desglose por cuenta con el saldo real de cada una, y las entradas,
salidas y ahorro (entradas menos salidas) del mes pedido — o del mes en curso si
no se pide ninguno.

## Archivos modificados / creados

| Archivo | Qué |
|---|---|
| [src/modules/overview/overview.routes.ts](../../src/modules/overview/overview.routes.ts) | **Nuevo.** Capa HTTP: solo `GET /`, sin referencia a datos (patrón `overviewDb`). |
| [src/modules/overview/overview.service.ts](../../src/modules/overview/overview.service.ts) | **Nuevo.** `getOverview` + `monthRange` + `currentMonth`. No calcula nada propio (ver decisiones). |
| [src/modules/overview/overview.schema.ts](../../src/modules/overview/overview.schema.ts) | **Nuevo.** Querystring: `month` opcional con patrón `^\d{4}-(0[1-9]|1[0-2])$`. |
| [src/modules/overview/overview.types.ts](../../src/modules/overview/overview.types.ts) | **Nuevo.** Tipos de la respuesta; reusa `SerializedMovementTotals` de movements. |
| [src/modules/overview/overview.test.ts](../../src/modules/overview/overview.test.ts) | **Nuevo.** 12 tests (4 unitarios de `monthRange`, 8 de integración con `buildApp()` + `app.inject()`). |
| [src/app.ts](../../src/app.ts) | Registro del módulo con prefijo `/api/overview` (2 líneas). |
| [src/architecture.test.ts](../../src/architecture.test.ts) | Los 5 archivos nuevos en el árbol esperado, y `overview.routes.ts` añadido al guardián de rutas sin acceso a datos. |
| [docs/api-contract.md](../../docs/api-contract.md) | Sección nueva `GET /api/overview` (entre `PATCH /api/movements/:id` e Ingesta). |
| [progress/current.md](../current.md) | Plan y estado de la sesión. |

Sin cambios en `prisma/schema.prisma`, sin migraciones, sin dependencias nuevas.

## Decisiones tomadas (lo delegado en el intent)

1. **Endpoint nuevo, no colgado de uno existente:** `GET /api/overview`, en su
   propio módulo `src/modules/overview/`. No encaja en `accounts` (cruza cuentas
   y movimientos) ni en `movements` (no lista movimientos). El nombre viene del
   `name` de la feature (`money-overview`); la vista de inversiones (F39)
   decidirá su propia ruta.
2. **El periodo se pide con `?month=YYYY-MM`:** el intent habla siempre de meses
   («puedo pedir el mes que quiera»), así que el parámetro es un mes, no un par
   `from`/`to` libre. Sin él, el mes en curso en UTC (el mismo reloj de
   `bookingDate`). La respuesta devuelve el mes resuelto y sus fechas
   (`period.month`, `period.from`, `period.to`) para que quien llama sepa qué
   periodo se usó. Un mes mal formado es `400 VALIDATION_ERROR`, nunca un
   fallback silencioso.
3. **Reutilización, no segunda suma:**
   - Saldos: `listAccounts` de `accounts.service.ts` (la fórmula del ancla de la
     F31). `totalBalance` = suma de esos saldos. Hay un test que compara número
     a número contra `GET /api/accounts` en la misma pasada.
   - Totales del mes: `computeTotals` + `serializeTotals` de
     `movements.service.ts` (F36). `net` = ahorro.
4. **Aviso del roadmap (cabo 8) comprobado, no hizo falta tocar nada:** la
   exclusión de `productId != null` **ya existe** en `computeTotals`
   ([movements.service.ts:335](../../src/modules/movements/movements.service.ts#L335),
   junto a la de `transferId`) desde la F36. Lo comprobé leyendo la función y
   ejecutando su test de exclusión más el nuevo de esta feature; no se añadió
   ninguna copia.
5. **Los saldos no dependen del mes pedido:** el desglose por cuenta y el total
   son «cuánto dinero hay hoy»; solo `period.totals` cambia con `month`. Está
   dicho así en el contrato.

## Mapeo acceptance → test

Todos en [src/modules/overview/overview.test.ts](../../src/modules/overview/overview.test.ts), salvo donde se indica.

| Acceptance | Test(s) |
|---|---|
| Total de dinero y desglose por cuenta usando el saldo real de la F31 | `returns the total and the per-account breakdown with the SAME balance as GET /api/accounts` (cuenta anclada + cuenta sin ancla; compara contra `GET /api/accounts`) |
| Entradas, salidas y ahorro del periodo, reutilizando el cálculo de la F36 | `returns income, expense and net (income − expense) of the month asked for` (incluye extremos del mes y exclusión de otro mes). La reutilización es por código (import de `computeTotals`/`serializeTotals`, sin suma propia en el módulo) |
| El periodo es un parámetro; sin él, el mes en curso | `returns income… of the month asked for` (con `?month=`) y `defaults to the current month when no month is sent`; el mes mal formado: `rejects a malformed month with 400 VALIDATION_ERROR instead of guessing one` |
| Periodo sin movimientos → ceros y 200, nunca error | `answers a month with no movements with zeros and 200, never an error` |
| `transferId != null` o `productId != null` fuera de entradas y salidas, con test | `leaves transfer legs, product contributions and neutrals out of the period totals` (pareja de traspaso, aportación a producto real y `neutral`, junto a un gasto que sí cuenta) |
| Solo lectura (del `que_no_quiero`) | `exposes no write surface: only GET exists under /api/overview` (`app.hasRoute`) |
| docs/api-contract.md actualizado | Sección `GET /api/overview` añadida (no hay test de docs; verificado a mano en el diff) |

Además: 4 tests unitarios de `monthRange` (mes de 31 días, febrero bisiesto y
común, diciembre) y `ignores an unknown querystring parameter, same as GET
/api/movements`.

## Último ./init.sh

Ejecutado completo el 2026-09-05, después de todos los cambios:

```
Test Files  55 passed (55)
     Tests  1080 passed (1080)
[OK]    Todos los tests pasan
[OK]    Entorno listo. Puedes empezar a trabajar.
```

(Incluye typecheck, lint `oxlint` y `prettier --check` en verde; la suite corre
contra las bases desechables `gastos_test_<n>`, ADR-027.)

## Sugerencias fuera de scope (NO aplicadas)

- El comentario de `prisma/schema.prisma` sobre `Movement.transferId` («Nothing
  writes it yet») quedó desactualizado desde la F40 (la detección de traspasos
  lo escribe). No se tocó: esta feature tiene prohibido cambiar el schema.
- `docs/roadmap.md`: si el cabo suelto 8 seguía figurando como abierto por la
  parte de `productId`, la evidencia de esta feature (la exclusión ya vive en
  `computeTotals` desde la F36) sirve para anotarlo; es edición del leader al
  cerrar.
