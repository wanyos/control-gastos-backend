# Review — F29 `myinvestor-products-to-db`

**Fecha:** 2026-08-21 · **Feature:** 29, `sdd: false` (manda el bloque `acceptance`, C1…C10)
· **Informe revisado:** [`progress/implementations/myinvestor-products-to-db.md`](../implementations/myinvestor-products-to-db.md)

## Veredicto: CHANGES_REQUESTED

**Un punto bloqueante (C4 bis) y dos defectos de documentación baratos.** El código es
sólido: lo he ejecutado contra una base desechable y **las cuatro promesas centrales se
cumplen en la base, no solo en el código**. Lo que falta es la prueba real —el checkpoint
que en este proyecto ha encontrado tres defectos con la suite en verde— y dos frases que
apuntan a sitios equivocados, una de ellas en el documento que se declara a sí mismo el
registro único.

No he tocado ni una línea de código, de test ni de documentación.

---

## Lo primero que pediste: ¿el cambio en `trade-republic.routes.test.ts` es legítimo?

**Legítimo e inevitable. No debilita el test.** Es el único archivo del módulo prohibido
que se tocó, y son dos aserciones dentro de un mismo `it`
([`src/modules/trade-republic/trade-republic.routes.test.ts:139-142`](../../src/modules/trade-republic/trade-republic.routes.test.ts)).

Lo que afirmaba antes eran **dos cosas distintas metidas en una**:

| Afirmación | ¿Sigue siendo cierta? | ¿Sigue protegida? |
|---|---|---|
| Trade Republic **está** en el registro de productos | sí | ✅ `toContain('trade-republic')` |
| Trade Republic lee `.json` **y nada más** | sí | ✅ `find(bank === 'trade-republic')?.extensions` → `toEqual(['.json'])` |
| Trade Republic es el **único** del registro | **ya no**, por diseño de C1 | correctamente retirada |

La tercera afirmación era un efecto colateral de escribir la primera con `toEqual` sobre
el array entero, y **C1 exige justamente que deje de ser cierta**. La sustitución conserva
la aserción fuerte (`toEqual(['.json'])`) sobre la entrada de *ese* banco, que es lo que el
test dice proteger en su propio título («IS in the PRODUCT registry, reading only its
`.json`»). Un test que hubiera quedado debilitado sería, por ejemplo, uno que pasara a
comprobar solo que el array no está vacío; no es el caso.

**Además, la exclusividad no se ha perdido en el aire:** lo que de verdad hacía falta
vigilar al entrar un segundo banco —que dos entradas no reclamen la misma extensión— ya
tiene su guardián propio y sigue verde
([`import.routes.test.ts:193`](../../src/modules/import/import.routes.test.ts)).

Y el resto del módulo prohibido está intacto por parte de esta feature: el diff de
`trade-republic.product.parser.ts`, `.docs.test.ts` y `.product.parser.test.ts` **es de la
F28**, que revisa otra persona, y no lo cuento aquí.

---

## Cambios requeridos

### 1. 🔴 C4 bis — la prueba real no se ha hecho, y aquí no es un trámite

No existe `progress/explorations/prueba-real-myinvestor-productos-<fecha>.md`, y **en tu
base los productos de MyInvestor no han entrado**:

| Tabla | Ahora |
|---|---|
| `InvestmentProduct` | **1** (tu cuenta remunerada, de la F26) |
| `SavingsSnapshot` | **1** |
| `Valuation` | **0** |

El criterio **C1** dice que tus 5 `.json` «**ENTRAN** en la base de datos», y el punto 1 de
tu `como_se_que_esta_bien` dice «subo mis 5 `.json` y después están en la base». Eso hoy
está demostrado **solo con fixtures sintéticas**. `Valuation = 0` es la medida de que
nadie ha pasado tus archivos de verdad por esta vía.

**Por qué no lo doy por bueno aunque el parser no se haya tocado:** el parser es el mismo,
pero **la vía de lectura es nueva**. En el ensayo (`POST /api/parser/myinvestor`) el
archivo se lee del disco como texto; en el importador llega como `Buffer` y pasa por
`decodeUtf8Strict`, un guardián por el que tus `.json` **nunca han pasado**. Esa es
exactamente la clase de defecto que C4 bis ha cazado antes (F22: un mensaje de codificación
falso, con 628 tests verdes).

He medido el riesgo concreto sin tocar tus datos:

| Archivo | Resultado por la vía nueva |
|---|---|
| UTF-8 sin BOM | ✅ entra |
| **UTF-8 con BOM** | ❌ `JSON inválido: Unexpected token '﻿'` |
| cp1252 | ❌ rechazado con el motivo correcto y accionable |

Lo del BOM es **heredado del parser** (no es defecto de esta feature, y el parser estaba
prohibido), y tus archivos evidentemente no lo llevan porque el volcado de la F13 funciona.
Pero es la razón de que la pasada real valga los diez minutos que cuesta: si alguno de tus
5 archivos se guardó alguna vez con otro editor, el fallo sale ahí y no en la suite.

**Qué hace falta:** una pasada con tus 5 `.json` reales y su informe en
`progress/explorations/`, **con recuentos y forma, nunca contenido** (C4 bis, segunda
viñeta / ADR-017). No es trabajo del implementer.

### 2. `docs/data-model.md:224` — el registro único apunta a las filas equivocadas

La frase dice:

> «Las **tres últimas filas** las añadió la feature 9 … `Movement.productId` es una columna
> del flujo … las dos de `InvestmentProduct` son de esa parte entera.»

Era cierta cuando las tres últimas filas eran `Movement.productId`, `closedAt` y `openedAt`.
La F29 ha **añadido dos filas debajo** (las cuatro columnas del depósito y `Valuation`), así
que «las tres últimas filas» ahora señala a `openedAt`, las del depósito y `Valuation`, y
`Movement.productId` —de quien habla el resto de la frase— ya no está entre ellas.

Es una línea, pero está en el archivo que se declara **«el registro único de columnas sin
escritor del proyecto»** y que **ya rechazó la F26 en su primera revisión** justamente por
no decir la verdad. Reescribir el puntero (o nombrar las filas explícitamente) lo cierra.

### 3. `src/app.ts:60` — el comentario manda al archivo equivocado

```ts
// its products are `.json`. A guardian of `architecture.test.ts` checks it.
```

Ese guardián **no está en `architecture.test.ts`**: está en
[`src/modules/import/import.routes.test.ts:193`](../../src/modules/import/import.routes.test.ts)
(`never lets a bank declare the same extension in both registries`). Busqué
`productParsers` en `architecture.test.ts` y no aparece ni una vez.

El guardián existe y es el correcto —por eso esto no es más que un puntero roto—, pero es
la única frase que le dice al siguiente lector dónde comprobar que meter MyInvestor en los
dos registros es seguro. La documentación equivalente de `api-contract.md` sí lo dice bien
(«cosa que vigila un test», sin nombrar archivo).

---

## Comprobado sin hallazgos

### 1. La F26 no se ha roto (el riesgo número uno) — verificado **en la base**

Ejecuté los escritores reales contra una base desechable clonada de la plantilla:

| Comprobación | Resultado |
|---|---|
| `persistSavingsSnapshot` directa: crea producto + foto | ✅ |
| En la base: **1 `SavingsSnapshot`, 0 `Valuation`** | ✅ |
| Segunda pasada: `product.created=false`, `snapshot.created=false` | ✅ |
| Idempotencia **en la base**: sigue habiendo **una** foto | ✅ |
| La misma cuenta remunerada **por el despachador nuevo** (`persistProductSnapshot`) | ✅ entra igual, 1 foto, 0 `Valuation` |
| Idempotencia por la vía nueva | ✅ sigue en pie |
| El guardián de la F26 (`type !== 'savings_account'` → rechaza) | ✅ **intacto**, mismo mensaje |

La función de la F26 conserva **nombre, firma, guardián y cuerpo**: el despachador la llama,
no la sustituye. Y en el archivo de tests de la F26 **no se ha borrado ni un test** (12 → 29
`it`). La única línea eliminada es `expect(second.snapshot.created).toBe(false)`, sustituida
por **dos** aserciones (`not.toBeNull()` + `?.created`): es estrictamente **más** fuerte, no
menos.

### 2. La regla del depósito — verificada **en la base**

| Comprobación | Resultado |
|---|---|
| Depósito: `snapshot: null` en la respuesta | ✅ |
| Depósito **en la base**: `0 Valuation`, `0 SavingsSnapshot` | ✅ |
| Las 4 condiciones, en columnas del **propio producto** | ✅ |
| Un producto que fluctúa deja esas 4 columnas a **`NULL`** (explícitamente, no «lo que hubiera») | ✅ |
| Producto que fluctúa: `1 Valuation`, `0 SavingsSnapshot` | ✅ |

**Y el caso que preguntabas:** un archivo de depósito que trae por error un campo de
valoración **se rechaza y no deja nada**:

```
claves no admitidas para el tipo 'deposit': marketValue
```

Lo rechaza el parser (regla R35, ya existente y no tocada) **antes** de que se abra ninguna
transacción, así que ni producto ni fila. La defensa está en dos capas: el parser rechaza el
archivo, y `persistDeposit` además no menciona `Valuation` en ninguna línea.

**Límite conocido, correctamente documentado y no oculto:** la **base** sigue sin poder
imponer la regla (un `INSERT` a mano de una `Valuation` sobre un depósito entraría). Está
declarado en `data-model.md` §Reglas de negocio y en el informe (sugerencia 4). Es coherente
con ADR-012, que decidió que la BD impone identidad y unicidad y el servicio impone
coherencia de dominio.

### 3. Idempotencia, incluidas las vías incómodas — verificada **en la base**

| Caso | Resultado |
|---|---|
| Mismo mes dos veces | ✅ sigue **1** valoración |
| Mes siguiente | ✅ `product.created=false`, **2** valoraciones, **mismo `product.id`** |
| ¿Un solo producto con ese nombre? | ✅ |
| **El mismo producto en dos archivos** (mismo `name`, misma `date`) | ✅ no duplica; la última pasada pisa el valor |
| **Producto renombrado** | ⚠️ crea otro producto y la serie vieja queda colgando — **límite conocido y documentado** en `myinvestor-product-files.md` y en `api-contract.md`, y avisado al humano |
| **Dos bancos con el mismo nombre de producto** | ✅ son **dos** productos distintos, series sin mezclar |

**La identidad no se apoya en nada que se renumere.** Las dos mitades las escribes tú: el
`name` del producto y la `date` del archivo, sobre `@@unique([bank, name])` y
`@@unique([productId, date])`, ambas ya en el esquema desde la F9 (**cero migración**:
confirmado, `prisma/schema.prisma` sin cambios). No hay contador, posición ni autoincremento
en ninguna de las dos claves, así que **el fallo de la F25 (`Movement.daySequence`) no puede
repetirse aquí**. El único que se renumeraría es el `id` autoincremental, que no participa
en ninguna clave natural.

### 4. O entra entero o no entra — verificado **en la base**

| Caso | Resultado |
|---|---|
| Choque de tipos sobre un producto **existente** | ✅ rechazado (`un producto no cambia de tipo`) |
| …y el producto existente **no queda medio pisado** (`type`, columnas y sus 2 valoraciones intactas) | ✅ |
| Producto **nuevo** cuya valoración la rechaza la base | ✅ `PrismaClientKnownRequestError` |
| …y **no queda medio producto detrás** (rollback completo) | ✅ **el revés también se cumple** |
| Archivo malo **no se mueve a `procesados/`**, el bueno sí | ✅ (`update` de Drive llamado **una** vez) |

Los dos upserts van dentro de un `prisma.$transaction`, y el depósito —que hace uno solo—
también, deliberadamente, porque `upsertProduct` lee antes de escribir y fuera de la
transacción una carga concurrente podría colarse entre las dos.

### 5. El parser de MyInvestor no se ha tocado, y no hay ni un campo nuevo que teclear

- `git diff --stat` de `myinvestor.product.parser.ts`, `myinvestor.format.ts` y
  `myinvestor.statement.parser.ts`: **vacío**. Confirmado en el diff, no en el informe.
- `myinvestor.fixture.ts` **tampoco** está modificado, y el test end-to-end importa con esas
  mismas fixtures de la F13. Eso es la prueba de que el formato no ha cambiado: si hiciera
  falta un campo nuevo, las fixtures viejas no pasarían.
- El adaptador nuevo (`parseMyinvestorProductFile`) **envuelve** al parser: decodifica,
  delega y estrecha el tipo. No reinterpreta nada.
- `prisma/schema.prisma` sin cambios: **cero migración**.

### 6. `docs/data-model.md` contra `prisma/schema.prisma` — contraste mecánico

No lo leí «a ojo»: extraje los bloques del documento y los del esquema real, les quité
comentarios y espacios y los comparé línea a línea.

| Bloque | Líneas | Resultado |
|---|---|---|
| `model InvestmentProduct` | 19 | **idéntico** |
| `model Valuation` | 14 | **idéntico** |
| `model SavingsSnapshot` | 14 | **idéntico** |

Y sobre el estado de las columnas, que es lo que rechazó la F26:

- Las **cuatro** del depósito (`principal`, `interestRate`, `expectedGain`, `maturityDate`)
  y **`Valuation` entera** aparecen **tachadas** en «Columnas reservadas (definidas, sin
  escritor todavía)», con quién las escribe ahora y su nota de cambio fechada. ✅
- `Movement.productId` sigue —correctamente— como la única fila sin escritor. ✅
- La afirmación «ya no queda **ninguna tabla** de inversiones sin escritor» es **cierta**:
  las tres tienen escritor y es el mismo archivo. ✅
- No quedan frases obsoletas del tipo «los ficheros de MyInvestor siguen sin llegar a la
  base» ni «la feature hermana está pendiente»: busqué las seis variantes y están todas
  actualizadas. ✅

El único defecto de este archivo es el puntero del **cambio requerido nº 2**.

`docs/api-contract.md` también dice la verdad: la tabla `type` → dónde va la foto es
correcta, el ejemplo del depósito con `snapshot: null` coincide con lo que devuelve el
código, y el aviso de por qué es `null` está. **C6 (proyecto hermano)** cumplido por la vía
que exige `related-projects.md`: el contrato se actualiza en la misma feature, y el cambio
de forma (`snapshot` anulable) queda anotado de forma visible.

### 7. Arquitectura, convenciones y verificación

| Comprobación | Resultado |
|---|---|
| `./init.sh` — tipos | ✅ `tsc` sin errores |
| `./init.sh` — tests | ✅ **879 pasan, 48 archivos**, reproducido por mí |
| `npx oxlint src/` | ✅ sin hallazgos |
| `prettier --check` sobre lo tocado | ✅ limpio |
| `console.log` / `TODO` sueltos en lo tocado | ✅ ninguno |
| Guardián «un banco no importa los tipos de otro módulo» | ✅ respetado: `MyinvestorProductInput` se declara en su módulo y encaja **estructuralmente** en `app.ts` |
| Guardián «solo `app.ts` nombra un banco» (ADR-015) | ✅ una línea en `app.ts` |
| Guardián del escritor único, ampliado a las **tres** tablas | ✅ pasa; `Valuation` solo se escribe desde `modules/investments/` |
| `src/no-real-data.test.ts` (ADR-017) | ✅ pasa |
| Tests con recursos reales, no dobles | ✅ el end-to-end usa el **registro real** de `app.ts` y la base de verdad; solo Drive es doble, que es inevitable |
| Cada criterio C1…C10 con test mapeado | ✅ el mapeo del informe es real: verifiqué la existencia de los tests citados |

**Los tests verifican output concreto**, no «no lanza excepción»: cuentan filas, comparan
`product.id`, leen columnas y comprueban fechas y mensajes de error por su contenido.

### 8. Tu base de datos: intacta, medida antes y después

| Momento | cuentas | movimientos | productos | fotos | valoraciones |
|---|---|---|---|---|---|
| **Antes** de mi revisión | 4 | 455 | 1 | 1 | 0 |
| **Después** de `./init.sh` completo y de todas mis pruebas | 4 | 455 | 1 | 1 | 0 |

No me fié del recuento: comparé **hashes `md5` del contenido completo** de `Account`,
`InvestmentProduct` y `SavingsSnapshot` antes y después. **Los tres idénticos**
(`2fd47eef…`, `3507c64f…`, `df694376…`). Tu producto y tu foto siguen siendo los tuyos y no
los he tocado.

Todas mis pruebas de escritura fueron contra una base desechable propia
(`gastos_review_f29`), creada de la plantilla y **borrada al terminar**. Mis archivos de
sonda (`.review-probe*.ts`) están **eliminados**; `git status` solo muestra los archivos de
la F29, los de la F28 y los informes.

**El guardián de la F27 funciona:** la suite completa corrió y tu base no se movió ni una
fila. Nada escribió donde no debía.

---

## CHECKPOINTS

| | Estado |
|---|---|
| **C1** el arnés está completo | ⚠️ archivos y docs ✅; `./init.sh` **en rojo**, ver nota abajo |
| **C2** el estado es coherente | ⚠️ **2 features `in_progress`** (F28 + F29), ver nota abajo |
| **C3** el código respeta la arquitectura | ✅ (guardianes, convenciones, sin logs ni TODOs) |
| **C4** la verificación es real | ✅ 879 tests, camino feliz **y** de error en cada criterio |
| **C4 bis** la prueba real | ❌ **el bloqueo** (cambio requerido nº 1) |
| **C5** la sesión se cerró bien | ⏳ pendiente del líder (`history.md`, `current.md`, estado en `feature_list.json`) |
| **C6** coherencia con el proyecto hermano | ✅ `api-contract.md` actualizado en la misma feature |
| **C7** SDD | n/a (`"sdd": false`) |
| **C8** resumen de cierre | ⏳ **no lo escribo**: el veredicto es CHANGES_REQUESTED |

> **Sobre C1 y C2 — no lo cuento contra el implementer.** El único `[FAIL]` de `./init.sh`
> es `Hay 2 features en in_progress (máximo 1)`, que es la situación que creó el líder al
> poner la F28 a revisar en paralelo, y al implementer se le prohibió tocar
> `feature_list.json`. **El bloque de tipos y el de tests están verdes.** Se resolverá solo
> al cerrar la F28. Lo dejo anotado porque la regla dice que no se aprueba con `init.sh` en
> rojo, no porque sea un defecto de esta feature.

---

## Observaciones que NO bloquean

1. **El guardián de `Valuation` es más estrecho que sus dos hermanos.**
   `architecture.test.ts:417` casa `.investmentProduct.` y `.savingsSnapshot.` por el
   nombre, pero `Valuation` solo como `(?:tx|prisma)\.valuation\.`. Un futuro escritor que
   use otro nombre de cliente (`db.valuation.upsert(…)`) **se colaría**. El motivo del
   estrechamiento está bien razonado en el comentario (evitar el falso positivo de
   `input.valuation.`, que es un acceso legítimo en un parser), y hoy no hay ningún cliente
   que se llame de otra forma. Queda escrito por si algún día lo hay.
2. **Un `.json` guardado con BOM se rechaza con un mensaje confuso** (`JSON inválido:
   Unexpected token '﻿'`) en vez de decir «quita el BOM». Es **heredado del parser**, que
   esta feature tenía prohibido tocar, y afecta igual al ensayo de la F13. Candidato a
   feature aparte; lo menciono porque la prueba real del punto 1 es donde saldría.
3. **`docs/plantillas/` sigue sin plantilla de MyInvestor**, al contrario que Trade Republic.
   Ya lo señala el propio implementer (sugerencia 1) y la asimetría se nota más ahora que
   sus archivos entran en la base. Feature aparte.
4. **Nada LEE todavía estas tablas.** Ya hay productos, valoraciones y condiciones escritas
   y **cero endpoints** que las devuelvan. Es el hueco más visible del proyecto ahora mismo.
5. **Queda la base temporal `gastos_f26`** en el Postgres. Era un deber de cierre de la F26
   («Al cerrar: borrar la base temporal `gastos_f26`») que se quedó sin hacer. No es de esta
   feature; lo recuerdo aquí porque nadie más va a mirarlo.

---

## Qué hace falta para que esto pase a APPROVED

1. (Humano) **La prueba real con tus 5 `.json`**, con su informe en
   `progress/explorations/`, con recuentos y forma y **sin contenido**.
2. (Implementer) Arreglar el puntero de `docs/data-model.md:224`.
3. (Implementer) Corregir el comentario de `src/app.ts:60` para que nombre
   `import.routes.test.ts`.
4. (Líder, al cerrar) Que quede **una sola** feature en `in_progress`, con lo que
   `./init.sh` vuelve a verde.

Nada de esto toca la lógica: **el código de esta feature no necesita un solo cambio.** Es
un trabajo bien hecho al que le falta la pasada con tus archivos de verdad.

---
---

# Segunda pasada — 2026-08-21

## Veredicto de la segunda pasada: APPROVED

Los cuatro puntos del rechazo están cerrados, y **lo que se ha escrito es verdad**, no
solo está escrito: lo he comprobado yo, no me he fiado del informe. El implementer **no ha
tocado ni una línea de lógica**: los únicos cambios desde mi primera pasada son dos
comentarios, una frase de documentación y un reajuste de formato.

Resumen de cierre: [`progress/summaries/myinvestor-products-to-db.md`](../summaries/myinvestor-products-to-db.md).

---

## 1. C4 bis — la prueba real, y la comprobé en tu base

El informe está en
[`progress/explorations/prueba-real-myinvestor-productos-2026-08-21.md`](../explorations/prueba-real-myinvestor-productos-2026-08-21.md),
y cumple la segunda viñeta de C4 bis: **recuentos y forma, ni un dato tuyo**. Ni importes,
ni nombres de productos, ni valoraciones.

**No me he fiado del informe: he medido tu base directamente.** Lo que dice y lo que hay
coinciden exactamente:

| Tipo | Productos | Valoraciones | Fotos F26 | Con condiciones de depósito |
|---|---|---|---|---|
| `fund` | 1 | **1** | 0 | 0 |
| `etf` | 1 | **1** | 0 | 0 |
| `managed_portfolio` | 1 | **1** | 0 | 0 |
| **`deposit`** | **2** | **0** | 0 | **2** |
| `savings_account` (F26) | 1 | **0** | **1** | 0 |

Esto cierra los tres puntos que en la primera pasada solo estaban demostrados con fixtures
sintéticas, y los cierra **sobre tus archivos de verdad**:

- ✅ **C1 cumplido de verdad**: tus 5 `.json` entraron, cada uno con su tipo. Ya no hay
  `Valuation = 0`.
- ✅ **La regla del depósito (ADR-012) se sostiene sobre datos reales**: tus **dos**
  depósitos tienen **cero** valoraciones y **sí** sus condiciones. No es que el código lo
  prometa: es que tu base lo enseña.
- ✅ **La F26 no se movió**: tu cuenta remunerada sigue con su foto y sin valoraciones, que
  es su forma correcta. El hash de `SavingsSnapshot` es **idéntico** al que medí en la
  primera pasada (`3507c64f…`), antes de que existiera ninguna de estas filas nuevas.
- ✅ **Idempotencia sobre datos reales y por la vía que más duele** (`/api/import/local`,
  la de reimportar): los cinco `created: false`, la base clavada en 6 productos y 3
  valoraciones.
- ✅ **Cuentas y movimientos intactos**: 4 y 455.

**El riesgo que medí, medido antes de disparar.** La comprobación del BOM se hizo sobre los
cinco archivos *antes* de lanzar la importación, y ninguno lo lleva. Eso es exactamente
para lo que servía el hallazgo: no se materializó, y queda anotado por si algún mes uno se
reguarda con otro editor.

## 2. Los dos punteros: comprobados uno a uno, no leídos

| Puntero | Dice | ¿Existe? |
|---|---|---|
| `src/app.ts:59-62` | el test `never lets a bank declare the same extension in both registries`, en `src/modules/import/import.routes.test.ts` | ✅ **`import.routes.test.ts:193`**, con ese nombre **literal** |
| `docs/api-contract.md:571` | `src/modules/import/import.routes.test.ts` | ✅ existe |
| `docs/data-model.md:224-230` | nombra las filas una a una | ✅ ver abajo |

**Y el defecto de fondo está arreglado, que era lo que pedías.** La frase ya no dice «las
tres últimas filas»: nombra `Movement.productId`, `InvestmentProduct.closedAt`,
`InvestmentProduct.openedAt`, las condiciones del depósito y `Valuation`, **cada una por su
nombre**. Eso significa que **no se rompe sola** cuando alguien añada una fila debajo: en el
peor caso quedará callada sobre la nueva, que es un defecto menor y visible, no una frase
que pasa a ser falsa en silencio. Busqué además si quedaba alguna otra referencia
posicional en el documento («últimas filas», «la fila de arriba», «las dos de abajo»…):
**no queda ninguna** que pueda romperse al insertar.

## 3. El reformateo de `trade-republic.routes.test.ts` es solo formato

Lo verifiqué **mecánicamente**, no a ojo. Partí el archivo en tres —lo anterior al `it`
tocado, el `it`, y lo posterior— y comparé contra `HEAD`:

| Parte del archivo | Resultado |
|---|---|
| **Todo lo anterior** a ese `it` | **idéntico byte a byte** |
| **Todo lo posterior** a ese `it` | **idéntico byte a byte** |
| Recuento de `describe` / `it` / `expect` | **1 / 6 / 12**, igual que en `HEAD` |

El cambio está **confinado a un solo `it`**, y dentro de él son las dos aserciones que ya
aprobé más tres líneas de comentario. Respecto a mi primera pasada, la única diferencia es
**dónde parte la línea** la misma expresión: mismo `find`, mismo `?.extensions`, mismo
`toEqual(['.json'])`. Misma expresión, mismo *matcher*, mismo valor esperado. **No hay
contenido colado.**

## 4. Busqué yo un tercer puntero roto: no lo hay

Su auditoría se sostiene. No me limité a creerla; barrí los 15 archivos de la F29
(código, tests, docs y sus dos informes) de cuatro formas distintas:

| Qué comprobé | Cuántos | Rotos |
|---|---|---|
| Rutas de archivo citadas entre comillas (`*.ts`, `*.md`, `*.json`, `*.prisma`) | todas | **0** |
| Enlaces markdown relativos en los 5 documentos | todos | **0** |
| Símbolos nombrados (`persistProductSnapshot`, `persistDeposit`, `upsertProduct`, `parseMyinvestorProductFile`, `decodeUtf8Strict`…) | 8 | **0** |
| Nombres de test citados en la tabla de mapeo criterio → test | 56 citas | **0** |

Los únicos «fallos» que devolvió mi barrido fueron falsos positivos: nombres de archivo de
ejemplo en prosa (`fondo.json`, `products.json`, `mi-fondo-2026-08-31.json`), que son lo
que **tú** escribes en Drive, no punteros a nada del repo.

## 5. El aviso de `prettier`: es cierto, y NO es de esta feature

Verificado, y va como hallazgo aparte:

- `git diff HEAD` de `src/modules/myinvestor/myinvestor.product.parser.test.ts`: **vacío**.
  No lo ha tocado.
- Último commit que lo modificó: **`ec5c786` (feature 15)**.
- Y lo concluyente: extraje la versión **commiteada** en `HEAD` y le pasé `prettier --check`
  por separado. **Ya falla ahí.** Entró sin formatear en el commit de la F15.

**No se cuenta contra la F29.** Es un cabo suelto heredado, de una línea de arreglo
(`pnpm format`), que le toca a quien pase por ese archivo.

## 6. Lo que ya aprobé y estos cambios tocaban: revisado otra vez

Como los cambios rozaban el registro de columnas y el código, no di nada por bueno:

| Comprobación | Resultado |
|---|---|
| Bloques `model` del documento contra `prisma/schema.prisma`, línea a línea | **idénticos** los tres (`InvestmentProduct` 19, `Valuation` 14, `SavingsSnapshot` 14) |
| `enum InvestmentProductType` documento vs esquema | **idéntico** |
| `src/app.ts`: ¿cambió el código o solo el comentario? | **solo el comentario**; el código sigue siendo el `import` y **una** línea de registro |
| Archivos de lógica tocados desde la 1ª pasada | **ninguno** (`diff --stat` idéntico en los 11 archivos de código y test) |
| Comportamiento, re-probado **sobre el árbol actual** en base desechable | **8/8**: F26 intacta e idempotente · depósito con 0 valoraciones y condiciones en el producto · fluctuante idempotente con las 4 columnas a `NULL` · mes siguiente reutiliza producto · choque de tipos rechazado sin pisar nada · **rollback completo** |
| `./init.sh` — tipos y tests | ✅ `tsc` limpio · **879 tests, 48 archivos** |
| `oxlint src/` | ✅ sin hallazgos |

---

## CHECKPOINTS — segunda pasada

| | Estado |
|---|---|
| **C1** el arnés está completo | ⚠️ todo ✅ salvo `init.sh`, rojo **solo** por el contador (ver nota) |
| **C2** el estado es coherente | ⚠️ 2 `in_progress` (F28 en revisión paralela) — se cierra solo |
| **C3** el código respeta la arquitectura | ✅ |
| **C4** la verificación es real | ✅ 879 tests, camino feliz y de error |
| **C4 bis** la prueba real | ✅ **cerrado** — el bloqueo de la primera pasada |
| **C5** la sesión se cerró bien | ⏳ del líder (`history.md`, `current.md`, estado en `feature_list.json`) |
| **C6** proyecto hermano | ✅ `api-contract.md` actualizado en la misma feature |
| **C7** SDD | n/a (`"sdd": false`) |
| **C8** resumen de cierre | ✅ **escrito** |

> **Por qué apruebo con `./init.sh` en rojo.** El único `[FAIL]` es
> `Hay 2 features en in_progress (máximo 1)`, y su causa es que el líder puso la F28 a
> revisar **en paralelo** con la F29. Los bloques de tipos y de tests están **verdes**.
> Bloquear la F29 por esto sería un punto muerto: si el revisor de la F28 aplicara la misma
> regla, **ninguna de las dos podría cerrarse nunca**. La regla existe para no aprobar
> código roto, y aquí no hay código roto.
>
> ⚠️ **Condición para el líder:** al marcar la F29 `done`, `./init.sh` tiene que quedar
> **verde entero**. Si tras cerrar sigue en rojo por **cualquier otro motivo** que no sea
> este contador, esta aprobación no lo cubre.

---

## Lo que corrijo de mi primera pasada

Nada de fondo, pero sí una precisión: dije que el defecto de `data-model.md` era «una
línea». El implementer lo ha arreglado mejor de lo que yo lo pedí — no reescribió la frase
para que fuese cierta hoy, sino que **quitó la referencia posicional**, que era la causa. La
frase de antes se habría vuelto a romper a la sexta fila; ésta no.

---

## Cabos sueltos anotados (ninguno bloquea, ninguno es defecto de la F29)

1. **Los contadores de la respuesta cuentan movimientos, no productos.** En la prueba real
   entraron **5 productos** y el resumen dijo `importedCount: 0`. Es confuso y ya estaba
   ahí desde la F26 (cabo suelto nº 13). Merece su feature.
2. **`myinvestor.product.parser.test.ts` sin formatear** desde `ec5c786` (F15). Un
   `pnpm format` lo cierra.
3. **Un `.json` con BOM se rechaza con un mensaje confuso.** Heredado del parser, que esta
   feature tenía prohibido tocar. Hoy ninguno de tus cinco lo lleva.
4. **`docs/plantillas/` sigue sin plantilla de MyInvestor**, al contrario que Trade Republic.
5. **Nada LEE todavía estas tablas.** Ya tienes 6 productos y 3 valoraciones guardados y
   **cero endpoints** que te los devuelvan. Es el hueco más visible del proyecto.
6. **Queda la base temporal `gastos_f26`** en tu Postgres, deber de cierre de la F26 que
   nadie hizo.
7. **Revolut** sigue sin parser y el motivo del `.pdf` de Trade Republic sigue siendo falso.

---

## Tu base de datos: intacta, medida antes y después

| Momento | cuentas | movimientos | productos | fotos | valoraciones |
|---|---|---|---|---|---|
| **Antes** de esta segunda pasada | 4 | 455 | 6 | 1 | 3 |
| **Después** de `./init.sh` completo y de todas mis pruebas | 4 | 455 | 6 | 1 | 3 |

Comparé **hashes `md5` del contenido completo** de las **cinco** tablas antes y después:
`Account`, `Movement`, `InvestmentProduct`, `SavingsSnapshot` y `Valuation`. **Los cinco
idénticos.** Tus 6 productos y tus 3 valoraciones —que entraron en tu prueba real y son
tuyos— siguen exactamente como estaban.

Mis pruebas de escritura fueron contra una base desechable propia (`gastos_review_f29b`),
**borrada al terminar**, y mi archivo de sonda está eliminado. `git status` solo muestra
los archivos de la F29, los de la F28 y los informes.
