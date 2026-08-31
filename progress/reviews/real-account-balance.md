# Review — F31 `real-account-balance`

> Revisor: `reviewer`. **Primera pasada 2026-08-25 → CHANGES_REQUESTED** (cuatro
> puntos). **Segunda pasada 2026-08-26 → APPROVED.** Se conserva la primera
> entera debajo: sin ella no se ve qué se corrigió ni por qué.

---

## Review (2ª pasada, 2026-08-26)

**Veredicto:** APPROVED

Comprobado: acceptance/requirements ↔ tests (R1-R15), arquitectura, convenciones,
verificación, CHECKPOINTS C1-C8. Sin hallazgos.
Resumen de cierre: [`progress/summaries/real-account-balance.md`](../summaries/real-account-balance.md).

### Los cuatro puntos de la 1ª pasada, verificados uno a uno

Verificados **en los archivos**, no en el informe:

1. `docs/roadmap.md:151` — la afirmación va tachada y marcada ⛔ como revertida
   por la F31/ADR-028, con el aviso en 🔴 contra restaurar el `null`. ✅
2. `progress/summaries/openbank-statement.md` — corregidos `:93` y `:161`, **más
   `:128`**, que yo no había nombrado: la petición «no quiero que se empiece a
   guardar el saldo tras cada movimiento» seguía como vigente en la lista de lo
   que se cumplió. Encontrarlo era el trabajo. ✅
3. `docs/data-model.md` — los cuatro sitios, **más la regla 2 de la cabecera**,
   que era la raíz de los otros. El pseudocódigo de `balance(cuenta)` está
   reescrito con `readAnchor` / `resolveAnchorPoint` / `isAfter`, incluida la
   regla del empate. ✅
4. `src/modules/openbank/openbank.fixture.ts` — el JSDoc está en inglés con el
   contenido íntegro (aviso 🔴 incluido), y de paso se tradujeron los comentarios
   del array de cabeceras, que arrastraban español de antes. ✅

**Y el punto 3 no ha invertido la precedencia** —lo miré con lupa, porque es la
lectura equivocada que ya se coló una vez en esta feature—. El texto nuevo dice,
en los tres sitios donde toca el tema, lo correcto:

- Regla 2 de la cabecera: «El saldo lo ancla el extracto; encima se suma lo
  posterior. **El número del banco manda donde el banco lo da —eso no ha cambiado
  nunca—**».
- Debajo del pseudocódigo: «**La precedencia NO se ha invertido.** Donde el
  archivo trae saldo por línea, ese movimiento normalmente **es** `P` y el número
  sigue siendo el del banco, tal cual. Lo que desaparece es que la suma fuera un
  *fallback*».
- `docs/architecture.md`, revisión del ADR-011 decisión 3: «la precedencia del
  archivo **no cambia** —donde el banco da saldo, ese número sigue mandando—».

Coincide con el aviso técnico 2 del `intent`, con el ADR-028 y con el código.

### Los seis textos obsoletos extra, y los dos frenos

Los seis están y son correctos: `docs/architecture.md` (ADR-011 dec. 3, ADR-012
punto 13, ADR-014 punto 3), `docs/roadmap.md:359` —donde además caducó de verdad
el «desplazamiento constante por cuenta», que ya no existe—, y los resúmenes de
`investments-data-model`, `myinvestor-statement` y `statement-balance`, más los
dos informes hermanos. Todos con el mismo criterio que ya se usó en el lote A y
en el C: **tachar y anotar la reversión, no borrar el rastro**.

**Los dos frenos son correctos, y no había que tocar ninguno de esos sitios:**

- **`progress/history.md`** — su propia cabecera dice «Bitácora histórica
  (append-only) … **No edites entradas anteriores. Solo añades al final.**»
  Reescribir la entrada de la F19 habría roto la regla del archivo, y la
  reversión llega igual: por la entrada que el leader añade al cerrar la F31.
- **Los `specs/` de features cerradas** (`openbank-statement`,
  `myinvestor-statement`, `investments-data-model`) — son **lo que el humano
  aprobó en su día**. Reescribirlos falsearía el registro de una aprobación, y
  CHECKPOINTS C7 no lo pide. Lo que sí tenía que quedar al día son las
  *consecuencias* de esos specs, que viven en `docs/` y en los resúmenes: y ahí
  sí se ha entrado.

Barrido propio del repo tras las correcciones: **cero** textos vivos en `docs/`,
`progress/summaries/` o `progress/implementations/` que sigan afirmando que el
saldo por línea de Openbank se descarta o que `initialBalance` es el único ancla.

### Las dos condiciones de cierre

- **`./init.sh` — tests en verde.** Ejecutado por mí: **950 de 950**, 49 archivos,
  `tsc --noEmit` limpio. El único `[FAIL]` que queda es «3 features en
  `in_progress`», que es estado de coordinación (F31, F33, F34) y se resuelve al
  cerrarlas, no un defecto de código. Con `src/no-real-data.test.ts` **en verde**,
  el ADR-017 de esta feature queda comprobado de la forma más fuerte posible: el
  guardián pasa con todos los archivos de la F31 dentro del árbol. Coincide con lo
  que ya había medido en la 1ª pasada offender por offender, cuando el test aún
  estaba rojo por otras dos causas. (F33 y F34 no se revisan aquí.)
- **C4 bis — la prueba real: sigue pendiente y es del humano.** Esta feature toca
  un parser de banco y el saldo de todas las cuentas, así que el checkpoint
  aplica: hay que lanzar `POST /api/import/local` y comparar cada cuenta contra la
  web de su banco. **No es un fallo de la implementación** —el spec ya se lo
  encarga a él en la hoja de decisiones y el resumen de cierre lo repite como
  primera tarea suya—, es la única casilla de la feature que no puede cerrar un
  agente.

### Reverificado tras la churn de F33/F34

Como esas dos features han tocado el guardián y la suite, volví a comprobar que
lo de la F31 sigue intacto: el guardián de columnas de `Account` sigue siendo
lista cerrada con las tres columnas dentro; las dos mitades de la T10 siguen
partidas y la mitad «anterior» conserva sus aserciones originales; la migración
sigue sin un solo `UPDATE`/`DELETE`/`DROP`/`DEFAULT`; y `resolveAnchorPoint`
sigue devolviendo el `balanceAfter` cuando es más reciente que el ancla.

---

## Review (1ª pasada, 2026-08-25) — histórico

**Veredicto:** CHANGES_REQUESTED

### Cambios requeridos

1. **`docs/roadmap.md:151`** — la fila de Openbank sigue afirmando, como hecho
   vigente, que «El saldo por movimiento existe y **no se guarda**». Es el texto
   que el aviso técnico 4 del `intent` manda actualizar, y el peor de los que
   quedan: `docs/roadmap.md` **se lee al arrancar cada sesión** (protocolo de
   `CLAUDE.md`, paso 4). → **corregido**.
2. **`progress/summaries/openbank-statement.md:93` y `:156`** — el resumen de la
   F19 dice «se lee y **no** se guarda» y «queda anotado para el día que lo
   decidas». Ese día ha llegado. → **corregido, y con un tercero (`:128`) que se
   me había pasado**.
3. **`docs/data-model.md`** — se declara «el modelo real» y ya no lo era: `:75`
   (ER sin las tres columnas), `:156` (bloque Prisma sin ellas), `:294-306` (el
   pseudocódigo de `balance(cuenta)` era la fórmula de dos ramas **anterior** a
   la F31), `:799-807` («`initialBalance` es el único ancla»). → **corregido, más
   la regla 2 de la cabecera**.
4. **`src/modules/openbank/openbank.fixture.ts:41-50`** — párrafo en español
   dentro de un JSDoc en inglés; incumplía `docs/conventions.md:7-10` y
   `:437-443`. → **corregido**.

### Condiciones de cierre anotadas entonces

- `./init.sh` en rojo por 2 fallos de `src/no-real-data.test.ts` ajenos a la F31.
  → **resuelto por las F33 y F34 y por la limpieza del handoff**; hoy 950/950.
- C4 bis, la prueba real. → **sigue pendiente, y es tarea del humano**.

### Comprobado sin hallazgos (1ª pasada, todo sigue vigente)

- **Trazabilidad R1-R15 ↔ test.** Los quince tienen al menos un test concreto y
  ninguno se queda en el camino feliz. Verificados contra el código: R1-R5 y
  R12-R13 en `src/modules/import/import.service.test.ts`, R6-R10 en
  `src/modules/movements/movements.test.ts`, R11 en
  `src/modules/openbank/openbank.statement.parser.test.ts`, R14 en
  `src/modules/accounts/accounts.test.ts`, R15 en
  `src/modules/import/import.local.service.test.ts`.
- **Las 23 tasks están `[x]`** en `specs/real-account-balance/tasks.md`, y las 23
  tienen rastro en el código.
- **Los tres tests que cambiaron de resultado: ninguno se aflojó.**
  - **T10** (`movements.test.ts:113` y `:133`): la mitad «anterior» conserva
    **literalmente** las dos aserciones del test viejo; lo añadido es la mitad
    «posterior», que antes no existía, más un caso de desempate intradía.
  - **El guardián de columnas** (`investments.model.test.ts`): sigue siendo
    `toEqual` sobre una **lista cerrada**, con las tres columnas nuevas en su
    sitio alfabético. No se convirtió en `toContain`.
  - **`src/architecture.test.ts:282`**: **el test no se ha tocado**. Se corrigió
    el lado correcto — los comentarios nuevos de `import.service.ts` describen «un
    banco que no escribe preámbulo pero sí saldo en cada línea» sin nombrarlo.
- **Las cinco decisiones tomadas sobre la marcha**, valoradas una a una: el
  empate a favor del ancla (coherente con la decisión técnica 2 y testeado); la
  T13 sobre `SerializedAccount` (**premisa verificada**: `grep -rn "response:"
  src/` no devuelve ni una ocurrencia); `AccountReport.balanceAnchor` como el
  ancla de **después** del archivo (correcta, y el matiz está en 🔴 en el
  contrato); tocar `AttemptedFileReport` (no era opcional: ese tipo no extiende
  `StatementResult`); y la entrada del lote C en textos que su task no nombraba
  (era encargo, y está verificada contra el código).
- **La precedencia NO se ha invertido**, comprobado en el código:
  `computeAccountBalance` arranca del importe del punto de anclaje y
  `resolveAnchorPoint` elige el `balanceAfter` más reciente cuando es más nuevo
  que el ancla. Fijado por test en los dos sentidos, y de punta a punta con
  `moves the balance with movements newer than the last line that carries one`
  (3.000,00 el 31-07 + gasto de 50,00 el 02-08 → 2.950,00; antes daba 3.000,00).
- **La migración `20260825183936_balance_anchor`**: tres `ADD COLUMN` nullable y
  un `ADD CONSTRAINT … CHECK`. **Ni un `UPDATE`, `DELETE`, `DROP` ni `DEFAULT`**:
  no reescribe una sola fila de la base del humano.
- **T6 de verdad: una sola comparación de recencia.** `isAfter` es la única;
  `byMostRecent` está reescrito encima y la usan `resolveAnchorPoint`, el filtro
  de posteriores y el `mostRecentMovement` del importador. La ventana SQL de
  `attachBalances` es gruesa a propósito y el corte exacto lo hace el dominio.
- **Concurrencia (R3, R13):** las dos condiciones viajan en el `WHERE`, no en un
  `if` previo. `backfillMissingBalances` identifica la fila por **exactamente**
  las seis columnas del índice parcial `Movement_imported_dedup_key` más
  `origin: 'imported'`.
- **El enganche del anclaje** está dentro del `try`, después de
  `persistMovements` y antes de `status: 'imported'`; hay test de que un archivo
  que falla no ancla nada, y el relleno no hace ni una consulta sin duplicados.
- **Arquitectura y convenciones:** capas respetadas, sin `console.log` ni TODO
  sueltos, `tsc` limpio, tests con nombre descriptivo en inglés verificando
  **output concreto** contra base de datos real en vez de mocks.
- **C6 — contrato con el proyecto hermano:** `docs/api-contract.md` actualizado
  en la misma feature; el frontend no se ha tocado.
- **C7 — spec:** cuatro archivos; `decisions.md` en una página con los bloques de
  la plantilla y **6** puntos en 🔴, cada uno con su alternativa; **15**
  requirements; EARS estricto; procedencia completa con los quince `R<n>`
  clasificados y los dos `añadido` (R8, R13) marcados para la puerta.
- **C2 / C5:** `progress/current.md` describe la sesión activa sin arrastrar
  basura, y no hay archivos sin trackear sospechosos.
