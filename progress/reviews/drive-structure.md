# Review — feature 4 `drive-structure`

**Veredicto:** APPROVED

Revisado contra `specs/drive-structure/{requirements,design,tasks}.md`, el informe
`progress/implementations/drive-structure.md`, el código y los docs. `bash ./init.sh`
ejecutado por el reviewer: **verde** (`[OK] Entorno listo`, typecheck + 95 tests en
9 files, exit 0).

## Trazabilidad requirements ↔ tests (SDD)

Verificado abriendo los tests (no solo la tabla del informe), con foco en R críticos.

- R1: [x] `env.test.ts` config completa (driveRootFolderId en el toEqual) + `exposes the Drive root folder id under config.driveRootFolderId`
- R2: [x] `env.test.ts` `throws naming GOOGLE_DRIVE_ROOT_FOLDER_ID when missing/empty` + `lists ... alongside the other missing problems`
- R3: [x] `drive-structure.test.ts` `createBank ... (R27)` (parents:[root]) + `ensureBankYearFolders ... never the bank or root (R3,R4,R5)` (1er create = año con parents:[bank-id])
- R4: [x] `ensureFolder creates ... when none exists (R4)` + `ensureBankYearFolders (R3,R4,R5)`
- R5: [x] `ensureBankYearFolders (R3,R4,R5)` (toEqual de los tres ids)
- R6: [x] `ensureFolder reuses an existing folder without creating (R6)`
- R7: [x] `ensureFolder creates each folder at most once under concurrent calls (R7)`
- R8: [x] `ensureFolder reuses the oldest folder when duplicates exist (R8)` + `resolveBankFolder reuses the oldest bank folder (R8)`
- R9: [x] `uploadFile creates a new file ... returns its id (R9)`
- R10: [x] `uploadFile never overwrites ... two independent files (R10)` (2 create, 2 ids, nunca update)
- R11: [x] `moveFileToProcessed ... via addParents/removeParents (R11)`
- R12: [x] `ensureFolder wraps a Drive failure in a sanitized DriveConnectionError (R12)` (token `1//fake-token-value` no aparece en el message)
- R13: [x] `ensureBankYearFolders converges after a partial failure ... never recreating it (R13)`
- R14: [x] `normalizeBankName lowercases and dashes ... (R14)` + `neutralizes path traversal and quotes (R14)`
- R15: [x] `normalizeBankName rejects empty, too-long and reserved names (R15)` + `invalid slug throws ValidationError without touching Drive`
- R16: [x] `validateYear accepts a 4-digit year in range and returns it (R16)`
- R17: [x] `validateYear rejects malformed or out-of-range years (R17)` + `ensureBankYearFolders rejects an invalid year without touching Drive (R17)`
- R18: [x] `architecture.test.ts` `keeps src/lib/drive-structure.ts free of data access (no "prisma") (R18)`
- R19: [x] `architecture.test.ts` `free of Drive auth wiring (R19)` + guardián `reads process.env only in src/config/env.ts`; firmas reciben el cliente por parámetro
- R20: [x] Proceso (checklist): sin endpoints nuevos; nota "servicio interno" + `UNKNOWN_BANK` reservado (api-contract.md:50,60-68)
- R21: [x] Proceso (checklist): ADR-008 (architecture.md:276-364), árbol, nota ADR-006 y ADR-005; stack.md tabla env; .env.example:21 placeholder
- R22: [x] `bash ./init.sh` verde (95 tests) + mapa R1-R28 en el informe
- R23: [x] `resolveBankFolder returns the existing bank id without creating (R23)`
- R24: [x] `resolveBankFolder throws UnknownBankError ... without creating (R24,R25,R26)` + `ensureBankYearFolders throws UnknownBankError and creates nothing (R24)` (ambos: create NO llamado)
- R25: [x] mismo test de R24 (message contiene `santander` y `bbva`)
- R26: [x] `suggestBank ... within the threshold (R26)` + `undefined when nobody is close enough (R26)` + integración (`Did you mean 'santander'`)
- R27: [x] `createBank creates ... under the root when absent (R27)` (parents:[root]) + `is idempotent: reuses an existing bank folder (R27)`
- R28: [x] `app-error.test.ts` `UnknownBankError is an AppError with UNKNOWN_BANK / 404` + bloque de discriminación (ValidationError≠UnknownBankError≠DriveConnectionError)

Ningún `R<n>` sin cobertura real. Sección de **Procedencia** presente
(`requirements.md:382-528`), cada R clasificado (humano / delegado / añadido).

## Tasks completas (SDD)

- T1..T3 (config), T4b (UnknownBankError), T4 (export driveErrorMessage): [x]
- T5, T5b, T6, T6b, T7, T8, T9 (lib): [x]
- T10 (tests), T11 (guardianes), T12..T15 (docs), T16..T19 (verificación): [x]
- T20: [ ] — **justificado**: smoke real del humano (crear `notas-banco/` y pegar su
  fileId), NO del implementer. Documentado como tal en `tasks.md` (§"Smoke test del
  humano — NO es del implementer") y en el informe. No bloquea.

## Puntos de control específicos de la feature (verificados)

- [x] **Banco desconocido NO crea (R24):** `drive-structure.test.ts:286-299` y `:188-205`
  afirman `expect(create).not.toHaveBeenCalled()` y salida `UnknownBankError`.
- [x] **`createBank` único alta + idempotente (R27):** `drive-structure.ts:272-279`;
  no hay flag `{create:true}` en ninguna ruta; `ensureBankYearFolders` (`:288-299`)
  resuelve vía `resolveBankFolder`, nunca crea banco.
- [x] **Distinguibilidad de errores (R28):** `UNKNOWN_BANK`/404 ≠ `VALIDATION_ERROR`/400
  ≠ `DRIVE_CONNECTION_ERROR`/503. `callDrive` (`drive-structure.ts:34-43`) re-lanza
  cualquier `AppError` propio tal cual (`instanceof AppError`).
- [x] **`suggestBank` pura, Levenshtein ≤ 2, desempate alfabético (R25/R26):**
  `drive-structure.ts:123-137` (ordena `[...known].sort()`, `distance < bestDistance`
  → gana el alfabéticamente primero en empate; `undefined` si nadie ≤ 2). Sin red.
- [x] **Año/procesados auto-crean idempotente tras resolver banco (R4); banco NO auto-crea:**
  `drive-structure.ts:288-299`; test `:260-284`.
- [x] **Sin red:** todo con `driveDouble` en el seam; ni un test hace I/O a Drive.
- [x] **No viola `que_no_quiero`:** guardianes de `prisma`, auth-wiring y `process.env`
  verdes; no lee/parsea contenido; no re-monta conexión; no crea la raíz.
- [x] **`bash ./init.sh` verde** — ejecutado por el reviewer: 95 tests, exit 0.

## Criterios de aceptación (acceptance)

- [x] Asegura `<banco>/<año>/procesados`, cuelga de la raíz manual, devuelve ids → R3,R4,R5
- [x] Idempotente + carrera intra-proceso → R6,R7,R8
- [x] Sube archivo nuevo sin sobrescribir/concatenar → R9,R10
- [x] Mueve a `procesados/`, deja de colgar del año → R11
- [x] Fallo de Drive → error claro sin estructura a medias → R12,R13
- [x] Descubre la raíz por config validada; NO la crea → R1,R2,R3
- [x] Valida banco y año, decisión anotada → R14-R17,R23-R28
- [x] NO lee contenido, NO BD, NO detección/disparo, NO re-monta conexión → R18,R19
- [x] Servicio interno documentado → R20
- [x] Trazabilidad + init.sh + ADR/stack/env → R21,R22

## Arquitectura (docs/architecture.md)

- [x] Ubicación correcta en `lib/drive-structure.ts` (infra sobre el cliente, ADR-004/008), no módulo (sin rutas)
- [x] Errores tipados (Principio 3): `UnknownBankError` subclase idiomática; handler central sin tocar
- [x] Config validada en un único punto (Principio 4); campo hermano `driveRootFolderId`, no en `DriveCredentials`
- [x] Reutiliza la conexión de la feature 3 por parámetro; `drive.ts` sigue "solo conexión" (guardián `no files.` verde)
- [x] ADR-008 registrado; sin dependencias nuevas

## Convenciones (docs/conventions.md)

- [x] Inglés; kebab-case archivos; PascalCase clases; camelCase funciones
- [x] Imports: vendor → relativos con `.js`; `import type` para tipos
- [x] Comillas simples, sin `;`, 2 espacios, 100 columnas (`format:check` verde)
- [x] Errores: jerarquía `AppError`, nunca strings sueltos, error crudo no sale (R12 sanitizado)
- [~] `console.warn` en `findFolder` (`drive-structure.ts:166`): la convención "no console.log
  para errores" apunta al manejo de errores con logger de Fastify; aquí es un **warn
  diagnóstico** (Drive devolvió >1 carpeta homónima), **exigido por el spec** (`design.md §3.1`,
  `tasks.md T6`) y sin logger en una función pura. Documentado en el informe. Aceptado.

## Verificación (docs/verification.md)

- [x] Recurso correcto: doble del cliente Drive en el seam (no hay "Drive local")
- [x] Output concreto (ids, `parents`, `addParents/removeParents`, `create` no llamado, message sanitizado), no "no lanza"
- [x] Camino feliz + errores (banco desconocido, año inválido, fallo de Drive, fallo parcial)
- [x] Nivel 4 (trazabilidad) cumplido: mapa R1-R28 en el informe

## CHECKPOINTS.md

- [x] C1 — Arnés completo (init.sh exit 0)
- [x] C2 — Estado coherente (1 sola `in_progress`; `current.md` describe la sesión activa)
- [x] C3 — Arquitectura (estructura, sin deps nuevas, sin TODOs sueltos; `console.warn` diagnóstico exigido por spec)
- [x] C4 — Verificación real (tests por módulo, feliz + error, todos pasan)
- [x] C5 — Sesión cerrada bien (falta el volcado a history.md y `status: done`, que hace el implementer tras esta aprobación)
- [x] C6 — Coherencia con hermanos: `api-contract.md` actualizado; sin endpoints inventados; `UNKNOWN_BANK` reservado
- [x] C7 — SDD: specs completos, EARS, tasks `[x]` (T20 humano justificado), cada R cubierto
- [x] C8 — Resumen de cierre escrito (`progress/summaries/drive-structure.md`)

## Nota sobre el bloqueo de lint (confirmado independiente de la feature)

`pnpm lint` falla, pero **NO por la feature**. Verificado por el reviewer: el error es
`typescript-eslint does not support TS 7.0`, lanzado desde
`typescript-eslint@8.65.0/.../dist/index.js:52` **al cargar el config de ESLint**, ANTES
de mirar ningún archivo (no evalúa reglas sobre `drive-structure.ts`). Causa: bump **sin
commitear** en `package.json` (parte del `M package.json` inicial, ajeno a la feature):
`typescript ^6.0.3 → ^7.0.2` y `typescript-eslint ^8.63.0 → ^8.65.0` (verificado con
`git diff package.json`). `init.sh` —la puerta real— corre `tsc + pnpm test`, no lint, y
está verde. No se penaliza la feature. Recomendación para el leader/humano: alinear
versiones y sincronizar `docs/stack.md` (aún dice `typescript@^6.0.3`). Cambio de
dependencias, fuera del scope de esta feature.

## Resumen de cierre (APPROVED)

- Escrito en `progress/summaries/drive-structure.md` → sí

## Cambios requeridos

Ninguno.
