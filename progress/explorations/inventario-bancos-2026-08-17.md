# Inventario de bancos y diagnóstico de sus ficheros (2026-08-17)

> Exploración, no feature. El humano creó en Drive las carpetas de los bancos que
> va a tener y dejó en cada una **un fichero de muestra** con el extracto que ese
> banco le deja conseguir. Esto es la lectura de esas muestras: qué bancos hay, en
> qué formato viene cada uno y qué problemas tiene cada formato antes de escribir
> un parser.
>
> 🔒 **Sin datos reales.** Aquí no se transcribe ningún importe, IBAN, nombre ni
> concepto de los ficheros. Solo la **forma**: extensiones, codificación,
> separadores, columnas y recuentos. Las muestras viven en `var/drive-read/`, que
> está gitignoreado. El guardián de la F14 se pasó en verde tras escribir esto.

## Cómo se leyó

1. `docker compose ps` → Postgres sano · `pnpm run dev` → `:3000`.
2. `GET /health/drive` → `{"status":"ok","drive":"up"}`.
3. `GET /api/ingestion/pending` → **10 pendientes en 5 bancos**.
4. `POST /api/ingestion/process` → **10/10 descargados, 0 fallidos**.
5. Inspección de cada copia local (bytes, codificación, estructura). **No se
   ejecutó `POST /api/import`**: habría movido ficheros a `procesados/` en Drive.

Que los 10 bajen sin un fallo ya dice algo: el camino Drive → local funciona con
cualquier formato, porque descarga bytes sin mirarlos. Los problemas empiezan
justo después.

## El inventario: 6 bancos

| Banco (carpeta) | Fichero de muestra | Formato real | Parser hoy | Veredicto |
|---|---|---|---|---|
| `bankinter` | export de la cuenta | `.xlsx` de verdad | ✅ F6/F7 | funciona |
| `myinvestor` | extracto + 5 productos | `.csv` con `;` + `.json` | ✅ F10/F13/F15/F16/F17 | funciona, con preámbulo manual |
| `N26` | export de la cuenta | `.csv` con `,` y comillas | ❌ | **el más sano de los nuevos** |
| `openbank` | «movimientos» | `.xls` que **no es un `.xls`** | ❌ | hay que decidir formato |
| `revolut` | export de la cuenta | `.csv` con `,` | ❌ | **la muestra está vacía** |
| `trade-republic` | extracto | `.pdf` | ❌ | el caso caro |

Eso son **6 bancos**, no ~7: el inventario de `docs/ideas.md` deja de estar en
blanco y la E4 deja de estar bloqueada. Quedan **4 parsers** por escribir, y no
cuestan lo mismo ni de lejos.

---

## 🟢 N26 — `.csv`, y es el que mejor viene

- **Codificación:** ASCII puro, **cero bytes > 127** en todo el fichero. No hay
  el problema de la F17 aquí, pero eso es suerte de esta muestra: en cuanto un
  comercio tenga una tilde habrá bytes altos, así que su parser descodifica con
  `decodeUtf8Strict` igual que el de MyInvestor.
- **Separador:** coma, **no** `;`. Campos entrecomillados solo cuando hace falta,
  y hay comas dentro de las comillas → **no vale partir por `,`**: necesita un
  lector de CSV con comillas de verdad, que es la primera vez que este repo lo
  necesita (Bankinter es binario y MyInvestor parte por `;`).
- **Números:** **punto decimal** y sin separador de miles. Al revés que
  MyInvestor. El signo va en el importe (negativo = gasto), que encaja directo
  con `deriveMovementTypeFromAmount`.
- **Fechas:** ISO `AAAA-MM-DD` ya, sin conversión.
- **Cabecera:** 11 columnas, en inglés. Descritas una a una:

  | # | Columna | Qué es |
  |---|---|---|
  | 1 | `Booking Date` | la fecha contable; alimenta `operationDate` del contrato |
  | 2 | `Value Date` | la fecha de valor; alimenta `valueDate` (difiere de la anterior en 17 de 90 filas, así que no es redundante) |
  | 3 | `Partner Name` | la contraparte; es lo único parecido a un concepto |
  | 4 | `Partner Iban` | el IBAN **del otro**, vacío en 88 de 90 |
  | 5 | `Type` | tipo del banco: 3 valores distintos en la muestra |
  | 6 | `Payment Reference` | concepto libre, relleno solo en 2 de 90 |
  | 7 | `Account Name` | alias de la cuenta, constante |
  | 8 | `Amount (EUR)` | el importe → `amount` |
  | 9 | `Original Amount` | importe en divisa original |
  | 10 | `Original Currency` | divisa original, vacía en 2 filas |
  | 11 | `Exchange Rate` | tipo de cambio, vacío en esas mismas 2 |

- **Volumen de la muestra:** 90 movimientos de mes y medio. Todas las filas
  tienen las 11 columnas: ninguna fila rota.

### 🔴 Los dos problemas de N26

1. **No trae el IBAN de la cuenta propia.** Trae el del *otro*, que no sirve.
   Mismo caso que MyInvestor → hace falta la línea de preámbulo `iban;…` escrita
   a mano una vez. Ojo: **este CSV usa coma**, así que meter una línea
   `iban;ES…` mezcla dos dialectos en el mismo fichero. Es una decisión de
   diseño, no un detalle (ver §Decisiones abajo).
2. **No trae saldo de la cuenta ni saldo por movimiento.** Ni columna `balance`
   ni fila de cierre. `accountBalance` saldría de la misma vía manual que en
   MyInvestor (F16), y `balance` por línea es `null` para siempre.

### ⚪ El nombre de la carpeta

La carpeta en Drive se llama **`N26`, en mayúsculas**. El importador la normaliza
(`normalizeBankName` → `n26`, [`import.service.ts:180`](../../src/modules/import/import.service.ts#L180)),
así que **no rompe nada**. Pero la copia local se escribe con el nombre crudo
([`ingestion.service.ts:92`](../../src/modules/ingestion/ingestion.service.ts#L92)),
así que en disco queda `var/drive-read/N26/` mientras el módulo lo buscará como
`n26`: en Windows da igual, en Linux no. **Renombrar la carpeta de Drive a `n26`**
cuesta diez segundos y cierra el tema.

---

## 🟠 Openbank — el `.xls` que no es un `.xls`

Este es el hallazgo gordo. El fichero se llama `.xls` y **no es un Excel**: es una
**página HTML** con una sola `<table>` dentro, guardada con extensión `.xls`
porque Excel la abre igual. Es un truco viejo y muy común en la banca española.

Consecuencias, en orden:

1. **`exceljs` no puede leerlo.** La dependencia que usa Bankinter para su `.xlsx`
   de verdad falla aquí: no hay ZIP, no hay OOXML, no hay hoja. Un parser de
   Openbank hecho «como el de Bankinter» no arranca.
2. **Está en cp1252, no en UTF-8**, y el fallo está medido: al decodificarlo como
   UTF-8 revienta en un byte concreto. O sea que la doctrina de la F17 aplica…
   salvo que aquí **no es un error del humano**: es lo que emite el banco. La
   guardia de la F17 rechazaría el fichero tal cual sale de Openbank, todos los
   meses.
3. **El HTML sí es regular y muy parseable**: 212 `<tr>`, de las que **200 son
   movimientos** con 5 celdas fijas, más un preámbulo de 6 filas etiquetadas
   (etiqueta + valor) y una fila de cabecera.

Lo que trae, que es más de lo que trae ningún otro:

- **Preámbulo:** fecha de descarga, **número de cuenta** (en formato CCC de 20
  dígitos, **no IBAN**), descripción del producto, titular y **saldo de la
  cuenta**. Es decir, Openbank **sí da el saldo** sin que el humano lo escriba.
- **Movimientos:** fecha de operación, fecha de valor, concepto, importe y
  **saldo tras el movimiento**. Es el único banco de los seis que reporta
  `balance` por línea, que hoy es `null` en los dos parsers existentes por ADR-013.
- **Formato español:** fechas `DD/MM/AAAA`, importes con punto de miles y coma
  decimal. Igual que MyInvestor.
- **Profundidad:** 200 movimientos que se remontan a **agosto de 2024**. Es un
  histórico de dos años, no el mes.

### Las tres decisiones que abre Openbank

1. **¿Se le enseña al backend a leer HTML, o el humano convierte el fichero?**
   Leer el HTML exige una dependencia nueva (un parser de HTML) o una lectura por
   expresiones regulares, que es frágil pero suficiente para una tabla tan
   regular. Convertirlo a CSV a mano cada mes es trabajo recurrente y es
   exactamente el tipo de paso manual que ya nos ha costado dos incidencias (la
   coma decimal y el cp1252 de MyInvestor). **Recomendación: leerlo tal cual.** El
   fichero es lo que el banco da; que el backend se coma la fealdad una vez es más
   barato que un ritual mensual.
2. **El cp1252 choca de frente con la F17.** La regla «el fichero se guarda en
   UTF-8 siempre» se escribió para ficheros que el humano edita. Aquí no edita
   nada: el banco emite cp1252. Habrá que decir en algún sitio que **la exigencia
   de UTF-8 es del texto que escribe el humano, no del que emite el banco**, y que
   el parser de Openbank declara su codificación de origen. Esto toca `docs/`,
   no solo código.
3. **El número de cuenta es CCC, no IBAN**, y el importador **nunca crea una
   cuenta sin IBAN**. Del CCC español se puede derivar el IBAN de forma
   determinista (es un cálculo cerrado), o se escribe el IBAN a mano una vez, como
   en MyInvestor. Lo segundo es una línea de runbook; lo primero es código nuevo
   que hay que probar. **Recomendación: a mano, una vez.**

---

## 🔴 Revolut — la muestra está vacía

El fichero tiene **103 bytes: la línea de cabecera y nada más**. Cero
movimientos.

- Sí se sabe la **forma**: UTF-8 correcto, separador coma, 10 columnas en
  castellano, y entre ellas hay **una de saldo** y una de **comisión** que ningún
  otro banco trae, más un campo de **estado** (que en Revolut distingue el
  movimiento confirmado del pendiente: eso hay que mirarlo, importar un pendiente
  como si fuera firme es un error de datos).
- Pero **no se puede escribir el parser con esto**. Sin una sola fila no se sabe
  cómo escribe las fechas (¿llevan hora?), ni si el decimal es punto o coma, ni
  qué valores toma el estado, ni cómo marca el signo.

**Lo que le toca al humano:** volver a exportar de Revolut **con movimientos
dentro** (un mes cualquiera basta) y resubirlo. Hasta entonces Revolut queda
inventariado pero **no planificable**.

---

## 🔴 Trade Republic — PDF, y es el caro

- **No está cifrado** (pese a lo que dice `file`): el texto se puede extraer, y se
  ha extraído para comprobarlo. Lleva su `ToUnicode`, así que una librería de PDF
  en Node (`pdfjs-dist` o equivalente) sacaría el texto.
- **Pero la tabla no sobrevive a la extracción.** Es la diferencia entre «se lee
  el texto» y «se leen los movimientos»: al volcar el PDF a texto plano, las
  descripciones se desalinean de su fila y algunas caen varias líneas más abajo,
  separadas de la fecha y del importe a los que pertenecen. Reconstruir la tabla
  exige agrupar por **coordenadas** (la `y` de cada fragmento), no por líneas.
  Eso es un parser de otro orden de complejidad que leer un CSV.
- **Lo que sí trae, y es mucho:** IBAN de la cuenta (¡el único que lo da sin
  intervención!), rango de fechas del extracto, resumen con balance inicial y
  final, y saldo final. La cabecera es fija y muy estable.
- **Lo que trae de movimientos es poco:** en esta muestra, **4 apuntes**, todos
  del mismo tipo (abonos de intereses). Es una cuenta remunerada, no una cuenta
  de gasto diario. El volumen mensual va a ser de uno o dos apuntes.

**Aquí la relación esfuerzo/beneficio se rompe:** el parser más difícil de los
cuatro es el del banco con menos movimientos. Antes de escribirlo hay que
preguntarse si Trade Republic no es más bien un **producto de inversión** (como
los `.json` de MyInvestor) que una cuenta de gasto. Decisión del humano.

---

## Lo que hay que decidir antes de abrir features

1. **🔴 El preámbulo `iban;…` en un CSV de comas (N26).** Hoy el preámbulo es un
   invento nuestro con separador `;`. Meterlo en un fichero de comas funciona
   (el parser busca la etiqueta al principio de la línea) pero deja un fichero con
   dos dialectos, y el humano se equivocará. Alternativas: (a) el preámbulo usa
   **siempre** `;` sea cual sea el fichero, y se documenta como «línea nuestra, no
   del banco»; (b) el preámbulo usa el separador del fichero; (c) el IBAN de las
   cuentas sin IBAN se registra **una vez** fuera del fichero. **Recomiendo (a)**:
   una sola forma de escribirlo, la que ya está documentada, y la línea se
   distingue a simple vista de las del banco.
2. **🟠 Openbank en cp1252** — ¿el backend acepta la codificación que emite el
   banco (declarada por parser) o el humano reconvierte cada mes? Ver §2 de
   Openbank.
3. **🟠 El `balance` por línea de Openbank.** El ADR-013 lo dejó `null` porque
   ningún banco lo daba. Openbank lo da. ¿Se empieza a guardar?
4. **🟠 El histórico de Openbank** (dos años, 200 apuntes). ¿Se importa entero o
   se recorta? Enlaza con la idea #5 del histórico del Excel, hoy aplazada.
5. **⚪ Trade Republic: ¿cuenta o producto de inversión?** Cambia el parser entero.
6. **⚪ Revolut: el estado del movimiento.** Un movimiento pendiente no es un
   movimiento. Se decide al ver una muestra con filas.

## Lo que le toca al humano, en orden

1. 🔴 **Re-exportar Revolut con movimientos** y resubirlo. Sin eso ese parser no
   se puede ni planificar.
2. 🔴 **Renombrar la carpeta `N26` a `n26`** en Drive.
3. 🟠 **Escribir el IBAN** de N26 y de Openbank una vez, según lo que se decida en
   el punto 1 de arriba.
4. ⚪ **Decidir** los seis puntos de la sección anterior. Los cuatro primeros
   bloquean features; los dos últimos no.

## Orden recomendado de las features

| Orden | Banco | Por qué |
|---|---|---|
| 1º | **N26** | El formato más limpio y el que menos decisiones abre. Además estrena el lector de CSV con comillas, que Revolut va a reutilizar (la forma, no el código: sigue habiendo un parser por banco). |
| 2º | **Openbank** | El de más valor (saldo, `balance` por línea, dos años de histórico) y el que más doctrina toca. No antes que N26: conviene llegar aquí con las decisiones de codificación ya rodadas. |
| 3º | **Revolut** | Bloqueado por la muestra. En cuanto llegue, debería ser corto. |
| 4º | **Trade Republic** | El más caro y el de menos volumen. Puede que ni sea un parser de extracto. |
