# Sesión actual

> Este archivo se vacía al cerrar cada sesión y se mueve a `history.md`.
> Mientras trabajas, **mantenlo actualizado en tiempo real**, no al final.

- **Tarea en curso:** ninguna. Las 6 features están `done`; sus cierres en
  `progress/history.md`. **No hay features `pending`:** el pipeline espera el
  próximo `intent` del humano.
- **Fecha:** 2026-08-04
- **Siguiente prevista:** **persistencia** — modelo de BD (cuentas, movimientos,
  categorías, traspasos), guardar los movimientos parseados y el **dedup** de
  re-descargas (el `saldo` corrido ayuda a distinguir solapamientos de
  repeticiones legítimas). El humano ya tiene un borrador del esquema en
  `docs/data-model.md`; se convertirá en el `intent` (probablemente SDD).

## Pendiente / notas

- ⏸ **TypeScript 7:** aparcado hasta que `typescript-eslint` lo soporte (≥ 7.1).
- 🔎 No bloqueante (f6): un importe `0` cae hoy en `ingreso`; decidir su
  tratamiento cuando llegue la persistencia.
- 👤 Muestras locales (gitignoreadas): extracto en `var/drive-read/bankinter/2026/`
  y su JSON parseado en `var/parsed/bankinter/2026/`.
