# Plantilla de Intención de Feature

> **Esto lo escribes TÚ (el humano), antes de que el agente toque nada.**
>
> Es el punto de partida de toda feature. Aquí describes QUÉ quieres y POR QUÉ,
> en tu propio idioma, sin jerga técnica y sin decidir el cómo. El agente
> (leader / spec-author) parte de esta intención para producir lo técnico
> (`acceptance`, requirements, diseño), pero NO puede inventarse el QUÉ: su
> trabajo es traducir tu intención, no sustituirla.
>
> Regla de oro asociada: **no apruebas lo que no entiendes.** Como la intención
> la escribiste tú, en la puerta de aprobación puedes contrastar lo técnico
> contra tus propias palabras, en vez de dar cosas por buenas.

---

## Cómo se usa

1. Copias la plantilla de abajo en el campo `intent` de la feature dentro de
   `feature_list.json` (o la redactas aquí y luego la pegas).
2. Rellenas los cinco apartados. Ninguno es opcional; si uno te sale vacío,
   probablemente la feature todavía está difusa y aún no está lista para pedirla.
3. El leader deriva el `acceptance` técnico DE tu intención, con trazabilidad
   (cada criterio técnico apunta a una frase tuya) y procedencia (lo que el
   agente añade de su cosecha va marcado como tal).
4. En la puerta de aprobación humana revisas que:
   - cada cosa técnica sale de algo que tú pediste, y
   - lo que el agente marcó como decisión propia te parece bien.

## Los cinco campos

- **Qué quiero que pase** — el comportamiento observable, NO cómo se hace por
  dentro. Descríbelo como lo verías funcionando.
- **Por qué lo quiero** — el problema que resuelve o la molestia que quita.
  Ayuda al agente a no malinterpretar el "qué".
- **Cómo sabré que está bien** — situaciones concretas del tipo
  "cuando pasa X, el sistema hace Y (algo que yo vería)". Recorre los casos
  uno a uno: aquí es donde saltan los huecos que en caliente no se te ocurren
  (el caso raro, el error, el vacío).
- **Qué NO quiero / límites** — lo que queda fuera de scope y lo que no se
  debe tocar. Acota para que el agente no se expanda de más.
- **Lo que NO sé y delego en el agente** — dudas técnicas que no puedes
  responder. El agente las decide PERO te las marca y te las explica en el
  spec, no las rellena en silencio. Este campo es el que te da tranquilidad:
  convierte "el agente supuso algo por mí sin que yo lo sepa" en "el agente
  decidió algo y me lo enseñó para que yo lo apruebe".

---

## Plantilla (copiar y rellenar)

```
## Intención: <nombre corto en mis palabras>

### Qué quiero que pase
<comportamiento observable, no implementación>

### Por qué lo quiero
<qué problema resuelve o qué molestia quita>

### Cómo sabré que está bien
- Cuando <situación>, el sistema debe <resultado que yo vería>
- Cuando <situación>, el sistema debe <resultado que yo vería>
- Cuando <caso raro / vacío / error>, el sistema debe <resultado>

### Qué NO quiero / límites
- <lo que queda fuera>
- <lo que no se debe tocar>

### Lo que NO sé y delego en el agente
- <duda técnica que no puedo responder; el agente decide y me lo marca>
```

---

## Ejemplo real (referencia)

Esta es una intención bien escrita para una feature de login con elección de
empresa. Fíjate en cómo el último apartado saca a la luz un caso (el usuario
cierra el selector sin elegir) que de otro modo el implementer habría decidido
en silencio.

```
## Intención: elegir empresa al hacer login si el usuario tiene varias

### Qué quiero que pase
Cuando alguien inicia sesión, normalmente entra directo. Pero si sus
credenciales valen para más de una empresa, antes de entrar quiero que
elija en cuál quiere trabajar. Esa empresa elegida acompaña al usuario
durante toda la sesión.

### Por qué lo quiero
Hay usuarios que trabajan en varias empresas con el mismo login. Si no
les preguntamos, entrarían en una empresa cualquiera y verían datos que
no les tocan.

### Cómo sabré que está bien
- Cuando un usuario de UNA sola empresa hace login, entra directo, sin
  ver ningún selector.
- Cuando un usuario de VARIAS empresas hace login, ve un selector y no
  entra hasta que elige una.
- Después de entrar, la app "sabe" en qué empresa estoy (se puede leer
  del store: usuario + rol + empresa).
- Recuperar y restablecer contraseña siguen funcionando igual que antes.

### Qué NO quiero / límites
- No rediseñar la pantalla de login entera, solo añadir el paso del
  selector cuando toque.
- No tocar cómo funciona el login de una sola empresa.

### Lo que NO sé y delego en el agente
- Cómo me dice el backend que hay varias empresas (¿una lista?, ¿un
  flag?). Que el agente lo mire en el contrato del backend y me lo confirme.
- Qué pasa si el usuario ve el selector y lo cierra sin elegir. No lo he
  pensado; que el agente proponga qué hacer y me lo marque.
```
