# iban-normalization (F21) — implementación

> Feature **sin spec** (`sdd: false`): se trabajó del `intent` y de los **9
> criterios de `acceptance`** de `feature_list.json`.
>
> Nace del hallazgo de la [prueba real del 2026-08-18](../explorations/prueba-real-n26-2026-08-18.md)
> §Pasada 2: el IBAN se guardaba **literal**, así que el mismo IBAN escrito con y
> sin espacios creaba **dos cuentas distintas, en silencio**, en los tres bancos.

## Qué hace la app que antes no

1. El IBAN se **normaliza** (sin espacios —tampoco los interiores— y en
   mayúsculas) en un único sitio, y ese sitio lo usan **los tres bancos** y
   **`POST /api/accounts`**. El mismo IBAN escrito de dos formas es una cuenta.
2. El IBAN se **valida**: forma ISO, longitud del país y **dígito de control
   mod-97**. Un dígito mal tecleado **rechaza el fichero entero** con un motivo
   que dice el problema por su nombre, y **no crea ninguna cuenta**.
3. `:` como separador del preámbulo **sigue fallando**, por decisión del humano.

## Archivos creados

| Archivo | Qué contiene |
| --- | --- |
| [`src/lib/iban.ts`](../../src/lib/iban.ts) | **El único normalizador+validador.** [`normalizeIban`](../../src/lib/iban.ts#L27), [`ibanRejectionReason`](../../src/lib/iban.ts#L71), [`isValidIban`](../../src/lib/iban.ts#L100), [`requireValidIban`](../../src/lib/iban.ts#L109) y [`readPreambleIban`](../../src/lib/iban.ts#L135), más la tabla de longitudes por país y el mod-97. |
| [`src/lib/iban.fixture.ts`](../../src/lib/iban.fixture.ts) | Helper de tests (no es test): [`syntheticIban`](../../src/lib/iban.fixture.ts#L23) construye uno único y **bien formado** (dígitos de control calculados con el propio validador) y [`mistypedIban`](../../src/lib/iban.fixture.ts#L44) le estropea un dígito. |
| [`src/lib/iban.test.ts`](../../src/lib/iban.test.ts) | 22 tests del módulo + los guardianes de «un solo normalizador». |
| `progress/implementations/iban-normalization.md` | Este informe. |

## Archivos modificados

| Archivo | Cambio |
| --- | --- |
| [`src/errors/app-error.ts:56`](../../src/errors/app-error.ts#L56) | Nueva `InvalidIbanError` → código estable **`INVALID_IBAN`, 422**. |
| [`src/modules/bankinter/bankinter.parser.ts:65`](../../src/modules/bankinter/bankinter.parser.ts#L65) | `findIban` (que normalizaba y comprobaba la forma **por su cuenta**) pasa a ser `findIbanLine`, que solo **localiza** la línea; juzgarla es de `lib/iban.ts`. |
| [`src/modules/myinvestor/myinvestor.statement.parser.ts:126`](../../src/modules/myinvestor/myinvestor.statement.parser.ts#L126) | `accountIban: readPreambleIban(ibanLine)`. |
| [`src/modules/n26/n26.statement.parser.ts:150`](../../src/modules/n26/n26.statement.parser.ts#L150) | `accountIban: readPreambleIban(ibanLine)`. |
| [`src/modules/accounts/accounts.service.ts`](../../src/modules/accounts/accounts.service.ts) | El `normalizeIban` local **desaparece** (se mueve a `lib/`, no se reexporta) y se valida en las dos entradas: [`createAccount:136`](../../src/modules/accounts/accounts.service.ts#L136) y [`findOrCreateAccountFromMetadata:183`](../../src/modules/accounts/accounts.service.ts#L183). |
| [`src/modules/import/import.service.ts:123`](../../src/modules/import/import.service.ts#L123) | `resolveAccount` usa el normalizador compartido en lugar de un `.trim()`. |
| [`src/architecture.test.ts`](../../src/architecture.test.ts) | `lib/iban.ts` y `lib/iban.test.ts` en el árbol esperado (ADR-004). |
| Tests de `accounts`, `movements`, `import` (`service` y `routes`) | Sus `uniqueIban()` construían `ES` + timestamp: longitud imposible y dígito de control aleatorio. Ahora usan `syntheticIban()`. **Era el fixture el que estaba mal**, no la regla. |

## Documentación

- **ADR-021** en [`docs/architecture.md`](../../docs/architecture.md) — las cinco
  decisiones y las cuatro alternativas descartadas.
- [`docs/api-contract.md`](../../docs/api-contract.md) — `INVALID_IBAN` en la tabla
  de códigos estables (+ su nota), en los errores de `POST /api/accounts`, en los
  códigos por archivo de `POST /api/import`, y en el contrato del resultado del
  parser.
- [`docs/conventions.md`](../../docs/conventions.md) §Parsers de banco — dos
  normas nuevas: dónde vive la regla del IBAN, y que `:` no se acepta.
- [`docs/dar-de-alta-un-banco.md`](../../docs/dar-de-alta-un-banco.md) — §«Cómo
  escribes el IBAN da igual; que esté bien tecleado, no», con el motivo exacto que
  verá el humano y qué hacer.
- [`docs/data-model.md`](../../docs/data-model.md) — el comentario de
  `Account.iban` decía «normalizada»; ahora dice **dónde** y que además se valida.
  (Lección de la F15: el registro que documenta la regla se actualiza en la misma
  feature.)
- [`docs/roadmap.md`](../../docs/roadmap.md) §Deberes tuyos — qué cambia para él.

## Las tres decisiones delegadas, resueltas por escrito

### 1. Dónde vive el normalizador (`delego_en_agente` nº 1)

**En [`src/lib/iban.ts`](../../src/lib/iban.ts), y solo ahí.** Un IBAN **no es el
formato de ningún banco**: es el identificador ISO 13616 de una cuenta. La norma
de `docs/conventions.md` prohíbe compartir **el código que lee un formato**, no
«lo que se parece entre bancos»; lo que no es formato ya se comparte —la
codificación (`lib/utf8.ts`, ADR-018) y la forma de la salida
(`lib/parsed-statement.ts`, ADR-013)— y esto es exactamente lo mismo.

Cómo lo consume cada puerta, sin repetir la regla en cuatro sitios:

- **Los tres parsers** llaman a `readPreambleIban(<la línea que ya sabían
  localizar>)`. Cada banco sigue sabiendo **dónde** está su IBAN (preámbulo propio
  en Bankinter, línea `iban;` escrita a mano en los otros dos); ninguno sabe ya
  **qué** es un IBAN válido.
- **El servicio de cuentas** llama a `requireValidIban` en sus **dos** entradas:
  el alta manual (`createAccount`) y el alta automática desde un extracto
  (`findOrCreateAccountFromMetadata`). La segunda importa aunque hoy el importador
  ya reciba el IBAN validado por el parser: es la que hace la regla cierta para
  cualquier llamador futuro.
- El antiguo `normalizeIban` de `accounts.service.ts` **se movió, no se
  reexportó**: dejar un alias habría dejado dos nombres para la misma regla.

Está **guardado por tests**, no solo por convención
([`iban.test.ts`](../../src/lib/iban.test.ts)): falla si un parser deja de
importarlo, si el servicio de cuentas deja de validar en sus dos entradas, si
aparece un segundo «quitar espacios + mayúsculas» en `src/`, o si aparece un
segundo mod-97 (el del guardián de privacidad está declarado como excepción a
propósito: un test que importa el código que audita deja de poder cazarlo).

### 2. Qué es «un IBAN válido» y cómo se rechaza (`delego_en_agente` nº 2)

Cuatro comprobaciones, en este orden, sobre el IBAN **ya normalizado**:

| # | Comprueba | Motivo si falla |
| --- | --- | --- |
| 1 | No vacío | `está vacío` |
| 2 | Forma ISO: `^[A-Z]{2}\d{2}[A-Z0-9]+$` | `no tiene la forma de un iban (dos letras de país, dos dígitos de control y luego solo letras o números)` |
| 3 | Longitud del país (`ES` = 24, `DE` = 22…) | `un iban de ES tiene 24 caracteres y este tiene 26` |
| 4 | **Dígito de control mod-97** (ISO 7064 MOD 97-10) | `el dígito de control no cuadra` |

- **La tabla de longitudes es deliberadamente asimétrica:** un país que no está en
  ella **no** se rechaza por longitud, solo por el rango genérico 15–34. Una fila
  equivocada rechazaría un fichero legítimo, que es peor que aceptar el IBAN de un
  país que aquí no tiene nadie.
- **Código y HTTP:** `InvalidIbanError` → **`INVALID_IBAN`, 422**. Un código nuevo
  y no `VALIDATION_ERROR` porque el frontend tiene que poder distinguir «el body
  está mal formado» de «este IBAN concreto está mal tecleado», que se arreglan de
  formas distintas. 422 y no 400 por la misma razón que `NOT_UTF8` y
  `MISSING_ACCOUNT_DATA`: la petición está bien formada, el dato que lleva no sirve.
- **Unidad de rechazo: el fichero entero**, no la fila. El IBAN dice a qué cuenta
  van **todos** los movimientos del fichero, así que importar «el resto» sería
  importar movimientos sin saber de quién son. Sale por el camino de fallo **por
  archivo** (dentro del 200 de `POST /api/import`), el fichero **no** se mueve a
  `procesados/` y se reintenta corrigiendo la línea. Es la doctrina del ADR-018.
- **El mensaje va en castellano y nombra el problema con su número de línea:**
  `el iban de la línea 2 no es válido: el dígito de control no cuadra`. Es la misma
  cortesía que los motivos del parser de productos de MyInvestor, y quien lo lee es
  la persona que escribió esa línea. **El IBAN nunca se repite en el motivo:** es un
  número de cuenta y ese texto acaba en la respuesta HTTP y en los logs.

### 3. ¿Hace falta migración de las cuentas ya guardadas? (`delego_en_agente` nº 3)

**No, y esto es el porqué.** Las dos cuentas que existen hoy están en forma
canónica —sin espacios y en mayúsculas, comprobado contra la base de datos el
2026-08-18— y el normalizador es **idempotente**: `normalizeIban(x) === x` para
toda cadena ya canónica (test *«is IDEMPOTENT: an already-clean IBAN comes out
untouched»*). Una migración sería, literalmente, un `UPDATE` que no cambiaría
ninguna fila.

Se descartó además **arreglar el IBAN al vuelo** (buscar por IBAN normalizado y
reescribir la fila): innecesario con las dos cuentas limpias y peligroso, porque
escribiría en datos del usuario sin que él lo haya pedido.

**Qué pasaría si algún día hubiera una fila sucia** (no la hay): no se rompería
nada al leer —la comparación se hace con el IBAN normalizado, así que la fila
sucia simplemente **no casaría** y el importador crearía una cuenta nueva—, y el
arreglo sería un `UPDATE` de una línea. Ese día se escribe la migración; hoy
escribirla sería código muerto que hay que mantener.

**Corolario, y es un criterio de la feature:** los movimientos ya importados **no
se tocan**, ninguna fila de `Movement` cambia y no hay que reimportar nada.

## Mapa criterio → test

| # | Criterio (`acceptance`) | Test que lo cubre |
| --- | --- | --- |
| C1 | Un solo normalizador en `src/lib/`, usado por los tres bancos y por `POST /api/accounts` | `iban.test.ts` › *is used by the parser of every bank* · *is used by POST /api/accounts and by the auto-creation from a statement* · *is declared in ONE file: nothing else in src/ strips spaces to uppercase an IBAN* · *has no second mod-97 implementation in src/* |
| C2 | Quita los espacios (incluidos los interiores) y pasa a mayúsculas: las dos formas dan la misma cadena | `iban.test.ts` › *removes the INTERIOR spaces…* · *uppercases…* · *produces EXACTLY the same string from the spaced and the unspaced form* · *removes tabs, newlines…* — y en las cuatro puertas: `n26.statement.parser.test.ts` › *reads the same account whether the iban is written with spaces or without* / *…in lowercase*; `myinvestor.statement.parser.test.ts` › *reads the same account with spaces, without them and in lowercase*; `bankinter.parser.test.ts` › *reads the same account with spaces, without them and in lowercase*; `accounts.test.ts` › *POST /api/accounts stores the iban written with interior spaces as one string* |
| C3 | Se valida el mod-97 además de la forma, la longitud y el país | `iban.test.ts` › *accepts a well-formed IBAN however it is spaced or cased* · *names a wrong SHAPE…* · *names a wrong LENGTH FOR ITS COUNTRY…* · *names a CHECK DIGIT that does not add up…* · *catches the mistyped digit of 500 generated IBANs, of two countries* · *checks only the shape and the check digits of a country it does not know* |
| C4 | Un IBAN inválido rechaza el fichero con un motivo por su nombre y NO crea cuenta | `iban.test.ts` › *throws InvalidIbanError with the stable code and 422* · *says WHICH LINE of the file is wrong and WHY, by its name* · *reads an absent or empty preamble line as null* · *never echoes the IBAN in the reason*; `n26.statement.parser.test.ts` › *REJECTS the file when a digit is mistyped…* / *rejects it as a failure of the FILE, not as an unparsed row*; `myinvestor.statement.parser.test.ts` › *REJECTS the file when a digit is mistyped…* / *rejects a value that is not an IBAN at all*; `bankinter.parser.test.ts` › *REJECTS the file when the check digits do not add up* / *keeps reading a file with no iban line at all as `null`*; `import.service.test.ts` › *fails the file and creates NO account when its iban is not valid* |
| C5 | `POST /api/accounts` aplica la misma normalización y la misma validación | `accounts.test.ts` › *POST /api/accounts stores the iban written with interior spaces as one string* · *POST /api/accounts refuses to create a SECOND account for a spaced iban* · *POST /api/accounts with a mistyped digit returns 422 INVALID_IBAN and creates nothing* · *POST /api/accounts with something that is not an iban says so by its name* · *findOrCreateAccountFromMetadata rejects a mistyped iban and creates nothing* |
| C6 | La forma de escribir el preámbulo NO cambia; `:` sigue fallando | `n26.statement.parser.test.ts` › *still does NOT accept `:` as the separator of the preamble line*; `myinvestor.statement.parser.test.ts` › *still does NOT accept `:` as the separator…* (más los tests de la F16/F18 sobre `;` y la coma, que siguen verdes sin tocarse) |
| C7 | Decisión escrita sobre migración | §«¿Hace falta migración?» de este informe, con su test: `iban.test.ts` › *is IDEMPOTENT: an already-clean IBAN comes out untouched (C7)* |
| C8 | Los movimientos ya importados no se tocan y no hay que reimportar | `import.service.test.ts` › *lands the file on the SAME account when the iban is written with spaces* (una sola cuenta, sus movimientos donde estaban) y › *fails the file and creates NO account when its iban is not valid* (el fichero fallido **no** se mueve a `procesados/`: se reintenta sin duplicar nada). Ningún cambio de esquema ni de datos: no hay migración nueva en `prisma/migrations/` |
| C9 | Fixtures sintéticos en memoria, sin red; `./init.sh` verde con el guardián activo | Todo IBAN de esta feature es sintético: el español es el **ejemplo público de la documentación** (ya en la lista blanca del guardián), el alemán tiene el cuerpo **todo ceros** con los dígitos de control **calculados**, y los de `syntheticIban()` se generan **en tiempo de ejecución** (nunca se escriben en un archivo versionado). Ni red ni disco salvo las fuentes del propio repo. `src/no-real-data.test.ts` verde con sus 12 tests, ninguno saltado |

## Último `./init.sh`

**Verde.** `Test Files 33 passed (33)` · **`Tests 535 passed (535)`**, **0 saltados**
(baseline de la F18: 493 → **+42**). Type check `tsc` sin errores y validación de
`feature_list.json` OK. Los **0 saltados** importan: significan que el guardián de
la F14 corrió con su **capa de comparación contra `var/` activa**, no solo la de
forma.

## Sugerencias fuera de scope (NO aplicadas)

1. 🟠 **El motivo de `MISSING_ACCOUNT_DATA` cuando el humano escribió `iban:` con
   dos puntos.** Hoy dice «no hay iban en el fichero», que es verdad pero le manda
   a añadir una línea **que ya escribió**. Detectar que hay una línea que *empieza*
   por la etiqueta y no lleva separador reconocido, y decírselo, cabría en el
   buscador de preámbulo. **No se hace aquí** porque tocaría `firstSeparatorIndex`,
   que el criterio 6 pone expresamente fuera de límites.
2. ⚪ **La `minLength: 1` de `accounts.schema.ts` podría ser un `minLength: 15`**
   (ninguna IBAN es más corto). No aporta nada —el servicio ya rechaza con un
   motivo mejor— y partir la regla entre el esquema y el servicio es justo lo que
   el ADR-021 descarta.
3. ⚪ **El resto de bancos que entren podrían recibir el IBAN por otra vía** (p. ej.
   derivado de un CCC, como se comprobó viable para Openbank). Sigue estando
   descartado por decisión del humano del 2026-08-17: el IBAN lo escribe él.
4. ⚪ **`prettier --check` sigue sin pasar en `myinvestor.product.parser.test.ts`**,
   y ya no pasaba antes de esta feature (anotado también en la F16). `init.sh` no
   lo ejecuta.
