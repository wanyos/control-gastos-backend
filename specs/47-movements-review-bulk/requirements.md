# Requirements — F47 `movements-review-bulk`

> Notación EARS (ver `docs/specs.md`). Fuente de verdad del QUÉ: el bloque
> `intent` de la feature 47 en `feature_list.json`, aprobado por el humano el
> 2026-09-18.

## R1

CUANDO un cliente hace `GET /api/movements` con `categoryId=<id>` de una
categoría existente, el sistema DEBE devolver únicamente los movimientos cuyo
`categoryId` es ese.

## R2

CUANDO un cliente hace `GET /api/movements` con `uncategorized=true`, el sistema
DEBE devolver únicamente los movimientos cuyo `categoryId` es `null`.

## R3

SI la misma petición lleva `categoryId` y `uncategorized=true` a la vez ENTONCES
el sistema DEBE responder `400 VALIDATION_ERROR` y no devolver ninguna lista.

## R4

SI `categoryId` apunta a una categoría que no existe ENTONCES el sistema DEBE
responder `404 NOT_FOUND`, igual que hace hoy con un `accountId` inexistente.

## R5

CUANDO un cliente hace `GET /api/movements` con `q=<texto>`, el sistema DEBE
devolver únicamente los movimientos cuya `description` contiene ese texto
**ignorando mayúsculas y tildes** (`cafeteria` encuentra `CAFETERÍA`).

## R6

SI `q` contiene los caracteres `%` o `_` ENTONCES el sistema DEBE buscarlos como
caracteres literales de la descripción y NO como comodines.

## R7

El sistema DEBE combinar `categoryId`, `uncategorized` y `q` con los filtros ya
existentes (`accountId`, `from`, `to`, `type`, `status`) y con la paginación, y
DEBE calcular `pagination.total` y `totals` sobre el conjunto filtrado completo,
nunca sobre la página.

## R8

CUANDO un cliente hace `PATCH /api/movements` con `{ ids, categoryId?, status? }`
válidos, el sistema DEBE aplicar esos valores a **todos** los movimientos de
`ids` y responder `200` con el número de movimientos modificados.

## R9

SI alguno de los `ids` no corresponde a un movimiento existente, o `categoryId`
no corresponde a una categoría existente, ENTONCES el sistema DEBE responder
`404 NOT_FOUND` y NO DEBE modificar ningún movimiento.

## R10

SI alguno de los movimientos de `ids` es `neutral` y se le manda categoría, o el
`kind` de la categoría no coincide con su `type`, ENTONCES el sistema DEBE
responder `400 VALIDATION_ERROR` y NO DEBE modificar ningún movimiento.

## R11

SI `ids` está vacío, contiene identificadores repetidos o contiene más de **200**
elementos ENTONCES el sistema DEBE responder `400 VALIDATION_ERROR` y NO DEBE
modificar ningún movimiento.

## R12

SI el cuerpo de `PATCH /api/movements` lleva una propiedad distinta de `ids`,
`categoryId` y `status`, o no lleva ni `categoryId` ni `status`, ENTONCES el
sistema DEBE responder `400 VALIDATION_ERROR` y NO DEBE modificar ningún
movimiento.

## R13

`PATCH /api/movements` NO DEBE modificar ningún campo de un movimiento distinto
de `categoryId` y `status`.

## R14

CUANDO se inserta un movimiento o cambia su `description`, el sistema DEBE
derivar su texto de búsqueda (minúsculas y sin tildes) sin que ningún código de
la aplicación lo escriba ni lo mantenga.

## R15

El sistema DEBE documentar en `docs/api-contract.md` los parámetros
`categoryId`, `uncategorized` y `q` de `GET /api/movements`, y el endpoint
`PATCH /api/movements` con su cuerpo, su respuesta y sus errores.

---

## Procedencia

- **R1** — (humano) «Pido `GET /api/movements` con una categoría y solo vienen
  los movimientos de esa categoría.»
- **R2** — (humano) «Pido `GET /api/movements` con la opción de "sin categoría" y
  solo vienen los que no tienen.» La **forma** de pedirlo es delegada:
  `delego_en_agente` #1. Decido `uncategorized=true` (booleano aparte) en vez de
  `categoryId=none`, porque `categoryId` se queda como entero puro en el esquema
  y no hace falta un tipo unión entero-o-palabra en AJV.
- **R3** — (añadido) El humano no dijo qué pasa si se piden las dos cosas a la
  vez. Propongo fallar en vez de que una gane en silencio. ← REVISAR EN APROBACIÓN.
- **R4** — (añadido) El humano no dijo qué pasa con una categoría inexistente.
  Propongo 404, por simetría con `accountId` (contrato actual de
  `GET /api/movements`). La alternativa sería 200 con lista vacía, que esconde un
  error del cliente. ← REVISAR EN APROBACIÓN.
- **R5** — (humano) «Busco un texto y vienen los movimientos cuya descripción lo
  contiene, sin importar mayúsculas ni tildes si es viable.» El **nombre** del
  parámetro es delegado (`delego_en_agente` #2): decido `q`, el nombre propuesto
  en el traspaso. La viabilidad de las tildes se comprobó ejecutándola contra el
  PostgreSQL 17 del proyecto (ver `design.md` §3): **es viable**.
- **R6** — (añadido) El humano no habló de comodines. `contains` de Prisma emite
  un `LIKE '%…%'` **sin escapar** `%` ni `_`, así que buscar `100%` devolvería
  cualquier cosa. Propongo escaparlos. ← REVISAR EN APROBACIÓN.
- **R7** — (humano) «Los filtros nuevos se combinan con los que ya existen
  (cuenta, fechas, tipo, estado) y con la paginación, y los totals salen de lo
  filtrado.»
- **R8** — (humano) «Mando varios movimientos marcados con un estado y/o una
  categoría y quedan todos cambiados en una sola petición.»
- **R9** — (humano) «Si uno de ellos no cumple las reglas del PATCH individual
  (…, no existe), no cambia ninguno.»
- **R10** — (humano) «Si uno de ellos no cumple las reglas del PATCH individual
  (la categoría no casa con su tipo, es neutral), no cambia ninguno.»
- **R11** — (delegado) El humano cedió «el tope de movimientos por petición en
  bloque» (`delego_en_agente` #3). Decido **200**, el mismo `pageSize` máximo de
  `GET /api/movements`: el tope de la operación coincide con lo máximo que una
  página puede enseñar, así que «marcar todo lo de esta página» siempre cabe en
  una petición. Lo de vacío y repetidos es **(añadido)**: sin ello, `ids: []`
  sería un 200 que no hace nada y un id repetido haría que el `updated` de la
  respuesta no cuadrara con lo que el cliente mandó.
- **R12** — (añadido) El humano no lo pidió; lo exige la coherencia con
  `PATCH /api/movements/:id`, que ya rechaza una propiedad desconocida en vez de
  ignorarla (`src/lib/strict-body.ts`).
- **R13** — (humano) `que_no_quiero`: «No quiero poder editar importe, fecha ni
  descripción de un movimiento.»
- **R14** — (delegado) Resuelve la viabilidad de ignorar tildes
  (`delego_en_agente` #2) sin añadir dependencias: columna generada por
  PostgreSQL. Alternativa descartada en `design.md` §3.
- **R15** — (humano) «`docs/api-contract.md` describe los parámetros, respuestas
  y errores nuevos, para que el frontend construya contra él.»

### Cobertura de `como_se_que_esta_bien`

| Punto del intent | Requirements |
| --- | --- |
| Filtro por categoría | R1 |
| «Sin categoría» | R2 |
| Búsqueda por texto sin mayúsculas ni tildes | R5, R6, R14 |
| Se combinan con los filtros y la paginación; totals de lo filtrado | R7 |
| Varios movimientos en una sola petición | R8 |
| Si uno no cumple las reglas, no cambia ninguno | R9, R10 |
| `api-contract.md` actualizado | R15 |
