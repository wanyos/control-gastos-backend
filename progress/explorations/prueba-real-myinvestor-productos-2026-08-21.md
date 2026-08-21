# Prueba real de la F29 — los 5 productos de MyInvestor entran en la base

> 🔒 **Ni un dato real en este archivo** (ADR-017): ni importes, ni valoraciones, ni los
> nombres que él da a sus productos. Solo **recuentos y forma**.

**Qué es esto:** el checkpoint **C4 bis** de la F29, exigido por el reviewer, que lo
bloqueó por esto y solo por esto. Su argumento, que era el bueno: el parser es el mismo
de siempre, pero **la vía de lectura es nueva** —en el ensayo el archivo se lee del disco
como texto; por el importador llega como `Buffer` y pasa por `decodeUtf8Strict`, un
guardián por el que sus `.json` **nunca habían pasado**—. Es la clase de defecto que este
checkpoint ya cazó en la F22 con 628 tests en verde.

## Comprobación previa: el BOM

El reviewer midió que un `.json` guardado **con BOM** se rechaza por esta vía con «JSON
inválido» (defecto **heredado del parser**, que esta feature tenía prohibido tocar). Se
comprobaron los cinco archivos antes de lanzar nada: **ninguno lleva BOM**, los cinco
empiezan por `{`. El riesgo no se materializa hoy; queda anotado por si algún mes uno se
reguarda con otro editor.

## Estado de partida

4 cuentas · 455 movimientos · **1 producto** (su cuenta remunerada, F26) · 1 foto ·
**0 valoraciones**.

## Pasada 1 — `POST /api/import`

Los **5 archivos de producto**: `imported`, los cinco, **producto creado** en los cinco.
0 fallidos, 0 sin parsear. Lo que quedó `skipped` es lo esperado y ya sabido: el `.csv`
de Revolut (sin parser) y el `.pdf` de Trade Republic.

Comprobado **dentro de la base**, agrupando por tipo:

| Tipo | Productos | Valoraciones | Con condiciones de depósito |
|---|---|---|---|
| fondo | 1 | **1** | 0 |
| ETF | 1 | **1** | 0 |
| cartera gestionada | 1 | **1** | 0 |
| **depósito** | 2 | **0** | **2** |
| cuenta remunerada (F26) | 1 | 0 | 0 |

✅ **La regla del ADR-012 se cumple sobre datos reales**: lo que fluctúa guarda una
valoración por fecha; **un depósito no guarda ni una**, y sus condiciones viven en el
propio producto. No es que el código lo diga: es que la base lo enseña.

✅ **La F26 no se ha movido**: su cuenta remunerada sigue con su foto y sin valoraciones,
que es su forma correcta.

✅ **Cuentas y movimientos intactos: 4 y 455.**

## Pasada 2 — la misma tanda otra vez, por la vía de la F25

`POST /api/import/local` sobre las copias locales de ese banco y año:

- los cinco productos: **`created: false`** — los mismos, no cinco nuevos;
- la base sigue con **6 productos y 3 valoraciones**, exactamente lo de la pasada 1;
- de propina, el **extracto** de ese banco volvió a pasar por la misma llamada y reportó
  **11 duplicados y 0 importados**: la deduplicación de movimientos también aguanta.

✅ **La idempotencia se cumple sobre datos reales**, y por la vía de reimportar, que es
donde más daño haría fallar.

## Lo que sigue igual y ya se sabía

- **Revolut** sigue sin parser: aparcado hasta que su archivo traiga datos.
- El motivo del `.pdf` de Trade Republic **sigue siendo falso** («no hay parser para el
  banco»): cabo suelto conocido, con su sitio en el roadmap.
- Los **contadores** de la respuesta siguen contando movimientos y no productos: cinco
  productos entraron y el resumen dice `importedCount: 0` (cabo suelto nº 13).
- **Todavía no hay ninguna vista** que le enseñe nada de esto.
