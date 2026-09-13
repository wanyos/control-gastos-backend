# chore — `dotenv` sustituido por `process.loadEnvFile()` de Node 24 (2026-09-13)

Tarea de mantenimiento, no es una feature de `feature_list.json` (no se ha tocado).
Sin commit: lo hace el leader.

## Archivos modificados / creados

**Parte A: error de tipos con `@types/node` 24**
- `src/modules/movements/movements.test.ts`: en `listUrl`, el callback del `.map`
  lleva el tipo de retorno `: [string, string]`. Mismo comportamiento.

**Parte B: `dotenv` fuera**
- **Nuevo** `src/lib/load-env-file.ts`: exporta `loadEnvFileIfPresent(path = '.env')`,
  que llama a `loadEnvFile` de `node:process`. Si el archivo no existe
  (`code === 'ENOENT'`) devuelve `false`. Cualquier otro error se relanza. El módulo
  la llama al final, al importarse, así que basta con importarlo el primero (igual
  que antes con `import 'dotenv/config'`). No contiene la cadena `process.env`, así
  que respeta el test de `src/architecture.test.ts` que solo permite leer el entorno
  en `config/env.ts`.
- **Nuevo** `src/lib/load-env-file.test.ts`: 4 tests (usan archivos en `os.tmpdir()`
  y variables con nombre propio que borran al acabar). Cubren: carga un archivo que
  existe; no sobrescribe una variable que ya existe; un archivo que no existe
  devuelve `false` y no lanza; un error distinto (un directorio llamado `.env`) sí
  lanza.
- `src/server.ts`, `prisma.config.ts` (y su comentario), `prisma/seed-categories.ts`,
  `prisma/seed-category-rules.ts`, `vitest.global-setup.ts`: `import 'dotenv/config'`
  pasa a ser un import del módulo nuevo, en la misma posición.
- `vitest.config.ts`: `setupFiles: ['./src/lib/load-env-file.ts', './vitest.setup.ts']`,
  y sus comentarios reescritos.
- `src/lib/test-db.test.ts`: el test que protege el orden se llama ahora
  `runs vitest.setup.ts in every test file, after the .env is loaded`. Comprueba que
  `'./src/lib/load-env-file.ts'` está en `setupFiles` y va antes de `'./vitest.setup.ts'`.
- `src/architecture.test.ts`: `lib/load-env-file.ts` y `lib/load-env-file.test.ts`
  añadidos a la lista de archivos esperados, con su comentario.
- `scripts/get-drive-refresh-token.mjs`: llama a `loadEnvFile()` de `node:process`
  y solo ignora `ENOENT` (no puede importar TypeScript). La llamada va después de los
  `import` (en ESM los imports se evalúan antes que el cuerpo). El script solo lee
  las variables de Drive más abajo, así que no cambia nada.
- `package.json` / `pnpm-lock.yaml`: `pnpm remove dotenv`.
- Documentación: `README.md` (§Prisma 7), `docs/architecture.md` (consecuencias del
  ADR-002), `docs/stack.md` (carga de entorno y config de Vitest).

## Decisiones tomadas

- **`.env` ausente.** Lo he comprobado con Node 24.18.0. Sin archivo,
  `process.loadEnvFile()` lanza `ENOENT: no such file or directory, open '.env'` con
  `code: 'ENOENT'`. Con un directorio llamado `.env` lanza otro error,
  `TypeError ... code: 'ERR_INVALID_ARG_TYPE'`. Solo se ignora `ENOENT`: es lo único
  que `dotenv/config` también ignoraba. Cualquier otro fallo se ve y detiene el
  proceso.
- **Un solo módulo que carga al importarse**, y no una función a la que llame cada
  sitio. Hay dos motivos. `setupFiles` de Vitest necesita la ruta de un archivo que
  haga la carga al evaluarse. Y en `src/server.ts` y en los seeds, una llamada en el
  cuerpo del archivo iría después de todos los `import`, mientras que un import
  colocado el primero se evalúa antes que los demás. Efecto secundario: el test del
  módulo vuelve a cargar `.env` al importarlo. No hace daño, porque no sobrescribe
  variables que ya existen (entre ellas la `DATABASE_URL` que ha reescrito
  `vitest.setup.ts`).
- `dotenv` sigue en `pnpm-lock.yaml` como dependencia **transitiva** de
  `c12` (lo usa `prisma`). No es nuestra y no se puede quitar.
- Los docs tenían finales de línea CRLF en la copia de trabajo. He normalizado las
  líneas que añadí para que no quede un archivo con los dos tipos. Git guarda LF y el
  diff solo muestra las líneas cambiadas.

## Comprobaciones (ejecutadas)

**`bash ./init.sh`** (última pasada, después de todos los cambios): exit 0
```
[OK]    Type check OK (tsc sin errores)
[OK]    Lint OK
[OK]    Formato OK
 Test Files  61 passed (61)
      Tests  1180 passed (1180)
[OK]    Todos los tests pasan
[OK]    Entorno listo. Puedes empezar a trabajar.
```
1180 = los 1176 de antes + los 4 nuevos de `load-env-file.test.ts`. No hay ninguno
saltado.

**`git grep -n dotenv -- ':!pnpm-lock.yaml' ':!progress' ':!specs'`**: sin salida,
exit 1.

**Las variables de `test.env` ganan al `.env` y la base de datos se redirige.** Hice
un test temporal (`src/zz-envcheck.tmp.test.ts`, ya borrado) que escribía a un
archivo de `%TEMP%` los valores vistos dentro de un worker. Lo lancé con
`npx vitest run src/zz-envcheck.tmp.test.ts`: `Tests 1 passed`, y el archivo contenía:
```
LOG_LEVEL=silent DRIVE_ID=test-client-id.apps.googleusercontent.com ROOT=test-root-folder-id DB=/gastos_test_1 PORT_SET=true
```
El `.env` real define `LOG_LEVEL` y las 4 variables de Drive (solo miré los nombres,
no los valores), y en el test ganan los valores de `test.env`. `PORT` solo existe en
el `.env` (en la shell `PORT` estaba vacío), así que `PORT_SET=true` prueba que el
`.env` se cargó. `DB=/gastos_test_1` prueba que `vitest.setup.ts` reescribió la URL
después de cargarlo.

**El test del orden protege de verdad.** Invertí a mano `setupFiles` en
`vitest.config.ts` y lancé
`npx vitest run src/lib/test-db.test.ts -t "after the .env is loaded"`:
`AssertionError: expected 0 to be greater than 21` y `Tests 1 failed | 14 skipped`.
Después restauré el archivo desde la copia.

**El servidor arranca y lee el `.env`.** Ejecuté `PORT=3002 npx tsx src/server.ts` en
segundo plano. El log dice `PostgreSQL connection established (Prisma)` y
`Server listening at http://127.0.0.1:3002`.
`curl http://localhost:3002/health/db`:
```
{"status":"ok","database":"up"}
HTTP 200
```
Lo paré con `taskkill /PID 28776 /T /F`, el árbol del `tsx` de 3002 (28776 → 14952 →
27872). Después, `netstat` ya no mostraba nada escuchando en 3002. En 3000 no había
nada escuchando ni antes ni después, y no se tocó.

**Un `.env` ausente no rompe.** Lancé `tsx probe.mts`, que importa
`src/lib/load-env-file.ts` por ruta absoluta, desde tres directorios temporales:
- sin `.env`: `loaded ok, LOAD_ENV_CHECK=undefined`, exit 0
- con `.env` (`LOAD_ENV_CHECK=from-file`): `loaded ok, LOAD_ENV_CHECK=from-file`, exit 0
- con un directorio llamado `.env`: `TypeError: Contents of '...\.env' should be a valid string.`,
  `code: 'ERR_INVALID_ARG_TYPE'`, exit 1 (no se traga el error)

`node scripts/get-drive-refresh-token.mjs` desde un directorio sin `.env` imprime
`Missing GOOGLE_DRIVE_CLIENT_ID or GOOGLE_DRIVE_CLIENT_SECRET in .env. ...` (su
propia salida controlada, exit 1). No se cae por el `.env` ausente. **No lo he
comprobado con `.env` presente**: arrancaría el flujo OAuth, que abre un servidor y
pide consentimiento en el navegador.

**`npx prisma migrate status`**: exit 0
```
Loaded Prisma config from prisma.config.ts.
Datasource "db": PostgreSQL database "gastos", schema "public" at "localhost:5434"
7 migrations found in prisma/migrations
Database schema is up to date!
```
No se aplicó ninguna migración.

**No comprobado:** los seeds (`pnpm run seed:*`) no se han ejecutado, porque escriben
en la base de datos. Solo cambia su primer import, y tsc no los cubre
(`tsconfig` incluye solo `src/`).

## Sugerencias fuera de scope (NO aplicadas)

- Prisma avisa en `migrate status` de que hay una versión mayor nueva de Prisma.
