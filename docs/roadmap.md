# Roadmap — por dónde va el backend

> **Para qué sirve este archivo:** para saber en dos minutos **dónde estás**,
> **qué viene después** y **por qué en ese orden**. Es el mapa del recorrido
> completo, no el detalle de ninguna parada.
>
> **Última revisión:** 2026-09-01.

## Este documento frente a los otros cuatro

El proyecto ya tenía cuatro documentos de estado y ninguno respondía «¿por dónde
voy?». Cada uno hace una cosa distinta y por eso hacía falta un quinto:

| Documento | Responde a | Alcance temporal |
|---|---|---|
| [`docs/ideas.md`](../../docs/ideas.md) (workspace) | ¿Qué quiero que haga la app? | Producto, sin fecha |
| **`docs/roadmap.md`** (este) | **¿Por dónde voy y qué falta?** | **Todo el recorrido** |
| [`feature_list.json`](../feature_list.json) | ¿Qué hace exactamente la feature N? | Una feature |
| [`progress/current.md`](../progress/current.md) | ¿En qué quedó la última sesión? | Una sesión |
| [`progress/history.md`](../progress/history.md) | ¿Qué pasó y cuándo? | Bitácora, append-only |

**Regla de convivencia:** este archivo **no repite** el contenido de los otros,
enlaza a ellos. Si una etapa necesita más de cinco líneas aquí, es que su sitio
es el `intent` de una feature.

---

## Dónde estás ahora mismo 📍

**Ya sabes traer ficheros del banco, entenderlos y guardarlos.** Desde la F12
(2026-08-12) `POST /api/import` cierra el camino entero: Drive → parser → base de
datos → `procesados/`. Es la primera vez que la app **guarda datos de verdad**.

**Ya tienes el sitio donde guardarlo todo (E3 ✅, F9) y la forma común en que los
parsers hablan (F11 ✅).** Ambas cerradas el 2026-08-11.

Y **ya hay dos bancos que sabes leer**, con las dos entradas de MyInvestor
cerradas: el extracto (F10) y los JSON de producto (F13, 2026-08-12). La antigua
F10 se **partió en dos** porque 70 requirements escondían dos features.

**El repositorio ya no guarda datos tuyos** y no depende de que nadie se acuerde:
la F14 dejó un guardián en la suite que falla señalando archivo y línea si
reaparece uno.

**Y desde el 2026-08-26, cada cuenta corriente sabe cuánto dinero tiene dentro**,
no solo cuánto ha variado (F31): se ancla con el saldo que trae el extracto una
sola vez y a partir de ahí se mantiene con los movimientos. Donde el archivo trae
saldo, sigue mandando el archivo. Y desde el **2026-08-30**, al importar un
archivo la app **compara sus propias sumas contra lo que dice el archivo** y
escribe los descuadres en el informe de esa importación, con la cuenta, la fecha,
los dos números y la diferencia (F32). Tolerancia cero, y un descuadre no tumba
la importación ni cambia ningún saldo.

✅ **El siguiente paso ya está elegido (2026-09-01).** Las 35 primeras features
están `done` y hay **cinco nuevas escritas y `pending`**, dictadas por el humano
en esa sesión y en este orden:

| # | Feature | Qué trae | Spec |
|---|---|---|---|
| **36** | `movements-filters-and-totals` | Filtrar por cuenta, fechas, tipo y estado; paginar; y los totales del filtro pedido | no |
| **37** | `categories-and-tagging` ✅ (2026-09-02) | Crear categorías y ponérselas a un movimiento, con una lista genérica de arranque, y dar un movimiento por revisado | **sí** |
| **40** | `transfer-detection` ✅ (2026-09-03) | Reconocer los traspasos entre cuentas propias (el escritor de `transferId` que el modelo dejó previsto) para que no cuenten ni como gasto ni como ingreso | **sí** |
| **38** | `money-overview` ✅ (2026-09-05) | Cuánto dinero hay en total, cómo está repartido y qué se ahorró en el mes (`GET /api/overview`) | no |
| **39** | `investments-overview` ✅ (2026-09-05) | Qué valen los productos, si suben o bajan y cuánto se ganó en el mes (`GET /api/investments/overview`) | **sí** |

**Por qué en ese orden.** La 36 va primera porque hoy `GET /api/movements`
devuelve los 1520 movimientos de golpe y sin filtros (medido el 2026-09-01), así
que no hay forma de encontrar nada: sin eso, categorizar a mano es impracticable.
La **40 va antes que la 38** por decisión del humano del 2026-09-02: sin ella, el
resumen contaría como entradas y salidas los traspasos entre sus propias cuentas
(36 parejas moviendo 44.550 € medidas ese día), y la 38 se apoya además en los
totales de la 36 para no escribir dos sumas distintas del mismo dinero. La 39 no
depende de ninguna y puede adelantarse si apetece.

**Lo que cierran de esta tabla:** la 36 el cabo 8, la 37 el cabo 3 ✅, la 39 el
cabo 12, y la 40 ✅ le puso por fin escritor a `Movement.transferId` (reservado
desde la F8): desde el 2026-09-03 cada importación cruza los movimientos sin
marcar y enlaza las parejas inequívocas.

✅ **La tanda entera (36–41) quedó cerrada, probada en real y commiteada el
2026-09-05.** Ese mismo día el humano pidió «dejar arreglado lo que falta» y hay
**tres features nuevas escritas y `pending`, esperando su aprobación del intent**
(los redactó el leader a partir de decisiones previas del humano; ninguna
arranca sin su visto bueno):

| # | Feature | Qué traería | Spec |
|---|---|---|---|
| **42** | `net-worth` | El patrimonio total: cuentas + inversiones en una consulta, con desglose | sí |
| **43** | `auto-categorization` | Categorías automáticas por reglas sobre el concepto (el 75% ya salía en el análisis del 2026-09-01) | sí |
| **44** | `manual-transfer-marking` ✅ (2026-09-06) | Enlazar y desenlazar a mano un traspaso que la detección no puede resolver (`POST/DELETE /api/transfers`, con la memoria de «estos dos no» que anticipó la decisión 4 de la F41; primera migración desde la F9: `Movement.undoneTransferId`) | sí |

**La E4 sigue con Revolut pendiente**, aparcado por decisión del humano hasta que
ese banco tenga movimientos.

## El recorrido en etapas

Leyenda: ✅ hecho · ⏸ esperándote a ti · ⬜ sin empezar · ⚠️ hecho con deuda

| # | Etapa | Estado | Features |
|---|---|---|---|
| E0 | **Cimientos** — arranque, config, errores, tests, lint | ✅ | F1, F2, F14, **F33**, **F34** |
| E1 | **El remoto** — hablar con Google Drive y organizarlo | ✅ | F3, F4 |
| E2 | **Traer los ficheros** — detectar pendientes y descargarlos | ✅ (deuda saldada por la F12) | F5 |
| E3 | **Dónde viven los datos** — el modelo y su migración | ✅ | F8, F9 |
| E4 | **Entender los ficheros** — un parser por banco, con salida común | 🟡 **5 de 6 bancos**, **contrato ✅** · inventario ✅ (2026-08-17); solo queda **Revolut**, aparcado sin datos (Trade Republic entró por `.json` escrito a mano, sin parser de PDF: provisional) | F6, F7, F11, F10, F13, **F18**, **F19**, **F20** |
| E5 | **La importación** — del fichero parseado a la base de datos | ✅ | **F12** |
| E6 | **Enriquecer lo importado** — categoría, traspaso, aportación, confirmación | 🟡 **empezada**: categorías a mano y confirmación ✅ (**F37**, 2026-09-02), traspasos ✅ (**F40** + **F41**, 2026-09-03); faltan aportación (`productId`) y reglas automáticas | **F37**, **F40**, **F41** |
| E7 | **Consultar** — filtros, saldos, totales, patrimonio | 🟡 **casi entera**: saldo real ✅ (F31), su comprobación ✅ (F32), filtros y totales ✅ (F36), resumen del dinero ✅ (**F38**, `GET /api/overview`), vista de inversiones ✅ (**F39**, 2026-09-05, `GET /api/investments/overview`); queda la consulta de **patrimonio neto total** (valor de todo junto en una fecha), dejada fuera de la F39 a propósito y aún sin feature | **F31**, **F32**, **F36**, **F38**, **F39** |
| E8 | **Ver** — el frontend | ⬜ | otro proyecto |
| E9 | **Que esto viva en algún sitio** — despliegue y acceso | ⬜ | *sin etapa hasta hoy* |

> 🔄 **E3 y E4 se intercambiaron el 2026-08-11.** El modelo va **antes** que los
> parsers, no después: la salida del parser se deriva del modelo, así que ponerlo
> primero es lo que hace que guardar sea un mapeo directo. Y del banco **#3 en
> adelante, parser e importación son una sola feature** — ver §El eje que se
> repite.

### E0 — Cimientos ✅

Fastify + Prisma + Postgres en docker, TypeScript estricto ESM, Vitest, oxlint +
Prettier, config de entorno validada al arrancar y errores centralizados
([`src/errors/app-error.ts`](../src/errors/app-error.ts),
[`src/plugins/error-handler.ts`](../src/plugins/error-handler.ts)).

- **F14 `no-real-data`** ✅ (2026-08-12) — el repositorio deja de guardar datos
  financieros tuyos, y deja de depender de que alguien se acuerde:
  [`src/no-real-data.test.ts`](../src/no-real-data.test.ts) **falla en la suite**
  con archivo, línea y motivo si reaparece uno. El mismo escape había ocurrido
  **tres veces** (F6, F12, F13) y las tres las cazó el reviewer leyendo, nunca la
  suite, pese a estar la regla escrita en dos sitios. ADR-017.
- **Tooling al día (2026-08-13, tarea directa):** TypeScript **7**, pnpm
  **11.21.0** y el linter cambiado de ESLint a **oxlint**, porque
  `typescript-eslint` tenía TypeScript congelado en 6.0.3. La regla que salió de
  ahí está en [`docs/stack.md`](./stack.md) §Restricciones: **ninguna herramienta
  de desarrollo bloquea una dependencia del runtime.**

### E1 — El remoto ✅

- **F3** — OAuth con refresh token, cliente de Drive expuesto como plugin
  ([`src/plugins/drive.ts`](../src/plugins/drive.ts)), comprobación bajo demanda
  en `GET /health/drive`.
- **F4** — `notas-banco/<banco>/<año>/procesados/`: crear idempotente, subir y
  mover ([`src/lib/drive-structure.ts`](../src/lib/drive-structure.ts)).
- **Tuyo, ya hecho:** la carpeta raíz la creaste a mano y el backend cuelga de
  ella por variable de entorno. Dar de alta un banco nuevo:
  [`docs/dar-de-alta-un-banco.md`](./dar-de-alta-un-banco.md).

### E2 — Traer los ficheros ✅

**F5** — `GET /api/ingestion/pending` cuenta lo pendiente sin tocarlo;
`POST /api/ingestion/process` descarga a `var/drive-read/`.

> ✅ **Deuda saldada por la F12** (2026-08-12): este endpoint **ya no mueve** nada
> ([`ingestion.service.ts`](../src/modules/ingestion/ingestion.service.ts)), y
> mover a `procesados/` pasó a ser consecuencia de **guardar** los movimientos
> (`POST /api/import`). Un fallo de importación deja el fichero pendiente en Drive
> y se puede reintentar. La misma feature renombró el módulo y sus rutas a inglés
> (`ingesta` → `ingestion`): **breaking change** de contrato, sin consumidor.

### E3 — Dónde viven los datos ✅

- **F8** ✅ — `Account`, `Category`, `Movement` + migración aplicada. Los
  movimientos **no se crean ni se borran por API**: entran solo por importación.
- **F9** ✅ (2026-08-11) — `InvestmentProduct` + `Valuation` + la columna
  reservada `Movement.productId`. Solo esquema y migración, **estrictamente
  aditiva**: el modelo del flujo no cambió ni una línea. El patrimonio de un
  producto es `marketValue + uninvestedCash` (van aparte, confirmado).

Detalle del modelo: [`docs/data-model.md`](./data-model.md).

### E4 — Entender los ficheros 🟡

**La norma:** un parser por banco, sin excepciones, en `src/modules/<banco>/`
([`docs/conventions.md`](./conventions.md) §Parsers de banco). Un banco puede
tener varias entradas dentro de su módulo. **Lo que sí se comparte es la FORMA de
la salida**, no el código que lee el formato.

| Banco | Entradas | Estado |
|---|---|---|
| Bankinter | `.xlsx` de la cuenta | ✅ F6 + F7 (renombrado a inglés) |
| MyInvestor · extracto | CSV de la cuenta corriente | ✅ **F10 `myinvestor-statement`** (2026-08-11) — primer parser nacido ya contra el contrato. **F17** (2026-08-15) rechaza el fichero que no venga en UTF-8 y **F16** (2026-08-16) lee el **saldo de la cuenta** de una segunda línea de preámbulo `saldo;…` |
| MyInvestor · productos | un JSON por producto de inversión | ✅ **F13 `myinvestor-products`** (2026-08-12, ADR-016) — misma ruta `POST /api/parser/myinvestor`, encaminado por extensión; **no toca base de datos**. **F15** (2026-08-13) le añadió `openedAt` **obligatorio en los cuatro tipos**. 🔴 **Sus 5 `.json` SIGUEN sin llegar a la base de datos** tras la F26, que entró solo con Trade Republic: entran en una feature hermana que reutiliza la misma vía de persistencia (ADR-026) |
| N26 | `.csv` de la cuenta (comas, con comillas) | ✅ **F18 `n26-statement`** (2026-08-18, ADR-020) — sin spec. El humano pone el IBAN y el saldo en el preámbulo con `;`, como en MyInvestor. Primer **lector de CSV entrecomillado** del repo (vive dentro del módulo) y **concepto compuesto** porque N26 no exporta ninguna columna de concepto |
| Openbank | «`.xls`» de la cuenta, que **es HTML en cp1252** | ✅ **F19 `openbank-statement`** (2026-08-19, ADR-022) — **con spec**. Se lee tal cual, sin conversión manual: lector de HTML propio **sin dependencias nuevas** y **cp1252 declarado por el parser** (la regla «siempre UTF-8» queda acotada a lo que escribe el humano). Trae el **saldo de la cuenta** en su propio preámbulo; el IBAN lo escribe el humano una vez, en un **comentario HTML** de la primera línea. ~~El saldo por movimiento existe y **no se guarda**~~ → ⛔ **revertido por la F31 `real-account-balance`** (2026-08-25, ADR-028): la quinta columna de cada fila **sí se guarda** desde entonces, en `Movement.balanceAfter`, porque es el **ancla** del saldo real de esta cuenta y tirarla obligaba a releer el fichero para saber cuánto hay. 🔴 No «restaures» el `null` del parser porque este texto dijera lo contrario hasta hoy |
| Revolut | `.csv` de la cuenta (comas) | 🅿️ **aparcado**, y el humano lo confirmó el **2026-08-20** («de momento lo dejamos para más adelante») al repasar el estado de los bancos: hoy sin movimientos ni saldo. Sus carpetas siguen en Drive y su `.csv` se baja en cada ingesta, pero nadie lo parsea; se retoma con un archivo con datos |
| Trade Republic | `.json` de cuenta remunerada escrito a mano (su `.pdf` se ignora) | ✅ **F20 `trade-republic-product-file`** (2026-08-19, ADR-024) — **con spec**. **No se parsea el PDF** y no hay parser de lo que emite el banco: entra como `.json` que el humano rellena cada mes, con **cuadre aritmético que rechaza** el mes que no cuadra. Formato en [`trade-republic-product-files.md`](./trade-republic-product-files.md). **Desde la F26 (2026-08-20, ADR-026) su `.json` ya no muere en un volcado: entra por `POST /api/import` y se guarda como producto con una foto por mes.** 🔴 **Provisional**: el día que esa cuenta tenga movimientos de verdad se escribe el parser del PDF ([diagnóstico](../progress/explorations/inventario-bancos-2026-08-17.md)). ⚠️ **El diagnóstico ya no es cierto** (2026-08-24): el extracto desde la apertura **sí sobrevive a la extracción de texto** y trae el saldo corriente por línea, y esa cuenta **sí tuvo movimientos** además de los intereses. Se usó una sola vez, a mano, para generar los 25 `.json` del histórico; **no se añadió parser** y la decisión del ADR-024 sigue en pie. Ver [`historico-cuentas-2026-08-24.md`](../progress/explorations/historico-cuentas-2026-08-24.md) |

**F11 `parsed-movement-contract`** ✅ (2026-08-11) — la pieza que faltaba, ya
puesta. El contrato vive en
[`src/lib/parsed-statement.ts`](../src/lib/parsed-statement.ts) y **no queda
ninguna declaración duplicada** de `ParsedMovement`, `UnparsedRow` ni
`ParsedMovementType`; Bankinter se queda solo con
`BankinterParseResult = ParsedStatement<'bankinter'>`. Lo que trajo:

- **El dato que no viene en el fichero es `null` explícito**, nunca `0` ni `''`:
  MyInvestor no trae ni saldo ni IBAN, y un cero mentiría.
- **El importe 0 sale `neutral`**, reutilizando el helper único
  [`movements.service.ts:33`](../src/modules/movements/movements.service.ts#L33).
  Cierra el cabo suelto #2.
- **`daySequence` la emite cada parser**, contando desde el más antiguo del día —
  el sentido en que exporta cada banco es conocimiento suyo, no del importador
  (Bankinter exporta `newest-first`). El design de la F8 lo predijo por escrito
  (`specs/08-data-model/design.md:584`).
- ⚠️ **Supuesto que la F12 debe conocer:** `daySequence` numera solo las filas
  parseadas, no las no reconocidas.

Decisiones en el **ADR-013** de [`docs/architecture.md`](./architecture.md).

> ~~📌 **Lo que falta antes de poder planificar los ~5 restantes:** la tabla
> «Inventario por banco» de `docs/ideas.md` sigue **vacía**.~~ ✅ **Se rellenó el
> 2026-08-17** ([`docs/ideas.md`](../../docs/ideas.md) §Inventario por banco) y
> **ya no bloquea nada**. Este párrafo siguió diciendo lo contrario hasta el
> 2026-09-01, en el mismo documento que arriba lo daba por hecho.

### E5 — La importación ✅ (**F12**, 2026-08-12)

**El eslabón que faltaba, ya puesto.** `POST /api/import` baja cada fichero
pendiente, lo parsea con el parser de su banco, **guarda sus movimientos** y solo
entonces lo mueve a `procesados/`. Lo que trajo:

1. Contrato del parser → `Movement` con la tabla de mapeo que el design de la F8
   §9 ya dejó escrita: `origin='imported'`, `status='pending_review'`, importe
   siempre positivo con el signo en `type`, y el saldo **leído, nunca inventado**.
2. **Auto-alta de cuenta desde el IBAN del fichero**; sin IBAN usa la única cuenta
   ya dada de alta de ese banco, y si hay cero o varias no importa nada y te pide
   escribir el IBAN una vez. **Nunca se crea una cuenta sin IBAN.**
3. **Dedup delegado en la base de datos** (índice único parcial con `daySequence`):
   reimportar el mismo fichero no duplica y te dice cuántos descartó.
4. **Mover a `procesados/` es consecuencia de guardar.** Cierra el cabo suelto #1.
5. **El importador no sabe de bancos:** la lista de parsers se le inyecta desde
   `app.ts`. Añadir un banco es una línea allí.
6. **`ingesta` → `ingestion`**, en código y en rutas. Cierra el cabo suelto #4.

Decisiones en el **ADR-015** de [`docs/architecture.md`](./architecture.md).

> ⚠️ **Límite que sigue vivo:** `daySequence` numera **solo las filas parseadas**
> (ADR-013). Si algún día arreglas un parser y reimportas un fichero que tenía
> líneas raras, ese día se renumera y puede aparecer algún movimiento **duplicado
> visible** de ese día — nunca una pérdida silenciosa. Sin dueño todavía.

**Orden acordado (2026-08-11):** F9 → F11 → F10 → F12. Las cuatro ✅.

### E6 — Enriquecer lo importado ⬜

El modelo ya tiene los huecos reservados; lo que falta es **quién los llena**.
Cada línea de esta tabla es, como mínimo, una feature:

| Hueco en el modelo | Quién lo llenará | Feature |
|---|---|---|
| `Movement.categoryId` | categorización por reglas sobre `description` | ⬜ |
| `Movement.transferId` | detección de las dos piernas de un traspaso | ⬜ |
| `Movement.productId` | enlace aportación ↔ producto de inversión | ⬜ |
| `Movement.status` | pantalla de revisar y confirmar lo importado | ⬜ |
| `Movement.paymentMethod`, `note` | sin decidir | ⬜ |
| `Movement.origin = manual` | sin productor a propósito (F8) | — |

### E7 — Consultar ⬜

Hoy existen `GET /api/accounts`, `/api/categories` y `/api/movements`, y son
**listados planos: sin filtros, sin rango de fechas y sin paginación**. Valen
para probar, no para un dashboard con años de movimientos. Falta:

- Filtros por fecha, cuenta, categoría, forma de pago y texto del concepto.
- ~~Saldo por cuenta (del `balanceAfter` del movimiento más reciente).~~
  ✅ **hecho por la F31** (2026-08-26). Y la descripción de arriba se quedó corta:
  el saldo **no** es el `balanceAfter` más reciente a secas, sino el importe del
  punto de anclaje **más el neto de lo estrictamente posterior** — porque un
  extracto puede ir con retraso y el archivo no siempre es lo último. Donde el
  archivo trae saldo por línea, ese sigue mandando: la precedencia **no** se
  invirtió. ✅ Y desde la **F32** (2026-08-30) la importación **comprueba** que ese
  número cuadra y escribe los descuadres en su informe.
- Totales del mes **excluyendo los movimientos con `transferId`**.
- Patrimonio en una fecha (`marketValue + uninvestedCash` por producto).

### E8 — Ver: el frontend ⬜

Otro proyecto y **otra sesión** (regla de oro del workspace: backend primero,
frontend después). Tiene los cimientos hechos (bootstrap, Tailwind, design
tokens, e2e) y **cero features de producto**. Le esperan el botón «importar», el
aviso de «N nuevos», la pantalla de revisión y los dashboards.

> ⚠️ **Breaking change vigente:** `/api/expenses*` → 404. El contrato nuevo está
> en [`docs/api-contract.md`](./api-contract.md) y **aún no lo consume nadie**.

### E9 — Que esto viva en algún sitio ⬜

**Ninguna etapa lo cubría hasta hoy.** La app es web y se usa desde varios
ordenadores, así que en algún momento deja de ser `localhost`. Cuando eso pase
hará falta decidir: dónde corre, cómo se accede (hoy **la API no tiene
autenticación de ningún tipo**), dónde vive Postgres y qué se hace con el
refresh token de Drive fuera de tu máquina. No es urgente; es que no estaba.

---

## El eje que la lista de features esconde: **por cada banco**

La lista de features es plana y hace parecer que «los parsers» son un paso. No
lo son: son **un paso que se repite ~7 veces**, y cada repetición arrastra tres
cosas fuera del código.

Por cada banco nuevo:

1. Su carpeta en Drive ([`docs/dar-de-alta-un-banco.md`](./dar-de-alta-un-banco.md)) — **tú**.
2. Una muestra real del fichero delante — **tú** (sin ella no se escribe el spec:
   [`docs/specs.md`](./specs.md) §Regla 4). Las que ya hay viven **gitignoreadas**
   en `var/drive-read/` (crudo) y `var/parsed/` (parseado): el `.xlsx` de
   Bankinter y, en `var/drive-read/myinvestor/2026/`, el CSV del extracto de
   MyInvestor más tres capturas de producto.
3. Su módulo `src/modules/<banco>/`, que emite el contrato común — **una feature**.
4. Su cuenta en la base de datos: automática si el extracto trae IBAN, **a mano
   si no** (le pasa a MyInvestor).

### Del banco #3 en adelante: **parsear e importar son la misma feature**

Los dos primeros bancos se hicieron en pasos separados (leer → parsear →
guardar) y **estuvo bien**: la F5 puso el fichero real delante y por eso la F6
salió a la primera, en vez de reescribirse dos veces como pasó cuando se redactó
sobre un formato supuesto ([`docs/specs.md`](./specs.md) §Regla 4).

Pero eso era **coste de arranque, y ya está pagado.** La fontanería (F3, F4, F5)
es agnóstica del banco, el modelo existe (F8) y a partir de F11 hay un contrato
al que adaptarse. Del tercer banco en adelante no se aprende nada separándolo:
**una feature = su parser + su alta en el importador.**

> ⚠️ **Juntar la feature no es juntar los pasos.** La copia cruda en
> `var/drive-read/` y el fichero conservado en `procesados/` siguen siendo lo que
> te deja **re-parsear cuando mejores el parser** sin volver a bajar nada del
> banco. Eso está decidido en [`docs/ideas.md`](../../docs/ideas.md) y no cambia.

### Por qué el contrato común no contradice «un parser por banco»

La norma prohíbe compartir el **parser** —el código que lee el formato— porque el
formato de cada banco cambia sin avisar y un parser compartido convierte el
cambio de uno en una regresión para todos. Compartir el **tipo de salida** es lo
contrario: es la interfaz estable contra la que cada banco se adapta por su
cuenta, y es lo que permite que el importador no sepa de bancos.

Y el contrato **no es el modelo de la base de datos**, aunque se derive de él:

| Contrato del parser | `Movement` en la BD |
|---|---|
| `amount` con signo | `amount` positivo + `type` |
| `accountIban` (texto, opcional) | `accountId` (clave foránea; la cuenta puede no existir) |
| `balance` opcional | `balanceAfter` (MyInvestor no lo trae) |
| `unparsedRows` | no existe en la BD |
| — | `origin`, `status`, `transferId` (los fija el importador) |

Que `accountIban` y `balance` sean opcionales es justo **lo que MyInvestor
descubrió**: por eso el contrato se escribe ahora, que es la primera vez que hay
muestras reales de dos bancos delante.

---

## Cabos sueltos con dueño

Cosas que están mal a propósito y **dónde se arreglan**. Si una de estas no
tiene etapa, es que se va a perder.

| # | Cabo suelto | Lo resuelve |
|---|---|---|
| ~~1~~ | ~~«Procesado» significa «descargado», no «guardado»~~ | ✅ **cerrado por la F12** (2026-08-12): mover a `procesados/` es consecuencia de guardar, y `POST /api/ingestion/process` ya no mueve |
| ~~2~~ | ~~Importe 0: el parser de Bankinter lo trata como `income`~~ | ✅ **cerrado por la F11** (2026-08-11): sale `neutral` |
| ~~7~~ | ~~`ParsedMovement` vive dentro de `bankinter/`; `deriveMovementTypeFromAmount` reimplementado~~ | ✅ **cerrado por la F11**: contrato en [`src/lib/parsed-statement.ts`](../src/lib/parsed-statement.ts), helper único |
| ~~8~~ | ~~`computeTotals` **no excluye** `productId != null`~~ | ✅ **ya estaba cerrado por la F36** y esta tabla no se enteró: la exclusión existe en `computeTotals` junto a la de `transferId` (comprobado el 2026-09-05 por la F38 leyendo la función y ejecutando sus tests, [movements.service.ts:335](../src/modules/movements/movements.service.ts#L335)) |
| ~~9~~ | ~~`InvestmentProduct.openedAt` nace **sin escritor previsto**~~ | ✅ **cerrado del todo por la F26** (2026-08-20): la F15 puso la fecha en el JSON y la F26 le puso el escritor — `persistSavingsSnapshot` la guarda en la columna. Para los productos de MyInvestor sigue pendiente su feature hermana |
| ~~11~~ | ~~Lo que el humano deja en Drive **no llega a la base de datos**: los `.json` de producto morían en `var/parsed/`~~ | ✅ **cerrado del todo**: para Trade Republic por la **F26** (2026-08-20, ADR-026) y para los 5 `.json` de MyInvestor por la **F29** (2026-08-21). Los dos entran por `POST /api/import` y se guardan como `InvestmentProduct` (+ `SavingsSnapshot` o `Valuation`); sus dos parsers están en el registro de productos de [`src/app.ts`](../src/app.ts). ⚠️ Esta fila siguió diciendo «sigue abierto para MyInvestor» **diez días después de cerrarse**, hasta el 2026-09-01 |
| ~~12~~ | ~~**Nada LEE la capa de inversiones.**~~ | ✅ **cerrado por la F39** (2026-09-05): `GET /api/investments/overview` lee productos, valoraciones y los intereses de la cuenta remunerada. La consulta de **patrimonio neto total** sigue sin existir, a propósito (fuera del alcance de la F39); anotada en la fila E7 |
| 13 | **Los contadores de `POST /api/import` cuentan movimientos, no productos.** Un archivo de producto que ha entrado bien sale con `status: "imported"` y su `product`/`snapshot` creados, pero el resumen de arriba dice `importedCount: 0` — y el resumen es lo primero que se lee, así que un mes bien guardado se lee como «0 importados». Encontrado en la **prueba real de la F26** ([informe](../progress/explorations/prueba-real-cuenta-remunerada-2026-08-20.md)); misma familia que el mensaje falso de la F22 y que el del `.pdf`: la respuesta dice algo que no es. Se arregla haciendo que los contadores distingan movimientos de productos, o que cuenten las dos cosas | **candidato, sin abrir** |
| 14 | **Los dos inquilinos de `var/drive-read/` no saben volver a Drive.** Esa carpeta es una **caché**: la importación no la necesita (descarga a memoria, escribe la copia y parsea el buffer), pero **el ensayo** (`POST /api/parser/<banco>`) y **la reimportación local** (`POST /api/import/local`, F25) leen SOLO de ella. En producción la caché es efímera —se pierde en cada despliegue— y los dos dejan de funcionar en cuanto no está. El almacén duradero ya existe y es Drive: los ficheros ya importados viven en `procesados/`, que **hoy no lee ningún endpoint**. Anotado el 2026-08-22 a petición del humano, «para que no se me olvide», con la decisión explícita de **no construirlo todavía**: la forma del arreglo depende de cómo se despliegue y de si esas dos rutas tienen sentido en producción | **sin abrir, hasta que haya despliegue** |
| ~~3~~ | ~~Todo lo importado nace `pending_review` y **nada lo pasa a `confirmed`**~~ | ✅ **cerrado por la F37** (2026-09-02): `PATCH /api/movements/:id` cambia `status` en los dos sentidos |
| ~~4~~ | ~~`src/modules/ingesta/` y `/api/ingesta/*` están en español~~ | ✅ **cerrado por la F12** (2026-08-12): `src/modules/ingestion/` y `/api/ingestion/*`; las rutas viejas responden 404 |
| 10 | `daySequence` numera solo las filas parseadas: reimportar un fichero tras arreglar su parser puede renumerar ese día y dejar duplicados **visibles** | sin dueño |
| 15 | **`bankinter.routes.test.ts` es el único banco que NO comprueba que su ruta esté registrada en la app real.** No es un agujero de datos —no invoca nada—, pero sí de cobertura: si alguien quitara su línea de `src/app.ts`, ningún test lo diría. Una línea con `hasRoute` lo cierra. Encontrado en la **F33** (2026-08-26) al arreglar el test hermano de Trade Republic | **sin abrir, una línea** |
| 16 | **El valor por defecto que apunta a `var/` vive en seis módulos de rutas.** Mientras exista, un test que olvide inyectar directorios cae en los datos reales del humano — que es exactamente lo que pasó y originó la F33. La red que puso la F33 lo **caza**, pero no lo **impide**. Pasar esos valores por defecto a inyectarse desde `src/app.ts` haría que un test no pudiera caer en `var/` ni queriendo. Es un cambio de firma en seis módulos | **sin abrir** |
| ~~18~~ | ~~`./init.sh` no ejecuta `format:check`~~ | ✅ **cerrado el 2026-09-01**, y era peor de lo escrito: **tampoco ejecutaba el linter**. Ahora hay un **paso 5, «Lint y formato»**, que corre `pnpm run lint` y `pnpm run format:check` y **pone la pasada en rojo** — comprobado metiendo un archivo mal formateado a propósito, no deducido. Va después de la salida del modo `--fast` para no cargar el ciclo corto del hook. ⚠️ **Y la última frase de este cabo era falsa**: `scripts/bankinter-pdf-a-xlsx.mjs` **no** incumple el estándar en `HEAD` (`prettier --check` lo da por bueno tal y como está commiteado; le quedan 5 líneas de más de 100 columnas, pero son cadenas y comentarios que el formateador no puede partir, y el formateador es quien hace cumplir la regla). Lo que fallaba era **la copia del árbol de trabajo, con finales de línea CRLF** — exactamente el caso que `.gitattributes` describe en su propio comentario. Se normalizó al vuelo y el commit no cambia ni un byte de ese archivo |
| 17 | **Los contadores de `POST /api/import` no distinguen anclaje ni relleno en el total del run.** La F31 añadió `anchored` y `balancesFilled` por archivo, pero `ImportRunResult` no los agrega, así que no hay total de la pasada. Documentado a propósito en `docs/api-contract.md` para que nadie lo busque. Misma familia que el cabo 13 | **con el cabo 13** |
| ~~5~~ | ~~El histórico del Excel de años~~ | ✅ **descartado (2026-08-22, reafirmado el 2026-08-23)**, ver `../../docs/ideas.md` §6. El vacío se llena con extractos de los bancos de varios años atrás, no con el Excel: una sola fuente, sin solape ni duplicados incasables |
| 6 | La base de datos no tiene copia de seguridad; el crudo de Drive te salva los movimientos, **no** las categorías, alias ni `initialBalance` | sin dueño |

> **Sobre el 6:** volver a parsear desde Drive te reconstruye lo importado, pero
> solo si el importador de la E5 es determinista y re-ejecutable. Merece la pena
> exigírselo en su `intent`.

---

## Deberes tuyos pendientes (no son código)

- ~~🔴 **Comparar los cuatro saldos con la web de tu banco**~~ — **retirado de
  los pendientes por decisión del humano el 2026-09-05** («no lo volvamos a
  mostrar como una cosa que falta por hacer»). Era el paso que quedaba del
  checkpoint C4 bis de la F31; los otros dos están hechos
  ([informe](../progress/explorations/prueba-real-f31-2026-08-31.md)). No se
  vuelve a listar: si algún día un saldo no cuadra con el banco, se trata como
  un problema nuevo, no como este deber.

- **El IBAN, una vez, en el fichero.** En el CSV de MyInvestor, una línea
  `iban;ES30…` **encima** de la fila de cabecera. Con ponerlo en uno de sus
  ficheros basta: los siguientes ya no lo necesitan. Si lo editas con Excel,
  guárdalo como **«CSV UTF-8»**.
- **El IBAN puedes escribirlo como quieras, pero bien** (F21, 2026-08-18): con
  espacios o sin ellos, en mayúsculas o en minúsculas, da lo mismo — el backend lo
  normaliza y el mismo IBAN ya no te crea **dos cuentas**. Lo que sí falla ahora es
  un **dígito mal tecleado**: el fichero se rechaza entero (`INVALID_IBAN`) y no se
  crea ninguna cuenta. El separador sigue siendo `;`; `iban: …` con dos puntos no
  vale, por decisión tuya del mismo día. Ver ADR-021.
- **El saldo, UNA VEZ por cuenta, debajo del IBAN** (F16, 2026-08-16; corregido
  por la **F31**, 2026-08-25): línea `saldo;1500,00` encima de la cabecera, y
  **borrar la fila `Saldo` del final** del fichero, que el backend no lee. ~~Cada
  mes~~: basta una vez, porque ese importe queda guardado como punto de partida y
  a partir de ahí el saldo se mantiene solo. Si algún mes te la saltas, no falla
  nada. Cómo se escribe: [`docs/archivos-por-banco.md`](archivos-por-banco.md)
  (tabla) o [`docs/dar-de-alta-un-banco.md`](dar-de-alta-un-banco.md) (el porqué).
- ~~**Cuenta corriente de MyInvestor: alta a mano.**~~ ✅ **ya no hace falta**
  (F12): con esa línea, la cuenta se crea sola al importar.
- ~~**`initialBalance` de esa cuenta: correcto a la primera.**~~ ✅ **deja de ser un
  deber** (2026-08-24, decisión tuya): el histórico se usa como **serie**, no como saldo
  absoluto, así que lo que tiene que cuadrar es el **total de hoy** y la **variación
  entre dos fechas**. Las cuatro cuentas siguen con `initialBalance` a `0`.
  ⛔ ~~su saldo calculado queda desplazado por lo que hubiera antes del primer
  movimiento importado; ese desplazamiento es **constante por cuenta** y por eso no
  toca la variación~~ → **ya no hay desplazamiento** desde la **F31
  `real-account-balance`** (2026-08-25, ADR-028): el total de hoy se ancla, ahora de
  verdad y en la base de datos (`Account.balanceAnchor`), en el saldo del preámbulo
  de cada extracto —o en el saldo de la línea más reciente si el archivo no trae
  preámbulo—, no en el de apertura, y `initialBalance` ya no interviene en una
  cuenta anclada. Ver
  [`historico-cuentas-2026-08-24.md`](../progress/explorations/historico-cuentas-2026-08-24.md).
- ~~**Inventario por banco:** entrar en cada web y anotar si da CSV/PDF.~~ ✅
  **hecho el 2026-08-17**, leyendo las muestras reales de Drive en vez de entrar
  en cada web. Ya no bloquea la E4.
- Los dos anteriores salen de
  [`specs/10-myinvestor-statement/decisions.md`](../specs/10-myinvestor-statement/decisions.md)
  (§Consecuencias que te tocan a ti).
- ~~**La plantilla mensual, en una carpeta HERMANA de `notas-banco/`**~~ ✅ **hecho**
  (2026-08-13): la carpeta ya está creada en Drive, fuera de `notas-banco/`. De
  [`specs/13-myinvestor-products/decisions.md`](../specs/13-myinvestor-products/decisions.md).
- 🔴 **Actualizar esa plantilla con `openedAt`** (F15, 2026-08-13). Nadie comprueba
  que la plantilla de Drive coincida con la documentación, así que **todo archivo
  escrito con la plantilla vieja fallará** por falta de la fecha de apertura. Es una
  línea; cópiala de
  [`docs/myinvestor-product-files.md`](./myinvestor-product-files.md).
- **Reimportar un fichero ya procesado** exige devolverlo a mano en Drive de
  `procesados/` a la carpeta del año. Reimportarlo no duplica nada.

### Dos decisiones que la F14 te devolvió (2026-08-12, ninguna urgente)

- ~~**El histórico de git.**~~ ✅ **decidido y cerrado (2026-08-13): se queda como
  está, riesgo aceptado.** No volver a sacar el tema. Se verificó primero que
  **no había habido reescritura** (los 36 commits conservan hash y fecha) y que
  el alcance real es mayor de lo que se creía: además de las cifras de inversión,
  desde la **F6** hay dos IBAN válidos por checksum (Bankinter en 14 commits
  desde `4caeb38`, otro en 4 commits de la F12) y lo saneado por la F14 en ~40
  archivos — importes, conceptos del extracto, el nombre de la empresa y el
  nombre completo de un tercero. Con eso delante, la decisión se mantiene: el
  repositorio es **privado**, **HEAD está limpio** y
  [`src/no-real-data.test.ts`](../src/no-real-data.test.ts) impide la recaída.
  Si algún día el repositorio deja de ser privado, esto **vuelve a la mesa** y la
  salida limpia es: rewrite del histórico **más** borrar y recrear el repo en
  GitHub (un force-push a secas deja los commits viejos alcanzables por SHA).
- ~~**Una línea real sigue en una migración ya aplicada.**~~ ✅ **cerrado
  (2026-08-15), y sin resetear nada.** Era
  `prisma/migrations/20260806191700_data_model/migration.sql`, cuyo comentario
  citaba un movimiento auténtico de tu extracto de Bankinter —concepto, importe y
  fecha— como ejemplo de por qué `daySequence` entra en el índice. Lo destapó el
  guardián de la F14 al haber capturas nuevas en `var/`; hasta entonces nadie lo
  veía. Se tomó la segunda salida de las dos que quedaban apuntadas aquí: **editar
  el comentario y realinear el checksum a mano**. Solo cambió el comentario, el DDL
  no se tocó, así que el esquema es idéntico. El checksum guardado en
  `_prisma_migrations` **sí** había quedado desalineado (`prisma migrate status`
  no lo detecta, hay que compararlo a mano); se corrigió y los tres vuelven a
  coincidir. **No hizo falta `migrate reset` ni se perdió la base de datos**, así
  que el temor que dejó anotado la F14 resultó ser mayor que el problema real.

---

## ⚠️ `docs/ideas.md` está desactualizado y te va a volver a asustar

Es un documento de **producto** que dejó de actualizarse cuando las features
cambiaron las decisiones. Hoy **contradice al código en cinco puntos**, y eso es
exactamente lo que hace pensar que se ha perdido el control del proyecto cuando
en realidad se está leyendo un documento viejo:

| `docs/ideas.md` dice | El código dice |
|---|---|
| «las ~7 cuentas bancarias **+ efectivo**» | No hay cuenta de efectivo ([`schema.prisma:16`](../prisma/schema.prisma#L16)) |
| «`type` = `expense` \| `income` \| **`transfer`**» | No existe `transfer`; existe `neutral` ([`schema.prisma:29`](../prisma/schema.prisma#L29)) |
| «**Alta manual** de movimientos también posible» | `/api/movements` es **solo lectura** |
| Dedup por «cuenta + fecha + importe + concepto» | Además `daySequence` |
| «convertir esto en la **feature 6**» | Acabó siendo la **feature 8** |

Y su tabla final «Decisiones: de idea a features» sigue **vacía** después de diez
features.

**Qué hacer con él:** o se actualiza al cerrar cada feature que cambie una
decisión de producto, o se marca arriba como captura histórica y se pone que la
verdad viva está en `docs/data-model.md` y en este roadmap. Lo que no puede
seguir es pareciendo vigente.

---

## Cómo se mantiene este archivo

Para que no acabe como `ideas.md`:

1. **Se lee al empezar** la sesión, después de `progress/current.md`.
2. **Se actualiza al cerrar** una feature, en el mismo paso en que se vacía
   `current.md`: cambiar el estado de su etapa y tachar el cabo suelto que haya
   resuelto. Normalmente son **dos líneas**.
3. **No crece.** Si una etapa necesita más de cinco líneas, su sitio es el
   `intent` de una feature, no aquí.
