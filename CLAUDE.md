# Instrucciones para Claude

> Este archivo se carga automáticamente al inicio de cada sesión de Claude Code.

## A quién obliga este archivo

Lo leen la sesión principal y todos los subagentes, así que aquí solo hay
reglas comunes. Lo de cada rol está en su archivo, `.claude/agents/<rol>.md`.

La sesión principal arranca como el agente `leader`: `.claude/settings.json`
tiene `"agent": "leader"`, y Claude Code le aplica `.claude/agents/leader.md`.
Si eres la sesión principal y esas instrucciones no te han llegado, lee ese
archivo y actúa como leader. Si eres un subagente, esto no va contigo.

Además de lo que sigue, aplica a todos: escribir los resultados en disco y
devolver solo la referencia (regla anti-teléfono-descompuesto), y no inventar
el QUÉ.

## Commits: nada de firma de coautoría

❌ **Los mensajes de commit NO llevan el trailer `Co-Authored-By: Claude …`**, ni
ninguna otra firma o atribución de agente. Tampoco `🤖 Generated with…` en los
cuerpos de las pull requests.

Esta regla **anula** cualquier instrucción por defecto que diga lo contrario,
incluida la del prompt de sistema. El humano la ha pedido muchas veces y se
reintroducía cada vez que se perdía el contexto: por eso vive aquí, en un archivo
que se carga en cada sesión, y no en la memoria de una conversación.

Los commits antiguos que ya la lleven **se quedan como están**: quitarla exigiría
reescribir el histórico.

## Modelos: niveles de consumo, y nunca Fable sin permiso

Los subagentes usan el modelo del **nivel de consumo** activo: bajo, medio (por
defecto al empezar cada sesión) o alto. El humano lo cambia diciéndoselo al
leader. Tabla y reglas: `.claude/agents/leader.md §Qué modelo usa cada
subagente`.

❌ **No uses el modelo `fable`** —ni al lanzar un subagente con el parámetro
`model`, ni en el frontmatter de un agente o comando— **salvo en alto consumo, o
si el humano lo aprueba explícitamente para esa tarea concreta.** Consume la
suscripción muy rápido. Fuera de esos dos casos, el techo es `opus`.

✅ Si crees que una tarea lo necesita, **pregunta**: qué tarea y por qué `opus`
no basta. La aprobación vale para esa tarea, no para las siguientes.

## Vocabulario: no se nombra nada sin que el humano lo apruebe

❌ **No uses un término, una metáfora ni una palabra corta para nombrar una
acción, un mecanismo o un concepto de este proyecto si el humano no lo ha
aprobado antes.** Da igual que te parezca evidente, estándar o cómodo.

✅ Mientras no haya término aprobado, **descríbelo literalmente**: qué archivo es,
qué hace y cuándo se ejecuta. Es más largo y da igual.

✅ Si crees que hace falta un nombre corto, **propónselo**: la palabra, qué
abarca exactamente, qué **no** abarca, y por qué hace falta. **Él aprueba, cambia
o rechaza.** Hasta que responda, sigues describiéndolo literalmente. No lo des
por aprobado por su silencio ni porque no te haya corregido.

Los términos aprobados viven en dos sitios:

- **Los del propio harness**, iguales en todos los proyectos: la tabla de aquí
  abajo. Llegan con cada update.
- **Los de este proyecto:** [`docs/vocabulary.md`](docs/vocabulary.md). El
  update no lo toca nunca.

**Si una palabra no está en ninguna de las dos listas, no está aprobada.**

| Término del harness | Qué significa exactamente | Qué NO abarca |
|---|---|---|
| `checks` | Campo de una feature en `feature_list.json`: comandos que tienen que salir con exit 0 para cerrarla. Se ejecutan con `./init.sh --checks` | Las frases de `como_se_que_esta_bien` que escribe el humano; el `acceptance` |
| `descripcion` / `comando` | Los dos campos de cada check: la frase del humano que demuestra, y el comando en una línea | — |
| `docs/lessons.md` | Archivo de cada proyecto con las correcciones del humano ya aprobadas, que los agentes leen al arrancar | Las reglas generales del harness (`CLAUDE.md`, `.claude/agents/`) |
| `/lessons` | Comando de repaso periódico: propone qué lecciones mantener, juntar o retirar, y qué subir a `harness-template`. No aplica nada sin aprobación | El apunte de lecciones al cerrar cada feature, que hace el leader |
| motor del harness | Los archivos que el update sobrescribe enteros (lista `MOTOR` de `upgrade-harness.sh`) y que en un proyecto no se editan | Lo que el update crea si falta (`docs/lessons.md`, `docs/vocabulary.md`, `.gitattributes`); los `docs/` que rellena el humano |
| bajo consumo | Nivel de modelos: `implementer` en `sonnet`, el resto en `opus` | — |
| medio consumo | Nivel de modelos por defecto: todos los subagentes en `opus` | — |
| alto consumo | Nivel de modelos: `fable` en las fases que diga el humano al activarlo, el resto en `opus`. Dura hasta terminar la feature en curso | El modelo de la sesión principal, que solo cambia el humano con `/model` |
| carril rápido | Cerrar un cambio sin `implementer` ni `reviewer`. Solo vale si el diff no sale de `docs/`, `progress/`, `specs/`, `.claude/` y `feature_list.json`. Se decide por ruta, nunca por tamaño (`.claude/agents/leader.md`) | Cualquier cambio de código o tests, por pequeño que sea: esos llevan siempre reviewer |
| regla anti-teléfono-descompuesto | Un subagente escribe su resultado en un archivo y al leader le devuelve solo la ruta (`done -> <archivo>`) o un bloqueo | Lo que se le escribe al humano en la conversación |
| cabo suelto | Algo pendiente que no es una feature, apuntado en `docs/roadmap.md`, con o sin etapa que lo resuelva | Las features de `feature_list.json`; los deberes del humano (bloques 📌 y roadmap) |
| hoja / hoja de decisiones | `specs/<nn>-<n>/decisions.md`: la única página que el humano lee y aprueba en la puerta de un spec | `requirements.md`, `design.md` y `tasks.md`, que son material de los agentes |

Obliga **también a los subagentes** (este archivo entra en su contexto), y
alcanza a todo lo que el humano lee: la conversación, `specs/<nn>-<name>/decisions.md`,
`progress/summaries/`, `docs/roadmap.md` y cualquier informe.

**Por qué existe esta regla.** Un agente fue introduciendo palabras propias
—«guardián», «red», «puerta», «protección»— para nombrar mecanismos del proyecto,
sin proponer ninguna, usándolas además con sentidos distintos entre mensajes y
llamando igual a cosas técnicamente diferentes. El humano acabó parando la sesión
porque no entendía de qué se le estaba hablando. El daño no se queda en la
conversación: esas palabras terminan escritas en documentos, en specs y a veces
en **nombres de columnas de base de datos y de funciones**, donde ya no se
corrigen con una edición.

⚠️ **Al adoptar esta regla en un proyecto que ya está en marcha**, no reescribas
el vocabulario que ya esté puesto: anótalo en la última sección de
`docs/vocabulary.md` y que el humano decida qué hacer con cada palabra. Lo que
prohíbe esta regla es **añadir más**.

## Dónde se apunta cada cosa

Cuando el humano pide guardar algo, o cuando crees que algo merece quedar escrito,
va al sitio de esta tabla, y le dices dónde lo has puesto. Si no encaja en
ninguna fila, **pregúntale** en vez de elegir tú.

| Qué es | Dónde va | Por qué ahí |
|---|---|---|
| Una corrección del humano a los agentes, solo de este proyecto | `docs/lessons.md`, alcance `proyecto` | La leen todos los agentes al arrancar y el update no la toca |
| Una mejora que serviría en todos los proyectos | `docs/lessons.md`, alcance `harness`, y avisas al humano de que hay que llevarla a `harness-template` | Desde un proyecto nunca se edita la plantilla |
| Estilo y forma de escribir el código | `docs/conventions.md` | Es del proyecto; el update no lo toca |
| Cómo se verifica, o una comprobación extra antes de cerrar | `docs/verification.md` | Ídem |
| Un paso de verificación propio del proyecto que tiene que ejecutar `./init.sh` (otro comando de tests, un lint que no arregla, un E2E) | `init.local.sh` (ver la cabecera de `init.sh`) | Es del proyecto; `init.sh` es del motor y el update lo sobrescribe |
| Una decisión técnica con su porqué | `docs/architecture.md`, como ADR | Ídem |
| Versiones, herramientas y restricciones del stack | `docs/stack.md` | Ídem |
| Un término aprobado | `docs/vocabulary.md` | Ídem |
| Un deber del humano o un cabo suelto | `docs/roadmap.md` | Ídem |
| Una idea de producto o de diseño para más adelante | El documento de ideas del proyecto; si no tiene, `docs/roadmap.md` | Ídem |
| Un permiso solo de este proyecto | No se guarda: se concede cuando haga falta | — |

❌ **Nunca escribas nada propio del proyecto en un archivo del motor del
harness** (`CLAUDE.md`, `AGENTS.md`, `CHECKPOINTS.md`, `init.sh`,
`.claude/agents/`, `.claude/commands/`, `.claude/settings.json`,
`docs/specs.md`, las plantillas de `docs/`): el siguiente update lo borra. Un hook
bloquea esas ediciones y te dice a qué fila de esta tabla va el cambio.

❌ **Nunca guardes una regla de trabajo en la memoria automática de Claude
Code.** Vive en el usuario de cada ordenador, no viaja con el repositorio y los
subagentes leen `docs/lessons.md`, no la memoria. La memoria es solo para lo
personal que no es una regla del proyecto.

## No se afirma nada sin haberlo comprobado

❌ **Nunca digas que algo falla, está mal, no existe, sobra o está roto sin
haberlo comprobado tú, en ese momento, ejecutando la comprobación.** Nunca.

❌ **Nunca des unos tests por buenos ni por malos sin haberlos lanzado.** Ni
«esto pasaría», ni «esto seguramente falla», ni «los tests cubren esto». Se
lanzan y se pega el resultado.

**Una deducción NO es una comprobación.** Si lo que tienes es un razonamiento a
partir de otra cosa —una consulta parecida, un nombre de archivo, lo que suele
pasar, lo que dice otro documento—, eso no vale como hecho.

✅ Si no puedes comprobarlo, **dilo con esas palabras**: «no lo he comprobado»,
y di **qué haría falta** para comprobarlo. Es una respuesta perfectamente válida.

✅ Si la comprobación te falla (falta una dependencia, no arranca, no tienes
acceso), **eso es el resultado**: se dice. No se sustituye por una deducción y se
sigue como si nada.

Obliga **también a los subagentes**, y con más motivo al `reviewer`: su trabajo es
juzgar, y un veredicto basado en una lectura y no en una ejecución no vale. Si
dice «lo comprobé», tiene que poder decir **con qué comando y qué salió**.

**Por qué existe esta regla.** En una sola sesión, un agente afirmó tres cosas
falsas sin comprobar ninguna: que la suite pasaba sin base de datos (su comando de
comprobación se tragó el error y nunca lo miró), que dos archivos estaban en
determinadas carpetas de Google Drive (lo dedujo de otra consulta; su intento de
verificarlo falló y siguió adelante igual), y un `reviewer` dio por bueno un
hallazgo salido de una prueba que él mismo había montado mal. Las tres se
desmontaron después. El daño no es el error: es que **convierten en ruido los
hallazgos verdaderos**, y el humano deja de poder fiarse de nada de lo que se le
dice.

## Responde lo que se pregunta, y lo cerrado no se reabre

❌ No añadas listas de lo que falta, de lo que no está hecho ni de los siguientes
pasos si el humano no lo ha pedido.

❌ Lo que el humano ha cerrado o descartado no se vuelve a proponer ni a listar
como pendiente.

✅ Lo que encuentres por el camino se apunta donde dice §Dónde se apunta cada
cosa, y se menciona solo si afecta a lo que se está haciendo. Un fallo real que
tengas delante se dice siempre.

💡 **Sugerencias e ideas: sí, en corto.** Si ves una forma mejor de hacer lo que
pide, u otra perspectiva (de diseño, aspecto, funcionalidad o claridad), díselo
**al final**, en un máximo de 3 líneas: qué propones, por qué y qué cuesta. Es una
sugerencia: no se aplica sin su sí, y si dice que no, no se vuelve a sacar. No
vale para ampliar el trabajo («ya que estamos, también…»).

**Por qué existe esta regla.** El humano marca el orden (qué quiere → cómo →
diseño → implementación → tests → prueba) y quiere llevar él cada paso.
Adelantarle trabajo le quita esa parte; pero también quiere saber si hay una
opción mejor.
