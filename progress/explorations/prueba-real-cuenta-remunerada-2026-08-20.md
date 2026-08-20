# Prueba real de la F26 — la cuenta remunerada entra en la base

> 🔒 **Ni un dato real en este archivo** (ADR-017): ni importes, ni el nombre que él
> le da a su cuenta, ni fechas suyas. Solo **recuentos y forma**.

**Qué es esto:** el checkpoint **C4 bis** de la F26, la segunda vez que se aplica. La
feature estaba aprobada por el reviewer y commiteada; esto es lo único que le faltaba.
Se hizo con el archivo del humano ya renombrado (corrigió la errata del `name` **antes**
de que se persistiera nada, que era el momento en que salía gratis).

## Estado de partida

4 cuentas · 455 movimientos · **0 productos** · 0 valoraciones · **0 fotos**.

## Pasada 1 — `POST /api/import`, el camino de cada mes

| Comprobación | Resultado |
|---|---|
| Su archivo de producto | **`imported`** — producto **creado** y foto del mes **creada** |
| Movido a `procesados/` | **sí**, y esta vez después de guardarse de verdad |
| Su `.pdf` | `skipped`, sin romper nada |
| Los 5 `.json` de MyInvestor | `skipped`, como estaba decidido: van en la feature hermana |
| Cuentas y movimientos | **4 y 455, sin tocar** |

Comprobado **dentro de la base**, no en la respuesta: el producto guarda su tipo
(`savings_account`, el valor que estrenó la migración), su fecha de apertura y su cierre
vacío; la foto guarda el mes; y **el cuadre de los cinco importes se sostiene en la base
de datos**, comprobado con una consulta que suma las columnas guardadas. Nada se
calculó al guardar: los cinco números están tal y como él los escribió.

## Pasada 2 — la misma foto otra vez, por la vía de la F25

Se reimportó **la misma copia local** con `POST /api/import/local`, que es justo el caso
que la F25 abrió. Resultado:

- producto: **`created: false`** — la misma fila, el mismo id, no una segunda cuenta;
- foto: **`created: false`** — el mismo mes, sobrescrito, no duplicado;
- `movedToProcessed: false` — **no tocó Drive**, como promete esa ruta;
- la base sigue con **1 producto y 1 foto**.

✅ **La idempotencia que el spec prometía se cumple sobre datos reales**, y por la vía
que más miedo daba: la de reimportar.

## Hallazgo — los contadores de la respuesta cuentan movimientos, no productos

En las dos pasadas, el resumen de arriba dice **`importedCount: 0`** mientras el archivo
de abajo dice **`status: "imported"`**. No es un fallo de guardado —el dato entró y está
comprobado en la base—, pero **lo que él lee primero es el contador**, y un mes que ha
entrado bien se lee como «0 importados».

Es de la misma familia que los dos mensajes que ya nos han costado una vuelta cada uno
(la F22 y el motivo falso del `.pdf`): la respuesta dice algo que no es. **Candidato a
feature, no abierto**: que los contadores distingan movimientos de productos, o que
cuenten las dos cosas.

## Lo que sigue igual y ya se sabía

- Los **5 `.json` de MyInvestor** siguen fuera: feature hermana, decidido en la puerta.
- El motivo del `.pdf` de Trade Republic **sigue siendo falso** («no hay parser para el
  banco»): defecto conocido, fuera del alcance de la F26 a propósito.
- **Todavía no hay ninguna vista** que le enseñe esto: escribirlo era esta feature,
  leerlo es otra.
