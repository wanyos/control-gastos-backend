# Sesión actual

> Este archivo se vacía al cerrar cada sesión y se mueve a `history.md`.
> Mientras trabajas, **mantenlo actualizado en tiempo real**, no al final.

- **Tarea en curso:** revisión de las decisiones pendientes de la **F13
  `myinvestor-products`**, para dejar su spec cerrada antes de implementarla.
  No hay código en vuelo.
- **Inicio:** 2026-08-11
- **Agente:** leader + spec-author

## Plan

El humano aportó dos cosas nuevas sobre cómo va a trabajar y pidió repasar lo que
quedaba abierto. Decisiones tomadas (2026-08-11):

### 1. La plantilla de los ficheros de inversión vive **fuera** de `notas-banco/`

Va a escribir los JSON de producto copiando una plantilla que quiere tener **en
Drive**, no en el repo. Eso chocaba con el parser: la spec da por producto **todo**
`.json` de la carpeta del banco, no valida nunca el nombre y trata una clave
desconocida como error — así que la plantilla habría salido como fichero roto en
cada parseo, o peor, se habría colado como un producto inventado.

Comprobado en el código dónde puede vivir sin que el backend la vea:

| Ubicación | Qué pasa |
|---|---|
| `notas-banco/plantillas/` | la toma por **un banco** ([`drive-structure.ts:371`](../src/lib/drive-structure.ts#L371)) |
| `notas-banco/myinvestor/plantillas/` | la toma por **un año** ([`drive-structure.ts:392`](../src/lib/drive-structure.ts#L392)) |
| **hermana de `notas-banco/`** | ✅ invisible para el backend |

**Decidido:** carpeta hermana de `notas-banco/`. Es deber del humano, no código.

### 2. Ya NO habrá ficheros `.txt` en la carpeta del banco

Eran sus tres capturas de la web. La lista de `ignored[]` de la F10 **se queda
igual**: pierde su motivo original pero sigue siendo la red que hace visible
cualquier fichero que se cuele, sin contarlo como fallo.

### 3. IBAN y saldo de la cuenta corriente: **por API, no en el fichero**

El humano dijo que «los rellena él»; aclarado que lo hace **al dar de alta la
cuenta**, una sola vez, y **no** editando el CSV cada mes. **No toca código: la
F10 se queda como está** (emite `null` en ambos, que es lo correcto).

🔴 **Consecuencia para la E7 (Consultar):** hoy el saldo de una cuenta sale del
`balanceAfter` del movimiento más reciente, y MyInvestor **no lo trae nunca**. El
«plan B» de la F8 —sumar desde `initialBalance`— deja de ser la excepción y pasa
a ser **el único camino para esta cuenta**. Hay que exigírselo a la feature de
consulta cuando se escriba.

### 4. Los cinco puntos rojos de la F13: cuatro se aprueban, **el nº1 cambia**

- 🔄 **nº1 — los números van como número JSON puro (`1312.72`), no entre comillas
  en formato español.** Las fechas siguen en `AAAA-MM-DD`.
  **Efecto de arrastre:** la F13 ya **no** necesita `parseAmountText` (la pieza que
  la F10 construyó y que su spec daba por consumida); a cambio aparece un error
  nuevo: que el valor venga como texto en vez de como número.
- ✅ nº2 `date` obligatorio también en el depósito · nº3 choque producto+fecha se
  queda con el primero alfabético y reporta el otro · nº4 clave desconocida =
  error salvo las que empiezan por `_` · nº5 volcado a un `products.json` por año.

## Bitácora

- ✅ **F9, F11 y F10 cerradas y commiteadas** en cuatro commits verificados uno a
  uno en un worktree (197 → 220 → 230 → 280 tests). Ver [`history.md`](history.md).
- ✅ **Las cuatro decisiones propagadas** a
  [`specs/myinvestor-products/`](../specs/myinvestor-products/) por el `spec-author`.
  Changelog de cinco líneas al final de
  [`specs/myinvestor-statement/CHANGELOG-respec.md`](../specs/myinvestor-statement/CHANGELOG-respec.md).
  La F13 sigue en `spec_ready`; no se ha tocado `feature_list.json` ni código.
  ⚠️ Una corrección al porqué de la decisión 1 (el sitio de la plantilla): una carpeta
  dentro del banco **no** se toma por un año —el listado filtra por nombre de cuatro
  cifras ([`drive-structure.ts:399`](../src/lib/drive-structure.ts#L399))—; el motivo
  que sí se sostiene es que cualquier carpeta colgada de `notas-banco/` se toma por un
  banco ([`:365`](../src/lib/drive-structure.ts#L365)). La decisión no cambia.
- ✅ **Lista de campos cerrada** (2026-08-11). De las 19 casillas solo 3 necesitaban
  decisión, y el humano las resolvió:
  - **`closedAt` es campo del archivo**, en los dos tipos, escrito por él **una sola
    vez** el último mes del producto. Deja de ser un campo inventado sin dueño: la
    columna `InvestmentProduct.closedAt` de la F9 **ya tiene escritor**.
  - **`currency` se queda opcional** y no se teclea nunca; se asume `EUR`.
  - 🔄 **El archivo del depósito se escribe SOLO al contratarlo y al vencer**, no cada
    mes. Sus condiciones no fluctúan, así que no hay serie que conservar. No obliga a
    cambiar el spec, pero **sí cambia su rutina mensual**, así que queda escrito.
  - Coste mensual resultante: **5 valores** por fondo o ETF, **6** en la cartera,
    **nada** en los depósitos salvo cuando pasa algo.
- ✅ **`intent` de la F12 `import` cerrado por el humano** y `acceptance` derivado
  (12 criterios). Tres decisiones: mover a `procesados/` **tras guardar** (retoca la
  F5, cierra el cabo suelto #1), **importación parcial guarda lo bueno** y reporta el
  resto, y el guardado de **productos de inversión queda fuera** (su regla de
  duplicado es la contraria: recargar sobrescribe).
- 🎉 **No queda ningún `intent` en borrador ni ninguna decisión esperando al humano.**
- ⏭ **Siguiente, cuando se quiera:** implementar la F13 (spec ya cerrado) y escribir
  el spec de la F12 (`sdd: true`, aún sin carpeta en `specs/`). Y las **pruebas de la
  aplicación real** que pidió el humano.
