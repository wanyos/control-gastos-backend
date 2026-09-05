# Decisiones — F37 `categories-and-tagging`

> **Esto es lo único que necesitas leer para aprobar.** Los otros tres archivos
> (`requirements` / `design` / `tasks`) son material del implementer y del reviewer.
> Si algo de aquí no te convence, dilo y se cambia ahí; no hace falta que los abras.

**Qué hace:** te deja renombrar y borrar categorías, ponérsela (y quitársela) a
un movimiento, dar un movimiento por revisado (y volver atrás), y siembra tus 16
categorías de arranque. NO toca importes, saldos, totales ni la importación, y
los movimientos siguen sin poder crearse ni borrarse por la API.

---

## 🔴 Confirma o corrige (4)

| # | Decisión | Alternativa si no te gusta |
|---|---|---|
| 1 | **Borrar una categoría en uso se impide** (error con el nº de movimientos que la usan); solo se borra una libre. | Que el borrado deje esos movimientos sin categoría, de golpe: más cómodo, pero un despiste te deshace meses de categorización manual sin aviso. |
| 2 | **La siembra es un comando que ejecutas tú una vez**: `pnpm run seed:categories`. Ni migración ni al arrancar: nada se siembra solo. | Sembrar en una migración (automático, pero mete las 16 en todas las bases de test) o al arrancar (cada arranque re-crearía el nombre viejo de una que renombraras). |
| 3 | **Categoría y revisado viajan juntos**: una sola petición a un movimiento con `categoryId` y/o `status`, y nada más puede cambiarse por ahí. | Dos peticiones separadas (una para la categoría, otra para el estado): más piezas y dos llamadas para el gesto habitual de «categorizo y doy por bueno». |
| 4 | **La categoría tiene que casar con el movimiento**: una de gasto solo va en un gasto, una de ingreso solo en un ingreso; un movimiento de importe 0 no se categoriza. Esto no lo pediste; lo añado yo. | Permitir cualquier cruce: más libre, pero «Nómina» sobre un recibo de luz solo puede ser un error de dedo y nadie te avisaría. |

## ✅ Ya las cerraste tú (5)

- **La lista de arranque**: tus 16 (13 de gasto, 3 de ingreso), salidas de tus
  1520 movimientos reales. Es punto de partida, no jaula.
- **«Sin categoría» no es una categoría**: es simplemente no tener ninguna.
- **Sin subcategorías por ahora.**
- **Nada de categorías de traspaso ni de aportación**, ni marca «no es gasto»:
  eso irá por sus propias marcas en features posteriores.
- **Categorizar no cambia importes, saldos ni la importación** (hay test que
  compara el saldo y los totales antes y después).

## ⚙️ Técnicas — decididas, no necesitan tu visto bueno (3)

1. **Renombrar solo cambia el nombre**: el tipo (gasto/ingreso) de una
   categoría no se puede cambiar — convertiría categorías con movimientos
   colgando en incoherentes.
2. **Cero cambios en la base de datos**: las columnas existen desde la F8; esta
   feature solo les da quien las escriba por API.
3. **Los errores reutilizan los códigos de siempre** (400/404/409); ningún
   código nuevo en el contrato.

## 📌 Consecuencias que te tocan a ti (no son código)

- **Ejecutar `pnpm run seed:categories` una vez** cuando la feature esté
  cerrada, para dar de alta las 16.
- ⚠️ Si algún día **renombras** una sembrada y **vuelves a ejecutar** el
  comando, el nombre viejo reaparecerá como categoría nueva (el comando crea lo
  que falta, no sabe de renombres). Ejecútalo una vez y ya.
- Tus **1520 movimientos siguen todos sin revisar y sin categoría**: esta
  feature te da la herramienta; revisarlos y categorizarlos es trabajo tuyo (a
  mano por API hasta que el frontend tenga pantalla).

## ⚠️ Incoherencias conocidas que se heredan

- El intent decía que hoy las categorías «solo se leen», pero **crear y listar
  ya existen desde la F8** (comprobado en el código el 2026-09-02): esta
  feature no los toca, añade renombrar, borrar, asignar y sembrar.
- La **categorización automática por reglas** sigue pendiente (feature
  posterior): aquí todo se pone a mano, como pediste.
