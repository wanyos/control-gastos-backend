# Decisiones — F13 `myinvestor-products`

> **Esto es lo único que necesitas leer para aprobar.** Los otros tres archivos
> (`requirements` / `design` / `tasks`) son material del implementer y del reviewer.
> Si algo de aquí no te convence, dilo y se cambia ahí; no hace falta que los abras.

**Qué hace:** lee **los archivos JSON de producto de inversión que escribes a mano** en
la carpeta de MyInvestor (fondos, ETF, cartera automatizada y depósitos) y los convierte
en una estructura, volcada a un JSON local para revisarla. Sin base de datos y sin mover
nada en Drive.

**De dónde sale esta feature:** del corte de la antigua F10 `myinvestor-parser`, que
hacía dos cosas. **El extracto CSV de la cuenta corriente es la F10 `myinvestor-statement`**,
ya implementada y cerrada.

✅ **Actualizado el 2026-08-11 con tus decisiones.** El diff está en
[`../myinvestor-statement/CHANGELOG-respec.md`](../myinvestor-statement/CHANGELOG-respec.md).

---

## 🔴 Confirma o corrige: **NINGUNO**

**Esta feature no tiene ningún punto rojo abierto.** Los cinco que había y las tres
casillas de la lista de campos las cerraste el **2026-08-11**; están abajo, en ✅.
**Se puede aprobar de un vistazo y pasar a implementación.**

## ✅ Ya las cerraste tú (9, el 2026-08-11)

- **Los números van como número JSON puro** (`8440.60`, cifra de ejemplo **inventada**
  como todas las de este spec, `docs/conventions.md` §Tests), no entre comillas en formato
  español. **Las fechas no cambian: siempre `AAAA-MM-DD`.** Un valor numérico que llegue
  como texto se reporta como fallo del archivo, con su motivo, y **no se interpreta**.
- **`date` es obligatorio también en el depósito**, con el significado "el día que tomé
  esta nota".
- **Si dos archivos declaran el mismo producto y la misma fecha**, se conserva el primero
  por orden alfabético y el otro se reporta.
- **Una clave que no esté en la plantilla es un error**, salvo las que empiezan por `_`,
  que son notas tuyas y se ignoran.
- **Los productos se vuelcan todos a un `products.json` por año**, no un volcado por
  archivo.
- **Un archivo roto reporta todos sus problemas de golpe**, no el primero.
- **`closedAt` es un campo del archivo**, en los dos tipos: lo escribes tú **una sola
  vez**, el último mes del producto. (Con esto, la columna `closedAt` del modelo de datos
  **ya tiene quien la escriba**.)
- **`currency` se queda como campo opcional** que no vas a escribir nunca: se asume
  `EUR`.
- **El archivo del depósito se escribe solo al contratarlo y al vencer**, no todos los
  meses: sus condiciones no cambian.

📄 **La lista de campos completa, cerrada, con qué es cada uno y cuándo lo escribes:**
[`CAMPOS-cerrados.md`](CAMPOS-cerrados.md).

## ⚙️ Técnicas — decididas, no necesitan tu visto bueno (7)

1. **Estos archivos viven en el módulo del banco** (`src/modules/myinvestor/`), junto al
   parser del extracto: un banco puede tener varias entradas, y la norma de
   `docs/conventions.md` lo contempla explícitamente.
2. **Se distingue el extracto del producto por la extensión** (`.csv` / `.json`); el
   banco sale de la carpeta, y qué producto y de qué fecha, del contenido del archivo.
3. **El nombre del archivo no se valida nunca**, solo se usa para reportar. Drive
   renombra a `fondo (1).json` en cuanto subes dos veces.
4. **Un archivo roto no tumba el parseo de los demás.**
5. **Se reutiliza tal cual lo que construye la F10:** el recorrido de carpetas, la lista
   de errores, la de ignorados y el mismo botón. Aquí no se construye nada de eso por
   segunda vez.
   ⚠️ *Efecto de que los números vayan sin comillas:* el intérprete de números del
   extracto **ya no se usa aquí**. Sigue vivo para el `.csv` y no se toca.
6. **Cero dependencias nuevas.** El JSON es nativo.
7. **El parser no calcula nada:** ni la ganancia, ni el porcentaje, ni ningún valor a
   partir de los demás.

## 📌 Consecuencias que te tocan a ti (no son código)

- **La plantilla que copias cada mes vive en Drive, en una carpeta HERMANA de
  `notas-banco/`** — nunca dentro. Cualquier carpeta que cuelgue de `notas-banco/` se
  toma por **un banco**
  ([`drive-structure.ts:365`](../../src/lib/drive-structure.ts#L365)), y un archivo
  suelto en `<banco>/<año>/` se lee como un producto tuyo y saldría cada mes como archivo
  roto. **Crearla y mantenerla es deber tuyo.**
  ⚠️ *Matiz que verifiqué al escribir esto:* una carpeta dentro del banco que **no** se
  llame como un año de cuatro cifras (`plantillas/`) sí queda descartada por el filtro
  ([`:399`](../../src/lib/drive-structure.ts#L399)), así que ahí no rompería nada. Aun
  así, **la hermana sigue siendo la buena**: no depende de ese filtro y no ensucia el
  registro de bancos.
- **Qué pasa con `docs/myinvestor-product-files.md`** (el documento que iba a llevar la
  plantilla copiable): **se queda en el repo, pero cambia de papel.** Deja de ser "de
  donde copias" y pasa a ser **la referencia del formato** — la tabla de campos, las
  reglas de números y fechas y el ejemplo de cada tipo. Tu plantilla de Drive es una
  copia suya; cuando el formato cambie, se cambia aquí y tú actualizas la de Drive.
  **Nadie comprueba que las dos coincidan.**
- **Estos archivos los escribes tú**, uno por producto y por foto. **Los depósitos no:**
  su archivo se escribe **dos veces en toda su vida** (al contratar y al vencer).
- **Dejar de escribir un producto NO lo cierra.** Si un mes te dejas un fondo, no pasa
  nada: sigue vivo. Para cerrarlo se escribe `closedAt` **una sola vez**, el mes en que
  vence el depósito o reembolsas el fondo.
- **Recomendación de nombre** (no obligatoria): `<producto>-<AAAA-MM-DD>.json`. Si subes
  `fondo.json` todos los meses al mismo año, cada descarga pisa la copia local anterior.

## ⚠️ Incoherencias conocidas que se heredan

- **La lista de "archivos ignorados" pierde su motivo original.** Se pensó para tus tres
  capturas `.txt`, que ya no vas a subir. **Se queda igual**: es la red que hace visible
  cualquier archivo que se cuele en la carpeta sin contarlo como fallo. Vive en la F10,
  ya implementada, y no se toca.
