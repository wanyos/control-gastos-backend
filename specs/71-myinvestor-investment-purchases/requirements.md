# Requirements — F71 `myinvestor-investment-purchases`

> Fuente de verdad: el `intent` de la feature 71 en `feature_list.json`, aprobado
> por el humano sin cambios el 2026-11-10. Hoja del humano: `decisions.md`.
>
> **Datos reales.** Ningún archivo de este spec ni de la implementación copia un
> concepto de compra, un importe ni un id de la base del humano: los fixtures se
> inventan (`docs/conventions.md` §Tests, `src/no-real-data.test.ts`).

## Vocabulario de este documento

- **Cuenta de MyInvestor:** fila de `Account` con `bank = 'myinvestor'`.
- **Las tres sumas:** `totals` de `GET /api/movements`, `period.totals` de
  `GET /api/overview` y lo que `GET /api/expenses-by-category` cuenta como gasto.
  Hoy salen las tres de `computeTotals` / `isCountedExpense`
  (`src/modules/movements/movements.service.ts`).
- **Conceptos conocidos que no son compra** (la lista cerrada de R1): los que
  empiezan, una vez quitados los espacios iniciales y sin distinguir mayúsculas ni
  tildes, por `SUSCRIPCION PREMIUM`, `IVA SUSCRIPCION PREMIUM`,
  `RET. REMUNERACION PREMIUM`, `APERTURA DEP`, `APORTACION AUTOMATICA CARTERA` o
  `APORTACION A MI CARTERA`.
- **Participaciones en el concepto:** el concepto acaba en `@`, espacios opcionales
  y un número (entero o con decimales, con punto o coma), con espacios opcionales al
  final. Ej. inventado: `ETC INVENTADO METAL @ 3`.

## R1
El sistema DEBE reconocer como compra de inversión todo movimiento de `type`
`expense` de una cuenta de MyInvestor, sin `transferId`, cuyo concepto no empiece
por ninguno de los conceptos conocidos que no son compra.

## R2
MIENTRAS un movimiento esté reconocido como compra de inversión (R1), el sistema NO
DEBE sumar su `amount` en el `expense` de ninguna de las tres sumas.

## R3
CUANDO se importa un extracto de MyInvestor con una compra de inversión, el sistema
DEBE dejarla fuera de las tres sumas aunque no tenga `excludedFromTotals`, aunque
la tabla de cuentas propias no tenga ningún texto que case con su concepto y
aunque no exista ningún producto de inversión con ese nombre.

## R4
CUANDO el sistema reconoce una compra de inversión, NO DEBE escribir nada en la
base: ni `excludedFromTotals`, ni `ownershipDecision`, ni textos de la tabla de
cuentas propias, ni `amount`, `type` o `balanceAfter` del movimiento, ni el saldo
de la cuenta.

## R5
El sistema DEBE seguir listando la compra de inversión en `GET /api/movements` con
el `amount` y el `type` que trajo el banco.

## R6
El sistema DEBE seguir sumando como `expense`, en las tres sumas, un movimiento de
una cuenta de MyInvestor cuyo concepto empiece por `SUSCRIPCION PREMIUM`,
`IVA SUSCRIPCION PREMIUM` o `RET. REMUNERACION PREMIUM` y que no esté marcado,
emparejado ni reconocido como propio.

## R7
El sistema DEBE sumar cada movimiento de depósito (apertura, cancelación y
vencimiento de la feature 57) exactamente lo que suma hoy por su regla, en las
tres sumas.

## R8
MIENTRAS una compra de inversión tenga `excludedFromTotals: true` o su `ownership`
diga `own` o `mine`, el sistema DEBE seguir dejándola fuera de las tres sumas y
devolver esa marca y ese `ownership` sin cambios.

## R9
El sistema DEBE devolver en cada movimiento de `GET /api/movements` el campo
`investmentPurchase`: `null` si el movimiento no está reconocido como compra de
inversión (R1), y un objeto `{ "certain": <boolean> }` si lo está.

## R10
El sistema DEBE devolver `investmentPurchase.certain` a `true` si el concepto lleva
participaciones en el concepto, y a `false` en cualquier otro caso reconocido.

## R11
SI un movimiento de una cuenta de otro banco lleva un concepto que en MyInvestor se
reconocería como compra ENTONCES el sistema DEBE devolverlo con
`investmentPurchase: null` y sumarlo como lo suma hoy.

## R12
SI un movimiento de una cuenta de MyInvestor es de `type` `income` (incluida una
posible venta o reembolso de una inversión) ENTONCES el sistema DEBE devolverlo con
`investmentPurchase: null` y sumarlo como lo suma hoy.

## R13
SI un movimiento de `type` `expense` de una cuenta de MyInvestor tiene `transferId`
ENTONCES el sistema DEBE devolverlo con `investmentPurchase: null`.

## R14
El sistema DEBE describir en `docs/api-contract.md` el campo `investmentPurchase`
de `GET /api/movements`, la lista de conceptos conocidos que no son compra y que
una compra reconocida no suma en ninguna de las tres sumas.

---

## Cobertura de `como_se_que_esta_bien`

| Frase del intent (abreviada) | Requirements |
|---|---|
| La compra del ETC de oro, importada, no suma en Overview ni en Expenses by category sin marcarla | R1, R2, R3, R10 |
| Lo mismo con un producto nunca visto, sin texto en la tabla de cuentas propias | R1, R2, R3 |
| La suscripción premium y su IVA siguen contando como gasto | R6 |
| Intereses, aperturas, cancelaciones y vencimientos de depósitos suman igual que hoy | R7, R12 |
| Lo ya marcado a mano y lo que ya reconoce la tabla sigue sin contar | R8, R4 |
| El gasto de octubre de 2026 en Overview sigue siendo el de hoy | R2, R6, R7, R8 (sin test posible: medida con la API en marcha, ver `design.md` §6) |

## Procedencia

- R1 — (delegado) El humano cedió «cómo reconocer una compra». Decido: todo gasto
  de una cuenta de MyInvestor cuyo concepto **no** sea uno de los conceptos fijos
  del banco que hay en la base (lista cerrada). Medido sobre los 106 movimientos
  reales: reconoce las 11 compras y ningún otro. Alternativa descartada: reconocer
  solo los conceptos con participaciones (`@ n`), que coge 2 de 11 (las 9 del fondo
  no llevan `@`) y no cumple «un producto nuevo» si es un fondo. Otra descartada:
  casar con los archivos de producto, cuyos `name` los escribe el humano y no se
  parecen al concepto. La exclusión de lo que tiene `transferId` es (añadido),
  ver R13. ← REVISAR EN APROBACIÓN (punto 1 de la hoja).
- R2 — (humano) «no cuenta como gasto en ningún sitio: ni en los totales de
  movimientos, ni en Overview, ni en Expenses by category». Que tampoco cuente la
  reconocida sin certeza (`certain: false`) es (delegado), punto 2 de la hoja.
- R3 — (humano) «Tiene que pasar sola, al importar, sin que yo marque nada a mano
  ni añada un texto para cada producto» + (leader, aprobado) «una inversión que la
  aplicación todavía no conozca».
- R4 — (humano, vía intent del leader aprobado) «el saldo de la cuenta no cambia» y
  «Que se borren o cambien las marcas a mano ni los textos» (`que_no_quiero`).
- R5 — (humano, vía intent del leader aprobado) «El movimiento se sigue viendo en la
  lista de movimientos».
- R6 — (humano, vía intent del leader aprobado) «La suscripción premium de
  MyInvestor y su IVA siguen contando como gasto». Incluir la retención de la
  remuneración premium es (delegado): es el otro concepto fijo de gasto del banco
  que hay en la base, y el leader dijo que cuenta como gasto hoy.
- R7 — (humano, vía intent del leader aprobado) «Los intereses, las aperturas,
  cancelaciones y vencimientos de depósitos suman igual que hoy» y «Que cambie cómo
  se tratan los depósitos».
- R8 — (humano, vía intent del leader aprobado) «Las compras que ya estaban marcadas
  a mano, y las que ya reconoce la tabla de cuentas propias, siguen sin contar».
- R9 — (añadido) Un campo nuevo en la respuesta. El humano pidió «que me lo marque»
  para lo no claro (`delego_en_agente`); sin el campo, una compra de un producto
  nuevo saldría en la lista sin marca, sin `ownership` y sin `deposit`, como un
  gasto normal, y no sumaría sin que nada lo explique. Nombre a aprobar (punto 5).
  ← REVISAR EN APROBACIÓN.
- R10 — (delegado) «Qué pasa con un movimiento que podría ser una compra pero no
  está claro». Decido: es «seguro» solo si lleva participaciones en el concepto
  (`@ n`, la forma de una compra en bolsa); el resto de reconocidos va con
  `certain: false`. ← REVISAR EN APROBACIÓN (punto 2).
- R11 — (humano, vía intent del leader aprobado) «Que se toquen otros bancos».
- R12 — (delegado, pendiente del humano) El intent deja SIN DECIDIR si una venta
  deja de contar como ingreso. Propongo no tocarlo en esta feature: no hay ninguna
  venta en la base y sin una línea real no se puede escribir su regla (regla 3 de
  `docs/specs.md`). ← REVISAR EN APROBACIÓN (punto 3).
- R13 — (añadido) Una pierna de traspaso emparejada ya no suma por su `transferId`;
  sin esta regla saldría además con `investmentPurchase` no nulo, diciendo que es
  una compra cuando es un traspaso. Hoy no hay ningún gasto de MyInvestor con
  `transferId` en la base. ← REVISAR EN APROBACIÓN (técnica 3 de la hoja).
- R14 — (añadido) El contrato es del backend y el frontend construye contra él
  (`CLAUDE.md` del workspace): un campo que no está en el contrato no existe para él.
