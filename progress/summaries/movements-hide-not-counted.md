# Resumen — feature 68 `movements-hide-not-counted`

Fecha de cierre: 2026-11-06
Intención original: `feature_list.json` → feature `movements-hide-not-counted`, bloque `intent`
Spec: `specs/68-movements-hide-not-counted/`

## Qué hace ahora la app que antes no

La lista de movimientos (`GET /api/movements`) acepta `hideNotCounted=true`: deja
fuera lo marcado como que no cuenta y lo emparejado como traspaso, **salvo los
movimientos de depósito que suman algo** (un vencimiento con su interés), que siguen
en la lista. Los totales del mes son los mismos con y sin el parámetro. Antes, la
casilla del frontend que esconde lo que no cuenta usaba `excluded=none&transfer=none`
y escondía también un vencimiento marcado o emparejado aunque su interés sí suma.

## Por dónde se toca (puntos de entrada)

| Cómo se usa | Código |
| --- | --- |
| `GET /api/movements?hideNotCounted=true` — la ruta | [movements.routes.ts:106](../../src/modules/movements/movements.routes.ts#L106) |
| El parámetro en el esquema de la ruta (otro valor → 400) | [movements.schema.ts:40](../../src/modules/movements/movements.schema.ts#L40) |
| Lee los movimientos de depósito y monta la consulta | [movements.service.ts:299](../../src/modules/movements/movements.service.ts#L299) |
| La condición que esconde | [movements.service.ts:216](../../src/modules/movements/movements.service.ts#L216) |
| El contrato para el frontend | [api-contract.md:1177](../../docs/api-contract.md#L1177) |

## Dónde está el código

### El parámetro

| Qué hace | Dónde |
| --- | --- |
| Declara `hideNotCounted` como booleano en la consulta | [movements.schema.ts](../../src/modules/movements/movements.schema.ts) → `listMovementsSchema` |
| Tipo del parámetro | [movements.types.ts](../../src/modules/movements/movements.types.ts) → `MovementListQuery.hideNotCounted` |

### Lo que esconde

| Qué hace | Dónde |
| --- | --- |
| Lee qué suma cada movimiento de depósito, con toda la historia y no solo el mes pedido, antes de construir la consulta | [movements.service.ts](../../src/modules/movements/movements.service.ts) → `listMovements` (usa `readDepositMovements` de `investments.service.ts`, sin cambios) |
| Añade la condición en `where.AND`: fuera lo marcado o emparejado, salvo los ids de depósito que suman algo. Los totales (`computeTotals`) no cambian | [movements.service.ts](../../src/modules/movements/movements.service.ts) → `movementListWhere` |

### Documentación

| Qué hace | Dónde |
| --- | --- |
| Párrafo «Desde la feature 68», fila del parámetro, nota de `totals`, `#### Esconder lo que no cuenta` (cómo contar lo escondido: misma petición sin el parámetro con `pageSize=1` y restar los dos `pagination.total`) y fila 400 | [api-contract.md](../../docs/api-contract.md) → §`GET /api/movements` |
| Fila de `GET /api/movements` | [README.md](../../README.md) → tabla de endpoints |
| Término aprobado | [vocabulary.md](../../docs/vocabulary.md) → `hideNotCounted` |

### Tests

| Qué cubre | Dónde |
| --- | --- |
| R1-R11, contra la base de tests por HTTP, 13 tests | [movements.hide-not-counted.test.ts](../../src/modules/movements/movements.hide-not-counted.test.ts) → `keeps a marked maturity…`, `keeps a paired maturity…`, `hides a normal movement…`, `hides a doubtful maturity…`, `hides a deposit opening or cancellation…`, `hides a maturity whose interest is exactly zero…`, `keeps everything that is neither marked nor paired`, `keeps a maturity whose opening is before the requested range`, `gives the same totals…`, `what it shows plus what it hides…`, `hideNotCounted=false or absent does not filter`, `rejects a hideNotCounted…`, `combines hideNotCounted with excluded, transfer and ownership` |
| R13: el contrato describe el parámetro y cómo contar lo escondido | [movements.hide-not-counted.docs.test.ts](../../src/modules/movements/movements.hide-not-counted.docs.test.ts) → `the contract describes hideNotCounted and how to count what it hides` |

## Cumplimiento de la intención

Resultados reales de `./init.sh --checks 68` del 2026-11-06 (9 de 9 en verde):

- ✅ «Un vencimiento de depósito con capital, marcado como que no cuenta, sale con el
  filtro y su interés está en los totales» → `keeps a marked maturity with interest and counts its interest`. Check ✅.
- ✅ «Lo mismo si está emparejado como traspaso» → `keeps a paired maturity with interest and counts its interest`. Check ✅.
- ✅ «Un movimiento normal marcado o emparejado no sale» → `hides a normal movement that is marked or paired`. Check ✅.
- ✅ «Un vencimiento dudoso (suma 0) marcado o emparejado no sale» → `hides a doubtful maturity that is marked or paired`. Check ✅.
- ✅ «Una apertura o cancelación de depósito (suman 0) marcada o emparejada no sale» → `hides a deposit opening or cancellation that is marked or paired`. Check ✅.
- ✅ «Los totales del mes con el filtro son exactamente los mismos que sin él» → `gives the same totals with and without hideNotCounted`. Check ✅.
- ✅ «Lo que se ve con el filtro más lo que esconde son todos los movimientos del mes» → `what it shows plus what it hides is every movement of the month`. Check ✅.
- ✅ (añadido) El contrato publica el parámetro y cómo contar lo escondido → `the contract describes hideNotCounted and how to count what it hides`. Check ✅.
- ✅ (añadido) Lo que ya funciona sigue igual → `pnpm test` entero: 95 archivos, 1535 tests en verde. Check ✅.

## Decisiones que se tomaron por ti

Todas aprobadas en `decisions.md` sin cambios:

- (delegado) El nombre y la forma: `hideNotCounted`, booleano como `uncategorized`; `false` o sin él no filtra; otro valor → 400.
- (delegado) El criterio es «suma algo» (lo que cuenta el movimiento de depósito distinto de 0), no «es un vencimiento con capital».
- (delegado) El número de escondidos se pide como hasta ahora: segunda petición sin el parámetro y restar los dos `pagination.total`; sin campo nuevo en la respuesta.
- (añadido) Un vencimiento con interés exactamente 0, marcado o emparejado, también se esconde.
- (añadido) Lo que no está marcado ni emparejado sale siempre, aunque no sume (dinero entre tus cuentas, `neutral`, aperturas sin marcar).
- (añadido) Si la apertura cae antes del rango pedido, el vencimiento se reconoce igual (se lee toda la historia, como en la F57).
- (añadido) Se combina con `excluded`, `transfer` y `ownership`: se cumplen todos a la vez.

## Qué NO se tocó / quedó fuera

- Lo que suma cada movimiento y los totales: `computeTotals` y `readDepositMovements` sin cambios.
- `excluded`, `transfer` y `ownership` funcionan igual que antes.
- El frontend: cambia su casilla en su propia sesión, contra el contrato publicado.

## Notas para el futuro

- El implementer sugirió añadir una frase de la F68 al comentario de `movements.routes.ts`; no estaba en el lote y no se tocó.
