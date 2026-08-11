# Resumen — feature 10 `myinvestor-statement`

Fecha de cierre: 2026-08-11
Intención original: `feature_list.json` → feature `myinvestor-statement`, bloque `intent`
Spec (SDD): [`specs/myinvestor-statement/`](../../specs/myinvestor-statement/decisions.md)

## Qué hace ahora la app que antes no

Ahora el backend **entiende el extracto de tu cuenta corriente de MyInvestor**. Le das el
CSV que el banco exporta (el que la ingesta ya te deja copiado en local) y lo convierte en
una lista de movimientos con sus dos fechas, el concepto, el importe con su signo, la
divisa y si es ingreso, gasto o ni una cosa ni otra. El resultado se escribe en un JSON
local que puedes abrir y revisar. Antes solo sabía leer Bankinter.

Dos cosas que este banco **no te da** y que el resultado no disimula: **no hay saldo por
línea** y **no hay IBAN**. Los dos salen como «no hay dato» (`null`), nunca como un cero
ni como una cadena vacía, así que nadie los va a confundir con un saldo real de 0 €.

Sigue sin tocarse la base de datos: esto es entender el archivo, no guardarlo.

## Por dónde se usa (puntos de entrada)

- `POST /api/parser/myinvestor` — recorre `var/drive-read/myinvestor/<año>/`, parsea cada
  `.csv` y escribe su resultado en `var/parsed/myinvestor/<año>/<archivo>.json`. Sin
  cuerpo de petición. Responde **200** con el recuento y tres listas: lo parseado, lo que
  falló y lo que se ignoró.
- Nada más. No descarga de Drive, no mueve archivos a `procesados/` y no escribe en la
  base de datos.

## Dónde está el código (para revisión directa)

### El parser del extracto

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Convierte el CSV en movimientos (función pública) | `parseMyinvestorStatement` | [myinvestor.statement.parser.ts:60](../../src/modules/myinvestor/myinvestor.statement.parser.ts#L60) |
| Dice que este banco exporta del más reciente al más antiguo | `statementOrder` | [myinvestor.statement.parser.ts:9](../../src/modules/myinvestor/myinvestor.statement.parser.ts#L9) |
| Encuentra la fila de cabecera por el nombre de las columnas | `findHeaderRow` | [myinvestor.statement.parser.ts:102](../../src/modules/myinvestor/myinvestor.statement.parser.ts#L102) |
| Convierte una línea en un movimiento, o en el motivo por el que no se pudo | `parseDataLine` | [myinvestor.statement.parser.ts:123](../../src/modules/myinvestor/myinvestor.statement.parser.ts#L123) |
| El saldo que este banco no da, escrito como nulo | `balance: null` | [myinvestor.statement.parser.ts:162](../../src/modules/myinvestor/myinvestor.statement.parser.ts#L162) |
| El IBAN que este banco no da, escrito como nulo | `accountIban: null` | [myinvestor.statement.parser.ts:89](../../src/modules/myinvestor/myinvestor.statement.parser.ts#L89) |
| Pone a cada movimiento su posición dentro del día | `assignDaySequence` | [myinvestor.statement.parser.ts:92](../../src/modules/myinvestor/myinvestor.statement.parser.ts#L92) |
| Decide ingreso / gasto / neutro (helper compartido, no reescrito) | `deriveMovementTypeFromAmount` | [myinvestor.statement.parser.ts:165](../../src/modules/myinvestor/myinvestor.statement.parser.ts#L165) |

### Números y fechas de este banco

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Lee un importe aunque mezcle separador de miles en el mismo archivo | `parseAmountText` | [myinvestor.format.ts:28](../../src/modules/myinvestor/myinvestor.format.ts#L28) |
| Lee una fecha día/mes/año y rechaza las que no existen (31/02) | `parseStatementDate` | [myinvestor.format.ts:58](../../src/modules/myinvestor/myinvestor.format.ts#L58) |

### El recorrido de los archivos y el volcado

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Recorre las copias locales, parsea y vuelca un JSON por archivo | `parseLocalMyinvestorCopies` | [myinvestor.service.ts:38](../../src/modules/myinvestor/myinvestor.service.ts#L38) |
| Manda a «ignorados» lo que no es un `.csv` (tus `.txt`, y de momento los `.json` de producto) | rama de extensión | [myinvestor.service.ts:52](../../src/modules/myinvestor/myinvestor.service.ts#L52) |
| Aísla el fallo de un archivo para que los demás sigan | `try` por archivo | [myinvestor.service.ts:61](../../src/modules/myinvestor/myinvestor.service.ts#L61) |
| Escribe el JSON local y devuelve la ruta relativa (nunca la absoluta) | `parseAndDump` | [myinvestor.service.ts:80](../../src/modules/myinvestor/myinvestor.service.ts#L80) |
| El endpoint | `myinvestorRoutes` | [myinvestor.routes.ts:30](../../src/modules/myinvestor/myinvestor.routes.ts#L30) |
| Queda enchufado a la app | `app.register` | [app.ts:40](../../src/app.ts#L40) |
| La forma de la salida (compartida con Bankinter, no redeclarada) | `MyinvestorStatementResult` | [myinvestor.types.ts:19](../../src/modules/myinvestor/myinvestor.types.ts#L19) |

### Tests

| Qué cubre | Código |
| --- | --- |
| Un movimiento por línea, en el orden del archivo | [parser.test.ts:14](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L14) |
| El movimiento completo, campo a campo | [parser.test.ts:31](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L31) |
| Acentos, euro y BOM | [parser.test.ts:54](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L54) |
| Cabecera desplazada, columnas reordenadas y acento corrompido | [parser.test.ts:68](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L68) |
| Las cinco formas de número que conviven en tu extracto | [format.test.ts:5](../../src/modules/myinvestor/myinvestor.format.test.ts#L5) |
| Fechas válidas e imposibles | [format.test.ts:41](../../src/modules/myinvestor/myinvestor.format.test.ts#L41) |
| Importe 0 → neutro; negativo → gasto; positivo → ingreso | [parser.test.ts:123](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L123) |
| Dos líneas idénticas salen las dos | [parser.test.ts:141](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L141) |
| Línea ilegible reportada con su número y su motivo | [parser.test.ts:166](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L166) |
| Saldo nulo en todos los movimientos, nunca 0 | [parser.test.ts:200](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L200) |
| El parser no acumula ningún saldo | [parser.test.ts:226](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L226) |
| IBAN nulo, sin deducirlo de un concepto con pinta de IBAN | [parser.test.ts:245](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L245) |
| Posición dentro del día: 3, 2, 1 desde el más antiguo | [parser.test.ts:254](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L254) |
| Una línea ilegible no consume número del día | [parser.test.ts:273](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L273) |
| Un archivo roto no tumba a los demás | [service.test.ts:67](../../src/modules/myinvestor/myinvestor.service.test.ts#L67) |
| Lo que no es `.csv` va a «ignorados», no a errores | [service.test.ts:95](../../src/modules/myinvestor/myinvestor.service.test.ts#L95) |
| Los archivos de origen quedan intactos | [service.test.ts:120](../../src/modules/myinvestor/myinvestor.service.test.ts#L120) |
| Dos ejecuciones seguidas dan volcados idénticos | [service.test.ts:135](../../src/modules/myinvestor/myinvestor.service.test.ts#L135) |
| El endpoint responde 200 y escribe el JSON | [routes.test.ts:39](../../src/modules/myinvestor/myinvestor.routes.test.ts#L39) |
| Un archivo roto no cambia el código HTTP | [routes.test.ts:85](../../src/modules/myinvestor/myinvestor.routes.test.ts#L85) |
| Guardianes: sin `prisma`, sin mezclar bancos, un solo contrato, una sola regla del signo | [architecture.test.ts:197](../../src/architecture.test.ts#L197) |

## Cumplimiento de la intención

Punto por punto del `como_se_que_esta_bien` que escribiste:

- ✅ **«MyInvestor tiene su propio módulo de parser, con el mismo nombre normalizado que
  su carpeta de Drive, y no comparte parser con ningún otro banco.»** Se cumple: el
  módulo es `src/modules/myinvestor/`. Verificado en
  [architecture.test.ts:257](../../src/architecture.test.ts#L257) (el slug coincide con
  el de la carpeta) y en [architecture.test.ts:211](../../src/architecture.test.ts#L211)
  (ningún módulo de banco toca al otro; el único sitio que enchufa este es `app.ts`).
- ✅ **«Un movimiento estructurado por cada línea, con sus dos fechas, el concepto, el
  importe con su signo y la divisa.»** Se cumple; verificado en
  [parser.test.ts:14](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L14)
  (uno por línea, en orden) y
  [parser.test.ts:31](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L31)
  (el movimiento entero, campo a campo).
- ✅ **«Los importes se interpretan bien aunque unos lleven separador de miles y otros no,
  y las fechas día/mes/año también.»** Se cumple; verificado en
  [format.test.ts:5](../../src/modules/myinvestor/myinvestor.format.test.ts#L5) y
  [format.test.ts:41](../../src/modules/myinvestor/myinvestor.format.test.ts#L41), y
  sobre un archivo completo en
  [parser.test.ts:105](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L105).
- ✅ **«El extracto no trae saldo, y eso no se disimula.»** Se cumple: cada movimiento
  lleva el saldo **presente y nulo**, nunca un 0. Verificado en
  [parser.test.ts:200](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L200),
  y en [parser.test.ts:209](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L209)
  se comprueba que el resultado no lleva ningún campo extra que lo anuncie.
- ✅ **«Si un archivo está mal escrito, se reporta aparte diciendo qué archivo y qué está
  mal, y los demás se parsean igual.»** Se cumple en los dos niveles: una **línea** mala
  va a `unparsedRows` con su número y su motivo
  ([parser.test.ts:166](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L166))
  y un **archivo** malo va a `failed` sin arrastrar a los demás
  ([service.test.ts:67](../../src/modules/myinvestor/myinvestor.service.test.ts#L67)).
- ✅ **«El parser no calcula nada.»** Se cumple: no acumula saldo ni deriva totales.
  Verificado en
  [parser.test.ts:226](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L226),
  que además vigila que no aparezca ninguna acumulación en el propio código del parser.
- ✅ **«Puedo ver el resultado parseado en un archivo JSON local.»** Se cumple:
  `var/parsed/myinvestor/<año>/<archivo>.json`. Verificado en
  [service.test.ts:25](../../src/modules/myinvestor/myinvestor.service.test.ts#L25) y
  [routes.test.ts:39](../../src/modules/myinvestor/myinvestor.routes.test.ts#L39).
- ✅ **«Parsear dos veces los mismos archivos da exactamente el mismo resultado.»** Se
  cumple, byte a byte; verificado en
  [service.test.ts:135](../../src/modules/myinvestor/myinvestor.service.test.ts#L135).

## Decisiones que se tomaron por ti

Lo que en el spec estaba marcado como `(delegado)` o `(añadido)` y tú aprobaste en
[`decisions.md`](../../specs/myinvestor-statement/decisions.md):

- **(añadido) El resultado dice explícitamente «aquí no hay IBAN».** Tu extracto no lo
  trae. Consecuencia práctica, que sigue en pie: el alta automática de cuenta necesita
  IBAN + banco, así que **la cuenta corriente de MyInvestor tendrás que darla de alta a
  mano** por `POST /api/accounts`, y su `initialBalance` será el **único ancla** de su
  saldo (no hay saldo en el archivo del que partir). Está escrito en el ADR-014 y en
  `docs/api-contract.md`.
- **(añadido) La lista de «ignorados».** Los archivos que este parser no maneja (tus
  `.txt` con notas copiadas de la web, y **de momento también los `.json` de producto)
  salen en una lista aparte, visibles pero sin contar como error. Se ve en
  [myinvestor.service.ts:52](../../src/modules/myinvestor/myinvestor.service.ts#L52).
- **(añadido) El paso nuevo en `docs/dar-de-alta-un-banco.md`:** al dar de alta un banco
  ya no basta con crear su carpeta en Drive; ahí queda escrito que hace falta su módulo
  de parser, con las tres reglas que no se negocian.
- **(delegado) El banco sale de la carpeta, no del contenido**, y **qué parser se aplica
  lo decide la extensión** del archivo. Misma regla que ya usaba la ingesta.
- **(delegado) Un archivo roto no tumba a los demás:** cada archivo va en su propio
  intento, el fallo se anota y el recorrido sigue. La respuesta es 200 aunque haya
  fallos: el fallo va **dentro** del cuerpo.
- **(delegado) Se reutiliza el camino que ya existía**, sin inventar uno nuevo: copias
  locales en `var/drive-read/`, volcado en `var/parsed/`, endpoint bajo el prefijo
  `/api/parser` que ya usaba Bankinter. **Cero dependencias nuevas**: el CSV se lee como
  texto.
- **(impuesto por la feature 11)** Cada movimiento sale ya con su **posición dentro del
  día** (1 = el más antiguo de ese día). Se comprobó sobre tu extracto real que MyInvestor
  exporta **del más reciente al más antiguo** y el parser lo numera al revés en
  consecuencia. Las líneas que no se pudieron leer **no gastan número**.

## Qué NO se tocó / quedó fuera

- **Los `.json` de tus productos de inversión son la feature 13.** Aquí no se ha escrito
  ni una línea de eso: caen en la lista de ignorados hasta que exista.
- **No se guarda nada en la base de datos** ni se tocó el esquema Prisma.
- **No se mueve nada en Drive**: ningún archivo pasa a `procesados/`.
- **No se enlazan los movimientos con sus productos de inversión** (las aportaciones a la
  cartera, las compras del ETF, las aperturas de depósito): eso es de la feature de
  importación.
- **No hay interfaz web**: eso es del frontend, en otra sesión.
- **Ningún dato financiero real se ha versionado**: los ejemplos de los tests están
  inventados y generados en código, y las carpetas `var/` siguen fuera del repositorio.

## Notas para el futuro

- Los dos endpoints de parser nombran distinto lo mismo: Bankinter devuelve los fallos
  con la clave `error` y MyInvestor con `reason`. No es un problema hoy, pero conviene
  unificarlo la próxima vez que se toque el endpoint de Bankinter, antes de que el
  frontend consuma los dos.
- Si alguna línea del extracto llegara con un `;` **dentro** de un campo, se reportaría
  como «número de columnas inesperado» en vez de parsearse. Es visible, no silencioso, y
  está anotado en el ADR-014 para reevaluarlo si aparece de verdad.
- Sin saldo en el archivo, el saldo de esta cuenta se tendrá que reconstruir sumando
  desde `initialBalance` cuando llegue la importación. Es la rama que el ADR-011
  describía como excepcional y que aquí pasa a ser la normal para este banco.
