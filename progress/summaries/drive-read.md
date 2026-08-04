# Resumen — feature 5 `drive-read`

Fecha de cierre: 2026-08-04
Intención original: `feature_list.json` → feature `drive-read`, bloque `intent`
Spec (si SDD): N/A — feature no-SDD (sdd:false), medida contra intent + acceptance.

## Qué hace ahora la app que antes no

Ahora el backend sabe **leer por primera vez** los archivos de banco que hay en tu
Google Drive, sin interpretarlos. Puede decirte cuántos archivos tienes sin procesar
(mirando TODAS las carpetas de banco que existan, descubiertas de Drive en el momento,
no de una lista escrita en el código), y cuando se lo pides descarga cada archivo tal
cual, guarda una copia en una carpeta local del repo (para que veas con qué formato
llega cada banco) y mueve el original a su subcarpeta procesados/. Antes el backend
sabía conectar con Drive (f3) y crear/mover carpetas (f4), pero no leía ni bajaba nada.
No parsea contenido ni toca la base de datos: eso es la feature 6.

## Por dónde se usa (puntos de entrada)

- `GET /api/ingesta/pending` — te dice cuántos pendientes hay y dónde, sin tocar nada.
- `POST /api/ingesta/process` — descarga cada pendiente, lo copia en local y mueve el
  original a procesados/. Un fallo en un archivo se aísla (se reporta y sigue el resto).

## Dónde está el código (para revisión directa)

> Los enlaces de la columna Código son clicables en la vista previa de Markdown de
> VS Code (Ctrl/Cmd + clic): saltan a la línea exacta.

### Operaciones de lectura en Drive (src/lib/drive-structure.ts)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Lista los bancos (subcarpetas de la raíz = registro dinámico) | listBankFolders | [drive-structure.ts:365](../../src/lib/drive-structure.ts#L365) |
| Lista los años de un banco (solo forma de 4 dígitos) | listYearFolders | [drive-structure.ts:386](../../src/lib/drive-structure.ts#L386) |
| Lista pendientes del año (no-carpeta, excluye procesados/) | listPendingFiles | [drive-structure.ts:407](../../src/lib/drive-structure.ts#L407) |
| Descarga el contenido tal cual (files.get alt=media a Buffer) | downloadFileContent | [drive-structure.ts:438](../../src/lib/drive-structure.ts#L438) |
| Mover a procesados/ (reuso f4) | moveFileToProcessed | [drive-structure.ts:344](../../src/lib/drive-structure.ts#L344) |

### Lógica del módulo de ingesta (src/modules/ingesta/)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Detección no destructiva multi-banco | detectPending | [ingesta.service.ts:32](../../src/modules/ingesta/ingesta.service.ts#L32) |
| Proceso archivo-a-archivo (descarga + copia + mover) | processPending | [ingesta.service.ts:72](../../src/modules/ingesta/ingesta.service.ts#L72) |
| Mensaje de error sanitizado | describeError | [ingesta.service.ts:139](../../src/modules/ingesta/ingesta.service.ts#L139) |
| Endpoints GET /pending y POST /process (base inyectable) | ingestaRoutes | [ingesta.routes.ts:24](../../src/modules/ingesta/ingesta.routes.ts#L24) |
| Tipos de respuesta | DetectionResult/ProcessResult | [ingesta.types.ts:1](../../src/modules/ingesta/ingesta.types.ts#L1) |
| Registro bajo /api/ingesta | buildApp | [app.ts:32](../../src/app.ts#L32) |

### Privacidad y guardianes

| Qué hace | Código |
| --- | --- |
| El volcado local va gitignoreado | [.gitignore:16](../../.gitignore#L16) |
| Guardián: ingesta sin prisma | [architecture.test.ts:104](../../src/architecture.test.ts#L104) |
| Guardián: .gitignore tapa el volcado | [architecture.test.ts:116](../../src/architecture.test.ts#L116) |

### Tests (dobles del cliente Drive, sin red; tempdir para el volcado)

| Qué cubre | Código |
| --- | --- |
| Detección multi-banco dinámica, no destructiva | [ingesta.service.test.ts:96](../../src/modules/ingesta/ingesta.service.test.ts#L96) |
| Proceso: copia local + mover original | [ingesta.service.test.ts:135](../../src/modules/ingesta/ingesta.service.test.ts#L135) |
| Idempotencia (sin pendientes, x2, no duplica) | [ingesta.service.test.ts:189](../../src/modules/ingesta/ingesta.service.test.ts#L189) |
| Fallo de lectura, no mueve + error sanitizado | [ingesta.service.test.ts:211](../../src/modules/ingesta/ingesta.service.test.ts#L211) |
| Fallo de copia local, no mueve | [ingesta.service.test.ts:241](../../src/modules/ingesta/ingesta.service.test.ts#L241) |
| Aislamiento del fallo por archivo | [ingesta.service.test.ts:268](../../src/modules/ingesta/ingesta.service.test.ts#L268) |
| Fallo Drive de nivel superior a 503 | [ingesta.service.test.ts:305](../../src/modules/ingesta/ingesta.service.test.ts#L305) |
| Endpoints GET/POST (200, 503, copia+mover) | [ingesta.routes.test.ts:74](../../src/modules/ingesta/ingesta.routes.test.ts#L74) |
| Descarga tal cual + wrap sanitizado | [drive-structure.test.ts:492](../../src/lib/drive-structure.test.ts#L492) |

## Cumplimiento de la intención

Por cada punto del como_se_que_esta_bien:

- OK "Me dice cuántos hay sin procesar, sin tocarlos, recorriendo TODAS las carpetas de
  banco (descubiertas de Drive, no de una lista fija)" — se cumple; verificado en
  ingesta.service.test.ts:96 (2 bancos dinámicos, get/update/create no llamados) y
  ingesta.routes.test.ts:74.
- OK "Por cada pendiente aparece una copia local y el original queda movido a
  procesados/, dejando de estar en la carpeta del año" — se cumple; verificado en
  ingesta.service.test.ts:135 (bytes de la copia local + update con
  addParents/removeParents) y ingesta.routes.test.ts:113.
- OK "Cuando no queda nada pendiente, procesar no hace nada: ni falla ni duplica copias"
  — se cumple; verificado en ingesta.service.test.ts:189 (corre 2 veces, dumpdir vacío).
- OK "Cuando falla al leer o copiar un archivo, ese archivo NO se mueve y el error se
  reporta con claridad" — se cumple; verificado en ingesta.service.test.ts:211 (lectura,
  token no filtrado), :241 (copia) y :268 (aislamiento).
- OK "El banco y el año se saben por la carpeta, no por el contenido; añadir o quitar una
  carpeta de banco no rompe la detección" — se cumple; los bancos son las subcarpetas de
  la raíz (listBankFolders, drive-structure.ts:365) y el año se filtra por forma
  (listYearFolders, :386); verificado en drive-structure.test.ts:405/438 y
  ingesta.service.test.ts:96.

## Decisiones que se tomaron por ti (delegadas en el agente)

- (delegado) Endpoints, no servicio interno: se exponen GET /api/ingesta/pending y
  POST /api/ingesta/process, sin auth nueva, porque el intent pide que el backend te diga
  pendientes y dispare el proceso cuando lo pidas, y el frontend los consumirá.
  Razón en ADR-009 (docs/architecture.md) y docs/api-contract.md, sección Ingesta.
- (delegado) Dónde se guardan las copias: var/drive-read/<banco>/<año>/<archivo> (espeja
  Drive, legible), gitignoreado. Base inyectable para testear contra un tempdir.
- (delegado) Uno a uno con aislamiento del fallo: cada archivo se trata por separado; un
  fallo se reporta y no detiene al resto (respuesta 200 con detalle). Solo un fallo de
  Drive de nivel superior sube como 503.

## Qué NO se tocó / quedó fuera

- No se parsea ni interpreta el contenido (se copia tal cual): es la feature 6.
- No se toca base de datos ni se crean tablas/modelo: feature 6.
- No hay UI: el frontend consumirá esta API en otra sesión.
- No se remonta la conexión (f3) ni la estructura de Drive (f4): se reutilizan.
- Sin variables de entorno ni dependencias nuevas.

## Notas para el futuro (opcional)

- **Smoke real Nivel 3 (2026-08-04):** pasó end-to-end contra el Drive real (detect →
  process → move → 0 pendientes; copia local de 8.548 bytes). Reveló que el `.env` tenía
  la URL de la carpeta en vez del fileId; se endureció con `normalizeDriveFolderId`
  ([env.ts](../../src/config/env.ts)), que acepta fileId pelado o URL. El `path` del
  response se normalizó a barras `/`.
- El path relativo del volcado local puede servir de entrada directa al parser del primer
  banco (Bankinter) cuando llegue la feature 6.
- Límites conocidos anotados en ADR-009: las listas usan pageSize 1000 sin seguir
  nextPageToken (revisitar si un año supera 1000 pendientes); dos pendientes con el mismo
  nombre en el mismo banco/año sobrescribirían la copia local (el original en Drive nunca
  se pierde). Ninguno rompe un criterio del acceptance.
