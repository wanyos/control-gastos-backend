# Resumen — feature 22 `encoding-mismatch-guard`

Fecha de cierre: 2026-08-19
Intención original: `feature_list.json` → feature `encoding-mismatch-guard`, bloque `intent`
Spec: no tiene (`sdd: false`; se trabajó del `intent` y de sus 10 criterios de `acceptance`)

## Qué hace ahora la app que antes no

**Cuando subes un extracto de Openbank que has abierto con el editor y has vuelto a
guardar, el backend te dice que el problema es el guardado y qué tienes que hacer.**
Antes te decía «el archivo no es un extracto de este banco», que era mentira y te
mandaba a mirar el parser y el fichero equivocado: eso es lo que te costó una vuelta
entera el 2026-08-19.

Ahora hay dos mensajes, porque hay dos remedios distintos:

- **Lo has reguardado pero las tildes siguen ahí** → «vuelve a abrirlo y guárdalo con
  la codificación **Western (Windows-1252)**, o descárgalo otra vez del banco».
- **Lo has reguardado y las tildes ya salen como `�`** → «los caracteres acentuados
  **ya se han perdido** y no se pueden recuperar: **vuelve a descargarlo del banco**».
  Este es tu caso de aquel día.

Los dos empiezan diciendo que el fichero **se ha vuelto a guardar en otra
codificación**, y los dos dicen expresamente que **no** es que el archivo no sea de
este banco. El fichero se rechaza entero (`UNEXPECTED_ENCODING`, 422), no se importa
nada, no se mueve a `procesados/` y **nunca se intenta reparar**: un fichero que se
arregla solo es un fichero en el que no puedes confiar.

Y el runbook ya no habla solo del Bloc de notas: ahora explica cómo editarlo **con
Visual Studio Code**, que es el editor que usas de verdad.

## Por dónde se usa (puntos de entrada)

Nada nuevo que llamar: la guardia se dispara sola dentro de lo que ya usabas.

- `POST /api/import` — el fichero afectado sale en `files[].error.code` como
  `UNEXPECTED_ENCODING`, aislado: el resto del lote entra igual.
- `POST /api/parser/openbank` — el fichero sale en `failed[]` con el motivo de texto.
- Y si prefieres leerlo antes de que pase:
  [`docs/dar-de-alta-un-banco.md:368`](../../docs/dar-de-alta-un-banco.md#L368),
  §*Editarlo con Visual Studio Code sin romperlo*.

## Dónde está el código (para revisión directa)

> Los enlaces son clicables en la vista previa de Markdown de VS Code (Ctrl/Cmd +
> clic): saltan a la línea exacta.

### El veredicto sobre los bytes (compartido, en `lib/`)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Dice si un fichero que declara cp1252 llega en realidad reguardado en UTF-8, y en qué línea está el primer carácter roto. **Es solo un veredicto: no descodifica, no adivina y no repara.** | `detectResaveAsUtf8` | [cp1252.ts:121](../../src/lib/cp1252.ts#L121) |
| La forma de ese veredicto (`scarLine`: la línea del primer `�`, o `null`) | `ResaveAsUtf8` | [cp1252.ts:76](../../src/lib/cp1252.ts#L76) |
| El descodificador de Openbank, **sin tocar** en esta feature | `decodeCp1252Strict` | [cp1252.ts:45](../../src/lib/cp1252.ts#L45) |

### Dónde se engancha y de dónde salen los dos mensajes (módulo de Openbank)

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| El parser del extracto: comprueba la declaración, **luego** los bytes, y solo entonces descodifica | `parseOpenbankStatement` | [openbank.statement.parser.ts:104](../../src/modules/openbank/openbank.statement.parser.ts#L104) |
| La llamada a la guardia nueva, en su sitio exacto del orden | — | [openbank.statement.parser.ts:115](../../src/modules/openbank/openbank.statement.parser.ts#L115) |
| **Los dos mensajes que lees tú** (reguardado / caracteres ya perdidos) | `assertBytesMatchDeclaration` | [openbank.statement.parser.ts:231](../../src/modules/openbank/openbank.statement.parser.ts#L231) |
| La guardia de la feature 19, intacta: solo cambia en que ahora **devuelve** la codificación declarada, para poder nombrarla en el mensaje | `assertDeclaredEncoding` | [openbank.statement.parser.ts:188](../../src/modules/openbank/openbank.statement.parser.ts#L188) |

### Los ficheros de prueba, todos inventados en código

| Qué hace | Símbolo | Código |
| --- | --- | --- |
| Reproduce lo que hizo VS Code aquel día, **transformando** el fichero sintético (no copiando nada del tuyo) | `resaveInUtf8AsAnEditorWould` | [openbank.fixture.ts:263](../../src/modules/openbank/openbank.fixture.ts#L263) |
| Fabrica un extracto del tamaño de un mes: 200 filas **calculadas**, todas con tilde | `openbankManyRows` | [openbank.fixture.ts:237](../../src/modules/openbank/openbank.fixture.ts#L237) |

### Tests

| Qué cubre | Código |
| --- | --- |
| El caso exacto del 2026-08-19: primero **mide** que el fichero de prueba tiene el mismo daño, y luego que el error dice «reguardado» y **nunca** «cabecera no encontrada» | [openbank.statement.parser.test.ts:113](../../src/modules/openbank/openbank.statement.parser.test.ts#L113) |
| Los dos mensajes dicen **qué hacer**, no solo qué pasa | [openbank.statement.parser.test.ts:163](../../src/modules/openbank/openbank.statement.parser.test.ts#L163) |
| No salta con un extracto legítimo del banco, ni con uno sin una sola tilde | [openbank.statement.parser.test.ts:176](../../src/modules/openbank/openbank.statement.parser.test.ts#L176) |
| La guardia de la feature 19 sigue mandando si el fichero deja de declarar nada | [openbank.statement.parser.test.ts:197](../../src/modules/openbank/openbank.statement.parser.test.ts#L197) |
| **No-regresión**: un extracto legítimo entra con 200 movimientos, 0 filas sin parsear y los acentos intactos | [openbank.statement.parser.test.ts:210](../../src/modules/openbank/openbank.statement.parser.test.ts#L210) |
| El fallo viaja **por fichero**: el bueno del lote entra y el reguardado sale en `failed[]` con el motivo verdadero | [openbank.service.test.ts:103](../../src/modules/openbank/openbank.service.test.ts#L103) |
| El veredicto en crudo: extracto legítimo, ASCII puro, fichero vacío, y la línea del primer `�` | [cp1252.test.ts:133](../../src/lib/cp1252.test.ts#L133) |
| **La caza de falsos positivos por fuerza bruta**: cada acentuado del castellano, en tres posiciones de una frase, nunca dispara | [cp1252.test.ts:170](../../src/lib/cp1252.test.ts#L170) |
| Guardián: **solo un parser** engancha esta guardia. Si mañana alguien la enchufa a otro banco, la suite se pone roja | [architecture.test.ts:378](../../src/architecture.test.ts#L378) |
| Bankinter, MyInvestor y N26 no cambian: el descodificador del fichero que escribes tú se comporta igual | [utf8.test.ts:139](../../src/lib/utf8.test.ts#L139) |

### Documentación

| Qué | Dónde |
| --- | --- |
| **ADR-023**: la señal, dónde vive la guardia y por qué se reutiliza el código de error | [architecture.md:1595](../../docs/architecture.md#L1595) |
| El código `UNEXPECTED_ENCODING` ampliado, con su 422, su nota y la tabla de `/api/import` | [api-contract.md:55](../../docs/api-contract.md#L55), [:100](../../docs/api-contract.md#L100), [:632](../../docs/api-contract.md#L632) |
| La norma, en §Parsers de banco | [conventions.md:196](../../docs/conventions.md#L196) |
| **El runbook con Visual Studio Code** | [dar-de-alta-un-banco.md:368](../../docs/dar-de-alta-un-banco.md#L368) |

## Cumplimiento de la intención

- ✅ «Si subo un fichero de Openbank que declara iso-8859-1 pero está guardado en
  UTF-8, el error me dice que se ha **reguardado en otra codificación**, no que el
  archivo no sea un extracto del banco» → se cumple; verificado en
  `openbank.statement.parser.test.ts:125` (que además **prohíbe** el mensaje viejo) y,
  de punta a punta, en `openbank.service.test.ts:103`.
- ✅ «Si el fichero ya trae caracteres rotos, el error me lo dice y me manda a
  descargarlo otra vez del banco» → se cumple; motivo propio con la línea del primer
  `�`, verificado en `openbank.statement.parser.test.ts:138` y `cp1252.test.ts:158`.
- ✅ «El mensaje me dice **qué hacer**, no solo qué ha pasado: con qué codificación
  tengo que guardarlo» → se cumple; los dos motivos nombran **Western (Windows-1252)**
  tal como lo escribe el editor, verificado en `openbank.statement.parser.test.ts:163`.
- ✅ «Un fichero bueno sigue entrando exactamente igual que hoy» → se cumple; 200
  movimientos, 0 filas sin parsear y acentos intactos en
  `openbank.statement.parser.test.ts:210`, más toda la suite de Openbank de la feature
  19 sin tocar.
- ✅ «No quiero que el backend adivine la codificación ni repare el fichero» → se
  cumple; el veredicto no modifica los bytes (`cp1252.test.ts:185`) y de un fichero
  roto **no sale ni un movimiento**.
- ✅ «No quiero que se toquen los parsers de Bankinter, MyInvestor ni N26» → se cumple;
  esos tres módulos **no tienen una sola línea de diferencia** frente a git, con
  guardián ejecutable en `architecture.test.ts:378`.
- ✅ «No quiero perder la guardia que ya hay (feature 19)» → se cumple; sin declaración
  o con una no aceptada se sigue rechazando entero, verificado en
  `openbank.statement.parser.test.ts:197`.

## Decisiones que se tomaron por ti

Las tres que delegaste, todas resueltas por escrito en el **ADR-023**:

- **(delegado) Cómo se detecta el desajuste sin adivinar.** Solo por un **hecho
  comprobable**: el fichero declara cp1252/iso-8859-1 y sus bytes son UTF-8 válido con
  secuencias multibyte. Un cp1252 con acentos no puede serlo, así que esos bytes no los
  escribió el banco. **No se husmea ninguna codificación**. Un fichero **sin una sola
  tilde** no dispara la guardia a propósito: ahí las dos lecturas son los mismos bytes
  y no hay nada que pueda romperse.
- **(delegado) Dónde vive.** En `src/lib/cp1252.ts`, al lado del descodificador del que
  es la otra mitad, porque una codificación no es un formato. Pero es **opt-in**: la
  llama solo el parser del banco que emite en una codificación de un solo byte. Los
  otros tres bancos **no la heredan**.
- **(delegado) Qué código de error.** Se **reutiliza `UNEXPECTED_ENCODING`** (422) en
  vez de inventar uno nuevo: la familia del fallo y el remedio son los mismos, y lo que
  cambia es el **motivo**, que es lo que lees tú. Un código nuevo obligaría al
  importador y al futuro frontend a aprender dos códigos para la misma solución.

## Qué NO se tocó / quedó fuera

- **No se repara ningún fichero**, ni siquiera cuando técnicamente se podría releer
  como UTF-8: eso sería la cascada de intentos que el proyecto tiene prohibida.
- **No se detecta el caso contrario** (un UTF-8 leído como cp1252): no es decidible sin
  adivinar, y de eso se ocupa la guardia de la declaración de la feature 19.
- **Ningún otro banco** engancha la guardia, y no se ha añadido ni una dependencia.
- **No cambia ningún endpoint ni ningún modelo**: no hay nada que actualizar en el
  frontend.

## Notas para el futuro

1. 🟠 **Te toca a ti:** redescargar el extracto de Openbank (las tildes del fichero que
   está en Drive **están perdidas**), volver a escribir la línea del IBAN y guardarlo
   con **Western (Windows-1252)** siguiendo el runbook nuevo. Hasta entonces Openbank
   sigue sin entrar en la base de datos.
2. 🟠 El guardián de privacidad (feature 14) sigue **sin leer ficheros `.xls`/`.html`**
   al comparar; hoy los conceptos de Openbank quedan cubiertos de rebote por su volcado
   parseado. Hallazgo abierto desde la feature 19, y es trabajo de la 14.
3. ⚪ El número de línea que da el mensaje del `�` será casi siempre la 1 en este banco,
   porque su `.xls` viene escrito casi todo en una sola línea. Es honesto, pero poco
   útil aquí.
4. ⚪ El día que entre otro banco que emita en una codificación de un solo byte, llama a
   la misma guardia desde su parser (una línea). Uno que emita UTF-8 no la necesita.
