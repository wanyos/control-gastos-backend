# Decisiones — F39 `investments-overview`

> **Esto es lo único que necesitas leer para aprobar.** Los otros tres archivos
> (`requirements` / `design` / `tasks`) son material del implementer y del reviewer.
> Si algo de aquí no te convence, dilo y se cambia ahí; no hace falta que los abras.

**Qué hace:** una consulta nueva de solo lectura, `GET /api/investments/overview`,
que enseña tus productos de inversión con su foto del mes, cuánto cambiaron desde
la foto anterior (euros y porcentaje) y cuánto ganaste en total en el mes pedido
(fluctuación + intereses de la cuenta remunerada). **No toca** el saldo de las
cuentas corrientes, no calcula un patrimonio total, no escribe nada, y
`GET /api/accounts` queda exactamente igual.

---

## 🔴 Confirma o corrige (6)

| # | Decisión | Alternativa si no te gusta |
|---|---|---|
| 1 | **Un solo endpoint** que devuelve la lista de productos y la ganancia del mes juntas, como ya hace la vista del dinero (F38). | Dos consultas separadas (lista / ganancia): dos peticiones para la misma pantalla y dos sitios donde divergir. |
| 2 | **La subida o bajada se mide con TU número de ganancia** (el `gain` que escribes cada mes): euros = ganancia de esta foto − ganancia de la anterior; % = diferencia de tus dos porcentajes, en puntos. Así tu aportación mensual NO cuenta como subida. | Medirla sobre el valor de mercado: más simple, pero el mes que aportas 300 € parecería que el fondo subió 300 €. |
| 3 | **Lo que no se puede calcular sale como hueco, jamás como cero**: si falta la foto, la anterior, o la ganancia de un mes, ese producto queda fuera de la suma y se lista aparte con el motivo. | Contarlo como 0 en silencio: la suma del mes parecería completa siendo mentira. |
| 4 | **«Falta la foto» se dice así**: el sitio de la foto va vacío (`null`) y el producto aparece en la lista de excluidos del mes con el motivo. La foto anterior puede verse, pero siempre con su propia fecha, nunca haciéndose pasar por la del mes. | Ocultar el producto entero ese mes: parecería que no existe, peor que decir que falta su foto. |
| 5 | **Filtros: solo por producto, por mes y por tipo** (fondo / ETF / cartera / depósito / cuenta remunerada). Nada más: con un banco y seis productos, más filtros son catálogo vacío. | Añadir filtro por banco o por vivo/cerrado — se puede, pero hoy no filtrarían nada. |
| 6 | **Sin mes pedido, se enseña el mes en curso** (igual que la vista del dinero). Ojo: a mitad de mes casi todo saldrá como «falta la foto», porque tus JSON son de fin de mes. | Por defecto, el último mes que tenga alguna foto: nunca verías huecos al abrir, pero la fecha que miras cambiaría sola. |

## ✅ Ya las cerraste tú (4)

- **Ningún importe tuyo se recalcula ni se redondea:** se muestra lo que
  tecleaste en el fichero, tal cual (regla 4 del modelo, tuya desde la F9).
- **Los depósitos no fingen variación:** salen con sus condiciones (capital,
  TAE, ganancia final, vencimiento) y nada más (ADR-012, confirmado el
  2026-08-11).
- **Los intereses de la cuenta remunerada cuentan en el mes en que se
  abonaron** (la fecha de su foto).
- **Esto no se mezcla con las cuentas corrientes:** lo dijiste al aprobar la
  F38; cada dinero tiene su vista.

## ⚙️ Técnicas — decididas, no necesitan tu visto bueno (4)

1. **La lectura vive en el módulo de inversiones ya existente** (`src/modules/investments/`),
   que se diseñó para crecer; los escritores de la importación no se tocan.
2. **El mes se resuelve con el mismo código que la F38** (`?month=YYYY-MM`,
   mes mal escrito → error 400, nunca se adivina).
3. **Producto cerrado antes del mes pedido no aparece**; cerrado dentro del mes
   o después, sí. *Efecto:* un depósito vencido desaparece de la vista al mes
   siguiente de su cierre, pero sigue ahí si pides un mes en que vivía.
4. **No se suma un patrimonio total aquí**: valor de mercado y efectivo sin
   invertir salen como dos campos separados (tu aviso de la F9); la consulta de
   patrimonio neto es otra feature, ya prevista.

## 📌 Consecuencias que te tocan a ti (no son código)

- **El mes que no subas el JSON de un producto, esta vista dirá que falta su
  foto** y ese producto no entrará en la ganancia del mes. No hay nada que
  arreglar en código: subes el fichero y reaparece.
- **La pantalla es del frontend**: cuando apruebes e implementemos esto, la
  feature de la interfaz se planifica en el otro proyecto contra el contrato
  actualizado, en otra sesión.
