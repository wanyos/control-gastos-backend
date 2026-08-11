# Tasks — Feature 10: myinvestor-statement

> Checklist ejecutable de `design.md`. El `implementer` marca `[x]` al completar cada
> task; el `reviewer` rechaza si queda alguna `[ ]` sin justificación documentada.
> Cada task referencia los `R<n>` de `requirements.md` que cubre.

## ⏸️ Antes de empezar — lee esto entero

- ⏸️ **NO implementes nada hasta que el humano apruebe esta spec.** ✅ No tiene ningún
  punto 🔴 pendiente (se fueron todos a la **F13 `myinvestor-products`**), así que la
  puerta es corta y **no hay que esperar a la F13 para nada**.
- 🔴 **No adelantes NADA de la F13.** Ni el parser de productos, ni `parseIsoDate`, ni la
  rama `.json` del servicio, ni `docs/myinvestor-product-files.md`. Los `.json` van a
  `ignored[]` y punto: su formato **está sin aprobar** por el humano.
- 🔴 **`pnpm`, nunca `npm`.** Mezclarlos genera un `node_modules` distinto del que valida
  `init.sh` (`docs/stack.md` §Build).
- 🔴 **Cero dependencias nuevas** (`design.md` §4). Nada de `pnpm add`. Y **prohibido
  importar el parser de CSV que llega como dependencia transitiva** de otra librería.
- 🔴 **Los fixtures son SINTÉTICOS.** Jamás copies cifras, conceptos, nombres de producto
  ni archivos reales de `var/drive-read/`. Esa carpeta está gitignoreada por privacidad y
  ningún dato financiero real se versiona.
- 🔴 **El volcado local va gitignoreado** y ya lo está: `var/drive-read/` y `var/parsed/`
  están en `.gitignore` desde las features 5 y 6, con sus guardianes en
  `src/architecture.test.ts`. **No hace falta tocar `.gitignore`.**
- 🔴 **No MODIFIQUES** `prisma/`, los módulos del flujo (`accounts`, `categories`,
  `movements`), `src/lib/`, `src/errors/`, el otro módulo de parser del repo, ni
  `specs/investments-data-model/`. ⚠️ **Importarlos sí, y es obligatorio:** el parser
  consume [`src/lib/parsed-statement.ts`](../../src/lib/parsed-statement.ts) y
  [`deriveMovementTypeFromAmount`](../../src/modules/movements/movements.service.ts#L33)
  (F11, ADR-013). Lo prohibido es **cambiarlos** o **duplicarlos**.
- 🔴 **La forma de un movimiento parseado NO se declara aquí.** Es el contrato de la
  F11. Si escribes `interface MyinvestorMovement`, el guardián te tumba la suite
  (T1, R70).
- ⚠️ Convenciones: comillas simples, sin `;`, 2 espacios, 100 columnas, imports relativos
  con `.js`, `import type` para tipos, dominio en inglés.

---

## Fase 1 — Modelo y normalizadores

- [x] T1 — Crear `src/modules/myinvestor/myinvestor.types.ts` con **solo lo propio del
      banco**: `MyinvestorStatementResult = ParsedStatement<'myinvestor'>` importado de
      [`src/lib/parsed-statement.ts`](../../src/lib/parsed-statement.ts) (🔴 **NO**
      declares `MyinvestorMovement`, `ParsedMovementType`, `UnparsedRow` ni
      `providesBalance`: la F11 los movió al contrato y hay un guardián que lo rechaza),
      más `FailedFile`, `IgnoredFile`, `ParsedStatementSummary` y
      `MyinvestorParseRunResult`, literal como en `design.md`
      §13. **La F13 añadirá después a este mismo archivo los tipos de producto**; no los
      adelantes. Cubre: R8, R17, R18, R20, R70.

- [x] T2 — Crear `src/modules/myinvestor/myinvestor.format.ts` con `parseAmountText`
      (regla única de `design.md` §3.3: coma → decimal español; sin coma con puntos cada
      tres dígitos → miles; en otro caso punto decimal; tolera `€`, `%` y espacios),
      y `parseStatementDate` (`dd/mm/aaaa` → ISO, validando el calendario). **`parseIsoDate`
      NO se escribe aquí:** lo añadirá la F13 a este mismo archivo, que es su única
      consumidora. Cubre: R9, R10.

- [x] T3 — Crear `src/modules/myinvestor/myinvestor.format.test.ts` con los casos de
      `design.md` §3.3: `-50`, `-7,99`, `-5000`, `-25.000`, `25.149,95`,
      `"1.312,72 €"`, `"1312.72"`, `"-3,47 %"`, `"1.312.000"`, `"1.5"`; fechas
      `01/08/2026` → `2026-08-01` y `31/02/2026` → `null`. Cubre: R9, R10.

## Fase 2 — Entrada 1: el extracto de la cuenta corriente

- [x] T4 — Crear `src/modules/myinvestor/myinvestor.fixture.ts` con el generador
      **sintético** del CSV: cabecera de cinco columnas, líneas con las cinco formas
      numéricas mezcladas, **varias líneas del mismo `bookingDate` en orden de más
      reciente a más antiguo** (para R68/R69), dos líneas idénticas, una línea ilegible,
      una línea en blanco,
      variantes con BOM, con la cabecera desplazada y con las columnas en otro orden, y
      un helper para escribir archivos en un tempdir. **Datos inventados.** Cubre: R59.

- [x] T5 — Crear `src/modules/myinvestor/myinvestor.statement.parser.ts`
      (`parseMyinvestorStatement(content: Buffer)`): decodifica UTF-8 y quita el BOM,
      localiza la cabecera por nombre de columna (insensible a mayúsculas/acentos, con
      prefijo ASCII para la columna acentuada), mapea las cinco columnas, construye un
      `ParsedMovementDraft` por línea en orden de archivo con `balance: null`,
      `type` **llamando a** `deriveMovementTypeFromAmount` (nunca reimplementando el
      ternario) y `description` íntegra; sin deduplicar; sin acumular ningún saldo;
      devuelve `accountIban: null` y **ninguna clave más que las cuatro del contrato**
      (sin `providesBalance`); las líneas ilegibles van a `unparsedRows` y las vacías se
      ignoran; **al final** numera con `assignDaySequence(drafts, statementOrder)` con
      `const statementOrder = 'newest-first'` (§3.6); lanza `ValidationError` si no hay
      cabecera reconocible. Cubre: R5, R6, R7, R8, R9, R10, R11, R12, R13, R14, R15,
      R16, R17, R18, R19, R20, R68, R69.

- [x] T6 — Crear `src/modules/myinvestor/myinvestor.statement.parser.test.ts` con un
      bloque por criterio: orden y recuento, BOM y acentos, cabecera desplazada/reordenada
      y con acento corrompido, las cinco formas numéricas, fecha imposible →
      `unparsedRows`, importe 0 → `neutral`, concepto con número de contrato intacto, dos
      líneas idénticas → dos movimientos, línea en blanco → sin ruido, `balance`
      **presente y nulo** en todos, el resultado con **exactamente** las cuatro claves
      del contrato (sin `providesBalance`), `accountIban === null` con un fixture que
      contiene cadenas con forma de IBAN, **tres líneas del mismo día → `daySequence`
      3/2/1 en orden de archivo**, **una línea ilegible entre ellas no consume número**,
      y CSV sin cabecera → `ValidationError`. Cubre: R5, R6, R7, R8, R9, R10, R11, R12,
      R13, R14, R15, R16, R17, R18, R19, R20, R68, R69.

> **Fase 3 (los archivos JSON de producto) se fue entera a la F13
> [`../myinvestor-products/tasks.md`](../myinvestor-products/tasks.md)**, con sus T7 y T8
> intactas. Aquí no se escribe ni una línea de eso.

## Fase 4 — Servicio, ruta y volcado

- [x] T9 — Crear `src/modules/myinvestor/myinvestor.service.ts`
      (`parseLocalMyinvestorCopies(sourceBaseDir, dumpBaseDir)`): recorre
      `<source>/myinvestor/<año>/` (años ordenados, archivos ordenados), reparte por
      extensión (`.csv` → extracto, **cualquier otra → `ignored`**, incluidos por ahora
      los `.json`), aísla el fallo de cada archivo en `failed[]` **con un `try` por
      archivo que la F13 reutilizará tal cual**, y vuelca `<archivo>.json` por extracto
      bajo `<dump>/myinvestor/<año>/`, con rutas relativas en el resultado. No mueve ni
      modifica nada del origen; sin copias locales no hace nada.
      Cubre: R4, R25, R47, R49, R50, R52, R54, R55, R56.

- [x] T10 — Crear `src/modules/myinvestor/myinvestor.service.test.ts` sobre un tempdir:
      carpeta con dos `.csv` (uno sin cabecera), un `.txt` y un `.xlsx` → recuentos,
      `failed`, `ignored` y el volcado en su sitio; los archivos de origen intactos tras
      la ejecución; `bank` y `year` derivados de la carpeta; dos ejecuciones seguidas →
      volcados **idénticos**; tempdir vacío e inexistente → cero, sin excepción y sin
      archivos creados. Cubre: R4, R25, R47, R49, R50, R52, R55, R56.

- [x] T11 — Crear `src/modules/myinvestor/myinvestor.routes.ts` con
      `POST /myinvestor` (opciones `sourceBaseDir` / `dumpBaseDir` inyectables, por
      defecto `var/drive-read` y `var/parsed` bajo `process.cwd()`) y registrarla en
      `src/app.ts` bajo el prefijo `/api/parser` que ya existe. Cubre: R51, R54, R57.

- [x] T12 — Crear `src/modules/myinvestor/myinvestor.routes.test.ts` con `buildApp()` +
      `app.inject()`: 200 con los recuentos, `dumpPath` **relativa** (sin ruta absoluta ni
      `cwd` en el cuerpo), y 200 con `failedCount: 1` cuando hay un archivo roto.
      Cubre: R51, R54, R57.

## Fase 5 — Documentación

> **T13 (la plantilla `docs/myinvestor-product-files.md`) se fue a la F13.**

- [x] T14 — Actualizar `docs/api-contract.md` con la sección del endpoint
      `POST /api/parser/myinvestor`: el modelo del resultado del extracto, la respuesta
      200 de ejemplo, y las notas de que este banco **no aporta saldo ni IBAN** y de que
      un fallo por archivo no cambia el código HTTP. (La F13 le añadirá el modelo de los
      productos.) Cubre: R61.

- [x] T15 — Actualizar `docs/architecture.md`: redactar el **ADR-014** a partir del
      borrador de `design.md` §11 (🔴 **el ADR-013 ya está ocupado por el contrato de la
      F11**; verifica el siguiente número libre antes de escribir) y añadir
      `modules/myinvestor/` al árbol de la sección «Estructura de carpetas». Cubre: R62.

- [x] T16 — Actualizar `docs/dar-de-alta-un-banco.md` añadiendo el paso de crear el
      módulo de parser del banco nuevo, con enlace a `docs/conventions.md` §Parsers de
      banco. Cubre: R64.

> **T17 (lo que la feature 9 necesita saber de estos formatos) se fue a la F13**: era
> de los archivos de producto.

## Fase 6 — Guardianes y cierre

- [x] T18 — Actualizar `src/architecture.test.ts`: añadir los archivos del módulo al
      array `expected` del árbol; añadir el guardián de "sin `prisma`" sobre los archivos
      fuente de `modules/myinvestor/`; añadir el guardián de aislamiento entre bancos (los
      archivos del módulo solo importan de `../../errors/`, `../../lib/`, del propio
      módulo, de vendor o de `../movements/` —el helper único del signo, que no es un
      módulo de banco—, y ningún otro archivo de `src/` importa `modules/myinvestor/`);
      y un test que afirme `normalizeBankName('MyInvestor') === 'myinvestor'`.
      **Comprobar además que los dos guardianes de la F11 siguen verdes con el módulo
      nuevo dentro:** una sola declaración del contrato en `src/` (R70) y una sola regla
      del signo (R11). Cubre: R1, R2, R3, R65, R70.

- [x] T19 — Verificar el alcance sobre el diff: `package.json` y `pnpm-lock.yaml` sin
      cambios, `prisma/` sin cambios, `.gitignore` sin cambios, ningún archivo de
      `specs/investments-data-model/` tocado, ningún archivo del otro módulo de parser
      tocado y **ningún archivo de la F13 adelantado** (no existe
      `myinvestor.product.parser.ts` ni `docs/myinvestor-product-files.md`).
      Cubre: R58, R59.

- [x] T20 — Ejecutar `pnpm run typecheck` y `pnpm test`: **la suite completa en verde**,
      incluidos los tests que ya existían (que no deben cambiar). Cubre: R66.

- [x] T21 — Ejecutar `bash ./init.sh` con el contenedor levantado
      (`docker compose up -d`) y comprobar que termina con `[OK] Entorno listo`.
      Cubre: R66.

- [x] T22 — Escribir el **mapa de trazabilidad** de los `R<n>` de esta spec → test
      concreto en `progress/implementations/myinvestor-statement.md`, marcando como
      *"requirement de proceso (checklist del reviewer)"* los que no tienen test
      ejecutable: **R58, R59, R61, R62, R64, R66, R67**. Cubre: R67.
