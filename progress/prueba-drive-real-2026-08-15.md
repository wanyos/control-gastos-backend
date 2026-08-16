# Prueba real del camino Drive → parser (2026-08-15)

> Prueba de humo con los archivos reales del humano en `notas-banco/myinvestor/2026/`.
> No es una feature: es la verificación que quedaba pendiente en
> [`current.md`](current.md) («va a poner la línea `iban;ES…` y a subir sus JSON»).
> No se ha tocado código de aplicación.
>
> 🔴 **Saneado el 2026-08-15, después de escribirlo.** La primera versión de este
> informe traía el **IBAN real** del humano, sus importes y los conceptos literales de
> su extracto. El guardián de la F14 (`src/no-real-data.test.ts`) lo detectó y puso
> `./init.sh` en rojo — hizo exactamente su trabajo, y contra quien tenía que hacerlo:
> el agente que escribió el informe, no el implementer de turno. **Todas las cifras,
> el IBAN y los conceptos de aquí abajo son inventados**; solo son reales la forma de
> los archivos, los mensajes de error y el diagnóstico, que es lo único que aporta el
> informe. Lección para el que escriba el siguiente: un informe de una prueba con
> datos reales se versiona igual que el código, y pegar la salida de la consola tal
> cual es la vía rápida a versionar un IBAN.

## Cómo se ejecutó

1. `docker compose ps` → `gastos-postgres` sano.
2. `pnpm run dev` → escuchando en `:3000`.
3. `GET /health/drive` → **`{"status":"ok","drive":"up"}`**. La conexión con Drive
   funciona con las credenciales de `.env`.
4. `GET /api/ingestion/pending` → 5 archivos pendientes.
5. `POST /api/ingestion/process` → 4 copiados, 1 fallido.
6. `POST /api/parser/myinvestor` → 1 extracto, **0 productos**, 4 fallidos.

## Resultado: 0 de 4 productos parseados, y el extracto no se pudo ni bajar

### 🔴 A. Los cuatro JSON llevan **coma decimal**: no son JSON válido

Es el fallo dominante. La plantilla de
[`docs/myinvestor-product-files.md`](../docs/myinvestor-product-files.md) usa punto
(punto decimal), pero los archivos escritos llevan coma:

```json
"invested": 1234,56,        ← inválido
"invested": 1234.56,        ← correcto
```

JSON no admite la coma decimal: `1234,56` se lee como «el valor `1234`, luego
otra clave», y por eso el error habla de comillas. Afecta a los cuatro archivos:

| Archivo | Números a corregir |
|---|---|
| `cartera-<AAAA-MM-DD>.json` | `invested`, `marketValue`, `gain`, `gainPercent`, `uninvestedCash` |
| `fondo-b-<AAAA-MM-DD>.json` | `marketValue`, `gain`, `gainPercent` |
| `deposito-a.json` | `interestRate`, `expectedGain` |
| `deposito-b.json` | `expectedGain` |

`principal`, `invested: 1000` y los enteros están bien: sin decimales no hay coma.

**Ajuste que merece la pena en el backend.** El motivo que devuelve hoy el parser es
`JSON inválido: Expected double-quoted property name in JSON at position 144`
([`myinvestor.product.parser.ts:63`](../src/modules/myinvestor/myinvestor.product.parser.ts#L63)).
Eso no le dice a nadie que el problema es la coma decimal, y este es el error que va
a cometer un humano español **todos los meses**. El parser ya tiene la doctrina de
que «el motivo debe bastar para arreglar el archivo» (R77 hace exactamente esto con
los números entre comillas). Falta la misma cortesía aquí: detectar el patrón
`: <dígitos>,<dígitos>` cuando `JSON.parse` falla y devolver
*«coma decimal en el campo X; JSON usa el punto: 1234.56»*.

### 🔴 B. El extracto está en Drive como **hoja de cálculo de Google**, no como CSV

`POST /api/ingestion/process` lo reporta como `Cannot reach Google Drive`, y el
mensaje engaña: Drive responde perfectamente. Lo que pasa es que el archivo se
subió **convertido**:

```
myinvestor/2026/<nombre del export del banco>  ->  application/vnd.google-apps.spreadsheet
myinvestor/2026/cartera-<AAAA-MM-DD>.json      ->  application/json   ✅
```

Un documento nativo de Google no tiene bytes que descargar, así que
`downloadFileContent` (`files.get` con `alt: 'media'`) falla siempre. Y hay un
segundo problema encadenado: al convertirse **perdió la extensión `.csv`**, así que
aunque se bajara, el parser lo mandaría a `ignored[]`
([`myinvestor.service.ts:69`](../src/modules/myinvestor/myinvestor.service.ts#L69):
el parser se elige por extensión y por nada más).

**Lo que le toca al humano:** volver a subir el `.csv` **sin convertir** (arrastrar
el archivo a la carpeta, con «Convertir los archivos subidos al formato del editor
de Documentos de Google» **desactivado** en Configuración de Drive), y borrar la
hoja convertida.

**Ajuste opcional en el backend:** distinguir el caso. Un `google-apps.*` en la
carpeta no es «Drive no responde»; es un archivo que el humano subió mal, y
merece su propio motivo. La alternativa mayor —soportar `files.export`— es
tentadora pero no es gratis: la conversión **cambia el separador de `;` a `,`** (lo
comprobé), así que exportar obligaría al parser a tragar dos dialectos. Recomiendo
solo el mensaje claro.

### ✅ C. El contenido del extracto **sí es correcto**: los dos datos nuevos funcionan

Para no dejar la verificación a medias, reconstruí el CSV con `;` (la copia local
del 10-ago + la línea `iban` y la fila `Saldo` que solo existen dentro de la hoja) y
lo pasé por el parser:

```
accountIban : ES66…0000   ✅ se lee de la línea `iban;…`
movimientos : 11          ✅ ninguno perdido
```

Los importes con separador de miles (`-11.000` → `-11000`) y con coma decimal
(`99.888,77` → `99888.77`) salen bien: **en el CSV la coma decimal es correcta**
(la escribe el banco); es solo en el JSON donde no lo es. Cuando vuelva a subir el
`.csv` de verdad, este camino entra a la primera.

## Cabos que deja la prueba

1. **La fila `Saldo;1500,00` y la fila vacía caen en `unparsedRows`** con el motivo
   `fecha de operación inválida ('Saldo')`. Van a aparecer en **todos** los
   extractos a partir de ahora: es ruido permanente en un campo cuyo propósito es
   señalar lo que hay que mirar. Decisión pendiente del humano: ¿se ignora la fila
   de cierre en silencio, o el saldo total es un dato que quiere guardar? Hoy
   `balance` es `null` por línea a propósito (el banco no lo da).
2. **`closedAt` apunta al vencimiento futuro en los dos depósitos:**
   `deposito-1mes` lleva `closedAt: "2026-08-31"`, idéntico a su `maturityDate`, y
   el de 3 meses `2026-11-03`. Pero esos depósitos **no están cerrados**: vencen
   ese día. `closedAt` debería ser `null` hasta que se cierre de verdad, o cualquier
   vista dará por liquidado dinero que sigue colocado. Confirmar con el humano.
3. **Los nombres de los dos depósitos no llevan fecha** (`deposito-a.json` frente
   a `cartera-<AAAA-MM-DD>.json`). Al parser le da igual —la identidad sale del
   contenido, R24— pero la cadencia es un archivo por producto **y por mes**: en
   septiembre el archivo del mes que viene choca de nombre con el de este.
4. **`var/drive-read/` arrastra basura de la sesión del 10-ago:** `deposito.txt`,
   `fondo.txt`, `indi.txt` y la copia vieja del CSV. Los tres `.txt` inflan el
   `ignoredCount` a 3 y la copia vieja del CSV es la que se acaba de parsear (sin
   IBAN). Conviene vaciar `var/drive-read/myinvestor/2026/` antes de la próxima
   pasada. Está en `.gitignore`, no hay riesgo de dato real versionado.

---

# Segunda pasada (mismo día, tras corregir los archivos)

El humano corrigió los cuatro JSON, resubió el `.csv` sin convertir y añadió un ETF.
Antes de relanzar se vació `var/drive-read/myinvestor/2026/` (las copias viejas
quedaron apartadas fuera del repo) para que el resultado no arrastrase la basura del
cabo nº 4.

**El camino entero entra de punta a punta:**

```
process : 6/6 descargados, 0 fallidos
parser  : 1 extracto (IBAN ES66…0000, 11 movimientos), 5 productos, 0 fallidos, 0 ignorados
```

Las dos causas de la primera pasada están resueltas: los números llevan punto
decimal y el `.csv` llega como `text/csv` con su extensión. Pero **cero fallos no es
cero problemas**: los dos que quedan son silenciosos, y ese es justo el peor tipo.

### 🔴 D. `etf-<AAAA-MM-DD>.json` conserva el tipo y el nombre de la plantilla

```json
"type": "fund",                    ← debería ser "etf"
"name": "<el nombre de ejemplo de la plantilla>",   ← es el ejemplo de la documentación, no el ETF de oro
"invested": 1111.11, "marketValue": 2222.22, "gainPercent": 33.33   ← estos sí son suyos
```

Editó los números y se dejó las dos primeras líneas del ejemplo de
[`docs/myinvestor-product-files.md`](../docs/myinvestor-product-files.md). El archivo
es **JSON perfectamente válido y del todo coherente**, así que el parser lo acepta sin
una queja y el ETF de oro entra en el sistema como un fondo llamado «el nombre del ejemplo de la plantilla».

Ningún parser puede atrapar esto: los dos valores son legales, solo que no son los
verdaderos. Lo que sí se puede hacer es **quitarle filo a la plantilla**: hoy la
documentación invita a copiar un bloque con valores de aspecto real. Si los ejemplos
usaran marcadores obvios (`"name": "<nombre del producto>"`) el olvido se vería a
simple vista, y de propina el parser podría rechazar un archivo que aún los lleve.
Nótese que este mismo error ya se coló y **sobrevivió a una revisión humana**.

### 🔴 E. El extracto viene ahora en **cp1252**, y el parser lo destroza en silencio

Un concepto del extracto que lleve una vocal acentuada llega al volcado con esa
vocal convertida en el carácter de sustitución `�` (una `Ó`, por ejemplo, desaparece
y en su sitio queda `�`). No es un problema de visualización: la letra se pierde
**de forma irreversible** en el parseo, y así entraría en la base de datos.

La causa está medida, no supuesta:

| Archivo | Bytes de la `Ó` | Codificación |
|---|---|---|
| Copia del 10-ago (export del banco, intacto) | `c3 93` | UTF-8 ✅ |
| `cuenta-<AAAA-MM-DD>.csv` (tras editarlo) | `d3` | cp1252 ❌ |

O sea: **MyInvestor exporta en UTF-8 y el archivo se pasó a cp1252 al editarlo** para
meterle la línea del `iban` (Excel y el Bloc de notas en modo ANSI hacen justo eso).
La solución inmediata es guardarlo como UTF-8 — en el Bloc de notas, *Guardar como →
Codificación: UTF-8*.

Pero la parte del backend es la que importa, porque esto va a repetirse cada mes:
[`myinvestor.statement.parser.ts:64`](../src/modules/myinvestor/myinvestor.statement.parser.ts#L64)
hace `content.toString('utf8')` a secas, y un byte que no es UTF-8 válido se
convierte en `�` sin error ni aviso. La cabecera sí sobrevive (se reconoce por
su prefijo ASCII, previsión deliberada del parser), así que **el archivo parece
parsear bien**: 11 movimientos, cero `unparsedRows` de más. El daño solo se ve
mirando los conceptos uno a uno. Un `�` en el texto es prueba concluyente de una
decodificación fallida, y hoy nadie lo mira.

### ⚪ Cabos menores de esta pasada

- El archivo se llama `deposito-a-<año mal tecleado>-08-15.json`: un año mal tecleado, con un dígito cambiado. Al
  parser le da igual (la fecha sale del contenido, R24) y el producto entra con su
  `date: "2026-08-15"` correcto. Es solo el nombre, pero ordena mal la carpeta.
- Las dos filas del final del CSV (la vacía y `Saldo;1500,00;;;`) siguen cayendo en
  `unparsedRows`, como se preveía en el cabo nº 1. **Decidido** (ver abajo).

### ✅ Decisión del humano sobre el saldo (2026-08-15)

El saldo **sí se guarda**, y entra como **segunda línea del preámbulo etiquetado**,
al lado del IBAN:

```
iban;ES6600000000000000000000;;;
saldo;1500,00;;;
Fecha de operación;Fecha de valor;Concepto;Importe;Divisa
```

Se eligió frente a leer la fila `Saldo` del final del archivo. La razón: el parser ya
tiene ese mecanismo montado y probado para el IBAN (`findIbanLine`), así que es una
extensión del patrón existente en vez de un camino nuevo; y sobre todo evita que el
parser tenga que distinguir «fila de cierre legítima» de «fila corrupta», que es
precisamente la distinción que hace útil a `unparsedRows`. El humano borrará la fila
`Saldo` del final al editar el archivo.

Consecuencia para el contrato: el extracto pasa a devolver `accountBalance` junto a
`accountIban`. Ojo, es el saldo **de la cuenta en la fecha del extracto**, no el
saldo por línea: `balance` dentro de cada movimiento sigue siendo `null` para
siempre, porque el banco no lo reporta (ADR-013). Son dos datos distintos y no deben
acabar en la misma columna.

## Qué hacer a continuación

*(A y B quedaron resueltos en la segunda pasada; el cabo nº 2, el `closedAt` de los
depósitos, lo cerró el humano: **es correcto**, sus depósitos se cierran solos el
mismo día que vencen, así que `closedAt == maturityDate` es el estado real y no un
error.)*

**Humano:** corregir `type` y `name` de `etf-<...>-*.json` (D), volver a guardar el
`.csv` en UTF-8 (E), y decidir qué hacer con el saldo (cabo nº 1).

**Backend — candidatos a feature, por orden de daño:**

1. **Codificación del extracto (E).** Es el único que corrompe datos de verdad.
   Detectar que el contenido no es UTF-8 válido y decodificarlo como cp1252, o como
   mínimo fallar en voz alta en vez de escribir `�` en la base de datos.
2. **Plantillas con marcadores evidentes (D).** Cambiar los valores de ejemplo de
   `docs/` por marcadores y, si se quiere red de seguridad, rechazar el archivo que
   aún los conserve. Barato y ataca un error que ya se ha producido.
3. **Motivos de error legibles (A y B).** Coma decimal → *«JSON usa el punto»*;
   archivo nativo de Google → su propio motivo, en vez de `Cannot reach Google
   Drive`, que dice algo falso. Ya no bloquean a nadie, pero el humano se topará con
   los dos otra vez.
