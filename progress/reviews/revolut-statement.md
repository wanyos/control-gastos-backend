# Review — F46 `revolut-statement`

**Fecha:** 2026-09-15 · **Revisor:** subagente `reviewer` · **Feature:** 46, sin spec
(`sdd: false`), única `in_progress` en `feature_list.json`.

## Review

**Veredicto:** CHANGES_REQUESTED

El código y los tests están bien: ningún hallazgo en los 14 criterios. Lo que bloquea
el cierre es la prueba con el fichero real (CHECKPOINTS C4 bis), que no está hecha, y
**no la puede hacer el implementer**: hace falta que el `.csv` con movimientos que el
humano subió a `notas-banco/revolut/2025/` esté descargado en local.

### Cambios requeridos

1. **CHECKPOINTS C4 bis — la prueba real no está hecha.** Esta feature añade un parser
   de banco, que es el caso para el que existe C4 bis, y en las features F20 y F29 el
   mismo hueco se trató como bloqueante. Comprobado:
   - `ls -laR var/drive-read/revolut` → solo `2026/revolut-2026-08-17.csv`, **103 bytes**
     (la muestra vacía de agosto). No hay `2025/`.
   - `ls progress/explorations | grep -i revolut` → **nada**. No existe
     `progress/explorations/prueba-real-revolut-<fecha>.md`.

   Consecuencia añadida: `src/no-real-data.test.ts` (el guardián de datos reales) solo
   ha podido comparar los fixtures y los docs contra esa muestra vacía, **no** contra el
   fichero que trae nombres de personas. Que los fixtures son sintéticos lo he
   comprobado leyendo `revolut.fixture.ts` (todo «Inventado»/«Ficticia», IBAN público
   de la documentación, ya usado en `docs/api-contract.md` y `specs/12-import/`), pero la
   comparación automática contra el fichero real está pendiente.

   **Qué hace falta (humano / leader):** descargar el fichero (`POST /api/import` o la
   ingesta), pasarlo por el importador, y escribir el informe con **recuentos y forma,
   nunca contenido**: filas leídas, `imported`, `unparsedCount` (esperado 0), filas
   `DEVUELTO` saltadas, `anchored` y `balanceMismatches` (esperado `[]`). Después,
   `./init.sh` otra vez, con el fichero ya en `var/drive-read/revolut/2025/`, para que
   el guardián de datos reales compare contra él.

2. `progress/implementations/revolut-statement.md:77` — el título «Listas de bancos
   escritas a mano en **tests de guarda**» usa una palabra que no está en
   `docs/vocabulario.md`. El término aprobado para un test que vigila una regla del
   proyecto es «guardián»; o se describe literalmente («en `src/architecture.test.ts`»).

### Comprobado sin hallazgos

- **Los 14 `acceptance` ↔ tests.** En particular, lo pedido con cuidado:
  - `DEVUELTO` se decide **antes** de validar fechas y saldo
    (`revolut.statement.parser.ts:198-201`; la única comprobación previa es el nº de
    celdas, y una fila `DEVUELTO` con esas celdas vacías conserva el nº de celdas).
    Test `skips a DEVUELTO row even when its dates and balance are empty, whatever its
    case` (`completedAt: ''`, `balance: ''`) → `movements: []`, `unparsedRows: []`.
    Cualquier otro estado, incluido el vacío, a `unparsedRows` con línea y estado.
  - `bookingDate` = `Fecha de finalización`, `valueDate` = `Fecha de inicio`, hora
    descartada, sin zona horaria; `Comisión` no está en el mapa de columnas; `balance`
    por línea, `accountBalance: null` también con una línea `saldo;` escrita; en BD,
    `balanceAfter` y ancla 1274.10 / 2026-07-03 / posición 1.
  - Imports del parser: solo `./`, `lib/`, `errors/` y `movements.service`
    (`deriveMovementTypeFromAmount`); `decodeUtf8Strict(content)` y ningún `.toString(`.
    `revolut` añadido en las cuatro listas escritas a mano de `src/architecture.test.ts`
    y en el árbol esperado; no existe en ese archivo ninguna lista del descodificador
    estricto (`grep` de `decodeUtf8Strict`/`toString('utf8')` en `*.test.ts`: solo
    `lib/` y los tests de parser de cada banco), así que esa parte del criterio 12 queda
    cubierta en el test del parser, como documenta el implementer.
  - `src/app.ts`: `{ bank: 'revolut', extensions: ['.csv'], parse: parseRevolutStatement }`
    y la ruta bajo `/api/parser`; el test de importación usa el registro real.
- **Documentación:** `docs/api-contract.md` (sección nueva, bancos del importador, tabla
  de los dos saldos, nota `NOT_UTF8`), `docs/archivos-por-banco.md` (fila de Revolut) y
  `docs/dar-de-alta-un-banco.md`.
- **Arquitectura y convenciones** (`docs/conventions.md` §Parsers de banco): módulo
  propio, lector CSV dentro del módulo, contrato común `ParsedStatement<'revolut'>` sin
  redeclarar tipos, línea `iban;` con `;` (o la coma), `:` rechazado, `readPreambleIban`.
- **Tests:** salida concreta, casos de error (estado, importe, fecha imposible, saldo
  ilegible, nº de columnas, cabecera ausente, no UTF-8, IBAN mal tecleado), BD de test
  real en `revolut.import.test.ts`.
- **CHECKPOINTS** C1, C2, C3 (sin `console.log`/`TODO` en `src/modules/revolut`; sin
  dependencias nuevas: `package.json` y `pnpm-lock.yaml` fuera de `git status`), C4, C5
  (sin archivos sin trackear sospechosos; `done` y `history.md` quedan para el cierre),
  C6 (no cambia nada que consuma el frontend hoy; endpoint nuevo documentado en el
  contrato). C7 no aplica. C8 no aplica todavía: sin resumen hasta que se apruebe.

## Ejecución

`./init.sh` (2026-09-15, desde la raíz de `gastos-backend`), salida recortada a las
líneas de resultado:

```
[OK]    feature_list.json válido (46 features)
[OK]    Type check OK (tsc sin errores)
[OK]    Lint OK
[OK]    Formato OK
 Test Files  67 passed (67)
      Tests  1257 passed (1257)
[OK]    Todos los tests pasan
[OK]    Entorno listo. Puedes empezar a trabajar.
EXIT=0
```

`pnpm exec vitest run src/modules/revolut src/architecture.test.ts --reporter=verbose`:
`Test Files 7 passed (7)`, `Tests 112 passed (112)`, con los tests de `DEVUELTO`, del
estado distinto, del saldo por línea, del ancla y de las dos listas de
`architecture.test.ts` en verde por nombre.

---

# Segunda pasada — 2026-09-15

Solo los dos cambios pedidos arriba; el código no ha cambiado desde la primera pasada.

## Review

**Veredicto:** APPROVED
Comprobado: los dos cambios pedidos (CHECKPOINTS C4 bis y la palabra de
`progress/implementations/revolut-statement.md:77`), `./init.sh` con el fichero real en
local, CHECKPOINTS C8. Sin hallazgos.
Resumen de cierre: `progress/summaries/revolut-statement.md`.

### Comprobado sin hallazgos

1. **CHECKPOINTS C4 bis.**
   - `ls -la var/drive-read/revolut var/drive-read/revolut/2025` → solo `2025/` con
     `revolut_2026-09-15.csv`, **4154 bytes**. La muestra vacía de `2026/` ya no está,
     como dice el informe.
   - `progress/explorations/prueba-real-revolut-2026-09-15.md` existe y trae lo pedido:
     filas, `importedCount` 35, `unparsedCount` 0, la fila `DEVUELTO` saltada,
     `anchoredCount` 1, `balanceMismatches: []`.
   - Recuentos de forma del informe contrastados contra el fichero con un script de
     usar y tirar en el scratchpad (fuera del repo; solo imprime recuentos): línea
     `iban` presente, **10 columnas, 36 filas, 35 `COMPLETADO` y 1 `DEVUELTO`**, fecha
     de finalización de 2025 en todas salvo la `DEVUELTO` (vacía). Coincide.
     Los totales de la pasada contra la base (`importedCount`, ancla 2,00, traspaso) no
     los he vuelto a lanzar: vienen de la pasada del humano.
   - **Sin contenido real en lo versionado.** El mismo script comparó contra el fichero
     los tres informes de la feature (`progress/explorations/prueba-real-revolut-2026-09-15.md`,
     `progress/implementations/revolut-statement.md`, `progress/reviews/revolut-statement.md`):
     IBAN (entero y sus 8 últimas cifras) → **no aparece** en ninguno; descripciones
     enteras → **0 de 28** en los tres; palabras de 4 letras o más de las descripciones
     → **0 de 48** en el informe de la prueba real, y en los otros dos solo palabras
     corrientes del castellano en frases propias («ruta bajo `/api/parser`», «secuencias
     de tres palabras»), no nombres ni conceptos.
   - `pnpm exec vitest run src/no-real-data.test.ts --reporter=verbose` →
     `Tests 48 passed (48)`; los dos tests que comparan contra las copias locales
     (`repeats no telling amount…`, `copies no telling phrase…`) salen **ejecutados**
     (✓, 318 ms y 1461 ms), no saltados, con el fichero real en `var/drive-read/revolut/2025/`.

2. **`progress/implementations/revolut-statement.md:77`** → ahora «Listas de bancos
   escritas a mano en `src/architecture.test.ts`». Descripción literal; resuelto.

## Ejecución

`./init.sh` (2026-09-15, raíz de `gastos-backend`, con el fichero real en local),
líneas de resultado:

```
[OK]    feature_list.json válido (46 features)
[OK]    Type check OK (tsc sin errores)
[OK]    Lint OK
[OK]    Formato OK
 Test Files  67 passed (67)
      Tests  1257 passed (1257)
[OK]    Todos los tests pasan
[OK]    Entorno listo. Puedes empezar a trabajar.
EXIT=0
```
