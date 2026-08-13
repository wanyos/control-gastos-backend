# Review — feature 11 `parsed-movement-contract`

**Veredicto:** APPROVED

- **Fecha:** 2026-08-11 · **Agente:** reviewer
- **Feature NO SDD:** no hay `specs/parsed-movement-contract/`. El contrato de
  revisión son el `intent` y los 10 criterios de `acceptance` de la feature 11 en
  [`feature_list.json`](../../feature_list.json).
- **Informe revisado:** [`progress/implementations/parsed-movement-contract.md`](../implementations/parsed-movement-contract.md).

## Trazabilidad requirements ↔ tests (solo SDD)

No aplica: `"sdd": false`. Se sustituye por la tabla de `acceptance` de abajo.

## Tasks completas (solo SDD)

No aplica.

## Criterios de aceptación (siempre)

- [x] **1 — Los tipos en UN módulo compartido fuera de `modules/<banco>/`, sin
  duplicados.** El contrato está en
  [parsed-statement.ts:19](../../src/lib/parsed-statement.ts#L19),
  [:22](../../src/lib/parsed-statement.ts#L22),
  [:51](../../src/lib/parsed-statement.ts#L51) y
  [:59](../../src/lib/parsed-statement.ts#L59); Bankinter se queda solo con
  [bankinter.types.ts:14](../../src/modules/bankinter/bankinter.types.ts#L14).
  **Comprobado con búsqueda propia sobre todo `src/`**: las únicas declaraciones
  de `ParsedMovement`, `UnparsedRow` y `ParsedMovementType` están en
  `src/lib/parsed-statement.ts`; el resto son importaciones o usos. El guardián
  [architecture.test.ts:184](../../src/architecture.test.ts#L184) recorre todos
  los fuentes y falla ante una segunda declaración.
- [x] **2 — `balance` e `accountIban` opcionales, y la ausencia distinta de `0` y
  de la cadena vacía.** [parsed-statement.ts:36](../../src/lib/parsed-statement.ts#L36)
  y [:67](../../src/lib/parsed-statement.ts#L67);
  [findIban](../../src/modules/bankinter/bankinter.parser.ts#L128) devuelve
  `null`. Tests: [parsed-statement.test.ts:74](../../src/lib/parsed-statement.test.ts#L74)
  (afirma `toBeNull()` y además `not.toBe(0)` y `not.toBe("")`),
  [bankinter.parser.test.ts:170](../../src/modules/bankinter/bankinter.parser.test.ts#L170)
  y, sobre el JSON volcado de verdad,
  [bankinter.service.test.ts:64](../../src/modules/bankinter/bankinter.service.test.ts#L64):
  escribe el dump, lo relee de disco y comprueba que **la clave sigue presente**
  con `null`. Es justo lo que pedía el criterio, no una aserción de tipos.
- [x] **3 — Importe 0 emitido como `neutral`.**
  [bankinter.parser.test.ts:73](../../src/modules/bankinter/bankinter.parser.test.ts#L73)
  cubre las dos variantes del formato (número nativo y texto español) y comprueba
  el `type` y el `amount`.
- [x] **4 — La regla del signo en un solo sitio.** El parser importa
  [deriveMovementTypeFromAmount](../../src/modules/movements/movements.service.ts#L33)
  en [bankinter.parser.ts:6](../../src/modules/bankinter/bankinter.parser.ts#L6) y
  lo llama en [:191](../../src/modules/bankinter/bankinter.parser.ts#L191).
  **Comprobado:** no hay ninguna segunda implementación con otro nombre; la única
  definición de la regla en todo `src/` es la línea 33 de `movements.service.ts`.
  El guardián [architecture.test.ts:216](../../src/architecture.test.ts#L216)
  recorre todo `*.parser.ts`, exige el import y prohíbe el patrón del ternario que
  antes vivía en el parser.
- [x] **5 — `daySequence` emitida por el parser, contando desde el más antiguo del
  día.** Helper en [parsed-statement.ts:87](../../src/lib/parsed-statement.ts#L87);
  Bankinter solo aporta el argumento
  [statementOrder = 'newest-first'](../../src/modules/bankinter/bankinter.parser.ts#L10)
  y lo aplica en [:89](../../src/modules/bankinter/bankinter.parser.ts#L89).
  **Aritmética verificada contra el fixture, no aceptada de palabra:** en
  [bankinter.parser.test.ts:128](../../src/modules/bankinter/bankinter.parser.test.ts#L128)
  la 1ª fila es `RECIBO CUOTA -45,37 / saldo 9 954,63` y la 2ª
  `TRANSF NOMINA +1 500,00 / saldo 10 000,00`; como 10 000,00 − 45,37 = 9 954,63,
  la 1ª fila es la **posterior** en el tiempo, luego `daySequence: 2` es correcto y
  la 2ª lleva `1`. El helper lo resuelve con `total − posición + 1` y está cubierto
  en los dos sentidos en
  [parsed-statement.test.ts:25](../../src/lib/parsed-statement.test.ts#L25) y
  [:46](../../src/lib/parsed-statement.test.ts#L46), más el fichero vacío y el
  "no reordena el array".
- [x] **6 — No regresión salvo el importe 0 (el criterio más importante: abierto y
  juzgado, no aceptado del informe).** El pin es
  [bankinter.parser.test.ts:193](../../src/modules/bankinter/bankinter.parser.test.ts#L193)
  y **sí compara el objeto entero**: un único `expect(result).toEqual({...})` con
  `bank`, `accountIban`, los **5** movimientos escritos campo a campo (8 claves
  cada uno) y `unparsedRows` completo con la fila 15. Un `toEqual` sobre el objeto
  raíz rechaza tanto un valor distinto como un campo de más o de menos: una
  regresión no pasa por ahí. Contrastado contra
  [bankinter.fixture.ts:66](../../src/modules/bankinter/bankinter.fixture.ts#L66):
  6 filas de datos a partir de la 10, luego la fila rota es la **15**; las dos
  filas idénticas `PAGO TARJETA` siguen apareciendo las dos; `1.234,56` da
  `1234.56` y `6.159,06` da `6159.06`. Ninguna fila de esa muestra tiene importe
  0, así que ningún `type` del pin cambia respecto a la F7. Refuerzo:
  [:44](../../src/modules/bankinter/bankinter.parser.test.ts#L44) fija el conjunto
  exacto de claves del movimiento y del resultado.
- [x] **7 — El contrato no es el modelo de la BD y no se comparte el lector del
  formato.** [architecture.test.ts:203](../../src/architecture.test.ts#L203)
  prohíbe `prisma`, `accountId`, `transferId`, `origin` y **cualquier `import`** en
  el módulo del contrato; leído el archivo, efectivamente no importa nada. Cada
  banco conserva su módulo: lo compartido es la forma de la salida y la
  numeración, que no lee formato.
- [x] **8 — Alcance respetado.** Verificado con `git status` y `git diff`: los
  únicos fuentes tocados son `bankinter.types.ts`, `bankinter.parser.ts`, sus
  tests, `architecture.test.ts` y los dos archivos nuevos de `lib/`. El diff de
  `prisma/schema.prisma` y de `src/modules/investments/` es **de la F9**
  (`InvestmentProduct`, `Valuation`, `Movement.productId`), no de esta feature. No
  existe `src/modules/myinvestor/` y no se ha tocado `specs/myinvestor-parser/`.
  Dentro del parser, `headerToField`, `findHeaderRow`, `collectRows`,
  `parseSpanishDate`, `parseSpanishAmount` y `cellToString` están intactos.
- [x] **9 — Test por criterio, `./init.sh` verde, ADR y convenciones.** Tabla de
  trazabilidad en el informe del implementer; **ADR-013** en
  [`docs/architecture.md`](../../docs/architecture.md) con las cuatro decisiones
  delegadas y tres alternativas descartadas con motivo; y
  [`docs/conventions.md`](../../docs/conventions.md) §Parsers de banco con la
  sub-sección «Lo que NO es propio de cada banco: la forma de la salida».
- [x] **10 — `docs/api-contract.md` actualizado con nota de breaking change.**
  Aviso fechado con los tres cambios observables (0 pasa a `neutral`,
  `daySequence`, los `null`), tabla del modelo como contrato común de todos los
  bancos y nota en el resumen de `POST /api/parser/bankinter`. Dice
  explícitamente que el frontend aún no lo consume.

### El punto que el implementer declaró — confirmado con `git`

**Es cierto y merece constar.** `git show HEAD:src/modules/bankinter/bankinter.parser.test.ts`
no contiene ninguna aserción sobre un importe 0: las únicas apariciones son
`parseSpanishAmount('0,00')`, que es un unitario del parseo del número y no del
`type`. La regla `0 → income` vivía **solo** en el ternario del parser, sin test
que la fijara. El implementer no cambió en silencio una expectativa existente:
**añadió** el test que faltaba. Hallazgo legítimo y bien declarado.

## Arquitectura (docs/architecture.md)

- [x] `lib/` es para lo transversal y `modules/` para recursos (ADR-004): el
  contrato no es un recurso ni tiene rutas, así que `src/lib/` es la ubicación
  que dicta la propia regla del documento.
- [x] El árbol de `docs/architecture.md` incluye `lib/parsed-statement.ts`, y el
  guardián del árbol en `architecture.test.ts` exige los dos archivos nuevos.
- [x] Sin dependencias nuevas y sin acceso a datos desde el parser.
- [x] ADR-013 con el mismo formato que los ADR anteriores (contexto, decisión,
  alternativas, consecuencias).

## Convenciones (docs/conventions.md)

- [x] §Idioma: código, tipos, campos y comentarios de los archivos nuevos en
  inglés; la prosa de `docs/` en español, como manda la norma.
- [x] §Parsers de banco actualizada y coherente con el código: apunta al archivo y
  a las líneas del contrato, del helper y de los guardianes.
- [x] Comentarios que explican el porqué, no el qué. Sin `console.log` ni TODOs.
- [x] Informe del implementer con enlaces clicables `archivo:línea`.

## Verificación (docs/verification.md)

- [x] Recursos reales en vez de mocks innecesarios: los tests del parser generan
  un `.xlsx` real en memoria con exceljs, y el del service escribe y relee el JSON
  volcado en un directorio temporal.
- [x] Los tests comprueban salida concreta, no «no lanza excepción»: `toEqual` del
  objeto entero, listas de fecha y posición, y `toBeNull()` acompañado de
  `not.toBe(0)` y `not.toBe("")`.
- [x] Camino de error cubierto: importe ilegible, saldo no numérico, fichero sin
  cabecera (`ValidationError`), extracto sin IBAN y fichero vacío.
- [x] Los guardianes de `architecture.test.ts` son ejecutables y fallarían de
  verdad ante una regresión estructural; no son espejos del código.

## CHECKPOINTS.md

- [x] **C1 — Arnés completo:** archivos base y `docs/` presentes; `./init.sh`
      ejecutado por el reviewer y en verde.
- [x] **C2 — Estado coherente:** una sola feature `in_progress` (la 11);
      `progress/current.md` describe esta sesión y no arrastra basura.
- [x] **C3 — Arquitectura:** estructura conforme al árbol, sin dependencias
      nuevas, sin logs de debug ni TODOs sueltos, convenciones respetadas.
- [x] **C4 — Verificación real:** 233 tests en 18 ficheros, camino feliz y de
      error, en el entorno de `docs/verification.md`.
- [x] **C5 — Sesión cerrada bien:** nada sospechoso sin trackear (lo no trackeado
      es harness, specs y los dos fuentes nuevos); `progress/history.md` con la
      entrada de la sesión anterior; la feature sigue `in_progress`, su estado
      correcto hasta que el implementer la cierre tras este veredicto.
- [x] **C6 — Coherencia con el proyecto hermano:** breaking change anotado en
      `docs/api-contract.md` y en `progress/current.md`, como pide
      `docs/related-projects.md`.
- [ ] **C7 — SDD:** no aplica (`"sdd": false`).
- [x] **C8 — Resumen de cierre escrito.**

## Ejecución de `./init.sh`

```
── 4. Type checking (tsc) ──  [OK] Type check OK (tsc sin errores)
── 5. Ejecutando tests ─────  Test Files  18 passed (18)
                              Tests  233 passed (233)
── 6. Resumen ──────────────  [OK] Entorno listo.
```

Línea base declarada antes de la feature: 220 tests en 17 ficheros. Ahora 233 en
18, es decir **+13 tests y +1 fichero**: exactamente lo que declara el informe.

## Resumen de cierre (si APPROVED)

- Escrito en [`progress/summaries/parsed-movement-contract.md`](../summaries/parsed-movement-contract.md) → **sí**.

## Cambios requeridos

Ninguno bloqueante. **Se aprueba.**

## Hallazgos menores (no bloquean)

1. [`docs/conventions.md`](../../docs/conventions.md) §Parsers de banco: dos
   enlaces tienen el **rótulo** desfasado respecto al ancla. Dicen
   `bankinter.parser.ts:11` apuntando a `#L10` (la constante `statementOrder` está
   en la 10) y `bankinter.parser.ts:177` apuntando a `#L191` (la llamada al helper
   del signo está en la 191). El destino del clic es correcto; el número escrito,
   no.
2. Misma sección y `docs/api-contract.md`: la prosa dice «`daySequence` ya
   normalizado (1 = el primero del día)». El `intent` y el código hablan de **el
   más antiguo del día**; «el primero» se puede leer como «el primero del
   fichero», que en Bankinter es justo el contrario. El código y los tests son
   inequívocos, pero la frase se puede afilar.
3. `daySequence` numera **solo los movimientos parseados**: si una fila cae en
   `unparsedRows`, las de su mismo día se numeran como si no existiera. Si mañana
   se arregla el parser y esa fila pasa a parsearse, las posiciones de ese día se
   desplazan y el índice único de dedup de la F12 las vería como movimientos
   nuevos. No es defecto de esta feature (el contrato no puede numerar lo que no
   entiende), pero es un supuesto que **la F12 debe conocer**.
4. `currency: ''` sigue siendo un vacío disfrazado, el mismo patrón que aquí se
   corrigió para el IBAN. El criterio 2 solo nombraba saldo e IBAN, así que queda
   fuera de scope con razón; el implementer ya lo dejó anotado.
5. [`docs/roadmap.md`](../../docs/roadmap.md) todavía dice que el `intent` de la
   F11 está en borrador y marca E4 con la F11 pendiente. El implementer lo dejó
   explícitamente para el cierre de sesión: **es tarea del leader al pasar la
   feature a `done`** (etapa E4 y cabo suelto #2, que esta feature cierra).
