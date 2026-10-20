## Review — 2026-10-20

**Veredicto:** CHANGES_REQUESTED

### Cambios requeridos
1. `src/modules/own-accounts/own-accounts.recognition.test.ts:45-92` — el punto 🔴 3
   de la hoja, aprobado por el humano («solo vale la forma entera: un familiar con tus
   mismos apellidos cuenta como otra persona, **sin quedar dudoso**»), no lo verifica
   ningún test. La única otra persona de los tests es «Lucía Pérez **Sanz**», que no
   comparte los dos apellidos del titular inventado «Ana Pérez **Gil**»; un cambio que
   reconociera por los apellidos, o que dejara dudoso a quien los comparte, pasaría la
   suite entera. Es justo la preocupación que el humano dejó en el `por_que` (sus hijas).
   El código hoy se comporta bien — comprobado con
   `pnpm exec tsx <scratchpad>/probe.ts` llamando a `resolveOwnership` con las formas
   `['Ana Pérez Gil', 'PEREZ GIL ANA']`: «Bizum Lucia Perez Gil cumple», «TRANSF /PEREZ
   GIL LUCIA» y «TRANSF /Mariana Perez Gil» salen **sin lectura**; «TRANSF /Ana Perez
   Gil» y «TRANSF PEREZ GIL ANA» salen `own` —, pero no queda fijado. Qué hacer: en
   «recognizes the holder name and a non-bank text as own, whole words only» (o en «does
   not recognize a movement by the bank field alone»), con las formas en los dos órdenes
   (nombre delante y apellidos delante), añadir movimientos de otra persona inventada
   con **los mismos dos apellidos** en los dos órdenes, y de una cuyo nombre acaba en el
   del titular («Mariana»), y comprobar que `readings.has(id)` es `false` (ni `own` ni
   `doubtful`). Mismo nombre de test: los `checks` 5 y 7 siguen filtrando igual.

### Comprobado sin hallazgos
- `./init.sh` (comprobado antes que no había ningún proceso con `vitest` en la línea de
  órdenes: consulta a `Win32_Process`, solo salía la propia consulta): exit 0 — tsc,
  lint y format OK, `Test Files 91 passed (91)`, `Tests 1499 passed (1499)`.
- `./init.sh --checks 62`: exit 0, **18 de 18 en verde**; cada check filtrado imprime
  `Tests 1 passed | N skipped`, ninguno vacío. Los 18 coinciden con la tabla 🧪 de
  `decisions.md`.
- Trazabilidad R1–R15 ↔ tests (`own-accounts.routes.test.ts`,
  `own-accounts.recognition.test.ts`, `own-accounts.totals.test.ts`,
  `own-accounts.docs.test.ts`, `pnpm test`); `tasks.md` T1–T14 en `[x]`.
- Hoja: bloques de `docs/decisions-template.md`, 🔴 = 6 con alternativa, aprobación
  fechada; 15 requirements con la razón dicha; procedencia de cada `R<n>`.
- Reparto de lotes: cada archivo modificado está en la lista de su lote, más
  `docs/conventions.md:131-135` (ampliación autorizada); `docs/vocabulary.md` y
  `feature_list.json` no los tocó ningún lote.
- Nombre de banco solo → `doubtful` y nunca `own` (`own-accounts.recognition.ts:104-119`);
  el dudoso cuenta (`leavesTotals: false`, `:169`); el campo `bank` solo sirve para
  saber qué texto es nombre de banco (`:81`).
- `excludedFromTotals` y parejas de traspaso: nunca dudosos (`:168`); `computeTotals` e
  `isCountedExpense` siguen dejándolos fuera también con `not_mine`
  (`movements.service.ts:660-720`).
- Las tres sumas, en el código: `listMovements` (`movements.service.ts:318,360`),
  `getOverview` (`overview.service.ts:86,108`) y `getRecurringExpenses`
  (`recurring-expenses.service.ts:302,311`) leen `readOwnership` y pasan el mapa a
  `computeTotals` / `isCountedExpense`; `git grep` no encuentra otra suma que mire
  `excludedFromTotals`.
- Decisión del humano: manda (`own-accounts.recognition.ts:152-159`), se deshace con
  `null`, solo en `PATCH /api/movements/:id`; `PATCH /api/movements` responde 400.
- Importes, saldos, marcas y parejas sin cambios (test de R14); el reconocimiento solo
  hace `findMany`.
- Migración `20261020120000_own_accounts`: solo `CREATE TYPE`, `CREATE TABLE`, índices,
  FK y una columna nullable; ningún `INSERT`. `pnpm exec prisma migrate status` sobre
  `gastos`: «Following migration have not yet been applied: 20261020120000_own_accounts».
- `docs/lessons.md` #2: «Columnas reservadas», bloque Prisma, diagrama ER y claves
  naturales de `docs/data-model.md`, coherentes con `prisma/schema.prisma`.
- `docs/vocabulary.md`: `OwnAccount`, `OwnAccountText`, `AccountHolderName`, rutas,
  `ownership` y `ownershipDecision` aprobados el 2026-10-20; «texto de banco» no
  aparece fuera de `specs/` y `progress/`.
- Datos: nombres, conceptos e importes inventados; `src/no-real-data.test.ts` en verde
  con las cuatro columnas nuevas comparadas.
- ADR: `git diff docs/architecture.md` no tiene líneas quitadas; solo añade el ADR-040.
- Documentos que la feature volvía falsos (`git grep` de `computeTotals(movements,
  deposits)`, «únicos campos», «los tres campos»): solo quedan en ADR-035/037, que son
  histórico.
- Arquitectura y convenciones (rutas sin cliente de datos, `ownAccountsDb`), sin
  `console.` en lo nuevo; CHECKPOINTS C1–C7 (C4 bis no aplica: no lee datos de fuera).

## Review — 2026-10-20 (segunda)

**Veredicto:** APPROVED
Comprobado: acceptance/requirements ↔ tests, arquitectura, convenciones,
verificación, CHECKPOINTS C1-C8. Checks: 18 de 18 en verde.
Sin hallazgos.
Resumen de cierre: `progress/summaries/own-accounts.md`.

Detalle de lo que se comprobó del cambio 1 de la revisión anterior:
- Archivos cambiados desde la primera revisión (`find -newer` sobre esa revisión):
  `own-accounts.recognition.test.ts`, el informe y `own-accounts.recognition.ts`; este
  último sigue igual que en la primera revisión (173 líneas, `matches`, `findMatch` y
  `resolveOwnership` idénticos): era el cambio temporal del implementer, ya deshecho.
- El test conserva su nombre; añade las formas en los dos órdenes, «Lucia Perez Gil» y
  «PEREZ GIL LUCIA», «Mariana Perez Gil» y «PEREZ GIL MARIANA» con
  `readings.has(id) === false`, y «PEREZ GIL ANA» → `own`.
- Prueba en una copia en el scratchpad (no en el repo): con un reconocimiento que, si no
  casa la forma entera, casa por los apellidos, el test falla con
  `AssertionError: movement 6: expected true to be false` (`1 failed | 5 passed`); con
  la copia del original, `6 passed`.
- Sin ningún `node` con `vitest` en marcha (`Win32_Process`: 0). `./init.sh`: exit 0,
  `Test Files 91 passed (91)`, `Tests 1499 passed (1499)`. `./init.sh --checks 62`:
  exit 0, «Checks: 18 de 18 en verde», cada check filtrado con `Tests 1 passed`.
