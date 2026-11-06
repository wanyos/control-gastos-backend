# Decisiones — F68 `movements-hide-not-counted`

> **Esto es lo único que necesitas leer para aprobar.** Los otros tres archivos
> (`requirements` / `design` / `tasks`) son material del implementer y del reviewer.
> Si algo de aquí no te convence, dilo y se cambia ahí; no hace falta que los abras.

**Qué hace:** un parámetro nuevo de `GET /api/movements` que esconde lo marcado como que no cuenta y lo emparejado como traspaso, **salvo** los movimientos de depósito que suman algo (hoy, solo un vencimiento con su interés), que siguen en la lista y en los totales. **No toca** lo que suma cada movimiento, ni los totales sin el parámetro, ni `excluded`, `transfer` u `ownership`. Ni el frontend: él cambia su casilla en su propia sesión.

**La frase de los totales iguales es cierta en todos los casos.** Lo comprobé ejecutando la función que suma ([`computeTotals`](../../src/modules/movements/movements.service.ts#L698)) sobre 720 combinaciones, también con dinero entre tus cuentas (`own`/`mine`) y con aportaciones a producto: nada de lo que se esconde suma. Y confirma el fallo de hoy: con la casilla actual falta el interés de un vencimiento marcado o emparejado.

---

## ✅ Aprobado por el humano el 2026-11-06

Los cinco puntos siguientes, aprobados tal cual («me parece bien como está redactada»).

### Puntos que estaban por confirmar (5)

| # | Decisión | Alternativa si no te gusta |
|---|---|---|
| 1 | **(del frontend, a confirmar) Un vencimiento dudoso, una apertura y una cancelación de depósito marcados o emparejados se siguen escondiendo**: suman 0. | Que todo movimiento de depósito salga siempre: verías esas filas con la casilla puesta, aunque sumen 0. |
| 2 | **(mía) El número de escondidos se saca como hoy**: el frontend pide el mismo mes sin el parámetro y resta los dos totales de movimientos. Lo visible más lo escondido da todo el mes. El backend no cambia la respuesta. | Que la respuesta traiga ya el número de escondidos: ahorra una petición, pero cambia la respuesta de todas las consultas. |
| 3 | **(mía, nombre a aprobar) `hideNotCounted=true`**, y `false` o sin él no esconde nada (como `uncategorized`). Abarca: lo marcado y lo emparejado, salvo el depósito que suma. **No abarca** lo de la fila 4, aunque tampoco sume. Si lo apruebas, va a `docs/vocabulary.md`. | `hideMarkedAndPaired=true`: dice mejor qué esconde, pero calla la excepción del depósito. |
| 4 | **(mía) Lo que no está marcado ni emparejado sale siempre, aunque no sume**: dinero entre tus cuentas, importes 0, aperturas sin marcar. Es lo que pasa hoy; el frontend ya los quita él en la pantalla. | Que el parámetro esconda todo lo que no suma: el frontend dejaría de quitarlos él, pero la feature crece y el frontend cambia más. |
| 5 | **(mía) Combinado con `excluded`, `transfer` u `ownership` se cumplen los dos a la vez**, sin error. Ej.: con `excluded=only`, solo los vencimientos marcados que suman. | Responder con error si se combina con `excluded` o `transfer`: más estricto, pero ninguna combinación de esta consulta da error hoy. |

## ✅ Ya las cerraste tú (4)

- **Se resuelve en el backend**, con un parámetro de la consulta, no pidiendo dos veces y mezclando en el navegador.
- **Un vencimiento con su interés, marcado o emparejado, sale y su interés está en los totales.**
- **Un movimiento normal marcado o emparejado no sale.**
- **`excluded` y `transfer` siguen como hoy**, y los totales sin el parámetro no cambian.

## 🧪 Cómo se comprobará que está hecho

| Tu frase de «cómo sé que está bien» | Se comprueba ejecutando |
|---|---|
| Vencimiento con capital marcado: sale y su interés suma | El test que lo marca y mira la lista y los totales |
| Lo mismo si está emparejado | El mismo test con el vencimiento emparejado (y uno con las dos cosas) |
| Un movimiento normal marcado o emparejado no sale | El test con un gasto marcado y un ingreso emparejado |
| Vencimiento dudoso marcado o emparejado no sale | El test con un vencimiento sin capital posible |
| Apertura o cancelación marcada o emparejada no sale | El test con una de cada |
| Totales iguales con y sin el filtro | El test de un mes con todos los casos (también dinero entre tus cuentas marcado): mismos totales con y sin el parámetro |
| Lo que se ve más lo escondido es todo el mes | El test que resta los dos totales de movimientos, como hace el frontend |
| (añadido) El contrato lo publica | El test que lee `docs/api-contract.md` |
| (añadido) Lo de siempre sigue igual | `pnpm test` entero |

## ⚙️ Técnicas — decididas, no necesitan tu visto bueno (3)

1. **«Suma algo» es literal: un vencimiento con interés exactamente 0, marcado o emparejado, también se esconde**, como los demás que suman 0.
2. **Si un vencimiento suma se decide con toda la historia de su cuenta**, no con el mes pedido: uno de octubre cuya apertura es de septiembre sale aunque pidas solo octubre.
3. **El filtro va dentro de la misma consulta** que la lista, el recuento y los totales, así los tres ven lo mismo.

## 📌 Consecuencias que te tocan a ti (no son código)

- **La sesión del frontend** cambia su casilla para mandar el parámetro nuevo (en lugar de `excluded=none&transfer=none`) cuando el contrato esté publicado.

## ⚠️ Incoherencias conocidas que se heredan

- **El número de escondidos que da el backend no incluye lo que el frontend quita él en la pantalla** (fila 4); el frontend ya lo suma aparte. Es así hoy y no cambia.
