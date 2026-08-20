# Prueba real de Trade Republic — 2026-08-20

> 🔒 **Ni un dato real en este archivo.** El extracto de este banco trae el nombre del
> titular, su dirección y su IBAN, y el `.json` que él escribe trae sus saldos. Aquí
> solo hay **recuentos y forma**. Ni un importe, ni una fecha suya, ni un nombre.

**Qué es esto:** el checkpoint C4 bis de la feature 20, la primera vez que se aplica.
El reviewer bloqueó por él: la feature estaba entera y la suite en verde (721 tests),
pero nadie había pasado por el sistema un archivo escrito por el humano. **No es un
test** y no queda ejecutándose.

## Cómo se hizo

1. `GET /api/ingestion/pending` → 8 pendientes, 2 de este banco (su `.pdf` y su primer
   `.json`).
2. `POST /api/ingestion/process` → 8 bajados, 0 fallidos.
3. `POST /api/parser/trade-republic` → solo parsea y vuelca a `var/parsed/`, no toca la
   base de datos.

## Pasada 1 — el archivo se rechaza, y por tres motivos a la vez

`productCount: 0`, `failedCount: 1`, `ignoredCount: 1`.

| Comprobación | Resultado |
|---|---|
| El `.pdf` se lista como ignorado, no como fallo | ✅ con su motivo («extensión no soportada») |
| El archivo roto reporta **todos** sus problemas de golpe | ✅ tres en un solo viaje |
| Dos fechas conservaban el `<` de la plantilla | detectadas, pero como «fecha inválida» |
| El cuadre rechaza de verdad | ✅ rechazo, no aviso |
| El motivo enseña los cinco importes y la desviación con signo | ✅ |

**Las tres erratas del primer relleno**, todas de la misma clase (colocar bien un dato
que se tiene delante):

1. `date` y `openedAt` con el `<` de la plantilla a medio borrar.
2. **El abono de intereses escrito en `moneyIn`.** Es la errata que el documento ya
   avisaba, y aun así se cometió: en el extracto el abono ocupa la columna «entrada de
   dinero», así que la mano lo lleva sola a ese campo.
3. `interest` con un valor que no sale del extracto (por la forma, el **porcentaje** en
   vez de los euros) — la misma confusión que el humano ya tuvo en la puerta de
   aprobación, en el punto 4.

✅ **El cuadre hizo exactamente su trabajo**: con el abono en el campo bueno, el mes
cuadra al céntimo. Sin cuadre, ese archivo habría entrado en silencio con los intereses
contados como ingreso y el interés real perdido.

## Hallazgo 1 — la documentación afirmaba algo falso sobre el extracto (corregido)

La pregunta que se le hizo al humano por la mañana era la buena, pero **la premisa era
falsa** y solo se veía abriendo el `.pdf`: el bloque de resumen del extracto **no da los
datos del mes, da los del periodo**, y su extracto cubre cuatro meses. Su balance
inicial es el del primer mes y su entrada de dinero es la **suma de todos** los abonos.
Seguir el documento al pie de la letra daba descuadre garantizado **todos los meses**.

Los tres campos salen de la **tabla de transacciones**: el saldo inicial de un mes es el
saldo de la fila de intereses anterior, y las entradas y salidas son las filas que no
son abonos. Sigue sin exigir ninguna cuenta, que era lo que sostenía la decisión.

**Corregido el mismo día** en `docs/trade-republic-product-files.md` (el aviso del
resumen, el párrafo de la cadencia y las cuatro filas de la tabla de campos). La nota
que daba el dato por «confirmado» se ha sustituido por lo que dice el fichero real.

> Es el **tercer** documento de este repositorio que afirmaba como hecho algo que nadie
> había comprobado. Los otros dos los cazó el reviewer el mismo día.

## Hallazgo 2 — el guardián de datos reales confunde nuestras palabras con sus datos

Al llegar el `.json`, `src/no-real-data.test.ts` se puso rojo por **dos** cosas:

- **La prevista**, escrita en el propio guardián: hay que borrar la entrada de
  `unwatchedBanks` de este banco, porque ya hay texto suyo que se puede leer. La suite
  se pone roja hasta que se borre, y así fue. ✅ El aviso funcionó.
- **La que nadie esperaba: 270 avisos falsos en 8 archivos.** El volcado de
  `var/parsed/` contiene ahora el **mensaje de rechazo del propio parser**, y ese
  mensaje lo publica la documentación palabra por palabra. El guardián lo lee como «una
  frase de su extracto copiada en los docs». **Le pasa a cualquier banco cada vez que un
  archivo se rechaza**, así que no es de Trade Republic.

Abierto como **feature 24 (`guardian-own-words`)**, aprobado por el humano el mismo día.

## Pasada 2 — con el archivo corregido

Quedaba **un** `<` sin borrar en `openedAt`, y el parser lo volvió a rechazar con ese
único motivo. Los cinco importes y la otra fecha, correctos. El cuadre no protestó.

## Candidato que deja esta prueba (no abierto todavía)

**El motivo no dice «te dejaste el `<` de la plantilla».** Dice «fecha inválida», que es
verdad pero no ayuda. Es la errata número uno al rellenar a mano —sobrevivió incluso a
una corrección con las erratas señaladas una por una— y el parser tiene delante la
prueba: un valor que empieza por `<` o acaba en `>` es un marcador a medio sustituir,
no una fecha mal escrita. Pendiente del sí del humano.

## Estado

- Base de datos: **no se ha tocado**. Esta feature no persiste nada.
- Nada de `var/` se ha borrado ni movido; el `.pdf` sigue donde estaba y nadie lo abre.
- El `.pdf` se leyó **a mano, una vez, para diagnosticar**. Ni una de sus cifras ha
  entrado en el repositorio.
