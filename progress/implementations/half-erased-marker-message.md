# half-erased-marker-message (F28) — implementación

> Un marcador de la plantilla a medio borrar (`"<2026-08-01"`) se dice por su nombre,
> no como «fecha inválida».

## Archivos modificados / creados

| Archivo | Qué cambia |
| --- | --- |
| [`src/modules/trade-republic/trade-republic.product.parser.ts`](../../src/modules/trade-republic/trade-republic.product.parser.ts) | `isHalfErasedMarker()` + `collectMarker()` + `MarkerReport`; los marcadores pasan de un `string[]` a dos listas (entero / a medio) y cada campo se filtra por ellas |
| [`src/modules/trade-republic/trade-republic.product.parser.test.ts`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts) | 12 tests nuevos: el caso real del 2026-08-20, cualquier campo, el símbolo en medio, y el bloque de NO-REGRESIÓN |
| [`src/modules/trade-republic/trade-republic.docs.test.ts`](../../src/modules/trade-republic/trade-republic.docs.test.ts) | guardián de la fila y la nota nuevas del documento |
| [`docs/trade-republic-product-files.md`](../../docs/trade-republic-product-files.md) | fila nueva en la tabla «Qué pasa cuando un archivo está mal» + nota que explica qué cuenta, qué no y que el parser no repara |

**No se ha tocado** `src/app.ts`, `src/modules/investments/`, `src/modules/import/` ni el
parser de MyInvestor (territorio de la F29, en curso en paralelo).

⚠️ **Un archivo tracked estaba borrado del worktree al llegar**:
`docs/plantillas/trade-republic-cuenta-remunerada.json` (commiteado en `9aefd47`, ausente en
disco), lo que dejaba en rojo `trade-republic.docs.test.ts`. Se ha restaurado con
`git checkout --` porque es material de esta feature y sin él el guardián no puede correr.
No sé quién lo borró; queda dicho por si fue intencionado.

## El mensaje

Antes (el del 2026-08-20):

    date: fecha inválida, se espera el formato AAAA-MM-DD, recibido "<2026-08-01"

Ahora:

    campos con el marcador <…> de la plantilla A MEDIO SUSTITUIR, te dejaste un símbolo
    suelto: date "<2026-08-01", openedAt "<2025-03-10"; un valor no puede empezar por <
    ni acabar en >

- **Sustituye**, no se suma: el mensaje de «fecha inválida» / «se espera un número» de ese
  campo desaparece (el campo se deja de leer, igual que con un marcador entero). Sumarlos
  mantendría en pantalla justo la frase que le mandó a mirar el formato.
- **Orden dentro del motivo único**: marcador entero → marcador a medio → faltan campos →
  el resto → el cuadre aritmético. El entero va primero porque explica todo lo demás
  (copié la plantilla y no la rellené); el de a medio va justo detrás porque es el mismo
  origen con una vuelta menos. Hay test del orden.
- **Muestra el valor recibido** (`date "<2026-08-01"`), a diferencia del mensaje del
  marcador entero, que solo nombra campos: todo el punto de esta feature es que **vea el
  carácter que sobra**, que es el que no ve al releer.

## Decisión 1 (delegada) — qué cuenta como marcador a medio sustituir

**Cuenta**: un valor de texto que, tras `trim()`, **empieza por `<` o acaba en `>`** y no es
un marcador entero (ese ya tenía su camino y no cambia).

**No cuenta el símbolo en medio** (`"Ahorro 3 > 2"`, `"Ahorro a < plazo"`). Dos razones:

1. **No es residuo de este accidente.** El marcador es `<…>`: borrar uno de los dos
   delimitadores deja **siempre** al otro en un extremo. Un símbolo en el interior no puede
   proceder de haberse dejado medio marcador; procede de que lo escribió a propósito.
2. **El interior es el único sitio donde el texto libre lo lleva de verdad.** Contarlo
   convertiría nombres perfectamente buenos en archivos rechazados sin accidente detrás,
   que es rechazar de más *sin* que el mensaje sea cierto — y eso sí rompe la confianza en
   el motivo.

**El texto libre (`name`) NO se exceptúa.** Se le aplica la misma regla, y por tanto un
nombre que empiece por `<` o acabe en `>` se rechaza aunque lo quisiera así. Es el
trade-off aceptado y va en la dirección que pide el criterio (*rechazar de más con un
mensaje que se entiende, nunca tragarse un valor*): el nombre tiene **salida** —lo renombra
sin el símbolo en los extremos, y el mensaje le dice exactamente eso—, mientras que un
`<algo` colándose **como nombre de la cuenta** no tiene ninguna: es el accidente del
2026-08-15 que los marcadores existen para evitar. Está escrito en el documento que él lee.

**Y no repara nada**: no quita el símbolo ni lee lo que queda detrás. El archivo se rechaza
exactamente igual que antes; lo único que cambia es el motivo.

## Decisión 2 (delegada) — dónde vive: en el parser de Trade Republic, hoy

**No se comparte ahora. Se comparte cuando haya dos usuarios reales y la F29 esté cerrada**,
y solo si entonces sigue haciendo falta.

- La norma vigente (`docs/conventions.md` §Parsers de banco) es **un parser por banco, sin
  genéricos**, y precisa que lo compartido es lo que *no* es formato (la forma de la salida,
  la codificación). El marcador `<…>` **es forma del fichero**: es la convención de la
  plantilla que publica cada banco en su documento. Que hoy dos plantillas usen el mismo
  símbolo es una coincidencia de estilo, no un contrato: el día que una cambie de
  marcadores, un helper común convierte ese cambio en regresión del otro banco.
- **MyInvestor hoy no tiene esta pieza siquiera.** Su documento dice explícitamente que
  *«no hace falta un chequeo nuevo para eso: la propia forma del marcador ya es inválida en
  los cuatro sitios»*, y su parser no tiene `isMarker` ni nada equivalente. Extraer a
  `src/lib/` sería inventar un compartido con **un solo usuario**, la definición de
  abstracción prematura.
- **Y no puedo hacerlo bien ahora aunque quisiera**: el guardián de
  `src/architecture.test.ts` enumera el árbol de `src/lib/` fichero a fichero, así que crear
  `src/lib/template-marker.ts` obliga a editar ese archivo, y el segundo usuario obliga a
  editar el parser de MyInvestor y `src/modules/investments/` — los tres en manos del
  implementer de la F29 **ahora mismo**. Compartir hoy es pisarnos, y hacerlo a medias
  (crear el sitio común sin usuarios) deja código muerto en `lib/`.

**Cuándo se revisa:** cuando la F29 esté cerrada y el humano tropiece con el mismo símbolo a
medio borrar en un fichero de MyInvestor. Entonces se extrae `isMarker` +
`isHalfErasedMarker` juntos (no uno solo: van en pareja) a `src/lib/template-marker.ts`, con
sus tres tests, en un cambio que ya puede tocar los dos módulos sin conflicto. La cita a
copiar es esta sección.

## Mapeo criterio → test

Todos en
[`src/modules/trade-republic/trade-republic.product.parser.test.ts`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts)
salvo donde se indica. Fixtures 100 % sintéticos (`buildSavingsAccount`), ninguno real.

| # | Criterio de aceptación | Test |
| --- | --- | --- |
| 1 | Empieza por `<` / acaba en `>` → marcador a medio, nombrando el campo, y NO «fecha inválida». El caso exacto del 2026-08-20 | `reports the exact case of 2026-08-20 as a half-erased marker, not as an invalid date` + `catches the closing symbol left behind, not only the opening one` |
| 2 | Vale para CUALQUIER campo, importes incluidos | `works on ANY field, not only dates: an amount with the bracket stuck to it` + `works on the text fields too: type, name and currency` |
| 3 | El mensaje del marcador ENTERO no se pierde ni cambia | `keeps the WHOLE-marker message intact and apart, even in the same file` + los cuatro tests preexistentes de `the template copied without filling it in (R2)` (sin tocar) + `trade-republic.service.test.ts:263` (sin tocar) |
| 4 | Un valor de verdad mal escrito dice lo de hoy (no-regresión) | bloque `NON-REGRESSION: a value really badly written says exactly what it said before`, dos tests: el literal exacto de los tres mensajes de hoy, y que ninguno se llama marcador a medio |
| 5 | No adivina ni repara: se rechaza igual, solo cambia el motivo | `NEITHER guesses NOR repairs: the file is rejected, no product comes out` + `does not pile the arithmetic check on top: the amounts were never read` |
| 6 | Decisión 1 por escrito | §Decisión 1 arriba; tests que la fijan: `does NOT count the symbol in the MIDDLE of a free text: that name enters` y `rejects a free-text name that OPENS with the symbol, on purpose (accepted trade-off)` |
| 7 | Decisión 2 por escrito | §Decisión 2 arriba (sin código nuevo: nada en `src/lib/`, nada en `src/modules/investments/`) |
| 8 | Los otros bancos no cambian de comportamiento | Ni una línea fuera de `src/modules/trade-republic/`; sus suites (`bankinter`, `n26`, `openbank`, `myinvestor`) siguen verdes, y `src/architecture.test.ts` (74 tests) también |
| 9 | La documentación lo recoge | fila nueva de la tabla + nota, con guardián en `trade-republic.docs.test.ts`: `has its own row in the table…` y `says what counts, what does not, and that nothing gets repaired` |
| 10 | Cada criterio con test + `./init.sh` verde | esta tabla; ver el bloque siguiente |

## Último `./init.sh`

**Rojo, y NO por este trabajo.** Todo lo de esta feature está verde:

- `src/modules/trade-republic/` → **4 archivos, 91 tests, todos pasan**.
- `src/architecture.test.ts` + `src/no-real-data.test.ts` → **74 tests, pasan**.
- `tsc --noEmit` no reporta **ni un error** en `src/modules/trade-republic/`.
- `prettier` y `oxlint` limpios en los archivos tocados.

Lo que está rojo, todo ello del trabajo **en curso** de la F29 (otro implementer, ahora
mismo, en módulos que tengo prohibido tocar):

- `tsc`: `investments.service.ts:44` (`Cannot find name 'upsertProduct'`),
  `investments.service.ts:70` (`toProductReport`), `import.service.ts:405`,
  `investments.service.test.ts:156`.
- 16 tests: 10 en `investments.service.test.ts`, 3 en `import.service.test.ts`, 3 en
  `import.local.service.test.ts` — todos de la persistencia de productos, ninguno toca el
  parser de Trade Republic.
- `[FAIL] Hay 2 features en in_progress (máximo 1)`: F28 + F29 en paralelo, estado del
  leader.

**Actualización, al cerrar**: mientras escribía esto, parte de la F29 ha aterrizado en el
worktree (`src/app.ts`, `myinvestor.*`, `investments.*`) y ha dejado **dos rojos nuevos**,
tampoco míos:

- `src/no-real-data.test.ts` → `investments.service.test.ts:157-158`, frase copiada de
  `var/`. Es de la F29 y hay que limpiarla ahí.
- `src/modules/trade-republic/trade-republic.routes.test.ts:136` →
  `expected [ 'myinvestor', 'trade-republic' ] to deeply equal [ 'trade-republic' ]`. El
  test es de mi módulo pero lo rompe el **registro de `src/app.ts`**, que la F29 acaba de
  ampliar con MyInvestor: la expectativa es una lista cerrada de bancos del registro de
  productos. **No lo he tocado** porque arreglarlo es decidir cómo queda el registro, que
  es la feature del otro. Sugerencia para quien cierre la F29: que esa expectativa deje de
  ser una lista cerrada y pase a `toContain('trade-republic')`.

**No he intentado arreglar nada de esto**: es de otro lote en vuelo. Con esos dos puntos
resueltos por la F29, `./init.sh` debería quedar verde sin tocar nada de aquí.

## Sugerencias fuera de scope (NO aplicadas)

1. **La plantilla de MyInvestor tiene el mismo agujero y nadie lo cubre.** Su documento
   afirma que el marcador «ya es inválido en los cuatro sitios», pero eso **no se sostiene
   para un campo de texto libre**: si algún producto suyo tiene un `name`, un marcador
   entero entraría como nombre. Merece una feature propia (y sería el segundo usuario que
   justifica el `src/lib/template-marker.ts` de la Decisión 2).
2. **Extraer `isMarker` + `isHalfErasedMarker` a `src/lib/template-marker.ts`** cuando la
   F29 esté cerrada, con la nota de la Decisión 2 como justificación del cambio.
3. **`docs/plantillas/trade-republic-cuenta-remunerada.json` apareció borrado del worktree.**
   Restaurado aquí, pero si se borra solo otra vez hay algo que lo borra y conviene saber
   qué.
