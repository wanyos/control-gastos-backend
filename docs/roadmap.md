# Roadmap — por dónde va el backend

> **Para qué sirve este archivo:** para saber en dos minutos **dónde estás**,
> **qué viene después** y **por qué en ese orden**. Es el mapa del recorrido
> completo, no el detalle de ninguna parada.
>
> **Última revisión:** 2026-08-11.

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

**Sabes traer ficheros del banco y sabes entenderlos. Todavía no sabes
guardarlos.** Ninguna línea de código escribe hoy un `Movement` a partir de un
fichero parseado: el parser vuelca a un JSON local y ahí se acaba el camino.

**Ya tienes el sitio donde guardarlo todo (E3 ✅, F9) y la forma común en que los
parsers hablan (F11 ✅).** Ambas cerradas el 2026-08-11.

Y **ya hay dos bancos que sabes leer**: la F10 cerró el extracto de MyInvestor,
el primer parser nacido directamente contra el contrato. La antigua F10 se
**partió en dos** (70 requirements escondían dos features): los JSON de producto
son ahora la **F13**, que te espera con cinco decisiones.

**Ya no hay nada esperándote.** El 2026-08-11 cerraste los cinco puntos rojos de
la F13, sus tres casillas de campos y el `intent` de la F12: no queda ningún
`intent` en borrador del agente ni ninguna decisión pendiente de tu visto bueno.
Las dos features que quedan (F13 y F12) están listas para arrancar.

---

## El recorrido en etapas

Leyenda: ✅ hecho · ⏸ esperándote a ti · ⬜ sin empezar · ⚠️ hecho con deuda

| # | Etapa | Estado | Features |
|---|---|---|---|
| E0 | **Cimientos** — arranque, config, errores, tests, lint | ✅ | F1, F2 |
| E1 | **El remoto** — hablar con Google Drive y organizarlo | ✅ | F3, F4 |
| E2 | **Traer los ficheros** — detectar pendientes y descargarlos | ⚠️ | F5 |
| E3 | **Dónde viven los datos** — el modelo y su migración | ✅ | F8, F9 |
| E4 | **Entender los ficheros** — un parser por banco, con salida común | 🟡 2 de ~7 bancos, **contrato ✅** | F6, F7, F11, F10, **F13 ⏸** |
| E5 | **La importación** — del fichero parseado a la base de datos | ⬜ | **F12** |
| E6 | **Enriquecer lo importado** — categoría, traspaso, aportación, confirmación | ⬜ | *sin features* |
| E7 | **Consultar** — filtros, saldos, totales, patrimonio | ⬜ | *sin features* |
| E8 | **Ver** — el frontend | ⬜ | otro proyecto |
| E9 | **Que esto viva en algún sitio** — despliegue y acceso | ⬜ | *sin etapa hasta hoy* |

> 🔄 **E3 y E4 se intercambiaron el 2026-08-11.** El modelo va **antes** que los
> parsers, no después: la salida del parser se deriva del modelo, así que ponerlo
> primero es lo que hace que guardar sea un mapeo directo. Y del banco **#3 en
> adelante, parser e importación son una sola feature** — ver §El eje que se
> repite.

### E0 — Cimientos ✅

Fastify + Prisma + Postgres en docker, TypeScript estricto ESM, Vitest, ESLint +
Prettier, config de entorno validada al arrancar y errores centralizados
([`src/errors/app-error.ts`](../src/errors/app-error.ts),
[`src/plugins/error-handler.ts`](../src/plugins/error-handler.ts)).

### E1 — El remoto ✅

- **F3** — OAuth con refresh token, cliente de Drive expuesto como plugin
  ([`src/plugins/drive.ts`](../src/plugins/drive.ts)), comprobación bajo demanda
  en `GET /health/drive`.
- **F4** — `notas-banco/<banco>/<año>/procesados/`: crear idempotente, subir y
  mover ([`src/lib/drive-structure.ts`](../src/lib/drive-structure.ts)).
- **Tuyo, ya hecho:** la carpeta raíz la creaste a mano y el backend cuelga de
  ella por variable de entorno. Dar de alta un banco nuevo:
  [`docs/dar-de-alta-un-banco.md`](./dar-de-alta-un-banco.md).

### E2 — Traer los ficheros ⚠️

**F5** — `GET /api/ingesta/pending` cuenta lo pendiente sin tocarlo;
`POST /api/ingesta/process` descarga a `var/drive-read/` y mueve el original a
`procesados/`.

> 🔴 **Deuda conocida:** hoy «procesado» significa **descargado**, no
> **guardado en la base de datos**
> ([`src/modules/ingesta/ingesta.service.ts:67`](../src/modules/ingesta/ingesta.service.ts#L67)).
> **La E5 tiene que retocar este flujo** para que un fallo de importación deje
> el fichero pendiente en Drive y se pueda reintentar.

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
| MyInvestor · extracto | CSV de la cuenta corriente | ✅ **F10 `myinvestor-statement`** (2026-08-11) — primer parser nacido ya contra el contrato |
| MyInvestor · productos | un JSON por producto de inversión | ⏸ **F13 `myinvestor-products`** — esperándote: tiene **5 puntos rojos** en su [`decisions.md`](../specs/myinvestor-products/decisions.md) |
| Los ~5 restantes | sin inventariar | ⬜ **no existen ni como feature** |

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
  (`specs/data-model/design.md:584`).
- ⚠️ **Supuesto que la F12 debe conocer:** `daySequence` numera solo las filas
  parseadas, no las no reconocidas.

Decisiones en el **ADR-013** de [`docs/architecture.md`](./architecture.md).

> 📌 **Lo que falta antes de poder planificar los ~5 restantes:** la tabla
> «Inventario por banco» de [`docs/ideas.md`](../../docs/ideas.md) sigue
> **vacía**. Hasta que no entres en cada web y anotes si da CSV, no sabes cuántas
> features son ni cuáles necesitan la extensión de navegador.

### E5 — La importación ⬜ (**F12**) ← **el eslabón que falta**

**Hoy no existe para nada:** ninguna línea escribe un `Movement` a partir de un
fichero parseado. Alcance previsto (el design de la F8 §9 ya dejó escrita la tabla
de mapeo):

1. Contrato del parser → `Movement`, con `origin='imported'` y
   `status='pending_review'`.
2. Auto-alta de cuenta desde `accountIban` + `bank`; si faltan, error
   diferenciable para que el frontend pida el alta a mano (el servicio ya existe).
3. Dedup de re-descargas con el índice único parcial que incluye `daySequence`.
4. Mover a `procesados/` **cuando el dato está en la base de datos**, no al
   descargar. **Cierra el cabo suelto #1.**

**Orden acordado (2026-08-11):** F9 → F11 → F10 → F12. Las tres primeras ✅.

**`intent` cerrado por el humano el 2026-08-11**, con tres decisiones que fijan
el alcance:

1. **El fichero se mueve a `procesados/` cuando el dato está guardado**, no al
   descargarlo. Retoca el flujo de la F5 y **cierra el cabo suelto #1**.
2. **Una importación parcial guarda lo bueno y reporta el resto**, en vez de
   todo-o-nada: una línea rara no bloquea el mes entero, y como los movimientos
   no se crean a mano, bloquearlo dejaría el mes sin forma de entrar.
3. **Los productos de inversión NO se guardan aquí:** su regla de duplicado es la
   contraria (recargar **sobrescribe**), y mezclarlas es lo que obligó a partir
   la F10 en dos. Serán una feature propia.

Falta su spec (`sdd: true`): `acceptance` ya derivado, 12 criterios.

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
- Saldo por cuenta (del `balanceAfter` del movimiento más reciente).
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
| 1 | «Procesado» significa «descargado», no «guardado» | **E5 / F12** |
| ~~2~~ | ~~Importe 0: el parser de Bankinter lo trata como `income`~~ | ✅ **cerrado por la F11** (2026-08-11): sale `neutral` |
| ~~7~~ | ~~`ParsedMovement` vive dentro de `bankinter/`; `deriveMovementTypeFromAmount` reimplementado~~ | ✅ **cerrado por la F11**: contrato en [`src/lib/parsed-statement.ts`](../src/lib/parsed-statement.ts), helper único |
| 8 | `computeTotals` **no excluye** `productId != null`. Hoy da igual (la columna es siempre `null`), pero en cuanto exista quien la escriba, las aportaciones mensuales contarán como gasto del mes | **E6** (con su escritor) |
| 9 | `InvestmentProduct.openedAt` nace **sin escritor previsto**: el formato del fichero no lo lleva, así que se queda `NULL` | sin dueño |
| 3 | Todo lo importado nace `pending_review` y **nada lo pasa a `confirmed`** | **E6** |
| 4 | `src/modules/ingesta/` y `/api/ingesta/*` están en español, contra la norma de [`docs/conventions.md`](./conventions.md) §Idioma | sin dueño |
| 5 | El histórico del Excel de años (idea #5 ❄️) sigue sin decidirse dentro/fuera | sin dueño |
| 6 | La base de datos no tiene copia de seguridad; el crudo de Drive te salva los movimientos, **no** las categorías, alias ni `initialBalance` | sin dueño |

> **Sobre el 6:** volver a parsear desde Drive te reconstruye lo importado, pero
> solo si el importador de la E5 es determinista y re-ejecutable. Merece la pena
> exigírselo en su `intent`.

---

## Deberes tuyos pendientes (no son código)

- **Cuenta corriente de MyInvestor: alta a mano.** Su extracto no trae IBAN, así
  que el alta automática no puede funcionar.
- **`initialBalance` de esa cuenta: correcto a la primera.** Tampoco trae saldo
  por movimiento, así que es **el único ancla**; si lo pones mal, todo el saldo
  queda desplazado por igual.
- **Inventario por banco:** entrar en cada web y anotar si da CSV/PDF.
- Los dos anteriores salen de
  [`specs/myinvestor-statement/decisions.md`](../specs/myinvestor-statement/decisions.md)
  (§Consecuencias que te tocan a ti).

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
