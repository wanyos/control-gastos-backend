# Qué archivo necesita cada banco — tabla de consulta rápida

> **Para qué sirve esta página:** para no tener que acordarse. Es lo que hay que
> mirar **antes de subir los archivos del mes a Drive**: qué formato pide cada
> banco y qué hay que escribir a mano en cada uno.
>
> ⚠️ **Esta página no es la fuente de verdad de ningún formato.** Es un índice.
> El detalle de cada uno vive en su documento, enlazado en la última columna; si
> los dos se contradicen, manda el documento del formato.
>
> **Última revisión:** 2026-09-15 (fila de Revolut, feature 46).

## Dónde van

```
notas-banco/            ← la raíz (GOOGLE_DRIVE_ROOT_FOLDER_ID)
  <banco>/              ← la creas tú, una vez
    <año>/              ← lo crea el backend solo
      procesados/       ← lo crea el backend solo
```

Las **plantillas** de los `.json` que escribes a mano viven en una carpeta
**hermana** de `notas-banco/`, nunca dentro: todo lo que cuelga de `notas-banco/`
se toma por un banco.

## La tabla

| Banco | Archivo | Qué es de verdad | Qué escribes tú a mano | Codificación | Detalle |
|---|---|---|---|---|---|
| **Bankinter** | `.xlsx` | Excel de verdad | **nada** — trae IBAN y saldo por línea | — | — |
| **MyInvestor · extracto** | `.csv` separado por **`;`**, sin comillas | CSV español: coma decimal, punto de miles | `iban;…` y `saldo;…` encima de la fila de cabecera | **UTF-8** | [runbook](dar-de-alta-un-banco.md) |
| **MyInvestor · productos** | `.json`, **uno por producto** | lo escribes tú entero | todo: plantilla A (`fund`, `etf`, `managed_portfolio`) o B (`deposit`) | UTF-8 | [formato](myinvestor-product-files.md) |
| **N26** | `.csv` separado por **`,`** y **entrecomillado** | export del banco, punto decimal | `iban;…` y `Saldo;…` — **con `;`**, aunque el fichero use comas | **UTF-8** | [runbook](dar-de-alta-un-banco.md) |
| **Openbank** | se llama `.xls` pero **es HTML** | una tabla HTML, no un Excel | solo el IBAN, en un **comentario HTML de la primera línea**: `<!-- iban;ES… -->`. El saldo lo trae el banco | **cp1252** 🔴 | [runbook](dar-de-alta-un-banco.md) |
| **Trade Republic** | `.json`, **uno por abono de intereses** (mensual) | lo escribes tú entero; su `.pdf` **se ignora** | todo: plantilla `savings_account` | UTF-8 | [formato](trade-republic-product-files.md) |
| **Revolut** | `.csv` separado por **`,`** (comillas solo si un campo las necesita) | export del banco, punto decimal; trae el **saldo en cada línea** | solo `iban;…` encima de la cabecera — **con `;`**, una vez. **Nada de `saldo;`**: el archivo ya lo trae. Las filas `DEVUELTO` no entran | **UTF-8** | [runbook](dar-de-alta-un-banco.md) · feature 46 |

## Las seis que se olvidan

1. 🔴 **La línea `saldo;` basta UNA vez por cuenta**, no todos los meses (desde la
   feature 31). Y es el saldo **al último movimiento de ESE archivo**, no el del
   día en que te sientas a escribirla: si escribes el de hoy en un extracto que
   termina hace dos semanas, esas dos semanas se suman **dos veces**.
2. **El IBAN también es una sola vez por cuenta.** Los archivos siguientes ya no
   lo necesitan. Con espacios o sin ellos, en mayúsculas o minúsculas, da igual —
   pero un dígito mal tecleado rechaza el archivo entero (`INVALID_IBAN`).
3. **Las líneas tuyas van siempre con `;`**, en todos los bancos. `iban: …` con
   dos puntos no vale y no va a valer.
4. **Borra la fila `Saldo` del FINAL** del `.csv` de MyInvestor: el backend no la
   lee y acaba en `unparsedRows`.
5. 🔴 **El de Openbank no se abre con Excel nunca**, y en Visual Studio Code hay
   que hacer `Reopen with Encoding → Western (ISO 8859-1)` **antes de tocar
   nada**. Si ya se ven rombos `�`, ese archivo está perdido: se vuelve a
   descargar del banco.
6. **En los `.json`**: números sin comillas y con punto decimal, fechas
   `AAAA-MM-DD`, y **ni un marcador `<…>` sin sustituir** — se rechaza el archivo
   y se te dice el campo. Nombre recomendado: `<producto>-AAAA-MM-DD.json` y
   `cuenta-remunerada-AAAA-MM-DD.json`.

## Y una regla que no es de formato

🔴 **Cuando sustituyes un archivo roto, el viejo se borra en ese momento** — en
Drive (también dentro de `procesados/`) y en `var/drive-read/`. Un archivo roto
que se queda sale como `failed` en **cada** importación, para siempre, y
acostumbra a ver rojos que «son normales». Regla escrita el 2026-08-30, después
de tropezar con ella.
