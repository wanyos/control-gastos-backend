// One-shot converter: a folder of Bankinter monthly statement PDFs -> a single
// .xlsx with the exact shape src/modules/bankinter/bankinter.parser.ts already
// reads, so the historical months enter through the normal Drive import path
// and no PDF parser is ever added to the app.
//
// It lives outside src/ on purpose: it is NOT part of the app. Run it once:
//   node scripts/bankinter-pdf-a-xlsx.mjs --pdfs <carpeta> --iban ES... --salida <archivo.xlsx>
//
// Nothing here guesses. The `Cargos (-)` / `Abonos (+)` columns are lost in text
// extraction, so the sign of every movement is DERIVED from the running balance
// (saldo_n - saldo_n-1) and then cross-checked against the printed amount. A row
// whose two numbers disagree, a line inside the table that cannot be read, or a
// month whose opening balance does not continue the previous one, all STOP the
// conversion instead of writing a file that looks fine.
import { readdir, readFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

import ExcelJS from 'exceljs'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'

// ---------------------------------------------------------------- argumentos

function readArgs(argv) {
  const args = { forzar: false }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    if (flag === '--forzar') {
      args.forzar = true
      continue
    }
    const value = argv[i + 1]
    if (flag === '--pdfs' || flag === '--iban' || flag === '--salida' || flag === '--hasta') {
      args[flag.slice(2)] = value
      i++
    }
  }
  return args
}

const args = readArgs(process.argv.slice(2))

if (!args.pdfs || !args.iban || !args.salida) {
  console.error(
    'Uso: node scripts/bankinter-pdf-a-xlsx.mjs --pdfs <carpeta> --iban <ES...> --salida <archivo.xlsx>\n' +
      '  --pdfs    carpeta con los extractos mensuales en PDF (se leen todos)\n' +
      '  --iban    el IBAN de la cuenta, EXACTAMENTE el que ya tiene dada de alta la app\n' +
      '  --salida  el .xlsx a escribir\n' +
      '  --forzar  escribe el .xlsx aunque alguna comprobación haya fallado (no lo uses a ciegas)',
  )
  process.exit(1)
}

// ------------------------------------------------------------------ utilidades

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/** '1.234,56' -> 123456 (céntimos enteros: nada de aritmética en coma flotante). */
function aCentimos(text) {
  const normalized = text.replace(/\./g, '').replace(',', '.')
  if (!/^-?\d+\.\d{2}$/.test(normalized)) {
    return null
  }
  return Math.round(Number(normalized) * 100)
}

/** 123456 -> 1234.56, ya como número, que es lo que el parser prefiere leer. */
function aEuros(centimos) {
  return centimos / 100
}

function formatearEuros(centimos) {
  return (centimos / 100).toLocaleString('es-ES', { minimumFractionDigits: 2 })
}

/** '03-01-24' -> '03/01/2024', que es el único formato de fecha que lee el parser. */
function aFechaEspanola(ddmmyy) {
  const [dd, mm, yy] = ddmmyy.split('-')
  return `${dd}/${mm}/20${yy}`
}

/** El dígito de control IBAN español a partir del CCC de 20 dígitos. */
function ibanDesdeCcc(ccc) {
  // 'ES00' al final, con E=14 y S=28, y el resto módulo 97 sobre la cadena entera.
  const payload = `${ccc}142800`
  let remainder = 0
  for (const digit of payload) {
    remainder = (remainder * 10 + Number(digit)) % 97
  }
  const check = String(98 - remainder).padStart(2, '0')
  return `ES${check}${ccc}`
}

// --------------------------------------------------------- extracción del PDF

/**
 * Devuelve las líneas visuales del PDF: los fragmentos de texto agrupados por su
 * coordenada Y y ordenados por X. Se agrupa por Y (y no se usa el orden en que
 * vienen) porque es lo que reconstruye una fila de la tabla tal y como se ve.
 */
async function leerLineas(rutaPdf) {
  const data = new Uint8Array(await readFile(rutaPdf))
  const task = pdfjs.getDocument({ data, useSystemFonts: true })
  const doc = await task.promise
  const lineas = []

  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const content = await page.getTextContent()
    const porY = new Map()

    for (const item of content.items) {
      if (typeof item.str !== 'string' || item.str.trim() === '') {
        continue
      }
      const x = item.transform[4]
      const y = Math.round(item.transform[5])
      // Medio punto de tolerancia: la misma fila puede venir con Y casi iguales.
      const clave = [...porY.keys()].find((k) => Math.abs(k - y) <= 1) ?? y
      const fila = porY.get(clave) ?? []
      fila.push({ x, str: item.str })
      porY.set(clave, fila)
    }

    const ordenadas = [...porY.entries()].sort((a, b) => b[0] - a[0])
    for (const [, fila] of ordenadas) {
      const texto = fila
        .sort((a, b) => a.x - b.x)
        .map((f) => f.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (texto !== '') {
        lineas.push(texto)
      }
    }
    page.cleanup()
  }

  await task.destroy()
  return lineas
}

// ------------------------------------------------------- lectura de un extracto

const RE_PERIODO = /\(\s*([a-zá-ú]+)\s+de\s+(\d{4})\s*\)/i
const RE_SECCION_CUENTA = /Movimientos de su Cuenta\s+N.?\s*:?\s*([\d.]+)\s+en\s+(\w+)/i
const RE_OTRA_SECCION = /Movimientos de su Tarjeta|CR[ÉE]DITOS\/PR[ÉE]STAMOS/i
const RE_SALDO_ANTERIOR = /SALDO ANTERIOR EN \w+\s+(-?[\d.]+,\d{2})/i
const RE_SALDO_FINAL = /SALDO FINAL EN \w+\s+(-?[\d.]+,\d{2})/i
/**
 * Mobiliario de página que puede caer DENTRO de la tabla cuando los movimientos
 * llegan al borde inferior: la marca de control del margen izquierdo, su código
 * numérico, la cabecera y el pie impresos. No son movimientos y no se reportan
 * como líneas ilegibles; todo lo demás sí.
 */
const RE_ADORNO = /^(?:«.*¬|\d{7}|Banca Personal|R\.M\. MADRID.*|Página \d+ de\s*\d+)$/

const RE_MOVIMIENTO =
  /^(\d{2}-\d{2}-\d{2})\s+(?:(\S+)\s+)?(\d{2}-\d{2}-\d{2})\s+(.+?)\s+(-?[\d.]+,\d{2})\s+(-?[\d.]+,\d{2})$/

/**
 * Lee UN extracto mensual: su periodo, la cuenta, el saldo de apertura y de
 * cierre que el propio banco imprime, y las líneas de movimiento de la cuenta
 * corriente. La tabla de la tarjeta queda fuera a propósito: son movimientos de
 * OTRA cuenta y su gasto ya entra en la corriente como el cargo de la cuota.
 */
function leerExtracto(archivo, lineas) {
  const problemas = []

  const periodo = lineas.map((l) => l.match(RE_PERIODO)).find(Boolean)
  if (!periodo) {
    problemas.push('no se encuentra el periodo «( mes de aaaa )» en la cabecera')
  }
  const mes = periodo ? MESES.indexOf(periodo[1].toLowerCase()) + 1 : 0
  if (periodo && mes === 0) {
    problemas.push(`mes no reconocido: '${periodo[1]}'`)
  }

  let cuenta = null
  let dentro = false
  let saldoAnterior = null
  let saldoFinal = null
  const movimientos = []

  for (const linea of lineas) {
    const cabecera = linea.match(RE_SECCION_CUENTA)
    if (cabecera) {
      const numero = cabecera[1].replace(/\./g, '')
      if (cuenta !== null && cuenta !== numero) {
        problemas.push(
          `el extracto trae movimientos de dos cuentas (${cuenta} y ${numero}): ` +
            'este script convierte una sola',
        )
      }
      cuenta = numero
      dentro = true
      continue
    }
    if (!dentro) {
      continue
    }
    if (RE_OTRA_SECCION.test(linea)) {
      dentro = false
      continue
    }

    const anterior = linea.match(RE_SALDO_ANTERIOR)
    if (anterior) {
      saldoAnterior = aCentimos(anterior[1])
      continue
    }
    const final = linea.match(RE_SALDO_FINAL)
    if (final) {
      saldoFinal = aCentimos(final[1])
      dentro = false
      continue
    }

    const movimiento = linea.match(RE_MOVIMIENTO)
    if (movimiento) {
      const importe = aCentimos(movimiento[5])
      const saldo = aCentimos(movimiento[6])
      if (importe === null || saldo === null) {
        problemas.push(`importe o saldo ilegibles en: «${linea}»`)
        continue
      }
      movimientos.push({
        bookingDate: movimiento[1],
        valueDate: movimiento[3],
        description: movimiento[4].trim(),
        importeSinSigno: importe,
        saldo,
        linea,
      })
      continue
    }

    // Dentro de la tabla y sin poder leerla: se reporta, nunca se descarta en
    // silencio. Las líneas de cabecera de la propia tabla no son un problema.
    if (/^Fecha\b/i.test(linea) || /^DEP[ÓO]SITOS/i.test(linea) || RE_ADORNO.test(linea)) {
      continue
    }
    problemas.push(`línea dentro de la tabla que no se ha podido interpretar: «${linea}»`)
  }

  if (cuenta === null) {
    problemas.push('no se encuentra la sección «Movimientos de su Cuenta Nº: …»')
  }
  if (saldoAnterior === null) {
    problemas.push('no se encuentra el «SALDO ANTERIOR», sin él no se puede deducir ningún signo')
  }
  if (saldoFinal === null) {
    problemas.push('no se encuentra el «SALDO FINAL», sin él no hay cuadre del mes')
  }

  return {
    archivo,
    anio: periodo ? Number(periodo[2]) : 0,
    mes,
    cuenta,
    saldoAnterior,
    saldoFinal,
    movimientos,
    problemas,
  }
}

/**
 * Da signo a cada movimiento a partir del saldo corrido y lo comprueba contra el
 * importe impreso. Es la pieza que sustituye a las dos columnas que la
 * extracción de texto pierde, y de paso verifica cada línea.
 */
function firmarYCuadrar(extracto) {
  const problemas = []
  const firmados = []
  let previo = extracto.saldoAnterior

  for (const movimiento of extracto.movimientos) {
    const delta = movimiento.saldo - previo
    if (Math.abs(delta) !== movimiento.importeSinSigno) {
      problemas.push(
        `el importe impreso (${formatearEuros(movimiento.importeSinSigno)}) no cuadra con el ` +
          `salto del saldo (${formatearEuros(Math.abs(delta))}) en: «${movimiento.linea}»`,
      )
    }
    firmados.push({ ...movimiento, importe: delta })
    previo = movimiento.saldo
  }

  if (extracto.saldoFinal !== null && previo !== extracto.saldoFinal) {
    problemas.push(
      `el saldo tras el último movimiento (${formatearEuros(previo)}) no es el «SALDO FINAL» ` +
        `del extracto (${formatearEuros(extracto.saldoFinal)}): falta o sobra alguna línea`,
    )
  }

  return { firmados, problemas }
}

// ------------------------------------------------------------------ escritura

async function escribirXlsx(ruta, iban, filas) {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Movimientos')

  // El preámbulo del que el parser saca el IBAN (bankinter.parser.ts:127).
  worksheet.addRow([`MOVIMIENTOS DE LA CUENTA ${iban}`])
  worksheet.addRow([])
  worksheet.addRow(['Fecha contable', 'Fecha valor', 'Descripción', 'Importe', 'Saldo', 'Divisa'])

  for (const fila of filas) {
    worksheet.addRow([
      aFechaEspanola(fila.bookingDate),
      aFechaEspanola(fila.valueDate),
      fila.description,
      aEuros(fila.importe),
      aEuros(fila.saldo),
      'EUR',
    ])
  }

  await workbook.xlsx.writeFile(ruta)
}

// ------------------------------------------------------------------------ main

const carpeta = resolve(args.pdfs)
const nombres = (await readdir(carpeta)).filter((n) => n.toLowerCase().endsWith('.pdf')).sort()

if (nombres.length === 0) {
  console.error(`No hay ningún .pdf en ${carpeta}`)
  process.exit(1)
}

console.log(`Leyendo ${nombres.length} extractos de ${carpeta}\n`)

const extractos = []
for (const nombre of nombres) {
  const lineas = await leerLineas(join(carpeta, nombre))
  extractos.push(leerExtracto(basename(nombre), lineas))
}

// Cronológico: el orden del nombre del archivo no es de fiar, el periodo sí.
extractos.sort((a, b) => a.anio - b.anio || a.mes - b.mes)

// El corte con lo que ya está importado por la vía normal. Se dice en voz alta
// qué meses se quedan fuera: una poda silenciosa se lee como cobertura completa.
if (args.hasta) {
  const limite = args.hasta.match(/^(\d{4})-(\d{2})$/)
  if (!limite) {
    console.error(`--hasta tiene que ser AAAA-MM, y has pasado '${args.hasta}'`)
    process.exit(1)
  }
  const tope = Number(limite[1]) * 12 + Number(limite[2])
  const dentro = extractos.filter((e) => e.anio * 12 + e.mes <= tope)
  const fuera = extractos.filter((e) => e.anio * 12 + e.mes > tope)
  if (fuera.length > 0) {
    console.log(`Fuera por --hasta ${args.hasta}: ${fuera.map((e) => e.archivo).join(', ')}
`)
  }
  extractos.length = 0
  extractos.push(...dentro)
}

const problemasGlobales = []

// Una sola cuenta en todo el lote, y su IBAN tiene que ser el que nos han dado:
// un IBAN distinto crearía una SEGUNDA cuenta y partiría el histórico en dos.
const cuentas = [...new Set(extractos.map((e) => e.cuenta).filter(Boolean))]
if (cuentas.length > 1) {
  problemasGlobales.push(
    `los PDFs son de ${cuentas.length} cuentas distintas: ${cuentas.join(', ')}`,
  )
} else if (cuentas.length === 1) {
  const calculado = ibanDesdeCcc(cuentas[0])
  const recibido = args.iban.replace(/\s/g, '').toUpperCase()
  if (calculado !== recibido) {
    problemasGlobales.push(
      `el IBAN que sale del número de cuenta del PDF es ${calculado} y tú has pasado ${recibido}`,
    )
  }
}

// Meses repetidos y meses que faltan: el saldo final de un mes tiene que ser el
// saldo anterior del siguiente. Es lo que delata un mes sin descargar.
const vistos = new Set()
for (let i = 0; i < extractos.length; i++) {
  const actual = extractos[i]
  const clave = `${actual.anio}-${actual.mes}`
  if (vistos.has(clave)) {
    problemasGlobales.push(
      `hay dos extractos del mismo mes (${clave}), uno de ellos es ${actual.archivo}`,
    )
  }
  vistos.add(clave)

  const siguiente = extractos[i + 1]
  if (!siguiente || actual.saldoFinal === null || siguiente.saldoAnterior === null) {
    continue
  }
  if (actual.saldoFinal !== siguiente.saldoAnterior) {
    problemasGlobales.push(
      `entre ${actual.archivo} y ${siguiente.archivo} el saldo salta de ` +
        `${formatearEuros(actual.saldoFinal)} a ${formatearEuros(siguiente.saldoAnterior)}: ` +
        'falta algún mes por descargar, o uno de los dos está incompleto',
    )
  }
}

// ---------------------------------------------------------------- el informe

const cronologicos = []
let totalProblemas = problemasGlobales.length

for (const extracto of extractos) {
  const { firmados, problemas } = firmarYCuadrar(extracto)
  const todos = [...extracto.problemas, ...problemas]
  totalProblemas += todos.length
  cronologicos.push(...firmados)

  const etiqueta = `${String(extracto.mes).padStart(2, '0')}/${extracto.anio}`
  const estado = todos.length === 0 ? 'OK ' : '✗  '
  console.log(
    `${estado} ${etiqueta}  ${String(firmados.length).padStart(3)} mov.  ` +
      `${formatearEuros(extracto.saldoAnterior ?? 0)} → ${formatearEuros(extracto.saldoFinal ?? 0)}  ` +
      `(${extracto.archivo})`,
  )
  for (const problema of todos) {
    console.log(`      · ${problema}`)
  }
}

if (problemasGlobales.length > 0) {
  console.log('\nProblemas del conjunto:')
  for (const problema of problemasGlobales) {
    console.log(`  · ${problema}`)
  }
}

console.log(
  `\n${cronologicos.length} movimientos entre ${extractos.length} meses, ${totalProblemas} problemas.`,
)

if (totalProblemas > 0 && !args.forzar) {
  console.error(
    '\nNo se escribe nada. Un fallo aquí es dinero que falta o sobra sin que se note, así que ' +
      'el .xlsx solo sale cuando todo cuadra. Revisa lo de arriba, o repite con --forzar si ' +
      'sabes lo que estás dejando pasar.',
  )
  process.exit(1)
}

// El parser da por hecho que Bankinter exporta de más reciente a más antiguo
// (bankinter.parser.ts:12) y de ahí saca el orden dentro del día: hay que
// entregarle el fichero en ese mismo sentido.
await escribirXlsx(
  resolve(args.salida),
  args.iban.replace(/\s/g, '').toUpperCase(),
  [...cronologicos].reverse(),
)

console.log(`\nEscrito ${resolve(args.salida)}`)
console.log(
  'Súbelo a la carpeta de Drive bankinter/<año en que termina>/ y pásale el importador normal.',
)
