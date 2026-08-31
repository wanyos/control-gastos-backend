# Resumen — feature 32 `balance-reconciliation`

Fecha de cierre: 2026-08-30
Intención original: `feature_list.json` → feature `balance-reconciliation`, bloque `intent`
Spec: [`specs/balance-reconciliation/`](../../specs/balance-reconciliation/decisions.md) · ADR nuevo: **ADR-030**

## Qué hace ahora la app que antes no

**Cuando importas, la app comprueba sus propias cuentas contra lo que dice el
archivo y te avisa si no cuadran.** La feature 31 dejó a cada cuenta diciendo un
saldo real; esta vigila que ese número siga cuadrando.

Cada archivo que entra pasa por **dos comprobaciones**, y cuál se hace lo decide
lo que el archivo trae, nunca de qué banco es:

- **Línea a línea** — dentro del archivo, entre dos líneas seguidas que traigan
  las dos su saldo: la diferencia entre esos dos saldos tiene que ser el importe
  de la línea. Es la cadena corta (Bankinter, Openbank).
- **Contra el saldo del preámbulo** — el saldo que el archivo declara arriba
  contra el ancla guardada de la cuenta más lo que ha entrado después de ella. Es
  la cadena larga (N26, MyInvestor, Openbank).

Si la diferencia **no es exactamente 0,00**, la respuesta de importar te lo dice
con la cuenta, la fecha, el número que calcula la app, el número del archivo, la
diferencia y cuál de las dos comprobaciones lo encontró. Y un contador,
`balanceMismatchCount`, con el total de la ejecución: un `0` cierra el tema de un
vistazo.

Tres cosas que **no** cambian, y son parte de la decisión:

- **Un descuadre no tumba nada.** El archivo entra igual (`status: "imported"`),
  se guarda todo y la ejecución sigue con el siguiente.
- **No mueve ningún saldo ni toca el ancla.** Donde manda el archivo, sigue
  mandando el archivo. `GET /api/accounts` **no cambia**: ni un campo nuevo.
- **No se guarda en ninguna parte.** No hay migración ni columna nueva: el
  descuadre viaja en la respuesta de esa importación y desaparece con ella.

Donde no hay dos números que comparar —un archivo sin ningún saldo, un hueco
entre dos líneas, o el primer archivo de una cuenta, que es el que la ancla— no
se dice nada. Eso no es «está bien»: es «esta vez no hubo comprobación».

## Por dónde se usa (puntos de entrada)

- `POST /api/import` — importar desde Drive. La respuesta gana
  `balanceMismatches` en cada archivo y `balanceMismatchCount` en la raíz.
- `POST /api/import/local` — la reimportación desde la copia local, con la misma
  forma exacta (comparte el mismo núcleo, no duplica nada).
- Contrato para el frontend: [`docs/api-contract.md`](../../docs/api-contract.md),
  sección de `POST /api/import` (campos, tabla de los dos valores de `check` y el
  aviso de que `GET /api/accounts` no cambia).

## Dónde está el código (para revisión directa)

### Las dos comprobaciones (el corazón de la feature)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Comprobación línea a línea; pura, sin base de datos ni ancla | `findPerLineMismatches` | [import.balance.service.ts:124](../../src/modules/import/import.balance.service.ts#L124) |
| Comprobación contra el saldo del preámbulo; suma desde el ancla guardada | `findStatementBalanceMismatch` | [import.balance.service.ts:169](../../src/modules/import/import.balance.service.ts#L169) |
| Lo que viaja en el informe: cuenta, fecha, los dos números, la diferencia y cuál de las dos comprobaciones fue | `BalanceMismatch` | [import.balance.service.ts:22](../../src/modules/import/import.balance.service.ts#L22) |
| Tolerancia cero, sin constante de margen en ninguna parte | `isMatch` | [import.balance.service.ts:50](../../src/modules/import/import.balance.service.ts#L50) |
| La suma «ingreso suma, gasto resta, neutro no toca», ahora compartida por la fórmula del saldo y por la comprobación | `netOf` | [movements.service.ts:103](../../src/modules/movements/movements.service.ts#L103) |

### El enganche en la importación

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Llama a las dos comprobaciones y mete el resultado en el informe del archivo | `importStatement` | [import.service.ts:592](../../src/modules/import/import.service.ts#L592) |
| Lee el ancla **ANTES** de anclar: es la línea de la que depende que la comprobación compruebe algo | `readStoredAnchor` | [import.service.ts:732](../../src/modules/import/import.service.ts#L732) |
| Suma el contador de toda la ejecución (las dos vías, Drive y local) | `totals` | [import.service.ts:791](../../src/modules/import/import.service.ts#L791) |
| Los campos nuevos del informe por archivo y de la ejecución | `StatementResult`, `ImportRunResult`, `LocalImportRunResult` | [import.types.ts:78](../../src/modules/import/import.types.ts#L78) |

### Tests

| Qué cubre | Código |
| --- | --- |
| Las dos comprobaciones aisladas: 15 tests (cuadra, no cuadra, hueco, sin saldos, un céntimo de diferencia, ventana del ancla) | [import.balance.service.test.ts:41](../../src/modules/import/import.balance.service.test.ts#L41) |
| Un descuadre de línea sale con sus cinco datos, el archivo se importa igual y el siguiente entra | [import.service.test.ts:1650](../../src/modules/import/import.service.test.ts#L1650) |
| El descuadre no toca el ancla guardada | [import.service.test.ts:1705](../../src/modules/import/import.service.test.ts#L1705) |
| Descuadre del preámbulo en una cuenta ya anclada | [import.service.test.ts:1737](../../src/modules/import/import.service.test.ts#L1737) |
| **El test del orden**: graba las llamadas a la base y exige que el ancla se lea antes de anclar | [import.service.test.ts:1783](../../src/modules/import/import.service.test.ts#L1783) |
| Archivo sin ningún saldo: entra igual y no se dice nada | [import.service.test.ts:1824](../../src/modules/import/import.service.test.ts#L1824) |
| `GET /api/accounts` y `/api/accounts/:id` no mueven el saldo con un descuadre delante | [import.service.test.ts:1852](../../src/modules/import/import.service.test.ts#L1852) |
| La reimportación local reporta igual que la de Drive | [import.local.service.test.ts:553](../../src/modules/import/import.local.service.test.ts#L553) |
| `netOf` es la MISMA suma que usa la fórmula del saldo | [movements.test.ts:431](../../src/modules/movements/movements.test.ts#L431) |

### Documentación

| Qué | Dónde |
| --- | --- |
| Los campos nuevos, los dos valores de `check` y el «`GET /api/accounts` NO cambia» | [docs/api-contract.md](../../docs/api-contract.md) |
| **ADR-030**: las dos comprobaciones, por qué no pueden reutilizar el cálculo del saldo, por qué tolerancia cero y por qué no se persiste | [docs/architecture.md:2390](../../docs/architecture.md#L2390) |

## Cumplimiento de la intención

- ✅ «Cuando la cuenta es de las que traen el saldo en sus archivos, el calculado
  se sigue haciendo, pero para comparar» → se cumple: el cálculo corre en cada
  importación y solo alimenta el informe. Verificado en
  `import.service.test.ts:1737` (preámbulo) y `import.balance.service.test.ts:42`
  (línea a línea).
- ✅ «Cuando no coinciden, la importación me lo dice con la cuenta, la fecha, los
  dos números y la diferencia. No falla el import: importa y avisa. Y el saldo que
  se queda sigue siendo el del archivo» → se cumple entero. Los cinco datos y el
  `check`, en `import.service.test.ts:1650`; que el archivo sale `imported` y el
  siguiente entra, en el mismo test; que el saldo no se mueve, en
  `import.service.test.ts:1852`; que el ancla no se toca, en `:1705`.
- ✅ «Cuando el extracto de N26 o MyInvestor NO trae la línea del saldo escrita a
  mano, el archivo se importa igual y esa vez no hay comprobación» → se cumple.
  Verificado en `import.service.test.ts:1824` y en
  `import.balance.service.test.ts:357`.

## Decisiones que se tomaron por ti

- **(delegado) Tolerancia cero.** Hay descuadre en cuanto la diferencia no es
  exactamente `0,00`. Un margen de un céntimo taparía justo el error que un fallo
  de redondeo produce. No existe ninguna constante de tolerancia en el código, ni
  a cero: `import.balance.service.ts:50`.
- **(delegado) El aviso solo en el informe de la importación.** `/api/accounts` no
  gana nada, para no acabar guardando un aviso que se queda viejo.
- **(añadido) Un hueco no es un descuadre.** Si una línea del par no trae saldo,
  ese par se salta en silencio.
- **(añadido) El archivo que ancla la cuenta no se compara contra sí mismo**, ni
  se compara un extracto más antiguo que el ancla: esas veces no hay comprobación.
- **(añadido) El contador `balanceMismatchCount`** de toda la ejecución, para que
  un `0` cierre el tema sin leer archivo por archivo.
- **(añadido) La reimportación local se comporta igual** que la de Drive; hay un
  test cuyo único trabajo es impedir que las dos vías se separen.

## Qué NO se tocó / quedó fuera

- **No se corrige ningún descuadre.** Esto detecta y cuenta; qué hacer el día que
  salga el primero es decisión tuya.
- **No hay vigilancia de fondo.** Los descuadres solo se ven cuando importas: un
  mes sin importar es un mes sin comprobación.
- **La comprobación no cruza la frontera entre dos archivos.** Si el último
  movimiento de un extracto y el primero del siguiente no encajan, la de línea a
  línea no lo ve; la del preámbulo sí lo vería en N26 y MyInvestor, no en
  Bankinter ni Openbank.
- **El frontend no se ha tocado** (regla de oro del workspace). Tiene el contrato
  actualizado esperándole en `docs/api-contract.md`.
- No se toca la vista de Patrimonio, los productos de inversión ni el
  enriquecimiento de movimientos.

## Notas para el futuro

- **La prueba real es tuya y sigue pendiente**: lanzar `POST /api/import/local` y
  mirar `balanceMismatchCount`. La suite dice que el código hace lo que el spec
  dice, no que tus cuatro cuentas cuadren.
- **No muevas la lectura del ancla de sitio.** Si `readStoredAnchor` acaba
  después del anclaje, la comprobación compara el archivo consigo mismo y **no
  encuentra nada nunca**, con la suite en verde. Comprobado invirtiendo el orden y
  ejecutando: de los 54 tests del archivo, solo uno se pone rojo, el de
  `import.service.test.ts:1783`. Está escrito en el ADR-030 y en un comentario en
  la propia línea.
- Anotado por el implementer y no aplicado: el árbol de archivos del ADR-004 en
  `src/architecture.test.ts` no lista los dos archivos nuevos (esa comprobación
  solo mira que los archivos esperados existan, así que no rompe nada), y no hay
  test de qué pasa si falla la consulta **dentro** de la comprobación (el archivo
  quedaría `failed`, como cualquier otro fallo posterior al guardado).
- `scripts/bankinter-pdf-a-xlsx.mjs` sigue sin pasar `format:check`; es previo y
  ajeno a esta feature.
