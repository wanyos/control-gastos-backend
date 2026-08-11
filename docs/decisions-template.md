# Plantilla de Hoja de Decisiones

> **Esto lo escribe el SPEC-AUTHOR, para el humano, junto a los otros tres
> archivos del spec.** Un archivo por feature en `specs/<feature>/decisions.md`.
>
> Es la pieza de REVISIÓN, la que el humano lee en la puerta de aprobación.
> Existe porque el spec se escribe para el agente pero se le da a revisar al
> humano, y son dos públicos distintos: EARS, procedencia, trazabilidad y ADR son
> maquinaria para el `implementer` y el `reviewer`; el humano necesita **las
> decisiones**. Sin esta hoja, quedan repartidas por cientos de líneas y revisar
> un spec cuesta horas.
>
> Reglas de estilo:
> - **Una página.** Si no cabe, el problema no es la hoja: es que la feature hace
>   demasiadas cosas (ver `docs/specs.md` §Las cuatro reglas de revisabilidad).
> - **Una línea por decisión.** Si una necesita un párrafo, es que hay que
>   partirla en dos o que su sitio son los archivos técnicos.
> - **Máximo 6 puntos en el bloque 🔴.** Más significa que estás mezclando
>   decisiones del humano con decisiones técnicas.
> - **Cada punto 🔴 lleva su alternativa concreta al lado.** «Confirma esto» sin
>   decir qué pasa si no, no es revisable.
> - En cristiano, sin jerga. El humano no va a abrir los otros tres archivos.
> - Enlaces clicables a archivo y línea cuando cites código, con la ruta relativa
>   a la propia hoja (desde `specs/<feature>/` son dos niveles: `../../src/...`).

---

## Plantilla (el spec-author la rellena)

```markdown
# Decisiones — F<id> `<name>`

> **Esto es lo único que necesitas leer para aprobar.** Los otros tres archivos
> (`requirements` / `design` / `tasks`) son material del implementer y del reviewer.
> Si algo de aquí no te convence, dilo y se cambia ahí; no hace falta que los abras.

**Qué hace:** <una o dos frases. Qué añade la feature y, sobre todo, qué NO toca.>

---

## 🔴 Confirma o corrige (<n>)

| # | Decisión | Alternativa si no te gusta |
|---|---|---|
| 1 | <La decisión, en una línea, con el número o el nombre concreto.> | <Qué se haría en su lugar y qué cuesta.> |

## ✅ Ya las cerraste tú (<n>)

- **<Decisión>.** <Una línea. Para que no la re-litigue.>

## ⚙️ Técnicas — decididas, no necesitan tu visto bueno (<n>)

1. **<Titular de la decisión>.** <Una línea de por qué.>
   ⚠️ *Efecto:* <solo si tiene una consecuencia que le pueda morder algún día.>

## 📌 Consecuencias que te tocan a ti (no son código)

- <Lo que el humano tendrá que hacer a mano, dar de alta, medir o decidir fuera
  del código. Es lo que más fácil se pierde entre features.>

## ⚠️ Incoherencias conocidas que se heredan

- <Algo que queda mal a propósito y dónde se resolverá. Omitir el bloque si no hay.>
```

---

## Qué NO va en esta hoja

- **Los requirements.** Van en `requirements.md`, en EARS, y el humano no los lee.
- **La procedencia requisito a requisito.** Es para el reviewer.
- **El diseño y las firmas.** Van en `design.md`.
- **Las alternativas descartadas con su razonamiento largo.** En la hoja va solo
  la alternativa viva de cada punto 🔴, en media línea.
- **Justificaciones de más de una línea.** Si necesitas argumentar, el sitio es
  `design.md`; aquí solo el titular y el coste.
