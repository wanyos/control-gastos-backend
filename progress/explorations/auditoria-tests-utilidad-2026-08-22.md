# Auditoría de la suite de tests: ¿son muchos? ¿son útiles todos?

> **Decidido el 2026-08-23:** no se borra ni un test. El humano leyó el informe y
> los 14 que sobran (1,6 %) y los ~16 «a decidir» **se quedan**: «creo que son
> cosas menores». Esto no es trabajo pendiente, es el registro de dónde está la
> poca grasa que hay, por si algún día molesta. El veredicto que importa sigue en
> pie: **876 tests eran una cifra sana**.
>
> Los dos hallazgos que NO eran grasa sino lo contrario —el test que dice «todos
> los bancos» con una lista escrita a mano que dejó fuera a Openbank, y las seis
> clases de error sin test propio— también quedan aquí, sin abrir.

> Exploración del 2026-08-22. **No se ha borrado ni editado ni un test.** La
> suite se ejecutó tres veces (bases desechables de la F27; el `globalSetup`
> confirmó en las tres que la base del humano quedó exactamente igual).
> Criterio aplicado: el de `docs/verification.md` (4 niveles) y
> `docs/conventions.md`, no el mío.

## Respuesta corta

**876 no son muchos. Son, con muy poco margen, los que hacen falta.**

- **14 tests sobran de verdad** (1,6 % de la suite). Ninguno de los 14 cubre
  nada que no quede cubierto por otro test del **mismo archivo**.
- **~16 más están a decidir**: son decisiones legítimas del proyecto que hoy se
  pagan dos veces, no errores.
- **Los 846 restantes se quedan.** No hay un archivo gordo que sobre, no hay una
  familia entera que sobre, y el archivo con más tests de la suite
  (`n26.statement.parser`, 53) es de los más baratos que hay.

Y una corrección de dato que cambia la pregunta: **el número de tests no es lo
que cuesta**. Ver §4.

---

## 0. Lo medido

Ejecución completa (reporter `json`, duración real por archivo):

```
 Test Files  48 passed (48)      Tests  876 passed (876)
 Duration  10,20 s  (transform 3,63 s, setup 4,58 s, import 25,10 s,
                     tests 30,86 s, environment 9 ms)
```

Los cinco archivos más caros y los cinco más poblados **no son los mismos**:

| Más caros (duración real)      |        | Más poblados (nº de tests)        |    |
| ------------------------------ | ------ | --------------------------------- | -- |
| `no-real-data.test.ts`         | 2,75 s | `n26.statement.parser`             | 53 |
| `import.service.test.ts`       | 1,35 s | `myinvestor.statement.parser`      | 52 |
| `movements.test.ts`            | 1,03 s | `trade-republic.product.parser`    | 48 |
| `import.local.routes.test.ts`  | 0,97 s | `openbank.statement.parser`        | 47 |
| `test-db.test.ts`              | 0,96 s | `no-real-data`                     | 39 |

Los **200 tests** de los cuatro parsers de extracto/producto más grandes cuestan
**0,19 s entre todos**. Eso descarta de entrada la hipótesis «hay demasiados
tests y por eso la suite tarda».

---

## 1. Tests que prueban lo mismo dos veces

Recordatorio del criterio: probar lo mismo **en cada banco** NO es duplicación
(`docs/conventions.md` §Parsers de banco). Lo que sigue son duplicados **dentro
del mismo archivo**, o entre dos archivos **del mismo banco**.

### 1.1 `src/lib/utf8.test.ts:111-153` — cuatro tests que rebobinan · **SOBRA (4)**

Dos bloques enteros:

- `utf8.test.ts:111` — «decodeUtf8Strict is untouched by the extraction of the
  guard (feature 19, T5)» → 2 tests (`:112`, `:127`).
- `utf8.test.ts:139` — «decodeUtf8Strict is untouched by the mismatch guard
  (feature 22, C5)» → 2 tests (`:140`, `:147`).

**Qué son.** Vuelven a pasar por el mismo camino que los dos primeros `describe`
del archivo, con los mismos bytes: el `0xD3` de cp1252 (`:112` y `:147` frente a
`:43`), el carácter de sustitución (`:117` frente a `:79`) y una cadena con
tildes (`:128` y `:144` frente a `:11`). `:147` y `:112` usan **literalmente el
mismo buffer**, `Buffer.from([0x53, 0xd3, 0x4e])`, y afirman lo mismo.

**Por qué sobran.** Su trabajo era retórico y ya está hecho: demostrar, **el día
de la F19 y el de la F22**, que aquellas features no habían tocado este
descodificador. Hoy, si alguien debilita `decodeUtf8Strict`, quien se pone rojo
primero es `:11`, `:43` o `:79`; estos cuatro se ponen rojos **después** y por lo
mismo. Un test de no-regresión que no fija ningún input nuevo es un eco.

**Qué dejaría de estar cubierto si desaparecieran.** Nada. Ni un byte, ni un
código de error, ni una frase de motivo. Lo único que se perdería son los dos
comentarios de cabecera (`:105-110` y `:132-138`), que explican **por qué** este
guardián no se tocó en la F19 ni en la F22 — y eso se conserva moviendo los dos
comentarios al `describe` de arriba, que es donde viven las aserciones que de
verdad lo prueban.

### 1.2 `src/config/env.test.ts:76` y `:82` — un `toEqual` troceado · **SOBRA (2)**

- `:76` «exposes the three Drive credentials under `config.drive`».
- `:82` «exposes the Drive root folder id under `config.driveRootFolderId`».

**Por qué sobran.** Los dos llaman `loadConfig(baseEnv)`, exactamente la misma
entrada que `:57` («applies defaults when only the required variables are
present»), y `:57` ya hace `expect(config).toEqual({ …, drive, driveRootFolderId })`
sobre el objeto **entero**. `:76` y `:82` no son otro camino: son ese mismo
`toEqual` troceado en dos afirmaciones parciales. El disfraz es el nombre del test.

**Qué dejaría de estar cubierto.** Nada: un `toEqual` del objeto entero es
estrictamente más fuerte que dos comprobaciones de dos de sus claves.

*(Menor, misma familia — **a decidir**: `:178` «collects all problems into a
single error message» y `:184` «lists the missing Drive variables alongside the
preexisting ones» hacen la **misma llamada**, `loadConfig({ PORT: 'abc',
LOG_LEVEL: 'verbose' })`, y solo cambian qué nombres busca el regex. Son un test
con dos aserciones.)*

### 1.3 `src/lib/iban.test.ts:42` — un corolario · **SOBRA (1)**

«produces EXACTLY the same string from the spaced and the unspaced form».

**Por qué sobra.** `:32` ya afirma que la forma con espacios da `germanExample` y
`:37` que la minúscula también. Que dos cosas iguales a una tercera sean iguales
entre sí no es un camino distinto del código: es el mismo, dicho de otra manera.

**Qué dejaría de estar cubierto.** Nada. (Matiz honesto: `:42` es el test que
**enuncia la intención** de la feature 21 —«el mismo IBAN no puede ser dos
cuentas»— con más claridad que `:32`. Si se borra, esa frase merece bajar como
comentario a `:32`.)

### 1.4 Dos tests de parser que viven en el archivo de rutas · **A DECIDIR (2)**

- `src/modules/n26/n26.routes.test.ts:126` «leaves the account to the existing
  importer path when the iban is not written (C8)».
- `src/modules/openbank/openbank.routes.test.ts:128`, idéntico en forma.

Ninguno de los dos usa `app.inject`: llaman al parser directamente y comprueban
que el IBAN de la cuenta sale `null`. Eso ya está fijado, en el archivo del mismo
banco: `n26.statement.parser.test.ts:287` («never infers the account iban…») y
`openbank.statement.parser.test.ts:392` («is null when the file comes untouched
from the bank»). No añaden la costura HTTP, que es lo único que justificaría
repetirlo aquí.

**Por qué "a decidir" y no "sobra".** Los dos llevan un comentario que explica un
razonamiento de diseño (por qué **no** se escribió camino nuevo). Ese comentario
vale; la aserción, no. Se resuelve moviendo el comentario, no borrando a ciegas.

### 1.5 `src/modules/bankinter/bankinter.parser.test.ts:200` — el pin que se traga a siete · **A DECIDIR (1)**

«produces exactly the same movements and values as before the shared contract»:
un `toEqual` de **60 líneas** con el resultado completo de parsear el fixture
canónico.

**Qué es.** Un snapshot escrito a mano. Sobre **ese mismo fixture**, subsume
entero a `:9` (banco, IBAN, recuentos), `:21` (primera fila y los miles), `:45`
(las claves exactas del contrato), `:69` (tipo por el signo), `:95`
(`daySequence`), `:113` (no deduplica: las dos filas idénticas) y `:124`
(`unparsedRows` con nº de fila y motivo). Siete tests y el pin dicen lo mismo
sobre la misma entrada.

**Por qué no digo "sobra" sin más.** Porque el que sobra, si sobra alguno, es el
**pin**, no los siete. Los siete nombran cada decisión y sirven de documentación
(que es para lo que este proyecto usa los tests); el pin no nombra ninguna y es
**el frágil**: cualquier campo nuevo del contrato compartido lo rompe sin que
cambie ni un comportamiento. Ya ha pasado dos veces — los comentarios de
`:195-199` y `:213-215` son las cicatrices de la F11 y de la F16. Lo único que
aporta el pin y los siete no es «y nada más cambió»; hay que decidir si eso vale
una aserción que se rompe sola cada vez que crece el contrato.

### 1.6 `openbank.statement.parser.test.ts:163` y `:210` · **A DECIDIR (2)**

- `:163` «tells him WHAT TO DO in both reasons, not only what happened (C3)»
  recorre los dos motivos buscando `Windows-1252` y `vuelve a (abrirlo|descargarlo)`.
  Las dos mitades ya están: `:138` (`vuelve a descargarlo del banco`) y `:149`
  (`Western (Windows-1252)`). Es un recorrido transversal de dos caminos ya
  fijados, sin entrada nueva.
- `:210` «parses a month-sized statement with 200 movements and 0 unparsed rows»
  frente a `:274` «enters a file of two hundred movements whole, without
  deduplicating»: los dos generan 200 filas y afirman 200 movimientos y 0
  `unparsedRows`. Lo propio de `:210` (las tildes sobreviven en volumen) ya está
  en `:55` y `:62` a pequeña escala; lo propio de `:274` (100 filas idénticas) es
  lo único que ninguno de los dos repite.

Los dos son de la familia «una entrada, dos tests». Se fusionan sin perder nada,
pero `:163` y `:210` están **trazados a los criterios C3 y C8 del spec**
(`docs/verification.md` §Nivel 4), así que la decisión es del humano, no mía.

*(En el mismo archivo, `:117` «has the three properties measured on the real file
that day» comprueba propiedades del fixture que el propio test acaba de
construir. Roza la categoría 2, pero lo dejo fuera de la cuenta: documenta el
incidente del 2026-08-19 y evita que los cuatro tests de debajo pasen en vacío si
el constructor del fixture deriva.)*

### 1.7 `trade-republic.product.parser.test.ts:474` y `:485` · **A DECIDIR (2)**

El bloque `checkBalanceEquation on its own` (`:465`) tiene tres tests:

- `:474` «returns null when it adds up» ≡ `:393` «(a) accepts the month that adds up».
- `:485` «subtracts what went out» ≡ el mismo camino que ya recorre el fixture con
  movimientos de `:393`.
- `:478` «forgives one cent in either direction and no more» → **este se queda**:
  es el único sitio donde se prueban los bordes **negativos** (−1 y −2 céntimos);
  a nivel de parser solo existen los positivos (`:418`, `:426`).

El bloque entero no sobra —lo salva `:478`—, pero dos de sus tres tests son el
mismo camino que el bloque de arriba con una capa menos.

### 1.8 `investments.model.test.ts:668`, `:678` (y medio `:738` / `:759`) · **A DECIDIR (4)**

- `:668` «creates the InvestmentProduct and Valuation tables (R22)» — si esas
  tablas no existieran, **todos** los demás tests del archivo (que insertan en
  ellas) estarían rojos antes que este.
- `:678` «adds `Movement.productId` as a nullable column» — lo mismo: `:495`
  («leaves productId null on a movement created the existing way») crea un
  movimiento sin `productId` y se pondría rojo si la columna fuera `NOT NULL`.
- La mitad de `:738` y `:759` que enumera **índices únicos** ya está probada por
  comportamiento: `:283`, `:425` y `:612` insertan duplicados y esperan el
  rechazo. Lo que ahí NO está cubierto por comportamiento —y por tanto **se
  queda**— es `Movement_productId_idx` (índice de rendimiento puro, invisible
  desde fuera) y el `expect(checks).toEqual([])` de `:738` (ausencia de CHECK,
  decisión 9 del ADR-012).

Estos cuatro son documentación de la migración escrita como test. Es una elección
defendible; solo conviene saber que se está pagando dos veces.

---

## 2. Tests que no pueden fallar nunca

Esta categoría es **la más pequeña del informe**, y eso es un elogio a la suite:
`docs/verification.md` §Anti-patrones ya prohíbe los espejos del código, y se
nota. Encontré dos sitios.

### 2.1 `src/errors/app-error.test.ts` — seis «has a default message» · **SOBRA (6)**

Líneas `:41`, `:55`, `:69`, `:83`, `:97`, `:111`. Cada uno es una sola línea, del
tipo: el mensaje por defecto de `NotFoundError` es la cadena literal que
`app-error.ts:18` escribe como valor por defecto del parámetro.

**Por qué sobran.** Es un literal comparado consigo mismo, transcrito del código
al test. No puede fallar salvo que alguien edite el valor por defecto — y
entonces falla **por haberlo editado**, no porque nada se haya roto.

Y hay una segunda razón, verificada: **ningún archivo de producción construye
nunca estos errores sin mensaje.** Comprobado sobre todo `src/` excluyendo tests:

```
grep -rnoE "new (NotFoundError|ValidationError|ConflictError|MissingAccountDataError|DriveConnectionError|UnknownBankError)\(\)" src --include=*.ts | grep -v test
→ 0 resultados
```

Es decir: las seis cadenas que estos tests fijan **no llegan nunca al humano ni
al frontend**. No son «el motivo que dice la verdad» del que habla
`docs/conventions.md` —esos son las frases en español de los parsers, y esas sí
están bien probadas y **se quedan**—; son textos de reserva en inglés que nadie ve.

**Qué dejaría de estar cubierto.** Nada que se use. El hermano de cada uno de
estos seis (`:31`, `:45`, `:59`, `:73`, `:87`, `:101`) ya prueba lo que sí importa
de cada clase: la herencia, el `code`, el `statusCode` y el `name`.

> Al hilo, un hueco que apareció mirando esto y que **no es grasa sino lo
> contrario**: `app-error.ts` declara 13 clases y este archivo prueba 7.
> `InvalidIbanError`, `NotUtf8Error`, `UnexpectedEncodingError`,
> `EmptyStatementError`, `UnreadableStatementError` y `LocalCopyNotFoundError` no
> tienen test propio aquí (sí quedan cubiertas de refilón por los parsers). Los
> seis tests que sobran y las seis clases sin probar son, curiosamente, el mismo
> número.

### 2.2 `openbank.routes.test.ts:139` — un test que se examina a sí mismo · **SOBRA (1)**

«stops POST /api/import reporting this bank .xls as skipped». El test **construye
el adaptador dentro del propio test** (`:145-149`) y luego lo interroga:

- `expect(adapter.extensions).toContain('.xls')` → comprueba que un array que la
  línea anterior rellenó con `'.xls'` contiene `'.xls'`.
- `expect(normalizeBankName('Openbank')).toBe(adapter.bank)` → duplica exactamente
  `architecture.test.ts:498`, que además lo comprueba para **los tres** bancos y
  verifica que la carpeta del módulo existe.
- `adapter.parse(...)` devuelve `bank: 'openbank'` → ya lo fija
  `openbank.statement.parser.test.ts:30`.

Y lo que el test **dice** que protege —que el importador deje de reportar este
banco como `skipped`— es exactamente lo que fija el test de **la línea de
arriba**, `:117`, que lee el registro real de `src/app.ts`. Ese sí se queda: es el
único de los dos que mira código de producción.

**Qué dejaría de estar cubierto.** Nada. Su comentario (`:140-144`) explica por
qué la suite del importador no puede hacer esta comprobación (ADR-015: tiene
prohibido nombrar un banco) y ese razonamiento vale — pero pertenece a `:117`.

---

## 3. Tests frágiles

**Aquí no hay casi nada, y conviene decirlo alto.** Fui a buscar las tres firmas
clásicas de fragilidad y las tres salen bien:

**Número de llamadas.** Cinco aserciones en toda la suite:

```
drive-structure.test.ts:283, :386   import.service.test.ts:1058, :1154   myinvestor.import.test.ts:287
```

Las cinco son `toHaveBeenCalledTimes(1|2)` sobre invariantes reales («la carpeta
se crea **una** vez aunque se pida en paralelo», «el fichero se mueve **una**
vez»), no sobre detalles de implementación. **Se quedan las cinco.**

**Orden de campos.** Las comprobaciones tipo `Object.keys(...).sort()`
(`n26.statement.parser.test.ts:397`, `bankinter.parser.test.ts:49`) van
**ordenadas**, precisamente para no depender del orden. Bien hecho. **Se quedan.**

**Texto exacto de mensajes.** Esta es la que el humano avisaba de mirar con
cuidado, y el aviso era correcto: **la inmensa mayoría de estos tests son
deliberados y se quedan.** Los motivos en español de los parsers son producto
—`docs/conventions.md` lo dice y el ADR-017 depende de ello: el guardián de
privacidad distingue «frase nuestra» de «dato suyo» comparando el motivo contra el
código de producción—. Ejemplos que **se quedan sin discusión**:

- `openbank.statement.parser.test.ts:125-175` — el motivo del re-guardado. Todo el
  sentido de la F22 es que el motivo **no mienta** («no se encuentra la cabecera»)
  y **diga qué hacer** (`Western (Windows-1252)` / `vuelve a descargarlo`). Probar
  el texto aquí no es fragilidad: es el criterio de aceptación.
- `iban.test.ts:152` — el motivo que nombra **la línea** y **el problema** del IBAN
  mal escrito. Es el producto de la F21 (ADR-021).
- `trade-republic.product.parser.test.ts:399-410` — el mensaje del descuadre, con
  sus cinco importes y la fórmula. Es la red que sustituye a la del banco
  (ADR-024), y `trade-republic.docs.test.ts:67` comprueba que el documento publica
  **la misma** fórmula.
- `iban.test.ts:125` — «never echoes the IBAN in the reason». Eso es privacidad, no
  cosmética.

La única fragilidad de texto que sí anotaría es la de §1.5: el `toEqual` de 60
líneas de `bankinter.parser.test.ts:200`, que no se rompe por un mensaje sino por
**crecer el contrato compartido**. Ya se ha roto dos veces por eso.

### 3.bis Un hallazgo que NO es grasa: una lista a mano que se quedó corta

`src/lib/iban.test.ts:172-176` mantiene la lista de parsers a mano:

```
const bankParsers = [
  'modules/bankinter/bankinter.parser.ts',
  'modules/myinvestor/myinvestor.statement.parser.ts',
  'modules/n26/n26.statement.parser.ts',
]
```

y el test `:178` se llama «is used by the parser of **every** bank». Hoy no lo es:
`openbank.statement.parser.ts:161` también usa `readPreambleIban` y **no está en
la lista**. El test pasa en verde sin haberlo mirado. No es un test que sobre — es
un test que se ha quedado corto, y se arregla derivando la lista de los
`*.parser.ts` que importan `lib/iban.js`, exactamente como ya hace
`architecture.test.ts:541` para `deriveMovementTypeFromAmount`. Merece una feature
pequeña.

---

## 4. El coste: la cifra de tests **no** es lo que se paga

La medición corrige el supuesto de partida. La suite tarda **10,2 s** de reloj, y
se reparte así:

```
import 25,10 s   ← cargar los módulos en cada worker
tests 30,86 s    ← ejecutar las aserciones
setup  4,58 s    ← preparar las bases desechables
transform 3,63 s
```

(esos segundos son la **suma de los workers**, por eso pasan de los 10 s de reloj).

Lo que cuesta es **abrir una app Fastify y una base de datos**, no correr un
`expect`. La prueba está en las dos columnas de §0:

- Los **200 tests** de los cuatro parsers más grandes: **0,19 s entre todos**. Son
  funciones puras sobre buffers construidos en código. Borrarlos los 200 ahorraría
  menos de dos décimas y destruiría la mitad de la cobertura del proyecto.
- Los **5 tests** llamados «is registered in the real app…» (`myinvestor.routes:174`,
  `n26.routes:137`, `openbank.routes:156`, `trade-republic.routes:113` y su primo
  `ingestion.routes:161`) cuestan **~1,1 s entre los cinco**: cada uno hace un
  `buildApp()` + `app.ready()` completo, con Prisma, para preguntar una sola cosa
  (`hasRoute`). Cinco tests = 11 % del reloj de la suite. Los 200 de arriba = 2 %.

**A DECIDIR (≈4 tests, ~0,9 s).** Los cinco se pueden fusionar en **uno** que
levante la app una vez y compruebe las cinco rutas de golpe. Contraargumento
legítimo: hoy cada banco es autónomo y borrar un banco entero se lleva su archivo
sin tocar nada más (`docs/conventions.md` §Parsers de banco). Contra-contra: esto
no es código de formato, es el **registro del composition root**, que ya está
centralizado en `src/app.ts` y ya tiene guardianes en `architecture.test.ts`. Yo
lo fusionaría, pero es una decisión de doctrina y no la tomo yo.

Los otros caros **se quedan, sin matices**:

- `no-real-data.test.ts` **2,75 s**, de los cuales **1,78 s** son dos tests
  (`:871` y `:856`) que recorren `var/` entero comparando frases e importes. Eso es
  el ADR-017 funcionando, y es el gasto mejor invertido de la suite.
- `import.service.test.ts` **1,35 s** / 35 tests y `movements.test.ts` **1,03 s** /
  24: son Nivel 2 obligatorio contra Postgres real (`docs/verification.md`), y sus
  35 y 24 tests nombran 35 y 24 comportamientos distintos. Los repasé uno a uno:
  **no encontré un solo duplicado**.
- `test-db.test.ts` **0,96 s**: prueba que los guardianes de la F27 están
  **cableados**, no solo escritos, y para eso tiene que dejar filas a propósito y
  ver el rojo. Ese coste es el precio de que la base del humano esté a salvo.

> Nota sobre las cifras de partida: las duraciones que se manejaban
> (`import.service` 3,6 s, `movements` 3,5 s) no se reprodujeron en esta medición
> —salen 1,35 s y 1,03 s—. Probablemente eran de antes de la F27 o de una pasada
> en frío. El reparto relativo, en cambio, sí se confirma: los archivos que tocan
> base de datos se llevan casi todo el reloj.

---

## 5. Recuento y veredicto

| Clasificación  | Tests   | Dónde |
| -------------- | ------- | ----- |
| **Sobra**      | **14**  | `app-error.test.ts` ×6 · `utf8.test.ts` ×4 · `env.test.ts` ×2 · `openbank.routes.test.ts:139` · `iban.test.ts:42` |
| **A decidir**  | **~16** | 5 «registered in the real app» → 1 (ahorra 0,9 s) · `investments.model` ×4 · `bankinter.parser.test.ts:200` · `trade-republic.product.parser` ×2 · `openbank.statement.parser` ×2 · rutas n26/openbank ×2 · `env.test.ts` ×1 |
| **Se queda**   | **846** | todo lo demás |

**Veredicto: 876 es una cifra sana para este proyecto, y no por casualidad.**

Cuatro bancos con parsers deliberadamente independientes son cuatro veces el
mismo catálogo de casos (fecha imposible, importe ilegible, fila corta, línea de
preámbulo, codificación, `daySequence`, contrato compartido) — unos 200 tests que
**son exactamente lo que hace que Openbank no rompa N26**. Un guardián de
privacidad que se prueba a sí mismo son otros 39. Cinco features seguidas de
bancos nuevos (F17 a F24) dejan cada una su rastro de criterios trazados
(Nivel 4). 876 es lo que sale de aplicar `docs/verification.md` con seriedad, no
de acumular por acumular.

La grasa que hay —14 tests, 1,6 %— es de dos tipos muy concretos y muy
reconocibles, y los dos merecen una regla más que un borrado:

1. **El eco de no-regresión** (`utf8.test.ts` ×4): cuando una feature promete «no
   he tocado esto», la prueba es que los tests de *eso* siguen verdes, no un bloque
   nuevo que los repita con otro nombre. **Regla propuesta:** un bloque de
   no-regresión solo se queda si aporta **una entrada que ningún otro test usa**.
2. **El literal comparado consigo mismo** (`app-error.test.ts` ×6,
   `openbank.routes.test.ts:139`): `docs/verification.md` §Anti-patrones ya lo
   prohíbe («tests que solo se llaman a sí mismos»). Estos siete son anteriores a
   la regla o se colaron. **Regla propuesta, para el reviewer:** si el valor
   esperado está escrito **literalmente** en el archivo que se prueba y ninguna
   llamada de producción lo alcanza, el test no compra nada.

Y lo que de verdad haría más por la suite no es quitar tests, sino dos arreglos
pequeños: la lista a mano de `iban.test.ts:172` que se dejó fuera a Openbank
(§3.bis), y fusionar los cinco `buildApp()` de §4, que valen más segundos que los
200 tests de los parsers juntos.

---

## Notas de método

- Suite ejecutada 3 veces sobre las bases desechables `gastos_test_<n>` (F27). Las
  3 pasadas terminaron en `exit 0`, lo que significa que la foto de antes y después
  de la base del humano coincidió: **no se tocó ni una fila**.
- Duraciones tomadas del reporter `json` de Vitest, por archivo y por test.
- Ningún test fue borrado, editado, movido ni renombrado durante esta auditoría.
- Este informe no contiene ni un dato real (ADR-017): no se transcribe ningún IBAN,
  importe ni concepto de ningún fichero de `var/`. Todo lo citado es código del
  repositorio o cifras de duración.
