# Runbook — Dar de alta un banco

> Recordatorio operativo para el humano. El backend **no** crea carpetas de banco
> por su cuenta: dar de alta un banco es una acción **explícita y deliberada**.
> Decisión de la puerta de aprobación (2026-07-24): *"Drive es el registro de
> bancos; crear un banco es una acción explícita."* Detalle en
> `docs/architecture.md` → **ADR-008** y en `specs/drive-structure/design.md` §6.

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
ADR-010) y `src/modules/myinvestor/` (`.csv`, ADR-014).

**Cuarto paso, en `src/app.ts` (una línea):** para que la **importación** use ese
parser hay que añadir el banco al registro que se le inyecta (ADR-015):

```typescript
const parsers: BankParserRegistry = [
  { bank: 'bankinter', extensions: ['.xlsx'], parse: parseBankinterXlsx },
  { bank: '<banco>', extensions: ['.csv'], parse: parse<Banco>Statement },
]
```

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

Este saldo es **el de la cuenta**, no el saldo tras cada movimiento (`balance`),
que MyInvestor no reporta y sigue vacío en todas las líneas. Son dos datos
distintos y se guardan aparte a propósito. Por ahora **solo se parsea y se
vuelca**: todavía no se persiste en la base de datos.

## El fichero se guarda en UTF-8, siempre

> Añadido el 2026-08-15 con la feature 17 (`statement-encoding-guard`), después de
> que pasara de verdad.

**Al editar el fichero para meterle la línea `iban;`, guárdalo en UTF-8.** El Bloc
de notas en modo ANSI y Excel guardan en **cp1252** sin avisar, y ahí la `Ó` deja
de ser `c3 93` para ser un solo byte `d3` que no es UTF-8 válido.

- En el Bloc de notas: *Guardar como → Codificación: **UTF-8***.
- En Excel: *Guardar como → **CSV UTF-8** (delimitado por comas)* (ojo también al
  separador: el parser espera `;`).

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
comparte. Hoy la usa el parser del extracto `.csv` de MyInvestor
([`myinvestor.statement.parser.ts`](../src/modules/myinvestor/myinvestor.statement.parser.ts));
el `.xlsx` de Bankinter no la necesita (no es texto plano) y los `.json` de producto
se escriben aparte. **Al dar de alta un banco cuyo fichero sea texto, su parser
descodifica con `decodeUtf8Strict`, no con `toString('utf8')`.**

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
