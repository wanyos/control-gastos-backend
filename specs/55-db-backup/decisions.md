# Decisiones — F55 `db-backup`

> **Esto es lo único que necesitas leer para aprobar.** Los otros tres archivos
> (`requirements` / `design` / `tasks`) son material del implementer y del reviewer.
> Si algo de aquí no te convence, dilo y se cambia ahí; no hace falta que los abras.

**Qué hace:** dos comandos de terminal. `pnpm run db:backup` saca una copia completa de tu base de datos y la sube a tu carpeta `backup-control-gastos` de Drive. `pnpm run db:restore` restaura una de esas copias en la base que le digas. **No toca** la API, la importación, el arranque del servidor ni el modelo de datos; no hay migración ni dependencia nueva.

Lo que digo del código y de los comandos lo leí o lo ejecuté el 2026-10-02. Lo que no pude comprobar está en 📌.

---

## 🔴 Confirma o corrige (6)

| # | Decisión (mía; tú la delegaste o no la dijiste) | Alternativa si no te gusta |
|---|---|---|
| 1 | **La carpeta se encuentra por su identificador, que pegas una vez en `.env`** (`GOOGLE_DRIVE_BACKUP_FOLDER_ID`; vale la dirección entera de la carpeta). Si falta, el servidor arranca igual; solo fallan los dos comandos, diciendo qué falta. | Buscarla por el nombre `backup-control-gastos`: sin variable, pero si hay dos carpetas con ese nombre, una en la papelera o la renombras, el comando no sabe cuál es. |
| 2 | **Para restaurar sobre una base que ya tiene tablas (la tuya) hay que escribir su nombre en el terminal cuando el comando lo pide.** No hay opción en la línea de comandos que lo sustituya, y si quien lanza el comando no es un terminal (un test, un agente) ni pregunta: se niega. | Una opción `--confirm=gastos`: más cómodo, pero un agente o un script la pueden pasar. |
| 3 | **Al confirmar, lo que había no se borra:** tu base queda guardada como `gastos_before_restore_<fecha y hora>` y la copia ocupa el nombre `gastos`. La copia se restaura primero aparte; si falla, tu base ni se entera. La antigua la borras tú cuando quieras. | Borrar lo que había: no queda nada que limpiar, pero una restauración equivocada no tiene vuelta atrás. |
| 4 | **Las copias antiguas no se borran nunca desde el código.** Cada copia es un archivo más en la carpeta; las que sobren las borras tú en Drive. | Conservar solo las N últimas: la carpeta no crece, pero el backend pasaría a borrar archivos de tu Drive. |
| 5 | **La copia se elige por el nombre exacto del archivo**, y la base destino es obligatoria: `pnpm run db:restore <archivo> <base>`. Sin argumentos, el comando lista las copias que hay (nombre, tamaño, fecha), de la más reciente a la más antigua. Si la base destino no existe, la crea. | Restaurar «la más reciente» si no dices cuál: un argumento menos, pero restaurarías una copia sin haberla elegido. |
| 6 | **La copia sube a Drive sin cifrar**, igual que los archivos de banco que ya tienes allí. Lleva todas las tablas. | Cifrarla con una contraseña: quien entre en tu Drive no la lee, pero tendrías que guardar esa contraseña en otro sitio, y sin ella la copia no sirve. |

## ✅ Ya las cerraste tú (6)

- **La copia va a Google Drive, a una carpeta `backup-control-gastos` que creas tú.**
- **Se hace a mano con `pnpm run db:backup`:** ni al importar ni con temporizador.
- **Son comandos de terminal:** ninguna ruta nueva en la API.
- **La copia no se queda en tu ordenador ni en el repositorio.** Ni siquiera hay archivo intermedio: pasa por la memoria del programa.
- **Ningún test ni ningún agente restaura sobre tu base de verdad.**
- **La feature incluye restaurar y su prueba.**

## 🧪 Cómo se comprobará que está hecho

> Los `checks` de `feature_list.json`: se ejecutan al cerrar y, si uno falla, la
> feature no se cierra. Si falta un caso, es aquí donde se pide.

| Tu frase de «cómo sé que está bien» | Se comprueba ejecutando |
|---|---|
| Al lanzar `db:backup` aparece un archivo nuevo con fecha y hora en el nombre, y el comando dice su nombre y su tamaño | Dos tests: uno saca la copia de una base de pruebas y la sube a un Drive simulado, y mira nombre y contenido; otro mira lo que imprime |
| Lanzarlo otra vez crea otro archivo y no borra ni sustituye los anteriores | Un test con dos copias seguidas, y otro que falla si el código le pide a Drive borrar, mover o renombrar algo |
| Si la carpeta no existe o no se puede subir, falla con un mensaje claro y no dice que la copia está hecha | Tres tests: falta la variable, la carpeta no existe, la subida falla |
| Puedo restaurar una copia en una base vacía y quedan las mismas tablas con las mismas filas | Un test que copia una base de pruebas con filas inventadas, la restaura en otra vacía y compara tabla a tabla |
| El comando de restaurar no pisa mi base sin que yo lo confirme | Un test que restaura sobre una base de pruebas con tablas sin escribir su nombre (o escribiendo otro) y comprueba que no cambió; y otro que comprueba que sin terminal ni pregunta |
| Hay un documento paso a paso | Un test que lee `docs/database-backup.md` y busca los dos comandos y sus cinco apartados |
| _(añadido, punto 🔴 3)_ | Un test que confirma y comprueba que la base anterior sigue entera con el otro nombre |
| _(añadido, tus «no quiero»)_ | Dos tests sobre el código: nada de la aplicación importa el código de la copia ni hay ruta, y ese código no escribe archivos |
| **Que funciona con tu Drive y tu base de verdad** | — ningún comando: no se puede probar sin tocar tu Drive. Es tu prueba (ver 📌) |

## ⚙️ Técnicas — decididas, no necesitan tu visto bueno (7)

1. **La copia se saca con el `pg_dump` que trae el contenedor** (`docker exec gastos-postgres pg_dump`), en su formato comprimido. En tu Windows no hay `pg_dump` disponible; lo comprobé.
   ⚠️ *Efecto:* los dos comandos necesitan Docker en marcha y solo sirven mientras la base sea ese contenedor. El día que la base viva en otro sitio hay que revisarlos.
2. **Nombre del archivo:** `control-gastos-2026-10-02-183045.dump`, con la hora de tu ordenador.
3. **Tras subir, se compara el tamaño que Drive dice haber guardado con el enviado;** si no coinciden, el comando falla.
4. **El comando de restaurar imprime, al acabar, las filas de cada tabla** de la base restaurada.
5. **Si restauras sobre tu base con el servidor arrancado, el comando falla y te dice que lo pares;** tu base queda como estaba.
6. **Los tests usan el PostgreSQL de verdad del contenedor**, sobre las bases desechables de la suite, y un Drive simulado en memoria. Probé hoy la ida y vuelta con una base de pruebas: mismas tablas y mismas filas.
   ⚠️ *Efecto:* la suite tardará unos segundos más; el implementer dirá cuántos.
7. **ADR-034 nuevo** con todo esto, y el cabo suelto 6 de `docs/roadmap.md` cerrado.

## 📌 Consecuencias que te tocan a ti (no son código)

- **Crear la carpeta `backup-control-gastos` en «Mi unidad», FUERA de `notas-banco/`.** Dentro, la importación la tomaría por un banco. No he comprobado si ya existe: habría que listar tu Drive.
- **Copiar su dirección del navegador a `.env`:** `GOOGLE_DRIVE_BACKUP_FOLDER_ID=<dirección o identificador>`.
- **La prueba real, al cerrar la feature** (nadie más la puede hacer): `pnpm run db:backup` y mirar que el archivo está en Drive; `pnpm run db:restore` para verlo en la lista; `pnpm run db:restore <archivo> gastos_restore_check` y comparar las filas que imprime con las de tu base; borrar esa base de comprobación con el comando que traerá el documento.
- **No he comprobado que tu acceso a Drive pueda escribir fuera de `notas-banco/`.** Se pidió con permiso sobre todo el Drive, así que debería; se verá en la primera copia real.
- **El `.env` no va en la copia.** Si se rompe el disco, las credenciales de Drive hay que volver a sacarlas.
- **Borrar a mano** las copias antiguas en Drive y las bases `gastos_before_restore_…` que dejen tus restauraciones.

## ⚠️ Incoherencias conocidas que se heredan

- **El documento se llamará `docs/database-backup.md`** (los nombres de archivo van en inglés desde el 2026-07-11), aunque `dar-de-alta-un-banco.md` y `archivos-por-banco.md` sigan en español. Por dentro va en español.
