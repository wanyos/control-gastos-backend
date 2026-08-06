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
| `MISSING_ACCOUNT_DATA`  | 422  | Los metadatos de un extracto no bastan para crear la cuenta (falta `iban` y/o `bank`). **Reservado** (interno; lo devolverá la feature de importación, ningún endpoint lo emite hoy). |
| `INTERNAL_SERVER_ERROR` | 500  | Error inesperado; el cuerpo no expone detalles internos.   |
| `DRIVE_CONNECTION_ERROR`| 503  | No se puede hablar con Google Drive (token caducado, API deshabilitada, scope insuficiente…). |
| `UNKNOWN_BANK`          | 404  | El banco (con formato válido) no está registrado en Drive. **Reservado** (interno; ningún endpoint lo devuelve todavía). |

> **Nota (`DRIVE_CONNECTION_ERROR`, actualizada en la feature "drive-read",
> 2026-08-03):** desde la feature 5 este código **sí** sale en el cuerpo de error
> estándar. Los endpoints de ingesta (`GET /api/ingesta/pending` y
> `POST /api/ingesta/process`) lo devuelven con `{ statusCode, code, message }`
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
    "balance": "24627.49",
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
    "amount": "188.67",
    "description": "RECIBO /Recibo luz",
    "balanceAfter": "24627.49",
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

### `GET /api/ingesta/pending`

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

### `POST /api/ingesta/process`

Acción **explícita** de proceso. Por cada archivo pendiente (uno a uno): descarga
su contenido **tal cual** (sin parsear), guarda una copia local y, **solo si la
copia se escribió con éxito**, mueve el original a `<banco>/<año>/procesados/`. El
fallo de un archivo (lectura o copia) se **aísla**: ese archivo NO se mueve, se
reporta en `failed` y el resto continúa. Reejecutarlo sin pendientes no hace nada.

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

### Modelo `ParsedMovement`

Refleja las columnas reales del extracto de Bankinter: `Fecha contable | Fecha
valor | Descripción | Importe | Saldo | Divisa`.

| Campo         | Tipo                      | Descripción                                                  |
| ------------- | ------------------------- | ----------------------------------------------------------- |
| `bookingDate` | string (ISO `YYYY-MM-DD`) | Fecha contable.                                             |
| `valueDate`   | string (ISO `YYYY-MM-DD`) | Fecha valor.                                                |
| `description` | string                    | Descripción del movimiento.                                 |
| `amount`      | number                    | Importe con signo, en euros (negativo = salida).            |
| `balance`     | number                    | Saldo tras el movimiento, en euros.                         |
| `currency`    | string                    | Divisa del movimiento (p. ej. `"EUR"`); `""` si no aparece. |
| `type`        | `"income"` \| `"expense"` | Derivado del signo del importe.                             |

> El resultado completo de un archivo tiene la forma `{ bank: "bankinter",
> accountIban, movements: ParsedMovement[], unparsedRows: { row, reason }[] }`
> y es lo que se escribe en el JSON local. `amount` y `balance` se interpretan tanto
> desde el número nativo del Excel como desde texto español (coma decimal / punto
> de miles, `1.234,56` → `1234.56`). **No** se deduplica: dos filas idénticas
> aparecen las dos. Una fila no interpretable (fecha, importe o saldo ilegibles) va
> a `unparsedRows` (con su nº de fila en `row` y el motivo en `reason`), sin perderse.

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
- `dumpPath`: ruta del JSON volcado **relativa** a la carpeta de volcado local (no
  se expone la ruta absoluta de la máquina).
- `failed[]`: `{ bank, year, file, error }` con el `error` sanitizado (sin
  secretos). Un fallo por archivo NO cambia el código HTTP: la respuesta es 200.

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
