# dependency-upgrade-2026-10 — revisión

## Review (2026-10-28)

**Veredicto:** CHANGES_REQUESTED

### Cambios requeridos

1. `pnpm-lock.yaml:2371` — **el `pg` que usa la aplicación sigue en 8.23.0.** La
   entrada de `@prisma/adapter-pg@7.10.1` (dependencia de producción, la que abre
   las conexiones de Prisma) sigue resolviendo `pg: 8.23.0`, y el lockfile tiene
   ahora **dos copias**: `pg@8.23.0` (líneas 1676 y 3605, con `pg-pool@3.14.0(pg@8.23.0)`
   en 3585) para el adaptador y `pg@8.23.1` solo para la `devDependency`, que usan
   únicamente `src/lib/test-db.ts`, `src/lib/test-real-data.ts` y
   `src/modules/backup/backup.service.test.ts`. Antes había una sola copia
   (8.23.0, compartida). El adaptador pide `"pg": "^8.16.3"`
   (`node_modules/@prisma/adapter-pg/package.json`), así que 8.23.1 cabe en su
   rango. Lo aprobado por el humano era «`pg` 8.23.0 → 8.23.1»: hay que dejar una
   sola copia en 8.23.1 (que la entrada del adaptador resuelva `pg: 8.23.1`) y
   comprobar después, con la misma comparación de abajo, que no se mueve ninguna
   otra versión. Si para conseguirlo hace falta algo que mueva más versiones (por
   ejemplo `pnpm dedupe`), decirlo en el informe con la lista de lo que se mueve.
2. `docs/stack.md:23` — dice que el adaptador va «sobre `pg@^8.23.1`», y hoy es
   falso: corre sobre 8.23.0 (`pnpm why pg` → `pg@8.23.0` ← `@prisma/adapter-pg@7.10.1`;
   `pg@8.23.1` ← `gastos-backend (devDependencies)`; «Found 2 versions of pg»).
   Queda verdadero en cuanto se arregle el punto 1.
3. `progress/implementations/dependency-upgrade-2026-10.md` (tabla «Versiones
   antes / después», fila `pg`) — da `pg` por instalado en 8.23.1 sin decir que
   el adaptador sigue en 8.23.0 con una segunda copia. Corregirlo con lo que quede
   tras el punto 1.

### Comprobado sin hallazgos

- **Alcance de `package.json`:** solo cambian el campo `packageManager` (quitado)
  y los diez rangos aprobados; `@types/node` sigue en `^24.13.4` y `prisma` en
  `^7.10.1` (no 8).
- **Lockfile frente a lo aprobado:** comparé el conjunto de `paquete@versión` de
  la sección `packages:` de `HEAD` (segundo documento YAML) con el actual. Lo que
  cambia, aparte de los paquetes aprobados, son dependencias suyas: los
  `@oxlint/binding-*` 1.83.0 → 1.90.0; `@prisma/*` 7.10.0 → 7.10.1 y
  `@prisma/engines-version` (los de prisma); `@vitest/mocker`, `@vitest/spy`,
  `chai`, `magic-string`, `obug`, `std-env`, `tinybench`, `tinyexec`,
  `why-is-node-running` (vitest), y se van `siginfo` y `stackback`; `deepmerge-ts`
  7.1.5 → 8.0.2, `mysql2` 3.15.3 → 3.24.4 y `sql-escaper` 1.5.2 en lugar de
  `denque`, `seq-queue` y `sqlstring` (@prisma/client); y las nuevas
  `pg-cloudflare` 1.4.1, `pg-connection-string` 2.14.1 y `pg-protocol` 1.16.1 de
  `pg` 8.23.1. `@types/node` sigue con las mismas tres copias (14.18.63, 24.13.4,
  26.2.0). En `importers` solo cambian los diez rangos aprobados (y la cadena de
  `prisma` gana `(@types/node@24.13.4)`).
- **Primer documento YAML borrado:** el lockfile empieza por
  `lockfileVersion: '9.0'`; `grep -c "packageManagerDependencies\|@pnpm/exe"` → 0.
- **`pnpm install --frozen-lockfile`** en el repositorio (pnpm 11.22.0) →
  «Already up to date»; `sha1sum` de `pnpm-lock.yaml` y `package.json` igual
  antes y después. En una copia en el directorio temporal sin `node_modules`
  (`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`):
  `pnpm install --frozen-lockfile --ignore-scripts` → exit 0, 373 paquetes,
  versiones de la lista; `npx pnpm@12.5.1 install --frozen-lockfile --ignore-scripts`
  → exit 0, «Done in 6.4s using pnpm v12.5.1». `cmp` del lockfile y de
  `package.json` contra el repositorio: iguales tras las dos. Lo que dice
  `docs/stack.md:51-58` sobre las dos versiones de pnpm es cierto.
- **`docs/stack.md`:** las versiones nuevas están (Fastify, Prisma, adapter,
  fastify-plugin, drive, oxlint, Prettier, Vitest) y ya no dice que pnpm esté
  fijado. `git grep` de las versiones viejas, `packageManager` y `corepack` fuera
  de `progress/`, `specs/`, el lockfile y los tests: solo `docs/stack.md:18,52,54`
  (correctos) y el comentario histórico de `pnpm-workspace.yaml:19-21`.
- **`@googleapis/drive` 27:** `npm pack` de 26.0.0 y 27.0.0 en el directorio
  temporal. `diff -rq`: cambian `CHANGELOG.md`, `build/index.js(.map)`,
  `build/tsconfig.tsbuildinfo`, `build/v2.d.ts`, `build/v3.d.ts`, `index.ts`,
  `package.json`, `v2.ts`, `v3.ts`, y aparece `tsconfig.build.json`; `build/v3.js`
  no cambia. Líneas cambiadas que no son comentario: 0 en `v3.ts`, 0 en
  `build/v3.d.ts`, 0 en `build/v2.d.ts`. `build/index.js`: solo se quita
  `// TODO: delete this comment`. `package.json`: versión y `webpack-cli` ^5 → ^7
  (desarrollo). Coincide con el informe. `tsc --noEmit` sin errores (dentro de
  `./init.sh`). Contra Drive real no se ha probado (lo dice el informe).
- **Cabo 27 de `docs/roadmap.md`:** `pnpm audit --prod` → «30 vulnerabilities
  found / Severity: 4 low | 12 moderate | 14 high»; por módulo, con `--json`:
  `fast-uri` 20, `brace-expansion` 6, `qs` 3, `uuid` 1. Igual que el texto.
- **`./init.sh`, primera pasada:** exit 1. tsc, lint y format:check OK; fallan 3
  tests, los tres de `src/no-real-data.test.ts` y los tres por «Test timed out in
  5000ms» («Test Files 1 failed | 90 passed (91)», «Tests 3 failed | 1484 passed
  (1487)»). `pnpm exec vitest run src/no-real-data.test.ts` solo → «36 passed
  (36)», 3.87 s. **Segunda pasada de `./init.sh`:** exit 0, «Test Files 91 passed
  (91)», «Tests 1487 passed (1487)», «Entorno listo». No he comprobado si ese
  límite de tiempo ya se pasaba con vitest 5.0.1 (haría falta la suite completa
  sobre `HEAD`, en otra copia del repositorio con sus `node_modules`).
- Sin datos reales del humano en los archivos cambiados. `./init.sh --checks`:
  no aplica (sin feature).

## Review (2026-10-28, segunda revisión)

**Veredicto:** APPROVED
Comprobado: lo aprobado por el humano ↔ `package.json` y `pnpm-lock.yaml`,
documentos tocados, verificación, CHECKPOINTS que aplican sin feature. Checks: sin
checks (sin feature). Sin hallazgos: los tres puntos de la primera revisión
están resueltos.
Resumen de cierre: `progress/summaries/dependency-upgrade-2026-10.md`.

### Comandos lanzados y qué salió

- `pnpm why pg` → una sola `pg@8.23.1`, que usan `@prisma/adapter-pg@7.10.1`
  (dependencies), la devDependency y `pg-pool@3.14.0`; «Found 1 version of pg».
  `pnpm why pg-pool` → «Found 1 version of pg-pool». `pnpm-lock.yaml:2356`: la
  entrada del adaptador dice `pg: 8.23.1`. `grep` de `8.23.0`, `pg-cloudflare`,
  `pg-connection-string` y `pg-pool` en el lockfile: solo las 1.4.1, 2.14.1 y
  `pg-pool@3.14.0(pg@8.23.1)`; ninguna referencia a lo borrado.
- Comparación de `paquete@versión` contra el lockfile de la primera revisión
  (sección `packages:`): solo desaparecen `pg-cloudflare@1.4.0`,
  `pg-connection-string@2.14.0` y `pg@8.23.0`; no entra ni cambia nada. Contra
  `HEAD`, en `packages:` y en `snapshots:`: lo mismo de la primera revisión
  (paquetes aprobados y sus dependencias), con `pg` 8.23.0 → 8.23.1,
  `pg-cloudflare` 1.4.0 → 1.4.1, `pg-connection-string` 2.14.0 → 2.14.1,
  `pg-pool@3.14.0(pg@8.23.0)` → `(pg@8.23.1)` y `pg-protocol@1.16.1` nueva junto
  a 1.16.0 (la que sigue usando `@types/pg`). `@types/node` sin tocar.
- `pnpm install --frozen-lockfile` en el repositorio → «Already up to date»,
  exit 0; `sha1sum` de `pnpm-lock.yaml` y `package.json` igual antes y después.
- Copia limpia en el directorio temporal (`package.json`, `pnpm-lock.yaml`,
  `pnpm-workspace.yaml`, sin `node_modules`): `pnpm install --frozen-lockfile
  --ignore-scripts` → exit 0, «Done in 6.3s using pnpm v11.22.0»; borrado
  `node_modules` y `npx pnpm@12.5.1 install --frozen-lockfile --ignore-scripts`
  → exit 0, «Done in 7s using pnpm v12.5.1». `cmp` del lockfile contra el
  repositorio: igual tras las dos. En `node_modules/.pnpm` de la copia, una sola
  `pg@8.23.1` y `pg-pool@3.14.0_pg@8.23.1`. (En el `node_modules/.pnpm` del
  repositorio siguen las carpetas de las versiones viejas, sin enlazar: no están
  en el lockfile y `pnpm why` no las ve.)
- `docs/stack.md:23` («`@prisma/adapter-pg@^7.10.1` sobre `pg@^8.23.1`»): ahora
  es cierto.
- `./init.sh`, tres pasadas sobre el árbol actual:
  1. exit 1: tsc, lint y format:check OK; 1 test por «Test timed out in 5000ms»
     en `src/no-real-data.test.ts` («Tests 1 failed | 1486 passed (1487)»).
  2. (antes, `pnpm exec vitest run src/no-real-data.test.ts` solo → «36 passed
     (36)», 3.69 s) exit 1: 3 tests por el mismo límite de tiempo, dos de
     `src/no-real-data.test.ts` y uno de `src/architecture.test.ts` («shares no
     parsing code between bank modules», 9119 ms). `pnpm exec vitest run
     src/architecture.test.ts` solo → «41 passed (41)».
  3. (después de la comparación con `HEAD` de abajo) exit 0, «Test Files 91
     passed (91)», «Tests 1487 passed (1487)», «Entorno listo».
- **Si esos límites de tiempo vienen de esta subida:** no. Monté `HEAD` en otra
  copia del repositorio (worktree en el directorio temporal, `pnpm install
  --frozen-lockfile` con pnpm 12.5.1, `prisma generate` 7.10.0, vitest 5.0.1) y
  alterné `pnpm test` en `HEAD` y en el árbol actual, dos veces cada uno:
  `HEAD` → 3 y 5 tests rotos por «Test timed out in 5000ms» (los de
  `src/no-real-data.test.ts` y, en la segunda, el mismo de
  `src/architecture.test.ts`); árbol actual → 4 y 4, los mismos tests. Duración
  44–45 s en `HEAD` y 39–42 s en el árbol actual. El fallo por tiempo ya estaba
  antes de la subida y no es de esta tarea. Worktree borrado después
  (`git worktree list` → solo el repositorio).
