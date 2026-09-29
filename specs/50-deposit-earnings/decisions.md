# Decisiones — F50 `deposit-earnings`

> **Esto es lo único que necesitas leer para aprobar.** Los otros tres archivos
> (`requirements` / `design` / `tasks`) son material del implementer y del reviewer.
> Si algo de aquí no te convence, dilo y se cambia ahí; no hace falta que los abras.

**Qué hace:** una consulta nueva de solo lectura que lista cada depósito que tienes con su `.json` y, si ya venció, cuánto te generó: el importe con que venció en tu extracto de MyInvestor menos el `principal` de su `.json`; y el total de todos. **No toca** el saldo de ninguna cuenta, el importe ni la marca de la F49 de ningún movimiento, la vista mensual de inversiones ni el frontend. No hace falta migración.

---

## 🔴 Confirma o corrige (5)

| # | Decisión (mía, salvo que diga lo contrario) | Alternativa si no te gusta |
|---|---|---|
| 1 | **Dónde se ve: en una consulta propia, `GET /api/investments/deposits`**, con todos tus depósitos con `.json` (vivos y vencidos, de cualquier fecha) y el total de siempre. | Dentro de la vista mensual de inversiones (F39): esa vista es por mes y quita lo cerrado antes del mes, así que un depósito vencido en agosto ya no saldría en septiembre y el total sería de un mes. |
| 2 | **Cada vencimiento de tu extracto (`INTERESES DEP.`) se asocia al `.json` cuyo `maturityDate` es el día en que ese vencimiento aparece en el extracto.** No tienes que hacer nada a mano. Lo he mirado en tu base: tu depósito con `.json` ya vencido encaja el día exacto, y los 10 vencimientos antiguos cuya apertura está en tu base caen el día exacto, uno o tres meses después de la apertura. | Asociarlos tú a mano: una petición por depósito diciendo «este movimiento es el vencimiento de este `.json`». Aguanta cualquier fecha, pero es trabajo tuyo con cada depósito. |
| 3 | **Si ese día no aparece ningún vencimiento, o aparecen dos, el depósito sale sin cifra** y con el motivo («no encontrado» o «dudoso», con los movimientos a la vista). No suma al total. Nunca se elige uno ni se pone cero. | Buscar también uno o dos días alrededor: atraparía un vencimiento apuntado un día tarde (en tus extractos no ha pasado nunca), a cambio de poder coger el de otro depósito que vence al lado. |
| 4 | **Un depósito con `.json` que cancelas antes de vencer (`CANCELACION DEP`) lo dices tú poniendo en su `.json` `closedAt` con el día de la cancelación.** Sale como «cancelado», sin cifra, y no suma. Las cancelaciones que hay hoy en tus extractos son de depósitos abiertos y cancelados el mismo día, sin `.json`: no salen. | Buscar el `CANCELACION DEP` de ese día y dar importe − principal. En tus extractos la cancelación devuelve justo el principal, así que daría 0,00 casi siempre. |
| 5 | **Nombres propuestos** (salen en la API; apruébalos o cámbialos): la ruta `/api/investments/deposits`; `earned` (lo que generó); `total`; `status` con `active` (vivo), `matured` (vencido y con cifra), `cancelled`, `maturity_not_found`, `ambiguous` (dudoso), `below_principal` (ver ⚙️ 4); `maturity` (el movimiento del vencimiento). | Otros nombres; solo cambia cómo se llaman. |

## ✅ Ya las cerraste tú (5)

- **El principal sale de tus `.json` de depósito**, como el resto de productos.
- **Los depósitos antiguos no tendrán `.json`**: sus vencimientos no salen, no dan cifra y no dan error. Lo que generaron ya está en el saldo.
- **Nada se deduce por el número del concepto**: se repite entre depósitos.
- **No cambia el saldo de ninguna cuenta ni el importe de ningún movimiento.**
- **No se toca cómo la F49 saca movimientos de las sumas.**

## ⚙️ Técnicas — decididas, no necesitan tu visto bueno (6)

1. **Se calcula cada vez que se pide y no se guarda nada.** La asociación no se escribe en la base, así que si corriges el `maturityDate` de un `.json`, la siguiente consulta ya sale bien. `productId` sigue sin usarse.
2. **Un depósito vivo sale sin cifra**, aunque ya sepamos lo que se espera que genere (`expectedGain` se enseña, no se suma).
3. **Da igual que el vencimiento esté marcado o no con la marca de la F49**: se encuentra igual. Hoy los 29 movimientos de depósito de MyInvestor están marcados (consulta a tu base del 2026-09-28).
4. **Si el vencimiento asociado trae menos que el principal, no hay cifra** y se enseña el movimiento: en un depósito eso solo puede ser una asociación equivocada.
5. **Saber qué descripción es un vencimiento es cosa del código de MyInvestor**, no del de inversiones (regla que ya existe en [`architecture.test.ts:488`](../../src/architecture.test.ts#L488)).
   ⚠️ *Efecto:* si MyInvestor cambia el texto `INTERESES DEP`, tus depósitos vencidos saldrán «no encontrado», nunca con una cifra falsa.
6. **«Hoy» es la fecha del día en UTC**, como en patrimonio neto. Un depósito que vence hoy y cuyo extracto aún no has importado sale «no encontrado» hasta que lo importes.

## 📌 Consecuencias que te tocan a ti (no son código)

- **Nada nuevo en los `.json` de los depósitos que ya escribes.** El `maturityDate` tiene que ser el día del vencimiento, que ya lo es.
- **Si cancelas antes de tiempo un depósito que tiene `.json`**, vuelve a subir su `.json` con `closedAt` = el día de la cancelación (🔴 4). Si no, a partir de su `maturityDate` saldrá «no encontrado».
- **La parte del frontend** va en su propia sesión, contra `docs/api-contract.md`.
- **Para verlo en real:** con los datos de hoy, el depósito ya vencido debería salir con cifra y los otros dos como vivos. Esa prueba solo lee.

## ⚠️ Incoherencias conocidas que se heredan

- **Lo que generan los depósitos sigue sin entrar en ninguna suma de ingresos** (sus vencimientos están marcados) **ni en la ganancia del mes de la vista de inversiones** (F39): solo se ve en esta consulta nueva. Juntarlo con esas sumas sería otra feature.
