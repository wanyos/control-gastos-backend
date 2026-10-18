# Review — F59 `recurring-people-by-category`

## Review (2026-10-17)

**Veredicto:** CHANGES_REQUESTED

### Cambios requeridos

1. **Acceptance 3 no se cumple en general, y el test elige importes con los que no se nota.**
   El acceptance 3 dice «El total mensual de la respuesta es el mismo antes y
   después de mover una transferencia de grupo» (del «cómo sé» 4 del humano: «no
   cambia»). Con el redondeo de la F58 (`monthlyCostOf`,
   `src/modules/recurring-expenses/recurring-expenses.service.ts:183`, y la suma de
   partes ya redondeadas en `:364-368`), mover una transferencia de grupo sí
   cambia el total un céntimo en algunos casos. Lo he comprobado con la misma
   fórmula y el mismo `Prisma.Decimal` del servicio (cálculo aislado, no una
   petición a la API):

   ```
   $ pnpm exec tsx <scratchpad>/drift.mts
   antes  (10.00 + 10.00 en a personas): 1.67
   despues (10.00 a personas, 10.00 en su categoria): 1.66
   ```

   - `src/modules/recurring-expenses/recurring-expenses.test.ts:557-600`
     (`keeps the monthly total the same when a transfer changes group`) usa
     importes elegidos para que el redondeo no se note (lo dice el informe,
     decisión 3), así que el check 4 sale en verde sin que se cumpla lo que
     describe.
   - `docs/api-contract.md:1550-1555` escribe ahora que el total «puede moverse
     **un céntimo**». Contradice el acceptance 3, y nadie ha aprobado esa
     excepción: es un cambio del QUÉ.

   Qué hacer: no lo decide el implementer. El leader lo lleva al humano con dos
   opciones: (a) aceptar el céntimo, y entonces se reescriben el acceptance 3 y la
   frase 4 de `como_se_que_esta_bien` con esa excepción, y el test añade además un
   caso que muestre el céntimo; o (b) total exacto siempre, lo que cambia cómo se
   calcula `monthlyTotal` (decisión 6 del ADR-037, aprobada en la F58), y el test
   añade un caso con importes como los de arriba que hoy fallaría.

### Comprobado sin hallazgos

- Regla: un gasto con palabra de transferencia o `bizum` se queda en
  `transfersToPeople` solo con categoría de nombre exacto `Otros gastos` o
  `Transferencias a personas` (o sin categoría, que es lo que mantiene los tests
  de la F58 sin cambios); con otra categoría va a su entrada de `variable`,
  sumada con los demás gastos de esa categoría (test `moves a transfer with any
  other category…`, que comprueba movimientos, meses y `monthlyCost`). Los dos
  nombres existen en `src/modules/categories/categories.seed.ts:24,27`.
- Recibos y traspasos emparejados: el diff de los tests existentes solo añade
  líneas; `src/modules/transfers/` sin cambios (`git diff HEAD --stat` vacío).
- La consulta no escribe: el servicio no tiene `create`/`update`/`delete`/`upsert`
  (grep vacío) y el test `writes nothing…` sigue pasando.
- Contrato: describe la regla con los dos nombres y qué pasa al renombrar
  (`docs/api-contract.md:1531-1548`); lo vigila el test de `recurring-expenses.docs.test.ts`.
- Documentos que la feature vuelve falsos: `git grep` de «a personas»,
  `transfersToPeople`, `transfers to people`, `isTransferToPerson` fuera de
  `progress/`, `specs/`, `src/`: `README.md:87,154` siguen siendo verdad; el
  ADR-037 lleva su línea «Revisado el 2026-10-17…» como los demás ADR revisados.
- Arquitectura y convenciones, `docs/lessons.md` (entradas 1-3, ninguna se
  repite), `docs/vocabulary.md` (sin términos nuevos), datos de prueba
  inventados, ninguna cifra ni nombre real del humano. CHECKPOINTS C1-C5 (C4 bis
  no aplica: la feature no lee datos de fuera; C6/C7 no aplican).
- `./init.sh`: `init exit=0`, `Test Files 85 passed (85)`, `Tests 1444 passed (1444)`,
  tsc, oxlint y `prettier --check` en verde.
- `./init.sh --checks`: `checks exit=0`, **6 de 6 en verde**; cada check filtrado
  imprime `Tests 1 passed`, ninguno vacío. El check 4 es verde, pero ver hallazgo 1.

## Review — segunda revisión (2026-10-17)

**Veredicto:** APPROVED
Comprobado: acceptance ↔ tests, arquitectura, convenciones, verificación,
CHECKPOINTS C1-C5 y C8 (C4 bis, C6 y C7 no aplican). Checks: 6 de 6 en verde.
Sin hallazgos.
Resumen de cierre: `progress/summaries/recurring-people-by-category.md`.

Comprobaciones de esta pasada, con su comando y su salida:
- Criterio 4 reescrito con el visto bueno del humano (`intent`, `acceptance` 3 y
  `descripcion` del check 4): el total cambia como mucho un céntimo.
- `recurring-expenses.test.ts`, `keeps the monthly total the same when a transfer changes group`:
  ahora usa 12,87 € y 9,03 €, con los que el céntimo sí se nota (`1.83` antes,
  `1.82` después). Comprueba que la transferencia sigue contando (`monthlyCost`
  `1.07` en su categoría) y que la diferencia es ≤ 1 céntimo.
- Que el «como mucho un céntimo» del contrato (`docs/api-contract.md:1551-1558`) es
  verdad para cualquier importe, y no solo en el ejemplo: lo he recorrido entero
  con la fórmula del servicio (`monthlyCostOf` + `Prisma.Decimal`), con
  `pnpm exec tsx <scratchpad>/drift2.mts`. El recorrido mueve una transferencia
  de 1 a 59 céntimos entre dos grupos de 0 a 59 céntimos, y eso cubre todos los
  restos de dividir entre 12. Sale `max drift 0.01`. El test del check 5 exige ahora esa frase.
- Que nada más cambió: no se ha tocado `recurring-expenses.service.ts`. En los tests no se quita ninguna línea
  (`git diff … | grep -c "^-[^-]"` → `0`), y `src/modules/transfers/` sigue sin
  cambios.
- Nadie más ejecutaba la suite: ningún `node` con `vitest` en la lista de procesos.
- `./init.sh` → `init exit=0`, `Test Files 85 passed (85)`, `Tests 1444 passed (1444)`,
  tsc, lint y format en verde.
- `./init.sh --checks` → `checks exit=0`, `Checks: 6 de 6 en verde.`; cada check que
  filtra tests por nombre imprime `Tests 1 passed`.
