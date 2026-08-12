# Design — Feature 13: myinvestor-products

> CÓMO se construye lo descrito en `requirements.md`. No reinventa decisiones: se apoya
> en `docs/architecture.md` (Principios 1-5, **ADR-004** organización por módulos,
> **ADR-008** Drive como registro de bancos, **ADR-009** copias locales gitignoreadas y
> aislamiento del fallo por archivo, **ADR-010** parser puro + volcado JSON local,
> **ADR-012** modelo de inversiones) y en `docs/conventions.md` (**§Parsers de banco**:
> un parser por banco, **varias entradas dentro del mismo banco**).
>
> **Viene del corte de la antigua F10 `myinvestor-parser`** (2026-08-11). La numeración
> de secciones se conserva (§5 a §12) para que las referencias ya escritas sigan
> valiendo; §2, §3 y §4 viven en
> [`../myinvestor-statement/design.md`](../myinvestor-statement/design.md).
>
> 📄 **Premisa que lo condiciona todo:** estos archivos **los escribe el humano a mano**,
> así que su formato **se puede diseñar**. Esa es la diferencia con el extracto (F10),
> donde hay que aceptar lo que el banco exporta: aquí se impone un formato único y
> estricto porque se puede elegir.
>
> Las decisiones delegadas se marcan **⭐ DECISIÓN PROPIA (aprobar en la puerta)**.
>
> ✅ **Actualizado el 2026-08-11 con las decisiones del humano** (diff en
> [`../myinvestor-statement/CHANGELOG-respec.md`](../myinvestor-statement/CHANGELOG-respec.md)):
> los números de los archivos de producto van como **número JSON nativo** (§6.1, cambia
> respecto a lo que se propuso) y las otras cuatro decisiones 🔴 quedan aprobadas tal
> cual. ✅ **La lista de campos de §7 quedó CERRADA ese mismo día** (registro para el
> humano en [`CAMPOS-cerrados.md`](CAMPOS-cerrados.md)): **no queda nada pendiente de su
> visto bueno.**
>
> 🔒 **Todas las cifras, nombres de producto y fechas de los ejemplos de este documento
> (§6, §7, §8, §12) son INVENTADOS a propósito.** Lo exige `docs/conventions.md` §Tests:
> ningún dato real —incluidos los del dueño del proyecto— en un archivo versionado. Los
> ejemplos ilustran **la forma** (decimales, signo, formato de fecha, relación aritmética
> entre campos), nunca un saldo verdadero. **No los sustituyas por los valores de las
> capturas reales:** esas viven solo en `var/drive-read/`, que está gitignoreada.

## 1. Estado de partida → estado final

**La F10 `myinvestor-statement` se implementa antes y deja construido** el módulo
`src/modules/myinvestor/` con su formato compartido, su servicio, su ruta y el parser
del extracto. Esta feature **no construye ninguna de esas piezas**: añade archivos
dentro y extiende dos funciones existentes.

**Archivos que se crean:**

```
src/modules/myinvestor/
  myinvestor.product.parser.ts            # parser puro de un JSON de producto (§7, §9)
  myinvestor.product.parser.test.ts
docs/myinvestor-product-files.md          # REFERENCIA del formato en el repo (R60);
                                          # la copia que el humano usa vive en Drive
progress/implementations/myinvestor-products.md   # mapa de trazabilidad (R75)
```

**Archivos que se modifican (todos creados por la F10):**

| Archivo | Qué se le añade | Qué NO se toca |
| --- | --- | --- |
| `myinvestor.format.ts` | `parseIsoDate` (`AAAA-MM-DD` estricto) | `parseAmountText` y `parseStatementDate`: **no se tocan y aquí ya no se usan** — son del `.csv` del extracto (R26) |
| `myinvestor.types.ts` | `ParsedProduct`, `ParsedValuation`, `ParsedDepositTerms`, `MyinvestorProductsResult` y el resumen de producto | el alias del contrato del extracto |
| `myinvestor.service.ts` | la rama `.json` → parser de productos (R76), el choque `(name, date)` (R46) y el volcado `products.json` (R53) | el recorrido de carpetas, `failed[]`/`ignored[]`, el aislamiento y el volcado del extracto |
| `myinvestor.service.test.ts` | los casos de productos | los casos del extracto |
| `myinvestor.fixture.ts` | generador **sintético** de JSON de producto | el generador del CSV |
| `myinvestor.routes.test.ts` | un caso con productos en el tempdir | el resto |
| `src/architecture.test.ts` | los archivos nuevos al árbol (R73) | los guardianes que ya existen, que deben seguir verdes |
| `docs/api-contract.md` | el modelo del resultado de productos (R71) | la sección del extracto |
| `docs/architecture.md` | el ADR de §11 (R72) | el ADR-013 (contrato F11) y el ADR-014 (extracto) |

**`myinvestor.routes.ts` NO se modifica.** El disparo es el mismo
`POST /api/parser/myinvestor`; lo único que cambia es que su resultado lleva ya
productos, porque el servicio los produce.

**Lo que NO se toca (regla dura):** `prisma/schema.prisma` y `prisma/migrations/`, los
módulos del flujo, el módulo de ingesta, `src/lib/**`, `src/plugins/**`,
`src/errors/app-error.ts`, **el módulo de parser de otro banco** y `package.json`.
`.gitignore` no cambia. **Sin dependencias nuevas y sin variables de entorno nuevas**
(`JSON.parse` es nativo) → `docs/stack.md` no cambia.

## 5. ⭐ DECISIÓN PROPIA — Qué archivo es qué, de qué producto y de qué fecha (R21-R24, R76)

Tres preguntas distintas, tres respuestas distintas, cada una resuelta donde el dato es
más estable.

### 5.1 Extracto o producto → **por la extensión** (R76)

`.csv` → parser del extracto (F10). `.json` → parser de producto. Cualquier otra
extensión → `ignored[]` (R49, ya construido por la F10).

⚠️ **Detalle del corte:** mientras esta feature no exista, la F10 manda los `.json` a
`ignored[]`, porque no hay nadie que los lea. Esta feature **cambia esa rama**; el
`ignored[]` sigue existiendo para el resto de extensiones.

- **Por qué:** es la única señal que existe **antes** de abrir el archivo, no obliga al
  humano a nombrar nada de una forma concreta, y es imposible equivocarse al aplicarla.
- **Alternativa descartada — mirar el contenido:** funciona, pero obliga a leer y a
  adivinar antes de decidir, y convierte un archivo corrupto en "no sé ni qué querías
  que fuera esto". Con la extensión, un `.json` roto se reporta como *"producto con JSON
  inválido"*, que es un mensaje accionable.
- **Alternativa descartada — subcarpetas en Drive** (`extracto/`, `productos/`):
  cambiaría la estructura que las features 4 y 5 fijaron y obligaría a tocar la ingesta.
  Coste desproporcionado para distinguir dos extensiones.

### 5.2 De qué banco → **de la carpeta**

`var/drive-read/<banco>/<año>/`. Ya lo resuelve la F10 (R25) y aquí solo se consume:
ningún JSON de producto lleva ni debe llevar un campo `bank` (si se escribe, cae en
clave desconocida, §9).

### 5.3 De qué producto y de qué fecha → **de dentro del archivo** (R23, R24)

Cada JSON lleva su `name` y su `date`. **El nombre del archivo es libre** y solo se usa
para reportar errores y para el campo `file` de procedencia.

- **Por qué dentro y no en el nombre del archivo:**
  1. `name` es la **clave natural del producto** en la feature 9 (`@@unique([bank,
     name])`). Si viviera en el nombre del archivo, el nombre del archivo y el del
     producto tendrían que ir sincronizados a mano para siempre, y renombrar un archivo
     crearía un producto nuevo en la base de datos.
  2. Un nombre de archivo **no es estable**: Drive renombra en caso de colisión
     (`fondo (1).json`), y un espacio o una tilde de más cambiarían la identidad.
  3. La `date` hay que teclearla de todos modos: es la fecha de la **foto** (el día que
     miraste la web), no la fecha en que subiste el archivo, así que no se puede derivar
     de nada automático.
- **Convención de nombre RECOMENDADA (no obligatoria, no validada):**
  `<producto>-<AAAA-MM-DD>.json`, p. ej. `fondo-indexado-global-2026-08-31.json`.
  Ordena cronológicamente solo, y sobre todo **evita un límite real ya documentado**: la
  ingesta (ADR-009, "límite conocido: colisión de nombre") **sobrescribe la copia local**
  si dos archivos del mismo `<banco>/<año>/` se llaman igual. Subiendo `fondo.json` todos
  los meses, cada descarga pisaría la anterior. El parser **no exige** esta convención
  —un nombre "mal puesto" no debe impedir ver tus datos— pero la plantilla la recomienda
  en primera línea.

### 5.4 Un archivo por producto, no uno por fecha con todo dentro

Es decisión del humano, no del agente. El diseño solo la aprovecha: un archivo roto
tumba **un producto**, no la foto del mes entero, y el aislamiento del fallo (§9) sale
gratis del servicio que ya construyó la F10.

## 6. ✅ CERRADO POR EL HUMANO — Números y fechas en los JSON escritos a mano (R26-R29, R77)

La pregunta real: la persona que escribe estos archivos está mirando una web que pone
importes como `8.440,60 €`, porcentajes como `5,51 %` y fechas como `04/07/27`. ¿Qué le
pedimos que teclee?

> 🔄 **Cambiado el 2026-08-11.** Esta sección proponía **números como cadena en formato
> español**; el humano decidió lo contrario: **número JSON nativo**. Las fechas **no
> cambian** (§6.2 sigue igual). El razonamiento de la propuesta descartada se conserva
> abajo como alternativa, porque explica el caso de error de R77.

### 6.1 Los números van como **número JSON nativo**

```json
"marketValue": 8440.60        ✅   "gainPercent": -3.47          ✅
"principal": 25000            ✅   "uninvestedCash": 900.00      ✅
"marketValue": "8440.60"      ❌ (texto: rechazado con motivo, R77)
"marketValue": "8.440,60"     ❌ (texto: rechazado con motivo, R77)
"marketValue": "8.440,60 €"   ❌ (texto: rechazado con motivo, R77)
```

Reglas de escritura, que son las de JSON y ninguna más:

- **Punto decimal**, nunca coma. **Sin separador de miles**: `25000`, no `25.000` ni
  `"25.000"`.
- **Sin símbolos**: ni `€` ni `%`. La unidad la da el campo (`currency` para el dinero,
  §6.3 para los porcentajes).
- **El signo va en el número**: `-3.47`.

Tres razones, en orden de peso:

1. **Un número es un número en todas las capas.** No hay interpretación, luego no hay
   nada que interpretar mal: lo que `JSON.parse` devuelve es exactamente lo que va al
   volcado. La ambigüedad `8.440` (¿ocho mil cuatrocientos cuarenta u ocho coma
   cuarenta y cuatro?) **deja de existir en el archivo**, en vez de resolverse con una
   regla heurística.
2. **El parser de productos deja de depender del normalizador del extracto.** Es la
   consecuencia práctica: `parseAmountText` sigue siendo del `.csv` (y **no se toca**,
   la F10 está cerrada), pero **aquí no se importa**. Menos acoplamiento entre las dos
   entradas del banco.
3. **La errata típica es visible al instante.** Escribir `8.440,60` sin comillas rompe
   el JSON y el archivo se reporta como sintaxis inválida; escribirlo con comillas cae
   en R77 con un motivo explícito. Los dos caminos avisan; ninguno adivina.

**Un valor numérico que llega como texto se rechaza (R77), nunca se interpreta**, ni
siquiera cuando el texto es interpretable sin ambigüedad (`"8440.60"`). Interpretarlo
"por si acaso" es lo que convierte un formato estricto en dos formatos, y dos formatos
en una regla que hay que recordar cada mes.

- **Alternativa descartada — números como cadena en formato español** (`"8.440,60 €"`),
  que era la propuesta original: transcribes lo que ves en la web, sin conversión
  mental, y una cadena ilegible estropea **un campo** en vez de romper el archivo
  entero. **Coste que la hunde:** obliga a arrastrar `parseAmountText` a esta feature y
  a mantener viva la regla heurística del punto sin coma para un formato que **se puede
  diseñar**; el humano prefiere teclear el número ya normalizado y que el sistema no
  adivine nada.
- **Alternativa descartada — aceptar los dos (número y cadena):** es la peor de las
  tres. Convierte el formato en "lo que pilles" y garantiza que un día convivan
  `8440.60` y `"8.440,60"` en la misma carpeta.

### 6.2 Las fechas van **siempre** en `AAAA-MM-DD`, aunque en la web se vean de otro modo

```json
"date": "2026-08-31"          ✅
"maturityDate": "2027-07-04"  ✅   (la web pone 04/07/27)
"maturityDate": "04/07/27"    ❌   "maturityDate": "04/07/2027"   ❌
```

- **El año de dos cifras es ambiguo de verdad, no en teoría.** `04/07/27` tiene tres
  lecturas posibles (4 de julio de 2027, 7 de abril de 2027, 27 de julio de
  2004) y ninguna forma de saber cuál. Y la muestra demuestra que **este banco usa dos
  formatos distintos a la vez**: `dd/mm/aaaa` en el extracto y `dd/mm/aa` en la ficha del
  depósito. Aceptar los dos en el archivo escrito a mano sería importar esa ambigüedad
  al único sitio donde no tenemos por qué sufrirla.
- **Un formato, una regla.** El humano ya tiene que recordar el formato de los números;
  darle dos formatos de fecha "porque a veces la web pone uno" multiplica lo que hay que
  recordar sin ganar nada.
- **Ordena solo.** `AAAA-MM-DD` ordena cronológicamente por orden alfabético, que es lo
  que hace útil la convención de nombre de §5.3 y el volcado.
- **Es el formato que el resto del proyecto ya habla:** el parser del extracto emite ISO,
  el contrato de la API expone ISO y Prisma guarda `@db.Date`.
- **Coste real:** teclear 4-5 fechas al mes en otro orden del que las ves. **El parser
  no adivina**: un `04/07/27` se rechaza con un motivo que dice el formato esperado
  (R43), en vez de interpretarlo y acertar el 70 % de las veces.

- **Alternativa descartada — aceptar `dd/mm/aaaa` también en los JSON:** "es lo que ve
  en la web". Pero lo que ve en la web para el vencimiento es `dd/mm/aa`, así que
  habría que aceptar los tres, y con dos cifras hay que inventarse el siglo. Adivinar la
  fecha de vencimiento de un depósito es exactamente el tipo de acierto silencioso que no
  se puede permitir un sistema con dinero dentro.

> **Dónde vive `parseIsoDate`:** en `myinvestor.format.ts`, **el archivo que ya creó la
> F10**, junto a `parseAmountText` y `parseStatementDate`. Lo añade esta feature porque
> es su único consumidor: el extracto lee `dd/mm/aaaa` y no necesita ISO estricto. **No
> se crea un segundo archivo de formato.**

### 6.3 Los porcentajes van en **porcentaje**, nunca en fracción

`"gainPercent": 5.51` es 5,51 %. `"interestRate": 4` es una TAE del 4 %.

Es la misma semántica que la feature 9 fijó para `InvestmentProduct.interestRate`
(`Decimal(6,4)`, `2.7500` = 2,75 %). Las dos capas dicen lo mismo con las mismas
palabras, que es lo único que protege del error clásico de este campo: un depósito al
4 % guardado como `0.04` se leería como 0,04 % y **nadie lo notaría** hasta calcular
intereses.

## 7. ⭐ DECISIÓN PROPIA — Los campos de cada tipo de producto (R33-R39, R60)

✅ **Cerrada por el humano el 2026-08-11** (registro en
[`CAMPOS-cerrados.md`](CAMPOS-cerrados.md)). Todo sale de la muestra real o del esquema
de la feature 9; lo que no salía de ninguno de los dos lo decidió él ese día y se marca
**TÚ (2026-08-11)**.

### 7.1 Plantilla A — `fund`, `etf`, `managed_portfolio` (los tres, idénticos)

```json
{
  "type": "fund",
  "name": "Fondo Indexado Global",
  "date": "2026-08-31",
  "currency": "EUR",
  "invested": 8000,
  "marketValue": 8440.60,
  "gain": 440.60,
  "gainPercent": 5.51,
  "uninvestedCash": null,
  "closedAt": null
}
```

`type` es `"fund"`, `"etf"` o `"managed_portfolio"` — los tres llevan exactamente los
mismos campos, porque así lo pidió el `intent` de la feature 9 ("un fondo, una cartera
automatizada y un ETF son exactamente lo mismo"). En la cartera automatizada,
`uninvestedCash` es el que suele llevar valor:

```json
{
  "type": "managed_portfolio",
  "name": "Cartera Automatizada",
  "date": "2026-08-31",
  "currency": "EUR",
  "invested": 20000.50,
  "marketValue": 24000.60,
  "gain": 4000.10,
  "gainPercent": 20.00,
  "uninvestedCash": 900.00,
  "closedAt": null
}
```

### 7.2 Plantilla B — `deposit`

```json
{
  "type": "deposit",
  "name": "Depósito DEMO 6 meses",
  "date": "2026-08-31",
  "currency": "EUR",
  "principal": 30000,
  "interestRate": 4,
  "expectedGain": 250.00,
  "maturityDate": "2027-07-04",
  "closedAt": null
}
```

### 7.3 ✅ Tabla de origen de cada campo — cerrada por el humano el 2026-08-11

Leyenda: **MODELO** = existe como columna en el esquema de la feature 9. **MUESTRA** =
el dato está en los archivos reales que aportó el humano. **TÚ (2026-08-11)** = no salía
de ninguno de los dos; lo propuso el agente y **lo cerró el humano ese día**.
🔒 **Los valores de ejemplo de la columna «Nota» son inventados** (ver el aviso de
cabecera y `docs/conventions.md` §Tests): lo que dice **MUESTRA** es que *el campo* está
en la captura, no que ese número lo esté.

| Campo | A: fund/etf/portfolio | B: deposit | Origen | Nota |
| --- | --- | --- | --- | --- |
| `type` | obligatorio | obligatorio | **MODELO** | enum `InvestmentProductType` (f9 R2): `fund` \| `etf` \| `managed_portfolio` \| `deposit` |
| `name` | obligatorio | obligatorio | **MODELO** + **MUESTRA** (parcial) | `InvestmentProduct.name`, clave natural (f9 R6). En la muestra del depósito sí sale (ej. inventado: `Depósito DEMO 6 meses`); en las de fondo y cartera **no hay nombre** y lo pone el humano |
| `date` | obligatorio | obligatorio | **MODELO** (A) / **TÚ (2026-08-11)** (B) | En A es `Valuation.date` (f9 R8), la fecha de la foto mensual. En B **no existe en el modelo** (un depósito no tiene fotos) ni en la muestra: es *"el día que escribí esto"*, para detectar el choque de R46 y saber cuándo se transcribieron las condiciones. 📌 **Cadencia cerrada el 2026-08-11: el archivo del depósito se escribe SOLO al contratarlo y al vencer**, no cada mes |
| `currency` | opcional (def. `"EUR"`) | opcional (def. `"EUR"`) | **MODELO** | `InvestmentProduct.currency` con `@default("EUR")`. La muestra solo trae el símbolo `€`. ✅ **Cerrado el 2026-08-11: se queda como opcional y el humano no lo escribirá nunca** |
| `invested` | obligatorio | ✗ no aplica | **MODELO** + **MUESTRA** | `Valuation.invested`; forma (ej. inventado): `Invertido 8.000,00 €` |
| `marketValue` | obligatorio | ✗ | **MODELO** + **MUESTRA** | `Valuation.marketValue`; forma (ej. inventado): `Valor de mercado 8.440,60 €` |
| `gain` | obligatorio | ✗ | **MODELO** + **MUESTRA** | `Valuation.gain`; forma (ej. inventado): `440,60 €`. Con signo |
| `gainPercent` | obligatorio | ✗ | **MODELO** + **MUESTRA** | `Valuation.gainPercent`; forma (ej. inventado): `5,51 %`. En porcentaje, con signo |
| `uninvestedCash` | **opcional** | ✗ | **MODELO** + **MUESTRA** | `Valuation.uninvestedCash`; forma (ej. inventado): `Efectivo 900,00 €`, **solo** en la cartera. Va **aparte**, nunca sumado (§7.5) |
| `principal` | ✗ | obligatorio | **MODELO** + **MUESTRA** | `InvestmentProduct.principal`; forma (ej. inventado): `Importe total 30.000,00 €` |
| `interestRate` | ✗ | obligatorio | **MODELO** + **MUESTRA** (parcial) | `InvestmentProduct.interestRate`; la muestra trae **dos** TAE (ej. inventado: `1 % sin bonificar`, `4 % bonificada`) y se guarda **solo la aplicada** (§7.4) |
| `expectedGain` | ✗ | obligatorio | **MODELO** + **MUESTRA** (parcial) | `InvestmentProduct.expectedGain`; la muestra trae **dos** (ej. inventado: `250,00 €` con la TAE bonificada y `125,00 €` sin ella). Solo el que se aplica |
| `maturityDate` | ✗ | obligatorio | **MODELO** + **MUESTRA** | `InvestmentProduct.maturityDate`; forma (ej. inventado): `04/07/27` → se escribe `2027-07-04` (§6.2) |
| `closedAt` | opcional | opcional | **MODELO** + **TÚ (2026-08-11)** como campo del archivo | La columna existe (f9 R7) pero la feature 9 la dejó **sin escritor**. ✅ **Cerrado el 2026-08-11: el escritor es este campo del archivo, en los dos tipos**, escrito una sola vez (§8) |
| `_cualquier_cosa` | opcional | opcional | **TÚ (2026-08-11)**, con el 🔴 nº 4 | Claves que empiezan por `_`: se ignoran. Es el hueco para dejar notas, ya que las claves desconocidas se rechazan (§9) |

**Campos deliberadamente FUERA del archivo:**

| Fuera | Por qué |
| --- | --- |
| `bank` | Sale de la carpeta (§5.2). Si se escribe, se rechaza como clave desconocida |
| `openedAt` | La feature 9 ya decidió que **se queda `NULL`** porque el formato no lo lleva (su `design.md` §2.3). Se respeta: es una fecha que no cambia y sería un dato más que teclear cada mes. 📌 Dato curioso pero cierto: la fecha real de contratación del depósito **sí está en el extracto** (línea `APERTURA DEP.`), así que si algún día se quiere, saldrá del CSV y no de teclearla |
| La **segunda TAE** y su interés | Decisión del humano: es información comercial, no una condición de su depósito (§7.4) |
| `note` / cualquier campo descriptivo | No existe en el esquema de la feature 9 → se perdería al importar. Un campo que nadie puede guardar es un campo que engaña |
| `units`, `unitPrice`, `isin` | Descartados por el humano en la feature 9 |

### 7.4 Una sola TAE por depósito (R37)

La ficha real muestra dos: una TAE base y otra bonificada, cada una con su interés bruto
(ejemplo inventado: `1 % TAE sin bonificar` / `4 % TAE bonificada`, con `125,00 €` y
`250,00 €`). **Al humano se le aplica la bonificada, así que su depósito se guarda con
esa TAE y ese interés.** El otro par de números describe un producto que él no tiene.

- El archivo lleva **un** `interestRate` y **un** `expectedGain`: los aplicados.
- El modelo de la feature 9 **no cambia**: ya tiene exactamente un `interestRate` y un
  `expectedGain`.
- Si alguien escribe una segunda TAE con cualquier nombre, cae en "clave desconocida"
  (§9) y se entera.
- **Alternativa descartada — guardar las dos y marcar cuál aplica:** obligaría a añadir
  dos columnas al modelo para guardar un dato que solo sirve para responder "¿y si no
  tuviera la bonificación?", que no es ninguna de las preguntas que el humano dijo querer
  responder.

### 7.5 ✅ El efectivo va aparte — confirmado con la web delante

El humano lo cerró literalmente: *"el efectivo queda fuera de cualquier total, eso
siempre se queda como remanente; normalmente hago un ingreso mensual […] y una vez
invertido ese dinero o una cantidad similar se queda como dinero metálico fuera del
resto de cantidades"*.

Y la muestra lo confirma aritméticamente: en la cartera, invertido + ganancia da el
valor de mercado **exactamente**, y el efectivo queda fuera de esa suma. Con los números
inventados de §7.1: `20.000,50 + 4.000,10 = 24.000,60`, y los `900,00 €` de efectivo
**no** están dentro.

Consecuencias:

- El parser emite `marketValue` y `uninvestedCash` como **dos números independientes** y
  **no los suma jamás** (R36).
- **Esto cierra el punto abierto nº 1 de la feature 9** y **confirma su suposición**:
  el patrimonio de un producto es `marketValue + uninvestedCash`. Su esquema no cambia
  (§12).

## 8. ⭐ DECISIÓN PROPIA — Cómo se declara que un producto ya no está (R30, R31)

**Un campo `closedAt` opcional, escrito una sola vez, en la última aparición del
producto** (el mes en que vence el depósito o reembolsas el fondo). ✅ **Cerrado por el
humano el 2026-08-11**: es él quien lo escribe, en los dos tipos, y con eso la columna
`InvestmentProduct.closedAt` de la feature 9 —reservada y sin escritor— **ya tiene quien
la rellene** (el futuro importador, a partir de este campo).

📌 **Cadencia del depósito (cerrada el 2026-08-11):** su archivo **no se escribe cada
mes**, solo **al contratarlo y al vencer**; el segundo es el que lleva `closedAt`. No
cambia nada del parser —que no tiene memoria ni espera ninguna cadencia (R31)— pero es lo
que hay que leer para entender por qué un depósito aparece dos veces en toda su vida y
un fondo, doce veces al año.

```json
{ "type": "deposit", "name": "Depósito DEMO 6 meses", "date": "2027-07-31",
  "_resto": "…", "closedAt": "2027-07-04" }
```

🔴 **Regla dura que se conserva: dejar de escribir un producto NO lo cierra.**

- El parser **no tiene memoria**: ve los archivos que hay en la carpeta y nada más. No
  compara con el mes pasado, no mantiene un censo, no emite "productos desaparecidos".
- Y el importador **tampoco debe inferirlo**. Un mes con prisa en el que te dejas un
  fondo cerraría un producto vivo y el patrimonio se desplomaría sin motivo. Convertir
  una **ausencia** (que puede ser un olvido) en un **hecho** (el producto se acabó) es
  exactamente la inferencia que no debe hacer un sistema con dinero dentro.
- Un producto cerrado **puede seguir apareciendo** en meses posteriores con su `closedAt`
  puesto: no molesta, es idempotente y evita tener que acordarse de borrarlo.

- **Alternativa descartada — `"closed": true`:** pierde **cuándo** se cerró, que es justo
  el dato que la consulta de patrimonio necesita para saber si un depósito estaba vivo a
  una fecha pasada. Es la misma razón por la que la feature 9 descartó un enum `status`.
- **Alternativa descartada — un archivo `cerrados.json` con la lista:** un segundo
  formato que mantener y una segunda fuente de verdad. El cierre es un dato **del
  producto**, y va donde está el producto.

## 9. ⭐ DECISIÓN PROPIA — Reporte de errores de un archivo de producto (R40-R46, R48)

**Principio: un archivo roto no puede tumbar el parseo de los demás, y el reporte tiene
que bastar para arreglarlo sin volver a lanzar.**

### 9.1 Dónde se reporta cada cosa

`failed[]` (`{ bank, year, file, reason }`) e `ignored[]` **ya existen**: los construye
el servicio de la F10 (R47, R49), con el mismo vocabulario que el otro parser del repo.
Esta feature **no inventa listas nuevas**; añade motivos a `failed[]`.

| Caso | Dónde se reporta | Qué dice el motivo |
| --- | --- | --- |
| JSON sintácticamente roto (R45) | `failed` | el archivo y el problema de sintaxis |
| Campo obligatorio ausente (R40) | `failed` | **todos** los campos que faltan, no el primero |
| Valor que no es un número JSON (R41) | `failed` | el **campo** y el **valor recibido** |
| Número escrito como **texto** (R77) | `failed` | el campo, el valor recibido y *"se espera un número sin comillas"*. **Nunca se interpreta** (§6.1) |
| Tipo de producto desconocido (R42) | `failed` | el valor recibido y **los cuatro admitidos** |
| Fecha inválida o en otro formato (R43) | `failed` | el campo y `AAAA-MM-DD` |
| Clave desconocida (R44) | `failed` | las claves sobrantes, con nombre |
| Dos archivos con el mismo producto y fecha (R46) | `failed` (el segundo) | con qué archivo choca |

### 9.2 Las dos reglas propias del reporte

1. **Acumulación (R48).** Dentro de un archivo se recogen **todos** los problemas antes
   de darlo por fallido, y se juntan en un solo `reason`. Sin esto, arreglar un archivo
   con tres erratas son tres viajes.
2. **El choque es del conjunto, no de un archivo (R46).** Detectar que `a.json` y
   `b.json` describen el mismo `(name, date)` exige haberlos leído los dos, así que se
   resuelve **en el servicio**, después de parsear, no en el parser puro. Gana el primero
   por orden alfabético para que el resultado sea determinista (R55 de la F10).
   ✔️ **Sigue teniendo sentido con la cadencia cerrada el 2026-08-11** (el depósito se
   escribe solo dos veces): el caso que atrapa no es "he escrito el producto dos meses
   seguidos" —eso son dos `date` distintas y es lo normal— sino **la copia duplicada**
   (`fondo.json` y `fondo (1).json` que Drive crea al subir dos veces), que es
   exactamente el escenario que documenta ADR-009 y el más probable en los dos tipos.

El **aislamiento por archivo** (R47) no se implementa aquí: el bucle con su `try` ya
existe en el servicio de la F10 y esta rama entra dentro de él.

### 9.3 Por qué no se lanzan errores de dominio

`src/errors/app-error.ts` **no gana ninguna subclase**. Un archivo mal escrito no es una
excepción de la petición: la petición ha ido bien y su respuesta es *"esto he podido
leer y esto no"*. El parser de productos **devuelve** el motivo (`ParsedProduct | {
reason }`), no lanza; el servicio lo convierte en una entrada de `failed[]`.

### 9.4 Qué sale y qué no sale en los motivos

Los motivos citan **el nombre del campo y el valor recibido** (`marketValue: se espera
un número sin comillas, recibido "8.440,60"`), porque sin el valor el mensaje no sirve para
arreglar nada. No se vuelca el archivo entero ni rutas absolutas de la máquina. Todo
esto vive en local y en un volcado gitignoreado.

### 9.5 Validación a mano, sin librería

AJV viene **dentro** de Fastify, pero es la herramienta de la capa HTTP (ADR-003), y
aquí los archivos se leen del disco en el servicio, no llegan por HTTP. Además
necesitamos **acumular todos los problemas de un archivo en un mensaje legible** (R48),
que es justo lo que una validación a medida hace bien y un validador genérico hace
regular. **Cero dependencias nuevas** (R58 de la F10, sigue vigente).

## 10. ⭐ DECISIÓN PROPIA — El volcado de los productos (R53)

```
var/drive-read/myinvestor/<año>/*.json   (copias locales, gitignored)
                    │
   POST /api/parser/myinvestor  (la ruta de la F10, sin tocar)
                    ▼
var/parsed/myinvestor/<año>/products.json   (UN archivo por año, gitignored)
```

### 10.1 🔴 Los productos entran como JSON y salen como JSON: ¿qué aporta el volcado?

Es la objeción evidente y hay que contestarla, porque si el volcado fuera una copia,
sobraría. **No lo es.** El volcado es la **interpretación**, y contiene cuatro cosas que
el archivo de origen no tiene:

| El origen tiene | El volcado tiene |
| --- | --- |
| un objeto plano tal como lo escribiste | la **estructura interpretada**: `valuation` y `depositTerms` separados según el tipo, más `bank` y `file` de procedencia |
| `"maturityDate": "2027-07-04"` (una fecha entre otras) | la fecha **validada**, y el archivo rechazado si no lo era |
| un producto por archivo, sueltos | **todos** los del año juntos, en orden determinista |
| nada sobre lo que salió mal | `failed[]`, `ignored[]` y el choque de duplicados |

Dicho de otro modo: el origen es lo que **escribiste**; el volcado es lo que el sistema
**ha entendido**. Revisar el volcado es exactamente la forma de comprobar que las dos
cosas coinciden — que es lo que el `intent` pide.

### 10.2 Cómo se evita confundirlos

Cuatro barreras, las dos primeras ya existentes:

1. **Directorios distintos y separados en `.gitignore`:** `var/drive-read/` (origen) y
   `var/parsed/` (volcado). Ningún archivo se escribe nunca en el primero.
2. **Nombres que no se pueden confundir:** el volcado de los productos se llama
   `products.json` (plural, un solo archivo por año); tus archivos son de un producto
   cada uno. El del extracto conserva la extensión original en el nombre.
3. **Formas distintas:** tu archivo es un objeto de un producto; el volcado es un objeto
   con `bank`, `year`, `products[]`, `failed[]` e `ignored[]`. Si alguien copiara un
   volcado a la carpeta de origen, el parser lo rechazaría al instante por claves
   desconocidas (§9).
4. **Sentido único:** el servicio **lee** de `var/drive-read/` y **escribe** en
   `var/parsed/`, nunca al revés.

- **Alternativa descartada — un volcado por archivo de producto:** produciría
  `fondo-2026-08-31.json.json`, que es precisamente la confusión que hay que evitar, y
  dejaría el choque de duplicados (R46) sin sitio donde reportarse, porque es un hecho
  del **conjunto** del año, no de un archivo.
- **Alternativa descartada — no volcar los productos** (devolverlos solo en la
  respuesta HTTP): el `intent` pide poder revisarlos en un archivo, y una respuesta HTTP
  se pierde al cerrar la terminal.

## 11. Borrador de ADR (va a `docs/architecture.md` — R72)

> El `implementer` lo redacta al cerrar; aquí queda el esqueleto. 🔴 **Numeración: el
> siguiente libre.** El ADR-013 es el contrato de la F11 y el **ADR-014 es el del
> extracto** (F10 `myinvestor-statement`), así que lo previsible es el **ADR-015**;
> verificar antes de escribir.

### ADR-015: Los archivos de producto de MyInvestor — un JSON por producto, escrito a mano, con formato estricto

- **Fecha:** por poner al implementar.
- **Estado:** propuesta (se acepta al aprobar el spec e implementarse).
- **Contexto:** **primer formato escrito por el humano** en vez de exportado por un
  banco, y segunda entrada del mismo banco (lo que la norma «Parsers de banco» contempla
  explícitamente). El ADR del extracto (ADR-014) ya fijó el módulo, el servicio, la ruta
  y el normalizador de números; aquí se decide **el formato del archivo**.
- **Decisión:**
  1. **Un JSON por producto**, encaminado **por la extensión** (`.json`) dentro del
     servicio que ya existe; el banco sale de la carpeta y el producto y la fecha, del
     contenido.
  2. **Números como número JSON nativo** (`8440.60`), con punto decimal, sin separador
     de miles y sin símbolos; **un valor numérico escrito como texto se rechaza con
     motivo y nunca se interpreta**. En consecuencia, **este parser no usa
     `parseAmountText`**, que queda como pieza exclusiva del extracto.
  3. **Fechas siempre `AAAA-MM-DD`** (`parseIsoDate`, añadido al `myinvestor.format.ts`
     que ya existe); los porcentajes en **porcentaje**, nunca fracción.
  4. **`closedAt` opcional escrito una sola vez**; **dejar de escribir un producto NO lo
     cierra** y el sistema no infiere nada de las ausencias.
  5. **Errores acumulados por archivo** en el `failed[]` que ya construyó el extracto;
     **claves desconocidas = error**, salvo las que empiezan por `_`; el choque
     `(name, date)` se resuelve en el servicio conservando el primero alfabético.
  6. **Un `products.json` por año**, no un volcado por archivo.
  7. **Cero dependencias nuevas** y **ninguna subclase de error nueva**.
- **Alternativas consideradas:** identidad del producto en el nombre del archivo;
  números como cadena en formato español (propuesta original, **descartada por el
  humano** el 2026-08-11); aceptar los dos formatos a la vez; aceptar `dd/mm/aaaa` (y
  `dd/mm/aa`); `"closed": true` en vez
  de `closedAt`; guardar las dos TAE del depósito; un volcado por archivo de producto;
  validar con AJV; mirar el contenido en vez de la extensión. Cada una con su porqué en
  §5, §6, §7, §8, §9 y §10.
- **Consecuencias:**
  - **Sin dependencias, sin variables de entorno y sin migración.**
  - **El módulo del banco queda completo:** sus dos entradas, un solo disparo.
  - **Límite conocido:** subir dos archivos de producto con el mismo nombre en el mismo
    `<banco>/<año>/` hace que la ingesta pise la copia local (ADR-009); la convención de
    nombre recomendada lo evita, pero **no se valida**.
  - **Contrato con la feature de importación:** tendrá que hacer los **dos upserts** que
    la feature 9 documentó y enlazar movimientos con productos, que aquí queda
    explícitamente fuera.

## 12. 🔴 Qué necesita cambiar la feature 9 a raíz de estos formatos (R63)

### 12.1 El esquema Prisma: **NINGÚN cambio**

Lo digo explícitamente porque el `intent` pide que se diga en un sentido o en el otro:

> **El esquema de `specs/investments-data-model/` NO cambia. Ni una columna, ni un tipo,
> ni un índice, ni una precisión decimal.**

Comprobado campo a campo: los cuatro valores del enum, las cuatro columnas del depósito,
las cinco de la valoración, las dos claves naturales y las precisiones `Decimal(10,2)` /
`Decimal(6,4)` / `Decimal(7,4)` cubren **todo** lo que estos formatos pueden expresar, y
ningún campo del formato se queda sin sitio donde guardarse.

Además, **dos de sus puntos abiertos quedan cerrados, y los dos confirman el esquema**:

| Punto abierto de la feature 9 | Respuesta del humano | Efecto en el esquema |
| --- | --- | --- |
| 🔴 **nº 1** — ¿`marketValue` incluye `uninvestedCash`? | **Van aparte.** *"El efectivo queda fuera de cualquier total, eso siempre se queda como remanente."* Y la muestra lo confirma: invertido + ganancia = valor de mercado, exacto, con el efectivo fuera (§7.5) | **Ninguno.** Confirma su suposición: patrimonio = `marketValue + uninvestedCash` |
| **TAE del depósito** | **Una sola: la que se aplica** (la bonificada, con su interés bruto). La otra es información comercial | **Ninguno.** Ya tiene exactamente un `interestRate` y un `expectedGain` |

### 12.2 El **texto** del spec de la feature 9: ✅ ya corregido

> Las tres correcciones de prosa que necesitaba (el nombre y la ruta de la antigua F10,
> la suposición de que aterrizaría seis archivos en `src/modules/investments/`, y la
> plantilla `docs/investments-file.template.json` con su clave de pregunta) **se
> aplicaron ya** sobre el spec de la feature 9. **No hay nada pendiente aquí.**
>
> ⚠️ **Salvo un detalle nuevo del corte:** allí donde el spec de la feature 9 diga
> `myinvestor-parser`, hoy hay **dos** specs (`myinvestor-statement` y
> `myinvestor-products`). Es una corrección de enlaces, no de esquema; se anota en
> `progress/current.md` al implementar (T17 de `tasks.md`).

## 13. Modelo de tipos y firmas nuevas

En inglés, como todo el dominio (`docs/conventions.md` §Idioma). **Se añaden al
`myinvestor.types.ts` que ya existe**, sin tocar el alias del contrato del extracto.

```ts
export type InvestmentProductType = 'fund' | 'etf' | 'managed_portfolio' | 'deposit'

export interface ParsedValuation {
  invested: number
  marketValue: number
  gain: number                   // con signo
  gainPercent: number            // porcentaje con signo (5.51 = 5,51 %)
  uninvestedCash: number | null  // APARTE de marketValue, jamás sumado (§7.5)
}

export interface ParsedDepositTerms {
  principal: number
  interestRate: number           // TAE en porcentaje, la aplicada (§7.4)
  expectedGain: number
  maturityDate: string           // ISO
}

export interface ParsedProduct {
  bank: 'myinvestor'
  file: string                   // procedencia: nombre del archivo de origen
  type: InvestmentProductType
  name: string
  date: string                   // ISO
  currency: string               // 'EUR' por defecto
  closedAt: string | null        // ISO; null = vivo (§8)
  valuation: ParsedValuation | null       // null en 'deposit'
  depositTerms: ParsedDepositTerms | null // null en los otros tres
}

export interface MyinvestorProductsResult {
  bank: 'myinvestor'
  year: string
  products: ParsedProduct[]
  failed: FailedFile[]           // el tipo lo declaró la F10
  ignored: IgnoredFile[]         // el tipo lo declaró la F10
}

export interface ParsedProductSummary {
  bank: string; year: string; file: string
  type: InvestmentProductType
  name: string
  date: string
  dumpPath: string               // relativa al dumpBaseDir
}
```

**Firmas nuevas:**

```ts
// myinvestor.format.ts  (AÑADIR al archivo de la F10, no crear otro)
export function parseIsoDate(value: unknown): string | null    // AAAA-MM-DD estricto

// myinvestor.product.parser.ts  (nuevo)
export function parseMyinvestorProduct(
  file: string, content: string,
): ParsedProduct | { reason: string }
```

**Firma que se AMPLÍA (no se reescribe):** `parseLocalMyinvestorCopies(sourceBaseDir,
dumpBaseDir)` de la F10 gana en su resultado `products: ParsedProductSummary[]`.

> **Por qué los importes salen como `number` y no como cadena normalizada:** es el
> vocabulario que el parser del extracto ya usa, y el futuro importador quiere **un**
> mapeo. No hay pérdida observable con dos decimales, y la conversión final a
> `Decimal(10,2)` la hace el importador. **Alternativa anotada** por si algún día hay
> tres decimales o importes enormes: emitir cadenas normalizadas (`"8440.60"`), que
> Prisma acepta directamente para `Decimal`.

## 14. Estrategia de test (Nivel 2 de `docs/verification.md`)

- **Fixtures SINTÉTICOS, generados en código** (en el `myinvestor.fixture.ts` de la F10):
  el JSON se construye como objeto. 🔴 **Nunca se copian cifras ni nombres de producto de
  los archivos reales de `var/`**, ni se versiona ningún archivo de muestra.
- **Sin red y sin base de datos.** El parser de producto es puro; el servicio se ejerce
  contra un **tempdir** (`mkdtemp`) inyectado por `sourceBaseDir` / `dumpBaseDir`.
- **Comparar el resultado concreto**, nunca "no lanza" (anti-patrón de
  `docs/verification.md`).

| Archivo de test | Cubre |
| --- | --- |
| `myinvestor.format.test.ts` (ampliado) | R28 |
| `myinvestor.product.parser.test.ts` (nuevo) | R21, R22, R23, R24, R26, R27, R29, R30, R32, R33, R34, R35, R36, R37, R38, R39, R40, R41, R42, R43, R44, R45, R48, R77 |
| `myinvestor.service.test.ts` (ampliado) | R31, R46, R53, R76 |
| `src/architecture.test.ts` | R73 |

**Requirements de proceso** (checklist del reviewer sobre el diff, no test):
**R60, R63, R71, R72, R74, R75**.

## 15. Riesgos y notas para el implementer

- ⏸️ **NO empieces hasta que la F10 `myinvestor-statement` esté `done`.** Es la única
  espera que queda: los CINCO puntos 🔴 y la lista de campos de §7 están **cerrados**
  (2026-08-11, registro en [`CAMPOS-cerrados.md`](CAMPOS-cerrados.md)).
- 🔴 **No re-crees nada de la F10.** Ni `myinvestor.format.ts`, ni el servicio, ni la
  ruta, ni `failed[]`/`ignored[]`. Se **amplían**. Y **no escribas ningún normalizador de
  números aquí**: los valores llegan ya como número JSON (§6.1); `parseAmountText` es del
  extracto y no se importa ni se duplica.
- 🔴 **`pnpm`, NUNCA npm.** Y **cero dependencias nuevas**: `JSON.parse` es nativo y la
  validación va a mano (§9.5).
- 🔴 **Los fixtures son sintéticos.** Nunca copies datos de `var/drive-read/` a un test.
- ⚠️ **El choque `(name, date)` (R46) va en el SERVICIO, no en el parser puro:** el
  parser ve un archivo cada vez y no puede detectarlo (§9.2).
- ⚠️ **El orden importa para el determinismo:** lista los archivos con `.sort()` antes de
  recorrerlos y serializa con las claves siempre en el mismo orden.
- Convenciones (`docs/conventions.md`): comillas simples, sin `;` al final de línea,
  2 espacios, 100 columnas, imports relativos con `.js`, `import type` para tipos,
  vendor antes que relativos, comentarios mínimos y en inglés.
