# Prueba real de la importación completa — 2026-09-11

**Qué se probó.** El humano subió a Drive los extractos de septiembre de
Bankinter (`.xlsx`), N26 (`.csv`) y Openbank (`.xls`) tal cual salen del banco,
solo renombrados con la fecha. Se lanzó el flujo completo por la API con el
backend recién arrancado: `GET /health/drive` → `GET /api/ingestion/pending` →
`POST /api/import` → `GET /api/ingestion/pending` → segunda pasada de
`POST /api/category-rules/apply`. Ejecutado por el leader a petición suya.
Sin datos reales aquí (IBAN, saldos ni conceptos): solo contadores.

**Antes.** `totalPending: 4`: los tres extractos nuevos y el
`revolut-2026-08-17.csv` de agosto, que sigue sin parser.

**`POST /api/import` → 200.** Totales de la pasada:

| Contador | Valor |
|---|---|
| `importedCount` | 44 |
| `duplicateCount` | 310 |
| `unparsedCount` / `failedCount` | 0 / 0 |
| `skippedCount` | 1 (Revolut, «no hay parser para el banco revolut») |
| `balanceMismatchCount` | 0 |
| `importedProductCount` / `anchoredCount` / `balanceFilledCount` (F45) | 0 / 0 / 0 |

Por archivo, los tres extractos salen `imported`, con su cuenta ya existente
(`created: false`), sin filas sin parsear, sin descuadres y `movedToProcessed:
true`: Bankinter 17 nuevos y 22 duplicados; N26 23 nuevos y 93 duplicados;
Openbank 4 nuevos y 195 duplicados. Los duplicados son el solape normal del
extracto con lo ya guardado. Ninguno ancla (`anchored: false`): las tres
cuentas ya estaban ancladas y la regla R3 de la F31 conserva el anclaje. Los
tres contadores nuevos de la F45 valen 0 con razón: no había archivos de
producto, nadie ancló y nadie rellenó saldos. Primera vez que se ven en real.

**Detección de traspasos (F40):** `pairsCreated: 3`, 0 ambiguos, 0 dudosos.

**Categorización (F43):** `categorized: 5`, `conflictCount: 1`, `unmatched:
1346`. Cuadra: 1307 sin casar de la primera pasada de esta mañana + 39 nuevos
sin regla (44 importados − 5 categorizados). El choque es el mismo Bizum de la
primera pasada (regla «bizum» contra regla «gimnasio»).

**Después.** `totalPending: 1` (solo Revolut). Log del servidor sin ninguna
entrada de nivel error. Segunda pasada de `apply`: `categorized: 0`, misma
cifra de choques y de sin casar → idempotente, como manda el contrato.

**Conclusión.** El camino entero Drive → parser → base de datos → `procesados/`
funciona con los tres bancos sobre ficheros de este mes sin tocar. Nada que
arreglar. Sigue pendiente, como ya estaba, el parser de Revolut (E4, aparcado
sin datos) y el ajuste fino de reglas de categorización por parte del humano.
