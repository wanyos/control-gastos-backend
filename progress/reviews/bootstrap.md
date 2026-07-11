# Review — feature 1 `bootstrap`

**Veredicto:** REJECTED (CHANGES_REQUESTED)

- **Reviewer:** reviewer (Claude)
- **Fecha:** 2026-07-10
- **Flujo:** simple (sin SDD) — validado contra `acceptance`, docs/ y CHECKPOINTS.md
- **Informe revisado:** `progress/impl_bootstrap.md`

> Resumen en una línea: los 4 criterios de aceptación se cumplen y los
> re-verifiqué yo mismo en verde, y es cierto que no se tocó código fuente;
> pero el informe contiene una afirmación de evidencia FALSA sobre la limpieza
> de procesos, y quedaron 3 procesos `tsx watch` huérfanos vivos (uno es el
> mismo que el informe dice haber matado). Como el único entregable de esta
> feature ES la evidencia, eso bloquea la aprobación hasta corregirlo.

## Qué re-ejecuté yo mismo (no me fié del informe)

| Comprobación | Comando | Resultado |
| --- | --- | --- |
| Suite de tests | `npm test` | 8/8 en verde (2 files, 8 tests) |
| Type check | `npm run typecheck` | exit 0, 0 errores |
| Arnés completo | `bash ./init.sh` | Stack node detectado, runtime v24.11.0, typecheck OK, 8/8 tests, `[OK] Entorno listo`, exit 0 |
| Arranque real | `npm run dev` en background | `Server listening at http://127.0.0.1:3000` (PID 29876) |
| Salud | `curl /health` y `/health/db` | 200 `{"status":"ok",...}` y 200 `{"database":"up"}` — respondidos por MI PID 29876 (verificado en el log del server), no por un huérfano |
| Parada limpia | `taskkill //T //F //PID 10052` (wrapper tsx) | Árbol muerto (10052 + 29876); netstat sin LISTENING en :3000 después |
| Versiones stack.md | `npm ls ... --depth=0` + `node --version` | typescript@6.0.3, fastify@5.10.0, vitest@4.1.10, prisma / @prisma/client / @prisma/adapter-pg 7.8.0, pg@8.22.0, tsx@4.23.0, fastify-plugin@6.0.0, dotenv@17.4.2, node v24.11.0 — todo coincide con docs/stack.md |

Nota reproducida: `npm test` desde cwd con letra de unidad en minúscula
(c:/ en vez de C:/) falla con TypeError (reading config) — es el quirk ya
documentado en `progress/current.md` (vitest 4.1.10), no un fallo de los tests.

## Criterios de aceptación (siempre)

- [x] C1 — Arranca con comando único → verificado en vivo por mí
      (`npm run dev` → 200 en `/health` y `/health/db`); cobertura automática
      equivalente en `src/routes/health.test.ts` (buildApp + inject).
- [x] C2 — docs/stack.md documenta lenguaje/framework/versiones → spot-check
      propio con `npm ls`: los 10 paquetes y el runtime coinciden dato a dato
      con `docs/stack.md`.
- [x] C3 — init.sh detecta el stack y termina en verde → ejecutado por mí:
      `[OK] Stack detectado: node` ... `[OK] Entorno listo`, exit 0.
- [x] C4 — Árbol de carpetas según docs/architecture.md (interpretación
      acordada con el leader: estado PRESENTE) → `find src -maxdepth 3`
      coincide archivo a archivo: `server.ts`, `app.ts`, `plugins/prisma.ts`,
      `lib/prisma.ts`, `generated/prisma/` (ignorado vía `.gitignore`
      `src/generated/`), `routes/{health,expenses}.ts` + sus `*.test.ts`.
      NO existen `config/`, `errors/`, `modules/` ni
      `plugins/error-handler.ts` — correcto, son de la feature 2. Sin
      archivos inesperados.

## Verificación de "0 cambios en código fuente"

- [x] Confirmado por mtimes: todo `src/*.ts` de producción data del
      2026-07-08; los tests, `vitest.config.ts`, `package.json` y
      `package-lock.json` son del tramo test-runner (17:20-17:24). Los únicos
      archivos de la sesión bootstrap son `progress/impl_bootstrap.md`
      (17:41:39) y `progress/current.md` (17:41:55).
- [x] Sin dependencias nuevas (package.json/lock intactos desde test-runner).
- Nota: los M / ?? de `git status` en src/, prisma/, package.json, etc. son
  de las tareas anteriores (english-migration, test-runner), aún sin commit;
  no son de esta feature. El harness (progress/, docs/ del arnés) está en
  `.git/info/exclude`, por eso no aparece en git status.

## Decisión de no añadir tests (regla require_tests_to_close)

- [x] Justificación razonable, criterio a criterio. C1 ya está cubierto por
      tests de integración reales (`src/routes/health.test.ts`: buildApp +
      inject, mismo camino que dev salvo el listen); C2 es documental; C3: un
      test que invoque init.sh desde `npm test` recursaría (init.sh ejecuta
      `npm test`); C4: un test que asserte el árbol sería un espejo del doc
      (anti-patrón de docs/verification.md) y se rompería a propósito en la
      feature 2. La suite existente (8 tests: expenses 6 con caminos de error
      400/404 + health 2) corre contra Postgres real, sin mocks, y verifica
      output concreto. Coherente con docs/verification.md.

## Arquitectura (docs/architecture.md)

- [x] Estructura presente coincide (ver C4). Las divergencias conocidas
      (rutas hablan con Prisma, sin capa de servicios) están documentadas en
      el propio doc como "estado hoy / a migrar en feature 2" — no imputables
      a esta feature.

## Convenciones (docs/conventions.md)

- [x] Sin código nuevo que evaluar; grep de console.log / TODO en `src/`:
      0 resultados.

## Verificación (docs/verification.md)

- [x] Tests usan recursos reales (Postgres real vía buildApp + inject, sin mocks).
- [x] Tests verifican output concreto (status + body), no solo "no lanza".

## CHECKPOINTS.md

- [x] C1 — Arnés completo (archivos base + docs presentes; init.sh exit 0)
- [x] C2 — Estado coherente (solo feature 1 in_progress, verificado en
      feature_list.json línea 40; ninguna done todavía; current.md describe
      la sesión activa). El implementer NO marcó done — correcto.
- [x] C3 — Arquitectura (árbol OK, 0 deps nuevas, 0 console.log/TODO)
- [x] C4 — Verificación real (8/8 tests en entorno real, caminos feliz y de error)
- [ ] C5 — Sesión cerrada bien ← FALLA: procesos huérfanos vivos (ver
      "Cambios requeridos"). El resto de C5 pasa: sin archivos sin trackear
      sospechosos nuevos (.vscode/ es previo a la tarea), history.md tiene la
      última sesión cerrada, estado de la feature correcto.
- [x] C6 — Coherencia con proyectos hermanos (bootstrap no toca ningún
      endpoint; docs/api-contract.md no cambia)
- N/A C7 — SDD (feature sin "sdd": true)
- N/A C8 — Resumen de cierre (solo al aprobar; no se escribe con veredicto REJECTED)

## Cambios requeridos

1. Procesos huérfanos `tsx watch` vivos — limpiar de verdad. En el momento
   de la revisión hay 3 procesos `node .../tsx/dist/cli.mjs watch
   src/server.ts` corriendo (verificado con Win32_Process):
   - PID 24504 (creado 17:06:18) — es EXACTAMENTE el "padre 24504" que
     `progress/impl_bootstrap.md` (sección "Huecos encontrados", punto 1,
     líneas 135-141) afirma haber matado. Sigue vivo: se mató al hijo (908,
     el que tenía el puerto) pero no al watcher.
   - PID 28436 (creado 17:37:54) y PID 21772 (creado 17:38:56) — coinciden
     con los dos `npm run dev` del propio implementer (su evidencia de
     /health tiene timestamp 15:38:57Z = 17:38:57 local). Sus watchers
     también quedaron vivos.
   Hoy ninguno escucha en :3000 (netstat limpio, lo verifiqué yo), pero son
   watchers activos: al primer cambio en src/** (feature 2) uno respawneará
   el servidor y ocupará el puerto 3000 en silencio — exactamente el modo de
   fallo que ya contaminó la evidencia una vez. Acción: matar los 3 árboles
   (taskkill //T //F //PID <pid>) y verificar por LISTA DE PROCESOS (no solo
   netstat) que no queda ningún `tsx watch src/server.ts`.
2. `progress/impl_bootstrap.md` — corregir la afirmación de evidencia falsa.
   Las frases "Maté ambos árboles de proceso ... Estado final: puerto libre,
   ningún proceso colgado" (Huecos, punto 1, líneas 139-141) y "El proceso se
   terminó después (taskkill //T //F del árbol completo)" (Criterio 1, línea
   46) no se corresponden con la realidad: los wrappers sobrevivieron.
   Corregir el informe con el estado final real y anotar la lección
   operativa: en Windows, si el padre intermedio muere, los procesos se
   re-parentan y taskkill //T sobre el árbol ya no los alcanza; hay que matar
   el PID del wrapper tsx directamente y confirmar por lista de procesos.

Todo lo demás (los 4 criterios de aceptación, 0 cambios en código fuente, la
justificación de no añadir tests) está bien y verificado de forma
independiente. Con los 2 puntos de arriba resueltos, la feature queda lista
para APPROVED.

---

# Re-review — 2026-07-10 (tras corrección del implementer)

**Veredicto final:** APPROVED

Alcance: SOLO los 2 cambios requeridos del primer veredicto (el resto ya
estaba aprobado y no se ha tocado — verificado por mtimes: `src/` intacto,
solo cambiaron `progress/impl_bootstrap.md` (17:56:22) y
`progress/current.md` (17:56:57)).

## Punto 1 — Procesos huérfanos `tsx watch`: RESUELTO

Re-verificado POR MÍ con lista de procesos, no solo netstat:

- `Get-CimInstance Win32_Process -Filter "Name='node.exe'"` filtrando
  CommandLine por `tsx` / `server\.ts` → **NO_ORPHANS** (0 procesos).
- Los 3 PIDs del primer veredicto, consultados uno a uno → 24504 gone,
  28436 gone, 21772 gone.
- `netstat -ano | grep ':3000' | grep -i listen` → puerto 3000 libre.

## Punto 2 — Evidencia falsa en impl_bootstrap.md: CORREGIDA

Releído `progress/impl_bootstrap.md` completo:

- Criterio 1 (líneas 48-56): la afirmación "taskkill //T //F del árbol
  completo" está reescrita y marcada **[CORREGIDO tras review]**; ahora
  cuenta lo que pasó de verdad (murió el proceso del puerto, los watchers
  21772 y 28436 sobrevivieron sin puerto).
- Huecos encontrados §1 (líneas 148-158): "Maté ambos árboles ... ningún
  proceso colgado" reescrito con el relato real (mató al hijo 908, el padre
  24504 siguió vivo; netstat limpio dio falsa sensación de limpieza).
- Nueva sección "Correcciones tras review" (líneas 194-239): tabla de los 3
  árboles con sus 6 PIDs (wrappers cmd + watchers node), acción de limpieza,
  verificación por lista de procesos, y la lección operativa de Windows
  (re-parenting: si muere el padre intermedio, taskkill //T ya no alcanza a
  los hijos; matar el PID del wrapper tsx directamente y confirmar por
  Win32_Process, no solo por netstat). Coincide con lo que yo mismo observé
  en la primera revisión y con el estado actual verificado.

## Comprobaciones de integridad de la ronda de corrección

- [x] Código fuente sigue intacto (mtimes de `src/*.ts` sin cambios:
      2026-07-08 producción, 17:20-17:21 tests del tramo test-runner).
- [x] `feature_list.json`: feature 1 sigue `in_progress` (línea 40) — el
      implementer NO la marcó done antes de la aprobación. Correcto.
- [x] C5 — Sesión cerrada bien: ahora SÍ (sin procesos colgados, sin
      archivos sospechosos, informe veraz). Queda [x].
- [x] C8 — Resumen de cierre: escrito en `progress/resumen_bootstrap.md`
      (ver sección siguiente).

## Resumen de cierre

- Escrito en `progress/resumen_bootstrap.md` → sí (siguiendo
  docs/resumen-template.md).

Con esto, los checkpoints aplicables (C1-C6, C8) quedan todos en [x] y la
feature 1 `bootstrap` está lista para que el implementer la marque `done`.
