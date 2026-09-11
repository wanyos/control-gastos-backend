# Cabos 15 y 19 — implementación

Dos chores de `docs/roadmap.md` §Cabos sueltos con dueño. Solo tests; ningún
archivo de aplicación tocado. `git diff --stat`: 2 archivos, +19 líneas, -0.

## Archivos modificados

### Cabo 15 — `src/modules/bankinter/bankinter.routes.test.ts`

- [bankinter.routes.test.ts:8](../../src/modules/bankinter/bankinter.routes.test.ts#L8):
  `import { buildApp } from '../../app.js'`
- [bankinter.routes.test.ts:81-90](../../src/modules/bankinter/bankinter.routes.test.ts#L81):
  nuevo test `is registered in the real app under the /api/parser prefix`, con
  `expect(app.hasRoute({ method: 'POST', url: '/api/parser/bankinter' })).toBe(true)`
  sobre `buildApp()`. Copiado del bloque hermano de `n26.routes.test.ts:137-147`
  (mismo título, mismo comentario, misma estructura): solo se comprueba que la
  ruta está registrada, nunca se invoca.

### Cabo 19 — `src/architecture.test.ts`

- [architecture.test.ts:203-209](../../src/architecture.test.ts#L203): cinco
  entradas `modules/net-worth/net-worth.{routes,service,schema,types,test}.ts`
  en la lista de árbol esperado, entre el bloque de overview (F38) y el de
  transfers (F40), con un comentario de dos líneas indicando que es la F42.
  Los cinco archivos existen en `src/modules/net-worth/` (`ls` ejecutado).

## Comandos ejecutados y salida

1. `./init.sh` completo (primer intento): pasos 1-5 en verde (stack node
   v24.18.0, `feature_list.json` válido con 45 features, `tsc --noEmit` sin
   errores, `oxlint` OK, `prettier --check` OK). Paso 6 en rojo sin ejecutar
   ningún test: `ECONNREFUSED 127.0.0.1:5434`, el demonio de Docker no estaba
   arrancado (`docker ps` fallaba). Reportado al leader, que lo arrancó.

2. Con Docker arrancado, y por indicación del leader (otro implementer edita
   `src/modules/import/` en paralelo, así que NO se lanza la suite completa),
   solo los dos archivos tocados:

   ```
   npx vitest run src/architecture.test.ts src/modules/bankinter/bankinter.routes.test.ts

    RUN  v4.1.11 C:/Users/roybe/Escritorio/proyectos/control-gastos/gastos-backend

    Test Files  2 passed (2)
         Tests  38 passed (38)
      Duration  12.10s
   ```

   Con `--reporter=verbose`, los dos tests que este cambio toca aparecen por
   nombre y en verde:

   ```
   ✓ src/architecture.test.ts > architecture invariants > contains the target tree of docs/architecture.md (ADR-004) 4ms
   ✓ src/modules/bankinter/bankinter.routes.test.ts > POST /api/parser/bankinter > is registered in the real app under the /api/parser prefix 141ms
   ```

## Estado

- Tipos, lint y formato: verde (`./init.sh` pasos 4-5, ejecutado).
- Los dos archivos de test editados: **2 archivos, 38 tests, todos en verde**
  (ejecutado).
- La suite completa **no** se ha lanzado en este cierre, por indicación del
  leader (edición en paralelo de otro implementer en `src/modules/import/`).
  Queda para cuando ese trabajo termine: `./init.sh` completo.

## Sugerencias fuera de scope (NO aplicadas)

- Ninguna.
