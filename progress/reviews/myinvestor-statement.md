# Review — feature 10 `myinvestor-statement`

**Veredicto:** APPROVED

- **Fecha:** 2026-08-11 · **Agente:** reviewer
- **Verificación propia:** `bash ./init.sh` ejecutado por el reviewer → exit 0,
  `[OK] Entorno listo`, **280 tests en 22 ficheros** (baseline antes de la feature:
  233 en 18 → **+47 tests, +4 ficheros**).
- **Informe revisado:** [`progress/implementations/myinvestor-statement.md`](../implementations/myinvestor-statement.md).
- **Spec:** SDD, sin puntos rojos. El `decisions.md` que aprobó el humano incluía tres
  propuestas del spec-author —IBAN nulo explícito, lista de `ignored[]` y el paso nuevo
  de `docs/dar-de-alta-un-banco.md`—: **las tres están implementadas**.
  `CHANGELOG-respec.md` leído: sus cinco cambios (tipos fuera del módulo, `balance` sin
  `providesBalance`, `daySequence` con `newest-first`, helper único del signo y el ADR
  renumerado a 014) están todos materializados en el código.

---

## Trazabilidad requirements ↔ tests (SDD)

Los 34 requirements vivos del spec; los huecos (R21-R46, R48, R53, R60, R63) se fueron
a la F13. Verificado abriendo los tests, no solo leyendo el mapa del implementer.

| R | Estado | Dónde se verifica |
| --- | --- | --- |
| R1 (módulo con el slug del banco) | [x] | [architecture.test.ts:257](../../src/architecture.test.ts#L257) y el árbol en [architecture.test.ts:84](../../src/architecture.test.ts#L84) |
| R2 (aislamiento entre bancos) | [x] | [architecture.test.ts:211](../../src/architecture.test.ts#L211) — ver el juicio del punto 1 más abajo |
| R3 (sin `prisma`) | [x] | [architecture.test.ts:197](../../src/architecture.test.ts#L197), sobre los cinco fuentes del módulo |
| R4 (no mueve, borra ni modifica el origen) | [x] | [service.test.ts:120](../../src/modules/myinvestor/myinvestor.service.test.ts#L120) |
| R5 (un movimiento por línea, en orden) | [x] | [parser.test.ts:14](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L14) |
| R6 (UTF-8 y BOM) | [x] | [parser.test.ts:54](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L54) y [parser.test.ts:60](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L60) |
| R7 (cabecera por nombre) | [x] | [parser.test.ts:68](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L68) y [parser.test.ts:91](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L91) |
| R8 (los cinco campos) | [x] | [parser.test.ts:31](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L31), objeto completo con `toEqual` |
| R9 (fechas dd/mm/aaaa) | [x] | [format.test.ts:41](../../src/modules/myinvestor/myinvestor.format.test.ts#L41) y [parser.test.ts:113](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L113) |
| R10 (importes con y sin miles) | [x] | [format.test.ts:5](../../src/modules/myinvestor/myinvestor.format.test.ts#L5) y [parser.test.ts:105](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L105) |
| R11 (helper único del signo) | [x] | [parser.test.ts:123](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L123) y [architecture.test.ts:294](../../src/architecture.test.ts#L294) |
| R12 (concepto íntegro) | [x] | [parser.test.ts:134](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L134) |
| R13 (no deduplica) | [x] | [parser.test.ts:141](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L141) |
| R14 (línea ilegible con su número y motivo) | [x] | [parser.test.ts:166](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L166) y [parser.test.ts:178](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L178) |
| R15 (líneas en blanco) | [x] | [parser.test.ts:149](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L149) |
| R16 (sin cabecera, archivo fallido) | [x] | [parser.test.ts:191](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L191) y [service.test.ts:67](../../src/modules/myinvestor/myinvestor.service.test.ts#L67) |
| R17 (`balance: null` en todos) | [x] | [parser.test.ts:200](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L200) y, en el volcado, [service.test.ts:52](../../src/modules/myinvestor/myinvestor.service.test.ts#L52) |
| R18 (sin `providesBalance`) | [x] | [parser.test.ts:209](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L209), claves exactas del resultado y del movimiento |
| R19 (no acumula saldo) | [x] | [parser.test.ts:226](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L226) — juicio expreso sobre ese test más abajo |
| R20 (`accountIban: null`) | [x] | [parser.test.ts:245](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L245), con un concepto con forma de IBAN que NO se usa |
| R25 (banco y año de la carpeta) | [x] | [service.test.ts:55](../../src/modules/myinvestor/myinvestor.service.test.ts#L55) |
| R47 (aislamiento por archivo) | [x] | [service.test.ts:67](../../src/modules/myinvestor/myinvestor.service.test.ts#L67), dos buenos y uno roto |
| R49 y R50 (`ignored` por extensión) | [x] | [service.test.ts:95](../../src/modules/myinvestor/myinvestor.service.test.ts#L95): `.txt`, `.xlsx` y los `.json` de producto, con `failed` vacío |
| R51 (endpoint) | [x] | [routes.test.ts:39](../../src/modules/myinvestor/myinvestor.routes.test.ts#L39) y [routes.test.ts:122](../../src/modules/myinvestor/myinvestor.routes.test.ts#L122) |
| R52 (volcado JSON por archivo) | [x] | [service.test.ts:25](../../src/modules/myinvestor/myinvestor.service.test.ts#L25) |
| R54 (rutas relativas) | [x] | [routes.test.ts:71](../../src/modules/myinvestor/myinvestor.routes.test.ts#L71): el cuerpo no contiene el cwd ni el tempdir |
| R55 (determinismo) | [x] | [service.test.ts:135](../../src/modules/myinvestor/myinvestor.service.test.ts#L135) |
| R56 (sin copias locales) | [x] | [service.test.ts:148](../../src/modules/myinvestor/myinvestor.service.test.ts#L148) (vacía e inexistente) y [routes.test.ts:104](../../src/modules/myinvestor/myinvestor.routes.test.ts#L104) |
| R57 (200 con el fallo dentro) | [x] | [routes.test.ts:85](../../src/modules/myinvestor/myinvestor.routes.test.ts#L85) |
| R58 (cero dependencias) | [x] | Verificado por el reviewer: `package.json` y `pnpm-lock.yaml` sin una sola línea de diff |
| R59 (fixtures sintéticos) | [x] | [myinvestor.fixture.ts:64](../../src/modules/myinvestor/myinvestor.fixture.ts#L64) y el guardián de [parser.test.ts:300](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L300) |
| R61 (api-contract) | [x] | Sección «Parser de MyInvestor» de `docs/api-contract.md` |
| R62 (ADR-014 y árbol) | [x] | [architecture.md:952](../../docs/architecture.md#L952) y el árbol de «Estructura de carpetas» |
| R64 (dar de alta un banco) | [x] | Sección nueva «Después de la carpeta: crear el módulo de parser», con las tres reglas no negociables |
| R65 (árbol en el guardián) | [x] | [architecture.test.ts:84](../../src/architecture.test.ts#L84), las diez entradas del módulo |
| R66 (`init.sh` verde) | [x] | Ejecutado por el reviewer: exit 0, 280 de 280 |
| R67 (mapa de trazabilidad) | [x] | [implementations/myinvestor-statement.md](../implementations/myinvestor-statement.md) |
| R68 (`daySequence`, newest-first) | [x] | [parser.test.ts:254](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L254) y [parser.test.ts:289](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L289); aritmética recalculada a mano |
| R69 (una fila ilegible no consume número) | [x] | [parser.test.ts:273](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L273) |
| R70 (sin tipos propios) | [x] | [parser.test.ts:46](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L46) y [architecture.test.ts:262](../../src/architecture.test.ts#L262) |

**Ningún `R<n>` queda sin cobertura.** Los siete requirements de proceso (R58, R59,
R61, R62, R64, R66, R67) los he comprobado yo sobre el diff y sobre el disco, no
dándolos por buenos porque el informe lo diga.

## Tasks completas (SDD)

Las **18** tasks vivas de [`tasks.md`](../../specs/myinvestor-statement/tasks.md) están
`[x]` y verificadas contra el disco: T1-T6, T9-T12, T14-T16 y T18-T22. T7, T8, T13 y
T17 no existen aquí: se fueron enteras a la F13, y así está anotado en el propio
`tasks.md`. **No queda ninguna sin marcar.**

## Los dos puntos que el implementer declaró (juicio expreso)

### 1. La verificación de R2 contra el registro en `app.ts`: **lectura razonable, y el defecto es del spec**

El requirement R2 —«no compartir código de parseo con otro banco»— está cumplido y
verde. Lo que choca es su **nota de verificación**, que exige que «ningún otro archivo
de `src/` importa `modules/myinvestor/`», mientras `design.md` §1 y R51 obligan a
registrar la ruta en [app.ts:40](../../src/app.ts#L40). Las dos frases no pueden ser
ciertas a la vez.

**Es un defecto de redacción del spec, no una desviación del implementer.** El guardián
escrito en [architecture.test.ts:236](../../src/architecture.test.ts#L236) no relaja
nada: exige que la lista de importadores externos sea **exactamente** `['app.ts']`, y lo
hace buscando la cadena `myinvestor` en el fuente entero, no solo en los `import` (más
estricto que lo pedido). Además añade en
[architecture.test.ts:245](../../src/architecture.test.ts#L245) el invariante que R2
protege de verdad: ningún módulo de banco nombra al otro. La lectura literal habría
obligado a borrar el endpoint y a incumplir R51.
**Acción no bloqueante:** corregir la nota de verificación de R2 en el spec para que
diga «el único importador externo es la raíz de composición `app.ts`».

### 2. `failed[]` con `reason` en vez de `error`: **correcto no tocarlo aquí**

`design.md` §13 lo fija como `reason` y así está en
[myinvestor.types.ts:22](../../src/modules/myinvestor/myinvestor.types.ts#L22).
Bankinter usa `error` en
[bankinter.types.ts:37](../../src/modules/bankinter/bankinter.types.ts#L37).
Unificarlo aquí exigiría **modificar el módulo del otro banco**, cosa que el preámbulo
de `tasks.md` prohíbe expresamente, y cambiar un endpoint fuera del alcance de esta
feature. Seguir el spec y dejar la sugerencia anotada es la decisión correcta.
**Deuda consciente que sí ve el frontend:** `docs/api-contract.md` documenta
`{ bank, year, file, error }` para Bankinter y `{ bank, year, file, reason }` para
MyInvestor. Dos endpoints hermanos con dos nombres para lo mismo. No bloquea esta
feature; que lo unifique el próximo trabajo que toque el endpoint de Bankinter.

## Los puntos de dureza pedidos

- **Adhesión al contrato.** Búsqueda propia por todo `src/`: la única declaración de
  `ParsedMovement`, `UnparsedRow` y `ParsedMovementType` sigue siendo
  [src/lib/parsed-statement.ts](../../src/lib/parsed-statement.ts). El módulo declara
  solo el alias en [myinvestor.types.ts:19](../../src/modules/myinvestor/myinvestor.types.ts#L19),
  más sus tipos de ejecución (`FailedFile`, `IgnoredFile`, `ParsedStatementSummary`,
  `MyinvestorParseRunResult`), que no son el contrato. Los dos guardianes de la F11
  ([architecture.test.ts:262](../../src/architecture.test.ts#L262) y
  [architecture.test.ts:294](../../src/architecture.test.ts#L294)) siguen **verdes** con
  el módulo nuevo dentro.
- **`null` de verdad.** [parser.ts:89](../../src/modules/myinvestor/myinvestor.statement.parser.ts#L89)
  emite `accountIban: null` y [parser.ts:162](../../src/modules/myinvestor/myinvestor.statement.parser.ts#L162)
  emite `balance: null` en **cada** movimiento: clave presente, nunca `0` ni cadena
  vacía. Ni rastro de `providesBalance` en el resultado ni en el volcado, y el test de
  claves exactas lo blinda.
- **El test que lee el propio fuente del parser** ([parser.test.ts:226](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L226)):
  **vale, y no es tautológico.** No compara el fuente consigo mismo: descarta comentarios
  y líneas vacías y exige que la única línea de **código** que menciona `balance` sea la
  del literal nulo. Eso es exactamente lo que pide R19 y lo que un test de comportamiento
  no puede ver: un acumulador en una variable local que no se emitiera pasaría cualquier
  aserción sobre la salida. Es **frágil por diseño y de forma aceptable**: si alguien
  renombra el campo o parte la línea, el test se cae y hay que mirar por qué, que es lo
  que se espera de un guardián. Además la primera mitad del mismo test sí es de
  comportamiento (la suma de los importes no aparece en ningún campo del resultado), así
  que R19 no se apoya solo en el texto del fichero. **Aprobado tal cual.**
- **`daySequence`: aritmética verificada contra el fixture, no contra el informe.**
  Recorrido a mano de [myinvestor.fixture.ts:64](../../src/modules/myinvestor/myinvestor.fixture.ts#L64):
  del día `12/03/2026` hay **cuatro** líneas, una de ellas con importe ilegible (línea 3
  del archivo), así que quedan **tres** parseadas. Con `newest-first`,
  [assignDaySequence](../../src/lib/parsed-statement.ts#L96) numera 3, 2 y 1 en orden de
  archivo, y el test de [parser.test.ts:31](../../src/modules/myinvestor/myinvestor.statement.parser.test.ts#L31)
  exige `daySequence: 3` en el primer movimiento: **correcto, la fila ilegible no
  consumió el 4**. La numeración se aplica **al final**, sobre los drafts ya filtrados
  ([parser.ts:92](../../src/modules/myinvestor/myinvestor.statement.parser.ts#L92)), que
  es justo lo que hace posible R69.
- **`newest-first` es de verdad el orden de este banco.** No me he fiado de
  `decisions.md`: he leído **solo la columna de fechas** de la muestra real de
  `var/drive-read/myinvestor/2026/`, sin tocar importes ni conceptos. Línea 2:
  `06/08/2026`; línea 3: `03/08/2026`; …; línea 12: `08/07/2026`. **Descendente: el más
  reciente primero.** La constante de
  [parser.ts:9](../../src/modules/myinvestor/myinvestor.statement.parser.ts#L9) es
  correcta. De paso confirmo que el archivo real tiene la cabecera en la línea 1 y
  `Fecha de operación` como primera columna, como asume el fixture.
- **`deriveMovementTypeFromAmount` se importa, no se reimplementa**
  ([parser.ts:4](../../src/modules/myinvestor/myinvestor.statement.parser.ts#L4), usado en
  [parser.ts:165](../../src/modules/myinvestor/myinvestor.statement.parser.ts#L165)). No
  hay segunda copia con otro nombre: el guardián de
  [architecture.test.ts:294](../../src/architecture.test.ts#L294) recorre **todos** los
  `*.parser.ts` de `src/modules/` y rechaza cualquier ternario sobre el signo del importe.
  Importe 0 sale `neutral`, con test.
- **Alcance: no se ha adelantado nada de la F13.** No existen `myinvestor.product.parser.ts`
  ni `docs/myinvestor-product-files.md`. Los `.json` caen en `ignored[]` y hay un test que
  lo fija ([service.test.ts:101](../../src/modules/myinvestor/myinvestor.service.test.ts#L101)).
  El diff de `prisma/` contiene **solo** los modelos de inversiones de la F9
  (`InvestmentProduct`, `Valuation`, `InvestmentProductType`): la F10 no tocó el esquema.
  El módulo no nombra `prisma` (guardián) y no importa nada de `lib/drive*`: no se mueve
  nada en Drive.
- **Contrato con la F13: comprobado nombre a nombre.** La spec de la F13 da por hechos
  `myinvestor.format.ts` con `parseAmountText`
  ([format.ts:28](../../src/modules/myinvestor/myinvestor.format.ts#L28)),
  `myinvestor.service.ts` con `parseLocalMyinvestorCopies`
  ([service.ts:38](../../src/modules/myinvestor/myinvestor.service.ts#L38)) y su recorrido,
  el `try` por archivo ([service.ts:61](../../src/modules/myinvestor/myinvestor.service.ts#L61)),
  `failed[]`, `ignored[]` ([service.ts:52](../../src/modules/myinvestor/myinvestor.service.ts#L52))
  y el determinismo, más `myinvestor.routes.ts`, `myinvestor.types.ts`,
  `myinvestor.fixture.ts` y los tres ficheros de test que cita. **Todos existen con ese
  nombre exacto y en esa ubicación exacta.** La spec de la F13 no queda mintiendo.
- **Privacidad.** `git ls-files var` no devuelve nada: no se ha colado ningún archivo de
  `var/drive-read/myinvestor/`. `var/drive-read/` y `var/parsed/` siguen en `.gitignore`
  (sin tocar) con sus dos guardianes en
  [architecture.test.ts:309](../../src/architecture.test.ts#L309) y
  [architecture.test.ts:315](../../src/architecture.test.ts#L315). El fixture se genera
  íntegro en código, con cifras y conceptos inventados.
- **Cero dependencias nuevas.** `package.json` y `pnpm-lock.yaml` sin una sola línea de
  diff; el CSV se lee con `split`, como exige el spec.

## Criterios de aceptación de la feature 10 (`feature_list.json`)

- [x] Módulo propio con el slug normalizado de su carpeta de Drive, sin compartir parser → R1, R2.
- [x] Un movimiento estructurado por línea, con las dos fechas, concepto, importe con signo y divisa → R5, R8.
- [x] Importes con y sin separador de miles en el mismo archivo, y fechas día/mes/año → R9, R10.
- [x] El resultado refleja que este banco no aporta saldo, sin inventarlo ni calcularlo → R17, R19.
- [x] Consume el contrato de `src/lib/parsed-statement.ts` y solo declara su alias → R70.
- [x] Saldo e IBAN como `null` explícito conforme al ADR-013, sin `providesBalance` → R17, R18, R20.
- [x] `daySequence` contando desde el más antiguo, con `newest-first`, y las filas no reconocidas no consumen número → R68, R69.
- [x] El tipo se decide con `deriveMovementTypeFromAmount` → R11.
- [x] Volcado JSON local en ruta gitignoreada y dos ejecuciones dan el mismo resultado → R52, R55.
- [x] No toca BD ni Prisma, no enlaza productos, no parsea los JSON de producto, no mueve a procesados y no construye interfaz → R3, R4, R49, R50.
- [x] Fixtures sintéticos y ningún dato financiero real versionado → R59.
- [x] Trazabilidad mapeada, `./init.sh` verde y sin dependencias nuevas → R58, R66, R67.

## Arquitectura (`docs/architecture.md`)

- [x] El módulo vive en `src/modules/<banco>/` como el resto; el árbol del ADR-004 lo recoge y el guardián lo verifica.
- [x] Dependencias en un solo sentido: `routes` → `service` → `parser` → `format` y `lib`. Ninguna vuelta atrás, ninguna dependencia cruzada entre bancos.
- [x] El parser es puro (Buffer entra, resultado sale): no toca Drive, ni BD, ni reloj. Todo el I/O vive en el servicio.
- [x] ADR-014 escrito con sus alternativas descartadas; el ADR-013 se respeta y no se reabre.
- [x] `app.ts` sigue siendo la única raíz de composición.

## Convenciones (`docs/conventions.md`)

- [x] **§Idioma:** identificadores, tipos, nombres de fichero y comentarios en inglés; la prosa de `docs/` en español. Los `reason` que lee el humano van en español, coherente con lo que ya emite Bankinter.
- [x] **§Parsers de banco:** un parser por banco, varias entradas dentro del mismo módulo, y la **forma** de la salida compartida sin compartir el código que lee el formato. `myinvestor.format.ts` se queda **dentro** del módulo y no sube a `src/lib/`, con la razón escrita en su cabecera.
- [x] Estilo: comillas simples, sin punto y coma, dos espacios, imports relativos con `.js`, `import type` para tipos. `lint`, `format:check` y `typecheck` limpios dentro de `init.sh`.
- [x] Errores: `ValidationError` de `src/errors/app-error.ts` para el fallo estructural, nada de errores ad-hoc, y los mensajes no filtran rutas absolutas ni secretos ([service.ts:145](../../src/modules/myinvestor/myinvestor.service.ts#L145)).
- [x] Sin `console.log` ni TODOs sueltos en el módulo (verificado con grep).

## Verificación (`docs/verification.md`)

- [x] **Recursos correctos, sin mocks innecesarios:** el servicio y la ruta se prueban contra el sistema de ficheros real en un `mkdtemp`, no contra un doble de `fs`. Cero red. El único test que construye la app real ([routes.test.ts:122](../../src/modules/myinvestor/myinvestor.routes.test.ts#L122)) se limita a comprobar que la ruta está registrada y **no la invoca**, precisamente para no leer los datos reales de la máquina: decisión correcta y comentada en el propio test.
- [x] **Output concreto, no «no lanza excepción»:** los asserts comparan objetos completos con `toEqual` (el movimiento entero, el resumen entero, el cuerpo entero de la respuesta), no formas laxas.
- [x] **Camino de error real:** archivo sin cabecera, importe ilegible, fecha imposible, número de columnas inesperado, extensión no soportada, carpeta vacía y carpeta inexistente.
- [x] Nivel 4 (trazabilidad `R<n>` → test) cumplido, obligatorio por ser SDD.

## CHECKPOINTS.md

- [x] **C1 — Arnés completo:** archivos base y `docs/` presentes; `./init.sh` ejecutado
      por el reviewer con exit code 0.
- [x] **C2 — Estado coherente:** una sola feature `in_progress` (la 10); toda feature
      `done` con tests que pasan; `progress/current.md` describe esta sesión y no
      arrastra basura de sesiones anteriores.
- [x] **C3 — Arquitectura:** estructura conforme al árbol documentado, **cero
      dependencias nuevas**, sin logs de debug ni TODOs sueltos, convenciones respetadas.
- [x] **C4 — Verificación real:** 280 tests en 22 ficheros, camino feliz y camino de
      error, en el entorno descrito en `docs/verification.md`.
- [x] **C5 — Sesión cerrada bien:** nada sospechoso sin trackear (lo que aparece como no
      trackeado es harness, `specs/`, `progress/` y los fuentes de las features 9, 10 y
      11, aún sin commitear); `progress/history.md` tiene la entrada de la sesión
      anterior (F11) y la de la F10 la escribe el `leader` al cerrar, después de este
      veredicto; la feature sigue en `in_progress`, que es su estado correcto hasta que
      el implementer la marque `done`.
- [x] **C6 — Coherencia con el proyecto hermano:** el endpoint nuevo y su modelo quedan
      en `docs/api-contract.md`, la fuente de verdad que consume el frontend. No hay
      rutas ni tipos inventados fuera del contrato.
- [x] **C7 — SDD:** `specs/myinvestor-statement/` con los cuatro archivos;
      `decisions.md` cabe en una página, tiene sus bloques y **ningún punto rojo**;
      requirements en EARS; 34 requirements vivos, por encima del tope de ~15 pero con la
      razón dicha explícitamente y ya actuada (la feature se partió en dos por eso,
      `CHANGELOG-respec.md`); todas las tasks `[x]`; cada `R<n>` con test concreto.
- [x] **C8 — Resumen de cierre escrito:** [`progress/summaries/myinvestor-statement.md`](../summaries/myinvestor-statement.md).

## Ejecución de `./init.sh`

```
[OK] Stack detectado: node · Runtime v24.18.0
[OK] feature_list.json válido (13 features)
[OK] Type check OK (tsc sin errores)
     Test Files  22 passed (22)
          Tests  280 passed (280)
[OK] Entorno listo. Puedes empezar a trabajar.
```

Exit code **0**. Ejecutado por el reviewer, no copiado del informe.

## Resumen de cierre (APPROVED)

- Escrito en [`progress/summaries/myinvestor-statement.md`](../summaries/myinvestor-statement.md) → **sí**.

## Cambios requeridos

**Ninguno.** La feature se aprueba tal cual. El trabajo está limpio: el contrato se
consume sin redeclararlo, los nulos son nulos de verdad, la numeración del día está bien
calculada y verificada contra el fixture y contra la muestra real, el alcance no invade
la F13 y no se ha versionado ni un dato financiero.

## Anotaciones no bloqueantes (para quien venga detrás)

1. `specs/myinvestor-statement/requirements.md`, R2 — la *nota de verificación* está mal
   redactada («ningún otro archivo de `src/` importa el módulo») y contradice a
   `design.md` §1 y a R51. Defecto del spec, ya resuelto en el código con una lista
   blanca de un solo elemento; corregir la frase si ese spec se reutiliza de plantilla.
2. `docs/api-contract.md` — `failed[].error` (Bankinter) y `failed[].reason`
   (MyInvestor) nombran lo mismo de dos formas distintas de cara al frontend. Unificar en
   el próximo trabajo que toque el endpoint de Bankinter (previsiblemente la F12).
3. [parser.ts:125](../../src/modules/myinvestor/myinvestor.statement.parser.ts#L125) — un
   `;` dentro de un campo se reporta como «número de columnas inesperado» en
   `unparsedRows`. Límite conocido, visible y ya escrito en el ADR-014; se reevalúa el
   día que aparezca en un archivo real.
4. R14 fija el `row` como «1-based contando la cabecera»; la implementación usa el número
   de línea absoluto del archivo, que coincide salvo si algún día llega un extracto con
   preámbulo. Sin efecto hoy (el archivo real empieza por la cabecera), pero merece una
   línea si se acepta un formato con preámbulo.
