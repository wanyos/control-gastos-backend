# dependency-upgrade-2026-10 — implementación

Tarea de mantenimiento aprobada por el humano el 2026-10-28, sin feature en
`feature_list.json`. Sin commit. No se ha escrito en la base del humano ni en sus
carpetas de datos: todo lo ejecutado son instalaciones, `prisma generate` y la
suite (que usa sus bases desechables).

## Archivos modificados / creados

- `package.json` — quitado `packageManager`; subidos los rangos de la tabla de abajo.
- `pnpm-lock.yaml` — reinstalado; quitado el primer documento YAML (ver §Lockfile).
- `src/generated/prisma/` — regenerado con `prisma generate` 7.10.1 (no está en git).
- `docs/stack.md` — versiones y el párrafo del gestor de paquetes.
- `docs/roadmap.md` — texto del cabo 27 con el `pnpm audit` medido.
- Este informe.

## Versiones antes / después

| Paquete | Antes (instalada) | Después (instalada) | Rango en `package.json` |
|---|---|---|---|
| `@prisma/adapter-pg` | 7.10.0 | 7.10.1 | `^7.10.1` |
| `@prisma/client` | 7.10.0 | 7.10.1 | `^7.10.1` |
| `prisma` | 7.10.0 | 7.10.1 (existe; `latest` es 8.0.0-rc.28, no se sube) | `^7.10.1` |
| `fastify` | 5.12.5 | 5.12.7 | `^5.12.7` |
| `fastify-plugin` | 6.0.0 | 6.0.1 | `^6.0.1` |
| `pg` | 8.23.0 (una copia, compartida con `@prisma/adapter-pg`) | 8.23.1, una sola copia: la usan la devDependency y `@prisma/adapter-pg` (corregido tras la revisión; antes de corregirlo el adaptador seguía en una segunda copia 8.23.0, ver §Tras la revisión) | `^8.23.1` |
| `prettier` | 3.9.8 | 3.9.10 | `^3.9.10` |
| `vitest` | 5.0.1 | 5.0.5 | `^5.0.5` |
| `oxlint` | 1.83.0 | 1.90.0 | `^1.90.0` |
| `@googleapis/drive` | 26.0.0 | 27.0.0 | `^27.0.0` |
| `@types/node` | 24.13.4 | 24.13.4 (sin tocar) | `^24.13.4` |

Salida de `pnpm install` tras cambiar los rangos (pnpm 11.22.0): las diez líneas
`- x / + y` de la tabla, y `prisma 7.10.1 (8.0.0-rc.28 is available)`.
`pnpm-workspace.yaml` no ha cambiado (ninguna versión entró por la lista de
excepciones de `minimumReleaseAge`).

Versiones comprobadas después con los binarios: `oxlint --version` → 1.90.0,
`prettier --version` → 3.9.10, `vitest --version` → `vitest/5.0.5 win32-x64 node-v24.18.0`,
`prisma --version` → `prisma 7.10.1`, `@prisma/client 7.10.1`.

## Lockfile: qué pasó con el rastro de `packageManager`

1. **Al quitar el campo, el pnpm que corre cambia.** Con `packageManager` puesto,
   `pnpm -v` daba `12.5.1` (pnpm descargaba y ejecutaba la versión fijada). Sin
   él, `pnpm -v` da **`11.22.0`**: es el que está instalado en este equipo
   (`/c/Program Files/nodejs/pnpm`, y otro en `AppData/Roaming/npm/pnpm`). Todas
   las instalaciones de esta tarea se han hecho con 11.22.0.
2. **El rastro no desaparece solo.** Comprobado tres veces: `pnpm install`
   («Lockfile is up to date, resolution step is skipped»), `pnpm install --fix-lockfile`
   («Already up to date») y el `pnpm install` que resolvió las versiones nuevas
   dejaron igual el bloque. Tampoco lo quita pnpm 12.5.1: en una copia en el
   directorio temporal, `npx pnpm@12.5.1 install --lockfile-only` lo dejó (43
   líneas con `packageManagerDependencies` / `@pnpm/exe`, las mismas).
3. **Por qué.** El rastro no está mezclado con las dependencias: es un **primer
   documento YAML aparte** dentro de `pnpm-lock.yaml` (líneas 1–157, separado del
   lockfile normal por `---`), con `importers['.'].configDependencies: {}`,
   `packageManagerDependencies.pnpm 12.5.1`, y los paquetes `pnpm@12.5.1` y los
   catorce `@pnpm/exe.*@12.5.1`. La documentación de pnpm (consultada con
   `npx ctx7@latest docs /pnpm/pnpm.io` y `/pnpm/pnpm/v12.0.0`) dice que la
   versión resuelta de `packageManager` / `devEngines.packageManager` se guarda
   en `packageManagerDependencies` y se reutiliza, pero **no dice nada de
   borrarla cuando se quita el campo**. Lo comprobado es que ni pnpm 11.22.0 ni
   12.5.1 la borran; no he encontrado en la documentación por qué.
4. **Cómo se ha quitado.** Borrando a mano ese primer documento (se queda desde
   `lockfileVersion: '9.0'` del segundo). Antes lo probé en dos copias en el
   directorio temporal: ni pnpm 11.22.0 ni 12.5.1 lo vuelven a escribir. En el
   repositorio, después de borrarlo:
   - `pnpm install` → `Already up to date`, y el lockfile resultante es **idéntico**
     al documento principal que había antes de borrar (`diff` vacío).
   - `pnpm install --frozen-lockfile` (11.22.0) → `Already up to date`.
   - `npx pnpm@12.5.1 install --frozen-lockfile` → `Lockfile is up to date, resolution step is skipped`.
   - `cmp` del lockfile antes y después de esas dos instalaciones: igual.
   - `grep -c "packageManagerDependencies\|@pnpm/exe" pnpm-lock.yaml` → `0`.
   - El lockfile queda empezando por `lockfileVersion: '9.0'`, como antes del
     commit `c509d4b` que trajo el bloque.

   Nota: en las copias del directorio temporal (sin `node_modules`),
   `pnpm install --lockfile-only` volvió a resolver todo y subió dependencias de
   otras (por ejemplo `@types/node` a 24.19.2, `@fastify/ajv-compiler` 4.0.7).
   Por eso en el repositorio no se usó `--lockfile-only` ni se regeneró el
   lockfile: el borrado a mano no cambia ninguna versión.

Otras menciones: `grep -rn -i "packageManager\|corepack"` fuera de
`node_modules`, `.git`, `progress` y `specs` solo encontró `package.json:27` y
`docs/stack.md:52`. Ninguna de `corepack`.

## @googleapis/drive 27: qué cambia y si nos toca

`CHANGELOG.md` del paquete 27.0.0 (2026-10-19): «⚠ BREAKING CHANGES — drive: This
release has breaking changes» y «Features — drive: update the API» (commit
`a907551`). No dice cuál. Entre 26.0.0 y 27.0.0 están además 26.0.1 y 26.0.2,
las dos «drive: update the API».

Como el changelog no lo concreta, descargué los dos paquetes (`npm pack`, en el
directorio temporal) y comparé su contenido:

- `package.json`: mismas `dependencies` (`googleapis-common ^9.0.0`) y mismo
  `engines` (`node >=22.0.0`). Solo cambia una dependencia de desarrollo suya
  (`webpack-cli` ^5 → ^7), que no se instala en este proyecto.
- `v3.ts` (la API Drive v3 que usamos): **solo cambian comentarios**, ni un tipo
  ni una firma. Los cinco campos de `Schema$Approval` (`completeTime`,
  `createTime`, la conducta al cambiar el contenido, `modifiedTime`, `status`)
  dejan de decir «Output only»; `copyComments` pasa a decir que copia solo los
  comentarios abiertos; y los avisos de los métodos de permisos sobre cambios
  concurrentes se reescriben.
- `v2.ts`: lo mismo en comentarios. `index.ts` y `build/index.js`: se borra un
  comentario `// TODO: delete this comment`.
- Lo «breaking» parece ser que la API de Google pasa a aceptar escribir los campos
  de aprobaciones (antes de solo lectura). Es una deducción del diff, no lo dice
  el changelog.

Lo que usamos (`git grep`): `auth.OAuth2` en `src/lib/drive.ts` y en
`scripts/get-drive-refresh-token.mjs`; `files.list`, `files.create`,
`files.update` y `files.get` (también con `alt: 'media'`) en
`src/lib/drive-structure.ts` y `src/modules/backup/backup.drive.ts`, que usan la
ingesta, la importación y `scripts/db-backup.ts` / `scripts/db-restore.ts`.
`src/plugins/drive.ts` expone el cliente. **No usamos aprobaciones, permisos ni
copia de archivos**, así que nada de lo que cambia nos toca. `tsc` pasa sin
errores con la 27.

### Prueba real que le queda al humano

Los tests usan un Drive simulado, así que la 27 no se ha probado contra Google.
Hace falta, con su Drive y su `.env`:

1. `pnpm run dev` y lanzar una ingesta que lea su carpeta de Drive (lista
   carpetas y archivos, descarga uno con `alt: 'media'`, y mueve el procesado:
   `files.update`). Ver que el archivo acaba en la carpeta que toca y el
   movimiento entra.
2. `pnpm run db:backup`: tiene que crear una copia nueva en la carpeta de copias
   de Drive (`files.create`) y listarla (`files.list`).
3. `pnpm run db:restore` contra una base aparte (como en la prueba de la F55):
   descarga la copia (`files.get`) y restaura.
4. Si el refresh token caduca o se renueva: `node scripts/get-drive-refresh-token.mjs`
   (usa `auth.OAuth2`).

## pnpm audit --prod

| Momento | Total | high | moderate | low |
|---|---|---|---|---|
| Antes (2026-10-28) | 34 | 16 | 13 | 5 |
| Después | 30 | 14 | 12 | 4 |

Salidas literales: antes `34 vulnerabilities found` / `Severity: 5 low | 13 moderate | 16 high`;
después `30 vulnerabilities found` / `Severity: 4 low | 12 moderate | 14 high`.

Desaparecen: `mysql2` (1 high, 1 moderate) y `deepmerge-ts` (1 high), que traía
@prisma/client, y `fastify` (1 low). Quedan (de `pnpm audit --prod --json` y
`pnpm why --prod`): `fast-uri` 3.1.5 y 4.1.2 (20 avisos; por `ajv` desde fastify
y desde prisma), `brace-expansion` 1.1.18 / 2.1.4 (6) y `uuid` 8.3.2 (1) de
exceljs, y `qs` 6.15.3 (3) de `googleapis-common` (@googleapis/drive). Son
versiones de dependencias de otras que fija el lockfile; subirlas no entraba en
la tarea y no he comprobado si las corregidas caben en sus rangos. Cabo 27 de
`docs/roadmap.md` actualizado con estas cifras, sin cerrar.

## Documentos actualizados

`git grep -n -E "5\.12\.5|7\.10\.0|7\.9\.1|8\.23\.0|fastify-plugin@\^6\.0\.0|drive@\^26|drive\W+26|1\.83|3\.9\.8|5\.0\.1|12\.5\.1|pnpm 12|pnpm@12"`
fuera de `progress/`, `specs/` y el lockfile:

- `docs/stack.md:17` Fastify `^5.12.5` → `^5.12.7`.
- `docs/stack.md:18` «`@googleapis/drive` 26 pide `>=22`» → «26 y 27 piden `>=22`».
- `docs/stack.md:22-23` Prisma y adapter `^7.9.1` (ya estaba desfasado) → `^7.10.1`; `pg@^8.23.0` → `^8.23.1`.
- `docs/stack.md:29` `fastify-plugin@^6.0.0` → `^6.0.1`.
- `docs/stack.md:30` `@googleapis/drive@^26.0.0` → `^27.0.0`.
- `docs/stack.md:51-52` pnpm: sin versión fijada; probado con 11.22.0 y 12.5.1.
- `docs/stack.md` oxlint `^1.83.0` → `^1.90.0`; Prettier `3.9.8` → `3.9.10`; Vitest `^5.0.1` → `^5.0.5`.
- `docs/roadmap.md` cabo 27.

No corregidas, a propósito: `pnpm-workspace.yaml:19-21` (comentario con lo que se
repasó el 2026-09-20 y el 2026-09-30; es historial y sigue siendo verdad); y
coincidencias que son importes de tests (`101.83`, `1.83`, `41.83`).

## oxlint 1.90.0

`pnpm exec oxlint` → sin salida, código de salida 0. Con `--format=json`:
`diagnostics: []`, 217 archivos, **96 reglas**. Con `npx oxlint@1.83.0 --format=json`
en el mismo árbol: también 217 archivos y 96 reglas, sin diagnósticos. No entra
ninguna regla nueva en `correctness` con nuestra configuración y no se ha
desactivado ninguna.

## Último ./init.sh

Primera pasada (`./init.sh`, código de salida 1): tsc OK, `pnpm run lint` OK,
`pnpm run format:check` OK («All matched files use Prettier code style!»); en la
suite fallan 3 tests, los tres de `src/no-real-data.test.ts` y los tres por
tiempo:

```
FAIL  src/no-real-data.test.ts > ... > copies no telling phrase of the database
Error: Test timed out in 5000ms.
FAIL  src/no-real-data.test.ts > ... > repeats no IBAN of the database
Error: Test timed out in 5000ms.
FAIL  src/no-real-data.test.ts > ... (feature 24) > the real parsers of this repository do feed that vocabulary
Error: Test timed out in 5000ms.
 Test Files  1 failed | 90 passed (91)
      Tests  3 failed | 1484 passed (1487)
```

Ese archivo solo, `pnpm exec vitest run src/no-real-data.test.ts`:

```
 Test Files  1 passed (1)
      Tests  36 passed (36)
   Duration  7.65s
```

Segunda pasada de `./init.sh` completa, código de salida **0**:

```
 Test Files  91 passed (91)
      Tests  1487 passed (1487)
[OK]    Entorno listo. Puedes empezar a trabajar.
```

`pnpm exec prisma generate` antes de la suite: `✔ Generated Prisma Client (7.10.1) to .\src\generated\prisma`.

## Último ./init.sh --checks

No aplica: no hay feature.

## Tras la revisión (2026-10-28)

Pedido en `progress/reviews/dependency-upgrade-2026-10.md`: una sola copia de
`pg` en 8.23.1, también para `@prisma/adapter-pg`, sin mover ninguna otra versión.

**Antes de corregir**, `pnpm why pg`:

```
pg@8.23.0
├─┬ @prisma/adapter-pg@7.10.1
│ └── gastos-backend@1.0.0 (dependencies)
└─┬ pg-pool@3.14.0 peer#4173 (2 variations)
  └── pg@8.23.0 [circular]

pg@8.23.1
├── gastos-backend@1.0.0 (devDependencies)
└─┬ pg-pool@3.14.0 peer#3fae (2 variations)
  └── pg@8.23.1 [circular]

Found 2 versions of pg
```

Lo que se ve: `pnpm install` (11.22.0) subió la `pg` directa y dejó la del
adaptador en la 8.23.0 que ya tenía resuelta, que cabe en su rango `^8.16.3`.
No lo he contrastado con la documentación de pnpm.

**`pnpm dedupe` no se ha aplicado** porque mueve más de lo pedido.
`pnpm dedupe --check` (no escribe; `cmp` del lockfile antes y después: igual) dice:

```
@prisma/adapter-pg@7.10.1
└── pg 8.23.0 → 8.23.1

@types/pg@8.23.1
├── @types/node 26.2.0 → 24.13.4
└── pg-protocol 1.16.0 → 1.16.1

- @types/node@26.2.0
- pg-cloudflare@1.4.0
- pg-connection-string@2.14.0
- pg-pool@3.14.0(pg@8.23.0)
- pg-protocol@1.16.0
- pg@8.23.0
- undici-types@8.3.0
```

Lo que movería de más: las dependencias de `@types/pg` (`@types/node` 26.2.0 →
24.13.4 y `pg-protocol` 1.16.0 → 1.16.1), y quitaría `@types/node@26.2.0`,
`pg-protocol@1.16.0` y `undici-types@8.3.0`.

**Lo aplicado: edición a mano del lockfile**, solo en lo de `pg`:

1. `pnpm-lock.yaml`, entrada `@prisma/adapter-pg@7.10.1` de `snapshots:`:
   `pg: 8.23.0` → `pg: 8.23.1`.
2. `pnpm install` → `Packages: +1 -4`, y `node_modules` queda con una sola `pg`.
   pnpm no borró del lockfile las entradas que se quedaban sin usar, así que las
   quité a mano (script en el directorio temporal, sin tocar nada más):
   `pg@8.23.0` (en `packages:` y `snapshots:`), `pg-pool@3.14.0(pg@8.23.0)`
   (`snapshots:`), `pg-cloudflare@1.4.0` y `pg-connection-string@2.14.0` (las dos
   secciones). Solo las usaba `pg@8.23.0`. `pg-protocol@1.16.0` **se queda**: la
   sigue usando `@types/pg@8.23.1`.

`diff` del lockfile antes y después de la corrección: 1 línea cambiada (la del
adaptador) y 35 borradas, todas de esas cuatro entradas.

**Comprobaciones:**

- `pnpm why pg`:
  ```
  pg@8.23.1
  ├─┬ @prisma/adapter-pg@7.10.1
  │ └── gastos-backend@1.0.0 (dependencies)
  ├── gastos-backend@1.0.0 (devDependencies)
  └─┬ pg-pool@3.14.0
    └── pg@8.23.1 [circular]

  Found 1 version of pg
  ```
  `pnpm why pg-pool` → `Found 1 version of pg-pool`.
- Comparación de los `paquete@versión` de la sección `packages:`, la misma del
  reviewer:
  - Contra el lockfile de antes de la corrección: solo desaparecen
    `pg-cloudflare@1.4.0`, `pg-connection-string@2.14.0` y `pg@8.23.0`. Ninguna
    entra ni cambia.
  - Contra `HEAD` (465 entradas → 462): lo mismo que encontró el reviewer, salvo
    lo de `pg`, que ahora queda `pg-cloudflare` 1.4.0 → 1.4.1,
    `pg-connection-string` 2.14.0 → 2.14.1, `pg` 8.23.0 → 8.23.1 (sustituidas, ya
    no duplicadas) y `pg-protocol@1.16.1` nueva junto a 1.16.0. `pg-pool@3.14.0`,
    `pg-types@2.2.0`, `pgpass@1.0.5` y `pg-int8@1.0.1` no cambian. `@types/node`
    sigue con sus tres copias.
- `pnpm install` y `pnpm install --frozen-lockfile` en el repositorio → `Already up to date`
  las dos; `cmp` del lockfile antes y después: igual.
- En copias en el directorio temporal sin `node_modules` (`package.json`,
  `pnpm-lock.yaml`, `pnpm-workspace.yaml`):
  `pnpm install --frozen-lockfile --ignore-scripts` → exit 0, `Done in 6.3s using pnpm v11.22.0`;
  `npx pnpm@12.5.1 install --frozen-lockfile --ignore-scripts` → `Done in 10.7s using pnpm v12.5.1`.
  `cmp` contra el lockfile del repositorio: igual tras las dos. En
  `node_modules/.pnpm` solo hay `pg@8.23.1` y `pg-pool@3.14.0_pg@8.23.1`.
- `pnpm audit --prod` → `30 vulnerabilities found` / `Severity: 4 low | 12 moderate | 14 high`
  (igual que antes de corregir; el cabo 27 no cambia).
- `docs/stack.md:23` («`@prisma/adapter-pg@^7.10.1` sobre `pg@^8.23.1`»): ahora
  es cierto; no hace falta cambiarlo.
- `./init.sh` completo, código de salida 1: tsc OK, `pnpm run lint` OK,
  `pnpm run format:check` OK; falla 1 test, de `src/no-real-data.test.ts`, por tiempo:
  ```
  FAIL  src/no-real-data.test.ts > the guardian tells our own words from his data inside a message (feature 24) > the real parsers of this repository do feed that vocabulary
  Error: Test timed out in 5000ms.
   Test Files  1 failed | 90 passed (91)
        Tests  1 failed | 1486 passed (1487)
  ```
  Ese archivo solo, `pnpm exec vitest run src/no-real-data.test.ts`, exit 0:
  ```
   Test Files  1 passed (1)
        Tests  36 passed (36)
     Duration  6.01s
  ```

## Sugerencias fuera de scope (NO aplicadas)

- Los avisos que quedan del cabo 27 son de versiones de dependencias de otras
  fijadas en el lockfile; se podría probar a subir solo esas (`fast-uri`, `qs`,
  `brace-expansion`, `uuid`) en un cambio aparte y medir si alguna cabe en su rango.
- `src/no-real-data.test.ts` se pasa de 5 s en la suite completa, pero no cuando corre solo; si
  se repite, quizá merezca un `testTimeout` propio en esos tres tests.
