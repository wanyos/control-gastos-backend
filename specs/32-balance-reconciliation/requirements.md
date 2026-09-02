# Requirements — F32 `balance-reconciliation`

> EARS estricto (`docs/specs.md` §requirements.md). Material del `implementer` y
> del `reviewer`; el humano lee `decisions.md`.
>
> **Alcance.** Esta es la mitad que **comprueba** el número. Producirlo es la F31
> `real-account-balance`, ya cerrada: el ancla, la fórmula del saldo y el saldo
> por línea de Openbank **ya existen en el código** y esta feature no los cambia.
>
> **ADR-017.** Ningún importe de este documento sale de `var/` ni de la base:
> todos los números de los ejemplos son inventados.

## Vocabulario

Este documento no inventa ninguna palabra nueva (regla de `CLAUDE.md`
§Vocabulario). Usa **`descuadre`**, que es la palabra que el humano escribió en
su propio `intent` («Si hay descuadre, que me avise»), y describe todo lo demás
literalmente. **No se usa la palabra «testigo»**, que `docs/vocabulario.md`
lista como usada sin aprobar.

Cuatro cosas distintas que este documento no mezcla nunca:

- **`accountBalance`** — el saldo de la CUENTA que escribe el preámbulo del
  extracto. Un dato por archivo.
- **`balanceAfter`** — el saldo tras UNA línea. Un dato por movimiento.
- **Ancla guardada** — las columnas `balanceAnchor` / `balanceAnchorDate` /
  `balanceAnchorDaySequence` de `Account`, que escribió la F31.
- **Descuadre** — el resultado de una comparación cuya diferencia no es cero.

Las dos comparaciones, descritas enteras porque no tienen nombre corto aprobado:

- **Comparación línea a línea**: dentro del archivo que se está importando, para
  cada par de líneas consecutivas que traen las dos su saldo por línea, la
  diferencia entre esos dos saldos contra el importe con signo de la línea más
  reciente del par. No usa el ancla ni la base de datos.
- **Comparación contra el saldo del preámbulo**: el `accountBalance` del archivo
  contra el importe del ancla guardada más el neto de los movimientos de la
  cuenta posteriores al ancla y no posteriores al movimiento más reciente del
  archivo. Es una comparación de números absolutos y sí necesita el ancla.

---

## R1

CUANDO se importa un extracto, el sistema DEBE comparar, para cada par de líneas
consecutivas del archivo por `(bookingDate, daySequence)` en las que las dos
traen saldo por línea, la diferencia entre esos dos saldos contra el importe con
signo de la línea más reciente del par.

## R2

SI en un par de líneas consecutivas del archivo alguna de las dos no trae saldo
por línea ENTONCES el sistema NO DEBE reportar descuadre por ese par.

## R3

CUANDO se importa un extracto que trae `accountBalance` en una cuenta que YA
tenía ancla guardada antes de ese archivo, el sistema DEBE comparar ese
`accountBalance` contra el importe del ancla guardada más el neto de los
movimientos de la cuenta posteriores al ancla y no posteriores al movimiento más
reciente del archivo.

## R4

SI la cuenta no tenía ancla guardada antes del archivo, o el movimiento más
reciente del archivo no es posterior al ancla guardada, ENTONCES el sistema NO
DEBE hacer la comparación contra el saldo del preámbulo.

## R5

El sistema DEBE tratar dos importes como coincidentes solo cuando su diferencia
sea exactamente cero.

## R6

SI una comparación da una diferencia distinta de cero ENTONCES el sistema DEBE
añadir al resultado de ese archivo un descuadre con el `id` y el `alias` de la
cuenta, la fecha del punto comparado, el importe calculado, el importe que trae
el archivo y la diferencia entre los dos.

## R7

SI un archivo produce uno o más descuadres ENTONCES el sistema DEBE terminarlo
con `status: "imported"` y seguir procesando los archivos siguientes.

## R8

SI un archivo produce uno o más descuadres ENTONCES el sistema NO DEBE modificar
el ancla guardada de la cuenta ni el `balance` que devuelven
`GET /api/accounts` y `GET /api/accounts/:id`.

## R9

SI el archivo no trae `accountBalance` y ninguna de sus líneas trae saldo por
línea ENTONCES el sistema DEBE importarlo con normalidad y no reportar ningún
descuadre.

## R10

El sistema DEBE incluir en el resultado de una ejecución de importación el
número total de descuadres detectados en todos sus archivos.

## R11

CUANDO se ejecuta la reimportación local `POST /api/import/local`, el sistema
DEBE reportar los descuadres de cada archivo y el total de la ejecución con la
misma forma que `POST /api/import`.

---

## Trazabilidad con `como_se_que_esta_bien`

| Criterio del humano | Cubierto por |
|---|---|
| En las cuentas que traen saldo, el calculado se sigue haciendo pero para comparar | R1, R3 |
| Si no coinciden, la importación me lo dice con cuenta, fecha, los dos números y la diferencia | R6, R10 |
| No falla el import: importa y avisa | R7, R11 |
| El saldo que se queda sigue siendo el del archivo | R8 |
| Sin la línea del saldo escrita a mano, se importa igual y esa vez no hay comprobación | R4, R9 |

---

## Procedencia

- **R1** — (humano) Sale de «quiero que la app compare su propio cálculo contra
  el saldo del archivo». La modalidad línea a línea es la que el aviso técnico 2
  del `intent` documenta como ya probada a mano contra los datos reales el
  2026-08-25 sin una línea desviada. Añado el detalle de que la comparación se
  hace **dentro del archivo que se está importando**, no recorriendo todo el
  histórico guardado de la cuenta. ← REVISAR EN APROBACIÓN (punto 🔴 4).
- **R2** — (añadido) El humano no dijo qué pasa cuando una línea del archivo no
  trae saldo y rompe la cadena. Propongo saltar ese par en silencio, en vez de
  cantarlo como descuadre: un hueco no es una desviación. ← REVISAR EN APROBACIÓN.
- **R3** — (humano) Sale de la misma frase que R1, en la modalidad que el aviso
  técnico 2 describe para los bancos que no traen saldo por línea.
- **R4** — (añadido) El humano no dijo qué pasa cuando el archivo es el que acaba
  de anclar la cuenta (comparar el ancla contra sí misma daría siempre cero y no
  comprueba nada) ni cuando llega un extracto **más antiguo** que el ancla, donde
  la suma hacia delante no aplica. Propongo no comparar en esos dos casos.
  ← REVISAR EN APROBACIÓN.
- **R5** — (delegado) Resuelve «con qué tolerancia se comparan dos importes antes
  de cantar desviación». Decido **cero**: los importes viajan como `Decimal(10,2)`
  en la base y se comparan con `Prisma.Decimal`, así que no hay error de coma
  flotante que absorber, y la comprobación manual del 2026-08-25 salió limpia al
  céntimo. Alternativa descartada: un margen de ±0,01 — taparía justo el error de
  un céntimo, que es el que un fallo de redondeo produciría.
- **R6** — (delegado) Resuelve «dónde aparece el aviso de desviación para que él
  lo vea de verdad». Decido **el resultado de la importación y solo ahí**. Lo que
  el descuadre lleva dentro es literal del humano: «la cuenta, la fecha, los dos
  números y la diferencia». Alternativa descartada: exponerlo también en
  `/api/accounts` — obliga a guardar el descuadre en una columna nueva (un dato
  que se queda viejo en cuanto entra otro archivo), porque el `accountBalance` de
  un archivo concreto no está guardado en ningún sitio y no se puede recalcular
  al leer.
- **R7** — (humano) Sale de «No falla el import: importa y avisa» y de «no quiero
  que una desviación tumbe la importación: el resto de archivos debe entrar
  igual».
- **R8** — (humano) Sale de «el que se queda como saldo de la cuenta sigue siendo
  el del archivo» y de «no quiero que el aviso cambie el saldo que veo».
- **R9** — (humano) Sale de «cuando el extracto de N26 o MyInvestor NO trae la
  línea del saldo escrita a mano, el archivo se importa igual y no pasa nada:
  simplemente esa vez no hay comprobación».
- **R10** — (añadido) El humano no pidió un total. Lo propongo porque una
  ejecución recorre muchos archivos y sin contador hay que leerse el informe
  entero para saber si hubo algo; con él, un cero cierra el tema de un vistazo.
  ← REVISAR EN APROBACIÓN.
- **R11** — (añadido) El humano habló de «la importación» sin distinguir las dos
  vías. Propongo que la reimportación local se comporte igual. Sale casi sola:
  las dos vías ya comparten `importStatement` y `totals` (ver
  [`import.local.service.ts`](../../src/modules/import/import.local.service.ts)),
  así que el requirement existe sobre todo para que haya un test que impida que
  se separen. ← REVISAR EN APROBACIÓN.

### Lo que NO está aquí y es deliberado

- **Nada cambia en cómo se calcula el saldo de una cuenta.** `computeAccountBalance`,
  `resolveAnchorPoint`, `readAnchor` y `attachBalances` **no se tocan**: R8 es
  precisamente que sigan dando lo mismo.
- **No se persiste ningún estado de comprobación.** No hay migración, no hay
  columna nueva y `GET /api/accounts` no cambia de forma.
- **No se corrige ningún descuadre.** La feature detecta y cuenta; qué hacer con
  un descuadre real es una decisión del humano cuando aparezca el primero.
