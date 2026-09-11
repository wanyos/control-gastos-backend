# Requirements — F43 `auto-categorization`

> EARS estricto. Fuente de verdad: el `intent` de la feature 43 en
> `feature_list.json`, con la respuesta del humano del 2026-09-06 (las reglas de
> arranque se derivan y él las corrige). Son **16 requirements, uno por encima
> del tope de ~15**: el nº 16 (borrar una categoría con reglas se impide) no es
> alcance nuevo del humano sino la coherencia obligada con la guarda de borrado
> de la F37; sin él, borrar una categoría referenciada por una regla acabaría en
> un 500 de clave foránea. Queda dicho aquí y en `decisions.md` §⚙️.

Vocabulario de este spec (descriptivo, no términos nuevos): «la pasada» es la
ejecución que recorre los movimientos elegibles aplicando las reglas; «regla» es
una fila de la tabla nueva `CategoryRule` (un texto que, si el concepto lo
contiene, apunta a una categoría). «Movimiento elegible» queda definido por R8.

## R1
CUANDO un cliente hace `POST /api/category-rules` con `{categoryId, matchText}`
válidos, el sistema DEBE crear la regla —guardando `matchText` normalizado
(minúsculas, sin tildes, espacios de los extremos fuera)— y responder `201` con
la regla y su categoría embebida.

## R2
SI el `POST` (o el `PATCH` de R4) trae una categoría inexistente, un `matchText`
de menos de 3 caracteres tras normalizar, o un `matchText` que normalizado ya
existe ENTONCES el sistema DEBE rechazar con el error tipado correspondiente
(`404 NOT_FOUND` / `400 VALIDATION_ERROR` / `409 CONFLICT`) sin escribir nada.

## R3
CUANDO un cliente hace `GET /api/category-rules`, el sistema DEBE responder
`200` con todas las reglas y su categoría embebida.

## R4
CUANDO un cliente hace `PATCH /api/category-rules/:id` con `matchText` y/o
`categoryId` (y nada más: `additionalProperties: false`, `minProperties: 1`),
el sistema DEBE actualizar exclusivamente esos campos con las mismas
validaciones del alta.

## R5
CUANDO un cliente hace `DELETE /api/category-rules/:id`, el sistema DEBE borrar
la regla y responder `204` sin modificar ningún movimiento (lo ya categorizado
por esa regla se queda como está).

## R6
El sistema DEBE considerar que una regla casa con un movimiento cuando, y solo
cuando, la `description` normalizada (minúsculas, sin tildes) contiene el
`matchText` de la regla Y `category.kind` de la regla coincide con
`movement.type`.

## R7
CUANDO la pasada encuentra un movimiento elegible cuyas reglas casantes apuntan
todas a exactamente UNA categoría, el sistema DEBE escribir esa categoría en
`Movement.categoryId`.

## R8
El sistema NO DEBE modificar en la pasada ningún movimiento con
`categoryId != null`, ni con `status = 'confirmed'`, ni con `type = 'neutral'`
(solo es elegible el que está sin categoría, sin confirmar y es gasto o
ingreso).

## R9
SI un movimiento elegible casa con cero reglas, o con reglas que apuntan a más
de una categoría distinta, ENTONCES el sistema NO DEBE asignarle categoría
(queda con `categoryId` NULL, visible como pendiente).

## R10
CUANDO la pasada termina, el sistema DEBE devolver un resultado con cuántos
movimientos categorizó, la lista de conflictos (cada movimiento con las reglas
que chocaron y sus categorías) y cuántos elegibles quedaron sin casar.

## R11
CUANDO la pasada se ejecuta dos veces seguidas sin cambios entre medias, la
segunda ejecución DEBE categorizar 0 movimientos y dejar la base de datos
idéntica (idempotencia observable).

## R12
CUANDO termina una importación (la vía Drive y la vía de copias locales, ambas),
el sistema DEBE ejecutar la pasada después de la detección de traspasos y
adjuntar su resultado al informe de la importación; un fallo de la pasada viaja
dentro de ese resultado (campo `error`) y NO tumba la importación (mismo patrón
que `detectTransfers`).

## R13
CUANDO un cliente hace `POST /api/category-rules/apply`, el sistema DEBE
ejecutar la pasada bajo demanda y responder `200` con el mismo resultado de R10
(es lo que permite repasar lo pendiente tras corregir una regla, sin
reimportar).

## R14
El sistema NO DEBE escribir en la pasada ningún campo distinto de
`Movement.categoryId`: importes, saldos, `status`, `transferId`, fechas y los
totales de `GET /api/movements` quedan idénticos antes y después (test que
compara).

## R15
CUANDO el humano ejecuta `pnpm run seed:category-rules`, el sistema DEBE crear
solo las reglas de arranque que falten (idempotente: la segunda ejecución
inserta 0), saltando y reportando las que apunten a una categoría inexistente;
nada siembra reglas por su cuenta (ni migración ni arranque).

## R16
SI se pide `DELETE /api/categories/:id` de una categoría referenciada por
alguna regla ENTONCES el sistema DEBE rechazar con `409` diciendo cuántas
reglas la usan (extiende la guarda de la F37 de movimientos e hijas).

---

## Procedencia

- R1 — (humano) «Puedo añadir o cambiar una regla sin tocar código». La forma
  API sale de la delegación «dónde viven las reglas»: tabla con API (ver
  design §1). Alternativa descartada: archivo escrito a mano.
- R2 — (añadido) El humano no habló de validaciones. Propongo mínimo 3
  caracteres para que una regla de una letra no case con todo, y unicidad para
  no tener dos reglas idénticas en desacuerdo. ← REVISAR EN APROBACIÓN.
- R3 — (delegado) Consecuencia de «tabla con API»: sin listar no se pueden
  corregir las reglas sembradas.
- R4 — (humano) «cambiar una regla sin tocar código».
- R5 — (delegado) Borrar una regla no des-categoriza: decidido así para que
  afinar reglas nunca deshaga trabajo hecho. ← lo recoge decisions.md ⚙️.
- R6 — (delegado) El humano cedió «su forma exacta (¿contiene?, ¿algo más?)».
  Decido: contiene, sin mayúsculas ni tildes, y con el candado de kind que la
  F37 ya impuso al asignar a mano. Alternativa descartada: prefijos/comodines
  (design §7).
- R7 — (humano) «Después de una pasada, la mayoría de mis movimientos tienen
  categoría sin que yo haya escrito nada».
- R8 — (delegado) El humano cedió «el criterio exacto con los campos que ya
  existen (status, categoryId)». Decido: se protege también el confirmado SIN
  categoría (confirmar = «ya lo miré»), y el neutral nunca se categoriza
  (regla de la F37).
- R9 — (humano) «antes sin categoría que mal categorizado» + (delegado) la
  política de dos reglas en conflicto: no asignar, mismo principio que los
  traspasos dudosos de la F40.
- R10 — (añadido) La forma del informe no la pidió; sale de «visible, en vez de
  meterse en un cajón de sastre» y del precedente del informe de la F40.
- R11 — (humano) «la pasada es idempotente» (acceptance derivado del intent).
- R12 — (delegado) «cuándo corre»: al final de cada importación, precedente
  F40. Cubre «los movimientos nuevos que entren por importación se categorizan
  solos en esa pasada».
- R13 — (delegado) «cuándo corre»: también bajo demanda. Cubre «volver a pasar
  las reglas sobre lo pendiente» sin tener que reimportar nada.
- R14 — (humano) «no quiero que categorizar cambie importes, saldos, totales ni
  la importación».
- R15 — (delegado + respuesta del humano del 2026-09-06) Las reglas de arranque
  se derivan y él las corrige. OJO comprobado el 2026-09-06: las reglas
  concretas del análisis del 2026-09-01 NO quedaron escritas en el repositorio
  (solo la lista de 16 categorías); el borrador de arranque es NUEVO, lo
  redacta el implementer con nombres públicos de comercio/patrones habituales
  por categoría (design §5). ← REVISAR EN APROBACIÓN.
- R16 — (añadido) Caso que el humano no contempló: sin esta guarda, borrar una
  categoría con reglas daría un error de clave foránea sin mensaje útil. Es la
  misma política protectora que él aprobó en la F37. ← REVISAR EN APROBACIÓN.
