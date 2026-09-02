# savings-account-as-product (F26) — implementación

> Feature **SDD**. Manda [`specs/26-savings-account-as-product/`](../../specs/26-savings-account-as-product/);
> la hoja del humano es [`decisions.md`](../../specs/26-savings-account-as-product/decisions.md),
> aprobada el 2026-08-20 con las **6 decisiones 🔴 tal cual**.
> **Las 28 tasks de [`tasks.md`](../../specs/26-savings-account-as-product/tasks.md) están en `[x]`**
> (lotes A, B, C y D, ejecutados por un solo implementer, en ese orden).
>
> **Dos pasadas.** La primera dejó la feature entera con la migración **sin aplicar**
> (así se pidió). La segunda, tras el `CHANGES_REQUESTED` del reviewer
> ([`reviews/savings-account-as-product.md`](../reviews/savings-account-as-product.md)),
> es **solo documentación**: `docs/data-model.md`. Ver
> [§Segunda pasada](#segunda-pasada-2026-08-20--el-registro-único-de-columnas) al final.

---

## ✅ La migración: escrita en la primera pasada, YA APLICADA

> **Estado hoy:** aplicada contra la base del humano (`prisma migrate status` → 4
> migraciones, «Database schema is up to date»), y `./init.sh` **verde**. Lo que sigue es
> el **registro de la primera pasada**, cuando todavía no lo estaba; se conserva porque
> explica por qué el informe original venía con la suite en rojo.

<details><summary>Cómo se entregó en la primera pasada (histórico)</summary>

Instrucción explícita del leader: **la migración se escribe pero no se lanza contra la base
del humano**. Se respetó. Consecuencia directa y esperada:

- `./init.sh` sobre **su** base está **ROJO**: entre **55 y 74 tests** según la pasada
  (los `afterEach` que limpian filas fallan también y arrastran a los tests siguientes
  del mismo archivo), y **siempre confinados a los mismos cuatro archivos**, los que
  necesitan la tabla y el valor de enum nuevos:

  | Archivo | Fallos (pasada de máximo) |
  |---|---|
  | `src/modules/investments/investments.model.test.ts` | 42 |
  | `src/modules/investments/investments.service.test.ts` | 14 |
  | `src/modules/import/import.service.test.ts` | 11 |
  | `src/modules/import/import.local.service.test.ts` | 7 |

  **Ni un fallo fuera de ahí** en ninguna de las tres pasadas: cuentas, categorías,
  movimientos, ingesta, los cinco parsers de banco, los guardianes de arquitectura y el
  de privacidad pasan igual que antes.

- La verificación de verdad se ha hecho sobre una **base de datos temporal aparte**
  (`gastos_f26`, creada y migrada desde cero en el mismo contenedor), donde la suite
  **completa** está en **verde: 46 archivos, 816 tests** (baseline antes de esta feature:
  45 archivos, 767 tests → **+49**).

### El comando que había que lanzar con el humano delante — **ya lanzado**

```bash
docker compose up -d          # ya levantado
pnpm exec prisma migrate deploy   # aplica 20260820181500_savings_account_as_product
./init.sh                         # debe quedar 816/816 en verde
```

</details>

La migración es **puramente aditiva** y está comprobada sobre base limpia
(`prisma migrate deploy` con las cuatro migraciones, sin error):

```sql
ALTER TYPE "InvestmentProductType" ADD VALUE 'savings_account';
CREATE TABLE "SavingsSnapshot" (…);
CREATE UNIQUE INDEX "SavingsSnapshot_productId_date_key" …;
ALTER TABLE "SavingsSnapshot" ADD CONSTRAINT "SavingsSnapshot_productId_fkey" …;
```

**Cero backfill, cero `ALTER` sobre una tabla existente, cero SQL escrito a mano**: el
archivo es exactamente lo que emitió `prisma migrate diff`. No toca `Account`, ni
`Movement`, ni `Category`, ni `InvestmentProduct`, ni `Valuation`. Sus **4 cuentas y 455
movimientos** no se rozan, y las dos tablas de inversiones estaban vacías.

> La base temporal `gastos_f26` queda creada en el contenedor. Se puede borrar con
> `docker exec gastos-postgres psql -U postgres -c 'DROP DATABASE gastos_f26;'`.

---

## Archivos modificados / creados

### Creados

| Archivo | Qué es |
|---|---|
| [`prisma/migrations/20260820181500_savings_account_as_product/migration.sql`](../../prisma/migrations/20260820181500_savings_account_as_product/migration.sql) | La migración aditiva (R1, R2). **Sin aplicar.** |
| [`src/modules/investments/investments.types.ts`](../../src/modules/investments/investments.types.ts) | `SavingsSnapshotInput`, `ProductParserAdapter`, `ProductParserRegistry`, `ProductImportResult` |
| [`src/modules/investments/investments.service.ts`](../../src/modules/investments/investments.service.ts) | `persistSavingsSnapshot`: los **dos upserts** en una transacción. Único escritor de la capa |
| [`src/modules/investments/investments.service.test.ts`](../../src/modules/investments/investments.service.test.ts) | R3-R8, R14 |

### Modificados

| Archivo | Cambio |
|---|---|
| [`prisma/schema.prisma`](../../prisma/schema.prisma) | quinto valor del enum + modelo `SavingsSnapshot` + relación inversa `savingsSnapshots` |
| [`src/modules/investments/investments.model.test.ts`](../../src/modules/investments/investments.model.test.ts) | el enum pasa a exigir **cinco** valores; bloque nuevo del `SavingsSnapshot` y tres tests de la migración |
| [`src/modules/trade-republic/trade-republic.service.ts`](../../src/modules/trade-republic/trade-republic.service.ts) | **exporta** `parseTradeRepublicProductFile(fileName, content: Buffer)`; `parseAccountFile` pasa a ser una línea sobre ella. Ni un archivo nuevo, ni una mención a la base de datos |
| [`src/modules/trade-republic/trade-republic.service.test.ts`](../../src/modules/trade-republic/trade-republic.service.test.ts) | los 8 casos de rechazo + el camino bueno + no-regresión del ensayo |
| [`src/modules/trade-republic/trade-republic.routes.test.ts`](../../src/modules/trade-republic/trade-republic.routes.test.ts) | el test del registro deja de leer `app.ts` como texto y usa los registros exportados |
| [`src/modules/import/import.types.ts`](../../src/modules/import/import.types.ts) | `ProductResult`, `AttemptedProductFileReport`, `AttemptedLocalProductFileReport` |
| [`src/modules/import/import.service.ts`](../../src/modules/import/import.service.ts) | `selectProductAdapter`, `importProductFile`, bifurcación de `importPending` y **la cáscara de Drive extraída a `importDriveFile`** |
| [`src/modules/import/import.local.service.ts`](../../src/modules/import/import.local.service.ts) | la misma bifurcación, sin Drive |
| [`src/modules/import/import.routes.ts`](../../src/modules/import/import.routes.ts) | acepta e inyecta `productParsers` en las dos rutas |
| [`src/app.ts`](../../src/app.ts) | `bankParsers` y `productParsers` pasan a ser constantes **exportadas**; una sola entrada nueva: `{ bank: 'trade-republic', extensions: ['.json'] }` |
| [`src/architecture.test.ts`](../../src/architecture.test.ts) | tres archivos nuevos en el árbol + **dos guardianes nuevos** |
| [`src/modules/import/import.service.test.ts`](../../src/modules/import/import.service.test.ts) · [`import.local.service.test.ts`](../../src/modules/import/import.local.service.test.ts) · [`import.routes.test.ts`](../../src/modules/import/import.routes.test.ts) | los tests de la vía de entrada |
| [`docs/api-contract.md`](../../docs/api-contract.md) · [`docs/architecture.md`](../../docs/architecture.md) (**ADR-026**) · [`docs/trade-republic-product-files.md`](../../docs/trade-republic-product-files.md) · [`docs/roadmap.md`](../../docs/roadmap.md) | lote D |

---

## Decisiones tomadas

Ninguna de las seis del bloque 🔴 se ha reabierto. Lo que sigue son huecos que el spec
dejaba al implementer, resueltos sin desviarse de él.

1. **Un producto que ya existe con OTRO tipo hace que el archivo se rechace, no que el
   producto se convierta.** R3 prohíbe filas de `SavingsSnapshot` colgando de un `fund`,
   `etf`, `managed_portfolio` o `deposit`. El `upsert` sobre `(bank, name)` que pide R4
   podría, con un `name` repetido, **cambiarle el tipo** a un producto existente y colgarle
   la foto: eso viola R3 en silencio. Se hace un `findUnique` previo **dentro de la misma
   transacción** y, si el tipo no es `savings_account`, se lanza `ValidationError` diciendo
   qué producto es y qué tipo tiene. El archivo sale `failed`, no se escribe nada y no se
   mueve. Cubierto por
   [`investments.service.test.ts` › «refuses to hang a photo on a product of another type»](../../src/modules/investments/investments.service.test.ts).

2. **`created` se deduce con un `findUnique` previo, no comparando `createdAt` con
   `updatedAt`.** Es la opción que `design.md` §4 marcaba como «la que no depende de la
   resolución del reloj», y las dos lecturas van dentro de la transacción.

3. **Un archivo que ningún registro lee sigue siendo `skipped` con el motivo del registro
   de EXTRACTOS.** `selectProductAdapter` tiene sus propios motivos («no hay parser de
   productos para el banco X»), pero el informe publica el del registro de extractos, que
   es el contrato que los otros cuatro bancos ya tenían (R14). Efecto buscado: el `.pdf`
   de Trade Republic sigue diciendo «no hay parser para el banco trade-republic» —el
   mensaje **falso** que `decisions.md` §Incoherencias deja fuera de alcance a propósito—
   y los 5 `.json` de MyInvestor siguen con «extensión no soportada por el parser de
   myinvestor», palabra por palabra. Cubierto por
   [`import.service.test.ts` › «keeps a file no registry reads as skipped, with the statement reason (R14)»](../../src/modules/import/import.service.test.ts).

4. **La cáscara de Drive se extrae en vez de duplicarse.** `importFile` pasa a ser
   `importDriveFile<T>`: descargar → copia cruda → `store(content)` → mover a
   `procesados/` **solo si `store` salió bien**. Los extractos y los productos pasan por
   la misma función, así que la regla de ADR-025 («mover es consecuencia de guardar»)
   sigue viviendo en **un** sitio y no puede divergir entre los dos tipos de archivo.
   Es la misma razón por la que la F25 extrajo `importStatement` en vez de copiarlo.

5. **El informe de un archivo de producto es su propia forma, no una versión nullable de
   la del extracto.** Trae `product` y `snapshot`; **no** trae `account`, `imported`,
   `duplicates`, `unparsedCount` ni `unparsedRows`. Un archivo de producto no aporta ni un
   movimiento: esos contadores serían ceros que no significan nada, y una unión con
   `null`es es lo que ADR-013 rechazó con `providesBalance`. `totals()` es estructural
   desde la F25, así que no ha hecho falta tocarlo: un archivo de producto no suma a
   `importedCount` ni a `duplicateCount`, y sí a `failedCount` cuando falla.

6. **El módulo del banco no importa nada de `investments/`.** `parseTradeRepublicProductFile`
   devuelve su propio `ParsedSavingsAccount`, que encaja **estructuralmente** en
   `SavingsSnapshotInput`. Así el guardián «ningún módulo de banco importa fuera de
   `./`, `../../errors/`, `../../lib/` y `../movements/`» sigue verde sin excepciones, y
   el `bank` que el parser trae dentro (`'trade-republic'`, una constante suya) lo
   **pisa el importador** con el slug de la **carpeta**, que es lo que exige R4.

7. **`bankParsers` y `productParsers` se exportan desde `app.ts`.** Hacía falta para el
   guardián de T20 (intersección vacía de extensiones). De paso, el test de la F20 que
   comprobaba el registro **leyendo `app.ts` como texto** pasa a comprobar el dato: era
   frágil y se rompió al mover la constante.

---

## Trazabilidad

| R | Qué exige | Test |
|---|---|---|
| **R1** | `savings_account` como quinto valor, por migración aditiva | [`investments.model.test.ts`](../../src/modules/investments/investments.model.test.ts) › «generates the enum with exactly those five values and no more (R2, F26 R1)» · «adds savings_account keeping the four older enum values (F26 R1)» (contra `pg_enum`, en orden) · «accepts a product of the fifth type, savings_account (F26 R1)» |
| **R2** | Tabla `SavingsSnapshot`, cinco `Decimal(10,2)` NOT NULL, `@@unique(productId,date)`, FK | [`investments.model.test.ts`](../../src/modules/investments/investments.model.test.ts) › «stores the five amounts with their exact precision» · «declares the five amounts NOT NULL» (contra `information_schema`) · «rejects two photos of the same product and date, not of two products» (P2002) · «hangs the photo off the product through a real foreign key» (P2003) · «creates the unique index of the savings photo declaratively» |
| **R3** | Ni `Valuation` para una cuenta remunerada, ni `SavingsSnapshot` para los otros cuatro tipos | [`investments.service.test.ts`](../../src/modules/investments/investments.service.test.ts) › «writes no Valuation row for a savings account (R3)» · «refuses to hang a photo on a product of another type instead of converting it (R3)» · «rejects an input whose type is not savings_account before touching the database (R3, R8)»; + guardián de que no hay `CHECK` («creates the unique index…»: la regla es del servicio, ADR-012 dec. 9) |
| **R4** | Upsert del producto sobre `(bank, name)`, `bank` de la CARPETA | [`investments.service.test.ts`](../../src/modules/investments/investments.service.test.ts) › «creates the product with the type, currency and dates of the file (R4)» · «takes the bank from the folder and never from the contents (R4)» · «stores the closing date when the file carries one (R4)»; end-to-end en [`import.service.test.ts`](../../src/modules/import/import.service.test.ts) › «takes the bank from the FOLDER and never from what the parser claims (R4)» |
| **R5** | Upsert de la foto sobre `(productId, date)`, cinco importes **tal cual** | [`investments.service.test.ts`](../../src/modules/investments/investments.service.test.ts) › «stores the five amounts exactly as written, computing nothing (R5)» · «stores the amounts the bank rounded by one cent without correcting them (R5)» |
| **R6** | Mismo mes dos veces → 1 producto y 1 foto, valores de la última | [`investments.service.test.ts`](../../src/modules/investments/investments.service.test.ts) › «leaves one product and one photo when the same month is loaded twice (R6)»; por HTTP-interno en [`import.service.test.ts`](../../src/modules/import/import.service.test.ts) › «reports created:false on the second pass of the same month (R6, R13)»; por la vía local en [`import.local.service.test.ts`](../../src/modules/import/import.local.service.test.ts) › «does not duplicate anything on a second pass of the same month (R11, R6)» |
| **R7** | Mes siguiente → mismo producto, una fila más | [`investments.service.test.ts`](../../src/modules/investments/investments.service.test.ts) › «reuses the product and adds one row for the next month (R7)»; [`import.local.service.test.ts`](../../src/modules/import/import.local.service.test.ts) › «adds one row for the next month and keeps the same account (R11, R7)»; a nivel de esquema en [`investments.model.test.ts`](../../src/modules/investments/investments.model.test.ts) › «keeps the months of one account as a series (F26 R2, R7)» |
| **R8** | Archivo rechazado → **ni producto ni foto** | [`trade-republic.service.test.ts`](../../src/modules/trade-republic/trade-republic.service.test.ts) › los **8 casos de rechazo** (descuadre, marcador `<…>`, campo ausente, número como texto, fecha inválida, clave desconocida, `type` erróneo, bytes no UTF-8) + «rejects a file that is not JSON at all»; que no deja rastro, en [`import.service.test.ts`](../../src/modules/import/import.service.test.ts) › «leaves NO trace when the five amounts do not add up (R8, R9, R12)», [`import.local.service.test.ts`](../../src/modules/import/import.local.service.test.ts) › «leaves no trace and moves nothing when the amounts do not add up (R8, R11)» y [`investments.service.test.ts`](../../src/modules/investments/investments.service.test.ts) › «leaves neither product nor photo when the write is rejected (R8)» (fallo **a mitad de la transacción**, con el producto ya escrito) |
| **R9** | `failed` + motivo íntegro + `movedToProcessed: false` | [`import.service.test.ts`](../../src/modules/import/import.service.test.ts) › «leaves NO trace when the five amounts do not add up (R8, R9, R12)» (comprueba `status`, `failedCount`, el texto del motivo y `movedToProcessed`) |
| **R10** | El `.json` de `trade-republic` deja de ser `skipped` | [`import.service.test.ts`](../../src/modules/import/import.service.test.ts) › «stops reporting the .json as skipped: it persists it and moves it (R10, R12, R13)»; el cableado real en [`trade-republic.routes.test.ts`](../../src/modules/trade-republic/trade-republic.routes.test.ts) › «IS in the PRODUCT registry, reading only its .json (feature 26, R10)»; el guardián del orden en [`import.routes.test.ts`](../../src/modules/import/import.routes.test.ts) › «never lets a bank declare the same extension in both registries» |
| **R11** | La vía local persiste igual, sin Drive | [`import.local.service.test.ts`](../../src/modules/import/import.local.service.test.ts) › «persists the copy without touching Drive and without moving anything (R11)» (+ las tres siguientes); el «sin Drive» lo sostiene además el guardián vivo de [`architecture.test.ts`](../../src/architecture.test.ts) › «keeps the local reimport away from Drive» |
| **R12** | Se mueve a `procesados/` **después** de escribir, nunca antes | [`import.service.test.ts`](../../src/modules/import/import.service.test.ts) › «stops reporting the .json as skipped…» (`movedToProcessed: true` **y** las filas en la base) y «leaves NO trace…» (`update` de Drive **no llamado**) |
| **R13** | El informe dice id, nombre, creado/actualizado, fecha y foto nueva/pisada | [`import.service.test.ts`](../../src/modules/import/import.service.test.ts) › «stops reporting the .json as skipped: it persists it and moves it (R10, R12, R13)» · «reports created:false on the second pass of the same month (R6, R13)» |
| **R14** | Ni una fila de `Account` ni de `Movement`; los extractos, exactamente igual | [`investments.service.test.ts`](../../src/modules/investments/investments.service.test.ts) › «touches neither Account nor Movement (R14)»; [`import.service.test.ts`](../../src/modules/import/import.service.test.ts) › «writes no Account and no Movement when a product file is imported (R14)» · «imports a statement exactly as before while the product registry is wired (R14)» · «keeps a file no registry reads as skipped, with the statement reason (R14)»; [`investments.model.test.ts`](../../src/modules/investments/investments.model.test.ts) › «creates SavingsSnapshot without touching the flow tables (F26 R1, R2, R14)» (columnas de `Account` una a una); y **los 63 tests previos de `import/` siguen verdes sin tocar** |
| **R15** | El módulo del banco sin base de datos; el ensayo sigue escribiendo sin persistir | [`architecture.test.ts`](../../src/architecture.test.ts) › «keeps the trade-republic parser module free of data access» (**intacto**) · «writes InvestmentProduct and SavingsSnapshot only from modules/investments (feature 26)» (nuevo); [`trade-republic.service.test.ts`](../../src/modules/trade-republic/trade-republic.service.test.ts) › «the dry run keeps its job: parse and dump, never persist (F26 R15)» |

### Guardianes nuevos

- `architecture.test.ts` › **«writes InvestmentProduct and SavingsSnapshot only from
  modules/investments»**: ningún otro archivo de `src/` (sin contar tests ni
  `generated/`) toca `.investmentProduct.` ni `.savingsSnapshot.` del cliente Prisma.
- `architecture.test.ts` › **«keeps the investments service free of Drive and of bank
  knowledge»**: el escritor no nombra Drive, no lee ficheros, no parsea JSON y no nombra
  ningún banco.
- `import.routes.test.ts` › **«never lets a bank declare the same extension in both
  registries»** + **«declares every extension lowercase and with the dot»**: es lo que
  hace que el orden fijo de consulta (extractos → productos) no pueda morder nunca.

---

## Último `./init.sh`

**Contra la base del humano, con la migración ya aplicada: VERDE.**

```
── 4. Type checking (tsc) ──  [OK] Type check OK (tsc sin errores)
── 5. Ejecutando tests ─────  Test Files  46 passed (46)
                              Tests      816 passed (816)
[OK] Entorno listo.
```

Baseline antes de esta feature: 45 archivos / 767 tests → **+1 archivo, +49 tests**.

**Y su base sigue exactamente igual**, contada antes y después de la pasada:

| | cuentas | movimientos | productos | valoraciones | fotos |
|---|---|---|---|---|---|
| Antes de `./init.sh` | 4 | 455 | 0 | 0 | 0 |
| Después de `./init.sh` | 4 | 455 | 0 | 0 | 0 |

Desglose de movimientos por cuenta idéntico en las dos: 204 / 201 / 39 / 11. **La suite no
deja ni una fila detrás**: los tests de la F26 borran en su `afterEach` los productos, las
fotos, las cuentas y los movimientos de los bancos sintéticos que crean.

<details><summary>Cómo salía en la primera pasada, con la migración sin aplicar (histórico)</summary>

```
Test Files  4 failed | 42 passed (46)
Tests      55 failed | 761 passed (816)
```

Los fallos eran **exactamente** los cuatro archivos que dependían de la migración
pendiente. Ningún otro archivo fallaba. Contra la base temporal ya migrada (`gastos_f26`)
la suite completa estaba verde, 816/816.

</details>

- `npx tsc --noEmit`: limpio.
- `pnpm run lint` (oxlint): limpio.
- `pnpm run format:check`: limpio en todo lo que toca esta feature.
- **Capa de comparación del guardián de privacidad: ACTIVA** (no saltada — sus dos tests
  contra `var/` corren y tardan 129 ms y 660 ms) y verde, con los 39 tests de
  `no-real-data.test.ts` en verde.
- **Flake conocido `movements.test.ts:318`**: apareció **una vez** (un 500 en «GET
  /api/movements lists newest first…») en la primera pasada contra su base, mientras los
  74 fallos de la migración pendiente estaban dejando transacciones abortadas. **No se
  reprodujo** en las dos pasadas siguientes ni en ninguna de las cuatro pasadas contra la
  base migrada. No se ha tapado ni tocado.

### Lo único de `var/` que se ha tocado, y por qué

`var/parsed/trade-republic/2026/products.json` tiene **mtime nuevo**. No lo escribe nada
de esta feature: lo reescribe un test **que ya existía antes** de la F26
(`trade-republic.routes.test.ts` › «is registered in the real app…», que arranca la app
real y llama a `POST /api/parser/trade-republic` con los directorios por defecto). Su
contenido sale igual (`productCount: 1`, `failedCount: 0`, `ignoredCount: 1`, los mismos
números de la prueba real del 2026-08-20) porque el volcado es **determinista** —hay un
test que exige que dos pasadas escriban bytes idénticos—. `var/drive-read/` no se ha
tocado. **Toda** la suite nueva usa directorios temporales.

---

## Sugerencias fuera de scope (NO aplicadas)

1. **El mensaje falso del `.pdf` de Trade Republic.** Sigue diciendo «no hay parser para
   el banco trade-republic» cuando parser **hay**; lo que no hay es parser de su
   extracto. Está fuera de alcance por decisión escrita, y ahora es **más** visible: es
   el único banco con entrada en el registro de productos y sin entrada en el de
   extractos. Arreglarlo bien es que `selectAdapter` distinga «este banco no tiene
   ningún parser» de «tiene parser, pero no de esta extensión», mirando los dos
   registros. Es una feature pequeña y con su propio riesgo de contrato.
2. **`prettier --check` está rojo en `src/modules/myinvestor/myinvestor.product.parser.test.ts`,
   y no lo he tocado**: viene así de antes de esta sesión. `./init.sh` no ejecuta
   Prettier, así que no rompe nada, pero conviene saberlo antes de que alguien crea que
   lo ha ensuciado esta feature.
3. **Un `.fixture.ts` compartido para el archivo de producto sintético.** Hoy
   `import.service.test.ts` e `import.local.service.test.ts` declaran cada uno su
   `productFile()` y su `fakeProductAdapter()` casi idénticos. No se ha unificado a
   propósito: el guardián de arquitectura exige que el importador (y su suite) **no
   nombre ningún banco**, y el sitio natural del fixture compartido sería `lib/`, que es
   donde vive el contrato y no los dobles de test. Si crece a un tercer usuario, merece
   su propio archivo en `modules/import/`.
4. **Cabo suelto #8 del roadmap, ahora más cerca.** `computeTotals` no excluye
   `productId != null`. Sigue dando igual (nadie escribe esa columna todavía, y esta
   feature tampoco), pero la capa de inversiones ya tiene escritor: cuando llegue el
   enlace de aportaciones, ese cabo se cobra.
5. **La feature hermana de MyInvestor.** El servicio está diseñado para que solo tenga
   que añadir un adaptador al registro de productos y un segundo upsert (`Valuation` en
   lugar de `SavingsSnapshot`). La rama del `deposit` —sin serie de fotos— es lo único
   que no tiene camino hecho.
6. **C4 bis (la prueba real) está pendiente y no la he hecho:** no se puede hacer sin la
   migración aplicada, y el archivo de Drive tiene que llevar ya el `name` corregido
   (`saving-account`). Es lo primero que hay que hacer después de lanzar la migración.


---

## Segunda pasada (2026-08-20) — el registro único de columnas

El reviewer emitió **CHANGES_REQUESTED con un solo bloqueo, y de documentación**:
[`docs/data-model.md`](../../docs/data-model.md) —el archivo que se declara a sí mismo
«**el registro único de columnas**» del proyecto— no llevaba **ni una línea** de esta
feature, y `docs/api-contract.md` manda al lector ahí a buscar `SavingsSnapshot`.
Veredicto entero en [`reviews/savings-account-as-product.md`](../reviews/savings-account-as-product.md).

**No se ha tocado ni una línea de código, ni un test, ni la migración.** El único archivo
modificado en esta pasada es `docs/data-model.md`.

### Los 6 puntos que pedía el reviewer

| # | Qué faltaba | Dónde está ahora |
|---|---|---|
| 1 | El **quinto valor del enum** `savings_account` | §Esquema Prisma de la Parte 2, con su comentario, en el mismo estilo que los otros cuatro |
| 2 | La **relación inversa** `savingsSnapshots SavingsSnapshot[]` | en el `model InvestmentProduct` del mismo bloque, con `valuations` anotado como «serie de fund / etf / managed_portfolio» para que se lea de un vistazo cuál es cuál |
| 3 | El **bloque `model SavingsSnapshot`** entero: siete columnas con tipo y significado | detrás de `model Valuation`, más una nota 🔴 de por qué los cinco importes son **NOT NULL** cuando los de `Valuation` no lo son, y la ecuación del cuadre |
| 4 | El **diagrama** de entidades | `SAVINGS_SNAPSHOT` con sus ocho campos y la relación `INVESTMENT_PRODUCT ||--o{ SAVINGS_SNAPSHOT`, más la nota de que un producto tiene **una** serie o la otra, nunca las dos |
| 5 | La **clave natural** `@@unique([productId, date])` | fila nueva en §Claves naturales, diciendo que de ella cuelga toda la idempotencia y **por qué aguanta** (ni ella ni `(bank, name)` llevan nada renumerable, a diferencia de `Movement.daySequence`) |
| 6 | `openedAt` y `closedAt` **ya no son columnas sin escritor** | §Columnas reservadas: las dos filas **tachadas** con 🔄 y su escritor (`persistSavingsSnapshot`), más una nota de cambio fechada, como la que tuvo la F15 |

### Lo que encontré yo al repasar, y que el reviewer no listó

Me pidieron comprobar si había algo más sin registrar. Siete cosas, todas del mismo tipo:
frases del documento que **esta feature volvió falsas**.

1. **La cabecera de la Parte 2 decía «Sin endpoints, sin parser y sin importador».**
   Importador ya hay. Reescrita con una nota 🔄 de la F26 que dice qué entró, que fue
   aditiva, y que **sigue sin consultas** (nadie LEE estas tablas).
2. **La tabla de partes de la cabecera del documento** no mencionaba la F26. Fila nueva
   colgando de la Parte 2, con su ADR.
3. **La regla 4** («la valoración se lee, no se calcula») enumeraba solo las cinco
   columnas de `Valuation`. Ahora dice que cubre igual los cinco importes de
   `SavingsSnapshot` — que es exactamente la regla que sostiene R5.
4. **«los tres índices de esta parte»** en §Claves naturales: ahora son **cuatro**.
   Enumerados uno a uno, porque la frase existe para sostener el «cero SQL crudo».
5. **«quedan `NULL` en los otros tres tipos»** (las cuatro columnas del depósito): ahora
   son **cuatro** tipos. Y §Una sola tabla de producto explica que la cuenta remunerada
   **no añadió ninguna columna** al producto, solo su serie, con una tabla de tres filas
   que resume qué serie le toca a cada tipo y por qué `Valuation` no servía.
6. **El 📌 «El futuro importador necesita DOS upserts»** seguía en futuro. Ya no lo es:
   marcado ✅ con el nombre de la función que los hace, la transacción única y el
   guardián que impide un segundo escritor.
7. **§Reglas de negocio de inversiones** solo tenía la regla del depósito. Añadida su
   **gemela** —cada producto tiene la serie que le toca por su tipo, y lo vigila el
   servicio, no la BD— incluyendo el matiz de que aquí el servicio va un paso más allá:
   un `name` que ya existe con otro tipo **rechaza el fichero** en vez de convertirlo.

Y dos correcciones de coherencia más, menores:

- **§Patrimonio** listaba de dónde sale el número de cada tipo de producto y no tenía la
  cuenta remunerada. Añadida (el `balance` de su foto más reciente), **marcada 📌 como
  no decidida**: esa consulta no existe y esta feature no la ha inventado.
- **§Lo que NO está aquí** afirmaba que «ninguna línea escribe un `Movement`, un
  `Account`, un `InvestmentProduct` ni una `Valuation`». Era falso desde la F12 para las
  dos primeras y desde la F26 para la tercera. Reescrito separando lo hecho de lo que
  falta (los ficheros de producto de MyInvestor, que siguen sin llegar a la base).
- La nota de cambio de la **F15** decía que `openedAt` «ya tiene quien la escriba», lo
  que ahora chocaría con la nota de la F26. Ajustada a «ya tiene **de dónde salir**», que
  es lo que la F15 hizo de verdad: darle el campo en el fichero. Quien la guarda llegó
  con la F26.

### Cómo comprobé que el registro dice la verdad

No a ojo: comparando el bloque Prisma del documento **campo a campo** contra
`prisma/schema.prisma` con un script. `model SavingsSnapshot`, `model InvestmentProduct`
y `enum InvestmentProductType` salen **idénticos** (mismos nombres, mismo orden, mismos
tipos). Es lo que hace que la §«Esquema Prisma (el real; fuente de verdad:
`prisma/schema.prisma`)» deje de ser una promesa.

### Verificación de la segunda pasada

- `./init.sh` → **VERDE, 46 archivos / 816 tests**, contra la base del humano.
- **Su base, contada antes y después: idéntica** — 4 cuentas, 455 movimientos, 0
  productos, 0 valoraciones, 0 fotos, con el mismo desglose 204 / 201 / 39 / 11.
- `pnpm run lint` limpio; `format:check` sigue rojo **solo** en
  `myinvestor.product.parser.test.ts`, que ya venía así de antes y no he tocado.
- El guardián de privacidad pasa con su capa de comparación activa: el texto nuevo de
  `data-model.md` **no lleva ni un importe** —la ecuación del cuadre va con los nombres
  de los campos, no con cifras— precisamente para no acercarse a esa frontera.
