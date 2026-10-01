# Correcciones del humano a los agentes: qué subir a harness-template — 2026-09-30

Trabajo de solo lectura. Fuentes leídas:

- La memoria de sesiones (`~/.claude/projects/c--Users-roybe-…-gastos-backend/memory/*.md`, 6 archivos).
- `~/.claude/rules/commits.md` y `context7.md`.
- `progress/reviews/*.md`: 21 veredictos `CHANGES_REQUESTED`, localizados con
  `grep -n "Veredicto" progress/reviews/*.md`.
- `progress/history.md`, `progress/current.md` y `docs/roadmap.md` §Deberes tuyos pendientes.
- `specs/*/decisions.md`, bloques 🔄.
- `git log` (mensajes y trailers).

Todo se ha contrastado con la plantilla en su copia de trabajo actual
(`C:\Users\roybe\Escritorio\claude\harness-template`, `VERSION` 2.2.0, la misma que
el proyecto): `CLAUDE.md`, `AGENTS.md`, `CHECKPOINTS.md`, `.claude/agents/*.md`,
`docs/*.md` y `progress/current.md`.

Fechas de las reglas que ya existen, para saber si un fallo se repitió **después** de escribirlas:

| Regla | Dónde, y desde cuándo |
|---|---|
| Nada de trailer de coautoría | En el `CLAUDE.md` del proyecto desde `c2a5153` (2026-08-16). En memoria desde el 2026-08-13 |
| Vocabulario y «no se afirma nada sin comprobarlo» | En el proyecto desde `7af01af` (2026-08-31). En la plantilla desde `dcc4425` (2026-08-31) |
| Prueba real con el fichero del humano (checkpoint C4 bis del `CHECKPOINTS.md` del proyecto) | Desde `069cdb2` (2026-08-19) |
| «Ningún dato real en un fixture» (`docs/conventions.md:105`) | Desde la F12 (2026-08-12) |

Formato de los bloques de este informe: el de `.claude/commands/lecciones.md`
(1. Proyecto, 2. harness-template, 3. Ya en plantilla / sin cambios).

---

## 1. Para este proyecto (alcance `proyecto`)

Estas filas están listas para pegarlas en `docs/lecciones.md` (la tabla del proyecto está vacía hoy).

| # | Fecha | Feature | Agente | Qué pasó | Qué hay que hacer | Alcance | Estado |
|---|---|---|---|---|---|---|---|
| 1 | 2026-08-15 | prueba Drive real | todos | Ante un JSON de producto o un CSV mal escrito por el humano, se propuso hacer el parser tolerante | Si falla un archivo que escribe él (JSON de producto, líneas `iban;` y `saldo;` del CSV), primero se le propone **corregir el archivo**. El código solo cambia para lo que exporta el banco. Nunca se tolera en silencio: el archivo mal escrito se **rechaza con un mensaje que diga qué campo falla** | proyecto | activa |
| 2 | 2026-08-13 | F15, F26, F29, F31 | implementer | En cuatro features, `docs/data-model.md` se quedó sin actualizar y el reviewer lo rechazó: la tabla «Columnas reservadas (definidas, sin escritor todavía)», el bloque Prisma, el diagrama ER y la tabla de claves naturales | Si la feature añade una columna, o empieza a escribir una que antes no tenía escritor, en el mismo cambio se actualizan en `docs/data-model.md`: la tabla «Columnas reservadas», el bloque Prisma de la Parte 2, el diagrama ER y la tabla de claves naturales. Se comprueba contra `prisma/schema.prisma` | proyecto | activa |
| 3 | 2026-08-19 | F6, F12, F13, F19 | implementer | Importes, IBAN y conceptos reales de `var/drive-read/` acabaron copiados en fixtures y en docs, aunque `docs/conventions.md:105` lo prohibía. En la F19 el `src/no-real-data.test.ts` no lo cazó porque no lee `.xls` | Todo valor de un fixture o de un doc se inventa desde cero: no se parte de una fila real para cambiarle unos dígitos. Si el banco entrega `.xls` o `.pdf`, que `src/no-real-data.test.ts` no lee, el implementer declara en su informe que ha comparado a mano sus cifras con ese archivo | proyecto | activa |

Evidencia:

- **Fila 1:** la memoria `human-writes-files-prefers-fixing-them.md` (lo dijo él el 2026-08-15) y `progress/history.md` (F18, la línea «esos archivos los escribe él»). La memoria marca la excepción: decodificar cp1252 como UTF-8 en silencio sigue siendo un bug.
- **Fila 2:**
  - `progress/reviews/product-opened-at.md:12`
  - `progress/reviews/savings-account-as-product.md:56-79`
  - `progress/reviews/myinvestor-products-to-db.md:93-107`, que dice «ya rechazó la F26 en su primera revisión justamente por no decir la verdad»
  - `progress/reviews/real-account-balance.md:121`
- **Fila 3:**
  - Los rechazos: `progress/reviews/import.md` §1, `progress/reviews/myinvestor-products.md:125-139`, `progress/reviews/no-real-data.md:48-71` y `progress/reviews/openbank-statement.md:23-44`.
  - El commit `ef7c0a0`: «Una regla que tres agentes distintos tienen que recordar no es una regla».
  - `CHECKPOINTS.md` del proyecto, C4 bis, donde consta que el test «no podía ver porque no lee `.xls`».
  - La regla general va en el hallazgo H6. Esta fila solo recoge lo propio de este proyecto (`var/drive-read/` y lo que el test no lee).

---

## 2. Para harness-template

Cada propuesta indica el archivo de la plantilla, el texto exacto y la evidencia.
Hasta que se apliquen, cada una puede apuntarse en el `docs/lecciones.md` del
proyecto con alcance `harness` (las filas están al final de este bloque).

### H1: el implementer deja documentos que su cambio ha vuelto falsos

Es el fallo que más se repite: **10 features** con `CHANGES_REQUESTED` (o el reviewer corrigiéndolo) porque el README, el contrato, `stack.md`, `data-model.md`, el roadmap o un resumen anterior seguían describiendo lo de antes.

- **Archivo de la plantilla:** `.claude/agents/implementer.md`, sección `## Protocolo`. Hay que añadir un paso nuevo entre el 5 («Verifica») y el 6 («Escribe tu informe»).
- **Cambio:** añadir:
  > 5b. **Busca lo que tu cambio ha vuelto falso.** Por cada nombre que hayas
  > cambiado, endpoint añadido o quitado, columna nueva, versión o comportamiento
  > distinto, lanza `git grep -n "<nombre o frase>"` fuera de `progress/` y `specs/`
  > y corrige cada línea que ya no sea verdad: `README.md`, el contrato de la API,
  > `docs/stack.md`, `docs/architecture.md`, `docs/roadmap.md`, los comentarios de
  > código. Lo que haya dentro de `progress/` y `specs/` es histórico y no se toca.
  > En el informe, sección `## Documentos actualizados`, pon el comando lanzado y
  > las líneas corregidas. Si una línea que hay que corregir está fuera de los
  > archivos de tu lote, no la dejes solo como «fuera de scope»: repórtala como
  > bloqueo para que el leader la asigne.
- **Y en `.claude/agents/reviewer.md`, `## Qué compruebas` → «Siempre»**, añadir:
  > 2b. Para cada nombre, endpoint, columna o versión que la feature cambia,
  > `git grep` fuera de `progress/` y `specs/`: una línea que siga describiendo lo
  > de antes es `CHANGES_REQUESTED`, con archivo y línea.
- **Por qué:** los tests no ven los documentos. El reviewer lo pilla, pero cada vez hace falta otra vuelta del implementer.
- **Evidencia (orden cronológico):**
  - `progress/reviews/import.md` §2 (`README.md:68-69,106`, F12, 2026-08-12)
  - `progress/reviews/product-opened-at.md:12` (F15)
  - `progress/reviews/reimport-from-local-copy.md:31-37` (garantía del contrato)
  - `progress/reviews/savings-account-as-product.md:56` (F26)
  - `progress/reviews/myinvestor-products-to-db.md:93,109` (F29)
  - `progress/reviews/real-account-balance.md:112-125` (roadmap, resumen de la F19, data-model; F31)
  - `progress/reviews/movements-filters-and-totals.md:9-18` (F36)
  - `progress/reviews/chore-dotenv-a-loadenvfile.md:12-16` (`README.md:9`, `docs/stack.md:18`)
  - `progress/reviews/honest-totals.md:16-24` (`README.md:74-78`, F49, 2026-09-28)
  - El commit `6731dd1` («el README vuelve a decir la verdad»).
- **Qué cubre hoy la plantilla:** solo el roadmap (`docs/roadmap.md` §«Se actualiza al cerrar»). No dice nada del resto de documentos.

### H2: los lotes de `tasks.md` no incluyen los documentos que hay que corregir

- **Archivo de la plantilla:** `.claude/agents/spec-author.md`, sección `## tasks.md en lotes`, lista «Reglas de los lotes».
- **Cambio:** añadir:
  > - Los documentos que la feature vuelve falsos (`README.md`, contrato de la API,
  >   `docs/stack.md`, `docs/architecture.md`) van en la cabecera `Archivos:` de
  >   **un** lote, normalmente el último, con su task. Si no están en ninguna
  >   cabecera, ningún implementer puede tocarlos y se quedan sin corregir.
- **Por qué:** con varios implementers en paralelo, cada uno vio la línea falsa del README y ninguno la corrigió, porque no estaba en su cabecera.
- **Evidencia:** `progress/reviews/honest-totals.md:24`: «Los dos implementers lo anotaron como fuera de su cabecera: el leader tiene que asignarlo».

### H3: la prueba con el fichero real del humano se salta aunque existe el checkpoint

- **Archivo de la plantilla:**
  - `CHECKPOINTS.md`: la plantilla no tiene equivalente al C4 bis del proyecto.
  - `.claude/agents/implementer.md`, `## Protocolo`.
- **Cambio en `CHECKPOINTS.md`:** añadir tras C4:
  > ## C4 bis — Prueba con los archivos reales del humano (si la feature los lee)
  >
  > - [ ] Si la feature lee un archivo que el humano escribe o descarga (extractos,
  >       exportaciones, plantillas suyas), antes de cerrarla se pasa **su archivo
  >       real** por el código nuevo y el informe va a
  >       `progress/explorations/prueba-real-<tema>-<fecha>.md`, con **recuentos y
  >       forma, nunca contenido**.
  > - [ ] Si no se puede hacer (falta el archivo, es tarea del humano), el informe
  >       del implementer lo dice en una línea y el leader lo pasa a los deberes del
  >       humano en `docs/roadmap.md`. Saltárselo sin decirlo es `CHANGES_REQUESTED`.
- **Cambio en `implementer.md`, paso 5 («Verifica»):** añadir al final:
  > Si la feature lee archivos que escribe o descarga el humano, haz la prueba de
  > `CHECKPOINTS.md §C4 bis` antes de escribir tu informe, o di en el informe por
  > qué no se ha podido.
- **Por qué:** en el proyecto la regla vive solo en `CHECKPOINTS.md`, que lee el reviewer, y el implementer nunca la tiene delante. Después de escribirla (2026-08-19) se incumplió **tres veces**, y las tres fueron `CHANGES_REQUESTED`. Esa redacción, en ese sitio, no funciona.
- **Evidencia:**
  - Por qué se creó la regla: la memoria `prueba-real-antes-de-cerrar-feature.md`. Se hizo cuatro veces y encontró defectos con la suite en verde tres de ellas (N26 → F21, Openbank → F22, Trade Republic → F24).
  - Incumplimientos:
    - `progress/reviews/trade-republic-product-file.md:33-45` (2026-08-20): «se pasó en silencio».
    - `progress/reviews/myinvestor-products-to-db.md:53-74` (2026-08-21). El UTF-8 con BOM fallaba por la vía nueva.
    - `progress/reviews/revolut-statement.md:17-23` (2026-09-15).

### H4: un mecanismo que tiene que avisar o fallar se da por bueno sin haberlo visto fallar en `./init.sh`

- **Archivo de la plantilla:** `.claude/agents/implementer.md`, `## Reglas duras`. Y `.claude/agents/reviewer.md`, punto 4.
- **Cambio en `implementer.md`:** añadir:
  > - ✅ Si tu cambio añade algo cuyo trabajo es **avisar o poner la pasada en
  >   rojo** (una comprobación en el setup o teardown de los tests, un aviso por
  >   consola, un `throw` que no lanza un test), provoca el caso a propósito, lanza
  >   `./init.sh` **entero y sin flags**, y pega en tu informe su código de salida y
  >   las líneas donde se ve el aviso. Que el test del mecanismo pase no demuestra
  >   que el aviso llegue a la salida ni que cambie el código de salida.
- **Cambio en `reviewer.md`, punto 4** («`./init.sh` termina verde»): añadir:
  > Si la feature añade un aviso o un fallo que no es un test, repite tú la
  > provocación y mira el código de salida de `./init.sh` y su salida completa.
- **Por qué:** dos veces pasó lo mismo: el mecanismo funcionaba en su test, pero en la ejecución normal no se veía nada y la pasada salía con exit 0.
- **Evidencia:**
  - `progress/reviews/tests-dont-touch-real-var.md:7-27`: el `throw` del teardown de `globalSetup` sale como «error during close» con `EXIT=0`, y `init.sh:343` imprime `[OK]`.
  - `progress/reviews/no-real-data-blind-spot.md:17-44`: Vitest intercepta el `console.warn`, así que no aparece en `./init.sh` ni en `pnpm test`.
  - La plantilla solo cubre el caso de un check que filtra por nombre y no ejecuta ningún test (`reviewer.md` 4b).

### H5: los tests y los agentes escriben en los datos reales del humano

- **Archivo de la plantilla:**
  - `.claude/agents/implementer.md`, `## Reglas duras`.
  - `.claude/agents/reviewer.md`, punto 3.
- **Cambio en `implementer.md`:** añadir:
  > - ❌ Nunca ejecutes nada que escriba en la base de datos o en las carpetas de
  >   datos del humano: ni la suite, ni un seed, ni un script de prueba, ni «para
  >   probar el CLI». Los tests usan una base y un directorio **desechables**, y
  >   `docs/verification.md` dice cuáles. Si has escrito en los suyos por
  >   accidente, dilo en la primera línea de tu informe.
- **Cambio en `reviewer.md`, punto 3:** sustituir «usan recursos reales donde es viable en vez de mocks innecesarios» por:
  > usan recursos **del mismo tipo que los reales pero desechables** (una base
  > Postgres de test, un directorio temporal) en vez de mocks innecesarios, y
  > **nunca** la base ni las carpetas de datos del humano.
- **Por qué:** pasó tres veces, cada vez por un camino distinto.
  - La redacción actual del reviewer («recursos reales donde es viable») empuja justo en esa dirección.
- **Evidencia:**
  - `progress/history.md:931` (F27): la suite escribía en su base, con 15 cuentas y 140 productos sintéticos dentro.
  - `progress/history.md:943` (F33): cada pasada reescribía `var/parsed/trade-republic/2026/products.json`.
  - `progress/summaries/categories-and-tagging.md:119-121` (F37): «el implementer ejecutó la siembra contra tu base real por accidente al probar el CLI».
  - `progress/history.md:1122` («lección de la F37»).

### H6: se copian datos reales del humano a fixtures, ejemplos y docs

- **Archivo de la plantilla:** `.claude/agents/implementer.md`, `## Reglas duras`.
- **Cambio:** añadir:
  > - ❌ Ningún dato real del humano entra en un archivo versionado: ni en un
  >   fixture, ni en un ejemplo de un doc o de un spec, ni en un comentario.
  >   Importes, identificadores de cuenta, nombres y textos se inventan desde cero;
  >   no se parte de un valor real para cambiarle unos dígitos. Aunque él los pegue
  >   en la conversación. Si el proyecto tiene una comprobación automática de esto,
  >   `docs/conventions.md` la nombra y dice qué no puede ver.
- **Por qué:** con la regla escrita en `conventions.md` y en el `acceptance`, se repitió tres veces seguidas, y además en dos sitios más. Cada vez lo cazó el reviewer leyendo, nunca la suite. El proyecto acabó teniendo que convertirlo en un test (`src/no-real-data.test.ts`, F14).
- **Evidencia:**
  - Los rechazos: `progress/reviews/import.md` §1 (F12), `progress/reviews/myinvestor-products.md:125-139` (F13), `progress/reviews/no-real-data.md:48-71` (F14) y `progress/reviews/openbank-statement.md:23-44` (F19).
  - El commit `ef7c0a0` y `docs/roadmap.md:521-540`.
  - La parte propia del proyecto es la lección nº 3 del bloque 1.

### H7: responder solo lo que el humano pregunta y no volver a sacar lo que ha cerrado

- **Archivo de la plantilla:** `CLAUDE.md`. Sección nueva, detrás de «No se afirma nada sin haberlo comprobado».
- **Cambio:** añadir:
  > ## Responde lo que se pregunta, y lo cerrado no se reabre
  >
  > ❌ No añadas a una respuesta listas de lo que falta, de lo que el proyecto
  > todavía no hace ni de los siguientes pasos, si el humano no lo ha pedido. Si
  > pregunta «¿dónde estamos?», la respuesta es estado y confirmación, no un plan.
  >
  > ❌ Lo que el humano ha cerrado o retirado («no lo volvamos a mostrar», «no
  > volver a sacar el tema») no se vuelve a proponer, ni a listar como pendiente.
  >
  > ✅ Lo que encuentres por el camino se anota donde toca (`docs/roadmap.md`,
  > `progress/explorations/`) y se menciona solo si afecta a lo que está haciendo
  > ahora. Un fallo real que tenga delante se dice siempre.
  >
  > **Por qué existe esta regla.** Él marca el orden: qué quiere → cómo se podría
  > hacer → diseño → corrección → implementación → tests → prueba. Adelantarle
  > trabajo le quita la parte que quiere llevar él, y en otro proyecto suyo mezclar
  > cosas acabó descontrolándolo todo.
- **Evidencia:**
  - La memoria `paso-a-paso-no-adelantar.md` (corrección del 2026-08-22: «no adelantemos cosas que ni siquiera he preguntado»).
  - `docs/roadmap.md:465`: «no lo volvamos a mostrar como una cosa que falta por hacer» (2026-09-05).
  - `docs/roadmap.md:524`: «No volver a sacar el tema» (histórico de git, 2026-08-13).
  - Son tres correcciones distintas sobre lo mismo.

### H8: al sustituir algo, lo viejo se retira en la misma sesión y se dice

- **Archivo de la plantilla:** `AGENTS.md`, `## 3` (lista de reglas).
- **Cambio:** añadir:
  > - **Cuando sustituyes o arreglas algo, retira lo viejo en esa misma sesión y
  >   dilo**: qué queda obsoleto y dónde vive, en todos los sitios, no solo en el
  >   que tienes delante. Nada de dejarlo «por si acaso». Si no puedes retirarlo tú
  >   (está fuera del repositorio), dale al humano la ruta exacta en ese momento; no
  >   lo dejes como un pendiente anotado.
- **Por qué:** lo que se queda no es inofensivo. Un archivo roto que sobrevive sale en rojo en cada pasada, el humano se acostumbra a ese rojo y deja de ver los fallos de verdad.
- **Evidencia:**
  - La memoria `resolver-en-el-momento-y-decirlo.md` (2026-08-30): dos ficheros de banco rotos llevaban semanas saliendo como `failed`.
  - `progress/reviews/movements-filters-and-totals.md:16-17` («es exactamente el tipo de resto que dentro de tres semanas hay que interpretar»).
  - El commit `6731dd1` («fuera tres restos que no excluían ni protegían nada»).

### H9: la cabecera de `progress/current.md` de la plantilla anima a que crezca sin límite

- **Archivo de la plantilla:** `progress/current.md`, las líneas 3-4.
- **Cambio:** sustituir «Este archivo se vacía al cerrar cada sesión y se mueve a `history.md`» por:
  > Este archivo es un cuaderno de trabajo, no un archivo histórico. Se vacía al
  > cerrar cada feature. Lo que sigue vivo **se mueve** a su sitio; no se copia a
  > `history.md` ni se deja «por si acaso»:
  >
  > | Qué | Dónde vive |
  > |---|---|
  > | El resultado de la feature, en una línea | `history.md` |
  > | El detalle de qué se hizo y por qué | `summaries/<feature>.md` |
  > | El informe del implementer y el veredicto | `<feature>.md` |
  > | Un cabo suelto o un deber del humano | `docs/roadmap.md` |
- **Por qué:** «se mueve a `history.md`» choca con `CHECKPOINTS.md` C5 («**una línea** por feature… No una copia del informe»). En el proyecto, `current.md` llegó a **1231 líneas** con 22 features cerradas duplicadas dentro, y `history.md` supera hoy las 1100.
- **Evidencia:** el commit `4a54cd5` (limpieza pedida por él: «el archivo current.md debería estar vacío sin embargo está muy lleno»). La tabla que se propone es la que ya usa el proyecto (`progress/current.md:6-13`) y desde entonces se ha vaciado tres veces sin problemas (`progress/current.md:16-18`).

### Filas `harness` para el `docs/lecciones.md` del proyecto, mientras la plantilla no las incorpora

| # | Fecha | Feature | Agente | Qué pasó | Qué hay que hacer | Alcance | Estado |
|---|---|---|---|---|---|---|---|
| 4 | 2026-09-28 | F12…F49 | implementer | README, contrato, `stack.md` o roadmap se quedaron describiendo lo de antes en 10 features | Antes del informe, `git grep` de cada nombre, endpoint, columna o versión que cambias, fuera de `progress/` y `specs/`, y corregir cada línea falsa. Anotarlo en `## Documentos actualizados` | harness | activa |
| 5 | 2026-09-15 | F20, F29, F46 | implementer | Se saltó la prueba con el fichero real (C4 bis) tres veces después de existir la regla | Si la feature lee archivos del humano, hacer la prueba de C4 bis antes del informe, o decir en el informe por qué no se ha podido | harness | activa |
| 6 | 2026-08-31 | F23, F33 | implementer | Un aviso o `throw` que tenía que poner la pasada en rojo salía con exit 0 o no se veía en la salida | Provocar el caso y lanzar `./init.sh` entero sin flags. Pegar el exit code y las líneas del aviso | harness | activa |
| 7 | 2026-09-05 | F27, F33, F37 | implementer | La suite o un seed escribieron en la base o en `var/` del humano | Nada escribe en la base `gastos` ni en `var/`. Solo `gastos_test_*` y directorios temporales. Si ocurre por accidente, se dice en la primera línea del informe | harness | activa |

(H6 ya está recogida en la fila 3 del bloque 1. H7 y H8 son del leader en la sesión principal y ya están en memoria. H2 y H9 son de la plantilla, no de un agente.)

---

## 3. Ya en plantilla

| Corrección | Dónde lo cubre la plantilla | ¿Volvió a fallar después? |
|---|---|---|
| Nada de trailer `Co-Authored-By` en commits | `CLAUDE.md:21-33` | **No.** El último commit con ese trailer es `c3db02f` (2026-08-12), comprobado con `git log --format='%h %ad %(trailers:key=Co-Authored-By,valueonly)'`. La regla entró en el proyecto el 2026-08-16. Funciona |
| No nombrar mecanismos sin término aprobado | `CLAUDE.md:48-94` | **Sí, dos veces después del 2026-08-31, en informes y docs que escribió el implementer:** `progress/reviews/revolut-statement.md:39-42` («tests de guarda», 2026-09-15) y `progress/reviews/import-warnings-persistence.md` §Cambios requeridos 1 («aviso» en ADR-031, 2026-09-18). Las dos las cazó el reviewer. Propuesta: en `.claude/agents/implementer.md`, paso 6, añadir «Antes de entregar, repasa los títulos y frases de tu informe y de los docs que has tocado: cada palabra que nombre un mecanismo del proyecto tiene que estar en `docs/vocabulario.md` o en la tabla de `CLAUDE.md`; si no, descríbelo literalmente» |
| No afirmar nada sin haberlo comprobado | `CLAUDE.md:96-128` | Antes de la regla hubo cinco casos: `progress/reviews/bootstrap.md:10-14` (limpieza de procesos falsa), `no-real-data.md:59-60` (§3.7, «inventados»), `guardian-own-words.md:14-20` (comentario que declaraba imposible un silencio), `tests-dont-touch-real-var.md:29-30` y `reimport-from-local-copy.md:31-37`. **Después, uno:** `progress/reviews/movements-review-bulk.md:13-31` (2026-09-18): el contrato afirmaba un límite medido «después del recorte» que el código mide antes. Solo un caso y lo cazó el reviewer ejecutándolo. No hay propuesta de cambio de redacción: H1 cubre el hueco de documentos |
| Enlaces `archivo:línea` clicables en los resúmenes | `docs/resumen-template.md` (commit `8d0a1aa` de la plantilla) | No |
| Las correcciones del humano se apuntan | `.claude/agents/leader.md:277-308` y `docs/lecciones.md` | No aplica: el mecanismo es nuevo (2.2.0) |

## Sin cambios (qué se miró y no dio nada)

- **`specs/*/decisions.md`, bloques 🔄 (F12, F20, F49):** son decisiones y cambios de opinión del humano en la puerta del spec, no fallos de un agente. Tampoco las cuatro correcciones de la F8 en la puerta (`progress/history.md:517-536`): endpoint de traspasos y alta manual. La regla del QUÉ del humano ya las cubre (`leader.md:28-52`).
- **`bootstrap.md` (procesos `tsx watch` huérfanos en Windows):** pasó una sola vez, en 2026-07. No se propone.
- **`~/.claude/rules/context7.md`:** es una regla de uso de herramientas, no una corrección sobre el harness.
- **Veredictos por lógica de dominio:** `n26-statement` (céntimos del saldo), `guardian-own-words` (apóstrofos) y `reimport-from-local-copy` §1 (mensaje 404). Son bugs de este código, no fallos del modo de trabajar.
- **`progress/explorations/` e `implementations/`:** buscado con `grep` («lección», «me equivoqué», «fallo mío», «sin comprobar»). No sale ninguna corrección del humano que no esté ya arriba.
