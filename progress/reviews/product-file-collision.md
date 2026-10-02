# Review — feature 53 `product-file-collision`

## Review (2026-10-02)

**Veredicto:** APPROVED
Comprobado: requirements ↔ tests (R1-R15), arquitectura, convenciones,
verificación, CHECKPOINTS C1-C8. Checks: 8 de 8 en verde.
Sin hallazgos.
Resumen de cierre: `progress/summaries/product-file-collision.md`.

### Con qué comando y qué salió

- `./init.sh` → exit 0, `Test Files 70 passed (70)`, `Tests 1286 passed (1286)`,
  `tsc`, `oxlint` y `prettier --check` sin errores. Partida: 69 y 1271.
- `./init.sh --checks 53` → exit 0, `Checks: 8 de 8 en verde`. Los siete que
  filtran por nombre imprimen su recuento (`Tests 1 passed | 78 skipped (79)` los
  cinco de `import.service.test.ts`, `Tests 2 passed | 9 skipped (11)` el de
  MyInvestor, `Tests 1 passed | 2 skipped (3)` el del contrato) y su `grep -E
  "Tests +N passed"` no puede salir con 0 si el test no se ejecuta. El octavo es
  `pnpm test`. Coinciden uno a uno con la tabla 🧪 de `decisions.md` y con los
  nombres de `tasks.md`.
- `pnpm exec vitest run <los tres archivos de test> -t "feature 53"` →
  `Tests 15 passed | 78 skipped (93)`: los 15 tests nuevos existen y pasan.
- `git diff HEAD --stat`, `git status --short`: 0 líneas borradas en `src/`;
  sin cambios en `src/modules/investments/`, en ningún parser, en `prisma/`, en
  ningún `*.routes.ts`, en `src/app.ts` ni en ningún archivo del motor del
  harness. `gastos-frontend` es otro repositorio y no contiene
  `DUPLICATE_PRODUCT_FILE`.
- `git grep -i "nadie te avisa|avisa del choque|sin que nada avise"` fuera de
  `progress/` y `specs/` → solo la fila 21 de `docs/roadmap.md`, que es el texto
  original del cabo, tachado.
- Búsqueda de «foto», «pisa» y «colisi» en las líneas añadidas del diff, en el
  informe y en el spec → solo esa misma fila 21 tachada (texto que ya existía) y
  la línea del informe que las cita para decir que no las usa.

### Lo que no he comprobado ejecutando

- **Que los archivos llegan por orden de nombre** (decisión 🔴 1). Los tests
  demuestran que se rechaza el archivo que la importación lee después; que ese
  orden es por nombre de banco, de carpeta de año y de archivo lo he leído en
  `src/lib/drive-structure.ts` (`orderBy: 'name'` en `listBankFolders`,
  `listYearFolders` y `listPendingFiles`, que esta feature no toca) y ningún
  test lo fija. Haría falta una llamada contra un Drive real.
- **La pasada del implementer con la comparación desactivada** (9 fallan, 3
  pasan). No la he repetido: exige editar código y el reviewer no lo edita.
- **Una importación real con dos archivos repetidos en Drive.** No la ha hecho
  nadie (el informe lo dice y dice por qué). La feature no cambia la lectura de
  ningún archivo, así que C4 bis no la exige; `docs/roadmap.md` no la tiene
  apuntada como deber del humano.
