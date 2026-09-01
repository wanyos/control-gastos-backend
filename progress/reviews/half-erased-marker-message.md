# Review — F28 `half-erased-marker-message`

> 🔒 Ni un dato real en este informe (ADR-017). Del fichero real del humano solo se
> dicen **recuentos y forma**: ni un importe, ni una fecha, ni un nombre.

**Veredicto: APPROVED**, con dos condiciones de cierre que **no son del implementer**
(están abajo, §Condiciones) y una observación que pertenece a la **F29**.

Resumen de cierre: [`progress/summaries/half-erased-marker-message.md`](../summaries/half-erased-marker-message.md).

## Lo que se ha ejecutado, no leído

- `./init.sh`: **tsc sin errores**, **48 archivos / 879 tests en verde**. El script
  **termina en FAIL** por una sola línea, y no es código: `[FAIL] Hay 2 features en
  in_progress (máximo 1)` (F28 + F29 en paralelo). Ver §Condiciones.
- Suite del módulo + guardianes: `trade-republic` + `architecture.test.ts` +
  `no-real-data.test.ts` → **165 tests, todos pasan**.
- **31 casos propios contra el parser**, escritos por el revisor y ejecutados fuera de
  la suite (no se ha tocado ni un test del implementer). Tabla abajo.
- **Pasada real de lectura sobre el `.json` que el humano tiene en
  `var/drive-read/trade-republic/`**: 1 fichero `.json`, **ACEPTADO**, 13 campos, su
  `name` no empieza por `<` ni acaba en `>` ni contiene ninguno de los dos símbolos.
  Es decir: **la regla nueva no rechaza su archivo bueno**. Solo lectura, sin base de
  datos y sin red.
- Base del humano: la suite completa pasó **con los dos guardianes de la F27 activos**
  (foto de recuentos y secuencias antes/después). Si algo hubiera escrito en su base, la
  pasada habría terminado en rojo; terminó en verde. **Nada escribió.**

## 1. Falsos positivos — el argumento se sostiene, con una salvedad dicha

Se buscó un valor legítimo que HOY se rechace y ANTES no. Solo puede haberlo en `name`
(los demás campos son fecha, número, `type` cerrado y `currency`, donde un `<` o un `>`
nunca es legítimo). Resultado de los casos probados:

| Valor de `name` (sintético) | Antes | Ahora |
| --- | --- | --- |
| `Ahorro 3 > 2` | entra | **entra** |
| `Ahorro a < plazo` | entra | **entra** |
| `IRPF <19%` | entra | **entra** |
| `Ahorro (tipo >2%)` | entra | **entra** |
| `-> traspaso` | entra | **entra** |
| `Ahorro <alto> rendimiento` (marcador entero **en medio**) | entra | **entra** |
| `cuenta <2025>` (acaba en `>`) | entra | **se rechaza** |
| `<Ahorro sintetico` | entra | **se rechaza** |
| `Cuenta Remunerada>` | entra | **se rechaza** |

Los tres últimos son el **trade-off aceptado y documentado**, no un descuido: están
escritos en el informe (§Decisión 1), en el propio código
(`trade-republic.product.parser.ts:258-272`) y en el documento que él lee
(`docs/trade-republic-product-files.md:206-214`), con la salida dicha ("renómbrala"). Y
`cuenta <2025>` es justamente la forma que tiene el accidente cuando escribe **delante**
del marcador en vez de sobre él, así que rechazarlo es correcto, no colateral.

Su argumento —«borrar medio marcador deja **siempre** el otro símbolo en un extremo»— es
**cierto para el borrado**, que es el accidente que documentó. Comprobado en espacios,
saltos de línea y valores de un carácter:

- `" <2026-08-31"`, `"2026-08-31 >"` y `"\n<2026-08-31\n"` → **detectados** (hay `trim()`
  antes de mirar los extremos).
- `"<"` y `">"` (un solo carácter) → **detectados**, y no confundidos con marcador entero.
- `"<>"` y `"< >"` → tratados como **marcador entero**, que es lo razonable.

## 2. Falsos negativos — dos formas que siguen sin decirse por su nombre

Ninguna es un incumplimiento del `acceptance` (los diez criterios acotan el caso a
«empieza por `<` o acaba en `>`»), pero quedan escritas porque son las que se van a
encontrar el día que vuelva a pasar:

1. **El símbolo residual en medio del valor**: `"2026<-08-31"` y `"2026-08->31"` siguen
   respondiendo `fecha inválida, se espera el formato AAAA-MM-DD`. No salen de borrar un
   delimitador, sino de escribir **dentro** del marcador; su decisión (no contar el
   medio) es la correcta porque contarlo se llevaría por delante `name`, así que esto es
   coste asumido, no defecto.
2. **El valor escrito conservando los DOS símbolos**: `"<2026-08-31>"` se reporta como
   `campos sin sustituir, siguen con el marcador <…> de la plantilla`. Ahí el mensaje
   afirma algo que no es verdad —sí lo rellenó—, aunque le señala el campo y el símbolo
   correctos. Es el mensaje de la R2 de la F20, que el criterio 3 obliga a **no tocar**:
   se deja constancia para una feature futura, no se pide cambio aquí.

Cobertura por campos: los **once** campos de la plantilla pasan por `collectMarker`
(`type`, `name`, `currency`, `date`, `openedAt`, `closedAt` y los cinco importes).
Verificado uno a uno; ninguno se queda fuera. Un importe con el corchete pegado
(`"<4006.40"`, `"0>"`, `"<4006,40"`) sale como marcador a medio y **no** como «se espera
un número».

## 3. Lo que ya funcionaba sigue funcionando

- **Marcador entero (R2 de la F20 / accidente del 2026-08-15)**: literal intacto,
  sus cuatro tests preexistentes sin tocar y verde, y comprobado además en convivencia
  (mismo archivo con un campo entero y otro a medio → los dos motivos, separados y en
  ese orden).
- **Valores de verdad mal escritos**: comprobados por el revisor los tres literales
  (`fecha inválida…`, `se espera un número sin comillas…`, `se espera un número, recibido
  true`), más `31/08/2026`, `type: fund`, `name: "   "`, `"4006.40"`, `2026-02-31`:
  todos dicen **exactamente** lo de antes y ninguno se llama marcador a medio.
- **Cuadre aritmético**: sigue sin apilarse encima de un marcador (los importes no se
  leen), comprobado.
- **Otros bancos**: la F28 no toca una línea fuera de `src/modules/trade-republic/`;
  `bankinter`, `n26`, `openbank` y `myinvestor` verdes, y `architecture.test.ts` también.

## 4. La decisión de NO compartirlo con MyInvestor — se sostiene HOY, con la F29 dentro

Comprobado contra el repo tal y como está ahora, no como estaba cuando lo escribió:

- `docs/conventions.md:238-245` sigue diciendo **un parser por banco, sin genéricos**, y
  que lo compartible es lo que *no* es formato. El marcador `<…>` es formato de la
  plantilla de cada banco.
- **MyInvestor sigue sin tener esta pieza**: `grep` de `isMarker`/marcador en
  `src/modules/myinvestor/` → **cero resultados**, y el diff de la F29 **no añade
  ninguna**: solo añade quién escribe (`parseMyinvestorProductFile`, `toProductInput`),
  no cómo se lee. Extraer a `src/lib/` seguiría siendo un compartido **con un solo
  usuario**.

⚠️ **Pero la F29 sube el precio de su sugerencia nº 1, y conviene que el humano lo sepa**:
hasta ayer un `name` de MyInvestor que fuera un marcador entero se quedaba en un volcado;
**desde la F29 acabaría escrito en la base de datos como el nombre del producto** — que es
el accidente del 2026-08-15 con persistencia detrás. `myinvestor.product.parser.ts:159-171`
solo exige «texto no vacío», y un marcador lo es. **No cuenta contra la F28** (su
`acceptance` acota el trabajo a Trade Republic y la decisión está justificada), pero es
material para una feature siguiente, y sería el segundo usuario que justifica el
`src/lib/template-marker.ts` que él mismo propone.

## 5. La tabla de «qué pasa cuando un archivo está mal» — recoge el caso y dice la verdad

`docs/trade-republic-product-files.md:196` (fila) y `:206-214` (nota). Cada afirmación de
las dos se ha ejecutado contra el parser:

| Lo que dice el documento | Comprobado |
| --- | --- |
| `"<2026-08-01"` y `"4006.40>"` dan «te dejaste un símbolo suelto», con campo y valor | ✅ |
| **No** dice que la fecha o el número estén mal | ✅ (el motivo antiguo desaparece) |
| Cuenta empezar por `<` o acabar en `>` | ✅ |
| El símbolo **en medio** no cuenta y entra (`Ahorro 3 > 2`) | ✅ |
| Un nombre no puede empezar por `<` ni acabar en `>` | ✅ |
| El parser **no lo arregla** | ✅ (rechazo íntegro, ningún producto sale) |

Con guardián: `trade-republic.docs.test.ts:80-91`.

## 6. El cambio de `trade-republic.routes.test.ts` — **legítimo**, y no tapa nada

Es de la **F29**, no de la F28 (el informe de la F28 dice expresamente que no lo tocó, y
el comentario nuevo lo atribuye a la 29). Lo que hacía el test era afirmar que el registro
de productos tenía **exactamente un** banco; la F29 mete a MyInvestor en ese registro por
diseño, así que la afirmación caduca por decisión, no por conveniencia.

Lo que se conserva es lo que ese test protege de verdad: que Trade Republic **está** en el
registro y que lee `.json` **y nada más** (`toContain` + `find(...).extensions === ['.json']`).
No se ha borrado ninguna aserción, se han sustituido por su versión abierta. Lo que sí se
pierde —que **nadie más** entre en el registro sin darse cuenta— nunca fue guardián de este
módulo, y `architecture.test.ts` sigue cubriendo el registro de `src/app.ts`.

**Hallazgo, y va contra la F29, no contra la F28:** ese archivo queda **sin formatear**.
`npx prettier --check src/modules/trade-republic` avisa de
`trade-republic.routes.test.ts` (las líneas 140-142, las que la F29 reescribió), y
`docs/conventions.md:43-53` fija Prettier como obligatorio. Se arregla con
`pnpm run format`; **quien cierre la F29** debe hacerlo.

## Condiciones de cierre (no son del implementer de la F28)

1. **`./init.sh` termina en FAIL** por `Hay 2 features en in_progress (máximo 1)` —
   estado del leader por revisar F28 y F29 en paralelo, no código. Vuelve a verde en
   cuanto una de las dos pase a `done`. El código de esta feature está verde por sí solo
   (tsc limpio, 879/879 tests). **No se aprueba con la suite rota; se aprueba con la
   suite entera en verde y una casilla de coordinación pendiente.**
2. **`progress/current.md` no menciona ni la F28 ni la F29** (1.146 líneas, todas de
   features ya cerradas). El C2 pide que describa la sesión activa. Es archivo del
   leader.

## Comprobado sin hallazgos

Los **10 criterios de `acceptance` ↔ tests** (mapeo del informe verificado uno a uno, y
los tres criterios de decisión delegada están resueltos **por escrito** en
`progress/implementations/half-erased-marker-message.md`); arquitectura
(`docs/architecture.md`: nada fuera de `src/modules/trade-republic/`, ninguna dependencia
nueva, ningún import entre bancos); convenciones (`docs/conventions.md`: comillas simples,
sin punto y coma, 100 columnas, imports con `.js`, comentarios en inglés y mensajes al
humano en castellano, **prettier y oxlint limpios en los tres archivos que sí tocó la
F28**, ni un `console.log` ni un TODO); tests que verifican **salida concreta** (literales
del motivo, no «no lanza»); fixtures 100 % sintéticos y sin red (ADR-017, guardián de
`no-real-data.test.ts` verde); C4 bis cubierto en sustancia con la pasada de lectura sobre
su fichero real; CHECKPOINTS C1, C3, C4, C4 bis, C5, C6 (no aplica: esta feature no cambia
el contrato de la API) y C8.
