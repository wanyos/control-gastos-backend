# Review — feature 34 `guardian-knows-our-own-filenames`

Fecha: 2026-08-26 · Revisor: `reviewer` · Informe revisado:
[`progress/implementations/guardian-knows-our-own-filenames.md`](../implementations/guardian-knows-our-own-filenames.md)

**Veredicto:** APPROVED

Comprobado: los 10 criterios de `acceptance` ↔ tests, el `intent`, arquitectura,
convenciones, verificación y CHECKPOINTS C1-C5 y C8 (C6 no aplica: el contrato de API no
cambia en esta feature; C7 no aplica: `"sdd": false`). Sin hallazgos que bloqueen.

Resumen de cierre:
[`progress/summaries/guardian-knows-our-own-filenames.md`](../summaries/guardian-knows-our-own-filenames.md).

## Lo que se rehízo aquí, no se creyó

El criterio central de esta feature es «demuéstrame que el guardián no se ha aflojado».
Un informe que lo afirma no vale: se ha vuelto a medir.

| Comprobación | Lo que decía el informe | Lo que salió al repetirlo |
|---|---|---|
| **Mutación A** — ensanchar la exención a **todo** valor de `file` (`exemptionOf(node)` → `true`, [línea 538](../../src/no-real-data.test.ts#L538)) | 3 tests rojos, el central entre ellos | **3 rojos**, exactamente esos: `would have reported it without the rule…`, `KEEPS CATCHING a real datum of his inside a file name…`, `says WHAT it let through…` |
| **Mutación B** — quitar la mitad de procedencia (`fileNameKeys.has(key)` → `true`, [línea 537](../../src/no-real-data.test.ts#L537)) | 1 test rojo | **1 rojo**: `KEEPS CATCHING the very same name under a key that is not a file name` |
| **Mutación C** (añadida por el revisor) — apagar la exención entera (`fileNameKeys` a vacío) | «exactamente los 52 avisos de la F33» | **52 avisos exactos** en `copies no telling phrase of the local captures`, contra el `var/parsed/` real |
| **Exención sobre los volcados reales** | MyInvestor 0 de 5, Trade Republic 24 de 26 | **0 de 5** y **24 de 26**, contados sobre `var/parsed/*/2026/products.json` |

Las tres mutaciones se revirtieron; el archivo quedó **byte a byte** como estaba
(`md5` idéntico al de antes de tocarlo) y `git diff` no las conserva.

Las dos mitades de la regla son, por tanto, **portantes de verdad**: ninguna se puede
relajar sin que la suite lo diga, y el número de avisos que la exención se lleva es
**exactamente** el que se midió antes de escribirla, ni uno más.

## Lo que se miró con lupa, y por qué pasa

- **El test central** ([línea 1783](../../src/no-real-data.test.ts#L1783)) **no es
  vacuo**: la mutación A lo pone rojo, así que prueba lo que dice probar. Y afirma sobre
  la cadena **exacta** del aviso (`docs/example.md:1 — a three-word sequence copied from
  a file of var/…`), no sobre «hay algún fallo»; comprueba además que el mensaje **no
  lleva el valor** (ADR-017). Su gemelo de la línea
  [1770](../../src/no-real-data.test.ts#L1770) impide que el test de regresión sea un
  `expect([]).toEqual([])`.
- **El anclaje es real**: [`compilePublishedFilename`](../../src/no-real-data.test.ts#L392)
  escapa todo lo literal y devuelve `^…$`; el **único** hueco admitido es
  `<AAAA-MM-DD>` → `\d{4}-\d{2}-\d{2}`. Un hueco de cualquier otra clase devuelve `null`
  y **descarta el patrón entero**, no solo el hueco. Se buscó activamente por dónde colar
  algo: un patrón mal cerrado (`<abc` sin cierre) también devuelve `null`, es decir, falla
  hacia **vigilar**, no hacia eximir; y un valor eximido es, por construcción, texto
  literal de nuestros `docs/` más diez dígitos y guiones. No hay hueco donde esconder una
  palabra suya.
- **No hay lista escrita a mano.** Los patrones se leen de los `docs/*.md` **versionados**
  ([`publishedFilenames`](../../src/no-real-data.test.ts#L411)), de la línea «Convención
  recomendada … `patrón`». Comprobado contra el repo real: solo dos páginas la tienen, y
  la de MyInvestor (`<producto>-…`) se descarta. `fileNameKeys` es una lista de **claves**,
  no de excepciones: no crece para callar avisos —crece, si acaso, para que un banco nuevo
  deje de dar el falso positivo—, y su ausencia deja las cosas **vigiladas**, que es el
  lado seguro. El implementer lo dice en voz alta en sus sugerencias fuera de scope.
- **El 0 de 5 de MyInvestor es cierto**, y es la mejor prueba de que la exención es
  estrecha: su convención publicada lleva dentro el nombre que él le da al fondo, así que
  sus cinco nombres se siguen comparando enteros.
- **La decisión de NO reutilizar el mecanismo de la F24 se sostiene, y merece quedar
  registrada.** La F24 solo da por nuestra una frase que esté **literal en el código de
  producción**, y excluye tests y fixtures a propósito porque un fixture es donde se
  **copia** un dato (la fuga de la F19). La convención de nombres no vive en ningún
  literal de `src/` —comprobado: `remunerada` no aparece en ningún `.ts` de producción—,
  así que `ownSourceVocabulary` responde «esto no es mío» **con razón**. Meter los `docs/`
  en el vocabulario de la F24 habría autorizado a los `docs/` a demostrar autoría de
  **cualquier** frase, y los `docs/` son justo el sitio donde una fuga se pega: eso sí
  habría aflojado el guardián de verdad. Pieza aparte por una razón, no por comodidad.
- **Solo se toca una capa.** La de importes y la de IBAN siguen leyendo el texto **crudo**
  de la captura (`captureText`, [línea 281](../../src/no-real-data.test.ts#L281)); el
  reparto en `data` / `ourProse` / `letThrough` solo lo ve la capa de frases. Fijado en un
  test ([línea 1815](../../src/no-real-data.test.ts#L1815)).
- **No se ha aflojado nada por la puerta de atrás.** El `git diff` del guardián **elimina
  dos líneas**, las dos de la firma de `capturePhraseSources`. Ni una entrada nueva en
  `stopWords`, `allowedPaths` o `allowedIbans`, ni un `no-real-data-ok`, ni un umbral
  tocado, ni un `.skip`, ni una frase quitada de la documentación.
- **`./init.sh` pasado por el revisor**: `tsc` limpio, **49 archivos / 950 tests en
  verde**. El único `[FAIL]` es «Hay 3 features en `in_progress`», que se resuelve al
  cerrar la F31, la F33 y esta.
- **Fuera del alcance, respetado**: la única pieza de código tocada es
  `src/no-real-data.test.ts`; lo demás son cuatro `docs/` y `progress/`. Nada de `var/`,
  ni de la F31 (`accounts`, `import`, `movements`, `prisma`), ni de la F33
  (`src/lib/test-var.ts`, `vitest.global-setup.ts`), ni de los parsers. La convención que
  él usa para nombrar sus archivos **no cambia**: sus dos páginas solo ganan una nota.

## Comprobado sin hallazgos

Los 10 criterios de `acceptance` ↔ test (mapeo del informe verificado uno a uno, no
aceptado); los cuatro puntos de `como_se_que_esta_bien`; las cuatro decisiones delegadas,
resueltas por escrito; `docs/architecture.md` (ADR-017 revisado, con banner y bloque nuevo
en §Consecuencias) y `docs/conventions.md` (§Tests) coherentes con el código, sin
documentación desfasada; convenciones de estilo (inglés en código y nombres de test,
comentarios que explican el porqué); ADR-017 en lo nuevo: banco, página, convención y
producto **inventados**, y el propio guardián no señala ni una línea nueva; CHECKPOINTS
C1-C5 y C8.

## Observaciones no bloqueantes (no son cambios requeridos)

1. **La autoridad ahora incluye los `docs/`, con dos cerrojos.** Para eximir un valor hace
   falta que una página versionada publique ese texto como convención **y** que el valor
   venga bajo `file`. El riesgo residual —que alguien escriba un dato suyo dentro de una
   línea «Convención recomendada» de `docs/`— exige un acto deliberado en dos sitios, deja
   el dato **escrito en un doc versionado** (donde las demás capas lo siguen viendo) y es
   del mismo orden que el de la F24 (escribir su dato como literal de `src/`). Se anota por
   si algún día alguien amplía el lector de patrones: **ese** es el punto que habrá que
   volver a mirar.
2. **Ajeno a esta feature:** hay un `var/__reviewer-probe.txt` que no ha creado la F34 (ni
   este revisor) y que la red de la F33 detecta como escritura en `var/`. Es basura de otra
   sesión: convendría borrarlo antes de cerrar, preguntándole antes al humano —de `var/` no
   se borra nada sin permiso.
