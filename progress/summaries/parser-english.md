# Resumen — feature 7 `parser-english`

Fecha de cierre: 2026-08-05
Intención original: `feature_list.json` → feature `parser-english`, bloque `intent`
Spec: no lleva (`"sdd": false`)

> ⚠️ **Escrito a posteriori, el 2026-09-01.** Era la **única** de las 35 features sin
> resumen, y se detectó cruzando `feature_list.json` con `progress/`. No sale de la
> memoria de nadie: está redactado **solo** con lo que dicen su informe de
> implementación y su veredicto, los dos escritos el día del cierre —
> [`implementations/parser-english.md`](../implementations/parser-english.md) y
> [`reviews/parser-english.md`](../reviews/parser-english.md)—. Lo que aquellos dos
> no dicen, aquí tampoco.

## Qué hace ahora la app que antes no

**Lo que devuelve el parser de Bankinter dejó de estar en español.** Hasta ese día
`POST /api/parser/bankinter` respondía con `fechaContable`, `fechaValor`,
`descripcion`, `importe`, `saldo`, `divisa`, `cuentaIban`, `movimientos`,
`noReconocidas`, `fila` y `motivo`, y con `tipo` valiendo `ingreso` o `gasto` —
incumpliendo en público la regla del propio `api-contract.md`, que obliga a que
rutas, campos y modelos vayan en inglés.

Desde entonces esa misma respuesta trae `bank`, `accountIban`, `movements` y
`unparsedRows`; cada movimiento, `bookingDate`, `valueDate`, `description`,
`amount`, `balance`, `currency` y `type` con `income` o `expense`; y cada fila no
reconocida, `row` y `reason`. Los tipos siguieron el mismo camino:
`MovimientoParseado` → `ParsedMovement`, `FilaNoReconocida` → `UnparsedRow`,
`MovimientoTipo` → `ParsedMovementType`.

**Fue un renombrado puro.** No cambió la lógica del parser, ni la forma de la
salida, ni un solo valor: mismas fechas, mismos importes, mismo IBAN y los mismos
recuentos, con la suite entera pasando con **los mismos 146 tests en 14 archivos**
que antes de tocarlo. Los motivos de las filas no reconocidas se quedaron en
español a propósito.

**Por qué se hizo entonces y no después:** el parser iba a alimentar a la
persistencia (feature 8), y llegar a ese punto con el vocabulario ya alineado con
el de la base de datos hacía que el mapeo fuera directo en vez de arrastrar la
incoherencia. Es la misma línea que la feature 11 remató después, sacando el
contrato a [`src/lib/parsed-statement.ts`](../../src/lib/parsed-statement.ts).

## Qué te tocó a ti

Nada. Fue un **breaking change** del contrato de la API sin ningún consumidor: el
frontend todavía no existía. Quedó anotado con su aviso en
[`docs/api-contract.md`](../../docs/api-contract.md) §Parser de Bankinter.

## Veredicto

**APPROVED**, con una salvedad de alcance que el reviewer marcó como **no
bloqueante** y dejó para el leader. Detalle en
[`reviews/parser-english.md`](../reviews/parser-english.md).
