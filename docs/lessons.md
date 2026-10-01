# Lecciones de este proyecto

> **Qué es este archivo.** Las correcciones que el humano ha hecho a los agentes
> en este proyecto y que ha aprobado apuntar, para que no se repitan.
>
> **Quién lo lee:** todos los agentes, al arrancar. Cada uno cumple como regla
> las entradas `activa` dirigidas a él (columna *Agente*) o a `todos`.
>
> **Quién escribe:** el `leader`, al cerrar una feature, y **solo lo que el
> humano aprueba** (ver `.claude/agents/leader.md §Las correcciones del humano
> se apuntan`). El comando `/lessons` propone limpiezas, pero tampoco escribe
> sin aprobación.
>
> **El update del harness no lo toca nunca:** lo crea si falta y a partir de ahí
> es de este proyecto.

## Formato de una entrada

Una fila por lección, en lenguaje llano:

- **Qué pasó:** el fallo concreto, en una línea.
- **Qué hay que hacer:** la regla que evita que vuelva a pasar, redactada para
  que el agente la pueda cumplir sin contexto (nombra archivos, comandos o
  símbolos concretos si los hay).
- **Alcance:** `proyecto` si solo tiene sentido aquí; `harness` si es un fallo
  del harness que pasaría en cualquier proyecto.
- **Estado:** `activa` · `en plantilla v<versión>` · `retirada`. Solo las
  `activa` obligan a los agentes. Una lección `harness` sigue `activa` aquí hasta
  que la plantilla la incorpora y el proyecto se actualiza a esa versión; entonces
  pasa a `en plantilla v<versión>`, porque ya la cumple el propio agente.

Si el archivo pasa de ~20 entradas activas, deja de leerse con atención: es la
señal para lanzar `/lessons` y consolidar.

## Entradas

| # | Fecha | Feature | Agente | Qué pasó | Qué hay que hacer | Alcance | Estado |
|---|---|---|---|---|---|---|---|
| 1 | 2026-08-15 | prueba Drive real | todos | Ante un JSON de producto o un CSV mal escrito por el humano, se propuso hacer el parser tolerante | Si falla un archivo que escribe él (JSON de producto, líneas `iban;` y `saldo;` del CSV), primero se le propone **corregir el archivo**; el código solo se adapta a lo que exporta el banco. Nunca se tolera en silencio: el archivo mal escrito se rechaza con un mensaje que diga qué campo falla | proyecto | activa |
| 2 | 2026-10-01 | F15, F26, F29, F31 | implementer | `docs/data-model.md` se quedó sin actualizar en cuatro features y el reviewer las rechazó | Si la feature añade una columna, o empieza a escribir una que no tenía escritor, en el mismo cambio se actualizan en `docs/data-model.md` la tabla «Columnas reservadas», el bloque Prisma, el diagrama ER y la tabla de claves naturales, comprobándolo contra `prisma/schema.prisma` | proyecto | activa |
| 3 | 2026-08-19 | F12, F13, F14, F19 | implementer | Cifras reales del humano acabaron en fixtures; en la F19, en un `.xls` que `src/no-real-data.test.ts` no lee | Si un fixture es `.xls` o `.pdf`, el implementer dice en su informe que ha comprobado a mano que no lleva cifras del humano, porque `src/no-real-data.test.ts` no lee esos formatos | proyecto | activa |
