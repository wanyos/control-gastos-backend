# Requirements — F20 `trade-republic-product-file`

> EARS estricto. Material del `implementer` y del `reviewer`; el humano lee
> `decisions.md`.
>
> **Alcance de una frase:** Trade Republic entra como un `.json` que el humano
> rellena cada mes con la foto de su cuenta remunerada. **No** hay parser del PDF,
> **no** hay base de datos y **no** se reutiliza ni una línea del parser de
> MyInvestor.

---

## R1

El sistema DEBE publicar `docs/trade-republic-product-files.md` con la plantilla
de la cuenta remunerada, en la que **todos** los valores son marcadores `<…>` y
**ninguno** tiene aspecto de valor real (ni un número, ni una fecha, ni un nombre
copiables tal cual).

## R2

CUANDO se parsea un archivo copiado de la plantilla **sin sustituir** sus
marcadores, el sistema DEBE rechazarlo con un motivo que nombre **todos** los
campos sin sustituir, y NO DEBE devolver ningún producto.

## R3

El documento de la plantilla DEBE remitir a `docs/myinvestor-product-files.md`
(enlace relativo) para las reglas de escritura ya escritas —número sin comillas y
con punto decimal, fecha `AAAA-MM-DD`, claves `_` ignoradas, el banco sale de la
carpeta— y NO DEBE reescribirlas.

## R4

El documento de la plantilla DEBE declarar que esta solución es **provisional** y
qué la revierte (el día que la cuenta tenga movimientos de verdad se escribe el
parser del PDF, cuyo diagnóstico está en
`progress/explorations/inventario-bancos-2026-08-17.md`), y `docs/roadmap.md`
DEBE llevar esa misma nota en su etapa E4.

## R5

El módulo `src/modules/trade-republic/` NO DEBE importar nada de otro módulo de
banco, ni nombrarlo, ni ser importado desde ningún archivo de `src/` que no sea
`src/app.ts`.

## R6

El módulo `src/modules/trade-republic/` NO DEBE contener ninguna referencia a
`prisma`, y la feature NO DEBE modificar `prisma/schema.prisma` ni añadir
migraciones.

## R7

CUANDO un archivo trae `type` = `savings_account`, `name`, `date`, `openedAt`,
`balance` e `interest` válidos, el sistema DEBE devolver el producto con esos
valores **exactamente como están escritos**, sin calcular, redondear ni
reformatear ninguno.

## R8

SI faltan campos obligatorios ENTONCES el sistema DEBE rechazar el archivo
enumerando por su nombre **todos** los que faltan, no el primero.

## R9

SI un valor no cumple el formato de su campo —un número escrito como texto
(`"1234.56"`, `"1.234,56"`), un valor que no es número (`true`, `[]`, `{}`), o una
fecha fuera de `AAAA-MM-DD`— ENTONCES el sistema DEBE rechazar el archivo
diciendo el campo, el valor recibido y el formato esperado, y NO DEBE
interpretarlo nunca, ni siquiera cuando el texto sería inequívoco.

## R10

SI `type` no es `savings_account` (o está ausente) ENTONCES el sistema DEBE
rechazar el archivo diciendo el valor recibido y el único valor admitido.

## R11

SI el archivo trae una clave que no está en la plantilla y no empieza por `_`
ENTONCES el sistema DEBE rechazarlo nombrando las claves sobrantes; las claves
que empiezan por `_` NO DEBEN provocar ningún error.

## R12

CUANDO un archivo tiene varios problemas a la vez, el sistema DEBE reportarlos
**todos en un solo motivo**, para que arreglarlo sea un solo viaje.

## R13

CUANDO el servicio recorre `<sourceBaseDir>/trade-republic/<año>/`, DEBE parsear
los archivos con extensión `.json` y escribir **un único** `products.json` por
año en `<dumpBaseDir>/trade-republic/<año>/`.

## R14

SI un archivo de la carpeta no tiene extensión `.json` —el `.pdf` del extracto
que el humano sube igualmente— ENTONCES el sistema DEBE listarlo en `ignored[]`
con su motivo y NO DEBE contarlo como fallo.

## R15

SI un archivo `.json` falla ENTONCES el sistema DEBE aislarlo en `failed[]` con
su nombre y su motivo, y DEBE parsear el resto de archivos igual.

## R16

CUANDO un cliente hace `POST /api/parser/trade-republic`, el sistema DEBE
responder `200` con el resultado del recorrido (`products`, `failed`, `ignored` y
sus contadores), incluso cuando algún archivo haya fallado.

---

## Procedencia

- **R1** — (humano) Sale de «una plantilla clara que copiar, con marcadores, como
  la de MyInvestor» y de la lección del 2026-08-15 (un archivo se subió
  conservando los valores del ejemplo y sobrevivió a una revisión humana).
- **R2** — (delegado) El humano pidió marcadores; **decido** que la garantía sea
  ejecutable: la plantilla entera pasada por el parser tiene que salir rechazada.
  Es lo que impide que los marcadores se conviertan en decoración. No hace falta
  código nuevo: `<…>` ya es inválido en los cuatro sitios donde aparece.
- **R3** — (humano) Sale del `delego_en_agente` nº 3 («cómo se enlaza con la de
  MyInvestor sin duplicar las reglas de escritura»). **Decido** enlazar, no
  copiar: dos copias de la misma regla divergen en cuanto una cambie.
- **R4** — (humano) Sale de «queda escrito que esto es provisional». **Decido**
  escribirlo en dos sitios: la plantilla (donde lo verá cada mes) y el roadmap
  (donde se decide qué se hace después).
- **R5** — (humano) Sale de «no quiero que el archivo de Trade Republic use el
  parser de MyInvestor: son bancos distintos», y de la norma «un parser por
  banco» de `docs/conventions.md`. El guardián que ya existe se amplía a este
  banco.
- **R6** — (humano) Sale de «no quiero que esto toque la base de datos».
- **R7** — (delegado) Es el juego de campos de la **cuenta remunerada**, la
  decisión nº 1 del `delego_en_agente`. Elegidos: `type`, `name`, `date`,
  `openedAt`, `balance`, `interest` obligatorios; `currency` (def. `EUR`),
  `closedAt` y las claves `_` opcionales. Descartados con razón: `iban`,
  `interestRate`, `openingBalance` / `moneyIn` / `moneyOut` y los apuntes uno a
  uno (ver `design.md` §2). «Sin calcular nada» es doctrina heredada de ADR-016.
- **R8, R9, R11, R12** — (humano) Salen de «si escribo un número con coma
  decimal, o una fecha en otro formato, me lo dice por su nombre, como ya hace el
  de MyInvestor». La **doctrina** se copia; el **código** no (R5).
- **R10** — (añadido) El humano no dijo que el archivo llevara un campo `type`
  teniendo un solo producto. **Propongo** llevarlo igualmente, con un único valor
  admitido `savings_account`: mantiene la forma paralela a MyInvestor y deja sitio
  al día que Trade Republic aporte un segundo producto. ← REVISAR EN APROBACIÓN.
- **R13, R15** — (delegado) Forma de la salida, decisión nº 2 del
  `delego_en_agente`: se copia la **forma** de MyInvestor (un `products.json` por
  año, fallos aislados por archivo) sin compartir el código. Justificación
  completa en `design.md` §3.
- **R14** — (añadido) El humano no dijo qué pasa con el `.pdf` del extracto, que
  **sigue estando en esa carpeta de Drive** y va a bajar cada mes. **Propongo**
  que se liste como ignorado y no como fallo: si fuera un fallo, tendría un error
  rojo todos los meses por un archivo que hace bien en estar ahí. ← REVISAR EN
  APROBACIÓN.
- **R16** — (humano) Sale de «lo dejo en la carpeta de Trade Republic de Drive y
  el backend lo lee y me dice si está bien o qué le falta»; la ruta es la misma
  forma que las dos que ya existen.

### Cobertura del `como_se_que_esta_bien`

| Punto del `intent` | Requirements |
|---|---|
| Plantilla con marcadores `<…>` | R1, R2 |
| Lo dejo en Drive y el backend lo lee y me dice si está bien | R13, R14, R15, R16 |
| Coma decimal o fecha mal → me lo dice por su nombre | R8, R9, R10, R11, R12 |
| Queda escrito que es provisional | R4 |

### Nota de tamaño (regla 2)

Son **16 requirements**, uno por encima del tope de ~15. No se propone partir la
feature: **cuatro** (R1, R3, R4 y los dos guardianes R5/R6) son documentación e
invariantes, no código nuevo, y **cinco** (R8-R12) son la misma cortesía de
errores partida en sus casos verificables. Partirla dejaría una plantilla sin
parser o un parser sin plantilla, que es exactamente lo que el humano no pidió.
La razón queda dicha en `decisions.md`.
