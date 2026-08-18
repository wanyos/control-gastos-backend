# Resumen — feature 21 `iban-normalization`

Fecha de cierre: 2026-08-18
Intención original: `feature_list.json` → feature `iban-normalization`, bloque `intent`
Spec: no tiene (`sdd: false`); se trabajó de los 9 criterios de `acceptance`
Informe del implementer: [`implementations/iban-normalization.md`](../implementations/iban-normalization.md) · Review: [`reviews/iban-normalization.md`](../reviews/iban-normalization.md)

## Qué hace ahora la app que antes no

Ahora **da igual cómo escribas el IBAN**: con espacios de cuatro en cuatro o del
tirón, en mayúsculas o en minúsculas, el backend lo entiende como **la misma
cuenta**. Hasta hoy lo guardaba tal cual lo escribías, así que el mismo IBAN
escrito de dos formas te creaba **dos cuentas distintas, sin un solo aviso**, y
los movimientos del mes se repartían entre las dos.

Y ahora **el IBAN se comprueba**: lleva dos dígitos de control (mod-97) y si te
equivocas al teclear uno, ese fichero **falla en ese momento**, te dice por su
nombre qué pasa y **no te crea ninguna cuenta**. Antes te creaba una cuenta con
pinta de buena.

Lo que **no** ha cambiado: sigues escribiendo `iban;<IBAN>` con punto y coma, y
`iban: <IBAN>` con dos puntos sigue fallando (tu decisión del 2026-08-18).

## Por dónde se usa (puntos de entrada)

Cuatro puertas, **una sola regla** detrás de las cuatro:

- **Los tres bancos, al parsear su extracto** — `POST /api/parser/bankinter`,
  `POST /api/parser/myinvestor`, `POST /api/parser/n26` y, sobre todo,
  `POST /api/import` (la ingesta desde Drive). Si el IBAN del fichero no es
  válido, ese fichero sale como `failed` con el código `INVALID_IBAN`, **no se
  mueve a `procesados/`** y basta corregir la línea y reintentar.
- **`POST /api/accounts`** (alta de cuenta a mano) — misma normalización y misma
  validación. Un IBAN mal tecleado devuelve **422 `INVALID_IBAN`**; el mismo IBAN
  que ya tienes, escrito con espacios o en minúsculas, devuelve **409 CONFLICT**
  en vez de crear una segunda cuenta.

## Dónde está el código (para revisión directa)

> Los enlaces son clicables en la vista previa de Markdown de VS Code
> (Ctrl/Cmd + clic): saltan a la línea exacta.

### El único normalizador+validador (todo lo nuevo vive aquí)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Quita **todos** los espacios (también los interiores) y pasa a mayúsculas | `normalizeIban` | [iban.ts:27](../../src/lib/iban.ts#L27) |
| Dice **por qué** una cadena no es un IBAN, o `null` si lo es (vacío → forma → longitud del país → mod-97) | `ibanRejectionReason` | [iban.ts:71](../../src/lib/iban.ts#L71) |
| Lo mismo en versión sí/no | `isValidIban` | `src/lib/iban.ts` |
| Devuelve el IBAN normalizado o lanza `InvalidIbanError` nombrando el problema | `requireValidIban` | [iban.ts:109](../../src/lib/iban.ts#L109) |
| Convierte la línea `iban;<IBAN>` del preámbulo en el `accountIban` del contrato (ausente o vacía → `null`) | `readPreambleIban` | [iban.ts:135](../../src/lib/iban.ts#L135) |
| El dígito de control (ISO 7064 MOD 97-10), calculado dígito a dígito | `mod97` | `src/lib/iban.ts` |
| Tabla de longitudes por país, **a propósito no exhaustiva** | `ibanLengthByCountry` | `src/lib/iban.ts` |
| Forma de la línea de preámbulo que le pasa cada banco | `PreambleIbanLine` | `src/lib/iban.ts` |

### El error nuevo

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Código estable `INVALID_IBAN`, HTTP 422 | `InvalidIbanError` | [app-error.ts:56](../../src/errors/app-error.ts#L56) |

### Las cuatro puertas que ahora comparten la regla

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Alta manual: valida antes de escribir en la base de datos | `createAccount` | [accounts.service.ts:136](../../src/modules/accounts/accounts.service.ts#L136) |
| Alta automática desde un extracto: última puerta antes de la base de datos | `findOrCreateAccountFromMetadata` | [accounts.service.ts:183](../../src/modules/accounts/accounts.service.ts#L183) |
| El importador compara **por IBAN normalizado** (antes hacía un simple `.trim()`) | `resolveAccount` | [import.service.ts:123](../../src/modules/import/import.service.ts#L123) |
| Bankinter: ahora solo **localiza** la línea; juzgarla ya no es suyo | `findIbanLine` → `readPreambleIban` | `src/modules/bankinter/bankinter.parser.ts` (65 y 128) |
| MyInvestor: `accountIban: readPreambleIban(ibanLine)` | `parseMyinvestorStatement` | `src/modules/myinvestor/myinvestor.statement.parser.ts` (126) |
| N26: `accountIban: readPreambleIban(ibanLine)` | `parseN26Statement` | `src/modules/n26/n26.statement.parser.ts` (150) |

### Ayudante de tests (no es un test)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Construye un IBAN único **y bien formado**, con los dígitos de control calculados por el propio validador | `syntheticIban` | `src/lib/iban.fixture.ts` (23) |
| El mismo IBAN con **un dígito mal tecleado** | `mistypedIban` | `src/lib/iban.fixture.ts` (44) |

### Tests

| Qué cubre | Código |
| --- | --- |
| Normalización: espacios interiores, minúsculas, tabuladores, e **idempotencia** (el argumento de «no hace falta migración») | `src/lib/iban.test.ts` (31-61) |
| Qué es «válido»: forma, longitud del país, mod-97, país desconocido, y **500 IBAN generados con su dígito estropeado** | `src/lib/iban.test.ts` (63-130) |
| El rechazo: código estable, 422, nº de línea, y que el motivo **nunca repite el IBAN** | `src/lib/iban.test.ts` (132-169) |
| Guardianes de «un solo normalizador»: los tres parsers lo importan, el servicio valida en sus **dos** entradas, no hay un segundo mod-97 en `src/` | `src/lib/iban.test.ts` (171-219) |
| `POST /api/accounts`: espaciado se guarda como uno, el duplicado espaciado da 409, el mal tecleado da 422 y **no crea nada** (contra Postgres) | `src/modules/accounts/accounts.test.ts` (323-390) |
| El importador mete el fichero en la **misma** cuenta con el IBAN espaciado; con IBAN inválido falla, **cero cuentas** y el fichero **no** se mueve a `procesados/` | `src/modules/import/import.service.test.ts` (735 y 754) |
| N26: espacios, minúsculas, dígito mal tecleado (fallo **del fichero**, no fila) y `:` **sigue sin valer** | `src/modules/n26/n26.statement.parser.test.ts` (584-640) |
| MyInvestor: lo mismo, y un valor que no es un IBAN en absoluto | `src/modules/myinvestor/myinvestor.statement.parser.test.ts` (666-700) |
| Bankinter (el que escribe su propia línea): espacios/minúsculas, dígitos que no cuadran, y sin línea sigue dando `null` | `src/modules/bankinter/bankinter.parser.test.ts` (315-355) |
| El árbol de `src/` esperado incorpora `lib/iban.ts` (ADR-004) | `src/architecture.test.ts` |

## Cumplimiento de la intención

- ✅ «Escribo el iban con espacios en el fichero de un banco y entra en la cuenta
  que ya existe, no en una nueva» → se cumple. `import.service.test.ts:735` (una
  sola cuenta, `created: false`) y los tres parsers. **El revisor lo ejecutó**
  contra la app real: el IBAN espaciado cae en la cuenta que ya estaba.
- ✅ «Lo escribo en minúsculas y pasa lo mismo» →
  `n26.statement.parser.test.ts:600`, `myinvestor…:672`, `bankinter…:327`,
  `accounts.test.ts:333`.
- ✅ «Si me equivoco en un dígito, el fichero falla y el motivo dice que el iban
  no es válido, no me crea una cuenta» → se cumple, y el motivo lo dice **por su
  nombre**: `el iban de la línea 2 no es válido: el dígito de control no cuadra`.
  `iban.test.ts:100` y `:152`, los tres parsers, y
  `import.service.test.ts:754` + `accounts.test.ts:347`, que comprueban
  **cero filas en la base de datos**, no solo el código de error.
- ✅ «Mis dos cuentas de hoy (myinvestor y n26) siguen siendo las mismas y sus
  movimientos no se mueven de sitio» → se cumple. Sin migración y sin cambio de
  esquema; el revisor comprobó contra tu base de datos que las **dos** cuentas
  están en forma canónica y **pasan la validación nueva**, que sus **215**
  movimientos siguen colgando de ellas, y que tus extractos reales de
  `var/drive-read/` siguen parseándose igual. No hay que reimportar nada.
- ✅ (`que_no_quiero`) La línea del preámbulo no cambia y `:` **sigue fallando**:
  `firstSeparatorIndex` no se tocó (verificado en el diff) y hay test en dos
  bancos.

## Decisiones que se tomaron por ti

- **(delegado) Dónde vive el normalizador:** en
  [`src/lib/iban.ts`](../../src/lib/iban.ts) y solo ahí, compartido por los tres
  bancos y por el alta de cuenta. El razonamiento: un IBAN no es el formato de
  ningún banco, es el identificador ISO de una cuenta — igual que la codificación
  (`lib/utf8.ts`) o la forma de la salida (`lib/parsed-statement.ts`). Está
  **guardado por tests**, no solo por convención: la suite falla si alguien
  escribe un segundo normalizador. Un banco nuevo ya no escribe nada de esto:
  llama a `readPreambleIban` y ya.
- **(delegado) Qué es «un IBAN válido» y cómo se rechaza:** no vacío, forma ISO,
  longitud de su país y **dígito de control mod-97**. Código nuevo
  `INVALID_IBAN` (422) en vez de reusar `VALIDATION_ERROR`, para que se distinga
  «el body está mal» de «este IBAN está mal tecleado». Se rechaza **el fichero
  entero**, no la fila: el IBAN dice a qué cuenta van *todos* sus movimientos. El
  motivo va en castellano y **nunca repite tu número de cuenta** (acaba en la
  respuesta HTTP y en los logs).
- **(delegado) Migración: NO se escribe, y está justificado.** Tus dos cuentas ya
  estaban limpias y el normalizador es idempotente, así que el `UPDATE` no
  cambiaría ninguna fila. Se descartó también «arreglar el IBAN al vuelo»: tocaría
  datos tuyos sin que lo hayas pedido. Si algún día apareciera una fila sucia, no
  se rompe nada al leer y el arreglo sería un `UPDATE` de una línea.
- **(añadido, y estaba bien destaparlo)** La validación destapó que los
  `uniqueIban()` de cuatro suites de test fabricaban IBAN imposibles (`ES` +
  timestamp). **Era el fixture el que estaba mal**, no la regla: ahora los
  construye `src/lib/iban.fixture.ts` calculando los dígitos de control con el
  validador de producción, así que fixture y regla no pueden divergir.
- **La tabla de longitudes por país es a propósito incompleta:** un país que no
  está en ella no se rechaza por longitud (solo por el rango 15–34) y sí por el
  mod-97. Una fila equivocada rechazaría un fichero legítimo tuyo, que es peor.

## Qué NO se tocó / quedó fuera

- **La forma de escribir el preámbulo:** ni una coma de `firstSeparatorIndex`.
  `iban;<IBAN>` sigue siendo la única forma; `iban:` sigue fallando.
- **Base de datos:** ninguna migración, ningún cambio de esquema, ninguna fila
  reescrita. Nada que reimportar.
- **`minLength: 1` de `accounts.schema.ts`** se deja como está: la regla entera
  vive en el servicio, y partirla entre el esquema y el servicio es justo lo que
  el ADR-021 descarta.
- **El IBAN lo sigues escribiendo tú** en los bancos que no lo exportan; no se
  deriva de un CCC ni de ninguna otra vía (tu decisión del 2026-08-17).

## Notas para el futuro

1. 🟠 Cuando escribes `iban:` con dos puntos, el fichero acaba en
   `MISSING_ACCOUNT_DATA` («no hay iban en el fichero»), que es verdad pero te
   manda a añadir una línea **que ya escribiste**. Detectar «hay una línea que
   empieza por la etiqueta y no lleva separador reconocido» y decírtelo sería más
   amable; no se hizo aquí porque tocaría el buscador de preámbulo, que el
   criterio 6 pone fuera de límites. Candidato a feature pequeña.
2. ⚪ `prettier --check` sigue fallando en
   `myinvestor.product.parser.test.ts`, como ya fallaba antes de esta feature.
   `init.sh` no lo ejecuta, así que no rompe nada.
3. ⚪ El prefijo truncado de tu IBAN de N26 (`DE10 1001 …`) quedó escrito en el
   `intent` de `feature_list.json` y en la exploración del 2026-08-18, ambos
   anteriores a esta implementación. El guardián de la F14 no caza valores
   truncados (está dicho en `docs/conventions.md`). Tú decides si lo saneas
   cuando vuelvas a tocar esos archivos.
