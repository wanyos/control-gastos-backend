# Estado del histórico de cuentas y productos — 2026-08-24

> 🔒 **Ni un dato real en este archivo.** Aquí solo hay **recuentos y forma**: cuántos
> movimientos tiene cada banco, hasta qué mes llega y por qué vía entró. Ni un importe,
> ni un IBAN, ni el nombre de ninguno de sus productos, ni una fecha suya.

**Qué es esto:** la foto de **hasta dónde llega el histórico** el día que se terminó de
cargarlo, para no tener que volver a deducirlo de la base de datos. No es un test, no se
ejecuta y no se mantiene solo: si mañana entra otro año de un banco, este archivo queda
viejo y hay que tocarlo o borrarlo.

Todos los recuentos salen de una consulta directa a la base de datos ese día, no de
recordar qué se importó.

## Las cuatro cuentas corrientes

| Banco | Movimientos | Cubre desde | Hasta |
|---|---|---|---|
| N26 | 888 | enero de 2024 | agosto de 2026 |
| Bankinter | 354 | enero de 2024 | **julio de 2026** |
| Openbank | 201 | agosto de 2024 | agosto de 2026 |
| MyInvestor | 77 | agosto de 2025 | agosto de 2026 |

**1.520 movimientos en total.** Bankinter es el único que no llega al mes en curso: le
falta agosto de 2026.

### Por qué vía entró cada uno

Dos de los cuatro históricos **no los emite el banco en el formato que lee la app** y
entraron por un conversor de un solo uso, escrito fuera de `src/` a propósito para que
la app no gane un parser que solo se usa una vez:

- **Bankinter** — sus extractos mensuales son `.pdf`. Los convierte
  [`scripts/bankinter-pdf-a-xlsx.mjs`](../../scripts/bankinter-pdf-a-xlsx.mjs) al `.xlsx`
  que ya lee su parser. El signo de cada movimiento **se deduce del saldo corriente**,
  porque las columnas de cargo y abono no sobreviven a la extracción de texto.
- **MyInvestor** — su export anual es `.xlsx` y su parser lee `.csv`. Lo convierte
  [`scripts/myinvestor-xlsx-a-csv.mjs`](../../scripts/myinvestor-xlsx-a-csv.mjs),
  usando el saldo corriente que el `.xlsx` sí trae para verificar cada línea antes de
  tirarlo.
- **N26** y **Openbank** entraron por la descarga normal del banco, sin conversor.

Los dos conversores **paran en vez de escribir** si algo no cuadra: una línea cuyo
importe no case con el salto del saldo, una cadena que no termine en el saldo impreso en
la cabecera, o un mes cuyo saldo inicial no continúe al anterior.

## Los seis productos de inversión

| Producto | Serie | Cobertura |
|---|---|---|
| Cuenta remunerada (Trade Republic) | 25 fotos mensuales | desde la apertura hasta el mes en curso, **sin un solo hueco** |
| Cartera gestionada (MyInvestor) | 14 valoraciones | mensual y seguida durante once meses; **luego cinco meses sin foto** |
| ETF (MyInvestor) | 2 valoraciones | dos puntos sueltos |
| Fondo (MyInvestor) | 2 valoraciones | dos puntos sueltos |
| Dos depósitos (MyInvestor) | **sin serie, por diseño** | un depósito no fluctúa: sus condiciones son columnas del producto (ADR-012) |

### La cuenta remunerada: cerrada el 2026-08-24

Hasta ese día solo había **una** foto, la del mes en curso. El histórico entero entró de
golpe a partir del **extracto en `.pdf` desde la apertura**, que sí sobrevive a la
extracción de texto y trae el saldo corriente en cada línea.

De ahí salieron **25 archivos `.json`** con el formato de
[`docs/trade-republic-product-files.md`](../../docs/trade-republic-product-files.md), uno
por mes, verificados tres veces antes de subirse: la cadena de saldos del extracto, el
encadenado mensual, y la ecuación de cada archivo con el mismo criterio que aplica
[`trade-republic.product.parser.ts`](../../src/modules/trade-republic/trade-republic.product.parser.ts).
Comprobado después contra la base de datos: cada foto cuadra su ecuación, el saldo final
de cada mes es el inicial del siguiente, y el último coincide con el del extracto.

Dos decisiones de forma que se tomaron ahí y conviene no volver a discutir:

- **El mes de la apertura lleva archivo aunque no tenga abono de intereses.** Se salta
  la cadencia de «un archivo por abono» que dice el documento del formato, pero si no,
  el ingreso de apertura desaparece tragado por el saldo inicial del mes siguiente.
- **Un mes sin ningún movimiento no lleva archivo.** Serían cinco cifras repitiéndose.

Y un descuadre que el extracto sacó a la luz: el `openedAt` del único archivo que ya
existía **era falso**, escrito de memoria, y el extracto probaba que la cuenta ya tenía
movimiento casi un año antes. Como `openedAt` es una columna del producto que
[cada archivo reescribe al importarse](../../src/modules/investments/investments.service.ts#L270),
bastó con que los 25 dijeran lo mismo para corregirlo. **Un dato que solo sabe el humano
y que nadie puede validar es un dato que hay que cruzar con la primera prueba
documental que aparezca.**

### 🔴 La cartera gestionada tiene cinco meses sin valoración

Once meses seguidos y después el tramo de 2026 se rompe: **faltan cinco fotos
mensuales**. No se perdieron al importar — esos archivos **no existen en Drive**.

Y a diferencia de la cuenta remunerada, **este hueco no se puede reconstruir**: una
valoración es lo que valía la cartera **ese día**, y ese dato solo lo tenía la app del
banco en su momento. No hay extracto del que deducirlo.

**Se buscó y se cerró el mismo día (2026-08-24): los huecos se quedan.** Se probaron los
dos únicos documentos que el banco emite y ninguno sirve, así que **no hace falta volver
por estos caminos**:

- **El `.xlsx` de movimientos de la cartera** es su **cuenta de efectivo**: aportaciones,
  compras de fondo y un saldo corriente. Ese saldo es el **efectivo sin invertir**, no lo
  que vale la cartera. De él salen exactos dos de los cuatro campos de una valoración
  —lo aportado y el efectivo— y **nunca el valor de mercado**, que es obligatorio y es el
  único que importa. Media valoración con un valor inventado es peor que el hueco: el
  hueco se ve y el dato falso no.
- **El informe X-Ray** (Morningstar) es de **composición**: porcentajes por activo, país
  y sector, sin una sola cifra en euros de la cartera. Sus rentabilidades son
  **ponderadas por tiempo**, o sea calculadas para *borrar* el efecto de las aportaciones
  mensuales, así que no se pueden invertir para despejar el valor pasado sin conocer el
  rendimiento entre cada aportación y hoy. Saldría una estimación, no un dato.

La serie se queda con sus 14 puntos, que siguen sirviendo para ver la evolución.

## Lo que sigue abierto

- **Revolut**, aparcado desde el 2026-08-20. Su `.csv` se baja en cada ingesta y sale
  como `skipped` en cada importación: ni se importa ni se mueve. Ver la tabla de bancos
  del [roadmap](../../docs/roadmap.md).
- **Bankinter no llega a agosto de 2026.**
- **Los 1.520 movimientos están todos en `pending_review` y sin categoría.** Nada los
  pasa a `confirmed` todavía (cabo suelto 3 del roadmap).

## La decisión sobre `initialBalance` (2026-08-24)

El humano lo dejó dicho al cerrar el histórico:

> «El balance inicial de las cuentas o productos de inversión igual no es muy necesario
> tenerlo, puede ser complicado obtener esos datos. Lo que más vale es tener esos totales
> a día de hoy; el histórico sirve para tener una visión del incremento o decremento de
> mis cuentas personales.»

Traducido a lo que significa para el backend: **el histórico se usa como serie, no como
saldo absoluto**. Lo que tiene que ser correcto es el **total de hoy** y la **variación
entre dos fechas**, y ninguna de las dos cosas necesita saber qué había en la cuenta
antes del primer movimiento importado.

Las cuatro cuentas tienen hoy `initialBalance` a `0`, así que **el saldo calculado de
una cuenta está desplazado** por lo que hubiera antes de su primer movimiento. Ese
desplazamiento es **constante por cuenta**, y por eso no toca la variación: se cancela al
restar dos fechas.

**Consecuencia práctica:** perseguir el saldo de apertura de cada banco deja de ser un
deber pendiente. Lo que sí importa es que **el total de hoy** cuadre, y eso se ancla en
el saldo que cada extracto trae en su preámbulo, no en el de apertura.
