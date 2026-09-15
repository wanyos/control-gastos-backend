# Prueba real — F46 `revolut-statement` (2026-09-15)

> Solo recuentos y forma. Ni IBAN, ni conceptos, ni nombres: el fichero trae
> nombres de personas en las descripciones y este archivo se versiona.

## El fichero

- Export de Revolut descargado por el humano el 2026-09-15: cabecera de 10
  columnas y 36 filas (35 `COMPLETADO`, 1 `DEVUELTO`), todas de 2025, EUR.
- El humano le añadió la línea `iban;…` encima de la cabecera con Visual Studio
  Code y lo subió a `notas-banco/revolut/2025/`.
- Antes de la pasada, el humano borró de Drive el `.csv` vacío de agosto
  (`revolut/2026/`, solo cabecera) y el leader borró su copia de
  `var/drive-read/revolut/2026/`, por la regla de sustituir ficheros
  (`docs/dar-de-alta-un-banco.md`).

## La pasada

Lanzada por el humano: `curl.exe -X POST http://localhost:3000/api/import`.

| Total del run | Valor |
|---|---|
| `importedCount` | 35 |
| `duplicateCount` | 0 |
| `unparsedCount` | 0 |
| `failedCount` | 0 |
| `skippedCount` | 0 |
| `balanceMismatchCount` | 0 |
| `anchoredCount` | 1 |
| `balanceFilledCount` | 0 |
| `transfers.pairsCreated` | 1 |

Un solo fichero en el informe: `revolut/2025`, `status: imported`, cuenta **creada**
con alias y tipo por defecto (`appliedDefaults` ambos `true`), `balanceAnchor: "2.00"`,
`unparsedRows: []`, `balanceMismatches: []`, `movedToProcessed: true`.

Lo esperado se cumple entero: 35 = 36 filas menos la `DEVUELTO`, que ni entra ni
aparece en `unparsedRows`.

## Comprobación en la base (lectura, script de usar y tirar fuera del repo)

- 1 cuenta con `bank = 'revolut'`, 35 movimientos, **0** con `balanceAfter` nulo.
- Suma de importes (guardados en positivo): 1998,00 = 1000,00 de ingreso + 998,00 de
  gastos, cuyo neto 2,00 coincide con el saldo del último movimiento y con el ancla.
- Ancla: 2,00 con fecha 2025-10-27, la fecha de finalización del último movimiento.
- El traspaso enlazado es la recarga de 1000 del 2025-02-20 (ingreso en Revolut) con
  su salida de 1000 en Bankinter del 2025-02-19.

## Lo que no es de Revolut

`categorization` devolvió `categorized: 10`, `conflictCount: 1`, `unmatched: 1378`.
El único choque es el mismo Bizum de enero de 2026 ya descrito en la prueba de la F43
(regla «bizum» contra «gimnasio»); no es un movimiento de Revolut.

## `./init.sh` con el fichero real ya en local

Lanzado por el leader con el fichero ya en `var/drive-read/revolut/2025/`, para que el
test de datos reales (`src/no-real-data.test.ts`) compare contra él: exit 0,
`Test Files 67 passed (67)`, `Tests 1257 passed (1257)`, tipos, lint y formato OK.
