# Requirements — F58 `recurring-expenses`

> Fuente de verdad: el `intent` de la feature 58 en `feature_list.json` y
> `../docs/handoff-recurrentes.md` (con las cuatro decisiones del humano del
> 2026-10-17). Las decisiones para el humano están en `decisions.md`; aquí va la
> maquinaria para el implementer y el reviewer.
>
> **Nombres propuestos, pendientes de aprobación en la puerta** (`decisions.md`
> ⚙️ 1): la ruta `GET /api/recurring-expenses`, los campos `bills` (recibos),
> `transfersToPeople` (transferencias a personas), `variable` (gasto variable),
> `monthlyCost`, `monthlyTotal`, `periodicity` y sus siete valores. Si el humano
> los cambia, se cambian aquí y en `design.md` antes de implementar.
>
> **Ninguna cifra ni concepto de la base del humano** en este archivo ni en los
> tests (`src/no-real-data.test.ts`, `docs/lessons.md` #3).

## Descripciones literales usadas en este documento (no son términos nuevos)

- **Gasto que cuenta**: un movimiento que la suma de ingresos y gastos
  (`computeTotals`, `src/modules/movements/movements.service.ts`) sumaría a
  `expense`: `type = 'expense'`, `transferId` nulo, `productId` nulo,
  `excludedFromTotals = false` y **no** es un movimiento de depósito según
  `readDepositMovements` (feature 57; uno de depósito nunca suma a `expense`).
- **Los 12 meses del periodo**: los doce meses naturales completos anteriores al
  mes de hoy en Madrid (`currentMonthInMadrid`, `src/lib/local-date.ts`). Hoy
  2026-10-17 → de `2025-10` a `2026-09`. El mes en curso nunca entra.
- **Concepto normalizado**: `normalizeForMatch(description)`
  (`src/modules/category-rules/category-rules.service.ts`): sin tildes, en
  minúsculas y sin espacios en los extremos.
- **Palabras de recibo**: `recibo`, `recib`, `tributo`.
- **Recibo**: gasto que cuenta cuyo concepto normalizado **empieza** por una
  palabra de recibo seguida de un carácter que no es letra, o del final.
- **Clave de un recibo**: ver `design.md` §3 (palabras del concepto sin las de
  recibo ni las que llevan dígitos; las dos primeras).
- **Mes con cargo** de un recibo: un `YYYY-MM` en el que el recibo tiene al
  menos un cargo. **Total del mes** de un recibo: la suma de sus cargos de ese mes.
- **Transferencia a una persona**: gasto que cuenta que no es recibo y cuyo
  concepto lleva una palabra de transferencia (la expresión `transferWords` de
  `src/modules/transfers/transfers.service.ts`, la misma de la detección de
  traspasos) o la palabra `bizum`.
- **Gasto variable**: gasto que cuenta que no es recibo ni transferencia a una
  persona.

## R1
CUANDO un cliente hace `GET /api/recurring-expenses`, el sistema DEBE responder
`200` con `period` = `{ from, to, months }`, donde `months` son los 12 meses del
periodo en orden ascendente (`YYYY-MM`), `from` el primer día del primero y `to`
el último día del último.

## R2
El sistema NO DEBE poner en `bills`, `transfersToPeople` ni `variable` ningún
movimiento que no sea un gasto que cuenta (traspaso enlazado, marcado
`excludedFromTotals`, con `productId`, movimiento de depósito, ingreso o neutral).

## R3
CUANDO un recibo tiene al menos un cargo en toda la historia, el sistema DEBE
devolverlo como una entrada propia de `bills`, aunque ese sea su único cargo y
aunque no tenga ninguno en los 12 meses del periodo.

## R4
El sistema DEBE juntar en una misma entrada de `bills` todos los cargos cuya
clave de recibo sea la misma, y separar en entradas distintas los de claves
distintas.

## R5
El sistema DEBE dar a cada entrada de `bills` una `periodicity` calculada con la
regla de `design.md` §4 sobre toda su historia: `once`, `twice_monthly`,
`monthly`, `every_two_months`, `every_three_months`, `every_six_months` o
`annual`.

## R6
El sistema DEBE dar a cada entrada de `bills` `key`, `name` (la `description` de
su cargo más reciente, tal como la escribió el banco), `count` (número de cargos
en toda la historia), `lastDate` (fecha del cargo más reciente) y `usualAmount`
(mediana inferior de los totales del mes de sus últimos 12 meses con cargo).

## R7
El sistema DEBE dar a cada entrada de `bills` `lastMonth`/`lastMonthAmount` (su
último mes con cargo y su total), `previousMonth`/`previousMonthAmount` (el mes
con cargo anterior y su total, `null` si solo tiene uno), `change` =
`lastMonthAmount − previousMonthAmount` (`null` si no hay anterior) y
`hasIncreased` = `change > 0`, **sin umbral**: un céntimo de más ya es `true`.

## R8
CUANDO un gasto que cuenta es una transferencia a una persona, el sistema DEBE
ponerlo en `transfersToPeople`, un único grupo con el total de cada uno de los
12 meses del periodo (`months: [{ month, amount }]`, con `"0.00"` en los meses
sin ninguna).

## R9
El sistema DEBE devolver en `variable` una entrada por cada categoría
(`categoryId` del movimiento, tal cual, sin subir a la categoría madre; `null`
es su propia entrada) que tenga al menos un gasto variable en los 12 meses del
periodo, con el total de cada uno de esos 12 meses.

## R10
CUANDO responde a `GET /api/recurring-expenses`, el sistema NO DEBE crear,
modificar ni borrar ninguna fila de ninguna tabla (tampoco categorías ni reglas).

## R11
El sistema DEBE dar a cada entrada de `bills`, a `transfersToPeople` y a cada
entrada de `variable` un `monthlyCost` = suma de sus cargos dentro de los 12
meses del periodo dividida entre 12, redondeada a céntimos (mitad hacia arriba).

## R12
El sistema DEBE devolver `monthlyTotal` = suma de los `monthlyCost` de todas las
entradas de `bills`, de `transfersToPeople` y de todas las entradas de `variable`.

## R13
El sistema DEBE incluir en cada entrada sus movimientos (`id`, `accountId`,
`bookingDate`, `amount`, `description`, del más reciente al más antiguo): en
`bills`, los de toda la historia; en `transfersToPeople` y en `variable`, solo
los de los 12 meses del periodo.

## R14
SI no hay ningún gasto que cuente ENTONCES el sistema DEBE responder `200` con
`bills: []`, `variable: []`, `transfersToPeople` con sus 12 meses a `"0.00"`,
`monthlyCost: "0.00"` y `movements: []`, y `monthlyTotal: "0.00"`.

## R15
`docs/api-contract.md` DEBE describir `GET /api/recurring-expenses`: qué
movimientos entran, cómo se reconoce cada grupo, cada campo de la respuesta con
un ejemplo JSON, los valores de `periodicity`, cómo se calculan `monthlyCost` y
`monthlyTotal`, y que los movimientos de cada entrada vienen en la propia
respuesta.

## Procedencia

- R1 — (delegado) El humano cedió «cómo se calcula el total al mes». Decido los
  12 meses completos anteriores al actual (Madrid). ← REVISAR (`decisions.md` 🔴 3).
- R2 — (humano) «Los traspasos emparejados y lo marcado con excludedFromTotals no
  aparecen.» Ampliarlo a `productId`, depósitos, ingresos y neutrales es
  (delegado): es la misma regla de la suma general, para que no haya dos
  respuestas a «qué es un gasto».
- R3 — (humano) «Un recibo sale por separado por su concepto, aunque haya
  aparecido una sola vez.» Cómo se reconoce un recibo es (delegado): por las
  palabras de recibo al principio del concepto. ← REVISAR (🔴 1). Listar
  también los que no tienen cargo en el periodo es (añadido): el backend no
  esconde nada por su cuenta (⚙️ 3).
- R4 — (delegado) «Cómo se agrupa un mismo recibo cuando su concepto cambia»:
  quitar palabras con dígitos y quedarse con las dos primeras. Medido en solo
  lectura sobre la base del humano: junta las dos grafías de un mismo proveedor
  que se ven hoy (⚙️ 2).
- R5 — (humano) anual y dos veces al mes, decisión 2 del 2026-10-17. Los valores
  `once`, `every_two_months`, `every_three_months` y `every_six_months` son
  (añadido): los datos reales los necesitan. ← REVISAR (🔴 2).
- R6 — (humano) «cómo llamarlo, su importe habitual, cuándo fue el último,
  cuántas veces se ha visto». Que el importe habitual sea la mediana de los
  totales del mes es (delegado).
- R7 — (humano) «si ha subido un euro, ha subido… sin umbral». Que «reciente» y
  «antes» sean el último mes con cargo y el anterior es (delegado). ← REVISAR (🔴 4).
- R8 — (humano) decisión 4: «en su propio grupo». Cómo se reconoce es
  (delegado): palabras de transferencia o `bizum`. ← REVISAR (🔴 5). Que sea un
  único grupo y no uno por persona es (delegado).
- R9 — (humano) decisión 1: «gasto variable agrupado por tipo, sumado al mes…
  por categoría». No subir a la categoría madre y dar a «sin categoría» su
  propia entrada es (delegado).
- R10 — (humano) «La consulta no escribe ni guarda nada» y «Que el backend no
  cree categorías o reglas».
- R11 — (delegado) «Cómo se calcula el total al mes cuando hay recibos anuales»:
  un anual pesa 1/12 de su importe. ← REVISAR (🔴 3).
- R12 — (humano) «Hay un total de cuánto suma todo al mes»; «Las transferencias
  a personas… suman en el total».
- R13 — (delegado) «Si los movimientos de cada recurrente vienen en la respuesta
  o se piden aparte»: en la respuesta (⚙️ 4).
- R14 — (añadido) El intent no habla de la base vacía. Respuesta vacía, nunca
  error, como `GET /api/transfers/ambiguous`.
- R15 — (humano) «docs/api-contract.md describe la consulta, su respuesta y cómo
  se piden los movimientos de cada recurrente».

**Tamaño:** 15 requirements, justo en el tope de la regla 2.
