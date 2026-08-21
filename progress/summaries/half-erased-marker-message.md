# Resumen — feature 28 `half-erased-marker-message`

Fecha de cierre: 2026-08-21
Intención original: `feature_list.json` → feature `half-erased-marker-message`, bloque `intent`
Spec: no tiene (`"sdd": false`); mandan sus 10 criterios de `acceptance`

## Qué hace ahora la app que antes no

Si al rellenar la plantilla de Trade Republic te dejas **medio corchete** de un marcador
—`"<2026-08-01"` en vez de `2026-08-01`—, el archivo ahora te dice **eso mismo**: que te
dejaste un símbolo suelto, en qué campo, y con el valor delante para que veas el carácter
que sobra. Antes te decía «fecha inválida, se espera el formato AAAA-MM-DD», que era
verdad y te mandaba a mirar el formato, que estaba bien: por eso el `<` de `openedAt`
sobrevivió a una corrección entera el 2026-08-20.

Vale para **los once campos** de la plantilla, no solo las fechas: un importe con el
corchete pegado (`"<4006.40"`, `"0>"`) también se dice por su nombre en vez de «se espera
un número». El archivo se rechaza igual que antes —**no te lo arregla ni adivina el
valor**—; lo único que cambia es el motivo.

## Por dónde se usa (puntos de entrada)

- `POST /api/parser/trade-republic` — parsea los `.json` de la carpeta de Trade Republic y
  te devuelve, por archivo, el producto o el motivo del rechazo:
  [`trade-republic.routes.ts:41`](../../src/modules/trade-republic/trade-republic.routes.ts#L41).
- `POST /api/import` — la ingesta de siempre; el mismo parser, el mismo motivo.
- El motivo se compone entero en
  [`trade-republic.product.parser.ts:47`](../../src/modules/trade-republic/trade-republic.product.parser.ts#L47)
  (`parseTradeRepublicProduct`), que sigue reportando **todos** los problemas del archivo
  de golpe, en un solo viaje.

## Dónde está el código (para revisión directa)

### La detección del marcador a medio

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Decide si un valor es medio marcador: tras `trim()`, empieza por `<` o acaba en `>` y no es un marcador entero | `isHalfErasedMarker` | [trade-republic.product.parser.ts:277](../../src/modules/trade-republic/trade-republic.product.parser.ts#L277) |
| El de siempre: el marcador **entero** `<…>` (R2 de la F20), sin tocar | `isMarker` | [trade-republic.product.parser.ts:231](../../src/modules/trade-republic/trade-republic.product.parser.ts#L231) |
| Archiva cada campo en la lista que le toca y dice al lector que pare | `collectMarker` | [trade-republic.product.parser.ts:290](../../src/modules/trade-republic/trade-republic.product.parser.ts#L290) |
| Las dos listas separadas a propósito: entero y a medio son erratas distintas | `MarkerReport` | [trade-republic.product.parser.ts:240](../../src/modules/trade-republic/trade-republic.product.parser.ts#L240) |

### El mensaje y su orden dentro del motivo único

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Texto del motivo nuevo, con el campo **y el valor recibido** | (dentro de `parseTradeRepublicProduct`) | [trade-republic.product.parser.ts:94](../../src/modules/trade-republic/trade-republic.product.parser.ts#L94) |
| Orden: marcador entero → a medio → faltan campos → el resto → el cuadre | (los `unshift` consecutivos) | [trade-republic.product.parser.ts:86](../../src/modules/trade-republic/trade-republic.product.parser.ts#L86) |

### Los lectores de campo, que ahora preguntan por el marcador antes de validar

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| `type` | `readType` | `trade-republic.product.parser.ts` → `readType` |
| `name` (texto libre; se le aplica la misma regla) | `readName` | `trade-republic.product.parser.ts` → `readName` |
| `currency` | `readCurrency` | `trade-republic.product.parser.ts` → `readCurrency` |
| Los cinco importes | `readNumberField` | `trade-republic.product.parser.ts` → `readNumberField` |
| `date`, `openedAt`, `closedAt` | `readIsoField` | `trade-republic.product.parser.ts` → `readIsoField` |

### Tests

| Qué cubre | Código |
| --- | --- |
| El caso exacto del 2026-08-20 (dos fechas con el `<`), y que ya no dice «fecha inválida» | [trade-republic.product.parser.test.ts:111](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L111) |
| El símbolo de cierre olvidado, no solo el de apertura | `catches the closing symbol left behind…` |
| Cualquier campo: importes, `type`, `name`, `currency` | `works on ANY field…` / `works on the text fields too…` |
| Que no adivina ni repara, y que el cuadre no se apila encima | `NEITHER guesses NOR repairs…` |
| El símbolo **en medio** de un nombre no cuenta: ese nombre entra | `does NOT count the symbol in the MIDDLE…` |
| El nombre que **abre** con el símbolo se rechaza (trade-off aceptado) | `rejects a free-text name that OPENS…` |
| El mensaje del marcador **entero**, intacto y aparte, en el mismo archivo | `keeps the WHOLE-marker message intact and apart…` |
| No-regresión: fecha imposible, número con letras, texto donde va número | [trade-republic.product.parser.test.ts:214](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L214) |
| Guardián de la documentación (fila de la tabla + nota) | [trade-republic.docs.test.ts:80](../../src/modules/trade-republic/trade-republic.docs.test.ts#L80) |

### Documentación

| Qué dice | Dónde |
| --- | --- |
| Fila nueva de «qué pasa cuando un archivo está mal» | `docs/trade-republic-product-files.md:196` |
| Qué cuenta, qué no, y que el parser no lo arregla | `docs/trade-republic-product-files.md:206-214` |

## Cumplimiento de la intención

- ✅ «Si dejo un corchete de la plantilla en un campo, el error me dice que es un marcador
  a medio sustituir y me nombra el campo» → se cumple, y además te enseña el valor.
  Verificado en `trade-republic.product.parser.test.ts:111` y `:125`, y comprobado por el
  revisor con 31 casos propios (espacios, saltos de línea y valores de un solo carácter
  incluidos).
- ✅ «Un valor que de verdad está mal escrito me sigue diciendo lo que dice hoy» → se
  cumple, con los literales exactos. Verificado en
  `trade-republic.product.parser.test.ts:214-237`.
- ✅ «Vale para todos los campos, no solo las fechas» → se cumple en los once campos de la
  plantilla. Verificado en `works on ANY field…` y `works on the text fields too…`.
- ✅ «Que lo rechace y me lo diga, sin adivinar ni arreglar» → se cumple: no sale ningún
  producto. Verificado en `NEITHER guesses NOR repairs…`.
- ✅ «No perder el mensaje del marcador entero» → intacto, y convive con el nuevo sin
  mezclarse. Verificado en `keeps the WHOLE-marker message intact and apart…` más los
  cuatro tests de la F20, sin tocar.
- ✅ «Que no afecte a los otros bancos» → ni una línea fuera de
  `src/modules/trade-republic/`; sus suites siguen verdes.

## Decisiones que se tomaron por ti

- **(delegado) Qué cuenta como marcador a medio**: un valor que, quitando espacios,
  **empieza por `<` o acaba en `>`**. El símbolo **en medio no cuenta** (`Ahorro 3 > 2`
  entra sin problema), porque borrar un delimitador siempre deja el otro en un extremo y
  el interior es el único sitio donde un texto lo lleva de verdad.
- **(delegado) El nombre de la cuenta no se exceptúa**: si lo escribes empezando por `<` o
  acabando en `>`, se rechaza aunque lo quisieras así. Se prefiere rechazar de más con un
  motivo que se entiende —renombras la cuenta— antes que dejar entrar un marcador **como
  nombre de tu cuenta**, que es el accidente del 2026-08-15. Está dicho en el documento
  que lees.
- **(delegado) El mensaje sustituye, no se suma**: el «fecha inválida» de ese campo
  desaparece, porque era justo la frase que te mandaba al sitio equivocado.
- **(delegado) Vive solo en el parser de Trade Republic**, no en un sitio común:
  MyInvestor no tiene esta pieza y la norma es un parser por banco. Se comparte el día que
  haga falta de verdad, no antes.

## Qué NO se tocó / quedó fuera

- Ni la base de datos, ni el esquema, ni el importador, ni `src/app.ts`.
- Ni el parser de MyInvestor, ni los de Bankinter, N26 u Openbank.
- El mensaje del marcador **entero** se dejó exactamente como estaba, por encargo.

## Notas para el futuro

1. **La plantilla de MyInvestor tiene el mismo agujero, y desde la F29 cuesta más caro.**
   Su parser solo exige que el nombre sea «texto no vacío», así que un marcador entero
   podría entrar **como nombre de un producto** — y desde la F29 eso ya no se queda en un
   volcado: se guarda en la base de datos. Merece feature propia, y sería el segundo
   usuario que justificaría mover esta lógica a `src/lib/template-marker.ts`.
2. **Dos formas de dejarse el símbolo que siguen sin decirse por su nombre**, ambas fuera
   del encargo: el símbolo residual **en medio** del valor (`"2026<-08-31"`), y el valor
   escrito **conservando los dos corchetes** (`"<2026-08-31>"`), que se reporta como campo
   «sin sustituir» aunque sí lo rellenaste.
3. `docs/plantillas/trade-republic-cuenta-remunerada.json` apareció **borrado del disco**
   sin motivo conocido y hubo que restaurarlo desde git. Si vuelve a pasar, hay algo que
   lo borra y conviene saber qué.
