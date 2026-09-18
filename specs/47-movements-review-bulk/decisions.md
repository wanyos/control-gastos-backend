# Decisiones — F47 `movements-review-bulk`

> **Esto es lo único que necesitas leer para aprobar.** Los otros tres archivos
> (`requirements` / `design` / `tasks`) son material del implementer y del reviewer.
> Si algo de aquí no te convence, dilo y se cambia ahí; no hace falta que los abras.

**Qué hace:** añade a `GET /api/movements` tres formas de filtrar (por categoría,
«sin categoría» y por texto de la descripción) y un endpoint nuevo para cambiar
la categoría y/o el estado de **varios movimientos en una sola petición**. No
cambia nada de lo que ya devuelve el listado, no toca el `PATCH` de uno en uno,
no permite editar importe, fecha ni descripción, y no añade ninguna dependencia.

---

## 🔴 Confirma o corrige (5)

| # | Decisión | Alternativa si no te gusta |
|---|---|---|
| 1 | **Lo tuyo sin responder.** Cambiar varios movimientos se hace **solo mandando la lista de ids** que el usuario marcó en pantalla (máx. 200). **Es lo que recomiendo:** el servidor cambia exactamente lo que viste y marcaste. | Aceptar además «confirma todo lo que cumpla estos filtros»: vacía los 1.607 pendientes de un clic, pero un filtro mal puesto cambia miles de movimientos que nunca viste, y no hay deshacer. Si lo quieres, dilo y se rehace esta parte del spec. |
| 2 | **«Sin categoría» se pide con `uncategorized=true`**, un parámetro aparte. | `categoryId=none`: un parámetro menos, pero obliga a que `categoryId` acepte un número **o** la palabra `none`, y eso es un caso especial en la validación para siempre. |
| 3 | **Buscar por texto se llama `q` e ignora mayúsculas y tildes** (`cafeteria` encuentra `CAFETERÍA`). **Comprobado ejecutándolo** contra el PostgreSQL del proyecto: es viable y **no hace falta instalar nada**. | Ignorar solo mayúsculas: ahorra una columna nueva en la tabla, pero buscar sin tildes —que es como se teclea— dejaría de funcionar. |
| 4 | **Tope de 200 movimientos por petición**, el mismo máximo que ya tiene una página del listado: «marcar todo lo de esta página» siempre cabe en una petición. | 500 o 1.000: menos peticiones para vaciar la cola, más tiempo con la base bloqueada y una respuesta más pesada por cada una. |
| 5 | **Un filtro incoherente o imposible falla en vez de devolver una lista vacía**: pedir a la vez una categoría y «sin categoría» → error; pedir una categoría que no existe → error (igual que hoy con una cuenta que no existe). | Devolver 200 con la lista vacía: más cómodo para el frontend, pero un fallo suyo se ve como «no hay movimientos» y se busca durante media hora en el sitio equivocado. |

## ✅ Ya las cerraste tú (4)

- **Nada de endpoint nuevo para crear una regla desde un movimiento.** `POST /api/category-rules` ya sirve y el frontend lo usa tal cual.
- **Ningún campo del hecho bancario se puede editar**: importe, fecha y descripción quedan fuera, también en la operación sobre varios.
- **Las reglas del cambio de uno en uno valen igual en bloque**: la categoría casa con el tipo, un movimiento de importe 0 no se categoriza, y si uno falla **no cambia ninguno**.
- **`docs/api-contract.md` se actualiza en esta misma feature**: es lo que leerá el frontend en su sesión.

## ⚙️ Técnicas — decididas, no necesitan tu visto bueno (4)

1. **La versión «sin tildes» de la descripción la calcula PostgreSQL sola**, en una columna que ningún código escribe. Se rellena sola también en los 1.607 movimientos que ya hay.
   ⚠️ *Efecto:* no hay forma de que se desincronice ni de que a alguien se le olvide actualizarla.
2. **Los filtros nuevos se montan en el mismo sitio que los de hoy** ([`movements.service.ts:156`](../../src/modules/movements/movements.service.ts#L156)), así que la página, el contador y los totales no pueden mirar cosas distintas.
3. **Un `%` escrito en la búsqueda se busca como un `%`**, no como «cualquier cosa».
4. **La respuesta de la operación sobre varios devuelve los movimientos ya cambiados**, para que la pantalla no tenga que recargar la lista.

## 📌 Consecuencias que te tocan a ti (no son código)

- **Responder el punto 1**: es lo único que bloquea el arranque de la implementación.
- Al desplegar hay que aplicar la migración nueva (`prisma migrate deploy`). **No hay que rellenar nada a mano.**
- Cuando esta feature cierre, la **parte 1** de `../docs/handoff-pantalla-revision.md` queda hecha y toca abrir sesión en `gastos-frontend/` para la parte 2. La regla del workspace dice que no se hacen las dos a la vez.
- Probar esto contra la base real **escribe** en tus movimientos. Hazlo sobre unos pocos y con la lista de ids delante.

## ⚠️ Incoherencias conocidas que se heredan

- La búsqueda por texto recorre la tabla entera sin índice. Con 1.607 movimientos no se nota; si algún día son decenas de miles habrá que añadir un índice de texto (la pieza que hace falta ya está disponible en el PostgreSQL del proyecto, comprobado). No se añade ahora para no meter maquinaria por un problema que todavía no existe.
