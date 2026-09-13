# Review — chore: `dotenv` sustituido por `process.loadEnvFile()` (2026-09-13)

**Veredicto:** RECHAZADO (CHANGES_REQUESTED)

Motivo único: dos documentos siguen diciendo que el proyecto admite Node 20, y
`package.json` ahora exige `>=24`. Se pidió que las docs no mintieran. Todo lo
demás, incluida la protección de la base real, lo he comprobado ejecutándolo y
está bien.

## Cambios requeridos

1. `README.md:9` dice `- Node.js >= 20 (probado con Node 24)`, pero
   `package.json` tiene ahora `"engines": { "node": ">=24" }`. Hay que ponerlo
   igual que `engines`.
2. `docs/stack.md:18` dice ``engines.node` exige `>=20``, y también es falso.
   De paso, `probado con v24.11.0` no coincide con el Node con el que se ha
   probado este cambio (`v24.18.0`, salida de `init.sh` más abajo).

Comprobado con:
```
$ git grep -n "20" -- README.md docs/stack.md | grep -iE "node"
README.md:9:- Node.js >= 20 (probado con Node 24)
docs/stack.md:18:- **Runtime:** Node.js — probado con `v24.11.0`; `engines.node` exige `>=20`.
```

## Observaciones que no bloquean

- `docs/stack.md` (bloque nuevo de «Carga de entorno») dice que
  `process.loadEnvFile()` es estable desde 24.10, pero `engines` admite 24.0–24.9.
  No lo he comprobado en esas versiones. Que el humano decida si `engines` debería
  ser `>=24.10`.
- `pnpm-lock.yaml` también sube `picomatch` de 4.0.5 a 4.0.7 (dependencia
  transitiva). Es un efecto de la reinstalación y no se pidió. No rompe nada:
  `init.sh` sale verde.
- `dotenv@17.4.2` sigue en `node_modules/.pnpm` como dependencia transitiva, tal
  como dice el informe del implementer.

## Comprobado sin hallazgos (con comando y salida)

### 1. `bash ./init.sh` completo: exit 0
```
[OK]    Runtime: v24.18.0
[OK]    feature_list.json válido (45 features)
[OK]    Type check OK (tsc sin errores)
[OK]    Lint OK
All matched files use Prettier code style!
[OK]    Formato OK
 Test Files  61 passed (61)
      Tests  1180 passed (1180)
[OK]    Todos los tests pasan
[OK]    Entorno listo. Puedes empezar a trabajar.
exit=0
```

### 2. `git grep -n dotenv` fuera de lockfile, `progress/` y `specs/`
```
$ git grep -n dotenv -- ':!pnpm-lock.yaml' ':!progress' ':!specs'
exit=1   (sin salida)
$ grep -rn dotenv src/lib/load-env-file*.ts     (archivos sin trackear)
(sin salida)
```

### 3. Los tests no tocan la base real con el mecanismo nuevo

Método: leí los contadores de escritura de `pg_stat_database` (solo `SELECT`,
ninguna escritura) justo antes y justo después de lanzar la suite con
`bash ./init.sh`. El script está en el scratchpad y lee el `.env` con
`process.loadEnvFile()`. Base del `.env`: `gastos` en `localhost:5434`.

| base | tup_inserted antes → después | tup_updated | tup_deleted |
|------|------------------------------|-------------|-------------|
| `gastos` (la real) | 205 → **205** | 257 → **257** | 6 → **6** |
| `gastos_test_1` | 1507 → 1538 | 256 → 260 | 1493 → 1523 |
| `gastos_test_2` | 2762 → 2886 | 347 → 369 | 2753 → 2876 |
| `gastos_test_3` | 2922 → 3012 | 265 → 266 | 2900 → 2986 |
| `gastos_test_4` | 2406 → 2534 | 295 → 310 | 2375 → 2502 |
| `gastos_test_5` | 2723 → 2789 | 216 → 224 | 2673 → 2739 |
| `gastos_test_6` | 2957 → 3143 | 332 → 349 | 2890 → 3074 |
| `gastos_test_7` | 3057 → 3173 | 440 → 481 | 3011 → 3124 |
| `gastos_test_8` | 2915 → 3168 | 360 → 368 | 2853 → 3106 |

Los 8 `gastos_test_*` reciben escrituras. En `gastos` no cambia ni una fila
insertada, actualizada o borrada. Solo sube `xact_commit` (12155 → 12179), que
corresponde a lecturas: la comprobación de `vitest.global-setup.ts` y mis dos
conexiones.

Por qué funciona, leído en el código y respaldado por la suite verde:
`vitest.config.ts` pone `setupFiles: ['./src/lib/load-env-file.ts', './vitest.setup.ts']`.
`vitest.setup.ts:25-43` lanza un error si no hay `DATABASE_URL` y la reescribe hacia
`gastos_test_<n>`. El test `src/lib/test-db.test.ts` («after the .env is loaded»)
exige ese orden y pasa. Además, el test «does not overwrite a variable that already
exists» de `load-env-file.test.ts` pasa, así que volver a importar el módulo en ese
archivo no puede deshacer la reescritura. **No he repetido** la prueba del
implementer de invertir `setupFiles`, porque exige editar `vitest.config.ts`.

El parser nativo lee el `.env` real igual que `dotenv`. Comparé los valores sin
imprimirlos, con `dotenv.parse` (copia transitiva 17.4.2) frente a
`process.loadEnvFile('.env')`:
```
DATABASE_URL IGUAL · PORT IGUAL · LOG_LEVEL IGUAL · GOOGLE_DRIVE_CLIENT_ID IGUAL
GOOGLE_DRIVE_CLIENT_SECRET IGUAL · GOOGLE_DRIVE_REFRESH_TOKEN IGUAL · GOOGLE_DRIVE_ROOT_FOLDER_ID IGUAL
```

### 4. Un `.env` ausente no rompe; cualquier otro error se ve

Usé `tsx probe.mts`, que importa `src/lib/load-env-file.ts` por URL `file://`, desde
tres directorios temporales:
```
== sin .env              -> loaded ok, PROBE_VAR=undefined   exit=0
== .env con PROBE_VAR    -> loaded ok, PROBE_VAR=from-file   exit=0
== .env es un directorio -> TypeError: Contents of '...\p-dir\.env' should be a valid string.
                            code: 'ERR_INVALID_ARG_TYPE'     exit=1
```
`scripts/get-drive-refresh-token.mjs`:
```
sin .env (y sin variables de Drive en el entorno):
  Missing GOOGLE_DRIVE_CLIENT_ID or GOOGLE_DRIVE_CLIENT_SECRET in .env. ...   exit=1  (su mensaje controlado)
.env es un directorio:
  node:internal/process/per_thread:362  _loadEnvFile();                        exit=1  (el error no se traga)
```
`prisma.config.ts` sigue cargando el `.env`:
```
$ env -u DATABASE_URL npx prisma migrate status
Loaded Prisma config from prisma.config.ts.
Datasource "db": PostgreSQL database "gastos", schema "public" at "localhost:5434"
7 migrations found in prisma/migrations
Database schema is up to date!
```
**No comprobado por mí:** los seeds (escriben en la base real) y el arranque de
`src/server.ts`. Del servidor, el implementer informa de una prueba en el puerto
3002. No lo he repetido para no arrancar procesos junto al del humano en el 3000.

### 5. Alcance
- `package.json`: coincide con lo pedido (`pg` en devDependencies,
  `@types/node` `^24.13.4`, `engines.node` `>=24`, `dotenv` fuera). `pg` solo lo
  importa `src/lib/test-db.ts`, que usan los tests y la config de Vitest. En
  ejecución lo trae `@prisma/adapter-pg`.
- `src/modules/movements/movements.test.ts:620`: solo añade el tipo de retorno
  `[string, string]`. El comportamiento no cambia.
- La carga vive en un único sitio reutilizable (`src/lib/load-env-file.ts`). La
  única copia es la de `scripts/get-drive-refresh-token.mjs`, justificada porque es
  `.mjs` y no puede importar TypeScript. La regla es la misma: solo ignora `ENOENT`.
- `src/architecture.test.ts` y `src/lib/test-db.test.ts`: solo lo necesario para el
  archivo nuevo y el nuevo nombre del primer `setupFile`.
- Convenciones: comentarios de código en inglés, import con extensión `.js`, sin
  `process.env` fuera de `config/env.ts` (lo vigila `architecture.test.ts`, que pasa).

---

## Segunda revisión (2026-09-13, después de que el leader corrigiera las docs)

**Veredicto:** APROBADO

Se ha corregido el único motivo de rechazo. El resto del cambio no se ha tocado:
`git status --short` muestra los mismos archivos que en la primera revisión, más
este informe.

### Comprobado (comando y salida)

**El diff de las dos líneas corregidas**
```
$ git diff -- README.md docs/stack.md
-- Node.js >= 20 (probado con Node 24)
+- Node.js >= 24 (probado con Node 24.18). vitest 5 exige `^22.12` y `@googleapis/drive` 25 exige `>=22`, y la carga del `.env` usa `process.loadEnvFile()`, estable desde Node 24.10
-- **Runtime:** Node.js — probado con `v24.11.0`; `engines.node` exige `>=20`.
+- **Runtime:** Node.js — probado con `v24.18.0`; `engines.node` exige `>=24` (desde el 2026-09-13: vitest 5 pide `^22.12`, `@googleapis/drive` 25 pide `>=22` y `process.loadEnvFile()` es estable desde `24.10`).
```

**No quedan menciones a Node 18, 20 o 22 como requisito en README.md, docs/ ni AGENTS.md**
```
$ git grep -nE "Node(\.js)?[^|]{0,15}(20|22)\b|>= ?20|>= ?22|v20|v22|node.?20|node.?22" -- README.md docs AGENTS.md
README.md:9:      (la línea corregida)
docs/stack.md:18: (la línea corregida)
$ git grep -niE "node[^a-z]{0,4}(v)?(18|20|22)\b|engines" -- README.md docs AGENTS.md   (sin contar esas dos líneas)
(sin salida, exit=1)
```

**Las razones que dan las docs coinciden con lo instalado**
```
vitest 5.0.0 {"node":"^22.12.0 || ^24.0.0 || >=26.0.0"}
@googleapis/drive 25.0.0 {"node":">=22.0.0"}
package.json engines: { node: '>=24' }
```
Nota que no bloquea: el requisito real de vitest es `^22.12.0 || ^24.0.0 || >=26.0.0`,
no solo `^22.12`. Con `engines >=24` da igual, porque Node 24 está dentro de ese
rango. La observación de la primera revisión sigue abierta: la línea de las docs
dice que `process.loadEnvFile()` es estable desde 24.10, pero `engines` admite
24.0–24.9. No lo he comprobado en esas versiones y lo decide el humano.

**`bash ./init.sh` completo: exit 0**
```
[OK]    Runtime: v24.18.0
[OK]    Type check OK (tsc sin errores)
[OK]    Lint OK
[OK]    Formato OK
 Test Files  61 passed (61)
      Tests  1180 passed (1180)
[OK]    Todos los tests pasan
[OK]    Entorno listo. Puedes empezar a trabajar.
```

### Comprobado sin hallazgos
Todo lo de la primera revisión se mantiene: la protección de la base real
(contadores de `pg_stat_database`), el `.env` ausente frente a otros errores,
`git grep dotenv`, el alcance y las convenciones. No lo he vuelto a ejecutar,
salvo `init.sh`, porque desde entonces solo han cambiado esas dos líneas de
documentación.
