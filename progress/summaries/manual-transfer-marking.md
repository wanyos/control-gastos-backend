# Resumen — feature 44 `manual-transfer-marking`

Fecha de cierre: 2026-09-06
Intención original: `feature_list.json` → feature `manual-transfer-marking`, bloque `intent`
Spec (SDD): `specs/44-manual-transfer-marking/`

## Qué hace ahora la app que antes no

Ahora puedes decirle tú a la app que dos movimientos concretos son las dos
piernas de un traspaso (cuando la detección automática no puede saberlo), y
puedes deshacer una pareja —tuya o de la detección— de forma que la siguiente
pasada NO la rehaga. Antes un grupo dudoso como el de las 2×500 de Bankinter se
quedaba sin remedio para siempre, y un enlace equivocado de la detección no se
podía corregir de ninguna forma.

Lleva la primera migración de base de datos desde la feature 9: la columna
`Movement.undoneTransferId`, que recuerda el enlace que se deshizo para que la
detección no vuelva a juntar a esa pareja.

## Por dónde se usa (puntos de entrada)

- `POST /api/transfers` con `{ "movementIds": [a, b] }` — enlaza las dos
  piernas. `201` con `{ transferId, movements }`. Compatibilidad obligatoria
  (importe igual, un gasto y un ingreso, cuentas distintas); la ventana de
  3 días NO se exige: tú mandas aunque las fechas estén lejos.
- `DELETE /api/transfers/:transferId` — deshace la pareja. `204` sin cuerpo;
  apunta la memoria del deshecho en las dos piernas.

Sin pantalla todavía: son llamadas HTTP a mano (el frontend llegará después).

## Dónde está el código (para revisión directa)

### Puntos de entrada

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Las dos rutas HTTP (POST y DELETE) | `transfersRoutes` | [transfers.routes.ts:24](../../src/modules/transfers/transfers.routes.ts#L24) |
| Registro bajo `/api/transfers` | `app.register(transfersRoutes, …)` | [app.ts:92](../../src/app.ts#L92) |

### Lógica del enlace manual y del deshecho

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Enlaza: validaciones (R6→R5→R3→R4→R2), UUID del servidor, transacción con guarda de carrera | `linkTransfer` | [transfers.service.ts:290](../../src/modules/transfers/transfers.service.ts#L290) |
| Deshace: un solo `updateMany` que borra el enlace y escribe la memoria en las dos piernas | `unlinkTransfer` | [transfers.service.ts:373](../../src/modules/transfers/transfers.service.ts#L373) |
| El veto: dos movimientos con la MISMA memoria no nula son la pareja deshecha | `isUndonePair` | [transfers.service.ts:44](../../src/modules/transfers/transfers.service.ts#L44) |
| El veto aplicado como condición de arista y de resolubilidad del lote igualado | `pairTransferCandidates` | [transfers.service.ts:89](../../src/modules/transfers/transfers.service.ts#L89) |
| El select de la detección lee la columna nueva | `detectTransfers` | [transfers.service.ts:218](../../src/modules/transfers/transfers.service.ts#L218) |

### Superficie HTTP (schemas y tipos)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Body estricto: exactamente `movementIds` con dos enteros ≥ 1; allow-list derivada del schema | `linkTransferSchema`, `linkTransferBodyProperties`, `unlinkTransferSchema` | [transfers.schema.ts](../../src/modules/transfers/transfers.schema.ts) |
| Tipos del enlace manual y la columna en el candidato de la detección | `LinkTransferBody`, `LinkTransferResult`, `TransferIdParams`, `TransferCandidate.undoneTransferId` | [transfers.types.ts](../../src/modules/transfers/transfers.types.ts) |

### Migración

| Qué hace | Código |
| --- | --- |
| Columna `undoneTransferId String?` en `model Movement` | [schema.prisma:128](../../prisma/schema.prisma#L128) |
| `ALTER TABLE "Movement" ADD COLUMN "undoneTransferId" TEXT;` (solo eso) | [migration.sql](../../prisma/migrations/20260905163246_movement_undone_transfer_id/migration.sql) |

### Tests (27 nuevos)

| Qué cubre | Código |
| --- | --- |
| El veto en el emparejamiento puro: pareja vetada, tercero compatible, memorias distintas, grupo dudoso entero (4 tests) | [transfers.service.test.ts:869](../../src/modules/transfers/transfers.service.test.ts#L869) |
| `linkTransfer`/`unlinkTransfer` con base de datos: los rechazos uno a uno, las fotos de fila entera de R13, el ciclo deshecho→detección (14 tests) | [transfers.service.test.ts:937](../../src/modules/transfers/transfers.service.test.ts#L937) |
| La superficie HTTP: 201/400/404/409/204 y los totales de `GET /api/movements` (9 tests) | [transfers.routes.test.ts:12](../../src/modules/transfers/transfers.routes.test.ts#L12) |

### Documentación y encaje

| Qué cambia | Código |
| --- | --- |
| Los dos endpoints con sus tablas de errores; el bloque de traspasos reescrito | [api-contract.md:642](../../docs/api-contract.md#L642) |
| La columna nueva en el ER, en el schema copiado y su semántica en §Traspasos | [data-model.md:375](../../docs/data-model.md#L375) |
| Los tres archivos nuevos del módulo en la lista de esperados | [architecture.test.ts](../../src/architecture.test.ts) |
| Comentario de cabecera («no transfer endpoint» ya no era exacto) | [movements.routes.ts](../../src/modules/movements/movements.routes.ts) |

## Cumplimiento de la intención

- ✅ «Puedo enlazar a mano dos movimientos como traspaso y desde ese momento
  quedan fuera de los totales» → se cumple; verificado en
  `src/modules/transfers/transfers.routes.test.ts:75` (el 201 escribe las dos
  piernas) y `:208` (los totales de `GET /api/movements` los excluyen igual
  que a una pareja de la detección).
- ✅ «Puedo deshacer una pareja y la siguiente pasada de detección NO la
  rehace» → se cumple; verificado en
  `src/modules/transfers/transfers.service.test.ts:1213` (detecta, deshace,
  re-pasa: 0 parejas; y un tercero compatible sí se empareja).
- ✅ «La app no me deja enlazar cualquier cosa: importe igual, direcciones
  opuestas, cuentas distintas» → se cumple; verificado en
  `src/modules/transfers/transfers.service.test.ts:1018` (importes, con los
  dos en el mensaje), `:1041` y `:1052` (tipos, incluido `neutral`), `:1063`
  (misma cuenta).
- ✅ «Ningún otro campo de los movimientos cambia, igual que en la detección»
  → se cumple; verificado con foto de fila entera antes/después en
  `src/modules/transfers/transfers.service.test.ts:1133` (enlace) y `:1182`
  (deshecho); nada se crea ni se borra.

## Decisiones que se tomaron por ti

Las 5 marcadas 🔴 en `decisions.md` las confirmaste el 2026-09-05. Las
delegadas/añadidas, para tenerlas presentes:

- (delegado) Una pierna ya enlazada es **409** (deshaz esa pareja primero), no
  400: `linkTransfer`, `src/modules/transfers/transfers.service.ts:310`.
- (delegado) El enlace manual **no exige la ventana de 3 días** (decisión 🔴 #2
  confirmada): no hay ninguna comprobación de fechas en `linkTransfer`.
- (delegado) Deshacer una pareja **manual** también apunta la memoria (🔴 #4
  confirmada): una sola regla en `unlinkTransfer`.
- (añadido, 🔴 #5 confirmada) Un movimiento con pareja deshecha **sigue siendo
  candidato** para emparejarse con otros: el veto es de la pareja
  (`isUndonePair`), no del movimiento.
- (detalle del implementer, dentro del spec) Volver a enlazar **a mano** una
  pareja que tú mismo deshiciste es legítimo: la memoria solo veta a la
  detección automática (test en `transfers.service.test.ts:1113`).

## Qué NO se tocó / quedó fuera

- La detección de F40/F41 sobre lo no deshecho: ventana, orden del lote
  igualado, transacción por pareja, informe — idénticos (suites sin cambios).
- `computeTotals` no se tocó: ya excluía por `transferId != null` sin mirar
  quién lo escribió.
- La columna de la memoria **no se expone** en la API: si el frontend la
  necesita algún día, se añade entonces.
- Cada movimiento recuerda solo su **último** deshecho (límite asumido en
  decisions.md #3; si algún día muerde, se migra a una tabla de deshechos).
- Sin pantalla: el frontend llegará en su propia feature, contra
  `docs/api-contract.md`.

## Notas para el futuro

- **Te toca a ti** (de decisions.md §Consecuencias): resolver el caso vivo —
  busca los ids con `GET /api/movements` y llama a `POST /api/transfers` con
  la entrada de N26 y **una** de las dos salidas de Bankinter. La otra salida
  seguirá contando como gasto (correcto: no tiene pierna espejo) y el grupo
  dejará de salir dudoso.
