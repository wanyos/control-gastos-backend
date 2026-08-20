# F27 `tests-dont-touch-real-db` — review

> Revisión ejecutada, no leída: 18 pasadas completas de la suite, los dos guardianes
> provocados en rojo con casos **míos**, arranque en frío con las bases borradas, y la
> suite contra un PostgreSQL inalcanzable.
>
> 🔒 Solo recuentos y forma; ni un dato suyo (ADR-017).

## Review

**Veredicto:** APPROVED

Comprobado: los 10 criterios de `acceptance` ↔ tests/comprobaciones reproducibles,
arquitectura (ADR-027 + árbol declarado en `architecture.test.ts`), convenciones
(§Tests con base de datos, prettier y oxlint limpios en lo tocado), verificación
(`./init.sh` **verde entero**, exit 0, 47 archivos / 831 tests) y CHECKPOINTS C1-C5 y C8.
C6 no aplica (no toca el contrato de la API), C7 no aplica (`sdd: false`).
Sin hallazgos bloqueantes.

Resumen de cierre: [`progress/summaries/tests-dont-touch-real-db.md`](../summaries/tests-dont-touch-real-db.md).

---

## Lo que ejecuté yo (no lo que dice el informe)

### 1. El flake: 18 pasadas, 18 verdes

La razón por la que esta feature dejó de ser higiene era que `./init.sh` fallaba
**4 de cada 13**. Recuento propio, `pnpm test` completo, una detrás de otra:

| Pasadas | Verdes | Rojas | Tests por pasada | Duración informada por vitest |
|---|---|---|---|---|
| 16 seguidas (bucle) | **16** | **0** | 831 (47 archivos) | 7,4 – 7,7 s |
| +1 con foto ceñida antes/después | verde | — | 831 | 7,3 s |
| +1 en frío (bases borradas) | verde | — | 831 | 8,5 s |
| **Total** | **18/18** | **0** | | |

Con el ~30 % de rojos que veía la review de la F26, 18 verdes seguidas salen por
casualidad menos de 1 vez entre 10 000. **El flake está muerto.** El mecanismo que da
el informe (`GET /api/movements` con `include: account` mientras otro archivo borra su
cuenta) es coherente con la cura: dentro de un worker los archivos van uno detrás de
otro, así que con una base por worker la carrera no puede ocurrir.

### 2. Los dos guardianes, provocados con casos que el implementer NO escribió

**Guardián 1 — fila dejada atrás.** Escribí un archivo de test temporal que crea filas en
**dos tablas que sus demos no usan** (`Category` e `InvestmentProduct`) y **nunca las
borra**. Resultado, con exit code **1**:

```
Error: Este archivo de test ha dejado filas sin borrar (Category: 1, InvestmentProduct: 1).
Un test limpia lo que crea: ver docs/conventions.md §Tests con base de datos.
  ❯ vitest.setup.ts:51
```

Nombra **las dos** tablas y sus cantidades, y vacía la base para no contagiar al archivo
siguiente. El guardián recorre las tablas de verdad (`pg_tables`), no una lista escrita a
mano: por eso cazó tablas que nadie había previsto. Archivo temporal **borrado** al
terminar.

**Guardián 2 — su base cambió.** Sin tocar la suya: cloné una base **falsa** que hiciera
de «suya», apunté ahí `DATABASE_URL` y escribí en ella desde un test. Resultado, exit
code **1**:

```
TU BASE DE DATOS HA CAMBIADO DURANTE LA SUITE. … Diferencias:
  - Category: 0 filas antes, 1 después
  - Category_id_seq: el contador pasó de sin usar a 1 (alguien insertó una fila,
    aunque la haya borrado después)
```

Caza el recuento **y** la secuencia. Base falsa **borrada** al terminar.
Los dos guardianes se han visto fallar; no son promesas.

### 3. Los tests de base siguen contra una base de datos de verdad

Prohibición explícita del humano, mirada en el diff, no en el informe:

- Archivos de test existentes modificados por la F27: **ninguno**, salvo
  `src/architecture.test.ts`, y ahí solo **dos líneas añadidas** al árbol declarado.
- `grep` de `vi.mock` / `vi.fn` / `mockResolved` / `sqlite` en los cuatro archivos
  nuevos: **cero coincidencias**.
- Los 831 tests corren contra el **mismo PostgreSQL 17 del mismo contenedor**, con el
  mismo `buildApp()` y el mismo `app.prisma`. Lo único que cambió es **qué** base, no
  **contra qué**.

### 4. Arrancar el proyecto no se ha complicado

- `init.sh`: **sin una sola línea de diff**. Verificado con `git diff init.sh` (vacío).
- **Primera vez / clon nuevo:** borré las **9** bases de prueba (las 8 de worker y la
  plantilla) y ejecuté `pnpm test` sin ningún paso previo: se recrearon solas y la pasada
  terminó **verde**, 8,5 s frente a 7,3 s de la siguiente. **Coste real de arrancar en
  frío: ~1,2 s, una vez.** Ningún comando nuevo, ninguna variable nueva.
- **Sin PostgreSQL accesible:** la suite **falla ruidosamente con exit 1** (ver
  observación no bloqueante nº 1 sobre la claridad del mensaje).

### 5. Nada de su base se borra, y las desechables no pueden colisionar con la suya

- **Recuento de su base, antes y después de todo lo mío: idéntico.** Sus 4 cuentas y sus
  455 movimientos siguen ahí, y el producto y la foto de la F26 que aparecieron durante
  la revisión —**suyos, de su prueba real**— siguen intactos: no los toqué ni los conté
  como basura. La única deriva que vi fueron **dos secuencias** que avanzaron **entre**
  dos de mis fotos, fuera de toda pasada de suite: son de su prueba real de la F26, y la
  demostración es que **las 18 pasadas dieron verdes** — si hubieran sido de la suite, el
  guardián 2 las habría puesto rojas.
- **Comprobación ceñida:** foto → una pasada completa → foto → `diff` = **idénticos**
  (recuentos de las 6 tablas y valor de las 6 secuencias).
- **Colisión por error de nombre o configuración: cerrada por construcción.** Los nombres
  se generan de constantes (`gastos_test_` + número, `gastos_test_template`), no de la
  URL; y `assertTestDatabase` está delante de **todo** lo que escribe
  (`truncateAll`, `findLeftoverRows`, `dropAndClone`). Probado en vivo apuntando
  `DATABASE_URL` a otra base: las desechables siguieron llamándose `gastos_test_<n>` y su
  `gastos` no se abrió más que para un `select`. `snapshotDatabase` es el único código que
  entra en la suya y **solo lee**.

### 6. Estado y checkpoints

`./init.sh` termina en **exit 0, verde entero**. El `[FAIL]` de estado que reportaba el
implementer (dos features en `in_progress`) **ya no existe**: la F26 se cerró a `done`
durante esta revisión. No la he tocado yo.

---

## Observaciones NO bloqueantes (para otra sesión, no para esta feature)

1. **Sin Docker levantado, el primer renglón despista.** La pasada muere con
   `No test files found, exiting with code 1` seguido de un `AggregateError: ECONNREFUSED`
   con traza de `node:net`. Falla fuerte y con exit 1 —no hay riesgo de falso verde—, pero
   no dice «levanta el contenedor». Un `try/catch` en `vitest.global-setup.ts` alrededor de
   la preparación, con un mensaje del estilo del resto («no se puede conectar a PostgreSQL:
   ¿está levantado `docker compose up -d`?»), lo arreglaría en dos líneas. Ningún criterio
   de `acceptance` lo pide.
2. **`gastos_f26` sigue en el contenedor**, como ya avisaba la review de la F26 y repite el
   informe. Es de aquella feature, no de esta.
3. Las tres sugerencias fuera de scope del informe siguen vivas y bien argumentadas: el
   **500 de `GET /api/movements`** cuando desaparece una cuenta mientras lista (hoy no
   alcanzable en producción, pero es deuda real), el `prettier` pendiente en un test de
   MyInvestor y los filtros `accountId` que ya no hacen falta dentro de un archivo.

## Rastro de esta revisión

Todo lo que creé para provocar los rojos está **borrado**: los dos archivos de test
temporales y la base falsa. `git status` no muestra ningún archivo mío;
la base del humano quedó exactamente como me la encontré.
