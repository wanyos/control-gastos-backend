# Tasks — Feature 9: investments-data-model

> Checklist ordenada para el `implementer`. Cada task referencia los `R<n>` de
> `requirements.md` que cubre. Marcar `[x]` al completar; una task saltada exige
> justificación documentada (el reviewer rechaza si no).
>
> **Orden pensado para minimizar el tiempo en rojo:** esta feature es **aditiva**, así
> que la suite nunca debería llegar a estar rota. Primero el schema + la migración
> (aditivos: no rompen nada porque nadie usa aún los modelos nuevos), luego los tests
> del módulo nuevo bloque a bloque, luego la entrada en el árbol de
> `architecture.test.ts` (que **exige** que el archivo de test ya exista), y al final la
> documentación y la verificación.
>
> 🔴 **`pnpm`, NUNCA npm** (mezclarlos genera un `node_modules` distinto del que valida
> `init.sh`). 🔴 **Sin dependencias nuevas** ni variables de entorno nuevas. 🔴 **No
> toques `.env`.** 🔴 **La migración se GENERA** con
> `pnpm exec prisma migrate dev --name investments`: **ni una línea de SQL escrita a
> mano** (R23). 🔴 **Requiere Postgres levantado** (`docker compose up -d`,
> `localhost:5434`) para la migración y para los tests de integración. 🔴 **No toques
> ningún servicio del flujo** (`accounts`, `categories`, `movements`) ni `src/app.ts`
> (R17, R19, R24).
>
> 🔗 **Reconciliado con la antigua feature 10 `myinvestor-parser`**, hoy partida en
> [`specs/myinvestor-statement/`](../myinvestor-statement/tasks.md) (extracto `.csv`) y
> [`specs/myinvestor-products/`](../myinvestor-products/tasks.md) (JSON de producto;
> el balance para este esquema está en su
> [`design.md` §12](../myinvestor-products/design.md)), y con las **muestras reales del
> banco**
> (`var/drive-read/myinvestor/2026/`). **El esquema Prisma no cambia: ni una columna,
> ni un tipo, ni un índice, ni una precisión.** Consecuencias en esta lista: el archivo
> de test se llama **`investments.model.test.ts`**, y **T12 NO añade ningún guardián de
> "esta carpeta solo tiene un archivo"** (el módulo está diseñado para crecer).
> La feature 10 **no toca** `src/modules/investments/`: su código vive en
> `src/modules/myinvestor/`.
>
> ⏸️ **NO implementes hasta que el humano apruebe el spec** (`spec_ready` → puerta).

## Esquema y migración (aditivos: la suite sigue verde)

- [x] T1 — Modificar `prisma/schema.prisma` (**solo añadir**, `design.md` §2):
      (a) `enum InvestmentProductType { fund etf managed_portfolio deposit }`;
      (b) `model InvestmentProduct` con `id`, `bank`, `name`, `type`,
      `currency @default("EUR")`, `openedAt DateTime? @db.Date`,
      `closedAt DateTime? @db.Date`, las cuatro columnas nullable del depósito
      (`principal Decimal? @db.Decimal(10,2)`,
      `interestRate Decimal? @db.Decimal(6,4)` — 🔴 **TAE EN PORCENTAJE**,
      `expectedGain Decimal? @db.Decimal(10,2)`, `maturityDate DateTime? @db.Date`),
      las relaciones `valuations Valuation[]` y `movements Movement[]`,
      `createdAt`/`updatedAt` y `@@unique([bank, name])`;
      (c) `model Valuation` con `productId` (FK), `date DateTime @db.Date`,
      `invested`/`marketValue` (`Decimal(10,2)`, obligatorios),
      `gain Decimal? @db.Decimal(10,2)`, `gainPercent Decimal? @db.Decimal(7,4)`,
      `uninvestedCash Decimal? @db.Decimal(10,2)`, `createdAt`/`updatedAt` y
      `@@unique([productId, date])`;
      (d) dentro de `model Movement`, **junto a `transferId`**:
      `product InvestmentProduct? @relation(...)`, `productId Int?` y
      `@@index([productId])`.
      🔴 **No modifiques ninguna otra línea del schema.** Comentarios en inglés y
      mínimos (`docs/conventions.md`), incluyendo la unidad de `interestRate`.
      Cubre: R1, R2, R3, R4, R5, R6, R7, R8, R9, R14, R16, R17, R23.
- [x] T2 — Generar la migración: `pnpm exec prisma migrate dev --name investments`
      (con `docker compose up -d`). **No edites el `.sql` resultante.** Verificar que
      contiene solo `CREATE TYPE`, `CREATE TABLE "InvestmentProduct"`,
      `CREATE TABLE "Valuation"`, `ALTER TABLE "Movement" ADD COLUMN "productId"`, los
      `CREATE (UNIQUE) INDEX` y los `ADD CONSTRAINT` de las FKs — **ningún `DROP`,
      ningún `ALTER COLUMN` sobre el flujo, ningún `CHECK`, ningún bloque a mano**.
      Cubre: R17, R20, R22, R23.
- [x] T3 — Regenerar el cliente (`pnpm exec prisma generate`; `migrate dev` ya lo hace,
      confirmar) para que `src/generated/prisma/` exponga `investmentProduct`,
      `valuation` y el enum `InvestmentProductType`. Cubre: R1, R2, R8.

## Tests del módulo `investments` (único archivo del módulo)

> 🔴 **Se siembra con Prisma dentro del test** (`buildApp()` + `app.prisma`), sin
> `app.inject()`: no hay endpoints. Mismo patrón que
> `src/modules/movements/movements.test.ts`. Limpiar en `afterEach` en orden
> `movement` → `valuation` → `investmentProduct` → `account`, y usar nombres de
> producto con sufijo aleatorio (`@@unique([bank, name])` es global).
> ⚠️ Comparar `Decimal` con `.toFixed(2)` / `.toFixed(4)`, **nunca** con `.toString()`.

- [x] T4 — Crear `src/modules/investments/investments.model.test.ts` (🔗 con `.model.`
      en el nombre: la feature 10 pondrá cinco `investments.*` más en esta misma
      carpeta) con el andamiaje
      (`beforeAll` → `buildApp()` + `app.ready()`, `afterEach` de limpieza, `afterAll`
      → `app.close()`, helpers `createProduct` / `createValuation`) y el **alta de los
      cuatro tipos**: `fund`, `etf` y `managed_portfolio` con los mismos campos y las
      cuatro columnas de depósito a `null`; `deposit` con `principal`,
      `interestRate '2.7500'` (round-trip con `.toFixed(4)`), `expectedGain` y
      `maturityDate` rellenas. Test de que el enum generado tiene **exactamente** los
      cuatro valores. Test de `closedAt` a `null` y con fecha.
      Cubre: R1, R2, R3, R4, R5, R7.
- [x] T5 — Ampliar el test con la **clave natural del producto**: mismo
      `(bank, name)` → falla con `P2002`; el mismo `name` bajo otro `bank` → se
      guarda. Cubre: R6.
- [x] T6 — Ampliar con la **valoración completa**: `Valuation` con `invested`,
      `marketValue`, `gain`, `gainPercent` y `uninvestedCash` recuperados con su
      precisión exacta; `gain = '-1234.56'` y `gainPercent = '-3.4700'` **negativos**
      round-trip; `uninvestedCash` a `null` en un producto y con valor (`'250.00'`) en
      otro. Cubre: R8, R11, R12.
- [x] T7 — Ampliar con la **regla 4** (`design.md` §10): guardar una `Valuation` cuyo
      `gain` **no** cuadra con `marketValue − invested` (`invested '12000.00'`,
      `marketValue '12500.00'`, `gain '480.00'`) y exigir que se devuelva **`480.00`**,
      no `500.00`; y otra **sin** `gain` que se recupera `null`, no derivado.
      Cubre: R13.
- [x] T8 — Ampliar con la **serie de tres valoraciones** del mismo fondo en tres fechas
      (`2026-03-31` `invested '12000.00'`, `2026-04-30` `'12300.00'`, `2026-05-31`
      `'12600.00'`, con `marketValue` distinto en cada una): las tres se conservan, se
      leen con `orderBy: { date: 'asc' }` y **ninguna pisa a la anterior**. Es el test
      que demuestra que la serie histórica sobrevive a las aportaciones mensuales.
      Cubre: R9, R10.
- [x] T9 — Ampliar con la **clave de la foto y el recargado**: duplicado
      `(productId, date)` → `P2002`; misma `date` en productos distintos → ambas se
      guardan; y **`upsert`** sobre `(productId, date)` que cambia `marketValue` → el
      `id` es el mismo, el `count` del producto sigue siendo **1**, el valor es el
      nuevo y **`updatedAt` avanza**. Cubre: R14, R15.
- [x] T10 — Ampliar con el **enlace con el flujo**: sembrar una `Account` y un
      `Movement` con `productId` apuntando a un producto → se recupera con
      `include: { product: true }` enlazado; y un `Movement` creado por el camino
      existente (sin `productId`) → `productId === null`. Cubre: R16.
- [x] T11 — Ampliar con el **límite conocido del depósito** (`design.md` §8): persistir
      una `Valuation` sobre un producto `deposit` y comprobar que **hoy la BD no lo
      impide**. Comentario en el test dejando claro que documenta un límite conocido
      (la regla la vigilará el servicio) y que **saltará** si alguien añade un `CHECK`
      en silencio. Cubre: R20.

## Árbol de arquitectura (requiere que T4 ya exista)

- [x] T12 — Modificar `src/architecture.test.ts`: añadir
      `'modules/investments/investments.model.test.ts'` al array `expected` del test
      "contains the target tree of docs/architecture.md (ADR-004)", con un comentario de
      que `investments` es hoy una **carpeta parcial** a propósito (sin `routes`/
      `service`/`schema`/`types`: esta feature no abre superficie HTTP; precedente:
      `modules/health/`) y de que **la feature 10 añadirá más entradas a esta misma
      lista**. Es una entrada **aditiva**: no toques ninguna otra línea del array.
      Cubre: R24 (parcialmente; el alcance lo verifica el reviewer sobre el diff).

      🔴 **Lo que esta task NO hace, a propósito:** la versión anterior del spec pedía
      además un guardián `readdirSync('modules/investments') === [un solo archivo]`.
      **Se ha eliminado. No lo escribas.** `src/modules/investments/` está **diseñado
      para crecer**: la feature de **importación** pondrá ahí su servicio (el que enlaza
      productos, escribe `Valuation` y rellena `Movement.productId`) y luego llegarán
      las rutas de patrimonio. Un test que afirme "este módulo tiene exactamente un
      archivo" es incorrecto por construcción y solo obligaría a borrarlo. La lista
      `expected` de (a) sí es correcta: comprueba que un archivo **existe**, no que sea
      el único, así que crece sin romperse. El alcance de R24 lo verifica el reviewer
      sobre el diff.

## Documentación (R25, R26, R27)

- [x] T13 — Modificar `docs/data-model.md` (`design.md` §13): retitular a
      `# Modelo de datos`; mover la sección de reglas al preámbulo común, retitularla
      `## Las cinco reglas que explican el modelo` y añadir la **regla 4** (la
      valoración se lee, no se calcula) y la **regla 5** (una aportación no se crea, se
      marca, con la regla de agregación `productId != null`); envolver el contenido
      actual en `## Parte 1 — Flujo` **sin tocarlo**; escribir `## Parte 2 —
      Inversiones` con el diagrama, el esquema Prisma real, la clave natural
      `(bank, name)`, la resolución por **UPSERT** y su tabla comparativa con el dedup
      del flujo (más la nota de que el futuro importador necesita **dos upserts**: el
      del producto sobre `(bank, name)` y el de la foto), la regla de negocio "un
      depósito no tiene valoraciones" (vigilada por el servicio), la regla de cierre
      —**dejar de escribir un producto NO lo cierra**, `closedAt` explícito
      (`design.md` §7.1)— y ✅ **el hecho confirmado de que `marketValue` y
      `uninvestedCash` van aparte** (patrimonio = su suma, sin doble conteo, con la
      comprobación aritmética de la muestra real) más el cálculo del patrimonio neto y
      📌 la nota de que **para MyInvestor el saldo sale de `initialBalance`** porque su
      extracto no trae saldo por movimiento (`design.md` §9.1); añadir
      `Movement.productId`,
      `InvestmentProduct.closedAt` y `openedAt` (este último con la nota de que **se
      queda `NULL`**: el fichero no lo lleva) a la **tabla de columnas reservadas**
      (`docs/data-model.md:177`); y **reescribir** la sección «Lo que NO está aquí
      (fase siguiente)» (`docs/data-model.md:321-326`), que esta feature deja obsoleta
      (lo que queda fuera ahora: parser del fichero, importador, escritor de
      `productId` y consulta de patrimonio). Cubre: R18, R21, R25.
- [x] T14 — Modificar `docs/architecture.md`: añadir **ADR-012** (borrador completo en
      `design.md` §12: un solo `InvestmentProduct` con la parte del depósito en
      columnas nullable, `Valuation` como serie, `invested` en la foto, claves
      naturales, UPSERT, **cero SQL crudo**, sin `origin`/`status`, depósito sin
      valoraciones como regla de servicio, precisión decimal y TAE en porcentaje,
      regla de cierre por `closedAt` explícito, **dos upserts** para el futuro
      importador, ✅ `marketValue` sin `uninvestedCash` **confirmado**, una sola TAE por
      depósito, 📌 los dos hechos del extracto de MyInvestor (sin saldo por movimiento
      → `initialBalance` es el ancla; sin IBAN → alta manual prevista), y las
      alternativas descartadas);
      añadir `investments/` al árbol de «Estructura de carpetas» con
      `investments.model.test.ts`, anotando que hoy es una carpeta parcial (solo el
      test) y que **la completará la feature de importación** con su servicio.
      `docs/stack.md` **no** se toca (sin dependencias ni variables nuevas).
      Cubre: R21, R26.
- [x] T15 — Modificar `docs/api-contract.md`: **una nota**, sin endpoints nuevos — la
      capa de inversiones (`InvestmentProduct`, `Valuation`) existe en la base de datos
      pero **no expone endpoints todavía**; se documentará cuando una feature los abra
      (mismo patrón que el servicio interno de la feature 4). Cubre: R27.
- [x] T16 — Actualizar `progress/current.md`: feature en curso, columnas reservadas
      nuevas (`Movement.productId`, `InvestmentProduct.closedAt`/`openedAt`), ✅ el
      cierre del punto abierto de `marketValue`/`uninvestedCash` (van aparte,
      confirmado), y 📌 el aviso de que la futura cuenta de MyInvestor se dará de alta
      **a mano** y con un `initialBalance` correcto, porque su extracto no trae ni saldo
      ni IBAN (`design.md` §9.1). Cubre: R28.

## Verificación final

- [x] T17 — `pnpm run typecheck` en verde y `pnpm run format:check` en verde.
      Cubre: R28.
- [x] T18 — **`pnpm test` en verde** (con Postgres levantado): todos los tests nuevos
      pasan y **ningún test de `accounts`, `categories` o `movements` cambia de
      resultado ni de contenido** — es la prueba de que la capa es realmente aditiva.
      Cubre: R17, R19, R22.
- [x] T19 — **`bash ./init.sh`** termina con `[OK] Entorno listo` (typecheck + suite
      completa + validación de `feature_list.json`). Cubre: R22, R28.
- [x] T20 — Escribir el **mapa de trazabilidad** `R<n>` → test concreto en
      `progress/implementations/investments-data-model.md` (Nivel 4 de
      `docs/verification.md`) para **R1-R28**, anotando explícitamente que **R17, R18,
      R19, R21, R23, R24, R25, R26 y R27 son requirements de proceso** verificados por
      checklist del reviewer sobre el diff (no por test; el caso de **R24** tiene su
      razón escrita en el propio requirement), y que de **R9** solo se
      testea la parte observable (la serie de R10; el "no existe columna `invested` en
      el producto" lo verifica el reviewer sobre el schema). Cubre: R28.

## Fuera de esta feature (NO hacer)

- ❌ **Endpoints, rutas, servicios, schemas o tipos de inversiones.** Esta feature pone
  en `src/modules/investments/` **un solo archivo**: `investments.model.test.ts` (R24).
  `src/app.ts` no se toca.
- ❌ **Un guardián de "la carpeta `investments/` solo tiene un archivo"** (T12): el
  módulo está diseñado para crecer con el servicio del importador.
- ❌ **Parser de los archivos de MyInvestor e importador.** Sus formatos ya están
  definidos en [`specs/myinvestor-statement/`](../myinvestor-statement/requirements.md)
  (extracto `.csv`) y [`specs/myinvestor-products/`](../myinvestor-products/requirements.md)
  (un JSON por producto, plantillas en `docs/myinvestor-product-files.md`), pero **el
  código es de esas features** y vive en `src/modules/myinvestor/`, no aquí.
- ❌ **Escribir `Movement.productId` desde ningún sitio**, ni excluirlo de
  `computeTotals`: la regla 5 se **documenta** aquí y se **implementa** con su escritor
  (`design.md` §10; marcado como punto abierto en la puerta).
- ❌ **Tocar cualquier servicio del flujo** (`accounts`, `categories`, `movements`) o
  cualquier campo, índice o enum existente del schema (R17, R19).
- ❌ **SQL escrito a mano en la migración**, incluido cualquier `CHECK` para impedir
  valoraciones de un depósito (`design.md` §5, §8).
- ❌ **`units`, `unitPrice`, `isin`, `alias`, desglose de la cartera automatizada, enum
  `status`**: todos descartados a propósito (`design.md` §2.2, §7). Si algún día hacen
  falta, son `ADD COLUMN` nullable, sin migrar datos.
- ❌ **Consulta de patrimonio neto y dashboards** (idea #4) → features posteriores; aquí
  solo queda documentado el cálculo (`design.md` §9).
- ❌ **Tocar `../docs/ideas.md`** (nivel workspace, fuera de este repo): propuesto por el
  plan pero **fuera del alcance**; confirmar con el humano en la puerta
  (`design.md` §13).
