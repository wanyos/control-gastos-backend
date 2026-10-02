# Requirements — F51 `no-real-data-from-db`

> Fuente de verdad: el `intent` de la F51 en `feature_list.json` (borrador del
> leader con las palabras del humano del 2026-10-02). Notación EARS estricta.
> 15 requirements.
>
> «El guardián» es `src/no-real-data.test.ts` (término aprobado en
> `docs/vocabulary.md`). «La base del humano» es la base a la que apunta
> `DATABASE_URL` en `.env` **antes** de que `vitest.setup.ts` la reescriba; dentro
> de un archivo de test `DATABASE_URL` ya no apunta a ella.
>
> «Columnas comparadas» y «columnas no comparadas»: las dos listas de
> `design.md` §3. «Importe comparable»: el que hoy da por bueno `isTelling` del
> guardián (cuatro o más cifras significativas y no un entero entre 1900 y 2100),
> sin cambios. «Frase comparable»: la que hoy devuelve `tellingPhrases` (tres
> palabras seguidas, dos de ellas de cuatro letras o más y fuera de `stopWords`),
> sin cambios.
>
> Esta feature **no** quita rutas ni la carpeta `var/`, ni la comprobación de
> `vitest.global-setup.ts` que fotografía `var/` antes y después: eso es la F52.

## De dónde salen los datos con los que se compara

### R1
El guardián NO DEBE leer ni listar ningún archivo ni carpeta de `var/`.

### R2
CUANDO arranca una pasada de tests, `vitest.global-setup.ts` DEBE leer de la base
del humano los valores de las columnas comparadas y entregárselos a los archivos
de test con `provide`.

### R3
El sistema DEBE hacer esa lectura por una conexión abierta con
`default_transaction_read_only=on`, de modo que PostgreSQL rechace cualquier
escritura hecha por ella.

## Qué hace fallar la suite

### R4
CUANDO una línea de un archivo versionado contiene un importe comparable igual, en
valor absoluto, a un valor de una columna comparada de dinero, el guardián DEBE
fallar señalando archivo y línea.

### R5
CUANDO una línea de un archivo versionado, sola o unida a la siguiente, contiene
una frase comparable de un valor de una columna comparada de texto, el guardián
DEBE fallar señalando archivo y línea.

### R6
CUANDO el valor viene de `ImportUnparsedRow.reason`, el guardián DEBE tratarlo como
trata hoy el `reason` de un volcado: el mensaje entero se compara salvo las frases
que `ownSourceVocabulary` prueba que son nuestras, y lo que el mensaje lleva entre
comillas se compara siempre.

### R7
CUANDO una línea de un archivo versionado contiene, ignorando espacios, guiones y
mayúsculas, un `Account.iban` de la base del humano que no está en `allowedIbans`,
el guardián DEBE fallar señalando archivo y línea.

### R8
CUANDO un importe, una frase o un IBAN de un archivo versionado no está entre los
valores leídos de la base, el guardián NO DEBE señalarlo en la comparación.

### R9
El mensaje de fallo de la comparación NO DEBE contener el importe, la frase ni el
IBAN que ha coincidido.

## Sin datos con los que comparar

### R10
MIENTRAS la base del humano no tenga ningún valor de un tipo (importes, frases o
IBAN), por no tener filas o por no tener las tablas, el guardián DEBE saltarse la
comparación de ese tipo sin fallar.

### R11
CUANDO el guardián se salta una comparación por R10, DEBE escribir en el
descriptor 2 una línea que diga qué tipo no ha podido comparar.

## Lo que no cambia

### R12
El guardián DEBE seguir fallando ante cualquier IBAN español con checksum válido
que no esté en `allowedIbans`, sin leer `var/` ni la base de datos.

### R13
El guardián DEBE seguir aplicando a la comparación de importes y de frases las
excepciones que tiene hoy (las rutas de `allowedPaths` y la marca
`no-real-data-ok` en la línea), y NO DEBE aplicarlas a la comparación de IBAN.

## Que una columna nueva no se quede sin decidir

### R14
SI `prisma/schema.prisma` tiene una columna `Decimal` o `String` que no está ni en
la lista de columnas comparadas ni en la de no comparadas ENTONCES la suite DEBE
fallar nombrando la tabla y la columna.

## Documentos

### R15
`docs/conventions.md`, `docs/architecture.md` (ADR-017 y ADR-027),
`docs/data-model.md`, `docs/trade-republic-product-files.md` y
`docs/myinvestor-product-files.md` DEBEN describir que la comparación se hace
contra la base de datos y no contra los archivos de `var/`.

---

## Cobertura de `como_se_que_esta_bien`

| Frase del intent | Requirements |
|---|---|
| Si un importe, un concepto o un IBAN que está en mi base aparece en un archivo versionado, la suite falla diciendo archivo y línea | R2, R4, R5, R6, R7 |
| Un dato inventado de un fixture, que no está en mi base, no hace fallar la suite | R8 |
| La comprobación funciona igual con la carpeta `var/` borrada | R1 |
| La comprobación solo lee mi base: después de la suite está exactamente igual | R3 (y la comprobación de antes y después que ya hace `vitest.global-setup.ts`, ADR-027, que no se toca) |
| Con la base vacía la suite no falla: el IBAN por su forma sigue y la comparación avisa | R10, R11, R12 |

`que_no_quiero`: IBAN por su forma intacto → R12; ningún test escribe en la base →
R2, R3; el mensaje no enseña el dato → R9; no se quitan rutas ni `var/` → cabecera.

## Procedencia

- R1 — (humano) «deje de leer los archivos de var/» y «funciona igual con la
  carpeta var/ borrada».
- R2 — (delegado) El humano cedió «si se compara contra mi base directamente o
  contra otra cosa». Decido: contra su base directamente, leída **solo** por
  `vitest.global-setup.ts` (que ya la abre hoy), y entregada a los tests en
  memoria. Descartado: tablas con datos inventados (no cazan ningún dato suyo) y
  que el test abra él la conexión (rompe «un test no abre nunca la base del
  humano» de `docs/conventions.md`). ← REVISAR (decisions 🔴 1).
- R3 — (humano) «La comprobación solo lee mi base» y «no quiero que ningún test
  escriba en mi base». El mecanismo (sesión de solo lectura de PostgreSQL) es
  (delegado). Comprobado el 2026-10-02 en `gastos_test_1`: con esa opción un
  `INSERT` se rechaza con el error 25006.
- R4 — (humano) el fallo con archivo y línea; (delegado) qué columnas y qué umbral.
  Decido: todas las columnas de dinero y el umbral de hoy. ← REVISAR (decisions
  🔴 2 y 🔴 3).
- R5 — (humano) el fallo con archivo y línea; (delegado) qué columnas de texto.
  ← REVISAR (decisions 🔴 2).
- R6 — (añadido) El humano no dijo nada de los motivos de las filas que el parser
  no pudo leer (F48). Son frases nuestras con valores suyos dentro, el mismo caso
  que la F24 resolvió para el volcado; propongo el mismo trato. Hoy la tabla tiene
  0 filas: no está probado con datos reales. ← REVISAR (decisions ⚙️ 1).
- R7 — (humano) «o un IBAN que está en mi base de datos». Que no admita la marca ni
  la lista de rutas es (delegado), igual que la comprobación por forma.
- R8 — (humano) «Un dato inventado de un fixture… no hace fallar la suite».
- R9 — (humano) «No quiero que el mensaje de fallo enseñe el dato real».
- R10 — (humano) «En un ordenador con la base de datos vacía la suite no falla por
  esto». Que «sin las tablas» cuente como vacía es (añadido).
- R11 — (humano) «la comparación avisa de que no tiene con qué comparar». Que el
  aviso vaya al descriptor 2 es (delegado): comprobado el 2026-10-02 que la nota de
  un test saltado no sale con el reporter por defecto de vitest 5.0.1.
- R12 — (humano) «No quiero que la comprobación de IBAN por su forma… se quite ni
  cambie».
- R13 — (delegado) El humano cedió «qué pasa con las excepciones que hoy tiene la
  comprobación». Decido: se quedan igual. ← REVISAR (decisions 🔴 6).
- R14 — (añadido) El humano no lo pidió. Hoy el guardián tiene un test que se pone
  rojo cuando aparece un banco que no puede leer; al cambiar de fuente, el caso
  equivalente es una columna nueva que nadie ha dicho si se compara. ← REVISAR
  (decisions 🔴 2).
- R15 — (delegado) El humano cedió «qué documentos hay que corregir». En
  `docs/verification.md` no hay nada que describa la comparación contra `var/`
  salvo relato histórico; su frase sobre el archivo real de `var/drive-read/` es de
  la F52.
