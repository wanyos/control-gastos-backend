// Feature 61 `rule-suggestions`: the proposed rule text of a description
// (R2–R4) and `GET /api/category-rules/suggestions` (R1, R5–R9).
//
// 🔒 Everything here is synthetic: invented descriptions (the ones of
// `specs/61-rule-suggestions/design.md` §3, plus a random tag of letters so no
// two tests can share a text), invented amounts, `syntheticIban()` accounts and
// unique category names, in the throwaway test database.
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../app.js'
import { syntheticIban } from '../../lib/iban.fixture.js'
import { normalizeForMatch } from './category-rules.service.js'
import { proposedMatchText } from './category-rules.suggestions.js'
import type { RuleSuggestion } from './category-rules.types.js'

describe('proposedMatchText (R2–R4)', () => {
  it('derives the proposed rule text from bank descriptions', () => {
    const cases: Array<[string, string | null]> = [
      ['RECIBO /Academia Ficticia Norte', 'academia ficticia norte'],
      ['SUPERMERCADO INVENTADO 4521', 'supermercado inventado'],
      ['BIZUM DE PERSONA INVENTADA CONCEPTO cena', 'bizum de persona inventada'],
      ['TRANSF ENVIO, CONCEPTO alquiler ficticio', 'transf envio'],
      ['ANUL. /Tienda Sintetica', 'tienda sintetica'],
      ['8812 KIOSCO DE PRUEBA', 'kiosco de prueba'],
      ['REFERENCIA 00001234 CUOTA', 'referencia'],
      // The slash comes after digits: the bank word before it is not cut.
      ['PERIODO 01/01/2026 01/02/2026', 'periodo'],
      ['TALLER SINTETICO - -', 'taller sintetico'],
      // Three characters: below the minimum of 5.
      ['ABC 1234', null],
      // Nothing without a digit, or only the word "concepto" at the start.
      ['1234 5678', null],
      ['CONCEPTO libre', 'concepto libre'],
    ]

    for (const [description, expected] of cases) {
      expect(proposedMatchText(description), description).toBe(expected)
    }
  })

  it('always proposes a piece of the normalized description itself', () => {
    const descriptions = [
      'Compra  Tienda   Ficticia 0815',
      'RECIBO /  Óptica Ñandú Inventada',
      'ZQ * MERCERÍA – SINTÉTICA (barrio) 12',
      '  ,Floristería «Rosal Inventado»  ',
      'ENVIO FONTANERO FICTICIO, concepto factura 4',
      'Café  Señorial   Ficticio',
    ]

    for (const description of descriptions) {
      const text = proposedMatchText(description)
      expect(text, description).not.toBeNull()
      expect(normalizeForMatch(description).includes(text ?? '\u0000'), description).toBe(true)
      expect(normalizeForMatch(text ?? ''), description).toBe(text)
    }
  })
})

describe('GET /api/category-rules/suggestions (R1, R5–R9)', () => {
  let app: FastifyInstance
  const createdAccountIds: number[] = []
  const createdCategoryIds: number[] = []
  const createdRuleIds: number[] = []
  let uniqueCounter = 0

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  afterEach(async () => {
    await app.prisma.categoryRule.deleteMany({ where: { id: { in: createdRuleIds } } })
    await app.prisma.categoryRule.deleteMany({
      where: { categoryId: { in: createdCategoryIds } },
    })
    await app.prisma.movement.deleteMany({ where: { accountId: { in: createdAccountIds } } })
    await app.prisma.account.deleteMany({ where: { id: { in: createdAccountIds } } })
    await app.prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } })
    createdRuleIds.length = 0
    createdAccountIds.length = 0
    createdCategoryIds.length = 0
  })

  afterAll(async () => {
    await app.close()
  })

  /** Six random letters: no digit, so `proposedMatchText` keeps it. */
  function letterTag(): string {
    const letters = 'bcdfghjklmnpqrstvwxz'
    let tag = ''
    for (let i = 0; i < 6; i += 1) tag += letters[Math.floor(Math.random() * letters.length)]
    return tag
  }

  async function createAccount() {
    const account = await app.prisma.account.create({
      data: { iban: syntheticIban(), bank: 'bankinter', alias: 'Rule suggestions test account' },
    })
    createdAccountIds.push(account.id)
    return account
  }

  async function createCategory(kind: 'expense' | 'income') {
    uniqueCounter += 1
    const category = await app.prisma.category.create({
      data: { name: `Suggestions test ${Date.now()}-${uniqueCounter}`, kind },
    })
    createdCategoryIds.push(category.id)
    return category
  }

  async function createRule(categoryId: number, matchText: string) {
    const rule = await app.prisma.categoryRule.create({ data: { categoryId, matchText } })
    createdRuleIds.push(rule.id)
    return rule
  }

  interface Seed {
    accountId: number
    description: string
    amount: string
    type?: 'expense' | 'income'
    /** `null` = pending without category; otherwise confirmed with this category. */
    categoryId: number | null
    categorySource?: 'manual' | 'rule' | 'closing'
  }

  function seed(movement: Seed) {
    const bookingDate = new Date('2032-07-19T00:00:00.000Z')
    const pending = movement.categoryId === null
    return app.prisma.movement.create({
      data: {
        accountId: movement.accountId,
        type: movement.type ?? 'expense',
        amount: movement.amount,
        description: movement.description,
        bookingDate,
        valueDate: bookingDate,
        // Its own sequence: the same text and amount twice is two movements.
        daySequence: ++uniqueCounter,
        origin: 'imported',
        status: pending ? 'pending_review' : 'confirmed',
        categoryId: movement.categoryId,
        categorySource: pending ? null : (movement.categorySource ?? 'closing'),
      },
    })
  }

  async function suggestionsWith(tag: string): Promise<RuleSuggestion[]> {
    const response = await app.inject({ method: 'GET', url: '/api/category-rules/suggestions' })
    expect(response.statusCode).toBe(200)
    const body: RuleSuggestion[] = response.json()
    return body.filter((suggestion) => suggestion.matchText.includes(tag))
  }

  it('lists the concepts of the generic category ordered by how many movements their rule would take, each with its proposed text', async () => {
    const tag = letterTag()
    const account = await createAccount()
    const generic = await createCategory('expense')
    const genericIncome = await createCategory('income')
    const base = { accountId: account.id }

    const kiosk = [
      await seed({ ...base, description: `KIOSCO ${tag} 0815`, amount: '2.35', categoryId: null }),
      await seed({
        ...base,
        description: `Kiosco ${tag} 0816`,
        amount: '1.90',
        categoryId: generic.id,
      }),
      await seed({
        ...base,
        description: `KIOSCO ${tag} 0817`,
        amount: '3.15',
        categoryId: generic.id,
      }),
      await seed({ ...base, description: `KIOSCO ${tag}`, amount: '4.05', categoryId: generic.id }),
    ]
    const academy = [
      await seed({
        ...base,
        description: `RECIBO /Academia ${tag} Norte`,
        amount: '61.4',
        categoryId: generic.id,
      }),
      await seed({
        ...base,
        description: `RECIBO /Academia ${tag} Norte 2`,
        amount: '61.4',
        categoryId: generic.id,
      }),
      await seed({
        ...base,
        description: `ANUL. /Academia ${tag} Norte`,
        amount: '61.4',
        categoryId: generic.id,
      }),
    ]
    const pharmacy = [
      await seed({
        ...base,
        description: `FARMACIA ${tag} 0042`,
        amount: '8.73',
        categoryId: generic.id,
      }),
      await seed({
        ...base,
        description: `FARMACIA ${tag} 0042`,
        amount: '5.29',
        categoryId: generic.id,
      }),
      await seed({
        ...base,
        description: `FARMACIA ${tag} 0043`,
        amount: '12.6',
        categoryId: generic.id,
      }),
    ]
    // Two movements only: no proposal (R7).
    await seed({
      ...base,
      description: `PANADERIA ${tag} 7`,
      amount: '1.35',
      categoryId: generic.id,
    })
    await seed({
      ...base,
      description: `PANADERIA ${tag} 8`,
      amount: '2.15',
      categoryId: generic.id,
    })
    const interest = [
      await seed({
        ...base,
        type: 'income',
        description: `ABONO ${tag} INTERESES 3`,
        amount: '0.87',
        categoryId: genericIncome.id,
      }),
      await seed({
        ...base,
        type: 'income',
        description: `ABONO ${tag} INTERESES 4`,
        amount: '0.91',
        categoryId: genericIncome.id,
      }),
      await seed({
        ...base,
        type: 'income',
        description: `ABONO ${tag} INTERESES 5`,
        amount: '0.79',
        categoryId: null,
      }),
    ]
    // Same text, but an expense: it never counts for the income proposal.
    await seed({
      ...base,
      description: `ABONO ${tag} INTERESES 6`,
      amount: '0.83',
      categoryId: generic.id,
    })

    const suggestions = await suggestionsWith(tag)

    const listed = (rows: typeof kiosk) =>
      rows.map((row) => ({
        movementId: row.id,
        description: row.description,
        bookingDate: '2032-07-19',
        amount: row.amount.toFixed(2),
      }))
    expect(suggestions).toEqual([
      {
        matchText: `kiosco ${tag}`,
        kind: 'expense',
        movementCount: 4,
        movements: listed(kiosk),
        manualMatches: 0,
      },
      // Three each: by text.
      {
        matchText: `abono ${tag} intereses`,
        kind: 'income',
        movementCount: 3,
        movements: listed(interest),
        manualMatches: 0,
      },
      {
        matchText: `academia ${tag} norte`,
        kind: 'expense',
        movementCount: 3,
        movements: listed(academy),
        manualMatches: 0,
      },
      {
        matchText: `farmacia ${tag}`,
        kind: 'expense',
        movementCount: 3,
        movements: listed(pharmacy),
        manualMatches: 0,
      },
    ])
    for (const suggestion of suggestions) {
      expect(suggestion.movementCount).toBe(suggestion.movements.length)
    }
  })

  it('does not propose a concept an existing rule already takes', async () => {
    const tag = letterTag()
    const account = await createAccount()
    const generic = await createCategory('expense')
    const gym = await createCategory('expense')
    const salary = await createCategory('income')
    const base = { accountId: account.id, categoryId: generic.id }
    await createRule(gym.id, `gimnasio ${tag}`)
    // An income rule whose text these expenses contain never takes them, so
    // `libreria <tag>` is still proposed (its text is not the rule's).
    await createRule(salary.id, `${tag} 5`)
    for (const amount of ['29.9', '29.9', '31.5']) {
      await seed({ ...base, description: `GIMNASIO ${tag} CENTRO 12`, amount })
      await seed({ ...base, description: `LIBRERIA ${tag} 5`, amount })
    }
    // A rule whose text lies past the first digit: `tienda <tag>` would come
    // only from the movement it already takes, so it is not proposed, even if
    // it would take the three below; their own text is.
    await createRule(gym.id, `${tag} 12`)
    await seed({ ...base, description: `TIENDA ${tag} 12`, amount: '7.35' })
    for (const amount of ['6.8', '6.8', '7.15']) {
      await seed({ ...base, description: `SOCIO TIENDA ${tag} 9`, amount })
    }

    const suggestions = await suggestionsWith(tag)

    expect(suggestions.map((suggestion) => suggestion.matchText)).toEqual([
      `libreria ${tag}`,
      `socio tienda ${tag}`,
    ])
  })

  it('never proposes a text that is already the matchText of a rule of either kind', async () => {
    const tag = letterTag()
    const account = await createAccount()
    const generic = await createCategory('expense')
    const books = await createCategory('expense')
    const salary = await createCategory('income')
    const base = { accountId: account.id, categoryId: generic.id }
    // An income rule with exactly the text these expenses would propose: it
    // never takes them, but `matchText` is unique in the whole table, so a rule
    // with it could never be created.
    await createRule(salary.id, `libreria ${tag}`)
    for (const amount of ['29.9', '29.9', '31.5']) {
      await seed({ ...base, description: `LIBRERIA ${tag} 5`, amount })
      await seed({ ...base, description: `PAPELERIA ${tag} 8`, amount })
    }

    const suggestions = await suggestionsWith(tag)
    const preview = await app.inject({
      method: 'GET',
      url: `/api/category-rules/preview?${new URLSearchParams({
        matchText: `libreria ${tag}`,
        categoryId: String(books.id),
      }).toString()}`,
    })

    expect(suggestions.map((suggestion) => suggestion.matchText)).toEqual([`papeleria ${tag}`])
    // What the list leaves out is what the rule could not be created with.
    expect(preview.statusCode).toBe(409)
  })

  it('hides a suggestion whose movements another suggestion already takes', async () => {
    const tag = letterTag()
    const account = await createAccount()
    const generic = await createCategory('expense')
    const base = { accountId: account.id, categoryId: generic.id }
    // `academia <tag>` takes these six; `recibo academia <tag>` only three of them.
    for (const amount of ['45.5', '45.5', '47.25']) {
      await seed({ ...base, description: `ACADEMIA ${tag} 1`, amount })
      await seed({ ...base, description: `RECIBO ACADEMIA ${tag} 2`, amount })
    }
    // `piscina <tag>` and `piscina <tag> club` take the same three: the shorter stays.
    await seed({ ...base, description: `PISCINA ${tag} CLUB 7`, amount: '6.5' })
    await seed({ ...base, description: `PISCINA ${tag} CLUB 9`, amount: '6.5' })
    await seed({ ...base, description: `PISCINA ${tag} 8 PISCINA ${tag} CLUB`, amount: '7.5' })

    const suggestions = await suggestionsWith(tag)

    expect(
      suggestions.map((suggestion) => [suggestion.matchText, suggestion.movementCount]),
    ).toEqual([
      [`academia ${tag}`, 6],
      [`piscina ${tag}`, 3],
    ])
  })

  it('counts the movements set by hand that contain the text but never includes them', async () => {
    const tag = letterTag()
    const account = await createAccount()
    const generic = await createCategory('expense')
    const garden = await createCategory('expense')
    const refunds = await createCategory('income')
    const base = { accountId: account.id }
    const generics = [
      await seed({
        ...base,
        description: `VIVERO ${tag} 3`,
        amount: '14.8',
        categoryId: generic.id,
      }),
      await seed({
        ...base,
        description: `VIVERO ${tag} 4`,
        amount: '9.45',
        categoryId: generic.id,
      }),
      await seed({
        ...base,
        description: `VIVERO ${tag} 5`,
        amount: '22.1',
        categoryId: generic.id,
      }),
    ]
    await seed({
      ...base,
      description: `VIVERO ${tag} 6`,
      amount: '18.3',
      categoryId: garden.id,
      categorySource: 'manual',
    })
    // Set by a rule: neither taken nor counted as manual.
    await seed({
      ...base,
      description: `VIVERO ${tag} 7`,
      amount: '11.2',
      categoryId: garden.id,
      categorySource: 'rule',
    })
    // Set by hand, but an income: another kind.
    await seed({
      ...base,
      type: 'income',
      description: `VIVERO ${tag} 8`,
      amount: '5.6',
      categoryId: refunds.id,
      categorySource: 'manual',
    })

    const suggestions = await suggestionsWith(tag)

    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]).toMatchObject({
      matchText: `vivero ${tag}`,
      movementCount: 3,
      manualMatches: 1,
    })
    expect(suggestions[0]?.movements.map((movement) => movement.movementId)).toEqual(
      generics.map((row) => row.id),
    )
  })

  it('the count of a suggestion is what creating its rule moves by that rule', async () => {
    const tag = letterTag()
    const account = await createAccount()
    const generic = await createCategory('expense')
    const genericIncome = await createCategory('income')
    const expenseTarget = await createCategory('expense')
    const incomeTarget = await createCategory('income')
    const cafe = await createCategory('expense')
    const base = { accountId: account.id }
    await createRule(cafe.id, `cafeteria ${tag} terraza`)
    // Matches the text of `cafeteria <tag>` AND the existing rule: never counted.
    await seed({
      ...base,
      description: `CAFETERIA ${tag} TERRAZA 1`,
      amount: '3.4',
      categoryId: generic.id,
    })
    for (const amount of ['2.6', '2.85', '3.1']) {
      await seed({ ...base, description: `CAFETERIA ${tag} 2`, amount, categoryId: generic.id })
      await seed({
        ...base,
        description: `RECIBO /Lavanderia ${tag} Sur`,
        amount,
        categoryId: generic.id,
      })
      await seed({
        ...base,
        type: 'income',
        description: `DEVOLUCION ${tag} SEGURO 9`,
        amount,
        categoryId: genericIncome.id,
      })
    }
    await seed({ ...base, description: `LAVANDERIA ${tag} SUR`, amount: '4.2', categoryId: null })

    const suggestions = await suggestionsWith(tag)
    expect(
      suggestions.map((suggestion) => [suggestion.matchText, suggestion.movementCount]),
    ).toEqual([
      [`lavanderia ${tag} sur`, 4],
      [`cafeteria ${tag}`, 3],
      [`devolucion ${tag} seguro`, 3],
    ])

    const snapshot = await app.prisma.movement.findMany({
      where: { accountId: account.id },
      select: { id: true, categoryId: true, categorySource: true, status: true },
    })
    for (const suggestion of suggestions) {
      const target = suggestion.kind === 'expense' ? expenseTarget : incomeTarget
      const response = await app.inject({
        method: 'POST',
        url: '/api/category-rules',
        payload: { matchText: suggestion.matchText, categoryId: target.id },
      })
      expect(response.statusCode).toBe(201)
      const created = response.json()
      createdRuleIds.push(created.id)

      const movedByIt = created.categorization.categorizedMovements
        .filter((movement: { rules: Array<{ ruleId: number }> }) =>
          movement.rules.some((rule) => rule.ruleId === created.id),
        )
        .map((movement: { movementId: number }) => movement.movementId)
      expect(movedByIt, suggestion.matchText).toEqual(
        suggestion.movements.map((movement) => movement.movementId),
      )

      // Back to where it was before the next suggestion.
      await app.prisma.categoryRule.delete({ where: { id: created.id } })
      for (const row of snapshot) {
        await app.prisma.movement.update({
          where: { id: row.id },
          data: {
            categoryId: row.categoryId,
            categorySource: row.categorySource,
            status: row.status,
          },
        })
      }
    }
  })
})
