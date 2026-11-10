// Feature 71: which MyInvestor statement description is an investment purchase.
//
// 🔒 Every concept of a purchase here is invented (`ETC INVENTADO METAL`,
// `FONDO INVENTADO GLOBAL INDX`…). The six fixed concepts are the bank's own
// labels, not data of anybody (design.md §8).
import { describe, expect, it } from 'vitest'

import { classifyMyinvestorInvestmentPurchase } from './myinvestor.investment-purchase.js'

describe('classifyMyinvestorInvestmentPurchase (F71)', () => {
  it('classifies every known non-purchase concept as no purchase, ignoring case, accents and leading spaces', () => {
    const known = [
      'SUSCRIPCION PREMIUM',
      'IVA SUSCRIPCION PREMIUM',
      'RET. REMUNERACION PREMIUM',
      'APERTURA DEP.: 774102',
      'APORTACION AUTOMATICA CARTERA',
      'APORTACION A MI CARTERA',
      // Accents, lower case, leading spaces and repeated spaces.
      'Suscripción Premium Mensual',
      '  iva suscripción premium',
      'Ret. Remuneración  Premium',
      '   apertura dep.: 774103',
      'Aportación automática cartera',
      'aportacion a mi cartera indexada',
    ]

    for (const description of known) {
      expect(classifyMyinvestorInvestmentPurchase(description), description).toBeNull()
    }

    // Anything else is a purchase, a product never seen included.
    expect(classifyMyinvestorInvestmentPurchase('FONDO INVENTADO GLOBAL INDX')).toEqual({
      certain: false,
    })
    expect(classifyMyinvestorInvestmentPurchase('ETC INVENTADO METAL @ 3')).toEqual({
      certain: true,
    })
    // A fixed concept that does not START the description is not one.
    expect(
      classifyMyinvestorInvestmentPurchase('FONDO INVENTADO SUSCRIPCION PREMIUM'),
    ).not.toBeNull()
  })

  it('marks as certain only a concept ending in @ and a number of shares', () => {
    const certain = [
      'ETC INVENTADO METAL @ 3',
      'ETC INVENTADO METAL @3',
      'ETC INVENTADO METAL @  17  ',
      'ACCION INVENTADA SA @ 2.5',
      'ACCION INVENTADA SA @ 0,75',
    ]
    for (const description of certain) {
      expect(classifyMyinvestorInvestmentPurchase(description), description).toEqual({
        certain: true,
      })
    }

    const notCertain = [
      'FONDO INVENTADO GLOBAL INDX',
      // `@` with no number after it, or a number not at the end.
      'ETC INVENTADO METAL @',
      'ETC INVENTADO METAL @ 3 PARTICIPACIONES',
      'ETC INVENTADO @ 3 METAL',
      // A number at the end without `@`.
      'FONDO INVENTADO CLASE 3',
    ]
    for (const description of notCertain) {
      expect(classifyMyinvestorInvestmentPurchase(description), description).toEqual({
        certain: false,
      })
    }
  })
})
