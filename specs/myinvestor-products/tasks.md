# Tasks — Feature 13: myinvestor-products

> Checklist ejecutable de `design.md`. El `implementer` marca `[x]` al completar cada
> task; el `reviewer` rechaza si queda alguna `[ ]` sin justificación documentada.
> Cada task referencia los `R<n>` de `requirements.md` que cubre.
>
> **Numeración `T<n>` continuada de la spec original** (la F10 se queda con T1-T12 y
> T14-T22 en su parte); aquí se conservan los identificadores que ya tenían las tareas
> de productos y se añaden los del cierre propio.

## ⏸️ Antes de empezar — lee esto entero

- ⏸️ **NO implementes nada hasta que la F10 `myinvestor-statement` esté `done`.** Esta
  feature **amplía** su módulo: si no existe, no hay nada que ampliar.
- ✅ **No queda nada pendiente del humano.** Los CINCO puntos 🔴 de `decisions.md` y la
  **lista de campos** (`design.md` §7, registro en
  [`CAMPOS-cerrados.md`](CAMPOS-cerrados.md)) se cerraron el **2026-08-11**. La única
  espera es que la F10 esté `done`.
- 🔴 **Los números de los archivos de producto son NÚMERO JSON NATIVO** (`8440.60`), no
  texto: **no importes `parseAmountText` ni escribas ningún normalizador aquí**
  (`design.md` §6.1). Un valor numérico que llegue como texto es un fallo del archivo
  (R77), nunca se interpreta.
- 🔴 **No re-crees nada de la F10:** `myinvestor.format.ts`, `myinvestor.service.ts`,
  `myinvestor.routes.ts`, `myinvestor.fixture.ts` y los tipos `FailedFile`/`IgnoredFile`
  **ya existen**. Se **amplían** (§1). Un segundo normalizador de números para el mismo
  banco es exactamente lo que este corte quiere evitar.
- 🔴 **`pnpm`, nunca `npm`.** **Cero dependencias nuevas**: `JSON.parse` es nativo y la
  validación va a mano (`design.md` §9.5).
- 🔴 **Los fixtures son SINTÉTICOS.** Jamás copies cifras, nombres de producto ni
  archivos reales de `var/drive-read/` (`docs/conventions.md` §Tests). 🔒 **Y las cifras,
  nombres y fechas que aparecen en este spec ya son inventados a propósito**: úsalos tal
  cual o inventa otros, pero **no los sustituyas** por los de las capturas reales.
- 🔴 **No toques** `prisma/`, los módulos del flujo, `src/lib/`, `src/errors/`, el módulo
  de parser de otro banco, ni `specs/investments-data-model/`.
- ⚠️ Convenciones: comillas simples, sin `;`, 2 espacios, 100 columnas, imports relativos
  con `.js`, `import type` para tipos, dominio en inglés.

---

## Fase 1 — Formato y tipos (ampliar lo que ya existe)

- [x] T2b — Añadir `parseIsoDate` (`AAAA-MM-DD` estricto, validando el calendario) a
      `src/modules/myinvestor/myinvestor.format.ts`, **sin tocar** `parseAmountText` ni
      `parseStatementDate` (`design.md` §6.2). Cubre: R28.

- [x] T3b — Ampliar `myinvestor.format.test.ts` con los casos de ISO: `2027-07-04`
      aceptada; `04/07/27`, `04/07/2027` y `2027-13-01` rechazadas. Cubre: R28.

- [x] T1b — Añadir a `src/modules/myinvestor/myinvestor.types.ts` los tipos de producto
      (`InvestmentProductType`, `ParsedValuation`, `ParsedDepositTerms`, `ParsedProduct`,
      `MyinvestorProductsResult`, `ParsedProductSummary`), literal como en `design.md`
      §13, **sin tocar** el alias del contrato del extracto. Cubre: R22, R35, R36.

## Fase 2 — El parser puro de un archivo de producto

- [x] T7 — Crear `src/modules/myinvestor/myinvestor.product.parser.ts`
      (`parseMyinvestorProduct(file, content)`): `JSON.parse` con captura, validación a
      mano de `type` (los cuatro valores), `name`, `date`, `currency` (def. `'EUR'`),
      `closedAt`, y de los campos obligatorios **según el tipo** (valoración para
      `fund`/`etf`/`managed_portfolio`; condiciones para `deposit`); los campos numéricos
      se exigen como **número JSON nativo y finito**, conservando el valor tal cual (sin
      redondear ni reformatear) y **rechazando el texto** con un motivo explícito (R77);
      **importa** `parseIsoDate` del formato del banco y **no importa `parseAmountText`**
      (`design.md` §6.1); trata ausente y `null` como no informado; **acumula todos los
      problemas** del archivo en un solo `reason`; rechaza claves desconocidas salvo las
      que empiezan por `_`; **no calcula ni corrige ningún valor**; emite
      `uninvestedCash` aparte, nunca sumado; **devuelve** el motivo, no lanza. Cubre:
      R21, R22, R23, R24, R26, R27, R29, R30, R32, R33, R34, R35, R36, R37, R38, R39,
      R40, R41, R42, R43, R44, R45, R48, R77.

- [x] T8 — Crear `src/modules/myinvestor/myinvestor.product.parser.test.ts`: los cuatro
      tipos parsean; nombre y fecha salen del contenido y no del nombre del archivo;
      campo opcional ausente ≡ `null`; `uninvestedCash` presente/ausente y **nunca**
      sumado a `marketValue`; `gain`/`gainPercent` negativos; `gain` incoherente con
      `marketValue − invested` → se devuelve el escrito; depósito con una segunda TAE →
      clave desconocida; `closedAt` presente/ausente; enteros y decimales conservados
      tal cual (`25000`, `8440.6`, `8440.655`). Y los siete casos de error de archivo:
      sintaxis rota, campo(s) ausente(s), valor que no es número (`true`, `[]`),
      **valor numérico como texto** (`"8440.60"`, `"8.440,60"`, `"8.440,60 €"`) → fallo
      con motivo y **sin interpretar**, `type` desconocido, fecha en otro formato, clave
      desconocida, y un archivo con tres problemas → un solo `reason` con los tres.
      Cubre: R21, R22, R23, R24, R26, R27, R29, R30, R32, R33, R34, R35, R36, R37, R38,
      R39, R40, R41, R42, R43, R44, R45, R48, R77.

## Fase 3 — Encaminamiento y volcado (ampliar el servicio de la F10)

- [x] T9b — Ampliar `src/modules/myinvestor/myinvestor.service.ts`: la rama `.json` deja
      de ir a `ignored` y llama al parser de productos (R76); detectar el choque
      `(name, date)` entre archivos del año conservando el primero alfabético (R46);
      volcar un `products.json` por año bajo `<dump>/myinvestor/<año>/` con
      `products[]`, `failed[]` e `ignored[]` (R53); añadir `products` al resultado de la
      ejecución. **Sin tocar** el recorrido de carpetas, el aislamiento por archivo, el
      volcado del extracto ni la ruta. Cubre: R31, R46, R53, R76.

- [x] T10b — Ampliar `myinvestor.service.test.ts` sobre un tempdir: carpeta con un `.csv`
      y tres `.json` (uno roto) → los tres productos/`failed` en su sitio y el `.csv`
      intacto; choque `(name, date)` entre `a.json` y `b.json`; `products.json` con
      productos, `failed` e `ignored`; **un `.json` ya no aparece en `ignored`**; parsear
      dos veces la misma carpeta sin uno de los archivos → ningún producto marcado como
      cerrado y sin entradas "desaparecido". Cubre: R31, R46, R53, R76.

- [x] T4b — Ampliar `myinvestor.fixture.ts` con el generador **sintético** de archivos
      JSON de producto (uno por tipo, variantes con errata, con clave desconocida, con
      un valor numérico que no es número, con un valor numérico **como texto** y con
      fecha en otro formato). **Datos inventados.** Cubre: (apoyo
      de T8 y T10b).

- [x] T12b — Ampliar `myinvestor.routes.test.ts` con un caso que deja archivos de
      producto en el tempdir → 200 con el recuento de productos y `dumpPath` relativa.
      Cubre: R76.

## Fase 4 — Documentación

- [x] T13 — Crear `docs/myinvestor-product-files.md` como **referencia del formato en el
      repo** (la copia que el humano usa cada mes vive en Drive, fuera de `notas-banco/`,
      y no la crea ni la valida el sistema): las **dos plantillas** (`design.md` §7.1 y
      §7.2, con los números ya como **número JSON nativo**), la **tabla de origen de cada
      campo** (§7.3, marcando modelo / muestra / decidido por el humano), las reglas de
      formato de números y fechas (§6, incluida la regla de que un número como texto es un
      fallo), la regla de la TAE única (§7.4), la del efectivo aparte (§7.5), la de
      `closedAt` (§8, **escrito una sola vez por el humano en los dos tipos**), la
      **cadencia** (mensual para fondo/ETF/cartera; el depósito **solo al contratar y al
      vencer**, §8) y la convención de nombre de archivo **recomendada** (§5.3).
      Cubre: R60.

- [x] T14b — Ampliar `docs/api-contract.md` con el modelo del resultado de productos
      dentro de la sección del endpoint `POST /api/parser/myinvestor` que creó la F10.
      Cubre: R71.

- [x] T15b — Actualizar `docs/architecture.md`: redactar el ADR a partir del borrador de
      `design.md` §11 (🔴 **comprueba el siguiente número libre**: el 013 es el contrato
      de la F11 y el 014 el del extracto, así que lo previsible es el **ADR-015**) y
      añadir los archivos nuevos al árbol de la sección «Estructura de carpetas».
      Cubre: R72.

- [x] T17 — Anotar en `progress/current.md`, sin tocar `specs/investments-data-model/`,
      que el **esquema de la feature 9 no cambia** (`design.md` §12.1) y que sus enlaces
      a la antigua `specs/myinvestor-parser/` apuntan hoy a **dos** carpetas
      (`myinvestor-statement` y `myinvestor-products`). Cubre: R63.

## Fase 5 — Guardianes y cierre

- [x] T18b — Actualizar `src/architecture.test.ts` añadiendo los archivos nuevos del
      módulo al array `expected`, **sin borrar los que puso la F10** y comprobando que
      sus guardianes (aislamiento entre bancos, sin `prisma`, una sola declaración del
      contrato) siguen verdes. Cubre: R73.

- [x] T19b — Verificar el alcance sobre el diff: `package.json` y `pnpm-lock.yaml` sin
      cambios, `prisma/` sin cambios, `.gitignore` sin cambios, ningún archivo de
      `specs/investments-data-model/` tocado, ningún archivo del módulo de otro banco
      tocado, y `myinvestor.routes.ts` **sin cambios**. Cubre: (proceso).

- [x] T20b — Ejecutar `pnpm run typecheck` y `pnpm test`: **la suite completa en verde**,
      incluidos los tests de la F10, que **no deben cambiar de expectativa**.
      Cubre: R74.

- [x] T21b — Ejecutar `bash ./init.sh` con el contenedor levantado
      (`docker compose up -d`) y comprobar que termina con `[OK] Entorno listo`.
      Cubre: R74.

- [x] T22b — Escribir el **mapa de trazabilidad** de los `R<n>` de esta spec → test
      concreto en `progress/implementations/myinvestor-products.md`, marcando como
      *"requirement de proceso (checklist del reviewer)"* los que no tienen test
      ejecutable: **R60, R63, R71, R72, R74, R75**. Cubre: R75.
