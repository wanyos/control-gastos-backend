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

## Estado en el que queda esto

La importación **no se ha deshecho**. El arreglo pasa por corregir el `name` y
el `type` de los dos `.json` y volver a importarlos, y por decidir qué se hace
con el producto 13034 y su valoración. Los dos archivos ya están en
`procesados/`, así que la reimportación es el caso de uso de
`POST /api/import/local` (F25), que lee de `var/drive-read/`. **Queda a decisión
del humano**; esta sesión no ha tocado ni borrado nada de eso.

**No comprobado:** el log del servidor. El proceso del backend ya estaba
arrancado y no es de esta sesión, así que su salida no se ha podido leer. Para
comprobarlo haría falta arrancarlo desde aquí y repetir la pasada.
