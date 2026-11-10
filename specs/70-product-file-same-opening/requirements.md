# Requirements — F70 `product-file-same-opening`

> EARS estricto. Fuente de verdad: el `intent` de la feature 70 en
> `feature_list.json` (aprobado por el humano el 2026-11-09). Lo que se cita de
> código y de la base, leído y medido el 2026-11-09.

Definiciones que usan todos los requirements, y ninguna más:

- **Archivo de producto** = el que lee un parser del registro de productos
  (`productParsers`) y guarda `importProductFile`
  (`src/modules/import/import.service.ts`). Declara `name`, `type`, `date` y
  `openedAt`; su banco es el slug de la **carpeta** (ADR-009), nunca el contenido.
- **Nombre nuevo** = no existe ninguna fila de `InvestmentProduct` con ese banco y
  ese `name`, comparado carácter a carácter (la clave única `(bank, name)`).
- **Producto del mismo día** = una fila de `InvestmentProduct` con el mismo banco,
  el mismo `type` y el mismo `openedAt` que declara el archivo, y otro `name`. Da
  igual que esté cerrada (`closedAt`) o viva.
- **Rechazo por el día de apertura** = el resultado que describen R1 a R5.

`openedAt` es obligatorio en el archivo en los cinco tipos: comprobado el
2026-11-09 ejecutando los dos parsers con `openedAt` ausente, `null` y `""`; los
tres casos salen como archivo fallido antes de llegar a esta regla («faltan campos
obligatorios: openedAt» o «openedAt: fecha inválida…»). Esta feature no cambia eso.

## R1
CUANDO se importa un archivo de producto con nombre nuevo y existe al menos un
producto del mismo día, el sistema DEBE informar ese archivo con
`status: "failed"` y `error.code: "SAME_OPENING_PRODUCT"`.

## R2
CUANDO el sistema rechaza un archivo por R1, el `error.message` DEBE contener el
`name` de cada producto del mismo día y la indicación de corregir el `"name"` del
archivo.

## R3
CUANDO el sistema rechaza un archivo por R1, NO DEBE crear ni modificar ninguna
fila de `InvestmentProduct`, `Valuation` ni `SavingsSnapshot`: el producto del
mismo día queda con los mismos valores, incluido su `lastImportedAt`.

## R4
CUANDO el sistema rechaza un archivo por R1, NO DEBE moverlo a `procesados/`
(`movedToProcessed: false`).

## R5
CUANDO el sistema rechaza un archivo por R1, DEBE seguir importando los archivos
que vienen después en la misma importación.

## R6
CUANDO se importa un archivo de producto cuyo banco y `name` ya existen, el
sistema DEBE guardarlo igual que antes de esta feature, aunque exista otro
producto con el mismo banco, tipo y `openedAt`.

## R7
CUANDO se importa un archivo de producto con nombre nuevo y no existe ningún
producto del mismo día, el sistema DEBE crear el producto igual que antes de esta
feature.

## R8
CUANDO se importa un archivo de producto con nombre nuevo y el único producto con
el mismo banco y `openedAt` es de otro `type`, el sistema DEBE crear el producto.

## R9
CUANDO se importa un archivo de producto con nombre nuevo y el único producto con
el mismo `type` y `openedAt` es de otro banco, el sistema DEBE crear el producto.

## R10
La regla de R1 DEBE aplicarse a los cinco tipos de producto (`fund`, `etf`,
`managed_portfolio`, `deposit`, `savings_account`), depósitos incluidos.

## R11
CUANDO el producto del mismo día está cerrado (`closedAt` no nulo), el sistema
DEBE rechazar el archivo igual que en R1.

## R12
`docs/api-contract.md` DEBE describir, en la sección de `POST /api/import`, el
rechazo de R1: su código, que no se guarda nada y que el archivo no se mueve a
`procesados/`.

## R13
`docs/myinvestor-product-files.md` y `docs/trade-republic-product-files.md` DEBEN
listar el rechazo de R1 en su tabla de qué pasa cuando un archivo está mal, con
su código.

## Procedencia

- R1 — (humano) Sale de «al importar un archivo de producto cuyo nombre todavía
  no existe, si ya hay otro producto del mismo banco, del mismo tipo y con la
  misma fecha de apertura, el archivo se rechaza». El código
  `SAME_OPENING_PRODUCT` es (delegado: «el código del error») y queda como
  propuesta de vocabulario en `decisions.md`.
- R2 — (humano) Sale de «el mensaje dice con qué producto coincide y que corrija
  el name». (delegado) el texto exacto; si hay varios productos del mismo día, se
  nombran todos.
- R3 — (humano) Sale de «no se guarda nada». Que `lastImportedAt` del otro
  producto no se mueva es la lectura literal de «nada».
- R4 — (humano) Sale de «no se mueve a procesados/».
- R5 — (humano/leader) Sale de «el resto de archivos de esa importación se
  importan como siempre».
- R6 — (humano/leader) Sale de «un archivo con el name actual del producto se
  importa como siempre» (segunda frase de `como_se_que_esta_bien`) y de «que no cambie cómo se importa un producto que ya existe».
- R7 — (humano/leader) Sale de «un producto nuevo de verdad, con otra fecha de
  apertura, se crea como hoy».
- R8 — (humano) Sale de «del mismo tipo»: con otro tipo no hay rechazo.
- R9 — (humano) Sale de «del mismo banco»: con otro banco no hay rechazo.
- R10 — (delegado, SIN DECIDIR POR EL HUMANO) Opción (a) del intent: la regla vale
  también para los depósitos. Recomendación del spec-author, medida en la base el
  2026-11-09: 6 depósitos, ninguno abierto el mismo día que otro (el par más
  cercano, a 3 días). ← REVISAR EN APROBACIÓN (punto 🔴 1). Si el humano elige
  (b), R10 pasa a excluir `deposit` y se añade un test de que dos depósitos del
  mismo día entran.
- R11 — (añadido) El humano no dijo qué pasa si el producto del mismo día está
  cerrado. Propongo rechazar igual: el intent dice «si ya hay otro producto», sin
  distinguir. ← REVISAR EN APROBACIÓN (punto 🔴 3).
- R12 — (añadido) El contrato es del backend y el frontend lee de él el código
  nuevo; sin esto quedaría falso.
- R13 — (añadido) Los dos documentos de archivos de producto listan hoy todos los
  rechazos; sin esto quedarían incompletos.
