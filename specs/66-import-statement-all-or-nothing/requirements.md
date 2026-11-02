# Requirements — F66 `import-statement-all-or-nothing`

> Fuente de verdad: el `intent` de la F66 en `feature_list.json` (aprobado el
> 2026-11-02). Contexto: cabo 26 de `docs/roadmap.md`.
>
> **Alcance:** solo `importStatement` (un archivo de extracto). La importación de
> archivos de producto (`importProductFile`, `persistProductSnapshot`) no se toca.
> `prisma/schema.prisma` y `prisma/migrations/` no se tocan.
>
> **Qué es «escribir del archivo»** en todo este documento: las escrituras que
> `importStatement` hace hoy por un extracto, a partir de `resolveAccount`: crear
> la cuenta (`findOrCreateAccountFromMetadata`), guardar los movimientos
> (`persistMovements`), rellenar `balanceAfter` vacíos de filas ya guardadas
> (`backfillMissingBalances`), anclar la cuenta (`anchorAccountIfMissing`) y
> guardar los avisos (`persistImportWarnings`). No incluye lo que corre después
> del bucle de archivos (`detectTransfers`, `applyCategoryRules`,
> `closeImportedMovements`), que sigue igual.
>
> **Qué es «falla la comprobación de saldo»:** que `findStatementBalanceMismatch`
> **lance un error** (no pueda hacerse). Un descuadre encontrado **no** es un
> fallo: es un aviso, como hasta hoy (R10).

## R1
SI `findStatementBalanceMismatch` lanza un error mientras se importa un extracto
ENTONCES el sistema DEBE dejar la base de datos sin ningún movimiento de ese
archivo que no estuviera ya guardado antes de importarlo, y devolver el archivo
con `status: "failed"` y `movedToProcessed: false`.

## R2
SI `persistImportWarnings` lanza un error mientras se importa un extracto
ENTONCES el sistema DEBE dejar la base de datos sin ningún movimiento de ese
archivo que no estuviera ya guardado antes de importarlo, y devolver el archivo
con `status: "failed"` y `movedToProcessed: false`.

## R3
SI la cuenta del extracto se crea al importarlo (`account.created: true` hasta
ese punto) y después falla cualquier paso de la importación de ese archivo
ENTONCES el sistema NO DEBE dejar esa cuenta en la tabla `Account`.

## R4
SI el extracto ancla una cuenta que no estaba anclada y después falla cualquier
paso de la importación de ese archivo ENTONCES el sistema DEBE dejar
`balanceAnchor`, `balanceAnchorDate` y `balanceAnchorDaySequence` de esa cuenta
en `null`, como estaban antes.

## R5
SI el extracto rellena el `balanceAfter` de filas ya guardadas que lo tenían en
`null` y después falla cualquier paso de la importación de ese archivo ENTONCES
el sistema DEBE dejar el `balanceAfter` de esas filas en `null`.

## R6
SI falla cualquier paso de la importación de un extracto después de empezar a
escribir del archivo ENTONCES el sistema NO DEBE dejar guardado ningún aviso
nuevo de ese archivo (ni en `ImportUnparsedRow` ni en `ImportBalanceMismatch`).

## R7
CUANDO un extracto termina con `status: "failed"`, el sistema DEBE devolver en su
informe `account: null`, `imported: 0`, `duplicates: 0`, `balancesFilled: 0`,
`anchored: false` y `balanceMismatches: []`, conservando `unparsedRows`,
`unparsedCount` y `error`.

## R8
CUANDO en una misma llamada a `POST /api/import` un extracto falla, el sistema
DEBE conservar todo lo que escribieron los demás archivos de esa llamada que
terminaron con `status: "imported"`, tanto los anteriores como los posteriores.

## R9
CUANDO un extracto se importa sin fallo, el sistema DEBE guardar exactamente las
mismas filas y columnas que antes de la F66: los tests existentes de
`src/modules/import/` y `src/modules/accounts/` pasan sin cambiar ninguna de sus
aserciones.

## R10
CUANDO `findStatementBalanceMismatch` o `findPerLineMismatches` encuentran un
descuadre sin lanzar error, el sistema DEBE terminar el archivo con
`status: "imported"` y guardar ese descuadre como aviso, igual que antes de la
F66.

## R11
SI todo lo del extracto se ha guardado y lo que falla es moverlo a `procesados/`
ENTONCES el sistema DEBE conservar lo guardado y devolver el archivo con
`status: "failed"` y `movedToProcessed: false`, igual que antes de la F66.

## R12
El sistema DEBE abrir la transacción de base de datos de cada extracto con un
tiempo máximo (`timeout`) de 60 000 ms.

## Procedencia

- R1 — (humano) «Si falla la comprobación de saldo, el archivo sale failed, no se
  mueve a procesados/ y no queda ningún movimiento suyo». «Falla» se lee como
  «la comprobación lanza un error»: ver R10. Los movimientos que **ya** estaban
  guardados antes (duplicados de una importación anterior) no son «de este
  archivo» en el sentido del intent y se quedan, porque no los escribió él.
- R2 — (humano) «Si falla el guardado de avisos, igual».
- R3 — (humano) «Si la cuenta se creó con ese archivo, tampoco queda».
- R4 — (humano) «ni el saldo de partida si se fijó con él» (`que_quiero`).
- R5 — (humano) «no queda nada de ese archivo en la base de datos»
  (`que_quiero`). Es la otra escritura del archivo que no nombra el intent; sale
  de «nada».
- R6 — (añadido) El intent no dice qué pasa con los avisos de un archivo que
  falla. Propongo que tampoco queden: es lo que pasa hoy (un archivo que falla
  antes de guardar avisos no los guarda, F48) y si se guardaran, el reintento
  los encontraría ya escritos para un archivo que «no entró». Las filas ilegibles
  siguen viajando en el informe (R7). ← REVISAR EN APROBACIÓN (hoja, 🔴 4).
- R7 — (añadido) El intent no habla del informe. Hoy, un archivo que falla
  después de guardar informa `imported: n`, `anchored: true` y la cuenta creada,
  y esos `n` suman a `importedCount` aunque, con la F66, ya no existan. Propongo
  ponerlos a cero, que es además lo que el contrato ya promete
  (`docs/api-contract.md`: «En un archivo `failed` no se ancla ni se rellena
  nada: `anchored` es `false`, `balancesFilled` es `0`»). ← REVISAR EN
  APROBACIÓN (hoja, 🔴 3).
- R8 — (delegado) «Solo se deshace lo del archivo que falla; los demás archivos
  de la misma importación que salieron bien se quedan» (decidido por el leader,
  aprobado). Decido una transacción **por archivo**, no una por llamada.
- R9 — (humano) «Un archivo que se importa bien sigue guardando lo mismo que
  hoy» y `que_no_quiero` 1. «Sin cambiar sus aserciones» admite cambiar la
  forma en que dos ayudantes de test interceptan el cliente (ver design §5).
  ← REVISAR EN APROBACIÓN (hoja, 🔴 5).
- R10 — (añadido) El `que_quiero` pone de ejemplo «el saldo no cuadra». Hoy un
  descuadre **no** hace fallar el archivo (F32 R7-R8; F48 lo guarda como aviso)
  y cambiarlo chocaría con `que_no_quiero` 1. Propongo que «falla la comprobación»
  sea «no se pudo hacer». ← REVISAR EN APROBACIÓN (hoja, 🔴 1).
- R11 — (añadido) El intent pide «no queda nada» si algo falla **después de
  guardar**; mover a `procesados/` en Drive pasa después y la base no puede
  deshacer lo ya confirmado. Propongo dejarlo como hoy: lo guardado se queda y el
  reintento es seguro. ← REVISAR EN APROBACIÓN (hoja, 🔴 2).
- R12 — (añadido) El intent no dice nada de tiempos. Por defecto Prisma 7 corta
  una transacción interactiva a los 5 000 ms (`timeout: s.transactionOptions?.timeout??5e3`
  en `node_modules/@prisma/client/runtime/client.js`, leído el 2026-11-02).
  Reimportar un extracto grande hace una consulta por fila con saldo en
  `backfillMissingBalances`; propongo 60 s para no convertir en fallo una
  importación que hoy funciona. Va en la hoja como técnica-propuesta.
