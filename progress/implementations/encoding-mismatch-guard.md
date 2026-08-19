# encoding-mismatch-guard (F22) — implementación

> Feature **sin spec** (`sdd: false`): se trabajó del `intent` y de los **10
> criterios de `acceptance`**. Un solo implementer, sin lotes.
>
> 🔒 **Guardián de la F14:** todo lo escrito aquí —fixtures incluidos— es
> **sintético y construido en código**. Ni un importe, concepto, IBAN, CCC ni nombre
> del fichero real está en ningún archivo versionado, y **no se ha añadido ni un
> `no-real-data-ok`**. Las 200 filas del test de no-regresión se **calculan** a
> partir del índice; el fichero dañado del caso real se **fabrica transformando** el
> fixture sintético, no copiando nada.

## De dónde sale, en una línea

El fichero llegó del banco en cp1252 declarando `iso-8859-1`; el humano lo abrió con
**Visual Studio Code** para escribir la línea del IBAN y le dio a guardar. El editor
lo leyó como UTF-8, convirtió sus 8 acentos en `U+FFFD` y lo reguardó **en UTF-8**,
dejando el `<meta>` intacto. El parser hizo lo correcto —leerlo como cp1252, que es
lo que el fichero afirma—, la cabecera salió `Fecha Operaci<U+FFFD>n` y el fichero se
rechazó con `VALIDATION_ERROR`: «no se encuentra la cabecera… el archivo no es un
extracto de este banco». **Ruidoso, correcto en la forma y falso en el fondo.**

## Archivos modificados / creados

| Archivo | Qué |
|---|---|
| [`src/lib/cp1252.ts`](../../src/lib/cp1252.ts#L121) | **Nuevo** `detectResaveAsUtf8` (+ `ResaveAsUtf8`, [L76](../../src/lib/cp1252.ts#L76)): el veredicto sobre los bytes, con el argumentario de por qué no es adivinar. `decodeCp1252Strict` **no se toca**. |
| [`src/modules/openbank/openbank.statement.parser.ts`](../../src/modules/openbank/openbank.statement.parser.ts#L231) | **Nuevo** `assertBytesMatchDeclaration`, llamado en [L115](../../src/modules/openbank/openbank.statement.parser.ts#L115) justo **después** de la guardia de la F19 y **antes** de descodificar. `assertDeclaredEncoding` ahora devuelve la codificación declarada (lo único que cambia de ella). |
| [`src/modules/openbank/openbank.fixture.ts`](../../src/modules/openbank/openbank.fixture.ts#L263) | **Nuevos** `resaveInUtf8AsAnEditorWould` (reproduce lo que hizo VS Code) y `openbankManyRows` ([L237](../../src/modules/openbank/openbank.fixture.ts#L237), 200 filas calculadas). |
| [`src/modules/openbank/openbank.statement.parser.test.ts`](../../src/modules/openbank/openbank.statement.parser.test.ts#L113) | 9 tests nuevos (C1, C2, C3, C4, C7, C8). |
| [`src/modules/openbank/openbank.service.test.ts`](../../src/modules/openbank/openbank.service.test.ts#L103) | 1 test: el fallo viaja **por fichero** en `failed[]`, con el motivo verdadero. |
| [`src/lib/cp1252.test.ts`](../../src/lib/cp1252.test.ts#L133) | 6 tests del veredicto, incluida la **caza de falsos positivos por fuerza bruta**. |
| [`src/lib/utf8.test.ts`](../../src/lib/utf8.test.ts#L139) | 2 tests de regresión: el descodificador del fichero **del humano** no cambia (C5). |
| [`src/architecture.test.ts`](../../src/architecture.test.ts#L378) | Guardián: la guardia la cablea **un solo parser**. Es lo que *demuestra* C5, en vez de afirmarlo. |
| [`docs/architecture.md`](../../docs/architecture.md#L1595) | **ADR-023** (+ nota de enlace en el ADR-022, [L1584](../../docs/architecture.md#L1584)). |
| [`docs/api-contract.md`](../../docs/api-contract.md#L100) | `UNEXPECTED_ENCODING` ampliado en la tabla de códigos estables, nota propia, tabla de códigos por archivo de `/api/import` y §Parser de Openbank. |
| [`docs/conventions.md`](../../docs/conventions.md) | §Parsers de banco: la norma nueva, justo bajo la de la F19. |
| [`docs/dar-de-alta-un-banco.md`](../../docs/dar-de-alta-un-banco.md#L368) | **§Editarlo con Visual Studio Code sin romperlo** (C9), bullet de VS Code en la sección de UTF-8 y paso 🔴 en «cómo se escribe el IBAN». |
| `feature_list.json`, `progress/current.md` | Estado `in_progress` y bitácora en vivo. |

## Las tres decisiones delegadas, resueltas por escrito

### 1. Cómo se detecta el desajuste sin adivinar codificaciones (criterio 4)

**La señal admitida es una sola y es un hecho comprobable:** el fichero **declara**
cp1252/iso-8859-1 y sus bytes son **UTF-8 válido con al menos una secuencia
multibyte**. No se husmea ninguna codificación, no hay cascada de *fallbacks* y no se
repara nada (las tres prohibiciones del ADR-018 y del ADR-022 siguen intactas): la
declaración sigue decidiendo cómo se lee el fichero, y esto es una comprobación de
**consistencia** entre lo que el fichero afirma y lo que sus bytes pueden ser.

**Por qué no da falsos positivos con un fichero legítimo.** Un cp1252 **con acentos
no es UTF-8 válido**: en cp1252 cada letra acentuada es **un byte** de `0xC0-0xFF`, y
UTF-8 exige que tras un byte así venga uno de continuación `0x80-0xBF` —que en cp1252
es el bloque pequeño de comillas tipográficas, rayas y el euro—. Para un falso
positivo tendrían que caer en pares así **todos** los bytes no-ASCII del fichero
**entero**, sin una sola excepción en 200 conceptos: no es español y no es lo que
imprime un banco. Y no se queda en argumento: hay un test que lo prueba **por fuerza
bruta** sobre cada carácter acentuado que este banco puede escribir, en tres
posiciones distintas de una frase
([`cp1252.test.ts:170`](../../src/lib/cp1252.test.ts#L170)).

**Qué pasa con el fichero puramente ASCII.** Se deja pasar **a propósito**: por debajo
de `0x80` cp1252 y UTF-8 son **los mismos bytes**, así que las dos lecturas coinciden
carácter a carácter y **no hay daño posible** del que proteger. Por eso el criterio no
puede ser «no tiene acentos → sospechoso»: eso rechazaría ficheros perfectos por no
llevar tildes. Fijado en dos tests
([`cp1252.test.ts:144`](../../src/lib/cp1252.test.ts#L144) y
[`parser.test.ts:183`](../../src/modules/openbank/openbank.statement.parser.test.ts#L183)).

**La dirección contraria no es decidible y no se intenta.** Texto UTF-8 leído como
cp1252 es mojibake **sin un solo byte inválido**; ese caso lo cubre la guardia de la
F19 (el fichero tiene que **declarar**), que no se toca.

### 2. Dónde vive la guardia, y si los otros bancos la heredan (criterio 5)

**Vive en [`src/lib/cp1252.ts`](../../src/lib/cp1252.ts#L121)**, junto a
`decodeCp1252Strict` —del que es literalmente la otra mitad: ese descodificador ya
documentaba que «él solo no es toda la guardia»— y por el mismo razonamiento del
ADR-018 §3 y del ADR-022 §4: **la codificación no es un formato**, no lleva dentro
conocimiento de ningún banco, así que compartirla no roza la norma «un parser por
banco». Se descartó meterla en `modules/openbank/`: el día que otro banco emita en una
codificación de un solo byte, copiar este razonamiento sería copiar código de
codificación, que es justo lo que `lib/` existe para evitar.

**Pero es opt-in, no herencia.** La llama el parser cuyo banco **emite** una
codificación de un solo byte. **Bankinter, MyInvestor y N26 no cambian de
comportamiento**, y no porque este informe lo diga:

- Los dos de texto siguen con `decodeUtf8Strict`, donde este desajuste **no existe**
  (declaran UTF-8 y llegan en UTF-8) y donde la forma que aquí se rechaza —UTF-8
  válido con multibyte— es justo la **correcta**. Regresión en
  [`utf8.test.ts:139`](../../src/lib/utf8.test.ts#L139).
- Y hay un **guardián** que comprueba que el único parser que la cablea es el de
  Openbank: [`architecture.test.ts:378`](../../src/architecture.test.ts#L378). Si
  mañana alguien la enchufa a otro banco sin pensarlo, la suite se pone roja.
- Bankinter (`.xlsx`, que no es texto plano) ni se roza.

### 3. Código de error: se reutiliza `UNEXPECTED_ENCODING` (criterio 6)

**Se reutiliza, no se crea uno nuevo**, y el motivo está en el ADR-005: el `code`
nombra la **clase** de error, no su causa concreta. Aquí la clase es exactamente la
que ese código ya nombra —«este fichero no llega en la codificación que emite su
banco, y lo dice el propio fichero»— y la **consecuencia es idéntica**: se rechaza
**entero** (422), no se importa nada, no se mueve a `procesados/` y viaja dentro del
informe de ese fichero en un 200. Un código nuevo obligaría a cada consumidor
(importador, futuro frontend) a aprender un segundo código para el mismo remedio, sin
ganar nada. (La comparación con la F19, donde sí se creó código nuevo, es exacta y
sostiene esta decisión: allí `NOT_UTF8` daba un **consejo equivocado** —«guárdalo en
UTF-8»—; aquí el consejo del código que se reutiliza es el mismo que hace falta.)

**Lo que sí es propio es el motivo, que es lo que lee el humano**, y son **dos**
porque el remedio no es el mismo
([`parser.ts:231`](../../src/modules/openbank/openbank.statement.parser.ts#L231)):

| Situación | Qué dice el motivo |
|---|---|
| Reguardado, acentos intactos | «sus bytes se han **vuelto a guardar** en UTF-8… **no es que el archivo no sea un extracto de este banco**: vuelve a abrirlo y guárdalo con la codificación **Western (Windows-1252)**, o descárgalo otra vez del banco» |
| Reguardado **y ya con `U+FFFD`** (el caso del 2026-08-19) | «…y además contiene el carácter de sustitución � (línea N): los caracteres acentuados **YA SE HAN PERDIDO** y no se pueden recuperar… **vuelve a descargarlo del banco**; si tienes que editarlo, guárdalo con Western (Windows-1252), **nunca en UTF-8**» |

Documentado en [`docs/api-contract.md`](../../docs/api-contract.md#L100) (tabla de
códigos estables con su 422, nota propia y tabla de códigos por archivo de
`/api/import`) y en el **ADR-023**.

## Trazabilidad: cada criterio con su(s) test(s)

| # | Criterio | Test |
|---|---|---|
| C1 | Declara `iso-8859-1` y está en UTF-8 → dice que **se ha reguardado**, nunca «cabecera no encontrada». Con el **caso exacto del 2026-08-19** | [`parser.test.ts:125`](../../src/modules/openbank/openbank.statement.parser.test.ts#L125), más [L117](../../src/modules/openbank/openbank.statement.parser.test.ts#L117) que fija las **tres propiedades medidas** de aquel fichero (decodifica limpio como UTF-8, trae `U+FFFD`, el `<meta>` sigue diciendo `iso-8859-1`), [L149](../../src/modules/openbank/openbank.statement.parser.test.ts#L149) y, de punta a punta, [`service.test.ts:103`](../../src/modules/openbank/openbank.service.test.ts#L103) |
| C2 | Con `U+FFFD` → motivo propio: están perdidos, **redescarga**, no se repara | [`parser.test.ts:138`](../../src/modules/openbank/openbank.statement.parser.test.ts#L138); el veredicto con su línea en [`cp1252.test.ts:158`](../../src/lib/cp1252.test.ts#L158); que no repara nada, en [`cp1252.test.ts:185`](../../src/lib/cp1252.test.ts#L185) |
| C3 | Los dos mensajes dicen **qué hacer** (nombran la codificación / mandan a redescargar) | [`parser.test.ts:163`](../../src/modules/openbank/openbank.statement.parser.test.ts#L163) (recorre **los dos** motivos), [L149](../../src/modules/openbank/openbank.statement.parser.test.ts#L149) y [L138](../../src/modules/openbank/openbank.statement.parser.test.ts#L138) |
| C4 | Delegada nº 1 **por escrito** + sin falsos positivos + el caso ASCII | §1 de este informe y **ADR-023 §1**. Tests: [`cp1252.test.ts:134`](../../src/lib/cp1252.test.ts#L134) (cp1252 legítimo), [L144](../../src/lib/cp1252.test.ts#L144) (ASCII y vacío), [L154](../../src/lib/cp1252.test.ts#L154) (lo que sí caza), [L170](../../src/lib/cp1252.test.ts#L170) (**fuerza bruta**); en el parser, [L176](../../src/modules/openbank/openbank.statement.parser.test.ts#L176) y [L183](../../src/modules/openbank/openbank.statement.parser.test.ts#L183) |
| C5 | Delegada nº 2 **por escrito**; Bankinter, MyInvestor y N26 **no cambian** | §2 de este informe y **ADR-023 §2**. Tests: [`architecture.test.ts:378`](../../src/architecture.test.ts#L378) (un solo parser la cablea) y [`utf8.test.ts:139`](../../src/lib/utf8.test.ts#L139) (regresión del descodificador del humano) |
| C6 | Delegada nº 3 **por escrito**, documentada con su HTTP status y en el ADR | §3 de este informe, [`api-contract.md`](../../docs/api-contract.md#L100) y **ADR-023 §3**. Código y status fijados en [`parser.test.ts:125`](../../src/modules/openbank/openbank.statement.parser.test.ts#L125) (`UNEXPECTED_ENCODING`, 422) |
| C7 | La guardia de la F19 **no se debilita** | [`parser.test.ts:197`](../../src/modules/openbank/openbank.statement.parser.test.ts#L197) (reguardado **y** sin declarar → sigue mandando la guardia vieja), más los tres tests de la F19 intactos: [L72](../../src/modules/openbank/openbank.statement.parser.test.ts#L72), [L83](../../src/modules/openbank/openbank.statement.parser.test.ts#L83), [L94](../../src/modules/openbank/openbank.statement.parser.test.ts#L94) |
| C8 | Un fichero legítimo entra igual: **200 movimientos, 0 `unparsedRows`** | [`parser.test.ts:210`](../../src/modules/openbank/openbank.statement.parser.test.ts#L210) (200/0, IBAN, saldo y **acentos intactos**), más toda la suite de la F19 sin tocar |
| C9 | El runbook, con **Visual Studio Code** | [`docs/dar-de-alta-un-banco.md:368`](../../docs/dar-de-alta-un-banco.md#L368) §Editarlo con Visual Studio Code sin romperlo: `Reopen with Encoding` → `Western (Windows 1252)`, `Save with Encoding` → lo mismo, y la advertencia en 🔴 de que el guardado por defecto es UTF-8 y **destruye el fichero sin avisar** |
| C10 | Fixtures sintéticos en memoria, sin red; `./init.sh` verde con la capa de comparación de la F14 activa | Este informe y `./init.sh`: **647 tests, 647 pasan, 0 saltados** |

## Decisiones de implementación (las que no eran delegadas)

1. **El orden importa y es deliberado:** primero la declaración (F19), después los
   bytes (F22), después descodificar. Sin declaración no hay nada que contradecir, así
   que un fichero que además dejó de declarar sigue saliendo por el motivo viejo.
2. **El caso del humano dispara el motivo del `U+FFFD`, no el de «reguardado a
   secas»**, porque es más específico y su remedio es distinto (ya no hay nada que
   salvar). Aun así **empieza diciendo que se ha vuelto a guardar en otra
   codificación**, que es lo que pide C1.
3. **No se repara el fichero reguardado**, aunque técnicamente se podría releer como
   UTF-8: eso es exactamente el *fallback* prohibido, y con `U+FFFD` dentro los
   caracteres ya no existen.
4. **`decodeCp1252Strict` no se ha tocado**, ni su guardia de cicatriz: sigue siendo
   la red de la que el propio archivo de la F19 documentaba que «no puede ver» este
   caso (los tres bytes `EF BF BD` leídos como cp1252 salen como `ï¿½`, no como
   `U+FFFD`). Esta feature añade la capa que faltaba, no sustituye ninguna.

## Último `./init.sh`

**Verde: 39 archivos de test, 647 tests, 647 pasan, 0 saltados** (baseline 628 → **+19
tests**), con la capa de comparación del guardián de la F14 **activa**. `tsc --noEmit`
sin errores, `oxlint src` limpio y `prettier --check` limpio en todo lo tocado.
**Cero dependencias nuevas** (`package.json` y `pnpm-lock.yaml` sin tocar).

## Sugerencias fuera de scope (NO aplicadas)

1. 🟠 **El guardián de la F14 sigue sin comparar `.xls`/`.html`** (hallazgo del
   reviewer de la F19, aún abierto): un «0 saltados» no prueba nada **para este
   banco**. No se toca aquí porque es la F14.
2. ⚪ **La línea que se reporta en un fichero de Openbank casi siempre será la 1**: el
   `.xls` viene escrito casi todo en una sola línea. Sigue siendo honesto, pero para
   este banco sería más útil el nº de fila de la tabla; tocarlo exigiría descodificar
   antes de decidir, que es justo lo que esta guardia evita.
3. ⚪ **La misma guardia le vendría bien a cualquier banco futuro que emita en una
   codificación de un solo byte**; hoy no hay ninguno más y engancharla «por si acaso»
   sería la herencia que §2 descarta.
4. ⚪ `prettier --check` sigue fallando en `myinvestor.product.parser.test.ts`, como ya
   fallaba antes de esta feature. `init.sh` no lo ejecuta.
