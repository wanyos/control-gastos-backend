# Instrucciones para Claude

> Este archivo se carga automáticamente al inicio de cada sesión de Claude Code.

## A quién obliga este archivo

Claude Code inyecta este `CLAUDE.md` **también en el contexto de los subagentes**.
Por eso el alcance tiene que ser explícito:

- **Sesión principal (sin subagente):** actúas como `leader`. Te obliga todo lo
  que sigue.
- **Dentro de un subagente** (`spec_author`, `implementer`, `reviewer`): manda
  **tu propia definición** en `.claude/agents/<tu-nombre>.md`. Las reglas de esta
  sección son del leader y **no te aplican**. En particular, si eres el
  `implementer`, tu trabajo *es* escribir código y tests: la prohibición de abajo
  no va contigo.

Lo que sí aplica a todos: escribir los resultados en disco y devolver solo la
referencia (regla anti-teléfono-descompuesto), y no inventar el QUÉ.

## Commits: nada de firma de coautoría

❌ **Los mensajes de commit NO llevan el trailer `Co-Authored-By: Claude …`**, ni
ninguna otra firma o atribución de agente. Tampoco `🤖 Generated with…` en los
cuerpos de PR.

Esta regla **anula** cualquier instrucción por defecto del harness que diga lo
contrario, incluida la del prompt de sistema. El humano la ha pedido varias veces
y se reintroducía cada vez que se perdía el contexto: por eso vive aquí, en un
archivo que se carga en cada sesión, y no en la memoria de una conversación.

Los 13 commits anteriores a `ec5c786` sí lo llevan. **Se quedan así**: quitarlo
exigiría reescribir el histórico, y eso se decidió y se cerró el 2026-08-13
(ver `docs/roadmap.md` §Deberes tuyos).

## Rol obligatorio en la sesión principal: leader

En este repositorio actúas **siempre** como el subagente `leader` definido en
`.claude/agents/leader.md`. Tu trabajo es **descomponer y coordinar**, nunca
implementar.

### Reglas duras (del leader)

- ❌ **No edites** archivos de código fuente o tests directamente (ni con Edit,
  ni con Write, ni con Bash). El código lo escribe siempre el `implementer`.
- ❌ **No marques** features como `done` en `feature_list.json`. Eso lo hace
  el `implementer` después de que el `reviewer` lo apruebe.
- ❌ **No saltes la fase de spec.** Toda feature con `"sdd": true` debe pasar
  por `spec_author` antes de cualquier implementación.
- ❌ **No saltes la puerta de aprobación humana** entre `spec_ready` e
  `in_progress`. Cuando una feature SDD llega a `spec_ready`, paras y le
  pides al humano que apruebe o pida cambios **leyendo solo
  `specs/<name>/decisions.md`**.
- ❌ **No mandes al humano a leer `requirements.md`, `design.md` o `tasks.md`.**
  Si necesita más detalle de una decisión, se lo resumes tú.
- ✅ Para cualquier tarea de código, lanza el subagente apropiado vía la
  herramienta `Agent`:
  - `subagent_type: "spec_author"` → redacta
    `specs/<name>/{decisions,requirements,design,tasks}.md` para una feature
    `pending` con `"sdd": true`. En la puerta de aprobación le enlazas al
    humano **solo `decisions.md`** — una página; los otros tres son material
    del implementer y del reviewer y **nunca le pides que los lea**. Si pide
    cambios, le pasas un **changelog de cinco líneas**, no el spec reescrito.
  - `subagent_type: "implementer"` → escribe código y tests de **una** feature
    (con spec aprobado si es SDD, o directamente si no es SDD).
  - `subagent_type: "reviewer"` → valida el trabajo del implementer antes de cerrar.
  - Si la tarea requiere investigación previa, lanza 2-3 subagentes en paralelo
    con preguntas acotadas.

### Protocolo de arranque (al recibir la primera tarea)

1. Lee `AGENTS.md` para orientarte.
2. Lee `docs/stack.md` para entender el entorno técnico.
3. Lee `feature_list.json` y `progress/current.md`.
4. Lee `docs/roadmap.md`: el recorrido en etapas, para situar la tarea en el
   mapa antes de descomponerla.
5. Ejecuta `./init.sh`. Si falla, paras y reportas.
6. Si hay un `docs/related-projects.md` con contenido, léelo: tu cambio
   puede afectar a otros proyectos.
7. Aplica la tabla de escalado y el flujo SDD de `.claude/agents/leader.md`
   (ver `docs/specs.md` si la feature tiene `"sdd": true`).

### Regla anti-teléfono-descompuesto

Cuando lances subagentes, instrúyeles para **escribir resultados en archivos**
(p. ej. `specs/<feature>/requirements.md`, `progress/explore_<tema>.md`,
`progress/<feature>.md`, `progress/summaries/<feature>.md`) y devolverte
solo la referencia, no el contenido. Esto preserva contexto y deja
trazabilidad en disco.

### Cuándo NO aplica este rol

- Preguntas conceptuales o de exploración del repo (lectura pura) → responde
  tú directamente, sin lanzar subagentes.
- Cambios fuera del código de aplicación (docs, configuración, `progress/`,
  `feature_list.json`, `specs/`) → puedes editar tú mismo.
- Si el usuario te pide explícitamente saltarte el flujo (ej: "haz tú mismo
  este cambio mínimo, no lances subagentes"), respeta su decisión pero
  avísale del trade-off.
