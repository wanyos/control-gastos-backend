# Design — F41 `transfer-batch-pairing`

> Refinamiento **local** de la F40: todo el cambio de lógica vive en la función
> pura `pairTransferCandidates` (`src/modules/transfers/transfers.service.ts:49`).
> Cero migración, cero archivo nuevo, cero cambio en la forma del informe:
> `TransferDetectionResult` y `AmbiguousTransferGroup` quedan como están.

## 1. Archivos que se tocan

| Archivo | Cambio |
| --- | --- |
| `src/modules/transfers/transfers.types.ts` | `TransferCandidate` gana `daySequence: number \| null` (hoy no lo lleva; hace falta para el desempate de R2). `AmbiguousTransferGroup` y `TransferDetectionResult` **no cambian**. |
| `src/modules/transfers/transfers.service.ts` | El `select` de `detectTransfers` añade `daySequence`; `pairTransferCandidates` gana el paso de resolución de grupos (ver §3). El escritor por transacción no cambia ni una línea. |
| `src/modules/transfers/transfers.service.test.ts` | Fixtures sintéticos de los 4 grupos reales + casos borde (ver §5). |
| `docs/api-contract.md` | Prosa de la regla (nota de `POST /api/import/local`, ~línea 260, y tabla del campo `transfers`, ~línea 1017): deja de decir «solo parejas inequívocas». |
| `docs/data-model.md` | §Traspasos (~línea 374) y la tabla de columnas (~línea 231): misma corrección de prosa. |

No se toca: `import.schema.ts` (el informe no cambia de forma), `schema.prisma`,
`architecture.test.ts` (no hay archivos nuevos), ninguna ruta.

## 2. Firmas

Ninguna firma nueva. `pairTransferCandidates` y `detectTransfers` conservan las
suyas; solo cambia qué cae en `pairs` y qué en `ambiguous`.

```ts
// transfers.types.ts — único cambio de tipo
export interface TransferCandidate {
  // ... campos actuales ...
  daySequence: number | null // posición dentro de su bookingDate (1 = primero)
}
```

## 3. Algoritmo: qué se añade y dónde

Hoy `pairTransferCandidates` hace, por `amount`: grafo bipartito → parejas de
unicidad mutua → el resto de componentes conexas con arista van a `ambiguous`.

El cambio entra **justo antes de dar una componente por dudosa**. Para cada
componente conexa que hoy iría a `ambiguous`:

1. Separar sus salidas (`expense`) y entradas (`income`).
2. **Condición (a):** `salidas.length === entradas.length`.
3. **Condición (b):** para **cada** combinación salida×entrada de la componente,
   `accountId` distinto y `|Δ bookingDate| ≤ 3` días (reusa `withinWindow`).
   Equivale a comprobar que el subgrafo bipartito de la componente es completo.
4. Si (a) y (b): ordenar cada lado por `(bookingDate asc, daySequence asc con
   null como 0, id asc)` y emparejar posición k con posición k. Los pares salen
   por el **mismo** camino que las parejas de unicidad mutua: mismo
   `randomUUID()` por par, misma transacción con `WHERE transferId: null`
   (R8), mismo contador `pairsCreated`.
5. Si no: la componente entera va a `ambiguous`, exactamente como hoy (R3, R4).

**Coherencia con la F40:** la pareja de unicidad mutua es el caso N=1 de esta
regla (1 salida, 1 entrada, combinación única válida). El camino existente de
grado 1 se conserva tal cual para garantizar R5 sin depender de equivalencias:
los tests de la F40 pasan sin tocar sus expectativas.

## 4. Respuesta a la pregunta delegada: ¿la separación por pareja de cuentas resuelve el punto 2?

**No por sí sola, y no hace falta un paso nuevo para ella.**

- La «separación por pareja de cuentas» entre grupos **ya existe**: los grupos
  dudosos de la F40 son componentes conexas, y dos parejas de cuentas sin
  movimiento en común nunca caen en la misma componente. No hay nada que separar
  que no esté ya separado.
- El cruce del punto 2 (dos salidas de 1000 de la misma cuenta, una entrada en
  cada uno de dos bancos, mismo día) es **una sola componente que mezcla dos
  parejas de cuentas compartiendo las salidas**. Separarlo literalmente por
  pareja de cuentas daría dos lotes de 2 salidas y 1 entrada — desigualados los
  dos — y el punto 2 quedaría dudoso, contra el acceptance. Lo que lo hace
  resoluble es la condición (b): las dos salidas son indistinguibles entre sí
  (misma cuenta, mismo importe, mismo día), cualquier combinación es válida, y
  da igual cuál queda enlazada con cada banco — el `transferId` solo excluye de
  totales y ningún saldo lo mira (`computeAccountBalance` no lee `transferId`,
  comprobado en la F40, y esta feature no lo cambia).

## 5. Fixtures sintéticos (delegado: probar los casos reales sin datos personales)

Cuentas inventadas (`bank-a ···0001`, `bank-b ···0002`, `bank-c ···0003`),
descripciones genéricas (`TRANSFER OUT` / `TRANSFER IN`), fechas de 2025-2026
elegidas al azar pero con la **misma estructura** que los grupos del informe del
2026-09-03 (los importes 1000/3000/500 son números redondos, no datos
personales; el guardián `src/no-real-data.test.ts` sigue aplicando):

| Fixture | Estructura (calcada del caso real) | Esperado |
| --- | --- | --- |
| Punto 1 | 3 salidas `bank-a` + 3 entradas `bank-b`, 1000, mismo día | 3 pares, orden de R2 |
| Punto 2 | 2 salidas `bank-a` + 1 entrada `bank-b` + 1 entrada `bank-c`, 1000, mismo día | 2 pares |
| Punto 3 | 2 salidas `bank-a` + 2 entradas `bank-b`, 3000, días consecutivos | 2 pares: d1↔d1, d2↔d2 |
| Punto 4 | 2 salidas `bank-a` + 1 entrada `bank-b`, 500 | 0 pares, grupo entero en `ambiguous` |
| Borde R4 | 2+2 igualadas pero encadenadas: salida d1, salida d4, entrada d3, entrada d7 (d1↔d7 fuera de ventana) | 0 pares, grupo entero en `ambiguous` |
| Empates R2 | mismo día con `daySequence` 1/2 y con `daySequence` null | orden determinista (null=0, luego id) |

Los cuatro primeros son unitarios sobre `pairTransferCandidates` (sin BD); la
idempotencia (R6) y el «solo cambia `transferId`» (R7) se prueban en la
integración existente añadiendo un grupo igualado al escenario.

## 6. Alternativas descartadas

1. **Separar literalmente por pareja de cuentas antes de comparar números**: deja
   el punto 2 sin resolver (ver §4) y no aporta nada en los puntos 1 y 3, que ya
   son de una sola pareja de cuentas.
2. **Emparejar parcialmente un grupo desigualado** (las combinaciones «obvias» y
   dejar el resto): es adivinar exactamente donde hay duda; el humano lo vetó
   («sigue dudoso entero»).
3. **Emparejar grupos igualados pero no totalmente combinables (el borde R4)**
   buscando un emparejamiento perfecto del grafo: existe caso con emparejamiento
   único demostrable, pero la regla deja de poder explicarse en una frase y el
   beneficio hoy es cero (ningún grupo real tiene esa forma). Si aparece uno, se
   verá en el informe y se decidirá con el caso delante.
4. **Ordenar solo por fecha e `id`, ignorando `daySequence`**: el `id` depende del
   orden de inserción del import; `daySequence` es el orden real del extracto
   dentro del día y ya existe en la fila. Usarlo cuesta un campo en el `select`.
