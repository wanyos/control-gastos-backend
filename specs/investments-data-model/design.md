# Design — Feature 9: investments-data-model

> CÓMO se construye lo descrito en `requirements.md`. No reinventa decisiones: se
> apoya en `docs/architecture.md` (Principios 1-5, **ADR-004** organización por
> módulos, **ADR-011** modelo del flujo) y en `docs/conventions.md` (dominio en
> inglés, prosa en español, tests junto al archivo). Toma como base el **plan
> aprobado por el humano** (`~/.claude/plans/ya-tenemos-la-estructura-valiant-noodle.md`),
> que ya fijó el esquema y el razonamiento; este documento lo materializa y amplía
> los porqués.
>
> **Alcance: solo esquema + migración.** Mismo alcance que la feature 8 tuvo con el
> flujo. **Sin endpoints, sin parser, sin importador y sin servicio.**
>
> Las decisiones delegadas se marcan **⭐ DECISIÓN PROPIA (aprobar en la puerta)**; de
> los seis puntos abiertos iniciales **siguen vivos dos** (marcados 🔴), y los cuatro
> cerrados tienen su bloque ✅ en la Procedencia de `requirements.md`.
>
> 📄 **Premisa que lo condiciona todo:** los productos de inversión **no** vendrán de
> un export del banco, sino de un **fichero de texto escrito a mano** por el humano,
> cuyo formato se define en la feature del parser. Por tanto **el fichero se hace a
> medida del modelo, no al revés**: no hay que defenderse de lo que un banco decida
> imprimir. Esa es la razón de fondo de casi todas las simplificaciones de abajo (cae
> el `isin`, cae la segunda clave compuesta, cae el `alias`, la clave natural es el
> nombre que escribe el humano).
>
> 🔗 **Reconciliado con la antigua feature 10 `myinvestor-parser`**, que ya definió
> esos formatos y que desde el 2026-08-11 está **partida en dos**: el extracto `.csv`
> del banco es [`specs/myinvestor-statement/`](../myinvestor-statement/design.md) y
> **el JSON por producto** —con plantillas en `docs/myinvestor-product-files.md`— es
> [`specs/myinvestor-products/`](../myinvestor-products/design.md). El balance completo
> para este esquema está en
> [`myinvestor-products/design.md` §12](../myinvestor-products/design.md).
> **Se revisaba en la misma puerta que esta.** Además el humano
> aportó **muestras reales del banco** (`var/drive-read/myinvestor/2026/`,
> gitignoreadas), que confirman el modelo **aritméticamente**.
>
> **Titular: el esquema Prisma de este spec NO cambia — ni una columna, ni un tipo, ni
> un índice, ni una precisión.** Lo que sí se ajustó aquí, todo texto:
>
> | # | Ajuste | Dónde |
> | --- | --- | --- |
> | 1 🟢 | **`marketValue` y `uninvestedCash` van APARTE: CONFIRMADO** por el humano y por la aritmética de la muestra → punto abierto **nº 1 cerrado** | §9, §12 |
> | 2 🟢 | **`interestRate` = TAE en porcentaje: CONFIRMADO**, y **una sola** TAE por depósito (la aplicada) → punto abierto **nº 2 cerrado** | §6, §12 |
> | 3 🟢 | **`closedAt` ya tiene escritor** → punto abierto **nº 3 cerrado** | §2.3, §7.1, §12 |
> | 4 🟢 | **`gain`/`gainPercent` obligatorios en el fichero** → punto abierto **nº 5 cerrado**; las columnas siguen `NULL`-ables | §6.1, §12 |
> | 5 🔴 | **R24 sin guardián de árbol**, pero por otra razón: el módulo `investments/` está **diseñado para crecer** (la f10 **no** lo toca; vive en `src/modules/myinvestor/`) | `requirements.md` R24, §11, T12 |
> | 6 🟡 | **`openedAt` se queda sin escritor**: el formato no lleva ese campo | §2.3 |
> | 7 🟡 | `investments.test.ts` → **`investments.model.test.ts`** | §1, §11 |
> | 8 📌 | El futuro importador tendrá que hacer **UPSERT también del producto** | §4.1, §12 |
> | 9 📌 | **Dos hallazgos nuevos del extracto real**: no trae saldo por movimiento ni IBAN | §9.1 |
>
> **Puntos abiertos que siguen vivos: dos** — el depósito sin valoraciones (§8) y el
> techo `Decimal(10,2)` (§6).

## 1. Estado actual → estado final

Hoy `prisma/schema.prisma` tiene el modelo del flujo (`Account`, `Category`,
`Movement` + 6 enums, ADR-011) y **nada** de inversiones:
`docs/data-model.md:321-326` dejó el hueco reservado a propósito ("Idea #3
(patrimonio e inversiones) se añade encima sin tocar lo anterior"). Esta feature
llena ese hueco de forma **estrictamente aditiva**.

**Archivos que se tocan** (el `implementer` los materializa; aquí solo se planifican):

```
prisma/
  schema.prisma                       # MODIFICAR (aditivo): + enum InvestmentProductType,
                                      #   + model InvestmentProduct, + model Valuation,
                                      #   + Movement.product/productId + @@index([productId])
  migrations/<ts>_investments/        # CREAR: 100 % GENERADA por prisma migrate dev (R22, R23)
src/
  modules/investments/
    investments.model.test.ts         # CREAR: único archivo que ESTA feature pone aquí (R24).
                                      #   🔗 El módulo está DISEÑADO PARA CRECER (el importador
                                      #   pondrá aquí su servicio): por eso el nombre lleva `.model.`
                                      #   y por eso NO hay guardián de "esta carpeta solo tiene un
                                      #   archivo" (ver R24). La f10 NO toca esta carpeta.
  architecture.test.ts                # MODIFICAR: + investments.model.test.ts al árbol esperado
                                      #   (entrada ADITIVA: comprueba que existe, no que sea el único)
docs/data-model.md                    # MODIFICAR: 2 partes, 5 reglas, esquema nuevo (R25)
docs/architecture.md                  # MODIFICAR: ADR-012 + árbol de carpetas (R26)
docs/api-contract.md                  # MODIFICAR: una nota, sin endpoints nuevos (R27)
progress/current.md                   # MODIFICAR: estado de la sesión
progress/implementations/investments-data-model.md   # CREAR: mapa de trazabilidad (R28)
```

**No se toca (regla dura, R17/R19):** ningún servicio del flujo
(`src/modules/accounts/**`, `src/modules/categories/**`, `src/modules/movements/**`),
`src/app.ts`, `src/errors/app-error.ts` (sin API no hay error de dominio nuevo),
`src/lib/**`, `src/plugins/**`, `package.json`, `.env`, ni el parser
(`src/modules/bankinter/**`).

**Sin dependencias nuevas y sin variables de entorno nuevas:** todo se hace con
Prisma/Postgres ya presentes → `docs/stack.md` no cambia.

## 2. ⭐ DECISIÓN PROPIA #1 — Esquema Prisma completo (R1-R9, R14, R16)

Una tabla de **identidad** (`InvestmentProduct`), una tabla de **foto**
(`Valuation`), una clave natural, y una columna reservada en `Movement`. En inglés,
como todo el dominio (`docs/conventions.md` §Idioma).

```prisma
// ── Enum ──────────────────────────────────────────────────
enum InvestmentProductType {
  fund               // fondo de inversión
  etf                // ETF
  // El nombre del tipo es el que usa el banco, no un dato del humano: colisiona con
  // var/ solo porque él llama al suyo igual. Por eso las dos líneas van marcadas.
  managed_portfolio  // cartera automatizada: UN producto con su valor total  // no-real-data-ok
  deposit            // depósito a plazo: el único con parte específica  // no-real-data-ok
}

// ── Modelos ───────────────────────────────────────────────
/// La abstracción: lo que todo producto de inversión tiene, sea del tipo que sea.
model InvestmentProduct {
  id       Int                   @id @default(autoincrement())
  bank     String                // ⭐ slug de la carpeta de Drive, igual que Account.bank
  name     String                // ⭐ lo escribe el humano en el fichero → es estable
  type     InvestmentProductType
  currency String                @default("EUR")

  openedAt DateTime? @db.Date    // contratación / primera aportación
  closedAt DateTime? @db.Date    // ⭐ RESERVADA. NULL = vivo. Sin enum `status` (§7)

  // ── Parte específica del depósito (NULL en fund / etf / managed_portfolio) ──
  // No fluctúa: se escribe al contratarlo y no se vuelve a tocar. Por eso un
  // depósito NO tiene filas en Valuation (regla vigilada por el servicio, §8).
  principal    Decimal?  @db.Decimal(10, 2)  // capital contratado
  interestRate Decimal?  @db.Decimal(6, 4)   // ⭐ TAE EN PORCENTAJE: 2.7500 = 2,75 % (§6)
  expectedGain Decimal?  @db.Decimal(10, 2)  // ganancia final, conocida desde el día uno
  maturityDate DateTime? @db.Date            // vencimiento

  valuations Valuation[]
  movements  Movement[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([bank, name])   // ⭐ clave natural (§3)
}

/// La foto periódica de un producto que fluctúa (fund, etf, managed_portfolio).
model Valuation {
  id        Int               @id @default(autoincrement())
  product   InvestmentProduct @relation(fields: [productId], references: [id])
  productId Int
  date      DateTime          @db.Date

  invested       Decimal  @db.Decimal(10, 2)  // ⭐ CRECE con las aportaciones mensuales (§2.1)
  marketValue    Decimal  @db.Decimal(10, 2)  // lo que vale hoy si lo vendes
  gain           Decimal? @db.Decimal(10, 2)  // CON SIGNO: una pérdida es negativa
  gainPercent    Decimal? @db.Decimal(7, 4)   // CON SIGNO: -3.4700 = −3,47 %
  uninvestedCash Decimal? @db.Decimal(10, 2)  // 🔴 efectivo sin invertir; ¿aparte del marketValue? (§9)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt   // recargar el mismo fichero es UPSERT: gana el último (§4)

  @@unique([productId, date])     // ⭐ una foto por producto y fecha (§3)
}
```

Y dentro de `model Movement`, **junto a `transferId`** (la única línea que toca el
núcleo del flujo):

```prisma
  product   InvestmentProduct? @relation(fields: [productId], references: [id])
  productId Int?    // RESERVADA (regla 5, §10). ⚠️ NO sirve para derivar `invested`

  @@index([productId])   // gemelo de @@index([transferId])
```

> ⚠️ **`Movement.productId` NO sirve para derivar `invested`.** La tentación es
> obvia: "si tengo los movimientos enlazados, puedo sumar las aportaciones y sacar
> el capital invertido". **No.** El `invested` de una foto es el número que da el
> banco (regla 4); la suma de los movimientos enlazados es otra cosa (le faltan las
> aportaciones anteriores a la primera importación, los traspasos internos del banco
> de inversión, las comisiones…). Son dos datos distintos que casualmente se
> parecen. El enlace sirve para **no contar la aportación como gasto** (regla 5) y,
> más adelante, para navegar del movimiento a su producto.

### 2.1 Por qué `invested` está en la foto y `principal` en el producto

Es la consecuencia directa de las **aportaciones mensuales**: el capital invertido
de un fondo **no es un dato del producto, es un dato de la fecha**. En marzo llevas
12.000 € y en abril 12.300 €. Guardarlo en `InvestmentProduct` obligaría a
**pisarlo cada mes** y perderías la serie, que es justo lo que permite distinguir
*"ha subido porque metí dinero"* de *"ha subido porque el mercado subió"* — la
pregunta que el `intent` quiere poder responder.

El **depósito es el caso contrario y por eso su `principal` sí va en el producto**:
se contrata una vez, con sus condiciones cerradas (capital, TAE, ganancia final,
vencimiento), y no vuelve a tocarse. No fluctúa → no necesita foto. Ese contraste
es lo que justifica que las cuatro columnas del depósito vivan en la tabla de
identidad y las cinco de la valoración en la tabla de foto.

### 2.2 Lo que se cae respecto a la primera propuesta (y por qué)

| Se cae | Por qué |
| --- | --- |
| `units` y `unitPrice` (participaciones y valor liquidativo) | El `que_no_quiero` lo prohíbe explícitamente: "ese nivel de detalle o es muy complejo o no se adapta a lo que quiero". Y complicaría el fichero que el humano escribe a mano. |
| `isin` | Servía para identificar un fondo **si el banco lo renombraba**. Escribiendo tú el nombre en tu propio fichero, no existe esa amenaza. |
| Segunda clave `(bank, name, maturityDate)` para depósitos | Sobra por lo mismo: dos depósitos los distingues tú al nombrarlos ("Depósito 12M 2026"). |
| `alias` | El `name` ya lo eliges tú; un alias sería un segundo nombre elegido por ti para lo mismo. |
| Valoraciones del depósito | No fluctúa (§2.1, §8). |
| Desglose de la cartera automatizada | `que_no_quiero`: "la quiero como un producto con su valor total, igual que un fondo". Sin autorreferencia, sin tabla de composición (R3). |

Queda **una tabla de identidad, una de foto, una clave natural y cero SQL crudo**.

### 2.3 Columnas reservadas que esta feature deja (sin escritor todavía)

Mismo patrón que la feature 8 con `transferId` y `categoryId`: se definen ahora
porque son el cimiento de lo que viene, y se anotan para que nadie las dé por rotas.

| Columna | Quién la rellenará |
| --- | --- |
| `Movement.productId` | la feature de **importación/enlace de aportaciones**, sobre el parser del fichero de inversiones (regla 5, §10) |
| `InvestmentProduct.closedAt` | ✅ **el importador, del fichero** (feature 10). Ya no es un punto abierto: el fichero lleva un `closedAt` **opcional** que el humano escribe **una sola vez**, en la última aparición del producto, y **dejar de escribir un producto NO lo cierra** — un olvido no puede parecer un cierre ([`myinvestor-products/design.md` §8](../myinvestor-products/design.md)) |
| `InvestmentProduct.openedAt` | 🟡 **nadie, de momento: se queda `NULL`.** El formato de la feature 10 **no lleva** este campo (una fecha que no cambia sería un dato más que teclear cada mes, y no es ninguno de los que el `intent` enumera). Si algún día se quiere, es un campo opcional más del fichero y **cero migración**, porque la columna ya existe |

## 3. ⭐ DECISIÓN PROPIA #2 — Claves naturales: `(bank, name)` y `(productId, date)` (R6, R14)

**Producto: `@@unique([bank, name])`.** Es lo que identifica a un producto **entre
cargas del fichero**. Basta porque el `name` **lo escribe el humano en un fichero
hecho a mano**, luego es estable por construcción: no hay un banco que pueda
renombrar "Fondo Renta Fija Europa" a "FRFE Clase A" a mitad de año. Esa estabilidad
es exactamente lo que hace innecesarios el `isin` y la segunda clave compuesta
(§2.2). El `bank` entra en la clave para no bloquear un futuro segundo banco de
inversión con un producto homónimo.

- **Consecuencia que el humano debe conocer (🔴 en Procedencia):** si un día
  **renombras** un producto en el fichero, el importador lo verá como un producto
  **nuevo** y la serie anterior quedará colgando del nombre viejo. Es el precio de
  usar el nombre como clave; a cambio, el fichero no necesita ningún identificador
  técnico que el humano tendría que copiar a mano (y equivocarse).

**Foto: `@@unique([productId, date])`.** Una foto por producto y fecha. Es también
el índice que **sirve al 100 %** la consulta de patrimonio de la feature posterior
("la valoración más reciente con `date <= D`"), sin ningún índice adicional: en
Prisma se hará con el patrón que ya existe vivo en `listAccounts`
(`src/modules/accounts/accounts.service.ts:87-99`): `include` con
`orderBy: { date: 'desc' }, take: 1`.

- **Alternativa descartada — clave sintética + índice no único:** permitiría dos
  fotos del mismo día "por si acaso", pero rompe el criterio que el humano pidió
  literalmente ("la foto de un producto en una fecha es única") y obligaría a
  decidir cuál gana al leer. La unicidad en la BD lo cierra en el sitio correcto.

## 4. ⭐ DECISIÓN PROPIA #3 — Recargar el mismo fichero es un **UPSERT** (R15)

El humano lo pidió casi literal: *"volver a cargar el mismo archivo no duplica nada:
la foto de un producto en una fecha es única y se queda con el último dato
cargado"*. La materialización es directa:

```
upsert(where: { productId_date: { productId, date } },
       create: {...}, update: {...})     // gana el último; updatedAt avanza
```

🔴 **Ojo: es una resolución de conflicto DISTINTA a la del flujo.** Conviene dejarlo
escrito aquí para que el futuro importador no invente una tercera:

| Colisión | Modelo del flujo (ADR-011) | Modelo de inversiones (esta feature) |
| --- | --- | --- |
| Clave | `(accountId, bookingDate, type, amount, description, daySequence)` `WHERE origin='imported'` | `(productId, date)` |
| Qué pasa | El duplicado se **descarta** (`skipDuplicates`): el movimiento ya importado es **el mismo hecho**, reimportarlo no aporta nada | El duplicado **sobrescribe**: la foto es una **medición** que puede corregirse (el banco publica el valor definitivo un día después) |
| Por qué | Un movimiento es un hecho pasado inmutable | Una valoración es un dato observado que puede refinarse |

`updatedAt` (`@updatedAt`) es lo que deja rastro de que la foto se reescribió; por
eso `Valuation` lleva `updatedAt` y el test de R15 comprueba que **avanza**.

- **Alternativa descartada — versionar las fotos** (guardar todas las cargas de la
  misma fecha con un `loadedAt`): daría auditoría de correcciones, pero multiplica
  filas para un dato que el humano quiere simple, y obliga a filtrar "la última" en
  cada consulta. El humano pidió explícitamente "que gane el último".

### 4.1 📌 Observación para el futuro importador — también hay que hacer UPSERT del **producto**

Este spec solo dejó escrita la resolución por UPSERT de la **valoración**. Al ver el
formato de la feature 10 aparece una segunda, del mismo tipo y fácil de olvidar:

🔗 **Cada fichero mensual re-afirma la identidad y las condiciones de TODOS los
productos** ([`myinvestor-products/design.md` §7](../myinvestor-products/design.md)): el humano copia el fichero del
mes pasado y actualiza solo los números que cambian, así que el depósito vuelve a
venir entero —`principal`, `interestRate`, `expectedGain`, `maturityDate`— mes tras
mes hasta que vence. Por tanto el importador **no puede hacer `create` del producto**:
tiene que hacer **UPSERT sobre `@@unique([bank, name])`** (crear si es nuevo,
actualizar sus condiciones si ya existe). Un `create` a secas reventaría con `P2002`
en el segundo fichero.

**No es un cambio de esquema ni una task de esta feature** —aquí no hay importador—,
pero queda escrito para que la feature que lo escriba no tenga que redescubrirlo:
**dos upserts, no uno.** El del producto sobre `(bank, name)`, el de la foto sobre
`(productId, date)`.

## 5. ⭐ DECISIÓN PROPIA #4 — Cero SQL crudo: todos los índices son declarativos (R23)

**Es el punto fuerte de esta feature frente a la 8, y hay que decirlo explícitamente.**

Las tres restricciones de este modelo —`@@unique([bank, name])`,
`@@unique([productId, date])` y `@@index([productId])`— son **declarativas en el
schema**. Por tanto:

- **Prisma las conoce.** No hay ningún objeto de base de datos que viva solo en el
  archivo de migración.
- **No puede haber drift.** La feature 8 sí arrastra ese riesgo: sus dos índices
  (el único **parcial** del dedup y el `NULLS NOT DISTINCT` de categoría raíz) están
  escritos a mano en `prisma/migrations/20260806191700_data_model/migration.sql`
  porque **Prisma 7 no puede expresarlos** (`@@index(where:, unique:)` es de Prisma
  8). Aquí no hace falta nada de eso.
- **La migración se genera y no se toca:** `pnpm exec prisma migrate dev --name
  investments`. Ni una línea escrita a mano (R23). Si el `.sql` generado necesitara
  edición manual, es señal de que el schema está mal, no de que falte SQL.

Esta propiedad es la que hace que la §8 (depósito sin valoraciones) se resuelva por
regla de servicio: meter un `CHECK` **rompería** justo esto.

## 6. ⭐ DECISIÓN PROPIA #5 — Precisión decimal y `interestRate` como TAE en porcentaje (R4, R5, R8)

| Campo | Tipo | Techo | Por qué |
| --- | --- | --- | --- |
| `principal`, `expectedGain`, `invested`, `marketValue`, `gain`, `uninvestedCash` | `Decimal(10,2)` | ±99.999.999,99 (~100 M €) | **Heredado del flujo** (`Movement.amount`, `Account.initialBalance`). Que las dos capas tengan el mismo techo es más importante que el techo en sí: si se sube, se sube **en las dos a la vez**. Ya era el punto abierto nº 2 de `docs/data-model.md`. |
| `interestRate` | `Decimal(6,4)` | 99,9999 % | 4 decimales cubren cualquier TAE publicada (2,75 %, 3,4567 %). |
| `gainPercent` | `Decimal(7,4)` | ±999,9999 % | Un dígito entero más que `interestRate`: una ganancia acumulada **sí** puede pasar del 100 %. |

🔴 **`interestRate` es TAE EN PORCENTAJE, no fracción.** `2.7500` significa **2,75 %**,
no 275 %. Es el error clásico de este campo y **el modelo no puede detectarlo solo**:
guardar `0.0275` "porque es la fracción" produciría un depósito al 0,0275 % que nadie
notaría hasta calcular intereses. Mitigación: la unidad queda escrita en el
comentario del schema, en `docs/data-model.md` y en el ADR, y el test de R5 la fija
con un valor reconocible (`2.7500`).

### 6.0 ✅ CONFIRMADO — porcentaje, y **una sola** TAE por depósito

Era el punto abierto nº 2 y está cerrado. La feature 10 fija la misma semántica con las
mismas palabras (`"interestRate": "3"` es una TAE del 3 %,
[`myinvestor-products/design.md` §6](../myinvestor-products/design.md)), y las dos capas diciendo lo mismo es lo único
que protege de este error.

La muestra real (`var/drive-read/myinvestor/2026/deposito.txt`) añadió un matiz que
**tampoco cambia el esquema**: la ficha del banco trae **dos** TAE con sus dos
intereses brutos —

```
1 % TAE sin Premium  |  2 % TAE con Premium
Interés bruto con Premium 50,00 €   /   sin Premium 25,00 €
```

> Forma real, **cifras inventadas** (10.000 € a 3 meses): `docs/conventions.md` §Tests
> prohíbe versionar las del humano y `src/no-real-data.test.ts` lo hace cumplir.

— y **el humano decidió guardar solo la que se le aplica**: tiene Premium, así que su
depósito está al **2 %** con `expectedGain` **50,00 €**. La otra pareja describe un
producto que él no tiene: es **información comercial**, no una condición de su
depósito, y responder *"¿cuánto ganaría si no tuviera Premium?"* no es ninguna de las
preguntas que el `intent` quiere poder contestar.

- **El modelo encaja tal cual:** `InvestmentProduct` ya tiene **exactamente un**
  `interestRate` y **un** `expectedGain` (R4). **Cero columnas nuevas.**
- **La TAE no aplicable no se guarda en ninguna parte.** No hay `interestRateBase`, ni
  un JSON de condiciones, ni nada parecido.
- **Alternativa descartada — guardar las dos TAE** (dos columnas más, o un par
  `{sinPremium, conPremium}`): duplicaría el ancho del depósito para responder una
  pregunta hipotética, y ataría el modelo a la mecánica comercial de **un** banco
  concreto. Si algún día hace falta, es una columna nullable más.

### 6.1 ✅ `gain` y `gainPercent`: nullable en la BD, obligatorios en el fichero

Este spec los dejó **nullable** porque "el que manda es el fichero y ese fichero
todavía no existe". **Ya existe, y los exige**
([`myinvestor-products/requirements.md` R33-R39](../myinvestor-products/requirements.md)): si el humano se deja la ganancia, el
producto se reporta como no parseado y lo ve. El punto abierto nº 5 queda **cerrado**.

**Aun así las columnas se quedan `NULL`-ables**, por recomendación explícita de la
feature 10 (§14 nº 4) y por dos razones:

- **Es un seguro que no cuesta nada.** Si algún día el formato deja de exigirlos
  (aparece un producto cuyo banco no publica la ganancia), no hará falta migración.
- **La restricción vive donde puede dar un mensaje útil.** El parser dice *"al
  producto «Fondo X» le falta `gain`"*; una columna `NOT NULL` solo daría un `P2011`
  desde las tripas de Prisma.

Misma filosofía que el resto del proyecto: **la BD impone identidad y unicidad; la
coherencia de dominio se impone donde se puede explicar** (§8).

**Nota para el implementer sobre los tests de precisión:** Prisma devuelve los
`Decimal` como objetos `decimal.js`, cuyo `.toString()` **elimina los ceros a la
derecha** (`-3.4700` → `'-3.47'`). Compara siempre con **`.toFixed(2)` / `.toFixed(4)`**,
como ya hace `src/modules/movements/movements.test.ts` con los saldos.

## 7. ⭐ DECISIÓN PROPIA #6 — Sin `origin` ni `status` en `Valuation`; solo `closedAt` en el producto (R7)

**Por qué `Valuation` NO copia `origin` ni `status` de `Movement`.** En el flujo esos
dos campos tienen razones de ser muy concretas (ADR-011), y **ninguna de las dos
existe aquí**:

| Campo del flujo | Su razón de ser en `Movement` | ¿Aplica a `Valuation`? |
| --- | --- | --- |
| `origin (imported\|manual)` | Mantener **PARCIAL** el índice único de dedup (`WHERE origin='imported'`) para no imponer unicidad a los movimientos manuales | **No.** Aquí la unicidad es total y deseada: una foto por producto y fecha, venga de donde venga. |
| `status (pending_review\|confirmed)` | Alimentar la **pantalla de revisión** de lo importado (idea #1) | **No.** Una valoración no se revisa: es un número del banco que el humano transcribe él mismo a su fichero. |

Añadirlos "por simetría" sería cargar dos columnas muertas en cada foto.

**Y en el producto, solo `closedAt`, sin enum `status`.** Un producto está vivo si
`closedAt IS NULL`. Un enum `status (active|closed)` sería un **booleano derivable
duplicado**: dos fuentes de verdad para el mismo hecho que tarde o temprano se
desincronizan (un producto `active` con `closedAt` en el pasado). Misma familia de
razonamiento que hizo caer el enum `MovementDirection` en ADR-011.

- **Alternativa descartada — `isClosed Boolean @default(false)`:** aún peor, porque
  además pierde **cuándo** se cerró, que es el dato que la consulta de patrimonio
  necesita para excluir un depósito vencido a una fecha pasada.

### 7.1 ✅ Quién escribe `closedAt` (contestado por la feature 10)

Este spec dejaba abierto **quién** rellena la columna, temiendo que hubiera que
inferirlo de la ausencia de un producto en el fichero. La feature 10 lo cierra y con
una regla mejor que el temor ([`myinvestor-products/design.md` §8](../myinvestor-products/design.md), R30-R31):

- **El fichero lleva un `closedAt` opcional** en cualquier producto, que el humano
  escribe **una sola vez**: en la última aparición del producto, el mes en que vence o
  se reembolsa.
- 🔴 **Dejar de escribir un producto NO lo cierra.** Un mes con prisa en el que te
  dejas un fondo cerraría un producto vivo y el patrimonio se desplomaría sin motivo.
  Convertir una **ausencia** (que puede ser un olvido) en un **hecho** (el producto se
  acabó) es exactamente la inferencia que no debe hacer un sistema con dinero dentro.
- **El importador no infiere nada de las ausencias**; como mucho, avisará.

Y confirma de rebote la decisión de arriba: la feature 10 descartó `"closed": true`
en el fichero **por la misma razón** por la que aquí cayó el enum `status` — pierde la
fecha, que es justo lo que la consulta de patrimonio necesita.

## 8. ⭐ DECISIÓN PROPIA #7 — Un depósito sin valoraciones: regla de SERVICIO, no `CHECK` (R20)

**Decisión: regla de negocio vigilada por el servicio, no restricción de BD.**

El humano delegó la elección explícitamente. Elijo la regla de servicio por tres
razones, en orden de peso:

1. **Coherencia con el proyecto.** Todas las reglas de negocio del modelo ya viven
   ahí: `amount` siempre positivo, `type` inmutable, un solo nivel de categoría, el
   `kind` de la hija igual al del padre (`docs/data-model.md:186`). La BD impone
   **identidad y unicidad**; el servicio impone **coherencia de dominio**.
2. **Mantiene el cero SQL crudo (§5).** Prisma 7 no expresa un `CHECK` en el schema,
   así que la única vía sería escribirlo a mano en la migración — reintroduciendo
   exactamente el riesgo de drift que esta feature evita.
3. **No hay escritor todavía.** Esta feature no tiene servicio ni importador: el
   `CHECK` protegería contra un escritor que aún no existe, y cuando exista tendrá
   que validar de todas formas (para dar un error legible en vez de un `P2010`).

⚠️ **Coste asumido y explícito:** hoy **nada** impide insertar una `Valuation` sobre
un producto `deposit`. El test de R20 lo deja **escrito como límite conocido** (y
saltaría si alguien añadiera un `CHECK` en silencio, obligando a actualizar el spec).

- **Alternativa (si el humano la prefiere en la puerta) — `CHECK` en SQL crudo:**
  ```sql
  ALTER TABLE "Valuation" ADD CONSTRAINT "Valuation_not_on_deposit"
    CHECK (...);  -- requiere mirar el tipo del producto → hace falta un trigger
  ```
  🔴 Y aquí aparece el problema real: un `CHECK` **no puede consultar otra tabla**.
  Impedirlo en la BD exigiría un **trigger** o desnormalizar el `type` en
  `Valuation`. Las dos opciones son notablemente más caras que una línea en el
  futuro servicio. Es una razón adicional —técnica, no estilística— para la regla de
  servicio.

## 9. ✅ CONFIRMADO — `marketValue` y `uninvestedCash` van **aparte** (R21)

**Era el punto abierto nº 1 y el único de este spec capaz de producir un patrimonio
neto equivocado. Está cerrado, y la suposición del diseño era la correcta.**

El **valor de mercado NO incluye el efectivo sin invertir**, así que el patrimonio de
un producto a una fecha es:

```
patrimonio(producto, D) = marketValue + uninvestedCash    # de su Valuation más reciente con date <= D
```

**Dos pruebas independientes, ambas del humano:**

1. **Su explicación, con la web del banco delante:** *"El efectivo queda fuera de
   cualquier total, eso siempre se queda como remanente; normalmente hago un ingreso
   de ‹cantidad redactada› mensuales y una vez invertido ese dinero o una cantidad similar se queda
   como dinero metálico fuera del resto de cantidades."*
2. **La aritmética de las muestras reales** (`var/drive-read/myinvestor/2026/`), que
   es la prueba que no depende de cómo se lea una frase:

   | Muestra | Invertido | Ganancia | Suma | Valor de mercado | Efectivo |
   | --- | --- | --- | --- | --- | --- |
   | `indi.txt` (cartera) | 8.250,45 | 1.250,15 | **9.500,60** | **9.500,60** ✅ | 75,25 **fuera** |
   | `fondo.txt` (fondo) | 2.000,00 | 150,00 | **2.150,00** | **2.150,00** ✅ | — |

   > Es la aritmética real, con **cifras inventadas** (2026-08-12, F14): los importes
   > del humano no se versionan. Lo que el ejemplo enseña —que la suma cuadra al
   > céntimo y que el efectivo queda fuera— es exactamente lo mismo.

   El valor de mercado cuadra **al céntimo** con `invertido + ganancia`, sin el
   efectivo. Si el banco lo llevara dentro, la cartera tendría que marcar 9.575,85.

**Conclusión: no hay doble conteo.** La suma es correcta y así queda escrita en
`docs/data-model.md` y en el ADR-012 (R21). El esquema no cambia (nunca iba a cambiar
en ninguno de los dos casos); lo que se cierra es **cómo suma** la futura consulta de
patrimonio.

**Cálculo completo del patrimonio neto a una fecha `D`** (consulta de una feature
posterior, aquí solo documentado):

- **Productos que fluctúan y están vivos** (`closedAt IS NULL`): por cada uno, su
  `Valuation` más reciente con `date <= D` → `marketValue + uninvestedCash`.
- **Depósitos vivos:** su `principal` (no fluctúa; el `expectedGain` solo se realiza
  al vencimiento).
- **Cuentas:** el saldo que ya calcula `computeAccountBalance` (ADR-011) — con el
  matiz importante de §9.1.

### 9.1 📌 Dos hallazgos del extracto real que afectan al saldo (sin cambio de esquema)

Las muestras trajeron dos hechos sobre el **extracto de la cuenta corriente** de este
banco (`Movimientos Mi Cuenta MyInvestor.csv`) que no cambian ni una columna de este
spec, pero que **son del modelo** y conviene tenerlos escritos donde se leen. Los
verificó la feature 10 sobre el archivo real
([`myinvestor-statement/design.md`](../myinvestor-statement/design.md) §3.4 y §3.5).

**1. Este banco NO da saldo por movimiento.** Las columnas son
`Fecha de operación;Fecha de valor;Concepto;Importe;Divisa` — **no hay columna de
saldo**. Consecuencia directa sobre ADR-011 decisión 3, que fijó que *"el saldo de la
cuenta se LEE del extracto"* y dejó la suma desde `initialBalance` como **caso
excepcional** ("un banco sin saldo corrido"):

> 🔴 **Para esta cuenta, el caso excepcional pasa a ser el camino normal.**
> `Movement.balanceAfter` será **siempre `NULL`**, así que `computeAccountBalance`
> (`src/modules/movements/movements.service.ts:56`) no encontrará ningún movimiento
> con saldo y caerá en la rama que suma desde `initialBalance`. **El código ya lo
> soporta sin tocar una línea** — la rama existe y está testeada desde la feature 8;
> ni este spec ni el de la feature 10 necesitan cambiarlo.
>
> 📌 **Lo que sí cambia es una obligación operativa: `Account.initialBalance` deja de
> ser un dato decorativo y pasa a ser el único ancla del saldo de esa cuenta.** Si se
> da de alta con `0` "ya se corregirá luego", el saldo será siempre erróneo por esa
> cantidad y **no habrá ningún `balanceAfter` del banco que lo desmienta**. En
> Bankinter un `initialBalance` mal puesto es inofensivo (el saldo del extracto lo
> tapa); aquí no.

**2. El extracto tampoco trae el IBAN.** No hay preámbulo: la primera línea ya es la
cabecera. Consecuencia para el futuro importador:
`findOrCreateAccountFromMetadata` (feature 8, ADR-011 decisión 9) exige **IBAN +
banco** y lanza `MissingAccountDataError` (422) cuando falta alguno, así que para esta
cuenta **siempre** lo lanzará y habrá que **darla de alta a mano** por
`POST /api/accounts`.

> ✅ **Esto es el comportamiento previsto, no un problema.** Es exactamente el camino
> que la feature 8 diseñó para este caso: un código de error **distinguible**
> (`MISSING_ACCOUNT_DATA`, 422, separado de `VALIDATION_ERROR` y de `NOT_FOUND`)
> precisamente *"para que el frontend pueda ofrecer el alta manual exactamente en ese
> caso"* (ADR-005). El primer banco que ejercita ese camino es este. Nada que
> arreglar; solo conviene saberlo **antes** de importar, y saber que el
> `initialBalance` que se teclee en esa alta manual es el ancla del punto 1.

## 10. Las dos reglas nuevas del modelo (4 y 5) y su alcance REAL en esta feature

Van a `docs/data-model.md` junto a las tres actuales, numeradas **4** y **5** porque
**extienden** las reglas 2 y 3 con el mismo razonamiento (regla 2 → regla 4: el
número lo da la fuente; regla 3 → regla 5: el apunte ya existe, solo se enlaza).

> **4. La valoración se lee, no se calcula.** `invested`, `marketValue`, `gain`,
> `gainPercent` y `uninvestedCash` se guardan **tal como vienen en el fichero**. La
> app **nunca** persiste `gain = marketValue − invested`: si un día el número
> guardado y la resta no cuadran, **manda el guardado**, porque es el que da el
> banco. Campo que el fichero no traiga → `NULL`, **nunca** un valor calculado.
> (Derivar al leer para pintar una pantalla, sí; **persistir lo derivado, no**.)
>
> **5. Una aportación no se crea: se marca.** La aportación mensual a un fondo **ya
> es un movimiento del extracto** de la cuenta corriente. La app no fabrica un
> segundo apunte: lo único propio es `Movement.productId`. Consecuencia de
> agregación, gemela de la del traspaso: **un movimiento con `productId != null` no
> cuenta como gasto ni como ingreso en los totales globales** — no has gastado ese
> dinero, lo has cambiado de sitio. Un reembolso es lo mismo con el signo cambiado
> (`income` + `productId`), **sin columna nueva**.

**Alcance real en esta feature (importante, R18/R19):**

| Regla | Qué entrega esta feature | Qué queda para después |
| --- | --- | --- |
| **4** | Se materializa en el **esquema**: `gain`/`gainPercent` nullable, ningún default calculado, y el **test de R13** que exige que un `gain` incoherente se devuelva tal cual | Que el parser respete la regla al leer el fichero |
| **5** | Se materializa la **columna** (`Movement.productId` + índice) y se **documenta** la regla de agregación | La **exclusión en `computeTotals`**, junto al escritor de la columna |

🔴 **Divergencia consciente con la feature 8** (marcada en Procedencia): allí
`transferId` nació sin escritor **pero** `computeTotals` ya lo excluía. Aquí el plan
congela los servicios del flujo ("solo esquema + migración"), así que la exclusión de
`productId` se implementará con su escritor. **Efecto práctico hoy: cero**, porque
`productId` es siempre `null`. Si el humano prefiere la simetría, es una línea en
`computeTotals` más su test — y **entonces** habría que tocar `movements.service.ts`,
`movements.types.ts` y `movements.test.ts`.

## 11. Estrategia de test (Nivel 2 de `docs/verification.md`)

**Todo vive en `src/modules/investments/investments.model.test.ts`**, el **único**
archivo que esta feature pone en el módulo (R24). Precedente de carpeta parcial:
`src/modules/health/` (solo `health.routes.ts` + `health.test.ts`).

🔗 **Por qué `.model.` en el nombre:** este módulo **va a crecer**. La feature de
importación pondrá aquí `investments.service.ts` (el que enlaza productos, escribe
`Valuation` y rellena `Movement.productId`) con su `investments.service.test.ts`, y más
adelante llegarán las rutas de consulta de patrimonio. Rodeado de ellos, un
`investments.test.ts` a secas no diría "¿el test de qué?". `investments.model.test.ts`
lo dice: los tests del **modelo** (Prisma contra Postgres real).

> Las features del parser de MyInvestor **no** ponen nada en esta carpeta: su código
> vive en `src/modules/myinvestor/`, porque la norma del proyecto es **un parser por
> banco** y el módulo no puede llamarse como el dominio que no es
> ([`myinvestor-statement/design.md` §2](../myinvestor-statement/design.md)).

- **Integración contra el Postgres real** (`localhost:5434`, `docker-compose`) vía
  `buildApp()` + `app.prisma`, **sin mocks**, limpiando las filas creadas en un
  `afterEach`.
- 🔴 **Como no hay endpoints, se siembra con Prisma dentro del test** — exactamente
  el mismo patrón que `src/modules/movements/movements.test.ts` (que ya siembra los
  movimientos con `app.prisma.movement.create` porque `/api/movements` es de solo
  lectura). No hay `app.inject()` en este archivo.
- **Limpieza:** borrar en orden `movement` → `valuation` → `investmentProduct` →
  `account` (las FKs son `ON DELETE RESTRICT` por defecto en Prisma). Usar nombres de
  producto con sufijo aleatorio para no chocar con `@@unique([bank, name])` entre
  ejecuciones.
- **Precisión:** comparar `Decimal` con `.toFixed(2)` / `.toFixed(4)`, nunca con
  `.toString()` (§6).
- **Fechas `@db.Date`:** sembrar con `new Date('2026-03-31T00:00:00.000Z')`, como
  hace `movements.test.ts` con `bookingDate`.

**Cobertura mínima (cada bloque ↔ su `R<n>`):**

| Test | Cubre |
| --- | --- |
| Alta de los cuatro tipos: `fund`, `etf` y `managed_portfolio` con las 4 columnas de depósito a `NULL`; `deposit` con las cuatro rellenas y recuperadas idénticas | R1, R2, R3, R4, R5 |
| `@@unique([bank, name])`: mismo banco + mismo nombre → `P2002`; mismo nombre en otro banco → OK | R6 |
| `closedAt` null / con fecha; el enum generado tiene exactamente 4 valores | R2, R7 |
| `Valuation` completa con su precisión exacta | R8 |
| **Serie de tres valoraciones** del mismo fondo en tres fechas con `invested` creciente → las tres se conservan y salen ordenadas por `date` | R9, R10 |
| `gain = '-1234.56'` y `gainPercent = '-3.4700'` round-trip | R11 |
| `uninvestedCash` a `NULL` en un producto y con valor en otro | R12 |
| `gain` **incoherente** con `marketValue − invested` → se devuelve el guardado, no el calculado; `gain` ausente → `null`, no derivado | R13 |
| `@@unique([productId, date])`: duplicado → `P2002`; misma fecha en otro producto → OK | R14 |
| **`upsert`** sobre `(productId, date)`: mismo `id`, `marketValue` nuevo, `count` sigue 1, **`updatedAt` avanza** | R15 |
| `Movement.productId` enlazado → se recupera con `include: { product: true }`; movimiento creado por el camino existente → `productId = null` | R16 |
| `Valuation` sobre un `deposit` → **hoy la BD lo permite** (límite conocido documentado; el test salta si alguien añade un `CHECK`) | R20 |
| **La suite completa en verde sin que cambie ningún test del flujo** (`accounts`, `categories`, `movements` intactos) | R17, R19, R22 |

🔗 **Lo que NO se testea aquí (y por qué): el guardián de R24.** Una versión anterior de
este design pedía un test en `architecture.test.ts` que afirmara que
`src/modules/investments/` contenía **exactamente** un archivo. **No debe escribirse**,
porque `src/modules/investments/` es un módulo **diseñado para crecer**: la feature de
importación pondrá aquí su servicio y más adelante llegarán las rutas de patrimonio. Un
test que afirme "este módulo tiene exactamente un archivo" no describe un **invariante
de arquitectura**, sino una **foto de un instante**, y su único efecto real sería
obligar a borrarlo en la feature siguiente. R24 se verifica **sobre el diff** de esta
feature, que es donde el alcance de una feature sí es observable.

**Lo que sí se queda** es la entrada en el array `expected` del árbol esperado (T12):
ese test comprueba que un archivo **existe**, no que sea el único, así que es
**aditivo** y crece sin romperse — es la diferencia entre guardar "esto tiene que estar"
y guardar "esto es todo lo que puede haber".

> 📌 **Nota de reconciliación:** la justificación anterior era "la feature 10 aterriza
> seis archivos en esta carpeta". **Ya no es cierta**: el parser de MyInvestor
> ([`myinvestor-statement/`](../myinvestor-statement/design.md) y
> [`myinvestor-products/`](../myinvestor-products/design.md)) vive en
> `src/modules/myinvestor/`, carpeta disjunta.
> La decisión se mantiene; el porqué es el de arriba, que además es permanente y no
> depende de qué haga la feature siguiente.

**Requirements de proceso** (verificados por checklist del reviewer sobre el diff, no
por test): **R9** (parcialmente), **R17**, **R18**, **R19**, **R21**, **R23**, **R24**,
**R25**, **R26**, **R27**. Hay que anotarlo así en el mapa de trazabilidad (R28), igual
que se hizo con R32/R36 en la feature 8.

## 12. Borradores de ADR (van a `docs/architecture.md`, tarea de docs — R26)

> Formato ADR-005/…/011. El `implementer` lo redacta al cerrar; aquí queda el
> esqueleto completo. Numeración: **ADR-012** (siguiente libre tras ADR-011).

### ADR-012: Modelo de datos de inversiones — un `InvestmentProduct` único con la parte del depósito en columnas nullable, `Valuation` como serie, `invested` en la foto, clave natural `(bank, name)`, recarga por UPSERT y cero SQL crudo

- **Fecha:** 2026-08-08
- **Estado:** propuesta (se acepta al aprobar el spec e implementarse).
- **Contexto:** la feature 9 llena el hueco que la feature 8 dejó reservado a
  propósito en `docs/data-model.md` ("idea #3, patrimonio e inversiones, se añade
  encima sin tocar lo anterior"). Hay **un** banco de inversión con varios fondos, un
  ETF, varios depósitos y una cartera automatizada, más una cuenta corriente que ya
  encaja tal cual en el modelo del flujo. Lo que se quiere saber es deliberadamente
  simple: cuánto he metido, cuánto vale hoy y cuánto gano o pierdo. **Alcance: solo
  esquema + migración**, igual que la feature 8. **Premisa clave:** los productos no
  vendrán de un export del banco sino de un **fichero de texto escrito a mano** por
  el humano, cuyo formato se define en la feature del parser → **el fichero se hace a
  medida del modelo, no al revés**. El `intent` delegó cinco decisiones:
  materialización en Prisma (tipos, enum, precisión decimal, índices), las claves
  naturales y la resolución del recargado, cómo se vigila que un depósito no tenga
  valoraciones, si `marketValue` incluye el efectivo sin invertir, y dónde se
  documenta todo.
- **Decisión:**
  1. **Un solo modelo `InvestmentProduct`** con lo común (`bank`, `name`, `type`,
     `currency`, `openedAt`, `closedAt`) y la parte específica del depósito
     (`principal`, `interestRate`, `expectedGain`, `maturityDate`) como **columnas
     nullable de la misma tabla**. **Sin tabla por tipo.** `fund`, `etf` y
     `managed_portfolio` son tres valores del enum con **campos idénticos**; la
     cartera automatizada es **un** producto con su valor total, **sin desglose**.
  2. **`Valuation` es la foto periódica** de un producto que fluctúa, con
     `invested`, `marketValue`, `gain`, `gainPercent` y `uninvestedCash`.
     **`invested` vive en la foto, no en el producto**, porque crece con las
     aportaciones mensuales: ponerlo en el producto obligaría a pisarlo cada mes y
     perdería la serie. **`principal` sí va en el producto**: se contrata una vez y no
     fluctúa; por eso un depósito **no** tiene valoraciones.
  3. **Regla 4 — la valoración se lee, no se calcula.** Los cinco números se guardan
     tal como vienen; **nunca** se persiste `gain = marketValue − invested`; campo
     ausente → `NULL`, jamás un valor calculado.
  4. **Regla 5 — una aportación no se crea, se marca.** La aportación ya es un
     `Movement` del extracto; lo único propio es `Movement.productId` (nullable,
     indexado, **reservado sin escritor**). Regla de agregación gemela a la del
     traspaso: **un movimiento con `productId != null` no cuenta como gasto ni como
     ingreso** en los totales globales. Un reembolso es `income` + `productId`, sin
     columna nueva. En esta feature la regla se **documenta**; su implementación en
     `computeTotals` llega con el escritor de la columna.
  5. **Claves naturales:** `@@unique([bank, name])` para el producto (basta porque el
     nombre lo escribe el humano, luego es estable → caen `isin` y la segunda clave
     compuesta) y `@@unique([productId, date])` para la foto.
  6. **Recargar el mismo fichero es un UPSERT** sobre `(productId, date)`: gana el
     último, `updatedAt` avanza. Es una resolución de conflicto **distinta** a la del
     flujo, donde un duplicado importado se **descarta**. 📌 Como cada fichero mensual
     **re-afirma** las condiciones de todos los productos, el futuro importador tendrá
     que hacer **UPSERT también del producto** sobre `@@unique([bank, name])`, no un
     `create`: **dos upserts, no uno**.
  7. **Cero SQL crudo:** los tres índices son declarativos, así que Prisma los conoce
     y **no puede haber drift** — a diferencia de la feature 8, que arrastra ese
     riesgo con sus dos índices escritos a mano (parcial y `NULLS NOT DISTINCT`, que
     Prisma 7 no expresa).
  8. **Sin `origin` ni `status` en `Valuation`** (sus dos razones de ser en `Movement`
     —mantener PARCIAL el índice de dedup y alimentar la pantalla de revisión— no
     existen aquí) y **solo `closedAt` en el producto**, sin enum `status` (un
     booleano derivable duplicado acaba desincronizado). 🔗 **Su escritor lo aporta la
     feature de los archivos de producto**
     ([`myinvestor-products/`](../myinvestor-products/design.md)): el fichero lleva un `closedAt` opcional que
     el humano escribe **una sola vez**, en la última aparición del producto, y
     **dejar de escribir un producto NO lo cierra** — un olvido es indistinguible de
     un cierre, y convertir una ausencia en un hecho es la inferencia que no debe
     hacer un sistema con dinero dentro. `openedAt`, en cambio, **se queda `NULL`**:
     el formato no lo lleva.
  9. **Un depósito no tiene valoraciones = regla del SERVICIO**, no restricción de
     BD: coherente con las demás reglas de negocio del proyecto, mantiene el cero SQL
     crudo, y un `CHECK` no puede consultar otra tabla (haría falta un trigger o
     desnormalizar el `type`).
  10. **Precisión:** `Decimal(10,2)` para todos los importes (heredado del flujo, se
      sube en las dos capas a la vez si se sube), `Decimal(6,4)` para `interestRate`
      (**TAE EN PORCENTAJE**: `3.0000` = 3 %) y `Decimal(7,4)` para `gainPercent` (con
      signo). Un depósito guarda **una sola** TAE y **un solo** `expectedGain`: los
      **aplicados**; si el banco publica una segunda TAE hipotética (p. ej. "sin
      Premium"), **no se guarda** — es información comercial, no una condición del
      producto contratado. **`gain` y `gainPercent` se quedan `NULL`-ables en la BD**
      aunque el fichero de la feature 10 los exija: la restricción vive donde puede dar
      un mensaje útil (el parser dice qué producto y qué campo falta; una columna
      `NOT NULL` solo daría un `P2011`), y es un seguro sin coste ante un cambio futuro
      del formato.
  11. ✅ **`marketValue` NO incluye `uninvestedCash`** (confirmado por el humano y por
      la aritmética de las muestras reales: en la cartera,
      `8.250,45 + 1.250,15 = 9.500,60`, exactamente el valor de mercado, con los
      `75,25 €` de efectivo fuera). El patrimonio de un producto es
      **`marketValue + uninvestedCash`**, sin doble conteo. Era el punto abierto nº 1 y
      el único capaz de dar un patrimonio equivocado.
  12. **Sin endpoints, sin parser, sin importador y sin servicio:** el módulo
      `src/modules/investments/` recibe de esta feature **únicamente** su test
      (`investments.model.test.ts`), verificado por el reviewer sobre el diff y **no**
      por un guardián de árbol: el módulo está **diseñado para crecer** (el servicio del
      importador y, después, las rutas de patrimonio), así que congelar su contenido
      sería incorrecto por construcción. `docs/api-contract.md` anota que la capa de
      inversiones todavía no expone superficie HTTP.
  13. 📌 **Dos hechos del extracto de MyInvestor que afectan al saldo del flujo** (sin
      cambio de esquema, verificados sobre la muestra real por la feature 10): (a) ese
      banco **no da saldo por movimiento**, así que `Movement.balanceAfter` será siempre
      `NULL` para esa cuenta y la rama "sumar desde `initialBalance`" que ADR-011
      decisión 3 describió como **caso excepcional** pasa a ser el **camino normal** —
      `computeAccountBalance` ya lo soporta sin tocar código, pero
      **`Account.initialBalance` deja de ser decorativo: es el único ancla del saldo de
      esa cuenta**; y (b) tampoco trae **IBAN**, así que
      `findOrCreateAccountFromMetadata` devolverá `MISSING_ACCOUNT_DATA` (422) y esa
      cuenta habrá que darla de alta **a mano** — que es exactamente el camino previsto
      por ADR-011 decisión 9 y ADR-005 para este caso.
- **Alternativas consideradas:**
  - **Modelar los productos como `Account` y las valoraciones como `Movement`:**
    descartada — es la alternativa más tentadora y la peor. **Contaminaría el flujo en
    vez de construir encima**: un producto de inversión no tiene IBAN (que es la clave
    natural obligatoria y única de `Account`), una valoración no tiene fecha valor ni
    descripción ni saldo corrido, y meterlas en `Movement` las arrastraría al índice
    de dedup, a los totales globales y al cálculo del saldo. Habría que llenar el
    modelo del flujo de excepciones para distinguir "movimientos que son de verdad" de
    "movimientos que son fotos" — exactamente lo contrario del `que_no_quiero` ("no
    tocar nada del modelo del flujo").
  - **Una tabla por tipo de producto** (`Fund`, `Etf`, `Deposit`, …): descartada por
    el humano en el `que_no_quiero`. Multiplicaría por cuatro las consultas de
    patrimonio para tres tipos que llevan **campos idénticos**, y obligaría a un
    `UNION` o a herencia simulada.
  - **Autorreferencia `parentId` para desglosar la cartera automatizada en los fondos
    que lleva dentro:** descartada por el humano ("la quiero como un producto con su
    valor total, igual que un fondo"). Añadiría un nivel de agregación que nadie va a
    consultar y obligaría a decidir si el padre suma o duplica a los hijos.
  - **Derivar `gain` sumando** (o restando `marketValue − invested`, o sumando los
    `Movement` enlazados por `productId`): descartada — el `que_no_quiero` lo prohíbe
    explícitamente y la suma de movimientos **no es** el capital invertido (le faltan
    aportaciones anteriores a la primera importación, movimientos internos del banco de
    inversión y comisiones).
  - **Guardar la última valoración como columnas del propio producto** (`lastValue`,
    `lastGain`…): descartada — es la que **perdería la serie**, que es justo lo que el
    humano pide conservar ("guardo tres fotos… y se conservan las tres sin pisarse").
    Obligaría a pisar el dato cada mes y haría imposible distinguir "subió porque metí
    dinero" de "subió porque el mercado subió".
  - **`isin` y segunda clave `(bank, name, maturityDate)`:** descartadas — resuelven
    la amenaza de que un **banco** renombre un producto, y aquí el nombre lo escribe el
    humano en su propio fichero.
  - **`CHECK` (o trigger) para impedir valoraciones de un depósito:** descartada —
    rompería el cero SQL crudo y un `CHECK` no puede consultar otra tabla.
  - **`units` / `unitPrice` (participaciones y valor liquidativo):** descartadas por el
    humano — nivel de detalle que no quiere y que complicaría el fichero manual.
  - **Versionar las fotos de la misma fecha** en vez de sobrescribir: descartada — el
    humano pidió "que gane el último".
- **Consecuencias:**
  - **Todo aditivo:** ninguna columna, índice o enum del flujo se modifica; la única
    línea que lo toca es `Movement.productId`. La suite del flujo pasa **sin cambios**.
  - **Cero SQL crudo y cero riesgo de drift** en esta capa (contraste explícito con
    ADR-011).
  - **Sin dependencias ni variables de entorno nuevas** → `docs/stack.md` no cambia.
  - **Columnas reservadas sin escritor en esta feature:** `Movement.productId` (lo
    escribirá el enlace de aportaciones), `InvestmentProduct.closedAt` (lo escribirá el
    importador **del fichero**, feature 10) y `openedAt` (🟡 **sin escritor previsto**:
    el formato no lo lleva; se queda `NULL` y es un `ADD` de nada si algún día se
    quiere, porque la columna ya existe). Hasta que `productId` se rellene, una
    aportación a un fondo **cuenta como gasto** en los totales globales (asumido: no
    hay dashboards todavía, mismo trade-off que `transferId` en ADR-011).
  - **Contrato con el futuro importador:** **dos upserts**, el del producto sobre
    `(bank, name)` y el de la foto sobre `(productId, date)` — cada fichero mensual
    re-afirma las condiciones de todos los productos, así que un `create` del producto
    reventaría con `P2002` en el segundo fichero.
  - **Límite conocido:** la BD **no** impide una valoración sobre un depósito (regla de
    servicio, sin servicio todavía).
  - **Límite conocido:** renombrar un producto en el fichero crea un producto nuevo y
    deja la serie anterior colgando del nombre viejo (precio de la clave natural).
  - ✅ **`marketValue` / `uninvestedCash` confirmado**: van aparte, el patrimonio los
    suma y no hay doble conteo. Era el único punto capaz de producir un patrimonio neto
    equivocado y está cerrado con dos pruebas (la explicación del humano y la
    aritmética de las muestras reales).
  - 📌 **Para la cuenta corriente de MyInvestor, `Account.initialBalance` es el único
    ancla del saldo** (ese banco no imprime saldo por movimiento), y su alta tendrá que
    ser **manual** (el extracto no trae IBAN). Ninguna de las dos cosas exige tocar
    código: ambas rutas ya existen desde la feature 8.
  - **Si algún día se quiere el detalle** (participaciones, valor liquidativo, ISIN,
    desglose de la cartera), todo son **columnas nullable añadidas después**: un `ADD
    COLUMN` barato, sin migrar datos.

## 13. Documentación a actualizar (R25, R26, R27)

- **`docs/data-model.md`** (el cambio más grande):
  - Retitular a `# Modelo de datos`, con `## Parte 1 — Flujo` (contenido **intacto**)
    y `## Parte 2 — Inversiones` (nueva).
  - Mover la sección de reglas al **preámbulo común** (antes de la Parte 1),
    retitularla `## Las cinco reglas que explican el modelo` y añadir la **4** y la
    **5** con enlace a la Parte 2. Las tres primeras no se tocan.
  - **Parte 2:** diagrama, esquema Prisma real, clave natural, resolución por UPSERT
    (con la tabla comparativa de §4 **y la nota de los dos upserts**, §4.1), la regla
    de negocio del depósito (§8), la regla de cierre —**dejar de escribir un producto
    NO lo cierra**, §7.1— y 🔴 la suposición `marketValue`/`uninvestedCash` (§9) + el
    cálculo del patrimonio.
  - Añadir `Movement.productId` e `InvestmentProduct.closedAt` a la **tabla de
    columnas reservadas** (hoy en `docs/data-model.md:177`), y `openedAt` con su nota
    de que **se queda `NULL`** (el fichero no lo lleva).
  - **Reescribir la sección «Lo que NO está aquí (fase siguiente)»**
    (`docs/data-model.md:321-326`), que esta feature deja obsoleta: lo que queda fuera
    ahora es el **parser del fichero**, el **importador**, el **enlace de aportaciones**
    (escritor de `productId`) y la **consulta de patrimonio**.
- **`docs/architecture.md`:** ADR-012 (borrador completo en §12) + añadir
  `investments/` al árbol de la sección «Estructura de carpetas» con su único archivo
  `investments.model.test.ts`, anotando que hoy es una **carpeta parcial** (solo el
  test; precedente: `health/`) y que **la completará la feature de importación** con su
  servicio, y más adelante las rutas de patrimonio — es un módulo por **recurso**, no
  por artefacto (ADR-004).
- **`docs/api-contract.md`:** **una línea**, sin endpoints nuevos — en la sección
  `## Modelos` o justo antes de `## Endpoints`: la capa de inversiones
  (`InvestmentProduct`, `Valuation`) **existe en la base de datos pero no expone
  endpoints todavía**; se documentará cuando una feature los abra. Mismo patrón que la
  feature 4 con su servicio interno (ADR-008 decisión 2).
- **`progress/current.md`:** estado de la sesión + las columnas reservadas nuevas y
  el punto abierto de `marketValue`.
- 📌 **Fuera de este repo, NO incluido como task:** el plan también proponía marcar la
  idea #3 como ✅ en `../docs/ideas.md` (nivel **workspace**, fuera de
  `gastos-backend/`) y rellenar su tabla "Decisiones: de idea a features". Se deja
  **fuera del alcance** de esta feature porque el harness de este repo no toca archivos
  de fuera; **confirmar en la puerta** si el humano quiere que se haga aparte.

## 14. Riesgos y notas para el implementer

- 🔴 **`pnpm`, NUNCA npm.** **Sin dependencias nuevas**: todo es Prisma/Postgres ya en
  el stack.
- 🔴 **No toques `.env`** ni el parser (`src/modules/bankinter/**`).
- 🔴 **La migración se GENERA:** `pnpm exec prisma migrate dev --name investments`.
  **Ni una línea de SQL escrita a mano** (R23). Requiere el contenedor levantado
  (`docker compose up -d`, Postgres en `localhost:5434`).
- 🔴 **No toques ningún servicio del flujo** (R17, R19): `accounts`, `categories` y
  `movements` quedan **byte a byte** como están. Si te sale la tentación de "ya que
  estoy, excluyo `productId` de `computeTotals`", **para**: está marcado como punto
  abierto para la puerta (§10).
- 🔴 **Nada de endpoints, rutas, servicios, schemas ni tipos** en
  `src/modules/investments/` (R24): esta feature pone ahí **solo**
  `investments.model.test.ts`. `src/app.ts` no se toca. ⚠️ **Y NO escribas el guardián
  de "esta carpeta solo tiene un archivo"**: el módulo está diseñado para crecer (el
  servicio del importador), así que ese test sería incorrecto por construcción (§11,
  R24).
- 🔴 **`interestRate` es TAE en PORCENTAJE** (`2.7500` = 2,75 %), no fracción (§6).
- ⚠️ **Comparar `Decimal` con `.toFixed(n)`**, no con `.toString()` (§6): decimal.js
  elimina los ceros a la derecha.
- ⚠️ **Nombres de producto únicos por test:** `@@unique([bank, name])` es global; usa
  un sufijo aleatorio como hace `movements.test.ts` con el IBAN y con las categorías.
- ⚠️ **Orden de limpieza** en `afterEach`: `movement` → `valuation` →
  `investmentProduct` (las FKs son `RESTRICT`).
- Convenciones (`docs/conventions.md`): dominio y nombres en **inglés**, comillas
  simples, sin `;`, 2 espacios, 100 columnas, imports relativos con `.js`,
  `import type` para tipos, vendor antes que relativos.
