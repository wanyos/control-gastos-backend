# Decisiones — F58 `recurring-expenses`

> **Esto es lo único que necesitas leer para aprobar.** Los otros tres archivos
> (`requirements` / `design` / `tasks`) son material del implementer y del reviewer.
> Si algo de aquí no te convence, dilo y se cambia ahí; no hace falta que los abras.

**Qué hace:** una consulta nueva, `GET /api/recurring-expenses`, que calcula en el momento tus recibos (uno por uno), tus transferencias a personas (un grupo) y tu gasto variable por categoría, cada uno sumado por mes, y un total de lo que te cuesta un mes. **No toca** ninguna suma existente, ni categorías, ni reglas, ni la base: solo lee.

---

## 🔴 Confirma o corrige (6)

| # | Decisión (mía, salvo que diga lo contrario) | Alternativa si no te gusta |
|---|---|---|
| 1 | **Un recibo es un gasto cuyo concepto empieza por «recibo», «recib» o «tributo»** (lo que escribe tu banco al cobrar una domiciliación o un impuesto). Hoy salen 15 recibos distintos, todos de un banco. Las suscripciones cobradas con tarjeta (una plataforma de vídeo, la cuota premium de un banco) **no** son recibos: salen en su categoría. | Tratar también como recibo cualquier cargo con tarjeta que se repite cada mes: más cerca de «lo que me cuesta existir», pero hace falta medir regularidad y se cuela lo frecuente (la máquina de vending sale cientos de veces). |
| 2 | **Periodicidad con siete valores:** una vez, dos veces al mes, mensual, cada dos meses, cada tres, cada seis y anual. Las tres tuyas no bastan: **en tus datos el impuesto municipal y el agua llegan cada dos meses** (no una vez al año), Hacienda en dos plazos al año (sale «cada seis meses») y el seguro del coche «cada tres meses» porque varias pólizas comparten concepto. El total no depende de esta etiqueta (🔴 3). | Solo tus tres más «otra»: el impuesto municipal saldría «otra», no «anual». |
| 3 | **«Lo que me cuesta al mes» = lo gastado en los 12 meses completos anteriores al actual, entre 12.** Un anual cuenta 1/12; un recibo que dejaste de pagar hace seis meses, la mitad. El mes en curso no entra. Cada recibo, las personas y cada categoría llevan su parte; el total es su suma. | El último mes completo tal cual: el mes del seguro o de Hacienda se dispara y el siguiente se hunde. |
| 4 | **«Ha subido» compara el total del último mes con cargo de ese recibo con el del mes con cargo anterior**; un céntimo de más ya es subida, y se enseña la diferencia (también si baja). Por mes y no cargo a cargo porque el gimnasio cobra dos cuotas distintas el mismo día y en orden cambiante. ⚠️ La luz cambia casi cada mes: saldrá casi siempre subiendo o bajando. | Comparar la media de los últimos tres meses con cargo con la de los tres anteriores: menos ruido, menos riguroso. |
| 5 | **«A personas» es un gasto (que no sea recibo) con palabra de transferencia (las mismas que usa la detección de traspasos) o «bizum».** Hoy 178 movimientos de dos bancos. Se cuelan transferencias a empresas (un taller, una tienda) y dos a una plataforma de inversión sin pareja de traspaso: suman en el total hasta que las marques con `excludedFromTotals`. | Usar tu categoría «Transferencias a personas»: lo controlas con reglas, pero hoy solo 72 de esos 178 la tienen (104 están en «Otros gastos»): el resto saldría en «Otros gastos» hasta que escribas reglas. |
| 6 | **Contradicción del handoff:** su «Fuera de alcance» dice «cualquier cosa que dependa de categorías», y tu decisión 1 agrupa el gasto variable por categoría. **Lo leo así:** tu decisión del 2026-10-17 es posterior y lo matiza tú mismo en «De dónde sale»: solo el bloque variable usa categorías, y solo las lee; recibos y personas no las miran. | Si manda «Fuera de alcance», el bloque variable sale de esta feature y quedan recibos y personas. |

## ✅ Ya las cerraste tú (8)

- **Dos bloques: recibos uno por uno, aunque salgan una sola vez; y gasto variable por categoría, sumado al mes** (decisión 1, 2026-10-17).
- **Hay recibos anuales y salen como anuales**, no como mensuales a los que les faltan once meses (decisión 2).
- **Si ha subido un euro, ha subido:** sin umbral (decisión 3).
- **Las transferencias a personas van en su propio grupo y suman en el total**; el interruptor para sacarlas no se construye ahora (decisión 4).
- **El backend no inventa categorías ni reglas:** las que falten (p. ej. reglas para tu `Gasolina`) las creas tú desde la aplicación.
- **No se esconde nada por su cuenta:** la aportación automática a la cartera sale mientras no la marques con `excludedFromTotals`.
- **Fuera:** presupuestos, avisos y marcar a mano algo como recurrente.
- **Calculado al momento, sin guardar nada**; fuera los traspasos emparejados y lo marcado con `excludedFromTotals`.

## 🧪 Cómo se comprobará que está hecho

| Tu frase de «cómo sé que está bien» | Se comprueba ejecutando |
|---|---|
| Un recibo sale por separado, aunque una sola vez | Test de un recibo con un solo cargo; test de un recibo cuyo concepto cambia en números o en el final y sigue siendo uno |
| Anual como anual; dos veces al mes como tal | Un test por cada una; (añadido) otro de «cada dos meses» |
| Variable por categoría y al mes; no inventa categorías | Test de dos categorías sumadas mes a mes; el test de que la consulta no escribe nada (tampoco categorías) |
| Si sube un euro, ha subido | Test de un recibo cuyo último mes cuesta un céntimo más que el anterior |
| Personas en su grupo y en el total | Test con una transferencia y un bizum a personas |
| Un total de todo al mes | Test de un recibo anual que pesa 1/12 en el total |
| Fuera traspasos emparejados y `excludedFromTotals` | Test con una pareja de traspaso, uno marcado y uno de depósito: no aparece ninguno |
| No escribe ni guarda nada | Test que cuenta filas y última modificación antes y después, y mira que el código no tenga escrituras |
| `docs/api-contract.md` lo describe | Test que lee el contrato: la sección, su ejemplo y cada campo |
| (añadido) Base vacía y el resto | Test de la base sin gastos; y `pnpm test` entero (las sumas de siempre no cambian) |

## ⚙️ Técnicas — decididas, no necesitan tu visto bueno (6)

1. **Nombres en la API, traducción de tus palabras:** `bills` (recibos), `transfersToPeople` (a personas), `variable`, `monthlyCost` (lo que cuesta al mes), `monthlyTotal`, `periodicity` (`once`, `twice_monthly`, `monthly`, `every_two_months`, `every_three_months`, `every_six_months`, `annual`). Cámbialos si quieres.
2. **Un mismo recibo con concepto cambiante se junta por las dos primeras palabras de su concepto**, sin «recibo» y sin las palabras con números. Junta las tres grafías dobles que hay hoy y no mezcla proveedores. ⚠️ *Efecto:* dos recibos distintos que empiecen por las mismas dos palabras saldrían como uno.
3. **Se listan todos los recibos de la historia**, también los que ya no pagas (con coste al mes 0), para no esconder nada.
4. **Los movimientos de cada recibo, de las personas y de cada categoría vienen en la misma respuesta**: los del recibo, de toda su historia; los otros, de los 12 meses. Sin consulta aparte.
5. **«Qué es un gasto» es la misma regla que la de las sumas de siempre** (también fuera los movimientos de depósito y los ingresos); se saca a una función que usan las dos.
6. **Tamaño: 15 requirements**, justo en el tope.

## 📌 Consecuencias que te tocan a ti (no son código)

- **Lo que no sea gasto de vida y no quieras ver** (la aportación a la cartera, las transferencias a la plataforma de inversión), márcalo con `excludedFromTotals`.
- **Si otro banco cobra recibos con otra palabra** («adeudo», por ejemplo), hay que añadirla: hoy no hay ninguno (comprobado en tu base).
- **La prueba con tus datos reales la haces tú**, con `GET /api/recurring-expenses` cuando esté hecha: los tests usan datos inventados.
- La parte 2, en el frontend, en su propia sesión contra `docs/api-contract.md`.

## ⚠️ Incoherencias conocidas que se heredan

- **Todas las cifras de esta hoja salen de consultas de solo lectura a tu base hoy (2026-10-17), simulando la regla; por la API no lo he comprobado** (falta el código). **No he comprobado** si algún banco escribe una transferencia a una persona solo con su nombre: esa saldría en su categoría y no en «a personas».
