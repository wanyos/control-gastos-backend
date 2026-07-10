# Proyecto hermano — Frontend

> Este backend forma parte de un workspace de dos proyectos. Ver el
> `CLAUDE.md` de la carpeta madre para el mapa completo.

## Quién consume esta API

- `TODO-frontend/` (TODO: stack, ej. Vue3 + TypeScript) consume esta API.

## Qué debe saber el harness del backend

- **Este proyecto es DUEÑO del contrato de la API**, documentado en
  `docs/api-contract.md`. Es la fuente de verdad.
- Cuando implementes o cambies un endpoint, **actualiza `docs/api-contract.md`
  en la misma feature**. No dejes el contrato desactualizado: el frontend
  construye contra él.
- No necesitas leer el código del frontend. No comparten tipos: cada lado
  define los suyos. Tu única obligación hacia el frontend es mantener el
  contrato correcto y actualizado.
- Si un cambio en la API rompe el contrato anterior (breaking change),
  anótalo de forma visible en `docs/api-contract.md` y en
  `progress/current.md`, para que la feature correspondiente del frontend
  se planifique después.

## Qué NO haces desde aquí

- No edites código ni archivos del frontend.
- No implementes en la misma sesión cambios de los dos proyectos.
