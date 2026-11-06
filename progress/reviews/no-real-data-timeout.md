# Revisión — no-real-data-timeout (mantenimiento, sin feature)

## Review — 2026-11-04

**Veredicto:** CHANGES_REQUESTED

### Cambios requeridos

1. **`./init.sh` no salió en verde las cinco veces: 4 en verde y 1 en rojo.** El
   rojo NO es de `src/no-real-data.test.ts` ni de este diff: es el `afterAll` de
   `src/modules/backup/backup.service.test.ts:208`, que pasa de 10 s
   (`Hook timed out in 10000ms`). Con `./init.sh` en rojo no puedo aprobar. Hay
   dos salidas: corregir ese hook en un cambio aparte, con su reviewer, o que el
   humano acepte este rojo de forma explícita. Decide el humano. Salida completa
   añadida a `progress/explorations/init-intermitente-2026-11-04.md`.

   | # | Hora (UTC) | exit | Total | Resultado |
   |---|---|---|---|---|
   | 1 | 16:36:40 → 16:37:43 | **1** | 63 s | 1516 tests en verde; falla la suite de `backup.service.test.ts` (hook `afterAll`, 10 s) |
   | 2 | 16:37:45 → 16:39:01 | 0 | 76 s | 93 archivos, 1516 en verde |
   | 3 | 16:39:01 → 16:40:01 | 0 | 59 s | 93 archivos, 1516 en verde |
   | 4 | 16:40:02 → 16:41:04 | 0 | 61 s | 93 archivos, 1516 en verde |
   | 5 | 16:41:04 → 16:41:59 | 0 | 55 s | 93 archivos, 1516 en verde |

   En las cinco ejecuciones, ningún test de `src/no-real-data.test.ts` falló por
   tiempo. En las 2-5, un `grep -ci "fail|warn|skip"` sobre la salida da 0.

2. **El test solo salió con exit=1 en 2 de 6 ejecuciones**, con los 37 tests en
   verde. El rojo lo pone `vitest.setup.ts` al acabar el archivo: «ha dejado filas
   sin borrar (Account: 1, Movement: 2)». `src/no-real-data.test.ts` no crea filas
   (no usa `buildApp` ni Prisma, comprobado con `grep`), así que esas filas de
   `gastos_test_1` vienen de otro sitio. **De dónde, no lo he comprobado.** Es el
   mismo síntoma que el rojo del paso 1 de `progress/reviews/audit-2026-11-04.md`,
   que tampoco tiene causa conocida. Apuntado en
   `progress/explorations/init-intermitente-2026-11-04.md`. No lo atribuyo a este
   diff y no pido que lo arregle este cambio. Lo dejo escrito porque una ejecución
   del archivo salió en rojo.

3. **`src/no-real-data.test.ts:490-503`: la descripción de `scanSources` ha quedado
   separada de su función.** El bloque nuevo de `LineCheck` (líneas 499-503) se ha
   metido entre el comentario `/** Runs \`check\` over every line… */`
   (líneas 490-498) y `function scanSources`. Ahora hay dos comentarios `/** */`
   seguidos encima de `type LineCheck`, y `scanSources` se ha quedado sin el suyo.
   Hay que mover el bloque de `LineCheck` (comentario y `type`) encima del
   comentario de `scanSources`.

### Comprobado sin hallazgos

**Alcance.** En `git status --short` y `git diff` no hay más cambios que los
esperados. Del implementer solo se ha tocado `src/no-real-data.test.ts`, más su
informe. `src/lib/test-real-data.ts` no se ha tocado. El resto
(`pnpm-lock.yaml`, `docs/roadmap.md` y los `audit-2026-11-04` de `progress/`) es
de otras tareas.

**Se ha corregido la causa, no se ha subido el límite.** No queda ningún límite
propio: el `it` sigue con los 5 s por defecto. Los cambios van contra lo que el
informe mide como coste:
- en el recorrido de frases, cada línea se parte en palabras una sola vez;
- `words()` pasa a hacerse con un solo `match`;
- el trío de palabras solo se construye si su primera palabra empieza alguna frase;
- los archivos del repositorio se leen una vez por ejecución del archivo de test.

Que nada escriba archivos del repositorio a mitad de la ejecución (y por eso se
puede leer una sola vez) lo he comprobado con `grep` (`writeFileSync`: ninguno).

**Vigila lo mismo que antes.** Con `git diff` he comparado las tres comprobaciones:
- `amountLeak` e `ibanLeak` no cambian.
- En `phraseLeak`, partir cada línea y poner sus palabras una detrás de otra da las
  mismas palabras que partir el texto unido, porque el espacio que las une no es una
  letra.
- `match(/\p{L}+/gu)` da las mismas palabras que `replace` + `split` + `filter`.
- Saltarse los tríos cuya primera palabra no empieza ninguna frase no puede perder
  ninguna coincidencia: las frases se construyen con `join(' ')` sobre `words()`
  (`src/no-real-data.test.ts:423`).

Prueba ejecutada por mí. Un script en el directorio temporal de la sesión leía la
base con una conexión `default_transaction_read_only=on` y escribía un único valor
real en `probe-review.tmp.md`, en la raíz del repo, sin añadirlo a git. Antes
comprobé con `git check-ignore` que ese archivo no estaba ignorado. El valor no se
imprimió. Cada vez lancé a la vez el archivo nuevo y una copia del de `HEAD`
(`src/no-real-data-old.tmp.test.ts`):

| Dato metido | Nuevo | `HEAD` | Avisos (iguales en los dos) |
|---|---|---|---|
| un importe de `Movement.amount` | ❌ `repeats no telling amount` | ❌ igual | `:3` |
| un concepto de `Movement.description` en una línea | ❌ `copies no telling phrase` | ❌ igual | `:2` y `:3` |
| el mismo concepto partido en dos líneas, con `«`, `—` y `,` | ❌ `copies no telling phrase` | ❌ igual | `:2` |
| un IBAN de `Account.iban` | ❌ `repeats no IBAN` | ❌ igual | `:3` |

En las cuatro, `exit=1` y `Tests 2 failed | 71 passed (73)`. Al terminar borré los
dos archivos: `ls` dice `No such file or directory` y `git status --short` es el
mismo que al empezar.

**El test solo, `--reporter=verbose`.** En las seis ejecuciones, los 37 tests en
verde. El test de frases tardó 1003, 969, 704, 492, 541 y 496 ms; el de importes,
entre 190 y 291 ms; el de IBAN, entre 165 y 362 ms. Exit=0 en 4 de 6; las dos con
exit=1 están en el punto 2.

**Test nuevo.** `catches a concept of the database split across two lines…`
comprueba la salida exacta: con una ventana de 2 líneas, un aviso en `:2`; línea a
línea, ninguno.

**Documentos que el cambio ha dejado desfasados.** `git grep -n -E
"scanSources|phraseLeak|versionedSources|trigramsOf|LineCheck|readVersionedSources"`
fuera de `progress/`, `specs/` y el propio test no encuentra nada (exit=1).

**Datos reales.** Ni el diff ni el informe ni lo que he añadido a
`progress/explorations/` llevan valores de la base.

**Vocabulario.** Ni el informe ni el diff usan un término nuevo para nombrar
mecanismos del proyecto.

**CHECKPOINTS.** No aplican como feature: no hay entrada en `feature_list.json`,
ni `checks`, ni spec.

## Review 2 — 2026-11-05

**Veredicto:** APPROVED
Comprobado: los tres cambios pedidos en la review del 2026-11-04, `./init.sh` (2 de 2 en
verde), convenciones, vocabulario. Checks: sin checks (mantenimiento). Sin hallazgos.
Sin resumen de cierre: es mantenimiento, no hay feature.

### Qué se pidió y cómo está

1. **`./init.sh` en rojo por el `afterAll` de `backup.service.test.ts`.** Se corrigió aparte
   (arreglo 2 de `progress/implementations/init-intermitente.md`, revisado en
   `progress/reviews/init-intermitente.md`). `./init.sh` dos veces seguidas (20:16:50 y
   20:17:22 UTC): exit=0 las dos, `Tests 1521 passed (1521)`, y
   `grep -ciE "fail|warn|skip"` sobre cada salida → 0.
2. **Filas de más en `gastos_test_1`.** La causa diagnosticada en
   `progress/explorations/init-intermitente-2026-11-04.md` (dos procesos vitest a la vez con
   las mismas bases) la cierra el arreglo 1 de init-intermitente: una segunda ejecución
   ahora falla al arrancar con «Ya hay otra ejecución…» (provocado y comprobado en esa
   revisión). No ha vuelto a salir en las ejecuciones de hoy.
3. **Orden del comentario de `LineCheck`.** Hecho: `src/no-real-data.test.ts:490-495` es el
   comentario y el `type LineCheck`; `:497-505` el comentario de `scanSources`, pegado a
   `function scanSources` (`:506`). Comprobado con `sed -n 480,520p`.

### Comprobado sin hallazgos

El orden del comentario y del `type` coincide con lo pedido;
los tests de `src/no-real-data.test.ts` en verde dentro de las dos `./init.sh`; `tsc`, lint y formato en
`[OK]`. Sin vocabulario nuevo ni datos reales.
