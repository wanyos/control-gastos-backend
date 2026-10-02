# Requirements — F53 `product-file-collision`

> EARS estricto. Fuente de verdad: el `intent` de la feature 53 en
> `feature_list.json`. Estado de partida: `./init.sh` en verde con 69 archivos de
> test y 1271 tests (dato del leader, 2026-10-02); lo que se cita de código, leído
> ese día.

Definiciones que usan todos los requirements, y ninguna más:

- **Una importación** = una ejecución de `importPending`
  (`src/modules/import/import.service.ts`), que es lo que hace una llamada a
  `POST /api/import`. Recorre todos los bancos, todas sus carpetas de año y todos
  sus archivos pendientes, en el orden por nombre en que Drive los lista.
- **Archivo de producto** = el que lee un parser del registro de productos
  (`productParsers`). Declara `name`, `date` y `type`; su banco es el de la
  **carpeta**.
- **Archivo ya guardado en esta importación** = un archivo de producto para el que
  `persistProductSnapshot` terminó sin error dentro de esta misma ejecución, se
  haya podido mover después a `procesados/` o no.
- **Mismo producto y misma fecha** = mismo banco de carpeta (slug), mismo `name`
  comparado carácter a carácter (igual que la clave única `(bank, name)` de la
  base de datos) y misma `date`.

## R1
CUANDO, dentro de una importación, un archivo de producto declara el mismo
producto y la misma fecha que otro archivo ya guardado en esa importación, el
sistema DEBE informar ese archivo con `status: "failed"` y
`error.code: "DUPLICATE_PRODUCT_FILE"`.

## R2
CUANDO el sistema rechaza un archivo por R1, el `error.message` DEBE contener el
nombre del archivo ya guardado con el que coincide y el nombre de la carpeta de
año en la que está.

## R3
CUANDO el sistema rechaza un archivo por R1, NO DEBE crear ni modificar ninguna
fila de `InvestmentProduct`, `Valuation` ni `SavingsSnapshot` a partir de ese
archivo: las filas que escribió el archivo ya guardado quedan con los mismos
valores.

## R4
CUANDO el sistema rechaza un archivo por R1, NO DEBE moverlo a `procesados/`
(`movedToProcessed: false`).

## R5
CUANDO el sistema rechaza un archivo por R1, el informe de ese archivo DEBE llevar
`product: null` y `snapshot: null`, de modo que suma 1 a `failedCount` y 0 a
`importedProductCount`.

## R6
CUANDO el sistema rechaza un archivo por R1, DEBE seguir importando los archivos
que vienen después en la misma importación.

## R7
CUANDO, dentro de una importación, dos archivos de producto declaran el mismo
banco y el mismo `name` con `date` distintas, el sistema DEBE guardar los dos con
`status: "imported"`, igual que antes de esta feature.

## R8
CUANDO una importación encuentra un archivo de producto cuyo producto y fecha ya
están en la base de datos por una importación **anterior**, el sistema DEBE
guardarlo sustituyendo el valor (`status: "imported"`, `snapshot.created: false`),
igual que antes de esta feature.

## R9
El sistema DEBE aplicar R1 con la misma regla a los tres tipos de archivo de
producto: los que guardan una fila de `Valuation` (`fund`, `etf`,
`managed_portfolio`), el que guarda una fila de `SavingsSnapshot`
(`savings_account`) y el `deposit`, usando en los tres la `date` que declara el
archivo.

## R10
SI un archivo de producto falla al leerse o al guardarse ENTONCES el sistema NO
DEBE contarlo como archivo ya guardado en esta importación: el siguiente archivo
que declare el mismo producto y la misma fecha se importa.

## R11
El sistema DEBE aplicar R1 entre archivos de **distintas carpetas de año** del
mismo banco, y NO DEBE aplicarlo entre archivos de bancos distintos.

## R12
CUANDO una importación procesa un extracto de movimientos, el sistema DEBE
tratarlo igual que antes de esta feature (mismo informe, mismos datos guardados).

## R13
`docs/api-contract.md` DEBE describir, dentro de la sección de `POST /api/import`,
el rechazo de R1: el código `DUPLICATE_PRODUCT_FILE` en la tabla de códigos por
archivo, que no se guarda nada, que el archivo no se mueve y que la regla solo
compara archivos de una misma llamada.

## R14
`docs/myinvestor-product-files.md` y `docs/trade-republic-product-files.md` NO
DEBEN afirmar que nadie avisa cuando dos archivos declaran el mismo `name` y la
misma `date`; DEBEN decir que el segundo se rechaza con `DUPLICATE_PRODUCT_FILE`.

## R15
`docs/roadmap.md` DEBE marcar el cabo suelto 21 como cerrado por la F53 y dejar el
cabo suelto 24 sin cerrar.

---

## Cobertura del `intent`

| Frase de `como_se_que_esta_bien` | Requirements |
|---|---|
| El primero se guarda y el segundo sale como fallido, con un mensaje que nombra el archivo con el que choca | R1, R2, R9, R11 |
| El archivo rechazado no se mueve a `procesados/` | R4 |
| El valor que guardó el primer archivo sigue tal como lo guardó | R3 |
| Dos archivos del mismo producto con fechas distintas se importan los dos | R7 |
| Volver a importar otro día un archivo corregido sigue sustituyendo | R8 |
| `docs/api-contract.md` describe el rechazo nuevo | R13 |

`que_no_quiero`: «no se guarde el segundo y solo se avise» → R1, R3; «no tumbe la
importación de los demás» → R6; «ninguna ruta para borrar» → no hay requirement
que la cree, y R15 deja el cabo 24 abierto; «no cambie cómo entran los extractos»
→ R12.

## Procedencia

- R1 — (humano) «el segundo se rechace […] el informe me dice que choca con el
  otro». (delegado) el código: `DUPLICATE_PRODUCT_FILE`, propio, para que no se
  confunda con `VALIDATION_ERROR` (archivo mal escrito): este archivo puede estar
  bien escrito. (delegado) cuál es «el segundo»: el que la importación recorre
  después, es decir, por orden de nombre de banco, de año y de archivo.
- R2 — (humano) «y con cuál». (añadido) además del nombre, la carpeta de año: R11
  permite que el otro archivo esté en otra carpeta. ← REVISAR EN APROBACIÓN.
- R3 — (humano) «no se guarda nada de él» y «el valor que guardó el primero sigue
  tal como lo guardó».
- R4 — (humano) «se queda pendiente en Drive».
- R5 — (delegado) «si el contador cuenta solo los que se han guardado»: sí. Ya es
  así por construcción (`totals` cuenta los informes con `product` presente); el
  requirement lo fija con un test.
- R6 — (humano) «no quiero que un archivo rechazado tumbe la importación de los
  demás».
- R7 — (humano) «dos archivos del mismo producto con fechas distintas […] se
  importan los dos igual que hoy».
- R8 — (humano) «volver a importar otro día un archivo corregido […] sigue
  sustituyendo». Consecuencia que el humano no dijo y va en `decisions.md`: el
  archivo rechazado, si se vuelve a importar **sin corregir**, entra y sustituye.
- R9 — (delegado) «si la regla vale igual para los dos tipos de valor y para los
  depósitos»: sí, la misma regla en los tres. En el depósito la fecha no
  identifica ninguna fila (sus condiciones son columnas del producto), pero se
  compara igual. Alternativa descartada: en el depósito, rechazar cualquier
  segundo archivo del mismo nombre aunque la fecha sea distinta — va más allá de
  la frase del humano («y a la misma fecha»). ← REVISAR EN APROBACIÓN.
- R10 — (añadido) El humano no dijo qué pasa si el primero de los dos falla.
  Propongo: un archivo que no guardó nada no rechaza a nadie. ← REVISAR EN
  APROBACIÓN.
- R11 — (añadido) El humano no dijo si «la misma importación» cruza carpetas de
  año. Propongo: sí, toda la llamada a `POST /api/import`; el banco es el de la
  carpeta, así que dos bancos distintos nunca coinciden. ← REVISAR EN APROBACIÓN.
- R12 — (humano) «no quiero que cambie cómo entran los extractos de movimientos».
- R13 — (humano) «`docs/api-contract.md` describe el rechazo nuevo».
- R14 — (añadido) Los dos documentos de archivos de producto dicen hoy «nadie te
  avisa del choque»: la feature vuelve falsa esa frase. ← REVISAR EN APROBACIÓN.
- R15 — (humano, vía leader) cerrar el cabo 21 sin tocar el 24: «lo de borrar lo
  dejamos para otra feature, pero que no se pierda esta idea».
