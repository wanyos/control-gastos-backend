# Mantenimiento del repo — candidatos a borrar o simplificar (2026-08-21)

> **Exploración de solo lectura.** No se ha borrado, movido ni editado nada:
> ni un archivo, ni una base de datos, ni una línea de `feature_list.json`.
> Todo lo de abajo es una **propuesta con evidencia**. Decide el humano.
>
> 🔒 ADR-017: aquí no hay ni un dato real. Solo recuentos, nombres de archivo y
> forma. Los ficheros de `var/` se cuentan, no se abren ni se citan.

## Cómo leer esto

| Clase | Qué significa |
|---|---|
| 🟢 **seguro** | La evidencia dice que no lo usa nadie. Borrarlo no rompe nada que se haya podido comprobar. |
| 🟡 **a decidir** | Sobra o está desactualizado, pero hay un criterio detrás (memoria del proyecto, plantilla del harness, coste de mantener). |
| 🔴 **no tocar** | Parece muerto y **no lo está**. Se documenta aquí precisamente para que nadie lo borre en la próxima limpieza. |

**Recuento:** 6 seguros · 8 a decidir · 7 avisos de «no tocar».

**Lo que más peso quita:** la base `gastos_f26` (8,3 MB en el contenedor, vacía),
seguida de `dist/` (107 KB de una compilación de julio, de la era anterior al
inglés) y `tsconfig.tsbuildinfo` (207 KB). Nada de ello está versionado: el peso
es de disco, no del repositorio.

---

## 1. Código muerto en `src/`

Método: para **cada símbolo exportado** de cada archivo no-test de `src/`
(`git ls-files 'src/**/*.ts'`, excluidos los `.test.ts`), se ha contado cuántas
veces aparece el identificador en todo `src/`. Un símbolo con **una sola
aparición** es su propia declaración: no lo usa nadie, ni siquiera su archivo.

### 🟢 Seguro

| Qué | Dónde | Evidencia | Qué se rompería |
|---|---|---|---|
| `myinvestorSampleFixture()` | [`src/modules/myinvestor/myinvestor.fixture.ts:125`](../../src/modules/myinvestor/myinvestor.fixture.ts#L125) | **Única aparición en todo el repo.** Ni un test la importa, ni el propio fixture la llama, ni aparece en `docs/`, `specs/` ni `progress/`. Es el **único** símbolo exportado de `src/` en esa situación. | Nada. Es un helper de test huérfano. Único matiz: al borrarlo hay que comprobar si deja imports sin usar en la cabecera del fixture (`oxlint` lo dirá). |

### 🔴 No tocar (parecen muertos y no lo son)

Estos salieron en la primera pasada como «no los importa nadie desde otro
archivo» y **están perfectamente vivos**. Se listan para que no vuelvan a salir:

| Qué | Por qué NO está muerto |
|---|---|
| `src/server.ts` | **Ningún archivo de `src/` lo importa** — es el *entrypoint*. Lo invocan `pnpm run dev` (`tsx watch src/server.ts`) y `pnpm start` (`node dist/server.js`, ver `"main"` de `package.json`). |
| `resolveAccount`, `persistMovements` ([`import.service.ts:133`](../../src/modules/import/import.service.ts#L133), [`:174`](../../src/modules/import/import.service.ts#L174)) | Exportados y usados **dentro de su propio archivo** (`:450`, `:454`), desde `importFile`. La exportación es para poder testearlos por separado. |
| `findFolder` ([`drive-structure.ts:158`](../../src/lib/drive-structure.ts#L158)) | Usado dos veces en su propio archivo (`:198`, `:274`) y documentado en `docs/architecture.md` §367 como la pieza de idempotencia. |
| `templateDatabaseName` ([`test-db.ts:31`](../../src/lib/test-db.ts#L31)) | Es el nombre de la base plantilla de la F27. Se usa tres veces en el mismo archivo. Tocarlo rompe la suite entera. |
| Los `*RoutesOptions` (`ImportRoutesOptions`, `N26RoutesOptions`, `OpenbankRoutesOptions`, `BankinterRoutesOptions`, `MyinvestorRoutesOptions`, `TradeRepublicRoutesOptions`, `IngestionRoutesOptions`) | Tipos de las opciones del plugin, usados **en la firma de la función del propio archivo**. Se exportan para que los tests puedan construirlas. |
| `src/architecture.test.ts`, `src/no-real-data.test.ts`, `src/modules/trade-republic/trade-republic.docs.test.ts` | **Guardianes.** Nadie los importa: los ejecuta Vitest. `no-real-data.test.ts` **recorre el repositorio entero** (docs, specs, progress, prisma) y además lee `var/drive-read/` y `var/parsed/`; `architecture.test.ts` tiene el **árbol de `src/` clavado en un array** (`:39`) y falla si aparece o desaparece un archivo; `trade-republic.docs.test.ts` lee `docs/trade-republic-product-files.md`, `docs/conventions.md` y `docs/plantillas/trade-republic-cuenta-remunerada.json` **byte a byte** (`:15`, `:25`, `:118`, `:126`). |
| Los tres `*.format.ts` casi gemelos (`myinvestor`, `n26`, `openbank`) y `n26.csv.ts` / `openbank.html.ts` | **Duplicación deliberada**, no sedimento: `docs/conventions.md` §Parsers de banco prohíbe compartir código de lectura de formato entre bancos. Los propios archivos lo dicen en su cabecera. Unificarlos sería un cambio de arquitectura, no una limpieza. |

> ⚠️ **Cualquier borrado en `src/` toca `architecture.test.ts`.** El árbol
> esperado está escrito a mano en el test. Borrar un archivo sin actualizar el
> array pone la suite en rojo con un diff de rutas.

También se comprobaron los dos tests que parecen huérfanos (sin archivo fuente
hermano) y **no lo son**: `investments.model.test.ts` prueba el esquema de
inversiones, que no tiene endpoints (F9, ADR-012), y `myinvestor.import.test.ts`
es el extremo a extremo de la F29 contra el registro real de `src/app.ts`.

---

## 2. Archivos generados o de trabajo

**Ninguno está en el índice de git.** Comprobado con
`git ls-files | grep -Ei '^(dist|var|src/generated)/|tsbuildinfo'` → **0 resultados**.
`git status --ignored` confirma que lo único ignorado fuera de `node_modules/`
es: `.env`, `dist/`, `src/generated/`, `tsconfig.tsbuildinfo`, `var/`.
Todos están cubiertos por `.gitignore`. **No hay nada versionado que no debiera estarlo.**

### 🟢 Seguro

| Qué | Peso | Evidencia | Qué se rompería |
|---|---|---|---|
| `dist/` | 107 KB, 32 archivos | **Compilación fósil.** Contiene `dist/routes/gastos.js` y `dist/generated/prisma/models/Gasto.js` / `Categoria.js`: nombres **en español**, de antes de la migración al inglés (F12). Esas rutas y esos modelos **ya no existen** en `src/`. `find dist -type f -newermt 2026-08-01` → **0 archivos**. Está en `.gitignore` y en `.prettierignore`. | Nada. Se regenera con `pnpm run build`. Solo `pnpm start` lo necesita, y hoy arrancaría **la app de julio**: mientras siga ahí, `pnpm start` es una trampa, no una comodidad. |
| `tsconfig.tsbuildinfo` | 207 KB | Caché incremental de `tsc`. Ignorado explícitamente (`.gitignore` §«Artefacto de compilacion incremental»). | Nada. La siguiente pasada de `init.sh` (`tsc --noEmit --incremental`) lo reescribe; solo se pierde el arranque en caliente de una pasada. |

### 🟡 A decidir

| Qué | Evidencia | Riesgo |
|---|---|---|
| `var/backups/…-antes-f26.dump` (36 KB, 1 archivo) | Volcado tomado **antes** de la F26, cuando aún no existía la garantía «los tests no tocan tu base» (F27, ADR-027). Ignorado por `.gitignore` §«Copias de seguridad… datos reales, NUNCA se versionan». | Es **tu red de seguridad de aquella tarde**. Desde la F27 la suite ya no puede escribir en `gastos`, así que su razón de ser ha caducado — pero es un backup de datos tuyos: se tira cuando tú digas, no antes. |
| `var/parsed/` (192 KB; 5 bancos, entre 1 y 2 archivos cada uno) | Volcados de las pasadas en seco (`POST /api/parser/*`). | 🔴 **NO borrar a ciegas.** `no-real-data.test.ts:515` los usa: `bankCoverage()` considera un banco «vigilado» si su descarga se lee como texto **o** si existe su volcado en `var/parsed/<banco>/`. Quitar el volcado de un banco cuyo fichero es binario lo convierte en *unwatched* y **pone el guardián en rojo** (ese es exactamente el escenario para el que se abrió la F23). |
| `var/drive-read/` (419 KB; 6 carpetas de banco, entre 1 y 6 archivos cada una) | Copias locales de tus ficheros reales de banco. | 🔴 **No es basura: es la entrada de `POST /api/import/local`** (reimportar sin Drive) y la fuente del guardián. Borrarlo deja `bankCoverage()` en `[]` — el guardián **no falla, se calla**, que es peor. Contiene datos tuyos: si algún día se limpia, se limpia entero y a mano. |

---

## 3. Documentación en `docs/`

### 🟡 A decidir — `README.md` está desactualizado (lo más claro de esta pasada)

Comparado con las rutas realmente registradas en [`src/app.ts:82-96`](../../src/app.ts#L82):

- La tabla de endpoints del README **no menciona** `POST /api/import/local`,
  `POST /api/parser/n26`, `POST /api/parser/openbank` ni
  `POST /api/parser/trade-republic`. Se quedó en los dos primeros bancos.
- El árbol «Estructura del proyecto» **no tiene** `modules/n26/`,
  `modules/openbank/` ni `modules/trade-republic/`, y describe `lib/` como
  «fábricas de infraestructura» cuando hoy contiene además el contrato
  `parsed-statement.ts`, `utf8.ts`, `cp1252.ts`, `iban.ts` y `test-db.ts`.
- **Riesgo:** ninguno técnico — **ningún test lee `README.md`**. El riesgo es el
  contrario: es la primera página que ve alguien de fuera, y hoy le enseña un
  backend de dos bancos cuando hay cinco. **Propuesta: actualizar, no borrar.**
- `docs/api-contract.md` **sí** tiene los 16 endpoints: no hay contradicción
  entre contrato y código, solo entre README y código.

### 🔴 No tocar — las tres plantillas SÍ las usa el harness

Se comprobó una por una con `grep` sobre todo el repo (excluido `node_modules`):

| Plantilla | Quién la referencia de verdad |
|---|---|
| `docs/decisions-template.md` | `.claude/agents/spec-author.md` (×3, es su formato de salida), `.claude/agents/reviewer.md:49` (lo **verifica**), `CHECKPOINTS.md:87` (C7: «máx. 6 puntos 🔴»), `AGENTS.md:37`, `docs/specs.md` (×3), `specs/README.md:11`. |
| `docs/intent-template.md` | `.claude/agents/leader.md` (×2), `.claude/agents/spec-author.md:46`, `docs/specs.md` (×2) y **`feature_list.json:8`**, en la regla `human_writes_intent_first`. |
| `docs/summary-template.md` | `.claude/agents/reviewer.md:103` (es el formato de `progress/summaries/<feature>.md`), `CHECKPOINTS.md:101` (C8), `docs/specs.md:65`. |

**Ninguna de las tres sobra.** Son piezas activas del flujo, no restos.

### 🔴 No tocar — `docs/plantillas/trade-republic-cuenta-remunerada.json`

Un `.json` suelto que parece un ejemplo de adorno. **Lo lee un test**:
`trade-republic.docs.test.ts:126`,
`describe('docs/plantillas/… — the copyable file (R1)')`, atado byte a byte al
documento y al fixture. Borrarlo o reformatearlo rompe la suite.

### 🟡 A decidir — solapamiento real, pero con criterio detrás

| Par | Qué comparten | Veredicto |
|---|---|---|
| `CHECKPOINTS.md` ↔ `docs/verification.md` | Los dos hablan de «cómo se demuestra que está bien». `CHECKPOINTS.md` son **los puntos C1–C8 que evalúa el reviewer**; `verification.md` son **los 4 niveles de test** que aplica el implementer. Se citan mutuamente y no se contradicen. | **Dejarlos.** Solapan de tema, no de contenido. Unirlos mezclaría dos audiencias. |
| `AGENTS.md` ↔ `CLAUDE.md` | Los dos describen roles y flujo. `AGENTS.md` es el mapa del repositorio (secciones 1–6); `CLAUDE.md` es lo que se **inyecta en cada sesión** (rol de leader, reglas duras, la regla del `Co-Authored-By`). | **Dejarlos.** Además `init.sh` §2 exige `AGENTS.md` en disco: borrarlo pone el arranque en rojo. |
| `docs/architecture.md` (2 179 líneas) y `docs/api-contract.md` (1 650) | Crecen sin techo, un ADR y un endpoint por feature. | **Dejarlos, pero es el sitio a vigilar.** Son fuente de verdad viva; el problema es de tamaño, no de duplicación. |
| `docs/roadmap.md:408` §«`docs/ideas.md` está desactualizado» | Apunta a un archivo del **workspace madre**, fuera de este repo. | Fuera del alcance de este backend. |

---

## 4. Sedimento en `progress/`

Estado: **1,7 MB**, 33 `implementations/`, 31 `reviews/`, 28 `summaries/`,
9 `explorations/`, más `history.md` (935 líneas, 78 KB) y `current.md`.

`current.md` **ya está limpio**: se vació el 2026-08-21 tras acumular 22
secciones duplicadas, y él mismo documenta por qué. Ese trabajo está hecho.

### 🟢 Seguro — pero **archivar**, no borrar

| Qué | Evidencia | Riesgo |
|---|---|---|
| `progress/explorations/prueba-drive-real-2026-08-15.md` (254 líneas) | **Único archivo de prueba real que vive en la raíz de `progress/`.** Los otros ocho están en `progress/explorations/` con el patrón `<tema>-<fecha>.md`, que es el sitio que `current.md` declara correcto («Una pasada real o un diagnóstico → `explorations/<tema>-<fecha>.md`»). | **Mover a `progress/explorations/`**, no borrar: es la primera pasada real contra Drive y tiene valor histórico. Nada lo enlaza por ruta salvo `history.md`, que habría que ajustar al moverlo. |

### 🟡 A decidir — huecos del registro, no basura

Comparando las tres carpetas entre sí:

- **Sin `reviews/`:** `english-migration`, `trade-republic-plantilla-copiable`.
- **Sin `summaries/`:** `english-migration`, `lint-tooling`, `parser-english`,
  `test-runner`, `trade-republic-plantilla-copiable`.
- **Sin entrada en `feature_list.json`** (33 informes vs 29 features):
  `english-migration`, `lint-tooling`, `test-runner`, `trade-republic-plantilla-copiable`.

Esos cuatro son **trabajos laterales que se hicieron sin abrir feature**. No
duplican nada. La pregunta no es «¿los borro?» sino «¿esto es un hueco del
registro que quiero tapar, o trabajo que a propósito no llevaba feature?».

### 🔴 No tocar

- **`progress/history.md`** — es *la* memoria del proyecto, una línea por
  feature. Grande a propósito.
- **`progress/` en bloque** — `no-real-data.test.ts` recorre esta carpeta
  buscando fugas de datos reales. Borrar archivos **no** lo rompe (escanea
  menos), pero cualquier reorganización pasa por delante de ese guardián.
- **`specs/`** — parece cerrado y archivable. **No lo es:** `init.sh` §3 valida
  que **toda feature `sdd` en estado `done` tenga `requirements.md`, `design.md`
  y `tasks.md`** en `specs/<name>/`. Con 28 features `sdd` en `done`, borrar o
  mover un solo `specs/<name>/` deja `./init.sh` en rojo y **bloquea la sesión**.

---

## 5. `package.json`: dependencias y scripts

Se ha buscado cada dependencia en `src/`, `prisma/`, `scripts/`, los tres
archivos de Vitest y `prisma.config.ts`.

**No sobra ninguna dependencia.** Las nueve de producción y las ocho de
desarrollo tienen uso demostrable:

- `exceljs` → `bankinter.parser.ts`, `bankinter.fixture.ts`.
- `pg` → `test-db.ts` (`import { Client } from 'pg'`); `@prisma/adapter-pg` → `lib/prisma.ts`.
- `fastify-plugin` → los tres plugins de `src/plugins/`.
- `@googleapis/drive` → `lib/drive.ts` y `scripts/get-drive-refresh-token.mjs`.
- `tsx` (0 coincidencias en código) → **está en el script `dev`**, no en el código.
- `@types/node`, `@types/pg` (0 coincidencias) → tipos, se consumen sin importarse.

**Ningún script está muerto.** Los doce se usan: `init.sh` invoca `tsc` y
`pnpm test`; el hook `PostToolBatch` invoca `init.sh --fast`; el README documenta
el resto.

### 🟡 A decidir

| Qué | Evidencia | Riesgo |
|---|---|---|
| `pnpm-workspace.yaml` § `minimumReleaseAgeExclude` | Lista **13 versiones fijadas ya superadas**: `prisma@7.9.0` y toda su familia (`package.json` pide `^7.9.1`), `fastify@5.11.2` (pide `^5.11.3`), `tsx@4.23.5` (pide `^4.23.12`), `@googleapis/drive@21.0.0`. Además **no hay `.npmrc` en el repo** que fije un `minimumReleaseAge`, así que estas exclusiones probablemente ya no excluyen de nada. | Bajo pero real: es una lista de excepciones que nadie repasa y que solo puede envejecer más. Si se toca, se toca junto a un `pnpm install` que lo verifique. |
| `.claude/settings.json` § `permissions.allow` | Permite `pytest`, `dotnet test`, `cargo test`, `go test`, `mvn test`, `gradle test`: **seis stacks que este proyecto no usa**. | Ninguno funcional (permitir algo que nunca se ejecuta no hace nada). Herencia de la plantilla del harness. Adelgazarlo es cosmética. |
| `init.sh` §1 y §5 | Detecta y sabe verificar Python, Rust, Go, .NET, Java-Maven y Java-Gradle. **Ramas muertas en un proyecto Node**, ~120 de sus ~400 líneas. | ⚠️ **Aviso importante:** `init.sh` es la copia local de una plantilla de harness compartida. Podarlo aquí lo **desincroniza** del `harness-template` y hace que toda actualización futura venga con conflicto. Es una decisión de gestión de plantillas, no una limpieza. |
| `feature_list.json` — 179 KB para 29 features | Cada feature lleva `intent` (con `que_quiero`, `que_no_quiero`, `por_que`, `como_se_que_esta_bien`), `acceptance`, `_procedencia`… unos 6 KB por feature. | **No se borra:** `init.sh` §3 lo valida en cada arranque y es la fuente del QUÉ. Se apunta como observación: es el archivo que más crece del harness y en algún momento pedirá un archivado por etapas. |

---

## 6. Base de datos y Docker

Comprobado con `docker ps` y `docker exec gastos-postgres psql -U postgres -c "\l"`
(**solo lectura; no se ha ejecutado ni un `DROP`**).

Contenedor `gastos-postgres` (`postgres:17-alpine`, arriba y sano, puerto 5434).
Catorce bases, de las que tres son de sistema (`postgres`, `template0`, `template1`).

### 🔴 No tocar — las `gastos_test_*` son legítimas

`gastos_test_1` … `gastos_test_8` **y** `gastos_test_template`.

Evidencia de que son de la F27 (ADR-027) y **se esperan ahí**:

- `vitest.config.ts` fija `maxWorkers: testWorkerCount(availableParallelism())`,
  **topado en 8**, «para que coincida con el número de bases que prepara el
  global setup».
- `vitest.setup.ts` apunta cada worker a la suya por `VITEST_POOL_ID` y **lanza
  un error explícito** si hay más workers que bases preparadas.
- `templateDatabaseName = 'gastos_test_template'` en
  [`test-db.ts:31`](../../src/lib/test-db.ts#L31): es la plantilla desde la que
  `create database … template …` clona las ocho.

Ocho bases + plantilla = exactamente lo que la suite construye. **Borrarlas es
inútil** (`prepareTestDatabases` las recrea en el siguiente `pnpm test`) y
**caro** (se pierde la plantilla ya migrada y la siguiente pasada tarda más).

### 🟢 Seguro — `gastos_f26` es residuo, y está vacía

| Comprobación | Resultado |
|---|---|
| Filas de negocio | `Account`, `Category`, `InvestmentProduct`, `Movement`, `SavingsSnapshot`, `Valuation` → **0 en todas**. Solo `_prisma_migrations` tiene 4 filas (las migraciones aplicadas al crearla). |
| ¿La apunta algo? | **No.** `.env` apunta a `gastos`; `.env.example` apunta a `gastos`. **Cero** referencias a `gastos_f26` en `src/`, `prisma/`, `vitest.*`, `docker-compose.yml` o `feature_list.json`. |
| ¿Se sabía? | Sí, y **está escrito seis veces**: `reviews/savings-account-as-product.md:103` («el implementer dejó la base temporal creada… C5 al cerrar»), `:252`, `:448`, `implementations/tests-dont-touch-real-db.md:217`, `reviews/myinvestor-products-to-db.md:333` y `:534`, `summaries/tests-dont-touch-real-db.md:152`. Es un **deber de cierre de la F26 que se quedó sin hacer**, arrastrado por tres features. |
| Peso | 8 326 kB. |

**Qué se rompería:** nada. No la referencia ningún archivo, no la crea ninguna
herramienta y no contiene una sola fila de datos. Los propios informes de la F26
dejaron escrito el comando exacto para tirarla
(`implementations/savings-account-as-product.md:76`).
**Es el candidato más limpio de toda la pasada: 8 MB, cero riesgo, y ya estaba en
la lista de deberes.**

### 🟡 A decidir — vecinos en el mismo Docker

`docker ps` muestra también `calendar-postgres` y `calendar-mailpit`, arriba
desde hace 4 días. **No son de este proyecto** (`docker-compose.yml` solo define
`gastos-postgres`). Se anotan para que nadie los confunda con residuo de aquí:
**no se tocan desde este repo**.

---

## Lo que se comprobó y salió limpio

Para que la próxima limpieza no repita el trabajo:

- **Nada generado está versionado.** `git ls-files` no devuelve una sola ruta de
  `dist/`, `var/`, `src/generated/` ni `tsconfig.tsbuildinfo`.
- **El árbol de trabajo está limpio**: `git status --porcelain` devuelve un solo
  archivo (`progress/current.md`, modificado). **No hay temporales de sondas de
  agentes, ni `.bak`, ni `.orig`, ni archivos sueltos en la raíz.** Los 24
  archivos de la raíz son todos configuración o harness con dueño conocido.
- **Todas las dependencias y todos los scripts se usan.**
- **`docs/api-contract.md` no ha derivado del código**: los 16 endpoints que
  documenta son los que registra `src/app.ts`.
- **`docs/data-model.md` no ha derivado del esquema**: los 6 modelos y 7 enums de
  `prisma/schema.prisma` están cubiertos, y el documento se declara a sí mismo
  secundario respecto al `.prisma`.
- **`scripts/get-drive-refresh-token.mjs`** parecía huérfano y no lo es: es el
  *one-shot* de la F5, exigido por `specs/03-drive-connection/design.md:425` (R23) y
  documentado en el `summaries/` de esa feature.

## Orden sugerido, si se decide actuar

1. `drop database gastos_f26` — 8 MB, cero riesgo, deber pendiente desde la F26.
2. Borrar `dist/` y `tsconfig.tsbuildinfo` — 314 KB, se regeneran; además quita
   la trampa de que hoy `pnpm start` arrancaría la app de julio.
3. Borrar `myinvestorSampleFixture()` y pasar `oxlint` + `pnpm test`.
4. Mover `progress/explorations/prueba-drive-real-2026-08-15.md` a `explorations/`.
5. Actualizar el `README.md` (endpoints y árbol) — no es borrar, es la deuda de
   documentación más visible del repo.

Todo lo demás pide una decisión tuya antes de tocarse.
