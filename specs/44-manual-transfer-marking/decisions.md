# Decisiones — F44 `manual-transfer-marking`

> **Esto es lo único que necesitas leer para aprobar.** Los otros tres archivos
> (`requirements` / `design` / `tasks`) son material del implementer y del reviewer.
> Si algo de aquí no te convence, dilo y se cambia ahí; no hace falta que los abras.

**Qué hace:** te deja enlazar a mano dos movimientos como las dos piernas de un
traspaso (con la compatibilidad obligatoria: importe igual, direcciones opuestas,
cuentas distintas), y deshacer una pareja —tuya o de la detección— de forma que la
siguiente pasada no la rehaga. **No toca** la detección sobre lo no deshecho, ni
ningún otro campo de ningún movimiento, ni crea o borra movimientos; sin pantalla,
solo API. Lleva **una migración** (la columna que recuerda el enlace deshecho, la
que la decisión 4 de la F41 ya anticipó): la primera desde la feature 9.

---

## 🔴 Confirma o corrige (5)

| # | Decisión | Alternativa si no te gusta |
|---|---|---|
| 1 | **Dos endpoints propios: `POST /api/transfers` enlaza (le pasas los dos ids) y `DELETE /api/transfers/:transferId` deshace.** El enlace lo fabrica el servidor, las dos piernas se escriben juntas o ninguna. | Ampliar el `PATCH /api/movements/:id` de la F37 — obligaría a editar de uno en uno un hecho que es de dos, y a que el cliente pudiera inventar el valor del enlace. |
| 2 | **Enlazar a mano NO exige la ventana de 3 días: tú mandas aunque las fechas estén lejos.** El resto de la compatibilidad (importe, direcciones, cuentas) sí es obligatorio siempre. | Exigir la misma ventana que la detección — dejaría sin remedio justo los traspasos lentos que la detección no puede resolver. |
| 3 | **La memoria del deshecho es una columna nueva en el movimiento que guarda el enlace que se deshizo**: la detección nunca vuelve a juntar a dos que comparten ese valor. Límite asumido: cada movimiento solo recuerda su ÚLTIMO deshecho (si deshaces dos veces sobre el mismo movimiento, el veto viejo se pisa). | Una tabla aparte que recuerda TODOS los deshechos — sin ese límite, pero un modelo y un join más para un caso que hoy no tienes. |
| 4 | **Deshacer una pareja manual también apunta la memoria**, igual que una de la detección: una sola regla, y volver a enlazarla a mano sigue siendo posible siempre. | Que solo las parejas de la detección dejen memoria — ahorra una escritura y crea dos comportamientos distintos para el mismo botón. |
| 5 | **Un movimiento con pareja deshecha sigue entrando en la detección para emparejarse con OTROS**: el veto es de la pareja, no del movimiento. Si la detección enlazó mal A–B y lo deshaces, la siguiente pasada aún puede encontrar sola el A–C correcto. | Excluirlo del todo de la detección hasta que lo toques a mano — más conservador, pero te obliga a enlazar a mano también lo que la detección sí sabría hacer. |

## ✅ Ya las cerraste tú (4)

- **Compatibilidad obligatoria al enlazar**: importe igual, direcciones opuestas,
  cuentas distintas tuyas. Un enlace incompatible se rechaza con error claro.
- **Solo se escribe el enlace y su memoria de deshecho**: ningún otro campo
  cambia, nada se borra ni se crea (mismo principio que en la detección).
- **Esto no sustituye a la detección**: F40 y F41 siguen exactamente igual sobre
  lo que no tocas a mano; es el remiendo para lo que ellas no pueden.
- **Sin pantalla**: solo API; el frontend llegará después.

## ⚙️ Técnicas — decididas, no necesitan tu visto bueno (5)

1. **Los errores reutilizan los códigos de siempre** (400 incompatible, 404 no
   existe, 409 ya enlazado): ningún código nuevo en el contrato.
2. **Misma escritura protegida que la detección**: identificador aleatorio
   propio, las dos piernas en una transacción, y si otra escritura llegó antes
   se rechaza en vez de pisar nada.
3. **Un movimiento de importe cero (`neutral`) no puede ser pierna** de un
   enlace manual, igual que la detección lo excluye.
4. **La columna nueva no sale en `GET /api/movements`**: es maquinaria interna
   de la detección; si el frontend la necesita algún día, se expone entonces.
5. **Un grupo dudoso que contiene una combinación deshecha queda dudoso entero**
   (la doctrina de la F41: donde hay duda no se elige en silencio).

## 📌 Consecuencias que te tocan a ti (no son código)

- **Tras desplegar puedes resolver por fin el caso vivo** (las 2×500 de
  Bankinter del 2024-09-12 con la entrada de N26 del 2024-09-13): busca los ids
  con `GET /api/movements` y llama a `POST /api/transfers` con la entrada de N26
  y **una** de las dos salidas — son idénticas, da igual cuál, los totales salen
  igual. Sin pantalla todavía: es una llamada HTTP a mano.
- **La otra salida de 500 seguirá contando como gasto** (es lo correcto: no tiene
  pierna espejo) y **dejará de salir como dudosa** en el informe de importación,
  porque el grupo queda resuelto.
- **La migración corre sola en el despliegue** (`prisma migrate`); no tienes que
  tocar ninguna base a mano, tampoco la de tests.
