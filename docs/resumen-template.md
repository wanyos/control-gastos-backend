# Plantilla de Resumen de Cierre

> **Esto lo escribe el REVIEWER, en lenguaje humano, al aprobar una feature.**
>
> Es la pieza de SALIDA, simétrica a `docs/intent-template.md` (la de entrada).
> Su objetivo: que el humano entienda QUÉ se hizo y DÓNDE está el código, sin
> tener que bucear en diffs de git. Un archivo por feature en
> `progress/resumen_<feature>.md`.
>
> Reglas de estilo:
> - En cristiano, sin jerga. Como si se lo explicaras a alguien que conoce el
>   proyecto pero no ha visto este código.
> - Archivo y línea concretos en la tabla de "Dónde está el código", para ir
>   directo. Formato `ruta/archivo.ext:línea`.
> - Cierra el círculo con el `intent`: por cada punto del
>   `como_se_que_esta_bien`, di si se cumplió y dónde se verifica.

---

## Plantilla (el reviewer la rellena)

```markdown
# Resumen — feature <id> `<name>`

Fecha de cierre: <YYYY-MM-DD>
Intención original: `feature_list.json` → feature `<name>`, bloque `intent`
Spec (si SDD): `specs/<name>/`

## Qué hace ahora la app que antes no

<Una o dos frases en cristiano. Ej: "Ahora puedes registrar un gasto con
importe, categoría y fecha, y queda guardado. Antes no había forma de meter
gastos.">

## Por dónde se usa (puntos de entrada)

<Cómo se toca esto desde fuera: endpoint, comando, botón, función pública.>
- Ej: `POST /gastos` — crea un gasto nuevo.
- Ej: `GET /gastos?mes=2026-07` — lista los gastos de un mes.

## Dónde está el código (para revisión directa)

| Qué | Archivo:línea |
|-----|---------------|
| <handler / componente / función> | `src/....ext:NN` |
| <modelo / validación> | `src/....ext:NN` |
| <test principal> | `tests/....ext:NN` |

## Cumplimiento de la intención

Por cada punto del `como_se_que_esta_bien` del `intent`:

- ✅ "<punto 1 de la intención>" → se cumple; verificado en `tests/....ext:NN`.
- ✅ "<punto 2 de la intención>" → se cumple; verificado en `tests/....ext:NN`.

## Decisiones que se tomaron por ti

Lo que en el spec estaba marcado como `(delegado)` o `(añadido)`, recordado
aquí para que lo tengas presente:

- (delegado) <qué se decidió y dónde vive>. Ej: "el backend avisa con el
  campo `companies[]`; se lee en `src/api/login.ext:NN`."
- (añadido) <alcance que no pediste y se introdujo>. Ej: "si el mes no tiene
  gastos, devuelve lista vacía en vez de error."

## Qué NO se tocó / quedó fuera

<Los límites de lo hecho, para que sepas dónde termina esta feature.>
- Ej: no se toca el borrado de gastos (queda para otra feature).
- Ej: no hay paginación todavía.

## Notas para el futuro (opcional)

<Deuda técnica consciente, sugerencias fuera de scope que anotó el
implementer, o cosas a vigilar. Vacío si no hay.>
```

---

## Para qué sirve luego

Estos resúmenes son tu registro legible del proyecto. Puedes conservarlos como
documentación viva o borrarlos cuando ya no aporten: el código y los tests
siguen siendo la fuente de verdad, esto es solo el mapa para llegar a ellos
rápido.
