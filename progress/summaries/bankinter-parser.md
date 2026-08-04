# Resumen — feature 6 `bankinter-parser`

Fecha de cierre: 2026-08-04
Intencion original: `feature_list.json` -> feature `bankinter-parser`, bloque `intent`
Spec (si SDD): N/A — feature no-SDD (sdd:false), medida contra intent + acceptance.

## Que hace ahora la app que antes no

Ahora el backend sabe entender el `.xlsx` de Bankinter que ya sabia leer crudo de
Drive (feature 5): coge cada archivo, se salta el preambulo de metadatos del banco, y
saca una lista de movimientos estructurados (fecha contable, fecha valor, descripcion,
importe con signo, saldo, divisa y si es ingreso o gasto) mas el IBAN de la cuenta. El
resultado se vuelca a un JSON local para revisarlo a ojo. Antes solo tenias el Excel
crudo; ahora tienes datos. NO guarda en base de datos, NO deduplica y NO mueve nada en
Drive: eso es de otra feature.

## Por donde se usa (puntos de entrada)

- `POST /api/parser/bankinter` — recorre las copias locales que dejo la ingesta
  (`var/drive-read/bankinter/<ano>/*.xlsx`), parsea cada una y escribe su resultado en
  `var/parsed/bankinter/<ano>/<archivo>.json` (gitignoreado). Responde 200 con un
  resumen (parsedCount, failedCount, parsed[], failed[]); un archivo que falla se aisla
  en failed[] sin tumbar el resto.
- `parseBankinterXlsx(buffer)` — funcion pura reutilizable: devuelve
  { banco, cuentaIban, movimientos[], noReconocidas[] }.

## Donde esta el codigo (para revision directa)

### El parser (logica principal)

- parseBankinterXlsx: [bankinter.parser.ts:43](../../src/modules/bankinter/bankinter.parser.ts#L43)
- findIban (IBAN de la linea MOVIMIENTOS DE LA CUENTA): [bankinter.parser.ts:101](../../src/modules/bankinter/bankinter.parser.ts#L101)
- findHeaderRow (cabecera por nombre de columna): [bankinter.parser.ts:122](../../src/modules/bankinter/bankinter.parser.ts#L122)
- parseDataRow (fila -> movimiento o noReconocidas): [bankinter.parser.ts:139](../../src/modules/bankinter/bankinter.parser.ts#L139)
- tipo por signo (neg->gasto, pos->ingreso): [bankinter.parser.ts:177](../../src/modules/bankinter/bankinter.parser.ts#L177)
- parseSpanishDate (dd/mm/yyyy -> ISO): [bankinter.parser.ts:195](../../src/modules/bankinter/bankinter.parser.ts#L195)
- parseSpanishAmount (nativo o texto espanol -> number): [bankinter.parser.ts:224](../../src/modules/bankinter/bankinter.parser.ts#L224)

### El modelo

- MovimientoParseado (6 columnas reales + tipo): [bankinter.types.ts:9](../../src/modules/bankinter/bankinter.types.ts#L9)
- BankinterParseResult (resultado completo): [bankinter.types.ts:35](../../src/modules/bankinter/bankinter.types.ts#L35)

### El servicio y el endpoint

- parseLocalBankinterCopies (copias locales -> parseo -> volcado, fallo aislado): [bankinter.service.ts:20](../../src/modules/bankinter/bankinter.service.ts#L20)
- Escritura del JSON volcado: [bankinter.service.ts:38](../../src/modules/bankinter/bankinter.service.ts#L38)
- Endpoint POST /api/parser/bankinter: [bankinter.routes.ts:36](../../src/modules/bankinter/bankinter.routes.ts#L36)
- Registro del modulo bajo /api/parser: [app.ts:34](../../src/app.ts#L34)

### Fixture y guardianes

- Fixture sintetico en memoria (sin datos reales ni red): [bankinter.fixture.ts:23](../../src/modules/bankinter/bankinter.fixture.ts#L23)
- Fixture canonico que toca cada criterio: [bankinter.fixture.ts:66](../../src/modules/bankinter/bankinter.fixture.ts#L66)
- Guardian: parser sin prisma: [architecture.test.ts:123](../../src/architecture.test.ts#L123)
- Guardian: var/parsed/ gitignoreado: [architecture.test.ts:142](../../src/architecture.test.ts#L142)
- .gitignore del volcado: [.gitignore:20](../../.gitignore#L20)

### Tests

- Salta preambulo, cabecera, IBAN, 5 mov + 1 no reconocida: [bankinter.parser.test.ts:8](../../src/modules/bankinter/bankinter.parser.test.ts#L8)
- Columnas reales, importe/saldo nativo y espanol, divisa: [bankinter.parser.test.ts:20](../../src/modules/bankinter/bankinter.parser.test.ts#L20)
- El modelo NO trae concepto/tipoMovimiento: [bankinter.parser.test.ts:43](../../src/modules/bankinter/bankinter.parser.test.ts#L43)
- tipo por signo: [bankinter.parser.test.ts:59](../../src/modules/bankinter/bankinter.parser.test.ts#L59)
- NO deduplica (dos filas identicas -> las dos): [bankinter.parser.test.ts:70](../../src/modules/bankinter/bankinter.parser.test.ts#L70)
- Fila ilegible -> noReconocidas (fila + motivo), resto se parsea: [bankinter.parser.test.ts:81](../../src/modules/bankinter/bankinter.parser.test.ts#L81)
- Layout real exacto (importe/saldo nativos): [bankinter.parser.test.ts:92](../../src/modules/bankinter/bankinter.parser.test.ts#L92)
- Volcado JSON en tempdir, sin BD, sin mover: [bankinter.service.test.ts:31](../../src/modules/bankinter/bankinter.service.test.ts#L31)
- Archivo malo aislado, sano se parsea: [bankinter.service.test.ts:72](../../src/modules/bankinter/bankinter.service.test.ts#L72)
- Endpoint 200 + escribe el dump: [bankinter.routes.test.ts:38](../../src/modules/bankinter/bankinter.routes.test.ts#L38)

## Cumplimiento de la intencion

Por cada punto del `como_se_que_esta_bien` del `intent`:

- [x] Una fila estructurada por cada movimiento, saltando el preambulo -> se cumple; `bankinter.parser.test.ts:8`.
- [x] Fecha contable y fecha valor (ambas), descripcion, importe, saldo y divisa; e IBAN del preambulo -> se cumple; `bankinter.parser.test.ts:20` y `:8`.
- [x] Importe negativo = gasto, positivo = ingreso -> se cumple; `bankinter.parser.test.ts:59`.
- [x] Fechas dd/mm/yyyy e importes (nativo o texto espanol) bien interpretados -> se cumple; `bankinter.parser.test.ts:159` y `:173` y `:20`.
- [x] Dos filas identicas aparecen las dos -> se cumple; `bankinter.parser.test.ts:70`.
- [x] Fila no interpretable -> lista de no reconocidas con no de fila y motivo, el resto se parsea -> se cumple; `bankinter.parser.test.ts:81`.
- [x] Ver el resultado parseado en un JSON local -> se cumple; `bankinter.service.test.ts:31` y `bankinter.routes.test.ts:38`.

## Decisiones que se tomaron por ti

- (delegado) Libreria .xlsx: `exceljs@^4.4.0` en vez de SheetJS xlsx. La version de
  SheetJS en npm esta congelada en 0.18.5 con CVEs sin parchear; las corregidas solo
  viven en su CDN (romperia el lockfile de pnpm). exceljs ademas escribe libros, lo que
  permite generar los fixtures de test en codigo, sin datos reales ni red. Coste asumido:
  arbol de dependencias mas pesado. Anotado en `docs/stack.md:35` y ADR-010.
- (delegado) Modelo final ajustado a las columnas REALES del extracto (Fecha contable,
  Fecha valor, Descripcion, Importe, Saldo, Divisa): se descartaron concepto y
  tipoMovimiento (solo aparecen en el preambulo como etiquetas de filtro) y se anadieron
  saldo y divisa. Confirmado por ti el 2026-08-04. Vive en `bankinter.types.ts:9`.
- (delegado) Disparo y volcado: endpoint POST /api/parser/bankinter que lee las copias
  locales de la f5 y vuelca a var/parsed/bankinter/<ano>/...json (gitignoreado). No
  descarga de Drive ni persiste.
- (anadido) Una fila con saldo no numerico tambien va a noReconocidas (no solo
  importe/fecha ilegibles): saldo es obligatorio en el modelo.

## Que NO se toco / quedo fuera

- No persiste en base de datos ni crea esquema/tablas Prisma (feature futura).
- No deduplica: representa el archivo tal cual.
- No mueve el archivo a procesados/ en Drive (eso es del import real).
- Solo Bankinter; no parsea otros bancos.
- No hay interfaz web; solo el backend expone la API.

## Notas para el futuro (opcional)

- Un importe exactamente 0 se clasifica hoy como ingreso (`bankinter.parser.ts:177`).
  El acceptance no define el cero; si la persistencia necesitara una regla explicita,
  revisitar aqui.
- El volcado local es el segundo directorio gitignoreado de datos bancarios (tras
  var/drive-read/ de la f5). Vigilar que futuras features mantengan la politica de
  privacidad.
