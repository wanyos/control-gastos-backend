# Decisiones — F53 `product-file-collision`

> **Esto es lo único que necesitas leer para aprobar.** Los otros tres archivos
> (`requirements` / `design` / `tasks`) son material del implementer y del reviewer.
> Si algo de aquí no te convence, dilo y se cambia ahí; no hace falta que los abras.

**Qué hace:** cuando en una misma llamada a `POST /api/import` hay dos archivos de producto con el mismo banco, el mismo nombre (`name`) y la misma fecha (`date`), el primero se guarda y el segundo se rechaza: no se guarda nada de él, se queda en Drive y el informe dice con qué archivo coincide. **No toca** los extractos de movimientos, ni los parsers, ni cómo se guarda un producto. No hay migración ni ruta nueva.

Lo que digo del código de hoy lo leí el 2026-10-02. Que hoy el segundo archivo sustituye al primero lo sé por la lectura del código y por tu prueba real del 2026-09-12; no lo he vuelto a reproducir ejecutando.

---

## 🔴 Confirma o corrige (6)

| # | Decisión (mía; tú la delegaste o no la dijiste) | Alternativa si no te gusta |
|---|---|---|
| 1 | **«El segundo» es el que la importación lee después:** por orden de nombre de banco, luego de carpeta de año, luego de archivo. En tu caso del 2026-09-12 se habría guardado `etf_gold-…json` y rechazado `mobiliario_…json`. | Rechazar los dos. Es otra feature más grande: obliga a leer todos los archivos antes de guardar ninguno, y tú pediste «rechazar el segundo». |
| 2 | **«La misma importación» es una llamada entera a `POST /api/import`,** incluidas todas las carpetas de año de ese banco: si los dos archivos están uno en `2025/` y otro en `2026/`, también se rechaza el segundo. Dos bancos distintos nunca coinciden. | Comparar solo dentro de la misma carpeta de año: dos archivos iguales en carpetas distintas seguirían sustituyéndose sin decir nada. |
| 3 | **La regla es la misma para los tres tipos de archivo de producto:** fondo/ETF/cartera, cuenta remunerada y depósito. En el depósito la fecha no se guarda en ningún sitio, pero se compara igual. | En el depósito, rechazar el segundo archivo del mismo nombre aunque la fecha sea distinta. Hoy, con fechas distintas, el segundo reescribe las condiciones del primero y eso no cambia. |
| 4 | **El rechazo sale con un código propio, `DUPLICATE_PRODUCT_FILE`,** y este texto: «este archivo declara el producto '…' con fecha …, lo mismo que el archivo '…' de la carpeta …, que ya se ha guardado en esta misma importación: de este no se ha guardado nada y NO se ha movido a procesados/. Si son dos productos distintos, corrige el "name" de uno; si es el mismo archivo subido dos veces, bórralo de Drive.» | Reutilizar `VALIDATION_ERROR`, el de «archivo mal escrito»: no hay código nuevo, pero el frontend no podría distinguir este caso para darle un texto suyo. |
| 5 | **Si el primero de los dos archivos falla** (está mal escrito, no cuadra), no cuenta: el segundo se importa con normalidad. Solo rechaza a otro un archivo que sí guardó su valor. | Rechazar también el segundo. No lo veo defendible: no habría ningún valor guardado que proteger. |
| 6 | **Se corrigen los dos documentos de archivos de producto** ([MyInvestor](../../docs/myinvestor-product-files.md) y [Trade Republic](../../docs/trade-republic-product-files.md)), que hoy dicen que en este caso «nadie te avisa». | No tocarlos: seguirían diciendo algo que deja de ser verdad. |

## ✅ Ya las cerraste tú (6)

- **El segundo se rechaza; no vale guardarlo y solo decirlo.**
- **El archivo rechazado no se mueve a `procesados/`:** sigue pendiente en Drive.
- **Un archivo rechazado no para la importación de los demás.**
- **Dos archivos del mismo producto con fechas distintas** (los de cada mes) entran los dos, como hoy.
- **Importar otro día un archivo corregido del mismo producto y fecha sigue sustituyendo el valor,** como hoy.
- **Borrar un producto o un valor desde la API queda fuera:** es el cabo suelto 24, que no se toca.

## 🧪 Cómo se comprobará que está hecho

> Los `checks` de `feature_list.json`: se ejecutan al cerrar y, si uno falla, la
> feature no se cierra. Si falta un caso, es aquí donde se pide.

| Tu frase de «cómo sé que está bien» | Se comprueba ejecutando |
|---|---|
| El primero se guarda y el segundo sale como fallido, con un mensaje que nombra el otro archivo | Un test que importa dos archivos inventados iguales en banco, nombre y fecha y mira el informe; y otros dos con el parser real de MyInvestor, uno con un fondo y otro con un depósito |
| El archivo rechazado no se mueve a `procesados/` | Un test que comprueba que solo se mueve el primero |
| El valor que guardó el primero sigue tal como lo guardó | Un test con importes distintos en los dos archivos: en la base quedan los del primero |
| Dos archivos del mismo producto con fechas distintas se importan los dos | Un test con dos fechas en la misma importación |
| Importar otro día un archivo corregido sigue sustituyendo | Un test con dos importaciones seguidas: la segunda sustituye |
| `docs/api-contract.md` describe el rechazo nuevo | Un test que lee el contrato y busca el código nuevo y que dice que no se guarda ni se mueve |
| _(añadido)_ Los extractos entran igual que hoy | La suite entera |

El contador `importedProductCount` cuenta solo los archivos guardados (tu cuarta delegación): ya era así y un test nuevo lo fija, pero no tiene frase tuya ni check propio; entra en la suite entera.

## ⚙️ Técnicas — decididas, no necesitan tu visto bueno (5)

1. **Lo que cada archivo ha guardado se recuerda en memoria, solo mientras dura la llamada.** No se guarda en la base de datos; por eso otro día el archivo corregido vuelve a entrar.
2. **La comprobación va antes de escribir nada:** el archivo rechazado no llega a abrir ninguna escritura.
3. **El nombre se compara carácter a carácter,** igual que la base de datos distingue los productos.
   ⚠️ *Efecto:* `Mi Fondo` y `mi fondo` son dos productos distintos, hoy y después.
4. **Un archivo cuyo valor se guardó pero que Drive no pudo mover a `procesados/` cuenta como guardado:** su valor ya está en la base.
5. **Decisión nueva en `docs/architecture.md` (ADR-033),** y una línea de revisión encima del ADR-026. Ningún ADR se reescribe.

## 📌 Consecuencias que te tocan a ti (no son código)

- **Cuando un archivo salga rechazado por esto, corrígelo o bórralo de Drive antes de volver a importar.** Si importas otra vez sin tocarlo, entra él solo (el otro ya está en `procesados/`) y sustituye el valor del primero: es lo mismo que «importar otro día un archivo corregido», y el sistema no puede distinguir uno de otro.
- **El frontend mostrará un texto genérico para este rechazo** («This file couldn't be imported.») con el mensaje del backend en el detalle, hasta que se añada el código nuevo a `gastos-frontend/src/features/import/fileMessages.ts` (leído hoy). Es una sesión aparte del frontend.

## ⚠️ Incoherencias conocidas que se heredan

- **El mismo nombre con otro tipo de producto** ya se rechaza hoy (el archivo dice «un producto no cambia de tipo») y sigue igual.
- **Dos productos distintos que por error llevan el mismo nombre y fechas distintas** siguen entrando como un solo producto: esta regla solo mira nombre **y** fecha.
- **Dos llamadas a `POST /api/import` a la vez** no se ven entre sí: cada una recuerda solo lo suyo.
