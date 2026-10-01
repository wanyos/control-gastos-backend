# Reglas de trabajo de `docs/` que podrían subir a harness-template — 2026-09-30

> Exploración de solo lectura. Compara los `docs/*.md` de este proyecto con los
> homónimos de `C:\Users\roybe\Escritorio\claude\harness-template\docs\` (copia de
> trabajo actual). Se ignora el contenido del dominio (bancos, parsers, endpoints,
> modelo de datos, Prisma). Rutas relativas a la raíz de cada repo.
>
> **Comprobado:** `diff` de los cinco archivos que llegan con el update
> (`specs.md`, `decisions-template.md`, `intent-template.md`, `lecciones.md`,
> `resumen-template.md`): idénticos a la plantilla. `grep` en la plantilla de cada
> idea antes de clasificarla (resultado en cada hallazgo).
>
> Nota de vocabulario: «guardián» y «red» son términos aprobados **de este
> proyecto** (`docs/vocabulario.md`), no del harness. Los textos propuestos para la
> plantilla no los usan: describen el mecanismo literalmente.

## Resumen

| # | Hallazgo | Clase | Iría en (plantilla) |
|---|---|---|---|
| 1 | Una regla que los agentes tienen que recordar se convierte en un test | GLOBAL | `docs/architecture.md` |
| 2 | Una comprobación que corre al terminar la suite tiene que demostrar que cambia el código de salida | GLOBAL CON AJUSTE | `docs/verification.md` |
| 3 | Los tests no escriben nunca en los datos del humano que no están en git (base de datos, carpetas locales) | GLOBAL CON AJUSTE | `docs/conventions.md` §Tests |
| 4 | Ningún dato real del humano en un archivo versionado, y un test que lo hace cumplir | GLOBAL CON AJUSTE | `docs/conventions.md` §Tests |
| 5 | Los ADR llevan «Lo que NO cubre» y las revisiones como cabecera fechada | GLOBAL | `docs/architecture.md` (ADR-000) |
| 6 | Todo lector de un archivo del repo declara el encoding | GLOBAL | `docs/conventions.md` |
| 7 | Ninguna herramienta de desarrollo bloquea una dependencia del runtime | GLOBAL | `docs/stack.md` §Restricciones |
| 8 | `init.sh` ejecuta lint y comprobación de formato y pone la pasada en rojo | GLOBAL CON AJUSTE | `init.sh` + `docs/verification.md` |
| 9–12 | Ver §PROYECTO | PROYECTO | — |
| 13–16 | Ver §YA EN PLANTILLA | YA EN PLANTILLA | — |

---

## GLOBAL

### 1. Una regla que los agentes tienen que recordar se convierte en un test que falla señalando archivo y línea

**Evidencia**
- `docs/architecture.md:9-13` — los principios de arquitectura los comprueba `src/architecture.test.ts` (no `process.env` fuera de `config/`, rutas sin cliente de base de datos, árbol de módulos presente).
- `docs/architecture.md:1279-1285` (ADR-017, 2026-08-12) — la regla «ningún dato real» ya estaba escrita en `conventions.md` y en el `acceptance` de la F13 y se incumplió en dos features seguidas: «una regla que tres agentes distintos tienen que recordar es una esperanza, no una regla».
- `docs/architecture.md:1306` — descartado un hook de git: no se ejecuta en la máquina del agente ni en `./init.sh`, y se salta con `--no-verify`.
- `docs/architecture.md:2375-2379` (ADR-029) — «la F14 y la F27 ya enseñaron que una regla que depende de que el próximo se acuerde vuelve a fallar».
- `docs/conventions.md:115` — «La regla anterior ya no depende de que alguien se acuerde: la hace cumplir `src/no-real-data.test.ts`».

**En la plantilla:** no está. `grep` de `architecture.test`, «se acuerde», «esperanza» en la plantilla: sin resultados. `docs/architecture.md:31-32` de la plantilla pide que un principio sea «ejecutable» para un revisor, pero no que lo compruebe la suite.

**Texto propuesto** — en `docs/architecture.md` de la plantilla, al final del bloque de §Principios:

> **Un principio que se puede comprobar leyendo el código se comprueba con un
> test.** Si una regla de este archivo o de `docs/conventions.md` se puede decidir
> mirando los archivos del repositorio (qué carpeta importa a cuál, dónde se lee la
> configuración, qué tipo solo puede declararse una vez), se escribe un test de la
> suite que la comprueba y que, al fallar, dice **archivo y línea** del
> incumplimiento. Una regla que los agentes tienen que recordar se incumple en
> cuanto uno no la lee. Un hook de git no sustituye a este test: no se ejecuta en
> `./init.sh` y se salta con `--no-verify`.

### 5. Los ADR dicen lo que NO cubren, y una revisión se añade como cabecera fechada, sin reescribir el ADR

**Evidencia**
- `docs/architecture.md:1257-1275` — ADR-017 lleva tres cabeceras «Revisado el <fecha> por la feature <n> `<name>`: qué cambió», y el texto original sigue debajo.
- `docs/architecture.md:1313` — «Límites conocidos y aceptados, anotados aquí para que nadie confunda verde con seguro».
- `docs/architecture.md:2235` (ADR-027) y `:2385` (ADR-029) — apartado «Lo que NO cubre».
- `docs/conventions.md:129` — la convención remite a esos límites «antes de fiarse del verde».

**En la plantilla:** `docs/architecture.md:84-91` tiene ADR-000 con Fecha / Estado / Contexto / Decisión / Alternativas / Consecuencias. No tiene «lo que no cubre» ni cómo se revisa un ADR. (Sí existe «Qué NO quiero / límites» en `intent-template.md:43`, pero es de la feature, no de la decisión.)

**Texto propuesto** — en `docs/architecture.md` de la plantilla, ADR-000:

> - **Lo que NO cubre:** qué casos quedan fuera a sabiendas, para que nadie tome
>   el verde de los tests por una garantía que la decisión no da.
>
> Cuando una feature posterior cambia la decisión, **no se reescribe el ADR**: se
> añade arriba una línea «**Revisado el YYYY-MM-DD por la feature N `<name>`:**
> qué cambió y por qué», y se corrige el apartado afectado. Si la decisión se
> sustituye entera, el ADR pasa a `Estado: superada por ADR-NNN`.

### 6. Todo script o herramienta que lee un archivo del repositorio declara el encoding

**Evidencia**
- `docs/conventions.md:22-30` — portada del frontend el 2026-08-11 después de que `init.sh` fallara al validar `feature_list.json`: en Windows Python abre con `cp1252` y revienta con la primera tilde. «La causa se ataca en el lector, no evitando caracteres en el contenido.»

**En la plantilla:** a medias. El propio `init.sh` de la plantilla ya lo aplica a sí mismo (`init.sh:296-298`, con el mismo comentario), pero `docs/conventions.md` de la plantilla no lo pide a los scripts del proyecto.

**Texto propuesto** — en `docs/conventions.md` de la plantilla, nuevo apartado antes de §Estilo del lenguaje:

> ## Codificación de los archivos
>
> - Los archivos de texto del repositorio son **UTF-8**, y la prosa en español
>   lleva tildes con normalidad.
> - **Todo script o herramienta que lea un archivo del repositorio declara el
>   encoding**, sin fiarse del del sistema: Python `open(..., encoding="utf-8")`,
>   Node `readFileSync(p, "utf8")`, .NET `File.ReadAllText(p, Encoding.UTF8)`,
>   PowerShell `Get-Content -Encoding utf8`. En Windows el encoding por defecto de
>   varias de esas herramientas no es UTF-8 y rompe con la primera tilde.
> - Si algo falla por un carácter, se arregla el lector, no el contenido.

### 7. Ninguna herramienta de desarrollo bloquea una dependencia del runtime

**Evidencia**
- `docs/stack.md:121-129` — `typescript-eslint` declaraba un peer estricto de TypeScript y mantuvo el compilador congelado en 6.0.3 durante una etapa entera; se cambió de linter (2026-08-13, `docs/conventions.md:44-47`). «Si vuelve a pasar, se cambia la herramienta, no se congela TypeScript.»

**En la plantilla:** no. `docs/stack.md:45-49` de la plantilla solo pregunta «¿hay versiones bloqueadas? ¿por qué?».

**Texto propuesto** — en `docs/stack.md` de la plantilla, §Restricciones:

> - **Ninguna herramienta de desarrollo (linter, formateador, analizador, generador
>   de código) puede impedir actualizar el lenguaje, el runtime o el framework.** Si
>   una lo hace —porque exige una versión máxima del compilador o del SDK—, se
>   cambia o se quita la herramienta; no se congela la dependencia de la que vive la
>   aplicación. Anota aquí cuál fue y por qué se cambió.

---

## GLOBAL CON AJUSTE

### 2. Una comprobación que corre al terminar la suite tiene que demostrar, con un test, que pone el código de salida distinto de 0

**Evidencia**
- `docs/architecture.md:2352-2363` (ADR-029, corregido el 2026-08-26 en la review de la F33) — un `throw` en el *teardown* de `globalSetup` de vitest se reporta como «error during close» y `vitest run` **sale con 0**; `init.sh` decide por el código de salida e imprimía «Todos los tests pasan» con la carpeta del humano modificada.
- `docs/architecture.md:2364-2368` — la comprobación de la base de datos del ADR-027 **tenía el mismo fallo desde el día que se escribió** y nunca pudo tumbar una pasada.
- `docs/conventions.md:139-143` — vitest intercepta la consola: un `console.warn` con el reporter por defecto no se imprime; la primera versión de la F23 acabó en «un verde silencioso».
- `docs/architecture.md:2369-2374` — el arreglo se prueba con `src/lib/test-guard.e2e.test.ts`: monta un proyecto de tests desechable con el código real de la comprobación, lo ejecuta en un proceso hijo y mira el **código de salida en los dos sentidos** (≠ 0 cuando se tocó un archivo aunque todos los tests estén verdes; 0 cuando no).
- `docs/conventions.md:241-247` — regla para quien escriba la siguiente.

**En la plantilla:** no. Lo más cercano es `reviewer.md:47-51` («si un check que filtra tests no muestra ningún test ejecutado, no cuenta como verde»), que es otro caso: un check que no ejecuta nada. Y `CLAUDE.md` §No se afirma nada sin haberlo comprobado, que es la regla general, no esta.

**Por qué con ajuste:** el detalle (teardown de `globalSetup`, consola interceptada) es de vitest. La idea vale para cualquier runner: xUnit/NUnit con un `IAsyncLifetime`/`OneTimeTearDown` o un `AssemblyCleanup` que lanza, un `afterAll` de Jest, un hook de pytest.

**Texto propuesto** — en `docs/verification.md` de la plantilla, §Anti-patrones y un párrafo debajo:

> - ❌ Una comprobación que se ejecuta **antes o después de la suite** (setup o
>   teardown global, limpieza de ensamblado, `afterAll`, hook del runner) y avisa
>   lanzando una excepción o escribiendo en la consola, sin haber comprobado que
>   eso cambia el **código de salida** del comando de tests. Varios runners
>   reportan un fallo en el teardown global como aviso y salen con 0, y algunos se
>   tragan la consola de los tests: `./init.sh` dice verde con la comprobación
>   fallando.
>
> **Si añades una comprobación así, añade también un test que la ejecute de
> verdad:** un proyecto de tests mínimo que use el código real de la
> comprobación, lanzado en un proceso hijo, afirmando el código de salida en los
> dos sentidos (≠ 0 cuando debe fallar, 0 cuando no). El aviso se escribe a stderr
> directamente, no por la consola que el runner intercepta.

### 3. Los tests no escriben nunca en los datos del humano que no tienen copia en git: usan uno desechable, y la suite compara antes y después

**Evidencia**
- `docs/architecture.md:2168-2181` (ADR-027, 2026-08-20) — la suite corría contra la base del humano: una tarde de pasadas le dejó 15 cuentas, 5 movimientos y 140 productos sintéticos; además, 4 de 13 ejecuciones de `./init.sh` fallaban por varios archivos de test escribiendo a la vez en la misma base.
- `docs/architecture.md:2183-2192` — descartado «limpiar mejor»: la limpieza funciona cuando la suite va en verde y falla justo cuando un test se cae a la mitad.
- `docs/architecture.md:2207-2217` — foto de solo lectura de la base del humano antes y después (recuentos **y** secuencias, para cazar el insert+delete) → rojo; nada escribe en una base cuyo nombre no empiece por el prefijo de test.
- `docs/architecture.md:2339-2350` (ADR-029, 2026-08-25) — un test invocaba una ruta sin inyectar directorios, que caían por defecto en `var/` (lo único sin copia en git) y reescribía un archivo del humano en cada pasada; «`var/` no existe en una máquina limpia», así que nadie lo vio.
- `docs/conventions.md:186-250` — cómo se escribe hoy un test con base de datos y uno que toca archivos (inyectar la ruta con un directorio temporal; «un valor por defecto que apunta a `var/` no es una comodidad: es el bug de la F33»).

**En la plantilla:** no. `docs/conventions.md:75` de la plantilla solo pregunta «¿cómo se manejan los recursos? (tempfile, in-memory db, mocks)». `verification.md:70-71` pide recursos reales frente a mocks, sin decir cuáles no se tocan.

**Por qué con ajuste:** el mecanismo concreto (una base por worker de vitest clonada de una plantilla, `var/`) es de este stack. La regla —los tests usan su propio recurso desechable y la suite demuestra que no tocó el del humano— vale igual en .NET (base creada por una fixture de colección o por un contenedor de test, `Path.GetTempPath()` para archivos).

**Texto propuesto** — en `docs/conventions.md` de la plantilla, §Tests:

> - **Un test no escribe nunca en datos del humano que no tengan copia en git**:
>   su base de datos de desarrollo, sus carpetas de trabajo, sus descargas. Rellena
>   aquí cuáles son en este proyecto: TODO.
>   - La base de datos de la suite es **otra**, creada por la propia suite (con un
>     nombre o prefijo reconocible), y el código que escribe comprueba ese prefijo
>     antes de escribir. Limpiar lo que crea cada test no basta: falla justo el día
>     que un test se cae a la mitad.
>   - Todo código que lee o escribe archivos recibe la ruta como parámetro, y el
>     test le pasa un directorio temporal. Un valor por defecto que apunta a la
>     carpeta real del humano es el fallo, no una comodidad.
>   - Si el proyecto tiene algo así, la suite hace una **foto de solo lectura**
>     antes y después (recuentos y secuencias de la base; ruta, tamaño y fecha de
>     cada archivo de la carpeta) y termina con código de salida ≠ 0 si cambió algo,
>     diciendo qué y dónde pero no el contenido. Ver `docs/verification.md` sobre
>     cómo demostrar que esa comprobación de verdad tumba la pasada.

### 4. Ningún dato real del humano en un archivo versionado, y un test de la suite que lo hace cumplir

**Evidencia**
- `docs/conventions.md:105-113` (reforzada el 2026-08-12, F12) — todo en un fixture es inventado, incluidos los datos del propio dueño y los que pegue en la conversación; un fixture solo tiene que estar bien formado.
- `docs/architecture.md:1279-1288` (ADR-017) — dos features seguidas versionaron su IBAN e importes reales; los cazó el reviewer leyendo, la suite nunca; al barrer aparecieron más en `src/`, `docs/`, `specs/` y `progress/`.
- `docs/conventions.md:115-128` — el test cubre **todo archivo versionado** (también `docs/`, `specs/`, `progress/` y archivos nuevos sin commitear, vía `git ls-files --cached --others --exclude-standard`); un falso positivo se exime **en esa línea con su motivo**, nunca desarmando el test entero.
- `docs/conventions.md:177-179` — sus mensajes dicen archivo:línea y tipo de coincidencia, **nunca el valor**.
- `docs/conventions.md:180-184` — la bitácora (`progress/`) también se sanea; el histórico de git no se reescribe (decisión del humano).

**En la plantilla:** no. `grep` de «fixture», «dato real» en la plantilla: sin resultados.

**Por qué con ajuste:** lo que se busca (IBAN con checksum, importes de ≥ 4 cifras, trigramas comparados contra `var/`) es de este dominio. La regla y la forma del test valen en cualquier proyecto que maneje datos personales del humano, en cualquier lenguaje.

**Texto propuesto** — en `docs/conventions.md` de la plantilla, §Tests:

> - **Ningún dato real del humano en un archivo versionado** —fixtures, pero
>   también `docs/`, `specs/` y `progress/`—, tampoco los que él mismo pegue en la
>   conversación. Un fixture solo tiene que estar bien formado, nunca ser cierto.
>   Los datos reales viven fuera de git (carpeta en `.gitignore`).
> - Si el proyecto maneja datos personales o financieros, esta regla la comprueba
>   **un test de la suite**, no la memoria de los agentes: recorre los archivos
>   versionados y los nuevos sin commitear, busca lo que tenga **forma** de dato
>   real (un identificador con dígito de control válido fuera de una lista blanca
>   de valores de ejemplo) y, si la copia local de los datos existe, lo compara con
>   ella; si no existe, se salta **diciéndolo**, no pasa en verde callado.
>   - Sus mensajes dan archivo, línea y tipo de coincidencia, **nunca el valor**.
>   - Un falso positivo se exime **en esa línea**, con el motivo al lado; el test
>     no se desactiva entero.
>   - Lo que el test no puede detectar se escribe en su ADR (ver «Lo que NO
>     cubre»).

### 8. `init.sh` ejecuta el linter y la comprobación de formato, y los pone en rojo

**Evidencia**
- `docs/roadmap.md:428` (cabo 18, cerrado el 2026-09-01) — `./init.sh` no ejecutaba ni el linter ni el format check; se añadió un paso «Lint y formato» que pone la pasada en rojo, «comprobado metiendo un archivo mal formateado a propósito, no deducido», y colocado **después** de la salida del modo `--fast` para no cargar el ciclo corto.
- `init.sh:475-497` de este proyecto — el paso existe (solo Node, y solo si `package.json` declara `lint` / `format:check`).

**En la plantilla:** no. `grep -n 'lint\|format' init.sh` en la plantilla solo devuelve el comentario de la línea 66. Este paso sobrevivió al update porque vive en el `init.sh` de este proyecto, pero la plantilla no lo tiene.

**Por qué con ajuste:** hoy solo cubre Node. Para C#: `dotnet format --verify-no-changes`; para Python: `ruff check` / `ruff format --check`.

**Propuesta:** subir el paso 5 al `init.sh` de la plantilla con una rama por stack detectado (misma condición: solo si el proyecto lo declara; si no, `warn`), y en `docs/verification.md` de la plantilla, tabla «Los tres modos de `init.sh`», añadir en la fila de `./init.sh`: «Todo: estado, tipos, **lint y formato** y la suite».

---

## PROYECTO (se quedan aquí)

9. **Idioma del código y de los nombres de archivo** — `docs/conventions.md:7-39`: todo en inglés, prosa de docs en español, excepciones de infraestructura. Es una preferencia de este proyecto; la plantilla ya deja el hueco.
10. **Un solo gestor de paquetes (`pnpm`)** — `docs/stack.md:51-55`. Es de este stack. (Si se quisiera generalizar, sería «usa solo el gestor del lockfile», de poco valor frente al resto.)
11. **Todo lo de parsers de banco, codificación de origen por banco, líneas de preámbulo etiquetadas** — `docs/conventions.md:281-483`. Dominio.
12. **Términos aprobados de este proyecto** («guardián», «red», «puerta», etc.) — `docs/vocabulario.md:31-40`. Vocabulario propio; el update no lo toca, correcto.

## YA EN PLANTILLA

13. **Regla de vocabulario y «un término, un solo significado»** — la plantilla va por delante: `harness-template/docs/vocabulario.md:24-27` ya tiene la frase que aquí solo aparece como historia (`docs/vocabulario.md:24-29`).
14. **Roadmap: qué es frente a los otros documentos, cabos sueltos con dueño, cómo se mantiene** — `docs/roadmap.md:9-24, 407-409, 577-586` ≈ `harness-template/docs/roadmap.md:19-31, 79-88, 103-115`. Los casos de cabos que «la tabla no se enteró» (`docs/roadmap.md:417, 419`) son justo lo que el punto 2 de la plantilla ya exige.
15. **Contrato con el proyecto hermano actualizado en la misma feature** — `docs/related-projects.md:14-23` ≈ `harness-template/CHECKPOINTS.md` C6.
16. **«El agente no dice “funciona”, lo demuestra», anti-patrones de tests, trazabilidad R→test** — `docs/verification.md:3-4, 105-129` idénticos a `harness-template/docs/verification.md:4-5, 49-73`.

## Sin comprobar

- No he leído enteros `docs/api-contract.md`, `docs/data-model.md`, `docs/dar-de-alta-un-banco.md`, `docs/archivos-por-banco.md` ni los dos `*-product-files.md`: por título y por lo que citan los demás son de dominio. Si se quiere descartar que haya reglas de proceso dentro, habría que leerlos.
- No he ejecutado ninguno de los tests citados; la evidencia es lo que dicen los documentos, con su fecha.
