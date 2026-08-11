# Decisiones — F10 `myinvestor-statement`

> **Esto es lo único que necesitas leer para aprobar.** Los otros tres archivos
> (`requirements` / `design` / `tasks`) son material del implementer y del reviewer.
> Si algo de aquí no te convence, dilo y se cambia ahí; no hace falta que los abras.

**Qué hace:** el módulo `src/modules/myinvestor/` lee **el extracto CSV de tu cuenta
corriente de MyInvestor** y lo convierte en movimientos estructurados, volcados a un
JSON local para revisarlos. Sin base de datos y sin mover nada en Drive.

**De dónde sale esta feature:** del corte de la antigua F10 `myinvestor-parser`, que
hacía dos cosas. **Los archivos JSON de producto de inversión son ahora la F13
`myinvestor-products`**, que espera a que cierres sus cinco puntos rojos.

---

## ✅ Sin puntos rojos: no hay nada que confirmar

**Esta feature no tiene ninguna decisión pendiente de tu visto bueno.** Es deliberado y
es la razón de ser del corte: los cinco «confirma o corrige» de la spec original eran
**todos** de los archivos de producto y se han ido enteros a
[`../myinvestor-products/decisions.md`](../myinvestor-products/decisions.md). Aquí el
banco genera el archivo y no hay formato que elegir: se lee lo que viene.

Puedes aprobar esta de un vistazo y dejar la otra para cuando tengas la cabeza puesta en
los productos.

## ⚙️ Técnicas — decididas, no necesitan tu visto bueno (7)

1. **Módulo propio `src/modules/myinvestor/`**, un parser por banco, según la norma de
   `docs/conventions.md`. Este módulo es también el que la F13 ampliará después.
2. **La forma de la salida NO la decide este banco.** Desde la feature 11 todos los
   parsers devuelven el mismo contrato compartido; MyInvestor se adapta a él.
3. **Se lee como texto separado por `;`, sin ninguna librería.** El archivo no tiene
   comillas ni escapes: cinco columnas y ya está.
4. **Las columnas se localizan por su nombre**, no por su posición, y sin distinguir
   mayúsculas ni acentos, para que un reexport con las columnas movidas no rompa nada.
5. **Los `.txt` y demás extensiones van a una lista de «ignorados»:** visibles, sin
   contar como fallo. Tus tres capturas de la web caerían ahí, y de momento también los
   `.json` de producto, hasta que exista la F13.
6. **Una línea que no se entiende se reporta con su número de línea y su motivo**, y no
   detiene el parseo del resto.
7. **El parser no calcula nada:** ni un saldo, ni un total, ni nada que el archivo no
   traiga escrito.

## 📌 Consecuencias que te tocan a ti (no son código)

- **Tu extracto no trae IBAN**, así que el alta automática de cuenta no puede funcionar:
  **la cuenta corriente de MyInvestor tendrás que crearla a mano** por API.
- **Tampoco trae saldo**, así que `initialBalance` deja de ser decorativo: será **el
  único ancla** del saldo de esa cuenta. Si lo pones mal, todo el saldo queda desplazado
  por igual.

## 🟥 Lo que decidí yo y no me pediste (3, ninguna con consecuencia grave)

1. **Que el resultado diga explícitamente «aquí no hay IBAN»** en vez de callarse. No lo
   mencionaste; lo vi al mirar tu archivo real. Su única consecuencia es la de arriba.
2. **La lista de «ignorados»** para las extensiones que no son del extracto. No la
   pediste: sin ella, tus tres `.txt` saldrían como errores y llenarían el informe de
   ruido, o desaparecerían sin dejar rastro.
3. **Añadir a `docs/dar-de-alta-un-banco.md` el paso de crear el módulo de parser.** Es
   una línea de documentación que hoy falta; este banco es el primer caso que lo
   demuestra.

## ✅ Lo que ha cambiado desde que leíste esto por primera vez (nada que aprobar)

> Este spec se escribió el 2026-08-10. El 2026-08-11 se cerró la feature 11, que fija
> **una sola forma de salida para todos los parsers de banco**.

- **La incoherencia del importe 0 ya no existe.** Antes ponía aquí que el parser del otro
  banco seguía tratando el 0 como ingreso y que se resolvería más adelante: **la feature
  11 lo arregló**. Los dos bancos usan ahora la misma regla del signo. Nada que hacer.
- **Se cayó el campo que anunciaba «este banco no da saldo».** Yo proponía un
  `providesBalance: false`; la feature 11 decidió que basta con dejar el saldo a *«no hay
  dato»* en cada línea, porque el otro es el mismo hecho dicho dos veces. **Era una de
  mis propuestas y quedó decidida en contra: una cosa menos que revisar.**
- **Cada movimiento dice ahora en qué lugar del día va** (1 = el más antiguo de ese día),
  para poder ordenar bien los movimientos de una misma fecha. He comprobado en tu
  extracto que **MyInvestor exporta del más reciente al más antiguo** y el parser lo
  numera al revés en consecuencia. Es maquinaria interna: no cambia nada de lo que ves.
