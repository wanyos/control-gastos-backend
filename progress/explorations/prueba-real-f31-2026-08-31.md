# Pasada real — `POST /api/import/local` del 2026-08-31

> **Qué es esto:** el registro de una ejecución de verdad, contra la base de datos
> real y las copias locales de `var/drive-read/`. **No lleva ni un importe ni un
> IBAN**: los números de las cuentas se le dieron al humano en la conversación y
> viven en su banco, no aquí.

## Qué se lanzó y con qué

- `POST /api/import/local` con cuerpo `{}` (todas las copias locales), contra el
  servidor que ya estaba levantado en el puerto 3000.
- HTTP **200** en **1,5 s**.

## Qué salió

| Contador | Valor |
|---|---|
| `importedCount` | **0** |
| `duplicateCount` | **1735** |
| `unparsedCount` | 0 |
| `failedCount` | **0** |
| `skippedCount` | 3 |
| `balanceMismatchCount` | **0** |

55 archivos recorridos: 52 `imported` (todos sus movimientos ya estaban dentro,
de ahí los 1735 duplicados y los 0 nuevos) y 3 `skipped`, los tres conocidos y
esperados:

- el `.xlsx` de MyInvestor — su parser de extracto solo lee `.csv`;
- el `.csv` de Revolut — banco aparcado, sin parser (decisión del 2026-08-20);
- el `.pdf` de Trade Republic — no se parsea a propósito (ADR-024).

**Ningún archivo ancló nada** (`anchored: false` en los 55) y **ningún saldo por
línea se rellenó** (`balancesFilled: 0`). Es lo correcto: las cuatro cuentas ya
estaban ancladas de antes, y el ancla se pone **una sola vez**.

## Lo que esto sí demuestra y lo que no

✅ **La comprobación de la F32 pasó sobre datos reales**: 52 archivos y 1735
movimientos comparados, **cero descuadres**. Es la primera vez que esa feature
corre fuera de fixtures.

✅ Las cuatro cuentas están ancladas, y hay al menos un extracto con la línea
`saldo;` en MyInvestor y otro en N26 — comprobado sobre los archivos de
`var/drive-read/`, sin leer los importes.

❌ **No demuestra que el saldo de cada cuenta sea el que dice el banco.** Eso solo
lo puede hacer el humano abriendo la web de cada banco: es el paso 2 del
checkpoint **C4 bis** y sigue siendo suyo.

## Cabo suelto que confirma

El `skipped` de la copia de MyInvestor es un `.xlsx` que **nadie va a leer nunca**:
su banco exporta el extracto en `.csv`. Mientras siga ahí, sale como `skipped` en
cada pasada. Cae bajo la regla del 2026-08-30 sobre archivos que sobran (ver
[`docs/dar-de-alta-un-banco.md`](../../docs/dar-de-alta-un-banco.md)), pero **no se
ha borrado nada**: la decisión es del humano.
