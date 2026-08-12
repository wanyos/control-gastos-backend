# Sesión actual

> Este archivo se vacía al cerrar cada sesión y se mueve a `history.md`.
> Mientras trabajas, **mantenlo actualizado en tiempo real**, no al final.

- **Tarea en curso:** **F13 `myinvestor-products`** — parser de los JSON de producto
  de inversión de MyInvestor. Spec cerrado desde el 2026-08-11, **cero puntos rojos**.
- **Inicio:** 2026-08-12
- **Agente:** leader + implementer + reviewer

## Punto de partida

La sesión anterior cerró la **F12 `import`** y está commiteada y subida junto con la
reforma del harness del humano. El árbol quedó limpio. Etapas **E2 y E5 ✅**, cabos
sueltos **nº 1 y nº 4** cerrados.

**La F13 es la última feature abierta del proyecto.** Es solo parser y volcado: **no
toca base de datos** — guardar los productos tiene la regla de duplicado contraria
(recargar sobrescribe) y por eso quedó fuera de la F12.

## Decisiones que ya venían cerradas (2026-08-11)

- 🔄 **Los números van como número JSON puro** (`1312.72`), no como texto en formato
  español. **Efecto de arrastre:** la F13 **NO** consume `parseAmountText`, que su spec
  original daba por consumida; a cambio aparece un error nuevo (que el valor llegue como
  texto). Las fechas siguen en `AAAA-MM-DD`.
- `date` obligatorio **también** en el depósito · choque producto+fecha se queda con el
  **primero alfabético** y reporta el otro · **clave desconocida = error**, salvo las que
  empiezan por `_` · volcado a **un `products.json` por año**.
- **`closedAt` es campo del archivo** en los dos tipos, escrito una sola vez.
  **`currency` opcional**, se asume `EUR`.
- **La plantilla vive en una carpeta hermana de `notas-banco/`**, invisible para el
  backend. Es deber del humano.

## Nota sobre la feature 9 (T17 de `tasks.md`)

- ✅ **El esquema de inversiones de la F9 NO cambia** a raíz de los formatos de la F13:
  ni una columna, ni un tipo, ni un índice, ni una precisión decimal. Los formatos
  **confirman** sus dos suposiciones abiertas: el efectivo va **aparte** del valor de
  mercado (patrimonio = `marketValue + uninvestedCash`) y el depósito guarda **una sola**
  TAE, la que se aplica. Además, su columna `closedAt` —reservada y sin escritor— **ya
  tiene quien la escriba**: el campo `closedAt` del archivo de producto.
- ⚠️ **Cabo suelto de documentación (no de código):** donde el spec de la F9
  (`specs/investments-data-model/`) enlaza a la antigua `specs/myinvestor-parser/`, hoy
  hay **dos** carpetas: `specs/myinvestor-statement/` y `specs/myinvestor-products/`. Es
  una corrección de enlaces; **no se ha tocado** `specs/investments-data-model/` desde
  esta feature (regla dura de `tasks.md`).

## Bitácora

- ▶️ **F13 a `in_progress` y `implementer` lanzado.**
- ✅ **F13 implementada** (parser de producto, encaminamiento por extensión, volcado
  `products.json` por año, docs y ADR-016). Informe en
  `progress/implementations/myinvestor-products.md`. Pendiente de `reviewer`.
