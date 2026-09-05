# Design — F37 `categories-and-tagging`

> Encaja con `docs/architecture.md` (ADR-005 errores, ADR-011 modelo) y
> `docs/conventions.md`. **Cero migración**: `Category`, `Movement.categoryId` y
> `Movement.status` existen desde la F8; esta feature les da escritor por API.

## 1. Alcance de superficie HTTP

| Método y ruta | Nueva | Qué hace |
| --- | --- | --- |
| `GET /api/categories` | no | Sin cambios (F8). |
| `POST /api/categories` | no | Sin cambios (F8). |
| `PATCH /api/categories/:id` | **sí** | Renombra (`{name}` y nada más). |
| `DELETE /api/categories/:id` | **sí** | Borra si no está en uso; 409 si tiene movimientos o hijas. |
| `PATCH /api/movements/:id` | **sí** | Actualiza **solo** `categoryId` y/o `status` de un movimiento existente. |

⚠️ `GET /api/movements` deja de ser el único endpoint de movimientos, pero la
regla de fondo **no cambia**: los movimientos siguen sin crearse ni borrarse por
API (`specs/08-data-model/design.md` §5). El comentario «READ-ONLY on purpose»
de `src/modules/movements/movements.routes.ts` se reescribe para decir esto
mismo con precisión: solo lectura del hecho bancario; dos campos de anotación
(`categoryId`, `status`) editables.

## 2. Módulo `categories` (lote A)

Archivos: `categories.routes.ts`, `categories.schema.ts`,
`categories.service.ts`, `categories.types.ts`, `categories.test.ts` — todos en
`src/modules/categories/`.

Firmas nuevas en `categories.service.ts` (mismo patrón que `createCategory`):

```ts
export async function renameCategory(
  prisma: AppPrismaClient,
  id: number,
  input: RenameCategoryBody,          // { name: string }
): Promise<Category>                  // NotFoundError 404, ConflictError 409 (P2002)

export async function deleteCategory(
  prisma: AppPrismaClient,
  id: number,
): Promise<void>                      // NotFoundError 404; ConflictError 409 si
                                      // count(movements) > 0 o count(children) > 0,
                                      // con el nº de movimientos en el message
```

Esquemas: `renameCategorySchema` (params `id` entero ≥1; body
`{ name: minLength 1 }`, `additionalProperties: false`) y
`deleteCategorySchema` (solo params). `DELETE` responde `204` sin cuerpo.

El `kind` y el `parentId` **no** aparecen en el body de `PATCH`: inmutables por
esta vía (R3). El trim del `name` replica el de `createCategory`.

## 3. Módulo `movements` (lote B)

Archivos: `movements.routes.ts`, `movements.schema.ts`, `movements.service.ts`,
`movements.types.ts`, `movements.test.ts` — en `src/modules/movements/`.

Firma nueva en `movements.service.ts`:

```ts
export interface UpdateMovementBody {
  categoryId?: number | null   // null = quitar la categoría
  status?: 'confirmed' | 'pending_review'
}

export async function updateMovement(
  prisma: AppPrismaClient,
  id: number,
  input: UpdateMovementBody,
): Promise<SerializedMovement>   // el serializador existente, con category embebida
```

Validaciones en el servicio, en este orden:

1. El movimiento existe → si no, `NotFoundError` (R11).
2. Si viene `categoryId` numérico: la categoría existe → si no, `NotFoundError`
   (R11); y `category.kind === movement.type` con `movement.type !== 'neutral'`
   → si no, `ValidationError` (R9).
3. `prisma.movement.update` con **exclusivamente** `categoryId` y/o `status` en
   `data` (R15): ningún otro campo puede viajar porque el tipo del input no lo
   admite y el esquema HTTP lo rechaza antes.

Esquema `updateMovementSchema`: params `id` entero ≥1; body con
`additionalProperties: false`, `minProperties: 1` (un `{}` es 400, R12),
`categoryId` como `integer ≥ 1 | null`, `status` como enum de dos valores.

Errores: se **reutilizan** `NotFoundError`, `ConflictError` y `ValidationError`
de `src/errors/app-error.ts` (ADR-005). Ningún código de error nuevo en la
tabla del contrato.

## 4. Siembra de la lista de arranque (lote C)

**Decisión (delegada): un comando manual e idempotente, no una migración ni un
paso de arranque.**

- Lista y lógica en `src/modules/categories/categories.seed.ts`:

  ```ts
  export const defaultCategories: ReadonlyArray<{ name: string; kind: CategoryKind }>
  // las 16 del intent, todas raíz

  export async function seedDefaultCategories(
    prisma: AppPrismaClient,
  ): Promise<{ created: number; skipped: number }>
  ```

  Implementación: `prisma.category.createMany({ data, skipDuplicates: true })`.
  La idempotencia la da el índice único `(parentId, kind, name)` **NULLS NOT
  DISTINCT** que ya existe (F8): la segunda ejecución inserta 0 y no toca las
  filas existentes (R14). Nada se actualiza ni se borra jamás desde la siembra.

- Envoltorio CLI en `prisma/seed-categories.ts` (crea el cliente como
  `src/lib/prisma.ts`, ejecuta, imprime `{created, skipped}`, desconecta) y
  script npm en `package.json`: `"seed:categories": "tsx prisma/seed-categories.ts"`.

**Alternativas descartadas** (mínimo una, van las tres consideradas):

1. **Sembrar en una migración de Prisma** — se ejecutaría también en
   `gastos_test_template` y por clonación en **todas las bases de test**
   (`docs/conventions.md` §Tests con base de datos): cada test de categorías
   pasaría a convivir con 16 filas que no creó, y la comprobación global de
   filas sobrantes del final de la suite dejaría de distinguir lo sembrado de
   lo olvidado. Además ata datos de producto al histórico del esquema.
2. **Sembrar al arrancar el servidor** — se re-ejecutaría en cada arranque: si
   el humano renombra «Ocio», el siguiente arranque **resucitaría** «Ocio»
   junto a la renombrada. Rompe «poder afinarla después sin tocar código».
3. **Endpoint `POST /api/categories/seed`** — superficie HTTP para una acción
   de instalación que se ejecuta una vez; y el contrato lo leería el frontend
   como algo suyo, que no es.

El comando manual comparte el límite 2 en menor grado (re-ejecutarlo tras un
renombre re-crea el nombre viejo), pero solo corre cuando el humano lo lanza;
queda avisado en `decisions.md` §📌.

## 5. Lo que esta feature NO toca

- **Importación, saldos y totales**: `computeTotals` y
  `computeAccountBalance` no se modifican; R15 lo verifica con test.
- **Subcategorías**: `parentId` sigue existiendo y `POST` sigue admitiéndolas
  (F8), pero nada nuevo las usa; la siembra crea solo raíces.
- **Traspasos y aportaciones**: ni categoría ni marca; van por
  `transferId`/`productId` en features posteriores (aviso del intent).
- **Categorización automática por reglas**: feature posterior (la tabla
  «Columnas reservadas» de `docs/data-model.md` se actualiza para reflejar que
  `categoryId` y `status` ganan su escritor **manual** aquí y el automático
  sigue pendiente).

## 6. Documentación (lote D)

- `docs/api-contract.md`: los tres endpoints nuevos con sus tablas de errores;
  actualizar las notas «hoy siempre `null`» de `category`/`categoryId` y la
  nota «es el único endpoint de movimientos»; dejar claro que sigue sin haber
  `POST`/`DELETE` de movimientos.
- `docs/data-model.md`: filas `categoryId` y `status` de «Columnas reservadas»
  (escritor manual F37; el automático por reglas sigue pendiente) y la línea de
  «Categorías» en §Reglas de negocio.
