# Resumen — feature 12 `import`

Fecha de cierre: 2026-08-12
Intención original: `feature_list.json` → feature `import`, bloque `intent`
Spec (SDD): [`specs/import/`](../../specs/import/decisions.md)

## Qué hace ahora la app que antes no

**Ahora los datos del banco entran de verdad en la base de datos.** Hasta hoy la
aplicación sabía conectarse a Drive, encontrar los archivos, descargarlos y
entenderlos, pero el resultado se quedaba en un JSON local: no había ni un
movimiento guardado. Con esta feature hay **un botón** —`POST /api/import`— que
hace el recorrido entero de una vez: baja los ficheros pendientes de Drive, elige
el parser por el banco de la carpeta, los convierte en movimientos, **los guarda**
en su cuenta y **solo entonces** mueve el archivo a `procesados/`.

Tres cosas que cambian tu día a día:

- **La cuenta se crea sola** cuando el fichero trae IBAN y banco, y la respuesta
  te dice con qué datos se creó. Si le falta el IBAN y ese banco no tiene
  **exactamente una** cuenta ya dada de alta, no se inventa nada: te devuelve un
  error propio (`MISSING_ACCOUNT_DATA`) y el fichero **no se mueve**, para que lo
  arregles y lo reintentes.
- **Reimportar es seguro.** Puedes lanzar el mismo fichero mil veces: no se
  duplica ni un movimiento, y el informe te dice cuántos descartó por repetidos.
  Y al revés: tres líneas idénticas del mismo día se guardan **las tres**.
- **«Procesado» pasa a significar «guardado».** Antes un archivo llegaba a
  `procesados/` en cuanto se descargaba, aunque no hubiera entrado ni un dato. Si
  la importación falla, ahora el archivo sigue pendiente en Drive.

Además, **MyInvestor ya puede tener cuenta**: su extracto no trae IBAN, así que
ahora lo escribes tú **una sola vez** como primera línea del CSV (`iban;<IBAN>`,
encima de la cabecera) y el parser lo lee de ahí. Y las rutas en español
`/api/ingesta/*` pasan a inglés: **`/api/ingestion/*`**.

> ⚠️ **Breaking change de contrato.** `/api/ingesta/*` responde **404** y
> `POST /api/ingestion/process` **ya no mueve** nada: se queda en «bájame la copia
> cruda para mirarla», que es lo que permite inspeccionar el fichero de un banco
> del que todavía no hay parser. Hoy no lo consume nadie (el frontend aún no tiene
> features de producto), pero está anotado en `docs/api-contract.md`,
> `progress/current.md` y el `README`.

## Por dónde se toca (puntos de entrada)

> Los únicos con número de línea, y son clicables.

| Cómo se usa | Código |
| --- | --- |
| `POST /api/import` — importa todo lo pendiente y devuelve el informe | [import.routes.ts:40](../../src/modules/import/import.routes.ts#L40) |
| El recorrido completo Drive → parser → BD → mover | [import.service.ts:175](../../src/modules/import/import.service.ts#L175) |
| **Dar de alta un banco = una línea aquí** (el único sitio de `src/` que nombra bancos) | [app.ts:36](../../src/app.ts#L36) |
| El IBAN que escribes a mano en el CSV de MyInvestor | [myinvestor.statement.parser.ts:134](../../src/modules/myinvestor/myinvestor.statement.parser.ts#L134) |
| `POST /api/ingestion/process` — solo descarga, ya no mueve | [ingestion.service.ts:72](../../src/modules/ingestion/ingestion.service.ts#L72) |

## Dónde está el código

> Todo lo que la feature creó o tocó, por tema. Archivo + símbolo: el símbolo se
> busca, la línea caduca.

### El importador (módulo nuevo `src/modules/import/`)

| Qué hace | Símbolo | Archivo |
| --- | --- | --- |
| Orquesta el recorrido entero y arma el informe | `importPending` | `src/modules/import/import.service.ts` |
| Un fichero de principio a fin, con su fallo aislado | `importFile` | `src/modules/import/import.service.ts` |
| Convierte movimientos parseados en filas de BD (función pura, sin BD) | `toMovementRows` | `src/modules/import/import.service.ts` |
| Decide a qué cuenta van: alta automática, la única del banco, o error | `resolveAccount` | `src/modules/import/import.service.ts` |
| Guarda sin duplicar (`createMany({ skipDuplicates })`) | `persistMovements` | `src/modules/import/import.service.ts` |
| Elige el parser por banco + extensión; sin coincidencia, `skipped` | `selectAdapter` | `src/modules/import/import.service.ts` |
| Cuenta los totales del informe | `totals` / `sum` | `src/modules/import/import.service.ts` |
| Convierte un error en `{ code, message }` saneado (sin token) | `describeError` | `src/modules/import/import.service.ts` |
| Da acceso a Prisma sin que las rutas nombren `prisma` | `importDb` | `src/modules/import/import.service.ts` |
| Traduce el alta de cuenta a lo que ve el usuario en el informe | `toAccountReport` | `src/modules/import/import.service.ts` |
| El endpoint, con parsers y ruta de copia cruda inyectables | `importRoutes` | `src/modules/import/import.routes.ts` |
| Qué es un parser para el importador (contrato inyectado) | `BankParserAdapter` / `BankParserRegistry` | `src/modules/import/import.types.ts` |
| La forma del informe: `skipped` vs `imported`/`failed` (unión discriminada) | `ImportedFileReport`, `SkippedFileReport`, `AttemptedFileReport`, `ImportRunResult` | `src/modules/import/import.types.ts` |

### El cableado

| Qué hace | Símbolo | Archivo |
| --- | --- | --- |
| El registro de bancos que se le inyecta al importador | `parsers: BankParserRegistry` | `src/app.ts` |
| Enchufa el endpoint bajo `/api/import` | `app.register(importRoutes, …)` | `src/app.ts` |

### El IBAN del preámbulo (parser de MyInvestor)

| Qué hace | Símbolo | Archivo |
| --- | --- | --- |
| Lee el IBAN **solo** de la línea etiquetada `iban;…` encima de la cabecera | `findIbanLine` | `src/modules/myinvestor/myinvestor.statement.parser.ts` |
| Lo publica en el resultado (antes era `null` fijo) | `accountIban` | `src/modules/myinvestor/myinvestor.statement.parser.ts` |

### La ingesta, renombrada a inglés y sin mover nada

| Qué hace | Símbolo | Archivo |
| --- | --- | --- |
| Detecta lo pendiente en Drive (sin cambios de fondo) | `detectPending` | `src/modules/ingestion/ingestion.service.ts` |
| Descarga y deja la copia local; **ya no mueve a `procesados/`** | `processPending` | `src/modules/ingestion/ingestion.service.ts` |
| Las rutas, ahora bajo `/api/ingestion` | `ingestionRoutes`, `IngestionRoutesOptions` | `src/modules/ingestion/ingestion.routes.ts` |
| Tipos del módulo, renombrados | `ProcessedFile`, `ProcessResult` | `src/modules/ingestion/ingestion.types.ts` |

> Los cinco archivos se movieron con `git mv`: el historial de cada uno se
> conserva. El directorio `src/modules/ingesta/` **ya no existe** y hay un
> guardián que lo vigila.

### Tests

| Qué cubre | Archivo |
| --- | --- |
| Mapeo campo a campo, tipo por el signo, saldo nulo, divisa vacía (puro) | [import.service.test.ts:113](../../src/modules/import/import.service.test.ts#L113) |
| Alta automática de cuenta desde el IBAN, con los valores por defecto reportados (R4) | [import.service.test.ts:252](../../src/modules/import/import.service.test.ts#L252) |
| Cada campo guardado leído de la base de datos real, sin enriquecer (R1, R12, R16) | [import.service.test.ts:280](../../src/modules/import/import.service.test.ts#L280) |
| No se crean productos de inversión ni valoraciones (R17) | [import.service.test.ts:344](../../src/modules/import/import.service.test.ts#L344) |
| Sin IBAN, se usa la única cuenta del banco (R5) | [import.service.test.ts:359](../../src/modules/import/import.service.test.ts#L359) |
| `MISSING_ACCOUNT_DATA` con cero cuentas y con más de una; nunca una cuenta sin IBAN (R6, R19) | [import.service.test.ts:376](../../src/modules/import/import.service.test.ts#L376) |
| Reimportar no duplica: comparación fila a fila antes/después (R7, R13) | [import.service.test.ts:425](../../src/modules/import/import.service.test.ts#L425) |
| Tres líneas idénticas del mismo día → tres movimientos (R8) | [import.service.test.ts:461](../../src/modules/import/import.service.test.ts#L461) |
| **El orden guardar → mover**: se consulta la BD en el instante del movimiento (R9) | [import.service.test.ts:488](../../src/modules/import/import.service.test.ts#L488) |
| Un fichero que falla no se mueve, no arrastra a los demás y no filtra el token (R10) | [import.service.test.ts:526](../../src/modules/import/import.service.test.ts#L526) |
| Importación parcial: guarda lo bueno, cuenta lo ilegible y mueve igual (R2, R11) | [import.service.test.ts:575](../../src/modules/import/import.service.test.ts#L575) |
| Sin parser o extensión no soportada → `skipped`, sin importar ni mover (R14) | [import.service.test.ts:608](../../src/modules/import/import.service.test.ts#L608) |
| Copia cruda antes de parsear, nada pendiente, Drive caído de nivel superior | [import.service.test.ts:650](../../src/modules/import/import.service.test.ts#L650) |
| El endpoint: 200 con el informe, orden más reciente primero, sin alta ni borrado por API (R2, R3, R16) | [import.routes.test.ts:121](../../src/modules/import/import.routes.test.ts#L121) |
| El IBAN del preámbulo: lo lee, tolera `;` y espacios, ignora el que va debajo de la cabecera, no ensucia los movimientos, aguanta el BOM de Excel (R18) | [myinvestor.statement.parser.test.ts:262](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L262) |
| `process` copia sin mover y sigue siendo idempotente (R15) | [ingestion.service.test.ts:135](../../src/modules/ingestion/ingestion.service.test.ts#L135) |
| `/api/ingesta/*` → 404 con el cuerpo de error estándar, y las mismas capacidades bajo `/api/ingestion/*` (R20) | [ingestion.routes.test.ts:135](../../src/modules/ingestion/ingestion.routes.test.ts#L135) |
| Guardianes: no existe `modules/ingesta/`, el importador no nombra ningún banco, el importador nunca hace `account.create` | [architecture.test.ts:193](../../src/architecture.test.ts#L193) |

### Documentación

| Qué | Archivo |
| --- | --- |
| `POST /api/import` con su informe y sus códigos + nota de breaking change | `docs/api-contract.md` |
| **ADR-015** (registro de parsers inyectado, mover tras guardar, renombrado) | `docs/architecture.md` |
| Regla «ningún dato real en un fixture» y las dos reglas nuevas de banco/IBAN | `docs/conventions.md` |
| Cuarto paso al dar de alta un banco (la línea de `app.ts`) y «el IBAN va en el fichero» | `docs/dar-de-alta-un-banco.md` |
| E2 y E5 ✅, cabos sueltos nº 1 y nº 4 tachados, nº 10 nuevo | `docs/roadmap.md` |
| Endpoints al día, árbol de módulos y nota de breaking change | `README.md` |

## Cumplimiento de la intención

Punto por punto del `como_se_que_esta_bien` que escribiste:

- ✅ **«Importo el extracto y sus movimientos aparecen al listarlos por la API,
  del más reciente al más antiguo.»** Se cumple; verificado en
  [import.routes.test.ts:153](../../src/modules/import/import.routes.test.ts#L153)
  (importa y luego lista por `GET /api/movements`, comprobando el orden) y campo
  a campo contra la base de datos en
  [import.service.test.ts:280](../../src/modules/import/import.service.test.ts#L280).
- ✅ **«Si la cuenta no existía, se ha creado sola con el IBAN y el banco, y se me
  dice con qué datos.»** Se cumple: se reutiliza el alta automática de la F8 y el
  informe devuelve `created: true` con los valores por defecto usados. Verificado
  en [import.service.test.ts:252](../../src/modules/import/import.service.test.ts#L252).
- ✅ **«Si falta el IBAN, no se crea ninguna cuenta a ciegas: error que distingo
  del resto.»** Se cumple con el código propio `MISSING_ACCOUNT_DATA`, tanto si el
  banco no tiene cuentas como si tiene más de una. Verificado en
  [import.service.test.ts:376](../../src/modules/import/import.service.test.ts#L376),
  [:396](../../src/modules/import/import.service.test.ts#L396) y
  [:409](../../src/modules/import/import.service.test.ts#L409). Hay además un
  guardián de arquitectura que **prohíbe crear cuentas desde el importador**
  ([architecture.test.ts:216](../../src/architecture.test.ts#L216)): no hay
  cuarta vía posible.
- ✅ **«El saldo sale del saldo que traía la última línea, no de sumar
  movimientos.»** Se cumple: `computeAccountBalance` de la F8 no se ha tocado y el
  importador **no inventa saldo** — para MyInvestor, que no lo reporta, guarda
  `balanceAfter = null`. Verificado en
  [import.service.test.ts:170](../../src/modules/import/import.service.test.ts#L170)
  y en la lectura de BD de [:280](../../src/modules/import/import.service.test.ts#L280).
- ✅ **«Vuelvo a importar el mismo archivo y no se duplica ni un movimiento.»** Se
  cumple, apoyado en el índice único parcial que ya existía; el informe dice
  cuántos descartó. Verificado en
  [import.service.test.ts:425](../../src/modules/import/import.service.test.ts#L425),
  que compara **fila a fila** (mismos ids, mismos valores) el estado de la base de
  datos antes y después de la segunda pasada.
- ✅ **«Tres líneas idénticas el mismo día guardan los tres movimientos.»** Se
  cumple, gracias al `daySequence` que emiten los parsers desde la F11. Verificado
  en [import.service.test.ts:461](../../src/modules/import/import.service.test.ts#L461).
- ✅ **«El archivo solo aparece en `procesados/` después de que sus movimientos
  estén guardados; si falla, sigue pendiente y puedo reintentar.»** Se cumple, y es
  el punto que se miró con más lupa: el test no se cree el orden, lo **mide**
  —consulta la base de datos dentro del propio movimiento del archivo y exige que
  las filas ya estén ahí
  ([import.service.test.ts:488](../../src/modules/import/import.service.test.ts#L488))—.
  El caso del fallo, en [:526](../../src/modules/import/import.service.test.ts#L526).
  Y `POST /api/ingestion/process` ya no mueve nada
  ([ingestion.service.test.ts:135](../../src/modules/ingestion/ingestion.service.test.ts#L135)).
- ✅ **«Una línea rara no me bloquea el mes entero: los movimientos buenos se
  guardan y las problemáticas se me reportan.»** Se cumple: guarda lo bueno,
  cuenta lo ilegible, lo lista y mueve el archivo igual. Verificado en
  [import.service.test.ts:575](../../src/modules/import/import.service.test.ts#L575).
- ✅ **«Una línea que el parser no entendió no se pierde en silencio.»** Se cumple:
  llega al informe con su número de línea y su motivo, además del recuento. Mismo
  test.

Y de los `que_no_quiero`, todos respetados: no se categoriza, no se asigna forma
de pago, no se emparejan traspasos ni se rellena `transferId`, no se enlaza
`productId`, todo entra como `pending_review`, no hay alta ni borrado de
movimientos por API
([import.routes.test.ts:171](../../src/modules/import/import.routes.test.ts#L171)),
no hay interfaz, no se rehízo Drive y no se inventa ningún saldo.

## Decisiones que se tomaron por ti

Lo que en el spec estaba marcado `(delegado)` o `(añadido)` y aprobaste en
[`decisions.md`](../../specs/import/decisions.md):

- **(delegado) La importación se dispara con un endpoint nuevo, `POST /api/import`,
  sin cuerpo**, en vez de reutilizar los de la ingesta. Los de la ingesta se
  quedan para «mirar antes de importar», que es lo que necesitas al dar de alta un
  banco del que aún no hay parser.
- **(delegado) `POST /api/ingestion/process` deja de mover** en vez de
  desaparecer: mover pasa a ser consecuencia de **guardar**. Esto cierra el cabo
  suelto nº 1 del roadmap.
- **(delegado) El dedup se apoya en el índice único parcial que ya existía**
  (`createMany({ skipDuplicates })`), no en una comprobación previa en código: es
  la base de datos la que garantiza que no hay duplicados, aunque dos
  importaciones corrieran a la vez. El informe te dice cuántos descartó.
- **(añadido, decisión tuya del 2026-08-12) El IBAN se escribe una vez en el
  fichero** —«es como un DNI»— y se **refuerza** la regla de no admitir nunca una
  cuenta sin IBAN. La restricción de la F10 (nunca deducir un IBAN de un concepto
  que tenga esa pinta) **no se relaja**: solo se lee de la línea etiquetada.
- **(añadido, decisión tuya del 2026-08-12) El renombrado `ingesta` → `ingestion`**,
  para mantener la norma de código en inglés. Es el breaking change de contrato de
  arriba; entró aquí porque esta feature ya tocaba ese flujo.
- **(añadido) El importador no conoce ningún banco.** La lista de parsers se le
  inyecta desde `app.ts`, que pasa a ser el único archivo de `src/` autorizado a
  nombrar un banco; un guardián lo vigila. Dar de alta un banco es **una línea**
  ahí, y mientras no exista, sus ficheros salen como `skipped` en el informe (ni se
  importan ni se mueven), que es justo lo que te deja inspeccionarlos.
- **(añadido) Una regla de proyecto nueva:** *ningún dato real en un fixture*,
  incluidos los tuyos y los que pegues en una conversación
  (`docs/conventions.md` §Tests). Salió de esta revisión: el IBAN real de tu cuenta
  había llegado al árbol de trabajo desde el spec. **No llegó a ningún commit** y
  se sustituyó por el de ejemplo público antes de cerrar.

## Qué NO se tocó / quedó fuera

- **El esquema de la base de datos.** Ni una migración: el modelo de la F8/F9 ya
  daba para esto.
- **Los productos de inversión y sus valoraciones** (F13). Se comprueba
  explícitamente que importar **no** crea ninguno.
- **La categorización, la forma de pago, los traspasos y la confirmación** de lo
  importado: todo eso son features posteriores. Lo importado se queda en
  `pending_review`.
- **El parser de Bankinter**, `movements.*`, `categories.*` y la conexión con
  Drive: reutilizados sin tocar.
- **No hay interfaz.** El frontend consumirá `POST /api/import` en otra sesión,
  leyendo `docs/api-contract.md`.
- **Los nombres `ProcessedFile` / `processedCount` de la ingesta**, que ya no
  significan «procesado» sino «descargado». Cambiarlos es un segundo breaking
  change que el spec no autorizaba; queda pendiente de una feature de limpieza.

## Notas para el futuro

- **`daySequence` solo numera las filas que el parser entendió** (cabo suelto nº 10
  del roadmap, sin dueño). Si un fichero tiene una línea ilegible y luego se
  arregla, las posiciones del día podrían cambiar y una reimportación crearía
  duplicados en vez de deduplicarlos. No pasa hoy, pero está anotado.
- **El dedup depende de que todos los parsers emitan `daySequence`.** Un parser
  futuro que lo omitiera dejaría de deduplicar **en silencio** (en un índice único,
  los nulos no chocan entre sí). Hoy lo emiten los dos.
- **Si un fichero se guarda pero falla al moverse**, queda con sus movimientos en
  la base de datos y sin mover. La reimportación lo resuelve sola (0 nuevos, n
  duplicados) y entonces sí lo mueve. Es correcto, pero conviene conocer el camino.
- **La importación va fichero a fichero, en serie.** Correcto para un puñado de
  ficheros al mes, y es lo que permite aislar el fallo de uno.
- **Deber tuyo:** si editas el CSV de MyInvestor con Excel, guárdalo como
  **«CSV UTF-8»**. El parser descodifica UTF-8 explícitamente y Excel reescribe en
  cp1252, lo que rompería todos los acentos de los conceptos.
- **Falta un `dryRun` o un `GET /api/import/status`**: hoy la única forma de saber
  qué haría la importación es ejecutarla.
