# Decisiones — F69 `last-imports`

> **Esto es lo único que necesitas leer para aprobar.** Los otros tres archivos
> (`requirements` / `design` / `tasks`) son material del implementer y del reviewer.
> Si algo de aquí no te convence, dilo y se cambia ahí; no hace falta que los abras.

**Qué hace:** una consulta nueva, solo de lectura, con cada cuenta y cada producto vivo: hasta qué fecha hay datos, qué día se importó por última vez, si se espera cada mes y los huecos que tiene. Para saber el día de importación, la importación empieza a guardarlo (una fecha en la cuenta y otra en el producto). **No cambia** cómo se importa (mismos archivos, mismo botón, mismo informe) ni ninguna otra consulta. Ni el frontend.

Con tus datos de hoy (medido en tu base, en solo lectura): las cinco cuentas salen **sin ningún hueco**; los productos que salen son la cuenta remunerada, las dos carteras, el ETF, el fondo y el depósito que vence en 2027. El depósito que venció el 3 de noviembre ya no sale, aunque no tenga escrita la fecha de cierre.

---

## ✅ Aprobado por el humano el 2026-11-08

Los seis puntos siguientes, aprobados tal cual («me parece bien»), nombres del punto 6 incluidos.

### Puntos que estaban por confirmar (6)

| # | Decisión | Alternativa si no te gusta |
|---|---|---|
| 1 | **(mía) Hueco en una cuenta corriente = más de 31 días sin movimientos entre dos importaciones distintas.** Dentro de un mismo archivo nunca es hueco, aunque pasen meses: el banco ya cubrió ese periodo (Revolut tiene más de dos meses así). Se sabe qué movimientos entraron juntos por el momento exacto en que se guardaron. Lo que se pierde: un mes olvidado en una cuenta casi sin movimientos (MyInvestor) puede no salir como hueco. | **20 días:** detecta más, pero hoy ya sacaría dos huecos en MyInvestor (saltos de 23 y 25 días entre dos importaciones) que no sé si son reales. **Leer el periodo que escribe cada extracto:** lo exacto, pero hay que abrir antes un archivo real de cada banco (ver 📌). |
| 2 | **(mía) Los meses sin foto de un producto se buscan en toda su historia**, entre su primera y su última foto. Hoy saldrían cuatro: el ETF (casi un año sin fotos), la cartera de MyInvestor y el fondo (varios meses de 2026), y la cuenta remunerada con agosto de 2024, que cae entre la foto de apertura y la primera del día 1 y quizá no sea un hueco de verdad. | **Solo los últimos 12 meses:** desaparecen el agosto de 2024 y parte del ETF, y verías solo lo reciente. |
| 3 | **(mía) Para lo importado antes de esta feature**, «importado el» sale el día en que entraron sus filas más recientes. Revolut, por ejemplo, saldría con el 15 de septiembre. Si una foto se volvió a subir después, sale el día de la primera vez. | **Dejarlo vacío hasta la siguiente importación:** nunca sale una fecha aproximada, pero hasta tu próximo import no verías ninguna. |
| 4 | **(mía) Un producto sin fotos (hoy, solo los depósitos) sale con «datos hasta» vacío** y con su fecha de vencimiento al lado: un depósito no tiene serie. | **Guardar la fecha que escribe el archivo del depósito** (hoy no se guarda) y enseñarla como «datos hasta»: una columna más. |
| 5 | **(tuya, a confirmar) Revolut y todas las cuentas salen siempre y se esperan cada mes**: las cuentas no tienen fecha de cierre ni de vencimiento. | Añadir una fecha de cierre a las cuentas para poder sacarlas: es otra feature. |
| 6 | **(mía, nombres a aprobar)** Ruta `GET /api/last-imports`; listas `accounts` y `products`; en cada una `dataUntil` (datos hasta), `importedAt` (importado el), `expectedMonthly` (se espera cada mes), `gaps` con `from`/`to` (los huecos, del día X al día Y; en un producto, meses enteros), y en productos `maturityDate`. Columna `lastImportedAt` en la cuenta y en el producto. **No uso `warnings`/«aviso»**: ya es el nombre aprobado de las filas no leídas y los descuadres. Si los apruebas, van a `docs/vocabulary.md`. | `GET /api/import/status` dentro de la importación, y `missing` en vez de `gaps`. |

## ✅ Ya las cerraste tú (6)

- **Dos fechas completas por cosa:** hasta qué fecha hay datos y qué día se importó.
- **Solo sale lo vivo:** con fecha de cierre o de vencimiento pasada deja de salir, sea del tipo que sea.
- **Con vencimiento futuro, no se espera cada mes; sin vencimiento, sí.**
- **Un archivo sin movimientos nuevos también cuenta como importado** (el caso de Revolut).
- **Consultar no cambia nada en la base.**
- **Nada se marca a mano:** todo sale de fechas.

## 🧪 Cómo se comprobará que está hecho

| Tu frase de «cómo sé que está bien» | Se comprueba ejecutando |
|---|---|
| Bankinter hasta el 15 de octubre, importado el 2 de noviembre | El test que importa ese extracto con el reloj puesto el 2 de noviembre y mira las dos fechas |
| La foto de un fondo | El test que importa una foto y mira su fecha y la de importación |
| Depósito vivo sin importación mensual; al vencer deja de salir | El test con un depósito antes y el mismo día del vencimiento |
| Un producto cerrado no sale | El test con un fondo cerrado |
| Fondo con agosto y octubre: falta septiembre | El test que espera un hueco del 1 al 30 de septiembre |
| Hueco entre dos extractos de una cuenta | Dos tests: uno con dos importaciones separadas más de 31 días (y uno de 31 justos, que no sale); otro con un tramo largo dentro de un mismo archivo, que no sale |
| Revolut sin movimientos nuevos | El test que importa dos veces el mismo extracto: cambia el día de importación, no «datos hasta» |
| Consultar no cambia nada | El test que compara la base antes y después |
| (añadido) Un archivo que falla no cambia la fecha | El test con un extracto que falla |
| (añadido) Lo importado antes de la feature | El test de la migración que rellena las fechas |
| (añadido) El contrato y lo de siempre | El test que lee `docs/api-contract.md` y `pnpm test` entero |

## ⚙️ Técnicas — decididas, no necesitan tu visto bueno (5)

1. **Se guarda solo la última importación** (una fecha en la cuenta y otra en el producto), no un historial de archivos. ⚠️ *Efecto:* no se podrá ver «qué importé en agosto»; si algún día hace falta, es una tabla nueva.
2. **Un archivo que falla no cuenta como importado**: desde la F66 no deja nada, tampoco esta fecha.
3. **El día en que vence un producto ya no sale**, igual que en la consulta de ganancias (F67).
4. **«Importado el» es el día en hora de España**: una importación a las 00:30 cuenta para ese día.
5. **El spec tiene 16 requisitos**, uno más del tope habitual: el que obliga a publicar el contrato para el frontend.

## 📌 Consecuencias que te tocan a ti (no son código)

- **Si quieres detectar con exactitud los huecos de las cuentas (alternativa del punto 1)**, hay que abrir un extracto real de cada uno de los cinco bancos y mirar si escribe el periodo que cubre. No lo he comprobado: no se han abierto los archivos de Drive.
- **La sesión del frontend** hace la ventana emergente cuando esté publicada la sección nueva del contrato.

## ⚠️ Incoherencias conocidas que se heredan

- **Un depósito vencido sin cierre escrito** no sale aquí (ni en ganancias), pero `Net Worth` lo sigue sumando, marcado como `matured_not_closed`. Es lo de la F67.
