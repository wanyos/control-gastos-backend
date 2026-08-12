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
├── decisions.md      # PARA EL HUMANO: una página, las decisiones y nada más
├── requirements.md   # QUÉ se necesita (EARS notation)
├── design.md         # CÓMO se construirá (decisiones técnicas)
└── tasks.md          # PASOS concretos a implementar
```

El `feature-name` coincide con el campo `name` de `feature_list.json`.

## Las cuatro reglas de revisabilidad

> Fijadas el 2026-08-10 tras tres días atascados en dos specs de 3.844 líneas y 95
> requirements. **El diagnóstico:** el spec se escribe para el agente pero se le da a
> revisar al humano, y son dos públicos distintos. EARS, procedencia, trazabilidad y ADR
> son maquinaria para el `implementer` y el `reviewer`; el humano necesita **las
> decisiones**. Antes no existía ningún artefacto para él.

### 1. `decisions.md` es obligatorio y es lo único que se le pide leer al humano

Formato y reglas de estilo en **`docs/decisions-template.md`** (hermana de
`docs/intent-template.md`, la de entrada, y de `docs/summary-template.md`, la de salida:
esta es la de **revisión**).

Una página. Cada decisión, **una línea**. Estructura fija:

- **🔴 Confirma o corrige** — solo lo que tiene consecuencia real para el humano, con la
  alternativa concreta al lado. Si hay más de 6, el spec está mezclando decisiones suyas
  con decisiones técnicas.
- **✅ Ya cerradas por él** — lo que decidió en la conversación, para que no lo re-litigue.
- **⚙️ Técnicas** — decididas, listadas para que las vea, sin pedirle visto bueno.
- **📌 Consecuencias que le tocan a él** — lo que tendrá que hacer a mano, que es fácil de
  perder entre features.

En la puerta de aprobación se le enlaza **`decisions.md`, nunca los otros tres**. Si algo
no le convence, se cambia en los archivos técnicos: él no los abre.

### 2. Tope de tamaño: si no cabe en ~15 requirements, son dos features

El tamaño del spec es un **síntoma**, no una causa: una spec de 67 requirements sale de
una feature que hace tres cosas. El `spec-author` que se pase del tope **para y propone
el corte** en vez de escribir. Vale pasarse con una razón dicha en voz alta; no vale
llegar a 40 sin comentarlo.

### 3. Revisión por diff: nunca «vuelve a leerte el documento»

Cuando el humano corrige algo, el agente devuelve un **changelog de cinco líneas**: qué
cambió, dónde y por qué. Re-emitir el documento entero para que localice la diferencia
es tirarle horas encima y es la causa de que una aclaración pequeña se sienta como
empezar de cero.

### 4. Sin las entradas reales no se escribe el spec

Si una feature depende de un fichero, un formato o un dato externo, **no se escribe hasta
tenerlo delante**. Se pide y se espera. Escribir sobre un formato supuesto costó dos
reescrituras completas en la semana del 2026-08-10; el mismo spec, con las muestras
reales, salió a la primera.

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
