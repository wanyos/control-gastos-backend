# Review — tarea de infraestructura `test-runner` (Vitest)

**Veredicto:** APPROVED

> No es feature de `feature_list.json`; es infraestructura de verificación
> (decisión de runner delegada al leader, no se cuestiona). Se valida la
> ejecución contra `docs/verification.md`, `docs/conventions.md`,
> `docs/stack.md` y `CHECKPOINTS.md`.

## 1. package.json

- [x] `git diff package.json` contiene EXACTAMENTE lo declarado: scripts
      `test: vitest run` (línea 11) y `test:watch: vitest` (línea 12),
      más `vitest: ^4.1.10` en devDependencies (línea 42). Nada más.
- [x] `package-lock.json` actualizado en consecuencia (declarado en el informe).
- [x] `npm ls vitest @vitest/runner` → árbol limpio, una sola instancia
      (vitest@4.1.10, @vitest/runner@4.1.10). Sin duplicados.

## 2. vitest.config.ts

- [x] Config mínima y coherente con TS ESM estricto (NodeNext): no redefine
      resolución de módulos ni relaja nada; el import de `vitest/config`
      resuelve bien bajo NodeNext (el typecheck lo confirma).
- [x] `setupFiles: ['dotenv/config']` (línea 8) justificado: es el MISMO
      mecanismo que producción (`src/server.ts:3` hace `import 'dotenv/config'`),
      y los tests no importan `server.ts` (usan `buildApp()` de `src/app.ts`),
      así que sin esto no habría `DATABASE_URL`. Sin duplicar lógica. Correcto.
- [x] `env: { LOG_LEVEL: 'silent' }` (línea 10): `buildApp()` lee
      `process.env.LOG_LEVEL` (`src/app.ts:13`); dotenv no sobreescribe
      variables ya definidas, así que no pisa el resto del `.env`. Correcto.
- [x] `environment: 'node'` explícito (línea 5). Documenta la intención.

## 3. Tests

### src/routes/health.test.ts (2 tests, nivel 3 automatizado)

- [x] `buildApp()` + `app.inject()` (líneas 9, 18, 25) — como pide
      verification.md Nivel 2.
- [x] Aserciones concretas: status 200 + body `{ status: 'ok' }` (líneas 20-21)
      y `{ status: 'ok', database: 'up' }` (líneas 27-28) — no solo comprobar
      que no lanza.
- [x] `await app.close()` en `afterAll` (líneas 13-15).
- Nota no bloqueante: el camino de error de `/health/db` (503, BD caída) no se
  testea; forzarlo exigiría mocks del plugin prisma, que verification.md
  desaconseja frente a recursos reales. Aceptable para un smoke automatizado.

### src/routes/expenses.test.ts (6 tests, nivel 2)

- [x] Camino feliz: POST 201 con recurso (l.46-55; verifica id, description,
      amount, date y categoryId, no solo el status), GET lista incluye el
      creado (l.57-67), GET /:id 200 (l.69-78), DELETE 204 + verificación de
      ausencia posterior en la lista (l.97-110).
- [x] Caminos de error: POST sin `amount` devuelve 400 (l.80-88); GET /99999
      devuelve 404 con body `{ message: 'Expense not found' }` (l.90-95).
      Cubre exactamente la secuencia manual de verification.md Nivel 2.
- [x] Aserciones de resultado concreto en todos; la de `amount` usa
      `Number(expense.amount)` (l.52) porque Decimal de Prisma serializa a
      string — decisión razonable y comentada.
- [x] Limpieza: ids registrados en `createdIds` y `afterEach` con
      `deleteMany` filtrado por esos ids (l.23-28). Borra solo lo creado por
      el test (no arrasa la tabla). Verificado empíricamente (ver punto 5).
- [x] `await app.close()` en `afterAll` (l.30-32); vitest termina sin colgarse.
- [x] Sin mocks: BD PostgreSQL real vía el plugin prisma de la app. Cero
      `vi.mock` / `vi.fn` en ambos archivos.
- [x] No son tests-espejo: ejercen la capa HTTP completa (validación AJV,
      rutas, Prisma, BD) y comprueban efectos observables (p. ej. el DELETE
      se verifica re-listando, no preguntándole a un mock).
- Nota no bloqueante: el test del 400 solo comprueba el statusCode, sin
  asertar el body de error (el formato de error centralizado es la feature 2
  "fundamentos", aún pending — razonable no acoplarse hoy a un formato que
  va a cambiar).

### Convenciones (docs/conventions.md)

- [x] Ubicación: junto al archivo bajo test (`expenses.test.ts` al lado de
      `expenses.ts`) — conventions.md, sección Tests. La divergencia con
      stack.md ("sin convención fijada") está señalada por el implementer
      como sugerencia de doc, fuera de scope.
- [x] Inglés en nombres de tests, código y comentarios.
- [x] Estilo: comillas simples, sin punto y coma, 2 espacios, <100 columnas.
- [x] Imports: vendor antes que relativos, extensión `.js` (`'../app.js'`),
      `import type` para tipos (`FastifyInstance`).
- [x] Estructura AAA; sin `console.log` ni TODOs sueltos.

## 4. Comandos ejecutados por el reviewer (no fiado del informe)

| Comando | Resultado |
|---------|-----------|
| `npm test` | 8/8 tests en verde, 2 archivos, ~0.7s |
| `npm run typecheck` | 0 errores (`tsc --noEmit`, tests incluidos) |
| `bash ./init.sh` | `[OK] Entorno listo` — el paso 5 ahora detecta y ejecuta `npm test` (8/8) |

Observación de entorno (no bloqueante, no es culpa del código): vitest 4.1.10
falla con `TypeError: Cannot read properties of undefined (reading 'config')`
si el cwd usa letra de unidad en minúscula (`c:/...` en vez de `C:/...`) —
reproducido y aislado por el reviewer en Git Bash. Ejecutado desde la ruta
normal (`C:/`), todo verde. Si algún día `npm test` falla con ese error,
comprobar el casing del cwd antes de sospechar de los tests.

## 5. BD limpia tras npm test

- `SELECT count(*) FROM "Expense"` ANTES de los tests: 0
- `SELECT count(*) FROM "Expense"` DESPUÉS de los tests: 0
- [x] Los tests no dejan filas creadas.

(El hecho de que localhost:5432 lo responda un PostgreSQL nativo de Windows
y no el contenedor está documentado por el implementer y explícitamente fuera
del scope de esta revisión; los tests pasan contra esa BD con migraciones
aplicadas, que es lo que se pide.)

## 6. Nada tocado fuera de lo declarado

Contrastado `git status` actual contra el snapshot previo a la tarea:

- [x] `docs/` — sin cambios de esta tarea (untracked desde antes).
- [x] `feature_list.json` — intacto (ambas features siguen `pending`;
      correcto, esto no es una feature).
- [x] `README.md` — su modificación es previa a esta tarea (ya estaba en el
      snapshot inicial).
- [x] `tsconfig.json` — intacto.
- [x] Código de aplicación en `src/` — sin cambios; los únicos archivos
      nuevos en `src/` son los dos `.test.ts` declarados.
- [x] Únicos cambios de la tarea: `package.json`, `package-lock.json`,
      `vitest.config.ts` (nuevo), `src/routes/health.test.ts` (nuevo),
      `src/routes/expenses.test.ts` (nuevo). Coincide 1:1 con el informe.

## CHECKPOINTS.md (los que aplican a una tarea de infraestructura)

- [x] C1 — Arnés completo: `./init.sh` exit 0; archivos base y docs presentes.
- [x] C2 — Estado coherente: 0 features `in_progress` (esto no es feature);
      `progress/current.md` describe la sesión activa real, sin basura.
- [x] C3 — Arquitectura/convenciones: dependencia nueva (vitest) justificada
      en `progress/current.md` (decisión del leader) y en el informe; sin
      logs de debug; convenciones respetadas.
- [x] C4 — Verificación real: tests ejecutables, pasan en el entorno descrito,
      cubren camino feliz Y caminos de error (400, 404).
- [ ] C5 — Sesión cerrada bien: N/A todavía — la sesión sigue abierta
      (cerrarla es trabajo del leader tras este veredicto, incluida la
      entrada en `progress/history.md`).
- [x] C6 — Proyectos hermanos: no aplica (no cambia el contrato de la API;
      solo se añade verificación).
- C7 / C8 — No aplican (no es feature SDD ni cierre de feature de
  `feature_list.json`; no requiere resumen de cierre).

## Pendientes que deja esta revisión (para el leader, no para el implementer)

1. Actualizar `docs/stack.md` (sección Testing) y `docs/verification.md`
   (avisos de "pendiente de configurar") para reflejar que Vitest YA está
   configurado — el plan de sesión en `progress/current.md` ya lo asigna
   al leader.
2. La colisión del puerto 5432 (postgres nativo vs contenedor) sigue
   pendiente de decisión humana, como documentó el implementer.

## Cambios requeridos

Ninguno.
