# Resumen — feature 33 `tests-dont-touch-real-var`

Fecha de cierre: 2026-08-29
Intención original: `feature_list.json` → feature `tests-dont-touch-real-var`, bloque `intent`
Spec: no tiene (`sdd: false`)

## Qué hace ahora la app que antes no

Pasar los tests ya **no toca ni un archivo tuyo de `var/`**. Antes, cada vez que se
pasaba la suite, un test llamaba de verdad a la ruta de Trade Republic sobre la
aplicación real: parseaba tus archivos descargados del banco y **reescribía tu
volcado** `var/parsed/trade-republic/2026/products.json`. Ese test ahora comprueba lo
mismo (que la ruta está registrada en la app de verdad) sin ejecutar nada.

Y para que no vuelva a pasar por descuido de nadie, la suite se vigila a sí misma:
**hace una foto de `var/` antes de empezar y otra al terminar**, y si un solo archivo
cambió de contenido, de tamaño o **solo de fecha**, la pasada termina en rojo diciendo
qué archivo se movió — nunca lo que dice dentro.

De propina, se arregló un fallo serio heredado: **el guardián de tu base de datos (la
feature 27) llevaba desde el día que se escribió sin poder poner la pasada en rojo.**
Detectaba y avisaba, pero `./init.sh` seguía diciendo «todos los tests pasan». Los dos
guardianes usan ahora el mismo mecanismo, que sí tumba la pasada.

## Por dónde se usa (puntos de entrada)

Esto no se «usa»: se ejecuta solo cada vez que pasas los tests.

- `./init.sh` (o `pnpm test`) — la foto de `var/` y la comparación entran y salen
  solas. Si algo se movió, verás un banner `LA SUITE HA TOCADO ALGO TUYO` y el
  entorno queda en `[FAIL]`.
- No hay nada nuevo que arrancar, ni ningún paso nuevo en tu día a día. Cuesta unos
  10 ms dos veces por pasada sobre una suite de ~8 s.

## Dónde está el código (para revisión directa)

### La red que vigila `var/`

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Foto de solo lectura de `var/` (hash, tamaño y fecha de cada archivo) | `snapshotVarDir` | [test-var.ts:58](../../src/lib/test-var.ts#L58) |
| Qué cambió entre las dos fotos, en palabras y sin un byte de tus datos | `describeVarDifferences` | [test-var.ts:80](../../src/lib/test-var.ts#L80) |
| La carpeta `var/` de este repositorio (ausente en una máquina limpia, y eso no es error) | `defaultVarRoot` | [test-var.ts:39](../../src/lib/test-var.ts#L39) |
| La forma de cada archivo en la foto | `VarFileState`, `VarSnapshot` | [test-var.ts:27](../../src/lib/test-var.ts#L27) |

### Cómo se pone la pasada en rojo de verdad (lo que arregló la review)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Escribe el informe al descriptor 2 y fija el código de salida a 1 | `failRun` | [test-guard.ts:40](../../src/lib/test-guard.ts#L40) |
| El destino del informe, sustituible para poder testearlo | `RunFailureSink` | [test-guard.ts:19](../../src/lib/test-guard.ts#L19) |
| Foto de `var/` antes de la suite | `snapshotVarDir()` | [vitest.global-setup.ts:56](../../vitest.global-setup.ts#L56) |
| Los tres avisos (base cambiada, filas dejadas atrás, `var/` tocado) se recogen todos | `problems` | [vitest.global-setup.ts:61](../../vitest.global-setup.ts#L61) |
| Comparación de `var/` al terminar | `describeVarDifferences` | [vitest.global-setup.ts:88](../../vitest.global-setup.ts#L88) |
| La llamada que tumba la pasada (antes era un `throw` que no tumbaba nada) | `failRun(problems)` | [vitest.global-setup.ts:99](../../vitest.global-setup.ts#L99) |

### El test que causaba el problema

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Comprueba que la ruta de Trade Republic está registrada en la app real, sin invocarla | `app.hasRoute(...)` | [trade-republic.routes.test.ts:113](../../src/modules/trade-republic/trade-republic.routes.test.ts#L113) |

### Tests

| Qué cubre | Código |
| --- | --- |
| 10 tests del mecanismo de la foto sobre un `var/` falso: archivo creado, contenido cambiado, reescrito con los mismos bytes, borrado, nada movido, `var/` inexistente, y «no nombra su contenido» | [test-var.test.ts](../../src/lib/test-var.test.ts) |
| `failRun` reporta **todos** los problemas y con la lista vacía no toca nada | [test-guard.test.ts](../../src/lib/test-guard.test.ts) |
| La prueba extremo a extremo: una pasada de vitest entera en proceso hijo, tocado → sale ≠ 0; intacto → sale 0 | [test-guard.e2e.test.ts:115](../../src/lib/test-guard.e2e.test.ts#L115) |

### Documentación

| Qué dice | Dónde |
| --- | --- |
| ADR-029: la foto de `var/`, y por qué un `throw` en el cierre no sirve | [docs/architecture.md](../../docs/architecture.md) §ADR-029 |
| Cómo se escribe a partir de ahora un test que toca archivos | [docs/conventions.md](../../docs/conventions.md) §Tests que tocan `var/` |

## Cumplimiento de la intención

- ✅ «Dos pasadas seguidas dan el mismo resultado» → se cumple. Dos `./init.sh`
  completos seguidos: 954/954 verde y salida 0 las dos veces.
- ✅ «Ningún archivo de `var/` cambia de fecha ni de contenido» → se cumple.
  Comprobado con huella (tamaño, fecha y `md5`) de los 64 archivos antes y después:
  sin una sola diferencia. Verificado en `src/lib/test-var.test.ts` y en la red viva
  de `vitest.global-setup.ts`.
- ✅ «El guardián de datos reales está en verde» → se cumple hoy, gracias a la F34
  que salió precisamente de esta feature. Verificado en `src/no-real-data.test.ts`.
- ✅ «Sigo teniendo la garantía de que la ruta está registrada en la app de verdad» →
  se cumple. Verificado por mutación: quitando su línea de `src/app.ts:96`, el test de
  `trade-republic.routes.test.ts:113` se pone rojo.

## Decisiones que se tomaron por ti

- (delegado nº 1) Además de arreglar el test, **se añadió la red**, porque pediste
  registro y no parche, y porque el agujero no era de un test sino de una clase de
  tests. No te cuesta nada: ni un paso nuevo, ni nada que arrancar.
- (delegado nº 2) Se miraron **uno a uno** los tests de los otros cinco módulos con
  valor por defecto a `var/` (Bankinter, MyInvestor, ingesta, N26, Openbank):
  **ninguno más tenía el agujero**. Trade Republic era el único fuera del patrón.
- (delegado nº 3) **Tu `var/parsed/trade-republic/2026/products.json` no se ha tocado
  ni borrado.** Su contenido es legítimo (es el mismo volcado que tendrías pulsando
  el botón tú); lo que la suite te cambiaba era la fecha. Si quieres borrarlo, decides
  tú.
- (delegado nº 4) Con el test arreglado, el guardián de datos reales **no volvía solo
  a verde**, y se dijo en vez de taparlo: la causa era otra (el nombre de archivo que
  publicamos nosotros parecía un dato tuyo). Eso se convirtió en la F34, ya cerrada.
- (añadido, con permiso expreso del leader) **Se arregló el guardián de la base de
  datos de la F27**, que tenía el mismo fallo desde su primer día. Se tocó **solo su
  forma de avisar**: sus mensajes son los mismos palabra por palabra y
  `src/lib/test-db.ts` no se tocó. Efecto colateral bueno: ahora ves **los tres avisos
  a la vez**; antes el primero tapaba a los otros dos.

## Qué NO se tocó / quedó fuera

- No se tocó nada de la F31, ni el parser de Trade Republic, ni `src/lib/test-db.ts`,
  ni un solo archivo de `var/`.
- La red vigila **escrituras, no lecturas**: un test que lea tus archivos y no los
  modifique no cambia ninguna fecha y esta red no lo ve. De eso sigue encargándose el
  guardián de datos reales (ADR-017).

## Notas para el futuro

- `bankinter.routes.test.ts` es el único banco que **no** comprueba que su ruta esté
  registrada en la app real. No es un agujero de datos, pero si alguien quitara su
  línea de `src/app.ts` ningún test lo diría. Una línea con `hasRoute` lo cierra.
- El valor por defecto que apunta a `var/` podría desaparecer de los seis módulos e
  inyectarse desde `src/app.ts`. Entonces un test no podría caer en `var/` ni
  queriendo. Es un cambio de firma en seis sitios: no cabía aquí.
- `src/lib/test-var.ts` y `src/lib/test-guard.ts` no están listados en el árbol de
  `docs/architecture.md` que vigila `src/architecture.test.ts` (que solo comprueba
  presencia, así que no falla). Añadirlos sería lo coherente.
