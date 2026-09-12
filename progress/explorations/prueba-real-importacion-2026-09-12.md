# Prueba real de la importación — 2026-09-12 (Trade Republic, productos de MyInvestor y su cuenta corriente)

**Qué se probó.** El humano subió a Drive el `.json` de la cuenta remunerada de
Trade Republic, los cinco `.json` de producto de MyInvestor y el `.csv` de
movimientos de su cuenta corriente. Se lanzó el flujo completo por la API con el
backend ya arrancado: `GET /health` + `/health/db` + `/health/drive` →
`GET /api/ingestion/pending` → `POST /api/import` →
`GET /api/ingestion/pending` → dos pasadas de `POST /api/category-rules/apply`.
Ejecutado por el leader a petición suya. Sin datos reales aquí (importes ni
conceptos): solo contadores, nombres de archivo y nombres de producto, que son
el hallazgo.

**Antes.** `totalPending: 8`: los 6 de MyInvestor (5 `.json` de producto +
`Movimientos_2026-09-12.csv`), el `.json` de Trade Republic y el
`revolut-2026-08-17.csv` de agosto, que sigue sin parser.

**`POST /api/import` → 200.** Totales de la pasada:

| Contador | Valor |
|---|---|
| `importedCount` | 8 |
| `duplicateCount` | 0 |
| `unparsedCount` / `failedCount` | 0 / 0 |
| `skippedCount` | 1 (Revolut, «no hay parser para el banco revolut») |
| `balanceMismatchCount` | 0 |
| `importedProductCount` | 6 |
| `anchoredCount` / `balanceFilledCount` | 0 / 0 |

Los 7 archivos con parser salen `imported` y `movedToProcessed: true`. Es la
primera vez que `importedProductCount` vale algo distinto de 0 en real (F45).

- **Trade Republic:** producto ya existente (`created: false`), foto nueva del
  `2026-09-01`. Su serie de `SavingsSnapshot` encadena 26 meses seguidos desde
  el 2024-07-22, sin huecos. ✅
- **Cuenta corriente de MyInvestor** (`Movimientos_2026-09-12.csv`): 8
  movimientos nuevos, 0 duplicados, 0 filas sin parsear, cuenta ya existente,
  sin descuadres de saldo. No ancla, y es correcto: la cuenta ya estaba
  anclada (regla R3 de la F31). ✅
- **Productos de MyInvestor:** 5 archivos, **4 productos tocados**. Ver abajo.

**Detección de traspasos (F40):** `pairsCreated: 0`, 0 ambiguos, 0 dudosos.

**Categorización (F43):** `categorized: 1`, `conflictCount: 1`,
`unmatched: 1353`. Las dos pasadas posteriores de `apply` dan
`categorized: 0` con las mismas cifras → idempotente, como manda el contrato.

**Después.** `totalPending: 1` (solo Revolut).

---

## Hallazgo: dos archivos de producto de este mes llevan el mismo `name` y se han fusionado

**No es un fallo del importador.** Se ha comportado exactamente como dice el
contrato: el producto se identifica por `(bank, name)` —el `name` lo dice el
contenido del archivo— y la foto por `(productId, date)`. Lo que falla es el
**contenido de dos de los cinco `.json`**.

Comprobado leyendo los archivos en `var/drive-read/myinvestor/2026/` y, después,
consultando `InvestmentProduct` en la base de datos (no deducido):

| Archivo de hoy | `name` que lleva dentro | `type` | A qué producto fue |
|---|---|---|---|
| `etf_gold-2026-09-12.json` | `"Fondo Indexado Global"` | `fund` | creó el producto 13034 |
| `mobiliario_2026-09-12.json` | `"Fondo Indexado Global"` | `fund` | **al mismo 13034**, y su foto del 2026-09-12 **sobrescribió** la del anterior (`snapshot.created: false`) |

Los dos archivos llevan **el mismo `name` y el mismo `type`**, así que el
importador los tomó por el mismo producto. Consecuencias, todas comprobadas en
la base de datos:

1. Existe un producto nuevo `"Fondo Indexado Global"` (id 13034, `fund`) con
   **una sola** valoración, la del 2026-09-12, que es la del **segundo** archivo
   (`mobiliario`, que va después de `etf_gold` en el orden alfabético de Drive).
   La del ETF de oro **ya no está en ninguna parte**.
2. El **ETF de oro real** —`"etf fondo fisical oro"`, id 12760, `type: etf`— se
   ha quedado **sin la foto de septiembre**: su serie sigue parando el
   2026-08-15. En agosto ese archivo se llamaba `etf_oro-2026-08-15.json` y
   llevaba dentro ese `name` y `type: etf`.
3. El **fondo inmobiliario real** —`"Fondo Inversión inmobiliario"`, id 12761—
   igual: su serie sigue parando el 2026-08-15.

**El depósito nuevo no es este problema.** `deposit-month_2026-09-12.json` creó
`"Depósito 1 mes"` (id 13032, `openedAt: 2026-09-02`), y el de agosto
—`"Depósito a 1 mes"`, id 12758— está **cerrado** (`closedAt: 2026-08-31`). Es
un depósito nuevo contratado en septiembre, no una serie rota.

## Lo que sí es del backend: nadie avisó

Los dos archivos salieron con `status: "imported"` y sumaron a
`importedProductCount`. **Nada en la respuesta dice que el segundo pisó la foto
del primero dentro de la misma pasada.** El contrato ya prevé rechazar un `name`
que existe con **otro** tipo; lo que no cubre es **dos archivos distintos de la
misma pasada escribiendo la misma clave `(productId, date)`**. Es un
sobreescrito silencioso: el dato se pierde y el informe sale en verde.

## Los depósitos: revisados, nada que corregir

El humano dudó de si les faltaba la fecha de vencimiento. **No falta**:
`maturityDate` está escrito y guardado en los tres (comprobado leyendo la tabla
`InvestmentProduct`). Lo que estaba confundido eran dos campos distintos:
`maturityDate` es cuándo vence y `closedAt` es cuándo se da por cerrado. Que
`closedAt` esté vacío en los dos depósitos vivos es **lo correcto**: es lo que
hace que cuenten en el patrimonio. El archivo de agosto del de 3 meses llevaba
`closedAt` con la fecha de vencimiento —una fecha futura—, y mientras eso estuvo
escrito ese depósito no contaba; el archivo de septiembre lo corrigió.

**Decisión del humano (2026-09-12):** cada depósito nuevo llevará la fecha en el
`name` (`Depósito 1 mes 2026-10`) para que nunca choque con uno anterior. Un
depósito no tiene serie de fotos: sus condiciones son columnas del propio
producto, así que repetir un `name` ya usado reescribiría las condiciones del
contrato anterior y le borraría su `closedAt`. Dijo además que más adelante se
le dará una solución mejor a esto.

## El producto fantasma, borrado a mano (2026-09-12)

A petición del humano se borró de la base de datos el producto **13034**
(`myinvestor` / `fund` / `"Fondo Indexado Global"`) y su única valoración
(id 6562, del 2026-09-12). **No hay endpoint que borre productos ni
valoraciones** —ninguna de las 31 rutas de la API lo hace—, así que se hizo con
un script de una sola vez contra Prisma, en una transacción, tras comprobar que
del producto no colgaba ningún movimiento ni ninguna `SavingsSnapshot`. El
script no se ha dejado en el repositorio.

Comprobado después: `GET /api/net-worth` ya no lo lista y el patrimonio deja de
contar dos veces el fondo inmobiliario. El ETF de oro y el fondo inmobiliario
siguen valorados con su foto del **2026-08-15**, a la espera de que se
reimporten los dos archivos corregidos.

## Segunda pasada del mismo dia: los dos archivos corregidos

El humano corrigio los dos `.json` —en el del oro solo faltaba el `type`, que
decia `fund` y es `etf`— y los subio otra vez. Segunda
`POST /api/import` → 200: `importedProductCount: 2`, 0 fallos, los dos
`imported` y `movedToProcessed: true`, los dos sobre **su** producto de siempre
(`created: false`) y con **foto nueva** del 2026-09-12 (`snapshot.created:
true`):

- `etf_gold-2026-09-12.json` → producto 12760, `"etf fondo fisical oro"`, `etf`.
- `mobiliario_2026-09-12.json` → producto 12761, `"Fondo Inversión
  inmobiliario"`, `fund`.

Comprobado despues con `GET /api/net-worth`: los dos ya se valoran con su foto
del **2026-09-12** (antes con la del 2026-08-15), quedan **6 productos**,
`issues` vacio y `totalPending: 1` (solo Revolut). El patrimonio pasa de
88.875,57 € a **88.850,64 €**: baja 24,93 €, que es exactamente lo que cambia al
sustituir las dos valoraciones de agosto por las de septiembre.

Antes de subirlos se comprobo, contra la tabla `InvestmentProduct`, que el
`name`, el `type` y el `openedAt` de los cinco archivos de la carpeta local del
humano apuntaban a un producto ya existente y que ninguno crearia uno nuevo.
Dos de ellos, los dos depositos, llevaban `closedAt` con la fecha de
vencimiento: se corrigieron a `null` **antes** de que llegaran a subirse, porque
habrian sacado 30.000 € del patrimonio. No hizo falta subirlos: ya estaban bien
guardados.

**Las dos plantillas que el humano usa para escribir estos archivos se
reescribieron el mismo dia** (fuera de este repositorio, en su escritorio): la
de los productos de MyInvestor y la de la cuenta remunerada de Trade Republic.
Las dos llevaban errores que reproducian el fallo: comentarios `//` dentro del
JSON —que lo invalidan entero—, un deposito de ejemplo con `closedAt` puesto a
su fecha de vencimiento y, en la de MyInvestor, `"Fondo Indexado Global"` como
nombre de ejemplo, justo el que fusiono los dos productos. Ahora las dos llevan
la identidad exacta de cada producto para copiar y los campos variables con el
marcador `<…>`, que el parser ya sabe cazar sin sustituir (features 28 y 30).

## Estado en el que queda esto

**Cerrado el mismo día.** El producto fantasma se borró, los dos archivos se
corrigieron y se reimportaron, y las dos series recogieron su foto de
septiembre. No hizo falta `POST /api/import/local`: el humano volvió a subir
los archivos corregidos a Drive y entraron por la vía normal.

**No comprobado:** el log del servidor. El proceso del backend ya estaba
arrancado y no es de esta sesión, así que su salida no se ha podido leer. Para
comprobarlo haría falta arrancarlo desde aquí y repetir la pasada.
