# Sesión actual

> Este archivo se vacía al cerrar cada sesión y se mueve a `history.md`.
> Mientras trabajas, **mantenlo actualizado en tiempo real**, no al final.

- **Tarea en curso:** ninguna. La **F15 `product-opened-at`** se cerró en esta misma
  sesión (2026-08-13). Las 15 features están `done`.
- **Inicio:** 2026-08-13
- **Agente:** leader + implementer + reviewer

## F15 `product-opened-at` — cerrada

Nació de una revisión de estado: el humano pidió que el JSON de producto de inversión
llevase la fecha de apertura. Sin spec (`sdd: false`).

1. ✅ **Decisión del humano:** `openedAt` **obligatorio en los cuatro tipos**, frente a
   la alternativa de admitirlo vacío. `closedAt` no se toca (opcional; normalmente solo
   los depósitos lo llevan).
2. ✅ Implementado en `src/modules/myinvestor/`. La clave se lee **antes** de bifurcar
   depósito/resto ([`myinvestor.product.parser.ts:80`](../src/modules/myinvestor/myinvestor.product.parser.ts#L80)),
   que es lo que la hace obligatoria de verdad en los cuatro y no solo donde se probó.
   `ParsedProduct.openedAt` es `string`, **nunca `null`**: sin fecha no hay producto,
   hay archivo fallido.
3. ✅ **`reviewer`: CHANGES_REQUESTED** en primera pasada, por **un solo punto de
   documentación** — la tabla de columnas reservadas de `docs/data-model.md:214` seguía
   diciendo que el fichero no llevaba el campo y que sería opcional. Es el registro que
   leerá quien haga la persistencia de inversiones, así que dejarlo mintiendo era caro.
4. ✅ **`reviewer`: APROBADO** en segunda pasada →
   [`reviews/product-opened-at.md`](reviews/product-opened-at.md), resumen en
   [`summaries/product-opened-at.md`](summaries/product-opened-at.md).
   `./init.sh` verde: **379 tests, 0 saltados** (los 0 saltados importan: el guardián de
   la F14 corrió con su capa de comparación activa, no solo la de forma).

## 📌 Lo que le toca al humano

1. 🔴 **Actualizar la plantilla de producto que guarda en Drive** con la línea de
   `openedAt`. Nadie comprueba que coincida con la documentación: todo archivo escrito
   con la plantilla vieja fallará. Plantillas en
   [`docs/myinvestor-product-files.md`](../docs/myinvestor-product-files.md).
2. **Prueba pendiente, anunciada por él:** va a poner la línea `iban;ES…` en el CSV de
   MyInvestor y a subir sus JSON de inversión para probar el camino entero.
3. **Inventario por banco** ([`docs/ideas.md`](../../docs/ideas.md)): sigue vacío y
   sigue bloqueando la E4 entera.

## ⚠️ El histórico de git NO está saneado (verificado el 2026-08-13)

El humano lo dio por arreglado; se comprobó y **no lo está**. Los 36 commits conservan
sus hashes y fechas originales, así que **no hubo reescritura**. Quedan dos IBAN
**válidos por checksum** (no son de manual) alcanzables en commits antiguos, ninguno en
HEAD:

- `ES15 0128…` (0128 = Bankinter) en **14 commits**, desde `4caeb38` (F6, 2026-08-04),
  en `bankinter.parser.test.ts`.
- `ES30 1544…` en **4 commits**, de la F12 (2026-08-12).

HEAD está limpio (solo los dos IBAN de manual y uno inválido a propósito). **Pendiente
de que el humano diga qué hizo** — si puso el repo en privado o borró el remoto, reduce
el riesgo pero no cierra el tema.

## Cerrado también en esta sesión (no es código)

- ✅ **Carpeta de plantillas en Drive**, hermana de `notas-banco/`: creada.
- ✅ **Cabo suelto nº 9** (`openedAt` sin escritor): cerrado por la F15.
- 🕗 **Histórico del Excel** (idea #5): **aplazado, no descartado** — inclinación a
  importarlo «para no empezar de vacío».
- ⏳ **Cabo suelto nº 10** (`daySequence` numera solo las filas parseadas): explicado y
  **sigue abierto**. Se cierra el día que el humano diga que acepta borrar a mano los
  duplicados visibles si algún día arregla un parser y reimporta.

## Lo que aprendió el proyecto con esto

Una feature de una sola línea de comportamiento se fue a **CHANGES_REQUESTED por
documentación**, y con razón: `docs/data-model.md` se declara a sí mismo el registro
único de columnas sin escritor, y una feature que le da escritor a una columna sin
actualizar ese registro deja una trampa para la feature siguiente. El código estaba
bien a la primera; lo que faltaba era el rastro.
