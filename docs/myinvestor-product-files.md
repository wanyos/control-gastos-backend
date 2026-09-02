# Archivos de producto de MyInvestor — referencia del formato

> **Qué es esto:** la **fuente de verdad del formato** de los archivos `.json` que
> escribes a mano, uno por producto de inversión, y dejas en la carpeta de MyInvestor
> de Drive. Lo lee el parser de la feature 13 (`src/modules/myinvestor/`).
>
> 🔄 **Desde la feature 29 (2026-08-21) estos archivos ENTRAN en la base de datos.**
> Antes se leían y se dejaban en un volcado; ahora `POST /api/import` guarda cada
> producto con su tipo y su foto. **No tienes que escribir ni un campo nuevo**: el
> formato de este documento es exactamente el mismo. Lo que cambia es a dónde va.
> Sigue habiendo un camino que solo lee y no guarda nada, `POST /api/parser/myinvestor`
> (ver §Dónde acaba lo que escribes).
>
> ⚠️ **Este documento NO es la plantilla que copias cada mes.** Tu plantilla vive en
> **Drive, en una carpeta HERMANA de `notas-banco/`** (nunca dentro: todo lo que cuelga
> de `notas-banco/` se toma por un banco). Esa copia la creas y la mantienes tú; **nadie
> comprueba que las dos coincidan**. Cuando el formato cambie, se cambia **aquí** y tú
> actualizas la de Drive.
>
> Decisiones que lo fijan: `specs/13-myinvestor-products/decisions.md` y
> `docs/architecture.md` §ADR-016.

## Las dos reglas de escritura

### 1. Los números van como número JSON, sin comillas

```json
"marketValue": 947.25         ✅   "gainPercent": -3.47          ✅
"principal": 31000            ✅   "uninvestedCash": 12.05       ✅
"marketValue": "947.25"       ❌   "marketValue": "3.210,40"     ❌
"marketValue": "3.210,40 €"   ❌   "marketValue": 31.000         ❌ (JSON roto)
```

- **Punto decimal**, nunca coma. **Sin separador de miles**: `31000`.
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
en otro formato se rechaza diciendo el formato esperado. Aplica a `date`, `openedAt`,
`maturityDate` y `closedAt`.

### Y una tercera que no es de formato: las claves

- **Una clave que no está en la plantilla es un error**, y se te dice por su nombre. Es
  lo único que atrapa una errata silenciosa: `uninvestedcash` en minúscula perdería el
  efectivo sin decir nada, porque es un campo opcional.
- **Las claves que empiezan por `_` se ignoran**: son tus notas y el hueco de escape
  (`"_nota": "traspaso pendiente"`).
- **El banco NO se escribe** en el archivo: sale de la carpeta. Si lo escribes, se
  rechaza como clave desconocida.

---

> ### ⚠️ Las plantillas llevan marcadores `<…>` a propósito
>
> Ningún ejemplo de aquí es copiable tal cual: **todos los valores son marcadores**
> del tipo `<nombre del producto>`. Es deliberado. Antes las plantillas traían valores
> de aspecto real y el 2026-08-15 pasó lo previsible: un archivo del ETF de oro se
> subió conservando `"type": "fund"` y `"name": "Mi Fondo de Ejemplo"` del ejemplo.
> **El parser no puede atrapar eso** —los dos valores son legales, solo que falsos—,
> así que el producto entró con el nombre equivocado sin una sola queja, y sobrevivió
> a una revisión humana. Con marcadores, un campo sin editar canta a la vista.
>
> Un `<…>` que llegue sin sustituir **se rechaza siempre, y el motivo te dice el campo**.
>
> 🔄 **Corrección del 2026-08-23 (feature 30).** Aquí ponía que no hacía falta código
> nuevo porque «la propia forma del marcador ya es inválida en los cuatro sitios». Se
> comprobó campo por campo y **era falso en los dos campos de texto libre**: en `type`,
> en las fechas y en los importes sí falla solo, pero un marcador en el **`name`** —y en
> `currency`— es un texto perfectamente válido, así que **entraba en verde**, con el
> marcador como nombre del producto. Y desde la feature 29 el `name` es la identidad del
> producto en la base de datos: el mes siguiente, ya con el nombre bueno, se habría
> creado **otro** producto y la serie quedaría partida en dos. Ahora hay una
> comprobación propia, la misma que Trade Republic tiene desde la feature 20.
>
> **También te avisa del marcador a medio borrar** (`"<nombre del producto"`, sin el `>`
> final): es la errata número uno al rellenar a mano. Cuenta como marcador a medio
> sustituir un valor que **empieza por `<` o acaba en `>`**; el símbolo **en mitad** del
> texto no cuenta, así que un producto llamado `Cartera 3 > 2` entra sin problema. Lo
> que no puedes es **abrir** un nombre con `<` ni **cerrarlo** con `>`.
>
> El parser **no adivina ni repara**: no te quita el símbolo para leer el resto. Rechaza
> el archivo y te dice qué campo mirar.

## Plantilla A — `fund`, `etf` y `managed_portfolio`

Los tres tipos llevan **exactamente los mismos campos**. 🔴 `type` y `name` son los
dos que hay que cambiar **siempre** y los dos que es más fácil dejarse: la plantilla
se copia entera y ellos no cambian de un mes a otro, así que la vista pasa de largo.

```json
{
  "type": "<fund | etf | managed_portfolio>",
  "name": "<nombre del producto, tal y como lo llamas siempre>",
  "date": "<AAAA-MM-DD: la fecha de esta foto>",
  "openedAt": "<AAAA-MM-DD: el día que lo abriste; el mismo todos los meses>",
  "invested": <lo aportado, número sin comillas>,
  "marketValue": <lo que vale hoy>,
  "gain": <la ganancia, con signo>,
  "gainPercent": <el porcentaje, con signo>,
  "uninvestedCash": null,
  "closedAt": null
}
```

La cartera automatizada es la que suele traer efectivo sin invertir:

```json
{
  "type": "managed_portfolio",
  "name": "<nombre de la cartera>",
  "date": "<AAAA-MM-DD>",
  "openedAt": "<AAAA-MM-DD>",
  "invested": <lo aportado>,
  "marketValue": <lo que vale hoy>,
  "gain": <la ganancia, con signo>,
  "gainPercent": <el porcentaje, con signo>,
  "uninvestedCash": <el efectivo aún sin invertir>,
  "closedAt": null
}
```

**Cadencia:** un archivo **por producto y por mes**. Lo que tecleas cada vez son
**5 cosas** (la fecha y 4 números), o **6** en la cartera. El resto se copia, y eso
incluye `openedAt`: es **siempre el mismo valor** en todos los archivos de ese producto.

## Plantilla B — `deposit`

```json
{
  "type": "deposit",
  "name": "<nombre del depósito>",
  "date": "<AAAA-MM-DD: el día que escribes esto>",
  "openedAt": "<AAAA-MM-DD: el día que lo contrataste>",
  "principal": <el capital colocado>,
  "interestRate": <la TAE que se aplica, en porcentaje: 1.5 es 1,5 %>,
  "expectedGain": <los intereses brutos de esa TAE>,
  "maturityDate": "<AAAA-MM-DD: el día que vence>",
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
| `openedAt` | **obligatorio** | **obligatorio** | **MODELO** (la columna, desde la f9) + **HUMANO (2026-08-13)** como campo obligatorio del archivo |
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

**Campos deliberadamente fuera:** el banco (sale de la carpeta), la **segunda TAE** del
depósito y `units` / `unitPrice` / `isin` (descartados en la feature 9).

> **Cambio del 2026-08-13 (feature 15).** `openedAt` estaba en esta lista de campos
> fuera («se queda vacía; la fecha real de contratación está en el extracto») y **ya no
> lo está**: es un campo **obligatorio** del archivo, en los cuatro tipos. La columna
> existía en la base de datos desde la feature 9 sin nadie que la escribiera, y se habría
> quedado `NULL` para siempre. El humano descartó explícitamente la alternativa de
> admitirlo vacío.

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

### `openedAt`: la fecha de apertura, obligatoria en los cuatro tipos

- Es el día en que **abriste o contrataste** el producto, no el de la foto. `date` cambia
  cada mes; `openedAt` **nunca**: se copia igual en todos los archivos de ese producto.
- 🔴 **Si falta, el archivo entero falla** y el motivo lo dice por su nombre
  (`faltan campos obligatorios: openedAt`), junto con el resto de sus problemas. Los demás
  archivos del lote se parsean igual.
- **Escribirlo vacío (`""`) o en otro formato tampoco vale**: se rechaza como cualquier
  otra fecha, diciendo `AAAA-MM-DD`. Y `null` cuenta como ausente.
- No es simétrico con `closedAt` y es a propósito: **todo producto se abrió un día**, solo
  algunos están cerrados.

### `closedAt`: cómo se dice que un producto ya no está

- Se escribe **una sola vez**, en la última aparición del producto (el mes en que vence
  el depósito o reembolsas el fondo).
- 🔴 **Dejar de escribir un producto NO lo cierra.** Un mes con prisa en el que te dejas
  un fondo no cierra nada: el parser no tiene memoria, no compara con el mes pasado y no
  emite «productos desaparecidos».
- Un producto cerrado puede seguir apareciendo en meses posteriores con su `closedAt`
  puesto: es idempotente y evita tener que acordarse de borrarlo.

> **Los depósitos son la excepción, y es correcta (humano, 2026-08-15).** En un depósito
> se escribe `closedAt` **igual a `maturityDate` desde el primer archivo**, aunque el
> depósito siga vivo. No es un despiste: sus depósitos **se cancelan solos el mismo día
> que vencen**, así que la fecha de cierre se conoce el día que se contratan. Un
> `closedAt` en el futuro es, por tanto, un estado válido y **no significa que el dinero
> ya esté liberado**: quien construya vistas de patrimonio debe mirar la fecha, no la
> mera presencia del campo. En los fondos, ETF y carteras no aplica: ahí un `closedAt`
> puesto sí significa que reembolsaste.

---

## Cómo se llama el archivo

**El nombre del archivo no se valida nunca**: el producto y la fecha salen **de dentro**,
y el nombre solo se usa para reportar y como procedencia.

**Convención recomendada (no obligatoria):** `<producto>-<AAAA-MM-DD>.json`, p. ej.
`mi-fondo-2026-08-31.json`. Ordena cronológicamente sola y evita un límite
real: la ingesta **sobrescribe la copia local** si dos archivos del mismo
`<banco>/<año>/` se llaman igual, así que subiendo `fondo.json` todos los meses cada
descarga pisaría la anterior.

> **Ojo con el guardián de datos reales** (`src/no-real-data.test.ts`, F34): esta
> convención lleva **tu** nombre de producto dentro (`<producto>`), así que **no** exime
> nada y los nombres de tus archivos de MyInvestor se siguen comparando enteros, igual
> que antes. Es lo correcto: ahí dentro hay palabras tuyas. Porqué en el ADR-017.

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
| Un campo se quedó con el marcador `<…>` de la plantilla | *«campos sin sustituir, siguen con el marcador …»* y **cuáles** |
| Un campo se quedó con **medio** marcador (`"<nombre del producto"`) | *«A MEDIO SUSTITUIR, te dejaste un símbolo suelto»*, el campo y el valor recibido |
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

### Y desde la feature 29, en la base de datos

```
Drive: notas-banco/MyInvestor/<año>/<producto>.json
   │  POST /api/import
   ▼
InvestmentProduct  (uno por producto, identificado por su "name")
   └── Valuation   (una fila por "date")   ← fondo, ETF y cartera gestionada
```

- **Tu depósito no tiene filas de valoración**, y es a propósito: un depósito no
  fluctúa. Sus cuatro condiciones (`principal`, `interestRate`, `expectedGain`,
  `maturityDate`) se guardan **en el producto**, y volver a subirlo las reescribe.
- **El `name` es la identidad del producto.** Si lo cambias en el archivo se crea
  **otro** producto y la serie anterior se queda colgando del nombre viejo. Escríbelo
  igual todos los meses. Y si reutilizas un `name` que ya existe **con otro tipo**, el
  archivo se **rechaza** en vez de convertirte el producto en silencio.
- **Subir el mismo mes dos veces no duplica nada**: la fecha del archivo es la
  identidad de la foto y se sobrescribe. El mes siguiente añade una fila más.
- **O entra entero o no entra:** un archivo con una errata no deja medio producto
  detrás, no se guarda nada y **no** se mueve a `procesados/`; lo corriges y lo vuelves
  a subir.
- `POST /api/parser/myinvestor` **sigue sin guardar nada**: es el ensayo, para mirar
  qué ha entendido el sistema antes de que entre.
