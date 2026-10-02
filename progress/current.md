# Sesión actual

> **Este archivo es un cuaderno de trabajo, no un archivo histórico.** Se llena
> mientras se trabaja —en tiempo real, no al final— y se **vacía al cerrar cada
> feature**, dejando solo esta plantilla. Lo que merece quedarse no se queda aquí:
>
> | Qué | Dónde vive de verdad |
> |---|---|
> | El resultado de una feature, en una línea | [`history.md`](history.md) |
> | El detalle de qué se hizo y por qué | `summaries/<feature>.md` |
> | El veredicto del reviewer | `reviews/<feature>.md` |
> | El mapeo criterio→test | `implementations/<feature>.md` |
> | Una pasada real o un diagnóstico | `explorations/<tema>-<fecha>.md` |
> | Un cabo suelto o una decisión pendiente | [`../docs/roadmap.md`](../docs/roadmap.md) |
>
> Si algo de aquí sigue vivo al cerrar, **se mueve** a su sitio; no se copia y no
> se deja «por si acaso». Se vació el **2026-08-21**, el **2026-08-26** y el
> **2026-09-01**. La última vez, el **2026-09-30**, con las F42 a F50 cerradas y
> commiteadas: todo estaba ya en [`history.md`](history.md), `summaries/`,
> `reviews/` e `implementations/`, y el único punto vivo —la prueba real de la
> F47— se movió a `docs/roadmap.md` §Deberes tuyos. El contenido anterior sigue en
> el histórico de git.

## Feature en curso

**Nivel de consumo:** medio _(bajo / medio / alto; en alto, qué fases usan `fable`)_

_Ninguna._ Última cerrada: **F55 `db-backup`** (2026-10-02, commit `91a3cfc`) →
[resumen](summaries/db-backup.md). Antes, el mismo día: F51 (`d8c0a6d`), F52
(`55d574d`), F53 (`24784b7`) y F54 (`44797d6`); el cabo 10 quedó como riesgo
aceptado por el humano, sin código.

**Cabos sueltos tras el 2026-10-02:** cerrados el 6, 14, 16, 21 y 23 (F51 a F55,
última en `8e78654`); el 10 es riesgo aceptado y el 22 queda aparcado hasta que
`exceljs` falle, los dos por decisión del humano; el 20 espera a que decida qué
quiere ver. Queda abierto el 24 (borrar un producto o un valor desde la API).

<!--
Plantilla mientras trabajas — borra este comentario y rellena:

## F<n> `<nombre>` — EN CURSO (<rol>, <fecha>)

**Qué se está haciendo:** una o dos frases.
**Estado:** qué está hecho y qué falta.
**Bloqueos:** qué impide avanzar, si algo lo impide.
**Informe:** `implementations/<feature>.md`.
-->

## Lo que le toca al humano

_Nada de la sesión en curso._ Sus deberes pendientes viven en
[`docs/roadmap.md`](../docs/roadmap.md) §Deberes tuyos pendientes, y los cabos
sueltos en la tabla §Cabos sueltos con dueño del mismo archivo. Aquí solo se
escribe lo que sale de la sesión **en curso**.

## Correcciones del humano

_Cada corrección que el humano hace a un agente durante la feature, en una
línea: qué se hizo, qué agente, qué quería él. El leader la usa al cerrar para
proponer entradas de `docs/lessons.md`. Esta sección no se vacía al cerrar la
sesión, solo al cerrar la feature._
