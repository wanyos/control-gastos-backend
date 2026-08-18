# Prueba real del camino Drive → import con N26 (2026-08-18)

> Verificación del camino entero tras cerrar la F18, con el fichero real de N26 ya
> corregido por el humano en Drive. **No se ha tocado código.**
>
> 🔒 Este informe describe la **forma** del fichero, nunca su contenido: las líneas
> que se citan van con letras y dígitos enmascarados (`x` y `9`). Es la lección del
> informe del 2026-08-15, que llegó a versionar un IBAN real.

## Cómo se ejecutó

1. `docker compose ps` → `gastos-postgres` sano.
2. `pnpm run dev` → escuchando en `:3000`.
3. `GET /health/drive` → `{"status":"ok","drive":"up"}`.
4. `GET /api/ingestion/pending` → **10 pendientes, 5 bancos**.
5. `POST /api/ingestion/process` → **10 copiados, 0 fallidos**.
6. `POST /api/import` → 11 importados, 0 duplicados, 0 sin parsear,
   **1 fallido**, 8 saltados.

## ✅ Lo que sí funcionó

- **La carpeta ya es `n26` en minúsculas.** La copia local se escribe en
  `var/drive-read/n26/2026/`, así que el problema de Linux está cerrado.
- **Las dos líneas de preámbulo están bien escritas**, las dos con `;` como se
  decidió en la F18: `xxxx;xx99999999999999999999` (IBAN alemán, 22 caracteres) y
  `xxxxx;999,99`. La segunda es justo el caso de céntimos a la española que la
  review de la F18 arregló.
- **MyInvestor sigue entrando**: 11 movimientos, 0 duplicados, 0 `unparsedRows`,
  y la cuenta se reutiliza en vez de crear una nueva.
- **Openbank, Revolut y Trade Republic salen como `skipped`** con el motivo
  correcto («no hay parser para el banco …»), que es exactamente lo que abren
  las F19 y F20.

## 🔴 El fichero de N26 falla, y no es culpa del parser: lo ha reescrito Excel

```
"bank":"n26" … "status":"failed"
"code":"VALIDATION_ERROR"
"message":"N26 header row not found: not a recognizable statement"
```

El export de N26 es un CSV **de comas con comillas** — así se diagnosticó el
2026-08-17 y así se escribió el parser. El fichero que hay hoy en Drive **ya no
lo es**: cada línea está envuelta en **un solo campo entrecomillado**, con las
comillas de dentro duplicadas, y terminada en `;`. Enmascarado, la cabecera y una
fila cualquiera:

```
3 "xxxxxxx xxxx,""xxxxx xxxx"",""xxxxxxx xxxx"",…,""xxxx…";
4 "9999-99-99,9999-99-99,""xx xxxxxxxxx xxxxxxx x"",,xxxxxxxxxxx,,…,-9.99,9.99,xxx,9";
```

Eso es la firma de **abrir el fichero con Excel y volver a guardarlo** en un
Windows con el separador de listas en `;`: Excel lee la línea entera de comas
como **una sola celda** y, al escribir, la entrecomilla completa y la cierra con
su propio separador. Las 11 columnas del banco dejan de existir como columnas, así
que el buscador de cabecera no encuentra ni `Booking Date` ni la de importe, y el
parser rechaza el fichero. **Rechazarlo es lo correcto**: no hay nada que leer.

Las dos líneas del preámbulo se salvaron porque el humano las escribió después, o
porque Excel no supo qué hacer con ellas; el resto del fichero está perdido.

### Lo que hay que hacer (es del humano, no del backend)

1. **Volver a descargar el `.csv` de N26** de la app del banco, sin abrirlo.
2. **Añadir las dos líneas del preámbulo con un editor de texto plano**
   (Bloc de notas, VS Code), nunca con Excel ni con Hojas de cálculo:

   ```
   iban;<el IBAN de la cuenta>
   saldo;<el saldo>
   ```

3. Guardarlo **en UTF-8** y subirlo a `notas-banco/n26/2026/`.

Es el mismo aviso que ya lleva escrito el spec de Openbank («no vuelvas a guardar
el fichero con Excel»), y ahora está confirmado con un fallo real en otro banco.

## Candidatos que abre esta prueba (no se abren ahora)

1. 🟠 **El motivo del error no dice qué hacer.** «N26 header row not found: not a
   recognizable statement» es cierto pero inútil para quien tiene que arreglarlo.
   La doctrina del proyecto —el motivo debe bastar para arreglar el archivo, R77 y
   el mensaje de la coma decimal del 2026-08-15— pide nombrar el problema: si
   **todas** las líneas son un único campo entrecomillado, el mensaje debería decir
   que el fichero se ha guardado con Excel y que hay que volver a bajarlo. Es
   detectable con seguridad y sin ramificar el parser.
2. ⚪ **Los 5 `.json` de producto de MyInvestor salen `skipped`** de `/api/import`
   («extensión no soportada por el parser de myinvestor»). Es coherente —los
   productos no se persisten y entran por `POST /api/parser/myinvestor`— pero
   significa que **no hay un solo botón** que procese todo lo que hay en Drive.
   Merece una línea en la documentación o una decisión.

## Estado al cerrar la prueba

**El camino de N26 sigue SIN verificar de punta a punta.** Vuelve a estar en manos
del humano: en cuanto suba el fichero recién bajado del banco, se repite el paso 6
y se cierra.

---

# Segunda y tercera pasada — el camino entra entero (2026-08-18)

## Pasada 2: el fichero está sano, el preámbulo no

El humano volvió a bajar el `.csv` del banco y lo editó con VS Code. **El fichero
del banco quedó impecable**: CSV de comas con comillas, UTF-8 estricto, sin BOM,
208 líneas, la cabecera se reconoce a la primera. Pero las dos líneas suyas iban
con **dos puntos** en lugar de `;` y el IBAN **con espacios**:

```
xxxx: xx99 9999 9999 9999 9999 99
xxxxx: 999,99
```

`POST /api/import` → `MISSING_ACCOUNT_DATA`, con el motivo correcto y accionable
(«add a line "iban;<IBAN>" at the top of one of its files, once»). El parser corta
la etiqueta por el primer `;` o `,`
([`n26.statement.parser.ts:249`](../../src/modules/n26/n26.statement.parser.ts#L249)):
con `:` la etiqueta es la línea entera y no casa.

**Los espacios del IBAN no habrían dado error, y eso es lo preocupante:** nadie
normaliza el IBAN en todo el backend —se guarda literal, ver
[`import.service.ts:119`](../../src/modules/import/import.service.ts#L119) y
[`accounts.schema.ts:7`](../../src/modules/accounts/accounts.schema.ts#L7)—, así que
el mismo IBAN escrito con y sin espacios son **dos cuentas distintas**, en silencio.
Es un fallo latente de los tres bancos, no de N26. Candidato a feature (abajo).

## Pasada 3: 204 movimientos dentro, sin una sola fila perdida

Corregidas las dos líneas a `iban;<sin espacios>` y `saldo;<importe>`:

| | |
|---|---|
| `POST /api/import` | **204 importados · 0 duplicados · 0 sin parsear · 0 fallidos** |
| Cuenta | creada, `n26` / `checking`, IBAN alemán de 22 caracteres |
| Rango de fechas | 2026-01-02 a 2026-08-18, los ocho meses del export |
| Tipos | 194 gastos / 10 ingresos, por `deriveMovementTypeFromAmount` |
| Conceptos vacíos | **0** — el concepto compuesto del ADR-020 aguanta el fichero real |
| `balanceAfter` | `null` en los 204, como manda el ADR-013 |
| Divisa | `EUR` en los 204, tomada de la cabecera de la columna de importe |
| `valueDate` | presente en los 204 |
| `daySequence` | de 1 a 5, sin huecos |
| Carácter de sustitución `U+FFFD` | **0** — el fichero es UTF-8 de verdad |

Y el dato que la review de la F18 rescató, confirmado sobre el fichero real:
`POST /api/parser/n26` devuelve el **`accountBalance` con sus dos céntimos**, no
redondeado. Ese es exactamente el bug que se arregló y no ha vuelto.

**N26 queda cerrado: tercer banco del importador, verificado contra el fichero
real.** MyInvestor no se ha tocado y sus 11 movimientos siguen siendo los mismos
(la segunda ejecución los reportó como ya procesados, no como duplicados nuevos).

## Cabo suelto local

`var/drive-read/n26/2026/N26-2026-08-17.csv` —la copia local del fichero que Excel
reescribió— sigue en disco y falla en cada pasada del parser. En Drive ya no está.
**Borrarlo es cosa de una línea, pero es un borrado: lo decide el humano.**

## Candidato que deja esta prueba: normalizar el IBAN

Un IBAN escrito `XX00 1111 …` y el mismo escrito `XX001111…` crean **dos cuentas**.
No hay error, no hay aviso, y el humano escribe esa línea a mano en todos los
bancos que no la traen. Arreglo natural: un único normalizador (quitar espacios,
mayúsculas) en el sitio por el que pasan los tres bancos, más el mismo trato al
`POST /api/accounts`. Se puede juntar con aceptar `:` como separador del preámbulo
—es la segunda vez que el fichero se va por la forma de escribir esas dos líneas—,
aunque eso segundo es discutible: hoy falla fuerte y con un motivo accionable.
