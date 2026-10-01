# Qué subir a harness-template desde este proyecto — 2026-09-30

> Lista única, sin duplicados, de tres exploraciones de solo lectura. El texto
> exacto propuesto y la evidencia (archivo:línea, commit) de cada punto están en
> el informe de origen:
>
> - `[archivos]` → [harness-diff-archivos-2026-09-30.md](harness-diff-archivos-2026-09-30.md)
> - `[docs]` → [harness-diff-docs-2026-09-30.md](harness-diff-docs-2026-09-30.md)
> - `[correcciones]` → [harness-correcciones-humano-2026-09-30.md](harness-correcciones-humano-2026-09-30.md)
>
> Nada de esto está aplicado. Cada punto espera el sí / no / cambiar del humano.

## 0. Decidido el 2026-10-01: dónde vive cada cosa (se aplica en el paso 4)

Orden de trabajo: 1) dónde vive cada cosa · 2) repasar el harness que tenía el
proyecto (bloques A-D) · 3) repasar las novedades de la plantilla v2.2.0 ·
4) aplicar en harness-template, re-actualizar este proyecto y comprobar que no se
pierde nada · 5) siguiente proyecto (el frontend).

Aprobado por el humano:

1. **Regla:** nada propio del proyecto se escribe en un archivo que el update
   sobrescribe (la lista `MOTOR` de `upgrade-harness.sh`). `CLAUDE.md` lleva una
   tabla de dónde se apunta cada cosa: corrección del proyecto → `docs/lecciones.md`
   alcance `proyecto`; mejora global → `docs/lecciones.md` alcance `harness` + aviso
   de llevarla a la plantilla; estilo → `conventions.md`; verificación/checkpoint
   extra → `verification.md`; decisión → `architecture.md` (ADR); versiones →
   `stack.md`; término → `vocabulario.md`; deber o cabo suelto → `roadmap.md`;
   permiso → `.claude/settings.local.json` (no va a git). Si no encaja, se pregunta.
2. **Hook de Claude Code** que impide a los agentes editar, dentro de un proyecto,
   los archivos de la lista `MOTOR`, y responde a dónde va el cambio. No bloquea al
   humano ni en el repo de harness-template.
3. **Update con seguridad:** enseña el plan y pide confirmación antes de escribir;
   marca aparte lo que escribe en archivos del proyecto (crear si falta,
   `.git/info/exclude`); guarda huellas de lo instalado y, si un archivo de `MOTOR`
   no coincide con su huella, se para y enseña la diferencia; sin huellas (primera
   vez), todo lo que difiera de la plantilla se trata como cambiado a mano.

Pendiente: aprobar el término propuesto «motor del harness» (= los archivos que el
update sobrescribe enteros). Hasta entonces se describe literalmente.

## A. Globales: fallos que ya se repitieron (más valor)

| # | Qué | Dónde iría en la plantilla | Origen |
|---|---|---|---|
| A1 | **El implementer deja documentos que su cambio ha vuelto falsos** (README, contrato, stack, data-model, roadmap). 10 features rechazadas por esto. Paso nuevo: `git grep` de cada nombre/endpoint/columna cambiada y corregir; el reviewer lo comprueba; `tasks.md` asigna esos documentos a un lote | `implementer.md` paso 5b, `reviewer.md`, `spec-author.md` | [correcciones] H1+H2 |
| A2 | **Prueba con los archivos reales del humano antes de cerrar** (C4 bis, generalizado a «features que leen datos de fuera»). Se saltó 3 veces después de existir porque solo estaba en `CHECKPOINTS.md`: se añade también al protocolo del implementer, y saltarla sin decirlo es rechazo | `CHECKPOINTS.md` + `implementer.md` paso 5 | [archivos] A2, [correcciones] H3 |
| A3 | **Los tests nunca escriben en la base ni en las carpetas del humano**: recursos desechables, rutas inyectadas, foto antes/después. Pasó 3 veces. Y cambiar la frase del reviewer «usan recursos reales donde es viable», que empuja al revés | `docs/conventions.md` §Tests, `implementer.md`, `reviewer.md` | [docs] 3, [correcciones] H5 |
| A4 | **Ningún dato real del humano en un archivo versionado** (fixtures, docs, specs, progress), y si el proyecto maneja datos personales, un test que lo hace cumplir. Pasó 4 veces con la regla escrita | `implementer.md` reglas duras, `docs/conventions.md` §Tests | [docs] 4, [correcciones] H6 |
| A5 | **Algo que tiene que poner la pasada en rojo se demuestra en rojo**: provocarlo y mirar el exit code de `./init.sh` entero. Dos veces un aviso o `throw` salió con exit 0 | `implementer.md`, `reviewer.md` punto 4, `docs/verification.md` | [docs] 2, [correcciones] H4 |
| A6 | **Vocabulario: volvió a fallar dos veces tras la regla** (F46, F48). Paso para el implementer: repasar su informe y los docs tocados contra `docs/vocabulario.md` antes de entregar | `implementer.md` paso 6 | [correcciones] §3 |

## B. Globales: reglas de trabajo

| # | Qué | Dónde iría | Origen |
|---|---|---|---|
| B1 | Responder lo que se pregunta; no listar lo que falta ni reabrir lo cerrado | `CLAUDE.md`, sección nueva | [correcciones] H7 |
| B2 | Al sustituir algo, retirar lo viejo en la misma sesión y decirlo | `AGENTS.md` | [correcciones] H8 |
| B3 | `progress/current.md` se vacía al cerrar feature, con tabla de a dónde va cada cosa (llegó a 1231 líneas) | `progress/current.md` cabecera | [correcciones] H9 |
| B4 | Una regla que se puede comprobar leyendo el código se convierte en un test que dice archivo y línea | `docs/architecture.md` §Principios | [docs] 1 |
| B5 | Los ADR llevan «Lo que NO cubre», y una revisión se añade como cabecera fechada sin reescribir | `docs/architecture.md` ADR-000 | [docs] 5 |
| B6 | Ninguna herramienta de desarrollo bloquea actualizar el lenguaje o el runtime | `docs/stack.md` §Restricciones | [docs] 7 |

## C. Globales: `init.sh`, configuración y archivos

| # | Qué | Dónde iría | Origen |
|---|---|---|---|
| C1 | Paso de lint y formato, con una rama por stack (Node, .NET, Python, Rust, Go); solo si el proyecto lo declara. **Solo la rama Node está probada** | `init.sh` | [archivos] A1, [docs] 8 |
| C2 | El encabezado de la salida de `--fast` está bajo «5. Ejecución de tests» | `init.sh` | [archivos] G2 |
| C3 | Todo lector de un archivo del repo declara UTF-8 (regla en conventions) + `.editorconfig` para md/json/sh | `docs/conventions.md`, `.editorconfig` | [archivos] A3, [docs] 6 |
| C4 | `.gitattributes` con LF en el repo de la plantilla: hoy el update copia `init.sh` con CRLF | raíz de harness-template | [archivos] G3 |
| C5 | Permisos de solo lectura `git status/diff/log`, y `./init.sh --checks` (hoy pide confirmación cada vez) | `.claude/settings.json` | [archivos] G1 + observación |
| C6 | Entrecomillar el `description` de `spec-author` (hoy se registra igual; prioridad baja) | `spec-author.md:3` | [archivos] G4 |

## D. De este proyecto: dónde guardarlo para que el update no lo borre

| # | Qué | Propuesta |
|---|---|---|
| D1 | Párrafo de `CLAUDE.md` sobre los commits antiguos con la firma. Además: `git log` da 12, no 13, y el roadmap al que remite no lo recoge | Pasarlo a `docs/conventions.md` §Commits y quitarlo de `CLAUDE.md` |
| D2 | Permiso `npx vitest run` | `.claude/settings.local.json` (el update no lo toca) |
| D3 | **Choque anterior a hoy:** `docs/conventions.md:31-39` manda informes a `progress/implementations/` y veredictos a `progress/reviews/`, y nombres de archivo en inglés; los agentes (de antes y de ahora) dicen `progress/<feature>.md` | Decidir: mantener la del proyecto (y apuntarla en `docs/lecciones.md`) o adoptar la de la plantilla para features nuevas |
| D4 | Tres lecciones propias listas para `docs/lecciones.md`: archivos que escribe el humano se corrigen, no se toleran; `docs/data-model.md` al día (4 features); cifras reales en `.xls`/`.pdf` que el test no lee | Pegarlas en `docs/lecciones.md` |
| D5 | Lo que suba a la plantilla (A2, C1…) deja de necesitar estar a mano aquí | Nada: llega con el próximo update |

## E. Ya en la plantilla (no hace falta nada)

Carpetas `specs/<nn>-<name>/`, lectura UTF-8 de `feature_list.json`, `progress/summaries/`,
enlaces clicables en los resúmenes, nombre `spec-author`, sin firma de coautoría (no ha
vuelto a aparecer desde el 2026-08-12), regla de vocabulario, roadmap, límites de
`decisions.md`, hook y `/estado`, sincronía con el proyecto hermano.

## Decisiones del repaso (bloques A-D)

- **Término aprobado (2026-10-01): «motor del harness»** = los archivos que el
  update sobrescribe enteros (lista `MOTOR` de `upgrade-harness.sh`) y que en un
  proyecto no se editan. No abarca lo que se crea si falta (`lecciones.md`,
  `vocabulario.md`) ni los `docs/` que rellena el humano. Va a la tabla de términos
  del harness de `CLAUDE.md` en el paso 4.
- **A1 — sí** (2026-10-01), con el texto corto: paso nuevo en `implementer.md`
  entre 5 y 6 (`git grep` de lo que cambia, fuera de `progress/` y `specs/`,
  sección `## Documentos actualizados`, lo de fuera del lote es bloqueo);
  `reviewer.md` repite el `git grep`; `spec-author.md` pone esos documentos en
  `Archivos:` de un lote.
- **A2 — sí, ampliado** (2026-10-01):
  - Plantilla `CHECKPOINTS.md` C4 bis generalizado («si la feature lee datos de
    fuera del código, antes de cerrar se prueba con un dato real»), sin bancos. El
    resultado va en el informe del implementer, sección `## Prueba real`, con
    recuentos y forma, nunca contenido. Si no se puede, se dice y el leader lo pasa
    a deberes del roadmap. Saltarla sin decirlo = `CHANGES_REQUESTED`.
    `implementer.md` paso 5 remite a C4 bis.
  - **Datos de prueba (añadido por el humano):** estructura real, valores
    inventados. 1) Si hay archivos reales, el fixture copia su forma (columnas,
    orden, encoding, separador, cabeceras, rarezas) con valores inventados.
    2) Tests contra los archivos reales en una carpeta fuera de git; si no está, se
    saltan diciéndolo. 3) Sin archivos reales: datos que imitan los de la
    aplicación (plausibles, casos límite reales), nada de «foo» ni importes
    redondos. 4) La prueba real de C4 bis, al final. Cada proyecto puede relajar
    1-2 en `docs/conventions.md` si sus datos no son personales.
  - Ejemplos de bancos (N26, Openbank, F14/ADR-017) → `docs/verification.md` de
    este proyecto, sección Nivel 3.
  - Nota de diseño: una regla global tiene que vivir en un archivo del motor del
    harness (agentes, `CHECKPOINTS.md`), no en `docs/conventions.md` o
    `docs/verification.md` de la plantilla: esos solo llegan a proyectos nuevos.
- **A3 — sí** (2026-10-01): `implementer.md` regla dura (nada escribe en la base
  ni en las carpetas de datos del humano; base y directorio desechables; rutas por
  parámetro; si pasa por accidente, primera línea del informe). `reviewer.md`:
  «recursos reales donde es viable» → «del mismo tipo que los reales, pero
  desechables, y nunca los del humano». Lo concreto de este proyecto ya vive en
  `docs/conventions.md` y ADR-027/029.
- **A4 — sí** (2026-10-01): `implementer.md` regla dura (ningún dato real del
  humano en un archivo que va a git: fixtures, docs, specs, informes,
  comentarios; tampoco lo que pegue en la conversación; valores inventados desde
  cero, nunca partiendo de uno real) + una línea en `reviewer.md`. El test que lo
  vigila (`src/no-real-data.test.ts`) se queda en este proyecto.
- **A5 — sí** (2026-10-01): `implementer.md` (si añades algo que avisa o pone la
  pasada en rojo: provocar el caso, `./init.sh` entero, pegar código de salida y
  líneas del aviso; que su test pase no basta) + `reviewer.md` repite la
  provocación. Lo concreto de vitest se queda en ADR-029 de este proyecto.
- **A6 — sí** (2026-10-01): paso de repaso de vocabulario antes de entregar en
  `implementer.md` (informe y docs tocados), `reviewer.md` (siempre) y
  `spec-author.md` (`decisions.md`): cada palabra que nombre un mecanismo tiene que
  estar en la tabla de `CLAUDE.md` o en `docs/vocabulario.md`; si no, literal.
- **B1 — sí, ampliado** (2026-10-01): sección nueva en `CLAUDE.md` «Responde lo
  que se pregunta, y lo cerrado no se reabre» (sin listas de pendientes no
  pedidas; lo cerrado no se reabre; lo encontrado se apunta y se menciona solo si
  afecta; un fallo real se dice siempre). **Añadido del humano:** sugerencias e
  ideas sí, en corto (máx. 3 líneas, al final): forma mejor de hacer lo pedido u
  otra perspectiva (diseño, aspecto, funcionalidad, claridad); qué, por qué, qué
  cuesta; no se aplica sin su sí; si dice que no, no se vuelve a sacar. Fila nueva
  en la tabla de §0: idea de producto o diseño para más adelante → documento de
  ideas del proyecto, o `docs/roadmap.md` si no tiene.
- **B2 — sí** (2026-10-01): `AGENTS.md`, regla «al sustituir o arreglar algo, se
  quita lo viejo en la misma sesión y se dice (qué y dónde, en todos los sitios);
  si está fuera del repo, ruta exacta al humano en ese momento».
- **B3 — sí** (2026-10-01): cabecera nueva de `progress/current.md` en la
  plantilla con la tabla «qué → dónde va al cerrar» (resultado en una línea →
  `history.md`; detalle → `summaries/<feature>.md`; informe y veredicto →
  `<feature>.md`, a ajustar tras D3; cabo suelto o deber → `docs/roadmap.md`); se
  mueve, no se copia. Y en `CHECKPOINTS.md` C5: «`current.md` queda vacío, cada
  cosa en su sitio según esa tabla», para que llegue a proyectos existentes.
- **B4 — sí** (2026-10-01): `leader.md`, sección de apuntar correcciones: si la
  corrección se puede comprobar mirando los archivos del repo, proponer al humano
  convertirla en un test que falle con archivo y línea, en el momento. Y una línea
  igual en «Principios» de `docs/architecture.md` de la plantilla (solo proyectos
  nuevos).
- **B5 — sí** (2026-10-01): ADR-000 de `docs/architecture.md` de la plantilla con
  apartado «Lo que NO cubre» y regla de revisión (no se reescribe: línea «Revisado
  el YYYY-MM-DD por la feature N: qué cambió»; si se sustituye, `superada por
  ADR-NNN`). Y esa regla en una línea de `AGENTS.md` para proyectos existentes.
- **B6 — sí** (2026-10-01): `docs/stack.md` de la plantilla, §Restricciones:
  ninguna herramienta de desarrollo impide actualizar lenguaje/runtime/framework;
  se cambia la herramienta, no se congela la dependencia. Y en `implementer.md`:
  si una herramienta bloquea una actualización, no congelar; avisar y proponer
  cambiarla.
- **C1 + C2 — sí** (2026-10-01): paso «Lint y formato» en `init.sh` de la
  plantilla, entre la salida de `--fast` y los tests, solo si el proyecto ha
  configurado la herramienta: Node → scripts `lint`/`format:check` de
  `package.json`; .NET → si hay `.editorconfig`, `dotnet format
  --verify-no-changes`; Python → si `pyproject.toml` configura ruff, `ruff check`
  + `ruff format --check`; Rust/Go → `cargo fmt --check` / `gofmt -l`. Sin
  configurar: una línea de aviso, no rojo. Solo la rama Node está probada; la de
  C# se prueba al actualizar un proyecto C#. Se corrige el título del bloque de
  salida de `--fast` (C2). La sección propia de este proyecto desaparece.
- **C3 + C4 — sí, para Windows, macOS y Linux** (2026-10-01; el humano trabaja
  en los tres y mueve el proyecto entre ordenadores):
  - `implementer.md`: todo lector de un archivo del repo declara UTF-8; si falla
    un carácter, se arregla el lector, no el contenido. `.editorconfig` básico
    (UTF-8, LF en md/json/sh) en la plantilla para proyectos nuevos.
  - `.gitattributes` (`* text=auto eol=lf`) en harness-template y normalizar una
    vez. El update **crea `.gitattributes` si falta** en el proyecto, con aviso.
    Se arregla en el repo, nunca en la configuración del ordenador
    (`core.autocrlf`).
  - Regla en la plantilla: los scripts del harness funcionan en Git Bash
    (Windows), macOS (bash 3.2, herramientas BSD) y Linux. Lo nuevo lo cumple:
    huellas con `sha256sum` o `shasum -a 256`, lo que exista. Revisado hoy: los
    scripts actuales no usan `sed -i`, `sha256sum`, `readlink -f`, `stat -c`,
    `date -d`, `declare -A`, `mapfile`.
  - **No comprobado en macOS ni Linux** (solo hay este Windows). Deber del
    humano: en el Mac, `./init.sh` y `upgrade-harness.sh <proyecto> --dry`.
- **C5 + C6 — sí** (2026-10-01): `.claude/settings.json` de la plantilla con
  `git status*`, `git diff*`, `git log*` y `./init.sh --checks*`; `description`
  de `spec-author.md` entre comillas.
- **D1 — sí** (2026-10-01): el párrafo de commits antiguos sale de `CLAUDE.md` y
  va a `docs/conventions.md` §Commits, corregido: **12** commits anteriores a
  `ec5c786` (el último `c3db02f`, 2026-08-12; `c2a5153` solo nombra el trailer en
  su texto, no lo lleva — comprobado con `git log`). Sin la remisión al roadmap.
- **D2 — no se guarda** (2026-10-01): el permiso `npx vitest run` no se guarda en
  ningún sitio; «no pasa nada por volverlos a dar».
- **D3 — opción A** (2026-10-01): las carpetas de este proyecto pasan a la
  plantilla para todos: `progress/implementations/<feature>.md` (informe del
  implementer), `progress/reviews/<feature>.md` (veredicto),
  `progress/summaries/<feature>.md` (resumen), `progress/explorations/<topic>.md`
  (investigaciones); `current.md` e `history.md` en la raíz. La fila «informe y
  veredicto» de B3 se ajusta a esto.
- **Nombres en inglés, global** (2026-10-01): el humano lo quiere todo en inglés
  (carpetas y archivos; la prosa sigue en español). En la plantilla:
  `docs/lecciones.md` → `docs/lessons.md`; `docs/vocabulario.md` →
  `docs/vocabulary.md`; `docs/resumen-template.md` → `docs/summary-template.md`;
  `.claude/commands/lecciones.md` → `lessons.md` (`/lessons`);
  `.claude/commands/estado.md` → `project-status.md` (`/project-status`, porque
  `/status` choca con el de Claude Code); `config-harness.md` →
  `harness-config.md`. El update renombra `lessons.md`/`vocabulary.md` del
  proyecto conservando el contenido, con aviso, y quita los nombres viejos del
  motor diciendo cuáles. Se actualizan los términos aprobados de `CLAUDE.md`. La
  línea de `docs/conventions.md` («siempre en inglés, incluidos los del harness»)
  queda bien como está.
- **Fila de permisos de la tabla §0 cambiada** (2026-10-01): «un permiso solo de
  este proyecto no se guarda; se concede cuando haga falta».
- **D4 — sí** (2026-10-01): tres lecciones `proyecto` para `docs/lessons.md` (se
  escriben en el paso 4): archivos del humano se corrigen, no se toleran (y nunca
  en silencio); `docs/data-model.md` al día en el mismo cambio; fixtures `.xls` /
  `.pdf` comprobados a mano porque `no-real-data.test.ts` no los lee.
- **Bloques A-D cerrados** (2026-10-01). Siguiente: paso 3, novedades de la v2.2.0.

## Paso 3: novedades de la plantilla v2.2.0

- **N1 `checks` — se quedan** (2026-10-01), tal como vienen.
- Pendiente de cerrar: N2 lecciones, N3 modelos (el humano propone niveles de
  consumo), N4 resumen con símbolos. Y aparte: claves de `feature_list.json` en
  español (`como_se_que_esta_bien`, `descripcion`, `comando`, `que_quiero`…), a
  preguntar si pasan al inglés.
- **N3 modelos → niveles de consumo — sí** (2026-10-01). Términos aprobados
  (propuestos por el humano): **bajo consumo** (implementer `sonnet`, resto
  `opus`), **medio consumo** (todo `opus`; por defecto al empezar cada sesión),
  **alto consumo** (`fable` en las fases que el humano diga al activarlo:
  spec / implementación / revisión; el resto `opus`). Se cambia diciéndoselo al
  leader, que lo aplica con el parámetro `model` al lanzar cada subagente (manda
  sobre el frontmatter) y lo confirma en una línea. Alto consumo = permiso de
  Fable, solo hasta terminar la feature en curso; luego vuelve solo a medio. El
  nivel en uso se apunta en `progress/current.md`. El leader no puede cambiar su
  propio modelo: si se quiere Fable en la sesión principal, lo cambia el humano
  con `/model` y el leader se lo recuerda. Fuera de alto consumo, Fable nunca sin
  aprobación para esa tarea. Búsquedas: `opus` en los tres niveles.
- **N2 lecciones — se quedan, con ajuste** (2026-10-01): regla nueva «una
  corrección sobre cómo trabajar va a `docs/lessons.md`, nunca a la memoria
  automática de Claude Code» (la memoria vive en el usuario de cada ordenador, no
  viaja; no comprobado si la leen los subagentes). La memoria solo para lo
  personal. En el paso 4, borrar de la memoria de este proyecto lo ya cubierto:
  coautoría (CLAUDE.md), paso a paso (B1), resolver en el momento (B2), prueba
  real (A2), archivos del humano (D4), enlaces clicables (según N4); la de la
  limpieza del harness, al terminar.
- **N4 resumen — mezcla** (2026-10-01): puntos de entrada (3-6) con enlace y
  línea `[archivo:NN](…#LNN)`; el resto, enlace al **archivo sin línea** + nombre
  del símbolo (`[movements.service.ts](…) → computeTotals`). Clicable, no caduca.
  Se ajusta `docs/summary-template.md` de la plantilla.
- **Claves de `feature_list.json` — se quedan en español** (2026-10-01). Regla del
  humano: **nombres de archivos y carpetas en inglés; el contenido de los archivos
  que él lee (docs, harness, campos de `feature_list.json`) en español**, porque le
  cuesta menos leerlo. El código sigue la convención de cada proyecto (aquí,
  identificadores en inglés según `docs/conventions.md`).
- **Paso 3 cerrado** (2026-10-01). Siguiente: paso 4, aplicar.

## Paso 4: aplicación — decisiones tomadas por el camino

- **Harness dentro o fuera de git** (2026-10-01): dos modos elegidos al instalar.
  **Dentro de git** (por defecto, `apply-harness.sh .`): se versiona y viaja con
  el repo. **Fuera de git** (`apply-harness.sh . --private`): los scripts añaden
  solos todos los archivos del harness a `.git/info/exclude` (la lista sale de
  los scripts, nunca a mano); el update la mantiene al día; `init.sh` sale en
  rojo si algún archivo del harness está en git en ese modo. El modo se reconoce
  por la marca del exclude. Nombres aprobados: «dentro de git» / «fuera de git»,
  opción `--private`.
