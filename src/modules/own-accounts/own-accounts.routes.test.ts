// Feature 62 `own-accounts`, HTTP layer: the own accounts table and the holder
// name forms (R1, R2, R3, R4).
//
// 🔒 Everything here is invented: account names, texts, numbers and the holder
// «Ana Pérez Gil». Bank names alone are fine (docs/conventions.md §Tests). It
// runs in the throwaway test database.
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../app.js'

describe('/api/own-accounts (F62)', () => {
  let app: FastifyInstance
  const createdIds: number[] = []

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  afterEach(async () => {
    await app.prisma.ownAccount.deleteMany({ where: { id: { in: createdIds } } })
    await app.prisma.accountHolderName.deleteMany({})
    createdIds.length = 0
  })

  afterAll(async () => {
    await app.close()
  })

  async function post(payload: object) {
    const response = await app.inject({ method: 'POST', url: '/api/own-accounts', payload })
    if (response.statusCode === 201) createdIds.push(response.json().id)
    return response
  }

  function patch(id: number, payload: object) {
    return app.inject({ method: 'PATCH', url: `/api/own-accounts/${id}`, payload })
  }

  /** Every column of the two tables, to prove a rejected request wrote nothing. */
  async function tableSnapshot() {
    return {
      accounts: await app.prisma.ownAccount.findMany({ orderBy: { id: 'asc' } }),
      texts: await app.prisma.ownAccountText.findMany({ orderBy: { id: 'asc' } }),
    }
  }

  it('creates an own account with its texts and lists it ordered by bank', async () => {
    const created = await post({
      name: '  Cartera indexada inventada ',
      bank: 'Trade Republic',
      type: 'investment',
      accountNumber: 'ES91 2100 0418 4502 0005 1332',
      openedAt: '2024-03-11',
      texts: ['Cartera Indexada Inventada', 'cartera  indexada inventada', 'Trade Republic'],
    })
    await post({ name: 'Monedero inventado', bank: 'Bankinter', type: 'checking' })
    await post({ name: 'Hucha inventada', bank: 'Bankinter', type: 'savings', closedAt: null })

    expect(created.statusCode).toBe(201)
    const body = created.json()
    expect(body).toMatchObject({
      name: 'Cartera indexada inventada',
      bank: 'Trade Republic',
      type: 'investment',
      accountNumber: 'ES91 2100 0418 4502 0005 1332',
      openedAt: '2024-03-11',
      closedAt: null,
      // The repeated text (equal once normalized) is kept once, as first typed.
      texts: ['Cartera Indexada Inventada', 'Trade Republic'],
    })
    expect(Object.keys(body).sort()).toEqual(
      [
        'id',
        'name',
        'bank',
        'accountNumber',
        'type',
        'openedAt',
        'closedAt',
        'texts',
        'createdAt',
        'updatedAt',
      ].sort(),
    )

    const list = await app.inject({ method: 'GET', url: '/api/own-accounts' })
    expect(list.statusCode).toBe(200)
    const mine = list
      .json()
      .ownAccounts.filter((account: { id: number }) => createdIds.includes(account.id))
    expect(
      mine.map((account: { bank: string; name: string }) => [account.bank, account.name]),
    ).toEqual([
      ['Bankinter', 'Hucha inventada'],
      ['Bankinter', 'Monedero inventado'],
      ['Trade Republic', 'Cartera indexada inventada'],
    ])
    expect(mine[2]).toEqual(body)
  })

  it('updates only the fields sent and replaces the texts', async () => {
    const created = (
      await post({
        name: 'Hucha inventada',
        bank: 'ING',
        type: 'savings',
        accountNumber: 'NUM-INVENTADO-0815',
        openedAt: '2022-06-01',
        texts: ['Hucha Naranja Inventada', 'Traspaso hucha inventada'],
      })
    ).json()

    const renamed = await patch(created.id, { name: 'Hucha renombrada', closedAt: '2025-12-31' })
    expect(renamed.statusCode).toBe(200)
    expect(renamed.json()).toMatchObject({
      id: created.id,
      name: 'Hucha renombrada',
      bank: 'ING',
      type: 'savings',
      accountNumber: 'NUM-INVENTADO-0815',
      openedAt: '2022-06-01',
      closedAt: '2025-12-31',
      texts: ['Hucha Naranja Inventada', 'Traspaso hucha inventada'],
    })

    const retexted = await patch(created.id, { texts: ['Ahorro Mandarina Inventado'] })
    expect(retexted.statusCode).toBe(200)
    expect(retexted.json()).toMatchObject({
      name: 'Hucha renombrada',
      closedAt: '2025-12-31',
      texts: ['Ahorro Mandarina Inventado'],
    })
    expect(await app.prisma.ownAccountText.count({ where: { ownAccountId: created.id } })).toBe(1)

    const cleared = await patch(created.id, { accountNumber: null, openedAt: null })
    expect(cleared.json()).toMatchObject({ accountNumber: null, openedAt: null })

    const listed = (await app.inject({ method: 'GET', url: '/api/own-accounts' }))
      .json()
      .ownAccounts.find((account: { id: number }) => account.id === created.id)
    expect(listed).toEqual(cleared.json())

    const before = await tableSnapshot()
    const missing = await patch(created.id + 100000, { name: 'No existe' })
    expect(missing.statusCode).toBe(404)
    expect(missing.json().code).toBe('NOT_FOUND')
    expect(await tableSnapshot()).toEqual(before)
  })

  it('rejects an invalid own account without writing', async () => {
    const existing = (
      await post({
        name: 'Monedero inventado',
        bank: 'N26',
        type: 'checking',
        openedAt: '2023-02-14',
        texts: ['Monedero Azul Inventado'],
      })
    ).json()
    const valid = { name: 'Cuenta valida inventada', bank: 'N26', type: 'checking' }

    // [condition, POST body, PATCH body]: each condition of R3 through both routes.
    const invalidCases: Array<[string, object, object]> = [
      ['empty name', { ...valid, name: '' }, { name: '' }],
      ['blank name', { ...valid, name: '   ' }, { name: '   ' }],
      ['empty bank', { ...valid, bank: '' }, { bank: '' }],
      ['blank bank', { ...valid, bank: '  ' }, { bank: '  ' }],
      ['type outside the list', { ...valid, type: 'pension' }, { type: 'pension' }],
      ['openedAt not YYYY-MM-DD', { ...valid, openedAt: '14/02/2023' }, { openedAt: '14/02/2023' }],
      ['closedAt not YYYY-MM-DD', { ...valid, closedAt: '2023-2-14' }, { closedAt: '2023-2-14' }],
      [
        'closedAt before openedAt',
        { ...valid, openedAt: '2023-02-14', closedAt: '2023-02-13' },
        { openedAt: '2023-02-14', closedAt: '2023-02-13' },
      ],
      [
        'a text under 3 characters normalized',
        { ...valid, texts: ['Valido inventado', 'n.º'] },
        { texts: ['Valido inventado', 'n.º'] },
      ],
      ['an unknown property', { ...valid, balance: '10.00' }, { balance: '10.00' }],
    ]

    const before = await tableSnapshot()

    for (const [label, postBody, patchBody] of invalidCases) {
      const created = await post(postBody)
      expect(created.statusCode, `POST ${label}`).toBe(400)
      expect(created.json().code, `POST ${label}`).toBe('VALIDATION_ERROR')

      const changed = await patch(existing.id, patchBody)
      expect(changed.statusCode, `PATCH ${label}`).toBe(400)
      expect(changed.json().code, `PATCH ${label}`).toBe('VALIDATION_ERROR')
    }

    // closedAt before the openedAt already stored, sent alone.
    const alone = await patch(existing.id, { closedAt: '2023-02-01' })
    expect(alone.statusCode).toBe(400)
    // An empty body changes nothing, so it is a 400 too.
    expect((await patch(existing.id, {})).statusCode).toBe(400)

    expect(await tableSnapshot()).toEqual(before)
  })

  it('replaces and returns the holder name forms', async () => {
    const first = await app.inject({
      method: 'PUT',
      url: '/api/own-accounts/holder-names',
      payload: { names: ['Ana Pérez Gil', 'PEREZ GIL ANA'] },
    })
    expect(first.statusCode).toBe(200)

    const second = await app.inject({
      method: 'PUT',
      url: '/api/own-accounts/holder-names',
      payload: { names: ['Ana Perez G', 'Ana_Perez_Gil', 'ANA PÉREZ GIL'] },
    })
    expect(second.statusCode).toBe(200)
    // The repeated form (equal once normalized) is kept once; alphabetical order.
    expect(second.json()).toEqual({ names: ['Ana Perez G', 'Ana_Perez_Gil'] })

    const read = await app.inject({ method: 'GET', url: '/api/own-accounts/holder-names' })
    expect(read.statusCode).toBe(200)
    expect(read.json()).toEqual({ names: ['Ana Perez G', 'Ana_Perez_Gil'] })

    const tooShort = await app.inject({
      method: 'PUT',
      url: '/api/own-accounts/holder-names',
      payload: { names: ['Ana Pérez Gil', 'PG'] },
    })
    expect(tooShort.statusCode).toBe(400)
    expect(tooShort.json().code).toBe('VALIDATION_ERROR')
    expect(
      (await app.inject({ method: 'GET', url: '/api/own-accounts/holder-names' })).json(),
    ).toEqual({ names: ['Ana Perez G', 'Ana_Perez_Gil'] })
  })
})
