# Decisiones — F71 `myinvestor-investment-purchases`

> **Esto es lo único que necesitas leer para aprobar.** Los otros tres archivos
> (`requirements` / `design` / `tasks`) son material del implementer y del reviewer.
> Si algo de aquí no te convence, dilo y se cambia ahí; no hace falta que los abras.

**Qué hace:** al leer las sumas (totales de movimientos, Overview y Expenses by category), un gasto de tu cuenta de MyInvestor que sea una compra de inversión no cuenta, sin marcarlo ni escribir textos, también si el producto es nuevo. **No toca** los depósitos, los ingresos, otros bancos, tus marcas a mano ni la tabla de cuentas propias, y **no escribe nada en la base**: se decide cada vez que se leen las sumas, igual que los depósitos.

**Lo que reconocería hoy (medido sobre los 106 movimientos reales de la cuenta, solo lectura):**

| | Cuántos | Qué son |
|---|---|---|
| Reconocidos como compra | **11** | 2 del ETC de oro (llevan «@ nº de participaciones») y 9 del fondo inmobiliario (no lo llevan) |
| Gastos que siguen como hoy | 54 | 19 aperturas de depósito, 12 suscripción premium, 3 su IVA, 1 retención de la remuneración premium, 17 «Aportacion automatica cartera», 2 «Aportacion a mi cartera» |
| Ingresos (no se miran) | 41 | intereses, «PERIODO…», cancelaciones y vencimientos de depósito, traspasos «INGRESO», remuneración premium |

Las 11 ya tienen tu marca a mano y la tabla de cuentas propias las reconoce, así que **hoy no cambia ninguna suma** (tampoco octubre).

---

## 🔴 Confirma o corrige (5)

| # | Decisión | Alternativa si no te gusta |
|---|---|---|
| 1 | **Es compra todo gasto de MyInvestor cuyo concepto no empiece por uno de los 6 conceptos fijos del banco**: `SUSCRIPCION PREMIUM`, `IVA SUSCRIPCION PREMIUM`, `RET. REMUNERACION PREMIUM`, `APERTURA DEP`, `APORTACION AUTOMATICA CARTERA`, `APORTACION A MI CARTERA` (sin distinguir mayúsculas ni tildes). Coge las 11 y nada más. | Solo los que llevan «@ nº de participaciones»: coge 2 de 11; las compras del fondo (y de cualquier fondo nuevo) seguirían necesitando un texto en la tabla de cuentas propias. |
| 2 | **Las que no llevan «@» (hoy las 9 del fondo) tampoco cuentan, pero salen como «sin certeza»** en la lista de movimientos, para que puedas revisarlas. | Que las «sin certeza» sigan contando como gasto hasta que las marques a mano: más prudente, pero cada compra de un fondo inflaría el mes hasta que te dieras cuenta. |
| 3 | **(lo dejaste sin decidir) Las ventas y reembolsos no se tocan en esta feature**: un ingreso de MyInvestor cuenta como hoy. No hay ninguna venta en la base y sin ver su línea real no se puede escribir la regla. Cuando llegue la primera, otra feature. | Decidir ya que una venta no cuenta como ingreso: habría que suponer cómo escribe el banco la línea, y eso es lo que más retrabajo ha dado. |
| 4 | **No hay forma de deshacerlo desde la app**: si un día la regla se come un gasto de verdad (un pago con la tarjeta de MyInvestor, una transferencia a otra persona; hoy 0 en la base), se arregla añadiendo su concepto a la lista del punto 1 (cambio de código). | Una decisión «sí cuenta» por movimiento, como la de la tabla de cuentas propias: una columna más, un campo más al editar un movimiento y unos 3 requisitos más. |
| 5 | **Nombres a aprobar:** campo `investmentPurchase` en cada movimiento de `GET /api/movements`: `null` si no es compra; `{ "certain": true }` si lleva «@ nº»; `{ "certain": false }` si es compra solo por no ser un concepto fijo. **No abarca** ventas, depósitos, aportaciones a cartera ni otros bancos. En el código, `investmentPurchaseMatchers` y `classifyMyinvestorInvestmentPurchase`. Si los apruebas, van a `docs/vocabulary.md`. | Sin campo: la compra de un producto nuevo saldría en la lista como un gasto normal y no sumaría sin que nada lo explique. |

## ✅ Ya las cerraste tú (4)

- **Una compra de inversión de MyInvestor no cuenta como gasto en ninguna de las tres sumas**, y pasa sola al importar, sin marcar nada ni añadir textos.
- **Vale también para un producto que la aplicación no conoce**, y el movimiento se sigue viendo en la lista con el saldo de la cuenta igual.
- **La suscripción premium y su IVA siguen siendo gasto; los depósitos siguen con su regla.**
- **Ni otros bancos, ni tus marcas a mano, ni los textos de la tabla de cuentas propias se tocan**, y no hay apartado nuevo de «invertido este mes».

## 🧪 Cómo se comprobará que está hecho

| Tu frase de «cómo sé que está bien» | Se comprueba ejecutando |
|---|---|
| La compra del ETC de oro, importada, no suma en Overview ni en Expenses by category sin marcarla | El test que importa un extracto inventado con una compra «@ nº» y mira las tres sumas antes y después |
| Lo mismo con un producto nunca visto, sin texto en la tabla | El test que importa una compra de un fondo inventado con la tabla vacía, y el que comprueba los 6 conceptos fijos |
| La suscripción premium y su IVA siguen contando | El test con suscripción, IVA y retención premium |
| Los depósitos suman igual que hoy | El test con apertura, cancelación y vencimiento, y el de que un ingreso nunca es compra |
| Lo ya marcado y lo que reconoce la tabla sigue sin contar | El test con una compra marcada y otra reconocida por la tabla |
| El gasto de octubre de 2026 en Overview sigue siendo el de hoy | — lo revisa el reviewer a mano: los tests no leen tu base; pide `GET /api/overview?month=2026-10` con la API en marcha y lo compara con la cifra de tu intent |
| (añadido) No escribe nada; sigue en la lista con su campo; solo «@ nº» es con certeza; otros bancos y traspasos emparejados, como hoy; el contrato lo publica; la suite entera pasa | Un test por cada uno, y `pnpm test` |

## ⚙️ Técnicas — decididas, no necesitan tu visto bueno (4)

1. **Orden en las sumas: primero la regla de depósitos, luego la de compras, luego la tabla de cuentas propias.** Una apertura de depósito nunca llega a mirarse como compra.
2. **Las tres sumas preguntan a la misma función**, como desde la F62: no pueden dar cifras distintas.
3. **Un gasto emparejado como traspaso no se toma por compra**, para que el campo no diga «compra» de un traspaso (hoy no hay ninguno en MyInvestor).
4. **«Esconder lo que no cuenta» (F68) no cambia**: una compra sin marcar sigue saliendo en la lista con la casilla puesta, como todo lo que no está marcado ni emparejado.

## 📌 Consecuencias que te tocan a ti (no son código)

- **El texto del intent de esta feature en `feature_list.json` copia una cifra y un concepto de tus movimientos**, y el test de datos reales (`src/no-real-data.test.ts`) falla por ello (lo ejecuté hoy: 4 líneas). Hasta que esas frases se reescriban sin la cifra ni el nombre del producto, `./init.sh` no sale en verde. Es tu texto aprobado: el leader te lo propondrá.
- **Los textos que se añadieron hoy a las filas del ETC de oro y del fondo inmobiliario en la tabla de cuentas propias dejan de hacer falta** para las sumas. Quitarlos o dejarlos es cosa tuya; no cambia nada.
- **Si quieres ver en la app qué compras reconoció la regla y cuáles «sin certeza»**, hace falta una sesión del frontend que lea el campo nuevo cuando el contrato esté publicado.
