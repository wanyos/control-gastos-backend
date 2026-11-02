# expenses-by-category-reject-year-zero — implementación

**BLOQUEADA: ningún test se ha podido ejecutar.** PostgreSQL no responde
(`connect ECONNREFUSED 127.0.0.1:5434` y `::1:5434`) y Docker Desktop no está
arrancado (`docker ps` → `open //./pipe/dockerDesktopLinuxEngine: The system cannot
find the file specified`). No he arrancado Docker por mi cuenta. El código, los tests
y los documentos están escritos; falta que el humano arranque Docker y el contenedor
de la base, y lanzar `./init.sh` y `./init.sh --checks`. Estado `blocked` en
`feature_list.json` (pasó por `in_progress`).

No se ha escrito nada en la base de datos del humano ni en sus carpetas de datos.

## Archivos modificados / creados

- `src/modules/expenses-by-category/expenses-by-category.schema.ts`: los patterns del
  querystring pasan a `^(?!0000)\d{4}-(0[1-9]|1[0-2])$` (`month`) y `^(?!0000)\d{4}$`
  (`year`), con un comentario; la cabecera del archivo dice que el año 0000 también es
  `400 VALIDATION_ERROR`. `resolvePeriods` no se toca.
- `src/modules/expenses-by-category/expenses-by-category.test.ts`: tres tests nuevos,
  después de `rejects a malformed period with 400 and writes nothing`:
  - `year=0000 responds 400 VALIDATION_ERROR, like a malformed year`: 400, `code`
    `VALIDATION_ERROR`, y las mismas claves, `statusCode` y `code` que la respuesta a
    `year=20x6`.
  - `month=0000-01 responds 400 VALIDATION_ERROR, and so does every month of the year 0000`:
    `0000-01`, `0000-06` y `0000-12`, cada uno sin `compare` y con los dos valores de
    `compare`.
  - `year=0001 and month=0001-01 still respond 200`: 200 por HTTP, `period` con
    `year: '0001'` / `month: '0001-01'` y `amount` `0.00`.
  Los tests que ya había no cambian.
- `docs/api-contract.md`, `docs/roadmap.md`, `feature_list.json` (solo `status`),
  `progress/current.md`.

## Decisiones tomadas

- El rechazo va en el pattern del schema con una negación al principio (`(?!0000)`),
  así sale por el mismo camino que un `year` mal escrito. Era la decisión ya aprobada;
  la forma concreta del pattern es mía.
- Comprobación parcial, **no HTTP**: compilé el `querystring` del schema con el `ajv`
  que trae Fastify (script en el scratchpad, fuera del repo) y salió
  `year=0000 false`, `year=0001 true`, `year=2025 true`, `year=20x6 false`,
  `month=0000-01 false`, `month=0000-12 false`, `month=0001-01 true`,
  `month=2025-03 true`, `month=2025-13 false`. Esto no sustituye a los tests HTTP, que
  están sin ejecutar.

## Documentos actualizados

`git grep -n "cabo 30\|year=0000\|año \`0000\`"` y `git grep -n "cuatro cifras"` fuera
de `progress/` y `specs/`, y `git grep -n 'd{4}' -- docs README.md`:

- `docs/api-contract.md` §`GET /api/expenses-by-category`: las filas `month` y `year`
  de la tabla de parámetros dicen «año desde `0001`» y «El año `0000` se rechaza con
  `400 VALIDATION_ERROR` (feature 65)»; la fila 400 de errores añade «el año de
  `month` o `year` es `0000` (feature 65)».
- `docs/roadmap.md`: cabo 30 tachado y cerrado «por la F65
  `expenses-by-category-reject-year-zero` (2026-11-01)».
- Sin cambio: `docs/conventions.md:152` («cuatro cifras significativas») y
  `docs/architecture.md:411,486` (`^\d{4}$` de las carpetas de Drive) hablan de otra
  cosa.

## Prueba real

No aplica: la feature no lee datos de fuera.

## Último ./init.sh

Exit 1. Pasos en verde: estado, `feature_list.json` válido (65 features), type check,
`pnpm run lint`, `pnpm run format:check`. Rojo en tests:

```
Serialized Error: { errors: [ [Error: connect ECONNREFUSED ::1:5434], [Error: connect ECONNREFUSED 127.0.0.1:5434] ], code: 'ECONNREFUSED' }
[FAIL]  Hay tests rotos
[FAIL]  Entorno NO está listo. Resuelve los errores antes de avanzar.
```

## Último ./init.sh --checks

```
[INFO]  [4] La suite pasa.
[INFO]      $ pnpm test
[FAIL]      exit 1 — ... Serialized Error: { errors: [ [Error: connect ECONNREFUSED ::1:5434], [Error: connect ECONNREFUSED 127.0.0.1:5434] ], code: 'ECONNREFUSED' }
[FAIL]  Checks: 0 de 4 en verde. La feature no se puede cerrar.
```

Los cuatro fallan por la misma conexión rechazada. No se ha podido ver si
`src/no-real-data.test.ts` da timeout en la suite completa: la suite no llegó a
arrancar.

## Sugerencias fuera de scope (NO aplicadas)

- `src/modules/overview/overview.schema.ts:12` y
  `src/modules/investments/investments.schema.ts:13` usan el mismo pattern de `month`
  (`^\d{4}-(0[1-9]|1[0-2])$`), así que dejan pasar `month=0000-MM` a la validación.
  No he comprobado qué responden esas rutas con ese valor (hace falta la base en
  marcha y una petición `month=0000-01` a cada una). No lo he tocado.

---

## Segunda pasada, con la base en marcha (2026-11-01)

**Sigue BLOQUEADA, ahora por una decisión que no me toca tomar.** Con Docker y
`gastos-postgres` arriba, los dos tests del año 0000 pasan, pero
`year=0001 and month=0001-01 still respond 200` falla: **`year=0001` y `month=0001-01`
responden 500, no 200.** La aceptación 3 y el check 3 dan por hecho que hoy responden
200, y no es así. El fallo ya estaba antes de la F65: el schema nuevo solo deja fuera el
`0000`, y no toca nada de lo que pasa con el `0001`.

### Qué responde la ruta (comprobado por HTTP con `app.inject` en un test temporal, ya borrado)

| Petición | Estado | Causa (error que llega al manejador central) |
|---|---|---|
| `year=0001` | 500 | Postgres `22008` `date/time field value out of range: "0000-01-01"`: el año comparado es el 0000 |
| `month=0001-01` | 500 | Prisma `Invalid value for argument gte: Provided Date object is invalid` |
| `month=0001-02` | 500 | Prisma `Invalid value for argument lte: Provided Date object is invalid` |
| `month=0002-01&compare=same-month-last-year` | 500 | igual (`lte`) |
| `month=0999-01`, `month=0999-02` | 500 | igual (`lte`) |
| `year=0002`, `year=0099`, `year=0100`, `year=1000` | 200 | — |

`resolvePeriods` (llamada directamente con hoy = `2026-11-01`) devuelve fechas sin rellenar
con ceros el año del periodo comparado cuando la petición es un mes: `month=0001-01` →
`compared.from = "0-12-01"`; `month=0001-02` → `compared.from = "1-01-01"`. Con `year=0001`
devuelve `compared` del `0000-01-01` al `0000-12-31`, que Postgres rechaza.

O sea, **cualquier `month` con año menor que 1000 da 500**, y `year=0001` también.

### Por qué no lo arreglo

Para que `0001` responda 200 hay que cambiar `resolvePeriods` (rellenar el año con ceros
y decidir con qué se compara el año 0001 o el mes 0001-01, cuyo periodo comparado cae en
el año 0000). Eso choca con dos decisiones aprobadas: «el rechazo va en el schema, no en
`resolvePeriods`» y «válidos del 0001 en adelante». Hay que elegir una de estas, y no
la elijo yo:

1. Rechazar también en el schema lo que hoy da 500 (por ejemplo, años por debajo de
   1000, o al menos el `0001`), y cambiar la aceptación 3, el check 3 y el test de `0001`.
2. Arreglar `resolvePeriods` (rellenar el año con ceros) y decidir qué se compara con el
   año 0001 o el mes `0001-01`.

### Qué he deshecho

He devuelto `docs/roadmap.md` a como estaba (`git checkout`): el cierre del cabo 30 decía
«del `0001` en adelante sigue siendo válido», y eso no es verdad mientras `0001` dé 500.
`docs/api-contract.md` sigue cambiado (el año `0000` da 400, y eso sí está comprobado),
pero su «año desde `0001`» describe solo la validación de parámetros, no lo que responde
la ruta. Habrá que ajustarlo según lo que se decida.

El test `year=0001 and month=0001-01 still respond 200` se queda como está (en rojo):
lo pidió el leader y lo pide la aceptación 3.

Estado en `feature_list.json`: `blocked`.

### Último ./init.sh (exit 1)

```
[OK]    feature_list.json válido (65 features)
[OK]    Type check OK (tsc sin errores)
[OK]    OK: pnpm run lint
[OK]    OK: pnpm run format:check
     × year=0001 and month=0001-01 still respond 200 22ms
 FAIL  src/modules/expenses-by-category/expenses-by-category.test.ts > GET /api/expenses-by-category > year=0001 and month=0001-01 still respond 200
AssertionError: {"statusCode":500,"code":"INTERNAL_SERVER_ERROR","message":"Internal server error"}: expected 500 to be 200 // Object.is equality
 Test Files  1 failed | 90 passed (91)
      Tests  1 failed | 1489 passed (1490)
[FAIL]  Hay tests rotos
[FAIL]  Entorno NO está listo. Resuelve los errores antes de avanzar.
```

En esta pasada `src/no-real-data.test.ts` no dio timeout: es uno de los 90 archivos en
verde, y el único archivo en rojo es `expenses-by-category.test.ts`.

### Último ./init.sh --checks (exit 1)

`./init.sh --checks` sin argumentos responde `no hay ninguna feature in_progress; pasa su
id o su nombre` (la feature está en `blocked`), así que lo lancé como `./init.sh --checks 65`:

```
[INFO]  Feature: F65 expenses-by-category-reject-year-zero
[INFO]  [1] year=0000 responde 400 VALIDATION_ERROR.
[OK]        exit 0
                Tests  1 passed | 16 skipped (17)
[INFO]  [2] month=0000-01 responde 400 VALIDATION_ERROR.
[OK]        exit 0
                Tests  1 passed | 16 skipped (17)
[INFO]  [3] year=0001 y los años reales siguen respondiendo como hoy.
[FAIL]      exit 1
           Test Files  1 failed | 1 passed (2)
                Tests  1 failed | 16 passed (17)
[INFO]  [4] La suite pasa.
[FAIL]      exit 1
           Test Files  1 failed | 90 passed (91)
                Tests  1 failed | 1489 passed (1490)
[FAIL]  Checks: 2 de 4 en verde. La feature no se puede cerrar.
```

---

## Tercera pasada: años desde el 2000 (2026-11-02)

**Esta sección deja obsoleto lo anterior sobre el pattern, el test de `0001` y
`docs/roadmap.md`.** El humano eligió la opción 1 con el 2000 como año mínimo, y el
leader actualizó la F65 en `feature_list.json` (intent, acceptance, checks; status
`in_progress`).

### Cambios

- `expenses-by-category.schema.ts`: `month` → `^[2-9]\d{3}-(0[1-9]|1[0-2])$`,
  `year` → `^[2-9]\d{3}$`. Cualquier año anterior al 2000, `0000` incluido, es
  `400 VALIDATION_ERROR` del schema. `resolvePeriods` no cambia.
- `expenses-by-category.test.ts`: el test `year=0001 and month=0001-01 still respond 200`
  se sustituye por:
  - `year=1999 and month=1999-12 respond 400 VALIDATION_ERROR, like every year before 2000`:
    `year=1999`, `month=1999-12`, `month=1999-12&compare=same-month-last-year`,
    `year=0001`, `month=0001-01`, `year=0999`, `month=0999-02`, `year=1000`,
    `month=1000-06`, todos 400 `VALIDATION_ERROR`.
  - `year=2000 and month=2000-01 respond 200`: `year=2000`, `month=2000-01` y
    `month=2000-01&compare=same-month-last-year` → 200, con el periodo comparado en 1999
    (`1999-01-01`…`1999-12-31`, `1999-12-01`…`1999-12-31`, `1999-01-01`…`1999-01-31`).
  Siguen los dos tests del año `0000`; los demás tests de la ruta no cambian.
- `docs/api-contract.md`: las filas `month` y `year` dicen «año desde el 2000» y que un
  año anterior (también el `0000`) se rechaza con `400 VALIDATION_ERROR`; la fila 400 dice
  «el año de `month` o `year` es anterior al 2000 (feature 65)».
- `docs/roadmap.md`: cabo 30 tachado y cerrado por la F65 (2026-11-02). Dice que
  `year=0001` y cualquier `month` con año por debajo de 1000 respondían 500 por
  `resolvePeriods`, y que con la decisión del humano esos años se quedan fuera en la
  validación de parámetros.

### Trazabilidad con la aceptación

- Año 0000 → `year=0000 responds 400 VALIDATION_ERROR, like a malformed year`,
  `month=0000-01 responds 400 VALIDATION_ERROR, and so does every month of the year 0000`
- Años anteriores al 2000 → `year=1999 and month=1999-12 respond 400 VALIDATION_ERROR, like every year before 2000`
- 2000 y años reales → `year=2000 and month=2000-01 respond 200` y los tests de la F63,
  sin cambios (siguen en verde)
- No cambia otra ruta ni otro schema → `git status` muestra que en `src/` solo cambian
  `expenses-by-category.schema.ts` y `expenses-by-category.test.ts`

### Documentos: búsqueda

`git grep -n "0001"` en `docs/` y `src/modules/expenses-by-category/` (sin IBAN ni
importes): solo quedan las dos líneas del test que comprueban el 400 y el texto
tachado del cabo 30. No hay más menciones del rango de años de esta ruta.

### Sugerencia fuera de scope (NO aplicada), actualizada

`src/modules/overview/overview.schema.ts:12` y `src/modules/investments/investments.schema.ts:13`
siguen aceptando `month` con cualquier año de cuatro cifras. No he comprobado qué
responden con `month=0000-01` o `month=0001-01` (haría falta una petición a cada ruta).

Estado en `feature_list.json`: `in_progress`, a la espera del reviewer.

### Último ./init.sh (exit 0)

```
[OK]    feature_list.json válido (65 features)
[OK]    Specs presentes para features sdd con estado no-pending
[OK]    Type check OK (tsc sin errores)
[OK]    OK: pnpm run lint
[OK]    OK: pnpm run format:check
 Test Files  91 passed (91)
      Tests  1491 passed (1491)
   Duration  21.62s (tests 47%, import 45%, setup 5%, transform 2%)
[OK]    Todos los tests pasan
[OK]    Entorno listo. Puedes empezar a trabajar.
```

`src/no-real-data.test.ts` no dio timeout: los 91 archivos están en verde.

### Último ./init.sh --checks (exit 0)

```
[INFO]  Feature: F65 expenses-by-category-reject-year-zero
[INFO]  [1] year=0000 responde 400 VALIDATION_ERROR.
[INFO]      $ pnpm exec vitest run src/modules/expenses-by-category -t "year=0000 responds 400" | grep -E "Tests +1 passed"
[OK]        exit 0
                Tests  1 passed | 17 skipped (18)
[INFO]  [2] month=0000-01 responde 400 VALIDATION_ERROR.
[INFO]      $ pnpm exec vitest run src/modules/expenses-by-category -t "month=0000-01 responds 400" | grep -E "Tests +1 passed"
[OK]        exit 0
                Tests  1 passed | 17 skipped (18)
[INFO]  [3] year=1999 y month=1999-12 responden 400 VALIDATION_ERROR.
[INFO]      $ pnpm exec vitest run src/modules/expenses-by-category -t "year=1999 and month=1999-12 respond 400" | grep -E "Tests +1 passed"
[OK]        exit 0
                Tests  1 passed | 17 skipped (18)
[INFO]  [4] year=2000, month=2000-01 y los años reales siguen respondiendo 200.
[INFO]      $ pnpm exec vitest run src/modules/expenses-by-category
[OK]        exit 0
[INFO]  [5] La suite pasa.
[INFO]      $ pnpm test
[OK]        exit 0
[OK]    Checks: 5 de 5 en verde.
```
