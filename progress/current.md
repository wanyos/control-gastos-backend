# Sesión actual

> Este archivo se vacía al cerrar cada sesión y se mueve a `history.md`.
> Mientras trabajas, **mantenlo actualizado en tiempo real**, no al final.

- **Tarea en curso:** **F14 `no-real-data`** — sacar los datos reales del repositorio y
  dejar un guardián en la suite que impida la recaída. Sin spec (`sdd: false`): la
  fuente son el `intent` y los 10 criterios de `acceptance`.
- **Inicio:** 2026-08-12
- **Agente:** leader + implementer + reviewer

## F14 en curso — plan y estado

1. ✅ Barrido del árbol comparando contra las capturas gitignoreadas de `var/`. Salió
   **mucho más** de lo que listó el reviewer de la F13: el **IBAN real** seguía en
   `bankinter.parser.test.ts` (fuga de la F12 nunca cerrada), las líneas de su extracto
   (importes, saldos, el nombre de su empresa, el de una persona, su gimnasio) estaban
   en `src/`, `docs/`, `specs/` y `progress/` desde la F6, y el review de la F12 citaba
   el IBAN viejo entero.
2. ✅ Saneado: **~45 archivos**, valores inventados que conservan la aritmética.
3. ✅ Guardián [`src/no-real-data.test.ts`](../src/no-real-data.test.ts): dos capas
   (forma + comparación contra `var/`, que **se salta** si no está). ADR-017.
4. ✅ `docs/conventions.md` §Tests apunta ya al guardián.
5. ✅ **Segunda vuelta** tras `CHANGES_REQUESTED`: los 5 cambios aplicados (§8 del
   informe). Lo gordo: el guardián **ya no se exceptúa a sí mismo** —llevaba dentro un
   concepto real— y **ya no pasa en verde con `var/` a medias** (el `.xlsx` solo se ve
   por su volcado; si falta una rama, se salta nombrándola). Más la pasada manual por
   debajo del umbral, que era lo que faltaba.
6. ✅ **`reviewer`: APROBADO** en segunda pasada → [`reviews/no-real-data.md`](reviews/no-real-data.md),
   resumen en [`summaries/no-real-data.md`](summaries/no-real-data.md). Verificó por su
   cuenta: la inyección de IBAN + saldo + concepto reales hace fallar **las tres capas**
   con `archivo:línea`; **las cinco variantes de `var/`** acaban siempre en *skipped*
   nombrando la rama que falta, **nunca en verde silencioso**; la salida del guardián de
   su propia lista de excepciones es real (no hay exención equivalente con otro nombre);
   y su pasada bajo el umbral, rehecha sin umbral, da **0 residuos**. Encontró además una
   fuga suya: su review de la primera pasada citaba un importe real.
7. ✅ **F14 `done`.** `./init.sh` verde: 26 archivos, **372 tests**.

## 📌 Dos decisiones que quedan en manos del humano (ninguna urgente)

1. **Una línea de su extracto vive en una migración ya aplicada**
   (`prisma/migrations/**/migration.sql`). Editarla obligaría a `migrate reset` y
   perdería su base de datos, así que **no se ha tocado**. Salidas: sanear ese comentario
   el día que resetee la base por otro motivo, o editarlo y corregir a mano el checksum
   que Prisma guarda. Riesgo residual aceptado mientras tanto.
2. **El histórico de git.** El 2026-08-12 decidió no reescribirlo, cuando lo que se creía
   expuesto eran cifras de inversión en dos commits recientes. Ahora se sabe que desde la
   **F6** contiene además su **IBAN de Bankinter**, el **nombre de su empresa** y el
   **nombre completo de otra persona** — un dato de un tercero. El repositorio es
   privado, así que no hay urgencia; pero la decisión se tomó con menos información y
   **se le ha devuelto**.

## Lo que aprendió el proyecto con esto

El mismo escape ocurrió **tres veces** (F12, F13 y lo que arrastraba desde la F6) y las
tres las cazó el **`reviewer` leyendo**, nunca la suite — pese a que la regla estaba
escrita en `docs/conventions.md` **y** en el `acceptance` de la F13. Una regla que tres
agentes distintos deben recordar no es una regla. Por eso el valor de la F14 no es la
limpieza sino [`src/no-real-data.test.ts`](../src/no-real-data.test.ts).

Y su propio diseño lo demostró: **al quitarle la auto-excepción, la primera ejecución
falló señalando un importe real que el implementer había dejado en un comentario.** Se
cazó a sí mismo en cuanto se le permitió mirarse.

## Punto de partida

La sesión anterior cerró la **F12 `import`** y está commiteada y subida junto con la
reforma del harness del humano. El árbol quedó limpio. Etapas **E2 y E5 ✅**, cabos
sueltos **nº 1 y nº 4** cerrados.

**La F13 es la última feature abierta del proyecto.** Es solo parser y volcado: **no
toca base de datos** — guardar los productos tiene la regla de duplicado contraria
(recargar sobrescribe) y por eso quedó fuera de la F12.

## Decisiones que ya venían cerradas (2026-08-11)

- 🔄 **Los números van como número JSON puro** (`1234.56`), no como texto en formato
  español. **Efecto de arrastre:** la F13 **NO** consume `parseAmountText`, que su spec
  original daba por consumida; a cambio aparece un error nuevo (que el valor llegue como
  texto). Las fechas siguen en `AAAA-MM-DD`.
- `date` obligatorio **también** en el depósito · choque producto+fecha se queda con el
  **primero alfabético** y reporta el otro · **clave desconocida = error**, salvo las que
  empiezan por `_` · volcado a **un `products.json` por año**.
- **`closedAt` es campo del archivo** en los dos tipos, escrito una sola vez.
  **`currency` opcional**, se asume `EUR`.
- **La plantilla vive en una carpeta hermana de `notas-banco/`**, invisible para el
  backend. Es deber del humano.

## Nota sobre la feature 9 (T17 de `tasks.md`)

- ✅ **El esquema de inversiones de la F9 NO cambia** a raíz de los formatos de la F13:
  ni una columna, ni un tipo, ni un índice, ni una precisión decimal. Los formatos
  **confirman** sus dos suposiciones abiertas: el efectivo va **aparte** del valor de
  mercado (patrimonio = `marketValue + uninvestedCash`) y el depósito guarda **una sola**
  TAE, la que se aplica. Además, su columna `closedAt` —reservada y sin escritor— **ya
  tiene quien la escriba**: el campo `closedAt` del archivo de producto.
- ⚠️ **Cabo suelto de documentación (no de código):** donde el spec de la F9
  (`specs/investments-data-model/`) enlaza a la antigua `specs/myinvestor-parser/`, hoy
  hay **dos** carpetas: `specs/myinvestor-statement/` y `specs/myinvestor-products/`. Es
  una corrección de enlaces; **no se ha tocado** `specs/investments-data-model/` desde
  esta feature (regla dura de `tasks.md`).

## Bitácora

- ▶️ **F13 a `in_progress` y `implementer` lanzado.**
- ✅ **F13 implementada** (parser de producto, encaminamiento por extensión, volcado
  `products.json` por año, docs y ADR-016). Informe en
  `progress/implementations/myinvestor-products.md`. Pendiente de `reviewer`.
