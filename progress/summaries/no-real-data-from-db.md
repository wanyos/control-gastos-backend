# Resumen — feature 51 `no-real-data-from-db`

Fecha de cierre: 2026-10-02
Intención original: `feature_list.json` → feature `no-real-data-from-db`, bloque `intent`
Spec (si SDD): `specs/51-no-real-data-from-db/`

## Qué hace ahora la app que antes no

La aplicación no cambia: no hay rutas nuevas, ni migración, ni cambio en la API. Lo
que cambia es el guardián `src/no-real-data.test.ts`: ya no lee los archivos de
`var/` para saber qué datos son tuyos, sino que compara cada archivo versionado
contra lo que hay en tu base de datos (importes, textos e IBAN). Tu base la lee solo
`vitest.global-setup.ts`, al arrancar la pasada de tests, por una conexión que
PostgreSQL abre en solo lectura, y pasa los valores a los tests en memoria.

## Por dónde se toca (puntos de entrada)

| Cómo se usa | Código |
| --- | --- |
| Al arrancar `pnpm test`: lee tu base y entrega los valores a los tests | [vitest.global-setup.ts:69](../../vitest.global-setup.ts#L69) |
| La lectura de las columnas comparadas, en solo lectura | [test-real-data.ts:127](../../src/lib/test-real-data.ts#L127) |
| La lista de columnas que se comparan (aquí se apunta una columna nueva) | [test-real-data.ts:27](../../src/lib/test-real-data.ts#L27) |
| Donde el guardián recibe esos valores y los prepara para comparar | [no-real-data.test.ts:650](../../src/no-real-data.test.ts#L650) |
| El primero de los tres tests que comparan el repositorio contra tu base | [no-real-data.test.ts:685](../../src/no-real-data.test.ts#L685) |

## Dónde está el código

### Lectura de tu base de datos

| Qué hace | Dónde |
| --- | --- |
| Forma de lo que se entrega a los tests: importes, textos, mensajes nuestros e IBAN | [test-real-data.ts](../../src/lib/test-real-data.ts) → `RealDataReference` |
| Columnas que se comparan y de qué tipo es cada una | [test-real-data.ts](../../src/lib/test-real-data.ts) → `comparedColumns` |
| Columnas que no se comparan, cada una con su motivo | [test-real-data.ts](../../src/lib/test-real-data.ts) → `notComparedColumns` |
| Abre la conexión de solo lectura: PostgreSQL rechaza cualquier escritura por ella | [test-real-data.ts](../../src/lib/test-real-data.ts) → `withReadOnlyClient` |
| Lee los valores distintos de cada columna comparada; una tabla que no existe no aporta nada | [test-real-data.ts](../../src/lib/test-real-data.ts) → `readRealDataReference` |
| Llama a esa lectura con la URL de tu base y hace `provide('realDataReference', …)` | [vitest.global-setup.ts](../../vitest.global-setup.ts) → `setup` |

### Comparación en el guardián

| Qué hace | Dónde |
| --- | --- |
| Recibe lo leído con `inject`; si no llega nada, falla en vez de pasar en silencio | [no-real-data.test.ts](../../src/no-real-data.test.ts) → `databaseComparison` |
| Reduce lo leído a lo que merece compararse (importes de cuatro cifras o más, frases de tres palabras, IBAN que no son los dos de ejemplo); incluye los importes escritos dentro de un motivo de `ImportUnparsedRow.reason` | [no-real-data.test.ts](../../src/no-real-data.test.ts) → `comparisonOf` |
| Separa lo tuyo de nuestras propias frases dentro de un motivo | [no-real-data.test.ts](../../src/no-real-data.test.ts) → `referencePhraseSources`, `comparablePhrases` |
| Busca en una línea un importe, una frase o un IBAN de la base | [no-real-data.test.ts](../../src/no-real-data.test.ts) → `amountLeak`, `phraseLeak`, `ibanLeak` |
| Textos del fallo: dicen el tipo de coincidencia, nunca el valor | [no-real-data.test.ts](../../src/no-real-data.test.ts) → `amountReason`, `phraseReason`, `ibanReason` |
| Dice qué tipo no se pudo comparar y lo escribe en el descriptor 2 | [no-real-data.test.ts](../../src/no-real-data.test.ts) → `kindsWithNothingToCompare`, `skippedAnnouncement`, `announceSkipped` |
| Lista los archivos versionados sin preguntar si existen; el borrado se descarta al leerlo | [no-real-data.test.ts](../../src/no-real-data.test.ts) → `versionedFiles`, `versionedSources` |
| Borrado: todo lo que solo servía para leer archivos de `var/` (lectura por contenido, bancos que no se podían leer, nombres de archivo publicados) | [no-real-data.test.ts](../../src/no-real-data.test.ts) |

### Líneas del repositorio que coincidían con tu base

| Qué hace | Dónde |
| --- | --- |
| Un importe inventado cambiado por otro | [investments.deposits.test.ts](../../src/modules/investments/investments.deposits.test.ts) → `deposit earnings (feature 50)` |
| Un importe inventado cambiado por otro | [transfers.service.test.ts](../../src/modules/transfers/transfers.service.test.ts) → `detectTransfers (database)` |
| Pares de números de línea escritos con « y » en vez de coma | [history.md](../history.md), [drive-connection.md](drive-connection.md), [data-model.md](../reviews/data-model.md) |
| Una duración redondeada al segundo | [import-run-totals.md](../reviews/import-run-totals.md) |
| La frase de la prueba real, reescrita sin ninguna cifra | [prueba-real-importacion-2026-09-12.md](../explorations/prueba-real-importacion-2026-09-12.md) |
| Dos palabras de una frase cambiadas de orden | [decisions.md de la feature 20](../../specs/20-trade-republic-product-file/decisions.md) |
| Comentario de cabecera que remitía a una lista borrada (solo el comentario) | [trade-republic.fixture.ts](../../src/modules/trade-republic/trade-republic.fixture.ts) |

### Documentos

| Qué hace | Dónde |
| --- | --- |
| Reglas del guardián reescritas: de dónde salen los datos, qué mira, qué no caza, base vacía, columna nueva | [conventions.md](../../docs/conventions.md) → §Tests y §Tests con base de datos |
| Línea «Revisado el 2026-10-02 por la feature 51» encima de los ADR-017, ADR-024 y ADR-027 | [architecture.md](../../docs/architecture.md) |
| Quitados el comentario y las dos marcas `no-real-data-ok` del enum | [data-model.md](../../docs/data-model.md) → `InvestmentProductType` |
| Quitada la nota «Esta línea la lee un test» | [trade-republic-product-files.md](../../docs/trade-republic-product-files.md) |
| Quitada la nota sobre el guardián y los nombres de archivo | [myinvestor-product-files.md](../../docs/myinvestor-product-files.md) |

### Tests

| Qué cubre | Dónde |
| --- | --- |
| La lectura devuelve cada valor en su lista y nada de las columnas no comparadas | [test-real-data.test.ts](../../src/lib/test-real-data.test.ts) → `reads the compared columns of a database` |
| Una escritura por la conexión de solo lectura se rechaza y no deja fila | [test-real-data.test.ts](../../src/lib/test-real-data.test.ts) → `rejects a write through the read-only connection` |
| Una base sin las tablas da cuatro listas vacías | [test-real-data.test.ts](../../src/lib/test-real-data.test.ts) → `reads an empty reference from a database with no application tables` |
| Una columna de dinero o de texto sin decidir pone la suite roja | [test-real-data.test.ts](../../src/lib/test-real-data.test.ts) → `holds the inventory of money and text columns EXACTLY, so a new column turns it red` |
| Un importe, un concepto y un IBAN de la base copiados a un archivo saltan con archivo y línea, sin el valor en el mensaje | [no-real-data.test.ts](../../src/no-real-data.test.ts) → `catches an amount of the database…`, `catches a concept of the database…`, `catches an IBAN of the database…` |
| Un dato inventado que no está en la base no salta | [no-real-data.test.ts](../../src/no-real-data.test.ts) → `says nothing about an invented amount, concept or IBAN that is not in the database` |
| Importes por valor absoluto; cortos, redondos y años fuera | [no-real-data.test.ts](../../src/no-real-data.test.ts) → `compares an amount by its absolute value, and leaves a short or round one out` |
| Los dos IBAN de ejemplo no se comparan | [no-real-data.test.ts](../../src/no-real-data.test.ts) → `compares neither of the two documented synthetic IBANs, even if an account has one` |
| La marca y la lista de rutas valen para importes y frases, nunca para un IBAN | [no-real-data.test.ts](../../src/no-real-data.test.ts) → `keeps the path and marker exceptions for amounts and phrases, never for an IBAN` |
| El guardián no importa nada con lo que listar una carpeta | [no-real-data.test.ts](../../src/no-real-data.test.ts) → `imports nothing that can list or walk a folder` |
| Base sin datos: la comparación se salta y lo dice por el descriptor 2 | [no-real-data.test.ts](../../src/no-real-data.test.ts) → `skips the comparison and says so when the database has nothing to compare against` |
| Los tres tests que comparan el repositorio entero contra tu base | [no-real-data.test.ts](../../src/no-real-data.test.ts) → `repeats no telling amount of the database`, `copies no telling phrase of the database`, `repeats no IBAN of the database` |
| Nuestras frases dentro de un motivo no saltan; los valores tuyos de dentro sí (15 tests) | [no-real-data.test.ts](../../src/no-real-data.test.ts) → `the guardian tells our own words from his data inside a message (feature 24)` |
| IBAN español por su forma, sin cambios | [no-real-data.test.ts](../../src/no-real-data.test.ts) → `versions no well-formed Spanish IBAN other than the documented synthetic ones` |

## Cumplimiento de la intención

- ✅ "Si un importe, un concepto o un IBAN que está en mi base de datos aparece en
  un archivo versionado del repositorio, la suite falla diciendo archivo y línea." →
  se cumple; lo verifican los tres tests `catches …`.
  Check: ✅ `pnpm exec vitest run src/no-real-data.test.ts -t "catches an? (amount|concept|IBAN) of the database"` (`3 passed | 33 skipped`).
  Además lo provoqué con una base aparte con una fila inventada: `./init.sh` salió
  con código 1 y las líneas de fallo decían archivo, línea y tipo, sin el valor.
- ✅ "Un dato inventado de un fixture, que no está en mi base de datos, no hace
  fallar la suite." → se cumple; lo verifica `says nothing about an invented amount,
  concept or IBAN that is not in the database`. Check: ✅ (`1 passed | 35 skipped`).
- ✅ "La comprobación funciona igual con la carpeta var/ borrada." → se cumple por
  construcción; lo verifica `imports nothing that can list or walk a folder`.
  Check: ✅ (`1 passed | 35 skipped`). Nadie ha borrado `var/` de verdad para
  probarlo: eso lo haces tú en la feature 52.
- ✅ "La comprobación solo lee mi base de datos: después de la suite está
  exactamente igual que antes." → se cumple; lo verifica `rejects a write through the
  read-only connection`, y la comprobación de `vitest.global-setup.ts` que compara tu
  base antes y después. Checks: ✅ el del test (`1 passed | 3 skipped`) y ✅ `pnpm test`.
- ✅ "En un ordenador con la base de datos vacía la suite no falla por esto: la
  comprobación de IBAN por su forma sigue funcionando y la comparación avisa de que no
  tiene con qué comparar." → se cumple; lo verifican `skips the comparison and says so
  when the database has nothing to compare against` y `versions no well-formed Spanish
  IBAN other than the documented synthetic ones`. Checks: ✅ los dos
  (`1 passed | 35 skipped` cada uno). Lanzado además contra una base migrada y sin
  filas: código de salida 0 y las tres líneas de aviso en la salida.

## Decisiones que se tomaron por ti

- (delegado) Se compara contra tu base de verdad, no contra tablas con datos
  inventados; la lee solo `vitest.global-setup.ts`.
- (delegado) Qué se compara: todas las columnas de dinero; descripción y nota del
  movimiento, nombre del producto, alias de la cuenta, texto de tus reglas de
  categoría y nota del descuadre; y el IBAN de tus cuentas. No se comparan los
  nombres de categoría ni los nombres de archivo.
- (delegado) Los importes se comparan como antes: cuatro o más cifras significativas
  y que no parezcan un año.
- (delegado) Las excepciones se quedan igual: `prisma/migrations/` y la marca
  `no-real-data-ok`, solo para importes y frases. Un IBAN de tu base no admite ninguna.
- (delegado) El aviso de «no tengo con qué comparar» va al descriptor 2.
- (añadido) Los motivos de las filas que el parser no pudo leer
  (`ImportUnparsedRow.reason`) se tratan como frases nuestras con valores tuyos
  dentro. Hoy esa tabla tiene 0 filas: no está probado con datos tuyos.
- (añadido) Una columna de dinero o de texto nueva que nadie haya apuntado en una de
  las dos listas pone la suite roja.
- (añadido) Una base sin las tablas cuenta como base vacía.
- Desviación del diseño, aceptada por el leader: los importes escritos dentro de un
  motivo de `ImportUnparsedRow.reason` también se comparan.

## Qué NO se tocó / quedó fuera

- Ni las rutas ni la carpeta `var/`, ni la comprobación de `vitest.global-setup.ts`
  que compara `var/` antes y después de la suite: es la feature 52.
- El test que exige que `var/drive-read/` y `var/parsed/` sigan en `.gitignore`.
- La comprobación de IBAN español por su forma.
- El cuerpo de los ADR: solo llevan encima una línea de revisión.

## Notas para el futuro (opcional)

- Lo que no hayas importado a la base no se vigila: un banco nuevo o un archivo aún
  sin importar no existe para el guardián. Tampoco los `.xls` ni `.pdf` del
  repositorio, que el guardián no lee (lección 3 de `docs/lessons.md`).
- La suite puede ponerse roja después de una importación sin que nadie haya tocado el
  repositorio, si un importe nuevo tuyo coincide con uno inventado de un test. Se
  arregla inventando otro valor en la línea que señale.
- Mira cómo quedó la frase de la prueba real del 2026-09-12: eres quien sabe si
  aquella cifra era tuya.
- No borres `var/` todavía: la feature 52 la necesita hasta que se cierre.
- El título del ADR-017 sigue diciendo «comparación contra `var/`» y
  `docs/verification.md` sigue pidiendo el archivo de `var/drive-read/`: las dos
  cosas están apuntadas en `decisions.md` como incoherencias que se heredan.
- Que el implementer no modificó los `checks` no se pudo comprobar con git (la
  feature entera estaba sin commitear); se apoya en lo que afirma el leader.
