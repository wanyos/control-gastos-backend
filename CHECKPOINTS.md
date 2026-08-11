# CHECKPOINTS — Evaluación del estado final

> En sistemas multi-agente no se evalúa el camino, se evalúa el destino.
> Estos son los checkpoints objetivos que un juez (humano o IA) puede usar
> para decidir si el proyecto está sano.

## C1 — El arnés está completo

- [ ] Existen los archivos base: `AGENTS.md`, `init.sh`, `feature_list.json`,
      `progress/current.md`.
- [ ] Existen los docs: `docs/stack.md`, `docs/architecture.md`,
      `docs/conventions.md`, `docs/verification.md`, `docs/specs.md`.
- [ ] `./init.sh` termina con exit code 0.

## C2 — El estado es coherente

- [ ] Como mucho una feature en `in_progress` en `feature_list.json`.
- [ ] Toda feature `done` tiene tests asociados que pasan.
- [ ] `progress/current.md` está vacío o describe la sesión activa
      (no contiene basura de sesiones anteriores).

## C3 — El código respeta la arquitectura

- [ ] La estructura de carpetas coincide con lo descrito en `docs/architecture.md`.
- [ ] No se han introducido dependencias nuevas sin justificación documentada
      en `progress/current.md` o en `docs/architecture.md`.
- [ ] No hay logs de debug sueltos (`console.log`, `print()`, `dd()`, etc.)
      ni TODOs sin contexto.
- [ ] Las convenciones de `docs/conventions.md` se respetan.

## C4 — La verificación es real

- [ ] Existe al menos un test ejecutable por cada módulo / feature nuevos.
- [ ] Los tests se ejecutan en el entorno descrito en `docs/verification.md`
      y todos pasan.
- [ ] Los tests cubren al menos un camino feliz y un camino de error donde
      aplique.

## C5 — La sesión se cerró bien

- [ ] No hay archivos sin trackear sospechosos (temporales, builds, caches
      fuera del `.gitignore` del proyecto o del `.git/info/exclude`).
- [ ] `progress/history.md` tiene una entrada por la última sesión.
- [ ] La última feature trabajada está reflejada en su estado correcto en
      `feature_list.json`.

## C6 — Coherencia con proyectos hermanos (si aplica)

- [ ] Si el cambio afecta el contrato con otro proyecto (frontend↔backend),
      `docs/related-projects.md` se ha actualizado o se ha anotado
      pendiente en `progress/current.md`.
- [ ] No hay endpoints, modelos o tipos inventados sin referencia clara
      al contrato del otro proyecto.

## C7 — Spec Driven Development (solo si la feature tiene `"sdd": true`)

- [ ] Toda feature con `"sdd": true` en estado `spec_ready`, `in_progress`
      o `done` tiene su carpeta `specs/<name>/` con `requirements.md`,
      `design.md` y `tasks.md`.
- [ ] Además, si está en `spec_ready` o `in_progress`, tiene `decisions.md`
      (la hoja es de revisión: no se exige retroactivamente a features cerradas
      antes de que existiera la regla).
- [ ] `decisions.md` cabe en **una página**, tiene los cuatro bloques del
      formato (🔴 confirma / ✅ ya cerradas / ⚙️ técnicas / 📌 consecuencias) y
      no más de 6 puntos en el bloque 🔴 (`docs/specs.md` §Las cuatro reglas).
- [ ] El spec no pasa de **~15 requirements**; si se pasa, la razón está dicha
      explícitamente en `decisions.md` o la feature debió partirse.
- [ ] `requirements.md` usa EARS estricto (ver `docs/specs.md`).
- [ ] Toda feature `done` con `"sdd": true` tiene todas sus tasks marcadas
      `[x]` en `tasks.md`.
- [ ] Cada `R<n>` de `requirements.md` está cubierto por al menos un test
      concreto.

## C8 — El resumen de cierre existe (solo al aprobar una feature)

- [ ] Toda feature que se cierra como `done` tiene su
      `progress/summaries/<name>.md` escrito en lenguaje humano
      (ver `docs/summary-template.md`).
- [ ] El resumen indica archivo y línea concretos de cada pieza de código.
- [ ] El resumen cierra el círculo con el `intent`: cada punto de
      `como_se_que_esta_bien` aparece marcado como cumplido y con su test.

---

**Cómo usar este archivo:** un agente revisor (`.claude/agents/reviewer.md`)
recorre cada checkbox, marca `[x]` o `[ ]`, y rechaza el cierre de sesión
si quedan boxes vacíos en C1-C5 (C6 solo aplica si hay proyecto hermano;
C7 solo aplica si la feature es SDD; C8 solo aplica al aprobar una feature
para marcarla `done`).
