# movements-stable-order — revisión

> Arreglo sin feature (corrige la F36 `movements-filters-and-totals`), encargo
> `../docs/handoff-paginacion-estable.md` parte 1. Sin commit. No hay resumen de
> cierre ni entrada en `progress/history.md` porque no es una feature.

## Review — 2026-10-04

**Veredicto:** APPROVED

Sin cambios requeridos.

### Comprobado sin hallazgos (con qué comando y qué salió)

1. **Alcance.** `git status --short --untracked-files=all` y `git diff --stat`:
   cuatro archivos modificados (`docs/api-contract.md`, `progress/current.md`,
   `src/modules/movements/movements.service.ts`,
   `src/modules/movements/movements.test.ts`) y uno sin seguimiento (el informe).
   `git diff --name-only HEAD -- src/modules/accounts prisma`: vacío, así que ni
   `accounts.service.ts` ni el esquema ni las migraciones se han tocado.
   `grep orderBy|movementListOrder` en `src/modules/movements` (sin tests): la
   constante se define en `movements.service.ts:219` y se usa en `:285` y `:420`;
   no queda ningún otro `orderBy` en el módulo.
2. **Los dos tests detectan el fallo.** Copié `movements.service.ts` fuera del
   repositorio, lo sustituí por `git show HEAD:src/modules/movements/movements.service.ts`
   (`git diff --stat` de ese archivo: vacío) y lancé tres veces
   `pnpm exec vitest run src/modules/movements/movements.test.ts -t "tie"`.
   Las tres: código de salida 1, `2 failed | 3 passed | 86 skipped`.
   - Test 1 (`movements.test.ts:1156`): falla en `:1178`, la página 1 trae el
     `id` menor (`expected [ 21 ] to deeply equal [ 22 ]`, y lo mismo con 41/42 y
     61/62).
   - Test 2 (`movements.test.ts:1182`): falla en `:1230`,
     `expected 16 to be 18`: 18 filas recibidas, 16 ids distintos.

   Con el arreglo puesto, el mismo comando: código de salida 0, `5 passed | 86 skipped`.
3. **El test 2 no depende del sentido del desempate para ver una pérdida o una
   repetición.** Cambié temporalmente `{ id: 'desc' }` por `{ id: 'asc' }` en el
   servicio y lancé el mismo comando: el test 2 pasa las aserciones de `:1230`
   (sin repetidos) y `:1231` (el conjunto de ids es el de los creados) y solo
   falla en `:1234`, la del orden declarado. Es decir: las dos primeras
   aserciones miran pérdida y repetición con cualquier orden total; la tercera es
   la que fija el sentido. El test 1 falla en `:1178`, como corresponde.
4. **Contrato y código.** `docs/api-contract.md:675-686` leído contra
   `movements.service.ts:219-223`: mismos tres criterios y mismo sentido.
   - «Un `daySequence` nulo va detrás de los que lo tienen, dentro de su fecha»:
     es `nulls: 'last'` bajo `bookingDate desc`, y el test 2 lo afirma (seis
     movimientos con `daySequence` nulo, esperados al final de su fecha) y pasa.
   - «Mientras no cambien los datos»: la paginación es por `skip`/`take`, así
     que la condición es necesaria y está dicha; no promete nada sobre altas o
     bajas entre dos peticiones.
   - «Con cualquier `pageSize`»: el rango admitido sigue siendo 1–200 (`:720`).
   - `§PATCH /api/movements` (`:841-915`): `grep orden` no da ninguna línea en
     ese tramo; no promete orden, así que usar ahí la misma constante no
     contradice nada.
   - `git grep -n -i "daySequence DESC\|bookingDate DESC\|bookingDate: 'desc'" -- . ":!progress" ":!specs"`:
     fuera del contrato, las demás líneas (`docs/architecture.md:647`,
     `docs/data-model.md:384`, `accounts.service.ts:121` y `:140`,
     `movements.service.ts:61`) hablan del saldo de la cuenta, que no ha
     cambiado. Ninguna describe el orden del listado.
5. **Datos y limpieza de los tests.** Los dos tests crean cuentas con
   `createAccount()` (IBAN de `syntheticIban()`, ids apuntados en
   `createdAccountIds`) y movimientos con `seedMovement()`; el `afterEach` de
   `movements.test.ts:615-620` borra los movimientos de esas cuentas y las
   cuentas. Usan `buildApp()` y `app.prisma`, sin cadena de conexión. Los valores
   son inventados y con sufijo aleatorio en la descripción. `grep` de los ids,
   importes y conceptos que cita el encargo sobre los cinco archivos del cambio:
   ninguna coincidencia nueva (la única línea que sale, `docs/api-contract.md:1390`,
   no es de este diff). La suite completa del punto 6 pasó, y es la que pone en
   rojo un archivo que deje filas y la que compara con la base del humano.
6. **`./init.sh` completo** — código de salida **0**:

   ```
   [OK]    Type check OK (tsc sin errores)
   [OK]    OK: pnpm run lint
   [OK]    OK: pnpm run format:check
    Test Files  76 passed (76)
         Tests  1349 passed (1349)
   [OK]    Todos los tests pasan
   [OK]    Entorno listo. Puedes empezar a trabajar.
   ```

**El árbol quedó como estaba.** Antes y después de todo lo anterior, `sha256sum`
de los cinco archivos da los mismos valores (`movements.service.ts` =
`e8de2c11…0388`), `git status --short` y `git diff --stat` son idénticos a los
del principio (4 archivos, 131 inserciones, 3 borrados) y `git stash list` está
vacío. No usé `git stash`: copié el archivo fuera y lo devolví.

También: informe del implementer contrastado con el código (líneas 212-223, 285,
420, 1156, 1182 y 675-686 coinciden); convenciones (sin `console`, sin `TODO`,
sin dependencias nuevas); `docs/lessons.md` (ninguna de las tres entradas activas
aplica: no hay columna nueva, ni fixture `.xls`/`.pdf`, ni archivo del humano).

### Lo que NO he comprobado

- **El arreglo sobre los datos reales.** No he lanzado nada contra la base del
  humano y el implementer tampoco (`## Prueba real` de su informe lo dice). Lo
  que lo demostraría: recorrer las páginas de `GET /api/movements` con
  `pageSize=100` contra el backend arrancado con este código y contar ids
  distintos contra `pagination.total`. Solo `GET`.
- **Que los dos tests salgan rojos sin el arreglo en cualquier pasada.** Sin el
  último criterio, cómo resuelve PostgreSQL un empate no está definido. Los he
  visto rojos tres de tres veces (más la del implementer); no puedo afirmar que
  lo sean siempre. Con el arreglo, el verde sí es determinista.
- **Con cuál de los tres `pageSize`** falla el test 2 sin el arreglo: se detiene
  en el primero que falla y no lo miré.
- **El orden de la respuesta de `PATCH /api/movements` ante un empate**: ningún
  test lo afirma. No estaba en el alcance (dos tests, los dos del listado) y el
  contrato no promete orden ahí.

### Observación que no bloquea

- `movements.test.ts:1162-1164`: `lowerId` y `higherId` guardan el movimiento
  entero, no un id (se usan como `higherId.id`). El nombre no dice lo que
  contiene.
