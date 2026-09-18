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
> se deja «por si acaso». Se vació el **2026-09-01** con las cinco features
> de las dos últimas sesiones ya cerradas: lo que había estaba entero en
> [`history.md`](history.md) y en `summaries/`, y el único punto vivo —comparar los
> saldos con la web del banco— se movió a `docs/roadmap.md` §Deberes tuyos. Este archivo se vació el **2026-08-21** tras acumular
> 22 secciones de features ya cerradas, todas duplicadas en `summaries/` y
> `reviews/`; el contenido anterior sigue en el histórico de git. Se volvió a
> vaciar el **2026-08-26**, con las tres features de esa sesión ya cerradas.

## Feature en curso

_Ninguna._ Última cerrada: **F47 `movements-review-bulk`** (2026-09-18, aprobada
en segunda pasada, `done`, **commiteada en `00c6790`** y pendiente de la prueba real del
humano) — ver su sección más abajo. Antes que ella, en la misma sesión,
**F48 `import-warnings-persistence`** (2026-09-18, aprobada, `done`,
commiteada en `9737af3`; su prueba real se hizo en lo que se podía probar). Antes que ella, **F39 `investments-overview`** (2026-09-05, aprobada, probada en real y commiteada en 3b2ed3b) — [veredicto](reviews/investments-overview.md) · [resumen](summaries/investments-overview.md). Con ella quedan cerradas las 6 features de la tanda del 2026-09-01 (36–41), todas commiteadas.

**Planteamiento nuevo (2026-09-05):** las **F42, F43 y F44** quedaron escritas
y el humano **aprobó los tres intents** («he leído las tres features, están
correctas, podemos hacerlas»). Orden acordado: **44 → 42 → 43**. La pregunta
abierta de la F43 (quién escribe las reglas de arranque) se resuelve en su
puerta de spec. También pidió retirar de los pendientes la comparación de
saldos con la web del banco (hecho en `docs/roadmap.md` §Deberes).

**F44 `manual-transfer-marking` cerrada** (2026-09-06, aprobada, probada en
real y commiteada en ca8f824) — [veredicto](reviews/manual-transfer-marking.md) ·
[resumen](summaries/manual-transfer-marking.md).

**F42 `net-worth` cerrada** (2026-09-06, aprobada y commiteada en 5640905 por
orden del humano) — [veredicto](reviews/net-worth.md) ·
[resumen](summaries/net-worth.md).

**F43 `auto-categorization` cerrada** (2026-09-06, aprobada) —
[veredicto](reviews/auto-categorization.md) ·
[resumen](summaries/auto-categorization.md). **Sin commitear**, esperando la
prueba real del humano (tres pasos, ver §Lo que le toca al humano). Con ella
se cierra entero el planteamiento del 2026-09-05 (F42, F43, F44).

**F45 `import-run-totals` cerrada** (2026-09-11, aprobada, `done`) —
[veredicto](reviews/import-run-totals.md) ·
[resumen](summaries/import-run-totals.md) ·
[informe](implementations/import-run-totals.md). **Pendiente de commit.**
Cierra los cabos 13 y 17 del roadmap; en la misma sesión se cerraron los cabos
15 y 19 en el commit 83dc791.

**F46 `revolut-statement` cerrada** (2026-09-15, aprobada en segunda pasada y
probada en real) — [veredicto](reviews/revolut-statement.md) ·
[resumen](summaries/revolut-statement.md) ·
[prueba real](explorations/prueba-real-revolut-2026-09-15.md). Commiteada en
el commit `feat(revolut)` del 2026-09-15. Cierra la E4 del roadmap (6 de 6 bancos).

## F48 `import-warnings-persistence` — CERRADA (2026-09-18)

**Estado:** aprobada por el reviewer en segunda pasada y marcada `done` en
`feature_list.json`. `./init.sh` completo en verde (70 archivos, 1296 tests,
exit 0). **Sin commitear y pendiente de la prueba real del humano** (ver
§Lo que le toca al humano).
**Qué deja hecha:** las filas que el parser no pudo leer y los descuadres de
saldo de una importación quedan guardados con el archivo del que salieron, se
consultan con `GET /api/import/warnings` y un descuadre se da por revisado con
`PATCH /api/import/warnings/balance-mismatches/:id`. La importación no cambia:
mismo movimiento de archivos y mismos contadores.
**Enlaces:** [veredicto](reviews/import-warnings-persistence.md) ·
[resumen](summaries/import-warnings-persistence.md) ·
[informe](implementations/import-warnings-persistence.md).
**Pendiente de respuesta del humano:** la palabra «aviso» (`warning` en el
código y en la ruta) está **propuesta y no aprobada**, anotada en
[`docs/vocabulario.md`](../docs/vocabulario.md) §Propuestos. Hasta que responda,
en la prosa se dice «las filas que el parser no pudo leer y los descuadres».

### Cómo se llegó aquí — intent dictado (leader, 2026-09-17)

**Qué se está haciendo:** guardar los avisos sin resolver de una importación
(filas ilegibles y descuadres de saldo), poder consultarlos después y dar por
revisado un descuadre.
**De dónde sale:** al revisar la parte 1 del traspaso se vio que el borrador de
la F47 no corrige nada de lo que sale mal al importar. Comprobado en el código:
un archivo con filas ilegibles mueve el archivo a `procesados/` igual
([import.service.ts:496-507](../src/modules/import/import.service.ts#L496-L507))
y el informe del run no se guarda en ninguna parte (no hay tabla para ello en
`prisma/schema.prisma`).
**Estado:** `intent` dictado por el humano el 2026-09-17 (cuatro decisiones:
el archivo se mueve pero queda constancia; se guardan solo los avisos sin
resolver; los descuadres se ven y se marcan como revisados; los traspasos
dudosos quedan fuera). Cabo suelto 23 anotado en `docs/roadmap.md`.
**Orden acordado:** primero la F48, después la F47.
El humano aprobó el `intent` y, después, el spec (`decisions.md`). La feature se
hizo en cuatro lotes en paralelo (A: modelo, migración y servicio; B: las dos
rutas; C: el enganche en las dos formas de importar; D: contrato y ADR-031), más
una limpieza de dos archivos de test colaterales. Cada lote tiene su sección en
el [informe](implementations/import-warnings-persistence.md).

## F47 `movements-review-bulk` — CERRADA (2026-09-18)

**Estado:** aprobada por el reviewer en **segunda pasada** y marcada `done` en
`feature_list.json`. `./init.sh` completo en verde (72 archivos, 1328 tests,
exit 0). **Sin commitear y pendiente de la prueba real del humano** (ver
§Lo que le toca al humano).
**Qué deja hecha:** `GET /api/movements` filtra además por categoría, por «sin
categoría» y por un trozo de texto de la descripción sin distinguir mayúsculas ni
tildes; y `PATCH /api/movements` confirma y/o pone categoría a hasta 200
movimientos en una sola petición, todo o nada. No cambia la forma de lo que ya
devolvía el listado, ni `PATCH /api/movements/:id`, y sigue sin poderse tocar
importe, fecha ni descripción.
**Enlaces:** [veredicto](reviews/movements-review-bulk.md) ·
[resumen](summaries/movements-review-bulk.md) ·
[informe](implementations/movements-review-bulk.md).
**Ya aplicado a la base real:** la migración `20260918140000_movement_description_search`
se aplicó con `prisma migrate deploy` sobre `gastos` (1.607 filas, las 1.607 con
la columna rellena, sin insertar, cambiar ni borrar ninguna).
**Cómo se hizo:** en tres lotes en paralelo (A: columna generada y migración;
B: filtros y operación sobre varios; C: contrato y documentación), cada uno con
su sección en el informe. La primera pasada del reviewer pidió un cambio (una
frase del contrato sobre el rango de `q` que el código no cumplía); se corrigió
solo en `docs/api-contract.md`, sin tocar código ni tests.
**Anotado por el reviewer, no bloquea:** el lote B (el que trae el código) no
tiene sección propia en este archivo, porque los tres lotes lo comparten y no
estaba en su cabecera `Archivos:`. Queda recogido aquí, en esta sección de cierre.

### Cómo se llegó aquí — intent (leader, 2026-09-17; aprobado por el humano)

**Qué se estaba haciendo:** parte 1 de `../docs/handoff-pantalla-revision.md`
(filtros por categoría y texto en `GET /api/movements`, y confirmación y
categorización en bloque).
**Por qué:** todo lo que se importa nace `pending_review` y solo se confirmaba de
uno en uno; con 1.378 movimientos sin categoría eso eran 1.378 peticiones.
**La pregunta abierta del borrador** —si la operación en bloque es solo por lista
de ids o también por filtro— la respondió el humano en la puerta del spec:
**solo por lista de ids** (🔴 punto 1 de `decisions.md`).

### Lote A — columna de búsqueda en la base de datos (implementer, 2026-09-18)

**Feature en curso:** 47 — `movements-review-bulk`, lote A (T1, T2, T3).
**Plan:** migración en SQL crudo con la columna generada `descriptionSearch` y
el índice por `categoryId`; declararlos en `prisma/schema.prisma`; test de que
PostgreSQL la rellena sola y de que ningún código puede escribirla.
**Estado:** T1, T2 y T3 hechas. Migración `20260918140000_movement_description_search`
aplicada con `prisma migrate deploy` sobre la base `gastos`: 1607 filas, las
1607 con la columna rellena, sin insertar, actualizar ni borrar ninguna fila.
**Informe:** `implementations/movements-review-bulk.md`.

### Lote C — contrato y documentación (implementer, 2026-09-18)

**Feature en curso:** 47 — `movements-review-bulk`, lote C (T13, T14, T15).
**Plan:** `docs/api-contract.md` (tres parámetros nuevos y dos errores en
`GET /api/movements`, más la sección nueva `PATCH /api/movements`), `README.md`
(índice de endpoints) y `docs/roadmap.md` (§E7: los filtros que faltaban y qué
desbloquea en el frontend). Solo esos tres archivos.
**Estado:** T13, T14 y T15 hechas. `./init.sh` completo en verde, exit 0 (71
archivos, 1299 tests), con el lote A ya en el árbol y sin nada del lote B. Se
documenta **por adelantado** lo que fija `design.md`: el informe lleva una tabla
de qué contrastar contra el código del lote B cuando exista.
**Bloqueos:** ninguno. No se encontró ninguna discrepancia entre `design.md` y
`requirements.md`.
**Aviso para quien verifique:** dos `./init.sh` simultáneos comparten las bases
`gastos_test_<poolId>` y dan un rojo falso (pasó una vez aquí: 10 tests rojos;
la pasada siguiente en solitario, sin cambiar nada, salió verde).
**Informe:** `implementations/movements-review-bulk.md` §Lote C.

### Lote B — filtros nuevos y cambio sobre varios movimientos (implementer, 2026-09-18)

**Feature en curso:** 47 — `movements-review-bulk`, lote B (T4–T12).
**Plan:** los tres parámetros nuevos en el esquema y los tipos del listado, los
filtros dentro del `where` que ya compartían la página, el contador y los
totales, la búsqueda por texto normalizada y con `%`, `_` y la barra invertida
escapados, y `PATCH /api/movements` con sus dos porteros y su transacción.
**Estado:** T4–T12 hechas; R1–R13 cubiertos con 29 tests nuevos (11 en
`movements.test.ts`, 18 en `movements.bulk.test.ts`). `./init.sh` completo en
verde, exit 0 (72 archivos, 1328 tests), con los lotes A y C ya en el árbol.
**Bloqueos:** ninguno.
**Informe:** `implementations/movements-review-bulk.md` §Lote B.

### Lote A — columna de búsqueda en la base de datos (implementer, 2026-09-18)

**Feature en curso:** 47 — `movements-review-bulk`, lote A (T1, T2, T3).
**Plan:** migración en SQL crudo con la columna generada `descriptionSearch` y
el índice por `categoryId`; declararlos en `prisma/schema.prisma`; test de que
PostgreSQL la rellena sola y de que ningún código puede escribirla.
**Estado:** T1, T2 y T3 hechas. Migración `20260918140000_movement_description_search`
aplicada con `prisma migrate deploy` sobre la base `gastos`: 1607 filas, las
1607 con la columna rellena, sin insertar, actualizar ni borrar ninguna fila.
**Informe:** `implementations/movements-review-bulk.md`.

### Lote C — contrato y documentación (implementer, 2026-09-18)

**Feature en curso:** 47 — `movements-review-bulk`, lote C (T13, T14, T15).
**Plan:** `docs/api-contract.md` (tres parámetros nuevos y dos errores en
`GET /api/movements`, más la sección nueva `PATCH /api/movements`), `README.md`
(índice de endpoints) y `docs/roadmap.md` (§E7: los filtros que faltaban y qué
desbloquea en el frontend). Solo esos tres archivos.
**Estado:** T13, T14 y T15 hechas. `./init.sh` completo en verde, exit 0 (71
archivos, 1299 tests), con el lote A ya en el árbol y sin nada del lote B. Se
documenta **por adelantado** lo que fija `design.md`: el informe lleva una tabla
de qué contrastar contra el código del lote B cuando exista.
**Bloqueos:** ninguno. No se encontró ninguna discrepancia entre `design.md` y
`requirements.md`.
**Aviso para quien verifique:** dos `./init.sh` simultáneos comparten las bases
`gastos_test_<poolId>` y dan un rojo falso (pasó una vez aquí: 10 tests rojos;
la pasada siguiente en solitario, sin cambiar nada, salió verde).
**Informe:** `implementations/movements-review-bulk.md` §Lote C.

<!--
Plantilla mientras trabajas — borra este comentario y rellena:

## F<n> `<nombre>` — EN CURSO (<rol>, <fecha>)

**Qué se está haciendo:** una o dos frases.
**Estado:** qué está hecho y qué falta.
**Bloqueos:** qué impide avanzar, si algo lo impide.
**Informe:** `implementations/<feature>.md`.
-->

## Lo que le toca al humano

- **De la F47 (2026-09-18), la prueba real.** ⚠️ **Escribe en tu base de datos
  real**: los dos últimos pasos cambian movimientos de verdad, así que hazlos con
  **pocos movimientos** (tres o cuatro) y elígelos tú. Los dos primeros solo leen.
  Con el backend arrancado (`pnpm run dev`):
  1. **Filtrar por categoría.** Pide `GET /api/movements?categoryId=<id de una
     categoría tuya>&pageSize=5` y comprueba que **todos** los que salen son de
     esa categoría, y que los `totals` de la respuesta son los de esa categoría y
     no los de la tabla entera. Si la categoría tiene subcategorías, fíjate en que
     **no** arrastra las de sus hijas: es a propósito.
  2. **Filtrar por «sin categoría» y buscar por texto.** Pide
     `GET /api/movements?uncategorized=true&pageSize=5`: solo deben salir
     movimientos con `categoryId: null`, y `pagination.total` te dice cuántos
     tienes pendientes de categorizar. Después busca por texto con tildes:
     `GET /api/movements?q=cafeteria` y `GET /api/movements?q=CAFETERÍA` (o la
     palabra acentuada que te venga bien de tus extractos) **tienen que devolver
     lo mismo**. Prueba también una palabra a medias (`q=eter` encuentra
     `VETERINARIO`).
  3. **Cambiar varios a la vez, con un lote pequeño.** Coge **tres ids** de los
     que acaben de salir y manda
     `PATCH /api/movements` con `{"ids":[a,b,c],"status":"confirmed"}`. Debe
     responder `updated: 3` y devolverlos ya confirmados. Vuelve a pedirlos con
     `GET` para verlo. Si te arrepientes, la misma petición con
     `"status":"pending_review"` los devuelve como estaban.
  4. **Categorizar varios a la vez, y el todo o nada.** Con otros dos o tres ids
     **del mismo tipo** (los tres gastos, o los tres ingresos), manda
     `{"ids":[…],"categoryId":<una categoría de ese mismo tipo>}`. Deben quedar
     los tres con esa categoría. Para ver el «todo o nada», mete a propósito en la
     lista un ingreso junto a dos gastos y pide una categoría de gasto: tiene que
     responder **400** diciendo qué id falla, y al releerlos **ninguno de los
     tres** debe haber cambiado.
  Ya está commiteada en `00c6790`: la prueba real sigue pendiente, pero no
  bloquea nada.
- ~~**De la F48 (2026-09-18), la prueba real**~~ ✅ **hecha por el leader el
  2026-09-18 a petición del humano**, con su archivo de Revolut de 2025 ya
  procesado antes ([informe](explorations/prueba-real-f48-2026-09-18.md)): la
  migración ya estaba aplicada, y la importación salió `importedCount: 0`,
  `duplicateCount: 35`, el archivo movido a `procesados/` y **cero avisos**
  antes y después. Demuestra que la importación **no ha cambiado**; **no**
  demuestra que un aviso se guarde, porque ese extracto no trae ni una fila
  ilegible ni un descuadre. El humano decidió **esperar a un aviso de verdad**
  en vez de estropear una fila a propósito (borrarla después exigiría SQL, cabo
  suelto 23). Commiteada el 2026-09-18 en `9737af3`.
- ~~**Responder a la propuesta de vocabulario «aviso»**~~ ✅ **aprobada por el
  humano el 2026-09-18** y subida a [`docs/vocabulario.md`](../docs/vocabulario.md)
  §Términos aprobados, con su definición y lo que NO abarca.
- ~~**De la F43 (2026-09-06), la prueba real en tres pasos**~~ ✅ **hecho por el
  humano el 2026-09-11**: la migración `20260906120000_category_rule` se
  aplicó con `migrate deploy` (7 migraciones, todas aplicadas), el seed creó
  las 61 reglas (`created 61, skipped 0`) y la primera pasada de
  `POST /api/category-rules/apply` devolvió `categorized: 212`,
  `conflictCount: 1` y `unmatched: 1307`. Los tres suman 1520, exactamente
  los movimientos que la F37 dejó sin revisar y sin categoría: la pasada ha
  mirado todo lo elegible. El único choque es un Bizum cuyo concepto casa a la
  vez con la regla «bizum» (Transferencias a personas) y con «gimnasio» (Salud y
  deporte); quedó sin categoría a propósito, como manda la decisión de choques.
  Los 1307 sin casar son el ajuste fino que le toca a él por API
  (`/api/category-rules`) relanzando `apply`. Ya estaba commiteada en 96f450a.
- ~~**De la F44:** la prueba real~~ ✅ **hecho por el humano el 2026-09-06**:
  `POST /api/transfers` con la primera salida y la entrada devolvió 201 con el
  enlace compartido, y en cada pierna solo cambiaron `transferId` y
  `updatedAt`. El caso vivo de los traspasos queda resuelto: ya no hay ningún
  grupo dudoso pendiente. Commiteada en ca8f824.
- ~~**De la F39:** probarla en real~~ ✅ **hecho por el humano el 2026-09-05**:
  agosto cuadra número a número (la ganancia del mes es exactamente la suma de
  la fluctuación y los intereses, y las tres variaciones por producto
  coinciden una a una con las fotos; las cifras concretas no se escriben aquí
  porque son datos reales y este archivo se versiona) y septiembre sale con
  huecos, los 4 fluctuantes excluidos con motivo y el depósito vencido el
  31-08 fuera de la vista. Commiteada en 3b2ed3b.
- ~~**De la F41:** volver a lanzar `POST /api/import/local`~~ ✅ **hecho por el
  humano el 2026-09-05** (prueba real): `pairsCreated: 7` — los 3 grupos
  aprobados resueltos (3 parejas del 3×1000, 2 del cruce de 1000, 2 del
  2×3000; el «6» que se estimó en decisions.md contaba mal el cruce) — y como
  único dudoso queda el de 2×500 con una sola entrada, tal y como debía. En
  total, con la pasada de la F40: 35 parejas de traspasos enlazadas.
- ~~**Responder a la propuesta de vocabulario «lote igualado»**~~ ✅ **aprobada
  el 2026-09-05** y anotada en `docs/vocabulario.md`.
- ~~**De la F40:** lanzar una vez `POST /api/import/local`~~ ✅ **hecho por el
  humano el 2026-09-03** (prueba real): `pairsCreated: 28` y 4 grupos dudosos
  (14 movimientos) sin marcar a propósito, sin fallos, 1735 duplicados y 0
  importados como se esperaba. Los 4 dudosos son traspasos reales suyos que el
  emparejamiento no puede resolver sin ambigüedad (varias transferencias del
  mismo importe en la misma ventana: 3×1000 EUR Openbank↔Bankinter de julio
  2026, un cruce de 1000 EUR con Bankinter→Openbank y Bankinter→N26 el mismo
  día de diciembre 2025, 2×3000 EUR Bankinter→MyInvestor en días consecutivos,
  y 2×500 EUR Bankinter→N26 con una sola pierna espejo). Quedan sin marcar por
  decisión 2 del spec, y no hay marcado manual por decisión 4: si molestan en
  los totales, es una feature nueva.
- **Nada nuevo que ejecutar de la F37:** el único deber que traía
  (`pnpm run seed:categories` una vez) **ya quedó hecho** — el implementer lo
  ejecutó por accidente contra la base real al verificar el comando, y las 16
  categorías están sembradas (idempotencia comprobada: segunda pasada
  `created 0`). Recuerda el aviso de `specs/37-categories-and-tagging/decisions.md`
  §📌: no vuelvas a ejecutarlo tras renombrar una sembrada, o el nombre viejo
  reaparecerá.

El resto de sus deberes pendientes vive en
[`docs/roadmap.md`](../docs/roadmap.md) §Deberes tuyos pendientes, y los cabos
sueltos en la tabla §Cabos sueltos con dueño del mismo archivo. Aquí solo se
escribe lo que sale de la sesión **en curso**.
