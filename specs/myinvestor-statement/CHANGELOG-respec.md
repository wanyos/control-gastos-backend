# Changelog de re-especificación — F10 `myinvestor-parser` contra el contrato de la F11

- **Fecha:** 2026-08-11 · **Agente:** spec-author · **Estado de la feature:** sigue en
  `spec_ready` (no se ha tocado `feature_list.json`).
- **Motivo:** la F11 `parsed-movement-contract` cerró
  [`src/lib/parsed-statement.ts`](../../src/lib/parsed-statement.ts) y el **ADR-013**
  después de escribirse este spec.
- **Regla aplicada:** `docs/specs.md` §Regla 3 (revisión por diff). Se ha tocado **solo**
  lo que el contrato obliga; el resto queda literalmente igual.

## El diff en cinco líneas

1. **Los tipos del movimiento salen del módulo.** `design.md` §13 y `tasks.md` T1 ya no
   declaran `MyinvestorMovement`, `ParsedMovementType` ni `UnparsedRow`: el módulo
   consume el contrato y solo declara
   `MyinvestorStatementResult = ParsedStatement<'myinvestor'>` (nuevo **R70**), porque
   `docs/conventions.md` §Parsers de banco lo prohíbe y hay un guardián que lo rechaza.
2. **`balanceAfter` → `balance` y fuera `providesBalance`.** `R17`, `R19` y `design.md`
   §3.4 usan el nombre del contrato; **R18 se reescribe en su sitio** para *prohibir*
   el campo `providesBalance` que antes exigía, porque ADR-013 lo descartó por duplicar
   lo que ya dice `balance: null`. `accountIban: null` (R20) no cambia de fondo.
3. **`daySequence`, nueva §3.6 del `design.md` y nuevos R68/R69.** Se decide y se deja
   escrito que **MyInvestor exporta `'newest-first'`** —verificado en la muestra real:
   las fechas bajan de `06/08/2026` a `08/07/2026`— y se numera con `assignDaySequence`;
   **las filas de `unparsedRows` no consumen número**, así que la numeración va después
   de descartarlas (T4, T5, T6).
4. **El importe 0 pasa por el helper único.** `R11` deja de describir el ternario y
   obliga a llamar a `deriveMovementTypeFromAmount`; en consecuencia `R2` y `R3`
   admiten explícitamente ese import desde `../movements/` (no es un módulo de banco) y
   `tasks.md` T18 exige que los dos guardianes de la F11 sigan verdes.
5. **`decisions.md`: sustituido el párrafo obsoleto.** El bloque «⚠️ Una incoherencia
   conocida que se hereda» decía que el otro banco seguía tratando el 0 como ingreso;
   **la F11 lo arregló hoy**, así que se sustituye por «✅ Lo que ha cambiado desde que
   leíste esto», que además avisa de que `providesBalance` cae y de qué es `daySequence`.
   **Los cinco puntos 🔴 quedan intactos.** Además, el ADR de esta feature se renumera a
   **ADR-014** (`design.md` §11, `R62`, T15): el 013 ya está ocupado.

## Efecto sobre los cinco 🔴 pendientes de tu visto bueno

**Ninguno. El contrato no invalida ninguno de los cinco.** Formato de los números,
`date` obligatoria en el depósito, choque producto+fecha, claves desconocidas como error
y `products.json` por año son todos del **JSON de producto**, y el contrato de la F11
solo gobierna la salida del **extracto**. Siguen esperándote tal cual.

Lo que sí ha quedado decidido sin ti son **dos de mis diez propuestas marcadas «REVISAR
EN APROBACIÓN»**, ambas por la F11 y ambas anotadas en la Procedencia:
`providesBalance` (**decidida en contra**: se cae) y el `neutral` del importe 0
(**decidida a favor** y ya implementada en los dos bancos). **Quedan ocho por revisar.**

## Juicio sobre el tamaño (lo pediste explícitamente)

El spec pasa de 67 a **70 requirements**, muy por encima del tope de ~15 de
`docs/specs.md` §2. No lo he reestructurado —está aprobado hasta ese punto— pero mi
lectura es que **sí esconde dos features**, y el corte natural es limpio:

- **F10a — el extracto CSV:** R1-R20, R50-R57 y R65-R70. Entrada generada por el banco,
  formato que no se elige, sale del contrato compartido. ~30 requirements.
- **F10b — los JSON de producto:** R21-R49 y R60. Entrada **escrita a mano**, formato
  que se diseña, con su propia taxonomía de errores y su plantilla documentada.
  ~30 requirements. **Los cinco 🔴 pendientes son todos de aquí**, así que el corte
  también separa lo que está aprobado de lo que no.

Comparten muy poco: el normalizador de números (`myinvestor.format.ts`), el servicio y
la ruta. Partirlas dejaría F10a implementable **hoy** (no tiene ningún punto rojo
abierto) y F10b esperando a que cierres la lista de campos, en vez de bloquear las dos.
**La decisión es tuya, no mía**; si prefieres no partir, el spec tal como queda es
implementable de una pieza.

---

# El corte, ejecutado (2026-08-11)

> **El humano aprobó la propuesta de arriba.** La carpeta `specs/myinvestor-parser/` ya
> no existe: se movió a `specs/myinvestor-statement/` (este archivo se queda aquí) y la
> mitad de productos salió a `specs/myinvestor-products/`. `feature_list.json` lo lleva
> el `leader`; el `spec-author` no lo ha tocado.
>
> ⚠️ **Sobre `git mv`:** no fue posible porque `specs/myinvestor-parser/` **nunca llegó a
> estar en el índice de git** (aparecía como `??` sin seguimiento). No hay historial que
> preservar, así que el movimiento se hizo con `mv` normal; el primer commit registrará
> las dos carpetas como nuevas.

## Qué quedó en cada lado

| | **F10 `myinvestor-statement`** | **F13 `myinvestor-products`** |
|---|---|---|
| Entrada | el extracto CSV que **genera el banco** | los JSON de producto que **escribes tú** |
| Requirements | **41**: R1-R20, R25, R47, R49-R52, R54-R59, R61, R62, R64-R70 | **35**: R21-R24, R26-R46, R48, R53, R60, R63, R71-R76 |
| Tareas | **18** (T1-T6, T9-T12, T14-T16, T18-T22) | **18** (T1b-T4b, T7, T8, T9b, T10b, T12b-T15b, T17, T18b-T22b) |
| Puntos 🔴 | **ninguno** | **los cinco** |
| Propuestas «revisar en aprobación» vivas | **3** (IBAN nulo, lista de ignorados, línea de documentación) | **5** (los 🔴 2-5 y la acumulación de errores) |
| ADR | **ADR-014** (extracto) | **ADR-015** (formato de los archivos de producto) |
| Cuándo | **ahora** | cuando el humano cierre sus cinco 🔴 |

**La numeración `R<n>` no se ha tocado en ningún documento.** Los huecos (R21-R46, R48,
R53, R60, R63 en el extracto; R1-R20 y R47-R59 en productos) son la otra feature, y cada
spec dice explícitamente dónde buscarlos. Los requirements nuevos que hizo falta crear
—porque la spec original los tenía fundidos en uno— siguen la numeración global: **R71 a
R76**, todos en productos.

## Dónde vive cada pieza compartida (regla: la F10 construye, la F13 consume)

| Pieza | La construye | La usa |
|---|---|---|
| `myinvestor.format.ts` → `parseAmountText` (la regla del separador de miles) | **F10** (R10) | la F13 la **importa**; tiene prohibido escribir una segunda |
| `myinvestor.format.ts` → `parseIsoDate` | **F13**, añadida al **mismo archivo** | solo la F13 (el extracto no necesita ISO estricto) |
| `myinvestor.service.ts`: recorrido de carpetas, `failed[]`, `ignored[]`, aislamiento por archivo, determinismo | **F10** (R25, R47, R49, R55, R56) | la F13 **añade una rama** (`.json`, su R76) y el volcado `products.json` |
| `myinvestor.routes.ts` (`POST /api/parser/myinvestor`) | **F10** (R51) | la F13 **no la toca**: el mismo botón devuelve además los productos |
| `myinvestor.types.ts`: `FailedFile`, `IgnoredFile`, resúmenes | **F10** | la F13 los reutiliza y añade los suyos |
| `myinvestor.fixture.ts` | **F10** (CSV sintético) | la F13 le añade el generador de JSON sintético |

**Ninguna pieza aparece como "a construir" en los dos documentos**, y la F13 arranca con
una tabla de "qué construye la F10 y aquí solo se consume" para que no haya duda.

## Dos desviaciones del reparto literal (dichas en voz alta)

Los rangos de la propuesta eran aproximados; al repartir aparecieron dos requirements
que caían del lado equivocado, y los he movido en vez de duplicarlos:

1. **R47 (aislamiento del fallo por archivo) y R49 (`ignored[]`) se quedan en el
   extracto**, aunque estaban en el rango `R21-R49`. Son del **servicio**, que lo
   construye la F10 y sin el cual esa feature no puede reportar nada. La F13 los consume
   y lo dice.
2. **R53 (`products.json` por año) se va a productos**, aunque estaba en el rango
   `R50-R57`. Es literalmente el 🔴 nº 5, y dejarlo en el extracto habría dejado un punto
   rojo en el documento que debe tener cero.

Con eso, `decisions.md` del extracto queda **sin ningún 🔴** y lo dice en su primera
sección, para que se pueda aprobar de un vistazo.

## ✅ Enlaces rotos del resto del repo — arreglados (2026-08-11)

> El humano levantó la veda sobre `specs/investments-data-model/` (F9, ya `done`) para
> reapuntarlos. **Solo se han tocado punteros, nunca decisiones**, y de paso se han
> convertido de backticks a **enlaces markdown clicables**, que es la convención del
> repo.

**22 referencias en 4 archivos:**

| Archivo | Refs | → `myinvestor-statement` | → `myinvestor-products` | → las dos |
|---|---|---|---|---|
| `specs/investments-data-model/design.md` | 11 | 4 (L505 §3.4/§3.5, L592+L595 §2, L648) | 6 (L211, L276, L330, L361, L408, L720) | 1 (L26) |
| `specs/investments-data-model/requirements.md` | 8 | 2 (L384+L386 §2) | 5 (L27, L150, L541, L577, L581) | 1 (L537, solo el nombre) |
| `specs/investments-data-model/tasks.md` | 2 | — | — | 2 (L23, L223) |
| `docs/roadmap.md` | 1 | 1 (L301) | — | — |

**Criterio:** `closedAt`, plantillas de producto, formato de números y fechas,
ganancia/porcentaje y R30-R39 → **products**; el extracto real, el saldo, el IBAN y la
norma «un parser por banco» (§2) → **statement**; las frases que citan las dos entradas
a la vez (los tres «Reconciliado con…» y el «Fuera de alcance» de `tasks.md`) → **las
dos, partidas en la propia frase**.

**Ningún `§` cambió de número.** Al partir se conservó a propósito la numeración de
secciones (§2, §3.4 y §3.5 en el extracto; §6, §7, §8 y §12 en productos), así que las
citas siguen apuntando al mismo sitio. Verificado uno a uno.

**`docs/roadmap.md` L301 → `myinvestor-statement`, verificado:** los dos deberes que
enlaza (alta manual de la cuenta e `initialBalance` como único ancla) son consecuencias
del **extracto**, y están literalmente en el bloque «📌 Consecuencias que te tocan a ti»
de su `decisions.md`.

### Texto desactualizado que he encontrado y NO he reescrito

1. **«se revisa en la misma puerta que esta»** (`design.md` L26, `requirements.md` L27):
   la F9 ya está `done` y las dos mitades del parser tienen ahora **puertas separadas**.
   Lo único que he tocado ahí es el **tiempo verbal** (`se revisa` → `se revisaba`),
   porque dejarlo en presente afirmaba algo falso; **el resto de la frase no**. Si
   prefieres que desaparezca, es una línea.
2. **`design.md` §6.1: «por recomendación explícita de la feature 10 (§14 nº 4)»** — ese
   `§14 nº 4` no existía ya antes del corte (§14 era la estrategia de test, sin lista
   numerada); la recomendación real —emitir números y no cadenas, con su alternativa
   anotada— está en la nota final de §13. **No lo he tocado**: no es una referencia a la
   carpeta borrada y corregirlo es tocar el porqué de una decisión ya implementada.
3. **Tres citas a `docs/myinvestor-product-files.md`** (`design.md` L26,
   `requirements.md` L27, `tasks.md` L223) hablan de esa plantilla como si existiera.
   **Todavía no existe:** la crea la F13 en su T13. Es correcto como intención, engañoso
   como enlace; lo dejo como estaba porque no es una referencia rota a la carpeta del
   corte.

