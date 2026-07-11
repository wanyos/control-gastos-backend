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

## Endpoints de operación (no de dominio)

Para monitorización; el frontend no los consume.

| Método | Ruta          | Descripción                              |
| ------ | ------------- | ---------------------------------------- |
| `GET`  | `/health`     | Liveness (el proceso responde).          |
| `GET`  | `/health/db`  | Readiness (la base de datos responde).   |
