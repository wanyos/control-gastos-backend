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
> se deja «por si acaso». Este archivo se vació el **2026-08-21** tras acumular
> 22 secciones de features ya cerradas, todas duplicadas en `summaries/` y
> `reviews/`; el contenido anterior sigue en el histórico de git. Se volvió a
> vaciar el **2026-08-26**, con las tres features de esa sesión ya cerradas.

## Feature en curso

_Ninguna._ La sesión del **2026-08-30** cerró **F32 `balance-reconciliation`**
— al importar un archivo, la app compara sus propias sumas contra lo que dice el
archivo y escribe los descuadres en el informe de esa importación, con la cuenta,
la fecha, los dos números y la diferencia. Tolerancia cero; no cambia ningún
saldo, no hace fallar ningún archivo y `GET /api/accounts` no cambia
([veredicto](reviews/balance-reconciliation.md) ·
[resumen](summaries/balance-reconciliation.md)).

Con ella se cierra el corte que partió la F31 en dos: la F31 produce el número y
la F32 lo comprueba. **35 de 35 features `done`.**

### Cerrado antes en esta sesión

_Ninguna._ La sesión del **2026-08-30** cerró **F35 `client-errors-are-not-500`**
— un error de quien llama (cuerpo vacío, JSON mal formado, tipo de contenido no
soportado, cuerpo demasiado grande) sale ya con su propio código de estado en vez
de como avería del servidor
([veredicto](reviews/client-errors-are-not-500.md) ·
[resumen](summaries/client-errors-are-not-500.md)).

Salió de la **prueba real de la F31**, no de un plan: una petición mal mandada a
mano devolvió un 500 y mandó a mirar el log del servidor cuando el problema estaba
en la petición. Es la tercera vez que la prueba real destapa una feature.

Lo demás que salió de esa prueba, ya resuelto en la propia sesión: dos ficheros de
banco rotos —supervivientes de una limpieza anterior— borrados de `var/` y
señalados en Drive, con la regla escrita en
[`docs/dar-de-alta-un-banco.md`](../docs/dar-de-alta-un-banco.md); y una falsa
alarma del leader sobre los tests, **desmentida**: la suite corre contra un
PostgreSQL de verdad y sin base de datos no arranca siquiera.

### Estado anterior (sesión 2026-08-25/26)

_Ninguna feature abierta._ La sesión del **2026-08-25/26** cerró **tres**, encadenadas: cada una
destapó la siguiente.

- **F31 `real-account-balance`** — cada cuenta corriente sabe cuánto dinero tiene
  dentro ([veredicto](reviews/real-account-balance.md) ·
  [resumen](summaries/real-account-balance.md)).
- **F33 `tests-dont-touch-real-var`** — la suite dejó de escribir en la carpeta de
  datos reales, con red permanente; de paso arregló el guardián de la F27, que
  avisaba sin poder tumbar una pasada
  ([veredicto](reviews/tests-dont-touch-real-var.md) ·
  [resumen](summaries/tests-dont-touch-real-var.md)).
- **F34 `guardian-knows-our-own-filenames`** — el guardián de datos reales dejó de
  confundir una convención nuestra con un dato del humano, sin aflojarse
  ([veredicto](reviews/guardian-knows-our-own-filenames.md) ·
  [resumen](summaries/guardian-knows-our-own-filenames.md)).

Esta sección se **sustituye** en el siguiente cierre; aquí no se acumula nada.

<!--
Plantilla mientras trabajas — borra este comentario y rellena:

## F<n> `<nombre>` — EN CURSO (<rol>, <fecha>)

**Qué se está haciendo:** una o dos frases.
**Estado:** qué está hecho y qué falta.
**Bloqueos:** qué impide avanzar, si algo lo impide.
**Informe:** `implementations/<feature>.md`.
-->

## Lo que le toca al humano

🔴 **La prueba real de la F31, checkpoint C4 bis.** Es la única casilla que quedó
abierta en su veredicto, y es suya a propósito: la suite en verde dice que el
código hace lo que el spec dice, no que el número sea el que tiene en el banco.

1. Lanzar `POST /api/import/local` una vez. Es lo que ancla sus cuatro cuentas y
   rellena los saldos por línea de Openbank. **No hay que subir nada a Drive.**
2. Comparar cada cuenta contra la web de su banco.
3. Asegurarse de que al menos un extracto de N26 y uno de MyInvestor llevan la
   línea `saldo;`. Basta **una vez por cuenta**, para siempre.

> Las dos veces anteriores que hizo esta prueba, con la suite entera en verde,
> **aparecieron dos features nuevas**. Si aquí sale algo, no es un fallo de la
> F31: es la feature siguiente.

El resto de cabos sueltos vive en la tabla de
[`docs/roadmap.md`](../docs/roadmap.md) §Cabos sueltos, que es donde se miran.
Esta sesión añadió tres (15, 16 y 17).
