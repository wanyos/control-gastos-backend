# Decisiones — F40 `transfer-detection`

> **Esto es lo único que necesitas leer para aprobar.** Los otros tres archivos
> (`requirements` / `design` / `tasks`) son material del implementer y del reviewer.
> Si algo de aquí no te convence, dilo y se cambia ahí; no hace falta que los abras.

**Qué hace:** después de cada importación, cruza todos los movimientos sin marcar,
encuentra las parejas inequívocas de un traspaso entre dos cuentas tuyas (mismo
importe, direcciones opuestas, fechas pegadas) y les escribe el mismo `transferId`,
que es lo que los saca de los totales. **No toca** ningún otro campo, ni el ancla,
ni saldos, ni el descarte de duplicados; no borra ni crea movimientos; cero
migración (la columna existe desde la feature 8).

---

## 🔴 Confirma o corrige (4)

| # | Decisión | Alternativa si no te gusta |
|---|---|---|
| 1 | **Ventana de fechas: 3 días naturales** entre las fechas contables de las dos piernas (cubre fin de semana + un día de proceso). | 1 día (más estricto, puede perder un traspaso de viernes que el otro banco anota el lunes) o 7 (más casos dudosos que revisar). Es una constante: cambiarla cuesta una línea. |
| 2 | **Con más de un candidato del mismo importe, NADIE se empareja**: solo se marca una pareja cuando cada pierna es el único candidato posible de la otra. Los dudosos salen listados en el informe de la importación, con sus datos, para que los veas. | Elegir el candidato de fecha más cercana — empareja en silencio justo el caso dudoso, que es lo que dijiste que no querías. |
| 3 | **Corre al final de cada importación** (la de Drive y la de copias locales), sin endpoint propio. Para emparejar los 1.520 movimientos que ya tienes guardados, lanzas una vez `POST /api/import/local` tras el despliegue (relee las copias, todo sale duplicado, y al final corre la detección). | Un endpoint dedicado para lanzarla a mano — un endpoint más en el contrato para algo que cada importación ya dispara. Se puede añadir después sin rehacer nada. |
| 4 | **Deshacer una pareja NO entra en esta feature.** Un deshecho de verdad necesita que la app recuerde «estos dos no» (si no, la siguiente pasada rehace la pareja), y esa memoria es una columna nueva → migración → feature propia. Con la regla del punto 2, una pareja mal hecha exige dos movimientos de mismo importe, direcciones opuestas, cuentas distintas y 3 días, sin ningún otro candidato — y aun así, si aparece, se hace su feature. | Meterlo ya: ampliar `PATCH /api/movements/:id` para quitar el `transferId` + columna de exclusión para que no se rehaga. Cuesta una migración y ensancha esta feature. |

## ✅ Ya las cerraste tú (4)

- **Detección automática, sin marcado manual.** Lo descartaste el 2026-09-02.
- **Un caso dudoso no se empareja en silencio**: antes sin marcar que mal enlazado.
- **No se toca el ancla, ningún saldo ni el dedup de la importación.**
- **No se borra ni se modifica ningún movimiento** (solo se escribe el enlace).

## ⚙️ Técnicas — decididas, no necesitan tu visto bueno (5)

1. **El enlace de cada pareja es un identificador aleatorio único** — dos traspasos distintos nunca comparten enlace.
2. **Las dos piernas se escriben juntas o ninguna** (una transacción por pareja): nunca queda medio traspaso marcado.
3. **Cada pasada mira la tabla entera de movimientos sin marcar**, no solo lo recién importado: así la pierna que llega semanas después encuentra a la vieja sola.
4. **Un Bizum o una transferencia a un tercero ni se marca ni se lista** en el informe: sin pierna espejo no hay nada que decidir, y listarlos enterraría los dudosos de verdad.
5. **Si la detección falla, la importación no se pierde**: los movimientos quedan guardados y el fallo sale en el informe.

## 📌 Consecuencias que te tocan a ti (no son código)

- **Tras desplegar, lanza una vez `POST /api/import/local`** (sin cuerpo) para
  emparejar lo ya guardado: las ~36 parejas medidas el 2026-09-02 (44.550 EUR).
- **Mira la sección de dudosos del informe de esa primera pasada**: lo que salga
  ahí queda sin marcar a propósito, y hoy no hay forma de marcarlo a mano
  (decisión 4). Si sale mucho, se decide entonces qué hacer.
- Desde entonces, los totales de `GET /api/movements` (y el resumen de la F38
  cuando exista) bajarán: ese dinero dejará de contar como entrada y salida.
