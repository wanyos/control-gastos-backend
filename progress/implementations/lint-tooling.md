# Informe: instalación y configuración de ESLint + Prettier (tarea directa)

- **Fecha:** 2026-07-11
- **Tipo:** tarea directa del humano (NO es feature de `feature_list.json`;
  ese archivo y `specs/` quedan intactos). Resuelve de facto el R18/T22 del
  spec `fundamentos` pendiente de aprobación.
- **Alcance:** solo tooling de estilo. Cero cambios de comportamiento en `src/`.

## Paquetes añadidos (devDependencies, npm)

| Paquete | Versión instalada | Justificación |
| --- | --- | --- |
| `eslint` | 10.7.0 | El linter. Flat config es el único modo (igual que en 9). Ver nota de versión abajo. |
| `@eslint/js` | 10.0.1 | Reglas `recommended` de JS core; se importa directamente en `eslint.config.js`, así que se declara como dependencia directa (es lo que indica la guía de typescript-eslint) en vez de confiar en la transitiva de `eslint`. |
| `typescript-eslint` | 8.63.0 | Paquete unificado v8 (parser + plugin + configs) para lintar TypeScript; entrada recomendada por el proyecto typescript-eslint para ESLint 9+. |
| `prettier` | 3.9.5 | El formatter. |
| `eslint-config-prettier` | 10.1.8 | Desactiva las reglas estilísticas de ESLint que pelearían con Prettier. Se aplica el último en la cadena `extends`. |

Nada más se instaló. No hay `eslint-plugin-prettier` (innecesario: Prettier se
ejecuta como comando aparte, patrón recomendado por ambos proyectos).

> **Nota de versión (decisión revisable por el leader):** el encargo decía
> «ESLint 9 con flat config». `npm install eslint` resolvió la major actual
> estable, la **10** (9 ya no es latest). Es flat-config-only exactamente igual
> que 9 y `typescript-eslint@8.63` la acepta como peer sin conflicto (npm
> habría fallado si no). Se dejó la 10 por ser la actual y estar verificada
> aquí de punta a punta. Si se prefiere fijar la 9: `npm i -D eslint@^9
> @eslint/js@^9` sin cambiar nada de la config.

## Archivos de configuración creados

### `eslint.config.js` (flat config, ESM)

- `defineConfig` + `globalIgnores` de `eslint/config` (API nativa de ESLint 9+).
- Ignores globales: `src/generated/**` (cliente Prisma generado), `dist/**`,
  `node_modules/**`.
- Sobre `files: ['src/**/*.ts']`: `js.configs.recommended` +
  `tseslint.configs.recommended` (sin type-checking del compilador — el typed
  linting queda como mejora futura) + `eslint-config-prettier/flat` al final.
- **Decisión de alcance:** tal como pedía el encargo, el lint TS cubre solo
  `src/**/*.ts`. Los `.ts` de raíz (`vitest.config.ts`, `prisma.config.ts`)
  NO se lintan (ESLint los omite en silencio al no casar con ningún `files`).
  Ampliable más adelante añadiendo otro bloque `files` si se quiere.

### `.prettierrc`

Exactamente las reglas fijadas por el humano en `docs/conventions.md` §Estilo:

```json
{ "singleQuote": true, "semi": false, "tabWidth": 2, "printWidth": 100 }
```

### `.prettierignore` (decisiones)

- `src/generated/`, `dist/`, `node_modules/`, `package-lock.json` — artefactos
  generados/de build. Prettier 3 ya respeta `.gitignore` por defecto; se
  duplican aquí a propósito para que la política sea explícita y no dependa
  del contenido de `.gitignore`.
- `*.md`, `docs/`, `progress/`, `specs/`, `.claude/` — **Prettier NO formatea
  la prosa del harness por ahora** (recomendación del leader, seguida):
  reformatear docs en bloque mete ruido en git y esos archivos los poseen el
  humano/leader, no el formatter. Se extendió a todos los `.md` (incluidos
  README/AGENTS/CHECKPOINTS/CLAUDE de raíz) por el mismo motivo. Revisable.
- `feature_list.json` — estado del harness gestionado por agentes; excluido
  para garantizar que `prettier --write .` jamás lo toque.
- `.vscode/` — configuración local del editor, fuera del alcance del formatter.

Con esto, Prettier posee: `src/**` (salvo generated), los configs de raíz
(`eslint.config.js`, `vitest.config.ts`, `prisma.config.ts`, `tsconfig.json`,
`package.json`, `.prettierrc`) y `docker-compose.yml`.

## Scripts añadidos a `package.json`

```json
"lint": "eslint .",
"lint:fix": "eslint . --fix",
"format": "prettier --write .",
"format:check": "prettier --check ."
```

## Reformateo aplicado

- **`src/`: CERO archivos reformateados.** Todo el código ya cumplía el estilo
  (comillas simples, sin `;`, 2 espacios, <100 cols). Ni ESLint ni Prettier
  pidieron un solo cambio en `src/`.
- `docker-compose.yml`: 2 líneas, comillas dobles → simples (`'5434:5432'` y
  el array del healthcheck). YAML semánticamente idéntico; verificado por diff
  antes de escribir.
- `eslint.config.js`: plegado a 100 columnas del propio archivo nuevo.

## Comandos ejecutados y resultado (verificación final)

| Comando | Resultado |
| --- | --- |
| `npx eslint .` | exit 0, **0 errores**. 9 archivos lintados (verificado con `--format json`): `eslint.config.js` + los 8 `.ts` de `src/` (app, server, lib/prisma, plugins/prisma, routes/{expenses,health}{,.test}); `src/generated/` excluido. |
| `npx prettier --check .` | `All matched files use Prettier code style!` (exit 0) |
| `npm run lint` / `npm run format:check` | OK (mismos resultados vía scripts) |
| `npm test` | **8/8 passed** (2 test files), Vitest 4.1.10 |
| `npm run typecheck` | `tsc --noEmit` sin errores |
| `bash ./init.sh` | `[OK] Entorno listo. Puedes empezar a trabajar.` |

## Hallazgos / fuera de scope (para decisión del leader)

1. **ESLint no exigió ningún cambio no estilístico**: no hubo que desactivar
   ni ajustar reglas; la config recommended pasa limpia sobre el código actual.
2. `npm audit`: 3 vulnerabilidades moderadas **preexistentes** en la cadena
   `prisma → @prisma/dev → @hono/node-server` (nada de los paquetes nuevos).
   El fix propuesto por npm degrada a Prisma 6 (breaking, prohibido por
   `docs/stack.md`). No se tocó.
3. Sugerencia fuera de scope: ampliar el lint a `vitest.config.ts` y
   `prisma.config.ts`, y valorar `recommendedTypeChecked` en el futuro.
4. `docs/conventions.md` y `docs/stack.md` dicen que ESLint/Prettier «aún no
   están instalados» — actualización pendiente del leader (no toqué `docs/`).

## Estado en `feature_list.json`

Sin cambios (tarea directa, no feature). Feature 2 sigue en `spec_ready`
esperando aprobación humana; cuando se apruebe, T22 del spec queda N/A por
«ya hecho en tarea directa».
