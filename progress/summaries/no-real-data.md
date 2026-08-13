# Resumen — feature 14 `no-real-data`

Fecha de cierre: 2026-08-12
Intención original: `feature_list.json` → feature `no-real-data`, bloque `intent`
Spec: no aplica (`sdd: false`)

## Qué hace ahora la app que antes no

Antes, que no se colara un dato financiero real tuyo en el repositorio dependía de
que el agente de turno se acordara de la regla; falló dos veces seguidas y las dos
las cazó una persona leyendo, no la suite. **Ahora lo comprueba la propia suite en
cada `./init.sh`**: si alguien escribe un importe, un concepto o un IBAN tuyo en
cualquier archivo versionado, el test falla y dice **archivo, línea y motivo**. Y de
paso se ha sacado del árbol todo lo que ya se había colado desde la feature 6, que
era bastante más de lo que se sabía: tu IBAN, importes y saldos de tu extracto, el
concepto de tu nómina con el nombre de tu empresa, el nombre de una persona, tu
gimnasio y otro banco tuyo, repartidos por `src/`, `docs/`, `specs/` y `progress/`.

El guardián **no necesita tener tus datos dentro del repositorio** para funcionar:
esa era la trampa evidente y está evitada. Compara contra las capturas de `var/`,
que están gitignoreadas, y cuando no están **se salta la comparación diciéndolo**.

## Por dónde se toca (puntos de entrada)

| Cómo se usa | Código |
| --- | --- |
| El guardián entero: corre solo, con `pnpm test` y `./init.sh` | [no-real-data.test.ts:380](../../src/no-real-data.test.ts#L380) |
| Exceptuar una ruta (con su razón obligatoria al lado) | [no-real-data.test.ts:57](../../src/no-real-data.test.ts#L57) |
| Por qué se salta cuando `var/` falta o está a medias | [no-real-data.test.ts:127](../../src/no-real-data.test.ts#L127) |
| La regla escrita, que ahora apunta al guardián | [conventions.md:112](../../docs/conventions.md#L112) |
| La decisión y sus límites | [architecture.md:1219](../../docs/architecture.md#L1219) (ADR-017) |

## Dónde está el código

### El guardián (todo en un archivo, `src/no-real-data.test.ts`)

| Qué hace | Símbolo |
| --- | --- |
| Lista todo archivo versionado, incluido el nuevo sin commitear, preguntándoselo a git | `versionedFiles` |
| Recorre cada archivo línea a línea (y por pares, porque la prosa parte frases) y devuelve los hallazgos | `scan`, `report`, `Finding` |
| Capa 1 — encuentra IBAN españoles y valida su checksum mod-97 | `ibansOf`, `hasValidIbanChecksum`, `allowedIbans` |
| Capa 2 — lee las capturas de `var/`, y de un `.json` solo los valores, no los nombres de campo | `captureFiles`, `captureText`, `captureValuesText` |
| Decide si la capa 2 puede correr o hay que saltarla, y con qué explicación | `captureBranches`, `missingCaptureBranches`, `comparisonUnavailable` |
| Lee un importe escrito de cualquier forma (`9.876,54`, `9876.54`, `9 876,54`) como el mismo número | `numberPattern`, `toNumber`, `amountsOf` |
| Decide qué importe merece compararse (≥ 4 cifras significativas, y un año no) | `significantDigits`, `isTelling` |
| Caza conceptos copiados: trigramas con dos palabras poco comunes | `words`, `stopWords`, `tellingPhrases` |
| Las tres excepciones, todas explícitas y grepeables | `allowedIbans`, `allowedPaths`, `skipMarker` (`no-real-data-ok`) |

### La regla y la decisión, escritas

| Qué hace | Dónde |
| --- | --- |
| La regla de «nada real en fixtures» pasa a apuntar al guardián, con el mecanismo de excepción y lo que NO caza | `docs/conventions.md` §Tests |
| ADR-017: la estrategia de dos capas, las alternativas descartadas, los límites y los riesgos aceptados | `docs/architecture.md` |

### Archivos saneados (el dato real se fue, el ejemplo sigue enseñando lo mismo)

| Zona | Archivos |
| --- | --- |
| Tests y fixtures | `bankinter.parser.test.ts`, `accounts.test.ts`, `movements.test.ts`, `import.service.test.ts`, `investments.model.test.ts`, `myinvestor.fixture.ts`, `myinvestor.format.ts` (comentario), `myinvestor.format.test.ts`, `myinvestor.statement.parser.test.ts`, `myinvestor.product.parser.test.ts` |
| Documentación | `docs/data-model.md`, `docs/architecture.md` (ADR-012), `docs/api-contract.md`, `docs/myinvestor-product-files.md` |
| Specs | `specs/data-model/`, `specs/investments-data-model/`, `specs/myinvestor-statement/`, `specs/myinvestor-products/`, `specs/import/` |
| Bitácora | `progress/current.md`, `progress/history.md`, 7 reviews y 3 resúmenes |
| Tu propio texto | `feature_list.json` — **una** línea del `intent` de la F13 (una cifra tuya usada como ejemplo de formato: cambió el número, no el QUÉ) |

### Tests

| Qué cubre | Símbolo | Archivo |
| --- | --- | --- |
| Ningún IBAN válido fuera de los dos sintéticos documentados | `versions no well-formed Spanish IBAN…` | `src/no-real-data.test.ts` |
| Las capturas siguen gitignoreadas y ninguna está versionada | `has the local captures gitignored…` | `src/no-real-data.test.ts` |
| Ningún importe tuyo repetido en el árbol (se salta si falta `var/`) | `repeats no telling amount…` | `src/no-real-data.test.ts` |
| Ningún concepto tuyo copiado (se salta si falta `var/`) | `copies no telling phrase…` | `src/no-real-data.test.ts` |
| El guardián probado a sí mismo: checksum, notaciones, umbral, trigramas, descubrimiento por git | `the guardian itself` (6 tests) | `src/no-real-data.test.ts` |
| Se niega a comparar contra media `var/` en vez de pasar en verde | `refuses to compare against half of var/…` | `src/no-real-data.test.ts` |
| No se exceptúa a sí mismo | `is not on its own exception list…` | `src/no-real-data.test.ts` |

## Cumplimiento de la intención

- ✅ *"Cuando busco cualquiera de mis cifras o mi IBAN en los archivos del
  repositorio, no aparece ninguno."* → se cumple. Lo verifican los cuatro tests de
  `no real financial data of the human is versioned`, y el reviewer lo repitió por
  su cuenta barriendo **sin umbral**: 0 residuos a partir de 3 cifras
  significativas. Con una salvedad honesta: queda una línea de tu extracto en un
  comentario de una migración aplicada (ver «Decisiones que te devolvemos»).
- ✅ *"Cuando alguien mete un dato real mío en un test o en la documentación, la
  suite falla y me dice dónde."* → se cumple. Verificado inyectando de verdad un
  IBAN, un saldo y un concepto tuyos en un archivo versionado: fallan las tres
  capas, con `archivo:línea` y motivo.
- ✅ *"El guardián no me obliga a tener mis datos reales dentro del repositorio."*
  → se cumple. Las capturas siguen gitignoreadas; sin ellas la comparación se
  **salta con mensaje** y la capa del IBAN sigue corriendo. Probado en cinco
  variantes (falta una rama, la otra, las dos, y vacías): ninguna acaba en verde
  silencioso.
- ✅ *"Los ejemplos saneados siguen enseñando lo mismo: la aritmética cuadra y
  ningún test se vuelve trivial."* → se cumple. `saldo − gasto = saldo` en el
  extracto, `invertido + ganancia = valor de mercado` al céntimo con el efectivo
  fuera, el porcentaje cuadra a cuatro decimales y las cinco formas numéricas de
  MyInvestor siguen siendo cinco. Verificado ejemplo a ejemplo en la review.
- ✅ *"Cuando el guardián salte por algo que no es un dato real, puedo entender por
  qué y desactivarlo para ese caso sin desarmarlo entero."* → se cumple, con tres
  niveles: `no-real-data-ok` en la línea, ruta con su razón, o IBAN en lista
  blanca. Ninguno silencia la capa del IBAN salvo la lista blanca, que es su sitio.

## Decisiones que se tomaron por ti

- (delegado) **Dos capas, no una.** Solo por forma no habría cazado ni un importe;
  solo por comparación sería decorativo fuera de tu máquina, que es donde trabaja
  el agente que mete el dato. Descartadas: lista negra de valores en el repo
  (versionar tus datos para protegerlos) y hook de git (no lo ve `./init.sh`).
- (delegado) **Archivo propio** (`src/no-real-data.test.ts`), no dentro de
  `architecture.test.ts`: vigila todo el repositorio, no la forma de `src/`.
- (delegado) **La bitácora se sanea también.** Dejarla obligaba a poner una
  excepción justo encima de la fuga, y basta que alguien copie de ahí para
  reabrirla — que es literalmente lo que pasó en la F13.
- (añadido) **El guardián se vigila a sí mismo**: no está en su propia lista de
  excepciones y todos sus ejemplos son inventados. Se añadió al corregir la
  review; al quitarse la excepción, la primera ejecución cazó un dato real que
  llevaba dentro.

## Decisiones que te devolvemos (ninguna aplicada: son tuyas)

Las dos van sobre **lo único que queda dentro**: una línea entera de tu extracto
(concepto, importe, fecha y cuántas veces se repetía) en un comentario SQL de
`prisma/migrations/20260806191700_data_model/migration.sql`. No se ha tocado porque
una migración aplicada es inmutable: Prisma guarda su checksum y editarla te
obligaría a `migrate reset`, es decir, a **perder tu base de datos**.

1. **Sanear el comentario el día que la base se resetee por otro motivo.** Coste
   cero cuando llegue ese día; tus movimientos se reimportan desde Drive, que es lo
   que hoy hace de copia de seguridad. Mientras tanto, el dato sigue ahí.
2. **Editar el comentario y corregir a mano el checksum guardado** en la tabla
   `_prisma_migrations`. Lo arregla ya en tu máquina, pero es una edición manual de
   la base de datos y no sirve para la de nadie más (en una base nueva la migración
   se aplica ya saneada y no hay problema).

Mientras no elijas, el riesgo queda **declarado y acotado** en ADR-017 y en la
propia lista de excepciones del guardián.

## Qué NO se tocó / quedó fuera

- **El comportamiento de la app: nada.** Ni un parser, ni el importador, ni una
  ruta, ni el esquema. El contrato de la API es el mismo; solo cambiaron valores de
  ejemplo. Los únicos archivos no-test tocados en `src/` son un fixture y un
  comentario.
- **El histórico de git no se reescribe** (decisión tuya del 2026-08-12): las
  cifras siguen en los commits `9588389` y `0e95035`. Repositorio privado, riesgo
  conocido y aceptado. Si dejara de ser privado, sanear el árbol no bastaría.
- **Lo que el guardián no caza**, para que no confundas verde con seguro: importes
  redondos o cortos (por debajo de 4 cifras significativas), valores **derivados**
  de los tuyos (una suma que no aparece tal cual en el archivo), fechas, conceptos
  de menos de tres palabras, archivos binarios y todo lo gitignoreado. Debajo del
  umbral no hay guardián: hay lectura.

## Notas para el futuro

- `docs/verification.md` podría mencionar el guardián al listar lo que comprueba
  `./init.sh` (el criterio de la feature solo nombraba `conventions.md`).
- `tsconfig.tsbuildinfo` versionado, ya anotado en la review de la F13.
- Dos líneas del propio guardián contienen el literal del marcador de excepción y,
  por eso, quedan fuera de las capas de comparación. No llevan ningún dato; queda
  dicho para que nadie lo use como escondite.
