# Resumen — feature 26 `savings-account-as-product`

Fecha de cierre: 2026-08-20
Intención original: `feature_list.json` → feature `savings-account-as-product`, bloque `intent`
Spec (SDD): [`specs/savings-account-as-product/`](../../specs/savings-account-as-product/) · la hoja que aprobaste: [`decisions.md`](../../specs/savings-account-as-product/decisions.md)
Revisión: [`progress/reviews/savings-account-as-product.md`](../reviews/savings-account-as-product.md)

## Qué hace ahora la app que antes no

El `.json` que escribes cada mes de tu cuenta remunerada de Trade Republic **ya entra en
la base de datos**. Antes moría en un volcado dentro de `var/parsed/`: el sistema lo
leía, comprobaba que los cinco importes cuadraran y lo dejaba ahí. Ahora, cuando le das
al botón de importar de siempre, tu cuenta queda guardada como **un producto más**
(el quinto tipo, `savings_account`) y cada mes queda como **una foto** con sus cinco
importes tal y como los escribiste.

Tres promesas concretas, y las tres están probadas contra tu propia base:

- **Subes el mes siguiente → no se crea otra cuenta**, es la misma con un mes más.
- **Vuelves a subir el mismo mes → no se duplica nada**, se pisa la foto de ese mes.
- **Tus 4 cuentas y tus 455 movimientos no se han tocado**, ni uno.

Y lo que ya te protegía sigue igual: **un archivo cuyos cinco importes no cuadran se
rechaza entero y no deja rastro** — ni cuenta, ni foto, ni se mueve a `procesados/`. Te
dice el motivo completo, lo corriges y lo vuelves a subir.

**Tu plantilla de Drive NO ha cambiado.** Ni un campo nuevo que teclear, IBAN incluido.

## Por dónde se usa (puntos de entrada)

- **`POST /api/import`** — el botón de siempre. Ahora, además de los extractos, reconoce
  los `.json` de producto de la carpeta de Trade Republic, los guarda y mueve el original
  a `procesados/`. Entrada: [`import.service.ts:197`](../../src/modules/import/import.service.ts#L197).
- **`POST /api/import/local`** — reimporta desde la copia local, sin tocar Drive. Es la
  forma natural de volver a subir un mes cuyo archivo ya se movió a `procesados/`.
  Entrada: [`import.local.service.ts:78`](../../src/modules/import/import.local.service.ts#L78).
- **`POST /api/parser/trade-republic`** — el **ensayo**: te enseña qué ha entendido el
  sistema de tu archivo **sin escribir nada** en la base. Sigue escribiendo su
  `products.json` por año en `var/parsed/`, que ha cambiado de oficio: ya no es la base
  de datos falsa, es el borrador para mirar un mes antes de meterlo.
- La respuesta de la importación te dice, **por archivo**, si la cuenta se **creó** o se
  **actualizó** y si la foto de ese mes es **nueva** o se ha **pisado**. Sin eso no
  podrías distinguir «se ha guardado» de «se ha vuelto a guardar lo mismo».

## Dónde está el código (para revisión directa)

> Los enlaces son clicables en la vista previa de Markdown de VS Code (Ctrl/Cmd + clic).
> Los **números de línea** están sólo en los puntos de entrada; el resto se localiza por
> el **símbolo**, que no caduca cuando el archivo se mueve.

### Quien escribe en la base (la pieza central)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| **Guarda el producto y la foto del mes**, los dos upserts en UNA transacción. Es el **único** sitio de todo `src/` que escribe estas dos tablas | `persistSavingsSnapshot` | [investments.service.ts:22](../../src/modules/investments/investments.service.ts#L22) |
| El contrato entre un archivo de producto y la base (qué trae un archivo ya validado) | `SavingsSnapshotInput` | [investments.types.ts](../../src/modules/investments/investments.types.ts) |
| La forma del parser de productos y del registro que los agrupa | `ProductParserAdapter`, `ProductParserRegistry` | [investments.types.ts](../../src/modules/investments/investments.types.ts) |
| Lo que se te reporta de un archivo de producto | `ProductImportResult` | [investments.types.ts](../../src/modules/investments/investments.types.ts) |

### La vía de entrada (el importador)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| **Punto de entrada** de `POST /api/import`; decide extracto → producto → ignorado | `importPending` | [import.service.ts:197](../../src/modules/import/import.service.ts#L197) |
| **Punto de entrada** de la vía local, sin Drive | `importLocalCopies` | [import.local.service.ts:78](../../src/modules/import/import.local.service.ts#L78) |
| Parsea un archivo de producto y lo persiste; **nunca lanza**, un fallo vuelve como `failed` con su motivo entero | `importProductFile` | [import.service.ts:398](../../src/modules/import/import.service.ts#L398) |
| Elige el parser de producto: la **carpeta** dice el banco, la extensión dice el parser | `selectProductAdapter` | [import.service.ts:540](../../src/modules/import/import.service.ts#L540) |
| La parte de Drive de importar un archivo: descargar → guardar → **y sólo entonces** mover a `procesados/`. Compartida por extractos y productos, para que la regla viva en un sitio | `importDriveFile` | [import.service.ts](../../src/modules/import/import.service.ts) |
| Los campos `product` y `snapshot` del informe | `ProductResult`, `AttemptedProductFileReport` | [import.types.ts](../../src/modules/import/import.types.ts) |
| Las rutas aceptan e inyectan el registro de productos | `importRoutes` | [import.routes.ts](../../src/modules/import/import.routes.ts) |

### El módulo del banco (lee el archivo, no toca la base)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Convierte los bytes de tu `.json` en una cuenta validada, o lanza con el **motivo íntegro** | `parseTradeRepublicProductFile` | [trade-republic.service.ts:137](../../src/modules/trade-republic/trade-republic.service.ts#L137) |
| El cuadre de los cinco importes, en céntimos enteros y con **un céntimo** de margen | `checkBalanceEquation` | [trade-republic.product.parser.ts](../../src/modules/trade-republic/trade-republic.product.parser.ts) |

### Dónde se dice que Trade Republic existe

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Los **dos registros** de bancos, el de extractos y el de productos. `src/app.ts` sigue siendo el único archivo que puede nombrar un banco | `bankParsers`, `productParsers` | [app.ts:40](../../src/app.ts#L40) · [app.ts:56](../../src/app.ts#L56) |

### La base de datos

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| El quinto tipo de producto y la tabla de la foto mensual | `InvestmentProductType`, `SavingsSnapshot` | [schema.prisma](../../prisma/schema.prisma) |
| La migración, **puramente aditiva** (añade un valor de enum y una tabla; no toca ni una fila existente) | — | [migration.sql](../../prisma/migrations/20260820181500_savings_account_as_product/migration.sql) |
| El registro escrito del modelo, ya al día | — | [docs/data-model.md](../../docs/data-model.md) |

### Los guardianes (lo que impide que esto se tuerza mañana)

| Qué vigila | Código |
| --- | --- |
| Que **sólo** `modules/investments/` escriba productos y fotos | [architecture.test.ts:393](../../src/architecture.test.ts#L393) |
| Que el escritor no sepa de Drive ni de bancos | [architecture.test.ts:406](../../src/architecture.test.ts#L406) |
| Que el módulo de Trade Republic **siga sin tocar la base** | [architecture.test.ts](../../src/architecture.test.ts) |
| Que ningún banco reclame la misma extensión en los dos registros | [import.routes.test.ts:193](../../src/modules/import/import.routes.test.ts#L193) |

### Tests

| Qué cubre | Código |
| --- | --- |
| Los cinco importes se guardan **tal cual**, sin calcular nada | [investments.service.test.ts:105](../../src/modules/investments/investments.service.test.ts#L105) |
| Mismo mes dos veces → un producto y una foto | [investments.service.test.ts:148](../../src/modules/investments/investments.service.test.ts#L148) |
| Mes siguiente → mismo producto, una fila más | [investments.service.test.ts:166](../../src/modules/investments/investments.service.test.ts#L166) |
| Un fallo a mitad no deja producto huérfano | [investments.service.test.ts:224](../../src/modules/investments/investments.service.test.ts#L224) |
| No se toca `Account` ni `Movement` | [investments.service.test.ts:234](../../src/modules/investments/investments.service.test.ts#L234) · [import.service.test.ts:1159](../../src/modules/import/import.service.test.ts#L1159) |
| El `.json` deja de ignorarse: se guarda y se mueve | [import.service.test.ts:1040](../../src/modules/import/import.service.test.ts#L1040) |
| Un archivo que **no cuadra** no deja rastro | [import.service.test.ts:1082](../../src/modules/import/import.service.test.ts#L1082) |
| Los extractos siguen importándose exactamente igual | [import.service.test.ts:1140](../../src/modules/import/import.service.test.ts#L1140) |
| La vía local: persiste sin Drive, no duplica, añade el mes siguiente | [import.local.service.test.ts:566](../../src/modules/import/import.local.service.test.ts#L566) |
| Los 8 motivos de rechazo del parser, con el mensaje entero | [trade-republic.service.test.ts:254](../../src/modules/trade-republic/trade-republic.service.test.ts#L254) |
| El ensayo sigue sin persistir | [trade-republic.service.test.ts:310](../../src/modules/trade-republic/trade-republic.service.test.ts#L310) |
| La tabla, el enum y la migración contra la base real | [investments.model.test.ts:553](../../src/modules/investments/investments.model.test.ts#L553) · [:667](../../src/modules/investments/investments.model.test.ts#L667) |

## Cumplimiento de la intención

Por cada punto de tu `como_se_que_esta_bien`:

- ✅ **«Después de subir el `.json` de un mes, mi cuenta remunerada está en la base de
  datos con su saldo y sus intereses de ese mes.»** → Se cumple. Verificado en
  `src/modules/import/import.service.test.ts:1040` (de punta a punta: se guarda el
  producto, se guarda la foto y el archivo se mueve) y en
  `src/modules/investments/investments.service.test.ts:105` (los cinco importes, tal cual
  se escribieron). El revisor lo probó además **contra tu base**, con datos inventados
  que borró después.
- ✅ **«Subo el mes siguiente y no se me crea una cuenta nueva: es la misma, con un mes
  más.»** → Se cumple. `src/modules/investments/investments.service.test.ts:166` y
  `src/modules/import/import.local.service.test.ts:596`. Probado en vivo: el segundo mes
  reutilizó el **mismo** producto y añadió **una** fila.
- ✅ **«Si vuelvo a subir el mismo mes, no se me duplica nada.»** → Se cumple.
  `src/modules/investments/investments.service.test.ts:148`,
  `src/modules/import/import.service.test.ts:1107` (te informa de que la foto se ha
  **pisado**, no creado) y `src/modules/import/import.local.service.test.ts:582`.
- ✅ **«Mis 4 cuentas y mis 455 movimientos de hoy siguen exactamente igual.»** → Se
  cumple. `src/modules/import/import.service.test.ts:1159` y
  `src/modules/investments/investments.model.test.ts:667` (la migración, columna a
  columna). Contado a mano antes y después de la revisión: **4 cuentas y 455
  movimientos**, con el mismo desglose por banco.

Y tus tres `que_no_quiero`:

- ✅ **No escribir más campos cada mes** → la plantilla **no ha cambiado**, ni un campo.
- ✅ **No perder el cuadre de los cinco importes** → sigue, y ahora además **corta antes
  de escribir**: un archivo que no cuadra no deja ni producto ni foto.
- ✅ **No tocar movimientos ni cuentas corrientes** → ni una fila, vigilado por tests.

## Decisiones que se tomaron por ti

Lo que en el spec iba marcado como `(delegado)` o `(añadido)`, para que lo tengas
presente:

- **(delegado) La cuenta remunerada es un tipo de producto nuevo, no un depósito
  reciclado.** Un depósito tiene vencimiento e interés pactado de antemano; tu cuenta no.
  Vive en `prisma/schema.prisma` como `savings_account`.
- **(delegado) Sus cinco importes viven en una tabla propia, `SavingsSnapshot`**, y no en
  la de valoraciones: allí se habrían perdido tres de los cinco y no podrías volver a
  comprobar el cuadre desde la base.
- **(delegado) Entra por `POST /api/import`**, con un **segundo registro** de bancos, en
  vez de por una ruta aparte: un botón al mes, como hasta ahora.
- **(delegado) `var/parsed/` sigue existiendo como ensayo**, no se borra.
- **(añadido) Cuando un archivo se rechaza** se te reporta como `failed`, con el motivo
  entero y sin moverlo a `procesados/` — la misma forma que ya tenían los extractos.
- **(añadido) El archivo bien importado se mueve a `procesados/`**, y sólo **después** de
  que producto y foto estén escritos.
- **(añadido) El informe te dice si la cuenta se creó o se actualizó y si la foto es
  nueva o pisada.** Sin esto no podrías comprobar las dos promesas de arriba.

Y una decisión tuya, tomada en la puerta: **corregiste la errata del nombre**
(`saving-account`) **antes** de la primera importación, cuando no costaba nada. Bien
hecho: el nombre es la identidad de la cuenta, y cambiarlo después habría creado una
segunda cuenta dejando la serie anterior colgando del nombre viejo.

## Qué NO se tocó / quedó fuera

- **Los 5 `.json` de productos de MyInvestor siguen fuera.** Salen «ignorados» por el
  mismo motivo de antes. Entran en la feature hermana, que sólo tiene que añadir un
  adaptador al registro y cambiar la segunda tabla: la vía ya está construida.
- **Todavía no hay ninguna pantalla ni consulta que te enseñe estos datos.** Escribirlos
  era esta feature; leerlos es la siguiente. Hoy los productos y las fotos se escriben y
  no hay forma de verlos por API.
- **El `.pdf` de Trade Republic sigue dando un motivo falso** («no hay parser para el
  banco trade-republic»): parser hay, lo que no hay es parser **de su extracto**. Está
  fuera de alcance a propósito y necesita su propia feature.
- **La cuenta remunerada no aparece en los totales de gasto e ingreso**, igual que el
  resto de productos de inversión: no es una cuenta corriente.
- **Cerrar la cuenta sigue siendo escribir `closedAt` una vez.** Dejar de subir el
  archivo un mes no la cierra.

## Notas para el futuro

- 🔴 **Te queda una cosa por hacer, y no la puede hacer un agente:** subir tu archivo real
  (ya con el nombre corregido) y comprobar de una vez que tu cuenta y su mes están en la
  base. Es la «prueba real» que en las dos últimas features encontró defectos que la
  suite en verde no podía ver. Hoy la base tiene **0 productos y 0 fotos**: nadie la ha
  hecho todavía.
- ⚠️ **La suite no está verde de forma fiable**, y no es culpa de esta feature: en 4 de
  ~13 pasadas completas falló un test del listado de movimientos con un error 500. Pasa
  porque los tests trabajan **sobre tu base de datos viva** y unos borran cuentas
  mientras otros leen. Es exactamente lo que la **feature 27** tiene abierto, y conviene
  hacerla pronto: mientras tanto, un «verde» no significa lo mismo.
- Queda una base de datos temporal, `gastos_f26`, creada en el contenedor durante el
  desarrollo. Se puede borrar sin miedo.
- `Movement.productId` (enlazar una aportación con su producto) sigue sin escritor. Ahora
  que la capa de inversiones ya tiene quien escriba, es el siguiente cabo natural.
