# specs/

> Carpeta de specs para el flujo **Spec Driven Development (SDD)**.
> Ver `docs/specs.md` para el proceso completo.

Cada feature marcada con `"sdd": true` en `feature_list.json` tiene aquí
una subcarpeta con sus tres archivos:

```
specs/<feature-name>/
├── requirements.md   # EARS notation, ids R1, R2, ...
├── design.md         # Decisiones técnicas + alternativa descartada
└── tasks.md          # Checklist T1, T2, ... que el implementer va marcando
```

Los archivos los crea el subagente `spec-author` antes de tocar código.
El humano los aprueba (o pide cambios) antes de pasar a `in_progress`.
