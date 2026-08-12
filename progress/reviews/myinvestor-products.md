# Review — F13 `myinvestor-products`

> Dos pasadas. La **primera** (RECHAZADO) está íntegra abajo, con sus cifras **redactadas**:
> citaba los importes reales del humano como prueba, y eso convertía el propio informe en una
> copia del leak. Lo he sustituido por `«‹dato redactado›»` sin tocar ni una conclusión.

---

# Segunda pasada — 2026-08-12

**Veredicto:** ✅ **APROBADO**
**`./init.sh`:** verde por mi cuenta — **25 archivos, 360 tests**, `tsc` OK, `[OK] Entorno listo`.
`pnpm run lint` limpio · `pnpm run format:check` verde.

Comprobado: saneamiento verificado a mano contra las capturas, acceptance/requirements ↔ tests,
arquitectura, convenciones, CHECKPOINTS C1-C8.
Resumen de cierre: [`progress/summaries/myinvestor-products.md`](../summaries/myinvestor-products.md).

## Verificación independiente del saneamiento

No me he fiado de los partes. He extraído **todos** los valores de sus tres capturas de
`var/drive-read/myinvestor/2026/` (`fondo.txt`, `deposito.txt`, `indi.txt`) —importes, ganancias,
porcentajes, principal, las dos TAE, intereses brutos, fecha de vencimiento y el nombre literal
del depósito— y he buscado **cada uno** en su **forma inglesa** (`1234.56`) y en su **forma
española** (`1.234,56`), más la fecha en los dos formatos, sobre `src/`, `docs/`,
`specs/myinvestor-products/` y `progress/`.

**En la superficie de la F13 no queda ni uno.** Limpios:

- `src/modules/myinvestor/**` — fixture, parser, los tres archivos de test y los comentarios.
- `docs/myinvestor-product-files.md` (el documento de R60), `docs/api-contract.md` y **el
  ADR-016** de `docs/architecture.md` — este último llevaba dos importes suyos que **yo no
  detecté en la primera pasada**; el implementer lo encontró y lo saneó. Anotado como acierto
  suyo y como fallo de cobertura mío.
- `specs/myinvestor-products/` — los **cinco** archivos, incluido el nombre literal del depósito
  en `CAMPOS-cerrados.md`, y las cifras que también llevaban `requirements.md`, `tasks.md` y
  `decisions.md`. Los ejemplos van marcados «ej. inventado» / 🔒, que es lo que evita que alguien
  los «corrija» de vuelta al original.
- **Fuga heredada de la F10 saneada de propina:** `myinvestor.format.test.ts` usaba el importe
  real de su fondo en tres aserciones de `parseAmountText`. Verificado que el test **no perdió
  cobertura**: sigue ejerciendo separador de miles, coma decimal, símbolos `€`/`%`, el caso
  ambiguo del punto sin coma y los `null`.

## El saneamiento no ha estropeado nada

Esto es lo que había que mirar de verdad, porque cambiar números es fácil y romper la enseñanza
del ejemplo, también:

- **Aritmética coherente en los tres ejemplos.** En el fondo y en la cartera,
  `invested + gain = marketValue` **exacto**, y el `gainPercent` cuadra con `gain / invested`
  redondeado a dos decimales. En el depósito, el `expectedGain` es **exactamente** el que sale de
  aplicar su TAE al principal durante los tres meses del plazo. Es la misma coherencia que tenían
  los originales y es la que hace creíble la plantilla.
- **La lección de §7.5 sigue intacta:** el efectivo sin invertir queda **fuera** de la suma y es
  un orden de magnitud menor que el valor de mercado, que es justo lo que el ejemplo tiene que
  enseñar.
- **Ningún test se ha vuelto trivial.** Comprobado uno a uno los que dependían de un valor
  concreto: R36 sigue afirmando que **no existe ningún campo con la suma** de los dos números
  nuevos (y la suma está bien calculada, no es un número que no podría aparecer de todas formas);
  R27 sigue probando que un tercer decimal **no** se redondea y que un entero no se reformatea;
  R38 conserva el signo con dos negativos; R29 sigue distinguiendo porcentaje de fracción; R39
  sigue usando cifras que **no** cuadran a propósito. Las aserciones son de igualdad exacta, no
  de «no lanza».
- **Los tres tipos y el depósito siguen ejerciendo campos distintos**, así que el saneamiento no
  ha colapsado dos casos en uno.
- **Nada de lo aprobado en la primera pasada se ha roto:** el ADR-016 sigue sin pisar al 015, la
  F9 y `myinvestor.routes.ts` siguen intactos, sigue sin haber una sola mención a `prisma` en el
  módulo, el guardián del signo sigue mordiendo en los dos parsers de movimientos, y los 30
  requirements siguen con su test (verificado que los nombres de los tests del mapa de
  trazabilidad siguen existiendo tras el cambio).

## Riesgo aceptado (decisión del humano, no defecto pendiente)

**Las cifras siguen en el histórico de git** (commits `9588389` y `0e95035`) y **no se va a
reescribir la historia**: el repositorio es privado y el humano lo ha decidido así. Queda
**anotado como riesgo conocido y aceptado**. Consecuencia práctica que conviene no olvidar: si el
repositorio dejara de ser privado algún día, el saneamiento del árbol de trabajo **no basta**.

## Trabajo aparte — confirmado, y NO entra en este veredicto

Verificado que lo que el implementer señaló sin aplicar es cierto. Son de otras features:

1. `docs/data-model.md` (tabla de la comprobación aritmética) — sus cifras reales, F9.
2. `docs/architecture.md`, **ADR-012** (el mismo ejemplo aritmético) — F9.
3. `src/modules/investments/investments.model.test.ts` — cinco valores suyos en un test, F9.
4. `progress/history.md` y `progress/summaries/investments-data-model.md` (+ el review de esa
   feature, que también los cita) — F9.
5. `progress/current.md` — una cifra suya como ejemplo de «número JSON puro». **Este archivo es
   del leader**, no del implementer; se arregla al cerrar la sesión.
6. **F10:** el fixture CSV y `myinvestor.statement.parser.test.ts` usan un concepto de
   movimiento que parece copiado de su extracto real. No he podido contrastarlo (sus capturas no
   incluyen el extracto), pero encaja con el patrón; merece revisarse con la misma vara.

Sugerencia para el leader: una feature corta de **saneamiento retroactivo** que barra F9 y F10 y
deje un guardián en `src/architecture.test.ts` que falle si un valor de una lista negra aparece
en el árbol. Es la única forma de que esto no vuelva a pasar en la feature 14.

## Anotaciones NO bloqueantes

1. **`myinvestor.fixture.ts`** — el comentario que explica el saneamiento dice que los ejemplos
   conservan «un porcentaje por debajo de diez», y el del fondo está por encima. Es la prosa la
   que se quedó atrás, no el número.
2. Siguen en pie las cuatro de la primera pasada (guardián con puerta trasera teórica,
   `tsconfig.tsbuildinfo` versionado, la cabecera obsoleta de `myinvestor.types.ts` sobre el
   `accountIban`, y el `products.json` que solo se escribe si el año tiene productos).

---
---

# Primera pasada — 2026-08-12 (histórico, cifras redactadas)

**Veredicto:** RECHAZADO (CHANGES_REQUESTED)
**Revisado** sobre el árbol de trabajo (sin commits, como manda el flujo).
**`./init.sh`:** ✅ verde — 25 archivos, 360 tests, `tsc` OK, `[OK] Entorno listo`.
`pnpm run lint` limpio y `pnpm run format:check` **verde** (el rojo por CRLF que reportó el
implementer ya lo resolvió el leader con `.gitattributes`; **no cuenta como defecto de la F13**,
y lo verifiqué: `git diff --ignore-all-space` sobre `src/app.ts`, `src/modules/import/**`,
`src/modules/ingestion/**` y `myinvestor.statement.parser*` da **cero** diferencias de contenido).

El trabajo técnico es sólido: los 30 `R<n>` tienen test real, el parser no calcula nada, el
servicio encamina por extensión y el volcado es determinista. **Lo que bloquea es privacidad.**

## Cambios requeridos

### 1. 🔴 BLOQUEANTE — Los fixtures y la documentación llevan las cifras REALES del humano

Comparado, campo a campo, contra sus capturas gitignoreadas de
`var/drive-read/myinvestor/2026/` (`fondo.txt`, `deposito.txt`, `indi.txt`). **Los nombres de
producto sí son sintéticos, pero los números NO: son sus importes reales, transcritos uno a
uno.** Su posición de inversión completa —lo que tiene invertido, lo que vale, lo que gana, el
importe de su depósito, su TAE, sus intereses y su fecha de vencimiento— queda reconstruible
desde archivos que se versionan y se comparten.

Incumple `docs/conventions.md` §Tests («**Ningún dato real en un fixture** […] **todo** en ellos
es inventado: **importes**, conceptos, números de contrato e IBAN. La regla incluye los datos del
propio dueño del proyecto»), y también las reglas duras del propio spec: `design.md` §14
(«🔴 Nunca se copian cifras ni nombres de producto de los archivos reales de `var/`»), `tasks.md`
T4b («**Datos inventados**») y su preámbulo. Es la misma regla que nació de la fuga del IBAN en
la F12.

Archivos y líneas a corregir (sustituir **todos** los números por cifras inventadas que no
guarden relación con las capturas — ni el mismo valor, ni el mismo valor desplazado de decimal):

1. `src/modules/myinvestor/myinvestor.fixture.ts:102-105` — los cuatro números del fondo
   (`invested`, `marketValue`, `gain`, `gainPercent`): ‹datos redactados›.
2. `src/modules/myinvestor/myinvestor.fixture.ts:115` — `uninvestedCash`: ‹dato redactado›.
3. `src/modules/myinvestor/myinvestor.fixture.ts:126-129` — `principal`, `interestRate`,
   `expectedGain` y `maturityDate` del depósito: ‹datos redactados› (la fecha es la suya, en ISO).
4. `src/modules/myinvestor/myinvestor.fixture.ts:88` — el comentario afirma que ningún archivo
   real se copia a un test. **Hoy es falso**; que vuelva a ser cierto antes de dejarlo escrito.
5. `src/modules/myinvestor/myinvestor.product.parser.test.ts:41-43, 57-58, 124-128, 159-176,
   202-206, 312` — mismas cifras hardcodeadas (incluido el par de la cartera y el importe de la
   segunda TAE, que también sale de su ficha).
6. `src/modules/myinvestor/myinvestor.service.test.ts:230` — `valuation` con dos de sus cifras.
7. `docs/myinvestor-product-files.md:22-25, 39-40, 68-71, 84-88, 103-106` — las dos plantillas
   reproducen su fondo, **su cartera entera** y su depósito. Es el documento de referencia del
   formato (R60): tiene que enseñar la **forma**, no su patrimonio.
8. `docs/api-contract.md` (bloque «Modelo de un producto parseado») — los cuatro números del
   fondo.

> Aclaración de reparto: el implementer copió estas cifras de `design.md` §7, donde ya estaban.
> **Eso no le exime** —las reglas de arriba se lo prohibían de forma explícita y él afirmó
> haberlas cumplido (punto 11 de su informe)— pero sí significa que hay un segundo foco.

### 2. 🔴 BLOQUEANTE — El mismo leak está en el spec, y el implementer no debe tocarlo solo

`specs/myinvestor-products/design.md` §7.1, §7.2 y §7.3 y `CAMPOS-cerrados.md` llevan las mismas
cifras reales **y además el nombre literal de su depósito** (`design.md:285`,
`CAMPOS-cerrados.md:50`), que sí aparece tal cual en su captura. Ya están commiteados. **Para el
leader / `spec_author`:** sanearlos en la misma tanda, o la corrección del punto 1 se deshace la
próxima vez que alguien copie del spec.

### 3. El informe del implementer afirma algo que no es cierto

`progress/implementations/myinvestor-products.md:79-82` — punto 11: «Fixtures 100 % sintéticos
[…] **Ni una cifra**, ni un nombre de producto, ni un dato del humano. Tampoco en la
documentación». Los nombres sí, las cifras no.

## Comprobado sin hallazgos (primera pasada)

**Lo que se pidió mirar con lupa:**

- **El test de la F10 que cambió de expectativa** (`myinvestor.service.test.ts:109-120`):
  **correcto, no es saltarse una regla.** El caso afirmaba que `fondo.json` caía en `ignored[]`
  y su propio comentario decía «hasta que exista la feature que los lee». R76 deroga eso de forma
  explícita («en lugar de reportarlo en `ignored` como hace la F10 **mientras ese parser no
  existe**») y `design.md` §5.1 lo remata («Esta feature **cambia esa rama**»). La nota de T20b es
  una salvaguarda genérica; un requirement nominal manda sobre ella. Además el implementer no
  relajó el caso: lo acotó (`ignoredCount` 3 → 2, con `.txt` y `.xlsx` intactos) y probó el
  encaminamiento en su propio test.
- **El guardián del signo acotado** (`src/architecture.test.ts:340-352`): **sigue mordiendo.**
  De los tres `*.parser.ts` del repo, el filtro por `lib/parsed-statement.js` deja dentro
  `bankinter.parser.ts` y `myinvestor.statement.parser.ts` —los dos que sí producen movimientos—
  y solo excluye el de productos. Las dos aserciones duras siguen aplicándose a ambos, y el
  `expect(parsers.length).toBeGreaterThan(0)` impide que el filtro se vacíe en silencio.
- **Nombres de producto de los fixtures y de la documentación:** verificados uno a uno contra las
  capturas. Ninguno es el nombre real de su depósito. Esta parte sí está bien.

**Lo demás:**

- **Efecto de arrastre de la decisión del humano:** ✅ el parser **no** importa `parseAmountText`,
  hay un test que lo guarda (regex sobre el import) y el texto cae como fallo explícito y sin
  interpretar: `readNumberField` da a `typeof value === 'string'` su propio motivo, distinto del
  genérico, y el test de R77 comprueba los tres textos y que el valor **no** aparece interpretado.
- **Sin base de datos:** ✅ ni una mención a `prisma` en el módulo; el guardián de
  `architecture.test.ts` incluye ya el parser nuevo.
- **ADR:** ✅ el ADR-016 no pisa a nadie — el 015 es el de la F12 y el implementer lo detectó.
  **Roadmap coherente.**
- **La F9 intacta:** ✅ `specs/investments-data-model/` y `prisma/` sin un solo cambio.
- **Alcance (T19b):** ✅ `package.json`, `pnpm-lock.yaml`, `.gitignore` y **`myinvestor.routes.ts`**
  sin tocar; cero dependencias nuevas.
- **Trazabilidad (C7):** ✅ los 30 requirements con test concreto verificado en el árbol;
  R60/R63/R71/R72/R74/R75 son de proceso y están cumplidos. Los tests comprueban output concreto,
  sin mocks y sobre tempdirs reales.
- **Tasks:** ✅ las 18 en `[x]`. **Spec (C7):** ✅ los cinco archivos; `decisions.md` en una
  página, bloque 🔴 a **cero** puntos, procedencia clasificada; el exceso sobre ~15 requirements
  está **explicado** (numeración heredada del corte de la antigua F10).
- **CHECKPOINTS:** C1-C6 ✅ · C7 ⚠️ bloqueado por el punto 1 · C8 no procede.
