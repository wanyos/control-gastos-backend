# Archivo de cuenta de Trade Republic — referencia del formato

> **Qué es esto:** la **fuente de verdad del formato** del archivo `.json` que escribes
> a mano **una vez al mes**, con la foto de tu cuenta remunerada de Trade Republic, y
> dejas en la carpeta de Trade Republic de Drive. Lo lee el parser de la feature 20
> (`src/modules/trade-republic/`), **sin base de datos** y sin mover nada en Drive.
>
> ⚠️ **Este documento NO es la plantilla que copias cada mes**, pero sí hay un archivo
> copiable: [`plantillas/trade-republic-cuenta-remunerada.json`](plantillas/trade-republic-cuenta-remunerada.json).
> Es **byte a byte** el bloque de abajo —un test lo comprueba, así que no puede
> desviarse— y está para que copies un `.json` en vez de un trozo de markdown.
>
> Tu plantilla de trabajo vive en **Drive, en una carpeta HERMANA de `notas-banco/`**
> (nunca dentro: todo lo que cuelga de `notas-banco/` se toma por un banco). Esa copia
> la creas y la mantienes tú; **nadie comprueba que la de Drive coincida con esta**.
> Cuando el formato cambie, se cambia **aquí** y tú actualizas la de Drive.
>
> Decisiones que lo fijan: `specs/trade-republic-product-file/decisions.md` y
> `docs/architecture.md` §ADR-024.

## Las reglas de escritura no se repiten aquí

Son **las mismas** que las de los archivos de producto de MyInvestor y están escritas
una sola vez, en [`myinvestor-product-files.md`](myinvestor-product-files.md)
§«Las dos reglas de escritura»:

- los **números** van como número JSON, **sin comillas**, con **punto decimal**, sin
  separador de miles y sin símbolos (`€`, `%`);
- las **fechas** van siempre en `AAAA-MM-DD`;
- una **clave que no está en la plantilla** es un error y se te dice por su nombre;
- las claves que **empiezan por `_`** son tus notas y se ignoran;
- **el banco NO se escribe** en el archivo: sale de la carpeta.

Dos copias de la misma regla divergen en cuanto una cambie, así que aquí solo está lo
que es **propio de esta cuenta**.

## La plantilla — `savings_account`

**Todos los valores son marcadores `<…>`**, ninguno es copiable tal cual. Es
deliberado, por la misma razón que en MyInvestor: el 2026-08-15 un archivo se subió
conservando los valores del ejemplo y **sobrevivió a una revisión humana**, porque eran
valores legales, solo que falsos. Con marcadores, un campo sin editar canta a la vista.

```json
{
  "type": "<savings_account, el único valor admitido>",
  "name": "<cómo llamas tú a esta cuenta; el mismo texto todos los meses>",
  "date": "<AAAA-MM-DD: el día del abono de intereses de este mes>",
  "openedAt": "<AAAA-MM-DD: el día que abriste la cuenta; el mismo todos los meses>",
  "openingBalance": "<saldo inicial del mes; número SIN comillas, quítalas al rellenar>",
  "moneyIn": "<lo que entró en el mes SIN los intereses; número SIN comillas, 0 si no entró nada>",
  "moneyOut": "<lo que salió en el mes; número SIN comillas, 0 si no salió nada>",
  "interest": "<los intereses abonados ese día; número SIN comillas>",
  "balance": "<el saldo final, justo después del abono; número SIN comillas>",
  "closedAt": "<null mientras la cuenta siga viva; AAAA-MM-DD el mes que la cierres>"
}
```

> **Por qué los marcadores de los importes van entre comillas.** Para que la plantilla
> entera sea un **JSON válido**: así, si la copias sin rellenar, el parser puede
> nombrarte **todos** los campos que te faltan por sustituir en vez de morir en el
> primer error de sintaxis. **Al rellenarlos, quita las comillas**: un número va sin
> ellas (y si te las dejas, te lo dice por su nombre). Hay un test que copia esta
> plantilla tal cual y comprueba que sale rechazada.

> 🔴 **El resumen del extracto NO te da los datos del mes: te da los del periodo.**
> Corregido el **2026-08-20**, contra el extracto real y no de memoria; hasta ese día
> este documento afirmaba lo contrario y era una **suposición escrita como hecho**.
>
> El bloque «RESUMEN DE ESTADO DE CUENTA» resume **todo el periodo que cubre el
> extracto**, que puede ser de varios meses: su balance inicial es el del primer día
> del periodo y su entrada de dinero es la **suma de todos** los abonos. Copiarlo en el
> archivo de un mes da un descuadre garantizado.
>
> Los tres salen de **la tabla de transacciones**, no del resumen, y siguen sin exigir
> ninguna cuenta: el `openingBalance` de un mes es el `BALANCE` de la fila de
> intereses **anterior**, y `moneyIn`/`moneyOut` son las filas de ese mes que **no**
> son abonos de intereses (casi siempre ninguna, o sea `0`). Solo en el **primer** mes
> del extracto el `openingBalance` es el `BALANCE INICIAL` del resumen, porque ahí no
> hay fila anterior.

**Cadencia: un archivo por abono de intereses**, o sea **uno al mes**. Lo que tecleas
cada vez son **seis valores**: `date`, `openingBalance`, `moneyIn`, `moneyOut`,
`interest` y `balance`. Los tres —`date`, `interest` y `balance`— salen de **la misma
fila** de la tabla de transacciones (la del abono de intereses de ese mes: su columna
`FECHA`, su `ENTRADA DE DINERO` y su `BALANCE`). El `openingBalance` es el `BALANCE`
de la fila de intereses **anterior**, y `moneyIn`/`moneyOut` son las demás filas de ese
mes, si las hay. El resto se copia igual todos los meses.

**Si el extracto cubre varios meses, escribes tantos archivos como filas de intereses
tenga**, uno por fila. No es opcional ni es «ya lo pondré junto»: un archivo es **un
mes**, y meter cuatro meses en uno sale rechazado por el cuadre. Cada fila trae el
saldo posterior, así que se rellenan hacia atrás **sin calcular nada**.

## El archivo se comprueba a sí mismo

Los tres campos de saldo inicial y movimientos no están ahí para teclear más: están
para que **una errata no cuele en silencio**. Con ellos el archivo cuadra solo:

```
saldo inicial + entradas − salidas + intereses = saldo final
openingBalance + moneyIn − moneyOut + interest = balance
```

- 🔴 **Si no cuadra, el archivo de ese mes se RECHAZA.** No es un aviso: un aviso
  dentro de un volcado que no lees cada mes no impide que el dato malo entre.
- El motivo te dice **cuánto se desvía (con signo)**, **el saldo final esperado frente
  al que escribiste** y **los cinco importes con su valor**, porque el parser no puede
  saber cuál de los cinco está mal y verlos juntos es lo que deja ver cuál chirría.
- Se admite **1 céntimo** de desviación y ni uno más: los cinco importes ya vienen
  redondeados al céntimo por el banco, así que ese margen perdona **su** redondeo, y
  una errata de verdad (un dígito, una coma, un signo) se desvía de céntimos a euros.
- La cuenta se hace en **céntimos enteros**, no en euros con decimales, porque en coma
  flotante `0.1 + 0.2` no es `0.3` y meses perfectamente buenos saldrían rechazados.
- **Si te falta uno de los cinco importes, o lo escribes mal**, se te dice **eso** y no
  se te suelta además un descuadre encima: un descuadre calculado sobre datos
  incompletos te mandaría a buscar un error de importes donde solo hay un campo sin
  escribir.

> ⚠️ **`moneyIn` NO incluye los intereses.** Van aparte, en `interest`. Es la errata
> más fácil de cometer y ya se cometió en el primer archivo real: el abono de intereses
> es una fila de la columna «ENTRADA DE DINERO», así que la mano lo lleva sola a
> `moneyIn`. Y si el **resumen** los suma dentro de su entrada de dinero, **réstalos**. Es la única
> resta del archivo y no es opcional: si los intereses fueran dentro de `moneyIn`, el
> cuadre los contaría **dos veces** y rechazaría todos los meses buenos. En un mes sin
> más movimiento que el abono, `moneyIn` es `0`.

**Un ejemplo de cabeza, con números redondos:** una cuenta con 4.000 € que no recibe
ni saca nada y cobra 6,40 € de intereses acaba en 4.006,40 €. Si escribes 4.106,40 por
un dedazo, el motivo te dice que **se desvía +100,00 €** y te enseña los cinco importes.

## Tabla de campos y de dónde sale cada uno

Leyenda del origen: **MUESTRA** = está en el extracto que te manda el banco ·
**HUMANO** = no está en ningún sitio y lo sabes solo tú · **DISEÑO** = identifica la
forma del archivo.

| Campo | ¿Obligatorio? | De dónde sale |
| --- | --- | --- |
| `type` | **sí** | **DISEÑO** — único valor admitido `savings_account` |
| `name` | **sí** | **HUMANO** — cómo llamas a esta cuenta. Es la **identidad**: cambiarlo crea otra |
| `date` | **sí** | **MUESTRA** — la columna `FECHA` del apunte de intereses de ese mes |
| `openedAt` | **sí** | **HUMANO** — el extracto **no lo trae**; se escribe una vez y se copia igual todos los meses |
| `openingBalance` | **sí** | **MUESTRA** — el `BALANCE` de la fila de intereses **anterior** (y solo en el primer mes del extracto, el `BALANCE INICIAL` del resumen). Es el `balance` del archivo del mes anterior |
| `moneyIn` | **sí** | **MUESTRA** — las filas del mes que **no** son abonos de intereses y suman; `0` si no hay ninguna. **Nunca del resumen** |
| `moneyOut` | **sí** | **MUESTRA** — las filas del mes que restan; `0` si no hay ninguna. **Nunca del resumen** |
| `interest` | **sí** | **MUESTRA** — los **euros** abonados ese día (`ENTRADA DE DINERO` de esa fila). **No el porcentaje**: el TAE no va en este archivo |
| `balance` | **sí** | **MUESTRA** — el saldo final, justo después del abono (`BALANCE` de esa fila) |
| `currency` | no (def. `EUR`) | se hereda de MyInvestor: existe y **no se escribe nunca** |
| `closedAt` | no | se escribe **una sola vez**, el mes que cierres la cuenta |
| `_lo_que_sea` | no | tus notas, se ignoran |

**Deliberadamente fuera, y por qué:**

- **El IBAN.** Es el único banco que lo da sin que tú hagas nada, pero **hoy no hay
  quien lo use**: esta feature no toca la base de datos, y sin base de datos un IBAN no
  crea ninguna cuenta. Se añadirá —una línea— el día de la importación, no antes.
- **El tipo de interés (TAE).** **No está en el extracto.** Obligaría a ir a buscarlo a
  la app y a acordarte de cambiarlo cuando el banco lo mueva; con los cinco importes que
  ya escribes, el porcentaje **se calcula solo** y no puede quedarse desfasado en
  silencio.
- **Los apuntes uno a uno.** Eso es el parser del PDF, que es justo lo que esto no hace.

### `closedAt`: cómo se dice que la cuenta ya no está

- Se escribe **una sola vez**, en el archivo del mes que la cierres.
- 🔴 **Dejar de subir el archivo un mes NO cierra la cuenta.** El parser no tiene
  memoria, no compara con el mes pasado y no emite «cuentas desaparecidas».

## Cómo se llama el archivo

**El nombre del archivo no se valida nunca**: la cuenta y la fecha salen **de dentro**,
y el nombre solo se usa para reportar y como procedencia.

**Convención recomendada (no obligatoria):** `cuenta-remunerada-<AAAA-MM-DD>.json`.
Ordena cronológicamente sola y evita un límite real: la ingesta **sobrescribe la copia
local** si dos archivos del mismo `<banco>/<año>/` se llaman igual, así que subiendo
`cuenta.json` todos los meses cada descarga pisaría la anterior.

**Si dos archivos declaran la misma cuenta (`name`) y la misma fecha (`date`)** —el caso
típico: `cuenta.json` y `cuenta (1).json`, que Drive crea al subir dos veces—, se
conserva el **primero por orden alfabético** y el otro se reporta diciendo con cuál
choca. La misma cuenta con **otra** fecha es lo normal y no choca nunca.

## Qué pasa cuando un archivo está mal

Un archivo roto **no tumba a los demás**: se reporta en `failed[]` con su nombre y su
motivo, y el resto se parsea igual. Y **un archivo roto reporta todos sus problemas de
golpe**, no el primero, para que arreglarlo sea un solo viaje.

| Qué pasa | Qué dice el motivo |
| --- | --- |
| El archivo no está guardado en **UTF-8** | se rechaza entero, con el byte y la línea |
| El `.json` no es válido | el problema de sintaxis |
| Un valor sigue siendo el **marcador `<…>`** de la plantilla | **todos** los campos que te falta sustituir |
| Falta un campo obligatorio | **todos** los que faltan, por su nombre |
| Un número no es un número (`true`, `[]`, `{}`) | el campo y el valor recibido |
| Un número viene **como texto** (`"4006.40"`, `"1.234,56"`) | el campo, el valor y *«se espera un número sin comillas»* |
| El `type` no es `savings_account` | el valor recibido y el único admitido |
| Una fecha en otro formato, o que no existe (`2026-02-31`) | el campo y `AAAA-MM-DD` |
| Una clave desconocida | las claves sobrantes, por su nombre |
| **Los cinco importes no cuadran** | la desviación con signo, el saldo esperado frente al escrito y los cinco importes |
| Dos archivos con la misma cuenta y fecha | con qué archivo choca |

## El `.pdf` del extracto no molesta

Puedes seguir subiendo el extracto en PDF a esa misma carpeta: **se lista como
`ignored`, no como fallo**. Si fuera un fallo, tendrías un error rojo todos los meses
por un archivo que hace bien en estar ahí. **Nadie lo abre.**

## Dónde acaba lo que escribes

**Desde la feature 26, acaba en la base de datos.** Hasta entonces el `.json` moría en un
volcado; ahora entra por el botón de siempre y tu cuenta queda guardada como un producto
más, con **una foto por mes**.

```
Drive: notas-banco/Trade Republic/<año>/cuenta-remunerada-<AAAA-MM-DD>.json
   │  (ingesta)
   ▼
var/drive-read/trade-republic/<año>/…json     ← el origen, gitignoreado
   │
   ├── POST /api/import ──────────► BASE DE DATOS
   │   (el camino de verdad)        InvestmentProduct + SavingsSnapshot
   │                                y el original se mueve a procesados/
   │
   └── POST /api/parser/trade-republic ─► var/parsed/trade-republic/<año>/products.json
       (el ENSAYO: no escribe nada en la base)
```

**Los dos caminos leen el archivo igual** —el mismo decodificado UTF-8, las mismas
comprobaciones, el mismo cuadre— y se diferencian en qué hacen después.

### `var/parsed/` es el **ensayo**, no el destino

Sigue existiendo y sigue siendo un `products.json` por año, gitignoreado, pero **cambió de
oficio**: dejó de ser «la base de datos falsa» y pasó a ser el sitio donde mirar **qué ha
entendido el sistema de tu archivo, sin escribir nada**. Úsalo cuando quieras revisar un
mes antes de meterlo. El volcado **no es una copia** del origen: es lo interpretado —las
cuentas del año ya validadas, con el banco y el archivo de procedencia, más la lista de lo
que salió mal y lo que se ignoró—.

### Qué pasa cuando el archivo entra de verdad

- **Tu cuenta es su `name`.** Se guarda (o se actualiza) sobre la pareja banco + nombre;
  el banco lo dice la **carpeta**, nunca el contenido.
- **Cada `date` es una foto.** Subir **el mismo mes otra vez lo sobrescribe**; subir el
  **mes siguiente añade una fila** y no crea otra cuenta.
- **Los cinco importes se guardan tal como los escribes.** Nada se calcula ni se redondea.
- **Un archivo que no cuadra no deja rastro:** ni cuenta, ni foto, ni movimiento a
  `procesados/`. Se te dice el motivo entero, lo corriges y lo vuelves a subir.
- **La plantilla NO cambia**: ni un campo nuevo, **IBAN incluido**. Un producto no tiene
  IBAN; el IBAN solo sirve para enganchar movimientos a una cuenta corriente.
- ⚠️ **El `.pdf` sigue saliendo con un motivo falso** («no hay parser para el banco
  trade-republic»): parser hay, lo que no hay es parser **de su extracto**. Es un defecto
  conocido y tiene su propia feature pendiente.

---

## ⚠️ Esto es PROVISIONAL, y esto es lo que lo revierte

Trade Republic es el único banco que entra **sin parser de lo que emite el banco**. No
es un descuido ni una preferencia estética:

- Su extracto es un **`.pdf`**. El texto se extrae, pero **la tabla no sobrevive a la
  extracción**: las descripciones se desalinean de su fila, así que reconstruirla exige
  agrupar por coordenadas. Es el parser más caro de los pendientes.
- Y es el banco con **menos apuntes**: uno o dos al mes, todos abonos de intereses. El
  esfuerzo no compensa hoy.

El diagnóstico completo, medido sobre el fichero real, está en
[`progress/explorations/inventario-bancos-2026-08-17.md`](../progress/explorations/inventario-bancos-2026-08-17.md)
§Trade Republic.

🔴 **Qué lo revierte:** el día que esa cuenta tenga **movimientos de verdad**, se
escribe el parser del PDF y este archivo escrito a mano deja de ser la vía de entrada.
**Avísanos ese día.** Mientras tanto, esta es la forma correcta y está decidida.
