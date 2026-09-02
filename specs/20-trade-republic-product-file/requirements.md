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

El módulo `src/modules/trade-republic/` DEBE quedar **aislado**: NO DEBE importar
nada de otro módulo de banco, ni nombrarlo, ni ser importado desde ningún archivo
de `src/` que no sea `src/app.ts`; y NO DEBE contener ninguna referencia a
`prisma`. La feature NO DEBE modificar `prisma/schema.prisma` ni añadir
migraciones.

## R6 — retirado

Fusionado en **R5**: es el mismo invariante (el módulo está aislado del resto de
bancos y de la base de datos), comprobado por dos guardianes. El número **no se
reutiliza**.

## R7

CUANDO un archivo trae `type` = `savings_account`, `name`, `date`, `openedAt`,
`openingBalance`, `moneyIn`, `moneyOut`, `balance` e `interest` válidos, el
sistema DEBE devolver el producto con esos valores **exactamente como están
escritos**, sin calcular, redondear ni reformatear ninguno.

## R8

SI faltan campos obligatorios ENTONCES el sistema DEBE rechazar el archivo
enumerando por su nombre **todos** los que faltan, no el primero.

## R9

SI un valor no cumple lo esperado para su campo —un número escrito como texto
(`"1234.56"`, `"1.234,56"`), un valor que no es número (`true`, `[]`, `{}`), una
fecha fuera de `AAAA-MM-DD`, o un `type` distinto de `savings_account` (o
ausente)— ENTONCES el sistema DEBE rechazar el archivo diciendo el campo, el
valor recibido y lo esperado (el formato, o el único valor admitido), y NO DEBE
interpretarlo nunca, ni siquiera cuando el texto sería inequívoco.

## R10 — retirado

Fusionado en **R9**: un `type` no admitido es un valor que no cumple lo esperado
para su campo, como los demás. El número **no se reutiliza**.

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

## R17

CUANDO los cinco importes del archivo (`openingBalance`, `moneyIn`, `moneyOut`,
`interest`, `balance`) son números válidos, el sistema DEBE comprobar el cuadre
`openingBalance + moneyIn − moneyOut + interest = balance` —donde `moneyIn` son
las entradas del mes **sin contar los intereses**, que van aparte en `interest`—
y SI no cuadra ENTONCES DEBE **rechazar** el archivo (no avisar) diciendo **la
desviación con signo**, el **saldo final esperado** frente al escrito, y **los
cinco campos que intervienen, con su valor**.

## R18

El cuadre de R17 DEBE compararse en **céntimos enteros** y con una **tolerancia
de 1 céntimo** (una desviación de 0.01 o menor NO DEBE rechazar el archivo), y SI
falta alguno de esos cinco importes o alguno es inválido ENTONCES el archivo DEBE
rechazarse por R8/R9 y el cuadre NO DEBE evaluarse (nunca un motivo de cuadre
calculado sobre datos incompletos).

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
  parser de MyInvestor: son bancos distintos» y de «no quiero que esto toque la
  base de datos», más la norma «un parser por banco» de `docs/conventions.md`. El
  guardián que ya existe se amplía a este banco. (Absorbe el antiguo R6.)
- **R7** — (delegado) Es el juego de campos de la **cuenta remunerada**, la
  decisión nº 1 del `delego_en_agente`. Elegidos: `type`, `name`, `date`,
  `openedAt`, `balance`, `interest`, `openingBalance`, `moneyIn` y `moneyOut`
  obligatorios; `currency` (def. `EUR`), `closedAt` y las claves `_` opcionales.
  Los tres últimos **los pidió el humano en la puerta del 2026-08-19** (punto 1,
  alternativa). Descartados con razón: `iban`, `interestRate` y los apuntes uno a
  uno (ver `design.md` §2). «Sin calcular nada» es doctrina heredada de ADR-016.
- **R8, R9, R11, R12** — (humano) Salen de «si escribo un número con coma
  decimal, o una fecha en otro formato, me lo dice por su nombre, como ya hace el
  de MyInvestor». La **doctrina** se copia; el **código** no (R5).
- **R10** — retirado, fusionado en R9. El campo `type` con un único valor
  admitido `savings_account` fue propuesta del agente y el humano la **confirmó**
  en la puerta del 2026-08-19 (punto 5).
- **R13, R15** — (delegado) Forma de la salida, decisión nº 2 del
  `delego_en_agente`: se copia la **forma** de MyInvestor (un `products.json` por
  año, fallos aislados por archivo) sin compartir el código. Justificación
  completa en `design.md` §3.
- **R14** — (añadido) El humano no dijo qué pasa con el `.pdf` del extracto, que
  **sigue estando en esa carpeta de Drive** y va a bajar cada mes. **Propongo**
  que se liste como ignorado y no como fallo: si fuera un fallo, tendría un error
  rojo todos los meses por un archivo que hace bien en estar ahí. ← REVISAR EN
  APROBACIÓN.
- **R17** — (humano) Sale de la puerta del 2026-08-19: eligió expresamente la
  variante dura del cuadre («si no cuadra, se rechaza, diciendo cuánto se desvía y
  qué campos no cuadran»). Es lo que convierte los tres campos nuevos en una red
  contra erratas en vez de en más cosas que teclear. **Decido** que `moneyIn`
  excluya los intereses: si los incluyera, un mes sin más movimientos que el abono
  los contaría dos veces y el cuadre fallaría siempre.
- **R18** — (delegado) El humano pidió el cuadre; **decido** cómo se compara y
  cuándo no se evalúa. Céntimos enteros porque `0.1 + 0.2 !== 0.3` en coma
  flotante y un cuadre hecho en `number` crudo rechazaría meses buenos. Tolerancia
  de **1 céntimo**, ni más ni menos: los cinco importes vienen ya redondeados a
  céntimo por el banco, así que más margen dejaría pasar erratas de verdad y menos
  rechazaría un redondeo del propio banco. Y los tres campos nuevos son
  **obligatorios como los demás**: si fueran opcionales, olvidarse de uno
  desactivaría el guardián en silencio, justo lo contrario de lo que se pidió.
- **R16** — (humano) Sale de «lo dejo en la carpeta de Trade Republic de Drive y
  el backend lo lee y me dice si está bien o qué le falta»; la ruta es la misma
  forma que las dos que ya existen.

### Cobertura del `como_se_que_esta_bien`

| Punto del `intent` | Requirements |
|---|---|
| Plantilla con marcadores `<…>` | R1, R2 |
| Lo dejo en Drive y el backend lo lee y me dice si está bien | R13, R14, R15, R16 |
| Coma decimal o fecha mal → me lo dice por su nombre | R8, R9, R11, R12 |
| El archivo se comprueba a sí mismo: una errata no cuela | R17, R18 |
| Queda escrito que es provisional | R4 |

### Nota de tamaño (regla 2)

El cuadre aritmético aprobado el 2026-08-19 añade dos requirements (R17, R18).
Para no dejar el recuento creciendo sin más, **se han reagrupado dos pares que
estaban partidos de más**: R6 se fusiona en R5 (un solo invariante, «el módulo
está aislado», comprobado por dos guardianes) y R10 en R9 (un `type` no admitido
es un valor inválido más). Los números retirados **no se reutilizan**, para que
las referencias que ya circulan sigan valiendo.

Quedan **16 requirements vivos** (R1-R5, R7-R9, R11-R18), uno por encima del tope
de ~15, y sigue sin proponerse partir la feature. La razón, dicha mejor que antes:
de esos 16, **tres son documentación** (R1, R3, R4), **uno es un invariante de
arquitectura** (R5), **cuatro son la misma cortesía de errores** partida en sus
casos verificables (R8, R9, R11, R12) y **dos son el cuadre** (R17, R18), que es
una sola regla y su letra pequeña. De código con entidad propia hay **dos**: el
parser (R7) y el recorrido (R13). La única frontera por la que se podría cortar es
«plantilla» / «parser», y deja los dos lados inservibles: una plantilla que nadie
lee, o un parser sin formato que leer. La razón queda dicha en `decisions.md`.
