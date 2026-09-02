# Decisiones — F26 `savings-account-as-product`

> **Esto es lo único que necesitas leer para aprobar.** Los otros tres archivos
> (`requirements` / `design` / `tasks`) son material del implementer y del reviewer.
> Si algo de aquí no te convence, dilo y se cambia ahí; no hace falta que los abras.

**Qué hace:** el `.json` que escribes cada mes de tu cuenta remunerada deja de
morir en un volcado y **entra en la base de datos** como un producto más, con una
foto por mes. **No cambia ni un campo de lo que tecleas**, no toca tus 4 cuentas ni
tus 455 movimientos, y el cuadre de los cinco importes sigue rechazando el archivo
**antes** de guardar nada.

---

## 🔴 Confirma o corrige (6)

| # | Decisión | Alternativa si no te gusta |
|---|---|---|
| 1 | **Solo entra Trade Republic.** Los 5 `.json` de MyInvestor siguen saliendo «ignorados» y entran en una feature hermana, que reutilizará todo lo que esta construye. **Recomendado.** | Meter también MyInvestor ahora: son 4 tipos de producto más y una segunda tabla de fotos, el spec se va de 15 a ~21 requirements y toca partirlo igual. Coste: la mitad del trabajo se hace a ciegas. Riesgo del recomendado: tus productos de MyInvestor siguen fuera de la base **un mes más**. |
| 2 | **Tus cinco importes van a una tabla nueva y propia** (`SavingsSnapshot`, una fila por mes), colgada del producto. La tabla de valoraciones que ya existe habla de «lo invertido» y «lo que vale hoy», y tu cuenta no invierte: crece con los intereses. Migración **aditiva**, sin mover ni una fila de las que tienes. | Encajarlos en la tabla de valoraciones: se perderían **tres de los cinco** (saldo inicial, entradas y salidas) y ya no podrías volver a comprobar el cuadre desde la base. Es la única alternativa que te quita algo de verdad. |
| 3 | **El IBAN sigue fuera de la plantilla.** Sigue sin tener quien lo lea: tu cuenta entra como **producto**, y los productos no tienen IBAN — el IBAN solo sirve para enganchar movimientos a una cuenta corriente, y esta cuenta no trae movimientos. | Meterlo: un dato real más que teclear cada mes, con una errata más posible, y nadie lo usa. Si lo quieres tener escrito «por si acaso», hoy ya puedes: escribe `"_iban"` y se ignora sin molestar. |
| 4 | **Entra por el botón de siempre**, `POST /api/import`, que aprende a distinguir un archivo de producto de un extracto. Un botón al mes, como ahora. | Una ruta aparte solo para productos: dos botones cada mes y acordarte de cuál va con cada archivo. |
| 5 | **`var/parsed/` sigue existiendo, pero cambia de oficio:** deja de ser la base de datos falsa y pasa a ser el **ensayo** — mirar qué ha entendido el sistema de tu archivo **sin** escribir nada en la base. | Borrarlo: te quedas sin forma de revisar un archivo antes de que entre. |
| 6 | **Un archivo que no cuadra no deja rastro:** no se guarda ni el producto ni la foto, **no** se mueve a «procesados» y se te dice el motivo entero. Puedes corregirlo y volver a subirlo. | Guardarlo igual y avisarte: el aviso vive en un volcado que no lees cada mes, así que el dato malo entraría. |

## ✅ Ya las cerraste tú (3)

- **Su sitio es el modelo de inversión.** «No me importa si la metemos como
  producto de inversión, creo que es su sitio». No se reabre.
- **El `.json` a mano es la forma de meter el dato, no el sitio donde vive.**
- **Nada de campos nuevos cada mes** salvo que sirvan para algo: por eso el punto 3.

## ⚙️ Técnicas — decididas, no necesitan tu visto bueno (5)

1. **Nada se calcula:** los cinco importes se guardan exactamente como los
   escribes. La base no inventa ni un céntimo.
2. **Subir el mismo mes dos veces sobrescribe; el mes siguiente añade.** La
   identidad de la cuenta es su **nombre** y la de la foto es su **fecha**: los dos
   los escribes tú y no los renumera nadie, que es lo que falló en la feature 25.
3. **Los dos guardados de un archivo van juntos o no van:** no puede quedarte un
   producto sin su foto.
4. **La respuesta te dice, por archivo, si la cuenta se ha creado o actualizado y
   si la foto de ese mes es nueva o se ha pisado.** Sin eso no podrías distinguir
   «se ha guardado» de «se ha vuelto a guardar lo mismo».
5. **El módulo de Trade Republic sigue sin tocar la base de datos** (lo guarda un
   test): quien escribe es el módulo de inversiones, no el del banco.

## 📌 Consecuencias que te tocan a ti (no son código)

- **El `name` de la cuenta es su identidad: si lo cambias en el archivo, se crea
  otra cuenta** y la serie anterior se queda colgando del nombre viejo. Escríbelo
  igual todos los meses. (Límite conocido del modelo desde la feature 9.)
- **`openedAt` por fin sirve para algo:** hasta hoy nadie lo guardaba. Sigue
  saliendo solo de tu cabeza; escríbelo igual todos los meses.
- **Cerrar la cuenta sigue siendo escribir `closedAt` una vez.** Dejar de subir el
  archivo un mes no la cierra, ahora tampoco.
- **Tu plantilla de Drive NO cambia.** No tienes que tocarla ni volver a copiarla.
- **Después de esta feature, revisa una vez que tu cuenta y sus meses están en la
  base** (prueba real con tu archivo, como en las dos últimas features).

## ⚠️ Incoherencias conocidas que se heredan

- **Los 5 `.json` de MyInvestor siguen fuera**, con el motivo «extensión no
  soportada por el parser de myinvestor». Se resuelve en la feature hermana del
  punto 1.
- **El mensaje del `.pdf` de Trade Republic seguirá siendo falso.** Tu `.json`
  dejará de reportarse como ignorado, pero el `.pdf` seguirá diciendo «no hay
  parser para el banco trade-republic», y **sí lo hay**: lo que no hay es parser de
  su extracto. Es un defecto conocido, está **fuera de esta feature** a propósito
  y necesita la suya.
- **Todavía no hay ninguna pantalla ni consulta** que te enseñe esos datos.
  Escribirlos es esta feature; leerlos es la siguiente.
- **La cuenta remunerada sigue sin aparecer en los totales de gasto e ingreso**,
  igual que el resto de productos de inversión: no es una cuenta corriente.

---

## ✅ Puerta de aprobación — APROBADA por el humano (2026-08-20)

**Las 6 decisiones del bloque 🔴 se aprueban tal y como venían recomendadas**, sin
cambios: solo Trade Republic, tabla propia para los cinco importes, IBAN fuera, entrada
por `POST /api/import`, `var/parsed/` como ensayo, y el archivo que no cuadra no deja
rastro. Sus palabras: «si apruebo la feature con las recomendaciones».

### Y una cosa más, que sale de la consecuencia del `name`

Al leer que **el nombre de la cuenta es su identidad**, decidió **corregir la errata
antes** de que se persista nada: la cuenta pasa a llamarse **`saving-account`** (hoy en
su archivo dice `saving-acount`, sin la `c`). Sus palabras: «sobre el nombre de la
cuenta quiero arreglar la errata, saving-account».

**Por qué importa el momento:** hoy no hay ni una fila guardada de esta cuenta, así que
el cambio **no cuesta nada**. Cambiarlo después de la primera importación crearía una
**segunda** cuenta y dejaría la serie anterior colgando del nombre viejo, que es
exactamente el límite que la página de decisiones le avisaba.

**Qué implica, y qué NO:**

- Él corrige el `name` en su `.json` de Drive (y en los meses que escriba luego).
- **La plantilla NO cambia**: el `name` es un marcador `<…>`, no un valor.
- **El código NO cambia**: el nombre es un dato suyo, no una constante del sistema.
  Ningún fixture ni test puede llevarlo escrito (ADR-017).
- La **prueba real** de esta feature (C4 bis) se hace con el archivo ya renombrado.
