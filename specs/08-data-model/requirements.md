# Requirements — Feature 8: data-model

> Derivados del bloque `intent` de la feature 8 en `feature_list.json` (fuente de
> verdad del QUÉ) y del modelo base ya validado por el humano en
> `docs/data-model.md`. **Donde `data-model.md` y el `intent` difieren, manda el
> `intent`** (el doc está algo desactualizado): en concreto **no existe cuenta de
> efectivo** y el modelo va **alineado con el parser** (feature 6/7:
> `bookingDate`, `valueDate`, `description`, `amount`, `balance`, `currency`,
> `type income|expense`, `accountIban`; ver `src/modules/bankinter/bankinter.types.ts`).
> Aplica los Principios 1-5 y ADR-004/005/006 de `docs/architecture.md` y
> `docs/conventions.md`. Notación EARS estricta (ver `docs/specs.md`).
>
> Esta feature **solo deja listo el cimiento**: el modelo, la lectura por API y el
> **servicio reutilizable de creación de cuenta**. El **disparo de la
> importación desde Drive** (leer la carpeta, parsear en lote, deduplicar, mover a
> `procesados/`) y **surfacear el error al frontend en ese flujo** son la
> **feature siguiente** (importación), no ésta.
>
> 🔁 **Corrección de la revisión humana en la puerta (traspasos).** La versión
> anterior de este spec modelaba el traspaso como algo que **se crea**
> (`POST /api/movements/transfer` fabricando dos apuntes). Es falso en este flujo:
> las dos piernas **ya llegan de los extractos** de cada banco (un `expense` en la
> cuenta origen y un `income` en la destino), así que crearlas por API las
> **duplicaría**. Un traspaso es **un movimiento más como otro cualquiera**; lo
> único propio es que **no cuenta como gasto ni como ingreso** en los totales. En
> consecuencia: **no hay endpoint de traspasos**, desaparecen el valor `transfer`
> de `MovementType` y el enum `MovementDirection` (el `type` que reportó el banco
> ya dice si resta o suma), y el único rastro en el modelo es
> `Movement.transferId` (enlace lógico entre las dos piernas, que **rellenará una
> feature posterior**, no ésta). **R18-R20 se reescriben; R21-R24 quedan
> retirados** y sus números **no se reutilizan**.
>
> 🔁 **Segunda corrección humana en la puerta: fuera los movimientos manuales.**
> "Si lo hago en el banco queda reflejado, con lo cual es un movimiento que vendrá
> en los archivos del banco. No creo que sea necesario tener movimientos a mano;
> quitar esto de momento junto con el endpoint para crear movimientos. Eliminar
> movimientos, lo mismo: no se pueden eliminar a mano. Además si hacemos esto
> debemos controlar el saldo, y eso no quiero que se haga a mano." En consecuencia
> **los movimientos solo entran por importación**: se caen `POST /api/movements` y
> `DELETE /api/movements/:id`, y de `/api/movements` **solo queda el `GET`**.
> **R13 sobrevive; R12, R14, R15, R16 y R17 quedan retirados** (números no
> reutilizados). El saldo pasa a salir **siempre** del extracto (R9), y la suma
> queda para el **caso excepcional** de un banco que no dé saldo corrido.
>
> ⏸️ **Esta feature es SDD: para en `spec_ready` y espera la aprobación humana.**
> La sección de **Procedencia** (al final) marca lo `(delegado)` y lo `(añadido)`
> que el humano revisa con lupa en la puerta.

## Decisiones delegadas que este spec resuelve (detalle y alternativas en `design.md`)

El `intent` cedió cinco decisiones al agente (`delego_en_agente`). Se resuelven
aquí y se marcan `(delegado)` en Procedencia:

1. **Materialización en Prisma/Postgres (tipos, enums, índices)** — incluido el
   **índice único parcial** del dedup de importados (`WHERE origin='imported'`) y
   la **unicidad de categorías raíz** (problema de los `NULL` de Postgres).
   `design.md` §2, §3, §4. Requirements: **R1-R7**.
2. **Ubicación y límite de la creación automática de cuenta** — servicio
   reutilizable en ESTA feature; el disparo por Drive y el error al frontend en la
   feature de importación. `design.md` §7. Requirements: **R30-R32**.
3. **Importe 0** — se añade un tipo **neutro** (ni ingreso ni gasto). `design.md`
   §6. Requirement: **R33**.
4. **Cómo reemplazar el `Expense` del bootstrap** (tabla + endpoints + migración).
   `design.md` §8. Requirements: **R34-R36**.
5. **Endpoints mínimos y su forma** para `docs/api-contract.md`. `design.md` §5.
   Requirements: **R8-R11, R13, R25-R29** (sin endpoint de traspasos —R18— y sin
   alta ni borrado de movimientos —R13—, ambas correcciones humanas en la puerta).

---

## Esquema, enums e índices (Prisma + migración)

### R1
El sistema DEBE definir un modelo `Account` con `id`, `iban` (string, **único**,
obligatorio, normalizado a mayúsculas sin espacios), `bank` (string, obligatorio),
`alias` (string, obligatorio), `type` (`AccountType`, def. `checking`),
`initialBalance` (`Decimal(10,2)`, def. `0`, usado **solo** como punto de partida
cuando la cuenta aún no tiene ningún movimiento con `balanceAfter`, ver R9),
`createdAt`, `updatedAt`, y **NO DEBE** existir un tipo de cuenta `cash` (el
efectivo son movimientos sobre una cuenta bancaria).

*Verificación:* test de introspección/typegen del cliente Prisma + test de
integración que crea una `Account` con esos campos; test que confirma que
`AccountType` no incluye `cash`.

### R2
El sistema DEBE definir un modelo `Category` con `id`, `name` (string), `kind`
(`CategoryKind` `expense|income`), `parentId` (`Int?`, autorreferencia de **un
solo nivel**), `createdAt`, y las relaciones `parent`/`children`.

*Verificación:* test de integración que crea una categoría raíz y una subcategoría
colgando de ella y comprueba la relación `parent`/`children`.

### R3
El sistema DEBE definir un modelo `Movement`, **en inglés y alineado con el
parser**, con: `id`, `type` (`MovementType`), `bookingDate` (fecha contable,
date-only), `valueDate` (fecha valor, date-only), `amount` (`Decimal(10,2)`,
**siempre positivo**), `description` (string), `balanceAfter` (`Decimal(10,2)?`),
`currency` (string, def. `'EUR'`), `accountId` (FK a `Account`), `categoryId`
(`Int?`, FK a `Category`), `paymentMethod` (`PaymentMethod?`), `origin`
(`MovementOrigin`, def. `imported`), `status` (`MovementStatus`, def.
`pending_review`), `note` (`String?`), `transferId` (`String?`, enlace lógico entre
las dos piernas de un traspaso; ver R18), `daySequence` (`Int?`, ver R3b),
`createdAt`, `updatedAt`. **NO DEBE** existir una columna `direction` (el `type`
del apunte ya dice si resta o suma).

Los **defaults** son `imported`/`pending_review` porque, retirada el alta manual,
**todo movimiento viene del banco y nace pendiente de revisar**; un default
`confirmed` sería una trampa para cualquier inserción futura que olvide fijarlo.

*Verificación:* test de integración que persiste un `Movement` con todos los campos
y comprueba que se guardan, incluidos los defaults; el mapeo parser↔BD se documenta
en `design.md` §9.

### R3b
El sistema DEBE definir `Movement.daySequence` (`Int?`) con el significado
**posición del movimiento dentro de su `bookingDate`**, `1` = el primero de ese día
en orden cronológico. Fija el orden **dentro de un mismo día**, que ni `bookingDate`
ni el `id` autoincremental garantizan, y participa en el índice de dedup (R6) y en
el orden del saldo (R9) y del listado (R13). Es nullable para tolerar un movimiento
que no venga de un extracto con posición conocida.

Se guarda la posición **dentro del día** y no el número de línea del fichero
porque el número de línea **no es estable entre descargas** (el mismo movimiento
cae en una línea distinta según el rango descargado), mientras que su posición
dentro del día sí lo es, y eso es lo que permite reconocer un movimiento ya
importado.

*Verificación:* test de integración que persiste dos movimientos del mismo
`bookingDate` con `daySequence` 1 y 2 y comprueba que se recuperan en ese orden.

### R4
El sistema DEBE definir los enums `AccountType (checking, savings)`,
`CategoryKind (expense, income)`, `MovementType (expense, income, neutral)`,
`PaymentMethod (card, cash, bank_transfer, direct_debit)`, `MovementOrigin
(imported, manual)` y `MovementStatus (confirmed, pending_review)` —el valor
`manual` de `MovementOrigin` se mantiene aunque hoy **nada** lo produzca: es lo que
hace que el índice de dedup sea **parcial** (`WHERE origin='imported'`, R6) y evita
rehacerlo si vuelve el alta manual—, y **NO DEBE**
definir un valor `transfer` en `MovementType` ni un enum `MovementDirection`: el
`type` de cada apunte es siempre **el que reportó el banco** y no se muta al
identificar un traspaso (ver R18 y el índice de dedup de R6, cuya clave incluye
`type`).

*Verificación:* test que crea registros usando cada valor de enum relevante y
comprueba que el cliente los acepta.

### R5
CUANDO se aplica la migración de esta feature sobre una base de datos limpia, el
sistema DEBE crear todas las tablas y enums (`Account`, `Category`, `Movement` y
sus tipos) sin error.

*Verificación:* `pnpm run prisma:migrate` sobre una BD limpia termina sin error;
la suite de integración (que corre contra el Postgres real de `docker-compose`)
pasa al 100% con las tablas nuevas.

### R6
El sistema DEBE crear (vía SQL crudo en la migración; Prisma 7 no lo expresa en el
schema, ver `design.md` §3) un **índice ÚNICO PARCIAL** sobre
`(accountId, bookingDate, type, amount, description, daySequence)` con predicado
`WHERE origin = 'imported'`, de modo que reimportar un periodo ya cargado no
duplique movimientos, y que los movimientos `manual` queden **fuera** del índice
(no se les impone unicidad).

El `daySequence` en la clave es **obligatorio para no perder datos**: un extracto
real trae líneas **idénticas** legítimas (verificado en la muestra:
**tres** `TRANS INM/ OTRO BANCO −850,00` el `2026-07-24`, y recibos `GIMNASIO −34,15`
repetidos el mismo día). Sin él, la clave las considera el mismo movimiento y la
importación guardaría **una sola**, perdiendo 2.000 € en silencio.

*Verificación:* test de integración que inserta dos movimientos `imported` con la
misma clave **incluido `daySequence`** → el segundo falla por violación de índice
único; inserta tres movimientos `imported` idénticos en todo **salvo**
`daySequence` (1, 2, 3) → **los tres** se guardan; inserta dos `manual` idénticos →
ambos se guardan (no hay unicidad para manual).

### R7
El sistema DEBE impedir dos categorías con el mismo `(parentId, kind, name)`
tratando `parentId IS NULL` como **igual** entre sí (`NULLS NOT DISTINCT`,
Postgres 17), de modo que **no** puedan existir dos categorías **raíz** con el
mismo `kind` y `name` (el `@@unique` normal no basta por el trato de los `NULL` en
Postgres; solución en `design.md` §4).

*Verificación:* test de integración que crea dos categorías raíz con el mismo
`kind` y `name` → la segunda falla; y dos subcategorías homónimas bajo **distinto**
padre → ambas se guardan.

---

## Endpoints de cuentas (`/api/accounts`)

### R8
CUANDO un cliente hace `POST /api/accounts` con `{ iban, bank }` válidos (y
opcionalmente `alias`, `type`, `initialBalance`), el sistema DEBE responder `201`
con la `Account` creada, con `amount`/saldos serializados como **string decimal**
(convención de `api-contract.md`).

*Verificación:* test de integración `app.inject()` → 201 y el cuerpo contiene la
cuenta con `iban`, `bank`, `initialBalance` como string.

### R9
CUANDO un cliente hace `GET /api/accounts`, el sistema DEBE responder `200` con la
lista de cuentas, incluyendo por cuenta su `balance` como string decimal, tomado
**del propio extracto**: el `balanceAfter` del movimiento **más reciente** de esa
cuenta que lo traiga, con el orden `bookingDate DESC, daySequence DESC` (R3b). El
sistema **NO DEBE** recalcular el saldo sumando movimientos cuando el banco ya lo
da, y **nada ajusta el saldo a mano**: no hay ninguna vía por la que un movimiento
entre en el sistema sin venir del banco (ver la corrección de la cabecera).

SI la cuenta **no tiene ningún** movimiento con `balanceAfter` ENTONCES el sistema
DEBE calcularlo desde `initialBalance` (+`income` −`expense`; `neutral` aporta 0).
Es el **caso excepcional** previsto por el humano ("a las malas, en algún banco
haremos nosotros la suma"): un banco cuyo extracto no traiga saldo corrido, o una
cuenta recién dada de alta a la que todavía no se le ha importado nada.

*Verificación:* tests del helper: (a) cuenta con movimientos importados → `balance`
es exactamente el `balanceAfter` del más reciente, **sin sumar nada**, aunque
`initialBalance` sea otro número y aunque la suma de los movimientos no cuadre;
(b) dos movimientos del mismo `bookingDate` con `daySequence` distinto → gana el de
`daySequence` mayor; (c) cuenta cuyos movimientos **no traen** `balanceAfter` →
`initialBalance` más la suma con signo. Y test de integración vía `GET
/api/accounts`.

### R10
SI `POST /api/accounts` recibe un `iban` que ya existe ENTONCES el sistema DEBE
responder `409` con `code` `CONFLICT` y NO DEBE crear una cuenta duplicada.

*Verificación:* test que crea una cuenta y repite el mismo `iban` → segundo → 409;
`GET` sigue devolviendo una sola.

### R11
SI `POST /api/accounts` recibe un body sin `iban` o sin `bank` (o con `iban`
vacío) ENTONCES el sistema DEBE responder `400` con `code` `VALIDATION_ERROR`.

*Verificación:* tests: body sin `iban` → 400; sin `bank` → 400; `iban: ""` → 400.

---

## Endpoints de movimientos (`/api/movements`) — solo lectura

> Los movimientos **solo entran por importación**. No hay alta ni borrado manual:
> si el movimiento existe, existe en el banco y llegará en su fichero; y si no
> existe en el banco, no debe tocar el saldo.

### R13
CUANDO un cliente hace `GET /api/movements`, el sistema DEBE responder `200` con
la lista de movimientos del más reciente al más antiguo (`bookingDate DESC,
daySequence DESC`), cada uno con su `account` y su `category` embebidos.

*Verificación:* test que persiste dos movimientos en fechas distintas → salen
ordenados descendente, con `account` y `category` embebidos; y dos del mismo día
con `daySequence` 1 y 2 → sale antes el 2.

> **R12, R14, R15, R16, R17 — RETIRADOS** en la segunda corrección humana de la
> puerta. Cubrían el alta manual (`POST /api/movements`), el borrado
> (`DELETE /api/movements/:id`) y las validaciones de ese alta (`amount<=0`,
> `accountId` inexistente, `kind` de categoría ≠ `type`). Al no existir esos
> endpoints, no hay operación que validar. Los números **no se reutilizan**.
>
> **El efectivo, por decisión del humano, se queda en la retirada de cajero.** Esa
> retirada ya es un movimiento del extracto (un `expense` de la cuenta) y con eso
> basta: **no hace falta saber en qué se gastó ese dinero**. No es una carencia a
> compensar más adelante, es el alcance querido.

---

## Traspasos entre cuentas propias (sin endpoint: llegan del banco)

> Un traspaso **no se crea desde la app**: sus dos apuntes ya vienen en los
> extractos (un `expense` en la cuenta origen y un `income` en la destino). Esta
> feature solo fija **el campo que los enlaza** y **la regla de que no cuentan
> como gasto ni ingreso**. Quién rellena ese enlace es una **feature propia
> posterior a la de importación** (decidido el 2026-08-05): **detección
> automática** por importe opuesto + fechas próximas + dos cuentas propias
> distintas, **sin marcado manual**. Mientras tanto la columna está vacía y los
> traspasos cuentan en los totales: asumido, porque aún no hay dashboards que los
> consuman (`design.md` §2.1).

### R18
El sistema DEBE modelar un traspaso entre cuentas propias como **dos movimientos
ordinarios ya existentes** —un `expense` en la cuenta origen y un `income` en la
destino, con el `type` tal como lo reportó cada banco— **enlazados por un mismo
`transferId`**, y **NO DEBE** exponer ningún endpoint que cree, enlace o
desenlace traspasos, ni mutar el `type` de un movimiento al identificarlo como
pierna de traspaso.

*Verificación:* test de integración que persiste dos movimientos en cuentas
distintas con el mismo `transferId` (uno `expense`, otro `income`) y los recupera
por ese `transferId` conservando su `type`; checklist del reviewer sobre el diff:
no existe ruta `/api/movements/transfer` ni servicio `createTransfer`.

### R19
El sistema **NO DEBE** dar a las piernas de un traspaso ningún tratamiento especial
en el **saldo** de la cuenta: el saldo sale del `balanceAfter` que da el banco
(R9), que ya las incluye por definición (son un cargo y un abono reales de esa
cuenta); y en el caso de fallback por suma, cuentan con el signo de su `type`.

*Verificación:* test del helper de saldo con dos cuentas y las dos piernas
enlazadas: el saldo de cada una sale del `balanceAfter` de su último movimiento
(origen ↓, destino ↑) **sin ninguna rama que mire `transferId`**; revisión del
reviewer de que `computeAccountBalance` no menciona `transferId`.

### R20
El sistema NO DEBE contar como gasto ni como ingreso, en los **totales globales**,
ningún movimiento con `transferId != null` ni ningún movimiento `neutral` (mover
dinero entre cuentas propias no es ni gasto ni ingreso).

*Verificación:* test unitario del helper de cálculo: un dataset con un gasto, un
ingreso, un par de piernas enlazadas y un `neutral` → los totales de gasto y de
ingreso ignoran las dos piernas y el `neutral`; los saldos por cuenta sí las
incluyen (R19).

> **R21-R24 — RETIRADOS** en la revisión humana de la puerta. Cubrían la
> validación (`fromAccountId !== toAccountId`, cuentas existentes), la
> atomicidad de las dos piernas y el borrado en cascada del endpoint
> `POST /api/movements/transfer`, que ya no existe. Los números **no se
> reutilizan** para que la trazabilidad de esta feature no se solape con la del
> spec anterior.

---

## Endpoints de categorías (`/api/categories`)

> **Aquí sí hay alta manual, y no es una incoherencia con los movimientos.** Un
> movimiento existe en el banco y llegará en su fichero; una categoría no existe en
> ningún sitio hasta que el humano la define (el extracto dice
> `RECIBO /Recibo GIMNASIO`; que eso sea "Deporte" es decisión suya). Confirmado en la
> puerta: **el
> catálogo lo crea el humano**, y lo automático será **asignar** categorías a los
> movimientos mediante **reglas sobre el `description`**, en una feature posterior
> (`design.md` §2.2). Esta feature entrega solo el catálogo.

### R25
CUANDO un cliente hace `POST /api/categories` con `{ name, kind }` (raíz) o
`{ name, kind, parentId }` (subcategoría) válidos, el sistema DEBE responder `201`
con la `Category` creada respetando `kind` y `parentId`.

*Verificación:* test crea una raíz y una subcategoría → 201 en ambos; la
subcategoría tiene `parentId` correcto.

### R26
CUANDO un cliente hace `GET /api/categories`, el sistema DEBE responder `200` con
las categorías raíz y sus subcategorías (`children` embebidos) respetando la
jerarquía de un nivel.

*Verificación:* test crea raíz + subcategoría → `GET` devuelve la raíz con la
subcategoría en `children`.

### R27
SI `POST /api/categories` referencia un `parentId` que ya es a su vez una
subcategoría (`parent.parentId != null`) ENTONCES el sistema DEBE responder `400`
`VALIDATION_ERROR` (solo se admite **un** nivel de subcategoría).

*Verificación:* test crea raíz → sub → intenta sub-sub → 400.

### R28
SI `POST /api/categories` crea una subcategoría cuyo `kind` no coincide con el
`kind` de su padre ENTONCES el sistema DEBE responder `400` `VALIDATION_ERROR`.

*Verificación:* test: padre `expense`, hija `income` → 400.

### R29
SI `POST /api/categories` intenta crear una **segunda** categoría raíz con el mismo
`kind` y `name` que una existente ENTONCES el sistema DEBE responder `409`
`CONFLICT` (respaldado por el índice de R7).

*Verificación:* test crea raíz `{expense,"Food"}` dos veces → segunda → 409.

---

## Servicio reutilizable de creación de cuenta (sin disparo desde Drive)

### R30
El sistema DEBE ofrecer un servicio reutilizable `findOrCreateAccountFromMetadata`
que, dados los metadatos de un extracto `{ iban, bank }`: si ya existe una cuenta
con ese `iban`, la **devuelve** (no crea); si no existe y los datos son
**suficientes** (`iban` **y** `bank` presentes), **crea** la cuenta aplicando
defaults para lo que falte (`alias` derivado de `bank`+IBAN, `type = checking`,
`initialBalance = 0`) y la devuelve **marcada como creada** junto con los datos
usados.

*Verificación:* tests unitarios/integración: IBAN existente → devuelve la misma,
`created=false`; IBAN nuevo con banco → crea con defaults, `created=true` y reporta
los defaults aplicados.

### R31
SI `findOrCreateAccountFromMetadata` recibe metadatos **insuficientes** (falta
`iban` o falta `bank`) ENTONCES el sistema DEBE lanzar un error **diferenciable**
`MissingAccountDataError` (`code` `MISSING_ACCOUNT_DATA`, HTTP 422) cuyo mensaje
nombre el/los dato(s) que faltan, y NO DEBE crear ninguna cuenta a ciegas.

*Verificación:* tests: sin `iban` → lanza `MissingAccountDataError` nombrando
`iban`, sin crear cuenta; sin `bank` → ídem; la clase tiene `code
='MISSING_ACCOUNT_DATA'`, `statusCode=422`.

### R32
El **límite** de esta feature: el servicio de creación de cuenta se expone como
**función de dominio interna** reutilizable; esta feature **NO DEBE** leer Drive,
parsear archivos ni importar movimientos en lote, y **NO DEBE** exponer un endpoint
que dispare el auto-alta. El código `MISSING_ACCOUNT_DATA` queda **reservado** en
`api-contract.md` (interno; lo devolverá la feature de importación).

*Verificación:* checklist del reviewer contra `design.md` §7 y el diff (sin
lectura de Drive, sin endpoint de importación); la nota de reserva queda escrita en
`api-contract.md`. Requirement de proceso (misma excepción consciente que
`UNKNOWN_BANK` en la feature 4).

---

## Tratamiento del importe 0 (decisión delegada)

### R33
El sistema DEBE ofrecer un helper de dominio `deriveMovementTypeFromAmount(amount)`
que devuelva `expense` si `amount < 0`, `income` si `amount > 0` y `neutral` si
`amount === 0`; un movimiento `neutral` NO DEBE contarse como ingreso ni como gasto
y NO DEBE afectar al saldo (aporta 0).

*Verificación:* tests unitarios: `-5 → 'expense'`, `5 → 'income'`, `0 → 'neutral'`;
el helper de saldo (R20) trata `neutral` como 0.

---

## Reemplazo del `Expense` del bootstrap (breaking change)

### R34
El sistema DEBE eliminar el modelo `Expense`, la `Category` placeholder del
bootstrap y los endpoints `/api/expenses` (GET lista, GET `:id`, POST, DELETE): tras
la feature, cualquier petición a `/api/expenses*` DEBE responder `404`.

*Verificación:* test de integración: `GET /api/expenses` → 404; `POST
/api/expenses` → 404; el módulo `src/modules/expenses/` ya no existe.

### R35
La migración de esta feature DEBE **eliminar** las tablas `Expense` y la `Category`
antigua del bootstrap (dejando la BD con el modelo nuevo limpio).

*Verificación:* aplicar la migración sobre una base con el esquema del bootstrap →
las tablas viejas desaparecen y quedan `Account`, `Category` (nueva), `Movement`;
la suite pasa contra el esquema nuevo.

### R36
El sistema DEBE actualizar `docs/api-contract.md` retirando la sección `Expense`/
`/api/expenses` con una **nota visible de breaking change** y documentando los
modelos y endpoints nuevos en inglés (`Account`, `Category`, `Movement`,
`/api/accounts`, `/api/categories`, `/api/movements`), y actualizar
`docs/data-model.md` al **modelo final** (sin cuenta de efectivo; con `iban`,
`bookingDate`, `valueDate`, `balanceAfter`, `currency`, `description`; tipo
`neutral`; índices de R6/R7; y el **traspaso sin endpoint** —sin
`MovementType.transfer` ni `MovementDirection`, solo `transferId` enlazando dos
movimientos ordinarios, R18-R20). El breaking change se anota también en
`progress/current.md`.

*Verificación:* checklist del reviewer contra el diff de `docs/`. Requirement de
proceso (sin superficie ejecutable propia).

---

## Cierre estándar del proyecto

### R37
El sistema DEBE registrar como **ADR** en `docs/architecture.md` las decisiones
delegadas (esquema/enums, índices/dedup, tipo `neutral` para el importe 0, servicio
de auto-alta de cuenta + `MissingAccountDataError`, reemplazo del `Expense`);
actualizar `docs/stack.md` si hay dependencias nuevas; respetar los invariantes de
arquitectura (rutas sin `prisma`, solo servicios hablan con Prisma, errores de
dominio tipados, config validada); y terminar `bash ./init.sh` en verde (typecheck
+ suite completa), con cada `R<n>` mapeado a un test en
`progress/implementations/data-model.md`.

*Verificación:* `bash ./init.sh` verde + revisión del mapa de trazabilidad (Nivel 4
de `docs/verification.md`); el guardián de `src/architecture.test.ts` (rutas sin
`prisma`) sigue verde para los módulos nuevos.

---

## Procedencia

> Clasificación obligatoria de cada `R<n>` (ver `docs/specs.md`). El humano revisa
> con lupa lo `(delegado)` y, **sobre todo**, lo `(añadido)`.

### 🟥 AÑADIDO — revisar en la puerta de aprobación

- **R1 (IBAN único y obligatorio; `AccountType` = {checking, savings}) —
  (añadido)** El `intent` dice "cuentas bancarias con IBAN" y "no hay cuenta de
  efectivo", pero no fija que el `iban` sea **obligatorio y único** ni el conjunto
  exacto de tipos. Decido: `iban` **obligatorio y único** (es la clave natural del
  find-or-create de R30) y `AccountType` **sin `cash`**, con **`checking` y
  `savings`** (quito `cash` del `data-model.md`; **no** añado `credit` — se puede
  añadir luego sin migración de datos). **← REVISAR.**
- **R3 (`bookingDate`/`valueDate` como fecha date-only `YYYY-MM-DD`) — (añadido)**
  Para alineación exacta con el parser (que emite `YYYY-MM-DD`) propongo
  almacenarlas como **date-only** (`@db.Date`) y serializarlas como `YYYY-MM-DD`,
  divergiendo a propósito de la convención "ISO 8601 UTC" que usaba `Expense.date`.
  Si prefieres `DateTime` con hora, es un cambio pequeño. **← REVISAR.**
- **R9/R19 (el `balance` sale del extracto, no de una suma) — (humano, corrección
  en la puerta)** El humano corrigió: "el saldo no hay que calcularlo, viene ya en
  los propios movimientos; es un dato que dan todos los extractos". Así que
  `balance` = `balanceAfter` del movimiento más reciente, y la suma queda solo para
  el **caso excepcional** que el propio humano nombró ("a las malas, en algún banco
  haremos nosotros la suma"): un banco sin saldo corrido en el extracto. Sigue
  siendo un campo **calculado por petición** en `GET /api/accounts`; los
  **dashboards** (idea #4) siguen fuera de scope.
- **R3b/R6/R9 (columna `daySequence`) — (humano, corrección en la puerta)** El
  humano pidió **guardar explícitamente la posición de la línea** en vez de confiar
  en el orden de inserción ("veo frágil solo darle la vuelta al array"). Acertado, y
  al implementarlo apareció un fallo mayor: la clave de dedup **sin** esa columna
  trata como el mismo movimiento las **líneas idénticas legítimas** que trae un
  extracto real (tres `TRANS INM/ OTRO BANCO −850,00` el `2026-07-24` en la muestra),
  y la importación habría guardado **una** perdiendo 2.000 € en silencio. Lo
  `(añadido)` mío: que la posición sea **dentro del día** (`1` = primero del día) y
  no el número de línea del fichero, porque ese número **cambia con el rango
  descargado** y no permitiría reconocer un movimiento ya importado; y que
  `daySequence` entre en la clave del índice único (R6). **← REVISAR.**
- **R13 + retirada de R12/R14-R17 (fuera el alta y el borrado manual de
  movimientos) — (humano, corrección en la puerta)** "Si lo hago en el banco queda
  reflejado… no creo que sea necesario tener movimientos a mano… eliminar
  movimientos, lo mismo… si hacemos esto debemos controlar el saldo, y eso no
  quiero que se haga a mano." De `/api/movements` solo queda el `GET`. Lo
  `(añadido)` mío, derivado: los **defaults** de `Movement` pasan a
  `origin=imported` / `status=pending_review` (R3), y el valor `manual` del enum se
  **conserva** para que el índice de dedup siga siendo parcial (R4). **← REVISAR.**
- **El efectivo se agota en la retirada de cajero — (humano)** "Si saco dinero de
  un cajero queda registrado como un movimiento de retirada; no es necesario saber
  en qué se gastó ese dinero." Es el alcance querido, no una carencia: sustituye a
  la frase original del `intent` ("el efectivo se maneja como movimientos sobre una
  cuenta bancaria"), que sugería apuntar cada gasto en metálico.
- **R18-R20 (traspaso sin endpoint; `transferId` como único marcador) — (humano,
  corrección en la puerta)** El humano corrigió la premisa del spec anterior: las
  dos piernas ya llegan de los extractos, así que crearlas por API las duplicaría.
  Se cae `POST /api/movements/transfer` (y con él R21-R24), se caen
  `MovementType.transfer` y `MovementDirection`, y queda `transferId` como enlace
  lógico que **rellena una feature posterior**. Consecuencia práctica: en esta
  feature **nada escribe `transferId`** — es una columna reservada, verificada por
  persistencia directa en test.
- **R10/R29 (`ConflictError` 409 para IBAN y categoría raíz duplicados) —
  (añadido)** El `intent` no dice qué pasa al reintentar un alta duplicada.
  Propongo `409 CONFLICT` (subclase `ConflictError`, prevista en ADR-005 como
  ejemplo). **← REVISAR.**
- **R31 (HTTP 422 para `MISSING_ACCOUNT_DATA`) — (añadido)** El `intent` pide un
  "error diferenciable"; el `code` propio lo garantiza. El **status 422** (dato
  presente pero insuficiente) es elección mía; la feature de importación puede
  presentarlo como quiera. **← REVISAR.**
- **R6 (columnas exactas del índice de dedup) — (añadido)** El `intent` delega "el
  índice único parcial para el dedup". Decido la clave concreta **(accountId,
  bookingDate, type, amount, description, daySequence)** e **incluyo `type`** (dos líneas con
  igual fecha/importe absoluto pero signo opuesto son movimientos distintos). Esto
  **obliga a que `type` sea inmutable**: si al marcar un traspaso se mutara el
  `type`, la clave del índice cambiaría y una reimportación del mismo extracto ya
  no colisionaría → duplicado silencioso. Es la razón técnica de que el marcador de
  traspaso sea `transferId` y no un `type` nuevo (R18). También
  **descarto la columna `importHash`** del `data-model.md`: el índice compuesto
  parcial da la misma garantía **sin** abrir la sub-decisión de "receta del hash y
  normalización del concepto". **← REVISAR.**
- **R33 (nombre `neutral` y helper `deriveMovementTypeFromAmount`) — (delegado,
  con matiz añadido)** Ver delegado abajo; el **nombre** del valor (`neutral`) y la
  existencia del helper son elección mía. **← REVISAR.**

### Delegado (resuelve algo de `delego_en_agente`)

- **R1, R2, R3, R4 — (delegado)** "Cómo materializar el modelo en Prisma/Postgres
  (tipos, enums)". Decido el esquema completo en inglés alineado con el parser
  (`design.md` §2), aplicando las correcciones del `intent` sobre `data-model.md`
  (sin `cash`; `description`, `valueDate`, `balanceAfter`, `currency`, `iban`).
- **R6 — (delegado)** "El índice único parcial para el dedup de importados". Índice
  ÚNICO PARCIAL `WHERE origin='imported'` vía **SQL crudo** en la migración (Prisma
  7 no lo expresa en el schema; el soporte declarativo `@@index(where:, unique:)`
  es de Prisma 8). Alternativa descartada: columna `importHash` (`design.md` §3).
- **R7 — (delegado)** "La unicidad de categorías raíz (el punto de los `NULL` de
  Postgres)". Decido `NULLS NOT DISTINCT` (Postgres 17) vía SQL crudo. Alternativa
  descartada: dos índices parciales / centinela (`design.md` §4).
- **R8-R11, R13, R25-R29 — (delegado)** "Qué endpoints mínimos expone esta feature
  y su forma exacta". Decido la superficie: `/api/accounts` (POST, GET, GET/:id),
  `/api/categories` (POST, GET) y `/api/movements` (**solo GET**), con la forma de
  `design.md` §5, siguiendo el patrón de módulos (ADR-004) y de serialización de
  `api-contract.md` (Decimal como string). **Sin endpoint de traspasos** (R18) y
  **sin alta ni borrado de movimientos** (R13), ambas correcciones humanas. El
  **cómo** de las validaciones de coherencia que quedan (R27, R28) es criterio mío
  sobre la frase del `intent` "algo incoherente… rechazado con error claro".
- **R30, R31, R32 — (delegado)** "Dónde vive la creación automática de cuenta… el
  límite exacto, qué datos son suficientes, los valores por defecto y la forma del
  error". Decido: **servicio reutilizable en esta feature** (find-or-create por
  IBAN), datos suficientes = **IBAN + banco**, defaults `alias` derivado + `type
  checking` + `initialBalance 0`, error **`MissingAccountDataError`**
  (`MISSING_ACCOUNT_DATA`, 422). El disparo por Drive y el surfaceo del error al
  frontend quedan para la feature de importación (`design.md` §7).
- **R33 — (delegado)** "Importe 0: que proponga si se deja como income o se añade
  un valor neutro". Decido **añadir un tipo `neutral`** (ni ingreso ni gasto) y la
  regla de signo de tres vías. Trade-off en `design.md` §6.
- **R34, R35, R36 — (delegado)** "El cómo de reemplazar el `Expense` (borrar tabla
  y endpoints, y la migración)". Decido borrar el módulo `expenses` + la ruta + las
  tablas viejas en la migración, y anotarlo como breaking change (`design.md` §8).

### Humano (trazable a una frase del `intent`)

- **R1 (sin cuenta de efectivo), R2 (categorías jerárquicas con tipo), R3 (dos
  fechas, saldo, divisa, description; alineado con el parser) — (humano)** "cuentas
  bancarias… NO hay cuenta de efectivo"; "categorías con subcategoría de un nivel y
  tipo"; "el movimiento guarda las dos fechas (contable y valor), el saldo tras el
  movimiento y la divisa, y la cuenta guarda su IBAN".
- **R5 — (humano)** "Aplico la migración sobre una base limpia y las tablas se
  crean sin error".
- **R8, R9 — (humano)** "Creo una cuenta bancaria con IBAN y saldo inicial y queda
  guardada, y la puedo listar".
- **R13 — (humano, corregido en la puerta)** "No creo que sea necesario tener
  movimientos a mano, así que quitar esto de momento junto con el endpoint para
  crear movimientos; eliminar movimientos, lo mismo". Sustituye a la lectura
  anterior del `intent` ("creo un gasto o ingreso a mano… se guarda, se lista y se
  borra"): de las tres operaciones **solo sobrevive listar**.
- **R18, R19, R20 — (humano, corregido en la puerta)** "Un traspaso entre cuentas
  es un movimiento más como otro cualquiera: no necesita crearse nada ni un
  endpoint POST; lo único es que no debe contarse ni como ingreso ni como gasto, y
  con eso es suficiente". Sustituye a la lectura anterior del `intent` ("registro
  un traspaso… aparecen los dos apuntes enlazados"), que asumía que la app los
  fabricaba.
- **R27, R28 — (humano)** "Si intento algo incoherente… el backend lo rechaza con
  un error claro", aplicado a lo único que queda que un cliente pueda intentar: las
  categorías (más de un nivel, `kind` distinto al del padre) y el alta de cuenta
  (R10, R11). Los otros dos ejemplos del `intent` **decaen** por las correcciones de
  la puerta: "un traspaso con una sola cuenta" (no hay endpoint de traspasos) y "una
  categoría de tipo distinto al del movimiento" (no hay endpoint que asigne
  categoría a un movimiento; esa validación volverá con la feature de
  categorización).
- **R25, R26 — (humano)** "Creo una categoría con subcategoría y tipo (gasto/
  ingreso) y se respeta la jerarquía y el tipo".
- **R30, R31 — (humano)** "Las cuentas se crean… automáticamente al importar un
  banco nuevo (si el extracto trae IBAN + banco se crea sola y se me notifica…; si
  faltan datos, se manda un error al frontend para crearla a mano)". El mecanismo
  concreto es `(delegado)`.
- **R32 — (humano)** Del `que_no_quiero`: "El disparo de la importación desde Drive
  … es la feature siguiente; aquí solo dejo el modelo y el servicio de creación de
  cuenta listos" (el "alta manual de movimientos" de la redacción original decae con
  la corrección de la puerta).
- **R34, R35 — (humano)** Del `que_no_quiero`: "Quitar del bootstrap las tablas
  viejas (Expense/Category placeholder) y sus endpoints /api/expenses para dejar la
  base de datos limpia".
- **R36 — (humano)** "todo en inglés" + "usar data-model.md" + regla de proyecto
  del breaking change.
- **R37 — (humano)** Reglas de cierre del `acceptance`, `docs/verification.md` y
  `docs/architecture.md` (ADR obligatorio, init.sh verde, trazabilidad).
</content>
</invoke>
