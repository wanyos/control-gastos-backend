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
- **Números decimales:** el campo `amount` se serializa como **string decimal**
  (p. ej. `"45.90"`), no como número, porque proviene de un `Decimal(10,2)`.
- **Fechas:** ISO 8601 en UTC (p. ej. `"2026-07-04T00:00:00.000Z"`).
- **Errores:** todo cuerpo de error tiene la forma única
  `{ "statusCode": NUMBER, "code": "STRING", "message": "STRING" }`
  (ver la sección [Errores](#errores)).

## Errores

Toda respuesta de error de la API (validación, no encontrado, error interno,
ruta inexistente) usa el mismo cuerpo:

```json
{ "statusCode": 404, "code": "NOT_FOUND", "message": "Expense not found" }
```

- `statusCode`: el código HTTP de la respuesta, repetido en el cuerpo.
- `code`: identificador **estable** para máquinas; el frontend puede
  discriminar por él (además de por el código HTTP).
- `message`: texto para humanos; **puede cambiar sin aviso**, no programar
  lógica contra él.

Códigos estables:

| `code`                  | HTTP | Cuándo                                                     |
| ----------------------- | ---- | ---------------------------------------------------------- |
| `VALIDATION_ERROR`      | 400  | El body o los params no cumplen el esquema de la ruta.     |
| `NOT_FOUND`             | 404  | El recurso pedido no existe, o la ruta no existe.          |
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

## Modelos

### `Expense`

| Campo         | Tipo             | Descripción                                              |
| ------------- | ---------------- | -------------------------------------------------------- |
| `id`          | number           | Identificador.                                           |
| `description` | string           | Descripción del gasto.                                   |
| `amount`      | string (decimal) | Importe con 2 decimales, serializado como string.        |
| `date`        | string (ISO)     | Fecha del gasto.                                          |
| `categoryId`  | number \| null   | Id de la categoría asociada, o `null`.                   |
| `category`    | `Category` \| null | Categoría embebida (se incluye en las respuestas).     |
| `createdAt`   | string (ISO)     | Fecha de creación del registro.                          |
| `updatedAt`   | string (ISO)     | Fecha de última modificación.                            |

### `Category`

| Campo       | Tipo         | Descripción              |
| ----------- | ------------ | ------------------------ |
| `id`        | number       | Identificador.           |
| `name`      | string       | Nombre único.            |
| `createdAt` | string (ISO) | Fecha de creación.       |

## Endpoints

### `GET /api/expenses`

Lista todos los gastos, del más reciente al más antiguo. Cada gasto incluye su
`category` embebida.

**Respuesta 200**
```json
[
  {
    "id": 1,
    "description": "Weekly groceries",
    "amount": "45.90",
    "date": "2026-07-04T00:00:00.000Z",
    "categoryId": 1,
    "category": { "id": 1, "name": "Food", "createdAt": "2026-07-01T10:00:00.000Z" },
    "createdAt": "2026-07-04T18:30:00.000Z",
    "updatedAt": "2026-07-04T18:30:00.000Z"
  }
]
```

---

### `GET /api/expenses/:id`

Obtiene un gasto por su `id` (incluye `category`).

**Path params**
| Param | Tipo   | Descripción                 |
| ----- | ------ | --------------------------- |
| `id`  | number | Id del gasto (entero).      |

**Respuesta 200** — objeto `Expense`.

**Errores**
| Código HTTP | Cuándo                                      |
| ----------- | ------------------------------------------- |
| 400         | `id` no es un entero.                       |
| 404         | No existe un gasto con ese `id`.            |

---

### `POST /api/expenses`

Crea un gasto.

**Body**
| Campo         | Tipo   | Obligatorio | Reglas                          |
| ------------- | ------ | ----------- | ------------------------------- |
| `description` | string | sí          | No vacío (`minLength: 1`).      |
| `amount`      | number | sí          | Mayor que 0.                    |
| `date`        | string | no          | ISO date-time. Def.: ahora.     |
| `categoryId`  | number | no          | Entero. Id de una categoría.    |

> No se aceptan propiedades adicionales (`additionalProperties: false`).

**Respuesta 201** — objeto `Expense` creado (incluye `category`).

**Errores**
| Código HTTP | Cuándo                                      |
| ----------- | ------------------------------------------- |
| 400         | El body no cumple el esquema de validación. |

---

### `DELETE /api/expenses/:id`

Elimina un gasto por su `id`.

**Path params**
| Param | Tipo   | Descripción            |
| ----- | ------ | ---------------------- |
| `id`  | number | Id del gasto (entero). |

**Respuesta 204** — sin cuerpo.

**Errores**
| Código HTTP | Cuándo                                      |
| ----------- | ------------------------------------------- |
| 400         | `id` no es un entero.                       |
| 404         | No existe un gasto con ese `id`.            |

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

### Modelo `MovimientoParseado`

Refleja las columnas reales del extracto de Bankinter: `Fecha contable | Fecha
valor | Descripción | Importe | Saldo | Divisa`.

| Campo           | Tipo                      | Descripción                                                  |
| --------------- | ------------------------- | ----------------------------------------------------------- |
| `fechaContable` | string (ISO `YYYY-MM-DD`) | Fecha contable.                                             |
| `fechaValor`    | string (ISO `YYYY-MM-DD`) | Fecha valor.                                                |
| `descripcion`   | string                    | Descripción del movimiento.                                 |
| `importe`       | number                    | Importe con signo, en euros (negativo = salida).            |
| `saldo`         | number                    | Saldo tras el movimiento, en euros.                         |
| `divisa`        | string                    | Divisa del movimiento (p. ej. `"EUR"`); `""` si no aparece. |
| `tipo`          | `"ingreso"` \| `"gasto"`  | Derivado del signo del importe.                             |

> El resultado completo de un archivo tiene la forma `{ banco: "bankinter",
> cuentaIban, movimientos: MovimientoParseado[], noReconocidas: { fila, motivo }[] }`
> y es lo que se escribe en el JSON local. `importe` y `saldo` se interpretan tanto
> desde el número nativo del Excel como desde texto español (coma decimal / punto
> de miles, `1.234,56` → `1234.56`). **No** se deduplica: dos filas idénticas
> aparecen las dos. Una fila no interpretable (fecha, importe o saldo ilegibles) va
> a `noReconocidas` (con su nº de fila y el motivo), sin perderse.

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
      "cuentaIban": "ES9820385778983000760236",
      "movimientos": 42,
      "noReconocidas": 1,
      "dumpPath": "bankinter/2026/movs.xlsx.json"
    }
  ],
  "failed": []
}
```

- `movimientos` / `noReconocidas`: número de movimientos parseados y de filas no
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
