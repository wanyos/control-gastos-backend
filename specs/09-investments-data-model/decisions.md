# Decisiones — F9 `investments-data-model`

> **Esto es lo único que necesitas leer para aprobar.** Los otros tres archivos
> (`requirements` / `design` / `tasks`) son material del implementer y del reviewer.
> Si algo de aquí no te convence, dilo y se cambia ahí; no hace falta que los abras.

**Qué hace:** añade dos tablas —`InvestmentProduct` (el producto) y `Valuation` (su foto
en una fecha)— y una columna nueva en `Movement`. Solo esquema y migración: sin endpoints,
sin parser, sin importador. Nada del modelo del flujo cambia.

---

## 🔴 Confirma o corrige (2)

| # | Decisión | Coste de cambiarla |
|---|---|---|
| 1 | **Un depósito no debería tener valoraciones, pero la base de datos no lo impide.** Queda como regla del servicio, igual que las demás reglas de negocio del proyecto. | Impedirlo de verdad exige un `CHECK` en SQL crudo, y eso rompe el «cero SQL crudo» que es lo mejor que tiene esta feature. |
| 2 | **Techo de importes: ~100 millones de €** (`Decimal(10,2)`), heredado del modelo del flujo. | Subirlo es barato, pero hay que hacerlo **en las dos capas a la vez** o los totales dejan de cuadrar. |

## ✅ Ya las cerraste tú esta semana (4)

- **El efectivo sin invertir va aparte del valor de mercado.** El patrimonio de un producto
  es `marketValue + uninvestedCash`. Lo confirmaste con la web delante y lo prueba la muestra.
- **Del depósito se guarda una sola TAE, la que se te aplica** (3 %). La otra no se guarda.
- **`closedAt` lo escribes tú en el fichero.** Dejar de escribir un producto **no** lo cierra:
  un olvido no puede parecer una decisión.
- **La ganancia y el porcentaje son obligatorios en el fichero** (nullable en la BD, por si acaso).

## ⚙️ Técnicas — decididas, no necesitan tu visto bueno (7)

1. **Dos tablas, no una por tipo.** Las cuatro columnas propias del depósito viven en la tabla
   de productos y quedan vacías en fondo, ETF y cartera.
2. **`invested` vive en la foto, no en el producto.** Es lo que permite distinguir «subió porque
   metí dinero» de «subió porque el mercado subió». El `principal` del depósito sí va en el
   producto: se contrata una vez.
3. **Clave del producto: `(banco, nombre)`.** Basta porque el nombre lo escribes tú.
   ⚠️ *Efecto:* si renombras un producto en el fichero, el importador lo tomará por uno nuevo.
4. **Clave de la foto: `(producto, fecha)`.** Da el dedup gratis y además sirve la consulta de
   patrimonio sin ningún índice extra.
5. **Recargar el mismo fichero sobrescribe** (gana el último), a diferencia de los movimientos,
   donde un duplicado se descarta.
6. **Cero SQL crudo.** Todos los índices son declarativos, así que Prisma los conoce y no puede
   haber desincronización.
7. **`Valuation` no lleva `origin` ni `status`,** y el producto no lleva enum de estado: solo
   `closedAt`. Copiar esas columnas del modelo del flujo habría sido copiar la forma sin el motivo.

## 📌 Dos reglas nuevas que entran en el modelo

- **La valoración se lee, no se calcula.** Nunca se guarda `ganancia = valor − invertido`.
- **Una aportación no se crea, se marca.** Tu ingreso mensual ya está en el extracto; lo único
  propio es `Movement.productId`, y con él deja de contar como gasto del mes.
