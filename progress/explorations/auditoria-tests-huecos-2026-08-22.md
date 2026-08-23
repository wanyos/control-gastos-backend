# Auditoría de cobertura — qué NO está testeado (2026-08-22)

> Exploración de **solo lectura**. No se ha escrito ni un test, ni una línea de
> código. No se ha tocado la base de datos del humano: las únicas ejecuciones han
> sido dos scripts de sonda en el scratchpad que importan parsers puros (sin
> Drive, sin red, sin Prisma). Sin datos reales: solo recuentos, formas y
> literales de la documentación pública del repo (🔒 ADR-017).
>
> **Pregunta que responde:** «revisar si falta algo por testear de lo que tenemos
> hasta hoy y que no llevan tests». Huecos, no grasa. La auditoría de si *sobran*
> tests corre en paralelo en `auditoria-tests-utilidad-2026-08-22.md` y aquí no
> se toca.
>
> **Estado de partida:** 876 tests en 48 archivos, 29 features cerradas, 71
> archivos de producción en `src/` (sin `generated/`).

## Qué se decidió (2026-08-23) — leer esto antes que el resto

Este informe es la **foto del 2026-08-22**. Lo que se decidió después, con el
humano, y que **acota lo que sigue vivo**:

| Hallazgo | Decisión |
|---|---|
| **G1** — el marcador sin sustituir entra como nombre de producto | ✅ **CERRADO por la F30** (2026-08-23). Y el alcance era **menor** que el que este informe le puso: al medirlo campo por campo, solo **`name` y `currency`** estaban expuestos —los otros once ya rechazaban por su propia validación—, así que no eran «cuatro huecos» sino **dos campos**. Ver [resumen](../summaries/myinvestor-template-marker-guard.md) y [veredicto](../reviews/myinvestor-template-marker-guard.md) |
| **G2, G3, G4** y los 9 🟠 y 5 ⚪ | 🕗 **No se abren.** El humano los revisó y los considera **menores**: «el resto de indicaciones igual, creo que son cosas menores». No están descartados —quedan aquí con su evidencia y su `archivo:línea`— pero **no son trabajo pendiente**: se retoman solo si alguno molesta de verdad |

> ⚠️ **Sobre la clasificación de este informe.** Llamó «graves» a cuatro cosas, y
> en el caso de G1 el humano discutió esa etiqueta con razón: parte de la
> gravedad venía de contar como huecos separados cuatro guardias que en la
> práctica se reducían a **un campo de texto libre**. La evidencia medida era
> buena; **la escala estaba subida**. Léase lo que sigue con ese descuento.

---

## Resumen

| | Cuántos |
|---|---|
| 🔴 **Graves** | **4** |
| 🟠 **Convienen** | **9** |
| ⚪ **Opcionales** | **5** |

**El que más me preocupa:** el **G1** — el parser de productos de MyInvestor
acepta un marcador `<…>` sin sustituir como nombre de producto. Está **probado
con una sonda**, no deducido: el fichero entra, y con la clave natural
`(bank, name)` de la F26 la serie entera del producto queda colgando de un nombre
falso para siempre. Es **el accidente del 2026-08-15 otra vez**, en el único
banco de los dos que escriben `.json` que no heredó el guardián de marcadores de
la F24/F28.

---

# 🔴 Graves

## G1 — El parser de productos de MyInvestor no detecta los marcadores `<…>` de su propia plantilla

**Qué no está probado:** que un `.json` de producto de MyInvestor con la
plantilla **a medio rellenar** se rechace. No hay ni un test, porque no hay
código que lo haga.

**Evidencia.** La regla está escrita, y con nombre y apellidos, en
[`docs/myinvestor-product-files.md:65`](../../docs/myinvestor-product-files.md#L65)-77:

> «Un `<…>` que llegue sin sustituir se rechaza como cualquier otro valor
> inválido. **No hace falta código nuevo para eso**: la propia forma del marcador
> ya es inválida en los cuatro sitios.»

Esa frase es cierta para `type`, `date`, `openedAt` y los números — y **falsa
para `name`**, que es texto libre. El propio parser de Trade Republic lo dice en
su comentario, [`trade-republic.product.parser.ts:226`](../../src/modules/trade-republic/trade-republic.product.parser.ts#L226):

> «"a marker is invalid everywhere" does not hold for `name`: a marker is a
> perfectly valid string.»

Y por eso Trade Republic tiene `MarkerReport`, `isMarker` e `isHalfErasedMarker`
([`:231`](../../src/modules/trade-republic/trade-republic.product.parser.ts#L231),
[`:277`](../../src/modules/trade-republic/trade-republic.product.parser.ts#L277)).
`src/modules/myinvestor/myinvestor.product.parser.ts` **no tiene ninguno de los
tres**: `grep -i marker` sobre ese archivo no devuelve nada.

Sonda ejecutada (parser puro, sin BD), con la plantilla A del doc y solo `name`
sin editar:

```
myinvestor whole marker -> {"bank":"myinvestor","type":"fund","name":"<nombre del producto, ...>", ...}
myinvestor half  marker -> {"bank":"myinvestor","type":"fund","name":"<nombre del producto", ...}
```

Los dos **pasan**. Y el segundo es exactamente el caso que la **F28**
(`half-erased-marker-message`) se molestó en distinguir con un motivo propio…
para el otro banco.

**Qué podría romperse sin que nadie se entere.** Desde la **F29** MyInvestor está
en el registro de productos ([`src/app.ts:64`](../../src/app.ts#L64)) y
`persistProductSnapshot` hace upsert sobre la clave natural `(bank, name)`
([`investments.service.ts`](../../src/modules/investments/investments.service.ts)).
Un fichero con el marcador crea un `InvestmentProduct` llamado
`"<nombre del producto, tal y como lo llamas siempre>"`, en verde, con
`created: true` en el informe. El mes siguiente, ya con el nombre bueno, se crea
un **segundo** producto: la serie queda partida en dos y la primera foto colgada
de un nombre que no existe. Corregirlo después es tocar filas a mano.

**Gravedad: grave.** Alta probabilidad (es un fichero que él escribe a mano cada
mes, y la plantilla se copia entera), daño silencioso y persistente, y la defensa
ya está construida y probada a tres metros de distancia.

**Y no es un hueco suelto: MyInvestor heredó media docena de guardianes de Trade
Republic y se dejó los otros.** Todos estos tienen test para Trade Republic y
**ninguno** para MyInvestor, siendo el mismo tipo de fichero `.json` escrito a
mano:

- [`myinvestor.service.ts:155`](../../src/modules/myinvestor/myinvestor.service.ts#L155)
  — la regla de desempate cuando Drive deja `fichero (1).json` junto a
  `fichero.json` («mismo producto y fecha … se conserva el primero por orden
  alfabético»). El gemelo de Trade Republic
  ([`trade-republic.service.ts:87`](../../src/modules/trade-republic/trade-republic.service.ts#L87))
  sí está probado. Aquí, un duplicado descartado o sobrescrito en silencio no
  rompería nada.
- [`myinvestor.service.ts:72`](../../src/modules/myinvestor/myinvestor.service.ts#L72)
  y [`:80`](../../src/modules/myinvestor/myinvestor.service.ts#L80) — los dos
  guardias de «el producto no trae su valoración / sus condiciones: no se guarda
  nada». Sin test.
- [`myinvestor.product.parser.ts:124`](../../src/modules/myinvestor/myinvestor.product.parser.ts#L124)
  — el fallback `'archivo de producto no interpretable'`, que salta cuando el
  fichero se rechaza **con la lista de problemas vacía**: el caso "rechazado sin
  motivo". Nunca ejercido.
- `type` ausente ([`:149`](../../src/modules/myinvestor/myinvestor.product.parser.ts#L149)),
  `name` vacío ([`:171`](../../src/modules/myinvestor/myinvestor.product.parser.ts#L171))
  y `currency` vacía ([`:184`](../../src/modules/myinvestor/myinvestor.product.parser.ts#L184))
  — motivos sin aserción, todos con su equivalente probado en Trade Republic.

---

## G2 — Bankinter ante un fichero que no es un `.xlsx`: el informe le contesta con un error de `jszip`

**Qué no está probado:** qué dice el sistema cuando el `.xlsx` de Bankinter está
truncado, vacío, o es en realidad un `.xls` renombrado. **Ningún test** pasa un
buffer que no sea un zip válido a `parseBankinterXlsx`.

**Evidencia.** El único test de "fichero no reconocible" del módulo,
[`bankinter.service.test.ts:95`](../../src/modules/bankinter/bankinter.service.test.ts#L95),
construye un `.xlsx` **perfectamente válido** con cabeceras equivocadas
(`buildStatementXlsx({ headers: ['Columna A', 'Columna B'] })`) — y ni siquiera
comprueba el mensaje, solo `{ bank, year, file }`. El test del parser
[`bankinter.parser.test.ts:267`](../../src/modules/bankinter/bankinter.parser.test.ts#L267)
cubre "no hay fila de cabecera", que es el mismo caso.

`parseBankinterXlsx` llama a `workbook.xlsx.load(content)` en
[`bankinter.parser.ts:56`](../../src/modules/bankinter/bankinter.parser.ts#L56)
**sin ningún try**. Sonda ejecutada:

```
[ERR] bankinter empty -> Error  msg=End of data reached (data length = 0, asked index = 4). Corrupted zip ?
[ERR] bankinter junk  -> Error  msg=Can't find end of central directory : is this a zip file ?
                                    If it is, see https://stuk.github.io/jszip/documentation/howto/read_zip.html
```

Ese `Error` **no es un `AppError`**, así que cae en la segunda rama de
`describeError` (ver G3) y sale tal cual dentro del 200 de `POST /api/import`.
El humano recibe una pregunta retórica sobre zips y un enlace a la documentación
de `jszip`.

**Qué podría romperse sin que nadie se entere.** Nada se corrompe — el fichero no
se mueve y se puede reintentar. Lo que se rompe es **el producto**: este proyecto
decidió en la **F22** que un motivo falso es un bug, y aquí el motivo no es
falso, es *ajeno*. Bankinter es además el único banco binario y el único cuyo
parser no tiene guardián de formato: los cuatro de texto sí contestan bien
(ver §"Lo que sí está cubierto"). Y hay precedente directo: la prueba real de
Openbank del 2026-08-19 encontró justo esto — un fichero reguardado que produjo
un mensaje que mentía — y salió la F22.

**Y el resto de motivos de Bankinter tampoco están afirmados**, a diferencia de
los de N26 y MyInvestor:

- [`bankinter.parser.ts:59`](../../src/modules/bankinter/bankinter.parser.ts#L59)
  `'Bankinter statement has no worksheet'` — **sin test**: nunca se le pasa un
  `.xlsx` sin hojas.
- [`:69`](../../src/modules/bankinter/bankinter.parser.ts#L69) «header row not
  found» — el test solo comprueba la **clase** `ValidationError`, no el texto.
- Los cuatro motivos de fila (`fecha contable inválida`, `fecha valor inválida`,
  `importe no numérico`, `saldo no numérico`,
  [`:167`](../../src/modules/bankinter/bankinter.parser.ts#L167)-185) se
  comprueban a lo sumo con `stringContaining('importe')` /
  `stringContaining('saldo')`. Detalle revelador: N26 escribe `fecha de valor` y
  Bankinter escribe `fecha valor`; ninguna prueba puede ver esa divergencia.

**Gravedad: grave.** Probabilidad media-alta (basta una descarga cortada o un
"Guardar como" del Excel), coste = una tarde de diagnóstico contra un mensaje
que apunta al sitio equivocado.

---

## G3 — `describeError` del importador promete sanear y no sanea, y nadie lo comprueba

**Qué no está probado:** qué llega al cuerpo HTTP cuando el error **no** es un
`AppError`. No hay ni un test de `describeError` con un `Error` corriente.

**Evidencia.** [`import.service.ts:580`](../../src/modules/import/import.service.ts#L580)-592:

```
/**
 * ... Drive failures arrive already wrapped as a sanitized AppError; anything
 * else is reported generically so no internal detail (or token) can leak into
 * the report.
 */
function describeError(error: unknown): FileErrorReport {
  if (error instanceof AppError) { return { code: error.code, message: error.message } }
  if (error instanceof Error)    { return { code: 'INTERNAL_SERVER_ERROR', message: error.message } }
  return { code: 'INTERNAL_SERVER_ERROR', message: 'Unknown error' }
}
```

El **código** es el genérico; el **mensaje** pasa íntegro. El comentario dice
otra cosa. Es exactamente la asimetría que el `error-handler` sí resuelve y sí
tiene test: [`error-handler.ts:40`](../../src/plugins/error-handler.ts#L40)
responde `'Internal server error'` a secas, y
[`error-handler.test.ts:27`](../../src/plugins/error-handler.test.ts#L27) y
[`:96`](../../src/plugins/error-handler.test.ts#L96) prueban con un `Error`
llamado literalmente `'secret detail'` que no se filtra. Ese cuidado **no
existe** en la ruta del informe, que es la que viaja dentro de un **200**.

Los tres puntos de llamada son
[`:352`](../../src/modules/import/import.service.ts#L352) (Drive + disco),
[`:416`](../../src/modules/import/import.service.ts#L416) (producto) y
[`:461`](../../src/modules/import/import.service.ts#L461) (extracto). Lo único
que hay cerca es
[`import.service.test.ts:611`](../../src/modules/import/import.service.test.ts#L611)
(«sanitizes a download failure instead of leaking the token»), que pasa **porque
`downloadFileContent` ya envuelve en `DriveConnectionError`** — o sea, prueba la
primera rama, no la segunda.

**Qué podría romperse sin que nadie se entere.** Todo lo que no sea un
`AppError` sale por ahí: el error de `jszip` del G2, un fallo de Prisma con su
SQL y sus nombres de columna, un `EACCES`/`ENOSPC` con rutas absolutas de su
máquina. Y es una rama **sin ningún test**, así que si alguien la "arregla" en un
sentido o en el otro, nada se pone rojo.

**Gravedad: grave.** No por el riesgo de filtración (es un backend local de un
solo usuario), sino porque es **una promesa escrita que el código no cumple y que
ningún test sujeta** — la definición de hueco caro en este repositorio.

---

## G4 — El banco número 6 nace sin ningún guardián: las listas de bancos están escritas a mano

**Qué no está probado:** nada de lo que se le exige a un módulo de banco se
aplica solo. Las tres listas son literales.

**Evidencia.**

- [`architecture.test.ts:432`](../../src/architecture.test.ts#L432) y
  [`:438`](../../src/architecture.test.ts#L438):
  `const bankModules = ['bankinter', 'myinvestor', 'n26', 'openbank', 'trade-republic']`
  — repetida dos veces, escrita a mano. El test que existe justo al lado
  (inyección del registro, `:285`) **sí** deriva del disco con `readdirSync`, así
  que el patrón bueno ya está en el archivo.
- La prohibición de `toString('utf8')` de
  [`docs/conventions.md:285`](../../docs/conventions.md#L285) y del ADR-018 solo
  se comprueba **para N26 y sobre su propio archivo**:
  [`n26.statement.parser.test.ts:351`](../../src/modules/n26/n26.statement.parser.test.ts#L351)
  (`expect(parserSource).not.toContain("toString('utf8')")`). Bankinter,
  MyInvestor y Openbank no tienen ese test.
- Las aserciones de `normalizeBankName` cubren 3 slugs
  ([`drive-structure.test.ts:53`](../../src/lib/drive-structure.test.ts#L53)).

**Por qué esto no es teórico.** El sexto banco no es hipotético: el inventario
[`progress/explorations/inventario-bancos-2026-08-17.md:35`](inventario-bancos-2026-08-17.md#L35)
tiene a **Revolut** listo y bloqueado solo por una muestra vacía, y el
diagnóstico del 2026-08-20 ya ve un `.csv` suyo esperando en Drive. En cuanto
exista `src/modules/revolut/`, hereda: **cero** guardián de aislamiento entre
bancos, **cero** guardián de "no toca Prisma", **cero** comprobación de que
declara un decodificador estricto. Suite verde igual.

Hoy, comprobado a mano, los cuatro parsers de texto **sí** usan decodificador
estricto (`decodeUtf8Strict` en MyInvestor, N26 y Trade Republic;
`decodeCp1252Strict` + `detectResaveAsUtf8` en Openbank). O sea: la regla se
cumple **por memoria**, que es literalmente el problema que resolvieron la F14,
la F23 y la F24.

**Qué podría romperse sin que nadie se entere.** El F17 otra vez: acentos
convertidos en `U+FFFD` de forma irreversible, con el parse aparentemente
perfecto. Y acoplamiento silencioso entre módulos de banco, que es lo que el
ADR-020 existe para impedir.

**Gravedad: grave**, y con fecha: se cobra el día que entre Revolut. Arreglo
barato: sustituir los dos literales por `readdirSync(modules/)` filtrado, como ya
hace el test de `:285`.

---

# 🟠 Convienen

## C1 — El mensaje de IBAN duplicado **escupe el IBAN**, contra la doctrina escrita del propio repositorio

A un pelo de grave. [`src/lib/iban.ts:67`](../../src/lib/iban.ts#L67)-69 escribe
la regla con todas las letras:

> «The value is **NEVER** echoed in the reason: it is an account number, and this
> text ends up in an HTTP response and in the logs.»

Y [`accounts.service.ts:156`](../../src/modules/accounts/accounts.service.ts#L156)
hace:

```
throw new ConflictError(`An account with iban ${iban} already exists`)
```

Es el **único** sitio del código que echa un número de cuenta a un cuerpo HTTP y
al log. Los dos tests de 409 que existen
([`accounts.test.ts:230`](../../src/modules/accounts/accounts.test.ts#L230) y
[`:343`](../../src/modules/accounts/accounts.test.ts#L343)) afirman solo
`code: 'CONFLICT'`: ni sujetan el mensaje actual ni impedirían que mañana
alguien meta un IBAN en otro motivo.

**Por qué no lo pongo en graves:** quien recibe el 409 acaba de mandar ese mismo
IBAN en el cuerpo, así que no aprende nada nuevo. **Por qué sí conviene:** el
log no. Ese IBAN queda en la salida del servidor, que es justo lo que se pega en
un informe o en una issue — el miedo entero de la F14 y del ADR-017.

## C2 — Los mensajes que **desbloquean** al humano no tienen aserción de texto

Este proyecto trata los mensajes como producto; estos tres son literalmente
instrucciones de qué teclear, y ninguno está sujeto por un test:

- [`import.service.ts:156`](../../src/modules/import/import.service.ts#L156)-162
  — las dos ramas de `MISSING_ACCOUNT_DATA` («añade una línea `iban;<IBAN>` al
  principio de uno de sus ficheros, una vez»). Es lo que desatasca **un banco
  entero**. El *código* sí se afirma
  ([`import.service.test.ts:391`](../../src/modules/import/import.service.test.ts#L391)
  y [`:424`](../../src/modules/import/import.service.test.ts#L424)); el texto que
  enseña la sintaxis, no. Si esa sintaxis cambia, el mensaje sigue enseñando la
  vieja.
- [`import.local.service.ts:214`](../../src/modules/import/import.local.service.ts#L214),
  [`:222`](../../src/modules/import/import.local.service.ts#L222) y
  [`:229`](../../src/modules/import/import.local.service.ts#L229) — las
  variantes **en vacío** del 404 (`'ahí no hay ningún archivo'`, `'no hay ningún
  año con copia local'`, `'y no hay copia local de ningún banco'`). Las variantes
  *con* lista sí están probadas; las vacías no. Es exactamente el modo de fallo
  «te manda a mirar donde no es» que la F22 existe para impedir.
- [`import.service.ts:499`](../../src/modules/import/import.service.ts#L499) — el
  texto de `EMPTY_STATEMENT` promete «el archivo **NO** se ha movido a
  procesados/, así que puedes reintentarlo». El código sí se afirma; la promesa
  vive solo en la prosa.

## C3 — Un fallo de `readdir` que no sea `ENOENT` aborta una pasada local entera, en los cinco bancos

`bankinter.service.ts:83`, `myinvestor.service.ts:301`, `n26.service.ts:130`,
`openbank.service.ts:135` y `trade-republic.service.ts:223` comparten el mismo
`readDirSafe`: se traga el `ENOENT` (probado en los cinco: «does nothing when
there are no local copies») y **relanza** cualquier otro error. Esa segunda rama
**no tiene test en ninguno**. Un `EACCES`/`EPERM` sobre una carpeta de banco
—cosa nada exótica en Windows con un fichero abierto en Excel— tumba la pasada
completa en vez de aislarse por banco, que es la política declarada de todos los
demás fallos de este servicio.

## C4 — La plantilla `.json` de MyInvestor no tiene el guardián doc↔código que sí tiene Trade Republic

`trade-republic.docs.test.ts` (121 líneas) lee
`docs/trade-republic-product-files.md`, extrae sus bloques ```json y comprueba
que el parser los rechaza y que la plantilla del fixture y la del doc son la
misma. **No existe el equivalente para MyInvestor**, cuyo doc tiene dos
plantillas (A y B) con la misma disciplina de marcadores. Es el mecanismo que
haría el G1 imposible de reintroducir, y ya está escrito una vez.

## C5 — `lib/` es una puerta abierta a compartir código de parseo entre bancos

El guardián de aislamiento
([`architecture.test.ts:438`](../../src/architecture.test.ts#L438)) permite a
cualquier módulo de banco importar de `../../lib/`, sin lista blanca. Añadir
`lib/csv.ts` o `lib/html.ts` y usarlo desde dos bancos deja la suite en verde y
mata la regla central de [`docs/conventions.md:240`](../../docs/conventions.md#L240)
y del ADR-020: un cambio de formato de un banco pasa a ser una regresión de
todos. El test del árbol, además, «comprueba que un archivo existe, nunca que sea
el único» ([`architecture.test.ts:180`](../../src/architecture.test.ts#L180)).
Chequeable: ningún archivo de `lib/` importado por ≥2 módulos de banco salvo la
lista permitida (`parsed-statement`, `utf8`, `cp1252`, `iban`).

## C6 — La media regla de la F24 («entrecomilla el valor que devuelvas en un motivo») no la vigila nadie

[`docs/conventions.md:159`](../../docs/conventions.md#L159) se lo pide
explícitamente a quien escriba un parser nuevo. Si un motivo interpola un valor
del humano **sin comillas**, el guardián de privacidad no lo eleva a
`sources.data` y, si su trigrama cae entero dentro del vocabulario propio, lo
descarta de la comparación: el guardián de la F14 se queda ciego justo en la vía
de fuga para la que se construyó. Chequeable: escanear los literales de mensaje
de los `*.parser.ts` buscando `${…}` no encerrado en comillas.

## C7 — `GET /health/db` en rojo: la rama 503 no tiene test

[`health.routes.ts:22`](../../src/modules/health/health.routes.ts#L22)-24 tiene
su `catch` → 503 `{ status: 'error', database: 'down' }`. El test solo cubre el
200 ([`health.test.ts:27`](../../src/modules/health/health.test.ts#L27)). El
gemelo de Drive **sí** tiene su test de caída
([`health.test.ts:85`](../../src/modules/health/health.test.ts#L85)), con el
patrón de doble ya montado en el mismo archivo. Es la sonda que él mira cuando
algo va mal: que conteste bien *cuando va mal* es su único trabajo. Daño
acotado, arreglo de diez líneas copiando el de al lado.

## C8 — «Se guardó pero no se pudo mover»: la mitad no probada del ADR-025

Está muy bien probado que un fichero **no se mueve si falla** algo antes
([`import.service.test.ts:506`](../../src/modules/import/import.service.test.ts#L506)
y [`:544`](../../src/modules/import/import.service.test.ts#L544), R9 y R10). Lo
que **no** tiene test es el caso inverso: `persistMovements` termina bien y luego
falla `moveFileToProcessed` o `ensureFolder('procesados')`
([`import.service.ts:344`](../../src/modules/import/import.service.ts#L344)). El
`catch` de `importDriveFile` marca el fichero `failed` **aunque sus movimientos
ya estén en la base de datos**: el informe miente en esa línea. En
`drive-structure.test.ts`, `moveFileToProcessed` solo tiene el camino feliz
([`:391`](../../src/lib/drive-structure.test.ts#L391)).

El reintento no corrompe nada (la dedup parcial en base de datos absorbe la
segunda pasada, y el upsert de producto es idempotente), así que **no es grave**;
lo que falta es fijar por test que el reporte diga la verdad en ese caso, porque
hoy nada impide que alguien invierta el orden y reintroduzca justo el bug que el
diagnóstico del 2026-08-20 fue a buscar.

## C9 — El doc `data-model.md` y la tabla de errores de `api-contract.md` se copian a mano

Ningún test compara los dos bloques ```prisma de
[`docs/data-model.md`](../../docs/data-model.md) con `prisma/schema.prisma`
(el propio doc se declara derivado, `:111` y `:499`), ni la tabla de códigos de
[`docs/api-contract.md:48`](../../docs/api-contract.md#L48)-59 con las clases de
`src/errors/app-error.ts`. Los **invariantes** de la base sí están probados a
fondo (`investments.model.test.ts`, índices crudos incluidos); lo que se pudre en
silencio es **el documento**: precisión, nulabilidad, `NULLS NOT DISTINCT`, el
índice parcial de dedup. Y ese documento es lo que alguien lee antes de escribir
una migración. Los dos son comparaciones mecánicas de texto normalizado.

---

# ⚪ Opcionales

## O1 — Dos importaciones a la vez

No hay lock en `POST /api/import`
([`import.routes.ts:55`](../../src/modules/import/import.routes.ts#L55)) ni test
de concurrencia entre ejecuciones. **Lo bajo a opcional a propósito:** es una app
local de un solo usuario que lanza la importación a mano; los movimientos los
deduplica la base con el índice parcial, el producto es un upsert sobre clave
natural dentro de una transacción, y `ensureFolder` ya tiene lock intra-proceso
**con test** ([`drive-structure.test.ts:139`](../../src/lib/drive-structure.test.ts#L139),
R7). El peor caso realista es una copia cruda local escrita a medias por dos
`writeFile` simultáneos, y esa copia se reescribe en la pasada siguiente. Poco
daño posible.

## O2 — Ficheros enormes: sin paginación de Drive y sin límite de tamaño

Ninguna llamada sigue `nextPageToken`: `listBankFolders`, `listYearFolders` y
`listPendingFiles` usan `pageSize: 1000` a pelo
([`drive-structure.ts:365`](../../src/lib/drive-structure.ts#L365) y
siguientes). Tampoco hay tope de bytes: `downloadFileContent` trae el
`arraybuffer` entero a memoria y cada parser lo decodifica entero.

Va a opcional porque **está decidido y escrito**:
[`docs/architecture.md:508`](../../docs/architecture.md#L508) lo declara «límite
conocido (paginación) … suficiente para el uso previsto; revisitar si un año
acumula >1000 pendientes». El único matiz que sí me chirría: el truncado sería
**mudo**. Un `console`/warning cuando la página vuelve llena costaría una línea.

## O3 — La copia cruda se escribe con el nombre **crudo** de la carpeta de Drive

[`import.service.ts:344`](../../src/modules/import/import.service.ts#L344) hace
`join(rawCopyBaseDir, location.bank, location.year, location.name)` donde
`location.bank` es `bank.name` **sin normalizar** — mientras que la elección del
parser sí usa `normalizeBankName(bank.name)`. Lo mismo en
[`ingestion.service.ts`](../../src/modules/ingestion/ingestion.service.ts) (`processPending`).
`normalizeBankName` existe justamente para «neutralizar path traversal y comillas
por construcción», y tiene su test
([`drive-structure.test.ts:59`](../../src/lib/drive-structure.test.ts#L59), R14),
pero **no se aplica en la vía de escritura a disco** y nada lo comprueba.

Opcional: el atacante sería él mismo nombrando una carpeta de su propio Drive
`..`. Mecanismo real, riesgo nulo en la práctica. Lo dejo anotado porque la
defensa ya existe y no está enchufada.

## O4 — `console.warn` suelto y reglas de doc no mecanizables

- [`drive-structure.ts:180`](../../src/lib/drive-structure.ts#L180) llama a
  `console.warn`, contra [`docs/conventions.md:215`](../../docs/conventions.md#L215)
  («nunca `console.log`; se loguea con `fastify.log`»). `src/server.ts:14` sí es
  la excepción legítima y documentada. Un grep de una línea lo cerraría; el daño
  es una línea de log perdida. **C3 del CHECKPOINTS lo pide y nadie lo comprueba.**
- [`docs/data-model.md:653`](../../docs/data-model.md#L653): «`interestRate` es
  la TAE **en porcentaje**». Nada puede distinguir `0.03` de una TAE real del
  0,03 %. No es mecanizable; como mucho un aviso de plausibilidad.
- [`docs/data-model.md:48`](../../docs/data-model.md#L48) (regla 5): «un
  movimiento con `productId != null` no cuenta como gasto ni como ingreso» está
  documentado pero **no implementado** — `computeTotals` no lo excluye. Efecto
  hoy: cero, `productId` es siempre `null`. Nada se pondrá rojo el día que
  aparezca un escritor.
- ADR-006, umbral de reevaluar `@fastify/env`: nadie cuenta las variables. Daño
  mínimo.

## O5 — Motivos que solo se comprueban por el nombre de la variable, y `server.ts` sin ningún test

Un puñado de mensajes está afirmado con una regex tan laxa que dos ramas
distintas la satisfacen. No los subo de nivel porque el **código** de error sí se
comprueba en todos y el daño se limita a un texto impreciso:

- [`config/env.ts:116`](../../src/config/env.ts#L116)-118 — el test busca
  `/GOOGLE_DRIVE_ROOT_FOLDER_ID/`, que casa **igual** con el mensaje de "falta la
  variable" (`:109`) que con el de "el formato no vale". Las dos ramas son
  indistinguibles para la suite. Igual en `PORT` (`:71`) y `LOG_LEVEL` (`:85`),
  donde el rango y la lista de valores admitidos podrían derivar sin que nadie lo
  vea. El encabezado `Invalid environment configuration:` y sus viñetas —toda la
  UX de un arranque fallido— no se afirman nunca.
- `validateYear` ([`drive-structure.ts:99`](../../src/lib/drive-structure.ts#L99)
  y [`:103`](../../src/lib/drive-structure.ts#L103)) y `normalizeBankName`
  ([`:77`](../../src/lib/drive-structure.ts#L77)-85, tres reglas distintas): los
  tests recorren los casos con `toThrow(ValidationError)` a secas, así que un
  año `1999` y un año `abcd` podrían salir con la misma frase equivocada.
- `investments.service.ts:260`-264 — el mensaje de "un producto no cambia de
  tipo" se afirma por `/'fund'/`, pero **la parte accionable** («Cambia el
  `"name"` del archivo») no.
- `src/server.ts` no tiene ningún test: ni el fallo de config al arrancar
  ([`:11`](../../src/server.ts#L11)-15) ni el fallo de `listen`
  ([`:32`](../../src/server.ts#L32)-34). Es un archivo de 40 líneas sin lógica
  propia y probarlo obliga a interceptar `process.exit`; el coste supera al
  beneficio.

---

# Lo que SÍ está bien cubierto (para no tocarlo)

Esto no es relleno: es lo que **no** hay que rehacer.

- **`src/lib/drive.ts` — impecable.** Las cinco ramas de `driveErrorMessage`
  tienen test una por una, con su mensaje literal, más el test de que el texto
  crudo (con un token dentro) **no** se filtra
  ([`drive.test.ts:66`](../../src/lib/drive.test.ts#L66)-125). Aquí los mensajes
  de error se tratan como producto y se nota.
- **`src/lib/drive-structure.ts`** — 25 tests, incluidos concurrencia (R7),
  duplicados de carpeta (R8), convergencia tras fallo parcial (R13) y saneado de
  fallos (R12). Solo le falta la rama de fallo de `moveFileToProcessed` (C5).
- **`importPending`** — 30 tests, incluidos los tres casos de «cero movimientos»
  de la F25 con su código propio (`EMPTY_STATEMENT`, `ALL_ROWS_UNPARSED`), IBAN
  con espacios (F21), import parcial, ficheros sin parser, y el fallo de Drive de
  primer nivel. Es la parte mejor probada del repositorio.
- **`ingestion.service.ts`** — 9 tests, con fallo de descarga, fallo de escritura
  local, aislamiento por fichero e idempotencia.
- **`plugins/error-handler.ts`** — unitario + integración, con la prueba explícita
  de que un `Error` con `'secret detail'` no llega al cuerpo.
- **Los cuatro parsers de texto ante basura y ante fichero vacío** — sonda
  ejecutada: N26 y MyInvestor devuelven `VALIDATION_ERROR` («header row not
  found: not a recognizable statement») y Trade Republic devuelve
  `{"reason":"JSON inválido: …"}`. Los tres contestan bien. (Openbank contesta
  `UNEXPECTED_ENCODING` a un fichero de 0 bytes, lo cual es *defendible* pero
  diagnostica una codificación donde solo hay vacío; queda como matiz menor de
  G2, no como hueco propio.)
- **Códigos de error del importador** — pese a que las clases
  `EmptyStatementError`, `UnreadableStatementError` y `LocalCopyNotFoundError`
  no se nombran nunca en un test, sus **códigos** sí se afirman
  (`import.local.service.test.ts:287,304,323,334,345,355`,
  `import.service.test.ts:764,812`). Falsa alarma, no es un hueco.
- **ADRs con guardián vivo:** 004, 005, 006, 007, 008, 009, 010, 011, 012, 013,
  015, 017, 021, 023, 024, 025, 026 §5 y 027. La F27 en particular está probada
  por los dos lados, incluidos los guardianes demostrados en rojo.
- **`computeAccountBalance` / `computeTotals`** — con tests directos, no solo por
  ruta.
- **`src/lib/utf8.ts`** — es el estándar de referencia del repositorio en esto:
  los dos mensajes de `NotUtf8Error` se afirman hasta el byte ofensor (`0xD3`),
  el número de línea y la frase de remedio. Si algún día se generaliza el
  guardián de mensajes, el modelo está aquí.
- **`src/lib/iban.ts`** — los cinco motivos de rechazo afirmados uno a uno, más
  reafirmados a través de cuatro parsers y de la ruta de cuentas, con la regla de
  "nunca eco del valor" comprobada.
- **El guardián de codificación de Openbank** — el único que afirma también el
  **negativo**: `not.toContain('no se encuentra la cabecera')`, o sea, que el
  mensaje falso de la F22 no ha vuelto.
- **Funciones exportadas sin test directo pero ejercidas de verdad por la ruta
  que las llama:** `listAccounts`, `getAccountById`, `serializeAccount`,
  `listCategories`, `serializeCategory`, `listMovements`, `serializeMovement`,
  `resolveAccount`, `persistMovements`, `importStatement`, `importProductFile`,
  `selectProductAdapter`, `findFolder`, `createPrismaClient`. No son huecos.

---

# Método y límites de esta auditoría

1. Inventario de los 71 archivos de producción de `src/` (sin `generated/`) y de
   los 48 de test; cruce de **todos** los símbolos exportados contra su mención
   en cualquier `*.test.ts`, y revisión a mano de cada "no mencionado" para
   descartar la cobertura indirecta.
2. Lectura de `docs/verification.md` (los 4 niveles) y `CHECKPOINTS.md` (C4 y
   C4 bis) antes de juzgar nada.
3. Recorrido de `docs/conventions.md`, los ADR de `docs/architecture.md`,
   `docs/data-model.md`, `docs/api-contract.md`, `docs/dar-de-alta-un-banco.md`
   y las dos fichas de producto, contra lo que los tres guardianes
   (`architecture.test.ts`, `no-real-data.test.ts`,
   `trade-republic.docs.test.ts`) comprueban de verdad.
4. Barrido exhaustivo de **todos** los `throw` / `catch` / rama de error de
   `src/`, cruzando cada literal de motivo contra su aparición en los tests, para
   separar tres estados: *afirmado* (un test comprueba el motivo concreto),
   *alcanzado pero no afirmado* (el test llega a la rama pero solo mira la clase
   o el status) y *sin tocar*. Lo que sale arriba es el subconjunto de los dos
   últimos que puede hacer daño.
5. Dos sondas ejecutadas en el scratchpad sobre parsers **puros** (buffer vacío,
   buffer basura, plantilla con marcador), sin red, sin Drive y sin Prisma.

**Patrón que atraviesa casi todo lo anterior.** En este repositorio hay dos
niveles de rigor conviviendo: los módulos que afirman el **motivo literal**
(`utf8`, `iban`, `drive`, el guardián de Openbank, Trade Republic) y los que
afirman solo la **clase o el código** (`accounts`, `categories`, `env`,
`bankinter`, la mitad de MyInvestor). Los cuatro graves de esta auditoría están,
sin excepción, en el segundo grupo. No es casualidad: donde el motivo se afirma,
un motivo no puede mentir.

**Lo que esta auditoría NO ha hecho:** no ha ejecutado `pnpm test` (no hacía
falta: la suite está verde y el hueco de un test que no existe no se ve
ejecutando los que sí), no ha medido cobertura con instrumentación —
`@vitest/coverage-v8` **no está instalado** y añadirlo tocaría `package.json` y
el lockfile—, y no ha entrado a valorar si algún test sobra.
