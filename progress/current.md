# Sesión actual

> Este archivo se vacía al cerrar cada sesión y se mueve a `history.md`.
> Mientras trabajas, **mantenlo actualizado en tiempo real**, no al final.

- **Tarea en curso:** ninguna. La **F16 `statement-balance`** se cerró el 2026-08-16
  (`reviewer`: **APROBADO sin cambios requeridos**) y con ella **no queda ninguna
  feature `pending`** en `feature_list.json`.
- **Inicio:** 2026-08-15
- **Agente:** leader + implementer + reviewer

## F16 `statement-balance` — cerrada

Sale de la decisión del humano del 2026-08-15 en la
[prueba real](prueba-drive-real-2026-08-15.md) §Decisión del humano sobre el saldo. Sin
spec (`sdd: false`): del `intent` + los 12 criterios de `acceptance`. Informe:
[`implementations/statement-balance.md`](implementations/statement-balance.md) ·
veredicto: [`reviews/statement-balance.md`](reviews/statement-balance.md) · resumen:
[`summaries/statement-balance.md`](summaries/statement-balance.md).

1. ✅ El extracto admite una **segunda línea de preámbulo etiquetada**,
   `saldo;<importe>`, junto a la del `iban;`, y el resultado la expone como
   `accountBalance`.
2. ✅ **`accountBalance` vive en el contrato común**
   ([`src/lib/parsed-statement.ts`](../src/lib/parsed-statement.ts)), con Bankinter
   emitiendo `null`. **El reviewer lo respalda expresamente y dice que la alternativa
   habría sido la equivocada**, con un argumento que no estaba en el informe: con el
   campo declarado solo en el resultado de MyInvestor, el dato quedaría **invisible
   para el importador**, que consume el contrato común y no puede volverse
   bank-specific (hay guardián en `architecture.test.ts`). Coste de lo hecho: **una
   línea constante** en Bankinter. Coste de la alternativa: romper el ADR-013 y
   bloquear el consumo futuro.
3. ✅ **No se confunde con el `balance` por movimiento**, que en este banco sigue
   siendo `null` para siempre (ADR-013). Dos datos, dos nombres, escrito en el
   contrato, en `api-contract.md` §Los dos «saldos» del contrato y en el **ADR-019**.
4. ✅ Un solo buscador (`findIbanLine` → `findPreambleLine(lines, headerLine, label)`),
   etiqueta sin acentos ni mayúsculas (su archivo real lleva `Saldo;`) e importe por
   `parseAmountText`, el normalizador que ya existía.
5. ✅ Delegadas: **ausente o vacía** → saldo vacío, sin fallo; **presente e ilegible**
   → `unparsedRows` con su nº de línea y motivo; **repetida** → gana la primera. La
   fila `Saldo` **del final no se lee**: una sola forma de escribirlo.
6. ✅ **`./init.sh` en verde: 412 tests, 412 pasan, 0 saltados** (baseline 396), con la
   capa de comparación del guardián de la F14 **activa**. Docs: `api-contract.md`,
   `dar-de-alta-un-banco.md`, `conventions.md`, `roadmap.md` y ADR-019.

### Sugerencias fuera de scope anotadas (no aplicadas)

`myinvestor.product.parser.test.ts` no pasa `prettier --check` (**ya no pasaba antes**
de esta feature); el saldo **no se persiste** todavía —candidato natural a anclar el
saldo de esa cuenta sin sumar movimientos, hoy atado a `initialBalance` (ADR-011)—; y
un motivo más útil para la fila `Saldo` del final, que no se hizo porque enseñarle al
parser algo sobre esa fila es justo lo que el criterio 7 prohíbe.

### 📌 Lo que le toca al humano tras la F16

🔴 **Al editar el CSV del mes:** escribir `Saldo;<importe>;;;` debajo de la línea del
`iban;` y **borrar la fila `Saldo` del final** del archivo. Cómo se escribe, en
[`docs/dar-de-alta-un-banco.md`](../docs/dar-de-alta-un-banco.md) §El saldo de la
cuenta va en la misma cabecera. Si algún mes se olvida, no falla nada: el saldo sale
vacío.

## F17 `statement-encoding-guard` — cerrada

Nace del hallazgo 🔴 E de la [prueba real del 2026-08-15](prueba-drive-real-2026-08-15.md).
Sin spec (`sdd: false`). Informe:
[`implementations/statement-encoding-guard.md`](implementations/statement-encoding-guard.md) ·
veredicto: [`reviews/statement-encoding-guard.md`](reviews/statement-encoding-guard.md) ·
resumen: [`summaries/statement-encoding-guard.md`](summaries/statement-encoding-guard.md).

1. ✅ `src/lib/utf8.ts` → `decodeUtf8Strict`: veredicto por **bytes**
   (`TextDecoder` con `fatal: true`) y guardia secundaria por `U+FFFD`; lanza
   `NotUtf8Error` (`NOT_UTF8`, 422) con el byte, la línea y qué hacer.
2. ✅ El parser del extracto lo usa en lugar de `toString('utf8')`: **un solo sitio**
   cubre los dos caminos (`/api/parser/myinvestor` y `/api/import`), que ya aíslan el
   fallo por archivo.
3. ✅ Tests con fixtures sintéticos, con los bytes cp1252 escritos en código.
4. ✅ Documentación: ADR-018, `api-contract.md`, `dar-de-alta-un-banco.md`,
   `conventions.md`.
5. ✅ **`./init.sh` en verde: 396 tests, 396 pasan, 0 saltados**, con la capa de
   comparación del guardián de la F14 **activa** (los 0 saltados importan). Los rojos
   que reportó el implementer eran ajenos a la F17 —lo dejó fuera de su scope con razón—
   y el leader saneó después lo que era suyo.

### El guardián de la F14 destapó tres cosas, y solo una era la esperada

**✅ Saneado ya (era del leader, no del implementer).** El informe de la prueba real
llevaba el **IBAN real** del humano, sus importes y los conceptos literales de su
extracto, y el `intent` de la F16 citaba su saldo. Lo escribió el leader pegando la
salida de la consola en un archivo versionado. Corregido: cifras inventadas, IBAN
sintético, nombres de sus archivos sustituidos por genéricos, y una nota al principio
del informe explicando el saneamiento. Las capas de IBAN e importes vuelven a verde.

**✅ Cerrado el falso positivo del ejemplo de la plantilla.** El nombre de ejemplo del
fondo saltaba en `docs/` y `specs/` porque el humano copió ese ejemplo tal cual a su
archivo del ETF (hallazgo 🔴 D), así que el ejemplo de la documentación pasó a estar en
`var/` y el guardián lo leyó como dato suyo. **El dato copió a la plantilla, no al
revés.** Arreglado en la raíz: el ejemplo se renombró en `docs/api-contract.md`,
`docs/myinvestor-product-files.md` y `specs/myinvestor-products/design.md`, y las
plantillas ya usan marcadores `<…>` en vez de valores copiables.

**✅ Resueltas las 3 colisiones PREEXISTENTES**, ninguna escrita en esta sesión: el
guardián solo las veía ahora porque `var/` tiene capturas nuevas. Decididas por el
humano el 2026-08-15:

1. **El comentario del enum de tipos de producto** (`docs/data-model.md`,
   `specs/investments-data-model/design.md`) — **falso positivo**: es la traducción al
   castellano del tipo de producto, el nombre que le da el banco, y colisiona solo
   porque el humano llamó al suyo igual. Cerrado con el escape documentado, un
   **`no-real-data-ok` por línea con su motivo escrito al lado**. El comentario
   conserva el término exacto que se ve en la web del banco, que es lo que lo hace
   reconocible.
2. **`prisma/migrations/20260806191700_data_model/migration.sql`** — 🔴 **acierto real
   y preexistente**: un comentario citaba un movimiento auténtico del extracto de
   Bankinter (concepto, importe y fecha) como ejemplo de por qué `daySequence` entra en
   el índice. **Saneado**: el ejemplo pasa a ser genérico. Solo cambia el comentario, el
   DDL no se toca ni una letra, así que el esquema es idéntico. **Checksum: cerrado.**
   El guardado en `_prisma_migrations` sí difería tras editar el comentario; se realineó
   con el del archivo, los tres coinciden y `prisma migrate status` dice «up to date».
   **No hace falta resetear la base de datos.**
3. **El propio `current.md` llegó a colisionar** al documentar los dos puntos de
   arriba: citar la frase infractora la reintroduce. Se describen sin transcribirlas.

6. ✅ **`reviewer`: APROBADO sin cambios requeridos** →
   [`reviews/statement-encoding-guard.md`](reviews/statement-encoding-guard.md), resumen
   en [`summaries/statement-encoding-guard.md`](summaries/statement-encoding-guard.md).
   F17 marcada **`done`** en `feature_list.json` y anotada en
   [`history.md`](history.md). Sus 17 tests nuevos, verdes.

### Siguen abiertas (anotadas, no se abren ahora)

Las tres sugerencias fuera de scope del informe de la F17: el `readFile(…, 'utf8')` del
JSON de producto —mismo silencio, pero el `que_no_quiero` pedía no tocar ese formato—, el
motivo de la **coma decimal** (§A) y el del **archivo nativo de Google** (§B), que el
humano ya clasificó como de menor prioridad.

---

## Sesión anterior (2026-08-13): F15 cerrada

## F15 `product-opened-at` — cerrada

Nació de una revisión de estado: el humano pidió que el JSON de producto de inversión
llevase la fecha de apertura. Sin spec (`sdd: false`).

1. ✅ **Decisión del humano:** `openedAt` **obligatorio en los cuatro tipos**, frente a
   la alternativa de admitirlo vacío. `closedAt` no se toca (opcional; normalmente solo
   los depósitos lo llevan).
2. ✅ Implementado en `src/modules/myinvestor/`. La clave se lee **antes** de bifurcar
   depósito/resto ([`myinvestor.product.parser.ts:80`](../src/modules/myinvestor/myinvestor.product.parser.ts#L80)),
   que es lo que la hace obligatoria de verdad en los cuatro y no solo donde se probó.
   `ParsedProduct.openedAt` es `string`, **nunca `null`**: sin fecha no hay producto,
   hay archivo fallido.
3. ✅ **`reviewer`: CHANGES_REQUESTED** en primera pasada, por **un solo punto de
   documentación** — la tabla de columnas reservadas de `docs/data-model.md:214` seguía
   diciendo que el fichero no llevaba el campo y que sería opcional. Es el registro que
   leerá quien haga la persistencia de inversiones, así que dejarlo mintiendo era caro.
4. ✅ **`reviewer`: APROBADO** en segunda pasada →
   [`reviews/product-opened-at.md`](reviews/product-opened-at.md), resumen en
   [`summaries/product-opened-at.md`](summaries/product-opened-at.md).
   `./init.sh` verde: **379 tests, 0 saltados** (los 0 saltados importan: el guardián de
   la F14 corrió con su capa de comparación activa, no solo la de forma).

## 📌 Lo que le toca al humano

1. 🔴 **Actualizar la plantilla de producto que guarda en Drive** con la línea de
   `openedAt`. Nadie comprueba que coincida con la documentación: todo archivo escrito
   con la plantilla vieja fallará. Plantillas en
   [`docs/myinvestor-product-files.md`](../docs/myinvestor-product-files.md).
2. ✅ **Prueba del camino entero: hecha el 2026-08-15** →
   [`prueba-drive-real-2026-08-15.md`](prueba-drive-real-2026-08-15.md). Drive
   responde y el extracto se lee bien (IBAN + 11 movimientos), pero **0 de 4 JSON
   de producto parsean**: llevan coma decimal, que JSON no admite. Y el `.csv` se
   subió **convertido a hoja de Google**, así que no se puede descargar. Los dos
   son cosas que arregla él en Drive; el informe propone además dos mensajes de
   error mejores en el backend (candidato a F16).

   **Segunda pasada el mismo día, tras corregirlos: el camino entra entero**
   (6/6 descargados, 5 productos, 1 extracto con IBAN, 0 fallos). Quedan dos
   problemas **silenciosos**, que no dan error: el `.csv` viene ahora en cp1252 y
   el parser convierte la `Ó` de los conceptos en `�` de forma irreversible, y
   `etf-<...>-*.json` conserva el `type` y el `name` del ejemplo de la plantilla.
   Decidido también que el **saldo** se leerá de una línea `saldo;…` en el
   preámbulo, junto al `iban;…`.
3. **Inventario por banco** ([`docs/ideas.md`](../../docs/ideas.md)): sigue vacío y
   sigue bloqueando la E4 entera.

## ✅ El histórico de git: cerrado como riesgo aceptado (2026-08-13)

**Tema cerrado. No volver a sacarlo.** El humano lo dio por arreglado, se verificó y
**no lo estaba** (los 36 commits conservan hash y fecha: no hubo reescritura). Se le
devolvió el alcance real medido, mayor de lo que él creía:

- `ES15 0128…` (0128 = Bankinter), IBAN **válido por checksum**, en **14 commits** desde
  `4caeb38` (F6, 2026-08-04), en `bankinter.parser.test.ts`.
- `ES30 1544…`, también válido, en **4 commits** de la F12.
- Más lo que saneó la F14 en ~40 archivos: importes, conceptos del extracto, el nombre
  de su empresa y el nombre completo de un tercero.

Se le ofrecieron las dos salidas reales (commit inicial único, o rewrite de los 35
commits) y **eligió dejarlo**: repositorio privado, HEAD limpio y el guardián de la F14
impidiendo la recaída. Anotado en `docs/roadmap.md`, con la nota de que **si el
repositorio deja de ser privado esto vuelve a la mesa**, y de que la salida limpia exige
rewrite **más** borrar y recrear el repo (un force-push deja los commits viejos
alcanzables por SHA).

## Cerrado también en esta sesión (no es código)

- ✅ **Carpeta de plantillas en Drive**, hermana de `notas-banco/`: creada.
- ✅ **Cabo suelto nº 9** (`openedAt` sin escritor): cerrado por la F15.
- 🕗 **Histórico del Excel** (idea #5): **aplazado, no descartado** — inclinación a
  importarlo «para no empezar de vacío».
- ⏳ **Cabo suelto nº 10** (`daySequence` numera solo las filas parseadas): explicado y
  **sigue abierto**. Se cierra el día que el humano diga que acepta borrar a mano los
  duplicados visibles si algún día arregla un parser y reimporta.

## Lo que aprendió el proyecto con esto

Una feature de una sola línea de comportamiento se fue a **CHANGES_REQUESTED por
documentación**, y con razón: `docs/data-model.md` se declara a sí mismo el registro
único de columnas sin escritor, y una feature que le da escritor a una columna sin
actualizar ese registro deja una trampa para la feature siguiente. El código estaba
bien a la primera; lo que faltaba era el rastro.
