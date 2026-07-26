# Resumen — feature 1 `bootstrap`

Fecha de cierre: 2026-07-10
Intención original: `feature_list.json` → feature `bootstrap`, bloque `intent`
Spec (si SDD): no aplica (flujo simple, sin SDD)

## Qué hace ahora la app que antes no

Esta feature no añadió código: el proyecto ya existía y arrancaba. Lo que
tienes ahora y antes no tenías es la **certeza demostrada** de que la línea
de salida está limpia: cada criterio de arranque se verificó contra la
realidad con evidencia ejecutable (arranque real, tests, init.sh, árbol de
carpetas contrastado). Además se limpió un problema operativo real: quedaban
procesos de desarrollo huérfanos de sesiones anteriores que ya habían
contaminado una prueba una vez (respondían en el puerto 3000 sin que nadie
lo supiera). Ya no queda ninguno.

## Por dónde se usa (puntos de entrada)

- `npm run dev` — arranca el servidor de desarrollo con recarga en caliente
  (un solo comando, como pedía tu intent).
- `GET /health` — comprueba que el proceso vive (200 `{"status":"ok"}`).
- `GET /health/db` — comprueba que la base de datos responde
  (200 `{"database":"up"}`).
- `bash ./init.sh` — verificación completa del entorno (stack, typecheck,
  tests) terminando en `[OK] Entorno listo`.

## Dónde está el código (para revisión directa)

> Los enlaces de la columna **Código** son clicables en la vista previa de
> Markdown de VS Code (o con Ctrl/Cmd + clic): saltan a la línea exacta.
>
> ⚠️ **Nota histórica:** esta feature fue verificación + limpieza, sin código
> nuevo. La feature 2 (`fundamentos`) reorganizó después `src/routes/` →
> `src/modules/` y reescribió el arranque, así que los enlaces de abajo apuntan a
> la **ubicación actual** del código, no a la que existía al cerrar esta feature.

### 🚀 Arranque

| Qué | Símbolo | Código |
| --- | --- | --- |
| Comando único de arranque | `dev` (script) | [package.json:8](../../package.json#L8) |
| Carga de `.env` antes que nada | `dotenv/config` | [server.ts:3](../../src/server.ts#L3) |
| Puesta en escucha del servidor | `app.listen` | [server.ts:31](../../src/server.ts#L31) |
| Construcción de la app (plugins + rutas) | `buildApp()` | [app.ts:14](../../src/app.ts#L14) |

### 🩺 Endpoints de salud (hoy en `src/modules/health/`)

| Qué | Código |
| --- | --- |
| Endpoint `GET /health` | [health.routes.ts:12](../../src/modules/health/health.routes.ts#L12) |
| Endpoint `GET /health/db` | [health.routes.ts:16](../../src/modules/health/health.routes.ts#L16) |
| Test de `/health` y `/health/db` | [health.test.ts:20](../../src/modules/health/health.test.ts#L20) · [:27](../../src/modules/health/health.test.ts#L27) |

### 🧰 Entorno y documentación

| Qué | Código |
| --- | --- |
| Detección de stack en `init.sh` | [init.sh:364](../../init.sh#L364) |
| Cierre `[OK] Entorno listo` | [init.sh:555](../../init.sh#L555) |
| Árbol de carpetas documentado | [architecture.md §Estructura de carpetas](../../docs/architecture.md#L36) |

## Cumplimiento de la intención

Por cada punto del `como_se_que_esta_bien` del `intent`:

- ✅ "Cuando ejecuto el comando de arranque, el proyecto levanta sin errores."
  → se cumple. Verificado en vivo por el reviewer: `npm run dev` → servidor
  escuchando en :3000, `GET /health` y `GET /health/db` → 200; y en cada
  `npm test` por `src/routes/health.test.ts:17` (mismo camino de código que
  el arranque, vía `buildApp()`).
- ✅ "Cuando abro el repo, la estructura de carpetas coincide con la que
  decidí en docs/architecture.md." → se cumple para el estado PRESENTE que
  el doc describe (interpretación acordada con el leader): `src/{server,app}.ts`,
  `src/plugins/prisma.ts`, `src/lib/prisma.ts`, `src/routes/{health,expenses}.ts`
  + tests, `src/generated/prisma/` ignorado. Las carpetas marcadas `(nueva)`
  (`config/`, `errors/`, `modules/`, `plugins/error-handler.ts`) NO existen
  aún a propósito: son el trabajo de la feature 2.
- ✅ "Cuando ejecuto ./init.sh, detecta el stack y termina en verde." → se
  cumple, re-ejecutado por el reviewer: `[OK] Stack detectado: node` ...
  `[OK] Entorno listo`, exit 0 (incluye typecheck 0 errores y 8/8 tests).

Y los `que_no_quiero`:

- ✅ "No añadir aún lógica de negocio" → 0 cambios en `src/`.
- ✅ "No meter dependencias que no sean imprescindibles" → 0 dependencias
  añadidas (package.json/package-lock.json intactos).

## Decisiones que se tomaron por ti

- (delegado) "Qué versiones exactas fijar" → quedaron anotadas y verificadas
  dato a dato en `docs/stack.md` (TypeScript 6.0.3, Fastify 5.10.0, Prisma
  7.8.0 + adapter pg, Node v24.11.0 con engines >=20, Vitest 4.1.10,
  tsx 4.23.0). El reviewer contrastó cada una con `npm ls`: todo coincide.
- (delegado) "Qué gestor de paquetes / runner usar" → **npm** como gestor
  (solo existe `package-lock.json`) y **tsx watch** como runner de dev,
  documentado en `docs/stack.md:34-40`.

## Qué NO se tocó / quedó fuera

- Nada de lógica de negocio nueva ni cambios en `src/`: la feature fue
  verificación + limpieza operativa.
- La migración a `modules/` y las carpetas `config/`, `errors/`,
  `plugins/error-handler.ts` quedan para la feature 2 (fundamentos), como
  marca `docs/architecture.md`.
- No se editaron `docs/` (las divergencias menores detectadas están anotadas
  para el leader en `progress/impl_bootstrap.md`, sección "Divergencias").

## Notas para el futuro (opcional)

- **Parar `npm run dev` en Windows tiene truco**: matar solo el proceso del
  puerto deja vivo el watcher `tsx watch`, invisible en netstat pero capaz de
  relanzar el servidor al primer cambio de archivo (esto contaminó una
  evidencia en esta misma sesión). La receta correcta está en
  `progress/impl_bootstrap.md`, sección "Lección operativa (Windows)":
  matar el PID del wrapper tsx con `taskkill //T //F` y confirmar por lista
  de procesos. Merecería ir a `docs/verification.md` (decisión del leader).
- Pendiente del humano (ya conocido, `docs/stack.md:61-66`): en esta máquina
  el puerto 5432 lo sirve un PostgreSQL nativo de Windows, no el contenedor
  docker; decidir si parar el servicio nativo o remapear el contenedor.
- Sugerencias menores del implementer sin aplicar: añadir `HOST` a
  `.env.example` y rellenar los `TODO` de metadatos de `feature_list.json`.
