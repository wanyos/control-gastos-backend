# iban-normalization (F21) — review

**Veredicto:** APPROVED

Feature sin spec (`sdd: false`): se revisa contra los **9 criterios de
`acceptance`** y el `intent` de `feature_list.json`, `CHECKPOINTS.md`,
`docs/conventions.md` §Parsers de banco, ADR-013 / ADR-018 / ADR-021,
`docs/api-contract.md` y `docs/dar-de-alta-un-banco.md`.

`./init.sh` ejecutado por el revisor: **verde, exit 0, `Test Files 33 passed
(33)`, `Tests 535 passed (535)`, 0 saltados** (baseline F18: 493 → +42). Coincide
con lo que reporta el implementer.

**Sin hallazgos.** No hay cambios requeridos.

---

## Comprobado sin hallazgos

Lo que sigue no es el informe del implementer releído: es lo que el revisor
**ejecutó**, por la lección de la F18 (un informe cierto sobre un código con un
fallo silencioso).

### Ejecución de los cuatro caminos, con valores que podían fallar

Cuatro sondas `tsx` fuera del repo (borradas al terminar), con IBAN sintético
generado en tiempo de ejecución:

| Camino | Escrito con espacios + minúsculas | Un dígito mal tecleado | `:` como separador |
| --- | --- | --- | --- |
| `parseN26Statement` | misma cadena canónica que la forma limpia | `throw INVALID_IBAN 422` · «el iban de la línea 1 no es válido: el dígito de control no cuadra» | `accountIban` → `null` (sigue fallando después con `MISSING_ACCOUNT_DATA`) |
| `parseMyinvestorStatement` | misma cadena | mismo `throw`, misma frase | `null` |
| `parseBankinterXlsx` | misma cadena | mismo `throw`, misma frase | n/a (lo escribe el banco) |
| `POST /api/accounts` (app real + Postgres) | 201 con el IBAN **normalizado** en la fila; el mismo IBAN espaciado y en minúsculas → **409 CONFLICT**, no una segunda cuenta | **422 `INVALID_IBAN`** y `account.count(iban)` = **0** | n/a |

- Un valor que no es un IBAN en absoluto (`'mi cuenta de siempre'`, `'ab'`,
  `'iban;1234'`) → 422 «no tiene la forma de un iban…», por su nombre.
- Sin línea `iban;` o con la línea vacía → `null`, como antes. No se convirtió un
  dato ausente en un fallo.
- **Efecto en la base de datos comprobado, no solo el código HTTP:** cero filas
  creadas por el IBAN inválido, y el recuento total de cuentas volvió al valor de
  partida tras limpiar las sondas.

### Una sola puerta, verificada de dos formas

- `prisma.account.create` aparece **solo** en `accounts.service.ts:141` y `:191`,
  y las dos rutas pasan por `requireValidIban` (`:136` y `:183`) antes de tocar la
  base de datos. No queda una tercera vía.
- `grep` de `toUpperCase()` en `src/`: los tres restos son ajenos (byte hex de
  `utf8.ts`, nombre de banco en un test, divisa de N26). No hay un segundo
  «quitar espacios + mayúsculas».
- Los guardianes de `iban.test.ts:171-219` no son decorativos: fallan si un
  parser deja de importar `lib/iban.js`, si el servicio de cuentas baja de dos
  `requireValidIban`, o si aparece un segundo mod-97 (con la excepción del
  guardián de privacidad **declarada y razonada**, no silenciada).
- El `normalizeIban` de `accounts.service.ts` **se movió, no se reexportó**:
  verificado en el diff, no queda alias.

### Las dos decisiones cerradas del humano

- **Mod-97 sí:** implementado en `iban.ts:152` (ISO 7064 MOD 97-10, dígito a
  dígito) y probado contra **500 IBAN generados de dos países** con su versión
  mal tecleada (`iban.test.ts:105`). No es un `expect(true)`.
- **`:` no se acepta:** `git diff HEAD -- src | grep firstSeparatorIndex` → **sin
  coincidencias**; el buscador de preámbulo no se tocó, y hay test que lo fija en
  N26 y MyInvestor. Ejecutado además a mano: `iban:<IBAN>` sigue dando `null`.

### Las tres decisiones delegadas, argumentadas por escrito

Las tres están resueltas en `progress/implementations/iban-normalization.md`
§«Las tres decisiones delegadas», con su alternativa descartada, y elevadas a
ADR-021:

1. **Dónde vive** — `src/lib/iban.ts`, con el porqué de que compartir esto no
   rompe «un parser por banco» (un IBAN no es un formato, es el identificador ISO
   de una cuenta; mismo argumento que ADR-018 y ADR-013).
2. **Qué es válido y cómo se rechaza** — las cuatro capas en orden, la asimetría
   deliberada de la tabla de longitudes, `INVALID_IBAN`/422, unidad de rechazo el
   fichero entero, y el motivo en castellano que **nunca repite el IBAN**
   (comprobado con test y con las sondas: la frase no contiene el número).
3. **Migración** — se justifica que **no hace falta**. Verificado
   independientemente contra la base de datos real: las **dos** cuentas de hoy
   están en forma canónica y **pasan la validación nueva**
   (`normalizeIban(x) === x`, `ibanRejectionReason(x) === null` en las dos). Un
   `UPDATE` no cambiaría ninguna fila.

### Los movimientos ya importados no se tocan

- `prisma/migrations/` no gana ninguna carpeta (`git status`: sin cambios ahí);
  ni esquema ni datos.
- Las **215** filas de `Movement` de la base de datos siguen ahí y siguen
  colgando de las mismas dos cuentas.
- **Y sus ficheros reales siguen entrando:** se pasaron por el parser los
  extractos de `var/drive-read/` (n26 y myinvestor) — 204 y 11 movimientos, IBAN
  presente, **válido y canónico** en los dos. La feature no rompe la reimportación
  ni la exige.

### 🔒 Guardián de la F14

- `src/no-real-data.test.ts` **no se modificó**: ni una entrada nueva en
  `allowedIbans` ni en `allowedPaths`.
- `grep` de `no-real-data-ok` en todo el repo: **ningún marcador nuevo** de esta
  feature (los existentes son de `docs/data-model.md`, `specs/` y la cabecera del
  propio guardián, todos anteriores).
- Los **0 saltados** son reales: `var/drive-read/` (12 archivos) y `var/parsed/`
  (4 `.json`) existen y están poblados, así que
  `missingCaptureBranches()` devuelve vacío y la **capa de comparación corrió**,
  no solo la de forma.
- Barrido propio del revisor: se comparó cada archivo versionado (incluidos los
  aún sin commitear) contra los IBAN **reales leídos de la base de datos**. Cero
  coincidencias completas. Los IBAN nuevos escritos en archivos son el ejemplo
  público español (ya en lista blanca) y un alemán de cuerpo **todo ceros** con
  dígitos calculados; los de `syntheticIban()` solo existen en memoria.

### Documentación (lección de la F15)

Verificado uno a uno, no de la lista del informe: **ADR-021** completo en
`docs/architecture.md` (contexto medido, 5 decisiones, 4 alternativas
descartadas, consecuencia); `docs/api-contract.md` con `INVALID_IBAN` en la tabla
de códigos estables, su nota, el body y los errores de `POST /api/accounts`
(incluido que el 409 compara **ya normalizado**), los códigos por archivo de
`POST /api/import` y el contrato de `accountIban`; `docs/conventions.md` §Parsers
de banco con las dos normas nuevas; `docs/dar-de-alta-un-banco.md` con la frase
exacta que verá el humano y qué hacer; `docs/data-model.md` con el comentario de
`Account.iban` corregido (decía solo «normalizada»); `docs/roadmap.md` §Deberes
tuyos. Ningún registro quedó mintiendo.

### Convenciones, arquitectura y tests

- `src/architecture.test.ts` incorpora `lib/iban.ts` y `lib/iban.test.ts` al
  árbol esperado (ADR-004) y pasa: la estructura sigue siendo la documentada.
- Errores por la jerarquía de `src/errors/app-error.ts` (`InvalidIbanError`,
  código estable + 422), sin tocar el handler central. Nombres en inglés en el
  código, motivos en castellano solo donde ya era la norma (los `reason` que lee
  el humano).
- Ni `console.log` ni TODO sin contexto en los archivos nuevos. Sin dependencias
  nuevas.
- Los tests comprueban **resultado concreto** (cadena exacta, código, `count()`
  contra Postgres), no «no lanza». Los de cuentas, movimientos e import usan la
  app y la base de datos reales, no dobles.
- El arreglo de los `uniqueIban()` de cuatro suites es correcto y no afloja nada:
  el fixture generaba longitud imposible y dígitos aleatorios; ahora los calcula
  **con el propio validador de producción**, así que fixture y regla no pueden
  divergir.

### Mapa criterio → test

Los 9 criterios están cubiertos y los tests citados en el informe existen con ese
nombre y esa aserción (revisados en `iban.test.ts`, `accounts.test.ts:318+`,
`import.service.test.ts:730+`, `n26.statement.parser.test.ts:584+`,
`myinvestor.statement.parser.test.ts:666+`, `bankinter.parser.test.ts:315+`). No
hay criterio apoyado solo en el camino feliz: cada uno tiene su camino de error.

Un matiz, no un hallazgo: el test de import que prueba «IBAN inválido no crea
cuenta» simula el `throw` del parser con un adaptador falso. Es correcto para lo
que mide (el comportamiento de la costura y el efecto en la base de datos), y el
`throw` real de los **tres** parsers está probado en sus suites y lo verificó el
revisor por ejecución.

### CHECKPOINTS

C1 ✅ · C2 ✅ (una sola `in_progress`, la 21; `current.md` describe la sesión
activa) · C3 ✅ · C4 ✅ · C5 ✅ (nada sospechoso sin trackear: solo
`src/lib/iban*.ts`, el informe y la exploración; `history.md` con su línea de la
última cerrada, la F18) · C6 ✅ (el contrato cambia y `api-contract.md` se
actualiza en la misma feature, con la nota fechada; anotado también en
`current.md`) · C7 n/a (`sdd: false`) · C8 ✅ →
[`progress/summaries/iban-normalization.md`](../summaries/iban-normalization.md).

---

## Observación no bloqueante (no es un cambio requerido)

El prefijo truncado del IBAN real de N26 (`DE10 1001 …`) aparece en el `intent`
de `feature_list.json:893` y en
`progress/explorations/prueba-real-n26-2026-08-18.md:162`, ambos **escritos antes
de esta implementación** (el `intent` es del humano, la exploración del leader).
El guardián de la F14 no los caza y `docs/conventions.md` §Tests ya documenta que
los valores **truncados o derivados** están fuera de su alcance; existe además
precedente aceptado en `progress/current.md:379` (`ES30 1544…`) desde la F14. El
implementer hizo lo correcto en su terreno: no lo propagó al ADR ni a ningún
archivo nuevo. Queda anotado para que el humano decida si quiere sanearlo cuando
toque esos archivos; **no condiciona esta aprobación**.

---

Resumen de cierre: [`progress/summaries/iban-normalization.md`](../summaries/iban-normalization.md).
