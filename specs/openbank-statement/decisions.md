# Decisiones — F19 `openbank-statement`

> **Esto es lo único que necesitas leer para aprobar.** Los otros tres archivos
> (`requirements` / `design` / `tasks`) son material del implementer y del reviewer.
> Si algo de aquí no te convence, dilo y se cambia ahí; no hace falta que los abras.

**Qué hace:** el backend aprende a leer el fichero de Openbank tal y como te lo
descargas —se llama `.xls` pero por dentro es una página HTML—, mete sus 200
movimientos (dos años de histórico) y saca el saldo de la cuenta del propio
fichero. **No toca** los parsers de Bankinter, MyInvestor ni N26, **no** guarda el
saldo que el fichero trae después de cada movimiento y **no** persiste nada en la
base de datos: esta feature es parser y volcado, como las anteriores.

---

## 🔴 Confirma o corrige (6)

| # | Decisión | Alternativa si no te gusta |
|---|---|---|
| 1 | **Leemos el HTML nosotros, sin añadir ninguna librería.** La tabla la genera una máquina y es plana; el lector son ~40 líneas dentro del módulo de Openbank. | Añadir una dependencia de HTML (`cheerio`): menos código nuestro, pero una librería más que mantener y actualizar para leer una sola tabla. |
| 2 | **La regla «siempre UTF-8» se acota, no se rompe:** lo que **escribes tú** sigue teniendo que ir en UTF-8 (MyInvestor no cambia ni una línea), y lo que **emite el banco** lo lee su parser con la codificación de ese banco. Openbank se lee en cp1252 y queda escrito en un ADR nuevo. | Que tú reguardes el fichero en UTF-8 cada mes antes de subirlo: cero código, pero es el paso manual mensual que esta feature venía a quitar. |
| 3 | **Si algún día el fichero deja de declarar su codificación (`iso-8859-1`), se rechaza entero** en vez de leerlo igual. Sin esto, el día que Openbank pase a UTF-8 los acentos entrarían corruptos **sin dar ningún error**: es el daño de la F17 otra vez, pero al revés. | Leerlo siempre como cp1252 pase lo que pase: nunca falla nada… hasta que un mes entran 200 conceptos con la tilde rota y nadie se entera. |
| 4 | **El IBAN lo escribes como primera línea del fichero, en un comentario HTML:** `<!-- iban;ES9121000418450200051332 -->` (ese IBAN es el de ejemplo de la documentación, no el tuyo). Es la primera línea, se ve al abrirlo, y Excel y el navegador lo ignoran, así que el fichero sigue abriéndose igual. | Meterlo como una fila nueva dentro de la tabla: te obligaría a escribir HTML bien formado a mano, y equivocarse es fácil. |
| 5 | **Del preámbulo solo se lee la línea `Saldo:`.** Fecha de descarga, número de cuenta, descripción y titular se ignoran **en silencio**: no aparecen como «filas sin parsear». | Reportarlas: tendrías cuatro avisos fijos en cada fichero, y `unparsedRows` dejaría de servir para lo que sirve (mirar lo que sí es raro). |
| 6 | **La divisa de cada movimiento queda vacía**, porque el fichero no tiene columna de divisa (solo el saldo del preámbulo lleva «EUR» pegado). | Rellenar «EUR» en los 200 movimientos: es cierto hoy, pero sería un dato inventado por nosotros, y el contrato dice que lo que el fichero no trae va vacío. |

## ✅ Ya las cerraste tú (4)

- **El IBAN no se calcula del número de cuenta.** Se puede, es determinista, y aun así lo escribes tú una vez.
- **El saldo tras cada movimiento no se guarda.** Openbank es el único banco que lo da; sigue vacío como en los demás y queda anotado en el informe para el día que lo decidas.
- **Entra el histórico entero**, dos años y 200 apuntes, sin recorte por fecha.
- **Openbank no hereda nada de otro banco:** módulo propio, aunque el formato de fechas e importes coincida con MyInvestor.

## ⚙️ Técnicas — decididas, no necesitan tu visto bueno (5)

1. **Módulo nuevo `src/modules/openbank/`** con la misma forma que los otros: parser, formato, servicio, ruta y fixtures.
2. **`POST /api/parser/openbank`** y una línea en el registro de parsers, que es lo que hace que `POST /api/import` deje de saltarse tus `.xls`.
3. **El orden del fichero es de más reciente a más antiguo** (medido): la posición dentro del día la calcula el helper compartido de siempre.
4. **Una fila que parece un movimiento y no se entiende se reporta con su número de línea**, nunca se descarta en silencio.
5. **Los fixtures de los tests son HTML inventado a mano.** Ni un dato del fichero real llega al repositorio, y el guardián que lo comprueba se ejecuta antes de cerrar.

## 📌 Consecuencias que te tocan a ti (no son código)

- **Escribir el comentario del IBAN una sola vez**, en el primer fichero de Openbank que subas. Los siguientes ya no lo necesitan: la cuenta ya existirá.
- **No vuelvas a guardar el fichero con Excel.** Ábrelo con el Bloc de notas para meter esa línea; Excel lo reescribiría entero y dejaría de ser lo que el banco dio.
- **El saldo de Openbank NO lo escribes tú** (a diferencia de MyInvestor): sale del propio fichero.
- **Queda pendiente, para otro día:** decidir si se empieza a guardar el saldo tras cada movimiento. Openbank es el único banco que te lo da.

## ⚠️ Incoherencias conocidas que se heredan

- **Dos bancos, dos codificaciones distintas**, a propósito: MyInvestor rechaza todo lo que no sea UTF-8 y Openbank exige cp1252. Es lo que dice el punto 🔴 2; el ADR nuevo lo deja escrito para que dentro de seis meses no parezca un descuido.
- **Nada se persiste todavía.** El extracto se parsea y se vuelca a JSON local; el saldo de la cuenta sigue sin llegar a la base de datos, igual que en MyInvestor desde la F16.
