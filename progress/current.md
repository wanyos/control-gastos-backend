# Sesión actual

> **Este archivo es un cuaderno de trabajo, no un archivo histórico.** Se llena
> mientras se trabaja —en tiempo real, no al final— y se **vacía al cerrar cada
> feature**, dejando solo esta plantilla. Lo que merece quedarse no se queda aquí:
>
> | Qué | Dónde vive de verdad |
> |---|---|
> | El resultado de una feature, en una línea | [`history.md`](history.md) |
> | El detalle de qué se hizo y por qué | `summaries/<feature>.md` |
> | El veredicto del reviewer | `reviews/<feature>.md` |
> | El mapeo criterio→test | `implementations/<feature>.md` |
> | Una pasada real o un diagnóstico | `explorations/<tema>-<fecha>.md` |
> | Un cabo suelto o una decisión pendiente | [`../docs/roadmap.md`](../docs/roadmap.md) |
>
> Si algo de aquí sigue vivo al cerrar, **se mueve** a su sitio; no se copia y no
> se deja «por si acaso». Se vació el **2026-08-21**, el **2026-08-26** y el
> **2026-09-01**. La última vez, el **2026-09-30**, con las F42 a F50 cerradas y
> commiteadas: todo estaba ya en [`history.md`](history.md), `summaries/`,
> `reviews/` e `implementations/`, y el único punto vivo —la prueba real de la
> F47— se movió a `docs/roadmap.md` §Deberes tuyos. El contenido anterior sigue en
> el histórico de git.

## Feature en curso

**Nivel de consumo:** medio _(bajo / medio / alto; en alto, qué fases usan `fable`)_


**Ninguna feature en curso.**

## F71 `myinvestor-investment-purchases` — CERRADA (2026-11-10, sin commit todavía)

**Qué se hizo:** un gasto de la cuenta de MyInvestor que es una compra de inversión (ETF, ETC, fondo, también uno que la app no ha visto nunca) no cuenta como gasto en los totales de movimientos, en Overview ni en Expenses by category, sin marcarlo a mano. Se decide al sumar, sin escribir en la base; cada movimiento de `GET /api/movements` trae `investmentPurchase` (`null`, `{ "certain": true }` o `{ "certain": false }`). SDD, lotes A y B; review 1 `CHANGES_REQUESTED`, review 2 `APPROVED` → [resumen](summaries/myinvestor-investment-purchases.md), [implementación](implementations/myinvestor-investment-purchases.md), [revisión](reviews/myinvestor-investment-purchases.md).
**Estado:** `done` en `feature_list.json`, línea en `history.md`, fila E7 de `docs/roadmap.md`. Sin commit. Sin migración. Pendiente fuera de este proyecto (anotado en `docs/roadmap.md` §E8): que una sesión del frontend lea el campo `investmentPurchase`.

## F70 `product-file-same-opening` — CERRADA (2026-11-10, sin commit todavía)

**Qué se hizo:** al importar un archivo de producto con un `name` nuevo, si ya hay otro producto del mismo banco, tipo y `openedAt` (vivo o cerrado, depósitos incluidos), el archivo sale fallido con `SAME_OPENING_PRODUCT`: no se guarda nada, no se mueve a `procesados/` y el mensaje nombra el producto con el que coincide. ADR-045. SDD, lote A (único); review 1 `CHANGES_REQUESTED`, review 2 `APPROVED` → [resumen](summaries/product-file-same-opening.md), [implementación](implementations/product-file-same-opening.md), [revisión](reviews/product-file-same-opening.md).
**Estado:** `done` en `feature_list.json`, línea en `history.md`, fila E5 de `docs/roadmap.md`. Sin commit. Sin migración. Pendiente fuera de este proyecto: que una sesión del frontend añada `SAME_OPENING_PRODUCT` a su `fileMessages.ts`.

## F69 `last-imports` — CERRADA (2026-11-08, sin commit todavía)

**Qué se hizo:** idea de mejora 1 del workspace. La importación guarda el instante en que importó cada cuenta y cada producto (`lastImportedAt`, dos migraciones: columna y relleno de lo ya importado), y `GET /api/last-imports` da, por cada cuenta y producto vivo, hasta qué fecha hay datos, qué día se importó, si se espera cada mes y los tramos sin datos. ADR-044. SDD, lotes A y B; reviewer `APPROVED` sin hallazgos → [resumen](summaries/last-imports.md), [implementación](implementations/last-imports.md), [revisión](reviews/last-imports.md).
**Estado:** `done` en `feature_list.json`, línea en `history.md`, fila E5 de `docs/roadmap.md`. Sin commit. Las dos migraciones **no** están aplicadas a la base `gastos`: es deber del humano, con copia antes (`docs/roadmap.md` §Deberes tuyos pendientes). Sección publicada en `docs/api-contract.md`: la sesión del frontend puede hacer su ventana emergente.

## F68 `movements-hide-not-counted` — CERRADA (2026-11-06, sin commit todavía)

**Qué se hizo:** encargo del frontend (su cabo 37 b). `GET /api/movements` acepta `hideNotCounted=true`: esconde lo marcado y lo emparejado salvo los movimientos de depósito que suman algo. Spec aprobado sin cambios; lote A; review 1 CHANGES_REQUESTED (fila del README y esta línea), review 2 `APPROVED` sin hallazgos → [resumen](summaries/movements-hide-not-counted.md), [implementación](implementations/movements-hide-not-counted.md), [revisión](reviews/movements-hide-not-counted.md). Pendiente: que la sesión del frontend cambie su casilla al parámetro nuevo.

## Mantenimiento 2026-11-04 / 06 — CERRADO (commit `60495c2`)

Todo aprobado por el reviewer y commiteado.

- Avisos de `pnpm audit` (cabo 27, cerrado): `brace-expansion`, `fast-uri` y `qs` subidos dentro de rango; `uuid` aceptado. Informe `implementations/audit-2026-11-04.md`, revisión `reviews/audit-2026-11-04.md`.
- Rojos intermitentes de `./init.sh`: `no-real-data.test.ts` más rápido, bloqueo contra dos ejecuciones de vitest a la vez, `afterAll` de backup a 60 s, `architecture.test.ts` lee `src/` una vez. `implementations/` y `reviews/` `init-intermitente.md` y `no-real-data-timeout.md`; diagnóstico en `explorations/init-intermitente-2026-11-04.md`.
- El build ya no mete tests en `dist/` (`tsconfig.build.json`, vitest excluye `dist/**`). `implementations/` y `reviews/` `build-without-tests.md`.
- Roadmap: cabo 27 cerrado, cabo 32 nuevo (lentitud de los tests de backup, aceptada), deber nuevo (probar una ingesta con `qs` 6.17.1).

## F67 `investments-gains` — CERRADA (2026-11-04, commiteada: commit `feat(investments): F67…`)

**Qué se hizo:** encargo del frontend para su feature 40. `GET /api/investments/gains`: por cada fondo, ETF, cartera y depósito, invertido, valor, ganancia en € y % desde que se abrió y fecha del dato; vivos y cerrados aparte; total solo de los vivos. Un depósito vivo reparte su ganancia esperada por días y uno cancelado cierra con 0. ADR-043. SDD, lote A (único); reviewer `CHANGES_REQUESTED` en la primera revisión (faltaban tests de motivos de R8 y tres arreglos de documentos) y `APPROVED` en la segunda → [resumen](summaries/investments-gains.md), [implementación](implementations/investments-gains.md), [revisión](reviews/investments-gains.md).
**Estado:** `done` en `feature_list.json`, línea en `history.md`, fila E7 de `docs/roadmap.md`. Sin commit. Sección publicada en `docs/api-contract.md`: el frontend puede relanzar el spec de su feature 40.

## Correcciones del humano

## F66 `import-statement-all-or-nothing` — CERRADA (2026-11-02, commit `8dde37d`)

**Qué se hizo:** cabo 26. Todo lo que un extracto escribe en la base (la cuenta si es nueva, sus movimientos, los saldos que rellena, el ancla y sus avisos) va en una transacción por archivo con 60 s como máximo; si algo falla no queda nada de ese archivo y el informe lo da sin cuenta y con todo a cero. Si lo único que falla es moverlo a `procesados/`, lo guardado se queda. ADR-042. SDD, lote A (único); reviewer `APPROVED` sin hallazgos → [resumen](summaries/import-statement-all-or-nothing.md), [implementación](implementations/import-statement-all-or-nothing.md), [revisión](reviews/import-statement-all-or-nothing.md).
**Estado:** `done` en `feature_list.json`, línea en `history.md`, cabo 26 cerrado. Sin commit. La prueba con datos reales es deber del humano, en `docs/roadmap.md` §Deberes tuyos pendientes.

## F65 `expenses-by-category-reject-year-zero` — CERRADA (2026-11-02, sin commit todavía)

**Qué se hizo:** cabo 30. `GET /api/expenses-by-category` solo acepta `year` y `month` con años desde el 2000 (decisión del humano el 2026-11-02, después de ver que `0001` y los meses con año por debajo de 1000 respondían 500); lo anterior, `0000` incluido, es `400 VALIDATION_ERROR` en el schema de la ruta y `resolvePeriods` no cambia. Flujo simple, reviewer `APPROVED` sin hallazgos → [resumen](summaries/expenses-by-category-reject-year-zero.md), [implementación](implementations/expenses-by-category-reject-year-zero.md), [revisión](reviews/expenses-by-category-reject-year-zero.md).
**Estado:** `done` en `feature_list.json`, línea en `history.md`, cabo 30 cerrado. Sin commit.

## Mantenimiento: dependencias al día y fuera `packageManager` — CERRADO (2026-10-28)

**Qué se hizo:** ver la línea del 2026-10-28 en `history.md`. Reviewer `CHANGES_REQUESTED` en la primera revisión (quedaban dos copias de `pg`, la del adaptador de Prisma en 8.23.0) y `APPROVED` en la segunda.
Commit `f599eb7`.

## F64 `retire-recurring-expenses` — CERRADA (2026-10-25, commit `731414c`)

**Qué se hizo:** cabo 29. `GET /api/recurring-expenses` responde 404; su módulo se borró, el contrato la lista en «Rutas retiradas» y ADR-037, 040 y 041 llevan una nota de la F64. Flujo simple, reviewer `APPROVED` sin hallazgos → [resumen](summaries/retire-recurring-expenses.md), [implementación](implementations/retire-recurring-expenses.md), [revisión](reviews/retire-recurring-expenses.md).
**Estado:** `done` en `feature_list.json`, línea en `history.md`, cabo 29 cerrado. Commit `731414c`.

## F63 `expenses-by-category` — CERRADA (2026-10-21, commit `977d01c`)

**Qué se hizo:** `GET /api/expenses-by-category` (mes o año natural, tres comparaciones, fijo y variable por la marca `isFixed` de cada categoría, movimientos de cada línea) y `isFixed` en `PATCH /api/categories/:id`. ADR-041. Lotes A, B y C hechos; reviewer `APPROVED` → [resumen](summaries/expenses-by-category.md), [implementación](implementations/expenses-by-category.md), [revisión](reviews/expenses-by-category.md).
**Estado:** `done` en `feature_list.json`, línea en `history.md`, fila E7 de `docs/roadmap.md`, cabo 29 (retirar `GET /api/recurring-expenses` cuando el frontend use la nueva) y cabo 30 (el año `0000`, sin dueño). Commit `977d01c`.

## F62 `own-accounts` — CERRADA (2026-10-20, commit `f905fdb`)

**Qué se hizo:** tabla de cuentas y productos propios (`/api/own-accounts`) y formas del nombre del titular; lo que el concepto reconoce como propio no cuenta en las tres sumas, lo que solo nombra un banco queda dudoso y sigue contando, y se resuelve con `ownershipDecision` en `PATCH /api/movements/:id`. ADR-040. Lotes A y B hechos; reviewer `CHANGES_REQUESTED` en la primera revisión y `APPROVED` en la segunda → [resumen](summaries/own-accounts.md), [implementación](implementations/own-accounts.md), [revisión](reviews/own-accounts.md).
**Estado:** `done` en `feature_list.json`, línea en `history.md`, fila E7 de `docs/roadmap.md`. Commit `f905fdb`. Tabla rellenada con el humano el 2026-10-20 (12 filas y su nombre, por la API); 67 movimientos reconocidos como suyos, todos ya marcados o emparejados, 0 dudosos, sumas sin cambios. Criptan queda con datos mínimos: el humano los dará más adelante.


## F61 `rule-suggestions` — CERRADA (2026-10-18, commit `0ddadd2`)

**Qué se hizo:** mejoras B y C de la categorización. `GET /api/category-rules/suggestions` propone reglas con los conceptos que más se repiten en `Otros gastos` / `Otros ingresos` (texto propuesto, movimientos que recogería, `manualMatches`), y `GET /api/category-rules/preview` responde lo que respondería `POST /api/category-rules` en `categorization` sin crear la regla. Las dos de solo lectura, con la misma función (`planCategorization`) que decide qué escribe la categorización por reglas. ADR-039. Lotes A y B hechos; reviewer `CHANGES_REQUESTED` en la primera revisión (se proponía un texto que ya era el `matchText` de una regla del otro tipo) y `APPROVED` en la segunda → [resumen](summaries/rule-suggestions.md), [implementación](implementations/rule-suggestions.md), [revisión](reviews/rule-suggestions.md).
**Estado:** `done` en `feature_list.json`, línea en `history.md`, fila E6 de `docs/roadmap.md`. Commit `0ddadd2`.

## F60 `category-origin-and-rule-reapply` — CERRADA (2026-10-18, commit `d97c0d8`)

**Qué se hizo:** mejora A de la categorización (`../docs/ideas.md` del workspace, idea 4). Cada movimiento guarda en `categorySource` quién le puso la categoría (`manual`, `rule`, `closing`; término aprobado en `docs/vocabulary.md`); `POST` y `PATCH /api/category-rules` aplican todas las reglas a lo pendiente sin categoría y a lo `closing`, nunca a lo `manual` ni a lo `rule`, y devuelven lo que movieron en `categorization`. Importar y `POST /api/category-rules/apply` siguen igual. ADR-038. Lotes A y B hechos, reviewer `APPROVED` → [resumen](summaries/category-origin-and-rule-reapply.md), [implementación](implementations/category-origin-and-rule-reapply.md), [revisión](reviews/category-origin-and-rule-reapply.md).
**Estado:** `done` en `feature_list.json`, línea en `history.md`, fila E6 de `docs/roadmap.md`. Commit `d97c0d8`. Después, F61 `rule-suggestions` (mejoras B y C).

## F59 `recurring-people-by-category` — CERRADA (2026-10-17, commit `eebba15`)

**Qué se hizo:** cabo 28 de `docs/roadmap.md`. En `GET /api/recurring-expenses`, una transferencia o un bizum se queda en «a personas» solo sin categoría o con `Otros gastos` o `Transferencias a personas`; con otra categoría va al gasto variable de esa categoría y sigue en el total (como mucho un céntimo de diferencia por redondeo, aceptado por el humano). Flujo simple, reviewer `APPROVED` en la segunda revisión → [resumen](summaries/recurring-people-by-category.md), [implementación](implementations/recurring-people-by-category.md), [revisión](reviews/recurring-people-by-category.md).
**Estado:** `done` en `feature_list.json`, línea en `history.md`, cabo 28 cerrado. Commit `eebba15`.

## F58 `recurring-expenses` — CERRADA (2026-10-17, commit `72a5357`; parte 1 de `../docs/handoff-recurrentes.md` marcada ✅)

**Qué se hizo:** parte 1 de `../docs/handoff-recurrentes.md`: `GET /api/recurring-expenses`, de solo lectura, con los recibos uno por uno, las transferencias a personas y el gasto variable por categoría, sumados por mes, y el total. Lotes A y B hechos, reviewer `APPROVED` → [resumen](summaries/recurring-expenses.md), [implementación](implementations/recurring-expenses.md), [revisión](reviews/recurring-expenses.md).
**Estado:** `done` en `feature_list.json`, línea en `history.md`. Commit `72a5357`.

Última cerrada: **F57 `deposit-totals-interest-only`** (2026-10-16, commit
`f8b2aa0`; ver su sección más abajo) → [resumen](summaries/deposit-totals-interest-only.md).
Antes: **F56 `categorized-movements-list`** (2026-10-13, commit
`2d2763b`) → [resumen](summaries/categorized-movements-list.md), y **F55 `db-backup`**
(2026-10-02, commit `91a3cfc`) → [resumen](summaries/db-backup.md), y el mismo día F51
(`d8c0a6d`), F52 (`55d574d`), F53 (`24784b7`) y F54 (`44797d6`); el cabo 10 quedó como
riesgo aceptado por el humano, sin código.

La parte 1 de `../docs/handoff-reglas-aplicadas.md` quedó marcada ✅ el 2026-10-13; la
parte 2 es la feature 30 del frontend, en su propia sesión.

**Cabos sueltos tras el 2026-10-02:** cerrados el 6, 14, 16, 21 y 23 (F51 a F55,
última en `8e78654`); el 10 es riesgo aceptado y el 22 queda aparcado hasta que
`exceljs` falle, los dos por decisión del humano; el 20 espera a que decida qué
quiere ver. El 24 (borrar un producto o un valor desde la API) queda aparcado por el humano hasta que sea un problema. El 25 se abrió el 2026-10-04 y espera decisión del humano.

**Arreglo sin feature, 2026-10-04:** el orden de `GET /api/movements` acaba en `id DESC`
y recorrer las páginas devuelve cada movimiento una sola vez (commit `f10fe8c`,
corrige la F36; el documento del encargo, `handoff-paginacion-estable.md` del
workspace, ya está borrado). El humano hizo la prueba
con sus datos reales ese día y salió bien. Detalle:
[implementación](implementations/movements-stable-order.md) y
[revisión](reviews/movements-stable-order.md). Dejó abierto el cabo 25 de
`docs/roadmap.md`.

## F57 `deposit-totals-interest-only` — CERRADA (2026-10-16, commit `f8b2aa0`)

**Qué se hizo:** parte 1 de `../docs/handoff-depositos.md`: en los `totals` de `GET /api/movements` y los `period.totals` de `GET /api/overview` una apertura y una cancelación de depósito suman 0 y un vencimiento suma solo su interés, sin marcar nada. Lotes A y B hechos, reviewer `APPROVED` → [resumen](summaries/deposit-totals-interest-only.md), [implementación](implementations/deposit-totals-interest-only.md), [revisión](reviews/deposit-totals-interest-only.md).
**Estado:** `done` en `feature_list.json`, línea en `history.md`. Commit `f8b2aa0`; la parte 1 de `../docs/handoff-depositos.md` queda marcada ✅.
**Nota para el spec:** el Lote B se amplió a `README.md:81` y a comentarios de `prisma/schema.prisma` (176-181), y el Lote A a `src/modules/investments/investments.deposits.test.ts` (tipos), que la F57 vuelve falsos y no estaban en ningún `Archivos:`.

<!--
Plantilla mientras trabajas — borra este comentario y rellena:

## F<n> `<nombre>` — EN CURSO (<rol>, <fecha>)

**Qué se está haciendo:** una o dos frases.
**Estado:** qué está hecho y qué falta.
**Bloqueos:** qué impide avanzar, si algo lo impide.
**Informe:** `implementations/<feature>.md`.
-->

## Lo que le toca al humano

**Las migraciones ya están todas aplicadas** (comprobado el 2026-10-22 con
`prisma migrate status`: `Database schema is up to date!`), y la tabla de cuentas de
la F62 está rellenada desde el 2026-10-20. Lo que queda son **pruebas con tus datos**,
ninguna bloquea nada:

- ~~**F63**: marcar tus categorías fijas~~ ✅ hecho el 2026-10-23 con el leader, por
  la API: Vivienda, Suministros, Telefonía e internet, Suscripciones e Impuestos y
  administración son fijas; las otras diez, variables. Se refina más adelante si hace falta.
- **Mantenimiento del 2026-10-28, `@googleapis/drive` 27:** los tests usan un Drive simulado. Con `pnpm run dev`, una importación que lea tu Drive y mueva el archivo a `procesados/`, y `pnpm run db:backup` (copia nueva en la carpeta de copias). Si algo falla con Drive, es lo primero a mirar.
- **F61** (2026-10-18): con `pnpm run dev`, pide `GET /api/category-rules/suggestions`,
  elige una propuesta y crea su regla con `POST /api/category-rules` (o mírala antes
  con `GET /api/category-rules/preview`): los movimientos que mueve tienen que ser los
  de la lista. ⚠️ Crear la regla escribe en tu base.
- **F60** (2026-10-18): crea una regla para algo que tengas en `Otros gastos` y mira
  la lista que devuelve en `categorization`.
- **F59 y F58** (2026-10-17): `GET /api/recurring-expenses`. Tus recibos salen uno por
  uno con su periodicidad; en `transfersToPeople` solo quedan las transferencias y
  bizum sin categoría o con `Otros gastos` / `Transferencias a personas`; al ponerle
  a una de un taller su categoría pasa a `variable` y `monthlyTotal` no cambia más de
  un céntimo. (Esta ruta la sustituye la F63; cabo 29.)
- **F57** (2026-10-16): `GET /api/movements?from=2026-10-01&to=2026-10-31` y comparar
  `totals` con las cifras de `../docs/handoff-depositos.md`; mes a mes de agosto de
  2025 a septiembre de 2026 cada vencimiento suma solo su interés (el de agosto de
  2025 sale dudoso, `decisions.md` 🔴 1 de la F57).

El resto de tus deberes pendientes viven en
[`docs/roadmap.md`](../docs/roadmap.md) §Deberes tuyos pendientes, y los cabos
sueltos en la tabla §Cabos sueltos con dueño del mismo archivo. Aquí solo se
escribe lo que sale de la sesión **en curso**.

## Correcciones del humano

_Cada corrección que el humano hace a un agente durante la feature, en una
línea: qué se hizo, qué agente, qué quería él. El leader la usa al cerrar para
proponer entradas de `docs/lessons.md`. Esta sección no se vacía al cerrar la
sesión, solo al cerrar la feature._

