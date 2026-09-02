# Decisiones — F32 `balance-reconciliation`

> **Esto es lo único que necesitas leer para aprobar.** Los otros tres archivos
> (`requirements` / `design` / `tasks`) son material del implementer y del
> reviewer. Si algo de aquí no te convence, dilo y se cambia ahí; no hace falta
> que los abras.

**Qué hace:** al importar un archivo, la app comprueba sus propias sumas contra
lo que dice el archivo y, si no cuadran, lo escribe en el informe de esa
importación con la cuenta, la fecha, los dos números y la diferencia. **No** toca
el saldo de ninguna cuenta, **no** hace fallar ningún archivo, **no** añade
columnas a la base y **no** cambia lo que devuelve `/api/accounts`.

---

## 🔴 Confirma o corrige (5)

| # | Decisión | Alternativa si no te gusta |
|---|---|---|
| 1 | **Tolerancia cero: hay descuadre en cuanto la diferencia no es exactamente 0,00.** Los importes se guardan y se comparan al céntimo, no hay redondeos que absorber, y tu comprobación a mano del 25 de agosto salió limpia al céntimo en las dos formas. | Un margen de ±0,01: dejarías de ver justo el error de un céntimo, que es el que produciría un fallo de redondeo. |
| 2 | **El aviso aparece solo en el informe de la importación**, que es donde tú dijiste que querías verlo. `/api/accounts` no cambia. | Enseñarlo también en `/api/accounts`: obliga a guardar el descuadre en una casilla nueva de la cuenta, y esa casilla se queda vieja en cuanto entra otro archivo — un aviso viejo que dice «hay descuadre» es peor que no tenerlo. |
| 3 | **Donde no hay dos números que comparar, no se dice nada** (una línea sin saldo en medio, o el primer archivo de una cuenta, que es el que la ancla). No es un descuadre: es que esa vez no hay comprobación. | Avisar también de esos casos: te llenaría el informe de avisos que no significan que nada esté mal. |
| 4 | **Se comprueba el archivo que estás importando, no todo el histórico de la cuenta.** | Repasar todos los movimientos guardados en cada importación: te repetiría el mismo aviso en cada ejecución para siempre y convertiría cada importación en un barrido completo. |
| 5 | **Openbank se comprueba dos veces**, porque sus archivos traen las dos cosas: línea a línea (la cadena corta dentro del archivo) y contra el saldo de la cabecera (la cadena larga desde el saldo de partida). | Hacerle solo la de línea a línea: más barata, pero deja sin vigilar justo la cadena larga, que es la que tú miras todos los días. |

## ✅ Ya las cerraste tú (4)

- **Un descuadre no tumba la importación.** El archivo entra igual y los demás siguen.
- **El aviso no cambia el saldo que ves.** Donde manda el archivo, sigue mandando el archivo.
- **Sin la línea `saldo;` escrita a mano, el archivo se importa igual** y esa vez no hay comprobación.
- **La feature va partida en dos**: la F31 produce el número, esta lo comprueba.

## ⚙️ Técnicas — decididas, no necesitan tu visto bueno (4)

1. **Se usa tu palabra, «descuadre»** (la escribiste tú en la ficha de la
   feature), y en el código su traducción literal al inglés. **La palabra
   «testigo» no se usa en ningún sitio**: está en la lista de palabras sin
   aprobar de `docs/vocabulario.md`.
2. **Ningún banco se nombra en el código.** Qué comprobación se hace lo decide lo
   que trae el archivo, no de qué banco es. Un banco nuevo que traiga saldo queda
   comprobado sin tocar nada.
3. **No hay migración ni columna nueva.** La comprobación no guarda estado: se
   hace y se cuenta en el informe.
4. **El informe añade un contador del total de descuadres de la ejecución**, para
   que un cero cierre el tema de un vistazo sin leerse archivo por archivo.
   ⚠️ *Efecto:* el frontend leerá dos campos nuevos en la respuesta de importar,
   pero no en `/api/accounts`.

## 📌 Consecuencias que te tocan a ti (no son código)

- **Los descuadres solo se ven cuando importas.** Si un mes no importas nada, no
  hay comprobación ese mes: no hay ningún aviso de fondo mirando por su cuenta.
- **Lanzar una importación (o la reimportación local, sin tocar Drive) al cerrar
  la feature** y mirar el contador. Es la prueba real de que esto hace lo que
  querías.
- **Decidir qué hacer el día que salga el primero.** Esta feature detecta y te lo
  cuenta; corregir un descuadre real no lo hace, y a día de hoy no sabemos cómo
  querrías corregirlo.
- **El frontend no se toca en esta sesión.**

## ⚠️ Incoherencias conocidas que se heredan

- **La comprobación no cruza la frontera entre dos archivos.** Si el último
  movimiento de un extracto y el primero del siguiente no encajan, ninguna de las
  dos comprobaciones lo ve. La del saldo de la cabecera sí lo vería en N26 y
  MyInvestor, porque suma desde el saldo de partida; en Bankinter y Openbank, no.
- **No he comprobado el estado actual de tus datos.** El spec se ha escrito
  leyendo el código que dejó la F31, no consultando la base: para eso haría falta
  levantar Docker con el contenedor `gastos-postgres` y mirar las cuatro cuentas.
