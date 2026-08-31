# Design — F31 `real-account-balance`

> Material del `implementer` y del `reviewer`. Se apoya en
> `docs/architecture.md` y `docs/conventions.md`: aquí solo está lo que esta
> feature añade o roza.
>
> **ADR-017.** Ni un importe real. Los números de los ejemplos son inventados.

## 1. La idea en una frase

Hoy el saldo tiene **dos caminos** (el `balanceAfter` más reciente, o una suma
desde `initialBalance` como *fallback*). Después de esta feature tiene **uno
solo**: se busca el **punto de anclaje efectivo** y se suma lo posterior a él.

```
saldo = importe(punto de anclaje) + neto(movimientos posteriores al punto)
```

Eso hace verdaderas a la vez las tres cosas que el intent pide y que parecían
tirar en direcciones distintas:

| Lo que pide el intent | Por qué sale de la fórmula |
|---|---|
| Manda el saldo del archivo donde lo hay (aviso 2) | El `balanceAfter` más reciente suele ser el punto de anclaje, y entonces el saldo arranca de él |
| Pero el archivo no es lo último (aviso 7) | Lo posterior al punto se suma igual |
| El cálculo corre siempre, desde el ancla, no desde 0 (aviso 2) | Sin `balanceAfter`, el punto es el ancla, y la suma es el saldo |

**La regla de precedencia no se toca**: sigue ganando el dato del archivo. Lo que
desaparece es que la suma fuera un *fallback*.

## 2. Modelo de datos

`prisma/schema.prisma`, `model Account` (hoy en la línea 70):

```prisma
  /// Importe del ancla, tal cual lo escribió el archivo. NULL = sin anclar.
  balanceAnchor            Decimal?  @db.Decimal(10, 2)
  /// Fecha del movimiento al que corresponde el ancla.
  balanceAnchorDate        DateTime? @db.Date
  /// Posición dentro de ese día, para desempatar. NULL cuando el banco no la da.
  balanceAnchorDaySequence Int?
```

Migración nueva en `prisma/migrations/<timestamp>_balance_anchor/`. Solo añade
columnas nullable: no reescribe una sola fila.

**Por qué campos nuevos y no `initialBalance`.** `initialBalance` no tiene fecha,
y sin fecha el ancla no puede ser inmune al orden de importación (aviso 6): no
habría forma de saber qué movimientos ya estaban dentro del importe. Y su cero
por defecto es indistinguible de un cero real, que es justo lo que el humano
marcó como decisión (`delego_en_agente` 1). `initialBalance` **se queda como
está**, con su significado actual, y solo lo usa R8.

**Los tres campos se escriben y se leen siempre juntos.** El invariante es
«`balanceAnchor` y `balanceAnchorDate` son ambos NULL o ambos no NULL». La
migración lo declara con un `CHECK`, para que no dependa de que nadie se
despiste:

```sql
ALTER TABLE "Account" ADD CONSTRAINT "Account_balance_anchor_pair"
  CHECK (("balanceAnchor" IS NULL) = ("balanceAnchorDate" IS NULL));
```

## 3. Cálculo del saldo

`src/modules/movements/movements.service.ts`.

```ts
/** Un importe con el punto de la historia al que corresponde. */
export interface BalanceAnchor {
  amount: DecimalLike
  bookingDate: Date
  daySequence: number | null
}

/** Lee el ancla de una cuenta, o `null` si no está anclada. */
export function readAnchor(account: {
  balanceAnchor: Prisma.Decimal | null
  balanceAnchorDate: Date | null
  balanceAnchorDaySequence: number | null
}): BalanceAnchor | null

/**
 * El punto desde el que se suma: el más reciente entre el ancla guardada y el
 * movimiento más reciente que trae `balanceAfter` (R7).
 */
export function resolveAnchorPoint(
  anchor: BalanceAnchor | null,
  movements: BalanceMovement[],
): BalanceAnchor | null

/**
 * TERCER parámetro, opcional: todo llamador que no lo pase se comporta como
 * hoy. Con ancla, aplica la fórmula de la §1 (R6..R10).
 */
export function computeAccountBalance(
  initialBalance: DecimalLike,
  movements: BalanceMovement[],
  anchor?: BalanceAnchor | null,
): Prisma.Decimal
```

Comparación de recencia: la que ya existe en `byMostRecent`, `(bookingDate,
daySequence)` con `daySequence ?? 0`. **No se duplica**: se extrae a un
`isAfter(a, b)` que usan `resolveAnchorPoint` y el filtro de posteriores, para
que no puedan divergir.

### Un test existente cambia de resultado, a propósito

`src/modules/movements/movements.test.ts:118` afirma hoy que un movimiento sin
`balanceAfter` **no** mueve el saldo respecto del que sí lo trae. Con el aviso 7
eso deja de ser cierto **cuando ese movimiento es posterior**. El implementer
debe reescribir ese caso en dos: posterior (suma) y anterior (no suma). No es una
regresión: es la línea del intent que dice que el archivo no es lo último.

### `attachBalances`

`src/modules/accounts/accounts.service.ts:53` deja de necesitar su rama de
*fallback* (la consulta extra para las cuentas cuyos movimientos no traen
saldo), pero **necesita otra cosa**: los movimientos **posteriores** al punto de
anclaje, que ya no son «uno». El `include` pasa de `take: 1` sobre los que traen
saldo a traer, por cuenta, el más reciente con saldo **y** los posteriores al
punto. Se resuelve con dos consultas por lote (no una por cuenta): la del
movimiento-con-saldo más reciente de cada cuenta, y la de los posteriores al
punto ya resuelto. Cuatro cuentas y un puñado de movimientos recientes: no hace
falta nada más listo que eso.

## 4. Anclaje en la importación

`src/modules/import/import.service.ts`.

```ts
/**
 * El ancla que un archivo ofrece, o `null` si no ofrece ninguna (R1, R2, R4, R5).
 * Pura: ni base de datos ni reloj. El preámbulo manda sobre el saldo por línea.
 */
export function deriveAnchorFromStatement(statement: ParsedStatement): BalanceAnchor | null

/** Ancla la cuenta SOLO si no lo estaba (R3). Devuelve si la ancló ahora. */
export async function anchorAccountIfMissing(
  prisma: AppPrismaClient,
  accountId: number,
  anchor: BalanceAnchor,
): Promise<boolean>
```

`deriveAnchorFromStatement` decide así, y en este orden:

1. Si `statement.accountBalance !== null` → ancla = ese importe, con la fecha y
   el `daySequence` del movimiento **más reciente** del archivo. El preámbulo es
   el saldo de la CUENTA y gana al de una línea.
2. Si no, y alguna línea trae `balance` → ancla = el `balance` de la línea más
   reciente, con su propia fecha y `daySequence`.
3. Si no → `null` (R5).

`accountBalance === 0` entra por la rama 1 como cualquier otro importe (R4). El
`!== null` explícito es lo que lo garantiza: un `if (statement.accountBalance)`
sería el bug.

**Dónde se engancha.** En `importStatement`, después de `persistMovements` y
antes de marcar `status: 'imported'`. Después, no antes, porque la fecha del
ancla sale de los movimientos del archivo y porque un archivo que falla no debe
dejar la cuenta anclada.

`anchorAccountIfMissing` es un `updateMany` con `where: { id, balanceAnchor:
null }`. La condición viaja **en el WHERE, no en un `if` previo**: es lo que hace
que R3 se cumpla aunque dos importaciones corran a la vez, sin transacción.

**Reporte.** `StatementResult` gana `anchored: boolean` y `AccountReport` gana
`balanceAnchor: string | null`. Es el eco mínimo para que el humano vea en el
resultado del import que la cuenta quedó anclada. No es el aviso de desviación:
eso es la F32.

## 5. Relleno del saldo por línea

`persistMovements` gana un segundo paso (R12, R13):

```ts
/**
 * Rellena el `balanceAfter` de las filas que ya existen y lo tienen a NULL.
 * NUNCA sobrescribe uno guardado: la condición `balanceAfter: null` va en el
 * WHERE. Solo se ejecuta con las filas que el `createMany` contó como duplicadas.
 */
export async function backfillMissingBalances(
  prisma: AppPrismaClient,
  rows: Prisma.MovementCreateManyInput[],
): Promise<number>
```

Se identifica cada fila por las mismas columnas que el índice parcial
`Movement_imported_dedup_key` ya usa para deduplicar, para que «la misma fila»
signifique lo mismo en los dos sitios. Si el `createMany` no reportó duplicados,
esta función no hace ninguna consulta.

Con esto, R15 sale gratis: la reimportación local de la F25 pasa por
`importStatement`, así que ancla y rellena sin una línea de código nueva ni un
script de migración de datos.

## 6. Openbank: la reversión

`src/modules/openbank/openbank.statement.parser.ts:331` devuelve hoy `balance:
null` con un comentario que dice que es a propósito. Pasa a devolver el importe
ya parseado de `cells[4]`, que la función **ya calcula** para validar la fila: el
cambio es de una línea, y no cambia qué filas se aceptan.

Los textos que hay que corregir en el mismo lote, porque hoy afirman lo
contrario (aviso 5 — este proyecto ya perdió una sesión por documentación
desfasada):

- `src/modules/openbank/openbank.statement.parser.ts` — el bloque WHAT IS
  DELIBERATELY DROPPED de la cabecera y el comentario de la línea 310.
- `src/modules/openbank/openbank.types.ts:59` — «this bank does report and this
  parser drops».
- `progress/implementations/openbank-statement.md`.
- `docs/api-contract.md:944` y :1395 — la tabla de qué banco trae `balance`.

**ADR-013 no se deroga.** Lo que decía era «el dato que el fichero no trae es
`null`»; Openbank sí lo trae, así que dejar de tirarlo lo **cumple** mejor que
antes. Lo que se revierte es la decisión de producto de la F19 de no guardarlo.
El ADR nuevo de esta feature lo dice con esas palabras.

## 7. Contrato de API

`docs/api-contract.md` (fuente de verdad del frontend; el frontend **no se toca
en esta sesión**, regla de oro del workspace):

- `balance` — se reescribe su definición (líneas 169 y 285). Deja de ser «el
  `balanceAfter` del último movimiento, o si no una suma» y pasa a ser «el saldo
  del punto de anclaje más lo posterior a él».
- `balanceAnchor` (string decimal | `null`) y `balanceAnchorDate`
  (`YYYY-MM-DD` | `null`) — campos nuevos de la cuenta (R14).
- `initialBalance` — se queda, con una nota de que ya solo actúa en una cuenta
  sin ancla y sin saldos por línea.

Se añade también una línea a `docs/dar-de-alta-un-banco.md`: la línea `saldo;`
de N26 y MyInvestor hace falta **una vez** por cuenta (aviso 9).

## 8. Errores

**Ninguna excepción nueva.** Un archivo sin ancla no es un error (R5), y una
cuenta sin anclar no es un estado inválido: es una cuenta que todavía no ha visto
un archivo con saldo. La única forma de fallar sigue siendo la que ya existe.

## 9. Alternativas descartadas

1. **Guardar el saldo de partida despejado** (`ancla − neto hasta la fecha del
   ancla`) en `initialBalance`. Descartada por el aviso 6: solo es correcto si
   los movimientos anteriores al ancla ya están dentro. Importar después un mes
   antiguo lo estropea en silencio, y el humano marcó justo eso como su
   preocupación.
2. **Un booleano `isAnchored` junto a `initialBalance`.** Resuelve distinguir
   «anclada» de «vale 0», pero no da la fecha, así que no resuelve el orden.
   Dos campos nullable dan las dos cosas con menos columnas.
3. **Almacenar el saldo calculado en la tabla y refrescarlo al importar.**
   Descartada: hoy `balance` se calcula por petición y no se guarda
   (`docs/api-contract.md:169`); un saldo almacenado es un saldo que se puede
   quedar viejo, que es exactamente lo que el humano dice en su `por_que`.
4. **Un script one-shot de migración de datos** para anclar las cuentas y
   rellenar Openbank. Descartada a favor de la reimportación local que ya
   existe: un script se ejecuta una vez y se olvida, y no arregla el mismo caso
   la próxima vez.
