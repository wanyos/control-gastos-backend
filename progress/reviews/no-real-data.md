# no-real-data — review

> Feature 14, `sdd: false`. Revisado contra el `intent` y los 10 criterios de
> `acceptance` de `feature_list.json`. Informe revisado:
> [`progress/implementations/no-real-data.md`](../implementations/no-real-data.md).
> **En esta review no se reproduce ningún valor real**: se cita archivo y línea.

## Review

**Veredicto:** CHANGES_REQUESTED

### Lo que sí verifiqué a mano (y salió bien)

- **`./init.sh` verde por mi cuenta:** 26 archivos, 370 tests, tsc sin errores.
- **El guardián muerde.** Inyecté en un archivo versionado nuevo (`docs/`, no
  gitignoreado) tres datos reales sacados de `var/`: un IBAN, un saldo y un
  concepto. Fallaron **las tres capas**, con `archivo:línea` y motivo:
  1 IBAN fuera de la lista blanca, 2 importes y 2 trigramas. Inyección deshecha;
  `git status` vuelve a los mismos 44 archivos de antes (42 `M` + 2 `??`).
- **Se salta bien sin `var/`.** Con `var/` movida fuera: **2 skipped** con
  mensaje, 0 failed, y la capa por forma **siguió corriendo** (siguió cazando el
  IBAN inyectado). Criterio 3 cumplido.
- **La aritmética de los ejemplos saneados cuadra** y ninguna aserción se volvió
  trivial: `bankinter.parser.test.ts:135-150` (saldo − gasto = saldo, y el
  `daySequence` 2 que demuestra el orden de exportación),
  `investments.model.test.ts:271-292` (invertido + ganancia = valor de mercado al
  céntimo, y el `gainPercent` cuadra a 4 decimales),
  `docs/data-model.md:595-600`, `docs/architecture.md:771-778`. Las **cinco
  formas numéricas** de `myinvestor.fixture.ts:66-74` siguen siendo cinco
  (entero, coma decimal, cuatro dígitos, miles con punto, miles + decimal).
- **Sin cambio de comportamiento:** el diff no toca ningún `*.parser.ts`,
  `*.service.ts`, `*.routes.ts` ni `*.schema.ts` salvo un **comentario** en
  `myinvestor.format.ts`. Contrato de la API intacto (solo valores de ejemplo).
- **Sin rewrite de git**, riesgo anotado en ADR-017 y en el informe.
- **Barrido propio, independiente del suyo**, sobre `git ls-files --cached
  --others --exclude-standard`: nombres de personas, comercios, empresas, otros
  bancos, direcciones, secuencias de ≥10 dígitos, tarjetas y correos → **limpio**,
  salvo lo que listo abajo. Solo aparecen los dos IBAN sintéticos de la lista
  blanca.
- **La razón de excluir `prisma/migrations/` es cierta:** una migración aplicada
  lleva checksum en `_prisma_migrations`; editarla —aunque sea un comentario—
  provoca drift y `migrate dev` pide `reset`. La decisión de no romper la base de
  datos del humano es correcta. Lo que **no** es correcto es cómo se describe
  (punto 3).

### Cambios requeridos

1. **`src/no-real-data.test.ts:268` y `:435` — el guardián versiona un concepto
   copiado literalmente de su extracto.** El trigrama que se usa como ejemplo en
   el comentario y como caso del test `only compares phrases with uncommon words
   in them` está copiado **tal cual** de
   `var/drive-read/myinvestor/2026/Movimientos Mi Cuenta MyInvestor.csv`: revela
   un producto que tiene en cartera. El criterio 1 prohíbe explícitamente
   «conceptos copiados de sus extractos». Y es la peor ubicación posible: el
   archivo está en su propio `allowedPaths`, así que **el guardián nunca podrá
   cazarse a sí mismo**. Sustituir por un trigrama inventado con dos palabras
   poco comunes (el test comprueba la *forma*, no ese texto concreto).

2. **Dos importes reales siguen dentro, y §3.7 del informe dice —erróneamente—
   que son inventados.** Los dos valores que el punto 7 declara «inventados desde
   el principio» (el de los recibos y el de las tres líneas idénticas) **están
   los dos en la captura** `var/parsed/bankinter/2026/*.json`; el segundo,
   además, junto a su fecha real y a la cuenta de repeticiones. No los caza el
   guardián porque quedan bajo el umbral, que es justo por lo que había que
   mirarlos a mano. Están en: `src/modules/import/import.service.test.ts:120,136`,
   `src/modules/movements/movements.test.ts:267,435,455`,
   `src/modules/investments/investments.model.test.ts:474`,
   `docs/data-model.md:332`, `docs/architecture.md:646`,
   `specs/data-model/design.md:252`, `specs/data-model/requirements.md:167`.
   Sanearlos (no son portantes en ninguna aserción: solo hay que mantener
   coherente en cada test el importe como número y como cadena, y la frase «tres
   líneas idénticas») y **corregir §3.7**, que hoy afirma lo contrario de lo que hay.

3. **La excepción de `prisma/migrations/` está descrita más pequeña de lo que
   es.** Tanto `src/no-real-data.test.ts:49-52` como `docs/architecture.md`
   (ADR-017, §Excepciones) dicen que lo único que queda dentro es «el nombre de
   un banco en un comentario SQL». En
   `prisma/migrations/20260806191700_data_model/migration.sql:100-103` lo que hay
   es una **línea entera de su extracto**: concepto real, importe real, fecha real
   y el número real de repeticiones. La exclusión puede quedarse (punto verificado
   arriba), pero el humano está aceptando un riesgo residual descrito a la baja:
   corregir las dos redacciones para que digan qué hay realmente dentro.

4. **Punto ciego no declarado: `var/` presente pero incompleta → verde silencioso.**
   `captureExtensions` (`src/no-real-data.test.ts:62`) no incluye `.xlsx`, así que
   todo el extracto de Bankinter solo es visible para la capa 2 a través del
   volcado **derivado** `var/parsed/**.json`. Lo comprobé: moviendo únicamente
   `var/parsed/` fuera y dejando `var/drive-read/`, el guardián **no se salta**
   (hay capturas) y pasa **10/10 en verde** con dos saldos reales suyos metidos a
   propósito en un archivo versionado. Es decir: en la máquina de quien haya
   descargado pero aún no parseado, el guardián da falsa seguridad sin decir nada.
   Declararlo en la lista de límites de §2 y en ADR-017 (y, si es barato,
   `context.skip` o aviso cuando falte alguna de las dos ramas de `var/`).

5. **`src/modules/accounts/accounts.test.ts:106` y `:227`** — se quedó el nombre
   del otro banco suyo como valor de `bank`, el mismo que en el resto del árbol se
   sustituyó por un genérico. Incoherente y de coste cero.

### Comprobado sin hallazgos

`acceptance` 1-10 ↔ verificación (1, 2 y 3 con los hallazgos de arriba; 4-10 sin
hallazgos): ADR-017 con estrategia, alternativas y trade-off marcado (criterio 4);
mecanismo de excepción en tres niveles, documentado en la cabecera del guardián y
en `docs/conventions.md` §Tests (criterio 5); enseñanza y aritmética conservadas
(criterio 6); sin rewrite de git (criterio 7); sin cambio de comportamiento ni de
contrato (criterio 8); bitácora saneada con su porqué (criterio 9); `./init.sh`
verde y `conventions.md` apuntando al guardián (criterio 10).
`docs/architecture.md` y `docs/conventions.md` respetados; sin dependencias
nuevas; sin `console.log` ni TODOs sueltos. CHECKPOINTS **C1-C5** sin hallazgos
(C2: `no-real-data` es la única `in_progress`; C5: árbol sin untracked
sospechosos). **C6** no aplica (el contrato con el frontend no cambia). **C7** no
aplica (`sdd: false`). **C8** pendiente: no se escribe resumen de cierre con
`CHANGES_REQUESTED`.

### Sobre lo que se me pidió juzgar

- **El umbral de ≥ 4 cifras significativas es la elección correcta** (con menos
  el ruido lo haría inútil), pero **el punto 2 demuestra que su límite no es
  teórico**: los dos únicos importes suyos que caen por debajo del umbral y
  siguen en el árbol se dieron por inventados sin comprobarlo. El umbral es
  aceptable **a condición de** que lo que queda debajo se mire a mano, que es
  exactamente lo que falló aquí.
- **La línea del `intent` de la F13 en `feature_list.json`: justificada.** Era una
  cifra real suya usada como ejemplo de formato; se cambió **solo el número** y el
  QUÉ queda intacto. Está señalada en §3.5 del informe, que es lo que había que
  hacer con material del humano.
- **Sanear la bitácora en vez de excepcionarla: acertado**, y por la razón que da
  el informe (la F13 copió sus cifras de un `design.md`).

---

# Segunda pasada — 2026-08-12

> La primera pasada queda **íntegra arriba**. Un único retoque en ella: la línea
> que describía el punto 2 citaba el importe real; **redactada** (la corrección se
> la cobró el propio guardián sobre mi review, que también es archivo versionado).

## Review

**Veredicto:** APPROVED

Comprobado: los cinco cambios requeridos, arquitectura, convenciones, verificación
y CHECKPOINTS C1-C8. Sin hallazgos.
Resumen de cierre: [`progress/summaries/no-real-data.md`](../summaries/no-real-data.md).

### Lo que volví a intentar romper (y no se rompió)

- **`./init.sh` verde por mi cuenta:** 26 archivos, **372 tests**, tsc limpio.
- **Inyección de las tres capas** (IBAN + saldo + concepto reales, sacados de
  `var/`, en un `.md` versionado nuevo): **3 failed**, una por capa, con
  `archivo:línea`. Inyección deshecha; el árbol vuelve a su estado exacto.
- **Las cinco variantes de `var/` que pedías, con la inyección puesta**, ninguna
  acaba en verde silencioso — todas **2 skipped** y la capa por forma siguió
  cazando el IBAN (1 failed en todas):
  | Escenario | Resultado |
  | --- | --- |
  | falta `var/parsed/` | 2 skipped · mensaje `var/ is INCOMPLETE (missing: parsed)` |
  | falta `var/drive-read/` | 2 skipped · nombra la rama que falta |
  | faltan las dos | 2 skipped · mensaje `BY DESIGN` |
  | las dos existen pero **vacías** | 2 skipped (cuenta archivos, no carpetas) |
  | `drive-read/` vacía y `parsed/` llena | 2 skipped |
  El mensaje explica además **por qué** media captura es peor que ninguna (el
  `.xlsx` solo se lee por su volcado). `comparisonUnavailable` está probado
  aparte, con la rama nombrada.
- **La salida de su propia lista de excepciones es real, no un cambio de nombre.**
  `allowedPaths` tiene **una sola** entrada (`prisma/migrations/`); `allowedIbans`
  siguen siendo los dos documentados; `scannedExtensions`, `captureExtensions`,
  `versionedFiles()` y **`.gitignore` están sin tocar** (comprobado: `git diff`
  vacío) — no hay exención equivalente colada por otro sitio. `is not on its own
  exception list` lo fija. Y el archivo del guardián aparece de verdad en el
  barrido (`versionedFiles()` lo contiene).
- **Pasada bajo el umbral, rehecha por mí sin umbral ninguno**, comparando todos
  los números de `var/` contra todo archivo versionado: a partir de 3 cifras
  significativas, **0 residuos** (el único hit era mi propia review, ya redactado).
  Lo que queda por debajo son enteros redondos genéricos —tamaños de página,
  saldos de escalera `100/200/300`, un `1000.00` de andamiaje— ninguno acompañado
  de un concepto suyo. Coincide con lo que declara §8.2.
- **La cita del humano conserva el sentido.** En
  `specs/investments-data-model/design.md:479` y `requirements.md:322,559` la
  frase entrecomillada sigue diciendo lo que demuestra: que el efectivo queda
  fuera de los totales porque es el remanente de una aportación recurrente. Solo
  desaparece la cantidad, que no era portante. **Redactar en vez de reinventar es
  lo correcto** con material entrecomillado del humano: cambiarle el número sería
  ponerle en la boca lo que no dijo.
- **Sigue sin cambiar el comportamiento.** Los únicos archivos no-test tocados en
  `src/` son `myinvestor.fixture.ts` (datos de prueba) y un **comentario** de
  `myinvestor.format.ts`. Ningún `*.parser.ts`, `*.service.ts`, `*.routes.ts` ni
  `*.schema.ts`, ningún `prisma/schema.prisma`, ningún endpoint.
- **Ninguna aserción nueva se volvió trivial.** Los saneos de la segunda vuelta
  mantienen la coherencia número↔cadena (`import.service.test.ts`,
  `movements.test.ts`, `investments.model.test.ts`), las igualdades exactas siguen
  siéndolo, y los ejemplos que la primera pasada verificó (saldo − gasto = saldo,
  `invertido + ganancia = valor de mercado` al céntimo, `gainPercent` a cuatro
  decimales, las cinco formas numéricas) siguen intactos.

### Comprobado sin hallazgos

`acceptance` 1-10 ↔ verificación; `docs/architecture.md` (ADR-017 corregido) y
`docs/conventions.md` respetados; sin dependencias nuevas; sin `console.log` ni
TODOs sueltos. CHECKPOINTS **C1-C5** (C2: `no-real-data` sigue siendo la única
`in_progress`; C5: sin untracked sospechosos), **C8** con el resumen escrito.
**C6** no aplica (el contrato de la API no cambia). **C7** no aplica
(`sdd: false`).

### Notas que NO bloquean

1. **Auto-silencio residual de 2 líneas.** Las líneas del guardián que contienen
   el literal `no-real-data-ok` (`src/no-real-data.test.ts:28` y `:75`) quedan
   fuera de las capas de comparación por el propio mecanismo. No llevan ningún
   dato y no hay forma barata de evitarlo; queda dicho para que nadie lo use como
   escondite.
2. **Lo que queda dentro de `prisma/migrations/`** es riesgo residual declarado, y
   las **dos formas de cerrarlo son decisión del humano**: van listadas y separadas
   en el resumen de cierre.
