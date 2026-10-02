# Decisiones — F51 `no-real-data-from-db`

> **Esto es lo único que necesitas leer para aprobar.** Los otros tres archivos
> (`requirements` / `design` / `tasks`) son material del implementer y del reviewer.
> Si algo de aquí no te convence, dilo y se cambia ahí; no hace falta que los abras.

**Qué hace:** el guardián [`src/no-real-data.test.ts`](../../src/no-real-data.test.ts) deja de leer los archivos de `var/` y compara cada archivo versionado contra lo que hay en tu base de datos: importes, textos e IBAN. **No toca** la comprobación de IBAN por su forma, ni las rutas, ni la carpeta `var/`, ni la foto que la suite hace de `var/` antes y después (todo eso es la F52). No hay migración ni cambia la API.

Los números de esta hoja los medí el 2026-10-02 leyendo tu base en solo lectura y sacando solo recuentos.

---

## 🔴 Confirma o corrige (6)

| # | Decisión (mía, salvo que diga lo contrario) | Alternativa si no te gusta |
|---|---|---|
| 1 | **Se compara contra tu base de verdad, no contra tablas con datos inventados.** La lee solo `vitest.global-setup.ts` al arrancar la pasada (ya la abre hoy para hacerle la foto), por una conexión que PostgreSQL abre en solo lectura, y pasa los valores a los tests en memoria. Ningún test abre tu base. | Tablas con datos inventados: no contienen nada tuyo, así que no cazarían ninguna fuga. |
| 2 | **Qué se compara.** Importes: todas las columnas de dinero de movimientos, cuentas, productos, valoraciones, saldos mensuales de la cuenta remunerada y descuadres. Textos: descripción y nota del movimiento, nombre del producto, alias de la cuenta y el texto de tus reglas de categoría. IBAN: el de tus cuentas. **No:** los nombres de categoría ni los nombres de archivo. Y un test nuevo pone la suite roja si una feature añade una columna de dinero o de texto sin decir si se compara. | Comparar también los nombres de categoría: hoy saltarían 75 líneas, todas texto nuestro. |
| 3 | **Los importes se comparan como hoy: con cuatro o más cifras significativas y que no parezcan un año.** Tu ejemplo, 10,00, ya queda fuera. Con tu base de hoy saltan ocho líneas del repositorio; siete son coincidencias (ver 5). | Pedir cinco cifras: hoy no saltaría ninguna, pero dejan de vigilarse 310 de los 1065 importes: casi todo lo de menos de cien euros. |
| 4 | **Lo que está en tus archivos pero no en tu base deja de vigilarse.** De los 724 importes y 909 frases que el guardián saca hoy de `var/`, están en la base 445 y 284. No he mirado uno a uno qué es el resto: parte es ruido de leer el archivo crudo y parte es texto del extracto que el parser no guarda. A cambio la base tiene 620 importes y 52 frases que `var/` no tenía. | Mantener las dos comparaciones hasta la F52: no arregla nada, se pierde igual al borrar `var/`. |
| 5 | **Las líneas que hoy coinciden con tu base se arreglan en esta feature, reescribiéndolas.** Dos importes inventados de dos tests se cambian por otros; cinco líneas de `progress/` son pares de números de línea y una duración; una frase de la hoja de la F20 cambia una palabra. La octava, en [`progress/explorations/prueba-real-importacion-2026-09-12.md`](../../progress/explorations/prueba-real-importacion-2026-09-12.md), **puede ser un importe tuyo de verdad** que `var/` ya no cazaba: la frase se reescribe sin cifras. | Dejarlas y ponerles la marca `no-real-data-ok`: menos cambios, pero la de la prueba real seguiría versionada. |
| 6 | **Las excepciones de hoy se quedan igual:** la carpeta `prisma/migrations/` y la marca `no-real-data-ok` en la línea, solo para importes y frases. Un IBAN de tu base no admite ninguna, salvo los dos IBAN de ejemplo que ya están en la lista. | Quitar la marca y obligar siempre a inventar otro valor: más estricto, y algunas coincidencias no se pueden reescribir. |

## ✅ Ya las cerraste tú (6)

- **El guardián deja de leer `var/`** y funciona con la carpeta borrada.
- **Ningún test escribe en tu base;** tras la suite queda exactamente igual.
- **El mensaje de fallo dice archivo y línea, nunca el dato.**
- **La comprobación de IBAN por su forma no se toca.**
- **Con la base vacía la suite no falla:** la comparación se salta y lo dice.
- **Ni las rutas ni la carpeta `var/` se quitan aquí:** es la F52.

## 🧪 Cómo se comprobará que está hecho

| Tu frase de «cómo sé que está bien» | Se comprueba ejecutando |
|---|---|
| Si un importe, un concepto o un IBAN que está en mi base aparece en un archivo versionado, la suite falla diciendo archivo y línea | Tres tests que meten un importe, un concepto y un IBAN inventados en una base simulada y en un archivo simulado, y esperan el fallo con archivo y línea |
| Un dato inventado que no está en mi base no hace fallar la suite | El test que pone datos inventados que no están en la base simulada y espera que no salte nada |
| Funciona igual con la carpeta `var/` borrada | El test que afirma que el guardián no importa nada con lo que listar una carpeta. Borrar `var/` de verdad no lo hace ningún comando: la borras tú en la F52 |
| Solo lee mi base: después de la suite está igual | El test que intenta escribir por la conexión de lectura y espera el rechazo, y la suite entera, que ya falla si tu base cambia |
| Con la base vacía no falla, el IBAN por su forma sigue y la comparación avisa | El test del aviso con una base simulada vacía, y el test de IBAN por su forma, que sigue igual |

## ⚙️ Técnicas — decididas, no necesitan tu visto bueno (6)

1. **Los motivos de las filas que el parser no pudo leer (F48) se tratan como la F24 trataba los motivos de rechazo guardados en `var/parsed/`:** nuestras frases no saltan, lo que va entre comillas sí.
   ⚠️ *Efecto:* hoy esa tabla tiene 0 filas, así que no está probado con datos tuyos.
2. **Las frases se comparan como hoy:** tres palabras seguidas con dos poco comunes. Un concepto de una o dos palabras sigue sin cazarse.
3. **El aviso de «no tengo con qué comparar» se escribe directo en la salida de la suite.** Comprobado: la nota de un test saltado no se imprime.
4. **Si PostgreSQL no responde, la suite no arranca,** igual que hoy (leído en el código; no lo he ejecutado: habría que parar PostgreSQL).
5. **Se borra del guardián todo lo que solo servía para leer archivos** (lo de la F23 y la F34), con sus tests.
6. **El código de lectura va en un archivo nuevo, `src/lib/test-real-data.ts`.** Lo que lee pesa unos 15 KB y no se escribe en disco.

## 📌 Consecuencias que te tocan a ti (no son código)

- **Lo que no hayas importado a la base no se vigila.** Un banco nuevo o un archivo que aún no has importado no existe para el guardián.
- **La suite puede ponerse roja después de importar, sin que nadie haya tocado el repositorio:** si un importe nuevo tuyo coincide con uno inventado de un test. Se arregla inventando otro valor en la línea que señale.
- **Mira cómo queda la frase de la prueba real del 2026-09-12** (🔴 5): eres quien sabe si esa cifra era tuya.
- **No borres `var/` todavía:** la F52 la sigue necesitando hasta que se cierre.

## ⚠️ Incoherencias conocidas que se heredan

- **El título del ADR-017 seguirá diciendo «comparación contra `var/`»:** un ADR no se reescribe; lleva encima una línea de revisión con lo que cambia.
- **`docs/verification.md` seguirá pidiendo probar un parser con el archivo de `var/drive-read/`**, y el guardián seguirá exigiendo que `var/` esté en `.gitignore`: las dos cosas son de la F52.
