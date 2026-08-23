# Convenciones de código

> Este documento es la referencia de convenciones del backend y lo posees tú
> (humano). Recoge las decisiones tomadas. Donde el código actual todavía
> diverge, se indica explícitamente.

## Idioma

- **Todo el proyecto en inglés**: nombres de variables, funciones, clases,
  tipos, archivos, comentarios y mensajes de commit. No se mezclan idiomas.
- **Incluye el dominio**: los conceptos de negocio se nombran en inglés
  (`Account`, `Movement`, `Category`, `description`, `amount`, `categoryId`,
  `bookingDate`), no en español.
- **Excepción — identificadores de infraestructura:** se mantienen en español
  por decisión (no los ve el frontend ni forman parte del dominio): el nombre de
  la BD `gastos`, el contenedor docker `gastos-postgres`, `package.name`
  (`gastos-backend`) y la carpeta del repo. El esquema de BD (tablas y columnas)
  **sí** va en inglés (`Account`, `Movement`, `Category`, `amount`, …).
- **Prosa de la documentación:** los `docs/` se redactan en español (idioma de
  trabajo); solo los identificadores de código, rutas y modelos citados en ellos
  van en inglés.
- **Todo se lee en UTF-8, siempre declarado.** Los `.md`, `.json` y `.sh` del
  repositorio son UTF-8 y el contenido en español lleva **tildes con
  normalidad**. La única condición es que **todo script o herramienta que lea un
  fichero del repo declare el encoding explícitamente**, sin confiar nunca en el
  del sistema: en Windows el de Python es `cp1252` y decodifica mal las tildes
  (revienta con cualquier carácter fuera de su tabla). Portada del frontend el
  2026-08-11, después de que `init.sh` fallara al validar `feature_list.json`.
  La causa se ataca en el lector (`open(..., encoding="utf-8")`,
  `init.sh:425`), no evitando caracteres en el contenido.
- **Nombres de archivos y carpetas SIEMPRE en inglés** (decidido 2026-07-11),
  incluidos los artefactos del harness y los `name` de las features en
  `feature_list.json`. La única excepción sigue siendo la prosa (contenido)
  de los documentos, que va en español. Estructura de `progress/` por tipo:
  - `progress/current.md` e `progress/history.md` — en la raíz.
  - `progress/implementations/<feature>.md` — informes del implementer.
  - `progress/reviews/<feature>.md` — veredictos del reviewer.
  - `progress/summaries/<feature>.md` — resúmenes de cierre (C8).
  - `progress/explorations/<topic>.md` — investigaciones previas.

## Estilo del lenguaje

- **TypeScript estricto, target ES2022, ESM.** *(observado en `tsconfig.json`)*
- **Linter + formatter: oxlint + Prettier.** El linter fue ESLint +
  typescript-eslint hasta 2026-08-13, cuando se cambió a `oxlint` para que la
  versión de TypeScript deje de depender del linter (ver `docs/stack.md`
  §Restricciones). Config en `.oxlintrc.json`, Prettier 3 sin cambios.
  Comandos: `pnpm run lint` / `lint:fix` / `format` / `format:check`. Prettier
  no formatea los `.md` del harness ni `feature_list.json` (ver
  `.prettierignore`). Reglas fijadas:
  - Comillas **simples**.
  - **Sin** punto y coma.
  - Indentación de **2 espacios**.
  - Longitud de línea: **100 columnas**.

## Imports

- Orden: **vendor** (`fastify`, `@prisma/*`) → **relativos** (`./`, `../`).
- Imports relativos **con extensión `.js`** (obligatorio por ESM/NodeNext).
- **Sin alias de paths** (`@/…`) mientras el árbol sea plano; introducirlos solo
  si la anidación crece.
- `import type { … }` para lo que sea solo tipo.

## Nombres

| Tipo                        | Convención                                                    | Ejemplo                              |
| --------------------------- | ------------------------------------------------------------ | ------------------------------------ |
| Archivos                    | `kebab-case` / nombre del recurso                            | `accounts.routes.ts`, `error-handler.ts` |
| Clases / tipos / interfaces | `PascalCase`, **sin** prefijo `I`                            | `Account`, `CreateAccountBody`       |
| Funciones / variables       | `camelCase`                                                  | `buildApp`, `createPrismaClient`     |
| Constantes                  | `camelCase` (o `UPPER_SNAKE` si es constante global de módulo) | `createAccountSchema`              |
| Booleanos                   | prefijo `is` / `has`                                        | `isLoading`, `hasError`              |

## Estructura de archivo

```typescript
// 1. Vendor imports
import type { FastifyInstance } from 'fastify'

// 2. Relative imports (with .js)
import { createPrismaClient } from '../lib/prisma.js'

// 3. Local types / schemas
interface CreateAccountBody { /* ... */ }
const createAccountSchema = { /* ... */ } as const

// 4. Main export (async routes plugin)
export default async function accountRoutes(fastify: FastifyInstance) {
  // handlers...
}
```

## Tests

- **Ubicación: junto al archivo** (`accounts.test.ts` al lado de
  `accounts.routes.ts`).
- **Runner:** **Vitest** (configurado 2026-07-10; ver `docs/stack.md`
  §Testing y `docs/verification.md`).
- **Integración de API:** con `app.inject()` sobre `buildApp()`, contra una BD
  PostgreSQL **real** del `docker-compose.yml` — pero **nunca la del humano**: ver
  §Tests con base de datos, justo debajo.
- **Nombres de test:** descriptivos, en inglés.
- **Estructura:** AAA (Arrange-Act-Assert); comprobar el **resultado concreto**,
  no solo "no lanza".
- **Ningún dato real en un fixture** (regla reforzada el 2026-08-12, F12). Los
  fixtures se construyen en código y **todo** en ellos es inventado: importes,
  conceptos, números de contrato e **IBAN**. La regla incluye los datos del propio
  dueño del proyecto, incluso los que él mismo pegue en una conversación: un
  archivo de test se versiona, se comparte y lo leen herramientas, y a un fixture
  solo se le pide estar **bien formado**, nunca ser cierto. Para un IBAN se usa el
  de ejemplo público de la documentación española (`ES91 2100 0418 4502 0005 1332`)
  o uno claramente sintético. Los datos reales viven en `var/drive-read/`, que está
  gitignoreada.

- **La regla anterior ya no depende de que alguien se acuerde: la hace cumplir
  [`src/no-real-data.test.ts`](../src/no-real-data.test.ts)** (F14, 2026-08-12; ver
  ADR-017). Alcance: **todo archivo versionado**, no solo los fixtures — `docs/`,
  `specs/` y `progress/` incluidos, y también el archivo nuevo aún sin commitear.
  Dos capas: **por forma** (un IBAN español con checksum válido fuera de la lista
  blanca, siempre activa) y **por comparación** contra las capturas de `var/`, que
  **se salta con un mensaje** cuando no están (nunca exige tenerlas: versionar los
  datos para protegerlos sería el mismo problema con otro nombre).
  - **Si salta con razón:** inventa otro valor. Que el ejemplo siga cuadrando (la
    aritmética que ilustraba) y que ninguna aserción se vuelva trivial.
  - **Si salta sin razón** (un número inventado que colisiona): añade
    `no-real-data-ok` **en esa línea**, con el motivo al lado. Para un caso más
    ancho, la lista de rutas o la de IBAN del propio guardián, siempre **con su
    porqué**. No se desarma entero.
  - **Lo que NO caza** (está en el ADR-017, y conviene saberlo antes de fiarse del
    verde): importes redondos o cortos, valores **derivados** de los suyos, fechas, y
    conceptos de menos de tres palabras. Y **qué mira**, desde la F23 (2026-08-19):
    **todo fichero de `var/` cuyos bytes se lean como texto** —el `.xls` de Openbank es
    HTML y entra; se decide por contenido, **nunca por extensión**, que es justo lo que
    dejó el hueco por el que pasó la fuga de la F19—. De un fichero de marcado compara
    **lo que dice, no sus etiquetas**. Los dos binarios de verdad (el `.xlsx` de
    Bankinter y el `.pdf` de Trade Republic) quedan fuera para no meter ruido de bytes:
    el ZIP se vigila por su volcado de `var/parsed/`, y el PDF **no se vigila** y el
    guardián **lo dice por su nombre en la salida de `./init.sh`**, en toda ejecución
    (lista `unwatchedBanks`). Ese aviso se escribe al **descriptor 2**, no por
    `console`: vitest **intercepta la consola** y con el reporter por defecto —el que
    usa `./init.sh`— un `console.warn` **no se imprime**. Se intentó así en la primera
    pasada de la F23 y el resultado fue un verde silencioso; hay test que lo impide
    ahora.
  - **Si aparece un banco que no puede leer**, la suite se pone **roja** hasta que se
    decida qué hacer con él: nunca pasa en verde sobre lo que no ha mirado. Una carpeta
    de banco **vacía** no es lo mismo y no dice nada.
  - **Lo que hay en `var/parsed/` es texto NUESTRO además de datos suyos** (F24,
    2026-08-20). El volcado lo escribe el parser: si un archivo se rechaza, guarda el
    **motivo**, que es una frase nuestra y que los `docs/` publican tal cual. El
    guardián ya no la confunde con «una frase de su extracto»: de un `reason` solo se da
    por nuestra la frase que **no está dentro de unas comillas** (todo valor suyo va
    entrecomillado, y lo entrecomillado se compara sin preguntar) **y** que además esté
    **literal en el código de producción** (`src/**.ts`, sin tests ni fixtures). Las dos
    condiciones, nunca una. El motivo **no se trocea** para preguntarlo —va entero—:
    trocearlo hacía desaparecer un valor con **apóstrofo dentro** (`COMPRA D'ALIMENTS…`),
    que es un silencio, y lo cazó la review de la F24. **La capa de
    importes no cambia**: sigue mirando el texto crudo, motivos incluidos, así que los
    cinco importes del mensaje del descuadre se vigilan igual. Si escribes un parser
    nuevo, **entrecomilla el valor que devuelvas en un motivo**: no es cosmética, es la
    mitad de esta regla. Detalle y porqué en el ADR-017.
  - **Sus mensajes no llevan tu dato**: dicen `archivo:línea` y el tipo de coincidencia,
    nunca el valor. Si al leer un fallo te falta saber qué cifra es, búscala en la línea
    que te señala; el guardián no la transcribe a propósito.
  - **La bitácora también se sanea.** Las reviews, los resúmenes y `history.md` son
    documentos versionados como cualquier otro: en la F14 se saneó todo el histórico
    del árbol de trabajo, dejando dicho en cada sitio que las cifras son inventadas
    para que nadie las «corrija» de vuelta. Lo que **no** se toca es el histórico de
    **git** (decisión del humano del 2026-08-12: repositorio privado, sin rewrite).

### Tests con base de datos

> Cómo se escribe, a partir del 2026-08-20 (F27, ADR-027), un test que necesita
> base de datos. Antes de esta fecha la suite escribía en la base del humano y le
> dejaba filas dentro; ahora no puede.

- **Sigues probando contra un PostgreSQL de verdad.** No se sustituye por mocks ni
  por sqlite: lo único que cambió es **qué** base.
- **No elijas la base ni la nombres.** `vitest.setup.ts` apunta `DATABASE_URL` a la
  base desechable de **ese worker** (`gastos_test_<poolId>`) antes de que tu archivo
  se importe. Si obtienes el cliente como siempre —`buildApp()` y `app.prisma`—
  estás en la base correcta sin hacer nada.
- **No escribas una cadena de conexión en un test.** Si necesitas una, sale de
  `process.env.DATABASE_URL`, que ya es la desechable. Todo lo que escribe pasa por
  `assertTestDatabase` ([`src/lib/test-db.ts`](../src/lib/test-db.ts)) y **revienta**
  si la base no empieza por `gastos_test_`.
- **Limpia lo que creas, igual que antes.** La base desechable es una red, no un
  permiso: un `afterEach`/`afterAll` que borre tus filas. Si tu archivo termina y
  queda **una sola fila**, la suite pone **ese archivo en rojo** diciendo tabla y
  cantidad, y vacía la base para no arrastrar el problema al siguiente. No depende de
  que nadie se acuerde: el `afterAll` está en el setup global, no en tu archivo.
- **Sigue usando valores únicos** (IBAN sintético con `syntheticIban()`, nombres con
  sufijo aleatorio). Dentro de un worker los archivos comparten base, uno detrás de
  otro, y las claves naturales siguen siendo claves naturales.
- **Un test no abre nunca la base del humano.** El `globalSetup` le hace una foto de
  **solo lectura** antes y después de la suite; si cambia algo —hasta una secuencia
  que avanzó por una fila insertada y borrada— la pasada termina en **rojo**.
- **No pases `--maxWorkers` a mano.** El número lo fija `vitest.config.ts` para que
  haya exactamente una base preparada por worker; si lo subes, la suite falla con ese
  mensaje en vez de compartir base en silencio.
- **Si añades una migración**, no tienes que hacer nada: la plantilla
  `gastos_test_template` se vuelve a migrar sola en la siguiente pasada (~1,7 s) y
  las bases de worker se reclonan de ella.

## Manejo de errores

> Implementado por la feature #2 "foundations" (2026-07-11): jerarquía en
> `src/errors/app-error.ts`, handler central en `src/plugins/error-handler.ts`
> (ver ADR-005 en `docs/architecture.md`).

- Errores de dominio extienden una base `AppError` con un `code` string y un
  `statusCode`.
- La capa HTTP **no** arma respuestas de error a mano: un `setErrorHandler`
  central traduce `AppError` → `{ statusCode, code, message }`.
- Nunca `throw` de strings sueltos.
- Se loguea con `fastify.log` / `request.log` (nunca `console.log`); se registra
  el error interno pero **no** se filtran detalles sensibles al cliente.

```typescript
class AppError extends Error {
  constructor(message: string, readonly code: string, readonly statusCode = 400) {
    super(message)
  }
}
class NotFoundError extends AppError {
  constructor(message = 'Resource not found') { super(message, 'NOT_FOUND', 404) }
}
```

## Estructura de carpetas (recordatorio)

> Coherente con `docs/architecture.md`. Si hay conflicto, manda architecture.md.

## Parsers de banco

> **Norma global** (decidida 2026-08-10). Aplica a todo fichero que entre por
> Drive, tanto si lo genera el banco como si lo escribe el humano.

- **Un parser por banco, sin excepciones.** Cada banco tiene su módulo
  `src/modules/<banco>/`, donde `<banco>` es el mismo nombre normalizado que su
  carpeta de Drive (`normalizeBankName`, `src/lib/drive-structure.ts:52`). No
  existen parsers "genéricos" compartidos entre bancos.
- **Un banco puede tener varias entradas.** Un mismo módulo lee todos los
  formatos que ese banco aporta —por ejemplo un `.xlsx` de movimientos de la
  cuenta corriente y varios `.json` de productos de inversión—. Lo que no se
  comparte es el parser **entre** bancos; **dentro** de un banco, sí.
- **Por qué:** el formato de cada banco evoluciona por su cuenta y sin avisar.
  Un parser compartido convierte el cambio de un banco en una regresión para
  todos los demás; uno por banco deja el daño contenido en su módulo y en su
  suite, y permite borrar un banco entero sin tocar el resto.
- **Consecuencia al dar de alta un banco:** además de crear su carpeta en Drive
  (`docs/dar-de-alta-un-banco.md`), hace falta su propio módulo de parser y
  **una línea en el registro de `src/app.ts`** que se le inyecta al importador
  (ADR-015). Ningún banco hereda el de otro.
- **El importador no conoce ningún banco.** `src/app.ts` es el **único** archivo de
  `src/` que puede nombrar uno; un guardián de `architecture.test.ts` lo comprueba
  también sobre `src/modules/import/`.
- **Un banco puede entrar solo por archivo escrito a mano cuando su formato no
  compensa** (añadido 2026-08-19, F20; ver ADR-024). El caso es **Trade Republic**: su
  extracto es un `.pdf` cuya tabla no sobrevive a la extracción de texto y la cuenta
  tiene uno o dos apuntes al mes, así que **no se escribe parser de lo que emite el
  banco**: el humano rellena un `.json` mensual
  ([`docs/trade-republic-product-files.md`](./trade-republic-product-files.md)) y el
  `.pdf` que sigue bajando se lista como `ignored`, nunca como fallo. Sigue siendo un
  módulo de banco con todas las de la ley (`src/modules/trade-republic/`, su ruta y sus
  guardianes); lo que no tiene es parser del fichero del banco. Es **provisional y está
  escrito** dónde se revierte: el día que esa cuenta tenga movimientos de verdad. Y como
  el archivo lo escribe una persona, **lleva un cuadre aritmético que lo rechaza si los
  importes no encajan** — la red que en un extracto pone el banco, aquí hay que ponerla.
- **El lector del formato es del banco, incluso cuando el algoritmo es genérico**
  (precisado 2026-08-17, F18). N26 exporta un CSV **de comas con campos
  entrecomillados**, así que necesita un lector de CSV de verdad; ese lector vive
  en [`src/modules/n26/n26.csv.ts`](../src/modules/n26/n26.csv.ts) y **no** en
  `lib/`. La regla no es «no compartir lo que sea difícil», es **no compartir el
  código que lee un formato**: el día que N26 cambie las comillas, el cambio se
  queda en su módulo. Lo que sí se comparte es lo que no es formato: la **forma de
  la salida** (`lib/parsed-statement.ts`) y la **codificación** (`lib/utf8.ts`).
  El banco siguiente que traiga CSV entrecomillado copia el patrón, no el módulo.
  **Lo mismo con el HTML** (2026-08-19, F19): el fichero de Openbank se llama `.xls`
  y por dentro es una página HTML, así que su lector de tablas vive en
  [`src/modules/openbank/openbank.html.ts`](../src/modules/openbank/openbank.html.ts)
  y **sin añadir ninguna dependencia** (decisión del humano: `cheerio` descartado
  para trocear una tabla plana generada por máquina). El día que ese HTML se
  complique, el cambio se queda dentro de ese archivo.
- **Cada parser declara la codificación de ORIGEN de su banco, y la descodifica
  estricta; `toString('utf8')` no se usa jamás** (ampliado 2026-08-19, F19; ver
  ADR-022). La regla de la F17 no se rompe, se acota por **quién escribe el
  fichero**: lo que escribe **el humano** va en UTF-8 (`decodeUtf8Strict`, sin
  cambiar una línea en MyInvestor ni en N26) y lo que **emite el banco** se lee con
  la codificación de ese banco. Hoy hay dos casos y eso es lo normal, no un
  descuido: `decodeUtf8Strict` ([`src/lib/utf8.ts`](../src/lib/utf8.ts)) y
  `decodeCp1252Strict` ([`src/lib/cp1252.ts`](../src/lib/cp1252.ts)), que es lo que
  emite Openbank. Los dos viven en `lib/` por la misma razón —la codificación no es
  un formato— y comparten el guardián del carácter de sustitución
  (`assertNoReplacementCharacter`), que se **extrajo**, no se copió; el motivo y el
  código los pone quien llama. **Siguen prohibidas las tres cosas de siempre:**
  adivinar la codificación, encadenar *fallbacks* y reparar un fichero.
  - **Un descodificador permisivo obliga a una guardia extra:** cp1252 mapea los 256
    bytes, así que **no falla nunca** y un fichero que llegara en UTF-8 se leería
    entero como mojibake sin dar un solo error. Por eso el parser de Openbank exige
    que el fichero **declare** su codificación (`<meta>`), y si declara otra lo
    **rechaza entero** (`UnexpectedEncodingError`, código `UNEXPECTED_ENCODING`,
    422). El criterio es lo que el fichero **afirma**, no una corazonada sobre sus
    bytes.
  - **Y lo que el fichero afirma tiene que cuadrar con lo que sus bytes pueden ser**
    (ampliado 2026-08-19, F22; ver ADR-023). Un fichero que declara cp1252/iso-8859-1
    y cuyos bytes son **UTF-8 válido con secuencias multibyte** no lo escribió el
    banco: un cp1252 con acentos **no es** UTF-8 válido, porque cada letra acentuada
    es un byte suelto de `0xC0-0xFF`. Eso es un **hecho comprobable**, no una
    detección de codificación, así que las tres prohibiciones siguen en pie. Lo
    detecta `detectResaveAsUtf8` ([`src/lib/cp1252.ts`](../src/lib/cp1252.ts)), que
    es **opt-in**: la llama el parser cuyo banco emite una codificación de un solo
    byte, y por eso los otros tres bancos no cambian (hay guardián en
    `architecture.test.ts`). Un fichero **puramente ASCII** no la dispara a propósito:
    las dos lecturas son los mismos bytes y no hay daño posible. El motivo distingue
    dos remedios —guardar con **Western (Windows-1252)** si los acentos siguen ahí,
    **volver a descargar** el fichero si ya trae `U+FFFD`— porque el que trae `U+FFFD`
    **no tiene arreglo**: eso es lo que le pasó al fichero real el 2026-08-19 al
    abrirlo con Visual Studio Code y darle a guardar.
- **La norma anterior, tal como se escribió en su día** (decidido 2026-08-15, F17;
  ver ADR-018), y que sigue vigente para el fichero que edita el humano: `toString('utf8')`
  no lanza jamás: un byte que no es UTF-8 se convierte en `�` en silencio y el dato
  queda corrupto **de forma irreversible** con el parseo aparentando ir perfecto. El
  guardián compartido es [`src/lib/utf8.ts`](../src/lib/utf8.ts) —encoding, no
  formato, por eso se comparte— y **rechaza el fichero entero** (`NotUtf8Error`,
  código `NOT_UTF8`) con el byte, la línea y la instrucción de volver a guardarlo en
  UTF-8. Nunca se **adivina** una codificación: la de cada banco se **declara** en
  su parser (ADR-022), que no es lo mismo.
- **Los marcadores `<…>` de una plantilla escrita a mano se comprueban en cada banco,
  copiando el patrón y no el módulo** (decidido 2026-08-23, F30). Los dos bancos que
  entran por `.json` escrito a mano —Trade Republic (F20/F28) y MyInvestor (F30)— tienen
  **cada uno** su `isMarker` + `isHalfErasedMarker`, en su parser, y **no hay un
  `lib/template-marker.ts`**. La condición que la F28 dejó escrita para reabrirlo (dos
  usuarios reales y la F29 cerrada) se cumplió y la decisión **se volvió a tomar**: se
  mantiene separada porque el marcador es la convención de una **plantilla**, que cada
  documento de banco publica por su cuenta, y sobre todo porque **la política diverge** —
  Trade Republic lo comprueba en **todos** los campos; MyInvestor solo en los dos de
  **texto libre** (`name` y `currency`), medidos uno a uno, porque los otros once ya se
  rechazan por su propia validación—. Lo compartible sería un predicado de dos líneas;
  lo que lleva el riesgo (a qué campos se aplica) seguiría siendo de cada banco. Es el
  mismo criterio que «el banco siguiente que traiga CSV entrecomillado copia el patrón,
  no el módulo». **Quien dé de alta un tercer banco con plantilla a mano copia el patrón
  otra vez**, y mide qué campos suyos quedan expuestos antes de decidir dónde ponerlo.
- **El IBAN de la cuenta va en el fichero, una sola vez** (decidido 2026-08-12).
  Si el banco no lo exporta, lo escribe el humano como línea de preámbulo
  `iban;<IBAN>` **encima** de la cabecera; el parser la lee **solo si está
  etiquetada así** y **nunca** infiere un IBAN por su forma dentro de un concepto.
  Sin IBAN no se crea jamás una cuenta.
- **El IBAN se normaliza y se valida en un solo sitio, y ningún banco escribe esa
  regla** (decidido 2026-08-18, F21; ver ADR-021). El único normalizador+validador es
  [`src/lib/iban.ts`](../src/lib/iban.ts) —un IBAN no es el formato de un banco, es el
  identificador ISO de una cuenta, por eso se comparte igual que `lib/utf8.ts`— y lo
  usan los **tres** parsers (`readPreambleIban` sobre su línea etiquetada) y el alta de
  cuenta de `POST /api/accounts`. Normaliza quitando **todos** los espacios (también
  los interiores, que son los que escribe un humano al agrupar de cuatro en cuatro) y
  pasando a mayúsculas; valida forma, longitud del país y **dígito de control mod-97**.
  Un IBAN que no pasa **rechaza el fichero entero** (`InvalidIbanError`, código
  `INVALID_IBAN`, 422) con el nº de línea y el problema por su nombre; no es una fila
  de `unparsedRows`, porque el IBAN dice a qué cuenta van **todos** los movimientos del
  fichero. Sin esto, el mismo IBAN escrito de dos formas creaba **dos cuentas**, en
  silencio.
- **Lo que el humano escribe a mano en un fichero de banco va en una LÍNEA DE
  PREÁMBULO ETIQUETADA, encima de la cabecera** (ampliado el 2026-08-16, F16, con el
  saldo de la cuenta: `saldo;<importe>`). Un dato escrito a mano se reconoce **por su
  etiqueta y por estar encima de la cabecera**, nunca por su forma ni por su posición
  en la tabla, y la etiqueta se compara sin acentos ni mayúsculas porque quien la
  escribe es una persona. Un banco que necesite un tercer dato así **reutiliza
  `findPreambleLine`** (ADR-019) en vez de escribir otro buscador casi igual.
  Cada banco tiene el suyo: el mecanismo se copia, el código no.
  **En un fichero que no es texto plano, la línea de preámbulo toma la forma
  equivalente de ese formato** (2026-08-19, F19): en el HTML de Openbank es un
  **comentario HTML en la primera línea**, `<!-- iban;<IBAN> -->`, leído solo si
  está **antes de `<table>`**. Sigue siendo lo mismo: etiquetada, con `;`, encima
  de los datos del banco y nunca inferida por la forma de nada de la tabla.
- **Esas líneas van con `;` sea cual sea el separador del fichero** (decidido
  2026-08-17 al llegar N26, cuyo CSV separa por comas). Son **líneas nuestras, no
  del banco**: una sola forma de escribirlas en todo el proyecto, ya documentada
  en `docs/dar-de-alta-un-banco.md`, y se distinguen a simple vista de las del
  banco. La alternativa —usar el separador de cada fichero— daría dos formas del
  mismo dato según el banco. Y como las escribe **una persona**, su importe se lee
  con manga ancha (coma o punto decimal); la columna de importes **del banco** se
  lee con la regla estricta de ese banco.
- **El separador de esas líneas es `;` (o la coma del propio fichero): `:` NO se
  acepta** (ratificado por el humano el 2026-08-18, F21). `iban: <IBAN>` no se lee y el
  fichero acaba en `MISSING_ACCOUNT_DATA`, que es un fallo ruidoso y con un motivo
  accionable. Tolerarlo se descartó a propósito: una sola forma documentada vale más
  que dos formas admitidas.

### Lo que NO es propio de cada banco: la forma de la salida

> Precisión de la norma, decidida el 2026-08-11 al aparecer el segundo banco.

- **Cada banco tiene su parser; todos devuelven el mismo contrato.** El tipo de un
  movimiento parseado vive en **un único módulo compartido**, fuera de cualquier
  `src/modules/<banco>/`. Un banco nuevo **se adapta al contrato**; no declara sus
  propios `ParsedMovement`, `UnparsedRow` ni `ParsedMovementType`.
- **Dónde está el contrato (implementado en la F11, 2026-08-11):**
  [`src/lib/parsed-statement.ts`](../src/lib/parsed-statement.ts) — declara
  [`ParsedMovementType`](../src/lib/parsed-statement.ts#L19),
  [`ParsedMovement`](../src/lib/parsed-statement.ts#L22),
  [`UnparsedRow`](../src/lib/parsed-statement.ts#L60),
  [`ParsedStatement<Bank>`](../src/lib/parsed-statement.ts#L68) y el helper
  [`assignDaySequence`](../src/lib/parsed-statement.ts#L96). Un guardián de
  [`architecture.test.ts`](../src/architecture.test.ts) rechaza cualquier segunda
  declaración de esos tipos en `src/`. El módulo de un banco solo declara **lo
  suyo**: p. ej.
  [`bankinter.types.ts`](../src/modules/bankinter/bankinter.types.ts#L14) se queda
  con `BankinterParseResult = ParsedStatement<'bankinter'>` y los resúmenes de su
  ejecución local.
- **Por qué no contradice lo anterior:** la norma prohíbe compartir el *código que
  lee el formato*, porque el formato cambia sin avisar y un parser compartido
  convierte el cambio de un banco en una regresión para todos. El *tipo de salida*
  es lo contrario: la interfaz estable contra la que cada banco se adapta solo, y
  lo que permite que el importador no tenga que conocer ~7 formas distintas.
- **El contrato se deriva del modelo de datos, pero no es el modelo.** No lleva
  claves foráneas, ni `origin`/`status`/`transferId`, ni sabe si un movimiento ya
  existe; y sí lleva cosas que la BD no tiene (`unparsedRows`). Lo que solo trae
  algún banco —el saldo de la línea, el IBAN— es **opcional**: MyInvestor no los
  aporta y eso no se disimula inventando un cero.
- **Cada parser emite `daySequence` ya normalizado**: `1` es **el movimiento más
  antiguo de ese `bookingDate`**, y el número crece hacia el más reciente del
  mismo día (no es el orden de aparición en el fichero). El sentido en que exporta
  cada banco es conocimiento suyo: Bankinter y MyInvestor exportan de más reciente
  a más antiguo, y N26 al revés (de más antiguo a más reciente). Si lo calculara el importador, el importador sería bank-specific y
  dejaría de poder compartirse. La numeración la hace el helper compartido
  [`assignDaySequence`](../src/lib/parsed-statement.ts#L96); lo único que pone el
  banco es el argumento que dice cómo exporta
  ([`bankinter.parser.ts:10`](../src/modules/bankinter/bankinter.parser.ts#L10)).
  **Solo se numeran los movimientos parseados:** una fila que acabó en
  `unparsedRows` no consume número (importa para la F12, ver ADR-013).
- **La decisión ingreso/gasto/neutral se toma en un solo sitio:**
  [`deriveMovementTypeFromAmount`](../src/modules/movements/movements.service.ts#L33).
  Ningún parser la reimplementa: el de Bankinter lo **importa**
  ([`bankinter.parser.ts:191`](../src/modules/bankinter/bankinter.parser.ts#L191))
  y un guardián de `architecture.test.ts` comprueba que todo `*.parser.ts` lo usa
  y que ninguno vuelve a escribir la regla del signo.

## Comentarios

- **Los mínimos y lo más cortos posible.** Solo se comenta cuando es realmente
  necesario; si el código se explica solo, no se comenta.
- No se comenta el *qué* (lo dice el código); se comenta el *por qué* cuando una
  decisión no es obvia.
- En inglés, como el resto del código.
- `TODO:` con formato `// TODO: <acción concreta>`. No dejar `TODO` sin dueño en
  features marcadas `done`.

## Estilos / UI

N/A — este proyecto es backend, no hay capa de UI.
