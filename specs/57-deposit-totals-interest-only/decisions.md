# Decisiones — F57 `deposit-totals-interest-only`

> **Esto es lo único que necesitas leer para aprobar.** Los otros tres archivos
> (`requirements` / `design` / `tasks`) son material del implementer y del reviewer.
> Si algo de aquí no te convence, dilo y se cambia ahí; no hace falta que los abras.

**Qué hace:** en las sumas de entrada y salida (`totals` de `GET /api/movements` y `period.totals` de `GET /api/overview`) una apertura y una cancelación de depósito cuentan 0 y un vencimiento cuenta solo su interés, sin marcar nada, para lo que ya hay y para lo que entre. **No toca** el `amount` de ningún movimiento, el saldo, `GET /api/net-worth`, `GET /api/investments/deposits`, la importación ni el frontend.

---

## 🔴 Confirma o corrige (6)

| # | Decisión (mía, salvo que diga lo contrario) | Alternativa si no te gusta |
|---|---|---|
| 1 | **Un vencimiento cuyo capital no se sabe con certeza cuenta 0** (ni capital ni interés) y sale como dudoso. Hoy hay uno: el de agosto de 2025, cuya apertura es anterior a tu primer extracto. | Que el dudoso cuente entero, como hoy: vuelve a meter su capital como ingreso, que es justo lo que quitas. |
| 2 | **De dónde sale el capital de un vencimiento:** 1º tu `.json` de depósito cuyo `maturityDate` es ese día (como la F50); si no hay, la apertura anterior de la misma cuenta que aún no se ha devuelto, siempre que el interés salga ≥ 0 **y menor que el propio capital**. Si quedan varias de importes distintos, dudoso. Cada apertura se devuelve una sola vez (por una cancelación de su mismo importe o por un vencimiento). **El número de la descripción no se lee.** | Quitar el tope «interés menor que el capital»: el vencimiento de julio de 2026 quedaría dudoso entre dos aperturas y su interés no contaría. O usar también el número de la descripción: hoy da lo mismo, pero dijiste en la F50 que no. |
| 3 | **En un movimiento de depósito, `excludedFromTotals` deja de contar: manda esta regla.** La migración quita las 29 marcas de depósito; tu otra marca (un movimiento de septiembre que no es de depósito) se queda. Si marcas uno de depósito más adelante, se guarda pero no cambia lo que suma. | Dejar las 29 marcas puestas: no cambiarían ninguna suma, pero el filtro «marcados» y el listado dirían «marcado» en movimientos que sí cuentan. |
| 4 | **Se calcula cada vez que se pide; no se guarda nada en la base.** Por eso vale solo, para lo de antes y para cada importación nueva, y si subes un `.json` tarde la siguiente consulta ya lo usa. | Guardarlo al importar en columnas nuevas: hay que recalcular al subir un `.json`, al importar un mes atrasado y rellenar lo que ya hay. |
| 5 | **Cada movimiento de `GET /api/movements` trae `deposit`**: `null` si no es de depósito; si lo es, `kind` (`opening` apertura / `cancellation` / `maturity` vencimiento), `principal` (capital), `countedAmount` (lo que suma), `ambiguous` (dudoso sí/no), `reason` (`principal_not_found` sin capital / `several_principals` varios / `opening_not_found` cancelación sin apertura) y `candidateMovementIds`. Nombres propuestos: apruébalos o cámbialos. | Otros nombres. O, además, una consulta propia que liste solo los dudosos, como `GET /api/transfers/ambiguous`: más fácil de encontrarlos, una ruta más. |
| 6 | **Una cancelación que no encuentra apertura de su mismo importe sale como dudosa** (sigue sumando 0). Hoy no hay ninguna. | No marcarla nunca: su capital es su propio importe y cuenta 0 igual; solo perderías el aviso de que algo no cuadra. |

## ✅ Ya las cerraste tú (5)

- **Ni se parte el movimiento ni cambia su `amount`**: cambia solo cuánto cuenta en las sumas.
- **Nada de marcar a mano** en cada importación.
- **`GET /api/net-worth` no se toca**: ya cumple la regla.
- **Fuera:** traspasos a cuentas propias sin pareja y compras o aportaciones dentro de MyInvestor.
- **Los depósitos antiguos no tendrán `.json`** (F50): por eso su capital sale de su apertura (🔴 2).

## 🧪 Cómo se comprobará que está hecho

| Tu frase de «cómo sé que está bien» | Se comprueba ejecutando |
|---|---|
| Octubre de 2026, con tus datos reales | — **Lo compruebas tú**, tras aplicar la migración: `GET /api/movements?from=2026-10-01&to=2026-10-31` y comparas con las cifras de `../docs/handoff-depositos.md`; el leader lo anota en el resumen. No puede ser un test: tus cifras no pueden estar en el repositorio. Con datos inventados, dos tests de la regla (apertura y cancelación a 0; vencimiento por su interés) |
| Agosto de 2025 a septiembre de 2026 recuperan los intereses | Tres tests con datos inventados: un vencimiento marcado cuenta su interés; uno sin `.json` toma el capital de su apertura; la migración quita las marcas de depósito y deja las demás. Las cifras reales, también tu prueba (mismo `GET` por meses) |
| Cada movimiento enseña el importe del banco | El test que lista movimientos de depósito y comprueba `amount` y `type` intactos |
| Uno sin capital cierto: dudoso, cuál y por qué | El test de un vencimiento sin capital cierto: cuenta 0, `ambiguous`, motivo y aperturas candidatas |
| `docs/api-contract.md` lo describe | El test que lee el contrato y busca el campo, sus valores y lo de `excludedFromTotals` |
| (añadido) Resumen, importaciones nuevas y el resto | Tests de `period.totals`, de un vencimiento añadido después, y `pnpm test` entero |

## ⚙️ Técnicas — decididas, no necesitan tu visto bueno (6)

1. **Una sola función suma para `GET /api/movements` y `GET /api/overview`** ([`computeTotals`](../../src/modules/movements/movements.service.ts#L490)), como hasta ahora.
2. **El capital se busca en toda la historia de la cuenta, no solo en el mes pedido**: si no, un vencimiento de octubre con apertura en septiembre saldría dudoso al pedir octubre.
3. **Qué texto es apertura, cancelación o vencimiento lo sabe el código de MyInvestor** (`APERTURA DEP`, `CANCELACION DEP`, `INTERESES DEP`, como la F50), y además se exige el tipo: apertura = salida; cancelación y vencimiento = entrada.
4. **En un movimiento de depósito tampoco cuentan `transferId` ni `productId`** al sumar. Hoy ninguno tiene (comprobado).
5. **`deposit` solo aparece en `GET /api/movements`**; las respuestas de los `PATCH` y de `/api/transfers` no cambian de forma.
6. **Tamaño: 16 requirements**, uno por encima del tope de ~15: por la frase del contrato, que pediste aparte.

## 📌 Consecuencias que te tocan a ti (no son código)

- **Al desplegar, `prisma migrate deploy`: escribe en tu base** (quita las 29 marcas de depósito). No hay que rellenar nada a mano.
- **La prueba real de octubre y de los meses anteriores la haces tú** (🧪) y se apunta en el resumen de la feature.
- **El vencimiento de agosto de 2025 se queda dudoso y su interés sin contar.** La única forma de resolverlo sería escribir su `.json`; no he comprobado qué haría ese `.json` en patrimonio.
- **He quitado de tu frase de octubre las dos cifras con céntimos** (`feature_list.json`): el test de datos reales la marcaba porque están en tu base. Siguen en el handoff.
- La parte 2, en el frontend, en su propia sesión contra `docs/api-contract.md`.

## ⚠️ Incoherencias conocidas que se heredan

- **Tu frase «agosto de 2025 a septiembre de 2026 recuperan los intereses» se cumple salvo en agosto de 2025**, por 🔴 1. Lo he medido simulando la regla sobre tu base, en solo lectura; **por la API no lo he comprobado** (hace falta el código hecho).
