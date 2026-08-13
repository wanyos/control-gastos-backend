# Review — feature 9 `investments-data-model`

**Veredicto: APROBADO (APPROVED)**

- **Fecha:** 2026-08-11
- **Revisado contra:** `specs/investments-data-model/{decisions,requirements,design,tasks}.md`,
  el bloque `intent` + `acceptance` de la feature 9 en `feature_list.json`,
  [`progress/implementations/investments-data-model.md`](../implementations/investments-data-model.md),
  `docs/architecture.md`, `docs/conventions.md`, `docs/verification.md`,
  `docs/specs.md` y `CHECKPOINTS.md`.
- **Alcance del diff revisado:** working tree vs. commit `1aee041`. Los cambios de
  `.claude/agents/*`, `AGENTS.md`, `CLAUDE.md`, `CHECKPOINTS.md`, `docs/specs.md`,
  `docs/conventions.md`, `init.sh`, `.editorconfig`, `docs/roadmap.md`,
  `docs/decisions-template.md` y `specs/myinvestor-parser/` son de la sesión del
  harness y de la F10, **no** de esta feature; no forman parte de esta review.
- **Verificación ejecutada por el reviewer** (no copiada del informe):
  - `bash ./init.sh` → **verde**: `[OK] feature_list.json válido (12 features)`,
    `[OK] Type check OK`, **17 archivos / 220 tests pasando**,
    `[OK] Entorno listo`.
  - `pnpm run lint` → sin hallazgos. `pnpm run format:check` → *All matched files
    use Prettier code style!*.
  - **Migración replicada sobre base limpia** (BD `gastos_review_shadow`, creada y
    destruida por el reviewer en el mismo Postgres): `prisma migrate deploy`
    aplicó las **tres** migraciones sin error, y
    `prisma migrate diff --from-config-datasource --to-schema` →
    **«No difference detected»**. R22 y el "cero drift" de R23 quedan verificados
    de forma independiente, no de oídas.
- **`feature_list.json`: NO se ha tocado.** La feature sigue `in_progress`;
  marcarla `done` es del `implementer` tras esta aprobación.

---

## 1. Las comprobaciones duras que pedía la puerta

### 1.1 El modelo del flujo no se tocó — OK, verificado por el reviewer

`git diff -U0 --numstat prisma/schema.prisma` → **`77  0  prisma/schema.prisma`**.
La cifra del informe es exacta: **77 inserciones, 0 borrados**. Los cuatro hunks,
todos aditivos:

| Hunk | Qué añade |
| --- | --- |
| `+54,11` | el enum `InvestmentProductType` con su comentario ([schema.prisma:58](../../prisma/schema.prisma#L58)) |
| `+121,5` | dentro de `model Movement`: la relación `product` y `productId Int?` ([schema.prisma:123](../../prisma/schema.prisma#L123)) |
| `+131,1` | `@@index([productId])` ([schema.prisma:131](../../prisma/schema.prisma#L131)) |
| `+135,60` | `model InvestmentProduct` ([schema.prisma:138](../../prisma/schema.prisma#L138)) y `model Valuation` ([schema.prisma:172](../../prisma/schema.prisma#L172)) |

Ningún campo, índice ni enum del flujo aparece modificado: los índices
preexistentes de `Movement` siguen en [schema.prisma:129](../../prisma/schema.prisma#L129)
sin tocar, y `MovementType` / `MovementOrigin` / `MovementStatus` / `AccountType` /
`CategoryKind` no salen en el diff.

`git diff --stat -- src/modules/accounts src/modules/categories src/modules/movements`
→ **vacío**. `git diff --name-only -- src/app.ts` → **vacío**. **Ningún test del
flujo cambió** (los 197 previos siguen ahí: 220 − 23 nuevos = 197, en 16 + 1
ficheros). `package.json`, `.env.example` y `docs/stack.md`: intactos.

### 1.2 La migración es aditiva y limpia — OK

[migration.sql](../../prisma/migrations/20260811152117_investments/migration.sql):
56 líneas, y `grep -in "check\|drop\|alter column"` sobre ella **no devuelve
nada**. Contenido exacto: `CREATE TYPE`
([migration.sql:2](../../prisma/migrations/20260811152117_investments/migration.sql#L2)),
`ALTER TABLE "Movement" ADD COLUMN "productId" INTEGER`
([migration.sql:5](../../prisma/migrations/20260811152117_investments/migration.sql#L5)
— `ADD COLUMN`, **no** `ALTER COLUMN`, y sin `NOT NULL`), dos `CREATE TABLE`
([migration.sql:8](../../prisma/migrations/20260811152117_investments/migration.sql#L8),
[migration.sql:27](../../prisma/migrations/20260811152117_investments/migration.sql#L27)),
tres índices
([migration.sql:43](../../prisma/migrations/20260811152117_investments/migration.sql#L43),
[migration.sql:46](../../prisma/migrations/20260811152117_investments/migration.sql#L46),
[migration.sql:49](../../prisma/migrations/20260811152117_investments/migration.sql#L49))
y dos FKs
([migration.sql:52](../../prisma/migrations/20260811152117_investments/migration.sql#L52),
[migration.sql:55](../../prisma/migrations/20260811152117_investments/migration.sql#L55)).
Formato, orden de bloques y comentarios (`-- CreateEnum`, `-- AlterTable`…) son
los del generador: **cero SQL escrito a mano**, exactamente lo que el humano
confirmó en la puerta. Ni un `CHECK`.

**Aplicada sobre base limpia:** verificado a mano (ver arriba) — las tres
migraciones se aplican en orden sin error y el resultado no diverge del schema.

### 1.3 Las dos decisiones vinculantes del humano — respetadas

1. **Depósito sin valoraciones = regla del servicio.** No hay `CHECK` en la
   migración (grep limpio) y el test lo convierte en ejecutable por partida doble:
   [investments.model.test.ts:497](../../src/modules/investments/investments.model.test.ts#L497)
   deja escrito el **límite conocido** (hoy la BD acepta una `Valuation` sobre un
   `deposit`) y
   [investments.model.test.ts:510](../../src/modules/investments/investments.model.test.ts#L510)
   consulta `pg_constraint` para exigir **cero** restricciones `CHECK` en
   `Valuation`. Ese segundo test es el guardián real: se pondría rojo si alguien
   impusiera la regla en la BD en silencio. La regla está escrita como regla de
   negocio en [data-model.md:558](../../docs/data-model.md#L558).
2. **`Decimal(10,2)` heredado del flujo.** Verificado campo a campo en el schema
   ([schema.prisma:153](../../prisma/schema.prisma#L153),
   [:156](../../prisma/schema.prisma#L156),
   [:180](../../prisma/schema.prisma#L180),
   [:183](../../prisma/schema.prisma#L183),
   [:184](../../prisma/schema.prisma#L184),
   [:186](../../prisma/schema.prisma#L186)) y en el SQL. Solo se salen los dos
   porcentajes, tal como fijó el spec: `interestRate Decimal(6,4)` y
   `gainPercent Decimal(7,4)`. El punto abierto nº 2 de
   [data-model.md:357](../../docs/data-model.md#L357) queda marcado ✅ con la fecha
   y el aviso de subirlo "en las dos capas a la vez".

### 1.4 Alcance: ni endpoints, ni rutas, ni parser, ni importador — OK

- `src/modules/investments/` contiene **un** archivo: `investments.model.test.ts`
  (`ls` verificado). Sin `*.routes.ts`, `*.service.ts`, `*.schema.ts`,
  `*.types.ts` ni `*.parser.ts`.
- [src/app.ts](../../src/app.ts) **no aparece en el diff**; sus registros siguen
  siendo los seis de antes (`health`, `accounts`, `categories`, `movements`,
  `ingesta`, `parser/bankinter`).
- `computeTotals` y `computeAccountBalance` sin tocar → la regla 5 queda
  **documentada y sin implementar**, como manda R19.
- Correcto **no** haber escrito el guardián `readdirSync(...) === [un archivo]`:
  R24 y T12 lo prohíben expresamente y la razón es sólida (el módulo está
  diseñado para crecer). La entrada aditiva en el árbol esperado está en
  [architecture.test.ts:81](../../src/architecture.test.ts#L81) con su comentario.

---

## 2. Trazabilidad requirements ↔ tests

> **Verificado abriendo el test, no leyendo la tabla del informe:** las **21
> referencias de línea** del mapa de trazabilidad apuntan al `it(...)` que dicen.
> Comprobadas una a una: R1 (:120), R2 (:143, :157), R3 (:166), R4/R5 (:208),
> R6 (:254), R7 (:238), R8 (:269), R9 (:201), R10 (:354), R11 (:293), R12 (:308),
> R13 (:325, :341), R14 (:396), R15 (:410), R16 (:439, :466, :531),
> R20 (:497, :510), R22 (:521, :541). **Ninguna referencia rota, ningún nombre de
> test inventado.** Salvo indicación en contra, el test vive en
> [investments.model.test.ts](../../src/modules/investments/investments.model.test.ts).

- **R1** `InvestmentProduct` único con los datos comunes → [x]
  [:120](../../src/modules/investments/investments.model.test.ts#L120)
  `stores every common field of a product and defaults the currency to EUR (R1)`
  (comprueba `bank`, `name`, `type`, `currency` por defecto `EUR`, `openedAt`,
  `closedAt`, `createdAt`/`updatedAt`). **Reviewer sobre el schema:** no existe
  ningún modelo `Fund`, `Etf`, `Deposit` ni equivalente.
- **R2** enum con exactamente cuatro valores → [x]
  [:143](../../src/modules/investments/investments.model.test.ts#L143) (inserta
  uno de cada tipo **en la BD**) +
  [:157](../../src/modules/investments/investments.model.test.ts#L157)
  `Object.keys(InvestmentProductType)` en **igualdad exacta** con los cuatro, no
  `toContain`: detecta tanto un valor de menos como uno de más.
- **R3** los tres tipos que fluctúan con los mismos campos, sin desglose → [x]
  [:166](../../src/modules/investments/investments.model.test.ts#L166) compara los
  ocho campos de `fund`/`etf`/`managed_portfolio` con `toEqual` y afirma que no
  hay `parentId` ni `parentProductId`. **Reviewer sobre el schema:**
  `InvestmentProduct` no tiene ninguna relación consigo mismo.
- **R4** cuatro columnas del depósito, nullable en los demás → [x]
  [:208](../../src/modules/investments/investments.model.test.ts#L208)
  (las cuatro rellenas en el `deposit`, las cuatro `null` en el `fund`).
- **R5** `interestRate` = TAE en porcentaje, sin pérdida → [x] mismo test:
  `'2.7500'` → `.toFixed(4) === '2.7500'`. Comparación con `.toFixed`, **no** con
  `.toString()`: correcto — `toString()` habría pasado por casualidad quitando
  ceros. La semántica está en el schema
  ([schema.prisma:154](../../prisma/schema.prisma#L154)) y en
  [data-model.md:508](../../docs/data-model.md#L508).
- **R6** clave natural `(bank, name)` → [x]
  [:254](../../src/modules/investments/investments.model.test.ts#L254) (segunda
  alta → `P2002`; el mismo `name` bajo `bankinter` → se guarda y `count === 2`).
  Cubre las **dos** mitades del requirement.
- **R7** ciclo de vida solo con `closedAt` → [x]
  [:238](../../src/modules/investments/investments.model.test.ts#L238) (`null` y
  con fecha, más ausencia de `status`/`isClosed`). **Reviewer sobre el schema:**
  no hay enum de estado ni booleano de cierre.
- **R8** `Valuation` completa con precisión exacta → [x]
  [:269](../../src/modules/investments/investments.model.test.ts#L269) (los cinco
  importes con `.toFixed(2)`/`.toFixed(4)`; las cifras son **inventadas** desde la F14
  (2026-08-12): `8250.45` / `9500.60` / `1250.15` / `15.1525` / `75.25`).
- **R9** `invested` en la foto y no en el producto → [x]
  [:201](../../src/modules/investments/investments.model.test.ts#L201)
  (`Object.keys(fund)` sin `invested` y con `principal`) + la serie de
  [:354](../../src/modules/investments/investments.model.test.ts#L354).
  **Reviewer sobre el schema:** `InvestmentProduct` no declara `invested`.
- **R10** tres fotos sin pisarse, ordenadas → [x]
  [:354](../../src/modules/investments/investments.model.test.ts#L354). Detalle
  que hace el test **bueno**: las inserta **desordenadas** (mayo, marzo, abril) y
  exige el orden por `date asc`, así que verifica el `orderBy` y no el orden de
  inserción; comprueba las tres `invested` **y** los tres `marketValue`.
- **R11** negativos idénticos → [x]
  [:293](../../src/modules/investments/investments.model.test.ts#L293)
  (`-1234.56` y `-3.4700`).
- **R12** `uninvestedCash` ausente vs. presente → [x]
  [:308](../../src/modules/investments/investments.model.test.ts#L308) (las dos
  ramas en el mismo test).
- **R13** regla 4, nada calculado → [x]
  [:325](../../src/modules/investments/investments.model.test.ts#L325) guarda
  `gain '480.00'` cuando `12500.00 − 12000.00 = 500.00`, y exige `480.00` **y**
  `not.toBe('500.00')` — es exactamente la prueba que distingue "se guardó lo
  leído" de "se guardó lo calculado" — +
  [:341](../../src/modules/investments/investments.model.test.ts#L341) (ausente →
  `null`, no derivado).
- **R14** única `(productId, date)` → [x]
  [:396](../../src/modules/investments/investments.model.test.ts#L396) (`P2002` en
  el duplicado; misma fecha en otro producto sí; `count === 1`).
- **R15** recargar = UPSERT, gana el último → [x]
  [:410](../../src/modules/investments/investments.model.test.ts#L410): mismo
  `id`, `marketValue` nuevo, `count` sigue **1** y `updatedAt` **avanza**. El
  `setTimeout(10)` previo
  ([:419](../../src/modules/investments/investments.model.test.ts#L419)) es
  correcto y necesario: sin él, `TIMESTAMP(3)` podría dar el mismo milisegundo y
  el `>` pasaría o fallaría por azar.
- **R16** `Movement.productId` nullable + relación + índice → [x]
  [:439](../../src/modules/investments/investments.model.test.ts#L439) (recuperado
  con `include: { product: true }`, comprobando `name` y `type` del producto
  enlazado) + [:466](../../src/modules/investments/investments.model.test.ts#L466)
  (camino existente → `productId === null` y `product === null`) +
  [:531](../../src/modules/investments/investments.model.test.ts#L531)
  (`information_schema` → `is_nullable = 'YES'`).
- **R17** el flujo intacto → [x] **proceso**, verificado en §1.1 (77/0, `git diff`
  vacío en los tres módulos, ningún test del flujo modificado).
- **R18** regla 5 documentada → [x] **proceso**:
  [data-model.md:43](../../docs/data-model.md#L43) (regla 5, con la agregación
  `productId != null` y el reembolso como `income` + `productId`) y
  [data-model.md:484](../../docs/data-model.md#L484) (el aviso de que `productId`
  **no** sirve para derivar `invested`, que es justo el error que este modelo
  invita a cometer).
- **R19** servicios del flujo sin tocar → [x] **proceso**: `git diff` vacío en
  `src/modules/movements/`; el estado "documentada, no implementada" está escrito
  en [data-model.md:51](../../docs/data-model.md#L51).
- **R20** regla del servicio, sin `CHECK` → [x]
  [:497](../../src/modules/investments/investments.model.test.ts#L497) +
  [:510](../../src/modules/investments/investments.model.test.ts#L510)
  (`pg_constraint` con `contype = 'c'` → `[]`) + la regla escrita en
  [data-model.md:558](../../docs/data-model.md#L558).
- **R21** `marketValue` sin `uninvestedCash`, documentado → [x] **proceso**:
  [data-model.md:586](../../docs/data-model.md#L586) §Patrimonio (con la tabla
  aritmética de las muestras reales) y ADR-012 decisión 11
  ([architecture.md:748](../../docs/architecture.md#L748)).
- **R22** migración sobre base limpia → [x]
  [:521](../../src/modules/investments/investments.model.test.ts#L521) (las dos
  tablas en `information_schema`) +
  [:541](../../src/modules/investments/investments.model.test.ts#L541) (los tres
  índices por nombre en `pg_indexes`) + **`migrate deploy` sobre BD limpia
  ejecutado por el reviewer**, sin error.
- **R23** todo declarativo, cero SQL a mano → [x] grep sin `CHECK`/`DROP`/`ALTER
  COLUMN`, `migration.sql` con la forma del generador, y **`migrate diff` sin
  diferencias** (drift cero, comprobado contra una BD construida solo con
  migraciones).
- **R24** sin endpoints, módulo con un solo archivo → [x] **proceso**, §1.4.
- **R25 / R26 / R27** documentación → [x] **proceso**, §4.
- **R28** `init.sh` verde + mapa de trazabilidad → [x] ejecutado por el reviewer
  (220/220) + el mapa en
  [progress/implementations/investments-data-model.md](../implementations/investments-data-model.md) §3.

**Cobertura: 28/28 requirements. Ninguno se queda sin test concreto o sin
checklist explícito, y los 9 marcados "de proceso" lo son con razón: son
afirmaciones sobre el diff o sobre la documentación, no sobre el comportamiento
del sistema.**

---

## 3. Tasks completas

Las **20 tasks** de `specs/investments-data-model/tasks.md` están `[x]` y
**verificadas contra el árbol**, no solo marcadas:

- **T1** `[x]` schema: enum ([schema.prisma:58](../../prisma/schema.prisma#L58)),
  `InvestmentProduct` ([:138](../../prisma/schema.prisma#L138)), `Valuation`
  ([:172](../../prisma/schema.prisma#L172)) y el par `product`/`productId` +
  `@@index` dentro de `Movement` ([:123](../../prisma/schema.prisma#L123),
  [:131](../../prisma/schema.prisma#L131)). Comentarios en inglés y mínimos, con
  la unidad de `interestRate` marcada.
- **T2** `[x]` migración generada y no editada (§1.2). **T3** `[x]` cliente
  regenerado: el test importa `InvestmentProductType` de
  `src/generated/prisma/client.js`
  ([:8](../../src/modules/investments/investments.model.test.ts#L8)) y usa
  `app.prisma.investmentProduct` / `app.prisma.valuation`.
- **T4-T11** `[x]` los 23 tests del módulo, bloque a bloque, con el andamiaje
  pedido: `beforeAll` con `buildApp()`
  ([:49](../../src/modules/investments/investments.model.test.ts#L49)), limpieza
  `afterEach` en el orden `movement → valuation → investmentProduct → account`
  ([:55](../../src/modules/investments/investments.model.test.ts#L55)), nombres
  con sufijo aleatorio
  ([:44](../../src/modules/investments/investments.model.test.ts#L44)) y
  comparación de decimales con `.toFixed(n)` en **todas** las aserciones
  numéricas (revisadas una a una: no hay ni un `.toString()`).
- **T12** `[x]` [architecture.test.ts:81](../../src/architecture.test.ts#L81),
  entrada **aditiva** al array `expected` (las líneas anteriores del array no
  cambian) y **sin** el guardián prohibido.
- **T13 / T14 / T15** `[x]` docs (§4). **T16** `[x]` `progress/current.md` con la
  sesión, las columnas reservadas, el punto abierto cerrado y el deber del humano
  sobre la cuenta de MyInvestor.
- **T17 / T18 / T19** `[x]` typecheck, `format:check`, `lint`, `pnpm test` e
  `init.sh` **re-ejecutados por el reviewer**: los cinco verdes.
- **T20** `[x]` mapa de trazabilidad, con los requirements de proceso anotados
  como tales.

**Ninguna task saltada: no hace falta justificación.**

---

## 4. Documentación (R25, R26, R27)

- [x] **`docs/data-model.md`** — retitulado `# Modelo de datos` con la tabla de
  las dos partes; **cinco reglas** en el preámbulo común
  ([:19](../../docs/data-model.md#L19)), con la 4
  ([:37](../../docs/data-model.md#L37)) y la 5
  ([:43](../../docs/data-model.md#L43)) más el estado ⏳ de la 5
  ([:51](../../docs/data-model.md#L51)); `## Parte 1 — Flujo`
  ([:56](../../docs/data-model.md#L56)) y `## Parte 2 — Inversiones`
  ([:364](../../docs/data-model.md#L364)) con diagrama
  ([:382](../../docs/data-model.md#L382)), esquema Prisma real
  ([:418](../../docs/data-model.md#L418)), claves naturales y su precio
  ([:515](../../docs/data-model.md#L515)), UPSERT con la tabla comparativa contra
  el dedup del flujo y los **dos upserts** ([:531](../../docs/data-model.md#L531)),
  reglas de negocio ([:556](../../docs/data-model.md#L556)) y **patrimonio =
  `marketValue + uninvestedCash`** con la aritmética de las muestras
  ([:586](../../docs/data-model.md#L586)); tres filas nuevas en la tabla de
  columnas reservadas ([:212](../../docs/data-model.md#L212)); «Lo que NO está
  aquí» reescrita ([:625](../../docs/data-model.md#L625)). **Prosa de la Parte 1
  intacta**: el diff de esa parte son solo niveles de encabezado más lo que T13
  pedía (ver §7.3).
- [x] **`docs/architecture.md`** — **ADR-012** completa
  ([:661](../../docs/architecture.md#L661)), con las **cuatro decisiones
  delegadas** cubiertas de forma nominal: materialización en Prisma con precisión
  e índices (decisiones 1, 2, 7 y 10), claves naturales y recarga (5 y 6),
  vigilancia del depósito (9, marcada 🔴 confirmada) y la suposición
  `marketValue` / `uninvestedCash` (11, ✅ **confirmada: van aparte**). Incluye
  las alternativas descartadas —entre ellas "modelar productos como `Account` y
  valoraciones como `Movement`", que es la trampa que había que dejar escrita— y
  los límites conocidos. Árbol de carpetas con `investments/`
  ([:89](../../docs/architecture.md#L89)) y la nota de carpeta parcial.
- [x] **`docs/api-contract.md`** — una nota
  ([:168](../../docs/api-contract.md#L168)), **cero endpoints añadidos**, y el
  matiz correcto de que `Movement.productId` **no** sale en la respuesta porque
  `serializeMovement` mapea campo a campo. Comprobado en el código:
  `movements.service.ts` no cambió y no menciona `productId`.
- [x] **`docs/stack.md`** — sin cambios, y es lo correcto: cero dependencias y
  cero variables de entorno nuevas (`package.json` y `.env.example` intactos).

---

## 5. Arquitectura (`docs/architecture.md`)

- [x] **P1 — la capa HTTP no contiene lógica de negocio.** No hay capa HTTP nueva.
- [x] **P2 — el acceso a datos se aísla.** El único consumidor de los modelos
  nuevos es un test, que usa `app.prisma` igual que `movements.test.ts`. Los
  guardianes "ruta sin `prisma`" siguen verdes.
- [x] **P3 — errores explícitos.** Ninguna clase de error nueva, y ninguna hacía
  falta: esta feature no tiene servicio.
- [x] **P4 / P5** — `config/` y `plugins/` sin tocar.
- [x] **ADR-004 (vertical slice).** `modules/investments/` es una carpeta parcial
  **documentada** en el árbol ([architecture.md:89](../../docs/architecture.md#L89)),
  con precedente en `modules/health/`. Coherente.
- [x] **ADR-012 registrada** antes de cerrar, no después.
- [x] **"Qué NO hacer".** Sin `console.log`, sin `TODO`/`FIXME` en el módulo nuevo
  (grep limpio); ninguna dependencia nueva.

---

## 6. Convenciones (`docs/conventions.md`) y verificación (`docs/verification.md`)

- [x] **Idioma.** Esquema, campos, tipos, comentarios y nombres de test en inglés
  (`InvestmentProduct`, `marketValue`, `uninvestedCash`, `maturityDate`); prosa de
  los docs en español. Sin mezclas.
- [x] **Estilo e imports.** `format:check` y `lint` verdes; vendor → relativos con
  extensión `.js`; `import type { FastifyInstance }` para lo que solo es tipo.
- [x] **Nombres.** `investments.model.test.ts` en `kebab-case`, tipos
  `PascalCase`, helpers `camelCase`. El sufijo `.model.` es una decisión razonada
  y anotada en Procedencia.
- [x] **Tests: recursos reales, sin mocks.** Postgres real de `docker-compose`;
  las restricciones se prueban **provocando la violación** (`P2002`), no
  simulándola; los índices y el `CHECK` ausente se leen del **catálogo de
  Postgres**, que es la única forma de que "no hay SQL crudo" sea ejecutable y no
  una afirmación de buena fe.
- [x] **Output concreto, no "no lanza".** Todas las aserciones comparan valores
  exactos: `'2.7500'`, `'480.00'` con su `not.toBe('500.00')`, `'-3.4700'`,
  `toHaveLength(3)`, `code: 'P2002'`, `is_nullable = 'YES'`, `[]` de
  `pg_constraint`.
- [x] **Camino de error cubierto.** Dos violaciones de unicidad (`P2002` en
  producto y en foto) y las ramas `null` de las cinco columnas opcionales.
- [x] **Aislamiento.** `afterEach` borra en orden de FK y cada test se aísla por
  nombre aleatorio, no por `count()` global: correcto con Vitest en paralelo sobre
  una BD compartida (`@@unique([bank, name])` es global).
- [x] **Nivel 4 (trazabilidad)** cumplido y re-verificado en §2.

---

## 7. Las dos desviaciones declaradas por el implementer — juzgadas

### 7.1 `prisma format` deshecho sobre líneas preexistentes — **ACEPTADA**

Es la decisión correcta, y no por poco margen. Añadir un campo tan ancho como
`product InvestmentProduct?` hace que `prisma format` realinee **todo** el bloque
`model Movement`, incluidas líneas de la feature 8. Eso habría convertido el diff
en "77 inserciones + N borrados cosméticos" y habría hecho **inverificable** la
propia comprobación que R17 exige ("0 líneas borradas"), que es la garantía de que
el flujo no se tocó. Comprobado además que **nada en el repo ejecuta ni verifica
`prisma format`**: `format:check` es Prettier y no formatea `.prisma`
(`pnpm run format:check` verde). Coste real: cosmético, y ya existía antes de esta
feature. Bien anotado como sugerencia aislada; de acuerdo con dejarlo fuera.

### 7.2 Encabezados de la Parte 1 bajados un nivel — **ACEPTADA**

Es lo que T13 pedía literalmente ("envolver el contenido actual en
`## Parte 1 — Flujo`"): sin bajar los `##` a `###`, las secciones del flujo
quedarían colgando del documento y no de la parte. Revisado el diff sección por
sección: la **prosa no cambia** (`Cálculo del saldo`, `Traspasos`, `daySequence`,
`Índices personalizados` conservan su texto palabra por palabra) y los anclajes
tipo `#cálculo-del-saldo-de-una-cuenta` **siguen siendo válidos**, porque el slug
no depende del nivel del encabezado. Sin objeción.

### 7.3 Un tercer cambio en la Parte 1 que el informe no destaca — no bloqueante

La tabla de columnas reservadas de la Parte 1 no solo ganó tres filas: también se
**partió** la fila preexistente `daySequence, balanceAfter, origin` en dos
([data-model.md:210](../../docs/data-model.md#L210)) para reflejar que
`daySequence` lo emite ahora cada parser (F11). Es **factualmente correcto** y
coherente con la norma nueva de `docs/conventions.md` §"Cada parser emite
`daySequence` ya normalizado", pero va un paso más allá del "contenido intacto"
de T13, así que conviene que quede dicho. Dos nits que arrastra, ambos de una
línea y **no bloqueantes**:

1. `status` aparece **dos veces** en la tabla
   ([:209](../../docs/data-model.md#L209) y dentro de
   [:210](../../docs/data-model.md#L210)).
2. La nota de [:216](../../docs/data-model.md#L216) dice "las **dos** últimas
   filas son de la Parte 2" cuando son **tres**
   ([:212](../../docs/data-model.md#L212), [:213](../../docs/data-model.md#L213),
   [:214](../../docs/data-model.md#L214)).

---

## 8. CHECKPOINTS.md

- [x] **C1 — Arnés completo.** Archivos base y `docs/*` presentes; `./init.sh`
      ejecutado por el reviewer con exit code 0.
- [x] **C2 — Estado coherente.** Una sola feature `in_progress` (la 9; la 10 está
      en `spec_ready`, que no cuenta); las `done` tienen tests que pasan;
      `progress/current.md` describe la sesión activa y está al día.
- [x] **C3 — Arquitectura.** Árbol conforme a `docs/architecture.md` (actualizado
      en la misma feature); **cero dependencias nuevas**; sin logs de debug ni
      TODOs; convenciones respetadas (`lint` y `format:check` verdes).
- [x] **C4 — Verificación real.** 23 tests ejecutables para el modelo nuevo,
      contra el Postgres de `docs/verification.md`; camino feliz **y** de error
      (dos `P2002`, cinco ramas `null`); ninguno se limita a "no lanza".
- [x] **C5 — Sesión cerrada bien.** Los untracked son legítimos (la migración, el
      módulo nuevo, `specs/investments-data-model/` y el informe): ni temporales,
      ni builds, ni caches. `feature_list.json` refleja el estado correcto
      (`in_progress`, sin auto-marcar `done`). La entrada de
      `progress/history.md` es el paso de cierre del leader, posterior a esta
      review.
- [x] **C6 — Coherencia con proyectos hermanos.** El contrato **no cambia**:
      `docs/api-contract.md` solo gana la nota de "sin endpoints todavía" y deja
      dicho que `Movement.productId` no viaja en la respuesta. No hay endpoints ni
      modelos inventados fuera del contrato; nada que el frontend deba consumir
      todavía.
- [x] **C7 — SDD.** `specs/investments-data-model/` con los cuatro archivos;
      `decisions.md` cabe en una página y tiene los cuatro bloques (🔴 **2**
      puntos, por debajo del máximo de 6; ✅ 4; ⚙️ 7; 📌 2);
      `requirements.md` en EARS estricto y con la **sección de Procedencia
      completa**: los **28** requirements clasificados (`humano` / `delegado` /
      `añadido`), **ninguno sin clasificar**, y los ocho marcados
      `← REVISAR EN APROBACIÓN` que el humano usó en la puerta; las 20 tasks
      `[x]`; cada `R<n>` con test o checklist.
      *Salvedad anotada, no bloqueante:* 28 requirements superan el tope blando de
      ~15 de `docs/specs.md` §2 sin una frase que lo diga en voz alta en
      `decisions.md`. Es una observación **sobre el spec**, que ya pasó la puerta
      humana, no sobre la implementación; además 9 de los 28 son requirements de
      proceso y el resto es prácticamente "un requirement por columna". No hay
      nada accionable aquí para el implementer.
- [x] **C8 — Resumen de cierre escrito** en
      [progress/summaries/investments-data-model.md](../summaries/investments-data-model.md).

---

## 9. Observaciones no bloqueantes

Ninguna impide aprobar; se anotan para que no se pierdan.

1. **Los dos nits de la tabla de columnas reservadas** (§7.3): `status` duplicado
   y "las dos últimas filas" cuando son tres. Dos líneas de `docs/data-model.md`.
2. **`InvestmentProduct.openedAt` nace sin escritor previsto** y se quedará
   siempre `NULL`. Está documentado como tal
   ([data-model.md:214](../../docs/data-model.md#L214), ADR-012) y no es un
   problema —admitirlo en el fichero sería cero migración—, pero es la única
   columna del proyecto sin ningún candidato a escritor.
3. **`computeTotals` todavía no excluye `productId != null`** (divergencia
   consciente con cómo la F8 trató `transferId`). Correcto según R19, con efecto
   práctico **cero** hoy. **Deuda con fecha de caducidad clara:** el día que exista
   el escritor de `productId`, esa línea tiene que entrar **en la misma feature**,
   o las aportaciones empezarán a contar como gasto del mes.
4. **La regla del depósito no la vigila nadie todavía** (no hay servicio). El test
   la deja escrita como límite conocido; el importador de inversiones tendrá que
   implementarla, y mientras tanto el test de `pg_constraint` guarda que nadie la
   resuelva a escondidas con un `CHECK`.
5. **Deuda ajena a esta feature:** la F7 `parser-english` sigue sin
   `progress/summaries/parser-english.md` (C8), como ya señaló la review de la F8.

---

## 10. Cambios requeridos

**Ninguno.** La feature está lista para pasar a `done`, lo cual hace el
`implementer`, no el reviewer.
