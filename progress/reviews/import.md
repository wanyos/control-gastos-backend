# Review — F12 `import`

**Veredicto:** RECHAZADO (CHANGES_REQUESTED)
**Fecha:** 2026-08-12 · **Revisor:** reviewer · **Informe revisado:**
[`progress/implementations/import.md`](../implementations/import.md)

`./init.sh` verde por mi cuenta: **24 archivos, 316 tests**, `tsc` sin errores.
El código y los tests del importador están bien: lo que bloquea el cierre son
**tres cosas de fuera del módulo** (un dato bancario real versionado y dos
documentos que quedaron mintiendo). Ninguna obliga a tocar `src/modules/import/`.

---

## Cambios requeridos

### 1. `src/modules/myinvestor/myinvestor.statement.parser.test.ts:259` — un IBAN real versionado

El IBAN `ES9121000418450200051332` entra en el repositorio con esta feature en
**cinco sitios**:

| Archivo | Dónde |
|---|---|
| `src/modules/myinvestor/myinvestor.statement.parser.test.ts` | líneas 259, 265, 271, 275, 284, 293, 306, 310 |
| `docs/dar-de-alta-un-banco.md` | línea 135 (bloque de ejemplo) |
| `specs/import/requirements.md` | procedencia de R18 |
| `specs/import/decisions.md` | línea 53 |
| `specs/import/design.md` | línea 199 |

No es un IBAN de manual: **tiene checksum válido** y la propia
`specs/import/requirements.md` (procedencia de R18) lo atribuye al humano —
«Él mismo añadió la línea `iban;ES9121000418450200051332` **al CSV de MyInvestor
en Drive**». Es decir: por lo que dice el propio spec, es el IBAN real de su
cuenta, y `docs/dar-de-alta-un-banco.md` lo presenta como «esta forma exacta».

Choca de frente con una regla que este proyecto repite feature tras feature —
«ningún dato bancario real se versiona» (acceptance de la F5, la F6, la F13) — y
es de las cosas que, una vez commiteadas, ya no se borran del historial.

**Qué hacer:** sustituirlo por un IBAN sintético evidente (los otros tests ya usan
`ES9820385778983000760236`, el de los manuales) en los cinco archivos. Si el
humano confirma por escrito que ese IBAN **no** es el suyo, basta con anotarlo en
`progress/implementations/import.md` y no se toca nada.

### 2. `README.md:68-69` y `README.md:106` — documentan el nombre viejo y una ruta que hoy da 404

El renombrado `ingesta/` → `ingestion/` está bien hecho en código, tests, rutas,
`api-contract.md`, `architecture.md` (ADR-009 anotado como *retocado por ADR-015*)
y `roadmap.md`. Pero el `README` se quedó atrás y ahora **documenta endpoints que
responden 404**:

- `README.md:68` → `GET /api/ingesta/pending`, hoy 404 (R20).
- `README.md:69` → `POST /api/ingesta/process`, hoy 404 **y** con la descripción
  «Descarga los pendientes **y los mueve a `procesados/`**», que R15 ha dejado de
  ser verdad.
- `README.md:106` → el árbol del proyecto lista `modules/ingesta/`, un directorio
  que ya no existe (lo vigila el guardián nuevo de `architecture.test.ts:193`).
- Falta `POST /api/import`, el endpoint que estrena la feature.

Es exactamente la referencia viva al nombre viejo que el renombrado tenía que no
dejar.

### 3. `progress/current.md` — describe la sesión anterior, no esta

Sigue diciendo «**Tarea en curso:** redacción del spec de la F12 … **No hay código
de aplicación en vuelo**», cuando hay una feature entera implementada en el árbol.
Incumple dos cosas:

- **C2 de `CHECKPOINTS.md`**: `current.md` debe describir la sesión activa, sin
  basura de la anterior. Y `.claude/agents/implementer.md:45` lo pide
  explícitamente («anota `Feature en curso: <id> — <name>`»).
- **`docs/related-projects.md`**: un breaking change de contrato se anota «de forma
  visible en `docs/api-contract.md` **y en `progress/current.md`**». En
  `api-contract.md` está (líneas 378-388); en `current.md` no hay ni una línea de
  que `/api/ingesta/*` haya desaparecido, que es justo lo que el harness del
  frontend leerá para planificar.

---

## Lo que se miró con lupa (y aguanta)

**El test de R9 prueba el orden de verdad.**
`import.service.test.ts:488` no se prueba a sí mismo: el doble de `files.update`
ejecuta un `movement.count()` **contra la base de datos real** en el instante en
que el código llama a `moveFileToProcessed`, y el `expect(storedWhenMoved).toBe(2)`
se evalúa después. Si el `createMany` se moviera detrás del `moveFileToProcessed`
—el único cambio de flujo que R9 prohíbe— el contador leería 0 y el test caería;
si el `update` no llegara a llamarse, el valor se quedaría en el `-1` inicial y
también caería. El filtro por `description startsWith tag` (con `Date.now()`) lo
aísla del resto de la suite. Es un test caro de leer pero honesto.

**El dedup encaja con el índice PARCIAL.**
`createMany({ skipDuplicates })` emite `ON CONFLICT DO NOTHING` **sin target**, y
esa forma —a diferencia de `ON CONFLICT (cols)`— cubre cualquier índice único que
salte, incluidos los parciales: Postgres no necesita inferir el índice. Encaja con
`Movement_imported_dedup_key` (`prisma/migrations/20260806191700_data_model/migration.sql:106`),
que es `UNIQUE … WHERE origin = 'imported'`, y como el importador escribe siempre
`origin='imported'` (`import.service.ts:89`) toda fila cae dentro del predicado.
Y no es solo razonamiento: el test de R7/R13 lo comprueba contra la base de datos
real comparando **fila a fila** (mismos ids) el estado antes y después de la
segunda pasada. Riesgo residual anotado y correcto: `daySequence` es nullable y
en un índice único los `NULL` no colisionan — hoy no pasa porque todos los parsers
lo emiten desde la F11, pero un parser que lo omitiera dejaría de deduplicar en
silencio. No es de esta feature.

**El aislamiento de los tests es real, no una alfombra.**
Cada test genera su propio slug (`zz-import-<ts>-<n>`) y su propio IBAN, el
`afterEach` borra movimientos y cuentas **de esos slugs**, y las aserciones de
conteo (`accountsOfTheBank`, `investmentProduct.count({ where: { bank } })`)
llevan siempre el `where` del banco del test. No hay ningún conteo global
sobreviviente que pueda esconder una fuga. La sustitución del `account.count()`
global está bien justificada en el informe: era el test el que estaba mal, no el
aislamiento.

**El test R20 de la F10 sigue intacto y en verde.**
`git diff` sobre `myinvestor.statement.parser.test.ts` no toca ni una línea del
`describe` de «the balance and the IBAN this bank does not report»: los casos
nuevos van en un `describe` aparte añadido debajo (línea 253). El comentario del
parser lo dice explícitamente y `findIbanLine` (`myinvestor.statement.parser.ts:134`)
solo mira las líneas **por encima** de la cabecera y solo aquella cuya primera
celda normalizada es exactamente `iban`: nada se infiere de la forma de una
cadena. Cubierto además por el caso «returns null when the iban line is absent,
empty **or below the header**».

**«Nunca una cuenta sin IBAN» se sostiene por todos los caminos.**
`resolveAccount` (`import.service.ts:114`) tiene exactamente tres salidas: delegar
en `findOrCreateAccountFromMetadata` (que ya exige iban + bank), devolver la única
cuenta ya existente del banco, o lanzar `MissingAccountDataError`. No hay ninguna
cuarta vía: el guardián de `architecture.test.ts:214` prohíbe `account.create` en
todo `src/modules/import/` (y `sourceFiles` excluye `.test.ts`, así que vigila
código de producción, que es lo correcto). Un IBAN de solo espacios cuenta como
«no hay IBAN» y está testeado. Verificado también que `Account.iban` es
`String @unique` no nullable en el esquema.

**Los guardianes se actualizaron, no se desactivaron.**
El árbol objetivo de `architecture.test.ts` pasa a listar `modules/ingestion/*` y
suma `modules/import/*`; el guardián de «sin prisma» sigue vigente con los nombres
nuevos; y se añaden **tres** guardianes (`sin directorio ingesta`, `sin nombre de
banco en el importador`, `sin account.create`), los dos últimos descubriendo los
módulos de banco leyendo el árbol en vez de con una lista a mano. `/api/ingesta/*`
devuelve 404 con el cuerpo de error estándar sobre la **app real**
(`ingestion.routes.test.ts`), no sobre un doble.

**El roadmap dice la verdad.** «Procesado» ya significa «guardado en la base de
datos»: `ingestion.service.ts` deja de mover (R15, con test) y el movimiento a
`procesados/` es consecuencia del `createMany` (R9, con test contra base real, y
R10 para el fallo). Con eso, E2 ✅ y E5 ✅ y los cabos sueltos 1 y 4 tachados son
correctos, no un adelanto. El cabo suelto nuevo (nº 10, `daySequence` numera solo
filas parseadas) está bien puesto y bien marcado como sin dueño.

**Privacidad del volcado.** `var/drive-read/` y `var/parsed/` siguen en
`.gitignore` y no hay nada de `var/` en el árbol de git. Los fixtures de los tests
son sintéticos. La única excepción es el IBAN del punto 1.

---

## Comprobado sin hallazgos

- **Trazabilidad R1-R20:** los 20 requirements tienen al menos un test concreto y
  todos existen con el nombre que declara el informe. Verificados uno a uno contra
  `import.service.test.ts`, `import.routes.test.ts`, `ingestion.*.test.ts`,
  `myinvestor.statement.parser.test.ts` y `architecture.test.ts`.
- **Los tests verifican salida concreta**, no ausencia de excepción: campo a campo
  del mapeo §9 leído de la base de datos real, cuerpos HTTP completos, ids
  comparados entre ejecuciones. Los dobles son solo de Drive (red), que es lo
  correcto; la base de datos es real.
- **C7 (SDD):** `specs/import/` con los cuatro archivos; `decisions.md` cabe en
  una página, con los bloques de `docs/decisions-template.md` y **🔴 con 0 puntos**;
  los 20 requirements superan el tope de ~15 y **la razón está dicha en voz alta**
  en `requirements.md` (cabecera) y en `decisions.md`; procedencia completa, cada
  `R<n>` clasificado (`humano` / `delegado` / `añadido`); las **31 tasks** de
  `tasks.md` marcadas `[x]`.
- **C3 (arquitectura y convenciones):** módulo `import/` con el trío
  `types`/`service`/`routes` y test junto al archivo (ADR-004); las rutas no
  nombran `prisma` (`importDb`); el importador no nombra ningún banco (registro
  inyectado desde `app.ts`, el único sitio que los nombra); errores por `AppError`
  con código estable y mensaje saneado (ADR-005); código, símbolos y comentarios
  en inglés; sin `console.log` ni TODOs sueltos; sin dependencias nuevas.
  ADR-015 escrito en `docs/architecture.md`.
- **C4 (verificación):** `./init.sh` verde ejecutado por mí — 316/316, `tsc` OK.
  Caminos de error cubiertos: descarga rota, parser que lanza, cuenta ausente,
  cuenta ambigua, fichero sin parser, extensión no soportada, Drive caído de nivel
  superior.
- **C6 (proyecto hermano):** `docs/api-contract.md` actualizado con
  `POST /api/import`, su informe, sus códigos y la nota de breaking change de
  `/api/ingesta/*`. Falta solo el eco en `current.md` (punto 3).
- **R12:** `computeAccountBalance` sigue leyendo el `balanceAfter` más reciente y
  no se ha tocado; sus tests de la F8 siguen en verde y el importador nunca
  inventa un saldo (`balanceAfter = null`, verificado en base de datos).

## Anotaciones no bloqueantes

1. **`tsconfig.tsbuildinfo` aparece sin trackear** y no está en `.gitignore`. Lo
   genera el `npx tsc --noEmit --incremental` que introdujo el cambio de `init.sh`
   (harness), no esta feature — pero conviene añadir la línea al `.gitignore` en
   cuanto alguien pase por ahí. Igual que `.harness-backup-20260812-155024/`, que
   tampoco es de esta feature.
2. **`ProcessedFile` / `processedCount` de la ingesta ya no significan
   «procesado»** sino «descargado». El implementer lo deja anotado y lo descarta
   por ser un segundo breaking change no autorizado por el spec: de acuerdo con la
   decisión, pero es un nombre que engaña y merece la feature de limpieza que él
   propone.
3. **`findIbanLine` corta en la primera línea etiquetada `iban`** aunque su valor
   esté vacío (devuelve `null` sin seguir mirando). Es coherente con «se escribe
   una vez» y está testeado; solo conviene saberlo si algún día alguien pega dos
   líneas `iban`.
4. **El bucle de importación es secuencial fichero a fichero.** Correcto para el
   volumen de hoy (un puñado de ficheros al mes) y es lo que hace posible el
   aislamiento del fallo; solo dejarlo dicho por si algún día crece.

---

**Sin resumen de cierre:** `progress/summaries/import.md` NO se escribe todavía
(CHECKPOINTS C8 solo aplica al aprobar). Se escribirá cuando los tres puntos de
arriba estén resueltos y la feature vuelva a revisión.

---

# Review — F12 `import` · segunda pasada

**Veredicto:** APROBADO (APPROVED)
**Fecha:** 2026-08-12 · **Revisor:** reviewer

Los tres bloqueantes de la primera pasada están resueltos. `./init.sh` verde
ejecutado otra vez por mi cuenta: **24 archivos, 316 tests**, `tsc` sin errores,
`pnpm lint` sin salida y `pnpm format:check` limpio. Resumen de cierre en
[`progress/summaries/import.md`](../summaries/import.md).

> Nota de lectura: el informe de la primera pasada (arriba) tiene el IBAN
> **sustituido en su propio texto**, porque también era un sitio donde el número
> real estaba versionado. Por eso hoy se lee citando el IBAN de ejemplo público;
> el que denunciaba era otro.

## Verificación de los tres bloqueantes

### 1. IBAN real versionado — **resuelto**

Barrido independiente del árbol entero (código, `docs/`, `specs/`, `progress/`,
`README.md`, todo salvo `node_modules/` y `.git/`):

- El IBAN real que se había colado (aquí **redactado** el 2026-08-12 por la F14:
  citarlo repetía la fuga que este mismo párrafo daba por cerrada) → **cero
  ocurrencias**. También cero buscando solo su cuerpo numérico, por si quedaba
  partido.
- `git log --all -S"<iban viejo>"` → **cero commits**, y `git grep` sobre el
  índice tampoco lo encuentra: nunca llegó a la historia, así que no hay nada
  que reescribir. Confirmado de forma independiente, no por el parte.
- El sustituto `ES9121000418450200051332` aparece en 16 sitios de 8 archivos
  (el parte decía 13/6; la diferencia son los tres `progress/*.md`, que no
  contaba). Es el IBAN de ejemplo público de la documentación española, con
  checksum válido y de nadie. Correcto.

**Coherencia del texto alrededor del número:** revisada una a una.

- `myinvestor.statement.parser.test.ts:253-261` — el comentario del `describe`
  dice explícitamente que es el IBAN público y por qué. Casa con el número.
- `docs/dar-de-alta-un-banco.md:135` — el bloque de ejemplo lleva debajo un aviso
  («el IBAN de este ejemplo es el público, no el tuyo»). Casa.
- `docs/api-contract.md:706`, `docs/roadmap.md:311`,
  `myinvestor.statement.parser.ts:126` y `progress/current.md:131` usan la forma
  elidida `iban;ES30…`. Son cuatro caracteres sin capacidad de identificar nada
  y no son un IBAN; los dejo pasar, pero ver la anotación 1 de abajo.

**Nada roto por el reemplazo:** los 5 tests del `describe` del IBAN pasan, y los
316 de la suite. El reemplazo es puramente textual, sin cambio de longitud ni de
forma, así que no toca ninguna aserción de parseo.

### 2. `README.md` — **resuelto**

Verificado sobre el diff: la tabla lista `/api/ingestion/pending`,
`/api/ingestion/process` («**No mueve nada.**»), `POST /api/import` y
`POST /api/parser/myinvestor` (que faltaba desde la F10); hay nota de breaking
change equivalente a la del contrato; y el árbol de módulos ya dice `ingestion/`
y añade `import/`, `myinvestor/` e `investments/`. Contrastado con las rutas
reales de `app.ts:47-54`: la tabla y el código coinciden endpoint a endpoint, sin
sobrantes ni faltantes.

### 3. `progress/current.md` — **resuelto**

La cabecera describe la sesión real («F12 `import` — implementada y en revisión»,
agentes y fecha correctos) y hay una sección **⚠️ Breaking changes de esta
sesión** con los dos puntos que exige `docs/related-projects.md`:
`/api/ingesta/*` → 404 y el cambio de significado de `process`, con puntero a
`api-contract.md` y la nota de que hoy no hay consumidor. Cumple C2.

## La regla nueva de `docs/conventions.md`

Está donde dice: **§Tests, líneas 102-110**, justo detrás de «comprobar el
resultado concreto, no solo "no lanza"». Revisado el archivo entero buscando
contradicciones:

- No choca con nada previo. La única otra mención de IBAN en el archivo es la del
  bloque «Parsers de banco» (líneas 165-169, también nueva), que habla de **dónde
  va el IBAN en el fichero**, no de qué valor se escribe en un fixture: son
  complementarias, no rivales.
- Es coherente con lo que ya se exigía en otro sitio: los guardianes de privacidad
  de `architecture.test.ts:350` y `:356` (gitignore de `var/drive-read/` y
  `var/parsed/`). La regla nueva cubre el hueco que esos guardianes no ven —el
  fixture escrito a mano dentro del test— y remite a `var/` para el dato real.
- El texto va con fecha y feature («reforzada el 2026-08-12, F12»), como el resto
  de las reglas datadas del archivo.

## Comprobado sin hallazgos

- **Nada de lo aprobado en la primera pasada se ha estropeado.** El diff de esta
  segunda vuelta no toca ni un archivo de `src/modules/import/`, ni
  `architecture.test.ts`, ni `ingestion.*`, ni el parser de MyInvestor salvo el
  literal del IBAN en su test. R1-R20 siguen con su test, las 31 tasks siguen
  `[x]`, `decisions.md` sigue con 🔴 a cero, y el conteo de tests es el mismo
  (316), lo que descarta que se haya perdido o silenciado ningún caso.
- **C1-C8 de `CHECKPOINTS.md`.** C4 verde por mi cuenta; C6 completo ahora que
  `current.md` tiene el eco del breaking change; C7 revalidado; C8 cubierto con
  `progress/summaries/import.md`, escrito en esta pasada.

## Anotaciones no bloqueantes (nuevas de esta pasada)

1. **`specs/import/requirements.md:255-256`** dice que el humano añadió la línea
   `iban;ES9121000418450200051332` a su CSV de Drive. Tras el reemplazo eso ya no
   es literalmente cierto: lo que añadió fue el suyo. La forma elidida `iban;ES30…`
   que usan `api-contract.md` y `roadmap.md` es más honesta y sirve igual. No
   bloquea (es una frase de procedencia, no un fixture ni una instrucción), pero
   si algún día se toca ese archivo, conviene alinearlo.
2. **Las cuatro apariciones de `ES30…`** son un prefijo de 4 caracteres, no un
   IBAN: no identifican nada y ni siquiera son un dato. Solo lo dejo dicho para
   que nadie se sorprenda al buscar «ES30» y encontrar coincidencias.
3. **Siguen en pie las cuatro anotaciones no bloqueantes de la primera pasada**
   (`tsconfig.tsbuildinfo` fuera de `.gitignore`, el nombre `ProcessedFile` que
   ya no significa «procesado», el corte de `findIbanLine` en la primera línea
   etiquetada y el bucle secuencial del importador). Ninguna es de cierre.
4. **Los IBAN de fixtures anteriores a esta feature** (`bankinter.fixture.ts`,
   `bankinter.parser.test.ts`, `myinvestor.fixture.ts` y el `curl` del `README`)
   los levanta el propio implementer y tiene razón en no tocarlos aquí. Los he
   mirado: son el de ejemplo de los manuales o claramente sintéticos. Nada que
   hacer, pero ahora que la regla está escrita, merece una pasada de alguien que
   pueda confirmarlo con certeza.

**Pendiente fuera de mi alcance:** marcar la feature `done` en
`feature_list.json` y commitear. Lo lleva el humano, como se pidió.
