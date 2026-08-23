# Resumen — feature 30 `myinvestor-template-marker-guard`

Fecha de cierre: 2026-08-23
Intención original: `feature_list.json` → feature `myinvestor-template-marker-guard`, bloque `intent`
Spec: no aplica (`"sdd": false`; mandan los 10 criterios de `acceptance`)

## Qué hace ahora la app que antes no

**Un `.json` de producto de MyInvestor con un campo sin rellenar deja de entrar en
silencio.** Si te dejas el marcador de la plantilla —`<nombre del producto, tal y como lo
llamas siempre>`— en el nombre, el archivo se **rechaza** y el motivo te dice **qué
campo** es. Antes entraba en verde y te creaba un producto llamado literalmente así.

Por qué importa justo el nombre: desde la feature 29 **el nombre es la identidad del
producto** en la base de datos. Un producto que entra a medio rellenar se queda ahí, y el
mes siguiente —ya con el nombre bueno— se te crea **otro** producto en vez de continuar el
mismo: la serie queda partida en dos y la primera foto colgando de un nombre que no
existe. Arreglarlo después es tocar filas a mano.

Y no era un riesgo teórico: **el 2026-08-15 subiste un archivo con los valores del
ejemplo y sobrevivió a una revisión humana**, porque eran valores legales, solo que
falsos. De ahí salieron los marcadores. Lo que faltaba era que alguien los comprobara en
este banco.

**También te avisa del marcador a medio borrar** (`"<nombre del producto"`, sin el `>`
final), que es la errata número uno al rellenar a mano y que hasta hoy también entraba en
verde. Es la misma comprobación que Trade Republic tiene desde la feature 28.

## Los expuestos eran dos, y está medido

El documento de este formato afirmaba que no hacía falta código nuevo «porque la propia
forma del marcador ya es inválida en los cuatro sitios». **Se comprobó campo por campo, y
era falso en dos.** Las 13 claves de tus dos plantillas, con marcador entero y con medio
marcador:

| Campos | Con el marcador puesto | Por qué |
| --- | --- | --- |
| `type` | ya se rechazaba | no es uno de los cuatro tipos admitidos |
| `date`, `openedAt`, `closedAt`, `maturityDate` | ya se rechazaba | no tiene forma `AAAA-MM-DD` |
| Los ocho importes (`invested`, `marketValue`, `gain`, `gainPercent`, `uninvestedCash`, `principal`, `interestRate`, `expectedGain`) | ya se rechazaba | un número escrito como texto no se interpreta jamás |
| **`name`** | **ENTRABA** | es texto libre: un marcador es una cadena válida |
| **`currency`** | **ENTRABA** | texto libre igual, con el mismo agujero |

La auditoría que descubrió esto solo señalaba el nombre; **`currency` apareció al medir**.
Los otros once se quedan como estaban a propósito: ya te rechazan, con su motivo de
siempre. Y esa medición está **congelada con un test**: si alguno dejara de rechazar, la
suite se pone roja antes de que el agujero vuelva por otro campo.

## Por dónde se usa (puntos de entrada)

Nada nuevo que aprender: es la misma vía de siempre.

- `POST /api/import` — subes tus `.json` como cada mes. Un archivo con un marcador sale en
  `failed[]` con su motivo, **no deja medio producto detrás y no se mueve a `procesados/`**;
  los demás archivos del lote entran igual.
- `POST /api/parser/myinvestor` — el ensayo, que sigue sin guardar nada: sirve para mirar
  qué ha entendido el sistema antes de que entre.

## Dónde está el código (para revisión directa)

> Los enlaces son clicables en la vista previa de Markdown de VS Code (o con
> Ctrl/Cmd + clic): saltan a la línea exacta.

### La comprobación

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Reconoce un marcador entero (`<…>`) | `isMarker` | [myinvestor.product.parser.ts:348](../../src/modules/myinvestor/myinvestor.product.parser.ts#L348) |
| Reconoce medio marcador: empieza por `<` o acaba en `>` | `isHalfErasedMarker` | [myinvestor.product.parser.ts:388](../../src/modules/myinvestor/myinvestor.product.parser.ts#L388) |
| Apunta el campo bajo el marcador que lleva | `collectMarker` | [myinvestor.product.parser.ts:401](../../src/modules/myinvestor/myinvestor.product.parser.ts#L401) |
| Las dos listas, separadas a propósito | `MarkerReport` | [myinvestor.product.parser.ts:357](../../src/modules/myinvestor/myinvestor.product.parser.ts#L357) |

### Dónde se llama (solo en los dos campos de texto libre)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| El nombre del producto | `readName` | [myinvestor.product.parser.ts:178](../../src/modules/myinvestor/myinvestor.product.parser.ts#L178) |
| La divisa | `readCurrency` | [myinvestor.product.parser.ts:200](../../src/modules/myinvestor/myinvestor.product.parser.ts#L200) |
| El motivo del marcador **entero**, primero de todo | — | [myinvestor.product.parser.ts:127](../../src/modules/myinvestor/myinvestor.product.parser.ts#L127) |
| El motivo del **medio** marcador, con el valor delante | — | [myinvestor.product.parser.ts:118](../../src/modules/myinvestor/myinvestor.product.parser.ts#L118) |

### Tests

| Qué cubre | Código |
| --- | --- |
| El caso exacto que la auditoría reprodujo: el marcador como nombre | [myinvestor.product.parser.test.ts:431](../../src/modules/myinvestor/myinvestor.product.parser.test.ts#L431) |
| El marcador a medio borrar, con el valor en el motivo | [myinvestor.product.parser.test.ts:455](../../src/modules/myinvestor/myinvestor.product.parser.test.ts#L455) |
| Los dos motivos van separados y en orden | [myinvestor.product.parser.test.ts:471](../../src/modules/myinvestor/myinvestor.product.parser.test.ts#L471) |
| `currency`, el otro campo medido como expuesto | [myinvestor.product.parser.test.ts:479](../../src/modules/myinvestor/myinvestor.product.parser.test.ts#L479) |
| Un `>` **en mitad** del nombre sigue entrando | [myinvestor.product.parser.test.ts:486](../../src/modules/myinvestor/myinvestor.product.parser.test.ts#L486) |
| Los otros once campos siguen rechazando con su motivo de siempre | [myinvestor.product.parser.test.ts:497](../../src/modules/myinvestor/myinvestor.product.parser.test.ts#L497) |
| No-regresión: los cuatro tipos entran igual | [myinvestor.product.parser.test.ts:521](../../src/modules/myinvestor/myinvestor.product.parser.test.ts#L521) |
| En la puerta del importador: no se crea el producto | [myinvestor.service.test.ts:556](../../src/modules/myinvestor/myinvestor.service.test.ts#L556) |

### Documentación

| Qué | Dónde |
| --- | --- |
| La frase que era falsa, corregida y explicada | [myinvestor-product-files.md:77](../../docs/myinvestor-product-files.md#L77) |
| Dos filas nuevas en «Qué pasa cuando un archivo está mal» | [myinvestor-product-files.md:278](../../docs/myinvestor-product-files.md#L278) |
| La norma: cada banco copia el patrón, no el módulo | [conventions.md:328](../../docs/conventions.md#L328) |

## Cumplimiento de la intención

- ✅ «Si subo un `.json` de producto con el marcador de la plantilla en el nombre, se
  rechaza y el motivo me dice el campo» → se cumple; verificado en
  `myinvestor.product.parser.test.ts:431` y, en la vía que escribe en la base de datos, en
  `myinvestor.service.test.ts:556`.
- ✅ «Mis 5 productos de MyInvestor siguen entrando exactamente igual que hoy» → se
  cumple; verificado con fixtures sintéticas de los cuatro tipos en
  `myinvestor.product.parser.test.ts:521`, **y con tus cinco archivos de verdad** en la
  pasada de lectura del revisor: 5 aceptados, 0 rechazados (1 fondo, 1 ETF, 1 cartera,
  2 depósitos).
- ✅ «Los productos que ya están en la base no se tocan ni hay que reimportar nada» → se
  cumple; no hay migración ni script, el cambio vive entero en un parser puro, y el
  recuento de tu base antes y después es idéntico: 4 cuentas, 455 movimientos, 6 productos,
  3 valoraciones, 1 foto.

## Decisiones que se tomaron por ti

- **(delegado) Qué campos entran en el alcance: `name` y `currency`, medidos uno a uno.**
  Los otros once ya se rechazaban solos, así que no se les toca el motivo. La medición se
  reprodujo entera en la revisión —99 casos, con el parser de antes y el de ahora— y salió
  exacta.
- **(delegado) La comprobación NO se comparte con Trade Republic: cada banco tiene la
  suya.** La feature 28 había dejado escrita la condición para reabrir esto («dos usuarios
  reales y la F29 cerrada, y solo si entonces sigue haciendo falta») y las dos primeras se
  cumplían hoy, así que la decisión se volvió a tomar. Se mantiene separada porque **la
  política diverge**: Trade Republic comprueba **todos** sus campos y MyInvestor solo los
  **dos** de texto libre. Lo compartible sería un predicado corto; lo que lleva el riesgo
  —a qué campos se aplica— seguiría siendo de cada banco. Queda escrito en
  `docs/conventions.md` que **el tercer banco con plantilla a mano copia el patrón y mide
  antes** cuáles de sus campos quedan expuestos.
- **(delegado) Sí cubre el marcador a medio borrar**, con la misma regla que la feature 28:
  cuenta si el valor **empieza por `<` o acaba en `>`**; el símbolo **en mitad no cuenta**.
- **(añadido, y conviene que lo sepas) El falso positivo asumido:** un nombre de producto
  que **empiece** por `<` o **termine** en `>` a propósito se rechazará, con un motivo que
  te dice qué hacer. Se buscaron nombres plausibles con esa forma y no apareció ninguno
  —los `<` y `>` de verdad salen en mitad del texto, en rangos y porcentajes, y esos
  entran—. El intercambio es deliberado: mejor rechazar de más con un mensaje claro que
  tragarse un marcador como identidad de un producto. Si algún día te estorba, cambias el
  nombre; para una serie partida en dos meses después no hay salida así de fácil.

## Qué NO se tocó / quedó fuera

- **Ningún otro banco.** El cambio vive en tres archivos, todos bajo
  `src/modules/myinvestor/`. Bankinter, N26, Openbank y Trade Republic no cambian ni una
  línea.
- **No escribes ni un campo nuevo**, `currency` sigue siendo opcional con `EUR` por
  defecto, y el parser **no adivina ni repara**: no te quita el símbolo para leer el resto.
- **Los motivos de los otros once campos no se han reescrito.** Un `<lo que vale hoy>` en
  `marketValue` sigue diciendo «se espera un número sin comillas», que es verdad aunque no
  nombre el marcador. El daño ahí es cero: el archivo se rechaza igual.
- **Sin migración, sin dependencia nueva y sin repaso de lo guardado.**

## Notas para el futuro

- **El borde declarado de la regla:** un marcador entero e **intacto en mitad** de un
  nombre ya tecleado (texto tuyo delante _y_ detrás) sigue entrando. Es el precio de que
  «el símbolo en mitad no cuenta», que es lo que deja pasar los nombres buenos con `<` o
  `>`. Es un caso poco realista —para llegar ahí hay que teclear alrededor del marcador
  sin borrarlo— y no bloqueó el cierre.
- **La cifra del informe estaba corta:** habla de «~10 líneas duplicadas» entre los dos
  bancos, y la duplicación real es de **~35 líneas**. La decisión de no compartir no
  depende del número, pero que conste la buena.
- **Lo que haría este agujero imposible de reintroducir**, y no se ha hecho: el guardián
  doc↔código que Trade Republic sí tiene (`trade-republic.docs.test.ts`), que lee la
  plantilla publicada en el documento y comprueba que el parser la rechaza. Hoy la
  plantilla del documento y la de los tests pueden separarse sin que nadie se entere. Es
  la continuación natural de esta feature (C4 de la auditoría del 2026-08-22).
- La misma auditoría dejó apuntados otros huecos de MyInvestor que esta feature no toca:
  la regla de desempate de `fichero (1).json`, los dos guardias de «no trae su valoración /
  sus condiciones» y el motivo «archivo de producto no interpretable», todos sin test
  aunque su gemelo de Trade Republic sí lo tenga.
