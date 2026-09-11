# Decisiones — F43 `auto-categorization`

> **Esto es lo único que necesitas leer para aprobar.** Los otros tres archivos
> (`requirements` / `design` / `tasks`) son material del implementer y del reviewer.
> Si algo de aquí no te convence, dilo y se cambia ahí; no hace falta que los abras.

**Qué hace:** una pasada que pone categoría a los movimientos según reglas sobre
el concepto (una tabla nueva de reglas que editas por API), corre sola tras cada
importación y también cuando tú la pidas. NO cambia importes, saldos, totales,
`status` ni la importación, y no trae ninguna pantalla.

---

## 🔴 Confirma o corrige (6)

| # | Decisión | Alternativa si no te gusta |
|---|---|---|
| 1 | **Las reglas viven en la base de datos con su API** (`/api/category-rules`: crear, listar, cambiar, borrar). | Un archivo que escribes tú a mano: sin migración, pero cada corrección es editar un fichero y el futuro editor del frontend no tendría API. |
| 2 | **Una regla es «el concepto contiene este texto»**, sin distinguir mayúsculas ni tildes, mínimo 3 letras. | «Empieza por» o comodines: más finos, pero fáciles de escribir mal sin que nada avise. |
| 3 | **Corre al final de cada importación Y bajo demanda** (`POST /api/category-rules/apply`). | Solo tras importar: para repasar lo pendiente después de corregir una regla tendrías que reimportar un archivo. |
| 4 | **Si dos reglas de categorías distintas casan con el mismo movimiento, no se asigna nada** y el choque sale en el informe (mismo principio que los traspasos dudosos). | Un número de prioridad por regla: resolvería solo, pero en silencio. |
| 5 | **Solo se toca lo que está sin categoría Y sin confirmar**: un confirmado sin categoría no se toca (confirmar = «ya lo miré»), y el importe 0 nunca se categoriza. | Proteger solo lo que ya tiene categoría: la pasada escribiría sobre confirmados tuyos. |
| 6 | **El borrador de arranque es NUEVO**: las reglas del análisis del 2026-09-01 no quedaron escritas en ningún sitio (comprobado; solo existe la lista de 16 categorías), así que el agente redacta ~2-6 reglas por categoría con marcas públicas (sin copiar conceptos de tus extractos), sembradas con `pnpm run seed:category-rules`, y tú las corriges por API. | Empezar con la tabla vacía y escribirlas todas tú (lo descartaste el 2026-09-06). |

## ✅ Ya las cerraste tú (4)

- **Derivadas y corregidas por ti** (2026-09-06), no escritas de cero ni solo el
  mecanismo.
- **Antes sin categoría que mal categorizado**: nada dudoso asigna en silencio.
- **Sin editor de reglas con interfaz**: frontend, otra sesión.
- **Categorizar no cambia importes, saldos, totales ni la importación** (test
  que compara antes y después).

## ⚙️ Técnicas — decididas, no necesitan tu visto bueno (4)

1. **Borrar o cambiar una regla no des-categoriza nada**: lo ya puesto se queda;
   se corrige movimiento a movimiento con el PATCH de la F37 si hiciera falta.
2. **La pasada nunca confirma**: pone la categoría y deja `pending_review`;
   revisar sigue siendo tuyo.
3. **Un fallo de la pasada no tumba la importación**: viaja dentro del informe,
   igual que la detección de traspasos.
4. **Borrar una categoría con reglas se impide (409)**, como ya pasa con la que
   tiene movimientos. Por esto el spec tiene 16 requirements (uno sobre el tope
   de ~15): es coherencia con la F37, no alcance nuevo.

## 📌 Consecuencias que te tocan a ti (no son código)

- **Ejecutar `pnpm run seed:category-rules` una vez** al cerrar la feature (tus
  16 categorías ya están; si renombraste alguna, la regla huérfana se lista en
  vez de sembrarse).
- **Revisar el borrador de reglas en la prueba real del cierre**: el informe te
  dirá cuántos categorizó, cuántos chocaron y cuántos quedaron sin casar; el
  ajuste fino lo haces tú por API (añadir/cambiar/borrar reglas y volver a
  lanzar `apply`).
- Un movimiento que **ya confirmaste sin categoría** no lo tocará ninguna
  pasada: si quieres categoría ahí, es a mano.

## ⚠️ Incoherencias conocidas que se heredan

- Tus **1520 movimientos siguen `pending_review`** después de categorizarse:
  esta feature pone categorías, no los da por revisados (cabo de la F37, sigue
  abierto a propósito).
