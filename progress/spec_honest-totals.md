# F49 `honest-totals` — bloqueada antes de redactar el spec

**Motivo:** `blocked: la feature no cabe` (regla 2 de `docs/specs.md`). No se ha
escrito ningún archivo en `specs/49-honest-totals/` ni se ha tocado
`feature_list.json` (sigue `pending`).

## El corte que propongo

- **Se queda en F49:** la marca de «este movimiento no cuenta» (uno a uno y en bloque, visible en cada movimiento, fuera de las sumas de `GET /api/movements` y de `GET /api/overview`), el filtro de traspaso en `GET /api/movements`, el listado de parejas con su `transferId`, comprobar que al deshacer una pareja las dos piernas vuelven a sumar, poder pedir los traspasos dudosos después de la importación, y `docs/api-contract.md`. Estimación: ~13 requirements.
- **Se va a una feature nueva:** ver cuánto generó cada depósito (el importe del vencimiento por encima del principal) en la vista de inversiones. Estimación: 4-6 requirements más trabajo manual tuyo.
- **Por qué esa frontera:** lo primero es todo módulo de movimientos y traspasos y sale con los datos que ya hay; lo segundo toca el módulo de inversiones y **necesita que decidas de dónde sale el principal de cada depósito**, porque hoy la base no lo tiene para casi ninguno (ver abajo). Juntas son ~18-19 requirements.

Nota sobre los traspasos dudosos: el leader proponía cortarlos a ellos. No lo propongo porque, si se piden **calculándolos en el momento** en vez de guardarlos, cuestan unos 2 requirements (ver abajo). El corte que de verdad baja el tamaño es el de los depósitos.

## Lo que he comprobado (y cómo)

1. **La vista de inversiones de la F39 NO da lo que generó un depósito.** Leído en `src/modules/investments/investments.service.ts:420-426` y `:686-693`: para un `deposit` solo devuelve sus cuatro condiciones (`principal`, `interestRate`, `expectedGain`, `maturityDate`). No lee ningún movimiento ni calcula nada realizado. Hace falta algo nuevo.
2. **Casi ningún depósito tiene producto dado de alta.** Consulta de solo lectura a la base real (`docker exec gastos-postgres psql … select … from "InvestmentProduct"`): hay **3** productos `deposit` (ids 12758, 12759, 13032, todos de julio-septiembre de 2026). Los movimientos de depósito de myinvestor son **29** y corresponden a unos **12 números de depósito** distintos desde agosto de 2025. Ninguno tiene `productId` (misma consulta sobre `"Movement"`).
3. **El vencimiento llega con la descripción `INTERESES DEP.: <número>`**, no con otra palabra: p. ej. el movimiento 33650, `INTERESES DEP.: <número>` del «depósito A», cuya apertura es el 33664, `APERTURA DEP.: <número>`.
4. **El número de la descripción no identifica un solo depósito.** Mismas consultas:
   - «depósito B»: dos aperturas el mismo día, de importes distintos, y dos vencimientos en meses distintos.
   - «depósito C» y «depósito D»: apertura, `CANCELACION DEP` y otra apertura del mismo importe el mismo día o el siguiente.
   - «depósito E»: hay vencimiento pero no hay apertura en la base.
   Por eso calcular lo generado emparejando por el número de la descripción da resultados falsos (p. ej. «depósito C» saldría con una ganancia negativa porque uno de sus depósitos sigue vivo).
5. **Los traspasos dudosos se pueden calcular en cualquier momento sin guardarlos.** Leído en `src/modules/transfers/transfers.service.ts:218-274`: la detección lee **toda** la tabla de movimientos sin emparejar en cada pasada, no solo lo recién importado. Así que el listado de dudosos de la última importación es exactamente lo que `pairTransferCandidates` (función pura, `:89-198`) devuelve si se la llama ahora sobre la misma tabla. Si desde entonces emparejaste o deshiciste algo a mano, el cálculo en el momento sale **más al día** que una copia guardada.
6. **`productId` no tiene escritor**: el importador escribe `productId: null` (`src/modules/import/import.service.ts:126`) y nada más lo escribe (búsqueda de `productId` en `src/` fuera de tests y de `src/generated/`).

## Lo que tendrás que decidir cuando se escriba la feature nueva (no ahora)

De dónde sale el principal de cada depósito, con estas opciones vistas en los datos:

- **(a)** Escribir un archivo de producto por cada depósito antiguo (unos 9-11 archivos a mano) y enlazar cada vencimiento a su producto: lo generado = importe del vencimiento − `principal`. Es lo que ya prevé el modelo, pero es trabajo manual tuyo.
- **(b)** Que al marcar un vencimiento como que no cuenta le digas el principal a mano (un número por vencimiento, unos 12). Implica una columna nueva cuyo nombre tendrías que aprobar.
- **(c)** Deducirlo de la descripción emparejando por número: descartado por lo del punto 4.

## Consecuencia mientras no esté la feature nueva

Si con la F49 marcas los vencimientos (`INTERESES DEP.`) como que no cuentan, sus intereses (los de los 11 vencimientos cuya apertura está en la base, emparejados a mano sobre la consulta del punto 2; más los de «depósito E», cuya apertura no está) **dejan de verse en las sumas** hasta que exista la feature nueva. El dato no se pierde (el movimiento no cambia), pero no se ve. Si no lo quieres ni temporalmente, marca solo las aperturas hasta entonces, o se hacen las dos features seguidas.

## Qué necesito para seguir

Que el humano apruebe (o cambie) el corte. Con eso, el leader crea la feature nueva en `feature_list.json` (con su `intent`) y vuelve a lanzar al spec-author sobre la F49 recortada. En esa F49 recortada irá como decisión a confirmar que los traspasos dudosos se **calculan al pedirlos** en vez de **guardarse**, porque el `intent` dice «quedan guardados».

## Resuelto (2026-09-27)

El humano aprobó el corte y que los traspasos dudosos se calculen al pedirlos. La F50 `deposit-earnings` recoge lo del depósito. El spec de la F49 recortada está en `specs/49-honest-totals/`. Este archivo queda solo como registro.
