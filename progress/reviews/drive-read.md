# Review — feature 5 `drive-read`

**Veredicto:** APPROVED

> Feature **no-SDD**: no hay spec formal ni `R<n>`, así que la vara de medir es el
> `intent` + `acceptance` de la feature 5 en `feature_list.json`. Todo lo de abajo
> está reverificado por el reviewer (puertas reejecutadas, tests abiertos uno a uno).

## Puertas reejecutadas por el reviewer

| Puerta | Resultado |
| --- | --- |
| `bash ./init.sh` | **`[OK] Entorno listo`** — type check OK (`tsc --noEmit` sin errores) + **115 tests en 11 archivos, todos verdes** |
| `pnpm lint` | limpio (`eslint .` sin hallazgos) |
| `pnpm format:check` | `All matched files use Prettier code style!` |

Coincide con lo reportado por el implementer (115 tests, baseline 95, +20 nuevos).

## Criterios de aceptación (los 9 del acceptance)

- [x] **1. Detección no destructiva, multi-banco dinámica, cuenta+lista sin tocar** →
  `detectPending` (`ingesta.service.ts:32`) recorre `listBankFolders` (bancos =
  subcarpetas de la raíz, `drive-structure.ts:365`) → `listYearFolders` → `listPendingFiles`.
  Test `ingesta.service.test.ts:96` descubre 2 bancos dinámicamente y **asserta que
  get/update/create NO se llaman** (no destructiva). Refuerzo unitario en
  `drive-structure.test.ts:405/438/461`. Endpoint en `ingesta.routes.test.ts:74`.
- [x] **2. Proceso: descarga tal cual + copia local** → `processPending`
  (`ingesta.service.ts:72`) usa `downloadFileContent` (`drive-structure.ts:438`,
  files.get alt=media → Buffer) + writeFile. Test `ingesta.service.test.ts:135`
  lee los bytes del fichero local y comprueba que **son los bytes descargados**.
  `drive-structure.test.ts:492`, `ingesta.routes.test.ts:113`.
- [x] **3. Tras copiar OK, mueve a procesados/ reutilizando f4** → `moveFileToProcessed`
  (f4, `drive-structure.ts:344`) se invoca **solo después** del writeFile
  (`ingesta.service.ts:102-104`). procesados/ se resuelve con `ensureFolder` (f4).
  Test `:135` asserta update con addParents/removeParents correctos y create solo
  cuando no existía procesados/ (santander), reusándolo cuando ya existía (bankinter).
- [x] **4. Si lectura/copia falla → NO mueve + error sanitizado** →
  `ingesta.service.test.ts:211` (fallo de descarga: update no llamado, el token no
  aparece en el error, dumpdir vacío), `:241` (fallo de escritura local: update no
  llamado), `:268` (aislamiento: el sano sí se procesa). El wrap sanitizado está
  probado también en `drive-structure.test.ts:507`.
- [x] **5. Reejecutar sin pendientes no hace nada ni duplica** →
  `ingesta.service.test.ts:189` corre processPending **2 veces**, el resultado es vacío
  en ambas, get/update/create no se llaman y readdir(dumpDir) está vacío.
- [x] **6. Volcado local en .gitignore, ningún dato bancario versionado** →
  `.gitignore:16` (`var/drive-read/`), guardián `architecture.test.ts:116`.
  `git ls-files` no trackea ningún .xlsx/.csv/.pdf ni var/drive-read/ (verificado).
- [x] **7. NO parsea / NO BD-modelo / NO UI / reutiliza f3+f4** → contenido devuelto
  como Buffer sin interpretar; guardián `architecture.test.ts:104` (ingesta sin prisma,
  verificado leyendo los 3 archivos del módulo); no hay *.schema.ts ni tabla nueva;
  reusa fastify.drive (f3) + moveFileToProcessed/ensureFolder (f4). "No UI" es N/A.
- [x] **8. Expuesto como endpoint(s) + contrato actualizado, sin auth nueva** →
  `GET /api/ingesta/pending` + `POST /api/ingesta/process` (`ingesta.routes.ts:31/35`),
  registrados en `app.ts:32`. `docs/api-contract.md` §Ingesta (líneas 191-269) los
  documenta con cuerpos y errores. Sin auth (coherente con "Autenticación: ninguna").
  Tests `ingesta.routes.test.ts:74/96/113`.
- [x] **9. Cada criterio con test (dobles, sin red), init.sh verde, decisiones anotadas** →
  todos los tests usan dobles del cliente de Drive y tempdir (sin red); init.sh verde;
  ADR-009 en `docs/architecture.md`. Sin variables de entorno ni dependencias nuevas
  (la carpeta de volcado es ruta fija inyectable), por lo que `docs/stack.md` y
  `.env.example` no cambian — justificado.

## Arquitectura (docs/architecture.md)

- [x] La capa HTTP no tiene lógica: `ingesta.routes.ts` solo llama al servicio y
  devuelve; toda la decisión vive en `ingesta.service.ts` (Principio 1).
- [x] El módulo vive en `modules/ingesta/` (vertical slice, ADR-004); las operaciones
  Drive files.* viven en `lib/drive-structure.ts` (contraparte de conexión, ADR-008).
  Árbol reflejado en architecture.md (líneas 70-73) y guardado por
  `architecture.test.ts:51-55`.
- [x] Errores tipados: `DriveConnectionError` (503) se reutiliza; se envuelve todo
  fallo de Drive vía callDrive; nada de null ambiguo (Principio 3).
- [x] Config validada al arranque: la raíz sale de `fastify.config.driveRootFolderId`,
  no de process.env disperso (guardián `architecture.test.ts:26`).
- [x] ADR-009 justifica de forma razonada el cambio frente a ADR-008: la f4 fue
  servicio interno **porque no había consumidor**; la f5 abre superficie HTTP porque el
  intent pide que el backend "me diga" pendientes y dispare el proceso "cuando lo pida",
  y el frontend consumirá la API (ADR-009 decisión 2). **No hay incoherencia sin
  explicar** con ADR-008.

## Convenciones (docs/conventions.md)

- [x] Todo en inglés (código, tipos, tests, mensajes). Comentarios mínimos, el porqué.
- [x] Comillas simples, sin punto y coma, 2 espacios, <100 cols (pasa format:check).
- [x] Imports: vendor → relativos con .js, import type para tipos. Correcto.
- [x] Nombres: PascalCase en tipos (DetectionResult, ProcessResult), camelCase en
  funciones (detectPending, processPending). Archivos kebab.
- [x] Errores: sin throw de strings; jerarquía AppError (DriveConnectionError),
  traducida por el handler central. No console.log para errores en el código nuevo.

## Verificación (docs/verification.md)

- [x] Tests con recursos correctos: dobles del cliente de Drive (sin red) + tmpdir real
  para el volcado local (no se mockea el filesystem cuando un tempdir es viable).
- [x] Verifican **output concreto**, no "no lanza": comparan bytes del fichero local
  (Buffer.equals), la estructura exacta de DetectionResult, los argumentos de update
  (addParents/removeParents), y que ciertas llamadas **no** ocurren.
- [x] Cubren camino feliz y de error (fallo de descarga, fallo de copia, aislamiento,
  fallo Drive de nivel superior → 503).

## CHECKPOINTS.md

- [x] **C1 — Arnés completo:** archivos base y docs presentes; ./init.sh exit 0.
- [x] **C2 — Estado coherente:** solo la feature 5 en in_progress; current.md describe
  la sesión activa; features done con tests verdes.
- [x] **C3 — Arquitectura:** estructura coincide con architecture.md; sin dependencias
  nuevas (anotado en ADR-009 y current.md); sin console.log/TODOs sueltos en el código
  de la feature; convenciones respetadas.
- [x] **C4 — Verificación real:** ≥1 test por módulo nuevo; suite verde en el entorno de
  verification.md; camino feliz + error cubiertos.
- [x] **C5 — Sesión bien encaminada:** sin archivos temporales sospechosos trackeados
  (solo progress/implementations/drive-read.md y src/modules/ingesta/ sin trackear,
  esperado); la feature refleja su estado correcto (in_progress, se cerrará a done tras
  esta aprobación).
- [x] **C6 — Coherencia con proyecto hermano:** la feature expone API que el frontend
  consumirá en otra sesión; docs/api-contract.md (fuente de verdad) queda actualizado en
  esta misma feature. No hay endpoints/modelos inventados.
- [ ] **C7 — SDD:** N/A (feature "sdd": false).
- [x] **C8 — Resumen de cierre escrito:** progress/summaries/drive-read.md (ver abajo).

## Resumen de cierre (APPROVED)

- Escrito en `progress/summaries/drive-read.md` → **sí**.

## Observaciones no bloqueantes (no exigen cambio)

1. `ingesta.service.ts:89` — ensureFolder(procesados/) se llama **fuera** del try/catch
   por-archivo (una vez por año). Si esa creación fallara con un error de Drive, subiría
   como 503 de nivel superior en vez de aislarse por archivo. Es un fallo genuinamente
   excepcional (no es "lectura ni copia" de un archivo, que es lo que el acceptance
   protege) y el comportamiento es razonable; solo se anota.
2. `drive-structure.ts:180` — hay un console.warn en findFolder. Es código
   **pre-existente de la feature 4** (ya revisado y aprobado allí), no introducido por
   esta feature; queda fuera de scope de este review.
3. Límites conocidos (sin paginación >1000; posible sobrescritura de copia local con
   nombres iguales en el mismo banco/año) están documentados en ADR-009 (consecuencias)
   y en el informe del implementer, y **no rompen ningún criterio del acceptance** (la
   idempotencia del acceptance es "sin pendientes no duplica", no colisión de nombre).

## Cambios requeridos

Ninguno.
