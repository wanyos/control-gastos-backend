# Plantilla de Resumen de Cierre

> **Esto lo escribe el REVIEWER, en lenguaje humano, al aprobar una feature.**
>
> Es la pieza de SALIDA, simétrica a `docs/intent-template.md` (la de entrada).
> Un archivo por feature en `progress/resumen_<feature>.md`.
>
> **Para qué sirve de verdad:** es lo que impide perder el hilo del proyecto.
> Dentro de un mes no vas a recordar qué feature dejó qué código. Este archivo
> te dice **qué sabe hacer la app que antes no** y **dónde vive cada pieza** que
> la feature creó o tocó, sin bucear en diffs de git.

## Las dos reglas del mapa de código

**1. Aparece TODO el código de la feature, agrupado por tema.** No es un
resumen ejecutivo: es un índice. Si algo se tocó y no está aquí, es código que
dentro de un mes nadie sabrá que existe.

**2. Archivo + símbolo, no archivo + línea.** El símbolo (la función, la clase,
el endpoint, el componente) se encuentra con una búsqueda y **no caduca**; el
número de línea se rompe en el commit siguiente y verificarlos uno a uno es caro.

Excepción: los **puntos de entrada** —3 a 6 como mucho, por donde se toca la
feature desde fuera— sí llevan línea y enlace clicable, porque son los que de
verdad se visitan. Formato: `[archivo.ext:NN](ruta/relativa#LNN)`, con la ruta
**relativa al propio resumen** (desde `progress/` suele ser `../src/...`). Esos
sí se verifican contra el código actual.

Otras reglas de estilo:

- En cristiano, sin jerga. Como si se lo explicaras a alguien que conoce el
  proyecto pero no ha visto este código.
- Cierra el círculo con el `intent`: por cada punto del `como_se_que_esta_bien`,
  di si se cumplió y dónde se verifica.

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

## Por dónde se toca (puntos de entrada)

> Los únicos con número de línea, y son clicables.

| Cómo se usa | Código |
| --- | --- |
| `POST /gastos` — crea un gasto | [routes/gastos.ts:18](../src/routes/gastos.ts#L18) |
| `GET /gastos?mes=` — lista el mes | [routes/gastos.ts:44](../src/routes/gastos.ts#L44) |

## Dónde está el código

> Todo lo que la feature creó o tocó, por tema. Archivo + símbolo: el símbolo se
> busca, la línea caduca.

### <Tema 1 — p. ej. Lógica de negocio>

| Qué hace | Símbolo | Archivo |
| --- | --- | --- |
| <valida y normaliza la entrada> | `parseGasto` | `src/services/gastos.ts` |
| <calcula el total del mes> | `totalDelMes` | `src/services/gastos.ts` |

### <Tema 2 — p. ej. Persistencia>

| Qué hace | Símbolo | Archivo |
| --- | --- | --- |
| <inserta y lee> | `GastoRepository` | `src/db/gastos.ts` |

### Tests

| Qué cubre | Símbolo | Archivo |
| --- | --- | --- |
| <camino feliz> | `test_crear_gasto` | `tests/gastos.test.ts` |
| <importe negativo> | `test_importe_invalido` | `tests/gastos.test.ts` |

## Cumplimiento de la intención

Por cada punto del `como_se_que_esta_bien` del `intent`:

- ✅ "<punto 1 de la intención>" → se cumple; lo verifica `test_xxx`.
- ✅ "<punto 2 de la intención>" → se cumple; lo verifica `test_yyy`.

## Decisiones que se tomaron por ti

Lo que en el spec estaba marcado `(delegado)` o `(añadido)`, recordado aquí:

- (delegado) <qué se decidió y dónde vive>.
- (añadido) <alcance que no pediste y se introdujo>.

## Qué NO se tocó / quedó fuera

- <los límites de lo hecho, para saber dónde termina esta feature>

## Notas para el futuro (opcional)

<Deuda técnica consciente o sugerencias fuera de scope que anotó el
implementer. Vacío si no hay.>
```

---

## Para qué sirve luego

Estos resúmenes son tu registro legible del proyecto: encadenados, cuentan qué
se construyó y en qué orden. `progress/history.md` es el índice de una línea por
feature que apunta a cada uno.

Puedes borrarlos cuando ya no aporten: el código y los tests siguen siendo la
fuente de verdad, esto es el mapa para llegar rápido.
