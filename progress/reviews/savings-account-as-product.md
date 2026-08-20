# Review — F26 `savings-account-as-product`

> Feature **SDD**. Manda [`specs/savings-account-as-product/`](../../specs/savings-account-as-product/):
> [`decisions.md`](../../specs/savings-account-as-product/decisions.md) (puerta aprobada
> el 2026-08-20, las 6 decisiones 🔴 tal cual), `requirements.md` (15 R), `design.md`,
> `tasks.md` (28 tasks). Informe del implementer:
> [`progress/implementations/savings-account-as-product.md`](../implementations/savings-account-as-product.md).
>
> 🔒 Sin ni un dato real: todo lo que aparece aquí son **recuentos y forma** (ADR-017).

---

## Veredicto: CHANGES_REQUESTED

Un solo bloqueo, y es de documentación: **`docs/data-model.md` no se ha tocado**. El
código, los tests, la migración y las tres promesas que más pesaban en la hoja del humano
—idempotencia, «no deja rastro» y «no toco tus datos»— las he probado a mano contra su
base y **están bien**. Detalle abajo.

---

## Estado de la base de datos: idéntico antes y después

Lo primero y lo último que he hecho.

| Momento | cuentas | movimientos | productos | valoraciones | fotos |
|---|---|---|---|---|---|
| **Antes** de tocar nada | 4 | 455 | 0 | 0 | 0 |
| Tras `./init.sh` completo (816 tests) | 4 | 455 | 0 | 0 | 0 |
| Tras mis pruebas manuales | 4 | 455 | **1** | 0 | **2** |
| **Después**, ya limpiado por mí | 4 | 455 | 0 | 0 | 0 |

Desglose por cuenta idéntico en las cuatro filas: 204 / 201 / 39 / 11.
`npx prisma migrate status` → «Database schema is up to date», 4 migraciones.

**Sí, mis pruebas dejaron filas y las he borrado yo**: 1 producto y 2 fotos sintéticas
(nombres `ZZ Review F26 …`, importes inventados), creadas a propósito para comprobar la
idempotencia y el rollback, y borradas en el mismo script. Verificado a cero después.

**Lo que NO ha ensuciado nada:** la pasada completa de `./init.sh` **no dejó ni una fila**
(los tests de F26 traen su propio `afterEach` que borra productos, fotos, cuentas y
movimientos de los bancos sintéticos que usan). La F27 sigue teniendo motivo de existir,
pero esta feature no la empeora.

> ⚠️ **Aviso para quien revise esto después.** Mi primera pasada de `./init.sh` salió en
> **rojo por mi culpa**: dejé un script `.ts` temporal dentro de `var/` y el guardián de
> privacidad (`src/no-real-data.test.ts:886`, fuga de secuencias de tres palabras entre
> `var/` y `src/`) lo tomó como fichero del humano y marcó 22 líneas de `src/`. Borrado el
> script, verde. **No es un defecto de la feature**, pero conviene saberlo: cualquier
> archivo de texto que alguien deje en `var/` puede poner ese guardián en rojo.

---

## Cambios requeridos

### 1. `docs/data-model.md` — sin una sola línea de esta feature

Es el archivo que se declara a sí mismo «**el registro único de columnas**» del proyecto
(`docs/data-model.md:220-221`) y cuya §Parte 2 se titula «**Esquema Prisma (el real;
fuente de verdad: `prisma/schema.prisma`)**» (`docs/data-model.md:428`). Hoy ese
documento **miente**, y encima `docs/api-contract.md` manda al lector ahí a buscar
`SavingsSnapshot`. Concreto:

1. `docs/data-model.md:433-441` — `enum InvestmentProductType` sigue con **cuatro**
   valores. El real tiene cinco: falta `savings_account`.
2. `docs/data-model.md:443-466` — el `model InvestmentProduct` no lleva la relación
   inversa `savingsSnapshots SavingsSnapshot[]` que añadió `prisma/schema.prisma:163`.
3. `docs/data-model.md:468` en adelante — **no existe el bloque `model SavingsSnapshot`**.
   Siete columnas nuevas (`productId`, `date`, `openingBalance`, `moneyIn`, `moneyOut`,
   `interest`, `balance`) sin una línea en el registro único de columnas.
4. `docs/data-model.md:394-419` — el diagrama de entidades de la Parte 2 no tiene
   `SAVINGS_SNAPSHOT` ni su relación con `INVESTMENT_PRODUCT`.
5. `docs/data-model.md:532-533` — la tabla de **claves naturales** documenta las de
   `InvestmentProduct` y `Valuation`; falta la fila de
   `SavingsSnapshot @@unique([productId, date])`, que es justo la clave de la que depende
   toda la promesa de idempotencia de la feature.
6. `docs/data-model.md:214-215` — **«Columnas reservadas (definidas, sin escritor
   todavía)»** sigue listando `InvestmentProduct.openedAt` y `InvestmentProduct.closedAt`
   como columnas sin escritor. **Ya lo tienen**: `persistSavingsSnapshot`
   (`src/modules/investments/investments.service.ts:56-70`) escribe las dos. La propia
   hoja del humano lo celebra («`openedAt` por fin sirve para algo»). Esa tabla necesita
   su 🔄 igual que lo tuvo en la F15.

**Por qué bloquea y no es un detalle:** `tasks.md` §Lote D lista cuatro documentos y
`data-model.md` no está entre ellos — el hueco viene del spec, no del descuido del
implementer. Pero el efecto es el mismo que ya rechazó una feature antes: el único sitio
donde se puede comprobar de un vistazo qué columnas existen deja de servir en cuanto una
tabla entera no aparece.

---

## Pendiente de cierre (no es código, no lo arregla el implementer)

- **C4 bis — la prueba real está sin hacer.** El implementer la deja documentada como
  pendiente y explica por qué no podía hacerla
  ([su informe, §Sugerencias fuera de scope nº 6](../implementations/savings-account-as-product.md)):
  hacía falta la migración aplicada —ya lo está— y que el archivo de Drive lleve el `name`
  corregido, que es cosa del humano
  ([`decisions.md` §Puerta de aprobación](../../specs/savings-account-as-product/decisions.md)).
  Hoy la base tiene **0 productos y 0 fotos**, así que nadie la ha hecho. Es el único
  checkpoint que queda abierto y **no puede hacerlo un agente**: su archivo, su pasada,
  informe a `progress/explorations/prueba-real-<tema>-<fecha>.md` con recuentos y forma.
- **Menor, C5.** El implementer dejó la base temporal `gastos_f26` creada en el
  contenedor (lo dice y da el comando de borrado en su informe). Conviene borrarla al
  cerrar para no dejar una segunda base con el esquema a medio camino.

---

## Comprobado sin hallazgos

### Los 15 requirements, uno a uno

Todos tienen test concreto y todos verifican **output**, no ausencia de excepción.
Trazabilidad completa en el informe del implementer; la he seguido y he abierto los
tests, no solo los títulos.

| R | Cómo lo he comprobado | ✔ |
|---|---|---|
| R1 | `prisma/migrations/20260820181500_savings_account_as_product/migration.sql:2` es un `ALTER TYPE … ADD VALUE` suelto; test contra `pg_enum` («adds savings_account keeping the four older enum values»); el enum generado exige exactamente cinco valores | ✔ |
| R2 | `CREATE TABLE` con los cinco `DECIMAL(10,2) NOT NULL`, índice único e FK; cuatro tests contra `information_schema` y contra P2002/P2003, no contra el cliente | ✔ |
| R3 | Guarda explícita en `investments.service.ts:29-51`: tipo distinto de `savings_account` → `ValidationError`, y un producto preexistente de otro tipo **se rechaza en vez de convertirse**. Lo probé a mano: lanza `ValidationError` y no escribe | ✔ |
| R4 | El `bank` del parser se **pisa** con el slug de la carpeta en `import.service.ts` (`{ ...parsed, bank: deps.bankSlug }`); hay test de que el banco que el doble declara no aparece nunca en la base | ✔ |
| R5 | Los cinco importes viajan como `string` vía `toFixed(2)`, nunca como `number`; test del mes redondeado por el banco en un céntimo que **no** se corrige | ✔ |
| R6 | **Probado a mano** contra su base: segunda pasada del mismo `(name, date)` → 1 producto (mismo id), 1 foto, con los valores de la **segunda**, y `created:false` en producto y foto | ✔ |
| R7 | **Probado a mano**: mes siguiente → **mismo** id de producto, 2 fotos, `snapshot.created:true` | ✔ |
| R8 | **Probado a mano** con un archivo descuadrado en 1,00 €: `failed`, y `0` productos con ese nombre. Ver «El cuadre corta antes» abajo | ✔ |
| R9 | El informe trae `status:'failed'`, el motivo **íntegro** del parser (lo vi entero, con la ecuación y los cinco importes) y `movedToProcessed:false`; el `update` de Drive no se llama | ✔ |
| R10 | El `.json` de `trade-republic` sale `imported` y `skippedCount:0`; el cableado real se comprueba sobre la constante exportada, no leyendo `app.ts` como texto | ✔ |
| R11 | Cuatro tests de la vía local: persiste, no toca Drive, no mueve nada, segunda pasada no duplica, mes siguiente añade, descuadre no deja rastro | ✔ |
| R12 | La regla vive en **un** sitio: `importDriveFile` mueve a `procesados/` sólo después de que `store()` devuelva `imported`. Los extractos y los productos pasan por la misma función, así que no pueden divergir | ✔ |
| R13 | El informe trae `product{id,bank,name,type,created}` y `snapshot{date,created}`; el `created` sale de un `findUnique` **dentro** de la transacción, no de comparar relojes | ✔ |
| R14 | Ver «La migración es aditiva» abajo | ✔ |
| R15 | Ver «El módulo del banco sigue sin base de datos» abajo | ✔ |

### 1. La trampa de la F25: la identidad no se renumera

Es lo que pediste que atacara y es lo que mejor está.

- Identidad del producto: `@@unique([bank, name])`. El `bank` sale de la **carpeta**, el
  `name` lo escribe el humano.
- Identidad de la foto: `@@unique([productId, date])`. La `date` la escribe el humano.
- **Ni contador, ni posición, ni autoincremento en ninguna de las dos claves.** El `id`
  autoincremental existe pero **no participa** en ninguna cláusula `where` de upsert
  (`src/modules/investments/investments.service.ts:52-92`), que es exactamente lo que le
  pasó a `Movement.daySequence` en la F25.

Comprobado en vivo contra su base, no sólo leído: tres importaciones seguidas
(mes 1 → mes 1 otra vez con otros importes → mes 2) dejaron **1 producto con el mismo id
en las tres** y **2 fotos**, la del mes 1 con los valores de la segunda pasada.

### 2. El cuadre corta ANTES de escribir, y corta en los dos sentidos

- **Rechazo antes de la primera fila:** `adapter.parse()` se ejecuta **fuera** de la
  transacción, en `importProductFile`; si lanza, `persistSavingsSnapshot` ni se llama.
  Probado con un archivo descuadrado y un `name` **nuevo**: `failed`, y luego `0`
  productos con ese nombre. Ni producto, ni foto, ni movimiento a `procesados/`.
- **Rollback a mitad de camino:** forcé el caso feo —producto nuevo cuyo upsert va bien y
  cuya foto **revienta al insertar** (importe fuera del rango de `Decimal(10,2)`)—. La
  transacción hizo rollback entera: lanzó, y el producto **no quedó creado**. No hay
  producto huérfano sin su foto. Hay además un test del implementer para este mismo caso.
- **El caso contrario** —foto colgando de un producto que no es una cuenta remunerada—
  no puede ocurrir: el servicio lo rechaza con un `findUnique` previo **dentro** de la
  misma transacción en vez de convertir el producto en silencio.

### 3. La migración es aditiva, y sus datos siguen intactos

`migration.sql` son cuatro sentencias y **ninguna toca una tabla que ya existía**:
`ALTER TYPE … ADD VALUE`, `CREATE TABLE "SavingsSnapshot"`, `CREATE UNIQUE INDEX`,
`ADD CONSTRAINT … FOREIGN KEY`. **Cero `UPDATE`, cero `DROP`, cero backfill, cero SQL
escrito a mano**, y ni una mención a `Account`, `Movement`, `Category`,
`InvestmentProduct` o `Valuation`. Hay un test que lo comprueba **contra la base ya
migrada**, columna a columna de `Account` («creates SavingsSnapshot without touching the
flow tables»). Y los recuentos de la tabla de arriba lo cierran: 4 y 455 antes, durante y
después.

### 4. El módulo del banco sigue sin tocar la base de datos

- El guardián de ADR-024 («keeps the trade-republic parser module free of data access»)
  está **intacto** y verde: ni la palabra `prisma` en los seis archivos del módulo.
- Guardián **nuevo**: `src/modules/investments/investments.service.ts` es el **único**
  archivo de `src/` que nombra `.investmentProduct.` o `.savingsSnapshot.`. La aserción
  es una igualdad de lista, no un «contiene», así que un segundo escritor rompería.
- Segundo guardián nuevo: el escritor no nombra Drive, no lee ficheros, no parsea JSON y
  **no nombra ningún banco**.
- El módulo del banco tampoco importa nada de `investments/`: encaja por forma
  (`ParsedSavingsAccount` es estructuralmente un `SavingsSnapshotInput`), así que el
  guardián de aislamiento entre bancos sigue sin excepciones.
- El ensayo sigue siendo ensayo: test de que `POST /api/parser/trade-republic` escribe su
  `products.json` del año y **no persiste nada**.

### 5. Ni un campo nuevo cada mes, y la plantilla no ha cambiado

- `docs/plantillas/trade-republic-cuenta-remunerada.json` **no está modificado**: su
  último commit es el de la F25 y no aparece en `git status`. La promesa «no tienes que
  volver a copiarla» se cumple **literalmente**.
- Ninguno de los cinco importes ni de los campos del archivo es nuevo; el `.json` que
  entra es el mismo que ya validaba la F25.
- El IBAN sigue fuera, como se aprobó. Y comprobé la salida de emergencia que promete la
  hoja: `src/modules/trade-republic/trade-republic.product.parser.ts:396` ignora toda
  clave que empiece por `_`, así que escribir `"_iban"` no rompe el archivo. La promesa
  es cierta.
- Único campo del archivo que cambia de destino, no de forma: `openedAt`, que ahora se
  guarda en vez de perderse.

### 6. Documentación

- `docs/api-contract.md` — §Inversiones deja de decir «sin endpoints todavía», documenta
  `SavingsSnapshot` campo a campo, los pasos 4' y 5' del importador, la transacción
  única, la idempotencia y el aviso de que el `name` es la identidad. Correcto y honesto
  (dice que se escriben pero aún no se leen).
- `docs/architecture.md` — **ADR-026** completo: 11 decisiones, cada una con su
  alternativa descartada, y consecuencias. Además una nota en ADR-012 de que su contrato
  de «dos upserts» ya tiene ejecutor. ADR-024 y ADR-025 se respetan, no se reescriben.
- `docs/trade-republic-product-files.md` — «Dónde acaba lo que escribes» ahora termina en
  la base; `var/parsed/` documentado como **ensayo**; dice explícitamente que la plantilla
  no cambia y repite el aviso del `.pdf`.
- `docs/roadmap.md` — cabo suelto actualizado, MyInvestor sigue dicho como pendiente.
- ❌ `docs/data-model.md` — **el hallazgo de arriba**.

### 7. Arquitectura, convenciones y checkpoints

- **Arquitectura:** capas respetadas. El banco lee, el importador encamina, inversiones
  escribe; `app.ts` sigue siendo el único que nombra bancos, ahora con dos registros y un
  guardián que impide que un banco reclame la misma extensión en los dos. La extracción
  de `importDriveFile<T>` evita duplicar la regla de ADR-025 en dos sitios: bien hecho.
- **Convenciones:** comentarios y nombres en inglés en `src/`, documentación en español,
  errores por `ValidationError` del error handler compartido, importes como `string` hacia
  `Decimal`, fechas con `T00:00:00.000Z` explícito. **Ni un `console.log`, ni un `TODO`
  sin contexto** en los archivos nuevos o tocados.
- **Tests:** las 28 tasks de `tasks.md` en `[x]`, ninguna sin justificar. Los tests miran
  output real (valores guardados, `pg_enum`, `information_schema`, códigos P2002/P2003,
  llamadas a Drive) y usan la base de verdad, no mocks de Prisma. Caminos de error
  cubiertos: 8 casos de rechazo del parser más el «ni siquiera es JSON».
- **Checkpoints:** C1 ✔ · C2 ✔ (sólo F26 en `in_progress`) · C3 ✔ · C4 ✔
  (**`./init.sh` verde, 46 archivos / 816 tests, exit 0**; el flake conocido de
  `movements.test.ts:318` **no** apareció) · **C4 bis ⏳ pendiente** (arriba) ·
  C5 ⏳ al cerrar (queda `gastos_f26`) · C6 n/a (ningún cambio de contrato con el
  frontend: no hay endpoint nuevo, sólo campos nuevos en el informe de `POST /api/import`,
  y `docs/api-contract.md` está al día) · C7 ✔ (spec completo: `decisions.md` de una
  página con bloque 🔴 de **6** puntos, cada uno con su alternativa, y puerta aprobada;
  15 requirements, **justo en el tope**, y la procedencia clasifica los 15 —6 humano,
  6 delegado, 3 añadido, los tres marcados «REVISAR EN APROBACIÓN») · **C8 no procede
  todavía**: sin resumen de cierre mientras el veredicto sea CHANGES_REQUESTED.

---

## Qué hace falta para que esto pase a APPROVED

1. Actualizar `docs/data-model.md` con los seis puntos del hallazgo 1. **Es lo único que
   toca al implementer**, y es documentación: no hay que tocar ni una línea de código.
2. (Humano) La prueba real de C4 bis con su archivo ya renombrado.
3. (Al cerrar) Borrar la base temporal `gastos_f26`.

---
---

# Segunda pasada — 2026-08-20

> El implementer dice haber cubierto mis 6 puntos **más 10 incoherencias** que yo no
> listé. No me he creído nada: he contrastado el bloque Prisma del documento contra
> `prisma/schema.prisma` **campo a campo, de forma mecánica**, y las afirmaciones nuevas
> contra el código y contra la base real.
>
> 🔒 Recuentos y forma, ni un dato real (ADR-017).

## Veredicto de la segunda pasada: APPROVED

El bloqueo de la primera pasada está resuelto y **lo que se ha escrito es verdad**, no
sólo está escrito. No ha tocado ni una línea de código, de test o de migración.
Resumen de cierre: [`progress/summaries/savings-account-as-product.md`](../summaries/savings-account-as-product.md).

Queda **una salvedad seria que no es de esta feature** y que sí cambia lo que yo mismo
dije en la primera pasada: **`./init.sh` no está verde de forma fiable**. Va abajo, en
«Lo que corrijo de mi primera pasada».

---

## Estado de la base de datos: idéntico, otra vez

| Momento | cuentas | movimientos | productos | valoraciones | fotos |
|---|---|---|---|---|---|
| **Antes** de esta segunda pasada | 4 | 455 | 0 | 0 | 0 |
| **Después** de ~13 pasadas completas de la suite y de mis consultas | 4 | 455 | 0 | 0 | 0 |

Desglose por cuenta idéntico: 204 / 201 / 39 / 11. **Esta vez no he escrito ni una fila**:
todas mis comprobaciones han sido de **lectura** (`information_schema`, `pg_indexes`,
`pg_enum`, `pg_constraint` y un bucle de sólo-lectura sobre `listMovements`). No he
tenido que borrar nada, y la suite tampoco dejó nada.

---

## 1. ¿Es VERDAD lo escrito? Contraste mecánico contra el esquema

No lo he leído «a ojo»: extraje el bloque `prisma` del documento
(`docs/data-model.md:475-556`) y los bloques reales de `prisma/schema.prisma`, les quité
comentarios y espacios, y los comparé **línea a línea**.

| Bloque | Líneas normalizadas | Resultado |
|---|---|---|
| `enum InvestmentProductType` | 5 | **idéntico** |
| `model InvestmentProduct` | 17 | **idéntico** |
| `model Valuation` | 12 | **idéntico** |
| `model SavingsSnapshot` | 12 | **idéntico** |

**Cero discrepancias**: ni un nombre, ni un tipo, ni una interrogación de nulabilidad, ni
un `@db.Decimal(10, 2)`, ni el `@@unique`, ni la relación. El documento y el esquema
dicen exactamente lo mismo.

Y como el documento presume de describir «el modelo **real** que hay en
`prisma/schema.prisma` **y en la base de datos**», lo he contrastado también contra la
base **de verdad**, no sólo contra el esquema:

| Comprobación en la base | Resultado |
|---|---|
| Columnas de `SavingsSnapshot` (`information_schema`) | 10, en el orden documentado |
| Los cinco importes | `numeric`, precisión **10**, escala **2**, `is_nullable = NO` — como dice el 🔴 del documento |
| `date` | `date` NOT NULL |
| Índice único | `SavingsSnapshot_productId_date_key` sobre `("productId", date)` |
| Clave foránea | `FOREIGN KEY ("productId") REFERENCES "InvestmentProduct"(id)` |
| `pg_enum` de `InvestmentProductType` | `fund, etf, managed_portfolio, deposit, savings_account` — cinco, en ese orden |

El registro de columnas ya se lee como autoridad **sin mentir**.

## 2. Las incoherencias: comprobadas una a una, y busqué más

Mis **6 puntos**, cerrados:

| # de la 1ª pasada | Dónde está ahora | ✔ |
|---|---|---|
| 1 · enum con cinco valores | `docs/data-model.md:484` | ✔ |
| 2 · relación inversa `savingsSnapshots` | `docs/data-model.md:506` | ✔ |
| 3 · `model SavingsSnapshot` con sus siete columnas | `docs/data-model.md:538-556` | ✔ |
| 4 · diagrama de entidades | `docs/data-model.md:427` y `452-461` | ✔ |
| 5 · clave natural `(productId, date)` | `docs/data-model.md:642` | ✔ |
| 6 · `openedAt` / `closedAt` ya con escritor | `docs/data-model.md:218-219` y nota `227-238` | ✔ |

Las **10 que él añadió**, verificadas contra el código, no contra su palabra:

| Lo que arregla | Comprobación | ✔ |
|---|---|---|
| Cabecera de la Parte 2: cae «Sin endpoints, sin parser y sin importador» | Cierto: hay importador (F26) y no hay lectura. Y dice «sigue sin consultas», que es exacto | ✔ |
| Regla 4 extendida a los cinco importes | Coincide con R5 y con el código: los cinco viajan como `string` y no se derivan | ✔ |
| «tres índices» → **cuatro** declarativos | Contados en el esquema: `@@unique([bank,name])`, los **dos** `@@unique([productId,date])` y `@@index([productId])` = 4 | ✔ |
| «otros **tres** tipos» → **cuatro** para las columnas del depósito | `fund`, `etf`, `managed_portfolio`, `savings_account` = 4 | ✔ |
| 📌 «El **futuro** importador» → ✅ «Ya no es futuro (F26)» | `persistSavingsSnapshot` hace los dos upserts en una transacción y es el único escritor: lo vigila el guardián | ✔ |
| Regla de negocio **gemela** (cada tipo, su serie) | Coincide con la guarda real del servicio, incluido el matiz de que un `name` repetido con otro tipo **rechaza** en vez de convertir | ✔ |
| §Patrimonio: de dónde saldría el número de una cuenta remunerada | Marcado como consulta que **no existe todavía**: honesto | ✔ |
| §«Lo que NO está aquí»: parsers e importador ya hechos | Las features citadas existen y son las correctas: F10 `myinvestor-statement`, F13 `myinvestor-products`, F15 `product-opened-at`, F20 `trade-republic-product-file`, F12 `import` | ✔ |
| Fila nueva en la tabla de partes del documento (F26 / ADR-026) | El enlace a `specs/savings-account-as-product/design.md` **resuelve** | ✔ |
| Nota «Dos tablas de foto, no una» + tabla tipo→serie | Coherente con la regla del servicio y con el límite conocido del depósito, que sigue documentado | ✔ |

**Afirmaciones nuevas que he verificado contra el código porque eran verificables:**

- «el parser exige los cinco y comprueba que cuadren **en céntimos enteros y con un
  céntimo de margen**» → **cierto**: `checkBalanceEquation` redondea a céntimos y compara
  con `toleranceCents`, que es exactamente 1
  (`src/modules/trade-republic/trade-republic.product.parser.ts:172-198`).
- «`moneyIn` NO incluye los intereses» → cierto, es la ecuación que comprueba el parser.
- «si el fichero no trae `openedAt`, el fichero se rechaza entero» → **cierto**:
  `readIso('openedAt', true)`, obligatorio; `closedAt` es el único opcional.
- «`closedAt` sale del fichero tal cual, `null` incluido» y «una ausencia nunca cierra un
  producto» → cierto, el servicio copia el valor y no infiere nada.
- «es el **único** escritor de estas tablas en todo `src/`, lo vigila un guardián» →
  cierto, y el guardián asevera **igualdad de lista**, no «contiene».
- «`Movement.productId` sigue sin escritor: es la única fila de inversiones que queda en
  esta tabla» → cierto.

**¿Queda alguna afirmación que la F26 haya vuelto falsa y siga en pie?** Repasé el
documento entero buscando recuentos («tres/cuatro/cinco tipos»), marcas de pendiente
(«sin escritor», «todavía», «futuro», «no existe») y cada mención de `Valuation`.
**No he encontrado ninguna.** El único texto que podría chirriar —la nota de la F15 que
sigue diciendo «obligatorio en los **cuatro** tipos»— es correcto: describe **lo que hizo
la F15** en el fichero de MyInvestor, y enlaza a su propio documento.

**¿Ha creado incoherencias nuevas al reescribir?** No. Comprobado además:

- `npx prettier --check docs/data-model.md` → **limpio**.
- Los dos enlaces relativos nuevos resuelven a archivos que existen.
- El ancla nueva `#reglas-de-negocio-de-inversiones-las-vigila-el-servicio-no-la-bd`
  corresponde al encabezado real (`docs/data-model.md:688`).
- Ningún test lee `docs/data-model.md`, así que nada de esto está sostenido por la suite:
  por eso lo he contrastado a mano.

**Único apunte cosmético, no bloqueante:** `docs/data-model.md:243` quedó como una línea
de prosa de ~150 caracteres dentro de una cita, mientras el resto del archivo envuelve
sobre 90. Prettier lo acepta y no hay regla que lo prohíba; si se toca el archivo otra
vez, se envuelve y ya.

## 3. No ha tocado código, tests ni migración

Comprobado en el diff y en el disco, no en su palabra:

- `git status` devuelve **exactamente** los mismos archivos que en la primera pasada.
- Las fechas de modificación lo cierran: **todo** el código, los tests y la migración
  están sin tocar desde las **18:25** (antes de mi primera revisión, de las 21:47);
  `docs/data-model.md` es el **único** archivo con fecha posterior (**21:53**).
- `prisma/schema.prisma` (18:09) y `migration.sql` (18:10), intactos.

## 4. Requirements que quedaban pendientes por esto

El bloqueo no afectaba a ningún `R<n>`: los 15 ya estaban cubiertos y verificados en la
primera pasada, y **este cambio es sólo documental**, así que no reabre ninguno. Repasé
lo único que el cambio toca de lo ya aprobado:

- **R1 y R2** (esquema y migración): el documento ahora los **describe** bien; el esquema
  y la base no han cambiado, y lo he vuelto a comprobar contra `information_schema` y
  `pg_enum`. Siguen ✔.
- **R5** (nada se calcula): la regla 4 del documento ahora la enuncia. Sigue ✔.
- **R6 / R7** (idempotencia): la tabla de claves naturales ahora explica de qué clave
  cuelga. Probado en vivo en la primera pasada. Siguen ✔.
- El resto (R3, R4, R8-R15) no lo toca el cambio y queda como estaba: **aprobado**.

## Lo que corrijo de mi primera pasada

En la primera pasada escribí «C4 ✔ … el flake conocido **no** apareció». Con dos pasadas
no se ve; **con trece, sí**. Lo digo claro porque afecta a la confianza en el «816/816»:

- **`./init.sh` falló en 4 de ~13 pasadas completas**, siempre por **uno o dos** tests, y
  siempre con la **misma forma**: `expected 500 to be 200` en el listado de movimientos.
- Son **dos** sitios, no uno: `src/modules/movements/movements.test.ts:281` y
  `src/modules/import/import.routes.test.ts:164`. El que ya estaba fichado
  (`movements.test.ts:318`) es **la misma familia**: el mismo archivo y el mismo endpoint.
- **No es de esta feature.** Lo he acotado:
  - Los dos archivos, **ejecutados solos**: 5 de 5 pasadas verdes.
  - Ejecutando la suite **sin los archivos que crean y borran cuentas en masa**: 6 de 6
    pasadas verdes (716 tests).
  - Con la suite entera corriendo, lancé **4.602 lecturas** del mismo `listMovements`
    desde fuera: **0 fallos**. La consulta no está rota; lo que falla es el momento en
    que otro archivo de test **borra cuentas** mientras esa petición está en vuelo.
  - F26 no toca movimientos, ni cuentas, ni el camino de lectura.
- **Qué es realmente:** el defecto de que los tests trabajen sobre la base viva del
  humano en paralelo — **exactamente lo que la F27 `tests-dont-touch-real-db` tiene
  abierto**. F26 no lo causa; al añadir ~30 tests que crean y borran cuentas, sí le da
  más ocasiones de asomar.
- **Qué NO he hecho:** taparlo, reintentarlo ni tocar un test. No es mío y no es de esta
  feature.

**Consecuencia para el cierre, y es decisión del humano, no mía:** hoy «la suite está
verde» es cierto **la mayoría de las veces**, no siempre. Aprobar F26 no arregla eso, y
conviene tener presente que la F27 dejó de ser higiene y pasó a ser lo que hace fiable el
propio semáforo.

## Pendiente de cierre (sigue igual, y no lo puede hacer un agente)

1. **C4 bis — la prueba real.** Sin hacer: la base sigue con **0 productos y 0 fotos**.
   Ya no hay nada que la bloquee (la migración está aplicada). Es del humano, con su
   archivo ya renombrado, e informe a `progress/explorations/`.
2. **C5 — la base temporal `gastos_f26`** sigue creada en el contenedor; conviene
   borrarla al cerrar.
3. **Y el aviso de arriba sobre la F27.**

## Comprobado sin hallazgos (segunda pasada)

Bloque Prisma del documento contra `prisma/schema.prisma` campo a campo · el documento
contra la base real (columnas, nulabilidad, precisión, índice único, FK, enum) · las 6 +
10 incoherencias · búsqueda de afirmaciones supervivientes que la F26 volviera falsas ·
enlaces, anclas y Prettier del documento · alcance del cambio (sólo documentación) ·
recuento de la base antes y después · CHECKPOINTS C1, C2, C3, C5, C6, C7 sin cambios
respecto a la primera pasada · **C8: resumen de cierre escrito**.
