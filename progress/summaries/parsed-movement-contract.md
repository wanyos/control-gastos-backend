# Resumen — feature 11 `parsed-movement-contract`

Fecha de cierre: 2026-08-11
Intención original: `feature_list.json` → feature `parsed-movement-contract`, bloque `intent`
Spec: no aplica (feature sin SDD)

## Qué hace ahora la app que antes no

Antes, «cómo es un movimiento parseado» estaba escrito **dentro** del módulo de
Bankinter, y la spec de MyInvestor lo volvía a escribir por su cuenta, ya con una
diferencia: uno admitía `neutral` y el otro no. Ahora esa forma está escrita **una
sola vez**, en un archivo compartido que no es de ningún banco, y el parser de
Bankinter la usa. Un banco nuevo se adapta a ella en vez de inventarse la suya, y
quien guarde en la base de datos tendrá una única forma que entender, no siete.

Además, en el mismo movimiento se arreglan dos cosas que estaban mal:

- Un importe **0** ya no se cuenta como ingreso: sale como **`neutral`**, igual que
  en la base de datos. Es el único cambio de comportamiento de la feature.
- Cuando un dato **no viene en el fichero** (el saldo de la línea, el IBAN de la
  cuenta), sale como **`null`**, no como `0` ni como texto vacío. Así se distingue
  "el banco no lo reporta" de "el banco reporta un cero".

Y cada movimiento sale ya numerado dentro de su día (`daySequence`, 1 = el más
antiguo del día), lo pone el parser de cada banco porque solo él sabe en qué
sentido exporta su fichero.

## Por dónde se usa (puntos de entrada)

- `POST /api/parser/bankinter` — parsea las copias locales de Bankinter. **Su
  respuesta cambia**: `type` puede valer `"neutral"`, cada movimiento trae
  `daySequence`, y `accountIban` / `balance` pueden venir a `null`. Anotado como
  breaking change en [`docs/api-contract.md`](../../docs/api-contract.md); el
  frontend todavía no lo consume.
- El JSON volcado en `var/parsed/<banco>/<año>/<archivo>.json` lleva exactamente
  esos mismos campos.
- Para el código: cualquier parser futuro importa el contrato de
  [`src/lib/parsed-statement.ts`](../../src/lib/parsed-statement.ts).

## Dónde está el código (para revisión directa)

### El contrato compartido (lo nuevo)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Los tres valores del tipo de movimiento | `ParsedMovementType` | [parsed-statement.ts:19](../../src/lib/parsed-statement.ts#L19) |
| La forma de un movimiento parseado | `ParsedMovement` | [parsed-statement.ts:22](../../src/lib/parsed-statement.ts#L22) |
| El saldo que puede no venir en el fichero | `balance: number \| null` | [parsed-statement.ts:36](../../src/lib/parsed-statement.ts#L36) |
| La posición dentro del día | `daySequence` | [parsed-statement.ts:56](../../src/lib/parsed-statement.ts#L56) |
| La fila que no se pudo interpretar | `UnparsedRow` | [parsed-statement.ts:60](../../src/lib/parsed-statement.ts#L60) |
| El resultado completo de un fichero | `ParsedStatement<Bank>` | [parsed-statement.ts:68](../../src/lib/parsed-statement.ts#L68) |
| El IBAN que puede no venir | `accountIban: string \| null` | [parsed-statement.ts:76](../../src/lib/parsed-statement.ts#L76) |
| Numerar cada movimiento dentro de su día | `assignDaySequence` | [parsed-statement.ts:96](../../src/lib/parsed-statement.ts#L96) |

### Lo que cambió en Bankinter

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Ya no declara tipos propios: usa el contrato | `BankinterParseResult` | [bankinter.types.ts:14](../../src/modules/bankinter/bankinter.types.ts#L14) |
| Lo único suyo: exporta de más reciente a más antiguo | `statementOrder` | [bankinter.parser.ts:10](../../src/modules/bankinter/bankinter.parser.ts#L10) |
| Numera los movimientos al devolverlos | `assignDaySequence(...)` | [bankinter.parser.ts:89](../../src/modules/bankinter/bankinter.parser.ts#L89) |
| Sin línea de IBAN devuelve `null`, no `''` | `findIban` | [bankinter.parser.ts:128](../../src/modules/bankinter/bankinter.parser.ts#L128) |
| El signo ya no se decide aquí: se reutiliza el helper de la F8 | `deriveMovementTypeFromAmount(amount)` | [bankinter.parser.ts:191](../../src/modules/bankinter/bankinter.parser.ts#L191) |
| La regla del signo, único sitio donde vive | `deriveMovementTypeFromAmount` | [movements.service.ts:33](../../src/modules/movements/movements.service.ts#L33) |

### Guardianes (impiden que esto se rompa solo)

| Qué cubre | Código |
| --- | --- |
| Nadie vuelve a declarar esos tipos en `src/` | [architecture.test.ts:184](../../src/architecture.test.ts#L184) |
| El contrato no sabe de base de datos ni importa nada | [architecture.test.ts:203](../../src/architecture.test.ts#L203) |
| Ningún parser reimplementa la regla del signo | [architecture.test.ts:216](../../src/architecture.test.ts#L216) |

### Tests

| Qué cubre | Código |
| --- | --- |
| Numeración del día en fichero de más reciente a más antiguo | [parsed-statement.test.ts:25](../../src/lib/parsed-statement.test.ts#L25) |
| Numeración del día en fichero de más antiguo a más reciente | [parsed-statement.test.ts:46](../../src/lib/parsed-statement.test.ts#L46) |
| Dato ausente = `null`, nunca `0` ni `""` | [parsed-statement.test.ts:74](../../src/lib/parsed-statement.test.ts#L74) |
| El tipo del contrato acepta los tres valores del helper | [parsed-statement.test.ts:91](../../src/lib/parsed-statement.test.ts#L91) |
| Importe 0 sale `neutral`, no ingreso (número y texto) | [bankinter.parser.test.ts:73](../../src/modules/bankinter/bankinter.parser.test.ts#L73) |
| Cada movimiento numerado dentro de su día | [bankinter.parser.test.ts:88](../../src/modules/bankinter/bankinter.parser.test.ts#L88) |
| Layout real de Bankinter: la 1ª fila es la última del día | [bankinter.parser.test.ts:128](../../src/modules/bankinter/bankinter.parser.test.ts#L128) |
| Extracto sin IBAN: `null` y el resto se parsea igual | [bankinter.parser.test.ts:170](../../src/modules/bankinter/bankinter.parser.test.ts#L170) |
| **No regresión**: resultado entero idéntico al de antes | [bankinter.parser.test.ts:193](../../src/modules/bankinter/bankinter.parser.test.ts#L193) |
| El JSON volcado conserva la clave con `null` | [bankinter.service.test.ts:64](../../src/modules/bankinter/bankinter.service.test.ts#L64) |
| Importe 0 en la regla de dominio (ya existía, F8) | [movements.test.ts:41](../../src/modules/movements/movements.test.ts#L41) |

## Cumplimiento de la intención

Por cada punto del `como_se_que_esta_bien`:

- ✅ «La forma de un movimiento parseado está definida en un único archivo
  compartido, fuera del módulo de cualquier banco, y el parser de Bankinter la usa
  en vez de la suya» → se cumple. Está en
  [parsed-statement.ts:22](../../src/lib/parsed-statement.ts#L22) y Bankinter se
  queda con [bankinter.types.ts:14](../../src/modules/bankinter/bankinter.types.ts#L14).
  El reviewer buscó duplicados por todo `src/` y no hay ninguno; lo vigila
  [architecture.test.ts:184](../../src/architecture.test.ts#L184).
- ✅ «El saldo de la línea y el IBAN se pueden omitir y el resultado deja claro que
  ese dato no viene en el archivo» → se cumple; verificado en
  [parsed-statement.test.ts:74](../../src/lib/parsed-statement.test.ts#L74),
  [bankinter.parser.test.ts:170](../../src/modules/bankinter/bankinter.parser.test.ts#L170)
  y, sobre el fichero volcado de verdad,
  [bankinter.service.test.ts:64](../../src/modules/bankinter/bankinter.service.test.ts#L64).
- ✅ «Un importe 0 se marca como `neutral` y no como ingreso» → se cumple;
  verificado en [bankinter.parser.test.ts:73](../../src/modules/bankinter/bankinter.parser.test.ts#L73).
- ✅ «Esa decisión se toma en un solo sitio, reutilizando el helper que ya existe»
  → se cumple; el parser importa el helper de la F8
  ([bankinter.parser.ts:191](../../src/modules/bankinter/bankinter.parser.ts#L191))
  y ningún parser lo reimplementa, vigilado por
  [architecture.test.ts:216](../../src/architecture.test.ts#L216).
- ✅ «Cada movimiento sale con su posición dentro del día, contando desde el más
  antiguo, sea cual sea el orden en que el banco exporte» → se cumple; los dos
  sentidos están cubiertos en
  [parsed-statement.test.ts:25](../../src/lib/parsed-statement.test.ts#L25) y
  [:46](../../src/lib/parsed-statement.test.ts#L46), y sobre el layout real de
  Bankinter en [bankinter.parser.test.ts:128](../../src/modules/bankinter/bankinter.parser.test.ts#L128)
  (los saldos demuestran el orden: 10 000,00 − 45,37 = 9 954,63).
- ✅ «Salvo el cambio del importe 0, para el mismo archivo salen exactamente los
  mismos movimientos y valores» → se cumple; el test de no regresión
  [bankinter.parser.test.ts:193](../../src/modules/bankinter/bankinter.parser.test.ts#L193)
  compara con `toEqual` el **resultado entero** (5 movimientos campo a campo más
  la fila 15 no reconocida) contra los valores que producía la F7. El reviewer lo
  abrió y comprobó que no es un subconjunto.

## Decisiones que se tomaron por ti

- (delegado) **Dónde vive el contrato:** `src/lib/parsed-statement.ts`. `lib/` es
  la carpeta de «lo que usan todos y no es de nadie»; `modules/` es un directorio
  por recurso y un contrato no es un recurso. Razonado en el **ADR-013** de
  [`docs/architecture.md`](../../docs/architecture.md).
- (delegado) **Cómo se dice que un dato no viene:** `null` explícito, con la clave
  presente en el JSON. Es lo que ya hace la base de datos y lo que necesita
  MyInvestor, que no trae ni saldo ni IBAN.
- (delegado) **Quién numera el día:** el parser de cada banco, con un helper
  compartido; lo único que aporta el banco es decir en qué sentido exporta.
  Numerar no es leer el formato, así que la norma «un parser por banco» sigue
  intacta (explicado en `docs/conventions.md` §Parsers de banco y en el roadmap).
- (delegado) **El contrato no gana nada más para el importador:** `origin`,
  `status`, `transferId` y `accountId` los pone el importador; meterlos aquí
  convertiría el contrato en el modelo de la base de datos.
- (añadido) **Un test que no existía:** no había ningún test que fijara el
  comportamiento viejo del importe 0 (`0 → income`); la regla vivía solo en un
  ternario del parser. Confirmado por el reviewer contra `git`. El implementer
  añadió el test que faltaba, ya con el comportamiento nuevo.

## Qué NO se tocó / quedó fuera

- No se tocó el esquema Prisma ni la base de datos.
- No cambió qué columnas lee Bankinter, cómo detecta la cabecera ni cómo
  interpreta fechas e importes: esas funciones están intactas.
- No se tocó el módulo ni la spec de MyInvestor (F10): se re-espeficará contra
  este contrato, que es el paso siguiente.
- No se creó ningún parser compartido: cada banco conserva su módulo; lo
  compartido es solo la forma de la salida.
- No se guarda nada en base de datos: eso es la F12.

## Notas para el futuro

- **Para la F12 (importación):** `daySequence` numera solo los movimientos que el
  parser entendió. Si una fila queda en `unparsedRows` y más adelante se arregla
  el parser, las posiciones de ese día se desplazan y el índice de dedup vería
  movimientos nuevos. Conviene tenerlo presente al re-importar.
- `balance` podría llamarse `balanceAfter` para que el mapeo a `Movement` sea
  literal; no se hizo aquí para no meter un segundo cambio de forma en una feature
  cuyo criterio principal era la no regresión.
- `currency: ''` sigue siendo un vacío disfrazado (mismo patrón que se corrigió
  para el IBAN); candidato a `string | null` cuando se toque.
- Al cerrar la sesión queda pendiente actualizar
  [`docs/roadmap.md`](../../docs/roadmap.md): etapa E4 y **cabo suelto #2**, que
  esta feature cierra.
- Dos rótulos de enlace en `docs/conventions.md` §Parsers de banco citan un número
  de línea desfasado respecto al ancla (dicen `:11` y `:177` apuntando a `#L10` y
  `#L191`). Cosmético.
