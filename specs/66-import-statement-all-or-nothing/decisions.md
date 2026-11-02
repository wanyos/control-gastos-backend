# Decisiones — F66 `import-statement-all-or-nothing`

> **Esto es lo único que necesitas leer para aprobar.** Los otros tres archivos
> (`requirements` / `design` / `tasks`) son material del implementer y del reviewer.
> Si algo de aquí no te convence, dilo y se cambia ahí; no hace falta que los abras.

**Qué hace:** todo lo que un extracto escribe en la base (la cuenta si es nueva, sus movimientos, los saldos que rellena, el ancla y sus avisos) se guarda de una vez, en una transacción de la base de datos por archivo: si algo falla, no queda nada de ese archivo. **No toca** la importación de archivos de producto, ni la base (sin migraciones), ni lo que se guarda cuando el archivo entra bien.

**Comprobado en el código:** son nueve funciones las que pasan a recibir la transacción (el cabo 26 decía ocho), y la que abría su propia transacción no es la del ancla sino la que guarda los avisos ([import.warnings.service.ts:152](../../src/modules/import/import.warnings.service.ts#L152)). En la base no existe ningún registro de las importaciones: el informe solo vive en la respuesta, así que no hay nada más que conservar.

---

## 🔴 Confirma o corrige (5)

| # | Decisión (propuesta mía) | Alternativa si no te gusta |
|---|---|---|
| 1 | **Un descuadre de saldo sigue sin hacer fallar el archivo:** entra y se guarda como aviso, como hoy. «Falla la comprobación de saldo» = la comprobación no se pudo hacer (error al leer la base). | Que un descuadre haga fallar el archivo y lo deshaga entero: el descuadre ya no se guardaría como aviso (contradice la F48) y cambia lo que pasa con archivos que hoy entran bien. |
| 2 | **Si todo se guardó y lo único que falla es moverlo a `procesados/`, lo guardado se queda** (como hoy); el archivo sale fallido y al reintentarlo no se duplica nada. | Mover dentro de la transacción: si Drive mueve y luego la base falla, el archivo acaba en `procesados/` sin nada guardado y nadie lo reintenta. |
| 3 | **Un archivo fallido sale en el informe sin cuenta y con todo a cero** (movimientos guardados, duplicados, saldos rellenados, ancla, descuadres); conserva sus filas ilegibles y el error. | Dejarlo como hoy: diría «guardados 40» de movimientos que ya no existen, y esos 40 sumarían al total de la importación. |
| 4 | **Las filas ilegibles de un archivo fallido no se guardan como aviso**, solo salen en el informe (igual que hoy cuando falla antes de guardar avisos). | Guardarlas aparte aunque el archivo falle: quedarían avisos de un archivo que no entró, y si lo que falló fue justo guardar avisos, no se puede. |
| 5 | **Dos tests existentes cambian cómo provocan su fallo, no lo que comprueban** (el de «el ancla se lee antes de anclar» y el de «si falla guardar los avisos, el archivo no se mueve»): ahora tienen que meterse dentro de la transacción. | No tocarlos y añadir al código una entrada que solo usarían los tests. |

## ✅ Ya las cerraste tú (3)

- **Con spec**, por ser el camino crítico de la importación.
- **Solo se deshace el archivo que falla;** los demás de la misma importación que entraron se quedan (una transacción por archivo, no una por importación).
- **Prueba con datos reales al terminar**, a tu cargo (abajo, 📌).

## 🧪 Cómo se comprobará que está hecho

| Tu frase de «cómo sé que está bien» | Se comprueba ejecutando |
|---|---|
| Si falla la comprobación de saldo, sale failed, no se mueve y no queda ningún movimiento suyo. | El test que hace fallar esa comprobación y cuenta 0 movimientos del archivo y Drive sin mover. |
| Si falla el guardado de avisos, igual. | El test que hace fallar el guardado de avisos: 0 movimientos y 0 avisos de ese archivo. |
| Si la cuenta se creó con ese archivo, tampoco queda. | El test con una cuenta nueva que falla: la cuenta no existe después. |
| *(añadido)* Si el ancla se fijó con ese archivo, tampoco queda. | El test con una cuenta sin ancla que falla: sigue sin ancla. |
| *(añadido)* Con varios archivos, el fallo de uno no deshace los que entraron. | El test de una importación de tres archivos con el del medio fallando. |
| Un archivo que se importa bien sigue guardando lo mismo que hoy. | Los tests de importación y de cuentas que ya existen, con sus comprobaciones intactas. |
| La suite pasa. | `pnpm test`. |

## ⚙️ Técnicas — decididas, no necesitan tu visto bueno (4)

1. **(Propuesta) Tiempo máximo de la transacción: 60 segundos.** Prisma corta a los 5 s si no se dice nada, y reimportar un extracto grande hace una consulta por línea con saldo; no está medido con datos reales.
   ⚠️ *Efecto:* si un extracto tardase más de 60 s en guardarse, saldría fallido sin dejar nada; se vería en la prueba real.
2. **(Propuesta) Cómo se provoca el fallo en los tests:** envolviendo el cliente de la base para que, dentro de la transacción, guardar avisos o leer los movimientos lance un error. Sin datos reales, solo con archivos inventados.
3. **Leer y comprobar el archivo va fuera de la transacción:** un archivo vacío o ilegible no llega a abrir ninguna.
4. **Lo que va después de todos los archivos** (detección de traspasos, reglas de categoría y el cierre a `Otros gastos` / `Otros ingresos`) no cambia ni entra en la transacción.

## 📌 Consecuencias que te tocan a ti (no son código)

- **Prueba con datos reales** (quedará en «Deberes tuyos» del roadmap): importa un extracto normal y comprueba que el informe y `GET /api/accounts` salen igual que antes; y reimporta tu extracto más largo para ver que no se acerca a los 60 s. ⚠️ Escribe en tu base real: saca antes la copia con `pnpm run db:backup`.
