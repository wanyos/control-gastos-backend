# myinvestor-products (F13) — implementación

> Feature 13, SDD. Spec cerrado el 2026-08-11 (cero puntos 🔴).
> **Solo parser y volcado: ni una línea toca Prisma ni la base de datos.**
> Implementado el 2026-08-12. Pendiente del `reviewer`; la feature sigue en
> `in_progress` y no se ha commiteado nada.

## Archivos modificados / creados

**Creados**

| Archivo | Qué es |
| --- | --- |
| [`src/modules/myinvestor/myinvestor.product.parser.ts`](../../src/modules/myinvestor/myinvestor.product.parser.ts) | parser puro de UN `.json` de producto: `parseMyinvestorProduct(file, content)` → `ParsedProduct \| { reason }` |
| [`src/modules/myinvestor/myinvestor.product.parser.test.ts`](../../src/modules/myinvestor/myinvestor.product.parser.test.ts) | 31 tests del parser puro |
| [`docs/myinvestor-product-files.md`](../../docs/myinvestor-product-files.md) | referencia del formato en el repo (R60) |

**Modificados** (todos existían: se amplían, no se re-crean)

| Archivo | Qué se le añadió |
| --- | --- |
| [`myinvestor.format.ts`](../../src/modules/myinvestor/myinvestor.format.ts) | `parseIsoDate` (`AAAA-MM-DD` estricto, con calendario). `parseAmountText` y `parseStatementDate` **intactos** |
| [`myinvestor.format.test.ts`](../../src/modules/myinvestor/myinvestor.format.test.ts) | `describe('parseIsoDate (R28)')` |
| [`myinvestor.types.ts`](../../src/modules/myinvestor/myinvestor.types.ts) | `InvestmentProductType`, `ParsedValuation`, `ParsedDepositTerms`, `ParsedProduct`, `MyinvestorProductsResult`, `ParsedProductSummary` + `products`/`productCount` en `MyinvestorParseRunResult` |
| [`myinvestor.service.ts`](../../src/modules/myinvestor/myinvestor.service.ts) | rama `.json` → parser de productos, choque `(name, date)` y volcado `products.json` por año |
| [`myinvestor.service.test.ts`](../../src/modules/myinvestor/myinvestor.service.test.ts) | 8 casos de productos (+1 caso de la F10 corregido, ver «Decisiones») |
| [`myinvestor.fixture.ts`](../../src/modules/myinvestor/myinvestor.fixture.ts) | `buildProductFund`, `buildProductPortfolio`, `buildProductDeposit`, `buildProductJson` — **todo sintético** |
| [`myinvestor.routes.test.ts`](../../src/modules/myinvestor/myinvestor.routes.test.ts) | caso con productos en el tempdir + las dos claves nuevas del cuerpo |
| [`src/architecture.test.ts`](../../src/architecture.test.ts) | los dos archivos nuevos al árbol, el parser nuevo al guardián de «sin prisma» y el **acotado del guardián del signo** (ver abajo) |
| [`docs/api-contract.md`](../../docs/api-contract.md) | modelo del producto parseado + `products[]`/`productCount` en `POST /api/parser/myinvestor` |
| [`docs/architecture.md`](../../docs/architecture.md) | **ADR-016** + árbol de carpetas del módulo |
| [`docs/roadmap.md`](../../docs/roadmap.md) | fila de E4 «MyInvestor · productos» (decía que le esperaban 5 puntos rojos que ya no existen) |
| [`progress/current.md`](../current.md) | nota T17 (la F9 no cambia) y bitácora |
| [`specs/myinvestor-products/tasks.md`](../../specs/myinvestor-products/tasks.md) | las 18 tasks marcadas `[x]` |

**`myinvestor.routes.ts` NO se ha tocado**, como manda el diseño: un solo disparo.
Tampoco `prisma/`, `package.json`, `pnpm-lock.yaml`, `.gitignore`, `src/lib/`,
`src/errors/`, el módulo de otro banco ni `specs/investments-data-model/`.

## Decisiones tomadas

1. **Nada de `parseAmountText` aquí.** Los números llegan como número JSON nativo; el
   normalizador del `.csv` no se importa ni se duplica. Un test lo guarda comprobando
   que el archivo no lo importa (el comentario de cabecera sí lo nombra, para explicar
   por qué **no** se usa).
2. **Los motivos van en español**, como el `ignored[]` que ya existía y como los
   ejemplos del diseño. Es además condición de R43, que exige la cadena literal
   `AAAA-MM-DD` en el motivo.
3. **El parser devuelve el motivo; el servicio lo convierte en `ValidationError`** para
   entrar por el mismo `try` de aislamiento por archivo que ya usaban los extractos.
   No se ha añadido ninguna subclase de error nueva.
4. **Claves no admitidas: un solo motivo para los dos casos** (clave inexistente y clave
   de otro tipo de producto). El texto nombra el tipo: `claves no admitidas para el tipo
   'deposit': marketValue`. Cubre R44 y R35 sin inventar dos vocabularios.
5. **Si el `type` es inválido no se exige ningún grupo de campos** (no se sabe cuál
   aplica) y las claves se validan contra la **unión** de los dos grupos, para no
   inundar el motivo de falsos «sobra esta clave».
6. **Un campo obligatorio a `null` cuenta como ausente**, igual que uno opcional: sale en
   `faltan campos obligatorios: …`.
7. **`productCount` es un contador nuevo**, no una redefinición de `parsedCount`, que
   sigue contando extractos. `failedCount` sí es común a las dos entradas, porque
   `failed[]` siempre lo fue.
8. **`products.json` solo se escribe si el año tiene algún `.json`.** Sin esto, un año
   con solo un extracto dejaría un volcado vacío, y R56 dice que sin entrada no pasa
   nada. Está documentado en el contrato de la API.
9. ⚠️ **Un test de la F10 cambió de expectativa, a propósito:**
   `myinvestor.service.test.ts` afirmaba que un `fondo.json` caía en `ignored[]` («hasta
   que exista la feature que los lee»). **Eso es exactamente lo que deroga R76.** Se ha
   quitado ese archivo del caso (que conserva su `.txt` y su `.xlsx`) y el
   encaminamiento se prueba en su propio test. Las tres claves nuevas del resultado
   obligaron también a ampliar los `toEqual` de los casos «sin copias locales» del
   servicio y de la ruta. Ningún otro test de la F10 cambió.
10. ⚠️ **Se ha acotado un guardián de `architecture.test.ts`:** «la decisión
    ingreso/gasto/neutral se toma en un solo sitio» recorría **todo** `*.parser.ts` y
    exigía `deriveMovementTypeFromAmount`. Un parser de producto no tiene movimientos ni
    signo que derivar, así que el guardián ahora se aplica a los parsers que devuelven el
    contrato de `lib/parsed-statement.ts` (los de movimientos), que es lo que la regla de
    la F11 quería decir. Está anotado en las consecuencias del ADR-016.
11. **Fixtures sintéticos** (`Fondo Sintetico Global`, `Cartera Sintetica`,
    `Deposito Sintetico 3 meses`), con nombres de producto inventados también en la
    documentación.
    🔴 **CORRECCIÓN (2026-08-12, tras el review).** La primera versión de este punto
    afirmaba «ni una cifra […] del humano», y **era falso**: los nombres sí eran
    inventados, pero **los importes se habían copiado de sus capturas**
    (`var/drive-read/myinvestor/2026/`) a través de `design.md` §7. Estaban en los
    fixtures, en los tests y en los dos documentos. **Saneado**: ver §Saneamiento de
    datos reales.

## Trazabilidad (R21-R48, R53, R76, R77 + cierre)

| R | Qué exige | Test concreto |
| --- | --- | --- |
| R21 | un `.json` = un producto | `product.parser.test.ts` › «emits the whole product with its bank and its source file as provenance» + «reports something that is not a single product object»; `service.test.ts` › «routes each entry by its extension…» (3 archivos → 2 productos + 1 extracto) |
| R22 | los cuatro `type` admitidos | `product.parser.test.ts` › «parses a fund, an ETF and a managed portfolio…» + «parses a deposit with its four conditions…» |
| R23 | `name` y `date` del contenido | `product.parser.test.ts` › «takes the name and the date from the contents» |
| R24 | nunca del nombre del archivo | `product.parser.test.ts` › «never derives the name nor the date from the file name» |
| R26 | número JSON nativo, y **sin** `parseAmountText` | `product.parser.test.ts` › «accepts integers and decimals…» + «does not import the statement number normalizer» |
| R27 | el valor tal cual, sin redondear | `product.parser.test.ts` › «neither rounds nor fixes the number of decimals» (un decimal de tres cifras y un entero) |
| R28 | fechas `AAAA-MM-DD` estrictas | `format.test.ts` › `describe('parseIsoDate (R28)')` (4 casos) |
| R29 | porcentaje, no fracción | `product.parser.test.ts` › «reads the percentages as percentages, never as fractions» |
| R30 | `closedAt` opcional | `product.parser.test.ts` › «keeps closedAt when it is written…» + «reports a product with no closedAt as alive» |
| R31 | la ausencia NO cierra | `service.test.ts` › «does not close a product that stopped being written, nor report it missing» |
| R32 | ausente ≡ `null` | `product.parser.test.ts` › «treats an absent optional field and a null one exactly the same» + «assumes EUR when the currency is not written» |
| R33 | los 4 campos de valoración | `product.parser.test.ts` › «parses a fund, an ETF and a managed portfolio…» + «names every missing mandatory field at once» |
| R34 | los 4 campos del depósito | `product.parser.test.ts` › «parses a deposit…» + «names the missing condition of a deposit» |
| R35 | el depósito no lleva valoración | `product.parser.test.ts` › «parses a deposit… no valuation at all» + «rejects a deposit that carries valuation fields» |
| R36 | el efectivo, aparte | `product.parser.test.ts` › «emits the uninvested cash apart, never added into marketValue» (comprueba que **no** aparece en ningún campo la suma de los dos) |
| R37 | una sola TAE | `product.parser.test.ts` › «rejects a second interest rate on a deposit as an unknown key» |
| R38 | signo negativo conservado | `product.parser.test.ts` › «keeps the negative sign of gain and gainPercent» |
| R39 | no calcula nada | `product.parser.test.ts` › «returns the gain as written even when it does not match the other figures» |
| R40 | todos los campos que faltan | `product.parser.test.ts` › «names every missing mandatory field at once, not the first one» |
| R41 | valor que no es número | `product.parser.test.ts` › «reports a numeric field that is not a JSON number, with the value received» (`true`, `[]`, `{}`) |
| R42 | `type` desconocido lista los cuatro | `product.parser.test.ts` › «lists the four admitted types when the type is another one» |
| R43 | fecha en otro formato | `product.parser.test.ts` › «names the field and the expected format…» + «reports the photo date in the same way» |
| R44 | claves desconocidas; `_` se ignora | `product.parser.test.ts` › «catches a silent typo as an unknown key…», «ignores the keys that start with _…», «rejects the bank written inside the file» |
| R45 | JSON roto | `product.parser.test.ts` › «reports a broken JSON with its reason instead of throwing» |
| R46 | choque `(name, date)` | `service.test.ts` › «keeps the first file alphabetically when two declare the same product and date» |
| R48 | todos los problemas de golpe | `product.parser.test.ts` › «accumulates every problem of the same file into a single reason» (4 problemas) |
| R53 | un `products.json` por año | `service.test.ts` › «dumps every product of the year into a single products.json» + «writes no products.json for a year that has no product file» |
| R76 | encaminamiento por extensión | `service.test.ts` › «routes each entry by its extension and none through the other parser»; `routes.test.ts` › «returns the products of the same bank in the same call» |
| R77 | número como **texto** = fallo | `product.parser.test.ts` › «rejects a numeric value written as text and never interprets it» (las tres formas de texto: punto decimal, formato español y con `€`) |
| R73 | árbol del guardián | `architecture.test.ts` › «contains the target tree of docs/architecture.md» |
| R47 (F10, heredado) | aislamiento por archivo | `service.test.ts` › «isolates a broken product file and parses the healthy ones all the same» |
| R55 (F10, heredado) | volcado determinista | `service.test.ts` › «produces byte-identical product dumps on two consecutive runs» |
| R4 (F10, heredado) | no toca el origen | `service.test.ts` › «does not move, delete or modify any product file» |

**Requirements de proceso** (checklist del reviewer, sin test ejecutable):

- **R60** → [`docs/myinvestor-product-files.md`](../../docs/myinvestor-product-files.md).
- **R63** → §T17 de [`progress/current.md`](../current.md): el esquema de la F9 **no
  cambia** y sus enlaces a la antigua `specs/myinvestor-parser/` apuntan hoy a dos
  carpetas.
- **R71** → sección `POST /api/parser/myinvestor` de `docs/api-contract.md`.
- **R72** → **ADR-016** en `docs/architecture.md` (el 015 estaba ocupado por la F12:
  el borrador del spec lo daba por libre).
- **R74** → abajo.
- **R75** → este archivo.

## Saneamiento de datos reales (2026-08-12, tras el review)

> El `reviewer` bloqueó la feature por esto y tenía razón: **las cifras eran las suyas**.
> Un importe es un dato personal por sí mismo; un nombre de producto inventado al lado no
> lo neutraliza. Regla incumplida: `docs/conventions.md` §Tests, `design.md` §14 y el
> preámbulo de `tasks.md`. **Origen de la fuga:** las cifras venían de `design.md` §7 del
> propio spec, que las había transcrito de las capturas.

**Qué se ha sustituido** (valores inventados, redondos, de otro orden de magnitud y sin
relación con ningún dato real; se conserva solo la **forma**: decimales, signos, un
porcentaje pequeño y un efectivo mucho menor que el valor de mercado):

| Archivo | Qué llevaba |
| --- | --- |
| [`myinvestor.fixture.ts`](../../src/modules/myinvestor/myinvestor.fixture.ts) | los cuatro importes del fondo, el efectivo de la cartera y las cuatro condiciones del depósito (incluida su fecha de vencimiento) |
| [`myinvestor.product.parser.test.ts`](../../src/modules/myinvestor/myinvestor.product.parser.test.ts) | las mismas cifras en las aserciones literales, el par de la cartera, la segunda TAE de su ficha, la fecha de vencimiento en sus tres formatos y los textos de R77 |
| [`myinvestor.service.test.ts`](../../src/modules/myinvestor/myinvestor.service.test.ts) | el par valor de mercado / efectivo de la cartera y el importe en texto del caso de archivo roto |
| [`myinvestor.types.ts`](../../src/modules/myinvestor/myinvestor.types.ts) | el porcentaje del comentario de `gainPercent` |
| [`myinvestor.product.parser.ts`](../../src/modules/myinvestor/myinvestor.product.parser.ts) y [`myinvestor.format.ts`](../../src/modules/myinvestor/myinvestor.format.ts) | el importe y la fecha de ejemplo de sus comentarios de cabecera |
| [`docs/myinvestor-product-files.md`](../../docs/myinvestor-product-files.md) | las **dos plantillas** completas (fondo, cartera y depósito), los ejemplos de las reglas de números y fechas y el ejemplo del porcentaje |
| [`docs/api-contract.md`](../../docs/api-contract.md) | el bloque «Modelo de un producto parseado» y el ejemplo de `gainPercent` |
| [`docs/architecture.md`](../../docs/architecture.md) | los dos importes de ejemplo del **ADR-016** (no estaban en la lista del reviewer; misma regla) |
| este informe | las cifras que citaba en la tabla de trazabilidad |

**Fuga heredada de la F10 saneada de paso** (3 líneas, mismo módulo, archivo que esta
feature ya estaba tocando): [`myinvestor.format.test.ts`](../../src/modules/myinvestor/myinvestor.format.test.ts)
usaba **el importe real de su fondo** en tres aserciones de `parseAmountText`. Se han
cambiado por cifras inventadas de la misma forma; la cobertura no cambia.

**Verificación:** extraídos todos los números de las tres capturas
(`fondo.txt`, `deposito.txt`, `indi.txt`) y buscados —en forma inglesa y española— sobre
todos los archivos de esta feature: **cero coincidencias**. `./init.sh` verde
(25 archivos, 360 tests) y `prettier --check` limpio en todo lo tocado.

**Lo que NO he tocado** (no es mío y sigue teniendo sus cifras):

- `specs/myinvestor-products/design.md` §7 y `CAMPOS-cerrados.md` — los sanea el
  `spec_author` en paralelo (punto 2 del review).
- **La fuga es más ancha de lo que se ha corregido:** `docs/data-model.md`,
  `docs/architecture.md` (ADR-012), `src/modules/investments/investments.model.test.ts`,
  `progress/history.md` y `progress/summaries/investments-data-model.md` reproducen las
  mismas cifras de la cartera y del fondo, y el fixture del CSV de la F10 lleva un
  concepto que parece copiado de su extracto. Son features cerradas: lo dejo como
  hallazgo, no lo aplico.

## Último `./init.sh`

```
── 4. Type checking (tsc) ──   [OK] Type check OK (tsc sin errores)
── 5. Ejecutando tests ─────   Test Files 25 passed (25) · Tests 360 passed (360)
── 6. Resumen ──────────────   [OK] Entorno listo. Puedes empezar a trabajar.
```

`pnpm run lint` → **limpio, sin salida**.

`pnpm run format:check` → **rojo, y no por esta feature**. Falla en archivos que no he
tocado (`src/app.ts`, `src/modules/import/*`, `src/modules/ingestion/*`,
`myinvestor.statement.parser.ts`…) **solo por el final de línea**: con
`core.autocrlf=true` el árbol de trabajo los tiene en CRLF y Prettier espera LF.
Comprobado que el contenido **en el repositorio** (`git show HEAD:<archivo>`) sí pasa
`--check`, así que es un artefacto del árbol de trabajo de esta máquina, anterior a la
F13. **Todos los archivos de esta feature pasan `prettier --check`**, incluido
`src/architecture.test.ts`, que he normalizado a LF (no altera el diff: git ya lo
guardaba en LF).

## Sugerencias fuera de scope (NO aplicadas)

1. **`format:check` no está en `init.sh`.** Si estuviera, la sesión habría empezado en
   rojo. O se mete `endOfLine: "auto"` en `.prettierrc` (o un `.gitattributes` con
   `* text=auto eol=lf`), o se normaliza el árbol una vez con `prettier --write` — pero
   es un cambio que toca ~18 archivos de otras features y no es de la F13.
2. **`tsconfig.tsbuildinfo` está versionado** y cambia en cada `tsc --incremental`, o
   sea en cada `./init.sh`. Debería estar en `.gitignore`.
3. **La cabecera de `myinvestor.types.ts` sigue diciendo que el `accountIban` de este
   banco es «siempre `null`»**, y desde la F12 el humano escribe la línea `iban;<IBAN>`
   y el parser la lee. Es prosa de un comentario de la F10, no de esta feature.
4. **Enlaces del spec de la F9** a la antigua `specs/myinvestor-parser/`: hay que
   repartirlos entre `myinvestor-statement` y `myinvestor-products` (anotado como manda
   T17; `specs/investments-data-model/` no se ha tocado).
5. **Nadie guarda todavía los productos.** Cuando exista esa feature, su regla de
   recarga es **sobrescribir** (la contraria a la del importador de movimientos) y le
   toca escribir `InvestmentProduct.closedAt` a partir del campo del archivo.
