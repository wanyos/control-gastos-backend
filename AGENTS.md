# AGENTS.md — Mapa de navegación para agentes de IA

> Este archivo es el **punto de entrada** para cualquier agente que trabaje
> en este repositorio. NO es una biblia de reglas: es un **mapa**. Lee solo
> lo que necesites cuando lo necesites (divulgación progresiva).

---

## 1. Antes de empezar (obligatorio)

1. Ejecuta `./init.sh` y verifica que termina sin errores. Si falla, **para**
   y resuelve el entorno antes de tocar código.
2. Lee `progress/current.md` para entender en qué estado quedó la última sesión.
3. Lee `docs/roadmap.md` para situar esa sesión en el recorrido completo: qué
   etapa está en curso, qué cabos sueltos hay abiertos y qué resuelve tu tarea.
4. Lee `feature_list.json` y elige **una** tarea. Si tiene `"sdd": true`
   pasa por **Spec Driven Development** (ver `docs/specs.md` y §4 de este
   archivo). Si no, sigue el flujo simple.
5. Lee `docs/specs.md` antes de tocar cualquier spec o feature `sdd: true`.

## 2. Mapa del repositorio

| Archivo / carpeta             | Qué contiene                                                                                              | Cuándo leerlo |
|-------------------------------|-----------------------------------------------------------------------------------------------------------|---------------|
| `feature_list.json`           | Lista de tareas con estado (`pending` / `spec_ready` / `in_progress` / `done` / `blocked`)                | Siempre, al empezar |
| `progress/current.md`         | Estado de la sesión actual                                                                                | Siempre, al empezar |
| `docs/roadmap.md`             | El recorrido completo en etapas: dónde está el proyecto, qué falta y qué cabo suelto resuelve cada etapa   | Siempre, al empezar y al cerrar |
| `progress/history.md`         | Índice de una línea por feature cerrada, con enlace a su resumen                                          | Si necesitas contexto histórico |
| `progress/<feature>.md`       | Informe del implementer + veredicto del reviewer, en un solo archivo                                      | Al revisar o retomar una feature |
| `progress/summaries/<feature>.md`| **DEL HUMANO.** Qué hace la app que antes no y dónde vive cada pieza del código                          | Al cerrar una feature, y para no perder el hilo después |
| `specs/<feature>/decisions.md`| **DEL HUMANO.** Una página: las decisiones y nada más. Es lo único que se le pide leer en la puerta       | Al aprobar un spec (humano); nunca se le manda a leer otra cosa |
| `specs/<feature>/`            | `requirements.md` + `design.md` + `tasks.md` (Kiro-style) — material del `implementer` y del `reviewer`   | Antes de implementar cualquier feature con `"sdd": true` |
| `docs/stack.md`               | Lenguaje, framework, librerías, versiones                                                                 | Antes de tocar dependencias |
| `docs/architecture.md`        | Qué significa "hacer un buen trabajo" en este proyecto                                                    | Antes de implementar |
| `docs/conventions.md`         | Reglas de estilo, nombres, estructura                                                                     | Antes de escribir código |
| `docs/specs.md`               | Proceso SDD: EARS notation, los 4 archivos, las 4 reglas de revisabilidad, puerta de aprobación humana    | Antes de redactar o leer un spec |
| `docs/decisions-template.md`  | Plantilla y reglas de la hoja de decisiones (formato fijo, máx. 6 puntos 🔴)                              | Antes de escribir un `decisions.md` |
| `docs/verification.md`        | Cómo verificar que tu trabajo funciona (incluye trazabilidad requirements para SDD)                       | Antes de declarar una tarea como `done` |
| `docs/related-projects.md`    | Proyectos hermanos (frontend↔backend, etc.)                                                               | Si tu cambio afecta a otro proyecto |
| `CHECKPOINTS.md`              | Criterios objetivos de "estado final correcto"                                                            | Para auto-evaluarte |
| `.claude/agents/`             | Definiciones de subagentes (`leader`, `spec-author`, `implementer`, `reviewer`)                           | Si orquestas trabajo |
| `init.sh`                     | Verificación e inicialización del entorno                                                                 | Al empezar y antes de cerrar |

## 3. Reglas duras (no negociables)

- **Una sola feature a la vez.** No mezcles cambios de varias tareas en la misma sesión.
- **No declares una tarea `done` sin pruebas verdes.** Ejecuta `./init.sh` y
  asegúrate de que el bloque de tests pasa al 100%.
- **No saltes la fase de spec.** Toda feature con `"sdd": true` debe pasar
  por `spec-author` y obtener aprobación humana antes de tocar código.
- **No saltes la puerta de aprobación humana.** El leader detiene el flujo
  en `spec_ready` y espera.
- **En la puerta se enlaza `decisions.md` y nada más.** Un spec sin su hoja no
  es entregable, y un spec de más de ~15 requirements es señal de que la feature
  hay que partirla (ver `docs/specs.md §Las cuatro reglas de revisabilidad`).
- **Documenta lo que haces** en `progress/current.md` mientras trabajas, no al final.
- **Deja el repositorio limpio** antes de cerrar la sesión (ver §6).
- **Si no sabes algo, busca en `docs/`** antes de inventarlo.
- **Cambios fuera de scope:** anótalos como sugerencia en tu informe, NO los apliques.

## 4. Flujo de trabajo

### 4a. Flujo SDD (features con `"sdd": true`)

```
pending → [spec-author] → spec_ready → ⏸ HUMANO → in_progress → [implementer → reviewer] → done
```

1. El leader detecta la primera feature `pending` con `"sdd": true`.
2. El leader lanza `spec-author`, que crea
   `specs/<name>/{decisions,requirements,design,tasks}.md` y marca el status
   como `spec_ready`.
3. **Pausa.** El humano lee **solo `specs/<name>/decisions.md`** — una página —
   y aprueba (o pide cambios). Los otros tres archivos son material del
   implementer y del reviewer: **nunca se le manda a leerlos**; si necesita más
   detalle de una decisión, se lo resume el leader. Si pide cambios, recibe un
   **changelog de cinco líneas**, no el documento reescrito.
4. Una vez aprobado, el leader cambia el status a `in_progress` y lanza
   **un `implementer` por lote** de `tasks.md` (en paralelo los lotes cuyos
   `Archivos:` no se solapan; en secuencia los encadenados por `Depende de:`).
5. Cada implementer ejecuta sus tasks, marcándolas `[x]`, y escribe en
   `progress/<feature>.md`.
6. El reviewer verifica trazabilidad `R<n>` ↔ test y tasks completas, y añade su
   veredicto **al mismo archivo**. Escribe solo lo que falla.
7. Si aprueba, escribe `progress/summaries/<feature>.md`; el implementer marca
   `done` y añade **una línea** a `progress/history.md`.

### 4b. Flujo simple (features sin `"sdd": true`)

```
1. Abre feature_list.json
2. Filtra por status == "pending"
3. Coge la de menor "id"
4. Cambia su status a "in_progress" y guarda
5. Anota en progress/current.md: feature, hora de inicio, plan breve
6. implementer → reviewer → done
```

## 5. Cierre de sesión (lifecycle)

Antes de terminar:

1. Ejecuta `./init.sh` — todo verde.
2. Si la tarea está acabada: marca `status: "done"` en `feature_list.json`.
3. **Actualiza `docs/roadmap.md`**, en el mismo paso en que vacías
   `current.md`: cambia el estado de la etapa tocada y tacha el cabo suelto que
   la feature haya resuelto. Normalmente son **dos líneas**; si necesitas más,
   el detalle va en el `intent` de la feature, no en el mapa. Si la feature
   cambió una decisión de producto, corrige también el documento de producto
   (donde viva): un mapa que contradice al código es peor que no tener mapa.
4. Añade **una línea** a `progress/history.md` apuntando al
   `progress/summaries/<feature>.md`. No copies el informe: el detalle ya está en
   el resumen.
5. Vacía `progress/current.md` dejando solo la plantilla.
6. No dejes archivos temporales, ni logs de debug, ni TODOs sin contexto.

> Para ver dónde estás en cualquier momento, usa **`/estado`**: deriva la vista
> de `feature_list.json`, `roadmap.md` y los bloques 📌 de las hojas de
> decisiones. No hay que mantenerlo, siempre está fresco.

## 6. Si te bloqueas

- Relee la sección relevante de `docs/`.
- Si la herramienta no hace lo que esperas, **no inventes un workaround**:
  documenta el bloqueo en `progress/current.md`, marca la feature como
  `blocked` en `feature_list.json` y para la sesión.
