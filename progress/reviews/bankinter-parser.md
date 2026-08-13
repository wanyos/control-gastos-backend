# Review — feature 6 `bankinter-parser`

**Veredicto:** APPROVED

> No-SDD (`"sdd": false`). Se mide contra el `intent` + `acceptance`
> **actualizados** de la feature 6 (modelo ajustado a las columnas REALES de
> Bankinter: `Fecha contable | Fecha valor | Descripción | Importe | Saldo |
> Divisa`; fuera `concepto`/`tipoMovimiento`, dentro `saldo` y `divisa`).

## Puertas reejecutadas por el reviewer

- `bash ./init.sh` → **verde**: `[OK] Entorno listo`. Type check OK (tsc sin
  errores). **14 test files, 146 tests pasan (146/146)**.
- `pnpm lint` → **verde** (0 problemas).
- `pnpm format:check` → **verde** (All matched files use Prettier code style).
- `git ls-files` no trackea ningún `.xlsx` ni JSON con datos reales bajo
  `var/drive-read/` ni `var/parsed/` (ni en ningún otro sitio del repo).

## Criterios de aceptación (feature 6, actualizada)

- [x] **A1 — Parser: salta preámbulo, localiza cabecera, movimientos + IBAN.**
  `parseBankinterXlsx` (`bankinter.parser.ts:43`), cabecera por nombre de columna
  (`findHeaderRow` :122), IBAN de `MOVIMIENTOS DE LA CUENTA <IBAN>` (`findIban`
  :101). Test `bankinter.parser.test.ts:8`.
- [x] **A2 — 6 columnas reales; importe/saldo nativo o texto español; fechas
  dd/mm/yyyy → ISO.** Modelo con las 6 columnas (`bankinter.types.ts:9`).
  `parseSpanishAmount` acepta número nativo y `1.234,56` (`:224`),
  `parseSpanishDate` `:195`. Tests `parser.test.ts:20` (nativo + español),
  `:92` (layout real -45.37 / 9954.63), `:153-170` (amount), `:172-183` (date).
- [x] **A3 — `tipo` por signo (neg→gasto, pos→ingreso).** `parser.ts:177`. Test
  `parser.test.ts:59` y `:106`.
- [x] **A4 — NO deduplica.** Dos filas idénticas `PAGO TARJETA -10` → 2. Test
  `parser.test.ts:70` y `service.test.ts:31` (sobreviven al volcado).
- [x] **A5 — Fila ilegible → `noReconocidas` (fila + motivo), resto se parsea.**
  `parseDataRow` acumula problemas (`parser.ts:139-168`). Tests
  `parser.test.ts:81` (fila 15, motivo con `importe`), `:117` (saldo no
  numérico), `service.test.ts:72` (archivo malo aislado en `failed[]`).
- [x] **A6 — Vuelca a JSON gitignoreado; NO BD, NO mover en Drive.** Servicio
  escribe a `dumpBaseDir` (`bankinter.service.ts:38`); sin Prisma ni Drive.
  Tests `service.test.ts:31`, `routes.test.ts:38`.
- [x] **A7 — Sin tablas/Prisma, sin dedup, solo Bankinter, sin UI, sin mover;
  parser sin `prisma`.** Guardián `architecture.test.ts:123`. `bankName =
  'bankinter'` (único banco). Sin cambios de esquema Prisma.
- [x] **A8 — Volcado en `.gitignore`.** `.gitignore:20` (`var/parsed/`); guardián
  `architecture.test.ts:142`. `git ls-files` limpio de datos reales.
- [x] **A9 — Cada criterio con test + fixture sintético; init verde; dep en
  stack.md + ADR.** Fixture en memoria vía `exceljs.writeBuffer`
  (`bankinter.fixture.ts:23`), sin datos reales ni red. `exceljs@^4.4.0` en
  `package.json`, pinneado en `pnpm-lock.yaml`, documentado en `docs/stack.md:35`
  y ADR-010.

## Verificaciones específicas del encargo

- [x] **Modelo REAL.** `MovimientoParseado` tiene `fechaContable`, `fechaValor`
  (ISO), `descripcion`, `importe` (signo), `saldo`, `divisa`, `tipo`; **NO** tiene
  `concepto` ni `tipoMovimiento`. `bankinter.types.ts:9`. Test que fija las claves
  exactas: `parser.test.ts:43`.
- [x] **Fixture sintético, sin red.** Datos inventados; el `.xlsx` se genera en
  código con exceljs; ningún test hace red ni lee archivos reales.
- [x] **Privacidad.** `var/parsed/` gitignoreado con guardián; nada trackeado.
- [x] **Límites.** Parser/servicio/rutas/tipos sin `prisma` (guardián
  `architecture.test.ts:123`); no crea esquema; no UI; solo Bankinter.
- [x] **Dependencia/ADR.** `exceljs` declarada + ADR-010; el mayor peso del árbol
  (`jszip`, `unzipper`, `archiver`, `fast-csv`, `saxes`, `dayjs`) está razonado
  frente a SheetJS (CVEs congelados en 0.18.5). Trade-off aceptable y documentado.
- [x] **Contrato.** `docs/api-contract.md` refleja `POST /api/parser/bankinter`
  (`:305`) y el modelo actualizado con `saldo`/`divisa` (`:282-303`).

## Arquitectura (docs/architecture.md)

- [x] HTTP sin lógica de negocio: `bankinter.routes.ts` solo delega en el servicio
  (endpoint sin cuerpo, nada que validar con schema).
- [x] Acceso a datos aislado: ninguna ruta/servicio toca Prisma (guardián).
- [x] Errores tipados: el parser lanza `ValidationError` de dominio ante fallo
  estructural (`parser.ts:50`, `:58`); el servicio sanitiza mensajes
  (`describeError` :98).
- [x] Estructura por módulos (ADR-004): todo vive en `modules/bankinter/`. Árbol
  guardado en `architecture.test.ts:56-62`.
- [x] ADR-010 registrado con alternativas y consecuencias.

## Convenciones (docs/conventions.md)

- [x] Estilo: comillas simples, sin `;`, 2 espacios, ≤100 cols (lint + format
  verdes). Imports vendor→relativos con `.js`. `import type` para tipos.
- [x] Nombres: archivos kebab/recurso (`bankinter.parser.ts`), tipos PascalCase,
  funciones camelCase. Identificadores de dominio en español (decisión previa del
  proyecto para el parser de banco).
- [x] Manejo de errores: `AppError`/`ValidationError`, sin `throw` de strings, sin
  `console.*` (grep limpio en el módulo).

## Verificación (docs/verification.md)

- [x] Tests con recursos reales: tempdirs reales (`mkdtemp`) en service/routes,
  no mocks del filesystem; `app.inject()` en routes.
- [x] Aserciones de resultado concreto (`toEqual`/`toMatchObject` con la forma
  exacta), no "no lanza".
- [x] Camino feliz + caminos de error (fila ilegible, saldo no numérico, sin
  cabecera → `ValidationError`, archivo corrupto aislado, sin copias locales).

## CHECKPOINTS.md

- [x] C1 — Arnés completo (init verde, archivos base y docs presentes).
- [x] C2 — Estado coherente (solo la feature 6 en `in_progress`;
  `progress/current.md` describe la sesión activa).
- [x] C3 — Arquitectura respetada (por módulos, sin deps sin justificar, sin
  `console.log`/TODO, convenciones OK).
- [x] C4 — Verificación real (test por módulo, feliz + error, recursos reales).
- [x] C5 — Sesión cerrada bien (sin temporales/builds sospechosos; los untracked
  son el código nuevo del módulo y el informe, legítimos).
- [x] C6 — Coherencia con proyecto hermano: `api-contract.md` (fuente de verdad
  del frontend) actualizado en la misma feature; sin modelos inventados.
- [ ] C7 — N/A (feature no-SDD).
- [x] C8 — Resumen de cierre escrito (ver abajo).

## Resumen de cierre (APPROVED)

- Escrito en `progress/summaries/bankinter-parser.md` → **sí**.

## Observaciones no bloqueantes

1. `bankinter.parser.ts:177` — un importe **exactamente 0** cae en `ingreso`
   (`importe < 0 ? 'gasto' : 'ingreso'`). El `acceptance` solo define negativo→gasto
   y positivo→ingreso; el cero es un caso no especificado. No es un defecto contra
   el criterio; anotado por si en la persistencia (feature futura) se quisiera un
   tercer estado o una regla explícita.
2. `docs/data-model.md` aparece como untracked preexistente, ajeno a esta feature;
   el implementer no lo tocó. Correcto dejarlo fuera de esta feature.

## Cambios requeridos

Ninguno.
