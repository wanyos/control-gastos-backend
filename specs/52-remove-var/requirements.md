# Requirements — F52 `remove-var`

> EARS estricto. Fuente de verdad: el `intent` de la feature 52 en
> `feature_list.json`. Estado de partida comprobado el 2026-10-02: `./init.sh` en
> verde (dato del leader), y lo que se cita de código, leído ese día.

Las **ocho rutas** de este documento son siempre estas, y ninguna más:

| # | Ruta |
|---|---|
| 1-6 | `POST /api/parser/bankinter`, `/myinvestor`, `/n26`, `/openbank`, `/revolut`, `/trade-republic` |
| 7 | `POST /api/import/local` |
| 8 | `POST /api/ingestion/process` |

## R1
CUANDO un cliente hace `POST /api/import`, el sistema DEBE descargar cada archivo
pendiente de Drive, leerlo con el parser de su banco, guardar sus datos en la base
de datos y moverlo a `procesados/`, respondiendo `200` con el mismo informe
(mismos campos y mismos valores) que antes de esta feature.

## R2
MIENTRAS importa un archivo, el sistema NO DEBE escribir ni leer ningún archivo
del disco de la máquina.

## R3
CUANDO un cliente llama a cualquiera de las ocho rutas, el sistema DEBE responder
`404` con el cuerpo de error estándar `{ statusCode: 404, code: "NOT_FOUND" }`.

## R4
CUANDO un cliente hace `GET /api/ingestion/pending`, el sistema DEBE responder
`200` con la misma detección de archivos pendientes (mismos campos y mismos
valores) que antes de esta feature.

## R5
El código del proyecto (`src/` salvo `src/generated/`, `scripts/`, `prisma/*.ts`,
`vitest.config.ts`, `vitest.setup.ts`, `vitest.global-setup.ts` y `package.json`)
NO DEBE nombrar la carpeta `var/`, con tres únicas excepciones declaradas con su
motivo: `src/architecture.test.ts`, `src/no-real-data.test.ts` y
`src/retired-routes.docs.test.ts`, que son los tests que vigilan precisamente eso.
(La tercera la añadió el leader el 2026-10-02 tras la primera revisión: el test de
R13 necesita el nombre de la carpeta para buscarlo en los documentos.)

## R6
La suite de tests NO DEBE leer, listar ni comparar ninguna carpeta del disco del
humano antes ni después de ejecutarse.

## R7
El archivo `.gitignore` DEBE ignorar la carpeta `var/` entera con una sola línea,
de modo que ningún archivo bajo `var/` pueda quedar versionado.

## R8
`docs/api-contract.md` NO DEBE nombrar ninguna de las ocho rutas ni el código de
error `LOCAL_COPY_NOT_FOUND` fuera de la sección `## Rutas retiradas`.

## R9
`docs/api-contract.md` DEBE tener una sección `## Rutas retiradas`, situada antes
de `## Errores`, que nombre las ocho rutas, la fecha, la feature 52 y qué se usa
en su lugar.

## R10
CUANDO el humano ejecuta `pnpm run parse-file <banco> <ruta-del-archivo>` con un
archivo que el parser de ese banco lee, el sistema DEBE imprimir un resumen hecho
solo de recuentos y forma (qué tipo de archivo es, cuántos movimientos, qué filas
no se pudieron leer por su número, si trae IBAN, si trae saldo, primera y última
fecha), sin ningún importe, IBAN, nombre ni concepto del archivo.

## R11
MIENTRAS se ejecuta `pnpm run parse-file`, el sistema NO DEBE escribir en la base
de datos, ni en Drive, ni en ningún archivo del disco.

## R12
SI `pnpm run parse-file` recibe un banco sin parser, una extensión que el parser
de ese banco no lee, una ruta que no existe o un archivo que el parser rechaza
ENTONCES el sistema DEBE terminar con código de salida distinto de 0 diciendo cuál
de los cuatro casos es.

## R13
`README.md` y los documentos de `docs/` que describen cómo funciona hoy el
proyecto (`verification.md`, `conventions.md`, `dar-de-alta-un-banco.md`,
`archivos-por-banco.md`, `data-model.md`, `myinvestor-product-files.md`,
`trade-republic-product-files.md`) NO DEBEN nombrar ninguna de las ocho rutas ni
las carpetas `var/drive-read` y `var/parsed`.

## R14
`docs/architecture.md` DEBE dejar constancia del cambio sin reescribir ningún ADR:
un ADR-032 nuevo con la decisión, el ADR-029 con `Estado: superada por ADR-032`, y
la línea «Revisado el 2026-10-02 por la feature 52 `remove-var`» encima de los
ADR-009, 010, 014, 015, 016, 017, 020, 024, 025 y 026.

---

## Cobertura de `como_se_que_esta_bien`

| Frase del intent | Requirements |
|---|---|
| `POST /api/import` importa igual que hoy y no escribe nada en `var/` | R1, R2 |
| Las ocho rutas responden 404 | R3 |
| En el código de la aplicación no queda ninguna referencia a `var/` | R5 |
| `docs/api-contract.md` ya no describe las ocho rutas, y dice de forma visible que se han quitado | R8, R9 |
| `GET /api/ingestion/pending` sigue funcionando igual | R4 |
| La suite entera pasa con la carpeta `var/` borrada | R6 (y R5: nada la nombra) |

## Procedencia

- R1 — (humano) «Importar sigue igual: se descarga el archivo de Drive, se lee, se
  guardan los datos en la base de datos y el archivo pasa a procesados/» y «No
  quiero que cambie lo que devuelve POST /api/import».
- R2 — (humano) «Lo que desaparece es la copia en var/». Lo redacto más ancho
  («ningún archivo del disco», no solo `var/`) porque la copia es lo único que el
  importador escribe hoy (`import.service.ts`, líneas 497-499): prohibir el disco
  entero es lo mismo y se puede comprobar.
- R3 — (humano) «Las ocho rutas responden 404». El cuerpo del 404 no lo dijo: es
  el del manejador central que ya existe (mismo que devuelven hoy
  `/api/expenses` y `/api/ingesta/*`, rutas retiradas antes).
- R4 — (humano) «GET /api/ingestion/pending sigue funcionando igual».
- R5 — (humano) «En el código de la aplicación no queda ninguna referencia a
  var/». (delegado) el alcance exacto: incluyo tests, fixtures, scripts y la
  configuración de vitest, no solo el código que se ejecuta en el servidor, y dejo
  tres excepciones: los tests que comprueban que `var/` no se nombra en el código,
  que está en `.gitignore` y que los documentos no la describen como algo de hoy
  tienen que nombrarla.
- R6 — (delegado) «Qué se hace con la comprobación de la feature 33». Decido
  **quitarla entera** (`src/lib/test-var.ts`, su test y su parte de
  `vitest.global-setup.ts`): ya nada del proyecto escribe en esa carpeta, y
  mantenerla contradice R5. La sustituye el test de R5, que impide que el código
  vuelva a apuntar ahí. Alternativa descartada: mantenerla hasta que él borre la
  carpeta. ← REVISAR EN APROBACIÓN.
- R7 — (añadido) El humano no dijo qué pasa con `.gitignore`. Hoy tiene tres
  líneas (`var/drive-read/`, `var/parsed/`, `var/backups/`) y dos tests exigen las
  dos primeras. Propongo dejar **una** línea `var/` y que se quede: su carpeta
  sigue en el disco con 72 archivos reales hasta que él la borre, y sin esa línea
  git los ofrecería para versionar. ← REVISAR EN APROBACIÓN.
- R8 — (humano) «docs/api-contract.md ya no describe las ocho rutas». (delegado,
  de «qué documentos hay que corregir») las secciones `## Parser de <banco>` del
  contrato **se quedan**, sin su subsección de ruta y sin los párrafos del volcado:
  describen qué lee cada parser, que es lo que aplica `POST /api/import`.
  ← REVISAR EN APROBACIÓN.
- R9 — (humano) «y dice de forma visible que se han quitado». La forma (una
  sección propia antes de `## Errores`) la decido yo.
- R10, R11, R12 — (delegado) «Cómo se prueba un parser nuevo con mi archivo real
  antes de cerrarlo». Decido un comando de terminal que lee un archivo de donde
  esté en su disco, lo pasa por el parser registrado para ese banco y enseña solo
  recuentos y forma, sin guardar nada. Alternativa descartada: no hacer nada y que
  la prueba sea la primera importación de verdad (un parser que lee mal sin fallar
  dejaría datos erróneos en su base y el archivo ya movido). No es el flujo que
  rechazó en `que_no_quiero`: no lee de `procesados/` ni de Drive y no importa
  nada. ← REVISAR EN APROBACIÓN.
- R13 — (delegado) «Qué documentos … hay que corregir». La lista sale de buscar
  `var/` y las ocho rutas en `docs/` y `README.md` el 2026-10-02.
- R14 — (delegado) «qué decisiones de docs/architecture.md hay que corregir o
  marcar como superadas». Solo el ADR-029 queda superado entero; el ADR-025 se
  **revisa** y no se supera, porque su segunda mitad (un archivo sin movimientos
  ni se cuenta ni se mueve) sigue vigente.

### Lo que NO es un requirement y se hace igual (va en `tasks.md`)

- La nota del cambio de contrato en `progress/current.md` (regla de
  `docs/related-projects.md`): ese archivo se vacía al cerrar, así que no puede
  tener un test.
- Quitar «y la carpeta `var/`» de las definiciones de `docs/vocabulary.md` y
  tachar los cabos 14 y 16 de `docs/roadmap.md`: van marcadas en `decisions.md`.
