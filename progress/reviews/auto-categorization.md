# Review — feature 43 `auto-categorization`

**Veredicto:** APPROVED
Reviewer, 2026-09-06. Spec: `specs/43-auto-categorization/`. Informe del
implementer: `progress/implementations/auto-categorization.md`.

## Comandos ejecutados y qué salió

1. **`./init.sh` completo** (ejecutado por el reviewer, no fiado del informe) —
   exit code 0:

   ```
   [OK]    Type check OK (tsc sin errores)
   [OK]    Lint OK
   [OK]    Formato OK
    Test Files  60 passed (60)
         Tests  1169 passed (1169)
   [OK]    Todos los tests pasan
   [OK]    Entorno listo. Puedes empezar a trabajar.
   ```

   La suite incluye los dos guardianes (`src/no-real-data.test.ts`,
   `src/architecture.test.ts`) y la comprobación de `vitest.global-setup.ts`:
   todos en verde.

2. **La migración aplica limpia** — comprobado en la plantilla de test, que la
   suite re-migra con `prisma migrate deploy`:

   ```
   docker exec gastos-postgres psql -U postgres -d gastos_test_template \
     -tAc "SELECT migration_name FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 2;
           SELECT to_regclass('public.\"CategoryRule\"') IS NOT NULL;"
   → 20260906120000_category_rule   (la más reciente aplicada)
   → t                              (la tabla existe)
   ```

3. **La base real NO se tocó** (ni migración ni siembra):

   ```
   docker exec gastos-postgres psql -U postgres -d gastos \
     -tAc "SELECT to_regclass('public.\"CategoryRule\"') IS NOT NULL;"
   → f   (la tabla no existe en `gastos`; la última migración aplicada ahí es
          20260905163246_movement_undone_transfer_id)
   ```

4. **Muestreo del seed** — `defaultCategoryRules` tiene exactamente 61 entradas
   (`grep -c "matchText: '"` → 61). Leídas una a una: todas son marcas públicas
   (mercadona, netflix, iberdrola, renfe…) o palabras genéricas de extracto
   español (alquiler, farmacia, nomina, devolucion), de 1-2 palabras, ya
   normalizadas. Ningún concepto multi-palabra que pueda venir de un extracto
   real. Además el test «every draft rule is normalized, unique, at least 3
   chars…» impone máx. 2 palabras y ≥3 caracteres, y el guardián de datos
   reales pasó dentro de la suite.

## Checklist específica del encargo

1. **Migración** `20260906120000_category_rule` — SOLO la tabla `CategoryRule`
   (CREATE TABLE + unique en `matchText` + FK `Restrict` a `Category`), SQL
   coherente con `prisma/schema.prisma:110-118`. Aplica limpia (comando arriba).
2. **CRUD `/api/category-rules`** — validaciones vistas en código y en tests
   verdes: contiene normalizado (`normalizeForMatch`, NFD sin diacríticos +
   lowercase + trim), mínimo 3 tras normalizar (400), duplicado normalizado
   (409), categoría inexistente (404), kind acorde en la pasada.
   `assertOnlyAllowedBodyProperties` en POST y PATCH
   (`category-rules.routes.ts:48-50,67-69`), con test del 400 por propiedad
   desconocida en ambos.
3. **La pasada corre en las dos vías de importación** (tras `detectTransfers`:
   `import.service.ts:437`, `import.local.service.ts:134`) **y bajo demanda**
   (`POST /api/category-rules/apply`), resultado `categorization` siempre
   presente en el informe (tests en `import.service.test.ts:743` y el describe
   de `import.local.service.test.ts:810`).
4. **Conflicto de dos reglas** → no asigna, sale listado con reglas y
   categorías; test «assigns nothing on a conflict of two categories… (R9,
   R10)». Dos reglas de la misma categoría = acuerdo, con test propio.
5. **Protección** — elegibilidad en el WHERE (`categoryId: null`,
   `pending_review`, tipo gasto/ingreso) + re-chequeo en cada `updateMany`;
   solo `categoryId` en `data` (`category-rules.service.ts:223-226`). Tests:
   fila entera antes/después + totales de `GET /api/movements` idénticos (R14),
   y protegidos categorizado/confirmado/neutral (R8).
6. **Idempotencia** — test R11 compara las filas enteras (incluido `updatedAt`)
   tras la segunda pasada: 0 categorizados, base idéntica.
7. **Borrados** — categoría con reglas → 409 con el recuento
   (`categories.service.ts:105-114`, test F43 R16); borrar regla no
   des-categoriza (test R5, comprueba el movimiento después).
8. **Seed** — idempotente por `skipDuplicates` (test: segunda ejecución crea
   0), huérfanas listadas en `missingCategories` sin sembrar (test con «Ocio»
   borrada), NO ejecutado contra la base real (comando 3 arriba), 61 reglas
   públicas (comando 4 arriba).
9. **Vocabulario** — «la pasada», «regla», «movimiento elegible» son
   descripciones literales declaradas en el spec, no términos nuevos; nada
   fuera de `docs/vocabulario.md` usado como nombre.

## Trazabilidad R1–R16

Verificada la tabla del informe del implementer contra los tests reales
(leídos los 3 archivos de test): cada R tiene al menos un test concreto y el
nombre citado existe. Las 11 tasks de `tasks.md` están `[x]`.

## Desviaciones declaradas — juzgadas

- **Migración escrita a mano, sin `migrate dev` contra la base real** —
  ACEPTADA. Es la única forma de no tocar la base del humano; que aplica limpia
  está comprobado con `migrate deploy` sobre la plantilla (comando 2). Queda a
  cargo del humano `pnpm run prisma:migrate` antes de sembrar.
- **1 regla en «Transferencias a personas» y «Nómina» (vs ~2-6 del design)** —
  ACEPTADA. El design dice «~2-6» y la razón es sólida: `bizum` y `nomina` son
  los únicos marcadores públicos naturales; el ajuste fino es del humano por
  API.
- **`updatedAt` cambia al categorizar** — ACEPTADA. Es el `@updatedAt`
  automático de Prisma (mismo comportamiento que la F44); el test de R14 lo
  documenta y excluye explícitamente.

## CHECKPOINTS

- C1 ✅ (`./init.sh` exit 0, docs presentes). C2 ✅ (una sola `in_progress`, la
  43). C3 ✅ (módulo `category-rules` sigue el patrón de `transfers`; sin
  dependencias nuevas; sin logs sueltos — el `console` del CLI de seed es la
  excepción consciente ya establecida en `src/server.ts`). C4 ✅ (caminos feliz
  y de error en CRUD y pasada). C4 bis — no aplica: no hay parser nuevo ni
  lectura de ficheros del humano; la prueba real del cierre (apply sobre su
  base) queda anotada como paso del humano. C5 — pendiente del cierre de sesión
  del leader (history.md y estado `done` los pone el implementer/leader al
  cerrar). C6 ✅ (`api-contract.md` actualizado: 5 endpoints, campo
  `categorization`, 409 nuevo). C7 ✅ (4 archivos de spec; decisions.md en una
  página con 6 puntos 🔴 y alternativas; 16 requirements con la razón del nº 16
  dicha en requirements.md y decisions.md §⚙️4; EARS; procedencia completa,
  cada R clasificado; tasks todas `[x]`; R1–R16 cubiertos). C8 ✅
  (`progress/summaries/auto-categorization.md` escrito).

## Hallazgos

Ninguno bloqueante. Observación menor (severidad: baja, ya declarada por el
implementer como fuera de scope): `POST /api/category-rules/apply` acepta y
aparta cualquier body sin 400; mismo comportamiento laxo que otros POST de
acción del proyecto. Si se quiere endurecer, es un cambio aparte.

Resumen de cierre: `progress/summaries/auto-categorization.md`.
