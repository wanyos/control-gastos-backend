# Requirements — Feature 9: investments-data-model

> Derivados del bloque `intent` de la feature 9 en `feature_list.json` (**fuente de
> verdad del QUÉ**) y del plan aprobado por el humano
> (`~/.claude/plans/ya-tenemos-la-estructura-valiant-noodle.md`), que fija el
> esquema y el razonamiento. Donde el `acceptance` y el `intent` difieran, manda el
> `intent`. Aplican los Principios 1-5 y **ADR-011** de `docs/architecture.md`, y
> `docs/conventions.md` (dominio en inglés, prosa en español). Notación EARS
> estricta (ver `docs/specs.md`).
>
> **Alcance: solo esquema + migración.** Exactamente el mismo alcance que la
> feature 8 tuvo con el flujo. **Sin endpoints, sin parser, sin importador y sin
> servicio.** La capa de inversiones no expone superficie HTTP; el único archivo
> del módulo es su test.
>
> **Todo es aditivo.** La única línea que toca el núcleo del flujo es
> `Movement.productId` (columna reservada, nullable, sin escritor). Ningún campo,
> índice o enum existente se modifica, y ningún servicio del flujo se toca.
>
> 📄 **Contexto de la feature siguiente:** los movimientos de la cuenta corriente
> seguirán llegando como el `.xlsx` de Bankinter, pero los productos de inversión
> vendrán en un **fichero de texto escrito a mano** por el humano. Consecuencia de
> diseño: **el fichero se hace a medida del modelo, no al revés** — no hay que
> defenderse de lo que un banco decida imprimir, y eso es lo que permite casi todas
> las simplificaciones de este spec.
>
> 🔗 **Reconciliado con la antigua feature 10 `myinvestor-parser`**, que ya definió
> ese formato —JSON por producto, plantillas en `docs/myinvestor-product-files.md`— y
> que desde el 2026-08-11 está **partida en dos**: ese formato es hoy
> [`specs/myinvestor-products/`](../myinvestor-products/requirements.md) (el extracto
> `.csv`, que este esquema no toca, es
> [`specs/myinvestor-statement/`](../myinvestor-statement/requirements.md)).
> **Se revisaba en la misma puerta que esta.**
> Resultado, con el detalle en
> [`myinvestor-products/design.md` §12](../myinvestor-products/design.md): **el esquema
> Prisma de este spec NO cambia — ni una columna, ni un tipo, ni un índice, ni una precisión**. Los cuatro
> tipos, las columnas del depósito, las cinco de la valoración y las dos claves
> naturales cubren todo lo que ese formato puede expresar.
>
> 🧾 **Y hay muestras reales del banco** (`var/drive-read/myinvestor/2026/`,
> gitignoreadas), que confirman el modelo aritméticamente y **cierran cuatro de los
> seis puntos abiertos**: `marketValue` / `uninvestedCash` (nº 1), `interestRate` como
> TAE en porcentaje (nº 2), el escritor de `closedAt` (nº 3) y la obligatoriedad de
> `gain`/`gainPercent` (nº 5). Los cuatro tienen su bloque ✅ en la Procedencia.
>
> ⏸️ **Esta feature es SDD: para en `spec_ready` y espera la aprobación humana.**
> La sección de **Procedencia** (al final) marca lo `(delegado)` y lo `(añadido)`
> que el humano revisa con lupa en la puerta. De los seis puntos abiertos iniciales
> **quedan vivos dos**: el depósito sin valoraciones (regla de servicio frente a
> `CHECK`) y el techo `Decimal(10,2)`.

## Decisiones delegadas que este spec resuelve (detalle y alternativas en `design.md`)

El `intent` cedió cinco decisiones al agente (`delego_en_agente`). Se resuelven
aquí y se marcan `(delegado)` en Procedencia:

1. **Materialización en Prisma/Postgres** — nombres en inglés, enum de tipos de
   producto, precisión decimal de cada importe y de los porcentajes, e índices.
   `design.md` §2, §5, §6. Requirements: **R1-R9, R14, R16, R23**.
2. **Clave natural del producto y de la foto, y qué pasa al recargar el mismo
   fichero** (que no duplique y que gane el último). `design.md` §3, §4.
   Requirements: **R6, R14, R15**.
3. **Cómo se vigila que un depósito no tenga valoraciones** (regla del servicio o
   restricción de BD). `design.md` §8. Requirement: **R20**.
4. **Si `marketValue` ya incluye el dinero sin invertir o van aparte** — la
   suposición queda planteada de forma visible para que el humano la confirme.
   `design.md` §9. Requirement: **R21**.
5. **Dónde y cómo se documenta todo esto** (`docs/data-model.md`, el ADR en
   `docs/architecture.md`, la nota en `docs/api-contract.md`). `design.md` §13.
   Requirements: **R25, R26, R27**.

---

## Esquema del producto de inversión

### R1

El sistema DEBE definir un **único** modelo `InvestmentProduct` con los datos
comunes a todo producto: `id`, `bank` (String, obligatorio; slug de la carpeta de
Drive, mismo criterio que `Account.bank`), `name` (String, obligatorio), `type`
(`InvestmentProductType`, obligatorio), `currency` (String, def. `'EUR'`),
`openedAt` (`DateTime?` `@db.Date`), `closedAt` (`DateTime?` `@db.Date`),
`createdAt` y `updatedAt`; y **NO DEBE** existir una tabla por tipo de producto.

*Verificación:* test de integración que crea un `InvestmentProduct` con todos esos
campos y los recupera; el reviewer comprueba sobre `prisma/schema.prisma` que no
hay ningún modelo `Fund`, `Etf`, `Deposit` ni equivalente.

### R2

El sistema DEBE definir el enum `InvestmentProductType` con **exactamente** los
cuatro valores `fund`, `etf`, `managed_portfolio` y `deposit`.

*Verificación:* test que da de alta un producto de cada uno de los cuatro valores y
comprueba que el cliente Prisma los acepta; test que afirma que el enum generado
tiene esos cuatro valores y no más.

### R3

El sistema DEBE admitir **exactamente los mismos campos** para `fund`, `etf` y
`managed_portfolio`, y **NO DEBE** ofrecer ningún mecanismo de desglose de una
cartera automatizada en los productos que lleva dentro (ni autorreferencia
`parentId`, ni tabla de composición, ni relación producto-producto).

*Verificación:* test que crea un `fund`, un `etf` y un `managed_portfolio` con el
mismo conjunto de campos y los recupera idénticos salvo el `type`; el reviewer
comprueba que `InvestmentProduct` no tiene ninguna relación consigo mismo.

### R4

El sistema DEBE definir en la **misma** tabla `InvestmentProduct` las cuatro
columnas propias del depósito, todas **nullable**: `principal`
(`Decimal(10,2)?`), `interestRate` (`Decimal(6,4)?`), `expectedGain`
(`Decimal(10,2)?`) y `maturityDate` (`DateTime?` `@db.Date`); un producto de tipo
`fund`, `etf` o `managed_portfolio` DEBE poder guardarse con las cuatro a `NULL`.

*Verificación:* test que crea un `deposit` con las cuatro columnas rellenas y las
recupera idénticas, y un `fund` con las cuatro a `NULL` y comprueba que se
guardan como `null`.

### R5

El sistema DEBE almacenar `InvestmentProduct.interestRate` como `Decimal(6,4)` con
la semántica **TAE expresada en porcentaje** (`2.7500` = 2,75 %), **no** como
fracción, y DEBE devolverlo sin pérdida de precisión.

*Verificación:* test que guarda `interestRate = '2.7500'` y comprueba que se
recupera como `2.7500` (comparado con `.toFixed(4)`); la semántica queda escrita en
`docs/data-model.md` y en el comentario del schema (R25).

### R6

El sistema DEBE imponer una **clave natural única** `(bank, name)` sobre
`InvestmentProduct`, de modo que dos productos con el mismo nombre en el mismo
banco no puedan coexistir y el mismo nombre en otro banco sí.

*Verificación:* test de integración: alta duplicada de `(bank, name)` → falla con
`P2002`; el mismo `name` bajo otro `bank` → se guarda.

### R7

El sistema DEBE representar el ciclo de vida de un producto **solo** con
`closedAt` (`NULL` = vivo), y **NO DEBE** definir un enum `status` ni un booleano
`isClosed` derivable de esa fecha.

*Verificación:* test que crea un producto con `closedAt = null` y otro con fecha, y
los recupera; el reviewer comprueba sobre el schema que no existe ningún enum de
estado ni columna booleana de cierre para `InvestmentProduct`.

> ✅ **Esta columna ya tiene escritor (feature 10).** El fichero de inversiones lleva
> un campo `closedAt` **opcional** que el humano escribe **una sola vez**, en la
> última aparición del producto, y su regla es explícita: **dejar de escribir un
> producto NO lo cierra**, porque un olvido de un mes con prisa sería indistinguible
> de un cierre y hundiría el patrimonio sin motivo. El importador **no infiere nada
> de las ausencias** ([`myinvestor-products/design.md`](../myinvestor-products/design.md)
> §8 y §12). Esto
> **cierra** el que era el punto abierto nº 3 de este spec.

---

## Valoración periódica (la foto)

### R8

El sistema DEBE definir un modelo `Valuation` con `id`, `productId` (FK obligatoria
a `InvestmentProduct`), `date` (`DateTime` `@db.Date`), `invested`
(`Decimal(10,2)`, obligatorio), `marketValue` (`Decimal(10,2)`, obligatorio),
`gain` (`Decimal(10,2)?`), `gainPercent` (`Decimal(7,4)?`), `uninvestedCash`
(`Decimal(10,2)?`), `createdAt` y `updatedAt`.

*Verificación:* test de integración que persiste una `Valuation` con todos los
campos y los recupera con su precisión exacta (`invested`, `marketValue`,
`uninvestedCash` con `.toFixed(2)`; `gainPercent` con `.toFixed(4)`).

### R9

El sistema DEBE guardar el capital invertido (`invested`) **en `Valuation`** y
**NO DEBE** definir ninguna columna de capital invertido en `InvestmentProduct`
(el capital de un fondo crece con las aportaciones mensuales: es un dato de la
fecha, no del producto).

*Verificación:* el reviewer comprueba sobre `prisma/schema.prisma` que
`InvestmentProduct` no tiene `invested`; el test de la serie (R10) demuestra que el
dato vive por fecha.

### R10

CUANDO se guardan tres valoraciones del mismo producto en tres fechas distintas con
`invested` creciente, el sistema DEBE conservar las **tres** filas, cada una con su
propio `invested` y su propio `marketValue`, y devolverlas ordenadas por `date`.

*Verificación:* test de integración que crea tres `Valuation` del mismo `fund`
(p. ej. `2026-03-31` invested `12000.00`, `2026-04-30` invested `12300.00`,
`2026-05-31` invested `12600.00`), las lee con `orderBy: { date: 'asc' }` y
comprueba que hay tres y que ninguna pisó a la anterior.

### R11

El sistema DEBE admitir valores **negativos** en `Valuation.gain` y
`Valuation.gainPercent` y devolverlos idénticos a como se guardaron.

*Verificación:* test que guarda `gain = '-1234.56'` y `gainPercent = '-3.4700'` y
los recupera comparando con `.toFixed(2)` y `.toFixed(4)` respectivamente.

### R12

El sistema DEBE admitir `Valuation.uninvestedCash` **ausente**, guardándolo como
`NULL`, y DEBE conservar su valor cuando sí viene.

*Verificación:* test que crea una `Valuation` sin `uninvestedCash` → se recupera
`null`; y otra con `uninvestedCash = '250.00'` → se recupera `250.00`.

### R13

El sistema **NO DEBE** persistir en `gain` ni en `gainPercent` ningún valor
calculado a partir de `marketValue` e `invested`: guarda el valor tal como se le
entrega, y un campo que la fuente no traiga se persiste como `NULL` (**regla 4** del
modelo).

*Verificación:* test que guarda una `Valuation` cuyo `gain` **no** cuadra con
`marketValue − invested` (p. ej. `invested 12000.00`, `marketValue 12500.00`,
`gain '480.00'`) y comprueba que se recupera **`480.00`**, no `500.00`; y otra sin
`gain` que se recupera `null` en vez de un valor derivado.

### R14

El sistema DEBE imponer una restricción **única** `(productId, date)` sobre
`Valuation`, de modo que un producto no pueda tener dos fotos de la misma fecha, y
sí pueda haber dos productos distintos con foto de la misma fecha.

*Verificación:* test de integración: segunda `Valuation` con el mismo
`(productId, date)` → falla con `P2002`; misma `date` en otro producto → se guarda.

### R15

CUANDO se vuelve a cargar la valoración de un producto en una fecha que ya existe,
el sistema DEBE **sobrescribir** la fila existente (`upsert` sobre
`(productId, date)`: gana el último dato cargado, `updatedAt` avanza) y **NO DEBE**
crear una fila nueva.

*Verificación:* test de integración que hace `upsert` sobre `(productId, date)`
cambiando `marketValue`: el `id` es el mismo, `marketValue` es el nuevo, el
`count` de valoraciones del producto sigue siendo 1 y `updatedAt` es posterior al
de la primera escritura.

---

## Enlace con el modelo del flujo

### R16

El sistema DEBE añadir a `Movement` la columna **nullable** `productId` (`Int?`)
con su relación `product` a `InvestmentProduct` y su índice `@@index([productId])`,
como **columna reservada sin escritor** en esta feature.

*Verificación:* test de integración que persiste con Prisma un `Movement` con
`productId` apuntando a un producto y lo recupera con `include: { product: true }`
enlazado; y otro `Movement` creado por el camino existente (sin `productId`) que se
recupera con `productId = null`.

### R17

El sistema **NO DEBE** modificar ningún campo, índice, enum ni tabla existente del
modelo del flujo (`Account`, `Category`, `Movement`) más allá de la adición de
`Movement.productId`, su clave foránea y su índice.

*Verificación:* el reviewer comprueba el diff de `prisma/schema.prisma` y el
`migration.sql` generado (solo `CREATE TYPE`, `CREATE TABLE`, `ALTER TABLE
"Movement" ADD COLUMN "productId"`, `CREATE INDEX` y `ADD CONSTRAINT`; ningún
`DROP`, ningún `ALTER COLUMN` sobre columnas del flujo); la suite completa del flujo
(`accounts`, `categories`, `movements`) pasa **sin cambios** en sus archivos de test.

### R18

El sistema DEBE documentar en `docs/data-model.md` la **regla 5** del modelo (una
aportación no se crea, se marca): la aportación mensual ya es un `Movement` del
extracto, lo único propio es `Movement.productId`, y **un movimiento con
`productId != null` no cuenta como gasto ni como ingreso en los totales globales**;
un reembolso es `income` + `productId`, sin columna nueva.

*Verificación:* checklist del reviewer contra el diff de `docs/data-model.md`.
Requirement de proceso (esta feature no implementa la regla; ver R19).

### R19

El sistema **NO DEBE** modificar `computeTotals`, `computeAccountBalance` ni
ningún otro servicio del flujo en esta feature: la regla 5 queda **documentada y
sin implementar** hasta que exista un escritor de `Movement.productId`.

*Verificación:* checklist del reviewer sobre el diff (`src/modules/accounts/`,
`src/modules/categories/` y `src/modules/movements/` sin cambios); la suite del
flujo sigue en verde con los mismos resultados.

---

## Reglas y suposiciones que esta feature deja marcadas

### R20

El sistema DEBE tratar "un depósito no tiene valoraciones" como **regla de negocio
vigilada por el servicio** —documentada en `docs/data-model.md` junto al resto de
reglas de negocio— y **NO DEBE** imponerla con una restricción `CHECK` en la base de
datos (mantener el **cero SQL crudo** de R23 prevalece).

*Verificación:* test de integración que persiste una `Valuation` sobre un producto
`deposit` y comprueba que **hoy la BD no lo impide** (documenta el límite conocido y
falla si alguien añade un `CHECK` en silencio); el reviewer comprueba que la regla
está escrita en `docs/data-model.md` y que la migración no contiene ningún `CHECK`.

### R21

El sistema DEBE documentar de forma visible, en `docs/data-model.md` y en el ADR, que
`Valuation.marketValue` **no** incluye `Valuation.uninvestedCash` y que el patrimonio
de un producto a una fecha se calcula como `marketValue + uninvestedCash`.

*Verificación:* checklist del reviewer contra el diff de `docs/data-model.md` y
`docs/architecture.md`. Requirement de proceso.

> ✅ **Era el punto abierto nº 1 y está CERRADO: la suposición era CORRECTA.** Lo
> confirmó el humano con la web del banco delante —*"el efectivo queda fuera de
> cualquier total, eso siempre se queda como remanente; normalmente hago un ingreso de
> ‹cantidad redactada› mensuales y una vez invertido ese dinero o una cantidad similar
> se queda como
> dinero metálico fuera del resto de cantidades"*— y lo **prueba la aritmética de la
> muestra real** (`var/drive-read/myinvestor/2026/indi.txt`): en la cartera,
> `invertido 8.250,45 + ganancia 1.250,15 = 9.500,60`, que es **exactamente** el
> valor de mercado; el efectivo de `75,25 €` queda fuera. El fondo cuadra igual
> (`2.000,00 + 150,00 = 2.150,00`). Las cifras son **inventadas** desde la F14
> (2026-08-12); la relación que demuestran es la observada. Por tanto **no hay doble
> conteo** y el patrimonio
> de un producto es `marketValue + uninvestedCash`. Este requirement deja de describir
> una suposición y pasa a describir un **hecho verificado**.

---

## Migración

### R22

CUANDO se aplica la migración de esta feature sobre una base de datos limpia, el
sistema DEBE crear el enum `InvestmentProductType`, las tablas `InvestmentProduct` y
`Valuation`, la columna `Movement.productId` y sus índices **sin error**.

*Verificación:* `pnpm run prisma:migrate` sobre la BD de `docker-compose` termina
sin error; la suite de integración completa (que corre contra ese Postgres real)
pasa al 100 % con las tablas nuevas.

### R23

El sistema DEBE declarar **todos** los índices y restricciones de esta feature en
`prisma/schema.prisma` (`@@unique([bank, name])`, `@@unique([productId, date])`,
`@@index([productId])`) y la migración **NO DEBE** contener ni una línea de SQL
escrita a mano.

*Verificación:* el reviewer comprueba que el `migration.sql` se generó con
`pnpm exec prisma migrate dev --name investments` y no tiene bloques añadidos
manualmente; una ejecución posterior de `prisma migrate dev` **no** reporta drift.

---

## Alcance: sin superficie HTTP

### R24

Esta feature **NO DEBE** añadir ningún endpoint, parser ni importador: al cerrarla, el
módulo `src/modules/investments/` DEBE contener **únicamente**
`investments.model.test.ts` (sin `*.routes.ts`, `*.service.ts`, `*.parser.ts`,
`*.schema.ts` ni `*.types.ts`) y `src/app.ts` NO DEBE registrar ninguna ruta nueva.

*Verificación:* **requirement de proceso** — checklist del reviewer sobre el diff de
**esta** feature: el módulo solo gana su archivo de test y `src/app.ts` queda sin
cambios.

> 🔴 **Por qué la verificación NO es un test ejecutable (y no es un descuido).** La
> versión anterior de este requirement se verificaba con un guardián en
> `src/architecture.test.ts` que afirmaba que `readdirSync('modules/investments')` era
> exactamente `['investments.test.ts']`. **Ese guardián no debe escribirse**, y la
> razón es más de fondo que la que figuraba antes aquí: `src/modules/investments/` es
> un módulo **diseñado para crecer**. La feature de **importación** —posterior a esta y
> a la 10— pondrá ahí su servicio (el que enlaza productos, escribe `Valuation` y
> rellena `Movement.productId`), y más adelante llegarán las rutas de consulta de
> patrimonio. Un test que afirme "este módulo tiene **exactamente** un archivo" es
> **incorrecto por construcción** en un módulo así: no describe un invariante de
> arquitectura, sino una foto de un instante, y su única consecuencia real sería
> obligar a borrarlo en la feature siguiente. Lo que R24 realmente afirma —el
> **alcance de esta feature**— se verifica sobre el **diff**, que es donde el alcance
> de una feature es observable. Lo que sí se queda es la entrada **aditiva** en el
> árbol esperado de `src/architecture.test.ts` (T12): esa lista comprueba que un
> archivo **existe**, no que sea el único, así que crece sin romperse.
>
> 📌 **Nota de reconciliación:** una versión intermedia de este spec justificaba lo
> anterior diciendo que la feature 10 aterrizaría seis archivos en esta misma carpeta.
> **Eso ya no es cierto** y no debe citarse: el parser de MyInvestor vive en
> `src/modules/myinvestor/` (norma «un parser por banco»,
> [`myinvestor-statement/design.md` §2](../myinvestor-statement/design.md)), una carpeta
> **disjunta** de esta. La
> decisión no cambia; cambia su porqué.

---

## Documentación y cierre estándar

### R25

El sistema DEBE actualizar `docs/data-model.md`: retitularlo a `# Modelo de datos`
con `## Parte 1 — Flujo` (contenido intacto) y `## Parte 2 — Inversiones`; ampliar
la sección de reglas a **cinco** (añadiendo la regla 4 —la valoración se lee, no se
calcula— y la regla 5 —una aportación no se crea, se marca—); documentar el esquema
nuevo, la clave natural, la resolución por UPSERT, la regla de negocio del depósito
(R20) y la suposición de R21; añadir `Movement.productId` e
`InvestmentProduct.closedAt` a la tabla de columnas reservadas; y **reescribir** la
sección «Lo que NO está aquí (fase siguiente)», que esta feature deja obsoleta.

*Verificación:* checklist del reviewer contra el diff de `docs/data-model.md`.
Requirement de proceso.

### R26

El sistema DEBE registrar en `docs/architecture.md` el **ADR-012** con las
decisiones delegadas (materialización en Prisma con su precisión decimal e índices,
claves naturales, resolución del recargado, vigilancia del depósito sin
valoraciones, suposición sobre `marketValue`/`uninvestedCash`) y sus alternativas
descartadas, y DEBE añadir `modules/investments/` al árbol de la sección
«Estructura de carpetas».

*Verificación:* checklist del reviewer contra el diff de `docs/architecture.md`
(borrador del ADR en `design.md` §12). Requirement de proceso.

### R27

El sistema DEBE anotar en `docs/api-contract.md` que la capa de inversiones **no
expone endpoints todavía** (los modelos existen en la base de datos pero ninguna
ruta los sirve), sin añadir ningún endpoint al contrato.

*Verificación:* checklist del reviewer contra el diff de `docs/api-contract.md`.
Requirement de proceso.

### R28

El sistema DEBE terminar `bash ./init.sh` con `[OK] Entorno listo` (typecheck +
suite completa + validación de `feature_list.json`) y DEBE dejar el mapa de
trazabilidad `R<n>` → test concreto en
`progress/implementations/investments-data-model.md`.

*Verificación:* `bash ./init.sh` verde con el contenedor levantado + revisión del
mapa de trazabilidad (Nivel 4 de `docs/verification.md`).

---

## Cobertura del `como_se_que_esta_bien` (regla dura de `docs/specs.md`)

| # | Frase del `intent` | Requirements que la cubren |
| --- | --- | --- |
| 1 | Alta de fondo, ETF y cartera con los mismos datos; depósito con sus condiciones propias, vacías en los otros tres | **R1, R2, R3, R4, R5** |
| 2 | Foto de un fondo con invertido, valor de mercado, ganancia, porcentaje y dinero sin invertir tal cual, recuperados idénticos incluidos los negativos | **R8, R11, R13** |
| 3 | Tres fotos del mismo fondo en tres meses con el invertido creciendo, sin pisarse | **R9, R10** |
| 4 | Un producto sin dinero sin invertir se guarda sin ese dato; otro lo conserva | **R12** |
| 5 | Recargar el mismo archivo no duplica: la foto es única y gana el último dato | **R14, R15** |
| 6 | Un movimiento puede quedar enlazado a su producto y se recupera enlazado | **R16** |
| 7 | La migración sobre base limpia crea las tablas sin error y el flujo sigue igual | **R17, R19, R22, R23** |

---

## Procedencia

> Clasificación obligatoria de cada `R<n>` (ver `docs/specs.md`). El humano revisa
> con lupa lo `(delegado)` y, **sobre todo**, lo `(añadido)`.

### 🟥 AÑADIDO — revisar en la puerta de aprobación

> De los **seis puntos abiertos** iniciales **siguen vivos dos** (los dos primeros de
> esta lista); los **cuatro** que la feature 10 y las muestras reales contestaron
> tienen su propio bloque ✅ justo debajo. **Ninguno de los dos que quedan puede dar un
> número equivocado**: el que podía (`marketValue` / `uninvestedCash`) está cerrado y
> confirmado.

- **R20 (🔴 PUNTO ABIERTO Nº 4 — un depósito no debe tener valoraciones: regla del
  SERVICIO, la BD no lo
  impide) — (delegado, con la elección marcada)** El humano delegó la elección
  ("como regla del servicio o como restricción en la base de datos. Que proponga
  cuál y por qué"). Elijo **regla del servicio**, igual que las demás reglas de
  negocio del proyecto (`docs/data-model.md:186`: importe positivo, `type`
  inmutable, un solo nivel de categoría). **Alternativa si prefieres que lo impida la
  BD:** un `CHECK` en SQL crudo dentro de la migración — que **rompería el "cero SQL
  crudo"** de R23, que es justamente el punto fuerte de esta feature frente a la 8.
  Coste asumido de mi elección: hoy **nada** impide insertar una valoración sobre un
  depósito (el test de R20 lo deja escrito como límite conocido, no como bug).
  **← REVISAR EN APROBACIÓN.**
- **R4/R8 (🔴 PUNTO ABIERTO Nº 6 — techo `Decimal(10,2)` ≈ 100 M € y
  `gainPercent Decimal(7,4)`) —
  (delegado, con el valor concreto añadido)** El `intent` delega "la precisión
  decimal de cada importe y de los porcentajes". **Heredo el `Decimal(10,2)` del
  flujo** (ya era el punto abierto nº 2 de `docs/data-model.md`) para que las dos
  capas cuadren, y elijo `Decimal(7,4)` para `gainPercent` (hasta ±999,9999 %) y
  `Decimal(6,4)` para `interestRate` (hasta 99,9999 %). Si el techo se sube, **hay
  que subirlo en las dos capas a la vez**. **← REVISAR EN APROBACIÓN.**
- **R19 (la regla 5 se DOCUMENTA pero NO se implementa en `computeTotals`) —
  (añadido)** Divergencia consciente con cómo la feature 8 trató `transferId`: allí
  la columna nació sin escritor **pero** `computeTotals` ya la excluía. Aquí el plan
  congela los servicios del flujo ("solo esquema + migración"), así que la exclusión
  de `productId` de los totales se implementará junto al escritor de la columna.
  Efecto práctico: **cero**, porque hoy `productId` es siempre `null`. Si prefieres
  la simetría con `transferId`, es una línea en `computeTotals` más su test.
  **← REVISAR EN APROBACIÓN.**
- **R6 (clave natural `(bank, name)`, sin `isin` y sin segunda clave compuesta) —
  (delegado, con el matiz añadido)** El humano delegó "la clave natural que
  identifica un producto entre cargas del archivo". Elijo `(bank, name)` y **cae el
  `isin`**: servía para identificar un fondo si el banco lo renombraba, y **el
  nombre lo escribes tú en un fichero hecho a mano**, luego es estable. También cae
  la segunda clave `(bank, name, maturityDate)` para depósitos: dos depósitos los
  distingues tú al nombrarlos. **Consecuencia que debes conocer:** si un día
  renombras un producto en el fichero, el importador creará un producto **nuevo** y
  la serie anterior quedará colgando del nombre viejo. **← REVISAR EN APROBACIÓN.**
- **R15 (recargar = UPSERT, gana el último) — (delegado, con el matiz añadido)** El
  humano lo pidió casi literal ("que no duplique y que gane el último"), así que la
  regla es suya; lo `(añadido)` mío es dejar escrito que **es una resolución de
  conflicto DISTINTA a la del flujo**: en `Movement` un duplicado se **descarta**
  (índice de dedup, ADR-011), en `Valuation` un duplicado **sobrescribe**. Lo dejo
  explícito para que el futuro importador no invente una tercera. **← REVISAR EN
  APROBACIÓN.**
- **R1 (`bank` como String suelto, sin FK ni catálogo) — (añadido)** El `intent`
  habla de "un solo banco de inversión" y no dice cómo se identifica. Decido un
  **String con el slug de la carpeta de Drive**, exactamente el mismo criterio que
  `Account.bank` (que tampoco es FK). No creo tabla de bancos: el registro de bancos
  vive en Drive (ADR-008) y duplicarlo en BD sería una segunda fuente de verdad.
  **← REVISAR EN APROBACIÓN.**
- **R24 (módulo con un único archivo, `investments.model.test.ts`, y verificado por
  el reviewer y no por un test) — (añadido)** El `intent` dice "nada de endpoints, ni
  parser, ni importador", pero no dice dónde vive el test. Decido
  `src/modules/investments/investments.model.test.ts` como **único** archivo que esta
  feature pone en el módulo (sin `routes`/`service`/`schema`/`types`), con precedente
  de carpeta parcial en `src/modules/health/`. **Dos decisiones mías dentro de esta:**
  (a) **no escribir** el guardián `readdirSync(...) === [un archivo]` —
  `src/modules/investments/` está **diseñado para crecer** (el servicio del importador
  y, más adelante, las rutas de patrimonio), así que ese test sería incorrecto por
  construcción; el alcance se verifica sobre el diff (razón completa en el propio
  R24); y (b) el sufijo **`.model.`** en el nombre, para que dentro de un año se
  distinga de los `investments.service.test.ts` / `investments.routes.test.ts` que
  vendrán. **← REVISAR EN APROBACIÓN.**
- **R13 (cómo se verifica la regla 4) — (añadido)** La regla la pidió el humano
  ("no calcular la ganancia ni el tanto por ciento restando o dividiendo"). Lo mío
  es **cómo se convierte en test**: guardar deliberadamente un `gain` que **no**
  cuadra con `marketValue − invested` y exigir que se devuelva el guardado. Es la
  única forma de que un test distinga "se guardó lo leído" de "se guardó lo
  calculado". **← REVISAR EN APROBACIÓN.**

### ✅ Puntos abiertos ya CONTESTADOS (el parser de MyInvestor + muestras reales)

> Siguen siendo decisiones `(añadido)`/`(delegado)` mías —el humano las mira— pero
> **ya no son preguntas sin respuesta**: los formatos definidos en
> [`specs/myinvestor-products/`](../myinvestor-products/requirements.md) y las
> **muestras reales del banco**
> (`var/drive-read/myinvestor/2026/`) las cierran. **Ninguna cambia el esquema.**

- **R21 (era el punto abierto nº 1 — ¿`marketValue` incluye `uninvestedCash`?) — ✅
  CONTESTADO, Y MI SUPOSICIÓN ERA CORRECTA.** Era el único punto de este spec capaz de
  producir un **patrimonio neto equivocado**. **Van aparte.** El humano lo confirmó con
  la web del banco delante: *"el efectivo queda fuera de cualquier total, eso siempre
  se queda como remanente; normalmente hago un ingreso de ‹cantidad redactada› mensuales y una vez
  invertido ese dinero o una cantidad similar se queda como dinero metálico fuera del
  resto de cantidades"*. Y la **muestra real lo demuestra aritméticamente**: en la
  cartera (`indi.txt`), `8.250,45 + 1.250,15 = 9.500,60`, **exactamente** el valor de
  mercado, con los `75,25 €` de efectivo fuera; el fondo (`fondo.txt`) cuadra igual
  (`2.000,00 + 150,00 = 2.150,00`). **Patrimonio de un producto =
  `marketValue + uninvestedCash`**, sin doble conteo. Recogido en R21 y en el ADR-012.
- **R5 (era el punto abierto nº 2 — `interestRate` = TAE en PORCENTAJE) — ✅
  CONTESTADO.** El `intent` decía "tanto por ciento ofrecido" sin fijar la unidad; yo
  decidí **porcentaje** (`1.5000` = 1,5 %), no fracción (`0.015`). La feature 10 lo fija
  igual (`"interestRate": 1.5` es una TAE del 1,5 %) y la muestra real del depósito
  (`deposito.txt`) lo confirma con un matiz que **no cambia el esquema**: la ficha trae
  **dos** TAE —`1 % TAE sin Premium` y `2 % TAE con Premium`, con sus dos intereses
  brutos (`25,00 €` / `50,00 €`; forma real, **cifras inventadas**)— y el humano decidió
  guardar **solo la que se le
  aplica** (2 %, `expectedGain` 50,00 €), porque la otra describe un producto que él no
  tiene: es información comercial, no una condición de su depósito. El modelo ya tiene
  **exactamente un** `interestRate` y **un** `expectedGain`, así que encaja tal cual;
  la TAE no aplicable **no se guarda en ninguna parte**.
- **R7 (era el punto abierto nº 3 — quién escribe `closedAt`) — ✅ CONTESTADO.**
  Decidí `closedAt` nullable en vez de un enum `status` (un booleano derivable
  duplicado acaba desincronizado) y dejé abierto **quién lo escribe**, temiendo que
  hubiera que inferirlo de la ausencia de un producto en el fichero. **La feature 10
  le da escritor:** el fichero lleva un campo `closedAt` **opcional** que tú escribes
  **una sola vez**, en la última aparición del producto (el mes en que vence o se
  reembolsa), y su regla es explícita y mejor que mi temor: **dejar de escribir un
  producto NO lo cierra**. Un olvido de un mes con prisa sería indistinguible de un
  cierre y hundiría el patrimonio sin motivo; convertir una **ausencia** en un
  **hecho** es exactamente la inferencia que no debe hacer un sistema con dinero
  dentro. El importador **no infiere nada de las ausencias**
  ([`myinvestor-products/design.md`](../myinvestor-products/design.md) §8 y §12).
- **R8/R11 (era el punto abierto nº 5 — `gain` y `gainPercent` nullable) — ✅
  CONTESTADO.** Los dejé opcionales porque "el que manda es el fichero y ese fichero
  todavía no existe". **Ya existe: en el fichero son OBLIGATORIOS**
  ([`myinvestor-products/requirements.md` R33-R39](../myinvestor-products/requirements.md)) — si te dejas la ganancia, el
  producto se reporta como no parseado y lo ves. **Aun así las columnas se quedan
  `NULL`-ables en la base de datos**, por recomendación explícita de la feature 10 y
  porque es un **seguro que no cuesta nada**: si algún día el formato deja de
  exigirlos (un producto que el banco no calcula), no hará falta migración. La
  restricción vive donde puede dar un mensaje útil —el parser—, no donde solo daría
  un `P2011`.

### Delegado (resuelve algo de `delego_en_agente`)

- **R1, R2, R3, R4, R8, R9 — (delegado #1)** "Cómo materializar el modelo en
  Prisma/Postgres: nombres en inglés de las tablas y campos, enum de tipos de
  producto, precisión decimal…". Decido el esquema completo en inglés
  (`InvestmentProduct` / `Valuation` / `InvestmentProductType`), con la parte del
  depósito como columnas nullable de la misma tabla y `invested` en la foto
  (`design.md` §2). Alternativas descartadas: tabla por tipo, y guardar la última
  valoración como columnas del producto (`design.md` §10).
- **R5 — (delegado #1)** Precisión de los porcentajes: `Decimal(6,4)` para
  `interestRate` y `Decimal(7,4)` para `gainPercent` (`design.md` §6).
- **R6, R14 — (delegado #2)** "La clave natural que identifica un producto entre
  cargas del archivo, y la que identifica una foto". Decido `@@unique([bank, name])`
  y `@@unique([productId, date])` (`design.md` §3).
- **R15 — (delegado #2)** "Qué pasa exactamente al recargar el mismo archivo (que no
  duplique y que gane el último)". Decido **UPSERT** sobre `(productId, date)`
  (`design.md` §4).
- **R16, R23 — (delegado #1)** "…e índices". Decido `@@index([productId])` en
  `Movement` (gemelo de `@@index([transferId])`) y **todos** los índices
  declarativos: **cero SQL crudo**, que es lo que evita el riesgo de drift que la
  feature 8 sí arrastra con sus dos índices a mano (`design.md` §5).
- **R20 — (delegado #3)** "Cómo se vigila que un depósito no tenga fotos periódicas".
  Decido **regla del servicio**; alternativa descartada: `CHECK` en SQL crudo
  (`design.md` §8).
- **R21 — (delegado #4)** "Si el valor de mercado ya incluye el dinero sin invertir".
  Suposición: **van aparte** (`design.md` §9).
- **R25, R26, R27 — (delegado #5)** "Dónde y cómo se documenta todo esto". Decido:
  `docs/data-model.md` reestructurado en dos partes con cinco reglas, **ADR-012** en
  `docs/architecture.md`, y una nota de "sin endpoints todavía" en
  `docs/api-contract.md` (`design.md` §13).
- **R7 — (delegado #1, parcial)** El cierre de un producto no estaba en el `intent`;
  el `acceptance` lo derivó y yo elijo la forma (`closedAt` nullable, sin enum). Su
  escritor lo aporta la feature 10 (ver el bloque ✅).

### Humano (trazable a una frase del `intent`)

- **R1, R3, R4 — (humano)** "Para modelarlo quiero una primera abstracción de lo que
  es un producto de inversión, donde se recogen los datos principales, y después cada
  uno con sus partes concretas"; "un fondo, una cartera automatizada y un ETF son
  exactamente lo mismo y llevan los mismos datos"; "un depósito es distinto: total
  invertido, tanto por ciento ofrecido, ganancias finales y fecha de vencimiento". Y
  del `que_no_quiero`: "nada de tabla aparte por cada tipo de producto: una sola
  tabla con lo común y las columnas propias del depósito vacías en los demás", y "no
  desglosar la cartera automatizada en los fondos que lleva dentro".
- **R2 — (humano)** "Tengo… fondos, un ETF (tengo uno de oro), varios depósitos y una
  cartera automatizada" → cuatro tipos, ni uno más.
- **R8, R11 — (humano)** "Guardo la foto de un fondo en una fecha con capital
  invertido, valor de mercado, ganancia, tanto por ciento y dinero sin invertir tal
  como vienen en el archivo, y los recupero idénticos; incluidos los negativos cuando
  estoy perdiendo".
- **R9, R10 — (humano)** "En los fondos el capital invertido crece con el tiempo
  porque hago aportaciones mensuales, así que la foto de un producto es de una fecha
  concreta y quiero conservar la serie" + "guardo tres fotos del mismo fondo en tres
  meses distintos… y se conservan las tres sin pisarse: puedo ver la serie".
- **R12 — (humano)** "Un producto que no trae dinero sin invertir se guarda sin ese
  dato, y otro que sí lo trae lo conserva".
- **R13 — (humano)** "Estos datos se leen del archivo tal cual, no hay que calcular
  nada" + `que_no_quiero`: "no calcular la ganancia ni el tanto por ciento restando o
  dividiendo: esos datos vienen en el archivo y se guardan tal cual". Es la **regla
  4** del modelo.
- **R14, R15 — (humano)** "Volver a cargar el mismo archivo no duplica nada: la foto
  de un producto en una fecha es única y se queda con el último dato cargado".
- **R16, R18 — (humano)** "Un movimiento de la cuenta corriente puede quedar
  enlazado al producto de inversión al que fue ese dinero, y se recupera enlazado" +
  `que_no_quiero`: "no tocar nada del modelo del flujo, salvo añadir la columna que
  permite enlazar un movimiento con el producto al que fue el dinero". Es la **regla
  5** del modelo.
- **R17, R19 — (humano)** "No tocar nada del modelo del flujo, salvo añadir la
  columna…" + "todo lo que ya funcionaba del flujo (cuentas, movimientos,
  categorías) sigue funcionando exactamente igual".
- **R20 — (humano, en cuanto a la regla)** "El depósito no necesita foto periódica:
  sus condiciones se escriben una vez al contratarlo y no fluctúan". El **cómo se
  vigila** es delegado (ver arriba).
- **R22 — (humano)** "Aplico la migración sobre una base limpia y las tablas se crean
  sin error".
- **R24 — (humano)** `que_no_quiero`: "Nada de endpoints, ni parser, ni importador:
  aquí solo el modelo y la migración, igual que la feature 8 hizo con el flujo" + "no
  construir interfaz web (es del frontend, otra sesión)".
- **R28 — (humano)** Cierre estándar del proyecto: `acceptance` nº 12,
  `docs/verification.md` (Nivel 4 obligatorio por ser `sdd: true`) y
  `docs/architecture.md`.
