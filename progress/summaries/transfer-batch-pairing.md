# Resumen — feature 41 `transfer-batch-pairing`

Fecha de cierre: 2026-09-03
Intención original: `feature_list.json` → feature `transfer-batch-pairing`, bloque `intent`
Spec: `specs/41-transfer-batch-pairing/`

## Qué hace ahora la app que antes no

La detección de traspasos que corre al final de cada importación ya no se rinde
ante los grupos con varias transferencias idénticas: cuando un grupo dudoso
tiene el mismo número de salidas que de entradas y cada salida podría casar con
cada entrada (cuentas distintas y ≤ 3 días entre sí, para todas las
combinaciones), lo empareja por orden de fecha en vez de dejarlo en el informe.
Tus tres grupos reales del 2026-09-03 (3×1000, el cruce de 1000 hacia dos
bancos, 2×3000 en días consecutivos) se resolverán solos en la próxima pasada;
el de 2×500 con una sola entrada seguirá saliendo dudoso, a propósito.

## Por dónde se usa (puntos de entrada)

No hay endpoint nuevo: la regla corre dentro de la detección existente, al final
de `POST /api/import` y de `POST /api/import/local`.

- [`detectTransfers` — transfers.service.ts:190](../../src/modules/transfers/transfers.service.ts#L190) — la pasada completa (leer candidatos, emparejar, escribir).
- [`pairTransferCandidates` — transfers.service.ts:67](../../src/modules/transfers/transfers.service.ts#L67) — la lógica pura de emparejamiento, donde vive el cambio.

## Dónde está el código (para revisión directa)

### La regla nueva

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Resuelve la componente si nº salidas = nº entradas y toda combinación es válida; si no, entera a `ambiguous` | dentro de `pairTransferCandidates` | [transfers.service.ts:129](../../src/modules/transfers/transfers.service.ts#L129) |
| Orden de emparejamiento: fecha → posición dentro del día (null como 0) → id | `byPairingOrder` | [transfers.service.ts:43](../../src/modules/transfers/transfers.service.ts#L43) |
| El candidato lleva ahora su posición dentro del día | `TransferCandidate.daySequence` | [transfers.types.ts:19](../../src/modules/transfers/transfers.types.ts#L19) |
| El `select` de la detección lee `daySequence` | dentro de `detectTransfers` | [transfers.service.ts:202](../../src/modules/transfers/transfers.service.ts#L202) |

### Tests (todos en el mismo archivo)

| Qué cubre | Código |
| --- | --- |
| 3×1000 mismo día → 3 pares en el orden del extracto (R1, R2, R9) | [transfers.service.test.ts:157](../../src/modules/transfers/transfers.service.test.ts#L157) |
| Cruce de 1000 hacia dos bancos → 2 pares (R1, R9) | [transfers.service.test.ts:215](../../src/modules/transfers/transfers.service.test.ts#L215) |
| 2×3000 días consecutivos → cada día con el suyo (R1, R2, R9) | [transfers.service.test.ts:259](../../src/modules/transfers/transfers.service.test.ts#L259) |
| 2 salidas de 500 y 1 entrada → dudoso entero, sin emparejar a nadie (R3) | [transfers.service.test.ts:296](../../src/modules/transfers/transfers.service.test.ts#L296) |
| Números iguales pero encadenado por la ventana → dudoso entero (R4) | [transfers.service.test.ts:326](../../src/modules/transfers/transfers.service.test.ts#L326) |
| Empates del mismo día: `daySequence` ausente cuenta como 0, luego decide el id (R2) | [transfers.service.test.ts:363](../../src/modules/transfers/transfers.service.test.ts#L363) |
| Contra la base de datos: idempotencia, pareja pre-escrita intacta, solo cambia `transferId` (R6, R7) | [transfers.service.test.ts:593](../../src/modules/transfers/transfers.service.test.ts#L593) |
| Una transacción por par y par pisado se salta entero (R8) | [transfers.service.test.ts:693](../../src/modules/transfers/transfers.service.test.ts#L693) |

### Docs actualizados (R10)

| Qué | Dónde |
| --- | --- |
| La regla de emparejamiento deja de decir «solo parejas inequívocas» | [api-contract.md](../../docs/api-contract.md) (nota de traspasos de la importación y fila `ambiguous` del campo `transfers`) |
| Misma corrección en el modelo de datos | [data-model.md](../../docs/data-model.md) (tabla de columnas reservadas y §Traspasos) |

## Cumplimiento de la intención

- ✅ «Los tres grupos que aprobé quedan emparejados sin que yo escriba nada» →
  se cumple; los tres fixtures que calcan su estructura (con datos inventados)
  pasan: tests de las líneas 157, 215 y 259 del archivo de tests.
- ✅ «El grupo del punto 4 sigue dudoso: no se inventa pareja» → se cumple;
  test de la línea 296 (0 pares, grupo entero en el informe).
- ✅ «Todo lo que la F40 ya emparejaba se sigue emparejando igual; ninguna
  pareja ya hecha cambia» → se cumple; los 14 tests de la F40 pasan sin tocar
  ninguna expectativa, y el test de la línea 593 siembra una pareja ya escrita
  que sale intacta.
- ✅ «Correr la pasada dos veces deja exactamente las mismas parejas» → se
  cumple; segunda pasada del test de la línea 593: 0 pares nuevos y filas
  idénticas byte a byte.
- ✅ «Ningún otro campo de ningún movimiento cambia» → se cumple; el mismo test
  compara la fila entera antes y después, salvo `transferId` y `updatedAt`.

## Decisiones que se tomaron por ti

- (delegado) **El orden al emparejar**: fecha contable, luego la posición dentro
  del día que trae el extracto (`daySequence`, ausente cuenta como 0), luego el
  id. Vive en [`byPairingOrder`](../../src/modules/transfers/transfers.service.ts#L43).
- (delegado) **La separación por pareja de cuentas no fue necesaria como paso
  aparte**: entre grupos ya la hace la agrupación de la F40, y el cruce del
  punto 2 se resuelve porque tus dos salidas son indistinguibles y cualquier
  combinación es válida (decisión 🔴 2 que aprobaste; design §4 lo argumenta).
- (añadido) **Un grupo con números iguales pero encadenado por la ventana**
  (alguna combinación a más de 3 días) sigue dudoso entero: emparejar ahí sería
  adivinar (decisión 🔴 3 que aprobaste).

## Qué NO se tocó / quedó fuera

- Ni el esquema de la base de datos, ni migraciones, ni archivos nuevos de
  producción: todo el cambio vive en el módulo de traspasos existente.
- La ventana de 3 días, la transacción por pareja, la forma del informe y el
  camino de las parejas inequívocas de la F40 quedan como estaban.
- El marcado manual de traspasos sigue aplazado (tu decisión del 2026-09-03):
  el grupo de 2×500 saldrá dudoso en cada informe hasta que exista.
- La propuesta de vocabulario de `decisions.md` (decisión 4) sigue **sin
  respuesta**: en código, docs e informes el concepto se describe literalmente.

## Notas para el futuro (opcional)

- Te toca a ti: lanzar una vez `POST /api/import/local` (sin cuerpo) para que
  esa pasada empareje tus tres grupos (6 parejas nuevas); los totales bajarán
  en consecuencia.
- Cosmético, anotado por el implementer: el encabezado del archivo de tests
  sigue diciendo solo «Feature 40», y el test de transacciones de la F41 vive en
  el bloque «database» aunque usa un cliente falso.
