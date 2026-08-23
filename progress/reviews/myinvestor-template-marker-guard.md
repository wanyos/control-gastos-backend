# Review — feature 30 `myinvestor-template-marker-guard`

Fecha: 2026-08-23 · Revisor: `reviewer` · Estado revisado: `in_progress`
Informe revisado: [`implementations/myinvestor-template-marker-guard.md`](../implementations/myinvestor-template-marker-guard.md)

## Lo que se ha ejecutado, no leído

- **Sonda propia de campos expuestos**, escrita por el revisor y ejecutada fuera de la
  suite, contra el parser **de antes** (`git show HEAD:…`) y contra el **de ahora**:
  las **13 claves** de las dos plantillas × 3 formas de marcador (entero, `<` suelto,
  `>` suelto) × los tres esqueletos (plantilla A `fund`, A `managed_portfolio`,
  B `deposit`) = **99 casos**. Tabla abajo.
- **19 nombres candidatos** contra el parser nuevo, buscando el falso positivo y el
  marcador que se cuela. Tabla abajo.
- **Pasada real de lectura** sobre los `.json` de producto que el humano tiene en
  `var/drive-read/myinvestor/2026/`. Solo lectura, sin base de datos y sin red.
- `./init.sh` completo: **tsc sin errores, 48 archivos / 890 tests en verde**,
  `[OK] Entorno listo`.
- **Recuento de su base antes y después** de todo lo anterior (incluida la suite
  entera), con el cliente de `src/lib/prisma.ts`.

Ni un archivo del implementer tocado. Los scripts del revisor vivieron fuera del
repositorio y se borraron; el guardián `no-real-data.test.ts` los detectó mientras
estuvieron dentro, que es exactamente su trabajo.

---

## 1. La medición de campos expuestos — **cierta, y completa**

Dice que solo `name` y `currency` estaban expuestos. **Se ha reproducido campo por
campo, incluidos los específicos del depósito**, y es exacto.

Parser **de antes** (`HEAD`), los que ENTRABAN en verde:

| Esqueleto | Campos que entraban con marcador |
| --- | --- |
| A `fund` / A `managed_portfolio` | `name`, `currency` — y solo esos dos |
| B `deposit` | `name`, `currency` — y solo esos dos |

Las otras once (`type`, `date`, `openedAt`, `closedAt`, `invested`, `marketValue`,
`gain`, `gainPercent`, `uninvestedCash`, `principal`, `interestRate`, `expectedGain`,
`maturityDate`) rechazaban **ya entonces**, con las tres formas de marcador, por su
propia validación. Parser **de ahora**: los 99 casos rechazan, y esas once siguen
dando su motivo de siempre, sin reescribir.

Dos cosas que conviene decir en su favor:

- La auditoría del §G1 solo señalaba `name`. **`currency` lo encontró él midiendo**,
  y lo metió en el alcance aplicando el criterio literal que el humano fijó («todo
  campo de texto libre que aparezca entra en el alcance»). Es medición, no herencia.
- El test `«leaves the reasons of the other fields exactly as they were»`
  ([parser.test.ts:497](../../src/modules/myinvestor/myinvestor.product.parser.test.ts#L497))
  **congela** la medición: si una de las once dejara de rechazar, el agujero volvería
  por otro campo y la suite se pondría roja. Eso es lo correcto en una feature que
  decide **no** tocar once campos.

## 2. Falsos positivos en `name` — no se ha encontrado ninguno inaceptable

`name` es texto libre, así que aquí es donde había que buscar. 19 nombres probados:

| Forma del nombre | Antes | Ahora | Juicio |
| --- | --- | --- | --- |
| Nombres normales de fondo / ETF / cartera / depósito (4 casos) | entra | **entra** | ✅ |
| `<` o `>` **en mitad** del texto: rangos y porcentajes (5 casos, del tipo «renta fija menor que un año», «RV global mayor que 60 %») | entra | **entra** | ✅ el caso realista de un `<`/`>` legítimo, y sobrevive |
| Empieza por `<` a propósito | entra | rechaza | ⚠️ falso positivo **asumido y dicho** |
| Acaba en `>` a propósito | entra | rechaza | ⚠️ ídem |
| Marcador entero, plantilla A y B | **entraba** | rechaza | ✅ el agujero |
| Marcador a medio borrar, por los dos lados | **entraba** | rechaza | ✅ |
| Marcador con texto solo delante o solo detrás | entraba | rechaza | ✅ cae en la regla de los extremos |

**El falso positivo existe y está declarado**: un nombre que **abra** con `<` o
**cierre** con `>` a propósito se rechaza. No se ha encontrado ningún nombre de
producto financiero plausible con esa forma —los `<` y `>` de verdad aparecen **en
mitad**, en rangos y porcentajes, y esos entran—, así que el intercambio es el bueno y
está escrito tanto en el código como en el documento que él lee. Es además **la misma
regla que la F28 razonó** para Trade Republic, no una invención nueva.

**El caso simétrico (una forma de dejarse el marcador que se cuela) sí existe, y es
uno solo:** un marcador **entero e intacto en mitad** de un nombre ya tecleado —texto
suyo delante *y* detrás—. No bloquea: es el borde exacto de la regla «el símbolo en
mitad no cuenta» que la F28 tomó a propósito para no rechazar nombres buenos, y el
criterio 1 de esta feature habla del nombre que **sigue siendo** el marcador. Queda
como nota de futuro en el resumen, no como cambio requerido.

## 3. Sus 5 productos reales — comprobado con sus ficheros, no solo con fixtures

Los tests de no-regresión usan fixtures sintéticas, y por construcción **no pueden**
decir si un nombre suyo de verdad empieza por `<` o acaba en `>`. Así que se hizo la
pasada real de lectura sobre su copia local, como en la F28:

```
ficheros .json de producto: 5
aceptados:                  5
rechazados:                 0
por tipo:  fund 1 · etf 1 · managed_portfolio 1 · deposit 2
```

**Sus cinco productos siguen entrando, y los cuatro tipos están representados.** Esto
cubre **C4 bis en sustancia**, con el mismo mecanismo y por la misma vía que se aceptó
en la F28 (revisor, informe dentro de la review). Solo lectura: ni escritura ni red.

## 4. La decisión de NO compartir con Trade Republic — **se sostiene, y está tomada**

Se ha comparado punto por punto con la §Decisión 2 de la F28
([`implementations/half-erased-marker-message.md`](../implementations/half-erased-marker-message.md)):

| Argumento de la F28 | ¿Sigue vivo hoy? | Qué hace la F30 |
| --- | --- | --- |
| «MyInvestor no tiene siquiera esta pieza: un solo usuario, abstracción prematura» | ❌ **caducado**, hoy hay dos | Lo da por caducado, no lo repite |
| «No puedo hacerlo ahora: la F29 tiene esos tres archivos en la mano» | ❌ **caducado**, la F29 está cerrada | Lo da por caducado, no lo repite |
| «Un parser por banco; el marcador es forma del fichero, de la plantilla de cada banco» | ✅ vigente | Lo **reusa**, y es legítimo: es la norma, no un argumento de coyuntura |
| — | — | 🆕 **«la política diverge»**: TR lo comprueba en **todos** los campos, MyInvestor solo en los **dos** medidos como expuestos. Lo compartible es el predicado; **lo que lleva el riesgo (a qué campos se aplica) se queda en cada banco de todas formas** |
| — | — | 🆕 `src/lib/` como puerta abierta que la auditoría del 2026-08-22 marca (C5), posterior a la F28 |

**Veredicto: no es la F28 repetida con otras palabras.** Reconoce que las dos
condiciones que la F28 puso se han cumplido, y rechaza compartir por la **tercera**
(«y solo si entonces sigue haciendo falta») apoyándose en un **hecho que la F28 no
podía conocer**: la política de campos diverge, y solo se supo al **medir** cuáles
estaban expuestos, que es el trabajo de esta misma feature. Además cierra el cabo
suelto que dejaría —quién se acuerda en el tercer banco— escribiéndolo en
[`docs/conventions.md`](../../docs/conventions.md) §Parsers de banco, con la
instrucción de **medir antes**. Eso es cerrar la decisión, no aplazarla.

**Una salvedad menor, dicha y no bloqueante:** el «coste asumido» del informe habla de
**«~10 líneas duplicadas»**. La duplicación real es de ~35 líneas de código (dos
predicados, la interfaz `MarkerReport`, el recolector y los dos textos de motivo), más
sus comentarios. El número está corto por tres, aunque la decisión no depende de él:
con 35 líneas el argumento sigue siendo el mismo. Se anota para que el humano lea la
cifra buena.

## 5. Que no se haya crecido — **no se ha crecido**

Mirado en el diff, no en el informe:

- Archivos de código tocados: **dos de test y uno de parser, los tres bajo
  `src/modules/myinvestor/`**. Ni una línea en `bankinter`, `n26`, `openbank`,
  `trade-republic`, `investments`, `src/app.ts`, `src/lib/` o `src/architecture.test.ts`.
- **Ningún archivo de código nuevo**, ninguna dependencia nueva, **ninguna migración**
  (`prisma/` sin tocar) y ningún script de repaso. Nada de lo guardado cambia y no hay
  que reimportar.
- **El humano no escribe ni un campo nuevo**: `currency` sigue siendo opcional con
  `EUR` por defecto, y ningún campo pasa de opcional a obligatorio. Verificado en la
  sonda: los tres esqueletos de plantilla entran tal cual, sin añadir nada.
- El parser **no adivina ni repara**: no recorta el símbolo para leer el resto;
  devuelve motivo. Verificado a mano y con test.
- Sin `console.log`, sin TODO/FIXME nuevos. `tsc` y la suite entera en verde vía
  `init.sh`; prettier y oxlint los declara el implementer.

## 6. `docs/myinvestor-product-files.md` — recoge el caso y lo que dice es verdad

- El recuadro «⚠️ Las plantillas llevan marcadores `<…>` a propósito»
  ([:65](../../docs/myinvestor-product-files.md#L65)) **corrige la frase que era falsa**
  («no hace falta código nuevo… la propia forma del marcador ya es inválida en los
  cuatro sitios») y deja dicho **por qué** era falsa y **desde cuándo** importa (el
  `name` es la identidad del producto desde la F29). Corregir la frase equivocada en
  vez de tapar el hueco en silencio es lo que había que hacer.
- Cada afirmación nueva se ha contrastado contra el parser:
  - «Un `<…>` que llegue sin sustituir se rechaza siempre, y el motivo te dice el
    campo» → **cierto en las 13 claves de las dos plantillas** (sonda).
  - «El símbolo **en mitad** no cuenta; un producto con un `>` en medio del nombre
    entra sin problema» → **cierto**, probado.
  - «Lo que no puedes es **abrir** un nombre con `<` ni **cerrarlo** con `>`» →
    **cierto**, y es justamente el falso positivo asumido, dicho en claro.
- Las **dos filas nuevas** de la tabla «Qué pasa cuando un archivo está mal»
  ([:263](../../docs/myinvestor-product-files.md#L263)) citan textos de motivo que
  **coinciden literalmente** con los que devuelve el parser. Comprobado contra la
  salida real.

## 7. La base del humano — idéntica

Recuento con el cliente real, **antes** de tocar nada y **después** de la suite
completa y de la pasada de lectura:

| | Antes | Después |
| --- | --- | --- |
| Cuentas | 4 | **4** |
| Movimientos | 455 | **455** |
| Productos | 6 | **6** |
| Valoraciones | 3 | **3** |
| Fotos de cuenta remunerada | 1 | **1** |

Coincide con la base declarada y **no ha cambiado nada**. Era lo esperable: el cambio
vive entero en un parser puro y los tests que necesitan base usan desechables desde la
F27.

🔒 En este informe no hay ni un dato suyo: solo recuentos, formas y valores sintéticos
inventados por el revisor (ADR-017).

---

## Review

**Veredicto:** APPROVED

Comprobado: los 10 criterios de `acceptance` ↔ tests (los 14 nuevos verifican salida
concreta —literales del motivo, campo nombrado, valor devuelto—, no «no lanza»); las
tres decisiones delegadas resueltas por escrito y las tres se sostienen; la medición de
campos expuestos **reproducida entera** (99 casos, antes y después) y exacta, depósito
incluido; sin falso positivo inaceptable en `name`; sus 5 productos reales verificados
**con sus propios ficheros**; alcance sin crecer (tres archivos, un solo módulo, sin
migración, sin campo nuevo, ningún otro banco); arquitectura y `docs/conventions.md`
respetadas; documentación veraz; base del humano idéntica antes y después; ADR-017
limpio; `./init.sh` verde (48 archivos, 890 tests); CHECKPOINTS C1-C5 (C4 bis cubierto
en sustancia con la pasada real de lectura de §3, como en la F28), C6 no aplica —no
cambia el contrato de la API—, C7 no aplica (`"sdd": false`), C8 al escribir el resumen.

Sin hallazgos que bloqueen. Dos anotaciones **no bloqueantes**, recogidas en el
resumen de cierre: la cifra de «~10 líneas duplicadas» del informe es en realidad ~35,
y un marcador entero e intacto **en mitad** de un nombre ya tecleado sigue entrando
(borde declarado de la regla de la F28).

Resumen de cierre: [`progress/summaries/myinvestor-template-marker-guard.md`](../summaries/myinvestor-template-marker-guard.md).
