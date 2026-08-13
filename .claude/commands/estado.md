---
description: Dónde está el proyecto ahora mismo, en 15 líneas. Deriva el estado de los archivos, no de un documento que haya que mantener a mano.
---

Responde **«¿por dónde voy?»** en pantalla, sin escribir ningún archivo.

## Qué leer

1. `feature_list.json` — estados de todas las features.
2. `docs/roadmap.md` — etapas, cabos sueltos y deberes del humano.
3. `progress/current.md` — la sesión en curso, si la hay.
4. Los bloques `📌 Consecuencias que te tocan a ti` de todos los
   `specs/*/decisions.md` — son deberes manuales que se pierden entre features.
5. `progress/history.md` — para las dos últimas features cerradas.

Ejecuta `./init.sh --state` para confirmar que el estado es coherente.

## Qué imprimir

Exactamente este formato. **Máximo 20 líneas.** Si no cabe, recorta lo de menos
consecuencia, nunca los deberes pendientes.

```
📍 <Qué sabe hacer el proyecto y qué todavía no. Una o dos frases,
   de docs/roadmap.md §Dónde estás ahora mismo.>

ETAPA        <E<n> — título> · <✅|🟡|⏸|⬜|⚠️>
EN CURSO     <F<id> <name> — <status>>  |  nada
SIGUIENTE    <F<id> <name>>  (<con spec | sin spec>)

QUE TE TOCA A TI (no es código)
  · <deber pendiente>            ← de los bloques 📌 y del roadmap

CABOS SUELTOS SIN DUEÑO
  · <cabo>                       ← los que no tienen etapa que los resuelva

ÚLTIMO CIERRE  <F<id> <name>> → progress/summaries/<name>.md
```

## Reglas

- **No escribes nada.** Ni `progress/`, ni `roadmap.md`, ni `feature_list.json`.
  Es una vista, no un documento — por eso siempre está fresca y no hay un sexto
  archivo de estado que mantener.
- Si algo no se puede derivar (roadmap sin rellenar, sin features cerradas),
  escribe `—` en esa línea. No inventes ni rellenes con suposiciones.
- Si `./init.sh --state` falla, dilo **arriba del todo**: el estado es
  incoherente y eso manda sobre cualquier otra cosa que digas.
- Si hay una feature en `spec_ready`, la línea `EN CURSO` termina en
  **«⏸ esperando que apruebes `specs/<name>/decisions.md`»**. Es lo que más fácil
  se queda olvidado.
- Sin adornos ni resúmenes de más. El valor está en que se lee en diez segundos.
