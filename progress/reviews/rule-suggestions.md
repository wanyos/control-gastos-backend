## Review — 2026-10-18

**Veredicto:** CHANGES_REQUESTED

### Cambios requeridos

1. `src/modules/category-rules/category-rules.suggestions.ts:129-136`: la lista
   propone un texto que ya es el `matchText` de una regla de **otro** `kind`. Como
   `matchText` es único en toda la tabla (`prisma/schema.prisma:132`, `@unique`),
   crear esa regla da **409**, y la consulta previa también. La propuesta enseña
   unos movimientos que su regla no puede mover nunca. Eso contradice «el número
   que ves es el que mueve la regla al crearla» (hoja ✅) y R6, que parte de que la
   regla se puede crear.
   Lo he comprobado ejecutándolo: un test temporal fuera del repositorio
   (`pnpm exec vitest run --dir <scratchpad>/probe`, contra la base desechable del
   worker) con una regla de ingreso `libreria <tag>` y tres gastos `closing`
   `LIBRERIA <tag> 5`. Salió esto:
   ```
   SUGGESTIONS [["libreria qzvkpw","expense",3]]
   PREVIEW 409 {"statusCode":409,"code":"CONFLICT","message":"A rule with matchText 'libreria qzvkpw' already exists"}
   POST 409 {"statusCode":409,"code":"CONFLICT","message":"A rule with matchText 'libreria qzvkpw' already exists"}
   ```
   Arreglo: no proponer un candidato cuyo texto coincida exactamente con el
   `matchText` de cualquier regla existente, sea del `kind` que sea; y un test que
   lo compruebe. Si el leader prefiere otro trato (por ejemplo, proponerla marcada
   como no creable), es una decisión de spec y no del implementer.
2. `src/modules/category-rules/category-rules.suggestions.test.ts:319-320` y
   `:336-339`: el test de R5 da como **correcto** justo ese caso (comentario «An
   income rule never takes an expense: this one is still proposed», y espera
   `libreria <tag>` en la lista). Hay que corregirlo junto con el punto 1.
3. `docs/api-contract.md:921-925` («**El número es el que mueve la regla.** Creando
   justo después la regla con ese `matchText` … son exactamente los de
   `movements`») y `:816-818` («el cliente elige una categoría y hace el `POST` …
   con su `matchText`»): hoy los dos párrafos son falsos para una propuesta como la
   del punto 1. Hay que alinearlos con lo que se decida allí.

### Comprobado sin hallazgos

- **Requirements y tests:** R1-R14 tienen cada uno al menos un test concreto (tabla
  del informe contrastada con los archivos de test). `tasks.md`: T1-T11 en `[x]`.
- **Archivos de cada lote:** el diff del Lote A (8 archivos) y el del Lote B (4
  archivos) caen dentro de su `Archivos:`. El resto del diff es del leader
  (`feature_list.json` y `progress/current.md`).
- **Una sola función de reparto:** `planCategorization` la usan
  `applyCategoryRules`, `previewCategoryRule` y `listRuleSuggestions`, sin copias.
  `readCategorizationInput` es la lectura común. `toCategorizedMovement` y
  `toCategorizationConflict` son compartidas. Están cubiertos los choques con otras
  reglas (test de preview contra `POST` y test «the count of a suggestion…») y lo
  `manual` (fuera del alcance, cuenta solo en `manualMatches`).
- **Las dos consultas no escriben:** el código solo hace `findMany` y
  `findUnique`. Lo verifica el test «neither the suggestions nor the preview write
  anything», que compara todas las columnas antes y después, `updatedAt` incluido.
- **Tests anteriores:** `git diff --numstat` da 0 líneas quitadas en
  `category-rules.service.test.ts`, `category-rules.routes.test.ts` y
  `category-rules.docs.test.ts`. `import.service.test.ts` no aparece en el diff.
- **Comportamiento de `applyCategoryRules`:** ahora, si la escritura falla a
  medias, `conflicts` y `unmatched` salen completos y no a medias. Está anotado
  como decisión 1 del informe y ningún documento describía lo de antes.
- **ADRs:** `docs/architecture.md` solo añade líneas (75 añadidas, 0 quitadas).
  ADR-039 es nuevo y no se ha reescrito ningún ADR.
- **Vocabulario:** «pasada», «alcance» y «cierre automático» ya estaban en el
  contrato antes de esta feature (29, 3 y 4 apariciones en `HEAD`). No he
  encontrado términos nuevos.
- **Datos reales:** ninguno en los archivos de la feature. `src/no-real-data.test.ts`
  pasa dentro de `./init.sh`.
- **SDD:** la hoja cabe en una página, el bloque 🔴 tiene 5 puntos, cada uno con su
  alternativa. Hay 14 requirements, todos con su procedencia. Los `checks`
  coinciden con la tabla 🧪.
- **CHECKPOINTS:** C1-C5 y C7 sin hallazgos.
- **Ejecución:** antes de lanzar nada, ningún `node.exe` con `vitest` en marcha.
  `./init.sh` → exit 0, `Test Files 87 passed (87)`, `Tests 1480 passed (1480)`.
  `./init.sh --checks 61` → exit 0, **8 de 8 en verde**; cada check que filtra por
  nombre muestra `Tests 1 passed`.
- **Servidor de desarrollo (puerto 3000):** `GET /api/category-rules/suggestions`
  respondió 200 en 0,11 s, con un array de 67 propuestas (52 de gastos y 15 de
  ingresos). Todas cumplen `movementCount === movements.length`, ≥ 3 movimientos y
  ≥ 5 caracteres. No he comprobado si en esa base se da el caso del punto 1: haría
  falta cruzar la lista con `GET /api/category-rules`, y no lo he llamado.

---

## Review — 2026-10-18 (segunda)

**Veredicto:** APPROVED
Comprobado: acceptance/requirements ↔ tests, arquitectura, convenciones,
verificación, CHECKPOINTS C1-C8. Checks: 8 de 8 en verde.
Sin hallazgos. Los tres cambios de la primera revisión están resueltos:
- **Código:** `category-rules.suggestions.ts`, con `existingMatchTexts` dentro
  del bucle de candidatos.
- **Tests:** en el test de R5 solo cambian la regla de ingreso (`<tag> 5`) y su
  comentario. Hay un test nuevo, «never proposes a text that is already the
  matchText of a rule of either kind».
- **Documentos:** el contrato (`docs/api-contract.md:860-862`), el ADR-039
  (`docs/architecture.md:3295`) y el test que lee el contrato.
- **Prueba que reproducía el fallo, lanzada otra vez:** `SUGGESTIONS []`, y la
  consulta previa y el `POST` siguen dando 409.
- **Ejecución:** antes de lanzar nada, ningún `node.exe` con `vitest` en
  marcha. `./init.sh` → exit 0, `Test Files 87 passed (87)`,
  `Tests 1481 passed (1481)`. `./init.sh --checks 61` → exit 0, **8 de 8 en
  verde**, y cada check que filtra por nombre muestra `Tests 1 passed`.
Resumen de cierre: `progress/summaries/rule-suggestions.md`.
