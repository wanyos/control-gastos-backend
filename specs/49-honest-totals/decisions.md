# Decisiones — F49 `honest-totals`

> **Esto es lo único que necesitas leer para aprobar.** Los otros tres archivos
> (`requirements` / `design` / `tasks`) son material del implementer y del reviewer.
> Si algo de aquí no te convence, dilo y se cambia ahí; no hace falta que los abras.

**Qué hace:** permite marcar un movimiento como que no cuenta en las sumas de ingreso y gasto (y quitar la marca), filtrar el listado por «con traspaso» / «sin traspaso» y por «marcado» / «sin marcar», ver las parejas de traspaso para deshacer las falsas, y pedir en cualquier momento los traspasos dudosos. **No toca** el saldo de ninguna cuenta ni cómo se calcula, no permite editar importe, fecha ni descripción, no cambia la detección de traspasos y no toca el frontend. Lo que generó cada depósito va en la F50.

---

## 🔴 Confirma o corrige (5)

| # | Decisión | Alternativa si no te gusta |
|---|---|---|
| 1 | **La marca es una columna nueva de sí/no en el movimiento, `excludedFromTotals`** (nombre propuesto, apruébalo o cámbialo: sale en la base y en la API). Todos los movimientos de hoy nacen sin marcar. | Dar escritor al `productId` que ya existe: obliga a que cada movimiento marcado apunte a un producto de inversión. Hoy hay 3 depósitos dados de alta de unos 12, y un movimiento que no va a ningún producto no se podría marcar nunca. |
| 2 | **Se marca de uno en uno y en bloque**, con los dos `PATCH` que ya existen (el de la F47 admite hasta 200 ids y es todo o nada). | Solo de uno en uno: 29 peticiones para los depósitos. Solo en bloque: la web tendría que mandar una lista de un elemento para corregir uno. |
| 3 | **La marca y el traspaso no se tocan entre sí.** Se puede marcar una pierna de un traspaso; emparejar un movimiento marcado está permitido y la marca sigue; deshacer una pareja no quita la marca: si una pierna estaba marcada, sigue fuera de las sumas. | Prohibir marcar una pierna (error) y que deshacer una pareja quite la marca de sus piernas: más reglas y un borrado automático que no pediste. |
| 4 | **El filtro se pide con `transfer=only`** (solo emparejados) **o `transfer=none`** (solo sin emparejar); sin el parámetro, todos como hoy. Nombre propuesto. | `hasTransfer=true/false`: igual de útil. Es solo el nombre. |
| 5 | **Las parejas se ven en un endpoint propio, `GET /api/transfers`**, cada una con su `transferId` y sus dos piernas juntas, de la más reciente a la más antigua, **sin paginar** (hoy hay 40). | Solo el filtro `transfer=only`: ningún endpoint nuevo, pero las dos piernas de una pareja pueden caer en páginas distintas y la web tendría que juntarlas. |

## ✅ Ya las cerraste tú (6)

- **Filtro por la marca en el listado:** `excluded=only` (solo marcados) / `excluded=none` (solo sin marcar), combinable con todo lo demás, como el de traspasos.
- **Corte en dos features:** ver cuánto generó cada depósito va en la F50, no aquí.
- **Los traspasos dudosos se calculan al pedirlos, no se guardan.** Se piden con `GET /api/transfers/ambiguous` (ruta propuesta; reutiliza `ambiguous`, el nombre que ya tiene en el informe de importación). Salen con la misma forma que en ese informe, y ya al día si has emparejado o deshecho algo a mano.
- **Deshacer una pareja sigue siendo el `DELETE /api/transfers/:transferId` que ya existe**; al deshacerla, las dos piernas vuelven a sumar.
- **Una categoría no decide si algo suma**: la suma sigue sin mirar la categoría.
- **El saldo no cambia**: la marca solo saca el movimiento de las sumas de ingreso y gasto.

## ⚙️ Técnicas — decididas, no necesitan tu visto bueno (5)

1. **Las sumas de `GET /api/movements` y de `GET /api/overview` siguen saliendo de la misma función** ([`computeTotals`](../../src/modules/movements/movements.service.ts#L456)), con una exclusión más: no pueden dar cifras distintas.
2. **Un valor de la marca que no sea exactamente `true` o `false` es un error**, también `null` o `"true"`. Así una petición mal hecha no puede desmarcar en silencio.
3. **Pedir los traspasos dudosos no escribe nada**, aunque encontrara alguna pareja que se pudiera emparejar. Eso sigue haciéndolo solo la detección, después de cada importación.
4. **`productId` se queda como está** (sin escritor, y sigue excluyendo de las sumas), por si la F50 lo necesita.
5. **Tamaño: 16 requirements**, uno por encima del tope de ~15. Es por el filtro por la marca, que elegiste tú; el resto no crece.

## 📌 Consecuencias que te tocan a ti (no son código)

- Al desplegar hay que aplicar la migración nueva (`prisma migrate deploy`). **No hay que rellenar nada a mano.**
- **Decisión tuya (2026-09-27, «no quiero perderlos»): hasta la F50 marcas solo las aperturas (`APERTURA DEP`) y las cancelaciones (`CANCELACION DEP`), no los vencimientos (`INTERESES DEP`).** Es una acción tuya, no código: el backend deja marcar cualquiera. Cuando llegue la F50, decides si marcas los vencimientos.
- **Marcar esos movimientos de depósito lo haces tú** (o la web cuando exista la parte 3): una petición al `PATCH /api/movements` en bloque con sus ids. Los encuentras buscando por texto (`APERTURA DEP`, `CANCELACION DEP`) en la cuenta de myinvestor.
- **Deshacer las dos multas lo haces tú**, con `DELETE /api/transfers/:transferId`. Hoy (consulta del 2026-09-27) sus `transferId` son `d1fe7ae2-616e-4334-93cf-0bcf72ac980d` (33339/24377) y `c287af95-ea6e-47c0-9d84-5f213d679d2b` (33108/24441). También salen en `GET /api/transfers`.
- Probar esto contra la base real **escribe** en tus movimientos.
- Cuando cierre, la parte 1 de `../docs/handoff-sumas-honestas.md` queda hecha salvo lo del depósito (F50), y la parte 2 del frontend se puede abrir en su propia sesión.

## ⚠️ Incoherencias conocidas que se heredan

- **Hasta la F50, los intereses de un vencimiento marcado dejan de verse en las sumas.** El vencimiento (`INTERESES DEP.`) trae principal e intereses juntos. Al marcarlo sale entero, y lo que generó el depósito no se ve en ningún sitio hasta la F50. El movimiento no cambia: no se pierde nada, pero no se ve. Hoy afecta a los 11 vencimientos cuya apertura está en la base, más los del «depósito E», cuya apertura no está. Por eso decidiste no marcarlos hasta la F50 (ver 📌). Mientras tanto, los vencimientos siguen sumando enteros como ingreso, principal incluido.
- **Los traspasos a cuentas no dadas de alta** (ING, Trade Republic, Criptan) siguen sumando: no tienen pareja posible. Según `../docs/handoff-sumas-honestas.md` son 16; yo no lo he comprobado. Si quieres sacarlos, se marcan a mano con esta misma marca.

## 🔄 Cambios desde tu última lectura (2026-09-27)

- Filtro por la marca `excluded=only|none` añadido — requirements R16 (nuevo) y R11, design §4, tasks T6/T10/T17 — elegiste la alternativa del 🔴 6.
- Tamaño 15 → 16 requirements — ⚙️ 5 — por ese filtro.
- Anotada tu decisión de marcar solo aperturas y cancelaciones hasta la F50 — 📌 y ⚠️ — «no quiero perderlos».
- Nombres `excludedFromTotals`, `transfer`, `excluded` y las dos rutas de traspasos, aprobados — cabecera de requirements y design — ya no están pendientes.
