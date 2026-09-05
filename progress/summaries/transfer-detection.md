# Resumen — feature 40 `transfer-detection`

Fecha de cierre: 2026-09-03
Intención original: `feature_list.json` → feature `transfer-detection`, bloque `intent`
Spec: `specs/40-transfer-detection/`

## Qué hace ahora la app que antes no

Después de cada importación, la app cruza sola todos los movimientos sin marcar,
encuentra las dos piernas del mismo traspaso entre dos cuentas tuyas (mismo
importe, direcciones opuestas, cuentas distintas, fechas a 3 días o menos) y les
escribe el mismo `transferId` — solo cuando la pareja es inequívoca. Desde ese
momento ese dinero deja de contar como gasto y como ingreso en los `totals` de
`GET /api/movements`. Los casos dudosos no se emparejan y salen listados en el
informe de la importación; un Bizum o una transferencia a un tercero ni se marca
ni se lista. Antes la columna `transferId` existía pero nadie la escribía y los
traspasos inflaban los totales.

## Por dónde se usa (puntos de entrada)

No hay endpoint propio: la detección corre sola al final de las dos vías de
importación y su resultado viaja en el campo `transfers` del informe.

- `POST /api/import` — llamada tras el bucle de archivos: [import.service.ts:432](../../src/modules/import/import.service.ts#L432)
- `POST /api/import/local` — mismo punto: [import.local.service.ts:126](../../src/modules/import/import.local.service.ts#L126)
- La función de entrada, si algún día hace falta bajo demanda: `detectTransfers` en [transfers.service.ts:148](../../src/modules/transfers/transfers.service.ts#L148)

## Dónde está el código (para revisión directa)

### La detección (módulo nuevo `src/modules/transfers/`)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Tipos del emparejamiento y del informe | `TransferCandidate`, `AmbiguousTransferGroup`, `TransferDetectionResult` | [transfers.types.ts](../../src/modules/transfers/transfers.types.ts) |
| Ventana de fechas (decisión 1: 3 días naturales, una línea) | `transferDateWindowDays` | [transfers.service.ts](../../src/modules/transfers/transfers.service.ts) |
| Emparejado puro: solo parejas con unicidad mutua; el resto, grupo dudoso | `pairTransferCandidates` | [transfers.service.ts](../../src/modules/transfers/transfers.service.ts) |
| Lee candidatos, empareja y escribe cada pareja (un `transferId` nuevo por pareja, las dos piernas en una transacción); nunca lanza | `detectTransfers` | [transfers.service.ts:148](../../src/modules/transfers/transfers.service.ts#L148) |
| Saneado del fallo para el informe (mismo patrón que el importador) | `describeDetectionError` | [transfers.service.ts](../../src/modules/transfers/transfers.service.ts) |

### El disparo y el informe (módulo `import/`)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Campo `transfers` en los dos informes | `ImportRunResult`, `LocalImportRunResult` | [import.types.ts](../../src/modules/import/import.types.ts) |
| Llamada tras el bucle de archivos (vía Drive) | `importPending` | [import.service.ts:432](../../src/modules/import/import.service.ts#L432) |
| Llamada tras el bucle de archivos (vía copias locales) | `importLocalCopies` | [import.local.service.ts:126](../../src/modules/import/import.local.service.ts#L126) |
| Nota de por qué NO hay esquema de respuesta que ampliar | comentario de cabecera | [import.schema.ts](../../src/modules/import/import.schema.ts) |
| Los 3 archivos nuevos en la lista cerrada de `src/` | `architecture invariants` | [architecture.test.ts](../../src/architecture.test.ts) |

### Tests

| Qué cubre | Código |
| --- | --- |
| 7 unitarios del emparejado puro (pareja limpia, borde de la ventana, Bizum fuera, ambiguo reportado, misma cuenta, mismo tipo, limpio+enredado a la vez) | [transfers.service.test.ts](../../src/modules/transfers/transfers.service.test.ts) |
| 7 contra la base de datos y fakes: `transferId` único por pareja, idempotencia fila a fila, pierna tardía, fila entera intacta (ancla incluida), transacción que se salta la pareja entera, dos fallos saneados | [transfers.service.test.ts](../../src/modules/transfers/transfers.service.test.ts) |
| Por HTTP, vía Drive: pierna importada emparejada con su espejo guardado, informe con `pairsCreated` | [import.routes.test.ts](../../src/modules/import/import.routes.test.ts) |
| Por HTTP, vía local: emparejado + reimportar no cambia nada; ambiguo listado sin emparejar; fallo de la detección dentro del 200 con la importación intacta | [import.local.routes.test.ts](../../src/modules/import/import.local.routes.test.ts) |
| De punta a punta: la detección marca y los `totals` de la F36 excluyen las dos piernas | [movements.test.ts](../../src/modules/movements/movements.test.ts) |

### Documentación actualizada

| Qué | Dónde |
| --- | --- |
| Campo `transfers` en los informes de las dos rutas, con tabla de campos; notas de `Movement.transferId` y de traspasos reescritas | [docs/api-contract.md](../../docs/api-contract.md) |
| `transferId` tachado de la tabla de columnas sin escritor; §Traspasos dice quién lo escribe y con qué regla | [docs/data-model.md](../../docs/data-model.md) |

## Cumplimiento de la intención

- ✅ «Después de importar, un traspaso entre dos cuentas mías queda con sus dos
  piernas enlazadas, sin que yo escriba nada» → tests de R1 en
  `import.routes.test.ts` (Drive) e `import.local.routes.test.ts` (local).
- ✅ «Una transferencia a una cuenta que NO es mía sigue contando como gasto, y
  un Bizum también» → test de R4 en `transfers.service.test.ts` (ni se marca ni
  se lista) y el `lonely` del test de R3 (queda con `transferId` null).
- ✅ «Los totales de la feature 36 dejan fuera las dos piernas» → test de R12 en
  `movements.test.ts` (detección → `totals`, de punta a punta). El resumen de la
  F38 no existe todavía: cuando se haga, heredará la exclusión porque lee la
  misma marca.
- ✅ «Reimportar los mismos archivos no duplica marcas ni cambia parejas ya
  hechas» → test de R8 en `transfers.service.test.ts` (fila a fila) y la
  reimportación por HTTP en `import.local.routes.test.ts`.
- ✅ «Si la segunda pierna llega semanas después, el emparejamiento la encuentra
  en la siguiente pasada» → test de R9 en `transfers.service.test.ts`.
- ✅ «Ningún dato del movimiento cambia» → test de R10 en
  `transfers.service.test.ts`: compara la fila entera (menos `transferId` y
  `updatedAt`, que avanza solo por el `@updatedAt` de Prisma) y las cuentas
  enteras, ancla incluida.

Todo ejecutado en verde el 2026-09-03: `./init.sh` completo (54 archivos,
1060 tests) — detalle en `progress/reviews/transfer-detection.md`.

## Decisiones que se tomaron por ti

- (delegado) **Cuándo corre**: al final de cada importación, las dos vías, sin
  endpoint propio. Para lo ya guardado: una llamada a `POST /api/import/local`.
- (delegado) **Ventana de fechas: 3 días naturales**; es una constante de una
  línea (`transferDateWindowDays`).
- (delegado) **Con más de un candidato, nadie se empareja** (unicidad mutua
  estricta); los dudosos salen en el informe.
- (añadido) Cada pareja recibe un `transferId` **nuevo y único** (dos traspasos
  nunca comparten enlace).
- (añadido) Las dos piernas se escriben **juntas o ninguna** (una transacción
  por pareja): nunca queda medio traspaso marcado.
- (añadido) **Si la detección falla, la importación no se pierde**: los
  movimientos quedan guardados y el fallo viaja saneado en `transfers.error`,
  con el mismo 200.
- (añadido) Contador `pairsCreated` en el informe de cada pasada.

## Qué NO se tocó / quedó fuera

- **Cero migración**: `prisma/schema.prisma` intacto, ninguna migración nueva
  (la columna y su índice existen desde la F8).
- Ni el ancla, ni ningún saldo, ni el dedup de la importación: la detección
  escribe únicamente `transferId`.
- **Deshacer una pareja** queda fuera (decisión 4 de decisions.md): necesita
  memoria («estos dos no») → columna nueva → migración → feature propia.
- No hay endpoint dedicado para lanzar la detección a mano (decisión 3);
  `detectTransfers` queda expuesto como función por si algún día hace falta.

## Notas para el futuro

- **Te toca a ti** (de decisions.md §Consecuencias): tras desplegar, lanza una
  vez `POST /api/import/local` sin cuerpo para emparejar lo ya guardado
  (~36 parejas medidas el 2026-09-02), y mira la sección `ambiguous` del informe
  de esa primera pasada — lo que salga ahí queda sin marcar a propósito.
- Si algún día se añade un esquema de respuesta de Fastify al informe del
  importador, tendrá que declarar el informe entero, `transfers` incluido (hoy
  no hay ninguno y por eso nada se recorta).
