# Resumen — mantenimiento `dependency-upgrade-2026-10` (sin feature)

Fecha de cierre: 2026-10-28
Intención original: tarea de mantenimiento aprobada por el humano el 2026-10-28,
sin entrada en `feature_list.json` (y por tanto sin bloque `intent` ni `checks`).
Informe del implementer: [`progress/implementations/dependency-upgrade-2026-10.md`](../implementations/dependency-upgrade-2026-10.md).
Revisión: [`progress/reviews/dependency-upgrade-2026-10.md`](../reviews/dependency-upgrade-2026-10.md).

## Qué hace ahora la app que antes no

Nada nuevo de cara al usuario. Las dependencias están al último parche (y
`oxlint` al último menor, `@googleapis/drive` al 27), y el proyecto ya no fija
la versión de pnpm: cada equipo usa el pnpm que tenga instalado. `pnpm audit
--prod` baja de 34 avisos a 30.

## Por dónde se toca (puntos de entrada)

| Cómo se usa | Código |
| --- | --- |
| Rangos de las dependencias de producción | [package.json:37](../../package.json#L37) |
| Rangos de las dependencias de desarrollo | [package.json:45](../../package.json#L45) |
| Qué pnpm se usa (ya sin versión fijada) | [docs/stack.md:51](../../docs/stack.md#L51) |
| Avisos de `pnpm audit --prod` que quedan | [docs/roadmap.md:462](../../docs/roadmap.md#L462) (cabo 27) |

## Dónde está el código

### Dependencias

| Qué hace | Dónde |
| --- | --- |
| Sin campo `packageManager`; rangos subidos: `@prisma/adapter-pg`, `@prisma/client` y `prisma` `^7.10.1`, `fastify` `^5.12.7`, `fastify-plugin` `^6.0.1`, `pg` `^8.23.1`, `prettier` `^3.9.10`, `vitest` `^5.0.5`, `oxlint` `^1.90.0`, `@googleapis/drive` `^27.0.0`. `@types/node` sigue en `^24.13.4` | [package.json](../../package.json) → `dependencies`, `devDependencies` |
| Versiones resueltas. Sin el primer documento YAML que guardaba pnpm 12.5.1 (`packageManagerDependencies`, `@pnpm/exe.*`), borrado a mano; una sola copia de `pg` (8.23.1), también para `@prisma/adapter-pg`, puesta a mano | [pnpm-lock.yaml](../../pnpm-lock.yaml) → `importers`, `@prisma/adapter-pg@7.10.1` en `snapshots` |
| Cliente Prisma regenerado con 7.10.1 (no está en git) | `src/generated/prisma/` |

### Documentos

| Qué hace | Dónde |
| --- | --- |
| Versiones nuevas y el párrafo del gestor de paquetes (probado con pnpm 11.22.0 y 12.5.1) | [docs/stack.md](../../docs/stack.md) → «Framework / Runtime», «Librerías clave», «Build / Dev tooling», «Testing» |
| Cifras de `pnpm audit --prod` antes y después, y qué avisos quedan | [docs/roadmap.md](../../docs/roadmap.md) → cabo 27 |
| Estado de la tarea | [progress/current.md](../current.md) |

### Tests

No hay tests nuevos: es una subida de versiones. La comprueba la suite entera
(`./init.sh`: tsc, oxlint, Prettier y 1487 tests).

## Cumplimiento de lo aprobado

Sin `intent`; se comprueba contra lo que aprobó el humano:

- ✅ «Quitar `packageManager` de `package.json` y su rastro en `pnpm-lock.yaml`»
  → no queda en ninguno de los dos; `pnpm install --frozen-lockfile` con pnpm
  11.22.0 y con 12.5.1, en una copia limpia, deja el lockfile igual.
- ✅ «Subir los diez paquetes de la lista» → `importers` del lockfile y
  `pnpm why pg` (una sola versión) lo muestran; fuera de esos paquetes solo se
  mueven sus propias dependencias.
- ✅ «No subir `@types/node` ni `prisma` 8» → `@types/node` 24.13.4 y `prisma`
  7.10.1.
- Sin check: no hay feature. `./init.sh` en verde (91 archivos, 1487 tests)
  en la última pasada.

## Decisiones que se tomaron por ti

- El primer documento YAML del lockfile se borró a mano porque ni pnpm 11.22.0
  ni 12.5.1 lo quitan al quitar el campo.
- La segunda copia de `pg` (8.23.0) se quitó editando el lockfile a mano, no con
  `pnpm dedupe`, que además movía `@types/node` y `pg-protocol` de `@types/pg`.

## Qué NO se tocó / quedó fuera

- `@types/node` 26 y `prisma` 8 (rc), por decisión del humano.
- Los avisos que quedan en `pnpm audit --prod` (`fast-uri`, `brace-expansion`,
  `uuid`, `qs`): siguen en el cabo 27.
- `@googleapis/drive` 27 no se ha probado contra Google. Entre la 26 y la 27 no
  cambia ningún tipo ni firma (comparado el contenido de los dos paquetes), pero
  queda la prueba real que describe el informe del implementer (ingesta,
  `db:backup`, `db:restore`).

## Notas para el futuro

- Algunos tests de `src/no-real-data.test.ts` y uno de `src/architecture.test.ts`
  pasan de 5 s en la suite completa en este equipo, y `./init.sh` sale en rojo
  algunas veces. Pasaba igual antes de esta subida (comprobado en `HEAD`, en la
  revisión). Solos pasan.
