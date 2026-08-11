# Decisiones — F13 `myinvestor-products`

> **Esto es lo único que necesitas leer para aprobar.** Los otros tres archivos
> (`requirements` / `design` / `tasks`) son material del implementer y del reviewer.
> Si algo de aquí no te convence, dilo y se cambia ahí; no hace falta que los abras.

**Qué hace:** lee **los archivos JSON de producto de inversión que escribes a mano** en
la carpeta de MyInvestor (fondos, ETF, cartera automatizada y depósitos) y los convierte
en una estructura, volcada a un JSON local para revisarla. Sin base de datos y sin mover
nada en Drive.

**De dónde sale esta feature:** del corte de la antigua F10 `myinvestor-parser`, que
hacía dos cosas. **El extracto CSV de la cuenta corriente es ahora la F10
`myinvestor-statement`**, que no tiene ningún punto rojo y se implementa antes. Aquí se
quedaron **los cinco puntos rojos**, que son todos de estos archivos.

⏸️ **Esta feature no se implementa hasta que confirmes los cinco de abajo.**

---

## 🔴 Confirma o corrige (5 que tienen consecuencia real)

| # | Decisión | Alternativa si no te gusta |
|---|---|---|
| 1 | **Los números van entre comillas en formato español** (`"1.312,72"`), como los ves en la web. Las fechas siempre `AAAA-MM-DD`, aunque el banco use `03/11/26`. | Números JSON puros (`1312.72`): más simple para la máquina, más fácil de teclear mal para ti. |
| 2 | **`date` es obligatorio también en el depósito**, aunque un depósito no tenga fotos. Ahí significa «el día que tomé esta nota». | Hacerlo opcional solo para el depósito, y perder con ello la detección del choque del punto 3. |
| 3 | **Si dos archivos declaran el mismo producto y la misma fecha, se conserva uno** (el primero por orden alfabético de nombre) **y el otro se reporta.** | Rechazar los dos y obligarte a arreglarlo antes de ver ningún resultado. |
| 4 | **Una clave que no esté en la plantilla es un error**, salvo las que empiezan por `_`, que son notas y se ignoran. Es lo que atrapa que escribas `uninvestedcash` en vez de `uninvestedCash` y el efectivo desaparezca sin avisar. | Ignorar las claves desconocidas: más permisivo, pero una errata te borra un dato en silencio. |
| 5 | **Los productos se vuelcan todos a un `products.json` por año**, no un volcado por archivo (el extracto sí va por archivo, como ya se hace). | Un volcado por archivo, que daría `fondo.json.json` y no dejaría ver el choque del punto 3, que es del conjunto. |

📌 **Además, antes de implementar tienes que cerrar la lista de campos** de cada tipo de
producto: está campo a campo, con su origen (sale del modelo / sale de tu muestra / me lo
he inventado), en `design.md` §7.3. Es la tabla que decide qué tendrás que teclear cada
mes.

## ⚙️ Técnicas — decididas, no necesitan tu visto bueno (7)

1. **Estos archivos viven en el módulo del banco** (`src/modules/myinvestor/`), junto al
   parser del extracto: un banco puede tener varias entradas, y la norma de
   `docs/conventions.md` lo contempla explícitamente.
2. **Se distingue el extracto del producto por la extensión** (`.csv` / `.json`); el
   banco sale de la carpeta, y qué producto y de qué fecha, del contenido del archivo.
3. **El nombre del archivo no se valida nunca**, solo se usa para reportar. Drive
   renombra a `fondo (1).json` en cuanto subes dos veces.
4. **Un archivo roto reporta todos sus problemas de golpe**, no el primero, para que no
   tengas que arreglar-relanzar-arreglar. Y no tumba el parseo de los demás.
5. **Se reutiliza tal cual lo que construye la F10:** la interpretación de los números,
   el recorrido de carpetas, la lista de errores, la de ignorados y el mismo botón. Aquí
   no se construye nada de eso por segunda vez.
6. **Cero dependencias nuevas.** El JSON es nativo.
7. **El parser no calcula nada:** ni la ganancia, ni el porcentaje, ni ningún valor a
   partir de los demás.

## 📌 Consecuencias que te tocan a ti (no son código)

- **Estos archivos los escribes tú**, uno por producto y por foto. La plantilla copiable
  quedará en `docs/myinvestor-product-files.md` cuando se implemente.
- **Dejar de escribir un producto NO lo cierra.** Si un mes te dejas un fondo, no pasa
  nada: sigue vivo. Para cerrarlo se escribe `closedAt` **una sola vez**, el mes en que
  vence el depósito o reembolsas el fondo.
- **Recomendación de nombre** (no obligatoria): `<producto>-<AAAA-MM-DD>.json`. Si subes
  `fondo.json` todos los meses al mismo año, cada descarga pisa la copia local anterior.

## 🟥 Lo que decidí yo y no me pediste (5 de las 8 que quedaban vivas)

De las ocho propuestas mías que seguían pendientes de tu visto bueno, **cinco caen de
este lado** (las otras tres se fueron con el extracto): la fecha obligatoria en el
depósito, el choque de producto+fecha, las claves desconocidas como error, el
`products.json` por año — que son los puntos 🔴 2, 3, 4 y 5 de arriba — y una quinta que
no llega a rojo: que **un archivo roto acumule todos sus fallos en un solo mensaje** en
vez de reportar el primero. Esa la doy por buena salvo que digas lo contrario.

El 🔴 nº 1 (formato de números y fechas) no está en esta lista: eso me lo **delegaste**
tú explícitamente; lo pongo en rojo porque es lo que vas a teclear cada mes.
