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
- **Integración de API:** con `app.inject()` sobre `buildApp()`, contra la BD
  real de `docker-compose.yml`.
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
    conceptos de menos de tres palabras.
  - **La bitácora también se sanea.** Las reviews, los resúmenes y `history.md` son
    documentos versionados como cualquier otro: en la F14 se saneó todo el histórico
    del árbol de trabajo, dejando dicho en cada sitio que las cifras son inventadas
    para que nadie las «corrija» de vuelta. Lo que **no** se toca es el histórico de
    **git** (decisión del humano del 2026-08-12: repositorio privado, sin rewrite).

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
- **Un fichero de texto se descodifica con `decodeUtf8Strict`, nunca con
  `toString('utf8')`** (decidido 2026-08-15, F17; ver ADR-018). `toString('utf8')`
  no lanza jamás: un byte que no es UTF-8 se convierte en `�` en silencio y el dato
  queda corrupto **de forma irreversible** con el parseo aparentando ir perfecto. El
  guardián compartido es [`src/lib/utf8.ts`](../src/lib/utf8.ts) —encoding, no
  formato, por eso se comparte— y **rechaza el fichero entero** (`NotUtf8Error`,
  código `NOT_UTF8`) con el byte, la línea y la instrucción de volver a guardarlo en
  UTF-8. No se adivina la codificación ni se aprende cp1252.
- **El IBAN de la cuenta va en el fichero, una sola vez** (decidido 2026-08-12).
  Si el banco no lo exporta, lo escribe el humano como línea de preámbulo
  `iban;<IBAN>` **encima** de la cabecera; el parser la lee **solo si está
  etiquetada así** y **nunca** infiere un IBAN por su forma dentro de un concepto.
  Sin IBAN no se crea jamás una cuenta.

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
  cada banco es conocimiento suyo: Bankinter exporta de más reciente a más
  antiguo. Si lo calculara el importador, el importador sería bank-specific y
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
