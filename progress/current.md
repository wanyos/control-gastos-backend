# Sesión actual

> Este archivo se vacía al cerrar cada sesión y se mueve a `history.md`.
> Mientras trabajas, **mantenlo actualizado en tiempo real**, no al final.

- **Tarea en curso:** ninguna. Las 8 features están `done`; sus cierres en
  [`progress/history.md`](history.md). **No hay features `pending`:** el pipeline
  espera el próximo `intent` del humano.
- **Fecha:** 2026-08-06
- **Siguiente prevista:** **importación** — mapear el JSON del parser a la BD
  (auto-alta de cuenta, dedup de re-descargas y mover a `procesados/`). El modelo
  ya está listo; los contratos que hereda (invertir el array de Bankinter para
  calcular `daySequence`, descargar por días completos, reintento tras conflicto
  en el alta de cuenta) están en
  [`specs/data-model/design.md`](../specs/data-model/design.md) §9 y en
  [`summaries/data-model.md`](summaries/data-model.md).
- **Después:** **categorización por reglas** sobre el `description` y **detección
  de traspasos** (ambas decididas con el humano, ver la entrada de la F8 en
  `history.md`); luego los dashboards.

## Pendiente / notas

- ⚠️ **Breaking change vigente hacia el frontend:** `/api/expenses*` → 404. El
  contrato nuevo está en `docs/api-contract.md` y **aún no está consumido**; la
  feature del frontend se planificará contra él.
- ⏸ **TypeScript 7:** aparcado hasta que `typescript-eslint` lo soporte (≥ 7.1).
- 📌 **Columnas reservadas** del modelo, sin escritor todavía: `transferId`,
  `categoryId`, `paymentMethod`, `note`. Hasta que se rellenen, un traspaso
  interno cuenta en los totales globales (asumido: no hay dashboards aún).
- 📌 F7 `parser-english` se cerró sin resumen ni entrada en `history.md`.
  Revisado con el humano el 2026-08-06: **se deja así a propósito**.
- 👤 Muestras locales (gitignoreadas): extracto en `var/drive-read/bankinter/2026/`
  y su JSON parseado en `var/parsed/bankinter/2026/`.
