# Review — feature 54 `unparsed-row-review`

## Review (2026-10-02)

**Veredicto:** APPROVED
Comprobado: requirements ↔ tests, arquitectura, convenciones, verificación,
CHECKPOINTS C1-C8. Checks: 8 de 8 en verde.
Sin hallazgos.
Resumen de cierre: `progress/summaries/unparsed-row-review.md`.

### Con qué comando y qué salió

| Qué | Comando | Resultado |
|---|---|---|
| Pasada completa | `./init.sh` | código de salida 0; tipos, lint y formato en verde; `Test Files 70 passed (70)`, `Tests 1302 passed (1302)` (partida: 70 y 1286) |
| `checks` | `./init.sh --checks 54` | código de salida 0, «Checks: 8 de 8 en verde». Los checks 1-5 imprimen `Tests 1 passed \| 20 skipped (21)`, el 6 `1 passed \| 14 skipped (15)`, el 7 `1 passed \| 13 skipped (14)`: cada uno ejecutó exactamente su test. Los siete acaban en `grep -E "Tests +1 passed"`, así que no pueden salir con 0 sin ejecutar un test |
| Migraciones en la base `gastos` de `localhost:5434` (solo lectura) | `pnpm exec prisma migrate status` | código de salida 0, «11 migrations found», «Database schema is up to date!» |
| Tabla de migraciones (solo lectura) | `select … from "_prisma_migrations"` con `docker exec gastos-postgres psql` | 11 filas, todas terminadas, ninguna revertida; la última es `20261002120000_unparsed_row_review` |
| Tabla de la feature (solo lectura) | `select count(*) from "ImportUnparsedRow"` y `information_schema.columns` | 0 filas; `status` no nula con valor por defecto `'pending'`, `note` texto que admite nulo, `reviewedAt` fecha que admite nulo |
| Esquema contra base (solo lectura) | `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` | ninguna diferencia en `ImportUnparsedRow`. Sale una sola línea, de `Movement.descriptionSearch`, que no es de esta feature (el informe del implementer ya la apunta) |

No he escrito en la base `gastos`.

### Lo demás que se miró, sin hallazgos

- **`checks` ↔ tabla 🧪 de `decisions.md` ↔ `tasks.md`:** las siete frases tienen
  su check (la segunda, dos: la lista y el contador) más la suite entera; los
  siete nombres de test son literalmente los de `tasks.md` y existen.
- **Los cinco puntos 🔴:** 1 → `marks an unreadable row reviewed with its note and
  returns it serialized` y `registers the unreadable-row review route…`;
  2 → `marks an unreadable row reviewed without any note` y el caso de 501
  caracteres del test de los 400; 3 → `lists a reviewed unreadable row as
  reviewed…`; 4 → `counts only the unreadable rows still pending`;
  5 → `data-model: describes ImportUnparsedRow with its review columns`.
- **Migración:** leído el SQL, un `ALTER TABLE` con tres `ADD COLUMN` y nada
  más; coincide con las tres columnas de `prisma/schema.prisma`.
- **Reimportar:** `src/modules/import/import.warnings.service.ts:117`, el
  `update` escribe solo `reason` y `updatedAt`; lo demuestra `reimporting does
  NOT take the reviewed mark nor the note off an unreadable row`. No he repetido
  la prueba del implementer de romper ese `update` a propósito: exige editar
  código, que no me corresponde.
- **Tests de antes:** `import.service.test.ts` e `import.routes.test.ts` no están
  en el diff. En los tres `import.warnings.*.test.ts` el único cambio sobre un
  test existente es la lista `unparsedRowFields` (de cinco a ocho campos), que
  es el que pide T7; lo demás son líneas añadidas.
- **Lección 2:** el bloque Prisma de `docs/data-model.md` coincide columna a
  columna con `prisma/schema.prisma` en los dos modelos (leídos los dos); las
  dos entidades están en el diagrama; las dos claves naturales, en la tabla de
  la sección nueva (opción que `design.md` §4 admite). «Columnas reservadas» no
  cambia: las tres nacen con escritor. `ImportUnparsedRow.note` está en
  `comparedColumns` de `src/lib/test-real-data.ts` y `docs/conventions.md` lo
  dice.
- **Documentos:** `docs/api-contract.md` (ruta nueva, lista y contador),
  `docs/roadmap.md` (cabo 23 cerrado, «descartado por el humano»),
  `docs/architecture.md` (línea de revisión encima del ADR-031, cuerpo intacto).
- **`src/modules/import/import.routes.ts`:** el comentario lista las tres rutas
  que hoy registra `import.warnings.routes.ts`. Ningún código cambia.
- **Alcance:** ningún archivo del motor del harness en el diff; en
  `gastos-frontend/src` no aparece `import/warnings` ni `unparsed-rows`; ningún
  dato real en el diff ni en el informe (los ejemplos y notas son inventados);
  ninguna palabra corta nueva («guardián» y «aviso» están en
  `docs/vocabulary.md`).

### Una línea que vi y no cuento como hallazgo

`docs/api-contract.md:2062` sigue diciendo «estas dos rutas son la forma de
consultarlos y de darlos por revisados». Está dentro de la nota fechada de la
feature 48 (2026-09-18), y en el mismo bloque, justo debajo, la nota fechada de
la feature 54 nombra la tercera ruta. La leo como historia fechada, igual que el
cuerpo del ADR-031. Si el leader prefiere que esa frase diga «tres», es un
cambio de una palabra para el `implementer`.
