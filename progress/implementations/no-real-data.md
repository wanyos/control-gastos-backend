# no-real-data — implementación

> Feature 14, `sdd: false`. Fuente: el `intent` y los 10 criterios de `acceptance`
> de `feature_list.json`. **Sin commitear** y **sin marcar `done`**: pendiente del
> `reviewer`.

## 0. Lo primero, porque cambia la foto: había bastante más de lo listado

La lista del reviewer de la F13 era el punto de partida, no el techo. Barriendo el
árbol **comparando contra las capturas gitignoreadas de `var/`** aparecieron tres
cosas que nadie había visto:

1. **El IBAN real del humano seguía en `src/modules/bankinter/bankinter.parser.test.ts`**
   (dos veces: en el preámbulo del fixture y en la aserción). Es la fuga de la F12
   que se dio por cerrada: la review de entonces buscó **otro** IBAN.
2. **Las líneas de su extracto de Bankinter estaban repartidas por todo el
   repositorio desde la F6**: importes y saldos reales, el concepto de su nómina
   —con el **nombre de su empresa**—, el **nombre y apellidos de una persona** que
   le hizo una transferencia, el nombre de su **gimnasio** y el de otro banco suyo.
   Estaban en `src/` (4 archivos de test), `docs/`, `specs/` y `progress/`.
3. **La review de la F12 citaba el IBAN viejo entero**, en el mismo párrafo en el
   que declaraba la fuga cerrada.

Además, del extracto CSV de MyInvestor no solo era sospechoso un concepto: las
**cinco formas numéricas** del fixture de la F10 eran sus cinco importes reales.

## 1. Archivos modificados / creados

**Creado**

- `src/no-real-data.test.ts` — el guardián (10 tests).

**El guardián y su regla**

- `docs/conventions.md` §Tests — la regla ahora apunta al guardián, con el
  mecanismo de excepción, los límites conocidos y qué se hace con la bitácora.
- `docs/architecture.md` — **ADR-017** con la estrategia, las alternativas
  descartadas y los límites.

**Saneados (≈45 archivos).** Por zonas, sin repetir ningún valor aquí:

- `src/`: `bankinter.parser.test.ts`, `accounts.test.ts`, `movements.test.ts`,
  `import.service.test.ts`, `investments.model.test.ts`, y del módulo de MyInvestor
  `myinvestor.fixture.ts`, `myinvestor.format.ts` (comentario), `myinvestor.format.test.ts`,
  `myinvestor.statement.parser.test.ts`, `myinvestor.product.parser.test.ts`.
- `docs/`: `data-model.md`, `architecture.md` (ADR-012), `api-contract.md`,
  `myinvestor-product-files.md`.
- `specs/`: `data-model/`, `investments-data-model/`, `myinvestor-statement/`,
  `myinvestor-products/`, `import/`.
- `progress/`: `current.md`, `history.md`, 7 reviews y 3 resúmenes.
- `feature_list.json` — **una** línea (ver §3, punto 5).

**Deliberadamente NO tocados:** `prisma/migrations/**` (ver §3, punto 4), ningún
parser, ningún servicio, ninguna ruta, ningún schema. El contrato de la API no
cambia: solo cambian los **valores de ejemplo** de `api-contract.md`.

## 2. 🔴 La estrategia del guardián, marcada explícitamente (criterio 4)

**Elegí las dos capas, y creo que es lo único honesto.** Cada una sola es
insuficiente por un motivo distinto:

| Capa | Qué caza | Cuándo funciona |
| --- | --- | --- |
| **1 — Por forma** (siempre activa) | Cualquier IBAN español con **checksum mod-97 válido** que no esté en la lista blanca | **Siempre**, en cualquier máquina, sin necesitar nada |
| **2 — Por comparación** con `var/` | Importes de ≥ 4 cifras significativas en cualquier notación, y trigramas de palabras poco comunes (conceptos copiados) | Solo donde estén las capturas; si no, **se salta con un mensaje** |

- **Solo por forma sería decorativo:** no habría cazado ni uno de los importes de
  la F13. Un número no tiene checksum: el suyo y el inventado que lo sustituye son
  igual de «válidos».
- **Solo por comparación sería decorativo en el sitio que importa:** las capturas
  están solo en la máquina del humano, y **el que mete el dato suele ser un agente
  en otra sesión y en otra máquina**. Ahí la capa 2 se salta y solo queda la 1.
- **Descartado por prohibición expresa del `intent`:** una lista negra de valores
  dentro del repositorio (sería versionar los datos para protegerlos) y cualquier
  cosa que haya que mantener a mano cuando sus cifras cambien. Nada del guardián
  se toca cuando él actualice sus capturas: las lee cada vez.
- **Descartado por alcance:** un hook de git — no se ejecuta en la máquina del
  agente, no lo ve `./init.sh` y se salta con `--no-verify`.

### Qué NO cubre (léase antes de fiarse del verde)

1. **Importes redondos o cortos.** El umbral es **≥ 4 cifras significativas**: un
   importe redondo o de tres cifras no se distingue de uno inventado, y comparar
   por debajo inundaba la suite de falsos positivos (con el umbral en 1 salían 47
   archivos, la mitad ruido tipo `pageSize: 1000`).
   🔴 **Esto obliga a una pasada manual, y en la primera vuelta no la hice bien:**
   di por inventados dos importes suyos que sí estaban en las capturas. Corregido
   en la segunda vuelta (§8), y anotado en el ADR-017: **por debajo del umbral no
   hay guardián, hay lectura**.
2. **Valores derivados.** Una **suma** de dos cifras suyas que no aparece tal cual
   en la captura. Pasó de verdad: un spec decía «si el banco lo llevara dentro, la
   cartera marcaría X», donde X era `marketValue + efectivo`. Lo encontré leyendo,
   no con el guardián.
3. **Fechas.** Su fecha de vencimiento o las de sus movimientos. Meterlas daba
   demasiado ruido (medio repositorio habla de `2026-07-31`).
4. **Conceptos de menos de tres palabras.** Un nombre de proveedor suelto no salta
   (me lo encontré: el nombre de su gimnasio suelto en dos specs). Con tres
   palabras y dos poco comunes, sí.
5. **Lo binario y lo no versionado.** Las capturas se leen en texto, así que su
   `.xlsx` de Bankinter **solo** es comparable a través del volcado derivado
   `var/parsed/**.json`. De ahí el punto ciego que encontró el reviewer y que ya
   está tapado: con `var/drive-read/` presente y `var/parsed/` ausente, el
   guardián comparaba contra **media captura** y pasaba en verde sin decir nada.
   Ahora **exige las dos ramas** y, si falta una, **se salta nombrándola**
   (verificado: con `var/parsed/` fuera y saldos suyos inyectados → `2 skipped`, no
   verde). Sigue sin mirar `pnpm-lock.yaml` ni nada gitignoreado.
6. **El histórico de git.** Por decisión suya (ver §3, punto 3).
7. **La migración aplicada.** Ver §3.4: es la única exclusión de ruta y guarda
   dentro **una línea entera de su extracto**.

### El mecanismo de excepción (criterio 5)

Tres niveles, todos explícitos y grepeables, ninguno desarma el guardián:

1. `no-real-data-ok` **en la línea**, con el motivo al lado → esa línea se salta en
   las capas de comparación. **No** silencia la capa del IBAN.
2. `allowedPaths` en el guardián: prefijo de ruta **con su razón escrita**. Solo
   hay **una** entrada, `prisma/migrations/` (§3.4).
3. `allowedIbans`: los dos IBAN sintéticos documentados.

**El guardián NO se exceptúa a sí mismo** (corregido en la segunda vuelta). Se
escanea como cualquier otro archivo: todos sus ejemplos son inventados, porque solo
tienen que tener la **forma** correcta, nunca ser ciertos. Hay un test que lo fija
(`is not on its own exception list`), y la corrección se cobró sola: al quitar la
excepción, el guardián señaló un importe real que yo mismo había dejado en un
comentario suyo.

## 3. Decisiones tomadas

1. **Archivo propio, `src/no-real-data.test.ts`, no dentro de `architecture.test.ts`**
   (delegación explícita). Guarda **todo el repositorio** —`docs/`, `specs/`,
   `progress/`, `prisma/`—, no la forma de `src/`, que es de lo que trata el otro; y
   son ~200 líneas con su propio vocabulario.
2. **La bitácora histórica SÍ se sanea** (delegación explícita). `history.md`, las
   7 reviews y los 3 resúmenes son archivos versionados como cualquier otro: dejarlos
   obligaba a poner una excepción justo donde está la fuga, y bastaría que alguien
   copiara de ahí para reabrirla —que es **exactamente** lo que pasó en la F13, que
   copió sus cifras del `design.md`—. Donde la frase decía «los números de tu muestra
   real» ahora dice que son **inventados**, para que nadie los «corrija» de vuelta.
   La review de la F13 ya había sentado el precedente redactando su propia primera
   pasada.
3. **El histórico de git NO se toca** (decisión del humano del 2026-08-12). Las
   cifras siguen en `9588389` y `0e95035`; repositorio privado; **riesgo conocido y
   aceptado**. Anotado en el ADR-017. Consecuencia práctica: si dejara de ser
   privado, sanear el árbol no basta.
4. **`prisma/migrations/` queda excluida, con su razón — y dicha sin rebajarla.**
   Edité el comentario SQL de una migración aplicada y lo revertí al comprobar que
   Prisma **detecta el cambio y exige `migrate reset`** (probado: `prisma migrate
   dev` pidió resetear la base de datos).
   🔴 **Lo que queda dentro NO es «el nombre de un banco»** —así lo describí en la
   primera vuelta y era describir el riesgo a la baja—: es **una línea entera de su
   extracto** en un comentario (concepto, importe, fecha y cuántas veces se repetía).
   **Nada más hay en esa carpeta.** Corregido en el ADR-017 y en el propio guardián.
   **Formas de cerrarlo, las dos decisión suya y ninguna aplicada aquí:**
   (a) sanear el comentario el día que la base se resetee por otro motivo —los
   movimientos se reimportan de Drive, que es lo que hoy hace de copia de
   seguridad—; (b) editar el comentario y **corregir a mano el checksum guardado**
   en `_prisma_migrations`, que arregla su máquina pero no la de nadie más (en una
   base nueva la migración se aplica ya saneada y no hay problema).
   Mientras tanto: **riesgo residual declarado y aceptado.**
5. **Toqué una línea escrita por el humano**, en su `intent` de la F13 en
   `feature_list.json`: usaba una cifra suya como ejemplo de formato. Cambié **solo
   el número**; el QUÉ no se ha tocado. Lo señalo porque es material suyo.
6. **Valores nuevos: sintéticos y con la aritmética intacta.** El extracto sigue
   cumpliendo `saldo_anterior − gasto = saldo_posterior` (es lo que demuestra que
   Bankinter exporta del más reciente al más antiguo, y de ahí sale el
   `daySequence`); en inversiones sigue cumpliéndose `invertido + ganancia =
   valor de mercado` **al céntimo** con el efectivo fuera, y el `gainPercent` sigue
   cuadrando con `ganancia / invertido` a cuatro decimales; el depósito sigue
   teniendo dos TAE de las que solo se guarda la aplicada, y sus intereses siguen
   siendo los que salen de aplicar esa TAE al principal durante el plazo.
   **Ninguna aserción se volvió trivial:** las de igualdad exacta siguen siéndolo, el
   test de «la ganancia se lee, no se calcula» sigue usando cifras que **no** cuadran
   a propósito, el de precisión sigue con decimales no redondos y cuatro decimales de
   porcentaje, y el de las cinco formas numéricas de MyInvestor sigue ejerciendo las
   cinco (entero, coma decimal, cuatro dígitos, miles con punto, miles + decimal).
7. 🔴 **CORREGIDO EN LA SEGUNDA VUELTA — esto decía lo contrario de lo que hay.**
   La primera versión afirmaba que dos importes «resultaron no ser suyos» y los
   dejó. **Los dos están en las capturas**: el de los recibos y el de las tres
   líneas idénticas —este además viaja con su fecha y con el número de veces que se
   repetía, que es lo que lo identifica—. No los cazó el guardián porque caen bajo
   el umbral, que es exactamente por lo que había que mirarlos a mano; y la pasada
   a mano de la primera vuelta se los saltó. **Ya están saneados** (§8), en los 11
   sitios que listó el reviewer más los que arrastraban con ellos.
   Lo que sí es genérico y se queda: el `1000` de `pageSize` y los saldos redondos
   sin concepto asociado de `movements.test.ts` (no salen de ninguna captura junto a
   un concepto suyo).

## 4. Mapeo criterio de `acceptance` → dónde se verifica

| # | Criterio | Verificación |
| --- | --- | --- |
| 1 | Ningún dato real en archivo versionado | `no-real-data.test.ts` → los tres tests de `describe('no real financial data…')` pasan sobre el árbol; barrido independiente adicional a mano, 0 coincidencias |
| 2 | Guardián que falla y dice dónde | `src/no-real-data.test.ts`, en `pnpm test` / `./init.sh`. Comprobado inyectando un importe, un concepto y el IBAN reales en un archivo cualquiera: **falla y los señala con `archivo:línea` y motivo** |
| 3 | No exige los datos dentro del repo | Las dos capas de comparación llaman a `context.skip()` con mensaje. Verificado moviendo `var/` entera fuera (**2 skipped, 0 failed**, y la capa por forma siguió corriendo) **y** moviendo solo `var/parsed/` con saldos suyos inyectados (**2 skipped**, ya no verde silencioso) |
| 4 | Estrategia anotada y marcada | §2 de este informe + **ADR-017** |
| 5 | Se puede silenciar un caso sin desarmarlo | `no-real-data-ok`, `allowedPaths`, `allowedIbans`; documentado en la cabecera del guardián y en `docs/conventions.md` §Tests |
| 6 | La enseñanza se conserva | §3.6. Toda la suite en verde **sin relajar una sola aserción** |
| 7 | Sin rewrite de git | Cero comandos de historia; riesgo anotado en ADR-017 y en §3.3 |
| 8 | Sin cambiar comportamiento | Solo se tocaron tests, fixtures, comentarios y documentación. Ni un `*.parser.ts`, `*.service.ts`, `*.routes.ts` o `*.schema.ts` de producción cambió de lógica (el único cambio en `myinvestor.format.ts` es un comentario). 372 tests verdes |
| 9 | Bitácora resuelta y anotada | §3.2 + `docs/conventions.md` §Tests |
| 10 | `./init.sh` verde + `conventions.md` apuntando al guardián | §5 |

Tests del propio guardián (que es código, y también se prueba): reconoce un IBAN
válido y rechaza uno inválido; lee el mismo importe en cuatro notaciones, incluida
la del separador de miles con espacio; solo compara importes con suficientes cifras
significativas; solo compara frases con palabras poco comunes; **se niega a comparar
contra media `var/` y nombra la rama que falta**; **no está en su propia lista de
excepciones**; y descubre los archivos por `git`, no por una lista a mano.

## 5. Último `./init.sh`

```
[OK] Type check OK (tsc sin errores)
Test Files  26 passed (26)
     Tests  372 passed (372)
[OK] Entorno listo. Puedes empezar a trabajar.
```

`pnpm run lint` limpio · `pnpm run format:check` verde.

## 6. Para el reviewer: dónde mirar con lupa (segunda vuelta)

1. **La pasada manual por debajo del umbral** (§8.2): es la que fallé, y la que
   ningún test puede hacer por mí.
2. **Que el saneamiento no haya estropeado una enseñanza**, ahora también con los
   valores nuevos de la segunda vuelta (§8.2).
3. **La excepción de `prisma/migrations/`** (§3.4): es la única fuga que queda
   dentro a sabiendas, ya descrita por lo que es.
4. **Que el guardián ya no se exceptúa** y que ninguno de sus ejemplos es real
   (§8.1).
5. **Los siete límites del §2**: que estén bien contados y que no prometa de más.

## 7. Sugerencias fuera de scope (NO aplicadas)

1. **La copia de `.harness-backup-20260812-155024/`** no está gitignoreada, así que
   el guardián la escanea (hoy limpia). O se ignora o se borra; no es de esta
   feature.
2. **`tsconfig.tsbuildinfo` versionado** — ya lo anotó el reviewer de la F13.
3. **`docs/verification.md`** podría mencionar el guardián al listar lo que
   comprueba `./init.sh`. No lo he tocado porque el criterio 10 nombra solo
   `conventions.md`.
4. **Si algún día se resetea la base de datos**, sanear de paso el comentario de
   `prisma/migrations/20260806191700_data_model/migration.sql` y quitar su
   excepción del guardián.

---

## 8. Segunda vuelta — los cinco cambios que pidió el reviewer

Todos aplicados. Ninguno necesitó tocar comportamiento.

### 8.1 El guardián se auto-exceptuaba y llevaba un dato real dentro (punto 1)

Tenía razón, y era el peor de los cinco: **falsa seguridad**. Resuelto por la raíz,
no tapando el síntoma:

- **Quitada la auto-excepción.** El guardián se escanea como cualquier otro archivo.
  La entrada que se exceptuaba a sí mismo ya no existe; queda **una sola** entrada en
  `allowedPaths`.
- **Por qué ya no la necesita:** la excepción existía porque sus ejemplos citaban
  datos reales. Ahora **todos son inventados**, que es lo coherente con lo que el
  guardián comprueba: la **forma**, no la verdad. Un ejemplo no tiene que ser cierto
  para probar que un trigrama con dos palabras poco comunes se detecta, ni para
  probar que un IBAN tiene checksum válido.
- **Cambiados:** el concepto copiado de su CSV (dos sitios: comentario y caso de
  test) por uno inventado; los dos importes suyos del test del umbral; y el importe
  suyo que ilustraba el separador de miles con espacio.
- **La corrección se cobró sola:** al quitar la excepción, la primera ejecución
  **falló señalando** un importe real que yo mismo había dejado en un comentario del
  guardián. Es la prueba de que la auto-excepción tapaba algo de verdad.
- **Un test nuevo lo fija:** `is not on its own exception list`.
- *Descartada la alternativa de generar los casos desde `var/`*: ataría los tests
  del guardián a una máquina concreta y los dejaría sin ejecutar donde no hay
  capturas, que es justo donde más falta hace que el guardián esté probado.

### 8.2 Dos importes suyos por debajo del umbral, y §3.7 mentía (punto 2 + la pasada manual)

- **§3.7 corregido**: afirmaba que eran inventados; están los dos en las capturas.
- **Saneados** los 11 sitios que listó, más los que arrastraban el mismo ejemplo
  (tests, `docs/`, `specs/`, `progress/`), manteniendo la coherencia número↔cadena en
  cada test y la frase de «tres líneas idénticas», que sigue enseñando lo mismo.
- **Pasada manual completa por debajo del umbral**, que es lo que faltaba: extraje
  **todos** los números de las capturas (sin umbral) y revisé uno a uno los que
  aparecen en el árbol. Resultado, además de los dos anteriores:
  - **su aportación mensual**, citada dentro de una frase suya entrecomillada en dos
    specs → **redactada** (`‹cantidad redactada›`), porque cambiarle el número a una
    cita suya sería ponerle en la boca algo que no dijo;
  - el **importe de una transferencia recibida** que acompañaba al nombre de la
    persona que se la hizo → inventado;
  - un **importe de aportación** en un test de inversiones → inventado.
  - **Se quedan, y digo por qué:** el `1000` de `pageSize`, los saldos redondos de
    `movements.test.ts` que no van con ningún concepto suyo, y los enteros sueltos
    (números de línea, contadores). No salen de sus capturas como dato financiero.

### 8.3 La descripción de la excepción de `prisma/migrations/` (punto 3)

Corregida en los **dos** sitios (ADR-017 y el propio guardián): dentro no hay «el
nombre de un banco», hay **una línea entera de su extracto**. Añadidas las dos formas
de cerrarlo, ambas decisión suya, en §3.4. La exclusión se queda: romperle la base de
datos para sanear un comentario no compensa, y ahora el riesgo está descrito por su
tamaño real.

### 8.4 El punto ciego de la `var/` incompleta (punto 4)

Era el hallazgo más fino de la review y el más peligroso: **verde silencioso**. Con
`var/drive-read/` presente y `var/parsed/` ausente, la capa de comparación corría
contra media captura —el `.xlsx` es binario y solo se lee a través de su volcado— y
pasaba en verde con saldos reales en el árbol.

- Ahora el guardián **exige las dos ramas** de `var/`. Si falta una, **se salta
  nombrándola** y explicando por qué comparar contra la mitad es peor que no comparar.
- **Verificado** reproduciendo el escenario del reviewer: `2 skipped`, no verde.
- **Declarado** en los límites del §2 (punto 5) y en el ADR-017.
- Un test nuevo lo fija: `refuses to compare against half of var/…`.

### 8.5 El nombre del otro banco suyo (punto 5)

Sustituido por un genérico en los dos sitios de `accounts.test.ts`. El test sigue
probando lo mismo (el IBAN duplicado choca aunque el banco sea otro).

### Riesgos que quedan declarados (no defectos pendientes)

1. **El histórico de git** conserva las cifras (decisión suya del 2026-08-12).
2. **La migración aplicada** conserva una línea de su extracto en un comentario
   (§3.4): riesgo residual aceptado, con dos formas de cerrarlo cuando él quiera.
3. **Por debajo del umbral no hay guardián, hay lectura.** Está anotado en el
   ADR-017 y en el §2. La F14 lo demuestra en las dos direcciones: el umbral evita
   que la suite sea inútil por ruido, y su primera pasada manual dejó escapar dos.
