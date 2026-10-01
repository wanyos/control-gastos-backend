---
description: Repasa las lecciones y los fallos de las últimas features. Separa lo que es de este proyecto de lo que conviene subir a harness-template, con el cambio exacto propuesto. No aplica nada sin tu aprobación.
model: opus
---

Haces un repaso de lo que ha fallado en este proyecto para que no vuelva a
pasar. **Propones; el humano decide.** No editas nada hasta que apruebe cada
punto.

## Qué leer

1. `docs/lessons.md` — las lecciones aprobadas, con su alcance y estado.
2. `VERSION` — la versión del harness instalada en este proyecto.
3. `progress/history.md` — las features cerradas. Si el humano no dice otra cosa,
   el repaso cubre las cerradas desde el último repaso (la fecha está en el
   último `progress/explorations/lessons-<fecha>.md`, si existe) o, si no hay ninguno, las
   10 últimas.
4. De cada una de esas features:
   - `progress/reviews/<feature>.md` — cada `CHANGES_REQUESTED` del reviewer es un fallo
     del implementer que llegó hasta la revisión.
   - `specs/<nn>-<feature>/decisions.md`, bloque `🔄 Cambios desde tu última lectura`
     — lo que el humano corrigió en la puerta del spec.
5. Los archivos del harness que nombran las lecciones (`.claude/agents/*.md`,
   `CLAUDE.md`, `docs/specs.md`…), para proponer el cambio sobre el texto real y
   no de memoria.

## Qué buscar

- **Repeticiones:** el mismo fallo en dos o más features, aunque sea con
  palabras distintas. Es lo más valioso que puede salir de aquí.
- **Lecciones que no se cumplen:** una lección `activa` y, después de su fecha,
  un `CHANGES_REQUESTED` por lo mismo. La redacción no funciona: propón otra más
  concreta, o moverla a un sitio con más fuerza (una regla del agente, o una
  comprobación ejecutable en vez de una instrucción).
- **Lecciones que sobran:** duplicadas o contradictorias. Y las de alcance
  `harness` cuyo cambio ya está en los archivos del harness instalado: propón
  pasarlas a `en plantilla v<versión de VERSION>`.
- **Fallos del harness, no del proyecto:** si el fallo pasaría igual en otro
  proyecto (un agente que se salta un paso, una plantilla que invita al error),
  es candidato a subir a `harness-template`.

Todo hallazgo lleva **su evidencia**: qué feature, qué archivo y qué línea del
veredicto o del changelog. Sin evidencia no se propone.

## Qué escribir

Un solo archivo, `progress/explorations/lessons-<YYYY-MM-DD>.md`, con este formato:

```markdown
# Repaso de lecciones — <fecha>

Cubre: F<id>…F<id> (<n> features) · Harness v<versión>

## 1. Para este proyecto

| # | Propuesta | Evidencia |
|---|---|---|
| P1 | Añadir: <entrada nueva, ya redactada en el formato de docs/lessons.md> | F12 review §1, F14 review §2 |
| P2 | Juntar #3 y #7 en: <texto> | … |
| P3 | Retirar #5: <por qué> | … |

## 2. Para harness-template

Cada una con el cambio exacto, para aplicarlo en la plantilla sin reinterpretar:

### H1 — <titular en una línea>
- **Archivo de la plantilla:** `.claude/agents/implementer.md`, sección `<nombre>`
- **Cambio:** añadir / sustituir por:
  > <texto exacto>
- **Por qué:** <el fallo, en una línea>
- **Evidencia:** lección #<n> de este proyecto; F<id> review §<n>

## 3. Sin cambios

<Qué se miró y no dio nada. Una o dos líneas. Sin esto no se distingue «está bien»
de «no se miró».>
```

## Cómo cerrar

1. En el chat, di **solo**: cuántas propuestas hay de cada tipo y la ruta del
   archivo. Luego recorre las propuestas **una a una**, en una línea cada una, y
   pregunta: sí, no o cambiar.
2. Aplica en `docs/lessons.md` **solo** las propuestas del bloque 1 que el
   humano apruebe.
3. Las del bloque 2 que apruebe: las lecciones de las que salen se quedan
   `activa` en `docs/lessons.md` hasta que la plantilla las incorpore. **No
   edites la plantilla desde aquí**: vive en otro repositorio. Dile al humano:
   > «Para llevarlas a la plantilla: abre una sesión en `harness-template` y pide
   > "aplica las propuestas H<n> de `<ruta absoluta de este archivo>`". Luego
   > `upgrade-harness.sh` en cada proyecto.»
4. Marca en el propio `progress/explorations/lessons-<fecha>.md` qué se aprobó y qué no, para
   que el siguiente repaso no vuelva a proponer lo rechazado.

## Reglas

- ❌ No inventes fallos para que el repaso «dé algo». Si no hay nada, el archivo
  dice «sin propuestas» y el bloque 3 dice qué se miró.
- ❌ No propongas reglas genéricas («ser más cuidadoso», «revisar mejor»). Una
  lección que no dice qué archivo, comando o paso cambia, no cambia nada.
- ❌ No toques código, specs ni `feature_list.json`.
- ✅ Prefiere quitar a añadir: si una lección nueva sustituye a dos viejas, dilo.
  Un archivo de lecciones que solo crece acaba sin leerse.
