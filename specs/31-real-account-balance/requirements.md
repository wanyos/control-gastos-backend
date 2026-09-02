# Requirements — F31 `real-account-balance`

> EARS estricto (`docs/specs.md` §requirements.md). Material del `implementer` y
> del `reviewer`; el humano lee `decisions.md`.
>
> **Alcance.** Esta es la mitad que **produce** el número. Comparar el calculado
> contra el del archivo y avisar de descuadres es la **F32
> `balance-reconciliation`** y NO entra aquí (campo `_corte` del intent).
>
> **ADR-017.** Ningún importe de este documento sale de `var/` ni de la base:
> todos los números de los ejemplos son inventados.

## Vocabulario

Cuatro cosas distintas que este documento no mezcla nunca:

- **`accountBalance`** — el saldo de la CUENTA que escribe el preámbulo del
  extracto. Un dato por archivo. Ya lo leen los parsers de N26, Openbank y
  MyInvestor; hoy el importador lo tira.
- **`balanceAfter`** — el saldo tras UNA línea. Un dato por movimiento. Hoy solo
  Bankinter lo guarda.
- **Ancla** — lo que esta feature introduce: un importe **con su fecha** que la
  cuenta guarda como hecho, tomado del archivo una sola vez.
- **Punto de anclaje efectivo** — el más reciente entre el ancla guardada y el
  `balanceAfter` más reciente de la cuenta. Es desde donde se suma.

---

## R1

CUANDO se importa un extracto de una cuenta que NO tiene ancla y el archivo trae
`accountBalance`, el sistema DEBE anclar la cuenta con ese importe y con la fecha
y el `daySequence` del movimiento más reciente del archivo.

## R2

CUANDO se importa un extracto de una cuenta que NO tiene ancla y el archivo NO
trae `accountBalance` pero al menos uno de sus movimientos trae saldo por línea,
el sistema DEBE anclar la cuenta con el saldo de la línea más reciente del
archivo y con la fecha y el `daySequence` de esa línea.

## R3

CUANDO se importa un extracto de una cuenta que YA tiene ancla, el sistema NO
DEBE modificar ni el importe ni la fecha del ancla.

## R4

CUANDO el `accountBalance` que trae el archivo vale cero, el sistema DEBE anclar
la cuenta con cero como importe real del ancla.

## R5

SI el archivo no trae `accountBalance` y ninguno de sus movimientos trae saldo
por línea ENTONCES el sistema DEBE importar sus movimientos con normalidad y
dejar la cuenta sin ancla.

## R6

El sistema DEBE calcular el saldo de una cuenta como el importe de su punto de
anclaje efectivo más el neto de los movimientos posteriores a él, entendiendo
«posterior» como `(bookingDate, daySequence)` estrictamente mayor que la del
punto de anclaje.

## R7

El sistema DEBE elegir como punto de anclaje efectivo el más reciente, por
`(bookingDate, daySequence)`, entre el ancla guardada de la cuenta y el
movimiento más reciente que trae saldo por línea.

## R8

SI la cuenta no tiene ancla y ninguno de sus movimientos trae saldo por línea
ENTONCES el sistema DEBE calcular el saldo sumando el neto de todos sus
movimientos sobre `initialBalance`.

## R9

CUANDO entran movimientos cuya `(bookingDate, daySequence)` es anterior a la del
punto de anclaje efectivo, el sistema NO DEBE variar el saldo de la cuenta.

## R10

CUANDO entran movimientos posteriores al punto de anclaje efectivo, el sistema
DEBE variar el saldo de la cuenta en el neto de esos movimientos, sin ninguna
escritura manual.

## R11

CUANDO el parser de Openbank interpreta una fila de la tabla, DEBE emitir el
saldo de su quinta columna en el campo `balance` del movimiento, en vez del
`null` que emite hoy.

## R12

CUANDO el importador procesa una fila que ya existe en la base con su saldo por
línea vacío y el archivo sí trae saldo para esa fila, el sistema DEBE rellenar
ese saldo.

## R13

CUANDO el importador procesa una fila que ya existe en la base con un saldo por
línea guardado, el sistema NO DEBE sobrescribirlo con el del archivo.

## R14

CUANDO un cliente pide `GET /api/accounts` o `GET /api/accounts/:id`, el sistema
DEBE incluir en cada cuenta los campos `balanceAnchor` y `balanceAnchorDate`, con
valor `null` en una cuenta sin ancla.

## R15

CUANDO se ejecuta la reimportación local sobre las copias de `var/drive-read/`,
el sistema DEBE dejar ancladas las cuentas cuyos archivos traen saldo y rellenar
los saldos por línea que falten, sin crear movimientos duplicados.

---

## Trazabilidad con `como_se_que_esta_bien`

| Criterio del humano | Cubierto por |
|---|---|
| Cada cuenta me dice un saldo real, no una variación desde cero | R6, R7, R8 |
| Una cuenta sin saldo de partida queda anclada al importar | R1, R2 |
| Otro extracto NO reescribe el saldo de partida | R3 |
| Los movimientos nuevos suben o bajan el saldo solos | R10 |
| Donde el archivo trae el saldo, el que veo es el del archivo | R7 |
| Openbank guarda su saldo por línea | R11 |
| Un saldo de archivo de cero es un saldo real | R4 |
| Sin la línea del saldo, el archivo se importa igual | R5 |
| Las cuentas y los movimientos ya dentro acaban bien, sin volver a Drive | R12, R15 |

---

## Procedencia

- **R1** — (humano) Sale de «cuando importo un extracto de una cuenta que TODAVÍA
  no tiene saldo de partida, la cuenta queda anclada a partir del saldo del
  archivo». Lo único que añado es de dónde sale la FECHA del ancla, que el
  preámbulo no escribe: la del movimiento más reciente del propio archivo. Es
  exactamente lo que hizo a mano la comprobación del handoff.
- **R2** — (delegado) Resuelve «cómo se ancla Bankinter, que no trae saldo de
  preámbulo pero sí saldo en cada línea». Decido tomar la ÚLTIMA línea del
  archivo, no la primera: es el importe que ya manda por precedencia y no exige
  despejar nada hacia atrás. Alternativa descartada: despejar el saldo de partida
  restando hacia atrás desde la primera línea — da el mismo número cuando el
  archivo está completo, pero depende de que lo esté.
- **R3** — (humano) Sale de «el saldo de partida NO se reescribe» y de «no quiero
  que un extracto nuevo pise el saldo de partida ya establecido».
- **R4** — (humano) Sale de «cuando el saldo del archivo es 0, se trata como un
  saldo real, no como *no viene*».
- **R5** — (humano) Sale de «cuando el extracto de N26 o MyInvestor NO trae la
  línea del saldo escrita a mano, el archivo se importa igual y no pasa nada».
- **R6** — (delegado) Resuelve «qué se guarda exactamente: el saldo de partida ya
  despejado o el ancla tal cual viene». Decido guardar el **ancla como hecho**
  (importe + fecha) y derivar el saldo al leer. Es lo que contesta la
  preocupación que el humano marcó: importar después movimientos MÁS ANTIGUOS que
  el ancla no lo estropea, porque el ancla ya los contenía. Alternativa
  descartada: guardar el saldo de partida despejado — más simple de leer, pero
  queda mal en cuanto entra un mes antiguo, que es justo lo que él temía.
- **R7** — (humano) Sale de «cuando la cuenta es de las que traen el saldo en sus
  archivos, el saldo que veo es EL DEL ARCHIVO, no el calculado». Es la regla de
  precedencia que YA existe en
  [`computeAccountBalance`](../../src/modules/movements/movements.service.ts) y
  que el aviso técnico 2 del intent ordena **no tocar**.
- **R8** — (añadido) El humano no habló de una cuenta creada a mano por
  `POST /api/accounts` con un `initialBalance` y sin un solo extracto importado.
  Propongo que siga comportándose exactamente como hoy. Es lo que impide que esta
  feature rompa el camino que ya existe. ← REVISAR EN APROBACIÓN.
- **R9** — (delegado) Es la otra mitad de la decisión de R6, escrita como
  comportamiento observable para que sea testeable por sí sola.
- **R10** — (humano) Sale de «cuando entran movimientos nuevos, el saldo sube o
  baja solo, sin que yo escriba nada en ninguna parte». El aviso técnico 7 es el
  que obliga a que esto valga TAMBIÉN en las cuentas que traen saldo: que mande
  el archivo no significa que el archivo sea lo último.
- **R11** — (humano) Sale de «el saldo por movimiento de Openbank, que hoy el
  parser lee y tira a propósito, quiero que se guarde». Es la reversión explícita
  de la F19 que anuncia el aviso técnico 5.
- **R12** — (delegado) Resuelve «cómo se rellenan las cuentas y los movimientos
  que ya están dentro sin volver a subir nada a Drive». Los movimientos de
  Openbank ya importados son duplicados para la deduplicación actual, así que
  reimportar no los tocaría: el importador pasa a rellenar el hueco. Alternativa
  descartada: un script que borre los movimientos de Openbank y los vuelva a
  importar — más rápido de escribir, pero borra filas de verdad y no sirve la
  próxima vez que pase lo mismo.
- **R13** — (añadido) El humano no dijo qué pasa si el archivo y la base discrepan
  en el saldo de una línea YA guardada. Propongo que la base gane y no se toque:
  sobrescribir sería, en el fondo, conciliar, y conciliar es la F32.
  ← REVISAR EN APROBACIÓN.
- **R14** — (delegado) Resuelve «qué añade exactamente `/api/accounts` al contrato
  que lee el frontend». Decido exponer el ancla y su fecha. Alternativa
  descartada: no añadir campos y limitarse a cambiar la documentación de
  `balance` — deja al frontend sin forma de distinguir una cuenta anclada de una
  que aún no lo está.
- **R15** — (delegado) Es la otra mitad de la decisión de R12: el camino de
  relleno no es un script nuevo, es la reimportación local que ya construyó la
  F25.

### Lo que NO está aquí y es deliberado

Comparar el saldo calculado contra el del archivo, la tolerancia de esa
comparación y el aviso de desviación **no aparecen en ningún `R<n>`**: son la
F32. El aviso técnico 3 del intent explica por qué el ancla se establece igual en
Bankinter y en Openbank aunque aquí todavía no se compare nada — sin ella, la F32
no tendría dos números.
