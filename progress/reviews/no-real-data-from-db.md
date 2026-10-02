# Review — F51 `no-real-data-from-db`

## Review (2026-10-02)

**Veredicto:** CHANGES_REQUESTED

### Cambios requeridos

1. `docs/architecture.md:1985-1989` (cuerpo del ADR-024, §Consecuencias) — sigue
   diciendo que el guardián «sigue sin poder vigilar este banco (`unwatchedBanks` en
   `src/no-real-data.test.ts`)» y que «la suite lo dice en voz alta en cada
   ejecución». `unwatchedBanks` ya no existe en ese archivo (lo borra esta feature) y
   el ADR-024 no lleva ninguna línea de revisión: la que se añadió encima del ADR-017
   solo habla del §Consecuencias del ADR-017. Es la única referencia a un nombre
   borrado que queda sin cubrir. Qué hacer: una línea «Revisado el 2026-10-02 por la
   feature 51» encima del ADR-024 (o ampliar la del ADR-017 para que nombre también
   esa consecuencia del ADR-024), sin reescribir el cuerpo del ADR.
   Comando: `git grep -n -E "unwatchedBanks|fileNameKeys|letThrough|…" -- . ":!progress" ":!specs" ":!feature_list.json"`
   → 7 líneas, todas en `docs/architecture.md`: 1292 y 1293 (la línea de revisión
   nueva), 1375, 1390, 1459 y 1479 (cuerpo del ADR-017, cubiertas por esa línea de
   revisión) y 1986 (ADR-024, sin cubrir). El informe del implementer dice «seis
   menciones»; son siete líneas.

### Comprobado sin hallazgos

Cada punto con el comando que lancé y lo que salió.

- **`./init.sh`** → código de salida 0; `Test Files 76 passed (76)`,
  `Tests 1385 passed (1385)`, tipos, lint y formato en verde, «Entorno listo». La
  comprobación de `vitest.global-setup.ts` que compara la base del humano y la carpeta
  `var/` antes y después no escribió ningún aviso.
- **`./init.sh --checks 51`** → código de salida 0, **7 de 7 en verde**. Los seis
  checks que filtran por nombre muestran test ejecutado (`3 passed | 33 skipped (36)`
  el primero; `1 passed | 35 skipped (36)` cuatro; `1 passed | 3 skipped (4)` el de
  `src/lib/test-real-data.test.ts`); el séptimo es `pnpm test` entero. Ninguno puede
  pasar sin ejecutar su test: el `grep -E "Tests +N passed"` no encuentra la línea si
  el filtro no selecciona nada o si el test falla.
- **Checks ↔ tabla 🧪 de `decisions.md`** → las cinco frases y los siete comandos
  coinciden con la tabla y con los nombres de test de `tasks.md`. Que el implementer
  no los haya modificado **no lo he podido comprobar con git**: la feature 51 entera
  está sin commitear en `feature_list.json`, no hay versión anterior con la que
  comparar. Haría falta el texto de los `checks` tal como los dejó el spec-author.
- **Tests desaparecidos** (`git show HEAD:src/no-real-data.test.ts` frente al archivo
  actual, por nombre de test): 48 antes, 36 ahora. Se van 22, todos de `design.md` §5:
  el de «media `var/`», los 4 de lectura por contenido (F23, incluido el del `.xls`
  real), los 4 del anuncio de bancos no leídos, los 4 del mecanismo sobre archivos
  temporales y los 9 de nombres de archivo publicados (F34). Entran 10 (3 `catches …`,
  `says nothing …`, valor absoluto, IBAN de ejemplo, excepciones, `imports nothing …`,
  `skips the comparison …`, `repeats no IBAN of the database`). Los 15 de la F24 siguen.
  Más los 4 de `src/lib/test-real-data.test.ts`: 1393 − 22 + 10 + 4 = 1385.
- **Trazabilidad R1–R15** → cada R1 a R14 tiene el test que dice el informe, leído en
  el código; R15 son documentos (ver el cambio requerido). R14 no lo he vuelto a
  provocar: exige editar `src/lib/test-real-data.ts` y yo no toco código; el test
  compara en las dos direcciones contra `prisma/schema.prisma` y está en verde.
  `tasks.md`: T1 a T13 en `[x]`.
- **Ningún test abre la base del humano** → `grep` de `loadEnvFile`,
  `realDatabaseUrl`, `readRealDataReference` y `withReadOnlyClient` en `src/`: los
  únicos usos en tests son los de `src/lib/test-real-data.test.ts`, con el
  `DATABASE_URL` que `vitest.setup.ts` ya ha reescrito a la base desechable del worker
  (y la base `postgres`, en solo lectura). Que la base del humano queda igual tras la
  suite lo comprueba `vitest.global-setup.ts` en la pasada de `./init.sh` de arriba; no
  he hecho una medición aparte por mi cuenta, porque exigiría abrir yo esa base.
- **Una coincidencia pone la pasada en rojo** → creé una base aparte
  (`gastos_review_f51`, clonada de `gastos_test_template`, en el mismo servidor) con
  una sola fila de `Account` con IBAN, alias e importe **inventados** (los que el propio
  `src/no-real-data.test.ts` usa como ejemplo), y lancé con `DATABASE_URL` apuntando a
  ella. `pnpm exec vitest run src/no-real-data.test.ts` → **código de salida 1**,
  `3 failed | 33 passed (36)`. `./init.sh` → **código de salida 1**,
  `3 failed | 1382 passed (1385)`, «Hay tests rotos», «Entorno NO está listo». Las
  líneas de fallo son `archivo:línea — tipo de coincidencia`; `grep -ci` de los tres
  valores inventados sobre las dos salidas completas → 0 líneas. Base borrada después
  (`select count(*) … datname='gastos_review_f51'` → 0) y `git status --porcelain`
  idéntico al de antes. No se abrió la base del humano en esas dos pasadas.
- **Base sin datos** → `DATABASE_URL` a `gastos_test_template`,
  `pnpm exec vitest run src/no-real-data.test.ts` → código de salida 0,
  `33 passed | 3 skipped (36)` y las tres líneas `[no-real-data] THE DATABASE HAS
  NOTHING TO COMPARE AGAINST FOR:` (amounts, phrases, IBAN) en la salida.
- **Desviación (a), importes dentro de `ImportUnparsedRow.reason`** → aceptable:
  compara más, no menos; es lo que piden R6 y T7; está escrita en `docs/conventions.md`
  y cubierta por `KEEPS WATCHING the five amounts that live inside that same message`.
- **Punto (b), `trade-republic.fixture.ts`** → `git diff` de ese archivo: 4 líneas
  cambiadas, las 4 dentro del comentario de cabecera; ninguna de código.
- **Nada de la feature 52** → `git status --porcelain` sin ninguna ruta, sin `var/`,
  sin `src/lib/test-var.ts`, `vitest.config.ts`, `vitest.setup.ts`, `package.json` ni
  `pnpm-lock.yaml`. En `vitest.global-setup.ts` el diff solo añade la lectura y el
  `provide`; `snapshotVarDir` y `describeVarDifferences` no se tocan.
- **Datos reales** → el informe solo lleva recuentos; la línea de
  `progress/explorations/prueba-real-importacion-2026-09-12.md` queda sin cifras; la
  suite compara todo el árbol de trabajo contra la base y está en verde.
- Arquitectura y convenciones (sin dependencias nuevas, sin `console`), vocabulario,
  `docs/lessons.md` (entradas 2 y 3), hoja de decisiones (6 puntos en 🔴, cada uno con
  alternativa), 15 requirements, procedencia completa, CHECKPOINTS C1–C5, C4 bis y C7.

## Review (2026-10-02, segunda pasada)

**Veredicto:** APPROVED
Comprobado: requirements ↔ tests, arquitectura, convenciones, verificación,
CHECKPOINTS C1-C8. Checks: 7 de 7 en verde. Sin hallazgos.
Resumen de cierre: `progress/summaries/no-real-data-from-db.md`.

Lo que relancé en esta pasada, con su resultado:

- **El cambio requerido de la primera pasada está hecho.** El mismo `git grep` de
  nombres borrados, fuera de `progress/`, `specs/` y `feature_list.json` → 8 líneas,
  todas en `docs/architecture.md`: las 7 de antes más la línea de revisión nueva
  encima del ADR-024, que dice que la consecuencia sobre `unwatchedBanks` queda como
  historia. El cuerpo del ADR-024 no se ha tocado. Ninguna referencia en código.
- **Nada de código ni de tests ha cambiado desde la primera pasada:**
  `git status --porcelain` idéntico salvo este informe, y ningún archivo de `src/`,
  `prisma/`, `vitest.*.ts` ni `feature_list.json` con fecha posterior a ella.
- **`./init.sh`** → código de salida 0; `Test Files 76 passed (76)`,
  `Tests 1385 passed (1385)`, tipos, lint y formato en verde, sin ningún aviso de la
  comprobación de `vitest.global-setup.ts`.
- **`./init.sh --checks 51`** → código de salida 0, **7 de 7 en verde**, con test
  ejecutado en los seis que filtran por nombre.
- **Los `checks` no modificados por el implementer:** sigo sin poder comprobarlo con
  git. Queda apoyado en lo que afirma el leader (los leyó tal como los dejó el
  spec-author) y en que coinciden con la tabla 🧪 de `decisions.md` y con `tasks.md`.
