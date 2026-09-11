# Design — F43 `auto-categorization`

> Encaja con `docs/architecture.md` (ADR-005 errores) y `docs/conventions.md`.
> Precedentes que se copian: el módulo `transfers` (una función de pasada que
> nunca lanza y cuyo resultado viaja en el informe de importación, F40) y la
> siembra por comando de la F37 (`prisma/seed-categories.ts`).
> **Hay migración**: tabla nueva `CategoryRule` (la primera desde
> `Movement.undoneTransferId` de la F44).

## 1. Dónde viven las reglas: tabla con API (decisión delegada)

Tabla `CategoryRule` en Prisma + CRUD bajo `/api/category-rules`.

**Alternativa descartada: archivo escrito a mano** (tipo Trade Republic). Más
simple hoy (sin migración, sin CRUD), pero: (a) el editor de reglas del
frontend está previsto («otra sesión») y sin API no tendría contra qué
construirse; (b) cada corrección sería editar+validar un fichero, y las
correcciones van a ser frecuentes al principio; (c) un fichero versionado con
textos sacados de sus extractos roza el guardián de datos reales (ADR-017). La
tabla deja las reglas donde ya están sus categorías.

```prisma
model CategoryRule {
  id         Int      @id @default(autoincrement())
  category   Category @relation(fields: [categoryId], references: [id])
  categoryId Int
  /// Stored ALREADY normalized (lowercase, no diacritics, trimmed).
  matchText  String   @unique
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}
```

`Category` gana la relación inversa `rules CategoryRule[]`. FK con el
`Restrict` por defecto: la guarda amable la pone el servicio (R16).

## 2. Módulo nuevo `src/modules/category-rules/`

Archivos: `category-rules.routes.ts`, `category-rules.schema.ts`,
`category-rules.service.ts`, `category-rules.types.ts`,
`category-rules.seed.ts`, `category-rules.service.test.ts`,
`category-rules.routes.test.ts`. Registro en `src/app.ts` con prefijo
`/api/category-rules` (mismo patrón que `transfersRoutes`).

Firmas principales (`category-rules.service.ts`):

```ts
export function categoryRulesDb(app: FastifyInstance): AppPrismaClient

/** lowercase + NFD sin marcas diacríticas + trim. Vive aquí: no es un formato de banco. */
export function normalizeForMatch(text: string): string

export async function createCategoryRule(prisma, input: { categoryId: number; matchText: string })
export async function listCategoryRules(prisma)
export async function updateCategoryRule(prisma, id: number, input: { categoryId?: number; matchText?: string })
export async function deleteCategoryRule(prisma, id: number)

/** La pasada. NUNCA lanza (mismo contrato que detectTransfers): el fallo va en result.error. */
export async function applyCategoryRules(prisma: AppPrismaClient): Promise<CategorizationResult>
```

```ts
export interface CategorizationConflict {
  movementId: number
  description: string
  bookingDate: string            // ISO date
  matches: Array<{ ruleId: number; matchText: string; categoryId: number; categoryName: string }>
}

export interface CategorizationResult {
  categorized: number            // R7
  conflictCount: number
  conflicts: CategorizationConflict[]   // R9/R10; [] cuando no hay
  unmatched: number              // elegibles que ninguna regla casó (R10)
  error?: { code: string; message: string }   // R12, patrón describeDetectionError
}
```

## 3. La pasada (R6–R11, R14)

1. Lee todas las reglas con su categoría (`kind` incluido).
2. Lee los movimientos elegibles: `categoryId: null`, `status:
   'pending_review'`, `type in ('expense','income')` (R8). Nada más entra en
   memoria; lo protegido queda fuera ya en el `WHERE`.
3. Por movimiento: normaliza `description` una vez y evalúa solo las reglas
   cuyo `category.kind === movement.type` (R6). Junta las categorías DISTINTAS
   de las reglas que casan:
   - exactamente una → `updateMany({ where: { id, categoryId: null, status:
     'pending_review' }, data: { categoryId } })` — el `WHERE` re-comprueba la
     elegibilidad para que una escritura concurrente nunca pise nada (mismo
     seguro que el `WHERE transferId: null` de la F40). Solo `categoryId` viaja
     en `data` (R14).
   - cero o más de una → no escribe; suma a `unmatched` o a `conflicts` (R9).
4. Idempotencia gratis (R11): lo asignado deja de ser elegible en la lectura
   del paso 2, igual que una pierna enlazada deja de ser candidata en la F40.
5. Todo envuelto en `try/catch` que devuelve `result.error` (R12); reutiliza el
   patrón `describeDetectionError` de `transfers.service.ts` (se copia el
   patrón, no se comparte la función: sanea igual, módulo distinto).

Dos reglas de la MISMA categoría que casan a la vez no son conflicto: apuntan
al mismo sitio.

## 4. Encaje en la importación (R12) y bajo demanda (R13)

- `src/modules/import/import.service.ts:432` y
  `src/modules/import/import.local.service.ts:126` añaden `categorization:
  await applyCategoryRules(prisma)` DESPUÉS de `detectTransfers` (el orden
  importa poco —la categorización no mira `transferId`— pero se fija para que
  el informe sea estable).
- `import.types.ts`: `ImportRunResult` y `LocalImportRunResult` ganan
  `categorization: CategorizationResult`, siempre presente con ceros y `[]`
  (misma regla que `transfers`: «no se encontró nada» ≠ «no se miró»).
- `POST /api/category-rules/apply` → `200` con `CategorizationResult` (R13).
  Acción bajo el mismo prefijo del módulo; precedente de rutas de acción:
  `/api/import/*`.

**Alternativa descartada: correr solo tras importar** (F40 no tiene endpoint).
Aquí no vale: tras corregir una regla el humano necesita repasar lo pendiente
sin tener que reimportar un archivo, y ese gesto va a ser el habitual las
primeras semanas.

## 5. Siembra de las reglas de arranque (R15)

**Comprobado el 2026-09-06:** las reglas concretas del análisis del 2026-09-01
no están escritas en el repositorio (buscado en `progress/explorations/` y en
todos los `.md`; solo existe la lista de 16 categorías,
`src/modules/categories/categories.seed.ts`). Por tanto el borrador de arranque
se REDACTA en esta feature:

- `category-rules.seed.ts` exporta `defaultCategoryRules:
  ReadonlyArray<{ categoryName: string; kind: CategoryKind; matchText: string }>`
  y `seedDefaultCategoryRules(prisma): Promise<{ created; skipped; missingCategories: string[] }>`.
  Resuelve cada `categoryName + kind` a su id (raíces, `parentId: null`); una
  categoría que no exista se salta y se reporta en `missingCategories` (R15) —
  el orden operativo es `seed:categories` primero, y si el humano renombró
  alguna, la regla huérfana se lista en vez de fallar todo.
- Idempotencia por `createMany({ skipDuplicates: true })` sobre el `@unique` de
  `matchText` (mismo mecanismo que la F37).
- Envoltorio CLI `prisma/seed-category-rules.ts` + script
  `"seed:category-rules": "tsx prisma/seed-category-rules.ts"` en
  `package.json`.
- **Contenido del borrador** (lo escribe el implementer, el humano lo corrige
  por API): patrones por categoría con nombres públicos de comercio/servicio y
  palabras habituales de extracto español — p. ej. cadenas de supermercado
  conocidas para «Supermercado», «bizum» para «Transferencias a personas»,
  «nomina» para «Nómina», comercios de suscripción conocidos para
  «Suscripciones». Restricciones duras: (a) **prohibido copiar un concepto
  literal multi-palabra de sus extractos** (`var/` no se abre para redactar el
  seed); solo marcas/palabras públicas de una o dos palabras — además de
  política, es lo que el guardián ADR-017 no puede confundir con un dato suyo
  (su capa de comparación no caza conceptos de menos de tres palabras, y una
  marca pública no es un dato personal); (b) todo `matchText` cumple R2
  (≥3 caracteres normalizados, únicos); (c) tamaño contenido, ~2-6 reglas por
  categoría: es un borrador para corregir, no una enciclopedia. La cobertura
  real se mide en la prueba real del cierre (los contadores de R10 la dan) y el
  ajuste fino es del humano, por API.

**Alternativas descartadas:** sembrar en migración o al arrancar — mismas tres
razones que la F37 (bases de test contaminadas, resurrección tras un renombre,
superficie HTTP para una acción de instalación); y empezar con la tabla vacía —
lo descartó el humano el 2026-09-06.

## 6. Guarda de borrado en categorías (R16)

`deleteCategory` (`src/modules/categories/categories.service.ts`) añade
`count(rules)` a los chequeos existentes de movimientos e hijas: si hay reglas,
`ConflictError` 409 con el número. Sin esto el `Restrict` de la FK daría un
P2003 → 500 sin mensaje accionable.

## 7. Errores y validación

Se reutilizan `NotFoundError`, `ConflictError`, `ValidationError`
(`src/errors/app-error.ts`, ADR-005): ningún código nuevo en el contrato.
Esquemas AJV con `additionalProperties: false` + `assertOnlyAllowedBodyProperties`
en los POST/PATCH (patrón F44, `src/lib/strict-body.ts`). `minProperties: 1`
en el PATCH.

**Alternativa descartada de la forma de la regla:** prefijos, comodines o
expresiones regulares. Un «contiene» normalizado cubre lo que el análisis hacía
(el comercio aparece en algún punto del concepto, con mayúsculas y tildes
inestables entre bancos) y no puede fallar en silencio de formas nuevas; una
regex mal escrita sí (y `matchText` pasaría a ser código, contra «sin tocar
código»). Si algún día hace falta más expresividad, la columna admite añadir un
campo `matchType` sin romper nada.

## 8. Lo que esta feature NO toca

- El PATCH manual de movimientos de la F37, la detección de traspasos
  (F40/F41/F44), el dedup, el ancla y los saldos: cero cambios.
- `Movement.status`: la pasada no confirma nada; revisar sigue siendo del
  humano.
- Ninguna interfaz de reglas: solo API (frontend, otra sesión).

## 9. Documentación

- `docs/api-contract.md`: los 5 endpoints de `/api/category-rules` (CRUD +
  `apply`), el campo `categorization` del informe de importación (ambas vías),
  el 409 nuevo de `DELETE /api/categories/:id` por reglas.
- `docs/data-model.md`: tabla `CategoryRule`; la fila `categoryId` de
  «Columnas reservadas» pasa a decir que el escritor automático por reglas
  existe desde la F43 (el manual era la F37).
