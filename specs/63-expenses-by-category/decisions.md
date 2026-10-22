# Decisiones — F63 `expenses-by-category`

> **Esto es lo único que necesitas leer para aprobar.** Los otros tres archivos
> (`requirements` / `design` / `tasks`) son material del implementer y del reviewer.
> Si algo de aquí no te convence, dilo y se cambia ahí; no hace falta que los abras.

**Qué hace:** una consulta nueva que, para un mes o un año, da lo gastado por categoría, lo del periodo con que se compara, la diferencia, «nueva» / «ya no está» y sus movimientos, separado en fijo y variable; y una marca en cada categoría para decir que es fija. **No toca** ninguna suma, importe ni categoría de movimiento: solo lee. Se agrupa solo por categoría, nunca por el nombre que escribe el banco.

**Medido hoy, solo lectura** (con `GET` al servidor de desarrollo, sumando el gasto de cada categoría con el filtro de `GET /api/movements`, que usa la misma regla): en los **34 meses** con datos (enero 2024 – octubre 2026) la suma por categorías da **al céntimo** el gasto del mes de `GET /api/overview`, y también en 2025 entero. Hoy no hay ningún gasto que cuente sin categoría, y `Otros gastos` (66 movimientos) suma 0. La consulta nueva aún no existe: **no lo he comprobado con ella**, lo comprueba el test del cuadre.

---

## 🔴 Confirma o corrige (6)

| # | Decisión (mía: me la cediste) | Alternativa si no te gusta |
|---|---|---|
| 1 | **`GET /api/recurring-expenses` sigue viva** hasta que el frontend tenga la vista nueva; se retira en una feature del backend después (queda apuntado en el roadmap). | Retirarla ya: la sección Recurrentes del frontend deja de funcionar hasta que se haga la nueva. |
| 2 | **Solo gastos.** Los ingresos no entran en esta vista. | Añadir los ingresos con la misma forma: dos o tres requisitos más, o una feature aparte. |
| 3 | **El año en curso se compara con los mismos meses del año anterior** (hoy: enero–octubre de 2026 con enero–octubre de 2025), y «al mes» = lo gastado ÷ meses que lleva (10). Un año cerrado: con el anterior entero y ÷ 12. | Comparar siempre con el año anterior entero y ÷ 12: hasta diciembre, casi todo saldría bajando. |
| 4 | **Cada categoría trae dentro sus movimientos del periodo, solo los que cuentan.** Una que «ya no está» trae la lista vacía. | Dar solo la forma de pedirlos a `GET /api/movements`: esa lista trae también lo que no cuenta (en `Otros gastos`, las aperturas de depósito) y no sumaría lo de la línea. |
| 5 | **`Otros gastos` se trata como cualquier categoría; la que suma 0 en los dos periodos no sale** (hoy, `Otros gastos`). Un gasto que cuente sin categoría sale en una línea «sin categoría», en variable, para que el total siga cuadrando. | Sacar todas las categorías aunque sumen 0, o dejar fuera lo sin categoría (el total dejaría de cuadrar con el resumen del mes). |
| 6 | **Nombres en código, te los propongo:** columna `isFixed` en la categoría (cambia con `PATCH /api/categories/:id`, nace en `false`); ruta `GET /api/expenses-by-category?month=` o `?year=`, con `compare=previous-month` / `same-month-last-year`; en cada línea `change` = `new` (nueva) / `gone` (ya no está), y grupos `fixed` / `variable`. | Los nombres que digas. |

## ✅ Ya las cerraste tú (6)

- **Por categoría, nunca por el nombre que escribe el banco**, y con lo gastado en el periodo, no medias de 12 meses.
- **Tres comparaciones:** mes con el anterior, mes con el mismo del año pasado, año con el anterior.
- **El año es el natural**, de enero a diciembre.
- **Fijo o variable lo marcas tú** por categoría; el backend no decide nada.
- **Sustituye a Recurrentes**, con el formato de los dos bocetos (una línea por categoría que despliega sus movimientos).
- **Solo mirar:** no cambia ninguna suma, importe ni categoría.

## 🧪 Cómo se comprobará que está hecho

| Tu frase de «cómo sé que está bien» | Se comprueba ejecutando |
|---|---|
| Un mes: lo gastado, el mes anterior y la diferencia | El test de un mes con varias categorías |
| Un mes contra el mismo mes del año anterior | El test que pide esa comparación |
| Un año: gastado, año anterior, diferencia y al mes | Dos tests: un año cerrado (÷ 12) y el año en curso (punto 3) |
| Nueva / ya no está | El test con una categoría solo en un periodo y otra solo en el otro |
| Fijo y variable según tu marca, y marcar y desmarcar | El test del reparto y el test que marca y desmarca una categoría |
| Sus movimientos | El test que mira que salen los que cuentan y no uno excluido |
| Cuadra con `GET /api/overview` | El test con traspaso, excluido, depósito, cuenta propia, dudoso, aportación, ingreso y neutro, comparado con el resumen del mes y del año |
| El contrato lo describe | El test que lee `docs/api-contract.md` |
| (añadido) No escribe nada / lo de siempre sigue igual | El test que compara la base antes y después, y `pnpm test` entero |

## ⚙️ Técnicas — decididas, no necesitan tu visto bueno (5)

1. **Una comparación por petición:** para ver el mes con las dos, el frontend pide dos veces.
2. **Una subcategoría tiene su propia línea y su propia marca de fija** (me lo cediste; hoy no usas ninguna). Alternativa: sumarla en la de su padre.
3. **Se calcula al leer**, con la misma función que el resumen del mes: no se guarda nada y un cambio de categoría se ve al momento.
4. **Orden de las líneas:** de más a menos gastado.
5. **Diferencia = periodo − comparado:** positiva, subió; negativa, bajó.

## 📌 Consecuencias que te tocan a ti (no son código)

- **Aplicar la migración en tu base** (`pnpm exec prisma migrate deploy`): añade la columna con todas tus categorías como variables.
- **Marcar tus categorías fijas** (p. ej. vivienda, suministros, telefonía): hasta entonces todo sale en variable.
- **La sesión del frontend** hace la vista nueva y quita Recurrentes; después, una feature del backend retira la ruta vieja.

## ⚠️ Incoherencias conocidas que se heredan

- **El mes en curso se compara tal cual va** con el anterior entero (como hace el resumen del mes); solo el año en curso se recorta a los mismos meses.
- **Un año con meses sin importar** (2024 empieza en agosto en algún banco) divide igual por 12: la vista no avisa de los meses que faltan.

---

## ✍️ Aprobación (2026-10-21)

El humano repasó los seis puntos 🔴 uno a uno con el leader y los confirmó tal como están: 1 («me da igual una cosa que otra»: se queda la propuesta), 2 (solo gastos; los ingresos, quizá en otra feature más adelante), 3 («si esperamos a diciembre para poder comparar no sirve de mucho»), 4, 5 y 6 (nombres aprobados).
