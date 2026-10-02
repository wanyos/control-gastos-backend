# Decisiones — F52 `remove-var`

> **Esto es lo único que necesitas leer para aprobar.** Los otros tres archivos
> (`requirements` / `design` / `tasks`) son material del implementer y del reviewer.
> Si algo de aquí no te convence, dilo y se cambia ahí; no hace falta que los abras.

**Qué hace:** el backend deja de usar la carpeta `var/`. `POST /api/import` sigue descargando de Drive, leyendo, guardando en la base y moviendo a `procesados/`, pero ya no deja una copia en tu disco. Desaparecen las ocho rutas que solo trabajaban con esa copia. **No toca** ningún parser, ni cómo se guardan los datos, ni lo que devuelven `POST /api/import` y `GET /api/ingestion/pending`. No hay migración.

Lo que digo del código de hoy lo leí o lo ejecuté el 2026-10-02.

---

## 🔴 Confirma o corrige (5)

| # | Decisión (mía; tú la delegaste o no la dijiste) | Alternativa si no te gusta |
|---|---|---|
| 1 | **Para probar un parser nuevo con tu archivo real habrá un comando de terminal:** `pnpm run parse-file <banco> <ruta-del-archivo>`. Lee el archivo de donde lo tengas en tu disco, lo pasa por el parser de ese banco y enseña solo recuentos y forma (cuántos movimientos, qué filas no se leyeron, si trae IBAN y saldo, primera y última fecha). No guarda nada, no toca la base ni Drive, y no imprime importes ni conceptos. | No hacer nada: la prueba sería la primera importación de verdad. Un parser que lee mal sin dar error dejaría datos erróneos en tu base y el archivo ya movido a `procesados/`. |
| 2 | **La comprobación de la feature 33 se quita entera** (la que compara `var/` antes y después de la suite), con su archivo [`src/lib/test-var.ts`](../../src/lib/test-var.ts). En su lugar, un guardián nuevo en `src/architecture.test.ts` pone la suite roja si algún archivo de código vuelve a nombrar `var/`. | Mantenerla hasta que borres la carpeta: seguiría habiendo código que nombra `var/`, contra tu frase «no queda ninguna referencia». |
| 3 | **`.gitignore` se queda con una sola línea, `var/`, y no se quita.** Hoy tiene tres. Tu carpeta sigue en el disco con 72 archivos hasta que la borres; sin esa línea, git los ofrecería para versionar. | Quitar las tres: `.gitignore` queda limpio, pero hasta que borres la carpeta un `git add .` metería tus archivos de banco. |
| 4 | **En [`docs/vocabulary.md`](../../docs/vocabulary.md) se quita «y la carpeta `var/`» de las definiciones de «guardián» y «red».** El significado que aprobaste no cambia; solo deja de nombrar una carpeta que ya no se vigila. | No tocarlo: las dos definiciones seguirán nombrando `var/` hasta que las edites tú. |
| 5 | **En el contrato de la API, las secciones «Parser de `<banco>`» se quedan, sin su ruta.** Describen qué lee cada parser y por qué deja una fila sin leer, que es lo que aplica `POST /api/import`. Se les quita la subsección de la ruta y lo del volcado a disco, y pasan a titularse «Qué lee el parser de `<banco>`». | Borrarlas enteras: contrato más corto, pero el contrato deja de decir qué lee cada parser y con qué motivo deja una fila sin leer. |

## ✅ Ya las cerraste tú (6)

- **Se quita `var/` entera,** no solo las rutas.
- **Las ocho rutas responden 404:** las seis `POST /api/parser/<banco>`, `POST /api/import/local` y `POST /api/ingestion/process`.
- **No hay un flujo nuevo para reimportar desde `procesados/`:** si hace falta, devuelves el archivo a mano a la carpeta del año en Drive.
- **No se tocan los parsers ni el guardado en la base.**
- **Ningún agente borra tu carpeta `var/`:** la borras tú al cerrar.
- **`GET /api/ingestion/pending` y lo que devuelve `POST /api/import` no cambian.**

## 🧪 Cómo se comprobará que está hecho

> Los `checks` de `feature_list.json`: se ejecutan al cerrar y, si uno falla, la
> feature no se cierra. Si falta un caso, es aquí donde se pide.

| Tu frase de «cómo sé que está bien» | Se comprueba ejecutando |
|---|---|
| `POST /api/import` importa igual que hoy y no escribe nada en `var/` | Los tests del importador que ya existen, sin cambiar lo que afirman, y un test nuevo que falla si el importador usa el disco para algo |
| Las ocho rutas responden 404 | Un test nuevo que llama a las ocho en la aplicación real y espera 404 en cada una |
| En el código de la aplicación no queda ninguna referencia a `var/` | El guardián nuevo del punto 🔴 2: recorre el código, los scripts y la configuración de la suite |
| El contrato ya no describe las ocho rutas, y dice de forma visible que se han quitado | Un test nuevo que lee `docs/api-contract.md`: las ocho solo aparecen dentro de la sección «Rutas retiradas», que va antes de «Errores» |
| `GET /api/ingestion/pending` sigue funcionando igual | Sus tests de hoy, sin tocar |
| La suite entera pasa con la carpeta `var/` borrada | La suite entera, más el guardián que prueba que nada nombra ni lee esa carpeta. **Borrarla de verdad no lo hace ningún comando:** la prueba literal es tuya (ver 📌) |
| _(añadido, punto 🔴 1)_ | Los tests del comando `parse-file` con archivos inventados |

## ⚙️ Técnicas — decididas, no necesitan tu visto bueno (7)

1. **Qué queda de cada módulo de banco:** su parser, sus lectores de formato, sus fixtures y sus tests de parser. Se borran su archivo de ruta y, en Bankinter, N26, Openbank y Revolut, su `*.service.ts`, que solo recorría la copia en disco. En MyInvestor y Trade Republic ese archivo se queda con la única función que usa el importador.
2. **Los tests que hoy solo pasan por las rutas quitadas no se pierden si afirman algo del importador:** se reescriben para entrar por `POST /api/import` con un Drive simulado (Revolut de punta a punta, los productos de MyInvestor, la categorización dentro de una importación y dos casos de traspasos). El resto se borra.
   ⚠️ *Efecto:* el número de tests baja de 1385; el implementer dirá la cifra.
3. **Desaparece el código de error `LOCAL_COPY_NOT_FOUND`,** que solo devolvía `POST /api/import/local`.
4. **El contrato lleva una sección «Rutas retiradas» antes de «Errores»** con las ocho rutas, la fecha y qué se usa ahora; y la misma nota en `progress/current.md`.
5. **ADR:** uno nuevo (ADR-032) con esta decisión; el ADR-029 (la comprobación de la feature 33) queda «superada por ADR-032»; otros diez llevan encima la línea «Revisado el 2026-10-02 por la feature 52». Ninguno se reescribe.
6. **`scripts/myinvestor-xlsx-a-csv.mjs` no se toca:** no usa `var/`, trabaja con las rutas que le pasas.
7. **Se corrigen los documentos que describen `var/` o las rutas como algo de hoy:** `README.md`, el contrato, `verification.md`, `conventions.md`, `dar-de-alta-un-banco.md`, `archivos-por-banco.md`, `data-model.md`, los dos de archivos de producto y `roadmap.md` (cabos 14 y 16 cerrados).

## 📌 Consecuencias que te tocan a ti (no son código)

- **Borrar `var/` cuando la feature esté cerrada.** Hoy tiene 65 archivos en `var/drive-read`, 7 en `var/parsed` y `var/backups` vacía (conté nombres, no abrí ninguno).
- **Antes de borrarla, mira que no haya ahí ningún archivo que no esté en Drive.** No lo he comprobado: haría falta listar tu Drive.
- **Después de borrarla, pasa `./init.sh` una vez:** es la prueba literal de tu frase «la suite entera pasa con la carpeta `var/` borrada».
- **Si un archivo ya está en `procesados/` y quieres volver a importarlo,** lo devuelves a mano a la carpeta del año en Drive.
- **El frontend no necesita cambios:** busqué en `../gastos-frontend/src` y de todo esto solo llama a `GET /api/ingestion/pending`.

## ⚠️ Incoherencias conocidas que se heredan

- **Los títulos de los ADR-009, 010, 017, 025, 026 y 029 seguirán nombrando `var/` o las rutas:** un ADR no se reescribe; llevan encima la línea de revisión.
- **Las features cerradas de `feature_list.json`, los specs anteriores y `progress/` siguen hablando de `var/` y de las rutas:** son el histórico y no se tocan.
