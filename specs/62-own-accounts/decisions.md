# Decisiones — F62 `own-accounts`

> **Esto es lo único que necesitas leer para aprobar.** Los otros tres archivos
> (`requirements` / `design` / `tasks`) son material del implementer y del reviewer.
> Si algo de aquí no te convence, dilo y se cambia ahí; no hace falta que los abras.

**Qué hace:** una tabla con tus cuentas y productos de cualquier banco (nombre, banco, número, tipo, fechas y los textos con los que aparecen) y una lista con las formas en que aparece tu nombre. Un movimiento cuyo concepto contiene una de esas formas o uno de esos textos deja de contar en las tres sumas (movimientos, resumen del mes y coste mensual), sin marcarlo. **No toca** importes, saldos, parejas de traspaso ni tus marcas a mano: no se escribe nada en los movimientos salvo cuando tú resuelves uno dudoso.

**Medido hoy, solo lectura, con unos textos de prueba** (tu nombre completo, los nombres de tus bancos, los de la cartera y dos fondos): ningún movimiento que hoy cuenta dejaría de contar; ninguna de las 39 parejas cambia; de los **55** marcados a mano (no 53), 37 los reconocería la tabla y 18 solo por el nombre del banco. Con tus textos reales **no lo he comprobado**: dependen de lo que escribas.

---

## 🔴 Confirma o corrige (6)

| # | Decisión (mía) | Alternativa si no te gusta |
|---|---|---|
| 1 | **Queda dudoso solo si lo único que lo nombra es el nombre de uno de tus bancos** (p. ej. un texto «Trade Republic» en tu cuenta de Trade Republic). Con tu nombre o con otro texto tuyo, es tuyo sin preguntar. Una transferencia de Bankinter a Trade Republic te saldrá dudosa cada vez. | Una casilla por cuenta, «en este banco solo tengo cuentas yo»: con ella marcada, su nombre basta y no queda dudoso. Un campo más. |
| 2 | **Mientras está dudoso, cuenta** como gasto o ingreso normal, hasta que lo resuelvas. | Que no cuente hasta resolverlo: las sumas cambiarían sin que lo hayas decidido. |
| 3 | **Tu nombre: escribes tú las formas** (completo, apellidos delante, recortado por el banco). Solo vale la forma entera: un familiar con tus mismos apellidos cuenta como otra persona, sin quedar dudoso. | Que coincidir con tus dos apellidos deje dudoso: cada bizum a un familiar con tus apellidos te saldría para resolver. |
| 4 | **Los 55 marcados a mano se quedan como están** y la marca sigue mandando; un marcado o una pierna de un traspaso nunca queda dudoso. | Quitar la marca a los 37 que ya reconoce la tabla. No cambia ninguna suma. |
| 5 | **La tabla va aparte**: no se enlaza con tus cuentas importadas ni con tus productos, y la rellenas tú entera (incluidas las que ya existen). | Que se rellene sola al crearla con tus 5 cuentas y 9 productos, sin textos. Dos requisitos más. |
| 6 | **Nombres en código, te los propongo:** tabla `OwnAccount` con sus textos (`OwnAccountText`), lista `AccountHolderName`, rutas `/api/own-accounts` y `/api/own-accounts/holder-names`, y en cada movimiento `ownership` (`own` = tuyo por la tabla, `doubtful` = dudoso, `mine` / `not_mine` = lo resolviste tú) y `ownershipDecision` (lo que resolviste). | Los nombres que digas. |

## ✅ Ya las cerraste tú (4)

- **No se cuentan todas las transferencias como gasto e ingreso**: se reconoce lo tuyo con la tabla.
- **Nunca por el nombre del banco**: el campo «banco» de la tabla no sirve para reconocer nada.
- **Lo que no está claro, dudoso, y lo resuelves tú**; tu decisión manda sobre la tabla y se puede deshacer.
- **Vale para lo que ya está en la base y para lo que entre**, sin marcar nada en cada importación.

## 🧪 Cómo se comprobará que está hecho

| Tu frase de «cómo sé que está bien» | Se comprueba ejecutando |
|---|---|
| Doy de alta, cambio y consulto cuentas y textos | Tests que crean, cambian, rechazan datos malos y guardan las formas de tu nombre |
| Lo que nombra una cuenta mía o a mí no cuenta | Un test de la regla y otro que mira las tres sumas |
| Una transferencia a otra persona cuenta aunque sea a un banco mío | Un test con otra persona en un banco de la tabla |
| Lo no claro queda dudoso, lo veo, lo resuelvo y se respeta | Tests del dudoso, del filtro de dudosos y de tu decisión en las tres sumas |
| Vale para lo que ya está y para lo que entra al importar | Un test con un movimiento anterior a la tabla y otro importado después |
| Los traspasos emparejados siguen igual | Un test que compara parejas, importes, saldos y marcas con y sin la tabla |
| `docs/api-contract.md` lo describe | Un test que lee el contrato |
| (añadido) Un movimiento de depósito sigue sumando su interés | Un test de un vencimiento cuyo concepto nombra una cuenta tuya |
| (añadido) Lo que ya funciona sigue igual | `pnpm test` entero |

## ⚙️ Técnicas — decididas, no necesitan tu visto bueno (5)

1. **Se calcula al leer**, como la regla de depósitos: cambiar un texto vale al momento, sin repasar la base.
2. **Se compara por palabras enteras, sin mayúsculas, acentos ni signos**: «ING» no casa dentro de «ingreso»; un texto de menos de 3 letras se rechaza.
3. **El número de cuenta y las fechas son solo para ti**: ningún concepto trae número de cuenta, y las fechas solas no deciden.
4. **Tipos de la tabla:** corriente, remunerada, inversión, depósito, cripto, otro.
5. **No se borran filas** (pediste alta, cambio y consulta): una cuenta que no quieras, déjala sin textos.

## 📌 Consecuencias que te tocan a ti (no son código)

- **Dar de alta tus cuentas y productos con sus textos**, y las formas de tu nombre. Hasta entonces no cambia nada.
- **No pongas como texto el nombre de un banco donde tus hijas tienen cuenta** salvo que aceptes que todo lo que lo nombre salga dudoso.
- **La sesión del frontend** tiene que hacer la pantalla de la tabla y la de dudosos para resolverlos.

## ⚠️ Incoherencias conocidas que se heredan

- **Si el banco recorta tu nombre de una forma que no has escrito**, ese movimiento cuenta como de otra persona sin avisar.
- **Resolver dudosos es de uno en uno**: el cambio de varios a la vez no lleva tu decisión en esta feature.

---

## ✍️ Aprobación (2026-10-20)

El humano repasó los seis puntos 🔴 uno a uno con el leader y los confirmó tal como están: 1 (solo el nombre de un banco → dudoso; descartada la casilla «en este banco solo tengo cuentas yo»), 2 (el dudoso cuenta hasta que lo resuelve), 3, 4 («con el sistema anterior eran dudosos y los resolví»), 5 y 6 (nombres aprobados). Sobre el 5 añadió un paso **después** de la feature, sin código: el leader saca de la base lo que ya se sabe de cada cuenta y producto, se lo enseña, el humano completa lo que falte (cuentas no importadas, fechas, textos, formas de su nombre) y, con su visto bueno, el leader lo inserta con las rutas de `/api/own-accounts`.
