# Implementación — feature 6 `bankinter-parser`

> Parser del extracto `.xlsx` de Bankinter a movimientos estructurados + IBAN,
> **sin base de datos, sin persistir, sin deduplicar y sin mover archivos**.
> Volcado del resultado a un JSON local gitignoreado. No-SDD (contra `intent` +
> `acceptance` de la feature 6).

## Estado

- `feature_list.json`: feature 6 en **`in_progress`** (a la espera del reviewer;
  NO la cierro yo).
- `./init.sh`: **verde** — typecheck OK + **146 tests** (antes 123; +23 nuevos).
- `pnpm lint`: verde. `pnpm format:check`: verde.

## Modelo final (columnas REALES de Bankinter, confirmado por el humano 2026-08-04)

`MovimientoParseado { fechaContable, fechaValor (ISO 'YYYY-MM-DD'), descripcion,
importe (number con signo), saldo (number), divisa (string), tipo
'ingreso'|'gasto' }`. Refleja la tabla real `Fecha contable | Fecha valor |
Descripción | Importe | Saldo | Divisa`. `BankinterParseResult { banco,
cuentaIban, movimientos[], noReconocidas[] }` y `FilaNoReconocida { fila, motivo }`
sin cambios. `importe` y `saldo` se aceptan como número nativo o texto español;
una fila con fecha, importe o saldo ilegible → `noReconocidas`.

## Decisión de librería `.xlsx`: `exceljs@^4.4.0`

- **Elegida** frente a SheetJS `xlsx`: la versión publicada en npm de SheetJS está
  **congelada en 0.18.5** con CVEs sin parchear (prototype pollution
  CVE-2023-30533, ReDoS CVE-2024-22363); las corregidas solo viven en su CDN, lo
  que rompería el flujo pnpm/lockfile del proyecto.
- `exceljs` es MIT, está en npm, lee desde `Buffer` y **escribe** libros en
  memoria → el fixture sintético de test se genera en código, sin datos reales ni
  red.
- **Coste asumido:** árbol de dependencias más pesado (`jszip`, `unzipper`,
  `archiver`, `fast-csv`, `saxes`, `dayjs`). Documentado en `docs/stack.md` y
  ADR-010. **Sin variables de entorno nuevas.**

## Exposición elegida

- Endpoint read-only **`POST /api/parser/bankinter`** (coherente con la f5,
  consumible por el frontend). Lee las **copias locales de la f5**
  (`var/drive-read/bankinter/<año>/*.xlsx`), parsea archivo a archivo (fallo
  aislado) y **vuelca** cada resultado a `var/parsed/bankinter/<año>/<archivo>.json`.
  No toca Drive, no persiste en BD, no mueve nada. Documentado en
  `docs/api-contract.md`.

## Formato real de Bankinter (verificado sobre el OOXML)

El `.xlsx` real (`var/drive-read/bankinter/2026/`) tiene cabecera de 6 columnas
**`Fecha contable | Fecha valor | Descripción | Importe | Saldo | Divisa`** (no
existen columnas `Concepto` ni `Tipo de movimiento`; esos textos solo aparecen en
el preámbulo como etiquetas de filtro). El importe se guarda como **número
nativo** (`-45.37`) y las fechas como texto `dd/mm/yyyy`. El modelo se ajustó a
estas columnas (confirmado por el humano el 2026-08-04): fuera `concepto`/
`tipoMovimiento`, dentro `saldo` y `divisa`. El parser mapea **por nombre de
cabecera** (robusto a la posición) y acepta `importe`/`saldo` como número nativo o
texto español.

## Dónde está el código

| Qué | Dónde |
| --- | --- |
| Parser puro (buffer → resultado) | [src/modules/bankinter/bankinter.parser.ts:43](../../src/modules/bankinter/bankinter.parser.ts#L43) |
| Extracción del IBAN del preámbulo | [bankinter.parser.ts:101](../../src/modules/bankinter/bankinter.parser.ts#L101) |
| Localización robusta de cabecera (por nombre) | [bankinter.parser.ts:122](../../src/modules/bankinter/bankinter.parser.ts#L122) |
| Mapeo de fila → movimiento / `noReconocidas` (incl. saldo/divisa) | [bankinter.parser.ts:139](../../src/modules/bankinter/bankinter.parser.ts#L139) |
| `tipo` derivado del signo del importe | [bankinter.parser.ts:177](../../src/modules/bankinter/bankinter.parser.ts#L177) |
| Fecha `dd/mm/yyyy` → ISO | [bankinter.parser.ts:195](../../src/modules/bankinter/bankinter.parser.ts#L195) |
| Importe/saldo español o nativo → number con signo | [bankinter.parser.ts:224](../../src/modules/bankinter/bankinter.parser.ts#L224) |
| Modelo `MovimientoParseado` | [src/modules/bankinter/bankinter.types.ts:9](../../src/modules/bankinter/bankinter.types.ts#L9) |
| Modelo `BankinterParseResult` | [bankinter.types.ts:35](../../src/modules/bankinter/bankinter.types.ts#L35) |
| Servicio: parseo de copias locales + volcado JSON | [src/modules/bankinter/bankinter.service.ts:20](../../src/modules/bankinter/bankinter.service.ts#L20) |
| Escritura del JSON volcado | [bankinter.service.ts:38](../../src/modules/bankinter/bankinter.service.ts#L38) |
| Endpoint `POST /api/parser/bankinter` | [src/modules/bankinter/bankinter.routes.ts:36](../../src/modules/bankinter/bankinter.routes.ts#L36) |
| Registro del módulo en la app | [src/app.ts:34](../../src/app.ts#L34) |
| Fixture sintético `.xlsx` (test helper) | [src/modules/bankinter/bankinter.fixture.ts:23](../../src/modules/bankinter/bankinter.fixture.ts#L23) |
| Guardián: parser sin `prisma` | [src/architecture.test.ts:123](../../src/architecture.test.ts#L123) |
| Guardián: `var/parsed/` gitignoreado | [src/architecture.test.ts:142](../../src/architecture.test.ts#L142) |
| `.gitignore` del volcado | [.gitignore:18](../../.gitignore#L18) |

## Mapeo acceptance → test

Todos los tests usan el fixture `.xlsx` **sintético** (datos inventados, sin red).

| Criterio de `acceptance` | Test |
| --- | --- |
| A1 — salta preámbulo, localiza cabecera, lista movimientos + IBAN | [bankinter.parser.test.ts:8](../../src/modules/bankinter/bankinter.parser.test.ts#L8) |
| A2 — campos reales (incl. saldo/divisa); importe/saldo nativo o español; fechas `dd/mm/yyyy` | [parser.test.ts:20](../../src/modules/bankinter/bankinter.parser.test.ts#L20), [:159](../../src/modules/bankinter/bankinter.parser.test.ts#L159), [:173](../../src/modules/bankinter/bankinter.parser.test.ts#L173) |
| A3 — `tipo` por signo (neg→gasto, pos→ingreso) | [parser.test.ts:59](../../src/modules/bankinter/bankinter.parser.test.ts#L59) |
| A4 — NO deduplica: dos filas idénticas aparecen las dos | [parser.test.ts:70](../../src/modules/bankinter/bankinter.parser.test.ts#L70), [service.test.ts:31](../../src/modules/bankinter/bankinter.service.test.ts#L31) |
| A5 — fila no interpretable → `noReconocidas` (fila+motivo), resto se parsea | [parser.test.ts:81](../../src/modules/bankinter/bankinter.parser.test.ts#L81), [service.test.ts:72](../../src/modules/bankinter/bankinter.service.test.ts#L72) |
| A6 — vuelca a JSON gitignoreado; NO BD, NO mover | [service.test.ts:31](../../src/modules/bankinter/bankinter.service.test.ts#L31), [routes.test.ts:38](../../src/modules/bankinter/bankinter.routes.test.ts#L38), [architecture.test.ts:142](../../src/architecture.test.ts#L142) |
| A7 — sin Prisma/tablas, sin dedup, solo Bankinter, sin UI/mover; parser sin `prisma` | [architecture.test.ts:123](../../src/architecture.test.ts#L123) |
| A8 — volcado gitignoreado: ningún dato real versionado | [architecture.test.ts:142](../../src/architecture.test.ts#L142) + `.gitignore` |
| A9 — cada criterio con test y fixture sintético; init verde; dep en stack.md + ADR | suite completa (146) + `docs/stack.md` + ADR-010 |

Cobertura extra: modelo sin `concepto`/`tipoMovimiento` →
[parser.test.ts:43](../../src/modules/bankinter/bankinter.parser.test.ts#L43);
layout real exacto (importe/saldo nativos) →
[:92](../../src/modules/bankinter/bankinter.parser.test.ts#L92);
saldo no numérico → `noReconocidas` →
[:117](../../src/modules/bankinter/bankinter.parser.test.ts#L117);
IBAN ausente + `divisa` por defecto `''` →
[:129](../../src/modules/bankinter/bankinter.parser.test.ts#L129);
sin cabecera reconocible lanza `ValidationError` →
[:143](../../src/modules/bankinter/bankinter.parser.test.ts#L143).

## Archivos creados / modificados

**Creados**
- `src/modules/bankinter/bankinter.parser.ts` (parser puro)
- `src/modules/bankinter/bankinter.types.ts` (modelo)
- `src/modules/bankinter/bankinter.service.ts` (parseo local + volcado JSON)
- `src/modules/bankinter/bankinter.routes.ts` (endpoint)
- `src/modules/bankinter/bankinter.fixture.ts` (helper de fixture sintético)
- `src/modules/bankinter/bankinter.parser.test.ts` (13 tests)
- `src/modules/bankinter/bankinter.service.test.ts` (4 tests)
- `src/modules/bankinter/bankinter.routes.test.ts` (2 tests)
- `progress/implementations/bankinter-parser.md` (este informe)

**Modificados**
- `package.json` + `pnpm-lock.yaml` (dependencia `exceljs`)
- `src/app.ts` (registro del módulo bajo `/api/parser`)
- `src/architecture.test.ts` (árbol esperado + 2 guardianes nuevos)
- `.gitignore` (`var/parsed/`)
- `docs/stack.md` (exceljs), `docs/architecture.md` (ADR-010 + árbol),
  `docs/api-contract.md` (endpoint + modelo), `progress/current.md`

## Salida de verificación (último `./init.sh`)

```
── 4. Type checking (tsc) ──
[OK]    Type check OK (tsc sin errores)
── 5. Ejecutando tests ──
 Test Files  14 passed (14)
      Tests  146 passed (146)
[OK]    Todos los tests pasan
── 6. Resumen ──
[OK]    Entorno listo.
```
`pnpm lint` → 0 problemas. `pnpm format:check` → todos los archivos OK.

## Sugerencias fuera de scope (NO aplicadas)

- **Persistencia + deduplicación** de los movimientos parseados a la BD: es la
  siguiente feature (fuera de scope explícito de la 6).
- `docs/data-model.md` aparece como untracked preexistente en el repo, ajeno a
  esta feature; no lo he tocado.
