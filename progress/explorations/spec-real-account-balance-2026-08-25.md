# blocked: la feature no cabe — F31 `real-account-balance`

> Escrito por el `spec-author` el 2026-08-25, **antes** de redactar una sola
> línea de `requirements.md`. Regla 2 de `docs/specs.md`: si el spec se va de
> ~15 requirements, se para y se propone el corte, no se redactan 40 en
> silencio.

## Qué he leído antes de parar

- El bloque `intent` completo de F31 en `feature_list.json`, incluidos
  `_procedencia` y los 9 `_avisos_tecnicos`.
- `progress/explorations/handoff-backend-saldo-real.md` (la entrada real: la
  evidencia medida contra la base y contra `var/parsed/`). Su aviso 1 está
  **rectificado**: la precedencia de `computeAccountBalance` NO se toca; lo que
  cambia es que el camino de la suma deja de ser un *fallback* que arranca de 0
  para ser un cálculo de primera clase que corre siempre desde el ancla.
- El código que toca: `src/modules/movements/movements.service.ts:56`
  (`computeAccountBalance`), `src/modules/accounts/accounts.service.ts:53`
  (`attachBalances`), `src/modules/import/import.service.ts`,
  `src/modules/openbank/openbank.statement.parser.ts:310`,
  `src/lib/parsed-statement.ts`, `prisma/schema.prisma:70` (`model Account`),
  `docs/api-contract.md:168`.

**Las entradas reales están todas disponibles** (regla 3 satisfecha): el
handoff, el volcado de `var/parsed/` descrito en él y el contrato de API. No es
un bloqueo por falta de datos.

## Por qué no cabe: dos medidas, no una impresión

**1. Requirements.** El recuento mínimo, ya agrupado todo lo agrupable y sin
casos de error de adorno, sale a **18-19**:

| # | Requirement mínimo |
|---|---|
| 1 | Al importar, una cuenta SIN ancla queda anclada con el saldo del archivo |
| 2 | Una cuenta que YA tiene ancla no se reescribe con el archivo siguiente |
| 3 | Un saldo de archivo igual a cero se trata como saldo real, no como «no viene» |
| 4 | Un extracto de N26/MyInvestor sin la línea `saldo;` se importa igual, sin ancla |
| 5 | Openbank persiste el saldo por línea en `balanceAfter` (reversión de F19/ADR-013) |
| 6 | Los textos de F19/ADR-013 que dicen lo contrario quedan corregidos |
| 7 | Un banco sin preámbulo (Bankinter) saca su ancla de su propio `balanceAfter` |
| 8 | El cálculo desde el ancla se ejecuta SIEMPRE, en todas las cuentas |
| 9 | La precedencia se mantiene: manda el `balanceAfter` del archivo donde lo hay |
| 10 | ...MÁS los movimientos posteriores al último que trae saldo (aviso 6) |
| 11 | El saldo se mantiene solo al entrar movimientos nuevos, sin escribir nada |
| 12 | Importar movimientos ANTERIORES al ancla no envenena el saldo (aviso 3) |
| 13 | Conciliación línea a línea donde hay saldo por movimiento |
| 14 | Conciliación contra el ancla del preámbulo donde no lo hay |
| 15 | Tolerancia con la que se comparan dos importes antes de cantar desviación |
| 16 | Una desviación NO tumba la importación: importa y avisa |
| 17 | El aviso trae cuenta, fecha, los dos números y la diferencia |
| 18 | El estado de conciliación se ve en `/api/accounts` |
| 19 | Las 4 cuentas y los ~1.520 movimientos ya dentro quedan bien sin volver a Drive |

**2. El bloque 🔴 de `decisions.md` se va a 8, y el máximo son 6.** Este es el
síntoma más duro, porque no depende de cómo redacte yo: las decisiones son las
que el humano delegó, y son estas ocho:

1. cómo se distingue «anclada» de «vale 0» *(marcada por él)*
2. si se guarda el saldo despejado o el ancla como hecho *(marcada por él)*
3. de dónde saca su ancla Bankinter
4. cómo se rellenan los datos ya existentes
5. si se guarda el ancla en la columna que ya existe o en una nueva
6. con qué tolerancia se canta una desviación
7. dónde aparece el aviso: import, `/api/accounts`, o los dos
8. qué añade exactamente `/api/accounts` al contrato que lee el frontend

Ocho puntos en 🔴 significa, por la propia plantilla, que se están mezclando
decisiones de dos cosas distintas. Y de hecho lo están: **el saldo** y **el
testigo del saldo**.

## El corte que propongo

**F31 `real-account-balance` — contestar «¿cuánto tengo?».** El ancla (modelo,
captura al importar, no reescritura, el 0 como saldo real), el saldo por línea
de Openbank con su reversión documental, el cálculo desde el ancla como
ciudadano de primera con la precedencia intacta y los movimientos posteriores al
archivo, el contrato de `/api/accounts` y el relleno de lo que ya está dentro.
→ 11-12 requirements, 4 puntos en 🔴 (los dos que él marcó, más Bankinter y el
relleno).

**F32 `balance-reconciliation` — el testigo que avisa si algo no cuadra.** Las
dos modalidades de conciliación, la tolerancia, que la desviación no tumbe la
importación, y dónde se ve el aviso.
→ 6-7 requirements, 2 puntos en 🔴 (tolerancia y dónde se ve el aviso).

**La frontera, en una línea:** F31 **produce** el número; F32 lo **vigila**.
Todo lo que sirve para que la cuenta diga un saldo real va a F31; todo lo que
solo sirve para detectar que ese saldo no cuadra va a F32.

**Por qué esa frontera y no otra:**

- **F32 depende de F31, y no al revés.** Conciliar contra el ancla necesita el
  ancla, y conciliar Openbank línea a línea necesita su `balanceAfter`
  guardado. Al revés no hay dependencia: el saldo real funciona entero sin el
  testigo.
- **Cortada así, F31 ya contesta la pregunta del `por_que`.** Las cuatro cuentas
  dejan de arrancar de cero en la primera feature. El humano no espera a dos
  features para ver el valor.
- **El riesgo de aplazar F32 está medido, no supuesto.** El handoff dice que la
  conciliación ya se probó a mano contra los datos reales el 2026-08-25 y salió
  limpia en las dos modalidades: Bankinter sin una sola línea desviada, y dos
  archivos independientes de Openbank anclados por separado dando el mismo saldo
  de partida al céntimo. El testigo llega tarde a algo que hoy no está fallando.
- **Ninguna de las dos hereda una incoherencia.** Entre F31 y F32 el sistema
  queda coherente: da un saldo real y todavía no lo vigila. No queda a medias.

**Qué punto de `como_se_que_esta_bien` se va a F32:** exactamente dos, el de
«el calculado se sigue haciendo, pero para comparar» y el de «cuando no
coinciden, la importación me lo dice claramente». Los otros ocho se quedan en
F31.

## Si el humano prefiere no partirla

Es su decisión y se respeta. En ese caso redacto F31 entera, con ~19
requirements y ~8 puntos en 🔴, y la razón queda dicha en voz alta en
`decisions.md` en vez de colada en silencio. El coste esperado es el que ya se
midió en este harness: el spec se vuelve caro de revisar justo donde más
importa, que es la puerta de aprobación.

## Estado

`F31` queda en `blocked` en `feature_list.json` esperando respuesta. No se ha
creado `specs/31-real-account-balance/`: no escribo el spec hasta saber si es uno
o son dos.
