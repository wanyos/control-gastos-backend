# myinvestor-products-to-db (F29) — implementación

> Feature **sin SDD**: manda el bloque `acceptance` de `feature_list.json` (10 criterios,
> citados aquí como **C1…C10**). Reutiliza entera la vía que construyó la F26
> ([`specs/26-savings-account-as-product/`](../../specs/26-savings-account-as-product/decisions.md),
> [informe](savings-account-as-product.md)): esta feature añade **quién escribe** los
> otros cuatro tipos, no cómo se leen.
>
> **Sin migración, sin dependencias nuevas, sin un solo campo nuevo que teclear.**
> Todo lo que hacía falta en la base ya existía desde la F9.

---

## ⚠️ Dos cosas que el líder tiene que ver antes que nada

1. **He tocado UN archivo de `src/modules/trade-republic/`**, que se me pidió no tocar:
   [`trade-republic.routes.test.ts`](../../src/modules/trade-republic/trade-republic.routes.test.ts)
   (líneas 132-139). No era evitable: ese test afirmaba
   `expect(productParsers.map(a => a.bank)).toEqual(['trade-republic'])`, es decir **que
   Trade Republic es el ÚNICO del registro de productos**, y C1 exige justamente meter a
   MyInvestor en ese registro. Es un cambio de **dos aserciones**, no de comportamiento:

   ```ts
   // antes                                     // ahora
   .toEqual(['trade-republic'])                 .toContain('trade-republic')
   productParsers[0]?.extensions                productParsers.find(a => a.bank === 'trade-republic')?.extensions
   ```

   Lo que el test protegía —«este banco está en el registro de productos y lee `.json` y
   nada más»— sigue protegido, y ahora no se rompe cuando entre un sexto banco. **No he
   tocado nada más de ese módulo ni su documentación** (`git diff --stat` del parser y del
   servicio de Trade Republic: vacío por mi parte; lo que aparece modificado ahí es de la
   F28, que corre en paralelo).

2. **`./init.sh` termina en FAIL por un motivo que no es mío y que no puedo arreglar:**
   `Hay 2 features en in_progress (máximo 1)` — la F28 y la F29 a la vez, que es la
   situación que el líder ha creado a propósito. Se me prohibió tocar `feature_list.json`.
   **El bloque de tipos y el de tests están en verde**: ver §Último `./init.sh`.

---

## Las tres decisiones delegadas, resueltas por escrito

### 1. Cómo convive el escritor nuevo con `persistSavingsSnapshot` → **se reparte, con un despachador y un tronco común**

Las tres opciones que planteaba la feature eran generalizar, escribir al lado o repartir.
**Repartir**, y esto es lo que significa aquí:

| Pieza | Qué hace |
| --- | --- |
| `persistProductSnapshot(prisma, input)` | **la** entrada. Resuelve el `type` **una sola vez** y despacha. Es lo único que lee el tipo para elegir escritor |
| `persistSavingsSnapshot` | **intacta** (F26). Mismo nombre, misma firma, mismo guardián que rechaza cualquier tipo que no sea `savings_account` |
| `persistValuation` | gemela suya para `fund` / `etf` / `managed_portfolio`: dos upserts, `Valuation` en vez de `SavingsSnapshot` |
| `persistDeposit` | **un solo** upsert (ver decisión 2) |
| `upsertProduct` (privada) | el tronco: el upsert del producto sobre `(bank, name)` y el rechazo de un `name` que ya existe con otro tipo, escrito **una vez** para los cinco |

**Por qué no generalizar en una sola función:** las tres ramas escriben cosas
*diferentes* —una fila de `SavingsSnapshot`, una fila de `Valuation`, y **ninguna fila**
más cuatro columnas del producto—. Una función única sería un `switch` de tres cuerpos
con un solo nombre, y su garantía «una cuenta remunerada nunca recibe una `Valuation`»
habría que **volver a demostrarla** dentro. Repartiendo, los 13 tests que la F26 dejó
sobre `persistSavingsSnapshot` siguen apuntando a la misma función y **no se re-prueba
nada de lo ya probado**.

**Por qué no escribir «al lado» sin tronco común:** el upsert del producto y el rechazo
del cambio de tipo son la misma regla para los cinco tipos. Duplicarlos habría dejado la
regla en tres sitios y con tres redacciones, que es exactamente cómo se desincronizan.

**Lo único que cambió de la F26** (declarado, no escondido):

- `ProductImportResult.snapshot` pasa a ser **anulable** (`… | null`), porque un depósito
  no tiene foto. `import.types.ts` ya lo declaraba anulable en `ProductResult`, así que la
  superficie HTTP no cambia de forma para los tipos que sí tienen foto.
- El mensaje del choque de tipos deja de ser específico de la cuenta remunerada y pasa a
  nombrar **los dos** tipos: `ya existe un producto '<name>' en <bank> de tipo '<viejo>',
  y este archivo lo declara de tipo '<nuevo>': un producto no cambia de tipo…`. El test de
  la F26 que lo cubría (`/'fund'/`) sigue pasando **sin tocarlo**.
- En `investments.service.test.ts`, **una** aserción de la F26 (`second.snapshot.created`)
  se partió en dos (`not.toBeNull()` + `?.created`) para que compile con el campo
  anulable. Ni un test borrado, ni uno debilitado.

### 2. Dónde viven las condiciones del depósito → **en columnas del propio producto, y el depósito NO escribe ni una fila de serie**

`principal`, `interestRate`, `expectedGain` y `maturityDate` ya eran columnas de
`InvestmentProduct` desde la F9, definidas y **sin escritor**. Ahora las escribe
`persistDeposit`, y **solo** en un `deposit`: en los otros cuatro tipos `upsertProduct`
las pone explícitamente a `NULL`, nunca las deja «lo que hubiera».

**Cómo se respeta ADR-012 («un depósito no tiene valoraciones porque no fluctúa»):** no se
respeta por convención, se respeta **porque no hay código que la viole**. `persistDeposit`
hace **un solo upsert** y no menciona `Valuation` en ninguna línea. Y para que eso sea
visible desde fuera y no una promesa, su respuesta trae **`snapshot: null`**: un
`snapshot` con ceros diría «se ha guardado una foto», que es justo la mentira que ADR-012
existe para evitar. Quien quiera saber si el depósito se creó o se actualizó mira
`product.created`.

**Consecuencia declarada:** el `date` del archivo de un depósito **no se guarda en ningún
sitio**, porque no identifica ninguna fila (no hay fila por fecha). Queda como
procedencia, igual que el nombre del archivo. Volver a subir el mismo depósito reescribe
sus mismas condiciones: idempotente sin necesidad de nada más. **Límite conocido:** subir
un archivo *antiguo* de un depósito cuyas condiciones hubieran cambiado pisaría las
nuevas con las viejas; no se ha hecho nada al respecto porque las condiciones de un
depósito se firman una vez y no cambian, que es la premisa de ADR-012.

### 3. Qué identifica una valoración → **`(productId, date)`, y el `productId` sale de `(bank, name)`: las dos mitades las escribe el humano**

Con el aviso de la F25 delante (`Movement.daySequence` era un contador que **el propio
importador producía**, y al renumerarse dejó de ser identidad):

- La identidad del **producto** es su `name`, tecleado por el humano y copiado igual cada
  mes. Nada del sistema lo genera.
- La identidad de la **foto** es la `date` del archivo, tecleada por el humano.
- Ninguna de las dos claves lleva un contador, una posición ni un autoincremento. **No hay
  nada que renumerar**, así que el fallo de la F25 no puede repetirse aquí.
- El guardado es un `upsert` sobre `@@unique([productId, date])` de `Valuation`, que **ya
  existía en el esquema desde la F9**: cero migración.

Y la contrapartida, que es la misma que la F26 le avisó al humano y que queda escrita en
`docs/myinvestor-product-files.md`: **si cambia el `name` en el archivo se crea otro
producto** y la serie anterior queda colgando del nombre viejo.

---

## Archivos modificados / creados

### Código

| Archivo | Qué |
| --- | --- |
| [`src/modules/investments/investments.types.ts`](../../src/modules/investments/investments.types.ts) | ✏️ `ProductFileCommon` extraído; nuevos `ValuationInput` y `DepositInput`; unión discriminada `ProductFileInput`; `ProductParserAdapter.parse` la devuelve; `ProductImportResult.snapshot` anulable |
| [`src/modules/investments/investments.service.ts`](../../src/modules/investments/investments.service.ts) | ✏️ `persistProductSnapshot` (despachador), `persistValuation`, `persistDeposit`, `upsertProduct` y `toProductReport`. `persistSavingsSnapshot` conserva firma, guardián y comportamiento |
| [`src/modules/myinvestor/myinvestor.types.ts`](../../src/modules/myinvestor/myinvestor.types.ts) | ✏️ `MyinvestorProductInput` (unión discriminada), declarado **aquí** y no importado de `investments/`: un módulo de banco no importa los tipos de otro módulo (guardián). Encajan **estructuralmente** en `app.ts`, igual que hace Trade Republic desde la F26 |
| [`src/modules/myinvestor/myinvestor.service.ts`](../../src/modules/myinvestor/myinvestor.service.ts) | ✏️ `parseMyinvestorProductFile(fileName, content: Buffer)`: decodifica UTF-8 estricto, delega en el parser **sin tocarlo** y estrecha `ParsedProduct` a la unión |
| [`src/app.ts`](../../src/app.ts) | ✏️ **una línea**: `{ bank: 'myinvestor', extensions: ['.json'], parse: parseMyinvestorProductFile }` en `productParsers` |
| [`src/modules/import/import.service.ts`](../../src/modules/import/import.service.ts) | ✏️ `importProductFile` llama a `persistProductSnapshot` en vez de a `persistSavingsSnapshot`. **Ni una línea más**: cuatro tipos nuevos sin que el importador aprenda nada |
| [`src/architecture.test.ts`](../../src/architecture.test.ts) | ✏️ el guardián del escritor único cubre ahora **las tres** tablas (`Valuation` incluida, casada por `tx.`/`prisma.` para no confundirla con `input.valuation.`); el nuevo test end-to-end entra en la lista de archivos esperados |
| [`src/modules/trade-republic/trade-republic.routes.test.ts`](../../src/modules/trade-republic/trade-republic.routes.test.ts) | ⚠️ **fuera de mi lote**, dos aserciones — ver §Dos cosas al principio |

### Tests

| Archivo | Qué |
| --- | --- |
| [`src/modules/investments/investments.service.test.ts`](../../src/modules/investments/investments.service.test.ts) | ➕ 16 tests de `persistValuation` / `persistDeposit` / `persistProductSnapshot`. ✏️ una aserción de la F26 partida en dos por el campo anulable |
| [`src/modules/myinvestor/myinvestor.service.test.ts`](../../src/modules/myinvestor/myinvestor.service.test.ts) | ➕ 8 tests del adaptador `parseMyinvestorProductFile` |
| [`src/modules/myinvestor/myinvestor.import.test.ts`](../../src/modules/myinvestor/myinvestor.import.test.ts) | 🆕 9 tests **end-to-end** con el registro REAL de `src/app.ts` (`bankParsers` + `productParsers`), no con dobles |

### Documentación

| Archivo | Qué |
| --- | --- |
| [`docs/data-model.md`](../../docs/data-model.md) | el **registro único de columnas**: las cuatro del depósito y `Valuation` entera pasan a tachadas, con nota de cambio del 2026-08-21. Actualizados la tabla de cabecera, la cabecera de la Parte 2, el bloque «Ya no es futuro», la regla 🔴 del depósito, la fila de claves de `Valuation` y «Lo que NO está aquí» |
| [`docs/api-contract.md`](../../docs/api-contract.md) | §Archivos de producto pasa a ser «features 26 y 29», con tabla `type` → dónde va la foto; MyInvestor en los dos registros; ejemplo de respuesta con un `fund` y un `deposit` (`snapshot: null`); nota de por qué es `null`; `VALIDATION_ERROR` deja de decir «`type` que no es `savings_account`» |
| [`docs/myinvestor-product-files.md`](../../docs/myinvestor-product-files.md) | la doc que **él** lee: aviso de que estos archivos ya entran en la base **sin cambiar ni un campo**, y sección «Y desde la feature 29, en la base de datos» (el depósito sin serie, el `name` como identidad, la idempotencia, o entra entero o no entra, y que `POST /api/parser/myinvestor` sigue sin guardar nada) |

**No tocados, a propósito:** `myinvestor.product.parser.ts`, `myinvestor.format.ts` y
`myinvestor.statement.parser.ts` (`git diff --stat` vacío, **C6**), `prisma/schema.prisma`
(sin migración), `feature_list.json`, `progress/current.md` y `progress/history.md`.

---

## Mapeo criterio → test

| # | Criterio | Test |
| --- | --- | --- |
| **C1** | Los 5 `.json` dejan de salir `skipped` y entran, cada uno con su tipo | `myinvestor.import.test.ts` › *stores the four types instead of reporting them as skipped* · *still sends anything that is not a .csv or a .json nowhere* · `investments.service.test.ts` › *creates the product with its type, currency and dates* · *stores the three types that fluctuate, each with its own row* · *stores the five numbers as written, computing nothing* · *leaves the cash column NULL…* · `myinvestor.service.test.ts` › *returns a product that fluctuates with its valuation attached* · *carries the uninvested cash…* · *reads an ETF as its own type* |
| **C2** | Los que fluctúan, una valoración por fecha; el depósito **sin** valoraciones y con sus condiciones en el producto (ADR-012) | `myinvestor.import.test.ts` › *gives every product that fluctuates one valuation per date* · *gives a deposit its conditions on the product and NO valuation* · `investments.service.test.ts` › *writes no SavingsSnapshot for a product that fluctuates* · *stores the four conditions of a deposit on the product itself* · *gives a deposit no Valuation and no SavingsSnapshot at all* · *leaves the four deposit columns NULL on a product that fluctuates* · *refuses to hang a row on a product of another type* · `myinvestor.service.test.ts` › *returns a deposit with its four conditions and NO valuation* |
| **C3** | Cómo convive con `persistSavingsSnapshot`; lo probado por la F26 **no se rompe** | `investments.service.test.ts` › *sends each type to its own writer and leaves the F26 one untouched* · *rejects an input whose type has no Valuation…* · *rejects a deposit input whose type is not deposit* · **+ los 13 tests de la F26 intactos** (*rejects an input whose type is not savings_account…*, *refuses to hang a photo on a product of another type…*, etc.) · decisión escrita arriba §1 |
| **C4** | Idempotencia: mismo mes no duplica; mes siguiente añade y no crea producto; identidad en `name` + `date`, nunca en algo que se renumere | `myinvestor.import.test.ts` › *does not duplicate anything when the same month is uploaded twice* (**dos pasadas**) · *adds a valuation for the next month without creating a product* · `investments.service.test.ts` › *leaves one product and one row when the same date is loaded twice* · *reuses the product and adds a row for the next date* · *does not duplicate a deposit loaded twice* · decisión escrita arriba §3 |
| **C5** | O entra entero o no entra: una sola transacción, y un archivo malo no deja medio producto ni se mueve a `procesados/` | `myinvestor.import.test.ts` › *leaves nothing behind when the file is wrong, and says the whole reason* · *does not move a wrong file to procesados/, and does move a good one* (con doble de Drive: `update` llamado **una** vez) · `investments.service.test.ts` › *leaves neither product nor row when the write is rejected* · `myinvestor.service.test.ts` › *throws the WHOLE reason of a badly written file…* · *rejects a file that is not valid UTF-8…* |
| **C6** | El parser de MyInvestor **no se toca** | `git diff --stat src/modules/myinvestor/myinvestor.product.parser.ts` → **vacío**; sus 100+ tests pasan sin editar ni uno · `myinvestor.service.test.ts` › *adds no interpretation of its own: it returns what the parser read* |
| **C7** | El humano **no escribe ni un campo nuevo** | `myinvestor.service.test.ts` › *demands not one field more than the template already asks for* (usa las tres fixtures que escribió la F13, **sin tocar**) · todo `myinvestor.import.test.ts` importa con esas mismas fixtures |
| **C8** | Los datos de hoy no se tocan; no obliga a reimportar nada | `myinvestor.import.test.ts` › *writes no Account and no Movement* · `investments.service.test.ts` › *touches neither Account nor Movement* · **cero migración** (esquema sin cambios) · el guardián de la F27 (`vitest.global-setup.ts`) compara la base del humano antes y después de la suite: la ejecución completa quedó verde |
| **C9** | `docs/api-contract.md` y `docs/data-model.md` recogen lo que estrena o cambia de estado (columna que gana escritor deja de figurar como columna sin escritor) | §Documentación de arriba. En `data-model.md`, las cuatro columnas del depósito y `Valuation` entera aparecen **tachadas** en «Columnas reservadas (definidas, sin escritor todavía)» con su nota de cambio, exactamente como la F26 hizo con `openedAt`/`closedAt` tras el rechazo de su primera revisión |
| **C10** | Ni un dato real en tests ni fixtures (ADR-017); cada criterio con test; `./init.sh` en verde | `src/no-real-data.test.ts` **pasa** (39/39) — de hecho me obligó a reescribir un comentario que había reproducido sin querer una secuencia de tres palabras presente en `var/`. Nombres generados con `Date.now()` + aleatorio, importes de las fixtures sintéticas de la F13, banco de pruebas `zz-myinvestor-test-bank`. Bases desechables (ADR-027) |

---

## Último `./init.sh`

```
── 4. Type checking (tsc) ──  [OK]  Type check OK (tsc sin errores)
── 5. Ejecutando tests ─────  Test Files  48 passed (48)
                             Tests      879 passed (879)
                             [OK] Todos los tests pasan
── 3. Validando feature_list.json ──
                             [FAIL] Hay 2 features en in_progress (máximo 1)
```

**El único FAIL es el del contador de features en curso** (F28 + F29 en paralelo, decisión
del líder), y no lo puedo tocar: se me prohibió expresamente editar `feature_list.json`.
**Código y tests, verdes.** `npx oxlint`: sin hallazgos. `prettier --check`: limpio en
todo lo que he tocado.

Antes de empezar, la suite estaba **roja** por
`src/modules/trade-republic/trade-republic.docs.test.ts` (faltaba
`docs/plantillas/trade-republic-cuenta-remunerada.json`): trabajo de la F28 a medio
camino. Se resolvió solo mientras yo trabajaba, sin intervención mía.

---

## Comprobaciones sobre la base del humano

**No se ha escrito en su base.** Desde la F27 cada worker de la suite usa una base
desechable (`gastos_test_<n>`) clonada de una plantilla, y el `globalSetup` toma una foto
de `gastos` antes y después de la suite: si hubiera cambiado, aunque fuese un `insert`
seguido de su borrado, la ejecución habría salido roja. Salió verde. Sus **4 cuentas, 455
movimientos, 1 producto y 1 foto** siguen exactamente igual, y esta feature **no obliga a
reimportar nada**.

📌 **Pendiente del humano (checkpoint C4 bis, no es código):** la prueba real con sus 5
`.json` de MyInvestor. Es lo que en las tres últimas features encontró cosas con la suite
en verde.

---

## Segunda pasada (2026-08-21) — los tres arreglos del `CHANGES_REQUESTED`

El reviewer no reabrió nada del código (F26 intacta, depósito sin `Valuation`, rollback
en los dos sentidos, y el cambio de las dos aserciones de Trade Republic **legítimo e
inevitable**). Los tres arreglos son de puntero y de forma:

1. **`docs/data-model.md`** — la nota decía «las **tres últimas filas** las añadió la
   feature 9…», y al añadir yo dos filas debajo el puntero pasó a señalar otras, dejando
   fuera a `Movement.productId`, de quien hablaba el resto de la frase. Ahora **las filas
   se nombran una por una** (las tres de la F9 y las dos que tachó la F29) y queda escrito
   **por qué**: un puntero posicional en una tabla que crece se rompe solo.
2. **`src/app.ts`** — el comentario mandaba a `architecture.test.ts` y el guardián de las
   extensiones no está ahí, sino en `src/modules/import/import.routes.test.ts`
   (`never lets a bank declare the same extension in both registries`). Corregido, con el
   nombre del test además del archivo.
   **Auditados los demás punteros que escribí**, no hay un tercero roto: la referencia de
   `myinvestor.types.ts` al guardián de `architecture.test.ts` (un módulo de banco no
   importa los tipos de otro) **sí** está ahí, y las de `src/app.ts` en
   `investments.service.ts` y `myinvestor.import.test.ts` son correctas. De paso, en
   `docs/api-contract.md` el «cosa que vigila un test» pasa a nombrar el archivo.
3. **Formato** — `prettier --write` a `trade-republic.routes.test.ts` **y a nada más**.

📌 `pnpm format:check` sigue protestando por
`src/modules/myinvestor/myinvestor.product.parser.test.ts`. **No es mío y no lo he
tocado**: `git diff HEAD` sobre ese archivo está vacío, o sea que entró sin formatear en
un commit anterior. Lo dejo señalado en vez de arreglarlo, que es lo que se me pidió.

📌 Anotado el dato del reviewer y **no arreglado**, por orden expresa: por la vía nueva
del importador los archivos pasan por `decodeUtf8Strict`, así que un `.json` guardado
**con BOM** se rechaza con «JSON inválido». Es heredado del parser, y el parser estaba
prohibido en esta feature (C6). Si la prueba real lo destapa, feature propia.

**`./init.sh` tras los arreglos:** tipos OK, **879/879 tests en verde**; el único FAIL
sigue siendo `Hay 2 features en in_progress`, que no puedo tocar.

---

## Sugerencias fuera de scope (NO aplicadas)

1. **`docs/plantillas/` no tiene plantilla de MyInvestor.** Trade Republic estrenó una
   plantilla copiable versionada; los productos de MyInvestor siguen dependiendo de una
   copia en Drive que **nadie comprueba que coincida** con
   `docs/myinvestor-product-files.md` (lo dice el propio documento). Ahora que sus
   archivos entran en la base, la asimetría se nota más. Feature aparte.
2. **Nada LEE todavía estas tablas.** Ya hay productos, valoraciones, condiciones de
   depósito y fotos escritos, y **cero endpoints** que los devuelvan. Es, con diferencia,
   el hueco más visible del proyecto ahora mismo (`docs/data-model.md` §Patrimonio ya deja
   escrito el cálculo).
3. **El `date` de un depósito se lee y se tira.** Si algún día interesara saber *cuándo*
   se afirmaron las condiciones vigentes, hoy no queda registrado (más allá de
   `updatedAt`). No lo he inventado porque nadie lo ha pedido.
4. **La regla «un depósito no tiene valoraciones» sigue sin poder imponerla la base.** El
   servicio ya no la puede violar (no hay código que lo haga), pero un `INSERT` a mano
   sobre `Valuation` con un `productId` de depósito seguiría entrando. Límite conocido y
   documentado desde la F9; exigiría un trigger o desnormalizar el `type`.
5. **El mensaje del `.pdf` de Trade Republic sigue siendo falso** («no hay parser para el
   banco trade-republic», y sí lo hay: lo que no hay es parser de su extracto). Heredado y
   declarado ya en las decisiones de la F26. Sigue necesitando su feature.
