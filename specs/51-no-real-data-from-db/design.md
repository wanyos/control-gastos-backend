# Design — F51 `no-real-data-from-db`

> Apoyado en ADR-017 (el guardián), ADR-027 (la suite no toca la base del humano) y
> `docs/conventions.md` §Tests. Todo lo marcado «medido» o «comprobado» se ejecutó el
> 2026-10-02 contra la base del humano en sesión de solo lectura, imprimiendo solo
> recuentos y `archivo:línea`, nunca un valor.

## 1. Archivos

| Archivo | Qué pasa |
|---|---|
| `src/lib/test-real-data.ts` | **Nuevo.** Lee de una base, en solo lectura, los valores de las columnas comparadas. Sin `process.env` (regla de `src/architecture.test.ts`): la URL llega por argumento |
| `src/lib/test-real-data.test.ts` | **Nuevo.** Tests del lector contra la base desechable del worker, y el inventario de columnas (R14) |
| `vitest.global-setup.ts` | Llama al lector con `realDatabaseUrl` y hace `project.provide('realDataReference', …)`. Se corrige su cabecera |
| `src/no-real-data.test.ts` | La comparación pasa a usar `inject('realDataReference')`. Se borra todo lo que solo servía para leer archivos (§5) |
| Dos tests y siete documentos | Las diez líneas del repositorio que hoy coinciden con la base (§6) |
| `docs/…` | §7 |

No hay migración, ni código de aplicación, ni cambio en `docs/api-contract.md`.

## 2. Firmas nuevas

```ts
// src/lib/test-real-data.ts
export interface RealDataReference {
  /** Texto decimal de cada valor distinto de las columnas de dinero. */
  amounts: string[]
  /** Un elemento por valor distinto de las columnas de texto. Nunca pegados. */
  texts: string[]
  /** `ImportUnparsedRow.reason`: frases nuestras con valores suyos dentro. */
  ownMessages: string[]
  /** `Account.iban`, sin espacios ni guiones y en mayúsculas. */
  ibans: string[]
}
export type ColumnKind = 'amount' | 'text' | 'ownMessage' | 'iban'
export const comparedColumns: Array<{ table: string; column: string; kind: ColumnKind }>
export const notComparedColumns: Array<{ table: string; column: string; reason: string }>

/** Abre la conexión con `options: '-c default_transaction_read_only=on'`. */
export async function withReadOnlyClient<T>(url: string, run: (client: Client) => Promise<T>): Promise<T>
/** Una tabla que no existe (`to_regclass(...) is null`) no aporta nada y no falla. */
export async function readRealDataReference(url: string): Promise<RealDataReference>
```

- `vitest.global-setup.ts` pasa a `export default async function setup(project)` y
  llama a `project.provide`. Comprobado en una carpeta desechable con vitest 5.0.1:
  lo que da `provide` en el global setup llega al test con `inject`.
- El tipo de la clave se declara en `src/no-real-data.test.ts`
  (`declare module 'vitest' { interface ProvidedContext { realDataReference: RealDataReference } }`):
  `tsconfig.json` solo tipa `src/**`, y `vitest.global-setup.ts` queda fuera.
- El lector devuelve los valores **crudos**; qué importe o qué frase es comparable lo
  sigue decidiendo el guardián con `isTelling`, `tellingPhrases` y
  `comparablePhrases`, sin cambios. Así el criterio vive en un solo sitio.
- Lo entregado pesa unos 15 KB con la base de hoy (medido). Viaja en memoria a los
  procesos de test; no se escribe en disco ni se imprime.
- Sin excepciones nuevas. Si la base no responde, `vitest.global-setup.ts` ya lanza
  antes, en `prepareTestDatabases` (leído en el código; no ejecutado: habría que
  parar PostgreSQL).

## 3. Qué columnas

Regla: de `prisma/schema.prisma`, **toda** columna `Decimal` es de dinero y se
compara; de las `String`, las de esta tabla. Una columna `Decimal` o `String` que no
esté en una de las dos listas pone la suite roja (R14).

| Tipo | Columnas comparadas |
|---|---|
| `amount` | `Movement`: `amount`, `balanceAfter` · `Account`: `initialBalance`, `balanceAnchor` · `InvestmentProduct`: `principal`, `interestRate`, `expectedGain` · `Valuation`: `invested`, `marketValue`, `gain`, `gainPercent`, `uninvestedCash` · `SavingsSnapshot`: `openingBalance`, `moneyIn`, `moneyOut`, `interest`, `balance` · `ImportBalanceMismatch`: `computed`, `fromFile` |
| `text` | `Movement.description`, `Movement.note`, `InvestmentProduct.name`, `Account.alias`, `CategoryRule.matchText`, `ImportBalanceMismatch.note` |
| `ownMessage` | `ImportUnparsedRow.reason` |
| `iban` | `Account.iban` |

| No comparada | Motivo que va en `notComparedColumns` |
|---|---|
| `Category.name` | Palabras corrientes: medido, 75 líneas del repositorio coincidirían, todas texto nuestro |
| `Movement.descriptionSearch` | Derivada de `description` |
| `Movement.transferId`, `Movement.undoneTransferId` | Identificadores generados |
| `Movement.currency`, `InvestmentProduct.currency` | Código de divisa |
| `Account.bank`, `InvestmentProduct.bank`, `ImportUnparsedRow.bank`, `ImportBalanceMismatch.bank` | Nombre del banco: lo publica nuestro código |
| `ImportUnparsedRow.year`, `ImportBalanceMismatch.year` | Año |
| `ImportUnparsedRow.fileName`, `ImportBalanceMismatch.fileName` | Nombre de archivo: puede ser convención nuestra (el caso de la F34). El nombre de producto que lleve dentro ya se compara por `InvestmentProduct.name` |
| `ImportBalanceMismatch.check` | Valor fijo de nuestro contrato |

Medido con la base de hoy (cinco cuentas, siete productos, unos mil seiscientos
movimientos): 1065 importes comparables, 336 frases comparables, cinco IBAN (uno no
es español: la comprobación por forma no lo ve, R7 sí).

## 4. Cómo compara el guardián

- **Importes (R4):** `secrets` = los `amounts` pasados por `Math.abs(Number(v))` e
  `isTelling`, redondeados a cuatro decimales como hoy. `amountLeak` no cambia salvo
  el texto del mensaje.
- **Frases (R5, R6):** `comparablePhrases({ data, ourProse }, ownSourceVocabulary())`
  con `data` = `texts` + `echoedSpans` de cada `ownMessages`, y `ourProse` =
  `ownMessages`. Es la misma función de la F24; `CaptureSources` pierde `letThrough`.
  Ventana de dos líneas, como hoy.
- **IBAN (R7):** por cada línea, se quitan espacios y guiones, se pasa a mayúsculas y
  se busca cada IBAN de `ibans` que no esté en `allowedIbans`. Se escanea con
  `skipAllowedPaths = false`, igual que la comprobación por forma (R13). Medido:
  cero coincidencias hoy.
- **Mensajes (R9):** «an amount on this line is in the database…», «a three-word
  sequence copied from the database…», «an IBAN of the database…». Dónde y de qué
  tipo, nunca el valor.
- **Sin datos (R10, R11):** cada uno de los tres tests reales
  (`repeats no telling amount of the database`, `copies no telling phrase of the
  database`, `repeats no IBAN of the database`) hace `context.skip` si su conjunto
  queda vacío, y antes escribe el aviso con `writeSync(2, …)`. La función que redacta
  el aviso se prueba aparte. No se usa `console`: vitest la intercepta (ADR-017), y
  comprobado que la nota de `context.skip` tampoco sale.
- **Los tests del mecanismo** construyen un `RealDataReference` inventado en memoria;
  ya no escriben archivos en carpetas temporales.

## 5. Qué se borra del guardián

Todo lo que solo existía para leer archivos, con sus tests: `captureRoot`,
`looksBinary`, `decodeCapture`, `readCapture`, `allFiles`, `captureFiles`,
`looksLikeMarkup`, `markupText`, `captureBranches`, `missingCaptureBranches`,
`comparisonUnavailable`, `captureContent`, `captureText`, `capturePhraseSources`,
`fileNameKeys` y todo lo de nombres de archivo publicados (F34), `bankCoverage`,
`unwatchedNow`, `unwatchedBanks`, `unwatchedAnnouncement`, `announceUnwatched`, y el
test que lee el `.xls` real de Openbank. De `node:fs` solo quedan `readFileSync` y
`writeSync`, y un test lo afirma (R1).

Se quedan: la comprobación de IBAN por forma y sus tests; `versionedFiles`,
`scanSources`, `toNumber`, `isTelling`, `amountsOf`, `words`, `tellingPhrases`,
`trigramsOf`, `stopWords`; `echoedSpans`, `ownMessageProse`, `ownSourceVocabulary`,
`isOurOwnPhrase`, `comparablePhrases` y sus tests, reescritos sobre un
`RealDataReference` inventado; `allowedPaths`, `skipMarker`; y el test que exige que
`var/drive-read/` y `var/parsed/` sigan en `.gitignore` (la carpeta existe hasta la
F52).

## 6. Las líneas que hoy coinciden con la base

Medido: con `var/` el repositorio da cero coincidencias; con la base da ocho líneas
de importe y una frase (señalada en dos líneas seguidas). Sin arreglarlas, la suite
termina roja en la máquina del humano. **Los números de línea son de hoy y la base
cambia con cada importación: el implementer se guía por lo que la suite señale.**

| Dónde | Qué es | Qué se hace |
|---|---|---|
| `src/modules/investments/investments.deposits.test.ts` (una línea) | Importe inventado que coincide | Inventar otro; la resta que ilustra tiene que seguir cuadrando |
| `src/modules/transfers/transfers.service.test.ts` (una línea) | Importe inventado que coincide | Inventar otro |
| `progress/history.md`, `progress/summaries/drive-connection.md`, `progress/reviews/data-model.md` (cuatro líneas) | Dos números de línea separados por coma, leídos como un importe | Escribir los dos números separados por « y » |
| `progress/reviews/import-run-totals.md` (una línea) | La duración de una pasada en segundos | Redondearla al segundo |
| `progress/explorations/prueba-real-importacion-2026-09-12.md` (una línea) | Cifras de una pasada con datos reales: **puede ser un dato del humano** que `var/` ya no cazaba | Reescribir la frase sin ninguna cifra |
| `specs/20-trade-republic-product-file/decisions.md` (una línea de la tabla) | Tres palabras seguidas que están en la descripción de un movimiento | Cambiar una palabra de la frase |

No se usa la marca `no-real-data-ok` en ninguna: todas se arreglan reescribiendo.

## 7. Documentos

- `docs/conventions.md` §Tests: el punto «Los datos reales viven en…» y el bloque del
  guardián (qué mira, qué no caza, base vacía, columna nueva) pasan a describir la
  base de datos. Se quitan los puntos de la F23 (bytes, binarios, banco ilegible) y
  de la F34 (nombres de archivo); el de la F24 se queda, referido a
  `ImportUnparsedRow.reason`. §Tests con base de datos: «el `globalSetup` le hace una
  foto» añade que también lee las columnas comparadas, en solo lectura.
- `docs/architecture.md`: línea «Revisado el … por la feature 51» encima del ADR-017
  (fuente, columnas, lo que deja de vigilarse) y encima del ADR-027 (el global setup
  lee además esas columnas). Los ADR no se reescriben.
- `docs/data-model.md`: el comentario del enum que dice «colisiona con `var/`».
- `docs/trade-republic-product-files.md` y `docs/myinvestor-product-files.md`: las
  notas «Esta línea la lee un test» y «Ojo con el guardián» dejan de ser ciertas.

## 8. Alternativas descartadas

- **Tablas con datos inventados** (la salida «a las malas» del humano): una tabla
  inventada no contiene ningún dato suyo, así que no puede cazar una fuga. El
  mecanismo ya se prueba con datos inventados en memoria.
- **Que el guardián abra él la conexión** (pasándole la URL real): más simple de
  leer, pero un archivo de test abriría la base del humano, que es justo lo que
  `docs/conventions.md` prohíbe y lo que el ADR-027 concentra en el global setup.
- **Guardar en el repositorio una lista de valores o de sus huellas:** versionar los
  datos para protegerlos, ya descartado en el ADR-017.
- **Mantener las dos fuentes hasta la F52:** no arregla nada (lo que solo está en
  `var/` se deja de vigilar igual al borrarla) y deja el guardián con dos caminos.
- **Subir el umbral a cinco cifras:** medido, cero coincidencias hoy en vez de ocho,
  pero quedan fuera 310 de los 1065 importes (casi todas las compras de menos de
  cien euros). Queda como alternativa viva en `decisions.md` 🔴 3.

## 9. Lo que se sabe que se pierde

Medido: de los 724 importes y 909 frases que el guardián saca hoy de `var/`, 445 y
284 están también en la base. El resto está en los archivos y no en la base. No se
ha mirado uno a uno qué es: una parte es ruido de leer el archivo crudo (trozos de
fecha leídos como número) y otra es texto del extracto que el parser no guarda. A
cambio, la base aporta 620 importes y 52 frases que `var/` no tenía, porque `var/`
solo tiene los archivos de las últimas descargas.
