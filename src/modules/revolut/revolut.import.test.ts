// End-to-end of feature 46: the `.csv` of this bank stops being reported as
// «skipped» and its movements reach the database through the REAL registry of
// `src/app.ts` and the shared importer -- not through a double.
//
// 🔒 Nothing here is real (ADR-017): the rows come from the synthetic fixture and
// the IBANs from `syntheticIban()`. The files reach the importer from a Drive
// double held in memory, and the suite runs against a throwaway database
// (ADR-027), never the owner's.
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { bankParsers, buildApp, productParsers } from '../../app.js'
import { driveWithPendingFiles } from '../../lib/drive.fixture.js'
import { syntheticIban } from '../../lib/iban.fixture.js'
import { importPending } from '../import/import.service.js'
import type { AttemptedFileReport, ImportRunResult } from '../import/import.types.js'
import { buildRevolutCsv, revolutRow } from './revolut.fixture.js'

const bank = 'revolut'

let app: FastifyInstance

/** Imports ONE pending file of this bank's 2025 folder, as `POST /api/import` does. */
function run(name: string, content: Buffer): Promise<ImportRunResult> {
  return importPending({
    client: driveWithPendingFiles(bank, '2025', [{ name, content }]).client,
    prisma: app.prisma,
    rootFolderId: 'root',
    parsers: bankParsers,
    productParsers,
  })
}

function onlyFile(result: ImportRunResult): AttemptedFileReport {
  expect(result.files).toHaveLength(1)
  const file = result.files[0]
  expect(file.status).not.toBe('skipped')
  return file as AttemptedFileReport
}

beforeAll(async () => {
  app = buildApp()
  await app.ready()
})

afterEach(async () => {
  const accounts = await app.prisma.account.findMany({
    where: { bank: { equals: bank, mode: 'insensitive' } },
  })
  const ids = accounts.map((account) => account.id)
  // Feature 48: the warnings an import now stores are deleted FIRST, both
  // because a descuadre holds a foreign key to the account and because a
  // leftover row would turn up in the listing of another test.
  await app.prisma.importBalanceMismatch.deleteMany({ where: { accountId: { in: ids } } })
  await app.prisma.importUnparsedRow.deleteMany({
    where: { bank: { equals: bank, mode: 'insensitive' } },
  })
  await app.prisma.movement.deleteMany({ where: { accountId: { in: ids } } })
  await app.prisma.account.deleteMany({ where: { id: { in: ids } } })
})

afterAll(async () => {
  await app.close()
})

describe('the statement of Revolut entering the database (feature 46)', () => {
  it('imports the movements instead of reporting the file as skipped (C11)', async () => {
    const iban = syntheticIban()
    const result = await run('extracto.csv', buildRevolutCsv({ preamble: [`iban;${iban}`] }))
    const file = onlyFile(result)

    expect(result.skippedCount).toBe(0)
    expect(file).toMatchObject({
      status: 'imported',
      imported: 6,
      duplicates: 0,
      unparsedCount: 3,
      balanceMismatches: [],
    })
    const account = await app.prisma.account.findUniqueOrThrow({ where: { iban } })
    expect(account.bank).toBe(bank)
  })

  it('stores each movement with its dates, description, amount, type and balance (C3, C5, C7)', async () => {
    const iban = syntheticIban()
    await run('extracto.csv', buildRevolutCsv({ preamble: [`iban;${iban}`] }))

    const stored = await app.prisma.movement.findMany({
      where: { account: { iban } },
      orderBy: [{ bookingDate: 'asc' }, { daySequence: 'asc' }],
    })
    expect(
      stored.map((movement) => [
        movement.bookingDate.toISOString().slice(0, 10),
        movement.valueDate.toISOString().slice(0, 10),
        movement.daySequence,
        movement.description,
        movement.amount.toFixed(2),
        movement.type,
        movement.balanceAfter?.toFixed(2) ?? null,
      ]),
    ).toEqual([
      // The database keeps the amount WITHOUT sign and the direction in `type`
      // (docs/data-model.md): the sign of the file is what decided the type.
      ['2026-07-01', '2026-07-01', 1, 'Cafeteria Ficticia', '3.40', 'expense', '96.60'],
      ['2026-07-01', '2026-06-30', 2, 'Tienda Inventada, S.L.', '12.50', 'expense', '84.10'],
      [
        '2026-07-01',
        '2026-07-01',
        3,
        'Transferencia Inventada Recibida',
        '1000.00',
        'income',
        '1084.10',
      ],
      ['2026-07-02', '2026-07-02', 1, 'Ajuste A Cero', '0.00', 'neutral', '1084.10'],
      ['2026-07-02', '2026-07-02', 2, 'Cambio Inventado', '10.00', 'expense', '1074.10'],
      ['2026-07-03', '2026-07-03', 1, 'Abono "Extra" Inventado', '200.00', 'income', '1274.10'],
    ])
  })

  it('stores no movement for the DEVUELTO nor the PENDIENTE row (C4)', async () => {
    const iban = syntheticIban()
    const file = onlyFile(
      await run('extracto.csv', buildRevolutCsv({ preamble: [`iban;${iban}`] })),
    )

    const descriptions = (await app.prisma.movement.findMany({ where: { account: { iban } } })).map(
      (movement) => movement.description,
    )
    expect(descriptions).not.toContain('Compra Devuelta Inventada')
    expect(descriptions).not.toContain('Pago Pendiente Inventado')
    expect(file.unparsedRows).toContainEqual({
      row: 9,
      reason: "estado no importable ('PENDIENTE'): solo entra COMPLETADO",
    })
  })

  it('anchors the account with the balance of the most recent line (C5)', async () => {
    const iban = syntheticIban()
    const file = onlyFile(
      await run('extracto.csv', buildRevolutCsv({ preamble: [`iban;${iban}`] })),
    )

    expect(file.anchored).toBe(true)
    const account = await app.prisma.account.findUniqueOrThrow({ where: { iban } })
    expect(account.balanceAnchor?.toFixed(2)).toBe('1274.10')
    expect(account.balanceAnchorDate?.toISOString().slice(0, 10)).toBe('2026-07-03')
    expect(account.balanceAnchorDaySequence).toBe(1)
  })

  it('without the iban line, fails with MISSING_ACCOUNT_DATA when the bank has no account (C8)', async () => {
    const file = onlyFile(await run('sin-iban.csv', buildRevolutCsv()))

    expect(file.status).toBe('failed')
    expect(file.error?.code).toBe('MISSING_ACCOUNT_DATA')
  })

  it('without the iban line, uses the single account of the bank once it exists (C8)', async () => {
    const iban = syntheticIban()
    await run('primero.csv', buildRevolutCsv({ preamble: [`iban;${iban}`] }))
    const second = buildRevolutCsv({
      rows: [
        revolutRow({
          startedAt: '2026-07-04 10:00:00',
          completedAt: '2026-07-04 10:00:01',
          description: 'Segundo Archivo Inventado',
          amount: '-4.10',
          balance: '1270.00',
        }),
      ],
    })

    const file = onlyFile(await run('segundo.csv', second))

    expect(file).toMatchObject({ status: 'imported', imported: 1 })
    const stored = await app.prisma.movement.findFirstOrThrow({
      where: { description: 'Segundo Archivo Inventado' },
      include: { account: true },
    })
    expect(stored.account.iban).toBe(iban)
  })
})
