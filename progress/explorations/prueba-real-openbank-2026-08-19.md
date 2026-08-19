# Prueba real de Openbank — 2026-08-19

> 🔒 **Ni un dato real en este archivo.** El fichero de Openbank trae el **nombre del
> titular**, nombres de terceros en los conceptos, su CCC, su IBAN y sus importes.
> Aquí solo hay **recuentos y forma**. Los saldos e importes concretos **no se
> transcriben**, ni siquiera los que se vieron por consola: ese fue justo el error que
> la F17 tuvo que sanear a posteriori.

**Qué es esto:** la prueba de punta a punta de la F19, con el fichero de verdad, contra
Drive y contra la base de datos del humano. **No es un test** y no queda ejecutándose:
los tests automáticos usan fixtures sintéticos y no tocan ni la red ni sus datos. Esta
pasada es la que comprueba lo que el banco hace de verdad, no lo que imaginamos.

## Pasada 1 — el parser, contra la copia local (antes de que él tocara el fichero)

`POST /api/parser/openbank` (solo parsea y vuelca a `var/parsed/`, no toca la base de
datos), sobre la copia bajada de Drive el 2026-08-17:

| Comprobación | Resultado |
|---|---|
| Ficheros parseados / fallidos | **1 / 0** |
| Movimientos | **200** |
| Filas sin parsear | **0** |
| Rango de fechas | **2024-08-28 → 2026-08-17** (33 de 2024, 92 de 2025, 75 de 2026) |
| Saldo de la cuenta | leído del preámbulo ✅ |
| IBAN | `null` — **el fichero aún no llevaba la línea** |
| Conceptos vacíos | **0** |
| Conceptos con `U+FFFD` | **0** (5 conceptos llevan acentos y salen intactos) |
| `balance` por línea / divisa | **null / vacía** en los 200, como se decidió |
| Tipos | 158 gastos, 42 ingresos; ningún importe a cero |
| `daySequence` | sin un solo par (fecha, secuencia) repetido; hasta 4 movimientos en un día |

✅ **El histórico entero entra y el cp1252 se lee bien.** Es lo que la feature prometía.

## Pasada 2 — el camino completo, y el fallo

El humano añadió la línea del IBAN y subió el fichero. `POST /api/import`:

- `importedCount: 0`, `failedCount: 1`, `skippedCount: 7` (los 5 JSON de MyInvestor,
  Revolut y Trade Republic, que no tienen parser: esperado).
- Openbank: **`VALIDATION_ERROR` — «no se encuentra la cabecera de la tabla de Openbank:
  el archivo no es un extracto de este banco»**.
- **Nada se persistió** y el fichero **no se movió** a `procesados/`. Estado de la base
  de datos idéntico al de antes (2 cuentas, 215 movimientos): no hubo nada que deshacer.

### Diagnóstico: el fichero se rompió al guardarlo, y el mensaje mentía

Medido sobre el fichero descargado de Drive:

- Decodifica **limpiamente como UTF-8** (el original del banco es cp1252, y un cp1252
  con acentos **no** es UTF-8 válido: la prueba de que se reguardó).
- Contiene **8 `U+FFFD`** y **ningún otro carácter no-ASCII**: los 8 acentuados del
  fichero se destruyeron **de forma irreversible** al guardar.
- El `<meta>` **sigue declarando `iso-8859-1`**.

Es decir: **el fichero declara una codificación y trae otra.** El parser hizo lo
correcto —leerlo como declara— y la cabecera le llegó como `Fecha Operaci<U+FFFD>n`, de
ahí el fallo. **Falló ruidosamente, que es lo que se quería**: no entraron 200 conceptos
rotos en silencio. Pero el mensaje **manda al sitio equivocado**: sí era un extracto de
ese banco.

**La causa, en sus palabras:** «abrí el archivo con visual studio, solo le di a guardar
después de escribir la línea del iban». VS Code adivinó UTF-8 al abrir un fichero
cp1252 y lo reguardó en UTF-8. No hizo nada raro: le dio a guardar. **El runbook decía
«Bloc de notas, no Excel», que se quedó corto** — el guardado por defecto de cualquier
editor moderno es UTF-8.

### Lo que sí quedó verificado de su línea del IBAN

Sobre una **copia de prueba local** (con las tildes repuestas a mano, solo para ejercitar
el camino del parser; la copia se restauró después):

- **IBAN leído correctamente** del comentario HTML → la línea que él escribió está bien.
- **200 movimientos, 0 sin parsear**, saldo leído del preámbulo.

O sea: **lo único que falta es el guardado del fichero.** El formato de la línea, la
posición y el parser están bien.

## Lo que sale de aquí

- 🟠 **Tarea del humano:** volver a descargar el extracto del banco (las tildes del
  fichero actual están perdidas), añadir la línea del IBAN y guardarlo con la
  codificación **Western/Windows-1252**, no UTF-8.
- ✅ **Feature 22 `encoding-mismatch-guard`**, abierta el mismo día a petición suya: que
  el error diga que el fichero se reguardó en otra codificación, y que si ya trae
  `U+FFFD` mande a redescargarlo; más el runbook contado para **Visual Studio Code**,
  que es el editor que usa.
- ⚪ **Anotado del leader, no es de la F22:** al diagnosticar, el leader dejó la copia
  local de `var/drive-read/` en cero bytes con un script propio (un `open(…, 'wb')` que
  truncó antes de fallar el `encode`). Se restauró del respaldo hecho un minuto antes y
  **no se perdió nada** —esa copia se rebaja de Drive en cada import—, pero conviene
  recordarlo: `var/drive-read/` es un espejo, no un original, y aun así **no se toca**.

---

## Pasada 3 — el camino entero, en verde (mismo día, tras la F22)

El humano volvió a descargar el extracto, lo reabrió en VS Code con **`Reopen with
Encoding` → `Western (ISO 8859-1)`** —su VS Code **no ofrecía ninguna entrada
«Windows 1252»**, solo las `ISO`, y el runbook se corrigió por eso—, escribió la línea
del IBAN y lo guardó sin cambiar de codificación. `POST /api/import`:

| Comprobación | Resultado |
|---|---|
| Importados / duplicados / sin parsear / fallidos | **201 / 0 / 0 / 0** |
| Ignorados | 7 (los 5 JSON de MyInvestor, Revolut y Trade Republic: sin parser, esperado) |
| Cuenta | **creada**, tipo `checking`, alias por defecto |
| Fichero en Drive | **movido a `procesados/`** ✅ |
| Rango de fechas | **2024-08-28 → 2026-08-19** (33 de 2024, 92 de 2025, 76 de 2026) |
| Conceptos vacíos | **0** |
| Conceptos con `U+FFFD` | **0** |
| Mojibake inverso (`Ã`, `Â`) | **0** — el guardado fue limpio en las dos direcciones |
| Divisa guardada | `EUR` en los 201 |
| `balanceAfter` | **null** en los 201, como se decidió (ADR-013 intacto) |
| Estado / origen | `pending_review` / `imported` en los 201 |

Base de datos: de **2 cuentas y 215 movimientos** a **3 cuentas y 416**.

### Dos observaciones, ninguna es un fallo

1. **La divisa vacía del parser se convierte en `EUR` al persistir**, igual que en los
   demás bancos. Es la confirmación de que el punto 🔴 6 del spec estaba bien resuelto:
   el parser no inventa lo que el fichero no trae, y el euro lo pone la capa que sí
   sabe que la cuenta es en euros.
2. **Tres movimientos idénticos el mismo día** (misma fecha, mismo importe, mismo
   concepto) entran como tres, distinguidos por `daySequence` 2, 3 y 4. Ni se
   colapsaron ni se marcaron como duplicados: es justo para lo que existe
   `daySequence` (índice del modelo de datos, F8).

## Balance de la prueba real

**La F19 salió a producción con 628 tests en verde y la prueba real encontró dos cosas
que ningún test podía ver**: la fuga de importes reales al fixture (la cazó el reviewer,
no la suite: el guardián de la F14 **no lee `.xls`**) y el mensaje mentiroso ante un
fichero reguardado (**F22**, abierta y cerrada el mismo día). Es el mismo patrón que en
N26 el 2026-08-18. La conclusión, ya por segunda vez: **la prueba real con el fichero de
verdad es lo que más defectos saca por minuto invertido**, y no sustituye a los tests
sino al revés.
