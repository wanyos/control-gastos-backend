# Tasks — F20 `trade-republic-product-file`

> Checklist ejecutable. El `implementer` marca `[x]`; el `reviewer` rechaza si
> queda alguna `[ ]` sin justificar.
>
> ⚠️ **Aviso de concurrencia.** Hay otra feature de banco (`n26`) escribiéndose en
> paralelo y toca **los mismos tres archivos compartidos**: `src/app.ts`,
> `src/architecture.test.ts` y `docs/architecture.md` (y probablemente
> `docs/roadmap.md`). Los lotes C y D los tocan: **rebasar antes de empezarlos** y
> resolver el conflicto añadiendo, nunca sustituyendo, la entrada del otro banco.
>
> 🔒 **Ni un dato de la muestra real** (IBAN, nombre, dirección, importes, saldos)
> en ningún archivo versionado. Todos los fixtures y todos los ejemplos son
> inventados. Antes de cerrar: `npx vitest run src/no-real-data.test.ts`.

---

## Lote A — la plantilla y la doctrina
Archivos: `docs/trade-republic-product-files.md`, `docs/roadmap.md`,
`docs/conventions.md`, `src/modules/trade-republic/trade-republic.docs.test.ts`
Depende de: —

- [ ] T1 — Escribir `docs/trade-republic-product-files.md`: qué es, la plantilla
      de `savings_account` con **todos** los valores como marcadores `<…>`, la
      tabla de campos con el origen de cada uno (§2 del `design.md`), la cadencia
      (un archivo por abono de intereses; tres valores tecleados: `date`,
      `balance`, `interest`, de la misma fila del extracto), la convención de
      nombre `cuenta-remunerada-<AAAA-MM-DD>.json` y la tabla de «qué pasa cuando
      un archivo está mal». Cubre: R1.
- [ ] T2 — En ese mismo documento, **enlazar** a `myinvestor-product-files.md`
      para las reglas de escritura comunes (número sin comillas y con punto
      decimal, fecha `AAAA-MM-DD`, claves `_` ignoradas, el banco sale de la
      carpeta) en vez de reescribirlas, y advertir de que la plantilla que se copia
      vive en Drive, en una carpeta **hermana** de `notas-banco/`. Cubre: R3.
- [ ] T3 — En ese mismo documento, un bloque **«Esto es provisional»**: qué lo
      revierte (el día que la cuenta tenga movimientos de verdad se escribe el
      parser del PDF) y el enlace al diagnóstico
      `progress/explorations/inventario-bancos-2026-08-17.md`. Cubre: R4.
- [ ] T4 — `docs/roadmap.md`: E4 pasa a **3 de 6 bancos**, con la nota de que
      Trade Republic entra por archivo escrito a mano y **no** por parser, y qué lo
      revierte. Dos líneas, el roadmap no crece. Cubre: R4.
- [ ] T5 — `docs/conventions.md` §Parsers de banco: una línea diciendo que un
      banco puede entrar **solo** por archivo escrito a mano cuando su formato no
      compensa, con Trade Republic como caso. Cubre: R4.
- [ ] T6 — `trade-republic.docs.test.ts`: la plantilla no contiene ningún valor
      copiable (todo valor de sus bloques `json` es un `<…>`), el documento enlaza
      a `myinvestor-product-files.md`, y tanto él como el roadmap llevan la nota de
      provisionalidad. Cubre: R1, R3, R4.

## Lote B — tipos, parser puro y fixtures
Archivos: `src/modules/trade-republic/trade-republic.types.ts`,
`src/modules/trade-republic/trade-republic.product.parser.ts`,
`src/modules/trade-republic/trade-republic.fixture.ts`,
`src/modules/trade-republic/trade-republic.product.parser.test.ts`
Depende de: —

- [ ] T7 — `trade-republic.types.ts` con **solo lo suyo**: `TradeRepublicProductType`
      (`'savings_account'`), `ParsedSavingsAccount`, `TradeRepublicProductsResult`,
      `FailedFile`, `IgnoredFile`, `ParsedSavingsAccountSummary` y
      `TradeRepublicParseRunResult`. No importa nada de otro módulo de banco.
      Cubre: R5, R7.
- [ ] T8 — `trade-republic.product.parser.ts`: `parseTradeRepublicProduct(file,
      content)`, que **devuelve el motivo en vez de lanzar**, no calcula nada y no
      reformatea ningún número. Campos obligatorios `type`, `name`, `date`,
      `openedAt`, `balance`, `interest`; opcionales `currency` (def. `EUR`),
      `closedAt` y las claves `_`. Cubre: R7.
- [ ] T9 — Acumulación de motivos: faltantes por su nombre y **todos** de golpe;
      número como texto con su motivo propio («se espera un número sin comillas»);
      valor no numérico; fecha fuera de `AAAA-MM-DD`; `type` no admitido con el
      valor recibido y el único admitido; claves desconocidas por su nombre, salvo
      las `_`. Cubre: R8, R9, R10, R11, R12.
- [ ] T10 — `trade-republic.fixture.ts`: constructores de archivos de cuenta
      **sintéticos** en memoria (válido, con campo ausente, con número como texto,
      con coma decimal, con fecha mal, con clave desconocida) y el texto literal de
      la plantilla con marcadores. Cero datos reales. Cubre: R2.
- [ ] T11 — `trade-republic.product.parser.test.ts`: un test por caso de T8-T10,
      **más** el test de R2 (la plantilla verbatim se rechaza nombrando todos los
      campos sin sustituir) y el de R9 con `"1.234,56"` (coma decimal, el caso que
      el humano nombró). Cubre: R2, R7, R8, R9, R10, R11, R12.

## Lote C — servicio, ruta y contrato de API
Archivos: `src/modules/trade-republic/trade-republic.service.ts`,
`src/modules/trade-republic/trade-republic.routes.ts`,
`src/modules/trade-republic/trade-republic.service.test.ts`,
`src/modules/trade-republic/trade-republic.routes.test.ts`, `src/app.ts`,
`docs/api-contract.md`
Depende de: Lote B

- [ ] T12 — `trade-republic.service.ts`: recorre
      `<sourceBaseDir>/trade-republic/<año>/` en orden determinista, lee cada
      archivo como `Buffer` y lo descodifica con `decodeUtf8Strict`
      (`src/lib/utf8.ts`), encamina **por la extensión** `.json`, resuelve el
      choque `(name, date)` conservando el primero por orden alfabético y escribe
      **un** `products.json` por año. Cubre: R13.
- [ ] T13 — Aislamiento: cualquier otra extensión —el `.pdf` del extracto— va a
      `ignored[]` con su motivo y **no** cuenta como fallo; un `.json` roto va a
      `failed[]` y el resto se parsea igual. Cubre: R14, R15.
- [ ] T14 — `trade-republic.routes.ts`: `POST /trade-republic` bajo el prefijo
      `/api/parser`, con `sourceBaseDir` / `dumpBaseDir` inyectables, y la línea de
      registro en `src/app.ts`. **No** se añade al registro de parsers del
      importador. Cubre: R16.
- [ ] T15 — `trade-republic.service.test.ts` sobre un directorio temporal con
      fixtures sintéticos: año con archivos válidos, `.pdf` ignorado, archivo roto
      aislado, choque `(name, date)`, `products.json` escrito y determinista.
      Cubre: R13, R14, R15.
- [ ] T16 — `trade-republic.routes.test.ts`: `200` con el resultado, `200` también
      cuando hay fallos dentro, y la ruta registrada en la app real. Cubre: R16.
- [ ] T17 — `docs/api-contract.md`: sección «Parser de Trade Republic (sin base de
      datos)» + `POST /api/parser/trade-republic` con su respuesta de ejemplo
      (valores inventados) y la nota de que no persiste nada. Cubre: R16.

## Lote D — guardianes, ADR y cierre
Archivos: `src/architecture.test.ts`, `docs/architecture.md`,
`progress/implementations/trade-republic-product-file.md`
Depende de: Lote B, Lote C

- [ ] T18 — `src/architecture.test.ts`: añadir los archivos del módulo a la lista
      del guardián del árbol; añadir `trade-republic` a `bankModules` y extender el
      guardián de aislamiento (imports permitidos `./`, `../../errors/`,
      `../../lib/`; único importador externo `app.ts`; ningún módulo de banco nombra
      a otro). Cubre: R5.
- [ ] T19 — `src/architecture.test.ts`: guardián «el módulo de Trade Republic no
      contiene ninguna referencia a `prisma`», calcado del de MyInvestor. Cubre: R6.
- [ ] T20 — `docs/architecture.md`: el árbol gana `modules/trade-republic/` y se
      escribe el **ADR-019** — un banco que entra solo por archivo escrito a mano:
      campos de la cuenta remunerada, forma copiada pero tipo no compartido, por
      qué no se mueve `ParsedProduct` a `lib/` y cuándo se revisa (al tercer banco
      con `.json` a mano). Cubre: R5, R6, R7.
- [ ] T21 — `progress/implementations/trade-republic-product-file.md`: informe con
      el mapa de **trazabilidad `R<n>` → test** de los 16 requirements. Cubre: —
- [ ] T22 — Cierre: `./init.sh` en verde con la suite completa y
      `npx vitest run src/no-real-data.test.ts` con su capa de comparación
      **activa** (con `var/` presente, no saltada). Cubre: —
