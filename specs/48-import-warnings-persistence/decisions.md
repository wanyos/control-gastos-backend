# Decisiones — F48 `import-warnings-persistence`

> **Esto es lo único que necesitas leer para aprobar.** Los otros tres archivos
> (`requirements` / `design` / `tasks`) son material del implementer y del reviewer.
> Si algo de aquí no te convence, dilo y se cambia ahí; no hace falta que los abras.

**Qué hace:** guarda en la base de datos los avisos que hoy mueren al cerrar el
modal —las filas que el parser no supo leer y los descuadres de saldo—, te deja
pedirlos cuando quieras y dar por revisado un descuadre con una nota. **No toca**
cómo se importa: un archivo con filas ilegibles entra y se mueve a `procesados/`
exactamente igual que hoy, y ningún movimiento ya guardado cambia. Lleva **una
migración** y **dos rutas nuevas**, sin pantalla todavía.

---

## 🔴 Confirma o corrige (6)

| # | Decisión | Alternativa si no te gusta |
|---|---|---|
| 1 | **Dos tablas separadas** (una de filas ilegibles, otra de descuadres) y **dos rutas**: `GET /api/import/warnings` devuelve las dos listas pendientes con sus contadores, y `PATCH /api/import/warnings/balance-mismatches/:id` marca un descuadre revisado con nota. Cada aviso llega con **los mismos campos que ya ves en el modal**, más su id y su estado. | Una sola tabla y una sola lista mezclada con una etiqueta de tipo: las dos cosas no comparten ni un dato, así que la mitad de cada fila quedaría vacía y la regla de "no duplicar" dejaría de poder escribirse como un índice. |
| 2 | **Dos avisos son el mismo cuando coinciden el archivo del que salen** (banco, año, nombre) **y el contenido del aviso**: el número de fila, en una fila ilegible; la cuenta, la fecha, la comprobación y los dos importes comparados, en un descuadre. Reimportar el mismo archivo **actualiza**, nunca duplica. | Guardar una huella opaca calculada del aviso: el mismo efecto, pero al mirar la tabla no se entiende por qué dos avisos son el mismo. |
| 3 | **Un descuadre se queda hasta que tú lo marques**, aunque una importación posterior ya cuadre. Lo guardado es un hecho fechado ("el día X, en el archivo Y, estos dos números no cuadraban"), con los importes congelados: no se recalcula nunca, así que no puede quedarse mintiendo. | Que desaparezca solo cuando la comprobación ya no lo encuentre: te ahorra el clic, pero una señal de seguridad se borraría sola sin que nadie la haya llegado a ver. |
| 4 | **De una fila ilegible NO se puede decir "revisada" todavía** (lo dejaste para el cabo suelto 23): salen siempre en la lista hasta que exista esa feature. | Darle ya el mismo marcado que al descuadre: una ruta más y un estado más ahora, en algo que dijiste que era otra feature. |
| 5 | **Solo se guardan los avisos de un archivo que entró.** Un archivo que falla entero no deja ninguno (no se movió: se volverá a intentar). Y si fallara el guardado de los avisos, ese archivo sale como fallido y **no** se mueve, en vez de importarse perdiendo el aviso en silencio. | Guardar también los avisos de los archivos fallidos: la lista se llenaría de avisos que se repiten solos en cada reintento. |
| 6 | **Propuesta de palabra** (no la doy por aprobada): llamar **«aviso»** a las dos cosas juntas —fila ilegible y descuadre— y `warning` en el código y en la ruta. Abarca solo esas dos; **no** los traspasos dudosos ni los choques de reglas. | Dices otra palabra, o ninguna: sin ella se describen las dos cosas enteras cada vez y las rutas se llaman de otro modo. |

## ✅ Ya las cerraste tú (5)

- **El archivo con filas ilegibles sigue entrando y moviéndose a `procesados/`**:
  se comporta exactamente como hoy.
- **No se guarda el histórico de cada importación**, solo los avisos sin resolver.
- **Arreglar o borrar una fila ilegible es otra feature** (cabo suelto 23).
- **Los traspasos dudosos quedan fuera** de esta feature.
- **No se toca ningún movimiento guardado**: ni importe, ni fecha, ni descripción.

## ⚙️ Técnicas — decididas, no necesitan tu visto bueno (5)

1. **Se engancha en el núcleo compartido por las dos entradas** (`POST /api/import`
   y `POST /api/import/local`): una sola línea vale para las dos.
2. **Los avisos de un archivo se escriben en una transacción**: entran todos o
   ninguno.
3. **Reimportar no resucita un descuadre que marcaste revisado**: la actualización
   no toca ni el estado ni tu nota.
4. **Ningún código de error nuevo**: `404` si el id no existe, `400` si el cuerpo
   está mal, los de siempre.
5. **Marcar revisado es reversible** (puedes devolverlo a pendiente), igual que el
   "dar por revisado" de un movimiento.

## 📌 Consecuencias que te tocan a ti (no son código)

- **La migración corre sola en el despliegue** (`prisma migrate`); no tocas
  ninguna base a mano.
- **Sin pantalla: se prueba llamando a las dos rutas a mano** (`curl`) hasta que
  el frontend las use.
- **El frontend tendrá que hacer su parte en otra sesión**, después de esta:
  aquí solo se actualiza `docs/api-contract.md`, que es contra lo que él
  construye (regla de oro del workspace: primero backend, luego frontend).
- **Los descuadres que marques revisados se quedan guardados** (no salen en la
  lista): es lo que impide que reaparezcan al reimportar el mismo archivo.

## ⚠️ Incoherencias conocidas que se heredan

- **Dos descuadres idénticos del mismo archivo, la misma cuenta y el mismo día**
  (mismos dos importes comparados) se guardan como **uno**. Es el precio de la
  decisión 2; si algún día pasa de verdad, se afina la clave.
- **La consulta no pagina**: devuelve todo lo pendiente. Si la lista se hace
  larga —sobre todo por las filas ilegibles, que hoy no se pueden cerrar—, se
  resuelve en la feature del cabo suelto 23.
- **La decisión 3 del ADR-030 ("el descuadre no se persiste") queda superada**
  por esta feature; se anota allí y se escribe el ADR nuevo que la sustituye.
