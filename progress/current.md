# Sesión actual

> Este archivo se vacía al cerrar cada sesión y se mueve a `history.md`.
> Mientras trabajas, **mantenlo actualizado en tiempo real**, no al final.

## F21 `iban-normalization` — CERRADA el 2026-08-18

**`reviewer`: APROBADO sin cambios requeridos**
([`reviews/iban-normalization.md`](reviews/iban-normalization.md)), con el camino real
ejecutado contra la base de datos del humano. `./init.sh` verde: **535 tests, 0
saltados**. F21 a **`done`** en `feature_list.json` y línea añadida en
[`history.md`](history.md). Sin spec (`sdd: false`): se trabajó del `intent` y de los
**9 criterios de `acceptance`**.
Informe: [`implementations/iban-normalization.md`](implementations/iban-normalization.md) ·
veredicto: [`reviews/iban-normalization.md`](reviews/iban-normalization.md) ·
resumen: [`summaries/iban-normalization.md`](summaries/iban-normalization.md).

> 👤 **Qué cambia para ti:** el IBAN **puedes escribirlo como quieras** —con espacios
> de cuatro en cuatro o del tirón, en mayúsculas o en minúsculas— y es siempre la
> misma cuenta: se acabó que el mismo IBAN escrito de dos formas te creara **dos
> cuentas** en silencio. A cambio, **un dígito mal tecleado ya no cuela**: ese fichero
> se rechaza entero con `INVALID_IBAN` (422), diciéndote la línea y el problema por su
> nombre, y **no se crea ninguna cuenta** — antes te creaba una con pinta de buena. No
> hay que reimportar nada ni cambia la forma de escribir la línea (`iban;<IBAN>`, con
> `;`; con `:` sigue fallando).

Sale del 🔴 que dejó la [prueba real de N26](explorations/prueba-real-n26-2026-08-18.md)
§Pasada 2: el IBAN se guardaba **literal**, así que el mismo IBAN con y sin
espacios creaba **dos cuentas**, en silencio, en los tres bancos.

Plan y estado:

1. ✅ **Un solo normalizador+validador** en [`src/lib/iban.ts`](../src/lib/iban.ts)
   —un IBAN no es el formato de un banco, es el identificador ISO de una cuenta—,
   consumido por los **tres** parsers (`readPreambleIban`) y por las **dos**
   entradas del servicio de cuentas (`requireValidIban`). El `normalizeIban` que
   vivía en `accounts.service.ts` **se movió, no se reexportó**.
2. ✅ **Validación con dígito de control mod-97** (decisión del humano en la
   puerta), más forma y longitud del país. Error nuevo `InvalidIbanError` →
   **`INVALID_IBAN`, 422**, que **rechaza el fichero entero** con el nº de línea y
   el problema por su nombre, y no crea ninguna cuenta.
3. ✅ **`:` sigue fallando** (decisión del humano): `firstSeparatorIndex` no se ha
   tocado, y hay test que lo fija en dos bancos.
4. ✅ **Las tres decisiones delegadas, resueltas por escrito** en el informe:
   dónde vive el normalizador, qué es «un IBAN válido» y con qué código se
   rechaza, y **por qué NO se escribe migración** (las dos cuentas de hoy ya están
   en forma canónica y el normalizador es idempotente: el `UPDATE` no cambiaría
   ninguna fila).
5. ✅ Docs: **ADR-021** en `architecture.md`, `api-contract.md` (código estable,
   `POST /api/accounts`, códigos por archivo de `/api/import` y contrato del
   parser), `conventions.md` §Parsers de banco (dos normas nuevas),
   `dar-de-alta-un-banco.md`, `data-model.md` (el comentario de `Account.iban`) y
   `roadmap.md` §Deberes tuyos.
6. ✅ **`./init.sh` verde: 535 tests, 535 pasan, 0 saltados** (baseline 493), con
   la capa de comparación del guardián de la F14 **activa**.

> 🐞 **Efecto colateral que destapó la feature, y estaba bien destaparlo:** los
> `uniqueIban()` de cuatro suites construían `ES` + timestamp — longitud imposible
> y dígito de control aleatorio. Con la validación puesta, esos fixtures dejaron de
> pasar por su propia puerta. Se arreglaron con
> [`src/lib/iban.fixture.ts`](../src/lib/iban.fixture.ts), que calcula los dígitos
> de control **con el propio validador**. Era el fixture el que estaba mal.

> 🔒 Guardián de la F14: ningún IBAN nuevo escrito en un archivo versionado. El
> español es el ejemplo público de la documentación (ya en la lista blanca), el
> alemán tiene el cuerpo **todo ceros** con los dígitos de control calculados, y los
> de `syntheticIban()` **solo existen en tiempo de ejecución**. Y ojo con el efecto
> de la F18: al redactar el ADR se evitó a propósito transcribir el prefijo del IBAN
> real que citaba el `intent`.

> ✅ **Saneado después de la review (leader, 2026-08-18):** el **prefijo truncado** del
> IBAN real que el reviewer dejó anotado como observación **no bloqueante** ya no está:
> se limpió en el `intent` y en un criterio de la F21 de `feature_list.json` y en
> [`explorations/prueba-real-n26-2026-08-18.md`](explorations/prueba-real-n26-2026-08-18.md).
> Solo textos de documentación: **ni código ni tests**. La nota 3 de «Notas para el
> futuro» del resumen queda por tanto atendida (el resumen no se reescribe: es del
> reviewer).

### Anotado, no se abre ahora

- 🟠 Escribir `iban:` con dos puntos acaba en `MISSING_ACCOUNT_DATA` («no hay iban en
  el fichero»), que es verdad pero manda a añadir una línea **ya escrita**. Decirlo
  mejor tocaría el buscador de preámbulo, que el criterio 6 dejaba fuera de límites.
  Candidato a feature pequeña.
- ⚪ `prettier --check` sigue fallando en `myinvestor.product.parser.test.ts`, como ya
  fallaba antes de esta feature. `init.sh` no lo ejecuta.

---

## Sesión anterior (2026-08-17 / 18): el inventario de bancos y la F18

- **Tarea en curso (2026-08-17):** **inventario de bancos y diagnóstico de sus
  ficheros**. No es una feature: se leyeron las muestras que el humano subió a
  Drive (10 ficheros, 5 carpetas de banco pendientes, 10/10 descargados sin
  fallo) y se diagnosticó cada formato. Informe:
  [`explorations/inventario-bancos-2026-08-17.md`](explorations/inventario-bancos-2026-08-17.md).
  Resultado: **6 bancos, 4 parsers por escribir**; el inventario de
  `docs/ideas.md` queda relleno y la **E4 desbloqueada**. Quedan **6 decisiones
  del humano** anotadas en el informe (4 bloquean) y **4 tareas suyas**:
  re-exportar Revolut con movimientos, renombrar la carpeta `N26` → `n26`,
  escribir el IBAN de N26 y Openbank, y decidir. **No se tocó código ni se
  ejecutó `POST /api/import`.**
## Las tres features que abre el inventario (2026-08-17)

El humano decidió el mismo día, en la puerta de aprobación. **Revolut se aparca**
(hoy sin movimientos ni saldo): sus carpetas se quedan en Drive y se retoma con un
archivo con datos. **No se le abre feature.**

| # | Feature | Spec | Estado |
|---|---|---|---|
| F18 | `n26-statement` | no | ✅ **`done`** (2026-08-18) — **APPROVED** en segunda pasada ([review](reviews/n26-statement.md)), resumen en [`summaries/n26-statement.md`](summaries/n26-statement.md) |
| F19 | `openbank-statement` | **sí** | ⏸ **`spec_ready`** — esperando al humano ([decisions](../specs/openbank-statement/decisions.md), 6 puntos) |
| F20 | `trade-republic-product-file` | **sí** | ⏸ **`spec_ready`** — esperando al humano ([decisions](../specs/trade-republic-product-file/decisions.md), 6 puntos) |

**Las cuatro decisiones que cerró él**, y que ni el spec ni el implementer deben
reabrir:

1. **El IBAN de Openbank lo escribe él**, una vez. El backend **no** lo deriva del
   CCC, aunque se comprobó que la derivación es exacta (checksum válido).
2. **El `balance` por línea sigue a `null`.** Openbank es el único banco que lo
   reporta y aun así no se guarda: el ADR-013 no se toca en la F19.
3. **El histórico de Openbank entra entero**, los dos años y los 200 apuntes.
4. **Trade Republic entra como `.json` de producto**, foto del saldo, al estilo de
   los de MyInvestor — **no** como parser del PDF. Provisional y reversible el día
   que esa cuenta tenga movimientos de verdad.

**Decisión del leader que él debe ratificar (F18, criterio 5):** las dos líneas de
preámbulo (`iban;…` y `saldo;…`) se escriben con `;` **también en el CSV de comas
de N26**. Una sola forma de escribirlo en todo el proyecto, y la línea nuestra se
distingue a simple vista de las del banco.

### F18 `n26-statement` — CERRADA el 2026-08-18

**Segunda pasada del `reviewer`: APPROVED**
([`reviews/n26-statement.md`](reviews/n26-statement.md) §Segunda pasada). `./init.sh`
verde: **493 tests, 0 saltados**. Resumen de cierre (C8) en
[`summaries/n26-statement.md`](summaries/n26-statement.md); F18 a **`done`** en
`feature_list.json`, línea añadida en [`history.md`](history.md) y `docs/roadmap.md`
actualizado (N26 ✅, quedan **3 parsers por escribir**). Las F19 y F20 siguen en
`spec_ready`, esperando al humano.

### Cómo se corrigió la primera review (2026-08-17)

**Primera review: CHANGES_REQUESTED** ([`reviews/n26-statement.md`](reviews/n26-statement.md)),
dos puntos, los dos arreglados (detalle en el informe §Segunda pasada):

- 🔴 **El saldo a la española perdía los céntimos, en silencio.** La línea de
  preámbulo no es una fila de la tabla, pero el lector de CSV la partía por la
  coma antes de que el buscador de etiquetas la viera: `Saldo;1.234,56` daba
  `1234` y **sin aviso en `unparsedRows`**. Arreglado en el código (no en la
  documentación, que decía la verdad): `CsvRecord` gana `raw` —la línea tal cual—
  y el buscador corta **solo por el primer separador**, así que la coma decimal
  es parte del valor. La variante con coma también conserva los céntimos ahora.
- **Los tests no podían ver el fallo**: todos usaban `1500,00`, céntimos `00`.
  `n26Preamble()` pasa a `1.234,56` (con la nota de por qué no redondearlo),
  test nuevo con 5 casos de céntimos ≠ 0 y bloque nuevo para `raw`.

**`./init.sh` verde otra vez: 493 tests, 0 saltados.** Sigue en `in_progress`.

### F18 — primera pasada (2026-08-17)

Feature no-SDD: se trabajó del `intent` + los 13 criterios de `acceptance`.
Informe: [`implementations/n26-statement.md`](implementations/n26-statement.md)
(cada criterio con su test). Estado en `feature_list.json`: **`in_progress`** —
no se marca `done` hasta el veredicto del reviewer.

1. ✅ `src/modules/n26/` (7 archivos + 5 de test): lector de **CSV con comillas
   propio del banco** ([`n26.csv.ts`](../src/modules/n26/n26.csv.ts) — primer
   fichero del repo que no se puede leer partiendo la línea), formatos, parser,
   servicio, rutas, tipos y fixture sintético.
2. ✅ Preámbulo `iban;…` / `saldo;…` con **`;` también en este fichero de comas**
   (criterio 5, decisión del leader), etiquetas tolerantes y las tres reglas de
   la F16 (ausente/ilegible/repetida). `decodeUtf8Strict` como primer paso.
3. ✅ **Decisión delegada del criterio 11, resuelta por escrito:** el concepto se
   **compone** de contraparte + referencia libre (y el tipo de apunte como último
   recurso). Ningún movimiento sale con concepto vacío y ninguna columna sobrante
   se convierte en campo nuevo. Argumentario en el informe y en el **ADR-020**.
4. ✅ `POST /api/parser/n26` + la línea del registro de `src/app.ts` (lo que hace
   que `/api/import` deje de reportar sus ficheros como `skipped`). Guardián de
   «un parser por banco» **generalizado a los tres**.
5. ✅ Docs: `api-contract.md` (§Parser de N26), `dar-de-alta-un-banco.md`,
   `conventions.md` y **ADR-020** en `architecture.md`.
6. ✅ **`./init.sh` verde: 490 tests, 490 pasan, 0 saltados** (baseline 412), con
   la capa de comparación del guardián de la F14 **activa**.

> 🐞 El guardián de la F14 saltó durante el desarrollo, y **no** por un dato del
> humano: escribir los **nombres de las 11 columnas seguidos** reproduce una
> secuencia de palabras del fichero real. Arreglado en la raíz (un comentario por
> línea que rompe la secuencia y documenta la columna), **sin añadir ni un
> `no-real-data-ok`**. A tener en cuenta en la F19: la cabecera de Openbank tiene
> el mismo problema.

### 🐞 Arreglado de paso: el subagente `spec_author` no existía para el harness

Su archivo estaba en `.claude/agents/spec_author.md` desde el 12-ago, pero **el
registro de agentes nunca lo cargó**: los otros tres (`leader`, `implementer`,
`reviewer`) sí. La única diferencia era el **guion bajo** del nombre. Renombrado a
`spec-author` (archivo, frontmatter y las referencias de `CLAUDE.md`, `AGENTS.md`,
`.claude/agents/*`, `docs/specs.md`, `docs/intent-template.md` y `specs/README.md`;
`progress/` se deja como registro histórico). **No está verificado**: el registro se
lee al arrancar la sesión, así que se comprueba en la siguiente. Los dos specs de
esta sesión se sacaron con el rol inyectado a mano.

### 📌 Lo que le toca al humano

1. ✅ **Renombrada la carpeta `N26` a `n26`** en Drive (hecho por el humano el
   2026-08-18). El importador la normaliza, pero la copia local se escribe con el
   nombre crudo, así que en Linux no habría casado.
2. ✅ **N26 verificado de punta a punta el 2026-08-18**: `POST /api/import` mete
   **204 movimientos, 0 duplicados, 0 sin parsear, 0 fallidos**, con la cuenta
   creada, los conceptos compuestos del ADR-020 sin un solo vacío y el
   `accountBalance` con sus céntimos. Costó tres pasadas —Excel reescribió el
   primer fichero, y el segundo llevaba el preámbulo con `:` y el IBAN con
   espacios—; las tres están en
   [`explorations/prueba-real-n26-2026-08-18.md`](explorations/prueba-real-n26-2026-08-18.md).
   ✅ **El bug que dejó abierto —el IBAN se guardaba literal, así que el mismo IBAN
   con y sin espacios eran dos cuentas distintas, en silencio, en los tres bancos—
   lo cierra la F21**, cerrada el mismo día (ver arriba).
3. 🟠 **Escribir el IBAN de Openbank** una vez, donde diga el spec de la F19.
4. ⚪ **Re-exportar Revolut** el día que haya movimientos.

- **Tarea anterior:** ninguna. La **F16 `statement-balance`** se cerró el 2026-08-16
  (`reviewer`: **APROBADO sin cambios requeridos**) y con ella **no queda ninguna
  feature `pending`** en `feature_list.json`.
- **Inicio:** 2026-08-15
- **Agente:** leader + implementer + reviewer

## F16 `statement-balance` — cerrada

Sale de la decisión del humano del 2026-08-15 en la
[prueba real](prueba-drive-real-2026-08-15.md) §Decisión del humano sobre el saldo. Sin
spec (`sdd: false`): del `intent` + los 12 criterios de `acceptance`. Informe:
[`implementations/statement-balance.md`](implementations/statement-balance.md) ·
veredicto: [`reviews/statement-balance.md`](reviews/statement-balance.md) · resumen:
[`summaries/statement-balance.md`](summaries/statement-balance.md).

1. ✅ El extracto admite una **segunda línea de preámbulo etiquetada**,
   `saldo;<importe>`, junto a la del `iban;`, y el resultado la expone como
   `accountBalance`.
2. ✅ **`accountBalance` vive en el contrato común**
   ([`src/lib/parsed-statement.ts`](../src/lib/parsed-statement.ts)), con Bankinter
   emitiendo `null`. **El reviewer lo respalda expresamente y dice que la alternativa
   habría sido la equivocada**, con un argumento que no estaba en el informe: con el
   campo declarado solo en el resultado de MyInvestor, el dato quedaría **invisible
   para el importador**, que consume el contrato común y no puede volverse
   bank-specific (hay guardián en `architecture.test.ts`). Coste de lo hecho: **una
   línea constante** en Bankinter. Coste de la alternativa: romper el ADR-013 y
   bloquear el consumo futuro.
3. ✅ **No se confunde con el `balance` por movimiento**, que en este banco sigue
   siendo `null` para siempre (ADR-013). Dos datos, dos nombres, escrito en el
   contrato, en `api-contract.md` §Los dos «saldos» del contrato y en el **ADR-019**.
4. ✅ Un solo buscador (`findIbanLine` → `findPreambleLine(lines, headerLine, label)`),
   etiqueta sin acentos ni mayúsculas (su archivo real lleva `Saldo;`) e importe por
   `parseAmountText`, el normalizador que ya existía.
5. ✅ Delegadas: **ausente o vacía** → saldo vacío, sin fallo; **presente e ilegible**
   → `unparsedRows` con su nº de línea y motivo; **repetida** → gana la primera. La
   fila `Saldo` **del final no se lee**: una sola forma de escribirlo.
6. ✅ **`./init.sh` en verde: 412 tests, 412 pasan, 0 saltados** (baseline 396), con la
   capa de comparación del guardián de la F14 **activa**. Docs: `api-contract.md`,
   `dar-de-alta-un-banco.md`, `conventions.md`, `roadmap.md` y ADR-019.

### Sugerencias fuera de scope anotadas (no aplicadas)

`myinvestor.product.parser.test.ts` no pasa `prettier --check` (**ya no pasaba antes**
de esta feature); el saldo **no se persiste** todavía —candidato natural a anclar el
saldo de esa cuenta sin sumar movimientos, hoy atado a `initialBalance` (ADR-011)—; y
un motivo más útil para la fila `Saldo` del final, que no se hizo porque enseñarle al
parser algo sobre esa fila es justo lo que el criterio 7 prohíbe.

### 📌 Lo que le toca al humano tras la F16

🔴 **Al editar el CSV del mes:** escribir `Saldo;<importe>;;;` debajo de la línea del
`iban;` y **borrar la fila `Saldo` del final** del archivo. Cómo se escribe, en
[`docs/dar-de-alta-un-banco.md`](../docs/dar-de-alta-un-banco.md) §El saldo de la
cuenta va en la misma cabecera. Si algún mes se olvida, no falla nada: el saldo sale
vacío.

## F17 `statement-encoding-guard` — cerrada

Nace del hallazgo 🔴 E de la [prueba real del 2026-08-15](prueba-drive-real-2026-08-15.md).
Sin spec (`sdd: false`). Informe:
[`implementations/statement-encoding-guard.md`](implementations/statement-encoding-guard.md) ·
veredicto: [`reviews/statement-encoding-guard.md`](reviews/statement-encoding-guard.md) ·
resumen: [`summaries/statement-encoding-guard.md`](summaries/statement-encoding-guard.md).

1. ✅ `src/lib/utf8.ts` → `decodeUtf8Strict`: veredicto por **bytes**
   (`TextDecoder` con `fatal: true`) y guardia secundaria por `U+FFFD`; lanza
   `NotUtf8Error` (`NOT_UTF8`, 422) con el byte, la línea y qué hacer.
2. ✅ El parser del extracto lo usa en lugar de `toString('utf8')`: **un solo sitio**
   cubre los dos caminos (`/api/parser/myinvestor` y `/api/import`), que ya aíslan el
   fallo por archivo.
3. ✅ Tests con fixtures sintéticos, con los bytes cp1252 escritos en código.
4. ✅ Documentación: ADR-018, `api-contract.md`, `dar-de-alta-un-banco.md`,
   `conventions.md`.
5. ✅ **`./init.sh` en verde: 396 tests, 396 pasan, 0 saltados**, con la capa de
   comparación del guardián de la F14 **activa** (los 0 saltados importan). Los rojos
   que reportó el implementer eran ajenos a la F17 —lo dejó fuera de su scope con razón—
   y el leader saneó después lo que era suyo.

### El guardián de la F14 destapó tres cosas, y solo una era la esperada

**✅ Saneado ya (era del leader, no del implementer).** El informe de la prueba real
llevaba el **IBAN real** del humano, sus importes y los conceptos literales de su
extracto, y el `intent` de la F16 citaba su saldo. Lo escribió el leader pegando la
salida de la consola en un archivo versionado. Corregido: cifras inventadas, IBAN
sintético, nombres de sus archivos sustituidos por genéricos, y una nota al principio
del informe explicando el saneamiento. Las capas de IBAN e importes vuelven a verde.

**✅ Cerrado el falso positivo del ejemplo de la plantilla.** El nombre de ejemplo del
fondo saltaba en `docs/` y `specs/` porque el humano copió ese ejemplo tal cual a su
archivo del ETF (hallazgo 🔴 D), así que el ejemplo de la documentación pasó a estar en
`var/` y el guardián lo leyó como dato suyo. **El dato copió a la plantilla, no al
revés.** Arreglado en la raíz: el ejemplo se renombró en `docs/api-contract.md`,
`docs/myinvestor-product-files.md` y `specs/myinvestor-products/design.md`, y las
plantillas ya usan marcadores `<…>` en vez de valores copiables.

**✅ Resueltas las 3 colisiones PREEXISTENTES**, ninguna escrita en esta sesión: el
guardián solo las veía ahora porque `var/` tiene capturas nuevas. Decididas por el
humano el 2026-08-15:

1. **El comentario del enum de tipos de producto** (`docs/data-model.md`,
   `specs/investments-data-model/design.md`) — **falso positivo**: es la traducción al
   castellano del tipo de producto, el nombre que le da el banco, y colisiona solo
   porque el humano llamó al suyo igual. Cerrado con el escape documentado, un
   **`no-real-data-ok` por línea con su motivo escrito al lado**. El comentario
   conserva el término exacto que se ve en la web del banco, que es lo que lo hace
   reconocible.
2. **`prisma/migrations/20260806191700_data_model/migration.sql`** — 🔴 **acierto real
   y preexistente**: un comentario citaba un movimiento auténtico del extracto de
   Bankinter (concepto, importe y fecha) como ejemplo de por qué `daySequence` entra en
   el índice. **Saneado**: el ejemplo pasa a ser genérico. Solo cambia el comentario, el
   DDL no se toca ni una letra, así que el esquema es idéntico. **Checksum: cerrado.**
   El guardado en `_prisma_migrations` sí difería tras editar el comentario; se realineó
   con el del archivo, los tres coinciden y `prisma migrate status` dice «up to date».
   **No hace falta resetear la base de datos.**
3. **El propio `current.md` llegó a colisionar** al documentar los dos puntos de
   arriba: citar la frase infractora la reintroduce. Se describen sin transcribirlas.

6. ✅ **`reviewer`: APROBADO sin cambios requeridos** →
   [`reviews/statement-encoding-guard.md`](reviews/statement-encoding-guard.md), resumen
   en [`summaries/statement-encoding-guard.md`](summaries/statement-encoding-guard.md).
   F17 marcada **`done`** en `feature_list.json` y anotada en
   [`history.md`](history.md). Sus 17 tests nuevos, verdes.

### Siguen abiertas (anotadas, no se abren ahora)

Las tres sugerencias fuera de scope del informe de la F17: el `readFile(…, 'utf8')` del
JSON de producto —mismo silencio, pero el `que_no_quiero` pedía no tocar ese formato—, el
motivo de la **coma decimal** (§A) y el del **archivo nativo de Google** (§B), que el
humano ya clasificó como de menor prioridad.

---

## Sesión anterior (2026-08-13): F15 cerrada

## F15 `product-opened-at` — cerrada

Nació de una revisión de estado: el humano pidió que el JSON de producto de inversión
llevase la fecha de apertura. Sin spec (`sdd: false`).

1. ✅ **Decisión del humano:** `openedAt` **obligatorio en los cuatro tipos**, frente a
   la alternativa de admitirlo vacío. `closedAt` no se toca (opcional; normalmente solo
   los depósitos lo llevan).
2. ✅ Implementado en `src/modules/myinvestor/`. La clave se lee **antes** de bifurcar
   depósito/resto ([`myinvestor.product.parser.ts:80`](../src/modules/myinvestor/myinvestor.product.parser.ts#L80)),
   que es lo que la hace obligatoria de verdad en los cuatro y no solo donde se probó.
   `ParsedProduct.openedAt` es `string`, **nunca `null`**: sin fecha no hay producto,
   hay archivo fallido.
3. ✅ **`reviewer`: CHANGES_REQUESTED** en primera pasada, por **un solo punto de
   documentación** — la tabla de columnas reservadas de `docs/data-model.md:214` seguía
   diciendo que el fichero no llevaba el campo y que sería opcional. Es el registro que
   leerá quien haga la persistencia de inversiones, así que dejarlo mintiendo era caro.
4. ✅ **`reviewer`: APROBADO** en segunda pasada →
   [`reviews/product-opened-at.md`](reviews/product-opened-at.md), resumen en
   [`summaries/product-opened-at.md`](summaries/product-opened-at.md).
   `./init.sh` verde: **379 tests, 0 saltados** (los 0 saltados importan: el guardián de
   la F14 corrió con su capa de comparación activa, no solo la de forma).

## 📌 Lo que le toca al humano

1. 🔴 **Actualizar la plantilla de producto que guarda en Drive** con la línea de
   `openedAt`. Nadie comprueba que coincida con la documentación: todo archivo escrito
   con la plantilla vieja fallará. Plantillas en
   [`docs/myinvestor-product-files.md`](../docs/myinvestor-product-files.md).
2. ✅ **Prueba del camino entero: hecha el 2026-08-15** →
   [`prueba-drive-real-2026-08-15.md`](prueba-drive-real-2026-08-15.md). Drive
   responde y el extracto se lee bien (IBAN + 11 movimientos), pero **0 de 4 JSON
   de producto parsean**: llevan coma decimal, que JSON no admite. Y el `.csv` se
   subió **convertido a hoja de Google**, así que no se puede descargar. Los dos
   son cosas que arregla él en Drive; el informe propone además dos mensajes de
   error mejores en el backend (candidato a F16).

   **Segunda pasada el mismo día, tras corregirlos: el camino entra entero**
   (6/6 descargados, 5 productos, 1 extracto con IBAN, 0 fallos). Quedan dos
   problemas **silenciosos**, que no dan error: el `.csv` viene ahora en cp1252 y
   el parser convierte la `Ó` de los conceptos en `�` de forma irreversible, y
   `etf-<...>-*.json` conserva el `type` y el `name` del ejemplo de la plantilla.
   Decidido también que el **saldo** se leerá de una línea `saldo;…` en el
   preámbulo, junto al `iban;…`.
3. **Inventario por banco** ([`docs/ideas.md`](../../docs/ideas.md)): sigue vacío y
   sigue bloqueando la E4 entera.

## ✅ El histórico de git: cerrado como riesgo aceptado (2026-08-13)

**Tema cerrado. No volver a sacarlo.** El humano lo dio por arreglado, se verificó y
**no lo estaba** (los 36 commits conservan hash y fecha: no hubo reescritura). Se le
devolvió el alcance real medido, mayor de lo que él creía:

- `ES15 0128…` (0128 = Bankinter), IBAN **válido por checksum**, en **14 commits** desde
  `4caeb38` (F6, 2026-08-04), en `bankinter.parser.test.ts`.
- `ES30 1544…`, también válido, en **4 commits** de la F12.
- Más lo que saneó la F14 en ~40 archivos: importes, conceptos del extracto, el nombre
  de su empresa y el nombre completo de un tercero.

Se le ofrecieron las dos salidas reales (commit inicial único, o rewrite de los 35
commits) y **eligió dejarlo**: repositorio privado, HEAD limpio y el guardián de la F14
impidiendo la recaída. Anotado en `docs/roadmap.md`, con la nota de que **si el
repositorio deja de ser privado esto vuelve a la mesa**, y de que la salida limpia exige
rewrite **más** borrar y recrear el repo (un force-push deja los commits viejos
alcanzables por SHA).

## Cerrado también en esta sesión (no es código)

- ✅ **Carpeta de plantillas en Drive**, hermana de `notas-banco/`: creada.
- ✅ **Cabo suelto nº 9** (`openedAt` sin escritor): cerrado por la F15.
- 🕗 **Histórico del Excel** (idea #5): **aplazado, no descartado** — inclinación a
  importarlo «para no empezar de vacío».
- ⏳ **Cabo suelto nº 10** (`daySequence` numera solo las filas parseadas): explicado y
  **sigue abierto**. Se cierra el día que el humano diga que acepta borrar a mano los
  duplicados visibles si algún día arregla un parser y reimporta.

## Lo que aprendió el proyecto con esto

Una feature de una sola línea de comportamiento se fue a **CHANGES_REQUESTED por
documentación**, y con razón: `docs/data-model.md` se declara a sí mismo el registro
único de columnas sin escritor, y una feature que le da escritor a una columna sin
actualizar ese registro deja una trampa para la feature siguiente. El código estaba
bien a la primera; lo que faltaba era el rastro.
