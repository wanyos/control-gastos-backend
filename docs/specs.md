# Spec Driven Development (SDD)

> Este harness soporta un flujo Kiro-style opt-in: requirements → design →
> tasks → code. El código no se escribe hasta que el spec está aprobado por
> un humano.
>
> SDD se activa **por feature** marcando `"sdd": true` en `feature_list.json`.
> Las features sin esa marca siguen el flujo simple (acceptance → implementer
> → reviewer → done).

## Cuándo usar SDD

- ✅ Features con varios criterios de aceptación interdependientes.
- ✅ Cambios que afectan a varios módulos o capas.
- ✅ Comportamiento con muchos casos de error.
- ✅ Algo donde te jugarías que el agente entienda mal el `acceptance` al
  vuelo si nadie lo desambigua antes.
- ❌ Features triviales (cambiar un literal, ajustar un valor por defecto).
- ❌ Bug fixes con un único síntoma y solución obvia.

## Estructura

Cada feature con `"sdd": true` tiene una carpeta dedicada en cuanto deja
`pending`:

```
specs/<feature-name>/
├── requirements.md   # QUÉ se necesita (EARS notation)
├── design.md         # CÓMO se construirá (decisiones técnicas)
└── tasks.md          # PASOS concretos a implementar
```

El `feature-name` coincide con el campo `name` de `feature_list.json`.

## Estados de una feature

| Estado         | Significado                                                    |
|----------------|----------------------------------------------------------------|
| `pending`      | Sin spec. El `spec-author` es el primero en actuar (si `sdd: true`); si no, el `implementer` lo toma directamente. |
| `spec_ready`   | Spec drafted (solo SDD). Esperando aprobación humana. NO se toca código. |
| `in_progress`  | Aprobado (o tomado por el implementer si no es SDD). Trabajando. |
| `done`         | Código verde, `reviewer` aprobó, sesión cerrada.               |
| `blocked`      | Atascado. Razón en `progress/current.md`.                      |

## El QUÉ lo escribe el humano (antes del spec)

Toda feature parte de un bloque `intent` que escribe el humano en
`feature_list.json` (ver `docs/intent-template.md`). Ese `intent` es la
**fuente de verdad del QUÉ y del POR QUÉ**. El `acceptance` técnico y los
`requirements` del spec son *derivaciones* de la intención, nunca la
sustituyen. El agente no inventa el QUÉ.

```
intent (humano) → acceptance (derivado) → requirements/design/tasks (spec) → código
```

## La puerta de aprobación humana

El flujo automático se detiene **una vez**: cuando el `spec-author` termina
sus tres archivos, marca la feature como `spec_ready` y para. El humano
lee `specs/<feature>/` y dice "aprobado" (o pide cambios).

Para que ese "aprobado" sea una revisión real y no un checkbox vacío, el
`requirements.md` DEBE incluir una **sección de procedencia** (ver más abajo).
En la puerta, el humano revisa dos cosas:

1. **Trazabilidad:** ¿cada requirement sale de algo que yo pedí en el `intent`?
2. **Procedencia:** ¿qué se marcó como `(añadido)` o `(delegado)`? Eso es lo
   que el agente decidió por su cuenta; lo miro con lupa y lo apruebo o lo
   cambio. Aquí es donde los huecos que yo no contemplé salen a la luz
   *antes* de escribirse el código, en vez de descubrirlos después.

Solo entonces el `leader` transiciona `spec_ready → in_progress` y lanza
el `implementer`.

```
pending → [spec-author] → spec_ready → ⏸ HUMANO → in_progress → [implementer → reviewer] → done
```

## Sección de procedencia (obligatoria en requirements.md)

Al final de `requirements.md`, el `spec-author` clasifica cada `R<n>`:

```markdown
## Procedencia

- R1 — (humano) Sale de "cuando un usuario de una sola empresa entra directo".
- R2 — (humano) Sale de "si vale para varias, muestra selector".
- R3 — (delegado) El humano cedió "cómo avisa el backend"; decido leer el
  flag `companies[]` del contrato BE-14. Alternativa descartada: endpoint
  aparte (más redondera de red).
- R4 — (añadido) El humano no dijo qué pasa si cierra el selector sin elegir.
  Propongo: se queda en login sin sesión iniciada. ← REVISAR EN APROBACIÓN.
```

- `(humano)` — trazable a una frase del `intent`.
- `(delegado)` — resuelve algo de `delego_en_agente`; explica la decisión.
- `(añadido)` — alcance que el humano no pidió; es lo primero que revisa el
  humano en la puerta. Márcalo de forma visible.

## requirements.md — EARS estricto

Las requirements se redactan en **EARS** (Easy Approach to Requirements
Syntax). Cada requirement es un párrafo numerado con uno de estos cinco
patrones:

| Patrón         | Plantilla                                                   |
|----------------|-------------------------------------------------------------|
| **Ubicuo**     | `El sistema DEBE <acción>.`                                 |
| **Evento**     | `CUANDO <disparador>, el sistema DEBE <acción>.`            |
| **Estado**     | `MIENTRAS <estado>, el sistema DEBE <acción>.`              |
| **Opcional**   | `DONDE <feature opcional>, el sistema DEBE <acción>.`       |
| **No deseado** | `SI <evento no deseado> ENTONCES el sistema DEBE <acción>.` |

Reglas duras:

- Cada requirement tiene un id estable: `R1`, `R2`, ...
- Cada requirement DEBE ser verificable por al menos un test concreto.
- Cada punto de `como_se_que_esta_bien` del `intent` DEBE estar cubierto por
  al menos un `R<n>`. Y cada `R<n>` DEBE quedar clasificado en la sección de
  procedencia (`humano` / `delegado` / `añadido`).
- No mezcles varios `DEBE` en un mismo requirement. Si hay más de uno, parte.
- No uses verbos blandos ("podría", "puede", "soporta"). Solo `DEBE` / `NO DEBE`.

Ejemplo (CLI):

```markdown
## R1
CUANDO el usuario ejecuta `app recent`, el sistema DEBE imprimir hasta 5
elementos ordenados por `created_at` descendente.

## R2
SI el flag `--limit` recibe un valor <= 0 ENTONCES el sistema DEBE imprimir
un mensaje de error en stderr y salir con código != 0.
```

Ejemplo (API):

```markdown
## R1
CUANDO un cliente hace `POST /notes` con `{title, body}` válidos, el sistema
DEBE responder con `201` y el cuerpo `{id, created_at}`.

## R2
SI `title` está vacío ENTONCES el sistema DEBE responder con `400` y un
mensaje `title is required`.
```

## design.md — decisiones técnicas

Captura **antes** de tocar código:

- Qué archivos se crean / modifican.
- Qué firmas nuevas aparecen (funciones, clases, endpoints, componentes).
- Qué excepciones / errores se reutilizan o se añaden.
- Qué alternativa se descartó y por qué (mínimo una).

NO es ingeniería desde primeros principios — apóyate en
`docs/architecture.md` y `docs/conventions.md`. El `design.md` documenta los
puntos donde tu feature roza la frontera de esas reglas.

## tasks.md — checklist ejecutable

Pasos discretos en orden, cada uno con checkbox. Cada task referencia al
menos un `R<n>` que cubre.

Ejemplo:

```markdown
- [ ] T1 — Añadir handler `cmdRecent` en `src/cli/commands.ts`. Cubre: R1, R3.
- [ ] T2 — Registrar subcomando `recent` con flag `--limit`. Cubre: R1, R2.
- [ ] T3 — Añadir `test_recent_default_limit` en `tests/cli.test.ts`. Cubre: R1.
- [ ] T4 — Añadir `test_recent_invalid_limit` en `tests/cli.test.ts`. Cubre: R2.
```

El `implementer` marca `[x]` cada task al completarla. El `reviewer`
rechaza si queda alguna `[ ]` sin justificación documentada.

## Trazabilidad (regla dura)

- Cada test nuevo debe poder mapearse a un `R<n>` de su spec.
- Cada `R<n>` debe tener al menos un test concreto.
- El `reviewer` comprueba esta correspondencia explícitamente y rechaza
  si falta.

El `implementer` documenta el mapa en `progress/implementations/<name>.md`:

```markdown
## Trazabilidad
- R1 → `test_recent_default_limit`
- R2 → `test_recent_invalid_limit`
- R3 → `test_recent_custom_limit`
```

## Cuándo NO aplica SDD

Las features sin `"sdd": true` (o sin el campo `sdd`) NO tienen spec. SDD
es opt-in: actívalo solo donde aporte. Una feature `pending` sin la marca
salta directamente al `implementer` cuando el leader la toma.
