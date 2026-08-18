# Decisiones — F20 `trade-republic-product-file`

> **Esto es lo único que necesitas leer para aprobar.** Los otros tres archivos
> (`requirements` / `design` / `tasks`) son material del implementer y del reviewer.
> Si algo de aquí no te convence, dilo y se cambia ahí; no hace falta que los abras.

**Qué hace:** Trade Republic entra en el sistema con **un `.json` que rellenas tú
cada mes** con la foto de tu cuenta remunerada, y el backend te dice si está bien
o qué le falta. **No** se lee el PDF, **no** se toca la base de datos y **no** se
usa ni una línea del parser de MyInvestor.

---

## 🔴 Confirma o corrige (6)

| # | Decisión | Alternativa si no te gusta |
|---|---|---|
| 1 | **El archivo lleva 6 campos obligatorios:** `type`, `name`, `date`, `openedAt`, `balance` (el saldo) e `interest` (los intereses de ese mes). Opcionales: `currency`, `closedAt` y tus notas `_`. | Añadir también saldo inicial, entradas y salidas: tres valores más que teclear cada mes que no dicen nada nuevo (el saldo inicial de un mes es el final del anterior). |
| 2 | **Cadencia: un archivo por abono de intereses**, o sea uno al mes. Los tres valores que tecleas (`date`, `balance`, `interest`) salen de **la misma fila** del extracto; el resto se copia. Si un extracto cubre cuatro meses, escribes cuatro archivos. | Un archivo por extracto, con fecha de inicio y de fin: tendrías que **sumar los intereses a mano** cuando cubra varios meses, y se pierde la serie mes a mes. |
| 3 | **El IBAN NO va en la plantilla.** Es el único banco que lo da solo, pero hoy no hay quien lo use: sin base de datos, un IBAN no crea ninguna cuenta. Se añadirá el día de la importación. | Escribirlo igualmente: un dato real más, a mano, todos los meses, sin consumidor. |
| 4 | **El tipo de interés (TAE) NO va en la plantilla:** no está en el extracto. | Escribirlo: tendrías que ir a buscarlo a la app y acordarte de cambiarlo cada vez que el banco lo mueva. |
| 5 | **El archivo lleva `"type": "savings_account"`** aunque de momento sea el único valor admitido. | Quitarlo: un campo menos, pero el archivo deja de parecerse a los de MyInvestor y no queda sitio si algún día Trade Republic te aporta un segundo producto. |
| 6 | **El `.pdf` del extracto que sigue bajando a esa carpeta se lista como «ignorado», no como fallo.** | Tratarlo como fallo: tendrías un error rojo todos los meses por un archivo que hace bien en estar ahí. |

## ✅ Ya las cerraste tú (5, el 2026-08-17)

- **Nada de parser del PDF ahora.** El día que la cuenta tenga movimientos de
  verdad, se hace.
- **Esto no toca la base de datos**, igual que los productos de MyInvestor.
- **Trade Republic no usa el parser de MyInvestor:** son bancos distintos.
- **La plantilla lleva marcadores `<…>` en TODOS sus valores**, ninguno con
  aspecto real. Además se comprueba con un test: la plantilla copiada sin rellenar
  sale **rechazada**, nombrando todo lo que falta por sustituir.
- **En la puerta elegiste «foto del saldo, como los productos de MyInvestor»**
  frente a «extracto con los movimientos del mes».

## ⚙️ Técnicas — decididas, no necesitan tu visto bueno (7)

1. **Módulo propio** `src/modules/trade-republic/`, con su parser, su servicio y
   su ruta `POST /api/parser/trade-republic`. Un botón, como los otros dos bancos.
2. **La FORMA de la salida se copia de MyInvestor; el TIPO no se comparte.** La
   norma del proyecto es que el código que lee un formato no se comparte nunca y
   la forma de la salida sí — pero una cuenta con saldo e intereses **no es** un
   fondo ni un depósito, así que compartir el tipo obligaría a inventar un campo
   que MyInvestor nunca podría rellenar. Cada banco declara lo suyo.
3. **Lo protege un guardián que ya existe**, ampliado a este banco: si algún día
   alguien importa el parser de MyInvestor desde aquí, la suite se pone en rojo.
   Otro guardián comprueba que el módulo no menciona la base de datos.
4. **Un `products.json` por año**, con lo interpretado, lo que falló y lo
   ignorado; y **un archivo roto reporta todos sus problemas de golpe**, no el
   primero. Misma cortesía que MyInvestor.
5. **El archivo se lee en UTF-8 estricto** (la regla de la F17): si no está
   guardado en UTF-8, se rechaza entero diciendo dónde.
6. **El nombre del archivo no se valida**: la cuenta y la fecha salen de dentro.
   Recomendado, no obligatorio: `cuenta-remunerada-<AAAA-MM-DD>.json`.
7. **Cero dependencias nuevas.** ⚠️ *Efecto:* hay otra feature de banco (`n26`)
   escribiéndose en paralelo que toca los mismos tres archivos compartidos; los
   lotes finales se rebasan antes de tocarlos.

## 📌 Consecuencias que te tocan a ti (no son código)

- **Créate la plantilla en Drive**, en una carpeta **hermana** de `notas-banco/`,
  nunca dentro (todo lo que cuelga de ahí se toma por un banco). La referencia en
  el repo será `docs/trade-republic-product-files.md`, y **nadie comprueba que las
  dos coincidan**: cuando el formato cambie, se cambia ahí y tú actualizas Drive.
- **`openedAt` (el día que abriste la cuenta) lo sabes solo tú**: el extracto no
  lo trae. Se escribe una vez y se copia igual todos los meses.
- **Puedes seguir subiendo el PDF**: no molesta, sale listado como ignorado.
- **Cerrar la cuenta es escribir `closedAt` una vez.** Dejar de subir el archivo
  un mes **no** la cierra.
- **Avísanos el día que esa cuenta tenga movimientos de verdad**: ahí se revierte
  esto y se escribe el parser del PDF.

## ⚠️ Incoherencias conocidas que se heredan

- **Quedan dos formas de «producto escrito a mano» sin un contrato común**
  (MyInvestor y esta). Es deliberado: con un solo productor de cada una, sacar un
  contrato compartido sería inventárselo. **Se revisa cuando un tercer banco
  entre por `.json` a mano**, que es lo mismo que se hizo con los extractos al
  llegar el segundo banco.
- **El spec tiene 16 requirements, uno por encima del tope de ~15**, y no se
  parte la feature: cuatro son documentación y guardianes (no código nuevo) y
  cinco son la misma cortesía de errores partida en sus casos. Partirla dejaría
  una plantilla sin parser o un parser sin plantilla.
- **MyInvestor lee sus `.json` sin el UTF-8 estricto de la F17**
  ([`myinvestor.service.ts:132`](../../src/modules/myinvestor/myinvestor.service.ts#L132)).
  Este banco **no hereda** esa divergencia; arreglar la de MyInvestor queda
  anotado como sugerencia fuera de scope.
