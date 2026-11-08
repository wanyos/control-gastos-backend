# Requirements — F69 `last-imports`

> Fuente de verdad: el `intent` de la feature 69 en `feature_list.json`
> (aprobado por el humano el 2026-11-08). Notación EARS (`docs/specs.md`).
>
> Definiciones que usan los requisitos (todas en el calendario de Madrid,
> `src/lib/local-date.ts`):
>
> - **hoy**: `todayInMadridAsDate()` en la ruta; inyectado en el servicio.
> - **fecha de cierre de un producto**: la más temprana de las no nulas entre
>   `closedAt` y `maturityDate`, sea del tipo que sea (misma regla que la F67,
>   sin distinguir por tipo).
> - **producto vivo**: sin fecha de cierre, o con fecha de cierre > hoy.
> - **foto** de un producto: una fila de `Valuation` o de `SavingsSnapshot`.
> - **misma importación** de dos movimientos: mismo `Movement.createdAt`
>   (todas las filas que guarda un archivo entran en un solo `createMany` dentro
>   de su transacción y comparten ese valor; medido en la base del humano el
>   2026-11-08).

## R1
CUANDO un cliente hace `GET /api/last-imports`, el sistema DEBE responder `200`
con `{ asOf, accounts, products }`, donde `asOf` es hoy en `YYYY-MM-DD`.

## R2
CUANDO un cliente hace `GET /api/last-imports`, el sistema DEBE incluir en
`accounts` una entrada por cada fila de `Account` con `accountId`, `bank`,
`alias`, `dataUntil` (el `bookingDate` más reciente de sus movimientos, o `null`
si no tiene), `importedAt` y `expectedMonthly: true` y `gaps`.

## R3
El sistema DEBE serializar `importedAt` (de cuentas y de productos) como la fecha
`YYYY-MM-DD` en Madrid del instante guardado en la columna `lastImportedAt`, o
`null` si esa columna es `NULL`.

## R4
CUANDO la importación guarda un extracto con `status: 'imported'` (también si
todos sus movimientos ya estaban y `imported` es 0), el sistema DEBE escribir en
`Account.lastImportedAt` de su cuenta el instante de la importación, dentro de la
misma transacción del archivo.

## R5
SI un extracto termina con `status: 'failed'` ENTONCES el sistema NO DEBE cambiar
el `Account.lastImportedAt` de ninguna cuenta.

## R6
CUANDO la importación guarda un archivo de producto con `status: 'imported'`, el
sistema DEBE escribir en `InvestmentProduct.lastImportedAt` de ese producto el
instante de la importación, en la misma transacción que el producto y su foto.

## R7
CUANDO un cliente hace `GET /api/last-imports`, el sistema DEBE incluir en
`products` una entrada por cada producto vivo con `productId`, `bank`, `name`,
`type`, `maturityDate`, `dataUntil` (la fecha de su foto más reciente, o `null`
si no tiene ninguna), `importedAt`, `expectedMonthly` y `gaps`.

## R8
MIENTRAS la fecha de cierre de un producto sea ≤ hoy, el sistema NO DEBE incluirlo
en `products`.

## R9
MIENTRAS un producto vivo tenga `maturityDate` > hoy, el sistema DEBE darle
`expectedMonthly: false` y `gaps: []`.

## R10
MIENTRAS un producto vivo no tenga `maturityDate`, el sistema DEBE darle
`expectedMonthly: true`.

## R11
MIENTRAS un producto vivo no tenga `maturityDate`, el sistema DEBE dar en `gaps`
un tramo `{ from, to }` por cada racha de meses naturales sin ninguna foto entre
el mes de su primera foto y el mes de su última foto (ambos excluidos), con
`from` = día 1 del primer mes que falta y `to` = último día del último mes que
falta, en orden cronológico.

## R12
CUANDO dos movimientos consecutivos de una cuenta (orden `bookingDate`,
`daySequence`, `id`) son de importaciones distintas y sus `bookingDate` distan más
de 31 días, el sistema DEBE dar en `gaps` de esa cuenta el tramo `{ from, to }` con
`from` = día siguiente al primero y `to` = día anterior al segundo, en orden
cronológico.

## R13
MIENTRAS dos movimientos consecutivos de una cuenta sean de la misma importación,
el sistema NO DEBE dar un tramo en `gaps` entre ellos, distén lo que distén.

## R14
CUANDO se aplica la migración de esta feature, el sistema DEBE rellenar el
`lastImportedAt` que esté a `NULL` así: en `Account`, con el `createdAt` más
reciente de sus movimientos (sigue `NULL` si no tiene); en `InvestmentProduct`, con
el más reciente entre su propio `createdAt` y el `createdAt` de sus fotos.

## R15
CUANDO un cliente hace `GET /api/last-imports`, el sistema NO DEBE escribir nada
en la base de datos.

## R16
El sistema DEBE describir `GET /api/last-imports` en `docs/api-contract.md`: los
campos de R1, R2 y R7, la regla de producto vivo, `expectedMonthly`, las dos
reglas de `gaps` y qué fecha sale en `importedAt` para lo importado antes de la
feature.

## Procedencia

- R1 — (delegado) El humano cedió «el nombre y la forma del endpoint». Decido una
  ruta propia de solo lectura, sin parámetros, con dos listas (`accounts`,
  `products`) porque el intent habla de «las cuentas corrientes por banco y cada
  producto». Alternativa descartada: una sola lista con un campo `kind`.
  Nombres a aprobar (punto 🔴 6 de la hoja).
- R2 — (humano) «de cada cosa, dos fechas completas: hasta qué fecha hay datos y
  en qué fecha se hizo la importación» y «las cuentas corrientes por banco».
  `expectedMonthly: true` sale de «lo que no tiene fecha de vencimiento se espera
  todos los meses» (las cuentas no tienen vencimiento). Salen **todas** las
  cuentas, también Revolut: las cuentas no tienen fecha de cierre y el intent no
  pide añadirla.
- R3 — (delegado) Parte de «el nombre y la forma»: se guarda el instante y se
  publica la fecha en Madrid, porque el humano pide «fechas completas» y el resto
  del contrato cuenta los días en Madrid.
- R4 — (humano) «Importo un extracto de Bankinter… lo importo el 2 de noviembre»
  y «Revolut, si la importo sin movimientos nuevos, sale con su fecha de
  importación nueva».
- R5 — (añadido) El humano no dijo qué pasa con un archivo que falla. Propongo:
  no cuenta como importado (desde la F66 un extracto que falla no deja nada).
  ← REVISAR EN APROBACIÓN (técnica 2 de la hoja).
- R6 — (humano) «Importo la foto de un fondo: sale con la fecha de la foto y la
  de la importación».
- R7 — (humano) «cada producto de los archivos de inversiones», «solo sale lo
  vivo». `dataUntil` vacío para un producto sin fotos (hoy, los depósitos) es
  (delegado), punto 🔴 4 de la hoja.
- R8 — (humano) «lo que tiene fecha de cierre o fecha de vencimiento ya pasada
  deja de salir, sea del tipo que sea» y «un producto cerrado no sale». Que el
  mismo día del vencimiento ya no salga es (delegado): misma regla que la F67,
  aprobada por el humano el 2026-11-04.
- R9 — (humano) «lo que tiene fecha de vencimiento futura sale como que no hace
  falta importarlo cada mes» y «un depósito vivo sale sin pedir importación
  mensual». `gaps: []` es consecuencia: si no se espera cada mes, no hay meses que
  falten.
- R10 — (humano) «lo que no tiene fecha de vencimiento se espera todos los meses».
- R11 — (humano) «un fondo con fotos de agosto y octubre pero no de septiembre
  sale con aviso de que falta septiembre». Buscar en toda la historia (no solo en
  los últimos meses) es (delegado), punto 🔴 2 de la hoja. El campo no se llama
  `warnings`: «aviso» ya es un término aprobado con otro significado
  (`docs/vocabulary.md`).
- R12 — (delegado) El humano cedió «cómo detectar un hueco en una cuenta
  corriente; el tamaño del hueco que avisa lo decide el agente». Decido: más de
  31 días entre dos importaciones distintas. Medido en la base del humano el
  2026-11-08: el mayor salto entre dos importaciones distintas es de 25 días, así
  que hoy no sale ningún tramo. Alternativa (leer el periodo del extracto) en el
  punto 🔴 1 de la hoja.
- R13 — (delegado) Mismo punto. «Un día sin movimientos puede ser real»: dentro de
  un mismo archivo el banco ya cubre ese periodo, así que un tramo sin movimientos
  ahí es real (Revolut tiene uno de más de dos meses dentro de un solo archivo).
- R14 — (delegado) El humano cedió «qué fecha de importación sale para lo
  importado antes de esta feature»; él mismo apunta «lo más parecido es el día en
  que entraron las filas». Se usa `createdAt`, nunca `updatedAt` (el 2026-11-08 un
  renombrado a mano movió el `updatedAt` de un producto). Punto 🔴 3 de la hoja.
- R15 — (humano) «Consultar la lista no cambia nada en la base».
- R16 — (añadido) El frontend construye contra `docs/api-contract.md`
  (`CLAUDE.md` del workspace); sin contrato publicado no puede hacer su ventana.
  Es lo mismo que se hizo en F67 y F68.
