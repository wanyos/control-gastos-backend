# Design — F70 `product-file-same-opening`

> Material del implementer y del reviewer. Leído contra el código del 2026-11-09.

## 1. Qué cambia, en una frase

Antes de guardar un archivo de producto, `importProductFile` pregunta a
`investments.service.ts` si el `name` es nuevo y si hay productos del mismo banco,
tipo y `openedAt`; si los hay, lanza `SameOpeningProductError` y el archivo sale
fallido sin escribir nada. Los escritores (`persistProductSnapshot` y los tres de
debajo) **no cambian**.

## 2. Archivos

| Archivo | Cambio |
|---|---|
| `src/errors/app-error.ts` | Clase nueva `SameOpeningProductError` (`SAME_OPENING_PRODUCT`, 422), con comentario como el de `DuplicateProductFileError`. |
| `src/modules/investments/investments.service.ts` | Función nueva de solo lectura `findSameOpeningProducts`. |
| `src/modules/import/import.service.ts` | `importProductFile`: un paso nuevo entre la comprobación de la F53 y `persistProductSnapshot`. |
| Tests | Ver `tasks.md`. Ningún archivo de test nuevo. |
| Documentos | `docs/api-contract.md`, `docs/myinvestor-product-files.md`, `docs/trade-republic-product-files.md`, `docs/data-model.md`, `docs/architecture.md`, `docs/roadmap.md`. |

## 3. Firmas

```ts
// src/modules/investments/investments.service.ts
/**
 * Feature 70: the products a NEW name would duplicate. Empty when `(bank, name)`
 * already exists (the file is that product, R6) or when nothing of the same
 * bank, type and opening day exists. Read only.
 */
export async function findSameOpeningProducts(
  prisma: AppPrismaClient,
  file: { bank: string; name: string; type: ProductFileInput['type']; openedAt: string },
): Promise<string[]>   // names, ordered by name
```

Cuerpo:

1. `findUnique({ where: { bank_name: { bank, name } }, select: { id: true } })`;
   si existe → `[]`.
2. `findMany({ where: { bank, type, openedAt: toDateOnly(openedAt) }, select: { name: true }, orderBy: { name: 'asc' } })`
   → los nombres. No filtra por `closedAt` (R11). Un producto con `openedAt`
   `NULL` en la base nunca coincide (medido el 2026-11-09: los 11 productos de la
   base tienen `openedAt`).

Tiene que vivir en `investments.service.ts`: el guardián de `src/architecture.test.ts`
(línea ~469) no deja que otro archivo de `src/` nombre `investmentProduct`.

```ts
// src/errors/app-error.ts
export class SameOpeningProductError extends AppError {
  constructor(message = 'Another product of this bank and type was opened that same day') {
    super(message, 'SAME_OPENING_PRODUCT', 422)
  }
}
```

## 4. `importProductFile`, paso nuevo

Después de la comprobación de la F53 (`DuplicateProductFileError`) y antes de
`persistProductSnapshot`, con el banco de la **carpeta** (`deps.bankSlug`):

```ts
const sameOpening = await findSameOpeningProducts(deps.prisma, {
  bank: deps.bankSlug, name: parsed.name, type: parsed.type, openedAt: parsed.openedAt,
})
if (sameOpening.length > 0) throw new SameOpeningProductError(sameOpeningMessage(...))
```

El `catch` que ya existe lo convierte en `status: 'failed'` con
`describeError`, y `importDriveFile` no mueve un archivo fallido (R4, igual que
en la F53). `storedInRun` no se toca: un archivo rechazado no se anota. Los
archivos siguientes siguen su curso (R5) porque `importProductFile` nunca lanza.

Orden con la F53: si el archivo repite `name` y `date` de otro de la misma
importación, sale `DUPLICATE_PRODUCT_FILE` como hoy; en ese caso el `name` ya
existe y esta regla no aplicaría de todos modos.

### Texto del mensaje (R2)

Un producto:

> ya existe en <bank> el producto '<existente>', del mismo tipo (<type>) y abierto
> el mismo día (<openedAt>), y este archivo declara '<name>', que no existe: si es
> el mismo producto con otro nombre, corrige el "name" del archivo para que diga
> '<existente>'. De este archivo no se ha guardado nada y NO se ha movido a
> procesados/.

Varios: «los productos '<a>', '<b>'» y «para que diga el nombre del que sea».

## 5. Depósitos (R10)

La regla se aplica a los cinco tipos (opción (a) del intent, pendiente de
confirmar en la hoja). Si el humano elige (b), el único cambio es que
`findSameOpeningProducts` devuelva `[]` cuando `type === 'deposit'`, y el test de
T4 se invierte (dos depósitos del mismo día entran los dos).

## 6. Alternativas descartadas

- **Comprobar dentro de `upsertProduct`, en la transacción del escritor.** Cerraría
  la carrera entre dos importaciones a la vez, pero cambia los tres escritores, que
  el intent pide no tocar («que no cambie cómo se importa un producto que ya
  existe»), y afectaría a los tests que llaman a los escritores directamente
  creando varios productos con la misma fecha inventada. La carrera es la misma que
  la F53 ya acepta («dos llamadas a `POST /api/import` a la vez no se ven»).
- **Reutilizar `DUPLICATE_PRODUCT_FILE` o `VALIDATION_ERROR`.** El primero
  significa «otro archivo de esta misma importación»; el segundo, «archivo mal
  escrito». Aquí el archivo puede estar bien escrito y el choque es con la base:
  tercer caso, tercer código, como el resto de `app-error.ts`.
- **Renombrar o juntar productos automáticamente.** Prohibido por el intent.

## 7. Documentos

- `docs/api-contract.md`, sección `### POST /api/import`: un párrafo junto al de
  la F53 («Archivos de producto») y una fila `SAME_OPENING_PRODUCT` en la tabla de
  códigos por archivo (la que tiene `DUPLICATE_PRODUCT_FILE`, línea ~3635).
- `docs/myinvestor-product-files.md` y `docs/trade-republic-product-files.md`: una
  fila en la tabla «Qué pasa cuando un archivo está mal» y una frase donde explican
  que el `name` identifica al producto.
- `docs/data-model.md`: la «Consecuencia que hay que conocer» de la clave
  `(bank, name)` (renombrar crea un producto nuevo) pasa a decir que, si el
  producto renombrado mantiene banco, tipo y `openedAt`, el archivo se rechaza.
  Lección 2 de `docs/lessons.md`: no hay columna nueva, así que no se tocan el
  bloque Prisma ni el diagrama.
- `docs/architecture.md`: ADR-045 nuevo y la línea «Revisado el YYYY-MM-DD por la
  feature 70 `product-file-same-opening`: …» encima del ADR-012 (su «Límite
  conocido: renombrar un producto en el fichero crea un producto nuevo»). Ningún
  ADR se reescribe.
- `docs/roadmap.md`: fila E5 con la F70.
