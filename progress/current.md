# Sesión actual

> Este archivo se vacía al cerrar cada sesión y se mueve a `history.md`.
> Mientras trabajas, **mantenlo actualizado en tiempo real**, no al final.

- **Tarea en curso:** **F12 `import`** — implementada y en revisión. El árbol de
  trabajo lleva el código de los cuatro lotes **sin commitear**.
- **Inicio:** 2026-08-11 (continúa el 2026-08-12)
- **Agente:** leader + spec-author + implementer + reviewer

## ⚠️ Breaking changes de esta sesión (para el harness del frontend)

Anotados aquí porque [`docs/related-projects.md`](../docs/related-projects.md) lo
exige: la feature del frontend que los consuma se planifica **después**.

- **`/api/ingesta/*` → 404.** Sus rutas pasan a `/api/ingestion/*`
  (`pending` y `process`). Es el renombrado a inglés que pidió el humano.
- **`POST /api/ingestion/process` cambia de significado:** ya **no** mueve el
  fichero a `procesados/`; se queda en «bájame la copia cruda para mirarla».
  Quien importa de verdad es el endpoint nuevo **`POST /api/import`**.
- Detalle y modelos en [`docs/api-contract.md`](../docs/api-contract.md).
- Contexto: el contrato anterior **no lo consumía nadie** (el frontend no tiene
  features de producto), así que el coste real es cero. El otro breaking change
  vivo, `/api/expenses*` → 404, sigue igual desde la F8.

## Plan

El humano aportó dos cosas nuevas sobre cómo va a trabajar y pidió repasar lo que
quedaba abierto. Decisiones tomadas (2026-08-11):

### 1. La plantilla de los ficheros de inversión vive **fuera** de `notas-banco/`

Va a escribir los JSON de producto copiando una plantilla que quiere tener **en
Drive**, no en el repo. Eso chocaba con el parser: la spec da por producto **todo**
`.json` de la carpeta del banco, no valida nunca el nombre y trata una clave
desconocida como error — así que la plantilla habría salido como fichero roto en
cada parseo, o peor, se habría colado como un producto inventado.

Comprobado en el código dónde puede vivir sin que el backend la vea:

| Ubicación | Qué pasa |
|---|---|
| `notas-banco/plantillas/` | la toma por **un banco** ([`drive-structure.ts:371`](../src/lib/drive-structure.ts#L371)) |
| `notas-banco/myinvestor/plantillas/` | la toma por **un año** ([`drive-structure.ts:392`](../src/lib/drive-structure.ts#L392)) |
| **hermana de `notas-banco/`** | ✅ invisible para el backend |

**Decidido:** carpeta hermana de `notas-banco/`. Es deber del humano, no código.

### 2. Ya NO habrá ficheros `.txt` en la carpeta del banco

Eran sus tres capturas de la web. La lista de `ignored[]` de la F10 **se queda
igual**: pierde su motivo original pero sigue siendo la red que hace visible
cualquier fichero que se cuele, sin contarlo como fallo.

### 3. IBAN y saldo de la cuenta corriente: **por API, no en el fichero**

El humano dijo que «los rellena él»; aclarado que lo hace **al dar de alta la
cuenta**, una sola vez, y **no** editando el CSV cada mes. **No toca código: la
F10 se queda como está** (emite `null` en ambos, que es lo correcto).

🔴 **Consecuencia para la E7 (Consultar):** hoy el saldo de una cuenta sale del
`balanceAfter` del movimiento más reciente, y MyInvestor **no lo trae nunca**. El
«plan B» de la F8 —sumar desde `initialBalance`— deja de ser la excepción y pasa
a ser **el único camino para esta cuenta**. Hay que exigírselo a la feature de
consulta cuando se escriba.

### 4. Los cinco puntos rojos de la F13: cuatro se aprueban, **el nº1 cambia**

- 🔄 **nº1 — los números van como número JSON puro (`1312.72`), no entre comillas
  en formato español.** Las fechas siguen en `AAAA-MM-DD`.
  **Efecto de arrastre:** la F13 ya **no** necesita `parseAmountText` (la pieza que
  la F10 construyó y que su spec daba por consumida); a cambio aparece un error
  nuevo: que el valor venga como texto en vez de como número.
- ✅ nº2 `date` obligatorio también en el depósito · nº3 choque producto+fecha se
  queda con el primero alfabético y reporta el otro · nº4 clave desconocida =
  error salvo las que empiezan por `_` · nº5 volcado a un `products.json` por año.

## Bitácora

- ✅ **F9, F11 y F10 cerradas y commiteadas** en cuatro commits verificados uno a
  uno en un worktree (197 → 220 → 230 → 280 tests). Ver [`history.md`](history.md).
- ✅ **Las cuatro decisiones propagadas** a
  [`specs/myinvestor-products/`](../specs/myinvestor-products/) por el `spec-author`.
  Changelog de cinco líneas al final de
  [`specs/myinvestor-statement/CHANGELOG-respec.md`](../specs/myinvestor-statement/CHANGELOG-respec.md).
  La F13 sigue en `spec_ready`; no se ha tocado `feature_list.json` ni código.
  ⚠️ Una corrección al porqué de la decisión 1 (el sitio de la plantilla): una carpeta
  dentro del banco **no** se toma por un año —el listado filtra por nombre de cuatro
  cifras ([`drive-structure.ts:399`](../src/lib/drive-structure.ts#L399))—; el motivo
  que sí se sostiene es que cualquier carpeta colgada de `notas-banco/` se toma por un
  banco ([`:365`](../src/lib/drive-structure.ts#L365)). La decisión no cambia.
- ✅ **Lista de campos cerrada** (2026-08-11). De las 19 casillas solo 3 necesitaban
  decisión, y el humano las resolvió:
  - **`closedAt` es campo del archivo**, en los dos tipos, escrito por él **una sola
    vez** el último mes del producto. Deja de ser un campo inventado sin dueño: la
    columna `InvestmentProduct.closedAt` de la F9 **ya tiene escritor**.
  - **`currency` se queda opcional** y no se teclea nunca; se asume `EUR`.
  - 🔄 **El archivo del depósito se escribe SOLO al contratarlo y al vencer**, no cada
    mes. Sus condiciones no fluctúan, así que no hay serie que conservar. No obliga a
    cambiar el spec, pero **sí cambia su rutina mensual**, así que queda escrito.
  - Coste mensual resultante: **5 valores** por fondo o ETF, **6** en la cartera,
    **nada** en los depósitos salvo cuando pasa algo.
- ✅ **`intent` de la F12 `import` cerrado por el humano** y `acceptance` derivado
  (12 criterios). Tres decisiones: mover a `procesados/` **tras guardar** (retoca la
  F5, cierra el cabo suelto #1), **importación parcial guarda lo bueno** y reporta el
  resto, y el guardado de **productos de inversión queda fuera** (su regla de
  duplicado es la contraria: recargar sobrescribe).
- 🎉 **No queda ningún `intent` en borrador ni ninguna decisión esperando al humano.**
- ⏭ **Siguiente, cuando se quiera:** implementar la F13 (spec ya cerrado) y escribir
  el spec de la F12 (`sdd: true`, aún sin carpeta en `specs/`). Y las **pruebas de la
  aplicación real** que pidió el humano.

## 2026-08-12

- 🔧 **`./init.sh --state` volvía a estar roto en Windows y nadie lo sabía.**
  [`init.sh:192`](../init.sh#L192) abría `feature_list.json` sin `encoding`, así que
  Python usaba la codepage del sistema (`cp1252`) y el primer acento tumbaba la
  validación entera con un `[FAIL]` genérico que no decía que era de codificación.
  Arreglado con `encoding="utf-8"` y el porqué anotado al lado. Ahora sí corre la
  comprobación que antes no llegaba: **13 features, specs presentes, estado coherente**.
  ⚠️ El `init.sh` viene del harness-template: **el mismo bug está allí** y en cualquier
  otro proyecto que lo use.
- ▶️ **Orden de trabajo acordado con el humano:** F12 antes que la F13. La F13 está
  lista para implementar, pero no aporta nada mientras nada sepa persistir; la F12 es
  la que convierte esto en una app que guarda datos.
- ✅ **Spec de la F12 `import` escrita** en [`specs/import/`](../specs/import/) y feature
  a `spec_ready`. Cuatro puntos rojos a la puerta de aprobación.
- ✅ **Los cuatro resueltos por el humano el 2026-08-12.** Tres cambian el spec:

  1. 🔄 **El IBAN SÍ viene en el fichero.** El humano añadió a mano una línea de
     preámbulo `iban;ES30…` al CSV de MyInvestor en Drive. **Hoy no la lee nadie:** el
     parser emite `accountIban: null` **fijo**
     ([`myinvestor.statement.parser.ts:89`](../src/modules/myinvestor/myinvestor.statement.parser.ts#L89)),
     porque cuando se hizo la F10 el extracto no lo traía. No rompe nada (la cabecera se
     busca por nombre, así que la línea se salta como preámbulo), pero se ignora.
     **Su regla, mejor que las dos opciones que se le ofrecieron:** el IBAN se pone
     **una sola vez** —no cambia nunca, «es como un DNI»— y se **refuerza** la norma de
     no admitir jamás una cuenta sin IBAN; si falta, se avisa para que lo ponga en uno
     de los ficheros. Con eso la búsqueda por banco deja de ser adivinar: la cuenta ya
     existe porque su IBAN se leyó en su día.
     ⚠️ El test **R20** de la F10 (no inferir el IBAN de un concepto con forma de IBAN)
     **sigue vigente y no se relaja**: solo se lee la línea etiquetada.
  2. ✅ **Punto 2 aprobado**, con un añadido: la respuesta debe decir **cuántas** líneas
     fallaron, no solo cuáles.
  3. ✅ **Punto 3 aprobado + renombrado a inglés de `ingesta/`** («es una norma y hay que
     mantenerla»). Entra en esta feature, que ya retoca ese flujo. **Cierra el cabo
     suelto nº4.** Es breaking change de contrato, pero hoy no lo consume nadie.
  4. ✅ **Punto 4 aprobado** sin cambios.

- 📌 **Deber nuevo del humano:** si edita el CSV con Excel, guardarlo como **CSV UTF-8**.
  El parser descodifica UTF-8 explícitamente y Excel reescribe en cp1252, lo que le
  rompería todos los acentos. (Su pantallazo ya mostraba `SUSCRIPCIÃ"`, pero eso era
  Excel mostrándolo mal, no el archivo.)
- ✅ **Tres resoluciones propagadas al spec.** Requirements **17 → 20** (R18 IBAN del
  preámbulo, R19 nunca una cuenta sin IBAN, R20 `/api/ingesta/*` → 404); ninguno
  retirado. `tasks.md` pasa de 3 a 4 lotes. `decisions.md` queda a **cero puntos rojos**.
  ⚠️ **La F12 es la feature más gorda hasta ahora** (tope recomendado ~15): ya no es
  solo el importador, lleva dentro el cambio al parser de MyInvestor y el renombrado.
  Los tres tocan los mismos archivos, así que separarlos costaría tocarlos dos veces.
- ✅ **Puerta de aprobación pasada** (2026-08-12). Feature a `in_progress`.
- 🚧 **`implementer` lanzado.** Instruido para dejar el **lote del renombrado
  autocontenido** (mecánico y ruidoso: mezclado con la lógica del importador haría la
  revisión ilegible) y para **no commitear nada**. Pendiente después: `reviewer`.
- ✅ **F12 implementada** (los cuatro lotes, **31/31 tasks `[x]`**). Informe en
  [`progress/implementations/import.md`](implementations/import.md).
  - **Lote A** — módulo nuevo [`src/modules/import/`](../src/modules/import/):
    `POST /api/import`, registro de parsers inyectado, `toMovementRows` puro, dedup
    por `createMany({ skipDuplicates })` contra el índice parcial, y el movimiento a
    `procesados/` **solo tras guardar**.
  - **Lote B** — el parser de MyInvestor lee la línea `iban;…` del preámbulo. El
    test **R20 de la F10 no se ha tocado** y sigue en verde.
  - **Lote C** (autocontenido) — `git mv src/modules/ingesta` → `ingestion`, sus
    cinco archivos y símbolos renombrados, `POST /api/ingestion/process` deja de
    mover, cableado en `app.ts` y guardianes de `architecture.test.ts`
    **actualizados, no desactivados**.
  - **Lote D** — `api-contract.md` (endpoint nuevo + nota de breaking change),
    ADR-015, roadmap (E2 y E5 ✅, cabos sueltos nº 1 y nº 4 tachados, nº 10 nuevo
    por el límite de `daySequence`), `conventions.md` y `dar-de-alta-un-banco.md`.
  - `./init.sh` **verde**: 24 archivos, **316 tests** (antes 280), typecheck, `lint`
    y `format:check` limpios. **Sin commits**, como se pidió.
- 🟥 **`reviewer`: CHANGES_REQUESTED** → [`progress/reviews/import.md`](reviews/import.md).
  **El importador en sí lo aprueba**: R1-R20 con test real contra base de datos y no
  contra mocks; verificó a fondo y dio por buenos los tres puntos que el implementer
  había marcado con lupa (el test de R9 **sí** prueba el orden guardar→mover,
  `ON CONFLICT DO NOTHING` sin target **sí** cubre el índice parcial, y el aislamiento
  por slug es real), más el R20 de la F10 intacto, la invariante del IBAN sin cuarta
  vía, los guardianes actualizados y **E2/E5 ✅ del roadmap ciertos** (no se adelantó).
  Los tres bloqueantes son **de fuera del módulo**:
  1. 🔴 **El IBAN real del humano estaba versionado** en 8 sitios (test del parser,
     `dar-de-alta-un-banco.md`, los tres archivos del spec y el propio informe de
     revisión). **Fallo del leader**, no del implementer: le pasó al `spec-author` el
     CSV real que el humano pegó, sin sustituir el número por uno de ejemplo, y de ahí
     bajó a todo lo demás. ✅ **Cero commits afectados** (`git log --all -S` vacío):
     se arregla con un reemplazo, sin reescribir historia. Sustituido por
     `ES9121000418450200051332` (el IBAN español de ejemplo de la documentación
     pública). **Regla que queda escrita: en un fixture nunca va un dato real del
     humano, ni siquiera uno que él mismo haya pegado en la conversación.**
  2. `README.md` seguía documentando `/api/ingesta/*`, decía que `process` mueve a
     `procesados/` y no listaba `POST /api/import`.
  3. `progress/current.md` describía la sesión del spec y no anotaba el breaking
     change que exige `docs/related-projects.md`. ✅ **Corregido por el leader** (ver
     la sección de arriba).
- ✅ **Bloqueantes 1 y 2 corregidos** por el implementer. El IBAN real sale de 13
  ocurrencias en 6 archivos; `README.md` al día (rutas `ingestion`, `POST /api/import`,
  breaking change, árbol de módulos y `POST /api/parser/myinvestor`, que faltaba desde
  la F10). Regla nueva en [`docs/conventions.md`](../docs/conventions.md) §Tests.
- ✅ **`reviewer`: APROBADO** en segunda pasada.
  - Confirmó **por su cuenta** el bloqueante 1: `ES30…` a **0 ocurrencias** en todo el
    árbol, y ni `git log --all -S` ni `git grep` lo encuentran → **nunca llegó a un
    commit**. Contó 16 ocurrencias del sustituto en 8 archivos (el parte del
    implementer decía 13/6: la diferencia son tres `progress/*.md`).
  - `./init.sh` verde verificado por él: 24 archivos, **316 tests**, `tsc`, `lint` y
    `format:check`. Nada de lo aprobado en la primera pasada quedó tocado.
  - Resumen de cierre en [`progress/summaries/import.md`](summaries/import.md).
  - **Nit no bloqueante, ya corregido por el leader:** `requirements.md` R18 decía que
    el humano había puesto *ese* IBAN concreto en su CSV, lo cual dejó de ser literal
    al sustituirlo. Ahora usa la forma elidida `iban;ES…`, como ya hacían
    `api-contract.md` y el roadmap.
- ⏭ **Pendiente:** marcar `done` (lo hace el implementer) y **decidir los commits con el
  humano** — la idea acordada es separarlos: el renombrado por un lado, el importador
  por otro.
