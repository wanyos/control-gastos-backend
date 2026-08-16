# Review — F17 `statement-encoding-guard`

Fecha: 2026-08-15 · Revisor: `reviewer` · Feature sin spec (`sdd: false`): el contrato
revisado es el `intent` + los 8 `acceptance` de la feature 17 de `feature_list.json`.
Informe del implementer: [`implementations/statement-encoding-guard.md`](../implementations/statement-encoding-guard.md).

## Veredicto: **APPROVED**

Resumen de cierre: [`summaries/statement-encoding-guard.md`](../summaries/statement-encoding-guard.md).

### Cambios requeridos

Ninguno.

### Comprobado sin hallazgos

- **Los 8 criterios de `acceptance` ↔ test concreto.** Verificado uno a uno contra el
  código, no contra la tabla del informe:
  1. Rechazo con motivo accionable → `utf8.test.ts:43` (afirma `0xD3`, `línea 2`,
     «no está guardado en UTF-8», «vuelve a guardarlo»), `myinvestor.statement.parser.test.ts:75`,
     `myinvestor.service.test.ts:109` (comprueba el `reason` real de `failed[]`).
  2. **No aprende cp1252** → ver punto dedicado abajo.
  3. Camino sano intacto → las 32 pruebas previas del parser siguen verdes con valores
     concretos (`myinvestor.statement.parser.test.ts:19-70`, `:126+`), más
     `:109` (IBAN + `SUSCRIPCIÓN AÑO PREMIUM €`).
  4. **`U+FFFD` en el volcado** → `myinvestor.service.test.ts:136` es el test que da el
     valor: parsea un lote real a disco y lee el JSON volcado, afirmando a la vez
     `toContain('SUSCRIPCIÓN AÑO PREMIUM €')` y `not.toContain('\\ufffd')` **y**
     `not.toContain('�')` (las dos formas, escapada y literal: no se cuela por la
     serialización). Reforzado en `myinvestor.service.test.ts:129`, que exige que el
     directorio de volcado contenga **solo** `bueno.csv.json` y `products.json` — el
     archivo rechazado no escribe volcado.
  5. **Aislamiento por archivo** → `myinvestor.service.test.ts:109` con un lote mixto de
     3 (extracto malo + extracto bueno + producto `.json`): `failedCount 1`,
     `parsedCount 1`, `productCount 1`, y el fallo dentro del resultado, nunca como error
     de la ejecución. En el importador, `import.service.test.ts:559`.
  6. Prohibiciones → ver punto de los `que_no_quiero`.
  7. BOM → `utf8.test.ts:17` (el BOM se conserva, la función no edita el texto) +
     `myinvestor.statement.parser.test.ts:59` (mismo resultado con y sin BOM), y el
     parser lo quita él mismo en `myinvestor.statement.parser.ts:73`. La división de
     responsabilidad está documentada en `src/lib/utf8.ts:21-23`.
  8. Fixtures sintéticos sin red → `myinvestor.fixture.ts:56` y `:66`; `toCp1252` **lanza**
     si un carácter no cabe en cp1252 (`:72`), así que el fixture es exactamente los
     bytes que dice ser. `no-real-data.test.ts` verde dentro de la suite.

- **«El parser NO aprende cp1252» — respetado sin fisuras.** Comprobado buscando el
  fallback, no fiándome del informe:
  - `src/lib/utf8.ts:25-50` tiene **un solo camino de salida sano** (`return text` de la
    línea 49) y dos `throw`. No hay `catch` que devuelva texto, ni `latin1`, ni
    `'binary'`, ni una segunda pasada de decodificación: el `catch` de la línea 29 solo
    construye el motivo y relanza.
  - `myinvestor.statement.parser.ts:72` sustituye `toString('utf8')` por
    `decodeUtf8Strict(content)` y es la **primera** instrucción de la función, antes de
    buscar la cabecera. Es correcto y necesario: la cabecera se reconoce por su prefijo
    ASCII (`bookingDatePrefix`, `:28`), así que sobrevive a una decodificación mala y
    dejarla ir primero reproduciría el «parece que fue bien» del hallazgo E.
  - `grep` de `cp1252` en `src/` solo aparece en el **fixture** (que codifica, para
    generar el archivo malo del test) y en comentarios. Ningún código de producción
    decodifica cp1252.
  - `utf8.test.ts:54` comprueba explícitamente que no se devuelve nada, y
    `myinvestor.statement.parser.test.ts:99` deja constancia de lo que ocurría antes
    (`content.toString('utf8')` sigue produciendo `SUSCRIPCI�N`, y aun así el parser
    rechaza): el test demuestra la *ausencia* de la reparación, no solo el throw.

- **Los dos caminos, cubiertos por un solo punto.** Verificado en el cableado real, no
  en el informe: `src/app.ts:38` registra `{ bank: 'myinvestor', extensions: ['.csv'],
  parse: parseMyinvestorStatement }` en el `BankParserRegistry`, y
  `myinvestor.service.ts:189` llama a la **misma** función. Es literalmente el mismo
  símbolo en los dos caminos, así que el guardián no puede quedarse en uno solo.
  - `POST /api/parser/myinvestor`: el `try/catch` de `myinvestor.service.ts:68-73` lo
    convierte en un elemento de `failed[]` con `describeError` (`:247`), y el volcado se
    escribe **después** del parseo (`:189` → `:192`), así que un archivo rechazado no
    deja volcado. Confirmado por el `readdir` del test.
  - `POST /api/import`: `import.service.ts:268` parsea **antes** de resolver la cuenta,
    persistir y mover; el `catch` de `:289` deja `status: 'failed'` y `movedToProcessed`
    en el `false` con el que nació el informe (`:257`). `moveFileToProcessed` (`:281`)
    es inalcanzable si el parser lanza. **El archivo no se mueve a `procesados/`**:
    afirmado en `import.service.test.ts:582` (`movedToProcessed: false`) y, mejor aún,
    con `expect(update).toHaveBeenCalledOnce()` sobre el archivo bueno (`:588`) — se
    comprueba que el cliente de Drive **no** recibió la llamada de movimiento, no solo
    que un booleano diga que no.
  - El código estable llega intacto al informe del fichero: `describeError`
    (`import.service.ts:348-350`) propaga `error.code`, y el test afirma
    `error.code === 'NOT_UTF8'`. El importador sigue sin nombrar ningún banco
    (`architecture.test.ts` §*names no bank inside the importer*, verde).
  - Correcto que el test del importador use un adaptador falso que lanza `NotUtf8Error`:
    lo que se verifica ahí es la **propagación** del importador, que no debe conocer
    bancos; el guardián real ya está probado en el parser y en el servicio.

- **La guardia secundaria por `U+FFFD` — bien argumentada, no es un falso positivo que
  vaya a estallar.** El riesgo teórico existe y el implementer lo dice él mismo
  (`src/lib/utf8.ts:33-39`, ADR-018 punto 1), pero:
  - No es el veredicto principal, tiene **su propio motivo** y no se confunde con el
    otro: el mensaje de bytes dice «no está guardado en UTF-8 (byte 0xD3…)», el segundo
    dice «contiene el carácter de sustitución � (línea N), rastro de una decodificación
    fallida anterior». Los dos casos están separados en los tests (`utf8.test.ts:43` vs.
    `:79`).
  - El caso que caza es **el segundo acto exacto del hallazgo E**: el humano abre el CSV
    ya destrozado, lo guarda ahora sí en UTF-8, y los bytes pasan a ser válidos con el
    `�` dentro. Sin esta guardia, ese archivo entraría limpio con el dato ya perdido y el
    criterio 4 sería incumplible por bytes. No es una heurística de más: es lo que cierra
    el criterio.
  - El coste de un falso positivo es un archivo rechazado con un motivo que dice
    exactamente dónde mirar (línea), no un dato corrupto silencioso. La asimetría está
    en el lado correcto y coincide con el `por_que` del `intent`.
  - Alcance acotado: `decodeUtf8Strict` solo lo usa hoy el parser del extracto `.csv`.
    Un extracto bancario con un `U+FFFD` deliberado no existe.

- **Documentación: ningún registro miente.** Leídos los cuatro diffs enteros:
  - `docs/api-contract.md` — `NOT_UTF8` en la tabla de códigos estables (422, con la
    aclaración de que viaja **dentro** de un 200), en la tabla de códigos por archivo de
    `POST /api/import` (incluida la frase «no se mueve a `procesados/`», que coincide con
    lo que hace el código), nota nueva junto a la de `MISSING_ACCOUNT_DATA`, bloque 🔴 en
    §Parser de MyInvestor y `failed[]` de `POST /api/parser/myinvestor` con el motivo
    literal. Coherente con `errors/app-error.ts:52-56`.
  - `docs/dar-de-alta-un-banco.md` — §«El fichero se guarda en UTF-8, siempre». Corrige
    de paso el párrafo anterior, que ya decía «guárdalo como CSV UTF-8» **sin** que nada
    lo comprobara: ese texto se ha movido a la sección nueva en vez de dejarlo duplicado
    y a medias. La afirmación «el `.xlsx` de Bankinter no la necesita (no es texto
    plano)» es cierta.
  - `docs/conventions.md` §Parsers de banco — la regla `decodeUtf8Strict` en vez de
    `toString('utf8')`, con el porqué. Consistente con el ADR.
  - `docs/architecture.md` **ADR-018** — las tres decisiones delegadas con su
    alternativa descartada (el fallback cp1252, y **quién** la descartó y cuándo).
    Contexto, decisión, alternativa y consecuencia: formato correcto.
  - `src/architecture.test.ts:52-53` — `lib/utf8.ts` y `lib/utf8.test.ts` en el árbol
    esperado del ADR-004, con el comentario de por qué es compartido. El test de árbol
    es exhaustivo (compara la lista completa), así que esto no es decorativo.

- **`que_no_quiero` respetados.** `git diff --stat` confirma que **no** se ha tocado
  `prisma/schema.prisma`, ni `myinvestor.product.parser.ts`, ni `bankinter.parser.ts`,
  ni `bankinter.service.ts`, ni nada de `src/modules/movements|accounts|categories`.
  Cero dependencias nuevas (`TextDecoder` es de Node; `package.json` intacto). El
  `readFile(..., 'utf8')` del JSON de producto (`myinvestor.service.ts:132`) se ha
  dejado deliberadamente como estaba y está anotado como sugerencia fuera de scope,
  que es lo correcto: el `intent` prohíbe tocar ese formato.

- **Convenciones y arquitectura.** Código, nombres y comentarios en inglés; los
  `reason` que lee el humano, en español, como el resto de `failed[]`/`unparsedRows`.
  Sin `console.log`, sin TODOs sueltos, sin `process.env`. `utf8.ts` no nombra ningún
  banco, así que la norma «un parser por banco» sigue intacta (el guardián de
  `architecture.test.ts` que revisa los imports de `modules/myinvestor` ya permitía
  `../../lib/`). El código de `findInvalidByte` reproduce las mismas reglas que
  `TextDecoder` (continuaciones, truncados, *overlong*, sustitutos, > U+10FFFF) y está
  probado caso por caso en `utf8.test.ts:65`; solo sirve para **nombrar** el byte, el
  veredicto siempre es del decodificador, que es la separación correcta.

- **Verificación real.** `./init.sh` ejecutado por mí: exit code 0 — tipos OK
  (`tsc --noEmit` sin errores), `feature_list.json` válido, **27 archivos de test, 396
  tests, 396 pasan, 0 saltados**. Los 3 rojos que describía el informe del implementer
  (guardián de la F14) ya no existen: el saneamiento posterior los cerró y el guardián
  corre con **su capa de comparación activa**, no solo con la de forma.

- **CHECKPOINTS C1-C5.** C1 arnés completo e `init.sh` en verde. C2 una sola feature
  `in_progress` (la 17) y `progress/current.md` describe la sesión activa. C3 estructura
  y convenciones respetadas, sin dependencias nuevas. C4 tests por módulo nuevo, con
  camino sano y camino de error. C5 sin archivos temporales sospechosos sin trackear
  (los 4 sin trackear son las dos fuentes nuevas, el informe del implementer y el de la
  prueba real), `history.md` con su línea de la última feature cerrada (F15). **C6** no
  aplica más allá del contrato: `docs/api-contract.md` queda actualizado con el código
  nuevo, que es lo que el frontend consumirá. **C7** no aplica (`sdd: false`). **C8**
  cubierto con el resumen de cierre enlazado arriba.

## Observaciones no bloqueantes

1. **`myinvestor.statement.parser.test.ts:112`** —
   `expect(parseMyinvestorStatement(buildStatementCsv())).toEqual(sample())` es
   tautológico: `sample()` es exactamente esa misma expresión, así que esa línea no
   puede fallar nunca. No bloquea porque el criterio 3 («el extracto bueno se parsea
   exactamente igual que antes») está genuinamente cubierto por las dos líneas
   siguientes (`:114-116`, valores concretos) y por las 32 pruebas previas del parser,
   que afirman movimientos, importes, `daySequence` y `unparsedRows` uno a uno. Si
   alguien la toca en el futuro, el sustituto útil es comparar contra un literal
   esperado, no contra otra llamada.

2. **`prisma/migrations/20260806191700_data_model/migration.sql:99-104` — cabo suelto
   del saneamiento, ajeno a la F17.** El comentario de la migración se editó para
   quitar el concepto real del humano. El contenido SQL no cambia (ni una línea de DDL),
   así que **no** es una violación del `que_no_quiero` de esta feature. Pero Prisma
   guarda el **checksum** del archivo de migración en `_prisma_migrations`: la próxima
   vez que se ejecute `pnpm prisma:migrate` (`prisma migrate dev`) sobre una base donde
   esa migración ya está aplicada, Prisma la dará por modificada y propondrá **resetear
   la base**. Conviene decidirlo con el humano antes de la próxima feature que toque el
   esquema (opciones: dejarlo y resetear a sabiendas, o restaurar el archivo y sanear
   por otra vía). Se anota aquí, no como cambio requerido, porque es del saneamiento del
   leader y está fuera del alcance de la F17.

3. Las tres sugerencias fuera de scope del implementer siguen abiertas y bien
   planteadas: `readFile(path, 'utf8')` del JSON de producto, el motivo de la coma
   decimal (§A de la prueba real) y el archivo nativo de Google reportado como
   `Cannot reach Google Drive` (§B).
