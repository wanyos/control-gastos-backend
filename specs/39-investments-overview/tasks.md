# Tasks — F39 `investments-overview`

> Un solo lote: todas las piezas tocan el módulo `investments` y `src/app.ts`,
> y la feature no llega al umbral donde el paralelismo compensa.

## Lote A — vista de solo lectura de las inversiones
Archivos: `src/modules/investments/investments.types.ts`,
`src/modules/investments/investments.schema.ts`,
`src/modules/investments/investments.service.ts`,
`src/modules/investments/investments.routes.ts`,
`src/modules/investments/investments.routes.test.ts`,
`src/app.ts`, `docs/api-contract.md`
Depende de: —

- [x] T1 — Tipos de la query y de la respuesta en `investments.types.ts`
      (`InvestmentsOverviewQuery`, `InvestmentsOverviewResponse`, las tres
      formas de producto por tipo, `PeriodGain` con su enum de motivos).
      Cubre: R1, R5, R7, R8.
- [x] T2 — `investments.schema.ts`: querystring con `month` (patrón de la F38),
      `productId` (entero ≥ 1), `type` (enum de 5), `additionalProperties:
      false`. Cubre: R12, R13, R14.
- [x] T3 — Lectura en `investments.service.ts`: `investmentsDb`,
      `getInvestmentsOverview` — selección de productos vigentes en el periodo
      (R9), foto del periodo y foto anterior por producto, serialización
      **verbatim** de todos los importes guardados (`toFixed(2)` los
      monetarios, `toString()` los porcentajes). Los escritores existentes no
      se tocan. Cubre: R1, R2, R3, R5, R6, R9, R10.
- [x] T4 — Cálculo de `change` y de `periodGain` con `Prisma.Decimal`,
      componentes a `null` cuando falta insumo y `excluded` con motivo.
      Cubre: R3, R4, R7, R8.
- [x] T5 — `investments.routes.ts` (solo `GET /overview`) + registro en
      `src/app.ts` bajo `/api/investments`; `productId` inexistente → 404
      `NOT_FOUND`. Cubre: R1, R11, R15.
- [x] T6 — Tests del camino feliz: producto que fluctúa con foto del periodo y
      anterior (importes exactamente los guardados, variación en euros y
      puntos), depósito con condiciones y sin `valuation`/`change`, cuenta
      remunerada con su `interest` sumando en su mes. Cubre: R2, R3, R5, R6,
      R8.
- [x] T7 — Tests de huecos: producto sin foto en el periodo (`null` +
      `excluded`, nunca la anterior en su lugar), primera foto de la serie
      (`no_previous_photo`), `gain` a `NULL` (`gain_not_reported`), periodo sin
      ninguna foto (200 y `"0.00"`), producto cerrado antes del periodo fuera
      de la lista. Cubre: R4, R7, R8, R9.
- [x] T8 — Tests de parámetros y errores: `productId` y `type` filtran y se
      combinan con `month`; `productId` inexistente → 404; `month`/`type`/
      `productId` mal formados → 400 `VALIDATION_ERROR`; mes por defecto = mes
      en curso. Cubre: R10, R11, R12, R13, R14.
- [x] T9 — Test de solo lectura y superficie intacta: la consulta no ejecuta
      escrituras (solo `find*`), no existen `POST`/`PATCH`/`DELETE` bajo
      `/api/investments`, y la suite existente de `GET /api/accounts` sigue en
      verde sin tocarla. Cubre: R15.
- [x] T10 — `docs/api-contract.md`: sección `GET /api/investments/overview`
      completa (parámetros, respuesta, errores, motivos de `excluded`) y
      actualización de la nota «Inversiones — se ESCRIBEN, todavía no se LEEN».
      Cubre: R1–R15 (documentación).
