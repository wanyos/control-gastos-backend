# Review — F20 `trade-republic-product-file`

**Fecha:** 2026-08-19 · **Revisor:** subagente `reviewer` · **Feature:** 20, SDD,
`in_progress` en `feature_list.json` (única).

## Veredicto

**CHANGES_REQUESTED** — **1 punto bloqueante** (C4 bis), con un corolario.

Todo lo demás que se me pidió mirar está **comprobado y sin hallazgos**, y lo digo
antes de nada para que no se lea como un rechazo del trabajo: el cuadre, el mensaje
de descuadre, los dos desvíos declarados, el aislamiento, el `.pdf`, el UTF-8
estricto y el guardián de datos reales están **bien**, y el 🔒 lo he cruzado
contra el fichero real, no contra el informe.

Verificado por el revisor, ejecutando:

- `./init.sh` **verde**, exit 0: `Test Files 43 passed (43)`, `Tests 721 passed
  (721)`, **0 saltados**. El recuento del informe es exacto.
- Las **3 líneas de aviso del guardián de la F14 sobre `trade-republic`** siguen
  saliendo en la salida de `./init.sh` (líneas 32-34 de la ejecución). Esa parte
  no se ha roto.
- `package.json` y `pnpm-lock.yaml` **sin cambio** frente a git (`git status
  --porcelain` vacío para los dos): cero dependencias nuevas, confirmado contra el
  índice y no contra el informe.
- **25/25 tasks** en `[x]` en [`tasks.md`](../../specs/20-trade-republic-product-file/tasks.md)
  (T1-T22 más T1b, T9b, T11b). Ninguna `[ ]`.

---

## Cambios requeridos

### 1. 🔴 C4 bis — no se ha hecho la prueba real, y aquí no es un trámite

[`CHECKPOINTS.md:45`](../../CHECKPOINTS.md#L45) exige la pasada real «si la feature
añade o cambia un parser de banco **(o cualquier lectura de un fichero que escribe
o descarga el humano)**». Esta feature es, literalmente, **la lectura de un fichero
que escribe el humano**: la casilla aplica de lleno.

No existe `progress/explorations/prueba-real-trade-republic-<fecha>.md`, y **C4 bis
no se menciona en ningún sitio**: ni en
[`progress/implementations/trade-republic-product-file.md:120`](../implementations/trade-republic-product-file.md#L120)
(§Verificaciones ejecutadas), ni en `progress/current.md:832`, ni en el spec. No es
que se descartara con razón: **se pasó en silencio**, que es exactamente lo que la
casilla se añadió el 2026-08-19 para impedir.

Y no es formalismo, por tres motivos concretos:

1. **Es factible hoy.** El fichero real del banco está en
   `var/drive-read/trade-republic/2026/` (el `.pdf`). La pasada real es: rellenar la
   plantilla a partir de ese extracto, dejar el `.json` donde lo dejaría la ingesta y
   llamar a `POST /api/parser/trade-republic`. Nada de eso necesita red ni base de datos.
2. **Tiene una consecuencia diseñada que hoy no se ha disparado.** La entrada de
   `unwatchedBanks` ([`src/no-real-data.test.ts:369`](../../src/no-real-data.test.ts#L369))
   dice: «the day that JSON lands in `var/drive-read/trade-republic/`, that file is
   text and this entry has to be deleted (the test fails until it is)». Es decir: la
   afirmación del informe «las 3 líneas de aviso **no cambian**» es cierta **solo
   porque la prueba real no se hizo**. Hacerla pondrá el guardián en rojo hasta que
   se borre esa entrada, y ese es el momento en que este banco pasa a estar vigilado
   por la capa de comparación. Cerrar la feature sin pasar por ahí deja el trabajo a
   medias y el aviso apuntando a algo que ya no sería verdad.
3. **Hay una afirmación sobre el fichero real que nadie ha comprobado**, y es la del
   punto 2 de aquí abajo.

**Qué hacer:** o la pasada real con su informe en
`progress/explorations/prueba-real-trade-republic-<fecha>.md` (**recuentos y forma,
nunca contenido**, C4 bis segunda viñeta), o —si el humano decide que se difiere
hasta que escriba su primer `.json`— **queda escrito con esa firma**, en
`progress/current.md` y en el informe, en vez de en silencio.

### 2. La tabla «de dónde sale cada campo» afirma cosas del extracto real que no se han verificado

[`docs/trade-republic-product-files.md:118`](../../docs/trade-republic-product-files.md#L118)-[`:120`](../../docs/trade-republic-product-files.md#L120)
marca `openingBalance`, `moneyIn` y `moneyOut` como **MUESTRA** («está en el extracto
que te manda el banco»), y [`:62`](../../docs/trade-republic-product-files.md#L62)
añade que los tres salen «del **resumen** del extracto».

Yo **sí** he abierto el `.pdf` real (ver §Método de cruce) y, sin citar ni un valor:
su resumen es **del periodo entero, no del mes**, y el extracto que hay hoy en `var/`
**cubre varios abonos de intereses**. Con la cadencia decidida —un archivo por abono,
[`decisions.md:19`](../../specs/20-trade-republic-product-file/decisions.md#L19)— el
resumen **no** da el `moneyIn`/`moneyOut` **de cada mes**: solo del conjunto. Que hoy
salga bien es un accidente de esta cuenta (no tiene más apuntes que los intereses, así
que los dos son `0` todos los meses); el documento, tal como está escrito, le dice que
copie del resumen unos valores que en un extracto con movimientos serían **de otro
periodo** y le harían fallar el cuadre sin entender por qué.

Un detalle a favor del documento, y por eso este punto es una precisión y no un fallo
de diseño: el aviso de
[`:96`](../../docs/trade-republic-product-files.md#L96) («`moneyIn` NO incluye los
intereses… si el resumen los suma dentro de su entrada de dinero, **réstalos**»)
**acierta de pleno** contra el fichero real: en él, la entrada de dinero del resumen
es exactamente la suma de los abonos del periodo. Esa es justo la clase de cosa que la
prueba real confirma o tumba en diez minutos.

**Qué hacer:** ajustar esas tres filas para decir de dónde salen **por mes** (y qué
hacer cuando el extracto cubre varios), preferiblemente después de la pasada real del
punto 1, que es la que fija la redacción con el fichero delante.

---

## Comprobado sin hallazgos

### El cuadre (lo pedido en el punto 1 del encargo)

- **Rechaza de verdad, no avisa.** El motivo se acumula en `problems` y el archivo
  sale por la rama de rechazo
  ([`parser.ts:115`](../../src/modules/trade-republic/trade-republic.product.parser.ts#L115)),
  y en el servicio se convierte en `ValidationError` → `failed[]`
  ([`service.ts:131`](../../src/modules/trade-republic/trade-republic.service.ts#L131)).
  No hay ninguna rama de «warning».
- **Aritmética en enteros, sin residuo de coma flotante.**
  [`parser.ts:178`](../../src/modules/trade-republic/trade-republic.product.parser.ts#L178):
  `Math.round(value * 100)` en los cinco importes, resta de enteros, comparación de
  enteros. **No queda ni una comparación en euros** en el módulo (revisado archivo a
  archivo: no hay `Number.EPSILON`, ni `toFixed` en la decisión —solo en el texto del
  mensaje—, ni `===` sobre sumas de `number`).
- **Tolerancia de 1 céntimo exacta:** `toleranceCents = 1` y `<=`
  ([`:185`](../../src/modules/trade-republic/trade-republic.product.parser.ts#L185),
  [`:201`](../../src/modules/trade-republic/trade-republic.product.parser.ts#L201)).
  Cubierto por los dos lados y en las dos direcciones:
  [`parser.test.ts:289`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L289)
  (1 céntimo → aceptado, y **el saldo sale como se escribió**: la tolerancia perdona,
  no corrige), [`:297`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L297)
  (**2 céntimos → rechazado**) y
  [`:349`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L349)
  (±1 pasa, ±2 no).
- **El caso fino: un campo que falta NO produce además un descuadre.** La comprobación
  está guardada por los cinco importes no nulos
  ([`parser.ts:101`](../../src/modules/trade-republic/trade-republic.product.parser.ts#L101)),
  y el test lo ata con una aserción **de igualdad exacta** del motivo, no de
  contención: `expect(reason).toBe('faltan campos obligatorios: moneyOut')`
  ([`parser.test.ts:310`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L310)).
  Igual para un importe escrito como texto
  ([`:320`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L320))
  y para la plantilla sin rellenar
  ([`:103`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L103)).
- `moneyIn` **sin** intereses, con su test de regresión
  ([`:327`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L327)).

### El mensaje de descuadre, leído como lo leería él

Reproducido por mí ejecutando el parser (no copiado del informe), sobre un fichero
sintético con un dedazo de 100 € en el saldo final. Dice, en este orden: **cuánto se
desvía y con qué signo**, **el saldo final esperado frente al escrito**, **la fórmula
en castellano** y **los cinco importes con su nombre y su valor**. Con eso delante,
sabría qué corregir: ve los cinco juntos y el que chirría salta. El signo delante es
el acierto (`+` = «hay de más»). No tengo ninguna pega que ponerle.

### Los dos desvíos declarados

- **ADR-024 en vez de 019: correcto y no pisa nada.** Los ADR de
  `docs/architecture.md` llegan hasta el **023**
  ([`:1661`](../../docs/architecture.md#L1661)) y el 024 es
  [`:1748`](../../docs/architecture.md#L1748). El 019 lo ocupa la F16
  ([`:1410`](../../docs/architecture.md#L1410)). Trivial y bien resuelto.
- **Reconocer los marcadores `<…>`: la solución es la correcta, no abre puerta.** El
  diagnóstico del implementer es exacto: en `name` un marcador **es** una cadena no
  vacía válida, y sin `isMarker` la cuenta habría entrado llamándose como el
  marcador. El riesgo de confundir un valor legítimo es el de una cadena que empieza
  por `<` y acaba por `>`
  ([`parser.ts:221`](../../src/modules/trade-republic/trade-republic.product.parser.ts#L221)),
  que en los cuatro campos de texto de este archivo (`type` con un único valor
  admitido, `name`, y las dos fechas ISO) **no puede ser un valor válido**: en tres de
  ellos ni siquiera pasaría la validación de formato. Es una comprobación acotada al
  módulo y sin coste. Y el efecto **está verificado, no argumentado**: la plantilla
  publicada se pasa **verbatim** por el parser y sale rechazada **nombrando los diez
  campos** ([`parser.test.ts:77`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L77)),
  con [`docs.test.ts:43`](../../src/modules/trade-republic/trade-republic.docs.test.ts#L43)
  atando la plantilla del test a la del documento para que no puedan divergir. El
  criterio explícito del humano queda cumplido.
- La decisión de **entrecomillar los marcadores numéricos** para que la plantilla sea
  JSON válido está bien razonada, está dicha en el propio marcador y en
  [`docs/trade-republic-product-files.md:55`](../../docs/trade-republic-product-files.md#L55),
  y el parser rechaza por su nombre al que se deje las comillas
  ([`parser.test.ts:154`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L154)).

### Aislamiento, base de datos, `.pdf`, IBAN, TAE, UTF-8

- **No se comparte ni tipo ni código con MyInvestor.** Guardián de importaciones y de
  menciones cruzadas en [`architecture.test.ts:358`](../../src/architecture.test.ts#L358)
  (con `trade-republic` dentro de `bankModules`), y el módulo declara sus propios
  tipos en [`trade-republic.types.ts`](../../src/modules/trade-republic/trade-republic.types.ts).
  Ningún `import` de otro módulo de banco; el único importador externo es `src/app.ts`.
- **El módulo no menciona la base de datos:** guardián nuevo en
  [`architecture.test.ts:342`](../../src/architecture.test.ts#L342) sobre los cuatro
  archivos de producción; `prisma/schema.prisma` sin tocar (`git status` limpio en
  `prisma/`). Y no entra en el registro de parsers del importador, con test que lo
  comprueba leyendo `app.ts` ([`routes.test.ts:127`](../../src/modules/trade-republic/trade-republic.routes.test.ts#L127)).
- **El `.pdf` se lista como ignorado, no como fallo**, con aserción de igualdad
  completa del `ignored[]` y `failed` vacío
  ([`service.test.ts:140`](../../src/modules/trade-republic/trade-republic.service.test.ts#L140)),
  más el caso del año que solo trae `.pdf` (no genera volcado,
  [`:200`](../../src/modules/trade-republic/trade-republic.service.test.ts#L200)).
- **IBAN y TAE fuera**: no están en la plantilla
  ([`docs/trade-republic-product-files.md:40`](../../docs/trade-republic-product-files.md#L40)-[`:52`](../../docs/trade-republic-product-files.md#L52)),
  no están en `allowedKeys`
  ([`parser.ts:30`](../../src/modules/trade-republic/trade-republic.product.parser.ts#L30)),
  y si aparecen se rechazan por su nombre
  ([`parser.test.ts:215`](../../src/modules/trade-republic/trade-republic.product.parser.test.ts#L215)).
  El documento dice además **por qué** están fuera y qué las traería de vuelta.
- **UTF-8 estricto**: `decodeUtf8Strict` sobre el `Buffer`, nunca `readFile(…,
  'utf8')` ([`service.ts:129`](../../src/modules/trade-republic/trade-republic.service.ts#L129)),
  con test de un fichero cp1252 real de bytes
  ([`service.test.ts:123`](../../src/modules/trade-republic/trade-republic.service.test.ts#L123)).
  **No hereda** la divergencia de MyInvestor, y esa divergencia queda anotada como
  fuera de scope en dos sitios.

### 🔒 Guardián de la F14 — método de cruce aplicado

- **Ningún `no-real-data-ok` nuevo**: `git diff | grep '^+.*no-real-data-ok'` no
  devuelve ninguna línea añadida en código ni en docs de esta feature (las dos
  coincidencias del diff son prosa de la F23 diciendo que **no** se añadió ninguno).
  Cero en `src/modules/trade-republic/` y en `docs/trade-republic-product-files.md`.
- **Plantilla con marcadores en TODOS los valores**, con guardián que lo comprueba
  parseando cada bloque ```json del documento
  ([`docs.test.ts:30`](../../src/modules/trade-republic/trade-republic.docs.test.ts#L30)).
  Ni un valor copiable, `closedAt` incluido.
- **Cruce contra el fichero real, hecho a mano por mí.** La capa de comparación no
  puede mirar este banco (`unwatchedBanks`,
  [`src/no-real-data.test.ts:369`](../../src/no-real-data.test.ts#L369)), así que
  hice el cruce a mano: descomprimí los streams del `.pdf` real, y su contenido
  numérico **sí es recuperable** sin las CMaps, porque la sustitución de dígitos de la
  fuente subset queda determinada por la propia coherencia del extracto (cada saldo es
  el anterior más su abono). Verifiqué la sustitución contra dos anclas independientes
  del documento y con ella recuperé **todos** los tokens numéricos del extracto:
  importes, saldos, la numeración larga de la cuenta, códigos y fechas.
  **Los busqué uno a uno en el repositorio (`git grep` sobre todo lo versionado
  excluyendo `var/`, más los archivos nuevos sin trackear): CERO coincidencias.**
  Ni un importe, ni un fragmento de la numeración, ni una fecha del extracto está en
  ningún archivo de este repositorio. Los fixtures son inventados y no comparten ni la
  magnitud con los reales. **Aquí no hay fuga.**

### Trazabilidad y reglas de spec

- **16 requirements vivos** (R1-R5, R7-R9, R11-R18), **todos** con al menos un test
  concreto; recorrí la tabla del informe abriendo los tests, no leyéndola. Los enlaces
  `archivo:línea` que da el informe apuntan donde dicen.
- **Los 10 criterios de `acceptance`** cubiertos; el nº 4 (decisión delegada por
  escrito) está resuelto en ADR-024 y hecho ejecutable por los guardianes.
- `decisions.md` existe, cabe en una hoja, tiene los bloques de la plantilla y el
  bloque 🔴 tiene **exactamente 6** puntos, cada uno con su alternativa, más su
  **puerta de aprobación firmada** ([`:92`](../../specs/20-trade-republic-product-file/decisions.md#L92)).
- **Tope de tamaño:** 16 > ~15, y la razón está **dicha explícitamente** en
  [`decisions.md:81`](../../specs/20-trade-republic-product-file/decisions.md#L81) y
  ampliada en [`requirements.md:204`](../../specs/20-trade-republic-product-file/requirements.md#L204).
  Cumple la regla.
- **Procedencia** completa: los 16 vivos clasificados (`humano` / `delegado` /
  `añadido`), los dos retirados dichos como retirados y sus números no reutilizados.
- **Arquitectura y convenciones**: el árbol de `docs/architecture.md` gana el módulo,
  `docs/conventions.md:208` admite el caso nuevo con su porqué, `docs/api-contract.md`
  publica el endpoint y el modelo con valores inventados, y el roadmap deja escrita la
  provisionalidad con test que lo vigila
  ([`docs.test.ts:98`](../../src/modules/trade-republic/trade-republic.docs.test.ts#L98)).
- Los tests verifican **salida concreta** (motivos literales, objetos completos,
  ficheros escritos en disco temporal), no «no lanza excepción», y no usan ni un mock
  innecesario: el servicio corre contra directorios temporales reales y la ruta contra
  la app real.
- **CHECKPOINTS:** C1 ✅, C2 ✅, C3 ✅, C4 ✅, **C4 bis ❌ (el bloqueo)**, C5 ✅
  (pendiente solo el cierre), C6 n/a (no toca el contrato consumido por el frontend
  más allá de un endpoint nuevo documentado), C7 ✅, C8 pendiente por el veredicto.

---

## Observaciones que NO bloquean

1. **La entrada de `unwatchedBanks` afirma más de lo que es cierto.**
   [`src/no-real-data.test.ts:373`](../../src/no-real-data.test.ts#L373) dice que el
   texto del PDF «is not recoverable without the font CMaps». Yo lo he recuperado sin
   ellas, con la coherencia aritmética del propio extracto, y **ese es exactamente el
   camino por el que un valor real podría acabar copiado en el repositorio**. La
   conclusión operativa («este banco no está vigilado, hay que mirarlo a mano») sigue
   siendo la correcta; lo que sobra es el «no se puede». Es texto de la **F23**, no de
   esta feature: se anota, no se exige aquí.
2. Las cuatro sugerencias fuera de scope del informe
   ([`:195`](../implementations/trade-republic-product-file.md#L195)) me parecen bien
   identificadas y bien dejadas fuera. La nº 4 (`normalizeBankName('Trade Republic')`,
   el único nombre de carpeta con espacio) es la que yo pondría primero en la cola.
3. El desvío nº 3 del informe (roadmap a «5 de 6» en vez del «3 de 6» que pedía T4)
   es obviamente correcto: la task se escribió cuando iban dos bancos.

---

## Qué falta para APPROVED

Solo el punto 1 (y, colgando de él, el 2). Ni una línea de código de esta feature
necesita cambiar por lo que yo he visto: lo que falta es **la pasada real que
CHECKPOINTS exige y el ajuste de tres filas de la tabla de la plantilla que esa
pasada va a fijar**. Cuando estén, el resumen de cierre
`progress/summaries/trade-republic-product-file.md` (C8) se escribe y la feature
cierra.

**No he escrito resumen de cierre**: el veredicto no es APPROVED.
