# Vocabulario aprobado

> **Qué es este archivo.** La lista de términos que el humano ha aprobado para
> nombrar acciones, mecanismos y conceptos de este proyecto.
>
> **Si una palabra no está aquí, no está aprobada** y no se usa: se describe la
> cosa literalmente (qué archivo, qué hace, cuándo se ejecuta).
>
> La regla que obliga a esto está en [`../CLAUDE.md`](../CLAUDE.md)
> §Vocabulario. Creado el **2026-08-30**, a petición del humano.

## Cómo se añade un término

1. El agente **propone**: la palabra, qué abarca, qué **no** abarca, y por qué
   hace falta un nombre corto en vez de la descripción entera.
2. El humano **aprueba, cambia o rechaza**.
3. Solo si aprueba, el término se apunta aquí con su definición y la fecha.

No se da por aprobado por silencio, ni porque el humano no lo haya corregido, ni
porque ya aparezca escrito en otro documento del repositorio.

## Términos aprobados

_Ninguno todavía._

| Término | Qué significa exactamente | Qué NO abarca | Aprobado el |
|---|---|---|---|

## Propuestos, esperando respuesta

_Ninguno todavía._

## Usados sin aprobar antes de que existiera esta regla

Están en el repositorio y en features ya cerradas. **No se usan más** hasta que
el humano decida; se listan para que él pueda revisarlos cuando quiera.

| Palabra | Con qué se usó | Dónde quedó escrita |
|---|---|---|
| guardián | Se usó para **cuatro cosas distintas**: el test de `src/no-real-data.test.ts`, el de `src/architecture.test.ts`, el código que compara la base de datos antes y después de la suite, y el que compara la carpeta `var/` | `docs/roadmap.md`, varios `progress/summaries/`, `docs/architecture.md` |
| red | El código que compara la carpeta `var/` antes y después de la suite | `docs/conventions.md`, ADR-029 |
| puerta | Dos cosas distintas: el script `init.sh`, y la parada en la que el humano aprueba un spec | `AGENTS.md`, `CLAUDE.md`, `docs/specs.md` |
| protección | Sin significado fijo; se usó como sinónimo de las anteriores | conversación |
| testigo | El cálculo del saldo cuando sirve para comparar en vez de para mandar | `feature_list.json` (F31, F32), `docs/roadmap.md` |
| ancla / anclar | El saldo que se lee una vez del extracto y la fecha a la que corresponde | ⚠️ **En el código**: columnas `balanceAnchor`, `balanceAnchorDate`, `balanceAnchorDaySequence`, funciones `readAnchor` / `resolveAnchorPoint`, migración `20260825183936_balance_anchor`, `docs/api-contract.md`, `docs/data-model.md` y el spec de la F31 |

⚠️ **`ancla` es el caso profundo**: dio nombre a columnas de la base de datos y a
una migración ya aplicada. Cambiarlo no es editar textos, es una migración y un
cambio de contrato de API. No se toca sin que el humano lo decida a propósito.
