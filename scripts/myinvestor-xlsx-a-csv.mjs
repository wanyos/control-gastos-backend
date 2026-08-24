// One-shot converter: the `.xlsx` MyInvestor lets you download for a whole year
// -> the `.csv` that src/modules/myinvestor/myinvestor.statement.parser.ts
// already reads, so the historical months enter through the normal Drive import
// path and no second MyInvestor parser is ever added to the app.
//
// It lives outside src/ on purpose: it is NOT part of the app. Run it once:
//   node scripts/myinvestor-xlsx-a-csv.mjs --xlsx <archivo.xlsx> --iban ES... --salida <archivo.csv>
//
// Two things the `.xlsx` carries and the `.csv` shape cannot: the running balance
// of each line and the second (duplicated) description column. The balance is not
// thrown away silently -- it is used HERE to verify every line before writing,
// and its loss afterwards is the price of entering by the existing door.
//
// Nothing is guessed. A line whose amount does not match the jump of the running
// balance, a chain that does not end at the balance printed in the header, or an
// IBAN that does not match the account number of the file, all STOP the
// conversion instead of writing a file that looks fine.
import { writeFile } from 'node:fs/promises'

import ExcelJS from 'exceljs'

// ---------------------------------------------------------------- argumentos

function readArgs(argv) {
  const args = { forzar: false }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    if (flag === '--forzar') {
      args.forzar = true
      continue
    }
    if (flag === '--xlsx' || flag === '--iban' || flag === '--salida') {
      args[flag.slice(2)] = argv[i + 1]
      i++
    }
  }
  return args
}

const args = readArgs(process.argv.slice(2))

if (!args.xlsx || !args.iban || !args.salida) {
  console.error(
    'Uso: node scripts/myinvestor-xlsx-a-csv.mjs --xlsx <archivo.xlsx> --iban <ES...> --salida <archivo.csv>\n' +
      '  --xlsx    el export anual de MyInvestor, tal cual lo descarga el banco\n' +
      '  --iban    el IBAN de la cuenta, EXACTAMENTE el que ya tiene dada de alta la app\n' +
      '  --salida  el .csv a escribir\n' +
      '  --forzar  escribe aunque alguna comprobación haya fallado (no lo uses a ciegas)',
  )
  process.exit(1)
}

// ------------------------------------------------------------------ utilidades

/** '1.234,56€' o el número nativo -> 123456 (céntimos: nada de coma flotante). */
function aCentimos(valor) {
  if (typeof valor === 'number') {
    return Number.isFinite(valor) ? Math.round(valor * 100) : null
  }
  const texto = String(valor ?? '')
    .replace(/[€\s]/g, '')
    .trim()
  if (texto === '') {
    return null
  }
  const normalizado = texto.includes(',') ? texto.replace(/\./g, '').replace(',', '.') : texto
  if (!/^-?\d+(\.\d+)?$/.test(normalizado)) {
    return null
  }
  return Math.round(Number(normalizado) * 100)
}

/** 351790 -> '3517,90', que es como escribe los importes el .csv de este banco. */
function aImporteEspanol(centimos) {
  const signo = centimos < 0 ? '-' : ''
  const abs = Math.abs(centimos)
  return `${signo}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`
}

function formatearEuros(centimos) {
  return (centimos / 100).toLocaleString('es-ES', { minimumFractionDigits: 2 })
}

/** La celda de fecha, venga como texto 'dd/mm/aaaa' o como Date nativo. */
function aFecha(valor) {
  if (valor instanceof Date) {
    const dd = String(valor.getUTCDate()).padStart(2, '0')
    const mm = String(valor.getUTCMonth() + 1).padStart(2, '0')
    return `${dd}/${mm}/${valor.getUTCFullYear()}`
  }
  const texto = String(valor ?? '').trim()
  return /^\d{2}\/\d{2}\/\d{4}$/.test(texto) ? texto : null
}

/** Una celda de exceljs a texto plano, deshaciendo el richText de la cabecera. */
function aTexto(valor) {
  if (valor === null || valor === undefined) {
    return ''
  }
  if (typeof valor === 'object' && Array.isArray(valor.richText)) {
    return valor.richText.map((t) => t.text).join('')
  }
  if (valor instanceof Date) {
    return valor.toISOString()
  }
  return String(valor).trim()
}

/** Cabecera normalizada: sin acentos, en minúsculas y con los espacios juntos. */
function normalizar(valor) {
  return aTexto(valor)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

// ------------------------------------------------------------------- lectura

const workbook = new ExcelJS.Workbook()
await workbook.xlsx.readFile(args.xlsx)
const worksheet = workbook.worksheets[0]

if (!worksheet) {
  console.error('El .xlsx no tiene ninguna hoja.')
  process.exit(1)
}

const filas = []
worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
  const celdas = []
  for (let c = 1; c <= worksheet.columnCount; c++) {
    celdas[c] = row.getCell(c).value
  }
  filas.push({ rowNumber, celdas })
})

// La cabecera se busca por el NOMBRE de sus columnas, no por su posición: es lo
// único que sobrevive a que el banco mueva una columna en el próximo export.
const nombreACampo = {
  'fecha operacion': 'bookingDate',
  'fecha de operacion': 'bookingDate',
  'fecha valor': 'valueDate',
  'fecha de valor': 'valueDate',
  movimiento: 'description',
  concepto: 'description',
  importe: 'amount',
  saldo: 'balance',
}

let cabecera = null
for (const fila of filas) {
  const columnas = {}
  for (let c = 1; c < fila.celdas.length; c++) {
    const campo = nombreACampo[normalizar(fila.celdas[c])]
    if (campo && columnas[campo] === undefined) {
      columnas[campo] = c
    }
  }
  if (columnas.bookingDate !== undefined && columnas.amount !== undefined) {
    cabecera = { rowNumber: fila.rowNumber, columnas }
    break
  }
}

if (!cabecera) {
  console.error(
    'No se encuentra la fila de cabecera («Fecha Operación» … «Importe»): esto no parece ' +
      'el export de movimientos de MyInvestor.',
  )
  process.exit(1)
}

// El preámbulo: la etiqueta va en una celda y su valor en la siguiente ocupada.
function valorDeEtiqueta(etiqueta) {
  for (const fila of filas) {
    if (fila.rowNumber >= cabecera.rowNumber) {
      return null
    }
    for (let c = 1; c < fila.celdas.length; c++) {
      if (normalizar(fila.celdas[c]).replace(/:$/, '') !== etiqueta) {
        continue
      }
      for (let siguiente = c + 1; siguiente < fila.celdas.length; siguiente++) {
        const valor = fila.celdas[siguiente]
        if (aTexto(valor) !== '') {
          return valor
        }
      }
    }
  }
  return null
}

const cuentaDelArchivo = aTexto(valorDeEtiqueta('cuenta')).replace(/\D/g, '')
const saldoDeclarado = aCentimos(valorDeEtiqueta('saldo'))

const problemas = []
const ibanPedido = args.iban.replace(/\s/g, '').toUpperCase()

if (cuentaDelArchivo === '') {
  problemas.push('el archivo no trae la línea «CUENTA:», así que no puedo comprobar el IBAN')
} else if (!ibanPedido.endsWith(cuentaDelArchivo)) {
  problemas.push(
    `el número de cuenta del archivo (${cuentaDelArchivo}) no es el final del IBAN que has ` +
      `pasado (${ibanPedido}): o el IBAN no es el de esta cuenta, o el archivo no es de ella`,
  )
}
if (saldoDeclarado === null) {
  problemas.push('el archivo no trae la línea «Saldo:», así que no hay cuadre final')
}

// ------------------------------------------------- movimientos y comprobación

const movimientos = []
let saldoPrevio = null

for (const fila of filas) {
  if (fila.rowNumber <= cabecera.rowNumber) {
    continue
  }
  const { columnas } = cabecera
  const bookingDate = aFecha(fila.celdas[columnas.bookingDate])
  const valueDate = aFecha(fila.celdas[columnas.valueDate])
  const description = aTexto(fila.celdas[columnas.description])
  const importe = aCentimos(fila.celdas[columnas.amount])
  const saldo = columnas.balance === undefined ? null : aCentimos(fila.celdas[columnas.balance])

  if (bookingDate === null && importe === null) {
    // Una fila de relleno del propio Excel, sin fecha ni importe: no es un
    // movimiento a medias, es que ahí no hay nada.
    continue
  }
  if (bookingDate === null || valueDate === null || importe === null) {
    problemas.push(
      `fila ${fila.rowNumber}: fecha u importe ilegibles ` +
        `(operación '${aTexto(fila.celdas[columnas.bookingDate])}', ` +
        `valor '${aTexto(fila.celdas[columnas.valueDate])}', ` +
        `importe '${aTexto(fila.celdas[columnas.amount])}')`,
    )
    continue
  }

  // El saldo corrido es la verificación de cada línea, no un dato que viajará.
  if (saldo !== null) {
    if (saldoPrevio !== null && saldo - saldoPrevio !== importe) {
      problemas.push(
        `fila ${fila.rowNumber}: el importe (${formatearEuros(importe)}) no cuadra con el salto ` +
          `del saldo (${formatearEuros(saldo - saldoPrevio)}) en «${description}»`,
      )
    }
    saldoPrevio = saldo
  }

  movimientos.push({ bookingDate, valueDate, description, importe })
}

if (saldoPrevio !== null && saldoDeclarado !== null && saldoPrevio !== saldoDeclarado) {
  problemas.push(
    `el saldo tras el último movimiento (${formatearEuros(saldoPrevio)}) no es el «Saldo» de la ` +
      `cabecera (${formatearEuros(saldoDeclarado)}): falta o sobra alguna línea`,
  )
}

// ---------------------------------------------------------------- el informe

console.log(`${movimientos.length} movimientos leídos de ${args.xlsx}`)
if (movimientos.length > 0) {
  console.log(
    `rango: ${movimientos[0].bookingDate} → ${movimientos.at(-1).bookingDate}` +
      (saldoDeclarado === null ? '' : `, saldo final ${formatearEuros(saldoDeclarado)}`),
  )
}
for (const problema of problemas) {
  console.log(`  · ${problema}`)
}
console.log(`\n${problemas.length} problemas.`)

if (problemas.length > 0 && !args.forzar) {
  console.error(
    '\nNo se escribe nada. Un fallo aquí es dinero que falta o sobra sin que se note, así que ' +
      'el .csv solo sale cuando todo cuadra. Revisa lo de arriba, o repite con --forzar si ' +
      'sabes lo que estás dejando pasar.',
  )
  process.exit(1)
}

// ------------------------------------------------------------------ escritura

// El parser da por hecho que MyInvestor exporta de más reciente a más antiguo y
// de ahí saca el orden dentro del día (myinvestor.statement.parser.ts:11). El
// .xlsx viene al revés, así que se le entrega dado la vuelta.
// La divisa no viaja en el .xlsx: es una cuenta en euros y su saldo se declara
// en €, así que se escribe EUR, que es lo que traía el .csv del banco.
const lineas = [
  `iban;${ibanPedido};;;`,
  `Saldo;${saldoDeclarado === null ? '' : aImporteEspanol(saldoDeclarado)};;;`,
  'Fecha de operación;Fecha de valor;Concepto;Importe;Divisa',
  ...[...movimientos]
    .reverse()
    .map((m) =>
      [m.bookingDate, m.valueDate, m.description, aImporteEspanol(m.importe), 'EUR'].join(';'),
    ),
]

// BOM + CRLF: exactamente como el .csv que descarga el banco, que es el que el
// parser ya lee (decodifica en UTF-8 estricto y tolera el BOM de cabecera).
await writeFile(args.salida, `﻿${lineas.join('\r\n')}\r\n`, 'utf8')

console.log(`\nEscrito ${args.salida}`)
console.log('Súbelo a la carpeta de Drive myinvestor/2026/ y pásale el importador normal.')
