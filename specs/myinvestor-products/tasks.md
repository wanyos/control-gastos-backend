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
- 🔴 **NO implementes nada hasta que el humano cierre los CINCO puntos 🔴 de
  `decisions.md`**, empezando por la lista de campos de `design.md` §7. Si la cierra
  distinta de la propuesta, actualiza §7, la plantilla de T13 y los tests de T8 **antes**
  de escribir el parser.
- 🔴 **No re-crees nada de la F10:** `myinvestor.format.ts`, `myinvestor.service.ts`,
  `myinvestor.routes.ts`, `myinvestor.fixture.ts` y los tipos `FailedFile`/`IgnoredFile`
  **ya existen**. Se **amplían** (§1). Un segundo normalizador de números para el mismo
  banco es exactamente lo que este corte quiere evitar.
- 🔴 **`pnpm`, nunca `npm`.** **Cero dependencias nuevas**: `JSON.parse` es nativo y la
  validación va a mano (`design.md` §9.5).
- 🔴 **Los fixtures son SINTÉTICOS.** Jamás copies cifras, nombres de producto ni
  archivos reales de `var/drive-read/`.
- 🔴 **No toques** `prisma/`, los módulos del flujo, `src/lib/`, `src/errors/`, el módulo
  de parser de otro banco, ni `specs/investments-data-model/`.
- ⚠️ Convenciones: comillas simples, sin `;`, 2 espacios, 100 columnas, imports relativos
  con `.js`, `import type` para tipos, dominio en inglés.

---

## Fase 1 — Formato y tipos (ampliar lo que ya existe)

- [ ] T2b — Añadir `parseIsoDate` (`AAAA-MM-DD` estricto, validando el calendario) a
      `src/modules/myinvestor/myinvestor.format.ts`, **sin tocar** `parseAmountText` ni
      `parseStatementDate` (`design.md` §6.2). Cubre: R28.

- [ ] T3b — Ampliar `myinvestor.format.test.ts` con los casos de ISO: `2026-11-03`
      aceptada; `03/11/26`, `03/11/2026` y `2026-13-01` rechazadas. Cubre: R28.

- [ ] T1b — Añadir a `src/modules/myinvestor/myinvestor.types.ts` los tipos de producto
      (`InvestmentProductType`, `ParsedValuation`, `ParsedDepositTerms`, `ParsedProduct`,
      `MyinvestorProductsResult`, `ParsedProductSummary`), literal como en `design.md`
      §13, **sin tocar** el alias del contrato del extracto. Cubre: R22, R35, R36.

## Fase 2 — El parser puro de un archivo de producto

- [ ] T7 — Crear `src/modules/myinvestor/myinvestor.product.parser.ts`
      (`parseMyinvestorProduct(file, content)`): `JSON.parse` con captura, validación a
      mano de `type` (los cuatro valores), `name`, `date`, `currency` (def. `'EUR'`),
      `closedAt`, y de los campos obligatorios **según el tipo** (valoración para
      `fund`/`etf`/`managed_portfolio`; condiciones para `deposit`); **importa**
      `parseAmountText` y `parseIsoDate` del formato del banco, sin reimplementar
      ninguna regla; trata ausente y `null` como no informado; **acumula todos los
      problemas** del archivo en un solo `reason`; rechaza claves desconocidas salvo las
      que empiezan por `_`; **no calcula ni corrige ningún valor**; emite
      `uninvestedCash` aparte, nunca sumado; **devuelve** el motivo, no lanza. Cubre:
      R21, R22, R23, R24, R26, R27, R29, R30, R32, R33, R34, R35, R36, R37, R38, R39,
      R40, R41, R42, R43, R44, R45, R48.

- [ ] T8 — Crear `src/modules/myinvestor/myinvestor.product.parser.test.ts`: los cuatro
      tipos parsean; nombre y fecha salen del contenido y no del nombre del archivo;
      campo opcional ausente ≡ `null`; `uninvestedCash` presente/ausente y **nunca**
      sumado a `marketValue`; `gain`/`gainPercent` negativos; `gain` incoherente con
      `marketValue − invested` → se devuelve el escrito; depósito con una segunda TAE →
      clave desconocida; `closedAt` presente/ausente; los formatos numéricos español y
      simple. Y los seis casos de error de archivo: sintaxis rota, campo(s) ausente(s),
      número ilegible, `type` desconocido, fecha en otro formato, clave desconocida, y
      un archivo con tres problemas → un solo `reason` con los tres. Cubre: R21, R22,
      R23, R24, R26, R27, R29, R30, R32, R33, R34, R35, R36, R37, R38, R39, R40, R41,
      R42, R43, R44, R45, R48.

## Fase 3 — Encaminamiento y volcado (ampliar el servicio de la F10)

- [ ] T9b — Ampliar `src/modules/myinvestor/myinvestor.service.ts`: la rama `.json` deja
      de ir a `ignored` y llama al parser de productos (R76); detectar el choque
      `(name, date)` entre archivos del año conservando el primero alfabético (R46);
      volcar un `products.json` por año bajo `<dump>/myinvestor/<año>/` con
      `products[]`, `failed[]` e `ignored[]` (R53); añadir `products` al resultado de la
      ejecución. **Sin tocar** el recorrido de carpetas, el aislamiento por archivo, el
      volcado del extracto ni la ruta. Cubre: R31, R46, R53, R76.

- [ ] T10b — Ampliar `myinvestor.service.test.ts` sobre un tempdir: carpeta con un `.csv`
      y tres `.json` (uno roto) → los tres productos/`failed` en su sitio y el `.csv`
      intacto; choque `(name, date)` entre `a.json` y `b.json`; `products.json` con
      productos, `failed` e `ignored`; **un `.json` ya no aparece en `ignored`**; parsear
      dos veces la misma carpeta sin uno de los archivos → ningún producto marcado como
      cerrado y sin entradas "desaparecido". Cubre: R31, R46, R53, R76.

- [ ] T4b — Ampliar `myinvestor.fixture.ts` con el generador **sintético** de archivos
      JSON de producto (uno por tipo, variantes con errata, con clave desconocida, con
      número ilegible y con fecha en otro formato). **Datos inventados.** Cubre: (apoyo
      de T8 y T10b).

- [ ] T12b — Ampliar `myinvestor.routes.test.ts` con un caso que deja archivos de
      producto en el tempdir → 200 con el recuento de productos y `dumpPath` relativa.
      Cubre: R76.

## Fase 4 — Documentación

- [ ] T13 — Crear `docs/myinvestor-product-files.md` con las **dos plantillas copiables**
      (`design.md` §7.1 y §7.2), la **tabla de origen de cada campo** (§7.3, marcando
      modelo / muestra / inventado), las reglas de formato de números y fechas (§6), la
      regla de la TAE única (§7.4), la del efectivo aparte (§7.5), la de `closedAt` (§8)
      y la convención de nombre de archivo **recomendada** (§5.3). Cubre: R60.

- [ ] T14b — Ampliar `docs/api-contract.md` con el modelo del resultado de productos
      dentro de la sección del endpoint `POST /api/parser/myinvestor` que creó la F10.
      Cubre: R71.

- [ ] T15b — Actualizar `docs/architecture.md`: redactar el ADR a partir del borrador de
      `design.md` §11 (🔴 **comprueba el siguiente número libre**: el 013 es el contrato
      de la F11 y el 014 el del extracto, así que lo previsible es el **ADR-015**) y
      añadir los archivos nuevos al árbol de la sección «Estructura de carpetas».
      Cubre: R72.

- [ ] T17 — Anotar en `progress/current.md`, sin tocar `specs/investments-data-model/`,
      que el **esquema de la feature 9 no cambia** (`design.md` §12.1) y que sus enlaces
      a la antigua `specs/myinvestor-parser/` apuntan hoy a **dos** carpetas
      (`myinvestor-statement` y `myinvestor-products`). Cubre: R63.

## Fase 5 — Guardianes y cierre

- [ ] T18b — Actualizar `src/architecture.test.ts` añadiendo los archivos nuevos del
      módulo al array `expected`, **sin borrar los que puso la F10** y comprobando que
      sus guardianes (aislamiento entre bancos, sin `prisma`, una sola declaración del
      contrato) siguen verdes. Cubre: R73.

- [ ] T19b — Verificar el alcance sobre el diff: `package.json` y `pnpm-lock.yaml` sin
      cambios, `prisma/` sin cambios, `.gitignore` sin cambios, ningún archivo de
      `specs/investments-data-model/` tocado, ningún archivo del módulo de otro banco
      tocado, y `myinvestor.routes.ts` **sin cambios**. Cubre: (proceso).

- [ ] T20b — Ejecutar `pnpm run typecheck` y `pnpm test`: **la suite completa en verde**,
      incluidos los tests de la F10, que **no deben cambiar de expectativa**.
      Cubre: R74.

- [ ] T21b — Ejecutar `bash ./init.sh` con el contenedor levantado
      (`docker compose up -d`) y comprobar que termina con `[OK] Entorno listo`.
      Cubre: R74.

- [ ] T22b — Escribir el **mapa de trazabilidad** de los `R<n>` de esta spec → test
      concreto en `progress/implementations/myinvestor-products.md`, marcando como
      *"requirement de proceso (checklist del reviewer)"* los que no tienen test
      ejecutable: **R60, R63, R71, R72, R74, R75**. Cubre: R75.
