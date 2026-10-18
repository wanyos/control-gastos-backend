# Decisiones — F60 `category-origin-and-rule-reapply`

> **Esto es lo único que necesitas leer para aprobar.** Los otros tres archivos
> (`requirements` / `design` / `tasks`) son material del implementer y del reviewer.
> Si algo de aquí no te convence, dilo y se cambia ahí; no hace falta que los abras.

**Qué hace:** cada movimiento guarda quién le puso la categoría: tú a mano, una regla, o el paso que al final de cada importación pone `Otros gastos` / `Otros ingresos` a lo que ninguna regla reconoció (y el botón de «confirmar todo», que hace lo mismo). Al **crear o cambiar** una regla, se aplica en ese momento también a lo que dejó ese paso, y la respuesta dice qué movimientos cambió. **No toca** importes, sumas ni lo que pusiste a mano, y la importación sigue igual.

---

## 🔴 Confirma o corrige (6)

| # | Decisión (mía) | Alternativa si no te gusta |
|---|---|---|
| 1 | **Nombres, te los propongo:** el campo se llama `categorySource` y sus tres valores `manual` (a mano), `rule` (por una regla) y `closing` (por el paso del final de la importación o «confirmar todo»). Abarca solo quién escribió la categoría que tiene **ahora**; no abarca el `origin` que ya existe (si el movimiento vino de un extracto). Hace falta porque saldrá en la API y en una columna de la base. | Otros nombres: `categoryOrigin` (choca de lejos con `origin`), o `fallback` / `generic` en vez de `closing`. Dime cuáles. |
| 2 | **Lo que ya tiene categoría hoy:** lo que está en `Otros gastos` u `Otros ingresos` → `closing` (las reglas podrán recolocarlo); **todo lo demás → `manual`** (ninguna regla lo tocará nunca). Medido en tu base, solo lectura: **no queda rastro de quién puso cada categoría** (una escritura en bloque del 2026-10-16 lo borró). Si alguna vez metiste algo a mano en `Otros gastos`, quedará como `closing`: es el único riesgo. **Hoy ninguna de tus reglas recoge nada de las dos genéricas**, así que al aplicar la feature no se mueve nada; se moverá con la próxima regla que crees. | Todo → `manual`: riesgo cero, pero las reglas nuevas no tocarían nada de lo que ya está en `Otros gastos`, que es lo que pides. O marcar `rule` lo que casa con una regla de su misma categoría (más fiel), con el riesgo de que una feature futura lo mueva. |
| 3 | **Recolocar es automático**, en la misma petición que crea o cambia la regla, y pasa **todas** las reglas (no solo la nueva) para que un choque se detecte igual que al importar. La respuesta trae la regla y la lista de movimientos cambiados, igual que «aplicar reglas» hoy. Importar y «aplicar reglas» siguen mirando **solo** lo pendiente sin categoría, como ahora. | Que solo recoloque «aplicar reglas», a petición: un paso más para ti y la creación de la regla no dice qué movió. |
| 4 | **Cambiar o borrar una regla no deshace lo que esa regla ya categorizó.** Al cambiarla solo se recoloca lo que dejó el paso del final de la importación; borrarla no toca nada (como hoy). | Guardar en cada movimiento qué regla lo categorizó, para que cambiarla o borrarla lo recoloque (o lo devuelva a la genérica). Otra columna y unos tres requisitos más. |
| 5 | **Un movimiento de la genérica que casa con reglas de dos categorías distintas no se mueve:** se queda donde está y sale en la lista de choques de la respuesta (lo mismo que hoy con un pendiente). Hoy hay uno así en tu base. | Que gane la regla más antigua o la de texto más largo: se mueve, pero puede caer en la categoría equivocada sin avisarte. |
| 6 | **Cualquier categoría que pongas a mano queda protegida para siempre**, también si eliges `Otros gastos` o la misma categoría que ya tenía. Quitarle la categoría a un movimiento deja el origen vacío. | Proteger solo si la categoría cambia: si la pantalla de revisión manda la categoría al guardar aunque no la toques, no dejaría protegidos sin querer movimientos que no tocaste; a cambio, elegir a propósito `Otros gastos` no los protegería. |

## ✅ Ya las cerraste tú (3)

- **Una regla nunca pisa una categoría puesta a mano**, ni nueva ni cambiada.
- **Las reglas tienen que llegar también a lo que ya está en `Otros gastos` / `Otros ingresos`**: no quieres repasarlo a mano.
- **Solo cambia la categoría**: ni importes ni sumas; y la importación sigue aplicando las reglas y rellenando lo que queda.

## 🧪 Cómo se comprobará que está hecho

| Tu frase de «cómo sé que está bien» | Se comprueba ejecutando |
|---|---|
| Si creo una regla, lo que estaba en la genérica y la cumple pasa a su categoría | Un test que crea una regla y otro que la cambia: los movimientos de la genérica que la cumplen cambian y salen en la respuesta |
| Lo puesto a mano no cambia nunca por una regla | Un test con movimientos puestos a mano (uno de ellos en `Otros gastos`) que crea y cambia reglas que los recogerían: no se mueven |
| Cada movimiento dice de dónde salió su categoría | Cuatro tests: cambio a mano → `manual`; una regla → `rule`; «confirmar todo» → `closing`; y el que pasa la migración sobre movimientos de ejemplo |
| Lo que funciona sigue igual; las sumas no cambian | Un test de importación (aplica reglas a lo nuevo y rellena el resto, sin mover lo antiguo); uno que recoloca y compara sumas antes y después; y `pnpm test` entero |
| `docs/api-contract.md` lo dice | Un test que lee el contrato: el campo nuevo con sus tres valores y qué recoloca una regla |

## ⚙️ Técnicas — decididas, no necesitan tu visto bueno (4)

1. **El origen va en una columna nueva del movimiento**, rellena por una migración de solo datos que no cambia la fecha de última modificación ni ninguna otra columna.
2. **Si la recolocación falla a mitad, la regla queda creada** y el error viaja en la respuesta, como en la importación; si la regla se rechaza (texto repetido, categoría que no existe), no se recoloca nada.
3. **Una regla que apunta a la propia `Otros gastos`** marca como «por regla» lo que recoge, aunque no cambie de categoría: es verdad que ahora lo dice una regla.
4. **La feature 61 reutilizará el mismo código** que decide qué recoge una regla, para que el número que te enseñe antes de crearla sea el mismo que luego mueve. Esta feature no crea esa consulta.

## 📌 Consecuencias que te tocan a ti (no son código)

- **Antes de aplicar la migración a tu base, saca una copia** con `pnpm run db:backup`; luego `pnpm run prisma:migrate`. Nadie la aplica por ti.
- **La sesión del frontend** tiene que enseñar de dónde salió cada categoría y la lista de movimientos que mueve una regla al crearla; y comprobar si su pantalla manda la categoría al guardar aunque no la toques (ver 🔴 6).
- **La prueba con tus datos la haces tú**: crea una regla para algo que tengas en `Otros gastos` y mira la lista que devuelve.

## ⚠️ Incoherencias conocidas que se heredan

- **No he comprobado**, porque no hay forma, si metiste a mano algún movimiento en `Otros gastos`: lo que hubiera quedaría como `closing` (🔴 2). Las mediciones son consultas de solo lectura a tu base de hoy, no pruebas por la API (falta el código).
