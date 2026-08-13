# Design — Feature 10: myinvestor-statement

> CÓMO se construye lo descrito en `requirements.md`. No reinventa decisiones: se
> apoya en `docs/architecture.md` (Principios 1-5, **ADR-004** organización por
> módulos, **ADR-008** Drive como registro de bancos, **ADR-009** copias locales
> gitignoreadas y aislamiento del fallo por archivo, **ADR-010** parser puro +
> volcado JSON local, **ADR-011** modelo del flujo, **ADR-013** contrato común de
> movimiento parseado) y en `docs/conventions.md`
> (**§Parsers de banco**: un parser por banco, varias entradas dentro del mismo
> banco, **y una única forma de salida compartida**; dominio en inglés, prosa en
> español, tests junto al archivo).
>
> ⚠️ **Re-especificado el 2026-08-11 contra el contrato de la F11** y **cortado** ese
> mismo día: esta spec se queda con **el extracto CSV**; los archivos JSON de producto
> son la F13 [`../myinvestor-products/`](../myinvestor-products/design.md). Diff completo
> en [`CHANGELOG-respec.md`](CHANGELOG-respec.md). Las secciones §5.3-§5.4, §6, §7, §8 y
> §12 se fueron enteras allí y aquí quedan como punteros; **la numeración de secciones no
> se ha alterado**.
>
> 📄 **Premisa que lo condiciona todo:** **el extracto lo genera el banco y hay que
> aceptarlo como viene.** No hay formato que elegir: se lee lo que hay (fechas
> `dd/mm/aaaa`, importes con el separador de miles a medias, ninguna columna de saldo).
> Esa es justamente la diferencia con la F13, donde el archivo lo escribe el humano y su
> formato **sí** se diseña — y la razón por la que las dos features se aprueban por
> separado.
>
> Las decisiones delegadas se marcan **⭐ DECISIÓN PROPIA (aprobar en la puerta)**.
> ✅ **Esta spec no tiene ningún punto 🔴 pendiente del humano.**

## 1. Estado actual → estado final

Hoy existe un módulo de parser de banco en `src/modules/` (el primero del repo, con
su parser puro, su servicio de volcado y su ruta) y el camino completo
`Drive → copia local → parseo → volcado local` (ADR-009 + ADR-010). Esta feature
**no toca nada de eso**: replica el patrón en un módulo nuevo, para otro banco.

📌 **El módulo que se crea aquí es el que la F13 `myinvestor-products` ampliará después**
(segunda entrada del mismo banco). Todo lo que se deja preparado —el formato de números,
el recorrido de carpetas, `failed[]`, `ignored[]`, el aislamiento y la ruta— **es de esta
feature y la F13 no lo vuelve a construir**.

**Archivos que se crean** (el `implementer` los materializa; aquí solo se planifican):

```
src/modules/myinvestor/
  myinvestor.types.ts                     # SOLO lo suyo: el alias del contrato
                                          #   compartido + los resúmenes de su
                                          #   ejecución local (§13, R70)
  myinvestor.format.ts                    # normalizadores compartidos DENTRO del banco:
                                          #   números y fechas del extracto (§3.3)
                                          #   la F13 le añadirá parseIsoDate
  myinvestor.statement.parser.ts          # parser puro del CSV: Buffer -> resultado (§3)
  myinvestor.service.ts                   # recorre copias locales, parsea y vuelca (§10)
                                          #   la F13 le añadirá la rama .json
  myinvestor.routes.ts                    # POST /api/parser/myinvestor (§10)
  myinvestor.fixture.ts                   # helper de test: fixtures SINTÉTICOS en memoria
  myinvestor.format.test.ts
  myinvestor.statement.parser.test.ts
  myinvestor.service.test.ts
  myinvestor.routes.test.ts
```

**Archivos que se modifican:**

```
src/app.ts                                # + register(myinvestorRoutes, { prefix: '/api/parser' })
src/architecture.test.ts                  # + entradas del módulo al árbol esperado (R65)
                                          # + guardián "sin prisma" (R3)
                                          # + guardián "sin imports de otro módulo de banco" (R2)
                                          # (los guardianes de la F11 —una sola declaración
                                          #  del contrato y una sola regla del signo— ya
                                          #  existen y deben seguir verdes: R70, R11)
docs/api-contract.md                      # + endpoint y modelo del extracto (R61)
docs/architecture.md                      # + ADR-014 y el módulo en el árbol (R62)
                                          #   (el 013 lo ocupa el contrato de la F11)
docs/dar-de-alta-un-banco.md              # + el paso de crear el módulo de parser (R64)
progress/current.md
progress/implementations/myinvestor-statement.md # CREAR: mapa de trazabilidad (R67)
```

**Lo que NO se toca (regla dura):** `prisma/schema.prisma` y `prisma/migrations/`
(R3), los módulos del flujo (`accounts`, `categories`, `movements`), el módulo de
ingesta, `src/lib/**`, `src/plugins/**`, `src/errors/app-error.ts` (no hace falta
ningún error de dominio nuevo: los fallos por archivo se **reportan**, no se lanzan),
**el otro módulo de parser del repo** y `package.json` (§4). ⚠️ **Matiz de 2026-08-11:**
"no se tocan" significa **no se modifican**; el parser sí **importa** (solo lectura)
[`src/lib/parsed-statement.ts`](../../src/lib/parsed-statement.ts) y
[`deriveMovementTypeFromAmount`](../../src/modules/movements/movements.service.ts#L33),
que es exactamente lo que ADR-013 obliga a hacer (R11, R70).

**`.gitignore` no cambia:** `var/drive-read/` y `var/parsed/` ya están ignorados
desde las features 5 y 6, y sus dos guardianes de `architecture.test.ts` siguen
cubriendo la privacidad de esta feature sin tocar nada.

**Sin dependencias nuevas y sin variables de entorno nuevas** (§4) →
`docs/stack.md` no cambia.

## 2. ⭐ DECISIÓN PROPIA #1 — Dónde vive el código: `src/modules/myinvestor/` (R1, R2, R3)

**No es una decisión abierta: la norma ya está escrita** en `docs/conventions.md`
§Parsers de banco (decidida 2026-08-10):

> *Un parser por banco, sin excepciones. Cada banco tiene su módulo
> `src/modules/<banco>/`, donde `<banco>` es el mismo nombre normalizado que su
> carpeta de Drive (`normalizeBankName`, `src/lib/drive-structure.ts:52`). […] Un
> banco puede tener varias entradas. Un mismo módulo lee todos los formatos que ese
> banco aporta.*

Se **cita, no se re-decide**. Lo único que este design aporta es su aplicación:

- `normalizeBankName('MyInvestor')` → `'myinvestor'` (NFD, sin diacríticos,
  minúsculas, `[^a-z0-9]+` → `-`) → módulo `src/modules/myinvestor/`, carpeta de
  Drive `myinvestor`, copias locales en `var/drive-read/myinvestor/<año>/`.
- **Las dos entradas del banco vivirán en el mismo módulo**, que es justamente el caso
  que la norma contempla (*"por ejemplo un `.xlsx` de movimientos de la cuenta corriente
  y varios `.json` de productos de inversión"*). El parser **puro** del extracto
  (`*.statement.parser.ts`) es de esta feature; el de productos lo añade la F13 al mismo
  módulo, porque son dos formatos que evolucionan por su cuenta. **Un** servicio y
  **una** ruta para los dos, porque el disparo es uno solo: "parséame lo que haya de
  este banco".
- `myinvestor.format.ts` es código compartido **dentro** del banco (números y
  fechas), que es lo que la norma permite explícitamente. **Nada de él sube a
  `src/lib/`**: en cuanto vive fuera del módulo, un cambio de formato de este banco
  se convierte en una regresión para los demás, que es exactamente lo que la norma
  evita. **Es la pieza que la F13 reutiliza** (§3.3).

### 2.1 🔴 ¿Colisiona con lo que la feature 9 reclama en `src/modules/investments/`?

**No. Las dos carpetas son disjuntas y ninguna feature escribe en la del otro.**

| Carpeta | Quién escribe ahí | Qué pone |
| --- | --- | --- |
| `src/modules/investments/` | **solo la feature 9** | `investments.model.test.ts` (su único archivo) |
| `src/modules/myinvestor/` | **la feature 10 y, después, la F13** | los archivos de §1 |

Conviene decirlo explícitamente porque **el spec de la feature 9 dice lo contrario**:
su `design.md` §11 y su `requirements.md` R24 dan por hecho que la feature 10
aterrizaría **seis archivos `investments.*` en `src/modules/investments/`**. Eso era
cierto cuando la feature 10 se llamaba "el parser de inversiones"; ha dejado de
serlo desde que la norma de `docs/conventions.md` fija el módulo **por banco** y no
por recurso funcional. Consecuencias, todas favorables y ninguna de esquema:

- La feature 9 se queda con una carpeta de **un solo archivo**, como decía su R24. Su
  cumplimiento es ahora **más fácil**, no más difícil.
- El guardián que la feature 9 descartó por "nacer condenado" (afirmar que
  `modules/investments/` contiene exactamente un archivo) **ya no nacería condenado**.
  Aun así **no lo pido**: no es trabajo de esta feature y la feature 9 ya eligió
  verificar R24 por checklist del reviewer. Solo lo señalo en §12.
- El árbol esperado de `src/architecture.test.ts` recibe entradas de las **dos**
  carpetas, sin solaparse.

- **Alternativa descartada — un módulo `investments/` con el parser dentro, y el
  extracto en `myinvestor/`:** agrupa por *recurso funcional* en vez de por banco.
  Descartada por dos motivos: (1) contradice la norma vigente, que es explícita y
  reciente; y (2) partiría en dos módulos las **dos entradas del mismo banco**, que
  llegan por la misma carpeta de Drive, se disparan juntas y comparten el
  normalizador de números. El día que un segundo banco tenga productos de inversión,
  su formato será otro y tendrá su propio parser — que es justo lo que la norma
  protege.

## 3. ⭐ DECISIÓN PROPIA #2 — El extracto: leerlo como es, no como nos gustaría (R5-R20)

### 3.1 La forma real del archivo (verificada sobre la muestra)

```
Fecha de operación;Fecha de valor;Concepto;Importe;Divisa
06/08/2026;10/08/2026;COMPRA ETF EJEMPLO;-60;EUR
03/08/2026;03/08/2026;CUOTA SERVICIO EJEMPLO;-9,49;EUR
```

> La **forma** es la del archivo real; los conceptos y los importes son
> **inventados** (F14, 2026-08-12): `src/no-real-data.test.ts` falla si vuelven los
> del humano.

Hechos que el diseño da por buenos porque están comprobados byte a byte sobre el
archivo real:

| Hecho | Consecuencia de diseño |
| --- | --- |
| Es **texto plano delimitado por `;`**, no una hoja de cálculo | No hace falta librería de hojas de cálculo, ni ninguna otra (§4) |
| **UTF-8 sin BOM**, saltos `\n` (`0a`) | Se decodifica explícito como UTF-8; se acepta y descarta BOM por si un reexport lo trae (R6) |
| Cinco columnas: `Fecha de operación`, `Fecha de valor`, `Concepto`, `Importe`, `Divisa` | Mapeo por **nombre** de columna, no por posición (R7) |
| 🔴 **NO hay columna de saldo** | §3.4 |
| 🔴 **NO hay preámbulo ni IBAN**: la primera línea ya es la cabecera | §3.5 |
| Fechas `dd/mm/aaaa` | Se convierten a `AAAA-MM-DD` validando calendario (R9) |
| Importes con el separador de miles **inconsistente dentro del mismo archivo** | §3.3 |
| Hay **dos líneas idénticas legítimas** el mismo día | Prohibido deduplicar (R13); es el mismo riesgo que ADR-011 decisión 4 documentó para el flujo |
| El número de contrato del concepto se **repite** entre productos distintos | El concepto se copia entero y **no se interpreta** (R12) |

### 3.2 Localizar la cabecera y sobrevivir a una decodificación mala

El archivo se decodifica **explícitamente como UTF-8** (`buffer.toString('utf8')`) y
se le quita el BOM si lo lleva. Esto es lo que evita el `operaciÃ³n` / `â¬` que
aparece al leer bytes UTF-8 como Latin-1: **el problema estaba en el lector, no en el
archivo** (el archivo real trae `c3 b3` para la `ó`, que es UTF-8 correcto).

⚠️ **Riesgo anotado, a confirmar contra el fichero original si vuelve a descargarse:**
si algún día el banco exporta en Windows-1252, decodificar como UTF-8 dejaría `�`
donde había acentos. Por eso la cabecera **no se compara exacta**:

- Se normaliza cada celda de cabecera (NFD, sin diacríticos, minúsculas, espacios
  colapsados) y se compara contra una tabla.
- La única columna con acento (`Fecha de operación`) se reconoce por el **prefijo
  ASCII** `fecha de operaci`, así que sobrevive a que su acento venga corrompido.
- La fila de cabecera es la primera que contiene a la vez una columna de concepto y
  una de importe (las dos son ASCII puro).
- Si no hay cabecera reconocible, **ese archivo** falla y se reporta (R16); los demás
  siguen (§9).

Mapeo (`headerToField`), tolerante al orden de columnas:

| Cabecera normalizada | Campo |
| --- | --- |
| `fecha de operaci…` (prefijo) | `bookingDate` |
| `fecha de valor` | `valueDate` |
| `concepto` | `description` |
| `importe` | `amount` |
| `divisa` | `currency` |

> **Por qué `bookingDate`/`valueDate` y no otros nombres:** es el vocabulario que el
> modelo del flujo ya usa (`Movement.bookingDate`, `Movement.valueDate`, ADR-011) y el
> que el otro parser del repo emite desde la feature 7. Un solo vocabulario para todos
> los bancos hace que el futuro importador tenga **un** mapeo, no uno por banco.

### 3.3 El separador de miles a medias: una sola regla para todo el banco

En la muestra real conviven `-60`, `-9,49`, `-4200`, `-31.000` y `12.345,67`. La regla
se implementa en `myinvestor.format.ts` (`parseAmountText`) y es esta:

1. Se quitan espacios, `€` y `%`.
2. **Si hay coma** → formato español: los puntos son separador de miles y la coma es el
   decimal. `12.345,67` → `12345.67`; `-9,49` → `-9.49`.
3. **Si no hay coma y los puntos separan grupos de exactamente tres dígitos**
   (`^-?\d{1,3}(\.\d{3})+$`) → los puntos son separador de miles. `-31.000` → `-31000`;
   `1.312.000` → `1312000`.
4. **En cualquier otro caso**, el punto es el separador decimal. `1234.56` → `1234.56`;
   `-4200` → `-4200`; `1.5` → `1.5`.
5. Lo que no encaje en `^[+-]?\d+(\.\d+)?$` tras normalizar → **no interpretable**, y se
   reporta (R14).

> 📌 **Pieza compartida con la F13.** Esta función es también la que interpretará los
> números de los archivos de producto escritos a mano (su R26). **La construye esta
> feature y la F13 la importa**; una segunda regla parecida para el mismo banco es una
> trampa garantizada. Sigue viviendo **dentro** del módulo del banco: no sube a
> `src/lib/`.

> ⚠️ **El caso ambiguo y por qué se resuelve así.** `"1.500"` puede ser mil quinientos o
> uno coma cinco. La regla 3 decide **mil quinientos**, porque estos números salen de una
> interfaz española donde el punto **siempre** agrupa miles, y porque el error de esa
> elección (`1.500` → 1500 cuando querías 1,5) es visible a simple vista en el volcado,
> mientras que el contrario (`31.000` → 25 cuando eran veinticinco mil) borraría tres
> ceros de un depósito sin que nada chirríe. Ante dos errores posibles, se elige el que
> se ve.

Las fechas del extracto se interpretan `dd/mm/aaaa` → `AAAA-MM-DD` **validando que la
fecha existe** (un `31/02/2026` va a `unparsedRows`, no se convierte en marzo).

### 3.4 🔴 El saldo: este banco no lo da, y el parser no lo inventa (R17, R18, R19)

**Es la diferencia más importante con el otro extracto que el proyecto ya sabe leer**, y
tiene consecuencias que van más allá de esta feature.

**Lo que hace el parser:**

- Cada movimiento lleva [`balance`](../../src/lib/parsed-statement.ts#L36)`: null`
  (el nombre del campo lo fija el contrato compartido de la F11, no este spec).
  **Presente y nulo**, nunca ausente y nunca `0`: la clave que existe con valor nulo
  dice *"aquí no hay dato"*; una clave ausente sería indistinguible de un olvido de
  implementación, y un `0` es un saldo real.
- 🔴 **NO hay ningún campo `providesBalance`.** Este spec lo proponía; **ADR-013 lo
  descartó** ([architecture.md](../../docs/architecture.md), alternativas
  consideradas): `balance: null` por línea ya dice que el dato no viene, y una constante
  por banco duplica ese conocimiento en dos sitios que hay que mantener coherentes. El
  resultado tiene **exactamente** las cuatro claves de
  [`ParsedStatement`](../../src/lib/parsed-statement.ts#L68) (R18).
- **El parser NO calcula el saldo. Ni acumulando importes, ni partiendo de un saldo
  inicial, ni de ninguna otra forma.** Es una prohibición explícita del `intent` ("no
  inventar un saldo que el extracto no trae") y también lo correcto: un saldo calculado
  aquí sería indistinguible, aguas abajo, de uno impreso por el banco, y el modelo del
  flujo trata esos dos casos de forma distinta a propósito.

**Consecuencia para la feature de importación (información, no trabajo de esta feature):**

`ADR-011` decisión 3 fijó que *"el saldo de la cuenta se LEE del extracto"* y que sumar
desde `Account.initialBalance` es el **caso excepcional** ("un banco sin saldo corrido, o
una cuenta sin nada importado"). **Para este banco ese caso excepcional pasa a ser el
camino normal.** El código ya lo soporta sin cambios:
[`computeAccountBalance`](../../src/modules/movements/movements.service.ts#L56) filtra
los movimientos con `balanceAfter !== null` (el nombre en la **BD**; en el contrato del
parser el mismo dato se llama `balance`, mapeo de una línea que documenta ADR-013), no
encuentra ninguno y cae en la rama que suma desde `initialBalance`. Lo que sí cambia es una obligación **operativa** del humano:

> 📌 **Para esta cuenta, `Account.initialBalance` deja de ser un dato decorativo y pasa
> a ser el único ancla del saldo.** Si se da de alta con `0` "ya se corregirá luego", el
> saldo de la cuenta será siempre erróneo por esa cantidad, y no habrá ningún
> saldo impreso por el banco que lo desmienta.

### 3.5 🔴 Tampoco trae el IBAN (R20)

El archivo **no tiene preámbulo**: la primera línea es la cabecera. No hay IBAN en
ninguna parte. El resultado emite `accountIban: null` y no lo deduce del nombre del
archivo ni de la carpeta ni de los conceptos.

📌 **Consecuencia para la feature de importación:**
`findOrCreateAccountFromMetadata` (feature 8, ADR-011 decisión 9) exige **IBAN +
banco** y lanza `MissingAccountDataError` (422) si faltan. Con este extracto **siempre**
faltará el IBAN, así que la cuenta corriente de este banco **habrá que darla de alta a
mano** (que es exactamente el camino que esa feature dejó previsto para este caso). No
es un fallo: es el comportamiento diseñado, y conviene saberlo antes de importar.

### 3.6 🔴 En qué orden exporta MyInvestor y cómo se numera el día (R68, R69)

> **Sección añadida el 2026-08-11** al re-especificar contra el contrato de la F11
> ([`src/lib/parsed-statement.ts`](../../src/lib/parsed-statement.ts), ADR-013
> decisión 3). No existía cuando se escribió este design porque el contrato no existía.

El contrato exige que **el parser** emita
[`daySequence`](../../src/lib/parsed-statement.ts#L56): la posición del movimiento
dentro de su `bookingDate`, donde **`1` es el más antiguo de ese día**. No es el orden
de aparición en el archivo. Se calcula con el helper compartido
[`assignDaySequence(drafts, fileOrder)`](../../src/lib/parsed-statement.ts#L96); lo
único que pone el banco es `fileOrder`.

**Decisión: `statementOrder = 'newest-first'`.** Verificado sobre la muestra real de
`var/drive-read/myinvestor/2026/`: la primera línea de datos es del `06/08/2026` y la
última del `08/07/2026`, es decir, el archivo baja de la fecha de operación más reciente
a la más antigua. Es el mismo sentido que Bankinter
([`bankinter.parser.ts:10`](../../src/modules/bankinter/bankinter.parser.ts#L10)), así
que se declara con el mismo patrón: una constante de módulo con el porqué en el
comentario. **Numerar no es leer el formato**, así que compartir el helper no roza la
norma «un parser por banco»; lo que sí la rompería es que lo calculara el importador.

⚠️ **Solo se numeran las filas parseadas.** Una fila que acaba en `unparsedRows` **no
consume número**: se pasa a `assignDaySequence` únicamente el array de
[`ParsedMovementDraft`](../../src/lib/parsed-statement.ts#L82), así que cada día queda
`1..n` sin huecos (R69). Consecuencia que el contrato ya documenta y que hereda esta
feature: si mañana se recupera una fila que hoy falló (parser arreglado, redescarga),
**ese día se renumera** y los números anteriores dejan de coincidir con los ya
guardados. No es trabajo de esta feature, pero conviene que esté escrito.

**Implicación de orden de operaciones:** el parser construye primero los *drafts* (sin
`daySequence`), recogiendo las líneas ilegibles en `unparsedRows`, y **solo al final**
llama a `assignDaySequence`. El array conserva el orden del archivo (R5): el helper solo
**añade** el campo.

## 4. ⭐ DECISIÓN PROPIA #3 — Cero dependencias nuevas (R58)

**Decisión: ninguna dependencia nueva. Ni para el CSV, ni para el JSON, ni para
validar.**

| Necesidad | Cómo se resuelve | Por qué no una librería |
| --- | --- | --- |
| Leer texto delimitado por `;` | `buffer.toString('utf8')` → `split(/\r?\n/)` → `split(';')` | El archivo no usa comillas ni escapes: cinco campos, ninguno con `;` dentro. Una librería de CSV resolvería un problema que este archivo no tiene, a cambio de una dependencia y su árbol |
| Números y fechas | `myinvestor.format.ts` (§3.3) | — |
| Escribir el volcado | `JSON.stringify` nativo | — |

🔴 **Trampa a evitar explícitamente:** la librería de hojas de cálculo que el repo ya
tiene arrastra un parser de CSV **transitivo**. **No se importa.** Una dependencia
transitiva no está en `package.json`, nadie garantiza que siga ahí tras un `pnpm
update`, y usarla convertiría una actualización ajena en una rotura de este parser.

- **Alternativa descartada — añadir un parser de CSV (`csv-parse`, `papaparse`):** sería
  la elección correcta si el formato tuviera comillas, campos multilínea o delimitadores
  variables. No los tiene. El coste de equivocarse es bajo y reversible: si algún día un
  concepto trae un `;`, esa línea caerá en `unparsedRows` con su motivo —**visible, no
  silenciosa**— y entonces se reevalúa con el caso real delante.
- **Límite conocido:** una línea con un `;` dentro de un campo se reporta como no
  interpretable (número de columnas inesperado) en vez de parsearse. Documentado en el
  ADR.

## 5. ⭐ DECISIÓN PROPIA #4 — Qué archivo es qué y de qué banco (R25, R50)

Dos preguntas distintas, dos respuestas distintas, cada una resuelta donde el dato es
más estable.

### 5.1 Qué parser aplica → **por la extensión** (R50)

`.csv` → parser del extracto. Cualquier otra extensión → `ignored[]` (§9).

⚠️ **Detalle del corte:** los `.json` de producto caen hoy en `ignored[]` porque **nadie
sabe leerlos todavía**, y eso es correcto: no son un fallo. La **F13
`myinvestor-products`** cambiará esa rama (su R76) sin tocar nada más de este servicio.

- **Por qué:** es la única señal que existe **antes** de abrir el archivo, no obliga al
  humano a nombrar nada de una forma concreta, y es imposible equivocarse al aplicarla.
- **Alternativa descartada — mirar el contenido** (si la primera línea tiene la
  cabecera, es un extracto; si empieza por `{`, es un producto): funciona, pero obliga a
  leer y a adivinar antes de decidir, y convierte un archivo corrupto en "no sé ni qué
  querías que fuera esto". Con la extensión, un `.json` roto se reporta como *"producto
  con JSON inválido"*, que es un mensaje accionable.
- **Alternativa descartada — subcarpetas en Drive** (`extracto/`, `productos/`):
  cambiaría la estructura que las features 4 y 5 fijaron (`<banco>/<año>/` +
  `procesados/`) y obligaría a tocar la ingesta. Coste desproporcionado para distinguir
  dos extensiones.

### 5.2 De qué banco → **de la carpeta** (R25)

`var/drive-read/<banco>/<año>/`. Ni el CSV ni los JSON llevan el banco dentro.

- **Por qué:** es la regla que el proyecto ya tiene desde la feature 5 (*"el banco y el
  año de cada archivo se saben por la carpeta, no por el contenido"*) y desde ADR-008
  (Drive es el registro de bancos). Meter un campo `bank` en el archivo crearía una
  segunda fuente de verdad que puede contradecir a la carpeta, y no hay forma de decidir
  cuál gana.

> ### 5.3 a 5.4, 6, 7 y 8 → **F13 `myinvestor-products`**
>
> ✂️ **Corte del 2026-08-11.** Todo lo que decidía el formato de los archivos JSON de
> producto —la identidad y la fecha dentro del archivo (§5.3), un archivo por producto
> (§5.4), los números y las fechas escritos a mano (§6), los campos de cada tipo de
> producto (§7) y cómo se declara un producto cerrado (§8)— vive ahora en
> [`../myinvestor-products/design.md`](../myinvestor-products/design.md), **con la misma
> numeración de secciones**, para que las referencias ya escritas sigan valiendo.
>
> 📌 **Lo único que esta feature debe saber de aquello:** la F13 **reutilizará
> `parseAmountText`** (§3.3) para sus números y **añadirá `parseIsoDate`** al mismo
> `myinvestor.format.ts`. Por eso §3.3 se escribe pensando en las dos entradas y **no se
> mete en `src/lib/`**: es conocimiento de este banco, no de todos.

## 9. ⭐ DECISIÓN PROPIA #8 — Reporte de errores (R16, R47, R49)

**Principio: un archivo roto no puede tumbar el parseo de los demás, y el reporte tiene
que bastar para arreglarlo sin volver a lanzar.**

### 9.1 Las tres listas del resultado

| Lista | Qué contiene | Forma |
| --- | --- | --- |
| `failed[]` | Archivos que no se pudieron interpretar | `{ bank, year, file, reason }` |
| `ignored[]` | Archivos que no van con este parser (extensión no soportada) | `{ bank, year, file, reason }` |
| `unparsedRows[]` | Líneas del **extracto** no interpretables (dentro del resultado de ese archivo) | `{ row, reason }` |

`unparsedRows` con `row` + `reason` reutiliza literalmente el vocabulario que el otro
parser del repo ya emite desde la feature 7. Un solo vocabulario para todos los bancos.

### 9.2 Los casos mínimos, uno a uno

| Caso | Dónde se reporta | Qué dice el motivo |
| --- | --- | --- |
| Línea del CSV no interpretable (R14) | `unparsedRows` | el nº de línea y el motivo |
| Sin cabecera reconocible en un `.csv` (R16) | `failed` | que no parece un extracto |
| Extensión que este parser no maneja (R49) | `ignored` | la extensión |

> Los motivos propios de un **archivo de producto** (sintaxis rota, campo ausente,
> número ilegible, tipo desconocido, fecha en otro formato, clave desconocida, choque de
> duplicados) los añade la **F13** a este mismo `failed[]`; ver
> [`../myinvestor-products/design.md`](../myinvestor-products/design.md) §9.

### 9.3 Las dos reglas que gobiernan el reporte

1. **Aislamiento (R47).** Cada archivo se parsea dentro de su propio `try`. Un fallo se
   captura, se anota y **no interrumpe el bucle**. Es el mismo patrón de aislamiento por
   archivo que ADR-009 y ADR-010 ya establecieron, y el motivo por el que la respuesta
   HTTP sigue siendo **200** aunque haya fallos (R57): el 200 dice "el proceso corrió",
   los `failed[]` dicen qué no salió. **La F13 hereda este bucle tal cual: no lo
   reescribe.**
2. **Ruido cero (R49).** Lo que no es asunto de este parser (un `.txt` con lo que
   copiaste de la web, y de momento también los `.json` de producto) no es un error: va
   a `ignored[]`. Visible, pero fuera de la lista de cosas que arreglar. Ahora mismo tu
   carpeta real tiene tres `.txt`.

### 9.4 Por qué no se lanzan errores de dominio

`src/errors/app-error.ts` **no gana ninguna subclase**. Un archivo mal escrito no es una
excepción de la petición: la petición ha ido bien y su respuesta es *"esto he podido
leer y esto no"*. `ValidationError` se sigue usando **dentro** del parser puro para el
fallo estructural (no hay cabecera), pero el servicio lo captura y lo convierte en una
entrada de `failed[]`, igual que hace el precedente del proyecto.

### 9.5 Qué sale y qué no sale en los motivos

Los motivos citan **el dato concreto que falló** (`línea 7: importe no interpretable
('mil trescientos')`), porque sin él el mensaje no sirve para arreglar nada. No se
vuelca el archivo entero ni rutas absolutas de la máquina (R54). Todo esto vive en local
y en un volcado gitignoreado.

## 10. ⭐ DECISIÓN PROPIA #9 — Disparo y volcado: el camino que ya existe (R51-R57)

**Nada nuevo. Se reutiliza el camino de ADR-009 + ADR-010 tal cual:**

```
Drive  ──ingesta (f5)──►  var/drive-read/myinvestor/<año>/   (copias locales, gitignored)
                                    │
                                    ├── *.csv   ─► parser del extracto   (esta feature)
                                    ├── *.json  ─► ignored[]  → parser de productos (F13)
                                    └── resto   ─► ignored[]
                                    │
        POST /api/parser/myinvestor ▼
                          var/parsed/myinvestor/<año>/        (volcado, gitignored)
                            ├── <archivo>.csv.json            (uno por extracto)
                            └── products.json                 (uno por año, lo añade la F13)
```

- **Endpoint:** `POST /api/parser/myinvestor`, registrado bajo el prefijo `/api/parser`
  que ya existe en `src/app.ts`. Sin cuerpo, sin autenticación nueva, **read-only**
  respecto a Drive y a la base de datos.
- **Directorios inyectables** (`sourceBaseDir`, `dumpBaseDir`) con los mismos valores por
  defecto que el precedente, para poder testear contra un tempdir sin tocar `var/`.
- **Idempotencia observable:** sin copias locales no hace nada y no falla (R56).

> **§10.1 y §10.2 (el volcado de los productos y cómo no confundirlo con el origen) se
> fueron con la F13**, que es quien lo produce. Lo que aquí se mantiene es la regla
> general de la que aquella hereda: se **lee** de `var/drive-read/` y se **escribe** en
> `var/parsed/`, nunca al revés, y los dos directorios están gitignoreados por separado.

## 11. Borrador de ADR (va a `docs/architecture.md`, tarea de docs — R62)

> Formato ADR-005/…/013. El `implementer` lo redacta al cerrar; aquí queda el
> esqueleto. 🔴 **Numeración corregida el 2026-08-11: es el ADR-014.** El ADR-013 ya
> está ocupado por el contrato compartido de la F11 (`docs/architecture.md`), y el
> ADR-012 por el modelo de inversiones de la F9. Verificar el siguiente libre al
> redactar.

### ADR-014: Parser del extracto de MyInvestor — módulo por banco, CSV leído sin librería, sin saldo y sin IBAN

- **Fecha:** 2026-08-10 (re-especificado el 2026-08-11 contra el contrato de la F11 y
  recortado al extracto tras el corte de la feature).
- **Estado:** propuesta (se acepta al aprobar el spec e implementarse).
- **Contexto:** **segundo banco del repo con parser propio** y primero con **varias
  entradas** (la segunda, los archivos de producto, la trae la F13
  `myinvestor-products`). La norma «Parsers de banco» de `docs/conventions.md` ya fija el
  módulo por banco y, desde el 2026-08-11, **una única forma de salida** (ADR-013). De
  las ocho decisiones que el `intent` delegó, este ADR resuelve las del extracto: banco
  por carpeta o por contenido, taxonomía de errores del servicio, disparo y volcado, y
  dependencias.
- **Decisión:**
  1. **Módulo `src/modules/myinvestor/`** (slug de `normalizeBankName`), con su parser
     puro del extracto, su servicio, su ruta y un normalizador de números y fechas
     compartido **solo dentro del banco** (la F13 lo reutiliza y lo amplía). Disjunto de
     `src/modules/investments/` (feature 9). **El módulo no declara la forma de un
     movimiento parseado: consume el contrato de ADR-013**
     (`src/lib/parsed-statement.ts`) y solo declara lo suyo,
     `MyinvestorStatementResult = ParsedStatement<'myinvestor'>` y los resúmenes de su
     ejecución local.
  2. **El extracto se lee como texto delimitado por `;`, decodificado explícitamente
     como UTF-8** (con BOM tolerado), con la **cabecera localizada por nombre** de
     columna (insensible a mayúsculas/acentos, con prefijo ASCII para la única columna
     acentuada) y no por posición.
  3. 🔴 **Este banco no da saldo ni IBAN.** Cada movimiento sale con `balance: null` y
     el resultado con `accountIban: null`, que es la representación que ADR-013 fija
     para "no viene en el fichero". **Sin campo `providesBalance`** (ADR-013 lo
     descartó: la duplicaría). **El parser no inventa ni calcula el saldo.** Consecuencia
     para la importación: la rama de ADR-011 que suma desde `Account.initialBalance`
     —pensada como excepcional— es el **camino normal** de esta cuenta, y su cuenta
     habrá que **crearla a mano** (sin IBAN, `findOrCreateAccountFromMetadata` devuelve
     `MISSING_ACCOUNT_DATA`).
  4. **Una única regla de números para todo el banco:** coma → decimal español; sin coma
     con puntos cada tres dígitos → miles; en otro caso, punto decimal. Vive en
     `myinvestor.format.ts` y **no sube a `src/lib/`**; la F13 la reutiliza sin
     duplicarla.
  5. **Qué parser aplica se decide por la extensión** (`.csv` → extracto; el resto →
     `ignored[]`), y **el banco sale de la carpeta**, nunca del contenido.
  6. **Errores por archivo y aislados**: `failed[]`, `ignored[]` (extensiones que este
     parser no maneja) y `unparsedRows[]` (líneas del extracto, con su número y su
     motivo). Respuesta **200** con los fallos dentro. **Ninguna subclase de error
     nueva.**
  7. **Cero dependencias nuevas**: `split(';')`. Prohibido usar el parser de CSV que
     llega como dependencia **transitiva** de otra librería.
  8. **Disparo y volcado por el camino existente:** `POST /api/parser/myinvestor`,
     origen `var/drive-read/myinvestor/<año>/`, volcado `var/parsed/myinvestor/<año>/`
     con `<archivo>.json` por extracto.
  9. 🔴 **MyInvestor exporta `'newest-first'`** (verificado sobre la muestra real: las
     fechas de operación bajan de `06/08/2026` a `08/07/2026`). Ese argumento es lo
     único que aporta el banco a
     [`assignDaySequence`](../../src/lib/parsed-statement.ts#L96), que numera cada
     movimiento dentro de su día desde el más antiguo. **Solo se numeran las filas
     parseadas**: las de `unparsedRows` no consumen número. Y la regla del signo **se
     importa, no se copia** (`deriveMovementTypeFromAmount`), de modo que el importe 0
     sale `neutral` por el mismo camino que en Bankinter.
- **Alternativas consideradas:** agrupar el parser por recurso funcional
  (`modules/investments/`) en vez de por banco; una librería de CSV; mirar el contenido
  en vez de la extensión para decidir qué parser aplica. Cada una con su porqué en §2,
  §4 y §5 de este design. Las alternativas del **formato de los archivos de producto**
  están en el ADR de la F13.
- **Consecuencias:**
  - **Sin dependencias, sin variables de entorno y sin migración.** `docs/stack.md` no
    cambia; `.gitignore` tampoco (los dos directorios ya están cubiertos).
  - **Segundo banco con parser propio**: la norma «un parser por banco» pasa de escrita
    a demostrada, y `docs/dar-de-alta-un-banco.md` gana el paso que le faltaba.
  - **Límite conocido:** una línea del CSV con un `;` dentro de un campo se reporta como
    no interpretable en vez de parsearse (no hay soporte de comillas).
  - **La F13 amplía este módulo**, no lo duplica: añade el parser de productos, una
    función de fecha ISO al formato y una rama al servicio.
  - **Contrato con la feature de importación:** el importador de este banco tendrá que
    (a) no esperar saldo y (b) no esperar IBAN.

## 12. La feature 9 → lo mira la **F13**

> ✂️ **Corte del 2026-08-11.** La pregunta "¿estos formatos obligan a cambiar el modelo
> de la feature 9?" (R63) era de los **archivos de producto**, no del extracto: un
> movimiento de la cuenta corriente no toca ni `InvestmentProduct` ni `Valuation`. La
> respuesta —**el esquema no cambia**— y su detalle están en
> [`../myinvestor-products/design.md`](../myinvestor-products/design.md) §12.
>
> **Esta feature no toca `specs/investments-data-model/` ni `prisma/`.**

## 13. Modelo de tipos y firmas nuevas (`myinvestor.types.ts`)

En inglés, como todo el dominio (`docs/conventions.md` §Idioma). Los nombres de campo
que ya existen en el proyecto se reutilizan tal cual.

```ts
// ── Entrada 1: el extracto de la cuenta corriente ─────────────────
// 🔴 Re-especificado el 2026-08-11: este módulo NO declara la forma de un
// movimiento parseado. Esa forma es el CONTRATO compartido de la F11
// (src/lib/parsed-statement.ts, ADR-013) y un guardián de architecture.test.ts
// rechaza cualquier segunda declaración en src/. Lo único propio del banco es
// el literal y los resúmenes de su ejecución local, igual que en
// bankinter.types.ts:14. (R70)
import type { ParsedStatement } from '../../lib/parsed-statement.js'

// Movimiento = ParsedMovement del contrato:
//   bookingDate, valueDate, description, amount, currency, type, daySequence
//   + balance: number | null  ->  SIEMPRE null en este banco (§3.4, R17)
// Resultado  = ParsedStatement con accountIban: string | null
//   ->  SIEMPRE null en este banco (§3.5, R20)
// Sin campo `providesBalance`: ADR-013 lo descartó (§3.4, R18).
export type MyinvestorStatementResult = ParsedStatement<'myinvestor'>

// ── Resultado de una ejecución completa ───────────────────────────
export interface FailedFile { bank: string; year: string; file: string; reason: string }
export interface IgnoredFile { bank: string; year: string; file: string; reason: string }

// Mismo modelo de resumen que ParsedFileSummary de bankinter.types.ts:17
// (un banco puede tener su propio resumen de ejecución local; lo que no puede
// tener es su propia forma de movimiento).
export interface ParsedStatementSummary {
  bank: string; year: string; file: string
  accountIban: string | null     // null en este banco (§3.5)
  movements: number
  unparsedRows: number
  dumpPath: string               // relativa al dumpBaseDir (§10)
}

export interface MyinvestorParseRunResult {
  parsedCount: number
  failedCount: number
  ignoredCount: number
  statements: ParsedStatementSummary[]
  failed: FailedFile[]
  ignored: IgnoredFile[]
}
```

> 📌 **Lo que añadirá la F13 a este mismo archivo:** `InvestmentProductType`,
> `ParsedValuation`, `ParsedDepositTerms`, `ParsedProduct`, `MyinvestorProductsResult`,
> `ParsedProductSummary` y un campo `products` en `MyinvestorParseRunResult`.
> `FailedFile` e `IgnoredFile` **los declara esta feature** y ella los reutiliza.

**Firmas nuevas:**

```ts
// myinvestor.format.ts   (la F13 le añadirá parseIsoDate)
export function parseAmountText(value: unknown): number | null      // §3.3
export function parseStatementDate(value: unknown): string | null   // dd/mm/aaaa -> ISO

// myinvestor.statement.parser.ts
export function parseMyinvestorStatement(content: Buffer): MyinvestorStatementResult

// myinvestor.service.ts   (la F13 ampliará su resultado con products[])
export function parseLocalMyinvestorCopies(
  sourceBaseDir: string, dumpBaseDir: string,
): Promise<MyinvestorParseRunResult>
```

> **Por qué los importes salen como `number` y no como cadena normalizada:** es el
> vocabulario que el otro parser del repo ya usa, y el futuro importador quiere **un**
> mapeo, no uno por banco. No hay pérdida observable: un valor con dos decimales por
> debajo de los diez billones sobrevive al viaje `double → JSON → toFixed(2)` con los
> mismos dígitos, y la conversión final a `Decimal(10,2)` la hace el importador.
> **Alternativa anotada** por si algún día hay tres decimales o importes enormes: emitir
> cadenas normalizadas (`"1234.56"`), que Prisma acepta directamente para `Decimal`.

## 14. Estrategia de test (Nivel 2 de `docs/verification.md`)

- **Fixtures SINTÉTICOS, generados en código** (`myinvestor.fixture.ts`): el CSV se
  construye como string. 🔴 **Nunca se copian cifras, conceptos ni
  nombres de los archivos reales de `var/`**, ni se versiona ningún archivo de muestra.
  Los fixtures **imitan la forma** (mismas columnas, mismas mezclas de formato numérico,
  mismo tipo de conceptos) con datos inventados.
- **Sin red y sin base de datos.** Los parsers son puros; el servicio y la ruta se
  ejercen contra un **tempdir** (`mkdtemp`) inyectado por `sourceBaseDir` /
  `dumpBaseDir`, exactamente como ya se hace en el precedente del proyecto. La ruta se
  prueba con `buildApp()` + `app.inject()`.
- **Comparar el resultado concreto**, nunca "no lanza" (anti-patrón de
  `docs/verification.md`).

| Archivo de test | Cubre |
| --- | --- |
| `myinvestor.format.test.ts` | R9, R10 |
| `myinvestor.statement.parser.test.ts` | R5, R6, R7, R8, R9, R11, R12, R13, R14, R15, R16, R17, R18, R19, R20, R68, R69 |
| `myinvestor.service.test.ts` | R4, R25, R47, R49, R50, R52, R55, R56 |
| `myinvestor.routes.test.ts` | R51, R54, R57 |
| `src/architecture.test.ts` | R1, R2, R3, R65, R70 (guardián de la F11, ya existente) |

**Requirements de proceso** (checklist del reviewer sobre el diff, no test):
**R58, R59, R61, R62, R64, R66, R67**. Hay que anotarlo así en el mapa de
trazabilidad (R67), igual que se hizo en las features 8 y 9.

## 15. Riesgos y notas para el implementer

- 🔴 **`pnpm`, NUNCA npm.** Y **cero dependencias nuevas** (§4): si te ves escribiendo
  `pnpm add`, para y relee §4.
- ⏸️ **NO empieces hasta que el humano apruebe esta spec.** ✅ No tiene ningún punto 🔴
  pendiente, así que la puerta es corta: los cinco se fueron con la **F13
  `myinvestor-products`**, que **no** hay que esperar para implementar esta.
- 🔴 **No implementes nada de la F13 "ya que estás".** Ni el parser de productos, ni
  `parseIsoDate`, ni la rama `.json` del servicio, ni `docs/myinvestor-product-files.md`.
  Los `.json` van a `ignored[]` y punto (§5.1): su formato **está sin aprobar** y
  adelantarlo es exactamente lo que el corte evita.
- 🔴 **Los fixtures son sintéticos.** Nunca copies datos de `var/drive-read/` a un test.
  Esa carpeta está gitignoreada por una razón.
- 🔴 **No MODIFIQUES el otro módulo de parser del repo**, ni `prisma/`, ni los módulos
  del flujo, ni `src/lib/` (importarlos sí: §1). Si te tienta "ya que estoy, unifico los
  dos parsers en `lib/`",
  **para**: la norma de `docs/conventions.md` §Parsers de banco lo prohíbe explícitamente
  y ese es el punto entero de esta feature.
- 🔴 **Decodifica el CSV como UTF-8 explícitamente** y quita el BOM. No uses
  `readFile(path, 'utf8')` sin más si necesitas inspeccionar los bytes: lee a `Buffer` y
  decodifica tú, para que el parser puro reciba un `Buffer` y sea testeable sin disco.
- 🔴 **No acumules saldos.** Ni siquiera "por si acaso, en una variable local". §3.4.
- 🔴 **No declares tipos de movimiento.** Si te ves escribiendo `interface
  MyinvestorMovement` o `type ParsedMovementType`, **para**: eso vive en
  [`src/lib/parsed-statement.ts`](../../src/lib/parsed-statement.ts) desde la F11 y hay
  un guardián que lo rechaza (§13, R70). Copia el patrón de
  [`bankinter.types.ts:14`](../../src/modules/bankinter/bankinter.types.ts#L14).
- ⚠️ **`daySequence` va la última.** Construye `ParsedMovementDraft[]` y llama a
  `assignDaySequence(drafts, 'newest-first')` al final, **con las filas ilegibles ya
  fuera** (§3.6, R68, R69).
- ⚠️ **El orden lo es todo para R55.** Lista los archivos con `.sort()` antes de
  recorrerlos, y serializa con `JSON.stringify(x, null, 2)` con las claves siempre en el
  mismo orden (constrúyelas literalmente, no con `Object.assign` sobre entradas
  variables).
- ⚠️ **Cuidado con la línea en blanco final:** casi todos los CSV terminan en `\n`. Sin
  el filtro de líneas vacías (R15), aparecería un `unparsedRows` fantasma en cada
  archivo.
- ⚠️ **`row` es 1-based contando la cabecera** (la primera línea de datos es la 2), para
  que el número que reportas coincida con el que ve el humano al abrir el archivo.
- Convenciones (`docs/conventions.md`): comillas simples, sin `;` al final de línea,
  2 espacios, 100 columnas, imports relativos con `.js`, `import type` para tipos,
  vendor antes que relativos, comentarios mínimos y en inglés.
