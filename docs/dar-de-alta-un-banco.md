# Runbook — Dar de alta un banco

> Recordatorio operativo para el humano. El backend **no** crea carpetas de banco
> por su cuenta: dar de alta un banco es una acción **explícita y deliberada**.
> Decisión de la puerta de aprobación (2026-07-24): *"Drive es el registro de
> bancos; crear un banco es una acción explícita."* Detalle en
> `docs/architecture.md` → **ADR-008** y en `specs/drive-structure/design.md` §6.

> 📌 **¿Solo quieres saber qué archivo pide cada banco y qué se escribe a mano
> en él?** Está en una página de una tabla:
> [`docs/archivos-por-banco.md`](archivos-por-banco.md). Esta de aquí es el runbook
> completo, con el porqué de cada cosa.

## Por qué hay que hacerlo a mano

La fuente de verdad de "qué bancos existen" son **las subcarpetas directas de la
raíz `notas-banco/`** (la carpeta cuyo fileId pusiste en
`GOOGLE_DRIVE_ROOT_FOLDER_ID`). No hay lista de bancos en la config ni en la base
de datos.

La operación cotidiana (asegurar carpeta / subir / mover) **exige** que el banco
ya exista. Si pides un banco que no tiene carpeta, el backend **no la inventa**:
falla con `UnknownBankError` (404), te lista los bancos conocidos y te sugiere el
más parecido. Esto es a propósito: evita que un typo (`santender` por
`santander`) cree una carpeta nueva equivocada donde la ingesta deposite notas
sin que nadie se entere.

## La estructura

```
notas-banco/            ← raíz, creada a mano por ti → GOOGLE_DRIVE_ROOT_FOLDER_ID
  <banco>/              ← alta EXPLÍCITA (este runbook)
    <año>/              ← lo crea el backend solo, la 1ª vez que subes algo
      procesados/       ← lo crea el backend solo
```

Solo el **nivel banco** necesita acción tuya. El `<año>` y su `procesados/` los
crea el backend de forma automática e idempotente cuando llega el primer archivo
de ese banco/año.

## Cómo dar de alta un banco — dos formas equivalentes

### Opción A — a mano en la web de Drive (la más simple)

1. Abre la carpeta raíz `notas-banco/` en [drive.google.com](https://drive.google.com),
   con **la misma cuenta** que conectaste en la feature 3.
2. Crea dentro una subcarpeta con el nombre del banco.
3. Usa ya el **nombre normalizado** (ver reglas abajo) para que coincida con lo
   que el backend busca: minúsculas, sin acentos, con guiones. Ej.: `santander`,
   `bbva`, `la-caixa`.

### Opción B — desde código con `createBank`

`createBank` es el **único** camino de alta en código. Es idempotente (si la
carpeta ya existe, la reutiliza; no duplica).

```ts
import { createBank } from './src/lib/drive-structure.js'

await createBank(app.drive, app.config.driveRootFolderId, 'santander')
```

- `app.drive` es el cliente expuesto por la feature 3 (`fastify.drive`).
- `app.config.driveRootFolderId` es la variable de entorno ya validada al arrancar.
- Devuelve el `fileId` de la carpeta del banco.

> Hoy no hay endpoint HTTP para esto (es servicio interno; ver ADR-008). Si
> quieres ejecutarlo suelto, un `tsx` de usar y tirar que construya la app y
> llame a `createBank` sirve como smoke manual.

## Después de la carpeta: crear el módulo de parser de ese banco (código)

> Añadido el 2026-08-11 con la feature 10 (`myinvestor-statement`), el **segundo
> banco** del repo y el primer caso que lo demuestra. La regla ya estaba escrita en
> [`docs/conventions.md` §Parsers de banco](conventions.md#parsers-de-banco);
> lo que faltaba era este paso operativo.

La carpeta de Drive solo resuelve **dónde se dejan** los archivos. Para que el
backend sepa **leerlos**, ese banco necesita **su propio módulo de parser**:

```
src/modules/<banco>/          ← mismo slug que la carpeta de Drive
  <banco>.<entrada>.parser.ts #   parser puro: Buffer -> resultado (sin BD, sin Drive)
  <banco>.format.ts           #   números/fechas de ESE banco (si los necesita)
  <banco>.service.ts          #   recorre var/drive-read/<banco>/<año>/ y vuelca JSON
  <banco>.routes.ts           #   POST /api/parser/<banco>
  <banco>.types.ts            #   SOLO lo suyo (ver abajo)
  <banco>.fixture.ts          #   fixtures SINTÉTICOS en memoria (nunca datos reales)
```

Tres reglas que no se negocian:

1. **Ningún banco hereda el parser de otro.** El código que **lee el formato** no
   se comparte: el formato de cada banco cambia sin avisar y un parser compartido
   convierte el cambio de uno en una regresión para todos.
2. **La forma de la salida SÍ es común.** El módulo **consume** el contrato de
   [`src/lib/parsed-statement.ts`](../src/lib/parsed-statement.ts) (ADR-013) y
   **no** vuelve a declarar `ParsedMovement`, `UnparsedRow` ni
   `ParsedMovementType`: solo su alias `<Banco>StatementResult =
   ParsedStatement<'<banco>'>`. Hay un guardián en
   [`src/architecture.test.ts`](../src/architecture.test.ts) que rechaza una
   segunda declaración.
3. **Lo que el banco no aporta es `null` explícito** (nunca `0` ni `""`), la
   posición dentro del día la emite el parser con
   [`assignDaySequence`](../src/lib/parsed-statement.ts#L96), y el tipo
   ingreso/gasto/neutral se decide **importando**
   [`deriveMovementTypeFromAmount`](../src/modules/movements/movements.service.ts#L33).

Ejemplos vivos que se pueden copiar tal cual: `src/modules/bankinter/` (`.xlsx`,
ADR-010), `src/modules/myinvestor/` (`.csv` con `;`, ADR-014) y
`src/modules/n26/` (`.csv` con `,` **y comillas**, feature 18). «Copiar» quiere
decir **copiar el patrón**, nunca importar: los tres módulos no comparten una
sola línea de lectura de formato, y hay guardián en
[`src/architecture.test.ts`](../src/architecture.test.ts) que lo comprueba.

**Cuarto paso, en `src/app.ts` (una línea):** para que la **importación** use ese
parser hay que añadir el banco al registro que se le inyecta (ADR-015):

```typescript
const parsers: BankParserRegistry = [
  { bank: 'bankinter', extensions: ['.xlsx'], parse: parseBankinterXlsx },
  { bank: '<banco>', extensions: ['.csv'], parse: parse<Banco>Statement },
]
```

> **Un CSV no es «el CSV».** Antes de escribir el parser, mira con qué separa el
> fichero y si entrecomilla. MyInvestor separa por `;` y no entrecomilla, así que
> partir la línea basta; N26 separa por `,` **y entrecomilla los campos de texto,
> con comas dentro**, así que partir por `,` corta filas por la mitad. El segundo
> caso necesita un lector de CSV de verdad, y ese lector vive **dentro del módulo
> del banco** ([`n26.csv.ts`](../src/modules/n26/n26.csv.ts)), no en `lib/`:
> `lib/` comparte la **forma de la salida** y la **codificación**, nunca la
> lectura del formato.

`app.ts` es **el único archivo de `src/` que puede nombrar un banco**. Mientras
esa línea no exista, sus ficheros se reportan como `skipped` en el informe de
`POST /api/import` (ni se importan ni se mueven), que es justo lo que permite
inspeccionarlos antes de tener el parser.

## El IBAN va en el fichero, una sola vez

> Añadido el 2026-08-12 con la feature 12 (`import`).

**Ninguna cuenta se crea nunca sin IBAN.** El IBAN viaja **en el fichero**, no en
la configuración ni en un alta manual, y basta escribirlo **una vez** para esa
cuenta: no cambia nunca, así que los ficheros siguientes ya no lo necesitan.

- Si el banco lo trae en su export (Bankinter), no hay que hacer nada.
- Si no lo trae (MyInvestor), se escribe a mano como **primera línea del fichero**,
  **encima** de la fila de cabecera, con esta forma exacta:

  ```
  iban;ES9121000418450200051332
  Fecha de operación;Fecha de valor;Concepto;Importe;Divisa
  ```

  > El IBAN de este ejemplo es el **público de la documentación española**, no el
  > tuyo: en el repositorio (docs, specs y tests) nunca se escribe un IBAN real.
  > El tuyo va solo en tu fichero de Drive y en su copia local de
  > `var/drive-read/`, que está gitignoreada.

  La etiqueta se compara sin distinguir mayúsculas ni espacios sobrantes y los `;`
  de relleno que añade Excel al final son inocuos.

Si falta y ese banco no tiene **exactamente una** cuenta ya dada de alta, ese
fichero se reporta como `failed` con el código `MISSING_ACCOUNT_DATA`, no se
importa y **no se mueve**: se corrige el fichero y se reintenta.

### Cómo escribes el IBAN da igual; que esté bien tecleado, no

> Añadido el 2026-08-18 con la feature 21 (`iban-normalization`).

- **Puedes escribirlo con espacios de cuatro en cuatro o del tirón, en mayúsculas o
  en minúsculas.** El backend lo normaliza antes de nada, así que
  `iban;ES91 2100 0418 4502 0005 1332` y `iban;es9121000418450200051332` son **la
  misma cuenta**. Hasta hoy no lo eran: se guardaba tal cual y te salían **dos
  cuentas** para la misma, sin un solo aviso.
- 🔴 **Pero si te equivocas en un dígito, el fichero falla.** El IBAN lleva dos
  dígitos de control (mod-97) y el backend los comprueba: si no cuadran, ese
  fichero se reporta como `failed` con el código `INVALID_IBAN` y el motivo
  `el iban de la línea 2 no es válido: el dígito de control no cuadra`. **No se
  crea ninguna cuenta**, no se importa nada y el fichero **no se mueve** a
  `procesados/`: corriges la línea, lo vuelves a subir y ya. Es a propósito
  (decisión tuya del 2026-08-18): más vale un fallo en ese momento que una cuenta
  con pinta de buena y los movimientos del mes dentro.
- **El separador sigue siendo `;`.** `iban: <IBAN>` con dos puntos **no vale** y
  no va a valer: si lo escribes así, el fichero acaba en `MISSING_ACCOUNT_DATA`,
  como hasta ahora. (Ya pasó el 2026-08-18 con el fichero de N26.)
- **Esto vale igual para el alta manual por la API** (`POST /api/accounts`): la
  misma normalización y la misma validación. No hay dos reglas para el mismo dato.

- **N26 tampoco lo trae** (feature 18): trae el IBAN **del otro** —la
  contraparte—, que no sirve para nada aquí y que el parser **nunca** confunde
  con el tuyo. Se escribe a mano igual que en MyInvestor.

  🔴 **Y se escribe con `;`, aunque el fichero de N26 separe por comas:**

  ```
  iban;ES9121000418450200051332
  Saldo;1500,00
  <aquí, sin tocar, la fila de cabecera en inglés que exporta N26>
  ```

  Es a propósito, y es decisión tomada: **una sola forma de escribir estas dos
  líneas en todo el proyecto**, la que ya estaba documentada aquí, y así la línea
  nuestra se distingue a simple vista de las del banco. (Si algún día te sale
  escribirla con la coma del fichero, el parser de N26 también la entiende, pero
  la forma buena es esta.)

### Si el fichero del banco es HTML: el IBAN va en un comentario de la primera línea

> Añadido el 2026-08-19 con la feature 19 (`openbank-statement`). Es la decisión
> delegada nº 3 de esa feature, resuelta aquí por escrito.

El fichero de **Openbank** se llama `.xls` pero **no es un Excel**: por dentro es
una página HTML con una tabla. Ahí no hay «primera línea de la tabla» que puedas
escribir sin pelearte con el HTML, así que el IBAN va en un **comentario HTML, en
la primera línea del fichero**, con esta forma exacta:

```html
<!-- iban;ES9121000418450200051332 -->
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" ...>
```

> Ese IBAN es el **público de la documentación española**, no el tuyo. El tuyo va
> solo en tu fichero de Drive y en su copia local de `var/drive-read/`, que está
> gitignoreada.

Por qué ahí y no en otro sitio:

- **Se ve nada más abrir el fichero** y es difícil ponerlo en el sitio
  equivocado: o está en la primera línea o no está.
- **Es HTML válido:** el navegador y Excel lo ignoran, así que el fichero se
  sigue abriendo exactamente igual que antes de tocarlo.
- **Es la misma forma `etiqueta;valor` de los otros bancos**, con el mismo `;`
  (con `:` no vale, como en todos los demás) y leída **solo** si está **antes de
  la tabla**. El número de cuenta que el propio fichero imprime es un **CCC** y
  el backend **nunca** deriva de él un IBAN, aunque el cálculo sea exacto:
  decisión tuya del 2026-08-17.

Cómo se escribe, en la práctica:

1. 🔴 **No lo abras con Excel.** Excel reescribiría el fichero entero y dejaría de
   ser lo que dio el banco.
2. 🔴 **Y si lo abres con Visual Studio Code —o con cualquier editor moderno—,
   guárdalo con la codificación del banco, no con la de por defecto.** Esto es lo
   que hay que hacer, paso a paso, y por qué está en 🔴: ver
   §*Editarlo con Visual Studio Code sin romperlo*, aquí abajo.
3. Añade la línea del comentario arriba del todo y guarda **sin cambiar la
   codificación** (ver la sección de codificación, más abajo: este fichero **no**
   va en UTF-8, va como lo emite el banco).
4. **Solo hace falta la primera vez.** Los ficheros siguientes ya no lo
   necesitan: la cuenta ya existirá y el importador la resuelve sola. Si un mes
   se te olvida, no falla nada.

**El saldo de Openbank NO lo escribes tú**: ese banco lo trae en su propio
preámbulo (la fila `Saldo:`) y el backend lo lee de ahí. Las demás filas de ese
preámbulo —fecha de descarga, número de cuenta, descripción y titular— se ignoran
en silencio y **no** aparecen como filas sin parsear.

## El saldo de la cuenta va en la misma cabecera, una línea más

> Añadido el 2026-08-16 con la feature 16 (`statement-balance`).

El saldo que tiene la cuenta **en la fecha del extracto** se escribe a mano, igual
que el IBAN y **justo debajo**, como segunda línea de preámbulo etiquetada:

```
iban;ES9121000418450200051332;;;
Saldo;1500,00;;;
Fecha de operación;Fecha de valor;Concepto;Importe;Divisa
```

- **La etiqueta se reconoce sin distinguir mayúsculas ni acentos** (`Saldo`,
  `saldo`, `SALDO` valen), y los `;` de relleno que añade Excel al final son
  inocuos, como en la línea del IBAN.
- **El importe se escribe como lo escribe el banco:** coma decimal y punto de
  miles (`1.234,56`). Es un CSV español; ahí la coma decimal es correcta. (Ojo: en
  los `.json` de producto **no** lo es — ver `docs/myinvestor-product-files.md`.)
- **Si algún mes se te olvida, no pasa nada:** el extracto se parsea igual y el
  saldo sale vacío, exactamente como el IBAN.
- **Si la línea está pero el número no se entiende** (`saldo;mil quinientos`), no
  se descarta en silencio: aparece en `unparsedRows` con su nº de línea y el
  motivo, y el resto del fichero se parsea igual.
- 🔴 **La fila `Saldo` del FINAL del fichero ya no sirve y hay que borrarla.** El
  backend **no** la lee: hay una sola forma de escribir este dato, la de arriba.
  Si se queda, cae en `unparsedRows` como cualquier fila que no es un movimiento.

- **En N26 vale lo mismo, con dos matices** (feature 18): la línea se escribe
  también con `;` (ver arriba) y el importe puedes escribirlo **a la española**
  (`1.500,00`) o **como lo escribe ese fichero** (`1500.00`): las dos se
  entienden, porque esa línea la escribes tú y no el banco. La columna de
  importes del propio banco, en cambio, se lee **estricta**: punto decimal y nada
  más.

Este saldo es **el de la cuenta**, no el saldo tras cada movimiento (`balance`),
que MyInvestor no reporta y sigue vacío en todas las líneas. Son dos datos
distintos y se guardan aparte a propósito. ~~Por ahora solo se parsea y se
vuelca: todavía no se persiste en la base de datos.~~ → **actualizado por la
feature 31** (2026-08-25), que sí lo persiste; ver justo aquí debajo.

### 🔴 Con escribirla UNA VEZ por cuenta basta — y es el saldo al ÚLTIMO MOVIMIENTO del archivo

> Añadido el 2026-08-25 con la feature 31 (`real-account-balance`), que es la que
> empieza a guardar este dato. Es la suposición sobre la que se apoya todo el
> cálculo del saldo, así que conviene tenerla escrita.

- **Es el saldo al ÚLTIMO MOVIMIENTO de ESE archivo**, no el saldo del día en que
  te sentaste a escribir la línea. El backend le pone como fecha la del movimiento
  más reciente del propio archivo, porque el preámbulo no trae ninguna: si tú
  escribes el saldo de hoy en un extracto que termina hace dos semanas, el número
  queda anclado en una fecha que no le corresponde y todo lo de esas dos semanas
  se suma encima **por segunda vez**. (Confirmado por el humano el 2026-08-25.)
- **Basta con escribirla UNA VEZ por cuenta, no todos los meses.** El backend la
  usa para **anclar** la cuenta: guarda ese importe con su fecha y, a partir de
  ahí, el saldo se calcula solo sumando lo que va entrando. Un extracto posterior
  que traiga la línea **no reescribe** el ancla, así que ni ayuda ni molesta.
- **Si algún mes te la saltas, no pasa nada** (ya estaba dicho arriba) y ahora
  además da igual: la cuenta ya está anclada.
- El detalle de cómo se calcula el saldo a partir de este dato está en
  `docs/architecture.md` → **ADR-028**.

## Lo que escribes TÚ se guarda en UTF-8; lo que emite el banco, como lo emita

> Añadido el 2026-08-15 con la feature 17 (`statement-encoding-guard`), después de
> que pasara de verdad. **Acotado el 2026-08-19 con la feature 19**
> (`openbank-statement`), que es la decisión delegada nº 2 de esa feature: la
> regla no se rompe, se dice de quién es.

**La regla, en dos líneas:**

- **El fichero que EDITAS tú se guarda en UTF-8** (MyInvestor, N26). Aquí no
  cambia absolutamente nada de lo que ya hacías.
- **El fichero que emite el BANCO se lee con la codificación de ese banco**, que
  su parser declara. Openbank exporta en **cp1252** y así se lee: **tú no
  reconviertes nada**.

**Al editar el fichero para meterle la línea `iban;`, guárdalo en UTF-8.** El Bloc
de notas en modo ANSI y Excel guardan en **cp1252** sin avisar, y ahí la `Ó` deja
de ser `c3 93` para ser un solo byte `d3` que no es UTF-8 válido.

- En el Bloc de notas: *Guardar como → Codificación: **UTF-8***.
- En Visual Studio Code: la barra de estado (abajo a la derecha) dice la
  codificación del archivo abierto; **`Save with Encoding` → `UTF-8`**. Aquí el
  valor por defecto del editor es el bueno — **el único fichero donde NO lo es es
  el de Openbank**, que va en cp1252 (ver más abajo).
- En Excel: *Guardar como → **CSV UTF-8***. Ojo también al **separador de la
  tabla**, que es del banco y no se toca: MyInvestor exporta con `;` y N26 con
  `,`. Lo único que escribes tú son las dos líneas de preámbulo, y esas van
  siempre con `;`.

**Qué hace el backend si se te escapa:** rechaza **el fichero entero** con el
código `NOT_UTF8` y un motivo que dice el byte, la línea y qué hacer. No se importa
nada de él, **no se mueve a `procesados/`** y sigue pendiente: lo vuelves a guardar
en UTF-8, lo resubes y entra a la primera.

**Lo que el backend NO hace, a propósito:** no aprende cp1252, no adivina la
codificación y no repara el fichero. Hasta esta feature lo leía igualmente y
`SUSCRIPCIÓN PREMIUM` se guardaba como `SUSCRIPCI�N PREMIUM` **sin un solo fallo**
—11 movimientos, cero filas sin parsear—, y esa pérdida es irreversible. Un fichero
rechazado se arregla en un minuto; un dato corrupto que entra callado, no.

La comprobación vive en [`src/lib/utf8.ts`](../src/lib/utf8.ts) (`decodeUtf8Strict`),
fuera del módulo de cualquier banco: la codificación no es un formato, así que se
comparte. Hoy la usan los dos parsers de texto: el del extracto `.csv` de MyInvestor
([`myinvestor.statement.parser.ts`](../src/modules/myinvestor/myinvestor.statement.parser.ts))
y el de N26
([`n26.statement.parser.ts`](../src/modules/n26/n26.statement.parser.ts)) — la muestra
de N26 es ASCII puro hoy, pero eso es suerte del mes: en cuanto un comercio traiga
una tilde, el problema es el mismo;
el `.xlsx` de Bankinter no la necesita (no es texto plano) y los `.json` de producto
se escriben aparte. **Al dar de alta un banco cuyo fichero sea texto, su parser
declara con qué codificación lo lee y usa el descodificador estricto que le
corresponda —`decodeUtf8Strict` o el de la codificación de ese banco—, nunca
`toString('utf8')`.**

### El caso de Openbank: cp1252 y no es un error

Openbank emite su fichero en **cp1252** y lo **declara** dentro
(`<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1" />`).
No es un fichero mal guardado: es lo que da el banco. Por eso:

- **Tú no lo conviertes.** Lo subes tal y como lo descargas; el único cambio que
  le haces es el comentario del IBAN, y **la primera vez nada más**.
- 🔴 **No lo vuelvas a guardar con Excel.** Excel lo reescribiría entero (y muy
  probablemente le cambiaría la codificación), y entonces sí fallaría.
- **Si algún día Openbank deja de declarar esa codificación** —porque pase a
  UTF-8, por ejemplo—, ese fichero se **rechaza entero** con el código
  `UNEXPECTED_ENCODING` y un motivo que dice qué se esperaba y qué se encontró.
  No se lee «por si acaso»: leerlo igual metería 200 conceptos con los acentos
  rotos **sin dar ni un fallo**, que es el daño de la F17 al revés. Cuando pase,
  es una línea de código (la lista de codificaciones que acepta ese parser), no
  un drama.

### Editarlo con Visual Studio Code sin romperlo

> Añadido el 2026-08-19 con la feature 22 (`encoding-mismatch-guard`), **después de
> que pasara de verdad**: hasta ese día esta página solo hablaba del Bloc de notas,
> y el editor que usas es Visual Studio Code. Te costó una vuelta entera de
> diagnóstico.

🔴 **El guardado por defecto de un editor moderno es UTF-8, y eso destruye este
fichero sin avisarte.** VS Code abre el `.xls` de Openbank suponiendo UTF-8; como
sus acentos son bytes cp1252, no son UTF-8 válido y el editor **ya te los enseña
como `�`**. En cuanto le das a guardar, escribe esos `�` de verdad en el fichero
—en UTF-8— y deja el `<meta charset=iso-8859-1>` intacto. Las tildes originales
**ya no están** y no hay forma de recuperarlas.

**Cómo hacerlo bien** (los dos comandos están en la barra de estado, abajo a la
derecha, donde pone la codificación del archivo abierto):

1. Abre el fichero y, **antes de tocar nada**, pulsa la codificación de la barra de
   estado → **`Reopen with Encoding`** → **`Western (ISO 8859-1)`** (escribe `8859`
   en el buscador de la lista). Si tu VS Code también ofrece
   **`Western (Windows 1252)`**, vale igual: ver el recuadro de abajo. Los acentos
   tienen que verse bien; si ves `�`, ese fichero ya está roto: **bórralo y
   descárgalo otra vez del banco**.
2. Escribe la línea del IBAN arriba del todo.
3. Guarda con la codificación correcta: barra de estado → **`Save with Encoding`**
   → la misma con la que reabriste. (Un `Ctrl+S` normal, después de haber reabierto
   con esa codificación, también la conserva; lo que no puede pasar es que ponga
   `UTF-8` en la barra de estado cuando guardas.)

> ⚠️ **`Reopen with Encoding` y `Save with Encoding` no son lo mismo, y el orden
> importa.** *Reopen* vuelve a leer el fichero interpretando otra codificación: es
> el que **repara** la vista. *Save* escribe **lo que ya tienes en pantalla**, con
> los `�` incluidos si los hay. Si abriste en UTF-8 y ves rombos, hacer *Save with
> Encoding* no arregla nada: consolida el destrozo.

> 📌 **`ISO 8859-1` o `Windows 1252`: las dos valen, y `ISO 8859-1` es la que verás
> seguro.** Según la versión y el idioma de VS Code, la lista puede no ofrecer
> ninguna entrada con el nombre «Windows 1252» (pasó el 2026-08-19: solo salían las
> `ISO`). No es un problema: las dos codificaciones **solo se diferencian en el
> rango 0x80-0x9F** —comillas tipográficas, guion largo, el símbolo del euro— y son
> **idénticas byte a byte** en vocales acentuadas y `ñ`, que es lo único que trae
> este fichero. Además `ISO 8859-1` mapea **los 256 bytes**, así que reabrir y
> guardar con ella **no puede perder nada**, y es justamente el nombre que el propio
> fichero declara en su `<meta charset=iso-8859-1>`. El backend lo lee como cp1252,
> que acepta esos bytes exactamente igual.

**Si se te escapa, el backend te lo dice y te dice qué hacer** (feature 22): el
fichero se **rechaza entero** con el código `UNEXPECTED_ENCODING` y un motivo que
distingue los dos casos —«se ha vuelto a guardar en UTF-8: guárdalo con la
codificación Western (Windows-1252)» y, si ya trae `�`, «los caracteres acentuados
ya se han perdido: vuelve a descargarlo del banco»—. **No** te dirá, como hacía
antes, que el archivo no es un extracto de este banco: eso era falso y te mandaba a
mirar al sitio equivocado.

**Y el fichero no se repara nunca**, ni aquí ni en el backend: si trae `�`, se baja
otra vez del banco. Un fichero que se «arregla» solo es un fichero en el que no
puedes confiar.

El decodificador vive en [`src/lib/cp1252.ts`](../src/lib/cp1252.ts)
(`decodeCp1252Strict`), al lado del de UTF-8 y por el mismo motivo: la
codificación no es un formato. Lo que **sigue igual** es todo lo demás: nadie
adivina la codificación, no hay cascada de intentos y nunca se repara un fichero.

### 🔴 Cuando sustituyes un fichero roto, el viejo se borra EN ESE MOMENTO

Regla del humano, escrita el **2026-08-30** después de tropezar con ella.

Si vuelves a bajar un fichero del banco porque el anterior estaba roto, o si
generas un histórico que sustituye a varios sueltos, **el fichero viejo se borra
en los dos sitios a la vez**:

- en **Drive**, esté donde esté — también dentro de `procesados/`, que es donde
  acaba un fichero que llegó a importarse antes de romperse;
- en **`var/drive-read/`**, que es la copia local desde la que trabajan el
  ensayo y la reimportación.

Y **se dice en voz alta al hacerlo**, no se deja para luego.

**Por qué es una regla y no una manía.** Un fichero roto que se queda sale como
`failed` en **cada** importación, para siempre, y no aporta nada: sus movimientos
ya entraron por el fichero bueno. A las pocas semanas nadie recuerda qué hace ahí
ni por qué está roto, y hay que reconstruirlo a mano. Peor todavía: acostumbra a
ver rojos que «son normales», y ese es el día en que un fallo de verdad pasa
desapercibido.

**Ya pasó** (2026-08-30): dos ficheros —uno de N26 y uno de Openbank— sobrevivieron
a una limpieza en la que se generaron sus sustitutos. Los dos se habían roto por
lo mismo, abrirlos y volver a guardarlos con Excel, y los dos llevaban semanas
saliendo como `failed` sin que faltara un solo movimiento en la base.

## Reglas del nombre de banco (las aplica `normalizeBankName`)

El backend normaliza la entrada antes de usarla como nombre de carpeta:

- Pasa a **minúsculas**, quita **acentos** (`Bancó` → `banco`), convierte espacios
  y símbolos en `-` y colapsa guiones repetidos (`La Caixa` → `la-caixa`).
- El resultado debe casar `^[a-z0-9-]{1,64}$` (1 a 64 caracteres, solo letras
  minúsculas, dígitos y guiones).
- **Prohibido** el nombre reservado `procesados` (colisiona con la subcarpeta).
- Si tras normalizar queda vacío o pasa de 64 caracteres → `ValidationError`.

Consejo: crea la carpeta ya con el nombre normalizado para que "lo que ves en
Drive" sea idéntico a "lo que el backend busca".

## Cómo comprobar que quedó bien

- Si intentas asegurar/subir para ese banco y ya no salta `UnknownBankError`,
  está dado de alta.
- Si te equivocaste de nombre, el propio error te lista los bancos conocidos y te
  sugiere el correcto (`¿quisiste decir 'santander'?`).

## Dónde está el código (por si necesitas mirar)

| Qué | Archivo:línea |
|-----|---------------|
| Alta explícita de banco (idempotente) | `src/lib/drive-structure.ts:272` (`createBank`) |
| Resolver banco existente o `UnknownBankError` | `src/lib/drive-structure.ts:254` (`resolveBankFolder`) |
| Reglas del nombre de banco | `src/lib/drive-structure.ts:52` (`normalizeBankName`) |
| Estructura banco/año/procesados | `src/lib/drive-structure.ts:288` (`ensureBankYearFolders`) |
| Decisión de diseño | `docs/architecture.md` → ADR-008 · `specs/drive-structure/design.md` §6 |
