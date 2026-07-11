# Informe de implementación — Feature 1: bootstrap

- **Feature:** 1 — bootstrap (flujo simple, sin SDD)
- **Fecha:** 2026-07-10
- **Agente:** implementer
- **Estado en feature_list.json:** `in_progress` (a la espera de veredicto del reviewer)

## Resumen

El proyecto ya existía y arrancaba; esta sesión **verificó cada criterio de
aceptación contra la realidad y produjo evidencia ejecutable**. No hizo falta
escribir ni modificar código fuente: los 4 criterios ya se cumplían. El único
hueco encontrado fue operativo (un servidor dev huérfano de una sesión
anterior ocupando el puerto 3000), detectado porque contaminaba la evidencia
del criterio 1. Su limpieza inicial fue incompleta (quedaron watchers `tsx
watch` vivos, señalados por el reviewer) y se completó y verificó por lista
de procesos en la ronda de corrección (ver "Correcciones tras review").

## Archivos modificados / creados

- `progress/current.md` — plan y bitácora de la sesión (harness, no código).
- `progress/impl_bootstrap.md` — este informe.
- **Código fuente: sin cambios.** No se movió, renombró ni creó ningún archivo
  en `src/`, ni se añadieron dependencias.

## Mapeo criterio de aceptación → evidencia

### Criterio 1 — "El proyecto arranca con un comando único"

**Comando:** `npm run dev` (arranque real en background) + `curl` contra el
servidor vivo, y parada limpia después.

**Evidencia (log del servidor, pid 23688):**

```
> tsx watch src/server.ts
{"msg":"PostgreSQL connection established (Prisma)"}
{"msg":"Server listening at http://127.0.0.1:3000"}
```

**Peticiones reales contra ese proceso:**

```
GET http://localhost:3000/health     -> HTTP 200  {"status":"ok","timestamp":"2026-07-10T15:38:57.369Z"}
GET http://localhost:3000/health/db  -> HTTP 200  {"status":"ok","database":"up"}
```

Tras la prueba se mató el proceso node que servía en :3000 y `netstat` quedó
sin LISTENING. **[CORREGIDO tras review]** La versión anterior de este informe
afirmaba aquí "`taskkill //T //F` del árbol completo" — eso era FALSO: solo
murieron el proceso que servía el puerto y parte del árbol; el watcher
`tsx watch src/server.ts` de esta pasada (PID 21772) y el de la pasada
contaminada (PID 28436) sobrevivieron sin puerto abierto, listos para
respawnear el servidor al primer cambio en `src/**`. Lo detectó el reviewer
vía Win32_Process. La limpieza REAL se hizo en la ronda de corrección y está
verificada por lista de procesos (ver "Correcciones tras review").

> Nota de rigor: la primera pasada de esta prueba dio 200 pero el log de MI
> `npm run dev` mostraba `EADDRINUSE` — la respuesta venía de un servidor
> huérfano de una sesión anterior (ver "Huecos encontrados"). Se mató el
> proceso que ocupaba el puerto, se verificó puerto libre, y se **repitió la
> prueba desde cero**; la evidencia de arriba es de la pasada limpia.

Cobertura automática equivalente: `src/routes/health.test.ts` levanta la app
con `buildApp()` + `app.inject()` y asegura `GET /health → 200 {status:'ok'}`
y `GET /health/db → 200 {database:'up'}` en cada `npm test`.

### Criterio 2 — "docs/stack.md documenta lenguaje, framework y versiones"

**Comando:** `npm ls <deps> --depth=0` + inspección de `package.json`,
`tsconfig.json`, `vitest.config.ts`, `prisma/schema.prisma`,
`docker-compose.yml`, `.env.example`, `.gitignore`.

**Resultado: stack.md refleja la realidad, dato a dato.** Versiones instaladas
exactas contrastadas:

| Afirmación en stack.md | Realidad instalada | ¿Coincide? |
| --- | --- | --- |
| TypeScript `^6.0.3` | `typescript@6.0.3` | sí |
| Fastify `^5.10.0` | `fastify@5.10.0` | sí |
| Node `v24.11.0`, engines `>=20` | `node --version` → v24.11.0 (init.sh §1); `engines.node: ">=20"` | sí |
| Prisma `^7.8.0` + adapter | `prisma@7.8.0`, `@prisma/client@7.8.0`, `@prisma/adapter-pg@7.8.0`, `pg@8.22.0` | sí |
| Cliente en `src/generated/prisma/`, generador `prisma-client`, ESM | `schema.prisma`: `provider = "prisma-client"`, `output = "../src/generated/prisma"`, `moduleFormat = "esm"` | sí |
| Validación JSON Schema nativa (sin Zod/Typebox) | Sin zod/typebox en deps; schema inline en `src/routes/expenses.ts` | sí |
| `fastify-plugin ^6.0.0`, `dotenv ^17.4.2` | `6.0.0` / `17.4.2` | sí |
| Gestor npm (solo package-lock.json) | Solo existe `package-lock.json` | sí |
| `dev` = `tsx watch src/server.ts` (`tsx ^4.23.0`) | `package.json` scripts + `tsx@4.23.0` | sí |
| Vitest `^4.1.10`, `npm test` = `vitest run` | `vitest@4.1.10`, scripts test/test:watch | sí |
| vitest.config: node env, `setupFiles: ['dotenv/config']`, `LOG_LEVEL=silent` | `vitest.config.ts` literal | sí |
| PostgreSQL 17 (`postgres:17-alpine`, contenedor `gastos-postgres`, :5432, BD `gastos`) | `docker-compose.yml` literal | sí |
| Env vars: `DATABASE_URL` obligatoria; `PORT`/`HOST`/`LOG_LEVEL` opcionales con defaults | `src/lib/prisma.ts` lanza si falta DATABASE_URL; `server.ts` (3000, 0.0.0.0); `app.ts` (info) | sí |
| tsconfig: strict, ES2022, NodeNext | `tsconfig.json` literal | sí |

**No se detectaron datos obsoletos ni incorrectos en stack.md.** (No edité
docs/; ver "Divergencias" para detalles menores no bloqueantes.)

### Criterio 3 — "init.sh detecta correctamente el stack y termina en verde"

**Comando:** `bash ./init.sh` (Git Bash).

**Resultado (extracto literal):**

```
── 1. Detectando stack ────────────────────────────────
[OK]    Stack detectado: node
[OK]    Runtime: v24.11.0
── 3. Validando feature_list.json ──────────────────────
[OK]    feature_list.json válido (2 features)
── 4. Type checking (tsc) ──────────────────────────────
[OK]    Type check OK (tsc sin errores)
── 5. Ejecutando tests ─────────────────────────────────
 Test Files  2 passed (2)
      Tests  8 passed (8)
[OK]    Todos los tests pasan
── 6. Resumen ──────────────────────────────────────────
[OK]    Entorno listo. Puedes empezar a trabajar.
```

### Criterio 4 — "El árbol de carpetas sigue docs/architecture.md"

Interpretación acordada con el leader: se compara contra el **estado presente**
que architecture.md documenta (las carpetas `(nueva)` y la migración a
`modules/` son trabajo de la feature 2 y NO se crean aquí).

**Comando:** `find src -maxdepth 2` + `git check-ignore`.

Correspondencia archivo a archivo:

| architecture.md (estado presente) | Repo real | ¿Coincide? |
| --- | --- | --- |
| `src/server.ts` (entrada: env + listen) | existe; carga `dotenv/config` y hace `listen()` | sí |
| `src/app.ts` (`buildApp()`: infra + módulos) | existe; registra prismaPlugin + rutas | sí |
| `src/plugins/prisma.ts` (fastify.prisma + cierre limpio) | existe; `fp()` + `onClose` → `$disconnect` | sí |
| `src/lib/prisma.ts` (fábrica PrismaClient con adapter pg) | existe; `createPrismaClient()` con `PrismaPg` | sí |
| `src/generated/prisma/` (generado, no se versiona) | existe; ignorado por `.gitignore` (`src/generated/`, verificado con `git check-ignore`) | sí |
| Nota de migración: "hoy `src/routes/{health,expenses}.ts`" | existen ambos (+ sus `*.test.ts` al lado, según conventions §Tests) | sí |
| `config/`, `errors/`, `modules/`, `plugins/error-handler.ts` marcadas `(nueva)` | **no existen** — correcto: son de la feature 2 | sí |

Sin archivos ni carpetas inesperadas en `src/`. **No se creó nada nuevo** (la
migración a `modules/` queda intacta para la feature 2).

## Huecos encontrados y qué hice

1. **Servidor dev huérfano en el puerto 3000** (de una sesión anterior; árbol
   `tsx watch` vivo, PID 908 bajo el padre 24504). Lo detecté porque mi primer
   `npm run dev` cayó con `EADDRINUSE` (server.ts sale con exit 1, correcto)
   mientras `/health` respondía 200 — la evidencia venía del proceso viejo.
   **[CORREGIDO tras review]** La versión anterior de este informe decía
   "Maté ambos árboles de proceso ... ningún proceso colgado" — eso NO era
   verdad. Lo que pasó de verdad: maté el node hijo (908) que tenía el
   puerto, pero el watcher padre 24504 siguió vivo (mi `taskkill //T` sobre
   908 ya no lo alcanzaba); y mis propios dos `npm run dev` dejaron vivos
   sus watchers (28436 y 21772) porque maté el wrapper bash/npm y el node
   del puerto, no el wrapper tsx. `netstat` limpio me dio una falsa
   sensación de limpieza: un watcher sin puerto abierto no aparece en
   netstat pero respawnea el servidor al primer cambio en `src/**`. El
   reviewer encontró los 3 vivos vía Win32_Process. La limpieza real y su
   verificación por lista de procesos están en "Correcciones tras review".
2. **Evidencia formal de los criterios**: no existía; este informe la aporta.
   No había ningún hueco de código.

## Evaluación de cobertura de tests (regla `require_tests_to_close`)

Decisión: **no añadir tests nuevos**. Justificación criterio a criterio:

- **C1 (arranque):** cubierto por `src/routes/health.test.ts` (2 tests:
  `buildApp()` + inject sobre `/health` y `/health/db`, mismo camino de código
  que `npm run dev` salvo el `listen()`); el arranque literal por proceso se
  demostró en vivo arriba. Un test que spawnee `npm run dev` sería pesado y
  frágil, desproporcionado para el valor que añade.
- **C2 (stack.md):** criterio documental; no es automatizable con un test
  razonable. Verificado por inspección contra `npm ls`.
- **C3 (init.sh):** init.sh ES la verificación ejecutable; un test que lo
  invoque desde `npm test` recursaría (init.sh ejecuta `npm test`).
- **C4 (árbol):** un test que asserte la estructura de carpetas se rompería a
  propósito en la feature 2 (migración a `modules/`) y sería un espejo del
  doc, no una verificación de comportamiento (anti-patrón de
  docs/verification.md). init.sh §2 ya verifica los archivos del arnés.

Suite actual: **8/8 tests de integración** (expenses 6 + health 2) en verde.

## Verificación final

```
npm test          -> Test Files 2 passed (2) / Tests 8 passed (8)
npm run typecheck -> tsc --noEmit, exit 0 (0 errores)
bash ./init.sh    -> [OK] Entorno listo. Puedes empezar a trabajar.
npm run dev       -> Server listening at http://127.0.0.1:3000
                     GET /health -> 200 {"status":"ok",...}
                     (servidor parado; limpieza COMPLETA de watchers en la
                      ronda de corrección — ver sección siguiente)
```

## Correcciones tras review (REJECTED → corregido, 2026-07-10)

El reviewer (progress/review_bootstrap.md) aprobó los 4 criterios pero
rechazó por 2 puntos, ambos resueltos:

### 1. Procesos `tsx watch` huérfanos — limpieza real

Localización por **línea de comandos** (no por PIDs asumidos), con
`Get-CimInstance Win32_Process | Where-Object { CommandLine -match "tsx" -and
CommandLine -match "watch src/server" }`. Vivos en ese momento, 3 árboles:

| Árbol (creación) | cmd.exe wrapper | node tsx (watcher) | Origen |
| --- | --- | --- | --- |
| 17:06:18 | PID 23336 | PID 24504 | sesión anterior (el "padre" que el informe decía haber matado) |
| 17:37:54 | PID 5724 | PID 28436 | mi 1er `npm run dev` (pasada contaminada) |
| 17:38:56 | PID 2584 | PID 21772 | mi 2º `npm run dev` (pasada limpia) |

**Acción:** `taskkill //T //F //PID <pid>` sobre los 6 PIDs (wrappers cmd y
watchers node). Los 6 confirmados terminados por la salida de taskkill.

**Verificación final por LISTA DE PROCESOS (no solo netstat):**

```
Get-CimInstance Win32_Process (filtro tsx + watch src/server, excluyendo la propia query)
  -> NINGUN proceso tsx watch src/server.ts vivo
netstat -ano | grep ':3000.*LISTENING'
  -> puerto 3000 libre (sin LISTENING)
```

### 2. Evidencia falsa corregida en este informe

Las dos afirmaciones falsas ("taskkill //T //F del árbol completo" en
Criterio 1 y "Maté ambos árboles ... ningún proceso colgado" en Huecos §1)
quedan reescritas arriba con lo que ocurrió de verdad, marcadas
**[CORREGIDO tras review]**.

### Lección operativa (Windows)

Si el padre intermedio de un árbol de procesos muere, los hijos se
**re-parentan** y un `taskkill //T` posterior sobre "el árbol" ya no los
alcanza. Además, un watcher `tsx watch` sin servidor escuchando es invisible
para `netstat` pero respawnea el proceso al primer cambio de archivo. Para
parar `npm run dev` de verdad: matar el PID del **wrapper tsx** directamente
(`taskkill //T //F //PID <pid del node tsx/cli.mjs watch>`) y confirmar por
**lista de procesos** (Win32_Process filtrando por línea de comandos), no
solo por puerto.

## Divergencias de docs detectadas (para el leader — NO edité docs/)

- **Ninguna divergencia sustantiva en docs/stack.md**: todos los datos
  contrastados coinciden con la realidad instalada (tabla del criterio 2).
- Menor, informativa: la tabla de env vars de stack.md incluye `HOST` citando
  `src/server.ts` como fuente (correcto), pero `.env.example` no trae `HOST`
  (solo DATABASE_URL, PORT, LOG_LEVEL). No es un error de stack.md; si se
  quiere que `.env.example` sea plantilla completa, faltaría esa línea.
- `feature_list.json` conserva placeholders `"project": "TODO: nombre del
  proyecto"` y `"description": "TODO: ..."`. Metadatos del arnés (propiedad
  del leader), no bloquean nada.
- Ya conocida (documentada en stack.md): en esta máquina `localhost:5432` lo
  sirve el PostgreSQL nativo de Windows, no el contenedor; decisión pendiente
  del humano. Los pasos "docker compose up -d" de docs/verification.md asumen
  el contenedor.

## Sugerencias fuera de scope (NO aplicadas)

1. Añadir `HOST=0.0.0.0` (comentada u opcional) a `.env.example` para que la
   plantilla cubra las 4 variables de la tabla de stack.md.
2. Higiene operativa: documentar en docs/verification.md cómo parar el dev
   server en Windows — la "Lección operativa" de la sección "Correcciones
   tras review": matar el PID del wrapper tsx directamente y confirmar por
   lista de procesos, no solo por netstat.
3. Rellenar los `TODO` de metadatos en `feature_list.json` (project /
   description).
