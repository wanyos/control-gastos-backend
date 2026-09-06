# Decisiones — F42 `net-worth`

> **Esto es lo único que necesitas leer para aprobar.** Los otros tres archivos
> (`requirements` / `design` / `tasks`) son material del implementer y del reviewer.
> Si algo de aquí no te convence, dilo y se cambia ahí; no hace falta que los abras.

**Qué hace:** una consulta nueva de solo lectura, `GET /api/net-worth`, que dice
cuánto vale todo tu dinero junto hoy: el saldo real de las cuentas (el mismo de
la F31/F38, sin segunda suma) más lo que valen las inversiones según sus últimas
fotos, con el desglose de cada parte y avisos cuando una pieza está incompleta o
vieja. **No toca** `GET /api/overview` ni `GET /api/investments/overview`, y no
escribe nada.

---

## 🔴 Confirma o corrige (5)

| # | Decisión | Alternativa si no te gusta |
|---|---|---|
| 1 | **Endpoint nuevo** (`GET /api/net-worth`), no se amplía `GET /api/overview`: aquel es la vista de UN MES y esta es la foto de HOY; mezclarlas cambiaría el contrato que la F38 dejó cerrado. | Meter un bloque de inversiones y el total dentro de `GET /api/overview`: una petición menos para el frontend, pero su contrato cambia y la mitad de la respuesta ignoraría el `?month`. |
| 2 | **Solo «hoy»**: sin parámetro de fecha. Cada producto se valora por su foto más reciente y las cuentas por su saldo actual. | Aceptar `?date=`: el cálculo ya serviría, se puede añadir después sin romper nada; hoy sería un parámetro sin uso. |
| 3 | **Una foto se considera vieja si es anterior al primer día del mes pasado** (tus JSON son de fin de mes: a mitad de mes la del mes pasado es fresca, la de hace dos meses no). El valor viejo **sigue sumando**, pero el producto sale en la lista de avisos con la fecha de la foto usada. | Otro umbral (p. ej. 45 días), o no avisar nunca y que mires tú las fechas producto a producto. |
| 4 | **Un depósito ya vencido pero sin `closedAt` en tu fichero sigue sumando su capital, con aviso**: dejar de sumarlo por la fecha convertiría un olvido tuyo en «el dinero desapareció». Ojo: si el banco ya te lo devolvió a la cuenta, el total lo cuenta dos veces hasta que escribas el cierre — el aviso existe para eso. | Dejar de sumarlo automáticamente al vencer: sin doble conteo, pero el dinero se esfuma del total antes de que el extracto lo refleje. |
| 5 | **Un producto cerrado (`closedAt` escrito) no aparece ni suma**: su dinero ya está en el saldo de las cuentas. | Mostrarlo a valor 0 como recordatorio — es ruido y no cambia el total. |

## ✅ Ya las cerraste tú (5)

- **Un producto fluctuante vale `marketValue + uninvestedCash`**, que van aparte
  (tu regla de la F9): sin doble conteo.
- **Un depósito vale su capital mientras no venza**; la ganancia prometida no se
  suma, solo se realiza al vencimiento.
- **La cuenta remunerada vale el saldo de su última foto.**
- **Ningún importe tuyo se recalcula ni se redondea**: se suman los que están
  guardados, tal cual.
- **La F38 y la F39 siguen exactamente igual**: esta es la vista de arriba del
  todo, no un reemplazo.

## ⚙️ Técnicas — decididas, no necesitan tu visto bueno (4)

1. **La lectura de las tablas de inversión se queda en el módulo de inversiones**
   (el test de arquitectura que exige un solo archivo tocándolas no se relaja);
   el módulo nuevo solo compone: cuentas + inversiones, y suma.
2. **El lado de las cuentas llama a la misma función que `GET /api/accounts`**
   (`listAccounts`, la fórmula única de la F31): imposible que dos vistas den
   saldos distintos.
3. **Un producto sin ninguna foto sale con hueco (`null`), fuera de la suma y
   listado con su motivo** — jamás un cero en silencio, igual que en la F39.
4. **Un `uninvestedCash` que tu fichero no trae suma solo el `marketValue`**:
   no se inventa un cero (tu regla de la F9).

## 📌 Consecuencias que te tocan a ti (no son código)

- **Cuando venza un depósito, escribe su `closedAt` en el fichero del mes**: hasta
  que lo hagas, el total lo contará por su capital Y por el dinero devuelto a la
  cuenta, con el aviso encendido (punto 4 de arriba).
- **El mes que no subas el JSON de un producto**, el total seguirá dándose con su
  foto anterior, pero con el aviso de «foto vieja» a partir del segundo mes.
- **La pantalla es del frontend**: cuando esto se implemente y el contrato quede
  actualizado, la interfaz se planifica en el otro proyecto, en otra sesión.
