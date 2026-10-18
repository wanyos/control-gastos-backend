# Design — F61 `rule-suggestions`

> Rutas `GET /api/category-rules/suggestions` y `GET /api/category-rules/preview`:
> **propuesta pendiente de aprobación** (`decisions.md` 🔴 4).
> Se apoya en ADR-038 y en `specs/60-category-origin-and-rule-reapply/design.md`
> §10 («Lo que la feature 61 necesita»).

## 1. Dónde vive

| Archivo | Qué cambia |
|---|---|
| `src/modules/category-rules/category-rules.service.ts` | Se extrae el reparto a `planCategorization` (§2); `applyCategoryRules` lo usa sin cambiar su comportamiento; nueva `previewCategoryRule` (§4) |
| `src/modules/category-rules/category-rules.suggestions.ts` (nuevo) | `proposedMatchText` (pura, §3) y `listRuleSuggestions` (§5) |
| `src/modules/category-rules/category-rules.types.ts` | `RuleSuggestion`, `PreviewCategorizationResult`, `CategoryRulePreview`, `CategoryRulePreviewQuery` |
| `src/modules/category-rules/category-rules.schema.ts` | `previewCategoryRuleSchema` (querystring) |
| `src/modules/category-rules/category-rules.routes.ts` | `GET /suggestions` y `GET /preview` |

Un archivo aparte para las propuestas porque `category-rules.service.ts` ya
pasa de 300 líneas y la derivación del texto es pura y se prueba sola. No
toca la base salvo por las dos lecturas de `listRuleSuggestions`; la ruta sigue
sin referenciar Prisma (`src/architecture.test.ts`).

## 2. Una sola función de reparto (la que pide el leader: no copiar el casado)

```ts
/** A rule as the run sees it. `id` null = a rule that does not exist yet (preview, suggestions). */
export interface PlannableRule {
  id: number | null
  matchText: string
  categoryId: number
  category: { name: string; kind: CategoryKind }
}

export interface PlannedMovement {
  id: number; type: MovementType; description: string; bookingDate: Date; amount: Prisma.Decimal
}

export interface CategorizationPlan<R extends PlannableRule> {
  /** Movements a single category won, by ascending id, with every rule that matched. */
  writes: Array<{ movement: PlannedMovement; winner: R; matches: R[] }>
  /** Movements rules of two or more categories fought over, by ascending id. */
  conflicts: Array<{ movement: PlannedMovement; matches: R[] }>
  unmatched: number
}

/** Pure. The decision the loop of applyCategoryRules took inline until feature 61. */
export function planCategorization<R extends PlannableRule>(
  movements: PlannedMovement[],
  rules: R[],
): CategorizationPlan<R>
```

- Dentro usa `matchingRules` tal cual (F60). La regla «una sola categoría →
  escribir; dos o más → choque; ninguna → `unmatched`» vive **solo** aquí.
- `applyCategoryRules` pasa a: leer reglas y movimientos (igual que hoy) →
  `planCategorization` → por cada `writes[i]`, el mismo `updateMany` con
  `{ ...eligible, id }` y `categorySource: 'rule'`; lista solo si `count === 1`.
  `conflicts` y `unmatched` salen del plan. Comportamiento idéntico (R13): los
  tests existentes de `category-rules.service.test.ts`,
  `category-rules.routes.test.ts` e `import.service.test.ts` no se tocan.
- La conversión plan → `CategorizedMovement` / `CategorizationConflict` va en
  dos ayudantes (`toCategorizedMovement`, `toCategorizationConflict`) que usan la
  pasada y la consulta previa: la forma no puede divergir.
- `includes` del tipo genérico: `matchingRules` ya es genérica sobre
  `{ matchText; categoryId; category: { kind } }`; `PlannableRule` lo cumple.

## 3. El texto propuesto (pura)

```ts
/** R2–R4. Returns null when no proposal can come out of this description. */
export function proposedMatchText(description: string): string | null
```

Pasos (R2), sobre `normalizeForMatch(description)`:

1. `/[ ,]+concepto\b/`: si aparece en una posición > 0, cortar desde ahí.
2. `/^[a-z. ]{1,24}\/\s*/`: si casa, quitarlo.
3. Recorrer las palabras (`/\S+/g`, guardando posición); el primer tramo de
   palabras seguidas sin `\d` se toma **por posiciones** de la cadena (no se
   re-une con un espacio: si el banco puso dos espacios, el texto los conserva y
   sigue siendo un trozo de la descripción, R3).
4. Quitar `^[^\p{L}\p{N}]+` y `[^\p{L}\p{N}]+$`.
5. Menos de `minimumSuggestionLength = 5` caracteres → `null` (R4).

Ejemplos inventados para los tests (ninguno sale de la base):

| Descripción | Texto propuesto |
|---|---|
| `RECIBO /Academia Ficticia Norte` | `academia ficticia norte` |
| `SUPERMERCADO INVENTADO 4521` | `supermercado inventado` |
| `BIZUM DE PERSONA INVENTADA CONCEPTO cena` | `bizum de persona inventada` |
| `TRANSF ENVIO, CONCEPTO alquiler ficticio` | `transf envio` |
| `ANUL. /Tienda Sintetica` | `tienda sintetica` |
| `8812 KIOSCO DE PRUEBA` | `kiosco de prueba` |
| `REFERENCIA 00001234 CUOTA` | `referencia` |
| `PERIODO 01/01/2026 01/02/2026` | `periodo` (la barra va tras dígitos: el paso 2 no casa) |
| `TALLER SINTETICO - -` | `taller sintetico` |
| `ABC 1234` | `null` (3 caracteres) |

## 4. Consulta previa

```ts
export async function previewCategoryRule(
  prisma: AppPrismaClient,
  input: CreateCategoryRuleBody,
): Promise<CategoryRulePreview>
```

1. Mismas validaciones que `createCategoryRule`, sin escribir:
   `normalizedMatchTextOrThrow` (400), `assertCategoryExists` (404) y, nuevo,
   `findUnique({ where: { matchText } })` → `ConflictError` con el **mismo
   mensaje** que el P2002 de `createCategoryRule` (409). El mensaje se saca a una
   función para no escribirlo dos veces.
2. Lee reglas y movimientos **exactamente** como `applyCategoryRules` con
   `'pendingAndClosing'` (misma `include`, mismo `select`, mismo `orderBy`): se saca
   a `readCategorizationInput(prisma, scope)` y lo usan los dos.
3. Añade la regla hipotética `{ id: null, matchText, categoryId, category: { name, kind } }`
   **al final** (una regla recién creada tiene el id más alto: mismo orden en
   `matches` que tras el `POST`).
4. `planCategorization` → `PreviewCategorizationResult` con los mismos ayudantes;
   todo lo de `writes` se da por escrito (`categorized = writes.length`).

Tipos:

```ts
/** CategorizationResult where a rule may be the one not created yet (ruleId null). No `error`: a failure is a 500 here, nothing was saved. */
export interface PreviewCategorizationResult { … mismos campos, ruleId: number | null en rules[] y matches[] }
export interface CategoryRulePreview { matchText: string; categoryId: number; categorization: PreviewCategorizationResult }
```

Querystring: `{ matchText: string minLength 1, categoryId: integer minimum 1 }`,
los dos obligatorios, `additionalProperties: false`. Un parámetro desconocido:
comprobar si AJV lo quita en silencio en querystring como en body
(`src/lib/strict-body.ts`); si lo quita, usar `assertOnlyAllowedBodyProperties`
sobre `request.query` igual que el `POST` hace con el body.

Por qué `GET` y no `POST`: no escribe nada y se puede repetir; el texto viaja
codificado en la URL (el frontend usa `URLSearchParams`).

**Exactitud (R10).** Con los mismos datos, `preview.categorization` es igual a
la `categorization` del `POST` posterior cambiando `null` por el id creado. Solo
puede diferir si entre las dos peticiones cambian movimientos o reglas; se dice
en el contrato.

## 5. Lista de reglas propuestas

```ts
export async function listRuleSuggestions(prisma: AppPrismaClient): Promise<RuleSuggestion[]>

export interface RuleSuggestion {
  matchText: string
  kind: CategoryKind
  movementCount: number
  movements: Array<{ movementId: number; description: string; bookingDate: string; amount: string }>
  manualMatches: number
}
```

1. `readCategorizationInput(prisma, 'pendingAndClosing')` (§4.2): reglas y
   movimientos elegibles. Más una lectura de los `manual` (`id`, `type`,
   `description`) para `manualMatches`.
2. Por cada `kind` (`expense`, `income`): candidatos = `proposedMatchText` de los
   movimientos elegibles de ese tipo con `matchingRules(...).length === 0` (R5),
   sin repetidos.
3. Por candidato: regla hipotética `{ id: null, matchText, categoryId: -1, category: { name: '', kind } }`
   (categoría que no coincide con ninguna real) → `planCategorization(elegiblesDeEseTipo, [...reglas, hipotética])`
   → `movements` = los `writes` cuyo `winner.id === null` (R6). Un elegible que casa
   con la hipotética y con una existente sale como choque y no cuenta: al crear la
   regla, o choca o va a la otra categoría.
   Para no recorrer todo por cada candidato, se puede filtrar antes a los que
   `normalizeForMatch(description).includes(matchText)`: el resultado es el mismo
   porque `planCategorization` es por movimiento.
4. Quitar las que tienen menos de 3 (R7) y las contenidas en otra (R8).
5. `manualMatches` (R9); ordenar (R1).

`movementCount === movements.length` siempre. Coincidencia con la creación: crear
la regla con ese texto y una categoría de ese `kind` escribe exactamente esos
movimientos **por esa regla** (en la respuesta del `POST`, los
`categorizedMovements` cuyo `rules` incluye el id nuevo); el test lo comprueba.
Si en ese momento hay elegibles que las reglas existentes moverían por sí solas
(no debería: crear o cambiar una regla ya los mueve, F60), también saldrían en
esa respuesta, pero no son de la propuesta.

## 6. Lo medido en la base real (2026-10-18, solo lectura)

`SET default_transaction_read_only=on;` en `gastos-postgres`, base `gastos`. Se
exportaron movimientos y reglas a un archivo temporal fuera del repositorio y se
simuló este algoritmo con un guion aparte (no es el código de la feature). Nada
se escribió. Sin conceptos ni cifras del humano aquí.

- Todo lo de las dos genéricas está en `closing`; no hay pendientes. Ninguna
  regla existente casa con ellos (igual que midió la F60).
- Con R2–R8: **unas 65 propuestas** (unas 50 de gastos y 15 de ingresos) que
  juntas recogen **unos cuatro de cada cinco** movimientos de las dos genéricas.
  Con mínimo 2 movimientos en vez de 3: unas 95 propuestas y algo más de
  cobertura (unos cinco puntos).
- Sin el mínimo de 5 caracteres apareció una propuesta de 3 letras que, por
  casar «dentro» de otras palabras, recogía la décima parte de los gastos de la
  genérica, de diez conceptos distintos. Con 5 desaparece y el resto no cambia.
- Tomar el **primer** tramo sin números, y no el más largo, da el nombre del
  comercio cuando el banco pone detrás la ciudad o el número de tienda.
- Casos raros vistos:
  - **Transferencias y bizums a personas**: el texto lleva la fórmula del banco y
    el nombre de la persona; sale una propuesta por persona. Cortar en «concepto»
    junta todas las de una misma persona aunque cambie el texto libre.
  - **Recibos** (`RECIBO /`, `RECIB /`): quitar la palabra del banco junta las
    variantes del mismo emisor; cuando el emisor cambia el nombre (p. ej. termina
    en `SL` y luego en `SA`) salen dos propuestas.
  - **Referencias numéricas** (aperturas de depósito, tributos, periodos): el
    corte en el primer número las junta en una propuesta.
  - **Conceptos que corta el banco** (los de tarjeta, a ~22 caracteres): el mismo
    comercio escrito entero y cortado sale como dos propuestas, o con el nombre
    de la persona escrito en dos órdenes. No se arregla aquí (hoja ⚠️).
  - **Puestos a mano**: cuatro propuestas contienen también algún movimiento
    `manual` del mismo tipo (uno en cada una). Excluirlas quitaría dos de las tres
    más grandes (hoja 🔴 3).
  - **Un texto corto casa dentro de otras palabras**: de los movimientos que
    recogía la propuesta de 3 letras citada arriba, solo uno tenía esas letras
    como palabra suelta.
- La simulación tardó menos de un segundo; **no he medido** el tiempo del código
  real porque no existe todavía.

## 7. Errores

Ninguno nuevo: `ValidationError` (400), `NotFoundError` (404), `ConflictError`
(409) de F43. La lista de propuestas no tiene parámetros: solo puede fallar con
un 500.

## 8. Documentos que la feature vuelve falsos

| Documento | Qué se corrige |
|---|---|
| `docs/api-contract.md` | Dos secciones nuevas tras `POST /api/category-rules/apply`: `### GET /api/category-rules/suggestions` y `### GET /api/category-rules/preview`, con lo de R14 y un ejemplo inventado cada una. Y una línea en `### POST /api/category-rules` remitiendo a la consulta previa |
| `README.md` | Dos filas en la tabla de endpoints |
| `docs/architecture.md` | ADR-039 (§9) |

`docs/data-model.md` no cambia: ni columnas ni tablas nuevas.

## 9. ADR-039

**Título:** «Las propuestas de reglas y la consulta previa se calculan al leer, con
la misma función de reparto que la pasada de categorización, y no guardan nada».

Contexto (F60 recoloca lo `closing`; el humano no quiere que la aplicación cree
reglas sola), decisión (§2–§5), alternativas descartadas:

- **Guardar las propuestas en una tabla** y recalcularlas al importar: cuadrar
  esa tabla con reglas y movimientos que cambian es justo lo que puede hacer que
  el número no coincida.
- **Copiar el casado en la consulta** (un `ILIKE` en SQL): rápido, pero es otra
  definición de «casa» (normalización, `kind`, choques) que puede divergir de la
  pasada. Es lo que el humano pidió que no pase.
- **Agrupar por descripción exacta** (sin sacar texto): solo junta repeticiones
  idénticas; con números de tienda, referencias y textos libres de transferencias
  deja fuera buena parte.
- **Proponer también la categoría** (por ejemplo, la que tienen los `manual` que
  contienen el texto): no lo pidió («yo solo elijo la categoría»).

## 10. Alternativa descartada (diseño)

- **Una sola consulta** que devuelva las propuestas y acepte un `matchText`
  opcional para la consulta previa: mezcla dos respuestas de forma distinta (lista
  frente a resultado de pasada) en una ruta; dos rutas con una forma cada una se
  documentan y se prueban mejor.
