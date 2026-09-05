# Requirements — F37 `categories-and-tagging`

> EARS estricto. Fuente de verdad: el bloque `intent` de la feature 37 en
> `feature_list.json`. Cada R es verificable por al menos un test.
>
> Estado de partida COMPROBADO (leyendo `src/modules/categories/categories.routes.ts`
> el 2026-09-02): `GET /api/categories` y `POST /api/categories` **ya existen**
> desde la F8, con validación y `CONFLICT` por nombre duplicado. El aviso del
> intent («hoy /api/categories solo lee») está desactualizado en ese punto; lo
> que sí es cierto es que la tabla está vacía y que no hay renombrar, borrar,
> asignar a movimiento, ni siembra. Esta feature añade exactamente eso.

## R1

CUANDO un cliente hace `POST /api/categories` con `{name, kind}` válidos, el
sistema DEBE responder `201` con la categoría creada (comportamiento existente
de la F8; esta feature lo conserva sin cambios y sus tests siguen en verde).

## R2

CUANDO un cliente hace `GET /api/categories`, el sistema DEBE responder `200`
con las categorías raíz y sus `children` embebidos (comportamiento existente de
la F8; sin cambios).

## R3

CUANDO un cliente hace `PATCH /api/categories/:id` con `{name}` válido (no
vacío, sin otras propiedades), el sistema DEBE responder `200` con la categoría
actualizada, cambiando únicamente su `name` (el `kind` y el `parentId` no se
pueden modificar por esta vía).

## R4

SI el `name` nuevo de un `PATCH /api/categories/:id` colisiona con otra
categoría del mismo `(parentId, kind)` ENTONCES el sistema DEBE responder `409`
`CONFLICT` sin modificar nada.

## R5

CUANDO un cliente hace `DELETE /api/categories/:id` sobre una categoría sin
movimientos asignados y sin subcategorías, el sistema DEBE responder `204` y
borrar solo la categoría (ningún movimiento se borra ni se modifica).

## R6

SI la categoría de un `DELETE /api/categories/:id` tiene movimientos asignados
o subcategorías ENTONCES el sistema DEBE responder `409` `CONFLICT` indicando
en el `message` cuántos movimientos la usan, sin borrar ni modificar nada.

## R7

CUANDO un cliente hace `PATCH /api/movements/:id` con `{categoryId: <entero>}`
de una categoría existente y compatible (ver R9), el sistema DEBE responder
`200` con el movimiento serializado completo, con esa categoría asignada y su
objeto `category` embebido.

## R8

CUANDO un cliente hace `PATCH /api/movements/:id` con `{categoryId: null}`, el
sistema DEBE responder `200` con el movimiento sin categoría (`categoryId` y
`category` a `null`).

## R9

SI el `kind` de la categoría no coincide con el `type` del movimiento
(`expense`↔`expense`, `income`↔`income`), o el movimiento es `neutral`,
ENTONCES el sistema DEBE responder `400` `VALIDATION_ERROR` sin modificar nada.

## R10

CUANDO un cliente hace `PATCH /api/movements/:id` con
`{status: "confirmed"}` o `{status: "pending_review"}`, el sistema DEBE
responder `200` con el movimiento en ese estado (funciona en los dos sentidos:
dar por revisado y volver atrás).

## R11

SI el recurso referido no existe —la categoría de un `PATCH`/`DELETE` de
categorías, el movimiento de un `PATCH /api/movements/:id`, o el `categoryId`
enviado en ese body— ENTONCES el sistema DEBE responder `404` `NOT_FOUND` sin
modificar nada.

## R12

SI el body de un `PATCH` (de categorías o de movimientos) está vacío, o trae
propiedades distintas de las admitidas (`name` en categorías; `categoryId` y/o
`status` en movimientos), o valores fuera de su tipo/enumeración, ENTONCES el
sistema DEBE responder `400` `VALIDATION_ERROR` sin modificar nada.

## R13

CUANDO se ejecuta el comando de siembra (`pnpm run seed:categories`) sobre una
base que no tiene las categorías de arranque, el sistema DEBE crear exactamente
las 16 de la lista del intent —13 con `kind: "expense"` (Vivienda, Suministros,
Telefonía e internet, Supermercado, Comer y beber fuera, Compras, Transporte y
vehículo, Salud y deporte, Suscripciones, Impuestos y administración, Ocio,
Pago de tarjeta, Transferencias a personas) y 3 con `kind: "income"` (Nómina,
Intereses, Otros ingresos)—, todas raíz (`parentId: null`).

## R14

CUANDO el comando de siembra se ejecuta de nuevo sobre una base que ya las
tiene, el sistema NO DEBE crear, duplicar ni modificar ninguna fila (segunda
ejecución: 0 creadas).

## R15

MIENTRAS se asigna/quita categoría o se cambia el `status` de un movimiento, el
sistema NO DEBE modificar ningún otro campo del movimiento (`amount`, `type`,
fechas, `description`, `balanceAfter`, `transferId`, `daySequence`…) ni alterar
el `balance` de su cuenta ni los `totals` de `GET /api/movements`.

---

## Procedencia

- R1 — (humano) «Puedo crear una categoría… sin tocar código ni base de datos a
  mano». Ya implementado en la F8; se conserva como no-regresión.
- R2 — (humano) «…listarlas…». Ya implementado en la F8; no-regresión.
- R3 — (humano) «…cambiarle el nombre a una». Lo único nuevo del punto 1 del
  intent. Que el `kind` sea inmutable es (añadido): renombrar es cambiar la
  etiqueta, no convertir una categoría de gasto en una de ingreso con
  movimientos colgando. ← REVISAR EN APROBACIÓN (va en la hoja, punto ⚙️).
- R4 — (humano) «nombre único y validación» del acceptance, derivado directo del
  índice único ya existente.
- R5 — (humano) «Borrar o cambiar una categoría no borra ningún movimiento».
- R6 — (delegado) El humano dejó abierto «los deja sin categoría o lo impide».
  Decido: **se impide** (409 con el recuento). Perder de golpe la
  categorización manual de cientos de movimientos por un borrado es
  irreversible; impedirlo cuesta quitar la categoría antes, que es explícito.
  Alternativa descartada: dejar los movimientos sin categoría en silencio.
  ← REVISAR EN APROBACIÓN.
- R7 — (humano) «Puedo ponerle una categoría a un movimiento».
- R8 — (humano) «…y quitársela». `categoryId: null` encaja con «"Sin categoría"
  no es una categoría» del intent.
- R9 — (añadido) El humano no dijo qué pasa al cruzar tipos (categoría de
  ingreso sobre un gasto). Propongo rechazarlo: el `kind` existe justo para
  eso, y un cruce solo puede ser un error de dedo. Los `neutral` (importe 0)
  quedan sin categoría. ← REVISAR EN APROBACIÓN.
- R10 — (humano) «Un movimiento que ya he revisado puedo darlo por bueno, y se
  distingue de los que no he mirado». Cierra el cabo suelto 3 del roadmap. La
  distinción ya la da `status` + el filtro `status` de la F36.
- R11 — (humano) Derivado de «validación» del acceptance; mismo trato que el
  resto de la API (`NOT_FOUND` 404).
- R12 — (delegado) Resuelve «si el estado revisado viaja en el mismo sitio que
  la categoría o aparte»: **mismo endpoint**, `PATCH /api/movements/:id` con
  dos campos opcionales y `additionalProperties: false` —que es además lo que
  garantiza técnicamente el «sin tocar ningún otro campo». Alternativa
  descartada: dos endpoints (`/category` y `/status`) — dobla la superficie y
  obliga a dos peticiones en el flujo natural de revisar (categorizo y
  confirmo). ← REVISAR EN APROBACIÓN.
- R13 — (humano) «Al empezar, la lista genérica ya está dada de alta». La lista
  es literal de `_lista_generica_propuesta`.
- R14 — (humano) «sembrada de forma idempotente: sembrarla dos veces no duplica
  nada» (acceptance). El CÓMO es (delegado): **comando manual**
  `pnpm run seed:categories`, ver design §4. ← REVISAR EN APROBACIÓN.
- R15 — (humano) «No quiero que categorizar cambie ningún importe, ningún saldo
  ni la importación».
