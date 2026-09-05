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

Los seis se aprobaron el **2026-09-01**, de una vez: ya estaban usados en
el repositorio y el humano decidió que su significado está claro y que se sigue
adelante con ellos. **Pero cada uno se aprueba con UN significado y uno solo**, que
es lo que faltaba: «guardián» llegó a nombrar cuatro cosas distintas y «puerta»
dos, y esa es justamente la confusión que originó la regla. Lo que se queda sin
palabra corta se sigue describiendo entero.

| Término | Qué significa exactamente | Qué NO abarca | Aprobado el |
|---|---|---|---|
| **guardián** | Un **test que vigila una regla del proyecto**, no el comportamiento de una función: falla señalando archivo y línea cuando alguien rompe la regla. Hoy son dos, `src/no-real-data.test.ts` (datos reales del humano) y `src/architecture.test.ts` (reglas de estructura) | El código que compara la base de datos o la carpeta `var/` antes y después de la suite — eso es **la comprobación de `vitest.global-setup.ts`**, y se dice así. Tampoco `./init.sh` | 2026-09-01 |
| **red** | La **comprobación de `vitest.global-setup.ts`**: la foto que se toma antes y después de la pasada de tests para ver si algo de fuera se movió — hoy la base de datos y la carpeta `var/` | Los dos tests de reglas de arriba (esos son **guardianes**) | 2026-09-01 |
| **puerta** | La **parada en la que el humano aprueba un spec**, entre `spec_ready` e `in_progress`. Es el único sitio donde el proyecto se detiene a esperar a una persona | `./init.sh`, que no espera a nadie: mientras no haya término aprobado se dice «`init.sh`» (ver §Propuestos) | 2026-09-01 |
| **testigo** | El saldo calculado **cuando se usa para comparar**, no para mandar: el número que la app pone al lado del que trae el archivo para ver si cuadran (features 31 y 32) | El saldo que se publica en `GET /api/accounts`, que ahí no compara nada: ese es **el saldo** a secas | 2026-09-01 |
| **ancla** / **anclar** | El importe que se lee **una sola vez** del extracto de una cuenta, junto con la fecha del movimiento más reciente de ese archivo, y desde el que se calcula el saldo hacia delante. Vive en las columnas `balanceAnchor`, `balanceAnchorDate` y `balanceAnchorDaySequence` | El saldo de cada línea (`Movement.balanceAfter`) y el saldo de la cuenta hoy (`balance`). Tampoco `initialBalance`, que ya no interviene en una cuenta anclada | 2026-09-01 |
| ~~**protección**~~ | **Rechazada.** Se usaba sin significado fijo, como sinónimo de cualquiera de las anteriores. No se usa: se dice cuál de las de arriba es | — | rechazada el 2026-09-01 |
| **lote igualado** | El grupo dudoso de la detección de traspasos que tiene **el mismo número de salidas que de entradas** del mismo importe y en el que **cualquier salida podría casar con cualquier entrada** (todas las combinaciones cruzan cuentas y caben en la ventana de 3 días). Es lo que la F41 empareja por orden fecha → posición dentro del día → id | Los grupos **desigualados** (distinto número de salidas que de entradas: siguen dudosos) y los **encadenados** (números iguales pero alguna combinación fuera de la ventana: siguen dudosos enteros). Propuesto en `specs/41-transfer-batch-pairing/decisions.md` decisión 4 | 2026-09-05 |

## Propuestos, esperando respuesta

| Término | Qué abarcaría | Qué NO abarcaría | Por qué hace falta |
|---|---|---|---|
| **verificación** | `./init.sh`: los siete pasos que dicen si el repositorio está sano (estado, archivos del arnés, `feature_list.json`, tipos, lint y formato, tests, resumen) | La aprobación humana de un spec, que es **la puerta** | Al cerrar «puerta» sobre la aprobación del spec, `init.sh` se queda sin nombre corto y es de las cosas que más se nombran. Propuesto el 2026-09-01; **hasta que respondas se dice «`init.sh`»**, tal cual |

## Usados sin aprobar antes de que existiera esta regla

_Ya no queda ninguno._ Las siete palabras que estaban en esta lista se resolvieron
el **2026-09-01**: seis subieron a §Términos aprobados con una definición cerrada y
«protección» quedó rechazada. Se listaban aquí desde el 2026-08-30.

⚠️ **Lo que aprobar estas palabras NO significa.** No abre la puerta a inventar más:
la regla de [`../CLAUDE.md`](../CLAUDE.md) §Vocabulario sigue igual de vigente para
la siguiente palabra que a alguien le apetezca usar. Y no legaliza usarlas **con
otro significado** que el de la tabla: si hace falta nombrar algo que no encaja en
ninguna, se describe entero y se propone.
