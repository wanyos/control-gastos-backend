# build-without-tests — implementación

Tarea de mantenimiento (no es una feature de `feature_list.json`). Objetivo:
que `pnpm run build` no meta en `dist/` los tests ni lo que solo usan los
tests, y que vitest no busque tests dentro de `dist/`.

No se ha escrito en la base del humano ni en sus carpetas de datos. El único
arranque del servidor compilado fue para `GET /health`, que no consulta la base.

## Archivos modificados / creados

- `tsconfig.build.json` (nuevo): extiende `tsconfig.json` y solo redefine
  `exclude`: `node_modules`, `dist`, `src/**/*.test.ts`, `src/**/*.fixture.ts`,
  `src/lib/test-*.ts`.
- `package.json`: `build` pasa de `prisma generate && tsc` a
  `prisma generate && tsc -p tsconfig.build.json`. `typecheck` no cambia
  (`tsc --noEmit`, con `tsconfig.json`, que sigue incluyendo los tests).
- `vitest.config.ts`: `test.exclude: [...configDefaults.exclude, 'dist/**']`
  (import de `configDefaults` desde `vitest/config`), con un comentario.
- `README.md`: filas de `pnpm run build` y `pnpm run typecheck`.
- `docs/stack.md`: líneas de Build y Type check.

`init.sh` no se ha tocado: su paso de tipos es `npx tsc --noEmit --incremental`
(líneas 504-505), que usa `tsconfig.json` y por tanto sigue comprobando los tests.

## Decisiones tomadas

1. **Un `tsconfig.build.json` aparte, en vez de añadir los excludes a
   `tsconfig.json`.** Si se excluyeran en `tsconfig.json`, `pnpm run typecheck`
   y el paso de tipos de `./init.sh` dejarían de comprobar los tests, que es
   justo lo que no debe pasar. Con un archivo aparte solo el build ve la lista
   reducida.
2. **Qué se excluye y por qué, comprobado con `git grep` de importadores**
   (excluyendo `progress/`, `specs/`, `docs/`) para cada candidato:

   | Candidato | Importadores que no son `*.test.ts` |
   |---|---|
   | `src/lib/test-db.ts` | `vitest.config.ts`, `vitest.global-setup.ts`, `vitest.setup.ts` |
   | `src/lib/test-guard.ts` | `vitest.global-setup.ts` |
   | `src/lib/test-real-data.ts` | `vitest.global-setup.ts` |
   | los 10 `*.fixture.ts` (`src/lib/drive`, `src/lib/iban`, y `backup`, `bankinter`, `myinvestor`, `n26`, `openbank`, `revolut`, `trade-republic` en `src/modules/`) | ninguno |

   Ningún archivo de `src/` que no sea test importa ninguno de ellos; los
   `vitest.*.ts` se ejecutan con el cargador de vitest desde `src/`, no desde
   `dist/`.
3. **Patrones (`*.fixture.ts`, `src/lib/test-*.ts`) en vez de una lista de
   nombres**, para que un fixture o helper nuevo con el mismo nombre quede
   fuera sin tocar nada. Es seguro porque `exclude` de TypeScript solo quita
   archivos como punto de entrada: si el código de producción importara uno,
   `tsc` lo compilaría igual y el build no se rompería. Comprobado en una
   carpeta temporal (fuera del repo) con el `tsc` 7.0.2 del proyecto: un
   `main.ts` que importa un `a.fixture.ts` excluido → `exit=0` y `dist/`
   contiene `a.fixture.js` y `main.js`.
4. **Exclusión de `dist/**` en vitest** conservando los valores por defecto:
   `configDefaults.exclude` en vitest 5.0.5 vale
   `[ '**/node_modules/**', '**/.git/**' ]` (impreso con
   `node -e "import('vitest/config').then(m=>console.log(m.configDefaults.exclude))"`).

## Documentos actualizados

```
git grep -n "prisma generate && tsc\|tsc --noEmit\|salida a \`dist/\`\|compila TypeScript a" -- . ':!progress' ':!specs'
```

Salida antes de corregir:

- `README.md:41` (build) → corregido: dice que usa `tsconfig.build.json` y qué deja fuera.
- `docs/stack.md:61` (build) → corregido, con la explicación de qué excluye,
  por qué no rompe el build si producción importa uno de esos archivos, y la
  exclusión de `dist/**` en vitest.
- `docs/stack.md:63` (type check) → aclarado que con `tsconfig.json` comprueba
  también tests, fixtures y helpers. Ídem en la fila `typecheck` del `README.md`.
- `docs/verification.md:30` y `:174` (`tsc --noEmit`) → siguen siendo verdad, no se tocan.
- `init.sh:504-505` → sigue siendo verdad; además es del motor, no se toca.
- `package.json:9` y `:13` → ya son el cambio.

`docs/architecture.md` no tiene ningún ADR sobre el build ni `dist/` (buscado
`dist`/`build` en los encabezados y el texto: solo aparecen palabras como
«distinto»). No existe `Dockerfile`. `.gitignore` y `.prettierignore` ya
ignoraban `dist/`; `.oxlintrc.json` también lo ignora según `docs/stack.md`.

## Verificación

Todos los comandos desde la raíz del proyecto.

### `pnpm run build`

```
pnpm run build > build.log 2>&1   → exit=0
✔ Generated Prisma Client (7.10.1) to .\src\generated\prisma in 91ms
find dist -name '*.test.js' | wc -l      → 0
find dist -name '*.fixture.js' | wc -l   → 0
find dist -name 'test-*'                 → (nada)
find dist -name '*.js' | wc -l           → 123
```

Contenido de `dist/`: `app.js`, `server.js`, y las carpetas `config/`,
`errors/`, `generated/prisma/`, `lib/`, `plugins/` y `modules/<21 módulos>`,
cada `.js` con su `.js.map`. `dist/lib/` contiene solo `cp1252`,
`drive-structure`, `drive`, `iban`, `load-env-file`, `local-date`,
`parsed-statement`, `prisma`, `strict-body`, `utf8` (sin `test-db`,
`test-guard`, `test-real-data` ni fixtures).

Comparación exacta: la lista de `src/**/*.ts` sin `*.test.ts`, `*.fixture.ts`
ni `test-*.ts` (rutas sin extensión) frente a la lista de `dist/**/*.js` →
`diff` vacío: «dist = production sources exactly (123 files)».

También: `npx tsc -p tsconfig.build.json --listFilesOnly | grep -cE '\.test\.ts|\.fixture\.ts|lib/test-'` → `0`;
`npx tsc --noEmit --listFilesOnly | grep -c '\.test\.ts'` → `93` (el type check
sigue viendo los 93 archivos de test; `find src -name '*.test.ts' | wc -l` → 93).

### `node dist/server.js` y `GET /health`

```
node dist/server.js (en segundo plano)
log: "PostgreSQL connection established (Prisma)"
log: "Server listening at http://127.0.0.1:3000"
curl http://localhost:3000/health → HTTP 200
{"status":"ok","timestamp":"2026-11-06T19:49:28.435Z"}
```

Solo se pidió `/health`. Cierre: `taskkill //PID 12208 //T //F` → «el proceso
con PID 12208 … ha sido terminado»; `tasklist //FI "PID eq 12208"` → no hay
tareas; `netstat -ano | grep ":3000 "` → solo quedaba la conexión del `curl` en
`TIME_WAIT` (PID 0), ningún proceso escuchando. Al final de la tarea, el mismo
`netstat` → nada en `:3000`.

Aviso sobre la comprobación previa del puerto: la hice con
`netstat -ano | grep ":3000 " | grep LISTENING` y salió «libre», pero en este
Windows `netstat` escribe el estado en español (`ESCUCHANDO`), así que ese
filtro no habría detectado nada aunque estuviera ocupado. Lo que sí demuestra que
estaba libre es que el servidor arrancó escuchando en `127.0.0.1:3000` sin error.

### `./init.sh` con `dist/` presente (el del build nuevo)

```
./init.sh > init-with-dist.log 2>&1 → exit=0
 Test Files  93 passed (93)
      Tests  1521 passed (1521)
[OK] Todos los tests pasan
[OK] Entorno listo. Puedes empezar a trabajar.
```

### La exclusión de `dist/**` en vitest, por separado

Para comprobarla con tests compilados de verdad dentro de `dist/` (lo que
pasaba antes), compilé con la configuración antigua y listé lo que encuentra
vitest:

```
npx tsc -p tsconfig.json        → exit=0; find dist -name '*.test.js' | wc -l → 93
npx vitest list --filesOnly     → exit=0; archivos listados: 93; de ellos bajo dist/: 0
```

No he comprobado el contraste (que sin la exclusión vitest listaría los 93 de
`dist/` además de los de `src/`); para comprobarlo habría que repetir el
`vitest list` con la línea `exclude` quitada.

### `./init.sh` sin `dist/`

```
rm -rf dist; ls dist → No such file or directory
./init.sh > init-no-dist.log 2>&1 → exit=0
[OK] Type check OK (tsc sin errores)
[OK] OK: pnpm run lint
[OK] OK: pnpm run format:check
 Test Files  93 passed (93)
      Tests  1521 passed (1521)
[OK] Entorno listo. Puedes empezar a trabajar.
```

Las dos pasadas de `./init.sh` fueron una detrás de otra, nunca a la vez.
`dist/` queda borrado al terminar.

### `pnpm run lint`

```
pnpm run lint → exit=0  (salida: «$ oxlint», sin avisos)
```

`npx prettier --check vitest.config.ts tsconfig.build.json package.json` →
«All matched files use Prettier code style!».

## Sugerencias fuera de scope (NO aplicadas)

- `tsconfig.json` solo incluye `src/**/*.ts`, así que `vitest.config.ts`,
  `vitest.setup.ts` y `vitest.global-setup.ts` no pasan por el type check.
  No lo he cambiado porque no se pidió.
- En el árbol de trabajo había cambios sin commitear de otras tareas
  (`docs/architecture.md`, `docs/roadmap.md`, `src/lib/test-db.ts`, etc.); no
  son míos y no los he tocado. Los míos son: `tsconfig.build.json`,
  `package.json`, `vitest.config.ts`, `README.md`, `docs/stack.md` y este informe.
