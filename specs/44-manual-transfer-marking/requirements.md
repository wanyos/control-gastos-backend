# Requirements — F44 `manual-transfer-marking`

> Derivados del `intent` aprobado el 2026-09-05 (feature 44 de
> `feature_list.json`). EARS estricto. Caso vivo que motiva la feature: dos
> salidas de 500 EUR de Bankinter el 2024-09-12 y una sola entrada en N26 el
> 2024-09-13 — un grupo desigualado que la detección (F40/F41) deja dudoso a
> propósito y que hoy no se puede resolver de ninguna forma.
>
> Vocabulario: «lote igualado» está aprobado (`docs/vocabulario.md`) con su
> significado único; ningún término nuevo se introduce aquí. La columna nueva
> se describe siempre como «la columna que recuerda el enlace deshecho»
> (`Movement.undoneTransferId` en código).

## R1

CUANDO un cliente hace `POST /api/transfers` con `{ "movementIds": [a, b] }`
donde ambos movimientos existen, ninguno tiene `transferId`, sus importes son
iguales, uno es `expense` y el otro `income`, y pertenecen a cuentas
distintas, el sistema DEBE responder `201` con
`{ transferId, movements: [.., ..] }` tras escribir el mismo `transferId`
nuevo (UUID aleatorio) en las dos piernas dentro de una única transacción.

## R2

SI los importes de los dos movimientos difieren ENTONCES el sistema DEBE
responder `400` `VALIDATION_ERROR` con un mensaje que nombra los dos importes.

## R3

SI los tipos de los dos movimientos no son exactamente un `expense` y un
`income` (dos del mismo tipo, o cualquiera `neutral`) ENTONCES el sistema DEBE
responder `400` `VALIDATION_ERROR`.

## R4

SI los dos movimientos pertenecen a la misma cuenta ENTONCES el sistema DEBE
responder `400` `VALIDATION_ERROR`.

## R5

SI alguno de los dos movimientos ya tiene `transferId` ENTONCES el sistema
DEBE responder `409` `CONFLICT` sin escribir nada en ninguna de las dos
piernas.

## R6

SI alguno de los dos ids no corresponde a un movimiento existente ENTONCES el
sistema DEBE responder `404` `NOT_FOUND`.

## R7

SI el body de `POST /api/transfers` no es exactamente `movementIds` con dos
enteros ≥ 1 **distintos** (menos o más elementos, ids repetidos, propiedades
desconocidas, body vacío) ENTONCES el sistema DEBE responder `400`
`VALIDATION_ERROR` (propiedad desconocida vía
`assertOnlyAllowedBodyProperties`, nunca descartada en silencio).

## R8

El sistema NO DEBE rechazar un enlace manual por la distancia entre las
fechas contables de las dos piernas (la ventana de 3 días es de la detección
automática, no del enlace manual). Verificable: dos movimientos compatibles
con 60 días de distancia se enlazan con `201`.

## R9

CUANDO un cliente hace `DELETE /api/transfers/:transferId` y existen
movimientos con ese `transferId`, el sistema DEBE responder `204` tras
escribir, en una única sentencia sobre las dos piernas a la vez,
`transferId = null` y la columna que recuerda el enlace deshecho
(`undoneTransferId`) con el valor que acaban de perder.

## R10

SI el `transferId` de `DELETE /api/transfers/:transferId` no está en ningún
movimiento ENTONCES el sistema DEBE responder `404` `NOT_FOUND`.

## R11

CUANDO la detección de traspasos corre después de un deshecho, el sistema NO
DEBE volver a enlazar entre sí dos movimientos que comparten el mismo valor
no nulo en la columna que recuerda el enlace deshecho — ni como pareja
inequívoca (F40) ni dentro de un lote igualado (F41): un grupo que contiene
una combinación deshecha deja de ser resoluble entero y sale dudoso, como
manda la doctrina de la F41 (decisión 3).

## R12

MIENTRAS un movimiento tiene valor en la columna que recuerda el enlace
deshecho y `transferId` a `null`, el sistema DEBE seguir considerándolo
candidato de la detección para emparejarse con movimientos distintos de su
antigua pareja (la detección sobre lo no vetado no cambia en nada).

## R13

El sistema NO DEBE escribir, al enlazar o al deshacer, ningún campo distinto
de `transferId` (enlace) y de `transferId` + `undoneTransferId` (deshecho), y
NO DEBE crear ni borrar movimientos. Verificable: foto completa de las dos
filas antes/después, solo cambian esos campos (y `updatedAt`, que escribe
Prisma).

## R14

CUANDO dos movimientos quedan enlazados a mano, `GET /api/movements` DEBE
excluirlos de los `totals` del periodo exactamente igual que a una pareja de
la detección (`transferId != null`, sin distinción de quién lo escribió).

---

## Procedencia

- R1 — (humano) Sale de «poder decirle yo a la app que dos movimientos
  concretos son las dos piernas de un traspaso».
- R2 — (humano) Sale de «importe igual» en la compatibilidad exigida.
- R3 — (humano) Sale de «direcciones opuestas».
- R4 — (humano) Sale de «cuentas distintas mías».
- R5 — (delegado) El humano cedió las validaciones exactas; decido que una
  pierna ya enlazada es conflicto (409), no incompatibilidad (400): el remedio
  es deshacer primero, y el código lo distingue. Alternativa descartada:
  re-enlazar en silencio pisando el enlace anterior (dejaría media pareja
  huérfana con `transferId` colgando).
- R6 — (delegado) Validaciones cedidas; id inexistente es 404, como en todo el
  proyecto (ADR-005).
- R7 — (delegado) Validaciones cedidas; mismo patrón estricto que el PATCH de
  la F37 (`src/lib/strict-body.ts`): una propiedad desconocida es 400, nunca
  un 200 que la ignoró.
- R8 — (delegado) El humano cedió si la ventana de 3 días aplica al enlace
  manual. Decido que NO: el enlace manual existe precisamente para lo que la
  detección no puede, y un traspaso que tardó una semana es su caso de uso.
  Alternativa descartada: exigir la ventana (dejaría sin remedio justo los
  casos raros que motivan la feature). ← MARCADO en decisions.md 🔴.
- R9 — (humano) Sale de «poder deshacer una pareja, mía o de la detección».
  Que deshacer una pareja MANUAL también apunte la memoria es (delegado):
  decido que sí, una sola regla uniforme. ← MARCADO en decisions.md 🔴.
- R10 — (delegado) Validaciones cedidas; deshacer lo que no existe es 404.
- R11 — (humano) Sale de «la siguiente pasada de detección NO la rehace».
- R12 — (añadido) El humano no dijo qué pasa con un movimiento deshecho frente
  a TERCEROS movimientos. Propongo: sigue siendo candidato para otros — el
  veto es de la pareja, no del movimiento. ← REVISAR EN APROBACIÓN
  (decisions.md 🔴 #5).
- R13 — (humano) Sale de «solo se escribe el enlace y su memoria de deshecho;
  ningún otro campo cambia; no se borran ni modifican movimientos».
- R14 — (humano) Sale de «desde ese momento quedan fuera de los totales, como
  cualquier pareja de la detección».

Cobertura de `como_se_que_esta_bien`: punto 1 → R1, R14; punto 2 → R9, R11;
punto 3 → R2, R3, R4; punto 4 → R13.
