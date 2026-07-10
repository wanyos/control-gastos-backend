# AGENTS.md — Mapa de navegación para agentes de IA

> Este archivo es el **punto de entrada** para cualquier agente que trabaje
> en este repositorio. NO es una biblia de reglas: es un **mapa**. Lee solo
> lo que necesites cuando lo necesites (divulgación progresiva).

---

## 1. Antes de empezar (obligatorio)

1. Ejecuta `./init.sh` y verifica que termina sin errores. Si falla, **para**
   y resuelve el entorno antes de tocar código.
2. Lee `progress/current.md` para entender en qué estado quedó la última sesión.
3. Lee `feature_list.json` y elige **una** tarea. Si tiene `"sdd": true`
   pasa por **Spec Driven Development** (ver `docs/specs.md` y §4 de este
   archivo). Si no, sigue el flujo simple.
4. Lee `docs/specs.md` antes de tocar cualquier spec o feature `sdd: true`.

## 2. Mapa del repositorio

| Archivo / carpeta             | Qué contiene                                                                                              | Cuándo leerlo |
|-------------------------------|-----------------------------------------------------------------------------------------------------------|---------------|
| `feature_list.json`           | Lista de tareas con estado (`pending` / `spec_ready` / `in_progress` / `done` / `blocked`)                | Siempre, al empezar |
| `progress/current.md`         | Estado de la sesión actual                                                                                | Siempre, al empezar |
| `progress/history.md`         | Bitácora append-only de sesiones anteriores                                                               | Si necesitas contexto histórico |
| `specs/<feature>/`            | `requirements.md` + `design.md` + `tasks.md` (Kiro-style)                                                 | Antes de implementar cualquier feature con `"sdd": true` |
| `docs/stack.md`               | Lenguaje, framework, librerías, versiones                                                                 | Antes de tocar dependencias |
| `docs/architecture.md`        | Qué significa "hacer un buen trabajo" en este proyecto                                                    | Antes de implementar |
| `docs/conventions.md`         | Reglas de estilo, nombres, estructura                                                                     | Antes de escribir código |
| `docs/specs.md`               | Proceso SDD: EARS notation, los 3 archivos, puerta de aprobación humana                                   | Antes de redactar o leer un spec |
| `docs/verification.md`        | Cómo verificar que tu trabajo funciona (incluye trazabilidad requirements para SDD)                       | Antes de declarar una tarea como `done` |
| `docs/related-projects.md`    | Proyectos hermanos (frontend↔backend, etc.)                                                               | Si tu cambio afecta a otro proyecto |
| `CHECKPOINTS.md`              | Criterios objetivos de "estado final correcto"                                                            | Para auto-evaluarte |
| `.claude/agents/`             | Definiciones de subagentes (`leader`, `spec_author`, `implementer`, `reviewer`)                           | Si orquestas trabajo |
| `init.sh`                     | Verificación e inicialización del entorno                                                                 | Al empezar y antes de cerrar |

## 3. Reglas duras (no negociables)

- **Una sola feature a la vez.** No mezcles cambios de varias tareas en la misma sesión.
- **No declares una tarea `done` sin pruebas verdes.** Ejecuta `./init.sh` y
  asegúrate de que el bloque de tests pasa al 100%.
- **No saltes la fase de spec.** Toda feature con `"sdd": true` debe pasar
  por `spec_author` y obtener aprobación humana antes de tocar código.
- **No saltes la puerta de aprobación humana.** El leader detiene el flujo
  en `spec_ready` y espera.
- **Documenta lo que haces** en `progress/current.md` mientras trabajas, no al final.
- **Deja el repositorio limpio** antes de cerrar la sesión (ver §6).
- **Si no sabes algo, busca en `docs/`** antes de inventarlo.
- **Cambios fuera de scope:** anótalos como sugerencia en tu informe, NO los apliques.

## 4. Flujo de trabajo

### 4a. Flujo SDD (features con `"sdd": true`)

```
pending → [spec_author] → spec_ready → ⏸ HUMANO → in_progress → [implementer → reviewer] → done
```

1. El leader detecta la primera feature `pending` con `"sdd": true`.
2. El leader lanza `spec_author`, que crea
   `specs/<name>/{requirements,design,tasks}.md` y marca el status como
   `spec_ready`.
3. **Pausa.** El humano lee el spec en `specs/<name>/` y aprueba (o pide cambios).
4. Una vez aprobado, el leader cambia el status a `in_progress` y lanza `implementer`.
5. El implementer ejecuta `tasks.md` una a una, marcándolas `[x]`.
6. El reviewer verifica trazabilidad `R<n>` ↔ test y tasks completas;
   aprueba o rechaza.
7. Si aprueba, el implementer marca `done` y mueve el resumen a
   `progress/history.md`.

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
3. Mueve el resumen de `progress/current.md` al final de `progress/history.md`.
4. Vacía `progress/current.md` dejando solo la plantilla.
5. No dejes archivos temporales, ni logs de debug, ni TODOs sin contexto.

## 6. Si te bloqueas

- Relee la sección relevante de `docs/`.
- Si la herramienta no hace lo que esperas, **no inventes un workaround**:
  documenta el bloqueo en `progress/current.md`, marca la feature como
  `blocked` en `feature_list.json` y para la sesión.
