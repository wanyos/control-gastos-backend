# Decisiones — F70 `product-file-same-opening`

> **Esto es lo único que necesitas leer para aprobar.** Los otros tres archivos
> (`requirements` / `design` / `tasks`) son material del implementer y del reviewer.
> Si algo de aquí no te convence, dilo y se cambia ahí; no hace falta que los abras.

**Qué hace:** al importar un archivo de producto cuyo `name` no existe todavía en ese banco, si ya hay otro producto del mismo banco, del mismo tipo y con la misma `openedAt`, el archivo se rechaza: no se guarda nada, no se mueve a `procesados/` y el mensaje nombra el producto con el que coincide. **No toca** cómo se guarda un producto que ya existe, ni los parsers, ni los extractos. Sin migración ni ruta nueva.

Medido el 2026-11-09 en tu base (solo lectura): 11 productos, **ninguno** comparte banco, tipo y `openedAt` con otro, así que ningún archivo de los que ya importas cada mes saldría rechazado. Solo veo lo que hay hoy: el duplicado del 2026-11-09 ya lo borraste y no queda rastro de él. `openedAt` es obligatorio en el archivo en los cinco tipos: lo comprobé ejecutando los dos parsers con `openedAt` ausente, `null` y vacío, y los tres salen como archivo fallido antes de llegar a esta regla.

---

## ✅ Aprobado por el humano el 2026-11-09

Los cuatro puntos siguientes, aprobados tal cual («aprobado»): la regla vale también para los depósitos (opción a) y el nombre `SAME_OPENING_PRODUCT` / `SameOpeningProductError`.

### Puntos que estaban por confirmar (4)

| # | Decisión | Alternativa si no te gusta |
|---|---|---|
| 1 | **Lo que dejaste sin decidir: la regla vale también para los depósitos (tu opción a).** Recomendación mía. En tu base hay 6 depósitos y nunca dos abiertos el mismo día (los más cercanos, a 3 días). Y el segundo archivo de un depósito, el del vencimiento, lo escribes a mano meses después: un `name` mal copiado ahí crearía un depósito duplicado que nunca se cierra. ⚠️ Coste: si algún día abres dos depósitos el mismo día, el segundo **no podrá entrar** hasta cambiar esta regla. | **Tu opción b:** los depósitos quedan fuera de la regla. Dos depósitos del mismo día entran sin problema, pero un archivo de vencimiento con el `name` cambiado vuelve a crear un depósito duplicado sin avisar. Cuesta una línea y cambiar un test. |
| 2 | **Código de error nuevo `SAME_OPENING_PRODUCT`** (propuesta de nombre, necesita tu sí; con `SameOpeningProductError` como nombre de la clase). Significa: «este `name` es nuevo, pero ya hay un producto del mismo banco, tipo y día de apertura». No abarca el choque de dos archivos de la misma importación (eso sigue siendo `DUPLICATE_PRODUCT_FILE`). | Reutilizar `VALIDATION_ERROR` (archivo mal escrito): sin código nuevo, pero el frontend no podría darle un texto propio y el archivo puede estar bien escrito. |
| 3 | **También se rechaza si el producto que coincide está cerrado.** Tu frase dice «si ya hay otro producto», sin distinguir. | Mirar solo los vivos: un producto renombrado justo cuando lo cierras volvería a crear un duplicado sin avisar. |
| 4 | **El mensaje:** «ya existe en <banco> el producto '<el que hay>', del mismo tipo (<tipo>) y abierto el mismo día (<fecha>), y este archivo declara '<el nuevo>', que no existe: si es el mismo producto con otro nombre, corrige el "name" del archivo para que diga '<el que hay>'. De este archivo no se ha guardado nada y NO se ha movido a procesados/.» Si coinciden varios, los nombra todos. | Otro texto que me dictes. |

## ✅ Ya las cerraste tú (6)

- **Solo aplica a un `name` que no existe;** el archivo con el nombre actual entra como siempre.
- **Mismo banco, mismo tipo y misma `openedAt`:** con cualquiera de las tres distinta, se crea el producto como hoy.
- **No se guarda nada y no se mueve a `procesados/`.**
- **El mensaje dice con qué producto coincide y que corrijas el `name`.**
- **El resto de archivos de la importación entran como siempre.**
- **La aplicación no renombra ni junta productos ella sola.**

## 🧪 Cómo se comprobará que está hecho

> Los `checks` de `feature_list.json`: se ejecutan al cerrar y, si uno falla, la
> feature no se cierra. Si falta un caso, es aquí donde se pide.

| Tu frase de «cómo sé que está bien» | Se comprueba ejecutando |
|---|---|
| El archivo con el nombre viejo y la misma apertura se rechaza, nombra al bueno y no guarda nada | Tres tests: uno con un archivo inventado que mira código y mensaje, otro que mira que la base y Drive quedan igual, y otro con el parser real de MyInvestor y una cartera gestionada con nombres inventados |
| El archivo con el nombre actual se importa como siempre | Un test donde además existe otro producto del mismo día: entra igual |
| Un producto nuevo con otra apertura se crea como hoy | Un test que importa otro nombre con otra `openedAt` |
| _(añadido)_ Otro banco u otro tipo, depósitos (punto 1), producto cerrado (punto 3), el resto de archivos sigue, los documentos | Un test por cada uno |
| _(añadido)_ Lo que ya existe se importa igual | La suite entera |

## ⚙️ Técnicas — decididas, no necesitan tu visto bueno (4)

1. **La comprobación va antes de escribir nada,** en el paso que guarda cada archivo de producto ([import.service.ts](../../src/modules/import/import.service.ts)), justo después de la de la F53. Las funciones que escriben el producto no cambian.
2. **La consulta a la base vive en [investments.service.ts](../../src/modules/investments/investments.service.ts):** es el único archivo al que el guardián `src/architecture.test.ts` deja leer la tabla de productos.
3. **Si algún test que ya existe crea dos productos inventados del mismo día,** se le cambia la fecha inventada sin tocar lo que comprueba, y queda listado en el informe.
4. **Decisión nueva en `docs/architecture.md` (ADR-045),** y una línea de revisión encima del ADR-012, que hoy dice que renombrar crea un producto nuevo. Ningún ADR se reescribe.
   ⚠️ *Efecto:* dos importaciones lanzadas a la vez no se ven entre sí, igual que en la F53.

## 📌 Consecuencias que te tocan a ti (no son código)

- **Cuando un archivo salga rechazado por esto, corrige su `name` en Drive y vuelve a importar.**
- **El frontend mostrará un texto genérico** («This file couldn't be imported.», con el mensaje del backend en el detalle) hasta que una sesión del frontend añada `SAME_OPENING_PRODUCT` a `gastos-frontend/src/features/import/fileMessages.ts` (leído hoy: tampoco tiene `DUPLICATE_PRODUCT_FILE`).

## ⚠️ Incoherencias conocidas que se heredan

- **Dos fondos (o dos ETF, o dos carteras) comprados el mismo día con nombres distintos:** el segundo no podrá entrar, igual que los depósitos del punto 1. Hoy tienes uno de cada, salvo dos carteras con distinta apertura; no hay ningún caso.
- **Un renombrado que además cambie la `openedAt` del archivo** sigue creando un producto nuevo sin avisar.
