# Review — F22 `encoding-mismatch-guard`

**Fecha:** 2026-08-19 · **Revisor:** subagente `reviewer` · **Feature:** 22, **sin
spec** (`sdd: false`), única `in_progress` en `feature_list.json`.

## Veredicto

**APPROVED** — sin hallazgos que bloqueen.

`./init.sh` **ejecutado por el revisor**, no leído del informe: verde, exit code 0,
`Test Files 39 passed (39)`, `Tests 647 passed (647)`, **ninguna línea de saltados**
(el conteo del informe es exacto; baseline 628 → +19). `package.json` y
`pnpm-lock.yaml` **sin una sola línea de diferencia** frente al índice de git: cero
dependencias nuevas, confirmado contra git y no contra el informe.

Comprobado: los **10 criterios de `acceptance`** contra el código y los tests, el
`intent`, `docs/architecture.md`, `docs/conventions.md`, `docs/api-contract.md`,
`CHECKPOINTS.md` C1-C8 y el 🔒 guardián de la F14 con el método de la F19 (cruce de
cifras y de pares contiguos contra el fichero gitignoreado). Resumen de cierre:
[`summaries/encoding-mismatch-guard.md`](../summaries/encoding-mismatch-guard.md).

---

## Comprobado sin hallazgos

### C1 — el caso exacto del 2026-08-19, y nunca «cabecera no encontrada»

El fixture del caso real **no se afirma, se mide**:
[`openbank.statement.parser.test.ts:117`](../../src/modules/openbank/openbank.statement.parser.test.ts#L117)
fija las tres propiedades del fichero de aquel día (decodifica limpio como UTF-8,
trae el carácter de sustitución, el `<meta>` sigue declarando `iso-8859-1`) antes de
usarlo, así que el test no puede quedarse verde con un fixture que dejó de
reproducir el daño. El rechazo, en
[`:125`](../../src/modules/openbank/openbank.statement.parser.test.ts#L125): código
`UNEXPECTED_ENCODING`, 422, el motivo contiene «vuelto a guardar» y **`not.toContain`
del mensaje falso** más `not.toThrow(ValidationError)` — las dos mitades del criterio,
la que exige y la que prohíbe. De punta a punta, con el fallo viajando **por fichero**
en `failed[]` mientras el resto del lote entra, en
[`openbank.service.test.ts:103`](../../src/modules/openbank/openbank.service.test.ts#L103).

El orden en el parser es el correcto y está razonado en el código
([`openbank.statement.parser.ts:115`](../../src/modules/openbank/openbank.statement.parser.ts#L115)):
declaración (F19) → bytes (F22) → descodificar. La guardia se ejecuta **antes** de
`decodeCp1252Strict`, que es la única forma de que el mensaje de cabecera no llegue a
dispararse nunca en este caso.

### C2 — `U+FFFD` con motivo propio, sin reparar

Dos ramas distintas en
[`openbank.statement.parser.ts:231`](../../src/modules/openbank/openbank.statement.parser.ts#L231),
no un mensaje con un condicional dentro. La del `U+FFFD` da la **línea** del primero
y manda a redescargar; verificada en
[`parser.test.ts:138`](../../src/modules/openbank/openbank.statement.parser.test.ts#L138)
y, a nivel de veredicto,
[`cp1252.test.ts:158`](../../src/lib/cp1252.test.ts#L158). Que no se repara nada está
comprobado de dos maneras: el buffer de entrada sale intacto
([`cp1252.test.ts:185`](../../src/lib/cp1252.test.ts#L185)) y **no sale ni un
movimiento** del fichero, ni siquiera de las filas que eran ASCII puro.

### C3 — los dos mensajes dicen qué hacer

Leídos como los leería él, no como cadenas de test:

> «el archivo declara la codificación 'iso-8859-1' pero sus bytes se han vuelto a
> guardar en UTF-8: le pasa a cualquier editor moderno con solo abrirlo y darle a
> guardar. **No es que el archivo no sea un extracto de este banco**: vuelve a abrirlo
> y guárdalo con la codificación **Western (Windows-1252)**, o descárgalo otra vez del
> banco y súbelo tal cual»

> «…y además contiene el carácter de sustitución � (línea N): los caracteres
> acentuados **YA SE HAN PERDIDO** al guardarlo y no se pueden recuperar. No es que el
> archivo no sea un extracto de este banco: **vuelve a descargarlo del banco** y súbelo
> tal cual; si tienes que editarlo, guárdalo con Western (Windows-1252), **nunca en
> UTF-8**»

Sí le habrían ahorrado la vuelta del 2026-08-19, y por tres cosas concretas: nombran
la causa (**el guardado**, no el archivo ni el parser), **desmienten explícitamente**
la frase que le mandó al sitio equivocado, y nombran la codificación **con el nombre
que le sale en el desplegable del editor** (`Western (Windows-1252)`), no como
`cp1252` ni como `windows-1252`, que es la diferencia entre un mensaje entendible y
uno que obliga a buscar. El segundo además le dice que **no siga peleándose con ese
fichero**. Test que recorre **los dos** motivos exigiendo remedio en ambos:
[`parser.test.ts:163`](../../src/modules/openbank/openbank.statement.parser.test.ts#L163).

### C4 — la señal, verificada por mí, no aceptada por escrito

La decisión está resuelta por escrito en el informe §1, en el **ADR-023 §1**
([`docs/architecture.md:1595`](../../docs/architecture.md#L1595)) y en la propia
cabecera de [`src/lib/cp1252.ts:86`](../../src/lib/cp1252.ts#L86). **Verificado el
argumento por mi cuenta**, con las tres preguntas del encargo:

1. **cp1252 con acentos.** Cierto: cada acentuada es un byte suelto de `0xC0-0xFF` y
   UTF-8 exige continuación `0x80-0xBF` detrás. Reproducido un extracto sintético de
   200 conceptos acentuados en cp1252 → el veredicto es `null`. Y el test de fuerza
   bruta de [`cp1252.test.ts:170`](../../src/lib/cp1252.test.ts#L170) no es decorativo:
   recorre cada acentuado del castellano en tres posiciones, incluida la de **dos
   acentos contiguos**, que es donde estaría el riesgo.
2. **ASCII puro.** Se deja pasar **a propósito** y es la decisión correcta: por debajo
   de `0x80` las dos lecturas son los mismos bytes, así que no hay daño del que
   proteger y el criterio «no tiene tildes → sospechoso» habría rechazado ficheros
   perfectos. Cubierto en [`cp1252.test.ts:144`](../../src/lib/cp1252.test.ts#L144) y
   en el parser
   ([`parser.test.ts:183`](../../src/modules/openbank/openbank.statement.parser.test.ts#L183),
   que además comprueba que el fixture es realmente ASCII antes de concluir nada).
3. **Un cp1252 cuyos bytes altos formen UTF-8 válido por casualidad.** Existe: medido
   por mí, ~1.920 de los 16.384 pares de bytes altos son UTF-8 válido (p. ej. `É` +
   `€`). **La justificación escrita no lo oculta ni lo exagera**: dice que para un
   falso positivo tendrían que caer en pares así **todos** los bytes no-ASCII del
   fichero **entero**, sin una excepción. Eso es exactamente lo que hace falta para que
   el `TextDecoder` en modo `fatal` no lance, y en un extracto con cientos de bytes
   acentuados es inalcanzable. El argumento es correcto y está honestamente acotado en
   el código («essentially never») y en el ADR.

Anotación menor, sin efecto en el veredicto: en
[`docs/conventions.md`](../../docs/conventions.md) la frase queda dicha en absoluto
(«un cp1252 con acentos **no es** UTF-8 válido»), mientras el ADR y el código sí la
matizan. El sitio donde se decide es el ADR y ahí está bien dicho.

### C5 — dónde vive, y los otros tres bancos

Decidido por escrito (informe §2, ADR-023 §2): vive en
[`src/lib/cp1252.ts:121`](../../src/lib/cp1252.ts#L121) y es **opt-in**, no herencia.
**Comprobado contra los tests de los otros bancos, no contra el informe:**
`git diff --stat` y `git status` sobre `src/modules/bankinter/`,
`src/modules/myinvestor/` y `src/modules/n26/` salen **completamente vacíos** — ni
código ni tests de esos tres bancos tienen una sola línea de diferencia frente al
índice, y sus suites pasan dentro de los 647. Encima hay guardián ejecutable en
[`architecture.test.ts:378`](../../src/architecture.test.ts#L378): los únicos archivos
del repo que nombran `detectResaveAsUtf8` son `lib/cp1252.ts` y el parser de Openbank,
así que engancharla a otro banco pone la suite en rojo. Regresión del descodificador
del fichero que escribe el humano en
[`utf8.test.ts:139`](../../src/lib/utf8.test.ts#L139).

### C6 — código de error

Reutiliza `UNEXPECTED_ENCODING` (422) con el razonamiento del ADR-005 (el `code`
nombra la **clase**, no la causa) y con la comparación explícita con la F19, donde sí
se creó código nuevo porque el consejo del código viejo habría sido **equivocado**.
Aquí no lo es. Documentado en los **tres** sitios que toca:
[`api-contract.md:55`](../../docs/api-contract.md#L55) (tabla de códigos estables, con
su 422), [`api-contract.md:100`](../../docs/api-contract.md#L100) (nota propia de la
feature), la tabla de códigos por archivo de `/api/import`
([`api-contract.md:632`](../../docs/api-contract.md#L632)) y §Parser de Openbank; más
el **ADR-023 §3**. Código y status fijados por test, no solo por documento.

### C7 — la guardia de la F19 no se debilita

`assertDeclaredEncoding`
([`parser.ts:188`](../../src/modules/openbank/openbank.statement.parser.ts#L188)) solo
cambia en que **devuelve** la codificación declarada; sus dos rechazos son los mismos
y sus tres tests de la F19 siguen intactos
([`parser.test.ts:72`](../../src/modules/openbank/openbank.statement.parser.test.ts#L72),
[`:83`](../../src/modules/openbank/openbank.statement.parser.test.ts#L83),
[`:94`](../../src/modules/openbank/openbank.statement.parser.test.ts#L94)). El caso
combinado —fichero reguardado **y además** sin declarar nada— sigue saliendo por la
guardia vieja:
[`parser.test.ts:197`](../../src/modules/openbank/openbank.statement.parser.test.ts#L197).

### C8 — no-regresión, 200 movimientos y 0 `unparsedRows`

[`parser.test.ts:210`](../../src/modules/openbank/openbank.statement.parser.test.ts#L210):
200 movimientos, `unparsedRows` **igual a `[]`** (no «menos de N»), IBAN y saldo
leídos, y **acentos intactos** en el JSON serializado. Las 200 filas llevan tilde a
propósito, que es lo que hace el test capaz de fallar: son justo los bytes que podrían
haber disparado la guardia nueva.

### C9 — el runbook, con el editor que usa de verdad

Juzgado con dureza, y **pasa**.
[`docs/dar-de-alta-un-banco.md:368`](../../docs/dar-de-alta-un-banco.md#L368),
§*Editarlo con Visual Studio Code sin romperlo*: abre con la advertencia en 🔴 de que
**el guardado por defecto es UTF-8 y destruye el fichero sin avisar**, explica el
mecanismo (VS Code ya se los enseña como `�` antes de guardar), y da los pasos con el
**nombre literal de los comandos** — `Reopen with Encoding` → `Western (Windows 1252)`
**antes de tocar nada**, escribir el IBAN, `Save with Encoding` → lo mismo. Lo que lo
levanta por encima del aprobado justo son dos detalles: el **criterio de parada** del
paso 1 («si ves `�`, ese fichero ya está roto: bórralo y descárgalo otra vez»), que es
exactamente el diagnóstico que le faltó aquel día, y el aviso de que un `Ctrl+S`
normal **después** de haber reabierto también conserva la codificación, que es lo que
hará en la práctica. Además queda enganchado desde arriba: el paso 2 de «cómo se
escribe el IBAN» sube a 🔴 y apunta aquí, y la sección de UTF-8 gana su bullet de VS
Code, así que no depende de que llegue leyendo hasta el final.

### 🔒 C10 y el guardián de la F14

- **Cero `no-real-data-ok` nuevos**: `grep` en todo el repo — ninguna aparición nueva
  en `src/`, y en el diff solo texto en prosa de `progress/current.md`.
- **Fixtures escritos en código**: `openbankManyRows`
  ([`openbank.fixture.ts:237`](../../src/modules/openbank/openbank.fixture.ts#L237))
  calcula las 200 filas del índice, y `resaveInUtf8AsAnEditorWould`
  ([`:263`](../../src/modules/openbank/openbank.fixture.ts#L263)) **transforma** el
  fixture sintético en vez de copiar nada del fichero dañado real.
- **Cruce con el método de la F19**, hecho por mí contra el fichero gitignoreado: las
  cifras y los pares contiguos del extracto real cruzados contra **las 400 cifras que
  genera** el fixture nuevo → **0 pares contiguos** coincidentes y **una sola** cifra
  suelta, un importe redondo de dos dígitos que la fórmula produce por aritmética; sin
  pareja contigua no es una fila copiada, es una colisión. El texto de los conceptos
  generados no aparece en el fichero real. Cruzados además **todos** los importes, los
  números de 6+ dígitos y las palabras largas del fichero real contra **todos** los
  archivos versionados: **cero** aciertos en el módulo de Openbank y **cero** números
  de cuenta.
- **La capa de comparación corrió de verdad**: las dos ramas de `var/` están
  presentes, incluido el volcado parseado de Openbank (`.json`, que es lo que hace
  comparables sus conceptos), y la suite terminó con **0 saltados**.

### Arquitectura, convenciones y CHECKPOINTS

Arquitectura respetada: la codificación en `lib/` y el conocimiento del banco en su
módulo, sin que `lib/` nombre a ningún banco; `lib/` no importa de `modules/`. Sin
`console.log`, sin TODO sin contexto, sin dependencias nuevas. C1 ✅ (init verde), C2 ✅
(una sola feature `in_progress`; F22 **no** se ha marcado `done`, que es lo correcto),
C3 ✅, C4 ✅ (camino feliz y de error en todos los módulos tocados), C5 ✅ (nada
sospechoso sin trackear: lo no versionado es `progress/`, `src/modules/openbank/` y
`src/lib/cp1252*`, todo del trabajo en curso), C6 ✅ (`api-contract.md` actualizado en
la misma feature; no hay endpoint ni modelo nuevo, así que no hay breaking change que
anotar), C7 n/a (feature sin spec), C8 ✅ con el resumen escrito.

---

## Anotaciones para el futuro (no bloquean)

1. 🟠 **Sigue abierto el hallazgo de la F19**: el guardián de la F14 no lee `.xls` ni
   `.html` (`captureExtensions` en
   [`src/no-real-data.test.ts:74`](../../src/no-real-data.test.ts#L74)). Hoy los
   conceptos de Openbank quedan cubiertos **de rebote** por su volcado parseado en
   `var/parsed/`, pero el preámbulo del fichero crudo (titular, CCC) no lo está por esa
   vía. Es trabajo de la F14, no de esta feature, y el implementer ya lo anotó.
2. ⚪ `docs/conventions.md` enuncia en absoluto lo que el ADR-023 matiza bien (ver C4).
   Una coletilla del tipo «salvo que **todos** sus bytes altos formen pares válidos»
   lo dejaría igual de rotundo y más exacto.
3. ⚪ La línea que reporta el motivo del `U+FFFD` será casi siempre la 1 en este banco,
   porque el `.xls` viene en una sola línea. Honesto, pero poco útil aquí; anotado ya
   por el implementer y con el trade-off bien explicado (arreglarlo obligaría a
   descodificar antes de decidir, que es justo lo que la guardia evita).
