# Diferencias del harness: proyecto antes del update ↔ plantilla actual (2026-09-30)

> Exploración de solo lectura. Compara los archivos del harness de este proyecto
> **antes** del update (`.harness-backup-20260930-215759/` y `git show HEAD:<archivo>`)
> con la copia de trabajo de `C:\Users\roybe\Escritorio\claude\harness-template`,
> ignorando finales de línea, y repasa los commits del proyecto que tocaron el harness.

## Cómo se comprobó

- **Copia de seguridad = HEAD.** `diff <(tr -d '\r' < backup/X) <(git show HEAD:X | tr -d '\r')`
  da 0 líneas en los 9 archivos de la raíz, `docs/` y `specs/` y en `settings.json`.
  Así que todo lo de abajo vale tanto para la copia como para HEAD.
- **Diff HEAD → plantilla**, archivo a archivo, ignorando `\r`. Líneas de diff:
  `implementer.md` 23 · `leader.md` 75 · `reviewer.md` 35 · `spec-author.md` 13 ·
  `commands/estado.md` 0 · `settings.json` 21 · `hooks/verify-changed.sh` 0 ·
  `AGENTS.md` 8 · `CHECKPOINTS.md` 30 · `CLAUDE.md` 37 · `docs/specs.md` 61 ·
  `init.sh` 215 · `decisions-template.md` 11 · `intent-template.md` 4 · `specs/README.md` 0.
- **Casi todo el diff va en una dirección: lo que la plantilla tiene y el proyecto no**
  (`checks` / `./init.sh --checks`, `docs/lecciones.md`, `model:` en el frontmatter de
  los agentes, la regla de Fable, la tabla de términos del harness en `CLAUDE.md`, la
  tabla 🧪 de `decisions-template.md`). Eso no se lista abajo: no es una mejora del proyecto.
- **Lo que el proyecto tenía y la plantilla no** se reduce a 7 bloques de texto
  (hallazgos G1, G2, A1, A2, P1, P2, P3, P5). El resto de hallazgos salen del `git log`.
- **Estado de la copia de trabajo ahora mismo:** `settings.json` (permisos git/vitest),
  `CHECKPOINTS.md` (C4 bis), `CLAUDE.md` (párrafo de commits) e `init.sh` ya difieren de
  la plantilla porque alguien los ha vuelto a meter tras el update (diff actual ↔
  plantilla: 8, 22, 6 y 61 líneas). Los demás archivos del motor son idénticos a la plantilla.
- `upgrade-harness.sh` (plantilla, líneas 42-84): **sobrescribe** `AGENTS.md`,
  `CHECKPOINTS.md`, `CLAUDE.md`, `init.sh`, `VERSION`, los 4 agentes, `commands/estado.md`,
  `commands/lecciones.md`, `hooks/verify-changed.sh`, `.claude/settings.json`,
  `docs/specs.md`, `docs/intent-template.md`, `docs/decisions-template.md`,
  `docs/resumen-template.md`, `specs/README.md`. **Crea si falta**
  `docs/vocabulario.md`, `docs/lecciones.md`. **No toca nunca** `docs/stack.md`,
  `architecture.md`, `conventions.md`, `verification.md`, `related-projects.md`,
  `roadmap.md`, `feature_list.json`, `progress/`, `specs/<nn>-<feature>/`. Tampoco toca
  (no aparecen en ninguna lista) `.claude/settings.local.json`, `.editorconfig`,
  `.gitattributes`.

---

## GLOBAL — subir tal cual

### G1. Permisos de lectura de git en `.claude/settings.json`

- **Evidencia:** backup `.claude/settings.json:36-38` (`Bash(git status*)`,
  `Bash(git diff*)`, `Bash(git log*)`); commit `6731dd1` («Añadidos los tres de git que
  se usan a diario»). La plantilla (`.claude/settings.json:29-47`) no tiene ningún
  permiso de git: comprobado con `grep -n "git status\|git diff\|git log"` → sin resultados.
- **Por qué es global:** todo proyecto del harness vive en git, y los tres comandos son
  de solo lectura. El `reviewer` y el `leader` los usan para ver qué cambió.
- **Dónde va:** plantilla `.claude/settings.json`, al final de `permissions.allow`:

  ```json
        "Bash(git status*)",
        "Bash(git diff*)",
        "Bash(git log*)"
  ```

### G2. `init.sh`: el encabezado de la salida del modo `--fast` está mal puesto en la plantilla

- **Evidencia:** backup `init.sh:323-333` tenía un encabezado propio
  `# Salida temprana del modo --fast: estado y tipos, sin lint ni suite.` encima del
  `if [ "$MODE" = "fast" ]`. En la plantilla (`init.sh:460-471`) ese bloque está bajo el
  encabezado `# 5. Ejecución de tests (depende del stack)`, que no describe lo que hace:
  en modo `--fast` sale **sin** ejecutar tests.
- **Por qué es global:** es el mismo script en todos los proyectos; solo afecta a quien lo lee.
  Menor, pero necesario si se añade A1 (el paso de lint va entre esa salida y los tests).
- **Dónde va:** plantilla `init.sh`, sustituir las líneas 460-462 por:

  ```bash
  # ─────────────────────────────────────────────────────────────────────
  # Salida temprana del modo --fast: estado y tipos, sin lint ni suite.
  # ─────────────────────────────────────────────────────────────────────
  ```

  y poner el encabezado `# 5. Ejecución de tests (depende del stack)` justo encima de
  `echo "── 5. Ejecutando tests ──…"` (plantilla `init.sh:473-474`).

### G3. `.gitattributes` con LF en el propio repo de la plantilla

- **Evidencia:** commit `58da26b` del proyecto (2026-08-12): sin `.gitattributes`, con
  `core.autocrlf=true` en Windows los archivos se extraen con CRLF y `format:check` se
  ponía rojo en 13 archivos sin editar. El proyecto lo arregló con
  `* text=auto eol=lf` (`.gitattributes:12`).
  Comprobado hoy: en el repo de la plantilla `git config core.autocrlf` = `true` y **no
  hay** `.gitattributes`; su `init.sh` tiene 501 líneas con `\r`. Tras el update, el
  `init.sh` del proyecto tiene 544 líneas con `\r` (`grep -c $'\r' init.sh`), aunque el
  proyecto pide LF. **No he comprobado que eso rompa nada:** `./init.sh --state` sale con
  exit 0 con el archivo en CRLF, y git normaliza a LF al hacer commit. El efecto
  comprobado es solo que el update copia al proyecto archivos con finales de línea
  distintos de los que el proyecto declara.
- **Dónde va:** nuevo archivo `.gitattributes` en la raíz de `harness-template` (solo
  para el repo de la plantilla; no hace falta meterlo en `MOTOR`):

  ```gitattributes
  # Finales de línea: LF en el repositorio y en el disco, también en Windows.
  # Sin esto manda core.autocrlf (true en Windows) y upgrade-harness.sh copia
  # los archivos del motor con CRLF a proyectos que piden LF.
  * text=auto eol=lf
  ```

  Tras añadirlo, `git add --renormalize .` en la plantilla para que el árbol de
  trabajo quede en LF.

### G4. Entrecomillar el `description` del frontmatter de `spec-author`

- **Evidencia:** commit `64d776f` (2026-07-25): el `description` contenía `"sdd": true`
  sin comillas; la secuencia `: ` rompía el YAML y el agente no se registraba. El arreglo
  se perdió después: HEAD y plantilla (`.claude/agents/spec-author.md:3`) vuelven a
  tener `... con "sdd": true. NUNCA ...` sin comillas.
  **Hoy sí se registra:** en esta sesión `spec-author` aparece en la lista de tipos de
  agente disponibles con ese mismo texto. Así que el fallo de julio no se reproduce con
  la versión actual de Claude Code; es YAML no válido que hoy se tolera.
- **Prioridad baja**, defensivo. **Dónde va:** plantilla `.claude/agents/spec-author.md:3`:

  ```yaml
  description: "Redacta specs Kiro-style (decisions/requirements/design/tasks) para una feature pending con sdd a true. NUNCA escribe código de aplicación ni tests."
  ```

---

## GLOBAL CON AJUSTE — la idea vale para todos, el texto está atado a este proyecto

### A1. `init.sh` ejecuta lint y formato (ya conocido, pendiente de decidir)

- **Evidencia:** backup `init.sh:336-374`, commit `5983c9b` (2026-09-01): «`./init.sh` no
  ejecutaba NI el linter NI el formateador […] Ahora hay un paso 5 […] colocado después
  de la salida del modo --fast para no cargar el ciclo corto del hook». En la plantilla no
  hay nada equivalente (`grep -n lint init.sh` → solo comentarios de tsc).
- **Lo atado a Node:** el bloque entero va dentro de `if [ "$STACK" = "node" ]` y busca
  los scripts `"lint"` y `"format:check"` en `package.json`. El comentario WHY cita
  `docs/conventions.md` y fechas del proyecto.
- **Versión generalizada propuesta** (plantilla `init.sh`, entre la salida del modo
  `--fast` y el paso de tests; renumerar tests a 6 y resumen a 7):

  ```bash
  # ─────────────────────────────────────────────────────────────────────
  # 5. Lint y formato (solo si el proyecto los declara)
  # ─────────────────────────────────────────────────────────────────────
  # WHY: un estándar de estilo escrito en docs/conventions.md que ningún paso
  # comprueba deja de cumplirse sin que nadie se entere. Va DESPUÉS de la salida
  # del modo --fast a propósito: ese modo lo lanza el hook tras cada edición y
  # ahí manda el tiempo de vuelta.
  LINT_CMD=""; FORMAT_CMD=""
  case "$STACK" in
    node)
      grep -q '"lint"' package.json 2>/dev/null && LINT_CMD="$PKG run lint"
      grep -q '"format:check"' package.json 2>/dev/null && FORMAT_CMD="$PKG run format:check"
      ;;
    dotnet)
      FORMAT_CMD="dotnet format --verify-no-changes"
      ;;
    python)
      command -v ruff >/dev/null 2>&1 && LINT_CMD="ruff check ." && FORMAT_CMD="ruff format --check ."
      ;;
    rust)
      LINT_CMD="cargo clippy -- -D warnings"; FORMAT_CMD="cargo fmt --check"
      ;;
    go)
      FORMAT_CMD='test -z "$(gofmt -l .)"'
      ;;
  esac
  if [ -n "$LINT_CMD$FORMAT_CMD" ]; then
    echo ""
    echo "── 5. Lint y formato ───────────────────────────────────"
    for CMD in "$LINT_CMD" "$FORMAT_CMD"; do
      [ -z "$CMD" ] && continue
      info "Ejecutando: $CMD"
      if eval "$CMD"; then ok "OK: $CMD"; else fail "Fallido: $CMD"; EXIT_CODE=1; fi
    done
  else
    warn "El proyecto no declara lint ni formato para el stack '$STACK'"
  fi
  ```

  **No he ejecutado esta versión generalizada** en ningún stack: es una propuesta de
  texto. Solo está comprobada la rama Node, que es la del proyecto (el commit `5983c9b`
  dice que se probó metiendo un archivo mal formateado). Para comprobar las demás haría
  falta lanzar `./init.sh` en un proyecto C#/Python con un archivo mal formateado.

### A2. C4 bis: la prueba con un fichero real antes de cerrar (ya conocido, pendiente de decidir)

- **Evidencia:** backup `CHECKPOINTS.md:39-58`; memoria del proyecto
  `prueba-real-antes-de-cerrar-feature.md`. Resultados reales que lo justifican, en la
  propia sección: N26 (493 tests en verde, el mismo IBAN con y sin espacios creaba dos
  cuentas → F21) y Openbank (628 tests en verde, importes reales colados en un fixture y
  un mensaje de error falso → F22). Hoy hay 20 informes en `progress/explorations/`, varios
  `prueba-real-*`.
- **Cobertura en la plantilla:** parcial. `docs/verification.md:41-47` tiene «Nivel 3 —
  Smoke test manual (opcional pero recomendado)» con un TODO. No hay nada en
  `CHECKPOINTS.md` que lo haga obligatorio para ningún tipo de feature.
- **Lo atado al proyecto:** «parser de banco», «IBAN», «🔒 F14 / ADR-017», los nombres de
  bancos y features.
- **Versión generalizada propuesta** (plantilla `CHECKPOINTS.md`, nueva sección entre C4
  y C5):

  ```markdown
  ## C4 bis — Una pasada con datos reales, en las features que leen datos de fuera

  > No sustituye a los tests: los complementa. Los tests usan datos inventados; esta
  > pasada comprueba lo que el fichero, la API o el sistema de fuera hace de verdad.

  - [ ] Si la feature añade o cambia la lectura de datos que no escribe el propio
        código (un fichero que sube o descarga el humano, la respuesta de una API
        externa, una importación), antes de cerrarla se hace **una pasada con un dato
        real** y su informe va a `progress/prueba-real-<tema>-<fecha>.md`.
  - [ ] El informe lleva **recuentos y forma, nunca contenido**: ni importes, ni
        identificadores personales, ni texto literal de los datos.

  **Por qué:** en el proyecto donde nació, las dos primeras veces que se hizo encontró
  defectos que la suite en verde no podía ver (un mismo identificador escrito de dos
  formas creaba dos registros; un mensaje de error falso ante otra codificación del
  mismo fichero). Dos features nuevas salieron de dos pasadas manuales.
  ```

  (La ruta del informe usa `progress/` a secas porque la plantilla no tiene
  `progress/explorations/`; ver P4.)
- **Parte de este proyecto** (los ejemplos N26/Openbank y la referencia a F14/ADR-017):
  a `docs/verification.md` (el update no lo toca), en una subsección «Prueba real» bajo el
  Nivel 3, que es donde la plantilla ya habla de pruebas manuales.

### A3. `.editorconfig` y la regla «todo lector declara UTF-8»

- **Evidencia:** commit `2b49f53` (2026-08-11) creó `.editorconfig` y la regla en
  `docs/conventions.md:22-30` («todo script o herramienta que lea un fichero del repo
  declare el encoding explícitamente […] en Windows el de Python es `cp1252`»).
  La parte de `init.sh` **ya está en la plantilla** (`init.sh:74` y `:298`,
  `encoding="utf-8"`, y `PYTHONIOENCODING=utf-8`). Lo que no está: la plantilla no tiene
  `.editorconfig` (comprobado con `ls -a`) y su `docs/conventions.md` no menciona UTF-8
  (`grep -n "utf-8\|UTF-8"` → sin resultados).
- **Lo atado al proyecto:** la sección `[*.{js,mjs,cjs,ts,mts,cts}]` de `.editorconfig`
  (2 espacios, 100 columnas, Prettier) y la extensión `prisma`.
- **Versión generalizada propuesta:**
  - Plantilla `docs/conventions.md` (solo llega a proyectos nuevos vía `apply-harness.sh`,
    porque es archivo del humano), en §Idioma:

    ```markdown
    - **Todo se lee en UTF-8, siempre declarado.** Los `.md`, `.json` y `.sh` del
      repositorio son UTF-8 y llevan tildes con normalidad. Todo script o herramienta
      que lea un fichero del repo declara el encoding explícitamente, sin confiar en
      el del sistema (en Windows, Python usa `cp1252` y revienta con una tilde). Se
      arregla en el lector, no evitando caracteres en el contenido.
    ```
  - Plantilla: nuevo `.editorconfig` solo con la parte de los archivos del harness, que
    `apply-harness.sh` copie si el proyecto no tiene uno:

    ```ini
    root = true

    # Archivos del harness y de datos, leídos por init.sh y por los agentes.
    # charset explícito para que ningún lector caiga al encoding del sistema.
    # No se recorta el espacio final: en Markdown dos espacios son salto de línea.
    [*.{md,json,sh}]
    charset = utf-8
    end_of_line = lf
    insert_final_newline = true
    ```
  **No he comprobado** cómo copia `apply-harness.sh` los archivos de la raíz; haría
  falta leerlo antes de añadir `.editorconfig` a su lista.

---

## PROYECTO — solo tiene sentido aquí

### P1. Párrafo de `CLAUDE.md` sobre los commits antiguos con la firma de coautoría (ya conocido)

- **Evidencia:** backup `CLAUDE.md:35-38`; commit `c2a5153`. La parte general («los
  commits antiguos que ya la lleven se quedan como están») **ya está en la plantilla**
  (`CLAUDE.md:32`). Lo propio es «los 13 commits anteriores a `ec5c786`».
- **Discrepancia encontrada:** `git log -i --grep='co-authored-by: claude' ec5c786~1 | wc -l`
  devuelve **12**, no 13. No he buscado cuál es el decimotercero (podría llevar otra
  redacción del trailer); para comprobarlo, `git log --format='%h %B' ec5c786~1` y leer
  los finales.
- **El párrafo remite a `docs/roadmap.md` §Deberes tuyos, pero allí no está:**
  `grep -n "ec5c786" docs/*.md` → nada. La entrada de `docs/roadmap.md:522` («El
  histórico de git… decidido y cerrado 2026-08-13») trata de datos sensibles en el
  histórico, no de la firma.
- **Dónde debería vivir:** `docs/conventions.md` (el update no lo toca), en una sección
  nueva `## Commits` con una línea: «Los 12-13 commits anteriores a `ec5c786` llevan el
  trailer `Co-Authored-By: Claude`; se decidió el 2026-08-13 no reescribir el histórico.»
  Y quitarlo de `CLAUDE.md`, que el próximo update lo volverá a borrar.

### P2. Permiso `Bash(npx vitest run*)` y la lista de permisos recortada (ya conocido)

- **Evidencia:** backup `.claude/settings.json:30-38`; commit `6731dd1` («permisos de 18
  a 9: fuera pytest, dotnet, cargo, go, mvn y gradle […] y npm/yarn, que aquí es pnpm»).
- **Qué es de aquí:** `npx vitest run*` (Vitest es de este proyecto) y el recorte de los
  otros stacks. La plantilla es multistack a propósito, así que el recorte no se sube.
  Los tres de git sí: ver G1.
- **Dónde debería vivir:** `.claude/settings.local.json` (no está en ninguna lista de
  `upgrade-harness.sh`, y Claude Code lo suma a `settings.json`). No existe todavía en el
  proyecto (comprobado con `ls .claude/`). Contenido:

  ```json
  { "permissions": { "allow": ["Bash(npx vitest run*)"] } }
  ```

  El recorte de stacks no se puede conservar así (los permisos se suman, no se restan);
  si molesta, habría que pedir a la plantilla que `apply-harness.sh` recorte por stack.

### P3. Ejemplo `.oxlintrc.json` en `leader.md`

- **Evidencia:** backup `.claude/agents/leader.md:174` («si hay `.oxlintrc.json` o
  `.prettierrc`»), commit `37194f5` (cambio de ESLint a oxlint). La plantilla dice
  `.eslintrc` (`leader.md:182`).
- **Es un ejemplo** dentro del paso de montar `docs/conventions.md` en un proyecto nuevo;
  aquí ese paso ya se hizo, y `docs/conventions.md:44-47` ya dice que el linter es oxlint
  con config en `.oxlintrc.json`. **No hace falta guardarlo en ningún sitio.**

### P4. `progress/` organizado por tipo y nombres de archivo en inglés — choca con los agentes

- **Evidencia:** commit `027b8fa` (2026-07-11) y `docs/conventions.md:31-39`: informes del
  implementer en `progress/implementations/`, veredictos en `progress/reviews/`,
  exploraciones en `progress/explorations/`, y **nombres de archivo del harness en
  inglés**. Se usa de verdad: 56 archivos en `implementations/`, 53 en `reviews/`, 50 en
  `summaries/`, 20 en `explorations/`.
- **El choque, anterior a hoy:** los agentes de HEAD **y** de la plantilla dicen otra
  cosa: `progress/<feature>.md` con informe y veredicto en el mismo archivo (plantilla
  `implementer.md:64`, `reviewer.md:25`, `leader.md:223`) y `progress/explore_<tema>.md`
  (`leader.md:220`). Esa parte del commit `027b8fa` se perdió en `11aedb0` («refactor
  files harnes», 2026-08-12), y desde entonces la convención solo sobrevive en
  `docs/conventions.md`.
- **Con el update de hoy se suma otro choque de nombres:** la plantilla trae
  `docs/resumen-template.md`, `docs/lecciones.md`, `docs/vocabulario.md`, y el
  `summary-template.md` del proyecto aparece borrado en `git status`
  (`D docs/summary-template.md`). `reviewer.md:117`, `CHECKPOINTS.md:104` y
  `docs/specs.md:68` ya apuntan a `resumen-template.md`.
- **No es global:** la plantilla eligió a propósito un solo archivo por feature.
- **Qué hay que decidir (el humano):** o se mantiene la convención del proyecto, y
  entonces hace falta una entrada en `docs/lecciones.md` dirigida a `todos` («los informes
  van a `progress/implementations/<feature>.md` y los veredictos a
  `progress/reviews/<feature>.md`; las exploraciones a `progress/explorations/`; manda
  `docs/conventions.md:31-39` sobre lo que digan los agentes»), porque el update seguirá
  pisando los agentes; o se adopta la de la plantilla para las features nuevas y se
  corrige `docs/conventions.md`. Y en cualquier caso, `docs/conventions.md:31` («nombres
  de archivos SIEMPRE en inglés, incluidos los artefactos del harness») ya no se cumple
  con los archivos que trae la plantilla: hay que corregir esa línea o aceptar la
  excepción.

### P5. Fecha en `docs/specs.md` sobre las carpetas numeradas

- **Evidencia:** backup `docs/specs.md:44-45` («Decidido por el humano el 2026-09-02»).
  La plantilla tiene la misma regla sin la fecha.
- **No hace falta guardarlo:** el porqué y la fecha están en el mensaje de `12755bd`.

---

## YA EN PLANTILLA

| # | Mejora del proyecto | Commit | Dónde está en la plantilla |
|---|---|---|---|
| Y1 | Carpetas de spec `specs/<nn>-<name>/` | `12755bd` | `docs/specs.md:34`, `init.sh` paso 3 |
| Y2 | Lectura UTF-8 explícita de `feature_list.json` en `init.sh` | `2b49f53` | `init.sh:74`, `:298`, `PYTHONIOENCODING=utf-8` en `:293` |
| Y3 | Resúmenes en `progress/summaries/` | `37194f5` | `reviewer.md:92`, `:117` |
| Y4 | Enlaces clicables `archivo:línea` en los resúmenes | `1761f0b` | `docs/resumen-template.md`, evolucionado: solo en los 3-6 puntos de entrada; el resto, archivo + símbolo |
| Y5 | El subagente se llama `spec-author` (guion medio) | `c5aff1a`, `35d4fa0` | nombre en todos los archivos; `upgrade-harness.sh:195-198` retira `spec_author.md` |
| Y6 | Nada de `Co-Authored-By` en commits, y los antiguos se quedan | `c2a5153` | `CLAUDE.md:23-33` |
| Y7 | No se nombra nada sin aprobación; `docs/vocabulario.md` | `7af01af` | `CLAUDE.md:48-80`, `upgrade-harness.sh:67-70` |
| Y8 | Leer `docs/roadmap.md` al empezar y actualizarlo al cerrar | `2b49f53` | `CLAUDE.md:169`, `AGENTS.md` |
| Y9 | `decisions.md` de una página, máx. 6 puntos 🔴, ~15 requirements | `2b49f53` | `CHECKPOINTS.md:68-71`, `docs/specs.md:72`, `spec-author.md:30-32` |
| Y10 | Corregir el documento de producto si cambia una decisión (antes `../docs/ideas.md`) | quitado en `11aedb0` | `AGENTS.md:112`, redactado sin ruta fija |
| Y11 | Hook `verify-changed.sh` y comando `/estado` | `11aedb0` | idénticos a la plantilla (diff 0, ignorando `\r`) |

---

## Observación fuera del encargo (no es mejora del proyecto)

- La plantilla no tiene permiso para `./init.sh --checks` en `.claude/settings.json`
  (`grep -n "init.sh" .claude/settings.json` → solo `./init.sh`, `--fast`, `--state`),
  aunque el implementer y el reviewer tienen que ejecutarlo. Pedirá confirmación cada vez.

## Recuento

- GLOBAL: 4 (G1-G4)
- GLOBAL CON AJUSTE: 3 (A1-A3)
- PROYECTO: 5 (P1-P5)
- YA EN PLANTILLA: 11 (Y1-Y11)
