# trade-republic-product-file (F20) — implementación

> Feature SDD, spec **aprobado con cambios** el 2026-08-19 (los tres campos nuevos y el
> **cuadre aritmético que rechaza**). Los cuatro lotes de `tasks.md` los hizo un solo
> implementer, en orden B → A → C → D. **Las 25 tasks quedan `[x]`.**

## Archivos creados

| Archivo | Qué es |
|---|---|
| [`src/modules/trade-republic/trade-republic.types.ts`](../../src/modules/trade-republic/trade-republic.types.ts) | solo lo suyo: `ParsedSavingsAccount`, `TradeRepublicProductsResult`, sus `FailedFile`/`IgnoredFile` y sus resúmenes |
| [`src/modules/trade-republic/trade-republic.product.parser.ts`](../../src/modules/trade-republic/trade-republic.product.parser.ts) | parser puro de UN archivo; devuelve el motivo, no lanza; `checkBalanceEquation` en [:172](../../src/modules/trade-republic/trade-republic.product.parser.ts#L172) |
| [`src/modules/trade-republic/trade-republic.service.ts`](../../src/modules/trade-republic/trade-republic.service.ts) | recorrido, `decodeUtf8Strict`, encaminado por extensión, choque `(name,date)`, un `products.json` por año |
| [`src/modules/trade-republic/trade-republic.routes.ts`](../../src/modules/trade-republic/trade-republic.routes.ts) | `POST /trade-republic` bajo `/api/parser` |
| [`src/modules/trade-republic/trade-republic.fixture.ts`](../../src/modules/trade-republic/trade-republic.fixture.ts) | fixtures **sintéticos** en memoria + el texto literal de la plantilla |
| [`src/modules/trade-republic/trade-republic.product.parser.test.ts`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts) | 36 tests (R2, R7-R9, R11, R12, R17, R18) |
| [`src/modules/trade-republic/trade-republic.service.test.ts`](../../src/modules/trade-republic/trade-republic.service.test.ts) | 9 tests (R13-R15) |
| [`src/modules/trade-republic/trade-republic.routes.test.ts`](../../src/modules/trade-republic/trade-republic.routes.test.ts) | 5 tests (R16) |
| [`src/modules/trade-republic/trade-republic.docs.test.ts`](../../src/modules/trade-republic/trade-republic.docs.test.ts) | 11 tests sobre `docs/` (R1, R3, R4, R17) |
| [`docs/trade-republic-product-files.md`](../../docs/trade-republic-product-files.md) | la referencia del formato y el runbook: **es lo que él copia a Drive** |

## Archivos modificados

| Archivo | Cambio |
|---|---|
| [`src/app.ts:19`](../../src/app.ts#L19), [`:65`](../../src/app.ts#L65) | import + registro de la ruta. **No** entra en el registro de parsers del importador (no tiene extracto que importar) |
| [`src/architecture.test.ts:150`](../../src/architecture.test.ts#L150) | los 9 archivos del módulo, en la lista del guardián del árbol |
| [`src/architecture.test.ts:342`](../../src/architecture.test.ts#L342) | guardián nuevo: el módulo **no menciona `prisma`** |
| [`src/architecture.test.ts:359`](../../src/architecture.test.ts#L359) | `trade-republic` entra en `bankModules` del guardián de aislamiento |
| [`docs/architecture.md`](../../docs/architecture.md) | el árbol gana `modules/trade-republic/` + **ADR-024** |
| [`docs/api-contract.md:1253`](../../docs/api-contract.md#L1253) | §Parser de Trade Republic + `POST /api/parser/trade-republic` |
| [`docs/conventions.md:208`](../../docs/conventions.md#L208) | §Parsers de banco: un banco puede entrar **solo por archivo escrito a mano** |
| [`docs/roadmap.md`](../../docs/roadmap.md) | E4 pasa a **5 de 6 bancos** y la fila de Trade Republic pasa a ✅ con su nota de provisionalidad |
| [`specs/trade-republic-product-file/tasks.md`](../../specs/trade-republic-product-file/tasks.md) | 25 tasks marcadas `[x]` |

---

## Trazabilidad `R<n>` → test

Los **16 requirements vivos** (R6 y R10 están retirados y fusionados en R5 y R9; sus
números no se reutilizan).

| R | Qué exige | Test |
|---|---|---|
| **R1** | plantilla publicada, todos los valores `<…>`, ninguno copiable | [`docs.test.ts:26`](../../src/modules/trade-republic/trade-republic.docs.test.ts#L26), [`:30`](../../src/modules/trade-republic/trade-republic.docs.test.ts#L30), [`:43`](../../src/modules/trade-republic/trade-republic.docs.test.ts#L43), [`:49`](../../src/modules/trade-republic/trade-republic.docs.test.ts#L49) |
| **R2** | la plantilla copiada sin rellenar se rechaza nombrando **todos** los campos | [`parser.test.ts:77`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L77), [`:87`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L87), [`:94`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L94), [`:103`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L103) — y [`docs.test.ts:43`](../../src/modules/trade-republic/trade-republic.docs.test.ts#L43) ata la plantilla del test a la publicada |
| **R3** | enlaza a `myinvestor-product-files.md`, no reescribe sus reglas | [`docs.test.ts:81`](../../src/modules/trade-republic/trade-republic.docs.test.ts#L81), [`:85`](../../src/modules/trade-republic/trade-republic.docs.test.ts#L85) |
| **R4** | provisionalidad escrita en la plantilla **y** en el roadmap | [`docs.test.ts:91`](../../src/modules/trade-republic/trade-republic.docs.test.ts#L91), [`:98`](../../src/modules/trade-republic/trade-republic.docs.test.ts#L98), [`:105`](../../src/modules/trade-republic/trade-republic.docs.test.ts#L105) |
| **R5** | módulo aislado (ni otro banco, ni importadores externos salvo `app.ts`) y **sin `prisma`**; sin tocar el esquema | [`architecture.test.ts:342`](../../src/architecture.test.ts#L342) (prisma), [`:358`](../../src/architecture.test.ts#L358) (aislamiento e importadores), [`:39`](../../src/architecture.test.ts#L39) (árbol), [`routes.test.ts:127`](../../src/modules/trade-republic/trade-republic.routes.test.ts#L127) (fuera del registro del importador) |
| **R7** | los nueve campos, **tal cual escritos**, sin calcular ni redondear | [`parser.test.ts:30`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L30), [`:50`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L50), [`:64`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L64), [`:69`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L69) |
| **R8** | campos obligatorios que faltan, **todos** por su nombre | [`parser.test.ts:111`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L111), [`:125`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L125), [`:131`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L131), [`:142`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L142) |
| **R9** | número como texto, coma decimal, no-número, fecha mala, `type` no admitido | [`parser.test.ts:154`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L154), [`:160`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L160), [`:168`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L168), [`:180`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L180), [`:187`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L187), [`:193`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L193), [`:200`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L200), [`:206`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L206) |
| **R11** | claves desconocidas por su nombre; las `_` no fallan | [`parser.test.ts:215`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L215), [`:223`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L223), [`:233`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L233) |
| **R12** | varios problemas → **un solo motivo** | [`parser.test.ts:242`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L242) (cinco problemas distintos en un `reason`) |
| **R13** | recorrido de `<año>/`, `.json`, **un** `products.json` por año | [`service.test.ts:40`](../../src/modules/trade-republic/trade-republic.service.test.ts#L40), [`:77`](../../src/modules/trade-republic/trade-republic.service.test.ts#L77), [`:93`](../../src/modules/trade-republic/trade-republic.service.test.ts#L93), [`:110`](../../src/modules/trade-republic/trade-republic.service.test.ts#L110), [`:123`](../../src/modules/trade-republic/trade-republic.service.test.ts#L123) (UTF-8 estricto de la F17) |
| **R14** | el `.pdf` va a `ignored[]`, **no** es fallo | [`service.test.ts:140`](../../src/modules/trade-republic/trade-republic.service.test.ts#L140), [`:200`](../../src/modules/trade-republic/trade-republic.service.test.ts#L200) |
| **R15** | un `.json` roto se aísla en `failed[]` y el resto se parsea igual | [`service.test.ts:158`](../../src/modules/trade-republic/trade-republic.service.test.ts#L158), [`:187`](../../src/modules/trade-republic/trade-republic.service.test.ts#L187) (choque `(name,date)`) |
| **R16** | `POST /api/parser/trade-republic` → `200`, también con fallos dentro | [`routes.test.ts:45`](../../src/modules/trade-republic/trade-republic.routes.test.ts#L45), [`:79`](../../src/modules/trade-republic/trade-republic.routes.test.ts#L79), [`:102`](../../src/modules/trade-republic/trade-republic.routes.test.ts#L102), [`:114`](../../src/modules/trade-republic/trade-republic.routes.test.ts#L114) (registrada en la app real) |
| **R17** | el cuadre **rechaza**, con desviación con signo, esperado vs escrito y los cinco campos | [`parser.test.ts:264`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L264), [`:270`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L270), [`:283`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L283), [`:327`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L327) (`moneyIn` sin intereses); documentado: [`docs.test.ts:67`](../../src/modules/trade-republic/trade-republic.docs.test.ts#L67), [`:74`](../../src/modules/trade-republic/trade-republic.docs.test.ts#L74) |
| **R18** | céntimos enteros, tolerancia 1 céntimo, y **no se evalúa** con datos incompletos | [`parser.test.ts:289`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L289), [`:297`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L297), [`:303`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L303), [`:310`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L310), [`:320`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L320), [`:349`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L349) |

## Trazabilidad de los 10 criterios de `acceptance`

| # | Criterio (abreviado) | Test |
|---|---|---|
| 1 | plantilla con **todos** los valores `<…>`, nada copiable | [`docs.test.ts:30`](../../src/modules/trade-republic/trade-republic.docs.test.ts#L30) + [`parser.test.ts:77`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L77) |
| 2 | NO duplica las reglas de escritura de MyInvestor: enlaza | [`docs.test.ts:81`](../../src/modules/trade-republic/trade-republic.docs.test.ts#L81) |
| 3 | módulo propio, **sin** reutilizar el parser de MyInvestor | [`architecture.test.ts:358`](../../src/architecture.test.ts#L358) + [`:39`](../../src/architecture.test.ts#L39) |
| 4 | decisión delegada resuelta **por escrito** (campos y forma/tipo) | ADR-024 §3 y §5 en [`docs/architecture.md`](../../docs/architecture.md); ejecutable en [`types.ts`](../../src/modules/trade-republic/trade-republic.types.ts) + [`architecture.test.ts:358`](../../src/architecture.test.ts#L358) |
| 5 | entra por la ingesta que ya existe, sin paso nuevo del humano | [`service.test.ts:40`](../../src/modules/trade-republic/trade-republic.service.test.ts#L40) (lee de `<sourceBaseDir>/trade-republic/<año>/`, que es donde deja la ingesta) + [`routes.test.ts:114`](../../src/modules/trade-republic/trade-republic.routes.test.ts#L114) |
| 6 | motivos por su nombre y **todos de golpe** | [`parser.test.ts:242`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L242), más R8/R9/R11 |
| 7 | no toca Prisma ni persiste nada | [`architecture.test.ts:342`](../../src/architecture.test.ts#L342); `git status` no toca `prisma/` |
| 8 | provisionalidad escrita en la plantilla **y** en el roadmap | [`docs.test.ts:91`](../../src/modules/trade-republic/trade-republic.docs.test.ts#L91), [`:98`](../../src/modules/trade-republic/trade-republic.docs.test.ts#L98) |
| 9 | existe `POST /api/parser/trade-republic`, encaminado por extensión | [`routes.test.ts:45`](../../src/modules/trade-republic/trade-republic.routes.test.ts#L45) + [`service.test.ts:140`](../../src/modules/trade-republic/trade-republic.service.test.ts#L140) |
| 10 | fixtures sintéticos, sin red; `./init.sh` verde con el guardián F14 **activo** | ver §Verificaciones ejecutadas |

---

## Decisiones tomadas (y las dos donde me aparté de la letra del spec)

1. **La plantilla lleva los marcadores de los importes ENTRE COMILLAS.** El
   `requirements.md` §Procedencia de R2 daba por hecho que «no hace falta código nuevo:
   `<…>` ya es inválido». **Comprobado que no es así en dos sitios**, y los dos se
   arreglan aquí:
   - Si los marcadores numéricos van sin comillas (como en la plantilla de MyInvestor),
     la plantilla **no es JSON válido** y `JSON.parse` muere en el primer marcador: el
     motivo sería «JSON inválido» y **no nombraría ningún campo**, que es justo lo que
     R2 exige. Con las comillas, la plantilla entera se parsea y se nombran los diez.
     El propio marcador dice «número SIN comillas, quítalas al rellenar», y hay
     [test](../../src/modules/trade-republic/trade-republic.docs.test.ts#L43) que ata la
     plantilla publicada a la que el parser recibe.
   - **`name` es la trampa:** un marcador *es* una cadena no vacía perfectamente válida,
     así que sin una comprobación explícita la cuenta habría entrado llamándose
     `<cómo llamas tú a esta cuenta>` — **el accidente exacto del 2026-08-15** que los
     marcadores existen para evitar. Por eso el parser reconoce la forma de marcador
     (`isMarker`, [`parser.ts:221`](../../src/modules/trade-republic/trade-republic.product.parser.ts#L221))
     y los reporta juntos, en el **primer** trozo del motivo. No es un requirement nuevo:
     es lo que hace falta para cumplir R2 al pie de la letra.
2. **El ADR es el 024, no el 019.** `design.md` §4 y `tasks.md` T20 piden «ADR-019», pero
   ese número lo ocupa la feature 16 y 020-023 las features 18, 21, 22 y 19, todas
   cerradas después de redactarse el spec. Se usa el siguiente libre y queda una **nota
   de numeración** al final del ADR, con el mismo criterio que ya usó la F19.
3. **El roadmap pasa a «5 de 6 bancos», no a «3 de 6»** como decía T4: cuando se escribió
   el spec iban 2 bancos; hoy son 4 cerrados (Bankinter, MyInvestor, N26, Openbank) más
   este. La intención de la task —dejar el estado real y la nota de provisionalidad— se
   cumple con el número correcto.
4. **La plantilla NO trae ningún ejemplo relleno**, ni siquiera inventado, para que el
   guardián de R1 pueda ser tajante («todo valor de todo bloque `json` es un `<…>`»). El
   ejemplo aritmético va en prosa, con números redondos.
5. **`closedAt` también es un marcador** en la plantilla (`<null mientras la cuenta siga
   viva; …>`), no un `null` literal: si fuera `null`, el guardián de R1 tendría que
   admitir una excepción y la excepción es por donde se cuela el siguiente valor real.
6. **El volcado del año solo se escribe si el año tiene algún `.json`** (mismo criterio
   que MyInvestor): un año con solo el `.pdf` no genera `products.json` vacío.
7. **`decodeUtf8Strict`, no `readFile(…, 'utf8')`** ([`service.ts:129`](../../src/modules/trade-republic/trade-republic.service.ts#L129)):
   este banco **no hereda** la divergencia de MyInvestor (ver sugerencias).

---

## Verificaciones ejecutadas

**Nada de lo que dice este informe está deducido: todo está ejecutado y pegado.**

### `./init.sh` completo (23:00)

```
── 4. Type checking (tsc) ──────────────────────────────
[OK]    Type check OK (tsc sin errores)
── 5. Ejecutando tests ─────────────────────────────────
[no-real-data] THE COMPARISON LAYER DOES NOT WATCH: trade-republic
[no-real-data]   a value copied from that bank into the repository is caught by NOTHING: it has to be checked by hand.
[no-real-data]   why, and how each one closes: `unwatchedBanks` in src/no-real-data.test.ts

 Test Files  43 passed (43)
      Tests  721 passed (721)
[OK]    Todos los tests pasan
[OK]    Entorno listo. Puedes empezar a trabajar.
```

- **721 tests, 0 saltados.** Baseline antes de tocar nada: **659** (verificada al
  arrancar la sesión). **+62**: 36 del parser, 9 del servicio, 5 de la ruta, 11 de los
  docs, y **+1** guardián nuevo en `architecture.test.ts` (el de `prisma`).
- **Las 3 líneas de aviso del guardián de la F14 sobre `trade-republic` NO cambian.**
  Son las mismas, palabra por palabra, antes y después: esta feature **no** hace que el
  `.json` aterrice en `var/drive-read/trade-republic/` (ahí sigue habiendo solo el
  `.pdf`, que es binario ilegible), así que la entrada de `unwatchedBanks` **sigue
  siendo correcta y no se ha tocado**. Se borrará el día que el humano suba su primer
  `.json` a Drive y la ingesta lo baje; ese día el test **falla hasta que se borre**, que
  es como está diseñado.

### Guardián de datos reales, con su capa de comparación **activa**

```
$ npx vitest run src/no-real-data.test.ts
 Test Files  1 passed (1)
      Tests  24 passed (24)
```

**24 passed, 0 skipped**: las dos capas de comparación contra `var/` corrieron (si
faltara una rama de `var/`, esos dos tests saldrían `skipped` y el recuento lo diría).
Ni un dato real en archivo versionado, fixtures sintéticos en memoria y **ni un
`no-real-data-ok` nuevo** (`git diff` no añade ninguno).

### Los dos mensajes que ve el humano, impresos de verdad

Ejecutado con `npx tsx` sobre el parser ya compilado por el proyecto, no reconstruido a
mano:

```
--- DESCUADRE ---
{
  "reason": "los importes no cuadran: se desvía +100.00 € (saldo final esperado 4006.40, escrito 4106.40); saldo inicial + entradas - salidas + intereses = saldo final; openingBalance 4000.00, moneyIn 0.00, moneyOut 0.00, interest 6.40, balance 4106.40"
}
--- PLANTILLA SIN RELLENAR ---
{
  "reason": "campos sin sustituir, siguen con el marcador <…> de la plantilla: type, name, date, openedAt, closedAt, openingBalance, moneyIn, moneyOut, balance, interest"
}
```

El primero es **literalmente** el `reason` que publica
[`docs/api-contract.md`](../../docs/api-contract.md#L1253) en su `failed[]` de ejemplo:
se copió de esta salida, no al revés. El segundo nombra los **diez** campos de la
plantilla.

### Lint y formato

```
$ pnpm run lint      → oxlint, sin hallazgos
$ npx prettier --check src/modules/trade-republic/** src/app.ts src/architecture.test.ts
   (verde tras `--write` sobre dos tests; el resto ya estaba formateado)
```

---

## Sugerencias fuera de scope (NO aplicadas)

1. **MyInvestor sigue leyendo sus `.json` con `readFile(…, 'utf8')`**
   ([`myinvestor.service.ts:132`](../../src/modules/myinvestor/myinvestor.service.ts#L132)),
   sin el UTF-8 estricto de la F17. Trade Republic **no hereda** esa divergencia (usa
   `decodeUtf8Strict`), pero la de MyInvestor sigue ahí: un archivo suyo guardado en
   cp1252 pierde los acentos en silencio. Es una línea, y ya está anotada en
   `decisions.md` §Incoherencias.
2. **El árbol de `docs/architecture.md` no lista `modules/n26/` ni `modules/openbank/`**:
   se quedaron sin añadir en las F18 y F19. Yo he añadido el mío (era mi task T20) y no
   he tocado los suyos. Son ~14 líneas de documentación.
3. **`FailedFile` / `IgnoredFile` están ahora declarados por cuadruplicado**
   (`ingestion`, `myinvestor`, `n26`, `openbank` y este). Sacarlos a `src/lib/` es un
   refactor transversal que el `design.md` §3b descarta expresamente para esta feature.
   Cuando entre el **tercer** banco por `.json` escrito a mano, toca revisar esto y el
   contrato común de producto a la vez.
4. **`normalizeBankName('Trade Republic')`** no está comprobado en el guardián que sí
   comprueba MyInvestor, N26 y Openbank
   ([`architecture.test.ts:419`](../../src/architecture.test.ts#L419)). El nombre de su
   carpeta de Drive lleva un espacio, así que es el caso más interesante de los cuatro;
   no lo he añadido porque no está en ninguna task ni requirement.
