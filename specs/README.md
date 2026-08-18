# specs/

> Carpeta de specs para el flujo **Spec Driven Development (SDD)**.
> Ver `docs/specs.md` para el proceso completo.

Cada feature marcada con `"sdd": true` en `feature_list.json` tiene aquí
una subcarpeta con sus cuatro archivos:

```
specs/<feature-name>/
├── decisions.md      # PARA EL HUMANO: una página. Ver docs/decisions-template.md
├── requirements.md   # EARS notation, ids R1, R2, ...
├── design.md         # Decisiones técnicas + alternativa descartada
└── tasks.md          # Checklist T1, T2, ... que el implementer va marcando
```

Los cuatro los crea el subagente `spec-author` antes de tocar código, pero
tienen **dos públicos distintos**:

- `decisions.md` es del **humano**: es lo único que lee para aprobar.
- Los otros tres son material del `implementer` y del `reviewer`. Al humano
  **no se le pide que los abra**; si necesita más detalle de una decisión, se
  lo resume el `leader`.

Ver `docs/specs.md §Las cuatro reglas de revisabilidad`.
