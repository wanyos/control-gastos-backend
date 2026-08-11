# Requirements — Feature 10: myinvestor-statement

> Derivados del bloque `intent` de la feature 10 en `feature_list.json` (**fuente de
> verdad del QUÉ**) y de las **muestras reales** que el humano dejó en
> `var/drive-read/myinvestor/2026/` (ruta gitignoreada, no versionada). Donde el
> `acceptance` y el `intent` difieran, manda el `intent`. Aplican los Principios 1-5
> y los **ADR-004**, **ADR-008**, **ADR-009**, **ADR-010**, **ADR-011** y **ADR-013** de
> `docs/architecture.md`, la norma **«Parsers de banco»** de `docs/conventions.md`
> (un parser por banco, varias entradas dentro del mismo banco, **y una única forma de
> salida compartida**) y `docs/specs.md` (EARS estricto).
>
> ⚠️ **Re-especificado el 2026-08-11 contra el contrato de la F11.** Los requirements
> tocados son **R2, R3, R11, R17, R18, R19, R20** (editados en su sitio) y **R68, R69,
> R70** (nuevos, al final, para no renumerar). Diff en
> [`CHANGELOG-respec.md`](CHANGELOG-respec.md).
>
> ✂️ **Cortado el 2026-08-11 (aprobado por el humano).** La antigua F10
> `myinvestor-parser` hacía dos cosas; esta se queda con **el extracto CSV de la cuenta
> corriente**. Los archivos JSON de producto de inversión son la **F13
> `myinvestor-products`**
> ([`../myinvestor-products/`](../myinvestor-products/requirements.md)), que se lleva
> **R21-R46, R48, R53, R60 y R63** y los **cinco puntos 🔴**. La numeración `R<n>` NO se
> ha tocado: los huecos que verás abajo (R21-R46, R48, R53, R60, R63) son ellos.
>
> **Alcance: entender el archivo, no guardarlo.** El extracto CSV convertido a
> movimientos estructurados y volcado a un JSON local para revisarlo. **Sin base de
> datos, sin esquema Prisma y sin mover nada en Drive.**
>
> ⏸️ **Esta feature es SDD: para en `spec_ready` y espera la aprobación humana.** La
> sección de **Procedencia** (al final) marca lo `(delegado)` y lo `(añadido)`.
> ✅ **No tiene ningún punto 🔴 pendiente:** se fueron todos con la F13.

## Decisiones delegadas que este spec resuelve (detalle y alternativas en `design.md`)

De las ocho decisiones que el `intent` cedió al agente (`delego_en_agente`), estas son
las que caen del lado del extracto; las demás las resuelve la F13.

| # | Delegación | Dónde se resuelve | Requirements |
| --- | --- | --- | --- |
| 3 | Si el banco sale de la carpeta o del archivo, y cómo se distingue el extracto de los productos | `design.md` §5 | **R25, R50** |
| 6 | Qué pasa con el resto de archivos cuando uno está roto | `design.md` §9 | **R47, R49** |
| 7 | Cómo se dispara el parseo y dónde se vuelca el JSON local | `design.md` §10 | **R51, R52, R54-R57** |
| — | Dependencias | `design.md` §4 | **R58** |

---

## A. Módulo, aislamiento y alcance

### R1

El sistema DEBE alojar todo el código de esta feature en el módulo
`src/modules/myinvestor/`, cuyo nombre coincide exactamente con el slug que
`normalizeBankName` ([`src/lib/drive-structure.ts:66`](../../src/lib/drive-structure.ts#L66))
produce para este banco y con el nombre de su carpeta de Drive.

*Verificación:* test que afirma `normalizeBankName('MyInvestor') === 'myinvestor'`, y
entradas `modules/myinvestor/*` en el árbol esperado de `src/architecture.test.ts`
(R65).

### R2

El sistema NO DEBE compartir código de parseo con el módulo de ningún otro banco:
ningún archivo de `src/modules/myinvestor/` importa de otro `src/modules/<banco>/`, ni
otro módulo de banco importa de este.

*Verificación:* guardián en `src/architecture.test.ts` que comprueba que los archivos
de `modules/myinvestor/` solo importan de `../../errors/`, `../../lib/`, del propio
módulo, de vendor o de `../movements/` (el helper único del signo, R11, que **no es un
módulo de banco**); y que ningún otro archivo de `src/` importa `modules/myinvestor/`.

### R3

El sistema NO DEBE contener la cadena `prisma` (en cualquier combinación de
mayúsculas) en ningún archivo fuente de `src/modules/myinvestor/`.

*Verificación:* guardián en `src/architecture.test.ts`, mismo patrón que el que ya
existe para los otros módulos sin acceso a datos. Nota: importar el helper del signo
(R11) arrastra Prisma **por transitividad de carga**, no por acceso a datos, y el
guardián equivalente de Bankinter sigue verde con ese import (ADR-013, consecuencias).

### R4

El sistema NO DEBE mover, borrar ni modificar ningún archivo de origen al parsear.

*Verificación:* test del servicio sobre un directorio temporal que comprueba que,
tras la ejecución, los archivos de entrada siguen existiendo con el mismo contenido y
en la misma ruta.

---

## B. El extracto CSV de la cuenta corriente

### R5

CUANDO recibe el contenido de un extracto CSV, el sistema DEBE devolver exactamente
un movimiento estructurado por cada línea de datos interpretable, en el mismo orden en
que aparecen en el archivo.

*Verificación:* test del parser con un fixture sintético de N líneas → `movements`
tiene N elementos y `movements[0]` corresponde a la primera línea de datos del archivo.

### R6

El sistema DEBE decodificar el contenido del extracto como UTF-8, descartando el BOM
inicial si está presente.

*Verificación:* dos tests con el mismo fixture, uno con BOM (`﻿`) y otro sin él →
mismo resultado, y un concepto con `ó`/`ñ`/`€` se recupera intacto.

### R7

El sistema DEBE localizar la fila de cabecera por el nombre de sus columnas, de forma
insensible a mayúsculas y acentos, sin depender de su posición en el archivo ni del
orden de las columnas.

*Verificación:* test con un fixture cuya cabecera va en la 3ª línea y con las columnas
en otro orden → los campos se mapean bien; test con la cabecera con el acento
corrompido (`operaci?n`) → la columna se sigue reconociendo.

### R8

El sistema DEBE poblar cada movimiento con `bookingDate` (columna «Fecha de
operación»), `valueDate` («Fecha de valor»), `description` («Concepto»), `amount`
(importe con signo) y `currency` («Divisa»).

*Verificación:* test que compara el movimiento completo contra el objeto esperado.

### R9

El sistema DEBE convertir las fechas `dd/mm/aaaa` del extracto a `AAAA-MM-DD`,
validando que corresponden a un día real del calendario.

*Verificación:* test con `01/08/2026` → `'2026-08-01'`, y con `31/02/2026` → la línea
va a `unparsedRows` (R14).

### R10

El sistema DEBE interpretar correctamente los importes del extracto tanto cuando
llevan separador de miles como cuando no lo llevan, dentro de un mismo archivo.

*Verificación:* un único fixture con las cinco formas que conviven en la muestra real
→ `-50` → `-50`; `-7,99` → `-7.99`; `-5000` → `-5000`; `-25.000` → `-25000`;
`25.149,95` → `25149.95`.

> 📌 **Esta misma función la reutiliza la F13** para los archivos de producto escritos a
> mano (su R26). Vive en `myinvestor.format.ts` y **no sube a `src/lib/`**: es
> conocimiento de este banco.

### R11

El sistema DEBE derivar `type` del signo del importe **llamando al helper único**
[`deriveMovementTypeFromAmount`](../../src/modules/movements/movements.service.ts#L33),
sin reimplementar la regla: `expense` si es negativo, `income` si es positivo y
`neutral` si es cero.

*Verificación:* test con las tres formas (importe negativo, positivo y `0`), más el
guardián ya existente de [`architecture.test.ts`](../../src/architecture.test.ts)
que exige que todo `*.parser.ts` importe ese helper y ninguno reescriba la regla
(ADR-013 decisión 4).

### R12

El sistema DEBE copiar el texto íntegro del Concepto en `description`, sin dividirlo,
recortarlo ni extraer de él ningún identificador.

*Verificación:* test con un concepto que contiene un número de contrato con dobles
espacios → `description` sale carácter a carácter igual (salvo el recorte de espacios
en los extremos) y el resultado no expone ningún campo derivado de él.

### R13

El sistema NO DEBE deduplicar: dos líneas idénticas del mismo archivo DEBEN aparecer
las dos en el resultado.

*Verificación:* fixture con dos líneas idénticas (misma fecha, mismo concepto, mismo
importe) → `movements` contiene las dos.

### R14

SI una línea del extracto no se puede interpretar ENTONCES el sistema DEBE recogerla en
`unparsedRows` con su número de línea (1-based, contando la cabecera) y el motivo, sin
detener el parseo de las líneas restantes.

*Verificación:* fixture con una línea de importe ilegible entre dos líneas buenas → las
dos buenas están en `movements`, la mala en `unparsedRows` con su `row` y su `reason`.

### R15

El sistema DEBE ignorar las líneas en blanco del extracto sin reportarlas como no
interpretables.

*Verificación:* fixture terminado en salto de línea y con una línea vacía en medio →
`unparsedRows` está vacío.

### R16

SI el archivo no contiene una fila de cabecera reconocible ENTONCES el sistema DEBE
reportar ese archivo como fallido, sin devolver movimientos.

*Verificación:* test con un `.csv` que no es un extracto → el archivo aparece en
`failed` con su motivo y `movements` no se emite para él.

---

## C. El saldo que este banco no da (y el IBAN que tampoco)

### R17

El sistema DEBE emitir
[`balance`](../../src/lib/parsed-statement.ts#L36)`: null` en todos los movimientos del
extracto.

*Verificación:* test que comprueba que **todos** los movimientos del fixture llevan la
clave `balance` presente y con valor `null` (presente y nula, no ausente, y nunca `0`).

### R18

> ⚠️ **Re-especificado el 2026-08-11 contra el contrato de la F11.** Antes exigía un
> campo `providesBalance: false` en el resultado; **ADR-013 lo descartó
> explícitamente** ([architecture.md](../../docs/architecture.md), alternativas
> consideradas): `balance: null` por línea ya dice que el dato no viene, y una
> constante por banco duplica ese conocimiento y hay que mantener los dos coherentes.

El sistema NO DEBE emitir ningún campo por banco que anuncie si aporta saldo
(`providesBalance` ni equivalente): la ausencia del dato se expresa **solo** con
`balance: null` en cada movimiento (R17).

*Verificación:* test que comprueba que el resultado del extracto tiene exactamente las
cuatro claves del contrato ([`ParsedStatement`](../../src/lib/parsed-statement.ts#L68):
`bank`, `accountIban`, `movements`, `unparsedRows`) y ninguna más, y que el volcado JSON
tampoco la lleva.

### R19

El sistema NO DEBE calcular, acumular ni inferir ningún saldo a partir de los importes
del extracto.

*Verificación:* fixture cuyos importes sumarían un total reconocible → ningún campo del
resultado contiene ese total; guardián que comprueba que el código del parser del
extracto no contiene ninguna acumulación de saldo (`balance` solo aparece como
`balance: null`).

### R20

El sistema DEBE emitir `accountIban: null`
([contrato](../../src/lib/parsed-statement.ts#L76)) en el resultado del extracto, sin
inferir el IBAN del nombre del archivo, de la carpeta ni del contenido de los
movimientos.

*Verificación:* test que comprueba `result.accountIban === null` con un fixture cuyo
nombre de archivo y cuyos conceptos contienen cadenas con forma de IBAN.

---

## D-F. Los archivos JSON de producto → **F13 `myinvestor-products`**

> **R21-R46, R48, R53, R60 y R63 viven ahora en
> [`../myinvestor-products/requirements.md`](../myinvestor-products/requirements.md).**
> No se han renumerado: buscar `R33` allí sigue dando el mismo requirement que antes.
>
> Lo único de aquel bloque que se queda **aquí** es lo que construye el **servicio**, que
> es de esta feature y del que la F13 depende: **R47** (aislamiento del fallo por
> archivo) y **R49** (`ignored[]`).

### R25

El sistema DEBE tomar el identificador del banco de la carpeta que contiene el archivo
(`<banco>/<año>/`) y no de su contenido.

*Verificación:* test del servicio sobre un tempdir `.../myinvestor/2026/` → el extracto
sale con `bank: 'myinvestor'`, aunque el archivo no lo diga.

### R47

SI un archivo falla al parsearse ENTONCES el sistema DEBE parsear igualmente el resto de
archivos de la carpeta.

*Verificación:* test con tres archivos de los que uno está roto → los dos buenos se
parsean y el roto aparece en `failed` con su motivo.

### R49

El sistema DEBE reportar en `ignored`, sin tratarlo como error, todo archivo de la
carpeta cuya extensión no maneje este parser.

*Verificación:* test con un `.txt` y un `.xlsx` en la carpeta → `ignored` tiene dos
entradas, `failed` sigue vacío y el resto se parsea.

> 📌 **Mientras la F13 no exista, los `.json` de producto también caen en `ignored`**, y
> es correcto: no hay nadie que sepa leerlos y no son un fallo. La F13 cambia esa rama
> (su R76) sin tocar el resto.

---

## G. Disparo, volcado y determinismo

### R50

El sistema DEBE decidir qué parser aplica a cada archivo **por su extensión**: `.csv` →
extracto de cuenta corriente; cualquier otra → `ignored` (R49) mientras no exista un
parser para ella.

*Verificación:* test con una carpeta que contiene un `.csv` y un `.txt` → el `.csv` va
al parser del extracto y el `.txt` a `ignored`.

### R51

CUANDO se invoca `POST /api/parser/myinvestor`, el sistema DEBE parsear las copias
locales que hay bajo `var/drive-read/myinvestor/<año>/`.

*Verificación:* test de ruta con `app.inject()` sobre un `sourceBaseDir` inyectado a un
tempdir → responde 200 con el recuento de lo parseado.

### R52

El sistema DEBE volcar el resultado de cada extracto en
`var/parsed/myinvestor/<año>/<archivo>.json`.

*Verificación:* test del servicio que comprueba que el archivo existe en el tempdir de
volcado y que su contenido es el resultado del parser.

### R54

El sistema DEBE devolver en la respuesta rutas de volcado **relativas** a la carpeta de
volcado local, nunca la ruta absoluta de la máquina.

*Verificación:* test que comprueba que `dumpPath` vale `myinvestor/2026/…` y que la
respuesta serializada no contiene el separador de unidad ni el `cwd`.

### R55

CUANDO se ejecuta dos veces seguidas sobre los mismos archivos de entrada, el sistema
DEBE producir volcados idénticos byte a byte.

*Verificación:* test que ejecuta el servicio dos veces sobre el mismo tempdir y compara
el contenido de los dos volcados con `toEqual` sobre el string leído.

### R56

CUANDO no hay ninguna copia local de este banco, el sistema DEBE terminar sin error y
sin escribir ningún volcado.

*Verificación:* test del servicio sobre un tempdir vacío (y sobre uno inexistente) →
recuentos a 0, sin excepción y sin archivos creados.

### R57

SI un archivo falla, el sistema DEBE responder igualmente `200` con el fallo aislado en
`failed`.

*Verificación:* test de ruta con un archivo roto en el tempdir → `statusCode` 200 y
`failedCount` 1.

---

## H. Dependencias, privacidad, documentación y cierre

### R58

El sistema NO DEBE añadir ninguna dependencia nueva a `package.json`.

*Verificación:* checklist del reviewer sobre el diff de `package.json` y
`pnpm-lock.yaml` (sin cambios); requirement de proceso.

### R59

El sistema DEBE construir los fixtures de test de forma sintética, sin copiar cifras,
conceptos ni nombres de los archivos reales de `var/`, y sin realizar ninguna llamada
de red.

*Verificación:* checklist del reviewer sobre los fixtures; los tests corren con la red
apagada sin fallar.

### R61

El sistema DEBE documentar en `docs/api-contract.md` el endpoint nuevo y el modelo del
resultado del extracto (la F13 le añadirá después el de los productos).

*Verificación:* checklist del reviewer contra el diff de `docs/api-contract.md`.

### R62

El sistema DEBE registrar en `docs/architecture.md` el **ADR-014** (el ADR-013 lo ocupa
ya el contrato compartido de la F11) con las decisiones de esta feature y sus
alternativas descartadas, y DEBE añadir `modules/myinvestor/` al árbol de la sección
«Estructura de carpetas».

*Verificación:* checklist del reviewer contra el diff (borrador del ADR en `design.md`
§11).

### R64

El sistema DEBE añadir a `docs/dar-de-alta-un-banco.md` el paso de crear el módulo de
parser del banco nuevo (consecuencia ya escrita en `docs/conventions.md` §Parsers de
banco y hoy ausente de ese documento).

*Verificación:* checklist del reviewer contra el diff.

### R65

El sistema DEBE añadir los archivos del módulo al árbol esperado de
`src/architecture.test.ts`.

*Verificación:* la suite pasa con las entradas nuevas y falla si se borra uno de los
archivos del módulo.

### R66

El sistema DEBE terminar `bash ./init.sh` con `[OK] Entorno listo`.

*Verificación:* ejecución de `bash ./init.sh` con el contenedor levantado.

### R67

El sistema DEBE dejar el mapa de trazabilidad `R<n>` → test concreto en
`progress/implementations/myinvestor-statement.md`.

*Verificación:* revisión del mapa (Nivel 4 de `docs/verification.md`).

---

## I. El contrato compartido de movimiento parseado (F11, ADR-013)

> Bloque **añadido el 2026-08-11** al re-especificar contra
> [`src/lib/parsed-statement.ts`](../../src/lib/parsed-statement.ts), que se cerró
> después de escribirse este spec. Se numera a continuación de R67 **a propósito**:
> renumerar el documento destruiría la trazabilidad ya escrita.

### R68

El sistema DEBE emitir la posición de cada movimiento dentro de su `bookingDate` en el
campo [`daySequence`](../../src/lib/parsed-statement.ts#L56), donde `1` es el
movimiento **más antiguo** de ese día, calculándola con el helper compartido
[`assignDaySequence`](../../src/lib/parsed-statement.ts#L96) y pasándole
`'newest-first'`, porque este banco exporta el movimiento más reciente primero.

*Verificación:* fixture con tres líneas del mismo `bookingDate` en orden de archivo
(la más reciente arriba) → la primera del archivo sale con `daySequence: 3` y la
última con `1`, y el array conserva el orden del archivo (R5); test que comprueba que
el módulo pasa `'newest-first'` (constante `statementOrder`, mismo patrón que
[`bankinter.parser.ts:10`](../../src/modules/bankinter/bankinter.parser.ts#L10)).

### R69

El sistema DEBE numerar con `daySequence` **solo** los movimientos parseados: una fila
que acaba en `unparsedRows` NO DEBE consumir número, de modo que cada día quede
numerado `1..n` sin huecos.

*Verificación:* fixture con cuatro líneas del mismo día, la segunda ilegible → los tres
movimientos llevan `daySequence` 3, 2 y 1 (sin salto), y `unparsedRows` tiene una
entrada.

### R70

El sistema NO DEBE declarar en `src/modules/myinvestor/` ningún tipo propio de
movimiento parseado (`ParsedMovement`, `ParsedMovementType`, `UnparsedRow` ni un
`MyinvestorMovement` equivalente): DEBE consumir el contrato compartido y declarar
solo `MyinvestorStatementResult = ParsedStatement<'myinvestor'>`.

*Verificación:* el guardián ya existente de
[`architecture.test.ts`](../../src/architecture.test.ts) que rechaza una segunda
declaración de esos tipos en `src/` (F11) sigue verde con el módulo nuevo dentro, y
test de tipos que comprueba que el resultado del parser encaja en `ParsedStatement`.

---

## Cobertura del `como_se_que_esta_bien` (regla dura de `docs/specs.md`)

Los puntos del `intent` que caen de este lado del corte (los de los archivos de producto
—5 a 12— se cubren en
[`../myinvestor-products/requirements.md`](../myinvestor-products/requirements.md)):

| # | Frase del `intent` | Requirements que la cubren |
| --- | --- | --- |
| 1 | Módulo propio con el nombre normalizado de su carpeta de Drive, sin compartir parser con ningún otro banco | **R1, R2** |
| 2 | Un movimiento estructurado por línea, con sus dos fechas, el concepto, el importe con signo y la divisa | **R5, R8, R11, R12, R68, R69, R70** |
| 3 | Importes con y sin separador de miles en el mismo archivo; fechas día/mes/año | **R9, R10** |
| 4 | El extracto no trae saldo y eso no se disimula | **R17, R18, R19** |
| 11 | Un archivo mal escrito se reporta aparte; los demás se parsean igual | **R16, R47, R49** (los motivos propios de un archivo de producto, en la F13) |
| 12 | El parser no calcula nada | **R19** |
| 13 | El resultado parseado se puede ver en un JSON local | **R51, R52, R54** |
| 14 | Parsear dos veces los mismos archivos da exactamente el mismo resultado | **R55** |

Requirements de los `que_no_quiero` y del cierre estándar (no listados arriba porque no
salen del `como_se_que_esta_bien`): **R3, R4** (ni BD ni mover archivos), **R13**
(no deduplicar), **R58** (sin dependencias), **R59** (sin datos reales), **R61-R67**
(documentación y cierre), **R18** y **R68-R70** (conformidad con el contrato compartido
de la F11).

---

## Procedencia

> Clasificación obligatoria de cada `R<n>` (ver `docs/specs.md`). El humano revisa con
> lupa lo `(delegado)` y, **sobre todo**, lo `(añadido)`. Lo `(añadido)` va primero.

### 🟥 AÑADIDO — cosas que el humano NO pidió y que introduce el agente

> **Tres** de las ocho que quedaban vivas tras el corte caen de este lado; las otras
> cinco están en [`../myinvestor-products/`](../myinvestor-products/requirements.md).
> Ninguna de estas tres llega a punto 🔴: no cambian nada de lo que el humano escribe ni
> ve, y su consecuencia está dicha en `decisions.md`.

- **R20 (`accountIban: null`) — (añadido, y con una consecuencia que conviene que
  sepas).** El `intent` no menciona el IBAN. Mirando la muestra real he visto que **este
  CSV tampoco lo trae** (no tiene preámbulo: la primera línea ya es la cabecera).
  Consecuencia práctica, que **no** se resuelve en esta feature: el servicio de alta
  automática de cuenta de la feature 8 exige **IBAN + banco** y lanza
  `MissingAccountDataError` (422) si falta, así que **la cuenta corriente de este banco
  tendrás que darla de alta a mano**. **← REVISAR EN APROBACIÓN.**
- **R49 (`ignored[]` para las extensiones que este parser no maneja) — (añadido).** No
  está en el `intent`. Lo añado porque en tu carpeta real conviven ahora mismo tres
  `.txt` con lo que copiaste de la web: tratarlos como error llenaría el reporte de
  ruido, e ignorarlos en silencio escondería el día en que subas un archivo con la
  extensión mal puesta. Una lista aparte, visible y sin ser un fallo, es el término
  medio. **← REVISAR EN APROBACIÓN.**
- **R64 (añadir el paso del módulo de parser a `docs/dar-de-alta-un-banco.md`) —
  (añadido).** No lo pediste. `docs/conventions.md` §Parsers de banco ya dice que dar de
  alta un banco obliga a crear su módulo, pero el documento operativo de alta no lo
  menciona; esta feature es el primer caso que lo demuestra. Es una línea de
  documentación. **← REVISAR EN APROBACIÓN.**

### ✅ Añadidos que ya NO están pendientes (resueltos por la F11)

- **R18 (no hay campo `providesBalance`) — (añadido, RESUELTO en contra de lo que
  proponía).** Este spec proponía un booleano `providesBalance: false` a nivel de
  resultado, y ofrecía como alternativa "quedarnos solo con R17". **La F11 eligió esa
  alternativa el 2026-08-11:** ADR-013 descarta el campo porque `balance: null` por
  línea ya dice que el dato no viene. **Ya no hay nada que aprobar aquí**; R18 pasa a
  prohibir el campo.
- **R11 (`neutral` para importe 0) — (añadido, RESUELTO a favor).** Este spec proponía
  emitir los **tres** valores y dejaba anotada como incoherencia conocida que el parser
  de Bankinter tratase el 0 como `income`. **La F11 la eliminó el 2026-08-11:** ADR-013
  decisión 4 hace que todos los parsers llamen a `deriveMovementTypeFromAmount`. Aquí
  solo queda la obligación de **llamar al helper**.

### Impuesto por el contrato compartido de la F11 (ADR-013, ya aceptado)

> No son propuestas del agente ni cosas que el humano tenga que decidir aquí: son la
> adaptación de esta feature a algo que **ya está implementado** en
> [`src/lib/parsed-statement.ts`](../../src/lib/parsed-statement.ts) y que Bankinter ya
> cumple.

- **R68, R69 (`daySequence`) — (impuesto).** El contrato exige que **el parser** emita
  la posición del movimiento dentro de su día, contando desde el más antiguo, porque el
  sentido en que exporta cada banco es conocimiento del banco. Lo único que decido yo es
  el argumento: **`'newest-first'`**, verificado sobre la muestra real de
  `var/drive-read/myinvestor/2026/` (las fechas de operación bajan de `06/08/2026` a
  `08/07/2026` según se avanza en el archivo).
- **R70 (sin tipos propios) — (impuesto).** `docs/conventions.md` §Parsers de banco
  prohíbe que un banco declare sus propios `ParsedMovement`, `UnparsedRow` o
  `ParsedMovementType`, y hay un guardián que lo rechaza.
- **R18 (sin `providesBalance`) — (impuesto, ver arriba).**

### Delegado (resuelve algo de `delego_en_agente`)

- **R25, R50 — (delegado #3)** "Si el banco se deduce de la carpeta o va dentro del
  archivo, y cómo se distingue el extracto de los archivos de producto". Decido: **banco
  de la carpeta** (misma regla que la ingesta ya usa desde la feature 5) y **el tipo de
  entrada por la extensión**. Alternativa descartada (mirar el contenido) en `design.md`
  §5.
- **R47, R49 — (delegado #6, la parte del servicio)** "Qué pasa con el resto de archivos
  cuando uno está roto". Decido: **aislamiento por archivo** dentro de su propio `try`,
  con el fallo anotado en `failed[]` y el bucle intacto, y una lista `ignored[]` aparte
  para lo que no es asunto de este parser. `design.md` §9.
- **R51-R57 — (delegado #7)** "Cómo se dispara el parseo y dónde se vuelca el JSON
  local, reutilizando el camino que ya existe". Decido: **el mismo camino** —copias
  locales en `var/drive-read/<banco>/<año>/`, volcado en `var/parsed/<banco>/<año>/`,
  endpoint bajo el prefijo `/api/parser` que ya existe—. `design.md` §10.
- **R2, R58 — (delegado, dependencias)** El `intent` no delega explícitamente las
  dependencias, pero el `acceptance` nº 16 pide documentar cualquiera nueva. Decido **no
  añadir ninguna**: el CSV es texto delimitado (`split`). Razonamiento y alternativa
  descartada en `design.md` §4.

### Humano (trazable a una frase del `intent`)

- **R1, R2 — (humano)** "Que exista el parser de MyInvestor… en su propio módulo y con
  el mismo nombre normalizado que su carpeta de Drive, siguiendo la norma de un parser
  por banco" + `que_no_quiero`: "no hacer un parser compartido entre bancos".
- **R5, R8, R12 — (humano)** "Obtengo un movimiento estructurado por cada línea, con sus
  dos fechas, el concepto, el importe con su signo y la divisa".
- **R9, R10 — (humano)** "Los importes se interpretan bien aunque en el mismo archivo
  unos lleven separador de miles y otros no, y las fechas en formato día/mes/año se
  interpretan bien".
- **R17, R19 — (humano)** "El extracto no trae saldo, y eso no se disimula" +
  `que_no_quiero`: "tampoco inventar un saldo que el extracto no trae".
- **R16, R47 — (humano)** "Si un archivo está mal escrito… se reporta aparte diciendo
  qué archivo y qué está mal, y los demás archivos se parsean igual".
- **R13 — (humano)** Fidelidad al archivo: el `que_no_quiero` prohíbe deduplicar en el
  parser; además tu muestra real trae **dos líneas idénticas legítimas** el mismo día.
- **R51, R52, R54 — (humano)** "Puedo ver el resultado parseado en un archivo JSON local
  para revisarlo".
- **R55 — (humano)** "Parsear dos veces los mismos archivos da exactamente el mismo
  resultado".
- **R3, R4 — (humano)** `que_no_quiero`: "no guardar en base de datos ni tocar el esquema
  Prisma"; "no mover el archivo a procesados/"; "no enlazar todavía los movimientos con
  los productos de inversión".
- **R59 — (humano)** `que_no_quiero`: "ni versionar ningún dato financiero real".
- **R61, R62, R65, R66, R67 — (humano)** Cierre estándar del proyecto: `acceptance`
  nº 16, `docs/verification.md` (Nivel 4 obligatorio por ser `sdd: true`) y
  `docs/architecture.md`.
