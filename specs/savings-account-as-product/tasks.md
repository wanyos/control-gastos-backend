# Tasks — F26 `savings-account-as-product`

> **Material del `implementer` y del `reviewer`.** La hoja del humano es
> [`decisions.md`](decisions.md).
>
> Cuatro lotes. Los conjuntos de `Archivos:` **no se solapan**: A, B y D pueden
> lanzarse a la vez; C espera a A y a B. Cada lote termina con `./init.sh` en
> verde por su cuenta.

---

## Lote A — esquema, migración y servicio de persistencia
Archivos: `prisma/schema.prisma`, `prisma/migrations/**`,
`src/modules/investments/investments.types.ts`,
`src/modules/investments/investments.service.ts`,
`src/modules/investments/investments.service.test.ts`,
`src/modules/investments/investments.model.test.ts`,
`src/architecture.test.ts`
Depende de: —

- [x] T1 — Añadir `savings_account` al enum `InvestmentProductType` y el modelo
  `SavingsSnapshot` (cinco importes `Decimal(10,2)` NOT NULL, `@@unique([productId,
  date])`, FK a `InvestmentProduct`, relación inversa `savingsSnapshots`). Cubre: R1, R2.
- [x] T2 — Generar la migración **aditiva** (`ALTER TYPE … ADD VALUE` en su propia
  sentencia, `CREATE TABLE`, índice único y FK). Sin backfill: las dos tablas están
  vacías. Cubre: R1, R2.
- [x] T3 — Ampliar `investments.model.test.ts`: el enum admite el quinto valor, la
  clave `(productId, date)` rechaza el duplicado, los cinco importes son NOT NULL, y
  ninguna tabla del flujo cambia de forma. Cubre: R1, R2, R14.
- [x] T4 — Declarar `SavingsSnapshotInput`, `ProductParserAdapter`,
  `ProductParserRegistry` y `ProductImportResult` en `investments.types.ts`
  (firmas en `design.md` §4). Cubre: R4, R5, R13.
- [x] T5 — Implementar `persistSavingsSnapshot`: los **dos upserts** —producto sobre
  `(bank, name)`, foto sobre `(productId, date)`— dentro de un `prisma.$transaction`,
  con los importes como `string` (`toFixed(2)`) y las fechas con `T00:00:00.000Z`.
  Devuelve si producto y foto se **crearon** o se **actualizaron**. Cubre: R4, R5, R13.
- [x] T6 — Test de upsert del producto y de la foto con fixture sintético: valores
  guardados **tal cual**, nada calculado. Cubre: R4, R5.
- [x] T7 — Test de idempotencia: dos pasadas del mismo `(name, date)` dejan 1 producto
  y 1 foto, con los valores de la segunda. Cubre: R6.
- [x] T8 — Test de serie: `(name, date+1 mes)` reutiliza el producto y añade una foto.
  Cubre: R7.
- [x] T9 — Test de la regla de servicio: `persistSavingsSnapshot` no escribe ninguna
  `Valuation`, y ningún camino escribe `SavingsSnapshot` para un producto que no sea
  `savings_account`. Cubre: R3.
- [x] T10 — Test de que `persistSavingsSnapshot` no toca `Account` ni `Movement`:
  recuentos idénticos antes y después. Cubre: R14.
- [x] T11 — Guardián nuevo en `architecture.test.ts`: `src/modules/investments/` es el
  único lugar de `src/` que escribe en `investmentProduct` y `savingsSnapshot`; y el
  guardián de «trade-republic sin base de datos» sigue verde. Cubre: R3, R15.

## Lote B — el adaptador del banco (sin base de datos)
Archivos: `src/modules/trade-republic/trade-republic.service.ts`,
`src/modules/trade-republic/trade-republic.service.test.ts`
Depende de: —

- [x] T12 — Exportar el paso que hoy es privado `parseAccountFile` como
  `parseTradeRepublicProductFile(fileName: string, content: Buffer)`: decodifica en
  UTF-8 estricto, parsea y lanza `ValidationError` con el motivo **íntegro**. Sin
  archivos nuevos en el módulo y **sin ninguna mención a la base de datos**.
  `parseLocalTradeRepublicCopies` sigue usándolo y no cambia de comportamiento.
  Cubre: R8, R15.
- [x] T13 — Test: la función exportada lanza con el motivo completo para cada caso de
  rechazo (descuadre de los cinco importes, marcador `<…>`, campo ausente, número como
  texto, fecha inválida, clave desconocida, `type` erróneo, bytes no UTF-8), y devuelve
  la cuenta con los cinco importes cuando el archivo es bueno. Cubre: R8.
- [x] T14 — Test de no-regresión de `POST /api/parser/trade-republic`: sigue escribiendo
  `var/parsed/trade-republic/<año>/products.json` y **no** persiste nada. Cubre: R15.

## Lote C — la vía de entrada: `POST /api/import` y su hermana local
Archivos: `src/modules/import/import.types.ts`,
`src/modules/import/import.service.ts`,
`src/modules/import/import.service.test.ts`,
`src/modules/import/import.local.service.ts`,
`src/modules/import/import.local.service.test.ts`,
`src/modules/import/import.routes.ts`,
`src/modules/import/import.routes.test.ts`,
`src/modules/import/import.local.routes.test.ts`,
`src/app.ts`
Depende de: Lote A y Lote B

- [x] T15 — Añadir al informe de archivo los campos `product` y `snapshot` (id, nombre,
  fecha, creado o actualizado) en `import.types.ts`. Cubre: R13.
- [x] T16 — `selectProductAdapter(productParsers, bankSlug, fileName)`, gemelo de
  `selectAdapter`, y `importProductFile(...)`: parsea, persiste con
  `persistSavingsSnapshot` y devuelve el informe. Nunca lanza: un fallo vuelve como
  `status: 'failed'` con su motivo. Cubre: R8, R9, R13.
- [x] T17 — Bifurcar `importPending`: extracto → productos → `skipped`. El movimiento a
  `procesados/` ocurre **solo** después de escribir producto y foto. Cubre: R10, R12.
- [x] T18 — Bifurcar `importLocalCopies` con la misma regla, sin ninguna petición a
  Drive y sin mover ni borrar nada. Cubre: R11.
- [x] T19 — `import.routes.ts` acepta e inyecta `productParsers`; `src/app.ts` construye
  el registro con la única entrada `{ bank: 'trade-republic', extensions: ['.json'] }`.
  Cubre: R10, R11.
- [x] T20 — Guardián en `import.routes.test.ts`: para cada banco, la intersección de
  extensiones entre los dos registros es vacía. Cubre: R10.
- [x] T21 — Test: un `.json` de `trade-republic` deja de reportarse como `skipped`, se
  persiste y se mueve a `procesados/`. Cubre: R10, R12, R13.
- [x] T22 — Test: un `.json` que **no cuadra** se reporta `failed` con el motivo del
  parser, `movedToProcessed: false`, y no deja ni producto ni foto en la base.
  Cubre: R8, R9, R12.
- [x] T23 — Test de la vía local: el mismo `.json` reimportado desde
  `var/drive-read/trade-republic/<año>/` persiste sin tocar Drive, y una segunda pasada
  no duplica. Cubre: R11, R6.
- [x] T24 — Test de no-regresión de la importación de extractos: mismos recuentos,
  mismo movimiento a `procesados/`, mismo contrato, y `Account`/`Movement` intactos.
  Cubre: R14.

## Lote D — documentación
Archivos: `docs/api-contract.md`, `docs/architecture.md`,
`docs/trade-republic-product-files.md`, `docs/roadmap.md`
Depende de: —

- [x] T25 — `docs/api-contract.md`: `POST /api/import` y `POST /api/import/local`
  reportan archivos de producto, con la forma de `product`/`snapshot` y sus errores;
  §Inversiones deja de decir «sin endpoints todavía». Cubre: R10, R11, R13.
- [x] T26 — `docs/architecture.md`: **ADR-026** (cuenta remunerada como
  `InvestmentProductType` nuevo, `SavingsSnapshot` como serie propia, segundo registro
  en el importador, `var/parsed/` como ensayo), con sus alternativas descartadas; y
  nota en ADR-012 de que su contrato de «dos upserts» ya tiene ejecutor. Cubre: R1, R2, R10.
- [x] T27 — `docs/trade-republic-product-files.md`: «Dónde acaba lo que escribes» pasa
  a terminar en la base de datos; `var/parsed/` se documenta como **ensayo**, no como
  destino. **La plantilla no cambia**: ni un campo nuevo, IBAN incluido. Cubre: R15.
- [x] T28 — `docs/roadmap.md`: tachar el cabo suelto de «lo que dejo en Drive no llega
  a la base» para Trade Republic y dejar dicho que MyInvestor sigue pendiente.
  Cubre: R14.
