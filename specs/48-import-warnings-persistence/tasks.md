# Tasks — F48 `import-warnings-persistence`

> Cuatro lotes. B y C dependen de A y **entre sí no comparten archivos**: van en
> paralelo. D depende de los dos, porque documenta lo que ellos dejan escrito.
> Los `Archivos:` de los cuatro lotes no se solapan.

## Lote A — modelo, migración y servicio de avisos
Archivos: `prisma/schema.prisma`, `prisma/migrations/**` (nueva),
`src/modules/import/import.warnings.service.ts` (nuevo),
`src/modules/import/import.warnings.types.ts` (nuevo),
`src/modules/import/import.warnings.service.test.ts` (nuevo)
Depende de: —

- [x] T1 — `enum ImportWarningStatus`, `model ImportUnparsedRow` y
      `model ImportBalanceMismatch` con sus dos `@@unique` nombrados (`map:`, por
      el límite de 63 caracteres de Postgres) y la relación inversa en `Account`;
      `pnpm prisma migrate dev --name import_warnings`. Cubre: R1, R2, R6.
- [x] T2 — `persistImportWarnings`: un `upsert` por aviso dentro de una
      transacción por archivo; el `update` **no** toca `status`, `note` ni
      `reviewedAt`; sin avisos no abre transacción. Cubre: R1, R2, R6, R7, R8.
- [x] T3 — `listPendingImportWarnings`: descuadres con `status: 'pending'`, todas
      las filas ilegibles, orden `createdAt DESC, id DESC`, `counts`, y la
      serialización (`difference` calculado, importes como string de dos
      decimales, `date` date-only, `accountAlias` de la relación). Cubre: R9, R10.
- [x] T4 — `reviewBalanceMismatch`: aplica `status` y/o `note`, escribe
      `reviewedAt` al pasar a revisado, `NotFoundError` si el id no existe.
      Cubre: R11, R12, R13.
- [x] T5 — Tests de servicio: alta de los dos tipos de aviso; reimportación del
      mismo archivo que no duplica (R6); reimportación que respeta un revisado
      (R7); archivo sin avisos que no guarda nada (R8); lista que excluye los
      revisados (R10); marcado y desmarcado con nota (R11, R12); id inexistente
      (R13). Cubre: R1, R2, R6, R7, R8, R9, R10, R11, R12, R13.

## Lote B — capa HTTP
Archivos: `src/modules/import/import.warnings.routes.ts` (nuevo),
`src/modules/import/import.warnings.schema.ts` (nuevo),
`src/modules/import/import.warnings.routes.test.ts` (nuevo),
`src/modules/import/import.routes.ts`
Depende de: Lote A

- [x] T6 — `GET /api/import/warnings` y
      `PATCH /api/import/warnings/balance-mismatches/:id` en un plugin propio,
      registrado desde `import.routes.ts` bajo el prefijo `/api/import` que ya
      existe (`src/app.ts` no se toca). La ruta no importa Prisma: llama al
      servicio del lote A. Cubre: R9, R11, R12.
- [x] T7 — Esquemas JSON Schema con `additionalProperties: false`, `status` como
      enumeración de dos valores, `note` `maxLength: 500` y al menos una de las
      dos propiedades en el body. Cubre: R14.
- [x] T8 — Tests de integración con `buildApp()` + `app.inject()` contra la base
      desechable: `200` con las dos listas y sus `counts`; `200` del marcado y
      del desmarcado; `404` con id inexistente; `400` con body vacío, con
      propiedad de más y con `status` fuera de la enumeración. Cubre: R9, R10,
      R11, R12, R13, R14.

## Lote C — enganche en las dos entradas de la importación
Archivos: `src/modules/import/import.service.ts`,
`src/modules/import/import.local.service.ts`,
`src/modules/import/import.service.test.ts`,
`src/modules/import/import.local.service.test.ts`
Depende de: Lote A

- [x] T9 — `ImportStatementDeps` gana `file: { bank, year, name }` y los dos
      llamadores se lo pasan; llamada a `persistImportWarnings` dentro del `try`,
      después de las dos comprobaciones de saldo y antes de
      `result.status = 'imported'`. Cubre: R1, R2, R4, R5.
- [x] T10 — Tests del camino de Drive: un archivo con filas ilegibles y al menos
      un movimiento sigue saliendo `imported`, con `movedToProcessed: true` y los
      mismos contadores que antes, **y además** deja sus avisos guardados; un
      archivo `failed` no deja ninguno; un fallo al guardar los avisos deja el
      archivo `failed` y sin mover. Cubre: R1, R2, R3, R4, R5.
- [x] T11 — Test del camino local (`POST /api/import/local`): la misma
      reimportación deja los avisos con el mismo archivo de origen y no los
      duplica. Cubre: R1, R2, R6.

## Lote D — contrato y decisión de arquitectura
Archivos: `docs/api-contract.md`, `docs/architecture.md`,
`src/modules/import/import.warnings.docs.test.ts` (nuevo)
Depende de: Lote B, Lote C

- [x] T12 — Sección nueva en `docs/api-contract.md` con las dos rutas, la forma
      exacta de las respuestas, los errores (`404 NOT_FOUND`,
      `400 VALIDATION_ERROR`, sin códigos nuevos) y la nota de que la consulta
      **no** pagina. **Es la fuente de verdad del frontend: se actualiza en esta
      misma feature, no después.** Cubre: R15.
- [x] T13 — Test que lee `docs/api-contract.md` y exige que nombre las dos rutas
      y los campos de las dos listas (patrón de `*.docs.test.ts` ya en uso).
      Cubre: R15.
- [x] T14 — ADR-031 en `docs/architecture.md` (los avisos se guardan como hecho
      congelado, con su clave natural, y los cierra el humano) y nota en ADR-030
      diciendo que su decisión 3 queda superada por él. Cubre: — (documentación
      de la decisión; sin test, es prosa de un ADR).
