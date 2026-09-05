# Decisiones — F41 `transfer-batch-pairing`

> **Esto es lo único que necesitas leer para aprobar.** Los otros tres archivos
> (`requirements` / `design` / `tasks`) son material del implementer y del reviewer.
> Si algo de aquí no te convence, dilo y se cambia ahí; no hace falta que los abras.

**Qué hace:** cuando un grupo dudoso de la detección de traspasos tiene el mismo
número de salidas que de entradas y cualquier salida podría casar con cualquier
entrada, las empareja por orden de fecha. **No toca** la ventana de 3 días, la
escritura por transacción, la idempotencia, las parejas ya hechas, ningún otro
campo, ni el esquema; el informe conserva su forma exacta.

---

## 🔴 Confirma o corrige (4)

| # | Decisión | Alternativa si no te gusta |
|---|---|---|
| 1 | **Orden al emparejar: fecha → posición dentro del día (la que trae el extracto) → id.** En los 2×3000 de días consecutivos, el del día 1 casa con el del día 1 y el del 2 con el del 2. | Solo fecha e id (ignora el orden real dentro del día que el extracto sí trae). |
| 2 | **Un grupo solo se resuelve si cualquier salida podría casar con cualquier entrada** (todas las combinaciones cruzan cuentas y caben en los 3 días). Es lo que resuelve tu punto 2 (el cruce de 1000 hacia dos bancos): tus dos salidas son idénticas y da igual cuál queda enlazada con cada banco — los totales salen igual. La separación por pareja de cuentas literal NO lo resolvería (daría dos mitades desigualadas) y entre grupos ya la hace la agrupación actual sola. | Exigir además que el grupo sea de una sola pareja de cuentas: los puntos 1 y 3 se resuelven igual, pero el cruce del punto 2 seguiría dudoso. |
| 3 | **Caso borde nuevo: un grupo con números iguales pero encadenado** (p. ej. salidas los días 1 y 4, entradas los días 3 y 7: alguna combinación se sale de los 3 días) **sigue dudoso entero**: emparejar ahí ya es adivinar. Hoy no tienes ningún grupo así. | Emparejar las combinaciones que sí caben — es elegir en silencio justo donde hay duda, lo que vetaste en la F40. |
| 4 | **Propuesta de vocabulario: «lote igualado»** para nombrar el grupo dudoso de la decisión 2 (mismo número de salidas que de entradas, todas combinables entre sí). No abarcaría los grupos desigualados ni los encadenados. Hasta que respondas, se describe entero, como en esta hoja. | Sin nombre corto: se sigue describiendo literalmente en docs e informes. |

## ✅ Ya las cerraste tú (4)

- **Sin marcado manual de traspasos.** Lo aplazaste el 2026-09-03.
- **Un grupo desigualado no se empareja ni parcialmente**: tu punto 4 (dos
  salidas de 500 y una sola entrada) sigue dudoso en el informe, a propósito.
- **Nada más cambia**: ni ventana de 3 días, ni esquema, ni informe (más allá de
  que los grupos resueltos dejan de salir como dudosos), ni parejas ya escritas.
- **Los puntos 1, 2 y 3 del informe del 2026-09-03 se resuelven con regla**, no
  a mano: fue tu encargo literal.

## ⚙️ Técnicas — decididas, no necesitan tu visto bueno (4)

1. **La regla de la F40 es el caso 1-a-1 de esta**: nada de la F40 se reescribe,
   el paso nuevo entra justo antes de dar un grupo por dudoso.
2. **Cada par nuevo se escribe igual que en la F40**: identificador propio, las
   dos piernas juntas o ninguna, y solo se toca el campo del enlace.
3. **Los casos reales se prueban con datos inventados** de la misma forma
   (cuentas y descripciones ficticias, mismas cantidades y estructura de fechas);
   el test que vigila que no haya datos reales tuyos sigue aplicando.
4. **Cero archivos nuevos y cero migración**: todo el cambio vive en el módulo
   de traspasos existente ([`../../src/modules/transfers/transfers.service.ts`](../../src/modules/transfers/transfers.service.ts)).

## 📌 Consecuencias que te tocan a ti (no son código)

- **Tras desplegar, lanza una vez `POST /api/import/local`** (sin cuerpo): esa
  pasada emparejará tus tres grupos aprobados (3×1000, el cruce de 1000, 2×3000
  = 6 parejas nuevas) y los totales bajarán en consecuencia.
- **El punto 4 (2×500 con una sola entrada) seguirá saliendo dudoso** en cada
  informe hasta que exista el marcado manual que aplazaste. Si molesta, es una
  feature nueva.
- **Responde a la propuesta de vocabulario de la decisión 4** (vale un «sí»,
  otra palabra, o «no hace falta nombre»).
