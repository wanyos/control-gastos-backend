# Archivos de producto de MyInvestor — referencia del formato

> **Qué es esto:** la **fuente de verdad del formato** de los archivos `.json` que
> escribes a mano, uno por producto de inversión, y dejas en la carpeta de MyInvestor
> de Drive. Lo lee el parser de la feature 13 (`src/modules/myinvestor/`), sin base de
> datos y sin mover nada en Drive.
>
> ⚠️ **Este documento NO es la plantilla que copias cada mes.** Tu plantilla vive en
> **Drive, en una carpeta HERMANA de `notas-banco/`** (nunca dentro: todo lo que cuelga
> de `notas-banco/` se toma por un banco). Esa copia la creas y la mantienes tú; **nadie
> comprueba que las dos coincidan**. Cuando el formato cambie, se cambia **aquí** y tú
> actualizas la de Drive.
>
> Decisiones que lo fijan: `specs/myinvestor-products/decisions.md` y
> `docs/architecture.md` §ADR-016.

## Las dos reglas de escritura

### 1. Los números van como número JSON, sin comillas

```json
"marketValue": 947.25         ✅   "gainPercent": -3.47          ✅
"principal": 25000            ✅   "uninvestedCash": 12.05       ✅
"marketValue": "947.25"       ❌   "marketValue": "3.210,40"     ❌
"marketValue": "3.210,40 €"   ❌   "marketValue": 25.000         ❌ (JSON roto)
```

- **Punto decimal**, nunca coma. **Sin separador de miles**: `25000`.
- **Sin símbolos**: ni `€` ni `%`. La unidad la da el campo.
- **El signo va dentro del número**: `-3.47`.
- **Un número escrito como texto es un fallo del archivo**, con su motivo, y **no se
  interpreta jamás** — ni siquiera cuando el texto sería inequívoco (`"947.25"`).
  Aceptar las dos formas convertiría un formato en dos.

### 2. Las fechas van siempre en `AAAA-MM-DD`

```json
"date": "2026-08-31"          ✅
"maturityDate": "2027-04-15"  ✅   (la web lo enseña como dd/mm/aa)
"maturityDate": "15/04/27"    ❌   "maturityDate": "15/04/2027"  ❌
```

Un año de dos cifras tiene tres lecturas posibles y el parser **no adivina**: una fecha
en otro formato se rechaza diciendo el formato esperado. Aplica a `date`, `maturityDate`
y `closedAt`.

### Y una tercera que no es de formato: las claves

- **Una clave que no está en la plantilla es un error**, y se te dice por su nombre. Es
  lo único que atrapa una errata silenciosa: `uninvestedcash` en minúscula perdería el
  efectivo sin decir nada, porque es un campo opcional.
- **Las claves que empiezan por `_` se ignoran**: son tus notas y el hueco de escape
  (`"_nota": "traspaso pendiente"`).
- **El banco NO se escribe** en el archivo: sale de la carpeta. Si lo escribes, se
  rechaza como clave desconocida.

---

## Plantilla A — `fund`, `etf` y `managed_portfolio`

Los tres tipos llevan **exactamente los mismos campos**.

```json
{
  "type": "fund",
  "name": "Fondo Indexado Global",
  "date": "2026-08-31",
  "invested": 800,
  "marketValue": 947.25,
  "gain": 147.25,
  "gainPercent": 18.41,
  "uninvestedCash": null,
  "closedAt": null
}
```

La cartera automatizada es la que suele traer efectivo sin invertir:

```json
{
  "type": "managed_portfolio",
  "name": "Cartera Automatizada",
  "date": "2026-08-31",
  "invested": 3000,
  "marketValue": 3210.4,
  "gain": 210.4,
  "gainPercent": 7.01,
  "uninvestedCash": 12.05,
  "closedAt": null
}
```

**Cadencia:** un archivo **por producto y por mes**. Lo que tecleas cada vez son
**5 cosas** (la fecha y 4 números), o **6** en la cartera. El resto se copia.

## Plantilla B — `deposit`

```json
{
  "type": "deposit",
  "name": "Depósito a 3 meses",
  "date": "2026-08-31",
  "principal": 1200,
  "interestRate": 1.5,
  "expectedGain": 4.5,
  "maturityDate": "2027-04-15",
  "closedAt": null
}
```

**Cadencia:** el archivo del depósito se escribe **dos veces en toda su vida** — al
contratarlo y al vencer —, no todos los meses: sus condiciones no cambian. El segundo
es el que lleva `closedAt`. Su `date` significa **«el día que escribí esto»**, no una
foto mensual.

---

## Tabla de campos y de dónde sale cada uno

Leyenda del origen: **MODELO** = es una columna del modelo de inversiones (feature 9) ·
**MUESTRA** = está en las capturas reales del banco · **HUMANO (2026-08-11)** = no salía
de ninguno de los dos y lo cerró el humano ese día.

| Campo | A: fund / etf / managed_portfolio | B: deposit | Origen |
| --- | --- | --- | --- |
| `type` | obligatorio | obligatorio | **MODELO** — `fund` \| `etf` \| `managed_portfolio` \| `deposit` |
| `name` | obligatorio | obligatorio | **MODELO** + **MUESTRA** (parcial) — es la **identidad** del producto: cambiarlo crea otro |
| `date` | obligatorio | obligatorio | **MODELO** (A: la fecha de la foto) / **HUMANO (2026-08-11)** (B: el día de la nota) |
| `currency` | opcional (def. `EUR`) | opcional (def. `EUR`) | **MODELO** — decidido: no se escribe nunca |
| `invested` | obligatorio | ✗ no admitido | **MODELO** + **MUESTRA** |
| `marketValue` | obligatorio | ✗ | **MODELO** + **MUESTRA** |
| `gain` | obligatorio | ✗ | **MODELO** + **MUESTRA** — con signo |
| `gainPercent` | obligatorio | ✗ | **MODELO** + **MUESTRA** — porcentaje con signo |
| `uninvestedCash` | **opcional** | ✗ | **MODELO** + **MUESTRA** — va **aparte**, nunca sumado |
| `principal` | ✗ | obligatorio | **MODELO** + **MUESTRA** |
| `interestRate` | ✗ | obligatorio | **MODELO** + **MUESTRA** (parcial) — solo la TAE que **se aplica** |
| `expectedGain` | ✗ | obligatorio | **MODELO** + **MUESTRA** (parcial) — los intereses de esa TAE |
| `maturityDate` | ✗ | obligatorio | **MODELO** + **MUESTRA** |
| `closedAt` | opcional | opcional | **MODELO** (la columna) + **HUMANO (2026-08-11)** como campo del archivo |
| `_lo_que_sea` | opcional | opcional | **HUMANO (2026-08-11)** — tus notas, se ignoran |

**Campos deliberadamente fuera:** el banco (sale de la carpeta), `openedAt` (se queda
vacía; la fecha real de contratación está en el extracto), la **segunda TAE** del
depósito y `units` / `unitPrice` / `isin` (descartados en la feature 9).

### Los porcentajes van en porcentaje, nunca en fracción

`"gainPercent": 7.01` es 7,01 % y `"interestRate": 1.5` es una TAE del 1,5 %. Es la misma
semántica que el modelo de datos (`Decimal(6,4)`, `2.7500` = 2,75 %). Escribir `0.03`
guardaría un depósito al 0,03 % y **nadie lo notaría** hasta calcular intereses.

### Una sola TAE por depósito

La web muestra dos (con Premium y sin Premium) con sus dos intereses brutos. **Se
escribe solo la que se aplica.** La otra describe un producto que no tienes; si la
escribes con cualquier nombre, cae en clave desconocida y te enteras.

### El efectivo sin invertir va aparte

`uninvestedCash` **nunca** se suma a `marketValue` ni a ningún total: es el remanente de
la aportación mensual que todavía no se ha invertido. El patrimonio de un producto es
`marketValue + uninvestedCash`, y esa suma la hace quien consulta, no el parser.

### `closedAt`: cómo se dice que un producto ya no está

- Se escribe **una sola vez**, en la última aparición del producto (el mes en que vence
  el depósito o reembolsas el fondo).
- 🔴 **Dejar de escribir un producto NO lo cierra.** Un mes con prisa en el que te dejas
  un fondo no cierra nada: el parser no tiene memoria, no compara con el mes pasado y no
  emite «productos desaparecidos».
- Un producto cerrado puede seguir apareciendo en meses posteriores con su `closedAt`
  puesto: es idempotente y evita tener que acordarse de borrarlo.

---

## Cómo se llama el archivo

**El nombre del archivo no se valida nunca**: el producto y la fecha salen **de dentro**,
y el nombre solo se usa para reportar y como procedencia.

**Convención recomendada (no obligatoria):** `<producto>-<AAAA-MM-DD>.json`, p. ej.
`fondo-indexado-global-2026-08-31.json`. Ordena cronológicamente sola y evita un límite
real: la ingesta **sobrescribe la copia local** si dos archivos del mismo
`<banco>/<año>/` se llaman igual, así que subiendo `fondo.json` todos los meses cada
descarga pisaría la anterior.

**Si dos archivos declaran el mismo `name` y la misma `date`** (el caso típico:
`fondo.json` y `fondo (1).json`, que Drive crea al subir dos veces), se conserva el
**primero por orden alfabético** y el otro se reporta diciendo con cuál choca. El mismo
producto con **otra** fecha es lo normal y no choca nunca.

## Qué pasa cuando un archivo está mal

Un archivo roto **no tumba a los demás**: se reporta en `failed[]` con su nombre y su
motivo, y el resto se parsea igual. Y **un archivo roto reporta todos sus problemas de
golpe**, no el primero, para que arreglarlo sea un solo viaje.

| Qué pasa | Qué dice el motivo |
| --- | --- |
| El `.json` no es válido | el problema de sintaxis |
| Falta un campo obligatorio | **todos** los que faltan, por su nombre |
| Un número no es un número (`true`, `[]`, `{}`) | el campo y el valor recibido |
| Un número viene **como texto** | el campo, el valor y *«se espera un número sin comillas»* |
| El `type` no es uno de los cuatro | el valor recibido y **los cuatro admitidos** |
| Una fecha en otro formato | el campo y `AAAA-MM-DD` |
| Una clave desconocida (o de otro tipo de producto) | las claves sobrantes, por su nombre |
| Dos archivos con el mismo producto y fecha | con qué archivo choca |

## Dónde acaba lo que escribes

```
Drive: notas-banco/MyInvestor/<año>/<producto>.json
   │  (ingesta)
   ▼
var/drive-read/myinvestor/<año>/<producto>.json     ← el origen, gitignoreado
   │  POST /api/parser/myinvestor
   ▼
var/parsed/myinvestor/<año>/products.json           ← UN archivo por año, gitignoreado
```

El volcado **no es una copia** del origen: es lo que el sistema **ha entendido** —la
estructura interpretada (`valuation` y `depositTerms` separados, más el banco y el
archivo de procedencia), las fechas ya validadas, todos los productos del año juntos y
la lista de lo que salió mal—. Revisarlo es la forma de comprobar que lo que escribiste
y lo que el sistema entendió son lo mismo.
