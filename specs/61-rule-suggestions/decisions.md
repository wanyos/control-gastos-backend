# Decisiones — F61 `rule-suggestions`

> **Esto es lo único que necesitas leer para aprobar.** Los otros tres archivos
> (`requirements` / `design` / `tasks`) son material del implementer y del reviewer.
> Si algo de aquí no te convence, dilo y se cambia ahí; no hace falta que los abras.

**Qué hace:** dos consultas de solo lectura. Una te da la lista de reglas propuestas: los conceptos que más se repiten en `Otros gastos` / `Otros ingresos`, cada uno con su texto de regla y los movimientos que recogería, de más a menos. La otra, dado un texto y una categoría, te dice qué haría crear esa regla (qué movimientos movería y cuáles chocarían), sin crearla. **No crea reglas ni cambia categorías**: eso lo sigues haciendo tú con el `POST` de siempre. Las cuentas salen de la **misma función** que usa la creación de la regla, así que el número es el que luego se mueve.

---

## 🔴 Confirma o corrige (5)

| # | Decisión (mía) | Alternativa si no te gusta |
|---|---|---|
| 1 | **Cómo se saca el texto propuesto:** se pasa a minúsculas sin acentos, se corta desde la palabra «concepto» (lo que escribe a mano quien hace una transferencia o un bizum), se quita la palabra del banco antes de la barra (`RECIBO /`, `TRANSF /`, `ANUL. /`…) y se corta en el primer número (tienda, referencia, fecha). P. ej. `RECIBO /Academia Ficticia` → `academia ficticia`; `SUPERMERCADO INVENTADO 4521` → `supermercado inventado`. | Agrupar solo descripciones idénticas: más simple, pero deja fuera todo lo que lleva número de tienda, referencia o texto libre. |
| 2 | **Se propone un texto si recoge al menos 3 movimientos y tiene al menos 5 letras; la lista no se corta.** Medido en tu base: unas 65 propuestas que juntas recogen cuatro de cada cinco movimientos de las dos genéricas. Sin el mínimo de 5, salía un texto de 3 letras que casaba dentro de otras palabras y se llevaba diez conceptos distintos. | Mínimo 2 movimientos: unas 95 propuestas y unos cinco puntos más de cobertura. O cortar la lista en las primeras N. |
| 3 | **Lo que pusiste a mano no cuenta nunca** (ninguna regla lo toca desde la F60), pero una propuesta cuyo texto también aparece en movimientos tuyos a mano **se enseña igual**, con cuántos son. Medido: cuatro propuestas, entre ellas dos de las tres más grandes. | Ocultarlas: más literal a tu «que no se propongan», pero perderías esas propuestas grandes. |
| 4 | **Nombres de las dos rutas, te los propongo:** `GET /api/category-rules/suggestions` (la lista) y `GET /api/category-rules/preview?matchText=…&categoryId=…` (qué haría la regla). La segunda pide la categoría porque sin ella no se sabe si chocará con otra regla, y responde lo mismo que respondería el `POST` al crearla. | Una sola ruta con el texto como parámetro opcional; u otros nombres. |
| 5 | **Si todo lo que recoge una propuesta lo recoge ya otra más amplia, solo sale la amplia** (p. ej. «recibo academia ficticia» queda dentro de «academia ficticia»). | Enseñar las dos y que elijas tú. |

## ✅ Ya las cerraste tú (4)

- **Solo propone:** la aplicación no crea reglas ni cambia categorías sola.
- **El número que ves es el que mueve la regla** al crearla, no una estimación.
- **Un concepto que ya recoge una regla existente no se propone.**
- **Tú eliges la categoría** de cada propuesta; la lista no la sugiere.

## 🧪 Cómo se comprobará que está hecho

| Tu frase de «cómo sé que está bien» | Se comprueba ejecutando |
|---|---|
| La consulta devuelve los conceptos ordenados, cada uno con su texto | Un test de la lista (orden, mínimo de 3, gastos e ingresos aparte) y uno que saca el texto de diez descripciones inventadas |
| Un concepto que ya recoge una regla no se propone | Un test con una regla existente: su concepto no sale |
| Antes de crear una regla sé cuántos y cuáles, sin escribir | Un test que pide la consulta y luego crea la regla: las dos respuestas iguales; y otro que crea la regla de cada propuesta y compara con su lista |
| Ninguna de las dos consultas escribe nada | Un test que fotografía movimientos y reglas antes y después: idénticos |
| `docs/api-contract.md` describe las dos consultas | Un test que lee el contrato |
| (añadido) Lo que ya funciona sigue igual | `pnpm test` entero |

## ⚙️ Técnicas — decididas, no necesitan tu visto bueno (4)

1. **La decisión «una categoría → se escribe; dos → choque; ninguna → nada» sale a una función aparte** que usan la creación de reglas, la importación y las dos consultas. Los tests de antes no cambian.
2. **Nada se guarda:** las propuestas se calculan cada vez que se piden.
3. **Un movimiento que el texto recogería pero que ya casa con otra regla no cuenta:** al crear la regla chocaría o iría a la otra.
4. **La consulta de «qué haría» da los mismos errores que crear la regla** (texto corto, categoría que no existe, texto repetido).

## 📌 Consecuencias que te tocan a ti (no son código)

- **La sesión del frontend** tiene que construir la pantalla de propuestas (eliges categoría → `POST` de siempre) y la pregunta «¿aplicar a todos los que contienen…?» al cambiar a mano una categoría, usando la segunda ruta.
- **La prueba con tus datos la haces tú**: pide la lista y crea la regla de una propuesta; los movimientos que mueve tienen que ser los de la lista.

## ⚠️ Incoherencias conocidas que se heredan

- **Los conceptos que corta el banco** (tarjeta, unos 22 caracteres) o que escribe de dos formas (nombre de una persona en distinto orden, empresa que acaba en `SL` y luego en `SA`) salen como **dos propuestas**. Las juntas tú escribiendo un texto más corto en la segunda ruta.
- **Las transferencias y bizums a una persona** salen como una propuesta por persona, con la fórmula del banco delante del nombre.
- **No he comprobado** el tiempo de respuesta con tu base: lo medido es una simulación del algoritmo con un guion aparte (menos de un segundo), no el código, que aún no existe.
