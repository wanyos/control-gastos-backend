// What each investment gained or lost since it was opened (feature 67). Every
// figure, name and concept in this file is invented (see docs/conventions.md
// §Tests): fixtures only need to be well formed, never true.
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../app.js'
import { syntheticIban } from '../../lib/iban.fixture.js'
import { todayInMadridAsDate } from '../../lib/local-date.js'
import { getInvestmentGains } from './investments.service.js'
import type {
  ClosedGainsProduct,
  DepositMaturityMatcherRegistry,
  GainsProduct,
  InvestmentGainsResponse,
} from './investments.types.js'

const TODAY = '2026-06-15'

// A fake bank with a fake maturity matcher: the rule of feature 50 is reused,
// not re-tested, so one bank is enough.
const matchers: DepositMaturityMatcherRegistry = [
  {
    bank: 'synthbank',
    isDepositMaturity: (text) => text.startsWith('SYNTH MATURITY'),
    classifyDepositMovement: () => null,
  },
]

describe('investment gains since opening (feature 67)', () => {
  let app: FastifyInstance
  const createdProductIds: number[] = []
  const createdAccountIds: number[] = []

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  afterEach(async () => {
    if (createdAccountIds.length > 0) {
      await app.prisma.movement.deleteMany({ where: { accountId: { in: createdAccountIds } } })
      await app.prisma.account.deleteMany({ where: { id: { in: createdAccountIds } } })
      createdAccountIds.length = 0
    }
    if (createdProductIds.length > 0) {
      await app.prisma.valuation.deleteMany({ where: { productId: { in: createdProductIds } } })
      await app.prisma.savingsSnapshot.deleteMany({
        where: { productId: { in: createdProductIds } },
      })
      await app.prisma.investmentProduct.deleteMany({ where: { id: { in: createdProductIds } } })
      createdProductIds.length = 0
    }
  })

  afterAll(async () => {
    await app.close()
  })

  function toDate(isoDate: string): Date {
    return new Date(`${isoDate}T00:00:00.000Z`)
  }

  function uniqueName(label: string): string {
    return `${label} ${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
  }

  interface SeedFund {
    type?: 'fund' | 'etf' | 'managed_portfolio'
    openedAt?: string | null
    closedAt?: string | null
  }

  async function createFund(overrides: SeedFund = {}) {
    const openedAt = overrides.openedAt === undefined ? '2025-10-06' : overrides.openedAt
    const product = await app.prisma.investmentProduct.create({
      data: {
        bank: 'synthbank',
        name: uniqueName('Synthetic fund'),
        type: overrides.type ?? 'fund',
        openedAt: openedAt === null ? null : toDate(openedAt),
        closedAt: overrides.closedAt == null ? null : toDate(overrides.closedAt),
      },
    })
    createdProductIds.push(product.id)
    return product
  }

  interface SeedPhoto {
    date: string
    invested: string
    marketValue: string
    gain: string | null
    gainPercent: string | null
    uninvestedCash?: string | null
  }

  function createPhoto(productId: number, photo: SeedPhoto) {
    return app.prisma.valuation.create({
      data: {
        productId,
        date: toDate(photo.date),
        invested: photo.invested,
        marketValue: photo.marketValue,
        gain: photo.gain,
        gainPercent: photo.gainPercent,
        uninvestedCash: photo.uninvestedCash ?? null,
      },
    })
  }

  interface SeedDeposit {
    openedAt?: string | null
    closedAt?: string | null
    principal?: string | null
    expectedGain?: string | null
    maturityDate?: string | null
  }

  async function createDeposit(overrides: SeedDeposit = {}) {
    const openedAt = overrides.openedAt === undefined ? '2026-03-02' : overrides.openedAt
    const maturityDate =
      overrides.maturityDate === undefined ? '2026-09-02' : overrides.maturityDate
    const product = await app.prisma.investmentProduct.create({
      data: {
        bank: 'synthbank',
        name: uniqueName('Synthetic deposit'),
        type: 'deposit',
        openedAt: openedAt === null ? null : toDate(openedAt),
        closedAt: overrides.closedAt == null ? null : toDate(overrides.closedAt),
        principal: overrides.principal === undefined ? '3815.40' : overrides.principal,
        interestRate: '2.4300',
        expectedGain: overrides.expectedGain === undefined ? '46.37' : overrides.expectedGain,
        maturityDate: maturityDate === null ? null : toDate(maturityDate),
      },
    })
    createdProductIds.push(product.id)
    return product
  }

  async function createMaturityMovement(bookingDate: string, amount: string) {
    const account = await app.prisma.account.create({
      data: { iban: syntheticIban(), bank: 'synthbank', alias: 'Gains test account' },
    })
    createdAccountIds.push(account.id)
    return app.prisma.movement.create({
      data: {
        accountId: account.id,
        type: 'income',
        amount,
        description: 'SYNTH MATURITY 480213',
        bookingDate: toDate(bookingDate),
        valueDate: toDate(bookingDate),
        daySequence: 1,
      },
    })
  }

  function read(today = TODAY): Promise<InvestmentGainsResponse> {
    return getInvestmentGains(app.prisma, matchers, toDate(today))
  }

  function liveOf(response: InvestmentGainsResponse, id: number): GainsProduct {
    const entry = response.live.find((product) => product.id === id)
    expect(entry).toBeDefined()
    return entry as GainsProduct
  }

  function closedOf(response: InvestmentGainsResponse, id: number): ClosedGainsProduct {
    const entry = response.closed.find((product) => product.id === id)
    expect(entry).toBeDefined()
    return entry as ClosedGainsProduct
  }

  it('answers asOf, total, live and closed for today', async () => {
    // R1: an empty base answers 200 with empty lists and a zero total.
    expect(await read()).toEqual({
      asOf: TODAY,
      total: { gain: '0.00', invested: '0.00', gainPercent: null, excluded: [] },
      live: [],
      closed: [],
    })

    // Through the route, for today in Madrid, with an unknown parameter ignored.
    const live = await createFund({ openedAt: '2019-02-11' })
    await createPhoto(live.id, {
      date: '2020-01-31',
      invested: '1873.42',
      marketValue: '1951.06',
      gain: '77.64',
      gainPercent: '4.1443',
    })
    const closed = await createFund({ openedAt: '2018-05-14', closedAt: '2019-12-20' })

    const response = await app.inject({
      method: 'GET',
      url: '/api/investments/gains?month=2026-05',
    })

    expect(response.statusCode).toBe(200)
    const body = response.json<InvestmentGainsResponse>()
    expect(Object.keys(body)).toEqual(['asOf', 'total', 'live', 'closed'])
    expect(body.asOf).toBe(todayInMadridAsDate().toISOString().slice(0, 10))
    expect(body.live.map((product) => product.id)).toEqual([live.id])
    expect(body.closed.map((product) => product.id)).toEqual([closed.id])
    expect(body.total).toEqual({
      gain: '77.64',
      invested: '1873.42',
      gainPercent: '4.14',
      excluded: [],
    })
  })

  it('a live fund whose last photo is from an earlier month comes with that photo and its date', async () => {
    const fund = await createFund({ openedAt: '2025-10-06' })
    await createPhoto(fund.id, {
      date: '2026-03-31',
      invested: '5106.30',
      marketValue: '5208.77',
      gain: '102.47',
      gainPercent: '2.0067',
      uninvestedCash: '8.13',
    })
    // Two months before today: the most recent photo with date <= today.
    await createPhoto(fund.id, {
      date: '2026-04-30',
      invested: '5306.30',
      marketValue: '5481.92',
      gain: '175.62',
      gainPercent: '3.3096',
      uninvestedCash: '12.37',
    })
    // Dated after today: never used.
    await createPhoto(fund.id, {
      date: '2026-07-31',
      invested: '5506.30',
      marketValue: '5390.18',
      gain: '-116.12',
      gainPercent: '-2.1089',
      uninvestedCash: '0.54',
    })

    const response = await read()

    expect(liveOf(response, fund.id)).toEqual({
      id: fund.id,
      bank: 'synthbank',
      name: fund.name,
      type: 'fund',
      openedAt: '2025-10-06',
      closedAt: null,
      invested: '5306.30',
      // marketValue as stored, the cash apart (never added into it).
      currentValue: '5481.92',
      gain: '175.62',
      gainPercent: '3.3096',
      uninvestedCash: '12.37',
      valuedAt: '2026-04-30',
      reason: null,
    })
    expect(response.total).toEqual({
      gain: '175.62',
      invested: '5306.30',
      gainPercent: '3.31',
      excluded: [],
    })
  })

  it('leaves savings accounts out of the lists and the total', async () => {
    const account = await app.prisma.investmentProduct.create({
      data: {
        bank: 'synthbank',
        name: uniqueName('Synthetic savings'),
        type: 'savings_account',
        openedAt: toDate('2025-07-01'),
      },
    })
    createdProductIds.push(account.id)
    await app.prisma.savingsSnapshot.create({
      data: {
        productId: account.id,
        date: toDate('2026-05-31'),
        openingBalance: '2310.48',
        moneyIn: '150.00',
        moneyOut: '47.36',
        interest: '4.83',
        balance: '2417.95',
      },
    })

    const response = await read()

    expect(response.live).toEqual([])
    expect(response.closed).toEqual([])
    expect(response.total).toEqual({
      gain: '0.00',
      invested: '0.00',
      gainPercent: null,
      excluded: [],
    })
  })

  it('a live deposit earns its expected gain spread over the days since it opened', async () => {
    // Half of its 200 days lived: 61.37 × 100 / 200 = 30.685 → 30.69 (half up).
    const halfway = await createDeposit({
      openedAt: '2026-03-07',
      maturityDate: '2026-09-23',
      principal: '4826.15',
      expectedGain: '61.37',
    })
    // The day it opens it has earned nothing yet.
    const firstDay = await createDeposit({
      openedAt: TODAY,
      maturityDate: '2026-12-15',
      principal: '3172.45',
      expectedGain: '39.71',
    })
    // Without the day it opened there is no spread: no figure, and the reason.
    const noOpening = await createDeposit({
      openedAt: null,
      maturityDate: '2026-12-01',
      principal: '2654.80',
      expectedGain: '28.16',
    })

    const response = await read()

    expect(liveOf(response, halfway.id)).toEqual({
      id: halfway.id,
      bank: 'synthbank',
      name: halfway.name,
      type: 'deposit',
      openedAt: '2026-03-07',
      closedAt: null,
      conditions: {
        principal: '4826.15',
        interestRate: '2.43',
        expectedGain: '61.37',
        maturityDate: '2026-09-23',
      },
      invested: '4826.15',
      currentValue: '4856.84',
      gain: '30.69',
      // 30.69 / 4826.15 × 100 = 0.6359…
      gainPercent: '0.64',
      valuedAt: TODAY,
      reason: null,
    })
    expect(liveOf(response, firstDay.id)).toMatchObject({
      invested: '3172.45',
      currentValue: '3172.45',
      gain: '0.00',
      gainPercent: '0.00',
      valuedAt: TODAY,
      reason: null,
    })
    expect(liveOf(response, noOpening.id)).toMatchObject({
      invested: '2654.80',
      currentValue: null,
      gain: null,
      gainPercent: null,
      valuedAt: null,
      reason: 'missing_conditions',
    })
    // Its capital is invested and its spread gain adds to the total.
    expect(response.total).toEqual({
      gain: '30.69',
      invested: '7998.60',
      gainPercent: '0.38',
      excluded: [{ productId: noOpening.id, name: noOpening.name, reason: 'missing_conditions' }],
    })
  })

  it('a deposit cancelled before maturity comes in closed with no gain', async () => {
    const cancelled = await createDeposit({
      openedAt: '2026-01-12',
      closedAt: '2026-04-20',
      maturityDate: '2026-10-12',
      principal: '2961.75',
      expectedGain: '35.48',
    })

    const response = await read()

    expect(response.live).toEqual([])
    expect(closedOf(response, cancelled.id)).toEqual({
      id: cancelled.id,
      bank: 'synthbank',
      name: cancelled.name,
      type: 'deposit',
      openedAt: '2026-01-12',
      closedAt: '2026-04-20',
      closedOn: '2026-04-20',
      conditions: {
        principal: '2961.75',
        interestRate: '2.43',
        expectedGain: '35.48',
        maturityDate: '2026-10-12',
      },
      invested: '2961.75',
      currentValue: '2961.75',
      gain: '0.00',
      gainPercent: '0.00',
      valuedAt: '2026-04-20',
      reason: null,
    })
    expect(response.total).toEqual({
      gain: '0.00',
      invested: '0.00',
      gainPercent: null,
      excluded: [],
    })
  })

  it('a matured deposit with its payment found comes with what it earned', async () => {
    const closedOnMaturity = await createDeposit({
      openedAt: '2026-03-02',
      closedAt: '2026-06-02',
      maturityDate: '2026-06-02',
      principal: '3815.40',
    })
    await createMaturityMovement('2026-06-02', '3838.27')
    // Matured with no closing written: closed all the same, on its maturity.
    const notClosed = await createDeposit({
      openedAt: '2026-02-18',
      closedAt: null,
      maturityDate: '2026-05-18',
      principal: '1924.60',
    })
    await createMaturityMovement('2026-05-18', '1935.91')

    const response = await read()

    expect(response.live).toEqual([])
    expect(response.closed.map((product) => product.id)).toEqual([
      closedOnMaturity.id,
      notClosed.id,
    ])
    expect(closedOf(response, closedOnMaturity.id)).toMatchObject({
      type: 'deposit',
      closedAt: '2026-06-02',
      closedOn: '2026-06-02',
      invested: '3815.40',
      currentValue: '3838.27',
      gain: '22.87',
      // 22.87 / 3815.40 × 100 = 0.5994… (what it earned, not the APR).
      gainPercent: '0.60',
      valuedAt: '2026-06-02',
      reason: null,
    })
    expect(closedOf(response, notClosed.id)).toMatchObject({
      closedAt: null,
      closedOn: '2026-05-18',
      invested: '1924.60',
      currentValue: '1935.91',
      gain: '11.31',
      gainPercent: '0.59',
      valuedAt: '2026-05-18',
      reason: null,
    })
    expect(response.total.gain).toBe('0.00')
    expect(response.total.invested).toBe('0.00')
  })

  it('a matured deposit without its payment comes with no figure and the reason', async () => {
    const deposit = await createDeposit({
      openedAt: '2026-02-27',
      closedAt: '2026-05-29',
      maturityDate: '2026-05-29',
      principal: '2487.35',
    })

    const response = await read()

    expect(closedOf(response, deposit.id)).toMatchObject({
      closedOn: '2026-05-29',
      invested: '2487.35',
      currentValue: null,
      gain: null,
      gainPercent: null,
      valuedAt: null,
      reason: 'maturity_not_found',
    })
    // A closed product is never listed in the total, not even as excluded.
    expect(response.total.excluded).toEqual([])
  })

  it('a sold fund comes in closed with its last photo before closing and does not add to the total', async () => {
    const fund = await createFund({ type: 'etf', openedAt: '2024-11-04', closedAt: '2026-05-20' })
    await createPhoto(fund.id, {
      date: '2026-03-31',
      invested: '3402.66',
      marketValue: '3571.09',
      gain: '168.43',
      gainPercent: '4.9500',
    })
    await createPhoto(fund.id, {
      date: '2026-04-30',
      invested: '3402.66',
      marketValue: '3346.21',
      gain: '-56.45',
      gainPercent: '-1.6590',
      uninvestedCash: '2.18',
    })
    // After the closing: never used.
    await createPhoto(fund.id, {
      date: '2026-05-31',
      invested: '0.00',
      marketValue: '0.00',
      gain: '-61.02',
      gainPercent: '-1.7933',
    })

    const response = await read()

    expect(response.live).toEqual([])
    expect(closedOf(response, fund.id)).toEqual({
      id: fund.id,
      bank: 'synthbank',
      name: fund.name,
      type: 'etf',
      openedAt: '2024-11-04',
      closedAt: '2026-05-20',
      closedOn: '2026-05-20',
      invested: '3402.66',
      currentValue: '3346.21',
      gain: '-56.45',
      gainPercent: '-1.659',
      uninvestedCash: '2.18',
      valuedAt: '2026-04-30',
      reason: null,
    })
    expect(response.total).toEqual({
      gain: '0.00',
      invested: '0.00',
      gainPercent: null,
      excluded: [],
    })
  })

  it('a figure that cannot be obtained is null with its reason and the total lists the product', async () => {
    const noPhoto = await createFund({ openedAt: '2025-08-11' })
    // Its only photo is dated after today.
    await createPhoto(noPhoto.id, {
      date: '2026-06-30',
      invested: '1206.84',
      marketValue: '1219.30',
      gain: '12.46',
      gainPercent: '1.0324',
    })
    const noGain = await createFund({ type: 'managed_portfolio', openedAt: '2025-09-15' })
    await createPhoto(noGain.id, {
      date: '2026-05-31',
      invested: '8214.07',
      marketValue: '8390.55',
      gain: null,
      gainPercent: '2.1485',
    })
    const noPercent = await createFund({ type: 'etf', openedAt: '2025-10-20' })
    await createPhoto(noPercent.id, {
      date: '2026-05-31',
      invested: '2731.48',
      marketValue: '2815.06',
      gain: '83.58',
      gainPercent: null,
    })

    const response = await read()

    expect(liveOf(response, noPhoto.id)).toMatchObject({
      invested: null,
      currentValue: null,
      gain: null,
      gainPercent: null,
      uninvestedCash: null,
      valuedAt: null,
      reason: 'no_photo',
    })
    expect(liveOf(response, noGain.id)).toMatchObject({
      invested: '8214.07',
      currentValue: '8390.55',
      gain: null,
      gainPercent: '2.1485',
      valuedAt: '2026-05-31',
      reason: 'gain_not_reported',
    })
    expect(liveOf(response, noPercent.id)).toMatchObject({
      invested: '2731.48',
      currentValue: '2815.06',
      gain: '83.58',
      gainPercent: null,
      valuedAt: '2026-05-31',
      reason: 'gain_percent_not_reported',
    })
    // A gap is never a zero.
    for (const product of response.live) {
      for (const figure of [product.invested, product.currentValue, product.gain]) {
        expect(figure === null || Number(figure) !== 0).toBe(true)
      }
    }
    // Only the one with `gain` adds; the other two are listed, in the order of `live`.
    expect(response.total).toEqual({
      gain: '83.58',
      invested: '2731.48',
      gainPercent: '3.06',
      excluded: [
        { productId: noPhoto.id, name: noPhoto.name, reason: 'no_photo' },
        { productId: noGain.id, name: noGain.name, reason: 'gain_not_reported' },
      ],
    })
  })

  it('a closed deposit whose maturity is ambiguous or below its principal has no figure and says why', async () => {
    // Two maturity movements on its maturity day: never one picked.
    const ambiguous = await createDeposit({
      openedAt: '2026-02-20',
      closedAt: '2026-05-22',
      maturityDate: '2026-05-22',
      principal: '2738.65',
    })
    await createMaturityMovement('2026-05-22', '2751.04')
    await createMaturityMovement('2026-05-22', '2752.93')
    // Its only candidate pays back less than the principal: a wrong link, and the
    // amount of that movement must not slip in as `currentValue`.
    const below = await createDeposit({
      openedAt: '2026-02-26',
      closedAt: '2026-05-26',
      maturityDate: '2026-05-26',
      principal: '3164.20',
    })
    await createMaturityMovement('2026-05-26', '3109.48')

    const response = await read()

    expect(response.live).toEqual([])
    expect(closedOf(response, ambiguous.id)).toEqual({
      id: ambiguous.id,
      bank: 'synthbank',
      name: ambiguous.name,
      type: 'deposit',
      openedAt: '2026-02-20',
      closedAt: '2026-05-22',
      closedOn: '2026-05-22',
      conditions: {
        principal: '2738.65',
        interestRate: '2.43',
        expectedGain: '46.37',
        maturityDate: '2026-05-22',
      },
      invested: '2738.65',
      currentValue: null,
      gain: null,
      gainPercent: null,
      valuedAt: null,
      reason: 'ambiguous',
    })
    expect(closedOf(response, below.id)).toMatchObject({
      closedOn: '2026-05-26',
      invested: '3164.20',
      currentValue: null,
      gain: null,
      gainPercent: null,
      valuedAt: null,
      reason: 'below_principal',
    })
    expect(response.total).toEqual({
      gain: '0.00',
      invested: '0.00',
      gainPercent: null,
      excluded: [],
    })
  })

  it('a deposit with missing conditions has no figure and, while live, is listed in the total', async () => {
    // Live, without its expected gain.
    const noExpectedGain = await createDeposit({
      openedAt: '2026-03-02',
      maturityDate: '2026-09-02',
      principal: '4391.72',
      expectedGain: null,
    })
    // Live, without maturity date (and no closing): nothing to spread over.
    const noMaturity = await createDeposit({
      openedAt: '2026-03-02',
      maturityDate: null,
      principal: '1857.36',
    })
    // Live, opened the same day it matures: a term of 0 days, never divided by.
    const sameDay = await createDeposit({
      openedAt: '2026-10-05',
      maturityDate: '2026-10-05',
      principal: '2216.09',
    })
    // Live, opened after its maturity date: a negative term.
    const reversed = await createDeposit({
      openedAt: '2026-12-01',
      maturityDate: '2026-11-20',
      principal: '3049.83',
    })
    // Closed, without principal.
    const closedNoPrincipal = await createDeposit({
      openedAt: '2026-02-10',
      closedAt: '2026-05-10',
      maturityDate: '2026-05-10',
      principal: null,
    })
    // Closed by its `closedAt`, without maturity date.
    const closedNoMaturity = await createDeposit({
      openedAt: '2026-01-05',
      closedAt: '2026-04-03',
      maturityDate: null,
      principal: '1693.47',
    })

    const response = await read()

    const noFigures = {
      currentValue: null,
      gain: null,
      gainPercent: null,
      valuedAt: null,
      reason: 'missing_conditions',
    }
    expect(response.live.map((product) => product.id)).toEqual([
      noExpectedGain.id,
      noMaturity.id,
      sameDay.id,
      reversed.id,
    ])
    expect(liveOf(response, noExpectedGain.id)).toMatchObject({
      ...noFigures,
      invested: '4391.72',
    })
    expect(liveOf(response, noMaturity.id)).toMatchObject({ ...noFigures, invested: '1857.36' })
    expect(liveOf(response, sameDay.id)).toMatchObject({ ...noFigures, invested: '2216.09' })
    expect(liveOf(response, reversed.id)).toMatchObject({ ...noFigures, invested: '3049.83' })

    expect(response.closed.map((product) => product.id)).toEqual([
      closedNoPrincipal.id,
      closedNoMaturity.id,
    ])
    expect(closedOf(response, closedNoPrincipal.id)).toMatchObject({
      ...noFigures,
      closedOn: '2026-05-10',
      invested: null,
    })
    expect(closedOf(response, closedNoMaturity.id)).toMatchObject({
      ...noFigures,
      closedOn: '2026-04-03',
      invested: '1693.47',
    })

    // The four live ones are listed, in the order of `live`; the closed ones are not.
    expect(response.total).toEqual({
      gain: '0.00',
      invested: '0.00',
      gainPercent: null,
      excluded: [noExpectedGain, noMaturity, sameDay, reversed].map((product) => ({
        productId: product.id,
        name: product.name,
        reason: 'missing_conditions',
      })),
    })
  })

  it('the total adds only live products and its percent is gain over invested', async () => {
    // Nothing live that can enter: the percent is null, never a division by zero.
    const lonely = await createFund({ openedAt: '2026-02-02' })
    const empty = await read()
    expect(empty.total).toEqual({
      gain: '0.00',
      invested: '0.00',
      gainPercent: null,
      excluded: [{ productId: lonely.id, name: lonely.name, reason: 'no_photo' }],
    })

    const fund = await createFund({ openedAt: '2025-09-08' })
    await createPhoto(fund.id, {
      date: '2026-05-31',
      invested: '6243.18',
      marketValue: '6611.92',
      gain: '368.74',
      gainPercent: '5.9062',
      uninvestedCash: '3.41',
    })
    const etf = await createFund({ type: 'etf', openedAt: '2026-01-19' })
    await createPhoto(etf.id, {
      date: '2026-05-31',
      invested: '2917.55',
      marketValue: '2846.03',
      gain: '-71.52',
      gainPercent: '-2.4514',
    })
    // A quarter of its 200 days: 18.58 × 50 / 200 = 4.645 → 4.65 (half up).
    const deposit = await createDeposit({
      openedAt: '2026-04-26',
      maturityDate: '2026-11-12',
      principal: '7354.60',
      expectedGain: '18.58',
    })
    // Closed: neither adds.
    const sold = await createFund({ openedAt: '2024-06-03', closedAt: '2026-03-31' })
    await createPhoto(sold.id, {
      date: '2026-03-31',
      invested: '1508.27',
      marketValue: '1592.46',
      gain: '84.19',
      gainPercent: '5.5819',
    })
    const matured = await createDeposit({
      openedAt: '2026-03-02',
      closedAt: '2026-06-02',
      maturityDate: '2026-06-02',
      principal: '3815.40',
    })
    await createMaturityMovement('2026-06-02', '3838.27')

    const response = await read()

    expect(response.live.map((product) => product.id)).toEqual([
      fund.id,
      etf.id,
      lonely.id,
      deposit.id,
    ])
    expect(liveOf(response, deposit.id)).toMatchObject({ gain: '4.65', invested: '7354.60' })
    expect(response.closed.map((product) => product.id)).toEqual([matured.id, sold.id])
    // 368.74 − 71.52 + 4.65 = 301.87 over 6243.18 + 2917.55 + 7354.60 = 16515.33
    // → 1.8278… %; the closed ones (84.19 and 22.87) are not in it.
    expect(response.total).toEqual({
      gain: '301.87',
      invested: '16515.33',
      gainPercent: '1.83',
      excluded: [{ productId: lonely.id, name: lonely.name, reason: 'no_photo' }],
    })
  })

  it('writes nothing in the database', async () => {
    const fund = await createFund()
    await createPhoto(fund.id, {
      date: '2026-05-31',
      invested: '4127.93',
      marketValue: '4260.48',
      gain: '132.55',
      gainPercent: '3.2110',
    })
    await createDeposit({
      openedAt: '2026-03-02',
      closedAt: '2026-06-02',
      maturityDate: '2026-06-02',
    })
    await createMaturityMovement('2026-06-02', '3838.27')
    await createDeposit({ openedAt: '2026-01-12', closedAt: '2026-04-20' })
    await createDeposit({ openedAt: '2026-04-26', maturityDate: '2026-11-12' })

    async function photo() {
      const [products, valuations, movements] = await Promise.all([
        app.prisma.investmentProduct.aggregate({ _count: true, _max: { updatedAt: true } }),
        app.prisma.valuation.aggregate({ _count: true, _max: { updatedAt: true } }),
        app.prisma.movement.aggregate({ _count: true, _max: { updatedAt: true } }),
      ])
      return { products, valuations, movements }
    }

    const before = await photo()
    await read()
    const response = await app.inject({ method: 'GET', url: '/api/investments/gains' })
    const after = await photo()

    expect(response.statusCode).toBe(200)
    expect(after).toEqual(before)
    expect(before.products._count).toBe(4)
  })
})
