# Sesión actual

> Este archivo se vacía al cerrar cada sesión y se mueve a `history.md`.
> Mientras trabajas, **mantenlo actualizado en tiempo real**, no al final.

- **Tarea en curso:** feature 3 `drive-connection` — spec redactado, **esperando
  aprobación humana** (`status: spec_ready`).
- **Inicio:** 2026-07-14
- **Agente:** spec-author

## Plan

Redactar `specs/drive-connection/{requirements,design,tasks}.md` a partir del
`intent` de la feature 3, de las dos decisiones que el humano cerró el
2026-07-14 (scope `drive` completo; validar al arrancar sin red + conexión
lazy) y de las dos exploraciones previas
(`progress/explorations/google-drive-auth.md` y
`progress/explorations/foundations-integration-points.md`). Parar en
`spec_ready`. No se toca código.

## Bitácora

- **2026-07-14** — Leídas las dos exploraciones, el `intent` + `acceptance` de
  la feature 3, `specs/foundations/` como precedente de formato, y el código
  vivo (`config/env.ts`, `lib/prisma.ts`, `plugins/prisma.ts`, `app.ts`,
  `health.routes.ts`, `app-error.ts`, `architecture.test.ts`, `env.test.ts`,
  `vitest.config.ts`, `tsconfig.json`, `eslint.config.js`).
- **2026-07-14** — Baseline verificada: `pnpm test` → **35 tests, 6 archivos,
  verdes**. Es la suite que el diseño debe mantener en verde.
- **2026-07-14** — Recomendaciones de la exploración de auth revalidadas contra
  el registro npm: `@googleapis/drive@20.2.0` = 2.454.923 B con una única
  dependencia (`googleapis-common@^8.0.0`); `googleapis@173.0.0` =
  207.485.089 B (~85x); `googleapis-common@8.0.2` fija
  `google-auth-library@10.5.0` en **versión exacta** → confirmada la trampa de
  la doble copia. `@googleapis/drive` es CJS (`main: build/index.js`, sin
  `type: module`) → se mantiene el spike de la sintaxis de import.
- **2026-07-14** — Hallazgo que condiciona el diseño: hacer obligatorias las
  tres credenciales rompe la suite por **dos vías distintas** (los tests que
  llaman a `buildApp()` leen `process.env`; los de `env.test.ts` inyectan
  objetos sintéticos). Resuelto con placeholders en `vitest.config.ts` (misma
  mecánica que el `LOG_LEVEL: 'silent'` ya existente) + fixture `baseEnv` en
  `env.test.ts`. La suite queda **hermética**: verde sin credenciales, sin red y
  antes de que el humano toque Google Cloud Console.
- **2026-07-14** — Escritos los tres archivos de `specs/drive-connection/`:
  23 requirements EARS, 4 decisiones delegadas resueltas con su alternativa
  descartada, veredicto explícito sobre el umbral de ADR-006 (**mantener el
  validador manual**, 7 variables de 8-10), postura de testeo de I/O de red
  declarada (seam + doble; contacto real como smoke manual de Nivel 3),
  borrador de ADR-007 y los 9 pasos manuales del humano.
- **2026-07-14** — `feature_list.json`: feature 3 → `spec_ready`. **PARADA en la
  puerta de aprobación humana.** No se ha tocado código ni tests.

### Para el humano en la puerta

Dos requirements marcados **(añadido)** — alcance que no pediste:

- **R19** — tabla de diagnóstico de 4 síntomas (`invalid_grant`,
  `invalid_client`, `accessNotConfigured`, `insufficientPermissions`) en vez de
  un único "no conecta". Pediste "un mensaje claro", no una tabla.
- **R20** — loguear el email de la cuenta de Drive conectada (al log, **no** al
  body de la respuesta: `/health/drive` no tiene auth). Protege contra consentir
  con la cuenta de Google equivocada, que es el fallo más silencioso del flujo.

Y una adición menor dentro de un requirement tuyo: el **test guardián de
`.env.example`** (R14) que impide commitear credenciales con forma real. La
regla es tuya; el test es propuesta mía.
