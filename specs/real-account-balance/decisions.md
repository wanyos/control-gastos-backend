# Decisiones — F31 `real-account-balance`

> **Esto es lo único que necesitas leer para aprobar.** Los otros tres archivos
> (`requirements` / `design` / `tasks`) son material del implementer y del
> reviewer. Si algo de aquí no te convence, dilo y se cambia ahí; no hace falta
> que los abras.

**Qué hace:** cada cuenta pasa a saber cuánto dinero tiene dentro: lee su saldo
de partida del extracto una sola vez y a partir de ahí lo mantiene sola con los
movimientos que entran. **No** compara ese saldo contra el del archivo ni te
avisa de descuadres — eso es la F32, la mitad que aprobaste separar.

---

## 🔴 Confirma o corrige (6)

| # | Decisión | Alternativa si no te gusta |
|---|---|---|
| 1 | **Se guarda el saldo del archivo tal cual viene, con su fecha**, y el saldo de hoy se calcula al leerlo. Así, importar después un mes antiguo **no lo estropea**: era tu preocupación y queda resuelta. | Guardar el saldo de partida ya despejado: una columna menos, pero un extracto antiguo importado después descuadra la cuenta en silencio. |
| 2 | **«Ya anclada» se distingue de «vale 0» porque la casilla está vacía hasta que se rellena**, no porque valga cero. Un saldo de cero que venga del archivo es un ancla igual de válida. | Un interruptor aparte de sí/no anclada: una columna más para decir lo mismo, y sigue sin dar la fecha que necesita el punto 1. |
| 3 | **El ancla vive en casillas nuevas de la tabla de cuentas; `initialBalance` se queda como está** y solo actúa en una cuenta sin extractos. Hace falta una migración que solo añade columnas: no reescribe ni una fila tuya. | Reaprovechar `initialBalance`: sin migración, pero no tiene fecha, y sin fecha se cae el punto 1. |
| 4 | **Bankinter se ancla con el saldo de la última línea de su primer extracto** (y lo mismo cualquier banco que traiga saldo por línea y no en la cabecera). | Despejar hacia atrás desde la primera línea: da el mismo número cuando el extracto está completo, pero depende de que lo esté. |
| 5 | **Lo que ya está dentro se arregla lanzando la reimportación local que ya tienes** (F25, sin tocar Drive), y el importador pasa a rellenar los saldos por línea que falten, sin tocar nunca uno ya guardado. | Un script de un solo uso que borre los movimientos de Openbank y los vuelva a importar: más rápido de escribir, pero borra filas de verdad y no sirve la próxima vez. |
| 6 | **`/api/accounts` añade dos datos: el saldo de partida anclado y su fecha.** `balance` sigue llamándose igual, pero ahora es el saldo del archivo **más lo que haya entrado después**. | No añadir nada y solo cambiar la documentación: el frontend se queda sin saber si una cuenta está anclada o todavía no. |

## ✅ Ya las cerraste tú (5)

- **Donde el archivo trae el saldo, manda el archivo.** No se toca: ya funciona así.
- **El saldo se lee una vez y se mantiene solo.** Nada de refrescarlo a mano.
- **Nada de teclear saldos** en la base ni en un formulario: entran por el archivo.
- **El saldo por línea de Openbank se guarda**, como ya pasa con el de Bankinter.
- **La feature va partida en dos**: esta produce el número, la F32 lo vigila.
- **La línea `saldo;` que escribes a mano es el saldo al ÚLTIMO MOVIMIENTO de
  ese archivo**, no el del día en que lo escribiste. Confirmado por ti el
  2026-08-25, al repasar la feature. Es la suposición sobre la que se apoya el
  punto 1: el ancla se clava en la fecha del movimiento más reciente del
  archivo. Si algún mes cambias de criterio, el saldo de esa cuenta se desvía
  sin que nadie lo cante hasta la F32.

## ⚙️ Técnicas — decididas, no necesitan tu visto bueno (4)

1. **El saldo sigue calculándose en cada petición, no se almacena.** Un saldo
   guardado es un saldo que puede quedarse viejo, que es justo lo que no querías.
2. **Cuando un archivo trae saldo en la cabecera Y en cada línea (Openbank), gana
   el de la cabecera**, y su fecha se toma del movimiento más reciente de ese
   archivo. Es lo mismo que hizo a mano la comprobación que ya salió limpia.
3. **Si un archivo falla al importarse, no ancla nada.** El anclaje ocurre después
   de guardar los movimientos, nunca antes.
4. **La decisión de la F19 de tirar el saldo de Openbank se revierte y se corrigen
   los cuatro textos que hoy dicen lo contrario.**
   ⚠️ *Efecto:* si no se corrigieran, la próxima sesión leería que ese dato se
   descarta a propósito y volvería a quitarlo. Ya pasó una vez en este proyecto.

## 📌 Consecuencias que te tocan a ti (no son código)

- **Lanzar una vez la reimportación local** cuando la feature esté cerrada. Es lo
  que ancla tus cuatro cuentas y rellena los saldos de Openbank. No tienes que
  subir nada a Drive.
- **Comprobar cada cuenta contra la web de su banco** después de eso. Es la prueba
  real de que esta feature hace lo que querías, y ninguna suite de tests la
  sustituye.
- **Asegurarte de que al menos un extracto de N26 y uno de MyInvestor llevan la
  línea `saldo;`** escrita a mano. Basta **una vez** por cuenta, para siempre.
- **El frontend no se toca en esta sesión.** Ver el saldo en pantalla es otra
  sesión, con el contrato ya actualizado.

## ⚠️ Incoherencias conocidas que se heredan

- **Hasta la F32, nadie comprueba que el saldo cuadre.** Es el corte que
  aprobaste, y el riesgo está medido: la comprobación ya se hizo a mano contra
  tus datos y salió limpia en las dos modalidades.
- **Los saldos de tus cuentas no son todos del mismo día**, porque los extractos
  no llegan hasta la misma fecha. Cada cuenta dice la verdad a la fecha de lo
  último que ha visto; sumarlos en una sola cifra de patrimonio es la vista que
  aún no se toca.
