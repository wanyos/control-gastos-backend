# Los campos de cada producto — CERRADOS el 2026-08-11

> ✅ **Aquí no se te pide nada.** Es el registro de lo que quedó decidido: qué campo lleva
> cada tipo de producto, de dónde sale y **qué tendrás que teclear**. Se conserva porque
> es lo único que responde de un vistazo *"¿cuánto trabajo me da esto cada mes?"*.
>
> Las tres casillas que quedaban abiertas las cerraste el **2026-08-11** y están al final,
> en «Lo que decidiste». **La F13 no tiene ya nada pendiente de tu visto bueno.**
>
> **Origen de cada campo:**
> **MODELO** = ya existe como columna en el modelo de datos que aprobaste (F9) ·
> **MUESTRA** = está en las capturas reales que enviaste ·
> **TÚ (2026-08-11)** = no salía de ninguno de los dos y lo cerraste tú ese día.
>
> Los números van **sin comillas y sin símbolos** (`8440.60`, `-3.47`, `31000`) y las
> fechas siempre `AAAA-MM-DD`.
>
> 🔒 **Todas las cifras, nombres de producto y fechas de este documento son INVENTADOS a
> propósito** (`docs/conventions.md` §Tests: ningún dato real, ni siquiera del dueño del
> proyecto, en un archivo versionado). Ilustran **la forma** —cuántos decimales, qué
> signo, qué formato de fecha—, nunca un saldo verdadero. **No los "corrijas" con los
> valores de tus capturas:** esas viven solo en `var/drive-read/`, que está gitignoreada.

---

## Tipo A — fondo, ETF y cartera automatizada (los tres, idénticos) — 10 campos

| Campo | Qué es | ¿Obligatorio? | Origen | ¿Cuándo lo escribes? |
|---|---|---|---|---|
| `type` | Cuál de los tres es: `fund`, `etf` o `managed_portfolio` | Obligatorio | **MODELO** | Se copia de la plantilla y no cambia nunca |
| `name` | El nombre con el que tú reconoces el producto. Es su identidad: si lo cambias, para el sistema es otro producto | Obligatorio | **MODELO** (+ muestra parcial: en tus capturas de fondo y cartera **no aparece nombre**, lo pones tú) | Se copia y no cambia |
| `date` | El día de la **foto**: cuándo miraste la web | Obligatorio | **MODELO** (`Valuation.date`) | **Cada mes** — 1 fecha |
| `currency` | La moneda. Si no la escribes, se asume `EUR` | Opcional | **MODELO** | **Nunca** (decidido: no lo escribes) |
| `invested` | Lo que has metido en el producto | Obligatorio | **MODELO** + **MUESTRA** (ej. inventado: `Invertido 8.000,00 €`) | **Cada mes** — 1 número |
| `marketValue` | Lo que vale hoy | Obligatorio | **MODELO** + **MUESTRA** (ej. inventado: `Valor de mercado 8.440,60 €`) | **Cada mes** — 1 número |
| `gain` | Lo que ganas o pierdes, en euros. Con signo | Obligatorio | **MODELO** + **MUESTRA** (ej. inventado: `440,60 €`) | **Cada mes** — 1 número |
| `gainPercent` | Lo mismo en porcentaje (`5.51` = 5,51 %). Con signo | Obligatorio | **MODELO** + **MUESTRA** (ej. inventado: `5,51 %`) | **Cada mes** — 1 número |
| `uninvestedCash` | El efectivo que está ahí sin invertir. **Va aparte, nunca sumado al valor de mercado** | Opcional | **MODELO** + **MUESTRA** (ej. inventado: `Efectivo 900,00 €`; **solo** en la cartera) | **Cada mes en la cartera** (1 número); en fondo y ETF no lo escribes |
| `closedAt` | El día que reembolsaste el producto | Opcional | **MODELO** (la columna) + **TÚ (2026-08-11)** como campo del archivo | **Una sola vez**, el último mes del producto |

**Lo que tecleas cada mes en un fondo o un ETF: 5 cosas** (la fecha y 4 números).
**En la cartera automatizada: 6** (la fecha y 5 números). El resto se copia de la
plantilla y no se toca.

---

## Tipo B — depósito — 9 campos

> 📌 **El archivo del depósito NO se escribe todos los meses** (decidido el 2026-08-11):
> solo **al contratarlo** y **cuando vence**. Sus condiciones no cambian, así que no hay
> nada que refrescar.

| Campo | Qué es | ¿Obligatorio? | Origen | ¿Cuándo lo escribes? |
|---|---|---|---|---|
| `type` | `deposit` | Obligatorio | **MODELO** | Al contratar |
| `name` | El nombre del depósito (ej. inventado: `Depósito DEMO 6 meses`) | Obligatorio | **MODELO** + **MUESTRA** | Al contratar |
| `date` | **"El día que escribí esto"**, no una foto mensual | Obligatorio | **TÚ (2026-08-11)** — un depósito no tiene fotos; esta fecha sirve para saber cuándo transcribiste las condiciones y para detectar que has escrito dos veces lo mismo | Al contratar y al vencer |
| `currency` | La moneda, `EUR` por defecto | Opcional | **MODELO** | **Nunca** (decidido: no lo escribes) |
| `principal` | El dinero que metiste | Obligatorio | **MODELO** + **MUESTRA** (ej. inventado: `Importe total 30.000,00 €`) | Al contratar |
| `interestRate` | La TAE **que se te aplica** (ej. inventado: `4` = 4 %). La otra TAE de la web (la que no se te aplica) **no se guarda** | Obligatorio | **MODELO** + **MUESTRA** (parcial: la muestra trae **dos**) | Al contratar |
| `expectedGain` | Los intereses brutos que vas a cobrar al vencimiento | Obligatorio | **MODELO** + **MUESTRA** (ej. inventado: `250,00 €`, el de la TAE aplicada) | Al contratar |
| `maturityDate` | El día que vence | Obligatorio | **MODELO** + **MUESTRA** (ej. inventado: `04/07/27` → se escribe `2027-07-04`) | Al contratar |
| `closedAt` | El día que venció de verdad | Opcional | **MODELO** (la columna) + **TÚ (2026-08-11)** como campo del archivo | **Una sola vez**, en el archivo del vencimiento |

**Lo que tecleas al mes en un depósito: nada.** Escribes su archivo **dos veces en toda
su vida**: al contratarlo (8 campos) y al vencer (el mismo archivo con `date` nuevo y
`closedAt`).

---

## Lo que decidiste el 2026-08-11 (las tres que quedaban)

| # | Decisión | Consecuencia |
|---|---|---|
| 1 | **`closedAt` SÍ es campo del archivo**, en los dos tipos: lo escribes tú, **una sola vez**, el último mes del producto | La columna `InvestmentProduct.closedAt` de la F9 **ya tiene escritor**. Sigue en pie que **dejar de escribir un producto NO lo cierra** |
| 2 | **`currency` se queda como campo opcional** que no vas a escribir nunca; se asume `EUR` | Ninguna: el spec ya lo decía así |
| 3 | **El archivo del depósito se escribe solo al contratar y al vencer**, no cada mes | Ninguna en el código; `date` en el depósito significa **"el día que escribí esto"** |

**Todo lo demás no requería decisión tuya:** sale del modelo que ya aprobaste o de tus
propias capturas.

**Campos que quedaron deliberadamente FUERA** (por si echas alguno en falta): el banco
(sale de la carpeta), la fecha de contratación `openedAt` (ya decidiste que se queda
vacía, y además está en el extracto), la **segunda TAE** del depósito (información
comercial de un producto que no tienes), y `units` / `unitPrice` / `isin` (los
descartaste en la F9).
