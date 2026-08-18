# Contrato de la API — control de gastos (backend)

> **Este archivo es la FUENTE DE VERDAD de la API.** Es propiedad del backend.
> El frontend lo lee para saber cómo son los datos, pero no lo edita.
>
> Cuando el backend implementa o cambia un endpoint, actualiza este archivo en
> la MISMA feature. Un endpoint que no está aquí, para el frontend no existe.
>
> Es documentación en markdown, no código: el frontend define sus propios tipos
> a partir de lo que lee aquí. No se comparten tipos entre proyectos.
>
> **Idioma:** el contrato (rutas, campos, modelos) está en **inglés**. La prosa
> explicativa está en español.

## Convenciones generales

- **Base URL:** `http://localhost:3000/api` (el puerto se configura con `PORT`).
- **Formato:** JSON. `Content-Type: application/json`.
- **Autenticación:** ninguna por ahora.
- **Números decimales:** todo campo monetario (`amount`, `initialBalance`,
  `balanceAfter`, `balance`) se serializa como **string decimal con 2 decimales**
  (p. ej. `"45.90"`), no como número, porque proviene de un `Decimal(10,2)`.
- **Fechas:** ISO 8601 en UTC (p. ej. `"2026-07-04T00:00:00.000Z"`) para las
  marcas de tiempo (`createdAt`, `updatedAt`). Las **fechas de un movimiento**
  (`bookingDate`, `valueDate`) son **date-only** `YYYY-MM-DD` (p. ej.
  `"2026-07-31"`): son fechas de contabilidad bancaria, sin hora ni zona.
- **Errores:** todo cuerpo de error tiene la forma única
  `{ "statusCode": NUMBER, "code": "STRING", "message": "STRING" }`
  (ver la sección [Errores](#errores)).

## Errores

Toda respuesta de error de la API (validación, no encontrado, error interno,
ruta inexistente) usa el mismo cuerpo:

```json
{ "statusCode": 404, "code": "NOT_FOUND", "message": "Account not found" }
```

- `statusCode`: el código HTTP de la respuesta, repetido en el cuerpo.
- `code`: identificador **estable** para máquinas; el frontend puede
  discriminar por él (además de por el código HTTP).
- `message`: texto para humanos; **puede cambiar sin aviso**, no programar
  lógica contra él.

Códigos estables:

| `code`                  | HTTP | Cuándo                                                     |
| ----------------------- | ---- | ---------------------------------------------------------- |
| `VALIDATION_ERROR`      | 400  | El body o los params no cumplen el esquema de la ruta, o la operación es incoherente (p. ej. subcategoría de una subcategoría). |
| `NOT_FOUND`             | 404  | El recurso pedido no existe, o la ruta no existe.          |
| `CONFLICT`              | 409  | El recurso ya existe: `iban` de cuenta duplicado, o categoría raíz duplicada `(kind, name)`. |
| `NOT_UTF8`              | 422  | Los **bytes** de un fichero no son UTF-8 válido (típicamente guardado en cp1252/ANSI por el editor). El fichero se **rechaza entero**; nunca se decodifica ni se repara. Como `MISSING_ACCOUNT_DATA`, viaja **dentro del informe de un fichero** en una respuesta 200, no como cuerpo de error HTTP. |
| `MISSING_ACCOUNT_DATA`  | 422  | Los metadatos de un extracto no bastan para resolver la cuenta (falta el `iban` en el fichero y su banco no tiene exactamente una cuenta dada de alta). **Ya no está reservado:** desde la feature 12 lo emite `POST /api/import` **dentro del informe de un fichero**, en una respuesta 200, no como cuerpo de error HTTP (ver la nota más abajo). |
| `INTERNAL_SERVER_ERROR` | 500  | Error inesperado; el cuerpo no expone detalles internos.   |
| `DRIVE_CONNECTION_ERROR`| 503  | No se puede hablar con Google Drive (token caducado, API deshabilitada, scope insuficiente…). |
| `UNKNOWN_BANK`          | 404  | El banco (con formato válido) no está registrado en Drive. **Reservado** (interno; ningún endpoint lo devuelve todavía). |

> **Nota (`MISSING_ACCOUNT_DATA`, feature "import", 2026-08-12):** es el **único**
> código estable que **no** viaja como cuerpo de error HTTP. La importación reporta
> por fichero dentro de un 200 (un fichero roto no invalida los demás), así que este
> código aparece en `files[].error.code` de `POST /api/import`. Su `message` pide
> escribir el IBAN **una vez** en el fichero; ninguna cuenta se crea nunca sin IBAN.
>
> **Nota (`NOT_UTF8`, feature "statement-encoding-guard", 2026-08-15):** todo
> fichero que entra por un parser se descodifica en **UTF-8 estricto**
> ([`src/lib/utf8.ts`](../src/lib/utf8.ts)). Un byte que no sea UTF-8 válido
> **rechaza el fichero entero** en vez de convertirse en `�` en silencio, que es
> lo que ocurría hasta hoy: un extracto guardado en cp1252 se parseaba sin un solo
> fallo y dejaba `SUSCRIPCI�N PREMIUM` de forma irreversible. El backend **no
> aprende cp1252** ni adivina codificaciones: el `message` dice qué byte y qué
> línea, y pide volver a guardar el fichero en UTF-8. Aparece en
> `files[].error.code` de `POST /api/import` y, como motivo de texto, en
> `failed[].reason` de `POST /api/parser/myinvestor` y de `POST /api/parser/n26`.
>
> **Nota (`DRIVE_CONNECTION_ERROR`, actualizada en la feature "drive-read",
> 2026-08-03):** desde la feature 5 este código **sí** sale en el cuerpo de error
> estándar. Los endpoints de ingesta (`GET /api/ingestion/pending` y
> `POST /api/ingestion/process`) lo devuelven con `{ statusCode, code, message }`
> cuando falla una operación de Drive de nivel superior (p. ej. no se pueden ni
> listar los bancos). El `message` va **sanitizado** (nunca incluye token ni URL
> firmada). Nota histórica: hasta la feature 4 ningún endpoint de dominio lo
> devolvía; `GET /health/drive` sigue respondiendo con su cuerpo de readiness
> propio (`{ status, drive }`), no con el cuerpo de error estándar. `UNKNOWN_BANK`
> continúa **reservado**: la ingesta descubre los bancos por carpeta, no los
> resuelve por nombre, así que no lo emite.

> **Nota (feature "drive-structure", 2026-07-25):** la feature 4 (estructura en
> Drive: crear carpetas, subir y mover archivos) se resolvió como **servicio
> interno** (funciones en `src/lib/drive-structure.ts`), **sin endpoints de API**
> — razón en `specs/drive-structure/design.md` §5 y §7. Por eso este contrato **no
> gana endpoints** en esta feature. Añade sin embargo el código de error nuevo
> `UNKNOWN_BANK` (404) a la tabla de arriba, también **reservado** (interno; lo
> devolverá la feature que exponga la operación de cara al cliente, p. ej. la
> ingesta). Tanto `DRIVE_CONNECTION_ERROR` como `UNKNOWN_BANK` quedan documentados
> pero sin superficie HTTP todavía.

> **Nota de cambio (feature "foundations", 2026-07-11):** hasta ahora el
> cuerpo de error era `{ "message": "STRING" }` (y los errores de validación
> o de ruta inexistente salían con el formato default de Fastify). Ahora todo
> error responde con `{ statusCode, code, message }`. **No es breaking** para
> el frontend: los códigos HTTP no cambian y el contrato vigente indicaba
> discriminar por código HTTP, no por el cuerpo; este formato ya estaba
> anunciado aquí como previsto.

> ⚠️ **BREAKING CHANGE (feature "data-model", 2026-08-06).** El modelo `Expense`
> y los endpoints `/api/expenses` (GET lista, GET `:id`, POST, DELETE) del
> bootstrap **han desaparecido**: eran un placeholder de prueba, no el modelo del
> flujo. Cualquier petición a `/api/expenses*` responde ahora **404
> `NOT_FOUND`**. La `Category` del bootstrap (solo `id`/`name`) también se ha
> reemplazado por la nueva (con `kind` y `parentId`). En su lugar están los
> modelos y endpoints del flujo real: `Account`, `Category`, `Movement` y
> `/api/accounts`, `/api/categories`, `/api/movements`. **Aún NO consumido por el
> frontend**; su feature correspondiente se planifica contra estos nombres.

## Modelos

### `Account`

Una cuenta **bancaria**. No existe cuenta de efectivo: el efectivo se ve a través
de los movimientos que reporta el banco (retiradas de cajero).

| Campo            | Tipo                        | Descripción                                                     |
| ---------------- | --------------------------- | --------------------------------------------------------------- |
| `id`             | number                      | Identificador.                                                   |
| `iban`           | string                      | IBAN **único**, normalizado a mayúsculas y sin espacios. Clave natural de la cuenta. |
| `bank`           | string                      | Nombre del banco (p. ej. `"bankinter"`).                        |
| `alias`          | string                      | Alias legible. Si no se envía, se deriva de `bank` + últimos 4 del IBAN. |
| `type`           | `"checking"` \| `"savings"` | Tipo de cuenta. Def. `"checking"`. **No existe `cash`**.         |
| `initialBalance` | string (decimal)            | Punto de partida del saldo. Solo se usa en el caso excepcional de una cuenta cuyos movimientos no traen saldo (ver `balance`). |
| `balance`        | string (decimal)            | **Calculado por petición** (no se almacena): es el `balanceAfter` del movimiento **más reciente** de la cuenta (orden `bookingDate DESC, daySequence DESC`), es decir **el saldo que da el propio extracto**. Solo si ningún movimiento de la cuenta trae saldo, se calcula como `initialBalance` + ingresos − gastos. |
| `createdAt`      | string (ISO)                | Fecha de creación del registro.                                  |
| `updatedAt`      | string (ISO)                | Fecha de última modificación.                                    |

### `Category`

Catálogo jerárquico de **un solo nivel** (una categoría raíz puede tener
subcategorías; una subcategoría no puede tener hijas). El banco no manda
categorías: el catálogo lo da de alta el usuario.

| Campo       | Tipo                          | Descripción                                                        |
| ----------- | ----------------------------- | ------------------------------------------------------------------ |
| `id`        | number                        | Identificador.                                                      |
| `name`      | string                        | Nombre. Único dentro de `(parentId, kind)`; dos **raíces** con el mismo `kind` y `name` no pueden coexistir. |
| `kind`      | `"expense"` \| `"income"`     | Tipo de la categoría.                                               |
| `parentId`  | number \| null                | Id de la categoría padre, o `null` si es raíz.                      |
| `children`  | `Category[]`                  | Subcategorías embebidas (vacío en una subcategoría y en la respuesta del `POST`). |
| `createdAt` | string (ISO)                  | Fecha de creación.                                                  |

### `Movement`

Un apunte del extracto. **Solo entra por importación** (ver
[`/api/movements`](#get-apimovements)).

| Campo           | Tipo                                                        | Descripción                                                     |
| --------------- | ----------------------------------------------------------- | --------------------------------------------------------------- |
| `id`            | number                                                      | Identificador.                                                   |
| `type`          | `"expense"` \| `"income"` \| `"neutral"`                    | Lo que reportó el banco: el `amount` es **siempre positivo** y el signo lo da el `type`. `neutral` = importe 0 (ni ingreso ni gasto). **No existe `"transfer"`** ni un campo `direction`. |
| `bookingDate`   | string (`YYYY-MM-DD`)                                       | Fecha contable.                                                  |
| `valueDate`     | string (`YYYY-MM-DD`)                                       | Fecha valor.                                                     |
| `amount`        | string (decimal)                                            | Importe **positivo**.                                            |
| `description`   | string                                                      | Descripción tal cual la da el banco.                             |
| `balanceAfter`  | string (decimal) \| null                                    | Saldo **tras** el movimiento, según el extracto. El más reciente es el `balance` de la cuenta. |
| `currency`      | string                                                      | Divisa. Def. `"EUR"` (no hay conversión multi-divisa).           |
| `note`          | string \| null                                              | Anotación manual. Hoy siempre `null`.                            |
| `accountId`     | number                                                      | Id de la cuenta.                                                 |
| `account`       | objeto                                                      | Cuenta embebida: `{ id, iban, bank, alias, type }` (sin `balance`). |
| `categoryId`    | number \| null                                              | Id de la categoría, o `null`.                                    |
| `category`      | objeto \| null                                              | Categoría embebida: `{ id, name, kind, parentId }`. Hoy siempre `null`: la asignación automática por reglas es una feature posterior. |
| `paymentMethod` | `"card"` \| `"cash"` \| `"bank_transfer"` \| `"direct_debit"` \| null | Forma de pago. Hoy siempre `null` (la derivará la feature de reglas). |
| `origin`        | `"imported"` \| `"manual"`                                  | Procedencia. Los movimientos nacen `"imported"`.                 |
| `status`        | `"confirmed"` \| `"pending_review"`                         | Estado de revisión. Nacen `"pending_review"`.                    |
| `transferId`    | string \| null                                              | Enlace lógico entre las **dos piernas** de un traspaso entre cuentas propias. **No hay endpoint de traspasos** (ver la nota de abajo); hoy viaja siempre `null`. |
| `daySequence`   | number \| null                                              | Posición del movimiento **dentro de su `bookingDate`** (`1` = el primero del día). Fija el orden intradía y forma parte de la clave de deduplicación de importados. |
| `createdAt`     | string (ISO)                                                | Fecha de creación del registro.                                  |
| `updatedAt`     | string (ISO)                                                | Fecha de última modificación.                                    |

> **Traspasos entre cuentas propias.** No se crean desde la app y **no tienen
> endpoint**: sus dos apuntes ya llegan en los extractos (un `expense` en la
> cuenta origen y un `income` en la destino). Lo único propio de un traspaso es
> que ambas piernas comparten un `transferId` y que **no cuentan como gasto ni
> como ingreso** en los totales globales. El `type` que reportó el banco **no se
> muta** al identificarlo. Quién rellena `transferId` es una feature posterior;
> hoy la columna existe y viaja siempre `null`.

### Inversiones — sin endpoints todavía

La capa de inversiones (`InvestmentProduct` y `Valuation`) **existe en la base de
datos** desde la feature 9 (`docs/data-model.md` §Parte 2, ADR-012) pero **ninguna
ruta la sirve**: esa feature fue esquema y migración, igual que la 8 hizo con el
flujo. No hay modelo ni endpoint que documentar aquí todavía; se añadirán cuando
una feature abra esa superficie. Mismo patrón que el servicio interno de
estructura en Drive (ADR-008), que tampoco tiene endpoints.

> La columna `Movement.productId` que esa feature añadió **no forma parte de esta
> respuesta**: `serializeMovement` mapea campo a campo, así que el `Movement` del
> contrato es exactamente el de la tabla de arriba, sin cambios.

## Endpoints

### `GET /api/accounts`

Lista todas las cuentas, con su `balance` resuelto en la propia petición.

**Respuesta 200**
```json
[
  {
    "id": 1,
    "iban": "ES9820385778983000760236",
    "bank": "bankinter",
    "alias": "bankinter ···0236",
    "type": "checking",
    "initialBalance": "0.00",
    "balance": "9954.63",
    "createdAt": "2026-08-06T18:30:00.000Z",
    "updatedAt": "2026-08-06T18:30:00.000Z"
  }
]
```

> `balance` **no es una suma de movimientos**: es el `balanceAfter` del último
> movimiento del extracto (ver el modelo `Account`).

---

### `GET /api/accounts/:id`

Obtiene una cuenta por su `id` (incluye `balance`).

**Path params**
| Param | Tipo   | Descripción              |
| ----- | ------ | ------------------------ |
| `id`  | number | Id de la cuenta (entero).|

**Respuesta 200** — objeto `Account`.

**Errores**
| Código HTTP | `code`             | Cuándo                              |
| ----------- | ------------------ | ----------------------------------- |
| 400         | `VALIDATION_ERROR` | `id` no es un entero.               |
| 404         | `NOT_FOUND`        | No existe una cuenta con ese `id`.  |

---

### `POST /api/accounts`

Crea una cuenta bancaria.

**Body**
| Campo            | Tipo   | Obligatorio | Reglas                                                        |
| ---------------- | ------ | ----------- | ------------------------------------------------------------- |
| `iban`           | string | sí          | No vacío (`minLength: 1`). Se normaliza a mayúsculas sin espacios. |
| `bank`           | string | sí          | No vacío (`minLength: 1`).                                     |
| `alias`          | string | no          | No vacío. Def.: `"<bank> ···<4 últimos del IBAN>"`.            |
| `type`           | string | no          | `"checking"` \| `"savings"`. Def. `"checking"`.                |
| `initialBalance` | number | no          | ≥ 0. Def. `0`.                                                 |

> No se aceptan propiedades adicionales (`additionalProperties: false`).

**Respuesta 201** — objeto `Account` creado.

**Errores**
| Código HTTP | `code`             | Cuándo                                        |
| ----------- | ------------------ | --------------------------------------------- |
| 400         | `VALIDATION_ERROR` | Falta `iban` o `bank`, o el body no cumple el esquema. |
| 409         | `CONFLICT`         | Ya existe una cuenta con ese `iban`.          |

> **Alta automática de cuentas al importar.** Existe además un servicio interno
> de find-or-create por IBAN a partir de los metadatos de un extracto
> (`iban` + `bank` son los datos suficientes; si falta alguno no se crea nada y
> se lanza `MISSING_ACCOUNT_DATA`, 422). **No tiene endpoint** en esta feature:
> lo encadenará la feature de importación.

---

### `GET /api/categories`

Lista las categorías **raíz** con sus subcategorías embebidas en `children`.
Las subcategorías no aparecen como elementos de primer nivel.

**Respuesta 200**
```json
[
  {
    "id": 1,
    "name": "Food",
    "kind": "expense",
    "parentId": null,
    "createdAt": "2026-08-06T18:30:00.000Z",
    "children": [
      {
        "id": 2,
        "name": "Groceries",
        "kind": "expense",
        "parentId": 1,
        "createdAt": "2026-08-06T18:31:00.000Z",
        "children": []
      }
    ]
  }
]
```

---

### `POST /api/categories`

Crea una categoría raíz (sin `parentId`) o una subcategoría (con `parentId`).

**Body**
| Campo      | Tipo   | Obligatorio | Reglas                                                  |
| ---------- | ------ | ----------- | ------------------------------------------------------- |
| `name`     | string | sí          | No vacío (`minLength: 1`).                              |
| `kind`     | string | sí          | `"expense"` \| `"income"`.                              |
| `parentId` | number | no          | Entero. El padre debe existir, **ser raíz** y tener el **mismo `kind`**. |

> No se aceptan propiedades adicionales (`additionalProperties: false`).

**Respuesta 201** — objeto `Category` creado (con `children: []`).

**Errores**
| Código HTTP | `code`             | Cuándo                                                            |
| ----------- | ------------------ | ----------------------------------------------------------------- |
| 400         | `VALIDATION_ERROR` | El body no cumple el esquema; el `parentId` ya es una subcategoría (solo se admite un nivel); el `kind` no coincide con el del padre. |
| 404         | `NOT_FOUND`        | El `parentId` indicado no existe.                                 |
| 409         | `CONFLICT`         | Ya existe una categoría con ese `(parentId, kind, name)`; en particular, otra **raíz** con el mismo `kind` y `name`. |

---

### `GET /api/movements`

Lista los movimientos **del más reciente al más antiguo** (`bookingDate DESC,
daySequence DESC`), cada uno con su `account` y su `category` embebidos.

**Respuesta 200**
```json
[
  {
    "id": 10,
    "type": "expense",
    "bookingDate": "2026-07-31",
    "valueDate": "2026-07-31",
    "amount": "45.37",
    "description": "RECIBO /Recibo luz",
    "balanceAfter": "9954.63",
    "currency": "EUR",
    "note": null,
    "accountId": 1,
    "account": {
      "id": 1,
      "iban": "ES9820385778983000760236",
      "bank": "bankinter",
      "alias": "bankinter ···0236",
      "type": "checking"
    },
    "categoryId": null,
    "category": null,
    "paymentMethod": null,
    "origin": "imported",
    "status": "pending_review",
    "transferId": null,
    "daySequence": 2,
    "createdAt": "2026-08-06T18:30:00.000Z",
    "updatedAt": "2026-08-06T18:30:00.000Z"
  }
]
```

> ⚠️ **Es el único endpoint de movimientos: son de SOLO LECTURA.** No hay
> `POST /api/movements` ni `DELETE /api/movements/:id`, y tampoco endpoint de
> traspasos. Los movimientos entran **únicamente por importación** desde los
> ficheros del banco (feature siguiente): si un movimiento existe, existe en el
> banco y llegará en su extracto; y darlos de alta o borrarlos a mano
> descuadraría el saldo contra el banco.

---

## Ingesta desde Google Drive

> **Feature "drive-read" (2026-08-03).** Primera lectura de archivos de banco
> desde Drive, **sin parsear y sin base de datos**. El banco y el año se saben por
> la carpeta (`notas-banco/<banco>/<año>/`), no por el contenido; los bancos se
> descubren dinámicamente (las subcarpetas de la raíz SON los bancos). Sin
> autenticación nueva. El contenido descargado se copia a una carpeta local del
> repo **gitignoreada** (nunca se versiona); estos endpoints no exponen esa ruta
> absoluta, solo la ruta relativa `<banco>/<año>/<archivo>`.

> ⚠️ **BREAKING CHANGE (feature "import", 2026-08-12).** Las rutas en español
> **han desaparecido**: `/api/ingesta/pending` y `/api/ingesta/process` responden
> ahora **404 `NOT_FOUND`** con el cuerpo de error estándar. Las mismas
> capacidades están en `/api/ingestion/pending` y `/api/ingestion/process`. No se
> mantienen alias. Motivo: la norma del proyecto es que todo identificador va en
> inglés (`docs/conventions.md` §Idioma) y este era el último resto en español de
> la API. **Aún NO consumido por el frontend**, así que el coste es cero.
>
> ⚠️ **Segundo cambio de comportamiento en la misma feature:**
> `POST /api/ingestion/process` **ya no mueve** el archivo a `procesados/`; se
> queda en descargar y copiar. Mover es ahora consecuencia de **guardar los
> movimientos**, y eso lo hace [`POST /api/import`](#post-apiimport). Este endpoint
> sigue existiendo porque es lo que permite inspeccionar el archivo de un banco del
> que todavía no hay parser.

### `GET /api/ingestion/pending`

Detección **no destructiva**: recorre todas las carpetas de banco bajo la raíz y,
dentro de cada `<banco>/<año>/`, cuenta y lista los archivos pendientes (los que
cuelgan del año y NO están en `procesados/`). No descarga ni mueve nada. Solo se
listan los bancos/años que tienen algún pendiente.

**Respuesta 200**
```json
{
  "totalPending": 2,
  "banks": [
    {
      "bank": "bankinter",
      "years": [
        {
          "year": "2026",
          "pendingCount": 1,
          "pending": [{ "fileId": "1AbC...", "name": "movs.xlsx" }]
        }
      ]
    }
  ]
}
```

**Errores**
| Código HTTP | `code`                   | Cuándo                                            |
| ----------- | ------------------------ | ------------------------------------------------- |
| 503         | `DRIVE_CONNECTION_ERROR` | No se puede hablar con Drive (mensaje sanitizado). |

---

### `POST /api/ingestion/process`

Acción **explícita** de descarga. Por cada archivo pendiente (uno a uno): descarga
su contenido **tal cual** (sin parsear) y guarda una copia local. **No mueve nada
en Drive**: el archivo sigue pendiente hasta que la importación guarde sus
movimientos. El fallo de un archivo (lectura o copia) se **aísla**: se reporta en
`failed` y el resto continúa. Reejecutarlo sin pendientes no hace nada; con
pendientes reescribe la misma copia local, sin duplicarla.

Sin cuerpo de petición.

**Respuesta 200**
```json
{
  "processedCount": 1,
  "failedCount": 1,
  "processed": [
    { "bank": "bankinter", "year": "2026", "fileId": "1AbC...", "name": "movs.xlsx", "path": "bankinter/2026/movs.xlsx" }
  ],
  "failed": [
    { "bank": "santander", "year": "2025", "fileId": "9XyZ...", "name": "roto.xlsx", "error": "Cannot reach Google Drive" }
  ]
}
```

- `processedCount` / `processed`: archivos **descargados y copiados**, no
  «procesados» en el sentido de Drive (ninguno se ha movido).
- `path`: ruta de la copia **relativa** a la carpeta de volcado local (no se
  expone la ruta absoluta de la máquina).
- `error`: mensaje **sanitizado** para humanos; nunca contiene tokens ni secretos.
- Un fallo por archivo NO cambia el código HTTP: la respuesta es 200 con el
  detalle en `failed`. Solo un fallo de Drive de nivel superior (no se pueden ni
  listar los bancos) devuelve 503.

**Errores**
| Código HTTP | `code`                   | Cuándo                                            |
| ----------- | ------------------------ | ------------------------------------------------- |
| 503         | `DRIVE_CONNECTION_ERROR` | Fallo de Drive de nivel superior (mensaje sanitizado). |

---

## Importación (Drive → parser → base de datos)

> **Feature "import" (2026-08-12).** El eslabón que faltaba: baja cada archivo
> pendiente, lo parsea con el parser de su banco, **guarda sus movimientos** y solo
> entonces lo mueve a `procesados/`. **No** categoriza, **no** empareja traspasos,
> **no** confirma nada y **no** guarda productos de inversión: todo entra como
> `origin: "imported"`, `status: "pending_review"`, sin categoría ni forma de pago.

### `POST /api/import`

Sin cuerpo de petición y sin autenticación nueva. Por cada archivo pendiente de
cada `<banco>/<año>/`, en el orden en que Drive los lista (por nombre):

1. elige el parser por el **banco de la carpeta** y por la **extensión**;
2. descarga el contenido y escribe su copia cruda local (re-parseable sin volver a
   bajar nada);
3. parsea;
4. resuelve la cuenta: con el `iban` del archivo la crea si no existía; sin `iban`
   usa la **única** cuenta ya dada de alta de ese banco;
5. guarda los movimientos en **una sola operación** (o entran todos los buenos de
   ese archivo, o ninguno);
6. **solo entonces** mueve el original a `<banco>/<año>/procesados/`.

> **Qué bancos lee hoy el importador:** `bankinter` (`.xlsx`), `myinvestor`
> (`.csv`) y, desde la feature 18, `n26` (`.csv`). El registro vive en
> `src/app.ts`, el único archivo de `src/` que puede nombrar un banco (ADR-015);
> mientras un banco no tenga su línea ahí, sus archivos salen como `skipped` (ni
> se importan ni se mueven), que es justo lo que permite inspeccionarlos.

Un fallo en cualquier paso **aísla** ese archivo: no se importa, **no se mueve**
(sigue pendiente y se puede reintentar) y el resto continúa.

**Estados por archivo**

| `status`   | Qué significa                                                                 | ¿Se mueve? |
| ---------- | ----------------------------------------------------------------------------- | ---------- |
| `imported` | Sus movimientos están guardados (aunque alguna línea no se haya interpretado). | Sí         |
| `skipped`  | Ningún parser lee ese banco, o su extensión no la lee el parser del banco.     | No         |
| `failed`   | Falló la descarga, el parseo, la resolución de cuenta o el guardado.           | No         |

**Respuesta 200**
```json
{
  "importedCount": 39,
  "duplicateCount": 2,
  "unparsedCount": 1,
  "failedCount": 1,
  "skippedCount": 1,
  "files": [
    {
      "bank": "bankinter", "year": "2026", "fileId": "1AbC...", "name": "movs.xlsx",
      "status": "imported",
      "account": {
        "id": 3, "iban": "ES21012800...", "bank": "bankinter",
        "alias": "bankinter ···0236", "type": "checking",
        "created": true, "appliedDefaults": { "alias": true, "type": true }
      },
      "imported": 39,
      "duplicates": 2,
      "unparsedCount": 1,
      "unparsedRows": [{ "row": 42, "reason": "importe no interpretable" }],
      "movedToProcessed": true
    },
    {
      "bank": "myinvestor", "year": "2026", "fileId": "9XyZ...", "name": "extracto.csv",
      "status": "failed", "account": null, "imported": 0, "duplicates": 0,
      "unparsedCount": 0, "unparsedRows": [], "movedToProcessed": false,
      "error": {
        "code": "MISSING_ACCOUNT_DATA",
        "message": "No iban in the file and no account registered for bank myinvestor: add a line \"iban;<IBAN>\" at the top of one of its files, once."
      }
    },
    {
      "bank": "myinvestor", "year": "2026", "fileId": "5Qrs...", "name": "fondo-indexado.json",
      "status": "skipped",
      "reason": "extensión no soportada por el parser de myinvestor",
      "movedToProcessed": false
    }
  ]
}
```

- **Totales:** `importedCount` movimientos guardados, `duplicateCount` descartados
  por ya existir, `unparsedCount` líneas que ningún parser supo interpretar,
  `failedCount` y `skippedCount` archivos.
- `imported` / `duplicates`: movimientos **guardados** y **descartados por
  duplicado** de ese archivo. Reimportar el mismo archivo no duplica nada: sale
  `imported: 0` y `duplicates: n`. Dos líneas idénticas del mismo día **no** son
  duplicados (se distinguen por su posición dentro del día) y se guardan las dos.
- `unparsedCount` / `unparsedRows`: cuántas líneas fallaron **y cuáles**, con su
  número de fila y su motivo. Una línea ilegible **no** retiene el archivo: lo bueno
  se guarda y el archivo se mueve igual.
- `account`: la cuenta usada. `created: true` significa que se dio de alta en esta
  llamada con el IBAN del archivo, y `appliedDefaults` dice qué valores se
  rellenaron solos (`alias` derivado de banco + últimos 4 del IBAN, `type`
  `"checking"`). **Nunca se crea una cuenta sin IBAN.**
- `error`: `code` estable + `message` **sanitizado** (nunca tokens ni secretos ni
  rutas absolutas de la máquina).
- Un fallo por archivo **NO** cambia el código HTTP: la respuesta es 200 con el
  detalle. Solo un fallo de Drive de nivel superior (no se pueden ni listar los
  bancos) devuelve 503.
- Reimportar un archivo ya movido exige devolverlo a mano en Drive de
  `procesados/` a la carpeta del año.

**Errores**
| Código HTTP | `code`                   | Cuándo                                                 |
| ----------- | ------------------------ | ------------------------------------------------------ |
| 503         | `DRIVE_CONNECTION_ERROR` | Fallo de Drive de nivel superior (mensaje sanitizado).  |

**Códigos que aparecen por archivo (dentro del 200)**
| `code`                   | Cuándo                                                                            |
| ------------------------ | --------------------------------------------------------------------------------- |
| `MISSING_ACCOUNT_DATA`   | El archivo no trae `iban` y su banco tiene **cero** o **más de una** cuenta dada de alta. Escribe el IBAN una vez en el archivo. |
| `NOT_UTF8`               | Los bytes del archivo no son UTF-8 (guardado en cp1252/ANSI al editarlo). Vuelve a guardarlo como UTF-8 y reintenta: **no** se importa nada de él y **no** se mueve a `procesados/`. |
| `VALIDATION_ERROR`       | El archivo no es un extracto reconocible para el parser de su banco.               |
| `DRIVE_CONNECTION_ERROR` | Falló la descarga de **ese** archivo.                                              |
| `INTERNAL_SERVER_ERROR`  | Cualquier otro fallo de ese archivo (mensaje sanitizado).                          |

---

## Parser de Bankinter (sin base de datos)

> **Feature "bankinter-parser" (2026-08-04).** Convierte el `.xlsx` de Bankinter
> (el que la ingesta de la f5 dejó como copia local) en movimientos
> estructurados **sin parsear a base de datos, sin deduplicar y sin mover nada en
> Drive**. Solo Bankinter. El resultado se vuelca a un archivo JSON local del repo
> **gitignoreado** (`var/parsed/`, nunca se versiona); estos endpoints no exponen
> esa ruta absoluta, solo la ruta relativa `<banco>/<año>/<archivo>.json`. Sin
> autenticación nueva.

> ⚠️ Breaking change (feature "parser-english", 2026-08-05): los campos del modelo
> del parser pasan de español a inglés (`fechaContable`→`bookingDate`,
> `fechaValor`→`valueDate`, `descripcion`→`description`, `importe`→`amount`,
> `saldo`→`balance`, `divisa`→`currency`, `tipo`→`type` con valores
> `'ingreso'`→`'income'` / `'gasto'`→`'expense'`; a nivel de resultado
> `banco`→`bank`, `cuentaIban`→`accountIban`, `movimientos`→`movements`,
> `noReconocidas`→`unparsedRows`, con `fila`→`row` y `motivo`→`reason`). Aún **NO**
> consumido por el frontend; su feature correspondiente se planifica contra estos
> nombres nuevos. Solo cambian los nombres de campo: el comportamiento del parser
> (columnas, detección de cabecera, interpretación de fechas/importes) no cambia.

> ⚠️ Breaking change (feature "parsed-movement-contract", 2026-08-11): el modelo
> del parser deja de ser de Bankinter y pasa a ser **el contrato común de todos los
> parsers de banco** (`src/lib/parsed-statement.ts`, ADR-013). Tres cambios
> observables: (1) un importe **0** sale como `"neutral"` y ya **no** como
> `"income"` —se alinea con el modelo de la BD—; (2) cada movimiento trae
> **`daySequence`** (posición dentro de su día, `1` = el **más antiguo** del día); y (3)
> `accountIban` y `balance` pueden ser **`null`** cuando el archivo no los trae
> (`null`, nunca `""` ni `0`). Aún **NO** consumido por el frontend. El resto del
> comportamiento del parser de Bankinter no cambia: mismas columnas, misma
> detección de cabecera, misma interpretación de fechas e importes y los mismos
> valores para el mismo archivo.

### Modelo `ParsedMovement` (contrato común de todos los bancos)

Lo devuelve el parser de **cualquier** banco. En Bankinter se llena con sus
columnas reales `Fecha contable | Fecha valor | Descripción | Importe | Saldo |
Divisa`; un banco que no reporte saldo (o IBAN) deja esos campos en `null`.

| Campo         | Tipo                                     | Descripción                                                          |
| ------------- | ---------------------------------------- | -------------------------------------------------------------------- |
| `bookingDate` | string (ISO `YYYY-MM-DD`)                | Fecha contable.                                                      |
| `valueDate`   | string (ISO `YYYY-MM-DD`)                | Fecha valor.                                                         |
| `description` | string                                   | Descripción del movimiento.                                          |
| `amount`      | number                                   | Importe con signo, en euros (negativo = salida).                     |
| `balance`     | number \| `null`                         | Saldo tras el movimiento; `null` = **el archivo no lo trae** (≠ 0).  |
| `currency`    | string                                   | Divisa del movimiento (p. ej. `"EUR"`); `""` si no aparece.          |
| `type`        | `"income"` \| `"expense"` \| `"neutral"` | Derivado del signo del importe; **`0` → `"neutral"`**.               |
| `daySequence` | number                                   | Posición dentro de su `bookingDate`; `1` = el **más antiguo** de ese día, creciendo hacia el más reciente (no es el orden de aparición en el archivo). Solo se numeran los movimientos parseados: una fila de `unparsedRows` no consume número. |

> El resultado completo de un archivo tiene la forma `{ bank: "bankinter",
> accountIban, accountBalance, movements: ParsedMovement[], unparsedRows: { row,
> reason }[] }`, con `accountIban` a `null` cuando el archivo no lo trae (nunca `""`),
> y es lo que se escribe en el JSON local. De dónde sale ese `accountIban` es
> conocimiento de cada banco: Bankinter lo trae en el preámbulo de su `.xlsx`; en
> MyInvestor lo escribe el humano **una vez**, como línea `iban;<IBAN>` encima de la
> cabecera del `.csv` (feature 12). Ningún parser lo infiere de un concepto con
> forma de IBAN. `amount` y `balance` se interpretan tanto
> desde el número nativo del Excel como desde texto español (coma decimal / punto
> de miles, `1.234,56` → `1234.56`). **No** se deduplica: dos filas idénticas
> aparecen las dos. Una fila no interpretable (fecha, importe o saldo ilegibles) va
> a `unparsedRows` (con su nº de fila en `row` y el motivo en `reason`), sin perderse.

#### Los dos «saldos» del contrato, que NO son el mismo dato

> Añadido por la feature 16 (`statement-balance`, 2026-08-16). Campo nuevo en el
> contrato común: `accountBalance`. Aún **NO** consumido por el frontend.

| Campo del resultado | Qué es | Quién lo trae hoy |
| --- | --- | --- |
| `accountBalance` (nivel **extracto**) | Saldo **de la cuenta** en la fecha del extracto. Un solo valor por archivo | MyInvestor y N26, de la línea de preámbulo `saldo;<importe>` que escribe el humano. Bankinter: `null` |
| `balance` (dentro de cada **movimiento**) | Saldo **tras esa línea**. Uno por movimiento | Bankinter, de su columna `Saldo`. MyInvestor y N26: `null` siempre (ADR-013) |

Son **dos datos distintos y no comparten campo ni nombre**: sumarlos o usar uno
como sustituto del otro es un error. `accountBalance` es `number | null`, con
`null` = «el archivo no trae esa línea» (nunca `0`, que es un saldo real), se
emite **tal cual está escrito** —no se calcula, no se acumula desde los importes y
no se cuadra contra ellos— y **no se persiste**: esta feature es parser y volcado.

### `POST /api/parser/bankinter`

Acción **explícita** de parseo. Recorre las copias locales de Bankinter que dejó
la ingesta (`var/drive-read/bankinter/<año>/*.xlsx`), parsea cada una y escribe su
resultado a `var/parsed/bankinter/<año>/<archivo>.json`. Read-only respecto a
Drive y a la base de datos: **no** descarga, **no** mueve, **no** persiste en BD.
Un fallo por archivo (no es un extracto reconocible, etc.) se **aísla** en
`failed` y no detiene al resto. Reejecutarlo sin copias locales no hace nada.

Sin cuerpo de petición.

**Respuesta 200**
```json
{
  "parsedCount": 1,
  "failedCount": 0,
  "parsed": [
    {
      "bank": "bankinter",
      "year": "2026",
      "file": "movs.xlsx",
      "accountIban": "ES9820385778983000760236",
      "movements": 42,
      "unparsedRows": 1,
      "dumpPath": "bankinter/2026/movs.xlsx.json"
    }
  ],
  "failed": []
}
```

- `movements` / `unparsedRows`: número de movimientos parseados y de filas no
  reconocidas; el detalle completo está en el JSON volcado.
- `accountIban`: puede ser **`null`** si ese archivo no trae la línea del IBAN
  (antes de 2026-08-11 era `""`; ver el breaking change de arriba).
- `dumpPath`: ruta del JSON volcado **relativa** a la carpeta de volcado local (no
  se expone la ruta absoluta de la máquina).
- `failed[]`: `{ bank, year, file, error }` con el `error` sanitizado (sin
  secretos). Un fallo por archivo NO cambia el código HTTP: la respuesta es 200.

---

## Parser de MyInvestor (sin base de datos)

> **Feature "myinvestor-statement" (2026-08-11, ADR-014).** Convierte el
> **extracto CSV de la cuenta corriente** de MyInvestor (la copia local que dejó
> la ingesta de la f5) en movimientos estructurados, **sin base de datos, sin
> deduplicar y sin mover nada en Drive**. Devuelve el **mismo contrato**
> `ParsedMovement` / `ParsedStatement` que Bankinter (ver §Modelo `ParsedMovement`
> más arriba): el módulo del banco no declara su propia forma de movimiento.
> El volcado va al mismo `var/parsed/` **gitignoreado**; el endpoint solo expone la
> ruta relativa `<banco>/<año>/<archivo>.json`. Sin autenticación nueva.

> 📌 **Dos datos que este banco NO aporta y que salen como `null` explícito**
> (nunca `0`, nunca `""` y **sin ningún campo aparte que lo anuncie** —ADR-013
> descartó `providesBalance`):
>
> - `balance` en **todos** los movimientos: el extracto no trae columna de saldo, y
>   el parser **no lo calcula ni lo acumula**. Consecuencia para la importación: el
>   saldo de esta cuenta se obtiene sumando desde `Account.initialBalance` (la rama
>   que ADR-011 describía como excepcional), así que `initialBalance` es su **único
>   ancla**.
> - ~~`accountIban` en el resultado~~ → **actualizado por la feature 12
>   (2026-08-12)**: el banco sigue sin aportarlo, pero **el humano lo escribe a
>   mano, una sola vez**, como línea de preámbulo `iban;ES30…` **encima** de la fila
>   de cabecera. El parser lee **esa línea etiquetada y solo esa** (primera celda
>   `iban`, sin distinguir mayúsculas ni espacios; el valor es la segunda celda) y
>   emite su valor como `accountIban`. Sigue sin deducirse del nombre del archivo,
>   de la carpeta ni de un concepto con forma de IBAN. Si la línea falta, está vacía
>   o va por debajo de la cabecera, `accountIban` es `null`. Con ella, la cuenta se
>   crea sola al importar y ya no hace falta darla de alta a mano.

> 💶 **El saldo de la cuenta: segunda línea de preámbulo etiquetada** (feature 16,
> 2026-08-16). Igual que el IBAN, el banco no lo exporta y **lo escribe el humano a
> mano**, como línea `saldo;<importe>` **encima** de la fila de cabecera, junto a la
> del `iban;`. El parser lee **esa línea etiquetada y solo esa** (primera celda
> `saldo`, **sin distinguir mayúsculas ni acentos**; el valor es la segunda celda) y
> emite `accountBalance`. Reglas:
>
> - El importe se interpreta con **el mismo normalizador que la columna `Importe`**
>   de este banco: coma decimal española, punto de miles y signo (`1.234,56` →
>   `1234.56`).
> - **Si la línea falta o viene vacía, `accountBalance` es `null` y no pasa nada**:
>   el extracto se parsea igual, como con el IBAN. Su ausencia no es un fallo.
> - Si la línea **está** pero el importe no es interpretable (`saldo;abc`), no se
>   descarta en silencio: va a `unparsedRows` con su nº de línea y el motivo
>   «saldo de la cuenta no interpretable», y el resto del archivo se parsea igual.
>   Un archivo solo se rechaza entero por su **codificación** (F17) o por no tener
>   cabecera reconocible.
> - Si la etiqueta aparece **dos veces**, gana la **primera** (misma regla que el
>   IBAN desde la F12).
> - La fila `Saldo` que algunos exports llevan **al final** del archivo **NO** se
>   lee: hay **una sola forma** de escribir este dato, la del preámbulo. Debajo de
>   la cabecera esa fila es data y se trata como cualquier fila ilegible.
> - `accountBalance` **no es** el `balance` de cada movimiento (ver §Los dos
>   «saldos» del contrato).

> 🔴 **El extracto DEBE estar guardado en UTF-8** (feature
> "statement-encoding-guard", 2026-08-15). El fichero se descodifica en UTF-8
> **estricto**: si sus bytes no son UTF-8 válido —lo que hace el Bloc de notas o
> Excel en modo ANSI cuando editas el fichero para añadir la línea `iban;`— el
> extracto **entero** se rechaza como fallo de ese archivo (`NOT_UTF8`), con el
> byte y la línea del problema y la instrucción de volver a guardarlo. No se
> rechazan «solo las filas afectadas» y **no** se descodifica cp1252: la
> codificación es una propiedad del fichero completo, y aceptar la mitad buena
> dejaría entrar un extracto que parece completo y no lo es. El BOM inicial sigue
> siendo válido y tolerado.

Columnas reales del extracto (`;` como separador, UTF-8, BOM tolerado), mapeadas
**por nombre** de cabecera y no por posición:
`Fecha de operación | Fecha de valor | Concepto | Importe | Divisa` →
`bookingDate | valueDate | description | amount | currency`. Los importes se
interpretan aunque mezclen separador de miles dentro del mismo archivo
(`-60`, `-9,49`, `-4200`, `-31.000`, `12.345,67`). **No** se deduplica. Una línea no
interpretable va a `unparsedRows` (`{ row, reason }`, con `row` 1-based contando la
cabecera) sin detener el resto, y **no consume `daySequence`**.

### Productos de inversión: la segunda entrada del mismo banco

> **Feature "myinvestor-products" (2026-08-12, ADR-016).** El mismo banco aporta
> además **archivos `.json` de producto de inversión escritos a mano** por el
> humano (fondos, ETF, cartera automatizada y depósitos), uno por producto y por
> foto. **El mismo endpoint los devuelve**: se distinguen del extracto **por la
> extensión** (`.csv` → extracto, `.json` → producto) y el banco sigue saliendo de
> la carpeta. Sigue sin haber base de datos: solo parseo y volcado.
>
> El **formato del archivo** (plantillas, tabla de campos, reglas de números y
> fechas) es `docs/myinvestor-product-files.md`, no este contrato.

Modelo de un producto parseado, tal como aparece en el volcado:

```json
{
  "bank": "myinvestor",
  "file": "mi-fondo-2026-08-31.json",
  "type": "fund",
  "name": "Mi Fondo de Ejemplo",
  "date": "2026-08-31",
  "currency": "EUR",
  "openedAt": "2025-01-15",
  "closedAt": null,
  "valuation": {
    "invested": 800,
    "marketValue": 947.25,
    "gain": 147.25,
    "gainPercent": 18.41,
    "uninvestedCash": null
  },
  "depositTerms": null
}
```

| Campo | Tipo | Notas |
| --- | --- | --- |
| `bank` | `string` | siempre `"myinvestor"`; sale de la carpeta, nunca del contenido |
| `file` | `string` | **procedencia**: el nombre del archivo de origen. No decide ni el nombre ni la fecha |
| `type` | `string` | `fund` \| `etf` \| `managed_portfolio` \| `deposit` |
| `name` | `string` | identidad del producto, escrita dentro del archivo |
| `date` | `string` | ISO `YYYY-MM-DD`: la fecha de la foto (del apunte, en un depósito) |
| `currency` | `string` | `"EUR"` si el archivo no la trae |
| `openedAt` | `string` | ISO; **obligatorio en los cuatro tipos** (feature 15). Nunca `null`: un archivo sin él es un archivo **fallido**, no un producto con hueco |
| `closedAt` | `string \| null` | ISO; `null` = vivo. **Dejar de escribir un producto NO lo cierra** |
| `valuation` | objeto \| `null` | `null` en `deposit` |
| `depositTerms` | objeto \| `null` | `null` en los otros tres tipos |

`valuation` (los productos que fluctúan): `invested`, `marketValue`, `gain`,
`gainPercent` (**porcentaje** con signo: `7.01` es 7,01 %) y `uninvestedCash`
(`number | null`, **aparte** de `marketValue` y **nunca sumado** dentro de él ni de
ningún total).

`depositTerms` (solo `deposit`): `principal`, `interestRate` (la **única** TAE, la
que se aplica, en porcentaje), `expectedGain` y `maturityDate` (ISO).

Todos los importes son **números**, emitidos **tal cual se escribieron**: sin
redondear, sin fijar decimales y sin recalcular nada. Si los valores de un archivo no
cuadran entre ellos, salen como están: el parser **no calcula**.

### `POST /api/parser/myinvestor`

Acción **explícita** de parseo. Recorre las copias locales de MyInvestor
(`var/drive-read/myinvestor/<año>/`), aplica el parser **por extensión**
(`.csv` → extracto; `.json` → producto de inversión; cualquier otra → `ignored`) y
escribe el resultado de cada extracto en
`var/parsed/myinvestor/<año>/<archivo>.json` y el de **todos los productos del año**
en `var/parsed/myinvestor/<año>/products.json`. Read-only respecto a Drive y a la
base de datos: **no** descarga, **no** mueve, **no** persiste en BD. Reejecutarlo
sobre los mismos archivos produce **exactamente el mismo resultado**.

Sin cuerpo de petición.

**Respuesta 200**
```json
{
  "parsedCount": 1,
  "productCount": 1,
  "failedCount": 0,
  "ignoredCount": 1,
  "statements": [
    {
      "bank": "myinvestor",
      "year": "2026",
      "file": "extracto.csv",
      "accountIban": null,
      "accountBalance": 1500,
      "movements": 12,
      "unparsedRows": 0,
      "dumpPath": "myinvestor/2026/extracto.csv.json"
    }
  ],
  "products": [
    {
      "bank": "myinvestor",
      "year": "2026",
      "file": "mi-fondo-2026-08-31.json",
      "type": "fund",
      "name": "Mi Fondo de Ejemplo",
      "date": "2026-08-31",
      "dumpPath": "myinvestor/2026/products.json"
    }
  ],
  "failed": [],
  "ignored": [
    {
      "bank": "myinvestor",
      "year": "2026",
      "file": "deposito.txt",
      "reason": "extensión no soportada por este parser ('.txt')"
    }
  ]
}
```

- `accountIban`: `null` salvo que el archivo traiga la línea de preámbulo
  `iban;<IBAN>` que escribe el humano (ver la nota de arriba).
- `accountBalance`: saldo **de la cuenta** en la fecha del extracto, de la línea de
  preámbulo `saldo;<importe>`; `null` si esa línea no está (feature 16). **No** es el
  `balance` de cada movimiento, que en este banco es `null` siempre.
- `parsedCount` cuenta **extractos**; `productCount`, **productos**.
- `products[]`: un **resumen** por producto parseado (`bank`, `year`, `file`, `type`,
  `name`, `date`, `dumpPath`). El producto completo, con su `valuation` o sus
  `depositTerms`, vive en el volcado del año.
- `dumpPath`: ruta del JSON volcado **relativa** a la carpeta de volcado local (no
  se expone la ruta absoluta de la máquina). Todos los productos de un año comparten
  `<banco>/<año>/products.json`: **un volcado por año**, no uno por archivo. Ese
  volcado contiene `{ bank, year, products[], failed[], ignored[] }` de ese año, y
  solo se escribe si el año tiene algún `.json` de producto.
- `failed[]`: `{ bank, year, file, reason }` con el motivo sanitizado, para las dos
  entradas. Un extracto cuyos bytes no sean UTF-8 cae aquí entero, con el motivo
  «el archivo no está guardado en UTF-8 (byte 0xD3 no válido en la línea N)…» y sin
  escribir volcado. Un archivo de producto mal escrito acumula **todos** sus problemas en un
  solo `reason` (campos obligatorios que faltan, valores que no son números, un
  número escrito **como texto**, fechas en otro formato, claves desconocidas, o el
  choque con otro archivo que declara el mismo producto y fecha). Un fallo por
  archivo NO cambia el código HTTP: la respuesta es **200** con el fallo dentro.
- `ignored[]`: `{ bank, year, file, reason }` para las extensiones que este parser
  no maneja (los `.txt` con notas, una hoja de cálculo suelta…). **No** son un
  fallo: son visibles y quedan fuera de la lista de cosas que arreglar. Los `.json`
  de producto **ya no caen aquí**: tienen su parser desde la feature 13.

---

## Parser de N26 (sin base de datos)

> **Feature "n26-statement" (2026-08-17).** Convierte el **extracto `.csv` de la
> cuenta de N26** (la copia local que dejó la ingesta de la f5) en movimientos
> estructurados, **sin base de datos, sin deduplicar y sin mover nada en Drive**.
> Devuelve el **mismo contrato** `ParsedMovement` / `ParsedStatement` que los
> otros dos bancos (ver §Modelo `ParsedMovement`): el módulo del banco no declara
> su propia forma de movimiento. El volcado va al mismo `var/parsed/`
> **gitignoreado**; el endpoint solo expone la ruta relativa
> `<banco>/<año>/<archivo>.json`. Sin autenticación nueva.

**Qué tiene de distinto este fichero** (y por qué tiene su propio lector, en
`src/modules/n26/n26.csv.ts`):

- **Separador coma y campos entrecomillados**, con comas **dentro** de las
  comillas. Se lee como CSV de verdad (comillas, `""` como comilla literal y
  saltos de línea dentro de un campo); partir la línea por `,` cortaría filas.
- **Fechas ya en ISO `AAAA-MM-DD`**: no se convierten. Se valida que el día
  exista (`2026-02-31` no se «arregla», se reporta).
- **Importes con punto decimal y el signo dentro** (`-3.40`). La columna del
  banco se lee **estricta**: cualquier otra forma va a `unparsedRows` en vez de
  adivinarse.
- **11 columnas**, mapeadas **por nombre** de cabecera y no por posición. Las que
  no tienen sitio en el contrato (IBAN de la contraparte, alias de la cuenta,
  importe/divisa de origen y tipo de cambio) **no se inventan como campos
  nuevos**: se quedan en el fichero.
- **La divisa del movimiento sale de la cabecera** de la columna de importes,
  que la declara una sola vez (`Amount (EUR)` → `"EUR"`), nunca fila a fila.

> 🧩 **El concepto se COMPONE: este banco no exporta ninguna columna de concepto.**
> `description` = **contraparte** + (`" - "` + **referencia libre**, si está
> escrita y no repite a la contraparte). Si no hay contraparte, manda la
> referencia; si no hay ninguna de las dos, se usa el **tipo de apunte** del
> banco, que siempre viene relleno. Un movimiento **nunca** sale con el concepto
> vacío, y una fila en la que no se pueda componer ninguno se **reporta** en
> `unparsedRows` en lugar de recibir un nombre inventado.

> 📌 **Dos datos que este banco NO aporta y que salen como `null` explícito**
> (nunca `0`, nunca `""`):
>
> - `balance` en **todos** los movimientos: no hay columna de saldo y el parser
>   **no lo calcula ni lo acumula**.
> - `accountIban`: el fichero trae el IBAN **de la contraparte**, que no es el de
>   la cuenta y **nunca** se confunde con él. El de la cuenta lo escribe el humano
>   **una vez**, como línea de preámbulo `iban;ES…` **encima** de la cabecera,
>   igual que en MyInvestor. Sin esa línea, la importación se apoya en el camino
>   que ya existe: la **única** cuenta registrada de ese banco, o
>   `MISSING_ACCOUNT_DATA` si hay cero o varias.

> 💶 **El saldo de la cuenta**, `accountBalance`, sale de la segunda línea de
> preámbulo, `saldo;<importe>`, con las mismas reglas que en MyInvestor: etiqueta
> sin distinguir mayúsculas ni acentos, separadores de relleno finales inocuos,
> **ausente o vacía → `null` y el fichero se parsea igual**, presente pero
> ilegible → `unparsedRows` con su nº de línea y su motivo, repetida → gana la
> primera, y **solo por encima de la cabecera** (debajo es data).
>
> 🔴 **Las dos líneas de preámbulo se escriben con `;` aunque este fichero separe
> por comas** (decisión del leader, feature 18): una sola forma de escribirlas en
> todo el proyecto y una línea que se distingue a simple vista de las del banco.
> Escrita con la coma del fichero también se entiende, pero la forma documentada
> es la del `;` (ver `docs/dar-de-alta-un-banco.md`).
>
> El **importe de esa línea** admite las dos escrituras —`1.500,00` (española) y
> `1500.00` (la del fichero)— porque esa línea **la escribe el humano**, no el
> banco. La columna de importes del banco, no: ahí solo vale el punto decimal.

> 🔴 **El extracto DEBE estar guardado en UTF-8** (feature
> "statement-encoding-guard"): se descodifica con `decodeUtf8Strict` y un byte que
> no sea UTF-8 válido **rechaza el fichero entero** (`NOT_UTF8`). La muestra de hoy
> es ASCII puro, pero en cuanto un comercio traiga una tilde el problema es el
> mismo. El BOM inicial es válido y se tolera.

Otras reglas, idénticas a las de los demás bancos: **no** se deduplica (dos filas
idénticas salen las dos), las líneas en blanco se ignoran, una fila no
interpretable va a `unparsedRows` (`{ row, reason }`, `row` 1-based contando la
cabecera) sin detener el resto y **sin consumir `daySequence`**, y `daySequence`
se numera con `1` = el **más antiguo** del día (este banco exporta de más antiguo
a más reciente).

### `POST /api/parser/n26`

Acción **explícita** de parseo. Recorre las copias locales de N26
(`var/drive-read/n26/<año>/`), parsea los `.csv` (cualquier otra extensión →
`ignored`) y escribe el resultado de cada uno en
`var/parsed/n26/<año>/<archivo>.json`. Read-only respecto a Drive y a la base de
datos: **no** descarga, **no** mueve, **no** persiste en BD. Reejecutarlo sobre
los mismos archivos produce **exactamente el mismo resultado**.

Sin cuerpo de petición.

**Respuesta 200**
```json
{
  "parsedCount": 1,
  "failedCount": 0,
  "ignoredCount": 0,
  "statements": [
    {
      "bank": "n26",
      "year": "2026",
      "file": "extracto.csv",
      "accountIban": "ES9820385778983000760236",
      "accountBalance": 1500,
      "movements": 90,
      "unparsedRows": 0,
      "dumpPath": "n26/2026/extracto.csv.json"
    }
  ],
  "failed": [],
  "ignored": []
}
```

- `accountIban` / `accountBalance`: `null` salvo que el archivo traiga sus líneas
  de preámbulo (ver arriba). El IBAN del ejemplo es sintético.
- `dumpPath`: ruta **relativa** a la carpeta de volcado local (nunca la absoluta
  de la máquina).
- `failed[]`: `{ bank, year, file, reason }` con el motivo sanitizado. Un fallo
  por archivo **no** cambia el código HTTP: la respuesta es 200 con el fallo
  dentro. Un fichero que no esté en UTF-8, o que no tenga cabecera reconocible,
  cae aquí entero y **no** se escribe volcado.
- `ignored[]`: `{ bank, year, file, reason }` para las extensiones que este parser
  no maneja. **No** son un fallo.

---

## Endpoints de operación (no de dominio)

Para monitorización; el frontend no los consume.

| Método | Ruta            | Descripción                                       |
| ------ | --------------- | ------------------------------------------------- |
| `GET`  | `/health`       | Liveness (el proceso responde).                   |
| `GET`  | `/health/db`    | Readiness (la base de datos responde).            |
| `GET`  | `/health/drive` | Readiness (Google Drive responde).                |

### `GET /health/drive`

Comprobación bajo demanda de la conexión con Google Drive. No lleva prefijo
`/api` (es un endpoint de operación). Es idempotente y **no tumba la app** si
Drive no responde.

**Respuesta 200** — Drive es alcanzable.
```json
{ "status": "ok", "drive": "up" }
```

**Respuesta 503** — Drive no es alcanzable (token caducado, API deshabilitada,
scope insuficiente, red, etc.).
```json
{ "status": "error", "drive": "down" }
```

> La cuenta de Drive conectada (`emailAddress`) **no** se incluye en el cuerpo:
> el endpoint no tiene autenticación y solo se registra en los logs del servidor.
> El detalle del fallo va sanitizado al log, nunca al cuerpo.
