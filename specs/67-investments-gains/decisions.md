# Decisiones — F67 `investments-gains`

> **Esto es lo único que necesitas leer para aprobar.** Los otros tres archivos
> (`requirements` / `design` / `tasks`) son material del implementer y del reviewer.
> Si algo de aquí no te convence, dilo y se cambia ahí; no hace falta que los abras.

**Qué hace:** una consulta nueva, solo de lectura, que da por cada fondo, ETF, cartera gestionada y depósito cuánto metiste, cuánto vale, cuánto ganas o pierdes en € y en % desde que lo abriste y de qué fecha es el dato; los vivos y los cerrados en dos listas, y arriba el total de los vivos. **No toca** `GET /api/investments/overview`, `GET /api/investments/deposits` ni `GET /api/net-worth`, ni guarda nada.

---

## ✅ Aprobado por el humano el 2026-11-04

Los dos puntos siguientes, aprobados tal cual. Sobre el 2: «a día de hoy cualquier depósito cerrado antes de tiempo te retorna cero»; si algún banco pagara algo por un cierre anticipado, se tratará entonces.

### Puntos que estaban por confirmar (2)

| # | Decisión | Alternativa si no te gusta |
|---|---|---|
| 1 | **(mía) Cómo se reparte por días la ganancia de un depósito vivo:** ganancia esperada × días desde que lo abriste hasta hoy ÷ días de todo el plazo, en días naturales y redondeada al céntimo (medio céntimo, hacia arriba). Lo que vale hoy = capital + esa ganancia; su % = esa ganancia ÷ capital. El día que lo abres gana 0. | Calcularla con la TAE a interés compuesto: más fina en teoría, pero ya no cuadra con la ganancia esperada que escribes en el archivo. |
| 2 | **(tuya, a confirmar) Un depósito cancelado antes de vencer sale con ganancia 0, no vacía.** Lo único que no encaja: la consulta no mira el extracto, así que si algún día el banco sí te pagara algo al cancelar, aquí seguiría saliendo 0. | Que salga vacía con el motivo «cancelado»: no afirma ninguna cifra, pero no se ve que ganó 0. |

## ✅ Ya las cerraste tú (11)

- **Ninguna cuenta sale**, tampoco las remuneradas guardadas como producto, sean del banco que sean.
- **Los cerrados se ven aparte y no suman.** Cada uno sale con cuándo se cerró, su valor y lo que ganó o perdió.
- **El total es solo de lo vivo.**
- **Un depósito vivo es inversión:** su capital cuenta como invertido y su ganancia, la esperada repartida por días, suma al total.
- **Un depósito cancelado antes de vencer va a cerrados y su ganancia no cuenta.**
- **Las fotos se usan tal como las escribiste**, sin recalcular nada; un fondo usa su última foto aunque sea de otro mes.
- **El % del total = ganancia total ÷ lo invertido de los vivos que entran en esa ganancia.**
- **Una consulta nueva**, sin parámetros y a fecha de hoy; la del mes no se toca.
- **Un depósito cuenta como cerrado el día que vence**, aunque no hayas escrito su cierre.
- **«Lo que vale ahora» de un fondo es su valor de mercado**, con el efectivo sin invertir aparte.
- **Los nombres en código** (`GET /api/investments/gains`, `live`, `closed`, `currentValue`, `valuedAt`, `closedOn`, `reason` y los motivos), sin el motivo «cancelado», que ya no hace falta. Nada de series, y `Net Worth` no cambia.

## 🧪 Cómo se comprobará que está hecho

| Tu frase de «cómo sé que está bien» | Se comprueba ejecutando |
|---|---|
| Fondo con la última foto de un mes anterior | El test con una foto de hace dos meses: sale con ella y su fecha |
| Las cuentas no salen | El test con una cuenta remunerada con fotos: no aparece ni suma |
| Depósito vivo: reparto por días, capital invertido, suma al total | El test del reparto (a mitad de plazo, el primer día) y el test del total |
| Depósito cancelado | El test que lo ve en cerrados con ganancia 0 y fuera del total |
| Cada cerrado con fecha, valor y ganancia | Los tests del fondo vendido, del depósito vencido y del cancelado |
| Depósito vencido con y sin cobro | Dos tests: con el cobro, lo ganado; sin él, vacío con el motivo |
| Fondo vendido | El test que lo ve en cerrados con su última foto hasta el cierre y fuera del total |
| Cifra que no se puede sacar | El test de los tres huecos de un fondo: vacío, motivo y listado en el total |
| Total solo de vivos y fórmula en el contrato | El test de la suma y el % del total, y el test que lee `docs/api-contract.md` |
| Nada se escribe | El test que compara la base antes y después |
| (añadido) La ruta responde y lo de siempre sigue igual | Un test de la ruta y `pnpm test` entero |

## ⚙️ Técnicas — decididas, no necesitan tu visto bueno (5)

1. **Lo ganado por un depósito vencido se saca con la misma búsqueda del cobro que ya usa la lista de depósitos**, llamándola, no copiándola.
2. **El % de un depósito es lo ganado ÷ su capital**, a dos decimales. ⚠️ *Efecto:* no es la TAE: uno de 3 meses al 2,5 % sale con algo más de 0,6 % al vencer.
3. **El % del total se redondea a dos decimales**, y solo sale vacío si no hay ningún producto vivo que sumar.
4. **Un depósito vivo sin fecha de apertura o sin ganancia esperada** sale sin cifra, con el motivo «faltan condiciones», y fuera del total.
5. **Orden:** vivos del más antiguo al más nuevo; cerrados del cerrado más reciente al más antiguo.

## 📌 Consecuencias que te tocan a ti (no son código)

- **Para que un fondo vendido salga en cerrados, su archivo tiene que llevar la fecha de cierre**: dejar de subirlo no lo cierra.
- **Lo ganado por un depósito vencido solo aparece con el extracto de MyInvestor del día del vencimiento importado**; mientras no, sale sin cifra con `maturity_not_found`.
- **La sesión del frontend** vuelve a lanzar el spec de su feature 40 cuando esté publicada la sección nueva del contrato.

## ⚠️ Incoherencias conocidas que se heredan

- **Un depósito vencido sin cierre escrito** sale aquí en cerrados, pero `Net Worth` lo sigue sumando con su aviso de «vencido sin cerrar». A propósito: allí importa dónde está el dinero; aquí, si el producto terminó.
- **Lo que vale hoy un depósito vivo** es aquí capital + ganancia repartida, y en `Net Worth` solo el capital: no coinciden hasta que vence.

## 🔄 Cambios del 2026-11-04

- (leader, tras la revisión) El spec tiene 16 requisitos, uno más de los ~15 habituales: el 16 nació en la puerta al sacar el depósito cancelado del de motivos. No cambia nada de lo aprobado.

- Un depósito vivo ya no gana 0: gana la esperada repartida por días, su capital cuenta como invertido y los dos suman al total. La fórmula del reparto es el nuevo punto 🔴 1.
- Un depósito cancelado va a cerrados con ganancia 0 (antes: sin cifra); queda como punto 🔴 2 por si prefieres vacía.
- Cada cerrado sale con fecha de cierre, valor y ganancia: comprobado para fondos, ETF, carteras, depósitos vencidos y cancelados.
- Las cinco decisiones que aprobaste pasan a «Ya las cerraste tú»; el motivo «cancelado» sale de la lista.
- El % del total ya no sale vacío por haber solo depósitos (técnica 3), y se añade la diferencia con `Net Worth` en el valor de un depósito vivo.
