# Requirements — F12 `import`

> EARS estricto (`docs/specs.md` §requirements.md). Ids estables `R1..R20`.
> Fuente de verdad: el bloque `intent` de la feature 12 en `feature_list.json`,
> cerrado por el humano el 2026-08-11, sus 12 criterios de `acceptance` (`A1..A12`) y
> las tres resoluciones del humano del **2026-08-12** (IBAN en el fichero, recuento de
> líneas fallidas, renombrado de `ingesta/` a inglés).
>
> **20 requirements, por encima del tope de ~15.** Razón dicha en voz alta
> (`docs/specs.md` §regla 2 y `specs/import/decisions.md`): R15/R20 son el *retoque* y el
> *renombrado* del flujo de la F5 (el humano los metió aquí para no tocar dos veces los
> mismos archivos), R16/R17 son *alcance excluido* que él pidió explícitamente, y R18/R19
> salen de su resolución del 2026-08-12. Ninguno abre una línea de comportamiento nuevo;
> partir la feature por ellos dejaría una mitad sin sentido propio.

## Vocabulario

- **Fichero pendiente**: fichero que cuelga de `notas-banco/<banco>/<año>/` y no de su
  `procesados/` (definición de la F5, `src/lib/drive-structure.ts:407`).
- **Movimiento parseado**: un `ParsedMovement` del contrato común
  (`src/lib/parsed-statement.ts:22`).
- **Importación de un fichero**: descarga → copia cruda local → parseo → resolución de
  cuenta → guardado → movimiento a `procesados/`.

---

## R1

CUANDO el sistema importa un fichero pendiente cuyo parseo ha producido movimientos, el
sistema DEBE guardar cada movimiento parseado como un `Movement` de la cuenta resuelta,
aplicando la tabla de mapeo de `specs/data-model/design.md` §9: `bookingDate`,
`valueDate`, `description` y `daySequence` tal cual; `amount = abs(amount)` con
`type = deriveMovementTypeFromAmount(amount)`; `balanceAfter = balance`;
`currency = currency` (`'EUR'` cuando el parser emite `''`); `origin = 'imported'`;
`status = 'pending_review'`; y `categoryId`, `paymentMethod`, `transferId`, `productId`
y `note` a `null`.

## R2

CUANDO un cliente hace `POST /api/import`, el sistema DEBE responder `200` con un
informe que contiene, por cada fichero pendiente encontrado, su banco, año, identificador
y nombre, su resultado (`imported` | `skipped` | `failed`), la cuenta usada (y si se creó
en ese momento y con qué valores por defecto), cuántos movimientos se guardaron, cuántos
se descartaron por duplicado, **cuántas líneas no se pudieron interpretar** junto al
detalle de cada una, y si el fichero se movió a `procesados/`.

## R3

CUANDO se listan los movimientos con `GET /api/movements` después de una importación, el
sistema DEBE devolver los movimientos importados ordenados del más reciente al más
antiguo (`bookingDate` descendente y, a igual fecha, `daySequence` descendente).

## R4

CUANDO el resultado del parseo de un fichero trae IBAN y banco y no existe cuenta con ese
IBAN, el sistema DEBE crear la cuenta invocando `findOrCreateAccountFromMetadata`
(`src/modules/accounts/accounts.service.ts:165`) e incluir en el informe del fichero el
IBAN, el banco, el alias y el tipo con los que se creó.

## R5

CUANDO el resultado del parseo de un fichero NO trae IBAN y existe **exactamente una**
cuenta ya dada de alta cuyo `bank` coincide con el banco del fichero (comparación sin
distinguir mayúsculas), el sistema DEBE importar los movimientos de ese fichero a esa
cuenta sin crear ninguna cuenta nueva.

## R6

SI el resultado del parseo de un fichero NO trae IBAN y el número de cuentas ya dadas de
alta de ese banco es cero o mayor que uno ENTONCES el sistema NO DEBE importar ese
fichero y DEBE reportarlo como `failed` con el código estable `MISSING_ACCOUNT_DATA`, un
mensaje que pide **añadir el IBAN una vez en el fichero** y el fichero intacto en su
carpeta pendiente de Drive.

## R7

CUANDO se importa un fichero cuyos movimientos ya fueron importados antes, el sistema NO
DEBE crear ningún `Movement` duplicado —se apoya en el índice único parcial
`Movement_imported_dedup_key` `(accountId, bookingDate, type, amount, description,
daySequence) WHERE origin = 'imported'`— y DEBE reportar en el informe del fichero
cuántos movimientos se descartaron por duplicado.

## R8

CUANDO un fichero contiene varias líneas idénticas del mismo día (misma fecha, mismo
importe y mismo concepto), el sistema DEBE guardar una fila por cada una, distinguidas
por el `daySequence` que emite el parser.

## R9

CUANDO todos los movimientos parseados de un fichero han quedado guardados en la base de
datos, el sistema DEBE mover ese fichero a `notas-banco/<banco>/<año>/procesados/`
reutilizando `moveFileToProcessed` (`src/lib/drive-structure.ts:344`), y NO DEBE moverlo
antes de ese momento.

## R10

SI la descarga, el parseo, la resolución de cuenta o el guardado de un fichero fallan
ENTONCES el sistema NO DEBE mover ese fichero a `procesados/`, DEBE reportarlo en el
informe con un mensaje saneado (sin tokens ni secretos) y DEBE continuar con los ficheros
restantes.

## R11

CUANDO el parseo de un fichero produce filas no reconocidas junto a movimientos válidos,
el sistema DEBE guardar los movimientos válidos, incluir en el informe el recuento de
filas no reconocidas y cada una con su número de fila y su motivo, y mover el fichero a
`procesados/` como cualquier fichero importado con éxito.

## R12

El sistema NO DEBE inventar ni calcular el saldo de un movimiento: cuando el parser emite
`balance = null`, el `Movement` guardado DEBE quedar con `balanceAfter = null`, y el saldo
de la cuenta se sigue leyendo del `balanceAfter` del movimiento más reciente que lo traiga
(`computeAccountBalance`, `src/modules/movements/movements.service.ts:56`), sin sumar
movimientos salvo en su caída existente.

## R13

CUANDO la importación del mismo fichero crudo se ejecuta dos veces, el sistema DEBE dejar
la base de datos en el mismo estado final que tras la primera ejecución: mismos
movimientos, mismos valores y ningún registro adicional.

## R14

CUANDO un fichero pendiente pertenece a un banco sin parser registrado, o su extensión no
la lee el parser de su banco, el sistema DEBE reportarlo como `skipped` con su motivo, NO
DEBE importarlo y NO DEBE moverlo a `procesados/`.

## R15

CUANDO un cliente hace `POST /api/ingestion/process`, el sistema DEBE descargar cada
fichero pendiente y escribir su copia local sin mover el original a `procesados/`,
conservando el aislamiento de fallos por fichero y la idempotencia observable que ya
tenía.

## R16

El sistema NO DEBE escribir `categoryId`, `paymentMethod`, `transferId` ni `productId` al
importar, NO DEBE marcar ningún movimiento como `confirmed` y NO DEBE exponer ninguna
superficie de creación o borrado de movimientos por la API.

## R17

El sistema NO DEBE crear ni actualizar ningún `InvestmentProduct` ni ninguna `Valuation`
durante la importación.

## R18

CUANDO el parser de MyInvestor recibe un extracto cuyo preámbulo contiene una línea con
`iban` en su primera columna (sin distinguir mayúsculas ni espacios sobrantes), el
sistema DEBE emitir el valor de su segunda columna como `accountIban` del resultado, y
DEBE seguir emitiendo `accountIban = null` cuando esa línea no está, está vacía o el
valor solo aparece dentro del concepto de un movimiento.

## R19

El sistema NO DEBE crear una cuenta cuyo IBAN no venga del fichero: ninguna vía de la
importación DEBE dar de alta una `Account` sin IBAN.

## R20

CUANDO un cliente llama a `/api/ingesta/pending` o a `/api/ingesta/process` (las rutas
antiguas en español), el sistema DEBE responder `404` con el cuerpo de error estándar, y
las mismas capacidades DEBEN estar disponibles en `/api/ingestion/pending` y
`/api/ingestion/process`.

---

## Trazabilidad con el `acceptance` cerrado el 2026-08-11

| Criterio | Requirements |
|---|---|
| A1 movimientos guardados con el mapeo §9, listados del más reciente al más antiguo | R1, R3 |
| A2 auto-alta de cuenta con IBAN + banco, diciendo con qué datos | R4, R18 |
| A3 sin IBAN: nada a ciegas y error diferenciable | R6, R19 (y R5, su rama complementaria) |
| A4 reimportar no duplica; se reporta lo descartado | R7 |
| A5 tres líneas idénticas → tres movimientos | R8 |
| A6 mover a `procesados/` solo tras guardar, sin romper la idempotencia de la F5 | R9, R10, R15 |
| A7 importación parcial: guarda lo bueno, reporta el resto | R11, R2 |
| A8 saldo del `balanceAfter`, nunca inventado | R12 |
| A9 no enriquece, no confirma, no crea/borra por API | R16 |
| A10 los productos de inversión quedan fuera | R17, R14 |
| A11 importación determinista y re-ejecutable | R13 |
| A12 tests, `init.sh` verde, `api-contract.md` y ADR | `tasks.md` lotes A-D |

## Trazabilidad con el `como_se_que_esta_bien` del `intent`

| Frase del humano | Requirements |
|---|---|
| «sus movimientos aparecen al listarlos por la API, del más reciente al más antiguo» | R1, R3 |
| «se ha creado sola con el IBAN y el banco del archivo, y se me dice con qué datos» | R4, R18 |
| «si falta el IBAN… un error que distingo del resto» | R6, R19 |
| «el saldo sale del saldo que traía la última línea, no de sumar movimientos» | R12 |
| «vuelvo a importar el mismo archivo y no se duplica ni un movimiento» | R7, R13 |
| «tres líneas idénticas el mismo día guarda los tres movimientos» | R8 |
| «solo aparece en procesados/ después de que sus movimientos estén guardados; si falla, sigue pendiente y puedo reintentarlo» | R9, R10, R15 |
| «los movimientos buenos SÍ se guardan y las líneas problemáticas se me reportan» | R11, R2 |
| «una línea que el parser no entendió no se pierde en silencio» | R11 |

---

## Procedencia

- **R1** — (humano) Sale de «que los movimientos parseados se guarden en su cuenta». El
  mapeo campo a campo no lo inventa esta spec: lo dejó escrito
  `specs/data-model/design.md` §9 y el `acceptance` A1 lo cita.
- **R2** — (delegado) El humano cedió «cómo se dispara la importación y su forma exacta en
  la API». Decido: endpoint propio `POST /api/import` con informe por fichero.
  **Aprobado el 2026-08-12**, con su añadido explícito: el informe incluye el **recuento**
  de líneas no interpretables, no solo su detalle.
- **R3** — (humano) Sale de «aparecen al listarlos por la API, del más reciente al más
  antiguo». El orden ya lo implementa la F8; aquí se verifica de extremo a extremo.
- **R4** — (humano) Sale de «se ha creado sola con el IBAN y el banco del archivo, y se me
  dice con qué datos». El servicio ya existe (F8) y no se reescribe.
- **R5** — (humano, resolución del 2026-08-12) «Con ponerlo una sola vez para esa cuenta
  sería suficiente; las siguientes ya no es necesario, un IBAN no cambia». Esta es la
  rama que hace verdad esa frase: los ficheros posteriores sin IBAN caen en la cuenta ya
  existente de ese banco. (En la primera lectura era un `(añadido)` mío; el humano lo
  cerró como suyo.)
- **R6** — (humano) Sale de «no se crea ninguna cuenta a ciegas: se me devuelve un error
  que distingo del resto». **Matiz del 2026-08-12:** el mensaje pide *poner el IBAN una
  vez en el fichero*, no *crear la cuenta a mano*. El código `MISSING_ACCOUNT_DATA` ya
  estaba reservado en `docs/api-contract.md` desde la F8; aquí deja de estarlo.
- **R7** — (humano) Sale de «volver a importar el mismo archivo no debe duplicar nada» y de
  la delegación «qué se reporta de lo que se descartó por duplicado».
- **R8** — (humano) Sale de «las líneas idénticas legítimas del mismo día se tienen que
  guardar todas».
- **R9** — (humano) Sale de «el archivo se mueve a procesados/ cuando el dato está
  guardado, no al descargarlo» (decisión suya del 2026-08-11).
- **R10** — (humano) Sale de «si la importación falla, sigue pendiente en Drive y puedo
  reintentarlo», más el aislamiento por fichero que ya tiene la F5.
- **R11** — (humano) Sale de «los movimientos buenos SÍ se guardan y las líneas
  problemáticas se me reportan». Que el fichero se mueva igual era propuesta mía y quedó
  **aprobada el 2026-08-12**, junto con el recuento de líneas fallidas.
- **R12** — (humano) Sale de «el saldo sale del saldo que traía la última línea del
  extracto, no de sumar movimientos» y de «no inventar un saldo para el banco que no lo
  trae».
- **R13** — (humano, vía `acceptance` A11) «La importación es determinista y
  re-ejecutable», que es lo que hace del crudo de Drive una copia de seguridad (cabo
  suelto nº 6 del roadmap).
- **R14** — (añadido, **aprobado el 2026-08-12**) El humano no había dicho qué hace el
  importador con un fichero que ningún parser sabe leer, y en su carpeta de MyInvestor
  hay `.json` de producto y capturas. Se reportan como «omitidos», sin importar y sin
  mover.
- **R15** — (delegado) El humano cedió «cómo se retoca el flujo de la feature 5 para que el
  movimiento a procesados/ pase a ocurrir tras guardar, sin romper la idempotencia».
  Decido: el endpoint deja de mover y se queda como descarga de la copia cruda.
  Alternativa descartada: borrarlo (perdería la inspección previa que exige la regla 4 de
  `docs/specs.md` al dar de alta un banco nuevo).
- **R16** — (humano) Sale de los `que_no_quiero`: no categorizar, no forma de pago, no
  traspasos, no `productId`, no confirmar, no crear ni borrar por API.
- **R17** — (humano) Sale de «no guardar los productos de inversión ni sus valoraciones:
  eso es una feature aparte» (decisión suya del 2026-08-11).
- **R18** — (humano, resolución del 2026-08-12) Él mismo añadió al CSV de MyInvestor en
  Drive una línea de preámbulo con la forma `iban;ES…` y fijó la regla: el IBAN va en el
  fichero, una vez. (Su IBAN real **no se escribe aquí**: los ejemplos de este spec y de
  los tests usan el IBAN público `ES9121000418450200051332` — ver `docs/conventions.md`
  §Tests.) Decisión de alcance asociada: **el módulo
  `src/modules/myinvestor/` se modifica en esta feature** aunque sea código de la F10.
  La restricción de la F10 —el IBAN se lee solo de esa línea etiquetada y nunca se infiere
  de un concepto con forma de IBAN, test «R20» de `myinvestor.statement.parser.test.ts`—
  **no se relaja**.
- **R19** — (humano, resolución del 2026-08-12) «Hicimos una regla de no aceptar cuentas
  sin IBAN: podemos reforzarla, seguir sin admitir nunca una cuenta sin IBAN». Se declara
  como invariante propio para que sea comprobable, no como efecto colateral de R4/R6.
- **R20** — (humano, resolución del 2026-08-12) «Ya que estamos, renombrar esos a inglés,
  es una norma y hay que mantenerla». Cierra el cabo suelto nº 4 del roadmap y es un
  breaking change de contrato que hoy no consume nadie.
