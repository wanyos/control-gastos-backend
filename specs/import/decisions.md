# Decisiones — F12 `import`

> **Esto es lo único que necesitas leer para aprobar.** Los otros tres archivos
> (`requirements` / `design` / `tasks`) son material del implementer y del reviewer.
> Si algo de aquí no te convence, dilo y se cambia ahí; no hace falta que los abras.

**Qué hace:** conecta lo que ya existe. Baja de Drive los ficheros pendientes, los
parsea con el parser de su banco, **guarda los movimientos en la base de datos** y solo
entonces mueve el fichero a `procesados/`. **No** categoriza, **no** empareja traspasos,
**no** confirma nada y **no** guarda productos de inversión.

---

## 🔄 Cambios desde tu última lectura (2026-08-12)

- **Punto 🔴 nº 1 resuelto y cambiado de forma** — ahora el IBAN **sí** viene en el CSV de MyInvestor (línea `iban;ES…` del preámbulo, la pusiste tú): el parser de MyInvestor pasa a leerla y la cuenta se crea sola.
- **Se refuerza tu regla:** nunca, por ninguna vía, se crea una cuenta sin IBAN. Si falta, el error te pide **ponerlo una vez** en el fichero.
- **Punto nº 2 aprobado + añadido tuyo:** la respuesta dice también **cuántas** líneas fallaron por fichero, no solo cuáles.
- **Punto nº 3 aprobado + renombrado a inglés:** `ingesta/` → `ingestion/` y `/api/ingesta/*` → `/api/ingestion/*`. Cierra el cabo suelto nº 4.
- **Punto nº 4 aprobado sin cambios.** Requirements: de 17 a **20** (tres nuevos, ninguno retirado).

## 🔴 Confirma o corrige (0)

**Nada pendiente de tu visto bueno.** Las cuatro decisiones de la primera lectura están
cerradas: la nº 1 con tu IBAN en el fichero, la nº 2 y la nº 3 aprobadas con tus dos
añadidos, y la nº 4 tal cual.

## ✅ Ya las cerraste tú (8)

- **El fichero se mueve a `procesados/` cuando el dato está guardado**, no al descargarlo.
- **Importación parcial:** se guarda lo bueno, se reporta el resto **y se dice cuántas líneas fallaron**.
- **Los productos de inversión no se guardan aquí:** su regla de duplicado es la contraria.
- **Nada se crea ni se borra a mano por la API:** los movimientos siguen entrando solo por aquí.
- **El IBAN va en el fichero, una sola vez:** «un IBAN no cambia, es como un DNI». Basta con que aparezca en uno de los CSV de esa cuenta.
- **Ninguna cuenta sin IBAN, nunca:** si falta, no se importa y se te avisa de que lo pongas.
- **Endpoint nuevo `POST /api/import`**, y `POST /api/ingestion/process` deja de mover ficheros.
- **Un fichero que ningún parser sabe leer se reporta como «omitido»**, ni se importa ni se mueve.

## ⚙️ Técnicas — decididas, no necesitan tu visto bueno (8)

1. **El mapeo parser → base de datos ya estaba escrito** (`specs/data-model/design.md` §9): se reutiliza tal cual, no se rehace.
2. **Todo lo importado nace `origin=imported`, `status=pending_review`**, sin categoría, sin forma de pago y sin traspaso.
3. **Los duplicados los descarta la base de datos**, con el índice único que ya incluye `daySequence`; se cuentan y se te reportan, no se descartan en silencio.
4. **Cada fichero se guarda en una sola operación:** o entran todos sus movimientos buenos o no entra ninguno, y entonces el fichero se queda pendiente en Drive.
5. **El importador no sabe de bancos:** la lista de parsers se le inyecta al arrancar la app, así que añadir un banco no lo toca.
6. **Se sigue guardando la copia cruda local** (`var/drive-read/`) antes de parsear: es lo que te deja re-parsear sin volver a bajar nada.
7. **Si un fichero no trae IBAN pero su banco ya tiene una única cuenta**, se usa esa: es la que evita que tus CSV siguientes tengan que repetir el IBAN.
8. **Un fallo de un fichero no cambia el código HTTP:** la respuesta es 200 con el detalle por fichero.
   ⚠️ *Efecto:* el aviso de «falta el IBAN» lo verás dentro del informe de ese fichero, no como error de toda la petición.

## 📌 Consecuencias que te tocan a ti (no son código)

- **El IBAN, una vez, en la primera línea del CSV**, con esta forma exacta: `iban;ES9121000418450200051332` **antes** de la fila de cabecera. Los ficheros siguientes ya no lo necesitan.
- **Si editas ese CSV con Excel, guárdalo como «CSV UTF-8»**: el parser lee UTF-8 explícitamente y un guardado en cp1252 te rompería los acentos de los conceptos.
- **Ya NO tienes que dar de alta a mano la cuenta de MyInvestor:** se crea sola con ese IBAN. Lo que sí sigue en pie: **su `initialBalance` correcto a la primera**, porque ese banco no trae saldo por línea y es el único ancla de su saldo.
- **Reimportar un fichero ya procesado:** hay que devolverlo a mano en Drive de `procesados/` a la carpeta del año. Reimportarlo no duplica nada.
- **Nada queda confirmado:** todo entra como «pendiente de revisar» hasta que exista la pantalla de revisión (etapa E6).
- **Breaking change tuyo de contrato:** `/api/ingesta/*` desaparece y pasa a `/api/ingestion/*`. Hoy no lo consume nadie (el frontend no tiene features de producto), así que el coste es cero.
- **20 requirements en vez de ~15** (`docs/specs.md` §regla 2): los de más son de *alcance excluido*, del *renombrado* y del *retoque* de la F5, no comportamiento nuevo. Dicho en voz alta, como manda la regla.

## ⚠️ Incoherencias conocidas que se heredan

- **La numeración dentro del día solo cuenta las líneas que el parser entendió.** Si algún día arreglas el parser y reimportas un fichero que tenía líneas raras, ese día se renumera y puede aparecerte **algún movimiento duplicado de ese día** — visible y borrable, nunca una pérdida silenciosa. Sin dueño todavía (cabo suelto del roadmap).
