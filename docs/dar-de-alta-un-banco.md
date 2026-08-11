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
