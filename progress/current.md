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

## F62 `own-accounts` — CERRADA (2026-10-20, sin commit)

**Qué se hizo:** tabla de cuentas y productos propios (`/api/own-accounts`) y formas del nombre del titular; lo que el concepto reconoce como propio no cuenta en las tres sumas, lo que solo nombra un banco queda dudoso y sigue contando, y se resuelve con `ownershipDecision` en `PATCH /api/movements/:id`. ADR-040. Lotes A y B hechos; reviewer `CHANGES_REQUESTED` en la primera revisión y `APPROVED` en la segunda → [resumen](summaries/own-accounts.md), [implementación](implementations/own-accounts.md), [revisión](reviews/own-accounts.md).
**Estado:** `done` en `feature_list.json`, línea en `history.md`, fila E7 de `docs/roadmap.md`. **Sin commit.**


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

De la F62 (2026-10-20), en este orden:

- **Copia de tu base antes de nada:** `pnpm run db:backup`.
- **Aplicar la migración:** `pnpm exec prisma migrate deploy`. ⚠️ Escribe en tu base: crea las tablas `OwnAccount`, `OwnAccountText` y `AccountHolderName` vacías y la columna `Movement.ownershipDecision` a `NULL` en todos tus movimientos.
- **Reiniciar el servidor de desarrollo** (`pnpm run dev`), para que cargue las tablas nuevas.
- **Rellenar la tabla de cuentas con el leader:** él saca de tu base lo que ya se sabe de cada cuenta y producto, tú completas lo que falte (cuentas no importadas, fechas, textos, formas de tu nombre) y, con tu visto bueno, él lo inserta con las rutas de `/api/own-accounts`. Hasta entonces no cambia ninguna suma.

De la F61 (2026-10-18):

- **La prueba con tus datos**, después de migrar la F60 y con `pnpm run dev`: pide `GET /api/category-rules/suggestions`, elige una propuesta y crea su regla con `POST /api/category-rules` (o mírala antes con `GET /api/category-rules/preview`): los movimientos que mueve por esa regla tienen que ser los de la lista. ⚠️ Crear la regla escribe en tu base.
- **La sesión del frontend**: la pantalla de reglas propuestas y la pregunta «¿aplicar a todos los que contienen…?» al cambiar a mano una categoría, contra `docs/api-contract.md`.

De la F60 (2026-10-18):

- **Aplicar la migración a tu base, en este orden:** `pnpm run db:backup` (copia antes de nada); luego `pnpm exec prisma migrate deploy`; y **reinicia el servidor de desarrollo**. ⚠️ Escribe en tu base: añade la columna `categorySource` y le da `closing` a lo que está en las raíz `Otros gastos` / `Otros ingresos` y `manual` al resto con categoría. Con el servidor ya arrancado y la base sin migrar, `GET /api/movements` responde 500 (comprobado por el leader; `GET /api/categories` sí responde 200).
- **La prueba con tus datos**, después de migrar y con `pnpm run dev`: crea una regla para algo que tengas en `Otros gastos` y mira la lista que devuelve en `categorization`.

De la F59 (2026-10-17):

- **La prueba con tus datos reales**, con `pnpm run dev`: `GET /api/recurring-expenses`. Mira que en `transfersToPeople` solo quedan las transferencias y bizum sin categoría o con `Otros gastos` o `Transferencias a personas`; ponle a una de un taller o una tienda su categoría (`PATCH /api/movements/:id`) y comprueba que pasa a esa categoría en `variable` y que `monthlyTotal` no cambia más de un céntimo.

De la F58 (2026-10-17):

- **La prueba con tus datos reales**, con `pnpm run dev`: `GET /api/recurring-expenses`. Los tests solo usan datos inventados; mira que tus recibos salen uno por uno con su periodicidad, que las transferencias a personas y el gasto variable por categoría cuadran, y que `monthlyTotal` es razonable.

De la F57 (2026-10-16):

- **Aplicar la migración a tu base:** `prisma migrate deploy`. ⚠️ Escribe en tu base: quita la marca `excludedFromTotals` de los movimientos de depósito de MyInvestor (migración `20261016120000_deposit_movements_unmark`); las demás marcas se quedan. Haz antes una copia con `pnpm run db:backup` si quieres poder volver atrás.
- **La prueba real**, después de la migración y con `pnpm run dev`: `GET /api/movements?from=2026-10-01&to=2026-10-31` y comparar `totals` con las cifras de `../docs/handoff-depositos.md`; y lo mismo mes a mes de agosto de 2025 a septiembre de 2026, donde cada vencimiento tiene que sumar su interés (salvo el de agosto de 2025, que sale dudoso, `decisions.md` 🔴 1).

El resto de tus deberes pendientes viven en
[`docs/roadmap.md`](../docs/roadmap.md) §Deberes tuyos pendientes, y los cabos
sueltos en la tabla §Cabos sueltos con dueño del mismo archivo. Aquí solo se
escribe lo que sale de la sesión **en curso**.

## Correcciones del humano

_Cada corrección que el humano hace a un agente durante la feature, en una
línea: qué se hizo, qué agente, qué quería él. El leader la usa al cerrar para
proponer entradas de `docs/lessons.md`. Esta sección no se vacía al cerrar la
sesión, solo al cerrar la feature._

- 2026-10-20, leader: al revisar la categorización le planteó varias cosas a la vez (listas de 3-4 puntos y propuestas de orden) cuando él había pedido tres veces «de una en una». Lo que quería: un solo punto por mensaje; se resuelve y solo entonces se plantea el siguiente, sin listar los que vienen.
