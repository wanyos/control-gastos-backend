# Verificación — Cómo demostrar que el trabajo funciona

> Regla de oro: **el agente no dice "funciona", lo demuestra**.
> Toda feature termina con evidencia ejecutable, no con afirmaciones.
>
> **Estado:** test runner configurado (**Vitest**, 2026-07-10). `npm test`
> ejecuta la suite y `./init.sh` la corre en su paso 5. Ver `docs/stack.md`
> §Testing para la configuración.

## Niveles de verificación

### Nivel 1 — Tests unitarios (obligatorio)

Toda función / módulo público en `src/` tiene al menos un test que:

1. Cubre el camino feliz.
2. Cubre al menos un camino de error si la función puede fallar.

**Comando para ejecutar todos los tests:**

```bash
npm test            # vitest run — suite completa
npm run test:watch  # vitest en modo watch durante el desarrollo
```

Verificación complementaria: el type check estricto (lo ejecuta también
`./init.sh`, y tipa también los archivos de test):

```bash
npm run typecheck   # tsc --noEmit — debe terminar sin errores
```

### Nivel 2 — Test de integración (obligatorio para features de API)

Las features de API se prueban cruzando la capa HTTP + Fastify + Prisma contra
una base de datos PostgreSQL real. La forma idiomática ya está en uso: levantar
la app con `buildApp()` y ejercerla con **`app.inject()`** (sin abrir puerto
real). Ejemplos vivos: `src/modules/expenses/expenses.test.ts` y
`src/modules/health/health.test.ts` (cubren 201/lista/200 por id/400/404/204 y
limpian las filas que crean).

Equivalente manual con curl (para probar a mano contra el servidor en marcha):

```bash
# Prerrequisitos: docker compose up -d  &&  npm run prisma:migrate
BASE=http://localhost:3000

# Crear un gasto -> 201 con el recurso creado
curl -s -X POST "$BASE/api/expenses" \
  -H 'Content-Type: application/json' \
  -d '{"description":"Weekly groceries","amount":45.90}'

# Listarlos -> incluye el creado
curl -s "$BASE/api/expenses"

# Validación: falta 'amount' -> 400
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$BASE/api/expenses" \
  -H 'Content-Type: application/json' -d '{"description":"x"}'

# No encontrado -> 404
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/api/expenses/99999"
```

> Esta secuencia ya está portada a tests automáticos (`npm test`); el bloque
> curl anterior se conserva solo como referencia para pruebas manuales.

Frontend / E2E (Playwright, Cypress): N/A — este proyecto es solo backend.

### Nivel 3 — Smoke test manual (opcional pero recomendado)

Flujo end-to-end desde cero que valida que el servidor arranca, conecta a
PostgreSQL y responde:

```bash
docker compose up -d          # 1. levanta PostgreSQL (gastos-postgres, :5434)
npm run prisma:migrate        # 2. aplica migraciones sobre la BD 'gastos'
npm run dev                   # 3. arranca el servidor (http://localhost:3000)

# En otra terminal:
curl -s http://localhost:3000/health       # -> {"status":"ok",...}
curl -s http://localhost:3000/health/db    # -> {"status":"ok","database":"up"}
```

Verde = el proceso responde (`/health`) y la base de datos está accesible
(`/health/db`).

### Nivel 4 — Trazabilidad de requirements (obligatorio para features con `"sdd": true`)

Cada `R<n>` de `specs/<name>/requirements.md` debe poder mapearse a al
menos un test concreto. El reviewer rechaza si falta cobertura.

El implementer documenta el mapa en `progress/implementations/<name>.md`:

```markdown
## Trazabilidad
- R1 → `test_xxx`
- R2 → `test_yyy`
- R3 → `test_zzz`
```

Ver `docs/specs.md` para el proceso SDD completo y la notación EARS.

## Anti-patrones (no hacer)

- ❌ "He añadido la feature, debería funcionar." → falta test ejecutable.
- ❌ Test que solo verifica que la función no lanza excepción. → tiene que
  comprobar el resultado concreto.
- ❌ Mocks excesivos del entorno cuando un recurso real (tempdir, sqlite
  in-memory) es viable.
- ❌ Marcar la feature como `done` sin pasar `./init.sh`.
- ❌ Añadir tests que solo se llaman a sí mismos (espejos del código).

## Verificación final antes de cerrar

```bash
./init.sh           # debe terminar con [OK] Entorno listo
```

En Windows se ejecuta con **Git Bash** o **WSL** (`init.sh` es un script bash).

Qué comprueba hoy en este proyecto (detecta stack `node` + `tsconfig.json`):

1. Detecta el stack y el runtime (Node) y el gestor de paquetes (`npm`).
2. Verifica que existen los archivos base del arnés (`AGENTS.md`,
   `CHECKPOINTS.md`, `feature_list.json`, `progress/current.md`, `docs/*.md`).
3. Valida `feature_list.json` (estados válidos, máx. 1 `in_progress`, specs
   presentes para features `sdd`).
4. Ejecuta **`npx tsc --noEmit`** (type check estricto).
5. Ejecuta **`npm test`** (Vitest): la suite completa debe pasar al 100%.

Si `./init.sh` está rojo, **no** marques nada como `done`. Anota el bloqueo
en `progress/current.md` con estado `blocked` en `feature_list.json`.

## Criterios mínimos por feature

> Plantilla mental al cerrar una feature:

- [ ] La feature cumple TODOS los criterios de su `acceptance` en `feature_list.json`.
- [ ] Hay tests que cubren los criterios de aceptación (no solo el "happy path").
- [ ] `./init.sh` termina verde.
- [ ] El reviewer ha emitido veredicto `APPROVED`.
- [ ] `progress/current.md` describe lo que se hizo.
