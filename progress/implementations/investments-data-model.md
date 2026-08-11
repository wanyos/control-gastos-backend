# Implementación — Feature 9 `investments-data-model`

> Informe del `implementer`. Feature SDD: la fuente de verdad es
> [`specs/investments-data-model/`](../../specs/investments-data-model/design.md)
> (requirements + design + tasks), **no** el `acceptance` original de
> `feature_list.json`. El spec pasó la puerta de aprobación humana el 2026-08-11 y
> las **dos decisiones marcadas en rojo se confirmaron tal cual**: el depósito sin
> valoraciones es **regla del servicio** (no `CHECK` en la BD) y los importes se
> quedan en **`Decimal(10,2)`**. Ninguna se reabrió.
>
> - **Fecha:** 2026-08-11
> - **Estado en `feature_list.json`:** `in_progress` (**no** se marca `done`: falta
>   el veredicto del `reviewer` y su `progress/summaries/investments-data-model.md`).
> - **Verificación:** `bash ./init.sh` **verde** — typecheck + **220 tests en 17
>   ficheros** (la suite estaba en **197 / 16** al arrancar: **+23 tests, +1
>   fichero**, ninguno modificado).
> - **Tasks:** T1-T20 de
>   [`specs/investments-data-model/tasks.md`](../../specs/investments-data-model/tasks.md)
>   **todas marcadas `[x]`**. Ninguna saltada.
> - **Alcance respetado:** solo **esquema + migración**. Cero endpoints, cero
>   rutas, cero servicios, cero parser, cero importador. `src/app.ts` sin tocar.

---

## 1. Archivos creados / modificados

### Creados

| Archivo | Qué es |
| --- | --- |
| [`prisma/migrations/20260811152117_investments/migration.sql`](../../prisma/migrations/20260811152117_investments/migration.sql) | Migración **100 % generada** por `prisma migrate dev`. `CREATE TYPE "InvestmentProductType"`, `ALTER TABLE "Movement" ADD COLUMN "productId"`, `CREATE TABLE "InvestmentProduct"`, `CREATE TABLE "Valuation"`, tres índices y dos FKs. **Ni una línea escrita a mano.** |
| [`src/modules/investments/investments.model.test.ts`](../../src/modules/investments/investments.model.test.ts) | **Único** archivo que esta feature pone en el módulo (R24). 23 tests de integración contra el Postgres real, sembrando con Prisma (no hay endpoints que inyectar). |
| [`progress/implementations/investments-data-model.md`](investments-data-model.md) | Este informe. |

### Modificados

| Archivo | Cambio |
| --- | --- |
| [`prisma/schema.prisma`](../../prisma/schema.prisma) | **+77 líneas, −0**: el diff es estrictamente aditivo (comprobado con `git diff -U0`). Enum en [`schema.prisma:58`](../../prisma/schema.prisma#L58), `model InvestmentProduct` en [`schema.prisma:138`](../../prisma/schema.prisma#L138), `model Valuation` en [`schema.prisma:172`](../../prisma/schema.prisma#L172), y dentro de `model Movement` la relación + [`schema.prisma:124`](../../prisma/schema.prisma#L124) (`productId Int?`) y [`schema.prisma:131`](../../prisma/schema.prisma#L131) (`@@index([productId])`). |
| [`src/architecture.test.ts`](../../src/architecture.test.ts) | **Una entrada aditiva** al array `expected` del árbol (T12): `modules/investments/investments.model.test.ts`, con el comentario de por qué la carpeta es parcial. **No** se escribió el guardián de "esta carpeta solo tiene un archivo" (prohibido por el spec: el módulo está diseñado para crecer). |
| [`docs/data-model.md`](../../docs/data-model.md) | Retitulado a `# Modelo de datos`, reglas ampliadas a **cinco**, `## Parte 1 — Flujo` (prosa intacta) y `## Parte 2 — Inversiones` nueva. Detalle en §4. |
| [`docs/architecture.md`](../../docs/architecture.md) | **ADR-012** completo + `investments/` en el árbol de «Estructura de carpetas». |
| [`docs/api-contract.md`](../../docs/api-contract.md) | Una nota: la capa de inversiones **no expone endpoints todavía**. Cero endpoints añadidos. |
| [`progress/current.md`](../current.md) | Estado de la sesión, columnas reservadas nuevas, el punto abierto cerrado y el deber del humano sobre la cuenta de MyInvestor. |
| [`specs/investments-data-model/tasks.md`](../../specs/investments-data-model/tasks.md) | T1-T20 marcadas `[x]`. |

### NO tocados (regla dura R17/R19, verificado con `git diff --stat`)

`src/modules/accounts/**`, `src/modules/categories/**`, `src/modules/movements/**`,
`src/app.ts`, `src/errors/**`, `src/lib/**`, `src/plugins/**`,
`src/modules/bankinter/**`, `src/modules/ingesta/**`, `package.json`, `.env`,
`docs/stack.md`. **Ningún archivo de test del flujo cambió** ni de contenido ni de
resultado.

---

## 2. Diseño y decisiones tomadas

Todo el **qué** venía cerrado por el spec; aquí solo se registra el **cómo** y las
dos o tres elecciones de materialización que quedaban:

1. **El esquema, tal cual lo fijó `design.md` §2.** Una tabla de identidad
   (`InvestmentProduct`, con las cuatro columnas del depósito dentro y nullable),
   una tabla de foto (`Valuation`, con `invested` dentro porque crece con las
   aportaciones), y una columna reservada en `Movement`. Comentarios en inglés y
   mínimos, incluyendo el aviso de que `interestRate` es **TAE en porcentaje**
   ([`schema.prisma:155`](../../prisma/schema.prisma#L155)) — el error clásico de
   ese campo, que el modelo no puede detectar solo.
2. **Cero SQL crudo, confirmado en la práctica.** Los tres índices son
   declarativos, así que la migración salió entera del generador. Verificado
   además que **no hay drift**: una segunda ejecución de `prisma migrate dev`
   responde *"Already in sync, no schema change or pending migration was found"*.
   Es el contraste explícito con la feature 8, que sí arrastra dos índices a mano.
3. **`prisma format` revertido a propósito.** Formatear el schema realineaba
   columnas de campos **preexistentes** de `model Movement` y movía un comentario
   de la feature 8. Como R17 exige un diff estrictamente aditivo, se deshizo esa
   reindentación y el archivo quedó con **0 líneas borradas**. Consecuencia
   conocida: `prisma/schema.prisma` no está en la forma canónica del formateador
   (ya no lo estaba antes de esta feature); nada del repo ejecuta `prisma format`.
4. **`Movement.productId` no se filtra al contrato.**
   [`movements.service.ts:88`](../../src/modules/movements/movements.service.ts#L88)
   mapea campo a campo, así que `GET /api/movements` devuelve exactamente la misma
   forma que antes. Comprobado, y anotado en `docs/api-contract.md`.
5. **Tests de precisión con `.toFixed(n)`, nunca `.toString()`** (decimal.js quita
   los ceros a la derecha), y nombres de producto con sufijo aleatorio porque
   `@@unique([bank, name])` es global. Limpieza en `afterEach` en orden
   `movement → valuation → investmentProduct → account`.
6. **El test del UPSERT espera 10 ms antes de reescribir** para que `updatedAt`
   (precisión de milisegundos en `TIMESTAMP(3)`) avance de verdad y el `>` sea una
   comprobación real, no una que pasa por casualidad.
7. **Tres tests leen el catálogo de Postgres** (`pg_constraint`, `pg_indexes`,
   `information_schema`) para convertir en ejecutable lo que si no sería solo
   revisión de diff: que la migración creó las tablas y los tres índices, que
   `Movement.productId` es nullable, y que **no existe ningún `CHECK` en
   `Valuation`** — este último es el que se pondría rojo si alguien impusiera la
   regla del depósito en la BD sin actualizar el spec.

### Lo que NO se hizo, a propósito

- **Ningún guardián `readdirSync(...) === [un archivo]`** para
  `src/modules/investments/` (prohibido explícitamente por R24 y T12: el módulo
  está diseñado para crecer con el servicio del importador).
- **`computeTotals` no excluye `productId != null`.** La regla 5 queda
  **documentada y sin implementar**, como manda R19. Efecto práctico hoy: cero,
  porque la columna es siempre `null`.
- **Ningún `CHECK`** que impida una valoración sobre un depósito (decisión humana
  confirmada en la puerta).

---

## 3. Trazabilidad `R<n>` → test concreto

> Nivel 4 de [`docs/verification.md`](../../docs/verification.md). Salvo indicación
> en contra, el test vive en
> [`investments.model.test.ts`](../../src/modules/investments/investments.model.test.ts).

| R | Qué exige | Test concreto |
| --- | --- | --- |
| **R1** | Un único `InvestmentProduct` con los datos comunes | [`investments.model.test.ts:120`](../../src/modules/investments/investments.model.test.ts#L120) `stores every common field of a product and defaults the currency to EUR (R1)` |
| **R2** | Enum con **exactamente** cuatro valores | [`:143`](../../src/modules/investments/investments.model.test.ts#L143) `accepts a product of each of the four types (R2)` + [`:157`](../../src/modules/investments/investments.model.test.ts#L157) `generates the enum with exactly those four values and no more (R2)` |
| **R3** | `fund`, `etf` y `managed_portfolio` con los mismos campos; sin desglose | [`:166`](../../src/modules/investments/investments.model.test.ts#L166) `gives fund, etf and managed_portfolio exactly the same fields (R3)` (incluye que no hay `parentId` ni `parentProductId`) |
| **R4** | Cuatro columnas del depósito, nullable en los demás | [`:208`](../../src/modules/investments/investments.model.test.ts#L208) `fills the four deposit-only columns and keeps them null on a fund (R4, R5)` |
| **R5** | `interestRate` = TAE en porcentaje, sin pérdida de precisión | [`:208`](../../src/modules/investments/investments.model.test.ts#L208) (mismo test: `'2.7500'` round-trip con `.toFixed(4)`) |
| **R6** | Clave natural `(bank, name)` | [`:254`](../../src/modules/investments/investments.model.test.ts#L254) `rejects a second product with the same (bank, name) and allows it in another bank (R6)` |
| **R7** | Ciclo de vida solo con `closedAt`, sin enum `status` | [`:238`](../../src/modules/investments/investments.model.test.ts#L238) `represents the lifecycle only with closedAt, with no status flag (R7)` |
| **R8** | `Valuation` completa con su precisión exacta | [`:269`](../../src/modules/investments/investments.model.test.ts#L269) `stores a full valuation and returns every number with its exact precision (R8)` |
| **R9** | `invested` en la foto, **no** en el producto | [`:201`](../../src/modules/investments/investments.model.test.ts#L201) `does not keep the invested capital on the product: it belongs to the snapshot (R9)` + [`:354`](../../src/modules/investments/investments.model.test.ts#L354) (la serie demuestra que el dato vive por fecha) |
| **R10** | Tres fotos en tres fechas, sin pisarse, ordenadas | [`:354`](../../src/modules/investments/investments.model.test.ts#L354) `keeps the three snapshots of a fund whose invested capital grows (R9, R10)` |
| **R11** | `gain` y `gainPercent` negativos idénticos | [`:293`](../../src/modules/investments/investments.model.test.ts#L293) `keeps a negative gain and a negative percentage identical (R11)` |
| **R12** | `uninvestedCash` ausente → `NULL`; presente → se conserva | [`:308`](../../src/modules/investments/investments.model.test.ts#L308) `stores the uninvested cash as null when absent and keeps it when present (R12)` |
| **R13** | Regla 4: nada calculado | [`:325`](../../src/modules/investments/investments.model.test.ts#L325) `stores the gain as given even when it does not match marketValue - invested (R13)` (guarda `480.00` donde la resta daría `500.00`) + [`:341`](../../src/modules/investments/investments.model.test.ts#L341) `leaves a missing gain and percentage as null instead of deriving them (R13)` |
| **R14** | Única `(productId, date)` | [`:396`](../../src/modules/investments/investments.model.test.ts#L396) `rejects two snapshots of the same product and date, but not of two products (R14)` |
| **R15** | Recargar = UPSERT, gana el último | [`:410`](../../src/modules/investments/investments.model.test.ts#L410) `overwrites the snapshot when the same file is loaded again (R15)` (mismo `id`, `count` sigue 1, `updatedAt` avanza) |
| **R16** | `Movement.productId` nullable + relación + índice | [`:439`](../../src/modules/investments/investments.model.test.ts#L439) `links a movement to the product the money went to (R16)` + [`:466`](../../src/modules/investments/investments.model.test.ts#L466) `leaves productId null on a movement created the existing way (R16)` + [`:531`](../../src/modules/investments/investments.model.test.ts#L531) `adds Movement.productId as a nullable column (R16, R22)` |
| **R20** | Regla del servicio, **no** `CHECK` | [`:497`](../../src/modules/investments/investments.model.test.ts#L497) `does not stop a valuation on a deposit today (R20)` (límite conocido) + [`:510`](../../src/modules/investments/investments.model.test.ts#L510) `declares no CHECK constraint on Valuation (R20, R23)` |
| **R22** | La migración crea todo sin error sobre base limpia | [`:521`](../../src/modules/investments/investments.model.test.ts#L521) `creates the InvestmentProduct and Valuation tables (R22)` + [`:541`](../../src/modules/investments/investments.model.test.ts#L541) `creates the three declarative indexes of this feature (R22, R23)`; y la suite completa (220 tests) corre contra ese Postgres |
| **R28** | `./init.sh` verde + mapa de trazabilidad | `bash ./init.sh` → `[OK] Entorno listo` (§5) + esta tabla |

### Requirements de **proceso** (checklist del reviewer sobre el diff, no test)

Anotados así por el propio spec (`design.md` §11):

| R | Qué verifica el reviewer | Dónde mirar |
| --- | --- | --- |
| **R17** | Ningún campo, índice, enum ni tabla del flujo modificado | `git diff -U0 prisma/schema.prisma` → **0 líneas borradas**; el `migration.sql` solo tiene `CREATE`/`ADD`; `git diff --stat src/modules/{accounts,categories,movements}` vacío |
| **R18** | La regla 5 documentada en `docs/data-model.md` | `docs/data-model.md` §Las cinco reglas (regla 5) y §Parte 2 |
| **R19** | `computeTotals` / `computeAccountBalance` sin tocar | `git diff src/modules/movements/` vacío; la suite del flujo pasa con los mismos resultados |
| **R21** | `marketValue` **no** incluye `uninvestedCash`, documentado | `docs/data-model.md` §Patrimonio + ADR-012 decisión 11 |
| **R23** | Todos los índices declarativos, cero SQL a mano | El `migration.sql` es el generado; `prisma migrate dev` posterior no reporta drift (§5). Parcialmente **también testeado** en [`:541`](../../src/modules/investments/investments.model.test.ts#L541) y [`:510`](../../src/modules/investments/investments.model.test.ts#L510) |
| **R24** | Sin endpoints; el módulo solo gana su test | Diff de esta feature: `src/modules/investments/` contiene **un** archivo y `src/app.ts` no aparece en el diff. **Por qué no es un test:** el módulo está diseñado para crecer (razón completa en el propio R24) |
| **R25** | `docs/data-model.md` reestructurado | Ver §4 de este informe |
| **R26** | ADR-012 + árbol de carpetas | `docs/architecture.md` |
| **R27** | Nota de "sin endpoints todavía" | `docs/api-contract.md`, al final de `## Modelos` |

**R9 se testea solo en su parte observable** (que el producto no tenga columna
`invested`, y que la serie viva por fecha); "no existe esa columna en el esquema"
lo confirma además el reviewer sobre `prisma/schema.prisma`.

---

## 4. Qué cambió exactamente en `docs/data-model.md`

- **Título** → `# Modelo de datos`, con una tabla de las dos partes en el preámbulo.
- **`## Las cinco reglas que explican el modelo`** en el preámbulo común: las tres
  del flujo **sin tocar**, más la **4** (la valoración se lee, no se calcula) y la
  **5** (una aportación no se crea, se marca), con la nota de que la 5 está
  documentada pero **no implementada** todavía.
- **`## Parte 1 — Flujo`** envuelve el contenido anterior. La **prosa es idéntica**;
  lo único que cambió son los **niveles de encabezado** de sus secciones (`##` →
  `###`, `###` → `####`) para que cuelguen de la parte. Los anclajes internos
  (`#cálculo-del-saldo-de-una-cuenta`, `#traspasos-entre-cuentas-propias`) siguen
  funcionando.
- **Tabla de columnas reservadas:** tres filas nuevas — `Movement.productId`,
  `InvestmentProduct.closedAt` y `InvestmentProduct.openedAt` (esta última con la
  nota de que **se queda `NULL`**: el fichero no lleva ese campo).
- 📌 **Fila de `daySequence`, para que quede trazable:** en `HEAD` esa fila era
  `` | `daySequence`, `balanceAfter`, `origin` | el importer (feature siguiente) | ``
  y ahora está **partida en dos**, con `daySequence` apuntando al parser de cada
  banco (🔄 F11). **Ese cambio no es de esta feature ni de T13:** venía de la sesión
  de harness del 2026-08-11 (norma «un parser por banco»), ya estaba en el árbol de
  trabajo sin commitear cuando arrancó la F9 y por eso aparece en el mismo diff. Es
  correcto y se queda; se anota aquí porque el reviewer lo detectó como cambio sin
  dueño.
- **Dos nits del reviewer, corregidos tras su aprobación (no bloqueantes):**
  `status` aparecía **duplicado** en la tabla (fila propia + fila del importer) →
  fusionado en la fila propia; y la nota al pie decía «las dos últimas filas»
  cuando las que añadió la F9 son **tres** → reescrita.
- **Punto abierto nº 2** (precisión `Decimal(10,2)`) marcado ✅ con la confirmación
  del humano del 2026-08-11 y el aviso de que subirlo obliga a las dos capas.
- **`## Parte 2 — Inversiones`** nueva: diagrama, esquema Prisma real, por qué
  `invested` va en la foto y `principal` en el producto, la TAE en porcentaje y la
  regla de una sola TAE por depósito, las dos claves naturales con su precio
  (renombrar crea un producto nuevo), el **UPSERT** con la tabla comparativa contra
  el dedup del flujo y la nota de los **dos upserts**, las reglas de negocio
  (depósito sin valoraciones; **dejar de escribir un producto no lo cierra**), y el
  ✅ **patrimonio = `marketValue + uninvestedCash`** con la aritmética de las
  muestras reales.
- **`## Lo que NO está aquí (fase siguiente)`** reescrita: ya no dice "las
  inversiones se diseñarán después" (obsoleto), sino lo que de verdad falta —
  parser, **importador**, escritor de `productId` y consulta de patrimonio.

---

## 5. Verificación

```
$ pnpm run typecheck        # tsc --noEmit → sin errores
$ pnpm run format:check     # All matched files use Prettier code style!
$ pnpm run lint             # eslint . → sin hallazgos
$ pnpm exec prisma migrate dev
  Already in sync, no schema change or pending migration was found.   # cero drift (R23)
```

Salida del último `bash ./init.sh`:

```
── 3. Validando feature_list.json ──────────────────────
[OK]    feature_list.json válido (12 features)
[OK]    Specs presentes para features sdd con estado no-pending

── 4. Type checking (tsc) ──────────────────────────────
[OK]    Type check OK (tsc sin errores)

── 5. Ejecutando tests ─────────────────────────────────
 Test Files  17 passed (17)
      Tests  220 passed (220)
[OK]    Todos los tests pasan

── 6. Resumen ──────────────────────────────────────────
[OK]    Entorno listo. Puedes empezar a trabajar.
```

**Antes de la feature:** 197 tests en 16 ficheros. **Después:** 220 en 17.
**+23 tests, +1 fichero, 0 tests modificados** — que es la prueba de que la capa
es realmente aditiva.

---

## 6. Sugerencias fuera de alcance (anotadas, **NO** aplicadas)

1. **Excluir `productId != null` de `computeTotals`**, por simetría con
   `transferId` (ADR-011). El spec lo congela a propósito (R19) y lo dejó marcado
   como punto para la puerta. Es **una línea + su test** cuando llegue el escritor
   de la columna; hoy no cambiaría ningún número porque `productId` es siempre
   `null`.
2. **`prisma/schema.prisma` no está en forma canónica de `prisma format`**
   (tampoco lo estaba antes). Reformatearlo es un cambio de una sola vez que
   tocaría líneas del flujo, así que no cabía aquí; si algún día se quiere, mejor
   como tarea propia y aislada.
3. **`docs/ideas.md` del workspace** (idea #3 → ✅ y su tabla "de idea a features")
   sigue sin actualizar: está **fuera de este repo** y el design lo dejó
   explícitamente fuera de alcance, pendiente de confirmación del humano.
4. **`InvestmentProduct.openedAt` nace sin escritor previsto.** No es un problema
   (la columna ya existe y admitirla en el fichero sería cero migración), pero
   conviene que el humano sepa que hoy siempre valdrá `NULL`.

---

## 7. Estado final

- `feature_list.json`: la feature 9 sigue en **`in_progress`**. **No se marca
  `done`**: falta el veredicto del `reviewer` y su
  `progress/summaries/investments-data-model.md` (C8 de `CHECKPOINTS.md`).
- `specs/investments-data-model/tasks.md`: **T1-T20 todas `[x]`**.
- Repositorio limpio: sin archivos temporales, sin `console.log`, sin `TODO`
  nuevos, sin dependencias ni variables de entorno nuevas.
