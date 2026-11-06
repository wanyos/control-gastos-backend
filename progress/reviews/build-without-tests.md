# Revisión: build-without-tests (mantenimiento, no es una feature)

## Review (2026-11-06)

**Veredicto:** APPROVED
Comprobado: ningún archivo de producción importa lo excluido, `dist/` = solo producción,
arranque de `dist/server.js` + `/health`, el type check sigue viendo los tests, vitest ignora `dist/`,
`./init.sh` con `dist/` y sin él, docs, vocabulario. Checks: sin checks (no hay feature).
Sin hallazgos. Sin resumen de cierre: es mantenimiento, no hay feature (mismo criterio que `init-intermitente`).

### Qué ejecuté y qué salió

- **Nadie de producción importa lo excluido.** `grep -rnE` de imports de `*.fixture`, `/test-*` en `src/**/*.ts`,
  quitando `*.test.ts`, `*.fixture.ts` y `src/lib/test-*` → ninguna línea (exit 1). Importadores de
  `.fixture|test-db|test-guard|test-real-data`: solo `*.test.ts` y `vitest.config.ts`,
  `vitest.setup.ts`, `vitest.global-setup.ts`.
- **`pnpm run build`** → exit 0. `find dist`: `*.test.js` 0, `*.fixture.js` 0, `test-*` 0, `*.js` 123.
  `diff` entre `src/**/*.ts` (sin tests, fixtures ni `src/lib/test-*`) y `dist/**/*.js` → vacío (123 = 123).
  Lo que no se alcanza desde `dist/server.js` siguiendo los imports relativos son `*.types.js`
  (los imports de solo tipos desaparecen al compilar), el cliente de Prisma generado y los módulos que usan `scripts/`
  y `prisma/seed-*.ts` (`backup.*`, `*.seed`, `import.parse-file`). Ninguno lo usan solo los tests.
- **`node dist/server.js`** (antes, `netstat -ano | grep ":3000 "` → nada): log «Server listening at
  http://127.0.0.1:3000», `curl /health` → `HTTP 200` `{"status":"ok",...}`. Solo esa ruta.
  `taskkill //PID 9084 //T //F` → terminado; `tasklist` → no hay tareas; `netstat` → ningún LISTENING
  en `:3000` (solo el `TIME_WAIT` del `curl`, PID 0).
- **El type check sigue viendo los tests.** `pnpm run typecheck` → exit 0.
  `npx tsc --noEmit --listFilesOnly` (lo mismo que `init.sh:504-505`, con `tsconfig.json`): 93 `*.test.ts`
  (93 en `src`), 9 `*.fixture.ts`, 3 `src/lib/test-*.ts`. `npx tsc -p tsconfig.build.json --listFilesOnly`
  → 0 de los tres tipos.
- **vitest ignora `dist/`.** Con `dist/` compilado a la antigua (`npx tsc -p tsconfig.json`, 93 `*.test.js`):
  `npx vitest list --filesOnly` → 93 archivos, 0 en `dist/`. Para comparar, la misma lista con una config
  sin el `exclude` (en el scratchpad) → 186, 93 de ellos en `dist/`. La exclusión es la que los quita.
- **`./init.sh` sin `dist/`** (`ls dist` → no existe) → exit 0, `Test Files 93 passed (93)`,
  `Tests 1521 passed (1521)`, type check, lint y format:check en `[OK]`.
  **Con `dist/`** del build nuevo, justo después → exit 0, mismos números. Las dos ejecuciones fueron
  una detrás de otra, nunca dos vitest a la vez.
- **Lo que dice `docs/stack.md`**: «`exclude` solo quita puntos de entrada». Lo probé en el scratchpad con
  el `tsc` 7.0.2 del proyecto: un `main.ts` que importa un `a.fixture.ts` excluido → exit 0, y `dist/` con
  `a.fixture.js` y `main.js`. Es cierto.
- `dist/` borrado al terminar (`ls dist` → no existe). El puerto 3000 queda libre.

### Comprobado sin hallazgos

`tsconfig.build.json`, `package.json:9`, `vitest.config.ts:10-14` (comentario en inglés, como el resto del archivo).
Docs: `README.md:41,44` y `docs/stack.md:61-72` dicen la verdad. `git grep` de `pnpm run build|prisma generate && tsc|dist/|tsc --noEmit|tsconfig`
fuera de `progress/` y `specs/`: no queda ninguna línea que describa el build anterior. `docs/verification.md:30,174` e
`init.sh:504` siguen siendo ciertos. Vocabulario: «fixture» y «helper de test» ya estaban en `docs/architecture.md`
antes del cambio. Son términos técnicos, no nombres de mecanismos del proyecto. No hay palabras nuevas. `docs/lessons.md`:
las lecciones activas 1 a 3 no aplican. No hay datos reales del humano. CHECKPOINTS: no aplican como feature.

Nota que no bloquea. El informe del implementer tiene dos datos inexactos: dice «los 10 `*.fixture.ts`» y son 9
(`find src -name '*.fixture.ts'`), y dice que `netstat` escribe `ESCUCHANDO`, pero aquí escribió `LISTENING`. No afectan al cambio.
