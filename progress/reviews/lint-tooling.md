# Review — tarea directa `lint-tooling` (ESLint + Prettier)

**Veredicto:** APPROVED

- **Fecha:** 2026-07-11
- **Tipo:** tarea directa del humano, NO feature de `feature_list.json` (sin
  trazabilidad R<n>/tasks ni resumen de cierre; no aplica el flujo SDD).
- **Informe revisado:** `progress/impl_lint-tooling.md`
- **Referencia de reglas:** `docs/conventions.md` §Estilo del lenguaje

## 1. Reglas de estilo (`.prettierrc`)

- [x] `singleQuote: true` → comillas simples (conventions.md:29)
- [x] `semi: false` → sin punto y coma (conventions.md:30)
- [x] `tabWidth: 2` → 2 espacios (conventions.md:31)
- [x] `printWidth: 100` → 100 columnas (conventions.md:32)

Coincidencia exacta con lo fijado por el humano. Sin opciones extra no pedidas.

## 2. `eslint.config.js`

- [x] Flat config ESM con `defineConfig` + `globalIgnores` de `eslint/config`
  (eslint.config.js:5,9).
- [x] Ignora `src/generated/**`, `dist/**`, `node_modules/**` (línea 9).
  Verificado en ejecución real: el cliente Prisma generado NO aparece entre
  los archivos lintados.
- [x] `js.configs.recommended` + `tseslint.configs.recommended` sobre
  `files: ['src/**/*.ts']` (líneas 10-13).
- [x] `eslint-config-prettier/flat` en última posición de `extends`
  (línea 15), con comentario que explica el porqué.
- [x] **Desviación ESLint 10 vs 9: razonable y aceptada.** Verificado con
  `npm ls eslint typescript-eslint @eslint/js prettier eslint-config-prettier`:
  árbol limpio, `eslint@10.7.0` deduped en toda la cadena, cero conflictos ni
  peers inválidos; `typescript-eslint@8.63.0` la acepta. ESLint 10 es
  flat-config-only igual que 9, la config es idéntica en ambas, y el informe
  documenta la decisión con instrucción de rollback (`npm i -D eslint@^9
  @eslint/js@^9`). Verificada de punta a punta aquí.
- Nota (no bloqueante): `vitest.config.ts` y `prisma.config.ts` de raíz no se
  lintan. Es lo que pedía el encargo (`src/**/*.ts`) y está documentado como
  ampliable en el informe (impl_lint-tooling.md:40-43).

## 3. `.prettierignore`

- [x] Exclusiones razonadas y comentadas en el propio archivo: artefactos
  generados/build (`src/generated/`, `dist/`, `node_modules/`,
  `package-lock.json`), prosa/estado del harness (`*.md`, `docs/`,
  `progress/`, `specs/`, `.claude/`, `feature_list.json`) y `.vscode/`.
- [x] Verificado con `prettier --file-info` (no de palabra):
  - `README.md`, `docs/conventions.md`, `AGENTS.md`, `CHECKPOINTS.md`,
    `progress/current.md`, `feature_list.json`, `.vscode/settings.json`
    → `"ignored": true`.
  - `src/app.ts`, `docker-compose.yml`, `vitest.config.ts`, `package.json`
    → `"ignored": false` (poseídos por Prettier, como declara el informe).

## 4. Scripts en `package.json`

- [x] `lint`, `lint:fix`, `format`, `format:check` presentes
  (package.json:14-17) y funcionales: `npm run lint`, `npm run format:check`
  y `npm run typecheck` ejecutados en verde. `npm run lint:fix` ejecutado y
  el working tree quedó idéntico (no introduce cambios).

## 5. Verificación re-ejecutada por el reviewer (no fiada del informe)

| Comando | Resultado |
| --- | --- |
| `npx eslint .` | exit 0, **9 archivos lintados, 0 errores, 0 warnings** (contado vía `--format json`): `eslint.config.js` + los 8 `.ts` de `src/`. Coincide exactamente con el informe. |
| `npx prettier --check .` | `All matched files use Prettier code style!` (exit 0) |
| `npm test` | **8/8 passed** (2 archivos) |
| `npm run typecheck` | `tsc --noEmit` sin errores |
| `bash ./init.sh` | Verde, exit 0 (`Entorno listo`) |

**Incidencia de entorno investigada (no imputable a esta tarea):** la primera
ejecución de `npm test` falló con `Cannot read properties of undefined
(reading 'config')` en ambos suites. Es el quirk **preexistente y ya
documentado en `init.sh:272-277`**: vitest 4.1.10 falla si el cwd usa la letra
de unidad en minúscula (`c:/`); mi shell la heredaba así. Con el cwd
normalizado (`C:/`, como hace el propio init.sh vía cygpath) los tests pasan
8/8 de forma estable. No es una regresión del lint-tooling: nada de `src/`,
`vitest.config.ts` ni `init.sh` cambió.

## 6. Diff real vs declarado (`git status` / `git diff` / mtimes)

- [x] `package.json` (M): solo +4 scripts y +5 devDependencies. Nada más.
- [x] `package-lock.json` (M): +1106 líneas, **solo inserciones** (cero
  eliminaciones → ninguna dependencia previa alterada).
- [x] `eslint.config.js`, `.prettierrc`, `.prettierignore` (nuevos).
- [x] `docker-compose.yml` (M): únicamente 2 líneas de comillas dobles →
  simples (`'5434:5432'` y el array del healthcheck). YAML semánticamente
  idéntico, verificado en el diff.
- [x] **Cero cambios en `src/`**: `git diff HEAD --stat -- src/
  vitest.config.ts tsconfig.json prisma/` vacío. Lo confirma git, no el
  informe.
- [x] `docs/` intacto (mtimes ≤ 2026-07-10 18:14, previos a la tarea).
- [x] `init.sh` intacto (mtime 2026-07-10 18:03; no aparece en git status).
- [x] `feature_list.json` aparece M en git status, pero su diff es
  exclusivamente `pending → spec_ready` de la feature 2 y su mtime es
  **2026-07-10 18:36** (trabajo del spec_author/leader de ayer, previo a esta
  tarea; el implementer trabajó hoy 08:27-08:31). No lo tocó el implementer.
- [x] `specs/fundamentos/` (untracked) es del spec_author (mtimes 2026-07-10
  18:33-18:35). Intacto por el implementer.
- [x] `progress/current.md` (M): bitácora de sesión del harness (leader),
  fuera de la lista prohibida. `progress/impl_lint-tooling.md` es el
  entregable esperado del implementer.

## 7. Sin invasión del alcance de la feature 2

- [x] No existe `src/modules/` ni migración de estructura (árbol de `src/`
  idéntico a HEAD: app, server, lib/prisma, plugins/prisma,
  routes/{expenses,health}{,.test}).
- [x] Sin `AppError`/`error-handler` ni `setErrorHandler` nuevos.
- [x] Sin cambios de configuración de env (`vitest.config.ts`,
  `prisma.config.ts`, `.env*` intactos).
- [x] Sin `eslint-plugin-prettier` ni paquetes no declarados: las
  devDependencies nuevas son exactamente las 5 del informe.

## Hallazgos no bloqueantes (para el leader)

1. `docs/conventions.md:26-27` y `docs/stack.md` siguen diciendo que
   ESLint/Prettier «aún no están instalados». Actualización pendiente del
   leader (el implementer hizo bien en no tocar `docs/`).
2. Cuando se apruebe el spec de la feature 2, marcar T22/R18 como resuelto
   por esta tarea directa, como ya anticipa el informe.
3. Sugerencia heredada del informe: ampliar lint a los `.ts` de raíz y
   valorar `recommendedTypeChecked` más adelante.

## Conclusión

Trabajo limpio, alcance respetado al milímetro, decisiones documentadas y
todas las verificaciones re-ejecutadas en verde. APPROVED.
