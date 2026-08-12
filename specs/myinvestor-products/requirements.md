# Requirements — Feature 13: myinvestor-products

> **Esta feature nace del corte de la antigua F10 `myinvestor-parser`** (aprobado por el
> humano el 2026-08-11, ver
> [`../myinvestor-statement/CHANGELOG-respec.md`](../myinvestor-statement/CHANGELOG-respec.md)).
> Se queda con **la segunda entrada del banco: los archivos JSON de producto de
> inversión que el humano escribe a mano**. El extracto CSV de la cuenta corriente es la
> **F10 `myinvestor-statement`**, que se implementa antes.
>
> 🔴 **La numeración `R<n>` es la de la spec original y NO se renumera.** Este documento
> empieza en **R21** a propósito: renumerar destruiría la trazabilidad de todo lo ya
> escrito y revisado. R1-R20 y otros viven en
> [`../myinvestor-statement/requirements.md`](../myinvestor-statement/requirements.md).
>
> Derivados del bloque `intent` (**fuente de verdad del QUÉ**) y de las **muestras
> reales** que el humano dejó en `var/drive-read/myinvestor/2026/` (ruta gitignoreada,
> no versionada). Aplican los Principios 1-5 y los **ADR-004**, **ADR-008**, **ADR-009**,
> **ADR-010**, **ADR-011** y **ADR-012** de `docs/architecture.md`, la norma
> **«Parsers de banco»** de `docs/conventions.md` y `docs/specs.md` (EARS estricto).
>
> **Alcance: entender los archivos, no guardarlos.** Sin base de datos, sin esquema
> Prisma, sin enlazar movimientos con productos y sin mover nada en Drive.
>
> 🔒 **Todas las cifras, nombres de producto y fechas de las *Verificaciones* son
> INVENTADOS a propósito** (`docs/conventions.md` §Tests: ningún dato real, tampoco del
> dueño del proyecto, en un archivo versionado). Ilustran la forma del caso de test, no
> un saldo verdadero; **no los sustituyas por los de las capturas reales**, que viven
> solo en `var/drive-read/` (gitignoreada).
>
> ✅ **Esta spec NO tiene nada pendiente del visto bueno del humano.** El 2026-08-11
> cerró los CINCO puntos 🔴 (cuatro aprobados tal cual, el nº 1 cambiado a **número JSON
> nativo**) y las TRES casillas que quedaban de la lista de campos (`closedAt` como campo
> del archivo, `currency` opcional que no escribe, y el archivo del depósito **solo al
> contratar y al vencer**). Ver [`decisions.md`](decisions.md),
> [`CAMPOS-cerrados.md`](CAMPOS-cerrados.md) y
> [`../myinvestor-statement/CHANGELOG-respec.md`](../myinvestor-statement/CHANGELOG-respec.md).
> La implementación solo espera a que la F10 `myinvestor-statement` esté `done`.

## Qué construye la F10 y aquí solo se consume

> Regla dura del corte: **ninguna de estas piezas se vuelve a construir aquí**. Si al
> implementar no existen, la F10 no está terminada y esta feature no debe empezar.

| Pieza | Quién la construye | Qué hace esta feature |
| --- | --- | --- |
| `src/modules/myinvestor/` (el módulo) | **F10** | añade sus archivos dentro |
| `myinvestor.format.ts` → `parseAmountText` | **F10** (R10) | **no lo usa.** Desde el 2026-08-11 los números de los archivos de producto son **número JSON nativo** (🔴 nº 1 cerrado), así que aquí no hay texto que interpretar. Sigue siendo del `.csv` del extracto y **no se toca** |
| `myinvestor.format.ts` → `parseIsoDate` | **esta feature** | lo añade **al archivo que ya existe**, no crea otro |
| `myinvestor.service.ts` (recorrido, `failed[]`, `ignored[]`, aislamiento, volcado) | **F10** (R47, R49, R52, R55, R56) | **extiende** la rama de la extensión (R76) y añade el volcado de productos (R53) |
| `myinvestor.routes.ts` (`POST /api/parser/myinvestor`) | **F10** (R51) | **no la toca**: el mismo disparo devuelve además los productos |
| El contrato de salida del extracto | F11 + F10 | irrelevante aquí: un producto no es un movimiento |

**Requirements de la F10 que siguen aplicando y NO se repiten aquí:** R2 y R3
(aislamiento del módulo y sin Prisma), R4 (no mover ni modificar el origen), R25 (el
banco sale de la carpeta), R47 (un archivo roto no tumba a los demás), R49 (`ignored[]`),
R55 y R56 (volcado determinista, sin entrada no falla), R58 (sin dependencias nuevas) y
R59 (fixtures sintéticos, sin datos reales).

---

## D. Identidad y formato de los archivos JSON de producto

### R21

El sistema DEBE tratar cada archivo `.json` de la carpeta del banco como la
descripción de **un solo** producto de inversión.

*Verificación:* test con tres archivos de producto en la carpeta → `products` tiene
tres entradas, una por archivo.

### R22

El sistema DEBE tomar el tipo del producto del campo `type` del archivo, aceptando
exactamente los valores `fund`, `etf`, `managed_portfolio` y `deposit`.

*Verificación:* test con un archivo de cada uno de los cuatro tipos → los cuatro se
parsean y conservan su `type`.

### R23

El sistema DEBE tomar la identidad del producto del campo `name` y su fecha del campo
`date`, ambos escritos dentro del archivo.

*Verificación:* test con un archivo llamado `x.json` cuyo `name` es `'Fondo A'` y cuya
`date` es `'2026-08-31'` → el producto parseado lleva ese nombre y esa fecha.

### R24

El sistema NO DEBE deducir el nombre ni la fecha del producto del nombre del archivo.

*Verificación:* test con un archivo llamado `fondo-b-2020-01-01.json` cuyo contenido
declara `name: 'Fondo A'` y `date: '2026-08-31'` → gana el contenido; el nombre del
archivo solo aparece como procedencia (`file`).

### R26

El sistema DEBE exigir que todos los valores numéricos de los archivos de producto sean
**número JSON nativo** (`8440.60`, `-3.47`, `25000`), con el punto como separador
decimal y sin separador de miles, sin símbolo de moneda ni de porcentaje.

*Verificación:* test parametrizado con `8440.60`, `-3.47`, `25000` y `440.60` → los
cuatro se aceptan con ese valor exacto; y comprobación de que el parser de productos
**no importa** `parseAmountText`.

### R27

El sistema DEBE conservar el valor numérico leído tal cual, sin redondearlo, sin
reformatearlo y sin fijarle un número de decimales.

*Verificación:* test con `8440.6`, `8440.65` y `25000` → salen 8440.6, 8440.65 y 25000
(no `8440.60` ni `25000.00`); y test con `8440.655` → sale 8440.655, no 8440.66.

### R28

El sistema DEBE exigir el formato `AAAA-MM-DD` en todos los campos de fecha de los
archivos de producto (`date`, `maturityDate`, `closedAt`).

*Verificación:* test con `'2027-07-04'` → aceptado; con `'04/07/27'`, `'04/07/2027'` y
`'2027-13-01'` → el archivo va a `failed` (R43).

### R29

El sistema DEBE interpretar `interestRate` y `gainPercent` como **porcentaje**, no como
fracción (`4` es 4 %, `2.75` es 2,75 %).

*Verificación:* test que comprueba que `2.75` → `2.75` (y no `0.0275`); la semántica
queda escrita en la plantilla documentada (R60).

### R30

El sistema DEBE aceptar un campo `closedAt` opcional en cualquier producto, con el que
el humano declara la fecha en que ese producto dejó de existir.

*Verificación:* test con un producto con `closedAt: '2027-07-04'` → se conserva; sin
`closedAt` → sale `null`.

### R31

El sistema NO DEBE inferir el cierre de un producto de su ausencia en la carpeta.

*Verificación:* test que parsea dos veces la misma carpeta, la segunda sin uno de los
archivos → ningún producto queda marcado como cerrado y no aparece ninguna entrada
"desaparecido"; el resultado solo contiene los productos presentes.

### R32

El sistema DEBE tratar como **no informado** tanto un campo opcional ausente como un
campo opcional con valor `null`, sin que el archivo falle por ello.

*Verificación:* test con tres variantes del mismo producto (campo ausente, campo a
`null`, campo con valor) → las dos primeras dan el mismo resultado con el campo a
`null`, ninguna falla.

---

## E. Campos por tipo de producto

### R33

CUANDO el archivo declara `type` `fund`, `etf` o `managed_portfolio`, el sistema DEBE
exigir los campos `invested`, `marketValue`, `gain` y `gainPercent`.

*Verificación:* test con los tres tipos y los cuatro campos → parsean; test quitando
uno → el archivo va a `failed` nombrando el campo que falta (R40).

### R34

CUANDO el archivo declara `type` `deposit`, el sistema DEBE exigir los campos
`principal`, `interestRate`, `expectedGain` y `maturityDate`.

*Verificación:* test con un depósito completo → parsea con esos cuatro campos; test
quitando `maturityDate` → `failed` nombrándolo.

### R35

CUANDO el archivo declara `type` `deposit`, el sistema NO DEBE exigir ni emitir campos
de valoración (`invested`, `marketValue`, `gain`, `gainPercent`, `uninvestedCash`).

*Verificación:* test con un depósito sin ningún campo de valoración → parsea, y su
`valuation` sale `null`; test con un depósito que sí los trae → va a `failed` por
claves no admitidas para su tipo (R44).

### R36

El sistema DEBE emitir `uninvestedCash` como dato independiente, sin sumarlo a
`marketValue` ni a ningún total.

*Verificación:* test con `marketValue: 24000.60` y `uninvestedCash: 900.00` → el
resultado devuelve 24000.60 y 900.00 por separado y **no** existe en él ningún campo con
el valor 24900.60.

### R37

El sistema DEBE admitir un **solo** tipo de interés por depósito (`interestRate`, el
que se aplica).

*Verificación:* test con un depósito que declara una segunda TAE (cualquier clave
adicional del estilo `secondInterestRate`) → el archivo va a `failed` por clave
desconocida (R44), y el modelo del resultado tiene un único campo de tipo de interés.

### R38

El sistema DEBE conservar el signo negativo de `gain` y `gainPercent`.

*Verificación:* test con `gain: -1234.56` y `gainPercent: -3.47` → −1234.56 y −3.47
(el signo del número nativo se conserva, no se normaliza a positivo).

### R39

El sistema NO DEBE calcular, corregir ni completar ningún valor a partir de los demás:
emite los valores leídos aunque no cuadren entre ellos.

*Verificación:* test con `invested: 1000`, `marketValue: 1100` y
`gain: 80` (que no cuadra) → el resultado devuelve **80**, no 100; y con un
`gainPercent` que tampoco cuadra → se devuelve el escrito.

---

## F. Reporte de errores de los archivos de producto

> El **aislamiento** (R47) y la lista de **ignorados** (R49) los construye la F10 en el
> servicio; aquí solo se añaden los motivos propios de un archivo de producto.

### R40

SI a un archivo de producto le falta un campo obligatorio de su tipo ENTONCES el
sistema DEBE reportarlo en `failed` con el nombre del archivo y un motivo que nombre
todos los campos obligatorios que faltan.

*Verificación:* test con un archivo sin `invested` y sin `gain` → una entrada en
`failed` cuyo `reason` menciona los dos campos.

### R41

SI un campo numérico de un archivo de producto trae un valor que no es un número JSON
finito (booleano, objeto, lista o un número no representable) ENTONCES el sistema DEBE
reportarlo en `failed` nombrando el campo y el valor recibido.

*Verificación:* test con `marketValue: true` y con `marketValue: []` → `failed` con un
`reason` que contiene `marketValue` y el valor recibido. El caso del **texto** tiene su
propio motivo, más explícito (R77).

### R42

SI el `type` de un archivo de producto no es uno de los cuatro admitidos ENTONCES el
sistema DEBE reportarlo en `failed` listando los cuatro valores admitidos.

*Verificación:* test con `type: "acciones"` → `failed` con un `reason` que contiene
`fund`, `etf`, `managed_portfolio` y `deposit`.

### R43

SI un campo de fecha de un archivo de producto no cumple `AAAA-MM-DD` ENTONCES el
sistema DEBE reportarlo en `failed` nombrando el campo e indicando el formato esperado.

*Verificación:* test con `maturityDate: "04/07/27"` → `failed` con un `reason` que
contiene `maturityDate` y `AAAA-MM-DD`.

### R44

SI un archivo de producto trae claves desconocidas que no empiezan por `_` ENTONCES el
sistema DEBE reportarlo en `failed` nombrándolas.

*Verificación:* test con `markeValue` (errata) → `failed` nombrando la clave
desconocida **y** el campo obligatorio ausente; test con `_nota: "…"` → parsea sin
problema y la clave se ignora.

### R45

SI un archivo `.json` no es sintácticamente válido ENTONCES el sistema DEBE reportarlo
en `failed` con el nombre del archivo y el motivo.

*Verificación:* test con un archivo que contiene `{ "type": "fund",` → `failed` con su
`file` y un `reason` que identifica el problema de sintaxis.

### R46

SI dos archivos de producto de la misma carpeta declaran el mismo `name` y la misma
`date` ENTONCES el sistema DEBE conservar el primero por orden alfabético de nombre de
archivo y reportar el otro en `failed` indicando con qué archivo choca.

*Verificación:* test con `a.json` y `b.json` declarando `('Fondo A', '2026-08-31')` →
`products` tiene el de `a.json`, `failed` tiene `b.json` con un `reason` que menciona
`a.json`.

### R48

El sistema DEBE acumular en un solo motivo **todos** los problemas detectados en el
mismo archivo, en lugar de reportar solo el primero.

*Verificación:* test con un archivo al que le falta un campo, tiene un número ilegible
y una clave desconocida → un único `failed` cuyo `reason` menciona los tres.

### R77

SI un campo numérico de un archivo de producto viene como **texto** (`"8440.60"`,
`"8.440,60"`, `"8.440,60 €"`) ENTONCES el sistema DEBE reportarlo en `failed` nombrando
el campo, el valor recibido y que se espera un número sin comillas, y NO DEBE
interpretar ese texto.

*Verificación:* test parametrizado con `marketValue: "8440.60"`, `"8.440,60"` y
`"8.440,60 €"` → los tres van a `failed` con un `reason` que nombra `marketValue` y el
valor recibido, y en los tres el producto **no** aparece en `products` con el valor
8440.60.

---

## G. Encaminamiento y volcado

### R53

El sistema DEBE volcar el resultado de los productos de cada año en
`var/parsed/myinvestor/<año>/products.json`, **un solo archivo por año**.

*Verificación:* test del servicio que lee ese archivo y comprueba que contiene los
productos, los `failed` y los `ignored` de ese año.

### R76

CUANDO el servicio encuentra un archivo `.json` en la carpeta del banco, el sistema DEBE
encaminarlo al parser de productos, en lugar de reportarlo en `ignored` como hace la F10
mientras ese parser no existe.

*Verificación:* test del servicio con una carpeta que contiene un `.csv` y dos `.json` →
el `.csv` va al parser del extracto, los dos `.json` al de productos, `ignored` no los
menciona, y ninguno pasa por el parser del otro.

---

## H. Documentación y cierre

### R60

El sistema DEBE documentar en `docs/myinvestor-product-files.md` **la referencia del
formato en el repo**: una plantilla por cada tipo de producto, la tabla de campos con su
origen (modelo de la feature 9 / muestra real / propuesto por el agente) y las reglas de
formato de números y fechas. Este documento es **la fuente de verdad del formato**; la
copia que el humano usa cada mes vive en Drive y **no la crea ni la valida el sistema**
(ver `decisions.md` §📌).

*Verificación:* checklist del reviewer contra el archivo nuevo; el contenido literal de
la plantilla está en `design.md` §7.

### R63

El sistema DEBE señalar de forma destacada, en `design.md` §12, qué necesita cambiar la
feature 9 a raíz de los formatos definidos aquí, o afirmar explícitamente que su
esquema no cambia.

*Verificación:* checklist del reviewer sobre `design.md` §12 (existe la sección, dice
explícitamente que el **esquema no cambia** y lista los ajustes de **texto** de la
feature 9).

### R71

El sistema DEBE ampliar en `docs/api-contract.md` la sección del endpoint
`POST /api/parser/myinvestor` que creó la F10, añadiendo el modelo del resultado de los
productos.

*Verificación:* checklist del reviewer contra el diff de `docs/api-contract.md`.

### R72

El sistema DEBE registrar en `docs/architecture.md` un ADR propio con las decisiones de
formato de los archivos de producto y sus alternativas descartadas (borrador en
`design.md` §11), sin reescribir el ADR del extracto.

*Verificación:* checklist del reviewer contra el diff; el número libre se comprueba al
redactar (el ADR-013 es el contrato de la F11 y el ADR-014 el del extracto).

### R73

El sistema DEBE añadir los archivos nuevos del módulo al árbol esperado de
`src/architecture.test.ts`, sin borrar los que puso la F10.

*Verificación:* la suite pasa con las entradas nuevas y falla si se borra uno de los
archivos nuevos.

### R74

El sistema DEBE terminar `bash ./init.sh` con `[OK] Entorno listo`.

*Verificación:* ejecución de `bash ./init.sh` con el contenedor levantado.

### R75

El sistema DEBE dejar el mapa de trazabilidad `R<n>` → test concreto en
`progress/implementations/myinvestor-products.md`.

*Verificación:* revisión del mapa (Nivel 4 de `docs/verification.md`).

---

## Cobertura del `como_se_que_esta_bien`

Los puntos del `intent` que caen de este lado del corte (los del extracto se cubren en
[`../myinvestor-statement/requirements.md`](../myinvestor-statement/requirements.md)):

| # | Frase del `intent` | Requirements que la cubren |
| --- | --- | --- |
| 5 | Un JSON por producto, con campos explícitos, y una plantilla documentada por tipo | **R21, R60** |
| 6 | Una entrada estructurada por producto, con su tipo y su fecha | **R21, R22, R23, R24** |
| 7 | Cada tipo con los campos que le corresponden (los que fluctúan / el depósito) | **R33, R34, R35, R37** |
| 8 | El efectivo sin invertir, aparte del valor de mercado | **R36** |
| 9 | Los campos que solo traen algunos productos se pueden omitir sin que falle | **R32** |
| 10 | Ganancias y porcentajes negativos se interpretan como negativos | **R38** |
| 11 | Un archivo mal escrito se reporta aparte diciendo qué archivo y qué está mal; los demás se parsean igual | **R40-R46, R48, R77** (+ R47 de la F10) |
| 12 | El parser no calcula nada: salen los valores escritos aunque no cuadren | **R39** |
| 13 | El resultado parseado se puede ver en un JSON local | **R53, R76** |
| 14 | Parsear dos veces los mismos archivos da exactamente el mismo resultado | **R55 de la F10**, que este resultado hereda |

De los `que_no_quiero`: **R31** (no inferir cierres) y **R39** (no calcular).

---

## Procedencia

> Clasificación obligatoria de cada `R<n>` (ver `docs/specs.md`). El humano revisa con
> lupa lo `(delegado)` y, **sobre todo**, lo `(añadido)`. Lo `(añadido)` va primero.

### 🟥 AÑADIDO — cosas que el humano NO pidió y que introduce el agente

> **Cinco de las ocho que quedaban vivas tras el corte** caen de este lado (las otras
> tres están en la spec del extracto). Ninguna cambia el modelo de la feature 9.
> ✅ **Las cinco quedaron APROBADAS por el humano el 2026-08-11**, tal cual estaban
> escritas. Se conservan aquí con su razonamiento para que el reviewer siga viendo de
> dónde salió cada una.

- **R23 + R24 (la fecha del depósito es obligatoria) — (añadido).** Para los productos
  que fluctúan, `date` es la fecha de la foto y sale del modelo (`Valuation.date`). Un
  **depósito no tiene fotos** (feature 9 R20), así que su `date` no le hace falta a
  nadie… salvo para dos cosas: es lo que permite detectar el choque de R46 y es lo que
  te dice cuándo transcribiste esas condiciones. Decido **exigirla también en el
  depósito**, con el significado *"fecha en que tomé esta nota"*. **Alternativa:**
  hacerla opcional solo para el depósito (y perder R46 para ese tipo).
  **✅ APROBADA por el humano el 2026-08-11 (🔴 nº 2 de `decisions.md`).** El mismo día
  cerró la **cadencia**: el archivo del depósito se escribe **solo al contratarlo y al
  vencer**, no cada mes, así que esa `date` es literalmente *"el día que escribí esto"*.
  No cambia ningún requirement.
- **R44 (las claves desconocidas son un error, salvo las que empiezan por `_`) —
  (añadido).** El `intent` no dice nada de las claves que sobran. Decido rechazarlas
  porque es lo único que atrapa una **errata silenciosa**: si escribes `uninvestedCash`
  como `uninvestedcash`, sin esta regla el dato se pierde sin decir nada (es un campo
  opcional) y el efectivo desaparece del patrimonio. El coste es que no puedes dejar
  notas sueltas en el archivo; por eso las claves que empiezan por `_` se ignoran a
  propósito y sirven de escape.
  **✅ APROBADA por el humano el 2026-08-11 (🔴 nº 4 de `decisions.md`).**
- **R46 (dos archivos con el mismo producto y fecha: gana el primero alfabético) —
  (añadido).** El `intent` no contempla el caso; tú pediste el reporte de errores y este
  es uno de los que hay que definir. Decido **conservar uno y reportar el otro** (en vez
  de tirar los dos), y que el criterio sea el orden alfabético del nombre de archivo
  para que el resultado sea determinista (R55 de la F10). **Alternativa:** rechazar los
  dos y obligarte a arreglarlo antes de ver nada.
  **✅ APROBADA por el humano el 2026-08-11 (🔴 nº 3 de `decisions.md`).**
- **R48 (un archivo roto reporta TODOS sus problemas de golpe) — (añadido).** El
  `intent` pide "qué archivo y qué está mal". Añado que sea **todo** lo que está mal, no
  el primer problema: si no, arreglas un campo, vuelves a lanzar, y aparece el
  siguiente. **✅ APROBADA por el humano el 2026-08-11.**
- **R53 (los productos se vuelcan a un único `products.json` por año, no un volcado por
  archivo) — (añadido sobre una delegación).** Delegaste "dónde se vuelca el JSON
  local", y el camino que ya existe es un volcado **por archivo**. Para los productos
  eso daría `fondo.json.json`, que es exactamente la confusión origen/volcado que hay
  que evitar, y además el choque de R46 es un hecho **del conjunto**, no de un archivo.
  **✅ APROBADA por el humano el 2026-08-11 (🔴 nº 5 de `decisions.md`).**
> Las cinco de arriba son **todas** las propuestas mías que quedaban vivas de este lado
> del corte (las otras tres están en la spec del extracto). **R26-R29 no está en esta
> lista**: es una delegación tuya resuelta (ver abajo), aunque también sea el 🔴 nº 1 de
> `decisions.md` por su consecuencia práctica.

### Delegado (resuelve algo de `delego_en_agente`)

- **R33-R39, R60 — (delegado #1)** "La propuesta concreta de campos de cada tipo de
  producto… que marque cuáles salen del modelo, cuáles de la muestra y cuáles se ha
  inventado". La propuesta completa, campo a campo y con su origen marcado, está en
  `design.md` §7, y se documenta en `docs/myinvestor-product-files.md` (R60). ✅ **Lista
  CERRADA por el humano el 2026-08-11**, con sus tres últimas casillas (`closedAt` como
  campo del archivo, `currency` opcional que no escribe, y el archivo del depósito solo
  al contratar y al vencer); registro en [`CAMPOS-cerrados.md`](CAMPOS-cerrados.md).
- **R23, R24 — (delegado #2)** "Cómo se nombran los archivos de producto y de dónde sale
  a qué producto y a qué fecha corresponde cada uno". Decido: **la identidad y la fecha
  van dentro del archivo**, y el nombre del archivo es libre (solo se usa para
  reportar). Alternativa descartada y convención de nombre **recomendada, no
  obligatoria**, en `design.md` §5.
- **R76 — (delegado #3)** "Cómo se distingue el extracto de los archivos de producto".
  Decido: **por la extensión** (`.csv` / `.json`). El banco sale de la carpeta (R25, ya
  implementado por la F10). Alternativa descartada (mirar el contenido) en `design.md`
  §5.
- **R26, R27, R28, R29 — (delegado #4, CERRADO POR EL HUMANO el 2026-08-11)** "El
  formato exacto de números y fechas en los JSON que escribo a mano". Propuse números
  **como cadena** en formato español; **el humano lo cambió**: los números van como
  **número JSON nativo** (`8440.60`), sin comillas, sin separador de miles y sin
  símbolos. **Fechas sin cambio: siempre `AAAA-MM-DD`.** Consecuencia directa: esta
  feature **ya no usa `parseAmountText`**. Razonamiento en `design.md` §6.
- **R30, R31 — (delegado #5, CONFIRMADO POR EL HUMANO el 2026-08-11)** "Cómo digo que un
  producto ya no está". Decido: un campo `closedAt` opcional que escribes **una sola
  vez**, y la regla dura de que **dejar de escribir un producto NO lo cierra**.
  Alternativa descartada (`"closed": true`) en `design.md` §8. **El humano lo cerró como
  campo del archivo en los dos tipos**, con lo que la columna `InvestmentProduct.closedAt`
  de la F9 —reservada y sin escritor— **ya tiene quien la escriba** (el futuro importador,
  a partir de este campo).
- **R40-R46, R48 — (delegado #6)** "Cómo se reportan los errores… y qué pasa con el
  resto de archivos cuando uno está roto". Decido la taxonomía completa, con acumulación
  de motivos; el aislamiento por archivo lo aporta la F10 (R47). `design.md` §9.
- **R53 — (delegado #7)** "Dónde se vuelca el JSON local". `design.md` §10.
- **R63 — (delegado #8)** "Si al definir los formatos aparece algo que obliga a cambiar
  el modelo de la feature 9, que lo diga de forma destacada". `design.md` §12 lo dice:
  **el esquema no cambia**.

### Humano (trazable a una frase del `intent`)

- **R21, R22 — (humano)** "Un archivo JSON por producto… con los campos explícitos que
  ese tipo de producto necesita" + "obtengo una entrada estructurada por producto, con
  su tipo y su fecha". Los cuatro tipos salen de "fondos, un ETF, una cartera
  automatizada y depósitos".
- **R33, R34 — (humano)** "Cada tipo de producto se lee con los campos que le
  corresponden: los que fluctúan con su valor de mercado, ganancia, tanto por ciento e
  invertido, y el depósito con su importe, su TAE, sus intereses y su vencimiento".
- **R36 — (humano)** "El efectivo sin invertir se guarda como un dato aparte del valor
  de mercado, no sumado dentro de él" + tu confirmación con la web delante.
- **R37 — (humano)** `que_no_quiero`: "no guardar la TAE que no se me aplica".
- **R32 — (humano)** "Los campos que solo traen algunos productos se pueden omitir sin
  que el parseo falle".
- **R38 — (humano)** "Las ganancias y los porcentajes negativos se interpretan como
  negativos cuando estoy perdiendo".
- **R39 — (humano)** "El parser no calcula nada: los valores que yo escriba son los que
  salen, aunque no cuadren entre ellos".
- **R77 — (humano, 2026-08-11)** Sale del cierre del 🔴 nº 1: *"que un valor llegue como
  texto debe caer en la lista de fallos con un motivo claro, no interpretarse por si
  acaso"*. Es el caso de error que aparece al cambiar a número JSON nativo, y encaja en
  la frase 11 del `intent` ("un archivo mal escrito se reporta aparte").
- **R40, R41, R42, R43, R45 — (humano)** "Si un archivo está mal escrito… no se pierde
  en silencio: se reporta aparte diciendo qué archivo y qué está mal, y los demás
  archivos se parsean igual".
- **R71, R72, R73, R74, R75 — (humano)** Cierre estándar del proyecto: `acceptance`,
  `docs/verification.md` (Nivel 4 obligatorio por ser `sdd: true`) y
  `docs/architecture.md`.
