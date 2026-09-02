# Design — F32 `balance-reconciliation`

> Material del `implementer` y del `reviewer`. Se apoya en
> `docs/architecture.md` y `docs/conventions.md`: aquí solo está lo que esta
> feature añade o roza.
>
> **ADR-017.** Ni un importe real. Los números de los ejemplos son inventados.
>
> **Vocabulario.** No se introduce ninguna palabra nueva. En prosa se usa
> «descuadre» (palabra del propio `intent` del humano) y en código
> `balanceMismatch`, que es su traducción literal — el proyecto va en inglés
> (`docs/conventions.md` §Idioma). **La palabra «testigo» no aparece ni en el
> código ni en los documentos de esta feature.**

## 0. Punto de partida: lo que la F31 ya dejó hecho

Leído del código, no del spec de la F31:

- [`movements.service.ts`](../../src/modules/movements/movements.service.ts) —
  `isAfter(a, b)` (la ÚNICA comparación de recencia del proyecto), `readAnchor`,
  `resolveAnchorPoint`, `computeAccountBalance(initialBalance, movements, anchor?)`
  y la función privada `netOf(movements, from)`.
- [`import.service.ts`](../../src/modules/import/import.service.ts) —
  `deriveAnchorFromStatement`, `anchorAccountIfMissing`, `backfillMissingBalances`,
  y `importStatement`, que es el núcleo compartido por las dos vías de entrada.
- [`accounts.service.ts`](../../src/modules/accounts/accounts.service.ts) —
  `attachBalances`.
- `prisma/schema.prisma` — `balanceAnchor`, `balanceAnchorDate`,
  `balanceAnchorDaySequence` en `Account`.

**Nada de eso se modifica en esta feature**, salvo un `export` (§3) y el enganche
de §4. R8 es exactamente eso: el saldo tiene que seguir saliendo igual.

## 1. La idea en una frase

La importación de un archivo, **después** de guardar sus movimientos y de
intentar anclar la cuenta, hace **dos comprobaciones** que no cambian ningún dato
y solo escriben en el informe del archivo.

```
descuadre = importe calculado − importe que trae el archivo      (si no es 0)
```

| Comprobación | De dónde salen los dos números | Qué bancos la disparan hoy | ¿Necesita el ancla? |
|---|---|---|---|
| Línea a línea | Dentro del archivo: dos saldos por línea consecutivos y el importe que hay en medio | Bankinter, Openbank | No |
| Contra el saldo del preámbulo | El `accountBalance` del archivo contra el ancla guardada más el neto posterior | N26, MyInvestor, Openbank | Sí |

**Ningún banco se nombra en el código**: qué comprobación se hace lo decide **lo
que trae el archivo**, no de qué banco es (ADR-015: el único archivo de `src/`
que puede nombrar un banco es `src/app.ts`). Un archivo de Openbank, que trae las
dos cosas, dispara **las dos** comprobaciones, y son distintas: la de línea a
línea comprueba la cadena corta dentro del archivo, la del preámbulo comprueba la
cadena larga desde el ancla.

## 2. Archivo nuevo: `src/modules/import/import.balance.service.ts`

```ts
/** Un descuadre, tal cual viaja en el informe del archivo. */
export interface BalanceMismatch {
  accountId: number
  accountAlias: string
  /** `YYYY-MM-DD` del punto comparado. */
  date: string
  /** El número que sale del cálculo, como cadena decimal. */
  computed: string
  /** El número que trae el archivo, como cadena decimal. */
  fromFile: string
  /** `computed − fromFile`, como cadena decimal y con su signo. */
  difference: string
  /** Cuál de las dos comprobaciones lo produjo. */
  check: 'per-line' | 'statement-balance'
}

/**
 * Comprobación LÍNEA A LÍNEA (R1, R2). Pura: ni base de datos, ni reloj, ni
 * ancla. Ordena los movimientos del archivo por `(bookingDate, daySequence)` y,
 * para cada par consecutivo cuyas DOS líneas traen saldo, compara
 * `balance(n) − balance(n−1)` contra el importe con signo de la línea `n`.
 */
export function findPerLineMismatches(
  statement: ParsedStatement,
  account: { id: number; alias: string },
): BalanceMismatch[]

/**
 * Comprobación CONTRA EL SALDO DEL PREÁMBULO (R3, R4). Devuelve `null` cuando no
 * hay nada que comparar: el archivo no trae `accountBalance`, la cuenta no tenía
 * ancla ANTES de este archivo, o el movimiento más reciente del archivo no es
 * posterior al ancla.
 */
export async function findStatementBalanceMismatch(deps: {
  prisma: AppPrismaClient
  statement: ParsedStatement
  account: { id: number; alias: string }
  /** El ancla tal como estaba ANTES de que este archivo intentara anclar. */
  anchor: BalanceAnchor | null
}): Promise<BalanceMismatch | null>
```

### 2.1 Cómo se comparan los importes (R5)

Todo se compara con `Prisma.Decimal`, nunca con `number`: el importe del parser
es un `number`, así que entra al cálculo por `new Prisma.Decimal(value.toFixed(2))`,
igual que hace hoy `toAnchor` en `import.service.ts`. **Hay descuadre cuando la
diferencia no es exactamente cero** (`difference.isZero() === false`). No hay
constante de tolerancia y no debe aparecer ninguna: si el humano pide un margen
en la puerta, entra como una constante única y nombrada en este archivo.

Ejemplo inventado de la comprobación línea a línea: saldos `120.00` y `195.00`
con un ingreso de `75.00` en medio cuadra; con un ingreso de `74.00` en medio
produce un descuadre de `computed: "75.00"`, `fromFile: "74.00"`,
`difference: "1.00"`.

### 2.2 La consulta de la comprobación del preámbulo

Una sola consulta por archivo, y solo cuando hay algo que comparar:

```ts
prisma.movement.findMany({
  where: {
    accountId,
    bookingDate: { gte: anchor.bookingDate, lte: mostRecentOfFile.bookingDate },
  },
  select: { type: true, amount: true, bookingDate: true, daySequence: true },
})
```

La ventana de SQL es **gruesa a propósito** (por día, con `gte`/`lte`); el corte
exacto —«estrictamente posterior al ancla» y «no posterior al movimiento más
reciente del archivo»— lo aplica `isAfter` en memoria, que es la misma función
que usa el cálculo del saldo. Es el mismo patrón que ya usa `attachBalances`, y
por el mismo motivo: el SQL y el dominio no pueden juzgar la recencia de forma
distinta.

## 3. Un solo cambio en `movements.service.ts`

`netOf(movements, from)` hoy es privada. Pasa a exportarse tal cual, sin cambiar
una línea de su cuerpo, para que la suma «ingresos suman, gastos restan,
`neutral` no toca» exista **una sola vez** en el proyecto. Duplicarla en el
módulo de importación sería la vía directa a que un día una de las dos trate los
`neutral` de otra manera.

## 4. Enganche en `import.service.ts`

Dentro de `importStatement`, y **solo ahí** (las dos vías de entrada lo
comparten, R11), el orden pasa a ser:

1. parsear, resolver la cuenta y guardar los movimientos — **igual que hoy**;
2. **leer el ancla guardada de la cuenta** (nueva función privada
   `readStoredAnchor`), **antes** de `anchorAccountIfMissing`: es lo único que
   distingue «la cuenta ya estaba anclada» de «este archivo la acaba de anclar»
   (R4);
3. `deriveAnchorFromStatement` + `anchorAccountIfMissing` — igual que hoy;
4. las dos comprobaciones, con el ancla del paso 2;
5. `result.balanceMismatches = [...perLine, ...(statementBalance ?? [])]` y
   `result.status = 'imported'`.

**Los descuadres no cambian el flujo** (R7, R8): no se lanza ninguna excepción,
no se toca `anchorAccountIfMissing`, y el archivo sigue moviéndose a
`procesados/` como se movería sin ellos. Un fallo *dentro* de la comprobación no
puede tumbar un archivo ya guardado: el bloque de comprobación va dentro del
`try` que ya existe, y si algo revienta ahí el archivo sale `failed` **sin haber
movido nada en Drive**, que es el comportamiento actual para cualquier fallo
posterior al guardado. Se deja así a propósito, en vez de tragarse el error en
silencio.

## 5. Tipos del informe (`import.types.ts`)

- `StatementResult` gana `balanceMismatches: BalanceMismatch[]` (array vacío
  cuando no hubo ninguno, nunca `undefined`), y por herencia lo ganan
  `AttemptedFileReport` y `AttemptedLocalFileReport`.
- `FileCounts` gana `balanceMismatches?: BalanceMismatch[]`, opcional porque un
  archivo `skipped` y un archivo de producto no traen ninguno.
- `totals()` gana `balanceMismatchCount` (R10), y con ello lo ganan
  `ImportRunResult` y `LocalImportRunResult` sin tocar
  `import.local.service.ts`.
- `emptyStatementResult()` inicializa el array vacío.

## 6. Contrato de API

`docs/api-contract.md`, §`POST /api/import` y §`POST /api/import/local`: el
contador `balanceMismatchCount` en la raíz de la respuesta y el array
`balanceMismatches` en cada archivo importado, con su tabla de campos y un
ejemplo inventado. Se dice explícitamente que **`GET /api/accounts` no cambia**:
el descuadre no viaja por ahí y el `balance` sigue significando lo mismo que
escribió la F31.

## 7. Alternativas descartadas

1. **Guardar el descuadre en una columna de `Account` para verlo en
   `/api/accounts`.** Descartada: el `accountBalance` de un archivo concreto no
   se guarda en ningún sitio, así que el dato no se puede recalcular al leer y la
   columna se quedaría vieja en cuanto entrara otro archivo — un dato viejo que
   dice «hay descuadre» es peor que no tenerlo. Es el punto 🔴 2 de la hoja.
2. **Recorrer todo el histórico guardado de la cuenta en cada importación** en
   vez de solo el archivo que entra. Descartada: repetiría el mismo aviso en cada
   ejecución para siempre y convertiría una importación en un barrido completo.
   Es el punto 🔴 4 de la hoja.
3. **Reutilizar `computeAccountBalance` para la comprobación del preámbulo.**
   Descartada: esa función prefiere el saldo por línea más reciente, así que en
   Bankinter y Openbank compararía el archivo contra sí mismo y siempre daría
   cero. La comprobación suma **desde el ancla guardada**, ignorando los saldos
   por línea, que es lo que hace que compruebe algo.
4. **Una excepción `BalanceMismatchError`.** Descartada por el `que_no_quiero`
   del humano: una desviación no puede tumbar la importación.
